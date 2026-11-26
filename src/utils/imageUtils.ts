import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import type { AppLanguage, BrandConfig, ProjectFile } from '../types/inspection';
import { DEFAULT_GEAR_LOGO_SVG, getArchitecturalFloorSvg } from '../data/defaultData';
import { translateDefectStatus, translateSeverity } from '../i18n/translations';

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

export function compressImageFile(file: File, maxWidth = 960, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
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

export function buildPrintableReportHtml(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th',
  forWord = false
): string {
  const sorted = [...proj.defects].sort((a, b) => (a.number || 0) - (b.number || 0));
  const total = sorted.length;
  const urgent = sorted.filter((d) => d.severity === 'เร่งด่วน').length;
  const pending = sorted.filter((d) => d.status !== 'แก้ไขแล้ว').length;
  const fixed = sorted.filter((d) => d.status === 'แก้ไขแล้ว').length;
  const isEn = lang === 'en';

  const L = isEn
    ? {
        inspector: 'Inspector',
        project: 'Project',
        houseNo: 'House No.',
        address: 'Address',
        date: 'Inspection Date',
        summary: 'Inspection Summary',
        total: 'Total',
        urgent: 'Urgent',
        pending: 'Pending / In Progress',
        fixed: 'Fixed',
        items: 'items',
        floorplanHeading: 'Floorplan Defect Pin Map',
        pinsUnit: 'pins',
        tableHeading: 'Defect Inspection Schedule',
        colNo: '#',
        colDesc: 'Defect / Engineering Cause / Solution',
        colStatus: 'Severity / Status',
        colBefore: 'Before',
        colAfter: 'After',
        causePrefix: 'Cause:',
        solutionPrefix: 'Solution:',
        noImg: 'No photo',
        pendingImg: 'Not attached',
        emptyTable: 'No defect records',
      }
    : {
        inspector: 'ผู้ตรวจสอบ',
        project: 'โครงการ',
        houseNo: 'บ้านเลขที่',
        address: 'ที่อยู่',
        date: 'วันที่ตรวจ',
        summary: 'สรุปผลการตรวจสอบ',
        total: 'รายการทั้งหมด',
        urgent: 'ระดับเร่งด่วน',
        pending: 'รอ/กำลังแก้ไข',
        fixed: 'แก้ไขแล้ว',
        items: 'ข้อ',
        floorplanHeading: 'ผังแปลนตำแหน่ง Defect',
        pinsUnit: 'จุด',
        tableHeading: 'รายละเอียดรายการตรวจสอบ (Defect List)',
        colNo: 'ข้อ',
        colDesc: 'รายการ Defect / สาเหตุ / วิธีแก้ไข',
        colStatus: 'ระดับ / สถานะ',
        colBefore: 'ก่อนแก้ไข (Before)',
        colAfter: 'หลังแก้ไข (After)',
        causePrefix: 'สาเหตุ:',
        solutionPrefix: 'วิธีแก้ไข:',
        noImg: 'ไม่มีรูป',
        pendingImg: 'ยังไม่แนบรูป',
        emptyTable: 'ไม่มีรายการ Defect',
      };

  // Build 2-column table layout for floorplans so html2canvas + Word + print all render identically
  let floorPlansSection = '';
  if (!forWord && proj.floors.length > 0) {
    const floorCells: string[] = [];
    for (let i = 0; i < proj.floors.length; i += 2) {
      const pair = proj.floors.slice(i, i + 2);
      floorCells.push(`
        <tr class="print-break-inside-avoid">
          ${pair
            .map((fl) => {
              const flPins = sorted.filter((d) => d.floorId === fl.id);
              return `
                <td style="width:${pair.length === 2 ? '50%' : '100%'}; vertical-align:top; padding:4px;">
                  <div style="border:1px solid #cbd5e1; border-radius:8px; padding:8px; background:#ffffff;">
                    <div style="font-size:12px; font-weight:700; margin-bottom:6px; color:#0f172a;">
                      ${escapeHtml(fl.name)} (${flPins.length} ${L.pinsUnit})
                    </div>
                    <div style="position:relative; width:100%; height:245px; border:1px solid #e2e8f0; overflow:hidden; background:#f8fafc;">
                      ${
                        fl.imageUrl
                          ? `<img src="${fl.imageUrl}" style="width:100%; height:100%; object-fit:contain; display:block;" />`
                          : getArchitecturalFloorSvg(fl.svgPreset ?? 0)
                      }
                      ${flPins
                        .map((p) => {
                          const bg =
                            p.status === 'แก้ไขแล้ว'
                              ? '#059669'
                              : p.severity === 'เร่งด่วน'
                              ? '#e11d48'
                              : p.severity === 'เล็กน้อย'
                              ? '#2563eb'
                              : '#f59e0b';
                          return `<div style="position:absolute; left:${p.x}%; top:${p.y}%; transform:translate(-50%,-50%); width:18px; height:18px; border-radius:999px; background:${bg}; color:#ffffff; font-size:9px; font-weight:800; line-height:16px; text-align:center; border:1.5px solid #ffffff;">${p.number}</div>`;
                        })
                        .join('')}
                    </div>
                  </div>
                </td>
              `;
            })
            .join('')}
          ${pair.length === 1 && proj.floors.length > 1 ? '<td style="width:50%;"></td>' : ''}
        </tr>
      `);
    }

    floorPlansSection = `
      <div style="margin-bottom:18px;">
        <h3 style="font-size:15px; font-weight:700; color:${brand.accentColor}; border-bottom:2px solid ${brand.accentColor}; padding-bottom:4px; margin:0 0 8px 0;">
          ${L.floorplanHeading}
        </h3>
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
          <tbody>${floorCells.join('')}</tbody>
        </table>
      </div>
    `;
  }

  const tableRows = sorted
    .map((d) => {
      const flName = getFloorNameById(proj, d.floorId);
      const sevText = translateSeverity(d.severity, lang);
      const stText = translateDefectStatus(d.status, lang);
      return `
        <tr class="print-break-inside-avoid">
          <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; vertical-align:top; font-weight:700; color:#0f172a;">${d.number}</td>
          <td style="border:1px solid #cbd5e1; padding:6px; vertical-align:top;">
            <div style="font-weight:700; color:#0f172a;">${escapeHtml(d.title)}</div>
            <div style="font-size:11px; color:#475569; margin-top:2px;">${escapeHtml(flName)} · ${escapeHtml(d.zone)}</div>
            ${!d.hideCause && d.cause ? `<div style="font-size:11px; margin-top:4px; color:#334155;"><strong>${L.causePrefix}</strong> ${escapeHtml(d.cause)}</div>` : ''}
            ${!d.hideSolution && d.solution ? `<div style="font-size:11px; margin-top:3px; color:#065f46;"><strong>${L.solutionPrefix}</strong> ${escapeHtml(d.solution)}</div>` : ''}
          </td>
          <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; vertical-align:top; font-size:11px; color:#0f172a;">
            <div><strong>${escapeHtml(sevText)}</strong></div>
            <div style="margin-top:4px; color:#334155;">${escapeHtml(stText)}</div>
          </td>
          <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; vertical-align:top;">
            ${d.beforeImg ? `<img src="${d.beforeImg}" width="130" style="width:130px; height:96px; object-fit:cover; border-radius:4px; display:inline-block;" />` : `<span style="color:#94a3b8; font-size:10px;">${L.noImg}</span>`}
          </td>
          <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; vertical-align:top;">
            ${d.afterImg ? `<img src="${d.afterImg}" width="130" style="width:130px; height:96px; object-fit:cover; border-radius:4px; display:inline-block;" />` : `<span style="color:#94a3b8; font-size:10px;">${L.pendingImg}</span>`}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family:'Sarabun', Tahoma, sans-serif; color:#0f172a; background:#ffffff; line-height:1.45; padding:4px;">
      <table style="width:100%; border-collapse:collapse; border-bottom:3px solid ${brand.accentColor}; margin-bottom:14px;">
        <tr>
          <td style="width:74px; vertical-align:middle; padding-bottom:10px;">
            ${brand.customLogoDataUrl ? `<img src="${brand.customLogoDataUrl}" width="64" height="64" style="width:64px; height:64px; object-fit:contain;" />` : `<div style="width:64px; height:64px;">${forWord ? '' : DEFAULT_GEAR_LOGO_SVG}</div>`}
          </td>
          <td style="vertical-align:middle; padding-left:10px; padding-bottom:10px;">
            <div style="font-size:20px; font-weight:800; color:${brand.accentColor};">${escapeHtml(brand.companyName)}</div>
            <div style="font-size:12px; color:#334155;">${escapeHtml(brand.tagline)}</div>
            <div style="font-size:11px; color:#475569;">${L.inspector}: <strong>${escapeHtml(brand.inspectorName)}</strong> (${escapeHtml(brand.licenseNo)}) | ${escapeHtml(brand.contactInfo)}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px; background:#f8fafc;">
        <tr>
          <td style="border:1px solid #e2e8f0; padding:6px 8px;"><strong>${L.project}:</strong> ${escapeHtml(proj.name)}</td>
          <td style="border:1px solid #e2e8f0; padding:6px 8px;"><strong>${L.houseNo}:</strong> ${escapeHtml(proj.houseNo)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #e2e8f0; padding:6px 8px;"><strong>${L.address}:</strong> ${escapeHtml(proj.address)}</td>
          <td style="border:1px solid #e2e8f0; padding:6px 8px;"><strong>${L.date}:</strong> ${escapeHtml(proj.inspectionDate)}</td>
        </tr>
      </table>

      <div style="font-size:12px; margin-bottom:14px; padding:8px 10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px;">
        <strong>${L.summary}:</strong>
        ${L.total} <strong>${total}</strong> ${L.items} &nbsp;|&nbsp;
        ${L.urgent} <strong style="color:#dc2626;">${urgent}</strong> ${L.items} &nbsp;|&nbsp;
        ${L.pending} <strong style="color:#d97706;">${pending}</strong> ${L.items} &nbsp;|&nbsp;
        ${L.fixed} <strong style="color:#059669;">${fixed}</strong> ${L.items}
      </div>

      ${floorPlansSection}

      <h3 style="font-size:15px; font-weight:700; color:${brand.accentColor}; border-bottom:2px solid ${brand.accentColor}; padding-bottom:4px; margin:0 0 8px 0;">
        ${L.tableHeading}
      </h3>
      <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #cbd5e1; padding:6px; width:36px;">${L.colNo}</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">${L.colDesc}</th>
            <th style="border:1px solid #cbd5e1; padding:6px; width:82px;">${L.colStatus}</th>
            <th style="border:1px solid #cbd5e1; padding:6px; width:140px;">${L.colBefore}</th>
            <th style="border:1px solid #cbd5e1; padding:6px; width:140px;">${L.colAfter}</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || `<tr><td colspan="5" style="border:1px solid #cbd5e1; padding:16px; text-align:center;">${L.emptyTable}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function exportProjectPDF(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th'
): Promise<string> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const safeSlug = (proj.houseNo || 'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const fileName = `Inspection_Report_${safeSlug}.pdf`;
  const reportHtml = buildPrintableReportHtml(proj, brand, lang, false);

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.style.width = '760px';
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = '12px';
  wrapper.style.zIndex = '-1';
  wrapper.innerHTML = reportHtml;
  document.body.appendChild(wrapper);

  try {
    const pdfOptions: Record<string, unknown> = {
      margin: [10, 10, 10, 10],
      filename: fileName,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 784,
        onclone: (clonedDoc: Document) => {
          // Strip Tailwind v4 stylesheets containing oklch()/oklab() that html2canvas cannot parse
          const styles = Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'));
          styles.forEach((node) => {
            if (node.tagName === 'LINK') {
              const href = node.getAttribute('href') || '';
              if (!href.includes('fonts.googleapis.com')) {
                node.remove();
              }
            } else {
              const txt = node.textContent || '';
              if (txt.includes('oklch') || txt.includes('oklab') || txt.includes('--tw-')) {
                node.remove();
              }
            }
          });
          const cleanStyle = clonedDoc.createElement('style');
          cleanStyle.textContent = `
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: 'Sarabun', Tahoma, sans-serif; }
            .print-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; break-inside: avoid; }
          `;
          clonedDoc.head.appendChild(cleanStyle);
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    const worker = html2pdf() as unknown as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    };
    await worker.set(pdfOptions).from(wrapper).save();

    return fileName;
  } finally {
    wrapper.remove();
  }
}

export function exportProjectWord(
  proj: ProjectFile,
  brand: BrandConfig,
  lang: AppLanguage = 'th'
): void {
  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${escapeHtml(proj.name)}</title></head>
    <body>${buildPrintableReportHtml(proj, brand, lang, true)}</body></html>`;
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

export function exportProjectExcel(
  proj: ProjectFile,
  lang: AppLanguage = 'th'
): 'xlsx' | 'csv' {
  const sorted = [...proj.defects].sort((a, b) => (a.number || 0) - (b.number || 0));
  const isEn = lang === 'en';
  const rows = sorted.map((d) =>
    isEn
      ? {
          'No.': d.number,
          Floor: getFloorNameById(proj, d.floorId),
          Zone: d.zone,
          'Defect Item': d.title,
          'Engineering Cause': d.hideCause ? '' : d.cause || '',
          Solution: d.hideSolution ? '' : d.solution || '',
          Severity: translateSeverity(d.severity, lang),
          Status: translateDefectStatus(d.status, lang),
          'Before Photo': d.beforeImg ? 'Attached' : 'None',
          'After Photo': d.afterImg ? 'Attached' : 'None',
        }
      : {
          'ข้อที่': d.number,
          'ชั้น': getFloorNameById(proj, d.floorId),
          'โซน': d.zone,
          'รายการ Defect': d.title,
          'สาเหตุทางวิศวกรรม': d.hideCause ? '' : d.cause || '',
          'วิธีแก้ไข': d.hideSolution ? '' : d.solution || '',
          'ความรุนแรง': d.severity,
          'สถานะ': d.status,
          'รูปก่อนแก้ไข (Before)': d.beforeImg ? 'มีรูปภาพ' : 'ไม่มี',
          'รูปหลังแก้ไข (After)': d.afterImg ? 'มีรูปภาพ' : 'ไม่มี',
        }
  );

  const safeSlug = (proj.houseNo || 'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Defect List');
    XLSX.writeFile(wb, `Inspection_Report_${safeSlug}.xlsx`);
    return 'xlsx';
  } catch (err) {
    console.warn('XLSX export fallback to CSV:', err);
    const headers = Object.keys(rows[0] || (isEn ? { 'No.': '' } : { 'ข้อที่': '' }));
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(',')
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
