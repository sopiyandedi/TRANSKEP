// ========================================================
// FILE: transkep-web/core/firebase.js
// DESKRIPSI: Inisialisasi & Konektor Resmi Firebase Cloud Firestore
// PROJEK: TRANSKEP (transkep-314c0)
// ENGINE: TRANSKEP Core v1.0.0 
// ========================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBS64rl8AAwofd-tLfNTu_ibcFwHydiAgE",
  authDomain: "transkep-314c0.firebaseapp.com",
  projectId: "transkep-314c0",
  storageBucket: "transkep-314c0.firebasestorage.app",
  messagingSenderId: "167890717834",
  appId: "1:167890717834:web:66d7f5295cc508c635b173",
  measurementId: "G-51RYSSNHDP"
};

let transkepDb = null;
let transkepAppCheck = null;

// Konfigurasi reCAPTCHA Enterprise / Fraud Defense App Check (Opt-In: aktifkan via window.TRANSKEP_ENABLE_APP_CHECK = true bila GCP Billing & App Check Enforce diaktifkan)
const TRANSKEP_RECAPTCHA_SITE_KEY = '6LfkOv8tAAAAAPm0LLzS7uJmKRUcmNBIuYZymlRz';
const TRANSKEP_ENABLE_APP_CHECK = (typeof window !== 'undefined' && window.TRANSKEP_ENABLE_APP_CHECK === true);

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    // Inisialisasi Firebase App Check (Hanya dijalankan bila diaktifkan secara eksplisit agar tidak memicu /clr 400 pada paket Spark / mode Unenforced)
    try {
      if (TRANSKEP_ENABLE_APP_CHECK && typeof firebase.appCheck === 'function' && TRANSKEP_RECAPTCHA_SITE_KEY) {
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
      } else {
        console.log("🛡️ [TRANSKEP Security] Proteksi Zero-Trust aktif via Custom Token Auth (RS256) & Firestore Rules.");
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
  _authReady: false,
  _authResolved: false,
  _authNip: '',
  _authRole: '',
  _lastAuthError: '',
  _authPromise: null,
  _authPendingQueue: [],
  _activeUnsubs: [],
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
  getCallerIdentity() {
    const lsNip = (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || '') : '');
    const lsRole = (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_user_role') || '') : '');
    const nip = String(this._authNip || lsNip).replace(/['"\s]/g, '').trim();
    const roleLower = String(this._authRole || lsRole).toLowerCase().trim();
    const isAdmin = ['admin', 'super admin', 'administrator', 'operator'].includes(roleLower);
    return { nip, role: roleLower, isAdmin };
  },
  _flushAuthQueue() {
    const q = this._authPendingQueue.splice(0, this._authPendingQueue.length);
    for (let i = 0; i < q.length; i++) {
      try { q[i](); } catch (e) { console.warn('[TRANSKEP Firebase] Queue flush err:', e); }
    }
  },
  _whenAuthGatedSnapshot(createUnsubFn) {
    let cancelled = false;
    let realUnsub = null;
    const attach = () => {
      if (cancelled) return;
      try {
        const res = createUnsubFn();
        if (typeof res === 'function') {
          realUnsub = res;
          this._activeUnsubs.push(res);
        }
      } catch (e) {
        console.warn('[TRANSKEP Firebase] Listener attach err:', e);
      }
    };
    if (this._authResolved) {
      attach();
    } else {
      this._authPendingQueue.push(attach);
    }
    return () => {
      cancelled = true;
      if (typeof realUnsub === 'function') {
        try { realUnsub(); } catch (e) {}
      }
    };
  },
  _hasStoredSession() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return !!(localStorage.getItem('transkep_active_nip') && localStorage.getItem('transkep_session_token'));
    } catch (e) {
      return false;
    }
  },
  async _ensureAuthForRead(requireAdmin) {
    if (!this._authResolved) {
      if (!this._hasStoredSession()) return false;
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, 8000);
        this._authPendingQueue.push(finish);
      });
    }
    if (!this._authReady) return false;
    if (requireAdmin && !this.getCallerIdentity().isAdmin) return false;
    return true;
  },
  async _queryMultiFieldParticipant(collectionName, keyField, fields, nip, extraFilters) {
    const db = this.getDb();
    if (!db || !nip) return [];
    const map = {};
    const promises = fields.map(async (f) => {
      try {
        let q = db.collection(collectionName).where(f, '==', nip);
        if (Array.isArray(extraFilters)) {
          extraFilters.forEach(([ef, op, val]) => { q = q.where(ef, op, val); });
        }
        const snap = await q.get();
        snap.forEach(doc => {
          const d = doc.data();
          const k = String((d && d[keyField]) || doc.id || '').trim();
          if (k) map[k] = d;
        });
      } catch (e) {
        console.warn(`[TRANSKEP Firebase] Scoped query error on ${collectionName}.${f}:`, e && e.message ? e.message : e);
      }
    });
    await Promise.all(promises);
    return Object.values(map);
  },
  _subscribeMultiFieldParticipant(collectionName, keyField, fields, nip, callback) {
    const db = this.getDb();
    if (!db || !nip) return null;
    const mergedByKey = {};
    const fieldMaps = fields.map(() => ({}));
    const emitMerged = () => {
      const combined = {};
      for (let i = 0; i < fieldMaps.length; i++) {
        Object.assign(combined, fieldMaps[i]);
      }
      if (typeof callback === 'function') callback(Object.values(combined));
    };
    const unsubs = fields.map((f, idx) => {
      return db.collection(collectionName).where(f, '==', nip).onSnapshot(
        (snapshot) => {
          const cur = {};
          snapshot.forEach(doc => {
            const d = doc.data();
            const k = String((d && d[keyField]) || doc.id || '').trim();
            if (k) { cur[k] = d; mergedByKey[k] = d; }
          });
          fieldMaps[idx] = cur;
          emitMerged();
        },
        (error) => console.warn(`❌ [TRANSKEP Firebase] Scoped listener (${collectionName}.${f}) error:`, error && error.message ? error.message : error)
      );
    });
    return () => {
      unsubs.forEach(u => { if (typeof u === 'function') { try { u(); } catch (e) {} } });
    };
  },
  async _getUserRoleClaim(user) {
    if (!user) return '';
    try {
      if (typeof user.getIdTokenResult === 'function') {
        const tokRes = await user.getIdTokenResult();
        if (tokRes && tokRes.claims && tokRes.claims.role) {
          return String(tokRes.claims.role).trim();
        }
      }
    } catch (e) {}
    return '';
  },
  async authenticateWithCustomToken(customToken, fallbackIdentity) {
    const runAuth = async () => {
      let signInAttempted = false;
      let lastAuthErr = null;
      const expectedNip = String((fallbackIdentity && fallbackIdentity.nip) || '').replace(/['"\s]/g, '').trim();
      const expectedRole = String((fallbackIdentity && fallbackIdentity.role) || '').trim();
      try {
        const fbAuth = (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') ? firebase.auth() : null;
        if (customToken && fbAuth) {
          signInAttempted = true;
          const cred = await fbAuth.signInWithCustomToken(String(customToken).trim());
          const user = cred && cred.user;
          if (user) {
            const claimRole = await this._getUserRoleClaim(user);
            const roleClaim = claimRole || expectedRole;
            this._authNip = String(user.uid || expectedNip || '').replace(/['"\s]/g, '').trim();
            this._authRole = String(roleClaim || '').trim();
            this._lastAuthError = '';
            this._authReady = true;
            this._authResolved = true;
            console.log('🔐 [TRANSKEP Firebase] Custom Token Auth terverifikasi untuk NIP:', this._authNip, 'Role:', this._authRole);
            this._flushAuthQueue();
            return true;
          }
        } else if (!customToken && fbAuth && fbAuth.currentUser && expectedNip && String(fbAuth.currentUser.uid || '').trim() === expectedNip) {
          const claimRole = await this._getUserRoleClaim(fbAuth.currentUser);
          const roleOk = Boolean(claimRole) && (!expectedRole || claimRole.toLowerCase() === expectedRole.toLowerCase());
          if (roleOk || typeof fbAuth.currentUser.getIdTokenResult !== 'function') {
            this._authNip = String(fbAuth.currentUser.uid).trim();
            this._authRole = String(claimRole || expectedRole || '').trim();
            this._lastAuthError = '';
            this._authReady = true;
            this._authResolved = true;
            this._flushAuthQueue();
            return true;
          }
          this._lastAuthError = `Sesi Firebase tersimpan untuk NIP ${expectedNip} tidak memiliki claim role (${claimRole || 'kosong'}). Memerlukan refresh token.`;
        }
      } catch (err) {
        lastAuthErr = err;
        const errCode = err && err.code ? '[' + err.code + '] ' : '';
        this._lastAuthError = errCode + (err && err.message ? err.message : String(err));
        console.warn('⚠️ [TRANSKEP Firebase] Gagal signInWithCustomToken:', this._lastAuthError);
      }
      this._authNip = String(expectedNip || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '').replace(/['"\s]/g, '').trim();
      this._authRole = String(expectedRole || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_user_role') : '') || '').trim();
      this._authReady = false;
      this._authResolved = true;
      if (!signInAttempted) {
        const fbMsg = fallbackIdentity && fallbackIdentity.authError ? String(fallbackIdentity.authError) : '';
        this._lastAuthError = fbMsg || this._lastAuthError || 'Custom token Firebase belum tersedia dari server Apps Script (periksa FIREBASE_SERVICE_ACCOUNT_JSON atau login ulang).';
        console.warn('⚠️ [TRANSKEP Auth]', this._lastAuthError);
      } else if (lastAuthErr && String((lastAuthErr.code || '') + ' ' + (lastAuthErr.message || '')).toLowerCase().includes('configuration')) {
        console.warn('⚠️ [TRANSKEP Auth] Firebase Authentication Sign-in Method belum diaktifkan di Firebase Console.');
      }
      this._flushAuthQueue();
      return false;
    };

    const p = runAuth().finally(() => {
      if (this._authPromise === p) this._authPromise = null;
    });
    this._authPromise = p;
    return p;
  },
  async signOutFirebase() {
    while (this._activeUnsubs.length > 0) {
      const fn = this._activeUnsubs.pop();
      if (typeof fn === 'function') {
        try { fn(); } catch (e) {}
      }
    }
    this._authPendingQueue = [];
    this._authPromise = null;
    this._authReady = false;
    this._authResolved = false;
    this._authNip = '';
    this._authRole = '';
    this._lastAuthError = '';
    try {
      if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
        await firebase.auth().signOut();
      }
    } catch (e) {}
  },

  // ==========================================
  // OPERASI AUDIT LOG AKTIVITAS & INSIDEN KEAMANAN (ADMIN ONLY READ)
  // ==========================================
  AUDIT_LOGS_COLLECTION: 'audit_logs',
  SECURITY_INCIDENTS_COLLECTION: 'security_incidents',

  isStrictAdminCaller() {
    const id = this.getCallerIdentity();
    return ['admin', 'super admin', 'administrator'].includes(String((id && id.role) || '').trim().toLowerCase());
  },

  async logAuditActivity(entry) {
    try {
      const db = this.getDb();
      if (!db || !this._authReady || !entry || typeof entry !== 'object') return false;
      const caller = this.getCallerIdentity();
      const actorNip = String(entry.actor_nip || caller.nip || '').replace(/['"\s]/g, '').trim();
      if (!actorNip) return false;

      const uObj = (typeof state !== 'undefined' && state.user) ? state.user : null;
      const actorNama = String(entry.actor_nama || (uObj && uObj.nama) || '').trim().slice(0, 150);
      const actorRole = String(entry.actor_role || (uObj && uObj.role) || caller.role || '').trim().slice(0, 150);

      const allowedKat = { LOGIN: true, PEGAWAI: true, CUTI: true, DOKUMEN: true, KEAMANAN: true, SISTEM: true };
      const katRaw = String(entry.kategori || 'SISTEM').trim().toUpperCase();
      const kategori = allowedKat[katRaw] ? katRaw : 'SISTEM';
      const sevRaw = String(entry.severity || 'info').trim().toLowerCase();
      const severity = (sevRaw === 'warning' || sevRaw === 'critical') ? sevRaw : 'info';
      const docId = 'AUD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).slice(0, 150);

      await db.collection(this.AUDIT_LOGS_COLLECTION).doc(docId).set({
        id: docId,
        waktu: waktu,
        actor_nip: actorNip.slice(0, 50),
        actor_nama: actorNama,
        actor_role: actorRole,
        kategori: kategori,
        aksi: String(entry.aksi || 'AKSI_SISTEM').trim().slice(0, 100),
        target: String(entry.target || '').trim().slice(0, 150),
        detail: String(entry.detail || '').trim().slice(0, 1000),
        sumber: 'client',
        severity: severity,
        timestamp: this._serverTimestamp()
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  async getFirestoreAuditLogs(limitCount = 250) {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(true)) || !this.isStrictAdminCaller()) return [];
    const maxDocs = Math.min(500, Math.max(10, Number(limitCount) || 250));
    const snapshot = await db.collection(this.AUDIT_LOGS_COLLECTION).orderBy('timestamp', 'desc').limit(maxDocs).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return list;
  },

  async getFirestoreSecurityIncidents(limitCount = 150) {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(true)) || !this.isStrictAdminCaller()) return [];
    const maxDocs = Math.min(500, Math.max(10, Number(limitCount) || 150));
    const snapshot = await db.collection(this.SECURITY_INCIDENTS_COLLECTION).orderBy('timestamp', 'desc').limit(maxDocs).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return list;
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

    await this._waitAuthForWrite('saveSkToFirestore');

    const docId = String(skData.id || ('SK-' + Date.now())).trim();
    const serverTs = this._serverTimestamp();
    const cleanLink = this._cleanOptionalUrl(skData.link_drive);
    const payload = {
      id: docId,
      judul_sk: String(skData.judul_sk || '-'),
      no_sk: String(skData.no_sk || '-'),
      pj_sk: String(skData.pj_sk || 'PJ. Kesekretariatan'),
      link_drive: cleanLink || '-',
      tgl_sk: String(skData.tgl_sk || ''),
      tgl_input: String(skData.tgl_input || new Date().toISOString().split('T')[0]),
      status: String(skData.status || 'Aktif'),
      versi_aktif: Number(skData.versi_aktif) || 1,
      members: Array.isArray(skData.members) ? skData.members : [],
      naskah_utama: skData.naskah_utama || null,
      lampiran: Array.isArray(skData.lampiran) ? skData.lampiran : [],
      template_gdoc_id: String(skData.template_gdoc_id || ''),
      revisi_history: Array.isArray(skData.revisi_history) ? skData.revisi_history : [{
        versi: Number(skData.versi_aktif) || 1,
        tgl_revisi: skData.tgl_input || new Date().toISOString().split('T')[0],
        catatan: "Inisiasi awal dokumen SK",
        oleh: (typeof state !== 'undefined' && state.user) ? state.user.nama : 'Admin'
      }],
      is_firebase: true,
      updated_at: serverTs
    };

    if (!this._isFirestoreTimestamp(skData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.SK_COLLECTION, docId, payload, this.SK_ALLOWED_FIELDS);
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'SIMPAN_SK', target: docId, detail: 'Menyimpan/memperbarui SK: ' + payload.judul_sk });
    return { status: 'success', id: docId, data: payload };
  },

  /**
   * Menghapus Dokumen SK dari Cloud Firestore
   */
  async deleteSkFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteSkFromFirestore');
    const cleanId = String(docId).trim();
    await db.collection(this.SK_COLLECTION).doc(cleanId).delete();
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'HAPUS_SK', target: cleanId, detail: 'Menghapus dokumen SK ' + cleanId, severity: 'warning' });
    return { status: 'success', message: 'Dokumen SK berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen SK dari Firestore
   */
  async getFirestoreSks() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
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
    return this._whenAuthGatedSnapshot(() => db.collection(this.SK_COLLECTION).onSnapshot(
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
    ));
  },

  /**
   * TAHAP 81: Menyimpan Konfirmasi Baca (Acknowledgment) SK ke Cloud Firestore
   * Disimpan langsung di dalam array acknowledgments pada dokumen SK (1 koleksi terpadu)
   */
  async acknowledgeSkInFirestore(skId, nip, tanggalBaca) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('acknowledgeSkInFirestore');

    const rawSkId = String(skId || '').replace(/['"\s]/g, '').trim();
    const cleanSkId = /^(SK-\d{10,})-\d{1,3}$/.test(rawSkId) ? rawSkId.replace(/-\d{1,3}$/, '') : rawSkId;
    const cleanNip = this._normNip(nip || this.getCallerIdentity().nip);
    let tgl = tanggalBaca;
    if (!tgl) {
      const d = new Date();
      tgl = (("0"+d.getDate()).slice(-2)) + '/' + (("0"+(d.getMonth()+1)).slice(-2)) + '/' + d.getFullYear() + ' ' + d.toLocaleTimeString('en-GB');
    }

    const ackItem = { nip: cleanNip, tanggal_baca: tgl };

    await db.collection(this.SK_COLLECTION).doc(cleanSkId).update({
      acknowledgments: firebase.firestore.FieldValue.arrayUnion(ackItem),
      updated_at: this._serverTimestamp()
    });

    return { status: 'success', sk_id: cleanSkId, nip: cleanNip, tanggal_baca: tgl, message: 'Acknowledgment SK berhasil dicatat di Cloud Firestore.' };
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

    await this._waitAuthForWrite('saveJobdesToFirestore');

    const docId = this._normNip(jobdesData.nip);
    if (!docId) throw new Error("NIP pegawai diperlukan untuk menyimpan dokumen Jobdes.");

    const asStr = (v, fb = '') => (v === undefined || v === null) ? fb : String(v);
    const payload = {
      nip: docId,
      atasan_nip: this._normNip(jobdesData.atasan_nip),
      dasar_lampiran: asStr(jobdesData.dasar_lampiran, '-') || '-',
      ikhtisar_jabatan: asStr(jobdesData.ikhtisar_jabatan, ''),
      tugas_pokok: asStr(jobdesData.tugas_pokok, ''),
      tugas_tambahan: asStr(jobdesData.tugas_tambahan, ''),
      wewenang: (jobdesData.wewenang !== undefined && jobdesData.wewenang !== null) ? String(jobdesData.wewenang) : '-',
      tanggung_jawab: asStr(jobdesData.tanggung_jawab, ''),
      hasil_kerja: asStr(jobdesData.hasil_kerja, ''),
      bawahan_langsung: (jobdesData.bawahan_langsung !== undefined && jobdesData.bawahan_langsung !== null) ? String(jobdesData.bawahan_langsung) : '-',
      is_firebase: true,
      updated_at: this._serverTimestamp()
    };

    if (jobdesData.updated_by) {
      payload.updated_by = String(jobdesData.updated_by).slice(0, 150);
    }

    await this._writeDocWithDiagnostics(db, this.JOBDES_COLLECTION, docId, payload, this.JOBDES_ALLOWED_FIELDS);
    return { status: 'success', nip: docId, data: payload, message: 'Uraian tugas berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Menyimpan Banyak Dokumen Jobdes Sekaligus (Batch Write) ke Firestore
   * Mendukung hingga 500 dokumen per batch secara atomik & instan
   */
  async bulkSaveJobdesBatchToFirestore(jobdesList, updatedByNip) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    if (!Array.isArray(jobdesList) || jobdesList.length === 0) {
      return { status: 'success', count: 0, message: 'Tidak ada data untuk disimpan.' };
    }

    await this._waitAuthForWrite('bulkSaveJobdesBatchToFirestore');

    const CHUNK_SIZE = 450;
    let savedCount = 0;
    const asStr = (v, fb = '') => (v === undefined || v === null) ? fb : String(v);

    for (let i = 0; i < jobdesList.length; i += CHUNK_SIZE) {
      const chunk = jobdesList.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      const validItems = [];

      chunk.forEach(item => {
        const docId = this._normNip(item && item.nip);
        if (!docId) return;

        const docRef = db.collection(this.JOBDES_COLLECTION).doc(docId);
        const payload = {
          nip: docId,
          dasar_lampiran: asStr(item.dasar_lampiran, '-') || '-',
          tugas_pokok: asStr(item.tugas_pokok, ''),
          is_firebase: true,
          updated_at: this._serverTimestamp()
        };

        if (item.atasan_nip !== undefined && item.atasan_nip !== null) {
          payload.atasan_nip = this._normNip(item.atasan_nip);
        }
        if (item.ikhtisar_jabatan !== undefined && item.ikhtisar_jabatan !== null) {
          payload.ikhtisar_jabatan = String(item.ikhtisar_jabatan);
        }
        if (item.tugas_tambahan !== undefined && item.tugas_tambahan !== null) {
          payload.tugas_tambahan = String(item.tugas_tambahan);
        }
        if (item.wewenang !== undefined && item.wewenang !== null) {
          payload.wewenang = String(item.wewenang);
        }
        if (item.tanggung_jawab !== undefined && item.tanggung_jawab !== null) {
          payload.tanggung_jawab = String(item.tanggung_jawab);
        }
        if (item.hasil_kerja !== undefined && item.hasil_kerja !== null) {
          payload.hasil_kerja = String(item.hasil_kerja);
        }
        if (item.bawahan_langsung !== undefined && item.bawahan_langsung !== null) {
          payload.bawahan_langsung = String(item.bawahan_langsung);
        }
        if (updatedByNip) {
          payload.updated_by = String(updatedByNip).slice(0, 150);
        }

        batch.set(docRef, payload, { merge: true });
        validItems.push(item);
      });

      try {
        await batch.commit();
        savedCount += validItems.length;
      } catch (batchErr) {
        const msg = String((batchErr && (batchErr.code || batchErr.message)) || batchErr || '').toLowerCase();
        if (!msg.includes('permission') && !msg.includes('insufficient')) {
          throw batchErr;
        }
        // Fallback per-item dengan self-healing legacy fields bila ada dokumen lama yang menolak merge
        for (const item of validItems) {
          await this.saveJobdesToFirestore({ ...item, updated_by: updatedByNip || item.updated_by });
          savedCount++;
        }
      }
    }

    return {
      status: 'success',
      count: savedCount,
      message: `Berhasil menyimpan ${savedCount} Uraian Tugas ke Cloud Firestore.`
    };
  },

  /**
   * Mengambil Seluruh Dokumen Jobdes dari Firestore
   */
  async getFirestoreJobdes() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
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
    return this._whenAuthGatedSnapshot(() => db.collection(this.JOBDES_COLLECTION).onSnapshot(
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
    ));
  },

  /**
   * Menyimpan Usulan Reposisi ke Firestore
   */
  async saveUsulanJobdesToFirestore(usulanData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('saveUsulanJobdesToFirestore');

    const caller = this.getCallerIdentity();
    const usulanId = String(usulanData.id || ('USUL-' + Date.now())).trim();
    const payload = {
      id: usulanId,
      nip_pegawai: this._normNip(usulanData.nip_pegawai),
      pengusul_nip: this._normNip(usulanData.pengusul_nip || caller.nip),
      nama_pegawai: String(usulanData.nama_pegawai || '-').slice(0, 150),
      nama_pengusul: String(usulanData.nama_pengusul || '-').slice(0, 150),
      isi_usulan: String(usulanData.isi_usulan || '-').slice(0, 4000),
      status: usulanData.status || 'Menunggu',
      is_firebase: true
    };
    if (!usulanData.id || !this._isFirestoreTimestamp(usulanData.created_at)) {
      payload.created_at = this._serverTimestamp();
    }

    await this._writeDocWithDiagnostics(db, this.JOBDES_USULAN_COLLECTION, usulanId, payload, this.JOBDES_USULAN_ALLOWED_FIELDS, { adminOnly: false });
    return { status: 'success', id: usulanId, data: payload, message: 'Usulan reposisi berhasil dikirim ke Cloud Firestore.' };
  },

  /**
   * Memasang Realtime Listener untuk Usulan Jobdes
   */
  subscribeFirestoreUsulanJobdes(callback) {
    const db = this.getDb();
    if (!db) return null;
    return this._whenAuthGatedSnapshot(() => {
      const caller = this.getCallerIdentity();
      if (!caller.isAdmin && !caller.nip) return null;
      const queryRef = caller.isAdmin
        ? db.collection(this.JOBDES_USULAN_COLLECTION)
        : db.collection(this.JOBDES_USULAN_COLLECTION).where('nip_pegawai', '==', caller.nip);
      return queryRef.onSnapshot(
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
    });
  },

  /**
   * Menandai Usulan Selesai di Firestore
   */
  async tandaiUsulanSelesaiInFirestore(usulanId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('tandaiUsulanSelesaiInFirestore');
    const cleanId = String(usulanId || '').trim();
    const serverTs = this._serverTimestamp();
    try {
      await db.collection(this.JOBDES_USULAN_COLLECTION).doc(cleanId).update({
        status: 'Selesai',
        completed_at: serverTs
      });
    } catch (updErr) {
      const msg = String((updErr && (updErr.code || updErr.message)) || updErr || '').toLowerCase();
      if (!msg.includes('permission') && !msg.includes('insufficient')) {
        throw updErr;
      }
      await this._writeDocWithDiagnostics(db, this.JOBDES_USULAN_COLLECTION, cleanId, {
        id: cleanId,
        status: 'Selesai',
        completed_at: serverTs
      }, this.JOBDES_USULAN_ALLOWED_FIELDS);
    }
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

    await this._waitAuthForWrite('saveSopToFirestore');

    const docId = String(sopData.id || ('SOP-' + Date.now())).trim();
    const serverTs = this._serverTimestamp();
    let pelaksanaArr = [];
    if (Array.isArray(sopData.pelaksana)) {
      pelaksanaArr = sopData.pelaksana;
    } else if (sopData.pelaksana_json) {
      try { pelaksanaArr = JSON.parse(sopData.pelaksana_json); } catch(e) { pelaksanaArr = []; }
    }

    const cleanLink = this._cleanOptionalUrl(sopData.link_drive);
    const payload = {
      id: docId,
      judul_sop: String(sopData.judul_sop || '-'),
      nomor_sop: String(sopData.nomor_sop || '-'),
      kategori_pj: String(sopData.kategori_pj || 'PJ. Kesekretariatan'),
      tanggal_pembuatan: String(sopData.tanggal_pembuatan || ''),
      tanggal_revisi: String(sopData.tanggal_revisi || '-'),
      tanggal_efektif: String(sopData.tanggal_efektif || ''),
      link_drive: cleanLink || '-',
      pelaksana: pelaksanaArr,
      pelaksana_json: JSON.stringify(pelaksanaArr),
      is_firebase: true,
      updated_at: serverTs
    };

    if (Array.isArray(sopData.acknowledgments)) {
      payload.acknowledgments = sopData.acknowledgments;
    }

    if (!this._isFirestoreTimestamp(sopData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.SOP_COLLECTION, docId, payload, this.SOP_ALLOWED_FIELDS);
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'SIMPAN_SOP', target: docId, detail: 'Menyimpan/memperbarui SOP: ' + payload.judul_sop });
    return { status: 'success', id: docId, data: payload, message: 'Dokumen SOP berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Menghapus Dokumen SOP dari Cloud Firestore
   */
  async deleteSopFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteSopFromFirestore');
    const cleanId = String(docId).trim();
    await db.collection(this.SOP_COLLECTION).doc(cleanId).delete();
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'HAPUS_SOP', target: cleanId, detail: 'Menghapus dokumen SOP ' + cleanId, severity: 'warning' });
    return { status: 'success', message: 'Dokumen SOP berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen SOP dari Firestore
   */
  async getFirestoreSops() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
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
    return this._whenAuthGatedSnapshot(() => db.collection(this.SOP_COLLECTION).onSnapshot(
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
    ));
  },

  /**
   * Menyimpan Konfirmasi Baca (Acknowledgment) SOP ke Firestore
   * Disimpan langsung di dalam array acknowledgments pada dokumen SOP (1 koleksi terpadu)
   */
  async acknowledgeSopInFirestore(sopId, nip, tanggalBaca) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('acknowledgeSopInFirestore');

    const cleanSopId = String(sopId || '').replace(/['"\s]/g, '').trim();
    const cleanNip = this._normNip(nip || this.getCallerIdentity().nip);
    let tgl = tanggalBaca;
    if (!tgl) {
      const d = new Date();
      tgl = (("0"+d.getDate()).slice(-2)) + '/' + (("0"+(d.getMonth()+1)).slice(-2)) + '/' + d.getFullYear() + ' ' + d.toLocaleTimeString('en-GB');
    }

    const ackItem = { nip: cleanNip, tanggal_baca: tgl };

    await db.collection(this.SOP_COLLECTION).doc(cleanSopId).update({
      acknowledgments: firebase.firestore.FieldValue.arrayUnion(ackItem),
      updated_at: this._serverTimestamp()
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

    await this._waitAuthForWrite('saveMasterKinerjaToFirestore');

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
      kategori: String(templateData.kategori || 'Kepaniteraan'),
      aliases: aliases,
      sasaran_list: Array.isArray(templateData.sasaran_list) ? templateData.sasaran_list : [],
      is_firebase: true,
      updated_at: this._serverTimestamp(),
      updated_by: String(templateData.updated_by || ((typeof state !== 'undefined' && state.user) ? state.user.nama : 'Admin')).slice(0, 150)
    };

    await this._writeDocWithDiagnostics(db, this.MASTER_KINERJA_COLLECTION, docId, payload, this.MASTER_KINERJA_ALLOWED_FIELDS);
    return { status: 'success', id: docId, data: payload, message: 'Template jabatan berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Template Kamus Jabatan dari Firestore
   */
  async getFirestoreMasterKinerja() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
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
    await this._waitAuthForWrite('deleteMasterKinerjaFromFirestore');
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

    await this._waitAuthForWrite('savePkpToFirestore');

    const nipPegawai = this._normNip(pkpData.nip_pegawai || pkpData.nip || pkpData.nipPegawai);
    const tahun = String(pkpData.tahun || new Date().getFullYear()).trim();
    if (!nipPegawai) throw new Error("NIP pegawai diperlukan untuk menyimpan dokumen PK.");

    const docId = String(pkpData.id_pkp || ('PKP_' + tahun + '_' + nipPegawai)).trim();
    const serverTs = this._serverTimestamp();

    const payload = {
      id_pkp: docId,
      nip_pegawai: nipPegawai,
      nip: nipPegawai,
      nip_penilai: this._normNip(pkpData.nip_penilai || pkpData.penilai),
      nip_atasan_pejabat: this._normNip(pkpData.nip_atasan_pejabat || pkpData.atasan_pejabat),
      tahun: tahun,
      status: String(pkpData.status || 'Draft'),
      nilai_akhir: String(pkpData.nilai_akhir || pkpData.nilai || '0'),
      items: Array.isArray(pkpData.items) ? pkpData.items : [],
      is_firebase: true,
      updated_at: serverTs
    };

    if (!this._isFirestoreTimestamp(pkpData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.PKP_COLLECTION, docId, payload, this.PKP_ALLOWED_FIELDS, { adminOnly: false });
    return { status: 'success', id: docId, id_pkp: docId, data: payload, message: 'Dokumen PK berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Memperbarui Status Dokumen PK Secara Aman (Kirim / Setujui / Tolak)
   */
  async updatePkpStatusInFirestore(idPkp, newStatus, actorNip) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('updatePkpStatusInFirestore');

    const cleanId = String(idPkp || '').trim();
    const cleanActor = this._normNip(actorNip || this.getCallerIdentity().nip);
    const updatePayload = {
      status: String(newStatus || 'Draft'),
      updated_at: this._serverTimestamp(),
      last_action_by: cleanActor
    };
    try {
      await db.collection(this.PKP_COLLECTION).doc(cleanId).update(updatePayload);
    } catch (updErr) {
      const msg = String((updErr && (updErr.code || updErr.message)) || updErr || '').toLowerCase();
      if (!msg.includes('permission') && !msg.includes('insufficient')) throw updErr;
      if (this.getCallerIdentity().isAdmin) {
        await this._writeDocWithDiagnostics(db, this.PKP_COLLECTION, cleanId, updatePayload, this.PKP_ALLOWED_FIELDS, { adminOnly: false });
      } else {
        throw updErr;
      }
    }
    return { status: 'success', id: cleanId, data: updatePayload };
  },

  /**
   * Mengambil Dokumen PK dari Firestore
   */
  async getFirestorePkps(filterNip, filterTahun) {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
    const caller = this.getCallerIdentity();
    if (!caller.isAdmin) {
      if (!caller.nip) return [];
      const extra = filterTahun ? [['tahun', '==', String(filterTahun).trim()]] : [];
      const all = await this._queryMultiFieldParticipant(this.PKP_COLLECTION, 'id_pkp', ['nip_pegawai', 'nip_penilai', 'nip_atasan_pejabat'], caller.nip, extra);
      return filterNip ? all.filter(d => String(d.nip_pegawai || '').trim() === String(filterNip).trim()) : all;
    }
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
    return this._whenAuthGatedSnapshot(() => {
      const caller = this.getCallerIdentity();
      if (caller.isAdmin) {
        return db.collection(this.PKP_COLLECTION).onSnapshot(
          (snapshot) => {
            const list = [];
            snapshot.forEach(doc => list.push(doc.data()));
            if (typeof callback === 'function') callback(list);
          },
          (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore PKP:", error)
        );
      }
      if (!caller.nip) return null;
      return this._subscribeMultiFieldParticipant(this.PKP_COLLECTION, 'id_pkp', ['nip_pegawai', 'nip_penilai', 'nip_atasan_pejabat'], caller.nip, callback);
    });
  },

  /**
   * Menghapus Dokumen PK dari Firestore
   */
  async deletePkpFromFirestore(idPkp) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deletePkpFromFirestore');
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

    await this._waitAuthForWrite('savePckToFirestore');

    const nipPegawai = this._normNip(pckData.nip_pegawai || pckData.nip || pckData.nipPegawai);
    const bulan = String(pckData.bulan || '').trim();
    const tahun = String(pckData.tahun || new Date().getFullYear()).trim();
    if (!nipPegawai || !bulan) throw new Error("NIP pegawai dan bulan diperlukan untuk menyimpan dokumen PCK.");

    const docId = String(pckData.id_pck || ('PCK_' + tahun + '_' + bulan + '_' + nipPegawai)).trim();
    const itemsList = Array.isArray(pckData.realisasi || pckData.items) ? (pckData.realisasi || pckData.items) : [];
    const serverTs = this._serverTimestamp();

    let nipPenilai = this._normNip(pckData.nip_penilai || pckData.penilai);
    let nipAtasan = this._normNip(pckData.nip_atasan_pejabat || pckData.atasan_pejabat);
    if (!nipPenilai || !nipAtasan) {
      const pkpPool = [
        ...((typeof window !== 'undefined' && window.vueState && Array.isArray(window.vueState.pkpDokumen)) ? window.vueState.pkpDokumen : []),
        ...((typeof state !== 'undefined' && Array.isArray(state.pkpDokumen)) ? state.pkpDokumen : [])
      ];
      const pkpMatch = pkpPool.find(p => this._normNip(p.nip || p.nip_pegawai) === nipPegawai && String(p.tahun || '').trim() === tahun)
        || pkpPool.find(p => this._normNip(p.nip || p.nip_pegawai) === nipPegawai);
      if (pkpMatch) {
        if (!nipPenilai) nipPenilai = this._normNip(pkpMatch.nip_penilai || pkpMatch.penilai);
        if (!nipAtasan) nipAtasan = this._normNip(pkpMatch.nip_atasan_pejabat || pkpMatch.atasan_pejabat);
      }
    }
    if (!nipPenilai || !nipAtasan) {
      const pckPool = [
        ...((typeof window !== 'undefined' && window.vueState && Array.isArray(window.vueState.pckDokumen)) ? window.vueState.pckDokumen : []),
        ...((typeof state !== 'undefined' && Array.isArray(state.pckDokumen)) ? state.pckDokumen : [])
      ];
      const pckMatch = pckPool.find(p => String(p.id_pck) === docId)
        || pckPool.find(p => this._normNip(p.nip || p.nip_pegawai) === nipPegawai && String(p.tahun || '').trim() === tahun && String(p.bulan || '').trim().toLowerCase() === bulan.toLowerCase());
      if (pckMatch) {
        if (!nipPenilai) nipPenilai = this._normNip(pckMatch.nip_penilai || pckMatch.penilai);
        if (!nipAtasan) nipAtasan = this._normNip(pckMatch.nip_atasan_pejabat || pckMatch.atasan_pejabat);
      }
    }
    if ((!nipPenilai || !nipAtasan) && typeof db.collection === 'function') {
      try {
        const existingRef = db.collection(this.PCK_COLLECTION).doc(docId);
        if (existingRef && typeof existingRef.get === 'function') {
          const existingSnap = await existingRef.get();
          if (existingSnap && existingSnap.exists && typeof existingSnap.data === 'function') {
            const ex = existingSnap.data() || {};
            if (!nipPenilai) nipPenilai = this._normNip(ex.nip_penilai || ex.penilai);
            if (!nipAtasan) nipAtasan = this._normNip(ex.nip_atasan_pejabat || ex.atasan_pejabat);
          }
        }
      } catch (eLookup) {}
    }

    const payload = {
      id_pck: docId,
      nip_pegawai: nipPegawai,
      nip: nipPegawai,
      nip_penilai: nipPenilai,
      nip_atasan_pejabat: nipAtasan,
      bulan: bulan,
      tahun: tahun,
      total_rencana: parseInt(pckData.total_rencana || pckData.rencana || itemsList.length) || 0,
      rencana: parseInt(pckData.rencana || pckData.total_rencana || itemsList.length) || 0,
      progress: String(pckData.progress || '100%'),
      status: String(pckData.status || 'Draft'),
      nilai_akhir: String(pckData.nilai_akhir || '0'),
      realisasi: itemsList,
      is_firebase: true,
      updated_at: serverTs
    };

    if (!this._isFirestoreTimestamp(pckData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.PCK_COLLECTION, docId, payload, this.PCK_ALLOWED_FIELDS, { adminOnly: false });
    return { status: 'success', id: docId, id_pck: docId, data: payload, message: 'Dokumen PCK berhasil disimpan di Cloud Firestore.' };
  },

  /**
   * Memperbarui Status Dokumen PCK Secara Aman (Kirim / Setujui / Tolak)
   */
  async updatePckStatusInFirestore(idPck, newStatus, actorNip) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('updatePckStatusInFirestore');

    const cleanId = String(idPck || '').trim();
    const cleanActor = this._normNip(actorNip || this.getCallerIdentity().nip);
    const updatePayload = {
      status: String(newStatus || 'Draft'),
      updated_at: this._serverTimestamp(),
      last_action_by: cleanActor
    };
    try {
      await db.collection(this.PCK_COLLECTION).doc(cleanId).update(updatePayload);
    } catch (updErr) {
      const msg = String((updErr && (updErr.code || updErr.message)) || updErr || '').toLowerCase();
      if (!msg.includes('permission') && !msg.includes('insufficient')) throw updErr;
      if (this.getCallerIdentity().isAdmin) {
        await this._writeDocWithDiagnostics(db, this.PCK_COLLECTION, cleanId, updatePayload, this.PCK_ALLOWED_FIELDS, { adminOnly: false });
      } else {
        throw updErr;
      }
    }
    return { status: 'success', id: cleanId, data: updatePayload };
  },

  /**
   * Mengambil Dokumen PCK dari Firestore
   */
  async getFirestorePcks(filterNip, filterTahun, filterBulan) {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
    const caller = this.getCallerIdentity();
    if (!caller.isAdmin) {
      if (!caller.nip) return [];
      const extra = [];
      if (filterTahun) extra.push(['tahun', '==', String(filterTahun).trim()]);
      if (filterBulan) extra.push(['bulan', '==', String(filterBulan).trim()]);
      const all = await this._queryMultiFieldParticipant(this.PCK_COLLECTION, 'id_pck', ['nip_pegawai', 'nip_penilai', 'nip_atasan_pejabat'], caller.nip, extra);
      return filterNip ? all.filter(d => String(d.nip_pegawai || '').trim() === String(filterNip).trim()) : all;
    }
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
    return this._whenAuthGatedSnapshot(() => {
      const caller = this.getCallerIdentity();
      if (caller.isAdmin) {
        return db.collection(this.PCK_COLLECTION).onSnapshot(
          (snapshot) => {
            const list = [];
            snapshot.forEach(doc => list.push(doc.data()));
            if (typeof callback === 'function') callback(list);
          },
          (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore PCK:", error)
        );
      }
      if (!caller.nip) return null;
      return this._subscribeMultiFieldParticipant(this.PCK_COLLECTION, 'id_pck', ['nip_pegawai', 'nip_penilai', 'nip_atasan_pejabat'], caller.nip, callback);
    });
  },

  /**
   * Menghapus Dokumen PCK dari Firestore
   */
  async deletePckFromFirestore(idPck) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deletePckFromFirestore');
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

    await this._waitAuthForWrite('saveRekapitulasiToFirestore');

    const bulan = String(rekapData.bulan || '').trim();
    const tahun = String(rekapData.tahun || new Date().getFullYear()).trim();
    if (!bulan || !tahun) throw new Error("Bulan dan tahun diperlukan untuk menyimpan rekapitulasi.");

    const docId = String(rekapData.id_rekap || ('REKAP_' + tahun + '_' + bulan)).trim();
    const rawNipPejabat = this._normNip(rekapData.pejabat_nip) || '-';

    const payload = {
      id_rekap: docId,
      bulan: bulan,
      tahun: tahun,
      unit_kerja: String(rekapData.unit_kerja || 'Pengadilan Agama Indramayu'),
      status: String(rekapData.status || 'Terkunci / Disahkan'),
      pejabat_nama: String(rekapData.pejabat_nama || '-'),
      pejabat_nip: rawNipPejabat,
      tgl_pengesahan: String(rekapData.tgl_pengesahan || new Date().toISOString().split('T')[0]).slice(0, 30),
      total_pegawai: parseInt(rekapData.total_pegawai || 0) || 0,
      rata_rata_satker: parseFloat(rekapData.rata_rata_satker || 0) || 0,
      daftar_nilai: Array.isArray(rekapData.daftar_nilai) ? rekapData.daftar_nilai : [],
      is_firebase: true,
      updated_at: this._serverTimestamp()
    };

    await this._writeDocWithDiagnostics(db, this.REKAP_COLLECTION, docId, payload, this.REKAP_ALLOWED_FIELDS);
    return { status: 'success', id: docId, data: payload, message: 'Dokumen rekapitulasi berhasil disahkan dan disimpan di Cloud Firestore.' };
  },

  /**
   * Mengambil Dokumen Rekapitulasi Tertentu atau Seluruh Rekap dari Firestore
   */
  async getFirestoreRekapitulasi(tahun, bulan) {
    const db = this.getDb();
    if (!db) return null;
    if (!(await this._ensureAuthForRead(true))) {
      return (tahun && bulan) ? null : [];
    }

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
    return this._whenAuthGatedSnapshot(() => {
      if (!this.getCallerIdentity().isAdmin) return null;
      return db.collection(this.REKAP_COLLECTION).onSnapshot(
        (snapshot) => {
          const list = [];
          snapshot.forEach(doc => list.push(doc.data()));
          if (typeof callback === 'function') callback(list);
        },
        (error) => console.error("❌ [TRANSKEP Firebase] Error listener Firestore Rekapitulasi:", error)
      );
    });
  },

  /**
   * Menghapus / Membatalkan Pengesahan Rekapitulasi dari Firestore (Admin Only)
   */
  async deleteRekapitulasiFromFirestore(idRekap) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteRekapitulasiFromFirestore');
    await db.collection(this.REKAP_COLLECTION).doc(String(idRekap).trim()).delete();
    return { status: 'success', message: 'Dokumen rekapitulasi berhasil dihapus / dibuka kuncinya dari Cloud Firestore.' };
  },

  // ==========================================
  // OPERASI DOKUMEN E-OFFICE (KGB & RAPAT)
  // ==========================================
  EOFFICE_KGB_COLLECTION: 'eoffice_kgb',
  EOFFICE_RAPAT_COLLECTION: 'eoffice_rapat',

  _normNip(val) {
    return (val === undefined || val === null) ? '' : String(val).replace(/['"\s]/g, '').trim();
  },

  _serverTimestamp() {
    return (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();
  },

  _isFirestoreTimestamp(val) {
    return Boolean(val && typeof val === 'object' && typeof val.toDate === 'function');
  },

  _cleanOptionalUrl(val) {
    const s = (val === undefined || val === null) ? '' : String(val).trim();
    return (!s || s === '-' || /^https?:\/\//i.test(s)) ? s : '';
  },

  SK_ALLOWED_FIELDS: [
    'id', 'judul_sk', 'no_sk', 'pj_sk', 'link_drive', 'tgl_sk', 'tgl_input',
    'status', 'versi_aktif', 'members', 'naskah_utama', 'lampiran',
    'template_gdoc_id', 'revisi_history', 'acknowledgments', 'is_firebase',
    'updated_at', 'created_at'
  ],

  SOP_ALLOWED_FIELDS: [
    'id', 'judul_sop', 'nomor_sop', 'kategori_pj', 'tanggal_pembuatan',
    'tanggal_revisi', 'tanggal_efektif', 'link_drive', 'pelaksana',
    'pelaksana_json', 'acknowledgments', 'is_firebase', 'updated_at', 'created_at'
  ],

  JOBDES_ALLOWED_FIELDS: [
    'nip', 'atasan_nip', 'dasar_lampiran', 'ikhtisar_jabatan', 'tugas_pokok',
    'tugas_tambahan', 'wewenang', 'tanggung_jawab', 'hasil_kerja',
    'bawahan_langsung', 'updated_by', 'is_firebase', 'updated_at', 'created_at'
  ],

  JOBDES_USULAN_ALLOWED_FIELDS: [
    'id', 'nip_pegawai', 'pengusul_nip', 'nama_pegawai', 'nama_pengusul',
    'isi_usulan', 'status', 'is_firebase', 'created_at', 'completed_at'
  ],

  MASTER_KINERJA_ALLOWED_FIELDS: [
    'id', 'nama_jabatan', 'kategori', 'aliases', 'sasaran_list',
    'is_firebase', 'updated_at', 'updated_by'
  ],

  PKP_ALLOWED_FIELDS: [
    'id_pkp', 'nip_pegawai', 'nip', 'nip_penilai', 'nip_atasan_pejabat',
    'tahun', 'status', 'nilai_akhir', 'items', 'last_action_by',
    'is_firebase', 'updated_at', 'created_at'
  ],

  PCK_ALLOWED_FIELDS: [
    'id_pck', 'nip_pegawai', 'nip', 'nip_penilai', 'nip_atasan_pejabat',
    'bulan', 'tahun', 'total_rencana', 'rencana', 'progress', 'status',
    'nilai_akhir', 'realisasi', 'last_action_by', 'is_firebase',
    'updated_at', 'created_at'
  ],

  REKAP_ALLOWED_FIELDS: [
    'id_rekap', 'bulan', 'tahun', 'unit_kerja', 'status', 'pejabat_nama',
    'pejabat_nip', 'tgl_pengesahan', 'total_pegawai', 'rata_rata_satker',
    'daftar_nilai', 'is_firebase', 'updated_at'
  ],

  SURAT_TUGAS_ALLOWED_FIELDS: [
    'id', 'waktu', 'nomor', 'menimbang', 'dasar', 'tujuan', 'tempat',
    'tgl_mulai', 'tgl_selesai', 'jam', 'peserta', 'pejabat_ttd', 'status',
    'data_ekstra', 'created_by', 'is_firebase', 'updated_at', 'created_at'
  ],

  EOFFICE_KGB_ALLOWED_FIELDS: [
    'id', 'id_kgb', 'nip', 'nama_pegawai', 'nama', 'tempat_lahir', 'tanggal_lahir',
    'pangkat', 'golongan', 'golongan_lama', 'golongan_baru', 'jabatan', 'unit_kerja',
    'nokgb', 'bulan_surat', 'tahun_surat', 'nomor_surat', 'tanggal_surat', 'tujuan_kppn',
    'gaji_lama', 'pejabat_lama', 'nomor_sk_lama', 'tanggal_sk_lama', 'tmt_lama',
    'tahun_lama', 'bulan_lama', 'mkg_lama', 'gaji_baru', 'terbilang_gaji',
    'tahun_baru', 'bulan_baru', 'mkg_baru', 'tmt_baru', 'tmt_yad',
    'nama_ketua', 'dasar_pp', 'status', 'file_doc_url', 'file_pdf_url', 'file_id',
    'doc_url', 'pdf_url', 'doc_id', 'tanggal_input', 'tgl_selesai',
    'tte_status', 'tte_pejabat_nip', 'tte_pejabat_nama', 'tte_submitted_at',
    'tte_signed_at', 'tte_signer', 'tte_qrcode', 'created_by', 'updated_by',
    'synced_at', 'is_from_dashboard', 'is_firebase', 'mysims_requested', 'mysims_status',
    'mysims_idp', 'mysims_requested_at', 'updated_at', 'created_at'
  ],

  EOFFICE_RAPAT_ALLOWED_FIELDS: [
    'id', 'id_rapat', 'nomor_undangan', 'tgl_surat', 'no_urut_surat', 'kode_klasifikasi_surat',
    'kode_pejabat_ttd', 'pejabat_ttd_nip', 'pejabat_ttd_nama', 'pejabat_ttd_jabatan',
    'tampilkan_gelar_undangan', 'lampiran_surat', 'tujuan_undangan_json',
    'agenda', 'agenda_poin', 'dasar_notula', 'jenis_kegiatan', 'jumlah_baris_hadir',
    'hari_tanggal', 'waktu_mulai', 'waktu_selesai', 'tempat',
    'pemimpin', 'pemimpin_nip', 'pemimpin_jabatan',
    'notulis', 'notulis_nip', 'notulis_jabatan',
    'peserta_json', 'pengarahan_umum', 'pembahasan', 'pembahasan_json',
    'kesimpulan', 'foto_rapat_json', 'audio_rapat_url', 'ai_transcript',
    'status', 'doc_undangan_url', 'doc_absen_url', 'doc_notulen_url',
    'folder_url', 'mysims_requested', 'mysims_status', 'mysims_idp',
    'mysims_requested_at', 'tanggal_input', 'created_by', 'updated_by',
    'synced_at', 'is_firebase', 'updated_at', 'created_at'
  ],

  async _waitAuthForWrite(contextName) {
    if (this._authPromise) {
      await this._authPromise.catch(() => false);
    } else if (!this._authResolved && this._hasStoredSession()) {
      await this._ensureAuthForRead(false).catch(() => false);
    }
    const fbAuth = (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') ? firebase.auth() : null;
    if (!fbAuth) return;

    const storedNip = (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_active_nip') || '') : '').replace(/['"\s]/g, '').trim();
    const storedTok = (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_session_token') || '') : '').trim();
    const storedRole = (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_user_role') || '') : '').trim();

    let needsRecovery = !fbAuth.currentUser;
    if (!needsRecovery && fbAuth.currentUser) {
      if (storedNip && String(fbAuth.currentUser.uid || '').trim() !== storedNip) {
        needsRecovery = true;
      } else if (typeof fbAuth.currentUser.getIdTokenResult === 'function') {
        const claimRole = await this._getUserRoleClaim(fbAuth.currentUser);
        if (!claimRole) {
          needsRecovery = true;
        }
      }
    }

    if (needsRecovery && storedNip && storedTok && typeof window !== 'undefined' && window.TranskepAPI && typeof window.TranskepAPI.call === 'function') {
      try {
        const tokRes = await window.TranskepAPI.call('getFirebaseCustomToken', storedNip, storedTok);
        if (tokRes && tokRes.status === 'success' && tokRes.customToken) {
          await this.authenticateWithCustomToken(tokRes.customToken, { nip: storedNip, role: storedRole });
        } else if (tokRes && tokRes.message) {
          this._lastAuthError = String(tokRes.message);
        } else if (tokRes && !tokRes.customToken) {
          this._lastAuthError = 'Backend Apps Script belum menerbitkan Firebase Custom Token (FIREBASE_SERVICE_ACCOUNT_JSON gagal diparsing/sign di GAS).';
        }
      } catch (eRec) {
        this._lastAuthError = (eRec && eRec.message) ? String(eRec.message) : String(eRec);
      }
    }

    if (!fbAuth.currentUser) {
      console.warn(`⚠️ [TRANSKEP Firebase] ${contextName} dipanggil saat firebase.auth().currentUser kosong. Detail: ${this._lastAuthError || 'Belum terautentikasi'}`);
    }
  },

  async _writeDocWithDiagnostics(db, colName, docId, payload, allowedSchemaFields, options) {
    const adminOnly = !options || options.adminOnly !== false;
    const docRef = db.collection(colName).doc(docId);
    try {
      await docRef.set(payload, { merge: true });
    } catch (writeErr) {
      const errTxt = String((writeErr && (writeErr.code || writeErr.message)) || writeErr || '').toLowerCase();
      if (!errTxt.includes('permission') && !errTxt.includes('insufficient')) {
        throw writeErr;
      }

      const fbAuth = (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') ? firebase.auth() : null;
      if (!fbAuth || !fbAuth.currentUser) {
        const reason = this._lastAuthError || 'Token autentikasi sesi Firebase belum diterima.';
        throw new Error(`FirebaseError: [code=permission-denied]: Firebase Auth belum aktif (currentUser kosong). Penyebab: ${reason} Silakan Logout lalu Login ulang.`);
      }

      const claimRole = await this._getUserRoleClaim(fbAuth.currentUser);
      const roleLow = String(claimRole || '').toLowerCase().trim();
      const allowedRoles = ['admin', 'super admin', 'administrator', 'operator'];
      if (adminOnly && (!roleLow || !allowedRoles.includes(roleLow))) {
        throw new Error(`FirebaseError: [code=permission-denied]: Akun Firebase aktif (UID: ${fbAuth.currentUser.uid}), namun claim role="${claimRole || 'kosong'}" bukan Admin/Operator di firestore.rules.`);
      }
      if (!roleLow) {
        throw new Error(`FirebaseError: [code=permission-denied]: Akun Firebase aktif (UID: ${fbAuth.currentUser.uid}), namun claim role kosong di firestore.rules.`);
      }

      // Auth & role valid: inspeksi dokumen lama & jalur read untuk diagnosa presisi serta self-healing field legacy
      let diagInfo = '';
      if (Array.isArray(allowedSchemaFields) && allowedSchemaFields.length > 0 && typeof docRef.get === 'function') {
        try {
          const snap = await docRef.get();
          if (snap && snap.exists && typeof snap.data === 'function') {
            const existing = snap.data() || {};
            const extraKeys = Object.keys(existing).filter(k => !allowedSchemaFields.includes(k));
            const nullKeys = Object.keys(existing).filter(k => allowedSchemaFields.includes(k) && (existing[k] === null || existing[k] === undefined));
            const badCreatedAt = allowedSchemaFields.includes('created_at') &&
              Object.prototype.hasOwnProperty.call(existing, 'created_at') &&
              existing.created_at !== null &&
              existing.created_at !== undefined &&
              !this._isFirestoreTimestamp(existing.created_at);
            const idOk = (!existing.id || existing.id === docId) &&
                         (!existing.id_kgb || existing.id_kgb === docId) &&
                         (!existing.id_rapat || existing.id_rapat === docId) &&
                         (!existing.id_pkp || existing.id_pkp === docId) &&
                         (!existing.id_pck || existing.id_pck === docId) &&
                         (!existing.id_rekap || existing.id_rekap === docId);
            if ((extraKeys.length > 0 || nullKeys.length > 0 || badCreatedAt) && idOk) {
              const sanitized = {};
              for (const k of allowedSchemaFields) {
                if (Object.prototype.hasOwnProperty.call(existing, k) && existing[k] !== undefined && existing[k] !== null) {
                  if (k === 'created_at' && !this._isFirestoreTimestamp(existing[k])) continue;
                  sanitized[k] = existing[k];
                }
              }
              Object.assign(sanitized, payload);
              if (this._isFirestoreTimestamp(existing.created_at)) {
                sanitized.created_at = existing.created_at;
              } else if (allowedSchemaFields.includes('created_at') && !this._isFirestoreTimestamp(sanitized.created_at)) {
                sanitized.created_at = this._serverTimestamp();
              }
              await docRef.set(sanitized);
              return;
            }
            diagInfo = `docRead=OK(exists=true, keys=${Object.keys(existing).length}, idOk=${idOk}${extraKeys.length ? ', extra=' + extraKeys.join(',') : ''}${nullKeys.length ? ', nulls=' + nullKeys.join(',') : ''}${badCreatedAt ? ', badCreatedAt=true' : ''})`;
          } else {
            diagInfo = 'docRead=OK(exists=false)';
          }
        } catch (diagErr) {
          const dCode = (diagErr && (diagErr.code || diagErr.message)) || String(diagErr);
          diagInfo = `docRead=ERR(${dCode})`;
          console.warn(`⚠️ [TRANSKEP Firebase] Gagal inspeksi dokumen lama ${colName}/${docId}:`, diagErr);
          try {
            const skCol = typeof db.collection === 'function' ? db.collection(this.SK_COLLECTION || 'sk_documents') : null;
            if (skCol && typeof skCol.limit === 'function') {
              await skCol.limit(1).get();
              diagInfo += '; skRead=OK';
            }
          } catch (skErr) {
            const sCode = (skErr && (skErr.code || skErr.message)) || String(skErr);
            diagInfo += `; skRead=ERR(${sCode}) [Cek Firebase App Check Enforcement]`;
          }
        }
      }

      const rawMsg = (writeErr && writeErr.message) ? writeErr.message : String(writeErr);
      const diagSuffix = diagInfo ? ` [${diagInfo}]` : '';
      const rolePrefix = adminOnly ? `Auth Admin aktif` : `Auth aktif`;
      throw new Error(`FirebaseError: [code=permission-denied]: ${rolePrefix} (UID: ${fbAuth.currentUser.uid}, role: ${claimRole}), namun Firestore Rules menolak ${colName}/${docId}.${diagSuffix} Detail: ${rawMsg}`);
    }
  },

  /**
   * Menyimpan / Memperbarui Dokumen KGB ke Cloud Firestore
   */
  async saveKgbToFirestore(kgbData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('saveKgbToFirestore');

    const docId = String(kgbData.id_kgb || kgbData.id || ('KGB-' + Date.now())).trim();
    if (!docId) throw new Error("ID Dokumen KGB diperlukan.");

    const asStr = (v, fb = '') => (v === undefined || v === null) ? fb : String(v).trim();
    const serverTs = this._serverTimestamp();

    const caller = this.getCallerIdentity();
    const payload = {
      id: docId,
      id_kgb: docId,
      nip: asStr(kgbData.nip),
      nama_pegawai: asStr(kgbData.nama_pegawai || kgbData.nama),
      tanggal_lahir: asStr(kgbData.tanggal_lahir),
      tempat_lahir: asStr(kgbData.tempat_lahir),
      pangkat: asStr(kgbData.pangkat),
      golongan: asStr(kgbData.golongan || kgbData.golongan_baru),
      golongan_lama: asStr(kgbData.golongan_lama || kgbData.golongan),
      golongan_baru: asStr(kgbData.golongan_baru || kgbData.golongan),
      jabatan: asStr(kgbData.jabatan),
      unit_kerja: asStr(kgbData.unit_kerja, 'Pengadilan Agama Indramayu'),
      nokgb: asStr(kgbData.nokgb),
      bulan_surat: asStr(kgbData.bulan_surat),
      tahun_surat: asStr(kgbData.tahun_surat),
      nomor_surat: asStr(kgbData.nomor_surat),
      tanggal_surat: asStr(kgbData.tanggal_surat),
      tujuan_kppn: asStr(kgbData.tujuan_kppn, 'Kepala KPPN Cirebon'),
      gaji_lama: typeof kgbData.gaji_lama === 'number' ? kgbData.gaji_lama : asStr(kgbData.gaji_lama),
      pejabat_lama: asStr(kgbData.pejabat_lama),
      nomor_sk_lama: asStr(kgbData.nomor_sk_lama),
      tanggal_sk_lama: asStr(kgbData.tanggal_sk_lama),
      tmt_lama: asStr(kgbData.tmt_lama),
      tahun_lama: asStr(kgbData.tahun_lama),
      bulan_lama: asStr(kgbData.bulan_lama),
      mkg_lama: asStr(kgbData.mkg_lama),
      gaji_baru: typeof kgbData.gaji_baru === 'number' ? kgbData.gaji_baru : asStr(kgbData.gaji_baru),
      terbilang_gaji: asStr(kgbData.terbilang_gaji),
      tahun_baru: asStr(kgbData.tahun_baru),
      bulan_baru: asStr(kgbData.bulan_baru),
      mkg_baru: asStr(kgbData.mkg_baru),
      tmt_baru: asStr(kgbData.tmt_baru),
      tmt_yad: asStr(kgbData.tmt_yad),
      nama_ketua: asStr(kgbData.nama_ketua),
      dasar_pp: asStr(kgbData.dasar_pp),
      status: asStr(kgbData.status) || (this._cleanOptionalUrl(kgbData.file_doc_url || kgbData.doc_url) ? 'Selesai' : 'Sedang Diproses'),
      file_doc_url: this._cleanOptionalUrl(kgbData.file_doc_url || kgbData.doc_url),
      file_pdf_url: this._cleanOptionalUrl(kgbData.file_pdf_url || kgbData.pdf_url),
      file_id: asStr(kgbData.file_id || kgbData.doc_id),
      tanggal_input: asStr(kgbData.tanggal_input, new Date().toISOString().split('T')[0]),
      created_by: asStr(kgbData.created_by || caller.nip),
      updated_by: asStr(caller.nip || kgbData.updated_by),
      is_from_dashboard: !!kgbData.is_from_dashboard,
      is_firebase: true,
      mysims_requested: Boolean(kgbData.mysims_requested),
      mysims_status: asStr(kgbData.mysims_status),
      mysims_idp: asStr(kgbData.mysims_idp),
      mysims_requested_at: asStr(kgbData.mysims_requested_at),
      updated_at: serverTs
    };

    if (kgbData.tgl_selesai) payload.tgl_selesai = asStr(kgbData.tgl_selesai);
    if (kgbData.tte_status) payload.tte_status = asStr(kgbData.tte_status);
    if (kgbData.tte_pejabat_nip) payload.tte_pejabat_nip = asStr(kgbData.tte_pejabat_nip);
    if (kgbData.tte_pejabat_nama) payload.tte_pejabat_nama = asStr(kgbData.tte_pejabat_nama);
    if (kgbData.tte_submitted_at) payload.tte_submitted_at = asStr(kgbData.tte_submitted_at);
    if (kgbData.tte_signed_at) payload.tte_signed_at = asStr(kgbData.tte_signed_at);
    if (kgbData.tte_signer) payload.tte_signer = asStr(kgbData.tte_signer);
    if (kgbData.tte_qrcode) payload.tte_qrcode = asStr(kgbData.tte_qrcode);
    if (kgbData.doc_url) payload.doc_url = this._cleanOptionalUrl(kgbData.doc_url);
    if (kgbData.pdf_url) payload.pdf_url = this._cleanOptionalUrl(kgbData.pdf_url);
    if (kgbData.doc_id) payload.doc_id = asStr(kgbData.doc_id);
    if (kgbData.synced_at) payload.synced_at = asStr(kgbData.synced_at);

    if (!this._isFirestoreTimestamp(kgbData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.EOFFICE_KGB_COLLECTION, docId, payload, this.EOFFICE_KGB_ALLOWED_FIELDS);
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'SIMPAN_KGB', target: docId, detail: 'Menyimpan dokumen KGB: ' + (payload.nama_pegawai || payload.nip) });
    return { status: 'success', id: docId, data: payload };
  },

  /**
   * Menghapus Dokumen KGB dari Cloud Firestore
   */
  async deleteKgbFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteKgbFromFirestore');
    const cleanId = String(docId).trim();
    await db.collection(this.EOFFICE_KGB_COLLECTION).doc(cleanId).delete();
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'HAPUS_KGB', target: cleanId, detail: 'Menghapus dokumen KGB ' + cleanId, severity: 'warning' });
    return { status: 'success', message: 'Data KGB berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen KGB dari Cloud Firestore
   */
  async getFirestoreKgbs() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(true))) return [];
    const snapshot = await db.collection(this.EOFFICE_KGB_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen KGB
   */
  subscribeFirestoreKgbs(callback, errorCallback) {
    const db = this.getDb();
    if (!db) return null;
    return this._whenAuthGatedSnapshot(() => {
      if (!this.getCallerIdentity().isAdmin) return null;
      return db.collection(this.EOFFICE_KGB_COLLECTION).onSnapshot(
        (snapshot) => {
          const list = [];
          snapshot.forEach(doc => {
            list.push(doc.data());
          });
          if (typeof callback === 'function') callback(list);
        },
        (error) => {
          const errMsg = String(error && (error.message || error));
          if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('insufficient')) {
            console.warn("⚠️ [TRANSKEP Firebase] Firestore Security Rules memblokir koleksi 'eoffice_kgb'. Pastikan rules di Firebase Console sudah di-publish.", error);
          } else {
            console.error("❌ [TRANSKEP Firebase] Error listener Firestore KGB:", error);
          }
          if (typeof errorCallback === 'function') errorCallback(error);
        }
      );
    });
  },

  /**
   * Menyimpan / Memperbarui Dokumen Paket Rapat ke Cloud Firestore
   */
  async saveRapatToFirestore(rapatData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('saveRapatToFirestore');

    const docId = String(rapatData.id_rapat || rapatData.id || ('RPT-' + Date.now())).trim();
    if (!docId) throw new Error("ID Dokumen Rapat diperlukan.");

    const serverTs = this._serverTimestamp();
    const caller = this.getCallerIdentity();
    const parsedBaris = parseInt(rapatData.jumlah_baris_hadir, 10);
    const jumlahBarisHadir = (!isNaN(parsedBaris) && parsedBaris >= 1) ? Math.min(100, parsedBaris) : 15;
    const payload = {
      id: docId,
      id_rapat: docId,
      nomor_undangan: String(rapatData.nomor_undangan || ''),
      tgl_surat: String(rapatData.tgl_surat || ''),
      no_urut_surat: String(rapatData.no_urut_surat || ''),
      kode_klasifikasi_surat: String(rapatData.kode_klasifikasi_surat || ''),
      kode_pejabat_ttd: String(rapatData.kode_pejabat_ttd || ''),
      pejabat_ttd_nip: String(rapatData.pejabat_ttd_nip || ''),
      pejabat_ttd_nama: String(rapatData.pejabat_ttd_nama || ''),
      pejabat_ttd_jabatan: String(rapatData.pejabat_ttd_jabatan || ''),
      tampilkan_gelar_undangan: Boolean(rapatData.tampilkan_gelar_undangan),
      lampiran_surat: String(rapatData.lampiran_surat || ''),
      tujuan_undangan_json: typeof rapatData.tujuan_undangan_json === 'string' ? rapatData.tujuan_undangan_json : JSON.stringify(rapatData.tujuan_undangan_json || []),
      agenda: String(rapatData.agenda || ''),
      agenda_poin: String(rapatData.agenda_poin || ''),
      dasar_notula: String(rapatData.dasar_notula || ''),
      jenis_kegiatan: String(rapatData.jenis_kegiatan || 'Rapat'),
      jumlah_baris_hadir: jumlahBarisHadir,
      hari_tanggal: String(rapatData.hari_tanggal || ''),
      waktu_mulai: String(rapatData.waktu_mulai || ''),
      waktu_selesai: String(rapatData.waktu_selesai || ''),
      tempat: String(rapatData.tempat || 'Ruang Rapat'),
      pemimpin: String(rapatData.pemimpin || ''),
      pemimpin_nip: String(rapatData.pemimpin_nip || ''),
      pemimpin_jabatan: String(rapatData.pemimpin_jabatan || ''),
      notulis: String(rapatData.notulis || ''),
      notulis_nip: String(rapatData.notulis_nip || ''),
      notulis_jabatan: String(rapatData.notulis_jabatan || ''),
      peserta_json: typeof rapatData.peserta_json === 'string' ? rapatData.peserta_json : JSON.stringify(rapatData.peserta_json || []),
      pengarahan_umum: String(rapatData.pengarahan_umum || ''),
      pembahasan: String(rapatData.pembahasan || ''),
      pembahasan_json: typeof rapatData.pembahasan_json === 'string' ? rapatData.pembahasan_json : JSON.stringify(rapatData.pembahasan_json || []),
      kesimpulan: String(rapatData.kesimpulan || ''),
      foto_rapat_json: typeof rapatData.foto_rapat_json === 'string' ? rapatData.foto_rapat_json : JSON.stringify(rapatData.foto_rapat_json || []),
      audio_rapat_url: this._cleanOptionalUrl(rapatData.audio_rapat_url),
      ai_transcript: String(rapatData.ai_transcript || ''),
      status: String(rapatData.status || 'Terjadwal'),
      doc_undangan_url: this._cleanOptionalUrl(rapatData.doc_undangan_url),
      doc_absen_url: this._cleanOptionalUrl(rapatData.doc_absen_url),
      doc_notulen_url: this._cleanOptionalUrl(rapatData.doc_notulen_url),
      folder_url: this._cleanOptionalUrl(rapatData.folder_url),
      mysims_requested: Boolean(rapatData.mysims_requested),
      mysims_status: String(rapatData.mysims_status || ''),
      mysims_idp: String(rapatData.mysims_idp || ''),
      mysims_requested_at: String(rapatData.mysims_requested_at || ''),
      tanggal_input: String(rapatData.tanggal_input || new Date().toISOString().split('T')[0]),
      created_by: String(rapatData.created_by || caller.nip || ''),
      updated_by: String(caller.nip || rapatData.updated_by || ''),
      is_firebase: true,
      updated_at: serverTs
    };

    if (!this._isFirestoreTimestamp(rapatData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.EOFFICE_RAPAT_COLLECTION, docId, payload, this.EOFFICE_RAPAT_ALLOWED_FIELDS);
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'SIMPAN_RAPAT', target: docId, detail: 'Menyimpan paket rapat: ' + (payload.agenda || docId) });
    return { status: 'success', id: docId, data: payload };
  },

  /**
   * Menghapus Dokumen Paket Rapat dari Cloud Firestore
   */
  async deleteRapatFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteRapatFromFirestore');
    const cleanId = String(docId).trim();
    await db.collection(this.EOFFICE_RAPAT_COLLECTION).doc(cleanId).delete();
    this.logAuditActivity({ kategori: 'DOKUMEN', aksi: 'HAPUS_RAPAT', target: cleanId, detail: 'Menghapus paket rapat ' + cleanId, severity: 'warning' });
    return { status: 'success', message: 'Data Rapat berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen Rapat dari Cloud Firestore
   */
  async getFirestoreRapats() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(true))) return [];
    const snapshot = await db.collection(this.EOFFICE_RAPAT_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen Rapat
   */
  subscribeFirestoreRapats(callback) {
    const db = this.getDb();
    if (!db) return null;
    return this._whenAuthGatedSnapshot(() => {
      if (!this.getCallerIdentity().isAdmin) return null;
      return db.collection(this.EOFFICE_RAPAT_COLLECTION).onSnapshot(
        (snapshot) => {
          const list = [];
          snapshot.forEach(doc => {
            list.push(doc.data());
          });
          if (typeof callback === 'function') callback(list);
        },
        (error) => {
          console.error("❌ [TRANSKEP Firebase] Error listener Firestore Rapat:", error);
        }
      );
    });
  }
,

  // ==========================================
  // OPERASI MODUL SURAT TUGAS (ST, SPD & PLH) - TAHAP 77
  // ==========================================
  SURAT_TUGAS_COLLECTION: 'surat_tugas_documents',

  /**
   * Menyimpan atau Memperbarui Dokumen Surat Tugas ke Cloud Firestore (High-Speed <200ms)
   */
  async saveSuratTugasToFirestore(stData) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");

    await this._waitAuthForWrite('saveSuratTugasToFirestore');

    const docId = String(stData.id || stData.id_st || ('ST-' + Date.now() + Math.floor(Math.random() * 1000))).trim();

    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const nowStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const asStr = (v, fb = '') => (v === undefined || v === null) ? fb : String(v);
    const serverTs = this._serverTimestamp();
    const caller = this.getCallerIdentity();
    const payload = {
      id: docId,
      waktu: asStr(stData.waktu, nowStr) || nowStr,
      nomor: asStr(stData.nomor !== undefined ? stData.nomor : stData.nomor_surat),
      menimbang: asStr(stData.menimbang),
      dasar: asStr(stData.dasar),
      tujuan: asStr(stData.tujuan),
      tempat: asStr(stData.tempat),
      tgl_mulai: asStr(stData.tgl_mulai),
      tgl_selesai: asStr(stData.tgl_selesai),
      jam: asStr(stData.jam),
      peserta: typeof stData.peserta === 'string' ? stData.peserta : (stData.peserta_json || JSON.stringify(stData.peserta || [])),
      pejabat_ttd: this._normNip(stData.pejabat_ttd),
      status: asStr(stData.status, 'DISETUJUI') || 'DISETUJUI',
      data_ekstra: typeof stData.data_ekstra === 'string' ? stData.data_ekstra : (stData.data_ekstra_json || JSON.stringify(stData.data_ekstra || {})),
      created_by: this._normNip(stData.created_by || caller.nip),
      is_firebase: true,
      updated_at: serverTs
    };

    if (!this._isFirestoreTimestamp(stData.created_at)) {
      payload.created_at = serverTs;
    }

    await this._writeDocWithDiagnostics(db, this.SURAT_TUGAS_COLLECTION, docId, payload, this.SURAT_TUGAS_ALLOWED_FIELDS, { adminOnly: false });
    return { status: 'success', id: docId, data: payload, message: 'Surat Tugas berhasil disimpan di Cloud Firestore.' };
  },

  // ==========================================
  // OPERASI AVATAR FOTO PROFIL PEGAWAI (TAHAP 154)
  // ==========================================
  USER_AVATARS_COLLECTION: 'user_avatars',
  USER_AVATARS_ALLOWED_FIELDS: [
    'nip', 'photo_data_uri', 'mime_type', 'size_bytes', 'width', 'height',
    'updated_by', 'updated_at', 'created_at'
  ],

  isValidAvatarDataUri(uri) {
    const s = String(uri || '').trim();
    return s.length >= 30 && s.length <= 150000 && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
  },

  /**
   * Menyimpan / Memperbarui Foto Profil Pegawai terkompresi (khusus Admin/Operator) ke Cloud Firestore
   */
  async saveUserAvatarToFirestore(nip, photoDataUri, meta = {}) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('saveUserAvatarToFirestore');

    const cleanNip = this._normNip(nip);
    if (!cleanNip || cleanNip.length < 5) throw new Error("NIP pegawai tidak valid.");
    const cleanUri = String(photoDataUri || '').trim();
    if (!this.isValidAvatarDataUri(cleanUri)) {
      throw new Error("Format/ukuran foto profil tidak valid (maks. 150 KB Data URI gambar).");
    }

    const caller = this.getCallerIdentity();
    const serverTs = this._serverTimestamp();
    const payload = {
      nip: cleanNip,
      photo_data_uri: cleanUri,
      mime_type: String((meta && meta.mime_type) || 'image/jpeg'),
      size_bytes: Number((meta && meta.size_bytes) || cleanUri.length),
      width: Number((meta && meta.width) || 240),
      height: Number((meta && meta.height) || 240),
      updated_by: caller.nip || String((meta && meta.updated_by) || ''),
      updated_at: serverTs,
      created_at: serverTs
    };

    await this._writeDocWithDiagnostics(db, this.USER_AVATARS_COLLECTION, cleanNip, payload, this.USER_AVATARS_ALLOWED_FIELDS, { adminOnly: true });
    this.logAuditActivity({ kategori: 'PEGAWAI', aksi: 'UPLOAD_FOTO_PEGAWAI', target: cleanNip, detail: 'Memperbarui foto profil pegawai NIP ' + cleanNip });
    return { status: 'success', nip: cleanNip, data: payload };
  },

  /**
   * Menghapus Foto Profil Pegawai (khusus Admin/Operator) dari Cloud Firestore
   */
  async deleteUserAvatarFromFirestore(nip) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteUserAvatarFromFirestore');
    const cleanNip = this._normNip(nip);
    if (!cleanNip) throw new Error("NIP pegawai wajib diisi.");
    await db.collection(this.USER_AVATARS_COLLECTION).doc(cleanNip).delete();
    this.logAuditActivity({ kategori: 'PEGAWAI', aksi: 'HAPUS_FOTO_PEGAWAI', target: cleanNip, detail: 'Menghapus foto profil pegawai NIP ' + cleanNip, severity: 'warning' });
    return { status: 'success', nip: cleanNip };
  },

  /**
   * Mengambil 1 Dokumen Foto Profil Pegawai berdasarkan NIP (User sendiri atau Admin/Operator)
   */
  async getFirestoreUserAvatar(nip) {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return null;
    const cleanNip = this._normNip(nip);
    if (!cleanNip) return null;
    const snap = await db.collection(this.USER_AVATARS_COLLECTION).doc(cleanNip).get();
    return (snap && snap.exists) ? snap.data() : null;
  },

  /**
   * Mengambil Seluruh Map Foto Profil Pegawai (Khusus Admin/Operator untuk Direktori Pegawai)
   */
  async getFirestoreUserAvatars() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(true))) return {};
    const snapshot = await db.collection(this.USER_AVATARS_COLLECTION).get();
    const map = {};
    snapshot.forEach(doc => {
      const d = doc.data();
      const k = this._normNip((d && d.nip) || doc.id);
      if (k && d && this.isValidAvatarDataUri(d.photo_data_uri)) {
        map[k] = d;
      }
    });
    return map;
  },

  /**
   * Memasang Realtime Listener Koleksi Foto Profil Pegawai (Khusus Admin/Operator)
   */
  subscribeFirestoreUserAvatars(callback) {
    const db = this.getDb();
    if (!db) return null;
    return this._whenAuthGatedSnapshot(() => {
      if (!this.getCallerIdentity().isAdmin) return null;
      return db.collection(this.USER_AVATARS_COLLECTION).onSnapshot(
        (snapshot) => {
          const map = {};
          snapshot.forEach(doc => {
            const d = doc.data();
            const k = this._normNip((d && d.nip) || doc.id);
            if (k && d && this.isValidAvatarDataUri(d.photo_data_uri)) {
              map[k] = d;
            }
          });
          if (typeof callback === 'function') callback(map);
        },
        (error) => {
          console.warn("⚠️ [TRANSKEP Firebase] Error listener user_avatars:", error && error.message ? error.message : error);
        }
      );
    });
  },

  /**
   * Menghapus Dokumen Surat Tugas dari Cloud Firestore secara Instan
   */
  async deleteSuratTugasFromFirestore(docId) {
    const db = this.getDb();
    if (!db) throw new Error("Cloud Firestore belum siap terhubung.");
    await this._waitAuthForWrite('deleteSuratTugasFromFirestore');
    await db.collection(this.SURAT_TUGAS_COLLECTION).doc(String(docId).trim()).delete();
    return { status: 'success', message: 'Surat Tugas berhasil dihapus dari Cloud Firestore.' };
  },

  /**
   * Mengambil Seluruh Dokumen Surat Tugas dari Cloud Firestore
   */
  async getFirestoreSuratTugas() {
    const db = this.getDb();
    if (!db || !(await this._ensureAuthForRead(false))) return [];
    const snapshot = await db.collection(this.SURAT_TUGAS_COLLECTION).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    return list;
  },

  /**
   * Memasang Realtime Listener untuk Dokumen Surat Tugas
   */
  subscribeFirestoreSuratTugas(callback) {
    const db = this.getDb();
    if (!db) return null;
    return this._whenAuthGatedSnapshot(() => db.collection(this.SURAT_TUGAS_COLLECTION).onSnapshot(
      (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        if (typeof callback === 'function') callback(list);
      },
      (error) => {
        console.error("❌ [TRANSKEP Firebase] Error listener Firestore Surat Tugas:", error);
      }
    ));
  },

  /**
   * Background Auto-Sync data ST lama dari Sheets ke Firestore (Zero UI / Tanpa Tombol)
   */
  async syncLegacySuratTugasToFirestore(legacyList) {
    const db = this.getDb();
    if (!db || !Array.isArray(legacyList) || legacyList.length === 0) return 0;
    let count = 0;
    for (const st of legacyList) {
      if (!st.is_firebase && st.id) {
        try {
          await this.saveSuratTugasToFirestore(st);
          st.is_firebase = true;
          count++;
        } catch (e) {
          console.warn("[TranskepFirebase] Gagal sync ST legacy ke Firestore:", st.id, e);
        }
      }
    }
    return count;
  }

};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.TranskepFirebase = TranskepFirebase;
}
