'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const PORT = Number(process.env.PORT || 3000);
const ASSET_BASE_URL = String(process.env.ASSET_BASE_URL || 'https://sso.pa-indramayu.go.id/img').replace(/\/+$/, '');
const LOCAL_ASSETS_DIR = path.join(__dirname, 'assets');
const CACHE_ASSETS_DIR = '/tmp/apel-assets';

// Daftarkan font jika tersedia
let FONT_FAMILY = 'sans-serif';
(function initFonts() {
  const fontCandidates = [
    '/app/fonts/PlusJakartaSans-Bold.ttf',
    '/app/fonts/PlusJakartaSans-ExtraBold.ttf'
  ];
  let loaded = false;
  fontCandidates.forEach(fp => {
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).size > 10000) {
        GlobalFonts.registerFromPath(fp, 'Plus Jakarta Sans');
        loaded = true;
      }
    } catch (e) {}
  });
  if (loaded) {
    FONT_FAMILY = '"Plus Jakarta Sans", "DejaVu Sans", sans-serif';
  } else {
    FONT_FAMILY = '"DejaVu Sans", "Liberation Sans", sans-serif';
  }
})();

const assetImgCache = {};

async function loadImageFromAny(src) {
  if (!src) return null;
  const key = String(src).slice(0, 120);
  if (/^data:image\//i.test(src)) {
    try {
      const b64 = src.replace(/^data:image\/[^;]+;base64,/i, '');
      return await loadImage(Buffer.from(b64, 'base64'));
    } catch (e) {
      return null;
    }
  }
  if (assetImgCache[key]) return assetImgCache[key];

  // 1. Cek local /app/assets/
  const cleanName = decodeURIComponent(String(src).split('/').pop() || '');
  const localPath = path.join(LOCAL_ASSETS_DIR, cleanName);
  if (fs.existsSync(localPath)) {
    const img = await loadImage(fs.readFileSync(localPath));
    assetImgCache[key] = img;
    return img;
  }

  // 2. Cek /tmp cache
  try { fs.mkdirSync(CACHE_ASSETS_DIR, { recursive: true }); } catch (e) {}
  const cachePath = path.join(CACHE_ASSETS_DIR, cleanName);
  if (fs.existsSync(cachePath)) {
    try {
      const img = await loadImage(fs.readFileSync(cachePath));
      assetImgCache[key] = img;
      return img;
    } catch (e) {}
  }

  // 3. Unduh dari ASSET_BASE_URL
  try {
    const url = /^https?:\/\//i.test(src) ? src : (ASSET_BASE_URL + '/' + src.replace(/^\/+/, ''));
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    try { fs.writeFileSync(cachePath, buf); } catch (e) {}
    const img = await loadImage(buf);
    assetImgCache[key] = img;
    return img;
  } catch (e) {
    return null;
  }
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
      ctx.font = '800 ' + Math.round(r * 0.42) + 'px ' + FONT_FAMILY;
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
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 18px ' + FONT_FAMILY;
  ctx.fillText('WBK', cx, cy + 6);
  ctx.restore();
}

function prepareLogoCanvas(img, stripWhite) {
  if (!img || !img.width || !img.height) return null;
  try {
    const c = createCanvas(img.width, img.height);
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
      const out = createCanvas(cw, ch);
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

  ctx.font = '700 17px ' + FONT_FAMILY;
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
    ctx.font = '700 17px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.fillText(it.text, curX + iconSize + iconGap, cy + 0.5);
    curX += widths[i] + itemGap;
  });
  ctx.restore();
}

