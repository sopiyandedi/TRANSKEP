const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

const files = [
  'code.js',
  'api_router.js',
  'pegawai/manajemen_pegawai.js',
  'permohonan/st/st.js',
  'permohonan/persetujuan.js',
  'eoffice/kgb_pdf_compiler.js',
  'eoffice/kgb.js',
  'eoffice/undangan_pdf_compiler.js',
  'eoffice/rapat.js'
];

// 1. Parse / Syntax check all modified GAS files
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  new vm.Script(src, { filename: f });
}
console.log('[PASS] Syntax check passed for all 9 modified GAS files.');

// 2. Check git working tree integrity & scan for anti-patterns
const codeSrc = fs.readFileSync('code.js', 'utf8');
const routerSrc = fs.readFileSync('api_router.js', 'utf8');
const stSrc = fs.readFileSync('permohonan/st/st.js', 'utf8');
const persetujuanSrc = fs.readFileSync('permohonan/persetujuan.js', 'utf8');

assert(!/if\s*\(\s*payload\.secret_key\s*&&/.test(stSrc), 'st.js still has payload.secret_key && bypass');
assert(!/if\s*\(\s*payload\.secret_key\s*&&/.test(persetujuanSrc), 'persetujuan.js still has payload.secret_key && bypass');
assert(!/FORBIDDEN_METHODS/.test(routerSrc), 'api_router.js still uses denylist FORBIDDEN_METHODS');
assert(routerSrc.includes('AUTHENTICATED_RPC_METHODS_') && routerSrc.includes('PUBLIC_RPC_METHODS_'), 'api_router.js missing allowlists');
assert(!/\btemp_pass\b/.test(codeSrc), 'code.js still leaks temp_pass');
assert(!/28800\s*\)/.test(codeSrc), 'code.js still passes 28800 TTL to CacheService.put');
assert(!/86400\s*\)/.test(codeSrc), 'code.js still passes 86400 TTL to CacheService.put');
console.log('[PASS] Static security assertion checks passed.');

// 3. Mock GAS Runtime Sandbox & Functional Security Suite
const propsStore = {};
let cacheStore = {};
const sentWaCalls = [];
const recordedFetchCalls = [];
let mockFetchResponder = null;

// Prebuild mocked user_data rows after we bootstrap encryptField_
function createMockSheet(name, rows) {
  return {
    _name: name,
    _rows: rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getDataRange: () => ({
      getDisplayValues: () => rows.map(r => r.map(c => c === undefined || c === null ? '' : String(c))),
      getValues: () => rows.map(r => r.slice())
    }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setNumberFormat: () => ({
        setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
        setValues: (vals) => {
          for (let ri = 0; ri < vals.length; ri++) {
            while (rows.length < r + ri) rows.push([]);
            for (let ci = 0; ci < vals[ri].length; ci++) {
              rows[r - 1 + ri][c - 1 + ci] = vals[ri][ci];
            }
          }
        }
      }),
      setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
      setValues: (vals) => {
        for (let ri = 0; ri < vals.length; ri++) {
          while (rows.length < r + ri) rows.push([]);
          for (let ci = 0; ci < vals[ri].length; ci++) {
            rows[r - 1 + ri][c - 1 + ci] = vals[ri][ci];
          }
        }
      },
      getValue: () => (rows[r - 1] ? rows[r - 1][c - 1] : '')
    }),
    appendRow: (row) => { rows.push(row.slice()); },
    deleteRow: (r) => { rows.splice(r - 1, 1); }
  };
}

const userRows = [
  ['NIP', 'Nama', 'Jabatan', 'Role', 'No_HP', 'Password', 'S_2024', 'S_2025', 'S_2026', 'Sakit', 'Penting', 'Besar', 'Melahirkan', 'CLTN', 'Pangkat', 'Alamat', 'TMT_KGB', 'TMT_KNP', 'BUP', 'Status_KGB', 'Tgl_KGB', 'Status_KNP', 'Tgl_KNP', 'Status_Pensiun', 'Tgl_Pensiun', 'Jenis_Jabatan'],
  ['198001012005011001', 'Admin Test', 'Kasubbag', 'Admin', '081234567890', 'adminPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata (III/c)', 'Jl. Merdeka 1', '2026-01-01', '', 58, '', '', '', '', '', '', 'Struktural'],
  ['199002022015012002', 'Pegawai Biasa', 'Staf', 'Pegawai', '081298765432', 'pegawaiPass123', 4, 6, 12, 12, 5, 0, 0, 0, 'Penata Muda (III/a)', 'Jl. Sudirman 2', '', '', 58, '', '', '', '', '', '', 'Fungsional Umum'],
  ['199103032016011003', 'Operator Test', 'Pranata', 'Operator', '081311112222', 'operatorPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata Muda Tk I (III/b)', 'Jl. Kartini 3', '', '', 58, '', '', '', '', '', '', 'Fungsional']
];

const stRows = [
  ['id', 'waktu', 'nomor', 'menimbang', 'dasar', 'tujuan', 'tempat', 'tgl_mulai', 'tgl_selesai', 'jam', 'peserta', 'pejabat_ttd', 'status', 'data_ekstra'],
  ['ST-1', '2026-11-01', '', 'm', 'd', 't', 'p', '2026-11-02', '2026-11-02', '08:00', '[]', '', 'PROSES', '{}']
];

const cutiRows = [
  ['id', 'waktu', 'nip', 'jenis', 'tgl_mulai', 'tgl_selesai', 'alasan', 'status', 'durasi', 'atasan_nip', 'pejabat_nip', 'catatan_atasan', 'catatan_pejabat', 'history', 'bukti_url', 'alamat', 'plh_nip', 'token', 'tgl_ttd', 'nomor_surat'],
  ['CUTI-1', '2026-11-01', '199002022015012002', 'Tahunan', '2026-11-10', '2026-11-11', 'Urusan keluarga', 'DISETUJUI', 2, '', '', '', '', '{}', '', 'Jl. Sudirman 2', '', 'magic-tok', '', '']
];

const mockSheets = {
  user_data: createMockSheet('user_data', userRows),
  st_log: createMockSheet('st_log', stRows),
  cuti_log: createMockSheet('cuti_log', cutiRows)
};

const mockSS = {
  getSheetByName: (n) => mockSheets[n] || null,
  insertSheet: (n) => { mockSheets[n] = createMockSheet(n, []); return mockSheets[n]; }
};

function toSignedBytes(buf) {
  return Array.from(buf, b => (b > 127 ? b - 256 : b));
}
function fromSignedBytes(arr) {
  return Buffer.from(arr.map(b => (b < 0 ? b + 256 : b)));
}

