import {isDngFile,imageUploadError} from '../utils/dngImage';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  DefectItem,
  DraftDefect,
  FloorPlan,
  FloorZone,
  ProjectFile,
} from '../types/inspection';
import { ZONE_COLOR_PRESETS, orderProjectDefects } from '../data/defaultData';
import { UI_TEXT, translateDefectStatus, translateSeverity } from '../i18n/translations';
import {
  analyzeDefectWithGeminiClient,
  loadGeminiConfig,
} from '../utils/geminiClient';
import { compressImageFile } from '../utils/imageUtils';
import { workspaceStorage } from '../utils/workspaceStorage';
import { FloorPlanSvg } from './FloorPlanSvg';
import { CustomFloorEditor } from './CustomFloorEditor';
import {EditorContextMenu,useEditorMenu,type MenuAction} from './EditorContextMenu';
import { customFloorDataUrl } from '../utils/customFloorSvg';
import {
  MarkupCanvasEditor,
  type MarkupCanvasEditorHandle,
} from './MarkupCanvasEditor';

interface StudioTabProps {
  lang: AppLanguage;
  project: ProjectFile;
  activeFloorId: string;
  onSelectFloor: (floorId: string) => void;
  onUpdateProject: (updater: (proj: ProjectFile) => ProjectFile, silent?: boolean) => void;
  onOpenDefectModal: (defectId: string) => void;
  onOpenZoneModal: (zoneId: string) => void;
  onConfirmDeleteFloor: (floor: FloorPlan) => void;
  onOpenLightbox: (src: string, caption: string) => void;
  onRequireApiKey: () => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

function findZoneAtPoint(floor: FloorPlan | null, xPct: number, yPct: number, preferredName?:string): FloorZone | null {
  if (!floor || !Array.isArray(floor.zones)) return null;
  const matches=floor.zones.filter(z=>xPct>=z.x&&xPct<=z.x+z.w&&yPct>=z.y&&yPct<=z.y+z.h);
  return matches.find(z=>z.name===preferredName)||matches[0]||null;
}

export const StudioTab: React.FC<StudioTabProps> = ({
  lang,
  project,
  activeFloorId,
  onSelectFloor,
  onUpdateProject,
  onOpenDefectModal,
  onOpenZoneModal,
  onConfirmDeleteFloor,
  onOpenLightbox: _onOpenLightbox,
  onRequireApiKey,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const activeFloor =
    project.floors.find((f) => f.id === activeFloorId) || project.floors[0] || null;
  const floorDefects = activeFloor
    ? project.defects.filter((d) => d.floorId === activeFloor.id)
    : [];

  const [renameFloor, setRenameFloor] = useState<{id:string;name:string}|null>(null);
  useEffect(()=>{setRenameFloor(null);},[project.id,activeFloorId]);
  const [isZoneSetupMode, setIsZoneSetupMode] = useState(false);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const isEditingFloor = !!activeFloor && editingFloorId === activeFloor.id && !activeFloor.imageUrl;
  const [showZoneOverlays, setShowZoneOverlays] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editZoneFocus,setEditZoneFocus]=useState<{floorId:string;zoneId:string}|null>(null);
  const editingZone=isZoneSetupMode?(activeFloor?.zones.find(z=>z.id===selectedZoneId)||null):null;
  useEffect(()=>{setSelectedZoneId(null);setEditZoneFocus(null);},[project.id,activeFloorId]);
  const [isFloorDropActive, setIsFloorDropActive] = useState(false);

  const viewKey='tis_plan_view_v1_'+project.id;
  const [initialPlanView]=useState(()=>{try{return JSON.parse(workspaceStorage.getItem(viewKey)||'{}');}catch{return {};}});
  const [pinSize,setPinSize]=useState<number>(()=>Number.isFinite(initialPlanView.pinSize)?Math.max(14,Math.min(32,initialPlanView.pinSize)):20);
  const [planZoom,setPlanZoom]=useState<number>(()=>Number.isFinite(initialPlanView.zoom)?Math.max(50,Math.min(300,initialPlanView.zoom)):100);
  const [panMode,setPanMode]=useState(false);
  const planViewport=useRef<HTMLDivElement|null>(null);
  const panStart=useRef<{x:number;y:number;left:number;top:number;id:number}|null>(null);
  useEffect(()=>{try{workspaceStorage.setItem(viewKey,JSON.stringify({pinSize,zoom:planZoom}));}catch{}},[viewKey,pinSize,planZoom]);
  const changeZoom=(n:number)=>setPlanZoom(Math.max(50,Math.min(300,n)));
  type PinPosition={x:number;y:number;zone:string};
  type PinMove={id:string;floorId:string;before:PinPosition;after:PinPosition};
  const pinUndo=useRef<PinMove[]>([]),pinRedo=useRef<PinMove[]>([]);
  const projectRef=useRef(project);projectRef.current=project;
  useEffect(()=>{pinUndo.current=[];pinRedo.current=[];},[project.id,activeFloorId]);
  // Pin & Zone drag state refs
  const floorStageRef = useRef<HTMLDivElement | null>(null);
  const draggingPinRef = useRef<{
    defectId: string;
    startX: number;
    startY: number;
    moved: boolean;
    floorId:string;
    before:PinPosition;
    last:PinPosition;
  } | null>(null);
  const pinMovedJustNowRef = useRef(false);
  const zoneDragRef = useRef<{
    zoneId: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Drafts & pin placement
  const [drafts, setDrafts] = useState<DraftDefect[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [placingDraftId, setPlacingDraftIdState] = useState<string | null>(null);
  const [pinZoneChoice,setPinZoneChoice]=useState<{floorId:string;draftId:string;zoneId:string|null}|null>(null);
  const setPlacingDraftId=(id:string|null)=>{setPinZoneChoice(null);setPlacingDraftIdState(id);};
  const [pinPlacement,setPinPlacement]=useState<{id:string;kind:'move'|'copy'}|null>(null);
  useEffect(()=>{setPinPlacement(null);setPlacingDraftIdState(null);setPinZoneChoice(null);},[project.id,activeFloorId]);

  const activeDraft =
    drafts.find((d) => d.id === activeDraftId) || drafts[0] || null;
  const currentZoneChoice=pinZoneChoice&&pinZoneChoice.floorId===activeFloor?.id&&pinZoneChoice.draftId===placingDraftId&&activeDraft?.id===placingDraftId?pinZoneChoice:null;
  const lockedZone=currentZoneChoice&&activeFloor?.zones.find(z=>z.id===currentZoneChoice.zoneId)||null;
  const readyToPlace=Boolean(placingDraftId&&currentZoneChoice&&(lockedZone||(activeFloor?.zones.length===0&&currentZoneChoice.zoneId===null)));
  const beginPlacement=(id:string)=>{setPinPlacement(null);setIsZoneSetupMode(false);setEditingFloorId(null);setPanMode(false);setPlacingDraftId(id);};
  const choosePinZone=(zoneId:string|null,scrollToPlan=false)=>{
    if(!activeFloor||!activeDraft)return;
    if(zoneId===null?activeFloor.zones.length>0:!activeFloor.zones.some(z=>z.id===zoneId))return;
    beginPlacement(activeDraft.id);setPinZoneChoice({floorId:activeFloor.id,draftId:activeDraft.id,zoneId});
    if(scrollToPlan)window.requestAnimationFrame(()=>planViewport.current?.scrollIntoView({block:'nearest',behavior:'smooth'}));
  };

  // Fit the explicitly selected zone using the actual scroll viewport and
  // stage dimensions. Zone coordinates are percentages of the same stage
  // used for placing pins; never infer the target from the image aspect ratio.
  const currentEditFocus=isZoneSetupMode&&editingZone&&editZoneFocus?.floorId===activeFloor?.id&&editZoneFocus?.zoneId===editingZone.id?editZoneFocus:null;
  const focusChoice=currentEditFocus||(readyToPlace?currentZoneChoice:null);
  const focusZone=currentEditFocus?editingZone:lockedZone;
  const lastFocusedChoice=useRef<typeof focusChoice>(null);
  const lastPlanView=useRef({zoom:-1,floor:'',editing:false});
  useLayoutEffect(()=>{
    const vp=planViewport.current,stage=floorStageRef.current;
    if(!vp||!stage||!vp.clientWidth||!vp.clientHeight||!stage.offsetWidth||!stage.offsetHeight)return;
    const floor=activeFloor?.id||'';
    const previous=lastPlanView.current;
    const viewChanged=previous.zoom!==planZoom||previous.floor!==floor||previous.editing!==isEditingFloor;
    lastPlanView.current={zoom:planZoom,floor,editing:isEditingFloor};
    const newChoice=focusChoice!==lastFocusedChoice.current;
    lastFocusedChoice.current=focusChoice;
    if(focusChoice){
      const raw=focusZone||{x:0,y:0,w:100,h:100};
      const x=Math.max(0,Math.min(100,raw.x)),y=Math.max(0,Math.min(100,raw.y));
      const w=Math.max(.1,Math.min(100-x,raw.w)),h=Math.max(.1,Math.min(100-y,raw.h));
      if(![x,y,w,h].every(Number.isFinite))return;
      if(newChoice){
        // Leave breathing room around the zone and respect the existing
        // manual zoom range; full-floor selection returns to 100%.
        const fit=focusZone?planZoom*Math.min(vp.clientWidth*.86/(stage.offsetWidth*w/100),vp.clientHeight*.86/(stage.offsetHeight*h/100)):100;
        const target=Math.max(50,Math.min(300,Math.floor(fit/5)*5));
        if(target!==planZoom){setPlanZoom(target);return;}
      }
      if(newChoice||viewChanged){
        // Calculate from the post-zoom DOM, including any centered stage
        // margin, borders, and scrollbars. Clamp to reachable scroll bounds.
        const vr=vp.getBoundingClientRect(),sr=stage.getBoundingClientRect();
        const cx=vp.scrollLeft+sr.left-vr.left-vp.clientLeft+sr.width*(x+w/2)/100;
        const cy=vp.scrollTop+sr.top-vr.top-vp.clientTop+sr.height*(y+h/2)/100;
        vp.scrollLeft=Math.max(0,Math.min(vp.scrollWidth-vp.clientWidth,cx-vp.clientWidth/2));
        vp.scrollTop=Math.max(0,Math.min(vp.scrollHeight-vp.clientHeight,cy-vp.clientHeight/2));
      }
    }else if(viewChanged){
      vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);
      vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2);
    }
  },[focusChoice,focusZone,planZoom,activeFloor?.id,isEditingFloor]);

  // Markup canvas state
  const [markupImageSrc, setMarkupImageSrc] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const markupEditorRef = useRef<MarkupCanvasEditorHandle | null>(null);

  const activeFloorIdRef = useRef<string | null>(activeFloor?.id || null);
  const langRef = useRef<AppLanguage>(lang);
  const onNotifyRef = useRef(onNotify);
  const onUpdateProjectRef = useRef(onUpdateProject);

  activeFloorIdRef.current = activeFloor?.id || null;
  langRef.current = lang;
  onNotifyRef.current = onNotify;
  onUpdateProjectRef.current = onUpdateProject;

  const applyPinHistory=(redo:boolean)=>{
    const from=redo?pinRedo.current:pinUndo.current,to=redo?pinUndo.current:pinRedo.current;
    const change=from[from.length-1];if(!change)return;
    const expected=redo?change.before:change.after;
    const pos=redo?change.after:change.before;
    const d=projectRef.current.defects.find(d=>d.id===change.id&&d.floorId===change.floorId);
    // Never overwrite a pin edited/deleted elsewhere since the recorded move.
    if(!d||d.x!==expected.x||d.y!==expected.y||d.zone!==expected.zone){from.pop();return;}
    from.pop();to.push(change);
    onUpdateProjectRef.current(prev=>({...prev,defects:prev.defects.map(item=>item.id===change.id&&item.floorId===change.floorId?{...item,...pos}:item)}));
    onNotifyRef.current(langRef.current==='en'?(redo?'Pin move redone':'Pin move undone'):(redo?'ทำซ้ำตำแหน่งหมุดแล้ว':'ย้อนตำแหน่งหมุดแล้ว'),'success');
  };

  const handlePlanKeys=(e:React.KeyboardEvent<HTMLDivElement>)=>{
    if(e.defaultPrevented||e.nativeEvent.isComposing||e.altKey||draggingPinRef.current||zoneDragRef.current)return;
    if((e.target as Element).closest('input,textarea,select,[contenteditable="true"]'))return;
    const key=e.key.toLowerCase();
    if(key==='escape'){setPinPlacement(null);setPlacingDraftId(null);return;}
    if(!(e.ctrlKey||e.metaKey)||(key!=='z'&&key!=='y'))return;
    e.preventDefault();e.stopPropagation();applyPinHistory(key==='y'||e.shiftKey);
  };

  // Global pointer move / up for pin dragging and zone move/resize
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const stage = floorStageRef.current;
      if (!stage) return;

      if (draggingPinRef.current) {
        const dp = draggingPinRef.current;
        const dx = Math.abs(e.clientX - dp.startX);
        const dy = Math.abs(e.clientY - dp.startY);
        if (dx > 4 || dy > 4) dp.moved = true;
        if (!dp.moved) return;

        const rect = stage.getBoundingClientRect();
        const xPct = Math.max(
          2,
          Math.min(98, +(((e.clientX - rect.left) / rect.width) * 100).toFixed(2))
        );
        const yPct = Math.max(
          2,
          Math.min(98, +(((e.clientY - rect.top) / rect.height) * 100).toFixed(2))
        );

        dp.last={...dp.last,x:xPct,y:yPct};
        onUpdateProjectRef.current(
          (prev) => ({
            ...prev,
            defects: prev.defects.map((d) =>
              d.id === dp.defectId ? { ...d, x: xPct, y: yPct } : d
            ),
          }),
          true
        );
        return;
      }

      const currentFlId = activeFloorIdRef.current;
      if (zoneDragRef.current && currentFlId) {
        const zi = zoneDragRef.current;
        if(Math.hypot(e.clientX-zi.startX,e.clientY-zi.startY)<=4)return;
        const rect = stage.getBoundingClientRect();
        const dxPct = ((e.clientX - zi.startX) / rect.width) * 100;
        const dyPct = ((e.clientY - zi.startY) / rect.height) * 100;

        onUpdateProjectRef.current(
          (prev) => ({
            ...prev,
            floors: prev.floors.map((fl) => {
              if (fl.id !== currentFlId) return fl;
              return {
                ...fl,
                zones: fl.zones.map((z) => {
                  if (z.id !== zi.zoneId) return z;
                  if (zi.mode === 'move') {
                    return {
                      ...z,
                      x: Math.max(0, Math.min(100 - z.w, +(zi.origX + dxPct).toFixed(2))),
                      y: Math.max(0, Math.min(100 - z.h, +(zi.origY + dyPct).toFixed(2))),
                    };
                  }
                  return {
                    ...z,
                    w: Math.min(100 - z.x, Math.max(Math.min(0.5, 100 - z.x), +(zi.origW + dxPct).toFixed(2))),
                    h: Math.min(100 - z.y, Math.max(Math.min(0.5, 100 - z.y), +(zi.origH + dyPct).toFixed(2))),
                  };
                }),
              };
            }),
          }),
          true
        );
      }
    };

