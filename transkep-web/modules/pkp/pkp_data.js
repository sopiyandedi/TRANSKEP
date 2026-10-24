// ==========================================
// FILE: pkp_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Penilaian Kinerja Pegawai (PKP & PCK)
// FITUR: RPC Dokumen PKP, Dokumen PCK, Detail, Submit Bulk, Aksi Persetujuan, PDF Generation
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const PkpDataService = {
  /**
   * Mengambil daftar dokumen Perjanjian Kinerja (PK) tahunan
   * @param {string} nip - NIP pengguna
   * @param {string} role - Peran/hak akses pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array|Object>} Daftar dokumen PK
   */
  getDataDokumenPKP(nip, role, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDataDokumenPKP(nip, role, authToken);
    });
  },

  /**
   * Mengambil daftar dokumen Penilaian Capaian Kinerja (PCK) bulanan
   * @param {string} nip - NIP pengguna
   * @param {string} role - Peran/hak akses pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array|Object>} Daftar dokumen PCK
   */
  getDataDokumenPCK(nip, role, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDataDokumenPCK(nip, role, authToken);
    });
  },

  /**
   * Mengirimkan aksi status pada dokumen PK (Kirim, Setujui, Tolak, Hapus)
   * @param {string|number} idPKP - ID Dokumen PK
   * @param {string} aksi - Jenis aksi (Kirim / Setujui / Tolak / Hapus)
   * @param {string} nip - NIP pengguna pemrakarsa
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon aksi { success, message }
   */
  aksiDokumenPKP(idPKP, aksi, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .aksiDokumenPKP(idPKP, aksi, nip, authToken);
    });
  },

  /**
   * Mengirimkan aksi status pada dokumen PCK (Kirim, Setujui, Tolak, Hapus)
   * @param {string|number} idPCK - ID Dokumen PCK
   * @param {string} aksi - Jenis aksi (Kirim / Setujui / Tolak / Hapus)
   * @param {string} nip - NIP pengguna pemrakarsa
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon aksi { success, message }
   */
  aksiDokumenPCK(idPCK, aksi, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .aksiDokumenPCK(idPCK, aksi, nip, authToken);
    });
  },

  /**
   * Mengambil detail indikator dan sasaran dokumen PK tahunan
   * @param {string|number} idPkp - ID Dokumen PK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon detail { success, header, items }
   */
  getDetailPKP(idPkp, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDetailPKP(idPkp, nip, authToken);
    });
  },

  /**
   * Menyimpan sasaran & target kerja tahunan PK (Create / Update / Verifikasi)
   * @param {Object} payload - Objek sasaran, indikator, target, penilai
   * @param {string} nip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon simpan { success, id_pkp, message }
   */
  submitBulkPKP(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitBulkPKP(payload, nip, authToken);
    });
  },

  /**
   * Mengambil detail target dan realisasi bulanan PCK lengkap
   * @param {string} nipTarget - NIP pegawai pemilik target
   * @param {string} blnText - Nama bulan (misal: 'Januari')
   * @param {string|number} thn - Tahun target
   * @param {string} currentNip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon detail { success, targets, message }
   */
  getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, authToken);
    });
  },

  /**
   * Menyimpan capaian realisasi bulanan PCK (Create / Update / Verifikasi)
   * @param {Object} payload - Objek realisasi bulanan, nilai akhir, items
   * @param {string} nip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon simpan { success, id_pck, message }
   */
  submitBulkPCK(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitBulkPCK(payload, nip, authToken);
    });
  },

  /**
   * Menerbitkan dokumen PDF Perjanjian Kinerja (PK) via Google Script backend
   * @param {string|number} id - ID Dokumen PK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, url, message }
   */
  generatePdfPK(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .generatePdfPK(id, nip, authToken);
    });
  },

  /**
   * Menerbitkan dokumen PDF Laporan Capaian Kinerja (PCK) via Google Script backend
   * @param {string|number} id - ID Dokumen PCK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, url, message }
   */
  generatePdfPCK(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .generatePdfPCK(id, nip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.PkpDataService = PkpDataService;
}
