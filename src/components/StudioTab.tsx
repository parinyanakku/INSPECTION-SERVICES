import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  MapPin,
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
import { ZONE_COLOR_PRESETS } from '../data/defaultData';
import { UI_TEXT, translateDefectStatus, translateSeverity } from '../i18n/translations';
import {
  analyzeDefectWithGeminiClient,
  loadGeminiConfig,
} from '../utils/geminiClient';
import { compressImageFile } from '../utils/imageUtils';
import { FloorPlanSvg } from './FloorPlanSvg';
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

function findZoneAtPoint(floor: FloorPlan | null, xPct: number, yPct: number): FloorZone | null {
  if (!floor || !Array.isArray(floor.zones)) return null;
  return (
    floor.zones.find(
      (z) => xPct >= z.x && xPct <= z.x + z.w && yPct >= z.y && yPct <= z.y + z.h
    ) || null
  );
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

  const [isZoneSetupMode, setIsZoneSetupMode] = useState(false);
  const [showZoneOverlays, setShowZoneOverlays] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isFloorDropActive, setIsFloorDropActive] = useState(false);

  // Pin & Zone drag state refs
  const floorStageRef = useRef<HTMLDivElement | null>(null);
  const draggingPinRef = useRef<{
    defectId: string;
    startX: number;
    startY: number;
    moved: boolean;
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
  const [placingDraftId, setPlacingDraftId] = useState<string | null>(null);

  const activeDraft =
    drafts.find((d) => d.id === activeDraftId) || drafts[0] || null;

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
                      x: Math.max(0, Math.min(100 - z.w, +(zi.origX + dxPct).toFixed(1))),
                      y: Math.max(0, Math.min(100 - z.h, +(zi.origY + dyPct).toFixed(1))),
                    };
                  }
                  return {
                    ...z,
                    w: Math.max(10, Math.min(100 - z.x, +(zi.origW + dxPct).toFixed(1))),
                    h: Math.max(8, Math.min(100 - z.y, +(zi.origH + dyPct).toFixed(1))),
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
          const currentFlId = activeFloorIdRef.current;
          onUpdateProjectRef.current((prev) => {
            const fl = prev.floors.find((f) => f.id === currentFlId) || null;
            return {
              ...prev,
              defects: prev.defects.map((d) => {
                if (d.id !== dp.defectId) return d;
                const matched = findZoneAtPoint(fl, d.x, d.y);
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
    if (!file.type.startsWith('image/')) {
      onNotify(
        lang === 'en'
          ? 'Please select an image file (JPG, PNG, WEBP)'
          : 'กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP)',
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
      onNotify(
        lang === 'en'
          ? `Uploaded floorplan for "${activeFloor.name}"`
          : `อัปโหลดรูปแปลน "${activeFloor.name}" เรียบร้อยแล้ว`,
        'success'
      );
    } catch {
      onNotify(
        lang === 'en' ? 'Failed to load floorplan image' : 'ไม่สามารถโหลดรูปแปลนได้',
        'danger'
      );
    }
  };

  const handleAddFloor = () => {
    const nextNum = project.floors.length + 1;
    const newId = `fl_${Date.now()}`;
    const floorLabel = lang === 'en' ? `Floor ${nextNum}` : `ชั้น ${nextNum}`;
    onUpdateProject((prev) => ({
      ...prev,
      floors: [
        ...prev.floors,
        {
          id: newId,
          name: floorLabel,
          subtitle: lang === 'en' ? '1 Zone' : '1 โซน',
          imageUrl: null,
          svgPreset: nextNum % 2 === 1 ? 0 : 1,
          zones: [
            {
              id: `z_${Date.now()}`,
              name: lang === 'en' ? `Main Zone Floor ${nextNum}` : `โซนหลัก ชั้น ${nextNum}`,
              x: 10,
              y: 10,
              w: 80,
              h: 80,
              bg: '#dbeafe',
              border: '#2563eb',
            },
          ],
        },
      ],
    }));
    onSelectFloor(newId);
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
    setIsZoneSetupMode(true);
    setShowZoneOverlays(true);
  };

  const handleFloorStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingDraftId || isZoneSetupMode || !activeFloor) return;
    const draft = drafts.find((d) => d.id === placingDraftId);
    if (!draft) return;

    const stage = floorStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const xPct = Math.max(
      2,
      Math.min(98, +(((e.clientX - rect.left) / rect.width) * 100).toFixed(2))
    );
    const yPct = Math.max(
      2,
      Math.min(98, +(((e.clientY - rect.top) / rect.height) * 100).toFixed(2))
    );

    const matchedZone = findZoneAtPoint(activeFloor, xPct, yPct);
    const nextNum =
      project.defects.length > 0
        ? Math.max(...project.defects.map((d) => d.number || 0)) + 1
        : 1;

    const liveCanvasPhoto = markupEditorRef.current?.exportDataUrl() ?? markupImageSrc;
    const newDefect: DefectItem = {
      id: `def_${Date.now()}`,
      number: nextNum,
      floorId: activeFloor.id,
      zone: matchedZone ? matchedZone.name : activeFloor.zones[0]?.name || activeFloor.name,
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
        ? `Pinned defect #${nextNum} onto "${activeFloor.name}"`
        : `ปักหมุดข้อที่ #${nextNum} ลงบน "${activeFloor.name}" เรียบร้อยแล้ว`,
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
        lang === 'en' ? 'Failed to load image file' : 'ไม่สามารถอ่านไฟล์รูปภาพได้',
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

    const photoDataUrl = markupEditorRef.current?.exportDataUrl() ?? markupImageSrc;
    if (!photoDataUrl) {
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
        imageDataUrl: photoDataUrl,
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
        photoDataUrl,
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
  };

  const getPinColorClass = (d: DefectItem) => {
    if (d.status === 'แก้ไขแล้ว') return 'bg-emerald-600 border-white';
    if (d.severity === 'เร่งด่วน') return 'bg-rose-600 border-white';
    if (d.severity === 'เล็กน้อย') return 'bg-blue-600 border-white';
    return 'bg-amber-500 border-white';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
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
                    setSelectedZoneId(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
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

        {/* Floor Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <label className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            {t.uploadFloorBtn}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleFloorImageUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              const next = !isZoneSetupMode;
              setIsZoneSetupMode(next);
              setPlacingDraftId(null);
              if (next) setShowZoneOverlays(true);
              setSelectedZoneId(null);
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
        {placingDraftId && (
          <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-300 flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-semibold text-blue-900">
              {t.placingBanner} &ldquo;{activeFloor?.name}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setPlacingDraftId(null)}
              className="text-xs px-3 py-1 rounded-lg bg-white border border-blue-300 text-blue-800 font-semibold cursor-pointer whitespace-nowrap"
            >
              {t.cancelBtn}
            </button>
          </div>
        )}

        {isZoneSetupMode && (
          <div className="mb-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
            {t.zoneSetupBanner}
          </div>
        )}

        {/* Floorplan Stage */}
        <div
          id="floorStage"
          ref={floorStageRef}
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
          className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-300 bg-slate-50 select-none ${
            isZoneSetupMode ? 'zone-setup-active' : ''
          } ${placingDraftId ? 'cursor-crosshair ring-2 ring-blue-400' : ''} ${
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
          ) : (
            <FloorPlanSvg floorIndex={activeFloor?.svgPreset ?? 0} />
          )}

          {/* Zone Overlays */}
          {showZoneOverlays &&
            activeFloor?.zones.map((z) => (
              <div
                key={z.id}
                data-zone-id={z.id}
                onPointerDown={(e) => {
                  if (!isZoneSetupMode) return;
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
                  background: `${z.bg}88`,
                  border: `2px dashed ${z.border}`,
                }}
                className={`zone-box absolute rounded-xl pointer-events-none ${
                  selectedZoneId === z.id ? 'zone-box-selected' : ''
                }`}
              >
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 m-1 rounded-md text-[10px] sm:text-[11px] font-bold max-w-[92%] truncate"
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
                    onPointerDown={(e) => {
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
                  if (placingDraftId) return;
                  e.stopPropagation();
                  draggingPinRef.current = {
                    defectId: d.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    moved: false,
                  };
                }}
                onClick={(e) => {
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
                }}
                title={`#${d.number} ${d.title} (${translateDefectStatus(d.status, lang)})`}
                className={`pin-marker absolute z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full text-white text-[11px] sm:text-xs font-extrabold border-2 shadow-md flex items-center justify-center tabular-nums cursor-pointer ${getPinColorClass(
                  d
                )}`}
              >
                {d.number}
              </button>
            ))}
        </div>

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
              <input type="file" accept="image/*" className="hidden" onChange={handleMarkupUpload} />
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

                {/* Primary Pin Action Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsZoneSetupMode(false);
                    const next =
                      placingDraftId === activeDraft.id ? null : activeDraft.id;
                    setPlacingDraftId(next);
                    if (next) {
                      onNotify(
                        lang === 'en'
                          ? 'Click anywhere on the active floorplan to place this pin'
                          : 'คลิกตำแหน่งที่ต้องการบนแปลนชั้นปัจจุบันเพื่อปักหมุด',
                        'info'
                      );
                    }
                  }}
                  className={`w-full py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    placingDraftId === activeDraft.id
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'brand-bg hover:opacity-95 text-white'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {placingDraftId === activeDraft.id
                    ? t.pinToPlanActiveBtn
                    : t.pinToPlanBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
