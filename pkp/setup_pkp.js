/**
 * ========================================================
 * KONTROLER DATABASE & CRUD (PKP & PCK)
 * File: setup_pkp.gs
 * ========================================================
 */

function getPkpDb() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID")) || SpreadsheetApp.getActiveSpreadsheet();
}

function checkAndCreateSheetPKP(sheetName, headers) {
  if (!sheetName || !headers || headers.length === 0) return null;

  var ss = getPkpDb();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#064e3b").setFontColor("#ffffff");
  } else {
    var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
    if (sheetName === "pkp_rencana" && currentHeaders.length !== headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#064e3b").setFontColor("#ffffff");
    }
  }
  return sheet;
}

function preparePKPDatabase() {
  checkAndCreateSheetPKP("pkp_dokumen", ["ID_PKP", "NIP_Pegawai", "NIP_Penilai", "Tahun", "Status", "Nilai_Akhir", "Timestamp", "NIP_Atasan_Pejabat"]);
  checkAndCreateSheetPKP("pkp_rencana", ["ID_Item", "ID_PKP", "Jenis", "Sasaran_Kegiatan", "Indikator_Kinerja", "Kuantitas", "Satuan", "Mutu", "Waktu", "Pagu_Anggaran", "Status_Item", "Timestamp"]);
  checkAndCreateSheetPKP("pck_dokumen", ["ID_PCK", "NIP_Pegawai", "Bulan", "Tahun", "Total_Rencana", "Progress", "Status", "Nilai_Akhir", "Timestamp"]);
  checkAndCreateSheetPKP("pck_realisasi", ["ID_Realisasi", "ID_PCK", "ID_Item_PK", "Real_Kuantitas", "Real_Mutu", "Capaian", "Timestamp"]);
  checkAndCreateSheetPKP("master_kinerja", ["ID_Tugas", "Jabatan", "Kategori", "Sasaran_Kegiatan", "Indikator_Kinerja", "Satuan_Default", "Mutu_Default", "Waktu_Default"]);
}

/**
 * MENGELOLA SIMPAN PK
 */
