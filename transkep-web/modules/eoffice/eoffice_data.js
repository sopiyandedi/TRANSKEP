// ==========================================
// FILE: eoffice_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul E-Office (KGB & Paket Rapat)
// FITUR: RPC Get E-Office Data, Save/Generate KGB Doc, Create Paket Rapat Docs
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const EofficeDataService = {
  /**
   * Mengambil data arsip E-Office (riwayat KGB dan Paket Rapat)
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, data: { kgb, rapat }, message }
   */
  getEofficeData(nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getEofficeData(nip, authToken);
    });
  },

  /**
   * Menyimpan draf atau menerbitkan SK Kenaikan Gaji Berkala (KGB) ke Google Docs
   * @param {Object} payload - Formulir data KGB lengkap
   * @param {string} actionType - 'generate' untuk terbitkan dokumen Google Docs, 'draft' untuk simpan draf
   * @param {string} adminNip - NIP pembuat/admin
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message, url }
   */
  saveOrGenerateKgb(payload, actionType, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveOrGenerateKgbDoc(payload, actionType, adminNip, authToken);
    });
  },

  /**
   * Menerbitkan paket dokumen rapat 3-in-1 (Undangan, Absen, Notulen) ke Google Docs
   * @param {Object} payload - Data agenda, peserta, tanggal, pembahasan, kesimpulan
   * @param {string} adminNip - NIP pembuat/admin
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, data: { doc_undangan_url, doc_absen_url, doc_notulen_url }, message }
   */
  createPaketRapat(payload, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .createPaketRapatDocs(payload, adminNip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.EofficeDataService = EofficeDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EofficeDataService };
}
