// ==========================================
// FILE: st.gs
// Deskripsi: Backend Controller Surat Tugas (ST) (Aman & Terpusat)
// ==========================================

function setupSheetST() {
  try {
    const ss = getDB();
    let sheetST = ss.getSheetByName('st_log');
    
    if (!sheetST) {
      sheetST = ss.insertSheet('st_log');
      const headers = [
        'ID_ST', 'Waktu_Dibuat', 'Nomor_Surat', 'Menimbang', 'Dasar', 
        'Tujuan', 'Tempat', 'Tgl_Mulai', 'Tgl_Selesai', 'Jam', 
        'Data_Peserta_JSON', 'Pejabat_TTD', 'Status', 'Data_Ekstra_JSON'
      ];
      sheetST.appendRow(headers);
      sheetST.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff').setHorizontalAlignment('center');
      sheetST.setFrozenRows(1);
    }
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return "Database st_log siap.";
  } catch (e) { return "Error: " + e.toString(); }
}

function addSuratTugas(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheetST = ss.getSheetByName('st_log');
    if (!sheetST) {
      setupSheetST();
      sheetST = ss.getSheetByName('st_log');
    }

    const idST = "ST-" + new Date().getTime() + Math.floor(Math.random() * 1000);
    const waktuDibuat = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    sheetST.appendRow(sanitizeRowArray([
      idST, waktuDibuat, payload.nomor_surat || '', payload.menimbang || '', payload.dasar || '',
      payload.tujuan || '', payload.tempat || '', payload.tgl_mulai || '', payload.tgl_selesai || '', 
      payload.jam || '', payload.peserta_json || '', payload.pejabat_ttd || '',
      'DISETUJUI', payload.data_ekstra_json || '' 
    ]));
    
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Surat Tugas berhasil diterbitkan.', id: idST };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function updateSuratTugas(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetST = ss.getSheetByName('st_log');
    if (!sheetST) throw new Error("Database Surat Tugas tidak ditemukan.");

    const data = sheetST.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id_st)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data Surat Tugas tidak ditemukan.");

    const originalWaktu = sheetST.getRange(rowIndex, 2).getValue();
    
    const updatedRow = [
      payload.id_st, originalWaktu, payload.nomor_surat || '', payload.menimbang || '', payload.dasar || '',
      payload.tujuan || '', payload.tempat || '', payload.tgl_mulai || '', payload.tgl_selesai || '', 
      payload.jam || '', payload.peserta_json || '', payload.pejabat_ttd || '',
      'DISETUJUI', payload.data_ekstra_json || '' 
    ];
    
    sheetST.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Data Surat Tugas berhasil diperbarui secara permanen.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getSuratTugasData() {
  try {
    const ss = getDB();
    const sheetST = ss.getSheetByName('st_log');
    if (!sheetST) return [];

    const data = sheetST.getDataRange().getDisplayValues();
    const result = [];
    for (let i = 1; i < data.length; i++) {
      result.push({
        id: data[i][0], waktu: data[i][1], nomor: data[i][2], menimbang: data[i][3], dasar: data[i][4],
        tujuan: data[i][5], tempat: data[i][6], tgl_mulai: data[i][7], tgl_selesai: data[i][8],
        jam: data[i][9], peserta: data[i][10], pejabat_ttd: data[i][11], status: data[i][12], data_ekstra: data[i][13] || '{}'
      });
    }
    return result;
  } catch (err) { return []; }
}

function deleteSuratTugasLog(id, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetST = ss.getSheetByName('st_log');
    if (!sheetST) throw new Error("Database Surat Tugas tidak ditemukan.");

    const data = sheetST.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("Data Surat Tugas tidak ditemukan.");

    sheetST.deleteRow(rowIndex);
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Surat Tugas berhasil dihapus permanen.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
} 

function saveSettingsST(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };
    const props = PropertiesService.getScriptProperties();
    props.setProperty('ST_DEFAULT_PPK', payload.ppk);
    props.setProperty('ST_DEFAULT_MENIMBANG', payload.menimbang);
    props.setProperty('ST_DEFAULT_DASAR', payload.dasar);
    props.setProperty('ST_DEFAULT_INSTANSI', payload.instansi);
    props.setProperty('ST_DEFAULT_MATA_ANGGARAN', payload.mata_anggaran);
    props.setProperty('ST_DEFAULT_ANGKUTAN', payload.angkutan);
    props.setProperty('ST_DEFAULT_PARAGRAF_BIAYA', payload.paragraf_biaya);
    return { status: 'success', message: 'Pengaturan dasar Surat Tugas berhasil disimpan.' };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function getSettingsST() {
  try {
    const props = PropertiesService.getScriptProperties();
    return {
      status: 'success',
      data: {
        ppk: props.getProperty('ST_DEFAULT_PPK') || '',
        menimbang: props.getProperty('ST_DEFAULT_MENIMBANG') || '',
        dasar: props.getProperty('ST_DEFAULT_DASAR') || '',
        instansi: props.getProperty('ST_DEFAULT_INSTANSI') || '',
        mata_anggaran: props.getProperty('ST_DEFAULT_MATA_ANGGARAN') || '',
        angkutan: props.getProperty('ST_DEFAULT_ANGKUTAN') || '',
        paragraf_biaya: props.getProperty('ST_DEFAULT_PARAGRAF_BIAYA') || ''
      }
    };
  } catch (e) { return { status: 'error', data: {} }; }
}