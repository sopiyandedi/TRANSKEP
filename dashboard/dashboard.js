// ==========================================
// File: dashboard.gs
// Deskripsi: Backend Controller untuk Dashboard
// ==========================================

function initDashboardDB() {
  try {
    const ss = getDB(); // TRANSKEP: Menggunakan konektor terpusat
    const sheet = ss.getSheetByName('user_data');
    if (!sheet) throw new Error("Sheet user_data tidak ditemukan.");
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    let colStatusPensiun = headers.indexOf('Status_Pensiun');
    if (colStatusPensiun === -1) {
      const newHeaders = [['Status_Pensiun', 'Tgl_Selesai_Pensiun']];
      const startCol = headers.length + 1; 
      sheet.getRange(1, startCol, 1, 2).setValues(newHeaders)
           .setFontWeight('bold')
           .setBackground('#064e3b')
           .setFontColor('#ffffff')
           .setHorizontalAlignment('center');
      if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
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

// Ubah signature fungsi menjadi seperti ini:
function updateTmtStatus(actorNip, targetNip, type, newStatus, clientToken) {
  try {
    // 1. Validasi keamanan RBAC: Hanya Admin dan Operator yang berwenang mengubah status berkas
    if (!cekOtorisasiAdminOrOperator(actorNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Hanya Admin dan Operator yang berwenang mengubah status berkas.' };
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let rowIndex = -1;
    // 2. Cari baris database menggunakan NIP pegawai target (targetNip) dengan normalisasi string
    const cleanTargetNip = String(targetNip || '').replace(/['"\s]/g, '');
    for(let i=1; i<data.length; i++) {
      const rowNip = String(data[i][0] || '').replace(/['"\s]/g, '');
      if(rowNip === cleanTargetNip) { rowIndex = i+1; break; }
    }
    if(rowIndex === -1) throw new Error("Pegawai dengan NIP " + targetNip + " tidak ditemukan di database.");

    const findHeaderCol = (name, fallbackIdx) => {
      const idx = headers.findIndex(h => String(h || '').trim().toLowerCase() === name.toLowerCase());
      return idx !== -1 ? (idx + 1) : fallbackIdx;
    };

    let colStatus, colTgl;
    if(type === 'KGB') {
      colStatus = findHeaderCol('Status_KGB', 20);
      colTgl = findHeaderCol('Tgl_Selesai_KGB', 21);
    } else if(type === 'Pangkat' || type === 'KNP') {
      colStatus = findHeaderCol('Status_KNP', 22);
      colTgl = findHeaderCol('Tgl_Selesai_KNP', 23);
    } else if(type === 'Pensiun') { 
      colStatus = findHeaderCol('Status_Pensiun', 24);
      colTgl = findHeaderCol('Tgl_Selesai_Pensiun', 25);
    } else {
      throw new Error("Tipe peringatan tidak valid.");
    }

    if(!colStatus || colStatus <= 0) throw new Error("Kolom belum diinisialisasi. Pastikan database lengkap.");

    let todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    let valTgl = (newStatus === 'Selesai') ? todayStr : '';
    let valStatus = (newStatus === 'Menunggu') ? '' : newStatus; 

    sheet.getRange(rowIndex, colStatus).setValue(valStatus);
    sheet.getRange(rowIndex, colTgl).setValue(valTgl);

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Status berhasil diperbarui' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function forwardTmtDateByFrontend(actorNip, targetNip, type, newDateStr, clientToken) {
  try {
    if (!cekOtorisasi(actorNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi kedaluwarsa atau manipulasi terdeteksi.' };
    }

    const ss = getDB(); // TRANSKEP: Menggunakan konektor terpusat
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let rowIndex = -1;
    const cleanTargetNip = String(targetNip || '').replace(/['"\s]/g, '');
    for(let i=1; i<data.length; i++) {
      const rowNip = String(data[i][0] || '').replace(/['"\s]/g, '');
      if(rowNip === cleanTargetNip) { rowIndex = i+1; break; }
    }
    if(rowIndex === -1) return { status: 'error', message: 'Pegawai dengan NIP ' + targetNip + ' tidak ditemukan' };

    const findHeaderCol = (name, fallbackIdx) => {
      const idx = headers.findIndex(h => String(h || '').trim().toLowerCase() === name.toLowerCase());
      return idx !== -1 ? (idx + 1) : fallbackIdx;
    };

    let colTmt, colStatus, colTgl;
    if(type === 'KGB') {
      colTmt = findHeaderCol('TMT_KGB', 17);
      colStatus = findHeaderCol('Status_KGB', 20);
      colTgl = findHeaderCol('Tgl_Selesai_KGB', 21);
    } else if(type === 'Pangkat' || type === 'KNP') {
      colTmt = findHeaderCol('TMT_KNP', 18);
      colStatus = findHeaderCol('Status_KNP', 22);
      colTgl = findHeaderCol('Tgl_Selesai_KNP', 23);
    } else {
      return { status: 'error', message: 'Tipe berkas tidak valid.' };
    }

    sheet.getRange(rowIndex, colTmt).setValue(newDateStr);
    sheet.getRange(rowIndex, colTmt).setNumberFormat('@'); 
    
    if (colStatus > 0) {
        sheet.getRange(rowIndex, colStatus).setValue('');
        sheet.getRange(rowIndex, colTgl).setValue('');
    }

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}