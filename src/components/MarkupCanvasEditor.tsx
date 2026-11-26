import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Circle,
  Eraser,
  Pen,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Upload,
} from 'lucide-react';
import type { AppLanguage, MarkupShape, MarkupTool } from '../types/inspection';
import { UI_TEXT } from '../i18n/translations';
import { compressImageFile } from '../utils/imageUtils';

export interface MarkupCanvasEditorHandle {
  exportDataUrl: () => string | null;
}

interface MarkupCanvasEditorProps {
  lang: AppLanguage;
  imageSrc: string | null;
  onImageChange: (nextSrc: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
  editorRef?: React.MutableRefObject<MarkupCanvasEditorHandle | null>;
  aspectClass?: string;
}

const COLOR_SWATCHES = ['#ef4444', '#facc15', '#2563eb', '#16a34a', '#ffffff'];
const STROKE_SIZES = [
  { label: 'S', value: 2.5 },
  { label: 'M', value: 4.5 },
  { label: 'L', value: 7.5 },
];

export function drawMarkupShape(
  ctx: CanvasRenderingContext2D,
  s: MarkupShape,
  w: number,
  h: number
) {
  const x1 = s.x1 * w;
  const y1 = s.y1 * h;
  const x2 = s.x2 * w;
  const y2 = s.y2 * h;
  const lw = s.lineWidth || 4;

  ctx.save();
  ctx.strokeStyle = s.color || '#ef4444';
  ctx.fillStyle = s.color || '#ef4444';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'pen' && s.points && s.points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
    }
    ctx.stroke();
  } else if (s.tool === 'circle') {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(4, rx), Math.max(4, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.tool === 'rect') {
    ctx.strokeRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1)
    );
  } else if (s.tool === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(12, lw * 3.2);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  } else if (s.tool === 'text' && s.text) {
    const fontSize = Math.round(13 + lw * 1.4);
    ctx.font = `700 ${fontSize}px Sarabun, sans-serif`;
    ctx.textBaseline = 'middle';
    const paddingX = 8;
    const paddingY = 5;
    const textWidth = ctx.measureText(s.text).width;
    const boxW = textWidth + paddingX * 2;
    const boxH = fontSize + paddingY * 2;
    const clampedX = Math.max(4, Math.min(w - boxW - 4, x1));
    const clampedY = Math.max(boxH / 2 + 4, Math.min(h - boxH / 2 - 4, y1));

    // High-contrast backing pill for clear readability on any photo
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = s.color || '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(clampedX, clampedY - boxH / 2, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = s.color === '#ffffff' ? '#ffffff' : '#ffffff';
    ctx.fillText(s.text, clampedX + paddingX, clampedY + 1);
    // Small accent dot matching chosen color
    ctx.fillStyle = s.color || '#ef4444';
    ctx.fillRect(clampedX, clampedY - boxH / 2, 4, boxH);
  }

  ctx.restore();
}

