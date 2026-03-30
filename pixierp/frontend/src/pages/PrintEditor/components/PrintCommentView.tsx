import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, InputNumber, List, Avatar, Tooltip, Typography, Upload, message, Spin, Badge, Segmented, Divider, Tag, Progress, Dropdown, Modal } from 'antd';
import {
  CommentOutlined, CheckOutlined, DeleteOutlined,
  FilePdfOutlined, MessageOutlined, CloseOutlined, LockOutlined,
  ColumnWidthOutlined, ZoomInOutlined, ZoomOutOutlined, SelectOutlined,
  SafetyCertificateOutlined, ExclamationCircleOutlined,
  ScissorOutlined, MergeCellsOutlined, ExportOutlined,
  DragOutlined, PlusOutlined, UndoOutlined, RedoOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import api from '../../../services/api';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ─── Types ────────────────────────────────────────────────────────────────────

type CommentToolType = 'pointer' | 'area' | 'pin' | 'arrow' | 'measure' | 'guideline' | 'crop';

interface Guideline {
  id: number;
  orientation: 'h' | 'v';
  position: number; // 0-1 relative
  page: number;
}

interface CropRect {
  x: number; y: number; w: number; h: number; // 0-1 relative
}

export interface CommentAnnotation {
  id: number;
  x: number;       // 0-1 relative to image
  y: number;
  w: number;
  h: number;
  x2?: number;     // arrow endpoint (0-1 relative)
  y2?: number;
  type: 'area' | 'pin' | 'arrow';
  page: number;
  text: string;
  author: string;
  created_at: string;
  resolved: boolean;
  color: string;
}

interface PendingShape {
  type: 'area' | 'pin' | 'arrow';
  x: number; y: number; w: number; h: number;
  x2?: number; y2?: number;
}

interface MeasureLine {
  x1: number; y1: number; x2: number; y2: number; page: number;
}

interface PdfElement {
  type: 'image' | 'text' | 'vector';
  x: number; y: number; w: number; h: number;
  colorspace?: string;
  width_px?: number;
  height_px?: number;
  font?: string;
  font_size?: number;
  color?: string;
  text?: string;
  spot?: boolean;
  spot_name?: string;
}

interface PdfPageInfo {
  widthPt: number;
  heightPt: number;
  trimBox?: { x: number; y: number; w: number; h: number };
}

interface Props {
  orderId?: number | null;
  itemId?: number | null;
  isAdmin: boolean;
  locked?: boolean;
  authorName: string;
  params?: PrintParams;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PT_TO_MM = 25.4 / 72;
const MM_TO_PT = 72 / 25.4;
const SNAP_THRESHOLD = 0.015; // relative distance for snapping (~1.5% of page dimension)
const HISTORY_MAX = 50;

interface HistorySnapshot {
  pdfPages: string[];
  pageInfos: PdfPageInfo[];
  pageColorSpaces: Set<string>[];
  pageElements: PdfElement[][];
  guidelines: Guideline[];
  cropRect: CropRect | null;
  measureLines: MeasureLine[];
  annotations: CommentAnnotation[];
  pdfFile: File | null;
  canvases: HTMLCanvasElement[];
}

const COLORS = ['#1890ff', '#fa8c16', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2'];
let colorIdx = 0;
const nextColor = () => COLORS[(colorIdx++) % COLORS.length];

const IDB_NAME = 'pixierp_pdf_cache';
const IDB_STORE = 'pdfs';
const IDB_KEY = 'preview_pdf';

const openIDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const savePdfToIDB = async (buffer: ArrayBuffer, name: string) => {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ buffer, name, ts: Date.now() }, IDB_KEY);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* silent */ }
};

const loadPdfFromIDB = async (): Promise<{ buffer: ArrayBuffer; name: string } | null> => {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    const result = await new Promise<any>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    if (result?.buffer) return { buffer: result.buffer, name: result.name || 'cached.pdf' };
    return null;
  } catch { return null; }
};

// ─── Component ────────────────────────────────────────────────────────────────