const sandbox = {
  console,
  Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent,
  Logger: { log: () => { } },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSS,
    openById: () => mockSS,
    flush: () => { }
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(propsStore, k) ? propsStore[k] : null),
      setProperty: (k, v) => { propsStore[k] = String(v); },
      getProperties: () => ({ ...propsStore })
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null),
      put: (k, v, ttl) => {
        if (ttl > 21600) throw new Error('Argument too large: expirationInSeconds (' + ttl + ' > 21600)');
        cacheStore[k] = String(v);
      },
      remove: (k) => { delete cacheStore[k]; }
    })
  },
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, waitLock: () => { }, releaseLock: () => { } })
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt, _raw: txt }) })
  },
  HtmlService: {
    createHtmlOutput: (html) => ({
      getAs: () => {
        const blob = {
          getBytes: () => toSignedBytes(Buffer.from('%PDF-1.4\n' + String(html), 'utf8')),
          setName: () => blob
        };
        return blob;
      }
    })
  },
  UrlFetchApp: {
    fetch: (url, opts) => {
      recordedFetchCalls.push({ url: String(url), opts: opts || {} });
      if (typeof mockFetchResponder === 'function') {
        return mockFetchResponder(String(url), opts || {});
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true })
      };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    formatDate: (d) => d.toISOString(),
    computeDigest: (_alg, val) => toSignedBytes(crypto.createHash('sha256').update(String(val), 'utf8').digest()),
    computeHmacSha256Signature: (val, key) => toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(val), 'utf8').digest()),
    computeRsaSha256Signature: (val, privateKeyPem) => {
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(String(val), 'utf8');
      signer.end();
      return toSignedBytes(signer.sign(String(privateKeyPem)));
    },
    base64Encode: (input) => {
      const buf = Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8');
      return buf.toString('base64');
    },
    base64EncodeWebSafe: (input) => {
      const buf = Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8');
      return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64DecodeWebSafe: (b64) => {
      const std = String(b64).replace(/-/g, '+').replace(/_/g, '/');
      return toSignedBytes(Buffer.from(std, 'base64'));
    },
    newBlob: (data) => ({
      getBytes: () => (Array.isArray(data) ? data : toSignedBytes(Buffer.from(String(data), 'utf8'))),
      getDataAsString: () => (Array.isArray(data) ? fromSignedBytes(data).toString('utf8') : String(data))
    })
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of files) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}

// Stub external PDF/WAHA helpers used post-validation
sandbox.sendWhatsAppMessage_ = (phone, text) => { sentWaCalls.push({ phone, text }); return { status: 'success' }; };

// --- Run Functional & Security Assertions ---

// A. Session Bypass Prevention
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', ''), false, 'Blank token must fail');
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', 'any-random-token-123'), false, 'Forged random token must fail');
assert.strictEqual(sandbox.cekOtorisasiAdmin('198001012005011001', 'forged'), false, 'Forged admin token must fail');
assert.strictEqual(sandbox.cekOtorisasiAdminOrOperator('198001012005011001', null), false, 'Null token must fail');

// Forged v2 token signed with wrong secret
const fakePayloadB64 = Buffer.from(JSON.stringify({ n: '198001012005011001', r: 'Admin', exp: Math.floor(Date.now() / 1000) + 3600, jti: '1234' })).toString('base64url');
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', 'v2.' + fakePayloadB64 + '.deadbeef'), false, 'Invalid HMAC sig must fail');

// B. Valid Login + Auto-Upgrade Plaintext -> SHA256$ + ENC$ -> SHA256$
const admLogin = sandbox.verifyLogin('198001012005011001', 'adminPass123');
assert.strictEqual(admLogin.status, 'success', 'Admin login should succeed');
assert(admLogin.token.startsWith('v2.'), 'Token must be signed v2 token');
assert(String(userRows[1][5]).startsWith('SHA256$'), 'Plaintext password must auto-upgrade to SHA256$ in sheet');

// Also verify legacy ENC$ password still works and upgrades to SHA256$
const encLegacy = sandbox.encryptField_('legacyPass99');
userRows.push(['199505052020011005', 'Legacy ENC', 'Staf', 'Pegawai', sandbox.encryptField_('081555556666'), encLegacy, 6, 6, 12, 12, 5, 0, 0, 0, 'II/c', sandbox.encryptField_('Alamat'), '', '', 58, '', '', '', '', '', '', 'Fungsional Umum']);
const legacyLogin = sandbox.verifyLogin('199505052020011005', 'legacyPass99');
assert.strictEqual(legacyLogin.status, 'success', 'Legacy ENC$ password must still log in smoothly');
assert(String(userRows[4][5]).startsWith('SHA256$'), 'Legacy ENC$ password must auto-upgrade to SHA256$');

const pegLogin = sandbox.verifyLogin('199002022015012002', 'pegawaiPass123');
assert.strictEqual(pegLogin.status, 'success', 'Pegawai login should succeed');

// Wrong password rejected
assert.strictEqual(sandbox.verifyLogin('198001012005011001', 'wrongPass').status, 'error');

// C. Token Authorization & RBAC & Cache Eviction Resilience
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', admLogin.token), true);
assert.strictEqual(sandbox.cekOtorisasiAdmin('198001012005011001', admLogin.token), true);
assert.strictEqual(sandbox.cekOtorisasiAdminOrOperator('198001012005011001', admLogin.token), true);

// Cross-user token replay blocked
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', pegLogin.token), false, 'Pegawai token cannot impersonate Admin NIP');
assert.strictEqual(sandbox.cekOtorisasiAdmin('199002022015012002', pegLogin.token), false, 'Pegawai cannot pass cekOtorisasiAdmin');
assert.strictEqual(sandbox.cekOtorisasiAdminOrOperator('199002022015012002', pegLogin.token), false, 'Pegawai cannot pass cekOtorisasiAdminOrOperator');

// Cache eviction resilience (clear CacheService completely -> valid signed token MUST still work!)
cacheStore = {};
assert.strictEqual(sandbox.cekOtorisasi('198001012005011001', admLogin.token), true, 'Valid signed token must survive CacheService eviction');
assert.strictEqual(sandbox.cekOtorisasiAdmin('198001012005011001', admLogin.token), true, 'Valid admin signed token must survive eviction');

// Logout revocation persists EVEN across CacheService eviction
sandbox.logoutSession('199002022015012002', pegLogin.token);
assert.strictEqual(sandbox.cekOtorisasi('199002022015012002', pegLogin.token), false, 'Logged-out token must be rejected immediately');
cacheStore = {};
assert.strictEqual(sandbox.cekOtorisasi('199002022015012002', pegLogin.token), false, 'Logged-out token must stay rejected after cache eviction');

