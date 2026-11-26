import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type {
  AppLanguage,
  BrandConfig,
  DefectItem,
  FloorPlan,
  ProjectFile,
  ReportBookData,
} from '../types/inspection';
import { DEFAULT_GEAR_LOGO_SVG, getArchitecturalFloorSvg } from '../data/defaultData';
import { customFloorSvg } from './customFloorSvg';
import { translateDefectStatus, translateSeverity } from '../i18n/translations';
import {
  createDefaultCustomExportSettings,
  loadReportBookData,
  resolveCoverImage,
  sanitizeReportImageUrl,
} from './reportBook';

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrentTime(lang: AppLanguage = 'th'): string {
  return new Date().toLocaleTimeString(lang === 'en' ? 'en-US' : 'th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function getDefaultSaveAsFilename(prefix = 'home_inspection'): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export function compressImageFile(
  file: File,
  maxDimension = 2560,
  quality = 0.95
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const maxSide = Math.max(natW, natH);
        const ratio =
          maxDimension > 0 && maxSide > maxDimension ? maxDimension / maxSide : 1;
        const w = Math.max(1, Math.round(natW * ratio));
        const h = Math.max(1, Math.round(natH * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function saveJsonFileWithPickerOrDownload(
  payloadObj: unknown,
  rawFileName?: string
): Promise<{ saved: boolean; fileName?: string; cancelled?: boolean }> {
  const cleaned = (rawFileName || getDefaultSaveAsFilename())
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.json$/i, '');
  const finalName = `${cleaned || 'home_inspection_backup'}.json`;
  const jsonText = JSON.stringify(payloadObj, null, 2);

  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      name?: string;
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: finalName,
        types: [{ description: 'JSON Inspection File', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonText);
      await writable.close();
      return { saved: true, fileName: handle.name || finalName };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
        return { saved: false, cancelled: true };
      }
    }
  }

  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true, fileName: finalName };
}

