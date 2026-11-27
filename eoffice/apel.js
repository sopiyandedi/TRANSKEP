// ==========================================
// FILE: eoffice/apel.js
// DESKRIPSI: Backend Service E-Office Jadwal Apel Senin Pagi & Jumat Sore
//            - Simpan Poster PNG ke Google Drive (TRANSKEP APEL/<Tahun>/)
//            - Endpoint n8n Cron Mingguan (Jumat 15:00 WIB): baca Firestore eoffice_apel,
//              cek konflik Cuti (cuti_log) & Surat Tugas (surat_tugas_documents),
//              dan substitusi otomatis petugas dari jadwal minggu berikutnya (non-destruktif)
// ENGINE: TRANSKEP Core v3.9.4
// ==========================================

/**
 * Mengambil atau membuat folder privat Google Drive TRANSKEP APEL / <tahun>
 */
function getOrCreateApelPosterFolder_(tahun) {
  const rootFolder = (typeof getOrCreateSubfolderByName_ === 'function')
    ? getOrCreateSubfolderByName_(null, 'TRANSKEP APEL')
    : DriveApp.createFolder('TRANSKEP APEL');
  if (typeof setPrivateDriveSharing_ === 'function') {
    setPrivateDriveSharing_(rootFolder);
  }
  const cleanYear = String(tahun || '').replace(/[^0-9]/g, '').slice(0, 4);
  if (!cleanYear) return rootFolder;
  const yearFolder = (typeof getOrCreateSubfolderByName_ === 'function')
    ? getOrCreateSubfolderByName_(rootFolder, cleanYear)
    : rootFolder.createFolder(cleanYear);
  if (typeof setPrivateDriveSharing_ === 'function') {
    setPrivateDriveSharing_(yearFolder);
  }
  return yearFolder;
}

/**
 * RPC Admin/Operator: Membuka URL Folder Arsip Poster Apel di Google Drive
 */
function getApelDriveFolderUrl(userNip, clientToken) {
  const sess = (typeof getVerifiedSession_ === 'function')
    ? getVerifiedSession_(userNip, clientToken)
    : (typeof cekOtorisasi === 'function' && cekOtorisasi(userNip, clientToken) ? { nip: String(userNip || ''), role: 'User' } : null);
  if (!sess) {
    return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid atau kedaluwarsa.' };
  }
  const folder = getOrCreateApelPosterFolder_('');
  return {
    status: 'success',
    url: folder.getUrl(),
    folder_id: folder.getId()
  };
}

/**
 * Menyimpan Poster PNG Jadwal Apel (1080x1350) hasil render Canvas browser ke Google Drive privat
 */
function saveApelPosterToDrive(payload, userNip, clientToken) {
  try {
    const sess = (typeof getVerifiedSession_ === 'function')
      ? getVerifiedSession_(userNip, clientToken)
      : (typeof cekOtorisasi === 'function' && cekOtorisasi(userNip, clientToken) ? { nip: String(userNip || ''), role: 'Admin' } : null);
    if (!sess) {
      return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid atau kedaluwarsa.' };
    }
    const roleLow = String(sess.role || '').toLowerCase();
    if (roleLow !== 'admin' && roleLow !== 'operator' && roleLow.indexOf('kepegawaian') === -1) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin / Operator yang dapat mengarsipkan poster Apel.' };
    }

    const p = (payload && typeof payload === 'object') ? payload : {};
    const rawB64 = String(p.png_base64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '').trim();
    if (!rawB64 || rawB64.length < 100) {
      return { status: 'error', message: 'Data gambar PNG poster kosong atau tidak valid.' };
    }
    if (rawB64.length > 8000000) {
      return { status: 'error', message: 'Ukuran poster PNG melebihi batas maksimal 6 MB.' };
    }

    const tahun = String(p.tahun || new Date().getFullYear()).replace(/[^0-9]/g, '').slice(0, 4) || String(new Date().getFullYear());
    const rawName = String(p.file_name || ('Jadwal_Apel_' + (p.tgl_senin || p.week_no || 'Minggu') + '.png'))
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
      .trim();
    const fileName = /\.png$/i.test(rawName) ? rawName : (rawName + '.png');

    const folder = getOrCreateApelPosterFolder_(tahun);
    if (typeof trashExistingNamedFilesInFolder_ === 'function') {
      trashExistingNamedFilesInFolder_(folder, fileName);
    }

    const bytes = Utilities.base64Decode(rawB64);
    const blob = Utilities.newBlob(bytes, 'image/png', fileName);
    const saved = folder.createFile(blob);
    if (typeof setPrivateDriveSharing_ === 'function') {
      setPrivateDriveSharing_(saved);
    }

    return {
      status: 'success',
      file_id: saved.getId(),
      file_url: saved.getUrl(),
      folder_url: folder.getUrl(),
      file_name: saved.getName(),
      tahun: tahun
    };
  } catch (err) {
    return {
      status: 'error',
      message: 'Gagal menyimpan poster Apel ke Google Drive: ' + (err && err.message ? err.message : String(err))
    };
  }
}

