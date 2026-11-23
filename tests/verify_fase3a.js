const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

// =========================================================================
// 1. STATIC & SYNTAX VERIFICATION (ALL WORKSPACE JS + KEY HTML/SW)
// =========================================================================
const jsFiles = [];
function walkJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests' || entry.name === 'n8n' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(p);
    else if (entry.name.endsWith('.js')) jsFiles.push(p.replace(/\\/g, '/'));
  }
}
walkJs('.');
for (const f of jsFiles) {
  new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f });
}
console.log(`[PASS] Syntax check passed for all ${jsFiles.length} workspace JS files.`);

const indexHtmlSrc = fs.readFileSync('index.html', 'utf8');
const swSrc = fs.readFileSync('sw.js', 'utf8');
const mTopVer = indexHtmlSrc.match(/window\.APP_BUILD_VER\s*=\s*'(\d+\.\d+\.\d+)'/);
const mLoaderVer = indexHtmlSrc.match(/const APP_BUILD_VER\s*=\s*window\.APP_BUILD_VER\s*\|\|\s*'(\d+\.\d+\.\d+)'/);
const mSwVer = swSrc.match(/const CACHE_NAME\s*=\s*'transkep-v(\d+\.\d+\.\d+)'/);
assert(mTopVer && mLoaderVer && mSwVer, 'APP_BUILD_VER and sw.js CACHE_NAME must follow semver');
assert.strictEqual(mTopVer[1], mLoaderVer[1], 'index.html top APP_BUILD_VER must match loader fallback');
assert.strictEqual(mTopVer[1], mSwVer[1], 'index.html APP_BUILD_VER must match sw.js CACHE_NAME');
const semverParts = mTopVer[1].split('.').map(Number);
assert(semverParts[0] > 3 || (semverParts[0] === 3 && (semverParts[1] > 8 || (semverParts[1] === 8 && semverParts[2] >= 46))), `APP_BUILD_VER (${mTopVer[1]}) must be >= 3.8.46`);

const viewPermSrc = fs.readFileSync('modules/permohonan/view_permohonan.html', 'utf8');
assert(viewPermSrc.includes('v-html="log.statusHtml"'), 'view_permohonan.html must bind log.statusHtml');
console.log('[PASS] Static version bump & view_permohonan.html checks passed.');

// =========================================================================
// 2. BUILD MOCK GAS SANDBOX (WITH LOSSLESS BINARY BLOBS)
// =========================================================================
const SKIP_DIRS = new Set(['.git', '.github', '.firebase', 'tests', 'n8n', 'core', 'modules', 'scripts', 'node_modules', 'css', 'img', 'vendor']);
function walkGasFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out = out.concat(walkGasFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.js') && entry.name !== 'sw.js') {
      out.push(path.join(dir, entry.name).replace(/\\/g, '/').replace(/^\.\//, ''));
    }
  }
  return out;
}
const allGasFiles = walkGasFiles('.').sort();

const propsStore = {
  WAHA_API_KEY: 'test-waha-key',
  ADMIN_TEST_PHONE: '6281200000001',
  TRANSKEP_WEBHOOK_KEY: 'TEST_WEBHOOK_SECRET'
};
let cacheStore = {};
const sentWaCalls = [];
const createdDriveFiles = [];
const createdDriveFolders = [];

function createMockSheet(name, rows) {
  return {
    _name: name,
    _rows: rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getDataRange: () => ({
      getDisplayValues: () => rows.map(r => r.map(c => (c === undefined || c === null ? '' : String(c)))),
      getValues: () => rows.map(r => r.slice())
    }),
    getRange: (r, c, nr = 1, nc = 1) => {
      if (typeof r === 'string') {
        return {
          setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) })
        };
      }
      const makeSetter = () => ({
        setNumberFormat: () => makeSetter(),
        setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
        setValues: (vals) => {
          for (let ri = 0; ri < vals.length; ri++) {
            while (rows.length < r + ri) rows.push([]);
            for (let ci = 0; ci < vals[ri].length; ci++) {
              rows[r - 1 + ri][c - 1 + ci] = vals[ri][ci];
            }
          }
        },
        getValue: () => (rows[r - 1] ? rows[r - 1][c - 1] : ''),
        getDisplayValue: () => (rows[r - 1] && rows[r - 1][c - 1] !== undefined && rows[r - 1][c - 1] !== null ? String(rows[r - 1][c - 1]) : ''),
        getValues: () => {
          const out = [];
          for (let ri = 0; ri < nr; ri++) {
            const row = rows[r - 1 + ri] || [];
            const slice = [];
            for (let ci = 0; ci < nc; ci++) slice.push(row[c - 1 + ci]);
            out.push(slice);
          }
          return out;
        },
        getDisplayValues: () => {
          const out = [];
          for (let ri = 0; ri < nr; ri++) {
            const row = rows[r - 1 + ri] || [];
            out.push(row.slice(c - 1, c - 1 + nc).map(v => (v === undefined || v === null ? '' : String(v))));
          }
          return out;
        }
      });
      return makeSetter();
    },
    appendRow: (row) => { rows.push(row.slice()); },
    deleteRow: (r) => { rows.splice(r - 1, 1); },
    setFrozenRows: () => {}
  };
}

function toSignedBytes(buf) {
  return Array.from(buf, b => (b > 127 ? b - 256 : b));
}
function fromSignedBytes(arr) {
  return Buffer.from(arr.map(b => (b < 0 ? b + 256 : b)));
}

let blobCounter = 0;
function makeMockBlob(rawData, mimeType, name) {
  const buf = Array.isArray(rawData)
    ? fromSignedBytes(rawData)
    : Buffer.isBuffer(rawData)
      ? Buffer.from(rawData)
      : Buffer.from(String(rawData || ''), 'utf8');
  const obj = {
    _buf: buf,
    _mime: mimeType || 'application/octet-stream',
    _name: name || 'file',
    getDataAsString: () => obj._buf.toString('utf8'),
    getBytes: () => toSignedBytes(obj._buf),
    getName: () => obj._name,
    setName: (n) => { obj._name = n; return obj; },
    getContentType: () => obj._mime,
    getAs: (targetMime) => makeMockBlob(obj._buf, targetMime, obj._name.replace(/\.html$/i, '.pdf'))
  };
  return obj;
}

const makeMockFile = (blob) => {
  blobCounter += 1;
  const id = 'file-3a-' + blobCounter;
  createdDriveFiles.push({
    id,
    name: blob ? blob.getName() : 'unknown',
    mime: blob ? blob.getContentType() : '',
    size: blob ? blob.getBytes().length : 0
  });
  return {
    getId: () => id,
    getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
    setSharing: () => {},
    setTrashed: () => {},
    makeCopy: (name) => makeMockFile(makeMockBlob('COPY', 'application/vnd.google-apps.document', name)),
    getAs: (mime) => makeMockBlob('PDF', mime || 'application/pdf', 'doc.pdf'),
    getBlob: () => makeMockBlob('PDF', 'application/pdf', 'doc.pdf')
  };
};

const mockFolder = {
  getUrl: () => 'https://drive.google.com/drive/folders/mock-folder-id',
  getFoldersByName: () => ({ hasNext: () => true, next: () => mockFolder }),
  createFolder: (name) => { createdDriveFolders.push(name); return mockFolder; },
  createFile: (blob) => makeMockFile(blob),
  getFiles: () => ({ hasNext: () => false }),
  getFilesByName: () => ({ hasNext: () => false })
};

const userRows = [
  ['NIP', 'Nama', 'Jabatan', 'Role', 'No_HP', 'Password', 'S_2024', 'S_2025', 'S_2026', 'Sakit', 'Penting', 'Besar', 'Melahirkan', 'CLTN', 'Pangkat', 'Alamat', 'TMT_KGB', 'TMT_KNP', 'BUP', 'Status_KGB', 'Tgl_Selesai_KGB', 'Status_KNP', 'Tgl_Selesai_KNP', 'Status_Pensiun', 'Tgl_Pensiun', 'Jenis_Jabatan'],
  ['198001012005011001', 'Admin Satu', 'Kasubbag Kepegawaian', 'Admin', '081234567890', 'adminPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata (III/c)', 'Jl. Merdeka 1', '2026-01-01', '2026-01-01', 58, '', '', '', '', '', '', 'Struktural'],
  ['197901012003011008', 'Atasan Satu', 'Panitera', 'Pegawai', '081377778888', 'atasanPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Pembina (IV/a)', 'Jl. Pahlawan 3', '', '', 60, '', '', '', '', '', '', 'Struktural'],
  ['199002022015012002', 'Pegawai A', 'Staf Umum', 'Pegawai', '081298765432', 'pegAPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata Muda (III/a)', 'Jl. Sudirman 2', '2026-02-01', '', 58, '', '', '', '', '', '', 'Fungsional Umum'],
  ['199203032018011004', 'Pegawai B', 'Staf Arsip', 'Pegawai', '081399991111', 'pegBPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Pengatur (II/c)', 'Jl. Melati 5', '', '', 58, '', '', '', '', '', '', 'Fungsional Umum']
];

