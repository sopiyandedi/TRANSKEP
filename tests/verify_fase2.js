const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

// 1. Discover & syntax-check all non-ignored GAS backend .js files
const SKIP_DIRS = new Set(['.git', '.github', '.firebase', 'tests', 'n8n', 'core', 'modules', 'scripts', 'node_modules', 'css', 'img', 'vendor']);
function walkGasFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        out = out.concat(walkGasFiles(path.join(dir, entry.name)));
      }
    } else if (entry.name.endsWith('.js') && entry.name !== 'sw.js') {
      out.push(path.join(dir, entry.name).replace(/\\/g, '/').replace(/^\.\//, ''));
    }
  }
  return out;
}

const allGasFiles = walkGasFiles('.').sort();
assert(allGasFiles.length >= 24, `Expected >= 24 backend .js files, found ${allGasFiles.length}`);

for (const f of allGasFiles) {
  const src = fs.readFileSync(f, 'utf8');
  new vm.Script(src, { filename: f });
}
console.log(`[PASS] Syntax check passed across all ${allGasFiles.length} backend GAS files.`);

// 2. Static Fase 2 Security Pattern Checks
const codeSrc = fs.readFileSync('code.js', 'utf8');
assert(!codeSrc.includes('ALLOWALL'), 'code.js doGet must not use XFrameOptionsMode.ALLOWALL');
assert(!codeSrc.includes('TRANSKEP_FALLBACK_MASTER_VAULT_KEY_2026_SECURE'), 'code.js must not contain hardcoded encryption fallback secret');
assert(!codeSrc.includes("'6285139811819'"), 'code.js must not contain hardcoded phone number');
console.log('[PASS] Static Fase 2 assertions passed.');

// 3. Build Comprehensive Mock GAS Sandbox
const propsStore = {
  WAHA_API_KEY: 'test-waha-key',
  ADMIN_TEST_PHONE: '6281200000001',
  TRANSKEP_WEBHOOK_KEY: 'TEST_WEBHOOK_SECRET'
};
let cacheStore = {};
const sentWaCalls = [];
const capturedBlobs = [];
const xFrameModes = [];

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

// Actors:
// Admin:     198001012005011001
// Operator:  198501012010011099
// Atasan:    197901012003011008 (Role: Pegawai/Pejabat, acts as Atasan/Penilai for Pegawai A)
// Pegawai A: 199002022015012002 (Role: Pegawai)
// Pegawai B: 199203032018011004 (Role: Pegawai)
const userRows = [
  ['NIP', 'Nama', 'Jabatan', 'Role', 'No_HP', 'Password', 'S_2024', 'S_2025', 'S_2026', 'Sakit', 'Penting', 'Besar', 'Melahirkan', 'CLTN', 'Pangkat', 'Alamat', 'TMT_KGB', 'TMT_KNP', 'BUP', 'Status_KGB', 'Tgl_Selesai_KGB', 'Status_KNP', 'Tgl_Selesai_KNP', 'Status_Pensiun', 'Tgl_Pensiun', 'Jenis_Jabatan'],
  ['198001012005011001', 'Admin Satu', 'Kasubbag Kepegawaian', 'Admin', '081234567890', 'adminPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata (III/c)', 'Jl. Merdeka 1', '2026-01-01', '2026-01-01', 58, '', '', '', '', '', '', 'Struktural'],
  ['198501012010011099', 'Operator Satu', 'Pranata Komputer', 'Operator', '081211110000', 'opPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata Muda Tk.I (III/b)', 'Jl. Karya 9', '', '', 58, '', '', '', '', '', '', 'Fungsional'],
  ['197901012003011008', 'Atasan Satu', 'Panitera', 'Pegawai', '081377778888', 'atasanPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Pembina (IV/a)', 'Jl. Pahlawan 3', '', '', 60, '', '', '', '', '', '', 'Struktural'],
  ['199002022015012002', 'Pegawai A', 'Staf Umum', 'Pegawai', '081298765432', 'pegAPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata Muda (III/a)', 'Jl. Sudirman 2', '2026-02-01', '', 58, '', '', '', '', '', '', 'Fungsional Umum'],
  ['199203032018011004', 'Pegawai B', 'Staf Arsip', 'Pegawai', '081399991111', 'pegBPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Pengatur (II/c)', 'Jl. Melati 5', '', '', 58, '', '', '', '', '', '', 'Fungsional Umum']
];

