const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

// =========================================================================
// 1. 3-POINT PWA BUILD VERSION SYNC (index.html top, loader, sw.js)
// =========================================================================
const indexHtml = fs.readFileSync('index.html', 'utf8');
const swJs = fs.readFileSync('sw.js', 'utf8');

const mTopVer = indexHtml.match(/window\.APP_BUILD_VER\s*=\s*'(\d+\.\d+\.\d+)'/);
const mLoaderVer = indexHtml.match(/const APP_BUILD_VER\s*=\s*window\.APP_BUILD_VER\s*\|\|\s*'(\d+\.\d+\.\d+)'/);
const mSwVer = swJs.match(/const CACHE_NAME\s*=\s*'transkep-v(\d+\.\d+\.\d+)'/);

assert(mTopVer, 'index.html missing window.APP_BUILD_VER declaration');
assert(mLoaderVer, 'index.html missing APP_BUILD_VER fallback declaration');
assert(mSwVer, 'sw.js missing CACHE_NAME declaration');
assert.strictEqual(mTopVer[1], mLoaderVer[1], `APP_BUILD_VER mismatch inside index.html: ${mTopVer[1]} vs ${mLoaderVer[1]}`);
assert.strictEqual(mTopVer[1], mSwVer[1], `APP_BUILD_VER mismatch vs sw.js CACHE_NAME: ${mTopVer[1]} vs ${mSwVer[1]}`);

const semver = mTopVer[1].split('.').map(Number);
assert(
  semver[0] > 3 || (semver[0] === 3 && (semver[1] > 8 || (semver[1] === 8 && semver[2] >= 50))),
  `PWA version ${mTopVer[1]} unexpectedly regressed below 3.8.50`
);
console.log(`[PASS] 3-point PWA build version sync verified: v${mTopVer[1]}`);

// =========================================================================
// 2. FIREBASE CLI CONFIG & ISOLATION CHECKS (.gitignore / .claspignore)
// =========================================================================
const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
assert(firebaseJson.firestore && firebaseJson.firestore.rules === 'firestore.rules', 'firebase.json must point firestore.rules to firestore.rules');

const firebaserc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
assert(firebaserc.projects && firebaserc.projects.default === 'transkep-314c0', '.firebaserc default project must be transkep-314c0');

const gitignore = fs.readFileSync('.gitignore', 'utf8');
assert(gitignore.includes('.firebase/'), '.gitignore must ignore .firebase/');

const claspignore = fs.readFileSync('.claspignore', 'utf8');
for (const pattern of ['.github/**', '.firebase/**', 'tests/**', 'n8n/**', 'firebase.json', '.firebaserc', 'firestore.rules', '*.md', 'SECURITY_CHECKLIST.md']) {
  assert(claspignore.includes(pattern), `.claspignore missing exclusion: ${pattern}`);
}
console.log('[PASS] Firebase CLI config, .gitignore, and .claspignore isolation checks passed.');

// =========================================================================
// 3. PARSE firestore.rules SCHEMAS & VALIDATE AGAINST CLIENT WRITES
// =========================================================================
const rulesSrc = fs.readFileSync('firestore.rules', 'utf8');

function extractValidatorSpec(fnName) {
  const fnMatch = rulesSrc.match(new RegExp(`function ${fnName}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n    \\}`));
  assert(fnMatch, `firestore.rules missing validator function ${fnName}`);
  const body = fnMatch[1];

  const allowedMatch = body.match(/let allowed\s*=\s*\[([\s\S]*?)\];/);
  assert(allowedMatch, `${fnName} missing allowed array`);
  const allowed = Array.from(allowedMatch[1].matchAll(/'([^']+)'/g)).map(m => m[1]);

  const reqMatch = body.match(/hasRequiredFields\(\[([\s\S]*?)\]\)/);
  assert(reqMatch, `${fnName} missing hasRequiredFields(...)`);
  const required = Array.from(reqMatch[1].matchAll(/'([^']+)'/g)).map(m => m[1]);

  const statusesMatch = body.match(/let validStatuses\s*=\s*\[([\s\S]*?)\];/);
  const validStatuses = statusesMatch
    ? Array.from(statusesMatch[1].matchAll(/'([^']+)'/g)).map(m => m[1])
    : null;

  return { allowed, required, validStatuses, body };
}