const todayDdMmYyyy = (() => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy} 08:00:00`;
})();

const cutiRows = [
  ['ID', 'Waktu', 'NIP', 'Jenis', 'Tgl_Mulai', 'Tgl_Selesai', 'Alasan', 'Status', 'Catatan_Atasan', 'Atasan_NIP', 'Pejabat_NIP', 'Durasi', 'Plh_NIP', 'Status_Atasan', 'Status_Pejabat', 'Alamat', 'History_JSON', 'Bukti_URL', 'Token', 'Nomor_Surat'],
  ['CUTI-EDIT', todayDdMmYyyy, '199002022015012002', 'Tahunan', '2026-11-16', '2026-11-16', 'Awal', 'Menunggu', '', '197901012003011008', '198001012005011001', 1, '', 'Menunggu', 'Menunggu', 'Jl. Sudirman 2', '{"2026":1}', '', 'legacy-recent-tok', ''],
  ['CUTI-LEG-OLD', '01/08/2026 08:00:00', '199002022015012002', 'Tahunan', '2026-11-17', '2026-11-17', 'Lama', 'Menunggu', '', '197901012003011008', '198001012005011001', 1, '', 'Menunggu', 'Menunggu', 'Jl. Sudirman 2', '{"2026":1}', '', 'legacy-expired-tok', ''],
  ['CUTI-EMPTY-TOK', todayDdMmYyyy, '199002022015012002', 'Tahunan', '2026-11-18', '2026-11-18', 'Resend test', 'Menunggu', '', '197901012003011008', '198001012005011001', 1, '', 'Menunggu', 'Menunggu', 'Jl. Sudirman 2', '{"2026":1}', '', '', '']
];

const wfhRows = [
  ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Rencana_JSON', 'Laporan_JSON', 'Atasan_NIP', 'Status_Rencana', 'Status_Laporan', 'Catatan', 'Eviden_URL'],
  ['WFH-A2', '01/11/2026 08:00:00', '199002022015012002', '2026-11-17', '[{"tugas":"Input data","target":"100","jam":"08:00"}]', '[]', '197901012003011008', 'Disetujui', 'Menunggu', '', '']
];

const mockSheets = {
  user_data: createMockSheet('user_data', userRows),
  cuti_log: createMockSheet('cuti_log', cutiRows),
  wfh_log: createMockSheet('wfh_log', wfhRows),
  ekinerja_data: createMockSheet('ekinerja_data', [['ID_Kinerja', 'NIP_Pegawai', 'NIP_Penilai', 'Tahun', 'Periode', 'Predikat', 'URL_Penilaian', 'URL_Evaluasi', 'Status', 'Tgl_TTE', 'File_Pengesahan', 'Tgl_Input']]),
  log_reset_pass: createMockSheet('log_reset_pass', [['ID_Req', 'Timestamp', 'NIP', 'Nama', 'No_WA', 'Status', 'OTP_Hash', 'Expired']]),
  hari_libur: createMockSheet('hari_libur', [['Tanggal', 'Keterangan']])
};

const mockSS = {
  getSheetByName: (n) => mockSheets[n] || null,
  insertSheet: (n) => { mockSheets[n] = createMockSheet(n, []); return mockSheets[n]; }
};

const sandbox = {
  console, Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  MimeType: { HTML: 'text/html', PDF: 'application/pdf' },
  Logger: { log: () => {} },
  SpreadsheetApp: { getActiveSpreadsheet: () => mockSS, openById: () => mockSS, flush: () => {} },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) }) })
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFoldersByName: () => ({ hasNext: () => true, next: () => mockFolder }),
    getFolderById: () => mockFolder,
    createFolder: (name) => { createdDriveFolders.push(name); return mockFolder; },
    createFile: (blob) => makeMockFile(blob),
    getFileById: () => makeMockFile(null)
  },
  DocumentApp: { openById: () => ({ getBody: () => ({ setMarginTop: () => {}, setMarginBottom: () => {}, setMarginLeft: () => {}, setMarginRight: () => {}, replaceText: () => {}, getTables: () => [] }), saveAndClose: () => {} }) },
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
        if (ttl > 21600) throw new Error('Cache TTL exceeded 21600: ' + ttl);
        cacheStore[k] = String(v);
      },
      remove: (k) => { delete cacheStore[k]; }
    })
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt, _raw: txt }) }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    formatDate: (d) => d.toISOString().slice(0, 10),
    computeDigest: (_alg, val) => toSignedBytes(crypto.createHash('sha256').update(String(val), 'utf8').digest()),
    computeHmacSha256Signature: (val, key) => toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(val), 'utf8').digest()),
    base64Encode: (input) => (Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8')).toString('base64'),
    base64Decode: (b64) => toSignedBytes(Buffer.from(String(b64), 'base64')),
    base64EncodeWebSafe: (input) => (Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (b64) => toSignedBytes(Buffer.from(String(b64).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (data, mime, name) => makeMockBlob(data, mime, name)
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of allGasFiles) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
sandbox.sendWhatsAppMessage_ = (phone, text) => { sentWaCalls.push({ phone, text }); return { status: 'success' }; };
sandbox.triggerN8nSuratKeluarCuti_ = () => {};

const adm = sandbox.verifyLogin('198001012005011001', 'adminPass123');
const atasan = sandbox.verifyLogin('197901012003011008', 'atasanPass123');
const pegA = sandbox.verifyLogin('199002022015012002', 'pegAPass123');
const pegB = sandbox.verifyLogin('199203032018011004', 'pegBPass123');
assert(adm.status === 'success' && atasan.status === 'success' && pegA.status === 'success' && pegB.status === 'success');

// =========================================================================
// 3. UPLOAD VALIDATION TESTS (validateUploadedFile_ + 5 HANDLERS)
// =========================================================================
const b64Pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n').toString('base64');
const b64Png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]).toString('base64');
const b64Jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]).toString('base64');
const b64Zip = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]).toString('base64');
const b64Mp3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]).toString('base64');
const b64Wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]).toString('base64');
const b64Ogg = Buffer.from([0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]).toString('base64');
const b64Webm = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00]).toString('base64');
const b64Html = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>').toString('base64');
const b64Svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>').toString('base64');

assert.strictEqual(sandbox.validateUploadedFile_(b64Pdf, 'doc.pdf', 'application/pdf', { allowPdf: true }).ext, 'pdf');
assert.strictEqual(sandbox.validateUploadedFile_(b64Png, 'foto.png', 'image/png', { allowPdf: true, allowImages: true }).ext, 'png');
assert.strictEqual(sandbox.validateUploadedFile_(b64Jpg, 'foto.jpg', 'image/jpeg', { allowPdf: true, allowImages: true }).ext, 'jpg');
assert.strictEqual(sandbox.validateUploadedFile_(b64Zip, 'arsip.zip', 'application/zip', { allowPdf: true, allowImages: true, allowZip: true }).ext, 'zip');
assert.strictEqual(sandbox.validateUploadedFile_(b64Mp3, 'rekaman.mp3', 'audio/mpeg', { allowPdf: false, allowAudio: true }).ext, 'mp3');
assert.strictEqual(sandbox.validateUploadedFile_(b64Wav, 'rekaman.wav', 'audio/wav', { allowPdf: false, allowAudio: true }).ext, 'wav');
assert.strictEqual(sandbox.validateUploadedFile_(b64Ogg, 'rekaman.ogg', 'audio/ogg', { allowPdf: false, allowAudio: true }).ext, 'ogg');
assert.strictEqual(sandbox.validateUploadedFile_(b64Webm, 'rekaman.webm', 'audio/webm', { allowPdf: false, allowAudio: true }).ext, 'webm');

assert.throws(() => sandbox.validateUploadedFile_(b64Html, 'disguised.pdf', 'application/pdf', { allowPdf: true }), /Format isi berkas|markup/i);
assert.throws(() => sandbox.validateUploadedFile_(b64Svg, 'disguised.png', 'image/png', { allowPdf: true, allowImages: true }), /Format isi berkas|markup/i);
assert.throws(() => sandbox.validateUploadedFile_(b64Png, 'evil.svg', 'image/png', { allowPdf: true, allowImages: true }), /Ekstensi berkas \.svg/i);
assert.throws(() => sandbox.validateUploadedFile_(b64Pdf, 'wrongmime.pdf', 'text/html', { allowPdf: true }), /Tipe MIME/i);
assert.throws(() => sandbox.validateUploadedFile_(b64Zip, 'bundle.zip', 'application/zip', { allowPdf: true, allowImages: true, allowZip: false }), /ZIP tidak diizinkan/i);
assert.throws(() => sandbox.validateUploadedFile_(b64Mp3, 'rekaman.mp3', 'audio/mpeg', { allowPdf: true, allowAudio: false }), /audio tidak diizinkan/i);
assert.throws(() => sandbox.validateUploadedFile_('not@valid#base64!', 'x.pdf', 'application/pdf', { allowPdf: true }), /Base64/i);
const overLimitB64 = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(150, 0x41)]).toString('base64');
assert.throws(() => sandbox.validateUploadedFile_(overLimitB64, 'big.pdf', 'application/pdf', { allowPdf: true, maxBytes: 100 }), /melebihi batas maksimum/i);

// Verify addCutiLog rejects malicious upload BEFORE touching user balance or Drive or cuti_log!
const saldoBeforeBadCuti = userRows[3][8]; // S_2026 for Pegawai A
const cutiCountBefore = cutiRows.length;
const driveCountBefore = createdDriveFiles.length;
const badCutiRes = sandbox.addCutiLog({
  nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-12-01', tgl_selesai: '2026-12-01',
  alasan: 'Cuti', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu',
  fileData: b64Html, fileName: 'lampiran.pdf', fileMimeType: 'application/pdf'
}, pegA.data.nip, pegA.token);
assert.strictEqual(badCutiRes.status, 'error', 'HTML disguised as PDF must fail addCutiLog');
assert.strictEqual(userRows[3][8], saldoBeforeBadCuti, 'Cuti balance must NOT be deducted when upload fails validation');
assert.strictEqual(cutiRows.length, cutiCountBefore, 'cuti_log must NOT append row when upload fails');
assert.strictEqual(createdDriveFiles.length, driveCountBefore, 'Drive must NOT create file when upload fails');

// Verify updateCutiLog rejects malicious upload without modifying row or Drive
const badUpdCuti = sandbox.updateCutiLog({
  id: 'CUTI-EDIT', nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-11-16', tgl_selesai: '2026-11-16',
  alasan: 'Update', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu',
  fileData: b64Svg, fileName: 'lampiran.png', fileMimeType: 'image/png'
}, pegA.data.nip, pegA.token);
assert.strictEqual(badUpdCuti.status, 'error', 'SVG disguised as PNG must fail updateCutiLog');
assert.strictEqual(createdDriveFiles.length, driveCountBefore);

// Verify valid PNG upload succeeds on updateCutiLog
const okUpdCuti = sandbox.updateCutiLog({
  id: 'CUTI-EDIT', nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-11-16', tgl_selesai: '2026-11-16',
  alasan: 'Update bersih', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu',
  fileData: b64Png, fileName: 'surat_sakit.png', fileMimeType: 'image/png'
}, pegA.data.nip, pegA.token);
assert.strictEqual(okUpdCuti.status, 'success', 'Valid PNG upload on updateCutiLog must succeed');

// Verify WFH rejects HTML, accepts ZIP+PDF
const driveBeforeWfh = createdDriveFiles.length;
const badWfh = sandbox.submitLaporanWFH({
  id: 'WFH-A2', nip: pegA.data.nip, nama: 'Pegawai A', laporan_json: '[]', existingUrls: '',
  newFiles: [{ fileData: b64Html, fileName: 'xss.html', fileMimeType: 'text/html' }]
}, pegA.token);
assert.strictEqual(badWfh.status, 'error', 'HTML file in WFH laporan must be rejected');
assert.strictEqual(createdDriveFiles.length, driveBeforeWfh, 'WFH pre-validation must abort before Drive upload');

const okWfh = sandbox.submitLaporanWFH({
  id: 'WFH-A2', nip: pegA.data.nip, nama: 'Pegawai A', laporan_json: '[{"tugas":"Input","realisasi":"100%"}]', existingUrls: '',
  newFiles: [
    { fileData: b64Zip, fileName: 'eviden.zip', fileMimeType: 'application/zip' },
    { fileData: b64Pdf, fileName: 'lap.pdf', fileMimeType: 'application/pdf' }
  ]
}, pegA.token);
assert.strictEqual(okWfh.status, 'success', 'WFH laporan with valid ZIP & PDF must succeed: ' + (okWfh.message || ''));

// Verify Kinerja, SK, SOP enforce PDF-only
const driveBeforeKinerja = createdDriveFiles.length;
const badKinerja = sandbox.addKinerjaLog({
  nip: pegA.data.nip, pejabat_nip: atasan.data.nip, tahun: '2026', periode: 'Q1', predikat: 'Baik',
  filePenilaianData: b64Png, fileEvaluasiData: b64Pdf, fileMimeType: 'image/png', fileNameBase: 'test'
}, pegA.token);
assert.strictEqual(badKinerja.status, 'error', 'Kinerja must reject PNG (PDF-only)');
assert.strictEqual(createdDriveFiles.length, driveBeforeKinerja);

const okKinerja = sandbox.addKinerjaLog({
  nip: pegA.data.nip, pejabat_nip: atasan.data.nip, tahun: '2026', periode: 'Q1', predikat: 'Baik',
  filePenilaianData: b64Pdf, fileEvaluasiData: b64Pdf, fileMimeType: 'application/pdf', fileNameBase: 'test'
}, pegA.token);
assert.strictEqual(okKinerja.status, 'success', 'Kinerja with valid PDFs must succeed');

const badSk = sandbox.saveSk({ judul_sk: 'SK Uji', tgl_sk: '2026-11-01', pj_sk: 'PJ. Manajemen', fileBase64: b64Jpg, fileMimeType: 'image/jpeg' }, adm.data.nip, adm.token);
assert.strictEqual(badSk.status, 'error', 'saveSk must reject non-PDF');
const okSk = sandbox.saveSk({ judul_sk: 'SK Uji', tgl_sk: '2026-11-01', pj_sk: 'PJ. Manajemen', fileBase64: b64Pdf, fileMimeType: 'application/pdf' }, adm.data.nip, adm.token);
assert.strictEqual(okSk.status, 'success', 'saveSk with valid PDF must succeed');

const badSop = sandbox.saveSopData({ judul_sop: 'SOP Uji', tanggal_efektif: '2026-11-01', kategori_pj: 'PJ. Umum', fileBase64: b64Html, fileMimeType: 'text/html' }, adm.data.nip, adm.token);
assert.strictEqual(badSop.status, 'error', 'saveSopData must reject HTML/non-PDF');
const okSop = sandbox.saveSopData({ judul_sop: 'SOP Uji', tanggal_efektif: '2026-11-01', kategori_pj: 'PJ. Umum', fileBase64: b64Pdf, fileMimeType: 'application/pdf' }, adm.data.nip, adm.token);
assert.strictEqual(okSop.status, 'success', 'saveSopData with valid PDF must succeed');
console.log('[PASS] Upload validation & atomic pre-mutation guards across Cuti, WFH, Kinerja, SK, SOP verified.');

// =========================================================================
// 4. PASSWORD RESET SAFE FLOW (NON-LOCKOUT, NEUTRAL MSG, PLAN B FALLBACK)
// =========================================================================
const tp1 = sandbox.generateSecureTempPass_();
const tp2 = sandbox.generateSecureTempPass_();
assert(/^TR-[A-Z0-9]{8}$/.test(tp1) && /^TR-[A-Z0-9]{8}$/.test(tp2), 'Temp password must match TR-[A-Z0-9]{8}');
assert.notStrictEqual(tp1, tp2, 'Temp passwords must be distinct');

const pegAPassHashBefore = userRows[3][5];
const waBeforeReset = sentWaCalls.length;
const rstRegistered = sandbox.requestPasswordReset('081298765432');
const rstUnregistered = sandbox.requestPasswordReset('089912345678');

assert.strictEqual(rstRegistered.status, 'success');
assert.strictEqual(rstUnregistered.status, 'success', 'Unregistered phone must return same neutral status');
assert.strictEqual(rstRegistered.message, rstUnregistered.message, 'Registered vs unregistered WA must return identical neutral message (no enumeration)');
assert(!rstRegistered.message.includes('6281298765432') && !rstRegistered.message.includes('081298765432'), 'Reset response must not leak raw phone number');

// CRITICAL: Victim original password MUST NOT be overwritten or forced to reset before temp pass is actually used!
assert.strictEqual(userRows[3][5], pegAPassHashBefore, 'requestPasswordReset must NOT overwrite user_data col 6 before temp login');
assert(!cacheStore['force_reset_' + pegA.data.nip], 'force_reset_ must NOT be set before temp password login');
const victimStillWorks = sandbox.verifyLogin(pegA.data.nip, 'pegAPass123');
assert.strictEqual(victimStillWorks.status, 'success', 'Victim original password MUST still work after unconsumed reset request');
assert(!victimStillWorks.must_change_password, 'Normal login must not force change password');

// Now consume the WA temp password once:
const pegAOtp = sentWaCalls.slice(waBeforeReset)[0].text.match(/TR-[A-Z0-9]{8}/)[0];
const otpLogin = sandbox.verifyLogin(pegA.data.nip, pegAOtp);
assert.strictEqual(otpLogin.status, 'success', 'Login with pending temp password must succeed');
assert.strictEqual(otpLogin.must_change_password, true, 'Temp password login must set must_change_password=true');
assert.notStrictEqual(userRows[3][5], pegAPassHashBefore, 'Temp login promotes temp hash to col 6');
assert(!cacheStore['pending_reset_' + pegA.data.nip], 'pending_reset_ cache entry must be removed upon consumption');
// Re-login still flagged by regex / force_reset_ until changed:
const otpReLogin = sandbox.verifyLogin(pegA.data.nip, pegAOtp);
assert.strictEqual(otpReLogin.must_change_password, true, 'Re-login with TR-XXXXXXXX must still flag must_change_password');
// Plan B fallback test via log_reset_pass on Pegawai B:
const planBTemp = 'TR-PLANB999';
mockSheets.log_reset_pass.appendRow(['RST-PLANB', '2026-11-14', sandbox.encryptField_(pegB.data.nip), 'Pegawai B', '6281399991111', sandbox.encryptField_(planBTemp), '', 'Menunggu']);
const planBLogin = sandbox.verifyLogin(pegB.data.nip, planBTemp);
assert.strictEqual(planBLogin.status, 'success', 'Admin log_reset_pass Plan B login must succeed');
assert.strictEqual(planBLogin.must_change_password, true);
assert(String(userRows[4][5]).startsWith('SHA256$'), 'Plan B login must promote to SHA256$ in col 6');
assert.strictEqual(mockSheets.log_reset_pass._rows.length, 1, 'Consumed Plan B row must be deleted from log_reset_pass');
console.log('[PASS] Password reset non-lockout, neutral enumeration, TR-XXXXXXXX & Plan B consumption verified.');

// =========================================================================
// 5. MAGIC LINK ROTATION, CLEARANCE, TTL EXPIRY & RATE LIMITING
// =========================================================================
const waBeforeCuti = sentWaCalls.length;
const addCutiOk = sandbox.addCutiLog({
  nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-12-07', tgl_selesai: '2026-12-07',
  alasan: 'Urusan sah', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu',
  fileData: b64Pdf, fileName: 'permohonan.pdf', fileMimeType: 'application/pdf'
}, pegA.data.nip, otpLogin.token);
assert.strictEqual(addCutiOk.status, 'success', 'Valid PDF addCutiLog must succeed');
const newCutiRow = cutiRows[cutiRows.length - 1];
const stage1Tok = String(newCutiRow[18] || '');
assert(/^[0-9a-f-]{36}\.\d{13,}$/i.test(stage1Tok), 'Initial magic token must include UUID + epoch expiry: ' + stage1Tok);

const lookup1 = sandbox.getCutiByToken(stage1Tok);
assert.strictEqual(lookup1.status, 'success');
assert.strictEqual(lookup1.data.current_stage, 'atasan');

// Stage 1 approval rotates token and notifies Pejabat with new token!
const waBeforeS1 = sentWaCalls.length;
const s1Approve = sandbox.processMagicLinkApproval(stage1Tok, 'Disetujui', 'OK Atasan');
assert.strictEqual(s1Approve.status, 'success');
const stage2Tok = String(newCutiRow[18] || '');
assert(stage2Tok && stage2Tok !== stage1Tok && /\.\d{13,}$/.test(stage2Tok), 'Stage 1 approval MUST rotate magic token');
assert.strictEqual(sandbox.getCutiByToken(stage1Tok).status, 'error', 'Old Stage 1 token must immediately stop working after rotation');
assert.strictEqual(sandbox.processMagicLinkApproval(stage1Tok, 'Disetujui', 'Replay').status, 'error', 'Stage 1 replay must fail');
const waToPejabat = sentWaCalls.slice(waBeforeS1).find(w => w.text.includes(stage2Tok));
assert(waToPejabat, 'Pejabat WA notification must carry the newly rotated Stage 2 token');

// Stage 2 final approval clears token completely
assert.strictEqual(sandbox.getCutiByToken(stage2Tok).data.current_stage, 'pejabat');
const s2Approve = sandbox.processMagicLinkApproval(stage2Tok, 'Disetujui', 'Acc Pejabat');
assert.strictEqual(s2Approve.status, 'success');
assert.strictEqual(String(newCutiRow[18]), '', 'Stage 2 completion MUST clear magic token col 19');
assert.strictEqual(sandbox.getCutiByToken(stage2Tok).status, 'error', 'Completed token replay must fail');

// Stage 1 rejection clears token & refunds saldo
const addCutiRej = sandbox.addCutiLog({
  nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-12-08', tgl_selesai: '2026-12-08',
  alasan: 'Akan ditolak', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu'
}, pegA.data.nip, otpLogin.token);
const rejRow = cutiRows[cutiRows.length - 1];
const tokRej = String(rejRow[18] || '');
assert.strictEqual(sandbox.processMagicLinkApproval(tokRej, 'Ditolak', 'Jadwal padat').status, 'success');
assert.strictEqual(String(rejRow[18]), '', 'Rejection must clear magic token col 19');

// Dashboard updateCutiStatus Stage 1 rotates token; Stage 2 clears token
const addCutiDash = sandbox.addCutiLog({
  nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-12-09', tgl_selesai: '2026-12-09',
  alasan: 'Dashboard flow', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Indramayu'
}, pegA.data.nip, otpLogin.token);
const dashRow = cutiRows[cutiRows.length - 1];
const tokDash1 = String(dashRow[18] || '');
assert.strictEqual(sandbox.updateCutiStatus(dashRow[0], 'Disetujui', 'OK Dash', atasan.data.nip, false, atasan.token).status, 'success');
const tokDash2 = String(dashRow[18] || '');
assert(tokDash2 && tokDash2 !== tokDash1, 'updateCutiStatus Stage 1 must rotate magic token');
assert.strictEqual(sandbox.updateCutiStatus(dashRow[0], 'Ditolak', 'Tolak Dash', adm.data.nip, false, adm.token).status, 'success');
assert.strictEqual(String(dashRow[18]), '', 'updateCutiStatus Stage 2 decision must clear magic token');

// TTL expiry checks: explicit expired .exp AND legacy > 30 days vs recent legacy
assert.strictEqual(sandbox.isMagicCutiTokenExpired_(crypto.randomUUID() + '.1000000000000', newCutiRow), true, 'Past timestamp token must be expired');
assert.strictEqual(sandbox.getCutiByToken('legacy-expired-tok').status, 'error', 'Legacy token older than 30 days must be rejected');
assert.strictEqual(sandbox.getCutiByToken('legacy-recent-tok').status, 'success', 'Recent legacy token (<30d) stays compatible');

// resendCutiWhatsApp denies Pegawai, regenerates empty token for Admin
const resendDeny = sandbox.resendCutiWhatsApp('CUTI-EMPTY-TOK', pegA.data.nip, otpLogin.token);
assert.strictEqual(resendDeny.status, 'error', 'Pegawai must be denied resendCutiWhatsApp');
const waBeforeResend = sentWaCalls.length;
const resendRes = sandbox.resendCutiWhatsApp('CUTI-EMPTY-TOK', adm.data.nip, adm.token);
assert.strictEqual(resendRes.status, 'success', 'Admin resendCutiWhatsApp should succeed: ' + (resendRes.message || ''));
const emptyTokRow = cutiRows.find(r => r[0] === 'CUTI-EMPTY-TOK');
assert(/\.\d{13,}$/.test(String(emptyTokRow[18] || '')), 'resendCutiWhatsApp must regenerate missing token');
assert(sentWaCalls.slice(waBeforeResend)[0].text.includes(emptyTokRow[18]), 'Resent WA must contain regenerated token');

// Rate limit on repeated invalid magic token lookups & actions (per-token & global)
cacheStore = {};
let blockedMagic = false;
for (let i = 0; i < 20; i++) {
  const r = sandbox.getCutiByToken('bad-token-fixed-id');
  if (/terlalu banyak/i.test(r.message || '')) { blockedMagic = true; break; }
}
assert(blockedMagic, 'Repeated invalid getCutiByToken calls on same token must hit rate limit');

let blockedAction = false;
for (let i = 0; i < 15; i++) {
  const r = sandbox.processMagicLinkApproval('bad-action-fixed', 'Disetujui', '');
  if (/terlalu banyak/i.test(r.message || '')) { blockedAction = true; break; }
}
assert(blockedAction, 'Repeated invalid processMagicLinkApproval calls on same token must hit rate limit');

let blockedGlobal = false;
for (let i = 0; i < 130; i++) {
  const r = sandbox.getCutiByToken('rand-tok-' + i);
  if (/terlalu banyak/i.test(r.message || '')) { blockedGlobal = true; break; }
}
assert(blockedGlobal, 'Spray of distinct invalid tokens must hit magic_global rate limit');
console.log('[PASS] Magic Link rotation, clearance, TTL expiry, resend & rate-limit verified.');

// =========================================================================
// 6. MANAJEMEN_PEGAWAI FORMULA INJECTION PROTECTION
// =========================================================================
const addInj = sandbox.addUser({
  nip: '199505052020011005', nama: '=CMD|calc', jabatan: '+1+1', role: 'Pegawai',
  no_hp: '081255556666', pass: 'PassValid1!', alamat: '-SUM(A1)',
  s_tahunan_2024: 0, s_tahunan_2025: 0, s_tahunan_2026: 12,
  s_sakit: 12, s_penting: 5, s_besar: 0, s_melahirkan: 0, s_cltn: 0,
  pangkat: '=III/a', tmt_kgb: '', tmt_knp: '', bup: 58, jenis_jabatan: '@FUNC'
}, adm.data.nip, adm.token);
assert.strictEqual(addInj.status, 'success', 'addUser should succeed while neutralizing formulas');
const addedRow = userRows[userRows.length - 1];
assert.strictEqual(addedRow[1], "'=CMD|calc", 'addUser col 2 nama must neutralize formula');
assert.strictEqual(addedRow[2], "'+1+1", 'addUser col 3 jabatan must neutralize formula');
assert(String(addedRow[15]).startsWith('ENC$'), 'addUser col 16 alamat is encrypted as ENC$ (formula inert)');
assert.strictEqual(addedRow[14], "'=III/a", 'addUser col 15 pangkat must neutralize formula');
assert.strictEqual(addedRow[25], "'@FUNC", 'addUser col 26 jenis_jabatan must neutralize formula');

const updInj = sandbox.updateUser({
  nip: '199505052020011005', originalNip: '199505052020011005',
  nama: '=HYPERLINK("http://evil")', jabatan: '-Exec', role: 'Pegawai',
  no_hp: '081255556666', pass: '[Telah Dienkripsi]', alamat: '@evil',
  s_tahunan_2024: 0, s_tahunan_2025: 0, s_tahunan_2026: 12,
  s_sakit: 12, s_penting: 5, s_besar: 0, s_melahirkan: 0, s_cltn: 0,
  pangkat: '+IV/a', tmt_kgb: '', tmt_knp: '', bup: 58, jenis_jabatan: '=BAD'
}, adm.data.nip, adm.token);
assert.strictEqual(updInj.status, 'success');
assert.strictEqual(addedRow[1], "'=HYPERLINK(\"http://evil\")");
assert.strictEqual(addedRow[2], "'-Exec");
assert.strictEqual(addedRow[14], "'+IV/a");
assert.strictEqual(addedRow[25], "'=BAD");

const impInj = sandbox.importBulkUsers([{
  NIP: '199505052020011005', Nama: '+IMPORT_CMD', Jabatan: '=Jab', Role: 'Pegawai',
  No_HP: '081255556666', Password: '[Telah Dienkripsi]', Alamat: '-Addr',
  Sisa_Tahunan_2024: 0, Sisa_Tahunan_2025: 0, Sisa_Tahunan_2026: 12,
  Sisa_Sakit: 12, Sisa_Penting: 5, Sisa_Besar: 0, Sisa_Melahirkan: 0, Sisa_CLTN: 0,
  Pangkat: '=Pkt', TMT_KGB: '', TMT_KNP: '', BUP: 58, Jenis_Jabatan: '@Bulk'
}, {
  NIP: '199606062021011006', Nama: '=NEW_BULK', Jabatan: '+NewJab', Role: 'Pegawai',
  No_HP: '081255557777', Password: 'BulkPass1!', Alamat: '=Addr2',
  Sisa_Tahunan_2024: 0, Sisa_Tahunan_2025: 0, Sisa_Tahunan_2026: 12,
  Sisa_Sakit: 12, Sisa_Penting: 5, Sisa_Besar: 0, Sisa_Melahirkan: 0, Sisa_CLTN: 0,
  Pangkat: '@NewPkt', TMT_KGB: '', TMT_KNP: '', BUP: 58, Jenis_Jabatan: '=NewJenis'
}], adm.data.nip, adm.token);
assert.strictEqual(impInj.status, 'success');
assert.strictEqual(addedRow[1], "'+IMPORT_CMD");
assert.strictEqual(addedRow[25], "'@Bulk");
const newBulkRow = userRows[userRows.length - 1];
assert.strictEqual(newBulkRow[1], "'=NEW_BULK");
assert.strictEqual(newBulkRow[25], "'=NewJenis");
console.log('[PASS] manajemen_pegawai addUser, updateUser & importBulkUsers formula neutralization verified.');

// =========================================================================
// 7. FRONTEND XSS SANITIZATION & SCHEME VALIDATION (NODE VM BROWSER MOCK)
// =========================================================================
const domElements = {};
function makeDomEl(id, tag = 'div') {
  const classes = new Set();
  const children = [];
  const el = {
    id: id || '',
    tagName: tag.toUpperCase(),
    innerHTML: '',
    innerText: '',
    value: '',
    href: '',
    src: '',
    onload: null,
    style: {},
    dataset: {},
    _children: children,
    parentNode: null,
    firstElementChild: { classList: { add: () => {}, remove: () => {} } },
    previousElementSibling: { innerText: '' },
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c)
    },
    appendChild: (ch) => { ch.parentNode = el; children.push(ch); if (ch.id) domElements[ch.id] = ch; return ch; },
    remove: () => { if (el.id && domElements[el.id] === el) delete domElements[el.id]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  return el;
}
function getOrCreateEl(id) {
  if (!domElements[id]) domElements[id] = makeDomEl(id);
  return domElements[id];
}

const lsStore = {};
const domListeners = {};
function MockStorage() {}
MockStorage.prototype.getItem = (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null);
MockStorage.prototype.setItem = (k, v) => { lsStore[k] = String(v); };
MockStorage.prototype.removeItem = (k) => { delete lsStore[k]; };
const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

const browserSandbox = {
  console, Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, parseFloat, isNaN,
  encodeURIComponent, decodeURIComponent, setTimeout: () => 1, clearTimeout: () => {},
  URL, URLSearchParams,
  Storage: MockStorage,
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  navigator: { onLine: true, clipboard: { writeText: async () => {} } },
  location: { href: 'https://transkep.example.com/', pathname: '/', search: '', hash: '' },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  Vue: { createApp: () => ({ mount: () => ({}) }), reactive: (o) => o, ref: (v) => ({ value: v }) },
  document: {
    body: getOrCreateEl('__body__'),
    head: getOrCreateEl('__head__'),
    getElementById: (id) => getOrCreateEl(id),
    createElement: (tag) => makeDomEl('', tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { domListeners[ev] = domListeners[ev] || []; domListeners[ev].push(fn); }
  }
};
browserSandbox.window = browserSandbox;
browserSandbox.self = browserSandbox;
browserSandbox.globalThis = browserSandbox;
vm.createContext(browserSandbox);

vm.runInContext(fs.readFileSync('core/core.js', 'utf8'), browserSandbox, { filename: 'core/core.js' });
vm.runInContext(fs.readFileSync('modules/referensi/referensi.js', 'utf8'), browserSandbox, { filename: 'modules/referensi/referensi.js' });
vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), browserSandbox, { filename: 'modules/eoffice/rapat.js' });
vm.runInContext(fs.readFileSync('modules/pdf_viewer/pdf_viewer.js', 'utf8'), browserSandbox, { filename: 'modules/pdf_viewer/pdf_viewer.js' });
vm.runInContext(fs.readFileSync('modules/pkp/cetak/cetak_pk.js', 'utf8'), browserSandbox, { filename: 'modules/pkp/cetak/cetak_pk.js' });
vm.runInContext(fs.readFileSync('modules/pkp/cetak/cetak_pck.js', 'utf8'), browserSandbox, { filename: 'modules/pkp/cetak/cetak_pck.js' });

// Verify core.js helpers: escHtml, sanitizeUiHtml, showNotify, showCustomConfirm
assert.strictEqual(browserSandbox.escHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
const benignUi = "Simpan berhasil!<br><span class='text-[10px] text-amber-400'>Atasan: <b>Budi</b></span>";
const sanitizedBenign = browserSandbox.sanitizeUiHtml(benignUi);
assert(sanitizedBenign.includes('<br>') && sanitizedBenign.includes('<b>Budi</b>') && sanitizedBenign.includes('<span class="text-[10px] text-amber-400">'), 'Benign UI formatting must survive sanitizeUiHtml');
const evilUi = `<img src=x onerror="alert(1)"><script>steal()</script><span class="bad" onclick="x()">Hi</span>`;
const sanitizedEvil = browserSandbox.sanitizeUiHtml(evilUi);
assert(!sanitizedEvil.includes('<img') && !sanitizedEvil.includes('<script') && !sanitizedEvil.includes('onclick="'), 'XSS payloads must be escaped by sanitizeUiHtml');

browserSandbox.showNotify('<script>t()</script>', 'Halo <b>User</b><img src=x onerror=alert(1)>', 'info');
const toastChildren = getOrCreateEl('toast-container')._children;
assert(toastChildren.length === 1, 'showNotify must append toast node');
const toastHtml = toastChildren[0].innerHTML;
assert(toastHtml.includes('&lt;script&gt;t()&lt;/script&gt;') && toastHtml.includes('<b>User</b>') && !toastHtml.includes('<img'), 'showNotify must sanitize XSS while preserving <b>');
browserSandbox.showCustomConfirm('Judul <img>', 'Pesan <script>alert(1)</script><b>aman</b>', () => {});
const confirmHtml = getOrCreateEl('custom-confirm-overlay').innerHTML;
assert(confirmHtml.includes('&lt;img&gt;') && confirmHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && confirmHtml.includes('<b>aman</b>'), 'showCustomConfirm must escape XSS and keep safe <b>');

// Verify modules/referensi/referensi.js handleKodeSearch escaping
vm.runInContext(`kodeSuratDB.push({ kode: '"><img src=x onerror=alert(1)>', desk: 'Uji <script>xss()</script>' });`, browserSandbox);
browserSandbox.handleKodeSearch('xss()');
const kodeHtml = getOrCreateEl('kodeResultContainer').innerHTML;
assert(!kodeHtml.includes('<script>') && !kodeHtml.includes('<img src=x'), 'handleKodeSearch must escape kode & desk');
assert(kodeHtml.includes('onclick="copyKodeToClipboard(this.dataset.kode)"'), 'handleKodeSearch must use dataset.kode instead of string interpolation in onclick');

// Verify modules/eoffice/rapat.js Tahap 143 searchable dropdowns escaping & dataset.nip
browserSandbox.vueState = {
  usersList: [{ nip: "123');alert(1);//", nama: '<img src=x onerror=alert(1)>', jabatan: 'Staf<script>1</script>', role: 'Pegawai' }],
  sopList: []
};
browserSandbox.filterTujuanSearchDrop('');
const rapatTujuanHtml = getOrCreateEl('rapatTujuanSearchDropdown').innerHTML;
assert(!rapatTujuanHtml.includes('<img src=x') && !rapatTujuanHtml.includes('<script>1'), 'filterTujuanSearchDrop must escape nama & jabatan');
assert(rapatTujuanHtml.includes('data-nip="') && rapatTujuanHtml.includes('selectTujuanPegawai(this.dataset.nip)'), 'rapat tujuan dropdown must use data-nip & this.dataset.nip');
assert(rapatTujuanHtml.includes('toggleTujuanDropCheck(this.dataset.nip)'), 'rapat tujuan multi-check checkbox must use data-nip & this.dataset.nip');

browserSandbox.openPembahasanSpeakerDrop(0);
const rapatSpeakerHtml = getOrCreateEl('rapatSpeakerDrop_0').innerHTML;
assert(!rapatSpeakerHtml.includes('<img src=x') && !rapatSpeakerHtml.includes('<script>1'), 'openPembahasanSpeakerDrop must escape nama & jabatan');
assert(rapatSpeakerHtml.includes('data-nip="') && rapatSpeakerHtml.includes('selectPembahasanSpeaker(0, this.dataset.nip)'), 'rapat speaker dropdown must use data-nip & this.dataset.nip');

for (const [kind144, dropId144] of [['pejabatTtd', 'rapatPejabatTtdDrop'], ['pemimpin', 'rapatPemimpinDrop'], ['notulis', 'rapatNotulisDrop']]) {
  browserSandbox.openOfficialSearchDrop(kind144);
  const offHtml = getOrCreateEl(dropId144).innerHTML;
  assert(!offHtml.includes('<img src=x') && !offHtml.includes('<script>1'), `openOfficialSearchDrop ${kind144} must escape nama & jabatan`);
  assert(offHtml.includes('data-nip="') && offHtml.includes(`selectOfficialPegawai('${kind144}', this.dataset.nip)`), `${kind144} dropdown must use data-nip & this.dataset.nip`);
}

// Verify modules/pdf_viewer/pdf_viewer.js XSS & javascript: URL protection
browserSandbox.vmSkApp = {
  groupedSkData: [{
    no_sk: '01/SK', tgl_sk: '2026-11-01', pj_sk: 'PJ', judul_sk: 'SK Evil', link_drive: 'javascript:alert(1)',
    members: [{ nip: 'X1', peran: '<img src=x onerror=alert(2)>' }]
  }]
};
browserSandbox.resolvePdfMemberInfo = () => ({ nama: '<script>m()</script>', jabatan: '<b>J</b>', isGroup: false });
browserSandbox.openFlipbook('javascript:alert(1)', 'SK Evil');
assert.strictEqual(getOrCreateEl('pdfIframe').src, 'about:blank', 'pdf_viewer must block javascript: scheme in iframe.src');
assert.strictEqual(getOrCreateEl('fbBtnDownloadDirect').href, '#', 'pdf_viewer must block javascript: scheme in download button href');
const skMembersHtml = getOrCreateEl('fbMembersList').innerHTML;
assert(!skMembersHtml.includes('<script>') && !skMembersHtml.includes('<img src=x'), 'pdf_viewer member cards must escape nama/jabatan/peran');

// Verify cetak_pk.js & cetak_pck.js escaping (reads state.user & state.usersList)
vm.runInContext(`
  state.user = { nip: '1990', nama: 'Pegawai Uji', jabatan: 'Staf Uji', pangkat: 'III/a' };
  state.usersList.push({ nip: '999', nama: '<script>pk()</script>', jabatan: 'Penilai', role: 'Pegawai' });
