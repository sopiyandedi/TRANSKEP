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
    if (!hasLoadedKgbs || !hasLoadedRapats) {
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

    // 4. Jika masih kosong, coba dari Local Cache
    if (kgbList.length === 0) {
      const cached = this.getLocalCache();
      if (cached && Array.isArray(cached.kgb) && cached.kgb.length > 0) {
        kgbList = this.mergeDashboardQueue(cached.kgb);
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
        if (k && (k.id_kgb || k.nip)) {
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
   * Menyintesis antrean pegawai berstatus KGB 'Proses' dari state.usersList ke daftar KGB
   * Catatan: Riwayat KGB berstatus 'Selesai' tetap dipertahankan & berdampingan dengan siklus baru
   */
  mergeDashboardQueue(kgbList) {
    const list = Array.isArray(kgbList) ? [...kgbList] : [];
    let uList = (window.vueState && window.vueState.usersList)
      ? window.vueState.usersList
      : (typeof state !== 'undefined' ? state.usersList : []);

    // Fallback ambil dari localStorage jika in-memory usersList belum terisi
    if (!Array.isArray(uList) || uList.length === 0) {
      try {
        const cachedUsers = localStorage.getItem('transkep_users_cache');
        if (cachedUsers) uList = JSON.parse(cachedUsers);
      } catch (e) {}
    }

    if (Array.isArray(uList)) {
      uList.forEach(u => {
        const statusKgb = String(u.status_kgb || u.Status_KGB || '').trim().toUpperCase();
        const strNip = String(u.nip || '').replace(/['"\s]/g, '');
        if (!strNip) return;

        // 1. KASUS: Pegawai berstatus KGB 'PROSES' (Sedang Diproses)
        if (statusKgb === 'PROSES') {
          const hasActiveCycle = list.some(k => String(k.nip || '').replace(/['"\s]/g, '') === strNip && String(k.status || '').trim().toLowerCase() !== 'selesai');
          if (!hasActiveCycle) {
            let tmtLama = u.tmt_kgb || '';
            let tmtBaru = tmtLama;
            if (tmtLama) {
              try {
                const parseFn = (typeof parseTanggalLokal === 'function') ? parseTanggalLokal : (d => new Date(d));
                const d = parseFn(tmtLama);
                if (d && !isNaN(d.getTime())) {
                  const dNew = new Date(d);
                  dNew.setFullYear(dNew.getFullYear() + 2);
                  tmtBaru = `${dNew.getFullYear()}-${String(dNew.getMonth() + 1).padStart(2, '0')}-${String(dNew.getDate()).padStart(2, '0')}`;
                }
              } catch (e) {}
            }
            list.unshift({
              id_kgb: 'DRAFT-' + strNip,
              nip: strNip,
              nama_pegawai: u.nama || '',
              pangkat: u.pangkat || '',
              golongan: u.golongan || '',
              jabatan: u.jabatan || '',
              tmt_lama: tmtLama,
              tmt_baru: tmtBaru,
              status: 'Sedang Diproses',
              is_from_dashboard: true,
              tanggal_input: new Date().toISOString().split('T')[0]
            });
          }
        }
        // 2. KASUS: Pegawai berstatus KGB 'SELESAI' (Arsip KGB yang sudah terbit di Dashboard)
        else if (statusKgb === 'SELESAI') {
          const hasRecord = list.some(k => String(k.nip || '').replace(/['"\s]/g, '') === strNip);
          if (!hasRecord) {
            list.push({
              id_kgb: 'KGB-' + strNip + '-' + (u.tmt_kgb ? String(u.tmt_kgb).replace(/[^0-9]/g, '') : 'DONE'),
              nip: strNip,
              nama_pegawai: u.nama || '',
              pangkat: u.pangkat || '',
              golongan: u.golongan || '',
              jabatan: u.jabatan || '',
              tmt_lama: u.tmt_kgb || '',
              tmt_baru: u.tmt_kgb || '',
              status: 'Selesai',
              tgl_selesai: u.tgl_selesai_kgb || new Date().toISOString().split('T')[0],
              is_from_dashboard: true,
              tanggal_input: u.tgl_selesai_kgb || new Date().toISOString().split('T')[0]
            });
          }
        }
        // 3. KASUS CADANGAN: Tampilkan pegawai yang jatuh tempo KGB (deadline <= 90 hari) jika belum ada di daftar
        else if (u.tmt_kgb) {
          const hasItem = list.some(k => String(k.nip || '').replace(/['"\s]/g, '') === strNip);
          if (hasItem) return;
          try {
            const parseFn = (typeof parseTanggalLokal === 'function') ? parseTanggalLokal : (d => new Date(d));
            const d = parseFn(u.tmt_kgb);
            if (d && !isNaN(d.getTime())) {
              const targetKgb = new Date(d);
              targetKgb.setFullYear(targetKgb.getFullYear() + 2);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((targetKgb.getTime() - today.getTime()) / (1000 * 3600 * 24));
              if (diffDays <= 90) {
                const hasItem = list.some(k => String(k.nip || '').replace(/['"\s]/g, '') === strNip);
                if (!hasItem) {
                  const dNew = new Date(d);
                  dNew.setFullYear(dNew.getFullYear() + 2);
                  const tmtBaru = `${dNew.getFullYear()}-${String(dNew.getMonth() + 1).padStart(2, '0')}-${String(dNew.getDate()).padStart(2, '0')}`;
                  list.push({
                    id_kgb: 'DRAFT-' + strNip,
                    nip: strNip,
                    nama_pegawai: u.nama || '',
                    pangkat: u.pangkat || '',
                    golongan: u.golongan || '',
                    jabatan: u.jabatan || '',
                    tmt_lama: u.tmt_kgb || '',
                    tmt_baru: tmtBaru,
                    status: 'Sedang Diproses',
                    is_from_dashboard: true,
                    tanggal_input: new Date().toISOString().split('T')[0]
                  });
                }
              }
            }
          } catch(e) {}
        }
      });
    }

    return list;
  },

  /**
   * Sinkronisasi perubahan status KGB dari Bar Peringatan Dini Dashboard ke Cloud Firestore (eoffice_kgb)
   * ATURAN RETENSI TAHAP 2:
   * - 'Proses'  -> Buat/aktifkan draf siklus baru (dengan auto-prefill dari KGB Selesai sebelumnya jika ada)
   * - 'Selesai' -> JANGAN HAPUS! Promosikan & simpan permanen sebagai status 'Selesai' di eoffice_kgb
   * - 'Menunggu'-> Hanya hapus draf sementara 'DRAFT-{nip}' yang belum diterbitkan (arsip 'Selesai' tetap aman)
   */
  async handleDashboardKgbStatusChange(userRef, newStatus, todayYMD) {
    if (!userRef || !userRef.nip) return;
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady || !TranskepFirebase.isReady()) return;

    const targetNip = String(userRef.nip).trim();
    const dateNow = todayYMD || new Date().toISOString().split('T')[0];

    try {
      const existingList = await TranskepFirebase.getFirestoreKgbs();
      const allForNip = Array.isArray(existingList)
        ? existingList.filter(k => String(k.nip || '').trim() === targetNip)
        : [];
      const activeDoc = allForNip.find(k => String(k.status || '').trim().toLowerCase() !== 'selesai');

      if (newStatus === 'Proses') {
        if (!activeDoc) {
          // Cek apakah ada riwayat KGB Selesai periode sebelumnya untuk auto-prefill Data Lama
          const prevDone = allForNip
            .filter(k => String(k.status || '').trim().toLowerCase() === 'selesai')
            .sort((a, b) => String(b.updated_at || b.tanggal_input || '').localeCompare(String(a.updated_at || a.tanggal_input || '')))[0];

          const newDraft = {
            id_kgb: 'DRAFT-' + targetNip,
            nip: targetNip,
            nama_pegawai: userRef.nama || '',
            tanggal_lahir: (prevDone && prevDone.tanggal_lahir) || userRef.tgl_lahir || userRef.tanggal_lahir || '',
            pangkat: userRef.pangkat || (prevDone && prevDone.pangkat) || '',
            golongan: userRef.golongan || (prevDone && prevDone.golongan) || '',
            jabatan: userRef.jabatan || (prevDone && prevDone.jabatan) || '',
            gaji_lama: (prevDone && prevDone.gaji_baru) || '',
            pejabat_lama: 'Ketua Pengadilan Agama Indramayu',
            nomor_sk_lama: (prevDone && prevDone.nomor_surat) || '',
            tanggal_sk_lama: (prevDone && prevDone.tanggal_surat) || '',
            tmt_lama: (prevDone && prevDone.tmt_baru) || userRef.tmt_kgb || '',
            tahun_lama: (prevDone && prevDone.tahun_baru) || '',
            bulan_lama: (prevDone && prevDone.bulan_baru) || '0',
            mkg_lama: (prevDone && prevDone.mkg_baru) || '',
            tmt_baru: (prevDone && prevDone.tmt_yad) || userRef.tmt_kgb || '',
            status: 'Sedang Diproses',
            is_from_dashboard: true,
            tanggal_input: dateNow
          };
          await TranskepFirebase.saveKgbToFirestore(newDraft);
        }
      } else if (newStatus === 'Selesai') {
        // PROMOSIKAN & SIMPAN PERMANEN DI E-OFFICE (TIDAK BOLEH DIHAPUS!)
        const baseRecord = activeDoc || {
          nip: targetNip,
          nama_pegawai: userRef.nama || '',
          pangkat: userRef.pangkat || '',
          golongan: userRef.golongan || '',
          jabatan: userRef.jabatan || '',
          tmt_lama: userRef.tmt_kgb || '',
          tmt_baru: userRef.tmt_kgb || '',
          tanggal_input: dateNow
        };

        const oldId = String(baseRecord.id_kgb || '');
        const permanentId = (!oldId || oldId.startsWith('DRAFT-'))
          ? this.buildPermanentKgbId(targetNip, baseRecord.tmt_baru || userRef.tmt_kgb || dateNow)
          : oldId;

        const completedRecord = {
          ...baseRecord,
          id_kgb: permanentId,
          status: 'Selesai',
          tgl_selesai: dateNow,
          is_from_dashboard: false,
          updated_at: new Date().toISOString()
        };

        await TranskepFirebase.saveKgbToFirestore(completedRecord);

        // Bersihkan key sementara DRAFT-{nip} hanya jika sudah dipromosikan ke permanentId
        if (oldId && oldId.startsWith('DRAFT-') && oldId !== permanentId) {
          await TranskepFirebase.deleteKgbFromFirestore(oldId).catch(() => { });
        }
      } else if (newStatus === 'Menunggu') {
        // Batal antrean: hanya hapus draf sementara DRAFT-{nip}, JANGAN sentuh arsip Selesai
        await TranskepFirebase.deleteKgbFromFirestore('DRAFT-' + targetNip).catch(() => { });
      }
    } catch (err) {
      console.warn("⚠️ [E-Office] Sinkronisasi status KGB Dashboard -> Firestore notice:", err);
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
      if (k && (k.id_kgb || k.nip)) {
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

      const kgbData = {
        ...payload,
        id_kgb: docId,
        status: targetStatus,
        is_from_dashboard: false,
        created_by: creatorNip,
        tanggal_input: payload.tanggal_input || new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      };

      // 1. Simpan langsung ke Cloud Firestore
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

      // Catatan: Database KGB telah 100% pindah ke Cloud Firestore. Inputan baru tidak dimasukkan lagi ke Google Sheets.

      return {
        status: 'success',
        message: actionType === 'tte'
          ? 'Berkas KGB berhasil dikirim ke antrean persiapan TTE Pimpinan!'
          : 'Data KGB berhasil disimpan ke Cloud Firestore.',
        id_kgb: docId,
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
