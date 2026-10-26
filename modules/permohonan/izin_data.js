// ==========================================
// FILE: izin_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Permohonan Izin (IP, IK, & WFH)
// FITUR: Submit/Update IP, Submit/Update IK, Submit/Update Rencana WFH, Get WFH By ID, Submit Laporan WFH, FileReader Base64
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const IzinDataService = {
  /**
   * Helper asynchronous untuk membaca berkas file menjadi Base64
   * @param {File} file - Berkas file dari input type="file"
   * @returns {Promise<{fileData: string, fileName: string, fileMimeType: string}>}
   */
  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Berkas file tidak ditemukan."));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const base64Str = reader.result;
          resolve({
            fileData: base64Str.split(',')[1],
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
   * Helper asynchronous untuk membaca banyak berkas file sekaligus
   * @param {FileList|File[]} files - Daftar berkas file
   * @returns {Promise<Array<{fileData: string, fileName: string, fileMimeType: string}>>}
   */
  async readMultipleFilesAsBase64(files) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const fileData = await this.readFileAsBase64(files[i]);
      results.push(fileData);
    }
    return results;
  },

  // ==============================================================
  // 1. IZIN PRIBADI (IP)
  // ==============================================================

  /**
   * Mengirimkan pengajuan Izin Pribadi (IP) baru
   * @param {Object} payload - Objek form IP
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data, message }
   */
  submitIP(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitIzinPribadi(payload, authToken);
    });
  },

  /**
   * Memperbarui draf/data Izin Pribadi (IP) yang diedit
   * @param {Object} payload - Objek form IP dengan id
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateIP(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateIzinPribadiLog(payload, authToken);
    });
  },

  // ==============================================================
  // 2. IZIN KELUAR (IK)
  // ==============================================================

  /**
   * Mengirimkan pengajuan Izin Keluar Kantor (IK) baru
   * @param {Object} payload - Objek form IK
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data, message }
   */
  submitIK(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitIzinKeluar(payload, authToken);
    });
  },

  /**
   * Memperbarui draf/data Izin Keluar Kantor (IK) yang diedit
   * @param {Object} payload - Objek form IK dengan id
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateIK(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateIzinKeluarLog(payload, authToken);
    });
  },

  // ==============================================================
  // 3. WORK FROM HOME (WFH)
  // ==============================================================

  /**
   * Mengirimkan pengajuan Rencana Kerja WFH baru
   * @param {Object} payload - Objek form rencana WFH
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data, message }
   */
  submitRencanaWFH(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitRencanaWFH(payload, authToken);
    });
  },

  /**
   * Memperbarui draf/data Rencana Kerja WFH yang diedit
   * @param {Object} payload - Objek form rencana WFH dengan id
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, message }
   */
  updateRencanaWFH(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .updateRencanaWfhLog(payload, authToken);
    });
  },

  /**
   * Menarik data Rencana WFH berdasarkan ID untuk pengisian modal Laporan
   * @param {string|number} id - ID Rencana WFH
   * @returns {Promise<Object>} Respon { status, data, message }
   */
  getRencanaWFHById(id) {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getRencanaWFHById(id);
    });
  },

  /**
   * Mengirimkan Laporan Capaian Kerja WFH beserta bukti lampiran eviden
   * @param {Object} payload - Objek form laporan WFH
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, data, message }
   */
  submitLaporanWFH(payload, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitLaporanWFH(payload, authToken);
    });
  }
};

// Global export window
if (typeof window !== 'undefined') {
  window.IzinDataService = IzinDataService;
}