function submitBulkPKP(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 
    
    var ss = getPkpDb();
    var sheetDokumen = ss.getSheetByName("pkp_dokumen");
    var sheetRencana = ss.getSheetByName("pkp_rencana");
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    var expectedRencanaHeaders = ["ID_Item", "ID_PKP", "Jenis", "Sasaran_Kegiatan", "Indikator_Kinerja", "Kuantitas", "Satuan", "Mutu", "Waktu", "Pagu_Anggaran", "Status_Item", "Timestamp"];
    var checkHeader = sheetRencana.getRange(1, 1, 1, expectedRencanaHeaders.length).getValues()[0];
    
    if (String(checkHeader[3]).trim() !== "Sasaran_Kegiatan") {
      sheetRencana.getRange(1, 1, 1, expectedRencanaHeaders.length).setValues([expectedRencanaHeaders]);
      sheetRencana.getRange(1, 1, 1, expectedRencanaHeaders.length).setFontWeight("bold").setBackground("#064e3b").setFontColor("#ffffff");
    }
    
    var docData = sheetDokumen.getDataRange().getDisplayValues();
    var currentPkpId = null;
    var docRowIndex = -1;
    
    for (var i = 1; i < docData.length; i++) {
      if (String(docData[i][1]).replace(/'/g, "").trim() === String(payload.nipPegawai).trim() && 
          String(docData[i][3]).trim() === String(payload.tahun).trim()) {
        currentPkpId = docData[i][0];
        docRowIndex = i + 1;
        break;
      }
    }
    
    var finalStatus = payload.status || "Draft";
    
    if (currentPkpId) {
      sheetDokumen.getRange(docRowIndex, 3).setValue(payload.nipPenilai);
      sheetDokumen.getRange(docRowIndex, 8).setValue(payload.nipAtasanPejabat);
      sheetDokumen.getRange(docRowIndex, 5).setValue(finalStatus);
    } else {
      currentPkpId = "PKP-" + new Date().getTime();
      sheetDokumen.appendRow([currentPkpId, payload.nipPegawai, payload.nipPenilai, payload.tahun, finalStatus, "0", timestamp, payload.nipAtasanPejabat]);
    }
    
    var renData = sheetRencana.getDataRange().getDisplayValues();
    var rowsToDelete = [];
    for (var j = renData.length - 1; j >= 1; j--) {
      if (String(renData[j][1]).trim() === String(currentPkpId).trim()) {
        rowsToDelete.push(j + 1);
      }
    }
    rowsToDelete.forEach(function(rowNum) { sheetRencana.deleteRow(rowNum); });
    
    if (payload.items && payload.items.length > 0) {
      var rowsToInsert = [];
      var baseNum = new Date().getTime();
      for (var k = 0; k < payload.items.length; k++) {
        var item = payload.items[k];
        var itemId = "ITEM-" + (baseNum + k);
        rowsToInsert.push([
          itemId, currentPkpId, "Utama", item.sasaran, item.indikator, 
          item.kuantitas, item.satuan, item.mutu, item.waktu, item.pagu, "Aktif", timestamp
        ]);
      }
      if (rowsToInsert.length > 0) {
        sheetRencana.getRange(sheetRencana.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
      }
    }
    
    SpreadsheetApp.flush();
    return { success: true, id_pkp: currentPkpId, message: "Seluruh data PK berhasil disimpan." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock(); 
  }
}

function getDetailPKP(idPkp) {
  try {
    var ss = getPkpDb();
    var sheetDokumen = ss.getSheetByName("pkp_dokumen");
    var docData = sheetDokumen.getDataRange().getDisplayValues();
    var header = null;
    var safeIdPkp = String(idPkp).trim();
    
    for (var i = 1; i < docData.length; i++) {
      if (String(docData[i][0]).trim() === safeIdPkp) {
        header = {
          id_pkp: docData[i][0], nip: docData[i][1], penilai: docData[i][2], 
          tahun: docData[i][3], status: docData[i][4], nilai: docData[i][5],
          atasan_pejabat: docData[i][7]
        };
        break;
      }
    }
    if (!header) throw new Error("Dokumen PKP tidak ditemukan.");
    
    var sheetRencana = ss.getSheetByName("pkp_rencana");
    var renData = sheetRencana.getDataRange().getDisplayValues();
    var items = [];
    
    for (var j = 1; j < renData.length; j++) {
      if (String(renData[j][1]).trim() === safeIdPkp) {
        items.push({
          id_item: renData[j][0], 
          sasaran: renData[j][3], 
          indikator: renData[j][4], 
          kuantitas: renData[j][5], 
          satuan: renData[j][6], 
          mutu: renData[j][7],
          waktu: renData[j][8], 
          pagu: renData[j][9] || "0"
        });
      }
    }
    return { success: true, header: header, items: items };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * MENGELOLA SIMPAN PCK
 */
function submitBulkPCK(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 

    var ss = getPkpDb();
    var sheetDokumen = ss.getSheetByName("pck_dokumen");
    var sheetRealisasi = ss.getSheetByName("pck_realisasi");
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    var docData = sheetDokumen.getDataRange().getDisplayValues();
    var currentPckId = null;
    var docRowIndex = -1;
    
    for (var i = 1; i < docData.length; i++) {
      if (String(docData[i][1]).replace(/'/g, "").trim() === String(payload.nipPegawai).trim() && 
          String(docData[i][2]).trim() === String(payload.bulan).trim() &&
          String(docData[i][3]).trim() === String(payload.tahun).trim()) {
        currentPckId = docData[i][0];
        docRowIndex = i + 1;
        break;
      }
    }
    
    var finalStatus = payload.status || "Draft";
    
    if (currentPckId) {
      sheetDokumen.getRange(docRowIndex, 5).setValue(payload.items.length);
      sheetDokumen.getRange(docRowIndex, 7).setValue(finalStatus);
      sheetDokumen.getRange(docRowIndex, 8).setValue(payload.nilai_akhir);
    } else {
      currentPckId = "PCK-" + new Date().getTime();
      sheetDokumen.appendRow([currentPckId, payload.nipPegawai, payload.bulan, payload.tahun, payload.items.length, "100%", finalStatus, payload.nilai_akhir, timestamp]);
    }
    
    SpreadsheetApp.flush();
    
    var realData = sheetRealisasi.getDataRange().getDisplayValues();
    var rowsToDelete = [];
    for (var j = realData.length - 1; j >= 1; j--) {
      if (String(realData[j][1]).trim() === String(currentPckId).trim()) {
        rowsToDelete.push(j + 1);
      }
    }
    rowsToDelete.forEach(function(rowNum) { sheetRealisasi.deleteRow(rowNum); });
    
    if (payload.items && payload.items.length > 0) {
      var rowsToInsert = [];
      var baseNum = new Date().getTime();
      for (var k = 0; k < payload.items.length; k++) {
        var item = payload.items[k];
        var realId = "RPCK-" + (baseNum + k);
        rowsToInsert.push([
          realId, currentPckId, item.id_item_pk, item.real_kuantitas, item.real_mutu, item.capaian, timestamp
        ]);
      }
      if (rowsToInsert.length > 0) {
        sheetRealisasi.getRange(sheetRealisasi.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
      }
    }
    
    SpreadsheetApp.flush();
    return { success: true, id_pck: currentPckId, message: "Laporan PCK berhasil disimpan." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getDataDokumenPCK(nipPegawai, userRole) {
  try {
    var ss = getPkpDb();
    var sheetPCK = ss.getSheetByName("pck_dokumen");
    var sheetPKP = ss.getSheetByName("pkp_dokumen");
    
    var pckLastRow = sheetPCK.getLastRow();
    if (pckLastRow <= 1) return [];
    
    var pckData = sheetPCK.getRange(2, 1, pckLastRow - 1, sheetPCK.getLastColumn()).getDisplayValues();
    var pkpData = sheetPKP.getDataRange().getDisplayValues();
    
    var bawahanMap = {};
    for (var j = 1; j < pkpData.length; j++) {
        bawahanMap[pkpData[j][1] + "-" + pkpData[j][3]] = pkpData[j][2]; 
    }
    
    var result = [];
    var isAdmin = (userRole === "Admin" || userRole === "Operator");
    var cleanNipPegawai = String(nipPegawai).replace(/'/g, "").trim();
    
    for (var i = 0; i < pckData.length; i++) {
      var nipPemilik = String(pckData[i][1]).replace(/'/g, "").trim();
      var tahunDoc = pckData[i][3];
      var nipPenilaiDoc = String(bawahanMap[nipPemilik + "-" + tahunDoc] || "").replace(/'/g, "").trim();
      
      if (isAdmin || nipPemilik === cleanNipPegawai || nipPenilaiDoc === cleanNipPegawai) { 
        result.push({
          id_pck: pckData[i][0],
          nip: pckData[i][1],
          bulan: pckData[i][2],
          tahun: pckData[i][3],
          rencana: pckData[i][4],
          progress: pckData[i][5],
          status: pckData[i][6],
          nilai_akhir: pckData[i][7]
        });
      }
    }
    return result;
  } catch (e) { return []; }
}

function getDetailLengkapPCK(nipPegawai, bulanStr, tahunStr) {
  try {
    var ss = getPkpDb();
    var sheetPK = ss.getSheetByName("pkp_dokumen");
    var docPK = sheetPK.getDataRange().getDisplayValues();
    var idPkpFound = null;
    
    var cleanNip = String(nipPegawai).replace(/'/g, "").trim();
    
    for (var i = 1; i < docPK.length; i++) {
      if (String(docPK[i][1]).replace(/'/g, "").trim() === cleanNip && String(docPK[i][3]).trim() === String(tahunStr).trim()) {
        idPkpFound = docPK[i][0];
        break;
      }
    }
    
    if (!idPkpFound) return { success: false, message: "Dokumen PK tahun " + tahunStr + " belum dibuat. Buat PK terlebih dahulu." };
    
    var sheetRencana = ss.getSheetByName("pkp_rencana");
    var renData = sheetRencana.getDataRange().getDisplayValues();
    var targets = [];
    
    for (var j = 1; j < renData.length; j++) {
      if (String(renData[j][1]).trim() === String(idPkpFound).trim()) {
        targets.push({ 
          id_item: renData[j][0], 
          sasaran: renData[j][3], 
          indikator: renData[j][4], 
          kuantitas: renData[j][5], 
          satuan: renData[j][6], 
          mutu: renData[j][7] 
        });
      }
    }

    var sheetPCK = ss.getSheetByName("pck_dokumen");
    var docPCK = sheetPCK.getDataRange().getDisplayValues();
    var idPckFound = null;
    
    for (var k = 1; k < docPCK.length; k++) {
      if (String(docPCK[k][1]).replace(/'/g, "").trim() === cleanNip && 
          String(docPCK[k][2]).trim() === String(bulanStr).trim() && 
          String(docPCK[k][3]).trim() === String(tahunStr).trim()) {
        idPckFound = docPCK[k][0];
        break;
      }
    }

    if (idPckFound) {
      var sheetReal = ss.getSheetByName("pck_realisasi");
      var realData = sheetReal.getDataRange().getDisplayValues();
      for (var t = 0; t < targets.length; t++) {
        for (var r = 1; r < realData.length; r++) {
          if (String(realData[r][1]).trim() === String(idPckFound).trim() && String(realData[r][2]).trim() === String(targets[t].id_item).trim()) {
            targets[t].real_kuantitas = realData[r][3];
            targets[t].real_mutu = realData[r][4];
            targets[t].capaian = realData[r][5];
            break;
          }
        }
      }
    }

    return { success: true, targets: targets };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ZETTBOT FIX: Update Logika Step Persetujuan Dokumen
function aksiDokumenPKP(idPKP, aksi) {
  try {
    var sheet = getPkpDb().getSheetByName("pkp_dokumen");
    var data = sheet.getDataRange().getDisplayValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idPKP)) {
        if (aksi === "Hapus") {
            sheet.deleteRow(i + 1);
        }
        else if (aksi === "Kirim") {
            sheet.getRange(i + 1, 5).setValue("Menunggu Penilai");
        }
        else if (aksi === "Setujui") {
            var currStatus = String(data[i][4]).trim();
            if (currStatus === "Menunggu Penilai") {
                sheet.getRange(i + 1, 5).setValue("Menunggu Atasan Penilai");
            } else {
                sheet.getRange(i + 1, 5).setValue("Disetujui");
            }
        }
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
  } catch(e) { return { success: false }; }
}

function aksiDokumenPCK(idPCK, aksi) {
  try {
    var sheet = getPkpDb().getSheetByName("pck_dokumen");
    var data = sheet.getDataRange().getDisplayValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idPCK)) {
        if (aksi === "Hapus") {
            sheet.deleteRow(i + 1);
        }
        else if (aksi === "Kirim") {
            sheet.getRange(i + 1, 7).setValue("Menunggu Penilai");
        }
        else if (aksi === "Setujui") {
            sheet.getRange(i + 1, 7).setValue("Disetujui"); 
        }
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
  } catch(e) { return { success: false }; }
}

function getDetailPrintPCK(idPCK) {
   try {
    var ss = getPkpDb();
    var sheetPCK = ss.getSheetByName("pck_dokumen");
    var docPCK = sheetPCK.getDataRange().getDisplayValues();
    var header = null;
    
    for (var i = 1; i < docPCK.length; i++) {
      if (String(docPCK[i][0]) === String(idPCK)) {
        header = { id_pck: docPCK[i][0], nip: docPCK[i][1], bulan: docPCK[i][2], tahun: docPCK[i][3] };
        break;
      }
    }
    if(!header) throw new Error("Data PCK tidak ditemukan");
    
    var result = getDetailLengkapPCK(header.nip, header.bulan, header.tahun);
    if(!result.success) throw new Error(result.message);
    
    var sheetPK = ss.getSheetByName("pkp_dokumen");
    var docPK = sheetPK.getDataRange().getDisplayValues();
    var penilai_nip = "-";
    for (var k = 1; k < docPK.length; k++) {
      if (String(docPK[k][1]).trim() === String(header.nip).trim() && String(docPK[k][3]).trim() === String(header.tahun).trim()) {
        penilai_nip = docPK[k][2];
        break;
      }
    }

    return { success: true, header: header, items: result.targets, penilai_nip: penilai_nip };
  } catch(e) { return { success: false, message: e.toString() }; }
}