// D. getBulkData Password & temp_pass Zero-Leakage Check
const pegLogin2 = sandbox.verifyLogin('199002022015012002', 'pegawaiPass123');
const adminBulk = sandbox.getBulkData('198001012005011001', admLogin.token, '');
assert.strictEqual(adminBulk.status, 'UPDATED');
assert(!('temp_pass' in adminBulk.data), 'getBulkData.data must not contain temp_pass key');
assert(adminBulk.data.usersList.every(u => u.pass === '[Telah Dienkripsi]'), 'Admin getBulkData must only show [Telah Dienkripsi], never plaintext or hash');
assert(!JSON.stringify(adminBulk).includes('SHA256$') && !JSON.stringify(adminBulk).includes('adminPass123'), 'No hash or plaintext password in Admin bulk payload');

const pegBulk = sandbox.getBulkData('199002022015012002', pegLogin2.token, '');
assert.strictEqual(pegBulk.status, 'UPDATED');
assert(pegBulk.data.usersList.find(u => u.nip === '198001012005011001').pass === '', 'Non-admin must get empty pass for other users');
assert(pegBulk.data.usersList.find(u => u.nip === '199002022015012002').pass === '[Telah Dienkripsi]', 'Self pass must be masked');

// E. Change Password & Request Reset stay SHA256$ (one-way)
const chFail = sandbox.changeMyPassword('199002022015012002', 'pegawaiPass123', 'abc', pegLogin2.token);
assert.strictEqual(chFail.status, 'error', 'Password < 5 chars must fail');
const chOk = sandbox.changeMyPassword('199002022015012002', 'pegawaiPass123', 'newPegawai2026!', pegLogin2.token);
assert.strictEqual(chOk.status, 'success', 'Valid changeMyPassword should succeed');
assert(String(userRows[2][5]).startsWith('SHA256$'), 'changeMyPassword must store SHA256$ hash');
assert.strictEqual(sandbox.verifyLogin('199002022015012002', 'newPegawai2026!').status, 'success');
assert(chOk.token && chOk.token !== pegLogin2.token, 'changeMyPassword must return rotated session token');
assert.strictEqual(sandbox.cekOtorisasi('199002022015012002', pegLogin2.token), false, 'Old token must be revoked after changeMyPassword');
pegLogin2.token = chOk.token;

// Request password reset queues pending SHA256$ token & no temp_pass leak in getBulkData
const rstRes = sandbox.requestPasswordReset('081311112222');
assert.strictEqual(rstRes.status, 'success');
assert(String(userRows[3][5]).startsWith('SHA256$'), 'user_data col 6 must stay SHA256$ hashed');
assert(sentWaCalls.some(w => /^TR-[A-Z0-9]{8}$/.test((w.text.match(/TR-[A-Z0-9]{6,12}/) || [])[0] || '')), 'WAHA should receive OTP');
const opOtp = sentWaCalls.find(w => /TR-[A-Z0-9]{6,12}/.test(w.text)).text.match(/TR-[A-Z0-9]{6,12}/)[0];
const opLoginOtp = sandbox.verifyLogin('199103032016011003', opOtp);
assert.strictEqual(opLoginOtp.status, 'success', 'OTP login should succeed');
assert.strictEqual(opLoginOtp.must_change_password, true, 'OTP login must flag must_change_password');
const opBulk = sandbox.getBulkData('199103032016011003', opLoginOtp.token, '');
assert.strictEqual(opBulk.data.must_change_password, true);
assert(!('temp_pass' in opBulk.data), 'getBulkData must never leak temp_pass after reset');

// F. Admin updateUser & importBulkUsers preserve password on [Telah Dienkripsi]
const updRes = sandbox.updateUser({
  nip: '199002022015012002', originalNip: '199002022015012002',
  nama: 'Pegawai Edited', jabatan: 'Staf Senior', role: 'Pegawai', no_hp: '081298765432',
  pass: '[Telah Dienkripsi]', alamat: 'Jl. Baru',
  s_tahunan_2024: 4, s_tahunan_2025: 6, s_tahunan_2026: 12,
  s_sakit: 12, s_penting: 5, s_besar: 0, s_melahirkan: 0, s_cltn: 0,
  pangkat: 'III/a', tmt_kgb: '', tmt_knp: '', bup: 58, jenis_jabatan: 'Fungsional Umum'
}, '198001012005011001', admLogin.token);
assert.strictEqual(updRes.status, 'success');
assert.strictEqual(sandbox.verifyLogin('199002022015012002', 'newPegawai2026!').status, 'success', 'Password preserved after updateUser with [Telah Dienkripsi]');

const impRes = sandbox.importBulkUsers([{
  NIP: '199002022015012002', Nama: 'Pegawai Imported', Jabatan: 'Staf', Role: 'Pegawai',
  No_HP: '081298765432', Password: '[Telah Dienkripsi]', Alamat: 'Jl. Import',
  Sisa_Tahunan_2024: 4, Sisa_Tahunan_2025: 6, Sisa_Tahunan_2026: 12,
  Sisa_Sakit: 12, Sisa_Penting: 5, Sisa_Besar: 0, Sisa_Melahirkan: 0, Sisa_CLTN: 0,
  Pangkat: 'III/a', TMT_KGB: '', TMT_KNP: '', BUP: 58, Jenis_Jabatan: 'Fungsional Umum'
}], '198001012005011001', admLogin.token);
assert.strictEqual(impRes.status, 'success');
assert.strictEqual(sandbox.verifyLogin('199002022015012002', 'newPegawai2026!').status, 'success', 'Password preserved after importBulkUsers with [Telah Dienkripsi]');

// G. API Router Allowlist, ping & testWaha Gates
const parseResp = (r) => JSON.parse(r._raw);
const pingGet = parseResp(sandbox.handleApiGet_({ parameter: { action: 'ping' } }));
assert.strictEqual(pingGet.status, 'success');
assert(!('piiVault' in pingGet), 'Public ping must not expose piiVault stats');

const wahaAnon = parseResp(sandbox.handleApiPost_({ action: 'testWaha', phone: '628111' }));
assert.strictEqual(wahaAnon.status, 'error', 'Anonymous testWaha must be blocked');
const wahaPeg = parseResp(sandbox.handleApiPost_({ action: 'testWaha', nip: '199002022015012002', token: pegLogin2.token, phone: '628111' }));
assert.strictEqual(wahaPeg.status, 'error', 'Pegawai testWaha must be blocked');
const wahaAdm = parseResp(sandbox.handleApiPost_({ action: 'testWaha', nip: '198001012005011001', token: admLogin.token, phone: '628111' }));
assert.strictEqual(wahaAdm.status, 'success', 'Admin testWaha with phone should succeed');