const cutiRows = [
  ['ID', 'Waktu', 'NIP', 'Jenis', 'Tgl_Mulai', 'Tgl_Selesai', 'Alasan', 'Status', 'Catatan_Atasan', 'Atasan_NIP', 'Pejabat_NIP', 'Durasi', 'Plh_NIP', 'Status_Atasan', 'Status_Pejabat', 'Alamat', 'History_JSON', 'Bukti_URL', 'Token', 'Nomor_Surat'],
  ['CUTI-A1', '01/11/2026', '199002022015012002', 'Tahunan', '2026-11-16', '2026-11-17', 'Keperluan keluarga', 'Menunggu', '', '197901012003011008', '198001012005011001', 2, '', 'Menunggu', 'Menunggu', 'Jl. Sudirman 2', '{"2026":2}', '', 'magic-a1', ''],
  ['CUTI-A2', '01/11/2026', '199002022015012002', 'Tahunan', '2026-11-18', '2026-11-19', 'Urusan penting', 'Disetujui', '', '197901012003011008', '198001012005011001', 2, '', 'Disetujui', 'Disetujui', 'Jl. Sudirman 2', '{"2026":2}', '', 'magic-a2', '']
];

const ikRows = [
  ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Tipe_Izin', 'Jam', 'Keperluan', 'Atasan_NIP', 'Status', 'Catatan_Atasan'],
  ['IK-A1', '01/11/2026 08:00:00', '199002022015012002', '2026-11-16', 'Keluar Kantor', '10:00', 'Bank', '197901012003011008', 'Menunggu', ''],
  ['IK-A2', '01/11/2026 08:00:00', '199002022015012002', '2026-11-17', 'Keluar Kantor', '11:00', 'Notaris', '197901012003011008', 'Disetujui', 'OK']
];

const ipRows = [
  ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Alamat', 'Alasan', 'Atasan_NIP', 'Status', 'Catatan_Atasan', 'Pejabat_NIP'],
  ['IP-A1', '01/11/2026 08:00:00', '199002022015012002', '2026-11-16', 'Indramayu', 'Dokter', '197901012003011008', 'Menunggu', '', '198001012005011001'],
  ['IP-A2', '01/11/2026 08:00:00', '199002022015012002', '2026-11-17', 'Indramayu', 'Acara', '197901012003011008', 'Disetujui', 'OK', '198001012005011001']
];

const wfhRows = [
  ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Rencana_JSON', 'Laporan_JSON', 'Atasan_NIP', 'Status_Rencana', 'Status_Laporan', 'Catatan', 'Eviden_URL'],
  ['WFH-A1', '01/11/2026 08:00:00', '199002022015012002', '2026-11-16', '[{"tugas":"Susun arsip","target":"50 berkas","jam":"08:00-16:00"}]', '[{"tugas":"Susun arsip","target":"50 berkas","realisasi":"50 berkas","jam":"08:00-16:00"}]', '197901012003011008', 'Menunggu', 'Menunggu', '', ''],
  ['WFH-A2', '01/11/2026 08:00:00', '199002022015012002', '2026-11-17', '[{"tugas":"Input data","target":"100","jam":"08:00"}]', '[]', '197901012003011008', 'Disetujui', 'Menunggu', '', '']
];

const stRows = [
  ['id', 'waktu', 'nomor', 'menimbang', 'dasar', 'tujuan', 'tempat', 'tgl_mulai', 'tgl_selesai', 'jam', 'peserta', 'pejabat_ttd', 'status', 'data_ekstra'],
  ['ST-1', '2026-11-01', '', 'm', 'd', 'Rapat', 'Aula', '2026-11-20', '2026-11-20', '09:00', '[]', '198001012005011001', 'PROSES', '{}']
];

const pkpDocRows = [
  ['id_pkp', 'nip', 'penilai', 'tahun', 'status', 'nilai', 'timestamp', 'atasan_pejabat'],
  ['PKP-A1', "'199002022015012002", "'197901012003011008", '2026', 'Draft', '0', '2026-01-05', "'198001012005011001"],
  ['PKP-B1', "'199203032018011004", "'197901012003011008", '2026', 'Draft', '0', '2026-01-06', "'198001012005011001"]
];

const pkpRenRows = [
  ['id_item', 'id_pkp', 'jenis', 'sasaran', 'indikator', 'kuantitas', 'satuan', 'mutu', 'waktu', 'pagu', 'status', 'timestamp'],
  ['ITEM-A1', 'PKP-A1', 'Utama', 'Layanan Persidangan', 'Dokumen selesai', '10', 'Berkas', '100', '12', '0', 'Aktif', '2026-01-05']
];

const pckDocRows = [
  ['id_pck', 'nip', 'bulan', 'tahun', 'rencana', 'progress', 'status', 'nilai_akhir'],
  ['PCK-A1', "'199002022015012002", 'Januari', '2026', '10', '10', 'Draft', '95'],
  ['PCK-B1', "'199203032018011004", 'Januari', '2026', '10', '10', 'Draft', '92']
];

const pckRealRows = [
  ['id_real', 'id_pck', 'id_item', 'realisasi', 'mutu', 'keterangan'],
  ['REAL-A1', 'PCK-A1', 'ITEM-A1', '10', '100', 'Selesai']
];

