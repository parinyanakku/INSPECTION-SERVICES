import { workspaceStorage } from './workspaceStorage';
import type {
  AppLanguage,
  ProjectFile,
  ReportBookData,
  ReportCustomExportSettings,
  ReportTable2Row,
} from '../types/inspection';

export const REPORT_BOOK_STORAGE_PREFIX = 'tis_report_book_v1_';

export function isValidReportImageDataUrl(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    val.startsWith('data:image/') &&
    val !== 'data:,' &&
    val.length >= 100
  );
}

export function sanitizeReportImageUrl(val: unknown): string {
  return isValidReportImageDataUrl(val) ? val : '';
}

export function createDefaultCustomExportSettings(): ReportCustomExportSettings {
  return {
    includeCover: true,
    includeToc: true,
    includeIntro: true,
    includeStepsAndZones: true,
    includeDefectTable: true,
    includeSummaryTable2: true,
    defectsPerPage: 'auto',
    defectStatusFilter: 'all',
    defectSeverityFilter: 'all',
    defectSelectionMode: 'filter',
    selectedDefectIds: [],
    showCauseDetails: true,
    showSolutionDetails: true,
    customFooterNote: '',
  };
}

export const PROPERTY_CONDITION_OPTIONS: Record<AppLanguage, string[]> = {
  th: [
    'สภาพผ่านการใช้งาน',
    'บ้านใหม่ก่อนโอนกรรมสิทธิ์',
    'งานรีโนเวท/ต่อเติม',
    'ตรวจเช็กประกันหลังเข้าอยู่',
  ],
  en: [
    'Pre-owned / Occupied Property',
    'New Home Pre-Handover Inspection',
    'Renovation / Extension Inspection',
    'Warranty Follow-up Inspection',
  ],
};

export const ENGINEER_COVER_SVG = `
<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eff6ff" />
      <stop offset="100%" stop-color="#dbeafe" />
    </linearGradient>
    <linearGradient id="accentBlue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="420" height="260" rx="18" fill="url(#bgSky)" stroke="#bfdbfe" stroke-width="2" />
  <rect x="24" y="216" width="372" height="10" rx="5" fill="#cbd5e1" />

  <!-- Architectural 2-Storey House Wireframe -->
  <g transform="translate(170, 38)">
    <polygon points="105,6 14,54 196,54" fill="#1e3a8a" />
    <polygon points="105,14 28,54 182,54" fill="#2563eb" />
    <rect x="24" y="54" width="162" height="124" fill="#ffffff" stroke="#1e3a8a" stroke-width="3" rx="3" />
    <line x1="24" y1="114" x2="186" y2="114" stroke="#64748b" stroke-width="2.5" />
    <!-- Upper windows -->
    <rect x="40" y="70" width="46" height="32" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2" rx="2" />
    <line x1="63" y1="70" x2="63" y2="102" stroke="#1e3a8a" stroke-width="1.5" />
    <rect x="122" y="70" width="48" height="32" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2" rx="2" />
    <line x1="146" y1="70" x2="146" y2="102" stroke="#1e3a8a" stroke-width="1.5" />
    <!-- Lower door & window -->
    <rect x="42" y="130" width="42" height="48" fill="#1e3a8a" rx="2" />
    <circle cx="76" cy="155" r="2.5" fill="#facc15" />
    <rect x="106" y="128" width="62" height="34" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2" rx="2" />
    <!-- Blueprint dimension lines -->
    <line x1="10" y1="54" x2="10" y2="178" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3" />
    <line x1="6" y1="54" x2="14" y2="54" stroke="#94a3b8" stroke-width="1.5" />
    <line x1="6" y1="178" x2="14" y2="178" stroke="#94a3b8" stroke-width="1.5" />
  </g>

  <!-- Engineer Character Holding Blueprint & Clipboard -->
  <g transform="translate(52, 54)">
    <!-- Body / Engineering Vest -->
    <path d="M 32,82 C 32,68 88,68 88,82 L 95,162 L 25,162 Z" fill="url(#accentBlue)" />
    <path d="M 46,74 L 60,118 L 74,74 Z" fill="#ffffff" />
    <rect x="42" y="84" width="8" height="78" fill="#facc15" opacity="0.92" />
    <rect x="70" y="84" width="8" height="78" fill="#facc15" opacity="0.92" />
    <!-- Head & Face -->
    <circle cx="60" cy="46" r="21" fill="#fde68a" stroke="#1e3a8a" stroke-width="2" />
    <!-- Safety Helmet -->
    <path d="M 35,44 C 35,23 85,23 85,44 Z" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
    <rect x="31" y="41" width="58" height="6" rx="3" fill="#d97706" />
    <rect x="55" y="25" width="10" height="14" rx="2" fill="#fef3c7" />
    <!-- Rolled Blueprint Plan under Left Arm -->
    <g transform="translate(6, 98) rotate(-14)">
      <rect x="0" y="0" width="66" height="22" rx="4" fill="#ffffff" stroke="#1e3a8a" stroke-width="2.5" />
      <line x1="12" y1="7" x2="54" y2="7" stroke="#2563eb" stroke-width="2" />
      <line x1="12" y1="14" x2="42" y2="14" stroke="#64748b" stroke-width="2" />
      <ellipse cx="66" cy="11" rx="4" ry="11" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2" />
    </g>
    <!-- Inspection Clipboard in Right Hand -->
    <g transform="translate(76, 88)">
      <rect x="0" y="0" width="44" height="58" rx="4" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" />
      <rect x="13" y="-5" width="18" height="9" rx="2" fill="#475569" />
      <line x1="9" y1="15" x2="35" y2="15" stroke="#1e3a8a" stroke-width="2.5" />
      <line x1="9" y1="26" x2="35" y2="26" stroke="#94a3b8" stroke-width="2" />
      <line x1="9" y1="36" x2="30" y2="36" stroke="#94a3b8" stroke-width="2" />
      <path d="M 10,47 L 15,52 L 26,41" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </g>
</svg>
`;

