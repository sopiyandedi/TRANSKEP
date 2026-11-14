// ==========================================
// FILE: api_router.js
// DESKRIPSI: Headless API Router & Gateway Adapter untuk TRANSKEP v3.0
// TUJUAN: Menjembatani Frontend Modern (GitHub Pages / domain instansi)
//         ke Backend Google Apps Script tanpa mengganggu Web App lama (Google Sites)
// ENGINE: TRANSKEP Core v3.6.6
// ==========================================

/**
 * Helper Standar Output Format JSON
 */
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handler Khusus Request GET (?api=true)
 */
function handleApiGet_(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'ping';

    // 1. Healthcheck / Ping (+ Auto-Heal PII Vault Encryption secara internal)
    if (action === 'ping') {
      if (typeof ensureAllPiiSheetsEncrypted_ === 'function') {
        try { ensureAllPiiSheetsEncrypted_(); } catch (eVault) {}
      }
      return jsonResponse_({
        status: 'success',
        message: 'TRANSKEP Headless API Gateway v3.0 Aktif!',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Ambil Bulk Data Pegawai & Status (Read-Only)
    if (action === 'getBulkData') {
      const nip = params.nip || '';
      const token = params.token || '';
      if (!nip || !token) {
        return jsonResponse_({ status: 'error', message: 'Parameter nip dan token wajib disertakan.' });
      }
      const clientVersion = params.clientVersion || params.version || '';
      const data = getBulkData(nip, token, clientVersion);
      return jsonResponse_(data);
    }

    // 3. Antrean Reset Password (Khusus Admin)
    if (action === 'getResetPasswordQueue') {
      const nip = params.nip || '';
      const token = params.token || '';
      const data = getResetPasswordQueue(nip, token);
      return jsonResponse_(data);
    }

    // 4. Ambil Detail Cuti via Magic Token (Persetujuan Cuti Tanpa Login)
    if (action === 'getCutiByToken') {
      const token = params.token || '';
      return jsonResponse_(getCutiByToken(token));
    }

    // 5. Update Nomor Surat Cuti MYSIMS (GET fallback)
    if (action === 'updateNomorSuratCuti') {
      return jsonResponse_(updateNomorSuratCutiFromExternal_(params));
    }

    // 6. Update Nomor Surat Tugas Terpadu MYSIMS (GET fallback)
    if (action === 'updateNomorSuratTugas') {
      return jsonResponse_(updateNomorSuratTugasFromExternal_(params));
    }

    return jsonResponse_({
      status: 'error',
      message: "Aksi GET '" + action + "' tidak dikenali atau memerlukan metode POST."
    });

  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Gagal memproses API GET: ' + err.toString()
    });
  }
}

/**
 * Handler Khusus Request POST (Payload Action dari Frontend GitHub / Eksternal)
 */
