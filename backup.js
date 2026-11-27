// ==========================================
// FILE: backup.js (backup.gs - Sistem Auto Backup Gabungan Sheets & Firestore Inti + Cleanup 7 Hari)
// ==========================================

var BACKUP_RETENTION_DAYS_ = 7;
var BACKUP_EXCLUDED_COLLECTIONS_ = ['user_avatars', 'security_incidents', 'audit_logs'];
var BACKUP_FIRESTORE_COLLECTIONS_ = [
  'sk_documents',
  'sop_documents',
  'jobdes_documents',
  'jobdes_usulan',
  'master_kinerja',
  'pkp_documents',
  'pck_documents',
  'pck_rekapitulasi',
  'eoffice_kgb',
  'eoffice_rapat',
  'eoffice_apel',
  'surat_tugas_documents'
];

function exportFirestoreCollectionRest_(collectionName, accessToken, projectId) {
  const projId = String(projectId || 'transkep-314c0').trim();
  const baseUrl = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(projId) +
    '/databases/(default)/documents/' +
    encodeURIComponent(String(collectionName));
  const documents = [];
  let pageToken = '';
  let pageCount = 0;

  try {
    while (pageCount < 100) {
      pageCount++;
      let url = baseUrl + '?pageSize=300';
      if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);

      const resp = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { Authorization: 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      const rawText = resp.getContentText() || '{}';
      if (code === 404) {
        return { documents: documents, error: null };
      }
      if (code < 200 || code >= 300) {
        return {
          documents: documents,
          error: 'HTTP ' + code + ': ' + String(rawText).slice(0, 300)
        };
      }
      const json = JSON.parse(rawText);
      if (json && Array.isArray(json.documents)) {
        for (let i = 0; i < json.documents.length; i++) {
          documents.push(json.documents[i]);
        }
      }
      if (json && json.nextPageToken) {
        pageToken = String(json.nextPageToken);
      } else {
        break;
      }
    }
    return { documents: documents, error: null };
  } catch (err) {
    return {
      documents: documents,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function exportCoreFirestoreCollections_() {
  const sa = (typeof parseFirebaseServiceAccount_ === 'function') ? parseFirebaseServiceAccount_() : null;
  const projectId = (sa && sa.project_id) || 'transkep-314c0';
  const accessToken = (typeof getFirebaseServiceAccessToken_ === 'function') ? getFirebaseServiceAccessToken_() : null;

  const result = {
    exported_at: new Date().toISOString(),
    project_id: projectId,
    retention_days: BACKUP_RETENTION_DAYS_,
    excluded_collections: BACKUP_EXCLUDED_COLLECTIONS_.slice(),
    total_documents: 0,
    collections: {},
    errors: []
  };

  if (!accessToken) {
    result.errors.push({
      collection: '_auth',
      error: 'FIREBASE_SERVICE_ACCOUNT_JSON tidak tersedia atau gagal mendapatkan OAuth access token.'
    });
    return result;
  }

  for (let i = 0; i < BACKUP_FIRESTORE_COLLECTIONS_.length; i++) {
    const colName = BACKUP_FIRESTORE_COLLECTIONS_[i];
    const colRes = exportFirestoreCollectionRest_(colName, accessToken, projectId);
    result.collections[colName] = colRes.documents;
    result.total_documents += colRes.documents.length;
    if (colRes.error) {
      result.errors.push({ collection: colName, error: colRes.error });
    }
  }

  return result;
}

function findOrCreateBackupSubfolder_(parentFolder, folderName) {
  if (!parentFolder) throw new Error('Folder induk backup tidak valid.');
  if (typeof parentFolder.getFoldersByName === 'function') {
    const existing = parentFolder.getFoldersByName(folderName);
    if (existing && existing.hasNext()) {
      return existing.next();
    }
  } else if (typeof parentFolder.getFolders === 'function') {
    const allSubs = parentFolder.getFolders();
    while (allSubs && allSubs.hasNext()) {
      const sub = allSubs.next();
      if (sub && typeof sub.getName === 'function' && sub.getName() === folderName) {
        return sub;
      }
    }
  }
  return parentFolder.createFolder(folderName);
}

function trashExistingNamedFilesInFolder_(folder, targetName) {
  if (!folder || !targetName) return;
  const it = (typeof folder.getFilesByName === 'function')
    ? folder.getFilesByName(targetName)
    : (typeof folder.getFiles === 'function' ? folder.getFiles() : null);
  while (it && it.hasNext()) {
    const f = it.next();
    if (f && typeof f.getName === 'function' && f.getName() === targetName && typeof f.setTrashed === 'function') {
      f.setTrashed(true);
    }
  }
}

// TRANSKEP PRIVAT: Akhiran underscore mencegah fungsi ini dipanggil publik dari klien via google.script.run
function runDailyBackup_() {
  try {
    const dbId = PropertiesService.getScriptProperties().getProperty('TRANSKEP_DB_ID');
    if (!dbId) throw new Error('ID Database (TRANSKEP_DB_ID) tidak ditemukan di Script Properties.');

    const dbFile = DriveApp.getFileById(dbId);
    const now = new Date();
    const dateFolderName = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
    const dateString = Utilities.formatDate(now, 'Asia/Jakarta', 'dd-MM-yyyy');

    const backupFolderName = 'TRANSKEP BACKUPS';
    const rootFolders = DriveApp.getFoldersByName(backupFolderName);
    const backupFolder = (rootFolders && rootFolders.hasNext())
      ? rootFolders.next()
      : DriveApp.createFolder(backupFolderName);

    const dateFolder = findOrCreateBackupSubfolder_(backupFolder, dateFolderName);

    // 1. Salin Google Sheets Database Utama ke subfolder tanggal hari ini
    const sheetsBackupName = '[BACKUP] TRANSKEP_DB_' + dateString;
    trashExistingNamedFilesInFolder_(dateFolder, sheetsBackupName);
    dbFile.makeCopy(sheetsBackupName, dateFolder);

    // 2. Ekspor 11 koleksi inti Firestore (mengecualikan user_avatars, security_incidents, audit_logs)
    const fsExport = exportCoreFirestoreCollections_();
    const fsBackupName = '[BACKUP] FIRESTORE_INTI_' + dateString + '.json';
    trashExistingNamedFilesInFolder_(dateFolder, fsBackupName);
    const fsBlob = Utilities.newBlob(JSON.stringify(fsExport, null, 2), 'application/json', fsBackupName);
    dateFolder.createFile(fsBlob);

    // 3. Auto-Cleanup retensi 7 hari (folder tanggal + file legacy di root TRANSKEP BACKUPS)
    const deletedOldItems = cleanupOldBackups_(backupFolder, BACKUP_RETENTION_DAYS_);

    Logger.log(
      'Backup harian sukses (' + dateFolderName + '): Sheets=' + sheetsBackupName +
      ', Firestore=' + fsBackupName + ' (' + fsExport.total_documents + ' dok)' +
      ', Cleanup=' + deletedOldItems
    );

    return {
      status: 'success',
      dateFolder: dateFolderName,
      sheetsFile: sheetsBackupName,
      firestoreFile: fsBackupName,
      firestoreDocs: fsExport.total_documents,
      deletedOldItems: deletedOldItems,
      firestoreErrors: fsExport.errors
    };
  } catch (e) {
    Logger.log('ERROR Sistem Backup: ' + e.toString());
    return {
      status: 'error',
      message: e && e.message ? e.message : String(e)
    };
  }
}

function cleanupOldBackups_(folder, retentionDays) {
  if (!folder) return 0;
  const days = Number(retentionDays) > 0 ? Number(retentionDays) : BACKUP_RETENTION_DAYS_;
  const nowMs = Date.now();
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  if (typeof folder.getFolders === 'function') {
    const subFolders = folder.getFolders();
    while (subFolders && subFolders.hasNext()) {
      const sub = subFolders.next();
      const created = (sub && typeof sub.getDateCreated === 'function') ? sub.getDateCreated() : null;
      if (created && (nowMs - created.getTime()) > maxAgeMs && typeof sub.setTrashed === 'function') {
        sub.setTrashed(true);
        deletedCount++;
      }
    }
  }

  if (typeof folder.getFiles === 'function') {
    const files = folder.getFiles();
    while (files && files.hasNext()) {
      const file = files.next();
      const dateCreated = (file && typeof file.getDateCreated === 'function') ? file.getDateCreated() : null;
      if (dateCreated && (nowMs - dateCreated.getTime()) > maxAgeMs && typeof file.setTrashed === 'function') {
        file.setTrashed(true);
        deletedCount++;
      }
    }
  }

  if (deletedCount > 0) {
    Logger.log(deletedCount + ' arsip backup lama (> ' + days + ' hari) telah dipindahkan ke Trash.');
  }
  return deletedCount;
}

// Entry point trigger harian Apps Script (JANGAN dimasukkan ke allowlist api_router.js)
function jalankanBackupHarianTerjadwal() {
  return runDailyBackup_();
}

function pasangTriggerBackupHarian() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (let i = 0; i < triggers.length; i++) {
    const fn = (triggers[i] && typeof triggers[i].getHandlerFunction === 'function')
      ? triggers[i].getHandlerFunction()
      : '';
    if (fn === 'jalankanBackupHarianTerjadwal' || fn === 'runDailyBackup_') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  ScriptApp.newTrigger('jalankanBackupHarianTerjadwal')
    .timeBased()
    .atHour(1)
    .everyDays(1)
    .inTimezone('Asia/Jakarta')
    .create();

  const msg = 'Trigger backup harian TRANSKEP aktif (01:00 WIB setiap hari, retensi ' + BACKUP_RETENTION_DAYS_ + ' hari).';
  Logger.log(msg);
  return { status: 'success', message: msg, removedOldTriggers: removed };
}

function restoreFirestoreBackup_(driveJsonFileId, dryRun) {
  const fileId = String(driveJsonFileId || '').trim();
  if (!fileId) {
    throw new Error('ID file JSON backup di Google Drive wajib disertakan.');
  }

  const file = DriveApp.getFileById(fileId);
  const rawJson = file.getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(rawJson || '{}');
  if (!parsed || !parsed.collections || typeof parsed.collections !== 'object') {
    throw new Error('Format file JSON backup Firestore tidak valid.');
  }

  const isDryRun = (dryRun === true);
  const sa = (typeof parseFirebaseServiceAccount_ === 'function') ? parseFirebaseServiceAccount_() : null;
  const projectId = String(parsed.project_id || (sa && sa.project_id) || 'transkep-314c0').trim();
  const accessToken = isDryRun
    ? null
    : ((typeof getFirebaseServiceAccessToken_ === 'function') ? getFirebaseServiceAccessToken_() : null);

  if (!isDryRun && !accessToken) {
    throw new Error('Token Service Account Firebase tidak tersedia untuk operasi restore.');
  }

  const allowedSet = {};
  for (let i = 0; i < BACKUP_FIRESTORE_COLLECTIONS_.length; i++) {
    allowedSet[BACKUP_FIRESTORE_COLLECTIONS_[i]] = true;
  }

  const report = {
    status: 'success',
    dryRun: isDryRun,
    projectId: projectId,
    restoredCount: 0,
    skippedCount: 0,
    collections: {},
    errors: []
  };

  const colNames = Object.keys(parsed.collections);
  for (let c = 0; c < colNames.length; c++) {
    const colName = colNames[c];
    if (!allowedSet[colName]) {
      const skippedArr = Array.isArray(parsed.collections[colName]) ? parsed.collections[colName] : [];
      report.skippedCount += skippedArr.length;
      continue;
    }

    const docs = Array.isArray(parsed.collections[colName]) ? parsed.collections[colName] : [];
    let colRestored = 0;

    for (let d = 0; d < docs.length; d++) {
      const doc = docs[d];
      if (!doc || typeof doc !== 'object') continue;
      const rawName = String(doc.name || '').trim();
      const docId = rawName ? rawName.split('/').pop() : String(doc.id || '').trim();
      if (!docId) {
        report.skippedCount++;
        continue;
      }

      if (isDryRun) {
        colRestored++;
        report.restoredCount++;
        continue;
      }

      const patchUrl = 'https://firestore.googleapis.com/v1/projects/' +
        encodeURIComponent(projectId) +
        '/databases/(default)/documents/' +
        encodeURIComponent(colName) + '/' +
        encodeURIComponent(docId);

      const resp = UrlFetchApp.fetch(patchUrl, {
        method: 'patch',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify({ fields: doc.fields || {} }),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        colRestored++;
        report.restoredCount++;
      } else {
        report.errors.push({
          collection: colName,
          docId: docId,
          error: 'HTTP ' + code + ': ' + String(resp.getContentText() || '').slice(0, 200)
        });
      }
    }

    report.collections[colName] = colRestored;
  }

  return report;
}
