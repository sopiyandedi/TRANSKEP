// =========================================================================
// TRANSKEP BACKEND MODULE: IZIN KELUAR (Aman & Terpusat)
// =========================================================================

function submitIzinKeluar(payload, clientToken) {
  try {
    if (!cekOtorisasi(payload.nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheetIK = ss.getSheetByName('izin_keluar_log');
    
    if(!sheetIK) {
        sheetIK = ss.insertSheet('izin_keluar_log');
        const headers = ['ID', 'Waktu_Pengajuan', 'NIP', 'Tanggal', 'Tipe_Izin', 'Jam', 'Keperluan', 'Atasan_NIP', 'Status', 'Catatan_Atasan'];
        sheetIK.appendRow(headers);
        sheetIK.getRange("A1:J1").setFontWeight("bold").setBackground("#0ea5e9").setFontColor("#ffffff"); 
        sheetIK.setFrozenRows(1);
    }
    
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const newId = "IK-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    
    const rowArr = [
        newId, timestamp, payload.nip, payload.tanggal, payload.tipe_izin,
        payload.jam, payload.alasan, payload.atasan_nip, 'Menunggu', ''
    ];
    sheetIK.appendRow((typeof sanitizeRowArray === 'function') ? sanitizeRowArray(rowArr) : rowArr);
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Keluar berhasil diajukan dan sedang menunggu persetujuan.', data: { id: newId } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getIzinKeluarById(id) {
  try {
    const sess = (typeof getActiveSession_ === 'function') ? getActiveSession_() : null;
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetIK = ss.getSheetByName('izin_keluar_log');
    if (!sheetIK) throw new Error("Data Izin Keluar belum tersedia.");
    
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : false;

    const data = sheetIK.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const isOwner = norm(data[i][2]) === sess.nip;
        const isAtasan = norm(data[i][7]) === sess.nip;
        if (!isOwner && !isAtasan && !isAdmin) {
          return { status: 'error', message: 'Akses Ditolak: Anda tidak berwenang melihat data Izin Keluar ini.' };
        }
        return {
          status: 'success',
          data: {
            id: data[i][0], waktu: data[i][1], nip: data[i][2],
            tanggal: data[i][3], tipe_izin: data[i][4], jam: data[i][5],
            alasan: data[i][6], atasan_nip: data[i][7], status: data[i][8], catatan: data[i][9]
          }
        };
      }
    }
    throw new Error("Data Izin Keluar tidak ditemukan.");
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateIkStatus(id, decision, notes, userNip, bypassMode, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    if (['Disetujui', 'Ditolak', 'Perubahan', 'Ditangguhkan'].indexOf(String(decision || '')) === -1) {
      throw new Error("Keputusan persetujuan tidak valid.");
    }

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_keluar_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data Izin Keluar tidak ditemukan di sistem.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    const isAtasan = (norm(data[rowIndex - 1][7]) !== '' && norm(data[rowIndex - 1][7]) === sess.nip);

    if (bypassMode && !isAdmin) {
      throw new Error("Akses Ditolak: Mode Bypass Atasan hanya untuk Admin/Operator.");
    }
    if (!isAtasan && !isAdmin) {
      throw new Error("Akses Ditolak: Anda bukan atasan/pejabat berwenang untuk berkas Izin Keluar ini.");
    }
    
    let finalNotes = String(notes || '');
    if (bypassMode && isAdmin) finalNotes += "\n\n*(Disetujui via Bypass Atasan)*";
    
    sheet.getRange(rowIndex, 9).setValue(decision); 
    sheet.getRange(rowIndex, 10).setValue(sf(finalNotes)); 
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Usulan Izin Keluar berhasil diproses.' };
  } catch(e) { return { status: 'error', message: e.toString() }; }
}

function deleteIzinKeluarLog(id, forceDelete, userNip, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_keluar_log');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { 
        rowIndex = i + 1; 
        break; 
      }
    }
    if (rowIndex === -1) throw new Error("Data tidak ditemukan di sistem.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    const isOwner = (norm(data[rowIndex - 1][2]) === sess.nip);

    if (!isOwner && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang menarik pengajuan Izin Keluar milik sendiri.");
    }
    if (forceDelete && !isAdmin) {
      throw new Error("Akses Ditolak: Penghapusan paksa hanya dapat dilakukan oleh Admin/Operator.");
    }
    if (!forceDelete && data[rowIndex - 1][8] !== 'Menunggu') {
      throw new Error("Akses Ditolak: Hanya usulan berstatus Menunggu yang dapat ditarik/dihapus.");
    }
    
    sheet.deleteRow(rowIndex);
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Pengajuan Izin Keluar berhasil ditarik dan dihapus.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateIzinKeluarLog(payload, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(payload && payload.nip, clientToken)
      : (cekOtorisasi(payload && payload.nip, clientToken) ? { nip: normalizeNipKey_(payload.nip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('izin_keluar_log');
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
      throw new Error("Akses Ditolak: Anda hanya berwenang mengubah pengajuan Izin Keluar milik sendiri.");
    }
    
    if (data[rowIndex-1][8] !== 'Menunggu' && data[rowIndex-1][8] !== 'Ditolak') {
        throw new Error("Akses Ditolak: Hanya data berstatus Menunggu atau Ditolak yang bisa diubah.");
    }
    
    sheet.getRange(rowIndex, 4).setValue(sf(payload.tanggal));
    sheet.getRange(rowIndex, 5).setValue(sf(payload.tipe_izin));
    sheet.getRange(rowIndex, 6).setValue(sf(payload.jam));
    sheet.getRange(rowIndex, 7).setValue(sf(payload.alasan));
    sheet.getRange(rowIndex, 8).setValue(sf(payload.atasan_nip));
    sheet.getRange(rowIndex, 9).setValue('Menunggu');
    sheet.getRange(rowIndex, 10).setValue('');
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Izin Keluar berhasil diperbarui.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}