function handleApiPost_(payload, e) {
  try {
    if (!payload || !payload.action) {
      return jsonResponse_({ status: 'error', message: "Payload tidak memuat atribut 'action'." });
    }

    const action = payload.action;

    // ----------------------------------------------------
    // JALUR 1: RPC DISPATCHER (Mirrors google.script.run)
    // Format: { action: 'call', method: 'namaFungsi', args: [...] }
    // ----------------------------------------------------
    if (action === 'call') {
      return handleRpcCall_(payload.method, payload.args, payload.nip, payload.token);
    }

    // ----------------------------------------------------
    // JALUR 2: REST ACTION REGISTRY (Direct Named Endpoints)
    // ----------------------------------------------------
    switch (action) {
      // Healthcheck / Ping
      case 'ping':
        return jsonResponse_({
          status: 'success',
          message: 'TRANSKEP Headless API Gateway v3.0 Aktif (POST)!',
          timestamp: new Date().toISOString()
        });

      case 'testWaha':
        if (!cekOtorisasiAdmin(payload.nip, payload.token)) {
          return jsonResponse_({ status: 'error', message: 'Akses Ditolak: Diagnostik WAHA khusus Admin terotorisasi.' });
        }
        if (!payload.phone) {
          return jsonResponse_({ status: 'error', message: "Parameter 'phone' wajib disertakan." });
        }
        return jsonResponse_(sendWhatsAppMessage_(payload.phone, payload.text || 'Test WAHA diagnostic'));

      // Autentikasi & Sesi
      case 'verifyLogin':
      case 'login':
        return jsonResponse_(verifyLogin(payload.nip, payload.pass));

      case 'logoutSession':
      case 'logout':
        return jsonResponse_(logoutSession(payload.nip, payload.token));

      // Core Data Fetch
      case 'getBulkData':
        return jsonResponse_(getBulkData(payload.nip, payload.token, payload.clientVersion || payload.version || ''));

      case 'getBackgroundData':
        return jsonResponse_(getBackgroundData(payload.nip, payload.token, payload.clientVersion || payload.version || ''));

      // Dashboard & Status TMT
      case 'updateTmtStatus':
        return jsonResponse_(updateTmtStatus(payload.actorNip || payload.nip, payload.targetNip, payload.type, payload.newStatus, payload.token));

      // Antrean Reset Password Admin
      case 'getResetPasswordQueue':
        return jsonResponse_(getResetPasswordQueue(payload.nip, payload.token));

      case 'markResetAsDone':
        return jsonResponse_(markResetAsDone(payload.id, payload.nip, payload.token));

      // Manajemen Pegawai (Admin)
      case 'addUser':
        return jsonResponse_(addUser(payload.user, payload.nip, payload.token));

      case 'updateUser':
        return jsonResponse_(updateUser(payload.user, payload.nip, payload.token));

      case 'deleteUser':
        return jsonResponse_(deleteUser(payload.targetNip, payload.nip, payload.token));

      case 'simpanDataMassal':
        return jsonResponse_(simpanDataMassal(payload.users, payload.nip, payload.token));

      // E-Office (KGB & Rapat)
      case 'getEofficeData':
        return jsonResponse_(getEofficeData(payload.nip, payload.token));

      case 'saveOrGenerateKgbDoc':
        return jsonResponse_(saveOrGenerateKgbDoc(payload.data, payload.actionType, payload.nip, payload.token));

      case 'deleteKgbDocRecord':
        return jsonResponse_(deleteKgbDocRecord(payload.id_kgb || payload.idKgb, payload.targetNip, payload.resetUserStatus, payload.nip, payload.token));

      // Magic Link Approval & Resend WA
      case 'getCutiByToken':
        return jsonResponse_(getCutiByToken(payload.token));

      case 'getMagicFilePreview':
        return jsonResponse_(getMagicFilePreview(payload.token));

      case 'processMagicLinkApproval':
        return jsonResponse_(processMagicLinkApproval(payload.token, payload.decision, payload.notes));

      // Firebase Auth & Infra Secret Validator & Authenticated Drive Proxy (Fase 3B)
      case 'getFirebaseCustomToken':
        return jsonResponse_(getFirebaseCustomToken(payload.nip, payload.token));

      case 'checkInfraSecrets':
        return jsonResponse_(checkInfraSecrets(payload.nip, payload.token));

      case 'getDriveFileBlob':
        return jsonResponse_(getDriveFileBlob(payload.fileUrlOrId || payload.fileUrl || payload.url, payload.nip, payload.token));

      case 'resendCutiWhatsApp':
        return jsonResponse_(resendCutiWhatsApp(payload.id, payload.nip, payload.token));

      case 'requestPasswordReset':
        return jsonResponse_(requestPasswordReset(payload.no_wa || payload.noWa));

      // Integrasi Surat Keluar MYSIMS via n8n
      case 'updateNomorSuratCuti':
        return jsonResponse_(updateNomorSuratCutiFromExternal_(payload));

      case 'updateNomorSuratTugas':
        return jsonResponse_(updateNomorSuratTugasFromExternal_(payload));

      // Fallback: Hanya izinkan method dalam whitelist RPC resmi
      default:
        return handleRpcCall_(
          action,
          Array.isArray(payload.args) ? payload.args : [payload.data, payload.nip, payload.token],
          payload.nip,
          payload.token
        );
    }

  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Gagal memproses API POST: ' + err.toString()
    });
  }
}

var PUBLIC_RPC_METHODS_ = {
  verifyLogin: true,
  logoutSession: true,
  requestPasswordReset: true,
  getCutiByToken: true,
  getMagicFilePreview: true,
  processMagicLinkApproval: true
};

