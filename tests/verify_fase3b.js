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
  'n8n/transkep-ai-assistant.example.json'
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
console.log('[PASS] A1 (.gitignore, .claspignore, 4 sanitized n8n/*.example.json blueprints) checks passed.');

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
      if (typeof r === 'string') return { setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) }) };
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
    setFrozenRows: () => {}
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
    setTrashed: () => {},
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
  Logger: { log: () => {} },
  SpreadsheetApp: { getActiveSpreadsheet: () => mockSS, openById: () => mockSS, flush: () => {} },
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
      return { empty: true, size: 0, forEach: () => {}, docs: [] };
    },
    onSnapshot: (cb) => {
      recordedFirestoreOps.push({ type: 'onSnapshot', colName, ops });
      if (cb) cb({ empty: true, size: 0, forEach: () => {}, docs: [] });
      return () => {};
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
      return { empty: true, size: 0, forEach: () => {}, docs: [] };
    },
    onSnapshot: (cb) => {
      recordedFirestoreOps.push({ type: 'onSnapshot', colName, ops: [] });
      if (cb) cb({ empty: true, size: 0, forEach: () => {}, docs: [] });
      return () => {};
    }
  })
};

const lsStore = new Map();
function MockStorage() {}
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
      removeAttribute: () => {},
      appendChild: () => {},
      click: () => {},
      remove: () => {},
      firstElementChild: { classList: { add() {}, remove() {} } },
      querySelector: () => null,
      addEventListener: () => {}
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
  navigator: { userAgent: 'Mozilla/5.0', onLine: true, clipboard: { writeText: async () => {} } },
  document: {
    getElementById: (id) => getEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => getEl('dyn_' + Math.random()),
    addEventListener: () => {},
    body: { appendChild: () => {}, classList: { add() {}, remove() {} } }
  },
  firebase: {
    apps: [],
    initializeApp: () => ({}),
    appCheck: () => ({ activate: () => {} }),
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
  document: { write: () => {}, close: () => {}, body: { innerHTML: '' } },
  location: { replace: () => {} }
});

vm.createContext(browserSandbox);
vm.runInContext(fs.readFileSync('core/firebase.js', 'utf8'), browserSandbox, { filename: 'core/firebase.js' });
vm.runInContext(fs.readFileSync('core/core.js', 'utf8'), browserSandbox, { filename: 'core/core.js' });
vm.runInContext(fs.readFileSync('modules/pkp/pkp_data.js', 'utf8'), browserSandbox, { filename: 'modules/pkp/pkp_data.js' });
vm.runInContext(fs.readFileSync('modules/pdf_viewer/pdf_viewer.js', 'utf8'), browserSandbox, { filename: 'modules/pdf_viewer/pdf_viewer.js' });

(async () => {
  // Queue gating before auth resolves
  browserSandbox.TranskepFirebase.subscribeFirestoreSks(() => {});
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Firestore listener must queue while auth not resolved');

  // Non-admin admin-only listeners must be suppressed after auth
  await browserSandbox.TranskepFirebase.authenticateWithCustomToken('jwt-123', { nip: '199002022015012002', role: 'Pegawai' });
  assert(recordedAuthActions.some(a => a.type === 'signInWithCustomToken' && a.tok === 'jwt-123'));
  assert(recordedFirestoreOps.some(o => o.colName === 'sk_documents'), 'Queued listener should flush after auth resolves');

  recordedFirestoreOps = [];
  browserSandbox.TranskepFirebase.subscribeFirestoreRekapitulasi(() => {});
  browserSandbox.TranskepFirebase.subscribeFirestoreKgbs(() => {});
  browserSandbox.TranskepFirebase.subscribeFirestoreRapats(() => {});
  assert.strictEqual(recordedFirestoreOps.length, 0, 'Non-admin must NOT attach admin-only listeners');

  // Participant-scoped queries for Pegawai
  browserSandbox.TranskepFirebase.subscribeFirestoreUsulanJobdes(() => {});
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
  browserSandbox.TranskepFirebase.subscribeFirestoreKgbs(() => {});
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
      if (!kgbDom[id]) kgbDom[id] = { id, value: '', textContent: '', innerText: '', className: '', dataset: {}, classList: { add() {}, remove() {} }, firstElementChild: { classList: { add() {}, remove() {} } } };
      return kgbDom[id];
    };
    const kgbVm = {
      console,
      localStorage: { getItem: () => null, setItem: () => {} },
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
      localStorage: { getItem: () => '', setItem: () => {} },
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

    // n8n Workflow Routing Verification (ST index 0, KGB index 1, Cuti fallback index 2)
    const n8nWf = JSON.parse(fs.readFileSync('n8n/n8n_workflow_mysims_surat_keluar.example.json', 'utf8'));
    const switchNode = n8nWf.nodes.find(n => n.id === 'switch-router');
    assert(switchNode && switchNode.parameters.rules.values.length === 2, 'Router Event Surat Keluar must have 2 rules (ST_TERPADU + KGB_SURAT_KELUAR)');
    assert.strictEqual(switchNode.parameters.rules.values[0].conditions.conditions[0].rightValue, 'ST_TERPADU');
    assert.strictEqual(switchNode.parameters.rules.values[1].conditions.conditions[0].rightValue, 'KGB_SURAT_KELUAR');
    const routerConns = n8nWf.connections['Router Event Surat Keluar'].main;
    assert.strictEqual(routerConns.length, 3, 'Router must keep 3 outputs (ST=0, KGB=1, Cuti fallback=2)');
    assert.strictEqual(routerConns[0][0].node, 'Mesin Otomasi ST Terpadu');
    assert.strictEqual(routerConns[1][0].node, 'Mesin Otomasi KGB MYSIMS');
    assert.strictEqual(routerConns[2][0].node, 'Mesin Otomasi MYSIMS & Callback');
    const kgbCodeNode = n8nWf.nodes.find(n => n.name === 'Mesin Otomasi KGB MYSIMS');
    assert(kgbCodeNode && kgbCodeNode.parameters.jsCode.includes('KPA.W10-A2') && kgbCodeNode.parameters.jsCode.includes('KP2.1.2') && kgbCodeNode.parameters.jsCode.includes("ket = 'Biasa'") && kgbCodeNode.parameters.jsCode.includes('updateNomorSuratKgb'),
      'Mesin Otomasi KGB MYSIMS must target KPA.W10-A2 / KP2.1.2, Biasa ket/sifat, and updateNomorSuratKgb callback');
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
