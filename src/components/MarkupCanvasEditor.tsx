import {imageUploadError} from '../utils/dngImage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Camera,
  Circle,
  Eraser,
  Maximize2,
  Pen,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Redo2,
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

type OrientedShape = MarkupShape & { orientation?: number };
const quarter = (n: number) => ((n % 4) + 4) % 4;
function orientedSize(w: number, h: number, turns: number) {
  return quarter(turns) % 2 ? { w: h, h: w } : { w, h };
}
// Draw source coordinates into a rotated rectangle without resampling the source.
function withQuarterTurn(ctx: CanvasRenderingContext2D, w: number, h: number, turns: number, draw: (w: number, h: number) => void) {
  ctx.save();
  try {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(quarter(turns) * Math.PI / 2);
    const size = orientedSize(w, h, turns);
    ctx.translate(-size.w / 2, -size.h / 2);
    draw(size.w, size.h);
  } finally { ctx.restore(); }
}
function drawOrientedShape(ctx: CanvasRenderingContext2D, shape: OrientedShape, w: number, h: number, rotation: number) {
  withQuarterTurn(ctx, w, h, rotation - (shape.orientation ?? 0), (sw, sh) => drawMarkupShape(ctx, shape, sw, sh));
}
const COLOR_SWATCHES = ['#ef4444', '#facc15', '#2563eb', '#16a34a', '#ffffff'];


/**
 * Computes the letterboxed/contained draw rectangle (dx, dy, dw, dh) of an image
 * inside a canvas of size (canW, canH). All MarkupShape coordinates [0..1] are
 * normalized strictly to (dx, dy, dw, dh) so marks stay 100% aligned between
 * inline card, fullscreen mode, and exported high-res images.
 */
export function getImageDrawRect(
  imgW: number,
  imgH: number,
  canW: number,
  canH: number
): { dx: number; dy: number; dw: number; dh: number } {
  if (imgW <= 0 || imgH <= 0 || canW <= 0 || canH <= 0) {
    return { dx: 0, dy: 0, dw: canW, dh: canH };
  }
  const imgRatio = imgW / imgH;
  const canRatio = canW / canH;
  let dw = canW;
  let dh = canH;
  let dx = 0;
  let dy = 0;
  if (imgRatio > canRatio) {
    dh = canW / imgRatio;
    dy = (canH - dh) / 2;
  } else {
    dw = canH * imgRatio;
    dx = (canW - dw) / 2;
  }
  return { dx, dy, dw, dh };
}

