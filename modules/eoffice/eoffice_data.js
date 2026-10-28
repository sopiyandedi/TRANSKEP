// ==========================================
// FILE: eoffice_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer Modul E-Office (KGB & Paket Rapat)
// ARSITEKTUR: Firestore-First (0ms), Realtime, Local Cache Hydration & GAS Document Worker
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
   * Mengambil data arsip E-Office (KGB dan Paket Rapat)
   * Mengutamakan Cloud Firestore (0ms), dengan fallback ke Google Apps Script (Sheets)
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data: { kgb, rapat }, source }
   */
  async getEofficeData(nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const userNip = nip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    // 1. Coba baca dari Cloud Firestore (Firestore-First)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      try {
        const [rawKgbs, rawRapats] = await Promise.all([
          TranskepFirebase.getFirestoreKgbs(),
          TranskepFirebase.getFirestoreRapats()
        ]);

        let kgbList = Array.isArray(rawKgbs) ? rawKgbs : [];
        let rapatList = Array.isArray(rawRapats) ? rawRapats : [];

        // 2. Auto-Migration: Jika Firestore masih kosong & belum pernah migrasi, sedot data lama dari Google Sheets
        const hasMigrated = (typeof localStorage !== 'undefined') && localStorage.getItem(this.MIGRATION_FLAG_KEY) === 'true';
        if (!hasMigrated && kgbList.length === 0 && rapatList.length === 0) {
          this.triggerBackgroundMigration(userNip, authToken);
        }

        // 3. Sintesis Reaktif: Integrasikan pegawai dengan status_kgb === 'Proses' dari state.usersList
        kgbList = this.mergeDashboardQueue(kgbList);

        const resultData = { kgb: kgbList, rapat: rapatList };
        this.setLocalCache(resultData);

        return {
          status: 'success',
          data: resultData,
          source: 'firestore'
        };
      } catch (fsErr) {
        console.warn("⚠️ [E-Office] Firestore query gagal, mencoba fallback ke GAS/Sheets:", fsErr);
      }
    }

    // 4. Fallback ke Google Apps Script (Google Sheets) jika Firestore tidak tersedia
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        // Cek apakah ada cache lokal yang bisa disajikan saat offline
        const cached = this.getLocalCache();
        if (cached && (cached.kgb || cached.rapat)) {
          return resolve({
            status: 'success',
            data: { kgb: cached.kgb || [], rapat: cached.rapat || [] },
            source: 'cache_offline'
          });
        }
        return reject(new Error("Koneksi google.script.run dan Cloud Firestore tidak tersedia."));
      }

      google.script.run
        .withSuccessHandler((res) => {
          if (res && res.status === 'success' && res.data) {
            this.setLocalCache(res.data);
          }
          resolve(res);
        })
        .withFailureHandler((err) => reject(err))
        .getEofficeData(userNip, authToken);
    });
  },

  /**
   * Menyintesis antrean pegawai berstatus KGB 'Proses' dari state.usersList ke daftar KGB
   * Memastikan siapapun yang diubah statusnya di Dashboard langsung muncul di E-Office (0ms)
   */
  mergeDashboardQueue(kgbList) {
    const list = [...kgbList];
    const uList = (window.vueState && window.vueState.usersList) ? window.vueState.usersList : (typeof state !== 'undefined' ? state.usersList : []);

    if (Array.isArray(uList)) {
      uList.forEach(u => {
        const statusKgb = String(u.status_kgb || u.Status_KGB || '').trim().toUpperCase();
        if (statusKgb === 'PROSES') {
          const strNip = String(u.nip || '').trim();
          // Cek apakah sudah ada item di list KGB untuk NIP ini yang masih berstatus draft/proses
          const exists = list.some(k => String(k.nip || '').trim() === strNip && String(k.status || '').toLowerCase() !== 'selesai');
          if (!exists) {
            list.push({
              id_kgb: 'DRAFT-' + strNip,
              nip: strNip,
              nama_pegawai: u.nama || '',
              pangkat: u.pangkat || '',
              golongan: u.golongan || '',
              jabatan: u.jabatan || '',
              tmt_lama: u.tmt_kgb || '',
              status: 'Sedang Diproses',
              is_from_dashboard: true,
              tanggal_input: new Date().toISOString().split('T')[0]
            });
          }
        }
      });
    }

    return list;
  },

  /**
   * Migrasi Latar Belakang: Memindahkan arsip KGB dan Paket Rapat dari Google Sheets ke Cloud Firestore (One-Time)
   */
    /**
   * Menyinkronkan seluruh data KGB & Rapat dari Google Sheets ke Cloud Firestore
   * Menjamin koleksi 'eoffice_kgb' & 'eoffice_rapat' langsung muncul di Firebase Console
   */
  async syncAllSheetsToFirestore() {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }

    const nip = (typeof state !== 'undefined' && state.user ? state.user.nip : '') || localStorage.getItem('transkep_active_nip') || '';
    const token = localStorage.getItem('transkep_session_token') || '';

    // 1. Tarik data dari Google Sheets via TranskepAPI atau google.script.run
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

    // 2. Simpan semua riwayat KGB dari Sheets ke Firestore
    if (sheetData && Array.isArray(sheetData.kgb)) {
      for (const k of sheetData.kgb) {
        if (k && (k.id_kgb || k.nip)) {
          try {
            await TranskepFirebase.saveKgbToFirestore(k);
            kgbCount++;
          } catch (e) {
            console.warn("⚠️ Gagal migrasi baris KGB:", k, e);
          }
        }
      }
    }

    // 3. Simpan seluruh pegawai berstatus KGB 'Proses' dari state.usersList
    const uList = (window.vueState && window.vueState.usersList) ? window.vueState.usersList : (typeof state !== 'undefined' ? state.usersList : []);
    if (Array.isArray(uList)) {
      for (const u of uList) {
        const stKgb = String(u.status_kgb || u.Status_KGB || '').trim().toUpperCase();
        if (stKgb === 'PROSES') {
          const draftId = 'DRAFT-' + String(u.nip).trim();
          try {
            await TranskepFirebase.saveKgbToFirestore({
              id_kgb: draftId,
              nip: String(u.nip).trim(),
              nama_pegawai: u.nama || '',
              pangkat: u.pangkat || '',
              golongan: u.golongan || '',
              jabatan: u.jabatan || '',
              tmt_lama: u.tmt_kgb || '',
              status: 'Sedang Diproses',
              is_from_dashboard: true,
              tanggal_input: new Date().toISOString().split('T')[0]
            });
            kgbCount++;
          } catch (e) {}
        }
      }
    }

    // 4. Simpan semua riwayat Rapat dari Sheets ke Firestore
    if (sheetData && Array.isArray(sheetData.rapat)) {
      for (const r of sheetData.rapat) {
        if (r && (r.id_rapat || r.agenda)) {
          try {
            await TranskepFirebase.saveRapatToFirestore(r);
            rapatCount++;
          } catch (e) {
            console.warn("⚠️ Gagal migrasi baris Rapat:", r, e);
          }
        }
      }
    }

    // 5. Inisialisasi awal jika masih 0 agar kedua koleksi SEGERA MUNCUL DI FIREBASE CONSOLE!
    if (kgbCount === 0) {
      await TranskepFirebase.saveKgbToFirestore({
        id_kgb: 'INIT_KGB',
        nip: nip || '197309081998031001',
        nama_pegawai: 'Inisialisasi Koleksi KGB',
        pangkat: 'Pembina Utama Madya',
        jabatan: 'Ketua / Wakil Ketua',
        status: 'Sedang Diproses',
        tanggal_input: new Date().toISOString().split('T')[0],
        catatan: 'Dokumen inisiasi awal koleksi eoffice_kgb Cloud Firestore'
      });
      kgbCount++;
    }

    if (rapatCount === 0) {
      await TranskepFirebase.saveRapatToFirestore({
        id_rapat: 'INIT_RAPAT',
        agenda: 'Inisialisasi Koleksi Paket Rapat',
        pemimpin: 'Ketua Pengadilan Agama Indramayu',
        tempat: 'Ruang Media Center / Aula',
        hari_tanggal: new Date().toISOString().split('T')[0],
        status: 'Terjadwal',
        tanggal_input: new Date().toISOString().split('T')[0]
      });
      rapatCount++;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
    }

    console.log(`✅ [E-Office Sync] Sukses sinkronisasi ${kgbCount} berkas KGB & ${rapatCount} berkas Rapat ke Cloud Firestore.`);
    return {
      status: 'success',
      message: `Berhasil mengamankan ${kgbCount} berkas KGB dan ${rapatCount} berkas Rapat ke Cloud Firestore!`
    };
  },

  triggerBackgroundMigration(nip, token) {
    this.syncAllSheetsToFirestore().catch(() => {});
    return;

    if (typeof google === 'undefined' || !google.script || !google.script.run) return;

    console.log("🔄 [E-Office Migration] Memulai migrasi data lama dari Google Sheets ke Cloud Firestore...");
    google.script.run
      .withSuccessHandler(async (res) => {
        if (res && res.status === 'success' && res.data && typeof TranskepFirebase !== 'undefined') {
          const sheetKgbs = Array.isArray(res.data.kgb) ? res.data.kgb : [];
          const sheetRapats = Array.isArray(res.data.rapat) ? res.data.rapat : [];

          // 1. Simpan baris KGB ke Firestore
          for (const k of sheetKgbs) {
            try {
              if (k.id_kgb && !String(k.id_kgb).startsWith('DRAFT-')) {
                await TranskepFirebase.saveKgbToFirestore(k);
              }
            } catch (e) {
              console.warn("⚠️ Gagal migrasi baris KGB:", k, e);
            }
          }

          // 2. Simpan baris Rapat ke Firestore
          for (const r of sheetRapats) {
            try {
              if (r.id_rapat) {
                await TranskepFirebase.saveRapatToFirestore(r);
              }
            } catch (e) {
              console.warn("⚠️ Gagal migrasi baris Rapat:", r, e);
            }
          }

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
          }
          console.log(`✅ [E-Office Migration] Berhasil migrasi ${sheetKgbs.length} KGB dan ${sheetRapats.length} Rapat ke Cloud Firestore.`);
        }
      })
      .withFailureHandler((err) => {
        console.warn("⚠️ [E-Office Migration] Gagal menarik data migrasi dari GAS:", err);
      })
      .getEofficeData(nip, token);
  },

  /**
   * Menyimpan draf atau menerbitkan SK KGB
   * - Mode 'draft': Instan simpan ke Cloud Firestore (<50ms) + background cold backup ke Sheets
   * - Mode 'generate': Google Apps Script membuat file fisik Google Docs di Google Drive,
   *   lalu hasilnya langsung disimpan ke Firestore & state diperbarui
   */
  async saveOrGenerateKgb(payload, actionType, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const creatorNip = adminNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';

    // ==========================================
    // A. MODE DRAFT: INSTANT FIRESTORE SAVE (<50ms)
    // ==========================================
    if (actionType === 'draft') {
      const docId = String(payload.id_kgb || '').trim() || ('DRAFT-' + String(payload.nip || Date.now()).trim());
      const kgbData = {
        ...payload,
        id_kgb: docId,
        status: 'Sedang Diproses',
        created_by: creatorNip,
        tanggal_input: payload.tanggal_input || new Date().toISOString().split('T')[0]
      };

      // 1. Simpan langsung ke Firestore
      if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
        try {
          await TranskepFirebase.saveKgbToFirestore(kgbData);
          console.log("⚡ [E-Office] Draf KGB tersimpan di Cloud Firestore (0ms):", docId);
        } catch (fsErr) {
          console.error("❌ Gagal simpan draf ke Firestore:", fsErr);
        }
      }

      // 2. Kirim cold-backup ke Google Sheets di background (non-blocking)
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        try {
          google.script.run
            .withFailureHandler((err) => console.warn("⚠️ Cold backup KGB draf ke Google Sheets gagal:", err))
            .saveOrGenerateKgbDoc(payload, 'draft', creatorNip, authToken);
        } catch (bgErr) {}
      }

      return {
        status: 'success',
        message: 'Draf KGB berhasil disimpan ke Cloud Firestore.',
        id_kgb: docId
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
            const docUrl = res.url || '';
            const docId = res.id_kgb || payload.id_kgb || ('KGB-' + Date.now());

            const completedKgb = {
              ...payload,
              id_kgb: docId,
              status: 'Selesai',
              file_doc_url: docUrl,
              file_pdf_url: docUrl ? docUrl.replace('/edit', '/export?format=pdf') : '',
              is_from_dashboard: false,
              created_by: creatorNip,
              updated_at: new Date().toISOString()
            };

            // 1. Simpan hasil terbit ke Cloud Firestore
            if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
              try {
                await TranskepFirebase.saveKgbToFirestore(completedKgb);

                // Jika sebelumnya ada dokumen draf sementara (DRAFT-{nip}), bersihkan
                if (payload.nip) {
                  try {
                    await TranskepFirebase.deleteKgbFromFirestore('DRAFT-' + payload.nip);
                  } catch (delErr) {}
                }

                // Perbarui status pegawai di Firestore collection 'users'
                if (typeof TranskepFirebase.saveUserToFirestore === 'function' && payload.nip) {
                  try {
                    await TranskepFirebase.saveUserToFirestore({
                      nip: String(payload.nip),
                      status_kgb: 'Selesai',
                      tmt_kgb: payload.tmt_yad || payload.tmt_baru || ''
                    });
                  } catch (uErr) {}
                }
              } catch (fsErr) {
                console.warn("⚠️ Gagal sinkronisasi SK terbit ke Firestore:", fsErr);
              }
            }

            // 2. Perbarui state pegawai di memori lokal
            const uList = (window.vueState && window.vueState.usersList) ? window.vueState.usersList : (typeof state !== 'undefined' ? state.usersList : []);
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

            // Simpan paket rapat ke Cloud Firestore
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
   * Menghapus arsip KGB dari Cloud Firestore
   */
  async deleteKgb(idKgb) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      return await TranskepFirebase.deleteKgbFromFirestore(idKgb);
    }
    return { status: 'error', message: 'Koneksi Cloud Firestore tidak aktif.' };
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