// Blocked internal/dangerous RPC methods
for (const blocked of ['initDashboardDB', 'mintaIzinUrlFetch', 'testKoneksiWAHA', 'initResetPasswordSheet', 'getDB', 'setupSheetST', 'preparePKPDatabase', 'getSuratTugasData', 'saveDokumenPKPBaru', 'autoTrashJobdesPdfs', 'constructor', 'handleWebhookST_']) {
  const res = parseResp(sandbox.handleApiPost_({ action: 'call', method: blocked, args: [], nip: '198001012005011001', token: admLogin.token }));
  assert.strictEqual(res.status, 'error', 'RPC allowlist MUST block ' + blocked);
}

// Unauthenticated RPC to previously open read endpoints MUST be blocked
for (const prot of ['getIzinKeluarById', 'getIzinPribadiById', 'getRencanaWFHById', 'getSettingsST', 'getBulkData']) {
  const res = parseResp(sandbox.handleApiPost_({ action: 'call', method: prot, args: ['1'] }));
  assert.strictEqual(res.status, 'error', 'Protected RPC ' + prot + ' must reject missing auth');
}
// Authenticated call to getSettingsST succeeds
sandbox.getSettingsST = () => ({ status: 'success', data: { ppk: 'OK' } });
const settingsAuth = parseResp(sandbox.handleApiPost_({ action: 'call', method: 'getSettingsST', args: [], nip: '199002022015012002', token: pegLogin2.token }));
assert.strictEqual(settingsAuth.status, 'success', 'Authenticated RPC call to getSettingsST must succeed');

// H. Webhook Secret Key Enforcement (missing / empty / wrong rejected)
for (const badPayload of [
  { id_st: 'ST-1', nomor_st: '999/ST' },
  { id_st: 'ST-1', nomor_st: '999/ST', secret_key: '' },
  { id_st: 'ST-1', nomor_st: '999/ST', secret_key: 'WRONG' }
]) {
  assert.strictEqual(sandbox.updateNomorSuratTugasFromExternal_(badPayload).status, 'error', 'ST webhook must reject invalid/missing secret_key');
}
for (const badCuti of [
  { id: 'CUTI-1', nomor_surat: '999/C' },
  { id: 'CUTI-1', nomor_surat: '999/C', secret_key: '' },
  { id: 'CUTI-1', nomor_surat: '999/C', secret_key: 'WRONG' }
]) {
  assert.strictEqual(sandbox.updateNomorSuratCutiFromExternal_(badCuti).status, 'error', 'Cuti webhook must reject invalid/missing secret_key');
}
let webhookThrew = false;
try { sandbox.handleWebhookST_({ tujuan: 'x' }); } catch (e) { webhookThrew = true; }
assert(webhookThrew, 'handleWebhookST_ must reject missing secret_key');

for (const badKgbCb of [
  { id_kgb: 'KGB-1', nomor_surat: '777/KPA.W10-A2/KP2.1.2/XI/2026' },
  { id_kgb: 'KGB-1', nomor_surat: '777/KPA.W10-A2/KP2.1.2/XI/2026', secret_key: '' },
  { id_kgb: 'KGB-1', nomor_surat: '777/KPA.W10-A2/KP2.1.2/XI/2026', secret_key: 'WRONG' }
]) {
  assert.strictEqual(sandbox.updateNomorSuratKgbFromExternal_(badKgbCb).status, 'error', 'KGB webhook must reject invalid/missing secret_key');
}

// I. KGB MYSIMS Request RPC, Anti-Double Trigger, OAuth2 Bearer Firestore Sync & ST Bearer Sync
propsStore.TRANSKEP_WEBHOOK_KEY = 'TEST_HOOK_KEY_127';
const { privateKey: saPrivKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
propsStore.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: 'transkep-314c0',
  client_email: 'firebase-adminsdk-test@transkep-314c0.iam.gserviceaccount.com',
  private_key: saPrivKey
});

recordedFetchCalls.length = 0;
mockFetchResponder = (url, opts) => {
  if (url.includes('oauth2.googleapis.com/token')) {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'mock-sa-bearer-tok', expires_in: 3600 }) };
  }
  if (url.includes('firestore.googleapis.com') && (!opts.method || String(opts.method).toUpperCase() === 'GET')) {
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        fields: {
          id_kgb: { stringValue: 'KGB-19750706-2026' },
          nip: { stringValue: '197507062014051001' },
          nama_pegawai: { stringValue: 'Ade Badrujaman, S.H.I.' },
          pangkat: { stringValue: 'Penata Tingkat I (III/d)' },
          jabatan: { stringValue: 'Panitera Pengganti' }
        }
      })
    };
  }
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: url, fields: {} }) };
};

// Pegawai role blocked from calling requestKgbSuratKeluar
const kgbPegDeny = parseResp(sandbox.handleApiPost_({
  action: 'call',
  method: 'requestKgbSuratKeluar',
  args: [{ id_kgb: 'KGB-19750706-2026', nip: '197507062014051001' }, '199002022015012002', pegLogin2.token],
  nip: '199002022015012002',
  token: pegLogin2.token
}));
assert.strictEqual(kgbPegDeny.status, 'error', 'Pegawai must not be allowed to invoke requestKgbSuratKeluar');

// Admin 1st call succeeds & sends single Ketua KP2.1.2 task
const kgbAdminOk = parseResp(sandbox.handleApiPost_({
  action: 'call',
  method: 'requestKgbSuratKeluar',
  args: [{
    id_kgb: 'KGB-19750706-2026',
    nip: '197507062014051001',
    nama_pegawai: 'Ade Badrujaman, S.H.I.',
    pangkat: 'Penata Tingkat I (III/d)',
    tanggal_surat: '16 November 2026',
    mysims_requested: false
  }, '198001012005011001', admLogin.token],
  nip: '198001012005011001',
  token: admLogin.token
}));
assert.strictEqual(kgbAdminOk.status, 'success', 'Admin 1st requestKgbSuratKeluar call must succeed: ' + (kgbAdminOk && kgbAdminOk.message));

