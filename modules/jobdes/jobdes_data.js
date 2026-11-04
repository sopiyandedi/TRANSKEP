// ==========================================
// FILE: jobdes_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Uraian Tugas (Job Description)
// FITUR: RPC Save Jobdes, Save Usulan, Get Usulan, Tandai Selesai, Create PDF
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const JobdesDataService = {
  /**
   * Menyimpan pembaruan uraian tugas pegawai
   * Prioritas: Simpan instan ke Cloud Firestore (koleksi jobdes_documents)
   * Sinkronisasi background ke Google Spreadsheet
   */
  async saveJobdes(payload, userNip, token) {
    // TAHAP 80: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreRes = await TranskepFirebase.saveJobdesToFirestore({
          ...payload,
          updated_by: userNip || (typeof state !== 'undefined' && state.user ? state.user.nama : 'Admin'),
          is_firebase: true
        });
        console.log("⚡ [JobdesDataService] Jobdes tersimpan murni di Cloud Firestore:", payload.nip);
        return firestoreRes;
      } catch (err) {
        console.error("❌ [JobdesDataService] Gagal simpan ke Cloud Firestore:", err);
        throw err;
      }
    }
    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
  },

  /**
   * Menyimpan usulan reposisi / revisi uraian tugas dari pegawai
   */
  async saveUsulan(payload, userNip, token) {
    // TAHAP 80: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreRes = await TranskepFirebase.saveUsulanJobdesToFirestore(payload);
        console.log("⚡ [JobdesDataService] Usulan reposisi tersimpan murni di Cloud Firestore:", firestoreRes.id);
        return firestoreRes;
      } catch (err) {
        console.error("❌ [JobdesDataService] Gagal simpan usulan ke Cloud Firestore:", err);
        throw err;
      }
    }
    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
  },

  /**
   * Mengambil daftar usulan reposisi yang menunggu verifikasi admin
   */
  getUsulanMenunggu(userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return resolve([]);
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res || []))
        .withFailureHandler((err) => reject(err))
        .getUsulanMenunggu(userNip, authToken);
    });
  },

  /**
   * Menandai usulan reposisi telah diproses / selesai
   */
  async tandaiUsulanSelesai(id, userNip, token) {
    // TAHAP 80: Cloud Firestore Mandiri (Inputan ke Sheets Resmi Diputus)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const res = await TranskepFirebase.tandaiUsulanSelesaiInFirestore(id);
        console.log("⚡ [JobdesDataService] Usulan reposisi ditandai selesai murni di Cloud Firestore:", id);
        return res;
      } catch (e) {
        console.error("❌ [JobdesDataService] Gagal update status usulan di Firestore:", e);
        throw e;
      }
    }
    return Promise.reject(new Error("Koneksi Cloud Firestore tidak aktif."));
  },

  /**
   * Men-generate berkas PDF Uraian Tugas resmi dan mengunggahnya ke Google Drive
   * @param {string} printHTML - Dokumen HTML cetak lengkap
   * @param {string} fileName - Nama file PDF
   * @param {string} userNip - NIP pembuat
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, url, message }
   */
  createPdfJobdes(printHTML, fileName, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .createPdfJobdes(printHTML, fileName, userNip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.JobdesDataService = JobdesDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JobdesDataService };
}
