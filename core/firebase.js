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
let transkepAppCheck = null;

// Konfigurasi reCAPTCHA Enterprise / Fraud Defense App Check
const TRANSKEP_RECAPTCHA_SITE_KEY = '6LfkOv8tAAAAAPm0LLzS7uJmKRUcmNBIuYZymlRz';

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    // Inisialisasi Firebase App Check (Fraud Defense / reCAPTCHA Enterprise)
    try {
      if (typeof firebase.appCheck === 'function') {
        let provider = null;
        if (typeof firebase.appCheck.ReCaptchaEnterpriseProvider === 'function') {
          provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(TRANSKEP_RECAPTCHA_SITE_KEY);
        } else if (typeof firebase.appCheck.ReCaptchaV3Provider === 'function') {
          provider = new firebase.appCheck.ReCaptchaV3Provider(TRANSKEP_RECAPTCHA_SITE_KEY);
        }

        if (provider) {
          transkepAppCheck = firebase.appCheck();
          transkepAppCheck.activate(provider, true); // isTokenAutoRefreshEnabled: true
          console.log("🛡️ [TRANSKEP Security] Firebase App Check (Fraud Defense / reCAPTCHA Enterprise) aktif.");
        }
      }
    } catch (acErr) {
      console.warn("⚠️ [TRANSKEP Security] Catatan inisialisasi App Check:", acErr.message || acErr);
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
  siteKey: TRANSKEP_RECAPTCHA_SITE_KEY,
  getAppCheck() {
    return transkepAppCheck;
  },
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
  },

  // ==========================================
  // OPERASI DOKUMEN STANDAR OPERASIONAL PROSEDUR (SOP)
  // ==========================================
  SOP_COLLECTION: 'sop_documents',

  /**
   * Menyimpan / Memperbarui Dokumen SOP ke Firestore
   */
  async saveSopToFirestore(sopData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const docId = String(sopData.id || ('SOP-' + Date.now())).trim();
    let pelaksanaArr = [];
    if (Array.isArray(sopData.pelaksana)) {
      pelaksanaArr = sopData.pelaksana;
    } else if (sopData.pelaksana_json) {
      try { pelaksanaArr = JSON.parse(sopData.pelaksana_json); } catch(e) { pelaksanaArr = []; }
    }

    const payload = {
      id: docId,
      judul_sop: sopData.judul_sop || '-',
      nomor_sop: sopData.nomor_sop || '-',
      kategori_pj: sopData.kategori_pj || 'PJ. Kesekretariatan',
      tanggal_pembuatan: sopData.tanggal_pembuatan || '',
      tanggal_revisi: sopData.tanggal_revisi || '-',
      tanggal_efektif: sopData.tanggal_efektif || '',
      link_drive: sopData.link_drive || '-',
      pelaksana: pelaksanaArr,
      pelaksana_json: JSON.stringify(pelaksanaArr),
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (Array.isArray(sopData.acknowledgments)) {
      payload.acknowledgments = sopData.acknowledgments;
    }

    if (!sopData.created_at) {
      payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection(this.SOP_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, data: payload, message: 'Dokumen SOP berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Menghapus Dokumen SOP dari Cloud Firestore
   */
  async deleteSopFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    const cleanId = String(docId).trim();
    await db.collection(this.SOP_COLLECTION).doc(cleanId).delete();
    return { status: 'success', message: 'Dokumen SOP berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen SOP dari Firestore
   */
  async getFirestoreSops() {
    const db = this.getDb();
    if (!db) return [];
    const snapshot = await db.collection(this.SOP_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen SOP
   */
  subscribeFirestoreSops(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.SOP_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        if (typeof callback === 'function') callback(list);
      },
      (error) => {
        console.error("❌ [TRANSKEP Firebase] Error listener Firestore SOP:", error);
      }
    );
  },

  /**
   * Menyimpan Konfirmasi Baca (Acknowledgment) SOP ke Firestore
   * Disimpan langsung di dalam array acknowledgments pada dokumen SOP (1 koleksi terpadu)
   */
  async acknowledgeSopInFirestore(sopId, nip, tanggalBaca) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const cleanSopId = String(sopId).trim();
    const cleanNip = String(nip).trim();
    let tgl = tanggalBaca;
    if (!tgl) {
      const d = new Date();
      tgl = (("0"+d.getDate()).slice(-2)) + '/' + (("0"+(d.getMonth()+1)).slice(-2)) + '/' + d.getFullYear() + ' ' + d.toLocaleTimeString('en-GB');
    }

    const ackItem = { nip: cleanNip, tanggal_baca: tgl };

    await db.collection(this.SOP_COLLECTION).doc(cleanSopId).update({
      acknowledgments: firebase.firestore.FieldValue.arrayUnion(ackItem),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { status: 'success', sop_id: cleanSopId, nip: cleanNip, tanggal_baca: tgl, message: 'Acknowledgment SOP berhasil dicatat di Cloud Firestore.' };
  },

  // ==========================================
  // OPERASI MODUL PENILAIAN KINERJA (PKP & PCK)
  // ==========================================
  MASTER_KINERJA_COLLECTION: 'master_kinerja',
  PKP_COLLECTION: 'pkp_documents',
  PCK_COLLECTION: 'pck_documents',
  REKAP_COLLECTION: 'pck_rekapitulasi',

  // --- PILAR 0: KAMUS KINERJA / TEMPLATE JABATAN ---
  /**
   * Menyimpan / Memperbarui Template Jabatan di Cloud Firestore
   */
  async saveMasterKinerjaToFirestore(templateData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const rawJabatan = String(templateData.nama_jabatan || templateData.jabatan || '').trim();
    if (!rawJabatan) throw new Error("Nama jabatan wajib disertakan.");
    
    const slug = rawJabatan.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const docId = String(templateData.id || ('TEMPL_' + slug)).trim();

    let aliases = [rawJabatan];
    if (Array.isArray(templateData.aliases)) {
      aliases = Array.from(new Set([rawJabatan, ...templateData.aliases]));
    }

    const payload = {
      id: docId,
      nama_jabatan: rawJabatan,
      kategori: templateData.kategori || 'Kepaniteraan',
      aliases: aliases,
      sasaran_list: Array.isArray(templateData.sasaran_list) ? templateData.sasaran_list : [],
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_by: templateData.updated_by || ((typeof state !== 'undefined' && state.user) ? state.user.nama : 'Admin')
    };

    await db.collection(this.MASTER_KINERJA_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, data: payload, message: 'Template jabatan berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Template Kamus Jabatan dari Firestore
   */
  async getFirestoreMasterKinerja() {
    const db = this.getDb();
    if (!db) return [];
    const snapshot = await db.collection(this.MASTER_KINERJA_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => list.push(doc.data()));
    return list;
  },

  /**
   * Menghapus Template Jabatan dari Firestore
   */
  async deleteMasterKinerjaFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.MASTER_KINERJA_COLLECTION).doc(String(docId).trim()).delete();
    return { status: 'success', message: 'Template jabatan berhasil dihapus dari Cloud Firestore.' };
  },

  // --- PILAR 1: PERJANJIAN KINERJA (PK) TAHUNAN ---
  /**
   * Menyimpan / Memperbarui Dokumen Kontrak PK Tahunan
   */
  async savePkpToFirestore(pkpData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const nipPegawai = String(pkpData.nip_pegawai || pkpData.nip || '').trim();
    const tahun = String(pkpData.tahun || new Date().getFullYear()).trim();
    if (!nipPegawai) throw new Error("NIP pegawai diperlukan untuk menyimpan dokumen PK.");

    const docId = String(pkpData.id_pkp || ('PKP_' + tahun + '_' + nipPegawai)).trim();

    const payload = {
      id_pkp: docId,
      nip_pegawai: nipPegawai,
      nip_penilai: String(pkpData.nip_penilai || pkpData.penilai || '').trim(),
      nip_atasan_pejabat: String(pkpData.nip_atasan_pejabat || pkpData.atasan_pejabat || '').trim(),
      tahun: tahun,
      status: pkpData.status || 'Draft',
      nilai_akhir: String(pkpData.nilai_akhir || pkpData.nilai || '0'),
      items: Array.isArray(pkpData.items) ? pkpData.items : [],
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!pkpData.created_at) {
      payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection(this.PKP_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, id_pkp: docId, data: payload, message: 'Dokumen PK berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Dokumen PK dari Firestore
   */
  async getFirestorePkps(filterNip, filterTahun) {
    const db = this.getDb();
    if (!db) return [];
    let query = db.collection(this.PKP_COLLECTION);
    if (filterTahun) query = query.where('tahun', '==', String(filterTahun).trim());
    if (filterNip) query = query.where('nip_pegawai', '==', String(filterNip).trim());

    const snapshot = await query.get();
    const list = [];
    snapshot.forEach(doc => list.push(doc.data()));
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen PK Tahunan
   */
  subscribeFirestorePkps(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.PKP_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        if (typeof callback === 'function') callback(list);
      },
      (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore PKP:", error)
    );
  },

  /**
   * Menghapus Dokumen PK dari Firestore
   */
  async deletePkpFromFirestore(idPkp) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.PKP_COLLECTION).doc(String(idPkp).trim()).delete();
    return { status: 'success', message: 'Dokumen PK berhasil dihapus dari Cloud Firestore.' };
  },

  // --- PILAR 2: PENILAIAN CAPAIAN KINERJA (PCK) BULANAN ---
  /**
   * Menyimpan / Memperbarui Dokumen Capaian Kinerja Bulanan
   */
  async savePckToFirestore(pckData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const nipPegawai = String(pckData.nip_pegawai || pckData.nip || pckData.nipPegawai || '').trim();
    const bulan = String(pckData.bulan || '').trim();
    const tahun = String(pckData.tahun || new Date().getFullYear()).trim();
    if (!nipPegawai || !bulan) throw new Error("NIP pegawai dan bulan diperlukan untuk menyimpan dokumen PCK.");

    const docId = String(pckData.id_pck || ('PCK_' + tahun + '_' + bulan + '_' + nipPegawai)).trim();
    const itemsList = Array.isArray(pckData.realisasi || pckData.items) ? (pckData.realisasi || pckData.items) : [];

    const payload = {
      id_pck: docId,
      nip_pegawai: nipPegawai,
      nip: nipPegawai,
      bulan: bulan,
      tahun: tahun,
      total_rencana: parseInt(pckData.total_rencana || pckData.rencana || itemsList.length) || 0,
      rencana: parseInt(pckData.rencana || pckData.total_rencana || itemsList.length) || 0,
      progress: pckData.progress || '100%',
      status: pckData.status || 'Draft',
      nilai_akhir: String(pckData.nilai_akhir || '0'),
      realisasi: itemsList,
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!pckData.created_at) {
      payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection(this.PCK_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, id_pck: docId, data: payload, message: 'Dokumen PCK berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Dokumen PCK dari Firestore
   */
  async getFirestorePcks(filterNip, filterTahun, filterBulan) {
    const db = this.getDb();
    if (!db) return [];
    let query = db.collection(this.PCK_COLLECTION);
    if (filterTahun) query = query.where('tahun', '==', String(filterTahun).trim());
    if (filterBulan) query = query.where('bulan', '==', String(filterBulan).trim());
    if (filterNip) query = query.where('nip_pegawai', '==', String(filterNip).trim());

    const snapshot = await query.get();
    const list = [];
    snapshot.forEach(doc => list.push(doc.data()));
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen PCK Bulanan
   */
  subscribeFirestorePcks(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.PCK_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        if (typeof callback === 'function') callback(list);
      },
      (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore PCK:", error)
    );
  },

  /**
   * Menghapus Dokumen PCK dari Firestore
   */
  async deletePckFromFirestore(idPck) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.PCK_COLLECTION).doc(String(idPck).trim()).delete();
    return { status: 'success', message: 'Dokumen PCK berhasil dihapus dari Cloud Firestore.' };
  },

  // --- PILAR 3: SNAPSHOT & PENGESAHAN REKAPITULASI BULANAN ---
  /**
   * Menyimpan / Mengunci Dokumen Rekapitulasi Bulanan Satker (Opsi B)
   */
  async saveRekapitulasiToFirestore(rekapData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    const bulan = String(rekapData.bulan || '').trim();
    const tahun = String(rekapData.tahun || new Date().getFullYear()).trim();
    if (!bulan || !tahun) throw new Error("Bulan dan tahun diperlukan untuk menyimpan rekapitulasi.");

    const docId = String(rekapData.id_rekap || ('REKAP_' + tahun + '_' + bulan)).trim();

    const payload = {
      id_rekap: docId,
      bulan: bulan,
      tahun: tahun,
      unit_kerja: rekapData.unit_kerja || 'Pengadilan Agama Indramayu',
      status: rekapData.status || 'Terkunci / Disahkan',
      pejabat_nama: rekapData.pejabat_nama || '-',
      pejabat_nip: rekapData.pejabat_nip || '-',
      tgl_pengesahan: rekapData.tgl_pengesahan || new Date().toISOString().split('T')[0],
      total_pegawai: parseInt(rekapData.total_pegawai || 0) || 0,
      rata_rata_satker: parseFloat(rekapData.rata_rata_satker || 0) || 0,
      daftar_nilai: Array.isArray(rekapData.daftar_nilai) ? rekapData.daftar_nilai : [],
      is_firebase: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection(this.REKAP_COLLECTION).doc(docId).set(payload, { merge: true });
    return { status: 'success', id: docId, data: payload, message: 'Dokumen rekapitulasi berhasil disahkan dan disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Dokumen Rekapitulasi Tertentu atau Seluruh Rekap dari Firestore
   */
  async getFirestoreRekapitulasi(tahun, bulan) {
    const db = this.getDb();
    if (!db) return null;

    if (tahun && bulan) {
      const docId = 'REKAP_' + String(tahun).trim() + '_' + String(bulan).trim();
      const doc = await db.collection(this.REKAP_COLLECTION).doc(docId).get();
      return doc.exists ? doc.data() : null;
    }

    let query = db.collection(this.REKAP_COLLECTION);
    if (tahun) query = query.where('tahun', '==', String(tahun).trim());
    const snapshot = await query.get();
    const list = [];
    snapshot.forEach(doc => list.push(doc.data()));
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen Rekapitulasi
   */
  subscribeFirestoreRekapitulasi(callback) {
    const db = this.getDb();
    if (!db) return null;
    return db.collection(this.REKAP_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push(doc.data()));
        if (typeof callback === 'function') callback(list);
      },
      (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore Rekapitulasi:", error)
    );
  },

  /**
   * Menghapus / Membatalkan Pengesahan Rekapitulasi dari Firestore (Admin Only)
   */
  async deleteRekapitulasiFromFirestore(idRekap) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await db.collection(this.REKAP_COLLECTION).doc(String(idRekap).trim()).delete();
    return { status: 'success', message: 'Dokumen rekapitulasi berhasil dihapus / dibuka kuncinya dari Cloud Firestore.' };
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.TranskepFirebase = TranskepFirebase;
}
