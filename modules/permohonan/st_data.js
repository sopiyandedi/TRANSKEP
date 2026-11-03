// ==========================================
// FILE: st_data.js (TRANSKEP Modular - TAHAP 77)
// DESKRIPSI: Data Service Layer khusus Modul Surat Tugas (ST, SPD & Plh)
// FITUR: High-Speed Cloud Firestore Database + Cold Sheets Backup + Realtime Sync
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const StDataService = {
  _hasSubscribed: false,

  /**
   * Mengambil pengaturan baku Surat Tugas (menimbang, dasar, instansi, mata anggaran, angkutan, biaya, PPK)
   * @returns {Promise<Object>} Respon { status, data: { menimbang, dasar, instansi, mata_anggaran, angkutan, paragraf_biaya, ppk } }
   */
  getSettings() {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getSettingsST();
    });
  },

  /**
   * Menerbitkan Surat Tugas, SPD, dan Plh baru
   * Menggunakan Cloud Firestore untuk kecepatan instan (<200ms) dengan Cold Backup ke Sheets di latar belakang
   * @param {Object} payload - Objek data formulir ST lengkap
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message, id }
   */
  addSuratTugas(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const idST = payload.id_st || ("ST-" + Date.now() + Math.floor(Math.random() * 1000));

    // PILAR UTAMA: Cloud Firestore (High-Speed Engine <200ms)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      const stObj = {
        id: idST,
        nomor: payload.nomor_surat || '',
        menimbang: payload.menimbang || '',
        dasar: payload.dasar || '',
        tujuan: payload.tujuan || '',
        tempat: payload.tempat || '',
        tgl_mulai: payload.tgl_mulai || '',
        tgl_selesai: payload.tgl_selesai || '',
        jam: payload.jam || '',
        pejabat_ttd: payload.pejabat_ttd || '',
        peserta: payload.peserta_json || '[]',
        data_ekstra: payload.data_ekstra_json || '{}',
        status: 'DISETUJUI',
        is_firebase: true
      };

      return TranskepFirebase.saveSuratTugasToFirestore(stObj)
        .then((res) => {
          // Cold Backup di Latar Belakang (Sheets tetap terarsip tanpa memperlambat antarmuka)
          if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
              .withSuccessHandler(() => {})
              .withFailureHandler(err => console.warn("[StDataService] Gagal cold backup ke Sheets:", err))
              .addSuratTugas({ ...payload, id_st: idST }, nip, authToken);
          }
          return { status: 'success', message: 'Surat Tugas berhasil diterbitkan.', id: idST };
        })
        .catch((err) => {
          console.warn("[StDataService] Firestore error, fallback ke GAS Sheets:", err);
          return new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.script || !google.script.run) return reject(err);
            google.script.run
              .withSuccessHandler((r) => resolve(r))
              .withFailureHandler((e) => reject(e))
              .addSuratTugas(payload, nip, authToken);
          });
        });
    }

    // Fallback standard Google Apps Script
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .addSuratTugas(payload, nip, authToken);
    });
  },

  /**
   * Memperbarui data Surat Tugas yang diedit
   * Menggunakan Cloud Firestore untuk update seketika (<200ms) dengan Cold Backup ke Sheets
   * @param {Object} payload - Objek data formulir ST lengkap dengan id_st
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateSuratTugas(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const idST = payload.id_st || payload.id;

    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      const stObj = {
        id: idST,
        nomor: payload.nomor_surat || '',
        menimbang: payload.menimbang || '',
        dasar: payload.dasar || '',
        tujuan: payload.tujuan || '',
        tempat: payload.tempat || '',
        tgl_mulai: payload.tgl_mulai || '',
        tgl_selesai: payload.tgl_selesai || '',
        jam: payload.jam || '',
        pejabat_ttd: payload.pejabat_ttd || '',
        peserta: payload.peserta_json || '[]',
        data_ekstra: payload.data_ekstra_json || '{}',
        status: 'DISETUJUI',
        is_firebase: true
      };

      return TranskepFirebase.saveSuratTugasToFirestore(stObj)
        .then(() => {
          if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
              .withSuccessHandler(() => {})
              .withFailureHandler(err => console.warn("[StDataService] Gagal cold backup update ke Sheets:", err))
              .updateSuratTugas(payload, nip, authToken);
          }
          return { status: 'success', message: 'Data Surat Tugas berhasil diperbarui secara permanen.' };
        })
        .catch((err) => {
          console.warn("[StDataService] Firestore error, fallback ke GAS Sheets:", err);
          return new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.script || !google.script.run) return reject(err);
            google.script.run
              .withSuccessHandler((r) => resolve(r))
              .withFailureHandler((e) => reject(e))
              .updateSuratTugas(payload, nip, authToken);
          });
        });
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateSuratTugas(payload, nip, authToken);
    });
  },

  /**
   * Menyimpan konfigurasi baku default Surat Tugas
   * @param {Object} formSetting - Objek setting baku ST
   * @param {string} nip - NIP admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  saveSettings(formSetting, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveSettingsST(formSetting, nip, authToken);
    });
  },

  /**
   * Menghapus log Surat Tugas beserta seluruh data rombongan terkait
   * Menghapus dari Cloud Firestore seketika (<200ms) dengan Cold Sync penghapusan ke Sheets
   * @param {string|number} id - ID Surat Tugas
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteSuratTugasLog(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      return TranskepFirebase.deleteSuratTugasFromFirestore(id)
        .then(() => {
          if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
              .withSuccessHandler(() => {})
              .withFailureHandler(err => console.warn("[StDataService] Gagal cold backup delete ke Sheets:", err))
              .deleteSuratTugasLog(id, nip, authToken);
          }
          return { status: 'success', message: 'Surat Tugas berhasil dihapus permanen.' };
        })
        .catch((err) => {
          console.warn("[StDataService] Firestore error, fallback ke GAS Sheets:", err);
          return new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.script || !google.script.run) return reject(err);
            google.script.run
              .withSuccessHandler((r) => resolve(r))
              .withFailureHandler((e) => reject(e))
              .deleteSuratTugasLog(id, nip, authToken);
          });
        });
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteSuratTugasLog(id, nip, authToken);
    });
  },

  /**
   * Menginisialisasi Real-time Synchronization Firestore untuk Surat Tugas (Zero UI / Otomatis)
   */
  initRealtimeSync() {
    if (this._hasSubscribed) return;
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      this._hasSubscribed = true;
      console.log("🔥 [TRANSKEP ST] Menghubungkan listener realtime Firestore Surat Tugas...");
      
      TranskepFirebase.subscribeFirestoreSuratTugas((list) => {
        if (!Array.isArray(list)) return;

        const currentList = (typeof state !== 'undefined' && state.stList) || (window.vueState && window.vueState.stList) || [];
        
        // Auto-migrasi data Sheets ke Firestore jika Firestore masih kosong (berjalan di background tanpa tombol)
        if (list.length === 0 && currentList.length > 0) {
          TranskepFirebase.syncLegacySuratTugasToFirestore(currentList);
          return;
        }

        // Merge dokumen Firestore dengan memori lokal
        const map = new Map();
        currentList.forEach(item => {
          if (item && item.id) map.set(String(item.id), item);
        });

        list.forEach(fSt => {
          if (fSt && fSt.id) {
            map.set(String(fSt.id), { ...fSt, is_firebase: true });
          }
        });

        const merged = Array.from(map.values());
        
        // Sort descending berdasarkan timestamp/ID
        merged.sort((a, b) => {
          const tA = a.created_at ? (a.created_at.seconds ? a.created_at.seconds * 1000 : new Date(a.created_at).getTime()) : (parseInt(String(a.id).replace(/\D/g, ''), 10) || 0);
          const tB = b.created_at ? (b.created_at.seconds ? b.created_at.seconds * 1000 : new Date(b.created_at).getTime()) : (parseInt(String(b.id).replace(/\D/g, ''), 10) || 0);
          return tB - tA;
        });

        if (typeof state !== 'undefined') state.stList = merged;
        if (window.vueState) window.vueState.stList = merged;
        console.log(`🔥 [TRANSKEP ST] Realtime Sync Aktif: ${merged.length} Surat Tugas tersinkron.`);
      });
    }
  }
};

// Global export window
if (typeof window !== 'undefined') {
  window.StDataService = StDataService;
  // Otomatis aktifkan listener saat script siap
  setTimeout(() => {
    if (typeof StDataService.initRealtimeSync === 'function') {
      StDataService.initRealtimeSync();
    }
  }, 1000);
}
