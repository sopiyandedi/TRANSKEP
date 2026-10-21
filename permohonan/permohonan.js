// ==========================================
// FILE: permohonan.gs
// Deskripsi: Backend Controller untuk Cuti & Dinas Luar (Aman & Terpusat)
// ==========================================

function addCutiLog(payload, aktorNip, clientToken) {
  try {
    // Validasi token sekarang mencocokkan aktorNip (Admin), bukan payload.nip (Target)
    if (!cekOtorisasi(aktorNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheetCuti = ss.getSheetByName('cuti_log');
    if(!sheetCuti) sheetCuti = ss.insertSheet('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    let fileUrl = "";
    if (payload.fileData && payload.fileName && payload.fileMimeType) {
        try {
            const folderName = "Bukti Cuti TRANSKEP";
            let folders = DriveApp.getFoldersByName(folderName);
            let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
            
            const cleanMime = payload.fileName.split('.').pop();
            const generateName = "Bukti_" + payload.jenis + "_" + payload.nip + "_" + new Date().getTime() + "." + cleanMime;
            
            const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileData), payload.fileMimeType, generateName);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            fileUrl = file.getUrl();
        } catch(e) { Logger.log("Gagal mengunggah file bukti: " + e.toString()); }
    }

    let d1 = new Date(payload.tgl_mulai); let d2 = new Date(payload.tgl_selesai);
    let durasi = 0;
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) durasi++;
    }

    const uData = sheetUser.getDataRange().getDisplayValues(); 
    let rowIndex = -1; let namaPegawaiPemohon = "";
    
    for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(payload.nip)) { rowIndex = i + 1; namaPegawaiPemohon = uData[i][1]; break; }
    }
    if (rowIndex === -1) throw new Error("Pegawai tidak ditemukan.");

    let historyJson = { y24:0, y25:0, y26:0, dur: durasi };
    
    // Potong saldo
    if (payload.jenis !== 'Dinas Luar' && payload.jenis !== 'CLTN') {
        if (payload.jenis === 'Tahunan') {
            let s24 = Number(uData[rowIndex - 1][6]), s25 = Number(uData[rowIndex - 1][7]), s26 = Number(uData[rowIndex - 1][8]);
            let sisaPotong = durasi;
            
            if (s24 >= sisaPotong) { historyJson.y24 = sisaPotong; sheetUser.getRange(rowIndex, 7).setValue(s24 - sisaPotong); sisaPotong = 0; } 
            else { historyJson.y24 = s24; sisaPotong -= s24; sheetUser.getRange(rowIndex, 7).setValue(0); }
            
            if (sisaPotong > 0) {
                if (s25 >= sisaPotong) { historyJson.y25 = sisaPotong; sheetUser.getRange(rowIndex, 8).setValue(s25 - sisaPotong); sisaPotong = 0; } 
                else { historyJson.y25 = s25; sisaPotong -= s25; sheetUser.getRange(rowIndex, 8).setValue(0); }
            }
            if (sisaPotong > 0) {
                if (s26 >= sisaPotong) { historyJson.y26 = sisaPotong; sheetUser.getRange(rowIndex, 9).setValue(s26 - sisaPotong); } 
                else { throw new Error("Saldo cuti tahunan tidak mencukupi."); }
            }
        } else {
            const mapCol = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13 };
            const col = mapCol[payload.jenis];
            if (col) {
                let sCuti = Number(uData[rowIndex - 1][col - 1]);
                if (sCuti < durasi) throw new Error(`Saldo cuti ${payload.jenis} Anda tidak mencukupi.`);
                sheetUser.getRange(rowIndex, col).setValue(sCuti - durasi);
            }
        }
    }

    const uniquePrefix = payload.jenis === 'Dinas Luar' ? "DL-" : "CUTI-";
    const newId = uniquePrefix + new Date().getTime() + Math.floor(Math.random() * 1000);
    const tglForm = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');
    
    const statusAwal = payload.jenis === 'Dinas Luar' ? 'Disetujui' : 'Menunggu';
    
    const magicToken = Utilities.getUuid();
    sheetCuti.appendRow(sanitizeRowArray([
      newId, tglForm, payload.nip, payload.jenis, payload.tgl_mulai, payload.tgl_selesai, payload.alasan,
      statusAwal, '', payload.atasan_nip || '-', payload.pejabat_nip || '-', durasi, payload.plh_nip || '', statusAwal, statusAwal, payload.alamat || '-', JSON.stringify(historyJson), fileUrl, magicToken
    ]));
    
    SpreadsheetApp.flush(); 

    // Notifikasi WhatsApp Magic Link ke Atasan Langsung (Non-blocking)
    if (payload.jenis !== 'Dinas Luar' && payload.atasan_nip && payload.atasan_nip !== '-') {
      try {
        let atasanPhone = "";
        let namaAtasan = "";
        for (let u = 1; u < uData.length; u++) {
          if (String(uData[u][0]) === String(payload.atasan_nip)) {
            namaAtasan = uData[u][1];
            atasanPhone = String(uData[u][4] || '');
            break;
          }
        }
        
        if (atasanPhone && atasanPhone.length > 8) {
          const magicLink = "https://transkep.github.io/?action=review_cuti&token=" + magicToken;
          const msgWa = "*TRANSKEP - USULAN CUTI PEGAWAI* 📋\n\n" +
            "Yth. Bapak/Ibu *" + namaAtasan + "* (Atasan Langsung),\n\n" +
            "Terdapat pengajuan cuti baru yang membutuhkan persetujuan Anda:\n\n" +
            "👤 *Pemohon:* " + namaPegawaiPemohon + "\n" +
            "🆔 *NIP:* " + payload.nip + "\n" +
            "🏷️ *Jenis:* Cuti " + payload.jenis + "\n" +
            "📅 *Periode:* " + payload.tgl_mulai + " s.d " + payload.tgl_selesai + " (" + durasi + " hari kerja)\n" +
            "📝 *Alasan:* " + (payload.alasan || '-') + "\n\n" +
            "Silakan klik tautan di bawah ini untuk melihat detail lengkap dan memberikan persetujuan langsung (tanpa perlu login):\n" +
          sendWhatsAppMessage_(atasanPhone, msgWa, {
            jenis_pesan: 'cuti_usulan',
            nama_tujuan: namaAtasan,
            nama_pemohon: namaPegawaiPemohon,
            nip: payload.nip,
            jenis_cuti: payload.jenis,
            periode: payload.tgl_mulai + " s.d " + payload.tgl_selesai,
            durasi: durasi,
            alasan: payload.alasan || '-',
            magic_link: magicLink
          });
        }
      } catch (errWa) {
        Logger.log("Gagal kirim notif WA cuti ke atasan: " + errWa.toString());
      }
    }

    return { status: 'success', message: 'Pengajuan Cuti berhasil disimpan.', data: { id: newId, tgl_pengajuan: tglForm, durasi: durasi, history: JSON.stringify(historyJson), fileUrl: fileUrl, status: statusAwal } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

// ZETTBOT UPDATE: Algoritma Saldo Khusus untuk Mode Edit Tahap 3
function updateCutiLog(payload, aktorNip, clientToken) {
  try {
    // Validasi token sekarang mencocokkan aktorNip (Admin), bukan payload.nip (Target)
    if (!cekOtorisasi(aktorNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetCuti || !sheetUser) throw new Error("Database belum siap.");

    const cutiData = sheetCuti.getDataRange().getValues();
    let rowIndexCuti = -1; let logLama = null;
    for (let i = 1; i < cutiData.length; i++) {
        if (String(cutiData[i][0]) === String(payload.id)) { rowIndexCuti = i + 1; logLama = cutiData[i]; break; }
    }
    
    if (rowIndexCuti === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    if (logLama[7] !== 'Menunggu') throw new Error("Anda tidak dapat mengubah cuti yang sudah di-proses Atasan.");

    // Tarik Identitas Pegawai
    const uData = sheetUser.getDataRange().getValues(); 
    let rowIndexUser = -1;
    for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(payload.nip)) { rowIndexUser = i + 1; break; }
    }
    if (rowIndexUser === -1) throw new Error("Pegawai tidak ditemukan.");

    // Hitung Durasi Cuti Baru
    let d1 = new Date(payload.tgl_mulai); let d2 = new Date(payload.tgl_selesai);
    let durasiBaru = 0;
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) durasiBaru++;
    }

    // Eksekusi Saldo (Hanya jika bukan DL/CLTN)
    let historyJson = { y24:0, y25:0, y26:0, dur: durasiBaru };
    if (payload.jenis !== 'Dinas Luar' && payload.jenis !== 'CLTN') {
        
        // --- 1. REFUND SALDO CUTI LAMA ---
        const historyStr = String(logLama[16] || "");
        let h24 = 0, h25 = 0, h26 = 0, hLain = 0;
        if (historyStr) { try { const h = JSON.parse(historyStr); h24 = h.y24 || 0; h25 = h.y25 || 0; h26 = h.y26 || 0; hLain = h.dur || 0; } catch(e) {} }

        const jenisLama = String(logLama[3]);
        if (jenisLama === 'Tahunan') {
            const cur24 = Number(sheetUser.getRange(rowIndexUser, 7).getValue() || 0);
            const cur25 = Number(sheetUser.getRange(rowIndexUser, 8).getValue() || 0);
            const cur26 = Number(sheetUser.getRange(rowIndexUser, 9).getValue() || 0);
            sheetUser.getRange(rowIndexUser, 7).setValue(cur24 + h24); 
            sheetUser.getRange(rowIndexUser, 8).setValue(cur25 + h25); 
            sheetUser.getRange(rowIndexUser, 9).setValue(cur26 + h26);
        } else {
            const mapKolom = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13 };
            const colLama = mapKolom[jenisLama];
            if (colLama) {
                const cVal = Number(sheetUser.getRange(rowIndexUser, colLama).getValue() || 0); 
                sheetUser.getRange(rowIndexUser, colLama).setValue(cVal + hLain);
            }
        }
        SpreadsheetApp.flush(); // Commit Refund sebelum potong ulang!

        // --- 2. POTONG SALDO DENGAN DURASI & JENIS BARU ---
        const freshUser = sheetUser.getRange(rowIndexUser, 1, 1, 15).getValues()[0];
        
        if (payload.jenis === 'Tahunan') {
            let s24 = Number(freshUser[6]), s25 = Number(freshUser[7]), s26 = Number(freshUser[8]);
            let sisaPotong = durasiBaru;
            
            if (s24 >= sisaPotong) { historyJson.y24 = sisaPotong; sheetUser.getRange(rowIndexUser, 7).setValue(s24 - sisaPotong); sisaPotong = 0; } 
            else { historyJson.y24 = s24; sisaPotong -= s24; sheetUser.getRange(rowIndexUser, 7).setValue(0); }
            
            if (sisaPotong > 0) {
                if (s25 >= sisaPotong) { historyJson.y25 = sisaPotong; sheetUser.getRange(rowIndexUser, 8).setValue(s25 - sisaPotong); sisaPotong = 0; } 
                else { historyJson.y25 = s25; sisaPotong -= s25; sheetUser.getRange(rowIndexUser, 8).setValue(0); }
            }
            if (sisaPotong > 0) {
                if (s26 >= sisaPotong) { historyJson.y26 = sisaPotong; sheetUser.getRange(rowIndexUser, 9).setValue(s26 - sisaPotong); } 
                else { throw new Error("Saldo cuti tahunan tidak mencukupi untuk update tanggal baru."); }
            }
        } else {
            const mapCol = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13 };
            const colBaru = mapCol[payload.jenis];
            if (colBaru) {
                let sCuti = Number(freshUser[colBaru - 1]);
                if (sCuti < durasiBaru) throw new Error(`Saldo cuti ${payload.jenis} Anda tidak mencukupi.`);
                sheetUser.getRange(rowIndexUser, colBaru).setValue(sCuti - durasiBaru);
            }
        }
    }

    // Upload Lampiran Baru (Jika Ada)
    let fileUrlUpdate = logLama[17]; // Pakai URL lama sebagai default
    if (payload.fileData && payload.fileName && payload.fileMimeType) {
        try {
            const folderName = "Bukti Cuti TRANSKEP";
            let folders = DriveApp.getFoldersByName(folderName);
            let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
            const cleanMime = payload.fileName.split('.').pop();
            const generateName = "Bukti_" + payload.jenis + "_" + payload.nip + "_" + new Date().getTime() + "." + cleanMime;
            const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileData), payload.fileMimeType, generateName);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            fileUrlUpdate = file.getUrl();
        } catch(e) {}
    }

    // Update Baris Excel
    sheetCuti.getRange(rowIndexCuti, 4).setValue(payload.jenis);
    sheetCuti.getRange(rowIndexCuti, 5).setValue(payload.tgl_mulai);
    sheetCuti.getRange(rowIndexCuti, 6).setValue(payload.tgl_selesai);
    sheetCuti.getRange(rowIndexCuti, 7).setValue(payload.alasan);
    sheetCuti.getRange(rowIndexCuti, 10).setValue(payload.atasan_nip || '-');
    sheetCuti.getRange(rowIndexCuti, 11).setValue(payload.pejabat_nip || '-');
    sheetCuti.getRange(rowIndexCuti, 12).setValue(durasiBaru);
    sheetCuti.getRange(rowIndexCuti, 13).setValue(payload.plh_nip || '');
    sheetCuti.getRange(rowIndexCuti, 16).setValue(payload.alamat || '-');
    sheetCuti.getRange(rowIndexCuti, 17).setValue(JSON.stringify(historyJson));
    sheetCuti.getRange(rowIndexCuti, 18).setValue(fileUrlUpdate);

    SpreadsheetApp.flush(); 
    return { status: 'success', message: 'Perubahan cuti berhasil disimpan.', data: { id: payload.id, durasi: durasiBaru, history: JSON.stringify(historyJson), fileUrl: fileUrlUpdate } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function deleteCutiLog(id, forceDelete, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    const cutiData = sheetCuti.getDataRange().getValues();
    let rowIndex = -1; let logRecord = null;
    const targetId = String(id || '').trim();

    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]).trim() === targetId) { 
        rowIndex = i + 1; 
        logRecord = cutiData[i]; 
        break; 
      }
    }
    
    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    
    const ownerNip = String(logRecord[2] || '').trim();
    const callerNip = String(userNip || '').trim();
    const isOwner = (ownerNip === callerNip);
    const isAdmin = (typeof cekOtorisasiAdmin === 'function' && cekOtorisasiAdmin(userNip, clientToken));

    if (!isOwner && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang menarik atau menghapus permohonan cuti milik sendiri.");
    }

    const statusSekarang = String(logRecord[7] || '').trim();
    const statusClean = statusSekarang.toLowerCase();
    let isHardDelete = Boolean(forceDelete);

    if (!isHardDelete && !isAdmin) {
      // Pemohon hanya boleh menarik jika statusnya Menunggu atau Perubahan
      if (statusClean !== 'menunggu' && statusClean !== 'perubahan') {
        throw new Error("Hanya pengajuan dengan status 'Menunggu' atau 'Perubahan' yang dapat ditarik kembali.");
      }
    }
    
    const nip = ownerNip; 
    const jenis = String(logRecord[3] || '').trim();
    
    // Kembalikan saldo kuota jika cuti belum pernah ditolak atau dibatalkan sebelumnya
    if (jenis !== 'Dinas Luar' && statusClean !== 'ditolak' && statusClean !== 'dibatalkan') {
        const historyStr = String(logRecord[16] || "");
        let h24 = 0, h25 = 0, h26 = 0, hLain = 0;
        if (historyStr) { 
          try { 
            const h = JSON.parse(historyStr); 
            h24 = h.y24 || 0; 
            h25 = h.y25 || 0; 
            h26 = h.y26 || 0; 
            hLain = h.dur || 0; 
          } catch(e) {} 
        }
        
        const userData = sheetUser.getDataRange().getValues();
        let userRowIndex = -1;
        for (let i = 1; i < userData.length; i++) { 
          if (String(userData[i][0]).trim() === nip) { 
            userRowIndex = i + 1; 
            break; 
          } 
        }
        
        if (userRowIndex !== -1) {
           if (jenis === 'Tahunan') {
              const c24 = Number(sheetUser.getRange(userRowIndex, 7).getValue() || 0); 
              const c25 = Number(sheetUser.getRange(userRowIndex, 8).getValue() || 0); 
              const c26 = Number(sheetUser.getRange(userRowIndex, 9).getValue() || 0);
              sheetUser.getRange(userRowIndex, 7).setValue(c24 + h24); 
              sheetUser.getRange(userRowIndex, 8).setValue(c25 + h25); 
              sheetUser.getRange(userRowIndex, 9).setValue(c26 + h26);
           } else {
              const mapKolom = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13, 'CLTN': 14 };
              const col = mapKolom[jenis];
              if (col) { 
                const cVal = Number(sheetUser.getRange(userRowIndex, col).getValue() || 0); 
                sheetUser.getRange(userRowIndex, col).setValue(cVal + hLain); 
              }
           }
        }
    }
    
    let finalMessage = "";
    if (isHardDelete && (statusClean === 'disetujui' || statusClean === 'menunggu pembatalan')) {
        // Jika sudah disahkan dan dibatalkan secara administratif oleh Admin, tandai DIBATALKAN
        sheetCuti.getRange(rowIndex, 8).setValue('DIBATALKAN');
        sheetCuti.getRange(rowIndex, 14).setValue('DIBATALKAN');
        sheetCuti.getRange(rowIndex, 15).setValue('DIBATALKAN');
        finalMessage = 'Status cuti telah diubah menjadi DIBATALKAN dan saldo kuota telah dikembalikan.';
    } else {
        // Jika status Menunggu / Perubahan ditarik atau dihapus, hapus baris transaksi sepenuhnya
        sheetCuti.deleteRow(rowIndex);
        finalMessage = 'Transaksi permohonan berhasil ditarik dan dihapus sepenuhnya dari sistem.';
    }
    
    SpreadsheetApp.flush();
    return { status: 'success', message: finalMessage };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function requestCancelCuti(id, alasanBatal, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    
    const cutiData = sheetCuti.getDataRange().getValues();
    let rowIndex = -1; let logRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(id)) { rowIndex = i + 1; logRecord = cutiData[i]; break; }
    }
    
    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    if (logRecord[7] !== 'Disetujui') throw new Error("Cuti belum berstatus disetujui penuh.");
    
    const alasanBaru = logRecord[6] + "\n\n[USULAN PEMBATALAN]: " + alasanBatal;
    
    sheetCuti.getRange(rowIndex, 7).setValue(alasanBaru); 
    sheetCuti.getRange(rowIndex, 8).setValue('Menunggu Pembatalan');
    
    SpreadsheetApp.flush();
    return { status: 'success' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}