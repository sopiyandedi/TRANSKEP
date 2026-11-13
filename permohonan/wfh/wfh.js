// =========================================================================
// TRANSKEP BACKEND MODULE: WORK FROM HOME (Aman & Terpusat)
// =========================================================================

function submitRencanaWFH(payload, clientToken) {
  try {
    if (!cekOtorisasi(payload.nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheet = ss.getSheetByName('wfh_log');
    
    if(!sheet) {
        sheet = ss.insertSheet('wfh_log');
        sheet.appendRow(['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Rencana_JSON', 'Laporan_JSON', 'Atasan_NIP', 'Status_Rencana', 'Status_Laporan', 'Catatan']);
        sheet.getRange("A1:J1").setFontWeight("bold").setBackground("#b45309").setFontColor("#ffffff");
        sheet.setFrozenRows(1);
    }
    
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const newId = "WFH-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    
    const rowArr = [
        newId, timestamp, payload.nip, payload.tanggal, payload.rencana_json,
        "", payload.atasan_nip, 'Menunggu', 'Belum Lapor', ''
    ];
    sheet.appendRow((typeof sanitizeRowArray === 'function') ? sanitizeRowArray(rowArr) : rowArr);
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Rencana WFH berhasil diajukan.', data: { id: newId } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getRencanaWFHById(id) {
  try {
    const sess = (typeof getActiveSession_ === 'function') ? getActiveSession_() : null;
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('wfh_log');
    if (!sheet) throw new Error("Database WFH belum tersedia.");
    
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : false;

    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const isOwner = norm(data[i][2]) === sess.nip;
        const isAtasan = norm(data[i][6]) === sess.nip;
        if (!isOwner && !isAtasan && !isAdmin) {
          return { status: 'error', message: 'Akses Ditolak: Anda tidak berwenang melihat data WFH ini.' };
        }
        return {
          status: 'success',
          data: {
            id: data[i][0], waktu: data[i][1], nip: data[i][2],
            tanggal: data[i][3], rencana_json: data[i][4], laporan_json: data[i][5],
            atasan_nip: data[i][6], status_rencana: data[i][7], status_laporan: data[i][8], catatan: data[i][9],
            bukti_url: data[i][10] || "" // Mengambil URL Eviden dari Kolom K
          }
        };
      }
    }
    throw new Error("Data WFH tidak ditemukan.");
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function submitLaporanWFH(payload, clientToken) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1; let ownerNip = "";
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; ownerNip = data[i][2]; break; }
    }
    if (rowIndex === -1) throw new Error("Data WFH tidak ditemukan.");
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const cleanOwner = norm(ownerNip);
    const sess = (typeof getActiveSession_ === 'function' && getActiveSession_()) ||
      (typeof getVerifiedSession_ === 'function' ? getVerifiedSession_(cleanOwner, clientToken) : (cekOtorisasi(cleanOwner, clientToken) ? { nip: cleanOwner, role: '' } : null));
    if (!sess) return { status: 'error', message: 'Akses Ditolak.' };
    if (sess.nip !== cleanOwner && !((typeof isAdminRole_ === 'function') && isAdminRole_(sess.role))) {
      return { status: 'error', message: 'Akses Ditolak: Laporan WFH hanya dapat dikirim oleh pemohon bersangkutan.' };
    }

    let finalUrls = [];
    if (payload.existingUrls) {
        try { finalUrls = JSON.parse(payload.existingUrls); } catch(e) {}
    }
    
    if (payload.newFiles && payload.newFiles.length > 0) {
        try {
            const mainFolderName = "Bukti Laporan WFH";
            let mainFolders = DriveApp.getFoldersByName(mainFolderName);
            let mainFolder = mainFolders.hasNext() ? mainFolders.next() : DriveApp.createFolder(mainFolderName);
            
            const subFolderName = payload.nama + " (" + payload.nip + ")";
            let subFolders = mainFolder.getFoldersByName(subFolderName);
            let subFolder = subFolders.hasNext() ? subFolders.next() : mainFolder.createFolder(subFolderName);
            
            for (let i = 0; i < payload.newFiles.length; i++) {
                const f = payload.newFiles[i];
                const cleanMime = f.fileName.split('.').pop();
                const generateName = "Eviden_WFH_" + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd-MM-yyyy') + "_" + new Date().getTime() + "_" + i + "." + cleanMime;
                
                const blob = Utilities.newBlob(Utilities.base64Decode(f.fileData), f.fileMimeType, generateName);
                const file = subFolder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                finalUrls.push(file.getUrl()); 
            }
        } catch(e) { Logger.log("Gagal mengunggah file WFH: " + e.toString()); }
    }

    const finalJsonUrls = JSON.stringify(finalUrls); 
    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);

    sheet.getRange(rowIndex, 6).setValue(sf(payload.laporan_json)); 
    sheet.getRange(rowIndex, 9).setValue('Menunggu'); 
    sheet.getRange(rowIndex, 11).setValue(sf(finalJsonUrls)); 
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Laporan dan Eviden WFH berhasil dikirim.', data: { fileUrl: finalJsonUrls } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateWfhStatus(id, stage, decision, notes, userNip, bypassMode, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    if (['Disetujui', 'Ditolak', 'Perubahan', 'Ditangguhkan'].indexOf(String(decision || '')) === -1) {
      throw new Error("Keputusan persetujuan tidak valid.");
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data WFH tidak ditemukan.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    const isAtasan = (norm(data[rowIndex - 1][6]) !== '' && norm(data[rowIndex - 1][6]) === sess.nip);

    if (bypassMode && !isAdmin) {
      throw new Error("Akses Ditolak: Mode Bypass Atasan hanya untuk Admin/Operator.");
    }
    if (!isAtasan && !isAdmin) {
      throw new Error("Akses Ditolak: Anda bukan atasan/pejabat berwenang untuk berkas WFH ini.");
    }
    
    let finalNotes = String(notes || '');
    if (bypassMode && isAdmin) finalNotes += "\n*(Disetujui via Bypass Atasan)*";
    
    let oldNotes = String(data[rowIndex-1][9] || "");
    let combinedNotes = oldNotes + "\n[" + stage + "]: " + finalNotes;
    
    if (stage === 'Rencana') sheet.getRange(rowIndex, 8).setValue(decision); 
    else if (stage === 'Laporan') sheet.getRange(rowIndex, 9).setValue(decision); 
    
    sheet.getRange(rowIndex, 10).setValue(sf(combinedNotes.trim())); 
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: `Usulan ${stage} WFH berhasil diproses.` };
  } catch(e) { return { status: 'error', message: e.toString() }; }
}

