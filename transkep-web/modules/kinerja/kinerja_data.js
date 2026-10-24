// ==========================================
// FILE: kinerja_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Kinerja
// FITUR: FileReader Base64, Payload Builder, RPC Dispatcher
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const KinerjaDataService = {
  /**
   * Konversi File lokal (PDF) menjadi Base64 Data URL (Promise)
   */
  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Unggah dokumen SKP (Penilaian & Evaluasi) ke backend
   * @param {Object} formData - { tahun, periode, predikat, pejabat_nip }
   * @param {Object} files - { penilaian: File, evaluasi: File }
   * @param {string} userNip - NIP pegawai pemohon
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon dari server
   */
  async uploadKinerja(formData, files, userNip, token) {
    if (!formData.pejabat_nip) {
      throw new Error("Silakan ketik dan pilih nama pejabat penilai dari daftar.");
    }
    if (!files.penilaian || !files.evaluasi) {
      throw new Error("File dokumen penilaian dan evaluasi wajib dipilih.");
    }

    const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
    if (files.penilaian.size > MAX_SIZE || files.evaluasi.size > MAX_SIZE) {
      throw new Error("Setiap file maksimal berukuran 2 MB untuk menjaga performa server.");
    }

    const [base64Penilaian, base64Evaluasi] = await Promise.all([
      this.readFileAsBase64(files.penilaian),
      this.readFileAsBase64(files.evaluasi)
    ]);

    const payload = {
      nip: userNip,
      tahun: formData.tahun,
      periode: formData.periode,
      predikat: formData.predikat,
      pejabat_nip: formData.pejabat_nip,
      filePenilaianData: base64Penilaian.split(',')[1],
      fileEvaluasiData: base64Evaluasi.split(',')[1],
      fileMimeType: 'application/pdf',
      fileNameBase: `SKP_${userNip}_${formData.tahun}`
    };

    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .addKinerjaLog(payload, authToken);
    });
  },

  /**
   * Pengesahan & TTE Dokumen SKP oleh Atasan / Pejabat Penilai
   * @param {string} id - ID Kinerja Log
   * @param {string} pejabatNip - NIP pejabat penilai
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon dari server
   */
  sahkanKinerja(id, pejabatNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .approveKinerja(id, pejabatNip, authToken);
    });
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.KinerjaDataService = KinerjaDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KinerjaDataService };
}
