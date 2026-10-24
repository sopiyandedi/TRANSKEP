// ========================================================
// FILE: transkep-web/core/firebase.js
// DESKRIPSI: Inisialisasi & Konektor Resmi Firebase Cloud Firestore
// PROJEK: TRANSKEP (transkep-314c0)
// ENGINE: TRANSKEP Core v1.0.0 
// ========================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAewaE6EvylqxK400uMHaL53bi7xs_bu9E",
  authDomain: "transkep-314c0.firebaseapp.com",
  projectId: "transkep-314c0",
  storageBucket: "transkep-314c0.firebasestorage.app",
  messagingSenderId: "167890717834",
  appId: "1:167890717834:web:66d7f5295cc508c635b173",
  measurementId: "G-51RYSSNHDP"
};

let transkepDb = null;

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    transkepDb = firebase.firestore();
    console.log("🔥 [TRANSKEP Firebase] Cloud Firestore transkep-314c0 berhasil diinisialisasi.");
  } else {
    console.warn("⚠️ [TRANSKEP Firebase] Library Firebase CDN belum terdeteksi di window.");
  }
} catch (err) {
  console.error("❌ [TRANSKEP Firebase] Gagal inisialisasi Firebase:", err);
}

const TranskepFirebase = {
  config: FIREBASE_CONFIG,
  getDb() {
    if (!transkepDb && typeof firebase !== 'undefined') {
      try {
        if (!firebase.apps || firebase.apps.length === 0) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        transkepDb = firebase.firestore();
      } catch (e) {
        console.error("❌ [TRANSKEP Firebase] Lazy init failed:", e);
      }
    }
    return transkepDb;
  },
  isReady() {
    return !!this.getDb();
  },

  // ==========================================
  // OPERASI DOKUMEN SURAT KEPUTUS (SK)
  // ==========================================
  SK_COLLECTION: 'sk_documents',

  /**
   * Menyimpan / Memperbarui Dokumen SK ke Firestore
   */
  async saveSkToFirestore(skData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    
    const docId = String(skData.id || ('SK-' + Date.now())).trim();
    const payload = {
      id: docId,
      judul_sk: skData.judul_sk || '-',
      no_sk: skData.no_sk || '-',
      pj_sk: skData.pj_sk || 'PJ. Kesekretariatan',
      link_drive: skData.link_drive || '-',
      tgl_sk: skData.tgl_sk || '',
      tgl_input: skData.tgl_input || new Date().toISOString().split('T')[0],
      status: skData.status || 'Aktif',
      versi_aktif: skData.versi_aktif || 1,
      members: Array.isArray(skData.members) ? skData.members : [],
      naskah_utama: skData.naskah_utama || null,
      lampiran: Array.isArray(skData.lampiran) ? skData.lampiran : [],
      revisi_history: Array.isArray(skData.revisi_history) ? skData.revisi_history : [{
        versi: 1,
        tgl_revisi: skData.tgl_input || new Date().toISOString().split('T')[0],
        catatan: "Inisiasi awal dokumen SK",
        oleh: (typeof state !== 'undefined' && state.user) ? state.user.nama : 'Admin'
      }],
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!skData.created_at) {
      payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection(this.SK_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, data: payload };
  },

  /**
   * Menghapus Dokumen SK dari Cloud Firestore
   */
  async deleteSkFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.SK_COLLECTION).doc(String(docId).trim()).delete();
    return { status: 'success', message: 'Dokumen SK berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen SK dari Firestore
   */
  async getFirestoreSks() {
    const db = this.getDb();
    if (!db) return [];
    const snapshot = await db.collection(this.SK_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen SK
   */
  subscribeFirestoreSks(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.SK_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        if (typeof callback === 'function') callback(list);
      },
      (error) => {
        console.error("❌ [TRANSKEP Firebase] Error listener Firestore SK:", error);
      }
    );
  },

  // ==========================================
  // OPERASI DOKUMEN URAIAN TUGAS (JOBDES)
  // ==========================================
  JOBDES_COLLECTION: 'jobdes_documents',
  JOBDES_USULAN_COLLECTION: 'jobdes_usulan',

  /**
   * Menyimpan / Memperbarui Dokumen Jobdes ke Firestore
   */
  async saveJobdesToFirestore(jobdesData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    
    const docId = String(jobdesData.nip || '').trim();
    if (!docId) throw new Error("NIP pegawai diperlukan untuk menyimpan dokumen Jobdes.");

    const payload = {
      nip: docId,
      atasan_nip: String(jobdesData.atasan_nip || '').trim(),
      dasar_lampiran: jobdesData.dasar_lampiran || '-',
      ikhtisar_jabatan: jobdesData.ikhtisar_jabatan || '',
      tugas_pokok: jobdesData.tugas_pokok || '',
      tugas_tambahan: jobdesData.tugas_tambahan || '',
      tanggung_jawab: jobdesData.tanggung_jawab || '',
      hasil_kerja: jobdesData.hasil_kerja || '',
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (jobdesData.updated_by) {
      payload.updated_by = jobdesData.updated_by;
    }

    await db.collection(this.JOBDES_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', nip: docId, data: payload, message: 'Uraian tugas berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen Jobdes dari Firestore
   */
  async getFirestoreJobdes() {
    const db = this.getDb();
    if (!db) return [];
    const snapshot = await db.collection(this.JOBDES_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen Jobdes
   */
  subscribeFirestoreJobdes(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.JOBDES_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        if (typeof callback === 'function') callback(list);
      },
      (error) => {
        console.error("❌ [TRANSKEP Firebase] Error listener Firestore Jobdes:", error);
      }
    );
  },

  /**
   * Menyimpan Usulan Reposisi ke Firestore
   */
  async saveUsulanJobdesToFirestore(usulanData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    
    const usulanId = String(usulanData.id || ('USUL-' + Date.now())).trim();
    const payload = {
      id: usulanId,
      nip_pegawai: String(usulanData.nip_pegawai || '').trim(),
      nama_pegawai: usulanData.nama_pegawai || '-',
      nama_pengusul: usulanData.nama_pengusul || '-',
      isi_usulan: usulanData.isi_usulan || '-',
      status: usulanData.status || 'Menunggu',
      is_firebase: true,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection(this.JOBDES_USULAN_COLLECTION).doc(usulanId).set(payload, { merge: true });
    return { status: 'success', id: usulanId, data: payload, message: 'Usulan reposisi berhasil dikirim ke Cloud Firestore.' };
  },

  /**
   * Memasang Realtime Listener untuk Usulan Jobdes
   */
  subscribeFirestoreUsulanJobdes(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.JOBDES_USULAN_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        if (typeof callback === 'function') callback(list);
      },
      (error) => {
        console.error("❌ [TRANSKEP Firebase] Error listener Firestore Usulan Jobdes:", error);
      }
    );
  },

  /**
   * Menandai Usulan Selesai di Firestore
   */
  async tandaiUsulanSelesaiInFirestore(usulanId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.JOBDES_USULAN_COLLECTION).doc(String(usulanId).trim()).update({
      status: 'Selesai',
      completed_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { status: 'success', message: 'Usulan ditandai selesai di Cloud Firestore.' };
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.TranskepFirebase = TranskepFirebase;
}
