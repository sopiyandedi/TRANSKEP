// =========================================================================
// ZETTBOS BACKEND MODULE: WORK FROM HOME (wfh.gs)
// =========================================================================

function submitRencanaWFH(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    let sheet = ss.getSheetByName('wfh_log');
    
    if(!sheet) {
        sheet = ss.insertSheet('wfh_log');
        sheet.appendRow(['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Rencana_JSON', 'Laporan_JSON', 'Atasan_NIP', 'Status_Rencana', 'Status_Laporan', 'Catatan']);
        sheet.getRange("A1:J1").setFontWeight("bold").setBackground("#b45309").setFontColor("#ffffff");
        sheet.setFrozenRows(1);
    }
    
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const newId = "WFH-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    
    sheet.appendRow([
        newId,
        timestamp,
        payload.nip,
        payload.tanggal,
        payload.rencana_json,
        "", // Laporan JSON kosong di awal
        payload.atasan_nip,
        'Menunggu',
        'Belum Lapor',
        ''
    ]);
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Rencana WFH berhasil diajukan.', data: { id: newId } };
  } catch (err) { 
    return { status: 'error', message: err.toString() }; 
  }
}

function getRencanaWFHById(id) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('wfh_log');
    if (!sheet) throw new Error("Database WFH belum tersedia.");
    
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        return {
          status: 'success',
          data: {
            id: data[i][0], waktu: data[i][1], nip: data[i][2],
            tanggal: data[i][3], rencana_json: data[i][4], laporan_json: data[i][5],
            atasan_nip: data[i][6], status_rencana: data[i][7], status_laporan: data[i][8], catatan: data[i][9]
          }
        };
      }
    }
    throw new Error("Data WFH tidak ditemukan.");
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function submitLaporanWFH(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data WFH tidak ditemukan.");
    
    sheet.getRange(rowIndex, 6).setValue(payload.laporan_json); // Update Laporan_JSON
    sheet.getRange(rowIndex, 9).setValue('Menunggu'); // Update Status_Laporan
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Laporan WFH berhasil dikirim dan menunggu persetujuan.' };
  } catch (err) { 
    return { status: 'error', message: err.toString() }; 
  }
}

function updateWfhStatus(id, stage, decision, notes, userNip, bypassMode = null) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data WFH tidak ditemukan.");
    
    let finalNotes = notes;
    if (bypassMode) finalNotes += "\n*(Disetujui via Bypass Atasan)*";
    
    let oldNotes = String(data[rowIndex-1][9] || "");
    let combinedNotes = oldNotes + "\n[" + stage + "]: " + finalNotes;
    
    if (stage === 'Rencana') {
        sheet.getRange(rowIndex, 8).setValue(decision); 
    } else if (stage === 'Laporan') {
        sheet.getRange(rowIndex, 9).setValue(decision); 
    }
    
    sheet.getRange(rowIndex, 10).setValue(combinedNotes.trim()); 
    
    SpreadsheetApp.flush();
    return { status: 'success', message: `Usulan ${stage} WFH berhasil diproses.` };
  } catch(e) { 
    return { status: 'error', message: e.toString() }; 
  }
}

// ZETTBOT FIX: Fungsi Delete/Tarik Data WFH
function deleteWfhLog(id, forceDelete = false) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { 
        if (!forceDelete && data[i][7] !== 'Menunggu' && data[i][8] !== 'Menunggu') {
            throw new Error("Akses Ditolak: Hanya Rencana/Laporan berstatus Menunggu yang dapat ditarik.");
        }
        rowIndex = i + 1; 
        break; 
      }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan di sistem.");
    
    sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Pengajuan WFH berhasil ditarik dan dihapus.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

// ZETTBOT FIX: Fungsi Soft Edit / Update Rencana WFH
function updateRencanaWfhLog(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('wfh_log');
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
    sheet.getRange(rowIndex, 5).setValue(payload.rencana_json);
    sheet.getRange(rowIndex, 7).setValue(payload.atasan_nip);
    sheet.getRange(rowIndex, 8).setValue('Menunggu'); // Reset Status
    sheet.getRange(rowIndex, 10).setValue(''); // Reset Catatan Atasan
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Rencana WFH berhasil diperbarui.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}