export function createDefaultInspectionSteps(lang: AppLanguage = 'th'): string[] {
  if (lang === 'en') {
    return [
      'Inspect structural elements: foundation, columns, beams, slabs, walls, and signs of settlement or cracking.',
      'Inspect electrical systems: MDB / Consumer Unit, circuit breakers, grounding, outlets, and lighting fixtures.',
      'Inspect plumbing and sanitary systems: water supply lines, drainage, water pump, storage tank, and bathroom fixtures.',
      'Inspect roofing, ceiling boards, rainwater leakage marks, and drainage slopes.',
      'Inspect architectural finishes: ceramic/laminate flooring, wall paintwork, doors, windows, and locksets.',
      'Inspect exterior areas: perimeter walls, entrance gate, carport slab, and outdoor drainage gutters.',
      'Document all photographic defect evidence, prepare rectification methods, and summarize findings for the homeowner.',
    ];
  }
  return [
    'ตรวจสอบโครงสร้างอาคาร ฐานราก เสา คาน พื้น ผนัง และร่องรอยการทรุดตัวหรือแตกร้าว',
    'ตรวจสอบระบบไฟฟ้า ตู้ควบคุม (MDB/Consumer Unit) เบรกเกอร์ ระบบสายดิน เต้ารับ และอุปกรณ์ส่องสว่าง',
    'ตรวจสอบระบบประปา ท่อน้ำดี ท่อน้ำทิ้ง ปั๊มน้ำ ถังเก็บน้ำ และสุขภัณฑ์ภายในห้องน้ำทุกจุด',
    'ตรวจสอบงานหลังคา ฝ้าเพดาน คราบน้ำรั่วซึม และความลาดเอียงการระบายน้ำ',
    'ตรวจสอบงานสถาปัตยกรรม พื้นกระเบื้อง ลามิเนต ผนังทาสี ประตู หน้าต่าง และอุปกรณ์ล็อก',
    'ตรวจสอบงานภายนอกอาคาร รอบบ้าน รั้ว ประตูรั้ว โรงจอดรถ และระบบท่อระบายน้ำภายนอก',
    'บันทึกภาพถ่ายหลักฐานความบกพร่อง (Defect) ระบุสาเหตุ วิธีแก้ไข และสรุปผลตรวจรับให้เจ้าของบ้าน',
  ];
}

