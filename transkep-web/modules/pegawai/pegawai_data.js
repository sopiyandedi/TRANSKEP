// ==========================================
// FILE: pegawai_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Manajemen Pegawai
// FITUR: RPC Add/Update Pegawai, Delete Pegawai, Import Bulk, Reset Password Queue
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const PegawaiDataService = {
  /**
   * Menyimpan akun pegawai baru atau pembaruan profil pegawai
   * @param {Object} payload - Data formulir pegawai
   * @param {string} mode - 'add' untuk tambah baru, 'edit' untuk pembaruan
   * @param {string} adminNip - NIP admin yang mengeksekusi
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  savePegawai(payload, mode, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      const runner = google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err));

      if (mode === 'add') {
        runner.addUser(payload, adminNip, authToken);
      } else {
        runner.updateUser(payload, adminNip, authToken);
      }
    });
  },

  /**
   * Menghapus akun pegawai secara permanen
   * @param {string} nip - NIP pegawai yang akan dihapus
   * @param {string} adminNip - NIP admin yang mengeksekusi
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  deletePegawai(nip, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteUser(nip, adminNip, authToken);
    });
  },

  /**
   * Mengimpor data pegawai massal dari file Excel (JSON array)
   * @param {Array<Object>} jsonArray - Data baris Excel
   * @param {string} adminNip - NIP admin yang mengeksekusi
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  importBulkPegawai(jsonArray, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .importBulkUsers(jsonArray, adminNip, authToken);
    });
  },

  /**
   * Mengambil antrean permintaan reset password mandiri dari pegawai
   * @param {string} adminNip - NIP admin yang mengeksekusi
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array>} Daftar antrean reset password
   */
  getResetQueue(adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res || []))
        .withFailureHandler((err) => reject(err))
        .getResetPasswordQueue(adminNip, authToken);
    });
  },

  /**
   * Menandai permintaan reset password telah selesai diproses
   * @param {string|number} queueId - ID antrean
   * @param {string} adminNip - NIP admin yang mengeksekusi
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, message }
   */
  markResetDone(queueId, adminNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .markResetAsDone(queueId, adminNip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.PegawaiDataService = PegawaiDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PegawaiDataService };
}
