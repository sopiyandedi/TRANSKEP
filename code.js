// ==========================================
// FILE: code.gs (Core Controller & API)
// ==========================================

function doGet(e) {
  // 1. TRANSKEP ADAPTOR: Cek apakah pemanggil adalah API (GitHub Pages / Domain Luar)
  if (e && e.parameter && (e.parameter.api === 'true' || e.parameter.format === 'json')) {
    return handleApiGet_(e);
  }

  // 2. Default: Render Web App Google Apps Script dengan proteksi anti-clickjacking
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('TRANSKEP v2.1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ------------------------------------------
// FUNGSI PEMBANTU KONEKSI & KEAMANAN (TRANSKEP)
// ------------------------------------------

// 1. Sentralisasi Koneksi Database (DRY)
function getDB() {
  let ss;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
  return ss;
}

// 2. Sentralisasi Token Sesi Kriptografis (HMAC-SHA256) & Validasi RBAC (DRY)
var _cachedSessionSecret_ = null;
var SESSION_TOKEN_TTL_SEC_ = 28800; // 8 jam masa berlaku token
var SESSION_CACHE_TTL_SEC_ = 21600; // 6 jam batas maksimal CacheService GAS
var REVOKED_JTIS_PROP_KEY_ = 'TRANSKEP_REVOKED_JTIS';

function normalizeNipKey_(val) {
  return String(val === null || val === undefined ? '' : val).replace(/['"\s]/g, '').trim();
}

function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getSessionSecret_() {
  if (_cachedSessionSecret_) return _cachedSessionSecret_;
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('TRANSKEP_SESSION_SECRET');
  if (!secret) {
    const lock = LockService.getScriptLock();
    let locked = false;
    try {
      locked = lock.tryLock(5000);
      secret = props.getProperty('TRANSKEP_SESSION_SECRET');
      if (!secret) {
        const seed = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + new Date().getTime();
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed, Utilities.Charset.UTF_8);
        secret = bytesToHex_(digest);
        props.setProperty('TRANSKEP_SESSION_SECRET', secret);
      }
    } finally {
      if (locked) {
        try { lock.releaseLock(); } catch (eLock) {}
      }
    }
  }
  if (!secret) throw new Error('Kunci sesi server tidak tersedia.');
  _cachedSessionSecret_ = secret;
  return secret;
}

function signSessionToken_(nip, role) {
  const cleanNip = normalizeNipKey_(nip);
  const nowSec = Math.floor(Date.now() / 1000);
  const jti = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  const payloadObj = {
    n: cleanNip,
    r: String(role || ''),
    iat: nowSec,
    exp: nowSec + SESSION_TOKEN_TTL_SEC_,
    jti: jti
  };
  const payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payloadObj)).replace(/=+$/, '');
  const signingInput = 'v2.' + payloadB64;
  const sigHex = bytesToHex_(Utilities.computeHmacSha256Signature(signingInput, getSessionSecret_()));
  return { token: signingInput + '.' + sigHex, jti: jti, exp: payloadObj.exp };
}

function parseAndVerifySignedToken_(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = String(token).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v2' || !parts[1] || !parts[2]) return null;

  const signingInput = parts[0] + '.' + parts[1];
  let expectedHex = '';
  try {
    expectedHex = bytesToHex_(Utilities.computeHmacSha256Signature(signingInput, getSessionSecret_()));
  } catch (e) {
    return null;
  }
  if (!constantTimeEquals_(String(parts[2]).toLowerCase(), expectedHex.toLowerCase())) {
    return null;
  }

  try {
    const mod = parts[1].length % 4;
    if (mod === 1) return null;
    const paddedB64 = mod === 0 ? parts[1] : parts[1] + '==='.slice(0, 4 - mod);
    const jsonStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(paddedB64)).getDataAsString('UTF-8');
    const payload = JSON.parse(jsonStr);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || !payload.n || !payload.jti || !payload.exp || Number(payload.exp) <= nowSec) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function isJtiRevoked_(jti) {
  if (!jti) return true;
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('revoked_' + jti)) return true;
  } catch (e) {}

  try {
    const raw = PropertiesService.getScriptProperties().getProperty(REVOKED_JTIS_PROP_KEY_);
    if (!raw) return false;
    const list = JSON.parse(raw);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].j === jti && Number(list[i].e) > nowSec) {
          try {
            CacheService.getScriptCache().put('revoked_' + jti, '1', Math.min(SESSION_CACHE_TTL_SEC_, Math.max(60, Number(list[i].e) - nowSec)));
          } catch (eC) {}
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

function revokeSessionToken_(token) {
  if (!token || typeof token !== 'string') return;
  const cache = CacheService.getScriptCache();
  try {
    cache.remove(token);
    cache.remove(token + '_role');
  } catch (e) {}

  const payload = parseAndVerifySignedToken_(token);
  if (!payload || !payload.jti) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const remSec = Math.min(SESSION_CACHE_TTL_SEC_, Math.max(60, Number(payload.exp) - nowSec));
  try {
    cache.remove('sess_' + payload.jti);
    cache.put('revoked_' + payload.jti, '1', remSec);
  } catch (e) {}

  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(REVOKED_JTIS_PROP_KEY_);
    let list = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
    const active = list.filter(item => item && item.j && item.j !== payload.jti && Number(item.e) > nowSec);
    active.push({ j: payload.jti, e: Number(payload.exp) });
    if (active.length > 80) active.splice(0, active.length - 80);
    props.setProperty(REVOKED_JTIS_PROP_KEY_, JSON.stringify(active));
  } catch (e) {}
}

function getVerifiedSession_(nip, clientToken) {
  const cleanNip = normalizeNipKey_(nip);
  if (!cleanNip || !clientToken || typeof clientToken !== 'string') return null;

  const payload = parseAndVerifySignedToken_(clientToken);
  if (!payload || normalizeNipKey_(payload.n) !== cleanNip) return null;
  if (isJtiRevoked_(payload.jti)) return null;

  const cache = CacheService.getScriptCache();
  try {
    const cachedSessStr = cache.get('sess_' + payload.jti);
    if (cachedSessStr) {
      const cachedSess = JSON.parse(cachedSessStr);
      if (cachedSess && normalizeNipKey_(cachedSess.nip) === cleanNip) {
        return { nip: cleanNip, role: String(cachedSess.role || ''), jti: payload.jti };
      }
      return null;
    }
  } catch (e) {}

  // Pemulihan cache hanya dilakukan SETELAH tanda tangan HMAC + revokasi terverifikasi,
  // sekaligus mengambil role terbaru & memastikan akun masih terdaftar di user_data.
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    if (!sheet) return null;
    const data = readUserSheetDecrypted_(sheet);
    for (let i = 1; i < data.length; i++) {
      if (normalizeNipKey_(data[i][0]) === cleanNip) {
        const liveRole = String(data[i][3] || '');
        const nowSec = Math.floor(Date.now() / 1000);
        const ttl = Math.min(SESSION_CACHE_TTL_SEC_, Math.max(60, Number(payload.exp) - nowSec));
        try {
          cache.put('sess_' + payload.jti, JSON.stringify({ nip: cleanNip, role: liveRole }), ttl);
        } catch (ePut) {}
        return { nip: cleanNip, role: liveRole, jti: payload.jti };
      }
    }
  } catch (e) {}
  return null;
}

function cekOtorisasi(nip, clientToken) {
  return Boolean(getVerifiedSession_(nip, clientToken));
}

// 3. Sentralisasi Validasi Role Admin / Operator (DRY & RBAC)
function cekOtorisasiAdmin(nip, clientToken) {
  const sess = getVerifiedSession_(nip, clientToken);
  if (!sess) return false;
  const cr = String(sess.role || '').toLowerCase().trim();
  return cr === 'admin' || cr === 'operator';
}

// 3b. Alias Kompatibilitas Validasi Role Admin / Operator (DRY & RBAC)
function cekOtorisasiAdminOrOperator(nip, clientToken) {
  return cekOtorisasiAdmin(nip, clientToken);
}

// 3c. Konteks Sesi Terverifikasi per-Request & Helper Otorisasi (Fase 2)
var _ACTIVE_SESSION_ = null;

function setActiveSession_(sess) {
  _ACTIVE_SESSION_ = (sess && sess.nip) ? sess : null;
}

function getActiveSession_() {
  return _ACTIVE_SESSION_;
}

function clearActiveSession_() {
  _ACTIVE_SESSION_ = null;
}

function isAdminRole_(role) {
  const cr = String(role || '').toLowerCase().trim();
  return cr === 'admin' || cr === 'operator';
}

function resolveCallerSession_(explicitNip, clientToken) {
  if (explicitNip !== undefined && explicitNip !== null && String(explicitNip).trim() !== '' && clientToken) {
    return getVerifiedSession_(explicitNip, clientToken);
  }
  return getActiveSession_();
}

// 3d. Sanitasi HTML Server & PDF (Anti-XSS)
function sanitizePdfHtml_(html) {
  let str = String(html == null ? '' : html);
  str = str
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(['"]?)refresh\1[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(['"]?)\s*(javascript|vbscript|data\s*:\s*text\/html):/gi, '$1=$2blocked:');
  return str;
}

// 3e. Server-Side Rate Limiting Berbasis CacheService (Anti Brute-Force & OTP Flooding)
function checkRateLimitBlocked_(key, maxAttempts) {
  try {
    const cache = CacheService.getScriptCache();
    const lockVal = cache.get('rl_lock_' + key);
    if (lockVal) return true;
    const raw = cache.get('rl_cnt_' + key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed && Number(parsed.exp) > nowSec && Number(parsed.c) >= maxAttempts) {
      return true;
    }
  } catch (e) {}
  return false;
}

function recordRateLimitHit_(key, maxAttempts, windowSec, lockSec) {
  try {
    const cache = CacheService.getScriptCache();
    const nowSec = Math.floor(Date.now() / 1000);
    let count = 0;
    let exp = nowSec + windowSec;
    const raw = cache.get('rl_cnt_' + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Number(parsed.exp) > nowSec) {
        count = Number(parsed.c) || 0;
        exp = Number(parsed.exp);
      }
    }
    count += 1;
    const ttl = Math.min(21600, Math.max(10, exp - nowSec));
    cache.put('rl_cnt_' + key, JSON.stringify({ c: count, exp: exp }), ttl);
    if (count >= maxAttempts && lockSec > 0) {
      cache.put('rl_lock_' + key, '1', Math.min(21600, Math.max(10, lockSec)));
    }
    return count;
  } catch (e) {
    return 0;
  }
}

function clearRateLimit_(key) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('rl_cnt_' + key);
    cache.remove('rl_lock_' + key);
  } catch (e) {}
}

// 4. Sentralisasi Sanitasi Anti Formula / CSV Injection (CWE-1236)
function sanitizeFormulaInput(val) {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('@') || (trimmed.startsWith('-') && !/^-?\d+(\.\d+)?$/.test(trimmed))) {
      return "'" + val;
    }
  }
  return val;
}

