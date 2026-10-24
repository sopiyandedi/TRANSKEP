// ==========================================
// FILE: jobdes_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Uraian Tugas (Job Description)
// FITUR: RPC Save Jobdes, Save Usulan, Get Usulan, Tandai Selesai, Create PDF
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const JobdesDataService = {
  /**
   * Menyimpan pembaruan uraian tugas pegawai
   * @param {Object} payload - Data ikhtisar, tugas pokok, tambahan, dll
   * @param {string} userNip - NIP pengedit
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  saveJobdes(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveJobdes(payload, userNip, authToken);
    });
  },

  /**
   * Menyimpan usulan reposisi / revisi uraian tugas dari pegawai
   * @param {Object} payload - Data usulan
   * @param {string} userNip - NIP pengusul
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  saveUsulan(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveUsulanReposisi(payload, userNip, authToken);
    });
  },

  /**
   * Mengambil daftar usulan reposisi yang menunggu verifikasi admin
   * @param {string} userNip - NIP admin
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array>} Daftar usulan
   */
  getUsulanMenunggu(userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res || []))
        .withFailureHandler((err) => reject(err))
        .getUsulanMenunggu(userNip, authToken);
    });
  },

  /**
   * Menandai usulan reposisi telah diproses / selesai
   * @param {string|number} id - ID usulan
   * @param {string} userNip - NIP admin
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  tandaiUsulanSelesai(id, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .tandaiUsulanSelesai(id, userNip, authToken);
    });
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
