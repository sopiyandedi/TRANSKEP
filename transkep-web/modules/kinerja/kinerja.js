// ==========================================
// FILE: kinerja.js (TRANSKEP Modular)
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

// --- Source: kinerja/js_kinerja.html ---
document.addEventListener("DOMContentLoaded", () => {
    window.vmKinerja = Vue.createApp({
      data() {
        return {
          filters: {
             tahun: 'all',
             periode: 'all',
             search: ''
          },
          isModalOpen: false,
          isUploading: false,
          
          // FIX: State untuk dropdown kustom Pejabat Penilai
          searchPejabatQuery: '',
          showDropdownPejabat: false,
          highlightedIndexPejabat: 0,
          
          form: {
             tahun: '2026',
             periode: '',
             predikat: '',
             pejabat_nip: ''
          },
          files: {
             penilaian: null,
             evaluasi: null
          }
        };
      },
      computed: {
        globalState() {
          return window.vueState || {};
        },
        listPejabat() {
           return (this.globalState.usersList || []).filter(u => {
              const role = (u.role || "").toLowerCase();
              return role.includes('atasan') || role.includes('pejabat') || role.includes('admin') || role.includes('ketua');
           });
        },
        // FIX: Computed untuk filter dropdown pencarian Pejabat
        filteredPejabatSearch() {
           if (!this.searchPejabatQuery) return this.listPejabat;
           const q = this.searchPejabatQuery.toLowerCase();
           return this.listPejabat.filter(u =>
               (u.nama && u.nama.toLowerCase().includes(q)) ||
               (u.jabatan && u.jabatan.toLowerCase().includes(q)) ||
               (u.nip && u.nip.includes(q))
           );
        },
        filteredKinerja() {
           let data = [...(this.globalState.kinerjaList || [])];
           const myNip = this.globalState.user?.nip;
           const myRole = (this.globalState.user?.role || '').toLowerCase();
           
           if (myRole.includes('admin') || myRole.includes('operator')) {
               // Admin melihat semua data
           } else if (myRole.includes('pejabat') || myRole.includes('atasan') || myRole.includes('ketua')) {
               data = data.filter(k => k.nip === myNip || k.pejabat_nip === myNip);
           } else {
               data = data.filter(k => k.nip === myNip);
           }

           if (this.filters.tahun !== 'all') {
               data = data.filter(k => k.tahun === this.filters.tahun);
           }
           if (this.filters.periode !== 'all') {
               data = data.filter(k => k.periode === this.filters.periode);
           }

           data = data.map(k => {
               const uPegawai = (this.globalState.usersList || []).find(u => u.nip === k.nip) || { nama: 'Unknown', jabatan: '-' };
               const uPejabat = (this.globalState.usersList || []).find(u => u.nip === k.pejabat_nip) || { nama: 'Unknown' };
               return {
                   ...k,
                   _pegawai: uPegawai,
                   _pejabat: uPejabat,
                   _canApprove: (k.pejabat_nip === myNip || myRole.includes('admin'))
               };
           });

           if (this.filters.search.trim() !== '') {
               const q = this.filters.search.toLowerCase().trim();
               data = data.filter(k => 
                   k._pegawai.nama.toLowerCase().includes(q) || 
                   k._pegawai.jabatan.toLowerCase().includes(q)
               );
           }

           return data.reverse();
        }
      },
      watch: {
         // Reset index penyorotan saat mengetik
         searchPejabatQuery(val) {
             this.highlightedIndexPejabat = 0;
         }
      },
      methods: {
        initView() {
           this.filters.search = '';
        },
        openModal() {
           this.form = { tahun: '2026', periode: '', predikat: '', pejabat_nip: '' };
           this.files = { penilaian: null, evaluasi: null };
           
           // Reset form pencarian atasan
           this.searchPejabatQuery = '';
           this.showDropdownPejabat = false;
           this.highlightedIndexPejabat = 0;
           
           this.isModalOpen = true;
        },
        closeModal() {
           this.isModalOpen = false;
        },
        
        // FIX: Metode kontrol keyboard dan mouse untuk Pejabat Penilai
        highlightNextPejabat() {
           if (this.highlightedIndexPejabat < this.filteredPejabatSearch.length - 1) this.highlightedIndexPejabat++;
        },
        highlightPrevPejabat() {
           if (this.highlightedIndexPejabat > 0) this.highlightedIndexPejabat--;
        },
        selectHighlightedPejabat() {
           if (this.showDropdownPejabat && this.filteredPejabatSearch.length > 0) {
               this.selectPejabat(this.filteredPejabatSearch[this.highlightedIndexPejabat]);
           }
        },
        clearPejabatSearch() {
           this.searchPejabatQuery = '';
           this.form.pejabat_nip = '';
           this.showDropdownPejabat = true;
        },
        selectPejabat(sup) {
           this.form.pejabat_nip = sup.nip;
           this.searchPejabatQuery = sup.nama + " (" + sup.jabatan + ")";
           this.showDropdownPejabat = false;
        },

        handleFileUpload(type, event) {
           const file = event.target.files[0];
           if (file) this.files[type] = file;
        },
        async submitKinerja() {
           // Validasi manual jika Pejabat Penilai belum dipilih
           if (!this.form.pejabat_nip) {
               if(window.showNotify) window.showNotify("Pilih Pejabat Penilai", "Silakan ketik dan pilih nama pejabat penilai dari daftar.", "warning");
               return;
           }

           if (!this.files.penilaian || !this.files.evaluasi) return;

           this.isUploading = true;
           if(window.showLoading) window.showLoading("Membaca dokumen & mengunggah ke Google Drive...");

           try {
               const token = localStorage.getItem('transkep_session_token');
               const res = await window.KinerjaDataService.uploadKinerja(
                   this.form,
                   this.files,
                   this.globalState.user.nip,
                   token
               );

               this.isUploading = false;
               if(window.hideLoading) window.hideLoading();

               if (res && res.status === 'success') {
                   this.closeModal();
                   if(window.showNotify) window.showNotify("Sukses Upload", "Dokumen SKP telah dikirim ke atasan untuk disahkan.", "success");
                   if(typeof window.syncAllServerData === 'function') window.syncAllServerData();
               } else {
                   if(window.showNotify) window.showNotify("Gagal Upload", res ? res.message : "Terjadi kesalahan upload", "error");
               }
           } catch (err) {
               this.isUploading = false;
               if(window.hideLoading) window.hideLoading();
               if(window.showNotify) window.showNotify("Kendala Upload", err.message || err.toString(), "error");
           }
        },
        sahkanKinerja(id) {
           if(window.showCustomConfirm) {
               window.showCustomConfirm("Sah & TTE Dokumen SKP", "Anda akan menandatangani dokumen ini secara elektronik. Sistem akan membuatkan Lembar Pengesahan ber-Barcode. Lanjutkan?", async () => {
                  
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showLoading) window.showLoading("Membangun Dokumen Tanda Tangan Elektronik...");

                  try {
                      const res = await window.KinerjaDataService.sahkanKinerja(id, this.globalState.user.nip, token);
                      if(window.hideLoading) window.hideLoading();
                      if(res && res.status === 'success') {
                          if(window.showNotify) window.showNotify("Pengesahan Berhasil", "Dokumen SKP telah resmi disahkan secara elektronik.", "success");
                          if(typeof window.syncAllServerData === 'function') window.syncAllServerData();
                      } else {
                          if(window.showNotify) window.showNotify("Gagal Pengesahan", res ? res.message : "Terjadi kesalahan pengesahan", "error");
                      }
                  } catch (err) {
                      if(window.hideLoading) window.hideLoading();
                      if(window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                  }
               });
           }
        }
      }
    }).mount('#vue-kinerja-app');
  });

  window.renderKinerjaView = function() {
      if(window.vmKinerja && typeof window.vmKinerja.initView === 'function') {
          window.vmKinerja.initView();
      }
  };

  // FIX: Tutup dropdown Pejabat jika user mengklik area luar kotak
  document.addEventListener('click', function(e) {
      if(window.vmKinerja) {
          const containerPejabat = document.getElementById('knjPejabatContainer');
          if (window.vmKinerja.showDropdownPejabat && containerPejabat && !containerPejabat.contains(e.target)) {
              window.vmKinerja.showDropdownPejabat = false;
              
              // Jika user mengetik namun tidak memilih dari list, kembalikan ke nama terakhir yang sah
              const pejabatObj = window.vmKinerja.listPejabat.find(a => a.nip === window.vmKinerja.form.pejabat_nip);
              window.vmKinerja.searchPejabatQuery = pejabatObj ? pejabatObj.nama + " (" + pejabatObj.jabatan + ")" : '';
          }
      }
  });

