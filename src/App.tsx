import { workspaceStorage, flushWorkspace, writeWorkspaceBatch } from './utils/workspaceStorage';
import {consumePreparedProjects} from './utils/verifiedProjects';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowUp,
  ArrowDown,
  Building2,
  BookOpen,
  Globe,
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
  clearLegacyBuyerIdentity,
  migrateProject,
  orderProjectDefects,
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
  isWordPdfConverterConfigured,
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
import { ClientWebsiteTab } from './components/ClientWebsiteTab';
import { BuyerTour,buyerTourSeen,markBuyerTourSeen } from './components/BuyerTour';
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

function loadInitialBrand(isAdmin=false): BrandConfig {
  try {
    const raw = workspaceStorage.getItem(STORAGE_KEY_BRAND);
    if (raw) {
      const parsed = JSON.parse(raw);
      return clearLegacyBuyerIdentity({
        ...DEFAULT_BRAND,
        companyName: parsed.companyName || DEFAULT_BRAND.companyName,
        subtitle: typeof parsed.subtitle==='string'?parsed.subtitle:DEFAULT_BRAND.subtitle,
        tagline: parsed.tagline ?? DEFAULT_BRAND.tagline,
        inspectorName: typeof parsed.inspectorName==='string'?parsed.inspectorName:DEFAULT_BRAND.inspectorName,
        licenseNo: typeof parsed.licenseNo==='string'?parsed.licenseNo:DEFAULT_BRAND.licenseNo,
        contactInfo: parsed.contactInfo ?? DEFAULT_BRAND.contactInfo,
        accentColor: parsed.accentColor || DEFAULT_BRAND.accentColor,
        customLogoDataUrl: parsed.customLogoDataUrl ?? null,
      },isAdmin);
    }
  } catch {
    // ignore storage errors
  }
  return clearLegacyBuyerIdentity({ ...DEFAULT_BRAND },isAdmin);
}

function loadInitialProjects(): ProjectFile[] {
  try {
    const raw = workspaceStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      return consumePreparedProjects(raw).map(migrateProject);
    }
  } catch(error) {
    console.error('Could not read saved project record',error);
    throw Error('Saved project data could not be opened. No local data was reset.');
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
    const tab:WorkspaceTab=saved.tab==='list'||saved.tab==='export'||saved.tab==='client'?saved.tab:'studio';
    const floorId=project.floors.some(f=>f.id===saved.floorId)?saved.floorId:project.floors[0]?.id||null;
    return {projectId:project.id,tab,floorId};
  }catch{return empty;}
}

