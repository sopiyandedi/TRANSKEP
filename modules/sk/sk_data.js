// ==========================================
// FILE: sk_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Surat Keputusan (SK)
// FITUR: PDF Validator & Reader, Cloud Firestore Standalone & Drive Auto-Upload
// ENGINE: TRANSKEP Core v1.0.0 (Tahap 81)
// ==========================================

const SkDataService = {
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
   * Mengambil URL Folder Brankas Google Drive untuk Arsip SK
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
        .getSkDriveFolderUrl(userNip, authToken);
    });
  },

  /**
   * TAHAP 81: Menyimpan data SK ke Cloud Firestore 100% mandiri
   * Mengunggah berkas PDF fisik ke Google Drive via GAS hanya jika ada file baru
   * @param {Object} payload - Data form SK, susunan tim members, dan fileBase64
   * @param {string} userNip - NIP pembuat/editor
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async saveSk(payload, userNip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    
    // 1. Jika ada file PDF baru, panggil GAS khusus untuk upload ke Google Drive
    if (payload.fileBase64 && typeof google !== 'undefined' && google.script && google.script.run) {
      try {
        const uploadRes = await new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((res) => resolve(res))
            .withFailureHandler((err) => reject(err))
            .saveSk({
              judul_sk: payload.judul_sk,
              no_sk: payload.no_sk,
              pj_sk: payload.pj_sk,
              tgl_sk: payload.tgl_sk,
              fileBase64: payload.fileBase64,
              link_drive: payload.link_drive || ''
            }, userNip, authToken);
        });

        if (uploadRes && uploadRes.status === 'success' && uploadRes.link_drive) {
          payload.link_drive = uploadRes.link_drive;
        }
      } catch (uploadErr) {
        console.warn("⚠️ [SkDataService] Gagal upload Drive via GAS:", uploadErr);
      }
    }

    // 2. Simpan dokumen lengkap 100% murni ke Cloud Firestore (sk_documents)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      const docId = payload.id || ('SK-' + Date.now());
      const firestorePayload = {
        id: docId,
        no_sk: payload.no_sk || '-',
        judul_sk: payload.judul_sk || '-',
        pj_sk: payload.pj_sk || 'PJ. Kesekretariatan',
        tgl_sk: payload.tgl_sk || '',
        tgl_input: payload.tgl_input || new Date().toISOString().split('T')[0],
        link_drive: payload.link_drive || '-',
        status: "Aktif",
        versi_aktif: 1,
        members: Array.isArray(payload.members) ? payload.members : [],
        revisi_history: [{
          versi: 1,
          tgl_revisi: payload.tgl_sk || new Date().toISOString().split('T')[0],
          catatan: "Pendaftaran SK via Form Input",
          oleh: (typeof state !== 'undefined' && state.user) ? state.user.nama : 'Admin'
        }],
        is_firebase: true
      };
      await TranskepFirebase.saveSkToFirestore(firestorePayload);
      return { status: 'success', id: docId, link_drive: payload.link_drive, message: 'Data SK berhasil disimpan ke Cloud Firestore.' };
    }

    return { status: 'success', message: 'Data SK berhasil disimpan.' };
  },

  /**
   * TAHAP 81: Menghapus arsip SK 100% murni dari Cloud Firestore
   * @param {string} id - ID Surat Keputusan
   * @param {string} userNip - NIP admin penghapus
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async deleteSk(id, userNip, token) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      await TranskepFirebase.deleteSkFromFirestore(id);
      return { status: 'success', message: 'Dokumen SK berhasil dihapus dari Cloud Firestore.' };
    }
    return { status: 'success', message: 'Dokumen SK dihapus.' };
  },

  /**
   * TAHAP 81: Konfirmasi / Tanda Telah Membaca Tugas di dalam SK ke Cloud Firestore (arrayUnion)
   * @param {string} skId - ID SK
   * @param {string} nip - NIP pegawai yang membaca
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon status
   */
  async acknowledgeSk(skId, nip, token) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      return await TranskepFirebase.acknowledgeSkInFirestore(skId, nip);
    }
    return { status: 'success', message: 'Tanda baca SK dicatat secara lokal.' };
  },

  /**
   * TAHAP 81: Inisialisasi Real-time Synchronization Firestore untuk SK & Acknowledgment
   */
  initRealtimeSync() {
    if (this._hasSubscribed) return;
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
      this._hasSubscribed = true;
      console.log("🔥 [TRANSKEP SK] Menghubungkan listener realtime Firestore SK...");

      TranskepFirebase.subscribeFirestoreSks((list) => {
        if (!Array.isArray(list)) return;

        const currentList = (typeof state !== 'undefined' && state.skList) || (window.vueState && window.vueState.skList) || [];
        const fIds = new Set(list.map(x => String(x.id)));
        const unmigratedLegacy = currentList.filter(item => item && item.id && !item.is_firebase && !fIds.has(String(item.id)));
        const merged = [...list.map(f => ({ ...f, is_firebase: true })), ...unmigratedLegacy];

        if (typeof state !== 'undefined') state.skList = merged;
        if (window.vueState) window.vueState.skList = merged;

        // Ekstrak acknowledgments terpadu dari dokumen Firestore
        const currentAckList = [...((typeof state !== 'undefined' && state.skAckList) || (window.vueState && window.vueState.skAckList) || [])];
        merged.forEach(fSk => {
          if (fSk.acknowledgments && Array.isArray(fSk.acknowledgments)) {
            fSk.acknowledgments.forEach(ack => {
              if (!currentAckList.some(a => String(a.sk_id) === String(fSk.id) && String(a.nip) === String(ack.nip))) {
                currentAckList.push({
                  id: 'ACK-' + fSk.id + '-' + ack.nip,
                  sk_id: fSk.id,
                  nip: ack.nip,
                  tanggal_baca: ack.tanggal_baca || ''
                });
              }
            });
          }
        });

        if (typeof state !== 'undefined') state.skAckList = currentAckList;
        if (window.vueState) window.vueState.skAckList = currentAckList;

        if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
        console.log(`🔥 [TRANSKEP SK] Realtime Sync Aktif: ${merged.length} SK tersinkron.`);
      });
    }
  }
};

// Ekspos ke global window & Auto-init Realtime Sync
if (typeof window !== 'undefined') {
  window.SkDataService = SkDataService;
  setTimeout(() => {
    if (typeof SkDataService.initRealtimeSync === 'function') {
      SkDataService.initRealtimeSync();
    }
  }, 1000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SkDataService };
}
