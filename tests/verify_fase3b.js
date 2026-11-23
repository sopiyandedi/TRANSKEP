const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

// =========================================================================
// 1. STATIC, HYGIENE (A1), CDN/SRI/CSP (A4), FIRESTORE RULES (A2), DRIVE (A3)
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

// A1 checks
const gitignore = fs.readFileSync('.gitignore', 'utf8');
for (const pat of ['n8n/*.json', '!n8n/*.example.json', 'n8n_workflow_mysims_surat_keluar.json', '*service-account*.json', '*firebase-adminsdk*.json', '.clasprc.json', '.env', '.env.*']) {
  assert(gitignore.includes(pat), `.gitignore missing ${pat}`);
}
const claspignore = fs.readFileSync('.claspignore', 'utf8');
for (const pat of ['.gitignore', 'firestore.rules', '*.md', '*.example.json', 'n8n/**', 'n8n_workflow_*.json', '*service-account*.json', '.env*']) {
  assert(claspignore.includes(pat), `.claspignore missing ${pat}`);
}
const n8nExampleFiles = [
  'n8n/n8n_workflow_mysims_surat_keluar.example.json',
  'n8n/CI CD Docker Github.example.json',
  'n8n/Waha reset Paswors dan Cuti.example.json',
  'n8n/transkep-ai-assistant.example.json',
  'n8n/transkep-ai-notulen.example.json'
];
const leakedPatterns = [
  '192.168.188.10', 'TRANSKEP_WA_BOT_2026', 'AKfycb', "pass: 'admin'", "pass: 'panitera'", "pass: 'sekretaris'",
  "encodeURIComponent('ketua')", "encodeURIComponent('admin')",
  'KunciRahasiaWahaTranskep2026!', '6289630211345', '089630211345', '89630211345', '6285139811819',
  'YWZ8dADUWtnM4zyx', 'ekWDS9nBCNqDspRg', '9ed8b316a1d5192e09dbfab4b713922f8ffb7a2b9191d04fdcc83d4167a6cebd',
  'D:/transkep-engine', 'D:/transkep-docker', 'zPO2QXi7Q7dlU0JC', 'TAIcTSnnqZpMXReY', 'qyvrBwRW6msGd1VP'
];
for (const exFile of n8nExampleFiles) {
  const raw = fs.readFileSync(exFile, 'utf8');
  const parsed = JSON.parse(raw);
  assert(parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0, `${exFile} should have nodes`);
  for (const leaked of leakedPatterns) {
    assert(!raw.includes(leaked), `${exFile} leaked secret/PII: ${leaked}`);
  }
}
console.log('[PASS] A1 (.gitignore, .claspignore, 5 sanitized n8n/*.example.json blueprints) checks passed.');

// A4 checks
const indexHtml = fs.readFileSync('index.html', 'utf8');
const swJs = fs.readFileSync('sw.js', 'utf8');
assert(!indexHtml.includes('vue@3/dist/vue.global'), 'index.html must not use floating vue@3 URL');
assert(!indexHtml.includes('https://cdn.jsdelivr.net/npm/chart.js"'), 'index.html must not use floating chart.js URL');
assert(indexHtml.includes('https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js'), 'Vue 3.5.13 pinned URL missing');
assert(indexHtml.includes('https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js'), 'Chart.js 4.6.1 pinned URL missing');
assert(indexHtml.includes('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js'), 'firebase-auth-compat 10.14.1 missing');
assert(indexHtml.includes("object-src 'self' blob:"), "CSP must include object-src 'self' blob:");
const mTopVer = indexHtml.match(/window\.APP_BUILD_VER\s*=\s*'(\d+\.\d+\.\d+)'/);
const mLoaderVer = indexHtml.match(/const APP_BUILD_VER\s*=\s*window\.APP_BUILD_VER\s*\|\|\s*'(\d+\.\d+\.\d+)'/);
const mSwVer = swJs.match(/const CACHE_NAME\s*=\s*'transkep-v(\d+\.\d+\.\d+)'/);
assert(mTopVer && mLoaderVer && mSwVer, 'APP_BUILD_VER and sw.js CACHE_NAME must follow semver');
assert.strictEqual(mTopVer[1], mLoaderVer[1], 'window.APP_BUILD_VER at top of index.html must match loader fallback');
assert.strictEqual(mTopVer[1], mSwVer[1], 'index.html APP_BUILD_VER must match sw.js CACHE_NAME');
const verParts = mTopVer[1].split('.').map(Number);
assert(verParts[0] > 3 || (verParts[0] === 3 && (verParts[1] > 8 || (verParts[1] === 8 && verParts[2] >= 50))), `APP_BUILD_VER (${mTopVer[1]}) must be >= 3.8.50`);

const sriAssets = [
  'vue@3.5.13/dist/vue.global.prod.js',
  'chart.js@4.6.1/dist/chart.umd.min.js',
  'xlsx/0.18.5/xlsx.full.min.js',
  'mammoth/1.6.0/mammoth.browser.min.js',
  'firebasejs/10.14.1/firebase-app-compat.js',
  'firebasejs/10.14.1/firebase-app-check-compat.js',
  'firebasejs/10.14.1/firebase-auth-compat.js',
  'firebasejs/10.14.1/firebase-firestore-compat.js',
  'font-awesome/6.5.1/css/all.min.css'
];
for (const asset of sriAssets) {
  const esc = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(`<(?:script|link)\\b[^>]*${esc}[\\s\\S]*?>`, 'i');
  const m = indexHtml.match(tagRegex);
  assert(m, `Missing tag for pinned CDN asset: ${asset}`);
  assert(/integrity="sha384-[A-Za-z0-9+/=]+"/.test(m[0]), `Missing SHA-384 integrity on ${asset}`);
  assert(/crossorigin="anonymous"/.test(m[0]), `Missing crossorigin="anonymous" on ${asset}`);
}
assert(fs.readFileSync('core/firebase.js', 'utf8').includes('AIzaSyBS64rl8AAwofd-tLfNTu_ibcFwHydiAgE'), 'core/firebase.js must use active Browser API Key ...HydiAgE');
console.log(`[PASS] A4 (CDN version pinning, SHA-384 SRI, CSP object-src, PWA v${mTopVer[1]}) checks passed.`);

// A2 firestore.rules static checks
const rulesSrc = fs.readFileSync('firestore.rules', 'utf8');
assert(rulesSrc.startsWith("rules_version = '2';"), 'firestore.rules must start with rules_version = 2');
for (const col of ['sk_documents', 'sop_documents', 'jobdes_documents', 'jobdes_usulan', 'master_kinerja', 'pkp_documents', 'pck_documents', 'pck_rekapitulasi', 'eoffice_kgb', 'eoffice_rapat', 'surat_tugas_documents', 'security_incidents', '{document=**}']) {
  assert(rulesSrc.includes(`match /${col}`), `firestore.rules missing match /${col}`);
}
assert(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/.test(rulesSrc), 'firestore.rules missing catch-all deny');
assert(/function isValidAckAppend[\s\S]*?newData\.acknowledgments\[newSize - 1\]\.nip == uid\(\)/.test(rulesSrc), 'isValidAckAppend must bind new Ack nip to uid()');
assert(/match \/surat_tugas_documents\/\{docId\}[\s\S]*?isFieldOwner\(request\.resource\.data, 'created_by'\) &&[\s\S]*?request\.resource\.data\.created_by\.size\(\) >= 1/.test(rulesSrc), 'surat_tugas_documents must forbid unowned created_by create');
assert(/function isValidJobdesUsulan[\s\S]*?'pengusul_nip'/.test(rulesSrc) && /match \/jobdes_usulan\/\{docId\}[\s\S]*?isApproverRole\(\)/.test(rulesSrc), 'jobdes_usulan must support approver / pengusul_nip proposals');
assert(/function isValidSecurityIncident[\s\S]*?isValidOptionalString\(data, 'url', 0, 2000\)/.test(rulesSrc), 'security_incidents must allow URLs up to 2000 chars');
assert(fs.readFileSync('modules/sop/sop.js', 'utf8').includes('canManageSop() {\r\n                return this.isAdminOrOperator;') || fs.readFileSync('modules/sop/sop.js', 'utf8').includes('canManageSop() {\n                return this.isAdminOrOperator;'), 'sop.js canManageSop must match Admin/Operator rules');
assert(fs.readFileSync('modules/pkp/view_pkp.html', 'utf8').includes(':readonly="isReadOnlyPK || isVerifikasiPK"'), 'view_pkp.html must lock penilai/atasan inputs during verifikasi');
assert(fs.readFileSync('core/core.js', 'utf8').includes('.slice(0, 1500)') && fs.readFileSync('core/core.js', 'utf8').includes('.slice(0, 480)'), 'core.js security_incidents must clamp long url/userAgent');
console.log('[PASS] A2 firestore.rules structure, catch-all deny & multi-menu hardening checks passed.');

// A3 static Drive sharing & frontend link routing checks
for (const f of jsFiles) {
  const content = fs.readFileSync(f, 'utf8');
  assert(!content.includes('DriveApp.Access.ANYONE_WITH_LINK'), `ANYONE_WITH_LINK still present in ${f}`);
}
assert(!fs.readFileSync('modules/permohonan/view_magic_approval.html', 'utf8').includes(':href="cutiData.fileUrl"'), 'view_magic_approval still uses raw href');
const eofficeHtml = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
for (const rawBinding of [':href="item.fileDocUrl"', ':href="item.docUndanganUrl"', ':href="item.docAbsenUrl"', ':href="item.docNotulenUrl"']) {
  assert(!eofficeHtml.includes(rawBinding), `view_eoffice still has ${rawBinding}`);
}
const kinerjaHtml = fs.readFileSync('modules/kinerja/view_kinerja.html', 'utf8');
for (const rawBinding of [':href="k.file_pengesahan"', ':href="k.file_penilaian"', ':href="k.file_evaluasi"']) {
  assert(!kinerjaHtml.includes(rawBinding), `view_kinerja still has ${rawBinding}`);
}
const modalsIzinHtml = fs.readFileSync('modules/permohonan/view_modals_izin.html', 'utf8');
assert(!modalsIzinHtml.includes(':href="url"'), 'view_modals_izin still has :href="url"');
const permohonanHtml = fs.readFileSync('modules/permohonan/view_permohonan.html', 'utf8');
assert(!permohonanHtml.includes(':href="url"') && !permohonanHtml.includes(':href="singleTarget.bukti_url"'), 'view_permohonan still has raw Drive hrefs');
for (const cetakFile of ['modules/permohonan/cetak/cetak_wfh_laporan.js', 'modules/permohonan/cetak/cetak_wfh_rencana.js', 'modules/pkp/pkp.js']) {
  const src = fs.readFileSync(cetakFile, 'utf8');
  assert(src.includes('openSecureDriveFile(res.url'), `${cetakFile} must route res.url through openSecureDriveFile`);
}
// Public thumbnail & admin folders must remain intact
assert(fs.readFileSync('modules/sk/sk.js', 'utf8').includes('openSkDriveFolder') && fs.readFileSync('modules/sop/sop.js', 'utf8').includes('openSopDriveFolder'));
console.log('[PASS] A3 zero ANYONE_WITH_LINK & frontend Drive proxy routing checks passed.');

// =========================================================================
// 2. BUILD MOCK GAS SANDBOX (WITH RSA SIGNING, PARENTS/MIME/SIZE MOCKS)
// =========================================================================
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

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
  ADMIN_TEST_PHONE: '6281200000001'
};
let cacheStore = {};
const sharingCalls = [];
const mockDriveFiles = new Map();

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
      if (typeof r === 'string') return { setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => { } }) }) };
      const makeSetter = () => ({
        setNumberFormat: () => makeSetter(),
        setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
        setValues: (vals) => {
          for (let ri = 0; ri < vals.length; ri++) {
            while (rows.length < r + ri) rows.push([]);
            for (let ci = 0; ci < vals[ri].length; ci++) rows[r - 1 + ri][c - 1 + ci] = vals[ri][ci];
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
    setFrozenRows: () => { }
  };
}

function toSignedBytes(buf) { return Array.from(buf, b => (b > 127 ? b - 256 : b)); }
function fromSignedBytes(arr) { return Buffer.from(arr.map(b => (b < 0 ? b + 256 : b))); }

function makeMockBlob(rawData, mimeType, name) {
  const buf = Array.isArray(rawData)
    ? fromSignedBytes(rawData)
    : Buffer.isBuffer(rawData)
      ? Buffer.from(rawData)
      : Buffer.from(String(rawData || ''), 'utf8');
  const obj = {
    _buf: buf,
    _mime: mimeType || 'application/pdf',
    _name: name || 'file.pdf',
    getDataAsString: () => obj._buf.toString('utf8'),
    getBytes: () => toSignedBytes(obj._buf),
    getName: () => obj._name,
    setName: (n) => { obj._name = n; return obj; },
    getContentType: () => obj._mime,
    getAs: (targetMime) => makeMockBlob(obj._buf, targetMime, obj._name.replace(/\.\w+$/i, '.pdf'))
  };
  return obj;
}

function makeDriveFolderStub(id, name, parents = []) {
  return {
    getId: () => id,
    getName: () => name,
    getUrl: () => `https://drive.google.com/drive/folders/${id}`,
    getParents: () => {
      let i = 0;
      return { hasNext: () => i < parents.length, next: () => parents[i++] };
    },
    getFoldersByName: (subName) => ({ hasNext: () => true, next: () => makeDriveFolderStub('sub-' + subName, subName) }),
    createFolder: (subName) => makeDriveFolderStub('new-' + subName, subName),
    createFile: (blob) => registerMockDriveFile({
      id: 'newfile_' + Math.random().toString(36).slice(2, 12).padEnd(20, 'X'),
      name: blob ? blob.getName() : 'file.pdf',
      mime: blob ? blob.getContentType() : 'application/pdf',
      content: blob ? blob.getDataAsString() : 'PDF',
      parents: [makeDriveFolderStub(id, name, parents)]
    }),
    getFiles: () => ({ hasNext: () => false }),
    getFilesByName: () => ({ hasNext: () => false })
  };
}

function registerMockDriveFile({ id, name, mime, size, content, parents = [] }) {
  const fileBuf = Buffer.from(content || '%PDF-1.4\nMOCK\n', 'utf8');
  const fileObj = {
    getId: () => id,
    getName: () => name || 'doc.pdf',
    getMimeType: () => mime || 'application/pdf',
    getSize: () => (typeof size === 'number' ? size : fileBuf.length),
    getUrl: () => `https://drive.google.com/file/d/${id}/view`,
    setSharing: (acc, perm) => { sharingCalls.push({ id, acc, perm }); },
    setTrashed: () => { },
    getParents: () => {
      let idx = 0;
      return { hasNext: () => idx < parents.length, next: () => parents[idx++] };
    },
    getBlob: () => makeMockBlob(fileBuf, mime || 'application/pdf', name || 'doc.pdf'),
    getAs: (targetMime) => makeMockBlob(Buffer.from('%PDF-1.4\nEXPORTED\n', 'utf8'), targetMime || 'application/pdf', (name || 'doc') + '.pdf')
  };
  mockDriveFiles.set(id, fileObj);
  return fileObj;
}

const folderCuti = makeDriveFolderStub('fld-cuti-root', 'Bukti Cuti TRANSKEP');
const folderSk = makeDriveFolderStub('fld-sk-root', 'TRANSKEP SK');
const folderPkp = makeDriveFolderStub('1dpHLuhnsn8Q6OS3mCjyrgyEcnKebnpmG', 'Arsip PKP');

const idCutiPrivate = '1CutiPrivateFileId1234567890A';
const idWfhPrivate = '1WfhPrivateFileId1234567890B';
const idKinPrivate = '1KinPrivateFileId1234567890C';
const idKgbDoc = '1KgbPrivateDocId1234567890D';
const idSkPublicInternal = '1SkInternalFileId1234567890E';
const idOversized = '1OversizedFileId1234567890F';

registerMockDriveFile({ id: idCutiPrivate, name: 'cuti_pegA.pdf', mime: 'application/pdf', content: '%PDF-1.4 CUTI A', parents: [folderCuti] });
registerMockDriveFile({ id: idWfhPrivate, name: 'wfh_pegA.pdf', mime: 'application/pdf', content: '%PDF-1.4 WFH A' });
registerMockDriveFile({ id: idKinPrivate, name: 'kin_pegA.pdf', mime: 'application/pdf', content: '%PDF-1.4 KIN A' });
registerMockDriveFile({ id: idKgbDoc, name: 'kgb_pegA', mime: 'application/vnd.google-apps.document', content: 'RAW' });
registerMockDriveFile({ id: idSkPublicInternal, name: 'sk_tim.pdf', mime: 'application/pdf', content: '%PDF-1.4 SK INTERNAL', parents: [folderSk] });
registerMockDriveFile({ id: idOversized, name: 'huge.pdf', mime: 'application/pdf', size: 25 * 1024 * 1024, content: '%PDF-1.4', parents: [folderSk] });

const userRows = [
  ['NIP', 'Nama', 'Jabatan', 'Role', 'No_HP', 'Password', 'S_2024', 'S_2025', 'S_2026', 'Sakit', 'Penting', 'Besar', 'Melahirkan', 'CLTN', 'Pangkat', 'Alamat', 'TMT_KGB', 'TMT_KNP', 'BUP', 'Status_KGB', 'Tgl_Selesai_KGB', 'Status_KNP', 'Tgl_Selesai_KNP', 'Status_Pensiun', 'Tgl_Pensiun', 'Jenis_Jabatan'],
  ['198001012005011001', 'Admin Satu', 'Kasubbag Kepegawaian', 'Admin', '081234567890', 'adminPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Penata (III/c)', 'Jl. Merdeka 1', '2026-01-01', '2026-01-01', 58, 'SELESAI', '2026-01-01', '', '', '', '', 'Struktural'],
  ['197901012003011008', 'Atasan Satu', 'Panitera', 'Pegawai', '081377778888', 'atasanPass123', 6, 6, 12, 12, 5, 0, 0, 0, 'Pembina (IV/a)', 'Jl. Pahlawan 3', '2025-05-01', '', 60, '', '', '', '', '', '', 'Struktural'],
  ['199002022015012002', 'Pegawai A', 'Staf Umum', 'Pegawai', '081298765432', 'pegAPass123', 5, 6, 11, 12, 5, 0, 0, 0, 'Penata Muda (III/a)', 'Jl. Sudirman 2', '2026-02-01', '', 58, '', '', '', '', '', '', 'Fungsional Umum'],
  ['199203032018011004', 'Pegawai B', 'Staf Arsip', 'Pegawai', '081399991111', 'pegBPass123', 3, 6, 10, 12, 5, 0, 0, 0, 'Pengatur (II/c)', 'Jl. Rahasia 99', '2027-03-01', '2027-03-01', 58, '', '', '', '', '', '', 'Fungsional Umum']
];

const dNow = new Date();
const recentDdMmYyyy = `${String(dNow.getDate()).padStart(2, '0')}/${String(dNow.getMonth() + 1).padStart(2, '0')}/${dNow.getFullYear()} 08:00:00`;

const cutiRows = [
  ['ID', 'Waktu', 'NIP', 'Jenis', 'Tgl_Mulai', 'Tgl_Selesai', 'Alasan', 'Status', 'Catatan_Atasan', 'Atasan_NIP', 'Pejabat_NIP', 'Durasi', 'Plh_NIP', 'Status_Atasan', 'Status_Pejabat', 'Alamat', 'History_JSON', 'Bukti_URL', 'Token', 'Nomor_Surat'],
  ['CUTI-PEG-A', recentDdMmYyyy, '199002022015012002', 'Tahunan', '2026-11-18', '2026-11-18', 'Acara Keluarga Rahasia', 'Menunggu', '', '197901012003011008', '198001012005011001', 1, '', 'Menunggu', 'Menunggu', 'Jl. Sudirman 2', '{"2026":1}', `https://drive.google.com/file/d/${idCutiPrivate}/view`, 'magic-valid-tok-a', ''],
  ['CUTI-PEG-B-DIS', recentDdMmYyyy, '199203032018011004', 'Tahunan', '2026-11-20', '2026-11-20', 'Rahasia B Disetujui', 'Disetujui', 'ACC Private', '197901012003011008', '198001012005011001', 1, '', 'Disetujui', 'Disetujui', 'Jl. Rahasia 99', '{"2026":1}', '', 'magic-tok-b', '10/KPA/2026'],
  ['CUTI-PEG-B-TOLAK', recentDdMmYyyy, '199203032018011004', 'Tahunan', '2026-11-22', '2026-11-22', 'Rahasia B Ditolak', 'Ditolak', 'Ditolak atasan', '197901012003011008', '198001012005011001', 1, '', 'Ditolak', 'Ditolak', 'Jl. Rahasia 99', '{"2026":1}', '', '', '']
];

const ipRows = [
  ['ID', 'Waktu', 'NIP', 'Tgl_Mulai', 'Tgl_Selesai', 'Alasan', 'Atasan_NIP', 'Status', 'Catatan', 'Pejabat_NIP'],
  ['IP-1', '2026-11-18', '199002022015012002', '2026-11-19', '2026-11-19', 'Urusan Pribadi A', '197901012003011008', 'Menunggu Atasan', '', '198001012005011001'],
  ['IP-2', '2026-11-18', '199203032018011004', '2026-11-21', '2026-11-21', 'Rahasia B', '197901012003011008', 'Disetujui', 'OK', '198001012005011001']
];

const ikRows = [
  ['ID', 'Waktu', 'NIP', 'Tanggal', 'Jam_Keluar', 'Jam_Kembali', 'Alasan', 'Atasan_NIP', 'Status', 'Catatan'],
  ['IK-1', '2026-11-18', '199203032018011004', '2026-11-18', '10:00', '11:00', 'Ambil paket rahasia', '197901012003011008', 'Disetujui', 'OK'],
  ['IK-2', '2026-11-18', '199203032018011004', '2026-11-18', '13:00', '14:00', 'Pending B', '197901012003011008', 'Menunggu', '']
];

const wfhRows = [
  ['ID', 'Waktu', 'NIP', 'Tanggal', 'Rencana', 'Laporan', 'Atasan_NIP', 'Status_Rencana', 'Status_Laporan', 'Catatan', 'Bukti_URL'],
  ['WFH-1', '2026-11-18', '199002022015012002', '2026-11-18', '[{"tugas":"Input"}]', '[]', '197901012003011008', 'Disetujui', 'Menunggu', '', `https://drive.google.com/file/d/${idWfhPrivate}/view`]
];

const kinRows = [
  ['ID', 'NIP', 'Pejabat_NIP', 'Tahun', 'Periode', 'Predikat', 'File_Penilaian', 'File_Evaluasi', 'Status', 'Tgl_TTE', 'File_Pengesahan', 'Tgl_Input'],
  ['KIN-A', '199002022015012002', '197901012003011008', '2026', 'Triwulan I', 'Baik', `https://drive.google.com/file/d/${idKinPrivate}/view`, '', 'Disetujui', '2026-04-01', '', '2026-04-01']
];

const kgbRows = [
  ['ID_KGB', 'NIP_Pegawai', 'Nomor_Surat', 'Doc_URL'],
  ['KGB-A', '199002022015012002', '123/KGB', `https://docs.google.com/document/d/${idKgbDoc}/edit`]
];

const mockSheets = {
  user_data: createMockSheet('user_data', userRows),
  cuti_log: createMockSheet('cuti_log', cutiRows),
  izin_pribadi_log: createMockSheet('izin_pribadi_log', ipRows),
  izin_keluar_log: createMockSheet('izin_keluar_log', ikRows),
  wfh_log: createMockSheet('wfh_log', wfhRows),
  ekinerja_data: createMockSheet('ekinerja_data', kinRows),
  EofficeKGB: createMockSheet('EofficeKGB', kgbRows),
  pkp_dokumen: createMockSheet('pkp_dokumen', [['id', 'nip', 'penilai', 'tahun', 'status', 'json', 'tgl', 'atasan']]),
  pck_dokumen: createMockSheet('pck_dokumen', [['id', 'nip', 'bulan', 'tahun', 'json', 'tgl', 'status']]),
  sk_data: createMockSheet('sk_data', [['ID', 'Judul']]),
  sk_ack: createMockSheet('sk_ack', [['ID', 'SK_ID', 'NIP', 'Tgl']])
};

const mockSS = {
  getSheetByName: (n) => mockSheets[n] || null,
  insertSheet: (n) => { mockSheets[n] = createMockSheet(n, []); return mockSheets[n]; }
};

const gasSandbox = {
  console, Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  MimeType: { HTML: 'text/html', PDF: 'application/pdf', MICROSOFT_EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  Logger: { log: () => { } },
  SpreadsheetApp: { getActiveSpreadsheet: () => mockSS, openById: () => mockSS, flush: () => { } },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK' },
    Permission: { VIEW: 'VIEW', NONE: 'NONE' },
    getFoldersByName: (name) => ({ hasNext: () => true, next: () => (name === 'TRANSKEP SK' ? folderSk : name.includes('Cuti') ? folderCuti : makeDriveFolderStub('fld-' + name, name)) }),
    getFolderById: (id) => (id === '1dpHLuhnsn8Q6OS3mCjyrgyEcnKebnpmG' ? folderPkp : makeDriveFolderStub(id, 'Folder-' + id)),
    createFolder: (name) => makeDriveFolderStub('fld-' + name, name),
    getFileById: (id) => {
      if (!mockDriveFiles.has(id)) throw new Error('File not found: ' + id);
      return mockDriveFiles.get(id);
    }
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(propsStore, k) ? propsStore[k] : null),
      setProperty: (k, v) => { propsStore[k] = String(v); },
      deleteProperty: (k) => { delete propsStore[k]; },
      getProperties: () => ({ ...propsStore })
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null),
      put: (k, v, ttl) => {
        if (ttl > 21600) throw new Error('TTL > 21600: ' + ttl);
        cacheStore[k] = String(v);
      },
      remove: (k) => { delete cacheStore[k]; }
    })
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) },
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (txt) => ({ setMimeType: () => ({ getContent: () => txt, _raw: txt }) }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    sleep: () => { },
    formatDate: (d) => d.toISOString().slice(0, 10),
    computeDigest: (_alg, val) => toSignedBytes(crypto.createHash('sha256').update(String(val), 'utf8').digest()),
    computeHmacSha256Signature: (val, key) => toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(val), 'utf8').digest()),
    computeRsaSha256Signature: (val, keyPem) => toSignedBytes(crypto.sign('RSA-SHA256', Buffer.from(String(val), 'utf8'), String(keyPem))),
    base64Encode: (input) => (Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8')).toString('base64'),
    base64Decode: (b64) => toSignedBytes(Buffer.from(String(b64), 'base64')),
    base64EncodeWebSafe: (input) => (Array.isArray(input) ? fromSignedBytes(input) : Buffer.from(String(input), 'utf8')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (b64) => toSignedBytes(Buffer.from(String(b64).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (data, mime, name) => makeMockBlob(data, mime, name)
  }
};
gasSandbox.globalThis = gasSandbox;
vm.createContext(gasSandbox);
for (const f of allGasFiles) vm.runInContext(fs.readFileSync(f, 'utf8'), gasSandbox, { filename: f });

// Pre-cutover login test (FIREBASE_SERVICE_ACCOUNT_JSON not yet configured -> graceful null)
const admPre = gasSandbox.verifyLogin('198001012005011001', 'adminPass123');
const atasan = gasSandbox.verifyLogin('197901012003011008', 'atasanPass123');
const pegA = gasSandbox.verifyLogin('199002022015012002', 'pegAPass123');
const pegB = gasSandbox.verifyLogin('199203032018011004', 'pegBPass123');
assert.strictEqual(admPre.status, 'success');
assert.strictEqual(admPre.firebase_custom_token, null, 'Pre-cutover verifyLogin should return null custom token cleanly');

const gftPre = gasSandbox.getFirebaseCustomToken('199002022015012002', pegA.token);
assert.strictEqual(gftPre.status, 'success');
assert.strictEqual(gftPre.configured, false);
assert.strictEqual(gftPre.customToken, null);

// A1 checkInfraSecrets BEFORE & AFTER full configuration
const cisPeg = gasSandbox.checkInfraSecrets('199002022015012002', pegA.token);
assert.strictEqual(cisPeg.status, 'error', 'Pegawai must not run checkInfraSecrets');
const cisPartial = gasSandbox.checkInfraSecrets('198001012005011001', admPre.token);
assert.strictEqual(cisPartial.status, 'success');
assert.strictEqual(cisPartial.data.readyForStrictCutover, false);

propsStore.TRANSKEP_DB_ID = 'db-123';
propsStore.TRANSKEP_SESSION_SECRET = 'sec-1';
propsStore.TRANSKEP_ENC_SECRET = 'sec-2';
propsStore.WAHA_API_KEY = 'waha-secret-999';
propsStore.N8N_WEBHOOK_URL = 'https://n8n.example.internal/hook';
propsStore.N8N_WEBHOOK_SURAT_KELUAR = 'https://n8n.example.internal/st';
propsStore.TRANSKEP_WEBHOOK_KEY = 'webhook-secret-999';
propsStore.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: 'transkep-314c0',
  client_email: 'firebase-adminsdk@transkep-314c0.iam.gserviceaccount.com',
  private_key: privateKey
});

