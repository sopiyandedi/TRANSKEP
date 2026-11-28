// ==========================================
// FILE: modules/eoffice/apel.js
// DESKRIPSI: Controller Modul E-Office Jadwal Apel Senin Pagi & Jumat Sore
// FITUR: Jadwal Multi-Tahun (2026, 2027, +Tahun), Satpam Terisolasi (S1),
//        Auto-Substitusi Cuti/ST Non-Destruktif, Render Poster Canvas 1080x1350,
//        Import SK via Gemini Webhook n8n, Simpan Poster ke Drive
// ENGINE: TRANSKEP Core v3.9.4 (100% Cloud Firestore)
// ==========================================

(function () {
  'use strict';

  var vmApel = null;
  var apelRealtimeUnsub = null;
  var imageCacheMap = {};

  var ROLE_META = [
    { key: 'pembina', label: 'Pembina', posterTitle: 'PEMBINA' },
    { key: 'pemimpin', label: 'Pemimpin / Komandan', posterTitle: 'PEMIMPIN' },
    { key: 'doa', label: 'Pembaca Doa', posterTitle: 'DOA' },
    { key: 'nilai_ma', label: '8 Nilai MA-RI', posterTitle: '8 NILAI MA RI' },
    { key: 'mc', label: 'MC / Protokol', posterTitle: 'MC' },
    { key: 'budaya_malu', label: '10 Budaya Malu', posterTitle: '10 BUDAYA MALU' }
  ];

  var DEFAULT_POOLS = {
    pembina: ['H. Zulkifli, S.Ag., S.H., M.H.'],
    pemimpin: ['Gerald Dwi Anggara', 'Tarsiman', 'Abuhori', 'Arif Rizal Muslim, S.H.'],
    doa: [
      'Dra. Hj. Sunaeah, M.H.', "Dra. Z. Hani'Ah", 'Usman, S.H.',
      'Drs. Arif Mustaqim, M.H.', 'Drs. H. Iing S., S.H., M.H.', 'Drs. Taufiqurrokhman, M.H.'
    ],
    nilai_ma: [
      'Agung K., A.Md., A.B.', 'Agung Sugiarto, S.M.', 'Hamdan Nahari, S.Ag.',
      'Ika Carlika, S.Sy.', 'Andriana, S.Sy.', 'Ade Badrujaman, S.H.I.',
      'Akhmad F., S.H., M.H.', 'Dursilah, S.Sy.', 'Heries Pramuji I., S.Sy.',
      'Muhyidin', 'R.A. Havid Ismail, A.Md.'
    ],
    budaya_malu: [
      'Ahmad Fauzi, S.Sy.', 'Arief Ardiansyah', 'Dadan D., S.Sy.',
      'Rivki Fandi A., S.Sy.', 'Daryatno, A.Md.', 'Nata Casmita Wiguna',
      'Dedi Sopiyan, S.H.', 'Mohammad Faiz, S.Sy.'
    ],
    mc: [
      'Widya Aprilianingrum, S.H.', 'Hj. Lizah N. A., S.H.I., M.H.',
      'Fakhriza Dhian P., S.H.', 'Novi Iriani, S.E.', 'Tutwuri H., S.Ak.',
      'Maurizka Ainur R., S.T.', 'Putri L. E., A.Md., Akt.',
      'Valah M. Az Zahra, S.H.', 'Qonita K. Dewi, S.H.'
    ]
  };

  var SEED_2026_SEM2 = [
    { no: 1, hari_mode: 'Sn & Jm', tgl_senin: '2026-07-06', tgl_jumat: '2026-07-10', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Dra. Hj. Sunaeah, M.H.', nilai_ma: 'Agung K., A.Md., A.B.', budaya_malu: 'Ahmad Fauzi, S.Sy.', mc: 'Widya Aprilianingrum, S.H.' },
    { no: 2, hari_mode: 'Sn & Jm', tgl_senin: '2026-07-13', tgl_jumat: '2026-07-17', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: "Dra. Z. Hani'Ah", nilai_ma: 'Agung Sugiarto, S.M.', budaya_malu: 'Arief Ardiansyah', mc: 'Hj. Lizah N. A., S.H.I., M.H.' },
    { no: 3, hari_mode: 'Sn & Jm', tgl_senin: '2026-07-20', tgl_jumat: '2026-07-24', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Usman, S.H.', nilai_ma: 'Hamdan Nahari, S. Ag.', budaya_malu: 'Dadan D., S.Sy.', mc: 'Fakhriza Dhian P., S.H.' },
    { no: 4, hari_mode: 'Sn & Jm', tgl_senin: '2026-07-27', tgl_jumat: '2026-07-31', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: 'Drs. Arif Mustaqim, M.H.', nilai_ma: 'Ika Carlika, S.Sy.', budaya_malu: 'Rivki Fandi A., S.Sy.', mc: 'Novi Iriani, S.E.' },
    { no: 5, hari_mode: 'Sn & Jm', tgl_senin: '2026-08-03', tgl_jumat: '2026-08-07', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Drs. H. Iing S., S.H., M.H.', nilai_ma: 'Andriana, S.Sy.', budaya_malu: 'Daryatno, A.Md.', mc: 'Tutwuri H., S.Ak.' },
    { no: 6, hari_mode: 'Sn & Jm', tgl_senin: '2026-08-10', tgl_jumat: '2026-08-14', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: 'Drs. Taufiqurrokhman, M.H.', nilai_ma: 'Ade Badrujaman, S.H.I.', budaya_malu: 'Nata Casmita Wiguna', mc: 'Maurizka Ainur R., S.T.' },
    { no: 7, hari_mode: 'Jm', tgl_senin: '', tgl_jumat: '2026-08-21', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Dra. Hj. Sunaeah, M.H.', nilai_ma: 'Akhmad F., S.H., M.H.', budaya_malu: 'Dedi Sopiyan, S.H.', mc: 'Putri L. E., A.Md., Akt.' },
    { no: 8, hari_mode: 'Sn & Jm', tgl_senin: '2026-08-24', tgl_jumat: '2026-08-28', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: "Dra. Z. Hani'Ah", nilai_ma: 'Dursilah, S.Sy.', budaya_malu: 'Mohammad Faiz, S.Sy.', mc: 'Valah M. Az Zahra, S.H.' },
    { no: 9, hari_mode: 'Sn & Jm', tgl_senin: '2026-08-31', tgl_jumat: '2026-09-04', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Usman, S.H.', nilai_ma: 'Heries Pramuji I., S.Sy.', budaya_malu: 'Dedi Sopiyan, S.H.', mc: 'Qonita K. Dewi, S.H.' },
    { no: 10, hari_mode: 'Sn & Jm', tgl_senin: '2026-09-07', tgl_jumat: '2026-09-11', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: 'Drs. Arif Mustaqim, M.H.', nilai_ma: 'Muhyidin', budaya_malu: 'Mohammad Faiz, S.Sy.', mc: 'Widya Aprilianingrum, S.H.' },
    { no: 11, hari_mode: 'Sn & Jm', tgl_senin: '2026-09-14', tgl_jumat: '2026-09-18', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Drs. H. Iing S., S.H., M.H.', nilai_ma: 'R.A. Havid Ismail, A.Md.', budaya_malu: 'Ahmad Fauzi, S.Sy.', mc: 'Hj. Lizah N. A., S.H.I., M.H.' },
    { no: 12, hari_mode: 'Sn & Jm', tgl_senin: '2026-09-21', tgl_jumat: '2026-09-25', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: 'Drs. Taufiqurrokhman, M.H.', nilai_ma: 'Agung K., A.Md., A.B.', budaya_malu: 'Arief Ardiansyah', mc: 'Fakhriza Dhian P., S.H.' },
    { no: 13, hari_mode: 'Sn & Jm', tgl_senin: '2026-09-28', tgl_jumat: '2026-10-02', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Dra. Hj. Sunaeah, M.H.', nilai_ma: 'Agung Sugiarto, S.M.', budaya_malu: 'Dadan D., S.Sy.', mc: 'Novi Iriani, S.E.' },
    { no: 14, hari_mode: 'Sn & Jm', tgl_senin: '2026-10-05', tgl_jumat: '2026-10-09', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: "Dra. Z. Hani'Ah", nilai_ma: 'Hamdan Nahari, S. Ag.', budaya_malu: 'Rivki Fandi A., S.Sy.', mc: 'Tutwuri H., S.Ak.' },
    { no: 15, hari_mode: 'Sn & Jm', tgl_senin: '2026-10-12', tgl_jumat: '2026-10-16', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Usman, S.H.', nilai_ma: 'Ika Carlika, S.Sy.', budaya_malu: 'Daryatno, A.Md.', mc: 'Maurizka Ainur R., S.T.' },
    { no: 16, hari_mode: 'Sn & Jm', tgl_senin: '2026-10-19', tgl_jumat: '2026-10-23', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: 'Drs. Arif Mustaqim, M.H.', nilai_ma: 'Andriana, S.Sy.', budaya_malu: 'Nata Casmita Wiguna', mc: 'Putri L. E., A.Md., Akt.' },
    { no: 17, hari_mode: 'Sn & Jm', tgl_senin: '2026-10-26', tgl_jumat: '2026-10-30', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Drs. H. Iing S., S.H., M.H.', nilai_ma: 'Ade Badrujaman, S.H.I.', budaya_malu: 'Dedi Sopiyan, S.H.', mc: 'Valah M. Az Zahra, S.H.' },
    { no: 18, hari_mode: 'Sn & Jm', tgl_senin: '2026-11-02', tgl_jumat: '2026-11-06', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: 'Drs. Taufiqurrokhman, M.H.', nilai_ma: 'Akhmad F., S.H., M.H.', budaya_malu: 'Mohammad Faiz, S.Sy.', mc: 'Qonita K. Dewi, S.H.' },
    { no: 19, hari_mode: 'Sn & Jm', tgl_senin: '2026-11-09', tgl_jumat: '2026-11-13', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Dra. Hj. Sunaeah, M.H.', nilai_ma: 'Dursilah, S.Sy.', budaya_malu: 'Dedi Sopiyan, S.H.', mc: 'Widya Aprilianingrum, S.H.' },
    { no: 20, hari_mode: 'Sn & Jm', tgl_senin: '2026-11-16', tgl_jumat: '2026-11-20', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: "Dra. Z. Hani'Ah", nilai_ma: 'Heries Pramuji I., S.Sy.', budaya_malu: 'Mohammad Faiz, S.Sy.', mc: 'Hj. Lizah N. A., S.H.I., M.H.' },
    { no: 21, hari_mode: 'Sn & Jm', tgl_senin: '2026-11-23', tgl_jumat: '2026-11-27', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Usman, S.H.', nilai_ma: 'Muhyidin', budaya_malu: 'Ahmad Fauzi, S.Sy.', mc: 'Fakhriza Dhian P., S.H.' },
    { no: 22, hari_mode: 'Sn & Jm', tgl_senin: '2026-11-30', tgl_jumat: '2026-12-04', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Tarsiman', doa: 'Drs. Arif Mustaqim, M.H.', nilai_ma: 'R.A. Havid Ismail, A.Md.', budaya_malu: 'Arief Ardiansyah', mc: 'Novi Iriani, S.E.' },
    { no: 23, hari_mode: 'Sn & Jm', tgl_senin: '2026-12-07', tgl_jumat: '2026-12-11', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Abuhori', doa: 'Drs. H. Iing S., S.H., M.H.', nilai_ma: 'Agung K., A.Md., A.B.', budaya_malu: 'Dadan D., S.Sy.', mc: 'Tutwuri H., S.Ak.' },
    { no: 24, hari_mode: 'Sn & Jm', tgl_senin: '2026-12-14', tgl_jumat: '2026-12-18', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Arif Rizal Muslim, S.H.', doa: 'Drs. Taufiqurrokhman, M.H.', nilai_ma: 'Agung Sugiarto, S.M.', budaya_malu: 'Rivki Fandi A., S.Sy.', mc: 'Maurizka Ainur R., S.T.' },
    { no: 25, hari_mode: 'Sn', tgl_senin: '2026-12-21', tgl_jumat: '', pembina: 'H. Zulkifli, S.Ag., S.H., M.H.', pemimpin: 'Gerald Dwi Anggara', doa: 'Dra. Hj. Sunaeah, M.H.', nilai_ma: 'Hamdan Nahari, S. Ag.', budaya_malu: 'Daryatno, A.Md.', mc: 'Putri L. E., A.Md., Akt.' }
  ];

  function stripLeadingTitles(str) {
    let cur = String(str || '').toLowerCase().trim();
    const rx = /^(?:drs|dra|dr|ir|prof|h|hj|kh|ust|r\.?\s*a|r)\.?\s+/i;
    for (let i = 0; i < 5; i++) {
      const next = cur.replace(rx, '').trim();
      if (next === cur) break;
      cur = next;
    }
    return cur;
  }

  function normNameTokens(name) {
    let base = String(name || '').split(',')[0] || '';
    base = stripLeadingTitles(base);
    base = base.replace(/\./g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return base ? base.split(' ').filter(Boolean) : [];
  }

  function normNameKey(name) {
    return normNameTokens(name).join('');
  }

  function readGlobalUsersList() {
    if (typeof window !== 'undefined' && window.vueState && Array.isArray(window.vueState.usersList) && window.vueState.usersList.length > 0) {
      return window.vueState.usersList;
    }
    if (typeof state !== 'undefined' && Array.isArray(state.usersList) && state.usersList.length > 0) {
      return state.usersList;
    }
    if (typeof window !== 'undefined' && window.vmPegawai && Array.isArray(window.vmPegawai.users) && window.vmPegawai.users.length > 0) {
      return window.vmPegawai.users;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const cached = JSON.parse(localStorage.getItem('transkep_users_cache') || '[]');
        if (Array.isArray(cached) && cached.length > 0) return cached;
      } catch (e) {}
    }
    return [];
  }

  function scoreFuzzyNameMatch(nameA, nameB) {
    const kA = normNameKey(nameA);
    const kB = normNameKey(nameB);
    if (!kA || !kB) return 0;
    if (kA === kB) return 100;
    const tA = normNameTokens(nameA);
    const tB = normNameTokens(nameB);
    if (!tA.length || !tB.length) return 0;
    const shorter = tA.length <= tB.length ? tA : tB;
    const longer = tA.length <= tB.length ? tB : tA;
    let exactToks = 0;
    let initToks = 0;
    const used = {};
    for (let i = 0; i < shorter.length; i++) {
      const sTok = shorter[i];
      let hitIdx = longer.findIndex((lTok, j) => !used[j] && lTok === sTok);
      if (hitIdx !== -1) {
        used[hitIdx] = true;
        exactToks++;
        continue;
      }
      if (sTok.length === 1) {
        hitIdx = longer.findIndex((lTok, j) => !used[j] && lTok.startsWith(sTok));
        if (hitIdx !== -1) { used[hitIdx] = true; initToks++; continue; }
      }
      hitIdx = longer.findIndex((lTok, j) => !used[j] && lTok.length === 1 && sTok.startsWith(lTok));
      if (hitIdx !== -1) { used[hitIdx] = true; initToks++; }
    }
    if (exactToks + initToks === shorter.length) {
      if (exactToks >= 2 || (exactToks >= 1 && initToks >= 1)) return 60 + exactToks * 10 + initToks * 5;
      if (shorter.length === 1 && shorter[0].length >= 5) return 55;
    }
    return 0;
  }

  function isFuzzyNameMatch(nameA, nameB) {
    return scoreFuzzyNameMatch(nameA, nameB) > 0;
  }

  function prepareLogoCanvas(img, stripWhite) {
    if (!img || !img.width || !img.height || typeof document === 'undefined') return null;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      const w = c.width, h = c.height;

      const cornerA = d[3];
      const cornerMax = Math.max(d[0], d[1], d[2]);
      const cornerMin = Math.min(d[0], d[1], d[2]);
      if (stripWhite && cornerA >= 20 && cornerMin >= 205 && (cornerMax - cornerMin) <= 30) {
        const visited = new Uint8Array(w * h);
        const q = [];
        const pushSeed = (idx) => { if (!visited[idx]) { visited[idx] = 1; q.push(idx); } };
        for (let x = 0; x < w; x++) { pushSeed(x); pushSeed((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { pushSeed(y * w); pushSeed(y * w + (w - 1)); }
        for (let head = 0; head < q.length; head++) {
          const idx = q[head];
          const p = idx * 4;
          const r = d[p], g = d[p + 1], b = d[p + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mn >= 208 && (mx - mn) <= 30) {
            d[p + 3] = 0;
            const x = idx % w, y = (idx - x) / w;
            if (x > 0) pushSeed(idx - 1);
            if (x + 1 < w) pushSeed(idx + 1);
            if (y > 0) pushSeed(idx - w);
            if (y + 1 < h) pushSeed(idx + w);
          } else if (mn >= 178 && (mx - mn) <= 28) {
            // Feather edge anti-aliasing instead of harsh jagged cutoff
            const alphaRatio = Math.max(0, Math.min(1, (208 - mn) / 30));
            d[p + 3] = Math.round(d[p + 3] * alphaRatio);
          }
        }
        cx.putImageData(id, 0, 0);
      }

      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] > 18) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        out.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
        return out;
      }
      return c;
    } catch (e) {
      return img;
    }
  }

  function drawCrispSocialFooter(ctx, W) {
    ctx.save();
    ctx.fillStyle = '#c6df6b';
    ctx.fillRect(0, 1292, W, 58);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, 1292, W, 2);

    const items = [
      { kind: 'fb', text: 'Pengadilan Agama Indramayu' },
      { kind: 'ig', text: '@paindramayu' },
      { kind: 'yt', text: 'paindramayu' },
      { kind: 'web', text: 'pa-indramayu.go.id' },
      { kind: 'x', text: '@paindramayu_' }
    ];

    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.textBaseline = 'middle';
    const iconSize = 26;
    const iconGap = 8;
    const itemGap = 24;
    const widths = items.map(it => iconSize + iconGap + ctx.measureText(it.text).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + itemGap * (items.length - 1);
    let curX = Math.round((W - totalW) / 2);
    const cy = 1322;

    items.forEach((it, i) => {
      const ix = curX + iconSize / 2;
      ctx.save();
      if (it.kind === 'fb') {
        ctx.beginPath();
        ctx.arc(ix, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#1877f2';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('f', ix + 0.5, cy + 1);
      } else if (it.kind === 'ig') {
        const gr = ctx.createLinearGradient(curX, cy - 12, curX + 24, cy + 12);
        gr.addColorStop(0, '#f58529');
        gr.addColorStop(0.5, '#dd2a7b');
        gr.addColorStop(1, '#8134af');
        drawRoundedPill(ctx, curX + 1, cy - 12, 24, 24, 7, gr);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(curX + 6, cy - 7, 14, 14);
        ctx.beginPath();
        ctx.arc(ix + 0.5, cy, 3.6, 0, Math.PI * 2);
        ctx.stroke();
      } else if (it.kind === 'yt') {
        drawRoundedPill(ctx, curX, cy - 9, 26, 18, 5, '#ff0000');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(curX + 10, cy - 4.5);
        ctx.lineTo(curX + 10, cy + 4.5);
        ctx.lineTo(curX + 18, cy);
        ctx.closePath();
        ctx.fill();
      } else if (it.kind === 'web') {
        ctx.beginPath();
        ctx.arc(ix, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(ix, cy, 5.5, 11, 0, 0, Math.PI * 2);
        ctx.moveTo(ix - 11, cy);
        ctx.lineTo(ix + 11, cy);
        ctx.stroke();
      } else if (it.kind === 'x') {
        ctx.beginPath();
        ctx.arc(ix, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#111827';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('X', ix, cy + 0.5);
      }
      ctx.restore();

      ctx.fillStyle = '#143018';
      ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(it.text, curX + iconSize + iconGap, cy + 0.5);
      curX += widths[i] + itemGap;
    });
    ctx.restore();
  }

  function parseYmd(rawVal) {
    const s = String(rawVal || '').trim();
    if (!s) return '';
    const mIso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3];
    const mDmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (mDmy) {
      return mDmy[3] + '-' + String(parseInt(mDmy[2], 10)).padStart(2, '0') + '-' + String(parseInt(mDmy[1], 10)).padStart(2, '0');
    }
    return '';
  }

  function formatIndoUpper(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const mons = [
      'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
      'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
    ];
    return parseInt(m[3], 10) + ' ' + mons[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))] + ' ' + m[1];
  }

  function loadImageAsset(src) {
    if (!src) return Promise.resolve(null);
    if (imageCacheMap[src]) return Promise.resolve(imageCacheMap[src]);
    return new Promise((resolve) => {
      const img = new Image();
      if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => { imageCacheMap[src] = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function compressImageFile(file, maxWidth, maxHeight, maxLenBytes) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      r.readAsDataURL(file);
    });
    const img = await loadImageAsset(dataUrl);
    if (!img) throw new Error('File bukan gambar valid.');
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const w = Math.max(40, Math.round(img.width * ratio));
    const h = Math.max(40, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    let q = 0.86;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > maxLenBytes && q > 0.35) {
      q -= 0.1;
      out = canvas.toDataURL('image/jpeg', q);
    }
    if (out.length > maxLenBytes) {
      throw new Error('Ukuran gambar masih terlalu besar setelah kompresi (' + Math.round(out.length / 1024) + ' KB).');
    }
    return out;
  }

  function drawRoundedPill(ctx, x, y, w, h, r, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawCircularPortrait(ctx, cx, cy, r, photoImg, fallbackInitials) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grad.addColorStop(0, '#ef4444');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    if (photoImg && photoImg.width > 0 && photoImg.height > 0) {
      const boxSize = r * 2;
      const scale = Math.max(boxSize / photoImg.width, boxSize / photoImg.height);
      const dw = photoImg.width * scale;
      const dh = photoImg.height * scale;
      const dx = cx - dw / 2;
      const dy = cy - r - Math.max(0, (dh - boxSize) * 0.15);
      ctx.drawImage(photoImg, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.18, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.85, r * 0.72, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      if (fallbackInitials) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 ' + Math.round(r * 0.42) + 'px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fallbackInitials, cx, cy);
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = r > 60 ? 5 : 4;
    ctx.strokeStyle = '#1b662f';
    ctx.stroke();
  }

  function drawWbkEmblem(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r - 9, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#9ca3af';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ZONA INTEGRITAS', cx, cy - r + 24);
    ctx.font = '900 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('WBK', cx, cy + 7);
    ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('KEMENPAN-RB', cx, cy + r - 18);
    ctx.restore();
  }
  function buildDefaultSettings() {
    return {
      id: 'APEL-SETTINGS',
      doc_type: 'settings',
      admin_wa: '',
      jam_kirim: '15:00',
      bg_gedung_uri: '',
      caption_template: 'Mohon kehadirannya tepat waktu. Bagi petugas berhalangan (Cuti/ST) sudah digantikan secara otomatis oleh sistem.'
    };
  }

  function createApelVueApp() {
    if (typeof Vue === 'undefined' || !document.getElementById('vue-apel-app')) return null;

    return Vue.createApp({
      data() {
        return {
          showModal: false,
          isFullscreen: false,
          asnUsersList: readGlobalUsersList(),
          activeTab: 'jadwal',
          selectedYear: '2026',
          yearDocsMap: {
            '2026': {
              id: 'APEL-2026',
              doc_type: 'tahun',
              tahun: 2026,
              nomor_sk: '538/KPA.W10-A2/SK.KP7.1/VI/2026',
              tanggal_sk: '4 Juni 2026',
              rows: SEED_2026_SEM2.map(r => Object.assign({}, r))
            },
            '2027': {
              id: 'APEL-2027',
              doc_type: 'tahun',
              tahun: 2027,
              nomor_sk: '',
              tanggal_sk: '',
              rows: []
            }
          },
          satpamList: [],
          satpamForm: {
            id: '',
            nama: '',
            panggilan: '',
            jabatan: 'Satpam / Komandan',
            no_wa: '',
            photo_data_uri: '',
            aktif: true
          },
          settingsDoc: buildDefaultSettings(),
          asnAvatarMap: {},
          stListCache: [],
          selectedWeekIdx: 0,
          tableSearch: '',
          showGeneratorDrawer: false,
          genStartDate: '2026-07-06',
          genEndDate: '2026-12-31',
          genMode: 'replace',
          showImportModal: false,
          importJsonRaw: '',
          importFilePayload: { base64: '', mimeType: '', name: '' },
          localN8nImportUrl: (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_apel_import_webhook') || '') : ''),
          isSavingYear: false,
          isSavingSatpam: false,
          isSavingSettings: false,
          isUploadingPoster: false,
          isImportingAi: false,
          renderNonce: 0
        };
      },

      computed: {
        isAdminOrOperator() {
          const r = String(
            (typeof state !== 'undefined' && state.user && state.user.role) ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_user_role') : '') || ''
          ).toLowerCase();
          return r === 'admin' || r === 'operator' || r.indexOf('kepegawaian') !== -1;
        },

        availableYears() {
          const keys = Object.keys(this.yearDocsMap || {});
          if (!keys.includes('2026')) keys.push('2026');
          if (!keys.includes('2027')) keys.push('2027');
          return keys.sort();
        },

        currentYearDoc() {
          const y = String(this.selectedYear || '2026');
          if (!this.yearDocsMap[y]) {
            this.yearDocsMap[y] = {
              id: 'APEL-' + y,
              doc_type: 'tahun',
              tahun: Number(y) || 2026,
              nomor_sk: '',
              tanggal_sk: '',
              rows: []
            };
          }
          return this.yearDocsMap[y];
        },

        activeRows() {
          return Array.isArray(this.currentYearDoc.rows) ? this.currentYearDoc.rows : [];
        },

        combinedOfficerNames() {
          const seen = new Set();
          const out = [];
          const pushName = (n) => {
            const c = String(n || '').trim();
            if (c && !seen.has(c)) {
              seen.add(c);
              out.push(c);
            }
          };
          (this.satpamList || []).forEach(s => pushName(s.nama));
          const allAsn = (this.asnUsersList && this.asnUsersList.length) ? this.asnUsersList : readGlobalUsersList();
          allAsn.forEach(u => pushName(u.nama));
          Object.values(DEFAULT_POOLS).forEach(arr => arr.forEach(pushName));
          return out.sort();
        },

        userNipByNormName() {
          const map = {};
          const allAsn = (this.asnUsersList && this.asnUsersList.length) ? this.asnUsersList : readGlobalUsersList();
          allAsn.forEach(u => {
            const k = normNameKey(u.nama);
            const nip = String(u.nip || '').replace(/['"\s]/g, '').trim();
            if (k && nip) map[k] = nip;
          });
          return map;
        },

        satpamPhotoByNormName() {
          const map = {};
          (this.satpamList || []).forEach(sp => {
            const k1 = normNameKey(sp.nama);
            const k2 = normNameKey(sp.panggilan);
            if (k1 && sp.photo_data_uri) map[k1] = sp.photo_data_uri;
            if (k2 && sp.photo_data_uri) map[k2] = sp.photo_data_uri;
          });
          return map;
        },

        rowEvaluations() {
          const rows = this.activeRows;
          return rows.map((r, idx) => this.evaluateWeekRow(rows, idx));
        },

        totalYearConflicts() {
          return this.rowEvaluations.reduce((acc, ev) => acc + ev.substitutions.length, 0);
        },

        filteredRows() {
          const q = String(this.tableSearch || '').trim().toLowerCase();
          return this.activeRows
            .map((row, idx) => ({
              row,
              index: idx,
              eval: this.rowEvaluations[idx] || { effective: row, substitutions: [], subMap: {} }
            }))
            .filter(item => {
              if (!q) return true;
              const hay = [
                item.row.tgl_senin, item.row.tgl_jumat, item.row.pembina,
                item.row.pemimpin, item.row.doa, item.row.nilai_ma,
                item.row.budaya_malu, item.row.mc
              ].join(' ').toLowerCase();
              return hay.includes(q);
            });
        },

        selectedRow() {
          return this.activeRows[this.selectedWeekIdx] || null;
        },

        selectedEvaluation() {
          return this.rowEvaluations[this.selectedWeekIdx] || { effective: {}, substitutions: [], subMap: {} };
        },

        generatedWaCaption() {
          const row = this.selectedRow;
          if (!row) return 'Pilih minggu apel terlebih dahulu.';
          const eff = this.selectedEvaluation.effective || row;
          const subs = this.selectedEvaluation.substitutions || [];
          const snLabel = (row.hari_mode || '').includes('Sn') && row.tgl_senin ? ('Senin, ' + formatIndoUpper(row.tgl_senin)) : '';
          const jmLabel = (row.hari_mode || '').includes('Jm') && row.tgl_jumat ? ('Jumat, ' + formatIndoUpper(row.tgl_jumat)) : '';
          const lines = [
            '*PENGUMUMAN PETUGAS APEL PA INDRAMAYU*',
            snLabel ? ('📅 ' + snLabel) : '',
            jmLabel ? ('📅 ' + jmLabel) : '',
            '',
            '• *Pembina:* ' + (eff.pembina || '-'),
            '• *Pemimpin / Komandan:* ' + (eff.pemimpin || '-'),
            '• *Pembaca Doa:* ' + (eff.doa || '-'),
            '• *8 Nilai MA-RI:* ' + (eff.nilai_ma || '-'),
            '• *MC / Protokol:* ' + (eff.mc || '-'),
            '• *10 Budaya Malu:* ' + (eff.budaya_malu || '-')
          ].filter(Boolean);
          if (subs.length > 0) {
            lines.push('');
            lines.push('*Penyesuaian Otomatis (Cuti / Dinas Luar ST):*');
            subs.forEach(s => lines.push(`⚠️ _${s.role_label}_: ${s.original} (${s.reason}) -> diganti *${s.replacement}*`));
          }
          if (this.settingsDoc && this.settingsDoc.caption_template) {
            lines.push('');
            lines.push(this.settingsDoc.caption_template);
          }
          return lines.join('\n');
        }
      },
      methods: {
        async open() {
          this.showModal = true;
          this.asnUsersList = readGlobalUsersList();
          await this.loadFromFirestore();
          this.pickDefaultUpcomingWeek();
          this.$nextTick(() => {
            if (this.activeTab === 'poster') this.refreshPosterCanvas();
          });
        },

        async syncAvatarsNow() {
          this.asnUsersList = readGlobalUsersList();
          await this.loadFromFirestore();
          this.$nextTick(() => this.refreshPosterCanvas());
        },

        closeModal() {
          this.showModal = false;
        },

        toggleFullscreen() {
          this.isFullscreen = !this.isFullscreen;
        },

        onSelectYearChange() {
          this.genStartDate = this.selectedYear + '-01-01';
          this.genEndDate = this.selectedYear + '-12-31';
          this.pickDefaultUpcomingWeek();
        },

        promptAddYear() {
          const inp = typeof prompt === 'function' ? prompt('Masukkan Tahun Jadwal Apel (mis. 2027 atau 2028):', '2027') : '2027';
          const clean = String(inp || '').replace(/[^0-9]/g, '').slice(0, 4);
          if (!clean || clean.length !== 4) return;
          if (!this.yearDocsMap[clean]) {
            this.yearDocsMap[clean] = {
              id: 'APEL-' + clean,
              doc_type: 'tahun',
              tahun: Number(clean),
              nomor_sk: '',
              tanggal_sk: '',
              rows: []
            };
          }
          this.selectedYear = clean;
          this.onSelectYearChange();
        },

        async loadFromFirestore() {
          if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) return;
          try {
            const [docs, avatars, stDocs] = await Promise.all([
              TranskepFirebase.getFirestoreEofficeApels(),
              TranskepFirebase.getFirestoreUserAvatars().catch(() => ({})),
              TranskepFirebase.getFirestoreSuratTugas ? TranskepFirebase.getFirestoreSuratTugas().catch(() => []) : Promise.resolve([])
            ]);
            const mergedAvatars = Object.assign(
              {},
              (typeof window !== 'undefined' && window.vmPegawai && window.vmPegawai.avatarsMap) ? window.vmPegawai.avatarsMap : {},
              (avatars && typeof avatars === 'object') ? avatars : {}
            );
            this.asnAvatarMap = mergedAvatars;
            if (this.activeTab === 'poster') this.$nextTick(() => this.refreshPosterCanvas());
            if (Array.isArray(stDocs) && stDocs.length > 0) {
              this.stListCache = stDocs;
            }
            this.applyFirestoreDocs(docs);
            if (!apelRealtimeUnsub && typeof TranskepFirebase.subscribeFirestoreEofficeApels === 'function') {
              apelRealtimeUnsub = TranskepFirebase.subscribeFirestoreEofficeApels((liveDocs) => {
                this.applyFirestoreDocs(liveDocs);
              });
            }
          } catch (err) {
            console.warn('⚠️ [Apel] Gagal memuat Firestore eoffice_apel:', err);
          }
        },

        applyFirestoreDocs(docs) {
          if (!Array.isArray(docs) || docs.length === 0) return;
          const nextSatpam = [];
          docs.forEach(d => {
            if (!d || typeof d !== 'object') return;
            if (d.doc_type === 'tahun') {
              const yr = String(d.tahun || (String(d.id || '').replace('APEL-', '')) || '').trim();
              if (!yr) return;
              let rows = [];
              try {
                const parsed = JSON.parse(String(d.jadwal_json || '[]'));
                if (Array.isArray(parsed)) rows = parsed;
              } catch (eJ) {}
              this.yearDocsMap[yr] = {
                id: d.id || ('APEL-' + yr),
                doc_type: 'tahun',
                tahun: Number(yr) || yr,
                nomor_sk: String(d.nomor_sk || ''),
                tanggal_sk: String(d.tanggal_sk || ''),
                rows: rows,
                created_at: d.created_at || null
              };
            } else if (d.doc_type === 'satpam') {
              nextSatpam.push(Object.assign({}, d));
            } else if (d.doc_type === 'settings' || d.id === 'APEL-SETTINGS') {
              this.settingsDoc = Object.assign(buildDefaultSettings(), d);
            }
          });
          this.satpamList = nextSatpam.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        },

        pickDefaultUpcomingWeek() {
          const rows = this.activeRows;
          if (!rows.length) {
            this.selectedWeekIdx = 0;
            return;
          }
          const todayIso = new Date().toISOString().split('T')[0];
          let idx = rows.findIndex(r => (r.tgl_senin && r.tgl_senin >= todayIso) || (r.tgl_jumat && r.tgl_jumat >= todayIso));
          if (idx === -1) idx = 0;
          this.selectedWeekIdx = idx;
        },

        getActiveAbsentLookup(dateList) {
          const dates = (dateList || []).filter(Boolean);
          const nips = {};
          const names = {};
          if (!dates.length) return { nips, names };

          const mark = (ymd, nip, nama, reason) => {
            if (!dates.includes(ymd)) return;
            const cNip = String(nip || '').replace(/['"\s]/g, '').trim();
            const nKey = normNameKey(nama);
            if (cNip && !nips[cNip]) nips[cNip] = reason;
            if (nKey && !names[nKey]) names[nKey] = reason;
          };

          const cutis = (typeof state !== 'undefined' && Array.isArray(state.cutiLogs)) ? state.cutiLogs : [];
          cutis.forEach(c => {
            const st = String(c.status || '').toLowerCase();
            if (!st || st.includes('tolak') || st.includes('batal')) return;
            const y1 = parseYmd(c.tgl_mulai);
            const y2 = parseYmd(c.tgl_selesai) || y1;
            if (!y1) return;
            const cNip = String(c.nip || '').replace(/['"\s]/g, '').trim();
            let cNama = c.nama || '';
            const allAsnForCuti = (this.asnUsersList && this.asnUsersList.length) ? this.asnUsersList : readGlobalUsersList();
            if (!cNama && cNip && allAsnForCuti.length > 0) {
              const uMatch = allAsnForCuti.find(u => String(u.nip || '').replace(/['"\s]/g, '').trim() === cNip);
              if (uMatch) cNama = uMatch.nama;
            }
            dates.forEach(td => {
              if (td >= y1 && td <= y2) mark(td, cNip, cNama, String(c.jenis || 'Cuti'));
            });
          });

          const sts = (this.stListCache && this.stListCache.length)
            ? this.stListCache
            : ((typeof state !== 'undefined' && Array.isArray(state.stList)) ? state.stList : []);
          sts.forEach(s => {
            const st = String(s.status || '').toLowerCase();
            if (st.includes('tolak') || st.includes('batal')) return;
            const y1 = parseYmd(s.tgl_mulai);
            const y2 = parseYmd(s.tgl_selesai) || y1;
            if (!y1) return;
            let peserta = [];
            if (Array.isArray(s.peserta)) peserta = s.peserta;
            else if (typeof s.peserta === 'string' && s.peserta.trim()) {
              try {
                const parsed = JSON.parse(s.peserta);
                if (Array.isArray(parsed)) peserta = parsed;
              } catch (e) {}
            }
            dates.forEach(td => {
              if (td >= y1 && td <= y2) {
                peserta.forEach(p => {
                  if (p && typeof p === 'object') mark(td, p.nip, p.nama, 'Surat Tugas');
                  else if (typeof p === 'string') mark(td, '', p, 'Surat Tugas');
                });
              }
            });
          });

          return { nips, names };
        },

        evaluateWeekRow(rows, idx) {
          const row = rows[idx];
          if (!row) return { effective: {}, substitutions: [], subMap: {} };
          const activeDates = [];
          const h = String(row.hari_mode || 'Sn & Jm');
          if (h.includes('Sn') && row.tgl_senin) activeDates.push(row.tgl_senin);
          if (h.includes('Jm') && row.tgl_jumat) activeDates.push(row.tgl_jumat);

          const absent = this.getActiveAbsentLookup(activeDates);
          const nipLookup = this.userNipByNormName;
          const findConflict = (name, explicitNip) => {
            const cNip = String(explicitNip || nipLookup[normNameKey(name)] || '').replace(/['"\s]/g, '').trim();
            const nKey = normNameKey(name);
            if (cNip && absent.nips[cNip]) return absent.nips[cNip];
            if (nKey && absent.names[nKey]) return absent.names[nKey];
            return '';
          };

          const effective = {};
          const substitutions = [];
          const subMap = {};
          const usedSubs = {};

          ROLE_META.forEach(rm => {
            const orig = String(row[rm.key] || '').trim();
            effective[rm.key] = orig;
            if (!orig) return;
            const reason = findConflict(orig, row[rm.key + '_nip']);
            if (!reason) return;

            for (let step = 1; step < rows.length; step++) {
              const candRow = rows[(idx + step) % rows.length];
              const cand = String(candRow[rm.key] || '').trim();
              if (!cand) continue;
              const candKey = normNameKey(cand);
              if (!candKey || candKey === normNameKey(orig) || usedSubs[candKey]) continue;
              if (!findConflict(cand, candRow[rm.key + '_nip'])) {
                effective[rm.key] = cand;
                usedSubs[candKey] = true;
                const info = { role: rm.key, role_label: rm.label, original: orig, replacement: cand, reason };
                substitutions.push(info);
                subMap[rm.key] = info;
                break;
              }
            }
          });

          return { effective, substitutions, subMap };
        },

        loadBuiltInSeed2026Sem2() {
          this.currentYearDoc.nomor_sk = this.currentYearDoc.nomor_sk || '538/KPA.W10-A2/SK.KP7.1/VI/2026';
          this.currentYearDoc.tanggal_sk = this.currentYearDoc.tanggal_sk || '4 Juni 2026';
          this.currentYearDoc.rows = SEED_2026_SEM2.map(r => Object.assign({}, r));
          if (typeof showNotify === 'function') {
            showNotify('Template 2026 Dimuat', '25 minggu Semester 2 tahun 2026 berhasil dimuat. Klik Simpan 2026 untuk menyimpan ke Firestore.', 'success');
          }
        },

        runAnnualRotationGenerator() {
          const yr = String(this.selectedYear || '2027');
          const startIso = parseYmd(this.genStartDate) || (yr + '-01-01');
          const endIso = parseYmd(this.genEndDate) || (yr + '-12-31');
          const startDt = new Date(startIso + 'T00:00:00Z');
          const endDt = new Date(endIso + 'T00:00:00Z');
          if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || startDt > endDt) {
            if (typeof showNotify === 'function') showNotify('Tanggal Tidak Valid', 'Pastikan tanggal mulai lebih awal dari tanggal akhir.', 'warning');
            return;
          }

          const pools = {};
          const existingRows = this.activeRows;
          ROLE_META.forEach(rm => {
            const uniqueFromTable = [];
            existingRows.forEach(r => {
              const v = String(r[rm.key] || '').trim();
              if (v && !uniqueFromTable.includes(v)) uniqueFromTable.push(v);
            });
            pools[rm.key] = uniqueFromTable.length > 0 ? uniqueFromTable : (DEFAULT_POOLS[rm.key] || ['-']);
          });

          if (pools.pemimpin.length === 0 && this.satpamList.length > 0) {
            pools.pemimpin = this.satpamList.filter(s => s.aktif !== false).map(s => s.nama);
          }

          // Cari Senin pertama pada atau sebelum startDt minggu berjalan (atau Senin terdekat dalam rentang)
          let cursor = new Date(startDt.getTime());
          const dow = cursor.getUTCDay();
          if (dow !== 1) {
            const offset = dow === 0 ? 1 : (dow <= 4 ? -(dow - 1) : (8 - dow));
            cursor.setUTCDate(cursor.getUTCDate() + offset);
          }

          const baseRows = (this.genMode === 'append') ? existingRows.slice() : [];
          let noCounter = baseRows.length + 1;
          let rot = baseRows.length;
          const generated = [];

          while (cursor <= endDt && generated.length < 60) {
            const monYmd = cursor.toISOString().split('T')[0];
            const friDt = new Date(cursor.getTime() + 4 * 86400000);
            const friYmd = friDt.toISOString().split('T')[0];
            const hasSn = monYmd >= startIso && monYmd <= endIso;
            const hasJm = friYmd >= startIso && friYmd <= endIso;
            if (hasSn || hasJm) {
              generated.push({
                no: noCounter++,
                hari_mode: (hasSn && hasJm) ? 'Sn & Jm' : (hasSn ? 'Sn' : 'Jm'),
                tgl_senin: hasSn ? monYmd : '',
                tgl_jumat: hasJm ? friYmd : '',
                pembina: pools.pembina[rot % pools.pembina.length] || '',
                pemimpin: pools.pemimpin[rot % pools.pemimpin.length] || '',
                doa: pools.doa[rot % pools.doa.length] || '',
                nilai_ma: pools.nilai_ma[rot % pools.nilai_ma.length] || '',
                budaya_malu: pools.budaya_malu[rot % pools.budaya_malu.length] || '',
                mc: pools.mc[rot % pools.mc.length] || ''
              });
              rot++;
            }
            cursor.setUTCDate(cursor.getUTCDate() + 7);
          }

          this.currentYearDoc.rows = baseRows.concat(generated);
          this.showGeneratorDrawer = false;
          if (typeof showNotify === 'function') {
            showNotify('Generator Selesai', `${generated.length} minggu jadwal apel tahun ${yr} berhasil disusun.`, 'success');
          }
        },

        addSingleWeekRow() {
          const rows = this.currentYearDoc.rows;
          const last = rows[rows.length - 1];
          let nextSn = this.selectedYear + '-01-05';
          let nextJm = this.selectedYear + '-01-09';
          if (last && (last.tgl_senin || last.tgl_jumat)) {
            const baseIso = last.tgl_senin || last.tgl_jumat;
            const dt = new Date(baseIso + 'T00:00:00Z');
            dt.setUTCDate(dt.getUTCDate() + 7);
            if (!last.tgl_senin && last.tgl_jumat) dt.setUTCDate(dt.getUTCDate() - 4);
            nextSn = dt.toISOString().split('T')[0];
            nextJm = new Date(dt.getTime() + 4 * 86400000).toISOString().split('T')[0];
          }
          rows.push({
            no: rows.length + 1,
            hari_mode: 'Sn & Jm',
            tgl_senin: nextSn,
            tgl_jumat: nextJm,
            pembina: DEFAULT_POOLS.pembina[0] || '',
            pemimpin: '',
            doa: '',
            nilai_ma: '',
            budaya_malu: '',
            mc: ''
          });
        },

        removeWeekRow(idx) {
          this.currentYearDoc.rows.splice(idx, 1);
          this.currentYearDoc.rows.forEach((r, i) => { r.no = i + 1; });
        },

        async saveActiveYearToFirestore() {
          if (typeof TranskepFirebase === 'undefined' || !TranskepFirebase.isReady()) return;
          this.isSavingYear = true;
          try {
            const doc = this.currentYearDoc;
            await TranskepFirebase.saveEofficeApelToFirestore({
              id: 'APEL-' + String(this.selectedYear),
              doc_type: 'tahun',
              tahun: Number(this.selectedYear),
              nomor_sk: doc.nomor_sk || '',
              tanggal_sk: doc.tanggal_sk || '',
              jadwal_json: JSON.stringify(doc.rows || []),
              created_at: doc.created_at || null
            });
            if (typeof showNotify === 'function') {
              showNotify('Tersimpan di Firestore', `Jadwal Apel tahun ${this.selectedYear} (${(doc.rows || []).length} minggu) berhasil disimpan.`, 'success');
            }
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Menyimpan', err.message || String(err), 'error');
          } finally {
            this.isSavingYear = false;
          }
        },
        resetSatpamForm() {
          this.satpamForm = { id: '', nama: '', panggilan: '', jabatan: 'Satpam / Komandan', no_wa: '', photo_data_uri: '', aktif: true };
        },

        editSatpamRecord(sp) {
          this.satpamForm = {
            id: sp.id || '',
            nama: sp.nama || '',
            panggilan: sp.panggilan || '',
            jabatan: sp.jabatan || 'Satpam / Komandan',
            no_wa: sp.no_wa || '',
            photo_data_uri: sp.photo_data_uri || '',
            aktif: sp.aktif !== false,
            created_at: sp.created_at || null
          };
        },

        async onSelectSatpamPhoto(ev) {
          const file = ev && ev.target && ev.target.files && ev.target.files[0];
          if (!file) return;
          try {
            const compressed = await compressImageFile(file, 240, 328, 148000);
            this.satpamForm.photo_data_uri = compressed;
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Foto Satpam', err.message || String(err), 'error');
          }
        },

        async saveSatpamRecord() {
          if (!String(this.satpamForm.nama || '').trim()) {
            if (typeof showNotify === 'function') showNotify('Validasi', 'Nama petugas Satpam wajib diisi.', 'warning');
            return;
          }
          this.isSavingSatpam = true;
          try {
            const docId = this.satpamForm.id || ('SATPAM-' + Date.now().toString(36).toUpperCase());
            await TranskepFirebase.saveEofficeApelToFirestore({
              id: docId,
              doc_type: 'satpam',
              satpam_id: docId,
              nama: this.satpamForm.nama.trim(),
              panggilan: (this.satpamForm.panggilan || this.satpamForm.nama.split(' ')[0] || '').trim(),
              jabatan: (this.satpamForm.jabatan || 'Satpam / Komandan').trim(),
              no_wa: (this.satpamForm.no_wa || '').trim(),
              photo_data_uri: this.satpamForm.photo_data_uri || '',
              aktif: this.satpamForm.aktif !== false,
              created_at: this.satpamForm.created_at || null
            });
            this.resetSatpamForm();
            await this.loadFromFirestore();
            if (typeof showNotify === 'function') showNotify('Tersimpan', 'Data petugas Satpam berhasil disimpan di Cloud Firestore.', 'success');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Simpan Satpam', err.message || String(err), 'error');
          } finally {
            this.isSavingSatpam = false;
          }
        },

        async deleteSatpamRecord(sp) {
          if (!sp || !sp.id) return;
          if (typeof confirm === 'function' && !confirm('Hapus data Satpam "' + sp.nama + '"?')) return;
          try {
            await TranskepFirebase.deleteEofficeApelFromFirestore(sp.id);
            await this.loadFromFirestore();
            if (typeof showNotify === 'function') showNotify('Terhapus', 'Data Satpam berhasil dihapus.', 'success');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Hapus', err.message || String(err), 'error');
          }
        },

        async onSelectBuildingPhoto(ev) {
          const file = ev && ev.target && ev.target.files && ev.target.files[0];
          if (!file) return;
          try {
            const compressed = await compressImageFile(file, 1080, 680, 148000);
            this.settingsDoc.bg_gedung_uri = compressed;
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Foto Gedung', err.message || String(err), 'error');
          }
        },

        async saveSettingsToFirestore() {
          this.isSavingSettings = true;
          try {
            if (typeof localStorage !== 'undefined' && this.localN8nImportUrl) {
              localStorage.setItem('transkep_apel_import_webhook', this.localN8nImportUrl.trim());
            }
            await TranskepFirebase.saveEofficeApelToFirestore(Object.assign({}, this.settingsDoc, {
              id: 'APEL-SETTINGS',
              doc_type: 'settings'
            }));
            if (typeof showNotify === 'function') showNotify('Pengaturan Tersimpan', 'Pengaturan WA Admin & latar gedung tersimpan di Firestore.', 'success');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Simpan Pengaturan', err.message || String(err), 'error');
          } finally {
            this.isSavingSettings = false;
          }
        },

        selectWeekForPoster(idx) {
          this.selectedWeekIdx = idx;
          this.activeTab = 'poster';
          this.$nextTick(() => this.refreshPosterCanvas());
        },

        findMatchingSatpam(name) {
          const key = normNameKey(name);
          if (key && this.satpamPhotoByNormName[key]) return { photo_data_uri: this.satpamPhotoByNormName[key] };
          return (this.satpamList || []).find(sp => isFuzzyNameMatch(name, sp.nama) || isFuzzyNameMatch(name, sp.panggilan)) || null;
        },

        findMatchingAsnUser(name, explicitNip) {
          const cleanExp = String(explicitNip || '').replace(/['"\s]/g, '').trim();
          const users = (this.asnUsersList && this.asnUsersList.length) ? this.asnUsersList : readGlobalUsersList();
          if (cleanExp) {
            const byNip = users.find(u => String(u.nip || '').replace(/['"\s]/g, '').trim() === cleanExp);
            if (byNip) return byNip;
          }
          const key = normNameKey(name);
          const nipExact = this.userNipByNormName[key];
          if (nipExact) {
            const u = users.find(x => String(x.nip || '').replace(/['"\s]/g, '').trim() === nipExact);
            if (u) return u;
          }
          let bestUser = null;
          let bestScore = 0;
          users.forEach(u => {
            const sc = scoreFuzzyNameMatch(name, u.nama);
            if (sc > bestScore) { bestScore = sc; bestUser = u; }
          });
          return bestUser;
        },

        getOfficerPhotoDiagnostic(name, explicitNip) {
          const sp = this.findMatchingSatpam(name);
          if (sp && sp.photo_data_uri) {
            return { uri: sp.photo_data_uri, status: 'ok', source: 'Satpam' };
          }
          const u = this.findMatchingAsnUser(name, explicitNip);
          const nip = u ? String(u.nip || '').replace(/['"\s]/g, '').trim() : String(explicitNip || '').replace(/['"\s]/g, '').trim();
          if (nip) {
            const fromMap = (this.asnAvatarMap && this.asnAvatarMap[nip] && this.asnAvatarMap[nip].photo_data_uri) || '';
            const fromPeg = (typeof window !== 'undefined' && window.vmPegawai && window.vmPegawai.avatarsMap && window.vmPegawai.avatarsMap[nip] && window.vmPegawai.avatarsMap[nip].photo_data_uri) || '';
            const fromLs = (typeof window !== 'undefined' && typeof window.getCachedUserAvatar === 'function') ? window.getCachedUserAvatar(nip) : '';
            const fromUser = u ? (u.photo_data_uri || u.foto_url || u.foto || '') : '';
            const uri = fromMap || fromPeg || fromLs || fromUser || '';
            if (uri) return { uri, status: 'ok', source: 'Pegawai', nip };
            return { uri: '', status: 'no_photo', source: 'Belum Upload', nip, matchedName: u ? u.nama : '' };
          }
          return { uri: '', status: 'unmatched', source: 'Nama Tdk Cocok' };
        },

        resolveOfficerPhotoUri(name, explicitNip) {
          return this.getOfficerPhotoDiagnostic(name, explicitNip).uri;
        },

        async refreshPosterCanvas() {
          const canvas = document.getElementById('apel-poster-canvas');
          const row = this.selectedRow;
          if (!canvas || !row) return;

          const token = ++this.renderNonce;
          const ctx = canvas.getContext('2d');
          const W = 1080;
          const H = 1350;
          const eff = (this.selectedEvaluation && this.selectedEvaluation.effective) ? this.selectedEvaluation.effective : row;

          // Preload semua gambar & logo resmi paralel
          const logoPromise = loadImageAsset('img/Logo_PA_Imy.png');
          const wbkPromise = loadImageAsset('img/Logo_WBK.png');
          const berakhlakPromise = loadImageAsset('img/berakhlak.png');
          const banggaPromise = loadImageAsset('img/bangga%20Melayani%20Bangsa.png');
          const socialPromise = loadImageAsset('img/alamat%20media%20sosial.png');
          const bgPromise = loadImageAsset(this.settingsDoc.bg_gedung_uri || 'img/gedung_pa.png');
          const photoPromises = ROLE_META.map(rm => {
            const oName = eff[rm.key] || '';
            const uri = this.resolveOfficerPhotoUri(oName, row[rm.key + '_nip']);
            return loadImageAsset(uri);
          });

          const [logoImg, wbkImg, berakhlakImg, banggaImg, socialImg, bgImg, ...officerImgs] = await Promise.all([
            logoPromise, wbkPromise, berakhlakPromise, banggaPromise, socialPromise, bgPromise, ...photoPromises
          ]);
          if (token !== this.renderNonce) return;

          // 1. Langit & Latar Belakang Gedung (Proporsional & Halus)
          const sky = ctx.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, '#c8ddf0');
          sky.addColorStop(0.58, '#b8d1e8');
          sky.addColorStop(1, '#a9c5df');
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, W, H);

          if (bgImg) {
            ctx.save();
            const isCustomOpaque = Boolean(this.settingsDoc && this.settingsDoc.bg_gedung_uri);
            const targetH = isCustomOpaque ? (H * 0.42) : (H * 0.38);
            const scale = Math.max(W / bgImg.width, targetH / bgImg.height);
            const dw = bgImg.width * scale;
            const dh = bgImg.height * scale;
            ctx.globalAlpha = isCustomOpaque ? 0.62 : 0.40;
            ctx.drawImage(bgImg, (W - dw) / 2, H - 58 - dh, dw, dh);
            if (isCustomOpaque) {
              const fadeTop = ctx.createLinearGradient(0, H - 58 - dh, 0, H - 58 - dh + 150);
              fadeTop.addColorStop(0, '#b5cfe6');
              fadeTop.addColorStop(1, 'rgba(181,207,230,0)');
              ctx.globalAlpha = 1;
              ctx.fillStyle = fadeTop;
              ctx.fillRect(0, H - 58 - dh, W, 150);
            }
            ctx.restore();
          } else {
            ctx.save();
            ctx.fillStyle = 'rgba(241,245,249,0.50)';
            ctx.fillRect(0, 1140, 480, 160);
            ctx.restore();
          }

          // Mist lembut di area footer agar BerAKHLAK & Bangga Melayani Bangsa terbaca jernih
          ctx.save();
          const mist = ctx.createLinearGradient(0, 1105, 0, 1292);
          mist.addColorStop(0, 'rgba(202, 223, 241, 0)');
          mist.addColorStop(0.45, 'rgba(214, 232, 246, 0.78)');
          mist.addColorStop(1, 'rgba(225, 240, 250, 0.94)');
          ctx.fillStyle = mist;
          ctx.fillRect(0, 1105, W, 187);
          ctx.restore();

          // 2. Logo PA Indramayu Berwarna + Logo WBK (Diperkecil Proporsional) + Header SK
          let nextX = 48;
          if (logoImg) {
            const lh = 142;
            const lw = Math.round((logoImg.width / Math.max(1, logoImg.height)) * lh);
            ctx.drawImage(logoImg, nextX, 28, lw, lh);
            nextX += lw + 18;
          }
          if (wbkImg) {
            const wh = 94;
            const ww = Math.round((wbkImg.width / Math.max(1, wbkImg.height)) * wh);
            ctx.drawImage(wbkImg, nextX, 52, ww, wh);
            nextX += ww + 26;
          } else {
            drawWbkEmblem(ctx, nextX + 47, 99, 47);
            nextX += 116;
          }

          const skTextX = Math.max(304, nextX);
          ctx.save();
          ctx.fillStyle = '#175c32';
          ctx.font = '700 21px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('Lampiran Surat Keputusan Ketua Pengadilan Agama Indramayu', skTextX, 68, W - skTextX - 36);
          ctx.fillText('Nomor   : ' + (this.currentYearDoc.nomor_sk || '-'), skTextX, 99, W - skTextX - 36);
          ctx.fillText('Tanggal : ' + (this.currentYearDoc.tanggal_sk || '-'), skTextX, 130, W - skTextX - 36);
          ctx.restore();

          // 3. Judul Besar PETUGAS APEL + Hari Tanggal
          ctx.save();
          ctx.textAlign = 'center';
          ctx.font = '900 70px "Plus Jakarta Sans", sans-serif';
          ctx.lineWidth = 10;
          ctx.strokeStyle = '#ffffff';
          ctx.strokeText('PETUGAS APEL', W / 2, 260);
          ctx.fillStyle = '#206b2e';
          ctx.fillText('PETUGAS APEL', W / 2, 260);

          let curY = 315;
          ctx.font = '900 38px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#135829';
          const hMode = String(row.hari_mode || 'Sn & Jm');
          if (hMode.includes('Sn') && row.tgl_senin) {
            ctx.fillText('SENIN, ' + formatIndoUpper(row.tgl_senin), W / 2, curY);
            curY += 45;
          }
          if (hMode.includes('Jm') && row.tgl_jumat) {
            ctx.fillText('JUMAT, ' + formatIndoUpper(row.tgl_jumat), W / 2, curY);
          }
          ctx.restore();

          // 4. Pembina Center Block
          const pembinaName = eff.pembina || '-';
          const pembinaInit = pembinaName.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
          drawCircularPortrait(ctx, 540, 470, 84, officerImgs[0], pembinaInit);

          ctx.save();
          ctx.shadowColor = 'rgba(15, 45, 25, 0.10)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 4;
          drawRoundedPill(ctx, 235, 572, 610, 108, 54, '#d9ea8c');
          ctx.restore();

          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#143018';
          ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
          ctx.fillText('PEMBINA', 540, 612);
          ctx.fillRect(486, 618, 108, 2.5);
          ctx.font = '700 29px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(pembinaName, 540, 656, 560);
          ctx.restore();

          // 5. Grid 5 Petugas Lainnya (Simetris + Celah Tengah 52px, Tidak Berdempetan)
          // Kolom Kiri : avatar edge = 56, pill x = 92..514 (w=422)
          // Celah Tengah : 514..566 (52px bersih!)
          // Kolom Kanan : avatar edge = 566, pill x = 602..1024 (w=422, margin kanan = 56px)
          const slots = [
            { idx: 1, title: 'PEMIMPIN', name: eff.pemimpin || '-', px: 92, py: 724 },
            { idx: 2, title: 'DOA', name: eff.doa || '-', px: 602, py: 724 },
            { idx: 3, title: '8 NILAI MA RI', name: eff.nilai_ma || '-', px: 92, py: 852 },
            { idx: 4, title: 'MC', name: eff.mc || '-', px: 602, py: 852 },
            { idx: 5, title: '10 BUDAYA MALU', name: eff.budaya_malu || '-', px: 602, py: 980 }
          ];

          slots.forEach(s => {
            ctx.save();
            ctx.shadowColor = 'rgba(15, 45, 25, 0.10)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;
            drawRoundedPill(ctx, s.px, s.py, 422, 92, 46, '#d9ea8c');
            ctx.restore();

            const init = s.name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
            drawCircularPortrait(ctx, s.px + 10, s.py + 46, 46, officerImgs[s.idx], init);

            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#143018';
            ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
            const textCenterX = s.px + 236;
            ctx.fillText(s.title, textCenterX, s.py + 35);
            const tw = Math.min(180, ctx.measureText(s.title).width);
            ctx.fillRect(textCenterX - tw / 2, s.py + 40, tw, 2);
            ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(s.name, textCenterX, s.py + 72, 332);
            ctx.restore();
          });

          // 6. Logo Resmi BerAKHLAK & Bangga Melayani Bangsa (Jernih & Rapi di Zona Mist Footer)
          const drawLogoBadge = (canvasImg, x, y, maxW, maxH, alignRight) => {
            if (!canvasImg || !canvasImg.width || !canvasImg.height) return;
            const sc = Math.min(maxW / canvasImg.width, maxH / canvasImg.height);
            const lw = Math.round(canvasImg.width * sc);
            const lh = Math.round(canvasImg.height * sc);
            const dx = alignRight ? (x - lw) : x;
            const dy = Math.round(y - lh / 2);
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
            ctx.shadowBlur = 16;
            drawRoundedPill(ctx, dx - 14, dy - 8, lw + 28, lh + 16, 16, 'rgba(255, 255, 255, 0.72)');
            ctx.restore();
            ctx.drawImage(canvasImg, dx, dy, lw, lh);
          };

          const cleanBer = prepareLogoCanvas(berakhlakImg, true);
          drawLogoBadge(cleanBer, 62, 1218, 340, 76, false);

          const cleanBangga = prepareLogoCanvas(banggaImg, true);
          drawLogoBadge(cleanBangga, W - 62, 1218, 220, 80, true);

          // 7. Bar Media Sosial Tajam & Proporsional
          drawCrispSocialFooter(ctx, W);
        },

        downloadPosterPng() {
          const canvas = document.getElementById('apel-poster-canvas');
          if (!canvas || !this.selectedRow) return;
          const link = document.createElement('a');
          const tag = this.selectedRow.tgl_senin || this.selectedRow.tgl_jumat || ('Minggu_' + (this.selectedWeekIdx + 1));
          link.download = 'Jadwal_Apel_' + tag + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        },

        async saveSelectedPosterToDrive() {
          const canvas = document.getElementById('apel-poster-canvas');
          const row = this.selectedRow;
          if (!canvas || !row) return;
          this.isUploadingPoster = true;
          try {
            const pngData = canvas.toDataURL('image/png');
            const nip = (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';
            const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
            const fileName = 'Jadwal_Apel_M' + (row.no || (this.selectedWeekIdx + 1)) + '_' + (row.tgl_senin || row.tgl_jumat || this.selectedYear) + '.png';

            let res = null;
            const payload = { tahun: this.selectedYear, week_no: row.no || (this.selectedWeekIdx + 1), tgl_senin: row.tgl_senin || '', file_name: fileName, png_base64: pngData };
            if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
              res = await window.TranskepAPI.call('saveApelPosterToDrive', payload, nip, token);
            } else if (typeof google !== 'undefined' && google.script && google.script.run) {
              res = await new Promise((resolve, reject) => {
                google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).saveApelPosterToDrive(payload, nip, token);
              });
            }

            if (!res || res.status !== 'success') {
              throw new Error((res && res.message) || 'Gagal mengunggah poster ke Google Drive.');
            }
            row.poster_file_id = res.file_id;
            row.poster_url = res.file_url;
            await this.saveActiveYearToFirestore();
            if (typeof showNotify === 'function') {
              showNotify('Poster Tersimpan di Drive', 'File ' + (res.file_name || fileName) + ' tersimpan dan ID ditautkan ke Firestore.', 'success');
            }
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Simpan Poster', err.message || String(err), 'error');
          } finally {
            this.isUploadingPoster = false;
          }
        },

        async openApelDriveFolder() {
          try {
            const nip = (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_active_nip') : '') || '';
            const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('transkep_session_token') : '') || '';
            let res = null;
            if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
              res = await window.TranskepAPI.call('getApelDriveFolderUrl', nip, token);
            } else if (typeof google !== 'undefined' && google.script && google.script.run) {
              res = await new Promise((resolve, reject) => {
                google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getApelDriveFolderUrl(nip, token);
              });
            }
            if (res && res.url) window.open(res.url, '_blank', 'noopener');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Folder Drive', err.message || String(err), 'error');
          }
        },

        async copyWaCaptionToClipboard() {
          try {
            await navigator.clipboard.writeText(this.generatedWaCaption);
            if (typeof showNotify === 'function') showNotify('Tersalin', 'Draf pengumuman WhatsApp berhasil disalin.', 'success');
          } catch (e) {}
        },

        onSelectSkImportFile(ev) {
          const file = ev && ev.target && ev.target.files && ev.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || '');
            const b64 = res.replace(/^data:[^;]+;base64,/, '');
            this.importFilePayload = { base64: b64, mimeType: file.type || 'image/jpeg', name: file.name };
          };
          reader.readAsDataURL(file);
        },

        async runAiImportFromFile() {
          const url = String(this.localN8nImportUrl || '').trim();
          if (!url) {
            if (typeof showNotify === 'function') showNotify('URL Webhook Kosong', 'Isi URL Webhook n8n transkep-apel-import terlebih dahulu.', 'warning');
            return;
          }
          this.isImportingAi = true;
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('transkep_apel_import_webhook', url);
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tahun: this.selectedYear,
                file_name: this.importFilePayload.name,
                mime_type: this.importFilePayload.mimeType,
                file_base64: this.importFilePayload.base64
              })
            });
            const data = await resp.json();
            const rows = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : (Array.isArray(data.jadwal) ? data.jadwal : []));
            if (!rows.length) throw new Error('Gemini tidak mengembalikan baris jadwal.');
            this.importJsonRaw = JSON.stringify(rows, null, 2);
            if (typeof showNotify === 'function') showNotify('Ekstraksi AI Berhasil', `${rows.length} baris berhasil dibaca. Klik Terapkan.`, 'success');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('Gagal Import AI', err.message || String(err), 'error');
          } finally {
            this.isImportingAi = false;
          }
        },

        applyImportedJsonToYear() {
          try {
            const parsed = JSON.parse(String(this.importJsonRaw || '[]'));
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('JSON harus array non-kosong.');
            this.currentYearDoc.rows = parsed.map((r, i) => ({
              no: Number(r.no) || (i + 1),
              hari_mode: String(r.hari_mode || r.hari || 'Sn & Jm'),
              tgl_senin: parseYmd(r.tgl_senin) || '',
              tgl_jumat: parseYmd(r.tgl_jumat) || '',
              pembina: String(r.pembina || ''),
              pemimpin: String(r.pemimpin || r.komandan || ''),
              doa: String(r.doa || r.pembaca_doa || ''),
              nilai_ma: String(r.nilai_ma || r.ptgs_8_nilai || ''),
              budaya_malu: String(r.budaya_malu || r.ptgs_10_budaya || ''),
              mc: String(r.mc || r.protokol || '')
            }));
            this.showImportModal = false;
            if (typeof showNotify === 'function') showNotify('Jadwal Diterapkan', `${parsed.length} minggu diterapkan ke tahun ${this.selectedYear}. Jangan lupa klik Simpan.`, 'success');
          } catch (err) {
            if (typeof showNotify === 'function') showNotify('JSON Tidak Valid', err.message || String(err), 'error');
          }
        }
      }
    }).mount('#vue-apel-app');
  }

  window.openJadwalApelModal = function () {
    if (!vmApel && document.getElementById('vue-apel-app')) {
      vmApel = createApelVueApp();
      window.vmApel = vmApel;
    }
    if (vmApel && typeof vmApel.open === 'function') {
      vmApel.open();
    } else if (typeof showNotify === 'function') {
      showNotify('Modul Apel', 'Komponen modal Jadwal Apel sedang dimuat.', 'info');
    }
  };

  if (typeof document !== 'undefined' && document.getElementById('vue-apel-app')) {
    vmApel = createApelVueApp();
    window.vmApel = vmApel;
  }
})();