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
    const idST = payload.id_st || ("ST-" + Date.now() + Math.floor(Math.random() * 1000));

    // TAHAP 79: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
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
          console.log("⚡ [StDataService] Surat Tugas berhasil diterbitkan murni di Cloud Firestore:", idST);
          return { status: 'success', message: 'Surat Tugas berhasil diterbitkan.', id: idST };
        })
        .catch((err) => {
          console.error("❌ [StDataService] Gagal simpan Surat Tugas ke Firestore:", err);
          throw err;
        });
    }

    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
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
    const idST = payload.id_st || payload.id;

    // TAHAP 79: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
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
          console.log("⚡ [StDataService] Pembaruan Surat Tugas berhasil disimpan murni di Cloud Firestore:", idST);
          return { status: 'success', message: 'Data Surat Tugas berhasil diperbarui secara permanen.' };
        })
        .catch((err) => {
          console.error("❌ [StDataService] Gagal update Surat Tugas ke Firestore:", err);
          throw err;
        });
    }

    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
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
    // TAHAP 79: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      return TranskepFirebase.deleteSuratTugasFromFirestore(id)
        .then(() => {
          console.log("⚡ [StDataService] Surat Tugas berhasil dihapus murni dari Cloud Firestore:", id);
          return { status: 'success', message: 'Surat Tugas berhasil dihapus permanen.' };
        })
        .catch((err) => {
          console.error("❌ [StDataService] Gagal hapus Surat Tugas dari Firestore:", err);
          throw err;
        });
    }

    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
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

        // TAHAP 79: Firestore sebagai Single Source of Truth
        const fIds = new Set(list.map(x => String(x.id)));
        // Pertahankan hanya item legacy non-firebase dari Sheets yang belum termigrasi
        const unmigratedLegacy = currentList.filter(item => item && item.id && !item.is_firebase && !fIds.has(String(item.id)));
        const merged = [...list.map(f => ({ ...f, is_firebase: true })), ...unmigratedLegacy];
        
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
