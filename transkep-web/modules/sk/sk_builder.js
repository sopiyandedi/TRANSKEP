// ========================================================
// FILE: transkep-web/modules/sk/sk_builder.js
// CONTROLLER & STATE MIXIN: SMART SK BUILDER & REVISI ENGINE
// ========================================================

window.SkBuilderMixin = {
  data() {
    return {
      showModalSkBuilder: false,
      showModalSkRevisi: false,
      builderStep: 1,
      activeLampiranIndex: 0,
      isSavingBuilder: false,
      isSubmittingRevisi: false,
      targetRevisiDoc: null,
      revisiMembers: [],
      revisiForm: {
        catatan: '',
        klausul_menimbang: ''
      },
      skBuilderDoc: {
        id: '',
        no_sk: '',
        judul_sk: '',
        pj_sk: 'PJ. Kesekretariatan',
        tgl_sk: new Date().toISOString().split('T')[0],
        status: 'Aktif',
        versi_aktif: 1,
        naskah_utama: {
          kop: 'PENGADILAN AGAMA INDRAMAYU KELAS I A',
          menimbang: [
            'bahwa dalam rangka memperlancar pelaksanaan tugas pokok dan fungsi, perlu dibentuk tim kerja yang terstruktur;',
            'bahwa berdasarkan pertimbangan sebagaimana dimaksud, perlu menetapkan Keputusan Ketua Pengadilan Agama Indramayu.'
          ],
          mengingat: [
            'Undang-Undang Nomor 7 Tahun 1989 tentang Peradilan Agama sebagaimana telah diubah dengan UU No. 3 Tahun 2006 dan UU No. 50 Tahun 2009;',
            'Undang-Undang Nomor 5 Tahun 2014 tentang Aparatur Sipil Negara;',
            'Keputusan Ketua Mahkamah Agung Republik Indonesia tentang Pedoman Tata Naskah Dinas.'
          ],
          diktum: [
            { label: 'KESATU', isi: 'Membentuk dan menetapkan susunan Tim Kerja sebagaimana tercantum dalam Lampiran yang merupakan bagian tidak terpisahkan dari Keputusan ini.' },
            { label: 'KEDUA', isi: 'Tim Kerja bertugas dan bertanggung jawab langsung kepada Ketua Pengadilan Agama Indramayu.' },
            { label: 'KETIGA', isi: 'Keputusan ini berlaku sejak tanggal ditetapkan dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.' }
          ],
          pejabat: {
            jabatan: 'Ketua Pengadilan Agama Indramayu',
            nama: 'Drs. H. M. YAHYA, M.H.',
            nip: '196512311994031011'
          }
        },
        lampiran: [],
        revisi_history: []
      }
    };
  },
  computed: {
    currentLampiran() {
      if (!this.skBuilderDoc || !Array.isArray(this.skBuilderDoc.lampiran)) return null;
      return this.skBuilderDoc.lampiran[this.activeLampiranIndex] || null;
    }
  },
  methods: {
    // ----------------------------------------------------
    // 1. LIFECYCLE MODAL BUILDER
    // ----------------------------------------------------
    openSkBuilder(doc = null) {
      this.builderStep = 1;
      this.activeLampiranIndex = 0;
      if (doc) {
        this.skBuilderDoc = JSON.parse(JSON.stringify(doc));
        if (!this.skBuilderDoc.naskah_utama) this.initDefaultNaskahUtama();
        if (!Array.isArray(this.skBuilderDoc.lampiran)) this.skBuilderDoc.lampiran = [];
      } else {
        this.resetSkBuilderDoc();
      }
      this.showModalSkBuilder = true;
    },

    openSkBuilderFromInput() {
      // Transfer data pokok dari Form Input SK biasa ke Studio Builder
      this.resetSkBuilderDoc();
      if (this.formSk) {
        if (this.formSk.judul_sk) this.skBuilderDoc.judul_sk = this.formSk.judul_sk;
        if (this.formSk.no_sk) this.skBuilderDoc.no_sk = this.formSk.no_sk;
        if (this.formSk.pj_sk) this.skBuilderDoc.pj_sk = this.formSk.pj_sk;
        if (this.formSk.tgl_sk) this.skBuilderDoc.tgl_sk = this.formSk.tgl_sk;
      }

      // Jika ada anggota yang sudah dipilih di form biasa, jadikan Lampiran 1 (Tabel)
      if (Array.isArray(this.tempMembers) && this.tempMembers.length > 0) {
        const tableData = this.tempMembers.map(m => {
          const userObj = (this.globalState.usersList || []).find(u => u.nip === m.nip);
          return {
            jabatan_tim: m.peran || 'Anggota',
            nama: userObj ? `${userObj.nama} (${userObj.nip})` : m.nip,
            nip: m.nip,
            jabatan_dinas: userObj ? userObj.jabatan : '-'
          };
        });

        this.skBuilderDoc.lampiran.push({
          id: 'lamp-1',
          judul: 'SUSUNAN PERSONIL TIM KERJA',
          tipe: 'tabel',
          data: tableData
        });
      }

      this.showModalSkForm = false;
      this.showModalSkBuilder = true;
      if (window.showNotify) {
        window.showNotify("Data Ditransfer", "Data pokok SK berhasil dialirkan ke Smart SK Studio Builder.", "success");
      }
    },

    closeSkBuilder() {
      this.showModalSkBuilder = false;
    },

    resetSkBuilderDoc() {
      this.skBuilderDoc = {
        id: '',
        no_sk: '',
        judul_sk: '',
        pj_sk: 'PJ. Kesekretariatan',
        tgl_sk: new Date().toISOString().split('T')[0],
        status: 'Aktif',
        versi_aktif: 1,
        naskah_utama: {
          kop: 'PENGADILAN AGAMA INDRAMAYU KELAS I A',
          menimbang: [
            'bahwa dalam rangka memperlancar pelaksanaan tugas pokok dan fungsi, perlu dibentuk tim kerja yang terstruktur;',
            'bahwa berdasarkan pertimbangan sebagaimana dimaksud, perlu menetapkan Keputusan Ketua Pengadilan Agama Indramayu.'
          ],
          mengingat: [
            'Undang-Undang Nomor 7 Tahun 1989 tentang Peradilan Agama sebagaimana telah diubah dengan UU No. 3 Tahun 2006 dan UU No. 50 Tahun 2009;',
            'Undang-Undang Nomor 5 Tahun 2014 tentang Aparatur Sipil Negara;',
            'Keputusan Ketua Mahkamah Agung Republik Indonesia tentang Pedoman Tata Naskah Dinas.'
          ],
          diktum: [
            { label: 'KESATU', isi: 'Membentuk dan menetapkan susunan Tim Kerja sebagaimana tercantum dalam Lampiran yang merupakan bagian tidak terpisahkan dari Keputusan ini.' },
            { label: 'KEDUA', isi: 'Tim Kerja bertugas dan bertanggung jawab langsung kepada Ketua Pengadilan Agama Indramayu.' },
            { label: 'KETIGA', isi: 'Keputusan ini berlaku sejak tanggal ditetapkan dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.' }
          ],
          pejabat: {
            jabatan: 'Ketua Pengadilan Agama Indramayu',
            nama: 'Drs. H. M. YAHYA, M.H.',
            nip: '196512311994031011'
          }
        },
        lampiran: [],
        revisi_history: []
      };
    },

    initDefaultNaskahUtama() {
      this.skBuilderDoc.naskah_utama = {
        kop: 'PENGADILAN AGAMA INDRAMAYU KELAS I A',
        menimbang: ['bahwa dalam rangka kelancaran tugas dinas...'],
        mengingat: ['Undang-Undang Nomor 7 Tahun 1989 tentang Peradilan Agama...'],
        diktum: [{ label: 'KESATU', isi: 'Menetapkan susunan tim...' }],
        pejabat: {
          jabatan: 'Ketua Pengadilan Agama Indramayu',
          nama: 'Drs. H. M. YAHYA, M.H.',
          nip: '196512311994031011'
        }
      };
    },

    // ----------------------------------------------------
    // 2. MANIPULASI BUTIR NASKAH UTAMA
    // ----------------------------------------------------
    addMenimbangItem() {
      this.skBuilderDoc.naskah_utama.menimbang.push('');
    },
    removeMenimbangItem(idx) {
      if (this.skBuilderDoc.naskah_utama.menimbang.length > 1) {
        this.skBuilderDoc.naskah_utama.menimbang.splice(idx, 1);
      }
    },
    addMengingatItem() {
      this.skBuilderDoc.naskah_utama.mengingat.push('');
    },
    removeMengingatItem(idx) {
      if (this.skBuilderDoc.naskah_utama.mengingat.length > 1) {
        this.skBuilderDoc.naskah_utama.mengingat.splice(idx, 1);
      }
    },
    addDiktumItem() {
      const labels = ['KESATU', 'KEDUA', 'KETIGA', 'KEEMPAT', 'KELIMA', 'KEENAM', 'KETUJUH', 'KEDELAPAN'];
      const nextIdx = this.skBuilderDoc.naskah_utama.diktum.length;
      const nextLabel = labels[nextIdx] || `KE-${nextIdx + 1}`;
      this.skBuilderDoc.naskah_utama.diktum.push({ label: nextLabel, isi: '' });
    },
    removeDiktumItem(idx) {
      if (this.skBuilderDoc.naskah_utama.diktum.length > 1) {
        this.skBuilderDoc.naskah_utama.diktum.splice(idx, 1);
      }
    },

    // ----------------------------------------------------
    // 3. MANIPULASI LAMPIRAN DINAMIS (TOOLS)
    // ----------------------------------------------------
    addLampiran() {
      const count = this.skBuilderDoc.lampiran.length + 1;
      this.skBuilderDoc.lampiran.push({
        id: 'lamp-' + count,
        judul: `LAMPIRAN ${count} : SUSUNAN TIM KERJA`,
        tipe: 'tabel',
        data: [
          { jabatan_tim: 'Pengarah', nama: '', nip: '', jabatan_dinas: '' },
          { jabatan_tim: 'Ketua Tim', nama: '', nip: '', jabatan_dinas: '' }
        ]
      });
      this.activeLampiranIndex = this.skBuilderDoc.lampiran.length - 1;
    },

    setLampiranType(tipe) {
      if (!this.currentLampiran) return;
      this.currentLampiran.tipe = tipe;
      if (tipe === 'bagan_struktur') {
        if (!this.currentLampiran.data || typeof this.currentLampiran.data !== 'object' || Array.isArray(this.currentLampiran.data)) {
          this.currentLampiran.data = {
            level_1: [{ role: 'Pembina / Pengarah', nama: 'Ketua Pengadilan Agama Indramayu', nip: '' }],
            level_2: [{ role: 'Ketua Tim', nama: 'Sekretaris Pengadilan Agama Indramayu', nip: '' }],
            level_3: [
              { role: 'Sekretaris Tim', nama: '', nip: '' },
              { role: 'Koordinator Pelaksana', nama: '', nip: '' }
            ],
            level_4: [
              { role: 'Anggota Tim', nama: '', nip: '' },
              { role: 'Anggota Tim', nama: '', nip: '' }
            ]
          };
        }
      } else if (tipe === 'tabel') {
        if (!Array.isArray(this.currentLampiran.data)) {
          this.currentLampiran.data = [
            { jabatan_tim: 'Pengarah', nama: '', nip: '', jabatan_dinas: '' },
            { jabatan_tim: 'Ketua Tim', nama: '', nip: '', jabatan_dinas: '' }
          ];
        }
      } else if (tipe === 'teks') {
        if (typeof this.currentLampiran.data !== 'string') {
          this.currentLampiran.data = '1. Merencanakan dan menyusun program kerja kegiatan.\n2. Melaksanakan koordinasi teknis pelaksanaan tugas secara berkala.\n3. Menyusun dan menyampaikan laporan hasil pelaksanaan tugas kepada Ketua Pengadilan.';
        }
      }
    },

    removeCurrentLampiran() {
      if (this.skBuilderDoc.lampiran.length > 0) {
        this.skBuilderDoc.lampiran.splice(this.activeLampiranIndex, 1);
        if (this.activeLampiranIndex >= this.skBuilderDoc.lampiran.length) {
          this.activeLampiranIndex = Math.max(0, this.skBuilderDoc.lampiran.length - 1);
        }
      }
    },

    addLampiranTableRow() {
      if (!this.currentLampiran || this.currentLampiran.tipe !== 'tabel') return;
      if (!Array.isArray(this.currentLampiran.data)) this.currentLampiran.data = [];
      this.currentLampiran.data.push({ jabatan_tim: 'Anggota', nama: '', nip: '', jabatan_dinas: '' });
    },

    moveLampiranRow(rIdx, direction) {
      if (!this.currentLampiran || !Array.isArray(this.currentLampiran.data)) return;
      const targetIdx = rIdx + direction;
      if (targetIdx < 0 || targetIdx >= this.currentLampiran.data.length) return;
      const item = this.currentLampiran.data.splice(rIdx, 1)[0];
      this.currentLampiran.data.splice(targetIdx, 0, item);
    },

    setRowRole(row, role) {
      if (row) row.jabatan_tim = role;
    },

    onPegawaiSelected(row) {
      if (!row || !row.nama) return;
      const raw = row.nama;
      const match = raw.match(/\(([^)]+)\)$/);
      const nip = match ? match[1].trim() : '';
      
      const user = (this.globalState.usersList || []).find(u => u.nip === nip || raw.includes(u.nama));
      if (user) {
        row.nip = user.nip;
        row.nama = user.nama;
        if (!row.jabatan_dinas || row.jabatan_dinas === '-') {
          row.jabatan_dinas = user.jabatan;
        }
      }
    },

    // Manipulasi Node Bagan Struktur Box Tree
    addTreeNode(levelKey, defaultRole = 'Anggota Tim') {
      if (!this.currentLampiran || this.currentLampiran.tipe !== 'bagan_struktur') return;
      if (!this.currentLampiran.data[levelKey]) this.currentLampiran.data[levelKey] = [];
      this.currentLampiran.data[levelKey].push({ role: defaultRole, nama: '', nip: '' });
    },

    removeTreeNode(levelKey, idx) {
      if (!this.currentLampiran || this.currentLampiran.tipe !== 'bagan_struktur') return;
      if (this.currentLampiran.data[levelKey] && this.currentLampiran.data[levelKey].length > 1) {
        this.currentLampiran.data[levelKey].splice(idx, 1);
      }
    },

    onTreeNodeSelected(node) {
      if (!node || !node.nama) return;
      const raw = node.nama;
      const match = raw.match(/\(([^)]+)\)$/);
      const nip = match ? match[1].trim() : '';
      const user = (this.globalState.usersList || []).find(u => u.nip === nip || raw.includes(u.nama));
      if (user) {
        node.nip = user.nip;
        node.nama = user.nama;
      }
    },

    // Format Cepat Editor Teks
    insertJobdescTemplate() {
      if (!this.currentLampiran || this.currentLampiran.tipe !== 'teks') return;
      const template = "1. Merencanakan dan menyusun program kerja kegiatan tahun berjalan.\n2. Melaksanakan koordinasi teknis dengan unit kerja terkait secara berkala.\n3. Menyusun evaluasi dan tindak lanjut atas kendala operasional yang ditemukan.\n4. Melaporkan hasil pelaksanaan tugas secara tertulis kepada Ketua Pengadilan Agama Indramayu.";
      this.currentLampiran.data = this.currentLampiran.data ? (this.currentLampiran.data + "\n\n" + template) : template;
    },

    insertTextBullet(type) {
      if (!this.currentLampiran || this.currentLampiran.tipe !== 'teks') return;
      let bullet = "• ";
      if (type === 'number') bullet = "1. ";
      if (type === 'alpha') bullet = "a. ";
      this.currentLampiran.data = (this.currentLampiran.data || '') + "\n" + bullet;
    },

    toRoman(num) {
      const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
      return roman[(num - 1)] || num;
    },

    printSkDocument() {
      window.print();
    },

    // ----------------------------------------------------
    // 4. SIMPAN DOKUMEN BUILDER KE CLOUD FIRESTORE
    // ----------------------------------------------------
    async saveSkFromBuilder() {
      if (!this.skBuilderDoc.no_sk || !this.skBuilderDoc.judul_sk) {
        if (window.showNotify) window.showNotify("Data Belum Lengkap", "Nomor SK dan Judul SK wajib diisi.", "warning");
        return;
      }

      this.isSavingBuilder = true;
      try {
        if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
          throw new Error("Koneksi Firebase Firestore belum siap.");
        }

        const isNew = !this.skBuilderDoc.id;
        const finalId = isNew ? ('SK-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-4)) : this.skBuilderDoc.id;
        
        // Ekstrak seluruh personil dari lampiran tabel agar sinkron dengan daftar members pencarian
        let extractedMembers = [];
        (this.skBuilderDoc.lampiran || []).forEach(lamp => {
          if (lamp.tipe === 'tabel' && Array.isArray(lamp.data)) {
            lamp.data.forEach(item => {
              if (item.nip) {
                extractedMembers.push({ nip: item.nip, peran: item.jabatan_tim || 'Anggota' });
              }
            });
          }
        });

        const payload = {
          id: finalId,
          no_sk: this.skBuilderDoc.no_sk,
          judul_sk: this.skBuilderDoc.judul_sk.toUpperCase(),
          pj_sk: this.skBuilderDoc.pj_sk || 'PJ. Kesekretariatan',
          tgl_sk: this.skBuilderDoc.tgl_sk || new Date().toISOString().split('T')[0],
          tgl_input: this.skBuilderDoc.tgl_input || UtilitiesDateNow(),
          link_drive: this.skBuilderDoc.link_drive || '',
          status: 'Aktif',
          versi_aktif: this.skBuilderDoc.versi_aktif || 1,
          naskah_utama: this.skBuilderDoc.naskah_utama,
          lampiran: this.skBuilderDoc.lampiran || [],
          members: extractedMembers.length > 0 ? extractedMembers : (this.skBuilderDoc.members || []),
          revisi_history: this.skBuilderDoc.revisi_history || []
        };

        await TranskepFirebase.saveSkToFirestore(payload);
        this.isSavingBuilder = false;
        this.showModalSkBuilder = false;

        if (window.showNotify) {
          window.showNotify("Berhasil Terbit! 🔥", `Dokumen "${payload.judul_sk}" resmi tersimpan di Cloud Firestore.`, "success");
        }
      } catch (err) {
        this.isSavingBuilder = false;
        if (window.showNotify) {
          window.showNotify("Gagal Simpan", err.message || err.toString(), "error");
        }
      }
    },

    // ----------------------------------------------------
    // 5. LOGIKA FORM KHUSUS REVISI SK (AMANDEMEN)
    // ----------------------------------------------------
    openRevisiModal(sk) {
      if (!sk) return;
      this.targetRevisiDoc = sk;
      this.revisiMembers = JSON.parse(JSON.stringify(sk.members || []));
      this.revisiForm = {
        catatan: 'Penyesuaian susunan anggota tim sehubungan dengan alih tugas / mutasi pegawai.',
        klausul_menimbang: 'bahwa sehubungan dengan adanya alih tugas dan mutasi pegawai di lingkungan Pengadilan Agama Indramayu, dipandang perlu melakukan penyesuaian susunan tim kerja;'
      };
      this.showModalSkRevisi = true;
    },

    closeSkRevisi() {
      this.showModalSkRevisi = false;
    },

    openBuilderFromRevisi() {
      if (!this.targetRevisiDoc) return;
      const targetVersion = (this.targetRevisiDoc.versi_aktif || 1) + 1;
      let cloned = JSON.parse(JSON.stringify(this.targetRevisiDoc));
      cloned.versi_aktif = targetVersion;
      
      if (!cloned.naskah_utama) cloned.naskah_utama = { kop: 'PENGADILAN AGAMA INDRAMAYU KELAS I A', menimbang: [], mengingat: [], diktum: [], pejabat: {} };
      if (!Array.isArray(cloned.naskah_utama.menimbang)) cloned.naskah_utama.menimbang = [];
      
      // Sisipkan klausul amandemen di awal menimbang
      if (this.revisiForm.klausul_menimbang) {
        cloned.naskah_utama.menimbang.unshift(this.revisiForm.klausul_menimbang);
      }

      cloned.members = this.revisiMembers;

      // Sinkronkan ke lampiran tabel jika ada
      if (Array.isArray(cloned.lampiran)) {
        const tableLamp = cloned.lampiran.find(l => l.tipe === 'tabel');
        if (tableLamp && Array.isArray(tableLamp.data)) {
          tableLamp.data = this.revisiMembers.map(m => {
            const userObj = (this.globalState.usersList || []).find(u => u.nip === m.nip);
            return {
              jabatan_tim: m.peran || 'Anggota',
              nama: userObj ? `${userObj.nama} (${userObj.nip})` : m.nip,
              nip: m.nip,
              jabatan_dinas: userObj ? userObj.jabatan : '-'
            };
          });
        }
      }

      this.showModalSkRevisi = false;
      this.openSkBuilder(cloned);
    },

    async submitSkRevisi() {
      if (!this.targetRevisiDoc) return;
      this.isSubmittingRevisi = true;
      try {
        if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) {
          throw new Error("Koneksi Firebase Firestore belum siap.");
        }

        const currentVer = this.targetRevisiDoc.versi_aktif || 1;
        const nextVer = currentVer + 1;
        const tglHariIni = new Date().toISOString().split('T')[0];

        let history = Array.isArray(this.targetRevisiDoc.revisi_history) ? [...this.targetRevisiDoc.revisi_history] : [];
        history.push({
          versi: nextVer,
          tgl_revisi: tglHariIni,
          catatan: this.revisiForm.catatan || 'Amandemen susunan tim',
          oleh: (this.globalState.user ? this.globalState.user.nama : 'Admin')
        });

        // Duplikasi payload dengan versi baru
        let updatedPayload = JSON.parse(JSON.stringify(this.targetRevisiDoc));
        updatedPayload.versi_aktif = nextVer;
        updatedPayload.members = this.revisiMembers;
        updatedPayload.revisi_history = history;

        // Sinkronkan ke lampiran tabel jika ada
        if (Array.isArray(updatedPayload.lampiran)) {
          const tableLamp = updatedPayload.lampiran.find(l => l.tipe === 'tabel');
          if (tableLamp && Array.isArray(tableLamp.data)) {
            tableLamp.data = this.revisiMembers.map(m => {
              const userObj = (this.globalState.usersList || []).find(u => u.nip === m.nip);
              return {
                jabatan_tim: m.peran || 'Anggota',
                nama: userObj ? `${userObj.nama} (${userObj.nip})` : m.nip,
                nip: m.nip,
                jabatan_dinas: userObj ? userObj.jabatan : '-'
              };
            });
          }
        }

        // Sisipkan klausul amandemen jika naskah_utama tersedia
        if (updatedPayload.naskah_utama && Array.isArray(updatedPayload.naskah_utama.menimbang)) {
          if (this.revisiForm.klausul_menimbang) {
            updatedPayload.naskah_utama.menimbang.unshift(this.revisiForm.klausul_menimbang);
          }
        }

        await TranskepFirebase.saveSkToFirestore(updatedPayload);
        this.isSubmittingRevisi = false;
        this.showModalSkRevisi = false;

        if (window.showNotify) {
          window.showNotify("Revisi Diterbitkan! 🎉", `SK "${updatedPayload.no_sk}" berhasil diperbarui ke Versi ${nextVer}.`, "success");
        }
      } catch (err) {
        this.isSubmittingRevisi = false;
        if (window.showNotify) {
          window.showNotify("Gagal Revisi", err.message || err.toString(), "error");
        }
      }
    }
  }
};

function UtilitiesDateNow() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : n;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