function sanitizeRowArray(row) {
  if (!Array.isArray(row)) return row;
  return row.map(cell => sanitizeFormulaInput(cell));
}

// 5. Sentralisasi Hashing Kriptografis Salted SHA-256 & Enkripsi Dua Arah Kolom Rahasia (PII Vault)
function hashPassword_(plainPassword, salt) {
  if (!salt) salt = Utilities.getUuid().substring(0, 8);
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ":" + plainPassword,
    Utilities.Charset.UTF_8
  );
  let hashHex = '';
  for (let i = 0; i < rawBytes.length; i++) {
    let byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hashHex += byteHex;
  }
  return "SHA256$" + salt + "$" + hashHex;
}

function verifyPasswordHash_(storedValue, inputPassword) {
  if (!storedValue || !inputPassword) return false;
  const storedStr = String(storedValue).replace(/^'+/, '').trim();
  // 1. Format Enkripsi Dua Arah Kolom (ENC$<tag>$<hex>)
  if (isEncryptedField_(storedStr)) {
    return decryptField_(storedStr) === String(inputPassword);
  }
  // 2. Format Hash Salted SHA-256 Legacy (SHA256$<salt>$<hex>)
  if (storedStr.startsWith("SHA256$")) {
    const parts = storedStr.split("$");
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = hashPassword_(inputPassword, salt);
      return storedStr === expectedHash;
    }
  }
  // 3. Mode Transisi / Input Darurat Plaintext di Sheet
  return storedStr === String(inputPassword);
}

// 5B. Mesin Enkripsi Dua Arah Kolom Rahasia (NIP, Nomor WA, Password, Alamat Pegawai & Alamat Cuti)
var _cachedEncSecret_ = null;
var _encMemoryCache_ = {};
var _decMemoryCache_ = {};

function getEncryptionSecret_() {
  if (_cachedEncSecret_) return _cachedEncSecret_;
  try {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('TRANSKEP_ENC_SECRET');
    if (!secret) {
      const rawSeed = Utilities.getUuid() + ":" + Utilities.getUuid() + ":TRANSKEP_PII_VAULT_2026";
      const seedBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawSeed, Utilities.Charset.UTF_8);
      secret = bytesToHex_(seedBytes);
      props.setProperty('TRANSKEP_ENC_SECRET', secret);
    }
    _cachedEncSecret_ = secret;
    return secret;
  } catch (e) {
    throw new Error('Gagal membaca/menginisialisasi TRANSKEP_ENC_SECRET dari ScriptProperties: ' + e.toString());
  }
}

function bytesToHex_(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i];
    if (b < 0) b += 256;
    let h = b.toString(16);
    if (h.length === 1) h = '0' + h;
    hex += h;
  }
  return hex;
}

function hexToBytes_(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    let b = parseInt(hex.substring(i, i + 2), 16);
    if (b > 127) b -= 256;
    bytes.push(b);
  }
  return bytes;
}

function isEncryptedField_(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).replace(/^'+/, '').trim();
  if (!s.startsWith('ENC$')) return false;
  const parts = s.split('$');
  return parts.length === 3 && parts[1].length > 0 && parts[2].length > 0 && (parts[2].length % 2 === 0);
}

function encryptField_(plainVal) {
  if (plainVal === null || plainVal === undefined) return '';
  const rawStr = String(plainVal);
  const str = rawStr.replace(/^'+/, '').trim();
  if (str === '' || str === '-') return rawStr;
  if (isEncryptedField_(str)) return str;
  if (_encMemoryCache_[str]) return _encMemoryCache_[str];

  const secret = getEncryptionSecret_();
  const macBytes = Utilities.computeHmacSha256Signature(str, secret, Utilities.Charset.UTF_8);
  const tagHex = bytesToHex_(macBytes.slice(0, 4));

  const plainBytes = Utilities.newBlob(str, 'text/plain').getBytes();
  const cipherBytes = [];
  let blockIdx = 0;
  let keystream = [];

  for (let i = 0; i < plainBytes.length; i++) {
    if (i % 32 === 0) {
      keystream = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        secret + ":" + tagHex + ":" + blockIdx,
        Utilities.Charset.UTF_8
      );
      blockIdx++;
    }
    let pByte = plainBytes[i] < 0 ? plainBytes[i] + 256 : plainBytes[i];
    let kByte = keystream[i % 32] < 0 ? keystream[i % 32] + 256 : keystream[i % 32];
    let cByte = (pByte ^ kByte) & 0xFF;
    if (cByte > 127) cByte -= 256;
    cipherBytes.push(cByte);
  }

  const result = "ENC$" + tagHex + "$" + bytesToHex_(cipherBytes);
  _encMemoryCache_[str] = result;
  _decMemoryCache_[result] = str;
  return result;
}