const ekinerjaRows = [
  ['ID_Kinerja', 'NIP_Pegawai', 'NIP_Penilai', 'Tahun', 'Periode', 'Predikat', 'URL_Penilaian', 'URL_Evaluasi', 'Status', 'Tgl_TTE', 'File_Pengesahan', 'Tgl_Input'],
  ['SKP-1', '199002022015012002', '197901012003011008', '2026', 'Tahunan', 'Sangat Baik<script>alert(1)</script>', 'javascript:alert(1)', 'https://drive.google.com/eva1', 'Menunggu TTE', '-', '-', '01/11/2026']
];

const mockSheets = {
  user_data: createMockSheet('user_data', userRows),
  cuti_log: createMockSheet('cuti_log', cutiRows),
  izin_keluar_log: createMockSheet('izin_keluar_log', ikRows),
  izin_pribadi_log: createMockSheet('izin_pribadi_log', ipRows),
  wfh_log: createMockSheet('wfh_log', wfhRows),
  st_log: createMockSheet('st_log', stRows),
  pkp_dokumen: createMockSheet('pkp_dokumen', pkpDocRows),
  pkp_rencana: createMockSheet('pkp_rencana', pkpRenRows),
  pkp_evaluasi: createMockSheet('pkp_evaluasi', [['id_eval', 'id_item', 'periode', 'capaian', 'catatan', 'timestamp']]),
  pck_dokumen: createMockSheet('pck_dokumen', pckDocRows),
  pck_realisasi: createMockSheet('pck_realisasi', pckRealRows),
  ekinerja_data: createMockSheet('ekinerja_data', ekinerjaRows),
  jobdes_data: createMockSheet('jobdes_data', [['NIP', 'Atasan_NIP', 'Dasar_Lampiran', 'Ikhtisar_Jabatan', 'Tugas_Pokok', 'Tugas_Tambahan', 'Tanggung_Jawab', 'Hasil_Kerja']]),
  usulan_jobdes_data: createMockSheet('usulan_jobdes_data', [['Timestamp_ID', 'NIP_Pegawai', 'Nama_Pegawai', 'Nama_Pengusul', 'Isi_Usulan', 'Status'], ['USL-1', '199002022015012002', 'Pegawai A', 'Pegawai A', 'Usulan awal', 'Menunggu']]),
  log_reset_pass: createMockSheet('log_reset_pass', [['ID_Req', 'Timestamp', 'NIP', 'Nama', 'No_WA', 'Status', 'OTP_Hash', 'Expired']]),
  hari_libur: createMockSheet('hari_libur', [['Tanggal', 'Keterangan']])
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

let blobCounter = 0;
function makeMockBlob(rawData, mimeType, name) {
  const strData = Array.isArray(rawData) ? fromSignedBytes(rawData).toString('utf8') : String(rawData || '');
  const obj = {
    _str: strData,
    _mime: mimeType || 'text/plain',
    _name: name || 'file',
    getDataAsString: () => obj._str,
    getBytes: () => toSignedBytes(Buffer.from(obj._str, 'utf8')),
    getName: () => obj._name,
    setName: (n) => { obj._name = n; return obj; },
    getContentType: () => obj._mime,
    getAs: (targetMime) => {
      const pdfBlob = makeMockBlob(obj._str, targetMime, obj._name.replace(/\.html$/i, '.pdf'));
      capturedBlobs.push({ kind: 'pdf_from_html', html: obj._str, name: pdfBlob._name });
      return pdfBlob;
    }
  };
  return obj;
}

const makeMockFile = (blob) => {
  blobCounter += 1;
  const id = 'file-' + blobCounter;
  const fileObj = {
    getId: () => id,
    getUrl: () => 'https://drive.google.com/file/d/' + id,
    setSharing: () => {},
    setTrashed: () => {},
    makeCopy: (name) => makeMockFile(makeMockBlob('COPY', 'application/vnd.google-apps.document', name)),
    getAs: (mime) => makeMockBlob('PDF_BYTES', mime || 'application/pdf', (blob ? blob.getName() : 'doc') + '.pdf'),
    getBlob: () => makeMockBlob('PDF_BYTES', 'application/pdf', blob ? blob.getName() : 'doc.pdf')
  };
  return fileObj;
};

const mockFolder = {
  createFile: (blob) => makeMockFile(blob),
  getFiles: () => ({ hasNext: () => false }),
  getFilesByName: () => ({ hasNext: () => false })
};

let forcePropsThrow = false;
const sandbox = {
  console,
  Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  MimeType: { HTML: 'text/html', PDF: 'application/pdf' },
  Logger: { log: () => {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSS,
    openById: () => mockSS,
    flush: () => {}
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createTemplateFromFile: () => ({
      evaluate: () => {
        const htmlOut = {
          setTitle: () => htmlOut,
          addMetaTag: () => htmlOut,
          setXFrameOptionsMode: (mode) => { xFrameModes.push(mode); return htmlOut; }
        };
        return htmlOut;
      }
    })
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFoldersByName: () => ({ hasNext: () => true, next: () => mockFolder }),
    getFolderById: () => mockFolder,
    createFolder: () => mockFolder,
    createFile: (blob) => makeMockFile(blob),
    getFileById: () => makeMockFile(null)
  },
  DocumentApp: {
    openById: () => ({
      getBody: () => ({
        setMarginTop: () => {},
        setMarginBottom: () => {},
        setMarginLeft: () => {},
        setMarginRight: () => {},
        replaceText: () => {},
        getTables: () => []
      }),
      saveAndClose: () => {}
    })
  },
  PropertiesService: {
    getScriptProperties: () => {
      if (forcePropsThrow) throw new Error('Simulated PropertiesService outage');
      return {
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(propsStore, k) ? propsStore[k] : null),
        setProperty: (k, v) => { propsStore[k] = String(v); },
        getProperties: () => ({ ...propsStore })
      };
    }
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
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt, _raw: txt }) })
  },
  UrlFetchApp: {
    fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    formatDate: (d) => d.toISOString().slice(0, 10),
    computeDigest: (_alg, val) => toSignedBytes(crypto.createHash('sha256').update(String(val), 'utf8').digest()),
    computeHmacSha256Signature: (val, key) => toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(val), 'utf8').digest()),
    base64Encode: (input) => {
      const buf = Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8');
      return buf.toString('base64');
    },
    base64Decode: (b64) => toSignedBytes(Buffer.from(String(b64), 'base64')),
    base64EncodeWebSafe: (input) => {
      const buf = Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8');
      return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64DecodeWebSafe: (b64) => {
      const std = String(b64).replace(/-/g, '+').replace(/_/g, '/');
      return toSignedBytes(Buffer.from(std, 'base64'));
    },
    newBlob: (data, mime, name) => makeMockBlob(data, mime, name)
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of allGasFiles) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}

