// ==========================================
// FILE: pegawai.js (TRANSKEP Modular)
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

// --- Source: pegawai/js_manajemen_pegawai.html ---
// ==========================================
  // TRANSKEP: VUE JS COMPONENT - MODUL PEGAWAI
  // ==========================================

  document.addEventListener("DOMContentLoaded", () => {
    window.vmPegawai = Vue.createApp({
      data() {
        return {
          searchPegawai: "",
          expandedPegawai: [],
          visiblePasswords: [],
          showModalPegawai: false,
          isSubmittingPegawai: false,
          modalPegMode: 'add',
          formPegawai: this.getEmptyForm(),
          showModalAntrean: false,
          antreanResetList: [],
          avatarsMap: {},
          showModalBulkFoto: false,
          bulkFotoQueue: [],
          isProcessingBulkFoto: false,
          isUploadingBulkFoto: false,
          bulkUploadProgress: { done: 0, total: 0 },
          isDraggingBulkFoto: false,
          formAvatarPreview: "",
          formAvatarRemoved: false,
          formAvatarChanged: false,
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
        cutiYears() {
          const u = this.currentUser || (this.usersList && this.usersList[0]);
          const y = new Date().getFullYear();
          if (u && Array.isArray(u.cuti_years) && u.cuti_years.length === 3 && Number(u.cuti_years[2]) >= y) {
            return u.cuti_years.map(Number);
          }
          return [y - 2, y - 1, y];
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
        normalizePangkat(pangkat) {
          if (!pangkat) return "";
          const romanMap = {
            "17": "XVII", "16": "XVI", "15": "XV", "14": "XIV", "13": "XIII",
            "12": "XII", "11": "XI", "10": "X", "9": "IX", "8": "VIII",
            "7": "VII", "6": "VI", "5": "V", "4": "IV", "3": "III",
            "2": "II", "1": "I"
          };
          const clean = pangkat.trim();
          for (const [arabic, roman] of Object.entries(romanMap)) {
            const regex = new RegExp(`^PPPK\\s+Golongan\\s+${arabic}$`, 'i');
            if (regex.test(clean)) {
              return `PPPK Golongan ${roman}`;
            }
          }
          return clean;
        },
        openPegawaiModal(mode, user = null) {
          this.modalPegMode = mode;
          this.formAvatarChanged = false;
          this.formAvatarRemoved = false;
          if (mode === 'edit' && user) {
            this.formPegawai = { ...user, originalNip: user.nip };
            if (this.formPegawai.pass && String(this.formPegawai.pass).startsWith('SHA256$')) {
              this.formPegawai.pass = '[Telah Dienkripsi]';
            }
            this.formPegawai.pangkat = this.normalizePangkat(user.pangkat);
            this.formPegawai.tmt_kgb = this.parseDateToHTML5(user.tmt_kgb);
            this.formPegawai.tmt_knp = this.parseDateToHTML5(user.tmt_knp);
            this.formAvatarPreview = this.getUserAvatarUri(user.nip);
          } else {
            this.formPegawai = this.getEmptyForm();
            this.formAvatarPreview = "";
          }
          this.showModalPegawai = true;
        },
        closePegawaiModal() {
          this.showModalPegawai = false;
        },
        async submitPegawai() {
          if (this.isSubmittingPegawai) return;
          this.formPegawai.pangkat = this.normalizePangkat(this.formPegawai.pangkat);
          const token = localStorage.getItem('transkep_session_token');
          const adminNip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
          const avatarChanged = this.formAvatarChanged;
          const avatarRemoved = this.formAvatarRemoved;
          const avatarUri = this.formAvatarPreview;
          const targetNipClean = String(this.formPegawai.nip || '').replace(/[^0-9]/g, '');

          this.isSubmittingPegawai = true;
          // OPTIMISTIC UI TAHAP 4 (0ms Update & Auto-Rollback)
          this.closePegawaiModal();
          const backupUsers = JSON.parse(JSON.stringify(this.usersList));

          if (this.modalPegMode === 'add') {
            this.usersList.push({ ...this.formPegawai });
            if(window.showNotify) window.showNotify("Pegawai Ditambahkan ⚡", "Data akun pegawai baru telah dicatat (0ms).", "success");
          } else {
            const idx = this.usersList.findIndex(u => String(u.nip) === String(this.formPegawai.nip));
            if (idx !== -1) this.usersList[idx] = { ...this.usersList[idx], ...this.formPegawai };
            if(window.showNotify) window.showNotify("Profil Diperbarui ⚡", "Perubahan data pegawai disimpan (0ms).", "success");
          }

          try {
            const res = await window.PegawaiDataService.savePegawai(this.formPegawai, this.modalPegMode, adminNip, token);
            if (!res || res.status !== 'success') {
              this.usersList = backupUsers;
              if(window.showNotify) window.showNotify("Gagal Menyimpan", (res ? res.message : "Gagal menyimpan data.") + " (Data dikembalikan)", "error");
            } else if ((avatarChanged || avatarRemoved) && targetNipClean && window.TranskepFirebase) {
              if (avatarRemoved && typeof window.TranskepFirebase.deleteUserAvatarFromFirestore === 'function') {
                await window.TranskepFirebase.deleteUserAvatarFromFirestore(targetNipClean);
                const nextMap = { ...this.avatarsMap };
                delete nextMap[targetNipClean];
                this.avatarsMap = nextMap;
                if (typeof window.setCachedUserAvatar === 'function') window.setCachedUserAvatar(targetNipClean, '');
              } else if (avatarChanged && avatarUri && typeof window.TranskepFirebase.saveUserAvatarToFirestore === 'function') {
                await window.TranskepFirebase.saveUserAvatarToFirestore(targetNipClean, avatarUri, { mime_type: 'image/jpeg', size_bytes: avatarUri.length, width: 240, height: 240 });
                this.avatarsMap = { ...this.avatarsMap, [targetNipClean]: { nip: targetNipClean, photo_data_uri: avatarUri } };
                if (typeof window.setCachedUserAvatar === 'function') window.setCachedUserAvatar(targetNipClean, avatarUri);
              }
            }
          } catch (err) {
            this.usersList = backupUsers;
            if(window.showNotify) window.showNotify("Error Sistem", err.toString() + " (Data dikembalikan)", "error");
          } finally {
            this.isSubmittingPegawai = false;
          }
        },
        deletePegawaiRecord(user) {
          const token = localStorage.getItem('transkep_session_token');
          if(window.showCustomConfirm) {
             const esc = window.escHtml || (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
             window.showCustomConfirm("Hapus Data Pegawai", `Hapus permanen akun PNS atas nama ${esc(user.nama)} (NIP: ${esc(user.nip)})? Tindakan ini tidak dapat dibatalkan.`, async () => {
                // OPTIMISTIC DELETE TAHAP 4 (0ms)
                const backupUsers = [...this.usersList];
                this.usersList = this.usersList.filter(u => String(u.nip) !== String(user.nip));
                if(window.showNotify) window.showNotify("Pegawai Dihapus ⚡", "Akun atas nama " + esc(user.nama) + " telah dihapus (0ms).", "info");

                const adminNip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
                try {
                  const res = await window.PegawaiDataService.deletePegawai(user.nip, adminNip, token);
                  if (!res || res.status !== 'success') {
                    this.usersList = backupUsers;
                    if(window.showNotify) window.showNotify("Gagal Hapus", (res ? res.message : "Gagal menghapus pegawai.") + " (Data dikembalikan)", "error");
                  }
                } catch (err) {
                  this.usersList = backupUsers;
                  if(window.showNotify) window.showNotify("Error Jaringan", err.toString() + " (Data dikembalikan)", "error");
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
          const appUrl = "https://sso.pa-indramayu.go.id/";
          const msg = `*INFORMASI AKUN TRANSKEP* 🏢\nHalo ${sapaan} *${user.nama}*,\n\nBerikut kredensial login Anda:\n\n👤 *NIP / Username:* ${user.nip}\n🔑 *Kata Sandi:* ${displayPass}\n\n🔗 *Link Login:*\n${appUrl}`;
          window.open("https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(msg), '_blank');
        },
        exportPegawaiToExcel() {
          if (typeof XLSX === 'undefined') {
             if(window.showNotify) window.showNotify('Library Terblokir', 'Modul export excel gagal dimuat koneksi.', 'error');
             return;
          }
          const yrs = this.cutiYears;
          const dataExport = this.usersList.map(u => {
              const row = {
                  'NIP': u.nip, 'Nama': u.nama, 'Jabatan': u.jabatan, 'Role': u.role, 'No_HP': u.no_hp, 'Password': u.pass
              };
              row['Sisa_Tahunan_' + yrs[0]] = u.s_tahunan_2024;
              row['Sisa_Tahunan_' + yrs[1]] = u.s_tahunan_2025;
              row['Sisa_Tahunan_' + yrs[2]] = u.s_tahunan_2026;
              Object.assign(row, {
                  'Sisa_Sakit': u.s_sakit, 'Sisa_Penting': u.s_penting, 'Sisa_Besar': u.s_besar, 'Sisa_Melahirkan': u.s_melahirkan, 'Sisa_CLTN': u.s_cltn,
                  'Pangkat': u.pangkat, 'Jenis_Jabatan': (u.jenis_jabatan || 'Fungsional Umum'), 'Alamat': u.alamat,
                  'TMT_KGB': u.tmt_kgb, 'TMT_KNP': u.tmt_knp, 'BUP': u.bup
              });
              return row;
          });
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
            const appUrl = "https://sso.pa-indramayu.go.id/";
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
            else if(window.showCustomConfirm) window.showCustomConfirm("Kirim Kredensial", "Kirim kredensial via WhatsApp?", () => runProcess()); else runProcess();
        },
        getInitials(nama) {
          const cleanName = String(nama || 'ID').split(',')[0].replace(/\b(Drs|Dr|H|Hj)\b\.?\s*/gi, '').trim();
          const words = cleanName.split(/\s+/).filter(Boolean);
          const ini = (words[0] ? words[0].charAt(0).toUpperCase() : '') + (words[1] ? words[1].charAt(0).toUpperCase() : '');
          return ini || 'ID';
        },
        getUserAvatarUri(nip) {
          const cleanNip = String(nip || '').replace(/[^0-9]/g, '');
          if (!cleanNip || !this.avatarsMap || !this.avatarsMap[cleanNip]) return '';
          const entry = this.avatarsMap[cleanNip];
          const uri = entry && entry.photo_data_uri ? entry.photo_data_uri : '';
          return (typeof window.getSafeAvatarDataUri === 'function') ? window.getSafeAvatarDataUri(uri) : uri;
        },
        compressPegawaiAvatarFile(file) {
          return new Promise((resolve, reject) => {
            if (!file || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '') && !/\.(jpe?g|png|webp)$/i.test(file.name || '')) {
              return reject(new Error('Format file bukan gambar JPG/PNG/WEBP.'));
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
            reader.onload = (ev) => {
              const img = new Image();
              img.onerror = () => reject(new Error('Gambar tidak valid atau rusak.'));
              img.onload = () => {
                const targetSize = 240;
                const imgW = img.naturalWidth || img.width;
                const imgH = img.naturalHeight || img.height;
                const side = Math.min(imgW, imgH);
                const sx = Math.max(0, Math.round((imgW - side) / 2));
                const sy = imgH > imgW ? Math.max(0, Math.round((imgH - side) * 0.12)) : Math.max(0, Math.round((imgH - side) / 2));
                const canvas = document.createElement('canvas');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, targetSize, targetSize);
                ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
                let outUri = canvas.toDataURL('image/jpeg', 0.82);
                if (outUri.length > 90000) {
                  outUri = canvas.toDataURL('image/jpeg', 0.72);
                }
                const byteEstimate = Math.round((outUri.split(',')[1] || '').length * 0.75);
                resolve({ dataUri: outUri, width: targetSize, height: targetSize, sizeBytes: byteEstimate, sizeKb: Math.max(1, Math.round(byteEstimate / 1024)) });
              };
              img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
          });
        },
        extractNipAndMatchUser(filename) {
          const baseName = String(filename || '').replace(/\.[^.]+$/, '');
          const m18 = baseName.match(/(?:^|\D)(19\d{16}|20\d{16})(?:\D|$)/);
          const candidateDigits = m18 ? m18[1] : ((baseName.match(/\d{6,}/) || [])[0] || '');
          if (!candidateDigits) return { nip: '', matched: null };
          const matched = (this.usersList || []).find(u => {
            const uNip = String(u.nip || '').replace(/[^0-9]/g, '');
            return uNip && (uNip === candidateDigits || (candidateDigits.length >= 8 && uNip.includes(candidateDigits)));
          }) || null;
          return { nip: matched ? String(matched.nip).replace(/[^0-9]/g, '') : candidateDigits, matched };
        },
        async loadAvatarsFromFirestore() {
          if (typeof window.TranskepFirebase === 'undefined') return;
          try {
            if (typeof window.TranskepFirebase.getFirestoreUserAvatars === 'function') {
              const map = await window.TranskepFirebase.getFirestoreUserAvatars();
              if (map && typeof map === 'object') this.avatarsMap = map;
            }
            if (typeof window.TranskepFirebase.subscribeFirestoreUserAvatars === 'function' && !this._unsubAvatars) {
              this._unsubAvatars = window.TranskepFirebase.subscribeFirestoreUserAvatars((map) => {
                if (map && typeof map === 'object') this.avatarsMap = map;
              });
            }
          } catch (err) {
            console.warn('[Pegawai] Gagal memuat peta foto profil:', err);
          }
        },
        async handleSingleAvatarSelect(ev) {
          const file = ev && ev.target && ev.target.files && ev.target.files[0];
          if (!file) return;
          try {
            const res = await this.compressPegawaiAvatarFile(file);
            this.formAvatarPreview = res.dataUri;
            this.formAvatarChanged = true;
            this.formAvatarRemoved = false;
          } catch (err) {
            if (window.showNotify) window.showNotify('Foto Tidak Valid', err.message || 'Gagal memproses foto.', 'error');
          } finally {
            if (ev && ev.target) ev.target.value = '';
          }
        },
        removeSingleAvatar() {
          this.formAvatarPreview = '';
          this.formAvatarRemoved = true;
          this.formAvatarChanged = false;
        },
        openBulkFotoModal() {
          this.bulkFotoQueue = [];
          this.isDraggingBulkFoto = false;
          this.showModalBulkFoto = true;
        },
        closeBulkFotoModal() {
          if (this.isUploadingBulkFoto) return;
          this.showModalBulkFoto = false;
        },
        handleBulkFotoDrop(ev) {
          this.isDraggingBulkFoto = false;
          const files = ev && ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files : [];
          this.handleBulkFotoFiles(files);
        },
        async handleBulkFotoFiles(files) {
          const arr = Array.prototype.slice.call(files || []);
          if (arr.length === 0) return;
          this.isProcessingBulkFoto = true;
          try {
            for (const f of arr) {
              const matchInfo = this.extractNipAndMatchUser(f.name);
              try {
                const compressed = await this.compressPegawaiAvatarFile(f);
                this.bulkFotoQueue.push({
                  fileName: f.name,
                  nip: matchInfo.nip,
                  matched: matchInfo.matched,
                  dataUri: compressed.dataUri,
                  sizeBytes: compressed.sizeBytes,
                  sizeKb: compressed.sizeKb,
                  width: compressed.width,
                  height: compressed.height,
                  uploaded: false,
                  error: matchInfo.matched ? '' : (matchInfo.nip ? `NIP ${matchInfo.nip} tidak ditemukan` : 'Nama file tidak mengandung NIP')
                });
              } catch (errComp) {
                this.bulkFotoQueue.push({
                  fileName: f.name,
                  nip: matchInfo.nip,
                  matched: null,
                  dataUri: '',
                  sizeBytes: 0,
                  sizeKb: 0,
                  uploaded: false,
                  error: errComp.message || 'File rusak / bukan gambar'
                });
              }
            }
          } finally {
            this.isProcessingBulkFoto = false;
            if (this.$refs && this.$refs.bulkFotoInput) this.$refs.bulkFotoInput.value = '';
          }
        },
        removeBulkFotoItem(idx) {
          this.bulkFotoQueue.splice(idx, 1);
        },
        async submitBulkFotoUpload() {
          if (this.isUploadingBulkFoto) return;
          if (typeof window.TranskepFirebase === 'undefined' || typeof window.TranskepFirebase.saveUserAvatarToFirestore !== 'function') {
            if (window.showNotify) window.showNotify('Error', 'Konektor Cloud Firestore belum siap.', 'error');
            return;
          }
          const targets = this.bulkFotoQueue.filter(item => item.matched && item.dataUri && !item.uploaded);
          if (targets.length === 0) return;
          this.isUploadingBulkFoto = true;
          this.bulkUploadProgress = { done: 0, total: targets.length };
          let okCount = 0;
          try {
            for (const item of targets) {
              const cleanNip = String(item.matched.nip).replace(/[^0-9]/g, '');
              await window.TranskepFirebase.saveUserAvatarToFirestore(cleanNip, item.dataUri, {
                mime_type: 'image/jpeg',
                size_bytes: item.sizeBytes || item.dataUri.length,
                width: item.width || 240,
                height: item.height || 240
              });
              item.uploaded = true;
              this.avatarsMap = { ...this.avatarsMap, [cleanNip]: { nip: cleanNip, photo_data_uri: item.dataUri } };
              if (typeof window.setCachedUserAvatar === 'function') {
                window.setCachedUserAvatar(cleanNip, item.dataUri);
              }
              okCount++;
              this.bulkUploadProgress.done = okCount;
            }
            if (window.showNotify) window.showNotify('Upload Foto Selesai', `${okCount} foto profil pegawai berhasil disimpan ke Cloud Firestore.`, 'success');
          } catch (err) {
            if (window.showNotify) window.showNotify('Sebagian Gagal', `Tersimpan ${okCount}/${targets.length} foto. Error: ${err && err.message ? err.message : err}`, 'error');
          } finally {
            this.isUploadingBulkFoto = false;
          }
        }
      },
      mounted() {
        setTimeout(() => {
          this.fetchResetQueue();
          this.loadAvatarsFromFirestore();
        }, 1500);
      }
    }).mount('#vue-manajemen-pegawai');
  });