export function createDefaultLocationText(proj: ProjectFile, lang: AppLanguage = 'th'): string {
  const house = (proj.houseNo || '').trim();
  const addr = (proj.address || '').trim();
  if (lang === 'en') {
    if (house && addr) return `House No. ${house}, ${addr}`;
    return house ? `House No. ${house}` : addr || '-';
  }
  if (house && addr) return `บ้านเลขที่ ${house} ${addr}`;
  return house ? `บ้านเลขที่ ${house}` : addr || '-';
}

export function createDefaultIntroText(
  proj: ProjectFile,
  locationText: string,
  lang: AppLanguage = 'th'
): string {
  const name = proj.name || (lang === 'en' ? 'Residential Inspection Project' : 'โครงการตรวจรับบ้าน');
  const client = proj.clientName || '-';
  const dateStr = proj.inspectionDate || '-';
  if (lang === 'en') {
    return `This engineering home inspection report has been prepared for "${name}" located at ${locationText}, owned by ${client}. The field inspection was conducted on ${dateStr} by licensed structural and building inspectors using standard engineering checklists and visual/functional testing across all zones. This report documents every finding, technical root cause, and recommended rectification procedure to ensure safety, serviceability, and workmanship quality.`;
  }
  return `รายงานการตรวจรับบ้านฉบับนี้จัดทำขึ้นเพื่อสรุปผลการตรวจสอบสภาพอาคารและงานระบบประกอบอาคารสำหรับ "${name}" ตั้งอยู่ ณ ${locationText} ของ ${client} โดยทีมวิศวกรผู้ตรวจสอบได้ดำเนินการเข้าตรวจหน้างานเมื่อวันที่ ${dateStr} ครอบคลุมงานโครงสร้าง สถาปัตยกรรม ระบบไฟฟ้า ระบบประปา และพื้นที่ภายนอกรอบตัวบ้าน พร้อมบันทึกภาพถ่ายประกอบหลักฐาน วิเคราะห์สาเหตุทางวิศวกรรม และเสนอแนวทางแก้ไขเพื่อให้บ้านมีความปลอดภัยและได้มาตรฐานสูงสุด`;
}

export function createDefaultClosingSummary(proj: ProjectFile, lang: AppLanguage = 'th'): string {
  const total = proj.defects.length;
  const urgent = proj.defects.filter((d) => d.severity === 'เร่งด่วน').length;
  const pending = proj.defects.filter((d) => d.status !== 'แก้ไขแล้ว').length;
  const fixed = proj.defects.filter((d) => d.status === 'แก้ไขแล้ว').length;

  if (lang === 'en') {
    return `Based on the comprehensive site inspection across all floors and zones, a total of ${total} defect items were identified (${urgent} urgent, ${pending} pending/in-progress, and ${fixed} already rectified). All findings and photographic records are detailed in Table 1 above. Urgent structural, electrical, and waterproofing items should be rectified promptly by qualified technicians and re-inspected prior to final handover or occupancy.`;
  }
  return `จากการเข้าตรวจสอบสภาพบ้านและงานระบบทั้งหมดโดยละเอียด พบรายการข้อบกพร่อง (Defect) รวมทั้งสิ้น ${total} ข้อ แบ่งเป็นระดับเร่งด่วน ${urgent} ข้อ อยู่ระหว่างรอดำเนินการ/กำลังแก้ไข ${pending} ข้อ และแก้ไขเรียบร้อยแล้ว ${fixed} ข้อ โดยรายละเอียดภาพถ่ายและแนวทางแก้ไขได้ระบุครบถ้วนในตารางที่ 1 ทั้งนี้ขอแนะนำให้ผู้รับเหมาหรือช่างผู้ชำนาญการเร่งดำเนินการแก้ไขรายการเร่งด่วนด้านความปลอดภัย ระบบไฟฟ้า และงานกันซึมเป็นลำดับแรก พร้อมตรวจเช็กซ้ำหลังการแก้ไขให้เรียบร้อย`;
}