// Stub WAHA & external sync helpers after script load
sandbox.sendWhatsAppMessage_ = (phone, text) => { sentWaCalls.push({ phone, text }); return { status: 'success' }; };
sandbox.triggerN8nSuratTugas_ = () => {};
sandbox.triggerN8nSuratKeluarCuti_ = () => {};

// Helper to parse ContentService JSON responses
const parseResp = (r) => JSON.parse(r._raw);
const rpc = (method, args, auth) => parseResp(sandbox.handleApiPost_({
  action: 'call',
  method,
  args,
  nip: auth ? auth.nip : '',
  token: auth ? auth.token : ''
}));

// Bootstrap sessions before testing lockout
const adm = sandbox.verifyLogin('198001012005011001', 'adminPass123');
const op = sandbox.verifyLogin('198501012010011099', 'opPass123');
const atasan = sandbox.verifyLogin('197901012003011008', 'atasanPass123');
const pegA = sandbox.verifyLogin('199002022015012002', 'pegAPass123');
const pegB = sandbox.verifyLogin('199203032018011004', 'pegBPass123');
for (const [label, res] of [['Admin', adm], ['Operator', op], ['Atasan', atasan], ['Pegawai A', pegA], ['Pegawai B', pegB]]) {
  assert.strictEqual(res.status, 'success', `${label} login must succeed`);
}
console.log('[PASS] Bootstrap login for Admin, Operator, Atasan, Pegawai A, Pegawai B succeeded.');

// Test 1: doGet Frame Protection
sandbox.doGet({});
assert.strictEqual(xFrameModes[xFrameModes.length - 1], 'DEFAULT', 'doGet must use XFrameOptionsMode.DEFAULT');

// Test 2: Encryption secret fail-closed
const prevCachedSecret = sandbox._cachedEncSecret_;
sandbox._cachedEncSecret_ = null;
forcePropsThrow = true;
assert.throws(() => sandbox.getEncryptionSecret_(), /TRANSKEP_ENC_SECRET/, 'getEncryptionSecret_ must throw on PropertiesService failure');
forcePropsThrow = false;
sandbox._cachedEncSecret_ = prevCachedSecret;
console.log('[PASS] doGet XFrameOptionsMode.DEFAULT & fail-closed encryption secret verified.');

// Test 3: Login Brute-Force Lockout & Reset on Valid Login
for (let i = 0; i < 5; i++) {
  const failRes = sandbox.verifyLogin('199203032018011004', 'wrong-' + i);
  assert.strictEqual(failRes.status, 'error');
}
// 6th attempt even with VALID password MUST be locked out
const lockedRes = sandbox.verifyLogin('199203032018011004', 'pegBPass123');
assert.strictEqual(lockedRes.status, 'error');
assert(/dikunci sementara/i.test(lockedRes.message), '6th login attempt must hit lockout: ' + lockedRes.message);
// Clear lockout cache & verify valid login works and resets partial attempts
sandbox.clearRateLimit_('login_199203032018011004');
assert.strictEqual(sandbox.verifyLogin('199203032018011004', 'wrong-once').status, 'error');
assert(cacheStore['rl_cnt_login_199203032018011004'], 'Partial login failure must record rl_cnt key');
assert.strictEqual(sandbox.verifyLogin('199203032018011004', 'pegBPass123').status, 'success');
assert(!cacheStore['rl_cnt_login_199203032018011004'] && !cacheStore['rl_lock_login_199203032018011004'], 'Valid login must clear rate-limit counter');
console.log('[PASS] Login brute-force 5-attempt lockout & counter reset verified.');

