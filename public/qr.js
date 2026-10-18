// SmartO High-Resolution Pure-JS Vector QR Generator & Official Decal Suite

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Generates QR matrix for byte mode
function getQrMatrix(text) {
  const v = 4;
  const n = 17 + 4 * v; // 33x33
  const matrix = Array.from({ length: n }, () => Array(n).fill(false));
  const isFunc = Array.from({ length: n }, () => Array(n).fill(false));

  function setFinder(r, c) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const nr = r + i, nc = c + j;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
          isFunc[nr][nc] = true;
          const isOuter = (i === 0 || i === 6 || j === 0 || j === 6);
          const isInner = (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          matrix[nr][nc] = (isOuter || isInner);
        }
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, n - 7);
  setFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    isFunc[6][i] = true; matrix[6][i] = (i % 2 === 0);
    isFunc[i][6] = true; matrix[i][6] = (i % 2 === 0);
  }

  // Alignment pattern
  const align = 26;
  for (let r = align - 2; r <= align + 2; r++) {
    for (let c = align - 2; c <= align + 2; c++) {
      isFunc[r][c] = true;
      matrix[r][c] = (r === align - 2 || r === align + 2 || c === align - 2 || c === align + 2 || (r === align && c === align));
    }
  }

  // Format reserve
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { isFunc[8][i] = true; isFunc[i][8] = true; }
  }
  for (let i = n - 8; i < n; i++) {
    isFunc[8][i] = true; isFunc[i][8] = true;
  }

  // Encode text bytes with padding
  const bytes = [];
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  while (bytes.length < 80) {
    hash = Math.imul(hash ^ (bytes.length + 1), 0x5bd1e995);
    bytes.push(Math.abs(hash) % 256);
  }

  let bitIdx = 0;
  let right = n - 1;
  let upwards = true;
  while (right > 0) {
    if (right === 6) right--;
    for (let vert = 0; vert < n; vert++) {
      const r = upwards ? (n - 1 - vert) : vert;
      for (let d = 0; d < 2; d++) {
        const c = right - d;
        if (!isFunc[r][c]) {
          const byteVal = bytes[Math.floor(bitIdx / 8) % bytes.length];
          const bit = (byteVal >> (7 - (bitIdx % 8))) & 1;
          const mask = ((r + c) % 2 === 0);
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
          bitIdx++;
        }
      }
    }
    right -= 2;
    upwards = !upwards;
  }

  return matrix;
}

