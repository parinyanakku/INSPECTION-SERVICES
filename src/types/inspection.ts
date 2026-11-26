export type AppLanguage = 'th' | 'en';

export type SeverityLevel = 'เร่งด่วน' | 'ปานกลาง' | 'เล็กน้อย';

export type DefectStatus = 'รอแก้ไข' | 'กำลังแก้ไข' | 'แก้ไขแล้ว';

export type ProjectStatus = 'กำลังดำเนินการ' | 'ตรวจเสร็จสิ้น';

export type MarkupTool = 'pen' | 'circle' | 'arrow' | 'rect' | 'text';

export type WorkspaceTab = 'studio' | 'list' | 'export';

export interface BrandConfig {
  companyName: string;
  subtitle: string;
  tagline: string;
  inspectorName: string;
  licenseNo: string;
  contactInfo: string;
  accentColor: string;
  customLogoDataUrl: string | null;
}

export interface FloorZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  border: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  subtitle?: string;
  imageUrl: string | null;
  svgPreset: number;
  zones: FloorZone[];
}

export interface DefectItem {
  id: string;
  number: number;
  floorId: string;
  zone: string;
  x: number;
  y: number;
  title: string;
  cause: string;
  solution: string;
  hideCause: boolean;
  hideSolution: boolean;
  severity: SeverityLevel;
  status: DefectStatus;
  beforeImg: string | null;
  afterImg: string | null;
  photoDataUrl?: string | null;
  createdAt: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  houseNo: string;
  clientName: string;
  address: string;
  inspectionDate: string;
  inspectionRound: string;
  projectStatus: ProjectStatus;
  floors: FloorPlan[];
  defects: DefectItem[];
}

export interface DraftDefect {
  id: string;
  fromAI: boolean;
  title: string;
  severity: SeverityLevel;
  cause: string;
  solution: string;
  hideCause: boolean;
  hideSolution: boolean;
  photoDataUrl: string | null;
}

export interface MarkupShape {
  tool: MarkupTool;
  color: string;
  lineWidth: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: Array<{ x: number; y: number }>;
  text?: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'danger';
}