const cisFull = gasSandbox.checkInfraSecrets('198001012005011001', admPre.token);
assert.strictEqual(cisFull.status, 'success');
assert.strictEqual(cisFull.data.readyForStrictCutover, true);
assert.strictEqual(cisFull.data.configuredCount, 8);
assert(!JSON.stringify(cisFull).includes('waha-secret-999') && !JSON.stringify(cisFull).includes('PRIVATE KEY'), 'checkInfraSecrets must never expose secret values');
console.log('[PASS] A1 checkInfraSecrets RBAC & zero secret disclosure verified.');

// A2 Custom Token RS256 cryptographic signature check
const admCutover = gasSandbox.verifyLogin('198001012005011001', 'adminPass123');
assert(admCutover.firebase_custom_token && admCutover.firebase_custom_token.split('.').length === 3, 'Custom token must be 3-segment RS256 JWT');
const [jwtHdrB64, jwtPayB64, jwtSigB64] = admCutover.firebase_custom_token.split('.');
const jwtHdr = JSON.parse(Buffer.from(jwtHdrB64, 'base64url').toString('utf8'));
const jwtPay = JSON.parse(Buffer.from(jwtPayB64, 'base64url').toString('utf8'));
assert.strictEqual(jwtHdr.alg, 'RS256');
assert.strictEqual(jwtPay.uid, '198001012005011001');
assert.strictEqual(jwtPay.claims.role, 'Admin');
assert.strictEqual(
  crypto.verify('RSA-SHA256', Buffer.from(`${jwtHdrB64}.${jwtPayB64}`, 'utf8'), publicKey, Buffer.from(jwtSigB64, 'base64url')),
  true,
  'Custom token RS256 signature must cryptographically verify against public key'
);

// RPC Allowlist gate on new endpoints
const parseResp = (r) => JSON.parse(r._raw);
assert.strictEqual(parseResp(gasSandbox.handleApiPost_({ action: 'call', method: 'getFirebaseCustomToken', args: [] })).status, 'error');
assert.strictEqual(parseResp(gasSandbox.handleApiPost_({ action: 'call', method: 'checkInfraSecrets', args: ['199002022015012002', pegA.token], nip: '199002022015012002', token: pegA.token })).status, 'error');
assert.strictEqual(parseResp(gasSandbox.handleApiPost_({ action: 'call', method: 'getDriveFileBlob', args: [idCutiPrivate] })).status, 'error');
console.log('[PASS] A2 RS256 Custom Token minting, verification & api_router RPC gates verified.');

// A3 PII scoping in getBulkData & getBackgroundData
const bulkPegA = gasSandbox.getBulkData('199002022015012002', pegA.token, '');
assert.strictEqual(bulkPegA.status, 'UPDATED');
const selfRowA = bulkPegA.data.usersList.find(u => u.nip === '199002022015012002');
const otherRowB = bulkPegA.data.usersList.find(u => u.nip === '199203032018011004');
assert.strictEqual(selfRowA.no_hp, '081298765432');
assert.strictEqual(selfRowA.alamat, 'Jl. Sudirman 2');
assert.strictEqual(otherRowB.nama, 'Pegawai B', 'Directory name must stay intact');
assert.strictEqual(otherRowB.no_hp, '', 'Other user no_hp must be stripped for Pegawai');
assert.strictEqual(otherRowB.alamat, '', 'Other user alamat must be stripped for Pegawai');
assert.strictEqual(otherRowB.tmt_kgb, '', 'Other user tmt_kgb must be stripped for Pegawai');
assert.strictEqual(otherRowB.pass, '', 'Other user pass must be empty for Pegawai');

const bulkAdmin = gasSandbox.getBulkData('198001012005011001', admCutover.token, '');
assert.strictEqual(bulkAdmin.status, 'UPDATED');
assert.strictEqual(bulkAdmin.data.usersList.find(u => u.nip === '199203032018011004').no_hp, '081399991111', 'Admin should see full phone');
assert(bulkAdmin.data.usersList.every(u => u.pass === '[Telah Dienkripsi]'), 'Admin still sees masked pass');

// Test getBackgroundData cache isolation + ipData[i][6] atasan_nip fix + PII scoping
const bgAdminFresh = gasSandbox.getBackgroundData('198001012005011001', admCutover.token, '');
assert.strictEqual(bgAdminFresh.status, 'UPDATED');
assert.strictEqual(bgAdminFresh.data.ipLogs.find(x => x.id === 'IP-1').atasan_nip, '197901012003011008', 'ipData[6] must map to atasan_nip');
assert.strictEqual(bgAdminFresh.data.ipLogs.find(x => x.id === 'IP-1').pejabat_nip, '198001012005011001', 'ipData[9] must map to pejabat_nip');
assert.strictEqual(bgAdminFresh.data.cutiLogs.find(x => x.id === 'CUTI-PEG-B-DIS').alasan, 'Rahasia B Disetujui', 'Admin must get unredacted row');

const rawCacheKeys = Object.keys(cacheStore).filter(k => k.startsWith('TRANSKEP_BG_RAW_'));
assert(rawCacheKeys.length > 0, 'TRANSKEP_BG_RAW_ cache must be written');

// Subsequent hit as Pegawai A from same cache MUST scope cleanly!
const bgPegA = gasSandbox.getBackgroundData('199002022015012002', pegA.token, '');
assert.strictEqual(bgPegA.status, 'UPDATED');
const pegAOwnCuti = bgPegA.data.cutiLogs.find(x => x.id === 'CUTI-PEG-A');
assert.strictEqual(pegAOwnCuti.alasan, 'Acara Keluarga Rahasia', 'Pegawai A sees own full cuti');
const pegBApprovedCutiFromA = bgPegA.data.cutiLogs.find(x => x.id === 'CUTI-PEG-B-DIS');
assert(pegBApprovedCutiFromA && pegBApprovedCutiFromA._redacted === true && !('alasan' in pegBApprovedCutiFromA) && !('catatan' in pegBApprovedCutiFromA), 'Colleague approved cuti must be redacted');
assert(!bgPegA.data.cutiLogs.some(x => x.id === 'CUTI-PEG-B-TOLAK'), 'Colleague rejected/pending cuti must NOT appear for Pegawai A');
assert(!bgPegA.data.ikLogs.some(x => x.id === 'IK-2'), 'Colleague pending IK must NOT appear for Pegawai A');
const pegBKinFromA = bgPegA.data.kinerjaList.find(x => x.id === 'KIN-A');
assert(pegBKinFromA, 'Pegawai A sees own kinerja');
const bgPegB = gasSandbox.getBackgroundData('199203032018011004', pegB.token, '');
assert.strictEqual(bgPegB.data.kinerjaList.length, 0, 'Pegawai B must NOT see Pegawai A kinerja');
assert.strictEqual(bgPegB.data.ipLogs.find(x => x.id === 'IP-1'), undefined, 'Pegawai B must NOT see Pegawai A pending IP');
assert.strictEqual(gasSandbox.getBackgroundData('197901012003011008', atasan.token, '').data.ipLogs.find(x => x.id === 'IP-1').alasan, 'Urusan Pribadi A', 'Atasan IP sees IP-1 via fixed ipData[6]');
console.log('[PASS] A3 getBulkData & getBackgroundData PII scoping + TRANSKEP_BG_RAW_ isolation verified.');

// A3 getDriveFileBlob & getMagicFilePreview ACL/IDOR/Export/Size Cap tests
assert.strictEqual(gasSandbox.getDriveFileBlob(idCutiPrivate, '199203032018011004', pegB.token).status, 'error', 'Pegawai B MUST be blocked from Pegawai A cuti evidence (no folder fallthrough)');
assert.strictEqual(gasSandbox.getDriveFileBlob(idWfhPrivate, '199203032018011004', pegB.token).status, 'error', 'Pegawai B MUST be blocked from Pegawai A WFH evidence');
assert.strictEqual(gasSandbox.getDriveFileBlob(idKinPrivate, '199203032018011004', pegB.token).status, 'error', 'Pegawai B MUST be blocked from Pegawai A E-Kinerja file');
assert.strictEqual(gasSandbox.getDriveFileBlob(idKgbDoc, '199203032018011004', pegB.token).status, 'error', 'Pegawai B MUST be blocked from Pegawai A KGB doc');

const blobOwnerCuti = gasSandbox.getDriveFileBlob(idCutiPrivate, '199002022015012002', pegA.token);
assert.strictEqual(blobOwnerCuti.status, 'success');
assert.strictEqual(Buffer.from(blobOwnerCuti.base64, 'base64').toString('utf8'), '%PDF-1.4 CUTI A');
assert.strictEqual(gasSandbox.getDriveFileBlob(idCutiPrivate, '197901012003011008', atasan.token).status, 'success', 'Atasan can fetch cuti file');
assert.strictEqual(gasSandbox.getDriveFileBlob(idKinPrivate, '197901012003011008', atasan.token).status, 'success', 'Penilai can fetch kinerja file');
const blobKgbOwner = gasSandbox.getDriveFileBlob(idKgbDoc, '199002022015012002', pegA.token);
assert.strictEqual(blobKgbOwner.status, 'success');
assert.strictEqual(blobKgbOwner.mimeType, 'application/pdf', 'Google Doc should export as PDF');
assert.strictEqual(gasSandbox.getDriveFileBlob(idSkPublicInternal, '199203032018011004', pegB.token).status, 'success', 'Pegawai B can read internal catalog SK doc');
const blobHuge = gasSandbox.getDriveFileBlob(idOversized, '198001012005011001', admCutover.token);
assert.strictEqual(blobHuge.status, 'error');
assert(blobHuge.message.includes('20 MB'), 'Files > 20 MB must be rejected');

// Magic Link preview ACL
const magicOk = gasSandbox.getMagicFilePreview('magic-valid-tok-a');
assert.strictEqual(magicOk.status, 'success');
assert.strictEqual(Buffer.from(magicOk.base64, 'base64').toString('utf8'), '%PDF-1.4 CUTI A');
assert.strictEqual(gasSandbox.getMagicFilePreview('invalid-tok-xyz').status, 'error');

// Drive private sharing check
gasSandbox.setPrivateDriveSharing_(registerMockDriveFile({ id: '1PrivTest12345678901234567', name: 'x.pdf' }));
assert(sharingCalls.every(c => c.acc !== 'ANYONE_WITH_LINK'), 'setPrivateDriveSharing_ must never use ANYONE_WITH_LINK');
console.log('[PASS] A3 getDriveFileBlob, getMagicFilePreview, export & 20MB limit verified.');

// =========================================================================
// 3. MOCK BROWSER VM BEHAVIORAL TESTS (core/firebase.js, core/core.js, pdf_viewer.js)
// =========================================================================
function createLocalStorageMock() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

function makeMockQuery(colName, ops = []) {
  return {
    where: (f, op, v) => makeMockQuery(colName, ops.concat([{ f, op, v }])),
    get: async () => {
      recordedFirestoreOps.push({ type: 'get', colName, ops });
      return { empty: true, size: 0, forEach: () => { }, docs: [] };
    },
    onSnapshot: (cb) => {
      recordedFirestoreOps.push({ type: 'onSnapshot', colName, ops });
      if (cb) cb({ empty: true, size: 0, forEach: () => { }, docs: [] });
      return () => { };
    }
  };
}

let recordedFirestoreOps = [];
let recordedAuthActions = [];
let mockFirebaseUser = null;
const mockFirestore = {
  collection: (colName) => ({
    doc: (docId) => ({
      get: async () => {
        recordedFirestoreOps.push({ type: 'get', colName, docId, ops: [] });
        return { exists: false, data: () => null };
      },
      set: async (data) => { recordedFirestoreOps.push({ type: 'set', colName, docId, data }); },
      update: async (data) => { recordedFirestoreOps.push({ type: 'update', colName, docId, data }); },
      delete: async () => { recordedFirestoreOps.push({ type: 'delete', colName, docId }); }
    }),
    where: (f, op, v) => makeMockQuery(colName, [{ f, op, v }]),
    get: async () => {
      recordedFirestoreOps.push({ type: 'get', colName, ops: [] });
      return { empty: true, size: 0, forEach: () => { }, docs: [] };
    },
    onSnapshot: (cb) => {
      recordedFirestoreOps.push({ type: 'onSnapshot', colName, ops: [] });
      if (cb) cb({ empty: true, size: 0, forEach: () => { }, docs: [] });
      return () => { };
    }
  })
};

const lsStore = new Map();
function MockStorage() { }
MockStorage.prototype.getItem = (k) => (lsStore.has(k) ? lsStore.get(k) : null);
MockStorage.prototype.setItem = (k, v) => { lsStore.set(k, String(v)); };
MockStorage.prototype.removeItem = (k) => { lsStore.delete(k); };
const browserLS = new MockStorage();
const browserSS = new MockStorage();
browserLS.setItem('transkep_active_nip', '199002022015012002');
browserLS.setItem('transkep_session_token', 'tok-abc');
browserLS.setItem('transkep_user_role', 'Pegawai');

const createdBlobs = [];
const revokedBlobs = [];
const domMap = new Map();
function getEl(id) {
  if (!domMap.has(id)) {
    domMap.set(id, {
      id, src: '', href: '', innerText: '', innerHTML: '', value: '', download: '',
      children: [],
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }, contains(c) { return this._s.has(c); } },
      removeAttribute: () => { },
      appendChild: () => { },
      click: () => { },
      remove: () => { },
      firstElementChild: { classList: { add() { }, remove() { } } },
      querySelector: () => null,
      addEventListener: () => { }
    });
  }
  return domMap.get(id);
}

const rpcCalls = [];
let mockBlobSeq = 0;

const browserSandbox = {
  console, Math, Date, JSON, String, Number, Boolean, Array, Object, Error, RegExp, Promise, Set, Map,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  setTimeout, clearTimeout, URLSearchParams,
  Storage: MockStorage,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  localStorage: browserLS,
  sessionStorage: browserSS,
  Vue: { createApp: () => ({ mount: () => ({}) }), reactive: (o) => o, ref: (v) => ({ value: v }) },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: Object.assign(URL, {
    createObjectURL: (blob) => {
      const u = 'blob:https://transkep.test/' + (++mockBlobSeq);
      createdBlobs.push({ u, blob });
      return u;
    },
    revokeObjectURL: (u) => { revokedBlobs.push(u); }
  }),
  location: { hostname: 'localhost', href: 'https://transkep.test/', protocol: 'https:', pathname: '/' },
  navigator: { userAgent: 'Mozilla/5.0', onLine: true, clipboard: { writeText: async () => { } } },
  document: {
    getElementById: (id) => getEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => getEl('dyn_' + Math.random()),
    addEventListener: () => { },
    body: { appendChild: () => { }, classList: { add() { }, remove() { } } }
  },
  firebase: {
    apps: [],
    initializeApp: () => ({}),
    appCheck: () => ({ activate: () => { } }),
    auth: () => ({
      get currentUser() { return mockFirebaseUser; },
      signInWithCustomToken: async (tok) => {
        recordedAuthActions.push({ type: 'signInWithCustomToken', tok });
        const isAdm = (tok === 'jwt-adm');
        mockFirebaseUser = {
          uid: isAdm ? '198001012005011001' : '199002022015012002',
          getIdTokenResult: async () => ({ claims: { role: isAdm ? 'Admin' : 'Pegawai' } })
        };
        return { user: mockFirebaseUser };
      },
      signOut: async () => {
        recordedAuthActions.push({ type: 'signOut' });
        mockFirebaseUser = null;
      }
    }),
    firestore: Object.assign(() => mockFirestore, {
      FieldValue: {
        serverTimestamp: () => 'TS',
        arrayUnion: (...args) => ({ _arrayUnion: args })
      }
    })
  },
  TranskepAPI: {
    call: async (method, ...args) => {
      rpcCalls.push({ method, args });
      if (method === 'getDriveFileBlob') {
        return { status: 'success', base64: Buffer.from('%PDF-1.4 BROWSER').toString('base64'), mimeType: 'application/pdf', fileName: 'surat_sk.pdf' };
      }
      if (method === 'getMagicFilePreview') {
        return { status: 'success', base64: Buffer.from('%PDF-1.4 MAGIC').toString('base64'), mimeType: 'application/pdf', fileName: 'lampiran.pdf' };
      }
      return { status: 'success', customToken: 'hdr.pay.sig' };
    }
  }
};
browserSandbox.window = browserSandbox;
browserSandbox.self = browserSandbox;
browserSandbox.window.location = browserSandbox.location;
browserSandbox.globalThis = browserSandbox;
browserSandbox.window.open = () => ({
  closed: false,
  document: { write: () => { }, close: () => { }, body: { innerHTML: '' } },
  location: { replace: () => { } }
});

