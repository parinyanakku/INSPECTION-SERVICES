import { workspaceStorage, flushWorkspace, writeWorkspaceBatch } from './utils/workspaceStorage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Building2,
  ClipboardList,
  Download,
  FilePlus2,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  HardDriveDownload,
  Home,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  AppLanguage,
  BrandConfig,
  DefectItem,
  DefectStatus,
  FloorPlan,
  GeminiApiConfig,
  ProjectFile,
  ProjectStatus,
  ReportBookData,
  SeverityLevel,
  ToastItem,
  WorkspaceTab,
} from './types/inspection';
import {
  createDefaultSirinaphaProject,
  DEFAULT_BRAND,
  migrateProject,
  STORAGE_KEY_BRAND,
  STORAGE_KEY_LAST_SAVED,
  STORAGE_KEY_PROJECTS,
} from './data/defaultData';
import {
  STORAGE_KEY_LANG,
  UI_TEXT,
  translateDefectStatus,
  translateProjectStatus,
} from './i18n/translations';
import {
  clearGeminiApiKey,
  loadGeminiConfig,
  saveGeminiConfig,
} from './utils/geminiClient';
import {
  exportProjectExcel,
  exportProjectPDF,
  exportProjectWord,
  formatCurrentTime,
  getDefaultSaveAsFilename,
  saveJsonFileWithPickerOrDownload,
} from './utils/imageUtils';
import { BrandLogo } from './components/BrandLogo';
import { VersionUpdate } from './components/VersionUpdate';
import { StudioTab } from './components/StudioTab';
import { DefectListTab } from './components/DefectListTab';
import { ExportTab } from './components/ExportTab';
import {
  ApiKeyGuideModal,
  ApiKeySettingsModal,
  BrandSettingsModal,
  ConfirmModal,
  DefectEditModal,
  LightboxModal,
  PhotoAnnotateModal,
  ProjectModal,
  SaveAsJsonModal,
  ZoneEditModal,
} from './components/Modals';

function loadInitialLang(): AppLanguage {
  try {
    const saved = workspaceStorage.getItem(STORAGE_KEY_LANG);
    if (saved === 'en' || saved === 'th') return saved;
  } catch {
    // ignore storage errors
  }
  return 'th';
}

function loadInitialBrand(): BrandConfig {
  try {
    const raw = workspaceStorage.getItem(STORAGE_KEY_BRAND);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_BRAND,
        companyName: parsed.companyName || DEFAULT_BRAND.companyName,
        subtitle: parsed.subtitle || DEFAULT_BRAND.subtitle,
        tagline: parsed.tagline ?? DEFAULT_BRAND.tagline,
        inspectorName: parsed.inspectorName || DEFAULT_BRAND.inspectorName,
        licenseNo: parsed.licenseNo || DEFAULT_BRAND.licenseNo,
        contactInfo: parsed.contactInfo ?? DEFAULT_BRAND.contactInfo,
        accentColor: parsed.accentColor || DEFAULT_BRAND.accentColor,
        customLogoDataUrl: parsed.customLogoDataUrl ?? null,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_BRAND };
}

function loadInitialProjects(): ProjectFile[] {
  try {
    const raw = workspaceStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(migrateProject);
      }
    }
  } catch {
    // ignore storage errors
  }
  // New accounts start empty; legacy projects are imported only from a chosen backup.
  return [];
}

const WORKSPACE_VIEW_KEY = 'tis_workspace_view_v1';
type WorkspaceView = {projectId:string|null;tab:WorkspaceTab;floorId:string|null};
function loadWorkspaceView(projects:ProjectFile[]):WorkspaceView {
  const empty:WorkspaceView={projectId:null,tab:'studio',floorId:null};
  try{
    const saved=JSON.parse(workspaceStorage.getItem(WORKSPACE_VIEW_KEY)||'null');
    const project=projects.find(p=>p.id===saved?.projectId);
    if(!project)return empty;
    const tab:WorkspaceTab=saved.tab==='list'||saved.tab==='export'?saved.tab:'studio';
    const floorId=project.floors.some(f=>f.id===saved.floorId)?saved.floorId:project.floors[0]?.id||null;
    return {projectId:project.id,tab,floorId};
  }catch{return empty;}
}