function decryptField_(cipherVal) {
  if (cipherVal === null || cipherVal === undefined) return '';
  const rawStr = String(cipherVal);
  const clean = rawStr.replace(/^'+/, '').trim();
  if (!clean.startsWith('ENC$')) return rawStr.replace(/^'+/, '');
  if (_decMemoryCache_[clean]) return _decMemoryCache_[clean];

  const parts = clean.split('$');
  if (parts.length !== 3) return rawStr;

  const tagHex = parts[1];
  const cipherHex = parts[2];
  if (!tagHex || !cipherHex || cipherHex.length % 2 !== 0) return rawStr;

  try {
    const secret = getEncryptionSecret_();
    const cipherBytes = hexToBytes_(cipherHex);
    const plainBytes = [];
    let blockIdx = 0;
    let keystream = [];

    for (let i = 0; i < cipherBytes.length; i++) {
      if (i % 32 === 0) {
        keystream = Utilities.computeDigest(
          Utilities.DigestAlgorithm.SHA_256,
          secret + ":" + tagHex + ":" + blockIdx,
          Utilities.Charset.UTF_8
        );
        blockIdx++;
      }
      let cByte = cipherBytes[i] < 0 ? cipherBytes[i] + 256 : cipherBytes[i];
      let kByte = keystream[i % 32] < 0 ? keystream[i % 32] + 256 : keystream[i % 32];
      let pByte = (cByte ^ kByte) & 0xFF;
      if (pByte > 127) pByte -= 256;
      plainBytes.push(pByte);
    }

    const plainText = Utilities.newBlob(plainBytes).getDataAsString('UTF-8');
    _decMemoryCache_[clean] = plainText;
    _encMemoryCache_[plainText] = clean;
    return plainText;
  } catch (e) {
    return rawStr;
  }
}

function encryptPasswordField_(passVal) {
  if (passVal === null || passVal === undefined) return '';
  const clean = String(passVal).replace(/^'+/, '').trim();
  if (clean === '' || clean === '-') return '';
  if (clean.startsWith('SHA256$') || isEncryptedField_(clean)) return clean;
  return hashPassword_(clean);
}

/**
 * Pembaca Terpusat Sheet `user_data` (Dekripsi Transparan + Smart Auto-Encrypt Self-Healing)
 * Jika ditemukan data lama atau ketikan darurat manual di Sheet yang belum berformat ENC$,
 * fungsi ini otomatis mengenkripsinya di Google Sheet sekaligus mengembalikan teks asli ke memori aplikasi.
 */
function readUserSheetDecrypted_(sheetUser) {
  if (!sheetUser) return [];
  const data = sheetUser.getDataRange().getDisplayValues();
  if (!data || data.length <= 1) return data || [];

  const uHeaders = data[0].map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const findColIdx = (name, fallback) => {
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = uHeaders.indexOf(clean);
    return idx !== -1 ? idx : fallback;
  };

  const colNip = findColIdx('NIP', 0);
  const colHp = findColIdx('No_HP', 4);
  const colPass = findColIdx('Password', 5);
  const colAlamat = findColIdx('Alamat', 15);

  let dirtyNip = false, dirtyHp = false, dirtyPass = false, dirtyAlamat = false;
  const encNipCol = [], encHpCol = [], encPassCol = [], encAlamatCol = [];
  const numRows = data.length - 1;

  for (let i = 1; i < data.length; i++) {
    // 1. Kolom NIP
    const rawNip = String(data[i][colNip] || '').replace(/^'+/, '').trim();
    if (rawNip !== '' && rawNip !== '-' && !isEncryptedField_(rawNip)) {
      dirtyNip = true;
      encNipCol.push([encryptField_(rawNip)]);
      data[i][colNip] = rawNip;
    } else {
      encNipCol.push([rawNip]);
      data[i][colNip] = decryptField_(rawNip);
    }

    // 2. Kolom Nomor WA (No_HP)
    const rawHp = String(data[i][colHp] || '').replace(/^'+/, '').trim();
    if (rawHp !== '' && rawHp !== '-' && !isEncryptedField_(rawHp)) {
      dirtyHp = true;
      encHpCol.push([encryptField_(rawHp)]);
      data[i][colHp] = rawHp;
    } else {
      encHpCol.push([rawHp]);
      data[i][colHp] = decryptField_(rawHp);
    }

    // 3. Kolom Password (ketik manual darurat -> langsung di-hash satu arah SHA256$; tidak pernah didekripsi ke memori)
    const rawPass = String(data[i][colPass] || '').replace(/^'+/, '').trim();
    if (rawPass !== '' && rawPass !== '-' && !isEncryptedField_(rawPass) && !rawPass.startsWith('SHA256$')) {
      dirtyPass = true;
      const hashedPass = hashPassword_(rawPass);
      encPassCol.push([hashedPass]);
      data[i][colPass] = hashedPass;
    } else {
      encPassCol.push([rawPass]);
      data[i][colPass] = rawPass;
    }

    // 4. Kolom Alamat Pegawai
    const rawAlamat = String(data[i][colAlamat] || '').replace(/^'+/, '').trim();
    if (rawAlamat !== '' && rawAlamat !== '-' && !isEncryptedField_(rawAlamat)) {
      dirtyAlamat = true;
      encAlamatCol.push([encryptField_(rawAlamat)]);
      data[i][colAlamat] = rawAlamat;
    } else {
      encAlamatCol.push([rawAlamat]);
      data[i][colAlamat] = decryptField_(rawAlamat);
    }
  }

  // Self-Healing Batch Write ke Google Sheets jika ada sel yang belum terenkripsi
  try {
    if (dirtyNip) sheetUser.getRange(2, colNip + 1, numRows, 1).setNumberFormat('@').setValues(encNipCol);
    if (dirtyHp) sheetUser.getRange(2, colHp + 1, numRows, 1).setNumberFormat('@').setValues(encHpCol);
    if (dirtyPass) sheetUser.getRange(2, colPass + 1, numRows, 1).setNumberFormat('@').setValues(encPassCol);
    if (dirtyAlamat) sheetUser.getRange(2, colAlamat + 1, numRows, 1).setNumberFormat('@').setValues(encAlamatCol);
    if (dirtyNip || dirtyHp || dirtyPass || dirtyAlamat) {
      bumpDataVersion();
    }
  } catch (errHeal) {
    Logger.log("Auto-Encrypt user_data warning: " + errHeal.toString());
  }

  return data;
}

/**
 * Pembaca Terpusat Sheet `cuti_log` (Dekripsi Transparan + Smart Auto-Encrypt Self-Healing)
 * Mengenkripsi NIP Pemohon (Kolom C), Atasan_NIP (Kolom J), Pejabat_NIP (Kolom K), dan Alamat Cuti (Kolom P).
 */
function readCutiSheetDecrypted_(sheetCuti) {
  if (!sheetCuti) return [];
  const data = sheetCuti.getDataRange().getDisplayValues();
  if (!data || data.length <= 1) return data || [];

  const colNip = 2;
  const colAtasan = 9;
  const colPejabat = 10;
  const colAlamat = 15;

  let dirtyNip = false, dirtyAtasan = false, dirtyPejabat = false, dirtyAlamat = false;
  const encNipCol = [], encAtasanCol = [], encPejabatCol = [], encAlamatCol = [];
  const numRows = data.length - 1;

  for (let i = 1; i < data.length; i++) {
    // 1. NIP Pemohon Cuti
    const rawNip = String(data[i][colNip] || '').replace(/^'+/, '').trim();
    if (rawNip !== '' && rawNip !== '-' && !isEncryptedField_(rawNip)) {
      dirtyNip = true;
      encNipCol.push([encryptField_(rawNip)]);
      data[i][colNip] = rawNip;
    } else {
      encNipCol.push([rawNip]);
      data[i][colNip] = decryptField_(rawNip);
    }

    // 2. NIP Atasan Langsung
    const rawAtasan = String(data[i][colAtasan] || '').replace(/^'+/, '').trim();
    if (rawAtasan !== '' && rawAtasan !== '-' && !isEncryptedField_(rawAtasan)) {
      dirtyAtasan = true;
      encAtasanCol.push([encryptField_(rawAtasan)]);
      data[i][colAtasan] = rawAtasan;
    } else {
      encAtasanCol.push([rawAtasan]);
      data[i][colAtasan] = decryptField_(rawAtasan);
    }

    // 3. NIP Pejabat Berwenang
    const rawPejabat = String(data[i][colPejabat] || '').replace(/^'+/, '').trim();
    if (rawPejabat !== '' && rawPejabat !== '-' && !isEncryptedField_(rawPejabat)) {
      dirtyPejabat = true;
      encPejabatCol.push([encryptField_(rawPejabat)]);
      data[i][colPejabat] = rawPejabat;
    } else {
      encPejabatCol.push([rawPejabat]);
      data[i][colPejabat] = decryptField_(rawPejabat);
    }

    // 4. Alamat Selama Cuti
    const rawAlamat = String(data[i][colAlamat] || '').replace(/^'+/, '').trim();
    if (rawAlamat !== '' && rawAlamat !== '-' && !isEncryptedField_(rawAlamat)) {
      dirtyAlamat = true;
      encAlamatCol.push([encryptField_(rawAlamat)]);
      data[i][colAlamat] = rawAlamat;
    } else {
      encAlamatCol.push([rawAlamat]);
      data[i][colAlamat] = decryptField_(rawAlamat);
    }
  }

  // Self-Healing Batch Write ke Google Sheets jika ada sel yang belum terenkripsi
  try {
    if (dirtyNip) sheetCuti.getRange(2, colNip + 1, numRows, 1).setNumberFormat('@').setValues(encNipCol);
    if (dirtyAtasan) sheetCuti.getRange(2, colAtasan + 1, numRows, 1).setNumberFormat('@').setValues(encAtasanCol);
    if (dirtyPejabat) sheetCuti.getRange(2, colPejabat + 1, numRows, 1).setNumberFormat('@').setValues(encPejabatCol);
    if (dirtyAlamat) sheetCuti.getRange(2, colAlamat + 1, numRows, 1).setNumberFormat('@').setValues(encAlamatCol);
    if (dirtyNip || dirtyAtasan || dirtyPejabat || dirtyAlamat) {
      bumpDataVersion();
    }
  } catch (errHeal) {
    Logger.log("Auto-Encrypt cuti_log warning: " + errHeal.toString());
  }

  return data;
}

/**
 * Trigger & Migrasi Otomatis Enkripsi Seluruh Sheet PII (`user_data`, `cuti_log`, `log_reset_pass`)
 * Dapat dipanggil via API, saat pembukaan aplikasi, atau melalui Simple Trigger `onOpen`/`onEdit` di Google Sheets.
 */
function ensureAllPiiSheetsEncrypted_() {
  try {
    const ss = getDB();
    ensureAnnualCutiRollover_(ss);
    const sheetUser = ss.getSheetByName('user_data');
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetReset = ss.getSheetByName('log_reset_pass');

    const uRows = sheetUser ? readUserSheetDecrypted_(sheetUser).length - 1 : 0;
    const cRows = sheetCuti ? readCutiSheetDecrypted_(sheetCuti).length - 1 : 0;

    if (sheetReset) {
      const rData = sheetReset.getDataRange().getDisplayValues();
      if (rData && rData.length > 1) {
        let dirtyR = false;
        for (let i = 1; i < rData.length; i++) {
          const rNip = String(rData[i][2] || '').replace(/^'+/, '').trim();
          const rWa = String(rData[i][4] || '').replace(/^'+/, '').trim();
          const rPass = String(rData[i][5] || '').replace(/^'+/, '').trim();
          if (rNip && !isEncryptedField_(rNip)) {
            sheetReset.getRange(i + 1, 3).setNumberFormat('@').setValue(encryptField_(rNip));
            dirtyR = true;
          }
          if (rWa && !isEncryptedField_(rWa)) {
            sheetReset.getRange(i + 1, 5).setNumberFormat('@').setValue(encryptField_(rWa));
            dirtyR = true;
          }
          if (rPass && !isEncryptedField_(rPass) && !rPass.startsWith('SHA256$')) {
            sheetReset.getRange(i + 1, 6).setNumberFormat('@').setValue(encryptField_(rPass));
            dirtyR = true;
          }
        }
        if (dirtyR) bumpDataVersion();
      }
    }

    SpreadsheetApp.flush();
    return { status: 'encrypted', userRows: Math.max(0, uRows), cutiRows: Math.max(0, cRows) };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function onOpen(e) {
  try {
    ensureAllPiiSheetsEncrypted_();
  } catch (err) {}
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (!sheet) return;
    const name = sheet.getName();
    if (name === 'user_data') {
      readUserSheetDecrypted_(sheet);
    } else if (name === 'cuti_log') {
      readCutiSheetDecrypted_(sheet);
    }
    bumpDataVersion();
  } catch (err) {}
}

// =========================================================================
// 5C. MESIN KALENDER HARI KERJA SKB 3 MENTERI (2026 & 2027) & ROLLOVER CUTI
// Sesuai SE Sekretaris Mahkamah Agung RI No. 13 Tahun 2019 & SKB 1205/3/2 Tahun 2026
// =========================================================================
var TRANSKEP_HOLIDAYS_MAP_ = {
  // --- HARI LIBUR NASIONAL & CUTI BERSAMA TAHUN 2026 ---
  '2026-01-01': 'Tahun Baru 2026 Masehi',
  '2026-01-16': 'Isra Mikraj Nabi Muhammad S.A.W.',
  '2026-02-16': 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili',
  '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
  '2026-03-18': 'Cuti Bersama Hari Suci Nyepi',
  '2026-03-19': 'Hari Suci Nyepi (Tahun Baru Saka 1948)',
  '2026-03-20': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-03-21': 'Idul Fitri 1447 Hijriah',
  '2026-03-22': 'Idul Fitri 1447 Hijriah',
  '2026-03-23': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-03-24': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-04-05': 'Kebangkitan Yesus Kristus (Paskah)',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-15': 'Cuti Bersama Kenaikan Yesus Kristus',
  '2026-05-27': 'Idul Adha 1447 Hijriah',
  '2026-05-28': 'Cuti Bersama Idul Adha 1447 H',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 Hijriah',
  '2026-08-17': 'Proklamasi Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad S.A.W.',
  '2026-12-24': 'Cuti Bersama Kelahiran Yesus Kristus',
  '2026-12-25': 'Kelahiran Yesus Kristus',

  // --- HARI LIBUR NASIONAL & CUTI BERSAMA TAHUN 2027 (SKB Nomor 1205/3/2 Tahun 2026) ---
  '2027-01-01': 'Tahun Baru 2027 Masehi',
  '2027-01-05': 'Isra Mikraj Nabi Muhammad S.A.W. 1448 H',
  '2027-02-05': 'Cuti Bersama Tahun Baru Imlek 2578 Kongzili',
  '2027-02-06': 'Tahun Baru Imlek 2578 Kongzili',
  '2027-03-08': 'Hari Suci Nyepi (Tahun Baru Saka 1949)',
  '2027-03-09': 'Cuti Bersama Idul Fitri 1448 H',
  '2027-03-10': 'Idul Fitri 1448 Hijriah',
  '2027-03-11': 'Idul Fitri 1448 Hijriah',
  '2027-03-12': 'Cuti Bersama Idul Fitri 1448 H',
  '2027-03-15': 'Cuti Bersama Idul Fitri 1448 H',
  '2027-03-25': 'Cuti Bersama Wafat Yesus Kristus',
  '2027-03-26': 'Wafat Yesus Kristus',
  '2027-03-28': 'Kebangkitan Yesus Kristus (Paskah)',
  '2027-05-01': 'Hari Buruh Internasional',
  '2027-05-06': 'Kenaikan Yesus Kristus',
  '2027-05-17': 'Idul Adha 1448 Hijriah',
  '2027-05-18': 'Cuti Bersama Idul Adha 1448 H',
  '2027-05-19': 'Cuti Bersama Hari Raya Waisak 2571 BE',
  '2027-05-20': 'Hari Raya Waisak 2571 BE',
  '2027-06-01': 'Hari Lahir Pancasila',
  '2027-06-06': '1 Muharam Tahun Baru Islam 1449 H',
  '2027-08-15': 'Maulid Nabi Muhammad S.A.W.',
  '2027-08-17': 'Proklamasi Kemerdekaan RI',
  '2027-12-24': 'Cuti Bersama Kelahiran Yesus Kristus',
  '2027-12-25': 'Kelahiran Yesus Kristus',
  '2027-12-26': 'Isra Mikraj Nabi Muhammad S.A.W. 1449 H'
};

function getActiveYearWIB_() {
  try {
    return parseInt(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy'), 10);
  } catch (e) {
    return new Date().getFullYear();
  }
}

function parseYmdSafe_(dateStr) {
  if (!dateStr) return null;
  const norm = normalizeDateDB(String(dateStr).trim());
  const parts = norm.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d, 12, 0, 0);
    }
  }
  const fallback = new Date(dateStr);
  if (isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12, 0, 0);
}

function hitungHariKerjaCuti_(tglMulaiStr, tglSelesaiStr) {
  const d1 = parseYmdSafe_(tglMulaiStr);
  const d2 = parseYmdSafe_(tglSelesaiStr);
  if (!d1 || !d2 || d2 < d1) {
    return { durasi: 0, holidayCount: 0, weekendCount: 0, skippedHolidays: [] };
  }

  let durasi = 0;
  let holidayCount = 0;
  let weekendCount = 0;
  const skippedHolidays = [];

  for (let d = new Date(d1.getTime()); d <= d2; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      weekendCount++;
      continue;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const ymd = y + '-' + m + '-' + day;

    if (TRANSKEP_HOLIDAYS_MAP_[ymd]) {
      holidayCount++;
      skippedHolidays.push({ date: ymd, name: TRANSKEP_HOLIDAYS_MAP_[ymd] });
    } else {
      durasi++;
    }
  }

  return {
    durasi: durasi,
    holidayCount: holidayCount,
    weekendCount: weekendCount,
    skippedHolidays: skippedHolidays
  };
}

var _cachedRolloverCheckedYear_ = 0;

/**
 * Mesin Auto-Rollover Saldo Cuti Tahunan 3 Tahun (N-2, N-1, N) Tepat Tengah Malam 1 Januari 00:00 WIB
 * Patuh penuh pada SE Sekretaris Mahkamah Agung RI No. 13 Tahun 2019 (Huruf F angka 1.d s.d. 1.h)
 */
function ensureAnnualCutiRollover_(ss) {
  const currentYear = getActiveYearWIB_();
  if (_cachedRolloverCheckedYear_ === currentYear) return currentYear;

  try {
    const props = PropertiesService.getScriptProperties();
    let lastRolloverYear = parseInt(props.getProperty('LAST_CUTI_ROLLOVER_YEAR') || '0', 10);

    if (!ss) ss = getDB();
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetUser || sheetUser.getLastRow() <= 1) {
      _cachedRolloverCheckedYear_ = currentYear;
      return currentYear;
    }

    // Jika properti belum pernah diinisialisasi, deteksi tahun aktif dari header Kolom I (indeks 9)
    if (!lastRolloverYear || isNaN(lastRolloverYear)) {
      const col9Header = String(sheetUser.getRange(1, 9).getDisplayValue() || '').trim();
      const matchYear = col9Header.match(/(\d{4})/);
      const detectedHeaderYear = matchYear ? parseInt(matchYear[1], 10) : 2026;
      lastRolloverYear = detectedHeaderYear;
      props.setProperty('LAST_CUTI_ROLLOVER_YEAR', String(lastRolloverYear));
    }

    if (lastRolloverYear >= currentYear) {
      _cachedRolloverCheckedYear_ = currentYear;
      return currentYear;
    }

    // Kunci eksekusi agar tidak terjadi race condition saat pergantian tahun baru tengah malam
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return currentYear;

    try {
      lastRolloverYear = parseInt(props.getProperty('LAST_CUTI_ROLLOVER_YEAR') || String(lastRolloverYear), 10);
      if (lastRolloverYear >= currentYear) {
        _cachedRolloverCheckedYear_ = currentYear;
        return currentYear;
      }

      const sheetCuti = ss.getSheetByName('cuti_log');
      const cData = sheetCuti ? readCutiSheetDecrypted_(sheetCuti) : [];

      let yearCursor = lastRolloverYear;
      while (yearCursor < currentYear) {
        const nextYear = yearCursor + 1; // Contoh: 2026 -> 2027
        const prevN1Year = yearCursor - 1; // Contoh: 2025

        // Petakan pemakaian Cuti Tahunan aktif/disetujui per tahun (prevN1Year & yearCursor)
        const usedPrevN1Map = {};
        const usedCurrMap = {};
        for (let c = 1; c < cData.length; c++) {
          const jenis = String(cData[c][3] || '').trim();
          const status = String(cData[c][7] || '').trim();
          if (jenis === 'Tahunan' && status !== 'Ditolak' && status !== 'DIBATALKAN') {
            const cNip = String(cData[c][2] || '').replace(/['"\s]/g, '');
            const dMulai = parseYmdSafe_(cData[c][4]);
            const yMulai = dMulai ? dMulai.getFullYear() : 0;
            if (cNip) {
              if (yMulai === prevN1Year) usedPrevN1Map[cNip] = true;
              if (yMulai === yearCursor) usedCurrMap[cNip] = true;
            }
          }
        }

        // Cek snapshot NIP yang utuh 12 hari pada prevN1Year (jika pernah disimpan saat rollover tahun sebelumnya)
        let prevN1UtuhSet = null;
        const rawPrevUtuh = props.getProperty('CUTI_UTUH_NIPS_' + prevN1Year);
        if (rawPrevUtuh) {
          try {
            const arr = JSON.parse(rawPrevUtuh);
            if (Array.isArray(arr)) {
              prevN1UtuhSet = {};
              for (let k = 0; k < arr.length; k++) prevN1UtuhSet[String(arr[k])] = true;
            }
          } catch (eJson) {}
        }

        const uData = readUserSheetDecrypted_(sheetUser);
        const numRows = uData.length - 1;
        const newQuotas = [];
        const currYearUtuhList = [];

        for (let i = 1; i < uData.length; i++) {
          const empNip = String(uData[i][0] || '').replace(/['"\s]/g, '');
          const oldN1 = Math.max(0, Number(uData[i][7]) || 0); // Contoh: saldo 2025
          const oldN  = Math.max(0, Number(uData[i][8]) || 0); // Contoh: saldo 2026

          const wasCurrUtuh = (oldN >= 12) && !usedCurrMap[empNip];
          if (wasCurrUtuh && empNip) {
            currYearUtuhList.push(empNip);
          }

          const wasPrevN1Utuh = prevN1UtuhSet
            ? (!!prevN1UtuhSet[empNip] && (oldN1 === 6 || oldN1 >= 12) && !usedPrevN1Map[empNip])
            : ((oldN1 === 6 || oldN1 >= 12) && !usedPrevN1Map[empNip]);

          // 1. Saldo N-2 baru (2025): Hanya bernilai 6 jika TIDAK DIGUNAKAN SAMA SEKALI selama 2 tahun berturut-turut (SE SEKMA F.1.e & F.1.f)
          const isUtuhDuaTahun = wasCurrUtuh && wasPrevN1Utuh;
          const newN2 = isUtuhDuaTahun ? 6 : 0;

          // 2. Saldo N-1 baru (2026): Jika 7..12 -> 6, jika 6 -> 6, jika 1..5 -> sesuai sisanya (SE SEKMA F.1.g)
          const newN1 = oldN > 6 ? 6 : oldN;

          // 3. Saldo N baru (2027): Otomatis diisi 12 hari
          const newN = 12;

          newQuotas.push([newN2, newN1, newN]);
        }

        if (numRows > 0) {
          sheetUser.getRange(2, 7, numRows, 3).setValues(newQuotas);
        }

        try {
          props.setProperty('CUTI_UTUH_NIPS_' + yearCursor, JSON.stringify(currYearUtuhList));
        } catch (eProp) {}

        // Perbarui judul kolom G, H, I di Google Sheet
        sheetUser.getRange(1, 7, 1, 3).setValues([[
          'Sisa_Tahunan_' + (nextYear - 2),
          'Sisa_Tahunan_' + (nextYear - 1),
          'Sisa_Tahunan_' + nextYear
        ]]);

        yearCursor = nextYear;
        props.setProperty('LAST_CUTI_ROLLOVER_YEAR', String(yearCursor));
      }

      bumpDataVersion();
      _cachedRolloverCheckedYear_ = currentYear;
    } finally {
      lock.releaseLock();
    }
  } catch (errRoll) {
    Logger.log("Auto-Rollover Cuti Tahunan warning: " + errRoll.toString());
  }

  return currentYear;
}

/**
 * Mesin Pemotongan Saldo Cuti Terpusat (SE SEKMA No. 13 Tahun 2019)
 * - Cuti Tahunan dengan N-2 > 0: Jika durasi <= (N-1 + N) maka N-2 otomatis hangus jadi 0 & potong mulai dari N-1.
 *   Jika durasi > (N-1 + N) [misal 19..24 hari], maka N-2 ikut dipakai penuh lalu N-1 lalu N.
 * - Cuti Besar: Selain memotong kuota Cuti Besar, otomatis mengenolkan Cuti Tahunan tahun berjalan (N = 0).
 */
function potongSaldoCutiServer_(sheetUser, rowIndex, jenis, durasi, activeYear) {
  const yr = activeYear || getActiveYearWIB_();
  const historyJson = {
    y24: 0,
    y25: 0,
    y26: 0,
    hangus_n2: 0,
    hangus_n_besar: 0,
    year_n: yr,
    dur: durasi
  };

  const rowVals = sheetUser.getRange(rowIndex, 7, 1, 7).getValues()[0]; // Kolom 7..13 (indeks 0..6)
  let sN2 = Math.max(0, Number(rowVals[0]) || 0);
  let sN1 = Math.max(0, Number(rowVals[1]) || 0);
  let sN  = Math.max(0, Number(rowVals[2]) || 0);
  historyJson.snap_awal = [sN2, sN1, sN];
  historyJson.snap_akhir = [sN2, sN1, sN];

  if (jenis === 'Dinas Luar') return historyJson;
  if (durasi <= 0) {
    throw new Error("Rentang tanggal yang dipilih seluruhnya merupakan akhir pekan atau Hari Libur Nasional / Cuti Bersama (0 hari kerja efektif).");
  }
  if (jenis === 'CLTN') return historyJson;

  if (jenis === 'Tahunan') {
    const totalTersedia = sN2 + sN1 + sN;
    if (totalTersedia < durasi) {
      throw new Error("Saldo cuti tahunan tidak mencukupi (Tersedia: " + totalTersedia + " hari, Pengajuan: " + durasi + " hari).");
    }

    const batasTanpaN2 = sN1 + sN; // Standar 6 + 12 = 18 hari
    let sisaPotong = durasi;

    if (sN2 > 0 && durasi <= batasTanpaN2) {
      // Pengajuan 1..18 hari: N-2 otomatis hangus menjadi 0, pemotongan dimulai dari N-1 lalu N
      historyJson.hangus_n2 = sN2;
      sheetUser.getRange(rowIndex, 7).setValue(0);

      if (sN1 >= sisaPotong) {
        historyJson.y25 = sisaPotong;
        sheetUser.getRange(rowIndex, 8).setValue(sN1 - sisaPotong);
        sisaPotong = 0;
      } else {
        historyJson.y25 = sN1;
        sisaPotong -= sN1;
        sheetUser.getRange(rowIndex, 8).setValue(0);
      }

      if (sisaPotong > 0) {
        historyJson.y26 = sisaPotong;
        sheetUser.getRange(rowIndex, 9).setValue(sN - sisaPotong);
      }
    } else {
      // Pengajuan 19..24 hari (atau N-2 memang 0): Potong urut N-2 -> N-1 -> N
      if (sN2 >= sisaPotong) {
        historyJson.y24 = sisaPotong;
        sheetUser.getRange(rowIndex, 7).setValue(sN2 - sisaPotong);
        sisaPotong = 0;
      } else {
        historyJson.y24 = sN2;
        sisaPotong -= sN2;
        sheetUser.getRange(rowIndex, 7).setValue(0);
      }

      if (sisaPotong > 0) {
        if (sN1 >= sisaPotong) {
          historyJson.y25 = sisaPotong;
          sheetUser.getRange(rowIndex, 8).setValue(sN1 - sisaPotong);
          sisaPotong = 0;
        } else {
          historyJson.y25 = sN1;
          sisaPotong -= sN1;
          sheetUser.getRange(rowIndex, 8).setValue(0);
        }
      }

      if (sisaPotong > 0) {
        if (sN >= sisaPotong) {
          historyJson.y26 = sisaPotong;
          sheetUser.getRange(rowIndex, 9).setValue(sN - sisaPotong);
          sisaPotong = 0;
        } else {
          throw new Error("Saldo cuti tahunan tidak mencukupi.");
        }
      }
    }
  } else {
    const mapCol = { 'Sakit': 10, 'Alasan Penting': 11, 'Penting': 11, 'Besar': 12, 'Melahirkan': 13 };
    const col = mapCol[jenis];
    if (col) {
      const sCuti = Math.max(0, Number(sheetUser.getRange(rowIndex, col).getValue()) || 0);
      if (sCuti < durasi) {
        throw new Error("Saldo cuti " + jenis + " Anda tidak mencukupi.");
      }
      sheetUser.getRange(rowIndex, col).setValue(sCuti - durasi);

      // SE SEKMA Hal. 10 angka 2.a.4: Mengambil Cuti Besar otomatis mengenolkan Cuti Tahunan tahun berjalan (N = 0)
      if (jenis === 'Besar' && sN > 0) {
        historyJson.hangus_n_besar = sN;
        sheetUser.getRange(rowIndex, 9).setValue(0);
      }
    }
  }

  historyJson.snap_akhir = [
    Math.max(0, sN2 - historyJson.y24 - historyJson.hangus_n2),
    Math.max(0, sN1 - historyJson.y25),
    Math.max(0, sN - historyJson.y26 - historyJson.hangus_n_besar)
  ];

  return historyJson;
}

/**
 * Mesin Pemulihan (Refund) Saldo Cuti Terpusat (Saat Ditolak / Diedit / Ditarik / Dibatalkan)
 * Mengembalikan potongan kuota sekaligus memulihkan N-2 yang sempat hangus atau N yang nol akibat Cuti Besar.
 */
function pulihkanSaldoCutiServer_(sheetUser, rowIndex, jenis, historyStr) {
  if (!sheetUser || rowIndex <= 1 || jenis === 'Dinas Luar') return;

  let h24 = 0, h25 = 0, h26 = 0, hangusN2 = 0, hangusNBesar = 0, hLain = 0, histYear = 0;
  if (historyStr) {
    try {
      const h = (typeof historyStr === 'string') ? JSON.parse(historyStr) : historyStr;
      h24 = Number(h.y24) || 0;
      h25 = Number(h.y25) || 0;
      h26 = Number(h.y26) || 0;
      hangusN2 = Number(h.hangus_n2) || 0;
      hangusNBesar = Number(h.hangus_n_besar) || 0;
      hLain = Number(h.dur) || 0;
      histYear = Number(h.year_n) || 0;
    } catch (e) {}
  }

  const currentYear = getActiveYearWIB_();
  const yearShift = (histYear > 0 && currentYear > histYear) ? (currentYear - histYear) : 0;

  if (jenis === 'Tahunan') {
    const c24 = Number(sheetUser.getRange(rowIndex, 7).getValue() || 0);
    const c25 = Number(sheetUser.getRange(rowIndex, 8).getValue() || 0);
    const c26 = Number(sheetUser.getRange(rowIndex, 9).getValue() || 0);

    if (yearShift === 0) {
      sheetUser.getRange(rowIndex, 7).setValue(c24 + h24 + hangusN2);
      sheetUser.getRange(rowIndex, 8).setValue(c25 + h25);
      sheetUser.getRange(rowIndex, 9).setValue(c26 + h26);
    } else if (yearShift === 1) {
      // Jika cuti akhir Desember tahun lalu ditolak/dibatalkan pada Januari tahun baru: pulihkan ke N-1 (maks 6)
      sheetUser.getRange(rowIndex, 8).setValue(Math.min(6, c25 + h26));
    }
  } else {
    const mapKolom = { 'Sakit': 10, 'Alasan Penting': 11, 'Penting': 11, 'Besar': 12, 'Melahirkan': 13, 'CLTN': 14 };
    const col = mapKolom[jenis];
    if (col) {
      const cVal = Number(sheetUser.getRange(rowIndex, col).getValue() || 0);
      sheetUser.getRange(rowIndex, col).setValue(cVal + hLain);
    }
    if (jenis === 'Besar' && hangusNBesar > 0 && yearShift === 0) {
      const c26 = Number(sheetUser.getRange(rowIndex, 9).getValue() || 0);
      sheetUser.getRange(rowIndex, 9).setValue(c26 + hangusNBesar);
    }
  }
}

// 6. Revokasi Sesi Server-Side (CWE-613)
function logoutSession(nip, clientToken) {
  try {
    if (clientToken) {
      revokeSessionToken_(clientToken);
    }
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 7. Gateway Otomatisasi WhatsApp (n8n + WAHA Gateway) - TRANSKEP Enterprise Engine v3.0
function getGatewayConfig_() {
  const props = PropertiesService.getScriptProperties();
  const rawUrl = props.getProperty('N8N_WEBHOOK_URL') || props.getProperty('WAHA_BASE_URL') || 'https://supernova-endpoint-unsubtly.ngrok-free.dev/webhook/transkep-gateway';
  
  let endpoint = rawUrl.trim().replace(/\/+$/, '');
  if (!endpoint.includes('/webhook') && !endpoint.includes('/api/')) {
    endpoint += '/webhook/transkep-gateway';
  }
  
  return {
    endpoint: endpoint,
    apiKey: props.getProperty('WAHA_API_KEY') || '192167ce5e0147dcb4eaaaff7eccfc18',
    session: props.getProperty('WAHA_SESSION') || 'default'
  };
}

function getWahaConfig_() {
  return getGatewayConfig_();
}

function normalizePhone_(raw) {
  if (!raw) return '';
  let clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

function sendWhatsAppMessage_(rawPhone, text, metaPayload) {
  try {
    if (!rawPhone) return { status: 'error', message: 'Nomor WhatsApp tidak boleh kosong.' };
    
    let phone = normalizePhone_(rawPhone);
    
    if (phone.length < 10) { // Minimal 10 digit (628...)
      return { status: 'error', message: 'Nomor WhatsApp tidak valid (minimal 10 digit).' };
    }
    
    const config = getGatewayConfig_();
    
    // Payload terpadu untuk n8n Gateway
    const payload = {
      jenis_pesan: (metaPayload && metaPayload.jenis_pesan) ? metaPayload.jenis_pesan : 'direct',
      nomor_wa: phone,
      pesan: String(text || '')
    };
    
    // Gabungkan meta data terstruktur tambahan jika ada
    if (metaPayload && typeof metaPayload === 'object') {
      for (let k in metaPayload) {
        payload[k] = metaPayload[k];
      }
    }
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey,
        'ngrok-skip-browser-warning': 'true'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(config.endpoint, options);
    const respCode = response.getResponseCode();
    const respText = response.getContentText();
    
    if (respCode >= 200 && respCode < 300) {
      return { status: 'success', data: respText };
    } else {
      Logger.log("n8n Gateway returned HTTP " + respCode + ": " + respText);
      return { status: 'error', code: respCode, message: respText };
    }
  } catch (err) {
    Logger.log("sendWhatsAppMessage_ exception: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

// ------------------------------------------
// 1. AUTENTIKASI & TARIK DATA (CORE)
// ------------------------------------------
function verifyLogin(nip, pass) {
  try {
    const cleanInputNip = normalizeNipKey_(nip);
    if (!cleanInputNip || !pass) {
      return { status: 'error', message: 'NIP atau Sandi tidak valid' };
    }

    const loginRlKey = 'login_' + cleanInputNip;
    if (checkRateLimitBlocked_(loginRlKey, 5)) {
      return {
        status: 'error',
        message: 'Terlalu banyak percobaan login gagal. Akun dikunci sementara selama 10 menit demi keamanan.'
      };
    }

    // Memanggil koneksi database terpusat & cek pergantian tahun otomatis
    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    const cutiYears = [activeYear - 2, activeYear - 1, activeYear];
    
    const sheet = ss.getSheetByName('user_data');
    const data = readUserSheetDecrypted_(sheet);
    for (let i = 1; i < data.length; i++) {
      if (normalizeNipKey_(data[i][0]) === cleanInputNip) {
        const storedPass = String(data[i][5] || '');
        if (verifyPasswordHash_(storedPass, pass)) {
          clearRateLimit_(loginRlKey);
          // Auto-Upgrade ke Salted SHA-256 jika sandi masih format transisi ENC$ / plaintext
          if (!storedPass.startsWith("SHA256$")) {
            try {
              sheet.getRange(i + 1, 6).setNumberFormat('@').setValue(hashPassword_(pass));
            } catch (eUp) {}
          }

          const user = {
            nip: data[i][0], nama: data[i][1], jabatan: data[i][2], role: data[i][3],
            no_hp: data[i][4], s_tahunan_2024: data[i][6], s_tahunan_2025: data[i][7],
            s_tahunan_2026: data[i][8], s_sakit: data[i][9], s_penting: data[i][10],
            s_besar: data[i][11], s_melahirkan: data[i][12], s_cltn: data[i][13],
            pangkat: data[i][14], alamat: data[i][15], cuti_years: cutiYears
          };

          const sess = signSessionToken_(user.nip, user.role);
          const cache = CacheService.getScriptCache();
          try {
            cache.put('sess_' + sess.jti, JSON.stringify({ nip: normalizeNipKey_(user.nip), role: String(user.role || '') }), SESSION_CACHE_TTL_SEC_);
          } catch (eSessCache) {}

          let cachedTemp = null;
          const cleanUserNip = normalizeNipKey_(user.nip);
          try {
            cachedTemp = cache.get("force_reset_" + cleanUserNip) || cache.get("force_reset_" + user.nip);
          } catch(e) {}

          const isTempPass = (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())) || !!cachedTemp;
          if (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())) {
            try {
              cache.put("force_reset_" + cleanUserNip, "1", SESSION_CACHE_TTL_SEC_);
            } catch(e) {}
          }
          return { status: 'success', data: user, token: sess.token, must_change_password: isTempPass };
        }
      }
    }
    recordRateLimitHit_(loginRlKey, 5, 600, 600);
    return { status: 'error', message: 'NIP atau Sandi tidak valid' };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

// ==========================================
// TAHAP 2: SERVER-SIDE CACHING & VERSIONING
// ==========================================

function getServerDataVersion_(ssOpt) {
  let v = null;
  try {
    v = PropertiesService.getScriptProperties().getProperty('TRANSKEP_DATA_VERSION');
  } catch(e) {}
  if (!v) {
    v = String(new Date().getTime());
    try {
      PropertiesService.getScriptProperties().setProperty('TRANSKEP_DATA_VERSION', v);
    } catch(e) {}
  }
  try {
    const ss = ssOpt || getDB();
    if (ss) {
      const shCuti = ss.getSheetByName('cuti_log');
      const shUser = ss.getSheetByName('user_data');
      const shIk = ss.getSheetByName('izin_keluar_log');
      const shIp = ss.getSheetByName('izin_pribadi_log');
      const shWfh = ss.getSheetByName('wfh_log');

      const cRow = shCuti ? shCuti.getLastRow() : 0;
      const cLastId = (shCuti && cRow > 1) ? String(shCuti.getRange(cRow, 1).getDisplayValue() || '').slice(-8) : '0';
      const uRow = shUser ? shUser.getLastRow() : 0;
      const ikRow = shIk ? shIk.getLastRow() : 0;
      const ipRow = shIp ? shIp.getLastRow() : 0;
      const wfhRow = shWfh ? shWfh.getLastRow() : 0;

      return v + '_' + cRow + '-' + cLastId + '_' + uRow + '_' + ikRow + '_' + ipRow + '_' + wfhRow;
    }
  } catch (errFp) {}
  return v;
}

function bumpDataVersion() {
  try {
    SpreadsheetApp.flush();
  } catch(e) {}
  const newVersion = String(new Date().getTime());
  try {
    PropertiesService.getScriptProperties().setProperty('TRANSKEP_DATA_VERSION', newVersion);
  } catch(e) {}
  invalidateServerCache_();
  return newVersion;
}
const bumpDataVersion_ = bumpDataVersion;

function invalidateServerCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('TRANSKEP_BG_DATA_COUNT');
  } catch(e) {}
}

function setCacheChunked_(baseKey, dataObj, expirationInSeconds) {
  try {
    const jsonStr = JSON.stringify(dataObj);
    const chunkSize = 80000; // ~80KB per chunk aman dari limit 100KB Apps Script
    const totalChunks = Math.ceil(jsonStr.length / chunkSize);
    const cache = CacheService.getScriptCache();
    const exp = expirationInSeconds || 21600; // default 6 jam

    cache.put(baseKey + '_COUNT', String(totalChunks), exp);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = jsonStr.substring(i * chunkSize, (i + 1) * chunkSize);
      cache.put(baseKey + '_' + i, chunk, exp);
    }
    return true;
  } catch(err) {
    console.warn("⚠️ Gagal setCacheChunked_:", err);
    return false;
  }
}

function getCacheChunked_(baseKey) {
  try {
    const cache = CacheService.getScriptCache();
    const countStr = cache.get(baseKey + '_COUNT');
    if (!countStr) return null;
    const totalChunks = parseInt(countStr, 10);
    if (isNaN(totalChunks) || totalChunks <= 0) return null;

    let fullStr = '';
    for (let i = 0; i < totalChunks; i++) {
      const chunk = cache.get(baseKey + '_' + i);
      if (chunk === null) return null;
      fullStr += chunk;
    }
    return JSON.parse(fullStr);
  } catch(err) {
    console.warn("⚠️ Gagal getCacheChunked_:", err);
    return null;
  }
}

function normalizeDateDB(dateStr) {
  if (!dateStr) return "";
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) return dateStr;
  let parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  if (parts.length === 3) {
      let d = parts[0].padStart(2, '0');
      let m = parts[1].padStart(2, '0');
      let y = parts[2];
      if (y.length === 2) y = "20" + y; 
      return `${y}-${m}-${d}`;
  }
  return dateStr;
}

function getBulkData(nip, clientToken, clientVersion) {
  try {
    // === VALIDASI KEAMANAN TERPUSAT ===
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi kedaluwarsa atau manipulasi terdeteksi. Silakan login ulang.' };
    }

    // Memanggil koneksi database terpusat, auto-rollover tahun baru, & self-healing enkripsi sebelum short-circuit versi
    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    const cutiYears = [activeYear - 2, activeYear - 1, activeYear];
    const sheetUser = ss.getSheetByName('user_data');
    const uData = sheetUser ? readUserSheetDecrypted_(sheetUser) : [];

    const serverVersion = getServerDataVersion_(ss);

    // DELTA SYNC SHORT-CIRCUIT (TAHAP 2):
    if (clientVersion && String(clientVersion) === String(serverVersion)) {
      return { status: 'NOT_MODIFIED', version: serverVersion, cuti_years: cutiYears };
    }

    let cachedTempFlag = null;
    const cleanReqNip = normalizeNipKey_(nip);
    try {
      cachedTempFlag = CacheService.getScriptCache().get("force_reset_" + cleanReqNip) ||
        CacheService.getScriptCache().get("force_reset_" + nip);
    } catch(e) {}

    const data = { 
      user: null, 
      usersList: [], 
      pendingPkpCount: 0,
      must_change_password: !!cachedTempFlag,
      cuti_years: cutiYears
    };

    if(sheetUser && uData.length > 0) {

       let isRequesterAdmin = false;
       for (let i = 1; i < uData.length; i++) {
          const rLower = String(uData[i][3] || '').toLowerCase().trim();
          if (normalizeNipKey_(uData[i][0]) === cleanReqNip && (rLower === 'admin' || rLower === 'operator')) {
             isRequesterAdmin = true;
             break;
          }
       }

       const uHeaders = uData[0].map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
       const findColIdx = (name, fallback) => {
         const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
         const idx = uHeaders.indexOf(clean);
         return idx !== -1 ? idx : fallback;
       };

       const colNip = findColIdx('NIP', 0);
       const colNama = findColIdx('Nama', 1);
       const colJab = findColIdx('Jabatan', 2);
       const colRole = findColIdx('Role', 3);
       const colHp = findColIdx('No_HP', 4);
       const colPass = findColIdx('Password', 5);
       const colPangkat = findColIdx('Pangkat', 14);
       const colAlamat = findColIdx('Alamat', 15);
       const colTmtKgb = findColIdx('TMT_KGB', 16);
       const colTmtKnp = findColIdx('TMT_KNP', 17);
       const colBup = findColIdx('BUP', 18);
       const colStatusKgb = findColIdx('Status_KGB', 19);
       const colTglKgb = findColIdx('Tgl_Selesai_KGB', 20);
       const colStatusKnp = findColIdx('Status_KNP', 21);
       const colTglKnp = findColIdx('Tgl_Selesai_KNP', 22);
       const colStatusPensiun = findColIdx('Status_Pensiun', 23);
       const colTglPensiun = findColIdx('Tgl_Selesai_Pensiun', 24);
       const colJenisJab = findColIdx('Jenis_Jabatan', 25);

       for(let i=1; i<uData.length; i++) {
          const isCurrentUser = (normalizeNipKey_(uData[i][colNip]) === cleanReqNip);
          const hasStoredPass = Boolean(String(uData[i][colPass] || '').trim());
          const userPassword = ((isRequesterAdmin || isCurrentUser) && hasStoredPass) ? '[Telah Dienkripsi]' : '';

          const u = {
            nip: uData[i][colNip], nama: uData[i][colNama], jabatan: uData[i][colJab], role: uData[i][colRole],
            no_hp: uData[i][colHp], pass: userPassword,
            s_tahunan_2024: uData[i][6], s_tahunan_2025: uData[i][7], s_tahunan_2026: uData[i][8],
            s_sakit: uData[i][9], s_penting: uData[i][10], s_besar: uData[i][11], s_melahirkan: uData[i][12], s_cltn: uData[i][13],
            pangkat: uData[i][colPangkat], alamat: uData[i][colAlamat], 
            tmt_kgb: normalizeDateDB(uData[i][colTmtKgb]),
            tmt_knp: normalizeDateDB(uData[i][colTmtKnp]),
            bup: uData[i][colBup], status_kgb: uData[i][colStatusKgb] || '', tgl_selesai_kgb: uData[i][colTglKgb] || '',
            status_knp: uData[i][colStatusKnp] || '', tgl_selesai_knp: uData[i][colTglKnp] || '',
            status_pensiun: uData[i][colStatusPensiun] || '', tgl_selesai_pensiun: uData[i][colTglPensiun] || '',
            jenis_jabatan: uData[i][colJenisJab] || 'Fungsional Umum',
            cuti_years: cutiYears
          };
          data.usersList.push(u);
          if (isCurrentUser) data.user = u;
       }
    }

    data.pendingPkpCount = 0;
    const sheetPkpDoc = ss.getSheetByName('pkp_dokumen');
    const sheetPckDoc = ss.getSheetByName('pck_dokumen');
    let pendingCount = 0;
    
    if (sheetPkpDoc) {
        const pkpData = sheetPkpDoc.getDataRange().getDisplayValues();
        const bawahanMap = {}; 
        
        for(let i=1; i<pkpData.length; i++) {
            bawahanMap[pkpData[i][1] + "-" + pkpData[i][3]] = pkpData[i][2]; 
            
            let dbPenilai = String(pkpData[i][2]).replace(/'/g, "").trim();
            let dbAtasan = String(pkpData[i][7] || "").replace(/'/g, "").trim();
            let status = pkpData[i][4];
            
            if ((dbPenilai === String(nip) && status === "Menunggu Penilai") || 
                (dbAtasan === String(nip) && status === "Menunggu Atasan Penilai")) {
                pendingCount++;
            }
        }
        
        if (sheetPckDoc) {
            const pckData = sheetPckDoc.getDataRange().getDisplayValues();
            for(let j=1; j<pckData.length; j++) {
                let nipPemilik = String(pckData[j][1]).replace(/'/g, "").trim();
                let tahun = pckData[j][3];
                let status = pckData[j][6];
                let penilai = String(bawahanMap[nipPemilik + "-" + tahun] || "").replace(/'/g, "").trim();
                
                if (penilai === String(nip) && status === "Menunggu Penilai") {
                    pendingCount++;
                }
            }
        }
    }
    data.pendingPkpCount = pendingCount;

    return { status: 'UPDATED', version: serverVersion, data: data };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function getBackgroundData(nip, clientToken, clientVersion) {
  try {
    // === VALIDASI KEAMANAN TERPUSAT ===
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Sesi kedaluwarsa atau tidak valid.' };
    }
    
    // Memanggil koneksi database terpusat & menghitung sidik jari baris real-time
    const ss = getDB();
    const serverVersion = getServerDataVersion_(ss);

    // DELTA SYNC SHORT-CIRCUIT (TAHAP 2):
    if (clientVersion && String(clientVersion) === String(serverVersion)) {
      return { status: 'NOT_MODIFIED', version: serverVersion };
    }

    // Cek Server-Side Cache (CacheService Chunked)
    const cachedBg = getCacheChunked_('TRANSKEP_BG_DATA_' + serverVersion);
    if (cachedBg) {
      return { status: 'UPDATED', version: serverVersion, data: cachedBg };
    }

    const data = { cutiLogs: [], jobdesList: [], skList: [], skAckList: [], masterKinerjaList: [], ikLogs: [], ipLogs: [], wfhLogs: [], kinerjaList: [], stList: [], sopList: [], sopAckList: [] };

    const sheetMasterKinerja = ss.getSheetByName('master_kinerja');
    if(sheetMasterKinerja) {
       const mkData = sheetMasterKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<mkData.length; i++) {
          if (mkData[i][0] && mkData[i][0] !== "ID_Tugas") {
             data.masterKinerjaList.push({ id_tugas: mkData[i][0], jabatan: mkData[i][1], kategori: mkData[i][2], sasaran: mkData[i][3], indikator: mkData[i][4], satuan: mkData[i][5], mutu: mkData[i][6], waktu: mkData[i][7] });
          }
       }
    }

    const sheetCuti = ss.getSheetByName('cuti_log');
    if(sheetCuti) {
       const cData = readCutiSheetDecrypted_(sheetCuti);
       for(let i=1; i<cData.length; i++) {
          if (!cData[i][0]) continue;
          data.cutiLogs.push({
            id: cData[i][0],
            tgl_pengajuan: cData[i][1],
            nip: String(cData[i][2] || '').trim().replace(/'/g, ''),
            jenis: cData[i][3],
            tgl_mulai: cData[i][4],
            tgl_selesai: cData[i][5],
            alasan: cData[i][6],
            status: cData[i][7],
            catatan: cData[i][8],
            atasan_nip: String(cData[i][9] || '').trim().replace(/'/g, ''),
            pejabat_nip: String(cData[i][10] || '').trim().replace(/'/g, ''),
            sisa_cuti: cData[i][11],
            catatan_pejabat: cData[i][12],
            status_atasan: cData[i][13],
            status_pejabat: cData[i][14],
            alamat: cData[i][15],
            history: cData[i][16],
            bukti_url: cData[i][17],
            nomor_surat: String(cData[i][19] || '').trim()
          });
       }
    }
    
    const sheetJobdes = ss.getSheetByName('jobdes_data');
    if(sheetJobdes) {
       const jData = sheetJobdes.getDataRange().getDisplayValues();
       for(let i=1; i<jData.length; i++) {
          data.jobdesList.push({ nip: String(jData[i][0] || '').trim().replace(/'/g, ''), atasan_nip: String(jData[i][1] || '').trim().replace(/'/g, ''), dasar_lampiran: jData[i][2], ikhtisar_jabatan: jData[i][3], tugas_pokok: jData[i][4], tugas_tambahan: jData[i][5], tanggung_jawab: jData[i][6], hasil_kerja: jData[i][7] });
       }
    }

    const sheetKinerja = ss.getSheetByName('ekinerja_data');
    if(sheetKinerja) {
       const kData = sheetKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<kData.length; i++) {
          data.kinerjaList.push({ id: String(kData[i][0]), nip: String(kData[i][1] || '').trim().replace(/'/g, ''), pejabat_nip: String(kData[i][2] || '').trim().replace(/'/g, ''), tahun: kData[i][3], periode: kData[i][4], predikat: kData[i][5], file_penilaian: kData[i][6], file_evaluasi: kData[i][7], status: kData[i][8], tgl_tte: kData[i][9], file_pengesahan: kData[i][10], tgl_input: kData[i][11] });
       }
    }

    const sheetST = ss.getSheetByName('st_log');
    if(sheetST) {
       const stData = sheetST.getDataRange().getDisplayValues();
       for(let i=1; i<stData.length; i++) {
          data.stList.push({ id: stData[i][0], waktu: stData[i][1], nomor: stData[i][2], menimbang: stData[i][3], dasar: stData[i][4], tujuan: stData[i][5], tempat: stData[i][6], tgl_mulai: stData[i][7], tgl_selesai: stData[i][8], jam: stData[i][9], peserta: stData[i][10], pejabat_ttd: String(stData[i][11] || '').trim().replace(/'/g, ''), status: stData[i][12], data_ekstra: stData[i][13] || '{}' });
       }
    }

    const sheetIK = ss.getSheetByName('izin_keluar_log');
    if(sheetIK) {
       const ikData = sheetIK.getDataRange().getDisplayValues();
       for(let i=1; i<ikData.length; i++) {
          data.ikLogs.push({ id: ikData[i][0], tgl_pengajuan: ikData[i][1], nip: String(ikData[i][2] || '').trim().replace(/'/g, ''), tanggal: ikData[i][3], jam_keluar: ikData[i][4], jam_kembali: ikData[i][5], alasan: ikData[i][6], atasan_nip: String(ikData[i][7] || '').trim().replace(/'/g, ''), status: ikData[i][8], catatan: ikData[i][9] });
       }
    }

    const sheetIP = ss.getSheetByName('izin_pribadi_log');
    if(sheetIP) {
       const ipData = sheetIP.getDataRange().getDisplayValues();
       for(let i=1; i<ipData.length; i++) {
          data.ipLogs.push({ id: ipData[i][0], tgl_pengajuan: ipData[i][1], nip: String(ipData[i][2] || '').trim().replace(/'/g, ''), tgl_mulai: ipData[i][3], tgl_selesai: ipData[i][4], alasan: ipData[i][5], atasan_nip: String(ipData[i][7] || '').trim().replace(/'/g, ''), status: ipData[i][7], catatan: ipData[i][8] });
       }
    }

    const sheetWFH = ss.getSheetByName('wfh_log');
    if(sheetWFH) {
       const wfhData = sheetWFH.getDataRange().getDisplayValues();
       for(let i=1; i<wfhData.length; i++) {
          data.wfhLogs.push({ id: wfhData[i][0], tgl_pengajuan: wfhData[i][1], nip: String(wfhData[i][2] || '').trim().replace(/'/g, ''), tanggal: wfhData[i][3], rencana_json: wfhData[i][4], laporan_json: wfhData[i][5], atasan_nip: String(wfhData[i][6] || '').trim().replace(/'/g, ''), status_rencana: wfhData[i][7], status_laporan: wfhData[i][8], catatan: wfhData[i][9] });
       }
    }

    data.skList = typeof fetchSkData === 'function' ? fetchSkData(ss) : [];
    data.skAckList = typeof fetchSkAckData === 'function' ? fetchSkAckData(ss) : [];

    const sheetSop = ss.getSheetByName('sop_data');
    if(sheetSop) {
       const sopData = sheetSop.getDataRange().getDisplayValues();
       for(let i=1; i<sopData.length; i++) {
          data.sopList.push({ id: String(sopData[i][0]), judul_sop: sopData[i][1], kategori_pj: sopData[i][2], nomor_sop: sopData[i][3], tanggal_pembuatan: sopData[i][4], tanggal_revisi: sopData[i][5], tanggal_efektif: sopData[i][6], link_drive: sopData[i][7], pelaksana_json: sopData[i][8], tgl_input: sopData[i][9] });
       }
    }
    const sheetAck = ss.getSheetByName('sop_ack');
    if(sheetAck) {
       const ackData = sheetAck.getDataRange().getDisplayValues();
       for(let i=1; i<ackData.length; i++) {
          if (ackData[i][0] && String(ackData[i][0]).trim() !== '') {
             data.sopAckList.push({ id: String(ackData[i][0]), sop_id: String(ackData[i][1]), nip: String(ackData[i][2]), tanggal_baca: ackData[i][3] });
          }
       }
    }

    // Simpan ke CacheService secara chunked
    setCacheChunked_('TRANSKEP_BG_DATA_' + serverVersion, data, 21600);

    return { status: 'UPDATED', version: serverVersion, data: data };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

// ==========================================
// BACKEND FITUR LUPA PASSWORD
// ==========================================
function initResetPasswordSheet() {
  const ss = getDB(); // Menggunakan koneksi database terpusat
  let sheet = ss.getSheetByName('log_reset_pass');
  if (!sheet) {
    sheet = ss.insertSheet('log_reset_pass');
    sheet.appendRow(['ID', 'Waktu', 'NIP', 'Nama', 'No_WA', 'Password']);
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#d9ead3");
    sheet.setFrozenRows(1);
  }
  return "Setup sheet log_reset_pass berhasil. Siap digunakan.";
}

function requestPasswordReset(no_wa) {
  try {
    let phone = normalizePhone_(no_wa);
    if (!phone || phone.length < 9) {
      return { status: 'error', message: 'Nomor WhatsApp tidak valid (minimal 9 digit).' };
    }

    const phoneTailKey = 'pwd_reset_' + phone.slice(-9);
    const phoneCdKey = 'pwd_reset_cd_' + phone.slice(-9);
    const globalResetKey = 'pwd_reset_global';

    if (checkRateLimitBlocked_(phoneCdKey, 1)) {
      return { status: 'error', message: 'Mohon tunggu 60 detik sebelum mengirim permintaan reset sandi berikutnya.' };
    }
    if (checkRateLimitBlocked_(phoneTailKey, 2)) {
      return { status: 'error', message: 'Batas permintaan reset sandi tercapai (maksimal 2 kali per 10 menit). Silakan tunggu sebelum mencoba lagi.' };
    }
    if (checkRateLimitBlocked_(globalResetKey, 20)) {
      return { status: 'error', message: 'Layanan reset sandi sedang sibuk. Silakan coba kembali beberapa menit lagi.' };
    }

    recordRateLimitHit_(phoneCdKey, 1, 60, 60);
    recordRateLimitHit_(phoneTailKey, 2, 600, 600);
    recordRateLimitHit_(globalResetKey, 20, 300, 300);

    const ss = getDB(); // Menggunakan koneksi database terpusat
    const userSheet = ss.getSheetByName('user_data');
    if(!userSheet) throw new Error("Database user tidak ditemukan");
    
    const userData = readUserSheetDecrypted_(userSheet); 

    let userFound = null;
    let userRowIndex = -1;
    for (let i = 1; i < userData.length; i++) {
      let userPhoneRaw = normalizePhone_(userData[i][4]);
      
      let isMatch = false;
      if (userPhoneRaw === phone && phone.length > 8) {
        isMatch = true;
      } else if (phone.length >= 9 && userPhoneRaw.length >= 9) {
        // Fallback kecocokan 9 digit terakhir (mengantisipasi variasi awalan 0 / 62 / 8)
        if (phone.slice(-9) === userPhoneRaw.slice(-9)) {
          isMatch = true;
        }
      }
      
      if (isMatch) {
        userFound = {
          nip: userData[i][0], nama: userData[i][1], no_wa: phone, pass: userData[i][5] 
        };
        userRowIndex = i + 1;
        break;
      }
    }

    if (!userFound || userRowIndex === -1) return { status: 'error', message: 'Nomor WhatsApp ini tidak terdaftar di dalam sistem pegawai. Silakan periksa kembali atau hubungi Admin.' };

    // 1. Generate Kata Sandi Sementara (6 Digit OTP) & Hash Salted SHA-256 (One-Way)
    const tempPass = "TR-" + Math.floor(100000 + Math.random() * 900000);
    const newHashedPass = hashPassword_(tempPass);
    userSheet.getRange(userRowIndex, 6).setNumberFormat('@').setValue(newHashedPass);

    try {
      CacheService.getScriptCache().put("force_reset_" + normalizeNipKey_(userFound.nip), "1", SESSION_CACHE_TTL_SEC_);
    } catch(e) {}

    // 2. Kirim otomatis via WhatsApp Gateway WAHA
    const waText = "*TRANSKEP - RESET SANDI SEMENTARA* 🏢\n\n" +
      "Halo *" + userFound.nama + "*,\n\n" +
      "Permintaan reset kata sandi akun TRANSKEP Anda berhasil diproses.\n" +
      "Berikut kredensial masuk sementara Anda:\n\n" +
      "👤 *NIP:* " + userFound.nip + "\n" +
      "🔑 *Sandi Sementara:* *" + tempPass + "*\n\n" +
      "⚠️ *Perhatian:* Segera login ke portal dan perbarui kata sandi Anda di menu profil demi keamanan akun.\n\n" +
      "🔗 *Link Login Portal:* https://sso.pa-indramayu.go.id/";

    let waResult = sendWhatsAppMessage_(userFound.no_wa, waText, {
      jenis_pesan: 'reset_password',
      nama: userFound.nama,
      nip: userFound.nip,
      password_baru: tempPass
    });

    // 3. Evaluasi Hasil Kirim WAHA
    if (waResult && waResult.status === 'success') {
      // Jika berhasil kirim WA otomatis:
      // Bersihkan antrean lama di log_reset_pass untuk user ini agar tidak masuk manual ke admin
      try {
        let logSheet = ss.getSheetByName('log_reset_pass');
        if (logSheet) {
          const lData = logSheet.getDataRange().getDisplayValues();
          for (let r = lData.length - 1; r >= 1; r--) {
            if (String(decryptField_(lData[r][2])).trim() === String(userFound.nip).trim()) {
              logSheet.deleteRow(r + 1);
            }
          }
        }
      } catch(e) {}
      
      bumpDataVersion();
      return { 
        status: 'success', 
        message: 'Kata sandi sementara telah berhasil dikirim otomatis ke nomor WhatsApp Anda (' + userFound.no_wa + ').' 
      };
    } else {
      // 4. PLAN B (CADANGAN): Hanya jika WAHA GAGAL / OFFLINE, catat ke antrean manual Admin!
      let logSheet = ss.getSheetByName('log_reset_pass');
      if (!logSheet) {
        initResetPasswordSheet();
        logSheet = ss.getSheetByName('log_reset_pass');
      }
      
      const uniqueId = 'REQ-' + new Date().getTime();
      const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
      logSheet.appendRow(sanitizeRowArray([uniqueId, timestamp, encryptField_(userFound.nip), userFound.nama, encryptField_(userFound.no_wa), encryptField_(tempPass)]));
      bumpDataVersion();

      return { 
        status: 'success', 
        message: 'Layanan WhatsApp otomatis sedang sibuk/offline. Permintaan reset berhasil dicatat dan Admin akan segera mengirimkannya secara manual.' 
      };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function getResetPasswordQueue(adminNip, clientToken) {
  try {
    // TRANSKEP HOTFIX KREDENSIAL: Proteksi RBAC wajib Admin
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      throw new Error("Akses Ditolak: Anda tidak memiliki izin Admin untuk mengakses antrean ini.");
    }
    const ss = getDB(); // Menggunakan koneksi database terpusat
    const sheet = ss.getSheetByName('log_reset_pass');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getDisplayValues();
    const queue = [];
    for(let i = 1; i < data.length; i++) {
      if(data[i][0] && String(data[i][0]).trim() !== '') { 
        const uNip = String(decryptField_(data[i][2]));
        const uNoWa = String(decryptField_(data[i][4]));
        // Hanya tampilkan sandi sementara (TR-XXXXXX) yang tercatat di antrean log_reset_pass
        let currentPass = data[i][5] ? String(decryptField_(data[i][5])) : '';
        if (!currentPass || currentPass === '-' || currentPass.startsWith("SHA256$")) {
          currentPass = "[Telah Dienkripsi - Reset di Edit Pegawai]";
        }
        queue.push({
          id: data[i][0], waktu: data[i][1], nip: uNip,
          nama: data[i][3], no_wa: uNoWa, pass: currentPass
        });
      }
    }
    return queue;
  } catch (err) { throw new Error(err.toString()); }
}

// Fungsi Pengujian & Trigger Otorisasi Satu Kali (Wajib Tanpa Try-Catch agar Google memunculkan dialog Otorisasi)
function mintaIzinUrlFetch() {
  const cfg = getGatewayConfig_();
  const baseUrl = String(cfg.url || '').replace(/\/webhook.*$/i, '').replace(/\/api.*$/i, '').replace(/\/+$/, '');
  const res = UrlFetchApp.fetch(baseUrl + "/api/sessions", {
    headers: {
      'X-Api-Key': cfg.apiKey,
      'ngrok-skip-browser-warning': 'true'
    }
  });
  Logger.log("Koneksi Berhasil: " + res.getContentText());
}

function testKoneksiWAHA(targetPhone, adminNip, clientToken) {
  if (adminNip || clientToken) {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin yang dapat menjalankan diagnostik WAHA.' };
    }
  }
  const dest = normalizePhone_(targetPhone || PropertiesService.getScriptProperties().getProperty('ADMIN_TEST_PHONE') || '');
  if (!dest) {
    return { status: 'error', message: 'Nomor tujuan tes WAHA belum disetel (kirim parameter targetPhone atau atur Script Property ADMIN_TEST_PHONE).' };
  }
  const result = sendWhatsAppMessage_(dest, 'TRANSKEP - Tes Koneksi n8n Gateway Berhasil Aktif! 🚀', {
    jenis_pesan: 'direct'
  });
  Logger.log("Hasil Uji n8n Gateway: " + JSON.stringify(result));
  return result;
}

function markResetAsDone(reqId, adminNip, clientToken) {
  try {
    // TRANSKEP HOTFIX KREDENSIAL: Proteksi RBAC wajib Admin
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin yang dapat memproses antrean ini.' };
    }
    const ss = getDB(); // Menggunakan koneksi database terpusat
    const sheet = ss.getSheetByName('log_reset_pass');
    if (!sheet) throw new Error("Sheet antrean tidak ditemukan.");
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(reqId)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
      bumpDataVersion();
      return { status: 'success' };
    }
    throw new Error("Antrean dengan ID tersebut tidak ditemukan atau sudah diproses orang lain.");
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}


// ==========================================
// TRANSKEP FASE 2: FUNGSI GANTI KATA SANDI (AMAN)
// ==========================================
function changeMyPassword(nip, oldPass, newPass, clientToken) {
  try {
    // 1. Validasi Token Sesi (Mencegah Bypass)
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid atau kedaluwarsa. Silakan login ulang.' };
    }
    if (!newPass || String(newPass).length < 5) {
        return { status: 'error', message: 'Kata sandi baru minimal terdiri dari 5 karakter.' };
    }

    // 2. Gunakan koneksi database terpusat
    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = readUserSheetDecrypted_(sheet);
    const cleanTargetNip = normalizeNipKey_(nip);

    // 3. Cari pegawai dan verifikasi sandi lama
    for (let i = 1; i < data.length; i++) {
      if (normalizeNipKey_(data[i][0]) === cleanTargetNip) {
        if (!verifyPasswordHash_(data[i][5], oldPass)) {
          return { status: 'error', message: 'Kata sandi lama yang Anda masukkan salah.' };
        }
        
        // 4. Timpa dengan sandi baru berformat Hash Salted SHA-256 (One-Way)
        const hashedNewPass = hashPassword_(newPass);
        sheet.getRange(i + 1, 6).setNumberFormat('@').setValue(hashedNewPass);
        try {
          const cache = CacheService.getScriptCache();
          cache.remove("force_reset_" + cleanTargetNip);
          cache.remove("force_reset_" + nip);
        } catch(e) {}
        bumpDataVersion();
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Data pengguna tidak ditemukan di sistem.' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// ==========================================
// UNIVERSAL POST ENDPOINT (n8n / WA & HEADLESS API)
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'error', message: "Tidak ada data JSON yang diterima." });
    }
    
    var payload = JSON.parse(e.postData.contents);
    
    // JALUR 1: Jika request memuat atribut 'action' -> Alihkan ke Router API Frontend Baru
    if (payload && payload.action) {
      return handleApiPost_(payload, e);
    }
    
    // JALUR 2: Webhook Legacy n8n / Bot WA Surat Tugas (TETAP 100% AMAN & UTUH)
    return handleWebhookST_(payload);

  } catch (error) {
    return jsonResponse_({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Handler Webhook n8n / WA Surat Tugas (Preservasi Penuh)
 */
function handleWebhookST_(payload) {
  // 1. Validasi Keamanan (Secret Key dari ScriptProperties)
  const scriptProps = PropertiesService.getScriptProperties();
  let configuredKey = scriptProps.getProperty("TRANSKEP_WEBHOOK_KEY");
  if (!configuredKey) {
    configuredKey = "TRANSKEP_WA_BOT_2026";
    scriptProps.setProperty("TRANSKEP_WEBHOOK_KEY", configuredKey);
  }
  
  const incomingSecret = payload ? String(payload.secret_key || '').trim() : '';
  if (!incomingSecret || !constantTimeEquals_(incomingSecret, String(configuredKey).trim())) {
    throw new Error("Akses ditolak: Secret Key tidak valid.");
  }

  // 2. Masukkan ke database st_log
  const ss = getDB();
  const sheetST = ss.getSheetByName('st_log');
  if (!sheetST) throw new Error("Sheet st_log tidak ditemukan.");

  // Generate ID & Waktu
  const idST = "ST-WA-" + new Date().getTime() + Math.floor(Math.random() * 1000);
  const waktuDibuat = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
  
  // Format JSON peserta dan data ekstra dari payload n8n
  var pesertaJson = JSON.stringify(payload.peserta || []);
  var dataEkstraJson = JSON.stringify(payload.data_ekstra || {});

  // Pastikan urutan kolom sesuai dengan setup sheet st_log (disanitasi dari formula injection)
  sheetST.appendRow(sanitizeRowArray([
    idST, 
    waktuDibuat, 
    payload.nomor_surat || '', 
    payload.menimbang || 'Bahwa untuk kepentingan dinas...', 
    payload.dasar || 'Berdasarkan surat undangan...',
    payload.tujuan || '', 
    payload.tempat || '', 
    payload.tgl_mulai || '', 
    payload.tgl_selesai || '', 
    payload.jam || '', 
    pesertaJson, 
    payload.pejabat_ttd || '', // NIP Pimpinan (Ketua/Wakil)
    'DISETUJUI', 
    dataEkstraJson 
  ]));
  
  bumpDataVersion();

  return jsonResponse_({
    status: "success",
    message: "Surat Tugas " + idST + " berhasil diterbitkan via WhatsApp.",
    id_st: idST
  });
}