function deleteWfhLog(id, forceDelete, userNip, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { 
        rowIndex = i + 1; break; 
      }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan di sistem.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    const isOwner = (norm(data[rowIndex - 1][2]) === sess.nip);

    if (!isOwner && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang menarik pengajuan WFH milik sendiri.");
    }
    if (forceDelete && !isAdmin) {
      throw new Error("Akses Ditolak: Penghapusan paksa hanya dapat dilakukan oleh Admin/Operator.");
    }
    if (!forceDelete && data[rowIndex - 1][7] !== 'Menunggu' && data[rowIndex - 1][8] !== 'Menunggu') {
      throw new Error("Akses Ditolak: Hanya Rencana/Laporan berstatus Menunggu yang dapat ditarik.");
    }
    
    sheet.deleteRow(rowIndex);
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Pengajuan WFH berhasil ditarik dan dihapus.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateRencanaWfhLog(payload, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(payload && payload.nip, clientToken)
      : (cekOtorisasi(payload && payload.nip, clientToken) ? { nip: normalizeNipKey_(payload.nip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('wfh_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : false;
    if (norm(data[rowIndex - 1][2]) !== sess.nip && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang mengubah Rencana WFH milik sendiri.");
    }
    
    if (data[rowIndex-1][7] !== 'Menunggu' && data[rowIndex-1][7] !== 'Ditolak') {
        throw new Error("Akses Ditolak: Hanya data berstatus Menunggu atau Ditolak yang bisa diubah.");
    }
    
    sheet.getRange(rowIndex, 4).setValue(sf(payload.tanggal));
    sheet.getRange(rowIndex, 5).setValue(sf(payload.rencana_json));
    sheet.getRange(rowIndex, 7).setValue(sf(payload.atasan_nip));
    sheet.getRange(rowIndex, 8).setValue('Menunggu'); 
    sheet.getRange(rowIndex, 10).setValue(''); 
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Rencana WFH berhasil diperbarui.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

/**
 * =======================================================================
 * TAHAP 1: BACKEND GENERATOR - GOOGLE DOCS TO PDF (SERVER-SIDE)
 * =======================================================================
 */

function generatePdfLaporanWFH(id, userNip, clientToken) {
  let tempFile = null; 
  
  function formatTanggalIndo(dateStr) {
      if (!dateStr || dateStr === '-') return '-';
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      let d, m, y;
      
      if (dateStr.includes('-')) { 
          let parts = dateStr.split('-');
          if (parts.length === 3) { y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10); }
      } else if (dateStr.includes('/')) { 
          let parts = dateStr.split('/');
          if (parts.length === 3) { d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10); }
      }
      
      if (d && m && y) {
          let dateObj = new Date(y, m - 1, d);
          let dayName = days[dateObj.getDay()];
          return dayName + ", " + d + " " + months[m - 1] + " " + y;
      }
      return dateStr;
  }

  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak.' };

    const ss = getDB();
    const sheetWfh = ss.getSheetByName('wfh_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    if (!sheetWfh || !sheetUser) throw new Error("Sistem Database belum siap.");

    const dataWfh = sheetWfh.getDataRange().getDisplayValues();
    let logWfh = null;
    for (let i = 1; i < dataWfh.length; i++) {
      if (String(dataWfh[i][0]) === String(id)) { logWfh = dataWfh[i]; break; }
    }
    if (!logWfh) throw new Error("Data Transaksi WFH tidak ditemukan.");
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    if (norm(logWfh[2]) !== sess.nip && norm(logWfh[6]) !== sess.nip && !isAdmin) {
      return { status: 'error', message: 'Akses Ditolak: Anda tidak berwenang mencetak dokumen WFH ini.' };
    }

    const dataUser = readUserSheetDecrypted_(sheetUser);
    let pemohon = { nama: '-', nip: '-', jabatan: '-', unit: 'Pengadilan Agama Indramayu', alamat: 'Tempat Tinggal Pegawai (Domisili)' };
    let atasan = { nama: '-', nip: '-' };
    
    let alamatIndex = -1;
    for (let col = 0; col < dataUser[0].length; col++) {
        if (String(dataUser[0][col]).toLowerCase().includes('alamat')) {
            alamatIndex = col; break;
        }
    }
    
    for (let i = 1; i < dataUser.length; i++) {
       if(String(dataUser[i][0]) === String(logWfh[2])) {
           pemohon.nama = dataUser[i][1]; pemohon.nip = dataUser[i][0]; pemohon.jabatan = dataUser[i][2];
           if (alamatIndex !== -1 && dataUser[i][alamatIndex]) {
               pemohon.alamat = dataUser[i][alamatIndex];
           }
       }
       if(String(dataUser[i][0]) === String(logWfh[6])) {
           atasan.nama = dataUser[i][1]; atasan.nip = dataUser[i][0];
       }
    }

    const TEMPLATE_DOC_ID = '1uswbPWk81qZTJtUSeqAQxbS3jXJgDg5QrcAvDqZ05ts'; 
    const OUTPUT_FOLDER_ID = '1sl7QmtA-sOl02bO20ycxmNPaI83e164J'; 

    let templateFile, outputFolder;
    try { templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID); } catch(e) { throw new Error("ID Template Docs salah."); }
    try { outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID); } catch(e) { throw new Error("ID Folder Output salah."); }
    
    const tempFileName = 'Temp_LapWFH_' + pemohon.nama + '_' + new Date().getTime();
    tempFile = templateFile.makeCopy(tempFileName, outputFolder);
    const doc = DocumentApp.openById(tempFile.getId());
    const body = doc.getBody();

    body.setMarginTop(15 * 2.83465);
    body.setMarginBottom(15 * 2.83465);
    body.setMarginLeft(20 * 2.83465);
    body.setMarginRight(15 * 2.83465);

    body.replaceText('{{wfh_nama}}', pemohon.nama);
    body.replaceText('{{wfh_nip}}', pemohon.nip);
    body.replaceText('{{wfh_jabatan}}', pemohon.jabatan);
    body.replaceText('{{wfh_tempat}}', pemohon.alamat); 
    body.replaceText('{{wfh_tanggal}}', formatTanggalIndo(logWfh[3])); 
    body.replaceText('{{wfh_nama_atasan}}', atasan.nama);
    body.replaceText('{{wfh_nip_atasan}}', atasan.nip);
    body.replaceText('{{wfh_tgl_buat}}', formatTanggalIndo(logWfh[1] ? logWfh[1].split(' ')[0] : '-')); 
    
    const tables = body.getTables();
    let targetTable = null;
    
    for (let t = 0; t < tables.length; t++) {
        let textDalamTabel = tables[t].getText().toLowerCase();
        if (textDalamTabel.includes('realisasi') || textDalamTabel.includes('target pekerjaan')) {
            targetTable = tables[t];
            break;
        }
    }

    if(targetTable && targetTable.getNumRows() > 1) {
        
        // FIX: Mengambil baris kosong di bawah header sebagai cetakan (Row Cloning)
        const templateRow = targetTable.getRow(1);

        let rencanaList = []; try { rencanaList = JSON.parse(logWfh[4] || '[]'); } catch(e){}
        let laporanList = []; try { laporanList = JSON.parse(logWfh[5] || '[]'); } catch(e){}

        rencanaList.forEach((item, idx) => {
            let real = laporanList[idx] ? (laporanList[idx].realisasi || '-') : '-';
            let stat = laporanList[idx] ? (laporanList[idx].status_capaian || '-') : '-';
            let jMul = laporanList[idx] ? (laporanList[idx].jam_mulai || '-') : '-';
            let jSel = laporanList[idx] ? (laporanList[idx].jam_selesai || '-') : '-';
            let jamStr = (jMul !== '-' && jSel !== '-') ? `${jMul} s.d ${jSel}` : '-';

            // Kloning baris cetakan beserta format desain sel-nya (border, rata tengah, dll)
            let newRow = templateRow.copy();
            
            // Isi data ke masing-masing cell hasil kloning menggunakan setText
            newRow.getCell(0).setText((idx + 1).toString());
            newRow.getCell(1).setText(jamStr);
            newRow.getCell(2).setText(item.deskripsi + "\n(Qty Target: " + item.kuantitas + ")");
            newRow.getCell(3).setText(real);
            newRow.getCell(4).setText(stat);

            // TRANSKEP FEATURE: Otomatis beri warna merah dan bold jika status Terkendala
            if (stat === 'Terkendala') {
                try { newRow.getCell(4).getChild(0).asParagraph().editAsText().setBold(true).setForegroundColor('#ef4444'); } catch(e){}
            }

            // Tempelkan baris hasil kloning ke bawah tabel
            targetTable.appendTableRow(newRow);
        });
        
        // Hapus baris cetakan aslinya (baris kosong pertama) agar tidak ikut tercetak
        targetTable.removeRow(1);
    }

    doc.saveAndClose();
    Utilities.sleep(3000); 

    const pdfBlob = tempFile.getAs(MimeType.PDF);
    // 1. Gunakan ID WFH agar nama file statis dan konsisten
    const finalFileName = 'Laporan_WFH_' + pemohon.nama + '_' + id + '.pdf';
    pdfBlob.setName(finalFileName);
    
    // 2. Cari file PDF lama dengan nama yang sama di folder output, lalu hapus (Replace/Overwrite)
    const existingFiles = outputFolder.getFilesByName(finalFileName);
    while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
    }
    
    // 3. Buat file PDF baru
    const finalPdf = outputFolder.createFile(pdfBlob);
    finalPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    if (tempFile) {
        tempFile.setTrashed(true);
        tempFile = null; 
    }

    return { 
      status: 'success', 
      url: finalPdf.getUrl(), 
      message: 'PDF berhasil dibuat dengan margin absolut.' 
    };

  } catch(err) {
    return { status: 'error', message: err.toString() };
  } finally {
    if (tempFile) {
        try { tempFile.setTrashed(true); } catch(e) {}
    }
  }
}

function generatePdfRencanaWFH(id, userNip, clientToken) {
  let tempFile = null; 
  
  function formatTanggalIndo(dateStr) {
      if (!dateStr || dateStr === '-') return '-';
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      let d, m, y;
      
      if (dateStr.includes('-')) { 
          let parts = dateStr.split('-');
          if (parts.length === 3) { y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10); }
      } else if (dateStr.includes('/')) { 
          let parts = dateStr.split('/');
          if (parts.length === 3) { d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10); }
      }
      
      if (d && m && y) {
          let dateObj = new Date(y, m - 1, d);
          let dayName = days[dateObj.getDay()];
          return dayName + ", " + d + " " + months[m - 1] + " " + y;
      }
      return dateStr;
  }

  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak.' };

    const ss = getDB();
    const sheetWfh = ss.getSheetByName('wfh_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    if (!sheetWfh || !sheetUser) throw new Error("Sistem Database belum siap.");

    const dataWfh = sheetWfh.getDataRange().getDisplayValues();
    let logWfh = null;
    for (let i = 1; i < dataWfh.length; i++) {
      if (String(dataWfh[i][0]) === String(id)) { logWfh = dataWfh[i]; break; }
    }
    if (!logWfh) throw new Error("Data Transaksi WFH tidak ditemukan.");
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    if (norm(logWfh[2]) !== sess.nip && norm(logWfh[6]) !== sess.nip && !isAdmin) {
      return { status: 'error', message: 'Akses Ditolak: Anda tidak berwenang mencetak dokumen WFH ini.' };
    }

    const dataUser = readUserSheetDecrypted_(sheetUser);
    let pemohon = { nama: '-', nip: '-', jabatan: '-', unit: 'Pengadilan Agama Indramayu', alamat: 'Tempat Tinggal Pegawai (Domisili)' };
    let atasan = { nama: '-', nip: '-' };
    
    let alamatIndex = -1;
    for (let col = 0; col < dataUser[0].length; col++) {
        if (String(dataUser[0][col]).toLowerCase().includes('alamat')) {
            alamatIndex = col; break;
        }
    }
    
    for (let i = 1; i < dataUser.length; i++) {
       if(String(dataUser[i][0]) === String(logWfh[2])) {
           pemohon.nama = dataUser[i][1]; pemohon.nip = dataUser[i][0]; pemohon.jabatan = dataUser[i][2];
           if (alamatIndex !== -1 && dataUser[i][alamatIndex]) {
               pemohon.alamat = dataUser[i][alamatIndex];
           }
       }
       if(String(dataUser[i][0]) === String(logWfh[6])) {
           atasan.nama = dataUser[i][1]; atasan.nip = dataUser[i][0];
       }
    }

    const TEMPLATE_DOC_ID = '1bZ2m-curDG-PthK8JqqdkRhB2xhZJgt62zz09-dokuc'; 
    const OUTPUT_FOLDER_ID = '1sl7QmtA-sOl02bO20ycxmNPaI83e164J'; 

    let templateFile, outputFolder;
    try { templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID); } catch(e) { throw new Error("ID Template Docs salah."); }
    try { outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID); } catch(e) { throw new Error("ID Folder Output salah."); }
    
    const tempFileName = 'Temp_RencanaWFH_' + pemohon.nama + '_' + id;
    tempFile = templateFile.makeCopy(tempFileName, outputFolder);
    const doc = DocumentApp.openById(tempFile.getId());
    const body = doc.getBody();

    body.setMarginTop(15 * 2.83465);
    body.setMarginBottom(15 * 2.83465);
    body.setMarginLeft(20 * 2.83465);
    body.setMarginRight(15 * 2.83465);

    body.replaceText('{{wfh_nama}}', pemohon.nama);
    body.replaceText('{{wfh_nip}}', pemohon.nip);
    body.replaceText('{{wfh_jabatan}}', pemohon.jabatan);
    body.replaceText('{{wfh_unit}}', 'Pengadilan Agama Indramayu');
    body.replaceText('{{wfh_tempat}}', pemohon.alamat); 
    body.replaceText('{{wfh_tanggal}}', formatTanggalIndo(logWfh[3])); 
    body.replaceText('{{wfh_kendala}}', 'Gangguan jaringan internet / akses VPN Instansi'); 
    body.replaceText('{{wfh_nama_atasan}}', atasan.nama);
    body.replaceText('{{wfh_nip_atasan}}', atasan.nip);
    body.replaceText('{{wfh_tgl_buat}}', formatTanggalIndo(logWfh[1] ? logWfh[1].split(' ')[0] : '-')); 
    
    const tables = body.getTables();
    let targetTable = null;
    
    // 1. CARI TABEL BERDASARKAN NAMA KOLOM TERBARU
    for (let t = 0; t < tables.length; t++) {
        let textDalamTabel = tables[t].getText().toLowerCase();
        // Sesuaikan dengan header template Rencana WFH yang baru diperbaiki
        if (textDalamTabel.includes('uraian target kerja') || textDalamTabel.includes('kuantitas')) {
            targetTable = tables[t];
            break;
        }
    }

    if(targetTable && targetTable.getNumRows() > 1) {
        const templateRow = targetTable.getRow(1);
        let rencanaList = []; try { rencanaList = JSON.parse(logWfh[4] || '[]'); } catch(e){}

        rencanaList.forEach((item, idx) => {
            let newRow = templateRow.copy();
            
            // Sesuai gambar terbaru:
            // Kolom 0: No
            newRow.getCell(0).setText((idx + 1).toString());
            
            // Kolom 1: Uraian Target Kerja
            newRow.getCell(1).setText(item.deskripsi || '-');
            
            // Kolom 2: Output (Dokumen/Produk)
            newRow.getCell(2).setText("Dokumen/Laporan");
            
            // Kolom 3: Target (Kuantitas)
            newRow.getCell(3).setText(item.kuantitas || '-');
            
            targetTable.appendTableRow(newRow);
        });
        
        targetTable.removeRow(1); // Hapus baris template (baris cetakan kosong)
    }

    doc.saveAndClose();
    Utilities.sleep(3000); 

    const pdfBlob = tempFile.getAs(MimeType.PDF);
    const finalFileName = 'Rencana_WFH_' + pemohon.nama + '_' + id + '.pdf';
    pdfBlob.setName(finalFileName);
    
    const existingFiles = outputFolder.getFilesByName(finalFileName);
    while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
    }
    
    const finalPdf = outputFolder.createFile(pdfBlob);
    finalPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    if (tempFile) {
        tempFile.setTrashed(true);
        tempFile = null; 
    }

    return { 
      status: 'success', 
      url: finalPdf.getUrl(), 
      message: 'PDF Rencana WFH berhasil dibuat.' 
    };

  } catch(err) {
    return { status: 'error', message: err.toString() };
  } finally {
    if (tempFile) {
        try { tempFile.setTrashed(true); } catch(e) {}
    }
  }
}


function triggerIzinDocs() {
  DocumentApp.create("File Pancingan Izin TRANSKEP");
}