const PAGE_THEMES=[{id:'light',th:'สว่าง (เดิม)',en:'Light (original)'},{id:'dark',th:'มืด',en:'Dark'},{id:'blue',th:'ฟ้าอ่อน',en:'Soft blue'},{id:'warm',th:'ครีม',en:'Warm cream'},{id:'mint',th:'เขียวอ่อน',en:'Soft mint'}] as const;
type PageTheme=typeof PAGE_THEMES[number]['id'];
const PAGE_THEME_KEY='inspection.page-theme.v1';
const PAGE_THEME_CSS="\n@media screen {\n  html[data-inspection-theme=\"blue\"] {--ui-bg:#e8f0fa;--ui-card:#f8fbff;--ui-soft:#edf4fc;--ui-muted:#e0ebf8;--ui-border:#c3d5eb;--ui-ink:#172d47;--ui-secondary:#425e7c;--ui-subtle:#59718c;}\n  html[data-inspection-theme=\"warm\"] {--ui-bg:#f2eee6;--ui-card:#fffdf8;--ui-soft:#f7f3ea;--ui-muted:#ede6d9;--ui-border:#dcd1bf;--ui-ink:#342c23;--ui-secondary:#665744;--ui-subtle:#776753;}\n  html[data-inspection-theme=\"mint\"] {--ui-bg:#e8f1ed;--ui-card:#f8fdfb;--ui-soft:#edf5f1;--ui-muted:#dcebe4;--ui-border:#c3d8cc;--ui-ink:#18392e;--ui-secondary:#426558;--ui-subtle:#58766b;}\n  html[data-inspection-theme=\"dark\"] {--ui-bg:#111827;--ui-card:#1e293b;--ui-soft:#253247;--ui-muted:#334155;--ui-border:#475569;--ui-ink:#f1f5f9;--ui-secondary:#cbd5e1;--ui-subtle:#aebed1;color-scheme:dark;}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) body {background:var(--ui-bg);color:var(--ui-ink);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.bg-white,.bg-slate-50,.bg-slate-100,.bg-slate-200) {background-color:var(--ui-card);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.bg-slate-50,[class~=\"bg-slate-50/50\"],[class~=\"bg-slate-50/60\"],[class~=\"bg-white/80\"]) {background-color:var(--ui-soft);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.bg-slate-100,.bg-slate-200,[class~=\"hover:bg-slate-100\"]:hover,[class~=\"hover:bg-slate-200\"]:hover,[class~=\"hover:bg-slate-50\"]:hover) {background-color:var(--ui-muted);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.border-slate-100,.border-slate-200,.border-slate-300,.border-slate-400,.divide-slate-200) {border-color:var(--ui-border);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.text-slate-950,.text-slate-900,.text-slate-800,.text-slate-700) {color:var(--ui-ink);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.text-slate-600,.text-slate-500) {color:var(--ui-secondary);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(.text-slate-400,.text-slate-300) {color:var(--ui-subtle);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(input:not([type=\"range\"]):not([type=\"color\"]):not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"file\"]),textarea,select) {background-color:var(--ui-card);color:var(--ui-ink);border-color:var(--ui-border);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) :is(input,textarea)::placeholder {color:var(--ui-subtle);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) ::-webkit-scrollbar-track {background:var(--ui-soft);}\n  html[data-inspection-theme]:not([data-inspection-theme=\"light\"]) ::-webkit-scrollbar-thumb {background:var(--ui-border);}\n  html[data-inspection-theme=\"dark\"] :is(.bg-blue-50,.bg-blue-100,[class~=\"bg-blue-50/50\"],[class~=\"hover:bg-blue-100\"]:hover) {background-color:#233d65;}\n  html[data-inspection-theme=\"dark\"] :is(.bg-indigo-50,.bg-indigo-100,[class~=\"bg-indigo-50/50\"]) {background-color:#343462;}\n  html[data-inspection-theme=\"dark\"] :is(.bg-rose-50,.bg-rose-100,[class~=\"bg-rose-50/30\"],.bg-red-50,.bg-red-100) {background-color:#502b3a;}\n  html[data-inspection-theme=\"dark\"] :is(.bg-emerald-50,.bg-emerald-100,[class~=\"bg-emerald-50/30\"],.bg-green-50,.bg-green-100) {background-color:#20473c;}\n  html[data-inspection-theme=\"dark\"] :is(.bg-amber-50,.bg-amber-100,.bg-orange-50,.bg-yellow-50,.bg-yellow-100) {background-color:#504022;}\n  html[data-inspection-theme=\"dark\"] :is(.bg-purple-50,.bg-purple-100,.bg-violet-50,.bg-violet-100) {background-color:#40345e;}\n  html[data-inspection-theme=\"dark\"] :is(.text-blue-900,.text-blue-800,.text-blue-700,.text-blue-600,.text-blue-500) {color:#9ec5ff;}\n  html[data-inspection-theme=\"dark\"] :is(.text-indigo-900,.text-indigo-800,.text-indigo-700,.text-indigo-600) {color:#c4c9ff;}\n  html[data-inspection-theme=\"dark\"] :is(.text-rose-900,.text-rose-800,.text-rose-700,.text-rose-600,.text-rose-500,.text-red-700,.text-red-600,.text-red-500) {color:#ffabb8;}\n  html[data-inspection-theme=\"dark\"] :is(.text-emerald-900,.text-emerald-800,.text-emerald-700,.text-emerald-600,.text-green-700,.text-green-600) {color:#85e4b9;}\n  html[data-inspection-theme=\"dark\"] :is(.text-amber-900,.text-amber-800,.text-amber-700,.text-amber-600,.text-orange-700,.text-orange-600,.text-yellow-700) {color:#f9cd80;}\n  html[data-inspection-theme=\"dark\"] :is(.text-purple-700,.text-purple-600,.text-violet-700,.text-violet-600) {color:#d6b5ff;}\n  html[data-inspection-theme=\"dark\"] :is(.border-blue-200,.border-indigo-200,.border-rose-200,.border-emerald-200,.border-amber-200) {border-color:var(--ui-border);}\n  html[data-inspection-theme=\"dark\"] .brand-text {color:color-mix(in srgb,var(--brand-color) 48%,white);}\n  /* Keep canvas and plan pixels/zone backgrounds unchanged. */\n  html[data-inspection-theme=\"dark\"] .zone-box {color:#fff;}\n\n  /* Match translucent Tailwind surfaces as well as their solid variants.\n     Keep the solution text readable on a genuinely dark green surface. */\n  html[data-inspection-theme=\"dark\"] :is([class~=\"bg-emerald-50/70\"],[class~=\"bg-emerald-50/30\"]) {background-color:#183e33;border-color:#407864;color:#c2f5db;}\n  html[data-inspection-theme=\"dark\"] [class~=\"bg-emerald-50/70\"] strong {color:#a7f3d0;}\n  html[data-inspection-theme=\"dark\"] :is([class~=\"bg-blue-100/70\"],[class~=\"bg-blue-50/40\"],[class~=\"bg-blue-50/70\"]) {background-color:#233d65;}\n  html[data-inspection-theme=\"dark\"] :is([class~=\"bg-slate-50/70\"],[class~=\"bg-slate-100/60\"],[class~=\"bg-slate-100/70\"],[class~=\"bg-slate-200/40\"]) {background-color:var(--ui-soft);}\n  html[data-inspection-theme=\"dark\"] :is([class~=\"border-emerald-200/70\"],.border-emerald-300) {border-color:#407864;}\n  html[data-inspection-theme=\"dark\"] :is([class~=\"hover:bg-emerald-50\"]:hover,[class~=\"hover:bg-emerald-100\"]:hover) {background-color:#245744;}\n  html[data-inspection-theme=\"dark\"] :is([class~=\"hover:bg-rose-100\"]:hover,[class~=\"hover:bg-rose-200\"]:hover) {background-color:#653847;}\n  html[data-inspection-theme=\"dark\"] :is(.text-indigo-400,.text-blue-400) {color:#b6caff;}\n}\n";
function readPageTheme():PageTheme{try{const saved=localStorage.getItem(PAGE_THEME_KEY);return PAGE_THEMES.find(t=>t.id===saved)?.id||'light';}catch{return 'light';}}

