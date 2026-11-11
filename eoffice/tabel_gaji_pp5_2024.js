// ==========================================
// FILE: eoffice/tabel_gaji_pp5_2024.js
// DESKRIPSI: Modul Tabel Gaji Pokok PNS Berdasarkan PP Nomor 5 Tahun 2024
// ATURAN RESMI: Lampiran PP No. 5 Tahun 2024 (Berlaku per 1 Januari 2024)
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

(function(window) {
  'use strict';

  // MATRIKS GAJI POKOK RESMI PP NO. 5 TAHUN 2024
  // Format: [mkgTahun, nominalRupiah] terurut naik
  const GAJI_POKOK_PP5_2024 = {
    // --- GOLONGAN I ---
    'I/a': [
      [0, 1685700], [1, 1738800], [3, 1793500], [5, 1850000], [7, 1908300],
      [9, 1968400], [11, 2030400], [13, 2094300], [15, 2160300], [17, 2228300],
      [19, 2298500], [21, 2370900], [23, 2445500], [25, 2522600], [26, 2522600]
    ],
    'I/b': [
      [0, 1840800], [3, 1840800], [5, 1898800], [7, 1958600], [9, 2020300],
      [11, 2083900], [13, 2149600], [15, 2217300], [17, 2287100], [19, 2359100],
      [21, 2433400], [23, 2510100], [25, 2589100], [27, 2670700]
    ],
    'I/c': [
      [0, 1918700], [3, 1918700], [5, 1979100], [7, 2041500], [9, 2105800],
      [11, 2172100], [13, 2240500], [15, 2311100], [17, 2383900], [19, 2458900],
      [21, 2536400], [23, 2616300], [25, 2698700], [27, 2783700]
    ],
    'I/d': [
      [0, 1999900], [3, 1999900], [5, 2062900], [7, 2127800], [9, 2194800],
      [11, 2264000], [13, 2335300], [15, 2408800], [17, 2484700], [19, 2562900],
      [21, 2643700], [23, 2726900], [25, 2812800], [27, 2901400]
    ],

    // --- GOLONGAN II ---
    'II/a': [
      [0, 2184000], [1, 2218400], [3, 2288200], [5, 2360300], [7, 2434600],
      [9, 2511300], [11, 2590400], [13, 2672000], [15, 2756200], [17, 2843000],
      [19, 2932500], [21, 3024900], [23, 3120100], [25, 3218400], [27, 3319800],
      [29, 3424300], [31, 3532200], [33, 3643400]
    ],
    'II/b': [
      [0, 2385000], [3, 2385000], [5, 2460100], [7, 2537600], [9, 2617500],
      [11, 2700000], [13, 2785000], [15, 2872700], [17, 2963200], [19, 3056500],
      [21, 3152800], [23, 3252100], [25, 3354500], [27, 3460200], [29, 3569200],
      [31, 3681600], [33, 3797500]
    ],
    'II/c': [
      [0, 2485900], [3, 2485900], [5, 2564200], [7, 2645000], [9, 2728300],
      [11, 2814200], [13, 2902800], [15, 2994300], [17, 3088600], [19, 3185800],
      [21, 3286200], [23, 3389700], [25, 3496400], [27, 3606500], [29, 3720100],
      [31, 3837300], [33, 3958200]
    ],
    'II/d': [
      [0, 2591100], [3, 2591100], [5, 2672700], [7, 2756800], [9, 2843700],
      [11, 2933200], [13, 3025600], [15, 3120900], [17, 3219200], [19, 3320600],
      [21, 3425200], [23, 3533100], [25, 3644300], [27, 3759100], [29, 3877500],
      [31, 3999600], [33, 4125600]
    ],

    // --- GOLONGAN III ---
    'III/a': [
      [0, 2785700], [2, 2873500], [4, 2964000], [6, 3057300], [8, 3153600],
      [10, 3252900], [12, 3355400], [14, 3461100], [16, 3570100], [18, 3682500],
      [20, 3798500], [22, 3918100], [24, 4041500], [26, 4168800], [28, 4300100],
      [30, 4435500], [32, 4575200]
    ],
    'III/b': [
      [0, 2903600], [2, 2995000], [4, 3089300], [6, 3186600], [8, 3287000],
      [10, 3390500], [12, 3497300], [14, 3607500], [16, 3721100], [18, 3838300],
      [20, 3959200], [22, 4083900], [24, 4212500], [26, 4345100], [28, 4482000],
      [30, 4623200], [32, 4768800]
    ],
    'III/c': [
      [0, 3026400], [2, 3121700], [4, 3220000], [6, 3321400], [8, 3426000],
      [10, 3533900], [12, 3645200], [14, 3760100], [16, 3878500], [18, 4000600],
      [20, 4126600], [22, 4256600], [24, 4390700], [26, 4528900], [28, 4671600],
      [30, 4818700], [32, 4970500]
    ],
    'III/d': [
      [0, 3154400], [2, 3253700], [4, 3356200], [6, 3461900], [8, 3571000],
      [10, 3683400], [12, 3799400], [14, 3919100], [16, 4042500], [18, 4169900],
      [20, 4301200], [22, 4436700], [24, 4576400], [26, 4720500], [28, 4869200],
      [30, 5022500], [32, 5180700]
    ],

    // --- GOLONGAN IV ---
    'IV/a': [
      [0, 3287800], [2, 3391400], [4, 3498200], [6, 3608400], [8, 3722000],
      [10, 3839200], [12, 3960200], [14, 4084900], [16, 4213500], [18, 4346200],
      [20, 4483100], [22, 4624300], [24, 4770000], [26, 4920200], [28, 5075200],
      [30, 5235000], [32, 5399900]
    ],
    'IV/b': [
      [0, 3426900], [2, 3534800], [4, 3646200], [6, 3761000], [8, 3879500],
      [10, 4001600], [12, 4127700], [14, 4257700], [16, 4391800], [18, 4530100],
      [20, 4672800], [22, 4819900], [24, 4971700], [26, 5128300], [28, 5289800],
      [30, 5456400], [32, 5628300]
    ],
    'IV/c': [
      [0, 3571900], [2, 3684400], [4, 3800400], [6, 3920100], [8, 4043600],
      [10, 4170900], [12, 4302300], [14, 4437800], [16, 4577500], [18, 4721700],
      [20, 4870400], [22, 5023800], [24, 5182000], [26, 5345200], [28, 5513600],
      [30, 5687200], [32, 5866400]
    ],
    'IV/d': [
      [0, 3723000], [2, 3840200], [4, 3961200], [6, 4085900], [8, 4214600],
      [10, 4347300], [12, 4484300], [14, 4625500], [16, 4771200], [18, 4921400],
      [20, 5076400], [22, 5236300], [24, 5401200], [26, 5571400], [28, 5746800],
      [30, 5927800], [32, 6114500]
    ],
    'IV/e': [
      [0, 3880400], [2, 4002700], [4, 4128700], [6, 4258700], [8, 4392900],
      [10, 4531200], [12, 4673900], [14, 4821100], [16, 4973000], [18, 5129600],
      [20, 5291200], [22, 5457800], [24, 5629700], [26, 5807000], [28, 5989900],
      [30, 6178600], [32, 6373200]
    ]
  };

  /**
   * Helper untuk normalisasi string golongan menjadi format standar ('III/a', 'IV/d', dll.)
   */
  function normalizeGolonganPns(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var m = s.match(/\b([IVX]{1,4})\s*[\/\-]?\s*([a-eA-E])\b/);
    if (m) {
      return m[1].toUpperCase() + '/' + m[2].toLowerCase();
    }
    return s;
  }

  /**
   * Menghitung gaji pokok PNS berdasarkan Golongan dan Masa Kerja Golongan (Tahun)
   * Aturan: Menemukan baris dengan mkg <= input mkg (tangga gaji terakhir yang berlaku)
   */
  function hitungGajiPnsPp5(golonganRaw, mkgTahunRaw) {
    var gol = normalizeGolonganPns(golonganRaw);
    if (!gol || !GAJI_POKOK_PP5_2024[gol]) return null;

    var mkg = parseInt(mkgTahunRaw, 10);
    if (isNaN(mkg) || mkg < 0) mkg = 0;

    var steps = GAJI_POKOK_PP5_2024[gol];
    var gajiDitemukan = steps[0][1];

    for (var i = 0; i < steps.length; i++) {
      if (steps[i][0] <= mkg) {
        gajiDitemukan = steps[i][1];
      } else {
        break;
      }
    }
    return gajiDitemukan;
  }

  /**
   * Format angka integer ke nominal ribuan bertitik Indonesia ("3.057.300")
   */
  function formatRibuanRupiah(val) {
    if (val === null || val === undefined) return '';
    var digits = String(val).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /**
   * Algoritma Terbilang Rupiah Bahasa Indonesia
   */
  function terbilangAngkaLocal(angka) {
    var bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    angka = Math.floor(Math.abs(Number(angka)));
    if (isNaN(angka)) return "";
    if (angka < 12) return bilangan[angka];
    if (angka < 20) return terbilangAngkaLocal(angka - 10) + " belas";
    if (angka < 100) return terbilangAngkaLocal(Math.floor(angka / 10)) + " puluh " + terbilangAngkaLocal(angka % 10);
    if (angka < 200) return "seratus " + terbilangAngkaLocal(angka - 100);
    if (angka < 1000) return terbilangAngkaLocal(Math.floor(angka / 100)) + " ratus " + terbilangAngkaLocal(angka % 100);
    if (angka < 2000) return "seribu " + terbilangAngkaLocal(angka - 1000);
    if (angka < 1000000) return terbilangAngkaLocal(Math.floor(angka / 1000)) + " ribu " + terbilangAngkaLocal(angka % 1000);
    if (angka < 1000000000) return terbilangAngkaLocal(Math.floor(angka / 1000000)) + " juta " + terbilangAngkaLocal(angka % 1000000);
    if (angka < 1000000000000) return terbilangAngkaLocal(Math.floor(angka / 1000000000)) + " milyar " + terbilangAngkaLocal(angka % 1000000000);
    return "";
  }

  function terbilangRupiahLocal(nominal) {
    if (!nominal) return "";
    var clean = String(nominal).replace(/[^0-9]/g, "");
    if (!clean) return "";
    var hasil = terbilangAngkaLocal(clean).replace(/\s+/g, " ").trim();
    return hasil ? (hasil + " rupiah") : "";
  }

  /**
   * Helper konversi tanggal Indonesia ("1 Desember 2026") ke format ISO YYYY-MM-DD untuk input type="date"
   */
  function parseIndoDateToIso(str) {
    if (!str) return '';
    var s = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    var blnMap = {
      'januari': '01', 'jan': '01',
      'februari': '02', 'feb': '02',
      'maret': '03', 'mar': '03',
      'april': '04', 'apr': '04',
      'mei': '05', 'may': '05',
      'juni': '06', 'jun': '06',
      'juli': '07', 'jul': '07',
      'agustus': '08', 'agu': '08', 'agt': '08',
      'september': '09', 'sep': '09',
      'oktober': '10', 'okt': '10', 'oct': '10',
      'november': '11', 'nov': '11',
      'desember': '12', 'des': '12', 'dec': '12'
    };

    var m = s.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
    if (m) {
      var day = ('0' + m[1]).slice(-2);
      var mon = blnMap[m[2].toLowerCase()] || '01';
      var yr = m[3];
      return yr + '-' + mon + '-' + day;
    }

    var slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
      var dStr = ('0' + slashMatch[1]).slice(-2);
      var mStr = ('0' + slashMatch[2]).slice(-2);
      return slashMatch[3] + '-' + mStr + '-' + dStr;
    }

    var dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      var y = dt.getFullYear();
      var mn = ('0' + (dt.getMonth() + 1)).slice(-2);
      var dy = ('0' + dt.getDate()).slice(-2);
      return y + '-' + mn + '-' + dy;
    }
    return '';
  }

  /**
   * Helper konversi tanggal ISO YYYY-MM-DD ke Bahasa Indonesia ("1 Desember 2026")
   */
  function formatIsoToIndoDate(isoStr) {
    if (!isoStr) return '';
    var clean = String(isoStr).trim();
    if (!clean) return '';
    if (/[a-zA-Z]{3,}/.test(clean) && clean.indexOf('T') === -1) return clean;

    var parts = clean.split('T')[0].split('-');
    if (parts.length === 3) {
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      var bln = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 0 && m <= 11) {
        return d + ' ' + bln[m] + ' ' + y;
      }
    }
    return clean;
  }

  // DAFTAR GOLONGAN LENGKAP UNTUK DROPDOWN
  const LIST_GOLONGAN_PNS = [
    'I/a', 'I/b', 'I/c', 'I/d',
    'II/a', 'II/b', 'II/c', 'II/d',
    'III/a', 'III/b', 'III/c', 'III/d',
    'IV/a', 'IV/b', 'IV/c', 'IV/d', 'IV/e'
  ];

  // EXPORT KE GLOBAL WINDOW
  window.TabelGajiPns2024 = {
    GAJI_POKOK_PP5_2024: GAJI_POKOK_PP5_2024,
    LIST_GOLONGAN_PNS: LIST_GOLONGAN_PNS,
    normalizeGolonganPns: normalizeGolonganPns,
    hitungGajiPnsPp5: hitungGajiPnsPp5,
    formatRibuanRupiah: formatRibuanRupiah,
    terbilangRupiah: terbilangRupiahLocal,
    parseIndoDateToIso: parseIndoDateToIso,
    formatIsoToIndoDate: formatIsoToIndoDate
  };

  // Ekspos helper langsung ke window agar kompatibel dengan inline onchange/oninput
  window.hitungGajiPnsPp5 = hitungGajiPnsPp5;
  window.formatRibuanRupiah = formatRibuanRupiah;
  window.parseIndoDateToIso = parseIndoDateToIso;
  window.formatIsoToIndoDate = formatIsoToIndoDate;

})(typeof window !== 'undefined' ? window : this);

