// ==========================================
// FILE: wfh.js (Modul Work From Home)
// ==========================================

// --- Source: permohonan/wfh/js_wfh.html ---
document.addEventListener("DOMContentLoaded", () => {
    const { createApp } = Vue;

    window.vmFormWFH = createApp({
        data() {
            return {
                s: state, // Mengambil reference state global
                
                // State Modal Rencana
                isRencanaOpen: false,
                isRencanaScaled: false,
                currentEditIdRencana: null,
                formRencana: {
                    tanggal: '',
                    atasan_nip: '',
                    targets: [] // Array of {deskripsi, kuantitas}
                },

                // State Modal Laporan
                isLaporanOpen: false,
                isLaporanScaled: false,
                currentEditIdLaporan: null,
                formLaporan: {
                    items: [], // Array of {deskripsi, kuantitas, jam_mulai, jam_selesai, realisasi, status_capaian}
                    evidenLama: [] // Array URL bukti
                }
            };
        },
        computed: {
            // Logika Penanggung Jawab Rencana (Sama persis algoritma hirarkinya dengan IK/IP)
            opsiAtasan() {
                if (!this.s || !this.s.user) return { list: [], adaPlh: false };
                
                let atasanOpts = [];
                let adaPlh = false;
                const j = this.s.user.jabatan.toLowerCase();

                const getPegawai = (keyword) => {
                    return this.s.usersList.filter(x => String(x.nip) !== String(this.s.user.nip) && x.jabatan.toLowerCase().includes(keyword));
                };

                // Blok logika hierarki (Sesuai original)
                if (j.includes("hakim") || j.includes("wakil ketua") || j === "ketua") {
                    let ketua = getPegawai("ketua").find(x => x.jabatan.toLowerCase() === "ketua");
                    if (ketua && !this.isPegawaiAbsent(ketua.nip)) atasanOpts.push(ketua);
                    else { adaPlh = true; let wakil = getPegawai("wakil ketua").find(x => x.jabatan.toLowerCase() === "wakil ketua"); if (wakil && !this.isPegawaiAbsent(wakil.nip)) atasanOpts.push(wakil); else { let hakims = getPegawai("hakim").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...hakims); } }
                }
                else if (j.includes("panitera muda") || j.includes("panitera pengganti") || j.includes("jurusita") || j.includes("juru sita")) {
                    let panitera = getPegawai("panitera").find(x => x.jabatan.toLowerCase() === "panitera");
                    if (panitera && !this.isPegawaiAbsent(panitera.nip)) atasanOpts.push(panitera);
                    else { adaPlh = true; let panmuds = getPegawai("panitera muda").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...panmuds); }
                }
                else if (j.includes("kepala sub bagian") || j.includes("kasubbag")) {
                    let sekretaris = getPegawai("sekretaris").find(x => x.jabatan.toLowerCase() === "sekretaris");
                    if (sekretaris && !this.isPegawaiAbsent(sekretaris.nip)) atasanOpts.push(sekretaris);
                    else { adaPlh = true; let kasubbags = getPegawai("kepala sub bagian").filter(x => !this.isPegawaiAbsent(x.nip)); if(kasubbags.length === 0) kasubbags = getPegawai("kasubbag").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...kasubbags); }
                }
                else {
                    let ketua = getPegawai("ketua").find(x => x.jabatan.toLowerCase() === "ketua");
                    if (ketua && !this.isPegawaiAbsent(ketua.nip)) atasanOpts.push(ketua);
                    else { adaPlh = true; let wakil = getPegawai("wakil ketua").find(x => x.jabatan.toLowerCase() === "wakil ketua"); if (wakil && !this.isPegawaiAbsent(wakil.nip)) atasanOpts.push(wakil); else { let hakims = getPegawai("hakim").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...hakims); } }
                    let panitera = getPegawai("panitera").find(x => x.jabatan.toLowerCase() === "panitera");
                    if (panitera && !this.isPegawaiAbsent(panitera.nip)) atasanOpts.push(panitera);
                    else { adaPlh = true; let panmuds = getPegawai("panitera muda").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...panmuds); }
                    let sekretaris = getPegawai("sekretaris").find(x => x.jabatan.toLowerCase() === "sekretaris");
                    if (sekretaris && !this.isPegawaiAbsent(sekretaris.nip)) atasanOpts.push(sekretaris);
                    else { adaPlh = true; let kasubbags = getPegawai("kepala sub bagian").filter(x => !this.isPegawaiAbsent(x.nip)); if(kasubbags.length === 0) kasubbags = getPegawai("kasubbag").filter(x => !this.isPegawaiAbsent(x.nip)); atasanOpts.push(...kasubbags); }
                }

                atasanOpts = [...new Map(atasanOpts.map(item => [item.nip, item])).values()];
                return { list: atasanOpts, adaPlh: adaPlh };
            }
        },
        watch: {
            'opsiAtasan.list'(newVal) {
                if (newVal.length > 0 && (!this.formRencana.atasan_nip || !newVal.find(x => x.nip === this.formRencana.atasan_nip))) {
                    this.formRencana.atasan_nip = newVal[0].nip;
                }
            }
        },
        methods: {
            // Helper Pengecekan Absensi
            isPegawaiAbsent(nip) {
                const today = new Date(); today.setHours(0,0,0,0);
                return this.s.cutiLogs.some(log => {
                    if (String(log.nip) === String(nip) && log.status === 'Disetujui') {
                        const start = new Date(log.tgl_mulai); start.setHours(0,0,0,0);
                        const end = new Date(log.tgl_selesai); end.setHours(0,0,0,0);
                        return today >= start && today <= end;
                    }
                    return false;
                });
            },
            
            // Helper Format Jam Laporan (0800 -> 08:00)
            formatJam(item, fieldName) {
                let val = item[fieldName].replace(/\D/g, ''); 
                if (val.length > 2) val = val.substring(0, 2) + ':' + val.substring(2, 4);
                item[fieldName] = val;
            },
            validateJam(val) {
                if (val && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val)) {
                    if(window.showNotify) window.showNotify("Format Jam Salah", "Gunakan format 24 jam (Cth: 13:45)", "warning");
                }
            },

            // ==============================================================
            // FUNGSI MODAL RENCANA
            // ==============================================================
            openModalRencana(editId = null) {
                if (!this.s || !this.s.user) { if(window.showNotify) window.showNotify("Sistem Memuat", "Silakan tunggu.", "error"); return; }
                
                this.currentEditIdRencana = editId;
                
                if (editId) {
                    const log = this.s.wfhLogs.find(l => String(l.id) === String(editId));
                    if (log) {
                        this.formRencana.tanggal = log.tanggal;
                        setTimeout(() => { this.formRencana.atasan_nip = log.atasan_nip; }, 50);
                        try {
                            const targetList = JSON.parse(log.rencana_json || '[]');
                            if (targetList.length > 0) this.formRencana.targets = targetList;
                            else this.formRencana.targets = [{ deskripsi: '', kuantitas: '' }];
                        } catch(e) { this.formRencana.targets = [{ deskripsi: '', kuantitas: '' }]; }
                    }
                } else {
                    this.formRencana = { tanggal: new Date().toISOString().split('T')[0], atasan_nip: '', targets: [{ deskripsi: '', kuantitas: '' }] };
                }

                this.isRencanaOpen = true;
                setTimeout(() => { this.isRencanaScaled = true; }, 10);
            },
            closeModalRencana() {
                this.isRencanaScaled = false;
                setTimeout(() => { this.isRencanaOpen = false; }, 200);
            },
            addTarget() {
                this.formRencana.targets.push({ deskripsi: '', kuantitas: '' });
            },
            removeTarget(index) {
                if (this.formRencana.targets.length <= 1) {
                    if(window.showNotify) window.showNotify("Peringatan", "Minimal harus ada 1 target kerja.", "warning"); return;
                }
                this.formRencana.targets.splice(index, 1);
            },
            submitRencana() {
                if(!this.s.user) { if(window.showNotify) window.showNotify("Sesi Berakhir", "Harap login ulang.", "error"); return; }
                
                // Validasi Hari Jumat
                if (new Date(this.formRencana.tanggal).getDay() !== 5) { 
                    if(window.showNotify) window.showNotify("Tanggal Ditolak", "WFH hanya diizinkan pada hari Jumat.", "warning"); return; 
                }

                // Bersihkan target kosong
                let cleanTargets = this.formRencana.targets.filter(t => t.deskripsi.trim() !== '' && t.kuantitas.trim() !== '');
                if(cleanTargets.length === 0) { 
                    if(window.showNotify) window.showNotify("Validasi Gagal", "Target kerja tidak boleh kosong.", "error"); return; 
                }
                
                const payload = { 
                    id: this.currentEditIdRencana, 
                    nip: this.s.user.nip, 
                    tanggal: this.formRencana.tanggal, 
                    atasan_nip: this.formRencana.atasan_nip, 
                    rencana_json: JSON.stringify(cleanTargets) 
                };

                const token = localStorage.getItem('transkep_session_token'); 
                if(window.showLoading) window.showLoading(this.currentEditIdRencana ? "Memperbarui Rencana..." : "Mengirim Rencana...");
                
                const actionPromise = this.currentEditIdRencana
                    ? IzinDataService.updateRencanaWFH(payload, token)
                    : IzinDataService.submitRencanaWFH(payload, token);

                actionPromise
                    .then((res) => {
                        if(window.hideLoading) window.hideLoading();
                        if(res.status === 'success') {
                            this.closeModalRencana(); 
                            if(window.showNotify) window.showNotify("Disimpan", res.message, "success");
                            
                            if (this.currentEditIdRencana) {
                                const idx = this.s.wfhLogs.findIndex(l => String(l.id) === String(this.currentEditIdRencana));
                                if (idx !== -1) { 
                                    this.s.wfhLogs[idx].tanggal = payload.tanggal; 
                                    this.s.wfhLogs[idx].atasan_nip = payload.atasan_nip; 
                                    this.s.wfhLogs[idx].rencana_json = payload.rencana_json; 
                                    this.s.wfhLogs[idx].status_rencana = 'Menunggu'; 
                                }
                            } else {
                                const virtualLog = { 
                                    id: (res.data && res.data.id) ? res.data.id : "WFH-VIRTUAL-" + Date.now(), 
                                    tgl_pengajuan: new Date().toLocaleDateString('id-ID'), 
                                    nip: payload.nip, tanggal: payload.tanggal, rencana_json: payload.rencana_json, 
                                    laporan_json: "", atasan_nip: payload.atasan_nip, 
                                    status_rencana: 'Menunggu', status_laporan: 'Belum Lapor', 
                                    z_type: 'WFH', z_sort: Date.now() 
                                };
                                if (this.s && this.s.wfhLogs) this.s.wfhLogs.unshift(virtualLog);
                            }
                            if (typeof window.renderPermohonanView === 'function') window.renderPermohonanView();
                        } else { 
                            if(window.showNotify) window.showNotify("Gagal", res.message, "error"); 
                        }
                    })
                    .catch((err) => { 
                        if(window.hideLoading) window.hideLoading(); 
                        if(window.showNotify) window.showNotify("Error", err.toString(), "error"); 
                    });
            },

            // ==============================================================
            // FUNGSI MODAL LAPORAN
            // ==============================================================
            openModalLaporan(id) {
                if (!this.s || !this.s.user) { if(window.showNotify) window.showNotify("Sistem Memuat", "Tunggu.", "error"); return; }
                if(window.showLoading) window.showLoading("Menarik data rencana...");
                
                IzinDataService.getRencanaWFHById(id)
                    .then((res) => {
                        if(window.hideLoading) window.hideLoading(); 
                        if(res.status === 'success') this.populateLaporan(res.data); 
                        else if(window.showNotify) window.showNotify("Gagal", res.message, "error"); 
                    })
                    .catch((err) => {
                        if(window.hideLoading) window.hideLoading(); 
                        if(window.showNotify) window.showNotify("Error", err.toString(), "error"); 
                    });
            },
            closeModalLaporan() {
                this.isLaporanScaled = false;
                setTimeout(() => { this.isLaporanOpen = false; }, 200);
            },
            populateLaporan(data) {
                this.currentEditIdLaporan = data.id;
                
                // Bersihkan Input File sebelumnya
                if(this.$refs.fileUploadWFH) this.$refs.fileUploadWFH.value = "";
                
                // Parsing Data Eviden Lama
                this.formLaporan.evidenLama = [];
                if (data.bukti_url && data.bukti_url.trim() !== "") {
                    try { 
                        const parsedUrl = JSON.parse(data.bukti_url); 
                        this.formLaporan.evidenLama = Array.isArray(parsedUrl) ? parsedUrl : [data.bukti_url]; 
                    } catch(e) { 
                        this.formLaporan.evidenLama = [data.bukti_url]; 
                    }
                }
                
                // Parsing Target & Laporan
                let targetList = []; try { targetList = JSON.parse(data.rencana_json || '[]'); } catch(e) {}
                let laporanList = []; try { laporanList = JSON.parse(data.laporan_json || '[]'); } catch(e) {}

                this.formLaporan.items = targetList.map((item, idx) => {
                    let lap = laporanList[idx] || {};
                    return {
                        deskripsi: item.deskripsi,
                        kuantitas: item.kuantitas,
                        jam_mulai: lap.jam_mulai || '',
                        jam_selesai: lap.jam_selesai || '',
                        realisasi: lap.realisasi || '',
                        status_capaian: lap.status_capaian || ''
                    };
                });

                this.isLaporanOpen = true;
                setTimeout(() => { this.isLaporanScaled = true; }, 10);
            },
            hapusEvidenLama(index) {
                this.formLaporan.evidenLama.splice(index, 1);
            },
            async submitLaporan() {
                if(!this.s.user) { if(window.showNotify) window.showNotify("Sesi Berakhir", "Harap login ulang.", "error"); return; }
                
                const fileInput = this.$refs.fileUploadWFH;
                let newFilesData = [];
                
                if (fileInput.files.length > 0) {
                    let totalSize = 0;
                    for (let i = 0; i < fileInput.files.length; i++) totalSize += fileInput.files[i].size;
                    
                    if (totalSize > 5 * 1024 * 1024) { 
                        if(window.showNotify) window.showNotify("Terlalu Besar", "Total ukuran file maks 5MB.", "error"); 
                        return; 
                    }
                    
                    if(window.showLoading) window.showLoading("Membaca dokumen eviden...");
                    try {
                        newFilesData = await IzinDataService.readMultipleFilesAsBase64(fileInput.files);
                    } catch(err) {
                        if(window.hideLoading) window.hideLoading(); 
                        if(window.showNotify) window.showNotify("Error", "Gagal membaca file.", "error"); 
                        return; 
                    }
                } else if (this.formLaporan.evidenLama.length === 0) {
                    if(window.showNotify) window.showNotify("Validasi", "Bukti dukung wajib dilampirkan!", "error"); return;
                }
                
                const payload = { 
                    id: this.currentEditIdLaporan, 
                    laporan_json: JSON.stringify(this.formLaporan.items), 
                    nip: this.s.user.nip, 
                    nama: this.s.user.nama, 
                    existingUrls: JSON.stringify(this.formLaporan.evidenLama), 
                    newFiles: newFilesData 
                };

                const token = localStorage.getItem('transkep_session_token'); 
                
                if(window.showLoading) window.showLoading("Mengirim Laporan WFH...");
                IzinDataService.submitLaporanWFH(payload, token)
                    .then((res) => {
                        if(window.hideLoading) window.hideLoading();
                        if(res.status === 'success') {
                            this.closeModalLaporan(); 
                            if(window.showNotify) window.showNotify("Laporan Terkirim", res.message, "success");
                            
                            // Reaktif pembaruan state lokal
                            const idx = this.s.wfhLogs.findIndex(l => String(l.id) === String(this.currentEditIdLaporan));
                            if (idx !== -1) { 
                                this.s.wfhLogs[idx].laporan_json = payload.laporan_json; 
                                this.s.wfhLogs[idx].status_laporan = 'Menunggu'; 
                                this.s.wfhLogs[idx].bukti_url = res.data.fileUrl; 
                                if (typeof window.renderPermohonanView === 'function') window.renderPermohonanView(); 
                            }
                        } else { 
                            if(window.showNotify) window.showNotify("Gagal", res.message, "error"); 
                        }
                    })
                    .catch((err) => { 
                        if(window.hideLoading) window.hideLoading(); 
                        if(window.showNotify) window.showNotify("Error", err.toString(), "error"); 
                    });
            }
        }
    }).mount('#vue-form-wfh-wrapper');

    // ---------------------------------------------------------
    // BRIDGING KE TOMBOL VANILLA HTML (Bypass Integrasi Global)
    // ---------------------------------------------------------
    window.openModalWFH = function(editId = null) {
        if (window.vmFormWFH) window.vmFormWFH.openModalRencana(editId);
    };
    
    window.closeModalWFH = function() {
        if (window.vmFormWFH) window.vmFormWFH.closeModalRencana();
    };

    window.openModalLaporanWFH = function(id) {
        if (window.vmFormWFH) window.vmFormWFH.openModalLaporan(id);
    };

    window.closeModalLaporanWFH = function() {
        if (window.vmFormWFH) window.vmFormWFH.closeModalLaporan();
    };
});

// Logika Cetak WFH Rencana & Laporan dipisahkan ke js/cetak/cetak_wfh_rencana.js dan js/cetak/cetak_wfh_laporan.js