// Test 4: Password Reset OTP Cooldown & Formula Neutralization
const r1 = sandbox.requestPasswordReset('081399991111');
assert.strictEqual(r1.status, 'success', 'First OTP reset should succeed');
const r2Cd = sandbox.requestPasswordReset('081399991111');
assert.strictEqual(r2Cd.status, 'error');
assert(/tunggu 60 detik/i.test(r2Cd.message), 'Immediate second OTP reset must hit 60s cooldown');
// Clear cooldown twice to hit per-number 2/10min limit
sandbox.clearRateLimit_('pwd_reset_cd_399991111');
assert.strictEqual(sandbox.requestPasswordReset('081399991111').status, 'success');
sandbox.clearRateLimit_('pwd_reset_cd_399991111');
const r3Cap = sandbox.requestPasswordReset('081399991111');
assert.strictEqual(r3Cap.status, 'error', '3rd OTP request within 10m must exceed per-number limit');
// Re-login Pegawai B after OTP reset so token stays fresh
const pegBOtp = sentWaCalls[sentWaCalls.length - 1].text.match(/TR-[A-Z0-9]{6,12}/)[0];
const pegB2 = sandbox.verifyLogin('199203032018011004', pegBOtp);
assert.strictEqual(pegB2.status, 'success');
console.log('[PASS] Password reset 60s cooldown & 2/10min limit verified.');

// Test 5: Dashboard RBAC (forwardTmtDateByFrontend) & Formula Sanitization
const fwdDeny = sandbox.forwardTmtDateByFrontend(pegA.data.nip, pegA.data.nip, 'KGB', '2028-01-01', pegA.token);
assert.strictEqual(fwdDeny.status, 'error', 'Pegawai must be blocked from forwardTmtDateByFrontend');
const fwdOp = sandbox.forwardTmtDateByFrontend(op.data.nip, pegA.data.nip, 'KGB', '=CMD()', op.token);
assert.strictEqual(fwdOp.status, 'success', 'Operator must be allowed to forward TMT');
assert.strictEqual(userRows[4][16], "'=CMD()", 'Formula payload in forwardTmtDateByFrontend must be neutralized');
console.log('[PASS] Dashboard forwardTmtDateByFrontend RBAC & formula sanitization verified.');

// Test 6: Cuti IDOR, Formula Sanitization & processBulkApproval status accounting
const cutiCrossAdd = sandbox.addCutiLog({
  nip: pegB.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-11-23', tgl_selesai: '2026-11-23',
  alasan: 'Tes', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Addr'
}, pegA.data.nip, pegA.token);
assert.strictEqual(cutiCrossAdd.status, 'error', 'Pegawai A cannot submit cuti for Pegawai B NIP');

const cutiCrossUpd = sandbox.updateCutiLog({
  id: 'CUTI-A1', nip: pegB.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-11-16', tgl_selesai: '2026-11-16',
  alasan: '=HYPERLINK("x")', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Addr'
}, pegB.data.nip, pegB2.token);
assert.strictEqual(cutiCrossUpd.status, 'error', 'Pegawai B cannot update Pegawai A cuti');

const cutiOwnUpd = sandbox.updateCutiLog({
  id: 'CUTI-A1', nip: pegA.data.nip, jenis: 'Tahunan', tgl_mulai: '2026-11-16', tgl_selesai: '2026-11-16',
  alasan: '+cmd|calc', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip, alamat: 'Jl. Baru'
}, pegA.data.nip, pegA.token);
assert.strictEqual(cutiOwnUpd.status, 'success', 'Pegawai A can update own pending cuti: ' + (cutiOwnUpd.message || ''));
assert.strictEqual(cutiRows[1][6], "'+cmd|calc", 'updateCutiLog must sanitize formula injection in alasan');

const cutiCrossCancel = sandbox.requestCancelCuti('CUTI-A2', 'Batal palsu', pegB.data.nip, pegB2.token);
assert.strictEqual(cutiCrossCancel.status, 'error', 'Pegawai B cannot request cancel on Pegawai A cuti');

const cutiInvalidDecision = sandbox.updateCutiStatus('CUTI-A1', 'HACKED', 'notes', atasan.data.nip, false, atasan.token);
assert.strictEqual(cutiInvalidDecision.status, 'error', 'Invalid cuti decision must fail');

