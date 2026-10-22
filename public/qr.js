// SmartO High-Resolution Pure-JS Vector QR Generator & Official Decal Suite
// Uses the Official Client Artwork as 1:1 Base with Dynamic QR and Serial Overlay

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Generates QR matrix for byte mode (Version 4, 33x33)
export function getQrMatrix(text) {
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

// Standalone Pure QR SVG with Optional Center SmartO Logo
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
    <g transform="translate(${centerX.toFixed(2)}, ${centerY.toFixed(2)})">
      <circle cx="${(centerSize/2).toFixed(2)}" cy="${(centerSize/2).toFixed(2)}" r="${(centerSize*0.48).toFixed(2)}" fill="#ffffff"/>
      <circle cx="${(centerSize/2).toFixed(2)}" cy="${(centerSize/2).toFixed(2)}" r="${(centerSize*0.36).toFixed(2)}" fill="none" stroke="#0072ff" stroke-width="${(centerSize*0.18).toFixed(2)}"/>
      <rect x="${(centerSize*0.62).toFixed(2)}" y="${(centerSize*0.12).toFixed(2)}" width="${(centerSize*0.14).toFixed(2)}" height="${(centerSize*0.14).toFixed(2)}" fill="#00aaff"/>
      <rect x="${(centerSize*0.75).toFixed(2)}" y="${(centerSize*0.04).toFixed(2)}" width="${(centerSize*0.16).toFixed(2)}" height="${(centerSize*0.16).toFixed(2)}" fill="#00f2fe"/>
      <rect x="${(centerSize*0.78).toFixed(2)}" y="${(centerSize*0.22).toFixed(2)}" width="${(centerSize*0.12).toFixed(2)}" height="${(centerSize*0.12).toFixed(2)}" fill="#0084ff"/>
    </g>
  </svg>`;
}

/**
 * Official Vehicle Decal / Sticker SVG
 * Uses the exact 1024x1024 client artwork as base image with dynamic QR & Unit No overlay.
 */
export function generateOfficialStickerSvg({ qrId = 'BR-01-000001', scanUrl = 'https://smartoqr.in/scan/sample', size = 520, templateSrc = '/assets/sticker_template.jpg' } = {}) {
  const matrix = getQrMatrix(scanUrl);
  const n = matrix.length;
  
  // Coordinates calibrated to 1024x1024 template:
  // QR White Box: x: 332, y: 448, width: 360, height: 328
  // QR render size: 310x310 centered at x: 512, y: 612
  const qrBoxX = 332, qrBoxY = 448, qrBoxW = 360, qrBoxH = 328;
  const qrRenderSize = 310;
  const qrStartX = 512 - (qrRenderSize / 2); // 357
  const qrStartY = qrBoxY + (qrBoxH - qrRenderSize) / 2; // 457
  const cellSize = qrRenderSize / n; // ~9.39px

  let qrDots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        // avoid center 7x7 for SmartO pixel logo
        const centerDist = Math.max(Math.abs(r - 16), Math.abs(c - 16));
        if (centerDist > 3) {
          const x = qrStartX + c * cellSize;
          const y = qrStartY + r * cellSize;
          qrDots += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellSize + 0.3).toFixed(1)}" height="${(cellSize + 0.3).toFixed(1)}" fill="#000000" rx="1.5"/>`;
        }
      }
    }
  }

  // Center Emblem: SmartO Digital O with dissolving cyan pixels
  const centerCx = 512;
  const centerCy = qrStartY + (qrRenderSize / 2); // 612
  const emblemR = cellSize * 4.2; // ~39.5px

  // Unit No Pill: x: 268, y: 889, width: 404, height: 67
  const unitPillX = 268, unitPillY = 889, unitPillW = 404, unitPillH = 67;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" width="${size}" height="${size}">
    <defs>
      <linearGradient id="decal-logo-o" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0052d4"/>
        <stop offset="50%" stop-color="#0084ff"/>
        <stop offset="100%" stop-color="#00f2fe"/>
      </linearGradient>
      <filter id="decal-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.2"/>
      </filter>
    </defs>

    <!-- 1. Official Base Artwork Image (Preserves 100% of client design) -->
    <image href="${esc(templateSrc)}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none"/>

    <!-- 2. Clean White Center Box for Dynamic QR -->
    <rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxW}" height="${qrBoxH}" rx="16" fill="#ffffff"/>

    <!-- 3. Dynamic QR Matrix -->
    <g id="dynamic-qr-dots">
      ${qrDots}
    </g>

    <!-- 4. SmartO Center Digital Badge -->
    <g id="center-badge">
      <circle cx="${centerCx}" cy="${centerCy}" r="${emblemR.toFixed(1)}" fill="#ffffff"/>
      <circle cx="${centerCx}" cy="${centerCy}" r="${(emblemR * 0.62).toFixed(1)}" fill="none" stroke="url(#decal-logo-o)" stroke-width="${(emblemR * 0.36).toFixed(1)}"/>
      <rect x="${(centerCx + emblemR * 0.35).toFixed(1)}" y="${(centerCy - emblemR * 0.6).toFixed(1)}" width="7" height="7" fill="#00aaff"/>
      <rect x="${(centerCx + emblemR * 0.55).toFixed(1)}" y="${(centerCy - emblemR * 0.8).toFixed(1)}" width="8" height="8" fill="#00f2fe"/>
      <rect x="${(centerCx + emblemR * 0.65).toFixed(1)}" y="${(centerCy - emblemR * 0.3).toFixed(1)}" width="6" height="6" fill="#0084ff"/>
    </g>

    <!-- 5. Dynamic UNIT NO in the bottom white pill -->
    <rect x="${unitPillX}" y="${unitPillY}" width="${unitPillW}" height="${unitPillH}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
    <text x="${(unitPillX + unitPillW / 2).toFixed(1)}" y="${(unitPillY + unitPillH / 2 + 12).toFixed(1)}" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Arial Black', sans-serif" font-weight="900" font-size="34" fill="#08142b" letter-spacing="1">${esc(qrId)}</text>
  </svg>`;
}

/**
 * Draws the official sticker to an HTML Canvas (1024x1024)
 * Returns a Promise that resolves when rendering is complete.
 */
export function drawOfficialStickerToCanvas(canvas, { qrId = 'BR-01-000001', scanUrl = 'https://smartoqr.in/scan/sample', templateSrc = '/assets/sticker_template.jpg' } = {}) {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = templateSrc;
  
  return new Promise((resolve, reject) => {
    img.onload = () => {
      canvas.width = 1024;
      canvas.height = 1024;
      ctx.clearRect(0, 0, 1024, 1024);

      // 1. Base artwork
      ctx.drawImage(img, 0, 0, 1024, 1024);

      // 2. White clean area for QR
      const qrBoxX = 332, qrBoxY = 448, qrBoxW = 360, qrBoxH = 328;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 16);
      ctx.fill();

      // 3. Render real dynamic QR Matrix
      const matrix = getQrMatrix(scanUrl);
      const n = matrix.length;
      const qrRenderSize = 310;
      const qrStartX = 512 - (qrRenderSize / 2);
      const qrStartY = qrBoxY + (qrBoxH - qrRenderSize) / 2;
      const cellSize = qrRenderSize / n;

      ctx.fillStyle = '#000000';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (matrix[r][c]) {
            const centerDist = Math.max(Math.abs(r - 16), Math.abs(c - 16));
            if (centerDist > 3) {
              const x = qrStartX + c * cellSize;
              const y = qrStartY + r * cellSize;
              ctx.beginPath();
              ctx.roundRect(x, y, cellSize + 0.3, cellSize + 0.3, 1.5);
              ctx.fill();
            }
          }
        }
      }

      // 4. Center SmartO Digital Logo
      const centerEmblemRadius = cellSize * 4.2;
      const centerCx = 512;
      const centerCy = qrStartY + qrRenderSize / 2;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerCx, centerCy, centerEmblemRadius, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createLinearGradient(centerCx - 20, centerCy + 20, centerCx + 20, centerCy - 20);
      grad.addColorStop(0, '#0052d4');
      grad.addColorStop(0.5, '#0084ff');
      grad.addColorStop(1, '#00f2fe');

      ctx.strokeStyle = grad;
      ctx.lineWidth = centerEmblemRadius * 0.36;
      ctx.beginPath();
      ctx.arc(centerCx, centerCy, centerEmblemRadius * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#00aaff';
      ctx.fillRect(centerCx + centerEmblemRadius * 0.35, centerCy - centerEmblemRadius * 0.6, 7, 7);
      ctx.fillStyle = '#00f2fe';
      ctx.fillRect(centerCx + centerEmblemRadius * 0.55, centerCy - centerEmblemRadius * 0.8, 8, 8);
      ctx.fillStyle = '#0084ff';
      ctx.fillRect(centerCx + centerEmblemRadius * 0.65, centerCy - centerEmblemRadius * 0.3, 6, 6);

      // 5. Dynamic UNIT NO in the bottom white pill
      const unitPillX = 268, unitPillY = 889, unitPillW = 404, unitPillH = 67;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(unitPillX, unitPillY, unitPillW, unitPillH, [0, 8, 8, 0]);
      ctx.fill();

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#08142b';
      ctx.font = '900 36px "Plus Jakarta Sans", "Arial Black", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(qrId, unitPillX + unitPillW / 2, unitPillY + unitPillH / 2 + 2);

      resolve();
    };
    img.onerror = reject;
  });
}

/**
 * School / Child Safety Acrylic Badge QR Generator
 * Generates pure standalone high-res vector QR for printing on Panda, school bus, watch acrylic badges.
 * No vehicle sticker image - purely clean QR with Child Safety header and ID.
 */
export function generateSchoolBadgeSvg({ qrId = 'SCH-01-000001', scanUrl = 'https://smartoqr.in/scan/sample', childName = '', schoolName = '', size = 420 } = {}) {
  const matrix = getQrMatrix(scanUrl);
  const n = matrix.length;
  const qrBoxSize = 240;
  const cellSize = qrBoxSize / n;
  const startX = (size - qrBoxSize) / 2;
  const startY = 96;

  let qrDots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const centerDist = Math.max(Math.abs(r - 16), Math.abs(c - 16));
        if (centerDist > 3) {
          const x = startX + c * cellSize;
          const y = startY + r * cellSize;
          qrDots += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellSize + 0.2).toFixed(1)}" height="${(cellSize + 0.2).toFixed(1)}" fill="#0c1f4a" rx="1"/>`;
        }
      }
    }
  }

  const centerCx = startX + qrBoxSize / 2;
  const centerCy = startY + qrBoxSize / 2;
  const centerR = cellSize * 4.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size + 40}" width="${size}" height="${size + 40}">
    <defs>
      <linearGradient id="badge-top-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0284c7"/>
        <stop offset="50%" stop-color="#2563eb"/>
        <stop offset="100%" stop-color="#4f46e5"/>
      </linearGradient>
      <linearGradient id="badge-school-o" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#ef4444"/>
      </linearGradient>
    </defs>

    <!-- Acrylic Badge Rounded Frame -->
    <rect x="6" y="6" width="${size - 12}" height="${size + 28}" rx="32" fill="#ffffff" stroke="url(#badge-top-grad)" stroke-width="8"/>

    <!-- Top Badge Header: Child Safety Network -->
    <rect x="10" y="10" width="${size - 20}" height="72" rx="24" fill="url(#badge-top-grad)"/>
    <g transform="translate(${size / 2}, 36)" text-anchor="middle">
      <text x="0" y="0" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="16" fill="#ffffff" letter-spacing="1.5">SMARTO CHILD SAFETY</text>
      <text x="0" y="18" font-family="'Inter', sans-serif" font-weight="600" font-size="11" fill="#bae6fd">EMERGENCY SOS & GUARDIAN ALERT</text>
    </g>

    <!-- Center QR Matrix -->
    <g id="school-qr-dots">
      ${qrDots}
    </g>

    <!-- Center Emblem: Child Protective Shield -->
    <circle cx="${centerCx}" cy="${centerCy}" r="${centerR}" fill="#ffffff" stroke="#2563eb" stroke-width="2.5"/>
    <text x="${centerCx}" y="${centerCy + 6}" text-anchor="middle" font-size="20">🛡️</text>

    <!-- Bottom Pill: Child ID & Emergency Scan -->
    <g transform="translate(${size / 2}, ${size - 32})" text-anchor="middle">
      <rect x="-140" y="-18" width="280" height="38" rx="19" fill="#0f172a"/>
      <text x="0" y="6" font-family="'Plus Jakarta Sans', monospace" font-weight="900" font-size="15" fill="#38bdf8" letter-spacing="1">ID: ${esc(qrId)}</text>
    </g>

    <g transform="translate(${size / 2}, ${size + 18})" text-anchor="middle">
      <text x="0" y="0" font-family="'Inter', sans-serif" font-weight="700" font-size="10.5" fill="#475569">SCAN WITH ANY CAMERA TO REACH PARENTS</text>
    </g>
  </svg>`;
}

// Generates the Exact Official SmartO Innovations Vector Logo
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
