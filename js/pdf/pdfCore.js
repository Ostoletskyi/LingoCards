// js/pdf/pdfCore.js
// Core PDF utilities (WYSIWYG): capture exact pixels from the preview canvas, crop to the card rect,
// embed as JPEG into a minimal PDF, and download.
//
// IMPORTANT: This module is UI-agnostic. Adapters decide *what* to render.

import { isEditingText, commitTextEdit } from "../editor/textEdit.js";
import { log } from "../utils/log.js";

function mmToPt(mm){
  return (Number(mm) / 25.4) * 72;
}

function dataUrlToUint8(dataUrl){
  const base64 = String(dataUrl).split(",")[1] || "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatParts(parts){
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts){
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function ascii(s){
  return new TextEncoder().encode(String(s));
}

export function downloadBytesSafe(bytes, fileName){
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "lingocard.pdf";
  // Some browsers/contexts (notably file://) ignore download() or block the click.
  // target=_blank keeps it usable: worst case it opens the PDF in a new tab.
  a.target = "_blank";
  document.body.appendChild(a);
  try {
    a.click();
  } catch {
    try { window.open(url, "_blank"); } catch (e) { log.warn("window.open failed", { err: String(e) }); }
  }
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cropCanvas(srcCanvas, rect){
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.floor(rect.w));
  const h = Math.max(1, Math.floor(rect.h));

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
  return out;
}

/**
 * Build a minimal PDF where each page contains one JPEG image.
 * @param {Array<{jpgBytes:Uint8Array, imgWpx:number, imgHpx:number, pageWmm:number, pageHmm:number}>} pages
 */
export function buildPdfFromJpegs(pages){
  // PDF object numbering:
  // 1: Catalog
  // 2: Pages
  // then for each page i:
  //   Page object
  //   Content stream object
  //   Image XObject
  const objs = [];
  const offsets = [];

  function addObj(contentBytes){
    objs.push(contentBytes);
    return objs.length; // 1-based id
  }

  const catalogId = addObj(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  const pagesId = addObj(ascii("<< /Type /Pages /Count 0 /Kids [] >>"));

  const pageIds = [];

  for (let i=0; i<pages.length; i++){
    const p = pages[i];
    const pageWpt = mmToPt(p.pageWmm);
    const pageHpt = mmToPt(p.pageHmm);

    // Content draws the image to fill the whole page.
    const content = `q\n${pageWpt.toFixed(3)} 0 0 ${pageHpt.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentStream = ascii(
      `<< /Length ${content.length} >>\nstream\n${content}endstream`
    );
    const contentId = addObj(contentStream);

    const imgDictHead = ascii(
      `<< /Type /XObject /Subtype /Image /Name /Im0 /Width ${p.imgWpx} /Height ${p.imgHpx} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpgBytes.length} >>\nstream\n`
    );
    const imgDictTail = ascii("\nendstream");
    const imgObj = concatParts([imgDictHead, p.jpgBytes, imgDictTail]);
    const imgId = addObj(imgObj);

    const pageObj = ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt.toFixed(3)} ${pageHpt.toFixed(3)}] ` +
      `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    const pageId = addObj(pageObj);
    pageIds.push(pageId);
  }

  // Patch Pages object (id=2)
  const kids = pageIds.map(id => `${id} 0 R`).join(" ");
  objs[pagesId - 1] = ascii(`<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`);

  // Build final PDF
  const header = ascii("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");
  const parts = [header];

  // write objects, track offsets
  let cursor = header.length;
  for (let i=0; i<objs.length; i++){
    offsets[i+1] = cursor;
    const objHead = ascii(`${i+1} 0 obj\n`);
    const objBody = objs[i];
    const objTail = ascii("\nendobj\n");
    parts.push(objHead, objBody, objTail);
    cursor += objHead.length + objBody.length + objTail.length;
  }

  // xref
  const xrefStart = cursor;
  let xref = "xref\n0 " + (objs.length + 1) + "\n";
  xref += "0000000000 65535 f \n";
  for (let i=1; i<=objs.length; i++){
    const off = offsets[i] || 0;
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  const xrefBytes = ascii(xref);
  parts.push(xrefBytes);
  cursor += xrefBytes.length;

  // trailer
  const trailer = ascii(
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );
  parts.push(trailer);

  return concatParts(parts);
}

export function getCtxAppOrThrow(){
  const ctxApp = window.LC_DIAG?.ctxApp;
  if (!ctxApp) throw new Error("LC_DIAG.ctxApp missing (initApp must expose ctxApp)");
  return ctxApp;
}

export function getCardCropMetaOrThrow(){
  const g = window.LC_DIAG?.lastRenderGeometry;
  if (!g?.cardRectPx) throw new Error("lastRenderGeometry.cardRectPx missing (renderCard must write it)");
  if (!g?.cardSizeMm) throw new Error("lastRenderGeometry.cardSizeMm missing (renderCard must write it)");
  return g;
}

// Keep synchronous to preserve browser download allowance within a user gesture.
export function ensurePreviewCommittedSync(ctxApp, renderFn){
  if (isEditingText()) commitTextEdit(ctxApp);
  renderFn();
}

export function withPdfModeSync(ctxApp, fn){
  const prevMode = ctxApp?.state?.exportMode;
  try {
    if (typeof ctxApp?.setState === "function") ctxApp.setState({ exportMode: "pdf" }, { autosave: false });

    fn();
  } finally {
    if (typeof ctxApp?.setState === "function") ctxApp.setState({ exportMode: prevMode }, { autosave: false });
  }
}

export function captureCurrentCardAsJpeg({ canvasId = "lcCardCanvas" } = {}){
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error(`Canvas ${canvasId} not found`);
  const g = getCardCropMetaOrThrow();
  const cropped = cropCanvas(canvas, g.cardRectPx);
  const dataUrl = cropped.toDataURL("image/jpeg", 0.95);
  const jpgBytes = dataUrlToUint8(dataUrl);
  return {
    jpgBytes,
    imgWpx: cropped.width,
    imgHpx: cropped.height,
    pageWmm: g.cardSizeMm.wMm,
    pageHmm: g.cardSizeMm.hMm,
  };
}

export function createPdfCore(){
  return Object.freeze({
    buildPdfFromJpegs,
    downloadBytesSafe,
    ensurePreviewCommittedSync,
    withPdfModeSync,
    captureCurrentCardAsJpeg,
    getCtxAppOrThrow,
    getCardCropMetaOrThrow,
  });
}
