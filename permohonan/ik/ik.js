// =========================================================================
// ZETTBOS BACKEND MODULE: IZIN KELUAR (ik.gs / js.gs)
// Fungsi backend murni untuk Modul Izin Keluar Kantor.
// =========================================================================

function submitIzinKeluar(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    let sheetIK = ss.getSheetByName('izin_keluar_log');
    
    // ZettBOT Feature: Lazy-Initialization (Auto-Create database sheet)
    if(!sheetIK) {
        sheetIK = ss.insertSheet('izin_keluar_log');
        const headers = ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Jam_Keluar', 'Jam_Kembali', 'Keperluan', 'Atasan_NIP', 'Status', 'Catatan_Atasan'];
        sheetIK.appendRow(headers);
        sheetIK.getRange("A1:J1").setFontWeight("bold").setBackground("#0ea5e9").setFontColor("#ffffff"); // Warna header Biru Langit
        sheetIK.setFrozenRows(1);
    }
    
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const newId = "IK-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    
    sheetIK.appendRow([
        newId,
        timestamp,
        payload.nip,
        payload.tanggal,
        payload.jam_keluar,
        payload.jam_kembali,
        payload.alasan,
        payload.atasan_nip,
        'Menunggu',
        ''
    ]);
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Keluar berhasil diajukan dan sedang menunggu persetujuan Atasan.', data: { id: newId } };
    
  } catch (err) { 
    return { status: 'error', message: err.toString() }; 
  }
}

function getIzinKeluarById(id) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheetIK = ss.getSheetByName('izin_keluar_log');
    if (!sheetIK) throw new Error("Data Izin Keluar belum tersedia.");
    
    const data = sheetIK.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        return {
          status: 'success',
          data: {
            id: data[i][0],
            waktu: data[i][1],
            nip: data[i][2],
            tanggal: data[i][3],
            jam_keluar: data[i][4],
            jam_kembali: data[i][5],
            alasan: data[i][6],
            atasan_nip: data[i][7],
            status: data[i][8],
            catatan: data[i][9]
          }
        };
      }
    }
    throw new Error("Data Izin Keluar tidak ditemukan.");
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function updateIkStatus(id, decision, notes, userNip, bypassMode = null) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('izin_keluar_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data Izin Keluar tidak ditemukan di sistem.");
    
    let finalNotes = notes;
    if (bypassMode) finalNotes += "\n\n*(Disetujui via Bypass Atasan)*";
    
    sheet.getRange(rowIndex, 9).setValue(decision); // Set Kolom Status (I)
    sheet.getRange(rowIndex, 10).setValue(finalNotes); // Set Kolom Catatan (J)
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Usulan Izin Keluar berhasil diproses.' };
  } catch(e) { 
    return { status: 'error', message: e.toString() }; 
  }
}

// ZETTBOT FIX: Fungsi Delete/Tarik Data Izin Keluar Kantor
function deleteIzinKeluarLog(id, forceDelete = false) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('izin_keluar_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { 
        if (!forceDelete && data[i][8] !== 'Menunggu') throw new Error("Akses Ditolak: Hanya usulan berstatus Menunggu yang dapat ditarik/dihapus.");
        rowIndex = i + 1; 
        break; 
      }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan di sistem.");
    
    sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Pengajuan Izin Keluar berhasil ditarik dan dihapus.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

// ZETTBOT FIX: Fungsi Soft Edit / Update Data IK
function updateIzinKeluarLog(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('izin_keluar_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan.");
    
    // Cek Keamanan
    if (data[rowIndex-1][8] !== 'Menunggu' && data[rowIndex-1][8] !== 'Ditolak') {
        throw new Error("Akses Ditolak: Hanya data berstatus Menunggu atau Ditolak yang bisa diubah.");
    }
    
    sheet.getRange(rowIndex, 4).setValue(payload.tanggal);
    sheet.getRange(rowIndex, 5).setValue(payload.jam_keluar);
    sheet.getRange(rowIndex, 6).setValue(payload.jam_kembali);
    sheet.getRange(rowIndex, 7).setValue(payload.alasan);
    sheet.getRange(rowIndex, 8).setValue(payload.atasan_nip);
    sheet.getRange(rowIndex, 9).setValue('Menunggu'); // Reset Status
    sheet.getRange(rowIndex, 10).setValue(''); // Reset Catatan
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Keluar berhasil diperbarui.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}