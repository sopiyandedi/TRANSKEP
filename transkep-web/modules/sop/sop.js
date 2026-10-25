// ==========================================
// FILE: sop.js (Modul SOP Kedinasan)
// ==========================================

// --- Source: sop/js_sop.html ---
// ==========================================
// FILE: sop/js_sop.html (VUE.JS VERSION FULL FIX)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    window.vmSopApp = Vue.createApp({
        data() {
            return {
                globalState: window.vueState,
                currentSopFilter: 'Rekap per Pegawai',
                firestoreSops: [],
                isFirebaseConnected: false, // FIX: Tab Rekap menjadi default saat modul dibuka
                sopSearchQuery: '',
                expandedSopRows: [],
                expandedSopRekapRows: [],

                showModalSop: false,
                modalSopMode: 'add',
                formSop: {
                    id: '', judul_sop: '', kategori_pj: 'PJ. Kesekretariatan',
                    nomor_sop: '', tanggal_pembuatan: '', tanggal_revisi: '',
                    tanggal_efektif: '', link_drive: ''
                },
                sopPelaksanaTerpilih: [],
                sopPegawaiSearchInput: '',

                // TRANSKEP: State untuk Upload File PDF SOP, Drag-Drop & Pintasan Folder Drive
                sopSelectedFile: null,
                sopFileDataBase64: null,
                isUploadingSop: false,
                isDraggingSop: false,
                isOpeningDriveSop: false,
                sopDriveFolderUrl: null,

                showModalWaSop: false,
                waTargetSopObj: null,
                waSopTargets: [],

                showModalWaRekapSop: false,
                waTargetRekapSopObj: null,
                waRekapSopSelected: []
            };
        },
        computed: {
            unifiedSopList() {
                const sheetList = (this.globalState && this.globalState.sopList) ? this.globalState.sopList : [];
                const fsList = this.firestoreSops || [];
                const map = new Map();
                sheetList.forEach(item => {
                    if (item.id) map.set(String(item.id), item);
                });
                fsList.forEach(item => {
                    if (item.id) {
                        const existing = map.get(String(item.id)) || {};
                        map.set(String(item.id), { ...existing, ...item, is_firebase: true });
                    }
                });
                return Array.from(map.values());
            },
            isAdminOrOperator() {
                if(!this.globalState.user) return false;
                const role = this.globalState.user.role.toLowerCase();
                return role.includes('admin') || role.includes('operator');
            },
            canManageSop() {
                if(!this.globalState.user) return false;
                const role = this.globalState.user.role;
                return this.isAdminOrOperator || role === 'Admin' || role === 'Atasan Langsung' || role === 'Pejabat Berwenang';
            },
            groupTagsOptions() {
                return typeof GROUP_TAGS !== 'undefined' ? GROUP_TAGS : {};
            },
            filteredSopList() {
                let filtered = this.unifiedSopList;

                if (this.currentSopFilter !== 'Semua SOP' && this.currentSopFilter !== 'Rekap per Pegawai') {
                    filtered = filtered.filter(s => s.kategori_pj === this.currentSopFilter);
                }

                // FIX: Transparansi penuh. Tidak ada filter berdasarkan role pegawai di tab "Semua SOP".
                
                if (this.sopSearchQuery) {
                    const q = this.sopSearchQuery.toLowerCase();
                    filtered = filtered.filter(s => {
                        const j = s.judul_sop.toLowerCase();
                        const n = s.nomor_sop.toLowerCase();
                        let pelaksanaStr = '';
                        try {
                            const arr = JSON.parse(s.pelaksana_json || '[]');
                            pelaksanaStr = arr.map(p => this.getMemberNameDisplay(p.nip).toLowerCase()).join(' ');
                        } catch(e) {}
                        return j.includes(q) || n.includes(q) || pelaksanaStr.includes(q);
                    });
                }

                return filtered;
            },
            sopRekapData() {
                if (!this.globalState.usersList) return [];
                const allSops = this.unifiedSopList;

                let userMapping = this.globalState.usersList.map(u => {
                    let terlibatSops = allSops.filter(sop => {
                        try {
                            const arr = JSON.parse(sop.pelaksana_json || '[]');
                            if (typeof cekKeterlibatanPegawai !== 'undefined') {
                                return cekKeterlibatanPegawai(arr, u.nip).terlibat;
                            }
                            return arr.some(p => String(p.nip) === String(u.nip));
                        } catch(e) { return false; }
                    });

                    let readCount = 0;
                    terlibatSops.forEach(sop => {
                        if (this.isSopAcknowledged(sop.id, u.nip)) readCount++;
                    });

                    const progressPercent = terlibatSops.length > 0 ? Math.round((readCount / terlibatSops.length) * 100) : 0;

                    return {
                        user: u, sopList: terlibatSops, count: terlibatSops.length,
                        readCount: readCount,
                        progressPercent: progressPercent,
                        progressColor: progressPercent === 100 ? 'bg-emerald-500' : (progressPercent > 0 ? 'bg-amber-500' : 'bg-rose-500'),
                        textProgressColor: progressPercent === 100 ? 'text-emerald-400' : 'text-slate-500'
                    };
                });

                userMapping = userMapping.filter(item => item.count > 0);

                if (!this.isAdminOrOperator) {
                    userMapping = userMapping.filter(item => String(item.user.nip) === String(this.globalState.user.nip));
                }

                return userMapping.sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    return a.user.nama.localeCompare(b.user.nama);
                });
            },
            filteredSopRekapData() {
                if (!this.sopSearchQuery) return this.sopRekapData;
                const q = this.sopSearchQuery.toLowerCase();
                return this.sopRekapData.filter(item => item.user.nama.toLowerCase().includes(q) || item.user.nip.includes(q));
            }
        },
        methods: {
            getPjColorClass(pj) {
                if(pj === 'PJ. Manajemen') return "text-blue-400 bg-blue-500/10 border-blue-500/20";
                if(pj === 'PJ. Kepaniteraan') return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                if(pj === 'PJ. Kesekretariatan') return "text-amber-400 bg-amber-500/10 border-amber-500/20";
                return "text-slate-400 bg-slate-800 border-slate-700";
            },
            formatTglSop(dateStr) {
                if (!dateStr || dateStr === '-') return '-';
                try {
                    const d = new Date(dateStr);
                    if(isNaN(d)) return dateStr;
                    return d.toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
                } catch(e) { return dateStr; }
            },
            formatDateForInput(dateStr) {
                if (!dateStr || dateStr === '-') return '';
                try {
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return dateStr;
                    return d.toISOString().split('T')[0];
                } catch(e) { return ''; }
            },
            getTooltipProgressSop(readCount, total) {
                const unreadCount = total - readCount;
                return unreadCount > 0 ? "Kekurangan: " + unreadCount + " Dokumen SOP belum dibaca" : "Sempurna! Semua Dokumen SOP telah dibaca";
            },
            toggleSopDetail(id) {
                const idx = this.expandedSopRows.indexOf(id);
                if(idx !== -1) this.expandedSopRows.splice(idx, 1);
                else this.expandedSopRows.push(id);
            },
            toggleSopRekapRow(nip) {
                const idx = this.expandedSopRekapRows.indexOf(nip);
                if(idx !== -1) this.expandedSopRekapRows.splice(idx, 1);
                else this.expandedSopRekapRows.push(nip);
            },
            getParsedPelaksana(sop) {
                try { return JSON.parse(sop.pelaksana_json || '[]'); }
                catch(e) { return []; }
            },
            getSopPelaksanaCount(sop) {
                return this.getParsedPelaksana(sop).length;
            },
            isGroupMember(nip) {
                return String(nip).startsWith('[TAG:');
            },
            getMemberNameDisplay(nip) {
                if (this.isGroupMember(nip)) {
                    return this.groupTagsOptions[nip] ? "[GRUP] " + this.groupTagsOptions[nip].label : 'Data Dihapus';
                }
                const pns = (this.globalState.usersList || []).find(u => String(u.nip) === String(nip));
                return pns ? pns.nama : 'Unknown User';
            },
            getMemberJabatanDisplay(nip) {
                if (this.isGroupMember(nip)) {
                    const estimasi = typeof hitungEstimasiGrup === 'function' ? hitungEstimasiGrup(nip) : 0;
                    return "Sistem mendeteksi estimasi ±" + estimasi + " pegawai";
                }
                const pns = (this.globalState.usersList || []).find(u => String(u.nip) === String(nip));
                return pns ? pns.jabatan : '-';
            },
            getPeranDetail(sop, nip) {
                let peranDetail = '-';
                try {
                    const arr = JSON.parse(sop.pelaksana_json || '[]');
                    if (typeof cekKeterlibatanPegawai !== 'undefined') {
                        const cek = cekKeterlibatanPegawai(arr, nip);
                        if (cek.terlibat) peranDetail = cek.peran;
                    } else {
                        const found = arr.find(p => String(p.nip) === String(nip));
                        if (found && found.peran) peranDetail = found.peran;
                    }
                } catch(e) {}
                return peranDetail;
            },
            openFlipbookPdf(link, judul) {
                if (typeof window.openFlipbook === 'function') {
                    window.openFlipbook(link, judul);
                }
            },

            // FIX: Pintasan Buka Folder Google Drive TRANSKEP SOP (Anti-Popup Blocker)
            async openSopDriveFolder() {
                if (this.sopDriveFolderUrl) {
                    window.open(this.sopDriveFolderUrl, '_blank');
                    return;
                }
                const token = localStorage.getItem('transkep_session_token');
                this.isOpeningDriveSop = true;

                // Buka tab baru secara instan saat klik agar tidak diblokir Popup Blocker browser
                const newTab = window.open('about:blank', '_blank');
                if (newTab) {
                    newTab.document.write('<body style="background:#020617;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:14px;">Menghubungkan ke Folder Google Drive TRANSKEP SOP...</body>');
                }

                try {
                    const res = await window.SopDataService.getDriveFolderUrl(this.globalState.user.nip, token);
                    this.isOpeningDriveSop = false;
                    if (res && res.status === 'success' && res.url) {
                        this.sopDriveFolderUrl = res.url;
                        if (newTab) {
                            newTab.location.href = res.url;
                        } else {
                            window.open(res.url, '_blank');
                        }
                    } else {
                        if (newTab) newTab.close();
                        if(window.showNotify) window.showNotify("Gagal Membuka Folder", res ? res.message : "Respon tidak valid", "error");
                    }
                } catch(err) {
                    this.isOpeningDriveSop = false;
                    if (newTab) newTab.close();
                    if(window.showNotify) window.showNotify("Error Sistem", err.message || err.toString(), "error");
                }
            },

            // TRANSKEP: Format ukuran file (KB / MB)
            formatFileSize(bytes) {
                if (!bytes) return '0 B';
                if (bytes < 1024) return bytes + ' B';
                else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
                else return (bytes / 1048576).toFixed(2) + ' MB';
            },

            // FIX: Reset input file sebelum buka modal SOP
            openModalSop(mode, id = null) {
                this.modalSopMode = mode;
                this.sopPelaksanaTerpilih = [];
                this.sopPegawaiSearchInput = '';

                this.sopSelectedFile = null;
                this.sopFileDataBase64 = null;
                this.isUploadingSop = false;
                this.isDraggingSop = false;
                if (this.$refs.sopFileInput) this.$refs.sopFileInput.value = '';

                if (mode === 'add') {
                    this.formSop = {
                        id: '', judul_sop: '', kategori_pj: 'PJ. Kesekretariatan',
                        nomor_sop: '', tanggal_pembuatan: '', tanggal_revisi: '',
                        tanggal_efektif: '', link_drive: ''
                    };
                } else if (mode === 'edit') {
                    const sop = this.globalState.sopList.find(s => s.id === id);
                    if (sop) {
                        this.formSop = {
                            id: sop.id, judul_sop: sop.judul_sop, kategori_pj: sop.kategori_pj,
                            nomor_sop: sop.nomor_sop, link_drive: sop.link_drive,
                            tanggal_pembuatan: this.formatDateForInput(sop.tanggal_pembuatan),
                            tanggal_revisi: this.formatDateForInput(sop.tanggal_revisi !== '-' ? sop.tanggal_revisi : ''),
                            tanggal_efektif: this.formatDateForInput(sop.tanggal_efektif)
                        };
                        try { this.sopPelaksanaTerpilih = JSON.parse(sop.pelaksana_json || '[]'); } catch(e) {}
                    }
                }
                this.showModalSop = true;
            },

            // TRANSKEP: Fungsi terpusat validasi dan konversi File PDF SOP ke Base64
            async processSopFile(file, inputEl = null) {
                if (!file) return;
                try {
                    const result = await window.SopDataService.validateAndReadPdf(file);
                    this.sopFileDataBase64 = result.base64;
                    this.sopSelectedFile = result.file;
                } catch (err) {
                    if (inputEl) inputEl.value = '';
                    this.sopSelectedFile = null;
                    this.sopFileDataBase64 = null;
                    if (window.showNotify) window.showNotify("Pemeriksaan Berkas", err.message, "warning");
                }
            },

            handleSopFileSelect(event) {
                const file = event.target.files[0];
                this.processSopFile(file, event.target);
            },

            handleSopFileDrop(event) {
                this.isDraggingSop = false;
                const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
                this.processSopFile(file, this.$refs.sopFileInput);
            },

            handleAddPegawaiSopChange() {
                if(!this.sopPegawaiSearchInput) return;

                let targetNip = null;
                const inputVal = this.sopPegawaiSearchInput;
                const nipMatch = inputVal.match(/\((.*?)\)$/);

                if (nipMatch && nipMatch[1]) {
                    targetNip = nipMatch[1];
                }
                else {
                    const searchTxt = inputVal.toLowerCase();
                    const foundUser = (this.globalState.usersList || []).find(u => u.nama.toLowerCase().includes(searchTxt));
                    if (foundUser) {
                        targetNip = foundUser.nip;
                    } else {
                        const groupKeys = Object.keys(this.groupTagsOptions || {});
                        const foundGroupKey = groupKeys.find(key => this.groupTagsOptions[key].label.toLowerCase().includes(searchTxt));
                        if (foundGroupKey) targetNip = foundGroupKey;
                    }
                }

                if (targetNip) {
                    if (this.sopPelaksanaTerpilih.some(p => String(p.nip) === String(targetNip))) {
                        if(window.showNotify) window.showNotify("Duplikat", "Pegawai/Grup tersebut sudah ada dalam daftar pelaksana.", "warning");
                    } else {
                        const defaultPeran = targetNip.startsWith('[TAG:') ? "Sesuai Tupoksi" : "Pelaksana";
                        this.sopPelaksanaTerpilih.push({ nip: targetNip, peran: defaultPeran });
                    }
                    this.sopPegawaiSearchInput = "";
                } else {
                    if(window.showNotify) window.showNotify("Tidak Ditemukan", "Pegawai tidak ditemukan dari kata kunci tersebut.", "error");
                }
            },
            removePegawaiFromSop(nipToRemove) {
                this.sopPelaksanaTerpilih = this.sopPelaksanaTerpilih.filter(p => String(p.nip) !== String(nipToRemove));
            },
            async saveSopSubmit() {
                if (!this.formSop.judul_sop || !this.formSop.nomor_sop || !this.formSop.tanggal_pembuatan || !this.formSop.tanggal_efektif) {
                    if(window.showNotify) window.showNotify("Data Belum Lengkap", "Mohon lengkapi Judul, Nomor SOP, Tanggal Pembuatan, dan Tanggal Efektif.", "warning");
                    return;
                }

                if (this.modalSopMode === 'add' && !this.sopFileDataBase64) {
                    if(window.showNotify) window.showNotify("Dokumen Kosong", "Mohon unggah file dokumen (PDF) SOP terlebih dahulu.", "warning");
                    return;
                }

                const payload = {
                    ...this.formSop,
                    pelaksana: this.sopPelaksanaTerpilih,
                    fileBase64: this.sopFileDataBase64,
                    fileName: this.sopSelectedFile ? this.sopSelectedFile.name : null
                };
                const token = localStorage.getItem('transkep_session_token');

                this.isUploadingSop = true;
                if(window.showNotify && this.sopFileDataBase64) {
                    window.showNotify("Mengunggah File...", "Mohon jangan tutup jendela ini hingga proses upload ke Google Drive selesai.", "success");
                }

                try {
                    const res = await window.SopDataService.saveSop(payload, this.globalState.user.nip, token);
                    this.isUploadingSop = false;
                    if(res && res.status === 'success') {
                        this.showModalSop = false;
                        if(window.showNotify) window.showNotify("Berhasil Disimpan", res.message, "success");
                        if(typeof syncAllServerData === 'function') syncAllServerData();
                    } else {
                        if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Gagal menyimpan data", "error");
                    }
                } catch(err) {
                    this.isUploadingSop = false;
                    if(window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                }
            },
            deleteSopConfirm(id) {
                const token = localStorage.getItem('transkep_session_token');
                if(window.showCustomConfirm) {
                    window.showCustomConfirm(
                        "Hapus Dokumen SOP?",
                        "Tindakan ini tidak bisa dibatalkan. Riwayat persetujuan/baca dari pegawai untuk SOP ini juga akan dihapus.",
                        async () => {
                            // OPTIMISTIC DELETE SOP TAHAP 4 (0ms)
                            const backupSop = [...(this.globalState.sopList || [])];
                            const backupAck = [...(this.globalState.sopAckList || [])];
                            this.globalState.sopList = this.globalState.sopList.filter(s => s.id !== id);
                            this.globalState.sopAckList = this.globalState.sopAckList.filter(a => a.sop_id !== id);
                            if(window.showNotify) window.showNotify("SOP Dihapus ⚡", "Dokumen SOP telah dihapus dari daftar (0ms).", "info");

                            try {
                                const res = await window.SopDataService.deleteSop(id, this.globalState.user.nip, token);
                                if (!res || res.status !== 'success') {
                                    this.globalState.sopList = backupSop; this.globalState.sopAckList = backupAck;
                                    if(window.showNotify) window.showNotify("Gagal Hapus SOP", (res ? res.message : "Gagal menghapus.") + " (Data dikembalikan)", "error");
                                }
                            } catch (err) {
                                this.globalState.sopList = backupSop; this.globalState.sopAckList = backupAck;
                                if(window.showNotify) window.showNotify("Error", (err.message || err.toString()) + " (Data dikembalikan)", "error");
                            }
                        }
                    );
                }
            },

            isSopAcknowledged(sopId, nip) {
                if (this.globalState.sopAckList && this.globalState.sopAckList.some(a => String(a.sop_id) === String(sopId) && String(a.nip) === String(nip))) {
                    return true;
                }
                const fSop = (this.firestoreSops || []).find(s => String(s.id) === String(sopId));
                if (fSop && Array.isArray(fSop.acknowledgments)) {
                    return fSop.acknowledgments.some(a => String(a.nip) === String(nip));
                }
                const gSop = (this.globalState.sopList || []).find(s => String(s.id) === String(sopId));
                if (gSop && Array.isArray(gSop.acknowledgments)) {
                    return gSop.acknowledgments.some(a => String(a.nip) === String(nip));
                }
                return false;
            },
            getSopAckDate(sopId, nip) {
                if (this.globalState.sopAckList) {
                    const ackData = this.globalState.sopAckList.find(a => String(a.sop_id) === String(sopId) && String(a.nip) === String(nip));
                    if (ackData && ackData.tanggal_baca) return ackData.tanggal_baca.split(' ')[0];
                }
                const fSop = (this.firestoreSops || []).find(s => String(s.id) === String(sopId));
                if (fSop && Array.isArray(fSop.acknowledgments)) {
                    const ack = fSop.acknowledgments.find(a => String(a.nip) === String(nip));
                    if (ack && ack.tanggal_baca) return ack.tanggal_baca.split(' ')[0];
                }
                return '-';
            },
            doAcknowledgeSop(sopId, nip, isAuto = false) {
                const token = localStorage.getItem('transkep_session_token');
                
                const processAck = async () => {
                    const nowRaw = new Date();
                    const nowString = (("0"+nowRaw.getDate()).slice(-2)) + '/' + (("0"+(nowRaw.getMonth()+1)).slice(-2)) + '/' + nowRaw.getFullYear() + ' ' + nowRaw.toLocaleTimeString('en-GB');

                    if(!this.globalState.sopAckList) this.globalState.sopAckList = [];

                    this.globalState.sopAckList.push({
                        id: 'ACK-TEMP', sop_id: sopId, nip: nip,
                        tanggal_baca: nowString
                    });

                    if (typeof updateSidebarBadges === 'function') updateSidebarBadges();

                    try {
                        const res = await window.SopDataService.acknowledgeSop(sopId, nip, token);
                        if(res && res.status === 'success') {
                            if(!isAuto && window.showNotify) window.showNotify("Tercatat", res.message, "success");
                        } else {
                            this.globalState.sopAckList = this.globalState.sopAckList.filter(a => !(a.sop_id === sopId && a.nip === nip));
                            if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
                            if(!isAuto && window.showNotify) window.showNotify("Gagal", res ? res.message : "Gagal mencatat", "error");
                        }
                    } catch (err) {
                        this.globalState.sopAckList = this.globalState.sopAckList.filter(a => !(a.sop_id === sopId && a.nip === nip));
                        if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
                        if(!isAuto && window.showNotify) window.showNotify("Error", err.message || err.toString(), "error");
                    }
                };

                if (isAuto) {
                    processAck();
                } else if (window.showCustomConfirm) {
                    window.showCustomConfirm("Tandai Sudah Dibaca?", "Dengan menekan YA, Anda menyatakan telah membaca dan memahami isi dari Standar Operasional Prosedur ini.", processAck);
                }
            },
            markWaSent(event) {
                const el = event.currentTarget;
                el.className = "px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg transition text-xs font-bold flex items-center shadow-sm whitespace-nowrap";
                el.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Terkirim';
            },
            openWaSopBlast(sopId) {
                this.waTargetSopObj = this.globalState.sopList.find(s => String(s.id) === String(sopId));
                if(!this.waTargetSopObj) return;

                let pelaksanaArr = this.getParsedPelaksana(this.waTargetSopObj);
                let finalWaTargets = [];
                if (typeof cekKeterlibatanPegawai !== 'undefined') {
                    this.globalState.usersList.forEach(u => {
                        if (u.role === 'Admin') return;
                        const cek = cekKeterlibatanPegawai(pelaksanaArr, u.nip);
                        if (cek.terlibat) finalWaTargets.push({ user: u, peran: cek.peran });
                    });
                }
                this.waSopTargets = finalWaTargets;
                this.showModalWaSop = true;
            },
            generateWaSopLink(u, peran) {
                let phone = String(u.no_hp || '').replace(/[^0-9]/g, '');
                if(phone.startsWith('0')) phone = '62' + phone.substring(1);
                
                const rawMsg = "Halo *" + u.nama + "*, terdapat pembaharuan Dokumen SOP baru:\n\n" +
                               "*" + this.waTargetSopObj.judul_sop + "*\n" +
                               "Nomor: " + this.waTargetSopObj.nomor_sop + "\n" +
                               "Peran Anda: " + peran + "\n\n" +
                               "Harap buka portal *TRANSKEP* untuk membaca dan mengkonfirmasi pemahaman Anda (Acknowledgment). Terima kasih.";
                               
                return "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(rawMsg);
            },
            openWaRekapSopBlast(nip) {
                this.waTargetRekapSopObj = this.sopRekapData.find(item => String(item.user.nip) === String(nip));
                if(!this.waTargetRekapSopObj) return;

                this.waRekapSopSelected = this.waTargetRekapSopObj.sopList.map(sop => sop.id);
                this.showModalWaRekapSop = true;
            },
            toggleAllWaRekapSop() {
                if (this.waTargetRekapSopObj && this.waRekapSopSelected.length === this.waTargetRekapSopObj.sopList.length) {
                    this.waRekapSopSelected = [];
                } else {
                    this.waRekapSopSelected = this.waTargetRekapSopObj.sopList.map(sop => sop.id);
                }
            },
            sendBulkWaRekapSop() {
                if(!this.waTargetRekapSopObj) return;
                const u = this.waTargetRekapSopObj.user;

                let phone = String(u.no_hp || '').replace(/[^0-9]/g, '');
                if(phone.startsWith('0')) phone = '62' + phone.substring(1);

                if(phone.length < 9) {
                    if(window.showNotify) window.showNotify("Gagal Membuka WA", "Pegawai ini tidak memiliki nomor WhatsApp yang valid.", "error");
                    return;
                }

                if(this.waRekapSopSelected.length === 0) {
                    if(window.showNotify) window.showNotify("Pilih SOP", "Silakan centang minimal 1 SOP untuk dirakit ke dalam pesan.", "warning");
                    return;
                }

                let msg = "Halo *" + u.nama + "*, berikut adalah daftar Standar Operasional Prosedur (SOP) yang memuat Anda sebagai tim pelaksana:\n\n";
                let counter = 1;

                this.waTargetRekapSopObj.sopList.forEach(sop => {
                    if (this.waRekapSopSelected.includes(sop.id)) {
                        let peranDetail = this.getPeranDetail(sop, u.nip);
                        msg += counter + ". *" + sop.judul_sop + "*\n   Nomor: " + sop.nomor_sop + "\n   Peran: " + peranDetail + "\n\n";
                        counter++;
                    }
                });

                msg += "Harap segera membuka portal *TRANSKEP* untuk mengunduh PDF dan menekan tombol *Telah Dibaca & Dipahami* sebagai bukti kepatuhan (Acknowledgment). Terima kasih.";

                const waLink = "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(msg);
                window.open(waLink, '_blank');
                this.showModalWaRekapSop = false;
            },

            // ==========================================
            // CLOUD FIRESTORE REALTIME SYNC & MIGRATION
            // ==========================================
            initFirebaseSopListener() {
                if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
                    this.isFirebaseConnected = true;
                    console.log("🔥 [TRANSKEP SOP] Menghubungkan listener realtime Firestore SOP...");
                    TranskepFirebase.subscribeFirestoreSops((list) => {
                        this.firestoreSops = list || [];
                        console.log(`🔥 [TRANSKEP SOP] Realtime Sync: ${this.firestoreSops.length} dokumen SOP di Firestore.`);

                        // Sinkronkan ke globalState.sopList
                        if (this.globalState && Array.isArray(this.globalState.sopList)) {
                            this.firestoreSops.forEach(fSop => {
                                const idx = this.globalState.sopList.findIndex(s => String(s.id) === String(fSop.id));
                                if (idx > -1) {
                                    this.globalState.sopList[idx] = { ...this.globalState.sopList[idx], ...fSop, is_firebase: true };
                                } else {
                                    this.globalState.sopList.push({ ...fSop, is_firebase: true });
                                }

                                if (Array.isArray(fSop.acknowledgments) && Array.isArray(this.globalState.sopAckList)) {
                                    fSop.acknowledgments.forEach(ack => {
                                        const ackIdx = this.globalState.sopAckList.findIndex(a => String(a.sop_id) === String(fSop.id) && String(a.nip) === String(ack.nip));
                                        if (ackIdx > -1) {
                                            this.globalState.sopAckList[ackIdx] = { ...this.globalState.sopAckList[ackIdx], ...ack };
                                        } else {
                                            this.globalState.sopAckList.push({ id: `ACK-${fSop.id}-${ack.nip}`, sop_id: fSop.id, nip: ack.nip, tanggal_baca: ack.tanggal_baca });
                                        }
                                    });
                                }
                            });
                        }
                    });


                }
            },

            async migrateAllSopsToFirestore() {
                if (!this.isAdminOrOperator) return;
                const list = this.globalState.sopList || [];
                if (!list || list.length === 0) {
                    if (window.showNotify) window.showNotify("Data Kosong", "Belum ada data SOP di Spreadsheet untuk dimigrasikan.", "warning");
                    return;
                }

                const acks = this.globalState.sopAckList || [];
                const confirmFn = window.showCustomConfirm || ((title, msg, cb) => { if(confirm(title + "\n" + msg)) cb(); });
                confirmFn(
                    "Migrasi SOP ke Cloud Firestore",
                    `Apakah Anda ingin memigrasikan seluruh ${list.length} dokumen SOP beserta riwayat tanda baca pegawai ke Cloud Firestore (transkep-314c0)?`,
                    async () => {
                        if (window.showLoading) window.showLoading(`Memigrasikan data SOP ke Firestore...`);
                        try {
                            if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
                                throw new Error("Koneksi Firebase Firestore belum siap. Pastikan konfigurasi aktif.");
                            }
                            let count = 0;
                            for (const item of list) {
                                if (!item.id) continue;
                                const relatedAcks = acks.filter(a => String(a.sop_id) === String(item.id)).map(a => ({
                                    nip: a.nip,
                                    tanggal_baca: a.tanggal_baca
                                }));

                                let pelaksanaArr = [];
                                try { pelaksanaArr = JSON.parse(item.pelaksana_json || '[]'); } catch(e) { pelaksanaArr = []; }

                                await TranskepFirebase.saveSopToFirestore({
                                    id: item.id,
                                    judul_sop: item.judul_sop || '-',
                                    nomor_sop: item.nomor_sop || '-',
                                    kategori_pj: item.kategori_pj || 'PJ. Kesekretariatan',
                                    tanggal_pembuatan: item.tanggal_pembuatan || '',
                                    tanggal_revisi: item.tanggal_revisi || '-',
                                    tanggal_efektif: item.tanggal_efektif || '',
                                    link_drive: item.link_drive || '-',
                                    pelaksana: pelaksanaArr,
                                    pelaksana_json: item.pelaksana_json || '[]',
                                    acknowledgments: relatedAcks
                                });

                                count++;
                                if (window.showLoading && count % 5 === 0) {
                                    window.showLoading(`Memigrasikan ${count} / ${list.length} SOP ke Firestore...`);
                                }
                            }
                            if (window.hideLoading) window.hideLoading();
                            if (window.showNotify) {
                                window.showNotify("Sukses Migrasi! 🔥", `${count} dokumen SOP resmi tersimpan di Cloud Firestore (koleksi sop_documents).`, "success");
                            }
                        } catch (err) {
                            if (window.hideLoading) window.hideLoading();
                            if (window.showNotify) window.showNotify("Gagal Migrasi", err.message || err.toString(), "error");
                        }
                    }
                );
            }
        },
        mounted() {
            this.initFirebaseSopListener();
        }
    }).mount('#vue-sop-app');
});

// TRANSKEP: Menimpa renderSopView bawaan router
window.renderSopView = function() {};