// processBulkApproval called by unauthorized Pegawai B must fail and report 0 successes!
const bulkDeny = sandbox.processBulkApproval([{ id: 'CUTI-A1', type: 'Cuti' }], 'Disetujui', '=1+1', pegB.data.nip, false, pegB2.token);
assert.strictEqual(bulkDeny.status, 'error', 'Unauthorized processBulkApproval must return status error when 0 succeed');
console.log('[PASS] Cuti IDOR, decision allowlist & bulk accounting verified.');

// Test 7: IK, IP, WFH Access Controls, bypassMode & forceDelete Admin Gates
// Pegawai B blocked on get*ById via RPC
assert.strictEqual(rpc('getIzinKeluarById', ['IK-A1'], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');
assert.strictEqual(rpc('getIzinPribadiById', ['IP-A1'], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');
assert.strictEqual(rpc('getRencanaWFHById', ['WFH-A1'], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');
// Pegawai A & Atasan allowed on get*ById via RPC
assert.strictEqual(rpc('getIzinKeluarById', ['IK-A1'], { nip: pegA.data.nip, token: pegA.token }).status, 'success');
assert.strictEqual(rpc('getIzinPribadiById', ['IP-A1'], { nip: atasan.data.nip, token: atasan.token }).status, 'success');
assert.strictEqual(rpc('getRencanaWFHById', ['WFH-A1'], { nip: atasan.data.nip, token: atasan.token }).status, 'success');

// Cross-user mutations & non-admin bypassMode/forceDelete denied
assert.strictEqual(sandbox.updateIkStatus('IK-A1', 'Disetujui', 'OK', pegB.data.nip, false, pegB2.token).status, 'error');
assert.strictEqual(sandbox.updateIkStatus('IK-A1', 'Disetujui', 'OK', atasan.data.nip, true, atasan.token).status, 'error', 'Non-admin cannot use bypassMode on IK');
assert.strictEqual(sandbox.updateIpStatus('IP-A1', 'Disetujui', 'OK', atasan.data.nip, true, atasan.token).status, 'error', 'Non-admin cannot use bypassMode on IP');
assert.strictEqual(sandbox.updateWfhStatus('WFH-A1', 'Rencana', 'Disetujui', 'OK', atasan.data.nip, true, atasan.token).status, 'error', 'Non-admin cannot use bypassMode on WFH');

assert.strictEqual(sandbox.deleteIzinKeluarLog('IK-A2', true, pegA.data.nip, pegA.token).status, 'error', 'Non-admin cannot forceDelete IK');
assert.strictEqual(sandbox.deleteIzinPribadiLog('IP-A2', true, pegA.data.nip, pegA.token).status, 'error', 'Non-admin cannot forceDelete IP');
assert.strictEqual(sandbox.deleteWfhLog('WFH-A2', true, pegA.data.nip, pegA.token).status, 'error', 'Non-admin cannot forceDelete WFH');
assert.strictEqual(sandbox.deleteIzinKeluarLog('IK-A1', false, pegB.data.nip, pegB2.token).status, 'error', 'Pegawai B cannot delete Pegawai A IK');

assert.strictEqual(sandbox.updateIzinKeluarLog({ id: 'IK-A1', tanggal: '2026-11-16', tipe_izin: 'Dinas', jam: '12:00', alasan: 'Tes', atasan_nip: atasan.data.nip }, pegB.data.nip ? pegB2.token : '').status, 'error');
// Explicitly test Pegawai B token against updateIzinKeluarLog / updateIzinPribadiLog / updateRencanaWfhLog using RPC active session (since payload lacks actorNip)
assert.strictEqual(rpc('updateIzinKeluarLog', [{ id: 'IK-A1', tanggal: '2026-11-16', tipe_izin: 'Dinas', jam: '12:00', alasan: 'Hack', atasan_nip: atasan.data.nip }, pegB2.token], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');
assert.strictEqual(rpc('updateIzinPribadiLog', [{ id: 'IP-A1', tanggal: '2026-11-16', alamat: 'X', alasan: 'Hack', atasan_nip: atasan.data.nip, pejabat_nip: adm.data.nip }, pegB2.token], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');
assert.strictEqual(rpc('updateRencanaWfhLog', [{ id: 'WFH-A1', tanggal: '2026-11-16', rencana_json: '[]', atasan_nip: atasan.data.nip }, pegB2.token], { nip: pegB.data.nip, token: pegB2.token }).status, 'error');

// WFH PDF IDOR denied for Pegawai B, allowed for Atasan/Owner
assert.strictEqual(sandbox.generatePdfLaporanWFH('WFH-A1', pegB.data.nip, pegB2.token).status, 'error');
assert.strictEqual(sandbox.generatePdfRencanaWFH('WFH-A1', pegB.data.nip, pegB2.token).status, 'error');
assert.strictEqual(sandbox.generatePdfLaporanWFH('WFH-A1', pegA.data.nip, pegA.token).status, 'success');
console.log('[PASS] IK/IP/WFH IDOR, bypassMode, forceDelete & PDF access checks verified.');

// Test 8: Surat Tugas (ST), Jobdes, SK, SOP Admin Gates & Formula/HTML Sanitization
assert.strictEqual(sandbox.addSuratTugas({ tujuan: 'T', tempat: 'P', tgl_mulai: '2026-11-20', tgl_selesai: '2026-11-20', peserta: [] }, pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.updateSuratTugas({ id: 'ST-1', tujuan: 'T' }, pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.deleteSuratTugasLog('ST-1', pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.saveSettingsST({ ppk: 'X' }, pegA.data.nip, pegA.token).status, 'error');
// Direct unauthenticated calls to getSuratTugasData / getSettingsST fail closed
assert.strictEqual(JSON.stringify(sandbox.getSuratTugasData()), '[]', 'Unauthenticated getSuratTugasData must return []');
assert.strictEqual(sandbox.getSettingsST().status, 'error', 'Unauthenticated getSettingsST must return error');
// Authenticated Admin succeeds
assert.strictEqual(sandbox.updateSuratTugas({ id_st: 'ST-1', nomor_surat: '01/ST', menimbang: 'm', dasar: 'd', tujuan: '=EVIL()', tempat: 'Aula', tgl_mulai: '2026-11-20', tgl_selesai: '2026-11-20', jam: '09:00', peserta_json: '[]', pejabat_ttd: adm.data.nip, data_ekstra_json: '{}' }, op.data.nip, op.token).status, 'success');
assert.strictEqual(stRows[1][5], "'=EVIL()", 'updateSuratTugas must sanitize formula cells');

// Jobdes
assert.strictEqual(sandbox.saveJobdes({ nip: pegA.data.nip, ikhtisar_jabatan: '=BAD' }, pegA.data.nip, pegA.token).status, 'error', 'Pegawai cannot call saveJobdes');
assert.strictEqual(JSON.stringify(sandbox.getUsulanMenunggu(pegA.data.nip, pegA.token)), '[]', 'Pegawai cannot read getUsulanMenunggu');
assert.strictEqual(sandbox.tandaiUsulanSelesai('USL-1', pegA.data.nip, pegA.token).status, 'error', 'Pegawai cannot call tandaiUsulanSelesai');
assert.strictEqual(sandbox.saveUsulanReposisi({ nip_pegawai: pegA.data.nip, nama_pegawai: 'Pegawai A', nama_pengusul: 'Pegawai A', isi_usulan: '=1+2' }, pegA.data.nip, pegA.token).status, 'success');
assert.strictEqual(mockSheets.usulan_jobdes_data._rows[2][4], "'=1+2", 'saveUsulanReposisi must sanitize formula input');

// createPdfJobdes HTML XSS strip
const blobsBeforeJobdes = capturedBlobs.length;
const pdfJob = sandbox.createPdfJobdes('<div>Job<script>alert(1)</script><img src=x onerror="steal()"><a href="javascript:alert(2)">k</a></div>', '../../evil', pegA.data.nip, pegA.token);
assert.strictEqual(pdfJob.status, 'success');
const renderedJobHtml = capturedBlobs[blobsBeforeJobdes].html;
assert(!renderedJobHtml.includes('<script') && !renderedJobHtml.includes('onerror') && !renderedJobHtml.includes('javascript:'), 'createPdfJobdes must strip XSS vectors');

// SK & SOP Admin gates + Pegawai acknowledge allowed
assert.strictEqual(sandbox.getSkDriveFolderUrl(pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.saveSk({}, pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.deleteSk('SK-1', pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.acknowledgeSk('SK-1', pegA.data.nip, pegA.token).status, 'success', 'Pegawai acknowledgeSk must remain allowed');

assert.strictEqual(sandbox.getSopDriveFolderUrl(pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.saveSopData({}, pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.deleteSopData('SOP-1', pegA.data.nip, pegA.token).status, 'error');
assert.strictEqual(sandbox.acknowledgeSop('SOP-1', pegA.data.nip, pegA.token).status, 'success', 'Pegawai acknowledgeSop must remain allowed');
assert.strictEqual(sandbox.deleteSk('SK-1', op.data.nip, op.token).status, 'success', 'Operator deleteSk must be allowed');
console.log('[PASS] ST, Jobdes, SK, SOP RBAC & XSS/Formula protections verified.');

// Test 9: PKP & PCK Anti-Role-Spoofing & IDOR
// Pegawai A sends spoofed userRole='Admin' -> must STILL only see PKP-A1 / PCK-A1!
const pkpSpoof = sandbox.getDataDokumenPKP(pegA.data.nip, 'Admin', pegA.token);
assert.strictEqual(pkpSpoof.length, 1, 'Role spoofing on getDataDokumenPKP must NOT return other users');
assert.strictEqual(pkpSpoof[0].id_pkp, 'PKP-A1');
const pckSpoof = sandbox.getDataDokumenPCK(pegA.data.nip, 'Operator', pegA.token);
assert.strictEqual(pckSpoof.length, 1, 'Role spoofing on getDataDokumenPCK must NOT return other users');
assert.strictEqual(pckSpoof[0].id_pck, 'PCK-A1');
// Penilai (atasan) sees both A1 & B1
assert.strictEqual(sandbox.getDataDokumenPKP(atasan.data.nip, 'Pegawai', atasan.token).length, 2, 'Penilai must see bawahan PKPs');
assert.strictEqual(sandbox.getDataDokumenPCK(atasan.data.nip, 'Pegawai', atasan.token).length, 2, 'Penilai must see bawahan PCKs');

// Detail / Print / PDF IDOR checks
assert.strictEqual(sandbox.getDetailPKP('PKP-B1', pegA.data.nip, pegA.token).success, false, 'Pegawai A cannot view Pegawai B getDetailPKP');
assert.strictEqual(sandbox.getDetailPKP('PKP-A1', pegA.data.nip, pegA.token).success, true, 'Pegawai A can view own getDetailPKP');
assert.strictEqual(sandbox.getDetailLengkapPCK(pegB.data.nip, 'Januari', '2026', pegA.data.nip, pegA.token).success, false, 'Pegawai A cannot view Pegawai B getDetailLengkapPCK');
assert.strictEqual(sandbox.getDetailPrintPCK('PCK-B1', pegA.data.nip, pegA.token).success, false, 'Pegawai A cannot view Pegawai B getDetailPrintPCK');
assert.strictEqual(sandbox.generatePdfPK('PKP-B1', pegA.data.nip, pegA.token).status, 'error', 'Pegawai A cannot generate PDF PK for Pegawai B');
assert.strictEqual(sandbox.generatePdfPCK('PCK-B1', pegA.data.nip, pegA.token).status, 'error', 'Pegawai A cannot generate PDF PCK for Pegawai B');

// Legacy helpers fail-closed when unauthenticated, and enforce ownership/penilai with active session
assert.strictEqual(JSON.stringify(sandbox.getItemsPKP('PKP-A1')), '[]', 'Unauthenticated getItemsPKP must fail closed');
assert.strictEqual(sandbox.sahkanDokumenPKP('PKP-A1', '90').success, false, 'Unauthenticated sahkanDokumenPKP must fail');
assert.strictEqual(rpc('getItemsPKP', ['PKP-A1'], { nip: pegA.data.nip, token: pegA.token }).status, 'error', 'Unallowlisted legacy RPC must remain blocked');
sandbox.setActiveSession_({ nip: pegA.data.nip, role: 'Pegawai', jti: 'test' });
assert.strictEqual(sandbox.getItemsPKP('PKP-A1').length, 1, 'Authenticated owner can read own items');
assert.strictEqual(sandbox.getItemsPKP('PKP-B1').length, 0, 'Authenticated Pegawai A cannot read Pegawai B items');
assert.strictEqual(sandbox.sahkanDokumenPKP('PKP-A1', '99').success, false, 'Owner cannot self-approve PKP via sahkanDokumenPKP');
sandbox.clearActiveSession_();
console.log('[PASS] PKP & PCK role-spoofing prevention, IDOR & legacy helper guards verified.');

// Test 10: Kinerja Approval Authorization, HTML Escaping & URL Validation
assert.strictEqual(sandbox.addKinerjaLog({ nip: pegB.data.nip, pejabat_nip: atasan.data.nip, tahun: '2026', periode: 'Q1', predikat: 'Baik', filePenilaianData: Buffer.from('a').toString('base64'), fileEvaluasiData: Buffer.from('b').toString('base64'), fileMimeType: 'application/pdf', fileNameBase: 'test' }, pegA.token).status, 'error', 'Cross-user token rejected in addKinerjaLog');
assert.strictEqual(sandbox.approveKinerja('SKP-1', pegA.data.nip, pegA.token).status, 'error', 'Pemohon cannot self-approve SKP');
const blobsBeforeKinerja = capturedBlobs.length;
const kApprove = sandbox.approveKinerja('SKP-1', atasan.data.nip, atasan.token);
assert.strictEqual(kApprove.status, 'success', 'Assigned Penilai must be able to approve SKP');
const kHtml = capturedBlobs[blobsBeforeKinerja].html;
assert(!kHtml.includes('<script>alert(1)</script>'), 'approveKinerja must HTML-escape predikat');
assert(kHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'approveKinerja must render escaped HTML entities');
assert(!kHtml.includes('href="javascript:alert(1)"'), 'approveKinerja must replace javascript: link with #');
console.log('[PASS] Kinerja auth, HTML escaping & URL scheme validation verified.');

console.log('\n[PASS] ALL Fase 2 security & functional tests passed (0 failures).');
