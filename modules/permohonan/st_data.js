// ==========================================
// FILE: st_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Surat Tugas (ST, SPD & Plh)
// FITUR: Get Default Settings, Add/Update ST, Save ST Settings
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const StDataService = {
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
   * Menerbitkan Surat Tugas, SPD, dan Plh baru ke server
   * @param {Object} payload - Objek data formulir ST lengkap
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  addSuratTugas(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
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
   * @param {Object} payload - Objek data formulir ST lengkap dengan id_st
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateSuratTugas(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
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
   * @param {string|number} id - ID Surat Tugas
   * @param {string} nip - NIP pembuat/admin
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteSuratTugasLog(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteSuratTugasLog(id, nip, authToken);
    });
  }
};

// Global export window
if (typeof window !== 'undefined') {
  window.StDataService = StDataService;
}
