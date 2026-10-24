// ==========================================
// FILE: backup.gs (Sistem Auto Backup & Cleanup)
// ==========================================

// TRANSKEP PRIVAT: Akhiran underscore mencegah fungsi ini dipanggil publik dari klien via google.script.run
function runDailyBackup_() {
  try {
    // 1. Ambil ID Database Utama
    const dbId = PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID");
    if (!dbId) throw new Error("ID Database tidak ditemukan di sistem.");
    
    const dbFile = DriveApp.getFileById(dbId);
    const now = new Date();
    // Gunakan format hari-bulan-tahun
    const dateString = Utilities.formatDate(now, "Asia/Jakarta", "dd-MM-yyyy");
    
    // 2. Cari atau Buat Folder Backup di Drive Utama Anda
    const backupFolderName = "TRANSKEP BACKUPS";
    let backupFolder;
    const folders = DriveApp.getFoldersByName(backupFolderName);
    
    if (folders.hasNext()) {
      backupFolder = folders.next();
    } else {
      backupFolder = DriveApp.createFolder(backupFolderName);
    }
    
    // 3. Gandakan File (Backup Keseluruhan Database)
    const backupFileName = `[BACKUP] TRANSKEP_DB_${dateString}`;
    dbFile.makeCopy(backupFileName, backupFolder);
    Logger.log(`Backup harian sukses dibuat: ${backupFileName}`);
    
    // 4. Auto-Cleanup (Menghapus backup yang usianya sudah lebih dari 30 Hari)
    cleanupOldBackups_(backupFolder);
    
  } catch (e) {
    Logger.log("ERROR Sistem Backup: " + e.toString());
  }
}

function cleanupOldBackups_(folder) {
  const files = folder.getFiles();
  const now = new Date();
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000; // 30 Hari dalam hitungan Milidetik
  let deletedCount = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const dateCreated = file.getDateCreated();
    const ageInMs = now.getTime() - dateCreated.getTime();
    
    // Jika usia file lebih dari 30 hari
    if (ageInMs > thirtyDaysInMs) {
      file.setTrashed(true); // Memindahkan file ke tempat sampah (Trash)
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    Logger.log(`${deletedCount} file backup lama (lebih dari 30 hari) telah dibersihkan.`);
  }
}