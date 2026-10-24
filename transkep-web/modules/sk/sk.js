// ==========================================
// FILE: sk.js (Modul Surat Keputusan)
// ==========================================

// --- Source: sk/js_sortir.html ---
/* STREAMING_CHUNK:Initializing global dictionary for job groups */
  // ==========================================
  // FILE: js_sortir.html
  // FUNGSI: Sentralisasi Logika Role-Based Access
  // ==========================================

  // 1. KAMUS PEMETAAN JABATAN (ROLE DICTIONARY)
  const GROUP_TAGS = {
    '[TAG:SEMUA_PEGAWAI]': {
      label: 'Seluruh Pegawai',
      keywords: [] // Kosong, karena mencakup semua secara otomatis
    },
    '[TAG:HAKIM]': {
      label: 'Kelompok Hakim',
      keywords: ['ketua', 'wakil ketua', 'hakim']
    },
    '[TAG:KEPANITERAAN]': {
      label: 'Kelompok Kepaniteraan',
      keywords: ['panitera', 'juru sita', 'jsp', 'panmud', 'klerek', 'analis perkara']
    },
    '[TAG:KESEKRETARIATAN]': {
      label: 'Kelompok Kesekretariatan',
      keywords: ['sekretaris', 'kasubbag', 'pranata', 'operator', 'penata', 'arsiparis']
    }
  };

  /* STREAMING_CHUNK:Defining core logic for evaluating user involvement */
  // 2. MESIN CEK KETERLIBATAN PEGAWAI (CORE FILTER)
  // Digunakan oleh Tabel SK dan Tabel SOP untuk mengecek apakah seorang NIP terlibat
  // Return: { terlibat: boolean, peran: string, isGrup: boolean }
  function cekKeterlibatanPegawai(pelaksanaArr, targetNip) {
    let result = { terlibat: false, peran: '-', isGrup: false };
    
    // Jika tidak ada data pelaksana, otomatis false
    if (!pelaksanaArr || pelaksanaArr.length === 0) return result;

    // Ambil identitas lengkap target (NIP dan Jabatannya) dari state global
    const targetUser = (typeof state !== 'undefined' && state.usersList) 
        ? state.usersList.find(u => String(u.nip) === String(targetNip)) 
        : null;

    if (!targetUser) return result;

    // PRIORITAS 1: Cek Ekplisit (Apakah NIP dia disebut spesifik?)
    const exactMatch = pelaksanaArr.find(p => String(p.nip) === String(targetNip));
    if (exactMatch) {
        return { terlibat: true, peran: exactMatch.peran || '-', isGrup: false };
    }

    // PRIORITAS 2: Cek Berdasarkan Grup Jabatan (Apakah dia kena efek TAG?)
    const targetJabatan = (targetUser.jabatan || '').toLowerCase();

    for (let i = 0; i < pelaksanaArr.length; i++) {
        const p = pelaksanaArr[i];
        const tagKey = String(p.nip); // Tag disimpan memanfaatkan properti nip

        if (tagKey.startsWith('[TAG:')) {
            // Evaluasi Jika Tag SEMUA PEGAWAI
            if (tagKey === '[TAG:SEMUA_PEGAWAI]') {
                return { terlibat: true, peran: p.peran || '-', isGrup: true };
            }

            // Evaluasi Jika Kelompok Tertentu
            const dictionaryItem = GROUP_TAGS[tagKey];
            if (dictionaryItem && dictionaryItem.keywords) {
                // Memindai apakah kata kunci kamus ada di dalam string jabatan pegawai
                const isMatch = dictionaryItem.keywords.some(kw => targetJabatan.includes(kw));
                if (isMatch) {
                    return { terlibat: true, peran: p.peran || '-', isGrup: true };
                }
            }
        }
    }

    return result; // Jika lolos semua cek dan tetap false
  }

  /* STREAMING_CHUNK:Defining group target estimation simulator */
  // 3. MESIN SIMULASI ESTIMASI TARGET (Untuk UI Form Tambah Data)
  // Digunakan untuk memberi tahu Admin berapa jumlah pegawai yang tercakup di grup tersebut
  function hitungEstimasiGrup(tagKey) {
    if (!tagKey || typeof state === 'undefined' || !state.usersList) return 0;
    
    // Jika tag SEMUA, hitung semua kecuali Admin IT
    if (tagKey === '[TAG:SEMUA_PEGAWAI]') {
        return state.usersList.filter(u => u.role !== 'Admin').length;
    }

    const dictionaryItem = GROUP_TAGS[tagKey];
    if (!dictionaryItem || !dictionaryItem.keywords) return 0;

    // Filter manual berdasarkan keywords
    const count = state.usersList.reduce((acc, u) => {
        const jab = (u.jabatan || '').toLowerCase();
        const isMatch = dictionaryItem.keywords.some(kw => jab.includes(kw));
        if (isMatch && u.role !== 'Admin') return acc + 1;
        return acc;
    }, 0);

    return count;
  }

