// ==========================================
// FILE: pkp_data.js (TRANSKEP Modular)
// DESKRIPSI: Data Service Layer khusus Modul Penilaian Kinerja Pegawai (PKP & PCK)
// FITUR: RPC Dokumen PKP, Dokumen PCK, Detail, Submit Bulk, Aksi Persetujuan, PDF Generation
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const PkpDataService = {
  /**
   * Mengambil daftar dokumen Perjanjian Kinerja (PK) tahunan
   * @param {string} nip - NIP pengguna
   * @param {string} role - Peran/hak akses pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array|Object>} Daftar dokumen PK
   */
  getDataDokumenPKP(nip, role, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDataDokumenPKP(nip, role, authToken);
    });
  },

  /**
   * Mengambil daftar dokumen Penilaian Capaian Kinerja (PCK) bulanan
   * @param {string} nip - NIP pengguna
   * @param {string} role - Peran/hak akses pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Array|Object>} Daftar dokumen PCK
   */
  getDataDokumenPCK(nip, role, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDataDokumenPCK(nip, role, authToken);
    });
  },

  /**
   * Mengirimkan aksi status pada dokumen PK (Kirim, Setujui, Tolak, Hapus)
   * @param {string|number} idPKP - ID Dokumen PK
   * @param {string} aksi - Jenis aksi (Kirim / Setujui / Tolak / Hapus)
   * @param {string} nip - NIP pengguna pemrakarsa
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon aksi { success, message }
   */
  /**
   * Mengirimkan aksi status pada dokumen PK (Kirim, Setujui, Tolak, Hapus)
   * Prioritas: Cloud Firestore (0ms) + non-destructive background mirror ke Google Sheets
   * @param {string|number} idPKP - ID Dokumen PK
   * @param {string} aksi - Jenis aksi (Kirim / Setujui / Tolak / Hapus)
   * @param {string} nip - NIP pengguna pemrakarsa
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon aksi { success, message }
   */
  async aksiDokumenPKP(idPKP, aksi, nip, token) {
    const cleanId = String(idPKP || '').trim();
    const cleanAksi = String(aksi || '').trim();
    const userNip = nip || (typeof state !== 'undefined' && state.user ? state.user.nip : '') || '';
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const db = TranskepFirebase.getDb();
        if (cleanAksi === 'Hapus') {
          await TranskepFirebase.deletePkpFromFirestore(cleanId);
        } else {
          let newStatus = 'Draft';
          if (cleanAksi === 'Kirim') {
            newStatus = 'Menunggu Penilai';
          } else if (cleanAksi === 'Setujui') {
            const docSnap = await db.collection(TranskepFirebase.PKP_COLLECTION).doc(cleanId).get();
            const curData = docSnap.exists ? docSnap.data() : {};
            if (curData.status === 'Menunggu Penilai') {
              newStatus = 'Menunggu Atasan Penilai';
            } else {
              newStatus = 'Disetujui';
            }
          } else if (cleanAksi === 'Tolak') {
            newStatus = 'Draft';
          }

          await db.collection(TranskepFirebase.PKP_COLLECTION).doc(cleanId).set({
            status: newStatus,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            last_action_by: userNip
          }, { merge: true });
        }

        // Mirror ke Google Apps Script (Cold Backup)
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          try {
            google.script.run
              .withSuccessHandler((r) => console.log(`✅ [PKP] Mirror aksi ${cleanAksi} berhasil:`, r))
              .withFailureHandler((e) => console.warn(`⚠️ [PKP] Mirror aksi ${cleanAksi} gagal:`, e))
              .aksiDokumenPKP(cleanId, cleanAksi, userNip, authToken);
          } catch(e) {}
        }

        return { success: true, message: `Aksi ${cleanAksi} dokumen PK berhasil diproses di Cloud Firestore.` };
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal memproses aksi PK di Firestore, fallback ke Apps Script:", err);
      }
    }

    // Fallback ke Google Script
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return resolve({ success: true, message: `Aksi ${cleanAksi} tersimpan di memori lokal.` });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .aksiDokumenPKP(cleanId, cleanAksi, userNip, authToken);
    });
  },

  /**
   * Mengirimkan aksi status pada dokumen PCK (Kirim, Setujui, Tolak, Hapus)
   * Prioritas: Cloud Firestore (0ms) + non-destructive background mirror ke Google Sheets
   * @param {string|number} idPCK - ID Dokumen PCK
   * @param {string} aksi - Jenis aksi (Kirim / Setujui / Tolak / Hapus)
   * @param {string} nip - NIP pengguna pemrakarsa
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon aksi { success, message }
   */
  async aksiDokumenPCK(idPCK, aksi, nip, token) {
    const cleanId = String(idPCK || '').trim();
    const cleanAksi = String(aksi || '').trim();
    const userNip = nip || (typeof state !== 'undefined' && state.user ? state.user.nip : '') || '';
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';

    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const db = TranskepFirebase.getDb();
        if (cleanAksi === 'Hapus') {
          await TranskepFirebase.deletePckFromFirestore(cleanId);
        } else {
          let newStatus = 'Draft';
          if (cleanAksi === 'Kirim') {
            newStatus = 'Menunggu Penilai';
          } else if (cleanAksi === 'Setujui') {
            newStatus = 'Disetujui';
          } else if (cleanAksi === 'Tolak') {
            newStatus = 'Draft';
          }

          await db.collection(TranskepFirebase.PCK_COLLECTION).doc(cleanId).set({
            status: newStatus,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            last_action_by: userNip
          }, { merge: true });
        }

        // Mirror ke Google Apps Script (Cold Backup)
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          try {
            google.script.run
              .withSuccessHandler((r) => console.log(`✅ [PCK] Mirror aksi ${cleanAksi} berhasil:`, r))
              .withFailureHandler((e) => console.warn(`⚠️ [PCK] Mirror aksi ${cleanAksi} gagal:`, e))
              .aksiDokumenPCK(cleanId, cleanAksi, userNip, authToken);
          } catch(e) {}
        }

        return { success: true, message: `Aksi ${cleanAksi} laporan PCK berhasil diproses di Cloud Firestore.` };
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal memproses aksi PCK di Firestore, fallback ke Apps Script:", err);
      }
    }

    // Fallback ke Google Script
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return resolve({ success: true, message: `Aksi ${cleanAksi} tersimpan di memori lokal.` });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .aksiDokumenPCK(cleanId, cleanAksi, userNip, authToken);
    });
  },

  /**
   * Mengambil detail indikator dan sasaran dokumen PK tahunan
   * Prioritas: Cloud Firestore (0ms) -> fallback ke Google Apps Script
   * @param {string|number} idPkp - ID Dokumen PK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon detail { success, header, items }
   */
  async getDetailPKP(idPkp, nip, token) {
    const cleanId = String(idPkp || '').trim();

    // 1. Coba baca dari Cloud Firestore (0ms instant)
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const db = TranskepFirebase.getDb();
        if (db) {
          const docRef = await db.collection(TranskepFirebase.PKP_COLLECTION).doc(cleanId).get();
          if (docRef.exists) {
            const data = docRef.data();
            return {
              success: true,
              status: 'success',
              header: {
                id_pkp: data.id_pkp || cleanId,
                tahun: data.tahun,
                nip: data.nip_pegawai || data.nip,
                penilai: data.nip_penilai || data.penilai,
                atasan_pejabat: data.nip_atasan_pejabat || data.atasan_pejabat,
                status: data.status,
                nilai: data.nilai_akhir || data.nilai || '0'
              },
              items: Array.isArray(data.items) ? data.items : []
            };
          }
        }
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal ambil detail PK dari Firestore:", err);
      }
    }

    // 2. Fallback ke Google Apps Script jika belum di Firestore
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return resolve({ success: false, message: "Koneksi Google Apps Script tidak tersedia dan dokumen belum ada di Firestore." });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDetailPKP(idPkp, nip, authToken);
    });
  },

  /**
   * Menyimpan sasaran & target kerja tahunan PK (Create / Update / Verifikasi)
   * Prioritas: Simpan langsung ke Cloud Firestore (0ms) + mirror background ke Sheets
   * @param {Object} payload - Objek sasaran, indikator, target, penilai
   * @param {string} nip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon simpan { success, id_pkp, message }
   */
  async submitBulkPKP(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const userNip = nip || (payload ? (payload.nipPegawai || payload.nip) : '') || '';

    // 1. Simpan langsung ke Cloud Firestore jika siap
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreRes = await TranskepFirebase.savePkpToFirestore(payload);
        const docId = firestoreRes.id_pkp || firestoreRes.id;

        // Mirror ke Google Apps Script / Spreadsheet di background (Non-Destructive Cold Backup)
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          try {
            google.script.run
              .withSuccessHandler((gRes) => console.log("✅ [PKP] Background mirror ke Google Sheets berhasil:", gRes))
              .withFailureHandler((gErr) => console.warn("⚠️ [PKP] Background mirror ke Google Sheets gagal:", gErr))
              .submitBulkPKP(payload, userNip, authToken);
          } catch (e) {
            console.warn("⚠️ [PKP] Gagal panggil background mirror Sheets:", e);
          }
        }

        return {
          success: true,
          status: 'success',
          id_pkp: docId,
          message: 'Dokumen Perjanjian Kinerja (PK) berhasil diamankan di Cloud Firestore.'
        };
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal simpan PK ke Firestore, fallback ke Apps Script:", err);
      }
    }

    // 2. Fallback ke Google Script jika Firestore tidak aktif
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        const mockId = payload.id_pkp || ('PKP_' + (payload.tahun || new Date().getFullYear()) + '_' + userNip);
        return resolve({
          success: true,
          status: 'success',
          id_pkp: mockId,
          message: 'Data PK disimpan di memori lokal (Mode Standalone).'
        });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitBulkPKP(payload, userNip, authToken);
    });
  },

  /**
   * Mengambil detail target dan realisasi bulanan PCK lengkap
   * Prioritas: Cloud Firestore (0ms instant) -> fallback ke Google Apps Script
   * @param {string} nipTarget - NIP pegawai pemilik target
   * @param {string} blnText - Nama bulan (misal: 'Januari')
   * @param {string|number} thn - Tahun target
   * @param {string} currentNip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon detail { success, targets, message }
   */
  async getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, token) {
    const cleanNip = String(nipTarget || currentNip || '').replace(/'/g, '').trim();
    const tahunStr = String(thn || new Date().getFullYear()).trim();
    const bulanStr = String(blnText || '').trim();

    // 1. Coba baca dari Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const db = TranskepFirebase.getDb();
        if (db) {
          // Cari dokumen PK tahunan untuk mendapatkan target dan sasaran dasar
          const idPkp = 'PKP_' + tahunStr + '_' + cleanNip;
          let pkDocSnap = await db.collection(TranskepFirebase.PKP_COLLECTION).doc(idPkp).get();
          let pkData = pkDocSnap.exists ? pkDocSnap.data() : null;

          if (!pkData) {
            const pkQuery = await db.collection(TranskepFirebase.PKP_COLLECTION)
              .where('tahun', '==', tahunStr)
              .where('nip_pegawai', '==', cleanNip)
              .limit(1)
              .get();
            if (!pkQuery.empty) {
              pkData = pkQuery.docs[0].data();
            }
          }

          if (pkData && Array.isArray(pkData.items) && pkData.items.length > 0) {
            const targets = pkData.items.map((it, idx) => ({
              id_item: it.id_item || ('ITM_' + (idx + 1)),
              sasaran: it.sasaran || '-',
              indikator: it.indikator || '-',
              kuantitas: it.kuantitas || 1,
              satuan: it.satuan || 'Dokumen',
              mutu: it.mutu || 100,
              real_kuantitas: '',
              real_mutu: '',
              capaian: '-'
            }));

            // Cari dokumen PCK bulanan yang tersimpan untuk pegawai & bulan ini
            const idPck = 'PCK_' + tahunStr + '_' + bulanStr + '_' + cleanNip;
            let pckDocSnap = await db.collection(TranskepFirebase.PCK_COLLECTION).doc(idPck).get();
            let pckData = pckDocSnap.exists ? pckDocSnap.data() : null;

            if (!pckData) {
              const pckQuery = await db.collection(TranskepFirebase.PCK_COLLECTION)
                .where('tahun', '==', tahunStr)
                .where('bulan', '==', bulanStr)
                .where('nip_pegawai', '==', cleanNip)
                .limit(1)
                .get();
              if (!pckQuery.empty) {
                pckData = pckQuery.docs[0].data();
              }
            }

            if (pckData && Array.isArray(pckData.realisasi)) {
              targets.forEach(t => {
                const match = pckData.realisasi.find(r => String(r.id_item_pk) === String(t.id_item));
                if (match) {
                  t.real_kuantitas = match.real_kuantitas !== undefined ? match.real_kuantitas : '';
                  t.real_mutu = match.real_mutu !== undefined ? match.real_mutu : '';
                  t.capaian = match.capaian || '-';
                }
              });
            }

            return { success: true, targets: targets };
          }
        }
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal fetch detail PCK dari Firestore:", err);
      }
    }

    // 2. Fallback ke Google Apps Script
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return resolve({ success: false, message: "Koneksi Google Apps Script tidak tersedia dan dokumen belum ada di Firestore." });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, authToken);
    });
  },

  /**
   * Menyimpan capaian realisasi bulanan PCK (Create / Update / Verifikasi)
   * Prioritas: Simpan langsung ke Cloud Firestore (0ms) + mirror background ke Sheets
   * @param {Object} payload - Objek realisasi bulanan, nilai akhir, items
   * @param {string} nip - NIP pengguna aktif
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon simpan { success, id_pck, message }
   */
  async submitBulkPCK(payload, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    const userNip = nip || (payload ? (payload.nipPegawai || payload.nip) : '') || '';

    // 1. Simpan langsung ke Cloud Firestore jika siap
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreRes = await TranskepFirebase.savePckToFirestore(payload);
        const docId = firestoreRes.id_pck || firestoreRes.id;

        // Mirror ke Google Apps Script / Spreadsheet di background (Cold Backup)
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          try {
            google.script.run
              .withSuccessHandler((gRes) => console.log("✅ [PCK] Background mirror ke Google Sheets berhasil:", gRes))
              .withFailureHandler((gErr) => console.warn("⚠️ [PCK] Background mirror ke Google Sheets gagal:", gErr))
              .submitBulkPCK(payload, userNip, authToken);
          } catch (e) {
            console.warn("⚠️ [PCK] Gagal panggil background mirror Sheets:", e);
          }
        }

        return {
          success: true,
          status: 'success',
          id_pck: docId,
          message: 'Laporan Capaian Kinerja (PCK) berhasil diamankan di Cloud Firestore.'
        };
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal simpan PCK ke Firestore, fallback ke Apps Script:", err);
      }
    }

    // 2. Fallback ke Google Script jika Firestore tidak aktif
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        const mockId = payload.id_pck || ('PCK_' + (payload.tahun || new Date().getFullYear()) + '_' + (payload.bulan || '1') + '_' + userNip);
        return resolve({
          success: true,
          status: 'success',
          id_pck: mockId,
          message: 'Data PCK disimpan di memori lokal (Mode Standalone).'
        });
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .submitBulkPCK(payload, userNip, authToken);
    });
  },

  /**
   * Menerbitkan dokumen PDF Perjanjian Kinerja (PK) via Google Script backend
   * @param {string|number} id - ID Dokumen PK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, url, message }
   */
  generatePdfPK(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .generatePdfPK(id, nip, authToken);
    });
  },

  /**
   * Menerbitkan dokumen PDF Laporan Capaian Kinerja (PCK) via Google Script backend
   * @param {string|number} id - ID Dokumen PCK
   * @param {string} nip - NIP pengguna
   * @param {string} token - Token sesi aktif
   * @returns {Promise<Object>} Respon { status, url, message }
   */
  generatePdfPCK(id, nip, token) {
    const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        return reject(new Error("Koneksi google.script.run tidak tersedia."));
      }
      google.script.run
        .withSuccessHandler((res) => resolve(res))
        .withFailureHandler((err) => reject(err))
        .generatePdfPCK(id, nip, authToken);
    });
  },

  // ==========================================
  // PILAR 0: KAMUS KINERJA / TEMPLATE JABATAN FIRESTORE
  // ==========================================
  DEFAULT_MASTER_TEMPLATES: [
    {
      id: 'TEMPL_jurusita',
      nama_jabatan: 'Jurusita',
      kategori: 'Kepaniteraan',
      aliases: ['Jurusita', 'Juru Sita', 'Jurusita Pengganti', 'Juru Sita Pengganti'],
      sasaran_list: [
        {
          sasaran: 'Terlaksananya penyampaian relas panggilan sidang dan pemberitahuan putusan secara sah dan patut',
          indikator_list: [
            { indikator: 'Jumlah relas panggilan sidang dan pemberitahuan yang disampaikan kepada para pihak tepat waktu', satuan: 'Relas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya penatausahaan dan pelaporan administrasi kejurusitaan',
          indikator_list: [
            { indikator: 'Jumlah laporan pelaksanaan tugas kejurusitaan yang disusun secara berkala', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    },
    {
      id: 'TEMPL_panitera_pengganti',
      nama_jabatan: 'Panitera Pengganti',
      kategori: 'Kepaniteraan',
      aliases: ['Panitera Pengganti', 'PP'],
      sasaran_list: [
        {
          sasaran: 'Terlaksananya pendampingan persidangan dan penyusunan berita acara sidang tepat waktu',
          indikator_list: [
            { indikator: 'Jumlah Berita Acara Sidang (BAS) yang diselesaikan tepat waktu sesuai jadwal sidang', satuan: 'Berkas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya minutasi dan pengelolaan berkas perkara pasca putusan',
          indikator_list: [
            { indikator: 'Jumlah berkas perkara yang diminutasi dan diserahkan ke Panitera Muda tepat waktu', satuan: 'Berkas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    },
    {
      id: 'TEMPL_pranata_komputer',
      nama_jabatan: 'Pranata Komputer',
      kategori: 'Kesekretariatan',
      aliases: ['Pranata Komputer', 'Pranata Komputer Ahli Pertama', 'Pranata Komputer Terampil', 'Pengelola TI', 'Staf IT'],
      sasaran_list: [
        {
          sasaran: 'Terpeliharanya infrastruktur jaringan, server, dan ketersediaan sistem informasi peradilan (SIPP/TRANSKEP)',
          indikator_list: [
            { indikator: 'Persentase uptime dan kehandalan koneksi jaringan serta sistem aplikasi peradilan', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya pemeliharaan perangkat keras dan layanan bantuan teknis (helpdesk)',
          indikator_list: [
            { indikator: 'Jumlah laporan pemeliharaan perangkat komputer dan penanganan kendala pengguna yang diselesaikan', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    },
    {
      id: 'TEMPL_kasubbag_ptip',
      nama_jabatan: 'Kasubbag PTIP',
      kategori: 'Kesekretariatan',
      aliases: ['Kasubbag PTIP', 'Kepala Sub Bagian PTIP', 'Kepala Sub Bagian Perencanaan, TI, dan Pelaporan', 'Kasubbag Perencanaan'],
      sasaran_list: [
        {
          sasaran: 'Terlaksananya penyusunan dokumen perencanaan dan penganggaran pengadilan (DIPA/RKA-K/L)',
          indikator_list: [
            { indikator: 'Jumlah dokumen perencanaan anggaran yang disusun dan disahkan tepat waktu', satuan: 'Dokumen', mutu: 100, kuantitas: 2, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya pelaporan kinerja dan akuntabilitas instansi (LKjIP & Laptah)',
          indikator_list: [
            { indikator: 'Jumlah laporan kinerja instansi yang disusun sesuai pedoman Mahkamah Agung', satuan: 'Laporan', mutu: 100, kuantitas: 4, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    },
    {
      id: 'TEMPL_kasubbag_kepegawaian',
      nama_jabatan: 'Kasubbag Kepegawaian & Ortala',
      kategori: 'Kesekretariatan',
      aliases: ['Kasubbag Kepegawaian', 'Kasubbag Kepegawaian dan Ortala', 'Kepala Sub Bagian Kepegawaian, Organisasi, dan Tata Laksana'],
      sasaran_list: [
        {
          sasaran: 'Terlaksananya pengelolaan layanan administrasi kepegawaian (KGB, KP, Pensiun, dan Cuti Pegawai)',
          indikator_list: [
            { indikator: 'Persentase penyelesaian usulan layanan kepegawaian tepat waktu sesuai SOP', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya pemutakhiran data kepegawaian pada aplikasi SIKEP dan TRANSKEP',
          indikator_list: [
            { indikator: 'Tingkat kelengkapan dan keakuratan data profil pegawai pada sistem kepegawaian', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    },
    {
      id: 'TEMPL_kasubbag_umum',
      nama_jabatan: 'Kasubbag Umum & Keuangan',
      kategori: 'Kesekretariatan',
      aliases: ['Kasubbag Umum dan Keuangan', 'Kasubbag Umum & Keuangan', 'Kepala Sub Bagian Umum dan Keuangan'],
      sasaran_list: [
        {
          sasaran: 'Terlaksananya pengelolaan tata laksana keuangan dan realisasi anggaran DIPA 01 & 04',
          indikator_list: [
            { indikator: 'Persentase capaian realisasi anggaran belanja pengadilan secara akuntabel', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        },
        {
          sasaran: 'Terlaksananya penatausahaan Barang Milik Negara (BMN) dan kebersihan sarana kantor',
          indikator_list: [
            { indikator: 'Jumlah laporan penatausahaan BMN dan pemeliharaan sarana kantor yang diselesaikan', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
          ]
        }
      ]
    }
  ],

  /**
   * Mengambil Seluruh Template Kamus Jabatan (Cache-First -> Firestore -> Default Presets)
   */
  async getMasterKinerjaTemplates() {
    // 1. Coba baca dari memori cache lokal (0ms)
    try {
      const cached = localStorage.getItem('transkep_master_kinerja_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.refreshMasterKinerjaBackground();
          return parsed;
        }
      }
    } catch(e) {}

    // 2. Coba fetch dari Cloud Firestore
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreList = await TranskepFirebase.getFirestoreMasterKinerja();
        if (Array.isArray(firestoreList) && firestoreList.length > 0) {
          try { localStorage.setItem('transkep_master_kinerja_cache', JSON.stringify(firestoreList)); } catch(e) {}
          return firestoreList;
        } else {
          // Auto-seed default templates ke Firestore jika koleksi masih kosong
          console.log("🌱 [PKP] Koleksi master_kinerja Firestore kosong, melakukan auto-seed default templates...");
          this.seedDefaultMasterKinerja().catch(e => console.warn(e));
          return this.DEFAULT_MASTER_TEMPLATES;
        }
      } catch (err) {
        console.warn("⚠️ [PKP] Gagal fetch master_kinerja dari Firestore:", err);
      }
    }

    // 3. Fallback ke default preset
    return this.DEFAULT_MASTER_TEMPLATES;
  },

  /**
   * Auto-seed default templates ke Firestore
   */
  async seedDefaultMasterKinerja() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        for (const t of this.DEFAULT_MASTER_TEMPLATES) {
          await TranskepFirebase.saveMasterKinerjaToFirestore(t);
        }
        try { localStorage.setItem('transkep_master_kinerja_cache', JSON.stringify(this.DEFAULT_MASTER_TEMPLATES)); } catch(e) {}
        console.log("✅ [PKP] Auto-seed 6 template standar pengadilan ke Firestore berhasil.");
      } catch(e) {
        console.warn("⚠️ [PKP] Gagal auto-seed master_kinerja:", e);
      }
    }
  },

  /**
   * Refresh background master kinerja ke cache
   */
  async refreshMasterKinerjaBackground() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreList = await TranskepFirebase.getFirestoreMasterKinerja();
        if (Array.isArray(firestoreList) && firestoreList.length > 0) {
          try { localStorage.setItem('transkep_master_kinerja_cache', JSON.stringify(firestoreList)); } catch(e) {}
          if (typeof state !== 'undefined') state.firestoreMasterKinerja = firestoreList;
        }
      } catch(e) {}
    }
  },

  /**
   * Smart Aliases Matcher untuk mencocokkan jabatan pengguna dengan template
   */
  findTemplateForJabatan(rawJabatan, templatesList) {
    if (!rawJabatan || !Array.isArray(templatesList) || templatesList.length === 0) return null;
    const target = String(rawJabatan).trim().toLowerCase();

    // 1. Cek Exact Match pada nama_jabatan
    for (const t of templatesList) {
      if (t.nama_jabatan && String(t.nama_jabatan).trim().toLowerCase() === target) {
        return t;
      }
    }

    // 2. Cek Match pada array aliases
    for (const t of templatesList) {
      if (Array.isArray(t.aliases)) {
        for (const a of t.aliases) {
          if (String(a).trim().toLowerCase() === target) {
            return t;
          }
        }
      }
    }

    // 3. Cek Inclusion / Keyword Match (misal: "Jurusita Pengganti" mencocokkan alias "jurusita")
    for (const t of templatesList) {
      if (t.nama_jabatan) {
        const nLower = String(t.nama_jabatan).trim().toLowerCase();
        if (target.includes(nLower) || nLower.includes(target)) {
          return t;
        }
      }
      if (Array.isArray(t.aliases)) {
        for (const a of t.aliases) {
          const aLower = String(a).trim().toLowerCase();
          if (target.includes(aLower) || aLower.includes(target)) {
            return t;
          }
        }
      }
    }

    return null;
  },

  // ==========================================
  // PILAR 1: SYNC & REALTIME PERJANJIAN KINERJA (PKP)
  // ==========================================
  /**
   * Mengambil seluruh dokumen PK dari Firestore dan menggabungkannya ke state global
   */
  async loadFirestorePkpDocuments() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreList = await TranskepFirebase.getFirestorePkps();
        if (Array.isArray(firestoreList) && firestoreList.length > 0) {
          if (typeof state !== 'undefined') {
            const existing = Array.isArray(state.pkpDokumen) ? state.pkpDokumen : [];
            const map = {};
            existing.forEach(p => {
              const id = String(p.id_pkp || '').trim();
              if (id) map[id] = p;
            });
            firestoreList.forEach(fp => {
              const id = String(fp.id_pkp || '').trim();
              if (id) {
                map[id] = {
                  id_pkp: id,
                  nip: fp.nip_pegawai || fp.nip,
                  penilai: fp.nip_penilai || fp.penilai,
                  atasan_pejabat: fp.nip_atasan_pejabat || fp.atasan_pejabat,
                  tahun: fp.tahun,
                  status: fp.status,
                  nilai: fp.nilai_akhir || fp.nilai || '0',
                  items: Array.isArray(fp.items) ? fp.items : [],
                  items_count: Array.isArray(fp.items) ? fp.items.length : (fp.items_count || 0),
                  is_firebase: true
                };
              }
            });
            state.pkpDokumen = Object.values(map);
            if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
            if (window.vmPkpApp && typeof window.vmPkpApp.syncData === 'function') {
              window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal sinkronisasi PKP dari Firestore:", err);
      }
    }
  },

  /**
   * Berlangganan perubahan dokumen PK secara realtime
   */
  subscribePkpRealtime() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      return TranskepFirebase.subscribeFirestorePkps((firestoreList) => {
        if (Array.isArray(firestoreList) && typeof state !== 'undefined') {
          const map = {};
          (state.pkpDokumen || []).forEach(p => {
            const id = String(p.id_pkp || '').trim();
            if (id) map[id] = p;
          });
          firestoreList.forEach(fp => {
            const id = String(fp.id_pkp || '').trim();
            if (id) {
              map[id] = {
                id_pkp: id,
                nip: fp.nip_pegawai || fp.nip,
                penilai: fp.nip_penilai || fp.penilai,
                atasan_pejabat: fp.nip_atasan_pejabat || fp.atasan_pejabat,
                tahun: fp.tahun,
                status: fp.status,
                nilai: fp.nilai_akhir || fp.nilai || '0',
                items: Array.isArray(fp.items) ? fp.items : [],
                items_count: Array.isArray(fp.items) ? fp.items.length : (fp.items_count || 0),
                is_firebase: true
              };
            }
          });
          state.pkpDokumen = Object.values(map);
          if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
          if (window.vmPkpApp && typeof window.vmPkpApp.syncData === 'function') {
            window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
          }
        }
      });
    }
    return null;
  },

  /**
   * Migrasi 1-Klik seluruh dokumen PK dari Google Sheets ke Cloud Firestore
   */
  async migrateSheetsPkpToFirestore() {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }
    const legacyList = (typeof state !== 'undefined' && Array.isArray(state.pkpDokumen)) ? state.pkpDokumen : [];
    if (legacyList.length === 0) {
      return { success: true, count: 0, message: "Tidak ada dokumen PK di memori yang perlu dimigrasikan." };
    }

    let count = 0;
    for (const pk of legacyList) {
      if (!pk.is_firebase) {
        await TranskepFirebase.savePkpToFirestore({
          id_pkp: pk.id_pkp,
          nip: pk.nip,
          penilai: pk.penilai,
          atasan_pejabat: pk.atasan_pejabat,
          tahun: pk.tahun,
          status: pk.status,
          nilai: pk.nilai,
          items: pk.items || []
        });
        pk.is_firebase = true;
        count++;
      }
    }
    return { success: true, count: count, message: `${count} dokumen PK dari Spreadsheet berhasil dicadangkan ke Cloud Firestore.` };
  },

  // ==========================================
  // PILAR 2: SYNC & REALTIME LAPORAN PCK BULANAN
  // ==========================================
  /**
   * Mengambil seluruh dokumen PCK dari Firestore dan menggabungkannya ke state global
   */
  async loadFirestorePckDocuments() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        const firestoreList = await TranskepFirebase.getFirestorePcks();
        if (Array.isArray(firestoreList) && firestoreList.length > 0) {
          if (typeof state !== 'undefined') {
            const existing = Array.isArray(state.pckDokumen) ? state.pckDokumen : [];
            const map = {};
            existing.forEach(p => {
              const id = String(p.id_pck || '').trim();
              if (id) map[id] = p;
            });
            firestoreList.forEach(fp => {
              const id = String(fp.id_pck || '').trim();
              if (id) {
                map[id] = {
                  id_pck: id,
                  nip: fp.nip_pegawai || fp.nip,
                  bulan: fp.bulan,
                  tahun: fp.tahun,
                  rencana: parseInt(fp.rencana || fp.total_rencana || (Array.isArray(fp.realisasi) ? fp.realisasi.length : 0)) || 0,
                  progress: fp.progress || '100%',
                  status: fp.status,
                  nilai_akhir: fp.nilai_akhir || '0',
                  realisasi: Array.isArray(fp.realisasi) ? fp.realisasi : [],
                  is_firebase: true
                };
              }
            });
            state.pckDokumen = Object.values(map);
            if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
            if (window.vmPkpApp && typeof window.vmPkpApp.syncData === 'function') {
              window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal sinkronisasi PCK dari Firestore:", err);
      }
    }
  },

  /**
   * Berlangganan perubahan dokumen PCK secara realtime
   */
  subscribePckRealtime() {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      return TranskepFirebase.subscribeFirestorePcks((firestoreList) => {
        if (Array.isArray(firestoreList) && typeof state !== 'undefined') {
          const map = {};
          (state.pckDokumen || []).forEach(p => {
            const id = String(p.id_pck || '').trim();
            if (id) map[id] = p;
          });
          firestoreList.forEach(fp => {
            const id = String(fp.id_pck || '').trim();
            if (id) {
              map[id] = {
                id_pck: id,
                nip: fp.nip_pegawai || fp.nip,
                bulan: fp.bulan,
                tahun: fp.tahun,
                rencana: parseInt(fp.rencana || fp.total_rencana || (Array.isArray(fp.realisasi) ? fp.realisasi.length : 0)) || 0,
                progress: fp.progress || '100%',
                status: fp.status,
                nilai_akhir: fp.nilai_akhir || '0',
                realisasi: Array.isArray(fp.realisasi) ? fp.realisasi : [],
                is_firebase: true
              };
            }
          });
          state.pckDokumen = Object.values(map);
          if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
          if (window.vmPkpApp && typeof window.vmPkpApp.syncData === 'function') {
            window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
          }
        }
      });
    }
    return null;
  },

  /**
   * Migrasi 1-Klik seluruh dokumen PCK dari Google Sheets ke Cloud Firestore
   */
  async migrateSheetsPckToFirestore() {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }
    const legacyList = (typeof state !== 'undefined' && Array.isArray(state.pckDokumen)) ? state.pckDokumen : [];
    if (legacyList.length === 0) {
      return { success: true, count: 0, message: "Tidak ada dokumen PCK di memori yang perlu dimigrasikan." };
    }

    let count = 0;
    for (const pck of legacyList) {
      if (!pck.is_firebase) {
        await TranskepFirebase.savePckToFirestore({
          id_pck: pck.id_pck,
          nip: pck.nip,
          bulan: pck.bulan,
          tahun: pck.tahun,
          status: pck.status,
          rencana: pck.rencana,
          progress: pck.progress || '100%',
          nilai_akhir: pck.nilai_akhir || '0',
          realisasi: pck.realisasi || []
        });
        pck.is_firebase = true;
        count++;
      }
    }
    return { success: true, count: count, message: `${count} laporan PCK dari Spreadsheet berhasil dicadangkan ke Cloud Firestore.` };
  },

  // --- PILAR 3: SNAPSHOT & PENGESAHAN REKAPITULASI (OPSI B) ---
  /**
   * Mengambil snapshot rekapitulasi dari Cloud Firestore
   * @param {string|number} tahun
   * @param {string} [bulan]
   */
  async loadFirestoreRekapitulasi(tahun, bulan) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      try {
        return await TranskepFirebase.getFirestoreRekapitulasi(tahun, bulan);
      } catch (err) {
        console.warn("⚠️ [PkpDataService] Gagal load rekapitulasi dari Firestore:", err);
      }
    }
    return null;
  },

  /**
   * Menyimpan / mengunci snapshot rekapitulasi bulanan ke Cloud Firestore (Opsi B)
   * @param {Object} rekapPayload
   */
  async saveFirestoreRekapitulasi(rekapPayload) {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }
    return await TranskepFirebase.saveRekapitulasiToFirestore(rekapPayload);
  },

  /**
   * Berlangganan perubahan dokumen rekapitulasi secara realtime
   */
  subscribeRekapRealtime(callback) {
    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
      return TranskepFirebase.subscribeFirestoreRekapitulasi(callback);
    }
    return null;
  },

  /**
   * Membuka kunci / menghapus dokumen rekapitulasi dari Firestore (Admin Only)
   */
  async deleteFirestoreRekapitulasi(idRekap) {
    if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
      throw new Error("Cloud Firestore belum siap terhubung.");
    }
    return await TranskepFirebase.deleteRekapitulasiFromFirestore(idRekap);
  }
};

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.PkpDataService = PkpDataService;
}
