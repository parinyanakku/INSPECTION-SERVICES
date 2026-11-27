import type { BrandConfig, DefectItem, ProjectFile, SeverityLevel } from '../types/inspection';

export const STORAGE_KEY_BRAND = 'tis_wl_brand_v10';
export const STORAGE_KEY_PROJECTS = 'tis_wl_projects_v10';
export const STORAGE_KEY_LAST_SAVED = 'tis_wl_last_saved_v10';

export const ZONE_COLOR_PRESETS = [
  { label: 'ส้ม', bg: '#ffedd5', border: '#ea580c' },
  { label: 'ฟ้า', bg: '#dbeafe', border: '#2563eb' },
  { label: 'เขียว', bg: '#dcfce7', border: '#16a34a' },
  { label: 'ชมพู', bg: '#fce7f3', border: '#db2777' },
  { label: 'ม่วง', bg: '#e0e7ff', border: '#4f46e5' },
  { label: 'เหลือง', bg: '#fef3c7', border: '#d97706' },
  { label: 'เทา', bg: '#f1f5f9', border: '#475569' },
] as const;

export const DEFAULT_GEAR_LOGO_SVG = `
  <svg viewBox="0 0 140 140" class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <defs><path id="tisTopArc" d="M 22,70 A 48,48 0 1,1 118,70" /></defs>
    <circle cx="70" cy="70" r="64" fill="#1e3a8a" stroke="#1e3a8a" stroke-width="6" stroke-dasharray="7 4.2" />
    <circle cx="70" cy="70" r="60" fill="#1e3a8a" />
    <circle cx="70" cy="70" r="55" fill="#dc2626" />
    <circle cx="70" cy="70" r="51" fill="#fefce8" />
    <path d="M 19,74 L 121,74 A 51,51 0 0,1 19,74 Z" fill="#1e3a8a" />
    <text fill="#1e3a8a" font-size="10.2" font-weight="800" font-family="Sarabun, sans-serif" letter-spacing="0.3">
      <textPath href="#tisTopArc" startOffset="50%" text-anchor="middle">TEAM INSPECTION SERVICES</textPath>
    </text>
    <circle cx="70" cy="64" r="24" fill="#ffffff" stroke="#1e3a8a" stroke-width="2.5" />
    <polygon points="70,45 50,60 90,60" fill="#dc2626" />
    <rect x="55" y="60" width="30" height="20" fill="#1e3a8a" rx="1.5" />
    <rect x="65" y="67" width="10" height="13" fill="#fefce8" rx="1" />
    <rect x="58" y="63" width="5" height="5" fill="#93c5fd" rx="0.5" />
    <rect x="77" y="63" width="5" height="5" fill="#93c5fd" rx="0.5" />
    <text x="70" y="105" text-anchor="middle" fill="#ffffff" font-size="7.5" font-weight="700" letter-spacing="0.4">HOME INSPECTOR</text>
    <text x="70" y="116" text-anchor="middle" fill="#fde047" font-size="7.5" font-weight="800">• 2024 •</text>
  </svg>`;