export function drawMarkupShape(
  ctx: CanvasRenderingContext2D,
  s: MarkupShape,
  w: number,
  h: number,
  offsetX = 0,
  offsetY = 0
) {
  const x1 = offsetX + s.x1 * w;
  const y1 = offsetY + s.y1 * h;
  const x2 = offsetX + s.x2 * w;
  const y2 = offsetY + s.y2 * h;
  const baseLw = s.lineWidth || 4.5;
  const scale = Math.max(0.3, w / 520);
  const lw = baseLw * scale;

  ctx.save();
  ctx.strokeStyle = s.color || '#ef4444';
  ctx.fillStyle = s.color || '#ef4444';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'pen' && s.points && s.points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(offsetX + s.points[0].x * w, offsetY + s.points[0].y * h);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(offsetX + s.points[i].x * w, offsetY + s.points[i].y * h);
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
    const headLen = Math.max(12 * scale, lw * 3.2);
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
    const fontSize = Math.round((13 + baseLw * 1.4) * scale);
    ctx.font = `700 ${fontSize}px Sarabun, sans-serif`;
    ctx.textBaseline = 'middle';
    const paddingX = Math.round(8 * scale);
    const paddingY = Math.round(5 * scale);
    const textWidth = ctx.measureText(s.text).width;
    const boxW = textWidth + paddingX * 2;
    const boxH = fontSize + paddingY * 2;
    const margin = Math.max(4, Math.round(4 * scale));
    const minX = offsetX + margin;
    const maxX = Math.max(minX, offsetX + w - boxW - margin);
    const minY = offsetY + boxH / 2 + margin;
    const maxY = Math.max(minY, offsetY + h - boxH / 2 - margin);
    const clampedX = Math.max(minX, Math.min(maxX, x1));
    const clampedY = Math.max(minY, Math.min(maxY, y1));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = s.color || '#ef4444';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.roundRect(clampedX, clampedY - boxH / 2, boxW, boxH, Math.max(4, Math.round(6 * scale)));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(s.text, clampedX + paddingX, clampedY + Math.max(1, Math.round(scale)));
    ctx.fillStyle = s.color || '#ef4444';
    ctx.fillRect(clampedX, clampedY - boxH / 2, Math.max(3, Math.round(4 * scale)), boxH);
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
  const [shapes, setShapes] = useState<OrientedShape[]>([]);
  const rotationRef = useRef(0);
  const undoRef = useRef<Array<{ rotation: number; shapes: OrientedShape[] }>>([]);
  const redoRef = useRef<Array<{ rotation: number; shapes: OrientedShape[] }>>([]);
  const rootRef=useRef<HTMLDivElement>(null);
  const fullscreenRootRef=useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Inline text input popup at image-normalized coordinates [0..1]
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenWrapRef = useRef<HTMLDivElement | null>(null);

  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const imageSrcRef = useRef<string | null>(imageSrc);
  const shapesRef = useRef<OrientedShape[]>(shapes);
  const isFullscreenRef = useRef(isFullscreen);
  const pendingTextPosRef = useRef(pendingTextPos);
  const isDrawingRef = useRef(false);
  const currentShapeRef = useRef<OrientedShape | null>(null);

  imageSrcRef.current = imageSrc;
  shapesRef.current = shapes;
  isFullscreenRef.current = isFullscreen;
  pendingTextPosRef.current = pendingTextPos;

  const paintCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    const img = loadedImageRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    const rotation = rotationRef.current;
    const size = orientedSize(img.naturalWidth, img.naturalHeight, rotation);
    const { dx, dy, dw, dh } = getImageDrawRect(size.w, size.h, w, h);
    ctx.save();
    ctx.translate(dx, dy);
    withQuarterTurn(ctx, dw, dh, rotation, (iw, ih) => ctx.drawImage(img, 0, 0, iw, ih));
    for (const shape of shapesRef.current) drawOrientedShape(ctx, shape, dw, dh, rotation);
    if (currentShapeRef.current) drawOrientedShape(ctx, currentShapeRef.current, dw, dh, rotation);
    ctx.restore();
  }, []);

  const drawActiveCanvases = useCallback(() => {
    paintCanvas(canvasRef.current);
    if (isFullscreenRef.current) {
      paintCanvas(fullscreenCanvasRef.current);
    }
  }, [paintCanvas]);

  const remember = () => {
    redoRef.current=[];
    undoRef.current.push({ rotation: rotationRef.current, shapes: shapesRef.current });
    if (undoRef.current.length > 100) undoRef.current.shift();
  };
  const rotatePhoto = (delta: number) => {
    if (!loadedImageRef.current?.naturalWidth || !imageSrcRef.current || isDrawingRef.current) return;
    if (pendingTextPosRef.current) {
      onNotify(lang === 'en' ? 'Finish the text annotation before rotating.' : 'กรุณาบันทึกข้อความก่อนหมุนรูป', 'info');
      return;
    }
    remember();
    rotationRef.current = quarter(rotationRef.current + delta);
    drawActiveCanvases();
  };
  const undoEdit = () => {
    if (isDrawingRef.current) return;
    const last = undoRef.current.pop();
    if (!last) return;
    redoRef.current.push({rotation:rotationRef.current,shapes:shapesRef.current});
    rotationRef.current = last.rotation;
    shapesRef.current = last.shapes;
    setShapes(last.shapes);
    setPendingTextPos(null);
    setPendingTextValue('');
    drawActiveCanvases();
  };
  const redoEdit=()=>{
    if(isDrawingRef.current)return;
    const next=redoRef.current.pop();if(!next)return;
    undoRef.current.push({rotation:rotationRef.current,shapes:shapesRef.current});
    if(undoRef.current.length>100)undoRef.current.shift();
    rotationRef.current=next.rotation;shapesRef.current=next.shapes;
    setShapes(next.shapes);setPendingTextPos(null);setPendingTextValue('');
    drawActiveCanvases();
  };
  const focusEditor=(e:React.PointerEvent<HTMLDivElement>)=>{
    if((e.target as Element).closest('input,textarea,select,button,a,[contenteditable="true"]'))return;
    e.currentTarget.focus({preventScroll:true});
  };
  const editorKeys=(e:React.KeyboardEvent<HTMLDivElement>)=>{
    if(e.defaultPrevented||e.nativeEvent.isComposing||e.altKey||!imageSrcRef.current)return;
    if((e.target as Element).closest('input,textarea,select,[contenteditable="true"]'))return;
    const key=e.key.toLowerCase();
    if(e.ctrlKey||e.metaKey){
      if(key==='z'||key==='y'){e.preventDefault();e.stopPropagation();if(key==='y'||e.shiftKey)redoEdit();else undoEdit();}
      return;
    }
    if(e.shiftKey||e.repeat||pendingTextPosRef.current||isDrawingRef.current)return;
    const shortcuts:Record<string,MarkupTool>={p:'pen',c:'circle',a:'arrow',r:'rect',t:'text'};
    const next=shortcuts[key];
    if(next){e.preventDefault();e.stopPropagation();setTool(next);}
  };
  useEffect(()=>{if(isFullscreen)fullscreenRootRef.current?.focus({preventScroll:true});},[isFullscreen]);
  const clearMarks = () => {
    if (isDrawingRef.current) return;
    if (shapesRef.current.length) {
      remember();
      shapesRef.current = [];
      setShapes([]);
    }
    setPendingTextPos(null);
    setPendingTextValue('');
    drawActiveCanvases();
  };

  // Pure canvas size synchronizer (never calls setState)
  const syncDimensions = useCallback(() => {
    if (!imageSrcRef.current) return;

    const inlineCanvas = canvasRef.current;
    const inlineWrap = wrapRef.current;
    if (inlineCanvas && inlineWrap && inlineWrap.clientWidth > 0 && inlineWrap.clientHeight > 0) {
      const targetW = inlineWrap.clientWidth;
      const targetH = inlineWrap.clientHeight;
      if (inlineCanvas.width !== targetW) inlineCanvas.width = targetW;
      if (inlineCanvas.height !== targetH) inlineCanvas.height = targetH;
      paintCanvas(inlineCanvas);
    }

    if (isFullscreenRef.current) {
      const fsCanvas = fullscreenCanvasRef.current;
      const fsWrap = fullscreenWrapRef.current;
      if (fsCanvas && fsWrap && fsWrap.clientWidth > 0 && fsWrap.clientHeight > 0) {
        const targetW = fsWrap.clientWidth;
        const targetH = fsWrap.clientHeight;
        if (fsCanvas.width !== targetW) fsCanvas.width = targetW;
        if (fsCanvas.height !== targetH) fsCanvas.height = targetH;
        paintCanvas(fsCanvas);
      }
    }
  }, [paintCanvas]);

  // Load image ONLY when imageSrc actually changes; guard all state resets
  useEffect(() => {
    shapesRef.current = [];
    rotationRef.current = 0;
    undoRef.current = [];
    redoRef.current = [];
    loadedImageRef.current = null;
    currentShapeRef.current = null;
    isDrawingRef.current = false;
    setShapes((prev) => (prev.length === 0 ? prev : []));
    setPendingTextPos((prev) => (prev === null ? prev : null));
    setPendingTextValue((prev) => (prev === '' ? prev : ''));

    if (!imageSrc) {
      loadedImageRef.current = null;
      setIsFullscreen((prev) => (prev ? false : prev));
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || imageSrcRef.current !== imageSrc) return;
      loadedImageRef.current = img;
      syncDimensions();
    };
    img.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, syncDimensions]);

  // Redraw canvases whenever shapes state updates (pure canvas draw, no setState)
  useEffect(() => {
    shapesRef.current = shapes;
    drawActiveCanvases();
  }, [shapes, drawActiveCanvases]);

  // Sync dimensions after toggling fullscreen modal (DOM portal mount/unmount)
  useEffect(() => {
    if (!imageSrcRef.current) return;
    const rafId = window.requestAnimationFrame(() => {
      syncDimensions();
    });
    const fsWrap = fullscreenWrapRef.current;
    let observer: ResizeObserver | null = null;
    if (isFullscreen && fsWrap && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (imageSrcRef.current) syncDimensions();
      });
      observer.observe(fsWrap);
    }
    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [isFullscreen, syncDimensions]);

  // Resize listener (registered once, pure DOM/canvas operation)
  useEffect(() => {
    const onResize = () => {
      if (imageSrcRef.current) syncDimensions();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncDimensions]);

  // ESC key handler for fullscreen markup mode (uses refs, registered once)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isFullscreenRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (pendingTextPosRef.current) {
        setPendingTextPos(null);
        setPendingTextValue('');
      } else {
        isDrawingRef.current = false;
        currentShapeRef.current = null;
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Expose full natural-resolution offscreen export (zero preview downscaling, zero black bars)
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      exportDataUrl: () => {
        const src = imageSrcRef.current;
        if (!src) return null;
        if (shapesRef.current.length === 0 && rotationRef.current === 0) return src;

        const img = loadedImageRef.current;
        if (img && img.complete) {
          const rotation = rotationRef.current;
          const { w: outW, h: outH } = orientedSize(img.naturalWidth || img.width, img.naturalHeight || img.height, rotation);
          if (outW > 0 && outH > 0) {
            try {
              const offscreen = document.createElement('canvas');
              offscreen.width = outW;
              offscreen.height = outH;
              const ctx = offscreen.getContext('2d');
              if (ctx) {
                withQuarterTurn(ctx, outW, outH, rotation, (iw, ih) => ctx.drawImage(img, 0, 0, iw, ih));
                for (const shape of shapesRef.current) drawOrientedShape(ctx, shape, outW, outH, rotation);
                return offscreen.toDataURL('image/jpeg', 0.95);
              }
            } catch {
              // fallback to original src
            }
          }
        }
        return src;
      },
    };
  }, [editorRef]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 2560, 0.95);
      onImageChange(compressed);
    } catch {
      onNotify(
        imageUploadError(file,lang,lang === 'en' ? 'Failed to load image file' : 'ไม่สามารถอ่านไฟล์รูปภาพได้'),
        'danger'
      );
    }
  };

  // Maps pointer event to normalized coordinates [0..1] strictly inside the rendered image rect
  const getPos = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
    const img = loadedImageRef.current;
    if (!img || !img.complete) {
      return {
        nx: Math.max(0, Math.min(1, px / Math.max(1, canvas.width))),
        ny: Math.max(0, Math.min(1, py / Math.max(1, canvas.height))),
      };
    }
    const size = orientedSize(img.naturalWidth, img.naturalHeight, rotationRef.current);
    const { dx, dy, dw, dh } = getImageDrawRect(size.w, size.h, canvas.width, canvas.height);
    return {
      nx: Math.max(0, Math.min(1, (px - dx) / Math.max(1, dw))),
      ny: Math.max(0, Math.min(1, (py - dy) / Math.max(1, dh))),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    if (!canvas || !loadedImageRef.current?.naturalWidth) return;
    const { nx, ny } = getPos(e, canvas);

    if (tool === 'text') {
      setPendingTextPos({ x: nx, y: ny });
      setPendingTextValue('');
      return;
    }

    setPendingTextPos(null);
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentShapeRef.current = {
      orientation: rotationRef.current,
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
    const { nx, ny } = getPos(e, e.currentTarget);
    if (currentShapeRef.current.tool === 'pen') {
      currentShapeRef.current.points = [
        ...(currentShapeRef.current.points || []),
        { x: nx, y: ny },
      ];
    } else {
      currentShapeRef.current.x2 = nx;
      currentShapeRef.current.y2 = ny;
    }
    paintCanvas(e.currentTarget);
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
      remember();
      const next = [...shapesRef.current, s];
      shapesRef.current = next;
      setShapes(next);
    } else {
      drawActiveCanvases();
    }
  };

  const commitTextAnnotation = () => {
    const clean = pendingTextValue.trim();
    if (!pendingTextPos || !clean) {
      setPendingTextPos(null);
      setPendingTextValue('');
      return;
    }
    const newShape: OrientedShape = {
      orientation: rotationRef.current,
      tool: 'text',
      color,
      lineWidth,
      x1: pendingTextPos.x,
      y1: pendingTextPos.y,
      x2: pendingTextPos.x,
      y2: pendingTextPos.y,
      text: clean,
    };
    remember();
    const next = [...shapesRef.current, newShape];
    shapesRef.current = next;
    setShapes(next);
    setPendingTextPos(null);
    setPendingTextValue('');
  };

  const openFullscreen = () => {
    if (!imageSrcRef.current) return;
    setPendingTextPos(null);
    setIsFullscreen(true);
  };

  const closeFullscreen = () => {
    isDrawingRef.current = false;
    currentShapeRef.current = null;
    setPendingTextPos(null);
    setIsFullscreen(false);
  };

  const getFloatingPopupPercent = (
    canvas: HTMLCanvasElement | null,
    pos: { x: number; y: number }
  ) => {
    const img = loadedImageRef.current;
    if (!canvas || !img || !img.complete || canvas.width <= 0 || canvas.height <= 0) {
      return {
        left: Math.min(70, Math.max(4, pos.x * 100)),
        top: Math.min(82, Math.max(8, pos.y * 100)),
      };
    }
    const size = orientedSize(img.naturalWidth, img.naturalHeight, rotationRef.current);
    const { dx, dy, dw, dh } = getImageDrawRect(size.w, size.h, canvas.width, canvas.height);
    const leftPct = ((dx + pos.x * dw) / canvas.width) * 100;
    const topPct = ((dy + pos.y * dh) / canvas.height) * 100;
    return {
      left: Math.min(72, Math.max(4, leftPct)),
      top: Math.min(82, Math.max(6, topPct)),
    };
  };

  const rotationButtons = (dark = false) => imageSrc && ([[-1, RotateCcw, 'หมุนซ้าย 90°', 'Rotate left 90°'], [1, RotateCw, 'หมุนขวา 90°', 'Rotate right 90°']] as const).map(([delta, Icon, th, en]) => (
    <button key={delta} type="button" onClick={() => rotatePhoto(delta)} aria-label={lang === 'en' ? en : th} title={lang === 'en' ? en : th}
      className={'inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap '+(dark?'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700':'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')}>
      <Icon className="w-4 h-4" /><span>{lang === 'en' ? en : th}</span>
    </button>
  ));

  const tools: Array<{ id: MarkupTool; label: string; icon: React.ReactNode }> = [
    { id: 'pen', label: t.toolPen, icon: <Pen className="w-3.5 h-3.5" /> },
    { id: 'circle', label: t.toolCircle, icon: <Circle className="w-3.5 h-3.5" /> },
    { id: 'arrow', label: t.toolArrow, icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
    { id: 'rect', label: t.toolRect, icon: <Square className="w-3.5 h-3.5" /> },
    { id: 'text', label: t.toolText, icon: <TypeIcon className="w-3.5 h-3.5" /> },
  ];

  const inlinePopupCoords =
    pendingTextPos && imageSrc && !isFullscreen
      ? getFloatingPopupPercent(canvasRef.current, pendingTextPos)
      : null;

  const fullscreenPopupCoords =
    pendingTextPos && imageSrc && isFullscreen
      ? getFloatingPopupPercent(fullscreenCanvasRef.current, pendingTextPos)
      : null;

  return (
    <div ref={rootRef} tabIndex={0} onPointerDownCapture={focusEditor} onKeyDown={editorKeys} className="space-y-2.5 outline-none">
      {/* Inline Drawing Toolbar */}
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

        {/* Color, Stroke Width, Undo, Clear, Delete, Fullscreen */}
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
            <span className="text-xs">{lang==='en'?'Stroke':'ขนาดเส้น'}</span>
            <input type="range" min={1} max={15} step={0.5} value={lineWidth} onChange={e=>setLineWidth(Number(e.target.value))} aria-label={lang==='en'?'Stroke width':'ความหนาเส้น'} className="w-20 accent-blue-500"/>
            <span className="text-xs tabular-nums min-w-8">{lineWidth}</span>
          </div>

          {rotationButtons()}
          <button
            type="button"
            onClick={undoEdit}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer"
            title={t.undoTooltip+" (Ctrl+Z / Cmd+Z)"}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={redoEdit} className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label={lang==='en'?'Redo':'ทำซ้ำ'}><Redo2 className="w-3.5 h-3.5"/></button>
          <button
            type="button"
            onClick={clearMarks}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer"
            title={t.clearTooltip}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          {imageSrc && (
            <>
              <button
                type="button"
                onClick={() => {
                  onImageChange(null);
                  setShapes((prev) => (prev.length === 0 ? prev : []));
                  setPendingTextPos(null);
                }}
                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                title={t.deletePhotoTooltip}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={openFullscreen}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                title={t.fullscreenExpandTooltip}
              >
                {t.fullscreenMarkupBtn}
              </button>
            </>
          )}
        </div>
      </div>

      {tool === 'text' && imageSrc && !isFullscreen && (
        <div className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
          {t.textHint}
        </div>
      )}

      <p className="text-[10px] text-slate-500 hidden sm:block">{lang==='en'?'Click the editor first · Ctrl+Z Undo · Ctrl+Y Redo · P Pen · C Circle · A Arrow · R Rectangle · T Text':'คลิกกระดานก่อนใช้คีย์ลัด · Ctrl+Z ย้อนกลับ · Ctrl+Y ทำซ้ำ · P ปากกา · C วงกลม · A ลูกศร · R สี่เหลี่ยม · T ข้อความ'}</p>
      {/* Inline Canvas Container */}
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
          onPointerCancel={handlePointerUp}
          onDoubleClick={openFullscreen}
          className={`w-full h-full block touch-none ${
            tool === 'text' ? 'cursor-text' : 'cursor-crosshair'
          } ${imageSrc ? '' : 'hidden'}`}
        />

        {/* Top-right Expand Icon Button on Photo */}
        {imageSrc && (
          <button
            type="button"
            onClick={openFullscreen}
            title={t.fullscreenExpandTooltip}
            className="absolute top-2.5 right-2.5 z-20 p-2 rounded-lg bg-slate-900/75 hover:bg-slate-900 text-white border border-white/20 shadow-md backdrop-blur-xs cursor-pointer transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

        {/* Inline Floating Text Annotation Input */}
        {inlinePopupCoords && (
          <div
            style={{
              left: `${inlinePopupCoords.left}%`,
              top: `${inlinePopupCoords.top}%`,
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
                  e.stopPropagation();
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
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        )}
      </div>

      {/* Fullscreen Photo Markup Modal (Portal above all workspace modals) */}
      {isFullscreen &&
        imageSrc &&
        createPortal(
          <div
            ref={fullscreenRootRef} tabIndex={0} onPointerDownCapture={focusEditor} onKeyDown={editorKeys}
            onClick={(e) => e.stopPropagation()}
            className="outline-none fixed inset-0 z-[70] bg-slate-950/95 flex flex-col select-none"
            role="dialog"
            aria-modal="true"
          >
            {/* Synchronized Fullscreen Top Toolbar */}
            <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {tools.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTool(item.id);
                      setPendingTextPos(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                      tool === item.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Color Swatches + Color Picker */}
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
                  {COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setColor(sw)}
                      style={{ backgroundColor: sw }}
                      className={`w-5 h-5 rounded-full border cursor-pointer ${
                        color === sw
                          ? 'ring-2 ring-white border-slate-900 scale-110'
                          : 'border-slate-500'
                      }`}
                      title={sw}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-6 h-6 rounded border border-slate-600 bg-slate-800 cursor-pointer p-0"
                    title="Color"
                  />
                </div>

                {/* Stroke Sizes */}
                <div
                  className="flex items-center gap-1 pr-2 border-r border-slate-700"
                  title={t.sizeLabel}
                >
                  <span className="text-xs">{lang==='en'?'Stroke':'ขนาดเส้น'}</span>
            <input type="range" min={1} max={15} step={0.5} value={lineWidth} onChange={e=>setLineWidth(Number(e.target.value))} aria-label={lang==='en'?'Stroke width':'ความหนาเส้น'} className="w-20 accent-blue-500"/>
            <span className="text-xs tabular-nums min-w-8">{lineWidth}</span>
                </div>

                {/* Rotation, Undo & Clear */}
                {rotationButtons(true)}
                <button
                  type="button"
                  onClick={undoEdit}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                  title={t.undoTooltip+" (Ctrl+Z / Cmd+Z)"}
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={redoEdit} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label={lang==='en'?'Redo':'ทำซ้ำ'}><Redo2 className="w-4 h-4"/></button>
                <button
                  type="button"
                  onClick={clearMarks}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                  title={t.clearTooltip}
                >
                  <Eraser className="w-4 h-4" />
                </button>

                {/* Done Button */}
                <button
                  type="button"
                  onClick={closeFullscreen}
                  className="ml-1 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-md transition-colors"
                >
                  <span>{t.fullscreenDoneBtn}</span>
                </button>
              </div>
            </div>

            {tool === 'text' && (
              <div className="bg-blue-950/90 border-b border-blue-800/70 text-blue-200 text-xs font-semibold px-4 py-1.5 text-center shrink-0">
                {t.textHint}
              </div>
            )}

            {/* Large Fullscreen Drawing Stage */}
            <div className="flex-1 min-h-0 p-2 sm:p-5 flex items-center justify-center overflow-hidden">
              <div
                ref={fullscreenWrapRef}
                className="relative w-full h-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800"
              >
                <canvas
                  ref={fullscreenCanvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`w-full h-full block touch-none ${
                    tool === 'text' ? 'cursor-text' : 'cursor-crosshair'
                  }`}
                />

                {/* Fullscreen Floating Text Annotation Input */}
                {fullscreenPopupCoords && (
                  <div
                    style={{
                      left: `${fullscreenPopupCoords.left}%`,
                      top: `${fullscreenPopupCoords.top}%`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute z-30 bg-white rounded-xl shadow-2xl border border-slate-300 p-2.5 flex items-center gap-2 min-w-[230px]"
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
                          e.stopPropagation();
                          setPendingTextPos(null);
                        }
                      }}
                      placeholder={t.textPlaceholder}
                      className="flex-1 px-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={commitTextAnnotation}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {t.textSaveBtn}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Keyboard / Gesture Hint */}
            <div className="py-1.5 px-4 bg-slate-900/90 border-t border-slate-800 text-center text-[11px] text-slate-400 shrink-0">
              {t.fullscreenHint}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
