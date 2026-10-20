// ========================================================
// FILE: transkep-web/core/firebase.js
// DESKRIPSI: Inisialisasi & Konektor Resmi Firebase Cloud Firestore
// PROJEK: TRANSKEP (transkep-314c0)
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
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
    console.log("🔥 [ZettBOT Firebase] Cloud Firestore transkep-314c0 berhasil diinisialisasi.");
  } else {
    console.warn("⚠️ [ZettBOT Firebase] Library Firebase CDN belum terdeteksi di window.");
  }
} catch (err) {
  console.error("❌ [ZettBOT Firebase] Gagal inisialisasi Firebase:", err);
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
        console.error("❌ [ZettBOT Firebase] Lazy init failed:", e);
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
        console.error("❌ [ZettBOT Firebase] Error listener Firestore SK:", error);
      }
    );
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.TranskepFirebase = TranskepFirebase;
}
