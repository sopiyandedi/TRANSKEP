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

    // Trigger Otomasi Surat Keluar MYSIMS via n8n (ST, SPD, Plh)
    try {
      triggerN8nSuratTugas_(idST, payload);
    } catch (errN8n) {
      Logger.log("⚠️ [n8n ST Trigger Error] " + errN8n.toString());
    }

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

// =========================================================================
// INTEGRASI SURAT TUGAS TERPADU MYSIMS VIA N8N (ST, SPD, PLH) - TAHAP 102
// =========================================================================

/**
 * Trigger Webhook n8n untuk Surat Tugas Terpadu (ST, SPD, Plh)
 * Dijalankan HANYA saat pembuatan ST baru (addSuratTugas), TIDAK saat Edit!
 */
function triggerN8nSuratTugas_(idST, payload) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhookUrl = props.getProperty('N8N_WEBHOOK_SURAT_KELUAR');
    if (!webhookUrl) {
      Logger.log("ℹ️ [n8n ST Trigger] N8N_WEBHOOK_SURAT_KELUAR belum disetel. Trigger dilewati.");
      return;
    }

    const verifiedExecUrl = props.getProperty('TRANSKEP_EXEC_URL') ||
      'https://script.google.com/macros/s/AKfycbzFrbQTqmVzMio7mderK-S9ntFVjXiWYFgnXfy9fW_SUKOcIxfPywP2He1flhaK_AZ0ZA/exec';

    let pesertaList = [];
    try {
      pesertaList = JSON.parse(payload.peserta_json || '[]');
    } catch (e) {}

    let ekstraData = {};
    try {
      ekstraData = JSON.parse(payload.data_ekstra_json || '{}');
    } catch (e) {}

    const tglSuratToday = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const tasks = [];

    // 1. TASK SURAT TUGAS (ST)
    const namaFirst = (pesertaList.length > 0 && pesertaList[0].nama) ? String(pesertaList[0].nama).trim() : 'Pegawai';
    const kepadaST = pesertaList.length > 1 ? (namaFirst + ', dkk.') : namaFirst;
    const uraianST = 'Surat Tugas ' + String(payload.tujuan || 'Kedinasan').trim() + (payload.tempat ? (' ke ' + String(payload.tempat).trim()) : '');

    // Kode ST: bersihkan prefix ST. jika user mengetikkan ST.
    let rawKodeST = String(payload.nomor_surat || 'HM3.1.1').trim();
    rawKodeST = rawKodeST.replace(/^ST\./i, '').trim() || 'HM3.1.1';

    tasks.push({
      tipe: 'ST',
      jabatan_penandatangan: String(payload.pejabat_ttd || 'Ketua').trim(),
      kode_klasifikasi: rawKodeST,
      kepada: kepadaST,
      uraian: uraianST,
      tgl_surat: tglSuratToday
    });

    // 2. TASK SPD (JIKA ADA FASILITAS SPD / NOMOR SPD DIAKTIFKAN)
    const hasSpd = pesertaList.some(function(p) { return p.spd_active; }) ||
      Boolean(ekstraData.nomor_spd && String(ekstraData.nomor_spd).trim() !== '') ||
      Boolean(ekstraData.tempat_tujuan_spd && String(ekstraData.tempat_tujuan_spd).trim() !== '');

    if (hasSpd) {
      const uraianSPD = 'Surat Perjalanan Dinas ' + String(payload.tujuan || 'Kedinasan').trim() + (payload.tempat ? (' ke ' + String(payload.tempat).trim()) : '');
      tasks.push({
        tipe: 'SPD',
        jabatan_penandatangan: 'Sekretaris',
        kode_klasifikasi: 'KU1',
        kepada: kepadaST,
        uraian: uraianSPD,
        tgl_surat: tglSuratToday
      });
    }

    // 3. TASK PLH (UNTUK SETIAP PEJABAT YANG DITUNJUKKAN PLH)
    const plhItems = pesertaList.filter(function(p) {
      return p.plh_nip && String(p.plh_nip).trim() !== '';
    });

    for (let i = 0; i < plhItems.length; i++) {
      const plhTarget = plhItems[i];
      const namaPlh = String(plhTarget.plh_nama || 'Pejabat Plh').trim();
      const jabatanYangDiganti = String(plhTarget.jabatan || 'Pejabat').trim();
      const uraianPLH = 'Surat Perintah Pelaksana Harian (Plh) ' + jabatanYangDiganti + ' a.n. ' + namaPlh;

      tasks.push({
        tipe: 'PLH',
        jabatan_penandatangan: 'Ketua',
        kode_klasifikasi: 'KP7.4',
        kepada: namaPlh,
        uraian: uraianPLH,
        nip_pejabat_asal: String(plhTarget.nip || ''),
        plh_nip: String(plhTarget.plh_nip || ''),
        plh_nama: namaPlh,
        tgl_surat: tglSuratToday
      });
    }

    const payloadN8n = {
      event: 'ST_TERPADU',
      id_st: String(idST),
      tanggal_surat: tglSuratToday,
      callback_url: verifiedExecUrl,
      secret_key: props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026',
      tasks: tasks,
      timestamp: new Date().toISOString()
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadN8n),
      muteHttpExceptions: true
    };

    const resp = UrlFetchApp.fetch(webhookUrl, options);
    Logger.log("✅ [n8n ST Trigger] Webhook ST Terpadu (" + tasks.length + " tasks) terkirim. Respon code: " + resp.getResponseCode());
  } catch (err) {
    Logger.log("⚠️ [n8n ST Trigger Error] " + err.toString());
  }
}