const specs = {
  sk_documents: extractValidatorSpec('isValidSkDocument'),
  sop_documents: extractValidatorSpec('isValidSopDocument'),
  jobdes_documents: extractValidatorSpec('isValidJobdesDocument'),
  jobdes_usulan: extractValidatorSpec('isValidJobdesUsulan'),
  master_kinerja: extractValidatorSpec('isValidMasterKinerja'),
  pkp_documents: extractValidatorSpec('isValidPkpDocument'),
  pck_documents: extractValidatorSpec('isValidPckDocument'),
  pck_rekapitulasi: extractValidatorSpec('isValidPckRekapitulasi'),
  eoffice_kgb: extractValidatorSpec('isValidEofficeKgb'),
  eoffice_rapat: extractValidatorSpec('isValidEofficeRapat'),
  eoffice_apel: extractValidatorSpec('isValidEofficeApel'),
  surat_tugas_documents: extractValidatorSpec('isValidSuratTugas'),
  security_incidents: extractValidatorSpec('isValidSecurityIncident'),
  user_avatars: extractValidatorSpec('isValidUserAvatar'),
  audit_logs: extractValidatorSpec('isValidAuditLog')
};

const validatorNamesBySpec = [
  ['sk_documents', 'isValidSkDocument'],
  ['sop_documents', 'isValidSopDocument'],
  ['jobdes_documents', 'isValidJobdesDocument'],
  ['jobdes_usulan', 'isValidJobdesUsulan'],
  ['master_kinerja', 'isValidMasterKinerja'],
  ['pkp_documents', 'isValidPkpDocument'],
  ['pck_documents', 'isValidPckDocument'],
  ['pck_rekapitulasi', 'isValidPckRekapitulasi'],
  ['eoffice_kgb', 'isValidEofficeKgb'],
  ['eoffice_rapat', 'isValidEofficeRapat'],
  ['eoffice_apel', 'isValidEofficeApel'],
  ['surat_tugas_documents', 'isValidSuratTugas'],
  ['security_incidents', 'isValidSecurityIncident'],
  ['user_avatars', 'isValidUserAvatar'],
  ['audit_logs', 'isValidAuditLog']
];
let maxEstimatedExpr = 0;
let rapatEstimatedExpr = 0;
for (const [specKey, fnName] of validatorNamesBySpec) {
  const { allowed, body } = specs[specKey];
  const optStr = (body.match(/isValidOptionalString\(/g) || []).length;
  const optUrl = (body.match(/isValidOptionalUrl/g) || []).length;
  const optBool = (body.match(/isValidOptionalBool\(/g) || []).length;
  const estExpr = allowed.length + optStr * 28 + optUrl * 30 + optBool * 15 + 80;
  if (estExpr > maxEstimatedExpr) maxEstimatedExpr = estExpr;
  if (fnName === 'isValidEofficeRapat') rapatEstimatedExpr = estExpr;
  assert(
    estExpr <= 800,
    `${fnName} estimated Firestore CEL expressions (${estExpr}) exceeded 800-expression safety budget (Cloud Firestore hard limit is 1000)`
  );
}
assert(
  rapatEstimatedExpr <= 650,
  `isValidEofficeRapat estimated Firestore CEL expressions (${rapatEstimatedExpr}) exceeded 650-expression limit`
);
console.log(`[PASS] Firestore Rules expression-budget guard verified (max=${maxEstimatedExpr} <= 800; isValidEofficeRapat=${rapatEstimatedExpr} <= 650).`);

const capturedWrites = [];
const mockTimestamp = { __mockServerTimestamp: true };
const mockArrayUnion = (item) => ({ __mockArrayUnion: item });

const mockDb = {
  collection(colName) {
    return {
      doc(docId) {
        return {
          _colName: colName,
          _docId: docId,
          async set(payload, opts) {
            capturedWrites.push({ mode: 'set', colName, docId, payload, merge: Boolean(opts && opts.merge) });
          },
          async update(payload) {
            capturedWrites.push({ mode: 'update', colName, docId, payload });
          },
          async get() { return { exists: false, data: () => ({}) }; },
          async delete() {}
        };
      },
      async add(payload) {
        capturedWrites.push({ mode: 'add', colName, docId: 'auto', payload });
      }
    };
  },
  batch() {
    const ops = [];
    return {
      set(docRef, payload, opts) {
        ops.push({ mode: 'batch.set', colName: docRef._colName, docId: docRef._docId, payload, merge: Boolean(opts && opts.merge) });
      },
      async commit() {
        capturedWrites.push(...ops);
      }
    };
  }
};

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  Date,
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
  Set,
  Promise,
  Error,
  parseInt,
  parseFloat,
  localStorage: {
    getItem(k) {
      if (k === 'transkep_active_nip') return '198001012005011001';
      if (k === 'transkep_user_role') return 'Admin';
      return '';
    },
    setItem() {},
    removeItem() {}
  },
  window: {},
  state: { user: { nip: '198001012005011001', nama: 'Admin Test' }, pkpDokumen: [] },
  firebase: {
    apps: [{}],
    initializeApp() {},
    firestore: Object.assign(() => mockDb, {
      FieldValue: {
        serverTimestamp: () => mockTimestamp,
        arrayUnion: mockArrayUnion
      }
    }),
    auth: () => ({ currentUser: null })
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('core/firebase.js', 'utf8'), sandbox, { filename: 'core/firebase.js' });

const TF = sandbox.TranskepFirebase;
assert(TF && typeof TF === 'object', 'TranskepFirebase failed to load');

(async () => {
  await TF.saveSkToFirestore({ id: 'SK-1', judul_sk: 'Judul SK', no_sk: '01/SK', status: 'Aktif' });
  await TF.acknowledgeSkInFirestore('SK-1', '199002022015012002', '15/11/2026 10:00:00');
  await TF.saveSopToFirestore({ id: 'SOP-1', judul_sop: 'Judul SOP', nomor_sop: '01/SOP', pelaksana: [] });
  await TF.acknowledgeSopInFirestore('SOP-1', '199002022015012002', '15/11/2026 10:00:00');
  await TF.saveJobdesToFirestore({ nip: '199002022015012002', updated_by: '198001012005011001' });
  await TF.bulkSaveJobdesBatchToFirestore([{ nip: '199002022015012002', tugas_pokok: 'Tugas A' }], '198001012005011001');
  await TF.saveUsulanJobdesToFirestore({ id: 'USL-1', nip_pegawai: '199002022015012002', nama_pegawai: 'Pegawai', nama_pengusul: 'Pegawai', isi_usulan: 'Usul', status: 'Menunggu' });
  await TF.tandaiUsulanSelesaiInFirestore('USL-1');
  await TF.saveMasterKinerjaToFirestore({ id: 'TEMPL_staf', nama_jabatan: 'Staf', kategori: 'Umum', aliases: [], sasaran_list: [] });
  await TF.savePkpToFirestore({ id_pkp: 'PKP_2026_199002022015012002', nip_pegawai: '199002022015012002', tahun: '2026', status: 'Draft', items: [] });
  await TF.savePckToFirestore({ id_pck: 'PCK_2026_November_199002022015012002', nip_pegawai: '199002022015012002', bulan: 'November', tahun: '2026', status: 'Draft', realisasi: [] });
  await TF.saveRekapitulasiToFirestore({ id_rekap: 'REKAP_2026_November', bulan: 'November', tahun: '2026', pejabat_nama: 'Ketua', pejabat_nip: '1970', daftar_nilai: [] });
  await TF.saveKgbToFirestore({
    id: 'KGB-1',
    id_kgb: 'KGB-1',
    nip: '199002022015012002',
    nama_pegawai: 'Pegawai Uji',
    tempat_lahir: 'Indramayu',
    tanggal_lahir: '10 Mei 1990',
    golongan: 'III/d',
    golongan_lama: 'III/d',
    golongan_baru: 'III/d',
    nokgb: '001',
    bulan_surat: '11',
    tahun_surat: '2026',
    gaji_lama: '3.919.100',
    gaji_baru: '4.042.500',
    tahun_lama: '14',
    bulan_lama: '0',
    tahun_baru: '16',
    bulan_baru: '0',
    status: 'Menunggu TTE Pimpinan',
    tgl_selesai: '2026-11-16',
    tte_status: 'Menunggu TTE',
    tte_pejabat_nip: '198001012005011001',
    tte_pejabat_nama: 'Ketua PA Indramayu',
    tte_submitted_at: '2026-11-16T09:00:00.000Z',
    mysims_requested: true,
    mysims_status: 'Nomor Terbit MYSIMS',
    mysims_idp: '1088',
    mysims_requested_at: '2026-11-16T08:59:00.000Z',
    created_by: '198001012005011001'
  });
  await TF.saveRapatToFirestore({ id: 'RPT-1', status: 'Selesai' });
  await TF.saveSuratTugasToFirestore({ id: 'ST-1', status: 'DISETUJUI', peserta: [] });
  await TF.saveUserAvatarToFirestore('199002022015012002', 'data:image/jpeg;base64,' + 'A'.repeat(40), {
    mime_type: 'image/jpeg',
    size_bytes: 63,
    width: 240,
    height: 240
  });

  await TF.saveEofficeApelToFirestore({ id: 'APEL-2026', doc_type: 'tahun', tahun: 2026, nomor_sk: '538/KPA', tanggal_sk: '4 Juni 2026', jadwal: [{ no: 1, tgl_senin: '2026-07-06' }] });
  await TF.saveEofficeApelToFirestore({ id: 'SATPAM-01', doc_type: 'satpam', nama: 'Gerald Dwi Anggara', panggilan: 'Gerald', no_wa: '081234567890', photo_data_uri: 'data:image/jpeg;base64,' + 'A'.repeat(40), aktif: true });
  await TF.saveEofficeApelToFirestore({ id: 'APEL-SETTINGS', doc_type: 'settings', admin_wa: '6281234567890', jam_kirim: '15:00', bg_gedung_uri: '' });

  assert.strictEqual(capturedWrites.length, 19, `Expected 19 captured writes from core/firebase.js, got ${capturedWrites.length}`);

  TF._authReady = true;
  await TF.logAuditActivity({
    kategori: 'SISTEM',
    aksi: 'UJI_SKEMA_AUDIT',
    target: 'audit_logs',
    detail: 'Verifikasi kompatibilitas skema audit_logs terhadap firestore.rules'
  });
  TF._authReady = false;
  assert.strictEqual(capturedWrites.length, 20, 'logAuditActivity must emit schema-valid write to audit_logs when _authReady=true');

  for (const w of capturedWrites) {
    const spec = specs[w.colName];
    assert(spec, `No firestore.rules validator spec registered for ${w.colName}`);

    const keys = Object.keys(w.payload);
    for (const k of keys) {
      assert(spec.allowed.includes(k), `Schema drift: ${w.colName} write (${w.mode}) emits disallowed field "${k}"`);
    }

    if (w.mode === 'set' || w.mode === 'batch.set') {
      for (const reqKey of spec.required) {
        assert(keys.includes(reqKey), `Schema drift: ${w.colName} ${w.mode} missing required field "${reqKey}"`);
      }
      if ('id' in w.payload && w.docId !== 'auto') {
        assert.strictEqual(w.payload.id, w.docId, `${w.colName}: payload.id must match docId`);
      }
    }

    if (spec.validStatuses && typeof w.payload.status === 'string') {
      assert(spec.validStatuses.includes(w.payload.status), `${w.colName}: invalid status "${w.payload.status}"`);
    }
  }
  console.log(`[PASS] Executed ${capturedWrites.length} Firestore writes against parsed firestore.rules validators (0 schema drifts).`);

  // Check static security_incidents writes in core/core.js & status writes in modules/pkp/pkp_data.js
  const coreJs = fs.readFileSync('core/core.js', 'utf8');
  const marker = "collection('security_incidents').add(";
  const incidentPayloads = [];
  let searchPos = 0;
  while (true) {
    const idx = coreJs.indexOf(marker, searchPos);
    if (idx === -1) break;
    const objStart = coreJs.indexOf('{', idx + marker.length);
    assert(objStart !== -1, 'Malformed security_incidents.add call in core/core.js');
    let depth = 0;
    let objEnd = -1;
    for (let i = objStart; i < coreJs.length; i++) {
      if (coreJs[i] === '{') depth++;
      else if (coreJs[i] === '}') {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }
    assert(objEnd !== -1, 'Unbalanced braces in security_incidents.add call');
    incidentPayloads.push(coreJs.slice(objStart + 1, objEnd));
    searchPos = objEnd + 1;
  }
  assert(incidentPayloads.length >= 2, 'Expected security_incidents.add calls in core/core.js');
  for (const body of incidentPayloads) {
    const emittedKeys = Array.from(body.matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)).map(x => x[1]);
    for (const k of emittedKeys) {
      assert(specs.security_incidents.allowed.includes(k), `security_incidents write in core/core.js emits disallowed field "${k}"`);
    }
    for (const reqKey of specs.security_incidents.required) {
      assert(emittedKeys.includes(reqKey), `security_incidents write in core/core.js missing required field "${reqKey}"`);
    }
  }

  const pkpDataJs = fs.readFileSync('modules/pkp/pkp_data.js', 'utf8');
  const pkpStatusMatches = Array.from(pkpDataJs.matchAll(/newStatus\s*=\s*'([^']+)'/g)).map(m => m[1]);
  assert(pkpStatusMatches.length >= 4, 'Expected status assignments in modules/pkp/pkp_data.js');
  for (const st of pkpStatusMatches) {
    assert(specs.pkp_documents.validStatuses.includes(st), `pkp_data.js assigns PKP status "${st}" not allowed by firestore.rules`);
    assert(specs.pck_documents.validStatuses.includes(st), `pkp_data.js assigns PCK status "${st}" not allowed by firestore.rules`);
  }
  console.log('[PASS] security_incidents & pkp_data.js status compatibility checks passed.');

  // =========================================================================
  // 4. AUTH-GATE COVERAGE ON EVERY getFirestore* AND subscribeFirestore*
  // =========================================================================
  const fbSrc = fs.readFileSync('core/firebase.js', 'utf8');
  const getterMatches = Array.from(fbSrc.matchAll(/async (getFirestore\w+)\([^)]*\)\s*\{([\s\S]*?)\n  \},/g));
  assert(getterMatches.length >= 9, `Expected >= 9 getFirestore* getters in core/firebase.js, found ${getterMatches.length}`);
  for (const [, name, body] of getterMatches) {
    assert(body.includes('_ensureAuthForRead('), `${name} must call this._ensureAuthForRead(...)`);
    const needsAdmin = /Rekapitulasi|Kgbs|Rapats|AuditLogs|SecurityIncidents/.test(name);
    if (needsAdmin) {
      assert(body.includes('_ensureAuthForRead(true)'), `${name} must enforce _ensureAuthForRead(true)`);
    }
  }

  const subMatches = Array.from(fbSrc.matchAll(/(subscribeFirestore\w+)\([^)]*\)\s*\{([\s\S]*?)\n  \}/g));
  assert(subMatches.length >= 9, `Expected >= 9 subscribeFirestore* listeners in core/firebase.js, found ${subMatches.length}`);
  for (const [, name, body] of subMatches) {
    assert(body.includes('_whenAuthGatedSnapshot('), `${name} must wrap onSnapshot inside this._whenAuthGatedSnapshot(...)`);
  }
  console.log(`[PASS] Auth-gate discipline verified across ${getterMatches.length} getters and ${subMatches.length} listeners.`);

  console.log('\n[PASS] ALL Firestore schema, PWA parity, and Firebase config checks passed (0 failures).');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
