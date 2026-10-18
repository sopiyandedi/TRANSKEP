// ==========================================
// FILE: cuti_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Permohonan Cuti & Riwayat
// FITUR: RPC Smart Routing, Add/Update Cuti, Delete Logs, Request Cancel, FileReader Base64
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// ==========================================

const CutiDataService = {
  /**
   * Membaca file berkas lampiran secara asinkron menjadi Base64
   * @param {File} file - Berkas file dari input type="file"
   * @returns {Promise<{fileData: string, fileName: string, fileMimeType: string}>}
   */
  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Berkas file tidak ditemukan."));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const base64Data = reader.result.split(',')[1];
          resolve({
            fileData: base64Data,
            fileName: file.name,
            fileMimeType: file.type
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Memindai ketersediaan atasan & pejabat dan melakukan routing dinamis otomatis
   * @param {string} atasanNip - NIP atasan langsung
   * @param {string} pejabatNip - NIP pejabat berwenang
   * @param {string} tglMulai - Tanggal mulai cuti (YYYY-MM-DD)
   * @param {string} tglSelesai - Tanggal selesai cuti (YYYY-MM-DD)
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data: { atasan_nip, pejabat_nip, pesan }, message }
   */
  getSmartRouting(atasanNip, pejabatNip, tglMulai, tglSelesai, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getSmartRouting(atasanNip, pejabatNip, tglMulai, tglSelesai, nip, authToken);
    });
  },

  /**
   * Mengirimkan pengajuan cuti baru
   * @param {Object} payload - Data form cuti lengkap beserta lampiran Base64
   * @param {string} nip - NIP pemohon / operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message, data }
   */
  addCutiLog(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .addCutiLog(payload, nip, authToken);
    });
  },

  /**
   * Memperbarui data permohonan cuti yang telah diajukan (mode edit)
   * @param {Object} payload - Data perubahan form cuti
   * @param {string} nip - NIP pemohon / operator
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message, data }
   */
  updateCutiLog(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateCutiLog(payload, nip, authToken);
    });
  },

  /**
   * Menarik / membatalkan pengajuan cuti (soft/hard delete)
   * @param {string|number} id - ID riwayat cuti
   * @param {boolean} isHard - Apakah penghapusan permanen
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteCutiLog(id, isHard = false, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const activeNip = nip || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip')) : '') || '';

    if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
      return TranskepAPI.call('deleteCutiLog', id, isHard, activeNip, authToken);
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi TranskepAPI / google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteCutiLog(id, isHard, activeNip, authToken);
    });
  },

  /**
   * Menarik / membatalkan pengajuan Izin Keluar Kantor
   * @param {string|number} id - ID riwayat IK
   * @param {boolean} isHard - Apakah penghapusan permanen
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteIzinKeluarLog(id, isHard = false, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const activeNip = nip || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip')) : '') || '';

    if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
      return TranskepAPI.call('deleteIzinKeluarLog', id, isHard, activeNip, authToken);
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi TranskepAPI / google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteIzinKeluarLog(id, isHard, activeNip, authToken);
    });
  },

  /**
   * Menarik / membatalkan pengajuan Izin Pribadi
   * @param {string|number} id - ID riwayat IP
   * @param {boolean} isHard - Apakah penghapusan permanen
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteIzinPribadiLog(id, isHard = false, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const activeNip = nip || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip')) : '') || '';

    if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
      return TranskepAPI.call('deleteIzinPribadiLog', id, isHard, activeNip, authToken);
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi TranskepAPI / google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteIzinPribadiLog(id, isHard, activeNip, authToken);
    });
  },

  /**
   * Menarik / membatalkan pengajuan WFH
   * @param {string|number} id - ID riwayat WFH
   * @param {boolean} isHard - Apakah penghapusan permanen
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  deleteWfhLog(id, isHard = false, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const activeNip = nip || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip')) : '') || '';

    if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
      return TranskepAPI.call('deleteWfhLog', id, isHard, activeNip, authToken);
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi TranskepAPI / google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .deleteWfhLog(id, isHard, activeNip, authToken);
    });
  },

  /**
   * Mengajukan pembatalan resmi surat cuti yang telah disahkan ke Pejabat Berwenang
   * @param {string|number} id - ID riwayat cuti
   * @param {string} alasan - Alasan pembatalan
   * @param {string} nip - NIP pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  requestCancelCuti(id, alasan, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const activeNip = nip || (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip')) : '') || '';

    if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
      return TranskepAPI.call('requestCancelCuti', id, alasan, activeNip, authToken);
    }

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi TranskepAPI / google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .requestCancelCuti(id, alasan, activeNip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.CutiDataService = CutiDataService;
}