// --- Source: sk/js_sk.html ---
// ==========================================
// FILE: sk/js_sk.html (VUE.JS VERSION FULL)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    window.vmSkApp = Vue.createApp({
        mixins: [window.SkBuilderMixin || {}],
        data() {
            return {
                globalState: window.vueState,
                currentSkTab: 'Pegawai', // FIX: Tab Rekap menjadi default saat modul dibuka
                skSearchQuery: '',
                expandedSkRows: [],
                expandedPegawaiRows: [],
                
                showModalSkForm: false,
                modalSkMode: 'add',
                formSk: {
                    id: '', tgl_input: '', judul_sk: '', pj_sk: 'PJ. Kesekretariatan',
                    link_drive: '', no_sk: '', tgl_sk: ''
                },
                tempMembers: [],
                skSearchMemberInput: '',

                // TRANSKEP: State untuk Upload File PDF, Drag-Drop & Pintasan Folder Drive
                skSelectedFile: null,
                skFileDataBase64: null,
                isUploading: false,
                isDraggingSk: false,
                isOpeningDriveSk: false,
                skDriveFolderUrl: null,

                showModalWaSk: false,
                waTargetSkObj: null,
                waSkTargets: [],
                
                showModalWaPegawaiSk: false,
                waTargetPegawaiObj: null,
                waPegawaiSkSelected: [],
                firestoreSks: [],
                isFirebaseConnected: false
            };
        },
        computed: {
            isAdminOrOperator() {
                if(!this.globalState.user) return false;
                const role = this.globalState.user.role.toLowerCase();
                return role.includes('admin') || role.includes('operator');
            },
            groupTagsOptions() {
                return typeof GROUP_TAGS !== 'undefined' ? GROUP_TAGS : {};
            },
            groupedSkData() {
                let mapGroup = {};
                (this.globalState.skList || []).forEach(sk => {
                   const baseId = String(sk.id).split('-').slice(0, 2).join('-');
                   if(!mapGroup[baseId]) {
                      let fallbackPj = (sk.pj_sk && sk.pj_sk !== '-' && sk.pj_sk !== 'undefined') ? sk.pj_sk : 'PJ. Kesekretariatan';
                      let parsedData = { no_sk: '-', tgl_sk: '-', pj: fallbackPj, peran: '-' };
                      try {
                         if(sk.tugas_sk && sk.tugas_sk.startsWith('{')) {
                             let j = JSON.parse(sk.tugas_sk);
                             parsedData = { no_sk: j.no_sk || '-', tgl_sk: j.tgl_sk || '-', pj: j.pj || fallbackPj, peran: j.peran || '-' };
                         }
                      } catch(e) {}
            
                      mapGroup[baseId] = {
                         id: baseId, judul_sk: sk.judul_sk, link_drive: sk.link_drive, 
                         tgl_input: (sk.tgl_input && sk.tgl_input !== 'undefined') ? sk.tgl_input : '-',
                         no_sk: parsedData.no_sk, tgl_sk: parsedData.tgl_sk, pj_sk: parsedData.pj, members: []
                      };
                   }
                   let peran = '-';
                   try { 
                       if(sk.tugas_sk && sk.tugas_sk.startsWith('{')) peran = JSON.parse(sk.tugas_sk).peran || '-'; 
                   } catch(e) {}
                   
                   mapGroup[baseId].members.push({ nip: sk.nip, peran: peran });
                });

                // TAHAP 44: Integrasi & Realtime Sync dari Cloud Firestore
                (this.firestoreSks || []).forEach(fSk => {
                    const docId = String(fSk.id).trim();
                    mapGroup[docId] = {
                        id: docId,
                        judul_sk: fSk.judul_sk || '-',
                        link_drive: fSk.link_drive || '-',
                        tgl_input: fSk.tgl_input || '-',
                        no_sk: fSk.no_sk || '-',
                        tgl_sk: fSk.tgl_sk || '-',
                        pj_sk: fSk.pj_sk || 'PJ. Kesekretariatan',
                        status: fSk.status || 'Aktif',
                        versi_aktif: fSk.versi_aktif || 1,
                        members: Array.isArray(fSk.members) ? fSk.members : [],
                        revisi_history: Array.isArray(fSk.revisi_history) ? fSk.revisi_history : [],
                        naskah_utama: fSk.naskah_utama || null,
                        lampiran: Array.isArray(fSk.lampiran) ? fSk.lampiran : [],
                        is_firebase: true
                    };
                });

                return Object.values(mapGroup).reverse();
            },
            filteredSkData() {
                let filtered = this.groupedSkData;
                if (this.currentSkTab !== 'all' && this.currentSkTab !== 'Pegawai') {
                   filtered = filtered.filter(sk => sk.pj_sk === this.currentSkTab);
                }
                
                // FIX: Hapus limitasi role Pegawai agar mereka bisa melihat seluruh dokumen SK
                // (Transparansi penuh untuk koleksi dokumen di tab Semua SK / Filter PJ)
                
                if (this.skSearchQuery) {
                    const q = this.skSearchQuery.toLowerCase();
                    filtered = filtered.filter(sk => {
                        let matchMembers = sk.members.some(m => this.getMemberNameDisplay(m.nip).toLowerCase().includes(q));
                        return sk.judul_sk.toLowerCase().includes(q) || sk.no_sk.toLowerCase().includes(q) || matchMembers;
                    });
                }
                return filtered;
            },
            groupedSkPegawaiData() {
                let mapPegawai = {};
                if (typeof cekKeterlibatanPegawai !== 'undefined') {
                    (this.globalState.usersList || []).forEach(u => {
                        if (u.role === 'Admin') return; 
                        
                        let terlibatSks = [];
                        this.groupedSkData.forEach(sk => {
                            const cek = cekKeterlibatanPegawai(sk.members, u.nip);
                            if (cek.terlibat) {
                                terlibatSks.push({
                                    id: sk.id, judul_sk: sk.judul_sk, link_drive: sk.link_drive, 
                                    no_sk: sk.no_sk, tgl_sk: sk.tgl_sk, peran: cek.peran
                                });
                            }
                        });
                        
                        if (terlibatSks.length > 0) {
                            let readCount = 0;
                            terlibatSks.forEach(sk => {
                                if (this.isSkAcknowledged(sk.id, u.nip)) readCount++;
                            });
                            
                            const progressPercent = Math.round((readCount / terlibatSks.length) * 100);
                            
                            mapPegawai[u.nip] = {
                                nip: u.nip, nama: u.nama, jabatan: u.jabatan, no_hp: u.no_hp, skList: terlibatSks,
                                readCount: readCount,
                                progressPercent: progressPercent,
                                progressColor: progressPercent === 100 ? 'bg-emerald-500' : (progressPercent > 0 ? 'bg-amber-500' : 'bg-rose-500'),
                                textProgressColor: progressPercent === 100 ? 'text-emerald-400' : 'text-slate-500'
                            };
                        }
                    });
                }
                
                const hierarki = ["Ketua", "Wakil Ketua", "Hakim", "Panitera", "Sekretaris", "Panitera Muda Gugatan", "Panitera Muda Permohonan", "Panitera Muda Hukum", "Kepala Sub Bagian Umum dan Keuangan", "Kepala Sub Bagian Kepegawaian, ORTALA", "Kepala Sub Bagian Perencanaan, TI dan Pelaporan", "Panitera Pengganti", "Juru Sita", "Juru Sita Pengganti", "Pranata Komputer Ahli Pertama", "Operator - Penata Layanan Operasional", "Arsiparis Terampil", "Klerek - Analis Perkara Peradilan", "Penata Layanan Operasional", "Operator Layanan Operasional"];
                
                return Object.values(mapPegawai).sort((a,b) => {
                    const idxA = hierarki.findIndex(j => j.toLowerCase() === (a.jabatan || '').toLowerCase().trim());
                    const idxB = hierarki.findIndex(j => j.toLowerCase() === (b.jabatan || '').toLowerCase().trim());
                    const bobotA = idxA !== -1 ? idxA : 999;
                    const bobotB = idxB !== -1 ? idxB : 999;
                    if (bobotA === bobotB) return a.nama.localeCompare(b.nama); 
                    return bobotA - bobotB;
                });
            },
            filteredSkPegawaiData() {
                let filtered = this.groupedSkPegawaiData;
                // FIX: Tab Rekap tetap aman, hanya menampilkan data milik user sendiri (jika bukan Admin)
                if (this.globalState.user && this.globalState.user.role === 'Pegawai') {
                   filtered = filtered.filter(p => String(p.nip) === String(this.globalState.user.nip));
                }
                if (this.skSearchQuery) {
                    const q = this.skSearchQuery.toLowerCase();
                    filtered = filtered.filter(p => p.nama.toLowerCase().includes(q) || p.nip.toLowerCase().includes(q));
                }
                return filtered;
            }
        },
        methods: {
            getPjColorClass(pj) {
                if(pj === 'PJ. Manajemen') return "text-blue-400 bg-blue-500/10 border-blue-500/20";
                if(pj === 'PJ. Kepaniteraan') return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                if(pj === 'PJ. Kesekretariatan') return "text-amber-400 bg-amber-500/10 border-amber-500/20";
                return "text-slate-400 bg-slate-800 border-slate-700";
            },
            formatTglSk(dateStr) {
                if (!dateStr || dateStr === '-') return '-';
                try {
                    const d = new Date(dateStr);
                    if(isNaN(d.getTime())) return dateStr;
                    return d.toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
                } catch(e) { return dateStr; }
            },
            getTooltipProgress(readCount, total) {
                const unreadCount = total - readCount;
                return unreadCount > 0 ? "Kekurangan: " + unreadCount + " Dokumen SK belum dibaca" : "Sempurna! Semua Dokumen SK telah dibaca";
            },
            toggleSkDetail(id) {
                const idx = this.expandedSkRows.indexOf(id);
                if(idx !== -1) this.expandedSkRows.splice(idx, 1);
                else this.expandedSkRows.push(id);
            },
            toggleSkPegawaiDetail(nip) {
                const idx = this.expandedPegawaiRows.indexOf(nip);
                if(idx !== -1) this.expandedPegawaiRows.splice(idx, 1);
                else this.expandedPegawaiRows.push(nip);
            },
            isGroupMember(nip) {
                return String(nip).startsWith('[TAG:');
            },
            getMemberNameDisplay(nip) {
                if (this.isGroupMember(nip)) {
                    return this.groupTagsOptions[nip] ? "[GRUP] " + this.groupTagsOptions[nip].label : 'Data Dihapus';
                }
                const pns = (this.globalState.usersList || []).find(u => String(u.nip) === String(nip));
                return pns ? pns.nama : 'Data Dihapus';
            },
            getMemberJabatanDisplay(nip) {
                if (this.isGroupMember(nip)) {
                    const estimasi = typeof hitungEstimasiGrup === 'function' ? hitungEstimasiGrup(nip) : 0;
                    return "Sistem mendeteksi estimasi ±" + estimasi + " pegawai";
                }
                const pns = (this.globalState.usersList || []).find(u => String(u.nip) === String(nip));
                return pns ? pns.jabatan : '-';
            },
            openFlipbookPdf(link, judul) {
                if (typeof window.openFlipbook === 'function') {
                    window.openFlipbook(link, judul);
                }
            },
            async openSkDriveFolder() {
                if (!this.globalState.user || !this.globalState.user.nip) {
                    if(window.showNotify) window.showNotify("Akses Ditolak", "Sesi Anda tidak valid.", "error");
                    return;
                }
                const token = localStorage.getItem('transkep_session_token');
                this.isOpeningDriveSk = true;

                const newTab = window.open('about:blank', '_blank');
                if (newTab) {
                    newTab.document.write('<body style="background:#020617;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:14px;">Menghubungkan ke Folder Google Drive TRANSKEP SK...</body>');
                }

                try {
                    const res = await window.SkDataService.getDriveFolderUrl(this.globalState.user.nip, token);
                    this.isOpeningDriveSk = false;
                    if (res && res.status === 'success' && res.url) {
                        this.skDriveFolderUrl = res.url;
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
                    this.isOpeningDriveSk = false;
                    if (newTab) newTab.close();
                    if(window.showNotify) window.showNotify("Error Sistem", err.message || err.toString(), "error");
                }
            },
            formatFileSize(bytes) {
                if (!bytes) return '0 B';
                if (bytes < 1024) return bytes + ' B';
                else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
                else return (bytes / 1048576).toFixed(2) + ' MB';
            },
            openSkFormModal(mode, id = null) {
                this.modalSkMode = mode;
                this.skSearchMemberInput = '';
                
                this.skSelectedFile = null;
                this.skFileDataBase64 = null;
                this.isUploading = false;
                this.isDraggingSk = false;
                if(this.$refs.skFileInput) this.$refs.skFileInput.value = '';
                
                if(mode === 'add') {
                    this.formSk = { id: '', tgl_input: '', judul_sk: '', pj_sk: 'PJ. Kesekretariatan', link_drive: '', no_sk: '', tgl_sk: '' };
                    this.tempMembers = [];
                } else {
                    const sk = this.groupedSkData.find(s => s.id === id);
                    if(sk) {
                        this.formSk = {
                            id: sk.id, tgl_input: sk.tgl_input, judul_sk: sk.judul_sk, pj_sk: sk.pj_sk,
                            link_drive: sk.link_drive, no_sk: sk.no_sk !== '-' ? sk.no_sk : "", tgl_sk: sk.tgl_sk !== '-' ? sk.tgl_sk : ""
                        };
                        this.tempMembers = JSON.parse(JSON.stringify(sk.members)); 
                    }
                }
                this.showModalSkForm = true;
            },
            async processSkFile(file, inputEl = null) {
                if (!file) return;
                try {
                    const result = await window.SkDataService.validateAndReadPdf(file);
                    this.skFileDataBase64 = result.base64;
                    this.skSelectedFile = result.file;
                } catch (err) {
                    if (inputEl) inputEl.value = '';
                    this.skSelectedFile = null;
                    this.skFileDataBase64 = null;
                    if (window.showNotify) window.showNotify("Pemeriksaan Berkas", err.message, "warning");
                }
            },
            handleSkFileSelect(event) {
                const file = event.target.files[0];
                this.processSkFile(file, event.target);
            },
            handleSkFileDrop(event) {
                this.isDraggingSk = false;
                const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
                this.processSkFile(file, this.$refs.skFileInput);
            },
            handleAddMemberChange() {
                if(!this.skSearchMemberInput) return;
    
                let targetNip = null;
                const inputVal = this.skSearchMemberInput;
                const nipMatch = inputVal.match(/\((.*?)\)$/);
    
                if (nipMatch && nipMatch[1]) {
                    targetNip = nipMatch[1];
                } else {
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
                    if(this.tempMembers.some(m => String(m.nip) === String(targetNip))) {
                        if(window.showNotify) window.showNotify("Duplikat", "Pegawai/Grup ini sudah ada di dalam daftar tim.", "warning");
                    } else {
                        const defaultPeran = targetNip.startsWith('[TAG:') ? "Sesuai Jabatan" : "Anggota";
                        this.tempMembers.push({ nip: targetNip, peran: defaultPeran });
                    }
                    this.skSearchMemberInput = ""; 
                } else {
                    if(window.showNotify) window.showNotify("Tidak Ditemukan", "Pegawai tidak ditemukan dari kata kunci tersebut.", "error");
                }
            },
            removeMember(nip) {
                this.tempMembers = this.tempMembers.filter(m => m.nip !== nip);
            },
            async submitSk() {
                if(this.tempMembers.length === 0) {
                    if(window.showNotify) window.showNotify("Gagal Disimpan", "Daftar susunan tim tidak boleh kosong.", "error"); 
                    return;
                }
                
                if (this.modalSkMode === 'add' && !this.skFileDataBase64) {
                    if(window.showNotify) window.showNotify("Dokumen Kosong", "Mohon unggah file dokumen (PDF) SK terlebih dahulu.", "warning");
                    return;
                }
                
                const payload = { 
                    ...this.formSk, 
                    members: this.tempMembers,
                    fileBase64: this.skFileDataBase64,
                    fileName: this.skSelectedFile ? this.skSelectedFile.name : null
                };
                
                const token = localStorage.getItem('transkep_session_token');
                
                this.isUploading = true;
                if(window.showNotify && this.skFileDataBase64) {
                    window.showNotify("Mengunggah File...", "Mohon jangan tutup jendela ini hingga proses upload ke Google Drive selesai.", "success");
                }
                
                try {
                    let res = null;
                    if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
                        const firestorePayload = {
                            id: payload.id || ('SK-' + Date.now()),
                            no_sk: payload.no_sk,
                            judul_sk: payload.judul_sk,
                            pj_sk: payload.pj_sk,
                            tgl_sk: payload.tgl_sk,
                            tgl_input: payload.tgl_input || new Date().toISOString().split('T')[0],
                            link_drive: payload.link_drive || '',
                            status: "Aktif",
                            versi_aktif: 1,
                            members: this.tempMembers || [],
                            revisi_history: [{
                                versi: 1,
                                tgl_revisi: payload.tgl_sk || new Date().toISOString().split('T')[0],
                                catatan: "Pendaftaran SK Baru via Form Input",
                                oleh: (this.globalState.user ? this.globalState.user.nama : "Admin")
                            }]
                        };
                        await TranskepFirebase.saveSkToFirestore(firestorePayload);
                    }

                    if (typeof google !== 'undefined' && google.script && google.script.run) {
                        res = await window.SkDataService.saveSk(payload, this.globalState.user.nip, token);
                    } else {
                        res = { status: 'success', message: 'Data SK berhasil disimpan ke Cloud Firestore.' };
                    }

                    this.isUploading = false;
                    if (res && res.status === 'success') {
                        this.showModalSkForm = false;
                        if(window.showNotify) window.showNotify("SK Tersimpan 🔥", res.message, "success");
                        if(typeof syncAllServerData === 'function') syncAllServerData(); 
                    } else {
                        if(window.showNotify) window.showNotify("Gagal Simpan", res ? res.message : "Gagal menyimpan data", "error");
                    }
                } catch (err) {
                    this.isUploading = false;
                    if(window.showNotify) window.showNotify("Error Sistem", err.message || err.toString(), "error");
                }
            },
            deleteSkRecord(id) {
                const token = localStorage.getItem('transkep_session_token');
                if(window.showCustomConfirm) {
                    window.showCustomConfirm("Hapus Surat Keputusan", "Anda yakin ingin menghapus seluruh catatan keikutsertaan penugasan pada SK ini?", async () => {
                        if(window.showLoading) window.showLoading("Menghapus berkas SK...");
                        try {
                            if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
                                try {
                                    await TranskepFirebase.deleteSkFromFirestore(id);
                                } catch (e) {
                                    console.warn("Firestore delete warning:", e);
                                }
                            }
                            let res = null;
                            if (typeof google !== 'undefined' && google.script && google.script.run) {
                                res = await window.SkDataService.deleteSk(id, this.globalState.user.nip, token);
                            } else {
                                res = { status: 'success', message: 'Dokumen SK berhasil dihapus dari Cloud Firestore.' };
                            }
                            if(window.hideLoading) window.hideLoading();
                            if (res && res.status === 'success') {
                                if(window.showNotify) window.showNotify("Dihapus", res.message, "success");
                                if(typeof syncAllServerData === 'function') syncAllServerData(); 
                            } else {
                                if(window.showNotify) window.showNotify("Gagal Hapus", res ? res.message : "Gagal menghapus data", "error");
                            }
                        } catch (err) {
                            if(window.hideLoading) window.hideLoading();
                            if(window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                        }
                    });
                }
            },
            isSkAcknowledged(skId, nip) {
                if(!this.globalState.skAckList) return false;
                const cleanSkId = String(skId).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
                const cleanNip = String(nip).replace(/'/g, "").trim();
                return this.globalState.skAckList.some(a => {
                    const aSkId = String(a.sk_id).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
                    const aNip = String(a.nip).replace(/'/g, "").trim();
                    return aSkId === cleanSkId && aNip === cleanNip;
                });
            },
            getSkAckDate(skId, nip) {
                if(!this.globalState.skAckList) return '';
                const cleanSkId = String(skId).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
                const cleanNip = String(nip).replace(/'/g, "").trim();
                const ack = this.globalState.skAckList.find(a => {
                    const aSkId = String(a.sk_id).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
                    const aNip = String(a.nip).replace(/'/g, "").trim();
                    return aSkId === cleanSkId && aNip === cleanNip;
                });
                return ack ? ack.tanggal_baca.split(' ')[0] : '';
            },
            doAcknowledgeSk(skId, nip) {
                const token = localStorage.getItem('transkep_session_token');
                if(window.showCustomConfirm) {
                    window.showCustomConfirm("Tandai Sudah Dibaca?", "Dengan menekan YA, Anda menyatakan telah membaca dan memahami tugas/peran Anda di dalam Surat Keputusan (SK) ini.", async () => {
                        const nowRaw = new Date();
                        if(!this.globalState.skAckList) this.globalState.skAckList = [];
                        
                        this.globalState.skAckList.push({
                            id: 'ACK-TEMP', sk_id: skId, nip: nip, 
                            tanggal_baca: nowRaw.toLocaleDateString('en-GB') + ' ' + nowRaw.toLocaleTimeString('en-GB')
                        });
                        
                        if (typeof updateSidebarBadges === 'function') updateSidebarBadges(); 
                        
                        try {
                            const res = await window.SkDataService.acknowledgeSk(skId, nip, token);
                            if(res && res.status === 'success') {
                                if(window.showNotify) window.showNotify("Tercatat", res.message, "success");
                            } else {
                                this.globalState.skAckList = this.globalState.skAckList.filter(a => !(a.sk_id === skId && a.nip === nip));
                                if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
                                if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Gagal mencatat", "error");
                            }
                        } catch (err) { 
                            this.globalState.skAckList = this.globalState.skAckList.filter(a => !(a.sk_id === skId && a.nip === nip));
                            if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
                            if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error"); 
                        }
                    });
                }
            },
            markWaSent(event) {
                const el = event.currentTarget;
                el.className = "px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg transition text-xs font-bold flex items-center shadow-sm whitespace-nowrap";
                el.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Terkirim';
            },
            openWaModal(skId) {
                this.waTargetSkObj = this.groupedSkData.find(s => s.id === skId);
                if(!this.waTargetSkObj) return;

                let finalWaTargets = [];
                if (typeof cekKeterlibatanPegawai !== 'undefined') {
                    (this.globalState.usersList || []).forEach(u => {
                        if (u.role === 'Admin') return;
                        const cek = cekKeterlibatanPegawai(this.waTargetSkObj.members, u.nip);
                        if (cek.terlibat) finalWaTargets.push({ user: u, peran: cek.peran });
                    });
                }
                this.waSkTargets = finalWaTargets;
                this.showModalWaSk = true;
            },
            generateWaLinkSk(pns, peranAktual) {
                const cleanNo = String(pns.no_hp).replace(/[^0-9]/g, "");
                const formattedNo = cleanNo.startsWith("0") ? "62" + cleanNo.slice(1) : cleanNo;
                
                let sapaan = "Bapak/Ibu";
                let cleanNip = String(pns.nip).replace(/[^0-9]/g, '');
                if (cleanNip.length === 18) {
                    if (cleanNip.charAt(14) === '1') sapaan = "Bapak";
                    else if (cleanNip.charAt(14) === '2') sapaan = "Ibu";
                }
                
                const pesanWa = "Yth. " + sapaan + " *" + pns.nama + "*,\n\n" +
                                "Kami informasikan bahwa Anda telah ditetapkan sebagai *" + peranAktual + "* ke dalam *" + this.waTargetSkObj.judul_sk + "*.\n\n" +
                                "Mohon mengunduh & mempelajari surat keputusan resmi melalui tautan PDF berikut:\n" + this.waTargetSkObj.link_drive + "\n\n" +
                                "Terima Kasih.\n_Sistem Kepegawaian TRANSKEP_";
                                
                return "https://api.whatsapp.com/send?phone=" + formattedNo + "&text=" + encodeURIComponent(pesanWa);
            },
            openWaPegawaiModal(nip) {
                this.waTargetPegawaiObj = this.groupedSkPegawaiData.find(p => p.nip === nip);
                if(!this.waTargetPegawaiObj) return;
                
                this.waPegawaiSkSelected = this.waTargetPegawaiObj.skList.map(sk => sk.id);
                this.showModalWaPegawaiSk = true;
            },
            toggleWaPegawaiCheckAll() {
                if(this.waTargetPegawaiObj && this.waPegawaiSkSelected.length === this.waTargetPegawaiObj.skList.length) {
                    this.waPegawaiSkSelected = [];
                } else {
                    this.waPegawaiSkSelected = this.waTargetPegawaiObj.skList.map(sk => sk.id);
                }
            },
            executeWaPegawai() {
                if(this.waPegawaiSkSelected.length === 0) {
                    if(window.showNotify) window.showNotify("Peringatan", "Pilih minimal 1 SK untuk dikirimkan.", "error"); 
                    return;
                }
          
                if(!this.waTargetPegawaiObj.no_hp || this.waTargetPegawaiObj.no_hp.length < 9) {
                    if(window.showNotify) window.showNotify("Nomor Tidak Valid", "Nomor WA pegawai tidak ditemukan/valid.", "error"); 
                    return;
                }
          
                let pesan = "Yth. Bapak/Ibu *" + this.waTargetPegawaiObj.nama + "*,\n\nKami informasikan bahwa Anda telah ditetapkan ke dalam Beberapa SK sebagai berikut:\n\n";
                
                let counter = 1;
                this.waTargetPegawaiObj.skList.forEach(sk => {
                    if (this.waPegawaiSkSelected.includes(sk.id)) {
                        pesan += counter + ". SK *" + sk.judul_sk + "* sebagai *" + sk.peran + "*\n";
                        pesan += "Mohon mengunduh & mempelajari surat keputusan melalui tautan PDF berikut:\n" + sk.link_drive + "\n\n";
                        counter++;
                    }
                });
          
                pesan += "Terima Kasih.\n_Sistem Kepegawaian TRANSKEP_";
          
                const cleanNo = this.waTargetPegawaiObj.no_hp.replace(/[^0-9]/g, "");
                const formattedNo = cleanNo.startsWith("0") ? "62" + cleanNo.slice(1) : cleanNo;
                const waUrl = "https://api.whatsapp.com/send?phone=" + formattedNo + "&text=" + encodeURIComponent(pesan);
                
                window.open(waUrl, "_blank");
                this.showModalWaPegawaiSk = false;
                
                if(window.showNotify) window.showNotify("WhatsApp Dibuka", "Silakan klik tombol kirim di aplikasi WhatsApp Anda.", "success");
            },

            // ==========================================
            // TAHAP 44: CLOUD FIRESTORE METHODS
            // ==========================================
            initFirebaseSkListener() {
                if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady()) {
                    this.isFirebaseConnected = true;
                    console.log("🔥 [TRANSKEP SK] Menghubungkan listener realtime Firestore SK...");
                    TranskepFirebase.subscribeFirestoreSks((list) => {
                        this.firestoreSks = list || [];
                        console.log(`🔥 [TRANSKEP SK] Realtime Sync: ${this.firestoreSks.length} dokumen SK aktif di Firestore.`);
                    });
                }
            },
            async migrateSingleSkToFirestore(sk) {
                if (!this.isAdminOrOperator) return;
                if (!sk) {
                    if (window.showNotify) window.showNotify("Data Kosong", "Pilih dokumen SK yang ingin dimigrasikan.", "warning");
                    return;
                }

                const confirmFn = window.showCustomConfirm || ((title, msg, cb) => { if(confirm(title + "\n" + msg)) cb(); });
                confirmFn(
                    "Migrasi ke Cloud Firestore",
                    `Migrasikan dokumen "${sk.judul_sk}" (${sk.members ? sk.members.length : 0} personil) ke Cloud Firestore (transkep-314c0)?`,
                    async () => {
                        if (window.showLoading) window.showLoading("Mengirim dokumen ke Firestore...");
                        try {
                            if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
                                throw new Error("Koneksi Firebase belum siap. Pastikan Firestore aktif.");
                            }
                            await TranskepFirebase.saveSkToFirestore({
                                id: sk.id,
                                no_sk: sk.no_sk,
                                judul_sk: sk.judul_sk,
                                pj_sk: sk.pj_sk,
                                tgl_sk: sk.tgl_sk,
                                tgl_input: sk.tgl_input,
                                link_drive: sk.link_drive,
                                status: "Aktif",
                                versi_aktif: 1,
                                members: sk.members || [],
                                revisi_history: [{
                                    versi: 1,
                                    tgl_revisi: sk.tgl_sk || new Date().toISOString().split('T')[0],
                                    catatan: "Migrasi perdana dari Google Sheets",
                                    oleh: (this.globalState.user ? this.globalState.user.nama : "Admin")
                                }]
                            });
                            if (window.hideLoading) window.hideLoading();
                            if (window.showNotify) {
                                window.showNotify("Sukses ke Firestore! 🔥", "Dokumen SK berhasil tersimpan di Cloud Firestore transkep-314c0.", "success");
                            }
                        } catch (err) {
                            if (window.hideLoading) window.hideLoading();
                            if (window.showNotify) window.showNotify("Gagal Migrasi", err.message || err.toString(), "error");
                        }
                    }
                );
            },
            migrateFirstSkToFirestore() {
                const list = this.groupedSkData;
                if (!list || list.length === 0) {
                    if (window.showNotify) window.showNotify("Data Kosong", "Belum ada dokumen SK untuk dimigrasikan.", "warning");
                    return;
                }
                const targetSk = list.find(s => !s.is_firebase) || list[0];
                this.migrateSingleSkToFirestore(targetSk);
            }
        },
        mounted() {
            this.initFirebaseSkListener();
        }
    }).mount('#vue-sk-app');
});

// TRANSKEP: Menimpa renderSkView bawaan agar router Vanilla tidak menabrak
window.renderSkView = function() {};
