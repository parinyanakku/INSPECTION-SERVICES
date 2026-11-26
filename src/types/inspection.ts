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

export type FloorElementType = 'door' | 'window' | 'stairs' | 'wall' | 'entrance';

export interface FloorElement {
  id: string;
  type: FloorElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
  label?: string;
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
  isCustomBuilder?: boolean;
  zones: FloorZone[];
  elements?: FloorElement[];
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

export type GeminiModelId = 'auto' | (string & {});

export interface GeminiApiConfig {
  apiKey: string;
  model: GeminiModelId;
}

export interface ReportTable2Row {
  id: string;
  item: string;
  finding: string;
}

export interface ReportCustomExportSettings {
  includeCover: boolean;
  includeToc: boolean;
  includeIntro: boolean;
  includeStepsAndZones: boolean;
  includeDefectTable: boolean;
  includeSummaryTable2: boolean;
  defectsPerPage: 2 | 3 | 4 | 5 | 'auto';
  defectStatusFilter: 'all' | 'pending_only' | 'fixed_only';
  defectSeverityFilter: 'all' | 'urgent_only';
  defectSelectionMode: 'filter' | 'manual';
  selectedDefectIds: string[];
  showCauseDetails: boolean;
  showSolutionDetails: boolean;
  customFooterNote: string;
}

export interface ReportBookData {
  coverTitle: string;
  propertyCondition: string;
  locationText: string;
  clientName: string;
  inspectionDate: string;
  locationMapImg: string | null;
  frontHouseImg: string | null;
  coverImageMode?: 'front-house' | 'custom' | 'none';
  coverCustomImg?: string | null;
  introContent: string;
  inspectionSteps: string[];
  extraZonePlanImgs: string[];
  table2Rows: ReportTable2Row[];
  closingSummary: string;
  customExport?: ReportCustomExportSettings;
}