export function buildTable2RowsFromSteps(
  steps: string[],
  lang: AppLanguage = 'th',
  existingRows?: ReportTable2Row[]
): ReportTable2Row[] {
  const defaultFinding =
    lang === 'en'
      ? 'Inspected — see detailed items in Table 1'
      : 'ดำเนินการตรวจสอบแล้ว รายละเอียดระบุตามตารางที่ 1';
  const defaultNormalFinding =
    lang === 'en'
      ? 'Operating normally / checked per Table 1'
      : 'ทำงานปกติ / จุดแก้ไขระบุตามตารางที่ 1';

  return steps.map((stepText, idx) => {
    const prev = existingRows?.[idx];
    const fallbackFinding = idx === 1 || idx === 2 ? defaultNormalFinding : defaultFinding;
    const cleanedItem = stepText.replace(/^\s*\d+[\.\)\-]\s*/, '').trim();
    return {
      id: prev?.id || `t2_${idx + 1}`,
      item: cleanedItem,
      finding: prev?.finding?.trim() ? prev.finding : fallbackFinding,
    };
  });
}

export function createDefaultReportBookData(
  proj: ProjectFile,
  lang: AppLanguage = 'th'
): ReportBookData {
  const locationText = createDefaultLocationText(proj, lang);
  const steps = createDefaultInspectionSteps(lang);
  return {
    coverTitle:
      proj.name ||
      (lang === 'en' ? '2-Storey Townhome Inspection Report' : 'รายงานตรวจรับทาวน์โฮม 2 ชั้น'),
    propertyCondition: PROPERTY_CONDITION_OPTIONS[lang][0],
    locationText,
    clientName: proj.clientName || '',
    inspectionDate: proj.inspectionDate || '',
    locationMapImg: '',
    frontHouseImg: '',
    coverImageMode: 'front-house',
    coverCustomImg: '',
    introContent: createDefaultIntroText(proj, locationText, lang),
    inspectionSteps: steps,
    extraZonePlanImgs: [],
    table2Rows: buildTable2RowsFromSteps(steps, lang),
    closingSummary: createDefaultClosingSummary(proj, lang),
    customExport: createDefaultCustomExportSettings(),
  };
}