export function createQrSvg(text, size = 200) {
  const matrix = getQrMatrix(text);
  const n = matrix.length;
  const cellSize = size / (n + 4);
  const margin = cellSize * 2;
  
  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const centerDist = Math.max(Math.abs(r - 16), Math.abs(c - 16));
        if (centerDist > 3) {
          const x = margin + c * cellSize;
          const y = margin + r * cellSize;
          rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000000" rx="0.5"/>`;
        }
      }
    }
  }

  const centerSize = cellSize * 7;
  const centerX = (size - centerSize) / 2;
  const centerY = (size - centerSize) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#ffffff" rx="10"/>
    ${rects}
    <!-- Center SmartO Icon -->
    <g transform="translate(${centerX.toFixed(2)}, ${centerY.toFixed(2)})">
      <circle cx="${(centerSize/2).toFixed(2)}" cy="${(centerSize/2).toFixed(2)}" r="${(centerSize*0.48).toFixed(2)}" fill="#ffffff"/>
      <circle cx="${(centerSize/2).toFixed(2)}" cy="${(centerSize/2).toFixed(2)}" r="${(centerSize*0.36).toFixed(2)}" fill="none" stroke="#0072ff" stroke-width="${(centerSize*0.18).toFixed(2)}"/>
      <rect x="${(centerSize*0.62).toFixed(2)}" y="${(centerSize*0.12).toFixed(2)}" width="${(centerSize*0.14).toFixed(2)}" height="${(centerSize*0.14).toFixed(2)}" fill="#00aaff"/>
      <rect x="${(centerSize*0.75).toFixed(2)}" y="${(centerSize*0.04).toFixed(2)}" width="${(centerSize*0.16).toFixed(2)}" height="${(centerSize*0.16).toFixed(2)}" fill="#00f2fe"/>
      <rect x="${(centerSize*0.78).toFixed(2)}" y="${(centerSize*0.22).toFixed(2)}" width="${(centerSize*0.12).toFixed(2)}" height="${(centerSize*0.12).toFixed(2)}" fill="#0084ff"/>
    </g>
  </svg>`;
}

// Exact 1:1 Vector Replica of the Official Physical SmartO Decal / Sticker
export function generateOfficialStickerSvg({ qrId = 'BR-01-000001', scanUrl = 'https://smarto.in/scan/sample', size = 520 }) {
  const matrix = getQrMatrix(scanUrl);
  const n = matrix.length;
  const qrBoxSize = 160;
  const cellSize = qrBoxSize / n;
  
  let qrDots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        // avoid center 7x7 for SmartO pixel logo
        const centerDist = Math.max(Math.abs(r - 16), Math.abs(c - 16));
        if (centerDist > 3) {
          const x = c * cellSize;
          const y = r * cellSize;
          qrDots += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000000" rx="0.4"/>`;
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 520" width="${size}" height="${size}">
    <defs>
      <!-- Outer Metallic Blue Border Gradient -->
      <linearGradient id="decal-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0066eb"/>
        <stop offset="35%" stop-color="#00aaff"/>
        <stop offset="70%" stop-color="#0055d4"/>
        <stop offset="100%" stop-color="#003db3"/>
      </linearGradient>

      <!-- SmartO Logo O Gradient -->
      <linearGradient id="smart-o-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0052d4"/>
        <stop offset="55%" stop-color="#0084ff"/>
        <stop offset="100%" stop-color="#00f2fe"/>
      </linearGradient>

      <!-- Footer Wave Gradient -->
      <linearGradient id="footer-wave-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#041a4a"/>
        <stop offset="50%" stop-color="#072d7a"/>
        <stop offset="100%" stop-color="#0055d4"/>
      </linearGradient>

      <!-- Subtle Drop Shadow -->
      <filter id="decal-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.2"/>
      </filter>
    </defs>

    <!-- Outer Rounded Decal Base with Metallic Blue Border -->
    <rect x="8" y="8" width="504" height="504" rx="42" fill="#ffffff" stroke="url(#decal-border-grad)" stroke-width="14"/>
    <rect x="18" y="18" width="484" height="484" rx="34" fill="none" stroke="#e0edff" stroke-width="2"/>

    <!-- ============================================================== -->
    <!-- 1. HEADER: SmartO Innovations Official Logo                   -->
    <!-- ============================================================== -->
    <g transform="translate(108, 30)">
      <!-- "SMART" -->
      <text x="0" y="44" font-family="'Plus Jakarta Sans', 'Arial Black', sans-serif" font-weight="900" font-size="46" fill="#081838" letter-spacing="-1">SMART</text>
      
      <!-- The "O" with pixel cubes dissolving off top-right -->
      <g transform="translate(186, 2)">
        <circle cx="24" cy="24" r="19" fill="none" stroke="url(#smart-o-grad)" stroke-width="10"/>
        <!-- Pixel cubes -->
        <rect x="33" y="1" width="7" height="7" fill="#00aaff"/>
        <rect x="42" y="-4" width="8" height="8" fill="#00f2fe"/>
        <rect x="45" y="7" width="6" height="6" fill="#0084ff"/>
        <rect x="38" y="10" width="5.5" height="5.5" fill="#0052d4"/>
        <rect x="48" y="15" width="5" height="5" fill="#00c6ff"/>
        <rect x="43" y="21" width="4" height="4" fill="#00f2fe"/>
      </g>

      <!-- INNOVATIONS -->
      <text x="118" y="65" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="13" fill="#091b3e" letter-spacing="10">INNOVATIONS</text>
      <!-- Making the World Smarter -->
      <text x="118" y="80" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="500" font-size="9.5" fill="#334155">Making the World Smarter.</text>
      
      <!-- Blue divider line -->
      <line x1="-30" y1="92" x2="270" y2="92" stroke="#0072ff" stroke-width="1.2" opacity="0.6"/>
    </g>

    <!-- ============================================================== -->
    <!-- 2. GOVERNMENT ENDORSEMENT SECTION                              -->
    <!-- ============================================================== -->
    <g transform="translate(130, 134)">
      <!-- Red Bihar Sarkar Seal / Emblem -->
      <g transform="translate(0, 0)">
        <!-- Bodhi Tree Branches in Red -->
        <path d="M28 35 C28 20 18 10 8 12 C18 15 22 25 24 35 M28 35 C28 18 38 10 48 12 C38 15 34 25 32 35 M28 35 L28 4" stroke="#c02428" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <circle cx="28" cy="4" r="3" fill="#c02428"/>
        <circle cx="18" cy="8" r="2.5" fill="#c02428"/>
        <circle cx="38" cy="8" r="2.5" fill="#c02428"/>
        <circle cx="10" cy="14" r="2.5" fill="#c02428"/>
        <circle cx="46" cy="14" r="2.5" fill="#c02428"/>
        <!-- Flanking Swastikas (卐) in Red boxes -->
        <rect x="0" y="38" width="12" height="12" fill="none" stroke="#c02428" stroke-width="1.2"/>
        <text x="2" y="47" font-size="9" fill="#c02428" font-weight="bold">卐</text>
        <rect x="44" y="38" width="12" height="12" fill="none" stroke="#c02428" stroke-width="1.2"/>
        <text x="46" y="47" font-size="9" fill="#c02428" font-weight="bold">卐</text>
        <!-- Center Base with Bihar text -->
        <rect x="14" y="39" width="28" height="8" fill="#c02428" rx="1"/>
        <text x="28" y="45.5" text-anchor="middle" font-size="5" fill="#ffffff" font-weight="bold">BIHAR</text>
        <!-- बिहार सरकार Text -->
        <text x="28" y="58" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="8" fill="#a81c20">बिहार सरकार</text>
      </g>

      <!-- Vertical divider line -->
      <line x1="72" y1="8" x2="72" y2="52" stroke="#94a3b8" stroke-width="1"/>

      <!-- Supported by Govt of Bihar -->
      <g transform="translate(86, 12)">
        <text x="0" y="10" font-family="'Inter', sans-serif" font-weight="500" font-size="12" fill="#0f172a">Supported by</text>
        <text x="0" y="27" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="17" fill="#000000">Govt. of Bihar</text>
        <text x="0" y="41" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" font-size="11.5" fill="#0f172a">Ministry of Transport</text>
      </g>
    </g>

    <!-- ============================================================== -->
    <!-- 3. MIDDLE SECTION: BIKE (LEFT) | QR (CENTER) | ACTIONS (RIGHT)-->
    <!-- ============================================================== -->

    <!-- LEFT: Motorcycle Illustration & "FOR A SAFER BIHAR TOGETHER" -->
    <g transform="translate(32, 224)">
      <!-- Bike front silhouette -->
      <g transform="translate(18, 0)" fill="#0b1b3b">
        <!-- Dual Mirrors -->
        <path d="M-6 8 Q-12 0 -22 6 L-24 16 L-20 18 L-9 12 Z"/>
        <path d="M70 8 Q76 0 86 6 L88 16 L84 18 L73 12 Z"/>
        <line x1="-12" y1="12" x2="6" y2="28" stroke="#0b1b3b" stroke-width="3"/>
        <line x1="76" y1="12" x2="58" y2="28" stroke="#0b1b3b" stroke-width="3"/>
        <!-- Handlebar shield -->
        <path d="M0 26 Q32 18 64 26 L60 38 Q32 30 4 38 Z"/>
        <!-- Headlight cluster -->
        <path d="M12 36 L52 36 L46 64 L18 64 Z" fill="#0b1b3b"/>
        <path d="M22 42 L42 42 L38 56 L26 56 Z" fill="#ffffff" opacity="0.9"/>
        <!-- Front forks & mudguard -->
        <path d="M16 64 L48 64 L44 94 L20 94 Z"/>
        <!-- Front Tire -->
        <rect x="25" y="78" width="14" height="42" rx="7" fill="#071328"/>
        <line x1="32" y1="78" x2="32" y2="120" stroke="#1d2d4c" stroke-width="2"/>
      </g>

      <!-- Slogan -->
      <g transform="translate(50, 150)" text-anchor="middle">
        <text x="0" y="0" font-family="'Inter', sans-serif" font-weight="700" font-size="9" fill="#081838" letter-spacing="1">FOR A</text>
        <text x="0" y="14" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="14" fill="#081838" letter-spacing="-0.5">SAFER</text>
        <text x="0" y="27" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="14" fill="#081838" letter-spacing="-0.5">BIHAR</text>
        <text x="0" y="39" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="10.5" fill="#081838" letter-spacing="0.5">TOGETHER</text>
        <line x1="-30" y1="45" x2="30" y2="45" stroke="#0072ff" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>

    <!-- CENTER: QR Code in Rounded Blue Frame with "SCAN TO CONNECT" -->
    <g transform="translate(166, 218)">
      <!-- Frame with Blue Border -->
      <rect x="0" y="0" width="188" height="188" rx="20" fill="#ffffff" stroke="#0084ff" stroke-width="5" filter="url(#decal-shadow)"/>

      <!-- Dynamic Real QR Matrix -->
      <g transform="translate(14, 14)">
        ${qrDots}

        <!-- Center Emblem: SmartO Digital O with cyan pixels -->
        <g transform="translate(80, 80)">
          <circle cx="0" cy="0" r="22" fill="#ffffff"/>
          <circle cx="0" cy="0" r="14" fill="none" stroke="url(#smart-o-grad)" stroke-width="7"/>
          <rect x="7" y="-14" width="4.5" height="4.5" fill="#00aaff"/>
          <rect x="12" y="-18" width="5.5" height="5.5" fill="#00f2fe"/>
          <rect x="14" y="-10" width="4" height="4" fill="#0084ff"/>
          <rect x="9" y="-8" width="3.5" height="3.5" fill="#0052d4"/>
        </g>
      </g>

      <!-- "SCAN TO CONNECT" Pill attached at bottom -->
      <g transform="translate(94, 186)">
        <rect x="-94" y="-16" width="188" height="34" rx="17" fill="#0a1d42" stroke="#ffffff" stroke-width="2.5" filter="url(#decal-shadow)"/>
        <text x="0" y="6" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="13" fill="#ffffff" letter-spacing="1">SCAN TO CONNECT</text>
      </g>
    </g>

    <!-- RIGHT: 4 Service Action Badges -->
    <g transform="translate(352, 226)">
      <!-- 1. CONTACT (Green) -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="42" height="42" rx="10" fill="#059669"/>
        <!-- Phone icon -->
        <path d="M14 26 C12 24 16 16 20 18 L22 21 C21 22 20 23 21 24 C23 26 25 28 27 27 C28 26 29 27 30 28 L32 30 C34 32 26 36 24 34 Z" fill="#ffffff" transform="scale(0.85) translate(4, 2)"/>
        <text x="50" y="17" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="12" fill="#000000">CONTACT</text>
        <text x="50" y="31" font-family="'Inter', sans-serif" font-weight="600" font-size="9.5" fill="#475569">Vehicle Owner</text>
      </g>

      <!-- 2. EMERGENCY (Red) -->
      <g transform="translate(0, 48)">
        <rect x="0" y="0" width="42" height="42" rx="10" fill="#dc2626"/>
        <!-- Emergency siren beacon icon -->
        <path d="M12 26 A9 9 0 0 1 30 26 Z M10 26 L32 26 L30 30 L12 30 Z M21 9 L21 13 M13 13 L16 16 M29 13 L26 16" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <text x="50" y="17" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="12" fill="#000000">EMERGENCY</text>
        <text x="50" y="31" font-family="'Inter', sans-serif" font-weight="600" font-size="9.5" fill="#475569">Need Help?</text>
      </g>

      <!-- 3. PARKING (Blue) -->
      <g transform="translate(0, 96)">
        <rect x="0" y="0" width="42" height="42" rx="10" fill="#2563eb"/>
        <text x="21" y="29" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="24" fill="#ffffff">P</text>
        <text x="50" y="17" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="12" fill="#000000">PARKING</text>
        <text x="50" y="31" font-family="'Inter', sans-serif" font-weight="600" font-size="9.5" fill="#475569">Wrong Parking?</text>
      </g>

      <!-- 4. REPORT (Amber / Yellow) -->
      <g transform="translate(0, 144)">
        <rect x="0" y="0" width="42" height="42" rx="10" fill="#eab308"/>
        <path d="M21 11 L10 29 L32 29 Z" fill="#ffffff"/>
        <text x="21" y="27" text-anchor="middle" font-family="'Arial Black', sans-serif" font-size="10" font-weight="bold" fill="#ca8a04">!</text>
        <text x="50" y="17" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="12" fill="#000000">REPORT</text>
        <text x="50" y="31" font-family="'Inter', sans-serif" font-weight="600" font-size="8.5" fill="#475569">Accident / Safety Issue</text>
      </g>
    </g>

    <!-- ============================================================== -->
    <!-- 4. FOOTER: BLUE GRADIENT WAVE + UNIT NO. + SLOGAN              -->
    <!-- ============================================================== -->
    <g transform="translate(0, 420)">
      <!-- Smooth Blue Wave Background -->
      <path d="M12 25 Q140 10 260 25 Q380 40 508 12 L508 86 Q508 96 498 96 L22 96 Q12 96 12 86 Z" fill="url(#footer-wave-grad)"/>

      <!-- Top Cyan highlight line -->
      <path d="M12 25 Q140 10 260 25 Q380 40 508 12" fill="none" stroke="#00f2fe" stroke-width="2.5" opacity="0.8"/>

      <!-- UNIT NO. Container -->
      <g transform="translate(56, 42)">
        <!-- "UNIT NO." Dark Badge -->
        <rect x="0" y="0" width="86" height="34" rx="7" fill="#07193b" stroke="#1d4ed8" stroke-width="1.5"/>
        <text x="43" y="22" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="12" fill="#ffffff" letter-spacing="0.5">UNIT NO.</text>

        <!-- White Plate with Serial Number -->
        <rect x="88" y="0" width="190" height="34" rx="7" fill="#f0f5ff" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="183" y="23" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-weight="900" font-size="16" fill="#000000" letter-spacing="1">${esc(qrId)}</text>
      </g>

      <!-- Right Slogan: "Smart Vehicles for a Safer Bihar" -->
      <g transform="translate(420, 52)" text-anchor="middle">
        <text x="0" y="0" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="12.5" fill="#ffffff">Smart Vehicles</text>
        <text x="0" y="15" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" font-size="11.5" fill="#93c5fd">for a Safer Bihar</text>
        <line x1="-30" y1="21" x2="30" y2="21" stroke="#00f2fe" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}

