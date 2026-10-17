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
    const data = sheet.getDataRange().getValues();
    
    // Cek apakah NIP sudah ada
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.nip)) {
        throw new Error("NIP sudah terdaftar di database.");
      }
    }
    
    const newRow = [
      payload.nip, payload.nama, payload.jabatan, payload.role, payload.no_hp, payload.pass,
      payload.s_tahunan_2024, payload.s_tahunan_2025, payload.s_tahunan_2026,
      payload.s_sakit, payload.s_penting, payload.s_besar, payload.s_melahirkan, payload.s_cltn,
      payload.pangkat, payload.alamat, payload.tmt_kgb, payload.tmt_knp, payload.bup,
      "", "", "", "", "", "", // Kolom 20-25 dikosongkan agar aman untuk sistem KNP/KGB
      payload.jenis_jabatan || "Fungsional Umum" // Kolom 26: Parameter Baru Jenis Jabatan
    ];
    
    sheet.appendRow(newRow);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1).setNumberFormat('@'); // Set NIP jadi plain text
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Data pegawai baru berhasil ditambahkan.' };
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
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.originalNip)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Data pegawai tidak ditemukan.");
    
    const rowData = [
      [payload.nip, payload.nama, payload.jabatan, payload.role, payload.no_hp, payload.pass,
       payload.s_tahunan_2024, payload.s_tahunan_2025, payload.s_tahunan_2026,
       payload.s_sakit, payload.s_penting, payload.s_besar, payload.s_melahirkan, payload.s_cltn,
       payload.pangkat, payload.alamat, payload.tmt_kgb, payload.tmt_knp, payload.bup]
    ];
    
    sheet.getRange(rowIndex, 1, 1, 19).setValues(rowData);
    sheet.getRange(rowIndex, 1).setNumberFormat('@');
    
    // ZETTBOT FIX: Update kolom ke-26 secara spesifik
    sheet.getRange(rowIndex, 26).setValue(payload.jenis_jabatan || "Fungsional Umum");
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Data profil pegawai berhasil diperbarui.' };
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
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nip)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Data pegawai tidak ditemukan.");
    
    sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
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
    const existingData = sheet.getDataRange().getValues();
    
    // Buat pemetaan NIP untuk mendeteksi update vs penambahan baru
    const existingMap = {};
    for (let i = 1; i < existingData.length; i++) {
       existingMap[String(existingData[i][0])] = i + 1; // index baris
    }
    
    jsonArray.forEach(payload => {
       const nipStr = String(payload['NIP']);
       const jenis = payload['Jenis_Jabatan'] || 'Fungsional Umum';
       
       const rowData = [
          nipStr, payload['Nama'], payload['Jabatan']||'', payload['Role']||'Pegawai', payload['No_HP']||'', payload['Password']||'123456',
          Number(payload['Sisa_Tahunan_2024'])||0, Number(payload['Sisa_Tahunan_2025'])||0, Number(payload['Sisa_Tahunan_2026'])||0,
          Number(payload['Sisa_Sakit'])||0, Number(payload['Sisa_Penting'])||0, Number(payload['Sisa_Besar'])||0, 
          Number(payload['Sisa_Melahirkan'])||0, Number(payload['Sisa_CLTN'])||0,
          payload['Pangkat']||'', payload['Alamat']||'', payload['TMT_KGB']||'', payload['TMT_KNP']||'', Number(payload['BUP'])||58
       ];
       
       if (existingMap[nipStr]) {
          sheet.getRange(existingMap[nipStr], 1, 1, 19).setValues([rowData]);
          sheet.getRange(existingMap[nipStr], 1).setNumberFormat('@');
          sheet.getRange(existingMap[nipStr], 26).setValue(jenis); // Set Kolom 26
       } else {
          // Buat data baru dan padding string kosong
          const newRow = [...rowData, "", "", "", "", "", "", jenis];
          sheet.appendRow(newRow);
          sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('@');
       }
    });
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Import/Sinkronisasi excel ke database berhasil diproses.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}