    const handlePointerUp = () => {
      if (draggingPinRef.current) {
        const dp = draggingPinRef.current;
        draggingPinRef.current = null;
        if (dp.moved) {
          pinMovedJustNowRef.current = true;
          const currentFlId = dp.floorId;
          const floor=projectRef.current.floors.find(f=>f.id===currentFlId)||null;
          const zone=findZoneAtPoint(floor,dp.last.x,dp.last.y,dp.before.zone);
          const after={...dp.last,zone:zone?.name||dp.before.zone};
          if(after.x!==dp.before.x||after.y!==dp.before.y||after.zone!==dp.before.zone){
            pinUndo.current.push({id:dp.defectId,floorId:dp.floorId,before:dp.before,after});
            if(pinUndo.current.length>50)pinUndo.current.shift();
            pinRedo.current=[];
          }
          onUpdateProjectRef.current((prev) => {
            const fl = prev.floors.find((f) => f.id === currentFlId) || null;
            return {
              ...prev,
              defects: prev.defects.map((d) => {
                if (d.id !== dp.defectId) return d;
                const matched = findZoneAtPoint(fl, d.x, d.y, dp.before.zone);
                return matched ? { ...d, zone: matched.name } : d;
              }),
            };
          });
          onNotifyRef.current(
            langRef.current === 'en' ? 'Pin position updated' : 'ย้ายตำแหน่งหมุดเรียบร้อยแล้ว',
            'success'
          );
        }
      }

      if (zoneDragRef.current) {
        zoneDragRef.current = null;
        onUpdateProjectRef.current((prev) => prev);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleFloorImageUpload = async (file?: File) => {
    if (!file || !activeFloor) return;
    if (!file.type.startsWith('image/') && !isDngFile(file)) {
      onNotify(
        lang === 'en'
          ? 'Please select an image file (JPG, PNG, WEBP, DNG)'
          : 'กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP, DNG)',
        'warning'
      );
      return;
    }
    try {
      const compressed = await compressImageFile(file, 2560, 0.95);
      onUpdateProject((prev) => ({
        ...prev,
        floors: prev.floors.map((fl) =>
          fl.id === activeFloor.id ? { ...fl, imageUrl: compressed } : fl
        ),
      }));
      setEditingFloorId(null);
      onNotify(
        lang === 'en'
          ? `Uploaded floorplan for "${activeFloor.name}"`
          : `อัปโหลดรูปแปลน "${activeFloor.name}" เรียบร้อยแล้ว`,
        'success'
      );
    } catch {
      onNotify(
        imageUploadError(file,lang,lang === 'en' ? 'Failed to load floorplan image' : 'ไม่สามารถโหลดรูปแปลนได้'),
        'danger'
      );
    }
  };

  const handleRenameFloor = (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(!renameFloor||renameFloor.id!==activeFloor?.id)return;
    const name=renameFloor.name.trim();
    if(!name){onNotify(lang==='en'?'Enter a floor name':'กรุณากรอกชื่อชั้น','warning');return;}
    if(project.floors.some(f=>f.id!==renameFloor.id&&f.name.trim().toLowerCase()===name.toLowerCase())){
      onNotify(lang==='en'?'This floor name already exists':'ชื่อชั้นนี้มีอยู่แล้ว','warning');return;
    }
    const id=renameFloor.id;
    if(activeFloor.name!==name){
      onUpdateProject(prev=>({...prev,floors:prev.floors.map(f=>f.id===id?{...f,name}:f)}));
      onNotify(lang==='en'?'Floor name updated':'บันทึกชื่อชั้นเรียบร้อยแล้ว','success');
    }
    setRenameFloor(null);
  };

  const handleAddFloor = () => {
    let nextNum = project.floors.length + 1;
    while(project.floors.some(f=>f.name.trim().toLowerCase()===`floor ${nextNum}`||f.name.trim()===`ชั้น ${nextNum}`))nextNum++;
    const newId = `fl_${Date.now()}`;
    const floorLabel = lang === 'en' ? `Floor ${nextNum}` : `ชั้น ${nextNum}`;
    onUpdateProject((prev) => ({
      ...prev,
      floors: [
        ...prev.floors,
        {
          id: newId,
          name: floorLabel,
          imageUrl: null,
          svgPreset: 0,
          isCustomBuilder: true,
          zones: [],
          elements: [],
        },
      ],
    }));
    onSelectFloor(newId);
    setIsZoneSetupMode(false);
    setPlacingDraftId(null);
    setSelectedZoneId(null);
    setEditingFloorId(newId);
    onNotify(
      lang === 'en'
        ? `Added floor "${floorLabel}"`
        : `เพิ่มแปลน "${floorLabel}" เรียบร้อยแล้ว`,
      'success'
    );
  };

  const handleAddZone = () => {
    if (!activeFloor) return;
    const preset = ZONE_COLOR_PRESETS[activeFloor.zones.length % ZONE_COLOR_PRESETS.length];
    const newZone: FloorZone = {
      id: `z_${Date.now()}`,
      name:
        lang === 'en'
          ? `New Zone ${activeFloor.zones.length + 1}`
          : `โซนใหม่ ${activeFloor.zones.length + 1}`,
      x: 20,
      y: 20,
      w: 35,
      h: 25,
      bg: preset.bg,
      border: preset.border,
    };
    onUpdateProject((prev) => ({
      ...prev,
      floors: prev.floors.map((fl) =>
        fl.id === activeFloor.id ? { ...fl, zones: [...fl.zones, newZone] } : fl
      ),
    }));
    setSelectedZoneId(newZone.id);
    setEditZoneFocus({floorId:activeFloor.id,zoneId:newZone.id});
    setPanMode(false);
    setIsZoneSetupMode(true);
    setShowZoneOverlays(true);
  };

  const handleFloorStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if(pinPlacement&&activeFloor&&!isZoneSetupMode){
      const rect=floorStageRef.current?.getBoundingClientRect();
      const d=project.defects.find(item=>item.id===pinPlacement.id&&item.floorId===activeFloor.id);
      if(!rect||!d||!rect.width||!rect.height){setPinPlacement(null);return;}
      const x=Math.max(2,Math.min(98,+((e.clientX-rect.left)/rect.width*100).toFixed(2)));
      const y=Math.max(2,Math.min(98,+((e.clientY-rect.top)/rect.height*100).toFixed(2)));
      const zone=findZoneAtPoint(activeFloor,x,y,d.zone)?.name||d.zone;
      const after={x,y,zone};
      if(pinPlacement.kind==='move'){
        const before={x:d.x,y:d.y,zone:d.zone};
        if(before.x!==x||before.y!==y||before.zone!==zone){
          pinUndo.current.push({id:d.id,floorId:d.floorId,before,after});if(pinUndo.current.length>50)pinUndo.current.shift();pinRedo.current=[];
          onUpdateProject(prev=>({...prev,defects:prev.defects.map(item=>item.id===d.id?{...item,...after}:item)}));
        }
      }else{
        onUpdateProject(prev=>({...prev,defects:[...prev.defects,{...d,...after,id:'def_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),number:Math.max(0,...prev.defects.map(item=>item.number||0))+1,status:'รอแก้ไข',afterImg:null,createdAt:new Date().toISOString().split('T')[0]}]}));
      }
      setPinPlacement(null);return;
    }
    if (!placingDraftId || isZoneSetupMode || !activeFloor) return;
    const draft = drafts.find((d) => d.id === placingDraftId);
    if (!draft) return;
    if(!readyToPlace){onNotify(lang==='en'?'Select a zone tab before placing the pin.':'กรุณาเลือกแท็บโซนก่อนปักหมุด','warning');return;}

    const stage = floorStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const xPct=Math.max(0,Math.min(100,+((e.clientX-rect.left)/rect.width*100).toFixed(2)));
    const yPct=Math.max(0,Math.min(100,+((e.clientY-rect.top)/rect.height*100).toFixed(2)));
    // Never infer the zone from overlapping geometry for new pins.
    // Validate against the explicitly chosen zone, and keep its name.
    if(lockedZone&&(xPct<lockedZone.x-.01||xPct>lockedZone.x+lockedZone.w+.01||yPct<lockedZone.y-.01||yPct>lockedZone.y+lockedZone.h+.01)){
      onNotify(lang==='en'?'Place the pin inside the selected zone or choose another zone.':'ตำแหน่งอยู่นอกโซนที่เลือก กรุณาปักภายในโซนหรือเลือกโซนใหม่','warning');return;
    }
    const matchedZone=lockedZone;
    const nextNum =
      project.defects.length > 0
        ? Math.max(...project.defects.map((d) => d.number || 0)) + 1
        : 1;

    const liveCanvasPhoto = markupEditorRef.current?.exportDataUrl() ?? markupImageSrc;
    const newDefect: DefectItem = {
      id: `def_${Date.now()}`,
      number: nextNum,
      floorId: activeFloor.id,
      zone: matchedZone ? matchedZone.name : activeFloor.name,
      x: xPct,
      y: yPct,
      title:
        draft.title.trim() ||
        (lang === 'en' ? `Defect Item #${nextNum}` : `รายการ Defect ข้อที่ ${nextNum}`),
      cause: draft.hideCause ? '' : draft.cause,
      solution: draft.hideSolution ? '' : draft.solution,
      hideCause: draft.hideCause,
      hideSolution: draft.hideSolution,
      severity: draft.severity,
      status: 'รอแก้ไข',
      beforeImg: liveCanvasPhoto || draft.photoDataUrl || null,
      afterImg: null,
      createdAt: new Date().toISOString().split('T')[0],
    };

    const assignedNumber=orderProjectDefects({...project,defects:[...project.defects,newDefect]}).defects.find(d=>d.id===newDefect.id)?.number??nextNum;
    onUpdateProject((prev) => ({
      ...prev,
      defects: [...prev.defects, newDefect],
    }));
    const remainingDrafts = drafts.filter((d) => d.id !== draft.id);
    setDrafts(remainingDrafts);
    setActiveDraftId(remainingDrafts[0]?.id || null);
    setPlacingDraftId(null);
    setAiPrompt('');
    // Reset canvas so user is ready for the next site photo immediately
    setMarkupImageSrc(remainingDrafts[0]?.photoDataUrl ?? null);
    onNotify(
      lang === 'en'
        ? `Pinned defect #${assignedNumber} · ${activeFloor.name} · ${matchedZone?.name||activeFloor.name}`
        : `ปักหมุดข้อที่ #${assignedNumber} · ${activeFloor.name} · ${matchedZone?.name||activeFloor.name} เรียบร้อยแล้ว`,
      'success'
    );
  };

  const handleMarkupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 2560, 0.95);
      setMarkupImageSrc(compressed);
    } catch {
      onNotify(
        imageUploadError(file,lang,lang === 'en' ? 'Failed to load image file' : 'ไม่สามารถอ่านไฟล์รูปภาพได้'),
        'danger'
      );
    }
  };

  const handleAnalyzeWithAI = async () => {
    const geminiConfig = loadGeminiConfig();
    if (!geminiConfig.apiKey) {
      onNotify(t.apiKeyRequiredNotice, 'warning');
      onRequireApiKey();
      return;
    }

    // Capture the high-quality marked photo once. Gemini creates its own temporary reduced copy.
    const reportPhotoDataUrl = markupEditorRef.current?.exportDataUrl() ?? markupImageSrc;
    if (!reportPhotoDataUrl) {
      onNotify(
        lang === 'en'
          ? 'Please upload a site photo before running AI analysis'
          : 'กรุณาอัปโหลดรูปภาพหน้างานก่อนกดวิเคราะห์ด้วย AI',
        'warning'
      );
      return;
    }

    setIsAnalyzing(true);
    try {
      const data = await analyzeDefectWithGeminiClient({
        apiKey: geminiConfig.apiKey,
        preferredModel: geminiConfig.model,
        imageDataUrl: reportPhotoDataUrl,
        userNote: aiPrompt.trim(),
        lang,
      });

      const newDraft: DraftDefect = {
        id: `dr_${Date.now()}`,
        fromAI: true,
        title:
          data.title || (lang === 'en' ? 'Detected Defect' : 'จุดบกพร่องที่ตรวจพบ'),
        severity: data.severity || 'ปานกลาง',
        cause: data.cause || '',
        solution: data.solution || '',
        hideCause: false,
        hideSolution: false,
        // Store the original report-quality snapshot, not the resized AI request.
        photoDataUrl: reportPhotoDataUrl,
      };
      setDrafts((prev) => [newDraft, ...prev]);
      setActiveDraftId(newDraft.id);
      setPlacingDraftId(null);
      onNotify(
        lang === 'en'
          ? `AI analysis complete (${data.modelUsed})! Click "Pin Defect to Floorplan" to save.`
          : `AI วิเคราะห์ภาพเสร็จสิ้น (${data.modelUsed})! กด "ปักหมุดข้อนี้ลงแปลน" เพื่อบันทึกได้เลย`,
        'success'
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : lang === 'en'
          ? 'Unable to analyze photo'
          : 'ไม่สามารถวิเคราะห์ภาพได้';
      onNotify(
        lang === 'en' ? `Analysis failed: ${msg}` : `วิเคราะห์ภาพไม่สำเร็จ: ${msg}`,
        'danger'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateBlankDraft = () => {
    const photo = markupEditorRef.current?.exportDataUrl() ?? markupImageSrc;
    const newDraft: DraftDefect = {
      id: `dr_${Date.now()}`,
      fromAI: false,
      title: '',
      severity: 'ปานกลาง',
      cause: '',
      solution: '',
      hideCause: false,
      hideSolution: false,
      photoDataUrl: photo,
    };
    setDrafts((prev) => [newDraft, ...prev]);
    setActiveDraftId(newDraft.id);
    setPlacingDraftId(null);
    return newDraft.id;
  };

  const getPinColorClass = (d: DefectItem) => {
    if (d.status === 'แก้ไขแล้ว') return 'bg-emerald-600 border-white';
    if (d.severity === 'เร่งด่วน') return 'bg-rose-600 border-white';
    if (d.severity === 'เล็กน้อย') return 'bg-blue-600 border-white';
    return 'bg-amber-500 border-white';
  };

  const context=useEditorMenu(()=>{
    // A stationary hold may have started a drag; cancel before release.
    if(!draggingPinRef.current?.moved)draggingPinRef.current=null;
    zoneDragRef.current=null;panStart.current=null;
  });
  const contextPinId=context.point?.target?.closest('[data-defect-id]')?.getAttribute('data-defect-id');
  const contextPin=floorDefects.find(d=>d.id===contextPinId);
  const contextZoneId=context.point?.target?.closest('[data-zone-id]')?.getAttribute('data-zone-id');
  const tr=(th:string,en:string)=>lang==='en'?en:th;
  const beginPinAction=(kind:'move'|'copy')=>{
    if(!contextPin)return;
    setPlacingDraftId(null);setPanMode(false);setIsZoneSetupMode(false);setPinPlacement({id:contextPin.id,kind});
  };
  const zoneTabs=(scrollToPlan=false)=>activeFloor&&activeDraft&&<div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('เลือกโซนสำหรับปักหมุด','Select zone for pin')}>
    {activeFloor.zones.map(z=>{
      const selected=currentZoneChoice?.zoneId===z.id;
      return <button type="button" key={z.id} aria-pressed={selected} onClick={()=>choosePinZone(z.id,scrollToPlan)} className={'inline-flex items-center gap-1.5 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-left '+(selected?'bg-blue-600 border-blue-600 text-white ring-2 ring-blue-200':'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/60" style={{background:z.border}}/><span className="break-words min-w-0">{z.name}</span>{selected&&<span aria-hidden="true">✓</span>}
      </button>;
    })}
    {!activeFloor.zones.length&&<button type="button" aria-pressed={readyToPlace} onClick={()=>choosePinZone(null,scrollToPlan)} className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold '+(readyToPlace?'bg-blue-600 text-white border-blue-600':'bg-white text-slate-700 border-slate-200')}>{tr('ทั้งชั้น (ยังไม่มีโซน)','Entire floor (no zones)')}</button>}
  </div>;
  const contextActions:MenuAction[]=[
    {label:tr('ย้อนตำแหน่งหมุด','Undo pin move'),shortcut:'Ctrl+Z',run:()=>applyPinHistory(false),disabled:!pinUndo.current.length},
    {label:tr('ทำซ้ำตำแหน่งหมุด','Redo pin move'),shortcut:'Ctrl+Y',run:()=>applyPinHistory(true),disabled:!pinRedo.current.length},
    {label:tr('เพิ่มหมุด Defect','Add Defect pin'),run:()=>{beginPlacement(activeDraft?.id||handleCreateBlankDraft());},disabled:!activeFloor},
    ...(contextPin?[
      {label:tr('แก้ไขหมุด','Edit pin')+' #'+contextPin.number,run:()=>onOpenDefectModal(contextPin.id)},
      {label:tr('ย้ายตำแหน่งหมุด','Move pin'),run:()=>beginPinAction('move')},
      {label:tr('คัดลอกหมุด','Copy pin'),run:()=>beginPinAction('copy')},
    ]:[]),
    ...(contextZoneId&&isZoneSetupMode?[{label:tr('แก้ไขโซน','Edit zone'),run:()=>onOpenZoneModal(contextZoneId)}]:[]),
    {label:panMode?tr('ออกจากโหมดเลื่อน','Exit pan'):tr('เลื่อนแปลน','Pan plan'),run:()=>{setPinPlacement(null);setPanMode(v=>!v);}},
    {label:tr('ซูมเข้า','Zoom in'),run:()=>changeZoom(planZoom+25)},
    {label:tr('ซูมออก','Zoom out'),run:()=>changeZoom(planZoom-25)},
    {label:tr('พอดีหน้าจอ','Fit view'),run:()=>{changeZoom(100);if(planViewport.current){planViewport.current.scrollLeft=0;planViewport.current.scrollTop=0;}}},
    ...(contextPin?[{label:tr('ลบหมุด','Delete pin')+' #'+contextPin.number,danger:true,run:()=>{if(window.confirm(tr('ยืนยันลบรายการ Defect ข้อที่ ','Delete Defect #')+contextPin.number+'?')){setPinPlacement(null);onUpdateProject(prev=>({...prev,defects:prev.defects.filter(d=>d.id!==contextPin.id)}));}}}]:[]),
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <EditorContextMenu point={context.point} actions={contextActions} onClose={context.close} closeLabel={tr('ปิดเมนู','Close menu')}/>
      {/* LEFT (7/12): Interactive Floor Plan Studio */}
      <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        {/* Floor Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {project.floors.map((f) => {
              const cnt = project.defects.filter((d) => d.floorId === f.id).length;
              const isActive = activeFloor?.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onSelectFloor(f.id);
                    setEditingFloorId(null);
                    setIsZoneSetupMode(false);
                    setSelectedZoneId(null);
                  }}
                  title={f.name}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors max-w-full break-words cursor-pointer ${
                    isActive
                      ? 'brand-bg text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {f.name} <span className="opacity-80 tabular-nums">({cnt})</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleAddFloor}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.addFloorBtn}
            </button>
            {activeFloor && (
              <button type="button"
                onClick={()=>setRenameFloor({id:activeFloor.id,name:activeFloor.name})}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer flex items-center gap-1">
                <Pencil className="w-3.5 h-3.5"/>
                {lang==='en'?'Rename floor':'เปลี่ยนชื่อชั้น'}
              </button>
            )}
            {project.floors.length > 1 && activeFloor && (
              <button
                type="button"
                onClick={() => onConfirmDeleteFloor(activeFloor)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 whitespace-nowrap cursor-pointer flex items-center gap-1"
                title={t.deleteFloorBtn}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t.deleteFloorBtn}
              </button>
            )}
          </div>
        </div>

        {renameFloor&&renameFloor.id===activeFloor?.id&&(
          <form onSubmit={handleRenameFloor} className="mb-3 p-3 rounded-xl border border-blue-200 bg-blue-50 space-y-2" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setRenameFloor(null);}}}>
            <label htmlFor="studio-floor-name" className="block text-xs font-semibold text-slate-700">{lang==='en'?'Floor name':'ชื่อชั้น'}</label>
            <input id="studio-floor-name" type="text" autoFocus maxLength={80} required value={renameFloor.name}
              onChange={e=>{const name=e.target.value;setRenameFloor(prev=>prev?{...prev,name}:null);}}
              placeholder={lang==='en'?'e.g. Ground floor, Mezzanine, Roof':'เช่น ชั้น 1, ชั้นลอย, ดาดฟ้า'}
              className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500"/>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={()=>setRenameFloor(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">{lang==='en'?'Cancel':'ยกเลิก'}</button>
              <button type="submit" disabled={!renameFloor.name.trim()} className="rounded-lg brand-bg text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{lang==='en'?'Save name':'บันทึกชื่อ'}</button>
            </div>
          </form>
        )}

        {/* Floor Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <label className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            {t.uploadFloorBtn}
            <input
              type="file"

              className="hidden"
              onChange={(e) => {
                handleFloorImageUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>

          {activeFloor && !activeFloor.imageUrl && (
            <button type="button" onClick={() => {
              if (isEditingFloor) { setEditingFloorId(null); return; }
              if (!activeFloor.isCustomBuilder && !window.confirm(lang === 'en' ? 'Replace the sample background with a custom plan? Existing zones and pins are kept.' : 'เปลี่ยนพื้นหลังแปลนตัวอย่างเป็นผังที่สร้างเองหรือไม่? โซนและหมุดเดิมจะยังอยู่')) return;
              onUpdateProject(prev => ({...prev, floors:prev.floors.map(fl=>fl.id===activeFloor.id?{...fl,isCustomBuilder:true,elements:fl.elements||[]}:fl)}));
              setIsZoneSetupMode(false); setPlacingDraftId(null); setSelectedZoneId(null); setEditingFloorId(activeFloor.id);
            }} className="text-xs px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-semibold cursor-pointer">
              {isEditingFloor ? (lang === 'en' ? 'Finish drawing' : 'เสร็จสิ้นการวาด') : (lang === 'en' ? 'Draw floor plan' : 'สร้าง / แก้ไขผังแปลนเอง')}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingFloorId(null);
              const next = !isZoneSetupMode;
              setIsZoneSetupMode(next);
              setPlacingDraftId(null);
              if (next) {setShowZoneOverlays(true);setPanMode(false);}
              setSelectedZoneId(null);setEditZoneFocus(null);
            }}
            className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              isZoneSetupMode
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {isZoneSetupMode ? t.zoneSetupDoneBtn : t.zoneSetupBtn}
          </button>

          <button
            type="button"
            onClick={() => setShowZoneOverlays((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {showZoneOverlays ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showZoneOverlays ? t.hideZonesBtn : t.showZonesBtn}
          </button>

          {isZoneSetupMode && (
            <button
              type="button"
              onClick={handleAddZone}
              className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.addZoneBtn}
            </button>
          )}
        </div>

        {/* Mode Banners */}
        {pinPlacement&&<div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-300 flex items-center justify-between gap-2 text-xs"><strong>{pinPlacement.kind==='move'?tr('คลิกตำแหน่งใหม่บนแปลนเพื่อย้ายหมุด','Click a new plan position to move pin'):tr('คลิกตำแหน่งใหม่บนแปลนเพื่อคัดลอกหมุด','Click a new plan position to copy pin')}</strong><button type="button" onClick={()=>setPinPlacement(null)} className="rounded border bg-white px-2 py-1">{tr('ยกเลิก','Cancel')}</button></div>}
        {activeDraft&&activeFloor&&!isZoneSetupMode&&!isEditingFloor&&!pinPlacement&&(
          <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-blue-900">{tr('ปักหมุด · ขั้นที่ 1 เลือกโซน','Pin · Step 1 Select zone')} · {activeFloor.name}</strong>
              {placingDraftId&&<button type="button" onClick={()=>setPlacingDraftId(null)} className="text-xs px-2 py-1 rounded border border-blue-200 bg-white">{t.cancelBtn}</button>}
            </div>
            {zoneTabs()}
            <p className="text-[11px] text-blue-800">{tr('เลือกโซนแล้วแปลนจะเลื่อนและซูมพอดีโซนอัตโนมัติ','Selecting a zone automatically pans and fits the plan to that zone.')}</p>
            <div className={'rounded-lg px-2.5 py-2 text-xs font-semibold '+(readyToPlace?'bg-blue-600 text-white':'bg-white text-slate-500')}>
              {readyToPlace?tr('ขั้นที่ 2 คลิกตำแหน่งบนแปลนในโซน: ','Step 2 Click the position inside: ')+(lockedZone?.name||activeFloor.name):tr('ขั้นที่ 2 เลือกโซนก่อน แล้วคลิกตำแหน่งบนแปลน','Step 2 Choose a zone, then click the plan')}
            </div>
          </div>
        )}

        {isZoneSetupMode && (
          <div className="mb-3 space-y-2">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-indigo-900">{tr('เลือกโซนที่ต้องการแก้ไข','Select zone to edit')} · {activeFloor?.name}</strong>
                <button type="button" aria-pressed={!editingZone} onClick={()=>{setSelectedZoneId(null);setEditZoneFocus(null);setShowZoneOverlays(true);}} className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold '+(!editingZone?'bg-indigo-600 border-indigo-600 text-white':'bg-white border-indigo-200 text-indigo-800')}>{tr('ทุกโซน','All zones')}</button>
              </div>
              <div role="group" aria-label={tr('เลือกโซนที่ต้องการแก้ไข','Select zone to edit')} className="flex flex-wrap gap-1.5">
                {activeFloor?.zones.map(z=><button type="button" key={z.id} aria-pressed={editingZone?.id===z.id} onClick={()=>{if(zoneDragRef.current)return;setSelectedZoneId(z.id);setEditZoneFocus({floorId:activeFloor.id,zoneId:z.id});setShowZoneOverlays(true);setPanMode(false);}} className={'inline-flex items-center gap-1.5 max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-left '+(editingZone?.id===z.id?'bg-indigo-600 border-indigo-600 text-white ring-2 ring-indigo-200':'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')}><span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/60" style={{background:z.border}}/><span className="min-w-0 break-words">{z.name}</span>{editingZone?.id===z.id&&<span aria-hidden="true">✓</span>}</button>)}
                {!activeFloor?.zones.length&&<span className="text-xs text-slate-500">{tr('ยังไม่มีโซน กดเพิ่มโซนใหม่','No zones yet. Add a zone first.')}</span>}
              </div>
              {editingZone&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-indigo-100 px-2.5 py-2 text-xs text-indigo-900"><span>{tr('กำลังแก้ไข: ','Editing: ')}<strong>{editingZone.name}</strong></span><button type="button" onClick={()=>onOpenZoneModal(editingZone.id)} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-white font-semibold"><Pencil className="w-3 h-3"/>{tr('แก้ชื่อ / สี / ลบโซน','Edit name / color / delete')}</button></div>}
              <p className="text-[11px] text-indigo-800">{tr('เลือกแท็บเพื่อซูมไปยังโซนและซ่อนโซนอื่นชั่วคราว ลากกรอบเพื่อย้ายหรือลากมุมเพื่อปรับขนาด','Select a tab to zoom to that zone and temporarily hide other zones. Drag to move or resize.')}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">{t.zoneSetupBanner}</div>
          </div>
        )}

        {/* Floorplan Stage */}
        {isEditingFloor && activeFloor ? (
          <CustomFloorEditor key={activeFloor.id} floor={activeFloor} lang={lang}
            onChange={updated => onUpdateProject(prev => ({...prev, floors:prev.floors.map(fl=>fl.id===updated.id?{...fl,isCustomBuilder:true,zones:updated.zones,elements:updated.elements}:fl)}))}
            onDone={() => {setEditingFloorId(null); setShowZoneOverlays(true);}} />
        ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs">
            <span className="font-semibold">{lang==='en'?'Pin size':'ขนาดหมุด'}</span>
            <input aria-label={lang==='en'?'Pin size':'ขนาดหมุด'} type="range" min={14} max={32} step={1} value={pinSize} onChange={ev=>setPinSize(+ev.target.value)} className="w-24 accent-blue-700"/>
            <span className="tabular-nums min-w-9">{pinSize}px</span>
            <span className="font-semibold ml-1">{lang==='en'?'Zoom':'ซูมแปลน'}</span>
            <button type="button" onClick={()=>changeZoom(planZoom-25)} className="border bg-white rounded px-2 py-1 font-bold" aria-label="Zoom out">−</button>
            <input aria-label={lang==='en'?'Plan zoom':'ซูมแปลน'} type="range" min={50} max={300} step={5} value={planZoom} onChange={ev=>changeZoom(+ev.target.value)} className="w-20 accent-blue-700"/>
            <button type="button" onClick={()=>changeZoom(planZoom+25)} className="border bg-white rounded px-2 py-1 font-bold" aria-label="Zoom in">+</button>
            <span className="tabular-nums">{planZoom}%</span>
            <button type="button" onClick={()=>{changeZoom(100);const vp=planViewport.current;if(vp){vp.scrollLeft=0;vp.scrollTop=0;}}} className="border bg-white rounded px-2 py-1">{lang==='en'?'Fit':'พอดีจอ'}</button>
            <button type="button" aria-pressed={panMode} onClick={()=>setPanMode(v=>!v)} className={'border rounded px-2 py-1 '+(panMode?'bg-blue-700 text-white':'bg-white')}>{lang==='en'?'Pan':'เลื่อนแปลน'}</button>
          </div>
          <div ref={planViewport} className={'relative w-full aspect-[4/3] overflow-auto rounded-xl border border-slate-300 bg-slate-50 '+(panMode?'cursor-grab active:cursor-grabbing touch-none':'')}
            {...context.bind}
            onPointerDownCapture={ev=>{context.bind.onPointerDownCapture(ev);if(!panMode||ev.button!==0||!ev.isPrimary)return;const vp=ev.currentTarget;ev.preventDefault();ev.stopPropagation();vp.setPointerCapture(ev.pointerId);panStart.current={x:ev.clientX,y:ev.clientY,left:vp.scrollLeft,top:vp.scrollTop,id:ev.pointerId};}}
            onPointerMove={ev=>{const p=panStart.current;if(!p||p.id!==ev.pointerId)return;ev.currentTarget.scrollLeft=p.left-(ev.clientX-p.x);ev.currentTarget.scrollTop=p.top-(ev.clientY-p.y);}}
            onPointerUp={ev=>{panStart.current=null;if(ev.currentTarget.hasPointerCapture(ev.pointerId))ev.currentTarget.releasePointerCapture(ev.pointerId);}}
            onPointerCancel={()=>{panStart.current=null;}}
            onClickCapture={ev=>{context.bind.onClickCapture(ev);if(panMode){ev.preventDefault();ev.stopPropagation();}}}>
        <div
          id="floorStage"
          ref={floorStageRef}
          tabIndex={0}
          onKeyDown={handlePlanKeys}
          onPointerDownCapture={e=>{e.currentTarget.focus({preventScroll:true});}}
          onClick={handleFloorStageClick}
          onDragOver={(e) => {
            e.preventDefault();
            setIsFloorDropActive(true);
          }}
          onDragLeave={() => setIsFloorDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsFloorDropActive(false);
            handleFloorImageUpload(e.dataTransfer.files?.[0]);
          }}
          style={{width:planZoom+'%',marginLeft:planZoom<100?'auto':0,marginRight:planZoom<100?'auto':0}}
          className={`relative aspect-[4/3] overflow-hidden bg-slate-50 select-none ${
            isZoneSetupMode ? 'zone-setup-active' : ''
          } ${readyToPlace||pinPlacement ? 'cursor-crosshair ring-2 ring-blue-400' : ''} ${
            isFloorDropActive ? 'floor-drop-active' : ''
          }`}
        >
          {activeFloor?.imageUrl ? (
            <img
              src={activeFloor.imageUrl}
              alt={activeFloor.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain pointer-events-none select-none bg-white"
            />
          ) : activeFloor?.isCustomBuilder ? (
            <img src={customFloorDataUrl(activeFloor)} alt={activeFloor.name} className="w-full h-full pointer-events-none select-none" />
          ) : (
            <FloorPlanSvg floorIndex={activeFloor?.svgPreset ?? 0} />
          )}

          {/* Zone Overlays */}
          {(showZoneOverlays||Boolean(readyToPlace&&lockedZone)||Boolean(editingZone)) &&
            activeFloor?.zones.filter(z=>(!readyToPlace||!lockedZone||z.id===lockedZone.id)&&(!editingZone||z.id===editingZone.id)).map((z) => (
              <div
                key={z.id}
                data-zone-id={z.id}
                onPointerDown={(e) => {
                  if (e.button!==0||!e.isPrimary||!isZoneSetupMode) return;
                  e.stopPropagation();
                  setSelectedZoneId(z.id);
                  zoneDragRef.current = {
                    zoneId: z.id,
                    mode: 'move',
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: z.x,
                    origY: z.y,
                    origW: z.w,
                    origH: z.h,
                  };
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (isZoneSetupMode) onOpenZoneModal(z.id);
                }}
                style={{
                  left: `${z.x}%`,
                  top: `${z.y}%`,
                  width: `${z.w}%`,
                  height: `${z.h}%`,
                  background: readyToPlace&&lockedZone?.id===z.id?`${z.bg}55`:`${z.bg}88`,
                  border: readyToPlace&&lockedZone?.id===z.id?'3px solid #2563eb':`2px dashed ${z.border}`,
                }}
                className={`zone-box absolute pointer-events-none ${z.w < 5 || z.h < 5 ? 'zone-box-compact rounded-sm' : 'rounded-xl'} ${
                  selectedZoneId === z.id ? 'zone-box-selected' : ''
                }`}
              >
                <div
                  className="zone-label inline-flex items-center gap-1 px-2 py-0.5 m-1 rounded-md text-[10px] sm:text-[11px] font-bold max-w-[92%] truncate"
                  style={{ background: z.border, color: '#ffffff' }}
                >
                  <span className="truncate">{z.name}</span>
                  {isZoneSetupMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenZoneModal(z.id);
                      }}
                      className="ml-1 px-1.5 bg-white/25 hover:bg-white/40 rounded text-[10px] cursor-pointer"
                    >
                      {t.zoneEditInline}
                    </button>
                  )}
                </div>

                {isZoneSetupMode && (
                  <div
                    className="zone-resize-handle"
                    title={lang==='en'?'Drag to resize zone':'ลากเพื่อปรับขนาดโซน'}
                    onPointerDown={(e) => {
                      if(e.button!==0||!e.isPrimary)return;
                      e.stopPropagation();
                      setSelectedZoneId(z.id);
                      zoneDragRef.current = {
                        zoneId: z.id,
                        mode: 'resize',
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: z.x,
                        origY: z.y,
                        origW: z.w,
                        origH: z.h,
                      };
                    }}
                  >
                    ↘
                  </div>
                )}
              </div>
            ))}

          {/* Defect Pins */}
          {!isZoneSetupMode &&
            floorDefects.map((d) => (
              <button
                key={d.id}
                type="button"
                data-defect-id={d.id}
                onPointerDown={(e) => {
                  if (e.button!==0||!e.isPrimary||placingDraftId||pinPlacement) return;
                  e.stopPropagation();
                  draggingPinRef.current = {
                    defectId: d.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    moved: false,
                    floorId:d.floorId,before:{x:d.x,y:d.y,zone:d.zone},last:{x:d.x,y:d.y,zone:d.zone},
                  };
                }}
                onClick={(e) => {
                  if(pinPlacement||placingDraftId)return;
                  e.stopPropagation();
                  if (pinMovedJustNowRef.current) {
                    pinMovedJustNowRef.current = false;
                    return;
                  }
                  onOpenDefectModal(d.id);
                }}
                style={{
                  left: `${d.x}%`,
                  top: `${d.y}%`,
                  transform: 'translate(-50%,-50%)',
                  width:pinSize,height:pinSize,fontSize:Math.max(8,Math.round(pinSize*0.52)),touchAction:'none',
                }}
                title={`#${d.number} ${d.title} (${translateDefectStatus(d.status, lang)})`}
                className={`pin-marker absolute z-20 rounded-full text-white font-extrabold border shadow-sm flex items-center justify-center tabular-nums cursor-pointer ${getPinColorClass(
                  d
                )}`}
              >
                {d.number}
              </button>
            ))}
        </div>
        </div>
        </div>
        )}

        {!isEditingFloor&&<p className="hidden sm:block text-[10px] text-slate-500 mt-2">{lang==='en'?'Right-click / hold for menu · Click the plan · Ctrl+Z undo pin move · Ctrl+Y redo':'คลิกขวา / แตะค้างเพื่อเปิดเมนู · คลิกแปลน · Ctrl+Z ย้อนตำแหน่งหมุด · Ctrl+Y ทำซ้ำ'}</p>}
        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" /> {t.legendUrgent}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> {t.legendModerate}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> {t.legendMinor}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> {t.legendFixed}
            </span>
          </div>
          <span>{t.floorHint}</span>
        </div>
      </div>

      {/* RIGHT (5/12): Single Unified Card — Photo Markup Canvas + AI Analyzer + Defect Form */}
      <div className="lg:col-span-5">
        <div
          className={`bg-white rounded-2xl border p-4 sm:p-5 transition-colors ${
            activeDraft && placingDraftId === activeDraft.id
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-slate-200'
          }`}
        >
          {/* (1) Header + Upload Photo Button */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">{t.markupTitle}</h3>
            <label className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              {t.uploadFieldPhotoBtn}
              <input type="file" className="hidden" onChange={handleMarkupUpload} />
            </label>
          </div>

          {/* (1-2) Drawing/Text Toolbar + Single Site Photo Canvas */}
          <MarkupCanvasEditor
            lang={lang}
            imageSrc={markupImageSrc}
            onImageChange={setMarkupImageSrc}
            onNotify={onNotify}
            editorRef={markupEditorRef}
          />

          {/* (3) Optional AI Notes + Analyze / Blank Draft Buttons */}
          <div className="mt-3 space-y-2.5">
            <textarea
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={t.aiNotesPlaceholder}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleAnalyzeWithAI}
                disabled={isAnalyzing}
                className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing ? t.analyzingAiBtn : t.analyzeAiBtn}
              </button>
              <button
                type="button"
                onClick={handleCreateBlankDraft}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {t.createBlankDraftBtn}
              </button>
            </div>
          </div>

          {/* (4) Divider + Inline Defect Form Directly Below (Zero Duplicate Photos) */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            {!activeDraft ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center text-xs text-slate-500 leading-relaxed">
                {t.draftEmptyHint}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Multi-draft Tab Pills when more than 1 unpinned draft exists */}
                {drafts.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    {drafts.map((dr, idx) => {
                      const isCurrent = dr.id === activeDraft.id;
                      return (
                        <button
                          key={dr.id}
                          type="button"
                          onClick={() => {
                            setActiveDraftId(dr.id);
                            setPlacingDraftId(null);
                            if (dr.photoDataUrl !== undefined) {
                              setMarkupImageSrc(dr.photoDataUrl);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                            isCurrent
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {dr.fromAI && <Sparkles className="w-3 h-3 text-indigo-400" />}
                          {t.draftTabPrefix} {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Status Badge + Clear Form Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                        activeDraft.fromAI
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {activeDraft.fromAI ? t.draftFromAiBadge : t.draftManualBadge}
                    </span>
                    <span className="text-[11px] text-slate-600 font-medium truncate">
                      {t.autoBeforeFromTopBadge}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const remaining = drafts.filter((item) => item.id !== activeDraft.id);
                      setDrafts(remaining);
                      setActiveDraftId(remaining[0]?.id || null);
                      if (placingDraftId === activeDraft.id) setPlacingDraftId(null);
                    }}
                    className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg font-semibold cursor-pointer flex items-center gap-1 shrink-0"
                    title={t.clearDraftBtn}
                  >
                    <X className="w-3.5 h-3.5" />
                    {t.clearDraftBtn}
                  </button>
                </div>

                {/* Defect Title & Severity */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {t.defectTitleLabel}
                    </label>
                    <input
                      type="text"
                      value={activeDraft.title}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.id === activeDraft.id
                              ? { ...item, title: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder={t.defectTitlePlaceholder}
                      className="w-full px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {t.severityLabel}
                    </label>
                    <select
                      value={activeDraft.severity}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.id === activeDraft.id
                              ? {
                                  ...item,
                                  severity: e.target.value as DraftDefect['severity'],
                                }
                              : item
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="เร่งด่วน">{translateSeverity('เร่งด่วน', lang)}</option>
                      <option value="ปานกลาง">{translateSeverity('ปานกลาง', lang)}</option>
                      <option value="เล็กน้อย">{translateSeverity('เล็กน้อย', lang)}</option>
                    </select>
                  </div>
                </div>

                {/* Engineering Cause */}
                {!activeDraft.hideCause ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        {t.causeLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) =>
                            prev.map((item) =>
                              item.id === activeDraft.id ? { ...item, hideCause: true } : item
                            )
                          )
                        }
                        className="text-[11px] text-rose-500 hover:underline font-semibold cursor-pointer"
                      >
                        {t.hideFieldBtn}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={activeDraft.cause}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.id === activeDraft.id
                              ? { ...item, cause: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder={t.causePlaceholder}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) =>
                        prev.map((item) =>
                          item.id === activeDraft.id ? { ...item, hideCause: false } : item
                        )
                      )
                    }
                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    {t.addCauseBtn}
                  </button>
                )}

                {/* Solution */}
                {!activeDraft.hideSolution ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        {t.solutionLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) =>
                            prev.map((item) =>
                              item.id === activeDraft.id
                                ? { ...item, hideSolution: true }
                                : item
                            )
                          )
                        }
                        className="text-[11px] text-rose-500 hover:underline font-semibold cursor-pointer"
                      >
                        {t.hideFieldBtn}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={activeDraft.solution}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.id === activeDraft.id
                              ? { ...item, solution: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder={t.solutionPlaceholder}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) =>
                        prev.map((item) =>
                          item.id === activeDraft.id
                            ? { ...item, hideSolution: false }
                            : item
                        )
                      )
                    }
                    className="text-[11px] text-blue-600 hover:underline font-semibold ml-2 cursor-pointer"
                  >
                    {t.addSolutionBtn}
                  </button>
                )}

                {/* Two-step pin placement, shared with the plan zone tabs. */}
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><MapPin className="w-4 h-4"/>{tr('ปักหมุดลงแปลน','Place pin on plan')} · {activeFloor?.name}</h4>
                  <div className="text-xs font-semibold text-slate-700">{tr('1. เลือกโซน','1. Select zone')}</div>
                  {zoneTabs(true)}
                  <button type="button" disabled={!activeFloor} onClick={()=>{if(!readyToPlace)beginPlacement(activeDraft.id);window.requestAnimationFrame(()=>planViewport.current?.scrollIntoView({block:'nearest',behavior:'smooth'}));}} className={'w-full py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 '+(readyToPlace?'bg-blue-600 text-white':'brand-bg hover:opacity-95 text-white')}>
                    <MapPin className="w-4 h-4"/>{readyToPlace?tr('2. คลิกตำแหน่งปักหมุดบนแปลน','2. Click position on plan'):tr('เลือกโซนก่อนปักหมุด','Select zone before placing')}
                  </button>
                  {readyToPlace&&<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-800"><span>{tr('โซนที่เลือก: ','Selected zone: ')}{lockedZone?.name||activeFloor?.name}</span><button type="button" className="underline" onClick={()=>setPlacingDraftId(null)}>{t.cancelBtn}</button></div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
