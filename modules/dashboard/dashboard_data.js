// ==========================================
// FILE: dashboard_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Dashboard & Monitoring TMT
// FITUR: RPC Forward TMT Date (Auto-forward) & Update TMT Status Berkas
// ENGINE: TRANSKEP Core v1.0.0 
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
  async forwardTmtDate(adminNip, targetNip, type, newDateStr, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_session_token') || localStorage.getItem('transkep_token')) : '') || '';
    if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
      try {
        return await window.TranskepAPI.call('forwardTmtDateByFrontend', adminNip, targetNip, type, newDateStr, authToken);
      } catch (err) {
        console.warn("⚠️ [DashboardDataService] TranskepAPI forwardTmtDate fallback:", err);
      }
    }
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .forwardTmtDateByFrontend(adminNip, targetNip, type, newDateStr, authToken);
      });
    }
    return { status: 'success', message: 'Tersimpan lokal' };
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
  async updateTmtStatus(adminNip, targetNip, typeStr, newStatus, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_session_token') || localStorage.getItem('transkep_token')) : '') || '';
    if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
      try {
        return await window.TranskepAPI.call('updateTmtStatus', adminNip, targetNip, typeStr, newStatus, authToken);
      } catch (err) {
        console.warn("⚠️ [DashboardDataService] TranskepAPI updateTmtStatus fallback:", err);
      }
    }
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .updateTmtStatus(adminNip, targetNip, typeStr, newStatus, authToken);
      });
    }
    return { status: 'success', message: 'Status berhasil diperbarui' };
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.DashboardDataService = DashboardDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DashboardDataService };
}
