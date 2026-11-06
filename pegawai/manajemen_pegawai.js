// ==========================================
// File: manajemen_pegawai.gs
// Deskripsi: Controller Backend untuk Kelola Pegawai
// ==========================================

function addUser(payload, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Anda tidak memiliki izin Admin untuk menambah pegawai.' };
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = readUserSheetDecrypted_(sheet);
    
    // Cek apakah NIP sudah ada (dibandingkan terhadap NIP yang telah didekripsi di memori)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.nip)) {
        throw new Error("NIP sudah terdaftar di database.");
      }
    }
    
    const encNip = encryptField_(payload.nip);
    const encHp = encryptField_(payload.no_hp || '');
    const encPass = encryptPasswordField_(payload.pass || '123456');
    const encAlamat = encryptField_(payload.alamat || '');

    const newRow = [
      encNip, payload.nama, payload.jabatan, payload.role, encHp, encPass,
      payload.s_tahunan_2024, payload.s_tahunan_2025, payload.s_tahunan_2026,
      payload.s_sakit, payload.s_penting, payload.s_besar, payload.s_melahirkan, payload.s_cltn,
      payload.pangkat, encAlamat, payload.tmt_kgb, payload.tmt_knp, payload.bup,
      "", "", "", "", "", "", // Kolom 20-25 dikosongkan agar aman untuk sistem KNP/KGB
      payload.jenis_jabatan || "Fungsional Umum" // Kolom 26: Parameter Baru Jenis Jabatan
    ];
    
    sheet.appendRow(newRow);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1).setNumberFormat('@');
    sheet.getRange(lastRow, 5, 1, 2).setNumberFormat('@');
    sheet.getRange(lastRow, 16).setNumberFormat('@');
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Data pegawai baru berhasil ditambahkan dan dienkripsi.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function updateUser(payload, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Anda tidak memiliki izin Admin untuk mengubah data pegawai.' };
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = readUserSheetDecrypted_(sheet);
    
    const targetOriginalNip = String(payload.originalNip || payload.nip || '').trim();
    let rowIndex = -1;
    let existingPass = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === targetOriginalNip) {
        rowIndex = i + 1;
        existingPass = String(data[i][5] || '');
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Data pegawai tidak ditemukan.");
    
    let rawPassInput = String(payload.pass || '').trim();
    if (!rawPassInput || rawPassInput.startsWith('[Telah')) {
      rawPassInput = existingPass || '123456';
    }

    const encNip = encryptField_(payload.nip);
    const encHp = encryptField_(payload.no_hp || '');
    const encPass = encryptPasswordField_(rawPassInput);
    const encAlamat = encryptField_(payload.alamat || '');

    const rowData = [
      [encNip, payload.nama, payload.jabatan, payload.role, encHp, encPass,
       payload.s_tahunan_2024, payload.s_tahunan_2025, payload.s_tahunan_2026,
       payload.s_sakit, payload.s_penting, payload.s_besar, payload.s_melahirkan, payload.s_cltn,
       payload.pangkat, encAlamat, payload.tmt_kgb, payload.tmt_knp, payload.bup]
    ];
    
    sheet.getRange(rowIndex, 1, 1, 19).setValues(rowData);
    sheet.getRange(rowIndex, 1).setNumberFormat('@');
    sheet.getRange(rowIndex, 5, 1, 2).setNumberFormat('@');
    sheet.getRange(rowIndex, 16).setNumberFormat('@');
    
    // FIX: Update kolom ke-26 secara spesifik
    sheet.getRange(rowIndex, 26).setValue(payload.jenis_jabatan || "Fungsional Umum");
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Data profil pegawai berhasil diperbarui dan dienkripsi.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function deleteUser(nip, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Anda tidak memiliki izin Admin untuk menghapus pegawai.' };
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = readUserSheetDecrypted_(sheet);
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nip)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Data pegawai tidak ditemukan.");
    
    sheet.deleteRow(rowIndex);
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Data pegawai berhasil dihapus permanen.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function importBulkUsers(jsonArray, adminNip, clientToken) { 
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Anda tidak memiliki izin Admin untuk mengimpor data pegawai.' };
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const existingData = readUserSheetDecrypted_(sheet);
    
    // Buat pemetaan NIP (yang sudah didekripsi di memori) untuk mendeteksi update vs penambahan baru
    const existingMap = {};
    for (let i = 1; i < existingData.length; i++) {
       existingMap[String(existingData[i][0])] = i + 1; // index baris
    }
    
    jsonArray.forEach(payload => {
       const nipStr = String(payload['NIP'] || '').trim();
       if (!nipStr) return;
       const jenis = payload['Jenis_Jabatan'] || 'Fungsional Umum';
       
       const encNip = encryptField_(nipStr);
       const encHp = encryptField_(payload['No_HP'] || '');
       const encPass = encryptPasswordField_(payload['Password'] || '123456');
       const encAlamat = encryptField_(payload['Alamat'] || '');

       const rowData = [
          encNip, payload['Nama'], payload['Jabatan']||'', payload['Role']||'Pegawai', encHp, encPass,
          Number(payload['Sisa_Tahunan_2024'])||0, Number(payload['Sisa_Tahunan_2025'])||0, Number(payload['Sisa_Tahunan_2026'])||0,
          Number(payload['Sisa_Sakit'])||0, Number(payload['Sisa_Penting'])||0, Number(payload['Sisa_Besar'])||0, 
          Number(payload['Sisa_Melahirkan'])||0, Number(payload['Sisa_CLTN'])||0,
          payload['Pangkat']||'', encAlamat, payload['TMT_KGB']||'', payload['TMT_KNP']||'', Number(payload['BUP'])||58
       ];
       
       if (existingMap[nipStr]) {
          const targetRow = existingMap[nipStr];
          sheet.getRange(targetRow, 1, 1, 19).setValues([rowData]);
          sheet.getRange(targetRow, 1).setNumberFormat('@');
          sheet.getRange(targetRow, 5, 1, 2).setNumberFormat('@');
          sheet.getRange(targetRow, 16).setNumberFormat('@');
          sheet.getRange(targetRow, 26).setValue(jenis); // Set Kolom 26
       } else {
          // Buat data baru dan padding string kosong
          const newRow = [...rowData, "", "", "", "", "", "", jenis];
          sheet.appendRow(newRow);
          const lastRow = sheet.getLastRow();
          sheet.getRange(lastRow, 1).setNumberFormat('@');
          sheet.getRange(lastRow, 5, 1, 2).setNumberFormat('@');
          sheet.getRange(lastRow, 16).setNumberFormat('@');
       }
    });
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Import/Sinkronisasi excel ke database berhasil diproses dan dienkripsi.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

var simpanDataMassal = importBulkUsers;