// =========================================================================
// TRANSKEP BACKEND MODULE: IZIN PRIBADI (FIXED COLUMN ORDER)
// =========================================================================

function submitIzinPribadi(payload, clientToken) {
  try {
    if (!cekOtorisasi(payload.nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheetIP = ss.getSheetByName('izin_pribadi_log');
    
    if(!sheetIP) {
        sheetIP = ss.insertSheet('izin_pribadi_log');
        // PERBAIKAN: Pejabat_NIP digeser ke paling akhir agar tidak merusak urutan Status
        const headers = ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Alamat', 'Alasan', 'Atasan_NIP', 'Status', 'Catatan_Atasan', 'Pejabat_NIP'];
        sheetIP.appendRow(headers);
        sheetIP.getRange("A1:J1").setFontWeight("bold").setBackground("#064e3b").setFontColor("#ffffff");
        sheetIP.setFrozenRows(1);
    }
    
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const newId = "IP-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    
    // PERBAIKAN: Urutan array disesuaikan dengan header baru
    sheetIP.appendRow([
        newId, timestamp, payload.nip, payload.tanggal, payload.alamat,
        payload.alasan, payload.atasan_nip, 'Menunggu', '', payload.pejabat_nip
    ]);
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Pribadi berhasil diajukan dan sedang menunggu persetujuan.', data: { id: newId } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getIzinPribadiById(id) {
  try {
    const ss = getDB();
    const sheetIP = ss.getSheetByName('izin_pribadi_log');
    if (!sheetIP) throw new Error("Data Izin Pribadi belum tersedia.");
    
    const data = sheetIP.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        return {
          status: 'success',
          data: {
            id: data[i][0], waktu: data[i][1], nip: data[i][2],
            tanggal: data[i][3], alamat: data[i][4], alasan: data[i][5],
            atasan_nip: data[i][6], status: data[i][7], catatan: data[i][8], pejabat_nip: data[i][9]
          }
        };
      }
    }
    throw new Error("Data Izin Pribadi tidak ditemukan.");
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateIpStatus(id, decision, notes, userNip, bypassMode, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_pribadi_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data Izin Pribadi tidak ditemukan di sistem.");
    
    let finalNotes = notes;
    if (bypassMode) finalNotes += "\n\n*(Disetujui via Bypass Atasan)*";
    
    // Status tetap di Kolom 8 (H) dan Catatan di Kolom 9 (I)
    sheet.getRange(rowIndex, 8).setValue(decision); 
    sheet.getRange(rowIndex, 9).setValue(finalNotes); 
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Usulan Izin Pribadi berhasil diproses.' };
  } catch(e) { return { status: 'error', message: e.toString() }; }
}

function deleteIzinPribadiLog(id, forceDelete, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_pribadi_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { 
        if (!forceDelete && data[i][7] !== 'Menunggu') throw new Error("Akses Ditolak: Hanya usulan berstatus Menunggu yang dapat ditarik/dihapus.");
        rowIndex = i + 1; 
        break; 
      }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan di sistem.");
    
    sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Pengajuan Izin Pribadi berhasil ditarik dan dihapus.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateIzinPribadiLog(payload, clientToken) {
  try {
    if (!cekOtorisasi(payload.nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_pribadi_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan.");
    
    if (data[rowIndex-1][7] !== 'Menunggu' && data[rowIndex-1][7] !== 'Ditolak') {
        throw new Error("Akses Ditolak: Hanya data berstatus Menunggu atau Ditolak yang bisa diubah.");
    }
    
    sheet.getRange(rowIndex, 4).setValue(payload.tanggal);
    sheet.getRange(rowIndex, 5).setValue(payload.alamat);
    sheet.getRange(rowIndex, 6).setValue(payload.alasan);
    sheet.getRange(rowIndex, 7).setValue(payload.atasan_nip);
    sheet.getRange(rowIndex, 8).setValue('Menunggu'); 
    sheet.getRange(rowIndex, 9).setValue(''); 
    sheet.getRange(rowIndex, 10).setValue(payload.pejabat_nip); // Kolom J 
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Pribadi berhasil diperbarui.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}