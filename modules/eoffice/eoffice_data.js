// ==========================================
// FILE: eoffice_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer Modul E-Office (KGB & Paket Rapat)
// ARSITEKTUR: Firestore-First (0ms), Realtime, Retensi Siklus 2 Tahunan & GAS Document Worker
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

const EofficeDataService = {
  CACHE_KEY: 'transkep_eoffice_cache',
  MIGRATION_FLAG_KEY: 'transkep_eoffice_migrated_v1',

  /**
   * Mengambil cache lokal E-Office untuk rendering 0ms saat menu dibuka
   */
  getLocalCache() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("⚠️ [E-Office] Gagal membaca local cache:", e);
      return null;
    }
  },

  /**
   * Menyimpan cache lokal E-Office
   */
  setLocalCache(data) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        kgb: Array.isArray(data.kgb) ? data.kgb : [],
        rapat: Array.isArray(data.rapat) ? data.rapat : [],
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn("⚠️ [E-Office] Gagal menyimpan local cache:", e);
    }
  },

  /**
   * Membuat ID Permanen Unik Per Periode Siklus KGB (mencegah overwrite siklus 2 tahun mendatang)
   * Contoh: KGB-198607092020121004-202501
   */
  buildPermanentKgbId(nip, tmtRefStr) {
    const cleanNip = String(nip || '').trim() || String(Date.now());
    const ref = String(tmtRefStr || '').trim();
    let periodTag = '';

    if (/^\d{4}-\d{2}/.test(ref)) {
      periodTag = ref.slice(0, 7).replace('-', '');
    } else {
      const yMatch = ref.match(/\b(20\d{2})\b/);
      if (yMatch) {
        const months = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
        const lower = ref.toLowerCase();
        let mNum = '01';
        for (let i = 0; i < months.length; i++) {
          if (lower.includes(months[i])) {
            mNum = String(i + 1).padStart(2, '0');
            break;
          }
        }
        periodTag = yMatch[1] + mNum;
      }
    }

    if (!periodTag) {
      const now = new Date();
      periodTag = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0');
    }

    return `KGB-${cleanNip}-${periodTag}`;
  },

  /**
   * Mencari riwayat KGB 'Selesai' terakhir milik pegawai (untuk Auto-Prefill Data Lama pada KGB 2 tahun berikutnya)
   */
  findLastCompletedKgb(nip, excludeIdKgb) {
    const targetNip = String(nip || '').trim();
    if (!targetNip) return null;

    let pool = [];
    if (typeof window !== 'undefined' && window.vmEoffice && Array.isArray(window.vmEoffice.rawKgbList)) {
      pool = window.vmEoffice.rawKgbList;
    } else {
      const cached = this.getLocalCache();
      if (cached && Array.isArray(cached.kgb)) pool = cached.kgb;
    }

    const completed = pool.filter(k => {
      if (!k || String(k.nip || '').trim() !== targetNip) return false;
      if (excludeIdKgb && String(k.id_kgb || '') === String(excludeIdKgb)) return false;
      return String(k.status || '').trim().toLowerCase() === 'selesai';
    });

    if (completed.length === 0) return null;

    completed.sort((a, b) => {
      const dateA = String(a.updated_at || a.tgl_selesai || a.tanggal_input || a.tmt_baru || '');
      const dateB = String(b.updated_at || b.tgl_selesai || b.tanggal_input || b.tmt_baru || '');
      return dateB.localeCompare(dateA);
    });

    return completed[0];
  },

  /**
   * Mengambil data arsip E-Office (KGB dan Paket Rapat)
   * Mengutamakan Cloud Firestore (0ms), dan otomatis fallback + auto-seed dari Google Sheets
   */
  async getEofficeData(nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const userNip = nip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    let kgbList = [];
    let rapatList = [];
    let hasLoadedKgbs = false;
    let hasLoadedRapats = false;

    // 1. Baca dari Cloud Firestore (100% Firebase-First)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      try {
        const [rawKgbs, rawRapats] = await Promise.all([
          TranskepFirebase.getFirestoreKgbs(),
          TranskepFirebase.getFirestoreRapats()
        ]);

        if (Array.isArray(rawKgbs) && rawKgbs.length > 0) {
          kgbList = rawKgbs;
          hasLoadedKgbs = true;
          console.log(`🔥 [E-Office] Sukses memuat ${kgbList.length} berkas KGB langsung dari Cloud Firestore.`);
        }

        if (Array.isArray(rawRapats) && rawRapats.length > 0) {
          rapatList = rawRapats;
          hasLoadedRapats = true;
        }
      } catch (fsErr) {
        console.warn("⚠️ [E-Office] Pembacaan Firestore tertahan:", fsErr);
      }
    }

    // 2. Jika KGB di Firestore masih kosong (belum migrasi), ambil arsip lama dari Google Sheets & otomatis SEED ke Firestore
    // TAHAP 84: Jika flag migrasi sudah aktif, jangan pernah memanggil fallback Sheets lagi
    const isAlreadyMigrated = (typeof localStorage !== 'undefined' && localStorage.getItem(this.MIGRATION_FLAG_KEY) === 'true');
    if ((!hasLoadedKgbs || !hasLoadedRapats) && !isAlreadyMigrated) {
      try {
        let sheetRes = null;
        if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
          sheetRes = await window.TranskepAPI.call('getEofficeData', userNip, authToken);
        } else if (typeof google !== 'undefined' && google.script && google.script.run) {
          sheetRes = await new Promise((resolve) => {
            google.script.run
              .withSuccessHandler(res => resolve(res))
              .withFailureHandler(() => resolve(null))
              .getEofficeData(userNip, authToken);
          });
        }

        if (sheetRes && sheetRes.status === 'success' && sheetRes.data) {
          if (!hasLoadedKgbs && Array.isArray(sheetRes.data.kgb) && sheetRes.data.kgb.length > 0) {
            kgbList = sheetRes.data.kgb;
            hasLoadedKgbs = true;
            console.log(`📥 [E-Office Auto-Migrate] Mengimpor ${kgbList.length} berkas riwayat KGB dari Google Sheets ke Firestore...`);
            // Otomatis simpan permanen ke Firestore
            this.seedSheetsDataToFirestore(kgbList, []).catch(() => {});
          }

          if (!hasLoadedRapats && Array.isArray(sheetRes.data.rapat) && sheetRes.data.rapat.length > 0) {
            rapatList = sheetRes.data.rapat;
            hasLoadedRapats = true;
            this.seedSheetsDataToFirestore([], rapatList).catch(() => {});
          }
        }
      } catch (sheetErr) {
        console.warn("⚠️ [E-Office] Fallback Google Sheets tertahan:", sheetErr);
      }
    }

    // 3. Gabungkan antrean & kandidat jatuh tempo dari Dashboard
    kgbList = this.mergeDashboardQueue(kgbList);

    // 4. Jika masih kosong, coba dari Local Cache & Dedicated Local KGBs
    if (kgbList.length === 0) {
      const cached = this.getLocalCache();
      if (cached && Array.isArray(cached.kgb) && cached.kgb.length > 0) {
        kgbList = this.mergeDashboardQueue(cached.kgb);
      }
      if (kgbList.length === 0) {
        try {
          const localKgbs = JSON.parse(localStorage.getItem('transkep_eoffice_local_kgbs') || '[]');
          if (Array.isArray(localKgbs) && localKgbs.length > 0) {
            kgbList = this.mergeDashboardQueue(localKgbs);
          }
        } catch (e) {}
      }
    }

    const finalData = { kgb: kgbList, rapat: rapatList };
    if (kgbList.length > 0 || rapatList.length > 0) {
      this.setLocalCache(finalData);
    }

    return {
      status: 'success',
      data: finalData,
      source: hasLoadedKgbs ? 'firestore' : 'hybrid_seed'
    };
  },

  /**
   * Menyalin array KGB dan Rapat yang sudah diambil dari Sheets langsung ke Firestore di background
   */
  async seedSheetsDataToFirestore(kgbList, rapatList) {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady || !TranskepFirebase.isReady()) return;
    let savedAny = false;
    if (Array.isArray(kgbList)) {
      for (const k of kgbList) {
        const cleanNip = String((k && k.nip) || '').replace(/['"\s]/g, '').trim();
        if (k && cleanNip) {
          try {
            await TranskepFirebase.saveKgbToFirestore(k);
            savedAny = true;
          } catch (e) {
            console.warn("⚠️ [E-Office Auto-Seed] Gagal menulis KGB ke Firestore:", e.message || e);
            continue;
          }
        }
      }
    }
    if (Array.isArray(rapatList)) {
      for (const r of rapatList) {
        if (r && (r.id_rapat || r.agenda)) {
          try {
            await TranskepFirebase.saveRapatToFirestore(r);
            savedAny = true;
          } catch (e) {
            console.warn("⚠️ [E-Office Auto-Seed] Gagal menulis Rapat ke Firestore:", e.message || e);
            break;
          }
        }
      }
    }
    if (savedAny && typeof localStorage !== 'undefined') {
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
    }
  },

  /**
   * Menggabungkan dan membersihkan daftar KGB E-Office.
   * [Tahap 134]: Mengeliminasi duplikasi entri draf dummy dari perubahan status dashboard
   * serta memastikan dokumen resmi ber-nomor surat tetap utuh dan rapi.
   */
  mergeDashboardQueue(kgbList) {
    let list = Array.isArray(kgbList) ? [...kgbList] : [];

    // Prioritas 0: Sertakan draf lokal dari transkep_eoffice_local_kgbs
    try {
      const localKgbsRaw = localStorage.getItem('transkep_eoffice_local_kgbs');
      if (localKgbsRaw) {
        const localKgbs = JSON.parse(localKgbsRaw);
        if (Array.isArray(localKgbs)) {
          localKgbs.forEach(lk => {
            const lkNip = String(lk.nip || '').replace(/['"\s]/g, '');
            if (lkNip && !list.some(k => String(k.nip || '').replace(/['"\s]/g, '') === lkNip && String(k.id_kgb || '') === String(lk.id_kgb || ''))) {
              list.unshift(lk);
            }
          });
        }
      }
    } catch (e) {}

    // [Tahap 134]: Eliminasi phantom duplicate & draf dummy yang terinput dari perubahan status dashboard
    const cleaned = [];
    const phantomsToDelete = [];

    const hasOfficialNumber = (k) => {
      const n = String(k.nomor_surat || k.nokgb || '').trim();
      return Boolean(n && n !== '-' && n !== '...' && !n.startsWith('...'));
    };

    // Filter tahap 1: buang dokumen dummy yang tidak valid
    const candidates = list.filter(k => {
      if (!k) return false;
      const isDashboardPhantom = (k.is_from_dashboard === true);
      const isDummyDone = (String(k.status || '').toLowerCase() === 'selesai' && !hasOfficialNumber(k) && !k.gaji_baru);
      if (isDashboardPhantom || isDummyDone) {
        if (k.id_kgb) phantomsToDelete.push(k.id_kgb);
        return false;
      }
      return true;
    });

    // Filter tahap 2: deduplikasi per NIP bila terdapat draf tanpa nomor berdampingan dengan berkas resmi yang sudah ber-nomor
    const nipOfficialMap = new Set();
    candidates.forEach(k => {
      const nip = String(k.nip || '').replace(/['"\s]/g, '');
      if (nip && hasOfficialNumber(k)) {
        nipOfficialMap.add(nip);
      }
    });

    candidates.forEach(k => {
      const nip = String(k.nip || '').replace(/['"\s]/g, '');
      if (nip && nipOfficialMap.has(nip) && !hasOfficialNumber(k) && String(k.id_kgb || '').startsWith('DRAFT-')) {
        if (k.id_kgb) phantomsToDelete.push(k.id_kgb);
        return;
      }
      cleaned.push(k);
    });

    // [Tahap 135 - Opsi C]: Penyelarasan In-Place Status Dokumen Eksisting dari Status Dashboard Pegawai
    let uList = (window.vueState && window.vueState.usersList)
      ? window.vueState.usersList
      : (typeof state !== 'undefined' ? state.usersList : []);
    if (!Array.isArray(uList) || uList.length === 0) {
      try {
        const cachedUsers = localStorage.getItem('transkep_users_cache');
        if (cachedUsers) uList = JSON.parse(cachedUsers);
      } catch (e) {}
    }

    if (Array.isArray(uList)) {
      cleaned.forEach(k => {
        const nip = String(k.nip || '').replace(/['"\s]/g, '');
        if (!nip) return;
        const u = uList.find(user => String(user.nip || '').replace(/['"\s]/g, '') === nip);
        if (u) {
          const uStatusKgb = String(u.status_kgb || u.Status_KGB || '').trim().toUpperCase();
          if (uStatusKgb === 'SELESAI' && k.status !== 'Selesai') {
            k.status = 'Selesai';
            if (!k.tgl_selesai) {
              k.tgl_selesai = u.tgl_selesai_kgb || new Date().toISOString().split('T')[0];
            }
          }
        }
      });
    }

    // Pembersihan asinkron di latar belakang untuk menghapus dokumen dummy dari local storage & Firestore
    if (phantomsToDelete.length > 0) {
      try {
        const localRaw = localStorage.getItem('transkep_eoffice_local_kgbs');
        if (localRaw) {
          const lKgbs = JSON.parse(localRaw);
          if (Array.isArray(lKgbs)) {
            const filteredLocal = lKgbs.filter(lk => !phantomsToDelete.includes(lk.id_kgb));
            localStorage.setItem('transkep_eoffice_local_kgbs', JSON.stringify(filteredLocal));
          }
        }
      } catch (e) {}

      if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
        phantomsToDelete.forEach(id => {
          TranskepFirebase.deleteKgbFromFirestore(id).catch(() => {});
        });
      }
    }

    return cleaned;
  },

  /**
   * [Tahap 135 - Opsi C]: Sinkronisasi In-Place Status KGB dari Dashboard ke Dokumen Eksisting E-Office.
   * Catatan: HANYA memperbarui dokumen yang SUDAH ADA di E-Office (tidak membuat draf baru/dummy).
   */
  async handleDashboardKgbStatusChange(userRef, newStatus, todayYMD) {
    if (!userRef || !userRef.nip) return;

    const targetNip = String(userRef.nip).replace(/['"\s]/g, '');
    const dateNow = todayYMD || new Date().toISOString().split('T')[0];
    const targetStatus = (newStatus === 'Selesai') ? 'Selesai' : ((newStatus === 'Proses') ? 'Sedang Diproses' : 'Sedang Diproses');

    // 1. Ambil cache lokal
    const cached = this.getLocalCache();
    let baseKgb = (cached && Array.isArray(cached.kgb)) ? [...cached.kgb] : [];

    const existIdx = baseKgb.findIndex(k => String(k.nip || '').replace(/['"\s]/g, '') === targetNip);
    if (existIdx !== -1) {
      baseKgb[existIdx].status = targetStatus;
      if (newStatus === 'Selesai') {
        baseKgb[existIdx].tgl_selesai = dateNow;
      }
      baseKgb[existIdx].updated_at = new Date().toISOString();

      this.setLocalCache({ kgb: baseKgb, rapat: (cached && cached.rapat) || [] });
      try {
        localStorage.setItem('transkep_eoffice_local_kgbs', JSON.stringify(baseKgb));
      } catch (e) {}

      if (typeof window !== 'undefined' && window.vmEoffice && Array.isArray(window.vmEoffice.rawKgbList)) {
        const vmIdx = window.vmEoffice.rawKgbList.findIndex(k => String(k.nip || '').replace(/['"\s]/g, '') === targetNip);
        if (vmIdx !== -1) {
          window.vmEoffice.rawKgbList[vmIdx] = { ...window.vmEoffice.rawKgbList[vmIdx], ...baseKgb[existIdx] };
        }
      }

      // Simpan pembaruan in-place ke Firestore
      if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
        try {
          await TranskepFirebase.saveKgbToFirestore(baseKgb[existIdx]);
        } catch (fsErr) {
          console.warn("⚠️ [E-Office] Notice sync in-place Firestore:", fsErr);
        }
      }
    }
  },

  /**
   * Menyinkronkan seluruh data KGB & Rapat dari Google Sheets ke Cloud Firestore secara eksplisit
   */
  async syncAllSheetsToFirestore() {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }

    const nip = (typeof state !== 'undefined' && state.user ? state.user.nip : '') || localStorage.getItem('transkep_active_nip') || '';
    const token = localStorage.getItem('transkep_session_token') || '';

    let sheetData = null;
    if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
      try {
        const rpcRes = await window.TranskepAPI.call('getEofficeData', nip, token);
        if (rpcRes && rpcRes.status === 'success' && rpcRes.data) {
          sheetData = rpcRes.data;
        } else if (rpcRes && (rpcRes.kgb || rpcRes.rapat)) {
          sheetData = rpcRes;
        }
      } catch (apiErr) {
        console.warn("⚠️ [E-Office] TranskepAPI call getEofficeData notice:", apiErr);
      }
    }

    if (!sheetData && typeof google !== 'undefined' && google.script && google.script.run) {
      sheetData = await new Promise((resolve) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res && res.data ? res.data : res))
          .withFailureHandler(() => resolve(null))
          .getEofficeData(nip, token);
      });
    }

    let kgbCount = 0;
    let rapatCount = 0;
    let permissionError = null;

    const allKgbs = this.mergeDashboardQueue((sheetData && Array.isArray(sheetData.kgb)) ? sheetData.kgb : []);
    for (const k of allKgbs) {
      const cleanNip = String((k && k.nip) || '').replace(/['"\s]/g, '').trim();
      if (k && cleanNip) {
        try {
          await TranskepFirebase.saveKgbToFirestore(k);
          kgbCount++;
        } catch (e) {
          permissionError = e;
          console.error("❌ Gagal simpan KGB ke Firestore:", e);
          break;
        }
      }
    }

    if (!permissionError && sheetData && Array.isArray(sheetData.rapat)) {
      for (const r of sheetData.rapat) {
        if (r && (r.id_rapat || r.agenda)) {
          try {
            await TranskepFirebase.saveRapatToFirestore(r);
            rapatCount++;
          } catch (e) {
            permissionError = e;
            console.error("❌ Gagal simpan Rapat ke Firestore:", e);
            break;
          }
        }
      }
    }

    if (permissionError) {
      const errMsg = String(permissionError.message || permissionError);
      if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('insufficient')) {
        throw new Error("Ditolak oleh Firestore Security Rules! Tambahkan koleksi 'eoffice_kgb' dan 'eoffice_rapat' pada tab Rules di Firebase Console.");
      }
      throw permissionError;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
    }

    return {
      status: 'success',
      message: `Berhasil mengamankan ${kgbCount} berkas KGB dan ${rapatCount} berkas Rapat ke Cloud Firestore!`
    };
  },

  triggerBackgroundMigration() {
    this.syncAllSheetsToFirestore().catch(() => { });
  },

  /**
   * Mengirim berkas KGB ke antrean Persiapan TTE Pimpinan (Ketua)
   */
  async sendKgbForTte(kgbRawData, adminNip, token) {
    const uList = (window.vueState && window.vueState.usersList)
      ? window.vueState.usersList
      : (typeof state !== 'undefined' ? state.usersList : []);
    const ketuaObj = Array.isArray(uList)
      ? uList.find(u => u.jabatan && u.jabatan.toLowerCase().includes('ketua') && !u.jabatan.toLowerCase().includes('wakil'))
      : null;

    const payload = {
      ...kgbRawData,
      status: 'Menunggu TTE Pimpinan',
      tte_status: 'Menunggu TTE',
      tte_pejabat_nip: ketuaObj ? String(ketuaObj.nip || '') : '',
      tte_pejabat_nama: kgbRawData.nama_ketua || (ketuaObj ? ketuaObj.nama : 'Ketua Pengadilan Agama Indramayu'),
      tte_submitted_at: new Date().toISOString()
    };

    return await this.saveOrGenerateKgb(payload, 'tte', adminNip, token);
  },

  /**
   * Menyimpan draf, mengajukan TTE, atau menerbitkan SK KGB ke Google Docs
   * - Mode 'draft': Instan simpan ke Cloud Firestore (<50ms) + mempertahankan status ('Selesai'/'Menunggu TTE') jika sedang diedit
   * - Mode 'tte'  : Instan promosi status ke 'Menunggu TTE Pimpinan' di Cloud Firestore (<50ms)
   * - Mode 'generate': Google Apps Script merender Master Google Doc ke Folder Drive 1IwQ96D4dY6HrPCqoXY2opX8FHWaMjAHQ
   */
  async saveOrGenerateKgb(payload, actionType, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const creatorNip = adminNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    // ==========================================
    // A. MODE DRAFT ATAU KIRIM TTE: INSTANT FIRESTORE SAVE (<50ms)
    // ==========================================
    if (actionType === 'draft' || actionType === 'tte') {
      const rawId = String(payload.id_kgb || '').trim();
      const docId = (!rawId || rawId.startsWith('DRAFT-') || rawId === ('KGB-' + payload.nip))
        ? this.buildPermanentKgbId(payload.nip, payload.tmt_baru || payload.tanggal_input)
        : rawId;

      let targetStatus = 'Sedang Diproses';
      if (actionType === 'tte') {
        targetStatus = 'Menunggu TTE Pimpinan';
      } else if (payload.status === 'Selesai' || payload.status === 'Menunggu TTE Pimpinan') {
        // Pertahankan status jika Admin mengedit berkas yang sudah Dikirim TTE atau sudah Selesai
        targetStatus = payload.status;
      }

      const rawNoKgb = String(payload.nokgb || '').trim();
      const rawNoSurat = String(payload.nomor_surat || '').trim();
      const hasCleanNomor = (rawNoKgb !== '' && rawNoKgb !== '...' && rawNoKgb !== '......' && rawNoKgb !== '-') ||
        /^\d+\//.test(rawNoSurat);
      const prevMysimsStatus = String(payload.mysims_status || '').trim();
      // Bedakan status pra-kirim / nyangkut ('Meminta Nomor MYSIMS' atau 'Gagal...') dari permintaan yang sudah terkirim/terbit
      const alreadySentToMysims = Boolean(payload.mysims_requested) &&
        prevMysimsStatus !== 'Meminta Nomor MYSIMS' &&
        !prevMysimsStatus.startsWith('Gagal');
      const shouldRequestMysims = (actionType === 'draft' && !alreadySentToMysims && !hasCleanNomor);

      const resolvedMysimsStatus = hasCleanNomor
        ? 'Nomor Terbit MYSIMS'
        : (shouldRequestMysims ? 'Permintaan Terkirim ke MYSIMS' : prevMysimsStatus);

      const kgbData = {
        ...payload,
        id_kgb: docId,
        status: targetStatus,
        is_from_dashboard: false,
        mysims_requested: shouldRequestMysims ? true : alreadySentToMysims,
        mysims_status: resolvedMysimsStatus,
        mysims_idp: String(payload.mysims_idp || ''),
        mysims_requested_at: payload.mysims_requested_at || (shouldRequestMysims ? new Date().toISOString() : ''),
        created_by: creatorNip,
        tanggal_input: payload.tanggal_input || new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      };

      // 1. Simpan langsung ke Cloud Firestore (1x sebelum trigger agar tidak menimpa callback MYSIMS)
      if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
        try {
          await TranskepFirebase.saveKgbToFirestore(kgbData);
          if (rawId && rawId.startsWith('DRAFT-') && rawId !== docId) {
            await TranskepFirebase.deleteKgbFromFirestore(rawId).catch(() => { });
          }
          if (payload.nip && docId !== ('DRAFT-' + payload.nip)) {
            await TranskepFirebase.deleteKgbFromFirestore('DRAFT-' + payload.nip).catch(() => { });
          }
          console.log(`⚡ [E-Office] KGB (${targetStatus}) tersimpan di Cloud Firestore:`, docId);
        } catch (fsErr) {
          console.error("❌ Gagal simpan KGB ke Firestore:", fsErr);
          throw fsErr;
        }
      }

      // 2. Jika simpan pertama kali tanpa nomor -> kirim ke GAS dengan status pra-flag agar GAS tidak memblokir dirinya sendiri
      let mysimsRes = null;
      if (shouldRequestMysims) {
        const requestPayload = {
          ...kgbData,
          mysims_requested: false,
          mysims_status: prevMysimsStatus
        };
        try {
          mysimsRes = await this.requestKgbSuratKeluar(requestPayload, creatorNip, authToken);
          if (mysimsRes && mysimsRes.status === 'already_exists' && mysimsRes.nomor_surat) {
            kgbData.nokgb = mysimsRes.nokgb || kgbData.nokgb;
            kgbData.nomor_surat = mysimsRes.nomor_surat;
            kgbData.mysims_requested = true;
            kgbData.mysims_status = 'Nomor Terbit MYSIMS';
            await this.applyMysimsResultToLocalState(docId, payload.nip, {
              id_kgb: docId,
              nip: payload.nip,
              nokgb: kgbData.nokgb,
              nomor_surat: kgbData.nomor_surat,
              mysims_status: 'Nomor Terbit MYSIMS'
            });
          } else if (mysimsRes && mysimsRes.status === 'success') {
            this.syncKgbMysimsNumberInBackground(docId, payload.nip, creatorNip, authToken);
          } else if (!mysimsRes || (mysimsRes.status !== 'success' && mysimsRes.status !== 'already_exists')) {
            mysimsRes = mysimsRes || { status: 'error', message: 'Backend GAS tidak merespons permintaan nomor MYSIMS.' };
            kgbData.mysims_requested = false;
            kgbData.mysims_status = 'Gagal Minta Nomor MYSIMS';
            if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
              await TranskepFirebase.saveKgbToFirestore(kgbData).catch(() => { });
            }
          }
        } catch (mErr) {
          console.warn("⚠️ [E-Office] Gagal panggil MYSIMS KGB:", mErr);
          mysimsRes = { status: 'error', message: mErr.toString() };
          kgbData.mysims_requested = false;
          kgbData.mysims_status = 'Gagal Minta Nomor MYSIMS';
          if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
            await TranskepFirebase.saveKgbToFirestore(kgbData).catch(() => { });
          }
        }
      }

      // Catatan: Database KGB telah 100% pindah ke Cloud Firestore. Inputan baru tidak dimasukkan lagi ke Google Sheets.

      return {
        status: 'success',
        message: actionType === 'tte'
          ? 'Berkas KGB berhasil dikirim ke antrean persiapan TTE Pimpinan!'
          : (shouldRequestMysims
            ? ((mysimsRes && mysimsRes.status === 'success')
              ? 'Data KGB disimpan & permintaan nomor surat keluar Ketua MYSIMS (KPA.W10-A2/KP2.1.2) telah dikirim!'
              : ((mysimsRes && mysimsRes.status === 'already_exists')
                ? (mysimsRes.message || 'Berkas KGB ini sudah memproses nomor MYSIMS.')
                : 'Data KGB disimpan, namun gagal meminta nomor MYSIMS: ' + ((mysimsRes && mysimsRes.message) || 'Cek koneksi')))
            : 'Data KGB berhasil disimpan ke Cloud Firestore.'),
        id_kgb: docId,
        mysims_requested_now: shouldRequestMysims,
        mysims_res: mysimsRes,
        data: kgbData
      };
    }

    // ==========================================
    // B. MODE GENERATE: GENERATE GOOGLE DOCS VIA GAS + SAVE FIRESTORE
    // ==========================================
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script diperlukan untuk membuat file dokumen Google Docs."));
      }

      google.script.run
        .withSuccessHandler(async (res) => {
          if (res && res.status === 'success') {
            const docUrl = (res.data && res.data.doc_url) || res.url || '';
            const pdfUrl = (res.data && res.data.pdf_url) || res.pdf_url || (docUrl ? docUrl.replace('/edit', '/export?format=pdf') : '');
            const rawId = String(payload.id_kgb || '').trim();
            const docId = (res.data && res.data.id_kgb) || res.id_kgb || ((!rawId || rawId.startsWith('DRAFT-'))
              ? this.buildPermanentKgbId(payload.nip, payload.tmt_baru)
              : rawId);

            const completedKgb = {
              ...payload,
              id_kgb: docId,
              status: 'Selesai',
              file_doc_url: docUrl,
              file_pdf_url: pdfUrl,
              is_from_dashboard: false,
              tgl_selesai: new Date().toISOString().split('T')[0],
              created_by: creatorNip,
              updated_at: new Date().toISOString()
            };

            // 1. Simpan hasil terbit secara permanen ke Cloud Firestore
            if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
              try {
                await TranskepFirebase.saveKgbToFirestore(completedKgb);

                if (rawId && rawId.startsWith('DRAFT-') && rawId !== docId) {
                  await TranskepFirebase.deleteKgbFromFirestore(rawId).catch(() => { });
                }
                if (payload.nip && docId !== ('DRAFT-' + payload.nip)) {
                  await TranskepFirebase.deleteKgbFromFirestore('DRAFT-' + payload.nip).catch(() => { });
                }

                // Perbarui status pegawai di Firestore collection 'users'
                if (typeof TranskepFirebase.saveUserToFirestore === 'function' && payload.nip) {
                  await TranskepFirebase.saveUserToFirestore({
                    nip: String(payload.nip),
                    status_kgb: 'Selesai',
                    tmt_kgb: payload.tmt_yad || payload.tmt_baru || ''
                  }).catch(() => { });
                }
              } catch (fsErr) {
                console.warn("⚠️ Gagal sinkronisasi SK terbit ke Firestore:", fsErr);
              }
            }

            // 2. Perbarui state pegawai di memori lokal
            const uList = (window.vueState && window.vueState.usersList)
              ? window.vueState.usersList
              : (typeof state !== 'undefined' ? state.usersList : []);
            if (Array.isArray(uList) && payload.nip) {
              const u = uList.find(x => String(x.nip) === String(payload.nip));
              if (u) {
                u.status_kgb = 'Selesai';
                if (payload.tmt_yad) u.tmt_kgb = payload.tmt_yad;
              }
            }
          }
          resolve(res);
        })
        .withFailureHandler((err) => reject(err))
        .saveOrGenerateKgbDoc(payload, actionType, creatorNip, authToken);
    });
  },

  /**
   * Memicu permintaan nomor surat keluar Ketua MYSIMS & upload PDF otomatis via GAS -> n8n
   */
  async requestKgbSuratKeluar(kgbPayload, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const creatorNip = adminNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    if (typeof window !== 'undefined' && window.TranskepAPI && typeof window.TranskepAPI.call === 'function') {
      return await window.TranskepAPI.call('requestKgbSuratKeluar', kgbPayload, creatorNip, authToken);
    }
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return await new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .requestKgbSuratKeluar(kgbPayload, creatorNip, authToken);
      });
    }
    return { status: 'error', message: 'Koneksi API backend Apps Script tidak tersedia.' };
  },

  /**
   * Mengecek apakah record KGB sudah memiliki nomor urut bersih (bukan placeholder '...' / '......')
   */
  hasValidKgbNumber(rec) {
    if (!rec || typeof rec !== 'object') return false;
    const no = String(rec.nokgb || '').trim();
    if (no && no !== '...' && no !== '......' && no !== '-') return true;
    const full = String(rec.nomor_surat || '').trim();
    if (full && /^\d+[^/]*\//.test(full) && full.indexOf('...') === -1) return true;
    return false;
  },

  /**
   * Menerapkan nomor MYSIMS terbit ke daftar E-Office, local cache, DOM modal aktif, dan Cloud Firestore
   */
  async applyMysimsResultToLocalState(docId, targetNip, issued) {
    if (!issued || !this.hasValidKgbNumber(issued)) return null;
    const cleanId = String(docId || issued.id_kgb || '').trim();
    const cleanNip = String(targetNip || issued.nip || '').replace(/['"\s]/g, '').trim();
    const issuedNo = String(issued.nokgb || '').trim();
    const issuedFull = String(issued.nomor_surat || '').trim();
    const firstSeg = (issuedFull && issuedFull.indexOf('/') !== -1) ? issuedFull.split('/')[0].trim() : '';
    const finalNoKgb = (issuedNo && issuedNo !== '...' && issuedNo !== '......' && issuedNo !== '-') ? issuedNo : firstSeg;

    const patchData = {
      nokgb: finalNoKgb,
      nomor_surat: issuedFull,
      mysims_requested: true,
      mysims_status: String(issued.mysims_status || 'Nomor Terbit MYSIMS').trim(),
      mysims_idp: String(issued.mysims_idp || '').trim(),
      updated_at: new Date().toISOString()
    };
    if (issued.bulan_surat) patchData.bulan_surat = String(issued.bulan_surat).trim();
    if (issued.tahun_surat) patchData.tahun_surat = String(issued.tahun_surat).trim();

    let updatedDoc = null;
    if (typeof window !== 'undefined' && window.vmEoffice && Array.isArray(window.vmEoffice.rawKgbList)) {
      const idx = window.vmEoffice.rawKgbList.findIndex(k =>
        (cleanId && String(k.id_kgb || '').trim() === cleanId) ||
        (cleanNip && String(k.nip || '').replace(/['"\s]/g, '') === cleanNip && String(k.status || '').toLowerCase() !== 'selesai')
      );
      if (idx !== -1) {
        updatedDoc = { ...window.vmEoffice.rawKgbList[idx], ...patchData };
        window.vmEoffice.rawKgbList.splice(idx, 1, updatedDoc);
        this.setLocalCache({ kgb: window.vmEoffice.rawKgbList, rapat: window.vmEoffice.rawRapatList || [] });
      }
    }

    // Jika modal detail KGB sedang terbuka untuk berkas ini, sinkronkan input & badge langsung
    if (typeof document !== 'undefined') {
      const elId = document.getElementById('kgbFieldIdKgb');
      const elNip = document.getElementById('kgbFieldNip');
      const openId = elId ? String(elId.value || '').trim() : '';
      const openNip = elNip ? String(elNip.value || '').replace(/['"\s]/g, '').trim() : '';
      if ((cleanId && openId === cleanId) || (cleanNip && openNip === cleanNip)) {
        const elNo = document.getElementById('kgbFieldNoKgb');
        const elFull = document.getElementById('kgbFieldNomorSurat');
        const elReq = document.getElementById('kgbFieldMysimsRequested');
        const elStat = document.getElementById('kgbFieldMysimsStatus');
        const elIdp = document.getElementById('kgbFieldMysimsIdp');
        const elBadge = document.getElementById('kgbMysimsBadge');
        if (elNo && finalNoKgb) elNo.value = finalNoKgb;
        if (elFull && issuedFull) elFull.value = issuedFull;
        if (elReq) elReq.value = 'true';
        if (elStat) elStat.value = patchData.mysims_status;
        if (elIdp && patchData.mysims_idp) elIdp.value = patchData.mysims_idp;
        if (elBadge && finalNoKgb) {
          elBadge.textContent = 'No. MYSIMS Aktif (' + finalNoKgb + ')';
          elBadge.className = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
        }
      }
    }

    // Pastikan Cloud Firestore ikut tersinkron meski REST patch server sempat gagal/terlambat
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      const firestorePayload = updatedDoc
        ? { ...updatedDoc }
        : {
            id_kgb: cleanId || ('DRAFT-' + cleanNip),
            nip: cleanNip,
            status: 'Sedang Diproses',
            ...patchData
          };
      if (firestorePayload.id_kgb && firestorePayload.nip) {
        await TranskepFirebase.saveKgbToFirestore(firestorePayload).catch(() => {});
      }
    }

    return { ...patchData, id_kgb: cleanId, nip: cleanNip };
  },

  /**
   * Mengambil status nomor MYSIMS KGB terbaru dari Cache/Firestore backend GAS (1x cek instan)
   */
  async fetchLatestKgbMysimsNumber(idKgb, targetNip, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const creatorNip = adminNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';
    const cleanId = String(idKgb || '').trim();
    const cleanNip = String(targetNip || '').replace(/['"\s]/g, '').trim();
    if (!cleanId && !cleanNip) return null;

    let res = null;
    try {
      if (typeof window !== 'undefined' && window.TranskepAPI && typeof window.TranskepAPI.call === 'function') {
        res = await window.TranskepAPI.call('getKgbMysimsStatus', cleanId, cleanNip, creatorNip, authToken);
      } else if (typeof google !== 'undefined' && google.script && google.script.run) {
        res = await new Promise((resolve) => {
          google.script.run
            .withSuccessHandler((r) => resolve(r))
            .withFailureHandler(() => resolve(null))
            .getKgbMysimsStatus(cleanId, cleanNip, creatorNip, authToken);
        });
      }
    } catch (e) {
      return null;
    }

    if (res && res.status === 'success' && res.data && this.hasValidKgbNumber(res.data)) {
      return await this.applyMysimsResultToLocalState(cleanId, cleanNip, res.data);
    }
    return null;
  },

  /**
   * Polling latar belakang setelah 1st-save agar nomor MYSIMS otomatis masuk ke Firestore, UI & Form Cetak KGB
   */
  syncKgbMysimsNumberInBackground(docId, targetNip, adminNip, token) {
    if (typeof setTimeout !== 'function') return;
    const cleanId = String(docId || '').trim();
    if (!cleanId) return;
    if (!this._activeMysimsPolls) this._activeMysimsPolls = {};
    if (this._activeMysimsPolls[cleanId]) return;
    this._activeMysimsPolls[cleanId] = true;

    const maxAttempts = 10;
    const pollDelayMs = 2000;
    let attempt = 0;

    const runStep = async () => {
      attempt += 1;
      try {
        const applied = await this.fetchLatestKgbMysimsNumber(cleanId, targetNip, adminNip, token);
        if (applied && this.hasValidKgbNumber(applied)) {
          delete this._activeMysimsPolls[cleanId];
          if (typeof showNotify === 'function') {
            showNotify('Nomor MYSIMS Terbit', 'Nomor surat keluar KGB (' + (applied.nomor_surat || applied.nokgb) + ') siap dicetak.', 'success');
          }
          return;
        }
      } catch (e) {}

      if (attempt < maxAttempts) {
        setTimeout(runStep, pollDelayMs);
      } else {
        delete this._activeMysimsPolls[cleanId];
      }
    };

    setTimeout(runStep, pollDelayMs);
  },

  /**
   * Menerbitkan paket dokumen rapat 3-in-1 ke Google Docs dan menyimpannya ke Cloud Firestore
   */
  createPaketRapat(payload, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const creatorNip = adminNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script diperlukan untuk membuat 3 file dokumen Rapat."));
      }

      google.script.run
        .withSuccessHandler(async (res) => {
          if (res && res.status === 'success' && res.data) {
            const rapatDocId = res.id_rapat || payload.id_rapat || ('RPT-' + Date.now());
            const rapatData = {
              ...payload,
              id_rapat: rapatDocId,
              status: 'Selesai',
              doc_undangan_url: res.data.doc_undangan_url || '',
              doc_absen_url: res.data.doc_absen_url || '',
              doc_notulen_url: res.data.doc_notulen_url || '',
              created_by: creatorNip
            };

            if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
              try {
                await TranskepFirebase.saveRapatToFirestore(rapatData);
                console.log("⚡ [E-Office] Paket Rapat berhasil disimpan ke Cloud Firestore:", rapatDocId);
              } catch (fsErr) {
                console.warn("⚠️ Gagal simpan Paket Rapat ke Firestore:", fsErr);
              }
            }
          }
          resolve(res);
        })
        .withFailureHandler((err) => reject(err))
        .createPaketRapatDocs(payload, creatorNip, authToken);
    });
  },

  /**
   * Menghapus berkas KGB dari Cloud Firestore + mencegah ghost draft & membersihkan cold backup Sheets
   */
  async deleteKgb(idKgb, rawData) {
    const targetId = String(idKgb || (rawData && rawData.id_kgb) || '').trim();
    const targetNip = String((rawData && rawData.nip) || '').trim();
    const isActiveDraft = rawData && String(rawData.status || '').trim().toLowerCase() !== 'selesai';

    if (!targetId) {
      return { status: 'error', message: 'ID KGB tidak valid untuk dihapus.' };
    }

    // 1. Jika yang dihapus adalah draf aktif pegawai yang di Dashboard sedang 'Proses', reset status_kgb pegawai di memori
    // agar mergeDashboardQueue tidak memunculkan kembali ghost draft 'DRAFT-{nip}'
    if (isActiveDraft && targetNip) {
      const uList = (window.vueState && window.vueState.usersList)
        ? window.vueState.usersList
        : (typeof state !== 'undefined' ? state.usersList : []);
      if (Array.isArray(uList)) {
        const uRef = uList.find(u => String(u.nip) === targetNip);
        if (uRef && String(uRef.status_kgb || '').toUpperCase() === 'PROSES') {
          uRef.status_kgb = '';
        }
      }
    }

    // 2. Hapus dari Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      await TranskepFirebase.deleteKgbFromFirestore(targetId);
      if (isActiveDraft && targetNip && targetId !== ('DRAFT-' + targetNip)) {
        await TranskepFirebase.deleteKgbFromFirestore('DRAFT-' + targetNip).catch(() => { });
      }
      if (isActiveDraft && targetNip && typeof TranskepFirebase.saveUserToFirestore === 'function') {
        await TranskepFirebase.saveUserToFirestore({ nip: targetNip, status_kgb: '' }).catch(() => { });
      }
    }

    // Catatan: Data riwayat lama di Google Sheets tetap dipreservasi utuh dan tidak dihapus.

    return { status: 'success', message: 'Berkas KGB berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Menghapus arsip Paket Rapat dari Cloud Firestore
   */
  async deleteRapat(idRapat) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      return await TranskepFirebase.deleteRapatFromFirestore(idRapat);
    }
    return { status: 'error', message: 'Koneksi Cloud Firestore tidak aktif.' };
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.EofficeDataService = EofficeDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EofficeDataService };
}
