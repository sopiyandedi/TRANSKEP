// ==========================================
// FILE: dashboard_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Dashboard & Monitoring TMT
// FITUR: RPC Forward TMT Date (Auto-forward) & Update TMT Status Berkas
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const DashboardDataService = {
  /**
   * Auto-forward tanggal berkas TMT pegawai berikutnya ke database
   * @param {string} adminNip - NIP Admin/Operator yang memicu auto-forward
   * @param {string} targetNip - NIP Pegawai target
   * @param {string} type - Jenis TMT ('KGB', 'Pangkat', 'Pensiun')
   * @param {string} newDateStr - Tanggal TMT baru terformat YYYY-MM-DD
   * @param {string} [token] - Token sesi aktif (opsional, auto-resolve jika kosong)
   * @returns {Promise<Object>} Respon server { status, message }
   */
  forwardTmtDate(adminNip, targetNip, type, newDateStr, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_session_token') || localStorage.getItem('transkep_token')) : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .forwardTmtDateByFrontend(adminNip, targetNip, type, newDateStr, authToken);
    });
  },

  /**
   * Memperbarui status proses berkas TMT (Menunggu, Proses, Selesai) dan auto-forward ke antrean E-Office
   * @param {string} adminNip - NIP Admin/Operator
   * @param {string} targetNip - NIP Pegawai target
   * @param {string} typeStr - Jenis TMT ('KGB', 'Pangkat', 'Pensiun')
   * @param {string} newStatus - Status baru ('Menunggu', 'Proses', 'Selesai')
   * @param {string} [token] - Token sesi aktif (opsional, auto-resolve jika kosong)
   * @returns {Promise<Object>} Respon server { status, message }
   */
  updateTmtStatus(adminNip, targetNip, typeStr, newStatus, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_session_token') || localStorage.getItem('transkep_token')) : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateTmtStatus(adminNip, targetNip, typeStr, newStatus, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.DashboardDataService = DashboardDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DashboardDataService };
}
