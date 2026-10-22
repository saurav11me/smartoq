// SmartO Pure-JS Multi-Page Vector & Canvas PDF Suite for Vehicle QR Decals
// Works with Zero External Dependencies (Native Browser Canvas + PDF 1.4 Binary Assembler)

import { generateOfficialStickerSvg, generateSchoolBadgeSvg } from './qr.js';

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Pure-JS Binary PDF 1.4 Assembler
 * Packages an array of page image buffers into a compliant, standard PDF file.
 * @param {Array<{ widthPt: number, heightPt: number, jpegBuffer: Uint8Array, pixelWidth: number, pixelHeight: number }>} pages
 * @returns {Uint8Array} Binary PDF bytes
 */
export function assemblePdf(pages) {
  const pageObjNums = [];
  let objIndex = 2; // 1 is Catalog, 2 is Pages

  const pageEntries = [];
  for (const page of pages) {
    objIndex++;
    const imgObjNum = objIndex;
    objIndex++;
    const contentStreamObjNum = objIndex;
    objIndex++;
    const pageObjNum = objIndex;
    pageObjNums.push(pageObjNum);

    pageEntries.push({ page, imgObjNum, contentStreamObjNum, pageObjNum });
  }

  const pdfObjects = [];
  pdfObjects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;
  const kidsStr = pageObjNums.map(n => `${n} 0 R`).join(' ');
  pdfObjects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pageObjNums.length} >>\nendobj`;

  for (const entry of pageEntries) {
    const { page, imgObjNum, contentStreamObjNum, pageObjNum } = entry;
    const header = `${imgObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBuffer.length} >>\nstream\n`;
    const footer = `\nendstream\nendobj`;
    pdfObjects[imgObjNum] = { isBinary: true, header, buffer: page.jpegBuffer, footer };

    const streamOps = `q\n${page.widthPt.toFixed(2)} 0 0 ${page.heightPt.toFixed(2)} 0 0 cm\n/Im${imgObjNum} Do\nQ\n`;
    const streamBuffer = new TextEncoder().encode(streamOps);
    pdfObjects[contentStreamObjNum] = `${contentStreamObjNum} 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n${streamOps}endstream\nendobj`;

    pdfObjects[pageObjNum] = `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt.toFixed(2)} ${page.heightPt.toFixed(2)}] /Contents ${contentStreamObjNum} 0 R /Resources << /XObject << /Im${imgObjNum} ${imgObjNum} 0 R >> >> >>\nendobj`;
  }

  const chunks = [];
  let offset = 0;
  const headerStr = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const headerBytes = new Uint8Array([...headerStr].map(c => c.charCodeAt(0)));
  chunks.push(headerBytes);
  offset += headerBytes.length;

  const xrefOffsets = [0];
  const encoder = new TextEncoder();

  for (let i = 1; i < pdfObjects.length; i++) {
    xrefOffsets[i] = offset;
    const obj = pdfObjects[i];
    if (obj.isBinary) {
      const headBuf = encoder.encode(obj.header);
      const footBuf = encoder.encode(obj.footer);
      const nlBuf = encoder.encode('\n');
      chunks.push(headBuf, obj.buffer, footBuf, nlBuf);
      offset += headBuf.length + obj.buffer.length + footBuf.length + nlBuf.length;
    } else {
      const buf = encoder.encode(obj + '\n');
      chunks.push(buf);
      offset += buf.length;
    }
  }

  const startXref = offset;
  let xrefStr = `xref\n0 ${pdfObjects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < pdfObjects.length; i++) {
    xrefStr += String(xrefOffsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  xrefStr += `trailer\n<< /Size ${pdfObjects.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  chunks.push(encoder.encode(xrefStr));

  // Merge chunks into a single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let cur = 0;
  for (const c of chunks) {
    result.set(c, cur);
    cur += c.length;
  }
  return result;
}

/**
 * Generates the Complete HTML for the A4 Printable Sheet Window.
 * Optimized for standard A4 sticker paper with vector SVG decals and cut marks.
 */
export function buildPrintSheetHtml({ qrs, layout = '2x3', cutGuides = true, batchName = 'SmartO Bulk Decal Production' }) {
  const perPageMap = {
    '2x2': 4,
    '2x3': 6,
    '3x4': 12
  };
  const perPage = perPageMap[layout] || 6;
  const totalPages = Math.ceil(qrs.length / perPage);
  const nowFormatted = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  const gridClass = `decal-grid-${layout}`;
  let pagesHtml = '';

  for (let p = 0; p < totalPages; p++) {
    const pageItems = qrs.slice(p * perPage, (p + 1) * perPage);
    const pageNum = p + 1;

    const cellsHtml = pageItems.map((item, idx) => {
      const scanUrl = `${location.origin}/scan/${encodeURIComponent(item.public_token)}`;
      const isSchool = item.category === 'SCHOOL' || item.batch_category === 'SCHOOL';
      const svg = isSchool
        ? generateSchoolBadgeSvg({ qrId: item.qr_id, scanUrl, size: layout === '2x2' ? 360 : (layout === '3x4' ? 180 : 260) })
        : generateOfficialStickerSvg({ qrId: item.qr_id, scanUrl, size: layout === '2x2' ? 360 : (layout === '3x4' ? 180 : 260) });
      const overallIndex = p * perPage + idx + 1;

      return `
        <div class="sticker-cell">
          ${cutGuides ? `
            <span class="cut-corner tl">+</span>
            <span class="cut-corner tr">+</span>
            <span class="cut-corner bl">+</span>
            <span class="cut-corner br">+</span>
            <span class="cell-seq-badge">#${overallIndex}</span>
          ` : ''}
          <div class="svg-wrapper">
            ${svg}
          </div>
        </div>
      `;
    }).join('');

    const isSchoolBatch = batchName.toLowerCase().includes('school') || qrs[0]?.category === 'SCHOOL';
    pagesHtml += `
      <section class="a4-page">
        <header class="page-meta-header">
          <div class="meta-left">
            <span class="brand-title">${isSchoolBatch ? 'SMARTO INNOVATIONS • CHILD SAFETY NETWORK' : 'SMARTO INNOVATIONS • VEHICLE SAFETY NETWORK'}</span>
            <span class="meta-sub">${isSchoolBatch ? 'Official Acrylic Child Safety Badges • Emergency Guardian & SOS Alert' : 'Official Cryptographic QR Decals • Govt. of Bihar Transport Specification'}</span>
          </div>
          <div class="meta-right">
            <span><strong>Sheet:</strong> ${pageNum} of ${totalPages}</span>
            <span><strong>Units:</strong> ${qrs.length}</span>
            <span><strong>Printed:</strong> ${nowFormatted}</span>
          </div>
        </header>

        <div class="${gridClass}">
          ${cellsHtml}
        </div>

        <footer class="page-meta-footer">
          <span>Official Bihar State Decal Registry • Confidential Bearer Codes • Never fold across QR Matrix</span>
          <span>Security Protocol v2.0 • Page ${pageNum} / ${totalPages}</span>
        </footer>
      </section>
    `;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SmartO - Printable Decal Sheet (${qrs.length} Units)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Plus+Jakarta+Sans:wght@700;800;900&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060e20;
      color: #0f172a;
      font-family: 'Plus Jakarta Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Screen Sticky Control Bar */
    .screen-control-bar {
      position: sticky;
      top: 0;
      z-index: 10000;
      background: #09132c;
      color: #ffffff;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #00aaff;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    }
    .bar-info { display: flex; align-items: center; gap: 14px; }
    .bar-logo { font-weight: 900; font-size: 18px; color: #38bdf8; letter-spacing: -0.5px; }
    .bar-badge {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid #38bdf8;
      color: #e0f2fe;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .bar-actions { display: flex; gap: 10px; align-items: center; }
    .btn {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 800;
      font-size: 13px;
      padding: 9px 18px;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-print {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(37,99,235,0.4);
    }
    .btn-print:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .btn-close {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
    }
    .btn-close:hover { background: #334155; color: #fff; }

    /* Container for A4 Sheets */
    .sheet-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 0 48px;
      gap: 28px;
    }

    /* Standard A4 Page in mm */
    .a4-page {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      background: #ffffff;
      padding: 7mm 8mm 6mm;
      box-shadow: 0 10px 40px rgba(0,0,0,0.45);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      break-after: page;
      position: relative;
    }

    /* Page Header */
    .page-meta-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid #0055d4;
      padding-bottom: 2mm;
      margin-bottom: 3mm;
    }
    .brand-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 900;
      font-size: 10pt;
      color: #071c4d;
      display: block;
      letter-spacing: 0.5px;
    }
    .meta-sub {
      font-size: 7pt;
      color: #475569;
      display: block;
    }
    .meta-right {
      display: flex;
      gap: 10px;
      font-size: 7.5pt;
      color: #334155;
      font-family: 'Inter', sans-serif;
    }

    /* Decal Grids */
    .decal-grid-2x3 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 4mm 5mm;
      flex: 1;
    }
    .decal-grid-2x2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 6mm;
      flex: 1;
    }
    .decal-grid-3x4 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 3mm;
      flex: 1;
    }

    /* Decal Cell */
    .sticker-cell {
      border: 1px dashed #93c5fd;
      border-radius: 6px;
      padding: 1mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      background: #fafcff;
      overflow: hidden;
    }
    .svg-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .svg-wrapper svg {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    /* Corner Cut Guides */
    .cut-corner {
      position: absolute;
      font-family: monospace;
      font-size: 7pt;
      color: #94a3b8;
      font-weight: bold;
      pointer-events: none;
      line-height: 1;
    }
    .cut-corner.tl { top: 1mm; left: 1mm; }
    .cut-corner.tr { top: 1mm; right: 1mm; }
    .cut-corner.bl { bottom: 1mm; left: 1mm; }
    .cut-corner.br { bottom: 1mm; right: 1mm; }
    .cell-seq-badge {
      position: absolute;
      bottom: 1.5mm;
      left: 3mm;
      font-size: 5.5pt;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      color: #64748b;
      background: rgba(255,255,255,0.8);
      padding: 0 2px;
      border-radius: 2px;
    }

    /* Page Footer */
    .page-meta-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #cbd5e1;
      padding-top: 2mm;
      margin-top: 2mm;
      font-size: 6.5pt;
      color: #64748b;
      font-family: 'Inter', sans-serif;
    }

    /* Native Print Optimizations */
    @media print {
      body {
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .screen-control-bar {
        display: none !important;
      }
      .sheet-wrapper {
        padding: 0 !important;
        gap: 0 !important;
      }
      .a4-page {
        box-shadow: none !important;
        margin: 0 !important;
        width: 100% !important;
        height: 100vh !important;
        min-height: 100vh !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      @page {
        size: A4 portrait;
        margin: 5mm;
      }
    }
  </style>
</head>
<body>
  <div class="screen-control-bar">
    <div class="bar-info">
      <span class="bar-logo">SMARTO</span>
      <span class="bar-badge">🖨️ A4 PRINT SHEET • ${qrs.length} DECALS (${totalPages} PAGES)</span>
    </div>
    <div class="bar-actions">
      <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      <button class="btn btn-print" onclick="window.print()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        🖨️ Print / Save as PDF (Ctrl+P)
      </button>
    </div>
  </div>

  <main class="sheet-wrapper">
    ${pagesHtml}
  </main>

  <script>
    // Prompt print dialog after assets have painted
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>`;
}

/**
 * Renders A4 Pages to High-Res Canvas and Packages as a Real Downloadable PDF File.
 * Zero external libraries needed; works natively in all modern browsers.
 */
export async function downloadDecalsPdf({ qrs, layout = '2x3', cutGuides = true, filename = null, onProgress = null }) {
  const perPageMap = { '2x2': 4, '2x3': 6, '3x4': 12 };
  const perPage = perPageMap[layout] || 6;
  const totalPages = Math.ceil(qrs.length / perPage);
  const pdfPages = [];

  const canvasWidth = 1240;
  const canvasHeight = 1754;
  const marginX = 40;
  const marginY = 40;
  const headerHeight = 70;
  const footerHeight = 45;
  const contentWidth = canvasWidth - marginX * 2;
  const contentHeight = canvasHeight - marginY * 2 - headerHeight - footerHeight;

  const cols = layout === '2x2' ? 2 : (layout === '3x4' ? 3 : 2);
  const rows = layout === '2x2' ? 2 : (layout === '3x4' ? 4 : 3);
  const cellWidth = contentWidth / cols;
  const cellHeight = contentHeight / rows;
  const stickerSize = Math.min(cellWidth - 16, cellHeight - 16);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  for (let p = 0; p < totalPages; p++) {
    if (onProgress) onProgress(p + 1, totalPages);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Header
    ctx.fillStyle = '#071c4d';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SMARTO INNOVATIONS • VEHICLE SAFETY NETWORK', marginX, marginY + 28);
    ctx.fillStyle = '#475569';
    ctx.font = '14px "Inter", sans-serif';
    ctx.fillText('Official Cryptographic QR Decals • Govt. of Bihar Transport Specification', marginX, marginY + 52);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Sheet ${p + 1} of ${totalPages} (${qrs.length} Units)`, canvasWidth - marginX, marginY + 40);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#0055d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, marginY + headerHeight);
    ctx.lineTo(canvasWidth - marginX, marginY + headerHeight);
    ctx.stroke();

    // Render cells
    const pageItems = qrs.slice(p * perPage, (p + 1) * perPage);
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * cellWidth;
      const y = marginY + headerHeight + 10 + row * cellHeight;

      if (cutGuides) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8);
        ctx.setLineDash([]);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        ctx.fillText('+', x + 6, y + 16);
        ctx.fillText('+', x + cellWidth - 14, y + 16);
        ctx.fillText('+', x + 6, y + cellHeight - 8);
        ctx.fillText('+', x + cellWidth - 14, y + cellHeight - 8);
      }

      const scanUrl = `${location.origin}/scan/${encodeURIComponent(item.public_token)}`;
      const isSchool = item.category === 'SCHOOL' || item.batch_category === 'SCHOOL';
      const svg = isSchool
        ? generateSchoolBadgeSvg({ qrId: item.qr_id, scanUrl, size: 520 })
        : generateOfficialStickerSvg({ qrId: item.qr_id, scanUrl, size: 520 });

      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const imgUrl = URL.createObjectURL(svgBlob);

      await new Promise(res => {
        img.onload = () => {
          const offsetX = x + (cellWidth - stickerSize) / 2;
          const offsetY = y + (cellHeight - stickerSize) / 2;
          ctx.drawImage(img, offsetX, offsetY, stickerSize, stickerSize);
          URL.revokeObjectURL(imgUrl);
          res();
        };
        img.onerror = () => {
          URL.revokeObjectURL(imgUrl);
          res();
        };
        img.src = imgUrl;
      });
    }

    // Footer
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX, canvasHeight - marginY - footerHeight);
    ctx.lineTo(canvasWidth - marginX, canvasHeight - marginY - footerHeight);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '13px "Inter", sans-serif';
    ctx.fillText('Official Bihar State Decal Registry • Confidential Bearer Codes • Never fold across QR Matrix', marginX, canvasHeight - marginY - 18);
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${p + 1} / ${totalPages}`, canvasWidth - marginX, canvasHeight - marginY - 18);
    ctx.textAlign = 'left';

    const jpegBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    const arrayBuffer = await jpegBlob.arrayBuffer();
    pdfPages.push({
      widthPt: 595.28,
      heightPt: 841.89,
      jpegBuffer: new Uint8Array(arrayBuffer),
      pixelWidth: canvasWidth,
      pixelHeight: canvasHeight
    });
  }

  const pdfBytes = assemblePdf(pdfPages);
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || `SmartO_${qrs.length}_Vehicle_QR_Decals.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 10_000);
  return { success: true, count: qrs.length, pages: totalPages };
}