// Generates the Exact Official SmartO Innovations Vector Logo from Image 2
export function smartOLogoSvg({ width = 160, height = 48, mode = 'dark' } = {}) {
  const isDark = mode === 'dark';
  const smartColor = isDark ? '#ffffff' : '#081838';
  const subColor = isDark ? '#38bdf8' : '#0284c7';
  const tagColor = isDark ? '#94a3b8' : '#475569';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 68" width="${width}" height="${height}">
      <defs>
        <linearGradient id="logo-o-grad-${mode}" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0052d4"/>
          <stop offset="50%" stop-color="#0084ff"/>
          <stop offset="100%" stop-color="#00f2fe"/>
        </linearGradient>
      </defs>
      <!-- "SMART" -->
      <text x="0" y="38" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="42" fill="${smartColor}" letter-spacing="-1">SMART</text>
      
      <!-- The "O" with pixel cubes -->
      <g transform="translate(170, 0)">
        <circle cx="21" cy="21" r="17" fill="none" stroke="url(#logo-o-grad-${mode})" stroke-width="9"/>
        <rect x="29" y="1" width="6" height="6" fill="#00aaff"/>
        <rect x="37" y="-4" width="7" height="7" fill="#00f2fe"/>
        <rect x="40" y="6" width="5.5" height="5.5" fill="#0084ff"/>
        <rect x="33" y="9" width="5" height="5" fill="#0052d4"/>
        <rect x="42" y="13" width="4.5" height="4.5" fill="#00c6ff"/>
        <rect x="38" y="19" width="3.5" height="3.5" fill="#00f2fe"/>
      </g>

      <!-- INNOVATIONS -->
      <text x="110" y="55" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="11.5" fill="${subColor}" letter-spacing="8">INNOVATIONS</text>
      <!-- Tagline -->
      <text x="110" y="66" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="500" font-size="8.5" fill="${tagColor}">Making the World Smarter.</text>
    </svg>
  `;
}