/**
 * Helper: Konversi nilai REST API Firestore ke nilai JS biasa
 */
function unwrapFirestoreValueApel_(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = (val.arrayValue && Array.isArray(val.arrayValue.values)) ? val.arrayValue.values : [];
    return arr.map(unwrapFirestoreValueApel_);
  }
  if ('mapValue' in val) {
    const fields = (val.mapValue && val.mapValue.fields) ? val.mapValue.fields : {};
    const obj = {};
    Object.keys(fields).forEach(function (k) {
      obj[k] = unwrapFirestoreValueApel_(fields[k]);
    });
    return obj;
  }
  return null;
}

function unwrapFirestoreDocApel_(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const rawName = String(doc.name || '');
  const docId = rawName ? rawName.split('/').pop() : '';
  const fields = doc.fields || {};
  const obj = { id: docId };
  Object.keys(fields).forEach(function (k) {
    obj[k] = unwrapFirestoreValueApel_(fields[k]);
  });
  return obj;
}

/**
 * Helper: Normalisasi string tanggal menjadi YYYY-MM-DD
 */
function parseApelDateToYmd_(rawVal) {
  if (!rawVal) return '';
  if (Object.prototype.toString.call(rawVal) === '[object Date]' && !isNaN(rawVal.getTime())) {
    return Utilities.formatDate(rawVal, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  const s = String(rawVal || '').trim();
  if (!s) return '';
  const isoM = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return isoM[1] + '-' + isoM[2] + '-' + isoM[3];
  const dmyM = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmyM) {
    return dmyM[3] + '-' + String(parseInt(dmyM[2], 10)).padStart(2, '0') + '-' + String(parseInt(dmyM[1], 10)).padStart(2, '0');
  }
  const months = {
    januari: '01', jan: '01',
    februari: '02', feb: '02',
    maret: '03', mar: '03',
    april: '04', apr: '04',
    mei: '05',
    juni: '06', jun: '06',
    juli: '07', jul: '07',
    agustus: '08', ags: '08', agt: '08', agu: '08',
    september: '09', sept: '09', spt: '09', sep: '09',
    oktober: '10', okt: '10',
    november: '11', nopember: '11', nov: '11',
    desember: '12', des: '12'
  };
  const indoM = s.toLowerCase().match(/(\d{1,2})\s+([a-z]{3,10})\s+(\d{4})/);
  if (indoM && months[indoM[2]]) {
    return indoM[3] + '-' + months[indoM[2]] + '-' + String(parseInt(indoM[1], 10)).padStart(2, '0');
  }
  return '';
}

function formatApelYmdToIndoUpper_(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || '');
  const monthsUpper = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ];
  const mon = monthsUpper[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))];
  return parseInt(m[3], 10) + ' ' + mon + ' ' + m[1];
}