export const MarkupCanvasEditor: React.FC<MarkupCanvasEditorProps> = ({
  lang,
  imageSrc,
  onImageChange,
  onNotify,
  editorRef,
  aspectClass = 'aspect-[4/3]',
}) => {
  const t = UI_TEXT[lang];
  const [tool, setTool] = useState<MarkupTool>('pen');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState<number>(4.5);
  const [shapes, setShapes] = useState<MarkupShape[]>([]);

  // Inline text input popup at clicked coordinates
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentShapeRef = useRef<MarkupShape | null>(null);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    const imgRatio = img.width / img.height;
    const canRatio = w / h;
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;
    if (imgRatio > canRatio) {
      dh = w / imgRatio;
      dy = (h - dh) / 2;
    } else {
      dw = h * imgRatio;
      dx = (w - dw) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);

    shapes.forEach((s) => drawMarkupShape(ctx, s, w, h));
    if (currentShapeRef.current) {
      drawMarkupShape(ctx, currentShapeRef.current, w, h);
    }
  }, [shapes]);

  const syncDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !imageSrc) return;
    canvas.width = wrap.clientWidth || 520;
    canvas.height = wrap.clientHeight || 390;
    redrawCanvas();
  }, [imageSrc, redrawCanvas]);

  useEffect(() => {
    setShapes([]);
    setPendingTextPos(null);
    setPendingTextValue('');
    if (!imageSrc) {
      loadedImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      syncDimensions();
    };
    img.src = imageSrc;
  }, [imageSrc, syncDimensions]);

  useEffect(() => {
    redrawCanvas();
  }, [shapes, redrawCanvas]);

  useEffect(() => {
    const onResize = () => {
      if (imageSrc) syncDimensions();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [imageSrc, syncDimensions]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      exportDataUrl: () => {
        if (!imageSrc) return null;
        const canvas = canvasRef.current;
        if (canvas && canvas.width > 0 && shapes.length > 0) {
          try {
            return canvas.toDataURL('image/jpeg', 0.84);
          } catch {
            // fallback
          }
        }
        return imageSrc;
      },
    };
  }, [editorRef, imageSrc, shapes]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 960, 0.82);
      onImageChange(compressed);
    } catch {
      onNotify(lang === 'en' ? 'Failed to load image file' : 'ไม่สามารถอ่านไฟล์รูปภาพได้', 'danger');
    }
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      nx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      ny: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { nx, ny } = getPos(e);

    if (tool === 'text') {
      setPendingTextPos({ x: nx, y: ny });
      setPendingTextValue('');
      return;
    }

    setPendingTextPos(null);
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentShapeRef.current = {
      tool,
      color,
      lineWidth,
      x1: nx,
      y1: ny,
      x2: nx,
      y2: ny,
      points: tool === 'pen' ? [{ x: nx, y: ny }] : undefined,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentShapeRef.current) return;
    const { nx, ny } = getPos(e);
    if (currentShapeRef.current.tool === 'pen') {
      currentShapeRef.current.points = [
        ...(currentShapeRef.current.points || []),
        { x: nx, y: ny },
      ];
    } else {
      currentShapeRef.current.x2 = nx;
      currentShapeRef.current.y2 = ny;
    }
    redrawCanvas();
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !currentShapeRef.current) return;
    const s = currentShapeRef.current;
    isDrawingRef.current = false;
    currentShapeRef.current = null;
    const hasMovement =
      s.tool === 'pen'
        ? (s.points?.length || 0) > 1
        : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.012;
    if (hasMovement) {
      setShapes((prev) => [...prev, s]);
    } else {
      redrawCanvas();
    }
  };

  const commitTextAnnotation = () => {
    const clean = pendingTextValue.trim();
    if (!pendingTextPos || !clean) {
      setPendingTextPos(null);
      setPendingTextValue('');
      return;
    }
    const newShape: MarkupShape = {
      tool: 'text',
      color,
      lineWidth,
      x1: pendingTextPos.x,
      y1: pendingTextPos.y,
      x2: pendingTextPos.x,
      y2: pendingTextPos.y,
      text: clean,
    };
    setShapes((prev) => [...prev, newShape]);
    setPendingTextPos(null);
    setPendingTextValue('');
  };

  const tools: Array<{ id: MarkupTool; label: string; icon: React.ReactNode }> = [
    { id: 'pen', label: t.toolPen, icon: <Pen className="w-3.5 h-3.5" /> },
    { id: 'circle', label: t.toolCircle, icon: <Circle className="w-3.5 h-3.5" /> },
    { id: 'arrow', label: t.toolArrow, icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
    { id: 'rect', label: t.toolRect, icon: <Square className="w-3.5 h-3.5" /> },
    { id: 'text', label: t.toolText, icon: <TypeIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-2.5">
      {/* Drawing Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1">
          {tools.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTool(item.id);
                setPendingTextPos(null);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                tool === item.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Color, Stroke Width, Undo, Clear */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 pr-1 border-r border-slate-200">
            {COLOR_SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => setColor(sw)}
                style={{ backgroundColor: sw }}
                className={`w-5 h-5 rounded-full border cursor-pointer ${
                  color === sw ? 'ring-2 ring-slate-900 border-white scale-110' : 'border-slate-300'
                }`}
                title={sw}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
              title="Color"
            />
          </div>

          <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200" title={t.sizeLabel}>
            {STROKE_SIZES.map((sz) => (
              <button
                key={sz.label}
                type="button"
                onClick={() => setLineWidth(sz.value)}
                className={`px-1.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  lineWidth === sz.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {sz.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShapes((prev) => prev.slice(0, -1))}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer"
            title={t.undoTooltip}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShapes([]);
              setPendingTextPos(null);
            }}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer"
            title={t.clearTooltip}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          {imageSrc && (
            <button
              type="button"
              onClick={() => {
                onImageChange(null);
                setShapes([]);
                setPendingTextPos(null);
              }}
              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
              title={t.deletePhotoTooltip}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {tool === 'text' && imageSrc && (
        <div className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
          {t.textHint}
        </div>
      )}

      {/* Canvas Container */}
      <div
        ref={wrapRef}
        className={`relative w-full ${aspectClass} rounded-xl bg-slate-100 border border-dashed border-slate-300 overflow-hidden flex items-center justify-center`}
      >
        <canvas
          id="markupCanvas"
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`w-full h-full block ${
            tool === 'text' ? 'cursor-text' : 'cursor-crosshair'
          } ${imageSrc ? '' : 'hidden'}`}
        />

        {/* Floating Text Annotation Input */}
        {pendingTextPos && imageSrc && (
          <div
            style={{
              left: `${Math.min(70, Math.max(4, pendingTextPos.x * 100))}%`,
              top: `${Math.min(82, Math.max(8, pendingTextPos.y * 100))}%`,
            }}
            onClick={(e) => e.stopPropagation()}
            className="absolute z-30 bg-white rounded-xl shadow-xl border border-slate-300 p-2 flex items-center gap-1.5 min-w-[210px]"
          >
            <input
              type="text"
              autoFocus
              value={pendingTextValue}
              onChange={(e) => setPendingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTextAnnotation();
                } else if (e.key === 'Escape') {
                  setPendingTextPos(null);
                }
              }}
              placeholder={t.textPlaceholder}
              className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={commitTextAnnotation}
              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {t.textSaveBtn}
            </button>
          </div>
        )}

        {!imageSrc && (
          <label className="flex flex-col items-center justify-center text-center p-6 cursor-pointer w-full h-full hover:bg-slate-200/40 transition-colors">
            <Camera className="w-8 h-8 text-slate-400 mb-2" />
            <span className="text-xs sm:text-sm font-semibold text-slate-700">
              {t.uploadPromptTitle}
            </span>
            <span className="text-xs text-slate-500 mt-1">{t.uploadPromptSub}</span>
            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">
              <Upload className="w-3.5 h-3.5" />
              {t.uploadFieldPhotoBtn}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        )}
      </div>
    </div>
  );
};