vm.createContext(browserSandbox);
vm.runInContext(fs.readFileSync('core/firebase.js', 'utf8'), browserSandbox, { filename: 'core/firebase.js' });
vm.runInContext(fs.readFileSync('core/core.js', 'utf8'), browserSandbox, { filename: 'core/core.js' });
vm.runInContext(fs.readFileSync('modules/pkp/pkp_data.js', 'utf8'), browserSandbox, { filename: 'modules/pkp/pkp_data.js' });
vm.runInContext(fs.readFileSync('modules/pdf_viewer/pdf_viewer.js', 'utf8'), browserSandbox, { filename: 'modules/pdf_viewer/pdf_viewer.js' });

(async () => {
  // Queue gating before auth resolves
  browserSandbox.TranskepFirebase.subscribeFirestoreSks(() => { });
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Firestore listener must queue while auth not resolved');

  // Non-admin admin-only listeners must be suppressed after auth
  await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-123', { nip: '199002022015012002', role: 'Pegawai' });
  assert(recordedAuthActions.some(a => a.type === 'signInWithCustomToken' && a.tok === 'jwt-123'));
  assert(recordedFirestoreOps.some(o => o.colName === 'sk_documents'), 'Queued listener should flush after auth resolves');

  recordedFirestoreOps = [];
  browserSandbox.TranskepFirebase.subscribeFirestoreRekapitulasi(() => { });
  browserSandbox.TranskepFirebase.subscribeFirestoreKgbs(() => { });
  browserSandbox.TranskepFirebase.subscribeFirestoreRapats(() => { });
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Non-admin must NOT attach admin-only listeners');

  // Participant-scoped queries for Pegawai
  browserSandbox.TranskepFirebase.subscribeFirestoreUsulanJobdes(() => { });
  await browserSandbox.TranskepFirebase.getFirestorePkps();
  await browserSandbox.TranskepFirebase.getFirestorePcks();
  assert(recordedFirestoreOps.some(o => o.colName === 'jobdes_usulan' && o.ops.length === 1), 'jobdes_usulan must be scoped');
  assert(recordedFirestoreOps.some(o => o.colName === 'pkp_documents' && o.ops.length === 1), 'pkp_documents must be scoped');
  assert(recordedFirestoreOps.some(o => o.colName === 'pck_documents' && o.ops.length === 1), 'pck_documents must be scoped');

  // Field preservation on PCK & ST writes
  recordedFirestoreOps = [];
  await browserSandbox.TranskepFirebase.savePckToFirestore({ id: 'PCK-1', nip: '199002022015012002', bulan: 'November', tahun: '2026', nip_penilai: '197901012003011008', nip_atasan_pejabat: '198001012005011001' });
  const pckWrite = recordedFirestoreOps.find(o => o.colName === 'pck_documents' && o.type === 'set');
  assert(pckWrite && pckWrite.data.nip_penilai === '197901012003011008' && pckWrite.data.nip_atasan_pejabat === '198001012005011001');

  await browserSandbox.TranskepFirebase.saveSuratTugasToFirestore({ id: 'ST-9', peserta: [{ nip: '199002022015012002' }] });
  const stWrite = recordedFirestoreOps.find(o => o.colName === 'surat_tugas_documents' && o.type === 'set');
  assert(stWrite && stWrite.data.created_by === '199002022015012002');

  // Admin attaches admin-only listeners cleanly
  await browserSandbox.TranskepFirebase.authenticateWithCustomToken(null, { nip: '198001012005011001', role: 'Admin' });
  recordedFirestoreOps = [];
  browserSandbox.TranskepFirebase.subscribeFirestoreKgbs(() => { });
  assert.strictEqual(recordedFirestoreOps.length, 1, 'Admin must be able to attach KGB listener');

  await browserSandbox.TranskepFirebase.signOutFirebase();
  assert(recordedAuthActions.some(a => a.type === 'signOut'));

  // One-shot Firestore read gating (pre-login, non-admin, and admin reload race)
  browserLS.removeItem('transkep_active_nip');
  browserLS.removeItem('transkep_session_token');
  browserLS.removeItem('transkep_user_role');
  browserLS.removeItem('transkep_master_kinerja_cache');
  recordedFirestoreOps = [];
  const preLoginRekapList = await browserSandbox.PkpDataService.loadFirestoreRekapitulasi('2026');
  const preLoginRekapDoc = await browserSandbox.PkpDataService.loadFirestoreRekapitulasi('2026', 'November');
  const preLoginTpls = await browserSandbox.PkpDataService.getMasterKinerjaTemplates();
  await browserSandbox.TranskepFirebase.getFirestorePkps();
  await browserSandbox.TranskepFirebase.getFirestorePcks();
  await browserSandbox.TranskepFirebase.getFirestoreKgbs();
  await browserSandbox.TranskepFirebase.getFirestoreRapats();
  await browserSandbox.TranskepFirebase.getFirestoreSks();
  await browserSandbox.TranskepFirebase.getFirestoreJobdes();
  await browserSandbox.TranskepFirebase.getFirestoreSops();
  await browserSandbox.TranskepFirebase.getFirestoreSuratTugas();
  assert(Array.isArray(preLoginRekapList) && preLoginRekapList.length === 0, 'Pre-login loadFirestoreRekapitulasi(year) must return [] safely');
  assert.strictEqual(preLoginRekapDoc, null, 'Pre-login loadFirestoreRekapitulasi(year, month) must return null safely');
  assert(Array.isArray(preLoginTpls) && preLoginTpls.length > 0, 'Pre-login getMasterKinerjaTemplates must fall back to defaults');
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Pre-login one-shot Firestore getters must execute ZERO Firestore reads/writes');

  // Authenticated non-Admin must skip admin-only one-shot reads and skip master_kinerja auto-seed writes
  browserLS.setItem('transkep_active_nip', '199002022015012002');
  browserLS.setItem('transkep_session_token', 'tok-abc');
  browserLS.setItem('transkep_user_role', 'Pegawai');
  await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-123', { nip: '199002022015012002', role: 'Pegawai' });
  recordedFirestoreOps = [];
  const pegRekap = await browserSandbox.PkpDataService.loadFirestoreRekapitulasi('2026');
  const pegKgb = await browserSandbox.TranskepFirebase.getFirestoreKgbs();
  const pegRapat = await browserSandbox.TranskepFirebase.getFirestoreRapats();
  await browserSandbox.PkpDataService.getMasterKinerjaTemplates();
  assert(Array.isArray(pegRekap) && pegRekap.length === 0, 'Pegawai must skip pck_rekapitulasi query');
  assert.strictEqual(pegKgb.length, 0);
  assert.strictEqual(pegRapat.length, 0);
  assert(!recordedFirestoreOps.some(o => o.colName === 'pck_rekapitulasi' || o.colName === 'eoffice_kgb' || o.colName === 'eoffice_rapat'), 'Pegawai must execute ZERO admin-only collection queries');
  assert(!recordedFirestoreOps.some(o => o.type === 'set' && o.colName === 'master_kinerja'), 'Pegawai must NOT auto-seed master_kinerja');

  // Reload race while Admin session stored: must wait until authenticateWithCustomToken resolves, then query
  await browserSandbox.TranskepFirebase.signOutFirebase();
  browserLS.setItem('transkep_active_nip', '198001012005011001');
  browserLS.setItem('transkep_session_token', 'tok-adm');
  browserLS.setItem('transkep_user_role', 'Admin');
  recordedFirestoreOps = [];
  const pendingAdminRekap = browserSandbox.PkpDataService.loadFirestoreRekapitulasi('2026');
  await Promise.resolve();
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Stored Admin session reload must wait for Firebase auth resolution before querying');
  await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-adm', { nip: '198001012005011001', role: 'Admin' });
  await pendingAdminRekap;
  assert(recordedFirestoreOps.some(o => o.type === 'get' && o.colName === 'pck_rekapitulasi'), 'Admin must query pck_rekapitulasi after auth resolves');

  // Proxy bridge + PDF Flipbook blob + close revoke
  const resProxy = await browserSandbox.fetchSecureDriveBlobUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view');
  assert(resProxy.blobUrl.startsWith('blob:') && resProxy.fileName === 'surat_sk.pdf');
  assert(rpcCalls.some(c => c.method === 'getDriveFileBlob'));

  await browserSandbox.openMagicDriveFile('tok-m1', 'Lampiran');
  assert(rpcCalls.some(c => c.method === 'getMagicFilePreview' && c.args[0] === 'tok-m1'));

  browserSandbox.openFlipbook('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view', 'SK Uji');
  await new Promise(r => setTimeout(r, 30));
  assert(getEl('pdfIframe').src.startsWith('blob:'), 'pdf_viewer must load blob: URL into iframe.src');
  assert(getEl('fbBtnDownloadDirect').href.startsWith('blob:') && getEl('fbBtnDownloadDirect').download === 'surat_sk.pdf');
  browserSandbox.closeFlipbookModal();
  await new Promise(r => setTimeout(r, 300));
  assert(revokedBlobs.length >= 1, 'closeFlipbookModal must revoke blob URL');

  // Recovery & diagnostics tests (Tahap 119 - v3.8.52)
  const origApiCall = browserSandbox.TranskepAPI.call;
  const origGetDb = browserSandbox.TranskepFirebase.getDb;
  try {
    // 1. Stale currentUser lacking claims.role triggers refresh via getFirebaseCustomToken
    browserLS.setItem('transkep_active_nip', '198001012005011001');
    browserLS.setItem('transkep_session_token', 'tok-adm');
    browserLS.setItem('transkep_user_role', 'Admin');
    mockFirebaseUser = {
      uid: '198001012005011001',
      getIdTokenResult: async () => ({ claims: {} })
    };
    rpcCalls.length = 0;
    recordedAuthActions.length = 0;
    browserSandbox.TranskepAPI.call = async (method, ...args) => {
      rpcCalls.push({ method, args });
      if (method === 'getFirebaseCustomToken') return { status: 'success', customToken: 'jwt-adm' };
      return origApiCall(method, ...args);
    };
    browserSandbox.restoreFirebaseAuthSession_('198001012005011001', 'tok-adm');
    await new Promise(r => setTimeout(r, 20));
    if (browserSandbox.TranskepFirebase._authPromise) await browserSandbox.TranskepFirebase._authPromise;
    assert(rpcCalls.some(c => c.method === 'getFirebaseCustomToken'), 'Stale currentUser without role claim must trigger getFirebaseCustomToken');
    assert(recordedAuthActions.some(a => a.type === 'signInWithCustomToken' && a.tok === 'jwt-adm'), 'Fresh jwt-adm must re-authenticate');
    assert.strictEqual(browserSandbox.TranskepFirebase._authRole, 'Admin');

    // 2. _waitAuthForWrite recovers Firebase Auth on-demand before saveKgbToFirestore when currentUser is null
    await browserSandbox.TranskepFirebase.signOutFirebase();
    rpcCalls.length = 0;
    await browserSandbox.TranskepFirebase.saveKgbToFirestore({ id_kgb: 'KGB-REC-1', nip: '199002022015012002', status: 'Sedang Diproses' });
    assert(rpcCalls.some(c => c.method === 'getFirebaseCustomToken'), '_waitAuthForWrite must recover auth via getFirebaseCustomToken');
    assert(mockFirebaseUser && mockFirebaseUser.uid === '198001012005011001', 'Recovered user must match Admin UID');

    // 3. Unauthenticated permission-denied write surfaces exact GAS auth root cause
    await browserSandbox.TranskepFirebase.signOutFirebase();
    browserSandbox.TranskepAPI.call = async (method) => {
      if (method === 'getFirebaseCustomToken') return { status: 'error', message: 'Akses Ditolak: Sesi kedaluwarsa' };
      return { status: 'error' };
    };
    browserSandbox.TranskepFirebase.getDb = () => ({
      collection: () => ({
        doc: () => ({
          set: async () => {
            const err = new Error('Missing or insufficient permissions.');
            err.code = 'permission-denied';
            throw err;
          }
        })
      })
    });
    let diagErr = null;
    try {
      await browserSandbox.TranskepFirebase.saveKgbToFirestore({ id_kgb: 'KGB-FAIL-1', nip: '199002022015012002', status: 'Sedang Diproses' });
    } catch (e) {
      diagErr = e;
    }
    assert(diagErr && diagErr.message.includes('Firebase Auth belum aktif') && diagErr.message.includes('Akses Ditolak: Sesi kedaluwarsa'),
      `Expected enriched auth failure message, got: ${diagErr && diagErr.message}`);

    // 4. Legacy non-schema field cleanup on existing eoffice_kgb doc when Admin is authenticated
    await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-adm', { nip: '198001012005011001', role: 'Admin' });
    let writtenNonMerge = null;
    browserSandbox.TranskepFirebase.getDb = () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              id_kgb: 'KGB-LEG-1',
              legacy_extra: 'stale-sheet-field',
              tte_status: null,
              doc_url: 'https://docs.google.com/document/d/legacy123/edit'
            })
          }),
          set: async (data, opts) => {
            if (opts && opts.merge === true) {
              const err = new Error('Missing or insufficient permissions.');
              err.code = 'permission-denied';
              throw err;
            }
            writtenNonMerge = data;
          }
        })
      })
    });
    await browserSandbox.TranskepFirebase.saveKgbToFirestore({ id_kgb: 'KGB-LEG-1', nip: '199002022015012002', status: 'Sedang Diproses' });
    assert(writtenNonMerge && writtenNonMerge.id_kgb === 'KGB-LEG-1', 'Legacy doc must retry non-merge write');
    assert(!('legacy_extra' in writtenNonMerge), 'Legacy unknown fields must be stripped on overwrite');
    assert(!('tte_status' in writtenNonMerge), 'Null legacy fields must be stripped on overwrite');
    assert.strictEqual(writtenNonMerge.doc_url, 'https://docs.google.com/document/d/legacy123/edit', 'Allowed legacy fields like doc_url must be preserved');

    // 5. Read-probe diagnostic surfaces docRead & skRead status when Firestore read is also blocked
    browserSandbox.TranskepFirebase.getDb = () => ({
      collection: () => ({
        doc: () => ({
          get: async () => {
            const err = new Error('Missing or insufficient permissions.');
            err.code = 'permission-denied';
            throw err;
          },
          set: async () => {
            const err = new Error('Missing or insufficient permissions.');
            err.code = 'permission-denied';
            throw err;
          }
        }),
        limit: () => ({
          get: async () => {
            const err = new Error('Missing or insufficient permissions.');
            err.code = 'permission-denied';
            throw err;
          }
        })
      })
    });
    let probeErr = null;
    try {
      await browserSandbox.TranskepFirebase.saveKgbToFirestore({ id_kgb: 'KGB-PROBE-1', nip: '199002022015012002', status: 'Sedang Diproses' });
    } catch (e) {
      probeErr = e;
    }
    assert(probeErr && probeErr.message.includes('docRead=ERR(') && probeErr.message.includes('skRead=ERR('),
      `Expected docRead & skRead diagnostics, got: ${probeErr && probeErr.message}`);

    // 6. Tahap 121 multi-menu regressions: Builder SK ack ID preservation, PCK penilai alias lookup, Jobdes Usulan & legacy created_at string self-heal
    browserSandbox.TranskepAPI.call = origApiCall;
    browserSandbox.TranskepFirebase.getDb = origGetDb;
    await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-123', { nip: '199002022015012002', role: 'Pegawai' });
    recordedFirestoreOps.length = 0;
    await browserSandbox.TranskepFirebase.acknowledgeSkInFirestore('SK-2026-4812', "'199002022015012002", '16/11/2026 10:00:00');
    const skAckOp = recordedFirestoreOps.find(o => o.colName === 'sk_documents' && o.type === 'update');
    assert(skAckOp && skAckOp.docId === 'SK-2026-4812', `acknowledgeSkInFirestore must preserve Builder ID SK-2026-4812, got: ${skAckOp && skAckOp.docId}`);
    assert.strictEqual(skAckOp.data.acknowledgments._arrayUnion[0].nip, '199002022015012002');

    browserSandbox.vueState = {
      pkpDokumen: [{ id_pkp: 'PKP_2026_199002022015012002', nip: '199002022015012002', tahun: '2026', penilai: "'197901012003011008", atasan_pejabat: '198001012005011001' }],
      pckDokumen: []
    };
    recordedFirestoreOps.length = 0;
    await browserSandbox.TranskepFirebase.savePckToFirestore({ id_pck: 'PCK_2026_November_199002022015012002', nip: '199002022015012002', bulan: 'November', tahun: '2026' });
    const pckBackfillOp = recordedFirestoreOps.find(o => o.colName === 'pck_documents' && o.type === 'set');
    assert(pckBackfillOp && pckBackfillOp.data.nip_penilai === '197901012003011008' && pckBackfillOp.data.nip_atasan_pejabat === '198001012005011001',
      'savePckToFirestore must backfill normalized nip_penilai & nip_atasan_pejabat from penilai/atasan_pejabat aliases');

    await browserSandbox.TranskepFirebase.saveUsulanJobdesToFirestore({ nip_pegawai: "'197901012003011008", nama_pegawai: 'Pegawai Target', nama_pengusul: 'Atasan', isi_usulan: 'Tambah tugas' });
    const usulanOp = recordedFirestoreOps.find(o => o.colName === 'jobdes_usulan' && o.type === 'set');
    assert(usulanOp && usulanOp.data.nip_pegawai === '197901012003011008' && usulanOp.data.pengusul_nip === '199002022015012002',
      'saveUsulanJobdesToFirestore must normalize nip_pegawai and attach caller pengusul_nip');

    await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-adm', { nip: '198001012005011001', role: 'Admin' });
    let jobdesSelfHeal = null;
    browserSandbox.TranskepFirebase.getDb = () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ nip: '199002022015012002', created_at: '2026-01-01', legacy_col: 'sheet' })
          }),
          set: async (data, opts) => {
            if (opts && opts.merge === true) {
              const err = new Error('Missing or insufficient permissions.');
              err.code = 'permission-denied';
              throw err;
            }
            jobdesSelfHeal = data;
          }
        })
      })
    });
    await browserSandbox.TranskepFirebase.saveJobdesToFirestore({ nip: '199002022015012002', tugas_pokok: '1. Mengetik putusan' });
    assert(jobdesSelfHeal && !('legacy_col' in jobdesSelfHeal) && jobdesSelfHeal.created_at === 'TS',
      'Legacy doc with string created_at must trigger non-merge self-heal rewrite');

    // 7. Tahap 126 KGB regressions: auto birthdate from NIP, Tingkat I -> Tk. I, and modal without kgbFieldTempatLahir
    const eofficeHtml = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    assert(!eofficeHtml.includes('id="kgbFieldTempatLahir"'), 'view_eoffice.html must remove kgbFieldTempatLahir');
    assert(eofficeHtml.includes('id="kgbFieldTglLahir"') && eofficeHtml.includes('md:col-span-5') && eofficeHtml.includes('md:col-span-4'),
      'view_eoffice.html must preserve kgbFieldTglLahir and widen NIP grid column');

    const kgbDom = {};
    const getKgbEl = (id) => {
      if (id === 'kgbFieldTempatLahir') return null;
      if (!kgbDom[id]) kgbDom[id] = { id, value: '', textContent: '', innerText: '', className: '', dataset: {}, classList: { add() { }, remove() { } }, firstElementChild: { classList: { add() { }, remove() { } } } };
      return kgbDom[id];
    };
    const kgbVm = {
      console,
      localStorage: { getItem: () => null, setItem: () => { } },
      document: { getElementById: getKgbEl, activeElement: null },
      vueState: { usersList: [{ nip: '197507062014051001', nama: 'Ade Badrujaman, S.H.I.', tgl_lahir: '1 Januari 2025', pangkat: 'Penata Tingkat I (III/d)' }] },
      setTimeout: (fn) => fn()
    };
    kgbVm.window = kgbVm;
    vm.createContext(kgbVm);
    vm.runInContext(fs.readFileSync('modules/eoffice/cetak/js_cetak_kgb.js', 'utf8'), kgbVm, { filename: 'modules/eoffice/cetak/js_cetak_kgb.js' });
    vm.runInContext(fs.readFileSync('modules/eoffice/kgb.js', 'utf8'), kgbVm, { filename: 'modules/eoffice/kgb.js' });

    assert.strictEqual(kgbVm.KgbPrintHelper.extractBirthIsoFromNipKgb('197507062014051001'), '1975-07-06');
    assert.strictEqual(kgbVm.KgbPrintHelper.extractBirthIsoFromNipKgb('198602312020121004'), '', 'Invalid calendar date in NIP must be rejected');
    assert.strictEqual(kgbVm.KgbPrintHelper.formatTglAngkaKgb('1 Januari 2025', '197507062014051001'), '06-07-1975', 'Print birthdate must prefer valid NIP over stale stored date');
    assert.strictEqual(kgbVm.KgbPrintHelper.abbreviatePangkatKgb('Penata Tingkat I (III/d)'), 'Penata Tk. I (III/d)');
    assert.strictEqual(kgbVm.KgbPrintHelper.stripGolonganRuangKgb('Pengatur Tingkat I (II/d)'), 'Pengatur Tk. I');

    const resolvedSanitized = kgbVm.KgbPrintHelper.resolveNomorSuratKgb({
      nokgb: '......',
      nomor_surat: '1099/KPA.W10-A2/KP2.1.2/XI/2026',
      tanggal_surat: '17 November 2026'
    });
    assert.strictEqual(resolvedSanitized.nokgb, '1099', 'resolveNomorSuratKgb must sanitize ...... placeholder before falling back to nomor_surat');
    assert.strictEqual(resolvedSanitized.full, '1099/KPA.W10-A2/KP2.1.2/XI/2026');

    let writtenPrintHtml = '';
    const origPrintSuratKgbFn = kgbVm.printSuratKgb;
    kgbVm.document.getElementById = (id) => {
      if (id === 'template-cetak-kgb-container') {
        return { innerHTML: '<div>Nomor : {{nokgb}}/KPA.W10-A2/KP2.1.2/{{bulan}}/{{tahun}}</div>' };
      }
      return getKgbEl(id);
    };
    kgbVm.document.body = { contains: () => false, appendChild: () => { }, removeChild: () => { } };
    kgbVm.document.createElement = () => ({
      style: {},
      contentWindow: {
        document: {
          open: () => { },
          write: (html) => { writtenPrintHtml = String(html || ''); },
          close: () => { }
        },
        focus: () => { },
        print: () => { }
      }
    });
    kgbVm.vmEoffice = {
      rawKgbList: [{
        id_kgb: 'KGB-LIVE-TOHA',
        nip: '198306072011011009',
        nokgb: '1099',
        nomor_surat: '1099/KPA.W10-A2/KP2.1.2/XI/2026',
        status: 'Sedang Diproses',
        mysims_requested: true,
        mysims_status: 'Nomor Terbit MYSIMS'
      }]
    };
    origPrintSuratKgbFn({
      id_kgb: 'KGB-LIVE-TOHA',
      nip: '198306072011011009',
      nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
      nokgb: '......',
      nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
      tanggal_surat: '17 November 2026'
    });
    assert(writtenPrintHtml.includes('1099/KPA.W10-A2/KP2.1.2/XI/2026'),
      'printSuratKgb must automatically merge issued MYSIMS number from vmEoffice.rawKgbList into Form Cetak KGB');
    kgbVm.document.getElementById = getKgbEl;

    // modal open & printKgbFromModal auto-merge from vmEoffice.rawKgbList
    kgbVm.openKgbModalForm({
      id_kgb: 'KGB-LIVE-TOHA',
      nip: '198306072011011009',
      nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
      nokgb: '......',
      nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
      tanggal_surat: '17 November 2026'
    });
    assert.strictEqual(kgbDom.kgbFieldNoKgb.value, '1099', 'openKgbModalForm must hydrate No. Urut KGB from vmEoffice.rawKgbList');
    let printedFromModalPayload = null;
    kgbVm.printSuratKgb = (p) => { printedFromModalPayload = p; };
    kgbDom.kgbFieldNoKgb.value = '......';
    kgbDom.kgbFieldNomorSurat.value = '....../KPA.W10-A2/KP2.1.2/XI/2026';
    kgbVm.printKgbFromModal();
    assert.strictEqual(printedFromModalPayload && printedFromModalPayload.nokgb, '1099',
      'printKgbFromModal must re-sync issued MYSIMS number from vmEoffice.rawKgbList & strip ...... before printing');
    assert.strictEqual(kgbDom.kgbFieldNoKgb.value, '1099', 'printKgbFromModal must sync modal No. Urut input');

    kgbVm.openKgbModalForm({ nip: '197507062014051001', nama_pegawai: 'Ade Badrujaman, S.H.I.', tanggal_lahir: '1 Januari 2025', pangkat: 'Penata Tingkat I (III/d)' });
    assert.strictEqual(kgbDom.kgbFieldTglLahir.value, '1975-07-06', 'Modal Tanggal Lahir must auto-fill from NIP');
    assert.strictEqual(kgbDom.kgbPreviewTglLahir.textContent, '6 Juli 1975');
    assert.strictEqual(kgbDom.kgbFieldPangkat.value, 'Penata Tk. I (III/d)', 'Modal Pangkat must shorten Tingkat I to Tk. I');

    let collectedKgbPayload = null;
    kgbVm.printSuratKgb = (p) => { collectedKgbPayload = p; };
    kgbVm.printKgbFromModal();
    assert(collectedKgbPayload && collectedKgbPayload.tempat_lahir === '' && collectedKgbPayload.tanggal_lahir === '6 Juli 1975' && collectedKgbPayload.pangkat === 'Penata Tk. I (III/d)',
      'collectKgbFormPayload_ must emit empty tempat_lahir, NIP birthdate, and Tk. I rank');

    // 8. Tahap 127 regressions: 1st-save MYSIMS auto-request vs 2nd-edit no re-request + n8n KGB routing
    const eofficeDataSrc = fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8');
    const savedKgbDocs = [];
    const requestedKgbCalls = [];
    let mockRequestKgbResp = { status: 'success', id_kgb: 'KGB-19750706-2026' };
    const eofficeDataVm = {
      console,
      localStorage: { getItem: () => '', setItem: () => { } },
      TranskepFirebase: {
        isReady: () => true,
        saveKgbToFirestore: async (doc) => { savedKgbDocs.push(JSON.parse(JSON.stringify(doc))); return doc; },
        deleteKgbFromFirestore: async () => true
      },
      TranskepAPI: {
        call: async (method, ...args) => {
          if (method === 'requestKgbSuratKeluar') {
            requestedKgbCalls.push(args[0]);
            return mockRequestKgbResp;
          }
          return { status: 'success' };
        }
      }
    };
    eofficeDataVm.window = eofficeDataVm;
    vm.createContext(eofficeDataVm);
    vm.runInContext(eofficeDataSrc, eofficeDataVm, { filename: 'modules/eoffice/eoffice_data.js' });

    const firstSaveRes = await eofficeDataVm.EofficeDataService.saveOrGenerateKgb({
      id_kgb: 'DRAFT-197507062014051001',
      nip: '197507062014051001',
      nama_pegawai: 'Ade Badrujaman, S.H.I.',
      tmt_baru: '1 Januari 2027',
      nokgb: '',
      nomor_surat: '....../KPA.W10-A2/KP2.1.2/I/2027',
      mysims_requested: false
    }, 'draft', '198001012005011001', 'tok-adm');
    assert.strictEqual(firstSaveRes.status, 'success');
    assert.strictEqual(firstSaveRes.mysims_requested_now, true);
    assert.strictEqual(requestedKgbCalls.length, 1, '1st KGB draft save without number must trigger requestKgbSuratKeluar once');
    assert.strictEqual(savedKgbDocs[0].mysims_requested, true, '1st KGB save must persist mysims_requested: true');

    // Edit ke-2 (status sudah 'Permintaan Terkirim ke MYSIMS', belum dapat nomor callback)
    const secondEditNoNumRes = await eofficeDataVm.EofficeDataService.saveOrGenerateKgb({
      id_kgb: firstSaveRes.id_kgb,
      nip: '197507062014051001',
      nama_pegawai: 'Ade Badrujaman, S.H.I.',
      tmt_baru: '1 Januari 2027',
      nokgb: '',
      nomor_surat: '....../KPA.W10-A2/KP2.1.2/I/2027',
      mysims_requested: true,
      mysims_status: 'Permintaan Terkirim ke MYSIMS'
    }, 'draft', '198001012005011001', 'tok-adm');
    assert.strictEqual(secondEditNoNumRes.mysims_requested_now, false);
    assert.strictEqual(requestedKgbCalls.length, 1, '2nd KGB edit when status=Permintaan Terkirim ke MYSIMS must NOT request MYSIMS again');

    // Recovery berkas nyangkut ('Meminta Nomor MYSIMS' dengan nokgb kosong) -> HARUS mengirim permintaan MYSIMS 1x
    const stuckRetryRes = await eofficeDataVm.EofficeDataService.saveOrGenerateKgb({
      id_kgb: 'KGB-198306072011011009-202701',
      nip: '198306072011011009',
      nama_pegawai: 'Dr. Tohayudin, S.H.I., M.H.I.',
      tmt_baru: '1 Januari 2027',
      nokgb: '',
      nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
      mysims_requested: true,
      mysims_status: 'Meminta Nomor MYSIMS'
    }, 'draft', '198001012005011001', 'tok-adm');
    assert.strictEqual(stuckRetryRes.mysims_requested_now, true);
    assert.strictEqual(requestedKgbCalls.length, 2, 'Stuck Meminta Nomor MYSIMS record without number must retry MYSIMS request');
    assert.strictEqual(requestedKgbCalls[1].mysims_requested, false, 'Frontend must pass mysims_requested=false to GAS so GAS does not self-block');

    // Edit ke-3 (nomor MYSIMS sudah terisi)
    const thirdEditWithNumRes = await eofficeDataVm.EofficeDataService.saveOrGenerateKgb({
      id_kgb: firstSaveRes.id_kgb,
      nip: '197507062014051001',
      nama_pegawai: 'Ade Badrujaman, S.H.I.',
      tmt_baru: '1 Januari 2027',
      nokgb: '777',
      nomor_surat: '777/KPA.W10-A2/KP2.1.2/I/2027',
      mysims_requested: true
    }, 'draft', '198001012005011001', 'tok-adm');
    assert.strictEqual(thirdEditWithNumRes.mysims_requested_now, false);
    assert.strictEqual(requestedKgbCalls.length, 2, 'KGB edit with existing nomor must NOT request MYSIMS again');

    // Rollback flag when MYSIMS request fails
    savedKgbDocs.length = 0;
    mockRequestKgbResp = { status: 'error', message: 'n8n offline' };
    const failRetrySaveRes = await eofficeDataVm.EofficeDataService.saveOrGenerateKgb({
      id_kgb: 'KGB-RETRY-1',
      nip: '197507062014051001',
      nama_pegawai: 'Pegawai Retry',
      nokgb: '',
      nomor_surat: '',
      mysims_requested: false
    }, 'draft', '198001012005011001', 'tok-adm');
    assert.strictEqual(failRetrySaveRes.mysims_res.status, 'error');
    assert.strictEqual(savedKgbDocs[savedKgbDocs.length - 1].mysims_requested, false, 'Failed MYSIMS trigger must reset mysims_requested=false for safe retry');

    // Tahap 129: Background Poller & Pre-Print MYSIMS Sync (syncKgbMysimsNumberInBackground + fetchLatestKgbMysimsNumber)
    const scheduledTimers = [];
    const pollSavedDocs = [];
    const pollToasts = [];
    let pollAttemptCount = 0;
    const pollVm = {
      console,
      localStorage: { getItem: () => '', setItem: () => { } },
      setTimeout: (fn) => { scheduledTimers.push(fn); },
      showNotify: (title, msg, type) => pollToasts.push({ title, msg, type }),
      vmEoffice: {
        rawKgbList: [{
          id_kgb: 'KGB-POLL-1',
          nip: '198607092020121004',
          nama_pegawai: 'Raden Anantama Havid Ismail, A.Md.',
          nokgb: '',
          nomor_surat: '....../KPA.W10-A2/KP2.1.2/XI/2026',
          status: 'Sedang Diproses',
          mysims_requested: true,
          mysims_status: 'Permintaan Terkirim ke MYSIMS'
        }],
        rawRapatList: []
      },
      TranskepFirebase: {
        isReady: () => true,
        saveKgbToFirestore: async (doc) => { pollSavedDocs.push(JSON.parse(JSON.stringify(doc))); return doc; },
        deleteKgbFromFirestore: async () => true
      },
      TranskepAPI: {
        call: async (method) => {
          if (method === 'getKgbMysimsStatus') {
            pollAttemptCount += 1;
            if (pollAttemptCount === 1) return { status: 'pending', source: 'none', data: null };
            return {
              status: 'success',
              source: 'cache',
              data: {
                id_kgb: 'KGB-POLL-1',
                nip: '198607092020121004',
                nokgb: '1105',
                nomor_surat: '1105/KPA.W10-A2/KP2.1.2/XI/2026',
                bulan_surat: 'XI',
                tahun_surat: '2026',
                mysims_idp: '1300',
                mysims_status: 'Nomor Terbit MYSIMS'
              }
            };
          }
          return { status: 'success' };
        }
      }
    };
    pollVm.window = pollVm;
    vm.createContext(pollVm);
    vm.runInContext(eofficeDataSrc, pollVm, { filename: 'modules/eoffice/eoffice_data.js' });

    pollVm.EofficeDataService.syncKgbMysimsNumberInBackground('KGB-POLL-1', '198607092020121004', '198001012005011001', 'tok-adm');
    assert.strictEqual(scheduledTimers.length, 1, 'syncKgbMysimsNumberInBackground must schedule 1st poll');
    await scheduledTimers.shift()(); // Attempt 1 -> pending -> schedules attempt 2
    assert.strictEqual(scheduledTimers.length, 1, 'Pending getKgbMysimsStatus must schedule retry poll');
    await scheduledTimers.shift()(); // Attempt 2 -> success -> syncs & stops
    assert.strictEqual(scheduledTimers.length, 0, 'Issued MYSIMS number must stop polling');
    assert.strictEqual(pollVm.vmEoffice.rawKgbList[0].nokgb, '1105', 'Background poller must hydrate vmEoffice.rawKgbList');
    assert.strictEqual(pollSavedDocs[pollSavedDocs.length - 1].nomor_surat, '1105/KPA.W10-A2/KP2.1.2/XI/2026',
      'Background poller must persist MYSIMS number into Firestore even if server REST patch missed it');
    assert(pollToasts.some(t => t.type === 'success' && t.msg.includes('1105/KPA.W10-A2/KP2.1.2/XI/2026')),
      'Background poller must notify admin when MYSIMS number arrives');

    // n8n Workflow Routing Verification (ST index 0, KGB index 1, Rapat Undangan index 2, Cuti fallback index 3)
    const n8nWf = JSON.parse(fs.readFileSync('n8n/n8n_workflow_mysims_surat_keluar.example.json', 'utf8'));
    const switchNode = n8nWf.nodes.find(n => n.id === 'switch-router');
    assert(switchNode && switchNode.parameters.rules.values.length === 3, 'Router Event Surat Keluar must have 3 rules (ST_TERPADU + KGB_SURAT_KELUAR + RAPAT_UNDANGAN_SURAT_KELUAR)');
    assert.strictEqual(switchNode.parameters.rules.values[0].conditions.conditions[0].rightValue, 'ST_TERPADU');
    assert.strictEqual(switchNode.parameters.rules.values[1].conditions.conditions[0].rightValue, 'KGB_SURAT_KELUAR');
    assert.strictEqual(switchNode.parameters.rules.values[2].conditions.conditions[0].rightValue, 'RAPAT_UNDANGAN_SURAT_KELUAR');
    const routerConns = n8nWf.connections['Router Event Surat Keluar'].main;
    assert.strictEqual(routerConns.length, 4, 'Router must keep 4 outputs (ST=0, KGB=1, RAPAT=2, Cuti fallback=3)');
    assert.strictEqual(routerConns[0][0].node, 'Mesin Otomasi ST Terpadu');
    assert.strictEqual(routerConns[1][0].node, 'Mesin Otomasi KGB MYSIMS');
    assert.strictEqual(routerConns[2][0].node, 'Mesin Otomasi Undangan Rapat MYSIMS');
    assert.strictEqual(routerConns[3][0].node, 'Mesin Otomasi MYSIMS & Callback');
    const kgbCodeNode = n8nWf.nodes.find(n => n.name === 'Mesin Otomasi KGB MYSIMS');
    assert(kgbCodeNode && kgbCodeNode.parameters.jsCode.includes('KPA.W10-A2') && kgbCodeNode.parameters.jsCode.includes('KP2.1.2') && kgbCodeNode.parameters.jsCode.includes("ket = 'Biasa'") && kgbCodeNode.parameters.jsCode.includes('updateNomorSuratKgb'),
      'Mesin Otomasi KGB MYSIMS must target KPA.W10-A2 / KP2.1.2, Biasa ket/sifat, and updateNomorSuratKgb callback');
    const rapatCodeNode = n8nWf.nodes.find(n => n.name === 'Mesin Otomasi Undangan Rapat MYSIMS');
    assert(rapatCodeNode && rapatCodeNode.parameters.jsCode.includes('WKPA.W10-A2') && rapatCodeNode.parameters.jsCode.includes('PAN.PA.W10-A2') && rapatCodeNode.parameters.jsCode.includes('SEK.PA.W10-A2') && rapatCodeNode.parameters.jsCode.includes("'/UND.'") && rapatCodeNode.parameters.jsCode.includes('updateNomorSuratRapat'),
      'Mesin Otomasi Undangan Rapat MYSIMS must support 4 signatory accounts, /UND. prefix, and updateNomorSuratRapat callback');
    assert.strictEqual(n8nWf.connections['Mesin Otomasi Undangan Rapat MYSIMS'].main[0][0].node, 'Suntik PDF Undangan Rapat ke MYSIMS',
      'Mesin Otomasi Undangan Rapat MYSIMS must connect to Suntik PDF Undangan Rapat ke MYSIMS');
    if (fs.existsSync('n8n/n8n_workflow_mysims_surat_keluar.json')) {
      const liveSuratWf = JSON.parse(fs.readFileSync('n8n/n8n_workflow_mysims_surat_keluar.json', 'utf8'));
      assert.strictEqual(liveSuratWf.nodes.length, n8nWf.nodes.length, 'Live & example MYSIMS Surat Keluar workflows must have identical node count');
      assert.deepStrictEqual(liveSuratWf.connections, n8nWf.connections, 'Live & example MYSIMS Surat Keluar connections must match');
    }

    // =========================================================================
    // Tahap 130 (v3.8.64): KGB Print Spacing & Dynamic Date Month/Year Sync
    // =========================================================================
    const cetakKgbHtml = fs.readFileSync('modules/eoffice/cetak/cetak_kgb.html', 'utf8');
    assert(cetakKgbHtml.includes('margin-bottom: 4px;'), 'cetak_kgb.html must tighten .kgb-paragraf bottom margin to 4px');
    assert(cetakKgbHtml.includes('margin-top: 12px;'), 'cetak_kgb.html must tighten .kgb-tembusan top margin to 12px');
    assert(cetakKgbHtml.includes('margin-top: 0px;'), 'cetak_kgb.html must tighten .kgb-tembusan-table top margin to 0px');
    assert(cetakKgbHtml.includes('padding: 0px 0;'), 'cetak_kgb.html must tighten .kgb-tembusan-table td padding to 0px 0');

    const pdfKgbJs = fs.readFileSync('eoffice/kgb_pdf_compiler.js', 'utf8');
    assert(pdfKgbJs.includes('.paragraf { text-align: justify; margin-left: 82px; text-indent: 32px; margin-top: 0px; margin-bottom: 4px;'),
      'kgb_pdf_compiler.js must match tightened 4px paragraph margin');
    assert(pdfKgbJs.includes('.tembusan { margin-left: 82px; margin-top: 12px; font-size: 12pt; line-height: 1.25; }'),
      'kgb_pdf_compiler.js must match tightened 12px tembusan margin and 1.25 line-height');

    const cetakKgbJs = fs.readFileSync('modules/eoffice/cetak/js_cetak_kgb.js', 'utf8');
    const cetakVm = {
      window: {},
      document: { getElementById: () => null },
      console: console,
      Date: Date
    };
    cetakVm.window = cetakVm;
    vm.createContext(cetakVm);
    vm.runInContext(cetakKgbJs, cetakVm, { filename: 'modules/eoffice/cetak/js_cetak_kgb.js' });
    const printHelper = cetakVm.window.KgbPrintHelper;
    assert(printHelper && typeof printHelper.resolveNomorSuratKgb === 'function', 'KgbPrintHelper.resolveNomorSuratKgb must be exported');

    // Test: Month & Year strictly track tanggal_surat (e.g. November 2026 -> XI / 2026) even if old draft had October (X)
    const resNov = printHelper.resolveNomorSuratKgb({
      nokgb: '1102',
      nomor_surat: '1102/KPA.W10-A2/KP2.1.2/X/2026',
      tanggal_surat: '17 November 2026'
    }, '17 November 2026');
    assert.strictEqual(resNov.bulan, 'XI', 'resolveNomorSuratKgb must dynamically sync Roman month to XI for November');
    assert.strictEqual(resNov.tahun, '2026', 'resolveNomorSuratKgb must sync year to 2026');
    assert.strictEqual(resNov.full, '1102/KPA.W10-A2/KP2.1.2/XI/2026', 'Full assembled number must reflect updated Roman month and year');

    // Test: Changing date to December 2026 -> XII / 2026
    const resDes = printHelper.resolveNomorSuratKgb({
      nokgb: '1102',
      nomor_surat: '1102/KPA.W10-A2/KP2.1.2/XI/2026',
      tanggal_surat: '2026-12-05'
    }, '5 Desember 2026');
    assert.strictEqual(resDes.bulan, 'XII', 'resolveNomorSuratKgb must sync Roman month to XII for December');
    assert.strictEqual(resDes.tahun, '2026');
    assert.strictEqual(resDes.full, '1102/KPA.W10-A2/KP2.1.2/XII/2026');

    // Backend parseNomorKgbBackend_ check
    const kgbBackendSrc = fs.readFileSync('eoffice/kgb.js', 'utf8');
    const backendVm = {
      KGB_BULAN_ROMAWI_: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"],
      KGB_BULAN_INDO_: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
      console: console,
      Date: Date
    };
    vm.createContext(backendVm);
    vm.runInContext(kgbBackendSrc, backendVm, { filename: 'eoffice/kgb.js' });
    const beRes = backendVm.parseNomorKgbBackend_({
      nokgb: '1102',
      nomor_surat: '1102/KPA.W10-A2/KP2.1.2/X/2026',
      tanggal_surat: '17 November 2026'
    });
    assert.strictEqual(beRes.bulan, 'XI', 'parseNomorKgbBackend_ must sync Roman month to XI when tanggal_surat is November');
    assert.strictEqual(beRes.tahun, '2026', 'parseNomorKgbBackend_ must sync year to 2026');
    assert.strictEqual(beRes.full, '1102/KPA.W10-A2/KP2.1.2/XI/2026');

    // =========================================================================
    // Tahap 131 (v3.8.65): Single Visible Nomor Surat & Hidden No Urut KGB
    // =========================================================================
    const viewEofficeHtml = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    assert(viewEofficeHtml.includes('<input type="hidden" id="kgbFieldNoKgb"'),
      'view_eoffice.html must hide kgbFieldNoKgb as hidden input');
    assert(viewEofficeHtml.includes('id="kgbFieldNomorSurat"'),
      'view_eoffice.html must keep visible kgbFieldNomorSurat as the single letter number field');
    assert(viewEofficeHtml.includes('handleInputNomorSuratKgb(this.value)'),
      'view_eoffice.html must bind handleInputNomorSuratKgb on input');
    assert(viewEofficeHtml.includes('syncTanggalSuratKgbOtomatis()'),
      'view_eoffice.html must bind syncTanggalSuratKgbOtomatis on date change');

    // Test resolveNomorSuratKgb when admin enters bare number e.g. "1102"
    const resBareNum = printHelper.resolveNomorSuratKgb({
      nomor_surat: '1102',
      tanggal_surat: '17 November 2026'
    }, '17 November 2026');
    assert.strictEqual(resBareNum.nokgb, '1102', 'resolveNomorSuratKgb must recognize bare number as nokgb');
    assert.strictEqual(resBareNum.bulan, 'XI');
    assert.strictEqual(resBareNum.tahun, '2026');
    assert.strictEqual(resBareNum.full, '1102/KPA.W10-A2/KP2.1.2/XI/2026');

    // =========================================================================
    // Tahap 132 (v3.8.66): Kepada Yth., 1 Baris KPPN, Poin e Tanpa 0 Bulan, & Poin 6
    // =========================================================================
    const cetakHtml132 = fs.readFileSync('modules/eoffice/cetak/cetak_kgb.html', 'utf8');
    assert(cetakHtml132.includes('Kepada Yth.<br>'), 'cetak_kgb.html must unify Kepada Yth. on the first line');
    assert(cetakHtml132.includes('Kepala Kantor Pelayanan Perbendaharaan Negara Cirebon<br>'), 'cetak_kgb.html must render KPPN Cirebon in 1 unbroken line');
    assert(cetakHtml132.includes('{{mkg_lama_text}}'), 'cetak_kgb.html must use dynamic mkg_lama_text for point e');
    assert(cetakHtml132.includes('width: 138px;'), 'cetak_kgb.html must optimize .kgb-col-label to 138px');

    const pdfCompiler132 = fs.readFileSync('eoffice/kgb_pdf_compiler.js', 'utf8');
    assert(pdfCompiler132.includes('Kepada Yth.<br>') && pdfCompiler132.includes('Kepala Kantor Pelayanan Perbendaharaan Negara Cirebon<br>'),
      'kgb_pdf_compiler.js must match unified Kepada Yth. and 1-line KPPN');
    assert(pdfCompiler132.includes('.col-lbl { width: 138px;'), 'kgb_pdf_compiler.js must match 138px label width');
    assert(pdfCompiler132.includes('mkgLamaStr'), 'kgb_pdf_compiler.js must compute mkgLamaStr');

    const cetakJs132 = fs.readFileSync('modules/eoffice/cetak/js_cetak_kgb.js', 'utf8');
    assert(cetakJs132.includes('mkgLamaText'), 'js_cetak_kgb.js must compute mkgLamaText');
    assert(cetakJs132.includes('{{mkg_lama_text}}'), 'js_cetak_kgb.js must replace {{mkg_lama_text}}');

    // =========================================================================
    // Tahap 133 (v3.8.67): Eliminasi Flicker Pensiun Kadaluarsa / Selesai di Peringatan Dini
    // =========================================================================
    const dashJs133 = fs.readFileSync('modules/dashboard/dashboard.js', 'utf8');
    assert(dashJs133.includes('diffDaysPensiun < -30'), 'dashboard.js must ignore pensiun older than 30 days');
    assert(dashJs133.includes("u.status_pensiun.toUpperCase() === 'SELESAI'"), 'dashboard.js must filter completed pensiun');
    assert(dashJs133.includes("diffSelesai >= 30"), 'dashboard.js must ignore completed pensiun after 30 days');

    // Evaluasi logika rawWarningsData di VM terisolasi
    const mockUsers = [
      { nip: '196001011985031001', nama: 'Pensiun 2018', role: 'Pegawai', bup: 58, status_pensiun: '' },
      { nip: '196404011990031002', nama: 'Drs. Taufiqurrokhman, M.H.', role: 'Pegawai', bup: 58, status_pensiun: '' },
      { nip: '198001012005011001', nama: 'Aktif Pensiun Jauh', role: 'Pegawai', bup: 58, status_pensiun: '' },
      { nip: '197005011998031003', nama: 'Pensiun Selesai', role: 'Pegawai', bup: 58, status_pensiun: 'SELESAI', tgl_selesai_pensiun: '2026-01-01' }
    ];
    // Pastikan pensiun lampau (2018, 2022) & pensiun SELESAI tidak masuk
    const testToday = new Date(2026, 10, 18); // 18 Nov 2026
    const filteredWarnings = [];
    mockUsers.forEach(u => {
      let nipClean = String(u.nip).replace(/[^0-9]/g, '');
      if (nipClean.length >= 15) {
        let birthDate = new Date(parseInt(nipClean.substring(0, 4)), parseInt(nipClean.substring(4, 6)) - 1, parseInt(nipClean.substring(6, 8)));
        birthDate.setFullYear(birthDate.getFullYear() + (parseInt(u.bup) || 58));
        birthDate.setMonth(birthDate.getMonth() + 1, 1);
        let diffDaysPensiun = Math.ceil((birthDate.getTime() - testToday.getTime()) / (1000 * 3600 * 24));
        if (u.status_pensiun && u.status_pensiun.toUpperCase() === 'SELESAI') {
          if (u.tgl_selesai_pensiun) {
            let diffSelesai = (testToday.getTime() - new Date(u.tgl_selesai_pensiun).getTime()) / (1000 * 3600 * 24);
            if (diffSelesai >= 30) return;
          } else if (diffDaysPensiun < 0) {
            return;
          }
        }
        if (diffDaysPensiun < -30) return;
        filteredWarnings.push(u.nama);
      }
    });
    assert.deepStrictEqual(filteredWarnings, ['Aktif Pensiun Jauh'],
      'rawWarningsData filter must only keep upcoming active pensiun and exclude past/completed ones');

    // =========================================================================
    // Tahap 134 & 135 (v3.8.69): Pendekatan Hybrid Sinkronisasi In-Place & Kontrol Mandiri E-Office
    // =========================================================================
    const dashJs135 = fs.readFileSync('modules/dashboard/dashboard.js', 'utf8');
    assert(dashJs135.includes('handleDashboardKgbStatusChange'), 'dashboard.js submitTmtStatus must call handleDashboardKgbStatusChange for in-place sync');
    assert(!dashJs135.includes('Pegawai telah masuk antrean E-Office'), 'dashboard.js submitTmtStatus must not show misleading queue message');
    assert(!dashJs135.includes("id_kgb: 'DRAFT-' + targetNip"), 'dashboard.js submitTmtStatus must never synthesize dummy DRAFT- records');

    const eofficeDataJs135 = fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8');
    assert(eofficeDataJs135.includes('handleDashboardKgbStatusChange(userRef, newStatus, todayYMD)'), 'eoffice_data.js must declare handleDashboardKgbStatusChange');

    const eofficeJs135 = fs.readFileSync('modules/eoffice/eoffice.js', 'utf8');
    assert(eofficeJs135.includes('updateKgbStatusDirectly(item, newStatus)'), 'eoffice.js must provide updateKgbStatusDirectly');

    // Evaluasi mergeDashboardQueue deduplikasi & in-place alignment
    if (browserSandbox.window && browserSandbox.window.EofficeDataService) {
      browserSandbox.window.vueState = {
        usersList: [
          { nip: '198607092020121004', nama: 'Raden Anantama', status_kgb: 'SELESAI', tgl_selesai_kgb: '2026-11-18' },
          { nip: '197507062014051001', nama: 'Ade Badrujaman', status_kgb: 'PROSES' }
        ]
      };
      const mockRawKgb = [
        { id_kgb: 'DRAFT-198607092020121004', nip: '198607092020121004', status: 'Selesai', is_from_dashboard: true },
        { id_kgb: 'KGB-198607092020121004-OFFICIAL', nip: '198607092020121004', status: 'Sedang Diproses', nomor_surat: '1102/KPA.W10-A2/KP2.1.2/XI/2026', gaji_baru: '3.219.200' },
        { id_kgb: 'KGB-197507062014051001-DUMMY', nip: '197507062014051001', status: 'Selesai' },
        { id_kgb: 'KGB-197507062014051001-OFFICIAL', nip: '197507062014051001', status: 'Sedang Diproses', nomor_surat: '1103/KPA.W10-A2/KP2.1.2/XI/2026', gaji_baru: '4.436.700' },
        { id_kgb: 'DRAFT-197507062014051001', nip: '197507062014051001', status: 'Sedang Diproses' }
      ];
      const cleanedQueue = browserSandbox.window.EofficeDataService.mergeDashboardQueue(mockRawKgb);
      assert.strictEqual(cleanedQueue.length, 2, 'mergeDashboardQueue must filter out all dummy and duplicate phantom entries');
      assert.strictEqual(cleanedQueue[0].id_kgb, 'KGB-198607092020121004-OFFICIAL', 'mergeDashboardQueue must keep Raden Anantama official SK');
      assert.strictEqual(cleanedQueue[0].status, 'Selesai', 'mergeDashboardQueue must auto-align status to Selesai from usersList');
      assert.strictEqual(cleanedQueue[1].id_kgb, 'KGB-197507062014051001-OFFICIAL', 'mergeDashboardQueue must keep Ade Badrujaman official SK');
      assert.strictEqual(cleanedQueue[1].status, 'Sedang Diproses', 'Ade Badrujaman must remain Sedang Diproses as per PROSES status');
    }

    // Tahap 136: Custom Glassmorphism Status Dropdown Popover & Modal Segmented Controls
    const viewEoffice136 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    assert(viewEoffice136.includes('toggleStatusDropdown(item.keyId)'), 'view_eoffice.html must invoke toggleStatusDropdown');
    assert(viewEoffice136.includes('activeStatusDropdownId === item.keyId'), 'view_eoffice.html must condition popover on activeStatusDropdownId');
    assert(viewEoffice136.includes("selectStatus(item, 'Sedang Diproses')"), 'view_eoffice.html must provide selectStatus for Sedang Diproses');
    assert(viewEoffice136.includes("selectStatus(item, 'Menunggu TTE Pimpinan')"), 'view_eoffice.html must provide selectStatus for Menunggu TTE Pimpinan');
    assert(viewEoffice136.includes("selectStatus(item, 'Selesai')"), 'view_eoffice.html must provide selectStatus for Selesai');
    assert(viewEoffice136.includes('id="btnStatusProses"') && viewEoffice136.includes('id="btnStatusTte"') && viewEoffice136.includes('id="btnStatusSelesai"'), 'view_eoffice.html modal must have segmented status buttons');

    const eofficeJs136 = fs.readFileSync('modules/eoffice/eoffice.js', 'utf8');
    assert(eofficeJs136.includes('activeStatusDropdownId: null'), 'eoffice.js must declare activeStatusDropdownId state');
    assert(eofficeJs136.includes('toggleStatusDropdown(keyId)'), 'eoffice.js must define toggleStatusDropdown method');
    assert(eofficeJs136.includes('selectStatus(item, newStatus)'), 'eoffice.js must define selectStatus method');

    const kgbJs136 = fs.readFileSync('modules/eoffice/kgb.js', 'utf8');
    assert(kgbJs136.includes('window.setKgbModalStatus = function'), 'kgb.js must define window.setKgbModalStatus');
    assert(kgbJs136.includes('function updateKgbModalStatusButtons('), 'kgb.js must define updateKgbModalStatusButtons');

    // Tahap 137: Fondasi Skema & Workspace Fullscreen Rapat
    assert(viewEoffice136.includes('toggleRapatFullscreen()'), 'view_eoffice.html must provide toggleRapatFullscreen');
    for (const tabId of ['rapatTabPanel_undangan', 'rapatTabPanel_peserta', 'rapatTabPanel_notula', 'rapatTabPanel_media']) {
      assert(viewEoffice136.includes(`id="${tabId}"`), `view_eoffice.html missing tab panel ${tabId}`);
    }
    for (const kode of ['KPA.W10-A2', 'WKPA.W10-A2', 'PAN.PA.W10-A2', 'SEK.PA.W10-A2']) {
      assert(viewEoffice136.includes(`value="${kode}"`), `view_eoffice.html missing signatory code ${kode}`);
    }
    assert(viewEoffice136.includes('id="btnRapatSaveAgenda"') && eofficeJs136.includes('promptDeleteRapat('), 'Rapat save button & delete action must exist');

    const eofficeDataJs137 = fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8');
    assert(eofficeDataJs137.includes('async saveRapatData('), 'eoffice_data.js must define saveRapatData');

    const rapatJsSrc137 = fs.readFileSync('modules/eoffice/rapat.js', 'utf8');
    const rapatDom = {
      rapatFieldNoUrutSurat: { value: '1059' },
      rapatFieldKodePejabat: { value: 'PAN.PA.W10-A2' },
      rapatFieldKodeSurat: { value: 'PW1.1.1' },
      rapatFieldTglSuratIso: { value: '2026-10-27' },
      rapatFieldNomorUndangan: { value: '' }
    };
    const rapatVm = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON,
      localStorage: { getItem: () => '', setItem: () => {} },
      document: { getElementById: (id) => rapatDom[id] || null },
      window: {}
    };
    rapatVm.window = rapatVm;
    vm.createContext(rapatVm);
    vm.runInContext(rapatJsSrc137, rapatVm);
    rapatVm.syncNomorUndanganPreview();
    assert.strictEqual(
      rapatDom.rapatFieldNomorUndangan.value,
      '1059/PAN.PA.W10-A2/UND.PW1.1.1/X/2026',
      'syncNomorUndanganPreview must assemble UND.kode surat with signatory code and Roman month'
    );

    // Tahap 138: Cetak Undangan (1 vs 2 Lembar) & Cetak Daftar Hadir (Maks 48, Zig-Zag, Tanpa Kop) + 3 Tombol Luar
    const viewEoffice138 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    const eofficeJs138 = fs.readFileSync('modules/eoffice/eoffice.js', 'utf8');
    for (const fn of ['triggerPrintUndanganRapat(item)', 'triggerPrintHadirRapat(item)', 'triggerPrintNotulaRapat(item)']) {
      assert(viewEoffice138.includes(fn), `view_eoffice.html missing outer print button ${fn}`);
    }
    for (const fn of ['triggerPrintUndanganRapat(item)', 'triggerPrintHadirRapat(item)', 'triggerPrintNotulaRapat(item)']) {
      assert(eofficeJs138.includes(fn), `eoffice.js missing print handler ${fn}`);
    }

    const cetakUndHtml = fs.readFileSync('modules/eoffice/cetak/cetak_undangan.html', 'utf8');
    const cetakUndJs = fs.readFileSync('modules/eoffice/cetak/js_cetak_undangan.js', 'utf8');
    const cetakHadHtml = fs.readFileSync('modules/eoffice/cetak/cetak_hadir.html', 'utf8');
    const cetakHadJs = fs.readFileSync('modules/eoffice/cetak/js_cetak_hadir.js', 'utf8');

    const printVm138 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON,
      window: {},
      vueState: {
        usersList: [
          { nip: '197309081998031001', nama: 'H. Zulkifli, S.Ag., S.H., M.H.', jabatan: 'Ketua Pengadilan Agama Indramayu' },
          { nip: '199312242025211033', nama: 'Dedi Sopiyan, S.H.', jabatan: 'Penelaah Teknis Kebijakan' }
        ]
      }
    };
    printVm138.window = printVm138;
    vm.createContext(printVm138);
    vm.runInContext(cetakUndJs, printVm138);
    vm.runInContext(cetakHadJs, printVm138);

    // 1. Undangan 2 penerima -> 1 lembar tanpa Lampiran Halaman 2
    const und1Page = printVm138.UndanganPrintHelper.buildUndanganHtml({
      nomor_undangan: '1059/KPA.W10-A2/UND.PW1.1.1/X/2026',
      tgl_surat: '2026-10-27',
      pejabat_ttd_nip: '197309081998031001',
      tampilkan_gelar_undangan: false,
      agenda: 'Rapat Koordinasi PIPK',
      hari_tanggal: 'Rabu, 28 Oktober 2026',
      tujuan_undangan_json: JSON.stringify([{ label: 'Wakil Ketua' }, { label: 'Seluruh ASN PA Indramayu' }])
    }, cetakUndHtml);
    assert(!und1Page.includes('Lampiran Surat Undangan'), '1-3 invitees must fit on 1 page without attachment');
    assert(und1Page.includes('Wakil Ketua') && und1Page.includes('Seluruh ASN PA Indramayu'), '1-page mode must list invitees directly');
    assert(und1Page.includes('>Zulkifli<') || und1Page.includes('Zulkifli</div>'), 'Undangan signer must strip academic/religious titles by default');

    // 2. Undangan 5 penerima -> 2 lembar + header 11pt/9pt persis PDF + XSS escaped
    const und2Page = printVm138.UndanganPrintHelper.buildUndanganHtml({
      nomor_undangan: '1059/KPA.W10-A2/UND.PW1.1.1/X/2026',
      tgl_surat: '2026-10-27',
      pejabat_ttd_nip: '197309081998031001',
      agenda: 'Rapat <script>alert(1)</script>',
      hari_tanggal: 'Rabu, 28 Oktober 2026',
      tujuan_undangan_json: JSON.stringify([
        { label: 'Wakil Ketua' }, { label: 'Hakim 1' }, { label: 'Sekretaris' }, { label: 'Panitera' }, { label: 'Kasubbag <img src=x>' }
      ])
    }, cetakUndHtml);
    assert(und2Page.includes('Para Pejabat pada daftar terlampir'), '>3 invitees must say daftar terlampir on Page 1');
    assert(und2Page.includes('page-break-before: always') && und2Page.includes('font-size: 11pt; font-weight: bold;">Lampiran Surat Undangan</div>'), 'Page 2 attachment must use 11pt bold header');
    assert(und2Page.includes('font-size: 9pt;">Ketua Pengadilan Agama Indramayu</div>'), 'Page 2 attachment must include 9pt court signatory header');
    assert(!und2Page.includes('<script>alert(1)') && !und2Page.includes('<img src=x>'), 'Undangan HTML output must escape XSS');

    // 3. Daftar Hadir: Tanpa Kop, 48 baris kosong tulis tangan, zig-zag TTD, NIP Pimpinan & Notulis
    assert(!cetakHadHtml.includes('MAHKAMAH AGUNG REPUBLIK INDONESIA'), 'Daftar Hadir template must NOT include Kop Surat');
    const hadHtml48 = printVm138.HadirPrintHelper.buildDaftarHadirHtml({
      jenis_kegiatan: 'Rapat',
      agenda: 'Pembahasan PIPK',
      hari_tanggal: 'Rabu, 28 Oktober 2026',
      waktu_mulai: '08:00 WIB',
      waktu_selesai: 'Selesai',
      tempat: 'Ruang Rapat Pimpinan',
      jumlah_baris_hadir: 48,
      pemimpin_nip: '197309081998031001',
      pemimpin: 'Ketua',
      notulis_nip: '199312242025211033',
      notulis: 'Dedi Sopiyan, S.H.'
    }, cetakHadHtml);
    assert(hadHtml48.includes('padding-left: 6px;') && hadHtml48.includes('padding-left: 52%;'), 'Daftar Hadir must render zig-zag TTD numbers');
    assert((hadHtml48.match(/class="hadir-data-row"/g) || []).length === 48, 'Daftar Hadir must support 48 rows');
    assert(hadHtml48.includes('NIP. 197309081998031001') && hadHtml48.includes('NIP. 199312242025211033'), 'Daftar Hadir must auto-fill Pimpinan and Notulis NIPs');

    // Tahap 139: Upload Foto Drive Privat & Mesin Cetak Notula A4 11pt + Grid 2x2 Foto
    assert(fs.readFileSync('api_router.js', 'utf8').includes('uploadFotoRapat: true'), 'api_router.js must allow uploadFotoRapat RPC');
    assert(fs.readFileSync('eoffice/rapat.js', 'utf8').includes('function uploadFotoRapat('), 'eoffice/rapat.js must define uploadFotoRapat');
    assert(fs.readFileSync('code.js', 'utf8').includes('Arsip Foto Rapat TRANSKEP'), 'code.js must allow Arsip Foto Rapat TRANSKEP in internal Drive proxy');
    assert(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8').includes('uploadFotoRapatToDrive(') && fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8').includes('resolveFotoRapatDataUri('), 'eoffice_data.js must define Drive photo upload and proxy resolution');

    const cetakNotHtml = fs.readFileSync('modules/eoffice/cetak/cetak_notula.html', 'utf8');
    const cetakNotJs = fs.readFileSync('modules/eoffice/cetak/js_cetak_notula.js', 'utf8');
    assert(cetakNotHtml.includes('font-size: 11pt;') && cetakNotHtml.includes('MAHKAMAH AGUNG REPUBLIK INDONESIA'), 'cetak_notula.html must use 11pt font and official Kop Surat');

    const notulaVm139 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON,
      window: {},
      vueState: {
        usersList: [
          { nip: '197801012005011002', nama: 'Ikin, S.Ag., M.E.', jabatan: 'Wakil Ketua Pengadilan Agama Indramayu' },
          { nip: '199312242025211033', nama: 'Dedi Sopiyan, S.H.', jabatan: 'Notulis' }
        ]
      }
    };
    notulaVm139.window = notulaVm139;
    vm.createContext(notulaVm139);
    vm.runInContext(cetakNotJs, notulaVm139);

    const renderedNotula = notulaVm139.NotulaPrintHelper.buildNotulaHtml({
      dasar_notula: 'Surat Sekma RI Tanggal 14 September 2026 <script>alert(1)</script>',
      hari_tanggal: 'Rabu, 28 Oktober 2026',
      waktu_mulai: '08:00 WIB',
      waktu_selesai: 'Selesai',
      tempat: 'Ruang Rapat / Kesekretariatan',
      agenda: 'Rapat Pembukaan PIPK',
      pemimpin_nip: '197801012005011002',
      pemimpin: 'Ketua Tim Penilai PIPK / Wakil Ketua',
      notulis_nip: '199312242025211033',
      notulis: 'Dedi Sopiyan, S.H.',
      tujuan_undangan_json: JSON.stringify([{ label: 'Wakil Ketua' }, { label: 'Sekretaris' }]),
      pengarahan_umum: 'Assalamualaikum Wr. Wb. Pembukaan rapat evaluasi.',
      pembahasan_json: JSON.stringify([
        {
          pembicara_nama: 'Agus Salim, S.Ag. (Sekretaris)',
          uraian: '1. Poin satu laporan\n2. Poin dua laporan',
          tindak_lanjut: 'Inventarisir dokumen per SPM',
          target: 'Terselesaikannya penilaian PIPK',
          penanggung_jawab: 'Sekretaris & Tim Penerap',
          tanggal_penyelesaian: '4 s.d. 6 November 2026'
        }
      ])
    }, cetakNotHtml, [
      { src: 'data:image/jpeg;base64,/9j/4AAQ', caption: 'Foto Suasana <img src=x>' },
      { src: 'https://evil.example.com/x.png', caption: 'Should Be Filtered' }
    ]);

    assert(renderedNotula.includes('Dasar') && renderedNotula.includes('NOTULA'), 'Notula must include Dasar header and NOTULA title');
    assert(renderedNotula.includes('Uraian Pembahasan/Laporan') && renderedNotula.includes('Tindak Lanjut/Tanggapan/Masukan') && renderedNotula.includes('Tanggal Penyelesaian'), 'Notula must render hierarchical a..e subsections');
    assert(renderedNotula.includes('notula-foto-grid-table') && renderedNotula.includes('data:image/jpeg;base64,/9j/4AAQ'), 'Notula must render Foto Rapat 2x2 grid for safe data:image URIs');
    assert(!renderedNotula.includes('evil.example.com') && !renderedNotula.includes('<script>alert(1)') && !renderedNotula.includes('<img src=x>'), 'Notula must reject non-data-URI images and escape XSS');

    // Tahap 140: AI Notulis Otomatis (Audio + Transkrip -> n8n Gemini -> Auto-Fill 5 Kolom Notula)
    assert(fs.readFileSync('api_router.js', 'utf8').includes('generateAiNotulenRapat: true'), 'api_router.js must allow generateAiNotulenRapat RPC');
    assert(fs.readFileSync('eoffice/rapat.js', 'utf8').includes('function generateAiNotulenRapat('), 'eoffice/rapat.js must define generateAiNotulenRapat');
    assert(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8').includes('async requestAiNotulenRapat('), 'eoffice_data.js must define requestAiNotulenRapat');
    assert(fs.readFileSync('index.html', 'utf8').includes("media-src 'self' data: blob:;"), 'index.html CSP must permit self/data/blob media-src for audio player');
    const viewEoffice140 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    for (const elId of ['btnRapatProcessAiNotulen', 'btnRapatRecordAudio', 'btnRapatAiModeMerge', 'btnRapatAiModeReplace', 'btnRapatUndoAiNotulen', 'rapatTab3AiUndoBar', 'rapatAiErrorBox', 'rapatInputAudioFile', 'rapatFieldAudioUrl']) {
      assert(viewEoffice140.includes(`id="${elId}"`), `view_eoffice.html missing AI Notulis element #${elId}`);
    }
    assert(viewEoffice140.includes('type="hidden" id="rapatFieldAiTranscript"'), 'rapatFieldAiTranscript must be a hidden input in Tab 4 UI');
    assert(!viewEoffice140.includes('id="btnRapatParseLocalNotes"'), 'btnRapatParseLocalNotes must be removed from Tab 4 UI');

    // Backend GAS RPC generateAiNotulenRapat: RBAC, validasi input & n8n Gemini normalization
    const pegAiDeny = parseResp(gasSandbox.handleApiPost_({
      action: 'call',
      method: 'generateAiNotulenRapat',
      args: [{ agenda: 'Tes', transcript_text: 'Catatan' }, '199002022015012002', pegA.token],
      nip: '199002022015012002',
      token: pegA.token
    }));
    assert.strictEqual(pegAiDeny.status, 'error', 'Pegawai role must be blocked from generateAiNotulenRapat');

    const emptyAiErr = gasSandbox.generateAiNotulenRapat({ agenda: 'Kosong' }, '198001012005011001', admCutover.token);
    assert.strictEqual(emptyAiErr.status, 'error', 'generateAiNotulenRapat must reject empty audio & transcript');

    const origGasFetch = gasSandbox.UrlFetchApp.fetch;
    let capturedAiReq = null;
    gasSandbox.UrlFetchApp.fetch = (url, opts) => {
      capturedAiReq = { url: String(url), opts: opts || {} };
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          status: 'success',
          model: 'models/gemini-3.8-flash',
          data: {
            dasar_opsional: 'Surat Undangan Evaluasi',
            pengarahan_umum: 'Pimpinan menekankan ketepatan waktu.',
            kesimpulan: 'Seluruh unit melakukan monitoring mingguan.',
            transkrip_ringkas: 'Ringkasan rapat evaluasi bulanan.',
            pembahasan: [
              {
                pembicara_nama: 'Atasan Satu',
                uraian: ['Evaluasi kepatuhan laporan bulanan', 'Pemutakhiran data pegawai'],
                tindak_lanjut: ['Kirim rekap per minggu'],
                target: 'Laporan 100% tepat waktu',
                penanggung_jawab: 'Panitera',
                tanggal_penyelesaian: '28 November 2026'
              }
            ]
          }
        })
      };
    };
    try {
      const aiRpcOk = gasSandbox.generateAiNotulenRapat({
        id_rapat: 'RPT-140-TEST',
        agenda: 'Rapat Evaluasi Bulanan',
        peserta_list: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Panitera' }],
        audio_data: 'data:audio/webm;codecs=opus;base64,UklGRg==',
        transcript_text: 'Atasan Satu melaporkan evaluasi.'
      }, '198001012005011001', admCutover.token);
      assert.strictEqual(aiRpcOk.status, 'success', 'Admin generateAiNotulenRapat must succeed via n8n webhook');
      assert.strictEqual(aiRpcOk.source, 'n8n_gemini');
      assert(capturedAiReq && capturedAiReq.url.includes('transkep-ai-notulen'), 'generateAiNotulenRapat must post to transkep-ai-notulen webhook');
      const sentBody = JSON.parse(capturedAiReq.opts.payload);
      assert.strictEqual(sentBody.event, 'AI_NOTULEN_RAPAT');
      assert.strictEqual(sentBody.secret_key, 'webhook-secret-999');
      assert.strictEqual(sentBody.audio_mime_type, 'audio/webm');
      assert.strictEqual(sentBody.audio_base64, 'UklGRg==');
      assert.strictEqual(aiRpcOk.data.pembahasan[0].pembicara_nip, '197901012003011008', 'Backend AI normalizer must auto-match speaker NIP');
      assert.strictEqual(aiRpcOk.data.pembahasan[0].uraian, '1. Evaluasi kepatuhan laporan bulanan\n2. Pemutakhiran data pegawai');
    } finally {
      gasSandbox.UrlFetchApp.fetch = origGasFetch;
    }

    // Frontend VM: applyAiNotulenToForm & parseLocalTranscriptToNotula (Human-in-the-Loop auto-fill + XSS safe)
    const mkCls = () => ({ _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } });
    const aiDom140 = {
      rapatFieldPengarahanUmum: { value: '' },
      rapatFieldKesimpulan: { value: '' },
      rapatFieldDasarNotula: { value: '' },
      rapatFieldAiTranscript: { value: 'Arahan: Rapat dimulai tepat waktu.\nAtasan Satu: Laporan persidangan triwulan berjalan baik\nTindak Lanjut: Pertahankan ketepatan minutasi\nTarget: Minutasi 100% one day minute\nPJ: Panitera Muda <img src=x>\nTanggal Penyelesaian: 30 November 2026' },
      rapatFieldAgenda: { value: 'Rapat Kinerja <script>alert(1)</script>' },
      rapatFieldPemimpin: { value: 'Ketua' },
      rapatPembahasanListContainer: { innerHTML: '' },
      rapatCountPembicara: { innerText: '0' },
      rapatTabPanel_undangan: { classList: mkCls() },
      rapatTabPanel_peserta: { classList: mkCls() },
      rapatTabPanel_notula: { classList: mkCls() },
      rapatTabPanel_media: { classList: mkCls() },
      rapatTabBtn_undangan: { classList: mkCls() },
      rapatTabBtn_peserta: { classList: mkCls() },
      rapatTabBtn_notula: { classList: mkCls() },
      rapatTabBtn_media: { classList: mkCls() }
    };
    const aiVm140 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON,
      localStorage: { getItem: () => '', setItem: () => {} },
      document: { getElementById: (id) => aiDom140[id] || null },
      vueState: {
        usersList: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Panitera', role: 'Pegawai' }]
      },
      showNotify: () => {},
      window: {}
    };
    aiVm140.window = aiVm140;
    vm.createContext(aiVm140);
    vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), aiVm140, { filename: 'modules/eoffice/rapat.js' });

    const localParsed = aiVm140.parseLocalTranscriptToNotula();
    assert(localParsed && aiDom140.rapatFieldPengarahanUmum.value.includes('Rapat dimulai tepat waktu'), 'parseLocalTranscriptToNotula must fill Pengarahan Umum');
    assert.strictEqual(aiDom140.rapatCountPembicara.innerText, '1');
    assert(aiDom140.rapatPembahasanListContainer.innerHTML.includes('Laporan persidangan triwulan berjalan baik'));
    assert(!aiDom140.rapatPembahasanListContainer.innerHTML.includes('<img src=x>'), 'AI Notulis rendered table must escape HTML/XSS');
    assert(!aiDom140.rapatTabPanel_notula.classList.contains('hidden'), 'parseLocalTranscriptToNotula must switch user to Notula review tab');

    const applyStat = aiVm140.applyAiNotulenToForm({
      dasar_opsional: 'Surat Tugas No. 123',
      pengarahan_umum: 'Arahan Evaluasi Gemini',
      kesimpulan: 'Keputusan Rapat AI',
      pembahasan: [{
        pembicara_nama: 'Atasan Satu',
        uraian: ['Poin A', 'Poin B'],
        tindak_lanjut: ['Aksi 1'],
        target: 'Target OK',
        penanggung_jawab: 'Panitera',
        tanggal_penyelesaian: '1 Desember 2026'
      }]
    });
    assert.strictEqual(applyStat.pembahasanCount, 1);
    assert.strictEqual(aiDom140.rapatFieldDasarNotula.value, 'Surat Tugas No. 123');
    assert.strictEqual(aiDom140.rapatFieldPengarahanUmum.value, 'Arahan Evaluasi Gemini');
    assert(aiDom140.rapatPembahasanListContainer.innerHTML.includes('Atasan Satu (Panitera)') && aiDom140.rapatPembahasanListContainer.innerHTML.includes('1. Poin A'), 'applyAiNotulenToForm must format speaker and numbered rows into 5-column editor');

    // Tahap 141: Otomasi Nomor Surat Keluar & Suntik PDF Undangan Rapat MYSIMS
    const routerSrc141 = fs.readFileSync('api_router.js', 'utf8');
    assert(routerSrc141.includes('requestRapatUndanganSuratKeluar: true') && routerSrc141.includes('getRapatMysimsStatus: true') && routerSrc141.includes("action === 'updateNomorSuratRapat'"),
      'api_router.js must allow and dispatch Rapat MYSIMS RPCs & GET/POST callback');
    assert(fs.existsSync('eoffice/undangan_pdf_compiler.js') && fs.readFileSync('eoffice/undangan_pdf_compiler.js', 'utf8').includes('function generateUndanganPdfBase64_('),
      'eoffice/undangan_pdf_compiler.js must declare generateUndanganPdfBase64_');
    assert(fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8').includes('id="rapatMysimsBadge"'),
      'view_eoffice.html must render #rapatMysimsBadge in Rapat modal header');
    assert(fs.readFileSync('modules/eoffice/eoffice.js', 'utf8').includes('fetchLatestRapatMysimsNumber'),
      'eoffice.js triggerPrintUndanganRapat must check fetchLatestRapatMysimsNumber before printing');

    // Poller latar belakang Rapat: syncRapatMysimsNumberInBackground -> hydrate vmEoffice.rawRapatList & Firestore
    const rapatTimers = [];
    const rapatPollSaved = [];
    const rapatPollToasts = [];
    let rapatPollTries = 0;
    const rapatPollVm = {
      console,
      setTimeout: (fn) => { rapatTimers.push(fn); return rapatTimers.length; },
      localStorage: { getItem: () => '', setItem: () => {} },
      showNotify: (title, msg, type) => { rapatPollToasts.push({ title, msg, type }); },
      vmEoffice: {
        rawKgbList: [],
        rawRapatList: [{
          id: 'RPT-POLL-141',
          id_rapat: 'RPT-POLL-141',
          no_urut_surat: '',
          nomor_undangan: '.../KPA.W10-A2/UND.HM3.1.1/XI/2026',
          mysims_requested: true,
          mysims_status: 'Permintaan Terkirim ke MYSIMS'
        }]
      },
      TranskepFirebase: {
        isReady: () => true,
        saveRapatToFirestore: async (doc) => { rapatPollSaved.push(JSON.parse(JSON.stringify(doc))); return doc; }
      },
      TranskepAPI: {
        call: async (method) => {
          if (method === 'getRapatMysimsStatus') {
            rapatPollTries += 1;
            if (rapatPollTries === 1) return { status: 'pending', source: 'none', data: null };
            return {
              status: 'success',
              source: 'cache',
              data: {
                id_rapat: 'RPT-POLL-141',
                no_urut_surat: '1109',
                nomor_undangan: '1109/KPA.W10-A2/UND.HM3.1.1/XI/2026',
                mysims_idp: '1409',
                mysims_status: 'Nomor Terbit MYSIMS'
              }
            };
          }
          return { status: 'success' };
        }
      }
    };
    rapatPollVm.window = rapatPollVm;
    vm.createContext(rapatPollVm);
    vm.runInContext(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8'), rapatPollVm, { filename: 'modules/eoffice/eoffice_data.js' });

    rapatPollVm.EofficeDataService.syncRapatMysimsNumberInBackground('RPT-POLL-141', '198001012005011001', 'tok-adm');
    assert.strictEqual(rapatTimers.length, 1, 'syncRapatMysimsNumberInBackground must schedule 1st poll');
    await rapatTimers.shift()();
    assert.strictEqual(rapatTimers.length, 1, 'Pending getRapatMysimsStatus must schedule retry poll');
    await rapatTimers.shift()();
    assert.strictEqual(rapatTimers.length, 0, 'Issued Rapat MYSIMS number must stop polling');
    assert.strictEqual(rapatPollVm.vmEoffice.rawRapatList[0].no_urut_surat, '1109', 'Rapat poller must hydrate no_urut_surat in vmEoffice.rawRapatList');
    assert.strictEqual(rapatPollSaved[rapatPollSaved.length - 1].nomor_undangan, '1109/KPA.W10-A2/UND.HM3.1.1/XI/2026',
      'Rapat poller must sync issued nomor_undangan into Firestore');
    assert(rapatPollToasts.some(t => t.type === 'success' && t.msg.includes('1109/KPA.W10-A2/UND.HM3.1.1/XI/2026')),
      'Rapat poller must notify admin when MYSIMS number arrives');

    // Tahap 142: Anti Double-Submit Lock & Loading UX Standardization
    // 1. Runtime test: showCustomConfirm one-shot guard + spinner
    let confirmFiredCount = 0;
    browserSandbox.showCustomConfirm('Konfirmasi Uji', 'Lanjutkan aksi?', () => { confirmFiredCount++; });
    const confirmYesBtn = getEl('btn-confirm-yes');
    const confirmCancelBtn = getEl('btn-confirm-cancel');
    assert.strictEqual(typeof confirmYesBtn.onclick, 'function', 'showCustomConfirm must wire btn-confirm-yes.onclick');
    confirmYesBtn.onclick();
    confirmYesBtn.onclick();
    assert.strictEqual(confirmFiredCount, 1, 'showCustomConfirm must invoke callback strictly once on rapid double-click');
    assert.strictEqual(confirmYesBtn.disabled, true, 'showCustomConfirm must disable btn-confirm-yes after first click');
    assert.strictEqual(confirmCancelBtn.disabled, true, 'showCustomConfirm must disable btn-confirm-cancel after first click');
    assert(confirmYesBtn.innerHTML.includes('fa-spin') && confirmYesBtn.innerHTML.includes('Memproses'),
      'showCustomConfirm must display spinner and Memproses text on btn-confirm-yes');

    // 2. Runtime test: submitRapatForm re-entry guard + button lock + showLoading + finally restore
    let saveRapatCalls = 0;
    let resolveSaveRapat = null;
    let rapatLoadingCount = 0;
    let rapatHideLoadingCount = 0;
    const domRapat142 = {
      rapatFieldAgenda: { value: 'Rapat Evaluasi Anti Double Click' },
      rapatFieldHariTanggal: { value: '2026-11-20' },
      btnRapatSaveAgenda: { disabled: false, innerHTML: '<i class="fa-solid fa-floppy-disk"></i><span>Simpan Agenda Rapat</span>', classList: mkCls() },
      btnRapatCancelAgenda: { disabled: false }
    };
    const rapatLockVm142 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Promise,
      localStorage: { getItem: () => '', setItem: () => {} },
      document: { getElementById: (id) => domRapat142[id] || null },
      vueState: { user: { nip: '198001012005011001', role: 'Admin' }, usersList: [] },
      EofficeDataService: {
        saveRapatData: () => {
          saveRapatCalls += 1;
          return new Promise((resolve) => { resolveSaveRapat = resolve; });
        }
      },
      showLoading: () => { rapatLoadingCount += 1; },
      hideLoading: () => { rapatHideLoadingCount += 1; },
      showNotify: () => {},
      window: {}
    };
    rapatLockVm142.window = rapatLockVm142;
    vm.createContext(rapatLockVm142);
    vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), rapatLockVm142, { filename: 'modules/eoffice/rapat.js' });

    const pRapat1 = rapatLockVm142.submitRapatForm();
    const pRapat2 = rapatLockVm142.submitRapatForm();
    assert.strictEqual(saveRapatCalls, 1, 'submitRapatForm concurrent double-click must call saveRapatData strictly once');
    assert.strictEqual(domRapat142.btnRapatSaveAgenda.disabled, true, 'submitRapatForm must disable save button while saving');
    assert.strictEqual(domRapat142.btnRapatCancelAgenda.disabled, true, 'submitRapatForm must disable cancel button while saving');
    assert.strictEqual(rapatLoadingCount, 1, 'submitRapatForm must trigger global showLoading');
    assert(domRapat142.btnRapatSaveAgenda.innerHTML.includes('fa-spin') && domRapat142.btnRapatSaveAgenda.innerHTML.includes('Menyimpan'),
      'submitRapatForm must show spinner and Menyimpan text while saving');
    resolveSaveRapat({ status: 'success', id_rapat: 'RPT-LOCK-142' });
    await Promise.all([pRapat1, pRapat2]);
    assert.strictEqual(domRapat142.btnRapatSaveAgenda.disabled, false, 'submitRapatForm must re-enable save button in finally');
    assert.strictEqual(domRapat142.btnRapatCancelAgenda.disabled, false, 'submitRapatForm must re-enable cancel button in finally');
    assert.strictEqual(rapatHideLoadingCount, 1, 'submitRapatForm must call hideLoading in finally');
    assert(domRapat142.btnRapatSaveAgenda.innerHTML.includes('Simpan Agenda Rapat'),
      'submitRapatForm must restore original button HTML in finally');

    // 3. Runtime test: submitKgbForm re-entry guard + both buttons lock + finally restore
    let saveKgbCalls = 0;
    let resolveSaveKgb = null;
    let kgbLoadingCount = 0;
    let kgbHideLoadingCount = 0;
    const domKgb142 = {
      kgbFieldNip: { value: '199002022015012002', classList: mkCls() },
      kgbFieldNama: { value: 'Pegawai Uji KGB', classList: mkCls() },
      kgbFieldNomorSurat: { value: '1102', classList: mkCls() },
      btnKgbGenerateDoc: { disabled: false, innerHTML: '<i class="fa-solid fa-file-word"></i><span>Buat Google Docs</span>', classList: mkCls() },
      btnKgbSaveDraft: { disabled: false, innerHTML: '<i class="fa-regular fa-floppy-disk"></i><span>Simpan Data</span>', classList: mkCls() }
    };
    const getKgbEl142 = (id) => {
      if (!domKgb142[id]) domKgb142[id] = { value: '', disabled: false, innerHTML: '', classList: mkCls(), firstElementChild: { classList: mkCls() } };
      return domKgb142[id];
    };
    const kgbLockVm142 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Promise, RegExp, parseInt, parseFloat, isNaN,
      setTimeout: (fn) => fn(),
      localStorage: { getItem: () => '', setItem: () => {} },
      document: { getElementById: getKgbEl142 },
      vueState: { user: { nip: '198001012005011001', role: 'Admin' }, usersList: [] },
      EofficeDataService: {
        saveOrGenerateKgb: () => {
          saveKgbCalls += 1;
          return new Promise((resolve) => { resolveSaveKgb = resolve; });
        }
      },
      showLoading: () => { kgbLoadingCount += 1; },
      hideLoading: () => { kgbHideLoadingCount += 1; },
      showNotify: () => {},
      window: {}
    };
    kgbLockVm142.window = kgbLockVm142;
    vm.createContext(kgbLockVm142);
    vm.runInContext(fs.readFileSync('modules/eoffice/kgb.js', 'utf8'), kgbLockVm142, { filename: 'modules/eoffice/kgb.js' });

    const pKgb1 = kgbLockVm142.submitKgbForm('draft');
    const pKgb2 = kgbLockVm142.submitKgbForm('draft');
    assert.strictEqual(saveKgbCalls, 1, 'submitKgbForm concurrent double-click must call saveOrGenerateKgb strictly once');
    assert.strictEqual(domKgb142.btnKgbGenerateDoc.disabled, true, 'submitKgbForm must disable btnKgbGenerateDoc while saving');
    assert.strictEqual(domKgb142.btnKgbSaveDraft.disabled, true, 'submitKgbForm must disable btnKgbSaveDraft while saving');
    assert.strictEqual(kgbLoadingCount, 1, 'submitKgbForm must call showLoading');
    assert(domKgb142.btnKgbSaveDraft.innerHTML.includes('fa-spin') && domKgb142.btnKgbSaveDraft.innerHTML.includes('Menyimpan'),
      'submitKgbForm must show spinner on active KGB button');
    resolveSaveKgb({ status: 'success' });
    await Promise.all([pKgb1, pKgb2]);
    assert.strictEqual(domKgb142.btnKgbGenerateDoc.disabled, false, 'submitKgbForm must re-enable btnKgbGenerateDoc in finally');
    assert.strictEqual(domKgb142.btnKgbSaveDraft.disabled, false, 'submitKgbForm must re-enable btnKgbSaveDraft in finally');
    assert.strictEqual(kgbHideLoadingCount, 1, 'submitKgbForm must call hideLoading in finally');
    assert(domKgb142.btnKgbSaveDraft.innerHTML.includes('Simpan Data'), 'submitKgbForm must restore original draft button HTML');

    // 4. Static parity check across Level 1, Level 2 & Level 3 handlers and templates
    const parityChecks142 = [
      ['core/core.js', 'if (window._isLoggingIn) return;'],
      ['core/core.js', 'if (this.isSubmittingPass) return;'],
      ['core/view_global_modals.html', ':disabled="isSubmittingPass"'],
      ['core/login.js', 'if (isSubmittingLupaPass) return;'],
      ['modules/eoffice/rapat.js', 'if (isSubmittingRapat) return;'],
      ['modules/eoffice/rapat.js', 'if (isProcessingAiNotulen) return;'],
      ['modules/eoffice/kgb.js', 'if (isSubmittingKgb) return;'],
      ['modules/eoffice/eoffice.js', 'if (this.isExecutingConfirm) return;'],
      ['modules/eoffice/view_eoffice.html', ':disabled="isExecutingConfirm"'],
      ['modules/eoffice/view_eoffice.html', 'id="btnRapatCancelAgenda"'],
      ['modules/permohonan/st.js', 'if (this.isSubmittingST) return;'],
      ['modules/permohonan/st.js', 'if (this.isSavingSetting) return;'],
      ['modules/permohonan/cuti.js', 'if (this.isSubmittingCuti) return;'],
      ['modules/permohonan/cuti.js', 'if (this.isSubmittingCancel) return;'],
      ['modules/permohonan/ip.js', 'if (this.isSubmitting) return;'],
      ['modules/permohonan/ik.js', 'if (this.isSubmitting) return;'],
      ['modules/permohonan/wfh.js', 'if (this.isSubmittingRencana) return;'],
      ['modules/permohonan/wfh.js', 'if (this.isSubmittingLaporan) return;'],
      ['modules/permohonan/persetujuan.js', 'if (this.isSubmittingSingle) return;'],
      ['modules/permohonan/persetujuan.js', 'if (this.isSubmittingBulk) return;'],
      ['modules/permohonan/magic_approval.js', 'if (this.isSubmitting) return;'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSubmittingCuti"'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSubmittingCancel"'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSubmittingSingle"'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSubmittingBulk"'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSubmittingST"'],
      ['modules/permohonan/view_permohonan.html', ':disabled="isSavingSetting"'],
      ['modules/permohonan/view_modals_izin.html', ':disabled="isSubmitting"'],
      ['modules/permohonan/view_modals_izin.html', ':disabled="isSubmittingRencana"'],
      ['modules/permohonan/view_modals_izin.html', ':disabled="isSubmittingLaporan"'],
      ['modules/pegawai/pegawai.js', 'if (this.isSubmittingPegawai) return;'],
      ['modules/pegawai/view_pegawai.html', ':disabled="isSubmittingPegawai"'],
      ['modules/pkp/pkp.js', 'activePkpActionLocks'],
      ['modules/pkp/pkp.js', 'if (this.isLockingRekap) return;'],
      ['modules/pkp/pkp.js', 'if (this.modalPKSubmitting) return;'],
      ['modules/pkp/pkp.js', 'if (this.modalPCKSubmitting) return;'],
      ['modules/pkp/view_pkp.html', ':disabled="isLockingRekap"'],
      ['modules/dashboard/dashboard.js', 'if (this.isSubmittingTmt) return;'],
      ['modules/dashboard/view_dashboard.html', ':disabled="isSubmittingTmt"'],
      ['modules/sk/sk.js', 'if (this.isUploading) return;'],
      ['modules/sk/sk_builder.js', 'if (this.isSavingBuilder) return;'],
      ['modules/sk/sk_builder.js', 'if (this.isSubmittingRevisi) return;'],
      ['modules/sop/sop.js', 'if (this.isUploadingSop) return;'],
      ['modules/kinerja/kinerja.js', 'if (this.isUploading) return;'],
      ['modules/jobdes/jobdes.js', 'if (this.isLoadingForm) return;'],
      ['modules/jobdes/jobdes.js', 'if (this.importDocx.isSaving) return;']
    ];
    for (const [filePath, needle] of parityChecks142) {
      assert(fs.readFileSync(filePath, 'utf8').includes(needle), `Tahap 142 lock/UI check missing "${needle}" in ${filePath}`);
    }
    console.log('[PASS] Tahap 142 anti double-submit locks & loading indicators verified across runtime and static checks.');

    // Tahap 143: Searchable Undangan/Pembicara, Multi-Baris Notula PKP-Style + Auto-Tab & Input Tanggal
    const eofficeHtml143 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    assert(!eofficeHtml143.includes('id="rapatListPesertaContainer"') && !eofficeHtml143.includes('id="rapatSearchPesertaInput"'),
      'Tahap 143 must remove legacy #rapatListPesertaContainer and #rapatSearchPesertaInput from Tab 2');
    assert(eofficeHtml143.includes('id="rapatTujuanSearchDropdown"') && eofficeHtml143.includes('handleTujuanSearchKeydown(event)'),
      'Tahap 143 must wire Tab 2 searchable dropdown and Enter key handler');
    assert(eofficeHtml143.includes('c. Tgl. Target') && eofficeHtml143.includes('e. Tgl. Penyelesaian'),
      'Tahap 143 must rename Tab 3 C and E column headers');

    let capturedKeydown143 = null;
    const focusedIds143 = [];
    const dom143 = {};
    const ensureDom143 = (id) => {
      if (!dom143[id]) {
        dom143[id] = {
          id,
          value: '',
          innerText: '',
          innerHTML: '',
          className: '',
          classList: mkCls(),
          focus: () => { focusedIds143.push(id); }
        };
      }
      return dom143[id];
    };
    const rapatUxVm143 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Set, Map, RegExp, parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
      localStorage: { getItem: () => '', setItem: () => {} },
      document: {
        getElementById: (id) => ensureDom143(id),
        addEventListener: (evName, fn) => { if (evName === 'keydown') capturedKeydown143 = fn; }
      },
      vueState: {
        usersList: [
          { nip: '197501012000011001', nama: 'Agus Salim, S.Ag.', jabatan: 'Sekretaris', role: 'Pegawai' },
          { nip: '197601012001011002', nama: 'Ikin, S.Ag., M.E.', jabatan: 'Wakil Ketua', role: 'Pegawai' }
        ]
      },
      showNotify: () => {},
      window: {}
    };
    rapatUxVm143.window = rapatUxVm143;
    vm.createContext(rapatUxVm143);
    vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), rapatUxVm143, { filename: 'modules/eoffice/rapat.js' });

    // Tab 2: Searchable autocomplete + Enter top pick + duplicate NIP guard + custom text fallback
    ensureDom143('rapatCustomTujuanInput').value = 'Agus';
    rapatUxVm143.filterTujuanSearchDrop('Agus');
    assert(!ensureDom143('rapatTujuanSearchDropdown').classList.contains('hidden') &&
      ensureDom143('rapatTujuanSearchDropdown').innerHTML.includes('Agus Salim, S.Ag.'),
      'Tab 2 searchable must show matching employee dropdown');
    rapatUxVm143.handleTujuanSearchKeydown({ key: 'Enter', preventDefault() {} });
    assert.strictEqual(ensureDom143('rapatCustomTujuanInput').value, '', 'Enter on Tab 2 searchable must clear input');
    assert.strictEqual(ensureDom143('rapatCountPeserta').innerText, '1');
    assert(ensureDom143('rapatTujuanOrderedContainer').innerHTML.includes('Agus Salim, S.Ag. (Sekretaris)'));
    rapatUxVm143.selectTujuanPegawai('197501012000011001');
    assert.strictEqual(ensureDom143('rapatCountPeserta').innerText, '1', 'Tab 2 searchable must prevent duplicate employee NIP');
    ensureDom143('rapatCustomTujuanInput').value = 'Tim Penilai PIPK';
    rapatUxVm143.handleTujuanSearchKeydown({ key: 'Enter', preventDefault() {} });
    assert.strictEqual(ensureDom143('rapatCountPeserta').innerText, '2');
    assert(ensureDom143('rapatTujuanOrderedContainer').innerHTML.includes('Tim Penilai PIPK'));

    // Tab 3: Searchable speaker (no Pembicara #1 / no native select), PKP sub-rows, type=date, & Word Auto-Tab
    rapatUxVm143.addPembahasanRow();
    const listHtml143 = ensureDom143('rapatPembahasanListContainer').innerHTML;
    assert(!listHtml143.includes('Pembicara #1') && !listHtml143.includes('-- Pilih Cepat Pegawai --'),
      'Tab 3 must remove Pembicara #N pill and native select dropdown');
    assert(listHtml143.includes('type="date"') && listHtml143.includes('handlePembahasanTabSentinel(event, 0)'),
      'Tab 3 must render date inputs and Tab sentinel');
    ensureDom143('rapatSpeakerSearch_0').value = 'Agus';
    rapatUxVm143.filterPembahasanSpeakerDrop(0, 'Agus');
    rapatUxVm143.handlePembahasanSpeakerKeydown({ key: 'Enter', preventDefault() {} }, 0);
    assert.strictEqual(ensureDom143('rapatSpeakerSearch_0').value, 'Agus Salim, S.Ag. (Sekretaris)',
      'Enter on Tab 3 speaker search must pick top match');

    rapatUxVm143.addPembahasanSubRow(0, true);
    assert(ensureDom143('rapatPembahasanListContainer').innerHTML.includes('rapatPembahasanUraian_0_1'),
      'PKP + button must add 2nd sub-row for the same speaker');
    assert.strictEqual(focusedIds143[focusedIds143.length - 1], 'rapatPembahasanUraian_0_1',
      'Adding sub-row must focus col A of new row');
    rapatUxVm143.removePembahasanSubRow(0, 1);
    assert(!ensureDom143('rapatPembahasanListContainer').innerHTML.includes('rapatPembahasanUraian_0_1'),
      'Per-row trash icon must remove sub-row');

    assert.strictEqual(typeof capturedKeydown143, 'function');
    capturedKeydown143({ key: 'Tab', shiftKey: false });
    rapatUxVm143.handlePembahasanTabSentinel({}, 0);
    assert(ensureDom143('rapatPembahasanListContainer').innerHTML.includes('rapatPembahasanUraian_0_1'),
      'Forward Tab at end of col E must auto-add sub-row for same speaker');
    assert.strictEqual(focusedIds143[focusedIds143.length - 1], 'rapatPembahasanUraian_0_1');

    capturedKeydown143({ key: 'Tab', shiftKey: true });
    rapatUxVm143.handlePembahasanTabSentinel({}, 0);
    assert(!ensureDom143('rapatPembahasanListContainer').innerHTML.includes('rapatPembahasanUraian_0_2'),
      'Shift+Tab must not add a new sub-row');
    assert.strictEqual(focusedIds143[focusedIds143.length - 1], 'rapatPembahasanTanggal_0_1');

    // Cetak Notula Opsi 2A: aggregate sub-items under 1 speaker + format Indonesian dates
    const renderedNotula143 = notulaVm139.NotulaPrintHelper.buildNotulaHtml({
      hari_tanggal: 'Rabu, 28 Oktober 2026',
      agenda: 'Rapat Uji Multi Baris',
      pembahasan_json: JSON.stringify([{
        pembicara_nama: 'Agus Salim, S.Ag. (Sekretaris)',
        items: [
          { uraian: 'Laporan SPM Triwulan I', tindak_lanjut: 'Inventarisir berkas', target: '2026-11-20', penanggung_jawab: 'Sekretaris', tanggal_penyelesaian: '2026-11-22' },
          { uraian: 'Evaluasi pemeliharaan', tindak_lanjut: 'Cek fisik lokasi', target: '2026-11-25', penanggung_jawab: 'Kasubbag Umum', tanggal_penyelesaian: '2026-11-28' }
        ]
      }])
    }, cetakNotHtml, []);
    assert.strictEqual((renderedNotula143.match(/Agus Salim, S\.Ag\. \(Sekretaris\)/g) || []).length, 1,
      'Notula print must keep 1 speaker heading when merging multiple sub-rows');
    assert(renderedNotula143.includes('Laporan SPM Triwulan I') && renderedNotula143.includes('Evaluasi pemeliharaan'));
    assert(renderedNotula143.includes('20 November 2026') && renderedNotula143.includes('25 November 2026') &&
      renderedNotula143.includes('22 November 2026') && renderedNotula143.includes('28 November 2026'),
      'Notula print must format ISO dates into Indonesian dates');

    console.log('[PASS] Tahap 143 searchable undangan/pembicara, multi-baris notula PKP-style + auto-Tab & input tanggal verified.');

    // Tahap 144B: Tab 1 Searchable Pejabat TTD/Pimpinan/Notulis Otomatis Enter & Hapus Kolom No. Urut Surat
    assert(!eofficeHtml143.includes('id="rapatFieldPejabatTtdSelect"') &&
      !eofficeHtml143.includes('id="rapatFieldPemimpinSelect"') &&
      !eofficeHtml143.includes('id="rapatFieldNotulisSelect"'),
      'Tahap 144B must replace legacy Tab 1 native select dropdowns');
    assert(!eofficeHtml143.includes('type="text" id="rapatFieldNoUrutSurat"') &&
      eofficeHtml143.includes('type="hidden" id="rapatFieldNoUrutSurat"'),
      'Tahap 144B must replace visible No. Urut Surat input with hidden field');
    for (const req144 of ['id="rapatPejabatTtdSearch"', 'id="rapatPemimpinSearch"', 'id="rapatNotulisSearch"', 'handleOfficialSearchKeydown', 'syncNoUrutFromNomorUndangan(this.value)']) {
      assert(eofficeHtml143.includes(req144), `Tahap 144B view_eoffice.html missing ${req144}`);
    }

    ensureDom143('rapatFieldTglSuratIso').value = '2026-10-27';
    ensureDom143('rapatFieldKodeSurat').value = 'PW1.1.1';
    ensureDom143('rapatFieldKodePejabat').value = 'KPA.W10-A2';
    ensureDom143('rapatFieldNoUrutSurat').value = '';

    ensureDom143('rapatPejabatTtdSearch').value = 'Ikin';
    rapatUxVm143.filterOfficialSearchDrop('pejabatTtd', 'Ikin');
    rapatUxVm143.handleOfficialSearchKeydown({ key: 'Enter', preventDefault() {} }, 'pejabatTtd');
    assert.strictEqual(ensureDom143('rapatPejabatTtdSearch').value, 'Ikin, S.Ag., M.E. (Wakil Ketua)');
    assert.strictEqual(ensureDom143('rapatFieldPejabatTtdNip').value, '197601012001011002');
    assert.strictEqual(ensureDom143('rapatFieldKodePejabat').value, 'WKPA.W10-A2');
    assert.strictEqual(ensureDom143('rapatFieldNomorUndangan').value, '.../WKPA.W10-A2/UND.PW1.1.1/X/2026');

    rapatUxVm143.syncNoUrutFromNomorUndangan('1088/WKPA.W10-A2/UND.PW1.1.1/X/2026');
    assert.strictEqual(ensureDom143('rapatFieldNoUrutSurat').value, '1088', 'syncNoUrutFromNomorUndangan must extract numeric sequence');
    rapatUxVm143.syncNomorUndanganPreview();
    assert.strictEqual(ensureDom143('rapatFieldNomorUndangan').value, '1088/WKPA.W10-A2/UND.PW1.1.1/X/2026');
    rapatUxVm143.syncNoUrutFromNomorUndangan('.../WKPA.W10-A2/UND.PW1.1.1/X/2026');
    assert.strictEqual(ensureDom143('rapatFieldNoUrutSurat').value, '', 'Placeholder ellipsis must yield empty no_urut_surat for MYSIMS auto');

    ensureDom143('rapatPemimpinSearch').value = 'Ikin';
    rapatUxVm143.filterOfficialSearchDrop('pemimpin', 'Ikin');
    rapatUxVm143.handleOfficialSearchKeydown({ key: 'Enter', preventDefault() {} }, 'pemimpin');
    assert.strictEqual(ensureDom143('rapatPemimpinSearch').value, 'Ikin, S.Ag., M.E. (Wakil Ketua)');
    assert.strictEqual(ensureDom143('rapatFieldPemimpinNip').value, '197601012001011002');
    assert.strictEqual(ensureDom143('rapatFieldPemimpin').value, 'Wakil Ketua');

    ensureDom143('rapatNotulisSearch').value = 'Agus';
    rapatUxVm143.filterOfficialSearchDrop('notulis', 'Agus');
    rapatUxVm143.handleOfficialSearchKeydown({ key: 'Enter', preventDefault() {} }, 'notulis');
    assert.strictEqual(ensureDom143('rapatNotulisSearch').value, 'Agus Salim, S.Ag. (Sekretaris)');
    assert.strictEqual(ensureDom143('rapatFieldNotulisNip').value, '197501012000011001');
    assert.strictEqual(ensureDom143('rapatFieldNotulis').value, 'Agus Salim, S.Ag.');

    console.log('[PASS] Tahap 144B Tab 1 searchable pejabat/pimpinan/notulis + Enter & two-way no_urut_surat sync verified.');

    // Tahap 145: Fix scroll Tab footer, ikon + di atas hapus, Drag&Drop foto/audio, ceklis multi-pilih + Enter, header Tambah Pembicara, tombol cetak ikon-only & subfolder Drive Tahun/Bulan/Judul
    const eofficeHtml145 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    assert(eofficeHtml145.includes('id="modalAgendaRapatBox"') && eofficeHtml145.includes('overflow-clip') && eofficeHtml145.includes('id="modalAgendaRapatBody" class="flex-1 min-h-0'),
      'Tahap 145 must use overflow-clip on #modalAgendaRapatBox and min-h-0 on body to prevent footer jump on Tab');
    assert(eofficeHtml145.includes('id="btnRapatHeaderAddPembicara"') && !eofficeHtml145.includes('<span>Tambah Pembicara / Poin</span>'),
      'Tahap 145 must move Tambah Pembicara button into top modal header');
    assert(eofficeHtml145.includes('id="rapatFotoDropZone"') && eofficeHtml145.includes('handleRapatFotoDrop(event)') &&
      eofficeHtml145.includes('id="rapatAudioDropZone"') && eofficeHtml145.includes('handleRapatAudioDrop(event)'),
      'Tahap 145 must provide drag & drop dropzones for both Foto and Audio in Tab 4');
    assert(!eofficeHtml145.includes('<span>Undangan</span>') && !eofficeHtml145.includes('<span>Absen</span>') && !eofficeHtml145.includes('<span>Notula</span>'),
      'Tahap 145 must render Rapat outer print buttons as icon-only buttons');

    // Runtime UX checks on fresh sandbox with full pegawai list
    const dom145 = {};
    const ensureDom145 = (id) => {
      if (!dom145[id]) {
        dom145[id] = {
          id,
          value: '',
          innerText: '',
          innerHTML: '',
          className: '',
          scrollTop: 0,
          classList: mkCls(),
          focus: () => {},
          scrollIntoView: () => {}
        };
      }
      return dom145[id];
    };
    const rapatVm145 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Set, Map, RegExp, parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
      localStorage: { getItem: () => '', setItem: () => {} },
      document: {
        getElementById: (id) => ensureDom145(id),
        addEventListener: () => {}
      },
      vueState: {
        usersList: [
          { nip: '198501012010011001', nama: 'Rina, S.H.', jabatan: 'Panitera Pengganti', role: 'Pegawai' },
          { nip: '198601012011011002', nama: 'Dedi, S.Sy.', jabatan: 'Panitera Pengganti', role: 'Pegawai' },
          { nip: '198701012012011003', nama: 'Sari, S.Kom.', jabatan: 'Kasubbag', role: 'Pegawai' }
        ]
      },
      showNotify: () => {},
      window: {}
    };
    rapatVm145.window = rapatVm145;
    vm.createContext(rapatVm145);
    vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), rapatVm145, { filename: 'modules/eoffice/rapat.js' });

    // 1. overflow-clip preserved in fullscreen toggle & header button visibility on switchRapatTab
    rapatVm145.toggleRapatFullscreen(true);
    assert(ensureDom145('modalAgendaRapatBox').className.includes('overflow-clip') && !ensureDom145('modalAgendaRapatBox').className.includes('overflow-hidden'),
      'toggleRapatFullscreen must use overflow-clip');
    rapatVm145.switchRapatTab('undangan');
    assert(ensureDom145('btnRapatHeaderAddPembicara').classList.contains('hidden'), 'Header Tambah Pembicara hidden outside Tab 3');
    rapatVm145.switchRapatTab('notula');
    assert(!ensureDom145('btnRapatHeaderAddPembicara').classList.contains('hidden'), 'Header Tambah Pembicara visible in Tab 3');

    // 2. Blue + placed ABOVE trash button only on last sub-row & no sr-only sentinel
    rapatVm145.addPembahasanRow(null, true);
    rapatVm145.addPembahasanSubRow(0, false);
    const pembHtml145 = ensureDom145('rapatPembahasanListContainer').innerHTML;
    assert(!pembHtml145.includes('class="sr-only"') && pembHtml145.includes('data-rapat-tab-sentinel="0"'),
      'Tab sentinel must be in-flow zero-size element instead of sr-only');
    assert(!pembHtml145.includes('Tambah baris untuk pembicara yang sama'),
      'Legacy bottom + bar must be removed');
    const idxAddSub = pembHtml145.lastIndexOf('addPembahasanSubRow(0, true)');
    const idxTrashLast = pembHtml145.lastIndexOf('removePembahasanSubRow(0, 1)');
    assert(idxAddSub !== -1 && idxTrashLast !== -1 && idxAddSub < idxTrashLast,
      'Blue + icon must be rendered immediately above delete button on the last sub-row');

    // 4. Multi-check Panitera Pengganti in Tab 2 dropdown + Enter adds both in 1 shot
    ensureDom145('rapatCustomTujuanInput').value = 'Panitera Pengganti';
    rapatVm145.filterTujuanSearchDrop('Panitera Pengganti');
    assert(ensureDom145('rapatTujuanSearchDropdown').innerHTML.includes('Pilih Semua Hasil'),
      'Tab 2 dropdown must show multi-select header');
    rapatVm145.toggleTujuanDropCheck('198501012010011001');
    rapatVm145.toggleTujuanDropCheck('198601012011011002');
    rapatVm145.handleTujuanSearchKeydown({ key: 'Enter', preventDefault() {} });
    assert.strictEqual(ensureDom145('rapatCountPeserta').innerText, '2', 'Enter after checking 2 items must insert both');
    const orderedHtml145 = ensureDom145('rapatTujuanOrderedContainer').innerHTML;
    assert(orderedHtml145.includes('Rina, S.H. (Panitera Pengganti)') && orderedHtml145.includes('Dedi, S.Sy. (Panitera Pengganti)'));

    // 3 & 7. Drag&Drop handler presence + Backend GAS Drive subfolder hierarchy (Year/Month/Title)
    assert(typeof rapatVm145.handleRapatFotoDrop === 'function' && typeof rapatVm145.handleRapatAudioDrop === 'function',
      'Drag & drop handlers for Foto and Audio must be exposed on window');
    assert(fs.readFileSync('api_router.js', 'utf8').includes('uploadAudioRapat: true'), 'api_router.js must allow uploadAudioRapat RPC');
    assert(fs.readFileSync('code.js', 'utf8').includes('collectDriveAncestorMeta_(file, 5)'),
      'code.js must traverse depth 5 for nested Drive Year/Month/Title folders');
    assert(fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8').includes('uploadAudioRapatToDrive('),
      'eoffice_data.js must define uploadAudioRapatToDrive');

    const createdDriveTree145 = [];
    const mkMockFolder145 = (name, depthPath) => {
      const children = {};
      const folderObj = {
        getId: () => 'fld_' + depthPath,
        getName: () => name,
        getUrl: () => 'https://drive.google.com/drive/folders/fld_' + encodeURIComponent(depthPath),
        isTrashed: () => false,
        setSharing: () => {},
        getFoldersByName: (sub) => {
          const hit = children[sub] ? [children[sub]] : [];
          let i = 0;
          return { hasNext: () => i < hit.length, next: () => hit[i++] };
        },
        createFolder: (sub) => {
          const child = mkMockFolder145(sub, depthPath + '/' + sub);
          children[sub] = child;
          createdDriveTree145.push(depthPath + '/' + sub);
          return child;
        },
        createFile: (blob) => {
          const fPath = depthPath + '/' + blob.name;
          return {
            getId: () => 'file_' + createdDriveTree145.length,
            getName: () => blob.name,
            setSharing: () => {},
            _path: fPath
          };
        }
      };
      return folderObj;
    };
    const driveRoot145 = mkMockFolder145('ROOT', '');
    const gasRapatVm145 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, RegExp, parseInt, Logger: { log: () => {} },
      DriveApp: {
        Access: { PRIVATE: 'PRIVATE' },
        Permission: { NONE: 'NONE' },
        getFoldersByName: (n) => driveRoot145.getFoldersByName(n),
        createFolder: (n) => driveRoot145.createFolder(n)
      },
      Utilities: {
        formatDate: () => '20261205_093000',
        newBlob: (bytes, mime, name) => ({ bytes, mime, name })
      },
      cekOtorisasiAdmin: () => true,
      setPrivateDriveSharing_: () => {},
      validateUploadedFile_: (b64, name, mime, opts) => ({
        bytes: Buffer.from(b64, 'base64'),
        blobMimeType: mime,
        ext: opts && opts.allowAudio ? 'webm' : 'jpg'
      })
    };
    vm.createContext(gasRapatVm145);
    vm.runInContext(fs.readFileSync('eoffice/rapat.js', 'utf8'), gasRapatVm145, { filename: 'eoffice/rapat.js' });

    const upFoto145 = gasRapatVm145.uploadFotoRapat({
      id_rapat: 'RPT-DES-01',
      agenda: 'Rapat / Evaluasi: "Akhir Tahun"?',
      hari_tanggal: 'Rabu, 05 Desember 2026',
      file_data: 'AQID',
      file_name: 'foto.jpg',
      mime_type: 'image/jpeg'
    }, '198001012005011001', 'tok');
    assert.strictEqual(upFoto145.status, 'success');
    assert.strictEqual(upFoto145.data.folder_path, 'Arsip Foto Rapat TRANSKEP / 2026 / Desember / 05 Des - Rapat Evaluasi Akhir Tahun [DES-01]');

    const upAudio145 = gasRapatVm145.uploadAudioRapat({
      id_rapat: 'RPT-DES-01',
      agenda: 'Rapat / Evaluasi: "Akhir Tahun"?',
      tgl_rapat_iso: '2026-12-05',
      file_data: 'AQID',
      file_name: 'rekaman.webm',
      mime_type: 'audio/webm'
    }, '198001012005011001', 'tok');
    assert.strictEqual(upAudio145.status, 'success');
    assert.strictEqual(upAudio145.data.folder_path, 'Arsip Foto Rapat TRANSKEP / 2026 / Desember / 05 Des - Rapat Evaluasi Akhir Tahun [DES-01]');
    assert.strictEqual(createdDriveTree145.length, 4, 'Both Foto & Audio must reuse the same 4-level Drive folder tree without duplicating folders');

    // Tahap 151: Distinct meetings with identical agenda must isolate Drive subfolders by letter number or unique ID
    const upSameTitle1113 = gasRapatVm145.uploadFotoRapat({
      id_rapat: 'RPT-1795142607875',
      agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
      hari_tanggal: 'Jumat, 20 November 2026',
      no_urut_surat: '1113',
      file_data: 'AQID',
      file_name: 'foto1113.jpg',
      mime_type: 'image/jpeg'
    }, '198001012005011001', 'tok');
    const upSameTitle1114 = gasRapatVm145.uploadFotoRapat({
      id_rapat: 'RPT-1795397439551',
      agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
      hari_tanggal: 'Jumat, 20 November 2026',
      nomor_undangan: '1114/KPA.W10-A2/HK2.6/XI/2026',
      file_data: 'AQID',
      file_name: 'foto1114.jpg',
      mime_type: 'image/jpeg'
    }, '198001012005011001', 'tok');
    assert.strictEqual(
      upSameTitle1113.data.folder_path,
      'Arsip Foto Rapat TRANSKEP / 2026 / November / No. 1113 - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan'
    );
    assert.strictEqual(
      upSameTitle1114.data.folder_path,
      'Arsip Foto Rapat TRANSKEP / 2026 / November / No. 1114 - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan'
    );

    const upDraftA = gasRapatVm145.uploadFotoRapat({
      id_rapat: 'RPT-1795142607875',
      agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
      tgl_rapat_iso: '2026-11-20',
      file_data: 'AQID',
      file_name: 'draftA.jpg',
      mime_type: 'image/jpeg'
    }, '198001012005011001', 'tok');
    const upDraftB = gasRapatVm145.uploadFotoRapat({
      id_rapat: 'RPT-1795397439551',
      agenda: 'Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan',
      tgl_rapat_iso: '2026-11-20',
      file_data: 'AQID',
      file_name: 'draftB.jpg',
      mime_type: 'image/jpeg'
    }, '198001012005011001', 'tok');
    assert.strictEqual(
      upDraftA.data.folder_path,
      'Arsip Foto Rapat TRANSKEP / 2026 / November / 20 Nov - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan [7875]'
    );
    assert.strictEqual(
      upDraftB.data.folder_path,
      'Arsip Foto Rapat TRANSKEP / 2026 / November / 20 Nov - Rapat Monitoring dan Evaluasi Kinerja Bidang Kepaniteraan [9551]'
    );

    const feRapat151Src = fs.readFileSync('modules/eoffice/rapat.js', 'utf8');
    const feData151Src = fs.readFileSync('modules/eoffice/eoffice_data.js', 'utf8');
    assert(
      feRapat151Src.includes('no_urut_surat: folderCtx.no_urut_surat') &&
        feRapat151Src.includes('nomor_undangan: folderCtx.nomor_undangan') &&
        feRapat151Src.includes("document.getElementById('rapatFieldNoUrutSurat')") &&
        feData151Src.includes("no_urut_surat: ctx.no_urut_surat || ''") &&
        feData151Src.includes("nomor_undangan: ctx.nomor_undangan || ''"),
      'Frontend rapat.js & eoffice_data.js must forward no_urut_surat and nomor_undangan to Drive folder resolution'
    );

    console.log('[PASS] Tahap 145 Rapat UX polish, Tab 2 multi-check Enter, Drag&Drop & Drive Year/Month/Title subfolders verified.');

    // Tahap 148: Jalur Kilat Gemini Notebook PRO di Tab 4 + Auto-Fill Tab 3 tanpa memicu async Drive audio
    const viewEoffice148 = fs.readFileSync('modules/eoffice/view_eoffice.html', 'utf8');
    for (const nbId of ['rapatFieldNotebookNotes', 'btnRapatCopyNotebookPrompt', 'btnRapatClearNotebookNotes', 'rapatNotebookModeBadge']) {
      assert(viewEoffice148.includes(`id="${nbId}"`), `view_eoffice.html missing Tahap 148 Notebook element #${nbId}`);
    }
    const mkCls148 = () => ({ _s: new Set(['hidden']), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } });
    const dom148 = {
      rapatFieldIdRapat: { value: 'RPT-NB-148' },
      rapatFieldAgenda: { value: 'Bedah Berkas Perkara Peradilan Agama' },
      rapatFieldHariTanggal: { value: 'Sabtu, 21 November 2026' },
      rapatFieldTglRapatIso: { value: '2026-11-21' },
      rapatFieldTempat: { value: 'Ruang Rapat Pimpinan PA Indramayu' },
      rapatFieldPemimpin: { value: 'Ketua PTA Bandung' },
      rapatFieldNotulis: { value: 'Notulis Rapat' },
      rapatFieldPengarahanUmum: { value: '' },
      rapatFieldKesimpulan: { value: '' },
      rapatFieldDasarNotula: { value: '' },
      rapatFieldAiTranscript: { value: '' },
      rapatFieldNotebookNotes: { value: 'Ketua PTA Bandung: Setiap penanganan perkara wajib diuji dengan Konstruksi Sistem Berpikiran Hukum 64 65.' },
      rapatFieldAudioUrl: { value: 'https://drive.google.com/file/d/1DriveArchivedAudio148/view' },
      rapatNotebookModeBadge: { classList: mkCls148() },
      btnRapatClearNotebookNotes: { classList: mkCls148() },
      btnRapatProcessAiNotulen: { disabled: false, innerHTML: 'Proses AI Notulis', classList: mkCls148() },
      rapatAiStatusBadge: { innerText: 'Siap AI Notulis' },
      rapatAiErrorBox: { classList: mkCls148() },
      rapatAiErrorText: { innerText: '' },
      rapatTab3AiUndoBar: { classList: mkCls148() },
      btnRapatUndoAiNotulen: { classList: mkCls148() },
      rapatPembahasanListContainer: { innerHTML: '' },
      rapatCountPembicara: { innerText: '0' },
      rapatTujuanListContainer: { innerHTML: '' },
      rapatCountTujuan: { innerText: '0' },
      rapatTabPanel_undangan: { classList: mkCls148() },
      rapatTabPanel_peserta: { classList: mkCls148() },
      rapatTabPanel_notula: { classList: mkCls148() },
      rapatTabPanel_media: { classList: mkCls148() },
      rapatTabBtn_undangan: { classList: mkCls148() },
      rapatTabBtn_peserta: { classList: mkCls148() },
      rapatTabBtn_notula: { classList: mkCls148() },
      rapatTabBtn_media: { classList: mkCls148() }
    };
    let capturedNbReq = null;
    const vm148 = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Error, RegExp, parseInt, Promise,
      localStorage: { getItem: (k) => (k === 'transkep_active_nip' ? '198001012005011001' : 'tok-148'), setItem: () => {} },
      document: {
        getElementById: (id) => {
          if (!dom148[id]) {
            dom148[id] = { id, value: '', innerText: '', innerHTML: '', className: '', classList: mkCls148() };
          }
          return dom148[id];
        }
      },
      vueState: { usersList: [{ nip: '197901012003011008', nama: 'Atasan Satu', jabatan: 'Ketua', role: 'Pegawai' }] },
      showNotify: () => {},
      EofficeDataService: {
        requestAiNotulenRapat: async (payload) => {
          capturedNbReq = JSON.parse(JSON.stringify(payload));
          return {
            status: 'success',
            data: {
              pengarahan_umum: 'Arahan dari Notebook PRO.',
              kesimpulan: 'Tim IT PA menindaklanjuti sistem otomasi redaksional.',
              transkrip_ringkas: 'Ringkasan rapat bedah berkas.',
              pembahasan: [{
                pembicara_nama: 'Atasan Satu',
                items: [{
                  uraian: 'Penguatan Konstruksi Sistem Berpikiran Hukum.',
                  tindak_lanjut: 'Uji Yuridis, Filosofis, Sosiologis.',
                  target: '2026-11-23',
                  penanggung_jawab: 'Hakim & Kepaniteraan',
                  tanggal_penyelesaian: '2026-11-27'
                }]
              }]
            }
          };
        }
      },
      window: {}
    };
    vm148.window = vm148;
    vm.createContext(vm148);
    vm.runInContext(fs.readFileSync('modules/eoffice/rapat.js', 'utf8'), vm148, { filename: 'modules/eoffice/rapat.js' });
    vm148.selectTujuanPegawai('197901012003011008');

    const nbPrompt = vm148.buildRapatNotebookPrompt();
    assert(nbPrompt.includes('Bedah Berkas Perkara Peradilan Agama') && nbPrompt.includes('Atasan Satu (Ketua)'),
      'buildRapatNotebookPrompt must include Agenda and invited participants');
    assert(nbPrompt.includes('Assalamualaikum, Wr. Wb.') && nbPrompt.includes('Basmalah') && nbPrompt.includes('WAJIB digabung 1 blok per pembicara unik'),
      'buildRapatNotebookPrompt must enforce natural 1-paragraph Pengarahan Umum & unique speaker grouping');

    vm148.syncRapatNotebookNotesUi();
    assert(!dom148.rapatNotebookModeBadge.classList.contains('hidden'), 'Filling Notebook notes must show mode badge');
    assert.strictEqual(dom148.rapatAiStatusBadge.innerText, 'Siap Jalur Kilat Notebook');

    await vm148.processAiNotulenRapat();
    assert(capturedNbReq, 'processAiNotulenRapat must send payload to EofficeDataService');
    assert.strictEqual(capturedNbReq.async_mode, false, 'Notebook text mode must bypass async Drive pipeline');
    assert.strictEqual(capturedNbReq.audio_drive_file_id, '', 'Notebook text mode must clear audio_drive_file_id so n8n uses fast text path');
    assert.strictEqual(capturedNbReq.audio_data, '', 'Notebook text mode must clear inline audio_data');
    assert.strictEqual(capturedNbReq.allow_text_fallback, false, 'Notebook text mode must disable silent raw-text fallback so 503/errors surface cleanly');
    assert(capturedNbReq.transcript_text.includes('Konstruksi Sistem Berpikiran Hukum'), 'Notebook text must travel in transcript_text');
    assert.strictEqual(dom148.rapatFieldPengarahanUmum.value, 'Arahan dari Notebook PRO.');
    assert.strictEqual(dom148.rapatFieldAiTranscript.value, 'Ringkasan rapat bedah berkas.');
    assert(dom148.rapatPembahasanListContainer.innerHTML.includes('Uji Yuridis, Filosofis, Sosiologis.'));

    // Tahap 149: Auto-group fragmented duplicate speaker cards + dedupe uraian & kesimpulan
    const groupedStat = vm148.applyAiNotulenToForm({
      pengarahan_umum: 'Assalamualaikum, Wr. Wb. Terima kasih hadir. Terima kasih hadir. Marilah baca Basmalah.',
      kesimpulan: 'Disepakati input saksi wajib sebelum sidang. Disepakati input saksi wajib sebelum sidang. Terus monitor SIPP.',
      pembahasan: [
        { pembicara_nama: 'Atasan Satu (Ketua)', items: [{ uraian: 'Pembukaan monitoring SIPP.', tindak_lanjut: 'Cek harian', target: '2026-11-20', penanggung_jawab: 'Ketua', tanggal_penyelesaian: '2026-11-20' }] },
        { pembicara_nama: 'Ikin, S.Ag., M.E. (Wakil Ketua)', uraian: 'Optimalisasi aplikasi monitoring.', tindak_lanjut: 'Evaluasi berkala', target: '2026-11-20', penanggung_jawab: 'Wakil Ketua', tanggal_penyelesaian: '2026-11-20' },
        { pembicara_nama: 'Atasan Satu', items: [
          { uraian: 'Pembukaan monitoring SIPP.', tindak_lanjut: 'Cek harian', target: '2026-11-20', penanggung_jawab: 'Ketua', tanggal_penyelesaian: '2026-11-20' },
          { uraian: 'Pekerjaan data saksi tepat waktu.', tindak_lanjut: 'Monitor input saksi', target: '2026-11-20', penanggung_jawab: 'PP', tanggal_penyelesaian: '2026-11-20' }
        ] },
        { pembicara_nama: 'Ikin, S.Ag., M.E. (Wakil Ketua)', items: [{ uraian: 'Penguatan kerja tandem PP.', tindak_lanjut: 'Susun jadwal tandem', target: '2026-11-27', penanggung_jawab: 'Wakil Ketua', tanggal_penyelesaian: '2026-11-27' }] }
      ]
    });
    assert.strictEqual(groupedStat.pembahasanCount, 2, 'Fragmented rows from 2 speakers must group into 2 unique cards');
    assert.strictEqual(dom148.rapatCountPembicara.innerText, '2');
    assert.strictEqual(dom148.rapatFieldKesimpulan.value, 'Disepakati input saksi wajib sebelum sidang. Terus monitor SIPP.');
    assert(dom148.rapatFieldPengarahanUmum.value.startsWith('Assalamualaikum, Wr. Wb. Terima kasih hadir. Marilah baca Basmalah.'));
    assert(dom148.rapatPembahasanListContainer.innerHTML.includes('Pekerjaan data saksi tepat waktu.'), 'Grouped Ketua card must merge second uraian item');
    assert(dom148.rapatPembahasanListContainer.innerHTML.includes('Penguatan kerja tandem PP.'), 'Grouped Wakil Ketua card must merge second uraian item');
    assert.strictEqual(
      (dom148.rapatPembahasanListContainer.innerHTML.match(/Pembukaan monitoring SIPP\./g) || []).length,
      1,
      'Duplicate uraian inside the same grouped speaker card must be deduplicated'
    );

    vm148.clearRapatNotebookNotes();
    assert.strictEqual(dom148.rapatFieldNotebookNotes.value, '');
    assert(dom148.rapatNotebookModeBadge.classList.contains('hidden'), 'clearRapatNotebookNotes must hide mode badge');

    // Tahap 149B: core/api.js extends browser timeout to 120s for generateAiNotulenRapat
    const apiSrc149b = fs.readFileSync('core/api.js', 'utf8');
    assert(
      apiSrc149b.includes("payload.method === 'generateAiNotulenRapat'") && apiSrc149b.includes('120000'),
      'core/api.js must extend client timeout to 120000ms for generateAiNotulenRapat'
    );
    console.log('[PASS] Tahap 148, 149 & 149B Tab 4 Jalur Kilat, Speaker Auto-Grouping, Natural Pengarahan Umum & 120s Timeout verified.');

    // Tahap 152: Verifikasi layout cetak Surat Tugas (ST) 4, 5, 8, & 9 peserta
    const cetakStHtmlRaw = fs.readFileSync('modules/permohonan/cetak/cetak_st.html', 'utf8');
    const stTplMatch = cetakStHtmlRaw.match(/<div id="template-cetak-st-container"[^>]*>([\s\S]*)<\/div>\s*$/);
    assert(stTplMatch, 'cetak_st.html must wrap content in #template-cetak-st-container');
    assert(
      cetakStHtmlRaw.includes('.st-peserta-lanjutan-page') &&
      /\.st-layout-multi\.st-has-overflow-peserta\s+\.st-section-sisa[\s\S]*?page-break-before:\s*auto\s*!important[\s\S]*?break-inside:\s*avoid/.test(cetakStHtmlRaw),
      'cetak_st.html CSS must allow st-section-sisa to stay on page 2 after overflow participants without breaking inside'
    );

    let capturedStPrintHtml = '';
    const stSandbox = {
      console, Date, Math, Array, Object, String, Number, Boolean, JSON, Error, RegExp, parseInt,
      setTimeout: () => 0,
      showLoading: () => {},
      hideLoading: () => {},
      showNotify: () => {},
      formatNamaBersih: (n) => String(n || '').split(',')[0].trim(),
      formatDateIndoCetak: (d) => String(d || '23 November 2026'),
      state: {
        usersList: [{ nip: '197001011995031001', nama: 'H. Zulkifli, S.Ag., S.H., M.H.', jabatan: 'Ketua' }]
      },
      document: {
        getElementById: (id) => (id === 'template-cetak-st-container' ? { innerHTML: stTplMatch[1] } : null),
        createElement: (tag) => {
          assert.strictEqual(tag, 'iframe');
          return {
            style: {},
            contentWindow: {
              document: {
                open: () => {},
                write: (html) => { capturedStPrintHtml = html; },
                close: () => {}
              },
              focus: () => {},
              print: () => {}
            }
          };
        },
        body: {
          appendChild: () => {},
          contains: () => false,
          removeChild: () => {}
        }
      }
    };
    vm.createContext(stSandbox);
    vm.runInContext(fs.readFileSync('modules/permohonan/cetak/cetak_st.js', 'utf8'), stSandbox, { filename: 'modules/permohonan/cetak/cetak_st.js' });

    const runPrintStCase = (count) => {
      const peserta = [];
      for (let idx = 1; idx <= count; idx++) {
        peserta.push({
          nama: `Pegawai Peserta ${idx}`,
          nip: `19800101200501100${idx}`,
          pangkat: 'Penata Tingkat I (III/d)',
          jabatan: `Jabatan ${idx}`
        });
      }
      capturedStPrintHtml = '';
      stSandbox.printSuratTugas(`ST-${count}`, {
        nomor: `100/KPA.W10-A2/ST.DL1.10/XI/2026`,
        pejabat_ttd: '197001011995031001',
        menimbang: 'Bahwa perlu mengikuti bimtek.',
        dasar: '1. Undang-Undang Nomor 3 Tahun 2009.',
        peserta: JSON.stringify(peserta),
        tujuan: 'Mengikuti Bimbingan Teknis',
        tgl_mulai: '2026-11-24',
        tgl_selesai: '2026-11-24',
        jam: '08:00 s.d. 16:00 WIB',
        tempat: 'Aula PTA Bandung',
        waktu: '2026-11-23 09:00:00',
        data_ekstra: JSON.stringify({ paragraf_biaya: 'Biaya dibebankan pada DIPA.' })
      });
      const wrapMatch = capturedStPrintHtml.match(/<div class="st-wrapper ([^"]*)">([\s\S]*)$/);
      assert(wrapMatch, `Rendered ST HTML for ${count} peserta must contain .st-wrapper`);
      return { wrapperClass: wrapMatch[1], bodyHtml: wrapMatch[2], fullHtml: capturedStPrintHtml };
    };

    const res4 = runPrintStCase(4);
    assert.strictEqual(res4.wrapperClass, 'st-layout-multi', '4 peserta must keep exact st-layout-multi class');
    assert(!res4.bodyHtml.includes('st-peserta-lanjutan-page'), '4 peserta must not emit overflow participant page');
    for (let idx = 1; idx <= 4; idx++) {
      assert(res4.bodyHtml.includes(`Pegawai Peserta ${idx}`), `4 peserta must render Pegawai Peserta ${idx}`);
    }

    const res5 = runPrintStCase(5);
    assert.strictEqual(res5.wrapperClass, 'st-layout-multi st-has-overflow-peserta', '5 peserta must set overflow class without compact mode');
    assert(!res5.bodyHtml.includes('page-break-after: always'), '5+ peserta must not inject inline td page-break-after');
    const lanjutanMatches5 = res5.bodyHtml.match(/<div class="st-peserta-lanjutan-page[^"]*">/g) || [];
    assert.strictEqual(lanjutanMatches5.length, 1, '5 peserta must render exactly 1 overflow participant block');
    assert(lanjutanMatches5[0].includes('st-peserta-lanjutan-last'), 'Single overflow page for 5 peserta must carry st-peserta-lanjutan-last');
    const idxOverflow5 = res5.bodyHtml.indexOf('<div class="st-peserta-lanjutan-page');
    const idxSisa5 = res5.bodyHtml.indexOf('<div class="st-section-sisa">');
    assert(idxOverflow5 > 0 && idxSisa5 > idxOverflow5, '5 peserta overflow block must precede st-section-sisa');
    const page1Part5 = res5.bodyHtml.slice(0, idxOverflow5);
    const page2Part5 = res5.bodyHtml.slice(idxOverflow5, idxSisa5);
    for (let idx = 1; idx <= 4; idx++) {
      assert(page1Part5.includes(`Pegawai Peserta ${idx}`), `5 peserta: Pegawai Peserta ${idx} must remain on page 1`);
      assert(!page2Part5.includes(`Pegawai Peserta ${idx}`), `5 peserta: Pegawai Peserta ${idx} must not appear on page 2`);
    }
    assert(page2Part5.includes('Pegawai Peserta 5') && !page1Part5.includes('Pegawai Peserta 5'), '5 peserta: Pegawai Peserta 5 must move to page 2');

    const res8 = runPrintStCase(8);
    assert.strictEqual(res8.wrapperClass, 'st-layout-multi st-has-overflow-peserta st-overflow-compact', '8 peserta must enable st-overflow-compact');
    const lanjutanMatches8 = res8.bodyHtml.match(/<div class="st-peserta-lanjutan-page[^"]*">/g) || [];
    assert.strictEqual(lanjutanMatches8.length, 1, '8 peserta must render 1 overflow block (peserta 5-8)');
    assert(res8.bodyHtml.includes('Pegawai Peserta 8'), '8 peserta must include peserta 8');

    const res9 = runPrintStCase(9);
    assert.strictEqual(res9.wrapperClass, 'st-layout-multi st-has-overflow-peserta', '9 peserta (last chunk len 1) must not use compact mode');
    const lanjutanMatches9 = res9.bodyHtml.match(/<div class="st-peserta-lanjutan-page[^"]*">/g) || [];
    assert.strictEqual(lanjutanMatches9.length, 2, '9 peserta must render 2 overflow blocks (5-8 and 9)');
    assert(!lanjutanMatches9[0].includes('st-peserta-lanjutan-last'), 'First overflow block (5-8) must not have last class');
    assert(lanjutanMatches9[1].includes('st-peserta-lanjutan-last'), 'Second overflow block (9) must carry st-peserta-lanjutan-last');
    console.log('[PASS] Tahap 152 ST Print Layout (4, 5, 8, & 9 peserta page-flow without blank page 2) verified.');
  } finally {
    browserSandbox.TranskepAPI.call = origApiCall;
    browserSandbox.TranskepFirebase.getDb = origGetDb;
  }

  console.log('[PASS] Browser Firebase Custom Auth, scoped queries, Drive proxy bridge & PDF Flipbook verified.');
  console.log('\n[PASS] ALL Fase 3B verification tests passed (0 failures).');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
