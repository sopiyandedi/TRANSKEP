// ==========================================
// FILE: sop_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Standar Operasional Prosedur (SOP)
// FITUR: PDF Validator & Reader, RPC Save/Delete/Acknowledge/Drive URL
// ENGINE: TRANSKEP Core v1.0.0 
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
  /**
   * Menyimpan data SOP baru atau pembaruan SOP ke Cloud Firestore & spreadsheet
   * Prioritas: Simpan instan ke Cloud Firestore (koleksi sop_documents)
   * Berkas PDF baru diunggah ke Google Drive via Apps Script
   */
  async saveSop(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    let gasRes = null;
    // Jika ada file upload baru atau Apps Script tersedia, proses upload Drive & spreadsheet
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      gasRes = await new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .saveSopData(payload, userNip, authToken);
      });

      if (gasRes && gasRes.status !== 'success') {
        return gasRes;
      }
    }

    // Simpan dokumen ke Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const docId = (gasRes && gasRes.id) ? gasRes.id : (payload.id || ('SOP-' + Date.now()));
        const driveUrl = (gasRes && gasRes.link_drive) ? gasRes.link_drive : (payload.link_drive || '-');

        const firestorePayload = {
          ...payload,
          id: docId,
          link_drive: driveUrl
        };
        // Hapus base64 dari payload dokumen Firestore agar hemat kuota & ringan
        delete firestorePayload.fileBase64;
        delete firestorePayload.fileName;

        const fRes = await TranskepFirebase.saveSopToFirestore(firestorePayload);
        return gasRes || fRes;
      } catch (err) {
        console.warn("⚠️ [SopDataService] Gagal simpan ke Firestore, fallback:", err);
        if (gasRes) return gasRes;
      }
    }

    return gasRes || { status: 'success', message: 'Dokumen SOP berhasil disimpan.' };
  },

  /**
   * Menghapus arsip SOP dan riwayat tanda baca dari pegawai
   * Menghapus dari Firestore dan Spreadsheet
   */
  async deleteSop(id, userNip, token) {
    // 1. Hapus dari Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        await TranskepFirebase.deleteSopFromFirestore(id);
      } catch (e) {
        console.warn("⚠️ [SopDataService] Gagal hapus dari Firestore:", e);
      }
    }

    // 2. Sinkronkan hapus di Google Spreadsheet via Apps Script
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .deleteSopData(id, userNip, authToken);
      });
    }

    return { status: 'success', message: 'Dokumen SOP berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Konfirmasi / Tanda Telah Membaca SOP oleh Pegawai Terlibat
   * Menyimpan ke Cloud Firestore secara instan dan mirror ke spreadsheet
   */
  async acknowledgeSop(sopId, nip, token) {
    // 1. Simpan Acknowledgment instan ke Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        await TranskepFirebase.acknowledgeSopInFirestore(sopId, nip);
      } catch (e) {
        console.warn("⚠️ [SopDataService] Gagal catat acknowledgment di Firestore:", e);
      }
    }

    // 2. Mirror ke Google Spreadsheet
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => resolve(res))
          .withFailureHandler((err) => reject(err))
          .acknowledgeSop(sopId, nip, authToken);
      });
    }

    return { status: 'success', message: 'Tanda telah membaca SOP berhasil dicatat di Cloud Firestore.' };
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.SopDataService = SopDataService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SopDataService };
}
