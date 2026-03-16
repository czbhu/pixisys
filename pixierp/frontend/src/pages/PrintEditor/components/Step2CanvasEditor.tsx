import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Button, Space, Tooltip, Select, InputNumber, Popover, Divider,
  Upload, message, Slider, Typography, Switch,
} from 'antd';
import {
  UndoOutlined, RedoOutlined, DeleteOutlined, BoldOutlined,
  ItalicOutlined, FontSizeOutlined, BgColorsOutlined, PictureOutlined,
  AlignLeftOutlined, AlignCenterOutlined,
  AlignRightOutlined, CopyOutlined, VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined, BorderOutlined, LeftOutlined,
  RightOutlined, LoadingOutlined, ZoomInOutlined, ZoomOutOutlined,
  FullscreenOutlined, LockOutlined, CompressOutlined, ExpandOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import CanvasRuler from './CanvasRuler';
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
const SAFE_MM = 3;
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

interface Props {
  params: PrintParams;
  isAdmin: boolean;
  priceBreakdown: any;
  leftOffset?: number;
  locked?: boolean;
  onParamsChange?: (p: PrintParams) => void;
  initialDesign?: { d1: any; d2: any } | null;
  onDesignChange?: (d1: any, d2: any) => void;
}

type Side = '1' | '2';

const Step2CanvasEditor = forwardRef<CanvasEditorHandle, Props>((
  { params, isAdmin, priceBreakdown, leftOffset = 0, locked = false, onParamsChange, initialDesign, onDesignChange }, ref
) => {
  const canvasRef1 = useRef<HTMLCanvasElement>(null as unknown as HTMLCanvasElement);
  const canvasRef2 = useRef<HTMLCanvasElement>(null as unknown as HTMLCanvasElement);
  const fabricRef1 = useRef<fabric.Canvas | null>(null);
  const fabricRef2 = useRef<fabric.Canvas | null>(null);
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageDpi, setImageDpi] = useState<number | null>(null);
  const [pdfDialog, setPdfDialog] = useState<PdfDialogState | null>(null);
  const [pdfDialogWorking, setPdfDialogWorking] = useState(false);
  const pendingPdfPagesRef = useRef<string[]>([]);
  const restoredSidesRef = useRef<Set<Side>>(new Set());
  const sidesFullyRestoredRef = useRef<Set<Side>>(new Set());  // tracks async enliven completion
  const onDesignChangeRef = useRef(onDesignChange);
  useEffect(() => { onDesignChangeRef.current = onDesignChange; }, [onDesignChange]);

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
  const canvasW = params.width_mm * MM_TO_PX;
  const canvasH = params.height_mm * MM_TO_PX;
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

  // Frissíti a Fabric zoom-ot és canvas méretét, ha a skála megváltozik (zoom / container resize)
  // A canvas fizikailag displayW × displayH méretű → nincs CSS upscale → éles kép
  useEffect(() => {
    [fabricRef1, fabricRef2].forEach(fRef => {
      const fc = fRef.current;
      if (!fc) return;
      fc.setZoom(scale);
      fc.setDimensions({ width: displayW, height: displayH });
      // Segédelemek strokeWidth frissítése (1px vizuális vastagság marad)
      fc.getObjects().forEach((obj: any) => {
        if (!obj.__guideHelper || !obj.__baseDash) return;
        obj.set({
          strokeWidth: 1 / scale,
          strokeDashArray: [
            obj.__baseDash[0] / scale,
            obj.__baseDash[1] / scale,
          ],
        });
      });
      fc.requestRenderAll();
    });
  }, [scale, displayW, displayH]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Expose getDesignJson via ref
  useImperativeHandle(ref, () => ({
    getDesignJson: () => {
      const fc1 = fabricRef1.current;
      if (!fc1) return null;
      const getCleanJson = (fc: fabric.Canvas) => {
        const json = fc.toJSON(['id', 'name']) as any;
        json.objects = (json.objects as any[]).filter((o: any) => !o.__guideHelper);
        return json;
      };
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
    const json = JSON.stringify(fc.toJSON(['id', 'name']));
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
        const iw = img.width ?? canvasW;
        const ih = img.height ?? canvasH;
        const ratio = Math.min(canvasW / iw, canvasH / ih);
        img.scale(ratio);
        img.set({
          left: (canvasW - iw * ratio) / 2,
          top:  (canvasH - ih * ratio) / 2,
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

    const ratio    = Math.min(canvasW / viewport.width, canvasH / viewport.height);
    const imgLeft  = (canvasW - viewport.width  * ratio) / 2;
    const imgTop   = (canvasH - viewport.height * ratio) / 2;

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
      const ratio = Math.min(canvasW / (img.width ?? canvasW), canvasH / (img.height ?? canvasH));
      img.scale(ratio);
      img.set({ left: (canvasW - (img.width ?? 0) * ratio) / 2, top: (canvasH - (img.height ?? 0) * ratio) / 2 });
      (img as any).name = label;
      fc.add(img);
      fc.setActiveObject(img);
      fc.renderAll();
      saveHistory(activeSide);
      setUploadingFile(false);
    });
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
        Math.abs(widthMm  - params.width_mm)  < 2 &&
        Math.abs(heightMm - params.height_mm) < 2;
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
    const getJson = (fc: fabric.Canvas | null, side: Side) => {
      if (!fc) return null;
      // If this side's initial restore hasn't completed yet, preserve the loaded initialDesign
      // data instead of capturing the half-empty canvas (fixes refresh wiping side 2).
      if (!sidesFullyRestoredRef.current.has(side)) {
        const saved = side === '1' ? initialDesign?.d1 : initialDesign?.d2;
        return saved ?? null;
      }
      const json = fc.toJSON(['id', 'name']) as any;
      json.objects = (json.objects as any[]).filter((o: any) => !o.__guideHelper);
      return json;
    };
    onDesignChangeRef.current(getJson(fabricRef1.current, '1'), getJson(fabricRef2.current, '2'));
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

    // Bleed háttér (szürkés kitöltés) - a szegély és a biztonsági zóna vonal a GuideOverlay-en jelenik meg
    const bleedPx = BLEED_MM * MM_TO_PX;
    const bleedRect = new fabric.Rect({
      left: -bleedPx,
      top: -bleedPx,
      width: canvasW + bleedPx * 2,
      height: canvasH + bleedPx * 2,
      fill: 'rgba(200,200,200,0.15)',
      stroke: undefined,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (bleedRect as any).__guideHelper = true;
    fc.add(bleedRect);
    fc.sendToBack(bleedRect);

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
    fc.on('object:modified', () => { saveHistory(side); updateObjects(side); notifyDesignChange(); });
    fc.on('object:added', () => { updateObjects(side); notifyDesignChange(); });
    fc.on('object:removed', () => { updateObjects(side); notifyDesignChange(); });

    // Snap + mouse-move és ruler cursor
    fc.on('mouse:move', (e: any) => {
      const p = e.absolutePointer;
      if (!p) return;
      setCursorMm({ x: p.x / MM_TO_PX, y: p.y / MM_TO_PX });
    });
    fc.on('mouse:out', () => setCursorMm({ x: null, y: null }));

    fc.on('object:moving', (e: any) => {
      if (!snapRef.current && !snapEdgesRef.current) return;
      const obj = e.target;
      if (!obj) return;
      snapObjectToGuides(obj);
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      setObjPosMm({ x: left / MM_TO_PX, y: top / MM_TO_PX, w: ow / MM_TO_PX, h: oh / MM_TO_PX });
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
        const ratio = Math.min(canvasW / (img.width ?? canvasW), canvasH / (img.height ?? canvasH));
        img.scale(ratio);
        img.set({ left: 0, top: 0 });
        (img as any).name = `PDF ${side}. oldal`;
        fc.add(img);
        fc.renderAll();
        saveHistory(side);
      });
    }

    // Restore saved design on initial load (once per side)
    if (!restoredSidesRef.current.has(side)) {
      restoredSidesRef.current.add(side);
      const designData = side === '1' ? initialDesign?.d1 : initialDesign?.d2;
      const savedObjs = (designData?.objects ?? []).filter((o: any) => !o.__guideHelper);
      if (savedObjs.length > 0) {
        fabric.util.enlivenObjects(savedObjs, (enlivened: fabric.Object[]) => {
          enlivened.forEach((obj: fabric.Object) => fc.add(obj));
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
    setObjPosMm({ x: left / MM_TO_PX, y: top / MM_TO_PX, w: ow / MM_TO_PX, h: oh / MM_TO_PX });
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

    // 1. Page edges + trim/safe-zone lines (alapset)
    if (snapEdgesRef.current) {
      const safePx = SAFE_MM * MM_TO_PX;
      // Vertical lines: left edge (0), safe-left, safe-right, right edge
      for (const x of [0, safePx, canvasW - safePx, canvasW]) tryX(x);
      // Horizontal lines: top (0), safe-top, safe-bottom, bottom
      for (const y of [0, safePx, canvasH - safePx, canvasH]) tryY(y);
      // Center axes
      tryX(canvasW / 2);
      tryY(canvasH / 2);
    }

    // 2. User guides + fold lines
    if (snapRef.current) {
      const guideList = [...guidesRef.current, ...foldLinesRef.current];
      for (const g of guideList) {
        const gPx = g.mm * MM_TO_PX;
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
    const newMm = pos / displayScale;
    const max = draggingItem.axis === 'x' ? params.width_mm : params.height_mm;
    const clamped = Math.max(0, Math.min(max, parseFloat(newMm.toFixed(1))));
    if (draggingItem.type === 'guide') updateGuide(draggingItem.id, clamped);
    else updateFoldLine(draggingItem.id, clamped);
  };
  const handleWrapperMouseUp = () => setDraggingItem(null);

  // Drag from ruler to create guide
  const handleRulerMouseDown = (axis: 'x' | 'y') => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const posPx = axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
    const mm = Math.round((posPx / displayScale) * 2) / 2;  // 0.5mm precision
    const clamped = Math.max(0, Math.min(axis === 'x' ? params.width_mm : params.height_mm, mm));
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
      fc.renderAll();
      if (side === '1') setHistIdx1(newIdx);
      else setHistIdx2(newIdx);
    });
  };

  const redo = () => {
    const side = activeSide;
    const hist = side === '1' ? history1 : history2;
    const idx = side === '1' ? histIdx1 : histIdx2;
    if (idx >= hist.length - 1) return;
    const newIdx = idx + 1;
    const fc = getActiveFabric();
    if (!fc) return;
    fc.loadFromJSON(hist[newIdx], () => {
      fc.renderAll();
      if (side === '1') setHistIdx1(newIdx);
      else setHistIdx2(newIdx);
    });
  };

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

  /** Lapszélig húzás — arányos, az első lapszélt elérő oldalt veszi figyelembe (contain) */
  const fitToPage = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    const objW = obj.width ?? 1;
    const objH = obj.height ?? 1;
    const s = Math.min(canvasW / objW, canvasH / objH);
    obj.set({
      scaleX: s,
      scaleY: s,
      left: (canvasW - objW * s) / 2,
      top:  (canvasH - objH * s) / 2,
    });
    fc!.renderAll();
    saveHistory(activeSide);
  };

  /** Lap kitöltése — arányos, mindkét lapszélt eléri (cover) */
  const fillPage = () => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    const objW = obj.width ?? 1;
    const objH = obj.height ?? 1;
    const s = Math.max(canvasW / objW, canvasH / objH);
    obj.set({
      scaleX: s,
      scaleY: s,
      left: (canvasW - objW * s) / 2,
      top:  (canvasH - objH * s) / 2,
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
    // Move guide helpers back
    const guides = fc!.getObjects().filter(o => (o as any).__guideHelper);
    guides.forEach(g => fc!.sendToBack(g));
    fc!.renderAll();
    saveHistory(activeSide);
  };

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

    const data1 = exportFc(fc1);
    const data2 = (params.sides === '2' && fc2) ? exportFc(fc2) : '';
    const W = params.width_mm;
    const H = params.height_mm;
    const productName = params.product_name.replace(/`/g, "'");
    const sidesLabel = params.sides === '2' ? '2 oldalas' : '1 oldalas';

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
</style>
</head><body>
<div id="hud">${productName} &nbsp;·&nbsp; ${W}&times;${H}&thinsp;mm &nbsp;·&nbsp; ${sidesLabel}</div>
<div id="hint">Drag: forgat &nbsp;|&nbsp; Görgő: zoom &nbsp;|&nbsp; Jobb klikk: mozgat</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const D1=\`${data1}\`;
const D2=\`${data2}\`;
const W=${W},H=${H};
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
function mkTex(data,flip){
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
      if(flip){t.wrapS=THREE.RepeatWrapping;t.repeat.set(-1,1);t.offset.set(1,0);}
      res(t);
    };
    img.src=data;
  });
}
Promise.all([mkTex(D1,false),mkTex(D2,false)]).then(([t1,t2])=>{
  const d=.018;
  const edge=new THREE.MeshBasicMaterial({color:0xf2ede4});
  const mats=[
    edge,edge,edge,edge,
    new THREE.MeshBasicMaterial({map:t1}),
    new THREE.MeshBasicMaterial({map:t2}),
  ];
  const card=new THREE.Mesh(new THREE.BoxGeometry(w3,h3,d),mats);
  card.rotation.y=0.2;
  scene.add(card);
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
  const histIdx = activeSide === '1' ? histIdx1 : histIdx2;
  const histLen = activeSide === '1' ? history1.length : history2.length;

  // Guide + FoldLine overlay canvas
  const GuideOverlay = () => {
    const overlayRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, displayW, displayH);

      // Bleed boundary (trim line) — always on top
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(0.5, 0.5, displayW - 1, displayH - 1);

      // Safe zone border — always on top
      const safeDsp = SAFE_MM * displayScale;
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(safeDsp, safeDsp, displayW - safeDsp * 2, displayH - safeDsp * 2);

      // Draw guides
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const g of guides) {
        const px = g.mm * displayScale;
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
        const px = f.mm * displayScale;
        ctx.beginPath();
        if (f.axis === 'x') { ctx.moveTo(px, 0); ctx.lineTo(px, displayH); }
        else { ctx.moveTo(0, px); ctx.lineTo(displayW, px); }
        ctx.stroke();
        // Label
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
      // Origin marker at (0,0) = print top-left corner
      ctx.save();
      const OL = 10; // px
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(OL, 0); ctx.lineTo(0, 0); ctx.lineTo(0, OL);
      ctx.stroke();
      ctx.fillStyle = '#1890ff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    return (
      <canvas
        ref={overlayRef}
        width={displayW}
        height={displayH}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20 }}
      />
    );
  };

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
        {toolPanelOpen && (
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
          {[...currentObjects].reverse().map((obj: fabric.Object, i: number) => {
            const isActive = activeFc?.getActiveObject() === obj;
            return (
              <div
                key={i}
                onClick={() => { activeFc?.setActiveObject(obj); activeFc?.renderAll(); setSelectedObj(obj); }}
                style={{
                  padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
                  background: isActive ? '#e6f4ff' : 'transparent',
                  fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 2,
                }}
              >
                {(() => {
                  const t = obj.type;
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
                })()}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(obj as any).name || obj.type}
                </span>
                <span style={{ cursor: 'pointer', opacity: 0.5 }} onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  obj.set('visible', !obj.visible);
                  activeFc?.renderAll();
                }}>
                  {obj.visible !== false ? '👁' : '🚫'}
                </span>
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
            );
          })}
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
            size="small" min={0}
            max={newGuideAxis === 'x' ? params.width_mm : params.height_mm}
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
                size="small" value={g.mm} step={0.5} min={0}
                max={g.axis === 'x' ? params.width_mm : params.height_mm}
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
            size="small" min={0}
            max={newFoldAxis === 'x' ? params.width_mm : params.height_mm}
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
                size="small" value={f.mm} step={0.5} min={0}
                max={f.axis === 'x' ? params.width_mm : params.height_mm}
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
          {/* Undo/Redo */}
          <Tooltip title="Visszavon (Ctrl+Z)">
            <Button size="small" icon={<UndoOutlined />} disabled={histIdx <= 0} onClick={undo} />
          </Tooltip>
          <Tooltip title="Előre (Ctrl+Y)">
            <Button size="small" icon={<RedoOutlined />} disabled={histIdx >= histLen - 1} onClick={redo} />
          </Tooltip>

          <Divider type="vertical" />

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
          <Tooltip title="3D el\u0151n\u00e9zet \u2014 \u00faj lapon, forgathat\u00f3">
            <Button size="small" icon={<EyeOutlined />} onClick={handlePreview3D}>3D</Button>
          </Tooltip>

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
          {params.sides === '2' && (
            <div style={{ marginBottom: 8 }}>
              <Space.Compact>
                <Button
                  type={activeSide === '1' ? 'primary' : 'default'}
                  icon={<LeftOutlined />}
                  onClick={() => setActiveSide('1')}
                >
                  1. oldal
                </Button>
                <Button
                  type={activeSide === '2' ? 'primary' : 'default'}
                  onClick={() => setActiveSide('2')}
                >
                  2. oldal <RightOutlined />
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
                  <path d="M1 9 L1 1 L9 1" stroke="#1890ff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
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
                  totalMm={params.width_mm}
                  scale={displayScale}
                  size={RULER_SIZE}
                  cursorMm={cursorMm.x}
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
                  totalMm={params.height_mm}
                  scale={displayScale}
                  size={RULER_SIZE}
                  cursorMm={cursorMm.y}
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
                <GuideOverlay />
                {/* Hit zones: guides */}
                {guides.map(g => {
                  const px = g.mm * displayScale;
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
                  const px = f.mm * displayScale;
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
                    }}
                  >
                    <canvas ref={canvasRef2} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info legend */}
          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', display: 'flex', gap: 16 }}>
            <span style={{ color: '#aaa' }}>Bleed: {BLEED_MM}mm szürke kéret</span>
            <span style={{ color: '#ff4d4f' }}>Biztonsági zóna: {SAFE_MM}mm</span>
            <span>{params.width_mm}×{params.height_mm}mm — {params.quantity} db</span>
            {snapEnabled && <span style={{ color: GUIDE_COLOR }}>Snap: BE</span>}
          </div>
        </div>
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
  </>
  );
});

Step2CanvasEditor.displayName = 'Step2CanvasEditor';
export default Step2CanvasEditor;