export default function App({isAdmin=false,language,autoRestoreSafe,onOpenDrive}:{isAdmin?:boolean;language?:AppLanguage;autoRestoreSafe?:React.MutableRefObject<boolean>;onOpenDrive?:()=>void}) {
  const [localLang] = useState<AppLanguage>(loadInitialLang);
  const lang=language??localLang;
  const t = UI_TEXT[lang];

  const [brand, setBrand] = useState<BrandConfig>(()=>loadInitialBrand(isAdmin));
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
  const [tourActive,setTourActive]=useState(false);
  const [mobileSettings,setMobileSettings]=useState(false);
  const [tourOffer,setTourOffer]=useState(()=>!isAdmin&&!buyerTourSeen());
  const closeTour=useCallback(()=>{setTourActive(false);setTourOffer(false);markBuyerTourSeen();},[]);
  const startTour=()=>{setTourOffer(false);setTourActive(true);markBuyerTourSeen();};
  const [pageTheme,setPageTheme]=useState<PageTheme>(readPageTheme);
  React.useLayoutEffect(()=>{document.documentElement.dataset.inspectionTheme=pageTheme;try{localStorage.setItem(PAGE_THEME_KEY,pageTheme);}catch{}return()=>{delete document.documentElement.dataset.inspectionTheme;};},[pageTheme]);

  // Toasts & PDF export state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const exportLock=useRef(false);
  const exportController=useRef<AbortController|null>(null);
  const [exportCancelling,setExportCancelling]=useState(false);
  const [exportBatch,setExportBatch]=useState<{all:boolean;format:'PDF'|'Word'|'Excel';index:number;total:number}|null>(null);
  const [pdfOverlayVisible,setPdfOverlayVisible]=useState(false);
  const [pdfProgress,setPdfProgress]=useState({done:0,total:0});
  const pdfJobRef=useRef<AbortController|null>(null);
  const cancelReportExports=()=>{if(!exportController.current)return;setExportCancelling(true);exportController.current.abort();};
  const cancelPdf=()=>{cancelReportExports();setPdfOverlayVisible(false);};
  useEffect(()=>()=>{exportController.current?.abort();pdfJobRef.current?.abort();},[]);

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

  const [showBackToTop,setShowBackToTop]=useState(false);
  const [showBackToBottom,setShowBackToBottom]=useState(false);
  useEffect(()=>{
    const update=()=>{
      const root=document.scrollingElement||document.documentElement;
      const max=Math.max(0,root.scrollHeight-root.clientHeight);
      setShowBackToTop(root.scrollTop>320);
      setShowBackToBottom(max>320&&max-root.scrollTop>80);
    };
    update();
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update,{passive:true});
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    observer?.observe(document.body);
    return()=>{window.removeEventListener('scroll',update);window.removeEventListener('resize',update);observer?.disconnect();};
  },[activeProjectId,activeTab,projects]);
  const scrollBehavior=():ScrollBehavior=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  const scrollToTop=()=>window.scrollTo({top:0,behavior:scrollBehavior()});
  const scrollToBottom=()=>window.scrollTo({top:(document.scrollingElement||document.documentElement).scrollHeight,behavior:scrollBehavior()});
  const jsonImportRef = useRef<HTMLInputElement | null>(null);
  React.useLayoutEffect(()=>{
    if(autoRestoreSafe)autoRestoreSafe.current=!activeProjectId&&!showBrandModal&&!showApiKeyModal&&!showApiKeyGuideModal&&!projectModalTarget.open&&!defectModalTarget.open&&!annotateTarget&&!zoneModalTargetId&&!showSaveAsModal&&!lightbox&&!confirmState&&!isExportingPdf;
    return()=>{if(autoRestoreSafe)autoRestoreSafe.current=false;};
  },[autoRestoreSafe,activeProjectId,showBrandModal,showApiKeyModal,showApiKeyGuideModal,projectModalTarget.open,defectModalTarget.open,annotateTarget,zoneModalTargetId,showSaveAsModal,lightbox,confirmState,isExportingPdf]);

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
        const next = prev.map((p) => {
          if(p.id!==activeProjectId)return p;
          const updated=updater(p);
          // Silent drag updates only move coordinates; regroup on commit.
          return silent?updated:orderProjectDefects(updated);
        });
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
      const oldProject=projects.find(p=>p.id===data.id);
      if(oldProject&&oldProject.clientName!==data.clientName){
        const key='tis_report_book_v1_'+data.id;
        try{const raw=workspaceStorage.getItem(key);if(raw){const book=JSON.parse(raw);if(book&&typeof book==='object')workspaceStorage.setItem(key,JSON.stringify({...book,clientName:data.clientName}));}}catch(error){console.warn('Owner report sync failed',error);}
      }
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
          const nextProjects=projects.map(p=>p.id===target.id?orderProjectDefects(nextProject):p);
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
              const nextBrand = parsed.brand ? clearLegacyBuyerIdentity({ ...DEFAULT_BRAND, ...parsed.brand },isAdmin) : brand;
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

  const runReportExports=async(formats:('PDF'|'Word'|'Excel')[],reportBook?:ReportBookData)=>{
    if(!activeProject||exportLock.current||pdfJobRef.current)return;
    const project=activeProject;
    const snapshot=reportBook?{...reportBook,customExport:{...reportBook.customExport}}:undefined;
    const all=formats.length>1;
    exportLock.current=true;
    const controller=new AbortController();exportController.current=controller;setExportCancelling(false);
    const completed:string[]=[],failed:string[]=[];
    let cancelled=false;
    try{
      for(let i=0;i<formats.length;i++){
        if(controller.signal.aborted){cancelled=true;break;}
        const format=formats[i];
        setExportBatch({all,format,index:i+1,total:formats.length});
        await new Promise<void>(resolve=>setTimeout(resolve,60));
        try{
          controller.signal.throwIfAborted();
          if(format==='PDF'){
            const job=controller;pdfJobRef.current=job;
            setPdfProgress({done:0,total:0});setPdfOverlayVisible(true);setIsExportingPdf(true);
            try{
              await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,60)));
              job.signal.throwIfAborted();
              const filename=await exportProjectPDF(project,brand,lang,snapshot,job.signal,(done,total)=>setPdfProgress({done,total}));
              job.signal.throwIfAborted();
              if(!all)notify((lang==='en'?'Download requested: ':'ส่งไฟล์ให้เบราว์เซอร์ดาวน์โหลด: ')+filename,'success');
            }catch(err){if(job.signal.aborted){cancelled=true;break;}throw err;}
            finally{if(pdfJobRef.current===job){pdfJobRef.current=null;setPdfOverlayVisible(false);setIsExportingPdf(false);}}
          }else if(format==='Word'){
            await exportProjectWord(project,brand,lang,snapshot,controller.signal);
            if(!all)notify(lang==='en'?'Word download requested':'ส่งไฟล์ Word ให้เบราว์เซอร์ดาวน์โหลดแล้ว','success');
          }else{
            const kind=await exportProjectExcel(project,brand,lang,snapshot,controller.signal);
            if(kind!=='xlsx')throw Error(lang==='en'?'Excel fallback CSV only':'ได้ไฟล์ CSV สำรองแทน Excel');
            if(!all)notify(lang==='en'?'Excel download requested':'ส่งไฟล์ Excel ให้เบราว์เซอร์ดาวน์โหลดแล้ว','success');
          }
          completed.push(format);
        }catch(err){
          if(controller.signal.aborted){cancelled=true;break;}
          failed.push(format);
          console.error(err);
          notify(format+(lang==='en'?' export failed: ':' ส่งออกไม่สำเร็จ: ')+(err instanceof Error?err.message:String(err)),'danger');
        }
        if(i<formats.length-1)await new Promise<void>(resolve=>setTimeout(resolve,180));
      }
      if(cancelled||controller.signal.aborted)notify((lang==='en'?'Report export cancelled. Downloads already requested: ':'ยกเลิกการส่งออกแล้ว ไฟล์ที่ส่งให้ดาวน์โหลดก่อนหน้านี้: ')+(completed.join(', ')||'-'),'warning');
      else if(all)notify((lang==='en'?'Download requests: ':'ส่งคำขอดาวน์โหลดแล้ว: ')+completed.length+'/3'+(failed.length?' · '+(lang==='en'?'Failed: ':'ไม่สำเร็จ: ')+failed.join(', '):' · '+(lang==='en'?'Allow multiple downloads if prompted.':'หากเบราว์เซอร์ถาม ให้เลือกอนุญาตดาวน์โหลดหลายไฟล์')),failed.length?'warning':'success');
    }finally{exportController.current=null;exportLock.current=false;setExportCancelling(false);setExportBatch(null);}
  };
  const handleExportPDF=(reportBook?:ReportBookData)=>runReportExports(['PDF'],reportBook);
  const handleExportWord=(reportBook?:ReportBookData)=>runReportExports(['Word'],reportBook);
  const handleExportExcel=(reportBook?:ReportBookData)=>runReportExports(['Excel'],reportBook);
  const handleExportAll=(reportBook:ReportBookData)=>runReportExports(['PDF','Word','Excel'],reportBook);

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
      <style>{PAGE_THEME_CSS}</style>
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

      {(showBackToTop||showBackToBottom)&&!showBrandModal&&!showApiKeyModal&&!showApiKeyGuideModal&&!projectModalTarget.open&&!defectModalTarget.open&&!annotateTarget&&!zoneModalTargetId&&!showSaveAsModal&&!lightbox&&!confirmState&&!pdfOverlayVisible&&(
        <nav aria-label={lang==='en'?'Page navigation':'เลื่อนหน้า'} className="no-print fixed z-30 right-2 sm:right-6 flex flex-col items-end gap-1.5 sm:gap-2" style={{bottom:'calc(1rem + env(safe-area-inset-bottom, 0px))'}}>
          {showBackToTop&&<button type="button" onClick={scrollToTop}
            aria-label={lang==='en'?'Back to top':'เลื่อนไปบนสุด'}
            title={lang==='en'?'Back to top':'เลื่อนไปบนสุด'}
            className="flex h-11 w-11 sm:w-auto sm:min-w-[88px] items-center justify-center gap-1.5 rounded-full brand-bg sm:px-3.5 sm:py-2.5 text-white text-xs font-semibold shadow-lg border border-white/30 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 cursor-pointer">
            <ArrowUp className="w-5 h-5 shrink-0" aria-hidden="true"/>
            <span className="hidden sm:inline">{lang==='en'?'Top':'บนสุด'}</span>
          </button>}
          {showBackToBottom&&<button type="button" onClick={scrollToBottom}
            aria-label={lang==='en'?'Go to bottom':'เลื่อนไปล่างสุด'}
            title={lang==='en'?'Go to bottom':'เลื่อนไปล่างสุด'}
            className="flex h-11 w-11 sm:w-auto sm:min-w-[88px] items-center justify-center gap-1.5 rounded-full brand-bg sm:px-3.5 sm:py-2.5 text-white text-xs font-semibold shadow-lg border border-white/30 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 cursor-pointer">
            <ArrowDown className="w-5 h-5 shrink-0" aria-hidden="true"/>
            <span className="hidden sm:inline">{lang==='en'?'Bottom':'ล่างสุด'}</span>
          </button>}
        </nav>
      )}
      {/* Main Content */}
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-2.5 sm:px-6 py-3 sm:py-5 no-print">
        {/* Global White-Label Header */}
        <header className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-5 mb-3 sm:mb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="p-1.5 bg-slate-50 rounded-xl border border-slate-200 shrink-0">
                <BrandLogo brand={brand} className="w-10 h-10 sm:w-14 sm:h-14" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h1 className="text-base sm:text-xl font-extrabold tracking-tight brand-text break-words sm:truncate">
                    {brand.companyName}
                  </h1>
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {brand.subtitle.trim()||(lang==='en'?'Not set':'ยังไม่ระบุ')}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>
                    {t.inspectorLabel}: <strong className="text-slate-900">{brand.inspectorName||(lang==='en'?'Not set':'ยังไม่ระบุ')}</strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {t.licenseLabel}:{' '}
                    <strong className="text-slate-900 font-mono-num">{brand.licenseNo||(lang==='en'?'Not set':'ยังไม่ระบุ')}</strong>
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start md:justify-end gap-1.5 sm:gap-2 min-w-0">
              <button type="button" aria-expanded={mobileSettings||tourActive} onClick={()=>setMobileSettings(v=>!v)} className="sm:hidden min-h-10 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><Palette className="w-4 h-4"/>{lang==='en'?'Settings':'ตั้งค่าโปรแกรม'} {mobileSettings||tourActive?'▴':'▾'}</button>
              {!isAdmin&&<button type="button" onClick={startTour} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-800 hover:bg-blue-100 whitespace-nowrap"><BookOpen className="w-4 h-4"/>{lang==='en'?'Guided tour':'แนะนำการใช้งาน'}</button>}
              <div className={`${mobileSettings||tourActive?'flex':'hidden'} sm:contents w-full flex-wrap gap-2 order-last sm:order-none`}>
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <Palette className="w-4 h-4 shrink-0"/>
                <span className="whitespace-nowrap">{lang==='en'?'Theme':'โทนสี'}</span>
                <select aria-label={lang==='en'?'Page color theme':'โทนสีหน้าโปรแกรม'} value={pageTheme} onChange={e=>setPageTheme(e.target.value as PageTheme)} className="max-w-[125px] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs cursor-pointer">
                  {PAGE_THEMES.map(theme=><option key={theme.id} value={theme.id}>{lang==='en'?theme.en:theme.th}</option>)}
                </select>
              </label>
              <VersionUpdate lang={lang} onBackup={handleVersionBackup} onPrepare={handlePrepareVersionUpdate} />
              <button
                type="button"
                data-tour="brand"
                onClick={() => setShowBrandModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Palette className="w-4 h-4" />
                {t.editBrandBtn}
              </button>
              </div>
              {activeProject ? (
                <button
                  type="button"
                  data-tour="hub"
                  onClick={() => setActiveProjectId(null)}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  {t.projectHubBtn}
                </button>
              ) : (
                <button
                  type="button"
                  data-tour="project"
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
          <div className={`${mobileSettings||tourActive?'flex':'hidden'} sm:flex mt-3 pt-3 border-t border-slate-100 flex-wrap items-center justify-between gap-2`}>
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
                data-tour="api"
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
          <div className="space-y-3 sm:space-y-5">
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
                  data-tour="backup"
                  onClick={handleBackupAllJson}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <HardDriveDownload className="w-4 h-4" />
                  {t.backupAllBtn}
                </button>
                {onOpenDrive&&<button type="button" data-tour="drive-json-shortcut" onClick={onOpenDrive} className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"><HardDriveDownload className="w-4 h-4"/>{lang==='en'?'Google Drive (JSON)':'Google Drive (JSON)'}</button>}
                <button
                  type="button"
                  onClick={() => jsonImportRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  {t.importJsonBtn}
                </button>
                <details className="text-xs text-slate-600"><summary className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 font-semibold">{lang==='en'?'More':'เพิ่มเติม'}</summary><div className="mt-2">                <button
                  type="button"
                  onClick={() => setShowSaveAsModal(true)}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  {t.saveAsBtn}
                </button></div></details>
              </div>
            </section>

            {/* 2 Summary KPI Cards */}
            <section className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-5 flex items-center justify-between gap-1.5">
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
                <div className="hidden sm:flex w-11 h-11 rounded-xl bg-blue-50 text-blue-700 items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-5 flex items-center justify-between gap-1.5">
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
                <div className="hidden sm:flex w-11 h-11 rounded-xl bg-amber-50 text-amber-600 items-center justify-center">
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
                          data-tour="open-project"
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
          <div className="space-y-3 sm:space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-3 pb-2.5 sm:pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-900 break-words leading-snug" style={{fontSize:`clamp(15px, 2vw, ${Math.max(15,Math.min(20,Math.round(1100/Math.max(1,activeProject.name.length))))}px)`}}>
                    {activeProject.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 break-words">
                    <span>
                      {t.houseNoPrefix} {activeProject.houseNo}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeProject.address}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeProject.inspectionDate}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setProjectModalTarget({ open: true, project: activeProject })
                    }
                    className="text-xs px-2 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="sm:hidden">{lang==='en'?'Edit':'แก้ไขแฟ้ม'}</span><span className="hidden sm:inline">{t.editProjectShort}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBackupSingleProjectJson(activeProject)}
                    className="text-xs px-2 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span className="sm:hidden">JSON</span><span className="hidden sm:inline">{t.backupProjectShort}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => persistAll(brand, projects, true)}
                    className="text-xs px-2 sm:px-3.5 py-2 rounded-xl brand-bg text-white font-semibold flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {t.saveShort}
                  </button>
                </div>
              </div>

              {/* Workspace Tabs */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 mt-2.5 sm:mt-4">
                <button
                  type="button"
                  data-tour="tab-studio"
                  onClick={() => setActiveTab('studio')}
                  className={`px-2 py-2.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'studio'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span className="sm:hidden">{lang==='en'?'Plan & AI':'แปลน & AI'}</span><span className="hidden sm:inline">{t.tabStudio}</span>
                </button>
                <button
                  type="button"
                  data-tour="tab-list"
                  onClick={() => setActiveTab('list')}
                  className={`px-2 py-2.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
                    activeTab === 'list'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span className="sm:hidden">Defect</span><span className="hidden sm:inline">{t.tabList}</span> ({activeProject.defects.length})
                </button>
                <button
                  type="button"
                  data-tour="tab-export"
                  onClick={() => setActiveTab('export')}
                  className={`px-2 py-2.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTab === 'export'
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span className="sm:hidden">{lang==='en'?'Reports':'รายงาน'}</span><span className="hidden sm:inline">{t.tabExport}</span>
                </button>
                <button type="button" data-tour="tab-client" onClick={()=>setActiveTab('client')} className={`px-2 py-2.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap cursor-pointer ${activeTab==='client'?'brand-bg text-white':'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                  <Globe className="w-4 h-4"/>{lang==='en'?'Customer website':'เว็บไซต์ลูกค้า'}
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

            {activeTab==='client'&&<ClientWebsiteTab key={activeProject.id} project={activeProject} brand={brand} lang={lang}/>}
            {activeTab === 'export' && (
              <ExportTab
                lang={lang}
                project={activeProject}
                brand={brand}
                isExportingPdf={isExportingPdf}
                exportBatch={exportBatch}
                exportCancelling={exportCancelling}
                onCancelExport={cancelReportExports}
                onExportAll={handleExportAll}
                onExportPDF={handleExportPDF}
                onExportWord={handleExportWord}
                onExportExcel={handleExportExcel}
                onNotify={notify}
              />
            )}
          </div>
        )}
      </main>

      {!isAdmin&&tourOffer&&!tourActive&&<div role="region" aria-label={lang==='en'?'Welcome to the guided tour':'ยินดีต้อนรับ'} className="fixed bottom-4 right-4 z-[9000] w-[min(92vw,390px)] rounded-2xl border border-blue-300 bg-white p-4 shadow-2xl">
        <div className="flex items-center gap-2 font-bold text-slate-900"><BookOpen className="w-5 h-5 text-blue-600"/>{lang==='en'?'New here?':'เริ่มใช้งานครั้งแรก?'}</div>
        <p className="mt-2 text-sm text-slate-600">{lang==='en'?'Learn with a step-by-step guide on the actual app. No manual needed.':'เรียนรู้จากปุ่มจริงทีละขั้น ตั้งแต่สร้างโครงการจนส่งรายงานให้ลูกค้า ไม่ต้องเปิดคู่มือ'}</p>
        <div className="mt-3 flex flex-wrap gap-2 justify-end"><button type="button" onClick={closeTour} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{lang==='en'?'Later':'ไว้ภายหลัง'}</button><button type="button" onClick={startTour} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold">{lang==='en'?'Start tour':'เริ่มแนะนำการใช้งาน'}</button></div>
      </div>}
      {!isAdmin&&<BuyerTour lang={lang} active={tourActive} hasProject={!!activeProject} hasProjects={projects.length>0} tab={activeTab} paused={!!(showBrandModal||showApiKeyModal||showApiKeyGuideModal||projectModalTarget.open||defectModalTarget.open||annotateTarget||zoneModalTargetId||showSaveAsModal||lightbox||confirmState||exportBatch)} onClose={closeTour}/>}

      {/* Full-Screen PDF Generation Overlay (covers #pdfRenderContainer at z-index 9998) */}
      {isExportingPdf && pdfOverlayVisible && (
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
              {pdfProgress.total>0?(lang==='en'?`Page ${pdfProgress.done} / ${pdfProgress.total}`:`เสร็จแล้ว ${pdfProgress.done} จาก ${pdfProgress.total} หน้า`):(lang==='en'?'Preparing report…':'กำลังเตรียมข้อมูลรายงาน…')}
            </p>
            <button type="button" onClick={cancelPdf} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">{lang==='en'?'Cancel PDF export':'ยกเลิกการสร้าง PDF'}</button>
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
