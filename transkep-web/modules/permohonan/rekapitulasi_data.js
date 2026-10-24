// ==========================================
// FILE: rekapitulasi_data.js (Data Service Layer - Rekapitulasi Riwayat Permohonan Global)
// Standard: TRANSKEP 3-Tier Architecture 
// Deskripsi: Mengelola seluruh komunikasi asynchronous RPC penghapusan dan pembatalan
//            riwayat permohonan ke backend Google Apps Script.
// ==========================================

window.RekapitulasiDataService = {
  /**
   * Pembatalan Cuti resmi dan pengembalian saldo cuti pegawai
   * @param {string|number} id - ID Cuti
   * @param {string} nip - NIP Operator/Admin atau Pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  deleteCuti(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .deleteCutiLog(id, true, nip, token);
    });
  },

  /**
   * Penghapusan dokumen Surat Tugas beserta seluruh rombongan peserta
   * @param {string|number} id - ID Surat Tugas
   * @param {string} nip - NIP Admin/Operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  deleteST(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .deleteSuratTugasLog(id, nip, token);
    });
  },

  /**
   * Penghapusan permanen riwayat log Izin Keluar Kantor (IK)
   * @param {string|number} id - ID Izin Keluar
   * @param {string} nip - NIP Admin/Operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  deleteIK(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .deleteIzinKeluarLog(id, true, nip, token);
    });
  },

  /**
   * Penghapusan permanen riwayat log Izin Pribadi (IP)
   * @param {string|number} id - ID Izin Pribadi
   * @param {string} nip - NIP Admin/Operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  deleteIP(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .deleteIzinPribadiLog(id, true, nip, token);
    });
  },

  /**
   * Penghapusan permanen riwayat log Work From Home (WFH)
   * @param {string|number} id - ID WFH
   * @param {string} nip - NIP Admin/Operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  deleteWFH(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .deleteWfhLog(id, true, nip, token);
    });
  },

  /**
   * Mengirimkan ulang notifikasi WhatsApp / Magic Link ke Atasan atau Pejabat
   * @param {string} id - ID Transaksi Cuti
   * @param {string} nip - NIP Admin/Operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<object>} Result status dan pesan dari backend
   */
  resendCutiWA(id, nip, token) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        return reject(new Error("Koneksi Google Apps Script (google.script.run) tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        .resendCutiWhatsApp(id, nip, token);
    });
  }
};
