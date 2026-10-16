// ==========================================
// FILE: sk_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Surat Keputusan (SK)
// FITUR: PDF Validator & Reader, RPC Save/Delete/Acknowledge/Drive URL
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const SkDataService = {
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
   * Mengambil URL Folder Brankas Google Drive untuk Arsip SK
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
        .getSkDriveFolderUrl(userNip, authToken);
    });
  },

  /**
   * Menyimpan data SK baru atau pembaruan SK ke spreadsheet & Google Drive
   * @param {Object} payload - Data form SK, susunan tim members, dan fileBase64
   * @param {string} userNip - NIP pembuat/editor
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  saveSk(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .saveSk(payload, userNip, authToken);
    });
  },

  /**
   * Menghapus arsip SK dan seluruh catatan penugasan anggotanya
   * @param {string} id - ID Surat Keputusan
   * @param {string} userNip - NIP admin penghapus
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  deleteSk(id, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteSk(id, userNip, authToken);
    });
  },

  /**
   * Konfirmasi / Tanda Telah Membaca Tugas di dalam SK
   * @param {string} skId - ID SK
   * @param {string} nip - NIP pegawai yang membaca
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon server
   */
  acknowledgeSk(skId, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .acknowledgeSk(skId, nip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.SkDataService = SkDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SkDataService };
}