export default function App({isAdmin=false,language}:{isAdmin?:boolean;language?:AppLanguage}) {
  const [localLang] = useState<AppLanguage>(loadInitialLang);
  const lang=language??localLang;
  const t = UI_TEXT[lang];

  const [brand, setBrand] = useState<BrandConfig>(loadInitialBrand);
  const [projects, setProjects] = useState<ProjectFile[]>(loadInitialProjects);
  const [lastSavedAt, setLastSavedAt] = useState<string>(() => {
    try {
      return workspaceStorage.getItem(STORAGE_KEY_LAST_SAVED) || '';
    } catch {
      return '';
    }
  });

  const [initialView] = useState(()=>loadWorkspaceView(projects));
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialView.projectId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialView.tab);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(initialView.floorId);
  const [hubSearch, setHubSearch] = useState('');

  // Toasts & PDF export state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const [geminiConfig, setGeminiConfig] = useState<GeminiApiConfig>(loadGeminiConfig);

  // Modals
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showApiKeyGuideModal, setShowApiKeyGuideModal] = useState(false);
  const [projectModalTarget, setProjectModalTarget] = useState<{
    open: boolean;
    project: ProjectFile | null;
  }>({ open: false, project: null });
  const [defectModalTarget, setDefectModalTarget] = useState<{
    open: boolean;
    defectId: string | null;
  }>({ open: false, defectId: null });
  const [annotateTarget, setAnnotateTarget] = useState<{
    defectId: string;
    side: 'before' | 'after';
  } | null>(null);
  const [zoneModalTargetId, setZoneModalTargetId] = useState<string | null>(null);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    confirmStyle?: 'danger' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const jsonImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-color', brand.accentColor || '#1e3a8a');
  }, [brand.accentColor]);

  const notify = useCallback(
    (message: string, type: ToastItem['type'] = 'success') => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    []
  );

  const persistAll = useCallback(
    (nextBrand: BrandConfig, nextProjects: ProjectFile[], showToastMsg = false) => {
      try {
        const ts = formatCurrentTime(lang);
        workspaceStorage.setItem(STORAGE_KEY_BRAND, JSON.stringify(nextBrand));
        workspaceStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(nextProjects));
        workspaceStorage.setItem(STORAGE_KEY_LAST_SAVED, ts);
        void flushWorkspace().then(ok => {
          if(ok) {
            setLastSavedAt(ts);
            if(showToastMsg) notify(lang==='en'?'Saved locally':'บันทึกข้อมูลลงเครื่องเรียบร้อยแล้ว','success');
          } else if(showToastMsg) notify(lang==='en'?'Local save failed; export a backup':'บันทึกไม่สำเร็จ กรุณาสำรองไฟล์ JSON','danger');
        });
        return true;
      } catch {
        notify(
          lang === 'en'
            ? 'Browser storage is almost full. Consider using "Save As New File".'
            : 'พื้นที่จัดเก็บในเบราว์เซอร์ใกล้เต็ม แนะนำให้กด "บันทึกเป็นไฟล์ใหม่" เพื่อสำรองข้อมูล',
          'warning'
        );
        return false;
      }
    },
    [lang, notify]
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const currentFloorId = useMemo(() => {
    if (!activeProject || activeProject.floors.length === 0) return '';
    if (activeFloorId && activeProject.floors.some((f) => f.id === activeFloorId)) {
      return activeFloorId;
    }
    return activeProject.floors[0].id;
  }, [activeProject, activeFloorId]);

  const saveWorkspaceView = useCallback(()=>{
    const value:WorkspaceView={projectId:activeProject?.id||null,tab:activeProject?activeTab:'studio',floorId:currentFloorId||null};
    const raw=JSON.stringify(value);
    if(workspaceStorage.getItem(WORKSPACE_VIEW_KEY)!==raw)workspaceStorage.setItem(WORKSPACE_VIEW_KEY,raw);
  },[activeProject?.id,activeTab,currentFloorId]);
  useEffect(()=>{
    try{saveWorkspaceView();}catch{/* Workspace storage status handles failed writes. */}
  },[saveWorkspaceView]);

  const activeFloor = useMemo(() => {
    if (!activeProject) return null;
    return activeProject.floors.find((f) => f.id === currentFloorId) || activeProject.floors[0] || null;
  }, [activeProject, currentFloorId]);

  const handleUpdateActiveProject = useCallback(
    (updater: (proj: ProjectFile) => ProjectFile, silent = false) => {
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === activeProjectId ? updater(p) : p));
        if (!silent) {
          persistAll(brand, next, false);
        }
        return next;
      });
    },
    [activeProjectId, brand, persistAll]
  );

  const handleSaveBrand = (nextBrand: BrandConfig) => {
    setBrand(nextBrand);
    persistAll(nextBrand, projects, false);
    setShowBrandModal(false);
    notify(
      lang === 'en'
        ? 'Updated company branding & theme'
        : 'อัปเดตข้อมูลบริษัทและธีมเรียบร้อยแล้ว',
      'success'
    );
  };

  const handleSaveProjectModal = (data: {
    id?: string;
    name: string;
    houseNo: string;
    clientName: string;
    address: string;
    inspectionDate: string;
    projectStatus: ProjectStatus;
  }) => {
    let nextProjects: ProjectFile[];
    if (data.id) {
      nextProjects = projects.map((p) =>
        p.id === data.id
          ? {
              ...p,
              name: data.name,
              houseNo: data.houseNo,
              clientName: data.clientName,
              address: data.address,
              inspectionDate: data.inspectionDate,
              projectStatus: data.projectStatus,
            }
          : p
      );
      notify(
        lang === 'en' ? 'Project info updated' : 'แก้ไขข้อมูลโครงการเรียบร้อยแล้ว',
        'success'
      );
    } else {
      const ts = Date.now();
      const f1 = `fl_${ts}_1`;
      const f2 = `fl_${ts}_2`;
      const newProj: ProjectFile = {
        id: `proj_${ts}`,
        name: data.name,
        houseNo: data.houseNo || '-',
        clientName: data.clientName || '-',
        address: data.address || '-',
        inspectionDate: data.inspectionDate,
        inspectionRound: lang === 'en' ? 'Inspection Round 1' : 'ตรวจรอบที่ 1',
        projectStatus: data.projectStatus,
        floors: [
          {
            id: f1,
            name: lang === 'en' ? 'Floor 1' : 'ชั้น 1',
            subtitle: lang === 'en' ? '4 Zones' : '4 โซน',
            imageUrl: null,
            svgPreset: 0,
            zones: [
              { id: `z_${ts}_1`, name: lang === 'en' ? 'Zone 1: Front / Garage' : 'โซน 1: หน้าบ้าน/โรงจอดรถ', x: 5, y: 70, w: 90, h: 25, bg: '#ffedd5', border: '#ea580c' },
              { id: `z_${ts}_2`, name: lang === 'en' ? 'Zone 2: Living Hall 1F' : 'โซน 2: โถงรับแขกชั้น 1', x: 5, y: 25, w: 58, h: 43, bg: '#dbeafe', border: '#2563eb' },
              { id: `z_${ts}_3`, name: lang === 'en' ? 'Zone 3: Kitchen' : 'โซน 3: ห้องครัว', x: 5, y: 5, w: 90, h: 19, bg: '#dcfce7', border: '#16a34a' },
              { id: `z_${ts}_4`, name: lang === 'en' ? 'Zone 4: Bathroom 1F' : 'โซน 4: ห้องน้ำชั้น 1', x: 65, y: 45, w: 30, h: 23, bg: '#fce7f3', border: '#db2777' },
            ],
          },
          {
            id: f2,
            name: lang === 'en' ? 'Floor 2' : 'ชั้น 2',
            subtitle: lang === 'en' ? '3 Zones' : '3 โซน',
            imageUrl: null,
            svgPreset: 1,
            zones: [
              { id: `z_${ts}_5`, name: lang === 'en' ? 'Zone 5: Stair Hall 2F' : 'โซน 5: โถงบันไดชั้น 2', x: 5, y: 38, w: 90, h: 22, bg: '#e0e7ff', border: '#4f46e5' },
              { id: `z_${ts}_6`, name: lang === 'en' ? 'Zone 6: Master Bedroom' : 'โซน 6: ห้องนอนใหญ่', x: 5, y: 62, w: 90, h: 33, bg: '#fef3c7', border: '#d97706' },
              { id: `z_${ts}_7`, name: lang === 'en' ? 'Zone 7: Bedroom 2 & Bath' : 'โซน 7: ห้องนอน 2 & ห้องน้ำ', x: 5, y: 5, w: 90, h: 31, bg: '#fce7f3', border: '#db2777' },
            ],
          },
        ],
        defects: [],
      };
      nextProjects = [newProj, ...projects];
      setHubSearch('');
      notify(
        lang === 'en'
          ? `Created project "${data.name}"`
          : `สร้างแฟ้มโครงการ "${data.name}" เรียบร้อยแล้ว`,
        'success'
      );
    }
    setProjects(nextProjects);
    persistAll(brand, nextProjects, false);
    setProjectModalTarget({ open: false, project: null });
  };

  const handleDeleteProject = (proj: ProjectFile) => {
    setConfirmState({
      title: lang === 'en' ? 'Delete Project' : 'ลบแฟ้มโครงการ',
      message:
        lang === 'en'
          ? `Permanently delete project "${proj.name}" and all ${proj.defects.length} defects?`
          : `ยืนยันการลบแฟ้ม "${proj.name}" และรายการ Defect ทั้งหมด (${proj.defects.length} ข้อ) อย่างถาวรหรือไม่?`,
      confirmText: lang === 'en' ? 'Delete Project' : 'ลบแฟ้มโครงการ',
      confirmStyle: 'danger',
      onConfirm: () => {
        const next = projects.filter((p) => p.id !== proj.id);
        setProjects(next);
        persistAll(brand, next, false);
        if (activeProjectId === proj.id) setActiveProjectId(null);
        setConfirmState(null);
        notify(lang === 'en' ? 'Project deleted' : 'ลบแฟ้มโครงการเรียบร้อยแล้ว', 'info');
      },
    });
  };

  const handleResetDemoProject = () => {
    if(!isAdmin)return;
    setConfirmState({
      title: lang === 'en' ? 'Reset Demo Project' : 'รีเซ็ตแฟ้มตัวอย่างเริ่มต้น',
      message:
        lang === 'en'
          ? 'Restore the demo project "Khun Sirinapha Ounsiri (46 defects, 2 floors, 7 zones)"? Your other projects will not be removed.'
          : 'ต้องการสร้างแฟ้มตัวอย่าง "คุณศิรินภา อุ่นศิริ (46 ข้อ บนแปลน 2 ชั้น 7 โซน)" กลับมาใหม่หรือไม่? (แฟ้มโครงการอื่นของคุณจะไม่ถูกลบ)',
      confirmText: lang === 'en' ? 'Reset Demo' : 'รีเซ็ตแฟ้มตัวอย่าง',
      confirmStyle: 'primary',
      onConfirm: () => {
        if(!isAdmin)return;
        const demo = createDefaultSirinaphaProject();
        setHubSearch('');
        const idx = projects.findIndex((p) => p.id === demo.id);
        const next =
          idx >= 0
            ? projects.map((p, i) => (i === idx ? demo : p))
            : [demo, ...projects];
        setProjects(next);
        persistAll(brand, next, false);
        setConfirmState(null);
        notify(
          lang === 'en'
            ? 'Demo project (46 defects) restored'
            : 'รีเซ็ตแฟ้มตัวอย่าง คุณศิรินภา อุ่นศิริ (46 ข้อ) เรียบร้อยแล้ว',
          'success'
        );
      },
    });
  };

  const collectReportBooks = () => {
    const reportBooks: Record<string, unknown> = {};
    for(const project of projects){const raw=workspaceStorage.getItem('tis_report_book_v1_'+project.id);if(raw){try{reportBooks[project.id]=JSON.parse(raw);}catch{}}}
    return reportBooks;
  };
  const handleBackupAllJson = async () => {
    const payload = {
      reportBooks: collectReportBooks(),
      format: 'TIS_HOME_INSPECTION_BACKUP_V10',
      exportedAt: new Date().toISOString(),
      brand,
      projects,
    };
    const res = await saveJsonFileWithPickerOrDownload(
      payload,
      getDefaultSaveAsFilename('TIS_FullBackup')
    );
    if (res.saved) {
      notify(
        lang === 'en'
          ? `Backed up all data to ${res.fileName}`
          : `สำรองข้อมูลทั้งหมดเป็นไฟล์ ${res.fileName} เรียบร้อยแล้ว`,
        'success'
      );
    }
  };

  const handlePrepareVersionUpdate = async (): Promise<boolean> => {
    // Compatible releases use the same per-account IndexedDB workspace.
    // Persist live state and navigation before leaving this page.
    try{saveWorkspaceView();}catch{return false;}
    if (!persistAll(brand, projects, false)) return false;
    return await flushWorkspace();
  };

  const handleVersionBackup = async (): Promise<boolean> => {
    // Snapshot live project state, not a potentially stale browser copy.
    if (!persistAll(brand, projects, false)) return false;
    if (!await flushWorkspace()) return false;
    const reportBooks: Record<string, unknown> = {};
    for (const project of projects) {
      const raw = workspaceStorage.getItem('tis_report_book_v1_' + project.id);
      if (raw) { try { reportBooks[project.id] = JSON.parse(raw); } catch { /* ignore corrupt report data */ } }
    }
    const result = await saveJsonFileWithPickerOrDownload({
      format: 'TIS_HOME_INSPECTION_BACKUP_V10',
      exportedAt: new Date().toISOString(),
      brand, projects, reportBooks,
    }, getDefaultSaveAsFilename('TIS_BeforeVersionChange'));
    return result.saved;
  };

  const handleBackupSingleProjectJson = async (proj: ProjectFile) => {
    const payload = {
      format: 'TIS_SINGLE_PROJECT_V10',
      exportedAt: new Date().toISOString(),
      project: proj,
    };
    const safeSlug = (proj.houseNo || proj.name || 'project').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const res = await saveJsonFileWithPickerOrDownload(
      payload,
      getDefaultSaveAsFilename(`Project_${safeSlug}`)
    );
    if (res.saved) {
      notify(
        lang === 'en'
          ? `Backed up project "${proj.name}"`
          : `สำรองแฟ้ม "${proj.name}" เรียบร้อยแล้ว`,
        'success'
      );
    }
  };

  const handleConfirmSaveAsJson = async (fileName: string, scope: string) => {
    let payload: unknown;
    if (scope === 'ALL') {
      payload = {
        reportBooks: collectReportBooks(),
        format: 'TIS_HOME_INSPECTION_BACKUP_V10',
        exportedAt: new Date().toISOString(),
        brand,
        projects,
      };
    } else {
      const proj = projects.find((p) => p.id === scope);
      if (!proj) return;
      payload = {
        format: 'TIS_SINGLE_PROJECT_V10',
        exportedAt: new Date().toISOString(),
        project: proj,
      };
    }
    const res = await saveJsonFileWithPickerOrDownload(payload, fileName);
    if (res.saved) {
      setShowSaveAsModal(false);
      notify(
        lang === 'en'
          ? `Saved file ${res.fileName}`
          : `บันทึกไฟล์ ${res.fileName} เรียบร้อยแล้ว`,
        'success'
      );
    }
  };

  const handleJsonImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ''));
        if (parsed.format === 'TIS_ADMIN_PROJECT_ENRICHMENT_V1') {
          if(!isAdmin)throw Error('ไฟล์นี้ใช้สำหรับผู้ดูแลระบบเท่านั้น');
          const target=projects.find(p=>p.id===parsed.projectId);
          if(!target)throw Error('ไม่พบแฟ้มโครงการเดิมที่ตรงกับไฟล์นี้');
          const image=(v:unknown):v is string=>typeof v==='string'&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v);
          const items=parsed.defects;
          if(!Array.isArray(items)||!items.length||items.length>1000||items.some((d:any)=>!d||typeof d.id!=='string'||!Number.isInteger(d.number)||typeof d.title!=='string'||typeof d.zone!=='string'||typeof d.floorId!=='string'||!image(d.beforeImg)||!Number.isFinite(d.x)||!Number.isFinite(d.y)||d.x<0||d.x>100||d.y<0||d.y>100)||new Set(items.map((d:any)=>d.id)).size!==items.length)throw Error('รายการภาพหรือข้อมูล Defect ไม่ถูกต้อง');
          const byId=new Map<string,any>(items.map((d:any)=>[d.id,d]));
          if(items.some((d:any)=>!target.defects.some(x=>x.id===d.id&&x.number===d.number)))throw Error('หมายเลข Defect ในแฟ้มเดิมไม่ตรงกับไฟล์ กรุณาสำรองแฟ้มและตรวจสอบก่อนนำเข้า');
          if(typeof parsed.inspectionDate!=='string'||typeof parsed.address!=='string'||!parsed.reportBook||typeof parsed.reportBook!=='object')throw Error('ข้อมูลรายงานไม่ถูกต้อง');
          const report=parsed.reportBook;
          if(!image(report.locationMapImg)||!image(report.frontHouseImg)||!Array.isArray(report.extraZonePlanImgs)||!report.extraZonePlanImgs.every(image))throw Error('ภาพประกอบรายงานไม่ถูกต้อง');
          const sourceFloors=Array.isArray(parsed.floors)?parsed.floors:[];
          const defaultFloors=createDefaultSirinaphaProject().floors;
          const updatedFloors=new Set<string>();
          const nextFloors=target.floors.map(fl=>{
            const src=sourceFloors.find((x:any)=>x.id===fl.id);
            const original=defaultFloors.find(x=>x.id===fl.id);
            // Never overwrite a custom drawing or an existing uploaded floor plan.
            if(!src||!original||fl.imageUrl||fl.isCustomBuilder||(fl.elements?.length||0)>0||JSON.stringify(fl.zones)!==JSON.stringify(original.zones)||!image(src.imageUrl)||!Array.isArray(src.zones)||src.zones.some((z:any)=>!z||typeof z.name!=='string'||typeof z.id!=='string'||![z.x,z.y,z.w,z.h].every(Number.isFinite)))return fl;
            updatedFloors.add(fl.id);
            return {...fl,imageUrl:src.imageUrl,zones:src.zones,subtitle:lang==='en'?'Source report plan':'แปลนจากรายงานต้นฉบับ'};
          });
          const nextProject={...target,inspectionDate:parsed.inspectionDate,address:parsed.address,floors:nextFloors,defects:target.defects.map(d=>{
            const src=byId.get(d.id);if(!src)return d;
            // Keep prior edits to the correction status, severity, causes, recommendations and existing photos.
            return {...d,title:src.title,beforeImg:d.beforeImg||d.photoDataUrl||src.beforeImg,...(updatedFloors.has(d.floorId)&&d.floorId===src.floorId?{zone:src.zone,x:src.x,y:src.y}:{})};
          })};
          const previousReport=workspaceStorage.getItem('tis_report_book_v1_'+target.id);
          const old=previousReport?JSON.parse(previousReport):{};
          const nextReport={...old,...report,locationMapImg:old.locationMapImg||report.locationMapImg,frontHouseImg:old.frontHouseImg||report.frontHouseImg,extraZonePlanImgs:[...new Set([...(Array.isArray(old.extraZonePlanImgs)?old.extraZonePlanImgs:[]),...report.extraZonePlanImgs])]};
          const nextProjects=projects.map(p=>p.id===target.id?nextProject:p);
          setConfirmState({
            title:'เพิ่มข้อมูลและภาพจากรายงานในแฟ้มเดิม',
            message:'พบภาพ '+items.length+' รายการในแฟ้ม "'+target.name+'" จะปรับชื่อรายการ วันที่ และรายละเอียดรายงาน เพิ่มภาพที่ยังไม่มี และแปลนต้นฉบับเฉพาะแปลนที่ยังไม่แก้ไข (ตำแหน่งหมุดเป็นค่าประมาณตามโซน) โดยไม่ลบแฟ้มอื่น ภาพเดิม หรือสถานะการแก้ไข กรุณาสำรอง JSON ก่อนดำเนินการ',
            confirmText:'เพิ่มข้อมูลในแฟ้มเดิม',
            confirmStyle:'primary',
            onConfirm:async()=>{
              try{
                const ts=formatCurrentTime();
                await writeWorkspaceBatch({[STORAGE_KEY_PROJECTS]:JSON.stringify(nextProjects),[STORAGE_KEY_BRAND]:JSON.stringify(brand),[STORAGE_KEY_LAST_SAVED]:ts,['tis_report_book_v1_'+target.id]:JSON.stringify(nextReport)});
                setProjects(nextProjects);setLastSavedAt(ts);setHubSearch('');setActiveProjectId(null);setConfirmState(null);
                notify('เพิ่มข้อมูลรายงานและภาพในแฟ้มเดิมเรียบร้อยแล้ว','success');
              }catch{setConfirmState(null);notify('นำเข้าไม่สำเร็จ ข้อมูลเดิมยังอยู่ กรุณาตรวจสอบพื้นที่ในเครื่อง','danger');}
            },
          });return;
        }
        if (Array.isArray(parsed.projects)) {
          setConfirmState({
            title: lang === 'en' ? 'Import Full Backup' : 'นำเข้าไฟล์สำรองข้อมูลทั้งหมด',
            message:
              lang === 'en'
                ? `Found ${parsed.projects.length} projects in "${file.name}". Replace current project hub?`
                : `พบแฟ้มโครงการทั้งหมด ${parsed.projects.length} แฟ้มในไฟล์ "${file.name}" คุณต้องการนำเข้าและแทนที่คลังแฟ้มโครงการปัจจุบันหรือไม่?`,
            confirmText: lang === 'en' ? 'Import All' : 'นำเข้าข้อมูลทั้งหมด',
            confirmStyle: 'primary',
            onConfirm: () => {
              const nextProjects = parsed.projects.map(migrateProject);
              const nextBrand = parsed.brand ? { ...DEFAULT_BRAND, ...parsed.brand } : brand;
              setProjects(nextProjects);
              setHubSearch('');
              setBrand(nextBrand);
              setActiveProjectId(null);
              persistAll(nextBrand, nextProjects, false);
              if (parsed.reportBooks && typeof parsed.reportBooks === 'object') {
                try {
                  for (const project of nextProjects) {
                    if (Object.prototype.hasOwnProperty.call(parsed.reportBooks, project.id)) {
                      workspaceStorage.setItem('tis_report_book_v1_' + project.id, JSON.stringify(parsed.reportBooks[project.id]));
                    }
                  }
                } catch {
                  notify(lang === 'en' ? 'Some report details could not be restored: browser storage is full.' : 'กู้คืนรายละเอียดรายงานบางส่วนไม่สำเร็จ: พื้นที่จัดเก็บไม่เพียงพอ', 'warning');
                }
              }
              setConfirmState(null);
              notify(
                lang === 'en'
                  ? `Imported ${nextProjects.length} projects`
                  : `นำเข้า ${nextProjects.length} แฟ้มโครงการเรียบร้อยแล้ว`,
                'success'
              );
            },
          });
          return;
        }

        const singleProj =
          parsed.project || (parsed.id && Array.isArray(parsed.floors) ? parsed : null);
        if (singleProj) {
          const migrated = migrateProject(singleProj);
          setConfirmState({
            title: lang === 'en' ? 'Import Single Project' : 'นำเข้าแฟ้มโครงการเดี่ยว',
            message:
              lang === 'en'
                ? `Found "${migrated.name}" (${(migrated.defects || []).length} defects). Add to your project hub?`
                : `พบแฟ้ม "${migrated.name}" (${(migrated.defects || []).length} รายการ Defect) ต้องการเพิ่มเข้าสู่คลังแฟ้มโครงการของคุณหรือไม่?`,
            confirmText: lang === 'en' ? 'Add Project' : 'เพิ่มแฟ้มโครงการ',
            confirmStyle: 'primary',
            onConfirm: () => {
              const exists = projects.some((p) => p.id === migrated.id);
              const toAdd = exists ? { ...migrated, id: `proj_${Date.now()}` } : migrated;
              const nextProjects = [toAdd, ...projects];
              setHubSearch('');
              setProjects(nextProjects);
              persistAll(brand, nextProjects, false);
              setConfirmState(null);
              notify(
                lang === 'en'
                  ? `Imported "${toAdd.name}"`
                  : `นำเข้าแฟ้ม "${toAdd.name}" เรียบร้อยแล้ว`,
                'success'
              );
            },
          });
          return;
        }
        notify(
          lang === 'en' ? 'Invalid or unsupported JSON file' : 'รูปแบบไฟล์ JSON ไม่ถูกต้องหรือไม่รองรับ',
          'danger'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'JSON Error';
        notify(
          lang === 'en' ? `Cannot read JSON file: ${msg}` : `ไม่สามารถอ่านไฟล์ JSON ได้: ${msg}`,
          'danger'
        );
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Floor / Zone / Defect handlers
  const handleConfirmDeleteFloor = (floor: FloorPlan) => {
    if (!activeProject) return;
    const count = activeProject.defects.filter((d) => d.floorId === floor.id).length;
    setConfirmState({
      title: lang === 'en' ? `Delete "${floor.name}"` : `ลบแปลน "${floor.name}"`,
      message:
        lang === 'en'
          ? `Delete "${floor.name}"? ${count > 0 ? `(${count} defects on this floor will also be deleted)` : ''}`
          : `ยืนยันการลบ "${floor.name}" หรือไม่? ${
              count > 0 ? `(มีรายการ Defect ${count} ข้อในชั้นนี้ที่จะถูกลบไปด้วย)` : ''
            }`,
      confirmText: lang === 'en' ? 'Delete Floor' : 'ลบชั้นนี้',
      confirmStyle: 'danger',
      onConfirm: () => {
        handleUpdateActiveProject((prev) => ({
          ...prev,
          floors: prev.floors.filter((f) => f.id !== floor.id),
          defects: prev.defects.filter((d) => d.floorId !== floor.id),
        }));
        const remaining = activeProject.floors.filter((f) => f.id !== floor.id);
        setActiveFloorId(remaining[0]?.id || null);
        setConfirmState(null);
        notify(
          lang === 'en' ? `Deleted "${floor.name}"` : `ลบ "${floor.name}" เรียบร้อยแล้ว`,
          'info'
        );
      },
    });
  };

  const handleSaveDefectModal = (payload: {
    id?: string;
    title: string;
    floorId: string;
    zone: string;
    severity: SeverityLevel;
    status: DefectStatus;
    cause: string;
    solution: string;
    beforeImg: string | null;
    afterImg: string | null;
  }) => {
    if (!activeProject) return;
    handleUpdateActiveProject((prev) => {
      if (payload.id) {
        return {
          ...prev,
          defects: prev.defects.map((d) =>
            d.id === payload.id
              ? {
                  ...d,
                  title: payload.title,
                  floorId: payload.floorId,
                  zone: payload.zone,
                  severity: payload.severity,
                  status: payload.status,
                  cause: payload.cause,
                  solution: payload.solution,
                  hideCause: !payload.cause,
                  hideSolution: !payload.solution,
                  beforeImg: payload.beforeImg,
                  afterImg: payload.afterImg,
                }
              : d
          ),
        };
      }
      const nextNum =
        prev.defects.length > 0 ? Math.max(...prev.defects.map((x) => x.number || 0)) + 1 : 1;
      const newItem: DefectItem = {
        id: `def_${Date.now()}`,
        number: nextNum,
        floorId: payload.floorId,
        zone: payload.zone,
        x: 50,
        y: 50,
        title: payload.title,
        cause: payload.cause,
        solution: payload.solution,
        hideCause: !payload.cause,
        hideSolution: !payload.solution,
        severity: payload.severity,
        status: payload.status,
        beforeImg: payload.beforeImg,
        afterImg: payload.afterImg,
        createdAt: new Date().toISOString().split('T')[0],
      };
      return { ...prev, defects: [...prev.defects, newItem] };
    });
    setDefectModalTarget({ open: false, defectId: null });
    notify(
      lang === 'en'
        ? 'Defect item and photos saved'
        : 'บันทึกรายการ Defect และรูปภาพเรียบร้อยแล้ว',
      'success'
    );
  };

  const handleConfirmDeleteDefect = (defectId: string) => {
    if (!activeProject) return;
    const d = activeProject.defects.find((x) => x.id === defectId);
    if (!d) return;
    setConfirmState({
      title: lang === 'en' ? `Delete Defect #${d.number}` : `ลบรายการ Defect ข้อที่ #${d.number}`,
      message:
        lang === 'en'
          ? `Remove "${d.title}" from this project?`
          : `ยืนยันการลบรายการ "${d.title}" ออกจากโครงการนี้หรือไม่?`,
      confirmText: lang === 'en' ? 'Delete' : 'ลบรายการ',
      confirmStyle: 'danger',
      onConfirm: () => {
        handleUpdateActiveProject((prev) => ({
          ...prev,
          defects: prev.defects.filter((x) => x.id !== defectId),
        }));
        setDefectModalTarget({ open: false, defectId: null });
        setConfirmState(null);
        notify(lang === 'en' ? 'Defect removed' : 'ลบรายการ Defect เรียบร้อยแล้ว', 'info');
      },
    });
  };

  const handleCycleDefectStatus = (defectId: string) => {
    if (!activeProject) return;
    const d = activeProject.defects.find((x) => x.id === defectId);
    if (!d) return;
    const order: DefectStatus[] = ['รอแก้ไข', 'กำลังแก้ไข', 'แก้ไขแล้ว'];
    const nextStatus = order[(order.indexOf(d.status) + 1) % order.length];
    handleUpdateActiveProject((prev) => ({
      ...prev,
      defects: prev.defects.map((item) =>
        item.id === defectId ? { ...item, status: nextStatus } : item
      ),
    }));
    const label = translateDefectStatus(nextStatus, lang);
    notify(
      lang === 'en'
        ? `Defect #${d.number} status changed to "${label}"`
        : `เปลี่ยนสถานะข้อ #${d.number} เป็น "${label}"`,
      'info'
    );
  };

  const handleUpdateDefectPhoto = (
    defectId: string,
    field: 'beforeImg' | 'afterImg',
    dataUrl: string | null
  ) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      defects: prev.defects.map((item) =>
        item.id === defectId ? { ...item, [field]: dataUrl } : item
      ),
    }));
  };

  const handleExportPDF = async (reportBook?: ReportBookData) => {
    if (!activeProject || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      // Allow React to paint the loading overlay before mounting/rendering the A4 PDF template
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 60));
      });
      const fileName = await exportProjectPDF(activeProject, brand, lang, reportBook);
      notify(
        lang === 'en'
          ? `Downloaded ${fileName}`
          : `ดาวน์โหลดไฟล์ ${fileName} เรียบร้อยแล้ว`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF error';
      notify(
        lang === 'en'
          ? `Failed to generate PDF: ${msg}`
          : `สร้างไฟล์ PDF ไม่สำเร็จ: ${msg}`,
        'danger'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportWord = async (reportBook?: ReportBookData) => {
    if (!activeProject) return;
    await exportProjectWord(activeProject, brand, lang, reportBook);
    notify(
      lang === 'en'
        ? 'Downloaded Word report (.docx)'
        : 'ดาวน์โหลดรายงาน Word (.docx) เรียบร้อยแล้ว',
      'success'
    );
  };

  const handleExportExcel = async () => {
    if (!activeProject) return;
    try {
    const kind = await exportProjectExcel(activeProject, brand, lang);
    notify(
      kind === 'xlsx'
        ? lang === 'en'
          ? 'Downloaded Excel report (.xlsx)'
          : 'ดาวน์โหลดรายงาน Excel (.xlsx) เรียบร้อยแล้ว'
        : lang === 'en'
        ? 'Downloaded fallback CSV report'
        : 'ดาวน์โหลดรายงานเป็นไฟล์ CSV สำรองเรียบร้อยแล้ว',
      kind === 'xlsx' ? 'success' : 'info'
    );
    } catch(err) {
      console.error(err);
      notify(lang==='en'?'Excel report export failed. Please try again.':'สร้างเล่มรายงาน Excel ไม่สำเร็จ กรุณาลองใหม่','danger');
    }
  };

  // Filtered projects in Hub
  const filteredProjects = useMemo(() => {
    const q = hubSearch.trim().toLowerCase();
    return projects.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.houseNo.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [projects, hubSearch]);

  const activeProjectsCount = useMemo(
    () => projects.filter((p) => p.projectStatus !== 'ตรวจเสร็จสิ้น').length,
    [projects]
  );

  const editingDefect = useMemo(() => {
    if (!activeProject || !defectModalTarget.defectId) return null;
    return activeProject.defects.find((d) => d.id === defectModalTarget.defectId) || null;
  }, [activeProject, defectModalTarget]);

  const annotatingDefect = useMemo(() => {
    if (!activeProject || !annotateTarget) return null;
    return activeProject.defects.find((d) => d.id === annotateTarget.defectId) || null;
  }, [activeProject, annotateTarget]);

  const editingZone = useMemo(() => {
    if (!activeFloor || !zoneModalTargetId) return null;
    return activeFloor.zones.find((z) => z.id === zoneModalTargetId) || null;
  }, [activeFloor, zoneModalTargetId]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast Stack */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0 no-print">
        {toasts.map((toast) => {
          const styleMap: Record<ToastItem['type'], string> = {
            success: 'bg-slate-900 text-white border-emerald-500/40',
            info: 'bg-blue-950 text-white border-blue-400/40',
            warning: 'bg-amber-950 text-white border-amber-400/40',
            danger: 'bg-rose-950 text-white border-rose-400/40',
          };
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-xs sm:text-sm font-medium ${styleMap[toast.type]}`}
            >
              <span className="flex-1 leading-snug">{toast.message}</span>
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 no-print">
        {/* Global White-Label Header */}
        <header className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 mb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="p-1.5 bg-slate-50 rounded-xl border border-slate-200 shrink-0">
                <BrandLogo brand={brand} className="w-12 h-12 sm:w-14 sm:h-14" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h1 className="text-lg sm:text-xl font-extrabold tracking-tight brand-text truncate">
                    {brand.companyName}
                  </h1>
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {brand.subtitle}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>
                    {t.inspectorLabel}: <strong className="text-slate-900">{brand.inspectorName}</strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {t.licenseLabel}:{' '}
                    <strong className="text-slate-900 font-mono-num">{brand.licenseNo}</strong>
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <VersionUpdate lang={lang} onBackup={handleVersionBackup} onPrepare={handlePrepareVersionUpdate} />
              <button
                type="button"
                onClick={() => setShowBrandModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Palette className="w-4 h-4" />
                {t.editBrandBtn}
              </button>
              {activeProject ? (
                <button
                  type="button"
                  onClick={() => setActiveProjectId(null)}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  {t.projectHubBtn}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setProjectModalTarget({ open: true, project: null })}
                  className="px-4 py-2 rounded-xl brand-bg hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-opacity flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  {t.newProjectBtn}
                </button>
              )}

            </div>
          </div>

          {/* Client-Side Gemini API Key Status & Controls Bar */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold whitespace-nowrap ${
                  geminiConfig.apiKey
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {geminiConfig.apiKey ? t.apiKeyStatusReady : t.apiKeyStatusMissing}
              </span>
              {geminiConfig.apiKey && (
                <span className="text-[11px] font-mono-num text-slate-500">
                  {geminiConfig.model === 'auto' ? t.apiKeyAutoBadge : geminiConfig.model}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowApiKeyGuideModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.apiKeyGuideBtn}
              </button>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.apiKeySettingsBtn}
              </button>
            </div>
          </div>
        </header>

        {/* VIEW 1: PROJECT HUB */}
        {!activeProject ? (
          <div className="space-y-5">
            {/* JSON File Management Bar */}
            <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                    {t.dataMgmtTitle}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">{t.dataMgmtDesc}</p>
                </div>
                <span className="text-xs font-medium text-slate-500 tabular-nums shrink-0">
                  {lastSavedAt ? `${t.lastSavedPrefix} ${lastSavedAt}` : t.readyToSave}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => persistAll(brand, projects, true)}
                  className="px-4 py-2 rounded-xl brand-bg hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-opacity flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {t.saveBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveAsModal(true)}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  {t.saveAsBtn}
                </button>
                <button
                  type="button"
                  onClick={handleBackupAllJson}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <HardDriveDownload className="w-4 h-4" />
                  {t.backupAllBtn}
                </button>
                <button
                  type="button"
                  onClick={() => jsonImportRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  {t.importJsonBtn}
                </button>
              </div>
            </section>

            {/* 2 Summary KPI Cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-500">
                    {t.totalProjectsLabel}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                      {projects.length}
                    </span>
                    <span className="text-sm font-medium text-slate-500">{t.unitFiles}</span>
                  </div>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-500">
                    {t.activeProjectsLabel}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-amber-600 tabular-nums">
                      {activeProjectsCount}
                    </span>
                    <span className="text-sm font-medium text-slate-500">{t.unitFiles}</span>
                  </div>
                </div>
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
              </div>
            </section>

            {/* Search & Reset Bar */}
            <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  name="inspection-project-filter"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  aria-label={t.hubSearchPlaceholder}
                  value={hubSearch}
                  onChange={(e) => setHubSearch(e.target.value)}
                  placeholder={t.hubSearchPlaceholder}
                  className="w-full pl-10 pr-12 py-2.5 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={()=>setHubSearch('')} aria-label={lang==='en'?'Clear project search':'ล้างการค้นหา'} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-white rounded text-slate-500 hover:text-blue-700 text-xs font-semibold">{lang==='en'?'Clear':'ล้าง'}</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin&&<button
                  type="button"
                  onClick={handleResetDemoProject}
                  className="text-xs sm:text-sm px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t.resetDemoBtn}
                </button>}
                <button
                  type="button"
                  onClick={() => setProjectModalTarget({ open: true, project: null })}
                  className="text-xs sm:text-sm px-4 py-2 rounded-xl brand-bg hover:opacity-95 text-white font-semibold transition-opacity flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  {t.newProjectBtn}
                </button>
              </div>
            </section>

            {/* Project Cards Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.length === 0 ? (
                <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
                  <p className="text-sm font-medium">{t.noProjectsFound}</p>
                  {projects.length>0&&<button type="button" onClick={()=>setHubSearch('')} className="mt-3 text-blue-700 underline text-sm">{lang==='en'?'Show all projects':'แสดงแฟ้มโครงการทั้งหมด'}</button>}
                </div>
              ) : (
                filteredProjects.map((p) => {
                  const total = p.defects.length;
                  const fixed = p.defects.filter((d) => d.status === 'แก้ไขแล้ว').length;
                  const urgent = p.defects.filter(
                    (d) => d.severity === 'เร่งด่วน' && d.status !== 'แก้ไขแล้ว'
                  ).length;
                  const pct = total > 0 ? Math.round((fixed / total) * 100) : 0;
                  const totalZones = p.floors.reduce(
                    (acc, fl) => acc + (fl.zones?.length || 0),
                    0
                  );

                  return (
                    <article
                      key={p.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition-colors flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`text-xs font-bold ${
                              p.projectStatus === 'ตรวจเสร็จสิ้น'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {translateProjectStatus(p.projectStatus || 'กำลังดำเนินการ', lang)}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setProjectModalTarget({ open: true, project: p })
                              }
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                              title={t.editProjectTooltip}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBackupSingleProjectJson(p)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                              title={t.backupProjectTooltip}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(p)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 cursor-pointer"
                              title={t.deleteProjectTooltip}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug">
                          {p.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-2">
                          <span>{p.address}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {t.houseNoPrefix} {p.houseNo}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 tabular-nums">
                          <span>{p.inspectionDate || '-'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {p.floors.length} {t.floorsWord} / {totalZones} {t.zonesWord}
                          </span>
                        </p>

                        {/* Clean Tabular Summary Row */}
                        <div className="grid grid-cols-3 divide-x divide-slate-200 mt-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                          <div>
                            <div className="text-[11px] text-slate-500">{t.statTotal}</div>
                            <div className="text-lg font-extrabold text-slate-900 tabular-nums">
                              {total}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-rose-600 font-medium">
                              {t.statUrgent}
                            </div>
                            <div className="text-lg font-extrabold text-rose-600 tabular-nums">
                              {urgent}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-emerald-700 font-medium">
                              {t.statFixed}
                            </div>
                            <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                              {fixed}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3.5">
                          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1 tabular-nums">
                            <span>{t.repairProgress}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProjectId(p.id);
                            setActiveTab('studio');
                            setActiveFloorId(p.floors[0]?.id || null);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl brand-bg hover:opacity-95 text-white text-sm font-semibold transition-opacity cursor-pointer"
                        >
                          {t.openStudioBtn}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>
        ) : (
          /* VIEW 2: ACTIVE PROJECT WORKSPACE */
          <div className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base sm:text-xl font-bold text-slate-900">
                    {activeProject.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2">
                    <span>
                      {t.houseNoPrefix} {activeProject.houseNo}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeProject.address}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeProject.inspectionDate}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setProjectModalTarget({ open: true, project: activeProject })
                    }
                    className="text-xs px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t.editProjectShort}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBackupSingleProjectJson(activeProject)}
                    className="text-xs px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {t.backupProjectShort}
                  </button>
                  <button
                    type="button"
                    onClick={() => persistAll(brand, projects, true)}
                    className="text-xs px-3.5 py-2 rounded-xl brand-bg text-white font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {t.saveShort}
                  </button>
                </div>
              </div>

              {/* 3 Segmented Workspace Tabs */}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('studio')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'studio'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  {t.tabStudio}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
                    activeTab === 'list'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {t.tabList} ({activeProject.defects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('export')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'export'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  {t.tabExport}
                </button>
              </div>
            </section>

            {activeTab === 'studio' && (
              <StudioTab
                lang={lang}
                project={activeProject}
                activeFloorId={currentFloorId}
                onSelectFloor={(id) => setActiveFloorId(id)}
                onUpdateProject={handleUpdateActiveProject}
                onOpenDefectModal={(defectId) =>
                  setDefectModalTarget({ open: true, defectId })
                }
                onOpenZoneModal={(zoneId) => setZoneModalTargetId(zoneId)}
                onConfirmDeleteFloor={handleConfirmDeleteFloor}
                onOpenLightbox={(src, caption) => setLightbox({ src, caption })}
                onRequireApiKey={() => setShowApiKeyModal(true)}
                onNotify={notify}
              />
            )}

            {activeTab === 'list' && (
              <DefectListTab
                lang={lang}
                project={activeProject}
                onEditDefect={(defectId) =>
                  setDefectModalTarget({ open: true, defectId })
                }
                onAnnotateDefectPhoto={(defectId, side) =>
                  setAnnotateTarget({ defectId, side })
                }
                onDeleteDefect={handleConfirmDeleteDefect}
                onCycleStatus={handleCycleDefectStatus}
                onUpdateDefectPhoto={handleUpdateDefectPhoto}
                onOpenLightbox={(src, caption) => setLightbox({ src, caption })}
                onNotify={notify}
              />
            )}

            {activeTab === 'export' && (
              <ExportTab
                lang={lang}
                project={activeProject}
                brand={brand}
                isExportingPdf={isExportingPdf}
                onExportPDF={handleExportPDF}
                onExportWord={handleExportWord}
                onExportExcel={handleExportExcel}
                onNotify={notify}
              />
            )}
          </div>
        )}
      </main>

      {/* Full-Screen PDF Generation Overlay (covers #pdfRenderContainer at z-index 9998) */}
      {isExportingPdf && (
        <div
          className="pdf-loading-overlay fixed inset-0 z-[9999] bg-slate-900/80 flex items-center justify-center p-4"
          role="status"
          aria-live="polite"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl px-6 py-6 max-w-sm w-full text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3.5">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <h4 className="text-base font-bold text-slate-900">{t.pdfGeneratingBtn}</h4>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
              {t.pdfLoadingSub}
            </p>
          </div>
        </div>
      )}

      {/* Hidden JSON Import Input */}
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleJsonImportFile}
      />

      {/* Modals */}
      {showBrandModal && (
        <BrandSettingsModal
          lang={lang}
          brand={brand}
          onClose={() => setShowBrandModal(false)}
          onSave={handleSaveBrand}
          onNotify={notify}
        />
      )}

      {projectModalTarget.open && (
        <ProjectModal
          lang={lang}
          project={projectModalTarget.project}
          onClose={() => setProjectModalTarget({ open: false, project: null })}
          onSave={handleSaveProjectModal}
          onNotify={notify}
        />
      )}

      {defectModalTarget.open && activeProject && (
        <DefectEditModal
          lang={lang}
          project={activeProject}
          defect={editingDefect}
          defaultFloorId={currentFloorId}
          onClose={() => setDefectModalTarget({ open: false, defectId: null })}
          onSave={handleSaveDefectModal}
          onDelete={handleConfirmDeleteDefect}
          onOpenLightbox={(src, caption) => setLightbox({ src, caption })}
          onNotify={notify}
        />
      )}

      {annotateTarget && annotatingDefect && (
        <PhotoAnnotateModal
          lang={lang}
          side={annotateTarget.side}
          initialImageSrc={
            annotateTarget.side === 'before'
              ? annotatingDefect.beforeImg
              : annotatingDefect.afterImg
          }
          onClose={() => setAnnotateTarget(null)}
          onSavePhoto={(dataUrl) => {
            handleUpdateDefectPhoto(
              annotatingDefect.id,
              annotateTarget.side === 'before' ? 'beforeImg' : 'afterImg',
              dataUrl
            );
            setAnnotateTarget(null);
            notify(
              lang === 'en'
                ? 'Annotated photo saved'
                : 'บันทึกภาพที่ขีดเขียนเรียบร้อยแล้ว',
              'success'
            );
          }}
          onNotify={notify}
        />
      )}

      {zoneModalTargetId && activeFloor && editingZone && (
        <ZoneEditModal
          lang={lang}
          floor={activeFloor}
          zone={editingZone}
          onClose={() => setZoneModalTargetId(null)}
          onSaveName={(zoneId, newName, bg, border) => {
            const oldName = editingZone.name;
            handleUpdateActiveProject((prev) => ({
              ...prev,
              floors: prev.floors.map((fl) =>
                fl.id === activeFloor.id
                  ? {
                      ...fl,
                      zones: fl.zones.map((z) =>
                        z.id === zoneId ? { ...z, name: newName, bg, border } : z
                      ),
                    }
                  : fl
              ),
              defects: prev.defects.map((d) =>
                d.floorId === activeFloor.id && d.zone === oldName
                  ? { ...d, zone: newName }
                  : d
              ),
            }));
            setZoneModalTargetId(null);
            notify(
              lang === 'en' ? 'Zone updated' : 'บันทึกการตั้งค่าโซนเรียบร้อยแล้ว',
              'success'
            );
          }}
          onDelete={(zoneId) => {
            handleUpdateActiveProject((prev) => ({
              ...prev,
              floors: prev.floors.map((fl) =>
                fl.id === activeFloor.id
                  ? { ...fl, zones: fl.zones.filter((z) => z.id !== zoneId) }
                  : fl
              ),
            }));
            setZoneModalTargetId(null);
            notify(lang === 'en' ? 'Zone deleted' : 'ลบโซนเรียบร้อยแล้ว', 'info');
          }}
        />
      )}

      {showSaveAsModal && (
        <SaveAsJsonModal
          lang={lang}
          projects={projects}
          onClose={() => setShowSaveAsModal(false)}
          onConfirmSaveAs={handleConfirmSaveAsJson}
        />
      )}

      {confirmState && (
        <ConfirmModal
          lang={lang}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          confirmStyle={confirmState.confirmStyle}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}

      {lightbox && (
        <LightboxModal
          lang={lang}
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}

      {showApiKeyModal && (
        <ApiKeySettingsModal
          lang={lang}
          config={geminiConfig}
          onClose={() => setShowApiKeyModal(false)}
          onSave={(next) => {
            saveGeminiConfig(next);
            setGeminiConfig(next);
            setShowApiKeyModal(false);
            notify(
              lang === 'en'
                ? next.apiKey
                  ? `Saved Gemini API Key (${next.model})`
                  : 'Saved model settings (no API key set)'
                : next.apiKey
                ? `บันทึก Gemini API Key แล้ว (${next.model})`
                : 'บันทึกการตั้งค่าโมเดลแล้ว (ยังไม่ได้ใส่ API Key)',
              next.apiKey ? 'success' : 'info'
            );
          }}
          onDeleteKey={() => {
            clearGeminiApiKey();
            setGeminiConfig((prev) => ({ ...prev, apiKey: '' }));
            notify(
              lang === 'en' ? 'API Key removed' : 'ลบ Gemini API Key เรียบร้อยแล้ว',
              'info'
            );
          }}
          onOpenGuide={() => {
            setShowApiKeyModal(false);
            setShowApiKeyGuideModal(true);
          }}
        />
      )}

      {showApiKeyGuideModal && (
        <ApiKeyGuideModal
          lang={lang}
          onClose={() => setShowApiKeyGuideModal(false)}
          onGoToSettings={() => {
            setShowApiKeyGuideModal(false);
            setShowApiKeyModal(true);
          }}
        />
      )}
    </div>
  );
}
