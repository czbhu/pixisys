import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Button, Space, Tooltip, Select, InputNumber, Popover, Divider, Popconfirm,
  Upload, message, Slider, Typography, Switch, Modal, Input, Segmented, Badge,
} from 'antd';
import {
  UndoOutlined, RedoOutlined, DeleteOutlined, BoldOutlined,
  ItalicOutlined, FontSizeOutlined, BgColorsOutlined, PictureOutlined,
  AlignLeftOutlined, AlignCenterOutlined,
  AlignRightOutlined, CopyOutlined, VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined, BorderOutlined, LeftOutlined,
  RightOutlined, LoadingOutlined, ZoomInOutlined, ZoomOutOutlined,
  FullscreenOutlined, LockOutlined, UnlockOutlined, CompressOutlined, ExpandOutlined, EyeOutlined, FilePdfOutlined,
  CommentOutlined, EditOutlined, HighlightOutlined, CheckOutlined, CloseOutlined,
  ArrowRightOutlined, PlusOutlined, AppstoreOutlined, BlockOutlined, DisconnectOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import CanvasRuler from './CanvasRuler';
import TemplatePicker from './TemplatePicker';
import api from '../../../services/api';

// Fabric.js import
import { fabric } from 'fabric';

// pdfjs types
declare module 'pdfjs-dist' {
  interface RenderParameters { canvasContext: CanvasRenderingContext2D; viewport: any; canvas?: HTMLCanvasElement; }
}

const { Text } = Typography;
const { Option } = Select;

// Google Fonts lista (leggyakoribbak)
const GOOGLE_FONTS = [
  // Sans-serif
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway',
  'Oswald', 'Poppins', 'Ubuntu', 'Nunito', 'Inter',
  'Barlow', 'Barlow Condensed', 'Fira Sans', 'Work Sans', 'Mulish',
  'Josefin Sans', 'Quicksand', 'Rubik', 'Cabin', 'Karla',
  'Oxygen', 'Overpass', 'DM Sans', 'Manrope', 'Space Grotesk',
  'Plus Jakarta Sans', 'Exo 2', 'Figtree', 'Libre Franklin',
  // Serif
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif',
  'Libre Baskerville', 'EB Garamond', 'Bitter', 'Vollkorn',
  'Zilla Slab', 'Spectral', 'Cormorant Garamond', 'Crimson Text',
  'Source Serif 4',
  // Display / decorative
  'Bebas Neue', 'Anton', 'Dancing Script', 'Pacifico', 'Lobster',
  // Monospace
  'PT Mono', 'Fira Code', 'JetBrains Mono', 'Inconsolata', 'Courier New',
  // System
  'Arial', 'Georgia', 'Times New Roman',
];

const SYSTEM_FONTS = new Set(['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'PT Mono']);

/**
 * Canvas-based runtime test: does the font actually have ő ű Ő Ű glyphs?
 * If the font lacks them the browser falls back — measureText width equals the fallback's width.
 */
function checkFontHasHU(fontName: string): boolean {
  const TEST = '\u0151\u0171\u0150\u0170'; // ő ű Ő Ű
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.font = '48px serif';
    const serifW = ctx.measureText(TEST).width;
    ctx.font = `48px "${fontName}", serif`;
    if (ctx.measureText(TEST).width !== serifW) return true;
    ctx.font = '48px monospace';
    const monoW = ctx.measureText(TEST).width;
    ctx.font = `48px "${fontName}", monospace`;
    return ctx.measureText(TEST).width !== monoW;
  } catch { return false; }
}

// 1mm hány px legyen a canvason (96 DPI)
const MM_TO_PX = 3.7795;
const BLEED_MM = 3;
const RULER_SIZE = 20;  // px
const SNAP_THRESHOLD_PX = 6;  // px távolságon belül snap
const GUIDE_COLOR = '#1890ff';
const GUIDE_HIT_PX = 6;  // px-en belül kattintásra kijelöli/törli
const FOLD_COLOR = '#fa8c16';

export interface CanvasEditorHandle {
  getDesignJson: () => { d1: any; d2: any } | null;
}

interface Guide {
  id: number;
  axis: 'x' | 'y';  // x = függőleges vonal, y = vízszintes vonal
  mm: number;
}

interface FoldLine {
  id: number;
  axis: 'x' | 'y';
  mm: number;
  label: string;
}

interface PdfDialogState {
  pdfData: ArrayBuffer;   // raw binary, pdfjs v5 igényli
  pageCount: number;
  widthMm: number;
  heightMm: number;
  thumbs: string[];
  thumbsLoading: boolean;
  selectedPage: number;
  mode: 'full' | 'single' | 'layered' | 'svg';
  svgFile?: File;  // eredeti fájl, szerver-oldali SVG konverzióhoz
}

// ── Comment annotation types ──
type EditorMode = 'design' | 'comment';
type CommentTool = 'area' | 'pin' | 'arrow';
interface CommentAnnotation {
  id: string;
  side: Side;
  type: 'area' | 'pin' | 'arrow';
  // Position in canvas-native coords (before zoom)
  x: number; y: number;
  width?: number; height?: number;
  x2?: number; y2?: number;    // Arrow endpoint
  pathData?: string;           // SVG path for freehand drawings
  text: string;
  author: string;
  timestamp: number;
  resolved: boolean;
  color: string;               // annotation border/pin color
}

const COMMENT_COLORS = ['#ff4d4f', '#fa8c16', '#52c41a', '#1890ff', '#722ed1'];
const COMMENT_AREA_FILL = 'rgba(255,77,79,0.12)';
const COMMENT_AREA_STROKE = '#ff4d4f';
const COMMENT_PIN_RADIUS = 10;

interface Props {
  params: PrintParams;
  isAdmin: boolean;
  priceBreakdown: any;
  leftOffset?: number;
  locked?: boolean;
  onParamsChange?: (p: PrintParams) => void;
  initialDesign?: { d1: any; d2: any; sheets?: Array<{ d1: any; d2: any }> } | null;
  onDesignChange?: (d1: any, d2: any, sheets?: Array<{ d1: any; d2: any }>) => void;
  templateCategoryIds?: number[];
}

type Side = '1' | '2';

const Step2CanvasEditor = forwardRef<CanvasEditorHandle, Props>((
  { params, isAdmin, priceBreakdown, leftOffset = 0, locked = false, onParamsChange, initialDesign, onDesignChange, templateCategoryIds }, ref
) => {
  const canvasRef1 = useRef<HTMLCanvasElement>(null as unknown as HTMLCanvasElement);
  const canvasRef2 = useRef<HTMLCanvasElement>(null as unknown as HTMLCanvasElement);
  const fabricRef1 = useRef<fabric.Canvas | null>(null);
  const fabricRef2 = useRef<fabric.Canvas | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const initGenRef = useRef(0); // incremented on each canvas reinit to cancel stale async callbacks
  const [activeSide, setActiveSide] = useState<Side>('1');
  const [history1, setHistory1] = useState<string[]>([]);
  const [history2, setHistory2] = useState<string[]>([]);
  const [histIdx1, setHistIdx1] = useState(-1);
  const [histIdx2, setHistIdx2] = useState(-1);
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [, forceToolbarUpdate] = useState(0);  // tick to re-render toolbar after prop changes
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set(['Arial']));
  const [huFonts, setHuFonts] = useState<Set<string>>(new Set<string>());
  const [uploadingFile, setUploadingFile] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const lastLayerClickRef = useRef<number>(-1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageDpi, setImageDpi] = useState<number | null>(null);
  const [pdfDialog, setPdfDialog] = useState<PdfDialogState | null>(null);
  const [pdfDialogWorking, setPdfDialogWorking] = useState(false);
  const pendingPdfPagesRef = useRef<string[]>([]);
  const restoredSidesRef = useRef<Set<Side>>(new Set());
  const sidesFullyRestoredRef = useRef<Set<Side>>(new Set());  // tracks async enliven completion
  const savedCanvasDataRef = useRef<{ d1: any[] | null; d2: any[] | null }>({ d1: null, d2: null });
  const suppressNotifyRef = useRef(0); // counter: >0 means suppress notifyDesignChange during sheet load
  const onDesignChangeRef = useRef(onDesignChange);
  useEffect(() => { onDesignChangeRef.current = onDesignChange; }, [onDesignChange]);

  // ── Multi-sheet support ──────────────────────────────────────────────────
  const sheetCount = params.sheet_count ?? 1;
  const sheetCountRef = useRef(sheetCount);
  useEffect(() => { sheetCountRef.current = sheetCount; }, [sheetCount]);
  const [activeSheet, setActiveSheet] = useState(0);
  const activeSheetRef = useRef(0); // always-current sheet index (sync, no stale closure)
  // Store canvas JSON per sheet: { [sheetIdx]: { d1: json, d2: json } }
  // Initialize from saved sheets data (survives page refresh)
  const sheetDesignsRef = useRef<Record<number, { d1: any; d2: any }>>((() => {
    const sheets = initialDesign?.sheets;
    if (!sheets || sheets.length === 0) return {};
    const map: Record<number, { d1: any; d2: any }> = {};
    sheets.forEach((s, i) => {
      // Sheet 0 canvas content is also loaded via initialDesign.d1/d2 in initCanvas,
      // but we still store it here so notifyDesignChange can access it when active sheet != 0
      if (s.d1 || s.d2) map[i] = { d1: s.d1 ?? null, d2: s.d2 ?? null };
    });
    return map;
  })());

  const saveCurrentSheetDesign = useCallback(() => {
    const fc1 = fabricRef1.current;
    const fc2 = fabricRef2.current;
    if (!fc1) return;
    const getObjsJson = (fc: fabric.Canvas) => {
      const objs = fc.getObjects().filter((o: any) => !o.__guideHelper).map(o => o.toObject(['id', 'name', '__locked']));
      return objs.length > 0 ? { objects: objs } : null;
    };
    sheetDesignsRef.current[activeSheetRef.current] = {
      d1: getObjsJson(fc1),
      d2: fc2 ? getObjsJson(fc2) : null,
    };
  }, []);

  const loadSheetDesign = useCallback((sheetIdx: number) => {
    const data = sheetDesignsRef.current[sheetIdx];
    const fc1 = fabricRef1.current;
    const fc2 = fabricRef2.current;
    if (!fc1) return;

    const loadObjects = (fc: fabric.Canvas, json: any) => {
      // Remove only user objects (keep guides, background, etc.)
      suppressNotifyRef.current++;
      fc.getObjects().filter((o: any) => !o.__guideHelper).forEach(o => fc.remove(o));
      if (!json) { suppressNotifyRef.current--; fc.renderAll(); return; }
      // Support both full JSON { objects: [...], ... } and objects-only { objects: [...] }
      const objData = (json.objects ?? []).filter((o: any) => !o.__guideHelper);
      if (objData.length === 0) { suppressNotifyRef.current--; fc.renderAll(); return; }
      fabric.util.enlivenObjects(objData, (enlivened: fabric.Object[]) => {
        enlivened.forEach((obj: fabric.Object) => fc.add(obj));
        suppressNotifyRef.current--;
        fc.renderAll();
      }, 'fabric' as any);
    };

    loadObjects(fc1, data?.d1);
    if (fc2) loadObjects(fc2, data?.d2);
  }, []);

  const handleSheetChange = useCallback((newSheet: number) => {
    if (newSheet === activeSheetRef.current) return;
    saveCurrentSheetDesign();
    activeSheetRef.current = newSheet;
    setActiveSheet(newSheet);
    loadSheetDesign(newSheet);
    setActiveSide('1');
  }, [saveCurrentSheetDesign, loadSheetDesign]);

  // Refs for keyboard shortcuts — always point to the latest undo/redo/delete functions
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const deleteSelectedRef = useRef<() => void>(() => {});
  const saveHistoryRef = useRef<(side: Side) => void>(() => {});
  const dragStartPosRef = useRef<{ left: number; top: number } | null>(null);

  // Refs for auto-nyomatlan: remember the previous (non-none) mode so we can restore on content add
  const prevSide1ModeRef = useRef<string>(params.side1_mode !== 'none' ? params.side1_mode : 'color');
  const prevSide2ModeRef = useRef<string>(params.side2_mode !== 'none' ? params.side2_mode : 'color');

  // On mount: check system fonts immediately, then pre-load + test all Google Fonts in background
  useEffect(() => {
    const addHU = (f: string) => setHuFonts(prev => { const s = new Set(prev); s.add(f); return s; });
    // System fonts are always available
    SYSTEM_FONTS.forEach(f => { if (checkFontHasHU(f)) addHU(f); });
    // Pre-load every Google Font in background so the HU badge populates before user opens the dropdown
    GOOGLE_FONTS.forEach(f => {
      if (SYSTEM_FONTS.has(f)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400&display=swap`;
      document.head.appendChild(link);
      document.fonts.load(`400 48px "${f}"`).then(() => {
        setLoadedFonts(prev => new Set([...Array.from(prev), f]));
        if (checkFontHasHU(f)) addHU(f);
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [layerDrawerOpen, setLayerDrawerOpen] = useState(false);
  const [objects1, setObjects1] = useState<fabric.Object[]>([]);
  const [objects2, setObjects2] = useState<fabric.Object[]>([]);

  // ── Comment mode state ──
  const [editorMode, setEditorMode] = useState<EditorMode>('design');
  const [commentAnnotations, setCommentAnnotations] = useState<CommentAnnotation[]>([]);
  const [commentLayerVisible, setCommentLayerVisible] = useState(true);
  const [commentTool, setCommentTool] = useState<CommentTool>('area');
  const [commentColor, setCommentColor] = useState(COMMENT_COLORS[0]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentTextDraft, setCommentTextDraft] = useState('');
  const [newCommentDraft, setNewCommentDraft] = useState<CommentAnnotation | null>(null);
  const commentDrawStartRef = useRef<{ x: number; y: number } | null>(null);
  const commentNextId = useRef(1);

  // Tool panel collapse
  const [toolPanelOpen, setToolPanelOpen] = useState(true);

  // Guides + snap state
  const [guides, setGuides] = useState<Guide[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);       // vonalak/fogók
  const [snapEdgesEnabled, setSnapEdgesEnabled] = useState(true); // lapszegély + vágásvonal
  const [cursorMm, setCursorMm] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [objPosMm, setObjPosMm] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [newGuideMm, setNewGuideMm] = useState<number>(50);
  const [newGuideAxis, setNewGuideAxis] = useState<'x' | 'y'>('x');
  const [foldLines, setFoldLines] = useState<FoldLine[]>([]);
  const [newFoldAxis, setNewFoldAxis] = useState<'x' | 'y'>('x');
  const [newFoldMm, setNewFoldMm] = useState<number>(50);
  const [draggingItem, setDraggingItem] = useState<{ id: number; axis: 'x' | 'y'; type: 'guide' | 'fold' } | null>(null);
  const guidesRef = useRef<Guide[]>([]);
  const foldLinesRef = useRef<FoldLine[]>([]);
  const snapRef = useRef(true);
  const snapEdgesRef = useRef(true);
  const nextGuideId = useRef(1);
  const nextFoldId = useRef(1);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);   // 1 = fit-to-screen
  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;

  // Measure the actual canvas area container with ResizeObserver
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas méret számítás — konfár: oldálváltó (~40px) + legend (~28px) + padding (32px) + ruler
  const CHROME_H = (params.sides === '2' ? 40 : 0) + 28 + 32 + RULER_SIZE;
  const CHROME_W = RULER_SIZE + 32; // padding + ruler
  const availW = containerSize.w > 0 ? containerSize.w - CHROME_W : window.innerWidth - (leftOffset + 220 + 48) - CHROME_W;
  const availH = containerSize.h > 0 ? containerSize.h - CHROME_H : window.innerHeight - 140 - CHROME_H;
  const bleedPx = BLEED_MM * MM_TO_PX;
  const widthMmN = Number(params.width_mm) || 148;
  const heightMmN = Number(params.height_mm) || 210;
  const sheetW_mm = widthMmN + 2 * BLEED_MM;
  const sheetH_mm = heightMmN + 2 * BLEED_MM;
  const canvasW = sheetW_mm * MM_TO_PX;   // sheet = product + 2×bleed
  const canvasH = sheetH_mm * MM_TO_PX;
  const cutW = widthMmN * MM_TO_PX; // cut/product area
  const cutH = heightMmN * MM_TO_PX;
  // baseScale = fit the canvas to the container at zoom=1
  const baseScale = Math.min(
    availW > 0 ? availW / canvasW : 1,
    availH > 0 ? availH / canvasH : 1,
  );
  const scale = baseScale * zoomLevel;   // effective display scale
  const displayW = Math.round(canvasW * scale);
  const displayH = Math.round(canvasH * scale);
  const displayScale = scale * MM_TO_PX;   // display pixels per mm

  const zoomIn  = () => setZoomLevel(z => Math.min(+(z + ZOOM_STEP).toFixed(2), ZOOM_MAX));
  const zoomOut = () => setZoomLevel(z => Math.max(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN));
  const zoomFit = () => setZoomLevel(1);

  const getActiveFabric = () => activeSide === '1' ? fabricRef1.current : fabricRef2.current;

  // Sync refs
  useEffect(() => { guidesRef.current = guides; }, [guides]);
  useEffect(() => { foldLinesRef.current = foldLines; }, [foldLines]);
  useEffect(() => { snapRef.current = snapEnabled; }, [snapEnabled]);
  useEffect(() => { snapEdgesRef.current = snapEdgesEnabled; }, [snapEdgesEnabled]);

  // Ctrl+scroll zoom — non-passive so preventDefault() works (browser won't zoom the page)
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  // Keyboard shortcuts: Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo, Delete/Backspace = delete selected
  const editorModeRef = useRef(editorMode);
  useEffect(() => { editorModeRef.current = editorMode; }, [editorMode]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip in comment mode — design shortcuts should not fire
      if (editorModeRef.current === 'comment') return;
      // Don't intercept when typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      // Also skip when actively editing a fabric IText (keyboard needed for typing)
      const fc = (activeSide === '1' ? fabricRef1 : fabricRef2).current;
      if (fc) {
        const active = fc.getActiveObject();
        if (active && (active.type === 'i-text' || active.type === 'textbox') && (active as any).isEditing) return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undoRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redoRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redoRef.current();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeSide]);

  // Frissíti a Fabric zoom-ot és canvas méretét, ha a skála megváltozik (zoom / container resize)
  // A canvas fizikailag displayW × displayH méretű → nincs CSS upscale → éles kép
  useEffect(() => {
    [fabricRef1, fabricRef2].forEach(fRef => {
      const fc = fRef.current;
      if (!fc) return;
      fc.setZoom(scale);
      fc.setDimensions({ width: displayW, height: displayH });
      fc.requestRenderAll();
    });
  }, [scale, displayW, displayH]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle fabric interactivity based on editor mode
  useEffect(() => {
    [fabricRef1, fabricRef2].forEach(fRef => {
      const fc = fRef.current;
      if (!fc) return;
      if (editorMode === 'comment') {
        fc.selection = false;
        fc.discardActiveObject();
        fc.forEachObject(o => { o.selectable = false; o.evented = false; });
        fc.requestRenderAll();
      } else {
        fc.selection = true;
        fc.forEachObject(o => {
          if ((o as any).__guideHelper) return;
          o.selectable = true; o.evented = true;
        });
        fc.requestRenderAll();
      }
    });
  }, [editorMode]);

  // Expose getDesignJson via ref
  useImperativeHandle(ref, () => ({
    getDesignJson: () => {
      const fc1 = fabricRef1.current;
      if (!fc1) return null;
      const getCleanJson = (fc: fabric.Canvas) => {
        const json = fc.toJSON(['id', 'name', '__locked']) as any;
        json.objects = (json.objects as any[]).filter((o: any) => !o.__guideHelper);
        return json;
      };
      // Save current sheet first
      if (sheetCount > 1) {
        saveCurrentSheetDesign();
        const sheets: Array<{ d1: any; d2: any }> = [];
        for (let i = 0; i < sheetCount; i++) {
          if (i === activeSheet) {
            sheets.push({ d1: getCleanJson(fc1), d2: fabricRef2.current ? getCleanJson(fabricRef2.current) : null });
          } else {
            sheets.push(sheetDesignsRef.current[i] ?? { d1: null, d2: null });
          }
        }
        return { d1: getCleanJson(fc1), d2: fabricRef2.current ? getCleanJson(fabricRef2.current) : null, sheets };
      }
      return {
        d1: getCleanJson(fc1),
        d2: fabricRef2.current ? getCleanJson(fabricRef2.current) : null,
      };
    },
  }));

  // History helpers
  const saveHistory = useCallback((side: Side) => {
    const fc = side === '1' ? fabricRef1.current : fabricRef2.current;
    if (!fc) return;
    const json = JSON.stringify(fc.toJSON(['id', 'name', '__locked']));
    if (side === '1') {
      setHistory1(prev => {
        const newH = [...prev.slice(0, histIdx1 + 1), json];
        setHistIdx1(newH.length - 1);
        return newH;
      });
    } else {
      setHistory2(prev => {
        const newH = [...prev.slice(0, histIdx2 + 1), json];
        setHistIdx2(newH.length - 1);
        return newH;
      });
    }
  }, [histIdx1, histIdx2]);
  saveHistoryRef.current = saveHistory;

  const updateObjects = (side: Side) => {
    const fc = side === '1' ? fabricRef1.current : fabricRef2.current;
    if (!fc) return;
      const objs = fc.getObjects().filter((o: fabric.Object) => !(o as any).__guideHelper);
    if (side === '1') setObjects1([...objs]);
    else setObjects2([...objs]);
  };

  // ---- PDF helpers ----
  const getPdfJs = async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;
    return pdfjs;
  };

  // Nyers bináris adatból nyít PDF dokumentumot (pdfjs v5: Uint8Array kötelező)
  const openPdf = async (pdfjs: any, data: ArrayBuffer) =>
    pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;

  const renderPageToDataUrl = async (pdf: any, pageNum: number, renderScale?: number): Promise<string> => {
    const dpr = window.devicePixelRatio || 1;
    const rs = renderScale ?? Math.max(2, dpr * 1.5);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: rs });
    const c = document.createElement('canvas');
    c.width = viewport.width;
    c.height = viewport.height;
    const ctx2d = c.getContext('2d')!;
    if (ctx2d) ctx2d.imageSmoothingQuality = 'high';
    await page.render({ canvasContext: ctx2d, viewport } as any).promise;
    return c.toDataURL('image/png');
  };

  // --- SVG mód: szerver-oldali pdftocairo konverzió ---
  const placePdfPageSvg = async (file: File, page: number) => {
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('page', String(page));

    const resp = await api.post('printshop/pdf-to-svg/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const { svg } = resp.data as { svg: string };

    const fc = getActiveFabric();
    if (!fc) return;

    // Encode SVG as base64 data URL so it survives canvas serialization/localStorage
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

    await new Promise<void>((resolve, reject) => {
      fabric.Image.fromURL(dataUrl, (img) => {
        if (!img) { reject(new Error('SVG betöltési hiba')); return; }
        const iw = img.width ?? cutW;
        const ih = img.height ?? cutH;
        const ratio = Math.min(cutW / iw, cutH / ih);
        img.scale(ratio);
        img.set({
          left: bleedPx + (cutW - iw * ratio) / 2,
          top:  bleedPx + (cutH - ih * ratio) / 2,
        });
        (img as any).name = `PDF ${page}. oldal (SVG)`;
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
        saveHistory(activeSide);
        setUploadingFile(false);
        resolve();
      });
    });
  };

  // Render page → graphics raster (text regions erased) + individual Fabric text objects
  const placePdfPageLayered = async (pdf: any, pageNum: number) => {
    const renderScale = Math.max(2, (window.devicePixelRatio || 1) * 1.5);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    // Extract text items
    const textContent = await page.getTextContent();
    const textItems = (textContent.items as any[]).filter(
      (item: any) => 'str' in item && item.str.trim()
    );

    // Render full raster then cut out text regions
    const offCanvas = document.createElement('canvas');
    offCanvas.width = viewport.width;
    offCanvas.height = viewport.height;
    const ctx = offCanvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport } as any).promise;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (const item of textItems) {
      const [vx, vy] = viewport.convertToViewportPoint(
        item.transform[4], item.transform[5]
      );
      const fontH = Math.abs(item.transform[3]) * renderScale;
      const textW  = item.width * renderScale;
      ctx.fillRect(vx - 3, vy - fontH * 1.35, textW + 6, fontH * 1.8);
    }
    ctx.globalCompositeOperation = 'source-over';
    const bgDataUrl = offCanvas.toDataURL('image/png');

    const fc = getActiveFabric();
    if (!fc) return;

    const ratio    = Math.min(cutW / viewport.width, cutH / viewport.height);
    const imgLeft  = bleedPx + (cutW - viewport.width  * ratio) / 2;
    const imgTop   = bleedPx + (cutH - viewport.height * ratio) / 2;

    // 1. Place graphics background
    await new Promise<void>(resolve => {
      fabric.Image.fromURL(bgDataUrl, (bgImg: fabric.Image) => {
        bgImg.scale(ratio);
        bgImg.set({ left: imgLeft, top: imgTop });
        (bgImg as any).name = `PDF ${pageNum}. oldal (grafika)`;
        fc.add(bgImg);
        fc.sendToBack(bgImg);
        resolve();
      });
    });

    // 2. Place each text item as an independent Fabric Textbox
    for (const item of textItems) {
      const [vx, vy] = viewport.convertToViewportPoint(
        item.transform[4], item.transform[5]
      );
      // Font size: horizontal scale magnitude (user-space) × renderScale → raster px → fabric px
      const fontSizeFabric = Math.max(
        6,
        Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) * renderScale * ratio
      );
      // Rotation angle (clockwise degrees for Fabric)
      const angle = -Math.atan2(item.transform[1], item.transform[0]) * (180 / Math.PI);
      // Baseline → fabric coords, then shift up by cap-height (~0.85 em)
      const fabricX = imgLeft + vx * ratio;
      const fabricY = imgTop  + vy * ratio - fontSizeFabric * 0.85;
      const textW   = Math.max(item.width * renderScale * ratio + 8, fontSizeFabric * 1.5);

      const textObj = new fabric.Textbox(item.str, {
        left: fabricX,
        top:  fabricY,
        fontSize:    fontSizeFabric,
        fontFamily:  'Arial',
        fill:        '#000000',
        angle,
        width:       textW,
        splitByGrapheme: false,
      });
      (textObj as any).name = item.str.substring(0, 40);
      fc.add(textObj);
    }

    fc.renderAll();
    saveHistory(activeSide);
    setUploadingFile(false);
  };

  const placeImageOnFabric = (imgDataUrl: string, label: string) => {
    fabric.Image.fromURL(imgDataUrl, (img: fabric.Image) => {
      const fc = getActiveFabric();
      if (!fc) return;
      const ratio = Math.min(cutW / (img.width ?? cutW), cutH / (img.height ?? cutH));
      img.scale(ratio);
      img.set({ left: bleedPx + (cutW - (img.width ?? 0) * ratio) / 2, top: bleedPx + (cutH - (img.height ?? 0) * ratio) / 2 });
      (img as any).name = label;
      fc.add(img);
      fc.setActiveObject(img);
      fc.renderAll();
      saveHistory(activeSide);
      setUploadingFile(false);
    });
  };

  /** Decompose a PDF into separate vector / image / text elements */
  const placePdfDecomposed = async (file: File, pageNum = 1) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('page', String(pageNum));

      const resp = await api.post('printshop/pdf-decompose/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { page_width_pt, page_height_pt, trimbox_pt, elements } = resp.data as {
        page_width_pt: number;
        page_height_pt: number;
        trimbox_pt: { x: number; y: number; w: number; h: number } | null;
        elements: Array<{
          type: 'image' | 'vector' | 'text';
          data_url?: string;
          svg?: string;
          text?: string;
          x_pt: number;
          y_pt: number;
          width_pt?: number;
          height_pt?: number;
          font_size_pt?: number;
          font_name?: string;
          is_bold?: boolean;
          is_italic?: boolean;
          color?: string;
          bbox?: number[];
        }>;
      };

      const fc = getActiveFabric();
      if (!fc) return;

      // Scale & offset: align template to canvas cut area
      let scale: number;
      let offX: number;
      let offY: number;

      if (trimbox_pt) {
        // Template has TrimBox → scale TrimBox to fit cut area, align TrimBox to canvas trim
        scale = Math.min(cutW / trimbox_pt.w, cutH / trimbox_pt.h);
        offX = bleedPx - trimbox_pt.x * scale;
        offY = bleedPx - trimbox_pt.y * scale;
      } else {
        // No TrimBox → center entire page on cut area
        const scaleX = cutW / page_width_pt;
        const scaleY = cutH / page_height_pt;
        scale = Math.min(scaleX, scaleY);
        offX = bleedPx + (cutW - page_width_pt * scale) / 2;
        offY = bleedPx + (cutH - page_height_pt * scale) / 2;
      }

      const fabricObjects: fabric.Object[] = [];

      for (const el of elements) {
        if (el.type === 'image' && el.data_url) {
          await new Promise<void>((resolve) => {
            fabric.Image.fromURL(el.data_url!, (img) => {
              if (!img) { resolve(); return; }
              const imgW = el.width_pt! * scale;
              const imgH = el.height_pt! * scale;
              img.set({
                left: el.x_pt * scale,
                top: el.y_pt * scale,
                scaleX: imgW / (img.width || 1),
                scaleY: imgH / (img.height || 1),
              });
              (img as any).name = 'Kép';
              fabricObjects.push(img);
              resolve();
            });
          });
        } else if (el.type === 'vector' && el.svg) {
          await new Promise<void>((resolve) => {
            fabric.loadSVGFromString(el.svg!, (objects, options) => {
              if (!objects || objects.length === 0) { resolve(); return; }
              const svgGroup = fabric.util.groupSVGElements(objects, options);
              const targetW = el.width_pt! * scale;
              const targetH = el.height_pt! * scale;
              svgGroup.set({
                left: el.x_pt * scale,
                top: el.y_pt * scale,
                scaleX: targetW / (svgGroup.width || 1),
                scaleY: targetH / (svgGroup.height || 1),
              });
              (svgGroup as any).name = 'Vektor';
              fabricObjects.push(svgGroup);
              resolve();
            });
          });
        } else if (el.type === 'text' && el.text) {
          const fontSize = (el.font_size_pt || 12) * scale;
          const textObj = new fabric.Textbox(el.text, {
            left: el.x_pt * scale,
            top: el.y_pt * scale - fontSize * 0.85,
            fontSize,
            fontFamily: el.font_name || 'Arial',
            fontWeight: el.is_bold ? 'bold' : 'normal',
            fontStyle: el.is_italic ? 'italic' : 'normal',
            fill: el.color || '#000000',
            width: el.bbox
              ? (el.bbox[2] - el.bbox[0]) * scale + 4
              : fontSize * el.text.length * 0.6,
            splitByGrapheme: false,
          });
          (textObj as any).name = el.text.substring(0, 40);
          fabricObjects.push(textObj);
        }
      }

      if (fabricObjects.length > 0) {
        // Create group — children have positions relative to PDF origin (0,0)
        // Shift entire group so PDF origin maps to (offX, offY) on canvas
        const group = new fabric.Group(fabricObjects);
        group.set({
          left: (group.left ?? 0) + offX,
          top: (group.top ?? 0) + offY,
        });
        group.setCoords();
        // Lock template by default — movable/resizable disabled, but text still editable after ungroup
        group.set({
          lockMovementX: true,
          lockMovementY: true,
          lockRotation: true,
          lockScalingX: true,
          lockScalingY: true,
          hasControls: false,
        });
        (group as any).name = file.name?.replace(/\.pdf$/i, '') || 'Sablon';
        (group as any).__locked = true;
        fc.add(group);
        fc.setActiveObject(group);
      }

      fc.renderAll();
      saveHistory(activeSide);
    } catch (err: any) {
      message.error('Sablon betöltés hiba: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUploadingFile(false);
    }
  };

  const analyzePdf = async (file: File) => {
    try {
      const pdfData = await file.arrayBuffer();
      const pdfjs = await getPdfJs();
      const pdf = await openPdf(pdfjs, pdfData);
      const pageCount = pdf.numPages;
      const page1 = await pdf.getPage(1);
      const vp1 = page1.getViewport({ scale: 1 });
      // pdfjs pt → mm
      const widthMm  = parseFloat((vp1.width  * 25.4 / 72).toFixed(1));
      const heightMm = parseFloat((vp1.height * 25.4 / 72).toFixed(1));

      const dimMatch =
        Math.abs(widthMm  - widthMmN)  < 2 &&
        Math.abs(heightMm - heightMmN) < 2;
      const pagesMatch = pageCount <= parseInt(params.sides);

      if (dimMatch && pagesMatch) {
        // Közvetlen betöltés, nincs kérdés
        const imgUrl = await renderPageToDataUrl(pdf, 1);
        placeImageOnFabric(imgUrl, 'PDF oldal');
        return;
      }

      // Kérdés kell — thumb generálás: első oldal azonnal, többi async
      const thumb1 = await renderPageToDataUrl(pdf, 1, 0.25);
      setPdfDialog({
        pdfData,
        svgFile: file,
        pageCount,
        widthMm,
        heightMm,
        thumbs: [thumb1],
        thumbsLoading: pageCount > 1,
        selectedPage: 1,
        mode: 'single',
      });
      setUploadingFile(false);

      // Generate remaining thumbs in background
      for (let i = 2; i <= Math.min(pageCount, 20); i++) {
        const thumb = await renderPageToDataUrl(pdf, i, 0.25);
        setPdfDialog(prev => prev ? { ...prev, thumbs: [...prev.thumbs, thumb] } : null);
      }
      setPdfDialog(prev => prev ? { ...prev, thumbsLoading: false } : null);
    } catch (err) {
      console.error('PDF elemzési hiba:', err);
      message.error('PDF elemzési hiba');
      setUploadingFile(false);
    }
  };

  const handlePdfDialogOk = async () => {
    if (!pdfDialog) return;
    setPdfDialogWorking(true);
    try {
      if (pdfDialog.mode === 'svg') {
        // Szerver-oldali vektoros SVG import — nincs szükség pdfjs-re
        if (!pdfDialog.svgFile) throw new Error('Fájl hiányzik');
        setPdfDialog(null);
        await placePdfPageSvg(pdfDialog.svgFile, pdfDialog.selectedPage);
        return;
      }

      const pdfjs = await getPdfJs();
      const pdf = await openPdf(pdfjs, pdfDialog.pdfData);

      if (pdfDialog.mode === 'single') {
        // Beillesztés a jelenlegi canvas-ra
        const imgUrl = await renderPageToDataUrl(pdf, pdfDialog.selectedPage);
        setPdfDialog(null);
        placeImageOnFabric(imgUrl, `PDF ${pdfDialog.selectedPage}. oldal`);
      } else if (pdfDialog.mode === 'layered') {
        // Elemekre bontva: grafika + szövegtárgyak külön
        setPdfDialog(null);
        await placePdfPageLayered(pdf, pdfDialog.selectedPage);
      } else {
        // Betöltés eredeti mérettel — előre renderelük az oldalakat, majd params update
        const count = Math.min(pdf.numPages, 2);
        const pages: string[] = [];
        for (let i = 1; i <= count; i++) {
          pages.push(await renderPageToDataUrl(pdf, i));
        }
        pendingPdfPagesRef.current = pages;
        const newSides: '1' | '2' = pdf.numPages >= 2 ? '2' : '1';
        setPdfDialog(null);
        onParamsChange?.({
          ...params,
          width_mm: Math.round(pdfDialog.widthMm),
          height_mm: Math.round(pdfDialog.heightMm),
          sides: newSides,
          side2_mode: newSides === '2' ? 'color' : 'none',
        });
      }
    } catch (err) {
      console.error('[handlePdfDialogOk]', err);
      message.error('PDF betöltési hiba');
    } finally {
      setPdfDialogWorking(false);
    }
  };
  // ---- end PDF helpers ----

  const notifyDesignChange = () => {
    if (!onDesignChangeRef.current) return;
    if (suppressNotifyRef.current > 0) return;
    const getJson = (fc: fabric.Canvas | null, side: Side) => {
      if (!fc) return null;
      // If this side's initial restore hasn't completed yet, preserve the loaded initialDesign
      // data instead of capturing the half-empty canvas (fixes refresh wiping side 2).
      if (!sidesFullyRestoredRef.current.has(side)) {
        const saved = side === '1' ? initialDesign?.d1 : initialDesign?.d2;
        return saved ?? null;
      }
      const json = fc.toJSON(['id', 'name', '__locked']) as any;
      json.objects = (json.objects as any[]).filter((o: any) => !o.__guideHelper);
      return json;
    };
    const d1Json = getJson(fabricRef1.current, '1');
    const d2Json = getJson(fabricRef2.current, '2');
    // Build sheets array for multi-sheet persistence
    const sc = sheetCountRef.current;
    if (sc > 1) {
      saveCurrentSheetDesign();
      const sheets: Array<{ d1: any; d2: any }> = [];
      for (let i = 0; i < sc; i++) {
        if (i === activeSheetRef.current) {
          sheets.push({ d1: d1Json, d2: d2Json });
        } else {
          sheets.push(sheetDesignsRef.current[i] ?? { d1: null, d2: null });
        }
      }
      // Top-level d1/d2 must always be sheet 0's content (initCanvas restores from it)
      const sheet0 = activeSheetRef.current === 0
        ? { d1: d1Json, d2: d2Json }
        : (sheetDesignsRef.current[0] ?? { d1: null, d2: null });
      onDesignChangeRef.current(sheet0.d1, sheet0.d2, sheets);
    } else {
      onDesignChangeRef.current(d1Json, d2Json);
    }
  };

  // Canvas inicializálás
  const initCanvas = (ref: React.MutableRefObject<HTMLCanvasElement>, fabricRef: React.MutableRefObject<fabric.Canvas | null>, side: Side) => {
    if (!ref.current || fabricRef.current) return;

    const fc = new fabric.Canvas(ref.current, {
      width: canvasW,
      height: canvasH,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      imageSmoothingEnabled: true,
    });

    // High-quality rendering on both canvas layers
    const dpr = window.devicePixelRatio || 1;
    (['lowerCanvasEl', 'upperCanvasEl'] as const).forEach(key => {
      const el = (fc as any)[key] as HTMLCanvasElement | undefined;
      if (!el) return;
      const ctx = el.getContext('2d');
      if (ctx) ctx.imageSmoothingQuality = 'high';
    });

    fabricRef.current = fc;

    // Eseménykezelők
    fc.on('selection:created', (e: any) => {
      const obj = e.selected?.[0] ?? null;
      setSelectedObj(obj);
      updateObjPos(obj);
    });
    fc.on('selection:updated', (e: any) => {
      const obj = e.selected?.[0] ?? null;
      setSelectedObj(obj);
      updateObjPos(obj);
    });
    fc.on('selection:cleared', () => { setSelectedObj(null); setObjPosMm(null); });
    fc.on('object:modified', () => { dragStartPosRef.current = null; saveHistoryRef.current(side); updateObjects(side); notifyDesignChange(); });
    fc.on('object:added', () => { updateObjects(side); notifyDesignChange(); });
    fc.on('object:removed', () => { updateObjects(side); notifyDesignChange(); });
    // Save history after inline text editing (not caught by object:modified)
    fc.on('text:editing:exited', () => { saveHistoryRef.current(side); notifyDesignChange(); });

    // Snap + mouse-move és ruler cursor
    fc.on('mouse:move', (e: any) => {
      const p = e.absolutePointer;
      if (!p) return;
      setCursorMm({ x: p.x / MM_TO_PX - BLEED_MM, y: p.y / MM_TO_PX - BLEED_MM });
    });
    fc.on('mouse:out', () => setCursorMm({ x: null, y: null }));

    // Double-click: drill into groups to edit text without ungrouping
    fc.on('mouse:dblclick', (e: any) => {
      if (!e.target || e.target.type !== 'group') return;

      const findTextAt = (group: fabric.Group, pointer: { x: number; y: number }): fabric.Object | null => {
        const objects = group.getObjects();
        for (let i = objects.length - 1; i >= 0; i--) {
          const child = objects[i];
          const isText = child.type === 'textbox' || child.type === 'i-text' || child.type === 'text';
          const isChildGroup = child.type === 'group';
          if (!isText && !isChildGroup) continue;
          // Get absolute bounding box using full transform chain
          const matrix = child.calcTransformMatrix();
          const w = (child.width || 0);
          const h = (child.height || 0);
          const corners = [
            fabric.util.transformPoint(new fabric.Point(-w / 2, -h / 2), matrix),
            fabric.util.transformPoint(new fabric.Point(w / 2, -h / 2), matrix),
            fabric.util.transformPoint(new fabric.Point(w / 2, h / 2), matrix),
            fabric.util.transformPoint(new fabric.Point(-w / 2, h / 2), matrix),
          ];
          const minX = Math.min(...corners.map(c => c.x));
          const maxX = Math.max(...corners.map(c => c.x));
          const minY = Math.min(...corners.map(c => c.y));
          const maxY = Math.max(...corners.map(c => c.y));
          if (pointer.x >= minX && pointer.x <= maxX && pointer.y >= minY && pointer.y <= maxY) {
            if (isChildGroup) {
              const deeper = findTextAt(child as fabric.Group, pointer);
              if (deeper) return deeper;
            }
            if (isText) return child;
          }
        }
        return null;
      };

      const parentGroup = e.target as fabric.Group;
      // Use canvas-space pointer (not viewport-transformed)
      const pointer = fc.getPointer(e.e);
      if (!pointer) return;
      const textObj = findTextAt(parentGroup, pointer);
      if (!textObj) return;

      // Calculate the text's absolute position via its transform matrix
      const absMatrix = textObj.calcTransformMatrix();
      const absLeft = absMatrix[4] - ((textObj.width || 0) / 2) * absMatrix[0];
      const absTop = absMatrix[5] - ((textObj.height || 0) / 2) * absMatrix[3];

      // Temporarily remove text from group, add to canvas for editing
      parentGroup.removeWithUpdate(textObj);

      // Place the text at its absolute position on the canvas
      const absScaleX = Math.sqrt(absMatrix[0] ** 2 + absMatrix[1] ** 2);
      const absScaleY = Math.sqrt(absMatrix[2] ** 2 + absMatrix[3] ** 2);
      textObj.set({
        left: absMatrix[4] - ((textObj.width || 0) * absScaleX) / 2,
        top: absMatrix[5] - ((textObj.height || 0) * absScaleY) / 2,
        scaleX: absScaleX,
        scaleY: absScaleY,
      });
      textObj.setCoords();
      fc.add(textObj);
      fc.discardActiveObject();

      // Use setTimeout to let fabric finish processing the current dblclick
      setTimeout(() => {
        fc.setActiveObject(textObj);
        if ((textObj as any).enterEditing) {
          (textObj as any).enterEditing();
          (textObj as any).selectAll?.();
        }
        fc.renderAll();
      }, 0);

      // When editing ends, put text back into group
      const returnToGroup = () => {
        textObj.off('editing:exited', returnToGroup);

        // Calculate position relative to the group
        const groupMatrix = parentGroup.calcTransformMatrix();
        const invGroupMatrix = fabric.util.invertTransform(groupMatrix);
        const tScaleX = textObj.scaleX || 1;
        const tScaleY = textObj.scaleY || 1;
        const textCenter = new fabric.Point(
          (textObj.left ?? 0) + ((textObj.width || 0) * tScaleX) / 2,
          (textObj.top ?? 0) + ((textObj.height || 0) * tScaleY) / 2,
        );
        const localCenter = fabric.util.transformPoint(textCenter, invGroupMatrix);
        const gScaleX = Math.sqrt(groupMatrix[0] ** 2 + groupMatrix[1] ** 2);
        const gScaleY = Math.sqrt(groupMatrix[2] ** 2 + groupMatrix[3] ** 2);

        fc.remove(textObj);
        textObj.set({
          left: localCenter.x - ((textObj.width || 0) * (tScaleX / gScaleX)) / 2,
          top: localCenter.y - ((textObj.height || 0) * (tScaleY / gScaleY)) / 2,
          scaleX: tScaleX / gScaleX,
          scaleY: tScaleY / gScaleY,
        });
        parentGroup.addWithUpdate(textObj);
        fc.setActiveObject(parentGroup);
        fc.renderAll();
        saveHistoryRef.current(side);
        updateObjects(side);
      };

      textObj.on('editing:exited', returnToGroup);
    });

    fc.on('before:transform', (opt: any) => {
      const t = opt?.transform;
      if (t?.action === 'drag') {
        dragStartPosRef.current = { left: t.target.left ?? 0, top: t.target.top ?? 0 };
      }
    });

    fc.on('object:moving', (e: any) => {
      const obj = e.target;
      if (!obj) return;

      // Shift held → constrain to horizontal or vertical axis
      if (e.e?.shiftKey && dragStartPosRef.current) {
        const dx = Math.abs((obj.left ?? 0) - dragStartPosRef.current.left);
        const dy = Math.abs((obj.top ?? 0) - dragStartPosRef.current.top);
        if (dx >= dy) {
          obj.set('top', dragStartPosRef.current.top);
        } else {
          obj.set('left', dragStartPosRef.current.left);
        }
      }

      if (snapRef.current || snapEdgesRef.current) {
        snapObjectToGuides(obj);
      }
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      setObjPosMm({ x: (left - bleedPx) / MM_TO_PX, y: (top - bleedPx) / MM_TO_PX, w: ow / MM_TO_PX, h: oh / MM_TO_PX });
    });

    // Set initial zoom + dimensions (Fabric zoom instead of CSS transform = sharp rendering)
    const el = fc.getElement().parentElement;
    if (el) el.style.transformOrigin = 'top left';
    fc.setZoom(scale);
    fc.setDimensions({ width: displayW, height: displayH });

    // Load pending PDF pages (set by handlePdfDialogOk before params update triggered reinit)
    const sideIdx = side === '1' ? 0 : 1;
    const pendingImg = pendingPdfPagesRef.current[sideIdx];
    if (pendingImg) {
      pendingPdfPagesRef.current[sideIdx] = '';
      fabric.Image.fromURL(pendingImg, (img: fabric.Image) => {
        const ratio = Math.min(cutW / (img.width ?? cutW), cutH / (img.height ?? cutH));
        img.scale(ratio);
        img.set({ left: bleedPx, top: bleedPx });
        (img as any).name = `PDF ${side}. oldal`;
        fc.add(img);
        fc.renderAll();
        saveHistory(side);
      });
    }

    // Capture current generation to detect if a new reinit happens while async is in flight
    const myGen = initGenRef.current;

    // Restore objects: prefer savedCanvasDataRef (param-change carry-over), then initialDesign (first load)
    const savedFromRef = side === '1' ? savedCanvasDataRef.current.d1 : savedCanvasDataRef.current.d2;
    if (savedFromRef && savedFromRef.length > 0) {
      // Clear the ref so we don't re-apply stale data on next reinit
      if (side === '1') savedCanvasDataRef.current.d1 = null;
      else savedCanvasDataRef.current.d2 = null;
      restoredSidesRef.current.add(side);
      suppressNotifyRef.current++;
      fabric.util.enlivenObjects(savedFromRef, (enlivened: fabric.Object[]) => {
        if (initGenRef.current !== myGen) { suppressNotifyRef.current--; return; }
        enlivened.forEach((obj: fabric.Object) => fc.add(obj));
        suppressNotifyRef.current--;
        fc.renderAll();
        updateObjects(side);
        sidesFullyRestoredRef.current.add(side);
        saveHistory(side);
      }, 'fabric' as any);
      return;
    }

    // Restore saved design on initial load (once per side)
    if (!restoredSidesRef.current.has(side)) {
      restoredSidesRef.current.add(side);
      const designData = side === '1' ? initialDesign?.d1 : initialDesign?.d2;
      const savedObjs = (designData?.objects ?? []).filter((o: any) => !o.__guideHelper);
      if (savedObjs.length > 0) {
        suppressNotifyRef.current++;
        fabric.util.enlivenObjects(savedObjs, (enlivened: fabric.Object[]) => {
          if (initGenRef.current !== myGen) { suppressNotifyRef.current--; return; }
          enlivened.forEach((obj: fabric.Object) => fc.add(obj));
          suppressNotifyRef.current--;
          fc.renderAll();
          updateObjects(side);
          // Mark fully restored BEFORE saveHistory so that any notifyDesignChange triggered
          // from here onwards uses the real canvas state (not the preserved initialDesign).
          sidesFullyRestoredRef.current.add(side);
          saveHistory(side);
        }, 'fabric' as any);
        return; // skip the saveHistory(side) below
      }
      // No saved objects — mark as fully restored immediately
      sidesFullyRestoredRef.current.add(side);
    }

    saveHistory(side);
  };

  useEffect(() => {
    // Reset state on dimension or sides change
    setHistory1([]);
    setHistory2([]);
    setHistIdx1(-1);
    setHistIdx2(-1);
    setObjects1([]);
    setObjects2([]);
    setSelectedObj(null);

    const t = setTimeout(() => {
      initCanvas(canvasRef1, fabricRef1, '1');
      if (params.sides === '2') {
        initCanvas(canvasRef2, fabricRef2, '2');
      }
    }, 100);
    return () => {
      clearTimeout(t);
      // Increment generation — causes any in-flight enlivenObjects callbacks to discard their work
      initGenRef.current++;
      // Save user objects before disposing so they survive parameter changes
      const extractObjs = (fc: fabric.Canvas | null) => {
        if (!fc) return null;
        const objs = fc.getObjects().filter((o: any) => !o.__guideHelper);
        if (objs.length === 0) return null;
        return objs.map(o => o.toObject(['id', 'name', '__locked']));
      };
      // Save active sheet objects from live canvases
      savedCanvasDataRef.current = { d1: extractObjs(fabricRef1.current), d2: extractObjs(fabricRef2.current) };

      // Also persist active sheet back into sheetDesignsRef (objects-only)
      // and convert ALL sheets to objects-only so they survive dimension changes
      const extractObjsFromJson = (json: any) => {
        if (!json) return null;
        const objs = (json.objects ?? []).filter((o: any) => !o.__guideHelper);
        return objs.length > 0 ? objs : null;
      };
      // Save active sheet from live canvas into sheetDesignsRef
      sheetDesignsRef.current[activeSheet] = {
        d1: savedCanvasDataRef.current.d1 ? { objects: savedCanvasDataRef.current.d1 } : null,
        d2: savedCanvasDataRef.current.d2 ? { objects: savedCanvasDataRef.current.d2 } : null,
      };
      // Convert non-active sheets from full JSON to objects-only
      for (const key of Object.keys(sheetDesignsRef.current)) {
        const idx = Number(key);
        if (idx === activeSheet) continue;
        const entry = sheetDesignsRef.current[idx];
        if (entry) {
          sheetDesignsRef.current[idx] = {
            d1: extractObjsFromJson(entry.d1) ? { objects: extractObjsFromJson(entry.d1) } : null,
            d2: extractObjsFromJson(entry.d2) ? { objects: extractObjsFromJson(entry.d2) } : null,
          };
        }
      }

      // Clear restore guards so the next initCanvas always does a full fresh restore
      restoredSidesRef.current = new Set();
      sidesFullyRestoredRef.current = new Set();
      fabricRef1.current?.dispose();
      fabricRef2.current?.dispose();
      fabricRef1.current = null;
      fabricRef2.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.width_mm, params.height_mm, params.sides]);

  // Update obj pos display
  const updateObjPos = (obj: fabric.Object | null) => {
    if (!obj) { setObjPosMm(null); return; }
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
    setObjPosMm({ x: (left - bleedPx) / MM_TO_PX, y: (top - bleedPx) / MM_TO_PX, w: ow / MM_TO_PX, h: oh / MM_TO_PX });
  };

  // Snap object to nearest guide (includes fold lines) + page edges + trim/safe zone
  const snapObjectToGuides = (obj: fabric.Object) => {
    const threshold = SNAP_THRESHOLD_PX;
    let newLeft = obj.left ?? 0;
    let newTop  = obj.top  ?? 0;
    const ow = (obj.width  ?? 0) * (obj.scaleX ?? 1);
    const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);

    // Helper: try snapping a single coordinate value
    const tryX = (target: number) => {
      if (Math.abs(newLeft - target) < threshold)          newLeft = target;         // left edge
      else if (Math.abs(newLeft + ow / 2 - target) < threshold) newLeft = target - ow / 2; // center
      else if (Math.abs(newLeft + ow   - target) < threshold) newLeft = target - ow;       // right edge
    };
    const tryY = (target: number) => {
      if (Math.abs(newTop - target) < threshold)           newTop = target;
      else if (Math.abs(newTop + oh / 2 - target) < threshold) newTop = target - oh / 2;
      else if (Math.abs(newTop + oh    - target) < threshold) newTop = target - oh;
    };

    // 1. Sheet edges + cut/product edges
    if (snapEdgesRef.current) {
      // Sheet edges (outermost)
      for (const x of [0, canvasW]) tryX(x);
      for (const y of [0, canvasH]) tryY(y);
      // Cut/product edges (inset by bleed)
      for (const x of [bleedPx, canvasW - bleedPx]) tryX(x);
      for (const y of [bleedPx, canvasH - bleedPx]) tryY(y);
      // Center (same for sheet and product)
      tryX(canvasW / 2);
      tryY(canvasH / 2);
    }

    // 2. User guides + fold lines (stored in cut-relative mm, convert to fabric px)
    if (snapRef.current) {
      const guideList = [...guidesRef.current, ...foldLinesRef.current];
      for (const g of guideList) {
        const gPx = g.mm * MM_TO_PX + bleedPx;  // cut-relative → sheet fabric px
        if (g.axis === 'x') tryX(gPx);
        else                tryY(gPx);
      }
    }

    obj.set({ left: newLeft, top: newTop });
  };

  // Guide line management
  const addGuide = (axis: 'x' | 'y', mm: number) => {
    const id = nextGuideId.current++;
    setGuides(prev => [...prev, { id, axis, mm }]);
  };

  const removeGuide = (id: number) => {
    setGuides(prev => prev.filter(g => g.id !== id));
  };

  const updateGuide = (id: number, mm: number) => {
    setGuides(prev => prev.map(g => g.id === id ? { ...g, mm } : g));
  };

  // Fold line management
  const addFoldLine = (axis: 'x' | 'y', mm: number) => {
    const id = nextFoldId.current++;
    setFoldLines(prev => [...prev, { id, axis, mm, label: 'Hajtás' }]);
  };
  const removeFoldLine = (id: number) => setFoldLines(prev => prev.filter(f => f.id !== id));
  const updateFoldLine = (id: number, mm: number) => setFoldLines(prev => prev.map(f => f.id === id ? { ...f, mm } : f));

  // Guide / FoldLine drag handlers (attached to canvas wrapper)
  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingItem) return;
    e.preventDefault();
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = draggingItem.axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
    const newMm = pos / displayScale - BLEED_MM;  // convert to cut-relative mm
    const max = draggingItem.axis === 'x' ? widthMmN : heightMmN;
    const clamped = Math.max(-BLEED_MM, Math.min(max + BLEED_MM, parseFloat(newMm.toFixed(1))));
    if (draggingItem.type === 'guide') updateGuide(draggingItem.id, clamped);
    else updateFoldLine(draggingItem.id, clamped);
  };
  const handleWrapperMouseUp = () => setDraggingItem(null);

  // Drag from ruler to create guide
  const handleRulerMouseDown = (axis: 'x' | 'y') => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const posPx = axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
    const mm = Math.round(((posPx / displayScale) - BLEED_MM) * 2) / 2;  // 0.5mm precision, cut-relative
    const clamped = Math.max(-BLEED_MM, Math.min(axis === 'x' ? widthMmN + BLEED_MM : heightMmN + BLEED_MM, mm));
    addGuide(axis, clamped);
  };

  // Font betöltés
  const loadFont = async (fontName: string) => {
    if (SYSTEM_FONTS.has(fontName)) return;
    if (!loadedFonts.has(fontName)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
      document.head.appendChild(link);
      try {
        await document.fonts.load(`400 48px "${fontName}"`);
      } catch {
        await new Promise(r => setTimeout(r, 600));
      }
      setLoadedFonts(prev => new Set([...Array.from(prev), fontName]));
    }
    // Re-test after (re-)loading to keep badge accurate
    if (checkFontHasHU(fontName)) {
      setHuFonts(prev => { const s = new Set(prev); s.add(fontName); return s; });
    }
  };

  // Undo / Redo
  const undo = () => {
    const side = activeSide;
    const hist = side === '1' ? history1 : history2;
    const idx = side === '1' ? histIdx1 : histIdx2;
    if (idx <= 0) return;
    const newIdx = idx - 1;
    const fc = getActiveFabric();
    if (!fc) return;
    fc.loadFromJSON(hist[newIdx], () => {
      // Restore lock constraints from serialised __locked flag
      fc.forEachObject((o: fabric.Object) => {
        if ((o as any).__locked) {
          o.set({ lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true, hasControls: false } as any);
        }
      });
      fc.renderAll();
      updateObjects(side);
      if (side === '1') setHistIdx1(newIdx);
      else setHistIdx2(newIdx);
    });
  };
  undoRef.current = undo;

  const redo = () => {
    const side = activeSide;
    const hist = side === '1' ? history1 : history2;
    const idx = side === '1' ? histIdx1 : histIdx2;
    if (idx >= hist.length - 1) return;
    const newIdx = idx + 1;
    const fc = getActiveFabric();
    if (!fc) return;
    fc.loadFromJSON(hist[newIdx], () => {
      // Restore lock constraints from serialised __locked flag
      fc.forEachObject((o: fabric.Object) => {
        if ((o as any).__locked) {
          o.set({ lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true, hasControls: false } as any);
        }
      });
      fc.renderAll();
      updateObjects(side);
      if (side === '1') setHistIdx1(newIdx);
      else setHistIdx2(newIdx);
    });
  };
  redoRef.current = redo;

  // Szöveg hozzáadása
  const addText = () => {
    const fc = getActiveFabric();
    if (!fc) return;
    const text = new fabric.IText('Szöveg', {
      left: canvasW / 2 - 60,
      top: canvasH / 2 - 15,
      fontSize: 24,
      fontFamily: 'Arial',
      fill: '#000000',
      editable: true,
    });
    (text as any).name = 'Szöveg';
    fc.add(text);
    fc.setActiveObject(text);
    fc.renderAll();
    saveHistory(activeSide);
  };

  // Téglalap hozzáadása
  const addRect = () => {
    const fc = getActiveFabric();
    if (!fc) return;
    const rect = new fabric.Rect({
      left: canvasW / 2 - 50,
      top: canvasH / 2 - 30,
      width: 100,
      height: 60,
      fill: '#1890ff',
      opacity: 1,
    });
    (rect as any).name = 'Téglalap';
    fc.add(rect);
    fc.setActiveObject(rect);
    fc.renderAll();
    saveHistory(activeSide);
  };

  // Kör hozzáadása
  const addCircle = () => {
    const fc = getActiveFabric();
    if (!fc) return;
    const circle = new fabric.Circle({
      left: canvasW / 2 - 40,
      top: canvasH / 2 - 40,
      radius: 40,
      fill: '#52c41a',
    });
    (circle as any).name = 'Kör';
    fc.add(circle);
    fc.setActiveObject(circle);
    fc.renderAll();
    saveHistory(activeSide);
  };

  // Kép feltöltés
  const handleImageUpload = (file: File) => {
    setUploadingFile(true);

    // PDF esetén: közvetlen File-t adunk tovább (ArrayBuffer-ként olvassuk benn)
    if (file.type === 'application/pdf') {
      analyzePdf(file);
      return false;
    }

    // Kép: DataURL-ként töltük be Fabric-ba
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      fabric.Image.fromURL(dataUrl, (img: fabric.Image) => {
        const fc = getActiveFabric();
        if (!fc) return;
        const maxW = canvasW * 0.8;
        const maxH = canvasH * 0.8;
        const iw = img.width ?? 100;
        const ih = img.height ?? 100;
        const ratio = Math.min(maxW / iw, maxH / ih, 1);
        img.scale(ratio);
        img.set({ left: (canvasW - iw * ratio) / 2, top: (canvasH - ih * ratio) / 2 });
        (img as any).name = file.name;
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
        saveHistory(activeSide);
        setUploadingFile(false);
      });
    };
    reader.readAsDataURL(file);
    return false; // prevent default upload
  };

  // (loadPdfAsImage replaced by analyzePdf + handlePdfDialogOk above)

  // Aktív objektum tulajdonságok
  const updateProp = (prop: string, value: any) => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    obj.set(prop as any, value);
    fc!.renderAll();
    saveHistory(activeSide);
    setSelectedObj(obj);              // keep the real Fabric object (prototype intact)
    forceToolbarUpdate(t => t + 1);  // force re-render so toolbar values refresh
    updateObjPos(obj);
  };

  const deleteSelected = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj || (obj as any).__guideHelper) return;
    fc!.remove(obj);
    fc!.renderAll();
    saveHistory(activeSide);
  };
  deleteSelectedRef.current = deleteSelected;

  const ungroupSelected = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj || obj.type !== 'group') return;
    const group = obj as fabric.Group;
    const items = group.getObjects();
    group.destroy();
    fc!.remove(group);
    const sel: fabric.Object[] = [];
    items.forEach((child) => {
      fc!.add(child);
      sel.push(child);
    });
    fc!.discardActiveObject();
    if (sel.length > 1) {
      const activeSel = new fabric.ActiveSelection(sel, { canvas: fc! });
      fc!.setActiveObject(activeSel);
    } else if (sel.length === 1) {
      fc!.setActiveObject(sel[0]);
    }
    fc!.renderAll();
    saveHistory(activeSide);
    updateObjects(activeSide);
  };

  const groupSelected = () => {
    const fc = getActiveFabric();
    const active = fc?.getActiveObject();
    if (!active || active.type !== 'activeSelection') return;
    const sel = active as fabric.ActiveSelection;
    const group = sel.toGroup();
    (group as any).name = 'Csoport';
    fc!.setActiveObject(group);
    fc!.renderAll();
    saveHistory(activeSide);
    updateObjects(activeSide);
  };

  // ── Comment annotation helpers ──
  const addCommentAnnotation = (ann: CommentAnnotation) => {
    setCommentAnnotations(prev => [...prev, ann]);
  };

  const updateCommentText = (id: string, text: string) => {
    setCommentAnnotations(prev => prev.map(a => a.id === id ? { ...a, text } : a));
  };

  const resolveComment = (id: string) => {
    setCommentAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const deleteComment = (id: string) => {
    setCommentAnnotations(prev => prev.filter(a => a.id !== id));
    if (editingCommentId === id) { setEditingCommentId(null); setCommentTextDraft(''); }
  };

  // Comment overlay mouse handlers (area + pin + arrow creation)
  const handleCommentMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editorMode !== 'comment') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    if (commentTool === 'pin') {
      const id = `c-${commentNextId.current++}`;
      const ann: CommentAnnotation = {
        id, side: activeSide, type: 'pin',
        x, y, text: '', author: 'Felhasználó',
        timestamp: Date.now(), resolved: false, color: commentColor,
      };
      setNewCommentDraft(ann);
      setCommentTextDraft('');
    } else if (commentTool === 'area') {
      commentDrawStartRef.current = { x, y };
    } else if (commentTool === 'arrow') {
      commentDrawStartRef.current = { x, y };
    }
  };

  const handleCommentMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editorMode !== 'comment' || !commentDrawStartRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const start = commentDrawStartRef.current;
    if (commentTool === 'area') {
      const draft: CommentAnnotation = {
        id: 'draft', side: activeSide, type: 'area',
        x: Math.min(start.x, x), y: Math.min(start.y, y),
        width: Math.abs(x - start.x), height: Math.abs(y - start.y),
        text: '', author: 'Felhasználó',
        timestamp: Date.now(), resolved: false, color: commentColor,
      };
      setNewCommentDraft(draft);
    } else if (commentTool === 'arrow') {
      const draft: CommentAnnotation = {
        id: 'draft', side: activeSide, type: 'arrow',
        x: start.x, y: start.y, x2: x, y2: y,
        text: '', author: 'Felhasználó',
        timestamp: Date.now(), resolved: false, color: commentColor,
      };
      setNewCommentDraft(draft);
    }
  };

  const handleCommentMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editorMode !== 'comment') return;
    if (commentTool === 'area' && commentDrawStartRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      const start = commentDrawStartRef.current;
      commentDrawStartRef.current = null;
      const w = Math.abs(x - start.x);
      const h = Math.abs(y - start.y);
      if (w < 5 && h < 5) { setNewCommentDraft(null); return; } // too small — ignore
      const id = `c-${commentNextId.current++}`;
      const ann: CommentAnnotation = {
        id, side: activeSide, type: 'area',
        x: Math.min(start.x, x), y: Math.min(start.y, y),
        width: w, height: h,
        text: '', author: 'Felhasználó',
        timestamp: Date.now(), resolved: false, color: commentColor,
      };
      setNewCommentDraft(ann);
      setCommentTextDraft('');
    } else if (commentTool === 'arrow' && commentDrawStartRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      const start = commentDrawStartRef.current;
      commentDrawStartRef.current = null;
      const dist = Math.sqrt((x - start.x) ** 2 + (y - start.y) ** 2);
      if (dist < 8) { setNewCommentDraft(null); return; } // too short — ignore
      const id = `c-${commentNextId.current++}`;
      const ann: CommentAnnotation = {
        id, side: activeSide, type: 'arrow',
        x: start.x, y: start.y, x2: x, y2: y,
        text: '', author: 'Felhasználó',
        timestamp: Date.now(), resolved: false, color: commentColor,
      };
      setNewCommentDraft(ann);
      setCommentTextDraft('');
    }
  };

  const confirmNewComment = () => {
    if (!newCommentDraft) return;
    addCommentAnnotation({ ...newCommentDraft, id: newCommentDraft.id === 'draft' ? `c-${commentNextId.current++}` : newCommentDraft.id, text: commentTextDraft });
    setNewCommentDraft(null);
    setCommentTextDraft('');
  };

  const cancelNewComment = () => {
    setNewCommentDraft(null);
    setCommentTextDraft('');
    commentDrawStartRef.current = null;
  };

  /** Lapszélig húzás — arányos, a vágott területhez igazít (contain) */
  const fitToPage = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    const objW = obj.width ?? 1;
    const objH = obj.height ?? 1;
    const s = Math.min(cutW / objW, cutH / objH);
    obj.set({
      scaleX: s,
      scaleY: s,
      left: bleedPx + (cutW - objW * s) / 2,
      top:  bleedPx + (cutH - objH * s) / 2,
    });
    fc!.renderAll();
    saveHistory(activeSide);
  };

  /** Lap kitöltése — arányos, a vágott területet teljesen lefedi (cover) */
  const fillPage = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    const objW = obj.width ?? 1;
    const objH = obj.height ?? 1;
    const s = Math.max(cutW / objW, cutH / objH);
    obj.set({
      scaleX: s,
      scaleY: s,
      left: bleedPx + (cutW - objW * s) / 2,
      top:  bleedPx + (cutH - objH * s) / 2,
    });
    fc!.renderAll();
    saveHistory(activeSide);
  };

  const duplicateSelected = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    obj.clone((cloned: fabric.Object) => {
      cloned.set({ left: (obj.left ?? 0) + 15, top: (obj.top ?? 0) + 15 });
      fc!.add(cloned);
      fc!.setActiveObject(cloned);
      fc!.renderAll();
      saveHistory(activeSide);
    });
  };

  const bringToFront = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    fc!.bringToFront(obj);
    fc!.renderAll();
    saveHistory(activeSide);
  };

  const sendToBack = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    fc!.sendToBack(obj);
    fc!.renderAll();
    saveHistory(activeSide);
  };

  // ===== Nyomdakész PDF export (admin) =====
  const handleExportPrintPDF = async () => {
    const fc1 = fabricRef1.current;
    if (!fc1) return;
    message.loading({ content: 'Nyomdakész PDF generálása…', key: 'pdfexp', duration: 0 });
    try {
      // Dynamic import — jsPDF is already in dependencies
      const { jsPDF } = await import('jspdf');

      const widthMm  = Number(params.width_mm);
      const heightMm = Number(params.height_mm);
      if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
        throw new Error(`Invalid print size: ${params.width_mm} x ${params.height_mm}`);
      }
      const bleedMm  = BLEED_MM;          // 3 mm
      const CROP_GAP = 1;                  // mm: gap from cut edge to crop mark start
      const pageW = widthMm  + 2 * bleedMm;
      const pageH = heightMm + 2 * bleedMm;
      const orientation = pageW >= pageH ? 'landscape' : 'portrait';

      // -- helper: export one fabric canvas as JPEG data URL (full sheet incl. bleed, ~300 DPI) --
      const exportSheet = (fc: fabric.Canvas): string => {
        const savedZoom = fc.getZoom();
        const savedW    = fc.getWidth();
        const savedH    = fc.getHeight();
        const helpers   = fc.getObjects().filter((o: any) => o.__guideHelper);
        helpers.forEach((o: any) => o.set('visible', false));
        fc.setZoom(1);
        fc.setDimensions({ width: canvasW, height: canvasH });
        fc.renderAll();
        // canvas is at 96 DPI (MM_TO_PX = 96/25.4 ≈ 3.78); target ~300 DPI → multiplier 3
        const url = fc.toDataURL({ format: 'jpeg', quality: 0.95, multiplier: 3 });
        helpers.forEach((o: any) => o.set('visible', true));
        fc.setZoom(savedZoom);
        fc.setDimensions({ width: savedW, height: savedH });
        fc.renderAll();
        return url;
      };

      // -- helper: draw crop marks on current page --
      const drawCropMarks = (doc: InstanceType<typeof jsPDF>) => {
        doc.setDrawColor(0);          // K=100 registration black
        doc.setLineWidth(0.25);
        doc.setLineDashPattern([], 0);
        const x0 = bleedMm;               // left  cut edge
        const x1 = bleedMm + widthMm;     // right cut edge
        const y0 = bleedMm;               // top   cut edge
        const y1 = bleedMm + heightMm;    // bottom cut edge
        const g  = CROP_GAP;
        // top-left
        doc.line(0, y0, x0 - g, y0);      // ← horizontal
        doc.line(x0, 0, x0, y0 - g);      // ↑ vertical
        // top-right
        doc.line(x1 + g, y0, pageW, y0);
        doc.line(x1, 0, x1, y0 - g);
        // bottom-left
        doc.line(0, y1, x0 - g, y1);
        doc.line(x0, y1 + g, x0, pageH);
        // bottom-right
        doc.line(x1 + g, y1, pageW, y1);
        doc.line(x1, y1 + g, x1, pageH);
      };

      // -- helper: draw fold-line indicators in bleed (dashed) --
      const drawFoldMarks = (doc: InstanceType<typeof jsPDF>) => {
        if (foldLines.length === 0) return;
        doc.setDrawColor(0);
        doc.setLineWidth(0.25);
        doc.setLineDashPattern([1.5, 1], 0);
        const x0 = bleedMm;
        const x1 = bleedMm + widthMm;
        const y0 = bleedMm;
        const y1 = bleedMm + heightMm;
        const g  = CROP_GAP;
        for (const f of foldLines) {
          if (f.axis === 'x') {
            // vertical fold line at cut-relative f.mm
            const fx = bleedMm + f.mm;
            doc.line(fx, 0,        fx, y0 - g);    // top bleed
            doc.line(fx, y1 + g,   fx, pageH);     // bottom bleed
          } else {
            // horizontal fold line at cut-relative f.mm
            const fy = bleedMm + f.mm;
            doc.line(0,      fy, x0 - g, fy);      // left bleed
            doc.line(x1 + g, fy, pageW,  fy);      // right bleed
          }
        }
        doc.setLineDashPattern([], 0);
      };

      const doc = new jsPDF({
        unit: 'mm',
        orientation,
        format: [pageW, pageH],
        compress: true,
      });

      // Inject TrimBox / BleedBox into each page dictionary (PDF points, bottom-left origin)
      const MM2PT = 72 / 25.4;
      doc.internal.events.subscribe('putPage', (_data: any) => {
        const b  = (bleedMm           * MM2PT).toFixed(3);
        const w  = ((bleedMm + widthMm)  * MM2PT).toFixed(3);
        const h  = ((bleedMm + heightMm) * MM2PT).toFixed(3);
        const pw = (pageW * MM2PT).toFixed(3);
        const ph = (pageH * MM2PT).toFixed(3);
        (doc as any).internal.write(`/TrimBox [${b} ${b} ${w} ${h}]`);
        (doc as any).internal.write(`/BleedBox [0 0 ${pw} ${ph}]`);
      });

      // === Page 1 ===
      const raw1 = exportSheet(fc1);
      const img1 = params.side1_mode === 'bw' ? await toGrayscaleDataUrl(raw1) : raw1;
      doc.addImage(img1, 'JPEG', 0, 0, pageW, pageH);
      drawCropMarks(doc);
      drawFoldMarks(doc);

      // === Page 2 (if 2-sided) ===
      if (params.sides === '2' && fabricRef2.current) {
        doc.addPage([pageW, pageH], orientation);
        const raw2 = exportSheet(fabricRef2.current);
        const img2 = params.side2_mode === 'bw' ? await toGrayscaleDataUrl(raw2) : raw2;
        doc.addImage(img2, 'JPEG', 0, 0, pageW, pageH);
        drawCropMarks(doc);
        drawFoldMarks(doc);
      }

      doc.setProperties({
        title:    `Nyomdakész PDF — ${params.product_name}`,
        subject:  `Vágott: ${widthMm}×${heightMm}mm | Kifutó: ${bleedMm}mm | CMYK`,
        creator:  'PixiSys PrintEditor',
        keywords: 'CMYK nyomdakész print-ready bleed crop-marks',
      });

      const fname = `${params.product_name.replace(/[^\w\u00C0-\u024F]/g, '_')}_nyomdakesz.pdf`;
      doc.save(fname);
      message.success({ content: 'PDF letöltve!', key: 'pdfexp', duration: 3 });
    } catch (err) {
      console.error('[PDF export]', err);
      message.error({ content: 'PDF exportálás sikertelen', key: 'pdfexp', duration: 4 });
    }
  };

  // Converts any PNG/JPEG data URL to a grayscale version via an offscreen canvas.
  // Used for fekete-fehér (BW) sides in 3D preview.
  const toGrayscaleDataUrl = (dataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.filter = 'grayscale(1)';
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });

  const handlePreview3D = () => {
    const fc1 = fabricRef1.current;
    const fc2 = fabricRef2.current;
    if (!fc1) return;
    const trimInsetPx = BLEED_MM * MM_TO_PX;

    const exportFc = (fc: fabric.Canvas): string => {
      const curZoom = fc.getZoom();
      const curW = fc.getWidth();
      const curH = fc.getHeight();
      const prevClip = (fc as any).clipPath;
      const helpers = fc.getObjects().filter((o: any) => o.__guideHelper);
      helpers.forEach((o: any) => o.set('visible', false));
      fc.setZoom(1);
      fc.setDimensions({ width: canvasW, height: canvasH });
      // Hard-clip and export only the inner trim/cut area (without bleed).
      (fc as any).clipPath = new fabric.Rect({
        left: trimInsetPx,
        top: trimInsetPx,
        width: Math.max(1, canvasW - trimInsetPx * 2),
        height: Math.max(1, canvasH - trimInsetPx * 2),
        absolutePositioned: true,
        selectable: false, evented: false,
      });
      fc.renderAll();
      const mult = Math.min(4, Math.ceil(1200 / Math.max(canvasW, canvasH)));
      const url = fc.toDataURL({
        format: 'png',
        multiplier: mult,
        left: trimInsetPx,
        top: trimInsetPx,
        width: Math.max(1, canvasW - trimInsetPx * 2),
        height: Math.max(1, canvasH - trimInsetPx * 2),
      });
      (fc as any).clipPath = prevClip;
      helpers.forEach((o: any) => o.set('visible', true));
      fc.setZoom(curZoom);
      fc.setDimensions({ width: curW, height: curH });
      fc.renderAll();
      return url;
    };

    // ── Collect all sheets ──
    const buildPreview = async () => {
      // Save current sheet first
      if (sheetCount > 1) saveCurrentSheetDesign();

      const sheetsData: Array<{ d1: string; d2: string }> = [];

      for (let si = 0; si < sheetCount; si++) {
        if (si === activeSheet) {
          // Current sheet — export directly from live canvases
          // Nyomatlan sides → blank (empty string triggers cream fallback in 3D)
          const rawD1 = params.side1_mode === 'none' ? '' : exportFc(fc1);
          const rawD2 = params.side2_mode === 'none' ? '' : ((params.sides === '2' && fc2) ? exportFc(fc2) : '');
          const d1 = params.side1_mode === 'bw' ? await toGrayscaleDataUrl(rawD1) : rawD1;
          const d2 = params.side2_mode === 'bw' && rawD2 ? await toGrayscaleDataUrl(rawD2) : rawD2;
          sheetsData.push({ d1, d2 });
        } else {
          // Other sheets — load from sheetDesignsRef, render to temp canvases
          const saved = sheetDesignsRef.current[si];
          if (!saved?.d1) {
            sheetsData.push({ d1: '', d2: '' });
            continue;
          }
          // Render saved design to temporary fabric canvas, export
          const tmpExport = async (json: any): Promise<string> => {
            if (!json) return '';
            const objData = json.objects ?? [];
            if (objData.length === 0) return '';
            return new Promise<string>((resolve) => {
              const tmpCanvas = document.createElement('canvas');
              tmpCanvas.width = canvasW;
              tmpCanvas.height = canvasH;
              const tmpFc = new fabric.Canvas(tmpCanvas, { width: canvasW, height: canvasH, backgroundColor: '#ffffff' });
              fabric.util.enlivenObjects(objData, (enlivened: fabric.Object[]) => {
                enlivened.forEach((obj: fabric.Object) => tmpFc.add(obj));
                tmpFc.renderAll();
                const trimW = Math.max(1, canvasW - trimInsetPx * 2);
                const trimH = Math.max(1, canvasH - trimInsetPx * 2);
                (tmpFc as any).clipPath = new fabric.Rect({
                  left: trimInsetPx, top: trimInsetPx, width: trimW, height: trimH,
                  absolutePositioned: true, selectable: false, evented: false,
                });
                tmpFc.renderAll();
                const m = Math.min(4, Math.ceil(1200 / Math.max(canvasW, canvasH)));
                const url = tmpFc.toDataURL({ format: 'png', multiplier: m, left: trimInsetPx, top: trimInsetPx, width: trimW, height: trimH });
                tmpFc.dispose();
                resolve(url);
              }, 'fabric' as any);
            });
          };
          // Nyomatlan sides → blank
          let d1 = params.side1_mode === 'none' ? '' : await tmpExport(saved.d1);
          let d2 = params.side2_mode === 'none' ? '' : await tmpExport(saved.d2);
          if (params.side1_mode === 'bw' && d1) d1 = await toGrayscaleDataUrl(d1);
          if (params.side2_mode === 'bw' && d2) d2 = await toGrayscaleDataUrl(d2);
          sheetsData.push({ d1, d2 });
        }
      }

      const W = params.width_mm;
      const H = params.height_mm;
      const productName = params.product_name.replace(/`/g, "'");
      const sidesLabel = params.sides === '2' ? '2 oldalas' : '1 oldalas';
      const totalSheets = sheetsData.length;

      // Encode sheets data as JSON-safe array
      const sheetsJson = JSON.stringify(sheetsData.map(s => ({ d1: s.d1, d2: s.d2 })));

    const html = `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<title>3D Előnézet — ${productName}</title>
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
<\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111827;overflow:hidden;font-family:system-ui,sans-serif}
#hud{position:fixed;top:14px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.85);font-size:13px;background:rgba(255,255,255,.08);backdrop-filter:blur(10px);padding:7px 18px;border-radius:20px;pointer-events:none;border:1px solid rgba(255,255,255,.14);white-space:nowrap}
#hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.35);font-size:11px;pointer-events:none}
#nav{position:fixed;bottom:50px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;z-index:10}
#nav button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 16px;cursor:pointer;font-size:13px;font-family:system-ui,sans-serif;backdrop-filter:blur(10px);transition:background .15s}
#nav button:hover{background:rgba(255,255,255,.22)}
#nav button:disabled{opacity:.3;cursor:default}
#nav span{color:rgba(255,255,255,.85);font-size:13px}
</style>
</head><body>
<div id="hud">${productName} &nbsp;·&nbsp; ${W}&times;${H}&thinsp;mm &nbsp;·&nbsp; ${sidesLabel}${totalSheets > 1 ? ' &nbsp;·&nbsp; <span id="sheetLabel">' + totalSheets + ' ív</span>' : ''}</div>
${totalSheets > 1 ? '<div id="nav"><button id="prevBtn">◀ Előző ív</button><span id="navLabel">1 / ' + totalSheets + '</span><button id="nextBtn">Következő ív ▶</button></div>' : ''}
<div id="hint">Drag: forgat &nbsp;|&nbsp; Görgő: zoom &nbsp;|&nbsp; Jobb klikk: mozgat${totalSheets > 1 ? ' &nbsp;|&nbsp; ← →: lapozás' : ''}</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const SHEETS=${sheetsJson};
const TOTAL=${totalSheets};
const W=${W},H=${H};
let currentSheet=0;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color('#1e2230');
const FOV=36;
const cam=new THREE.PerspectiveCamera(FOV,innerWidth/innerHeight,.01,1000);
const w3=W/10,h3=H/10;
const halfDiag=Math.sqrt(w3*w3+h3*h3)/2;
const dist=halfDiag/Math.tan(FOV/2*Math.PI/180)*1.25;
cam.position.set(0,0,dist);
function mkTex(data){
  return new Promise(res=>{
    if(!data){
      const c=document.createElement('canvas');c.width=c.height=4;
      const ctx=c.getContext('2d');ctx.fillStyle='#f2ede4';ctx.fillRect(0,0,4,4);
      res(new THREE.CanvasTexture(c));return;
    }
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      const t=new THREE.Texture(img);
      t.needsUpdate=true;t.generateMipmaps=true;
      t.minFilter=THREE.LinearMipmapLinearFilter;
      t.magFilter=THREE.LinearFilter;
      t.colorSpace=THREE.SRGBColorSpace;
      t.anisotropy=renderer.capabilities.getMaxAnisotropy();
      res(t);
    };
    img.src=data;
  });
}
const d=.018;
const edge=new THREE.MeshBasicMaterial({color:0xf2ede4});
const geo=new THREE.BoxGeometry(w3,h3,d);
let card;
async function showSheet(idx){
  if(card){scene.remove(card);card.material.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}
  const s=SHEETS[idx];
  const[t1,t2]=await Promise.all([mkTex(s.d1),mkTex(s.d2)]);
  const mats=[edge.clone(),edge.clone(),edge.clone(),edge.clone(),new THREE.MeshBasicMaterial({map:t1}),new THREE.MeshBasicMaterial({map:t2})];
  card=new THREE.Mesh(geo,mats);
  card.rotation.y=0.2;
  scene.add(card);
  if(TOTAL>1){
    document.getElementById('navLabel').textContent=(idx+1)+' / '+TOTAL;
    document.getElementById('prevBtn').disabled=idx===0;
    document.getElementById('nextBtn').disabled=idx===TOTAL-1;
  }
}
function goSheet(delta){
  const next=currentSheet+delta;
  if(next<0||next>=TOTAL)return;
  currentSheet=next;
  showSheet(currentSheet);
}
if(TOTAL>1){
  document.getElementById('prevBtn').addEventListener('click',()=>goSheet(-1));
  document.getElementById('nextBtn').addEventListener('click',()=>goSheet(1));
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){window.close();return;}
  if(e.key==='ArrowLeft')goSheet(-1);
  if(e.key==='ArrowRight')goSheet(1);
});
showSheet(0).then(()=>{
  const ctrl=new OrbitControls(cam,renderer.domElement);
  ctrl.enableDamping=true;ctrl.dampingFactor=.06;
  ctrl.autoRotate=true;ctrl.autoRotateSpeed=1.0;
  ctrl.minDistance=halfDiag*.5;ctrl.maxDistance=dist*3;
  renderer.domElement.addEventListener('pointerdown',()=>ctrl.autoRotate=false);
  (function animate(){requestAnimationFrame(animate);ctrl.update();renderer.render(scene,cam);})();
});
window.addEventListener('resize',()=>{
  cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
<\/script>
</body></html>`;

      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    };
    void buildPreview();
  };

  // Szöveg igazítás
  const setTextAlign = (align: string) => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj || obj.type !== 'i-text') return;
    (obj as fabric.IText).set('textAlign', align);
    fc!.renderAll();
    saveHistory(activeSide);
  };

  const isText = selectedObj?.type === 'i-text' || selectedObj?.type === 'text' || selectedObj?.type === 'textbox';
  const isImage = selectedObj?.type === 'image';
  const hasSelection = !!selectedObj && !(selectedObj as any).__guideHelper;

  // Számítsd ki a kiválasztott kép DPI-ját az aktuális méret alapján
  useEffect(() => {
    if (!isImage || !selectedObj) { setImageDpi(null); return; }
    const img = selectedObj as fabric.Image;
    const nativeW = img.width ?? 0;   // natív pixel szélesség
    const displayMm = (nativeW / (img.scaleX ?? 1) ) / MM_TO_PX * (img.scaleX ?? 1);
    // tényleges mm szélesség a nyomaton:
    const printMmW = ((img.width ?? 0) * (img.scaleX ?? 1)) / MM_TO_PX;
    if (printMmW > 0 && nativeW > 0) {
      const dpi = Math.round((nativeW / printMmW) * 25.4);
      setImageDpi(dpi);
    } else {
      setImageDpi(null);
    }
    void displayMm; // suppress unused warning
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImage, (selectedObj as any)?.scaleX, (selectedObj as any)?.width]);

  const activeFc = getActiveFabric();
  const currentObjects = activeSide === '1' ? objects1 : objects2;
  const hasActiveObjects = currentObjects.length > 0;
  // Side mode comes directly from params (synced via the useEffect below)
  const activeSideMode = activeSide === '1' ? params.side1_mode : params.side2_mode;
  const activeSideUnprinted = activeSideMode === 'none';
  const histIdx = activeSide === '1' ? histIdx1 : histIdx2;
  const histLen = activeSide === '1' ? history1.length : history2.length;

  // Keep prevMode refs in sync when user explicitly changes mode (via PrintParamsPanel service selection)
  useEffect(() => {
    if (params.side1_mode !== 'none') prevSide1ModeRef.current = params.side1_mode;
    if (params.side2_mode !== 'none') prevSide2ModeRef.current = params.side2_mode;
  }, [params.side1_mode, params.side2_mode]);

  // Guide + FoldLine overlay — rendered via a stable ref (never remounts → no flicker on mouse/object move)
  const dpr = window.devicePixelRatio || 1;
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // DPR-aware: canvas element is displayW*dpr × displayH*dpr, CSS size is displayW×displayH
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);

    // Bleed area fill (semi-transparent grey frame between sheet edge and cut line)
    const bleedDsp = BLEED_MM * displayScale;
    ctx.fillStyle = 'rgba(200,200,200,0.25)';
    ctx.fillRect(0, 0, displayW, bleedDsp);                                   // top strip
    ctx.fillRect(0, displayH - bleedDsp, displayW, bleedDsp);                 // bottom strip
    ctx.fillRect(0, bleedDsp, bleedDsp, displayH - 2 * bleedDsp);             // left strip
    ctx.fillRect(displayW - bleedDsp, bleedDsp, bleedDsp, displayH - 2 * bleedDsp); // right strip

    // Sheet edge (outer) — light grey solid
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(0.5, 0.5, displayW - 1, displayH - 1);

    // Cut / product edge (inner) — dark dashed (always visible)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(bleedDsp, bleedDsp, displayW - 2 * bleedDsp, displayH - 2 * bleedDsp);

    // Dimension labels on the cut area edges (always visible)
    ctx.save();
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${widthMmN} mm`, displayW / 2, bleedDsp - 3);
    ctx.save();
    ctx.translate(bleedDsp - 3, displayH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${heightMmN} mm`, 0, 0);
    ctx.restore();
    ctx.restore();

    // Draw guides (stored in cut-relative mm, offset by bleedDsp)
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const g of guides) {
      const px = g.mm * displayScale + bleedDsp;
      ctx.beginPath();
      if (g.axis === 'x') { ctx.moveTo(px, 0); ctx.lineTo(px, displayH); }
      else { ctx.moveTo(0, px); ctx.lineTo(displayW, px); }
      ctx.stroke();
    }
    // Draw fold lines
    ctx.strokeStyle = FOLD_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    for (const f of foldLines) {
      const px = f.mm * displayScale + bleedDsp;
      ctx.beginPath();
      if (f.axis === 'x') { ctx.moveTo(px, 0); ctx.lineTo(px, displayH); }
      else { ctx.moveTo(0, px); ctx.lineTo(displayW, px); }
      ctx.stroke();
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = FOLD_COLOR;
      ctx.font = '10px sans-serif';
      if (f.axis === 'x') {
        ctx.fillText(f.label, px + 3, 4);
      } else {
        ctx.fillText(f.label, 4, px - 3);
      }
      ctx.restore();
      ctx.strokeStyle = FOLD_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 4]);
    }
    // Origin marker at product bottom-left (cut area corner, 0;0)
    ctx.save();
    const OL = 10;
    const ox = bleedDsp;
    const oy = bleedDsp;
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ox + OL, oy); ctx.lineTo(ox, oy); ctx.lineTo(ox, oy + OL);
    ctx.stroke();
    ctx.fillStyle = '#1890ff';
    ctx.beginPath();
    ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayW, displayH, displayScale, params.width_mm, params.height_mm, guides, foldLines, dpr]);

  return (
    <>
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Lock overlay */}
      {locked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}>
          <LockOutlined style={{ fontSize: 48, color: '#fff' }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>A szerkesztő zárolva van</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Az admin engedlyezése szükséges a szerkesztéshez</Text>
        </div>
      )}
      {/* Left panel: Toolbox — collapsible */}
      <div style={{
        width: toolPanelOpen ? 220 : 28,
        flexShrink: 0,
        borderRight: '1px solid #e8e8e8',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Header + toggle */}
        <div style={{
          height: 36, flexShrink: 0, display: 'flex', alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          padding: toolPanelOpen ? '0 8px' : 0,
          justifyContent: toolPanelOpen ? 'space-between' : 'center',
        }}>
          {toolPanelOpen && (
            <Text strong style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>KELLÉKEK & RÉTEGEK</Text>
          )}
          <Button
            type="text" size="small"
            icon={toolPanelOpen ? <LeftOutlined /> : <RightOutlined />}
            onClick={() => setToolPanelOpen(v => !v)}
            style={{ padding: '0 4px', flexShrink: 0 }}
          />
        </div>
        {/* Collapsed strip */}
        {!toolPanelOpen && (
          <div
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={() => setToolPanelOpen(true)}
          >
            <span style={{
              writingMode: 'vertical-rl', textOrientation: 'mixed',
              transform: 'rotate(180deg)', fontSize: 11, color: '#bbb',
              userSelect: 'none', whiteSpace: 'nowrap',
            }}>Kelléktár</span>
          </div>
        )}
        {/* Expanded content */}
        {toolPanelOpen && editorMode === 'comment' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
            <CommentOutlined /> KOMMENT MÓD
          </Text>
          <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 10 }}>
            Kattints a vászonra jelölő elhelyezéséhez, húzz egy területet a kijelöléshez, vagy rajzolj nyilat az irány mutatásához.
          </Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>ESZKÖZ</Text>
          <Segmented
            size="small"
            block
            value={commentTool}
            onChange={v => setCommentTool(v as CommentTool)}
            options={[
              { value: 'area', label: 'Terület' },
              { value: 'pin', label: 'Jelölő' },
              { value: 'arrow', label: 'Nyíl' },
            ]}
            style={{ marginBottom: 10 }}
          />
          <Text strong style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>SZÍN</Text>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {COMMENT_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setCommentColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: commentColor === c ? '3px solid #333' : '3px solid transparent',
                  transition: 'border 0.15s',
                }}
              />
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Switch size="small" checked={commentLayerVisible} onChange={v => setCommentLayerVisible(v)} />
            <Text style={{ fontSize: 11 }}>Komment réteg látható</Text>
          </div>
        </div>
        )}
        {toolPanelOpen && editorMode === 'design' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>ELEMEK</Text>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <Tooltip title="Szöveg hozzáadása">
            <Button icon={<FontSizeOutlined />} onClick={addText} style={{ flex: 1 }} />
          </Tooltip>
          <Tooltip title="Téglalap hozzáadása">
            <Button icon={<BorderOutlined />} onClick={addRect} style={{ flex: 1 }} />
          </Tooltip>
          <Tooltip title="Kör hozzáadása">
            <Button onClick={addCircle} style={{ flex: 1 }}>○</Button>
          </Tooltip>
        </div>
        <Divider style={{ margin: '6px 0' }} />

          <Upload
            accept=".pdf,.svg,.jpg,.jpeg,.png,.webp"
            showUploadList={false}
            beforeUpload={handleImageUpload}
            disabled={false}
          >
            <div
              style={{
                border: `2px dashed ${uploadingFile ? '#d9d9d9' : '#1890ff'}`,
                borderRadius: 6,
                padding: '10px 8px',
                textAlign: 'center',
                background: uploadingFile ? '#fafafa' : '#f0f8ff',
                cursor: uploadingFile ? 'default' : 'pointer',
                color: uploadingFile ? '#aaa' : '#1890ff',
                fontSize: 12,
                transition: 'all 0.2s',
              }}
            >
              {uploadingFile
                ? <><LoadingOutlined /> Betöltés...</>
                : <><PictureOutlined /> Kép / PDF<br /><span style={{ fontSize: 11, color: '#888' }}>kattints vagy húzd ide</span></>
              }
            </div>
          </Upload>

        <Divider />
        <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>LAYEREK</Text>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {currentObjects.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>Nincs elem</Text>
          )}
          {(() => {
            const renderLayerIcon = (t: string | undefined) => {
              if (t === 'i-text' || t === 'textbox')
                return <span title="Szöveges" style={{ fontSize: 13, fontWeight: 700, color: '#1890ff', minWidth: 16 }}>T</span>;
              if (t === 'image')
                return <span title="Raszteres kép" style={{ fontSize: 13, minWidth: 16 }}>🖼</span>;
              if (t === 'rect')
                return <span title="Téglalap (vektor)" style={{ fontSize: 13, color: '#52c41a', minWidth: 16 }}>▭</span>;
              if (t === 'circle')
                return <span title="Kör (vektor)" style={{ fontSize: 13, color: '#52c41a', minWidth: 16 }}>◯</span>;
              if (t === 'triangle')
                return <span title="Háromszög (vektor)" style={{ fontSize: 13, color: '#52c41a', minWidth: 16 }}>△</span>;
              if (t === 'path' || t === 'polyline' || t === 'polygon')
                return <span title="Vektoros útvonal" style={{ fontSize: 13, color: '#722ed1', minWidth: 16 }}>✦</span>;
              if (t === 'group')
                return <span title="Csoport" style={{ fontSize: 13, color: '#fa8c16', minWidth: 16 }}>⊞</span>;
              return <span title={t} style={{ fontSize: 13, color: '#888', minWidth: 16 }}>◻</span>;
            };

            const renderObj = (obj: fabric.Object, idx: number, depth: number) => {
              const activeObj = activeFc?.getActiveObject();
              const isDirectActive = activeObj === obj;
              const isInSelection = !isDirectActive && activeObj?.type === 'activeSelection'
                && (activeObj as fabric.ActiveSelection).getObjects().includes(obj);
              const isActive = isDirectActive || isInSelection;
              const isGroup = obj.type === 'group';
              const isExpanded = expandedGroups.has(idx);
              return (
                <React.Fragment key={`layer-${depth}-${idx}`}>
                  <div
                    onClick={(e: React.MouseEvent) => {
                      const fc = activeFc;
                      if (!fc) return;
                      if (depth > 0) return; // Child inside a group — just select the parent group

                      const topObjs = [...currentObjects].reverse();
                      const clickedIdx = topObjs.indexOf(obj);

                      if (e.shiftKey && lastLayerClickRef.current >= 0) {
                        // Shift: range select from last click to current
                        const from = Math.min(lastLayerClickRef.current, clickedIdx);
                        const to = Math.max(lastLayerClickRef.current, clickedIdx);
                        const rangeObjs = topObjs.slice(from, to + 1).filter((o: any) => !o.__guideHelper);
                        if (rangeObjs.length > 1) {
                          fc.discardActiveObject();
                          const sel = new fabric.ActiveSelection(rangeObjs, { canvas: fc });
                          fc.setActiveObject(sel);
                        } else if (rangeObjs.length === 1) {
                          fc.setActiveObject(rangeObjs[0]);
                        }
                      } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd: toggle individual item in selection
                        const current = fc.getActiveObject();
                        if (!current) {
                          fc.setActiveObject(obj);
                        } else if (current.type === 'activeSelection') {
                          const sel = current as fabric.ActiveSelection;
                          if (sel.getObjects().includes(obj)) {
                            sel.removeWithUpdate(obj);
                            if (sel.getObjects().length === 1) {
                              fc.setActiveObject(sel.getObjects()[0]);
                            } else if (sel.getObjects().length === 0) {
                              fc.discardActiveObject();
                            }
                          } else {
                            sel.addWithUpdate(obj);
                          }
                        } else if (current === obj) {
                          fc.discardActiveObject();
                        } else {
                          const sel = new fabric.ActiveSelection([current, obj], { canvas: fc });
                          fc.setActiveObject(sel);
                        }
                      } else {
                        fc.setActiveObject(obj);
                      }
                      lastLayerClickRef.current = clickedIdx;
                      fc.renderAll();
                      setSelectedObj(fc.getActiveObject() ?? null);
                    }}
                    style={{
                      padding: '4px 8px', paddingLeft: 8 + depth * 16, cursor: 'pointer', borderRadius: 4,
                      background: isActive ? '#e6f4ff' : 'transparent',
                      fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 2,
                    }}
                  >
                    {isGroup && (
                      <span
                        style={{ cursor: 'pointer', fontSize: 10, color: '#fa8c16', minWidth: 12 }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setExpandedGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            return next;
                          });
                        }}
                      >
                        {isExpanded ? <DownOutlined /> : <RightOutlined />}
                      </span>
                    )}
                    {renderLayerIcon(obj.type)}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(obj as any).name || obj.type}
                    </span>
                    <span
                      title={(obj as any).__locked ? 'Feloldás' : 'Zárolás'}
                      style={{ cursor: 'pointer', opacity: 0.5, fontSize: 13, minWidth: 14 }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        const locked = !(obj as any).__locked;
                        (obj as any).__locked = locked;
                        obj.set({
                          lockMovementX: locked,
                          lockMovementY: locked,
                          lockRotation: locked,
                          lockScalingX: locked,
                          lockScalingY: locked,
                          hasControls: !locked,
                        } as any);
                        activeFc?.renderAll();
                        saveHistory(activeSide);
                        forceToolbarUpdate(t => t + 1);
                      }}
                    >
                      {(obj as any).__locked ? <LockOutlined style={{ color: '#e74c3c' }} /> : <UnlockOutlined />}
                    </span>
                    <span style={{ cursor: 'pointer', opacity: 0.5 }} onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      obj.set('visible', !obj.visible);
                      activeFc?.renderAll();
                      saveHistory(activeSide);
                    }}>
                      {obj.visible !== false ? '👁' : '🚫'}
                    </span>
                    {isGroup && (
                      <span
                        title="Csoportbontás"
                        style={{ cursor: 'pointer', color: '#fa8c16', fontSize: 13, lineHeight: 1, opacity: 0.7 }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          const fc = activeFc;
                          if (!fc) return;
                          fc.setActiveObject(obj);
                          ungroupSelected();
                        }}
                      >
                        <DisconnectOutlined />
                      </span>
                    )}
                    <span
                      title="Törlés"
                      style={{ cursor: 'pointer', color: '#ff4d4f', fontSize: 13, lineHeight: 1, opacity: 0.7 }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        const fc = activeFc;
                        if (!fc) return;
                        fc.remove(obj);
                        if (fc.getActiveObject() === obj) fc.discardActiveObject();
                        fc.renderAll();
                        updateObjects(activeSide);
                        saveHistory(activeSide);
                      }}
                    >
                      ✕
                    </span>
                  </div>
                  {isGroup && isExpanded && (obj as fabric.Group).getObjects().map((child, ci) =>
                    renderObj(child, idx * 1000 + ci, depth + 1)
                  )}
                </React.Fragment>
              );
            };

            return [...currentObjects].reverse().map((obj, i) => renderObj(obj, i, 0));
          })()}
        </div>

        {/* Guide management */}
        <Divider />
        <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>VONALZÓK</Text>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, flexShrink: 0, minWidth: 90 }}>Lapszegély snap:</Text>
          <Switch size="small" checked={snapEdgesEnabled} onChange={v => setSnapEdgesEnabled(v)} />
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, flexShrink: 0, minWidth: 90 }}>Guide snap:</Text>
          <Switch size="small" checked={snapEnabled} onChange={v => setSnapEnabled(v)} />
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <Select size="small" value={newGuideAxis} onChange={v => setNewGuideAxis(v)} style={{ width: 60 }}>
            <Option value="x">X │</Option>
            <Option value="y">Y —</Option>
          </Select>
          <InputNumber
            size="small" min={-BLEED_MM}
            max={newGuideAxis === 'x' ? params.width_mm + BLEED_MM : params.height_mm + BLEED_MM}
            step={0.5} addonAfter="mm" value={newGuideMm}
            onChange={v => v !== null && setNewGuideMm(v)}
            style={{ flex: 1 }}
          />
          <Button size="small" type="primary" onClick={() => addGuide(newGuideAxis, newGuideMm)}>+</Button>
        </div>
        <div style={{ maxHeight: 120, overflowY: 'auto' }}>
          {guides.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>Nincs guide — húzd a vonalzóról!</Text>}
          {guides.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 11, width: 18, color: GUIDE_COLOR, fontWeight: 700 }}>{g.axis.toUpperCase()}</Text>
              <InputNumber
                size="small" value={g.mm} step={0.5} min={-BLEED_MM}
                max={g.axis === 'x' ? params.width_mm + BLEED_MM : params.height_mm + BLEED_MM}
                onChange={v => v !== null && updateGuide(g.id, v)}
                style={{ flex: 1 }} addonAfter="mm"
              />
              <Button size="small" danger onClick={() => removeGuide(g.id)} style={{ padding: '0 4px' }}>×</Button>
            </div>
          ))}
        </div>

        {/* Fold line management */}
        <Divider />
        <Text strong style={{ fontSize: 12, color: FOLD_COLOR, display: 'block', marginBottom: 8 }}>HAJTÁSI VONALAK</Text>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <Select size="small" value={newFoldAxis} onChange={v => setNewFoldAxis(v)} style={{ width: 60 }}>
            <Option value="x">X │</Option>
            <Option value="y">Y —</Option>
          </Select>
          <InputNumber
            size="small" min={-BLEED_MM}
            max={newFoldAxis === 'x' ? params.width_mm + BLEED_MM : params.height_mm + BLEED_MM}
            step={0.5} addonAfter="mm" value={newFoldMm}
            onChange={v => v !== null && setNewFoldMm(v)}
            style={{ flex: 1 }}
          />
          <Button size="small" type="primary" style={{ background: FOLD_COLOR, borderColor: FOLD_COLOR }}
            onClick={() => addFoldLine(newFoldAxis, newFoldMm)}>+</Button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <Button size="small" block
            onClick={() => addFoldLine('x', parseFloat((params.width_mm / 2).toFixed(1)))}
          >½ szélesség ({(params.width_mm / 2).toFixed(1)}mm)</Button>
          <Button size="small" block
            onClick={() => addFoldLine('y', parseFloat((params.height_mm / 2).toFixed(1)))}
          >½ magasság</Button>
        </div>
        <div style={{ maxHeight: 120, overflowY: 'auto' }}>
          {foldLines.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>Nincs hajtási vonal</Text>}
          {foldLines.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 11, width: 18, color: FOLD_COLOR, fontWeight: 700 }}>{f.axis.toUpperCase()}</Text>
              <InputNumber
                size="small" value={f.mm} step={0.5} min={-BLEED_MM}
                max={f.axis === 'x' ? params.width_mm + BLEED_MM : params.height_mm + BLEED_MM}
                onChange={v => v !== null && updateFoldLine(f.id, v)}
                style={{ flex: 1 }} addonAfter="mm"
              />
              <Button size="small" danger onClick={() => removeFoldLine(f.id)} style={{ padding: '0 4px' }}>×</Button>
            </div>
          ))}
        </div>
        </div>
        )}
      </div>

      {/* Center: Canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top toolbar */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #e8e8e8',
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {/* Editor mode switcher */}
          {isAdmin && (
            <>
              <Segmented
                size="small"
                value={editorMode}
                onChange={v => setEditorMode(v as EditorMode)}
                options={[
                  { value: 'design', icon: <EditOutlined />, label: 'Szerkesztés' },
                  { value: 'comment', icon: <CommentOutlined />, label: <Badge count={commentAnnotations.filter(a => !a.resolved && a.side === activeSide).length} size="small" offset={[6, -2]}>Komment</Badge> },
                ]}
              />
              <Divider type="vertical" />
            </>
          )}

          {/* Undo/Redo — only in design mode */}
          {editorMode === 'design' && (
            <>
              <Tooltip title="Visszavon (Ctrl+Z)">
                <Button size="small" icon={<UndoOutlined />} disabled={histIdx <= 0} onClick={undo} />
              </Tooltip>
              <Tooltip title="Előre (Ctrl+Y)">
                <Button size="small" icon={<RedoOutlined />} disabled={histIdx >= histLen - 1} onClick={redo} />
              </Tooltip>
              <Divider type="vertical" />
            </>
          )}

          {/* Comment tools — only in comment mode */}
          {editorMode === 'comment' && (
            <>
              <Segmented
                size="small"
                value={commentTool}
                onChange={v => setCommentTool(v as CommentTool)}
                options={[
                  { value: 'area', label: 'Terület' },
                  { value: 'pin', label: 'Jelölő' },
                  { value: 'arrow', label: 'Nyíl' },
                ]}
              />
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {COMMENT_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => setCommentColor(c)}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: commentColor === c ? '2px solid #333' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
              <Tooltip title={commentLayerVisible ? 'Komment réteg elrejtése' : 'Komment réteg megjelenítése'}>
                <Button
                  size="small"
                  type={commentLayerVisible ? 'primary' : 'default'}
                  icon={<EyeOutlined />}
                  onClick={() => setCommentLayerVisible(v => !v)}
                />
              </Tooltip>
              <Divider type="vertical" />
            </>
          )}

          {/* Zoom controls */}
          <Tooltip title="Kicsinyít (Ctrl+görgő)">
            <Button size="small" icon={<ZoomOutOutlined />} disabled={zoomLevel <= ZOOM_MIN} onClick={zoomOut} />
          </Tooltip>
          <span
            style={{ fontSize: 12, minWidth: 40, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
            title="Kattints a 100%-ra visszaállításhoz"
            onClick={zoomFit}
          >
            {Math.round(zoomLevel * 100)}%
          </span>
          <Tooltip title="Nagyít (Ctrl+görgő)">
            <Button size="small" icon={<ZoomInOutlined />} disabled={zoomLevel >= ZOOM_MAX} onClick={zoomIn} />
          </Tooltip>
          <Tooltip title="Igazítás képernyőhöz">
            <Button size="small" icon={<FullscreenOutlined />} onClick={zoomFit} />
          </Tooltip>
          <Tooltip title="3D előnézet — új lapon, forgatható">
            <Button size="small" icon={<EyeOutlined />} onClick={handlePreview3D}>3D</Button>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Nyomdakész PDF letöltése (CMYK, vágójel, kifutó)">
              <Button size="small" icon={<FilePdfOutlined />} onClick={handleExportPrintPDF} style={{ color: '#d4380d' }}>
                PDF
              </Button>
            </Tooltip>
          )}
          {templateCategoryIds && templateCategoryIds.length > 0 && (
            <Tooltip title="Sablon betöltése">
              <Button size="small" icon={<AppstoreOutlined />} onClick={() => setTemplatePickerOpen(true)}>
                Sablonok
              </Button>
            </Tooltip>
          )}

          {/* Comment layer toggle — visible in both modes */}
          {isAdmin && commentAnnotations.length > 0 && editorMode === 'design' && (
            <Tooltip title={commentLayerVisible ? 'Kommentek elrejtése' : 'Kommentek megjelenítése'}>
              <Badge count={commentAnnotations.filter(a => !a.resolved && a.side === activeSide).length} size="small" offset={[-4, 0]}>
                <Button
                  size="small"
                  type={commentLayerVisible ? 'primary' : 'default'}
                  icon={<CommentOutlined />}
                  onClick={() => setCommentLayerVisible(v => !v)}
                />
              </Badge>
            </Tooltip>
          )}

          <Divider type="vertical" />

          {/* Obj pozíció kijelző */}
          {objPosMm && (
            <>
              <Text style={{ fontSize: 11, color: '#666' }}>
                X: <strong>{objPosMm.x.toFixed(1)}</strong> Y: <strong>{objPosMm.y.toFixed(1)}</strong>
                &nbsp; {objPosMm.w.toFixed(1)}×{objPosMm.h.toFixed(1)} mm
              </Text>
              <Divider type="vertical" />
            </>
          )}

          {/* Font selector (only for text) */}
          {isText && (
            <>
              <Select
                size="small"
                value={(selectedObj as fabric.IText)?.fontFamily ?? 'Arial'}
                onChange={async (v) => { await loadFont(v); updateProp('fontFamily', v); }}
                style={{ width: 150 }}
                showSearch
              >
                {GOOGLE_FONTS.map(f => {
                  const loaded = loadedFonts.has(f) || SYSTEM_FONTS.has(f);
                  const isHU   = huFonts.has(f);
                  return (
                    <Option key={f} value={f} style={{ fontFamily: loaded ? f : undefined }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ flex: 1 }}>{f}</span>
                        {!loaded
                          ? <span style={{ fontSize: 10, color: '#d9d9d9', fontFamily: 'sans-serif', flexShrink: 0 }}>...</span>
                          : isHU
                            ? <span style={{ fontSize: 10, color: '#52c41a', fontFamily: 'sans-serif', fontWeight: 600, flexShrink: 0 }} title="Magyar betűk (ő ű ö ü) valódi glifák vannak">HU ✓</span>
                            : <span style={{ fontSize: 10, color: '#ff4d4f', fontFamily: 'sans-serif', flexShrink: 0 }} title="ő ű nem található ebben a fontban — a böngésző más fontot használ">no HU</span>
                        }
                      </span>
                    </Option>
                  );
                })}
              </Select>
              <InputNumber
                size="small"
                min={6} max={200}
                value={(selectedObj as fabric.IText)?.fontSize ?? 16}
                onChange={v => updateProp('fontSize', v)}
                style={{ width: 70 }}
                addonAfter="pt"
              />
              <Tooltip title="Félkövér">
                <Button
                  size="small" icon={<BoldOutlined />}
                  type={(selectedObj as fabric.IText)?.fontWeight === 'bold' ? 'primary' : 'default'}
                  onClick={() => updateProp('fontWeight',
                    (selectedObj as fabric.IText)?.fontWeight === 'bold' ? 'normal' : 'bold'
                  )}
                />
              </Tooltip>
              <Tooltip title="Dőlt">
                <Button
                  size="small" icon={<ItalicOutlined />}
                  type={(selectedObj as fabric.IText)?.fontStyle === 'italic' ? 'primary' : 'default'}
                  onClick={() => updateProp('fontStyle',
                    (selectedObj as fabric.IText)?.fontStyle === 'italic' ? 'normal' : 'italic'
                  )}
                />
              </Tooltip>
              <Tooltip title="Bal igazítás">
                <Button size="small" icon={<AlignLeftOutlined />} onClick={() => setTextAlign('left')} />
              </Tooltip>
              <Tooltip title="Közép">
                <Button size="small" icon={<AlignCenterOutlined />} onClick={() => setTextAlign('center')} />
              </Tooltip>
              <Tooltip title="Jobb igazítás">
                <Button size="small" icon={<AlignRightOutlined />} onClick={() => setTextAlign('right')} />
              </Tooltip>
              <Divider type="vertical" />
            </>
          )}

          {/* DPI kijelző kiválasztott képnél */}
          {isImage && imageDpi !== null && (
            <>
              <Divider type="vertical" />
              <Tooltip title={
                imageDpi >= 300 ? 'Kitűnő minőség (≥300 DPI)'
                : imageDpi >= 200 ? 'Elfogadható minőség (200–299 DPI)'
                : imageDpi >= 150 ? 'Alacsony minőség (150–199 DPI) — nyomtatáshoz kockázatos'
                : 'Nagyon alacsony minőség (&lt;150 DPI) — valószínűleg pixeles lesz'
              }>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background:
                    imageDpi >= 300 ? '#f6ffed' :
                    imageDpi >= 200 ? '#fffbe6' :
                    '#fff1f0',
                  color:
                    imageDpi >= 300 ? '#52c41a' :
                    imageDpi >= 200 ? '#d46b08' :
                    '#cf1322',
                  border: '1px solid',
                  borderColor:
                    imageDpi >= 300 ? '#b7eb8f' :
                    imageDpi >= 200 ? '#ffd591' :
                    '#ffa39e',
                  cursor: 'default',
                }}>
                  {imageDpi} DPI{' '}
                  {imageDpi >= 300 ? '✅' : imageDpi >= 200 ? '⚠️' : '❌'}
                </span>
              </Tooltip>
            </>
          )}

          {/* Color picker */}
          {hasSelection && (
            <>
              <Tooltip title={isText ? 'Betűszín' : 'Kitöltés'}>
                <Popover
                  trigger="click"
                  content={
                    <input
                      type="color"
                      value={(selectedObj as any)?.fill ?? '#000000'}
                      onChange={e => updateProp('fill', e.target.value)}
                      style={{ width: 100, height: 40, cursor: 'pointer' }}
                    />
                  }
                >
                  <Button
                    size="small"
                    icon={<BgColorsOutlined />}
                    style={{ color: (selectedObj as any)?.fill ?? '#000' }}
                  >
                    {isText ? 'Szín' : 'Kitöltés'}
                  </Button>
                </Popover>
              </Tooltip>
              {!isText && (
                <Tooltip title="Keret szín">
                  <Popover
                    trigger="click"
                    content={
                      <input
                        type="color"
                        value={(selectedObj as any)?.stroke ?? '#000000'}
                        onChange={e => updateProp('stroke', e.target.value)}
                        style={{ width: 100, height: 40, cursor: 'pointer' }}
                      />
                    }
                  >
                    <Button size="small">Keret</Button>
                  </Popover>
                </Tooltip>
              )}
              {/* Átlátszóság */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12 }}>Átl:</Text>
                <Slider
                  min={0} max={1} step={0.05}
                  value={(selectedObj as any)?.opacity ?? 1}
                  onChange={v => updateProp('opacity', v)}
                  style={{ width: 80 }}
                />
              </div>
              <Divider type="vertical" />
              <Tooltip title="Lapszélig húzás — arányosan illeszti a lapszélhez (contain)">
                <Button size="small" icon={<CompressOutlined />} onClick={fitToPage} />
              </Tooltip>
              <Tooltip title="Lap kitöltése — arányosan kitölti az egész lapot (cover)">
                <Button size="small" icon={<ExpandOutlined />} onClick={fillPage} />
              </Tooltip>
              <Tooltip title="Duplikál">
                <Button size="small" icon={<CopyOutlined />} onClick={duplicateSelected} />
              </Tooltip>
              <Tooltip title="Előre hoz">
                <Button size="small" icon={<VerticalAlignTopOutlined />} onClick={bringToFront} />
              </Tooltip>
              <Tooltip title="Hátra küld">
                <Button size="small" icon={<VerticalAlignBottomOutlined />} onClick={sendToBack} />
              </Tooltip>
              {selectedObj?.type === 'group' && (
                <Tooltip title="Csoportbontás">
                  <Button size="small" icon={<DisconnectOutlined />} onClick={ungroupSelected} />
                </Tooltip>
              )}
              {selectedObj?.type === 'activeSelection' && (
                <Tooltip title="Csoportosítás">
                  <Button size="small" icon={<BlockOutlined />} onClick={groupSelected} />
                </Tooltip>
              )}
              <Tooltip title="Töröl">
                <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSelected} />
              </Tooltip>
            </>
          )}
        </div>

        {/* Canvas + oldal váltó */}
        <div
          ref={canvasAreaRef}
          style={{ flex: 1, overflow: zoomLevel > 1 ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: zoomLevel > 1 ? 'flex-start' : 'center', padding: 16, background: isDragOver ? '#dbeeff' : '#f0f2f5', position: 'relative', transition: 'background 0.15s' }}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={e => { if (!canvasAreaRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleImageUpload(file);
          }}
        >
          {/* Drag overlay hint */}
          {isDragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(24,144,255,0.12)',
              border: '3px dashed #1890ff',
              borderRadius: 8,
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 20, color: '#1890ff', fontWeight: 600 }}>
                <PictureOutlined style={{ marginRight: 8 }} />Engedd el a fájlt az elhelyezéshez
              </span>
            </div>
          )}
          {/* Sheet tabs for multi-sheet */}
          {sheetCount > 1 && (
            <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {Array.from({ length: sheetCount }, (_, i) => (
                <Button
                  key={i}
                  size="small"
                  type={activeSheet === i ? 'primary' : 'default'}
                  onClick={() => handleSheetChange(i)}
                >
                  {i + 1}. lap
                </Button>
              ))}
              {onParamsChange && (
                <>
                  <Tooltip title="Lap hozzáadása">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => {
                      saveCurrentSheetDesign();
                      onParamsChange({ ...params, sheet_count: sheetCount + 1 });
                    }} />
                  </Tooltip>
                  {sheetCount > 1 && (
                    <Tooltip title="Utolsó lap törlése">
                      <Popconfirm title={`Biztosan törlöd a(z) ${sheetCount}. lapot?`} okText="Törlés" cancelText="Mégse" onConfirm={() => {
                        const delIdx = sheetCount - 1;
                        // Remove design data
                        delete sheetDesignsRef.current[delIdx];
                        // Switch if currently on deleted sheet
                        if (activeSheet >= delIdx) {
                          const newActive = Math.max(0, delIdx - 1);
                          setActiveSheet(newActive);
                          loadSheetDesign(newActive);
                        }
                        onParamsChange({ ...params, sheet_count: sheetCount - 1 });
                      }}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          )}
          {params.sides === '2' && (
            <div style={{ marginBottom: 8 }}>
              <Space.Compact>
                <Button
                  type={activeSide === '1' ? 'primary' : 'default'}
                  icon={<LeftOutlined />}
                  onClick={() => setActiveSide('1')}
                >
                  Cím oldal
                </Button>
                <Button
                  type={activeSide === '2' ? 'primary' : 'default'}
                  onClick={() => setActiveSide('2')}
                >
                  Hátoldal <RightOutlined />
                </Button>
              </Space.Compact>
            </div>
          )}

          {/* Ruler + canvas area */}
          <div style={{ display: 'inline-flex', flexDirection: 'column', userSelect: 'none' }}>
            {/* Top row: corner + horizontal ruler */}
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {/* Corner cell — jelzi a (0,0) = nyomat bal felső sarkát */}
              <div
                title="(0, 0) = a nyomat bal felső sarka"
                style={{
                  width: RULER_SIZE, height: RULER_SIZE, flexShrink: 0,
                  background: '#e6f4ff', border: '1px solid #1890ff',
                  borderRight: 'none', borderBottom: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'block' }}>
                  <path d="M9 1 L1 1 L1 9" stroke="#1890ff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="1" cy="1" r="1.5" fill="#1890ff" />
                </svg>
              </div>
              {/* Horizontal ruler (X) */}
              <div
                onMouseDown={handleRulerMouseDown('x')}
                title="Húzd le új függőleges guide-hoz"
              >
                <CanvasRuler
                  direction="h"
                  totalMm={sheetW_mm}
                  scale={displayScale}
                  size={RULER_SIZE}
                  cursorMm={cursorMm.x}
                  offsetMm={-BLEED_MM}
                />
              </div>
            </div>

            {/* Bottom row: vertical ruler + canvas */}
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {/* Vertical ruler (Y) */}
              <div
                onMouseDown={handleRulerMouseDown('y')}
                title="Húzd jobbra új vízszintes guide-hoz"
              >
                <CanvasRuler
                  direction="v"
                  totalMm={sheetH_mm}
                  scale={displayScale}
                  size={RULER_SIZE}
                  cursorMm={cursorMm.y}
                  offsetMm={-BLEED_MM}
                />
              </div>

              {/* Canvas wrappers */}
              <div
                ref={canvasWrapperRef}
                style={{
                  position: 'relative',
                  cursor: draggingItem
                    ? (draggingItem.axis === 'x' ? 'ew-resize' : 'ns-resize')
                    : 'default',
                }}
                onMouseMove={handleWrapperMouseMove}
                onMouseUp={handleWrapperMouseUp}
                onMouseLeave={handleWrapperMouseUp}
              >
                <canvas
                  ref={overlayCanvasRef}
                  width={Math.round(displayW * dpr)}
                  height={Math.round(displayH * dpr)}
                  style={{ position: 'absolute', top: 0, left: 0, width: displayW, height: displayH, pointerEvents: 'none', zIndex: 20 }}
                />
                {/* Hit zones: guides */}
                {guides.map(g => {
                  const px = g.mm * displayScale + BLEED_MM * displayScale;
                  return (
                    <div
                      key={`g-${g.id}`}
                      style={{
                        position: 'absolute',
                        top: g.axis === 'y' ? px - GUIDE_HIT_PX : 0,
                        left: g.axis === 'x' ? px - GUIDE_HIT_PX : 0,
                        width: g.axis === 'x' ? GUIDE_HIT_PX * 2 : displayW,
                        height: g.axis === 'y' ? GUIDE_HIT_PX * 2 : displayH,
                        cursor: g.axis === 'x' ? 'ew-resize' : 'ns-resize',
                        zIndex: 12,
                        background: draggingItem?.id === g.id && draggingItem.type === 'guide'
                          ? 'rgba(24,144,255,0.08)' : 'transparent',
                      }}
                      onMouseDown={e => { e.stopPropagation(); setDraggingItem({ id: g.id, axis: g.axis, type: 'guide' }); }}
                    />
                  );
                })}
                {/* Hit zones: fold lines */}
                {foldLines.map(f => {
                  const px = f.mm * displayScale + BLEED_MM * displayScale;
                  return (
                    <div
                      key={`f-${f.id}`}
                      style={{
                        position: 'absolute',
                        top: f.axis === 'y' ? px - GUIDE_HIT_PX : 0,
                        left: f.axis === 'x' ? px - GUIDE_HIT_PX : 0,
                        width: f.axis === 'x' ? GUIDE_HIT_PX * 2 : displayW,
                        height: f.axis === 'y' ? GUIDE_HIT_PX * 2 : displayH,
                        cursor: f.axis === 'x' ? 'ew-resize' : 'ns-resize',
                        zIndex: 12,
                        background: draggingItem?.id === f.id && draggingItem.type === 'fold'
                          ? 'rgba(250,140,22,0.08)' : 'transparent',
                      }}
                      onMouseDown={e => { e.stopPropagation(); setDraggingItem({ id: f.id, axis: f.axis, type: 'fold' }); }}
                    />
                  );
                })}
                <div
                  style={{
                    display: activeSide === '1' ? 'block' : 'none',
                    width: displayW, height: displayH,
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    background: '#fff',
                    filter: params.side1_mode === 'bw' ? 'grayscale(1)' : undefined,
                  }}
                >
                  <canvas ref={canvasRef1} />
                </div>
                {params.sides === '2' && (
                  <div
                    style={{
                      display: activeSide === '2' ? 'block' : 'none',
                      width: displayW, height: displayH,
                      overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      background: '#fff',
                      filter: params.side2_mode === 'bw' ? 'grayscale(1)' : undefined,
                    }}
                  >
                    <canvas ref={canvasRef2} />
                  </div>
                )}
                {/* Nyomatlan overlay — szerkesztő UI csak, PDF/3D előnézetben NEM jelenik meg */}
                {activeSideUnprinted && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 25,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(245,245,245,0.45)',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      fontSize: Math.max(28, Math.min(displayW, displayH) / 4),
                      fontWeight: 900,
                      color: 'rgba(0,0,0,0.09)',
                      letterSpacing: 8,
                      transform: 'rotate(-30deg)',
                      textTransform: 'uppercase',
                      fontFamily: 'sans-serif',
                      display: 'block',
                    }}>NYOMATLAN</span>
                    {hasActiveObjects && (
                      <div style={{
                        marginTop: 16,
                        background: 'rgba(255,165,0,0.9)', color: '#fff',
                        padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        transform: 'rotate(0deg)',
                      }}>
                        {currentObjects.length} objektum van az oldalon — váltsd vissza a nyomtatást a megőrzéshez
                      </div>
                    )}
                  </div>
                )}
                {/* Empty side warning — when side has print mode set but no objects */}
                {!activeSideUnprinted && !hasActiveObjects && (
                  <div style={{
                    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 26, pointerEvents: 'none',
                    background: 'rgba(255,165,0,0.85)', color: '#fff',
                    padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    Nincs objektum ezen az oldalon — nyomatlan marad
                  </div>
                )}
                {/* ── Comment annotations overlay ── */}
                {commentLayerVisible && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
                    {commentAnnotations
                      .filter(a => a.side === activeSide && !a.resolved)
                      .map(ann => {
                        const sx = ann.x * scale;
                        const sy = ann.y * scale;
                        if (ann.type === 'pin') {
                          return (
                            <div key={ann.id} style={{ position: 'absolute', left: sx - COMMENT_PIN_RADIUS, top: sy - COMMENT_PIN_RADIUS, pointerEvents: 'auto' }}>
                              <Tooltip title={ann.text || '(nincs szöveg)'}>
                                <div
                                  onClick={() => { setEditingCommentId(ann.id); setCommentTextDraft(ann.text); }}
                                  style={{
                                    width: COMMENT_PIN_RADIUS * 2, height: COMMENT_PIN_RADIUS * 2,
                                    borderRadius: '50%', background: ann.color,
                                    border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, color: '#fff', fontWeight: 700,
                                  }}
                                >
                                  <CommentOutlined />
                                </div>
                              </Tooltip>
                            </div>
                          );
                        }
                        if (ann.type === 'area' && ann.width && ann.height) {
                          const sw = ann.width * scale;
                          const sh = ann.height * scale;
                          return (
                            <div key={ann.id} style={{ position: 'absolute', left: sx, top: sy, pointerEvents: 'auto' }}>
                              <Tooltip title={ann.text || '(nincs szöveg)'}>
                                <div
                                  onClick={() => { setEditingCommentId(ann.id); setCommentTextDraft(ann.text); }}
                                  style={{
                                    width: sw, height: sh,
                                    border: `2px solid ${ann.color}`,
                                    background: `${ann.color}11`,
                                    borderRadius: 3, cursor: 'pointer',
                                  }}
                                >
                                  <span style={{
                                    position: 'absolute', top: -18, left: 0,
                                    fontSize: 10, background: ann.color,
                                    color: '#fff', padding: '1px 6px', borderRadius: 3,
                                    whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}>
                                    {ann.text || '...'}
                                  </span>
                                </div>
                              </Tooltip>
                            </div>
                          );
                        }
                        if (ann.type === 'arrow' && ann.x2 != null && ann.y2 != null) {
                          const ex = ann.x2 * scale;
                          const ey = ann.y2 * scale;
                          const angle = Math.atan2(ey - sy, ex - sx);
                          const headLen = 14;
                          return (
                            <Tooltip key={ann.id} title={ann.text || '(nincs szöveg)'}>
                              <svg
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
                              >
                                <defs>
                                  <marker id={`ah-${ann.id}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill={ann.color} />
                                  </marker>
                                </defs>
                                <line
                                  x1={sx} y1={sy} x2={ex} y2={ey}
                                  stroke={ann.color} strokeWidth={2.5} markerEnd={`url(#ah-${ann.id})`}
                                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                  onClick={() => { setEditingCommentId(ann.id); setCommentTextDraft(ann.text); }}
                                />
                                {/* Wider invisible stroke for easier click target */}
                                <line
                                  x1={sx} y1={sy} x2={ex} y2={ey}
                                  stroke="transparent" strokeWidth={12}
                                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                  onClick={() => { setEditingCommentId(ann.id); setCommentTextDraft(ann.text); }}
                                />
                                {/* Label near midpoint */}
                                {ann.text && (
                                  <foreignObject
                                    x={(sx + ex) / 2 - 60} y={(sy + ey) / 2 - 10}
                                    width={120} height={20}
                                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                                  >
                                    <div style={{
                                      fontSize: 10, background: ann.color, color: '#fff',
                                      padding: '1px 6px', borderRadius: 3, textAlign: 'center',
                                      whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                      {ann.text}
                                    </div>
                                  </foreignObject>
                                )}
                              </svg>
                            </Tooltip>
                          );
                        }
                        return null;
                      })}
                    {/* Draft annotation being drawn */}
                    {newCommentDraft && newCommentDraft.type === 'area' && newCommentDraft.width && newCommentDraft.height && (
                      <div style={{
                        position: 'absolute',
                        left: newCommentDraft.x * scale,
                        top: newCommentDraft.y * scale,
                        width: newCommentDraft.width * scale,
                        height: newCommentDraft.height * scale,
                        border: `2px dashed ${commentColor}`,
                        background: `${commentColor}11`,
                        borderRadius: 3,
                        pointerEvents: 'none',
                      }} />
                    )}
                    {/* Draft arrow being drawn */}
                    {newCommentDraft && newCommentDraft.type === 'arrow' && newCommentDraft.x2 != null && newCommentDraft.y2 != null && (
                      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                        <defs>
                          <marker id="ah-draft" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill={commentColor} />
                          </marker>
                        </defs>
                        <line
                          x1={newCommentDraft.x * scale} y1={newCommentDraft.y * scale}
                          x2={newCommentDraft.x2 * scale} y2={newCommentDraft.y2 * scale}
                          stroke={commentColor} strokeWidth={2.5} strokeDasharray="6 3"
                          markerEnd="url(#ah-draft)"
                        />
                      </svg>
                    )}
                  </div>
                )}
                {/* Comment interaction overlay — captures mouse events in comment mode */}
                {editorMode === 'comment' && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 35,
                      cursor: 'crosshair',
                    }}
                    onMouseDown={handleCommentMouseDown}
                    onMouseMove={handleCommentMouseMove}
                    onMouseUp={handleCommentMouseUp}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Info legend */}
          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ color: '#bbb' }}>Lap: {sheetW_mm.toFixed(1)}×{sheetH_mm.toFixed(1)}mm</span>
            <span style={{ color: '#333' }}>Vágott: {widthMmN}×{heightMmN}mm</span>
            <span>Kifutó: {BLEED_MM}mm — {params.quantity} db</span>
            {snapEnabled && <span style={{ color: GUIDE_COLOR }}>Snap: BE</span>}
            {cursorMm.x !== null && cursorMm.y !== null && (
              <span style={{ color: '#1890ff', fontWeight: 600, fontFamily: 'monospace' }}>
                X: {cursorMm.x.toFixed(1)} &nbsp; Y: {cursorMm.y.toFixed(1)} mm
              </span>
            )}
          </div>
        </div>

        {/* ── Comment text input popover (new or editing) ── */}
        {(newCommentDraft || editingCommentId) && editorMode === 'comment' && (
          <div style={{
            position: 'absolute', bottom: 60, right: 16, zIndex: 100,
            background: '#fff', borderRadius: 8, padding: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)', width: 280,
            border: `2px solid ${editingCommentId ? (commentAnnotations.find(a => a.id === editingCommentId)?.color ?? '#1890ff') : commentColor}`,
          }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
              {editingCommentId ? 'Komment szerkesztése' : 'Új komment'}
            </Text>
            <Input.TextArea
              autoFocus
              rows={3}
              placeholder="Írd ide a kommentet…"
              value={commentTextDraft}
              onChange={e => setCommentTextDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (editingCommentId) {
                    updateCommentText(editingCommentId, commentTextDraft);
                    setEditingCommentId(null); setCommentTextDraft('');
                  } else {
                    confirmNewComment();
                  }
                }
              }}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {editingCommentId && (
                <>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteComment(editingCommentId!)}>
                    Törlés
                  </Button>
                  <Button size="small" icon={<CheckOutlined />} onClick={() => resolveComment(editingCommentId!)}>
                    Megoldva
                  </Button>
                </>
              )}
              <Button size="small" onClick={() => { if (editingCommentId) { setEditingCommentId(null); setCommentTextDraft(''); } else { cancelNewComment(); } }}>
                Mégse
              </Button>
              <Button size="small" type="primary" onClick={() => {
                if (editingCommentId) {
                  updateCommentText(editingCommentId, commentTextDraft);
                  setEditingCommentId(null); setCommentTextDraft('');
                } else {
                  confirmNewComment();
                }
              }}>
                Mentés
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
              Ctrl+Enter: mentés
            </Text>
          </div>
        )}

        {/* ── Comment list panel (right sidebar when in comment mode) ── */}
        {editorMode === 'comment' && (
          <div style={{
            position: 'absolute', top: 50, right: 0, bottom: 0, width: 260,
            background: '#fafafa', borderLeft: '1px solid #e8e8e8',
            overflowY: 'auto', padding: 10, zIndex: 50,
          }}>
            <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
              KOMMENTEK ({commentAnnotations.filter(a => a.side === activeSide && !a.resolved).length})
            </Text>
            {commentAnnotations.filter(a => a.side === activeSide && !a.resolved).length === 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                Nincs komment ezen az oldalon. Kattints vagy húzz egy területet a vásznon.
              </Text>
            )}
            {commentAnnotations
              .filter(a => a.side === activeSide)
              .sort((a, b) => b.timestamp - a.timestamp)
              .map(ann => (
                <div
                  key={ann.id}
                  style={{
                    background: ann.resolved ? '#f5f5f5' : '#fff',
                    border: `1px solid ${ann.resolved ? '#d9d9d9' : ann.color}`,
                    borderRadius: 6, padding: 8, marginBottom: 6,
                    opacity: ann.resolved ? 0.6 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (!ann.resolved) {
                      setEditingCommentId(ann.id);
                      setCommentTextDraft(ann.text);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ann.color, flexShrink: 0 }} />
                    <Text style={{ fontSize: 11, color: '#888', flex: 1 }}>
                      {ann.type === 'pin' ? 'Jelölő' : ann.type === 'arrow' ? 'Nyíl' : 'Terület'} — {new Date(ann.timestamp).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {ann.resolved && <CheckOutlined style={{ color: '#52c41a', fontSize: 12 }} />}
                  </div>
                  <Text style={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap' }}>
                    {ann.text || <span style={{ color: '#ccc', fontStyle: 'italic' }}>(üres)</span>}
                  </Text>
                  {!ann.resolved && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <Button size="small" type="text" icon={<CheckOutlined />} onClick={e => { e.stopPropagation(); resolveComment(ann.id); }} style={{ fontSize: 10, color: '#52c41a' }}>
                        Megoldva
                      </Button>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e => { e.stopPropagation(); deleteComment(ann.id); }} style={{ fontSize: 10 }}>
                        Törlés
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {commentAnnotations.some(a => a.side === activeSide && a.resolved) && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
                  MEGOLDOTT
                </Text>
              </>
            )}
          </div>
        )}
      </div>

    </div>

      {/* ===== PDF import dialog ===== */}
      {pdfDialog && (() => {
        const dlg = pdfDialog;
        return (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) setPdfDialog(null); }}
        >
          <div style={{
            background: '#fff', borderRadius: 8, padding: 24, width: 640,
            maxHeight: '88vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>PDF importálás</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              A PDF mérete <strong>{dlg.widthMm} × {dlg.heightMm} mm</strong>,{' '}
              <strong>{dlg.pageCount}</strong> oldal.
              {' '}A jelenlegi felület: <strong>{params.width_mm} × {params.height_mm} mm</strong>,{' '}
              <strong>{params.sides}</strong> oldal.
            </div>

            {/* Mode selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div
                onClick={() => setPdfDialog(prev => prev ? { ...prev, mode: 'single' } : null)}
                style={{
                  flex: 1, padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                  border: `2px solid ${dlg.mode === 'single' ? '#1890ff' : '#d9d9d9'}`,
                  background: dlg.mode === 'single' ? '#e6f4ff' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>Oldal beillesztése a canvasra</div>
                <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                  Egy PDF-oldalt képként helyez el a jelenlegi ({params.width_mm}×{params.height_mm}mm) felületen.
                </div>
              </div>
              <div
                onClick={() => setPdfDialog(prev => prev ? { ...prev, mode: 'full' } : null)}
                style={{
                  flex: 1, padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                  border: `2px solid ${dlg.mode === 'full' ? '#1890ff' : '#d9d9d9'}`,
                  background: dlg.mode === 'full' ? '#e6f4ff' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>Betöltés eredeti mérettel</div>
                <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                  A felület átméretezése {dlg.widthMm}×{dlg.heightMm}mm,{' '}
                  {Math.min(dlg.pageCount, 2)} oldal. Az eddigi terv törlődik.
                </div>
              </div>
              <div
                onClick={() => setPdfDialog(prev => prev ? { ...prev, mode: 'layered' } : null)}
                style={{
                  flex: 1, minWidth: 180, padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                  border: `2px solid ${dlg.mode === 'layered' ? '#52c41a' : '#d9d9d9'}`,
                  background: dlg.mode === 'layered' ? '#f6ffed' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>Elemekre bontva</div>
                <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                  A szövegtömbök külön mozgatható objektumként kerülnek a canvasra,
                  a grafikai elemek háttérképként.
                </div>
              </div>
              <div
                onClick={() => setPdfDialog(prev => prev ? { ...prev, mode: 'svg' } : null)}
                style={{
                  flex: 1, minWidth: 180, padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                  border: `2px solid ${dlg.mode === 'svg' ? '#722ed1' : '#d9d9d9'}`,
                  background: dlg.mode === 'svg' ? '#f9f0ff' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>SVG — vektoros</div>
                <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                  Szerver-oldali konverzió (pdftocairo): vektoros vonalak,
                  körvonalazott szövegek mind megmaradnak csökkenés nélkül.
                </div>
              </div>
            </div>

            {/* Page picker (single + layered + svg mode) */}
            {(dlg.mode === 'single' || dlg.mode === 'layered' || dlg.mode === 'svg') && (
              <>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
                  Válassz oldalt:{' '}
                  {dlg.thumbsLoading && (
                    <span style={{ fontSize: 11, color: '#999' }}>
                      {dlg.thumbs.length}/{dlg.pageCount} oldal betöltve…
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 340, overflowY: 'auto' }}>
                  {dlg.thumbs.map((thumb, idx) => {
                    const page = idx + 1;
                    const selected = dlg.selectedPage === page;
                    return (
                      <div
                        key={page}
                        onClick={() => setPdfDialog(prev => prev ? { ...prev, selectedPage: page } : null)}
                        style={{
                          cursor: 'pointer', borderRadius: 4, padding: 4,
                          border: `3px solid ${selected ? '#1890ff' : '#d9d9d9'}`,
                          background: selected ? '#e6f4ff' : '#fafafa',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}
                      >
                        <img
                          src={thumb}
                          alt={`${page}. oldal`}
                          style={{ maxWidth: 110, maxHeight: 150, display: 'block', borderRadius: 2 }}
                        />
                        <span style={{ fontSize: 11, marginTop: 4, color: selected ? '#1890ff' : '#555' }}>
                          {page}. oldal
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setPdfDialog(null)}
                style={{
                  padding: '6px 18px', borderRadius: 6, border: '1px solid #d9d9d9',
                  background: '#fff', cursor: 'pointer', fontSize: 13,
                }}
              >
                Mégse
              </button>
              <button
                onClick={handlePdfDialogOk}
                disabled={pdfDialogWorking}
                style={{
                  padding: '6px 18px', borderRadius: 6, border: 'none',
                  background: pdfDialogWorking ? '#a0c4ff' : '#1890ff',
                  color: '#fff', cursor: pdfDialogWorking ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                {pdfDialogWorking ? 'Betöltés…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

  <TemplatePicker
    open={templatePickerOpen}
    onClose={() => setTemplatePickerOpen(false)}
    onSelect={(file) => {
      setTemplatePickerOpen(false);
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        placePdfDecomposed(file);
      } else {
        handleImageUpload(file);
      }
    }}
    categoryIds={templateCategoryIds}
  />
  </>
  );
});

Step2CanvasEditor.displayName = 'Step2CanvasEditor';
export default Step2CanvasEditor;