const n8nKgbCall = recordedFetchCalls.find(c => c.url.includes('webhook'));
assert(n8nKgbCall, '1st requestKgbSuratKeluar call must trigger n8n webhook');
const n8nKgbBody = JSON.parse(n8nKgbCall.opts.payload);
assert.strictEqual(n8nKgbBody.event, 'KGB_SURAT_KELUAR');
assert.strictEqual(n8nKgbBody.task.jabatan_penandatangan, 'Ketua');
assert.strictEqual(n8nKgbBody.task.satker_kode, 'KPA.W10-A2');
assert.strictEqual(n8nKgbBody.task.kode_klasifikasi, 'KP2.1.2');
assert.strictEqual(n8nKgbBody.task.sifat, 'Biasa');
assert.strictEqual(n8nKgbBody.task.ket, 'Biasa');

// Immediate 2nd call blocked by CacheService guard (no second webhook request!)
const webhookCountBefore = recordedFetchCalls.filter(c => c.url.includes('webhook')).length;
const kgbSecondCall = parseResp(sandbox.handleApiPost_({
  action: 'call',
  method: 'requestKgbSuratKeluar',
  args: [{ id_kgb: 'KGB-19750706-2026', nip: '197507062014051001' }, '198001012005011001', admLogin.token],
  nip: '198001012005011001',
  token: admLogin.token
}));
assert.strictEqual(kgbSecondCall.status, 'already_exists', '2nd requestKgbSuratKeluar call must return already_exists');
assert.strictEqual(recordedFetchCalls.filter(c => c.url.includes('webhook')).length, webhookCountBefore, '2nd requestKgbSuratKeluar must not call n8n again');

// Integrated Frontend -> Backend Flow (EofficeDataService.saveOrGenerateKgb -> handleApiPost_ -> triggerN8nSuratKeluarKgb_)
const fakeFsKgbStore = {};
const fakeFsRapatStore = {};
mockFetchResponder = (url, opts) => {
  if (url.includes('oauth2.googleapis.com/token')) {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'mock-sa-bearer-tok', expires_in: 3600 }) };
  }
  if ((url.includes('/eoffice_kgb/') || url.includes('/eoffice_rapat/')) && (!opts.method || String(opts.method).toUpperCase() === 'GET')) {
    const colSeg = url.includes('/eoffice_kgb/') ? '/eoffice_kgb/' : '/eoffice_rapat/';
    const idPart = decodeURIComponent(url.split(colSeg)[1].split('?')[0]);
    const rec = url.includes('/eoffice_kgb/') ? fakeFsKgbStore[idPart] : fakeFsRapatStore[idPart];
    if (!rec) return { getResponseCode: () => 404, getContentText: () => '{}' };
    const fields = {};
    Object.keys(rec).forEach(k => {
      if (typeof rec[k] === 'boolean') fields[k] = { booleanValue: rec[k] };
      else if (rec[k] !== undefined && rec[k] !== null) fields[k] = { stringValue: String(rec[k]) };
    });
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ fields }) };
  }
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: url, fields: {} }) };
};

