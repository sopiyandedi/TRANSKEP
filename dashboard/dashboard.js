// ==========================================
// File: dashboard.gs
// Deskripsi: Backend Controller untuk Dashboard
// ==========================================

function initDashboardDB() {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('user_data');
    if (!sheet) throw new Error("Sheet user_data tidak ditemukan.");
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // ZETTBOT FIX: Cek apakah kolom Pensiun sudah dibuat di ujung database
    let colStatusPensiun = headers.indexOf('Status_Pensiun');
    if (colStatusPensiun === -1) {
      // Jika belum ada, tambahkan kolom baru
      const newHeaders = [['Status_Pensiun', 'Tgl_Selesai_Pensiun']];
      const startCol = headers.length + 1; 
      sheet.getRange(1, startCol, 1, 2).setValues(newHeaders)
           .setFontWeight('bold')
           .setBackground('#064e3b')
           .setFontColor('#ffffff')
           .setHorizontalAlignment('center');
      SpreadsheetApp.flush();
      Logger.log("SUCCESS: Kolom Pensiun berhasil ditambahkan!");
      return "SUCCESS: Kolom Pensiun berhasil ditambahkan!";
    }
    
    Logger.log("AMAN: Database Dashboard sudah siap.");
    return "AMAN: Database Dashboard sudah siap.";
  } catch (e) {
    Logger.log("Error: " + e.toString());
    return "Error: " + e.toString();
  }
}

function updateTmtStatus(nip, type, newStatus) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let rowIndex = -1;
    for(let i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(nip)) { rowIndex = i+1; break; }
    }
    if(rowIndex === -1) throw new Error("Pegawai tidak ditemukan di database.");

    let colStatus, colTgl;
    if(type === 'KGB') {
      colStatus = headers.indexOf('Status_KGB') + 1;
      colTgl = headers.indexOf('Tgl_Selesai_KGB') + 1;
    } else if(type === 'Pangkat' || type === 'KNP') {
      colStatus = headers.indexOf('Status_KNP') + 1;
      colTgl = headers.indexOf('Tgl_Selesai_KNP') + 1;
    } else if(type === 'Pensiun') { // ZETTBOT FIX: Dukungan Status Pensiun
      colStatus = headers.indexOf('Status_Pensiun') + 1;
      colTgl = headers.indexOf('Tgl_Selesai_Pensiun') + 1;
    } else {
      throw new Error("Tipe peringatan tidak valid.");
    }

    if(colStatus === 0) throw new Error("Kolom belum diinisialisasi. Pastikan database lengkap.");

    let todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    let valTgl = (newStatus === 'Selesai') ? todayStr : '';
    let valStatus = (newStatus === 'Menunggu') ? '' : newStatus; 

    sheet.getRange(rowIndex, colStatus).setValue(valStatus);
    sheet.getRange(rowIndex, colTgl).setValue(valTgl);

    SpreadsheetApp.flush();
    return { status: 'success', message: 'Status berhasil diperbarui' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function forwardTmtDateByFrontend(nip, type, newDateStr) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let rowIndex = -1;
    for(let i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(nip)) { rowIndex = i+1; break; }
    }
    if(rowIndex === -1) return { status: 'error', message: 'Pegawai tidak ditemukan' };

    let colTmt, colStatus, colTgl;
    if(type === 'KGB') {
      colTmt = headers.indexOf('TMT_KGB') + 1;
      colStatus = headers.indexOf('Status_KGB') + 1;
      colTgl = headers.indexOf('Tgl_Selesai_KGB') + 1;
    } else if(type === 'Pangkat' || type === 'KNP') {
      colTmt = headers.indexOf('TMT_KNP') + 1;
      colStatus = headers.indexOf('Status_KNP') + 1;
      colTgl = headers.indexOf('Tgl_Selesai_KNP') + 1;
    } else {
      return { status: 'error' };
    }

    sheet.getRange(rowIndex, colTmt).setValue(newDateStr);
    sheet.getRange(rowIndex, colTmt).setNumberFormat('@'); 
    
    if (colStatus > 0) {
        sheet.getRange(rowIndex, colStatus).setValue('');
        sheet.getRange(rowIndex, colTgl).setValue('');
    }

    SpreadsheetApp.flush();
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}