export function getFloorNameById(proj: ProjectFile, floorId: string): string {
  return proj.floors.find((f) => f.id === floorId)?.name || 'ชั้น 1';
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function normalizeSvgForRaster(rawSvg: string, width: number, height: number): string {
  let cleaned = rawSvg.trim().replace(/\sclass="[^"]*"/g, '');
  if (!cleaned.includes('xmlns="http://www.w3.org/2000/svg"')) {
    cleaned = cleaned.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  cleaned = cleaned
    .replace(/\swidth="[^"]*"/i, '')
    .replace(/\sheight="[^"]*"/i, '')
    .replace('<svg ', `<svg width="${width}" height="${height}" `);
  return cleaned;
}

export async function svgToPngDataUrl(
  rawSvg: string,
  width: number,
  height: number
): Promise<string | null> {
  try {
    const svgText = normalizeSvgForRaster(rawSvg, width, height);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const img = await loadImageElement(dataUri);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function renderFloorplanWithPinsToPng(
  floor: FloorPlan,
  floorDefects: DefectItem[]
): Promise<string | null> {
  const baseWidth = 800;
  const baseHeight = 600;
  const dpiScale = 2;
  const width = baseWidth * dpiScale;
  const height = baseHeight * dpiScale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  try {
    if (floor.imageUrl) {
      const img = await loadImageElement(floor.imageUrl);
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (width - drawW) / 2;
      const offsetY = (height - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      const svgText = normalizeSvgForRaster(
        floor.isCustomBuilder ? customFloorSvg(floor) : getArchitecturalFloorSvg(floor.svgPreset ?? 0),
        width,
        height
      );
      const svgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const svgImg = await loadImageElement(svgUri);
      ctx.drawImage(svgImg, 0, 0, width, height);
    }
  } catch {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);
  }

  floorDefects.forEach((p) => {
    const px = Math.max(36, Math.min(width - 36, (p.x / 100) * width));
    const py = Math.max(36, Math.min(height - 36, (p.y / 100) * height));
    const pinColor =
      p.status === 'แก้ไขแล้ว'
        ? '#059669'
        : p.severity === 'เร่งด่วน'
        ? '#e11d48'
        : p.severity === 'เล็กน้อย'
        ? '#2563eb'
        : '#f59e0b';

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 16 * dpiScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, 13.5 * dpiScale, 0, Math.PI * 2);
    ctx.fillStyle = pinColor;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${13 * dpiScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), px, py + 1);
    ctx.restore();
  });

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function renderFloorplanZonesToPng(floor: FloorPlan): Promise<string | null> {
  const baseWidth = 800;
  const baseHeight = 600;
  const dpiScale = 2;
  const width = baseWidth * dpiScale;
  const height = baseHeight * dpiScale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  try {
    if (floor.imageUrl) {
      const img = await loadImageElement(floor.imageUrl);
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (width - drawW) / 2;
      const offsetY = (height - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      const svgText = normalizeSvgForRaster(
        floor.isCustomBuilder ? customFloorSvg(floor) : getArchitecturalFloorSvg(floor.svgPreset ?? 0),
        width,
        height
      );
      const svgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const svgImg = await loadImageElement(svgUri);
      ctx.drawImage(svgImg, 0, 0, width, height);
    }
  } catch {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);
  }

  (floor.zones || []).forEach((z) => {
    const zx = (z.x / 100) * width;
    const zy = (z.y / 100) * height;
    const zw = (z.w / 100) * width;
    const zh = (z.h / 100) * height;

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = z.bg || '#dbeafe';
    ctx.beginPath();
    ctx.roundRect(zx, zy, zw, zh, 8 * dpiScale);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = z.border || '#2563eb';
    ctx.lineWidth = 2.5 * dpiScale;
    ctx.setLineDash([6 * dpiScale, 4 * dpiScale]);
    ctx.beginPath();
    ctx.roundRect(zx, zy, zw, zh, 8 * dpiScale);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `bold ${13 * dpiScale}px 'TH Sarabun New', sans-serif`;
    const labelText = z.name || '';
    const textW = ctx.measureText(labelText).width;
    const badgeW = Math.min(zw - 12 * dpiScale, textW + 18 * dpiScale);
    const badgeH = 24 * dpiScale;
    const bx = Math.max(8 * dpiScale, Math.min(width - badgeW - 8 * dpiScale, zx + 8 * dpiScale));
    const by = Math.max(8 * dpiScale, Math.min(height - badgeH - 8 * dpiScale, zy + 8 * dpiScale));

    ctx.fillStyle = z.border || '#1e3a8a';
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 6 * dpiScale);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      labelText,
      bx + 9 * dpiScale,
      by + badgeH / 2 + 1,
      Math.max(20 * dpiScale, badgeW - 18 * dpiScale)
    );
    ctx.restore();
  });

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export interface SharedReportAssets {
  logoPngDataUrl: string | null;
  coverGraphicPngDataUrl: string | null;
  floorplanPngMap: Record<string, string>;
  floorplanZonePngMap: Record<string, string>;
}

export async function prepareSharedReportAssets(
  proj: ProjectFile,
  brand: BrandConfig
): Promise<SharedReportAssets> {
  const sorted = [...proj.defects].sort((a, b) => (a.number || 0) - (b.number || 0));

  const logoPromise = brand.customLogoDataUrl
    ? Promise.resolve(brand.customLogoDataUrl)
    : svgToPngDataUrl(DEFAULT_GEAR_LOGO_SVG, 440, 440);

  const coverGraphicPromise = Promise.resolve(null);

  const floorEntriesPromise = Promise.all(
    proj.floors.map(async (fl) => {
      const flPins = sorted.filter((d) => d.floorId === fl.id);
      const [pinPng, zonePng] = await Promise.all([
        renderFloorplanWithPinsToPng(fl, flPins),
        renderFloorplanZonesToPng(fl),
      ]);
      return [fl.id, pinPng, zonePng] as const;
    })
  );

  const [logoPngDataUrl, coverGraphicPngDataUrl, floorEntries] = await Promise.all([
    logoPromise,
    coverGraphicPromise,
    floorEntriesPromise,
  ]);

  const floorplanPngMap: Record<string, string> = {};
  const floorplanZonePngMap: Record<string, string> = {};
  floorEntries.forEach(([id, pinDataUrl, zoneDataUrl]) => {
    if (pinDataUrl) floorplanPngMap[id] = pinDataUrl;
    if (zoneDataUrl) floorplanZonePngMap[id] = zoneDataUrl;
  });

  return {
    logoPngDataUrl,
    coverGraphicPngDataUrl,
    floorplanPngMap,
    floorplanZonePngMap,
  };
}

export interface BuiltReportPage {
  id: string;
  pageLabel: string;
  isCover?: boolean;
  html: string;
}

function stripLeadingStepNumber(text: string): string {
  return String(text || '').replace(/^\s*\d+[\.\)\-]\s*/, '').trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripZonePrefixFromTitle(title: string, zone: string): string {
  const cleanTitle = String(title || '').trim();
  const cleanZone = String(zone || '').trim();
  if (!cleanTitle || !cleanZone) return cleanTitle;

  const zoneWithoutCode = cleanZone
    .replace(/^(?:โซน|zone)\s*\d+\s*[:\.\-–—]?\s*/i, '')
    .trim();

  const candidates = new Set<string>([cleanZone]);
  if (zoneWithoutCode) {
    candidates.add(zoneWithoutCode);
  }

  const subParts = (zoneWithoutCode || cleanZone)
    .split(/\s*(?:\/|&|และ|,)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  subParts.forEach((p) => candidates.add(p));

  const sortedCandidates = Array.from(candidates).sort((a, b) => b.length - a.length);
  for (const candidate of sortedCandidates) {
    const escaped = escapeRegExp(candidate);
    const sepRegex = new RegExp(`^${escaped}\\s*[\\-–—:|·]+\\s*`, 'i');
    if (sepRegex.test(cleanTitle)) {
      const stripped = cleanTitle.replace(sepRegex, '').trim();
      if (stripped.length > 0) return stripped;
    }
    if (candidate === cleanZone || candidate === zoneWithoutCode) {
      const spaceRegex = new RegExp(`^${escaped}\\s+`, 'i');
      if (spaceRegex.test(cleanTitle)) {
        const stripped = cleanTitle.replace(spaceRegex, '').trim();
        if (stripped.length > 0) return stripped;
      }
    }
  }

  return cleanTitle;
}

function normalizeReportText(text: string): string {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveDefectPhoto(d: DefectItem, side: 'before' | 'after'): string | null {
  const legacy = d as DefectItem & {
    annotatedImage?: string | null;
    originalImage?: string | null;
    annotatedBeforeImg?: string | null;
    annotatedAfterImg?: string | null;
  };
  if (side === 'before') {
    return (
      legacy.annotatedBeforeImg ||
      legacy.annotatedImage ||
      d.beforeImg ||
      d.photoDataUrl ||
      legacy.originalImage ||
      null
    );
  }
  return legacy.annotatedAfterImg || d.afterImg || null;
}

function estimateDefectRowHeight(
  d: DefectItem,
  flName: string,
  showCauseDetails: boolean,
  showSolutionDetails: boolean,
  causePrefix: string,
  solutionPrefix: string
): number {
  const zoneLabel = (d.zone || flName || '').trim();
  const cleanTitle = stripZonePrefixFromTitle(d.title, zoneLabel);
  const cleanCause = (d.cause || '').trim();
  const cleanSolution = (d.solution || '').trim();

  const normTitle = normalizeReportText(cleanTitle);
  const normCause = normalizeReportText(cleanCause);
  const normSolution = normalizeReportText(cleanSolution);

  const showCause =
    showCauseDetails && !d.hideCause && cleanCause.length > 0 && normCause !== normTitle;
  const showSolution =
    showSolutionDetails &&
    !d.hideSolution &&
    cleanSolution.length > 0 &&
    normSolution !== normTitle &&
    (!showCause || normSolution !== normCause);

  let textHeight = 38; // Zone line + floor/severity line + gaps
  textHeight += Math.max(1, Math.ceil(cleanTitle.length / 26)) * 16;
  if (showCause) {
    textHeight += 4 + Math.max(1, Math.ceil((causePrefix.length + 1 + cleanCause.length) / 28)) * 15;
  }
  if (showSolution) {
    textHeight +=
      4 + Math.max(1, Math.ceil((solutionPrefix.length + 1 + cleanSolution.length) / 28)) * 15;
  }

  const rowTextTotal = textHeight + 14;
  const rowImageTotal = 150 + 14; // 150px photo box + vertical padding/border
  return Math.max(rowImageTotal, rowTextTotal);
}

/**
 * Builds the complete 5-part A4 Engineering Report Book (Cover, TOC, Intro, Steps & Zones,
 * 7-column Table 1 at up to 5 defects per page with auto-fit pagination, Summary & Table 2, and anchored Page Footer).
 * Pure inline CSS with Hex/RGB colors only (safe for both Word .doc and html2canvas PDF).
 */
export function buildSharedReportPages(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th',
  assets?: SharedReportAssets,
  reportBookInput?: ReportBookData
): BuiltReportPage[] {
  const rb = reportBookInput || loadReportBookData(proj, lang);
  const custom = {
    ...createDefaultCustomExportSettings(),
    ...(rb.customExport || {}),
  };

  const allSorted = [...proj.defects].sort((a, b) => (a.number || 0) - (b.number || 0));
  const filteredDefects = allSorted.filter((d) => {
    if (custom.defectSelectionMode === 'manual') {
      return custom.selectedDefectIds.includes(d.id);
    }
    if (custom.defectStatusFilter === 'pending_only' && d.status === 'แก้ไขแล้ว') {
      return false;
    }
    if (custom.defectStatusFilter === 'fixed_only' && d.status !== 'แก้ไขแล้ว') {
      return false;
    }
    if (custom.defectSeverityFilter === 'urgent_only' && d.severity !== 'เร่งด่วน') {
      return false;
    }
    return true;
  });

  const total = filteredDefects.length;
  const urgent = filteredDefects.filter((d) => d.severity === 'เร่งด่วน').length;
  const pending = filteredDefects.filter((d) => d.status !== 'แก้ไขแล้ว').length;
  const fixed = filteredDefects.filter((d) => d.status === 'แก้ไขแล้ว').length;

  const isEn = lang === 'en';
  const accentHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brand.accentColor || '')
    ? brand.accentColor
    : '#1e3a8a';

  const logoImgSrc = brand.customLogoDataUrl || assets?.logoPngDataUrl || '';
  const coverGraphicSrc = resolveCoverImage(rb);

  const L = isEn
    ? {
        preparedBy: 'Prepared By',
        inspectorWord: 'Inspector',
        locationLabel: 'Location',
        clientLabel: 'Homeowner / Client',
        dateLabel: 'Inspection Date',
        pageWord: 'Page',
        tocTitle: 'Table of Contents',
        tocColTopic: 'Topic',
        tocColPage: 'Page',
        tocSec1: '1. Introduction',
        tocSec2: '2. Inspection Procedures & House Zones',
        tocSec3: `3. Inspection Details — Table 1 (${total} items)`,
        tocSec4: '4. Summary & Recommendations — Table 2',
        sec1Title: '1. Introduction',
        fig1Caption: 'Figure 1: Project Location Map / Satellite View',
        fig2Caption: 'Figure 2: Front Elevation Photo of House',
        noFig1: 'Location map not attached',
        noFig2: 'Front house photo not attached',
        sec2Title: '2. Inspection Procedures',
        sec2Cont: '2. Inspection Procedures (Zone Plans Continued)',
        fig3Caption: 'Figure 3: House Interior & Exterior Zone Floorplans',
        sec3Title: '3. Inspection Details',
        sec3Cont: '3. Inspection Details (Continued)',
        t1Caption: 'Table 1: Field Inspection Defect Schedule',
        t1CaptionCont: 'Table 1: Field Inspection Defect Schedule (Continued)',
        colSeq: 'No.',
        colCheck1: '1st Check (Before)',
        colProblem: 'Defect & Details',
        colCheck2: '2nd Check (After)',
        colStatusGroup: 'Verification Status',
        colFixed: 'Fixed',
        colPartial: 'Fixed (Incomplete)',
        colUnfixed: 'Not Fixed',
        causePrefix: 'Cause:',
        solutionPrefix: 'Solution:',
        noImg: 'No photo',
        pendingImg: '-',
        emptyDefects: 'No defect records in this project.',
        sec4Title: '4. Summary / Recommendations',
        sec4Lead:
          'Summary evaluation of each engineering inspection procedure conducted on site (Table 2):',
        t2Caption: 'Table 2: Inspection Procedure Verification Summary',
        t2ColNo: 'No.',
        t2ColItem: 'Inspection Item',
        t2ColFinding: 'Findings / Notes',
        statTotal: 'Total Defects',
        statUrgent: 'Urgent',
        statPending: 'Pending / In Progress',
        statFixed: 'Fixed',
        itemsUnit: 'items',
        projectLabel: 'Project',
      }
    : {
        preparedBy: 'จัดทำโดย',
        inspectorWord: 'ผู้ตรวจสอบ',
        locationLabel: 'สถานที่ตั้ง (Location)',
        clientLabel: 'ชื่อเจ้าของบ้าน',
        dateLabel: 'วันที่ตรวจรับ',
        pageWord: 'หน้า',
        tocTitle: 'สารบัญ',
        tocColTopic: 'สารบัญ',
        tocColPage: 'หน้า',
        tocSec1: '1. บทนำ',
        tocSec2: '2. การดำเนินการ',
        tocSec3: `3. รายละเอียดการตรวจสอบ (ตารางที่ 1 จำนวน ${total} ข้อ)`,
        tocSec4: '4. สรุป / ข้อเสนอแนะ (ตารางที่ 2)',
        sec1Title: '1. บทนำ',
        fig1Caption: 'รูปที่ 1: ภาพแสดงตำแหน่งที่ตั้งโครงการ',
        fig2Caption: 'รูปที่ 2: ภาพด้านหน้าบ้าน',
        noFig1: 'ยังไม่ได้แนบภาพตำแหน่งที่ตั้งโครงการ',
        noFig2: 'ยังไม่ได้แนบภาพด้านหน้าบ้าน',
        sec2Title: '2. การดำเนินการ',
        sec2Cont: '2. การดำเนินการ (ภาพแปลน Zone เพิ่มเติม)',
        fig3Caption: 'รูปที่ 3: ภาพประกอบ Zone ต่างๆ ภายในบ้าน',
        sec3Title: '3. รายละเอียดการตรวจสอบ',
        sec3Cont: '3. รายละเอียดการตรวจสอบ (ต่อ)',
        t1Caption: 'ตารางที่ 1 รายการตรวจสอบ',
        t1CaptionCont: 'ตารางที่ 1 รายการตรวจสอบ (ต่อ)',
        colSeq: 'ลำดับที่',
        colCheck1: 'ตรวจครั้งที่ 1',
        colProblem: 'ปัญหา',
        colCheck2: 'ตรวจครั้งที่ 2',
        colStatusGroup: 'สถานะการตรวจสอบ',
        colFixed: 'แก้แล้ว',
        colPartial: 'แก้แล้วแต่ไม่เรียบร้อย',
        colUnfixed: 'ยังไม่แก้',
        causePrefix: 'สาเหตุ:',
        solutionPrefix: 'วิธีแก้ไข:',
        noImg: 'ไม่มีรูป',
        pendingImg: '-',
        emptyDefects: 'ยังไม่มีรายการ Defect ในโครงการนี้',
        sec4Title: '4. สรุป / ข้อเสนอแนะ',
        sec4Lead:
          'สรุปผลการตรวจสอบตามขั้นตอนการดำเนินการตรวจรับบ้านและระบบประกอบอาคาร ดังแสดงในตารางที่ 2:',
        t2Caption: 'ตารางที่ 2 ตรวจสอบเนื้อหาการดำเนินการ',
        t2ColNo: 'ลำดับ',
        t2ColItem: 'รายการ',
        t2ColFinding: 'สิ่งที่พบ',
        statTotal: 'ทั้งหมด',
        statUrgent: 'เร่งด่วน',
        statPending: 'รอแก้ไข/กำลังแก้ไข',
        statFixed: 'แก้ไขแล้ว',
        itemsUnit: 'ข้อ',
        projectLabel: 'โครงการ',
      };

  const perPage = custom.defectsPerPage === 'auto' ? 5 : custom.defectsPerPage;
  const defectChunks: DefectItem[][] = [];
  if (filteredDefects.length === 0) {
    defectChunks.push([]);
  } else {
    let currentChunk: DefectItem[] = [];
    let currentHeight = 0;
    const getPageBudget = (chunkIndex: number) => (chunkIndex === 0 ? 835 : 865);

    filteredDefects.forEach((d) => {
      const flName = getFloorNameById(proj, d.floorId);
      const estH = estimateDefectRowHeight(
        d,
        flName,
        custom.showCauseDetails,
        custom.showSolutionDetails,
        L.causePrefix,
        L.solutionPrefix
      );
      const budget = getPageBudget(defectChunks.length);
      if (
        currentChunk.length > 0 &&
        (currentChunk.length >= perPage || currentHeight + estH > budget)
      ) {
        defectChunks.push(currentChunk);
        currentChunk = [d];
        currentHeight = estH;
      } else {
        currentChunk.push(d);
        currentHeight += estH;
      }
    });
    if (currentChunk.length > 0) {
      defectChunks.push(currentChunk);
    }
  }

  // Build Zone Cards for Section 2 (Figure 3)
  const zoneCards: Array<{ title: string; imgSrc: string }> = [];
  proj.floors.forEach((fl) => {
    const zSrc = assets?.floorplanZonePngMap?.[fl.id] || assets?.floorplanPngMap?.[fl.id] || fl.imageUrl || '';
    if (zSrc) {
      zoneCards.push({ title: fl.name, imgSrc: zSrc });
    }
  });
  rb.extraZonePlanImgs.forEach((rawSrc, idx) => {
    const cleanSrc = sanitizeReportImageUrl(rawSrc);
    if (cleanSrc) {
      zoneCards.push({
        title: isEn ? `Additional Zone Plan ${idx + 1}` : `ภาพแปลนเพิ่มเติม ${idx + 1}`,
        imgSrc: cleanSrc,
      });
    }
  });

  const zonePageChunks: Array<Array<{ title: string; imgSrc: string }>> = [];
  if (zoneCards.length === 0) {
    zonePageChunks.push([]);
  } else {
    zonePageChunks.push(zoneCards.slice(0, 4));
    for (let i = 4; i < zoneCards.length; i += 6) {
      zonePageChunks.push(zoneCards.slice(i, i + 6));
    }
  }

  const anySectionEnabled =
    custom.includeCover ||
    custom.includeToc ||
    custom.includeIntro ||
    custom.includeStepsAndZones ||
    custom.includeDefectTable ||
    custom.includeSummaryTable2;

  const showCover = custom.includeCover;
  const showToc = custom.includeToc;
  const showIntro = custom.includeIntro;
  const showSteps = custom.includeStepsAndZones;
  const showDefects = custom.includeDefectTable || !anySectionEnabled;
  const showSummary = custom.includeSummaryTable2;

  let nextPageNum = 1;
  const sec1Page = showIntro ? nextPageNum++ : 0;
  const sec2StartPage = showSteps ? nextPageNum : 0;
  const sec2PageCount = showSteps ? zonePageChunks.length : 0;
  if (showSteps) {
    nextPageNum += sec2PageCount;
  }
  const sec3StartPage = showDefects ? nextPageNum : 0;
  const defectPageCount = showDefects ? defectChunks.length : 0;
  if (showDefects) {
    nextPageNum += defectPageCount;
  }
  const sec3EndPage = showDefects ? sec3StartPage + defectPageCount - 1 : 0;
  const sec4Page = showSummary ? nextPageNum++ : 0;

  const tocPageLabel = isEn ? 'i' : 'ก';

  const renderPageHeaderStrip = (sectionTag: string) => `
    <table style="width:100%; border-collapse:collapse; border-bottom:2px solid ${accentHex}; margin-bottom:10px;">
      <tr>
        <td style="width:42px; vertical-align:middle; padding-bottom:6px;">
          ${
            logoImgSrc
              ? `<img src="${logoImgSrc}" width="36" height="36" style="width:36px; height:36px; object-fit:contain; display:block;" />`
              : ''
          }
        </td>
        <td style="vertical-align:middle; padding-left:8px; padding-bottom:6px;">
          <div style="font-size:15px; font-weight:800; color:${accentHex}; line-height:1.2;">${escapeHtml(brand.companyName)}</div>
          <div style="font-size:11.9px; color:#475569;">${escapeHtml(rb.coverTitle)}</div>
        </td>
        <td style="vertical-align:middle; text-align:right; padding-bottom:6px;">
          <span style="display:inline-block; padding:3px 10px 5px; text-align:center; vertical-align:middle; line-height:1.4; border-radius:4px; background:#eff6ff; border:1px solid #bfdbfe; color:${accentHex}; font-size:12.5px; font-weight:700;">
            ${escapeHtml(sectionTag)}
          </span>
        </td>
      </tr>
    </table>
  `;

  const customFooterNoteHtml = custom.customFooterNote.trim()
    ? `<div style="margin-top:2px; font-size:11.9px; color:#64748b;">${escapeHtml(custom.customFooterNote.trim())}</div>`
    : '';

  const renderStandardFooter = (pageLabel: string) => `
    <div style="margin-top:auto; padding-top:10px; border-top:1px solid #e2e8f0;">
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="vertical-align:bottom; text-align:left; font-size:12.5px; color:#475569;">
            <div>${escapeHtml(brand.companyName)} | ${escapeHtml(brand.contactInfo)}</div>
            ${customFooterNoteHtml}
            <div style="margin-top:2px; font-weight:700; color:${accentHex}; font-size:13.8px;">
              ${L.pageWord} ${escapeHtml(pageLabel)}
            </div>
          </td>
          <td style="vertical-align:bottom; text-align:right; font-size:13.1px; color:#0f172a; line-height:1.35;">
            <div style="font-weight:700;">( ${escapeHtml(brand.inspectorName)} )</div>
            <div style="color:#334155;">${escapeHtml(brand.licenseNo)} &nbsp; ${L.inspectorWord}</div>
          </td>
        </tr>
      </table>
    </div>
  `;

  const wrapPage = (
    id: string,
    pageLabel: string,
    bodyHtml: string,
    isCover = false
  ): BuiltReportPage => {
    const inner = isCover
      ? `<div class="report-page report-a4-page" style="width:794px; height:1123px; padding:34px 38px 28px 38px; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; background:#ffffff; color:#0f172a; font-family:'TH Sarabun New', Tahoma, sans-serif;">
          ${bodyHtml}
        </div>`
      : `<div class="report-page report-a4-page" style="width:794px; height:1123px; padding:34px 38px 28px 38px; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; background:#ffffff; color:#0f172a; font-family:'TH Sarabun New', Tahoma, sans-serif;">
          <div style="flex:0 0 auto;">${bodyHtml}</div>
          ${renderStandardFooter(pageLabel)}
        </div>`;

    return { id, pageLabel, isCover, html: inner };
  };

  const pages: BuiltReportPage[] = [];

  /* --------------------------------------------------------------------------
   * COVER PAGE
   * -------------------------------------------------------------------------- */
  const coverBody = `
    <div style="border:2px solid ${accentHex}; border-radius:10px; padding:26px 28px; flex:1; min-height:0; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; background:#ffffff;">
      <div style="text-align:center; border-bottom:3px solid ${accentHex}; padding-bottom:16px;">
        ${
          logoImgSrc
            ? `<div style="margin-bottom:8px;"><img src="${logoImgSrc}" width="88" height="88" style="width:88px; height:88px; object-fit:contain; display:inline-block;" /></div>`
            : ''
        }
        <div style="font-size:28.8px; font-weight:800; color:${accentHex}; letter-spacing:0.5px;">
          ${escapeHtml(brand.companyName)}
        </div>
        <div style="font-size:15px; color:#334155; margin-top:4px;">
          ${escapeHtml(brand.tagline)}
        </div>
        <div style="font-size:13.8px; color:#64748b; margin-top:3px;">
          ${escapeHtml(brand.contactInfo)}
        </div>
      </div>

      <div style="text-align:center; padding:14px 8px;">
        ${
          coverGraphicSrc
            ? `<div style="margin:0 auto 18px auto;"><img data-pdf-photo="true" src="${coverGraphicSrc}" style="max-width:460px; max-height:300px; width:auto; height:auto; object-fit:contain; display:inline-block;" /></div>`
            : ''
        }
        <div style="font-size:32.5px; font-weight:800; color:#0f172a; line-height:1.3; margin-bottom:10px;">
          ${escapeHtml(rb.coverTitle)}
        </div>
        <div style="display:inline-block; padding:5px 18px 8px; text-align:center; vertical-align:middle; line-height:1.4; border-radius:6px; background:#eff6ff; border:1.5px solid ${accentHex}; color:${accentHex}; font-size:16.9px; font-weight:700; margin-bottom:20px;">
          ${escapeHtml(rb.propertyCondition)}
        </div>

        <table style="width:94%; margin:0 auto; border-collapse:collapse; table-layout:fixed; text-align:left; font-size:15.6px; background:#f8fafc;">
          <colgroup>
            <col style="width:34%;" />
            <col style="width:66%;" />
          </colgroup>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; font-weight:700; color:${accentHex}; background:#eff6ff;">
              ${L.locationLabel}
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; color:#0f172a;">
              ${escapeHtml(rb.locationText)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; font-weight:700; color:${accentHex}; background:#eff6ff;">
              ${L.clientLabel}
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; color:#0f172a; font-weight:700;">
              ${escapeHtml(rb.clientName)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; font-weight:700; color:${accentHex}; background:#eff6ff;">
              ${L.dateLabel}
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; color:#0f172a;">
              ${escapeHtml(rb.inspectionDate)}
            </td>
          </tr>
        </table>
      </div>

      <div style="border-top:2px solid #cbd5e1; padding-top:14px; text-align:center;">
        <div style="font-size:17.5px; font-weight:800; color:#0f172a;">
          ${L.preparedBy} &nbsp; ${escapeHtml(brand.inspectorName)}
        </div>
        <div style="font-size:14.4px; color:#475569; margin-top:3px;">
          ${escapeHtml(brand.licenseNo)} &nbsp;|&nbsp; ${escapeHtml(brand.companyName)}
        </div>
      </div>
    </div>
  `;
  if (showCover) {
    pages.push(wrapPage('page-cover', '', coverBody, true));
  }

  /* --------------------------------------------------------------------------
   * TABLE OF CONTENTS PAGE (หน้า ก)
   * -------------------------------------------------------------------------- */
  const sec3Range =
    sec3StartPage === sec3EndPage ? String(sec3StartPage) : `${sec3StartPage} - ${sec3EndPage}`;

  const tocItems: Array<{ label: string; page: string }> = [];
  if (showIntro) tocItems.push({ label: L.tocSec1, page: String(sec1Page) });
  if (showSteps) tocItems.push({ label: L.tocSec2, page: String(sec2StartPage) });
  if (showDefects) tocItems.push({ label: L.tocSec3, page: sec3Range });
  if (showSummary) tocItems.push({ label: L.tocSec4, page: String(sec4Page) });

  const tocRowsHtml = tocItems
    .map(
      (item, idx) => `
        <tr style="${idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
          <td style="border:1px solid #cbd5e1; padding:11px 14px; font-weight:700; color:#0f172a; ${idx % 2 === 1 ? 'background:#f8fafc;' : ''}">${escapeHtml(item.label)}</td>
          <td style="border:1px solid #cbd5e1; padding:11px 14px; text-align:center; font-weight:700; color:${accentHex}; ${idx % 2 === 1 ? 'background:#f8fafc;' : ''}">${escapeHtml(item.page)}</td>
        </tr>
      `
    )
    .join('');

  const tocBody = `
    ${renderPageHeaderStrip(L.tocTitle)}
    <div style="padding:8px 2px;">
      <h2 style="font-size:26.3px; font-weight:800; color:${accentHex}; text-align:center; margin:6px 0 18px 0; border-bottom:2px solid ${accentHex}; padding-bottom:10px;">
        ${L.tocTitle}
      </h2>

      <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:16.3px; margin-bottom:22px;">
        <colgroup>
          <col style="width:82%;" />
          <col style="width:18%;" />
        </colgroup>
        <thead>
          <tr style="background:${accentHex}; color:#ffffff;">
            <th style="border:1px solid #cbd5e1; padding:7px 14px 10px; text-align:center; vertical-align:middle; line-height:1.4; color:#ffffff; background:${accentHex};">${L.tocColTopic}</th>
            <th style="border:1px solid #cbd5e1; padding:7px 14px 10px; text-align:center; vertical-align:middle; line-height:1.4; color:#ffffff; background:${accentHex};">${L.tocColPage}</th>
          </tr>
        </thead>
        <tbody>
          ${tocRowsHtml}
        </tbody>
      </table>

      <div style="border:1px solid #bfdbfe; border-radius:8px; background:#eff6ff; padding:14px 16px;">
        <div style="font-size:16.3px; font-weight:800; color:${accentHex}; margin-bottom:8px;">
          ${L.projectLabel}: ${escapeHtml(rb.coverTitle)}
        </div>
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:15px; background:#ffffff;">
          <colgroup>
            <col style="width:25%;" />
            <col style="width:25%;" />
            <col style="width:25%;" />
            <col style="width:25%;" />
          </colgroup>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">
              <div style="color:#64748b; font-size:13.1px;">${L.statTotal}</div>
              <div style="font-size:22.5px; font-weight:800; color:#0f172a;">${total}</div>
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">
              <div style="color:#64748b; font-size:13.1px;">${L.statUrgent}</div>
              <div style="font-size:22.5px; font-weight:800; color:#dc2626;">${urgent}</div>
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">
              <div style="color:#64748b; font-size:13.1px;">${L.statPending}</div>
              <div style="font-size:22.5px; font-weight:800; color:#d97706;">${pending}</div>
            </td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">
              <div style="color:#64748b; font-size:13.1px;">${L.statFixed}</div>
              <div style="font-size:22.5px; font-weight:800; color:#059669;">${fixed}</div>
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;
  if (showToc) {
    pages.push(wrapPage('page-toc', tocPageLabel, tocBody));
  }

  /* --------------------------------------------------------------------------
   * SECTION 1: INTRODUCTION (หน้า 1)
   * -------------------------------------------------------------------------- */
  const sanitizedLocImg = sanitizeReportImageUrl(rb.locationMapImg);
  const sanitizedFrontImg = sanitizeReportImageUrl(rb.frontHouseImg);

  const renderIntroFigure = (src: string, caption: string, emptyText: string) => `
    <div style="border:1px solid #cbd5e1; border-radius:6px; padding:8px; background:#ffffff; text-align:center;">
      ${
        src
          ? `<div style="width:100%; height:242px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto;">
              <img data-pdf-photo="true" src="${src}" width="310" style="max-width:100%; max-height:240px; width:auto; height:auto; object-fit:contain; display:block; margin:0 auto;" />
            </div>`
          : `<div style="width:100%; height:180px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:14.4px; padding:20px;">${escapeHtml(emptyText)}</div>`
      }
      <div style="font-size:13.8px; font-weight:700; color:#334155; margin-top:6px;">
        ${escapeHtml(caption)}
      </div>
    </div>
  `;

  const sec1Body = `
    ${renderPageHeaderStrip(L.sec1Title)}
    <h2 style="font-size:21.3px; font-weight:800; color:${accentHex}; margin:0 0 8px 0;">
      ${L.sec1Title}
    </h2>
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:14.4px; margin-bottom:10px; background:#f8fafc;">
      <colgroup>
        <col style="width:54%;" />
        <col style="width:46%;" />
      </colgroup>
      <tr>
        <td style="border:1px solid #cbd5e1; padding:6px 10px;"><strong>${L.projectLabel}:</strong> ${escapeHtml(rb.coverTitle)}</td>
        <td style="border:1px solid #cbd5e1; padding:6px 10px;"><strong>${L.clientLabel}:</strong> ${escapeHtml(rb.clientName)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #cbd5e1; padding:6px 10px;"><strong>${L.locationLabel}:</strong> ${escapeHtml(rb.locationText)}</td>
        <td style="border:1px solid #cbd5e1; padding:6px 10px;"><strong>${L.dateLabel}:</strong> ${escapeHtml(rb.inspectionDate)}</td>
      </tr>
    </table>

    <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:10px;">
      <colgroup>
        <col style="width:50%;" />
        <col style="width:50%;" />
      </colgroup>
      <tr>
        <td style="vertical-align:top; padding-right:6px;">
          ${renderIntroFigure(sanitizedLocImg, L.fig1Caption, L.noFig1)}
        </td>
        <td style="vertical-align:top; padding-left:6px;">
          ${renderIntroFigure(sanitizedFrontImg, L.fig2Caption, L.noFig2)}
        </td>
      </tr>
    </table>

    <div style="border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc; padding:11px 14px; font-size:15px; line-height:1.65; color:#0f172a; white-space:pre-line; text-align:justify;">
      ${escapeHtml(rb.introContent)}
    </div>
  `;
  if (showIntro) {
    pages.push(wrapPage('page-sec1', String(sec1Page), sec1Body));
  }

  /* --------------------------------------------------------------------------
   * SECTION 2: OPERATIONS & ZONE FLOORPLANS (หน้า 2)
   * -------------------------------------------------------------------------- */
  const cleanedSteps = rb.inspectionSteps
    .map((s) => stripLeadingStepNumber(s))
    .filter((s) => s.length > 0);

  const stepsHtml = cleanedSteps
    .map(
      (step, idx) => `
        <tr>
          <td style="width:28px; vertical-align:top; padding:3px 4px; font-weight:700; color:${accentHex};">${idx + 1}.</td>
          <td style="vertical-align:top; padding:3px 4px; color:#0f172a; line-height:1.45;">${escapeHtml(step)}</td>
        </tr>
      `
    )
    .join('');

  if (showSteps) {
    zonePageChunks.forEach((cardsChunk, zIdx) => {
      const pageNumStr = String(sec2StartPage + zIdx);
      const zoneImgBoxH =
        zIdx === 0 ? (cardsChunk.length <= 2 ? 250 : 196) : 215;

      const zoneRowsHtml: string[] = [];
      for (let i = 0; i < cardsChunk.length; i += 2) {
        const pair = cardsChunk.slice(i, i + 2);
        zoneRowsHtml.push(`
          <tr>
            ${pair
              .map(
                (card) => `
                  <td style="width:50%; vertical-align:top; padding:4px;">
                    <div style="border:1px solid #cbd5e1; border-radius:6px; padding:7px; background:#ffffff; text-align:center;">
                      <div style="font-size:13.8px; font-weight:700; color:#0f172a; margin-bottom:5px;">${escapeHtml(card.title)}</div>
                      <div style="width:100%; height:${zoneImgBoxH}px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto;">
                        <img data-pdf-photo="true" src="${card.imgSrc}" width="320" style="max-width:100%; max-height:${zoneImgBoxH - 2}px; width:auto; height:auto; object-fit:contain; display:block; margin:0 auto;" />
                      </div>
                    </div>
                  </td>
                `
              )
              .join('')}
            ${pair.length === 1 ? '<td style="width:50%;"></td>' : ''}
          </tr>
        `);
      }

      const sec2Body =
        zIdx === 0
          ? `
            ${renderPageHeaderStrip(L.sec2Title)}
            <h2 style="font-size:21.3px; font-weight:800; color:${accentHex}; margin:0 0 8px 0;">
              ${L.sec2Title}
            </h2>

            <div style="border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc; padding:9px 13px; margin-bottom:12px;">
              <table style="width:100%; border-collapse:collapse; font-size:14.4px;">
                <tbody>${stepsHtml}</tbody>
              </table>
            </div>

            <div style="font-size:15px; font-weight:800; color:${accentHex}; margin-bottom:6px; text-align:center;">
              ${escapeHtml(L.fig3Caption)}
            </div>
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              <colgroup>
                <col style="width:50%;" />
                <col style="width:50%;" />
              </colgroup>
              <tbody>${zoneRowsHtml.join('')}</tbody>
            </table>
          `
          : `
            ${renderPageHeaderStrip(L.sec2Cont)}
            <div style="font-size:15.6px; font-weight:800; color:${accentHex}; margin-bottom:8px; text-align:center;">
              ${escapeHtml(L.fig3Caption)}
            </div>
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
              <colgroup>
                <col style="width:50%;" />
                <col style="width:50%;" />
              </colgroup>
              <tbody>${zoneRowsHtml.join('')}</tbody>
            </table>
          `;

      pages.push(wrapPage(`page-sec2-${zIdx + 1}`, pageNumStr, sec2Body));
    });
  }

  /* --------------------------------------------------------------------------
   * SECTION 3: INSPECTION DETAILS — TABLE 1 (7 COLUMNS, LOCKED COLGROUP)
   * -------------------------------------------------------------------------- */
  if (showDefects) {
    defectChunks.forEach((chunk, chunkIdx) => {
      const pageNumStr = String(sec3StartPage + chunkIdx);
      const heading = chunkIdx === 0 ? L.sec3Title : L.sec3Cont;
      const caption = chunkIdx === 0 ? L.t1Caption : L.t1CaptionCont;
      const available=chunkIdx===0?835:865;
      const estimated=chunk.reduce((sum,d)=>sum+estimateDefectRowHeight(d,getFloorNameById(proj,d.floorId),custom.showCauseDetails,custom.showSolutionDetails,L.causePrefix,L.solutionPrefix),0);
      // Expand photo rows into unused page area without forcing extra rows or cutting off long notes.
      const photoBoxH=chunk.length>=3?Math.min(205,150+Math.max(0,Math.floor((available-estimated-25)/chunk.length))):150;

      const rowsHtml =
        chunk.length === 0
          ? `<tr><td colspan="7" style="border:1px solid #cbd5e1; padding:24px; text-align:center; color:#64748b;">${L.emptyDefects}</td></tr>`
          : chunk
              .map((d, idx) => {
                const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
                const isFixed = d.status === 'แก้ไขแล้ว';
                const isPartial = d.status === 'กำลังแก้ไข';
                const isUnfixed = d.status === 'รอแก้ไข';
                const flName = getFloorNameById(proj, d.floorId);

                const zoneLabel = (d.zone || flName || '').trim();
                const cleanTitle = stripZonePrefixFromTitle(d.title, zoneLabel);
                const cleanCause = (d.cause || '').trim();
                const cleanSolution = (d.solution || '').trim();

                const normTitle = normalizeReportText(cleanTitle);
                const normCause = normalizeReportText(cleanCause);
                const normSolution = normalizeReportText(cleanSolution);

                const showCause =
                  custom.showCauseDetails &&
                  !d.hideCause &&
                  cleanCause.length > 0 &&
                  normCause !== normTitle;
                const showSolution =
                  custom.showSolutionDetails &&
                  !d.hideSolution &&
                  cleanSolution.length > 0 &&
                  normSolution !== normTitle &&
                  (!showCause || normSolution !== normCause);

                const beforeSrc = resolveDefectPhoto(d, 'before');
                const afterSrc = resolveDefectPhoto(d, 'after');

                return `
                  <tr style="break-inside:avoid; page-break-inside:avoid; height:auto; background:${rowBg};">
                    <td style="border:1px solid #cbd5e1; padding:6px 4px; text-align:center; vertical-align:middle; font-weight:800; font-size:14.4px; color:#0f172a; background:${rowBg}; height:auto;">
                      ${d.number}
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 8px; text-align:center; vertical-align:middle; background:${rowBg}; height:auto;">
                      ${
                        beforeSrc
                          ? `<div style="width:100%; height:${photoBoxH}px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto;">
                              <img data-pdf-photo="true" src="${beforeSrc}" width="174" style="max-width:100%; max-height:${photoBoxH-2}px; width:auto; height:auto; object-fit:contain; display:block; margin:0 auto;" />
                            </div>`
                          : `<div style="width:100%; height:${photoBoxH}px; background-color:#f8fafc; border:1px dashed #cbd5e1; border-radius:4px; display:flex; align-items:center; justify-content:center; margin:0 auto; color:#94a3b8; font-size:12.5px;">${L.noImg}</div>`
                      }
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 8px; vertical-align:top; text-align:left; line-height:1.45; background:${rowBg}; height:auto; word-break:break-word;">
                      <div style="font-weight:800; font-size:13.1px; color:${accentHex}; line-height:1.35; margin-bottom:2px;">
                        ${escapeHtml(zoneLabel)}
                      </div>
                      <div style="font-size:11.9px; color:#64748b; line-height:1.3; margin-bottom:3px;">
                        ${escapeHtml(flName)} · ${escapeHtml(translateSeverity(d.severity, lang))}
                      </div>
                      <div style="font-weight:700; font-size:13.1px; color:#0f172a; line-height:1.45;">
                        ${escapeHtml(cleanTitle)}
                      </div>
                      ${
                        showCause
                          ? `<div style="font-size:11.9px; color:#334155; margin-top:3px; line-height:1.4;"><strong>${L.causePrefix}</strong> ${escapeHtml(cleanCause)}</div>`
                          : ''
                      }
                      ${
                        showSolution
                          ? `<div style="font-size:11.9px; color:#065f46; margin-top:3px; line-height:1.4;"><strong>${L.solutionPrefix}</strong> ${escapeHtml(cleanSolution)}</div>`
                          : ''
                      }
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 8px; text-align:center; vertical-align:middle; background:${rowBg}; height:auto;">
                      ${
                        afterSrc
                          ? `<div style="width:100%; height:${photoBoxH}px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto;">
                              <img data-pdf-photo="true" src="${afterSrc}" width="140" style="max-width:100%; max-height:${photoBoxH-2}px; width:auto; height:auto; object-fit:contain; display:block; margin:0 auto;" />
                            </div>`
                          : `<div style="width:100%; height:${photoBoxH}px; background-color:#f8fafc; border:1px dashed #e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; margin:0 auto; color:#94a3b8; font-size:13.8px;">${L.pendingImg}</div>`
                      }
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 4px; text-align:center; vertical-align:middle; background:${isFixed ? '#f0fdf4' : rowBg}; height:auto;">
                      ${
                        isFixed
                          ? '<span style="color:#059669; font-size:21.3px; font-weight:800; line-height:1;">✓</span>'
                          : ''
                      }
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 4px; text-align:center; vertical-align:middle; background:${isPartial ? '#fffbeb' : rowBg}; height:auto;">
                      ${
                        isPartial
                          ? '<span style="color:#d97706; font-size:21.3px; font-weight:800; line-height:1;">✓</span>'
                          : ''
                      }
                    </td>
                    <td style="border:1px solid #cbd5e1; padding:6px 4px; text-align:center; vertical-align:middle; background:${isUnfixed ? '#fef2f2' : rowBg}; height:auto;">
                      ${
                        isUnfixed
                          ? '<span style="color:#dc2626; font-size:21.3px; font-weight:800; line-height:1;">✓</span>'
                          : ''
                      }
                    </td>
                  </tr>
                `;
              })
              .join('');

      const sec3Body = `
        ${renderPageHeaderStrip(heading)}
        ${
          chunkIdx === 0
            ? `<h2 style="font-size:21.3px; font-weight:800; color:${accentHex}; margin:0 0 4px 0;">${L.sec3Title}</h2>`
            : ''
        }
        <div style="font-size:14.4px; font-weight:700; color:#334155; margin-bottom:6px;">
          ${escapeHtml(caption)}
        </div>
        <div style="text-align:right; font-size:12px; font-weight:700; color:${accentHex}; line-height:1.2; margin-bottom:3px;">${escapeHtml(L.colStatusGroup)}</div>

        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; height:auto;">
          <colgroup>
            <col style="width:5%;" />
            <col style="width:27%;" />
            <col style="width:28%;" />
            <col style="width:22%;" />
            <col style="width:6%;" />
            <col style="width:6%;" />
            <col style="width:6%;" />
          </colgroup>
          <thead>
            <tr>
              ${[L.colSeq,L.colCheck1,L.colProblem,L.colCheck2,L.colFixed,L.colPartial,L.colUnfixed].map((label,index)=>`<th style="border:1px solid #cbd5e1; height:52px; padding:4px 3px 7px; text-align:center; vertical-align:middle; color:#ffffff; background:${index<4?accentHex:'#1e40af'}; font-size:${index<4?15:13}px; font-weight:700; line-height:1.15; overflow-wrap:break-word;">${escapeHtml(label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;

      pages.push(wrapPage(`page-sec3-${chunkIdx + 1}`, pageNumStr, sec3Body));
    });
  }

  /* --------------------------------------------------------------------------
   * SECTION 4: SUMMARY / RECOMMENDATIONS & TABLE 2 (หน้าสุดท้าย)
   * -------------------------------------------------------------------------- */
  const table2RowsHtml = rb.table2Rows
    .map((row, idx) => {
      const cleanItem = stripLeadingStepNumber(row.item);
      return `
        <tr style="height:auto; background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
          <td style="border:1px solid #cbd5e1; padding:6px 8px; text-align:center; font-weight:700; color:#0f172a; vertical-align:middle; height:auto;">
            ${idx + 1}
          </td>
          <td style="border:1px solid #cbd5e1; padding:6px 8px; vertical-align:top; text-align:left; color:#0f172a; line-height:1.45; height:auto;">
            ${escapeHtml(cleanItem)}
          </td>
          <td style="border:1px solid #cbd5e1; padding:6px 8px; vertical-align:top; text-align:left; color:#1e3a8a; font-weight:600; line-height:1.45; height:auto;">
            ${escapeHtml(row.finding)}
          </td>
        </tr>
      `;
    })
    .join('');

  const sec4Body = `
    ${renderPageHeaderStrip(L.sec4Title)}
    <h2 style="font-size:21.3px; font-weight:800; color:${accentHex}; margin:0 0 8px 0;">
      ${L.sec4Title}
    </h2>
    <p style="font-size:15px; color:#334155; margin:0 0 10px 0; line-height:1.55;">
      ${escapeHtml(L.sec4Lead)}
    </p>

    <div style="font-size:15px; font-weight:700; color:${accentHex}; margin-bottom:6px;">
      ${escapeHtml(L.t2Caption)}
    </div>
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:13.8px; margin-bottom:14px; height:auto;">
      <colgroup>
        <col style="width:8%;" />
        <col style="width:58%;" />
        <col style="width:34%;" />
      </colgroup>
      <thead>
        <tr style="background:${accentHex}; color:#ffffff;">
          <th width="8%" style="border:1px solid #cbd5e1; padding:7px 8px; text-align:center; vertical-align:middle; color:#ffffff; background:${accentHex};">${L.t2ColNo}</th>
          <th width="58%" style="border:1px solid #cbd5e1; padding:7px 8px; text-align:left; vertical-align:middle; color:#ffffff; background:${accentHex};">${L.t2ColItem}</th>
          <th width="34%" style="border:1px solid #cbd5e1; padding:7px 8px; text-align:left; vertical-align:middle; color:#ffffff; background:${accentHex};">${L.t2ColFinding}</th>
        </tr>
      </thead>
      <tbody>
        ${table2RowsHtml}
      </tbody>
    </table>

    <div style="border:1px solid #bfdbfe; border-radius:8px; background:#eff6ff; padding:12px 14px;">
      <div style="font-size:15px; font-weight:800; color:${accentHex}; margin-bottom:6px;">
        ${L.statTotal}: ${total} ${L.itemsUnit} &nbsp;|&nbsp;
        ${L.statUrgent}: <span style="color:#dc2626;">${urgent}</span> ${L.itemsUnit} &nbsp;|&nbsp;
        ${L.statPending}: <span style="color:#d97706;">${pending}</span> ${L.itemsUnit} &nbsp;|&nbsp;
        ${L.statFixed}: <span style="color:#059669;">${fixed}</span> ${L.itemsUnit}
      </div>
      <div style="font-size:15px; line-height:1.65; color:#0f172a; white-space:pre-line; text-align:justify;">
        ${escapeHtml(rb.closingSummary)}
      </div>
    </div>
  `;
  if (showSummary) {
    pages.push(wrapPage('page-sec4', String(sec4Page), sec4Body));
  }

  return pages;
}

export function buildSharedReportHtml(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th',
  assets?: SharedReportAssets,
  reportBookInput?: ReportBookData
): string {
  const pages = buildSharedReportPages(proj, brand, lang, assets, reportBookInput);
  return pages
    .map((p, idx) =>
      idx === 0
        ? p.html
        : `<br clear="all" style="page-break-before:always;" />${p.html}`
    )
    .join('\n');
}

async function waitForImagesInDoc(doc: Document): Promise<void> {
  const imgs = Array.from(doc.querySelectorAll('img'));
  if (imgs.length === 0) return;

  await Promise.all(
    imgs.map(async (img) => {
      if (!(img.complete && img.naturalWidth > 0)) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
          };
          img.addEventListener('load', finish);
          img.addEventListener('error', finish);
          setTimeout(finish, 8000);
        });
      }
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          // Ignore decode failures for inline SVG or unsupported formats
        }
      }
    })
  );
}

/**
 * Renders the 5-part A4 Engineering Report Book inside an isolated <iframe> (zero Tailwind oklch),
 * capturing each .report-page one-by-one at approximately 300 DPI, then embedding
 * the stored photographs at native resolution in their report positions.
 */
export async function exportProjectPDF(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th',
  reportBookInput?: ReportBookData
): Promise<string> {
  const safeSlug = (proj.houseNo || 'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const fileName = `Inspection_Report_${safeSlug}.pdf`;
  const rb = reportBookInput || loadReportBookData(proj, lang);
  const assets = await prepareSharedReportAssets(proj, brand);
  const pages = buildSharedReportPages(proj, brand, lang, assets, rb);
  const joinedPagesHtml = pages.map((p) => p.html).join('\n');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '9998';
  iframe.style.background = '#ffffff';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Isolated PDF iframe document unavailable');
    }

    iframeDoc.open();
    iframeDoc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face { font-family:'TH Sarabun New'; font-style:normal; font-weight:400; src:local('TH Sarabun New'),local('TH SarabunNew'),local('THSarabunNew'),url('https://cdn.jsdelivr.net/gh/Phonbopit/sarabun-webfont@8d6f2f4223d025670b70aa344462971678516216/fonts/thsarabunnew-webfont.woff') format('woff'); }
      @font-face { font-family:'TH Sarabun New'; font-style:normal; font-weight:600 900; src:local('TH Sarabun New Bold'),local('TH SarabunNew Bold'),local('THSarabunNew-Bold'),url('https://cdn.jsdelivr.net/gh/Phonbopit/sarabun-webfont@8d6f2f4223d025670b70aa344462971678516216/fonts/thsarabunnew_bold-webfont.woff') format('woff'); }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 794px;
        background: #ffffff;
        color: #0f172a;
        font-family: 'TH Sarabun New', Tahoma, sans-serif;
      }
      table { border-collapse: collapse; }
      tr { break-inside: avoid; page-break-inside: avoid; }
    </style>
  </head>
  <body>${joinedPagesHtml}</body>
</html>`);
    iframeDoc.close();

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    if (iframeDoc.fonts?.ready) {
      const loaded=await Promise.all([iframeDoc.fonts.load("400 16px 'TH Sarabun New'",'ภาษาไทย'),iframeDoc.fonts.load("700 16px 'TH Sarabun New'",'ภาษาไทย')]);
      if(loaded.some(f=>!f.length))throw Error('TH Sarabun New font is unavailable; check your connection or installed fonts');
      await iframeDoc.fonts.ready;
    }
    await waitForImagesInDoc(iframeDoc);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const totalBodyHeight = Math.max(1123, iframeDoc.body.scrollHeight);
    iframe.style.height = `${totalBodyHeight}px`;
    await new Promise((resolve) => setTimeout(resolve, 80));

    const pageNodes = Array.from(iframeDoc.querySelectorAll('.report-page')) as HTMLElement[];
    if (pageNodes.length === 0) {
      throw new Error('No report pages generated');
    }

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;

    for (let i = 0; i < pageNodes.length; i++) {
      const node = pageNodes[i];
      const pageRect = node.getBoundingClientRect();
      // Keep the raster page as fallback. Overlay native image objects at the
      // measured contain-fit position; never crop or stretch the evidence photo.
      const photos = Array.from(node.querySelectorAll<HTMLImageElement>('img[data-pdf-photo]')).flatMap(img=>{
        if(!img.complete||!img.naturalWidth||!img.naturalHeight)return [];
        const rect=img.getBoundingClientRect();
        const ratio=Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
        const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;
        const x=rect.left-pageRect.left+(rect.width-w)/2,y=rect.top-pageRect.top+(rect.height-h)/2;
        if(w<=0||h<=0||x<0||y<0||x+w>794.5||y+h>1123.5)return [];
        // Do not overlay content that was clipped by an overflow-hidden ancestor.
        for(let parent=img.parentElement;parent&&parent!==node;parent=parent.parentElement){
          const style=iframe.contentWindow?.getComputedStyle(parent);
          if(style&&(/hidden|clip|scroll|auto/.test(style.overflowX)||/hidden|clip|scroll|auto/.test(style.overflowY))){
            const b=parent.getBoundingClientRect();
            if(pageRect.left+x<b.left-0.5||pageRect.top+y<b.top-0.5||pageRect.left+x+w>b.right+0.5||pageRect.top+y+h>b.bottom+0.5)return [];
          }
        }
        return [{img,x,y,w,h}];
      });
      const canvas = await html2canvas(node, {
        scale: 3.125,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        width: 794,
        height: 1123,
      });

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      try {
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
        for(const {img,x,y,w,h} of photos){
          let nativeCanvas:HTMLCanvasElement|null=null;
          try{
            let source=img.getAttribute('src')||'';
            let format='JPEG';
            if(/^data:image\/png;base64,/i.test(source)){format='PNG';}
            else if(/^data:image\/jpeg;base64,/i.test(source)){
              // Camera JPEGs can contain EXIF orientation that the PDF renderer
              // does not apply. Use the browser's oriented pixels in that case.
              const header=atob(source.split(',')[1].slice(0,Math.min(88000,source.split(',')[1].length)));
              if(header.includes('Exif\x00\x00'))format='';
            }else format='';
            if(!format){
              // Convert unsupported encodings without reducing image dimensions.
              // Bound temporary canvas size on memory-constrained devices.
              if(img.naturalWidth*img.naturalHeight>24000000)continue;
              nativeCanvas=document.createElement('canvas');
              nativeCanvas.width=img.naturalWidth;nativeCanvas.height=img.naturalHeight;
              const ctx=nativeCanvas.getContext('2d');if(!ctx)continue;
              ctx.drawImage(img,0,0);
              source=nativeCanvas.toDataURL('image/png');format='PNG';
            }
            pdf.addImage(source,format,x/794*pageWidthMm,y/1123*pageHeightMm,w/794*pageWidthMm,h/1123*pageHeightMm);
          }catch(error){console.warn('Native report photo unavailable; using high-resolution page fallback',error);}
          finally{if(nativeCanvas){nativeCanvas.width=0;nativeCanvas.height=0;}}
        }
      }finally{canvas.width=0;canvas.height=0;}
    }

    pdf.save(fileName);
    return fileName;
  } finally {
    iframe.remove();
  }
}

export async function exportProjectWord(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th',
  reportBookInput?: ReportBookData
): Promise<void> {
  const rb = reportBookInput || loadReportBookData(proj, lang);
  const assets = await prepareSharedReportAssets(proj, brand);
  const bodyHtml = buildSharedReportHtml(proj, brand, lang, assets, rb);

  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${escapeHtml(rb.coverTitle || proj.name)}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        body { font-family: 'TH Sarabun New', Tahoma, sans-serif; color: #0f172a; background: #ffffff; margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body>${bodyHtml}</body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeSlug = (proj.houseNo || 'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  a.download = `Inspection_Report_${safeSlug}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function estimateRowHeight(texts: Array<{ text: string; colWidth: number }>): number {
  let maxLines = 1;
  texts.forEach(({ text, colWidth }) => {
    if (!text) return;
    const charsPerLine = Math.max(8, Math.floor(colWidth * 0.85));
    const paragraphs = text.split(/\r?\n/);
    let totalLines = 0;
    paragraphs.forEach((p) => {
      totalLines += Math.max(1, Math.ceil(p.length / charsPerLine));
    });
    if (totalLines > maxLines) maxLines = totalLines;
  });
  return Math.min(240, Math.max(24, maxLines * 16 + 10));
}

export async function exportProjectExcel(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th'
): Promise<'xlsx' | 'csv'> {
  const sorted = [...proj.defects].sort((a, b) => (a.number || 0) - (b.number || 0));
  const isEn = lang === 'en';
  const safeSlug = (proj.houseNo || 'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');

  const total = sorted.length;
  const urgentCount = sorted.filter((d) => d.severity === 'เร่งด่วน').length;
  const pendingCount = sorted.filter((d) => d.status !== 'แก้ไขแล้ว').length;
  const fixedCount = sorted.filter((d) => d.status === 'แก้ไขแล้ว').length;

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = brand.companyName || 'TEAM INSPECTION SERVICES';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Defect List', {
      views: [{ state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:6', horizontalCentered: true },
    });

    // Exact 10 column widths matching spec
    const colWidths = [8, 14, 28, 38, 40, 42, 15, 16, 18, 18];
    colWidths.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    // Row 1: Company Name (Bold, size 16, #1E3A8A)
    ws.mergeCells('A1:J1');
    const r1 = ws.getCell('A1');
    r1.value = brand.companyName;
    r1.font = { name: 'TH Sarabun New', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
    r1.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 28;

    // Row 2: Project Name & House No.
    ws.mergeCells('A2:J2');
    const r2 = ws.getCell('A2');
    r2.value = isEn
      ? `Project: ${proj.name}  |  House No.: ${proj.houseNo}  |  Client: ${proj.clientName}`
      : `โครงการ: ${proj.name}  |  บ้านเลขที่: ${proj.houseNo}  |  ลูกค้า: ${proj.clientName}`;
    r2.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF0F172A' } };
    r2.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(2).height = 22;

    // Row 3: Inspector & Date
    ws.mergeCells('A3:J3');
    const r3 = ws.getCell('A3');
    r3.value = isEn
      ? `Inspector: ${brand.inspectorName} (${brand.licenseNo})  |  Inspection Date: ${proj.inspectionDate}  |  ${brand.contactInfo}`
      : `ผู้ตรวจสอบ: ${brand.inspectorName} (${brand.licenseNo})  |  วันที่ตรวจรับ: ${proj.inspectionDate}  |  ${brand.contactInfo}`;
    r3.font = { name: 'TH Sarabun New', size: 13, color: { argb: 'FF475569' } };
    r3.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(3).height = 20;

    // Row 4: Summary Stats Bar
    ws.mergeCells('A4:J4');
    const r4 = ws.getCell('A4');
    r4.value = isEn
      ? `Summary: Total ${total} items  |  Urgent: ${urgentCount}  |  Pending: ${pendingCount}  |  Fixed: ${fixedCount}`
      : `สรุปผลการตรวจสอบ: ทั้งหมด ${total} ข้อ  |  เร่งด่วน: ${urgentCount} ข้อ  |  รอแก้ไข: ${pendingCount} ข้อ  |  แก้ไขแล้ว: ${fixedCount} ข้อ`;
    r4.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
    r4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    r4.alignment = { vertical: 'middle', horizontal: 'left' };
    r4.border = {
      top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    };
    ws.getRow(4).height = 24;

    // Row 5: Blank spacer
    ws.getRow(5).height = 10;

    // Row 6: Table Header (#1E3A8A background, white bold centered, height 28)
    const headers = isEn
      ? [
          'No.',
          'Floor',
          'Zone',
          'Defect Item',
          'Engineering Cause',
          'Solution',
          'Severity',
          'Status',
          'Before Photo',
          'After Photo',
        ]
      : [
          'ข้อที่',
          'ชั้น',
          'โซน',
          'รายการ Defect',
          'สาเหตุทางวิศวกรรม',
          'วิธีแก้ไข',
          'ความรุนแรง',
          'สถานะ',
          'รูปก่อนแก้ไข',
          'รูปหลังแก้ไข',
        ];

    const headerRow = ws.getRow(6);
    headerRow.height = 32;
    const thinSlateBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    headers.forEach((title, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = title;
      cell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinSlateBorder;
    });

    // Data rows starting at Row 7
    sorted.forEach((d, idx) => {
      const flName = getFloorNameById(proj, d.floorId);
      const causeText = d.hideCause ? '' : d.cause || '';
      const solutionText = d.hideSolution ? '' : d.solution || '';
      const sevText = translateSeverity(d.severity, lang);
      const statusText = translateDefectStatus(d.status, lang);
      const beforeText = d.beforeImg
        ? isEn
          ? 'Attached'
          : 'มีรูปภาพ'
        : isEn
        ? 'None'
        : 'ไม่มี';
      const afterText = d.afterImg
        ? isEn
          ? 'Attached'
          : 'มีรูปภาพ'
        : isEn
        ? 'None'
        : 'ไม่มี';

      const row = ws.addRow([
        d.number,
        flName,
        d.zone,
        d.title,
        causeText,
        solutionText,
        sevText,
        statusText,
        beforeText,
        afterText,
      ]);

      const zebraArgb = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      row.height = estimateRowHeight([
        { text: d.zone, colWidth: colWidths[2] },
        { text: d.title, colWidth: colWidths[3] },
        { text: causeText, colWidth: colWidths[4] },
        { text: solutionText, colWidth: colWidths[5] },
      ]);

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'TH Sarabun New', size: 14, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraArgb } };
        cell.border = thinSlateBorder;
        const centerCols = colNumber === 1 || colNumber >= 7;
        cell.alignment = {
          vertical: 'middle',
          horizontal: centerCols ? 'center' : 'left',
          wrapText: true,
        };
      });

      // Highlight Severity column (Col 7)
      const sevCell = row.getCell(7);
      if (d.severity === 'เร่งด่วน') {
        sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        sevCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF991B1B' } };
      } else if (d.severity === 'เล็กน้อย') {
        sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        sevCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF1E40AF' } };
      } else {
        sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        sevCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF92400E' } };
      }

      // Highlight Status column (Col 8)
      const statusCell = row.getCell(8);
      if (d.status === 'แก้ไขแล้ว') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        statusCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF166534' } };
      } else if (d.status === 'กำลังแก้ไข') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        statusCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF1E40AF' } };
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        statusCell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FF92400E' } };
      }
    });

    const lastRowNumber = Math.max(6, 6 + sorted.length);
    ws.autoFilter = {
      from: 'A6',
      to: `J${lastRowNumber}`,
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Inspection_Report_${safeSlug}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'xlsx';
  } catch (err) {
    console.warn('ExcelJS export fallback to CSV:', err);
    const headers = isEn
      ? ['No.', 'Floor', 'Zone', 'Defect Item', 'Engineering Cause', 'Solution', 'Severity', 'Status', 'Before Photo', 'After Photo']
      : ['ข้อที่', 'ชั้น', 'โซน', 'รายการ Defect', 'สาเหตุทางวิศวกรรม', 'วิธีแก้ไข', 'ความรุนแรง', 'สถานะ', 'รูปก่อนแก้ไข', 'รูปหลังแก้ไข'];
    const csvRows = sorted.map((d) => [
      d.number,
      getFloorNameById(proj, d.floorId),
      d.zone,
      d.title,
      d.hideCause ? '' : d.cause || '',
      d.hideSolution ? '' : d.solution || '',
      translateSeverity(d.severity, lang),
      translateDefectStatus(d.status, lang),
      d.beforeImg ? (isEn ? 'Attached' : 'มีรูปภาพ') : isEn ? 'None' : 'ไม่มี',
      d.afterImg ? (isEn ? 'Attached' : 'มีรูปภาพ') : isEn ? 'None' : 'ไม่มี',
    ]);
    const csvLines = [
      headers.join(','),
      ...csvRows.map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ];
    const blob = new Blob(['\ufeff' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Inspection_Report_${safeSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'csv';
  }
}
