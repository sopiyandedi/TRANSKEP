/**
 * ========================================================
 * BACKEND MODUL PKP (PENILAIAN KINERJA PEGAWAI)
 * File: pkp.gs
 * ========================================================
 */

function generateKodePKP(sheetName, prefix) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return prefix + "-0001";
  
  const lastId = sheet.getRange(lastRow, 1).getDisplayValue();
  const parts = lastId.split("-");
  
  if (parts.length === 2) {
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) {
      const paddedNum = ("0000" + (num + 1)).slice(-4);
      return prefix + "-" + paddedNum;
    }
  }
  return prefix + "-" + new Date().getTime();
}

function getDataDokumenPKP(nipPegawai, userRole) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("pkp_dokumen");
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) return [];
    
    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
    let result = [];
    const isAdmin = (userRole === "Admin" || userRole === "Operator");
    const cleanNipPegawai = String(nipPegawai).replace(/'/g, "").trim();
    
    for (let i = 0; i < data.length; i++) {
      let dbNip = String(data[i][1]).replace(/'/g, "").trim();
      let dbPenilai = String(data[i][2]).replace(/'/g, "").trim();
      // ZETTBOT FIX: Sertakan Atasan Pejabat Penilai di Data Puller agar Frontend bisa memfilter Hak Akses
      let dbAtasan = String(data[i][7] || "").replace(/'/g, "").trim(); 
      
      if (isAdmin || dbNip === cleanNipPegawai || dbPenilai === cleanNipPegawai || dbAtasan === cleanNipPegawai) { 
        result.push({
          id_pkp: data[i][0],
          nip: data[i][1],
          penilai: data[i][2],
          tahun: data[i][3],
          status: data[i][4],
          nilai: data[i][5],
          atasan_pejabat: data[i][7]
        });
      }
    }
    return result;
  } catch (error) {
    return [];
  }
}

function saveDokumenPKPBaru(nipPegawai, nipPenilai, tahun) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("pkp_dokumen");
    const newId = generateKodePKP("pkp_dokumen", "PKP");
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const rowData = [newId, nipPegawai, nipPenilai, tahun, "Draft", "0", timestamp, ""]; 
    
    sheet.appendRow(rowData);
    SpreadsheetApp.flush(); 
    
    return { success: true, id_pkp: newId, message: "Dokumen PKP berhasil dibuat." };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function getItemsPKP(idPKP) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetRencana = ss.getSheetByName("pkp_rencana");
    const sheetEvaluasi = ss.getSheetByName("pkp_evaluasi");
    
    const lastRowRencana = sheetRencana.getLastRow();
    if (lastRowRencana <= 1) return [];
    const dataRencana = sheetRencana.getRange(2, 1, lastRowRencana - 1, sheetRencana.getLastColumn()).getDisplayValues();
    
    let dataEvaluasi = [];
    if(sheetEvaluasi) {
        const lastRowEval = sheetEvaluasi.getLastRow();
        if (lastRowEval > 1) {
            dataEvaluasi = sheetEvaluasi.getRange(2, 1, lastRowEval - 1, sheetEvaluasi.getLastColumn()).getDisplayValues();
        }
    }
    
    let result = [];
    for (let i = 0; i < dataRencana.length; i++) {
      if (dataRencana[i][1] === idPKP) { 
        let idItem = dataRencana[i][0];
        let totalCapaian = 0;
        
        for(let j = 0; j < dataEvaluasi.length; j++) {
            if(dataEvaluasi[j][1] === idItem) { 
                let angka = parseFloat(dataEvaluasi[j][3]) || 0; 
                totalCapaian += angka;
            }
        }
        
        result.push({
          id_item: idItem,
          id_pkp: dataRencana[i][1],
          jenis: dataRencana[i][2],
          sasaran: dataRencana[i][3], 
          indikator: dataRencana[i][4], 
          target: parseFloat(dataRencana[i][5]) || 0, 
          satuan: dataRencana[i][6],
          capaian: totalCapaian
        });
      }
    }
    return result;
  } catch (error) {
    return []; 
  }
}

function saveItemPKP(idPKP, jenis, sasaran, indikator, kuantitas, satuan, mutu, waktu, pagu) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("pkp_rencana");
    const newItemId = generateKodePKP("pkp_rencana", "ITEM");
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    const rowData = [newItemId, idPKP, jenis, sasaran, indikator, kuantitas, satuan, mutu, waktu, pagu, "Aktif", timestamp];
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    
    return { success: true, id_item: newItemId, message: "Target berhasil ditambahkan." };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function saveEvaluasiPKP(idItem, periode, capaianAngka) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("pkp_evaluasi");
    const newItemId = generateKodePKP("pkp_evaluasi", "EVAL");
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    const rowData = [newItemId, idItem, periode, capaianAngka, "", timestamp];
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    
    return { success: true, id_eval: newItemId, message: "Realisasi berhasil dicatat." };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function sahkanDokumenPKP(idPKP, nilaiAkhir) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("pkp_dokumen");
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idPKP)) {
        sheet.getRange(i + 1, 5).setValue("Disetujui");
        sheet.getRange(i + 1, 6).setValue(nilaiAkhir); 
        SpreadsheetApp.flush();
        return { success: true, message: "Dokumen PKP berhasil disahkan." };
      }
    }
    return { success: false, message: "ID Dokumen tidak ditemukan." };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}