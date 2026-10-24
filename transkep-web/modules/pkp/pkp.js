// ==========================================
// FILE: pkp.js (TRANSKEP Modular)
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

// --- Source: pkp/js_pkp_core.html ---
/**
 * ========================================================
 * KONTROLER MODUL PKP (CORE & BACKEND CONNECTOR)
 * File: js_pkp_core.html
 * ========================================================
 */

function initPkpModule() {
    try {
        console.log("🚀 TRANSKEP: Menjalankan initPkpModule()...");
        if (typeof mountPkpApp === 'function') mountPkpApp();
        
        var role = state.user ? state.user.role : '';
        var cleanUserNip = state.user ? String(state.user.nip).replace(/'/g, "").trim() : "";
        const token = localStorage.getItem('transkep_session_token');

        var btnVerifikasi = document.getElementById("btn-pkp-verifikasi");
        var btnRekap = document.getElementById("btn-pkp-rekap");
        var btnRiwayat = document.getElementById("btn-pkp-riwayat");
        var tabLapis1Container = btnRiwayat ? btnRiwayat.parentElement : null;
        
        if(btnVerifikasi) btnVerifikasi.classList.add("hidden");
        if(btnRekap) btnRekap.classList.add("hidden");
        if(tabLapis1Container) tabLapis1Container.classList.add("hidden");

        if (role === 'Admin' || role === 'Operator' || role === 'Atasan Langsung' || role === 'Pejabat Berwenang') {
            if(tabLapis1Container) tabLapis1Container.classList.remove("hidden");
            if(btnVerifikasi) btnVerifikasi.classList.remove("hidden");
        }
        if (role === 'Admin' || role === 'Operator') {
            if(btnRekap) btnRekap.classList.remove("hidden");
        }
        
        var filterTahun = document.getElementById("filterTahunPCK");
        if (filterTahun && filterTahun.options.length === 0) {
            var currentYear = new Date().getFullYear();
            filterTahun.innerHTML = "<option value='" + (currentYear + 1) + "'>Tahun " + (currentYear + 1) + "</option>" +
                                    "<option value='" + currentYear + "' selected>Tahun " + currentYear + "</option>" +
                                    "<option value='" + (currentYear - 1) + "'>Tahun " + (currentYear - 1) + "</option>";
        }

        showLoading("Sinkronisasi Modul PKP...");
        if (typeof PkpDataService !== 'undefined') {
            PkpDataService.getDataDokumenPKP(cleanUserNip, role, token)
                .then(function(resPK) {
                    var safePK = Array.isArray(resPK) ? resPK : ((resPK && Array.isArray(resPK.data)) ? resPK.data : []);
                    state.pkpDokumen = safePK;
                    if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
                    
                    return PkpDataService.getDataDokumenPCK(cleanUserNip, role, token);
                })
                .then(function(resPCK) {
                    hideLoading();
                    var safePCK = Array.isArray(resPCK) ? resPCK : ((resPCK && Array.isArray(resPCK.data)) ? resPCK.data : []);
                    state.pckDokumen = safePCK;
                    if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
                    
                    if (window.vmPkpApp) {
                        window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
                    }
                    switchMainTabPKP('PK'); 
                    if (typeof updateBadgeVerifikasiPKP === 'function') updateBadgeVerifikasiPKP();
                })
                .catch(function(e) {
                    hideLoading();
                    showNotify("Gagal Tarik Data PKP/PCK", e.message || String(e), "error");
                });
        } else if (typeof google !== 'undefined' && google.script) {
            google.script.run
                .withSuccessHandler(function(resPK) {
                    var safePK = Array.isArray(resPK) ? resPK : ((resPK && Array.isArray(resPK.data)) ? resPK.data : []);
                    state.pkpDokumen = safePK;
                    if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
                    
                    google.script.run
                        .withSuccessHandler(function(resPCK) {
                            hideLoading();
                            var safePCK = Array.isArray(resPCK) ? resPCK : ((resPCK && Array.isArray(resPCK.data)) ? resPCK.data : []);
                            state.pckDokumen = safePCK;
                            if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
                            
                            if (window.vmPkpApp) {
                                window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
                            }
                            switchMainTabPKP('PK'); 
                            if (typeof updateBadgeVerifikasiPKP === 'function') updateBadgeVerifikasiPKP();
                        })
                        .withFailureHandler(function(e) {
                            hideLoading();
                            showNotify("Gagal Tarik PCK", e.message, "error");
                        })
                        .getDataDokumenPCK(cleanUserNip, role, token);
                })
                .withFailureHandler(function(e) {
                    hideLoading();
                    showNotify("Gagal Tarik PKP", e.message, "error");
                })
                .getDataDokumenPKP(cleanUserNip, role, token);
        } else {
            setTimeout(function() {
                hideLoading();
                if (window.vmPkpApp) {
                    window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
                }
                switchMainTabPKP('PK'); 
            }, 500);
        }
    } catch (e) {
        console.error("Error di initPkpModule:", e);
    }
}

function switchMainTabPKP(tipe) {
    state.activeMainTab = tipe;
    if (window.vmPkpApp) {
        window.vmPkpApp.activeMainTab = tipe;
    }
    
    var activeLapis1 = state.activeLapis1 || 'riwayat';
    var vPkRiwayat = document.getElementById("viewListPK-riwayat");
    var vPckRiwayat = document.getElementById("viewListPCK-riwayat");
    var vPkVerif = document.getElementById("viewListPK-verifikasi");
    var vPckVerif = document.getElementById("viewListPCK-verifikasi");
    var vPkRekap = document.getElementById("viewListPK-rekap");
    var vPckRekap = document.getElementById("viewListPCK-rekap");
    
    var btnPk = document.getElementById("btnMainTabPK");
    var btnPck = document.getElementById("btnMainTabPCK");
    var btnAction = document.getElementById("btnActionPKP");
    
    var filterBulan = document.getElementById("filterBulanPCK");
    var btnCetakRekap = document.getElementById("btnCetakRekapPCK");

    var activeClassArray = ["bg-indigo-600", "hover:bg-indigo-500", "text-white", "shadow-lg", "shadow-indigo-600/20"];
    var inactiveClassArray = ["text-slate-400", "hover:text-slate-200", "hover:bg-slate-800"];
    
    function toggleMainClasses(btn, makeActive) {
        if(!btn) return;
        if(makeActive) {
            btn.classList.remove(...inactiveClassArray);
            btn.classList.add(...activeClassArray);
        } else {
            btn.classList.remove(...activeClassArray);
            btn.classList.add(...inactiveClassArray);
        }
    }

    if (tipe === "PK") {
        if(vPkRiwayat) vPkRiwayat.classList.remove("hidden"); 
        if(vPkVerif) vPkVerif.classList.remove("hidden");
        if(vPkRekap) vPkRekap.classList.remove("hidden");
        if(vPckRiwayat) vPckRiwayat.classList.add("hidden"); 
        if(vPckVerif) vPckVerif.classList.add("hidden");
        if(vPckRekap) vPckRekap.classList.add("hidden");

        toggleMainClasses(btnPk, true);
        toggleMainClasses(btnPck, false);
        
        if(filterBulan) filterBulan.classList.add("hidden");
        if(btnCetakRekap) btnCetakRekap.classList.add("hidden");

        if(btnAction) {
            btnAction.className = "shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex justify-center items-center gap-2 text-sm whitespace-nowrap";
            btnAction.innerHTML = "<i class='fa-solid fa-plus'></i> Buat Target PK Baru";
            btnAction.setAttribute("onclick", "openModalPK(false)");
        }
        
        if (typeof renderListPK === 'function') renderListPK();
        if (typeof renderRekapPK === 'function') renderRekapPK();
    } else {
        if(vPkRiwayat) vPkRiwayat.classList.add("hidden"); 
        if(vPkVerif) vPkVerif.classList.add("hidden");
        if(vPkRekap) vPkRekap.classList.add("hidden");
        if(vPckRiwayat) vPckRiwayat.classList.remove("hidden"); 
        if(vPckVerif) vPckVerif.classList.remove("hidden");
        if(vPckRekap) vPckRekap.classList.remove("hidden");
        
        toggleMainClasses(btnPk, false);
        toggleMainClasses(btnPck, true);

        if (activeLapis1 === 'rekap') {
            if(filterBulan) filterBulan.classList.remove("hidden");
            if(btnCetakRekap) btnCetakRekap.classList.remove("hidden");
        }

        if(btnAction) {
            btnAction.className = "shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex justify-center items-center gap-2 text-sm whitespace-nowrap";
            btnAction.innerHTML = "<i class='fa-solid fa-plus'></i> Lapor PCK Bulan Baru";
            btnAction.setAttribute("onclick", "openModalPCK(false)");
        }
        
        if (typeof renderListPCK === 'function') renderListPCK();
        if (typeof renderRekapPCK === 'function') renderRekapPCK();
    }
}

function switchTabLapis1PKP(tabName) {
    state.activeLapis1 = tabName;
    if (window.vmPkpApp) {
        window.vmPkpApp.activeLapis1 = tabName;
    }
    var areaRiwayat = document.getElementById("pkp-area-riwayat");
    var areaVerifikasi = document.getElementById("pkp-area-verifikasi");
    var areaRekap = document.getElementById("pkp-area-rekap");
    var btnRiwayat = document.getElementById("btn-pkp-riwayat");
    var btnVerifikasi = document.getElementById("btn-pkp-verifikasi");
    var btnRekap = document.getElementById("btn-pkp-rekap");

    var activeClasses = ["bg-indigo-600", "hover:bg-indigo-500", "text-white", "shadow-lg", "shadow-indigo-600/20"];
    var inactiveClasses = ["text-slate-400", "hover:text-slate-200", "hover:bg-slate-800"];

    var filterBulan = document.getElementById("filterBulanPCK");
    var btnCetakRekap = document.getElementById("btnCetakRekapPCK");

    function toggleClasses(btn, makeActive) {
        if(!btn) return;
        if(makeActive) {
            btn.classList.remove(...inactiveClasses);
            btn.classList.add(...activeClasses);
        } else {
            btn.classList.remove(...activeClasses);
            btn.classList.add(...inactiveClasses);
        }
    }

    areaRiwayat.classList.add("hidden"); areaVerifikasi.classList.add("hidden"); areaRekap.classList.add("hidden");
    
    toggleClasses(btnRiwayat, false);
    toggleClasses(btnVerifikasi, false);
    toggleClasses(btnRekap, false);

    if (tabName === 'riwayat') {
        areaRiwayat.classList.remove("hidden");
        toggleClasses(btnRiwayat, true);
        document.getElementById("btnActionPKP").style.display = ""; 

        if(filterBulan) filterBulan.classList.add("hidden");
        if(btnCetakRekap) btnCetakRekap.classList.add("hidden");

    } else if (tabName === 'verifikasi') {
        areaVerifikasi.classList.remove("hidden");
        toggleClasses(btnVerifikasi, true);
        document.getElementById("btnActionPKP").style.display = "none";

        if(filterBulan) filterBulan.classList.add("hidden");
        if(btnCetakRekap) btnCetakRekap.classList.add("hidden");

        if(typeof renderAllTabelPKP === 'function') renderAllTabelPKP();
    } else if (tabName === 'rekap') {
        areaRekap.classList.remove("hidden");
        toggleClasses(btnRekap, true);
        document.getElementById("btnActionPKP").style.display = "none";

        if (state.activeMainTab === 'PCK') {
            if(filterBulan) filterBulan.classList.remove("hidden");
            if(btnCetakRekap) btnCetakRekap.classList.remove("hidden");
        }

        if(typeof renderRekapPK === 'function') renderRekapPK();
        if(typeof renderRekapPCK === 'function') renderRekapPCK();
    }
}

function hapusDokumenPK(idPKP) {
    const token = localStorage.getItem('transkep_session_token');
    const userNip = state.user ? state.user.nip : '';
    showCustomConfirm("Hapus Dokumen PK", "Anda yakin ingin menghapus Permanen dokumen ini?", function() {
        if (typeof PkpDataService !== 'undefined') {
            PkpDataService.aksiDokumenPKP(idPKP, "Hapus", userNip, token).catch(e => console.warn(e));
        } else if (typeof google !== 'undefined' && google.script) {
            google.script.run.aksiDokumenPKP(idPKP, "Hapus", userNip, token);
        }
        state.pkpDokumen = (Array.isArray(state.pkpDokumen) ? state.pkpDokumen : []).filter(function(item) { return String(item.id_pkp) !== String(idPKP); });
        if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
        if (window.vmPkpApp) window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
        if(typeof renderListPK === 'function') renderListPK();
        showNotify("Dihapus", "Dokumen PK berhasil dihapus.", "success");
    });
}

function hapusDokumenPCK(idPCK) {
    const token = localStorage.getItem('transkep_session_token');
    const userNip = state.user ? state.user.nip : '';
    showCustomConfirm("Hapus Laporan PCK", "Anda yakin ingin menghapus Laporan bulan ini?", function() {
        if (typeof PkpDataService !== 'undefined') {
            PkpDataService.aksiDokumenPCK(idPCK, "Hapus", userNip, token).catch(e => console.warn(e));
        } else if (typeof google !== 'undefined' && google.script) {
            google.script.run.aksiDokumenPCK(idPCK, "Hapus", userNip, token);
        }
        state.pckDokumen = (Array.isArray(state.pckDokumen) ? state.pckDokumen : []).filter(function(item) { return String(item.id_pck) !== String(idPCK); });
        if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
        if (window.vmPkpApp) window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
        if(typeof renderListPCK === 'function') renderListPCK();
        showNotify("Dihapus", "Laporan PCK berhasil dihapus.", "success");
    });
}

function kirimDokumenPK(idPKP) {
    const token = localStorage.getItem('transkep_session_token');
    const userNip = state.user ? state.user.nip : '';
    showCustomConfirm("Kirim Dokumen PK", "Kirim ke Atasan Penilai? Setelah dikirim, Anda tidak bisa mengedit dokumen ini lagi.", function() {
        if (typeof PkpDataService !== 'undefined') {
            PkpDataService.aksiDokumenPKP(idPKP, "Kirim", userNip, token).catch(e => console.warn(e));
        } else if (typeof google !== 'undefined' && google.script) {
            google.script.run.aksiDokumenPKP(idPKP, "Kirim", userNip, token);
        }
        for(var i=0; i<state.pkpDokumen.length; i++) {
            if(String(state.pkpDokumen[i].id_pkp) === String(idPKP)) state.pkpDokumen[i].status = "Menunggu Penilai";
        }
        if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
        if (window.vmPkpApp) window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
        if(typeof renderListPK === 'function') renderListPK();
        showNotify("Terkirim", "Dokumen PK berhasil diserahkan ke Atasan Penilai.", "success");
    });
}

function kirimDokumenPCK(idPCK) {
    const token = localStorage.getItem('transkep_session_token');
    const userNip = state.user ? state.user.nip : '';
    showCustomConfirm("Kirim Laporan PCK", "Kirim laporan ini ke Atasan? Data akan terkunci.", function() {
        if (typeof PkpDataService !== 'undefined') {
            PkpDataService.aksiDokumenPCK(idPCK, "Kirim", userNip, token).catch(e => console.warn(e));
        } else if (typeof google !== 'undefined' && google.script) {
            google.script.run.aksiDokumenPCK(idPCK, "Kirim", userNip, token);
        }
        for(var i=0; i<state.pckDokumen.length; i++) {
            if(String(state.pckDokumen[i].id_pck) === String(idPCK)) state.pckDokumen[i].status = "Menunggu Penilai";
        }
        if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
        if (window.vmPkpApp) window.vmPkpApp.syncData(state.pkpDokumen, state.pckDokumen);
        if(typeof renderListPCK === 'function') renderListPCK();
        showNotify("Terkirim", "Laporan PCK bulan ini telah diserahkan.", "success");
    });
}

function cetakDokumen(jenis, id) {
    const token = localStorage.getItem('transkep_session_token');
    const userNip = state.user ? state.user.nip : '';
    
    // Proteksi anti-spam klik (mengadopsi sistem WFH)
    if (window.isGlobalPrinting) {
        showNotify("Proses Sibuk", "Sistem sedang merakit dokumen PDF.", "warning");
        return; 
    }

    if (jenis === 'PK') {
        window.isGlobalPrinting = true;
        showLoading("Merakit PDF Perjanjian Kinerja... (Mohon tunggu)");
        
        const printPromise = (typeof PkpDataService !== 'undefined')
            ? PkpDataService.generatePdfPK(id, userNip, token)
            : new Promise((resolve, reject) => {
                if (typeof google !== 'undefined' && google.script) {
                    google.script.run
                        .withSuccessHandler(resolve)
                        .withFailureHandler(reject)
                        .generatePdfPK(id, userNip, token);
                } else {
                    setTimeout(() => resolve({ status: 'success', url: '#' }), 1500);
                }
            });

        printPromise
            .then(function(res) {
                hideLoading();
                window.isGlobalPrinting = false;
                if (res && res.status === 'success') {
                    showNotify("Berhasil", "Dokumen PK berhasil dibuat!", "success");
                    if (res.url && res.url !== '#') window.open(res.url, '_blank');
                    else alert("[CANVAS MODE] PDF PK akan terbuka di sini.");
                } else {
                    showNotify("Gagal Cetak", res ? res.message : "Gagal generate PDF", "error");
                }
            })
            .catch(function(err) {
                hideLoading();
                window.isGlobalPrinting = false;
                showNotify("Error Koneksi", err.toString(), "error");
            });
    } else if (jenis === 'PCK') {
        window.isGlobalPrinting = true;
        showLoading("Merakit PDF Laporan PCK... (Mohon tunggu)");
        
        const printPromise = (typeof PkpDataService !== 'undefined')
            ? PkpDataService.generatePdfPCK(id, userNip, token)
            : new Promise((resolve, reject) => {
                if (typeof google !== 'undefined' && google.script) {
                    google.script.run
                        .withSuccessHandler(resolve)
                        .withFailureHandler(reject)
                        .generatePdfPCK(id, userNip, token);
                } else {
                    setTimeout(() => resolve({ status: 'success', url: '#' }), 1500);
                }
            });

        printPromise
            .then(function(res) {
                hideLoading();
                window.isGlobalPrinting = false;
                if (res && res.status === 'success') {
                    showNotify("Berhasil", "Laporan PCK berhasil dibuat!", "success");
                    if (res.url && res.url !== '#') window.open(res.url, '_blank');
                    else alert("[CANVAS MODE] PDF PCK akan terbuka di sini.");
                } else {
                    showNotify("Gagal Cetak", res ? res.message : "Gagal generate PDF", "error");
                }
            })
            .catch(function(err) {
                hideLoading();
                window.isGlobalPrinting = false;
                showNotify("Error Koneksi", err.toString(), "error");
            });
    }
}

// Logika Cetak PK & PCK dipisahkan ke js/cetak/cetak_pk.js dan js/cetak/cetak_pck.js

// --- Source: pkp/js_pkp_render.html ---
/**
 * ========================================================
 * KONTROLER MODUL PKP (VUE.JS VERSION - LANGKAH 1)
 * File: js_pkp_render.html
 * ========================================================
 */

function mountPkpApp() {
    if (window.vmPkpApp) return;
    const el = document.getElementById('vue-pkp-app');
    if (!el) return;
    window.vmPkpApp = Vue.createApp({
        data() {
            return {
                activeLapis1: 'riwayat', // 'riwayat' | 'verifikasi' | 'rekap'
                activeMainTab: 'PK',     // 'PK' | 'PCK'
                selectedYear: new Date().getFullYear(),
                selectedMonth: '0',
                daftarBulan: [
                    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                ],
                rawPkpList: [],
                rawPckList: [],
                // Modal PK State (Langkah 2)
                showModalPK: false,
                modalPKMode: 'create', // 'create' | 'edit' | 'verifikasi' | 'readonly'
                modalPKLoading: false,
                modalPKSubmitting: false,
                modalPKCurrentId: null,
                modalPKNipTarget: null,
                isReadOnlyPK: false,
                isVerifikasiPK: false,
                formPK: {
                    tahun: new Date().getFullYear(),
                    penilaiText: '',
                    atasanPejabatText: '',
                    sasaranList: [
                        {
                            sasaran: '',
                            indikatorList: [
                                { indikator: '', mutu: 100, kuantitas: 1, satuan: 'Dokumen', waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
                            ]
                        }
                    ]
                },
                // Modal PCK State (Langkah 3)
                showModalPCK: false,
                modalPCKMode: 'create', // 'create' | 'edit' | 'verifikasi' | 'readonly'
                modalPCKLoading: false,
                modalPCKSubmitting: false,
                modalPCKNipTarget: null,
                isReadOnlyPCK: false,
                isVerifikasiPCK: false,
                modalPCKError: '',
                formPCK: {
                    tahun: new Date().getFullYear(),
                    bulan: '0',
                    groups: []
                }
            };
        },
        computed: {
            globalState() {
                return (typeof window !== 'undefined' && window.vueState) ? window.vueState : ((typeof state !== 'undefined') ? state : {});
            },
            currentUser() {
                return (this.globalState && this.globalState.user) ? this.globalState.user : ((typeof state !== 'undefined' && state.user) ? state.user : {});
            },
            usersList() {
                return (this.globalState && this.globalState.usersList) ? this.globalState.usersList : ((typeof state !== 'undefined' && state.usersList) ? state.usersList : []);
            },
            canVerify() {
                const role = this.currentUser ? (this.currentUser.role || '') : '';
                return ['Admin', 'Operator', 'Atasan Langsung', 'Pejabat Berwenang'].includes(role);
            },
            canRekap() {
                const role = this.currentUser ? (this.currentUser.role || '') : '';
                return ['Admin', 'Operator'].includes(role);
            },
            canAccessLapis1() {
                return this.canVerify || this.canRekap;
            },
            availableYears() {
                const cur = new Date().getFullYear();
                return [cur + 1, cur, cur - 1];
            },
            safePkpList() {
                return Array.isArray(this.rawPkpList) ? this.rawPkpList : [];
            },
            safePckList() {
                return Array.isArray(this.rawPckList) ? this.rawPckList : [];
            },
            myListPK() {
                const cleanNip = String(this.currentUser.nip || '').replace(/'/g, '').trim();
                const yr = String(this.selectedYear).trim();
                return this.safePkpList.filter(item => {
                    return String(item.nip || '').replace(/'/g, '').trim() === cleanNip &&
                           String(item.tahun || '').trim() === yr;
                });
            },
            myListPCK() {
                const cleanNip = String(this.currentUser.nip || '').replace(/'/g, '').trim();
                const yr = String(this.selectedYear).trim();
                return this.safePckList.filter(item => {
                    return String(item.nip || '').replace(/'/g, '').trim() === cleanNip &&
                           String(item.tahun || '').trim() === yr;
                });
            },
            verifikasiListPK() {
                const cleanNip = String(this.currentUser.nip || '').replace(/'/g, '').trim();
                const yr = String(this.selectedYear).trim();
                return this.safePkpList.filter(item => {
                    const isPenilai = (String(item.penilai || '').replace(/'/g, '').trim() === cleanNip && item.status === 'Menunggu Penilai');
                    const isAtasanPenilai = (String(item.atasan_pejabat || '').replace(/'/g, '').trim() === cleanNip && item.status === 'Menunggu Atasan Penilai');
                    return (isPenilai || isAtasanPenilai) && String(item.tahun || '').trim() === yr;
                });
            },
            verifikasiListPCK() {
                const cleanNip = String(this.currentUser.nip || '').replace(/'/g, '').trim();
                const yr = String(this.selectedYear).trim();
                const bawahanMap = {};
                const pkList = this.safePkpList;
                for (let j = 0; j < pkList.length; j++) {
                    bawahanMap[pkList[j].nip + '-' + pkList[j].tahun] = String(pkList[j].penilai || '').replace(/'/g, '').trim();
                }
                return this.safePckList.filter(item => {
                    const isBawahan = bawahanMap[item.nip + '-' + item.tahun] === cleanNip;
                    return isBawahan && String(item.tahun || '').trim() === yr && item.status === 'Menunggu Penilai';
                });
            },
            rekapListPK() {
                const yr = String(this.selectedYear).trim();
                return this.safePkpList.filter(item => {
                    return String(item.tahun || '').trim() === yr;
                });
            },
            rekapListPCK() {
                const yr = String(this.selectedYear).trim();
                const selectedM = this.selectedMonth && this.selectedMonth !== '0' ? String(this.selectedMonth).trim().toLowerCase() : null;
                return this.safePckList.filter(item => {
                    const isTahunSama = String(item.tahun || '').trim() === yr;
                    const isBulanSama = selectedM ? (String(item.bulan || '').trim().toLowerCase() === selectedM) : true;
                    return isTahunSama && isBulanSama;
                });
            },
            verifikasiBadgeCount() {
                let count = 0;
                const cleanNip = String(this.currentUser.nip || '').replace(/'/g, '').trim();
                if (!cleanNip) return 0;
                
                // 1. Dokumen PK Bawahan
                const pkWait = this.safePkpList.filter(p => {
                    const isPenilai = (String(p.penilai || '').replace(/'/g, '').trim() === cleanNip && p.status === 'Menunggu Penilai');
                    const isAtasan = (String(p.atasan_pejabat || '').replace(/'/g, '').trim() === cleanNip && p.status === 'Menunggu Atasan Penilai');
                    return isPenilai || isAtasan;
                }).length;
                count += pkWait;
                
                // 2. Dokumen PCK Bawahan
                const bawahanMap = {};
                const pkList = this.safePkpList;
                for (let j = 0; j < pkList.length; j++) {
                    bawahanMap[pkList[j].nip + '-' + pkList[j].tahun] = String(pkList[j].penilai || '').replace(/'/g, '').trim();
                }
                const pckWait = this.safePckList.filter(p => {
                    return p.status === 'Menunggu Penilai' && bawahanMap[p.nip + '-' + p.tahun] === cleanNip;
                }).length;
                count += pckWait;
                
                return count;
            },
            modalPKTitleText() {
                if (this.modalPKLoading) return 'Memuat Data PK...';
                if (this.modalPKMode === 'verifikasi') return 'Validasi Rencana Kinerja (Bawahan)';
                if (this.modalPKMode === 'readonly') return 'Detail Perjanjian Kinerja';
                if (this.modalPKMode === 'edit') return 'Edit Perjanjian Kinerja';
                return 'Inisialisasi PK Tahun Baru';
            },
            modalPKSaveButtonText() {
                if (this.modalPKSubmitting) return 'Menyimpan...';
                if (this.modalPKMode === 'verifikasi') return 'Koreksi & Setujui PK';
                return 'Simpan Seluruh Data PK';
            },
            modalPCKTitleText() {
                if (this.modalPCKLoading) return 'Memuat Data PCK...';
                if (this.modalPCKMode === 'verifikasi') return 'Koreksi Laporan Capaian Kinerja (PCK)';
                if (this.modalPCKMode === 'readonly') return 'Detail Laporan Capaian Kinerja (PCK)';
                return 'Laporan Capaian Kinerja (PCK)';
            },
            modalPCKSubtitleText() {
                if (this.modalPCKMode === 'verifikasi') return 'Realisasi yang terlihat berlebihan dapat Anda edit di kolom kanan sebelum menekan Setujui.';
                if (this.modalPCKMode === 'readonly') return 'Laporan PCK ini sudah dikunci dan tidak dapat diubah lagi.';
                return 'Isi realisasi target kinerja bulanan Anda di sini (Identitas otomatis terisi di cetakan PDF)';
            },
            modalPCKSaveButtonText() {
                if (this.modalPCKSubmitting) return 'Memproses...';
                if (this.modalPCKMode === 'verifikasi') return 'Koreksi & Setujui PCK';
                return 'Simpan Draft Laporan';
            },
            selectedMonthPCKName() {
                const bIndex = parseInt(this.formPCK.bulan);
                if (!isNaN(bIndex) && bIndex >= 1 && bIndex <= 12) {
                    return this.daftarBulan[bIndex - 1];
                }
                return '';
            },
            finalPCKHitung() {
                if (!this.formPCK.groups || this.formPCK.groups.length === 0) return '-';
                let totalHit = 0;
                let countHit = 0;
                this.formPCK.groups.forEach(group => {
                    const valHit = parseFloat(this.getGroupHitung(group));
                    if (!isNaN(valHit)) {
                        totalHit += valHit;
                        countHit++;
                    }
                });
                return countHit > 0 ? (totalHit / countHit).toFixed(2) : '-';
            },
            finalPCKCapaian() {
                if (!this.formPCK.groups || this.formPCK.groups.length === 0) return '-';
                let totalCap = 0;
                let countCap = 0;
                this.formPCK.groups.forEach(group => {
                    const valCap = parseFloat(this.getGroupCapaian(group));
                    if (!isNaN(valCap)) {
                        totalCap += valCap;
                        countCap++;
                    }
                });
                return countCap > 0 ? (totalCap / countCap).toFixed(2) : '-';
            },
            finalPCKPredikat() {
                const val = parseFloat(this.finalPCKCapaian);
                if (isNaN(val)) return null;
                if (val >= 91) return { text: '(Sangat Baik)', class: 'bg-emerald-500 text-white' };
                if (val >= 76) return { text: '(Baik)', class: 'bg-amber-500 text-white' };
                if (val >= 61) return { text: '(Cukup)', class: 'bg-amber-500 text-white' };
                if (val >= 51) return { text: '(Kurang)', class: 'bg-amber-500 text-white' };
                return { text: '(Buruk)', class: 'bg-amber-500 text-white' };
            }
        },
        watch: {
            verifikasiBadgeCount(newVal) {
                this.syncBadges(newVal);
            }
        },
        methods: {
            syncData(pkData, pckData) {
                const toSafeArray = (v) => {
                    if (Array.isArray(v)) return v;
                    if (v && Array.isArray(v.data)) return v.data;
                    return [];
                };

                if (pkData) {
                    this.rawPkpList = toSafeArray(pkData);
                } else if (typeof state !== 'undefined' && state.pkpDokumen) {
                    this.rawPkpList = toSafeArray(state.pkpDokumen);
                } else {
                    this.rawPkpList = [];
                }
                
                if (pckData) {
                    this.rawPckList = toSafeArray(pckData);
                } else if (typeof state !== 'undefined' && state.pckDokumen) {
                    this.rawPckList = toSafeArray(state.pckDokumen);
                } else {
                    this.rawPckList = [];
                }
                
                this.syncBadges(this.verifikasiBadgeCount);
            },
            syncBadges(count) {
                const badgeNav = document.getElementById("badge-pkp-nav");
                const badgeMob = document.getElementById("badge-pkp-mob");
                if (badgeNav) {
                    badgeNav.innerText = count;
                    if (count > 0) badgeNav.classList.remove("hidden");
                    else badgeNav.classList.add("hidden");
                }
                if (badgeMob) {
                    if (count > 0) badgeMob.classList.remove("hidden");
                    else badgeMob.classList.add("hidden");
                }
            },
            getPegawaiInfo(nip) {
                if (!nip) return { nama: '-', jabatan: '-' };
                const clean = String(nip).replace(/'/g, '').trim();
                const list = this.usersList || [];
                const u = list.find(x => String(x.nip).replace(/'/g, '').trim() === clean);
                if (u) return { nama: u.nama, jabatan: u.jabatan };
                return { nama: clean, jabatan: '-' };
            },
            getStatusBadgeClass(status) {
                if (status === 'Draft') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                if (status === 'Menunggu Penilai' || status === 'Menunggu Atasan Penilai' || status === 'Dikirim') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
                if (status === 'Disetujui' || status === 'Final') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                return 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
            },
            formatNilai(val) {
                if (!val || val === '0' || val === '-') return '-';
                const num = parseFloat(val);
                return isNaN(num) ? val : num.toFixed(2);
            },
            bukaPK(id, isVerif = false, nipBawahan = null, isReadOnly = false) {
                if (typeof bukaDetailPK === 'function') {
                    bukaDetailPK(id, isVerif, nipBawahan, isReadOnly);
                } else if (typeof openModalPK === 'function') {
                    openModalPK(true, id, isVerif, nipBawahan, isReadOnly);
                }
            },
            hapusPK(id) {
                if (typeof hapusDokumenPK === 'function') hapusDokumenPK(id);
            },
            kirimPK(id) {
                if (typeof kirimDokumenPK === 'function') kirimDokumenPK(id);
            },
            cetak(jenis, id) {
                if (typeof cetakDokumen === 'function') cetakDokumen(jenis, id);
            },
            bukaPCK(bulan, isVerif = false, nipBawahan = null, isReadOnly = false) {
                if (typeof bukaDetailPCK === 'function') {
                    bukaDetailPCK(bulan, isVerif, nipBawahan, isReadOnly);
                } else if (typeof openModalPCK === 'function') {
                    openModalPCK(true, bulan, isVerif, nipBawahan, isReadOnly);
                }
            },
            hapusPCK(id) {
                if (typeof hapusDokumenPCK === 'function') hapusDokumenPCK(id);
            },
            kirimPCK(id) {
                if (typeof kirimDokumenPCK === 'function') kirimDokumenPCK(id);
            },
            validasiCepat(tipe, id) {
                if (typeof validasiCepatDokumen === 'function') validasiCepatDokumen(tipe, id);
            },
            cetakRekap() {
                if (typeof cetakRekapPCKBulanan === 'function') cetakRekapPCKBulanan();
            },
            handleActionBtn() {
                if (this.activeMainTab === 'PK') {
                    this.openModalPK(false);
                } else {
                    this.openModalPCK(false);
                }
            },
            // ==========================================
            // LOGIKA FORM MODAL PK TAHUNAN (LANGKAH 2)
            // ==========================================
            openModalPK(isEdit = false, idPkpEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
                this.isVerifikasiPK = isVerifikasi;
                this.modalPKNipTarget = isVerifikasi ? nipBawahan : (this.currentUser ? this.currentUser.nip : '');
                this.modalPKCurrentId = idPkpEdit;
                this.isReadOnlyPK = isReadOnly;
                this.modalPKSubmitting = false;

                if (isVerifikasi) {
                    this.modalPKMode = 'verifikasi';
                } else if (isReadOnly) {
                    this.modalPKMode = 'readonly';
                } else if (isEdit) {
                    this.modalPKMode = 'edit';
                } else {
                    this.modalPKMode = 'create';
                }

                if (isEdit || isVerifikasi || isReadOnly) {
                    this.modalPKLoading = true;
                    this.showModalPK = true;

                    const token = localStorage.getItem('transkep_session_token');
                    const currentNip = this.currentUser ? this.currentUser.nip : '';
                    const detailPromise = (typeof PkpDataService !== 'undefined')
                        ? PkpDataService.getDetailPKP(idPkpEdit, currentNip, token)
                        : new Promise((resolve, reject) => {
                            if (typeof google !== 'undefined' && google.script) {
                                google.script.run
                                    .withSuccessHandler(resolve)
                                    .withFailureHandler(reject)
                                    .getDetailPKP(idPkpEdit, currentNip, token);
                            } else {
                                setTimeout(resolve, 300);
                            }
                        });

                    detailPromise
                        .then(res => {
                            this.modalPKLoading = false;
                            if (res && res.success) {
                                this.formPK.tahun = res.header.tahun;
                                let namaPenilai = "", namaAtasanPejabat = "";
                                (this.usersList || []).forEach(u => {
                                    if (u.nip === res.header.penilai) namaPenilai = u.jabatan + " - " + u.nama;
                                    if (u.nip === res.header.atasan_pejabat) namaAtasanPejabat = u.jabatan + " - " + u.nama;
                                });
                                this.formPK.penilaiText = namaPenilai;
                                this.formPK.atasanPejabatText = namaAtasanPejabat;

                                const groupMap = {};
                                (res.items || []).forEach(item => {
                                    const sName = item.sasaran || '';
                                    if (!groupMap[sName]) groupMap[sName] = [];
                                    groupMap[sName].push(item);
                                });

                                const newSasaranList = [];
                                for (const sName in groupMap) {
                                    const items = groupMap[sName];
                                    const indList = items.map(kg => {
                                        let wArr = [1,2,3,4,5,6,7,8,9,10,11,12];
                                        if (kg.waktu) {
                                            wArr = String(kg.waktu).split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                                        }
                                        return {
                                            indikator: kg.indikator || '',
                                            mutu: kg.mutu || 100,
                                            kuantitas: kg.kuantitas || 1,
                                            satuan: kg.satuan || 'Dokumen',
                                            waktu: wArr.length ? wArr : [1,2,3,4,5,6,7,8,9,10,11,12],
                                            pagu: kg.pagu || 0
                                        };
                                    });
                                    newSasaranList.push({
                                        sasaran: sName,
                                        indikatorList: indList
                                    });
                                }
                                this.formPK.sasaranList = newSasaranList.length ? newSasaranList : [{ sasaran: '', indikatorList: [{ indikator: '', mutu: 100, kuantitas: 1, satuan: 'Dokumen', waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }] }];
                            } else {
                                showNotify("Gagal Memuat", (res && res.message) ? res.message : "Data detail PK tidak ditemukan.", "error");
                                this.closeModalPK();
                            }
                        })
                        .catch(err => {
                            this.modalPKLoading = false;
                            showNotify("Error", err.message || String(err), "error");
                            this.closeModalPK();
                        });
                } else {
                    const curYear = new Date().getFullYear();
                    this.formPK.tahun = curYear;
                    this.formPK.penilaiText = '';
                    this.formPK.atasanPejabatText = '';
                    this.formPK.sasaranList = [
                        {
                            sasaran: '',
                            indikatorList: [
                                { indikator: '', mutu: 100, kuantitas: 1, satuan: 'Dokumen', waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
                            ]
                        }
                    ];
                    this.modalPKLoading = false;
                    this.showModalPK = true;
                }
            },
            closeModalPK() {
                this.showModalPK = false;
                this.modalPKLoading = false;
                this.modalPKSubmitting = false;
            },
            addSasaranGroup() {
                this.formPK.sasaranList.push({
                    sasaran: '',
                    indikatorList: [
                        { indikator: '', mutu: 100, kuantitas: 1, satuan: 'Dokumen', waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
                    ]
                });
            },
            addIndikatorToGroup(gIdx) {
                if (this.formPK.sasaranList[gIdx]) {
                    this.formPK.sasaranList[gIdx].indikatorList.push({
                        indikator: '', mutu: 100, kuantitas: 1, satuan: 'Dokumen', waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0
                    });
                }
            },
            removeRowPK(gIdx, indIdx) {
                const group = this.formPK.sasaranList[gIdx];
                if (!group) return;
                if (group.indikatorList.length <= 1 || indIdx === 0) {
                    showCustomConfirm("Hapus Sasaran Utama", "Menghapus baris ini akan membuang seluruh Indikator di dalam Sasaran ini. Lanjutkan?", () => {
                        this.formPK.sasaranList.splice(gIdx, 1);
                        if (this.formPK.sasaranList.length === 0) {
                            this.addSasaranGroup();
                        }
                    });
                } else {
                    group.indikatorList.splice(indIdx, 1);
                }
            },
            toggleAllBulan(ind) {
                if (ind.waktu && ind.waktu.length === 12) {
                    ind.waktu = [];
                } else {
                    ind.waktu = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                }
            },
            applyTemplateKinerja() {
                const u = this.currentUser;
                if (!u || !u.jabatan) {
                    showNotify("Gagal", "Jabatan Anda tidak ditemukan di sistem.", "error");
                    return;
                }
                const jabatanUser = String(u.jabatan).trim().toLowerCase();
                const mList = (typeof state !== 'undefined' && state.masterKinerjaList) ? state.masterKinerjaList : [];
                const templates = mList.filter(m => String(m.jabatan).trim().toLowerCase() === jabatanUser);

                if (templates.length === 0) {
                    showNotify("Template Kosong", "Belum ada template 'Kamus Kinerja' untuk jabatan " + u.jabatan + ". Silakan input manual atau hubungi Admin.", "warning");
                    return;
                }

                showCustomConfirm("Tarik Template Kinerja?", "Tindakan ini akan <b>MENGHAPUS SEMUA</b> form isian di bawah yang sedang Anda ketik dan menggantinya dengan template otomatis. Lanjutkan?", () => {
                    const groupMap = {};
                    templates.forEach(item => {
                        const sName = item.sasaran || '';
                        if (!groupMap[sName]) groupMap[sName] = [];
                        groupMap[sName].push(item);
                    });

                    const newSasaranList = [];
                    for (const sName in groupMap) {
                        const items = groupMap[sName];
                        const indList = items.map(kg => {
                            let wArr = [1,2,3,4,5,6,7,8,9,10,11,12];
                            if (kg.waktu) {
                                wArr = String(kg.waktu).split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                            }
                            return {
                                indikator: kg.indikator || '',
                                mutu: kg.mutu || 100,
                                kuantitas: kg.kuantitas || 1,
                                satuan: kg.satuan || 'Dokumen',
                                waktu: wArr.length ? wArr : [1,2,3,4,5,6,7,8,9,10,11,12],
                                pagu: kg.pagu || 0
                            };
                        });
                        newSasaranList.push({
                            sasaran: sName,
                            indikatorList: indList
                        });
                    }

                    this.formPK.sasaranList = newSasaranList;
                    showNotify("Template Berhasil Ditarik", "Seluruh data Sasaran dan Indikator otomatis diisikan berdasarkan jabatan " + u.jabatan, "success");
                });
            },
            savePKFull() {
                try {
                    const inputTahun = this.formPK.tahun;
                    const inputText = this.formPK.penilaiText;
                    const inputAtasanPejabatText = this.formPK.atasanPejabatText;

                    let inputNipPenilai = "";
                    let inputNipAtasanPejabat = "";

                    if (this.usersList) {
                        for (let i = 0; i < this.usersList.length; i++) {
                            const u = this.usersList[i];
                            const expectedText = u.jabatan + " - " + u.nama;
                            if (expectedText === inputText) inputNipPenilai = u.nip;
                            if (expectedText === inputAtasanPejabatText) inputNipAtasanPejabat = u.nip;
                        }
                    }

                    if (!inputNipPenilai) { showNotify("Gagal", "Silakan ketik/pilih Pejabat Penilai dari daftar.", "warning"); return; }
                    if (!inputNipAtasanPejabat) { showNotify("Gagal", "Silakan ketik/pilih Atasan Pejabat Penilai.", "warning"); return; }

                    if (!this.formPK.sasaranList || this.formPK.sasaranList.length === 0) {
                        showNotify("Tabel Kosong", "Silakan klik Tambah Sasaran Baru.", "warning"); return;
                    }

                    const arrayData = [];
                    for (let i = 0; i < this.formPK.sasaranList.length; i++) {
                        const group = this.formPK.sasaranList[i];
                        const sasaranText = String(group.sasaran || '').trim();
                        if (!sasaranText) {
                            showNotify("Error", "Harap isi teks Sasaran No. " + (i + 1), "error");
                            return;
                        }
                        for (let j = 0; j < group.indikatorList.length; j++) {
                            const ind = group.indikatorList[j];
                            const indikator = String(ind.indikator || '').trim();
                            const mutu = String(ind.mutu !== undefined ? ind.mutu : '').trim();
                            const kuantitas = String(ind.kuantitas !== undefined ? ind.kuantitas : '').trim();
                            const satuan = String(ind.satuan || '').trim();
                            const pagu = String(ind.pagu !== undefined ? ind.pagu : '0').trim();

                            const waktuArr = (ind.waktu || []).map(x => String(x)).sort((a,b) => parseInt(a)-parseInt(b));
                            const waktuString = waktuArr.join(',');

                            if (!indikator || !kuantitas || !satuan || !waktuString) {
                                showNotify("Data Belum Lengkap", "Harap isi Indikator, Target, Satuan, dan minimal 1 Ceklis Bulan pada Sasaran No. " + (i + 1), "error");
                                return;
                            }

                            arrayData.push({
                                sasaran: sasaranText,
                                indikator: indikator,
                                mutu: mutu,
                                kuantitas: kuantitas,
                                satuan: satuan,
                                waktu: waktuString,
                                pagu: pagu
                            });
                        }
                    }

                    const nipPegawai = this.isVerifikasiPK ? this.modalPKNipTarget : (this.currentUser ? this.currentUser.nip : "NIP");

                    let finalStatus = "Draft";
                    if (this.isVerifikasiPK) {
                        const pkList = this.safePkpList;
                        const currPkp = pkList.find(p => String(p.id_pkp) === String(this.modalPKCurrentId));
                        if (currPkp && currPkp.status === "Menunggu Penilai") {
                            finalStatus = "Menunggu Atasan Penilai";
                        } else {
                            finalStatus = "Disetujui";
                        }
                    }

                    this.modalPKSubmitting = true;
                    const payload = {
                        nipPegawai: nipPegawai,
                        nipPenilai: inputNipPenilai,
                        nipAtasanPejabat: inputNipAtasanPejabat,
                        tahun: inputTahun,
                        items: arrayData,
                        status: finalStatus
                    };
                    const token = localStorage.getItem('transkep_session_token');
                    const currentNip = this.currentUser ? this.currentUser.nip : '';

                    const submitPromise = (typeof PkpDataService !== 'undefined')
                        ? PkpDataService.submitBulkPKP(payload, currentNip, token)
                        : new Promise((resolve, reject) => {
                            if (typeof google !== 'undefined' && google.script) {
                                google.script.run
                                    .withSuccessHandler(resolve)
                                    .withFailureHandler(reject)
                                    .submitBulkPKP(payload, currentNip, token);
                            } else {
                                setTimeout(() => resolve({ success: true, id_pkp: 'PKP-DEMO-' + Date.now(), message: 'Data PK tersimpan di local memory.' }), 500);
                            }
                        });

                    submitPromise
                        .then(res => {
                            this.modalPKSubmitting = false;
                            if (res && res.success) {
                                if (typeof state !== 'undefined' && state.pkpDokumen) {
                                    const existingIdx = state.pkpDokumen.findIndex(p => String(p.id_pkp) === String(res.id_pkp));
                                    if (existingIdx > -1) state.pkpDokumen[existingIdx].status = finalStatus;
                                    else state.pkpDokumen.unshift({ id_pkp: res.id_pkp, nip: nipPegawai, penilai: inputNipPenilai, tahun: inputTahun, status: finalStatus, nilai: "0" });
                                    if (window.vueState) window.vueState.pkpDokumen = state.pkpDokumen;
                                }
                                this.syncData(state.pkpDokumen, state.pckDokumen);
                                this.closeModalPK();
                                showNotify("Tersimpan", res.message, "success");
                            } else {
                                showNotify("Gagal", res ? res.message : "Error server", "error");
                            }
                        })
                        .catch(error => {
                            this.modalPKSubmitting = false;
                            showNotify("Error Koneksi", error.message || String(error), "error");
                        });
                } catch(e) {
                    console.error(e);
                    this.modalPKSubmitting = false;
                }
            },
            // ==========================================
            // LOGIKA FORM MODAL PCK BULANAN (LANGKAH 3)
            // ==========================================
            getItemHitung(item) {
                if (item.realKual === '' || item.realKual === null || item.realKual === undefined) return '-';
                const kualReal = parseFloat(item.realKual);
                if (isNaN(kualReal)) return '-';
                const kualTarget = parseFloat(item.targetKual) || 0;
                return (kualTarget + kualReal);
            },
            getItemCapaian(item) {
                const hitung = this.getItemHitung(item);
                if (hitung === '-') return '-';
                return (hitung / 2).toFixed(2);
            },
            getItemCapaianClass(item) {
                const cap = parseFloat(this.getItemCapaian(item));
                if (isNaN(cap)) return 'text-slate-600';
                if (cap < 50) return 'bg-rose-500/10 text-rose-400 border border-rose-500/30 font-black';
                if (cap <= 75) return 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-black';
                return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black';
            },
            getGroupHitung(group) {
                if (!group.kegiatan || group.kegiatan.length === 0) return '-';
                let totalHit = 0;
                let count = 0;
                group.kegiatan.forEach(item => {
                    const hit = this.getItemHitung(item);
                    if (hit !== '-') {
                        totalHit += hit;
                        count++;
                    }
                });
                return count > 0 ? (totalHit / count).toFixed(2) : '-';
            },
            getGroupCapaian(group) {
                if (!group.kegiatan || group.kegiatan.length === 0) return '-';
                let totalCap = 0;
                let count = 0;
                group.kegiatan.forEach(item => {
                    const cap = parseFloat(this.getItemCapaian(item));
                    if (!isNaN(cap)) {
                        totalCap += cap;
                        count++;
                    }
                });
                return count > 0 ? (totalCap / count).toFixed(2) : '-';
            },
            openModalPCK(isEdit = false, bulanEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
                this.isVerifikasiPCK = isVerifikasi;
                this.modalPCKNipTarget = isVerifikasi ? nipBawahan : (this.currentUser ? this.currentUser.nip : null);
                this.isReadOnlyPCK = isReadOnly;
                this.modalPCKMode = isVerifikasi ? 'verifikasi' : (isReadOnly ? 'readonly' : (isEdit ? 'edit' : 'create'));
                this.modalPCKLoading = false;
                this.modalPCKSubmitting = false;
                this.modalPCKError = '';

                const curYr = new Date().getFullYear();
                this.formPCK.tahun = curYr;
                this.formPCK.groups = [];

                if (isEdit && bulanEdit) {
                    const bIndex = this.daftarBulan.indexOf(bulanEdit) + 1;
                    this.formPCK.bulan = bIndex > 0 ? String(bIndex) : '0';
                    this.showModalPCK = true;
                    this.loadDataPCK();
                } else {
                    this.formPCK.bulan = '0';
                    this.showModalPCK = true;
                }
            },
            closeModalPCK() {
                this.showModalPCK = false;
                this.modalPCKLoading = false;
                this.modalPCKSubmitting = false;
                this.modalPCKError = '';
            },
            loadDataPCK() {
                const thn = this.formPCK.tahun;
                const blnVal = parseInt(this.formPCK.bulan);
                if (!thn || !blnVal || blnVal < 1 || blnVal > 12) {
                    this.formPCK.groups = [];
                    return;
                }
                const blnText = this.daftarBulan[blnVal - 1];
                const nipTarget = this.modalPCKNipTarget || (this.currentUser ? this.currentUser.nip : '');
                const token = localStorage.getItem('transkep_session_token');

                this.modalPCKLoading = true;
                this.modalPCKError = '';

                const currentNip = this.currentUser ? this.currentUser.nip : '';
                const loadPromise = (typeof PkpDataService !== 'undefined')
                    ? PkpDataService.getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, token)
                    : new Promise((resolve, reject) => {
                        if (typeof google !== 'undefined' && google.script) {
                            google.script.run
                                .withSuccessHandler(resolve)
                                .withFailureHandler(reject)
                                .getDetailLengkapPCK(nipTarget, blnText, thn, currentNip, token);
                        } else {
                            setTimeout(() => resolve({
                                success: true,
                                targets: [
                                    { id_item: "1", sasaran: "Meningkatnya Kualitas Pelayanan Keperawatan", indikator: "Melakukan asuhan keperawatan", kuantitas: 10, mutu: 100, satuan: "Dokumen", real_kuantitas: 10, real_mutu: 90, capaian: "95.00" }
                                ]
                            }), 300);
                        }
                    });

                loadPromise
                    .then(res => {
                        this.modalPCKLoading = false;
                        if (res && res.success && res.targets && res.targets.length > 0) {
                            const groupMap = {};
                            const groups = [];
                            for (let i = 0; i < res.targets.length; i++) {
                                const t = res.targets[i];
                                if (!groupMap[t.sasaran]) {
                                    groupMap[t.sasaran] = { indikator: t.sasaran, kegiatan: [] };
                                    groups.push(groupMap[t.sasaran]);
                                }
                                groupMap[t.sasaran].kegiatan.push({
                                    id_item: t.id_item,
                                    tugas: t.indikator,
                                    targetKuant: t.kuantitas,
                                    targetKual: t.mutu,
                                    satuan: t.satuan,
                                    realKuant: (t.real_kuantitas !== undefined && t.real_kuantitas !== null && t.real_kuantitas !== '') ? t.real_kuantitas : '',
                                    realKual: (t.real_mutu !== undefined && t.real_mutu !== null && t.real_mutu !== '') ? t.real_mutu : '',
                                    capaianLama: t.capaian || '-'
                                });
                            }
                            this.formPCK.groups = groups;
                        } else {
                            this.formPCK.groups = [];
                            this.modalPCKError = res ? res.message : 'Gagal memuat target kinerja.';
                        }
                    })
                    .catch(err => {
                        this.modalPCKLoading = false;
                        this.modalPCKError = 'Gagal menarik data server.';
                        showNotify('Error Server', err.message || String(err), 'error');
                    });
            },
            savePCKFull() {
                try {
                    const thn = this.formPCK.tahun;
                    const blnVal = parseInt(this.formPCK.bulan);
                    if (!thn || !blnVal || blnVal < 1 || blnVal > 12) {
                        showNotify("Data Tidak Valid", "Silakan pilih Tahun dan Bulan.", "warning");
                        return;
                    }
                    const blnText = this.daftarBulan[blnVal - 1];

                    if (!this.formPCK.groups || this.formPCK.groups.length === 0) {
                        showNotify("Tabel Kosong", "Tidak ada target untuk dilaporkan.", "warning");
                        return;
                    }

                    const items = [];
                    let isValid = true;

                    for (let g = 0; g < this.formPCK.groups.length; g++) {
                        const group = this.formPCK.groups[g];
                        for (let i = 0; i < group.kegiatan.length; i++) {
                            const item = group.kegiatan[i];
                            const realKuant = item.realKuant;
                            const realKual = item.realKual;
                            const capaian = this.getItemCapaian(item);

                            if (realKuant === '' || realKuant === null || realKual === '' || realKual === null || capaian === '-') {
                                isValid = false;
                                break;
                            }

                            items.push({
                                id_item_pk: item.id_item,
                                real_kuantitas: realKuant,
                                real_mutu: realKual,
                                capaian: capaian
                            });
                        }
                        if (!isValid) break;
                    }

                    if (!isValid) {
                        showNotify("Laporan Belum Lengkap", "Kolom Realisasi belum diisi lengkap.", "error");
                        return;
                    }

                    const finalCapaianVal = this.finalPCKCapaian;
                    const nilaiAkhir = (finalCapaianVal !== '-' && !isNaN(parseFloat(finalCapaianVal))) ? finalCapaianVal : "0";
                    const nipTarget = this.modalPCKNipTarget || (this.currentUser ? this.currentUser.nip : '');
                    const finalStatus = this.isVerifikasiPCK ? "Disetujui" : "Draft";

                    const payload = {
                        nipPegawai: nipTarget,
                        bulan: blnText,
                        tahun: thn,
                        nilai_akhir: nilaiAkhir,
                        items: items,
                        status: finalStatus
                    };

                    this.modalPCKSubmitting = true;
                    const token = localStorage.getItem('transkep_session_token');

                    const currentNip = this.currentUser ? this.currentUser.nip : '';
                    const submitPromise = (typeof PkpDataService !== 'undefined')
                        ? PkpDataService.submitBulkPCK(payload, currentNip, token)
                        : new Promise((resolve, reject) => {
                            if (typeof google !== 'undefined' && google.script) {
                                google.script.run
                                    .withSuccessHandler(resolve)
                                    .withFailureHandler(reject)
                                    .submitBulkPCK(payload, currentNip, token);
                            } else {
                                setTimeout(() => resolve({ success: true, id_pck: 'PCK-DEMO-' + Date.now() }), 500);
                            }
                        });

                    submitPromise
                        .then(res => {
                            this.modalPCKSubmitting = false;
                            if (res && res.success) {
                                if (typeof state !== 'undefined' && state.pckDokumen) {
                                    const existingIdx = state.pckDokumen.findIndex(p => String(p.id_pck) === String(res.id_pck));
                                    if (existingIdx > -1) {
                                        state.pckDokumen[existingIdx].rencana = items.length;
                                        state.pckDokumen[existingIdx].nilai_akhir = nilaiAkhir;
                                        state.pckDokumen[existingIdx].status = finalStatus;
                                    } else {
                                        state.pckDokumen.unshift({
                                            id_pck: res.id_pck,
                                            nip: nipTarget,
                                            bulan: blnText,
                                            tahun: thn,
                                            rencana: items.length,
                                            progress: "100%",
                                            status: finalStatus,
                                            nilai_akhir: nilaiAkhir
                                        });
                                    }
                                    if (window.vueState) window.vueState.pckDokumen = state.pckDokumen;
                                }
                                this.syncData(state.pkpDokumen, state.pckDokumen);
                                this.closeModalPCK();
                                showNotify("Tersimpan", "Dokumen telah diamankan.", "success");
                            } else {
                                showNotify("Gagal", res ? res.message : "Error server", "error");
                            }
                        })
                        .catch(err => {
                            this.modalPCKSubmitting = false;
                            showNotify("Error Server", err.message || String(err), "error");
                        });
                } catch (e) {
                    console.error(e);
                    this.modalPCKSubmitting = false;
                }
            }
        },
        mounted() {
            // Sinkronisasi data awal jika sudah tersedia di global state
            if (typeof state !== 'undefined') {
                this.syncData(state.pkpDokumen, state.pckDokumen);
            }
        }
    }).mount('#vue-pkp-app');
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", mountPkpApp);
} else {
    mountPkpApp();
}

// ========================================================
// JEMBATAN GLOBAL (BACKWARD-COMPATIBILITY BRIDGES)
// ========================================================
function renderAllTabelPKP() {
    if (window.vmPkpApp) {
        window.vmPkpApp.syncData();
    }
}

function updateBadgeVerifikasiPKP() {
    if (window.vmPkpApp) {
        window.vmPkpApp.syncBadges(window.vmPkpApp.verifikasiBadgeCount);
    }
}

function renderListPK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function renderListPCK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function renderListVerifikasiPK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function renderListVerifikasiPCK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function renderRekapPK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function renderRekapPCK() {
    if (window.vmPkpApp) window.vmPkpApp.syncData();
}

function bukaDetailPK(id, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (typeof openModalPK === 'function') {
        openModalPK(true, id, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function bukaDetailPCK(bulan, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (typeof openModalPCK === 'function') {
        openModalPCK(true, bulan, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function validasiCepatDokumen(tipe, idDokumen) {
    const token = localStorage.getItem('transkep_session_token');
    showCustomConfirm("Validasi Dokumen", "Apakah Anda yakin dokumen ini sudah benar dan ingin langsung mensahkannya?", function() {
        const userNip = state.user ? state.user.nip : '';
        const aksiPromise = (typeof PkpDataService !== 'undefined')
            ? (tipe === 'PK' ? PkpDataService.aksiDokumenPKP(idDokumen, "Setujui", userNip, token) : PkpDataService.aksiDokumenPCK(idDokumen, "Setujui", userNip, token))
            : new Promise((resolve, reject) => {
                if (typeof google !== 'undefined' && google.script) {
                    const funcApi = tipe === 'PK' ? google.script.run.aksiDokumenPKP : google.script.run.aksiDokumenPCK;
                    funcApi
                        .withSuccessHandler(resolve)
                        .withFailureHandler(reject)
                        (idDokumen, "Setujui", userNip, token);
                } else {
                    setTimeout(() => resolve({ success: true }), 300);
                }
            });

        aksiPromise
            .then(function(res) {
                if(res && res.success) {
                    showNotify("Disetujui", "Dokumen berhasil disahkan.", "success");
                    var dataArray = tipe === 'PK' ? state.pkpDokumen : state.pckDokumen;
                    var keyId = tipe === 'PK' ? 'id_pkp' : 'id_pck';
                    var existingIdx = dataArray.findIndex(function(p) { return String(p[keyId]) === String(idDokumen); });
                    
                    if(existingIdx > -1) {
                        if (tipe === 'PK') {
                            if (dataArray[existingIdx].status === "Menunggu Penilai") dataArray[existingIdx].status = "Menunggu Atasan Penilai";
                            else dataArray[existingIdx].status = "Disetujui";
                        } else {
                            dataArray[existingIdx].status = "Disetujui";
                        }
                    }
                    if (window.vmPkpApp) window.vmPkpApp.syncData();
                    updateBadgeVerifikasiPKP();
                } else { showNotify("Gagal", (res && res.message) ? res.message : "Gagal memvalidasi.", "error"); }
            })
            .catch(function(e) { showNotify("Error", e.message || String(e), "error"); });
    });
}

function openModalPK(isEdit = false, idPkpEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (window.vmPkpApp) {
        window.vmPkpApp.openModalPK(isEdit, idPkpEdit, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function closeModalPK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.closeModalPK();
    }
}

function savePKFull() {
    if (window.vmPkpApp) {
        window.vmPkpApp.savePKFull();
    }
}

function applyTemplateKinerja() {
    if (window.vmPkpApp) {
        window.vmPkpApp.applyTemplateKinerja();
    }
}

function addSasaranPK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.addSasaranGroup();
    }
}

function openModalPCK(isEdit = false, bulanEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (window.vmPkpApp) {
        window.vmPkpApp.openModalPCK(isEdit, bulanEdit, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function closeModalPCK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.closeModalPCK();
    }
}

function triggerLoadPCK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.loadDataPCK();
    }
}

function savePCKFull() {
    if (window.vmPkpApp) {
        window.vmPkpApp.savePCKFull();
    }
}

// --- Source: pkp/js_pkp_modal.html ---
/**
 * ========================================================
 * KONTROLER MODUL PKP (LOGIKA MODAL & KALKULATOR PCK)
 * File: js_pkp_modal.html
 * ========================================================
 */

// FIX: Track Status Mode agar Logic Save (Update Hierarki) Tahu Posisi ID yang Dikerjakan
// FIX: Track Status Mode agar Logic Save (Update Hierarki) Tahu Posisi ID yang Dikerjakan
window.isVerifikasiModePK = false;
window.verifikasiNipTargetPK = null;
window.currentOpenedPkpId = null; 
window.isReadOnlyModePK = false; 

window.isVerifikasiModePCK = false;
window.verifikasiNipTargetPCK = null;
window.isReadOnlyModePCK = false; 

// ========================================================
// JEMBATAN KONTROLER MODAL PK TAHUNAN (VUE 3 BRIDGE)
// ========================================================
function openModalPK(isEdit = false, idPkpEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (window.vmPkpApp) {
        window.vmPkpApp.openModalPK(isEdit, idPkpEdit, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function closeModalPK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.closeModalPK();
    }
}

function applyTemplateKinerja() {
    if (window.vmPkpApp) {
        window.vmPkpApp.applyTemplateKinerja();
    }
}

function addSasaranPK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.addSasaranGroup();
    }
}

function savePKFull() {
    if (window.vmPkpApp) {
        window.vmPkpApp.savePKFull();
    }
}


// ========================================================
// JEMBATAN KONTROLER MODAL PCK BULANAN (VUE 3 BRIDGE)
// ========================================================
function openModalPCK(isEdit = false, bulanEdit = null, isVerifikasi = false, nipBawahan = null, isReadOnly = false) {
    if (window.vmPkpApp) {
        window.vmPkpApp.openModalPCK(isEdit, bulanEdit, isVerifikasi, nipBawahan, isReadOnly);
    }
}

function closeModalPCK() {
    if (window.vmPkpApp) {
        window.vmPkpApp.closeModalPCK();
    }
}

function triggerLoadPCK(askGhost = true) {
    if (window.vmPkpApp) {
        window.vmPkpApp.loadDataPCK();
    }
}

function savePCKFull() {
    if (window.vmPkpApp) {
        window.vmPkpApp.savePCKFull();
    }
}

// Stubs for backward-compatibility if invoked externally
function calcPCKRow() {}
function recalcPCKGroup() {}
function recalcPCKFinal() {}
function renderTablePCK() {}

// Logika Cetak Rekap PCK dipisahkan ke js/cetak/cetak_rekap_pkp.js
