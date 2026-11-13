/**
 * ========================================================
 * KONTROLER DATABASE & CRUD (PKP & PCK)
 * File: setup_pkp.gs
 * ========================================================
 */

function checkAndCreateSheetPKP(sheetName, headers) {
  if (!sheetName || !headers || headers.length === 0) return null;

  var ss = getDB();
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
function submitBulkPKP(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) {
        return { success: false, message: 'Akses Ditolak: Sesi tidak valid.' };
    }
    // TAHAP 83: Pemutusan penulisan baris ke sheet pkp_dokumen & pkp_rencana.
    // Seluruh data dokumen PK tersimpan murni di Cloud Firestore (pkp_documents).
    var currentPkpId = payload.id_pkp || ("PKP-" + new Date().getTime());
    return { success: true, id_pkp: currentPkpId, message: "Seluruh data PK berhasil diproses di Cloud Firestore." };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getDetailPKP(idPkp, userNip, clientToken) {
  try {
    const callerSess = getVerifiedSession_(userNip, clientToken);
    if (!callerSess) {
        return { success: false, message: 'Akses Ditolak: Sesi tidak valid.' };
    }

    var ss = getDB();
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
    if (!hasPkpAccess_(header.nip, header.penilai, header.atasan_pejabat, callerSess)) {
      return { success: false, message: 'Akses Ditolak: Anda tidak memiliki hak akses ke dokumen PKP ini.' };
    }
    
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
function submitBulkPCK(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) {
        return { success: false, message: 'Akses Ditolak: Sesi tidak valid.' };
    }
    // TAHAP 83: Pemutusan penulisan baris ke sheet pck_dokumen & pck_realisasi.
    // Seluruh data laporan PCK tersimpan murni di Cloud Firestore (pck_documents).
    var currentPckId = payload.id_pck || ("PCK-" + new Date().getTime());
    return { success: true, id_pck: currentPckId, message: "Laporan PCK berhasil diproses di Cloud Firestore." };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getDataDokumenPCK(nipPegawai, userRole, clientToken) {
  try {
    const callerSess = getVerifiedSession_(nipPegawai, clientToken);
    if (!callerSess) {
        return [];
    }

    var ss = getDB();
    var sheetPCK = ss.getSheetByName("pck_dokumen");
    var sheetPKP = ss.getSheetByName("pkp_dokumen");
    
    var pckLastRow = sheetPCK.getLastRow();
    if (pckLastRow <= 1) return [];
    
    var pckData = sheetPCK.getRange(2, 1, pckLastRow - 1, sheetPCK.getLastColumn()).getDisplayValues();
    var pkpData = sheetPKP.getDataRange().getDisplayValues();
    
    var bawahanMap = {};
    var atasanMap = {};
    for (var j = 1; j < pkpData.length; j++) {
        var pkpKey = normalizeNipKey_(pkpData[j][1]) + "-" + String(pkpData[j][3]).trim();
        bawahanMap[pkpKey] = pkpData[j][2];
        atasanMap[pkpKey] = pkpData[j][7] || "";
    }
    
    var result = [];
    var isAdmin = isAdminRole_(callerSess.role);
    var cleanNipPegawai = normalizeNipKey_(callerSess.nip);
    
    for (var i = 0; i < pckData.length; i++) {
      var nipPemilik = normalizeNipKey_(pckData[i][1]);
      var tahunDoc = String(pckData[i][3]).trim();
      var nipPenilaiDoc = normalizeNipKey_(bawahanMap[nipPemilik + "-" + tahunDoc] || "");
      var nipAtasanDoc = normalizeNipKey_(atasanMap[nipPemilik + "-" + tahunDoc] || "");
      
      if (isAdmin || nipPemilik === cleanNipPegawai || nipPenilaiDoc === cleanNipPegawai || nipAtasanDoc === cleanNipPegawai) { 
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

function getDetailLengkapPCK(nipPegawai, bulanStr, tahunStr, userNip, clientToken) {
  try {
    const callerSess = getVerifiedSession_(userNip, clientToken);
    if (!callerSess) {
        return { success: false, message: "Akses Ditolak: Sesi tidak valid." };
    }

    var ss = getDB();
    var sheetPK = ss.getSheetByName("pkp_dokumen");
    var docPK = sheetPK.getDataRange().getDisplayValues();
    var idPkpFound = null;
    var targetDoc = null;
    
    var cleanNip = normalizeNipKey_(nipPegawai);
    
    for (var i = 1; i < docPK.length; i++) {
      if (normalizeNipKey_(docPK[i][1]) === cleanNip && String(docPK[i][3]).trim() === String(tahunStr).trim()) {
        idPkpFound = docPK[i][0];
        targetDoc = docPK[i];
        break;
      }
    }
    
    if (targetDoc) {
      if (!hasPkpAccess_(targetDoc[1], targetDoc[2], targetDoc[7], callerSess)) {
        return { success: false, message: "Akses Ditolak: Anda tidak memiliki hak akses ke data PCK pegawai ini." };
      }
    } else if (!isAdminRole_(callerSess.role) && cleanNip !== normalizeNipKey_(callerSess.nip)) {
      return { success: false, message: "Akses Ditolak: Anda tidak memiliki hak akses ke data PCK pegawai ini." };
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

// FIX: Update Logika Step Persetujuan Dokumen
function aksiDokumenPKP(idPKP, aksi, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) {
        return { success: false, message: "Akses Ditolak: Sesi tidak valid." };
    }
    // TAHAP 83: Aksi dokumen PK diproses murni di Cloud Firestore (pkp_documents).
    return { success: true, message: "Aksi PK berhasil diproses di Cloud Firestore." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function aksiDokumenPCK(idPCK, aksi, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) {
        return { success: false, message: "Akses Ditolak: Sesi tidak valid." };
    }
    // TAHAP 83: Aksi dokumen PCK diproses murni di Cloud Firestore (pck_documents).
    return { success: true, message: "Aksi PCK berhasil diproses di Cloud Firestore." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function getDetailPrintPCK(idPCK, userNip, clientToken) {
   try {
    if (!cekOtorisasi(userNip, clientToken)) {
        return { success: false, message: "Akses Ditolak: Sesi tidak valid." };
    }

    var ss = getDB();
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
    
    var result = getDetailLengkapPCK(header.nip, header.bulan, header.tahun, userNip, clientToken);
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