function normalizeApelNameKey_(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^(drs\.?|dra\.?|ir\.?|dr\.?|h\.?|hj\.?|k\.?)\s+/g, '')
    .replace(/,.*$/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Helper: Mengumpulkan petugas yang Cuti / Dinas Luar (ST) pada tanggal apel
 */
function collectAbsentOfficersForApel_(targetDates, accessToken, projectId) {
  const absentByDate = {};
  const cleanDates = (targetDates || []).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
  cleanDates.forEach(function (d) {
    absentByDate[d] = { nips: {}, names: {}, reasons: {} };
  });
  if (cleanDates.length === 0) return absentByDate;

  const markAbsent = function (ymd, nip, nama, reason) {
    const bucket = absentByDate[ymd];
    if (!bucket) return;
    const cleanNip = String(nip || '').replace(/['"\s]/g, '').trim();
    const normName = normalizeApelNameKey_(nama);
    if (cleanNip) {
      bucket.nips[cleanNip] = reason;
      bucket.reasons['nip:' + cleanNip] = reason;
    }
    if (normName) {
      bucket.names[normName] = reason;
      bucket.reasons['name:' + normName] = reason;
    }
  };

  let ss = null;
  try {
    if (typeof getDB === 'function') ss = getDB();
  } catch (eDb) {}

  // Map NIP -> Nama dari sheet user_data agar cuti_log (yang simpan NIP) cocok dengan nama di tabel apel
  const nipToName = {};
  if (ss) {
    try {
      const shUser = ss.getSheetByName('user_data');
      const uRows = (shUser && typeof readUserDataDecrypted_ === 'function')
        ? readUserDataDecrypted_(shUser)
        : (shUser ? shUser.getDataRange().getDisplayValues() : []);
      for (let i = 1; i < uRows.length; i++) {
        const uNip = String(uRows[i][0] || '').replace(/['"\s]/g, '').trim();
        const uNama = String(uRows[i][1] || '').trim();
        if (uNip && uNama) nipToName[uNip] = uNama;
      }
    } catch (eU) {}

    // 1. Cek Cuti dari sheet cuti_log
    try {
      const shCuti = ss.getSheetByName('cuti_log');
      const cRows = (shCuti && typeof readCutiSheetDecrypted_ === 'function')
        ? readCutiSheetDecrypted_(shCuti)
        : (shCuti ? shCuti.getDataRange().getDisplayValues() : []);
      for (let i = 1; i < cRows.length; i++) {
        const stLow = String(cRows[i][7] || '').toLowerCase();
        if (!stLow || stLow.indexOf('tolak') !== -1 || stLow.indexOf('batal') !== -1) continue;
        const cNip = String(cRows[i][2] || '').replace(/['"\s]/g, '').trim();
        const cJenis = String(cRows[i][3] || 'Cuti').trim();
        const ymdStart = parseApelDateToYmd_(cRows[i][4]);
        const ymdEnd = parseApelDateToYmd_(cRows[i][5]) || ymdStart;
        if (!ymdStart) continue;
        const cName = nipToName[cNip] || '';
        cleanDates.forEach(function (td) {
          if (td >= ymdStart && td <= ymdEnd) {
            markAbsent(td, cNip, cName, cJenis);
          }
        });
      }
    } catch (eCuti) {}
  }

  // 2. Cek Surat Tugas dari Firestore (surat_tugas_documents)
  let stDocs = [];
  if (accessToken && typeof exportFirestoreCollectionRest_ === 'function') {
    const stRes = exportFirestoreCollectionRest_('surat_tugas_documents', accessToken, projectId);
    if (stRes && Array.isArray(stRes.documents)) {
      stDocs = stRes.documents.map(unwrapFirestoreDocApel_).filter(Boolean);
    }
  }
  if (stDocs.length === 0 && ss) {
    try {
      const shSt = ss.getSheetByName('st_log');
      const rows = shSt ? shSt.getDataRange().getDisplayValues() : [];
      for (let i = 1; i < rows.length; i++) {
        stDocs.push({
          tgl_mulai: rows[i][7],
          tgl_selesai: rows[i][8],
          peserta: rows[i][10],
          status: rows[i][12]
        });
      }
    } catch (eSt) {}
  }

  for (let i = 0; i < stDocs.length; i++) {
    const st = stDocs[i];
    const stLow = String(st.status || '').toLowerCase();
    if (stLow.indexOf('tolak') !== -1 || stLow.indexOf('batal') !== -1) continue;
    const ymdStart = parseApelDateToYmd_(st.tgl_mulai);
    const ymdEnd = parseApelDateToYmd_(st.tgl_selesai) || ymdStart;
    if (!ymdStart) continue;
    let pesertaArr = [];
    if (Array.isArray(st.peserta)) {
      pesertaArr = st.peserta;
    } else if (typeof st.peserta === 'string' && st.peserta.trim()) {
      try {
        const parsed = JSON.parse(st.peserta);
        if (Array.isArray(parsed)) pesertaArr = parsed;
      } catch (eP) {}
    }
    cleanDates.forEach(function (td) {
      if (td >= ymdStart && td <= ymdEnd) {
        pesertaArr.forEach(function (p) {
          if (p && typeof p === 'object') {
            markAbsent(td, p.nip, p.nama, 'Surat Tugas');
          } else if (typeof p === 'string') {
            markAbsent(td, '', p, 'Surat Tugas');
          }
        });
      }
    });
  }

  return absentByDate;
}

function getConflictReasonApel_(absentByDate, dateList, nip, nama) {
  const cleanNip = String(nip || '').replace(/['"\s]/g, '').trim();
  const normName = normalizeApelNameKey_(nama);
  for (let i = 0; i < dateList.length; i++) {
    const ymd = dateList[i];
    const b = absentByDate[ymd];
    if (!b) continue;
    if (cleanNip && b.nips[cleanNip]) return { ymd: ymd, reason: b.nips[cleanNip] };
    if (normName && b.names[normName]) return { ymd: ymd, reason: b.names[normName] };
  }
  return null;
}

/**
 * Endpoint Khusus n8n (Cron Jumat 15:00 WIB) & API Eksternal:
 * Mengambil jadwal apel minggu depan (Sn..Jm) + hasil auto-substitusi Cuti/ST + Base64 Poster Drive
 */
function getApelMingguanDispatch_(params) {
  try {
    const p = (params && typeof params === 'object') ? params : {};
    const props = PropertiesService.getScriptProperties();
    const configuredKey = String(props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026').trim();
    const incomingKey = String(p.secret_key || p.secretKey || '').trim();
    const isKeyValid = (typeof constantTimeEquals_ === 'function')
      ? constantTimeEquals_(incomingKey, configuredKey)
      : (incomingKey && incomingKey === configuredKey);
    if (!isKeyValid) {
      return { status: 'error', message: 'Akses Ditolak: secret_key tidak valid.' };
    }

    const sa = (typeof parseFirebaseServiceAccount_ === 'function') ? parseFirebaseServiceAccount_() : null;
    const projectId = String((sa && sa.project_id) || 'transkep-314c0').trim();
    const accessToken = (typeof getFirebaseServiceAccessToken_ === 'function') ? getFirebaseServiceAccessToken_() : null;
    if (!accessToken || typeof exportFirestoreCollectionRest_ !== 'function') {
      return { status: 'error', message: 'Koneksi Service Account Firebase di GAS belum siap.' };
    }

    const colRes = exportFirestoreCollectionRest_('eoffice_apel', accessToken, projectId);
    if (colRes.error) {
      return { status: 'error', message: 'Gagal membaca koleksi eoffice_apel: ' + colRes.error };
    }
    const docs = (colRes.documents || []).map(unwrapFirestoreDocApel_).filter(Boolean);

    let settingsDoc = { admin_wa: '', jam_kirim: '15:00', caption_template: '' };
    const tahunDocs = [];
    const satpamDocs = [];
    docs.forEach(function (d) {
      if (d.doc_type === 'settings' || d.id === 'APEL-SETTINGS') settingsDoc = d;
      else if (d.doc_type === 'tahun') tahunDocs.push(d);
      else if (d.doc_type === 'satpam') satpamDocs.push(d);
    });

    if (tahunDocs.length === 0) {
      return { status: 'error', message: 'Belum ada dokumen jadwal tahunan pada eoffice_apel.' };
    }

    const todayStr = parseApelDateToYmd_(p.target_date) || Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const todayParts = todayStr.split('-').map(Number);
    const refUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));
    const dow = refUtc.getUTCDay(); // 0=Min, 1=Sen ... 5=Jum, 6=Sab
    const daysToNextMon = dow === 1 ? 0 : (dow === 0 ? 1 : (8 - dow));
    const nextMonUtc = new Date(refUtc.getTime());
    if (dow === 5 || dow === 6 || dow === 0) {
      nextMonUtc.setUTCDate(nextMonUtc.getUTCDate() + daysToNextMon);
    } else if (dow !== 1) {
      nextMonUtc.setUTCDate(nextMonUtc.getUTCDate() - (dow - 1));
    }
    const targetMonYmd = nextMonUtc.getUTCFullYear() + '-' + String(nextMonUtc.getUTCMonth() + 1).padStart(2, '0') + '-' + String(nextMonUtc.getUTCDate()).padStart(2, '0');
    const nextSunUtc = new Date(nextMonUtc.getTime() + 6 * 86400000);
    const targetSunYmd = nextSunUtc.getUTCFullYear() + '-' + String(nextSunUtc.getUTCMonth() + 1).padStart(2, '0') + '-' + String(nextSunUtc.getUTCDate()).padStart(2, '0');

    const reqYear = p.tahun ? String(p.tahun).trim() : '';
    const targetYearGuess = reqYear || targetMonYmd.slice(0, 4);
    let activeTahunDoc = tahunDocs.find(function (t) { return String(t.tahun || '') === targetYearGuess; }) || tahunDocs[0];

    let rows = [];
    try {
      const parsed = JSON.parse(String(activeTahunDoc.jadwal_json || '[]'));
      if (Array.isArray(parsed)) rows = parsed;
    } catch (eJ) {}

    if (rows.length === 0) {
      return { status: 'error', message: 'Jadwal tahun ' + (activeTahunDoc.tahun || '') + ' masih kosong.' };
    }

    let pickedIdx = -1;
    if (p.week_index !== undefined && p.week_index !== null && p.week_index !== '') {
      const idx = parseInt(p.week_index, 10);
      if (!isNaN(idx) && idx >= 0 && idx < rows.length) pickedIdx = idx;
    }
    if (pickedIdx === -1) {
      pickedIdx = rows.findIndex(function (r) {
        const sn = parseApelDateToYmd_(r.tgl_senin);
        const jm = parseApelDateToYmd_(r.tgl_jumat);
        return (sn >= targetMonYmd && sn <= targetSunYmd) || (jm >= targetMonYmd && jm <= targetSunYmd);
      });
    }
    if (pickedIdx === -1) {
      pickedIdx = rows.findIndex(function (r) {
        const sn = parseApelDateToYmd_(r.tgl_senin);
        const jm = parseApelDateToYmd_(r.tgl_jumat);
        return (sn && sn >= todayStr) || (jm && jm >= todayStr);
      });
    }
    if (pickedIdx === -1) pickedIdx = 0;

    const row = rows[pickedIdx];
    const snYmd = parseApelDateToYmd_(row.tgl_senin);
    const jmYmd = parseApelDateToYmd_(row.tgl_jumat);
    const hariMode = String(row.hari_mode || 'Sn & Jm').trim();
    const activeDates = [];
    if (hariMode.indexOf('Sn') !== -1 && snYmd) activeDates.push(snYmd);
    if (hariMode.indexOf('Jm') !== -1 && jmYmd) activeDates.push(jmYmd);

    const absentByDate = collectAbsentOfficersForApel_(activeDates, accessToken, projectId);
    const roleMeta = [
      { key: 'pembina', label: 'Pembina' },
      { key: 'pemimpin', label: 'Pemimpin / Komandan' },
      { key: 'doa', label: 'Pembaca Doa' },
      { key: 'nilai_ma', label: '8 Nilai MA-RI' },
      { key: 'mc', label: 'MC / Protokol' },
      { key: 'budaya_malu', label: '10 Budaya Malu' }
    ];

    const effective = {};
    const substitutions = [];
    const usedSubstitutes = {};

    roleMeta.forEach(function (rm) {
      const origName = String(row[rm.key] || '').trim();
      const origNip = String(row[rm.key + '_nip'] || '').trim();
      effective[rm.key] = origName;
      if (!origName) return;

      const conflict = getConflictReasonApel_(absentByDate, activeDates, origNip, origName);
      if (!conflict) return;

      for (let step = 1; step < rows.length; step++) {
        const candRow = rows[(pickedIdx + step) % rows.length];
        const candName = String(candRow[rm.key] || '').trim();
        const candNip = String(candRow[rm.key + '_nip'] || '').trim();
        if (!candName) continue;
        const candNorm = normalizeApelNameKey_(candName);
        if (!candNorm || candNorm === normalizeApelNameKey_(origName) || usedSubstitutes[candNorm]) continue;
        const candConflict = getConflictReasonApel_(absentByDate, activeDates, candNip, candName);
        if (!candConflict) {
          effective[rm.key] = candName;
          usedSubstitutes[candNorm] = true;
          substitutions.push({
            role: rm.key,
            role_label: rm.label,
            original: origName,
            replacement: candName,
            reason: conflict.reason,
            date_conflict: conflict.ymd
          });
          break;
        }
      }
    });

    let posterBase64 = '';
    const posterFileId = String(row.poster_file_id || '').trim();
    if (posterFileId && substitutions.length === 0) {
      try {
        const f = DriveApp.getFileById(posterFileId);
        if (f && !f.isTrashed()) {
          posterBase64 = Utilities.base64Encode(f.getBlob().getBytes());
        }
      } catch (eDrive) {}
    }

    return {
      status: 'success',
      dispatch_date: todayStr,
      tahun: activeTahunDoc.tahun || targetYearGuess,
      nomor_sk: String(activeTahunDoc.nomor_sk || ''),
      tanggal_sk: String(activeTahunDoc.tanggal_sk || ''),
      settings: {
        admin_wa: String(settingsDoc.admin_wa || ''),
        jam_kirim: String(settingsDoc.jam_kirim || '15:00'),
        caption_template: String(settingsDoc.caption_template || '')
      },
      week_index: pickedIdx,
      week_no: row.no || (pickedIdx + 1),
      hari_mode: hariMode,
      tgl_senin: snYmd,
      tgl_jumat: jmYmd,
      label_senin: snYmd ? ('SENIN, ' + formatApelYmdToIndoUpper_(snYmd)) : '',
      label_jumat: jmYmd ? ('JUMAT, ' + formatApelYmdToIndoUpper_(jmYmd)) : '',
      original_petugas: {
        pembina: String(row.pembina || ''),
        pemimpin: String(row.pemimpin || ''),
        doa: String(row.doa || ''),
        nilai_ma: String(row.nilai_ma || ''),
        mc: String(row.mc || ''),
        budaya_malu: String(row.budaya_malu || '')
      },
      effective_petugas: effective,
      substitutions: substitutions,
      has_substitutions: substitutions.length > 0,
      poster_file_id: posterFileId,
      poster_file_url: String(row.poster_url || ''),
      poster_png_base64: posterBase64,
      satpam_count: satpamDocs.length
    };
  } catch (err) {
    return {
      status: 'error',
      message: 'Gagal menyusun dispatch Apel mingguan: ' + (err && err.message ? err.message : String(err))
    };
  }
}