`, browserSandbox);
browserSandbox.renderPrintTemplatePK({
  header: { penilai: '999', atasan_pejabat: '999', tahun: '2026' },
  items: [{ sasaran: '<svg onload=alert(1)>', indikator: '<img src=x>', mutu: '100', kuantitas: '10', satuan: '<script>s</script>', pagu: 1000 }]
});
const pkBodyHtml = getOrCreateEl('pk-print-tbody').innerHTML;
assert(!pkBodyHtml.includes('<svg') && !pkBodyHtml.includes('<img') && !pkBodyHtml.includes('<script>s'), 'cetak_pk.js must escape all table fields');

browserSandbox.renderPrintTemplatePCK({
  header: { bulan: 'Januari', tahun: '2026' },
  penilai_nip: '999',
  pegawai: { nama: 'P', nip: '1', pangkat: 'III/a', jabatan: 'Staf' },
  items: [{ sasaran: '<script>pck</script>', indikator: '<img src=x onerror=1>', kuantitas: '10', mutu: '100', real_kuantitas: '10', real_mutu: '100' }]
});
const pckHtml = getOrCreateEl('pck-print-tables-container').innerHTML;
assert(!pckHtml.includes('<script>pck') && !pckHtml.includes('<img src=x'), 'cetak_pck.js must escape all PCK table fields');

// Static-verify Vue / cuti.js / persetujuan.js escaping & window.escapeHtml availability
assert(typeof browserSandbox.escHtml === 'function' && typeof browserSandbox.escapeHtml === 'function');
const cutiJsSrc = fs.readFileSync('modules/permohonan/cuti.js', 'utf8');
assert(cutiJsSrc.includes('const safePejabatNama = esc(pejabat.nama)') && cutiJsSrc.includes("const statusHtml = esc(statusAkhir).replace(' ', '<br>')"));
const persetujuanJsSrc = fs.readFileSync('modules/permohonan/persetujuan.js', 'utf8');
assert(persetujuanJsSrc.includes('${esc(log.tgl_mulai)}') && persetujuanJsSrc.includes('${esc(log.tgl_selesai)}') && persetujuanJsSrc.includes('${esc(log.tanggal)}') && persetujuanJsSrc.includes('${esc(tglMurniIP)}'), 'modules/permohonan/persetujuan.js must escape displayDurasi fields');

console.log('[PASS] Frontend XSS sanitization & URL scheme blocking verified in browser VM.');

// =========================================================================
// 8. TAHAP 146 & 147: AUDIO UPLOAD s.d. 2 GB, FFmpeg, 2-PASS AI & SKB 2026-2027
// =========================================================================
assert(fs.readFileSync('api_router.js', 'utf8').includes('initAudioDriveUploadSession: true') &&
  fs.readFileSync('api_router.js', 'utf8').includes('finalizeAudioDriveUpload: true') &&
  fs.readFileSync('api_router.js', 'utf8').includes('checkAiNotulenJobStatus: true') &&
  fs.readFileSync('api_router.js', 'utf8').includes("case 'callbackAiNotulenJob':"),
'api_router.js must allow Resumable Audio Drive RPCs & callbackAiNotulenJob');

const gasRapat146Src = fs.readFileSync('eoffice/rapat.js', 'utf8');
assert(gasRapat146Src.includes('2 * 1024 * 1024 * 1024') &&
  gasRapat146Src.includes('constantTimeEquals_(incomingKey, configuredKey)'),
'eoffice/rapat.js must enforce 2 GB cap and constantTimeEquals_ on callbackAiNotulenJobFromExternal_');

// Verify n8n blueprint (sanitized + zero secret leaks + valid graph wiring) & local n8n JSON
const n8nNotulenPaths = ['n8n/transkep-ai-notulen.example.json'];
if (fs.existsSync('n8n/transkep-ai-notulen.json')) {
  n8nNotulenPaths.push('n8n/transkep-ai-notulen.json');
}
for (const n8nPath of n8nNotulenPaths) {
  const rawN8n = fs.readFileSync(n8nPath, 'utf8');
  assert(!rawN8n.includes('BEGIN PRIVATE KEY'), `${n8nPath} must NEVER contain private keys`);
  const wf = JSON.parse(rawN8n);
  const nodeNames = new Set((wf.nodes || []).map((n) => n.name));
  assert(nodeNames.size >= 14, `${n8nPath} must contain full async Drive + Gemini Files API pipeline`);
  for (const [srcNode, connMap] of Object.entries(wf.connections || {})) {
    assert(nodeNames.has(srcNode), `${n8nPath} connection source missing node: ${srcNode}`);
    for (const branch of connMap.main || []) {
      for (const edge of branch || []) {
        assert(nodeNames.has(edge.node), `${n8nPath} connection target missing node: ${edge.node}`);
      }
    }
  }
}
const exNotulenRaw = fs.readFileSync('n8n/transkep-ai-notulen.example.json', 'utf8');
for (const secretPat of ['TRANSKEP_WA_BOT_2026', 'AKfycb', 'ekWDS9nBCNqDspRg', 'YWZ8dADUWtnM4zyx', '9ed8b316a1d5192e09dbfab4b713922f8ffb7a2b9191d04fdcc83d4167a6cebd', 'BEGIN PRIVATE KEY']) {
  assert(!exNotulenRaw.includes(secretPat), `transkep-ai-notulen.example.json leaked secret: ${secretPat}`);
}
assert(exNotulenRaw.includes('n8n-nodes-base.googleDrive') &&
  exNotulenRaw.includes('"authentication": "serviceAccount"') &&
  exNotulenRaw.includes('generativelanguage.googleapis.com/upload/v1beta/files') &&
  exNotulenRaw.includes('file_data') &&
  exNotulenRaw.includes('callbackAiNotulenJob'),
'transkep-ai-notulen.example.json must wire Drive Service Account -> Gemini Files API -> callbackAiNotulenJob');

// Verify GAS backend RPCs for 120 MB Resumable Session, Finalize, Async AI & Polling
const reqAdminCall = (method, args) => JSON.parse(
  sandbox.handleApiPost_({ action: 'call', method, args, nip: adm.data.nip, token: adm.token }).getContent()
);
const reqPegCall = (method, args) => JSON.parse(
  sandbox.handleApiPost_({ action: 'call', method, args, nip: pegA.data.nip, token: otpLogin.token }).getContent()
);

assert.strictEqual(reqPegCall('initAudioDriveUploadSession', [{ file_size: 1024 }]).status, 'error', 'Pegawai must be denied initAudioDriveUploadSession');
assert.strictEqual(reqPegCall('checkAiNotulenJobStatus', ['AINOT-12345']).status, 'error', 'Pegawai must be denied checkAiNotulenJobStatus');

const tooBigInit = reqAdminCall('initAudioDriveUploadSession', [{ file_size: (2 * 1024 * 1024 * 1024) + 1024, file_name: 'over.m4a' }, adm.data.nip, adm.token]);
assert.strictEqual(tooBigInit.status, 'error', 'initAudioDriveUploadSession must reject > 2 GB');

const origFetch146 = sandbox.UrlFetchApp.fetch;
const origScriptApp146 = sandbox.ScriptApp;
const origDriveApp146 = sandbox.DriveApp;
const fetchLog146 = [];
sandbox.ScriptApp = { getOAuthToken: () => 'mock-oauth-drive-tok' };
const arsipParent146 = { getId: () => 'fld-arsip-146', getName: () => 'Arsip Foto Rapat TRANSKEP', getParents: () => ({ hasNext: () => false }) };
const yrFolder146 = {
  getId: () => 'fld-2026-146', getName: () => '2026', isTrashed: () => false, setSharing: () => {},
  getFoldersByName: () => ({ hasNext: () => true, next: () => monFolder146 }),
  getParents: () => { let d = 0; return { hasNext: () => d++ === 0, next: () => arsipParent146 }; }
};
const monFolder146 = {
  getId: () => 'fld-nov-146', getName: () => 'November', isTrashed: () => false, setSharing: () => {},
  getFoldersByName: () => ({ hasNext: () => true, next: () => titleFolder146 }),
  getParents: () => { let d = 0; return { hasNext: () => d++ === 0, next: () => yrFolder146 }; }
};
const titleFolder146 = {
  getId: () => 'fld-title-146', getName: () => 'Rapat Panitera Pengganti', getUrl: () => 'https://drive.google.com/drive/folders/fld-title-146',
  isTrashed: () => false, setSharing: () => {},
  getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => titleFolder146,
  getParents: () => { let d = 0; return { hasNext: () => d++ === 0, next: () => monFolder146 }; }
};
const rootArsip146 = {
  getId: () => 'fld-root-146', getName: () => 'Arsip Foto Rapat TRANSKEP', isTrashed: () => false, setSharing: () => {},
  getFoldersByName: () => ({ hasNext: () => true, next: () => yrFolder146 })
};
let driveShared146 = false;
const mockAudioDriveFile146 = {
  getId: () => '1DriveAudio73MbFileId12345',
  getName: () => 'Audio_RPT-146_20261121_110000_12.m4a',
  getMimeType: () => 'audio/mp4',
  getSize: () => 77000000,
  setSharing: () => { driveShared146 = true; },
  getParents: () => { let d = 0; return { hasNext: () => d++ === 0, next: () => titleFolder146 }; }
};
sandbox.DriveApp = {
  ...origDriveApp146,
  getFoldersByName: () => ({ hasNext: () => true, next: () => rootArsip146 }),
  getFileById: (id) => {
    if (id === '1DriveAudio73MbFileId12345') return mockAudioDriveFile146;
    if (id === '1OutsideFolderAudioFileId999') return {
      getId: () => id, getName: () => 'evil.m4a', getSize: () => 1000, setSharing: () => {},
      getParents: () => ({ hasNext: () => false })
    };
    return origDriveApp146.getFileById(id);
  }
};
sandbox.UrlFetchApp.fetch = (url, opts) => {
  fetchLog146.push({ url: String(url), opts: opts || {} });
  if (String(url).includes('googleapis.com/upload/drive/v3/files')) {
    return {
      getResponseCode: () => 200,
      getAllHeaders: () => ({ Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mockSess146' }),
      getContentText: () => ''
    };
  }
  return {
    getResponseCode: () => 202,
    getContentText: () => JSON.stringify({ status: 'accepted', job_id: 'mock' })
  };
};
try {
  const initOk = reqAdminCall('initAudioDriveUploadSession', [{
    id_rapat: 'RPT-146',
    agenda: 'Rapat Panitera Pengganti',
    tgl_rapat_iso: '2026-11-21',
    file_name: 'Rapat Panitera Pengganti.m4a',
    mime_type: 'audio/x-m4a',
    file_size: 77000000,
    origin: 'https://sso.pa-indramayu.go.id'
  }, adm.data.nip, adm.token]);
  assert.strictEqual(initOk.status, 'success', 'initAudioDriveUploadSession must succeed for 77 MB M4A');
  assert(initOk.data.upload_url.includes('upload_id=mockSess146'));
  assert.strictEqual(initOk.data.mime_type, 'audio/mp4', 'audio/x-m4a must normalize to audio/mp4');
  assert.strictEqual(initOk.data.folder_path, 'Arsip Foto Rapat TRANSKEP / 2026 / November / 21 Nov - Rapat Panitera Pengganti [146]');

  const init1113 = reqAdminCall('initAudioDriveUploadSession', [{
    id_rapat: 'RPT-1795142607875',
    agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
    tgl_rapat_iso: '2026-11-20',
    no_urut_surat: '1113',
    file_name: 'a.m4a',
    mime_type: 'audio/mp4',
    file_size: 25000000
  }, adm.data.nip, adm.token]);
  const init1114 = reqAdminCall('initAudioDriveUploadSession', [{
    id_rapat: 'RPT-1795397439551',
    agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
    tgl_rapat_iso: '2026-11-20',
    nomor_undangan: '1114/KPA.W10-A2/HK2.6/XI/2026',
    file_name: 'b.m4a',
    mime_type: 'audio/mp4',
    file_size: 25000000
  }, adm.data.nip, adm.token]);
  assert.strictEqual(
    init1113.data.folder_path,
    'Arsip Foto Rapat TRANSKEP / 2026 / November / No. 1113 - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan'
  );
  assert.strictEqual(
    init1114.data.folder_path,
    'Arsip Foto Rapat TRANSKEP / 2026 / November / No. 1114 - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan'
  );
  const driveCall146 = fetchLog146.find((x) => x.url.includes('googleapis.com/upload/drive/v3/files'));
  assert(driveCall146 && driveCall146.opts.headers.Origin === 'https://sso.pa-indramayu.go.id', 'Drive Resumable init must forward safe Origin for browser CORS PUT');

  const finOutside = reqAdminCall('finalizeAudioDriveUpload', [{ file_id: '1OutsideFolderAudioFileId999' }, adm.data.nip, adm.token]);
  assert.strictEqual(finOutside.status, 'error', 'finalizeAudioDriveUpload must block files outside Arsip Foto Rapat TRANSKEP');

  const finOk = reqAdminCall('finalizeAudioDriveUpload', [{ file_id: '1DriveAudio73MbFileId12345', folder_path: initOk.data.folder_path }, adm.data.nip, adm.token]);
  assert.strictEqual(finOk.status, 'success');
  assert.strictEqual(driveShared146, true, 'finalizeAudioDriveUpload must lock Drive file sharing to PRIVATE');

  const aiStartRes = reqAdminCall('generateAiNotulenRapat', [{
    id_rapat: 'RPT-146',
    agenda: 'Rapat Panitera Pengganti',
    peserta_list: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Panitera' }],
    audio_drive_file_id: '1DriveAudio73MbFileId12345',
    async_mode: true
  }, adm.data.nip, adm.token]);
  assert.strictEqual(aiStartRes.status, 'processing', 'Large Drive audio must trigger async job_id flow');
  assert(/^AINOT-\d+/.test(aiStartRes.job_id));

  const badCb = JSON.parse(sandbox.handleApiPost_({
    action: 'callbackAiNotulenJob',
    secret_key: 'WRONG_KEY',
    job_id: aiStartRes.job_id,
    status: 'success',
    data: {}
  }).getContent());
  assert.strictEqual(badCb.status, 'error', 'callbackAiNotulenJob must reject invalid secret_key');

  const configuredWebhookKey = sandbox.PropertiesService.getScriptProperties().getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026';
  const okCb = JSON.parse(sandbox.handleApiPost_({
    action: 'callbackAiNotulenJob',
    secret_key: configuredWebhookKey,
    job_id: aiStartRes.job_id,
    id_rapat: 'RPT-146',
    status: 'success',
    model: 'models/gemini-3.8-flash',
    data: {
      pengarahan_umum: 'Evaluasi berkas perkara tepat waktu.',
      kesimpulan: 'Seluruh PP menyelesaikan BAS 1x24 jam.',
      transkrip_ringkas: 'X'.repeat(95000),
      pembahasan: [{ pembicara_nama: 'Atasan Satu', uraian: ['Monitoring BAS'], tindak_lanjut: ['Cek harian'], target: '100%', penanggung_jawab: 'Panitera', tanggal_penyelesaian: 'Segera' }]
    }
  }).getContent());
  assert.strictEqual(okCb.status, 'success');

  const pollRes = reqAdminCall('checkAiNotulenJobStatus', [aiStartRes.job_id, adm.data.nip, adm.token]);
  assert.strictEqual(pollRes.status, 'success', 'checkAiNotulenJobStatus must return completed Notula from cache');
  assert.strictEqual(pollRes.data.pembahasan[0].pembicara_nip, '197901012003011008', 'Callback normalizer must enrich speaker NIP from cached peserta_list');
  assert(pollRes.data.transkrip_ringkas.length < 20000, 'putAiNotulenJobCache_ must clamp oversized transcript so CacheService never exceeds 100 KB');
} finally {
  sandbox.UrlFetchApp.fetch = origFetch146;
  sandbox.ScriptApp = origScriptApp146;
  sandbox.DriveApp = origDriveApp146;
}

// Verify frontend modules/eoffice/eoffice_data.js Resumable Chunked Upload + modules/eoffice/rapat.js 2 GB handling
const largeFileStub = { name: 'Rapat Kepaniteraan.m4a', type: 'audio/x-m4a', size: 77000000, slice: (a, b) => ({ size: b - a }) };
assert(fs.readFileSync('modules/eoffice/rapat.js', 'utf8').includes('2 * 1024 * 1024 * 1024') &&
  fs.readFileSync('modules/eoffice/rapat.js', 'utf8').includes('uploadAudioFileToDriveResumable') &&
  fs.readFileSync('modules/eoffice/rapat.js', 'utf8').includes('checkAiNotulenJobStatus'),
'modules/eoffice/rapat.js must support 2 GB Resumable Upload & Async Polling');

const dataSvcSandbox = {
  console, Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, setTimeout,
  location: { origin: 'https://sso.pa-indramayu.go.id' },
  localStorage: { getItem: () => '' },
  TranskepAPI: {
    call: async (method) => {
      if (method === 'initAudioDriveUploadSession') {
        return {
          status: 'success',
          data: {
            upload_url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=mock146',
            file_name: 'Audio_RPT-146.m4a',
            mime_type: 'audio/mp4',
            folder_path: 'Arsip Foto Rapat TRANSKEP / 2026 / November / Rapat Kepaniteraan'
          }
        };
      }
      if (method === 'finalizeAudioDriveUpload') {
        return {
          status: 'success',
          data: {
            file_id: '1ResumableDriveFileId12345',
            url: 'https://drive.google.com/file/d/1ResumableDriveFileId12345/view',
            file_name: 'Audio_RPT-146.m4a',
            mime_type: 'audio/mp4',
            size_bytes: 77000000,
            folder_path: 'Arsip Foto Rapat TRANSKEP / 2026 / November / Rapat Kepaniteraan'
          }
        };
      }
      return { status: 'error' };
    }
  },
  XMLHttpRequest: function MockXHR146() {
    const hdrs = {};
    this.upload = {};
    this.open = () => {};
    this.setRequestHeader = (k, v) => { hdrs[k] = v; };
    this.getResponseHeader = (k) => (k === 'Range' ? 'bytes=0-' + (hdrs['Content-Range'].match(/-(\d+)\//)[1]) : null);
    this.send = () => {
      const m = hdrs['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/);
      const endByte = Number(m[2]);
      const total = Number(m[3]);
      if (this.upload.onprogress) this.upload.onprogress({ lengthComputable: true, loaded: endByte - Number(m[1]) + 1 });
      if (endByte + 1 < total) {
        this.status = 308;
        this.onload();
      } else {
        this.status = 200;
        this.responseText = JSON.stringify({ id: '1ResumableDriveFileId12345', name: 'Audio_RPT-146.m4a' });
        this.onload();
      }
    };
  }
};
dataSvcSandbox.window = dataSvcSandbox;
vm.createContext(dataSvcSandbox);
vm.runInContext(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8'), dataSvcSandbox, { filename: 'modules/eoffice/eoffice_data.js' });

(async () => {
  const progressLog = [];
  const resUp = await dataSvcSandbox.EofficeDataService.uploadAudioFileToDriveResumable(
    largeFileStub,
    { id_rapat: 'RPT-146', agenda: 'Rapat Kepaniteraan', tgl_rapat_iso: '2026-11-21' },
    '198001012005011001',
    'tok',
    (pct) => progressLog.push(pct)
  );
  assert.strictEqual(resUp.status, 'success', 'Resumable chunked Drive upload helper must finish cleanly across 8 MB chunks');
  assert.strictEqual(resUp.data.file_id, '1ResumableDriveFileId12345');
  assert(progressLog.length >= 9 && progressLog[progressLog.length - 1] === 100, 'Progress callback must track 8 MB chunks up to 100%');

  // Tahap 147: Adaptive 16 MB chunk (>100 MB), SKB 2026-2027 Workdays, Uncertain Speaker & Undo
  const giantFileStub = { name: 'Rapat_Akbar.m4a', type: 'audio/mp4', size: 110 * 1024 * 1024, slice: (a, b) => ({ size: b - a }) };
  const giantProgress = [];
  const giantUp = await dataSvcSandbox.EofficeDataService.uploadAudioFileToDriveResumable(
    giantFileStub,
    { id_rapat: 'RPT-147', agenda: 'Rapat Akbar', tgl_rapat_iso: '2026-03-17' },
    '198001012005011001',
    'tok',
    (pct) => giantProgress.push(pct)
  );
  assert.strictEqual(giantUp.status, 'success', 'Adaptive 16 MB chunk upload (>100 MB) must succeed');
  assert(giantProgress.length <= 8 && giantProgress[giantProgress.length - 1] === 100, '>100 MB audio must use adaptive 16 MB chunks');

  assert.strictEqual(sandbox.addWorkdaysSkbRapat_('2026-03-17', 5), '2026-03-31', 'SKB 2026 Lebaran holidays must be skipped when computing +5 workdays');
  assert.strictEqual(sandbox.addWorkdaysSkbRapat_('2027-03-05', 5), '2027-03-22', 'SKB 2027 Lebaran + Nyepi holidays must be skipped when computing +5 workdays');
  assert.strictEqual(sandbox.addWorkdaysSkbRapat_('2026-03-17', 0), '2026-03-17', 'HARI_RAPAT (+0 workdays) must return meeting date');

  const norm147 = sandbox.normalizeAiNotulenResponse_({
    pengarahan_umum: 'Arahan',
    pembahasan: [{
      pembicara_nama: 'Pembicara #2 (Belum Teridentifikasi — Bidang Media)',
      items: [
        { uraian: 'Tugas rutin harian', tindak_lanjut: 'Upload tepat waktu', target_kategori_waktu: 'HARI_RAPAT', penanggung_jawab: 'Panmud', selesai_kategori_waktu: 'HARI_RAPAT' },
        { uraian: 'Siapkan ruang media center', tindak_lanjut: 'Pengadaan sarpras', target_kategori_waktu: 'JANGKA_PENDEK', penanggung_jawab: 'Sekretaris', selesai_kategori_waktu: 'PROYEK_SARANA' }
      ]
    }]
  }, {
    tgl_rapat_iso: '2026-03-17',
    peserta_list: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Ketua' }]
  });
  assert.strictEqual(norm147.pembahasan[0].pembicara_nip, '', 'Uncertain speaker label must never falsely match pegawai NIP');
  assert.strictEqual(norm147.pembahasan[0].items[0].target, '2026-03-17');
  assert.strictEqual(norm147.pembahasan[0].items[1].target, '2026-03-31');
  assert.strictEqual(norm147.pembahasan[0].items[1].tanggal_penyelesaian, '2026-04-15');

  const dom147 = {
    rapatFieldDasarNotula: { value: 'Dasar Lama' },
    rapatFieldPengarahanUmum: { value: 'Arahan Lama' },
    rapatFieldKesimpulan: { value: 'Kesimpulan Lama' },
    rapatFieldAiTranscript: { value: '' },
    rapatPembahasanListContainer: { innerHTML: '' },
    rapatCountPembicara: { innerText: '0' },
    rapatTab3AiUndoBar: { classList: { _s: new Set(['hidden']), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} } },
    btnRapatUndoAiNotulen: { classList: { _s: new Set(['hidden']), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} } },
    btnRapatAiModeMerge: { className: '' },
    btnRapatAiModeReplace: { className: '' },
    rapatAiModeDesc: { innerText: '' },
    rapatAiStatusBadge: { innerText: 'Siap AI Notulis' }
  };
  const vm147 = {
    console, Date, Math, Array, Object, String, Number, Boolean, JSON, Error, RegExp, parseInt,
    localStorage: { getItem: () => '', setItem: () => {} },
    document: { getElementById: (id) => dom147[id] || null },
    vueState: { usersList: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Ketua', role: 'Pegawai' }] },
    showNotify: () => {},
    window: {}
  };
  vm147.window = vm147;
  vm.createContext(vm147);
  vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), vm147, { filename: 'modules/eoffice/rapat.js' });
  assert.strictEqual(vm147.setRapatAiMode('replace'), 'replace');
  assert.strictEqual(vm147.setRapatAiMode('merge'), 'merge');
  vm147.applyAiNotulenToForm({
    pengarahan_umum: 'Arahan Baru AI',
    kesimpulan: 'Kesimpulan Baru AI',
    pembahasan: [{ pembicara_nama: 'Atasan Satu', items: [{ uraian: 'Poin 1', tindak_lanjut: 'TL 1', target: '2026-03-31', penanggung_jawab: 'Ketua', tanggal_penyelesaian: '2026-04-15' }] }]
  }, { aiMode: 'merge' });
  assert.strictEqual(dom147.rapatFieldDasarNotula.value, 'Dasar Lama', 'Merge mode must preserve non-empty Dasar when AI returns blank');
  assert(!dom147.rapatTab3AiUndoBar.classList.contains('hidden'), 'Undo banner must become visible after AI applies changes');
  assert.strictEqual(vm147.undoLastAiNotulenApply(), true, 'Undo must restore previous Tab 3 state');
  assert.strictEqual(dom147.rapatFieldPengarahanUmum.value, 'Arahan Lama');

  console.log('[PASS] Tahap 146 & 147 2 GB Resumable Drive Upload, FFmpeg, 2-Pass Gemini, SKB 2026-2027 & Smart Merge Undo verified.');
  console.log('\n[PASS] ALL Fase 3A tests passed (0 failures).');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
