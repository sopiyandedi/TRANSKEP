// ==========================================
// FILE: api_router.js
// DESKRIPSI: Headless API Router & Gateway Adapter untuk TRANSKEP v3.0
// TUJUAN: Menjembatani Frontend Modern (GitHub Pages / domain instansi)
//         ke Backend Google Apps Script tanpa mengganggu Web App lama (Google Sites)
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
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

    // 1. Healthcheck / Ping
    if (action === 'ping') {
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
      const data = getBulkData(nip, token);
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
      return handleRpcCall_(payload.method, payload.args);
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
        return jsonResponse_(sendWhatsAppMessage_(payload.phone || '6285139811819', payload.text || 'Test WAHA diagnostic'));

      // Autentikasi & Sesi
      case 'verifyLogin':
      case 'login':
        return jsonResponse_(verifyLogin(payload.nip, payload.pass));

      case 'logoutSession':
      case 'logout':
        return jsonResponse_(logoutSession(payload.nip, payload.token));

      case 'submitLupaPassword':
        return jsonResponse_(submitLupaPassword(payload.nip, payload.noHp, payload.alasan));

      case 'gantiPasswordUser':
        return jsonResponse_(gantiPasswordUser(payload.nip, payload.passLama, payload.passBaru, payload.token));

      // Core Data Fetch
      case 'getBulkData':
        return jsonResponse_(getBulkData(payload.nip, payload.token));

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
      case 'saveOrGenerateKgbDoc':
        return jsonResponse_(saveOrGenerateKgbDoc(payload.data, payload.actionType, payload.nip, payload.token));

      case 'saveOrGenerateRapatDoc':
        return jsonResponse_(saveOrGenerateRapatDoc(payload.data, payload.actionType, payload.nip, payload.token));

      // Magic Link Approval & Resend WA
      case 'getCutiByToken':
        return jsonResponse_(getCutiByToken(payload.token));

      case 'processMagicLinkApproval':
        return jsonResponse_(processMagicLinkApproval(payload.token, payload.decision, payload.notes));

      case 'resendCutiWhatsApp':
        return jsonResponse_(resendCutiWhatsApp(payload.id, payload.nip, payload.token));

      case 'requestPasswordReset':
        return jsonResponse_(requestPasswordReset(payload.no_wa || payload.noWa));

      // Fallback: Jika action cocok dengan fungsi global terdaftar yang aman
      default:
        return handleRpcCall_(action, payload.args || [payload.data, payload.nip, payload.token]);
    }

  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Gagal memproses API POST: ' + err.toString()
    });
  }
}

/**
 * Universal RPC Dispatcher Aman (Mengeksekusi fungsi server sesuai hak akses)
 */
function handleRpcCall_(methodName, args) {
  if (!methodName || typeof methodName !== 'string') {
    return jsonResponse_({ status: 'error', message: 'Nama method RPC tidak valid.' });
  }

  // DAFTAR HITAM: Larang memanggil fungsi internal, setup, atau gateway
  const FORBIDDEN_METHODS = [
    'doGet', 'doPost', 'include', 'getDB', 'sanitizeFormulaInput', 'sanitizeRowArray',
    'jsonResponse_', 'handleApiGet_', 'handleApiPost_', 'handleRpcCall_', 'handleWebhookST_',
    'setupDatabase_', 'runDailyBackup_', 'cleanupOldBackups_'
  ];

  // Larang fungsi berakhiran underscore (_) karena merupakan fungsi privat
  if (methodName.endsWith('_') || FORBIDDEN_METHODS.indexOf(methodName) !== -1) {
    return jsonResponse_({ status: 'error', message: 'Akses ke fungsi ' + methodName + ' ditolak oleh proteksi sistem.' });
  }

  const globalScope = (typeof globalThis !== 'undefined') ? globalThis : this;
  const targetFn = globalScope[methodName];

  if (typeof targetFn !== 'function') {
    return jsonResponse_({ status: 'error', message: "Fungsi backend '" + methodName + "' tidak ditemukan di server." });
  }

  const cleanArgs = Array.isArray(args) ? args : [];
  const result = targetFn.apply(globalScope, cleanArgs);

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
