// ==========================================
// FILE: jobdes.js (TRANSKEP Modular)
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

// --- Source: jobdes/js_jobdes.html ---
function escapeHtml(str) {
      if (!str) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }

  function pormatTugasRapi(text) {
      if (!text) return '-';
      var lines = text.split('\n');
      var htmlResult = '';

      lines.forEach(function(line) {
          var trimmed = line.trim();
          if (!trimmed) return;
          var match = trimmed.match(/^(\d+\.|[a-zA-Z]\.|[-*])\s*(.*)/);

          if (match) {
              var bullet = escapeHtml(match[1]); 
              var content = escapeHtml(match[2]); 
              var isSubList = /^[a-zA-Z]\./.test(match[1]); 
              var paddingKiri = isSubList ? 'padding-left: 20px;' : ''; 
              htmlResult += '<div style="display: flex; margin-bottom: 6px; line-height: 1.5; text-align: justify; ' + paddingKiri + '">' +
                              '<div style="flex-shrink: 0; min-width: 24px; font-weight: 500;">' + bullet + '</div>' +
                              '<div style="flex-grow: 1;">' + content + '</div>' +
                            '</div>';
          } else {
              htmlResult += '<div style="text-align: justify; margin-bottom: 6px; line-height: 1.5;">' + escapeHtml(trimmed) + '</div>';
          }
      });
      return htmlResult;
  }

  window.formatListJobdes = pormatTugasRapi;

  window.jobdesConfigSk = {
     dasar: "Lampiran II Surat Keputusan Ketua Pengadilan Agama Indramayu",
     nomor: "013/Kpa.W10-A2/Sk.Kp7.1/I/2025",
     tanggal: "2 Januari 2025"
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.vmJobdes = Vue.createApp({
      data() {
        return {
          searchQuery: '',
          showDropdown: false,
          highlightedIndex: 0,
          
          searchAtasanQuery: '',
          showDropdownAtasan: false,
          highlightedIndexAtasan: 0,
          
          selectedNip: '',
          configSk: { ...window.jobdesConfigSk },
          modals: {
            dasarSk: false,
            editJobdes: false,
            usulan: false,
            notifAdmin: false,
            importDocx: false
          },
          importDocx: {
            isDragging: false,
            isParsing: false,
            isSaving: false,
            mode: 'replace',
            filesQueue: []
          },
          formEdit: { nip: '', nama: '', atasan: '', ikhtisar: '', pokok: '', tambahan: '', tanggung: '', hasil: '' },
          formUsulan: { namaPegawai: '', isi: '' },
          notifUsulan: [],
          isFullscreen: false,
          isLoadingWa: false,
          isLoadingForm: false,
          firestoreJobdes: [],
          isFirebaseConnected: false
        };
      },
      computed: {
        globalState() {
          return window.vueState || {};
        },
        matchedCount() {
          return (this.importDocx.filesQueue || []).filter(f => f.matched && f.nip).length;
        },
        unmatchedCount() {
          return (this.importDocx.filesQueue || []).filter(f => !f.matched || !f.nip).length;
        },
        hasAdminAccess() {
          const role = (this.globalState.user?.role || "").toLowerCase();
          return role === "" || role.includes('admin') || role.includes('operator') || role.includes('super');
        },
        hasAtasanAccess() {
          const role = (this.globalState.user?.role || "").toLowerCase();
          return role.includes('atasan') || role.includes('pejabat') || role.includes('ketua') || this.hasAdminAccess;
        },
        filteredUsers() {
          if (!this.searchQuery) return [];
          const q = this.searchQuery.toLowerCase();
          return (this.globalState.usersList || []).filter(u =>
              (u.nama && u.nama.toLowerCase().includes(q)) ||
              (u.jabatan && u.jabatan.toLowerCase().includes(q)) ||
              (u.nip && u.nip.includes(q))
          );
        },
        listAtasan() {
           return (this.globalState.usersList || []).filter(usr => {
              const uRole = (usr.role || "").toLowerCase();
              return uRole.includes('atasan') || uRole.includes('pejabat') || uRole.includes('admin') || uRole.includes('super');
           });
        },
        filteredAtasan() {
          if (!this.searchAtasanQuery) return this.listAtasan;
          const q = this.searchAtasanQuery.toLowerCase();
          return this.listAtasan.filter(u =>
              (u.nama && u.nama.toLowerCase().includes(q)) ||
              (u.jabatan && u.jabatan.toLowerCase().includes(q)) ||
              (u.nip && u.nip.includes(q))
          );
        },
        selectedUser() {
          return (this.globalState.usersList || []).find(u => u.nip === this.selectedNip) || null;
        },
        selectedJobdes() {
          const fJd = (this.firestoreJobdes || []).find(j => String(j.nip) === String(this.selectedNip));
          if (fJd) return fJd;

          const jd = (this.globalState.jobdesList || []).find(j => String(j.nip) === String(this.selectedNip));
          return jd || { 
            ikhtisar_jabatan: 'Deskripsi ikhtisar tugas belum diatur.', 
            tugas_pokok: '- Belum diisi.', 
            tugas_tambahan: '-', tanggung_jawab: '-', hasil_kerja: '-', atasan_nip: '' 
          };
        },
        atasanUser() {
          return (this.globalState.usersList || []).find(u => u.nip === this.selectedJobdes.atasan_nip) || { nama: '-' };
        },
        
        fmtIkhtisar() { return pormatTugasRapi(this.selectedJobdes.ikhtisar_jabatan); },
        fmtPokok() { return pormatTugasRapi(this.selectedJobdes.tugas_pokok); },
        fmtTambahan() { return pormatTugasRapi(this.selectedJobdes.tugas_tambahan); },
        fmtTanggung() { return pormatTugasRapi(this.selectedJobdes.tanggung_jawab); },
        fmtHasil() { return pormatTugasRapi(this.selectedJobdes.hasil_kerja); }
      },
      watch: {
         searchQuery(val) {
             if(val === '') this.showDropdown = false;
             this.highlightedIndex = 0; 
         },
         searchAtasanQuery(val) {
             this.highlightedIndexAtasan = 0; 
         }
      },
      methods: {
        highlightNext(type) {
            if (type === 'main') {
                if (this.highlightedIndex < this.filteredUsers.length - 1) this.highlightedIndex++;
            } else if (type === 'atasan') {
                if (this.highlightedIndexAtasan < this.filteredAtasan.length - 1) this.highlightedIndexAtasan++;
            }
        },
        highlightPrev(type) {
            if (type === 'main') {
                if (this.highlightedIndex > 0) this.highlightedIndex--;
            } else if (type === 'atasan') {
                if (this.highlightedIndexAtasan > 0) this.highlightedIndexAtasan--;
            }
        },
        selectHighlighted(type) {
            if (type === 'main' && this.showDropdown && this.filteredUsers.length > 0) {
                this.selectPegawai(this.filteredUsers[this.highlightedIndex]);
            } else if (type === 'atasan' && this.showDropdownAtasan && this.filteredAtasan.length > 0) {
                this.selectAtasan(this.filteredAtasan[this.highlightedIndexAtasan]);
            }
        },
        initView() {
           if(this.hasAdminAccess) {
              this.fetchNotifikasiAdmin();
           } else {
              if(this.globalState.user?.nip) this.selectedNip = this.globalState.user.nip;
           }
        },
        clearSearch() {
           this.searchQuery = '';
           this.showDropdown = false;
        },
        // FIX: Tambahan metode untuk hapus pencarian atasan secara instan
        clearAtasanSearch() {
           this.searchAtasanQuery = '';
           this.formEdit.atasan = ''; 
           this.showDropdownAtasan = true; 
        },
        selectPegawai(u) {
           this.searchQuery = u.nama;
           this.selectedNip = u.nip;
           this.showDropdown = false;
        },
        selectAtasan(sup) {
           this.formEdit.atasan = sup.nip;
           this.searchAtasanQuery = sup.nama + " (" + sup.jabatan + ")";
           this.showDropdownAtasan = false;
        },
        saveDasarSk() {
           window.jobdesConfigSk = { ...this.configSk };
           this.modals.dasarSk = false;
           (typeof showNotify === "function" ? showNotify("success" === "error" ? "Peringatan" : "Sukses", "Kop Dasar SK diperbarui.", "success") : alert("Kop Dasar SK diperbarui."));
        },
        openModalEdit() {
           if(!this.selectedNip) return;
           
           this.formEdit = {
               nip: this.selectedNip,
               nama: this.selectedUser.nama,
               atasan: this.selectedJobdes.atasan_nip,
               ikhtisar: this.selectedJobdes.ikhtisar_jabatan,
               pokok: this.selectedJobdes.tugas_pokok,
               tambahan: this.selectedJobdes.tugas_tambahan,
               tanggung: this.selectedJobdes.tanggung_jawab,
               hasil: this.selectedJobdes.hasil_kerja
           };
           
           const atasanObj = this.listAtasan.find(a => a.nip === this.selectedJobdes.atasan_nip);
           this.searchAtasanQuery = atasanObj ? atasanObj.nama + " (" + atasanObj.jabatan + ")" : '';
           
           this.modals.editJobdes = true;
        },
        async submitEditJobdes() {
           if(!this.formEdit.atasan) {
               (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Pilih Verifikator Atasan dari dropdown yang tersedia.", "error") : alert("Pilih Verifikator Atasan dari dropdown yang tersedia."));
               return;
           }
           
           this.isLoadingForm = true;
           const payload = {
              nip: this.formEdit.nip,
              atasan_nip: this.formEdit.atasan,
              dasar_lampiran: "-",
              ikhtisar_jabatan: this.formEdit.ikhtisar,
              tugas_pokok: this.formEdit.pokok,
              tugas_tambahan: this.formEdit.tambahan,
              tanggung_jawab: this.formEdit.tanggung,
              hasil_kerja: this.formEdit.hasil
           };

           const token = localStorage.getItem('transkep_session_token');
           try {
               const res = await window.JobdesDataService.saveJobdes(payload, this.globalState.user.nip, token);
               this.isLoadingForm = false;
               this.modals.editJobdes = false;
               if (res && res.status === 'success') {
                   (typeof showNotify === "function" ? showNotify("success" === "error" ? "Peringatan" : "Sukses", res.message, "success") : alert(res.message));
                   
                   let existingIdx = this.globalState.jobdesList.findIndex(j => j.nip === payload.nip);
                   if (existingIdx > -1) {
                       this.globalState.jobdesList[existingIdx] = payload;
                   } else {
                       this.globalState.jobdesList.push(payload);
                   }
               } else {
                   (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Gagal: " + (res ? res.message : "Gagal menyimpan data"), "error") : alert("Gagal: " + (res ? res.message : "Gagal menyimpan data")));
               }
           } catch (err) {
               this.isLoadingForm = false;
               this.modals.editJobdes = false;
               (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Error Jaringan", "error") : alert("Error Jaringan"));
           }
        },
        openModalUsulan() {
           if(!this.selectedNip) {
              (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Pilih pegawai dulu.", "error") : alert("Pilih pegawai dulu.")); 
              return; 
           }
           this.formUsulan = { namaPegawai: this.selectedUser.nama, isi: '' };
           this.modals.usulan = true;
        },
        async submitUsulan() {
           this.isLoadingForm = true;
           const payload = {
              nip_pegawai: this.selectedNip,
              nama_pegawai: this.formUsulan.namaPegawai,
              nama_pengusul: this.globalState.user.nama || 'Unknown',
              isi_usulan: this.formUsulan.isi
           };
           const token = localStorage.getItem('transkep_session_token');
           try {
               const res = await window.JobdesDataService.saveUsulan(payload, this.globalState.user.nip, token);
               this.isLoadingForm = false;
               this.modals.usulan = false;
               if(res && res.status === 'success') {
                   (typeof showNotify === "function" ? showNotify("success" === "error" ? "Peringatan" : "Sukses", res.message, "success") : alert(res.message));
               } else {
                   (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Gagal kirim usulan.", "error") : alert("Gagal kirim usulan."));
               }
           } catch (err) {
               this.isLoadingForm = false;
               this.modals.usulan = false;
               (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Error koneksi.", "error") : alert("Error koneksi."));
           }
        },
        async fetchNotifikasiAdmin() {
           const token = localStorage.getItem('transkep_session_token');
           try {
               const usulanArr = await window.JobdesDataService.getUsulanMenunggu(this.globalState.user.nip, token);
               this.notifUsulan = usulanArr || [];
           } catch (err) {
               console.error("Gagal memuat notifikasi usulan:", err);
           }
        },
        async prosesSelesaiUsulan(id) {
           const token = localStorage.getItem('transkep_session_token');
           this.notifUsulan = this.notifUsulan.filter(u => u.id !== id);
           try {
               const res = await window.JobdesDataService.tandaiUsulanSelesai(id, this.globalState.user.nip, token);
               if(res && res.status === 'success') {
                   (typeof showNotify === "function" ? showNotify("success" === "error" ? "Peringatan" : "Sukses", "Usulan ditandai selesai.", "success") : alert("Usulan ditandai selesai."));
                   this.fetchNotifikasiAdmin();
               }
           } catch (err) {
               console.error("Gagal memproses selesai usulan:", err);
           }
        },
        async sendJobdesWa() {
           if(!this.selectedNip || !this.selectedUser) {
               (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Silakan pilih pegawai terlebih dahulu.", "error") : alert("Silakan pilih pegawai terlebih dahulu.")); 
               return; 
           }
           
           this.isLoadingWa = true;

           let noWaRaw = this.selectedUser.no_wa || this.selectedUser.no_hp || "";
           let noWaClean = String(noWaRaw).replace(/\D/g, ''); 
           if (noWaClean.startsWith('0')) noWaClean = '62' + noWaClean.substring(1); 

           const template = document.getElementById('templateCetakJobdes');
           const tempNode = template.cloneNode(true);
           
           tempNode.querySelector('#prtJudulSk').innerText = this.configSk.dasar;
           tempNode.querySelector('#prtNoSk').innerText = this.configSk.nomor;
           tempNode.querySelector('#prtTglSk').innerText = this.configSk.tanggal;
           tempNode.querySelector('#prtJabatan').innerText = document.getElementById('jdPrevNamaJabatan').innerText;
           tempNode.querySelector('#prtAtasan').innerText = document.getElementById('jdPrevAtasan').innerText;
           tempNode.querySelector('#prtNama').innerText = document.getElementById('jdPrevNama').innerText;
           tempNode.querySelector('#prtNip').innerText = document.getElementById('jdPrevNip').innerText;
           tempNode.querySelector('#prtPangkat').innerText = document.getElementById('jdPrevPangkat').innerText;
           
           tempNode.querySelector('#prtIkhtisar').innerHTML = document.getElementById('jdPrevIkhtisar').innerHTML;
           tempNode.querySelector('#prtPokok').innerHTML = document.getElementById('jdPrevPokok').innerHTML;
           tempNode.querySelector('#prtTambahan').innerHTML = document.getElementById('jdPrevTambahan').innerHTML;
           tempNode.querySelector('#prtTanggung').innerHTML = document.getElementById('jdPrevTanggung').innerHTML;
           tempNode.querySelector('#prtHasil').innerHTML = document.getElementById('jdPrevHasil').innerHTML;

           const printHTML = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">' + document.getElementById('styleCetakJobdes').outerHTML + '</head><body>' + tempNode.querySelector('#contentCetakJobdes').outerHTML + '</body></html>';
           const fileName = "Uraian_Tugas_" + this.selectedUser.nama.replace(/[^a-zA-Z0-9]/g, "_");
           const token = localStorage.getItem('transkep_session_token');

           try {
               const res = await window.JobdesDataService.createPdfJobdes(printHTML, fileName, this.globalState.user.nip, token);
               this.isLoadingWa = false;
               if(res && res.status === 'success') {
                   let pesanWa = `Yth. Bapak/Ibu *${this.selectedUser.nama}*,\n\nBerikut kami sampaikan dokumen *Uraian Tugas / Job Description* resmi Anda.\n\nUnduh dokumen PDF: ${res.url}\n\nTerima Kasih.\n_Sistem Kepegawaian TRANSKEP_`;
                   let waLink = "https://api.whatsapp.com/send?text=" + encodeURIComponent(pesanWa);
                   if (noWaClean) waLink = "https://api.whatsapp.com/send?phone=" + noWaClean + "&text=" + encodeURIComponent(pesanWa);
                   window.open(waLink, "_blank");
               } else {
                   (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Gagal: " + (res ? res.message : "Gagal membuat dokumen PDF"), "error") : alert("Gagal: " + (res ? res.message : "Gagal membuat dokumen PDF")));
               }
           } catch (err) {
               this.isLoadingWa = false;
               (typeof showNotify === "function" ? showNotify("error" === "error" ? "Peringatan" : "Sukses", "Error Koneksi Jaringan", "error") : alert("Error Koneksi Jaringan"));
           }
        },

        // ==========================================
        // CLOUD FIRESTORE REALTIME SYNC & MIGRATION
        // ==========================================
        initFirebaseJobdesListener() {
          if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
            this.isFirebaseConnected = true;
            console.log("🔥 [TRANSKEP Jobdes] Menghubungkan listener realtime Firestore Jobdes...");
            TranskepFirebase.subscribeFirestoreJobdes((list) => {
              this.firestoreJobdes = list || [];
              console.log(`🔥 [TRANSKEP Jobdes] Realtime Sync: ${this.firestoreJobdes.length} dokumen Jobdes di Firestore.`);
              
              // Sinkronkan ke globalState.jobdesList
              if (window.vueState && Array.isArray(window.vueState.jobdesList)) {
                this.firestoreJobdes.forEach(fJd => {
                  const idx = window.vueState.jobdesList.findIndex(j => String(j.nip) === String(fJd.nip));
                  if (idx > -1) {
                    window.vueState.jobdesList[idx] = { ...window.vueState.jobdesList[idx], ...fJd, is_firebase: true };
                  } else {
                    window.vueState.jobdesList.push({ ...fJd, is_firebase: true });
                  }
                });
              }
            });

            // Listener usulan reposisi realtime
            TranskepFirebase.subscribeFirestoreUsulanJobdes((usulanList) => {
              const pending = (usulanList || []).filter(u => u.status === 'Menunggu');
              if (pending.length > 0) {
                this.notifUsulan = pending;
              }
            });
          }
        },

        async migrateAllJobdesToFirestore() {
          if (!this.hasAdminAccess) return;
          const list = this.globalState.jobdesList || [];
          if (!list || list.length === 0) {
            if (window.showNotify) window.showNotify("Data Kosong", "Belum ada data Jobdes di Spreadsheet untuk dimigrasikan.", "warning");
            return;
          }

          const confirmFn = window.showCustomConfirm || ((title, msg, cb) => { if(confirm(title + "\n" + msg)) cb(); });
          confirmFn(
            "Migrasi Jobdes ke Cloud Firestore",
            `Apakah Anda ingin memigrasikan seluruh ${list.length} data Uraian Tugas Pegawai ke Cloud Firestore (transkep-314c0)?`,
            async () => {
              if (window.showLoading) window.showLoading(`Memigrasikan data ke Firestore...`);
              try {
                if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
                  throw new Error("Koneksi Firebase Firestore belum siap. Pastikan konfigurasi aktif.");
                }
                let count = 0;
                for (const item of list) {
                  if (!item.nip) continue;
                  await TranskepFirebase.saveJobdesToFirestore({
                    nip: item.nip,
                    atasan_nip: item.atasan_nip || '',
                    dasar_lampiran: item.dasar_lampiran || '-',
                    ikhtisar_jabatan: item.ikhtisar_jabatan || '',
                    tugas_pokok: item.tugas_pokok || '',
                    tugas_tambahan: item.tugas_tambahan || '',
                    tanggung_jawab: item.tanggung_jawab || '',
                    hasil_kerja: item.hasil_kerja || '',
                    updated_by: (this.globalState.user ? this.globalState.user.nama : "Admin")
                  });
                  count++;
                  if (window.showLoading && count % 5 === 0) {
                    window.showLoading(`Memigrasikan ${count} / ${list.length} data ke Firestore...`);
                  }
                }
                if (window.hideLoading) window.hideLoading();
                if (window.showNotify) {
                  window.showNotify("Sukses Migrasi! 🔥", `${count} dokumen Uraian Tugas resmi tersimpan di Cloud Firestore (koleksi jobdes_documents).`, "success");
                }
              } catch (err) {
                if (window.hideLoading) window.hideLoading();
                if (window.showNotify) window.showNotify("Gagal Migrasi", err.message || err.toString(), "error");
              }
            }
          );
        },

        // ==========================================
        // SMART BULK IMPORT WORD (.DOCX) METHODS
        // ==========================================
        openModalImportDocx() {
          this.importDocx.isDragging = false;
          this.importDocx.isParsing = false;
          this.importDocx.isSaving = false;
          this.importDocx.filesQueue = [];
          this.importDocx.mode = 'replace';
          this.modals.importDocx = true;
        },
        closeModalImportDocx() {
          this.modals.importDocx = false;
        },
        handleFileInputChange(e) {
          const files = e.target.files;
          if (files && files.length > 0) {
            this.processDocxFiles(Array.from(files));
          }
          if (this.$refs.docxFileInput) {
            this.$refs.docxFileInput.value = '';
          }
        },
        handleFileDrop(e) {
          this.importDocx.isDragging = false;
          const files = e.dataTransfer.files;
          if (files && files.length > 0) {
            this.processDocxFiles(Array.from(files));
          }
        },
        extractNipFromDoc(text, filename) {
          // 1. Prioritas 1: Cek dari nama file terlebih dahulu
          const mFile = (filename || '').match(/\b(19\d{16}|20\d{16})\b/);
          if (mFile) return mFile[1];

          // 2. Prioritas 2: Cek dari teks isi dokumen (pola NIP 18 digit)
          const mText = (text || '').match(/(?:NIP\s*[:.\s]*)?\b(19\d{16}|20\d{16})\b/i);
          if (mText) return mText[1];

          return null;
        },
        cleanDocxTextPoints(rawText) {
          if (!rawText) return [];
          const lines = rawText.split(/\r?\n/);
          const points = [];

          const noisePatterns = [
            /^uraian\s+tugas/i,
            /^job\s+description/i,
            /^daftar\s+rincian\s+tugas/i,
            /^lampiran/i,
            /^surat\s+keputusan/i,
            /^nama\s*[:]/i,
            /^nip\s*[:]/i,
            /^jabatan\s*[:]/i,
            /^pangkat\s*[:]/i,
            /^golongan\s*[:]/i,
            /^unit\s+kerja\s*[:]/i,
            /^atasan\s+langsung\s*[:]/i,
            /^ikhtisar\s+jabatan\s*[:]/i,
            /^uraian\s+tugas\s+pokok\s*[:]/i,
            /^tugas\s+pokok\s*[:]/i,
            /^tugas\s+tambahan\s*[:]/i,
            /^tanggung\s+jawab\s*[:]/i,
            /^hasil\s+kerja\s*[:]/i,
            /^indramayu,\s*\d+/i,
            /^mengetahui/i,
            /^ketua\s+pengadilan/i,
            /^pejabat\s+penilai/i,
            /^yang\s+membuat\s+pernyataan/i
          ];

          for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.length < 5) continue;

            const isNoise = noisePatterns.some(pattern => pattern.test(line));
            if (isNoise) continue;

            // Bersihkan bullet atau penomoran Word lama
            const cleaned = line.replace(/^(\d+[\.\)]|[a-zA-Z][\.\)]|[-–—•*▪▫◦●])\s*/, '').trim();
            if (cleaned.length >= 5) {
              points.push(cleaned);
            }
          }

          return points;
        },
        async processDocxFiles(files) {
          const docxFiles = files.filter(f => f.name.toLowerCase().endsWith('.docx'));
          if (docxFiles.length === 0) {
            if (typeof showNotify === 'function') {
              showNotify('Peringatan', 'Silakan pilih file dokumen berformat Word (.docx).', 'error');
            }
            return;
          }

          if (typeof mammoth === 'undefined') {
            if (typeof showNotify === 'function') {
              showNotify('Peringatan', 'Library Mammoth.js belum siap dimuat.', 'error');
            }
            return;
          }

          this.importDocx.isParsing = true;
          const usersList = this.globalState.usersList || [];

          for (const file of docxFiles) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
              const fullText = result.value || '';

              const detectedNip = this.extractNipFromDoc(fullText, file.name);
              const points = this.cleanDocxTextPoints(fullText);

              let matchedUser = null;
              if (detectedNip) {
                matchedUser = usersList.find(u => String(u.nip) === String(detectedNip));
              }

              let existingPokok = '';
              let existingAtasan = '';
              const targetNip = matchedUser ? matchedUser.nip : (detectedNip || '');
              if (targetNip) {
                const existingJd = (this.firestoreJobdes || []).find(j => String(j.nip) === String(targetNip)) ||
                                   (this.globalState.jobdesList || []).find(j => String(j.nip) === String(targetNip));
                if (existingJd) {
                  existingPokok = existingJd.tugas_pokok || '';
                  existingAtasan = existingJd.atasan_nip || '';
                }
              }

              this.importDocx.filesQueue.push({
                id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                filename: file.name,
                nip: matchedUser ? matchedUser.nip : (detectedNip || ''),
                nama: matchedUser ? matchedUser.nama : '',
                jabatan: matchedUser ? matchedUser.jabatan : '',
                matched: !!matchedUser,
                atasanNip: existingAtasan || '',
                points: points,
                existingPokok: existingPokok
              });
            } catch (err) {
              console.error('Gagal mengekstrak docx:', file.name, err);
            }
          }

          this.importDocx.isParsing = false;
        },
        onManualSelectUser(item) {
          const selected = (this.globalState.usersList || []).find(u => String(u.nip) === String(item.nip));
          if (selected) {
            item.nama = selected.nama;
            item.jabatan = selected.jabatan;
            item.matched = true;

            const existingJd = (this.firestoreJobdes || []).find(j => String(j.nip) === String(selected.nip)) ||
                               (this.globalState.jobdesList || []).find(j => String(j.nip) === String(selected.nip));
            if (existingJd) {
              item.existingPokok = existingJd.tugas_pokok || '';
              if (!item.atasanNip && existingJd.atasan_nip) {
                item.atasanNip = existingJd.atasan_nip;
              }
            }
          } else {
            item.nama = '';
            item.jabatan = '';
            item.matched = false;
          }
        },
        addPointToItem(item) {
          item.points.push('Melaksanakan tugas kedinasan lainnya yang diberikan atasan...');
        },
        removePointFromItem(item, pIdx) {
          item.points.splice(pIdx, 1);
        },
        removeFileFromQueue(idx) {
          this.importDocx.filesQueue.splice(idx, 1);
        },
        async submitBulkImportJobdes() {
          const validItems = this.importDocx.filesQueue.filter(f => f.matched && f.nip && f.points.length > 0);
          if (validItems.length === 0) {
            if (typeof showNotify === 'function') {
              showNotify('Peringatan', 'Tidak ada data pegawai dan butir tugas valid untuk disimpan.', 'error');
            }
            return;
          }

          this.importDocx.isSaving = true;
          const adminNip = this.globalState.user ? this.globalState.user.nip : 'Admin';

          try {
            const payloads = validItems.map(item => {
              let finalTugasPokok = '';

              if (this.importDocx.mode === 'append' && item.existingPokok && item.existingPokok.trim() !== '' && item.existingPokok !== '- Belum diisi.') {
                const existingLines = item.existingPokok.split('\n').filter(l => l.trim().length > 0);
                const existingClean = existingLines.map(l => l.replace(/^(\d+[\.\)]|[a-zA-Z][\.\)]|[-–—•*▪▫◦●])\s*/, '').trim()).filter(l => l.length > 0);
                const combined = [...existingClean, ...item.points];
                finalTugasPokok = combined.map((p, i) => `${i + 1}. ${p.trim()}`).join('\n');
              } else {
                finalTugasPokok = item.points.map((p, i) => `${i + 1}. ${p.trim()}`).join('\n');
              }

              return {
                nip: item.nip,
                atasan_nip: item.atasanNip || '',
                dasar_lampiran: '-',
                tugas_pokok: finalTugasPokok,
                updated_by: adminNip
              };
            });

            const res = await window.JobdesDataService.bulkSaveJobdesBatch(payloads, adminNip);

            // Optimistic Local State Update
            payloads.forEach(p => {
              const existingIdx = (this.globalState.jobdesList || []).findIndex(j => String(j.nip) === String(p.nip));
              if (existingIdx > -1) {
                this.globalState.jobdesList[existingIdx] = {
                  ...this.globalState.jobdesList[existingIdx],
                  ...p
                };
              } else {
                if (this.globalState.jobdesList) {
                  this.globalState.jobdesList.push({ ...p });
                }
              }

              const fsIdx = (this.firestoreJobdes || []).findIndex(j => String(j.nip) === String(p.nip));
              if (fsIdx > -1) {
                this.firestoreJobdes[fsIdx] = {
                  ...this.firestoreJobdes[fsIdx],
                  ...p
                };
              } else {
                this.firestoreJobdes.push({ ...p });
              }
            });

            this.importDocx.isSaving = false;
            this.modals.importDocx = false;

            if (typeof showNotify === 'function') {
              showNotify('Sukses', `Berhasil mengimpor ${payloads.length} dokumen Uraian Tugas ke Cloud Firestore!`, 'success');
            } else {
              alert(`Berhasil mengimpor ${payloads.length} dokumen Uraian Tugas ke Cloud Firestore!`);
            }
          } catch (err) {
            this.importDocx.isSaving = false;
            console.error('Gagal import massal jobdes:', err);
            if (typeof showNotify === 'function') {
              showNotify('Error', 'Gagal menyimpan ke Cloud Firestore: ' + (err.message || err), 'error');
            } else {
              alert('Gagal menyimpan ke Cloud Firestore: ' + (err.message || err));
            }
          }
        }
      },
      mounted() {
        this.initFirebaseJobdesListener();
        if (this.hasAdminAccess) {
          const token = localStorage.getItem('transkep_session_token');
          if (this.globalState.user && this.globalState.user.nip) {
            window.JobdesDataService.getUsulanMenunggu(this.globalState.user.nip, token)
              .then(res => { if(res && res.length) this.notifUsulan = res; })
              .catch(() => {});
          }
        }
      }
    }).mount('#vue-jobdes-app');
  });

  window.renderJobdesView = function() {
      if(window.vmJobdes && typeof window.vmJobdes.initView === 'function') {
          window.vmJobdes.initView();
      }
  };

  document.addEventListener('click', function(e) {
      if(window.vmJobdes) {
          const containerMain = document.getElementById('jdSearchContainer');
          if (window.vmJobdes.showDropdown && containerMain && !containerMain.contains(e.target)) {
              window.vmJobdes.showDropdown = false;
          }
          
          const containerAtasan = document.getElementById('jdAtasanContainer');
          if (window.vmJobdes.showDropdownAtasan && containerAtasan && !containerAtasan.contains(e.target)) {
              window.vmJobdes.showDropdownAtasan = false;
              
              const atasanObj = window.vmJobdes.listAtasan.find(a => a.nip === window.vmJobdes.formEdit.atasan);
              window.vmJobdes.searchAtasanQuery = atasanObj ? atasanObj.nama + " (" + atasanObj.jabatan + ")" : '';
          }
      }
  });

// Logika Cetak Jobdes dipisahkan ke js/cetak/cetak_jobdes.js
