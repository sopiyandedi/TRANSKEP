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
  'permohonan/persetujuan.js'
];

// 1. Parse / Syntax check all modified GAS files
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  new vm.Script(src, { filename: f });
}
console.log('[PASS] Syntax check passed for all 5 modified GAS files.');

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
  Logger: { log: () => {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSS,
    openById: () => mockSS,
    flush: () => {}
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
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt, _raw: txt }) })
  },
  UrlFetchApp: {
    fetch: (url, opts) => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true })
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    formatDate: (d) => d.toISOString(),
    computeDigest: (_alg, val) => toSignedBytes(crypto.createHash('sha256').update(String(val), 'utf8').digest()),
    computeHmacSha256Signature: (val, key) => toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(val), 'utf8').digest()),
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
const fakePayloadB64 = Buffer.from(JSON.stringify({ n: '198001012005011001', r: 'Admin', exp: Math.floor(Date.now()/1000) + 3600, jti: '1234' })).toString('base64url');
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

console.log('[PASS] ALL Fase 1 end-to-end functional & security tests passed (0 failures).');