/**
 * Callback API dari n8n untuk memperbarui Nomor Surat Tugas, SPD, dan Plh pada database st_log
 */
function updateNomorSuratTugasFromExternal_(payload) {
  try {
    const idST = payload ? (payload.id_st || payload.id) : '';
    if (!payload || !idST) {
      return { status: 'error', message: "Parameter 'id_st' wajib disertakan." };
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const configuredKey = scriptProps.getProperty("TRANSKEP_WEBHOOK_KEY") || "TRANSKEP_WA_BOT_2026";
    if (payload.secret_key && String(payload.secret_key).trim() !== configuredKey.trim()) {
      return { status: 'error', message: "Akses ditolak: Secret Key tidak valid." };
    }

    const ss = getDB();
    const sheetST = ss.getSheetByName('st_log');
    if (!sheetST) throw new Error("Database st_log tidak ditemukan.");

    const data = sheetST.getDataRange().getValues();
    let rowIndex = -1;
    let targetRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idST).trim()) {
        rowIndex = i + 1; // 1-based index
        targetRow = data[i];
        break;
      }
    }

    if (rowIndex === -1 || !targetRow) {
      return { status: 'error', message: "Surat Tugas dengan ID " + idST + " tidak ditemukan." };
    }

    // 1. Update Nomor ST (Kolom 3 / C)
    if (payload.nomor_st && String(payload.nomor_st).trim() !== '') {
      sheetST.getRange(rowIndex, 3).setNumberFormat('@').setValue(String(payload.nomor_st).trim());
    }

    // 2. Update Data Ekstra (Kolom 14 / N) untuk nomor_spd & nomor_plh
    let ekstra = {};
    try {
      ekstra = JSON.parse(targetRow[13] || '{}');
    } catch (e) {}

    if (payload.nomor_spd && String(payload.nomor_spd).trim() !== '') {
      ekstra.nomor_spd = String(payload.nomor_spd).trim();
    }
    if (payload.nomor_plh && String(payload.nomor_plh).trim() !== '') {
      ekstra.nomor_plh = String(payload.nomor_plh).trim();
    }
    sheetST.getRange(rowIndex, 14).setValue(JSON.stringify(ekstra));

    // 3. Update Data Peserta (Kolom 11 / K) jika ada plh_results perorangan
    let pesertaList = [];
    try {
      pesertaList = JSON.parse(targetRow[10] || '[]');
    } catch (e) {}

    if (payload.plh_results && Array.isArray(payload.plh_results)) {
      for (let r = 0; r < payload.plh_results.length; r++) {
        const item = payload.plh_results[r];
        for (let p = 0; p < pesertaList.length; p++) {
          if (pesertaList[p].plh_nip && String(pesertaList[p].plh_nip).trim() === String(item.plh_nip).trim()) {
            pesertaList[p].nomor_plh = item.nomor_plh;
          }
        }
      }
      sheetST.getRange(rowIndex, 11).setValue(JSON.stringify(pesertaList));
    }

    SpreadsheetApp.flush();
    if (typeof bumpDataVersion === "function") bumpDataVersion();

    // 4. Kompilasi Headless PDF Resmi (ST, SPD, & Plh) untuk Disuntikkan ke MYSIMS
    let pdfStRes = { pdf_base64: '', pdf_filename: '' };
    let pdfSpdRes = { pdf_base64: '', pdf_filename: '' };
    const plhPdfList = [];

    try {
      // Ambil snapshot record terupdate
      const updatedRecord = [...targetRow];
      if (payload.nomor_st) updatedRecord[2] = String(payload.nomor_st).trim();

      // A. Kompilasi PDF Surat Tugas
      if (typeof generateSuratTugasPdfBase64_ === 'function') {
        pdfStRes = generateSuratTugasPdfBase64_(updatedRecord, pesertaList, ekstra, payload.nomor_st);
      }

      // B. Kompilasi PDF SPD (jika ada nomor SPD atau ada peserta dengan fasilitas SPD)
      const hasSpd = (payload.nomor_spd && String(payload.nomor_spd).trim() !== '') ||
                     pesertaList.some(function(p) { return p.get_spd === true; });
      if (hasSpd && typeof generateSpdPdfBase64_ === 'function') {
        pdfSpdRes = generateSpdPdfBase64_(updatedRecord, pesertaList, ekstra, payload.nomor_spd);
      }

      // C. Kompilasi PDF Surat Penunjukan Plh (untuk setiap pejabat yang dinas & tunjuk Plh)
      if (typeof generatePlhPdfBase64_ === 'function') {
        let plhTargets = [];
        if (payload.plh_results) {
          if (Array.isArray(payload.plh_results)) {
            plhTargets = payload.plh_results;
          } else if (typeof payload.plh_results === 'string') {
            try { plhTargets = JSON.parse(payload.plh_results); } catch (e) { plhTargets = []; }
          }
        }
        if (!plhTargets || plhTargets.length === 0) {
          plhTargets = pesertaList.filter(function(p) { return p.plh_nip && String(p.plh_nip).trim() !== ''; });
        }

        for (let t = 0; t < plhTargets.length; t++) {
          const target = plhTargets[t];
          const noPlhItem = target.nomor_plh || payload.nomor_plh || (ekstra ? ekstra.nomor_plh : '') || '';
          const singlePlhPdf = generatePlhPdfBase64_(updatedRecord, target, ekstra, noPlhItem);
          plhPdfList.push({
            nip_pejabat_asal: target.nip_pejabat_asal || target.nip || '',
            plh_nip: target.plh_nip || '',
            plh_nama: target.plh_nama || '',
            nomor_plh: noPlhItem,
            pdf_base64: singlePlhPdf.pdf_base64,
            pdf_filename: singlePlhPdf.pdf_filename
          });
        }
      }
    } catch (errPdf) {
      Logger.log("⚠️ [n8n ST Callback PDF Error] Gagal kompilasi PDF: " + errPdf.toString());
    }

    Logger.log("✅ [n8n ST Callback] Sukses update ST ID: " + idST + " -> ST: " + payload.nomor_st + ", SPD: " + payload.nomor_spd + " (PDFs ready: ST=" + (pdfStRes.pdf_base64 ? 'OK' : 'NO') + ", SPD=" + (pdfSpdRes.pdf_base64 ? 'OK' : 'NO') + ", PLH=" + plhPdfList.length + ")");
    return {
      status: 'success',
      message: 'Nomor Surat Tugas terpadu berhasil diperbarui & PDF resmi siap disuntikkan.',
      id_st: idST,
      nomor_st: payload.nomor_st || '',
      nomor_spd: payload.nomor_spd || '',
      nomor_plh: payload.nomor_plh || '',
      pdf_st: pdfStRes,
      pdf_spd: pdfSpdRes,
      pdf_plh_list: plhPdfList
    };
  } catch (err) {
    Logger.log("❌ [n8n ST Callback Error] " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}