export function getArchitecturalFloorSvg(floorIndex: number): string {
  if (floorIndex === 0) {
    return `<svg viewBox="0 0 800 600" class="w-full h-full pointer-events-none select-none" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="grid1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="0.7" /></pattern></defs>
      <rect width="800" height="600" fill="#f8fafc" /><rect width="800" height="600" fill="url(#grid1)" />
      <rect x="40" y="28" width="720" height="544" fill="#ffffff" stroke="#334155" stroke-width="6" rx="4" />
      <line x1="40" y1="145" x2="760" y2="145" stroke="#334155" stroke-width="4" />
      <rect x="60" y="42" width="210" height="36" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5" />
      <rect x="115" y="48" width="54" height="24" fill="#e2e8f0" stroke="#64748b" stroke-width="1.2" rx="3" />
      <line x1="510" y1="145" x2="510" y2="415" stroke="#334155" stroke-width="4" />
      <line x1="510" y1="270" x2="760" y2="270" stroke="#334155" stroke-width="4" />
      <g stroke="#94a3b8" stroke-width="1.5">
        <line x1="525" y1="162" x2="745" y2="162" /><line x1="525" y1="178" x2="745" y2="178" />
        <line x1="525" y1="194" x2="745" y2="194" /><line x1="525" y1="210" x2="745" y2="210" />
        <line x1="525" y1="226" x2="745" y2="226" /><line x1="525" y1="242" x2="745" y2="242" />
      </g>
      <ellipse cx="720" cy="315" rx="18" ry="12" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5" />
      <rect x="670" y="365" width="70" height="36" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5" rx="4" />
      <rect x="85" y="210" width="130" height="46" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" rx="6" />
      <rect x="110" y="275" width="80" height="36" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" rx="4" />
      <line x1="40" y1="415" x2="760" y2="415" stroke="#334155" stroke-width="4" />
      <line x1="170" y1="415" x2="360" y2="415" stroke="#0284c7" stroke-width="6" />
      <rect x="105" y="442" width="175" height="108" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 4" rx="10" />
      <rect x="330" y="442" width="175" height="108" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 4" rx="10" />
      <line x1="90" y1="572" x2="710" y2="572" stroke="#0f172a" stroke-width="5" stroke-dasharray="14 6" />
      <text x="400" y="592" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">▲ หน้าบ้าน / ประตูรั้วทางเข้า ▲</text>
    </svg>`;
  }
  return `<svg viewBox="0 0 800 600" class="w-full h-full pointer-events-none select-none" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="0.7" /></pattern></defs>
    <rect width="800" height="600" fill="#f8fafc" /><rect width="800" height="600" fill="url(#grid2)" />
    <rect x="40" y="28" width="720" height="544" fill="#ffffff" stroke="#334155" stroke-width="6" rx="4" />
    <line x1="40" y1="220" x2="760" y2="220" stroke="#334155" stroke-width="4" />
    <line x1="510" y1="28" x2="510" y2="220" stroke="#334155" stroke-width="4" />
    <rect x="90" y="55" width="130" height="110" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" rx="6" />
    <ellipse cx="710" cy="80" rx="18" ry="12" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5" />
    <rect x="650" y="155" width="90" height="45" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5" rx="4" />
    <line x1="40" y1="365" x2="760" y2="365" stroke="#334155" stroke-width="4" />
    <line x1="510" y1="220" x2="510" y2="365" stroke="#334155" stroke-width="4" />
    <g stroke="#94a3b8" stroke-width="1.5">
      <line x1="525" y1="240" x2="745" y2="240" /><line x1="525" y1="260" x2="745" y2="260" />
      <line x1="525" y1="280" x2="745" y2="280" /><line x1="525" y1="300" x2="745" y2="300" />
      <line x1="525" y1="320" x2="745" y2="320" /><line x1="525" y1="340" x2="745" y2="340" />
    </g>
    <rect x="280" y="405" width="180" height="120" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" rx="6" />
    <rect x="295" y="415" width="60" height="26" fill="#e2e8f0" rx="4" />
    <rect x="385" y="415" width="60" height="26" fill="#e2e8f0" rx="4" />
    <line x1="160" y1="572" x2="640" y2="572" stroke="#0284c7" stroke-width="6" />
    <text x="400" y="592" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">▲ ด้านหน้าบ้าน (ระเบียงห้องนอนใหญ่) ▲</text>
  </svg>`;
}

export const DEFAULT_BRAND: BrandConfig = {
  companyName: 'TEAM INSPECTION SERVICES',
  subtitle: 'HOME INSPECTOR 2024',
  tagline: 'บริการตรวจรับบ้านและทาวน์โฮมโดยวิศวกรผู้ตรวจสอบมืออาชีพ',
  inspectorName: '',
  licenseNo: '',
  contactInfo: 'โทร. 089-999-8909 | Line: @teaminspect | จ.ขอนแก่น',
  accentColor: '#1e3a8a',
  customLogoDataUrl: null,
};

// Remove only the exact inherited legacy sample identity from buyer accounts.
function legacyIdentityFingerprint(value:string):number{
  let hash=2166136261;
  for(const c of value.normalize('NFC').replace(/\s/g,''))hash=Math.imul(hash^c.codePointAt(0)!,16777619);
  return hash>>>0;
}
export function clearLegacyBuyerIdentity(brand:BrandConfig,isAdmin:boolean):BrandConfig{
  if(isAdmin)return brand;
  return {...brand,
    subtitle: typeof brand.subtitle==='string'&&brand.subtitle.trim()!==DEFAULT_BRAND.subtitle?brand.subtitle:'',
    inspectorName:legacyIdentityFingerprint(brand.inspectorName||'')===1062844061?'':brand.inspectorName,
    licenseNo:legacyIdentityFingerprint(brand.licenseNo||'')===2823607140?'':brand.licenseNo,
  };
}

