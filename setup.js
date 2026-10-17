// ==========================================
// File: setup.gs
// Deskripsi: Script inisialisasi database & Migrasi Data
// ==========================================

// ZETTBOT PRIVAT: Akhiran underscore mencegah fungsi ini dipanggil publik dari klien via google.script.run
function setupDatabase_() {
  try {
    let ss = null;
    
    // 1. Coba deteksi apakah ini adalah bound-script (menyatu dengan sheet)
    try { 
      ss = SpreadsheetApp.getActiveSpreadsheet(); 
    } catch (boundError) {}
    
    // 2. Jika tidak terdeteksi (mungkin standalone), kita coba buat baru atau pakai yang ada
    if (!ss) {
      const props = PropertiesService.getScriptProperties();
      let ssId = props.getProperty("TRANSKEP_DB_ID");
      
      if (ssId) {
        try { ss = SpreadsheetApp.openById(ssId); } catch (openError) { ssId = null; }
      }
      
      if (!ss) {
        // Buat file baru jika benar-benar tidak ada
        ss = SpreadsheetApp.create("TRANSKEP_Database");
        props.setProperty("TRANSKEP_DB_ID", ss.getId());
      }
    }
    
    // 3. Simpan ID secara eksplisit ke Properties agar selalu bisa dipanggil oleh sistem
    if (ss) {
       PropertiesService.getScriptProperties().setProperty("TRANSKEP_DB_ID", ss.getId());
    } else {
       throw new Error("Gagal mendeteksi atau membuat spreadsheet database.");
    }
    
    // =====================================
    // SETUP TABEL USER (100% AMAN, TIDAK HAPUS DATA)
    // =====================================
    let userSheet = ss.getSheetByName('user_data');
    if (!userSheet) userSheet = ss.insertSheet('user_data');
    
    if (userSheet.getLastRow() === 0) {
        const userHeaders = [
          'NIP', 'Nama', 'Jabatan', 'Role', 'No_HP', 'Password', 
          'Sisa_Tahunan_2024', 'Sisa_Tahunan_2025', 'Sisa_Tahunan_2026', 'Sisa_Sakit', 
          'Sisa_Penting', 'Sisa_Besar', 'Sisa_Melahirkan', 'Sisa_CLTN',
          'Pangkat', 'Alamat', 'TMT_KGB', 'TMT_KNP', 'BUP',
          'Status_KGB', 'Tgl_Selesai_KGB', 'Status_KNP', 'Tgl_Selesai_KNP', 
          'Status_Pensiun', 'Tgl_Selesai_Pensiun', 'Jenis_Jabatan'
        ];
        userSheet.appendRow(userHeaders);
        userSheet.getRange(1, 1, 1, userHeaders.length).setFontWeight('bold').setBackground('#064e3b').setFontColor('#ffffff').setHorizontalAlignment('center');
        userSheet.getRange("A:A").setNumberFormat('@'); 
    }
    
    // =====================================
    // SETUP TABEL E-OFFICE (SAFE MIGRATION)
    // =====================================
    try {
      if (typeof initEofficeDatabase_ === 'function') {
        initEofficeDatabase_();
      }
    } catch(eoffErr) {
      Logger.log("Warning initEofficeDatabase: " + eoffErr.toString());
    }

    SpreadsheetApp.flush();
    Logger.log("SUKSES: Database siap dan 100% AMAN. ID Database: " + ss.getId());
  } catch (e) {
    Logger.log("ERROR CRITICAL: " + e.toString());
  }
}