export function loadReportBookData(
  proj: ProjectFile,
  lang: AppLanguage = 'th'
): ReportBookData {
  const defaults = createDefaultReportBookData(proj, lang);
  try {
    const raw = workspaceStorage.getItem(`${REPORT_BOOK_STORAGE_PREFIX}${proj.id}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ReportBookData> & {
      locationPhoto?: unknown;
      frontHousePhoto?: unknown;
    };
    const steps =
      Array.isArray(parsed.inspectionSteps) && parsed.inspectionSteps.length > 0
        ? parsed.inspectionSteps.map((s) => String(s))
        : defaults.inspectionSteps;
    const table2Rows =
      Array.isArray(parsed.table2Rows) && parsed.table2Rows.length > 0
        ? parsed.table2Rows.map((r, i) => ({
            id: r?.id || `t2_${i + 1}`,
            item: String(r?.item ?? ''),
            finding: String(r?.finding ?? ''),
          }))
        : buildTable2RowsFromSteps(steps, lang);

    const rawLocationCandidate =
      parsed.locationMapImg !== undefined && parsed.locationMapImg !== null
        ? parsed.locationMapImg
        : parsed.locationPhoto;
    const rawFrontCandidate =
      parsed.frontHouseImg !== undefined && parsed.frontHouseImg !== null
        ? parsed.frontHouseImg
        : parsed.frontHousePhoto;

    const sanitizedLocationMapImg = sanitizeReportImageUrl(rawLocationCandidate);
    const sanitizedFrontHouseImg = sanitizeReportImageUrl(rawFrontCandidate);
    const sanitizedExtraZonePlanImgs = Array.isArray(parsed.extraZonePlanImgs)
      ? parsed.extraZonePlanImgs
          .map((item) => sanitizeReportImageUrl(item))
          .filter((item) => item.length > 0)
      : [];

    const defaultCustom = createDefaultCustomExportSettings();
    const rawCustom: Partial<ReportCustomExportSettings> = parsed.customExport || {};
    const customExport: ReportCustomExportSettings = {
      includeCover: rawCustom.includeCover ?? defaultCustom.includeCover,
      includeToc: rawCustom.includeToc ?? defaultCustom.includeToc,
      includeIntro: rawCustom.includeIntro ?? defaultCustom.includeIntro,
      includeStepsAndZones:
        rawCustom.includeStepsAndZones ?? defaultCustom.includeStepsAndZones,
      includeDefectTable: rawCustom.includeDefectTable ?? defaultCustom.includeDefectTable,
      includeSummaryTable2:
        rawCustom.includeSummaryTable2 ?? defaultCustom.includeSummaryTable2,
      defectsPerPage:
        rawCustom.defectsPerPage === 2 ||
        rawCustom.defectsPerPage === 3 ||
        rawCustom.defectsPerPage === 4 ||
        rawCustom.defectsPerPage === 5 ||
        rawCustom.defectsPerPage === 'auto'
          ? rawCustom.defectsPerPage
          : defaultCustom.defectsPerPage,
      defectStatusFilter:
        rawCustom.defectStatusFilter === 'pending_only' ||
        rawCustom.defectStatusFilter === 'fixed_only'
          ? rawCustom.defectStatusFilter
          : 'all',
      defectSeverityFilter:
        rawCustom.defectSeverityFilter === 'urgent_only' ? 'urgent_only' : 'all',
      defectSelectionMode:
        rawCustom.defectSelectionMode === 'manual' ? 'manual' : 'filter',
      selectedDefectIds: Array.isArray(rawCustom.selectedDefectIds)
        ? rawCustom.selectedDefectIds.filter((id): id is string => typeof id === 'string')
        : [],
      showCauseDetails: rawCustom.showCauseDetails ?? defaultCustom.showCauseDetails,
      showSolutionDetails:
        rawCustom.showSolutionDetails ?? defaultCustom.showSolutionDetails,
      customFooterNote:
        typeof rawCustom.customFooterNote === 'string'
          ? rawCustom.customFooterNote
          : defaultCustom.customFooterNote,
    };

    const result: ReportBookData = {
      coverTitle: parsed.coverTitle ?? defaults.coverTitle,
      propertyCondition: parsed.propertyCondition ?? defaults.propertyCondition,
      locationText: parsed.locationText ?? defaults.locationText,
      clientName: parsed.clientName ?? defaults.clientName,
      inspectionDate: parsed.inspectionDate ?? defaults.inspectionDate,
      locationMapImg: sanitizedLocationMapImg,
      frontHouseImg: sanitizedFrontHouseImg,
      coverImageMode: parsed.coverImageMode === 'custom' || parsed.coverImageMode === 'none' ? parsed.coverImageMode : 'front-house',
      coverCustomImg: sanitizeReportImageUrl(parsed.coverCustomImg),
      introContent: parsed.introContent ?? defaults.introContent,
      inspectionSteps: steps,
      extraZonePlanImgs: sanitizedExtraZonePlanImgs,
      table2Rows,
      closingSummary: parsed.closingSummary ?? defaults.closingSummary,
      customExport,
    };

    const hadGarbageLocation =
      typeof rawLocationCandidate === 'string' &&
      rawLocationCandidate.length > 0 &&
      !sanitizedLocationMapImg;
    const hadGarbageFront =
      typeof rawFrontCandidate === 'string' &&
      rawFrontCandidate.length > 0 &&
      !sanitizedFrontHouseImg;
    const hadGarbageExtra =
      Array.isArray(parsed.extraZonePlanImgs) &&
      parsed.extraZonePlanImgs.length !== sanitizedExtraZonePlanImgs.length;

    if (hadGarbageLocation || hadGarbageFront || hadGarbageExtra) {
      saveReportBookData(proj.id, result);
    }

    return result;
  } catch {
    return defaults;
  }
}

export function resolveCoverImage(data: ReportBookData): string {
  if(data.coverImageMode === 'none')return '';
  return sanitizeReportImageUrl(data.coverImageMode === 'custom' ? data.coverCustomImg : data.frontHouseImg);
}

export function saveReportBookData(projectId: string, data: ReportBookData): void {
  try {
    workspaceStorage.setItem(
      `${REPORT_BOOK_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(data)
    );
  } catch {
    // Ignore quota overflow silently; state remains active for current export
  }
}
