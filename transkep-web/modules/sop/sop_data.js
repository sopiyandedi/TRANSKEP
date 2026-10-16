// ==========================================
// FILE: sop_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Standar Operasional Prosedur (SOP)
// FITUR: PDF Validator & Reader, RPC Save/Delete/Acknowledge/Drive URL
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const SopDataService = {
  /**
   * Validasi dan Konversi File PDF lokal ke Base64 murni (Promise)
   * @param {File} file - Berkas file dari input/drop
   * @returns {Promise<{base64: string, file: File}>}
   */
  validateAndReadPdf(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error("Berkas file tidak ditemukan."));
      }
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return reject(new Error("Mohon maaf, sistem hanya menerima unggahan file berformat .PDF"));
      }
      const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
      if (file.size > MAX_SIZE) {
        return reject(new Error("Mohon perkecil (compress) file PDF Anda. Maksimal ukuran yang diizinkan adalah 10 MB."));
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Url = (e.target && e.target.result) ? e.target.result : '';
        const base64Data = base64Url.split(',')[1] || '';
        resolve({ base64: base64Data, file: file });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Mengambil URL Folder Brankas Google Drive untuk Arsip SOP
   * @param {string} userNip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server { status, url, message }
   */
  getDriveFolderUrl(userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getSopDriveFolderUrl(userNip, authToken);
    });
  },

  /**
   * Menyimpan data SOP baru atau pembaruan SOP ke spreadsheet & Google Drive
   * @param {Object} payload - Data form SOP, pelaksana, dan fileBase64
   * @param {string} userNip - NIP pembuat/editor
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  saveSop(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveSopData(payload, userNip, authToken);
    });
  },

  /**
   * Menghapus arsip SOP dan riwayat tanda baca dari pegawai
   * @param {string} id - ID SOP
   * @param {string} userNip - NIP admin penghapus
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  deleteSop(id, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteSopData(id, userNip, authToken);
    });
  },

  /**
   * Konfirmasi / Tanda Telah Membaca SOP oleh Pegawai Terlibat
   * @param {string} sopId - ID SOP
   * @param {string} nip - NIP pegawai yang membaca
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  acknowledgeSop(sopId, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .acknowledgeSop(sopId, nip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.SopDataService = SopDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SopDataService };
}
