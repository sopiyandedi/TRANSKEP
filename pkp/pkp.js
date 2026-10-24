/**
 * ========================================================
 * BACKEND MODUL PKP (PENILAIAN KINERJA PEGAWAI)
 * File: pkp.gs
 * ========================================================
 */

function generateKodePKP(sheetName, prefix) {
  const sheet = getDB().getSheetByName(sheetName);
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

function getDataDokumenPKP(nipPegawai, userRole, clientToken) {
  try {
    if (!cekOtorisasi(nipPegawai, clientToken)) return [];

    const sheet = getDB().getSheetByName("pkp_dokumen");
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) return [];
    
    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
    let result = [];
    const isAdmin = (userRole === "Admin" || userRole === "Operator");
    const cleanNipPegawai = String(nipPegawai).replace(/'/g, "").trim();
    
    for (let i = 0; i < data.length; i++) {
      let dbNip = String(data[i][1]).replace(/'/g, "").trim();
      let dbPenilai = String(data[i][2]).replace(/'/g, "").trim();
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
    const sheet = getDB().getSheetByName("pkp_dokumen");
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
    const ss = getDB();
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
    const sheet = getDB().getSheetByName("pkp_rencana");
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
    const sheet = getDB().getSheetByName("pkp_evaluasi");
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
    const sheet = getDB().getSheetByName("pkp_dokumen");
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


/**
 *  GENERATOR PDF PERJANJIAN KINERJA (PK)
 */
function generatePdfPK(idPkp, userNip, clientToken) {
  let tempFile = null; 
  
  try {
    // 1. Cek Otorisasi
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak.' };

    const ss = getDB();
    const sheetDokumen = ss.getSheetByName('pkp_dokumen');
    const sheetRencana = ss.getSheetByName('pkp_rencana');
    const sheetUser = ss.getSheetByName('user_data'); // Untuk ambil detail nama/NIP atasan
    
    if (!sheetDokumen || !sheetRencana || !sheetUser) throw new Error("Sistem Database belum siap.");

    // 2. Tarik Data Header PKP
    const dataDoc = sheetDokumen.getDataRange().getDisplayValues();
    let header = null;
    for (let i = 1; i < dataDoc.length; i++) {
      if (String(dataDoc[i][0]) === String(idPkp)) { 
        header = {
            id_pkp: dataDoc[i][0], nip: dataDoc[i][1], penilai: dataDoc[i][2], 
            tahun: dataDoc[i][3], atasan_pejabat: dataDoc[i][7], timestamp: dataDoc[i][6]
        }; 
        break; 
      }
    }
    if (!header) throw new Error("Data PKP tidak ditemukan.");

    // 3. Tarik Data User (Bawahan, Penilai, Atasan Penilai)
    const dataUser = sheetUser.getDataRange().getDisplayValues();
    let penilai = { nama: '-', nip: header.penilai };
    let atasan = { nama: '-', nip: header.atasan_pejabat };
    let pegawai = { nama: '-', nip: header.nip };

    for (let i = 1; i < dataUser.length; i++) {
       if(String(dataUser[i][0]) === String(header.penilai)) penilai.nama = dataUser[i][1];
       if(String(dataUser[i][0]) === String(header.atasan_pejabat)) atasan.nama = dataUser[i][1];
       if(String(dataUser[i][0]) === String(header.nip)) pegawai.nama = dataUser[i][1];
    }

    // 4. Setup File Template & Folder Output
    const TEMPLATE_DOC_ID = '1VDtFSSz2uptsYsg7NWhngbNEybrkrUJyoAm4Sy4MCqs'; 
    const OUTPUT_FOLDER_ID = '1dpHLuhnsn8Q6OS3mCjyrgyEcnKebnpmG'; 

    let templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
    let outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
    
    const tempFileName = 'Temp_PK_' + pegawai.nama + '_' + new Date().getTime();
    tempFile = templateFile.makeCopy(tempFileName, outputFolder);
    const doc = DocumentApp.openById(tempFile.getId());
    const body = doc.getBody();

    // 5. Replace Variabel Tanda Tangan & Header
    // (Berdasarkan revisi placeholder di Langkah 1)
    body.replaceText('{{nama_atasan}}', atasan.nama);
    body.replaceText('{{nip_atasan}}', atasan.nip);
    body.replaceText('{{nama_penilai}}', penilai.nama);
    body.replaceText('{{nip_penilai}}', penilai.nip);
    
    // Format Tanggal (Misal dari timestamp pembuatan atau set default 2 Januari tahun bersangkutan)
    body.replaceText('{{tgl_cetak}}', '2 Januari ' + header.tahun); 

    // 6. Manipulasi Tabel Kinerja
    const tables = body.getTables();
    if(tables.length > 0) {
        let targetTable = tables[0];
        
        // Ambil baris ke-3 (index 2) sebagai template cetakan data
        const templateRow = targetTable.getRow(2);
        
        // Ambil Data Item Rencana
        const renData = sheetRencana.getDataRange().getDisplayValues();
        let items = [];
        for (let j = 1; j < renData.length; j++) {
            if (String(renData[j][1]) === String(idPkp)) {
                items.push({
                    sasaran: renData[j][3], indikator: renData[j][4], kuantitas: renData[j][5], 
                    satuan: renData[j][6], mutu: renData[j][7], waktu: renData[j][8], pagu: renData[j][9]
                });
            }
        }

        // Grouping berdasarkan Sasaran
        let groupSasaran = {};
        items.forEach(item => {
            if(!groupSasaran[item.sasaran]) groupSasaran[item.sasaran] = [];
            groupSasaran[item.sasaran].push(item);
        });

        let numSasaran = 1;
        for (let key in groupSasaran) {
            let arr = groupSasaran[key];
            arr.forEach((kg, idx) => {
                let newRow = templateRow.copy();
                
                // Trik Google Docs: RowSpan tidak didukung native API, jadi teks sasaran dikosongkan di baris ke-2 dst
                newRow.getCell(0).setText(idx === 0 ? numSasaran.toString() : ""); // No Sasaran
                newRow.getCell(1).setText(idx === 0 ? key : ""); // Teks Sasaran
                
                newRow.getCell(2).setText((idx + 1).toString()); // No Indikator
                newRow.getCell(3).setText(kg.indikator); // Teks Indikator
                newRow.getCell(4).setText(kg.mutu); // Target Mutu
                newRow.getCell(5).setText(kg.kuantitas); // Target Kuant
                newRow.getCell(6).setText(kg.satuan); // Satuan

                // Checklist Waktu Penyelesaian (Kolom 7 sampai 18 / Jan - Des)
                let wktArr = kg.waktu ? kg.waktu.split(",") : [];
                for(let bln = 1; bln <= 12; bln++) {
                    let cek = wktArr.includes(String(bln)) ? "√" : "";
                    // Col index 6 + bln (Jan=7, Feb=8, dst)
                    newRow.getCell(6 + bln).setText(cek);
                    // Rata tengah checklist
                    try { newRow.getCell(6 + bln).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
                }

                // Kolom 19: Pagu Anggaran
                let paguFmt = "-";
                if (kg.pagu && kg.pagu !== "0") {
                    let paguNum = parseInt(kg.pagu);
                    if(!isNaN(paguNum)) paguFmt = paguNum.toLocaleString('id-ID');
                }
                newRow.getCell(19).setText(paguFmt);
                try { newRow.getCell(19).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT); } catch(e){}

                targetTable.appendTableRow(newRow);
            });
            numSasaran++;
        }
        
        // Hapus baris cetakan (kosong) agar tidak ikut tercetak
        targetTable.removeRow(2);
    }

    doc.saveAndClose();
    Utilities.sleep(3000); // Beri waktu Google merender dokumen

    // 7. Konversi ke PDF
    const pdfBlob = tempFile.getAs(MimeType.PDF);
    const finalFileName = 'PK_' + pegawai.nama + '_' + header.tahun + '.pdf';
    pdfBlob.setName(finalFileName);
    
    // Hapus file lama jika ada yang namanya sama
    const existingFiles = outputFolder.getFilesByName(finalFileName);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
    
    const finalPdf = outputFolder.createFile(pdfBlob);
    finalPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Bersihkan file Google Doc sementara
    if (tempFile) { tempFile.setTrashed(true); tempFile = null; }

    return { 
      status: 'success', 
      url: finalPdf.getUrl(), 
      message: 'PDF Perjanjian Kinerja berhasil dibuat.' 
    };

  } catch(err) {
    return { status: 'error', message: err.toString() };
  } finally {
    if (tempFile) { try { tempFile.setTrashed(true); } catch(e) {} }
  }
}

/**
 * TRANSKEP: GENERATOR PDF PCK BULANAN (REVISI MULTI-TABEL + SUBTOTAL)
 */
function generatePdfPCK(idPck, userNip, clientToken) {
  let tempFile = null;
  
  try {
    // 1. Cek Otorisasi
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak.' };

    const ss = getDB();
    const sheetPck = ss.getSheetByName('pck_dokumen');
    const sheetPkp = ss.getSheetByName('pkp_dokumen');
    const sheetUser = ss.getSheetByName('user_data');

    // 2. Ambil Header PCK
    const dataPck = sheetPck.getDataRange().getDisplayValues();
    let pckHeader = null;
    for (let i = 1; i < dataPck.length; i++) {
      if (String(dataPck[i][0]) === String(idPck)) {
        pckHeader = { id_pck: dataPck[i][0], nip: dataPck[i][1], bulan: dataPck[i][2], tahun: dataPck[i][3] };
        break;
      }
    }
    if (!pckHeader) throw new Error("Data Laporan PCK tidak ditemukan.");

    // 3. Ambil NIP Penilai dari dokumen PKP di tahun yang sama
    const dataPkp = sheetPkp.getDataRange().getDisplayValues();
    let nipPenilai = "-";
    for (let i = 1; i < dataPkp.length; i++) {
      if (String(dataPkp[i][1]) === String(pckHeader.nip) && String(dataPkp[i][3]) === String(pckHeader.tahun)) {
        nipPenilai = dataPkp[i][2];
        break;
      }
    }

    // 4. Ambil Identitas Lengkap (Pencarian Kolom Dinamis)
    const dataUser = sheetUser.getDataRange().getDisplayValues();
    let pegawai = { nama: '-', nip: pckHeader.nip, pangkat: '-', jabatan: '-' };
    let penilai = { nama: '-', nip: nipPenilai };

    let headerUser = dataUser[0];
    let idxPangkat = -1, idxJabatan = -1;
    
    for(let c = 0; c < headerUser.length; c++) {
        let colName = String(headerUser[c]).toLowerCase();
        if(colName.includes('pangkat') || colName.includes('gol')) idxPangkat = c;
        if(colName.includes('jabatan')) idxJabatan = c;
    }

    for (let i = 1; i < dataUser.length; i++) {
      if (String(dataUser[i][0]) === String(pckHeader.nip)) {
        pegawai.nama = dataUser[i][1];
        pegawai.jabatan = (idxJabatan !== -1) ? dataUser[i][idxJabatan] : dataUser[i][2];
        pegawai.pangkat = (idxPangkat !== -1) ? dataUser[i][idxPangkat] : "-";
      }
      if (String(dataUser[i][0]) === String(nipPenilai)) {
        penilai.nama = dataUser[i][1];
      }
    }

    // 5. Tarik Rincian Target & Realisasi
    let resItems = getDetailLengkapPCK(pckHeader.nip, pckHeader.bulan, pckHeader.tahun, userNip, clientToken);
    if (!resItems.success) throw new Error(resItems.message);
    let items = resItems.targets;

    // 6. Setup File Template & Folder Output
    const TEMPLATE_DOC_ID = '1NMWpygpuwKkeZtrFwiNr1bpCoghDBpHFYAw-6W1dcCk';
    const OUTPUT_FOLDER_ID = '1wVS9MVbOiATy7u9iap7aWLE_za4K-wNg';

    let templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
    let outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
    
    const tempFileName = 'Temp_PCK_' + pckHeader.bulan + '_' + pckHeader.tahun + '_' + pegawai.nama;
    tempFile = templateFile.makeCopy(tempFileName, outputFolder);
    const doc = DocumentApp.openById(tempFile.getId());
    const body = doc.getBody();

    // 7. Replace Variabel Teks Standar
    body.replaceText('{{bulan}}', pckHeader.bulan.toUpperCase() + ' ' + pckHeader.tahun);
    body.replaceText('{{nama}}', pegawai.nama);
    body.replaceText('{{nip}}', pegawai.nip);
    body.replaceText('{{pangkat}}', pegawai.pangkat);
    
    body.replaceText('{{jabatan}}', pegawai.jabatan);
    body.replaceText('{{Jabatan}}', pegawai.jabatan); 
    
    body.replaceText('{{nama_penilai}}', penilai.nama);
    body.replaceText('{{nip_penilai}}', penilai.nip);
    
    let tglCetak = "2 " + pckHeader.bulan + " " + pckHeader.tahun; 
    body.replaceText('{{tgl_cetak}}', tglCetak);

    // 8. Proses Injeksi Multi-Tabel
    const tables = body.getTables();
    if (tables.length >= 3) {
        let detailTable = tables[1]; // Tabel Rincian template
        let rekapTable = tables[2];  // Tabel Rekap template

        let detTemplateRow = detailTable.getRow(2); // Baris 3: Isian Data

        // TRANSKEP: Tangkap Baris Subtotal
        let detSubtotalRow = null;
        if (detailTable.getNumRows() >= 4) {
            detSubtotalRow = detailTable.getRow(3);
        }

        // FIX: Logika Tabel Rekap Baru
        // Copy baris cetakan data (Baris 2) ke memori
        let rekTemplateRow = rekapTable.getRow(1).copy(); 
        
        // Hapus baris cetakan data dari dokumen agar tersisa Header (Baris 1) dan Total (Baris 3)
        if (rekapTable.getNumRows() >= 3) {
            rekapTable.removeRow(1); 
        }

        // Bikin copy murni dari tabel header detail untuk di-clone berkali-kali
        let clonedHeaderTable = detailTable.copy();
        if (clonedHeaderTable.getNumRows() >= 4) clonedHeaderTable.removeRow(3);
        if (clonedHeaderTable.getNumRows() >= 3) clonedHeaderTable.removeRow(2);

        let tableIndex = body.getChildIndex(detailTable);

        // Bersihkan tag Indikator sisa jika ada
        let prevElement = detailTable.getPreviousSibling();
        if (prevElement && prevElement.getType() === DocumentApp.ElementType.PARAGRAPH) {
            if (prevElement.getText().includes('Indikator Kinerja')) {
                body.removeChild(prevElement);
                tableIndex--; 
            }
        }

        // Grouping berdasarkan Sasaran Utama
        let groupSasaran = {};
        items.forEach(item => {
            if(!groupSasaran[item.sasaran]) groupSasaran[item.sasaran] = [];
            groupSasaran[item.sasaran].push(item);
        });

        let numRekap = 1;
        let totalCapAvg = 0;
        let totalHitungAvg = 0;
        let groupCount = 0;
        let currentIndex = tableIndex; 

        for (let key in groupSasaran) {
            // A. Judul Tabel
            let abjad = String.fromCharCode(65 + groupCount);
            let p = body.insertParagraph(currentIndex++, abjad + ". Indikator Kinerja\t: " + key);
            p.setBold(true);

            // B. Clone Tabel Detail
            let currentTable = body.insertTable(currentIndex++, clonedHeaderTable.copy());

            let arr = groupSasaran[key];
            let groupHitungTotal = 0;
            let groupCapTotal = 0;

            // C. Loop Isi Kegiatan
            arr.forEach((kg, idx) => {
                let newRow = detTemplateRow.copy();
                let hitung = parseFloat(kg.mutu) + parseFloat(kg.real_mutu || 0);
                let capaian = parseFloat(kg.capaian || 0);

                groupHitungTotal += hitung;
                groupCapTotal += capaian;

                newRow.getCell(0).setText((idx + 1).toString());
                newRow.getCell(1).setText(kg.indikator);
                newRow.getCell(2).setText("0"); // AK Target
                newRow.getCell(3).setText(kg.kuantitas.toString());
                newRow.getCell(4).setText(kg.satuan);
                newRow.getCell(5).setText(kg.mutu.toString());
                newRow.getCell(6).setText("0"); // AK Realisasi
                newRow.getCell(7).setText((kg.real_kuantitas || 0).toString());
                newRow.getCell(8).setText(kg.satuan);
                newRow.getCell(9).setText((kg.real_mutu || 0).toString());
                newRow.getCell(10).setText(hitung.toString());
                newRow.getCell(11).setText(capaian.toFixed(2));

                [0,2,3,5,6,7,9,10,11].forEach(col => {
                    try { newRow.getCell(col).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
                });

                currentTable.appendTableRow(newRow);
            });

            let avgHitung = groupHitungTotal / arr.length;
            let avgCap = groupCapTotal / arr.length;
            totalHitungAvg += avgHitung;
            totalCapAvg += avgCap;
            groupCount++;

            // D. Baris Subtotal Detail
            if (detSubtotalRow) {
                let subRow = detSubtotalRow.copy();
                let subCellCount = subRow.getNumCells();
                
                if (subCellCount >= 2) {
                    subRow.getCell(subCellCount - 2).setText(avgHitung.toFixed(2)).setBold(true);
                    subRow.getCell(subCellCount - 1).setText(avgCap.toFixed(2)).setBold(true);
                    
                    try { subRow.getCell(subCellCount - 2).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
                    try { subRow.getCell(subCellCount - 1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
                }
                currentTable.appendTableRow(subRow);
            }

            body.insertParagraph(currentIndex++, "");

            // E. Sisipkan baris data ke Tabel Rekapitulasi (SEBELUM baris terakhir)
            let rekRow = rekTemplateRow.copy();
            rekRow.getCell(0).setText(numRekap.toString());
            rekRow.getCell(1).setText(key);
            rekRow.getCell(2).setText(avgHitung.toFixed(2));
            rekRow.getCell(3).setText(avgCap.toFixed(2));
            
            try { rekRow.getCell(0).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
            try { rekRow.getCell(2).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
            try { rekRow.getCell(3).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
            
            // Insert tepat di atas baris "Hasil Capaian..."
            rekapTable.insertTableRow(rekapTable.getNumRows() - 1, rekRow);
            numRekap++;
        }

        // Hapus tabel template awal
        body.removeChild(detailTable);

        // F. TOTAL AKHIR DI TABEL REKAP (Tembak langsung ke baris terakhir template)
        let finalAvgHitung = groupCount > 0 ? (totalHitungAvg / groupCount) : 0;
        let finalAvgCap = groupCount > 0 ? (totalCapAvg / groupCount) : 0;
        
        let predikatStr = "(Kurang)";
        if (finalAvgCap >= 91) predikatStr = "(Sangat Baik)";
        else if (finalAvgCap >= 76) predikatStr = "(Baik)";
        else if (finalAvgCap >= 61) predikatStr = "(Cukup)";
        else if (finalAvgCap >= 51) predikatStr = "(Kurang)";
        else if (finalAvgCap <= 50) predikatStr = "(Buruk)";

        // Ambil baris paling akhir dari tabel rekap
        let finalRekRow = rekapTable.getRow(rekapTable.getNumRows() - 1);
        let finalCellsCount = finalRekRow.getNumCells();

        // Tembak angka ke 2 sel paling kanan
        if (finalCellsCount >= 2) {
            finalRekRow.getCell(finalCellsCount - 2).setText(finalAvgHitung.toFixed(2)).setBold(true);
            finalRekRow.getCell(finalCellsCount - 1).setText(finalAvgCap.toFixed(2) + "\n" + predikatStr).setBold(true);
            
            try { finalRekRow.getCell(finalCellsCount - 2).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
            try { finalRekRow.getCell(finalCellsCount - 1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER); } catch(e){}
        }
    }

    doc.saveAndClose();
    Utilities.sleep(3000);

    // 9. Konversi ke PDF
    const pdfBlob = tempFile.getAs(MimeType.PDF);
    const finalFileName = 'PCK_' + pckHeader.bulan + '_' + pckHeader.tahun + '_' + pegawai.nama + '.pdf';
    pdfBlob.setName(finalFileName);
    
    const existingFiles = outputFolder.getFilesByName(finalFileName);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
    
    const finalPdf = outputFolder.createFile(pdfBlob);
    finalPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    if (tempFile) { tempFile.setTrashed(true); tempFile = null; }

    return { status: 'success', url: finalPdf.getUrl(), message: 'PDF PCK berhasil dibuat.' };
    
  } catch(err) {
    return { status: 'error', message: err.toString() };
  } finally {
    if (tempFile) { try { tempFile.setTrashed(true); } catch(e) {} }
  }
}