export function normalizeSeverity(sev?: string): SeverityLevel {
  if (sev === 'เร่งด่วน' || sev === 'สูง' || sev === 'วิกฤต' || sev === 'สูง/เร่งด่วน') {
    return 'เร่งด่วน';
  }
  if (sev === 'เล็กน้อย' || sev === 'ต่ำ') {
    return 'เล็กน้อย';
  }
  return 'ปานกลาง';
}

// Group by floor, then by the order in which zones were first inspected.
// A new item in an already inspected zone joins that group, not the project tail.
// Only presentation numbers change: IDs, coordinates, photos and statuses stay intact.
export function orderProjectDefects(proj: ProjectFile): ProjectFile {
  if (!proj.defects?.length) return proj;
  const floorRank = new Map(proj.floors.map((floor,index)=>[floor.id,index]));
  const source = proj.defects.map((item,index)=>({item,index})).sort((a,b)=>{
    const an=Number.isFinite(a.item.number)&&a.item.number>0?a.item.number:Number.MAX_SAFE_INTEGER;
    const bn=Number.isFinite(b.item.number)&&b.item.number>0?b.item.number:Number.MAX_SAFE_INTEGER;
    return an-bn||a.index-b.index;
  });
  const missingFloors=new Map<string,number>();
  const zoneRanks=new Map<string,Map<string,number>>();
  const groupKey=(d:DefectItem)=>String(d.zone??'').trim();
  for(const {item} of source){
    if(!floorRank.has(item.floorId)&&!missingFloors.has(item.floorId))missingFloors.set(item.floorId,missingFloors.size);
    let ranks=zoneRanks.get(item.floorId);
    if(!ranks){ranks=new Map();zoneRanks.set(item.floorId,ranks);}
    const key=groupKey(item);
    if(!ranks.has(key))ranks.set(key,ranks.size);
  }
  const rank=(d:DefectItem)=>floorRank.get(d.floorId)??(floorRank.size+(missingFloors.get(d.floorId)??0));
  source.sort((a,b)=>rank(a.item)-rank(b.item)||
    (zoneRanks.get(a.item.floorId)?.get(groupKey(a.item))??0)-(zoneRanks.get(b.item.floorId)?.get(groupKey(b.item))??0));
  const defects=source.map(({item},index)=>item.number===index+1?item:{...item,number:index+1});
  return defects.every((item,index)=>item===proj.defects[index])?proj:{...proj,defects};
}

export function migrateProject(proj: ProjectFile): ProjectFile {
  return orderProjectDefects({
    ...proj,
    floors: (proj.floors || []).map((fl) => ({
      ...fl,
      zones: Array.isArray(fl.zones) ? fl.zones : [],
      elements: Array.isArray(fl.elements) ? fl.elements : [],
    })),
    defects: (proj.defects || []).map((d) => ({
      ...d,
      beforeImg: d.beforeImg ?? d.photoDataUrl ?? null,
      afterImg: d.afterImg ?? null,
      severity: normalizeSeverity(d.severity),
    })),
  });
}

