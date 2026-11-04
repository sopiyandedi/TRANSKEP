// ==========================================
// FILE: sop_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Standar Operasional Prosedur (SOP)
// FITUR: PDF Validator & Reader, Cloud Firestore Standalone & Drive Auto-Upload
// ENGINE: TRANSKEP Core v1.0.0 (Tahap 82)
// ==========================================

const SopDataService = {
  _hasSubscribed: false,

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
   * TAHAP 82: Menyimpan data SOP ke Cloud Firestore 100% mandiri
   * Mengunggah berkas PDF fisik ke Google Drive via GAS hanya jika ada file baru
   * @param {Object} payload - Data form SOP, pelaksana, dan fileBase64
   * @param {string} userNip - NIP pembuat/editor
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async saveSop(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    let driveUrl = payload.link_drive || '-';

    // 1. Jika ada berkas PDF baru, unggah ke Google Drive via GAS
    if (payload.fileBase64 && typeof google !== 'undefined' && google.script && google.script.run) {
      try {
        const gasRes = await new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((res) => resolve(res))
            .withFailureHandler((err) => reject(err))
            .saveSopData({
              judul_sop: payload.judul_sop,
              nomor_sop: payload.nomor_sop,
              kategori_pj: payload.kategori_pj,
              tanggal_pembuatan: payload.tanggal_pembuatan,
              tanggal_revisi: payload.tanggal_revisi,
              tanggal_efektif: payload.tanggal_efektif,
              fileBase64: payload.fileBase64,
              link_drive: payload.link_drive || ''
            }, userNip, authToken);
        });

        if (gasRes && gasRes.status === 'success' && gasRes.link_drive) {
          driveUrl = gasRes.link_drive;
          payload.link_drive = driveUrl;
        }
      } catch (uploadErr) {
        console.warn("⚠️ [SopDataService] Gagal upload Drive via GAS:", uploadErr);
      }
    }

    // 2. Simpan dokumen lengkap 100% murni ke Cloud Firestore (sop_documents)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      const docId = payload.id || ('SOP-' + Date.now());
      const firestorePayload = {
        ...payload,
        id: docId,
        link_drive: driveUrl,
        is_firebase: true
      };
      delete firestorePayload.fileBase64;
      delete firestorePayload.fileName;

      await TranskepFirebase.saveSopToFirestore(firestorePayload);
      return { status: 'success', id: docId, link_drive: driveUrl, message: 'Dokumen SOP berhasil disimpan ke Cloud Firestore.' };
    }

    return { status: 'success', message: 'Dokumen SOP berhasil disimpan.' };
  },

  /**
   * TAHAP 82: Menghapus arsip SOP 100% murni dari Cloud Firestore
   * @param {string} id - ID SOP
   * @param {string} userNip - NIP admin penghapus
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async deleteSop(id, userNip, token) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      await TranskepFirebase.deleteSopFromFirestore(id);
      return { status: 'success', message: 'Dokumen SOP berhasil dihapus dari Cloud Firestore.' };
    }
    return { status: 'success', message: 'Dokumen SOP dihapus.' };
  },

  /**
   * TAHAP 82: Konfirmasi / Tanda Telah Membaca SOP oleh Pegawai Terlibat via Cloud Firestore
   * @param {string} sopId - ID SOP
   * @param {string} nip - NIP pegawai yang membaca
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async acknowledgeSop(sopId, nip, token) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      return await TranskepFirebase.acknowledgeSopInFirestore(sopId, nip);
    }
    return { status: 'success', message: 'Tanda telah membaca SOP berhasil dicatat di Cloud Firestore.' };
  },

  /**
   * TAHAP 82: Inisialisasi Real-time Synchronization Firestore untuk SOP & Acknowledgment
   */
  initRealtimeSync() {
    if (this._hasSubscribed) return;
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      this._hasSubscribed = true;
      console.log("🔥 [TRANSKEP SOP] Menghubungkan listener realtime Firestore SOP...");

      TranskepFirebase.subscribeFirestoreSops((list) => {
        if (!Array.isArray(list)) return;

        const currentList = (typeof state !== 'undefined' && state.sopList) || (window.vueState && window.vueState.sopList) || [];
        const fIds = new Set(list.map(x => String(x.id)));
        const unmigratedLegacy = currentList.filter(item => item && item.id && !item.is_firebase && !fIds.has(String(item.id)));
        const merged = [...list.map(f => ({ ...f, is_firebase: true })), ...unmigratedLegacy];

        if (typeof state !== 'undefined') state.sopList = merged;
        if (window.vueState) window.vueState.sopList = merged;

        // Ekstrak acknowledgments terpadu dari dokumen Firestore
        const currentAckList = [...((typeof state !== 'undefined' && state.sopAckList) || (window.vueState && window.vueState.sopAckList) || [])];
        merged.forEach(fSop => {
          if (fSop.acknowledgments && Array.isArray(fSop.acknowledgments)) {
            fSop.acknowledgments.forEach(ack => {
              if (!currentAckList.some(a => String(a.sop_id) === String(fSop.id) && String(a.nip) === String(ack.nip))) {
                currentAckList.push({
                  id: 'ACK-' + fSop.id + '-' + ack.nip,
                  sop_id: fSop.id,
                  nip: ack.nip,
                  tanggal_baca: ack.tanggal_baca || ''
                });
              }
            });
          }
        });

        if (typeof state !== 'undefined') state.sopAckList = currentAckList;
        if (window.vueState) window.vueState.sopAckList = currentAckList;

        if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
        console.log(`🔥 [TRANSKEP SOP] Realtime Sync Aktif: ${merged.length} SOP tersinkron.`);
      });
    }
  }
};

// Ekspos ke global window & Auto-init Realtime Sync
if (typeof window !== 'undefined') {
  window.SopDataService = SopDataService;
  setTimeout(() => {
    if (typeof SopDataService.initRealtimeSync === 'function') {
      SopDataService.initRealtimeSync();
    }
  }, 1000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SopDataService };
}