var AUTHENTICATED_RPC_METHODS_ = {
  getBulkData: true,
  getBackgroundData: true,
  getFirebaseCustomToken: true,
  checkInfraSecrets: true,
  getDriveFileBlob: true,
  changeMyPassword: true,
  updateTmtStatus: true,
  forwardTmtDateByFrontend: true,
  getEofficeData: true,
  saveOrGenerateKgbDoc: true,
  deleteKgbDocRecord: true,
  createPaketRapatDocs: true,
  saveJobdes: true,
  createPdfJobdes: true,
  getUsulanMenunggu: true,
  tandaiUsulanSelesai: true,
  addKinerjaLog: true,
  approveKinerja: true,
  addUser: true,
  updateUser: true,
  deleteUser: true,
  importBulkUsers: true,
  simpanDataMassal: true,
  getResetPasswordQueue: true,
  markResetAsDone: true,
  submitIzinKeluar: true,
  getIzinKeluarById: true,
  updateIkStatus: true,
  deleteIzinKeluarLog: true,
  updateIzinKeluarLog: true,
  submitIzinPribadi: true,
  getIzinPribadiById: true,
  updateIpStatus: true,
  deleteIzinPribadiLog: true,
  updateIzinPribadiLog: true,
  addCutiLog: true,
  updateCutiLog: true,
  deleteCutiLog: true,
  requestCancelCuti: true,
  updateCutiStatus: true,
  processBulkApproval: true,
  resendCutiWhatsApp: true,
  getSmartRouting: true,
  addSuratTugas: true,
  updateSuratTugas: true,
  deleteSuratTugasLog: true,
  saveSettingsST: true,
  getSettingsST: true,
  submitRencanaWFH: true,
  getRencanaWFHById: true,
  submitLaporanWFH: true,
  updateWfhStatus: true,
  deleteWfhLog: true,
  updateRencanaWfhLog: true,
  generatePdfLaporanWFH: true,
  generatePdfRencanaWFH: true,
  getDataDokumenPKP: true,
  generatePdfPK: true,
  generatePdfPCK: true,
  submitBulkPKP: true,
  getDetailPKP: true,
  submitBulkPCK: true,
  getDataDokumenPCK: true,
  getDetailLengkapPCK: true,
  aksiDokumenPKP: true,
  aksiDokumenPCK: true,
  getSkDriveFolderUrl: true,
  saveSk: true,
  deleteSk: true,
  acknowledgeSk: true,
  getSopDriveFolderUrl: true,
  saveSopData: true,
  acknowledgeSop: true
};

/**
 * Universal RPC Dispatcher Aman (Strict Allowlist & Wajib Validasi Token Sesi)
 */
function handleRpcCall_(methodName, args, authNip, authToken) {
  if (!methodName || typeof methodName !== 'string') {
    return jsonResponse_({ status: 'error', message: 'Nama method RPC tidak valid.' });
  }

  const isPublic = Object.prototype.hasOwnProperty.call(PUBLIC_RPC_METHODS_, methodName);
  const isAuthMethod = Object.prototype.hasOwnProperty.call(AUTHENTICATED_RPC_METHODS_, methodName);

  // DEFAULT-DENY ALLOWLIST: Tolak seluruh fungsi internal, inisialisasi DB, diagnostik, atau private (_)
  if ((!isPublic && !isAuthMethod) || methodName.endsWith('_')) {
    return jsonResponse_({ status: 'error', message: 'Akses ke fungsi ' + methodName + ' ditolak oleh proteksi sistem.' });
  }

  // Penegakan otorisasi sesi terpusat untuk seluruh endpoint terproteksi
  let verifiedSess = null;
  if (isAuthMethod) {
    verifiedSess = (typeof getVerifiedSession_ === 'function')
      ? getVerifiedSession_(authNip, authToken)
      : (cekOtorisasi(authNip, authToken) ? { nip: String(authNip || '').trim(), role: '' } : null);
    if (!verifiedSess) {
      return jsonResponse_({ status: 'error', message: 'Akses Ditolak: Sesi tidak valid atau kedaluwarsa. Silakan login ulang.' });
    }
  }

  const globalScope = (typeof globalThis !== 'undefined') ? globalThis : this;
  const targetFn = globalScope[methodName];

  if (typeof targetFn !== 'function') {
    return jsonResponse_({ status: 'error', message: "Fungsi backend '" + methodName + "' tidak ditemukan di server." });
  }

  const cleanArgs = Array.isArray(args) ? args : [];
  let result;
  if (typeof setActiveSession_ === 'function') setActiveSession_(verifiedSess);
  try {
    result = targetFn.apply(globalScope, cleanArgs);
  } finally {
    if (typeof clearActiveSession_ === 'function') clearActiveSession_();
  }

  // Jika result adalah Array, kembalikan langsung sebagai JSON Array identik dengan google.script.run
  if (Array.isArray(result)) {
    return jsonResponse_(result);
  }

  // Jika result sudah berformat status object, kembalikan langsung
  if (result && typeof result === 'object' && ('status' in result)) {
    return jsonResponse_(result);
  }

  return jsonResponse_({
    status: 'success',
    data: result
  });
}