export function createDefaultSirinaphaProject(): ProjectFile {
  const f1 = 'fl_sirinapha_1';
  const f2 = 'fl_sirinapha_2';

  const floor1Zones = [
    { id: 'z_f1_3', name: 'โซน 3: ห้องครัว/ซักล้าง', x: 5, y: 5, w: 90, h: 19, bg: '#dcfce7', border: '#16a34a' },
    { id: 'z_f1_2', name: 'โซน 2: ห้องรับแขก/โถงชั้น 1', x: 5, y: 25, w: 58, h: 43, bg: '#dbeafe', border: '#2563eb' },
    { id: 'z_f1_4', name: 'โซน 4: ห้องน้ำชั้น 1', x: 65, y: 45, w: 30, h: 23, bg: '#fce7f3', border: '#db2777' },
    { id: 'z_f1_1', name: 'โซน 1: โรงจอดรถ/หน้าบ้าน', x: 5, y: 70, w: 90, h: 25, bg: '#ffedd5', border: '#ea580c' },
  ];

  const floor2Zones = [
    { id: 'z_f2_7', name: 'โซน 7: ห้องนอน 2 และห้องน้ำชั้น 2', x: 5, y: 5, w: 90, h: 31, bg: '#fce7f3', border: '#db2777' },
    { id: 'z_f2_5', name: 'โซน 5: โถงบันได/ชั้น 2', x: 5, y: 38, w: 90, h: 22, bg: '#e0e7ff', border: '#4f46e5' },
    { id: 'z_f2_6', name: 'โซน 6: ห้องนอนใหญ่ (Master)', x: 5, y: 62, w: 90, h: 33, bg: '#fef3c7', border: '#d97706' },
  ];

  const Z1 = 'โซน 1: โรงจอดรถ/หน้าบ้าน';
  const Z2 = 'โซน 2: ห้องรับแขก/โถงชั้น 1';
  const Z3 = 'โซน 3: ห้องครัว/ซักล้าง';
  const Z4 = 'โซน 4: ห้องน้ำชั้น 1';
  const Z5 = 'โซน 5: โถงบันได/ชั้น 2';
  const Z6 = 'โซน 6: ห้องนอนใหญ่ (Master)';
  const Z7 = 'โซน 7: ห้องนอน 2 และห้องน้ำชั้น 2';

  const rawDefects: Array<{
    n: number;
    f: string;
    z: string;
    x: number;
    y: number;
    sev: SeverityLevel;
    st: DefectItem['status'];
    t: string;
    c: string;
    s: string;
  }> = [
    { n: 1, f: f1, z: Z1, x: 16, y: 86, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'รั้วประตูหน้าบ้านมีสนิมบริเวณรอยเชื่อม', c: 'ความชื้นสะสมและสีรองพื้นกันสนิมเสื่อมสภาพ', s: 'ขัดสนิมออกให้หมด ทาสีรองพื้นกันสนิม Epoxy 2 เที่ยว และทาสีจริงทับหน้า' },
    { n: 2, f: f1, z: Z1, x: 32, y: 84, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'กระเบื้องพื้นโรงจอดรถร่อนเป็นโพรง 1 จุด', c: 'ปูนกาวด้านหลังแผ่นกระเบื้องไม่เต็มหน้าสัมผัสเกิดโพรงอากาศ', s: 'รื้อแผ่นกระเบื้องที่ร่อนออก ขูดปูนเก่า ปาดปูนกาวเต็มแผ่นและปูใหม่' },
    { n: 3, f: f1, z: Z1, x: 48, y: 86, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'ร่องยาแนวพื้นโรงจอดรถเป็นคราบสกปรก', c: 'คราบสิ่งสกปรกฝังแน่นในร่องยาแนวเดิม', s: 'ขูดล้างทำความสะอาดร่องยาแนวและลงยาแนวใหม่ให้เรียบร้อย' },
    { n: 4, f: f1, z: Z1, x: 64, y: 84, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'โครงเหล็กกล่องหลังคาโรงจอดรถรอยต่อไม่ต่อเนื่อง', c: 'การตัดประกอบโครงเหล็กกล่องเชื่อมรอยต่อไม่ต่อเนื่อง', s: 'เชื่อมเสริมเหล็กกล่องให้แนวรอยต่อสนิท เจียรเรียบและเก็บสีกันสนิม' },
    { n: 5, f: f1, z: Z1, x: 80, y: 86, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'ขอบพื้นต่างระดับหน้าประตูทางเข้าเก็บงานสีไม่เรียบร้อย', c: 'รอยถลอกและคราบเลอะบริเวณขอบพื้นต่างระดับ', s: 'ทำความสะอาดพื้นผิวและทาสีเก็บงานขอบพื้นต่างระดับให้เรียบร้อย' },
    { n: 6, f: f1, z: Z1, x: 22, y: 76, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'ผิวกระเบื้องหน้าประตูทางเข้ามีคราบปูนติดค้าง', c: 'เศษปูนจากการก่อสร้างติดค้างบนผิวกระเบื้อง', s: 'ขูดและล้างคราบปูนออกจากผิวกระเบื้องอย่างระมัดระวัง' },
    { n: 7, f: f1, z: Z1, x: 40, y: 76, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'ผนังโรงจอดรถมีคราบสีขาวเลอะ', c: 'หยดสีทาบ้านเลอะพื้นผิวบริเวณโรงจอดรถ', s: 'เช็ดล้างคราบสีขาวออกให้สะอาดเรียบร้อย' },
    { n: 8, f: f1, z: Z1, x: 58, y: 76, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'กระจกบานเลื่อนประตูหน้าบ้านมีคราบมัว', c: 'คราบฝุ่นและคราบน้ำเกาะสะสมบนกระจกบานเลื่อน', s: 'เช็ดทำความสะอาดกระจกทั้งสองด้านให้ใสสะอาด' },
    { n: 9, f: f1, z: Z1, x: 76, y: 76, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'ขอบเฟรมอลูมิเนียมประตูหน้าบ้านมีคราบสีเลอะ', c: 'สีทาผนังเลอะติดขอบเฟรมอลูมิเนียมและเก็บงานผิวไม่เรียบ', s: 'เช็ดล้างคราบสีบนเฟรมอลูมิเนียมออกและเก็บความเรียบร้อยขอบวงกบ' },

    { n: 10, f: f1, z: Z2, x: 18, y: 40, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'ขอบเฟรมประตูบานเลื่อนภายในบ้านมีคราบสีเลอะ', c: 'คราบสีและรอยขีดข่วนบริเวณขอบเฟรมอลูมิเนียมภายใน', s: 'ทำความสะอาดคราบสีออกและเก็บงานขอบเฟรมให้เรียบร้อย' },
    { n: 11, f: f1, z: Z2, x: 35, y: 52, sev: 'เร่งด่วน', st: 'รอแก้ไข', t: 'กระเบื้องพื้นโถงรับแขกร่อนเป็นโพรงหลายจุด', c: 'การปูกระเบื้องพื้นโถงบ้านปูนกาวไม่เต็มแผ่นเกิดเสียงกลวงหลายจุด', s: 'รื้อกระเบื้องแผ่นที่ร่อนออกทั้งหมด ปรับระดับและปูใหม่ด้วยปูนกาวเต็มแผ่น' },
    { n: 12, f: f1, z: Z2, x: 52, y: 42, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ผนังห้องเก็บของใต้บันไดผิวไม่เรียบ มีรูโพรงหลายจุด', c: 'การฉาบปูนผนังภายในไม่แน่นและไม่ได้ขัดแต่งผิว', s: 'อุดโป๊วรูโพรงบนผนัง ฉาบปรับผิวให้เรียบและทาสีเก็บงานให้สมบูรณ์' },

    { n: 13, f: f1, z: Z4, x: 72, y: 51, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'สกรูบานพับประตูห้องน้ำชั้น 1 ขึ้นสนิม', c: 'ใช้สกรูเหล็กธรรมดาแทนสกรูสแตนเลสในพื้นที่เปียกชื้น', s: 'ถอดเปลี่ยนสกรูบานพับเป็นสแตนเลสเกรด 304 ทั้งหมด' },
    { n: 14, f: f1, z: Z4, x: 86, y: 51, sev: 'ปานกลาง', st: 'แก้ไขแล้ว', t: 'สายฉีดชำระห้องน้ำชั้น 1 น้ำไหลเบา', c: 'ตะแกรงกรองอุดตันหรือวาล์วเปิดน้ำเปิดไม่สุด', s: 'ถอดล้างตะแกรงกรองสายฉีดชำระและปรับตั้งวาล์วให้น้ำไหลแรงปกติ' },
    { n: 15, f: f1, z: Z4, x: 72, y: 58, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'หัวก๊อกน้ำอ่างล้างหน้าเสื่อมสภาพ', c: 'หัวก๊อกน้ำมีคราบตะกรันอุดตันและปิดน้ำไม่สนิท', s: 'เปลี่ยนชุดหัวก๊อกน้ำใหม่และทดสอบการเปิด-ปิดไม่ให้รั่วซึม' },
    { n: 16, f: f1, z: Z4, x: 86, y: 58, sev: 'เร่งด่วน', st: 'รอแก้ไข', t: 'น้ำรั่วซึมบริเวณท่อน้ำทิ้งใต้อ่างล้างหน้า', c: 'ซีลยางปะเก็นท่อน้ำทิ้งหรือข้อต่อใต้อ่างล้างหน้าหลวมเสื่อมสภาพ', s: 'ถอดชุดท่อน้ำทิ้งเปลี่ยนปะเก็นยาง พันเทปเกลียวและทดสอบขังน้ำตรวจรั่ว' },
    { n: 17, f: f1, z: Z4, x: 72, y: 64, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'เก็บรูเจาะเดิมตามผนังกระเบื้องห้องน้ำ', c: 'รูเจาะเดิมบนผนังกระเบื้องไม่ได้อุดปิดให้เรียบร้อย', s: 'อุดปิดรูเจาะด้วยยาแนวหรือซิลิโคนสีเดียวกับกระเบื้อง' },
    { n: 18, f: f1, z: Z4, x: 86, y: 64, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'กลอนประตูห้องน้ำชั้น 1 หลวมไม่แข็งแรง', c: 'สกรูยึดกลอนประตูคลายตัวและรูรับกลอนหลวม', s: 'ขันยึดสกรูกลอนประตูให้แน่นหนาและปรับตำแหน่งเดือยรับให้แข็งแรง' },

    { n: 19, f: f1, z: Z3, x: 24, y: 14, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'หัวก๊อกซิงค์ล้างจานมีคราบสกปรกและคราบปูน', c: 'คราบปูนและคราบออกไซด์เกาะบริเวณหัวก๊อกซิงค์ครัว', s: 'ขัดล้างทำความสะอาดหัวก๊อกน้ำหรือเปลี่ยนหัวกรองปลายก๊อกใหม่' },
    { n: 20, f: f1, z: Z3, x: 50, y: 14, sev: 'เร่งด่วน', st: 'รอแก้ไข', t: 'กระเบื้องพื้นครัวร่อน และมีน้ำฝนรั่วซึมบริเวณหน้าต่างบานเกล็ด', c: 'ปูนกาวไม่เต็มแผ่นและน้ำฝนสาดเข้าทางบานเกล็ดหลังบ้าน', s: 'รื้อปูกระเบื้องจุดที่ร่อนใหม่ และติดตั้งกันสาด/บานกันฝนหรือเปลี่ยนเป็นบานเลื่อน' },
    { n: 21, f: f1, z: Z3, x: 76, y: 14, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'เก็บความสะอาดใต้ขอบเฟรมประตูและหน้าต่างครัวทุกจุด', c: 'เศษฝุ่นและคราบปูนค้างอยู่ใต้ขอบเฟรม', s: 'ดูดฝุ่นและเช็ดทำความสะอาดใต้ขอบเฟรมทุกจุดให้เรียบร้อย' },

    { n: 22, f: f2, z: Z7, x: 68, y: 12, sev: 'เร่งด่วน', st: 'รอแก้ไข', t: 'ชักโครกห้องน้ำชั้น 2 ไม่ยึดแน่นและฝารองนั่งขยับหลวม', c: 'พุกยึดฐานชักโครกและน็อตยึดฝารองนั่งหลวมคลอน', s: 'ยึดฐานชักโครกให้มั่นคง ยิงซิลิโคนรอบฐาน และขันแน่น/เปลี่ยนชุดยึดฝารองนั่ง' },
    { n: 23, f: f2, z: Z7, x: 78, y: 12, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ร่องรอบอ่างล้างหน้าห้องน้ำชั้น 2 ไม่ได้ยิงซิลิโคน', c: 'รอยต่อระหว่างอ่างล้างหน้ากับผนังไม่มีซิลิโคนกันน้ำซึม', s: 'ทำความสะอาดร่องรอบอ่างล้างหน้าและยิงซิลิโคนกันเชื้อราให้เรียบร้อย' },
    { n: 24, f: f2, z: Z7, x: 88, y: 12, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ก๊อกอ่างล้างหน้าห้องน้ำชั้น 2 ติดตั้งหลวมโยกคลอน', c: 'แป้นเกลียวยึดก๊อกอ่างล้างหน้าหลวมคลอน', s: 'ขันแน่นชุดยึดก๊อกน้ำและตรวจสอบการรั่วซึมใต้เคาน์เตอร์' },
    { n: 25, f: f2, z: Z7, x: 68, y: 24, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'กลอนประตูห้องน้ำชั้น 2 หลวมไม่แข็งแรง', c: 'ชุดกลอนประตูห้องน้ำชั้น 2 คลายตัวไม่กระชับ', s: 'ปรับตั้งและยึดสกรูกลอนประตูห้องน้ำให้แข็งแรง' },
    { n: 26, f: f2, z: Z7, x: 78, y: 24, sev: 'เล็กน้อย', st: 'แก้ไขแล้ว', t: 'เก็บรูเจาะเดิมตามผนังกระเบื้องห้องน้ำชั้น 2', c: 'พบรูเจาะเก่าบนกระเบื้องผนังห้องน้ำ 2', s: 'อุดปิดรูเจาะกระเบื้องด้วยยาแนวสีใกล้เคียงให้เรียบเนียน' },
    { n: 27, f: f2, z: Z7, x: 88, y: 24, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ขอแขวนหัวฉีดชำระห้องน้ำชั้น 2 หลวมคลอน', c: 'พุกยึดขอแขวนหัวฉีดชำระหลวมคลอน', s: 'เปลี่ยนพุกยึดผนังใหม่และขันยึดขอแขวนหัวฉีดชำระให้แน่นหนา' },
    { n: 28, f: f2, z: Z7, x: 14, y: 13, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'หน้าต่างบานเลื่อนห้องนอน 2 ฝืด', c: 'รางเลื่อนสกปรกและลูกล้อบานเลื่อนปรับตั้งไม่ได้ระดับ', s: 'ทำความสะอาดรางเลื่อนและปรับตั้งลูกล้อให้เลื่อนเปิด-ปิดได้คล่องตัว' },
    { n: 29, f: f2, z: Z7, x: 26, y: 13, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'สกรูยึดเฟรมหน้าต่างขึ้นสนิมทั้งบาน', c: 'สกรูยึดเฟรมอลูมิเนียมเกิดสนิมผุกร่อน', s: 'ถอดเปลี่ยนสกรูที่เป็นสนิมทั้งหมดเป็นสกรูสแตนเลส' },
    { n: 30, f: f2, z: Z7, x: 38, y: 13, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'เก็บรูเจาะตามเฟรมกระจกหน้าต่าง (จุดที่ 1)', c: 'รูเจาะติดตั้งบนเฟรมกระจกไม่ได้ปิดจุกยาง/ซิลิโคน', s: 'ปิดจุกยางหรือแต้มซิลิโคนสีเดียวกับเฟรมให้เรียบร้อย' },
    { n: 31, f: f2, z: Z7, x: 50, y: 13, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'เก็บรูเจาะตามเฟรมกระจกหน้าต่าง (จุดที่ 2)', c: 'พบรูเจาะเปิดโล่งบริเวณเฟรมหน้าต่างอีกด้าน', s: 'อุดปิดรูเจาะตามเฟรมกระจกให้ครบทุกจุด' },
    { n: 32, f: f2, z: Z7, x: 16, y: 26, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'บานเลื่อนหน้าต่างฝั่งซ้ายเปิด-ปิดฝืด', c: 'ลูกล้อบานหน้าต่างฝืดและรางมีฝุ่นสะสม', s: 'หล่อลื่นและปรับตั้งลูกล้อบานหน้าต่างให้เลื่อนลื่นไม่ติดขัด' },
    { n: 33, f: f2, z: Z7, x: 28, y: 26, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ตัวล็อคหน้าต่างฝืดเข้าร่องล็อคยาก (จุดที่ 1)', c: 'ตำแหน่งเขี้ยวล็อคกับเพลทรับล็อคเยื้องศูนย์', s: 'ปรับตำแหน่งตัวล็อคหน้าต่างให้ขบเข้าร่องล็อคได้พอดี' },
    { n: 34, f: f2, z: Z7, x: 40, y: 26, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ตัวล็อคหน้าต่างฝืดเข้าร่องล็อคยาก (จุดที่ 2)', c: 'กลไกมือจับล็อคบานเลื่อนฝืด', s: 'ปรับตั้งและหล่อลื่นชุดมือจับล็อคให้ใช้งานได้สะดวก' },
    { n: 35, f: f2, z: Z7, x: 52, y: 26, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'ตัวกันชนประตูห้องนอน 2 มีสีหลุดร่อน', c: 'สีเคลือบตัวกันชนประตูหลุดลอกจากการใช้งาน', s: 'เปลี่ยนตัวกันชนประตูใหม่หรือเก็บสีให้เรียบร้อย' },

    { n: 36, f: f2, z: Z6, x: 14, y: 72, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'สกรูยึดบานพับ/เฟรมห้องนอนใหญ่ติดตั้งไม่ครบ', c: 'ช่างยึดสกรูบานพับ/เฟรมไม่ครบทุกรู', s: 'ตรวจสอบและติดตั้งสกรูให้ครบทุกจุดตามมาตรฐาน' },
    { n: 37, f: f2, z: Z6, x: 30, y: 72, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'ลูกบิดประตูห้องนอนใหญ่เป็นสนิม', c: 'ผิวเคลือบลูกบิดประตูเสื่อมสภาพเกิดสนิม', s: 'เปลี่ยนชุดลูกบิดประตูใหม่ทั้งชุด' },
    { n: 38, f: f2, z: Z6, x: 46, y: 72, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'กันชนประตูห้องนอนใหญ่มีสีหลุดร่อน', c: 'สีตัวกันชนประตูหลุดล่อน', s: 'เปลี่ยนตัวกันชนประตูใหม่ให้เรียบร้อย' },
    { n: 39, f: f2, z: Z6, x: 62, y: 72, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'ผนังห้องนอนใหญ่มีคราบดำเลอะ', c: 'คราบเปื้อนดำจากการใช้งานบนผิวผนัง', s: 'เช็ดทำความสะอาดพื้นผิวและทาสีทับหน้าใหม่ให้สม่ำเสมอ' },
    { n: 40, f: f2, z: Z6, x: 80, y: 72, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'เต้ารับปลั๊กไฟติดเอียงไม่ได้แนวระดับ', c: 'การยึดหน้ากากเต้ารับไฟฟ้าไม่ได้ระดับน้ำ', s: 'ถอดปรับตั้งสกรูยึดบล็อกปลั๊กไฟให้ได้แนวระดับตรงสวยงาม' },
    { n: 41, f: f2, z: Z6, x: 16, y: 86, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'หน้ากากปลั๊กไฟแนบผนังไม่สนิท ตรวจสอบทุกจุด', c: 'ขอบหน้ากากปลั๊กไฟเผยอห่างจากผิวผนัง', s: 'ปรับแต่งตำแหน่งบล็อกฝังและกดล็อคหน้ากากปลั๊กให้แนบสนิททุกจุด' },
    { n: 42, f: f2, z: Z6, x: 32, y: 86, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'สกรูยึดเฟรมหน้าต่างห้องนอนใหญ่เป็นสนิมทั้งบาน', c: 'สกรูยึดวงกบหน้าต่างเกิดสนิมทั้งบาน', s: 'เปลี่ยนสกรูยึดเฟรมทุกจุดเป็นสกรูสแตนเลสกันสนิม' },
    { n: 43, f: f2, z: Z6, x: 48, y: 86, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'รอยต่อเข้ามุมเฟรมอลูมิเนียมมีช่องว่างแนบไม่สนิท', c: 'รอยต่อเข้ามุมเฟรมมีช่องว่างไม่แนบสนิท', s: 'ปรับประกอบรอยต่อเฟรมและซีลซิลิโคนปิดช่องว่างให้เรียบร้อยทุกจุด' },
    { n: 44, f: f2, z: Z6, x: 66, y: 86, sev: 'เล็กน้อย', st: 'รอแก้ไข', t: 'คราบสีเลอะขอบเฟรมหน้าต่างห้องนอนใหญ่', c: 'คราบสีทาบ้านเลอะติดขอบเฟรมหน้าต่าง', s: 'ทำความสะอาดคราบสีและเก็บขอบสีรอบวงกบให้คมเรียบร้อย' },
    { n: 45, f: f2, z: Z6, x: 84, y: 86, sev: 'ปานกลาง', st: 'รอแก้ไข', t: 'บานประตูระเบียงชนคานบน ล็อคไม่สนิท สกรูไม่เรียบร้อย', c: 'ระยะบานประตูเบียดคานบนทำให้ล็อคไม่สนิท', s: 'ปรับตั้งบานพับ/ลูกล้อไม่ให้ชนคานและตรวจสอบการล็อคกับสกรูทุกจุด' },

    { n: 46, f: f2, z: Z5, x: 32, y: 49, sev: 'เร่งด่วน', st: 'รอแก้ไข', t: 'ตู้คอนซูมเมอร์ (Consumer Unit) ไม่มีเบรกเกอร์กันดูด (RCBO)', c: 'ตู้ไฟติดตั้งเฉพาะเมนเบรกเกอร์ธรรมดา ไม่มีอุปกรณ์ตัดไฟรั่ว', s: 'ติดตั้งเบรกเกอร์กันดูด (RCBO) พิกัดกระแสรั่วไม่เกิน 30 mA ตามมาตรฐาน วสท.' },
  ];

  const defects: DefectItem[] = rawDefects.map((d) => ({
    id: `def_${d.n}`,
    number: d.n,
    floorId: d.f,
    zone: d.z,
    x: d.x,
    y: d.y,
    title: d.t,
    cause: d.c,
    solution: d.s,
    hideCause: false,
    hideSolution: false,
    severity: d.sev,
    status: d.st,
    beforeImg: null,
    afterImg: null,
    createdAt: '2026-11-25',
  }));

  return {
    id: 'proj_sirinapha_999_18',
    name: 'ตรวจรับบ้านทาวน์โฮม 2 ชั้น - คุณศิรินภา อุ่นศิริ',
    houseNo: '999/18',
    clientName: 'คุณศิรินภา อุ่นศิริ',
    address: 'ทาวน์โฮม 999/18 จ.ขอนแก่น',
    inspectionDate: 'วันพุธที่ 25 พฤศจิกายน พ.ศ. 2569',
    inspectionRound: 'ตรวจรอบที่ 1',
    projectStatus: 'กำลังดำเนินการ',
    floors: [
      { id: f1, name: 'ชั้น 1', subtitle: '4 โซน', imageUrl: null, svgPreset: 0, zones: floor1Zones },
      { id: f2, name: 'ชั้น 2', subtitle: '3 โซน', imageUrl: null, svgPreset: 1, zones: floor2Zones },
    ],
    defects,
  };
}
