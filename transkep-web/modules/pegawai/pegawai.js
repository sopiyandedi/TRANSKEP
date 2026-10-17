// ==========================================
// FILE: pegawai.js (TRANSKEP Modular)
// ENGINE: ZettBOT Core v1.0.0
// ==========================================

// --- Source: pegawai/js_manajemen_pegawai.html ---
// ==========================================
  // ZETTBOT: VUE JS COMPONENT - MODUL PEGAWAI
  // ==========================================

  document.addEventListener("DOMContentLoaded", () => {
    window.vmPegawai = Vue.createApp({
      data() {
        return {
          searchPegawai: "",
          expandedPegawai: [],
          visiblePasswords: [],
          showModalPegawai: false,
          modalPegMode: 'add',
          formPegawai: this.getEmptyForm(),
          showModalAntrean: false,
          antreanResetList: [],
          hierarkiJabatan: [
            "Ketua", "Wakil Ketua", "Hakim Utama Muda", "Panitera", "Sekretaris",
            "Panitera Muda Gugatan", "Panitera Muda Permohonan", "Panitera Muda Hukum",
            "Kepala Sub Bagian Umum dan Keuangan", "Kepala Sub Bagian Kepegawaian, ORTALA",
            "Kepala Sub Bagian Perencanaan, TI dan Pelaporan", "Panitera Pengganti",
            "Juru Sita", "Juru Sita Pengganti", "Pranata Komputer Ahli Pertama",
            "Operator - Penata Layanan Operasional", "Arsiparis Terampil",
            "Klerek - Analis Perkara Peradilan", "Klerek - Pengelola Penanganan Perkara",
            "Klerek - Pengolah Data dan Informasi", "Penata Layanan Operasional",
            "Pengelola Layanan Operasional", "Operator Layanan Operasional"
          ]
        };
      },
      computed: {
        // Menyambungkan data Vue dengan state global aplikasi
        usersList() {
          return window.vueState ? window.vueState.usersList : [];
        },
        currentUser() {
          return window.vueState ? window.vueState.user : null;
        },
        filteredUsers() {
          let users = this.usersList.slice() || [];
          
          // Sorting
          users.sort((a, b) => this.getBobotJabatan(a.jabatan) - this.getBobotJabatan(b.jabatan));

          // Filtering
          if (this.searchPegawai.trim() !== "") {
            const keyword = this.searchPegawai.toLowerCase();
            users = users.filter(u => 
              (u.nama && u.nama.toLowerCase().includes(keyword)) ||
              (u.nip && u.nip.toLowerCase().includes(keyword)) ||
              (u.jabatan && u.jabatan.toLowerCase().includes(keyword))
            );
          }
          return users;
        }
      },

      // ==========================================
      // TAMBAHKAN BLOK WATCH INI BRO
      // ==========================================
      watch: {
        // Vue akan "mengawasi" setiap kali Anda mengetik di input pencarian
        searchPegawai(newValue) {
          // Tutup semua baris detail yang sedang terbuka
          this.expandedPegawai = [];
          
          // Tutup juga semua password yang sedang di-intip (opsional, untuk keamanan)
          this.visiblePasswords = [];
        }
      },
      // ==========================================

      methods: {
        getEmptyForm() {
          return {
            originalNip: "", nip: "", nama: "", jabatan: "", jenis_jabatan: "Fungsional Umum",
            pangkat: "", role: "Pegawai", no_hp: "", pass: "", alamat: "",
            s_tahunan_2024: 0, s_tahunan_2025: 0, s_tahunan_2026: 12, s_sakit: 30,
            s_penting: 15, s_besar: 90, s_melahirkan: 90, s_cltn: 0, tmt_kgb: "", tmt_knp: "", bup: 58
          };
        },
        getBobotJabatan(jabatan) {
          if (!jabatan) return 999;
          const index = this.hierarkiJabatan.findIndex(j => j.toLowerCase() === jabatan.toLowerCase().trim());
          return index !== -1 ? index : 999;
        },
        getRoleStyle(role) {
          if (role === 'Admin') return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
          if (role === 'Pejabat Berwenang') return "text-blue-400 bg-blue-500/10 border-blue-500/20";
          if (role === 'Atasan Langsung') return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
          if (role === 'Operator') return "text-amber-400 bg-amber-500/10 border-amber-500/20";
          return "text-slate-400 bg-slate-900 border-slate-800";
        },
        parseDateToHTML5(sheetDateStr) {
          if (!sheetDateStr) return "";
          if (sheetDateStr.includes('-') && sheetDateStr.split('-')[0].length === 4) return sheetDateStr;
          const parts = sheetDateStr.includes('/') ? sheetDateStr.split('/') : sheetDateStr.split('-');
          if (parts.length === 3) {
              let d = parts[0].padStart(2, '0');
              let m = parts[1].padStart(2, '0');
              let y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
              return `${y}-${m}-${d}`;
          }
          return "";
        },
        toggleDetail(nip) {
          const index = this.expandedPegawai.indexOf(nip);
          if (index === -1) {
             this.expandedPegawai.push(nip);
          } else {
             this.expandedPegawai.splice(index, 1);
             // Tutup mata password jika row ditutup
             const passIdx = this.visiblePasswords.indexOf(nip);
             if(passIdx !== -1) this.visiblePasswords.splice(passIdx, 1);
          }
        },
        togglePassword(nip) {
          const index = this.visiblePasswords.indexOf(nip);
          if (index === -1) this.visiblePasswords.push(nip);
          else this.visiblePasswords.splice(index, 1);
        },
        openPegawaiModal(mode, user = null) {
          this.modalPegMode = mode;
          if (mode === 'edit' && user) {
            this.formPegawai = { ...user, originalNip: user.nip };
            this.formPegawai.tmt_kgb = this.parseDateToHTML5(user.tmt_kgb);
            this.formPegawai.tmt_knp = this.parseDateToHTML5(user.tmt_knp);
          } else {
            this.formPegawai = this.getEmptyForm();
          }
          this.showModalPegawai = true;
        },
        closePegawaiModal() {
          this.showModalPegawai = false;
        },
        async submitPegawai() {
          const token = localStorage.getItem('transkep_session_token');
          if(window.showLoading) window.showLoading("Mencatat perubahan profil ke database...");
          const adminNip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');

          try {
            const res = await window.PegawaiDataService.savePegawai(this.formPegawai, this.modalPegMode, adminNip, token);
            if(window.hideLoading) window.hideLoading(); 
            this.closePegawaiModal();
            if (res && res.status === 'success') { 
              if(window.showNotify) window.showNotify("Profil Disimpan", res.message, "success"); 
              if(window.syncAllServerData) window.syncAllServerData(); 
            } else { 
              if(window.showNotify) window.showNotify("Gagal Menyimpan", res ? res.message : "Gagal menyimpan data", "error"); 
            }
          } catch (err) {
            if(window.hideLoading) window.hideLoading(); 
            this.closePegawaiModal(); 
            if(window.showNotify) window.showNotify("Error Sistem", err.toString(), "error"); 
          }
        },
        deletePegawaiRecord(user) {
          const token = localStorage.getItem('transkep_session_token');
          if(window.showCustomConfirm) {
             window.showCustomConfirm("Hapus Data Pegawai", `Hapus permanen akun PNS atas nama ${user.nama} (NIP: ${user.nip})? Tindakan ini tidak dapat dibatalkan.`, async () => {
                if(window.showLoading) window.showLoading("Mengeksekusi penghapusan pegawai...");
                const adminNip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
                try {
                  const res = await window.PegawaiDataService.deletePegawai(user.nip, adminNip, token);
                  if(window.hideLoading) window.hideLoading();
                  if (res && res.status === 'success') { 
                      if(window.showNotify) window.showNotify("Berhasil Dihapus", res.message, "success"); 
                      if(window.syncAllServerData) window.syncAllServerData(); 
                  } else { 
                      if(window.showNotify) window.showNotify("Gagal Hapus", res ? res.message : "Gagal menghapus pegawai", "error"); 
                  }
                } catch (err) {
                  if(window.hideLoading) window.hideLoading();
                  if(window.showNotify) window.showNotify("Error", err.toString(), "error");
                }
             });
          }
        },
        sendCredentialViaWA(user) {
          let sapaan = "Bapak/Ibu";
          let nipStr = String(user.nip).replace(/[^0-9]/g, '');
          if (nipStr.length === 18) {
              let digitKe15 = nipStr.substring(14, 15);
              if (digitKe15 === '1') sapaan = "Bapak";
              else if (digitKe15 === '2') sapaan = "Ibu";
          }
          let phone = String(user.no_hp || "").replace(/[^0-9]/g, ''); 
          if (phone.startsWith('0')) phone = '62' + phone.substring(1);
          if (!phone || phone.length < 9) { 
              if(window.showNotify) window.showNotify("Gagal Mengirim", "Pegawai tidak memiliki nomor WA.", "error"); 
              return; 
          }
          let displayPass = user.pass;
          if (displayPass && String(displayPass).startsWith('SHA256$')) {
              displayPass = "[Telah dienkripsi oleh Pegawai]";
          }
          const appUrl = "https://sites.google.com/view/transkepv2/transkep-v2-1";
          const msg = `*INFORMASI AKUN TRANSKEP* 🏢\nHalo ${sapaan} *${user.nama}*,\n\nBerikut kredensial login Anda:\n\n👤 *NIP / Username:* ${user.nip}\n🔑 *Kata Sandi:* ${displayPass}\n\n🔗 *Link Login:*\n${appUrl}`;
          window.open("https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(msg), '_blank');
        },
        exportPegawaiToExcel() {
          if (typeof XLSX === 'undefined') {
             if(window.showNotify) window.showNotify('Library Terblokir', 'Modul export excel gagal dimuat koneksi.', 'error');
             return;
          }
          const dataExport = this.usersList.map(u => ({
              'NIP': u.nip, 'Nama': u.nama, 'Jabatan': u.jabatan, 'Role': u.role, 'No_HP': u.no_hp, 'Password': u.pass,
              'Sisa_Tahunan_2024': u.s_tahunan_2024, 'Sisa_Tahunan_2025': u.s_tahunan_2025, 'Sisa_Tahunan_2026': u.s_tahunan_2026,
              'Sisa_Sakit': u.s_sakit, 'Sisa_Penting': u.s_penting, 'Sisa_Besar': u.s_besar, 'Sisa_Melahirkan': u.s_melahirkan, 'Sisa_CLTN': u.s_cltn,
              'Pangkat': u.pangkat, 'Jenis_Jabatan': (u.jenis_jabatan || 'Fungsional Umum'), 'Alamat': u.alamat,
              'TMT_KGB': u.tmt_kgb, 'TMT_KNP': u.tmt_knp, 'BUP': u.bup
          }));
          if(dataExport.length === 0) {
              if(window.showNotify) window.showNotify('Perhatian', 'Tidak ada data untuk dibackup.', 'error'); return;
          }
          const ws = XLSX.utils.json_to_sheet(dataExport);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Master_Pegawai");
          XLSX.writeFile(wb, "Backup_Pegawai_TRANSKEP.xlsx");
          if(window.showNotify) window.showNotify('Backup Berhasil', 'Data pegawai telah diunduh ke perangkat Anda.', 'success');
        },
        handleImportPegawai(event) {
          const file = event.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const data = new Uint8Array(e.target.result);
                  const workbook = XLSX.read(data, {type: 'array'});
                  const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }); 
                  if (json.length === 0) { if(window.showNotify) window.showNotify('Import Gagal', 'File Excel kosong.', 'error'); return; }
                  if (!json[0].hasOwnProperty('NIP') || !json[0].hasOwnProperty('Nama')) { if(window.showNotify) window.showNotify('Import Ditolak', 'Format Excel tidak sesuai.', 'error'); return; }

                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) {
                     window.showCustomConfirm("Konfirmasi Sinkronisasi", `Ditemukan ${json.length} data profil. Sistem akan menimpa NIP yang sudah ada. Lanjutkan?`, async () => {
                          if(window.showLoading) window.showLoading("Memasukkan data ke database...");
                          const adminNip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
                          try {
                            const res = await window.PegawaiDataService.importBulkPegawai(json, adminNip, token);
                            if(window.hideLoading) window.hideLoading(); 
                            this.$refs.fileInput.value = ''; 
                            if(res && res.status === 'success') { 
                              if(window.showNotify) window.showNotify('Import Selesai', res.message, 'success'); 
                              if(window.syncAllServerData) window.syncAllServerData(); 
                            } else { 
                              if(window.showNotify) window.showNotify('Import Gagal', res ? res.message : 'Gagal import pegawai', 'error'); 
                            }
                          } catch (err) {
                            if(window.hideLoading) window.hideLoading(); 
                            this.$refs.fileInput.value = ''; 
                            if(window.showNotify) window.showNotify('Error', err.toString(), 'error'); 
                          }
                     });
                  }
              } catch(error) { this.$refs.fileInput.value = ''; if(window.showNotify) window.showNotify('Import Gagal', 'Dokumen rusak.', 'error'); }
          };
          reader.readAsArrayBuffer(file);
        },
        async fetchResetQueue() {
          const token = localStorage.getItem('transkep_session_token');
          const nip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
          if (!nip || !token) return;

          try {
            const queue = await window.PegawaiDataService.getResetQueue(nip, token);
            this.antreanResetList = queue || [];
          } catch (err) {
            console.warn("Gagal memuat antrean reset:", err);
          }
        },
        openQueueModal() {
          this.fetchResetQueue();
          this.showModalAntrean = true;
        },
        closeQueueModal() {
          this.showModalAntrean = false;
        },
        processManualWAReset(q) {
            const appUrl = "https://transkep.github.io/";
            const msg = `*RESET AKUN TRANSKEP* 🏢\nHalo *${q.nama}*,\n\nIni kredensial baru Anda:\n👤 *NIP:* ${q.nip}\n🔑 *Sandi:* ${q.pass}\n\n🔗 *Link Login:*\n${appUrl}`;
            
            const runProcess = async () => {
                if (window.showLoading) window.showLoading("Memproses...");
                const token = localStorage.getItem('transkep_session_token');
                const nip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
                try {
                  const res = await window.PegawaiDataService.markResetDone(q.id, nip, token);
                  if (window.hideLoading) window.hideLoading();
                  if(res && res.status === 'success') {
                      if(window.showNotify) window.showNotify("Selesai", "Berhasil diproses.", "success");
                      this.fetchResetQueue(); 
                      window.open("https://api.whatsapp.com/send?phone=" + q.no_wa + "&text=" + encodeURIComponent(msg), '_blank');
                  } else {
                      if(window.showNotify) window.showNotify("Gagal", (res ? res.message : null) || "Gagal memproses antrean.", "error");
                  }
                } catch (err) {
                  if (window.hideLoading) window.hideLoading();
                  if(window.showNotify) window.showNotify("Error", err.toString(), "error");
                }
            };
            
            if (window.showCustomConfirm) window.showCustomConfirm("Proses Antrean?", "Lanjutkan?", runProcess);
            else if(confirm("Kirim kredensial?")) runProcess();
        }
      },
      mounted() {
        setTimeout(() => this.fetchResetQueue(), 1500);
      }
    }).mount('#vue-manajemen-pegawai');
  });