async function renderApelPosterPng(payload) {
  const W = 1080;
  const H = 1350;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const p = payload || {};
  const eff = p.effective_petugas || {};
  const photos = p.effective_photos || {};
  const roleKeys = ['pembina', 'pemimpin', 'doa', 'nilai_ma', 'mc', 'budaya_malu'];

  const isCustomBg = Boolean(p.bg_gedung_uri && /^data:image\//i.test(p.bg_gedung_uri));
  const [logoImg, wbkImg, berakhlakImg, banggaImg, bgImg, ...officerImgs] = await Promise.all([
    loadImageFromAny('Logo_PA_Imy.png'),
    loadImageFromAny('Logo_WBK.png'),
    loadImageFromAny('berakhlak.png'),
    loadImageFromAny('bangga%20Melayani%20Bangsa.png'),
    loadImageFromAny(isCustomBg ? p.bg_gedung_uri : 'gedung_pa.png'),
    ...roleKeys.map(rk => loadImageFromAny(photos[rk] || ''))
  ]);

  // 1. Langit & Gedung Kantor
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#c8ddf0');
  sky.addColorStop(0.58, '#b8d1e8');
  sky.addColorStop(1, '#a9c5df');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (bgImg) {
    ctx.save();
    const targetH = isCustomBg ? (H * 0.42) : (H * 0.38);
    const scale = Math.max(W / bgImg.width, targetH / bgImg.height);
    const dw = bgImg.width * scale;
    const dh = bgImg.height * scale;
    ctx.globalAlpha = isCustomBg ? 0.62 : 0.40;
    ctx.drawImage(bgImg, (W - dw) / 2, H - 58 - dh, dw, dh);
    ctx.restore();
  }

  ctx.save();
  const mist = ctx.createLinearGradient(0, 1105, 0, 1292);
  mist.addColorStop(0, 'rgba(202, 223, 241, 0)');
  mist.addColorStop(0.45, 'rgba(214, 232, 246, 0.78)');
  mist.addColorStop(1, 'rgba(225, 240, 250, 0.94)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, 1105, W, 187);
  ctx.restore();

  // 2. Logo PA + WBK Kecil Proporsional + Header SK
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
  ctx.font = '700 21px ' + FONT_FAMILY;
  ctx.textAlign = 'left';
  ctx.fillText('Lampiran Surat Keputusan Ketua Pengadilan Agama Indramayu', skTextX, 68, W - skTextX - 36);
  ctx.fillText('Nomor   : ' + (p.nomor_sk || '-'), skTextX, 99, W - skTextX - 36);
  ctx.fillText('Tanggal : ' + (p.tanggal_sk || '-'), skTextX, 130, W - skTextX - 36);
  ctx.restore();

  // 3. Judul Besar PETUGAS APEL
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 70px ' + FONT_FAMILY;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('PETUGAS APEL', W / 2, 260);
  ctx.fillStyle = '#206b2e';
  ctx.fillText('PETUGAS APEL', W / 2, 260);

  let curY = 315;
  ctx.font = '900 38px ' + FONT_FAMILY;
  ctx.fillStyle = '#135829';
  const hMode = String(p.hari_mode || 'Sn & Jm');
  if (hMode.includes('Sn') && p.label_senin) {
    ctx.fillText(p.label_senin, W / 2, curY);
    curY += 45;
  }
  if (hMode.includes('Jm') && p.label_jumat) {
    ctx.fillText(p.label_jumat, W / 2, curY);
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
  ctx.font = '800 22px ' + FONT_FAMILY;
  ctx.fillText('PEMBINA', 540, 612);
  ctx.fillRect(486, 618, 108, 2.5);
  ctx.font = '700 29px ' + FONT_FAMILY;
  ctx.fillText(pembinaName, 540, 656, 560);
  ctx.restore();

  // 5. Grid 5 Petugas Lainnya
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
    ctx.font = '800 18px ' + FONT_FAMILY;
    const textCenterX = s.px + 236;
    ctx.fillText(s.title, textCenterX, s.py + 35);
    const tw = Math.min(180, ctx.measureText(s.title).width);
    ctx.fillRect(textCenterX - tw / 2, s.py + 40, tw, 2);
    ctx.font = '700 22px ' + FONT_FAMILY;
    ctx.fillText(s.name, textCenterX, s.py + 72, 332);
    ctx.restore();
  });

  // 6. Logo BerAKHLAK & Bangga Melayani Bangsa
  const drawLogoBadge = (canvasImg, x, y, maxW, maxH, alignRight) => {
    if (!canvasImg || !canvasImg.width || !canvasImg.height) return;
    const sc = Math.min(maxW / canvasImg.width, maxH / canvasImg.height);
    const lw = Math.round(canvasImg.width * sc);
    const lh = Math.round(canvasImg.height * sc);
    const dx = alignRight ? (x - lw) : x;
    const dy = Math.round(y - lh / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 16;
    drawRoundedPill(ctx, dx - 14, dy - 8, lw + 28, lh + 16, 16, 'rgba(255, 255, 255, 0.72)');
    ctx.restore();
    ctx.drawImage(canvasImg, dx, dy, lw, lh);
  };

  drawLogoBadge(prepareLogoCanvas(berakhlakImg, true), 62, 1218, 340, 76, false);
  drawLogoBadge(prepareLogoCanvas(banggaImg, true), W - 62, 1218, 220, 80, true);

  // 7. Bar Media Sosial
  drawCrispSocialFooter(ctx, W);

  return canvas.toBuffer('image/png');
}

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'transkep-apel-renderer', font: FONT_FAMILY });
});

app.post('/render', async (req, res) => {
  try {
    const body = (req.body && req.body.data) ? req.body.data : (req.body || {});
    const pngBuf = await renderApelPosterPng(body);
    const tag = body.tgl_senin || body.tgl_jumat || ('Minggu_' + (body.week_no || '1'));
    const filename = 'Jadwal_Apel_' + String(tag).replace(/[^a-zA-Z0-9_-]/g, '_') + '_AUTO.png';
    res.json({
      status: 'success',
      filename,
      mimetype: 'image/png',
      size_bytes: pngBuf.length,
      poster_png_base64: pngBuf.toString('base64')
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal merender poster PNG: ' + (err && err.message ? err.message : String(err))
    });
  }
});

app.listen(PORT, () => {
  console.log('[TRANSKEP Apel Renderer] Listening on port ' + PORT + ' (assets: ' + ASSET_BASE_URL + ')');
});