const feSandbox = {
  console,
  localStorage: { getItem: () => '', setItem: () => { } },
  TranskepFirebase: {
    isReady: () => true,
    saveKgbToFirestore: async (doc) => { fakeFsKgbStore[doc.id_kgb] = Object.assign({}, doc); return doc; },
    deleteKgbFromFirestore: async (id) => { delete fakeFsKgbStore[id]; return true; },
    saveRapatToFirestore: async (doc) => { fakeFsRapatStore[doc.id_rapat] = Object.assign({}, doc); return { status: 'success', data: doc }; },
    deleteRapatFromFirestore: async (id) => { delete fakeFsRapatStore[id]; return true; }
  },
  TranskepAPI: {
    call: async (method, ...args) => parseResp(sandbox.handleApiPost_({
      action: 'call',
      method,
      args,
      nip: '198001012005011001',
      token: admLogin.token
    }))
  }
};
feSandbox.window = feSandbox;
vm.createContext(feSandbox);
vm.runInContext(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8'), feSandbox, { filename: 'modules/eoffice/eoffice_data.js' });

const webhookBeforeE2e = recordedFetchCalls.filter(c => c.url.includes('webhook')).length;
const e2eSave1 = feSandbox.EofficeDataService.saveOrGenerateKgb({
  id_kgb: 'DRAFT-198306072011011009',
  nip: '198306072011011009',
  nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
  tmt_baru: '1 Januari 2027',
  nokgb: '',
  nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
  mysims_requested: false
}, 'draft', '198001012005011001', admLogin.token);

// Resolve synchronous Promise via microtask flush + validate stuck Dr. Tohayudin recovery & 2nd edit block
(async () => {
  const res1 = await e2eSave1;
  assert.strictEqual(res1.status, 'success');
  assert.strictEqual(res1.mysims_res.status, 'success', 'Integrated 1st save MUST reach GAS triggerN8nSuratKeluarKgb_ (never self-block as already_exists): ' + (res1.mysims_res && res1.mysims_res.message));
  assert.strictEqual(recordedFetchCalls.filter(c => c.url.includes('webhook')).length, webhookBeforeE2e + 1, 'Integrated 1st save must invoke n8n webhook exactly once');
  assert.strictEqual(fakeFsKgbStore[res1.id_kgb].mysims_status, 'Permintaan Terkirim ke MYSIMS');

  // Edit ke-2 (status sudah 'Permintaan Terkirim ke MYSIMS') -> TIDAK boleh panggil n8n lagi
  const res2 = await feSandbox.EofficeDataService.saveOrGenerateKgb({
    ...res1.data,
    gaji_baru: '4.100.000'
  }, 'draft', '198001012005011001', admLogin.token);
  assert.strictEqual(res2.mysims_requested_now, false);
  assert.strictEqual(recordedFetchCalls.filter(c => c.url.includes('webhook')).length, webhookBeforeE2e + 1, 'Integrated 2nd edit must NOT re-trigger n8n webhook');

  // Pemulihan berkas nyangkut dari v3.8.61 (mysims_requested: true + status 'Meminta Nomor MYSIMS' + nokgb '')
  const resStuck = await feSandbox.EofficeDataService.saveOrGenerateKgb({
    id_kgb: 'KGB-STUCK-19830607-202701',
    nip: '198306072011011009',
    nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
    tmt_baru: '1 Januari 2027',
    nokgb: '',
    nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
    mysims_requested: true,
    mysims_status: 'Meminta Nomor MYSIMS'
  }, 'draft', '198001012005011001', admLogin.token);
  assert.strictEqual(resStuck.mysims_res.status, 'success', 'Stuck Meminta Nomor MYSIMS record without number must recover and trigger n8n');
  assert.strictEqual(recordedFetchCalls.filter(c => c.url.includes('webhook')).length, webhookBeforeE2e + 2, 'Recovery save must invoke n8n webhook once');

  // Reset mockFetchResponder back for remaining tests (Restore default mock with fields)
  mockFetchResponder = (url, opts) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'mock-sa-bearer-tok', expires_in: 3600 }) };
    }
    if (url.includes('firestore.googleapis.com') && (!opts.method || String(opts.method).toUpperCase() === 'GET')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          fields: {
            id_kgb: { stringValue: 'KGB-19750706-2026' },
            nip: { stringValue: '197507062014051001' },
            nama_pegawai: { stringValue: 'Ade Badrujaman, S.H.I.' },
            pangkat: { stringValue: 'Penata Tingkat I (III/d)' },
            jabatan: { stringValue: 'Panitera Pengganti' }
          }
        })
      };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: url, fields: {} }) };
  };

  // Uji 2-Stage Resilient Fallback PDF Compiler ketika tag <img> eksternal gagal di HtmlService
  const origCreateHtml = sandbox.HtmlService.createHtmlOutput;
  sandbox.HtmlService.createHtmlOutput = (html) => {
    if (String(html).includes('<img')) throw new Error('Simulated external logo fetch timeout');
    return origCreateHtml(html);
  };
  const fallbackPdf = sandbox.generateKgbPdfBase64_({
    nip: '198306072011011009',
    nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
    pangkat: 'Penata Tingkat I (III/d)'
  }, '1097/KPA.W10-A2/KP2.1.2/XI/2026');
  sandbox.HtmlService.createHtmlOutput = origCreateHtml;
  assert(fallbackPdf && fallbackPdf.pdf_base64.length > 100, '2-Stage PDF fallback must produce valid Base64 PDF even when external <img> fails');

  // Callback with valid secret_key updates Firestore with OAuth2 Bearer & compiles KGB PDF
  const kgbCbOk = parseResp(sandbox.handleApiPost_({
    action: 'updateNomorSuratKgb',
    id_kgb: 'KGB-19750706-2026',
    nomor_surat: '777/KPA.W10-A2/KP2.1.2/XI/2026',
    idp: '1088',
    secret_key: 'TEST_HOOK_KEY_127'
  }));
  assert.strictEqual(kgbCbOk.status, 'success', 'Valid KGB callback must succeed');
  assert.strictEqual(kgbCbOk.nokgb, '777');
  assert.strictEqual(kgbCbOk.firestore_synced, true);
  assert(kgbCbOk.pdf_kgb && kgbCbOk.pdf_kgb.pdf_base64.length > 100, 'KGB callback must return Base64 PDF');
  const decodedKgbPdfHtml = Buffer.from(kgbCbOk.pdf_kgb.pdf_base64, 'base64').toString('utf8');
  assert(decodedKgbPdfHtml.includes('777/KPA.W10-A2/KP2.1.2/XI/2026'), 'Compiled KGB PDF must embed official MYSIMS number');
  assert(decodedKgbPdfHtml.includes('06-07-1975'), 'Compiled KGB PDF must derive DD-MM-YYYY birthdate from NIP');
  assert(decodedKgbPdfHtml.includes('Penata Tk. I'), 'Compiled KGB PDF must abbreviate Tingkat I -> Tk. I');

  const kgbPatchCall = recordedFetchCalls.find(c => c.url.includes('/eoffice_kgb/KGB-19750706-2026') && String(c.opts.method || '').toLowerCase() === 'patch');
  assert(kgbPatchCall && kgbPatchCall.opts.headers && kgbPatchCall.opts.headers.Authorization === 'Bearer mock-sa-bearer-tok',
    'KGB Firestore REST PATCH must carry OAuth2 Service Account Bearer token');

  // Approved Cross-Module Bearer Check: syncFirestoreSuratTugasNumbers_ in permohonan/st/st.js
  sandbox.syncFirestoreSuratTugasNumbers_('ST-1', '111/ST.HM3.1.1/XI/2026', '', '', []);
  const stPatchCall = recordedFetchCalls.find(c => c.url.includes('/surat_tugas_documents/ST-1') && String(c.opts.method || '').toLowerCase() === 'patch');
  assert(stPatchCall && stPatchCall.opts.headers && stPatchCall.opts.headers.Authorization === 'Bearer mock-sa-bearer-tok',
    'ST Firestore REST PATCH must carry OAuth2 Service Account Bearer token');

  // Tahap 129: Dual-Auth Firestore REST Fallback (403 SA -> Firebase Admin ID Token), parseNomorKgbBackend_ placeholder cleanup & getKgbMysimsStatus Cache/Firestore RPC
  assert.strictEqual(
    sandbox.parseNomorKgbBackend_({ nokgb: '......', nomor_surat: '1099/KPA.W10-A2/KP2.1.2/XI/2026' }).nokgb,
    '1099',
    'parseNomorKgbBackend_ must strip literal ...... placeholder in nokgb before reading nomor_surat'
  );

  sandbox.CacheService.getScriptCache().remove('transkep_fs_admin_id_token_v1');
  mockFetchResponder = (url, opts) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'mock-sa-no-iam', expires_in: 3600 }) };
    }
    if (url.includes('identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ idToken: 'mock-admin-id-tok', expiresIn: '3600' }) };
    }
    if (url.includes('firestore.googleapis.com')) {
      const authHdr = (opts && opts.headers && opts.headers.Authorization) || '';
      if (authHdr !== 'Bearer mock-admin-id-tok') {
        return { getResponseCode: () => 403, getContentText: () => JSON.stringify({ error: { code: 403, message: 'PERMISSION_DENIED' } }) };
      }
      if (!opts.method || String(opts.method).toUpperCase() === 'GET') {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ fields: { nokgb: { stringValue: '1099' }, nomor_surat: { stringValue: '1099/KPA.W10-A2/KP2.1.2/XI/2026' } } }) };
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: url, fields: {} }) };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
  };
  sandbox.CacheService.getScriptCache().remove('transkep_fs_sa_token_v1');

  const dualPatchRes = sandbox.firestoreRestPatch_('eoffice_kgb', 'KGB-DUAL-1', { nokgb: '1099', nomor_surat: '1099/KPA.W10-A2/KP2.1.2/XI/2026' });
  assert.strictEqual(dualPatchRes.ok, true, 'firestoreRestPatch_ must recover on 403 via Firebase Admin ID Token');
  assert.strictEqual(dualPatchRes.authMode, 'admin_id_token', 'Dual-Auth fallback must report admin_id_token');
  const dualGetDoc = sandbox.firestoreRestGet_('eoffice_kgb', 'KGB-DUAL-1');
  assert.strictEqual(dualGetDoc && dualGetDoc.nokgb, '1099', 'firestoreRestGet_ must also recover on 403 via Firebase Admin ID Token');

  // Pegawai role blocked from getKgbMysimsStatus
  const pegMysimsDeny = parseResp(sandbox.handleApiPost_({
    action: 'call',
    method: 'getKgbMysimsStatus',
    args: ['KGB-CACHE-ONLY-1', '198306072011011009', '199002022015012002', pegLogin2.token],
    nip: '199002022015012002',
    token: pegLogin2.token
  }));
  assert.strictEqual(pegMysimsDeny.status, 'error', 'Pegawai must be rejected by getKgbMysimsStatus');
  assert(String(pegMysimsDeny.message || '').includes('Hanya Admin/Operator'), 'Pegawai rejection must come from Admin RBAC guard');

  // Even if Firestore REST completely fails (403 everywhere), callback caches number & getKgbMysimsStatus serves it to Admin
  sandbox.CacheService.getScriptCache().remove('transkep_fs_admin_id_token_v1');
  mockFetchResponder = (url) => {
    if (url.includes('firestore.googleapis.com')) {
      return { getResponseCode: () => 403, getContentText: () => '{"error":"blocked"}' };
    }
    if (url.includes('identitytoolkit.googleapis.com')) {
      return { getResponseCode: () => 403, getContentText: () => '{"error":"blocked"}' };
    }
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };
  const cbCacheOnly = parseResp(sandbox.handleApiPost_({
    action: 'updateNomorSuratKgb',
    id_kgb: 'KGB-CACHE-ONLY-1',
    nip: '198306072011011009',
    nomor_surat: '1102/KPA.W10-A2/KP2.1.2/XI/2026',
    idp: '1205',
    secret_key: 'TEST_HOOK_KEY_127'
  }));
  assert.strictEqual(cbCacheOnly.status, 'success', 'KGB callback must still succeed & cache result even if Firestore REST fails');
  assert.strictEqual(cbCacheOnly.firestore_synced, false);

  const adminMysimsStatus = parseResp(sandbox.handleApiPost_({
    action: 'call',
    method: 'getKgbMysimsStatus',
    args: ['KGB-CACHE-ONLY-1', '198306072011011009', '198001012005011001', admLogin.token],
    nip: '198001012005011001',
    token: admLogin.token
  }));
  assert.strictEqual(adminMysimsStatus.status, 'success', 'Admin must fetch issued KGB number via getKgbMysimsStatus cache fallback');
  assert.strictEqual(adminMysimsStatus.source, 'cache');
  assert.strictEqual(adminMysimsStatus.data.nokgb, '1102');
  assert.strictEqual(adminMysimsStatus.data.nomor_surat, '1102/KPA.W10-A2/KP2.1.2/XI/2026');

  // =========================================================================
  // J. Tahap 141: Otomasi Nomor Surat Keluar & Suntik PDF Undangan Rapat MYSIMS
  // =========================================================================
  sandbox.CacheService.getScriptCache().remove('transkep_fs_sa_token_v1');
  sandbox.CacheService.getScriptCache().remove('transkep_fs_admin_id_token_v1');

  // 1. Tolak webhook tanpa secret_key valid
  for (const badRapatCb of [
    { id_rapat: 'RPT-141-1', nomor_surat: '1108/KPA.W10-A2/UND.HM3.1.1/XI/2026' },
    { id_rapat: 'RPT-141-1', nomor_surat: '1108/KPA.W10-A2/UND.HM3.1.1/XI/2026', secret_key: '' },
    { id_rapat: 'RPT-141-1', nomor_surat: '1108/KPA.W10-A2/UND.HM3.1.1/XI/2026', secret_key: 'WRONG' }
  ]) {
    assert.strictEqual(sandbox.updateNomorSuratRapatFromExternal_(badRapatCb).status, 'error', 'Rapat callback must reject invalid secret_key');
  }

  // 2. Blokir role Pegawai untuk requestRapatUndanganSuratKeluar & getRapatMysimsStatus
  const pegRapatDeny = parseResp(sandbox.handleApiPost_({
    action: 'call',
    method: 'requestRapatUndanganSuratKeluar',
    args: [{ id_rapat: 'RPT-141-1', agenda: 'Rapat' }, '199002022015012002', pegLogin2.token],
    nip: '199002022015012002',
    token: pegLogin2.token
  }));
  assert.strictEqual(pegRapatDeny.status, 'error', 'Pegawai must be blocked from requestRapatUndanganSuratKeluar');

  const pegRapatStatDeny = parseResp(sandbox.handleApiPost_({
    action: 'call',
    method: 'getRapatMysimsStatus',
    args: ['RPT-141-1', '199002022015012002', pegLogin2.token],
    nip: '199002022015012002',
    token: pegLogin2.token
  }));
  assert.strictEqual(pegRapatStatDeny.status, 'error', 'Pegawai must be blocked from getRapatMysimsStatus');

  // 3. Kembalikan responder mock ke default OK untuk uji E2E saveRapatData -> n8n webhook
  mockFetchResponder = (url, opts) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'mock-sa-bearer-tok', expires_in: 3600 }) };
    }
    if (url.includes('/eoffice_rapat/') && (!opts.method || String(opts.method).toUpperCase() === 'GET')) {
      const idPart = decodeURIComponent(url.split('/eoffice_rapat/')[1].split('?')[0]);
      const rec = fakeFsRapatStore[idPart];
      if (!rec) return { getResponseCode: () => 404, getContentText: () => '{}' };
      const fields = {};
      Object.keys(rec).forEach(k => {
        if (typeof rec[k] === 'boolean') fields[k] = { booleanValue: rec[k] };
        else if (rec[k] !== undefined && rec[k] !== null) fields[k] = { stringValue: String(rec[k]) };
      });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ fields }) };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: url, fields: {} }) };
  };

  const rapatWebhookBefore = recordedFetchCalls.filter(c => c.url.includes('webhook')).length;
  const rapatSave1 = await feSandbox.EofficeDataService.saveRapatData({
    id_rapat: 'RPT-141-WKPA',
    agenda: 'Rapat Evaluasi <script>alert(1)</script>',
    tgl_surat: '2026-11-19',
    no_urut_surat: '',
    nomor_undangan: '.../WKPA.W10-A2/UND.HM3.1.1/XI/2026',
    kode_pejabat_ttd: 'WKPA.W10-A2',
    kode_klasifikasi_surat: 'HM3.1.1',
    pejabat_ttd_nama: 'Ikin, S.Ag., M.E.',
    pejabat_ttd_jabatan: 'Wakil Ketua Pengadilan Agama Indramayu',
    tujuan_undangan_json: JSON.stringify([
      { label: 'Hakim 1' }, { label: 'Panitera' }, { label: 'Sekretaris' }, { label: 'Kasubbag <img src=x>' }
    ]),
    mysims_requested: false
  }, '198001012005011001', admLogin.token);

  assert.strictEqual(rapatSave1.status, 'success');
  assert.strictEqual(rapatSave1.mysims_requested_now, true, '1st Rapat save without no_urut_surat must trigger MYSIMS');
  assert.strictEqual(rapatSave1.mysims_res.status, 'success', 'requestRapatUndanganSuratKeluar must succeed: ' + (rapatSave1.mysims_res && rapatSave1.mysims_res.message));
  const rapatWebhooks = recordedFetchCalls.filter(c => c.url.includes('webhook'));
  assert.strictEqual(rapatWebhooks.length, rapatWebhookBefore + 1, '1st Rapat save must call n8n webhook once');
  const sentRapatN8n = JSON.parse(rapatWebhooks[rapatWebhooks.length - 1].opts.payload);
  assert.strictEqual(sentRapatN8n.event, 'RAPAT_UNDANGAN_SURAT_KELUAR');
  assert.strictEqual(sentRapatN8n.task.jabatan_penandatangan, 'Wakil Ketua');
  assert.strictEqual(sentRapatN8n.task.satker_kode, 'WKPA.W10-A2');
  assert.strictEqual(sentRapatN8n.task.kode_klasifikasi, 'HM3.1.1');
  assert.strictEqual(sentRapatN8n.task.sifat, 'Biasa');
  assert.strictEqual(sentRapatN8n.task.ket, 'Biasa');

  // Edit ke-2 tidak boleh meminta nomor MYSIMS lagi
  const rapatSave2 = await feSandbox.EofficeDataService.saveRapatData({
    ...rapatSave1.data,
    tempat: 'Ruang Sidang Utama'
  }, '198001012005011001', admLogin.token);
  assert.strictEqual(rapatSave2.mysims_requested_now, false, '2nd Rapat edit must NOT re-trigger MYSIMS');
  assert.strictEqual(recordedFetchCalls.filter(c => c.url.includes('webhook')).length, rapatWebhookBefore + 1);

  // 4. Headless Undangan PDF Compiler (2-Stage Resilient Fallback + 1 vs 2 Lembar + Callback PATCH Firestore)
  const origHtmlFnRapat = sandbox.HtmlService.createHtmlOutput;
  sandbox.HtmlService.createHtmlOutput = (html) => {
    if (String(html).includes('<img')) throw new Error('Simulated logo timeout');
    return origHtmlFnRapat(html);
  };
  const fallbackUndPdf = sandbox.generateUndanganPdfBase64_({
    agenda: 'Rapat Koordinasi',
    pejabat_ttd_nama: 'H. Zulkifli, S.Ag., S.H., M.H.',
    pejabat_ttd_jabatan: 'Ketua Pengadilan Agama Indramayu',
    tujuan_undangan_json: JSON.stringify([{ label: 'Wakil Ketua' }])
  }, '1107/KPA.W10-A2/UND.OT.01.1/XI/2026');
  sandbox.HtmlService.createHtmlOutput = origHtmlFnRapat;
  assert(fallbackUndPdf && fallbackUndPdf.pdf_base64.length > 100, 'Undangan PDF 2-stage fallback must succeed even when <img> fails');
  assert(!Buffer.from(fallbackUndPdf.pdf_base64, 'base64').toString('utf8').includes('Lampiran Surat Undangan'), '1 invitee Undangan PDF must stay 1 page');

  const rapatCbOk = parseResp(sandbox.handleApiPost_({
    action: 'updateNomorSuratRapat',
    id_rapat: 'RPT-141-WKPA',
    nomor_surat: '1108/WKPA.W10-A2/UND.HM3.1.1/XI/2026',
    idp: '1408',
    secret_key: 'TEST_HOOK_KEY_127'
  }));
  assert.strictEqual(rapatCbOk.status, 'success', 'Valid Rapat callback must succeed');
  assert.strictEqual(rapatCbOk.no_urut_surat, '1108');
  assert.strictEqual(rapatCbOk.firestore_synced, true);
  assert(rapatCbOk.pdf_undangan && rapatCbOk.pdf_undangan.pdf_base64.length > 100, 'Rapat callback must compile Base64 PDF Undangan');
  const decodedUndPdf = Buffer.from(rapatCbOk.pdf_undangan.pdf_base64, 'base64').toString('utf8');
  assert(decodedUndPdf.includes('1108/WKPA.W10-A2/UND.HM3.1.1/XI/2026'), 'Compiled Undangan PDF must embed official MYSIMS number');
  assert(decodedUndPdf.includes('Lampiran Surat Undangan') && decodedUndPdf.includes('font-size: 9pt;'), '>3 invitees Undangan PDF must generate Page 2 Lampiran');
  assert(!decodedUndPdf.includes('<script>alert(1)') && !decodedUndPdf.includes('<img src=x>'), 'Compiled Undangan PDF must escape XSS');

  const rapatPatchCall = recordedFetchCalls.find(c => c.url.includes('/eoffice_rapat/RPT-141-WKPA') && String(c.opts.method || '').toLowerCase() === 'patch');
  assert(rapatPatchCall && rapatPatchCall.opts.headers && rapatPatchCall.opts.headers.Authorization === 'Bearer mock-sa-bearer-tok',
    'Rapat Firestore REST PATCH must carry OAuth2 Service Account Bearer token');

  const adminRapatStatus = parseResp(sandbox.handleApiPost_({
    action: 'call',
    method: 'getRapatMysimsStatus',
    args: ['RPT-141-WKPA', '198001012005011001', admLogin.token],
    nip: '198001012005011001',
    token: admLogin.token
  }));
  assert.strictEqual(adminRapatStatus.status, 'success', 'Admin must fetch issued Rapat number via getRapatMysimsStatus');
  assert.strictEqual(adminRapatStatus.source, 'cache');
  assert.strictEqual(adminRapatStatus.data.no_urut_surat, '1108');
  assert.strictEqual(adminRapatStatus.data.nomor_undangan, '1108/WKPA.W10-A2/UND.HM3.1.1/XI/2026');

  console.log('[PASS] ALL Fase 1 end-to-end functional & security tests passed (0 failures).');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