const PrintCommentView: React.FC<Props> = ({ orderId, itemId, isAdmin, locked = false, authorName, params }) => {
  // PDF state
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pageInfos, setPageInfos] = useState<PdfPageInfo[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Tool state
  const [activeTool, setActiveTool] = useState<CommentToolType>('pointer');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Annotation state
  const [annotations, setAnnotations] = useState<CommentAnnotation[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Draw state
  const [drawing, setDrawing] = useState(false);
  const [pendingShape, setPendingShape] = useState<PendingShape | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Measure state
  const [measureLines, setMeasureLines] = useState<MeasureLine[]>([]);
  const [activeMeasure, setActiveMeasure] = useState<MeasureLine | null>(null);
  const [measuringStart, setMeasuringStart] = useState<{ x: number; y: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const MAX_MEASURES = 3;

  // Element detection state
  const [pageElements, setPageElements] = useState<PdfElement[][]>([]);
  const [selectedElement, setSelectedElement] = useState<{ page: number; element: PdfElement } | null>(null);

  // Mouse coordinate
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const [showTrimBox, setShowTrimBox] = useState(true);

  // Color detection
  const [cursorColor, setCursorColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [cursorSpotName, setCursorSpotName] = useState<string | null>(null);
  const [pageColorSpaces, setPageColorSpaces] = useState<Set<string>[]>([]);
  const pageCanvasRefs = useRef<HTMLCanvasElement[]>([]);

  const [pendingPage, setPendingPage] = useState(0);

  // Check panel state
  const [checkResults, setCheckResults] = useState<{ label: string; issues: { page: number; desc: string; element: PdfElement }[] } | null>(null);

  // Guideline state
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<number | null>(null);
  let guideIdCounter = useRef(1);

  // Crop state
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropDrawStart, setCropDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [cropDrawing, setCropDrawing] = useState(false);

  // Merge state
  const [merging, setMerging] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // PDF file reference for export/crop/merge
  const pdfFileRef = useRef<File | null>(null);

  // DnD page reorder state
  const dragPageIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Undo/Redo history
  const historyStack = useRef<HistorySnapshot[]>([]);
  const redoStack = useRef<HistorySnapshot[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const skipHistoryRef = useRef(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Pointer drag-to-scroll
  const pointerDragRef = useRef<{
    startX: number; startY: number;
    scrollLeft: number; scrollTop: number;
    moved: boolean; pageNum: number; relPos: { x: number; y: number };
  } | null>(null);
  const pageElementsRef = useRef<PdfElement[][]>([]);
  pageElementsRef.current = pageElements;

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 5;
  const ZOOM_STEP = 0.15;
  const zoomIn = () => setZoomLevel(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoomLevel(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoomLevel(1);

  // ── Load annotations ────────────────────────────────────────────────────────
  const loadAnnotations = useCallback(async () => {
    if (!itemId) return;
    setLoadingAnnotations(true);
    try {
      const r = await api.get(`printshop/order-items/${itemId}/comments/`);
      setAnnotations(r.data ?? []);
    } catch {
      setAnnotations([]);
    } finally {
      setLoadingAnnotations(false);
    }
  }, [itemId]);

  useEffect(() => { loadAnnotations(); }, [loadAnnotations]);

  // ── Auto-load cached PDF on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadPdfFromIDB();
      if (cached && !cancelled) {
        const file = new File([cached.buffer], cached.name, { type: 'application/pdf' });
        renderPdf(file, true);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PDF rendering ────────────────────────────────────────────────────────────
  const renderPdf = useCallback(async (file: File, skipCache?: boolean) => {
    setLoadingPdf(true);
    setLoadingProgress(0);
    setPdfPages([]);
    setPageInfos([]);
    setPageColorSpaces([]);
    setPageElements([]);
    setSelectedElement(null);
    pageCanvasRefs.current = [];
    setCurrentPage(1);
    setCropRect(null);
    pdfFileRef.current = file;
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Save to IndexedDB for persistence across refresh
      if (!skipCache) {
        savePdfToIDB(arrayBuffer.slice(0), file.name);
      }

      // ── 1) Server-side analysis via PyMuPDF: TrimBox + color spaces ──
      setLoadingProgress(5);
      let serverPages: any[] = [];
      try {
        const formData = new FormData();
        formData.append('pdf', file);
        const analyzeResp = await api.post('printshop/pdf-analyze/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30000,
        });
        serverPages = analyzeResp.data?.pages ?? [];
      } catch (err) {
        console.warn('PDF server analysis failed, continuing with client-only:', err);
      }
      setLoadingProgress(15);

      // ── 2) Client-side rendering via pdfjs ──
      const pdfjs = (await import('pdfjs-dist')).default ?? (await import('pdfjs-dist'));
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
      setLoadingProgress(20);

      const pages: string[] = [];
      const infos: PdfPageInfo[] = [];
      const canvases: HTMLCanvasElement[] = [];
      const csPerPage: Set<string>[] = [];
      const elemsPerPage: PdfElement[][] = [];
      const totalPages = pdf.numPages;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const dpr = window.devicePixelRatio || 1;
        const rs = Math.max(2, dpr * 1.5);
        const vp = page.getViewport({ scale: rs });
        const c = document.createElement('canvas');
        c.width = vp.width;
        c.height = vp.height;
        const ctx = c.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
        pages.push(c.toDataURL('image/png'));
        canvases.push(c);

        // Use server-side page info if available
        const sp = serverPages[i - 1];
        const mediaBox = page.view; // [x0, y0, x1, y1]
        const pageW = mediaBox[2] - mediaBox[0];
        const pageH = mediaBox[3] - mediaBox[1];

        // TrimBox from server (PyMuPDF)
        let trimBox: PdfPageInfo['trimBox'] = undefined;
        if (sp?.trimbox_pt) {
          trimBox = {
            x: sp.trimbox_pt.x,
            y: sp.trimbox_pt.y,
            w: sp.trimbox_pt.w,
            h: sp.trimbox_pt.h,
          };
        }

        // Color spaces from server
        const colorSpaces = new Set<string>();
        if (sp?.color_spaces && Array.isArray(sp.color_spaces)) {
          for (const cs of sp.color_spaces) {
            colorSpaces.add(cs);
          }
        }
        csPerPage.push(colorSpaces);

        // Elements from server
        const elems: PdfElement[] = [];
        if (sp?.elements && Array.isArray(sp.elements)) {
          for (const el of sp.elements) {
            elems.push({
              type: el.type, x: el.x, y: el.y, w: el.w, h: el.h,
              colorspace: el.colorspace, width_px: el.width_px, height_px: el.height_px,
              font: el.font, font_size: el.font_size, color: el.color, text: el.text,
              spot: el.spot, spot_name: el.spot_name,
            });
          }
        }
        elemsPerPage.push(elems);
        if (elems.length > 0) console.log(`Page ${i}: ${elems.length} elements detected`);

        infos.push({ widthPt: pageW, heightPt: pageH, trimBox });
        setLoadingProgress(20 + Math.round((i / totalPages) * 75));
      }
      setLoadingProgress(100);
      setPdfPages(pages);
      setPageInfos(infos);
      pageCanvasRefs.current = canvases;
      setPageColorSpaces(csPerPage);
      setPageElements(elemsPerPage);
    } catch (err) {
      console.error('PDF render error:', err);
      message.error('PDF betöltési hiba');
    } finally {
      setLoadingPdf(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IntersectionObserver for scroll-based currentPage ──────────────────────
  useEffect(() => {
    if (!pdfPages.length) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) bestIdx = idx;
          }
        }
        if (bestIdx >= 0) setCurrentPage(bestIdx + 1);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    pageRefs.current.forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [pdfPages.length]);

  // ── Ctrl+scroll zoom (native event for passive:false) ─────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoomLevel(z => {
          const next = e.deltaY < 0 ? z + ZOOM_STEP : z - ZOOM_STEP;
          return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +next.toFixed(2)));
        });
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pointer drag-to-scroll handlers ────────────────────────────────────────
  const handlePointerDragMove = useCallback((e: MouseEvent) => {
    const drag = pointerDragRef.current;
    const container = scrollContainerRef.current;
    if (!drag || !container) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      document.body.style.cursor = 'grabbing';
    }
    if (drag.moved) {
      container.scrollLeft = drag.scrollLeft - dx;
      container.scrollTop = drag.scrollTop - dy;
    }
  }, []);

  const handlePointerDragUp = useCallback(() => {
    document.removeEventListener('mousemove', handlePointerDragMove);
    document.removeEventListener('mouseup', handlePointerDragUp);
    document.body.style.cursor = '';
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag) return;
    if (drag.moved) return; // Was a pan drag, not a click
    // Click → select element
    const elems = pageElementsRef.current[drag.pageNum - 1];
    if (elems && elems.length > 0) {
      const pos = drag.relPos;
      // Collect all elements at click position
      const hits: PdfElement[] = [];
      for (const el of elems) {
        if (pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h) {
          hits.push(el);
        }
      }
      // Priority: image > text > vector, then smallest area within same type
      const typePriority: Record<string, number> = { image: 0, text: 1, vector: 2 };
      hits.sort((a, b) => {
        const pa = typePriority[a.type] ?? 9;
        const pb = typePriority[b.type] ?? 9;
        if (pa !== pb) return pa - pb;
        return (a.w * a.h) - (b.w * b.h);
      });
      const bestMatch = hits.length > 0 ? hits[0] : null;
      setSelectedElement(bestMatch ? { page: drag.pageNum, element: bestMatch } : null);
    } else {
      setSelectedElement(null);
    }
  }, [handlePointerDragMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handlePointerDragMove);
      document.removeEventListener('mouseup', handlePointerDragUp);
      document.body.style.cursor = '';
    };
  }, [handlePointerDragMove, handlePointerDragUp]);

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const takeSnapshot = useCallback((): HistorySnapshot => ({
    pdfPages: [...pdfPages],
    pageInfos: [...pageInfos],
    pageColorSpaces: pageColorSpaces.map(s => new Set(s)),
    pageElements: pageElements.map(arr => [...arr]),
    guidelines: guidelines.map(g => ({ ...g })),
    cropRect: cropRect ? { ...cropRect } : null,
    measureLines: measureLines.map(ml => ({ ...ml })),
    annotations: annotations.map(a => ({ ...a })),
    pdfFile: pdfFileRef.current,
    canvases: [...pageCanvasRefs.current],
  }), [pdfPages, pageInfos, pageColorSpaces, pageElements, guidelines, cropRect, measureLines, annotations]);

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return;
    const snap = takeSnapshot();
    historyStack.current.push(snap);
    if (historyStack.current.length > HISTORY_MAX) historyStack.current.shift();
    redoStack.current = [];
    setHistoryLen(historyStack.current.length);
    setRedoLen(0);
  }, [takeSnapshot]);

  const applySnapshot = useCallback((snap: HistorySnapshot) => {
    skipHistoryRef.current = true;
    setPdfPages(snap.pdfPages);
    setPageInfos(snap.pageInfos);
    setPageColorSpaces(snap.pageColorSpaces);
    setPageElements(snap.pageElements);
    setGuidelines(snap.guidelines);
    setCropRect(snap.cropRect);
    setMeasureLines(snap.measureLines);
    setAnnotations(snap.annotations);
    pdfFileRef.current = snap.pdfFile;
    pageCanvasRefs.current = snap.canvases;
    setTimeout(() => { skipHistoryRef.current = false; }, 0);
  }, []);

  const undo = useCallback(() => {
    if (historyStack.current.length === 0) return;
    const currentSnap = takeSnapshot();
    redoStack.current.push(currentSnap);
    const prev = historyStack.current.pop()!;
    applySnapshot(prev);
    setHistoryLen(historyStack.current.length);
    setRedoLen(redoStack.current.length);
  }, [takeSnapshot, applySnapshot]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const currentSnap = takeSnapshot();
    historyStack.current.push(currentSnap);
    const next = redoStack.current.pop()!;
    applySnapshot(next);
    setHistoryLen(historyStack.current.length);
    setRedoLen(redoStack.current.length);
  }, [takeSnapshot, applySnapshot]);

  // Keyboard shortcuts: ESC, Ctrl+Z, Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedElement) {
        setSelectedElement(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedElement, undo, redo]);

  const scrollToPage = (pageNum: number) => {
    const el = pageRefs.current[pageNum - 1];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToElement = (pageNum: number, elem: PdfElement) => {
    const container = scrollContainerRef.current;
    const pageEl = pageRefs.current[pageNum - 1];
    if (!container || !pageEl) { scrollToPage(pageNum); return; }
    const imgWrapper = pageEl.querySelector('div[style*="position"]') as HTMLElement;
    const target = imgWrapper || pageEl;
    const targetRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const elCenterY = targetRect.top + (elem.y + elem.h / 2) * targetRect.height * zoomLevel;
    const elCenterX = targetRect.left + (elem.x + elem.w / 2) * targetRect.width * zoomLevel;
    const offsetY = elCenterY - containerRect.top - containerRect.height / 2;
    const offsetX = elCenterX - containerRect.left - containerRect.width / 2;
    container.scrollBy({ top: offsetY, left: offsetX, behavior: 'smooth' });
  };

  // ── Geometry helpers ─────────────────────────────────────────────────────────
  const getRelPos = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const relToMm = (rx: number, ry: number) => {
    const info = pageInfos[currentPage - 1];
    if (!info) return null;
    return { x: +(rx * info.widthPt * PT_TO_MM).toFixed(1), y: +(ry * info.heightPt * PT_TO_MM).toFixed(1) };
  };

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent, pageNum: number) => {
    const pos = getRelPos(e);
    if (pos) setCursorPos(pos);
    setCurrentPage(pageNum);

    // Sample pixel color from stored canvas
    const canvas = pageCanvasRefs.current[pageNum - 1];
    if (canvas && pos) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const px = Math.min(Math.max(Math.round(pos.x * canvas.width), 0), canvas.width - 1);
        const py = Math.min(Math.max(Math.round(pos.y * canvas.height), 0), canvas.height - 1);
        const data = ctx.getImageData(px, py, 1, 1).data;
        setCursorColor({ r: data[0], g: data[1], b: data[2] });
      }
    }

    // Check if cursor is over a spot-color element
    if (pos) {
      const els = pageElements[pageNum - 1];
      let foundSpot: string | null = null;
      if (els) {
        for (let i = els.length - 1; i >= 0; i--) {
          const el = els[i];
          if (el.spot && el.spot_name && pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h) {
            foundSpot = el.spot_name;
            break;
          }
        }
      }
      setCursorSpotName(foundSpot);
    }

    if (activeTool === 'pointer') return;

    if (measuring && measuringStart && pos) {
      setActiveMeasure({ x1: measuringStart.x, y1: measuringStart.y, x2: pos.x, y2: pos.y, page: pageNum });
    }

    if (drawing && drawStart && pos) {
      if (activeTool === 'area') {
        setPendingShape({
          type: 'area',
          x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y),
          w: Math.abs(pos.x - drawStart.x), h: Math.abs(pos.y - drawStart.y),
        });
      } else if (activeTool === 'arrow') {
        setPendingShape({
          type: 'arrow', x: drawStart.x, y: drawStart.y, w: 0, h: 0,
          x2: pos.x, y2: pos.y,
        });
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent, pageNum: number) => {
    if (!pdfPages.length) return;
    e.preventDefault();
    const pos = getRelPos(e);
    if (!pos) return;
    setCurrentPage(pageNum);
    setPendingPage(pageNum);

    if (activeTool === 'pointer') {
      setSelectedId(null);
      const container = scrollContainerRef.current;
      if (container) {
        pointerDragRef.current = {
          startX: e.clientX, startY: e.clientY,
          scrollLeft: container.scrollLeft, scrollTop: container.scrollTop,
          moved: false, pageNum, relPos: pos,
        };
        document.addEventListener('mousemove', handlePointerDragMove);
        document.addEventListener('mouseup', handlePointerDragUp);
      }
      return;
    }

    if (activeTool === 'measure') {
      if (!measuring) {
        if (measureLines.length >= MAX_MEASURES) {
          message.info(`Maximum ${MAX_MEASURES} mérés helyezhető el`);
          return;
        }
        setMeasuring(true);
        setMeasuringStart(pos);
        setActiveMeasure({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, page: pageNum });
      } else {
        if (activeMeasure) {
          pushHistory();
          setMeasureLines(prev => [...prev, activeMeasure]);
        }
        setActiveMeasure(null);
        setMeasuring(false);
        setMeasuringStart(null);
      }
      return;
    }

    if (activeTool === 'pin') {
      setPendingShape({ type: 'pin', x: pos.x, y: pos.y, w: 0, h: 0 });
      setSelectedId(null);
      setDrawStart(null);
      setDrawing(false);
      setNewComment('');
      return;
    }

    setDrawing(true);
    setDrawStart(pos);
    setPendingShape(activeTool === 'arrow'
      ? { type: 'arrow', x: pos.x, y: pos.y, w: 0, h: 0, x2: pos.x, y2: pos.y }
      : { type: 'area', x: pos.x, y: pos.y, w: 0, h: 0 }
    );
    setSelectedId(null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (activeTool === 'measure') return;
    if (!drawing) return;
    setDrawing(false);
    const pos = getRelPos(e);
    if (!pos || !drawStart) return;

    if (activeTool === 'area') {
      const w = Math.abs(pos.x - drawStart.x);
      const h = Math.abs(pos.y - drawStart.y);
      if (w < 0.01 && h < 0.01) { setPendingShape(null); setDrawStart(null); return; }
      setPendingShape({ type: 'area', x: Math.min(drawStart.x, pos.x), y: Math.min(drawStart.y, pos.y), w, h });
    } else if (activeTool === 'arrow') {
      const dist = Math.sqrt((pos.x - drawStart.x) ** 2 + (pos.y - drawStart.y) ** 2);
      if (dist < 0.01) { setPendingShape(null); setDrawStart(null); return; }
      setPendingShape({ type: 'arrow', x: drawStart.x, y: drawStart.y, w: 0, h: 0, x2: pos.x, y2: pos.y });
    }
    setDrawStart(null);
    setNewComment('');
  };

  const handleMouseLeave = () => { setCursorPos(null); setCursorColor(null); setCursorSpotName(null); };

  // ── Save / delete / resolve ─────────────────────────────────────────────────
  const handleSaveComment = async () => {
    if (!pendingShape || !newComment.trim()) return;
    setSavingComment(true);
    const annotation: any = {
      x: pendingShape.x, y: pendingShape.y, w: pendingShape.w, h: pendingShape.h,
      type: pendingShape.type || 'area',
      page: pendingPage || currentPage, text: newComment.trim(), author: authorName,
      resolved: false, color: nextColor(),
    };
    if (pendingShape.type === 'arrow') { annotation.x2 = pendingShape.x2; annotation.y2 = pendingShape.y2; }
    try {
      if (itemId) {
        const r = await api.post(`printshop/order-items/${itemId}/comments/`, annotation);
        pushHistory();
        setAnnotations(prev => [...prev, r.data]);
      } else {
        pushHistory();
        setAnnotations(prev => [...prev, { ...annotation, id: Date.now(), created_at: new Date().toISOString() }]);
      }
      setPendingShape(null);
      setNewComment('');
    } catch { message.error('Komment mentési hiba'); }
    finally { setSavingComment(false); }
  };

  const handleDeleteAnnotation = async (id: number) => {
    try {
      if (itemId) await api.delete(`printshop/order-items/${itemId}/comments/${id}/`);
      pushHistory();
      setAnnotations(prev => prev.filter(a => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch { message.error('Törlési hiba'); }
  };

  const handleResolve = async (id: number) => {
    try {
      if (itemId) await api.patch(`printshop/order-items/${itemId}/comments/${id}/`, { resolved: true });
      pushHistory();
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch { message.error('Hiba'); }
  };

  const cancelPending = () => { setPendingShape(null); setNewComment(''); setDrawStart(null); setDrawing(false); setPendingPage(0); };

  // ── Page delete handler ────────────────────────────────────────────────────
  const handleDeletePage = async (pageIndex: number) => {
    if (!pdfFileRef.current) return;
    if (pdfPages.length <= 1) { message.warning('Az utolsó oldal nem törölhető'); return; }
    Modal.confirm({
      title: 'Oldal törlése',
      content: `Biztosan törölni szeretnéd a(z) ${pageIndex + 1}. oldalt?`,
      okText: 'Törlés',
      cancelText: 'Mégse',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          pushHistory();
          const formData = new FormData();
          formData.append('pdf', pdfFileRef.current!);
          formData.append('page', String(pageIndex));
          const resp = await api.post('printshop/pdf-delete-page/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob',
            timeout: 30000,
          });
          const blob = new Blob([resp.data], { type: 'application/pdf' });
          const newFile = new File([blob], pdfFileRef.current!.name, { type: 'application/pdf' });
          await renderPdf(newFile, true);
          message.success(`${pageIndex + 1}. oldal törölve`);
        } catch (err) {
          console.error('Page delete error:', err);
          message.error('Oldal törlési hiba');
        }
      },
    });
  };

  // ── Page reorder handler ────────────────────────────────────────────────────
  const handlePageReorder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !pdfFileRef.current) return;
    pushHistory();
    // Build new order
    const order = Array.from({ length: pdfPages.length }, (_, i) => i);
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);

    // Reorder client-side arrays instantly for snappy feedback
    const reorder = <T,>(arr: T[]) => order.map(i => arr[i]);
    setPdfPages(prev => reorder(prev));
    setPageInfos(prev => reorder(prev));
    setPageColorSpaces(prev => reorder(prev));
    setPageElements(prev => reorder(prev));
    pageCanvasRefs.current = reorder(pageCanvasRefs.current);

    // Persist reorder in the actual PDF file via backend
    try {
      const formData = new FormData();
      formData.append('pdf', pdfFileRef.current);
      formData.append('order', JSON.stringify(order));
      const resp = await api.post('printshop/pdf-reorder/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
        timeout: 30000,
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      pdfFileRef.current = new File([blob], pdfFileRef.current!.name, { type: 'application/pdf' });
    } catch (err) {
      console.error('Page reorder error:', err);
      message.error('Oldal átrendezési hiba');
      // Re-render from original file as fallback
      if (pdfFileRef.current) await renderPdf(pdfFileRef.current, true);
    }
  };

  // ── Guideline handlers ─────────────────────────────────────────────────────
  const addGuideline = (orientation: 'h' | 'v') => {
    pushHistory();
    const id = guideIdCounter.current++;
    setGuidelines(prev => [...prev, { id, orientation, position: 0.5, page: currentPage }]);
  };

  const addGuidelineAtMm = (orientation: 'h' | 'v', mm: number) => {
    const info = pageInfos[currentPage - 1];
    if (!info) return;
    pushHistory();
    const dimPt = orientation === 'h' ? info.heightPt : info.widthPt;
    const pos = Math.max(0, Math.min(1, (mm * MM_TO_PT) / dimPt));
    const id = guideIdCounter.current++;
    setGuidelines(prev => [...prev, { id, orientation, position: pos, page: currentPage }]);
  };

  const updateGuidelineMm = (id: number, mm: number) => {
    pushHistory();
    setGuidelines(prev => prev.map(g => {
      if (g.id !== id) return g;
      const info = pageInfos[g.page - 1];
      if (!info) return g;
      const dimPt = g.orientation === 'h' ? info.heightPt : info.widthPt;
      const pos = Math.max(0, Math.min(1, (mm * MM_TO_PT) / dimPt));
      return { ...g, position: pos };
    }));
  };

  const removeGuideline = (id: number) => {
    pushHistory();
    setGuidelines(prev => prev.filter(g => g.id !== id));
  };

  const clearGuidelines = () => { pushHistory(); setGuidelines([]); };

  // ── Snap helper ─────────────────────────────────────────────────────────────
  const snapToGuides = (pos: { x: number; y: number }): { x: number; y: number } => {
    const pageGuides = guidelines.filter(g => g.page === currentPage);
    let { x, y } = pos;
    for (const g of pageGuides) {
      if (g.orientation === 'v' && Math.abs(x - g.position) < SNAP_THRESHOLD) x = g.position;
      if (g.orientation === 'h' && Math.abs(y - g.position) < SNAP_THRESHOLD) y = g.position;
    }
    return { x, y };
  };

  // ── Crop handlers ──────────────────────────────────────────────────────────
  const handleCropMouseDown = (e: React.MouseEvent, _pageNum: number) => {
    if (activeTool !== 'crop') return;
    e.preventDefault();
    let pos = getRelPos(e);
    if (!pos) return;
    pushHistory();
    pos = snapToGuides(pos);
    setCropDrawStart(pos);
    setCropDrawing(true);
    setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!cropDrawing || !cropDrawStart) return;
    let pos = getRelPos(e);
    if (!pos) return;
    pos = snapToGuides(pos);
    setCropRect({
      x: Math.min(cropDrawStart.x, pos.x),
      y: Math.min(cropDrawStart.y, pos.y),
      w: Math.abs(pos.x - cropDrawStart.x),
      h: Math.abs(pos.y - cropDrawStart.y),
    });
  };

  const handleCropMouseUp = () => {
    setCropDrawing(false);
    setCropDrawStart(null);
    if (cropRect && cropRect.w < 0.01 && cropRect.h < 0.01) {
      setCropRect(null);
    }
  };

  const applyCrop = async () => {
    if (!cropRect || !pdfFileRef.current) return;
    pushHistory();
    const info = pageInfos[currentPage - 1];
    if (!info) return;
    // Convert relative crop to pt
    const cropPt = {
      x: cropRect.x * info.widthPt,
      y: cropRect.y * info.heightPt,
      w: cropRect.w * info.widthPt,
      h: cropRect.h * info.heightPt,
      page: currentPage,
    };
    try {
      const formData = new FormData();
      formData.append('pdf', pdfFileRef.current);
      formData.append('crop', JSON.stringify(cropPt));
      const resp = await api.post('printshop/pdf-crop/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
        timeout: 30000,
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const file = new File([blob], 'cropped.pdf', { type: 'application/pdf' });
      setCropRect(null);
      setActiveTool('pointer');
      renderPdf(file);
      message.success('Croppolás kész');
    } catch {
      message.error('Croppolási hiba');
    }
  };

  // ── Merge handler ──────────────────────────────────────────────────────────
  const handleMerge = async (files: File[]) => {
    if (!pdfFileRef.current || files.length === 0) return;
    setMerging(true);
    try {
      const formData = new FormData();
      formData.append('pdfs', pdfFileRef.current);
      for (const f of files) {
        formData.append('pdfs', f);
      }
      const resp = await api.post('printshop/pdf-merge/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
        timeout: 60000,
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const file = new File([blob], 'merged.pdf', { type: 'application/pdf' });
      renderPdf(file);
      message.success('PDF összefűzés kész');
    } catch {
      message.error('PDF összefűzési hiba');
    } finally {
      setMerging(false);
    }
  };

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!pdfFileRef.current) return;
    setExporting(true);
    try {
      const glPt = guidelines.map(g => {
        const info = pageInfos[g.page - 1];
        if (!info) return null;
        return {
          orientation: g.orientation,
          position: g.orientation === 'h' ? g.position * info.heightPt : g.position * info.widthPt,
          page: g.page,
        };
      }).filter(Boolean);

      const options: any = {};
      if (cropRect) {
        const info = pageInfos[currentPage - 1];
        if (info) {
          options.crop = {
            x: cropRect.x * info.widthPt,
            y: cropRect.y * info.heightPt,
            w: cropRect.w * info.widthPt,
            h: cropRect.h * info.heightPt,
          };
        }
      }
      if (glPt.length > 0) options.guidelines = glPt;

      const formData = new FormData();
      formData.append('pdf', pdfFileRef.current);
      formData.append('options', JSON.stringify(options));

      const resp = await api.post('printshop/pdf-export/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
        timeout: 60000,
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('PDF exportálva');
    } catch {
      message.error('Export hiba');
    } finally {
      setExporting(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const curInfo = pageInfos[currentPage - 1] ?? null;
  const pageMmW = curInfo ? +(curInfo.widthPt * PT_TO_MM).toFixed(1) : null;
  const pageMmH = curInfo ? +(curInfo.heightPt * PT_TO_MM).toFixed(1) : null;
  const trimMmW = curInfo?.trimBox ? +(curInfo.trimBox.w * PT_TO_MM).toFixed(1) : null;
  const trimMmH = curInfo?.trimBox ? +(curInfo.trimBox.h * PT_TO_MM).toFixed(1) : null;
  const hasTrimBox = curInfo?.trimBox != null;

  const trimBoxRel = curInfo?.trimBox ? {
    x: curInfo.trimBox.x / curInfo.widthPt,
    y: curInfo.trimBox.y / curInfo.heightPt,
    w: curInfo.trimBox.w / curInfo.widthPt,
    h: curInfo.trimBox.h / curInfo.heightPt,
  } : null;

  const getPageTrimBoxRel = (pageIdx: number) => {
    const info = pageInfos[pageIdx];
    if (!info?.trimBox) return null;
    return {
      x: info.trimBox.x / info.widthPt,
      y: info.trimBox.y / info.heightPt,
      w: info.trimBox.w / info.widthPt,
      h: info.trimBox.h / info.heightPt,
    };
  };

  const calcMeasureDist = (ml: MeasureLine) => {
    const info = pageInfos[ml.page - 1];
    if (!info) return null;
    const dx = (ml.x2 - ml.x1) * info.widthPt * PT_TO_MM;
    const dy = (ml.y2 - ml.y1) * info.heightPt * PT_TO_MM;
    return +Math.sqrt(dx * dx + dy * dy).toFixed(1);
  };
  const activeMeasureDist = activeMeasure ? calcMeasureDist(activeMeasure) : null;

  const cursorMm = (() => {
    if (!cursorPos || !curInfo) return null;
    if (trimBoxRel) {
      return {
        x: +((cursorPos.x - trimBoxRel.x) * curInfo.widthPt * PT_TO_MM).toFixed(1),
        y: +((cursorPos.y - trimBoxRel.y) * curInfo.heightPt * PT_TO_MM).toFixed(1),
      };
    }
    return relToMm(cursorPos.x, cursorPos.y);
  })();

  const rgbToCmyk = (r: number, g: number, b: number) => {
    const r1 = r / 255, g1 = g / 255, b1 = b / 255;
    const k = 1 - Math.max(r1, g1, b1);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - r1 - k) / (1 - k)) * 100),
      m: Math.round(((1 - g1 - k) / (1 - k)) * 100),
      y: Math.round(((1 - b1 - k) / (1 - k)) * 100),
      k: Math.round(k * 100),
    };
  };

  const curPageCS = pageColorSpaces[currentPage - 1];
  const hasCMYK = curPageCS?.has('CMYK');

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f0f2f5', position: 'relative' }}>
      {/* Lock overlay */}
      {locked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <LockOutlined style={{ fontSize: 48, color: '#fff' }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>A preview zárolva van</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Az admin engedélyezése szükséges a kommenteléshez</Text>
        </div>
      )}

      {/* ── Page thumbnails sidebar ── */}
      {pdfPages.length > 0 && (
        <div style={{
          width: 130, flexShrink: 0, borderRight: '1px solid #e8e8e8',
          background: '#fff', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <Text strong style={{ fontSize: 11, textAlign: 'center', color: '#666', padding: '8px 4px 4px', flexShrink: 0 }}>Oldalak</Text>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pdfPages.map((src, idx) => {
            const cs = pageColorSpaces[idx];
            return (
              <Dropdown
                key={idx}
                trigger={['contextMenu']}
                menu={{
                  items: [
                    {
                      key: 'delete',
                      label: 'Oldal törlése',
                      icon: <DeleteOutlined />,
                      danger: true,
                      disabled: pdfPages.length <= 1,
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'delete') handleDeletePage(idx);
                  },
                }}
              >
              <div
                draggable
                onDragStart={e => {
                  dragPageIdx.current = idx;
                  e.dataTransfer.effectAllowed = 'move';
                  // Transparent drag image — we show our own indicator
                  const el = e.currentTarget;
                  e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 20);
                }}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIdx !== idx) setDragOverIdx(idx);
                }}
                onDragLeave={() => { if (dragOverIdx === idx) setDragOverIdx(null); }}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverIdx(null);
                  if (dragPageIdx.current !== null && dragPageIdx.current !== idx) {
                    handlePageReorder(dragPageIdx.current, idx);
                  }
                  dragPageIdx.current = null;
                }}
                onDragEnd={() => { dragPageIdx.current = null; setDragOverIdx(null); }}
                onClick={() => scrollToPage(idx + 1)}
                style={{
                  cursor: 'grab', borderRadius: 4, overflow: 'hidden', flexShrink: 0,
                  borderLeft: currentPage === idx + 1 ? '2px solid #1890ff' : '2px solid transparent',
                  borderRight: currentPage === idx + 1 ? '2px solid #1890ff' : '2px solid transparent',
                  borderBottom: currentPage === idx + 1 ? '2px solid #1890ff' : '2px solid transparent',
                  borderTop: dragOverIdx === idx && dragPageIdx.current !== idx
                    ? '3px solid #1890ff'
                    : currentPage === idx + 1 ? '2px solid #1890ff' : '2px solid transparent',
                  background: currentPage === idx + 1 ? '#e6f4ff' : '#fafafa',
                  padding: 4, textAlign: 'center',
                  opacity: dragPageIdx.current === idx ? 0.4 : 1,
                  transition: 'border-top 0.15s, opacity 0.15s',
                }}
              >
                <img src={src} alt={`${idx + 1}. oldal`} style={{ width: '100%', display: 'block', borderRadius: 2 }} />
                <Text style={{ fontSize: 10, color: '#666' }}>{idx + 1}. oldal</Text>
                {cs && cs.size > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2, justifyContent: 'center' }}>
                    {cs.has('CMYK') && <Tag color="blue" style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}>CMYK</Tag>}
                    {cs.has('RGB') && <Tag color="green" style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}>RGB</Tag>}
                    {cs.has('PANTONE') && <Tag color="purple" style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}>PANTONE</Tag>}
                    {cs.has('Spot') && !cs.has('PANTONE') && <Tag color="orange" style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}>Spot</Tag>}
                    {cs.has('Gray') && <Tag style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}>Gray</Tag>}
                  </div>
                )}
              </div>
              </Dropdown>
            );
          })}
          </div>
        </div>
      )}

      {/* ── Center: PDF viewer + overlay ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 8 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <Upload accept=".pdf" showUploadList={false} beforeUpload={file => { renderPdf(file); return false; }}>
            <Button icon={<FilePdfOutlined />} size="small">PDF betöltése</Button>
          </Upload>
          {pdfPages.length > 0 && (
            <>
              <Tooltip title="Visszavonás (Ctrl+Z)">
                <Button size="small" icon={<UndoOutlined />} onClick={undo} disabled={historyLen === 0} />
              </Tooltip>
              <Tooltip title="Újra (Ctrl+Y)">
                <Button size="small" icon={<RedoOutlined />} onClick={redo} disabled={redoLen === 0} />
              </Tooltip>
              <Tooltip title="Mindent töröl">
                <Button size="small" danger icon={<ClearOutlined />} onClick={() => {
                  Modal.confirm({
                    title: 'Mindent töröl',
                    content: 'Biztosan törölni szeretnéd az összes annotációt, segédvonalat, mérést és cropot?',
                    okText: 'Törlés',
                    cancelText: 'Mégse',
                    okButtonProps: { danger: true },
                    onOk: () => {
                      pushHistory();
                      setAnnotations([]);
                      setGuidelines([]);
                      setMeasureLines([]);
                      setCropRect(null);
                      setActiveMeasure(null);
                      setMeasuring(false);
                      setMeasuringStart(null);
                      setSelectedElement(null);
                      setActiveTool('pointer');
                      message.success('Minden törölve');
                    },
                  });
                }} />
              </Tooltip>
              <Divider type="vertical" />
              <Segmented
                size="small"
                value={activeTool}
                onChange={v => { setActiveTool(v as CommentToolType); setMeasureLines([]); setActiveMeasure(null); setMeasuring(false); setMeasuringStart(null); setSelectedElement(null); }}
                options={[
                  { value: 'pointer', label: <Tooltip title="Mutató"><SelectOutlined /></Tooltip> },
                  { value: 'area', label: 'Terület' },
                  { value: 'pin', label: 'Jelölő' },
                  { value: 'arrow', label: 'Nyíl' },
                  { value: 'measure', label: 'Mérő' },
                  { value: 'guideline', label: <Tooltip title="Segédvonal"><DragOutlined /></Tooltip> },
                  { value: 'crop', label: <Tooltip title="Croppolás"><ScissorOutlined /></Tooltip> },
                ]}
              />
              <Divider type="vertical" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Tooltip title="Kicsinyítés"><Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} disabled={zoomLevel <= ZOOM_MIN} /></Tooltip>
                <Tooltip title="Eredeti méret">
                  <Button size="small" type="text" style={{ fontSize: 11, minWidth: 44, padding: '0 4px' }} onClick={zoomReset}>
                    {Math.round(zoomLevel * 100)}%
                  </Button>
                </Tooltip>
                <Tooltip title="Nagyítás"><Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} disabled={zoomLevel >= ZOOM_MAX} /></Tooltip>
              </div>
              <Divider type="vertical" />
              <Upload accept=".pdf" multiple showUploadList={false} beforeUpload={(file, fileList) => {
                if (fileList && fileList.length > 0 && file === fileList[fileList.length - 1]) {
                  handleMerge(fileList as unknown as File[]);
                }
                return false;
              }}>
                <Tooltip title="PDF összefűzés"><Button icon={<MergeCellsOutlined />} size="small" loading={merging}>Összefűzés</Button></Tooltip>
              </Upload>
              <Tooltip title="Export (színterek megőrzésével)">
                <Button icon={<ExportOutlined />} size="small" onClick={handleExport} loading={exporting}>Export</Button>
              </Tooltip>
            </>
          )}
          {(measureLines.length > 0 || (activeMeasure && activeMeasureDist != null)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <ColumnWidthOutlined style={{ color: '#fa8c16' }} />
              {measureLines.map((ml, idx) => {
                const d = calcMeasureDist(ml);
                return d != null ? (
                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <Text strong style={{ fontSize: 12, color: '#fa8c16' }}>{d} mm</Text>
                    <Button size="small" type="text" style={{ padding: '0 2px', minWidth: 0 }}
                      icon={<CloseOutlined style={{ fontSize: 10 }} />}
                      onClick={() => { pushHistory(); setMeasureLines(prev => prev.filter((_, i) => i !== idx)); }} />
                  </span>
                ) : null;
              })}
              {activeMeasure && activeMeasureDist != null && (
                <Text strong style={{ fontSize: 12, color: '#fa8c16', opacity: 0.6 }}>{activeMeasureDist} mm</Text>
              )}
              <Button size="small" type="text" icon={<CloseOutlined />}
                onClick={() => { setMeasureLines([]); setActiveMeasure(null); setMeasuring(false); setMeasuringStart(null); }}
              />
            </div>
          )}
        </div>

        {/* Guideline sub-toolbar */}
        {activeTool === 'guideline' && pdfPages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, fontSize: 11, color: '#555' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <DragOutlined style={{ color: '#1890ff' }} />
              <Button size="small" icon={<PlusOutlined />} onClick={() => addGuideline('h')}>Vízszintes</Button>
              <Button size="small" icon={<PlusOutlined />} onClick={() => addGuideline('v')}>Függőleges</Button>
              <Divider type="vertical" style={{ margin: '0 2px' }} />
              <span style={{ fontSize: 10, color: '#888' }}>Pontos pozíció (mm):</span>
              <InputNumber
                size="small" style={{ width: 70 }} min={0} step={0.5} placeholder="X mm"
                onPressEnter={e => {
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (!isNaN(v)) { addGuidelineAtMm('v', v); (e.target as HTMLInputElement).value = ''; }
                }}
              />
              <InputNumber
                size="small" style={{ width: 70 }} min={0} step={0.5} placeholder="Y mm"
                onPressEnter={e => {
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (!isNaN(v)) { addGuidelineAtMm('h', v); (e.target as HTMLInputElement).value = ''; }
                }}
              />
              {guidelines.length > 0 && (
                <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={clearGuidelines}>Összes törlése</Button>
              )}
            </div>
            {guidelines.filter(g => g.page === currentPage).length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {guidelines.filter(g => g.page === currentPage).map(g => {
                  const info = pageInfos[g.page - 1];
                  const dim = info ? (g.orientation === 'h' ? info.heightPt : info.widthPt) : 0;
                  const mm = +(g.position * dim * PT_TO_MM).toFixed(1);
                  return (
                    <Tag
                      key={g.id}
                      closable
                      onClose={() => removeGuideline(g.id)}
                      color={g.orientation === 'h' ? 'cyan' : 'geekblue'}
                      style={{ fontSize: 10, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                    >
                      {g.orientation === 'h' ? 'V' : 'F'}
                      <InputNumber
                        size="small"
                        style={{ width: 58, marginLeft: 2 }}
                        value={mm}
                        min={0}
                        step={0.5}
                        controls={false}
                        onChange={v => { if (v != null) updateGuidelineMm(g.id, v); }}
                      />
                      mm
                    </Tag>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Crop sub-toolbar */}
        {activeTool === 'crop' && pdfPages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 11, color: '#555', flexWrap: 'wrap' }}>
            <ScissorOutlined style={{ color: '#fa541c' }} />
            <span style={{ fontSize: 10, color: '#888' }}>X:</span>
            <InputNumber
              size="small" style={{ width: 65 }} min={0} step={0.5}
              value={cropRect && curInfo ? +(cropRect.x * curInfo.widthPt * PT_TO_MM).toFixed(1) : undefined}
              placeholder="0"
              onChange={v => {
                if (v == null || !curInfo) return;
                const rx = (v * MM_TO_PT) / curInfo.widthPt;
                setCropRect(prev => prev ? { ...prev, x: Math.max(0, Math.min(1, rx)) } : { x: Math.max(0, Math.min(1, rx)), y: 0, w: 0.5, h: 0.5 });
              }}
            />
            <span style={{ fontSize: 10, color: '#888' }}>Y:</span>
            <InputNumber
              size="small" style={{ width: 65 }} min={0} step={0.5}
              value={cropRect && curInfo ? +(cropRect.y * curInfo.heightPt * PT_TO_MM).toFixed(1) : undefined}
              placeholder="0"
              onChange={v => {
                if (v == null || !curInfo) return;
                const ry = (v * MM_TO_PT) / curInfo.heightPt;
                setCropRect(prev => prev ? { ...prev, y: Math.max(0, Math.min(1, ry)) } : { x: 0, y: Math.max(0, Math.min(1, ry)), w: 0.5, h: 0.5 });
              }}
            />
            <span style={{ fontSize: 10, color: '#888' }}>Sz:</span>
            <InputNumber
              size="small" style={{ width: 65 }} min={0} step={0.5}
              value={cropRect && curInfo ? +(cropRect.w * curInfo.widthPt * PT_TO_MM).toFixed(1) : undefined}
              placeholder="W"
              onChange={v => {
                if (v == null || !curInfo) return;
                const rw = (v * MM_TO_PT) / curInfo.widthPt;
                setCropRect(prev => prev ? { ...prev, w: Math.max(0, Math.min(1 - prev.x, rw)) } : { x: 0, y: 0, w: Math.min(1, rw), h: 0.5 });
              }}
            />
            <span style={{ fontSize: 10, color: '#888' }}>Ma:</span>
            <InputNumber
              size="small" style={{ width: 65 }} min={0} step={0.5}
              value={cropRect && curInfo ? +(cropRect.h * curInfo.heightPt * PT_TO_MM).toFixed(1) : undefined}
              placeholder="H"
              onChange={v => {
                if (v == null || !curInfo) return;
                const rh = (v * MM_TO_PT) / curInfo.heightPt;
                setCropRect(prev => prev ? { ...prev, h: Math.max(0, Math.min(1 - prev.y, rh)) } : { x: 0, y: 0, w: 0.5, h: Math.min(1, rh) });
              }}
            />
            <span style={{ fontSize: 10, color: '#aaa' }}>mm</span>
            {cropRect && cropRect.w > 0.001 && cropRect.h > 0.001 ? (
              <>
                <Button size="small" type="primary" onClick={applyCrop}>Alkalmaz</Button>
                <Button size="small" onClick={() => setCropRect(null)}>Mégse</Button>
              </>
            ) : (
              <Text type="secondary" style={{ fontSize: 10 }}>Húzz téglalapot vagy adj meg koordinátákat</Text>
            )}
            {guidelines.filter(g => g.page === currentPage).length > 0 && (
              <Tooltip title="A crop élei a közeli segédvonalakhoz igazodnak">
                <Tag color="cyan" style={{ fontSize: 9, margin: 0, cursor: 'default' }}>Snap aktív</Tag>
              </Tooltip>
            )}
          </div>
        )}

        {/* PDF info bar */}
        {pdfPages.length > 0 && curInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#888', flexShrink: 0, flexWrap: 'wrap' }}>
            {pdfPages.length > 1 && <span><strong>{currentPage}/{pdfPages.length}</strong></span>}
            <span>Lap: <strong>{pageMmW}×{pageMmH} mm</strong></span>
            {hasTrimBox ? (
              <span>
                TrimBox (vágott méret): <strong>{trimMmW}×{trimMmH} mm</strong>
                <Tooltip title={showTrimBox ? 'TrimBox elrejtése' : 'TrimBox megjelenítése'}>
                  <Button size="small" type="text" style={{ fontSize: 10, marginLeft: 2, padding: '0 4px' }}
                    onClick={() => setShowTrimBox(v => !v)}>
                    {showTrimBox ? '👁' : '👁‍🗨'}
                  </Button>
                </Tooltip>
              </span>
            ) : (
              <span style={{ color: '#fa8c16' }}>⚠ Nincs TrimBox a PDF-ben</span>
            )}
            {activeTool === 'pointer' && pageElements.length > 0 && (!pageElements[currentPage - 1] || pageElements[currentPage - 1].length === 0) && (
              <span style={{ color: '#fa8c16', fontSize: 11 }}>ℹ Az oldal nem elemekre bontott</span>
            )}
            {cursorMm && (
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, color: '#555', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>X: {cursorMm.x} mm &nbsp; Y: {cursorMm.y} mm</span>
                {cursorColor && (
                  <>
                    <span style={{
                      display: 'inline-block', width: 14, height: 14, borderRadius: 2,
                      background: `rgb(${cursorColor.r},${cursorColor.g},${cursorColor.b})`,
                      border: '1px solid #ccc', flexShrink: 0,
                    }} />
                    {hasCMYK ? (() => {
                      if (cursorSpotName) {
                        return <span style={{ color: '#722ed1', fontWeight: 600 }}>{cursorSpotName}</span>;
                      }
                      const cmyk = rgbToCmyk(cursorColor.r, cursorColor.g, cursorColor.b);
                      return <span>C:{cmyk.c} M:{cmyk.m} Y:{cmyk.y} K:{cmyk.k}</span>;
                    })() : (
                      cursorSpotName
                        ? <span style={{ color: '#722ed1', fontWeight: 600 }}>{cursorSpotName}</span>
                        : <span>R:{cursorColor.r} G:{cursorColor.g} B:{cursorColor.b}</span>
                    )}
                  </>
                )}
              </span>
            )}
          </div>
        )}

        {/* PDF + overlay */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '16px 0' }}>
          {loadingPdf ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, width: '100%', gap: 16 }}>
              <Spin size="large" />
              <Progress percent={loadingProgress} style={{ width: 260 }} size="small" strokeColor={{ '0%': '#1890ff', '100%': '#52c41a' }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>PDF betöltése… {loadingProgress}%</Typography.Text>
            </div>
          ) : pdfPages.length === 0 ? (
            <Upload accept=".pdf" showUploadList={false} beforeUpload={file => { renderPdf(file); return false; }}>
              <div style={{
                border: '2px dashed #d9d9d9', borderRadius: 8, padding: 48,
                cursor: 'pointer', color: '#999', textAlign: 'center', background: '#fff',
              }}>
                <FilePdfOutlined style={{ fontSize: 48, marginBottom: 12 }} />
                <div>Húzz ide egy PDF fájlt, vagy kattints a betöltéshez</div>
              </div>
            </Upload>
          ) : (
            pdfPages.map((pageSrc, pageIdx) => {
              const pageNum = pageIdx + 1;
              const pInfo = pageInfos[pageIdx];
              const pTrimBoxRel = getPageTrimBoxRel(pageIdx);
              const pTrimMmW = pInfo?.trimBox ? +(pInfo.trimBox.w * PT_TO_MM).toFixed(1) : null;
              const pTrimMmH = pInfo?.trimBox ? +(pInfo.trimBox.h * PT_TO_MM).toFixed(1) : null;
              const pAnnotations = annotations.filter(a => a.page === pageNum);
              const pMeasureLines = measureLines.filter(ml => ml.page === pageNum);
              const pActiveMeasure = activeMeasure && activeMeasure.page === pageNum ? activeMeasure : null;
              const pActiveMeasureDist = pActiveMeasure ? calcMeasureDist(pActiveMeasure) : null;
              const showPending = pendingPage === pageNum;

              return (
                <div key={pageIdx} ref={el => { pageRefs.current[pageIdx] = el; }} style={{ display: 'inline-block', zoom: zoomLevel }}>
                  {/* Page number label */}
                  {pdfPages.length > 1 && (
                    <div style={{ textAlign: 'center', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{pageNum}. oldal</Text>
                    </div>
                  )}
                  {/* Image + overlays wrapper (position anchor) */}
                  <div style={{ position: 'relative', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                  <img
                    src={pageSrc}
                    alt={`oldal ${pageNum}`}
                    style={{ display: 'block', maxWidth: '100%', userSelect: 'none' }}
                    draggable={false}
                  />

                  {/* TrimBox overlay */}
                  {showTrimBox && pTrimBoxRel && (
                    <>
                      <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        background: 'linear-gradient(rgba(0,0,0,0.06), rgba(0,0,0,0.06))',
                        clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${pTrimBoxRel.x*100}% ${pTrimBoxRel.y*100}%, ${pTrimBoxRel.x*100}% ${(pTrimBoxRel.y+pTrimBoxRel.h)*100}%, ${(pTrimBoxRel.x+pTrimBoxRel.w)*100}% ${(pTrimBoxRel.y+pTrimBoxRel.h)*100}%, ${(pTrimBoxRel.x+pTrimBoxRel.w)*100}% ${pTrimBoxRel.y*100}%, ${pTrimBoxRel.x*100}% ${pTrimBoxRel.y*100}%)`,
                        zIndex: 1,
                      }} />
                      <div style={{
                        position: 'absolute',
                        left: `${pTrimBoxRel.x*100}%`, top: `${pTrimBoxRel.y*100}%`,
                        width: `${pTrimBoxRel.w*100}%`, height: `${pTrimBoxRel.h*100}%`,
                        border: '1px dashed rgba(255,0,0,0.5)',
                        pointerEvents: 'none', zIndex: 2, boxSizing: 'border-box',
                      }}>
                        <span style={{
                          position: 'absolute', top: -16, left: 0,
                          fontSize: 9, background: 'rgba(255,0,0,0.7)', color: '#fff',
                          padding: '0 4px', borderRadius: 2, whiteSpace: 'nowrap',
                        }}>TrimBox {pTrimMmW}×{pTrimMmH}</span>
                      </div>
                    </>
                  )}

                  {/* Interaction overlay */}
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 10,
                      cursor: activeTool === 'pointer' ? 'grab'
                        : activeTool === 'crop' ? 'crosshair'
                        : activeTool === 'guideline' ? 'default'
                        : 'crosshair',
                    }}
                    onMouseDown={e => {
                      if (activeTool === 'crop') { handleCropMouseDown(e, pageNum); return; }
                      handleMouseDown(e, pageNum);
                    }}
                    onMouseMove={e => {
                      if (activeTool === 'crop') { handleCropMouseMove(e); }
                      handleMouseMove(e, pageNum);
                    }}
                    onMouseUp={e => {
                      if (activeTool === 'crop') { handleCropMouseUp(); return; }
                      handleMouseUp(e);
                    }}
                    onMouseLeave={handleMouseLeave}
                    onDoubleClick={() => setSelectedElement(null)}
                  >

                    {/* Guidelines on this page */}
                    {guidelines.filter(g => g.page === pageNum).map(g => (
                      <div
                        key={g.id}
                        style={{
                          position: 'absolute',
                          ...(g.orientation === 'h'
                            ? { left: 0, right: 0, top: `${g.position * 100}%`, height: 0, borderTop: '1px dashed #00bcd4', cursor: 'ns-resize' }
                            : { top: 0, bottom: 0, left: `${g.position * 100}%`, width: 0, borderLeft: '1px dashed #00bcd4', cursor: 'ew-resize' }),
                          zIndex: 18, pointerEvents: 'auto',
                        }}
                        onMouseDown={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          pushHistory();
                          const parentEl = e.currentTarget.parentElement!;
                          const guideId = g.id;
                          const orient = g.orientation;
                          const onMove = (ev: MouseEvent) => {
                            const rect = parentEl.getBoundingClientRect();
                            const pos = orient === 'h'
                              ? Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
                              : Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                            setGuidelines(prev => prev.map(gg => gg.id === guideId ? { ...gg, position: pos } : gg));
                          };
                          const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                          };
                          document.addEventListener('mousemove', onMove);
                          document.addEventListener('mouseup', onUp);
                        }}
                      >
                        {/* Guideline label */}
                        <div style={{
                          position: 'absolute',
                          ...(g.orientation === 'h'
                            ? { left: 2, top: -12 }
                            : { top: 2, left: 4 }),
                          fontSize: 9, color: '#00bcd4', background: 'rgba(255,255,255,0.9)',
                          padding: '0 3px', borderRadius: 2, whiteSpace: 'nowrap',
                          pointerEvents: 'auto', cursor: 'pointer',
                          zoom: 1 / zoomLevel,
                        }}>
                          {pInfo && (g.orientation === 'h'
                            ? `${(g.position * pInfo.heightPt * PT_TO_MM).toFixed(1)} mm`
                            : `${(g.position * pInfo.widthPt * PT_TO_MM).toFixed(1)} mm`
                          )}
                          <span
                            style={{ marginLeft: 4, color: '#ff4d4f', cursor: 'pointer', fontWeight: 700 }}
                            onClick={e => { e.stopPropagation(); removeGuideline(g.id); }}
                          >×</span>
                        </div>
                        {/* Wider hit area */}
                        <div style={{
                          position: 'absolute',
                          ...(g.orientation === 'h'
                            ? { left: 0, right: 0, top: -4, height: 9 }
                            : { top: 0, bottom: 0, left: -4, width: 9 }),
                          cursor: g.orientation === 'h' ? 'ns-resize' : 'ew-resize',
                        }} />
                      </div>
                    ))}

                    {/* Crop overlay */}
                    {cropRect && cropRect.w > 0.001 && cropRect.h > 0.001 && (
                      <>
                        {/* Darken outside crop */}
                        <div style={{
                          position: 'absolute', inset: 0, pointerEvents: 'none',
                          background: 'rgba(0,0,0,0.35)',
                          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${cropRect.x*100}% ${cropRect.y*100}%, ${cropRect.x*100}% ${(cropRect.y+cropRect.h)*100}%, ${(cropRect.x+cropRect.w)*100}% ${(cropRect.y+cropRect.h)*100}%, ${(cropRect.x+cropRect.w)*100}% ${cropRect.y*100}%, ${cropRect.x*100}% ${cropRect.y*100}%)`,
                          zIndex: 19,
                        }} />
                        {/* Crop rectangle border */}
                        <div style={{
                          position: 'absolute',
                          left: `${cropRect.x*100}%`, top: `${cropRect.y*100}%`,
                          width: `${cropRect.w*100}%`, height: `${cropRect.h*100}%`,
                          border: '2px dashed #fa541c',
                          pointerEvents: 'none', zIndex: 20, boxSizing: 'border-box',
                        }}>
                          <span style={{
                            position: 'absolute', top: -16, left: 0,
                            fontSize: 9, background: '#fa541c', color: '#fff',
                            padding: '0 4px', borderRadius: 2, whiteSpace: 'nowrap',
                            zoom: 1 / zoomLevel,
                          }}>
                            Crop {pInfo ? `${Math.round(cropRect.w * pInfo.widthPt * PT_TO_MM)}×${Math.round(cropRect.h * pInfo.heightPt * PT_TO_MM)} mm` : ''}
                          </span>
                        </div>
                      </>
                    )}
                    {/* Existing annotations */}
                    {pAnnotations.map(a => {
                      // ── Pin ──
                      if ((a.type ?? 'area') === 'pin') {
                        return (
                          <div key={a.id}
                            onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}
                            style={{
                              position: 'absolute',
                              left: `calc(${a.x*100}% - 10px)`, top: `calc(${a.y*100}% - 10px)`,
                              width: 20, height: 20, borderRadius: '50%',
                              background: a.color, border: '2px solid #fff',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, color: '#fff', fontWeight: 700,
                              opacity: a.resolved ? 0.4 : 1, zIndex: 5,
                            }}
                          >
                            <CommentOutlined />
                            {a.id === selectedId && (
                              <div onClick={e => e.stopPropagation()} style={{
                                position: 'absolute', top: 22, left: -10, zIndex: 100,
                                background: '#fff', borderRadius: 6,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                                padding: 10, minWidth: 220, maxWidth: 280,
                                border: `1.5px solid ${a.color}`,
                              }}>
                                <CommentPopup a={a} isAdmin={isAdmin} onResolve={handleResolve} onDelete={handleDeleteAnnotation} />
                              </div>
                            )}
                          </div>
                        );
                      }
                      // ── Arrow ──
                      if ((a.type ?? 'area') === 'arrow' && a.x2 != null && a.y2 != null) {
                        return (
                          <React.Fragment key={a.id}>
                            <svg style={{
                              position: 'absolute', inset: 0, width: '100%', height: '100%',
                              pointerEvents: 'none', overflow: 'visible', zIndex: 4,
                              opacity: a.resolved ? 0.4 : 1,
                            }}>
                              <defs>
                                <marker id={`pah-${a.id}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                  <polygon points="0 0, 10 3.5, 0 7" fill={a.color} />
                                </marker>
                              </defs>
                              <line
                                x1={`${a.x*100}%`} y1={`${a.y*100}%`}
                                x2={`${a.x2*100}%`} y2={`${a.y2*100}%`}
                                stroke={a.color} strokeWidth={2.5}
                                markerEnd={`url(#pah-${a.id})`}
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}
                              />
                              <line
                                x1={`${a.x*100}%`} y1={`${a.y*100}%`}
                                x2={`${a.x2*100}%`} y2={`${a.y2*100}%`}
                                stroke="transparent" strokeWidth={12}
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}
                              />
                              {a.text && (
                                <foreignObject
                                  x={`${((a.x+a.x2)*50)}%`} y={`${((a.y+a.y2)*50)}%`}
                                  width="1" height="1" style={{ overflow: 'visible' }}
                                >
                                  <div style={{
                                    transform: 'translate(-50%, -20px)',
                                    fontSize: 10, background: a.color, color: '#fff',
                                    padding: '1px 6px', borderRadius: 3, textAlign: 'center',
                                    whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                                    pointerEvents: 'auto', cursor: 'pointer',
                                  }} onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}>
                                    {a.text}
                                  </div>
                                </foreignObject>
                              )}
                            </svg>
                            {a.id === selectedId && (
                              <div onClick={e => e.stopPropagation()} style={{
                                position: 'absolute',
                                left: `${((a.x+(a.x2!))/2)*100}%`, top: `${((a.y+(a.y2!))/2)*100}%`,
                                zIndex: 100, background: '#fff', borderRadius: 6,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                                padding: 10, minWidth: 220, maxWidth: 280,
                                border: `1.5px solid ${a.color}`,
                                transform: 'translate(-50%, 8px)',
                              }}>
                                <CommentPopup a={a} isAdmin={isAdmin} onResolve={handleResolve} onDelete={handleDeleteAnnotation} />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      }
                      // ── Area (default) ──
                      return (
                        <div key={a.id}
                          onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}
                          style={{
                            position: 'absolute',
                            left: `${a.x*100}%`, top: `${a.y*100}%`,
                            width: `${a.w*100}%`, height: `${a.h*100}%`,
                            border: `2px solid ${a.color}`,
                            background: `${a.color}11`,
                            boxSizing: 'border-box', cursor: 'pointer',
                            opacity: a.resolved ? 0.4 : 1, zIndex: 3,
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: -10, right: -10,
                            background: a.color, color: '#fff', borderRadius: '50%',
                            width: 18, height: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, lineHeight: 1,
                          }}><MessageOutlined /></div>
                          {a.id === selectedId && (
                            <div onClick={e => e.stopPropagation()} style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 100,
                              background: '#fff', borderRadius: 6,
                              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                              padding: 10, minWidth: 220, maxWidth: 280,
                              border: `1.5px solid ${a.color}`,
                            }}>
                              <CommentPopup a={a} isAdmin={isAdmin} onResolve={handleResolve} onDelete={handleDeleteAnnotation} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Pending shape */}
                    {showPending && pendingShape && (
                      <>
                        {pendingShape.type === 'area' && pendingShape.w > 0.005 && (
                          <div style={{
                            position: 'absolute',
                            left: `${pendingShape.x*100}%`, top: `${pendingShape.y*100}%`,
                            width: `${pendingShape.w*100}%`, height: `${pendingShape.h*100}%`,
                            border: '2px dashed #1890ff', background: 'rgba(24,144,255,0.06)',
                            boxSizing: 'border-box', pointerEvents: 'none',
                          }} />
                        )}
                        {pendingShape.type === 'pin' && (
                          <div style={{
                            position: 'absolute',
                            left: `calc(${pendingShape.x*100}% - 10px)`, top: `calc(${pendingShape.y*100}% - 10px)`,
                            width: 20, height: 20, borderRadius: '50%',
                            background: '#1890ff', border: '2px dashed #fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: '#fff', pointerEvents: 'none',
                          }}><CommentOutlined /></div>
                        )}
                        {pendingShape.type === 'arrow' && pendingShape.x2 != null && pendingShape.y2 != null && (
                          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                            <defs>
                              <marker id={`pah-draft-${pageNum}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#1890ff" />
                              </marker>
                            </defs>
                            <line
                              x1={`${pendingShape.x*100}%`} y1={`${pendingShape.y*100}%`}
                              x2={`${pendingShape.x2*100}%`} y2={`${pendingShape.y2*100}%`}
                              stroke="#1890ff" strokeWidth={2.5} strokeDasharray="6 3"
                              markerEnd={`url(#pah-draft-${pageNum})`}
                            />
                          </svg>
                        )}
                      </>
                    )}

                    {/* Measure lines */}
                    {(pMeasureLines.length > 0 || pActiveMeasure) && (
                      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 20 }}>
                        <defs>
                          <marker id={`meas-dot-${pageNum}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                            <circle cx="3" cy="3" r="2.5" fill="#fa8c16" />
                          </marker>
                        </defs>
                        {pMeasureLines.map((ml, idx) => {
                          const d = calcMeasureDist(ml);
                          return (
                            <React.Fragment key={idx}>
                              <line
                                x1={`${ml.x1*100}%`} y1={`${ml.y1*100}%`}
                                x2={`${ml.x2*100}%`} y2={`${ml.y2*100}%`}
                                stroke="#fa8c16" strokeWidth={1.5} strokeDasharray="4 2"
                                markerStart={`url(#meas-dot-${pageNum})`} markerEnd={`url(#meas-dot-${pageNum})`}
                              />
                              {d != null && (
                                <foreignObject
                                  x={`${((ml.x1+ml.x2)/2)*100}%`}
                                  y={`${((ml.y1+ml.y2)/2)*100}%`}
                                  width="1" height="1" style={{ overflow: 'visible' }}
                                >
                                  <div style={{
                                    transform: 'translate(-40px, -20px)',
                                    background: '#fa8c16', color: '#fff', fontSize: 10,
                                    padding: '1px 6px', borderRadius: 3, textAlign: 'center',
                                    whiteSpace: 'nowrap', display: 'inline-block',
                                  }}>{d} mm</div>
                                </foreignObject>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {pActiveMeasure && (
                          <>
                            <line
                              x1={`${pActiveMeasure.x1*100}%`} y1={`${pActiveMeasure.y1*100}%`}
                              x2={`${pActiveMeasure.x2*100}%`} y2={`${pActiveMeasure.y2*100}%`}
                              stroke="#fa8c16" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.6}
                              markerStart={`url(#meas-dot-${pageNum})`} markerEnd={`url(#meas-dot-${pageNum})`}
                            />
                            {pActiveMeasureDist != null && (
                              <foreignObject
                                x={`${((pActiveMeasure.x1+pActiveMeasure.x2)/2)*100}%`}
                                y={`${((pActiveMeasure.y1+pActiveMeasure.y2)/2)*100}%`}
                                width="1" height="1" style={{ overflow: 'visible' }}
                              >
                                <div style={{
                                  transform: 'translate(-40px, -20px)',
                                  background: '#fa8c16', color: '#fff', fontSize: 10,
                                  padding: '1px 6px', borderRadius: 3, textAlign: 'center',
                                  whiteSpace: 'nowrap', display: 'inline-block', opacity: 0.6,
                                }}>{pActiveMeasureDist} mm</div>
                              </foreignObject>
                            )}
                          </>
                        )}
                      </svg>
                    )}
                  </div>

                  {/* New comment input box */}
                  {showPending && pendingShape && !drawing && activeTool !== 'measure' && (
                    <div
                      style={{
                        position: 'absolute',
                        left: pendingShape.type === 'arrow' && pendingShape.x2 != null
                          ? `${((pendingShape.x + pendingShape.x2) / 2) * 100}%`
                          : `${pendingShape.x * 100}%`,
                        top: pendingShape.type === 'arrow' && pendingShape.y2 != null
                          ? `${((pendingShape.y + pendingShape.y2) / 2) * 100}%`
                          : pendingShape.type === 'pin'
                            ? `calc(${pendingShape.y * 100}% + 14px)`
                            : `${(pendingShape.y + pendingShape.h) * 100}%`,
                        zIndex: 200, background: '#fff',
                        border: '1.5px solid #1890ff', borderRadius: 6,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        padding: 10, minWidth: 240, maxWidth: 300,
                        transform: pendingShape.type === 'arrow' ? 'translate(-50%, 8px)' : undefined,
                      }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        <CommentOutlined /> Komment hozzáadása
                      </Text>
                      <TextArea
                        autoFocus rows={3} value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        placeholder="Írj kommentet..."
                        style={{ fontSize: 12 }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveComment();
                          if (e.key === 'Escape') cancelPending();
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                        <Button size="small" icon={<CloseOutlined />} onClick={cancelPending}>Mégse</Button>
                        <Button size="small" type="primary" loading={savingComment} disabled={!newComment.trim()} onClick={handleSaveComment}>
                          Mentés <Text style={{ color: '#fff', fontSize: 10, opacity: 0.7 }}> Ctrl+Enter</Text>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Selected element highlight + properties */}
                  {selectedElement && selectedElement.page === pageNum && (() => {
                    const el = selectedElement.element;
                    const typeLabel = el.type === 'image' ? 'Raszteres kép' : el.type === 'vector' ? 'Vektoros' : 'Szöveg';
                    const showBelow = el.y < 0.12;
                    return (
                      <>
                        <div style={{
                          position: 'absolute',
                          left: `${el.x * 100}%`, top: `${el.y * 100}%`,
                          width: `${el.w * 100}%`, height: `${el.h * 100}%`,
                          border: '2px solid #13c2c2', background: 'rgba(19,194,194,0.08)',
                          pointerEvents: 'none', zIndex: 15, boxSizing: 'border-box',
                        }} />
                        <div style={{
                          position: 'absolute',
                          left: `${el.x * 100}%`,
                          top: showBelow ? `${(el.y + el.h) * 100}%` : `${el.y * 100}%`,
                          transform: showBelow ? undefined : 'translateY(-100%)',
                          transformOrigin: showBelow ? 'top left' : 'bottom left',
                          zoom: 1 / zoomLevel,
                          zIndex: 16, pointerEvents: 'none',
                        }}>
                          <div style={{
                            background: '#fff', border: '1px solid #13c2c2', borderRadius: 4,
                            padding: '4px 8px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            whiteSpace: 'nowrap',
                          }}>
                            <div><strong>Típus:</strong> {typeLabel}</div>
                            {el.colorspace && <div><strong>Színtér:</strong> {el.spot ? `Spot${el.spot_name ? ` (${el.spot_name})` : ''}` : el.colorspace}</div>}
                            {el.type === 'image' && el.width_px && el.height_px && (
                              <div><strong>Méret:</strong> {el.width_px}×{el.height_px} px
                                {pInfo && el.w > 0 && (
                                  <> ({Math.round(el.width_px * 72 / (el.w * pInfo.widthPt))} DPI)</>)}
                              </div>
                            )}
                            {el.type === 'text' && el.font && (
                              <div><strong>Betűtípus:</strong> {el.font} {el.font_size ? `${el.font_size}pt` : ''}</div>
                            )}
                            {el.type === 'text' && el.text && (
                              <div><strong>Szöveg:</strong> {el.text.length > 40 ? el.text.substring(0, 40) + '…' : el.text}</div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  </div>{/* end image+overlays wrapper */}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Comments + Checks panel ── */}
      <div style={{
        width: 300, flexShrink: 0, borderLeft: '1px solid #e8e8e8',
        background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Check buttons */}
        {pageElements.length > 0 && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <SafetyCertificateOutlined style={{ color: '#1890ff' }} />
              <Text strong style={{ fontSize: 12 }}>Ellenőrzés</Text>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Button size="small" onClick={() => {
                const issues: { page: number; desc: string; element: PdfElement }[] = [];
                pageElements.forEach((elems, idx) => {
                  for (const el of elems) {
                    if (el.colorspace && !el.colorspace.toUpperCase().includes('CMYK')) {
                      const typeLabel = el.type === 'image' ? 'Kép' : el.type === 'vector' ? 'Vektor' : 'Szöveg';
                      const detail = el.type === 'text' && el.text ? ` "${el.text.substring(0, 25)}"` : '';
                      issues.push({ page: idx + 1, desc: `${typeLabel}${detail} — ${el.colorspace}`, element: el });
                    }
                  }
                });
                setCheckResults({ label: 'Nem CMYK elemek', issues });
              }}>CMYK</Button>
              {[300, 150, 72].map(dpiLimit => (
                <Button key={dpiLimit} size="small" onClick={() => {
                  const issues: { page: number; desc: string; element: PdfElement }[] = [];
                  pageElements.forEach((elems, idx) => {
                    const pI = pageInfos[idx];
                    if (!pI) return;
                    for (const el of elems) {
                      if (el.type === 'image' && el.width_px && el.width_px > 0 && el.w > 0) {
                        const dpi = Math.round(el.width_px * 72 / (el.w * pI.widthPt));
                        if (dpi < dpiLimit) {
                          issues.push({ page: idx + 1, desc: `Kép ${el.width_px}×${el.height_px}px — ${dpi} DPI`, element: el });
                        }
                      }
                    }
                  });
                  setCheckResults({ label: `Képek < ${dpiLimit} DPI`, issues });
                }}>DPI {dpiLimit}</Button>
              ))}
              <Button size="small" onClick={() => {
                const issues: { page: number; desc: string; element: PdfElement }[] = [];
                pageElements.forEach((elems, idx) => {
                  for (const el of elems) {
                    if (el.spot) {
                      const typeLabel = el.type === 'image' ? 'Kép' : el.type === 'vector' ? 'Vektor' : 'Szöveg';
                      const detail = el.spot_name ? ` (${el.spot_name})` : '';
                      issues.push({ page: idx + 1, desc: `${typeLabel}${detail}`, element: el });
                    }
                  }
                });
                setCheckResults({ label: 'Spot színek', issues });
              }}>SPOT</Button>
            </div>
            {checkResults && (
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 11 }}>{checkResults.label}</Text>
                  <Button size="small" type="text" icon={<CloseOutlined style={{ fontSize: 10 }} />}
                    onClick={() => setCheckResults(null)} style={{ padding: '0 4px', minWidth: 0 }} />
                </div>
                {checkResults.issues.length === 0 ? (
                  <div style={{ color: '#52c41a', padding: '4px 0' }}><CheckOutlined /> Rendben — nincs találat</div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {checkResults.issues.map((iss, i) => (
                      <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                        onClick={() => { scrollToElement(iss.page, iss.element); setSelectedElement({ page: iss.page, element: iss.element }); }}>
                        <ExclamationCircleOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>{iss.page}. oldal:</Text>{' '}
                        <Text style={{ fontSize: 11 }}>{iss.desc}</Text>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Title level={5} style={{ margin: 0, fontSize: 13 }}>
            <CommentOutlined /> Kommentek
            {annotations.length > 0 && (
              <Badge count={annotations.filter(a => !a.resolved).length} style={{ marginLeft: 8, background: '#1890ff' }} />
            )}
          </Title>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loadingAnnotations ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : annotations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>
              <CommentOutlined style={{ fontSize: 28, marginBottom: 8 }} />
              <div style={{ fontSize: 12 }}>Még nincs komment</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Válassz eszközt és jelölj a PDF-en</div>
            </div>
          ) : (
            <List
              dataSource={[...annotations].sort((a, b) => {
                if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })}
              renderItem={a => (
                <List.Item
                  key={a.id}
                  style={{
                    padding: '8px 16px',
                    background: selectedId === a.id ? '#e6f4ff' : 'transparent',
                    cursor: 'pointer', opacity: a.resolved ? 0.5 : 1,
                    borderLeft: `3px solid ${a.color}`, marginBottom: 2,
                  }}
                  onClick={() => { scrollToPage(a.page); setSelectedId(a.id === selectedId ? null : a.id); }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Avatar size={18} style={{ background: a.color, fontSize: 10, flexShrink: 0 }}>
                        {a.author.charAt(0).toUpperCase()}
                      </Avatar>
                      <Text strong style={{ fontSize: 11 }}>{a.author}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {(a.type ?? 'area') === 'pin' ? 'Jelölő' : (a.type ?? 'area') === 'arrow' ? 'Nyíl' : 'Terület'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>{a.page}. oldal</Text>
                    </div>
                    <Text style={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {a.text}
                    </Text>
                    {a.resolved && <Text type="success" style={{ fontSize: 10 }}><CheckOutlined /> Megoldva</Text>}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Popup content ─────────────────────────────────────────────────────────────
const CommentPopup: React.FC<{
  a: CommentAnnotation; isAdmin: boolean;
  onResolve: (id: number) => void; onDelete: (id: number) => void;
}> = ({ a, isAdmin, onResolve, onDelete }) => (
  <>
    <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
      <Avatar size={22} style={{ background: a.color, flexShrink: 0 }}>{a.author.charAt(0).toUpperCase()}</Avatar>
      <div style={{ flex: 1 }}>
        <Text strong style={{ fontSize: 11 }}>{a.author}</Text>
        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{new Date(a.created_at).toLocaleString('hu-HU')}</Text>
      </div>
    </div>
    <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{a.text}</Text>
    <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
      {!a.resolved && <Tooltip title="Megoldva"><Button size="small" icon={<CheckOutlined />} onClick={() => onResolve(a.id)} /></Tooltip>}
      {isAdmin && <Tooltip title="Törlés"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(a.id)} /></Tooltip>}
    </div>
  </>
);

export default PrintCommentView;
