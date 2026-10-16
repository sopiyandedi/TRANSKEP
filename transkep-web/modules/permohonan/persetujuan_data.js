// ==========================================
// FILE: persetujuan_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Kotak Persetujuan & Verifikasi Atasan
// FITUR: Update Status Cuti/IK/IP/WFH, Process Bulk Approval
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const PersetujuanDataService = {
  /**
   * Memperbarui status persetujuan permohonan Cuti
   * @param {string|number} logId - ID Log Cuti
   * @param {string} decision - Keputusan ('Disetujui' / 'Ditolak')
   * @param {string} notes - Catatan pertimbangan atasan/pejabat
   * @param {string} nip - NIP pejabat penandatangan / pemeriksa
   * @param {string|null} bypassMode - Mode bypass hak akses ('atasan' / 'pejabat' / null)
   * @param {string} token - Token sesi otentikasi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateCutiStatus(logId, decision, notes, nip, bypassMode, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateCutiStatus(logId, decision, notes, nip, bypassMode, authToken);
    });
  },

  /**
   * Memperbarui status persetujuan Izin Keluar Kantor (IK)
   * @param {string|number} logId - ID Log IK
   * @param {string} decision - Keputusan ('Disetujui' / 'Ditolak')
   * @param {string} notes - Catatan pertimbangan atasan
   * @param {string} nip - NIP pemeriksa
   * @param {string|null} bypassMode - Mode bypass
   * @param {string} token - Token sesi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateIkStatus(logId, decision, notes, nip, bypassMode, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateIkStatus(logId, decision, notes, nip, bypassMode, authToken);
    });
  },

  /**
   * Memperbarui status persetujuan Izin Pribadi (IP)
   * @param {string|number} logId - ID Log IP
   * @param {string} decision - Keputusan ('Disetujui' / 'Ditolak')
   * @param {string} notes - Catatan pertimbangan
   * @param {string} nip - NIP pemeriksa
   * @param {string|null} bypassMode - Mode bypass
   * @param {string} token - Token sesi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateIpStatus(logId, decision, notes, nip, bypassMode, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateIpStatus(logId, decision, notes, nip, bypassMode, authToken);
    });
  },

  /**
   * Memperbarui status persetujuan Work From Home (WFH)
   * @param {string|number} logId - ID Log WFH
   * @param {string} stage - Tahap verifikasi ('Rencana' / 'Laporan')
   * @param {string} decision - Keputusan ('Disetujui' / 'Ditolak')
   * @param {string} notes - Catatan pertimbangan
   * @param {string} nip - NIP pemeriksa
   * @param {string|null} bypassMode - Mode bypass
   * @param {string} token - Token sesi
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateWfhStatus(logId, stage, decision, notes, nip, bypassMode, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateWfhStatus(logId, stage, decision, notes, nip, bypassMode, authToken);
    });
  },

  /**
   * Memproses persetujuan massal (bulk approval)
   * @param {Array<Object>} items - Array of { id, type, stage }
   * @param {string} decision - Keputusan massal ('Disetujui' / 'Ditolak')
   * @param {string} notes - Catatan massal
   * @param {string} nip - NIP pemroses
   * @param {string|null} bypassMode - Mode bypass
   * @param {string} token - Token sesi
   * @returns {Promise<Object>} Respon { status, message }
   */
  processBulkApproval(items, decision, notes, nip, bypassMode, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .processBulkApproval(items, decision, notes, nip, bypassMode, authToken);
    });
  }
};

// Global export window
if (typeof window !== 'undefined') {
  window.PersetujuanDataService = PersetujuanDataService;
}
