// ==========================================
// FILE: eoffice/eoffice.js
// DESKRIPSI: Backend Controller E-Office (KGB & Paket Rapat)
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

/**
 * Inisialisasi Database Sheet E-Office (Safe Migration & Idempoten)
 * TRANSKEP: Menjamin tidak pernah menghapus data sheet yang sudah ada
 */
function initEofficeDatabase_() {
  try {
    const ss = getDB();
    if (!ss) throw new Error("Database spreadsheet tidak ditemukan.");

    // 1. SETUP SHEET EofficeKGB
    let kgbSheet = ss.getSheetByName('EofficeKGB');
    if (!kgbSheet) {
      kgbSheet = ss.insertSheet('EofficeKGB');
    }

    const kgbHeaders = [
      'ID_KGB', 'Tanggal_Input', 'NIP', 'Nama_Pegawai', 'Tanggal_Lahir', 
      'Pangkat', 'Golongan', 'Jabatan', 'Unit_Kerja', 'Nomor_Surat', 
      'Tanggal_Surat', 'Tujuan_KPPN', 'Gaji_Pokok_Lama', 'Pejabat_SK_Lama', 
      'Nomor_SK_Lama', 'Tanggal_SK_Lama', 'TMT_Gaji_Lama', 'MKG_Lama', 
      'Gaji_Pokok_Baru', 'Terbilang_Gaji_Baru', 'MKG_Baru', 'TMT_Gaji_Baru', 
      'TMT_Gaji_YAD', 'Dasar_PP', 'Nama_Ketua', 'Status_Proses', 
      'File_Doc_Url', 'File_Pdf_Url', 'Operator_NIP'
    ];

    if (kgbSheet.getLastRow() === 0) {
      kgbSheet.appendRow(kgbHeaders);
      kgbSheet.getRange(1, 1, 1, kgbHeaders.length)
        .setFontWeight('bold')
        .setBackground('#064e3b')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');
      kgbSheet.getRange("A:A").setNumberFormat('@'); // ID
      kgbSheet.getRange("C:C").setNumberFormat('@'); // NIP
    } else {
      // Safe Migration: Cek apakah ada kolom baru
      const existingHeaders = kgbSheet.getRange(1, 1, 1, kgbSheet.getLastColumn()).getValues()[0];
      kgbHeaders.forEach(header => {
        if (!existingHeaders.includes(header)) {
          const newColIdx = kgbSheet.getLastColumn() + 1;
          kgbSheet.getRange(1, newColIdx).setValue(header).setFontWeight('bold');
        }
      });
    }

    // 2. SETUP SHEET EofficeRapat
    let rapatSheet = ss.getSheetByName('EofficeRapat');
    if (!rapatSheet) {
      rapatSheet = ss.insertSheet('EofficeRapat');
    }

    const rapatHeaders = [
      'ID_Rapat', 'Tanggal_Input', 'Nomor_Surat_Undangan', 'Agenda_Rapat', 
      'Hari_Tanggal', 'Waktu_Mulai', 'Waktu_Selesai', 'Tempat', 
      'Pemimpin_Rapat', 'Notulis_Rapat', 'Daftar_Peserta_JSON', 
      'Hasil_Pembahasan', 'Kesimpulan', 'Status', 
      'Url_Doc_Undangan', 'Url_Doc_DaftarHadir', 'Url_Doc_Notulen', 'Operator_NIP'
    ];

    if (rapatSheet.getLastRow() === 0) {
      rapatSheet.appendRow(rapatHeaders);
      rapatSheet.getRange(1, 1, 1, rapatHeaders.length)
        .setFontWeight('bold')
        .setBackground('#1e1b4b')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');
      rapatSheet.getRange("A:A").setNumberFormat('@'); // ID
    } else {
      const existingHeaders = rapatSheet.getRange(1, 1, 1, rapatSheet.getLastColumn()).getValues()[0];
      rapatHeaders.forEach(header => {
        if (!existingHeaders.includes(header)) {
          const newColIdx = rapatSheet.getLastColumn() + 1;
          rapatSheet.getRange(1, newColIdx).setValue(header).setFontWeight('bold');
        }
      });
    }

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Sheet E-Office berhasil diinisialisasi secara aman.' };
  } catch (err) {
    Logger.log("ERROR initEofficeDatabase_: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Mengambil data gabungan E-Office (KGB & Rapat) untuk ditampilkan di tabel
 */
function getEofficeData(nip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(nip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Fitur E-Office hanya dapat diakses oleh Admin.' };
    }

    const ss = getDB();
    if (!ss) throw new Error("Koneksi database gagal.");

    // Inisialisasi jika belum ada
    initEofficeDatabase_();

    // 1. AMBIL RIWAYAT KGB DARI SHEET EofficeKGB
    const kgbSheet = ss.getSheetByName('EofficeKGB');
    let kgbList = [];
    if (kgbSheet && kgbSheet.getLastRow() > 1) {
      const kgbData = kgbSheet.getRange(2, 1, kgbSheet.getLastRow() - 1, kgbSheet.getLastColumn()).getValues();
      kgbList = kgbData.map(row => ({
        id_kgb: String(row[0] || ''),
        tanggal_input: row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Jakarta', 'yyyy-MM-dd') : '',
        nip: String(row[2] || ''),
        nama_pegawai: String(row[3] || ''),
        tanggal_lahir: String(row[4] || ''),
        pangkat: String(row[5] || ''),
        golongan: String(row[6] || ''),
        jabatan: String(row[7] || ''),
        unit_kerja: String(row[8] || 'Pengadilan Agama Indramayu Kelas 1.A.'),
        nomor_surat: String(row[9] || ''),
        tanggal_surat: String(row[10] || ''),
        tujuan_kppn: String(row[11] || 'KPPN Cirebon di CIREBON'),
        gaji_lama: row[12] || '',
        pejabat_lama: String(row[13] || ''),
        nomor_sk_lama: String(row[14] || ''),
        tanggal_sk_lama: String(row[15] || ''),
        tmt_lama: String(row[16] || ''),
        mkg_lama: String(row[17] || ''),
        gaji_baru: row[18] || '',
        terbilang_gaji: String(row[19] || ''),
        mkg_baru: String(row[20] || ''),
        tmt_baru: String(row[21] || ''),
        tmt_yad: String(row[22] || ''),
        dasar_pp: String(row[23] || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024'),
        nama_ketua: String(row[24] || ''),
        status: String(row[25] || 'Sedang Diproses'),
        file_doc_url: String(row[26] || ''),
        file_pdf_url: String(row[27] || ''),
        operator_nip: String(row[28] || '')
      }));
    }

    // 2. REAKTIF DARI DASHBOARD: Pegawai yang berstatus 'Proses' di user_data tapi belum ada di EofficeKGB
    const userSheet = ss.getSheetByName('user_data');
    if (userSheet && userSheet.getLastRow() > 1) {
      const uData = userSheet.getDataRange().getValues();
      const headers = uData[0];
      const nipCol = headers.indexOf('NIP');
      const namaCol = headers.indexOf('Nama');
      const pangkatCol = headers.indexOf('Pangkat');
      const jabCol = headers.indexOf('Jabatan');
      const tmtKgbCol = headers.indexOf('TMT_KGB');
      const statusKgbCol = headers.indexOf('Status_KGB');

      if (statusKgbCol !== -1 && nipCol !== -1) {
        for (let i = 1; i < uData.length; i++) {
          const rowNip = String(uData[i][nipCol]);
          const statusKgb = String(uData[i][statusKgbCol] || '').trim();

          // Jika berstatus 'Proses' (Sedang Diproses di Dashboard)
          if (statusKgb.toLowerCase() === 'proses') {
            const alreadyExists = kgbList.some(item => item.nip === rowNip && item.status !== 'Selesai');
            if (!alreadyExists) {
              const tmtRaw = uData[i][tmtKgbCol];
              let tmtStr = '';
              if (tmtRaw) {
                try {
                  tmtStr = Utilities.formatDate(new Date(tmtRaw), 'Asia/Jakarta', 'yyyy-MM-dd');
                } catch(e) { tmtStr = String(tmtRaw); }
              }

              // Masukkan sebagai draf antrean aktif
              kgbList.unshift({
                id_kgb: 'DRAFT-' + rowNip,
                tanggal_input: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'),
                nip: rowNip,
                nama_pegawai: String(uData[i][namaCol] || ''),
                pangkat: String(uData[i][pangkatCol] || ''),
                golongan: '',
                jabatan: String(uData[i][jabCol] || ''),
                unit_kerja: 'Pengadilan Agama Indramayu Kelas 1.A.',
                nomor_surat: '',
                tanggal_surat: '',
                tujuan_kppn: 'KPPN Cirebon di CIREBON',
                gaji_lama: '',
                pejabat_lama: '',
                nomor_sk_lama: '',
                tanggal_sk_lama: '',
                tmt_lama: '',
                mkg_lama: '',
                gaji_baru: '',
                terbilang_gaji: '',
                mkg_baru: '',
                tmt_baru: tmtStr,
                tmt_yad: '',
                dasar_pp: 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024',
                nama_ketua: '',
                status: 'Sedang Diproses',
                file_doc_url: '',
                file_pdf_url: '',
                operator_nip: nip,
                is_from_dashboard: true
              });
            }
          }
        }
      }
    }

    // 3. AMBIL DATA RAPAT DARI SHEET EofficeRapat
    const rapatSheet = ss.getSheetByName('EofficeRapat');
    let rapatList = [];
    if (rapatSheet && rapatSheet.getLastRow() > 1) {
      const rapatData = rapatSheet.getRange(2, 1, rapatSheet.getLastRow() - 1, rapatSheet.getLastColumn()).getValues();
      rapatList = rapatData.map(row => ({
        id_rapat: String(row[0] || ''),
        tanggal_input: row[1] ? Utilities.formatDate(new Date(row[1]), 'Asia/Jakarta', 'yyyy-MM-dd') : '',
        nomor_undangan: String(row[2] || ''),
        agenda: String(row[3] || ''),
        hari_tanggal: String(row[4] || ''),
        waktu_mulai: String(row[5] || ''),
        waktu_selesai: String(row[6] || ''),
        tempat: String(row[7] || ''),
        pemimpin: String(row[8] || ''),
        notulis: String(row[9] || ''),
        peserta_json: String(row[10] || '[]'),
        pembahasan: String(row[11] || ''),
        kesimpulan: String(row[12] || ''),
        status: String(row[13] || 'Terjadwal'),
        doc_undangan_url: String(row[14] || ''),
        doc_absen_url: String(row[15] || ''),
        doc_notulen_url: String(row[16] || ''),
        operator_nip: String(row[17] || '')
      }));
    }

    return {
      status: 'success',
      data: {
        kgb: kgbList,
        rapat: rapatList
      }
    };
  } catch (err) {
    Logger.log("ERROR getEofficeData: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}
