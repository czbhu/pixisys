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
  RightOutlined, LoadingOutlined,
} from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import CanvasRuler from './CanvasRuler';

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
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway',
  'Oswald', 'Poppins', 'Ubuntu', 'Nunito', 'Playfair Display',
  'Merriweather', 'PT Sans', 'Source Sans Pro', 'Bebas Neue',
  'Dancing Script', 'Pacifico', 'Lobster', 'Anton', 'Arial',
  'Georgia', 'Times New Roman', 'Courier New',
];

// 1mm hány px legyen a canvason (96 DPI)
const MM_TO_PX = 3.7795;
const BLEED_MM = 3;
const SAFE_MM = 3;
const RULER_SIZE = 20;  // px
const SNAP_THRESHOLD_PX = 6;  // px távolságon belül snap
const GUIDE_COLOR = '#1890ff';
const GUIDE_HIT_PX = 6;  // px-en belül kattintásra kijelöli/törli

export interface CanvasEditorHandle {
  getDesignJson: () => { d1: any; d2: any } | null;
}

interface Guide {
  id: number;
  axis: 'x' | 'y';  // x = függőleges vonal, y = vízszintes vonal
  mm: number;
}

interface Props {
  params: PrintParams;
  isAdmin: boolean;
  priceBreakdown: any;
  leftOffset?: number;
}

type Side = '1' | '2';

const Step2CanvasEditor = forwardRef<CanvasEditorHandle, Props>((
  { params, isAdmin, priceBreakdown, leftOffset = 0 }, ref
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
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set(['Arial']));
  const [uploadingFile, setUploadingFile] = useState(false);
  const [layerDrawerOpen, setLayerDrawerOpen] = useState(false);
  const [objects1, setObjects1] = useState<fabric.Object[]>([]);
  const [objects2, setObjects2] = useState<fabric.Object[]>([]);

  // Guides + snap state
  const [guides, setGuides] = useState<Guide[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [cursorMm, setCursorMm] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [objPosMm, setObjPosMm] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [newGuideMm, setNewGuideMm] = useState<number>(50);
  const [newGuideAxis, setNewGuideAxis] = useState<'x' | 'y'>('x');
  const guidesRef = useRef<Guide[]>([]);
  const snapRef = useRef(true);
  const nextGuideId = useRef(1);

  // Canvas méret számítás — a ruler helyet foglal
  const MAX_EDITOR_W = Math.min(window.innerWidth - (leftOffset + 220 + 48), 900);
  const MAX_CANVAS_H = window.innerHeight - 140 - RULER_SIZE;
  const canvasW = params.width_mm * MM_TO_PX;
  const canvasH = params.height_mm * MM_TO_PX;
  const scale = Math.min(MAX_EDITOR_W / canvasW, MAX_CANVAS_H / canvasH, 1);
  const displayW = Math.round(canvasW * scale);
  const displayH = Math.round(canvasH * scale);

  const getActiveFabric = () => activeSide === '1' ? fabricRef1.current : fabricRef2.current;

  // Sync refs
  useEffect(() => { guidesRef.current = guides; }, [guides]);
  useEffect(() => { snapRef.current = snapEnabled; }, [snapEnabled]);

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

  // Canvas inicializálás
  const initCanvas = (ref: React.MutableRefObject<HTMLCanvasElement>, fabricRef: React.MutableRefObject<fabric.Canvas | null>, side: Side) => {
    if (!ref.current || fabricRef.current) return;

    const fc = new fabric.Canvas(ref.current, {
      width: canvasW,
      height: canvasH,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });

    fabricRef.current = fc;

    // Bleed keret (szürkés) - nem nyomtatható
    const bleedPx = BLEED_MM * MM_TO_PX;
    const bleedRect = new fabric.Rect({
      left: -bleedPx,
      top: -bleedPx,
      width: canvasW + bleedPx * 2,
      height: canvasH + bleedPx * 2,
      fill: 'rgba(200,200,200,0.15)',
      stroke: '#aaa',
      strokeWidth: 1 / scale,
      strokeDashArray: [4 / scale, 4 / scale],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (bleedRect as any).__guideHelper = true;
    fc.add(bleedRect);
    fc.sendToBack(bleedRect);

    // Safe zone (piros pöttyözött vonal)
    const safePx = SAFE_MM * MM_TO_PX;
    const safeRect = new fabric.Rect({
      left: safePx,
      top: safePx,
      width: canvasW - safePx * 2,
      height: canvasH - safePx * 2,
      fill: 'transparent',
      stroke: '#ff4d4f',
      strokeWidth: 1 / scale,
      strokeDashArray: [6 / scale, 3 / scale],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (safeRect as any).__guideHelper = true;
    fc.add(safeRect);

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
    fc.on('object:modified', () => { saveHistory(side); updateObjects(side); });
    fc.on('object:added', () => updateObjects(side));
    fc.on('object:removed', () => updateObjects(side));

    // Snap + mouse-move és ruler cursor
    fc.on('mouse:move', (e: any) => {
      const p = e.absolutePointer;
      if (!p) return;
      setCursorMm({ x: p.x / MM_TO_PX, y: p.y / MM_TO_PX });
    });
    fc.on('mouse:out', () => setCursorMm({ x: null, y: null }));

    fc.on('object:moving', (e: any) => {
      if (!snapRef.current) return;
      const obj = e.target;
      if (!obj) return;
      snapObjectToGuides(obj);
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      setObjPosMm({ x: left / MM_TO_PX, y: top / MM_TO_PX, w: ow / MM_TO_PX, h: oh / MM_TO_PX });
    });

    // CSS transform: scale the canvas visually, do NOT override width/height
    // (Fabric already sets the container to canvasW×canvasH; just scale visually)
    const el = fc.getElement().parentElement;
    if (el) {
      el.style.transformOrigin = 'top left';
      el.style.transform = `scale(${scale})`;
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

  // Snap object to nearest guide
  const snapObjectToGuides = (obj: fabric.Object) => {
    const guideList = guidesRef.current;
    const threshold = SNAP_THRESHOLD_PX;
    let newLeft = obj.left ?? 0;
    let newTop = obj.top ?? 0;
    const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);

    for (const g of guideList) {
      const gPx = g.mm * MM_TO_PX;
      if (g.axis === 'x') {
        // vertical guide line: snap left edge or center or right edge
        if (Math.abs(newLeft - gPx) < threshold) newLeft = gPx;
        else if (Math.abs(newLeft + ow / 2 - gPx) < threshold) newLeft = gPx - ow / 2;
        else if (Math.abs(newLeft + ow - gPx) < threshold) newLeft = gPx - ow;
      } else {
        // horizontal guide line: snap top edge or center or bottom edge
        if (Math.abs(newTop - gPx) < threshold) newTop = gPx;
        else if (Math.abs(newTop + oh / 2 - gPx) < threshold) newTop = gPx - oh / 2;
        else if (Math.abs(newTop + oh - gPx) < threshold) newTop = gPx - oh;
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

  // Drag from ruler to create guide
  const handleRulerMouseDown = (axis: 'x' | 'y') => (e: React.MouseEvent<HTMLDivElement>) => {
    // Just add a guide at approximate position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const posPx = axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
    const mm = Math.round((posPx / scale) * 2) / 2;  // 0.5mm precision
    const clamped = Math.max(0, Math.min(axis === 'x' ? params.width_mm : params.height_mm, mm));
    addGuide(axis, clamped);
  };

  // Font betöltés
  const loadFont = async (fontName: string) => {
    if (loadedFonts.has(fontName) || ['Arial', 'Georgia', 'Times New Roman', 'Courier New'].includes(fontName)) {
      return;
    }
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
      document.head.appendChild(link);
      await new Promise(r => setTimeout(r, 500));
      setLoadedFonts(prev => new Set([...Array.from(prev), fontName]));
    } catch {}
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
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      // PDF esetén pdfjs-t használunk
      if (file.type === 'application/pdf') {
        loadPdfAsImage(dataUrl);
      } else {
        fabric.Image.fromURL(dataUrl, (img: fabric.Image) => {
          const fc = getActiveFabric();
          if (!fc) return;
          // Méretezés: ne legyen nagyobb a canvas 80%-ánál
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
      }
    };
    reader.readAsDataURL(file);
    return false; // prevent default upload
  };

  const loadPdfAsImage = async (dataUrl: string) => {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
      const loadingTask = pdfjs.getDocument({ data: dataUrl });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = viewport.width;
      tmpCanvas.height = viewport.height;
      const ctx = tmpCanvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as any, viewport } as any).promise;
      const imgDataUrl = tmpCanvas.toDataURL('image/png');
      fabric.Image.fromURL(imgDataUrl, (img: fabric.Image) => {
        const fc = getActiveFabric();
        if (!fc) return;
        const maxW = canvasW * 0.98;
        const maxH = canvasH * 0.98;
        const iw = img.width ?? 100;
        const ih = img.height ?? 100;
        const ratio = Math.min(maxW / iw, maxH / ih, 1);
        img.scale(ratio);
        img.set({ left: (canvasW - iw * ratio) / 2, top: (canvasH - ih * ratio) / 2 });
        (img as any).name = 'PDF oldal';
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
        saveHistory(activeSide);
      });
    } catch (err) {
      message.error('PDF betöltési hiba');
    } finally {
      setUploadingFile(false);
    }
  };

  // Aktív objektum tulajdonságok
  const updateProp = (prop: string, value: any) => {
    const fc = getActiveFabric();
    const obj = fc?.getActiveObject();
    if (!obj) return;
    obj.set(prop as any, value);
    fc!.renderAll();
    saveHistory(activeSide);
    setSelectedObj({ ...obj } as any);
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
  const isImage = selectedObj?.type === 'image'; // eslint-disable-line @typescript-eslint/no-unused-vars
  const hasSelection = !!selectedObj && !(selectedObj as any).__guideHelper;

  const activeFc = getActiveFabric();
  const currentObjects = activeSide === '1' ? objects1 : objects2;
  const histIdx = activeSide === '1' ? histIdx1 : histIdx2;
  const histLen = activeSide === '1' ? history1.length : history2.length;

  // Guide overlay — drawn on a transparent canvas overlaying the fabric canvas area
  const GuideOverlay = () => {
    const overlayRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, displayW, displayH);
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const g of guides) {
        const px = g.mm * scale;
        ctx.beginPath();
        if (g.axis === 'x') {
          ctx.moveTo(px, 0); ctx.lineTo(px, displayH);
        } else {
          ctx.moveTo(0, px); ctx.lineTo(displayW, px);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
    return (
      <canvas
        ref={overlayRef}
        width={displayW}
        height={displayH}
        style={{
          position: 'absolute', top: 0, left: 0,
          pointerEvents: 'none', zIndex: 10,
        }}
      />
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel: Tools */}
      <div style={{
        width: 220, background: '#fff', borderRight: '1px solid #e8e8e8',
        padding: '12px 8px', overflowY: 'auto', flexShrink: 0,
      }}>
        <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>ELEMEK</Text>

        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          <Button block icon={<FontSizeOutlined />} onClick={addText}>Szöveg</Button>
          <Button block icon={<BorderOutlined />} onClick={addRect}>Téglalap</Button>
          <Button block onClick={addCircle}>○ Kör</Button>
          <Divider style={{ margin: '6px 0' }} />

          <Upload
            accept=".pdf,.svg,.jpg,.jpeg,.png,.webp"
            showUploadList={false}
            beforeUpload={handleImageUpload}
          >
            <Button block icon={uploadingFile ? <LoadingOutlined /> : <PictureOutlined />} disabled={uploadingFile}>
              {uploadingFile ? 'Betöltés...' : 'Kép / PDF feltöltés'}
            </Button>
          </Upload>
        </Space>

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
                <span>{obj.type === 'i-text' ? 'T' : obj.type === 'image' ? '🖼' : '□'}</span>
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
              </div>
            );
          })}
        </div>

        {isAdmin && priceBreakdown && (
          <>
            <Divider />
            <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>ÁR KALKULÁCIÓ</Text>
            <div style={{ fontSize: 12 }}>
              <div>Papír: {priceBreakdown.paper_cost?.toLocaleString('hu-HU')} Ft</div>
              <div>Nyomtatás 1.o: {priceBreakdown.print_cost_side1?.toLocaleString('hu-HU')} Ft</div>
              {priceBreakdown.print_cost_side2 > 0 && (
                <div>Nyomtatás 2.o: {priceBreakdown.print_cost_side2?.toLocaleString('hu-HU')} Ft</div>
              )}
              <div>Kötészet: {priceBreakdown.finishing_cost?.toLocaleString('hu-HU')} Ft</div>
              <div>Fedezet: {priceBreakdown.margin_pct}%</div>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ fontWeight: 600 }}>Összesen: {priceBreakdown.total?.toLocaleString('hu-HU')} Ft</div>
              <div>Egységár: {priceBreakdown.unit_price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
            </div>
          </>
        )}

        {/* Guide management */}
        <Divider />
        <Text strong style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>VONALZÓK</Text>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, flexShrink: 0 }}>Snap:</Text>
          <Switch
            size="small"
            checked={snapEnabled}
            onChange={v => setSnapEnabled(v)}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <Select
            size="small"
            value={newGuideAxis}
            onChange={v => setNewGuideAxis(v)}
            style={{ width: 60 }}
          >
            <Option value="x">X │</Option>
            <Option value="y">Y —</Option>
          </Select>
          <InputNumber
            size="small"
            min={0}
            max={newGuideAxis === 'x' ? params.width_mm : params.height_mm}
            step={0.5}
            addonAfter="mm"
            value={newGuideMm}
            onChange={v => v !== null && setNewGuideMm(v)}
            style={{ flex: 1 }}
          />
          <Button size="small" type="primary" onClick={() => addGuide(newGuideAxis, newGuideMm)}>+</Button>
        </div>
        <div style={{ maxHeight: 140, overflowY: 'auto' }}>
          {guides.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>Nincs guide — húzd a vonalzóról!</Text>}
          {guides.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <Text style={{ fontSize: 11, width: 18, color: GUIDE_COLOR, fontWeight: 700 }}>{g.axis.toUpperCase()}</Text>
              <InputNumber
                size="small"
                value={g.mm}
                step={0.5}
                min={0}
                max={g.axis === 'x' ? params.width_mm : params.height_mm}
                onChange={v => v !== null && updateGuide(g.id, v)}
                style={{ flex: 1 }}
                addonAfter="mm"
              />
              <Button size="small" danger onClick={() => removeGuide(g.id)} style={{ padding: '0 4px' }}>×</Button>
            </div>
          ))}
        </div>
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
                {GOOGLE_FONTS.map(f => (
                  <Option key={f} value={f} style={{ fontFamily: f }}>{f}</Option>
                ))}
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
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, background: '#f0f2f5' }}>
          {params.sides === '2' && (
            <div style={{ marginBottom: 8 }}>
              <Button.Group>
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
              </Button.Group>
            </div>
          )}

          {/* Ruler + canvas area */}
          <div style={{ display: 'inline-flex', flexDirection: 'column', userSelect: 'none' }}>
            {/* Top row: corner + horizontal ruler */}
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {/* Corner cell */}
              <div style={{
                width: RULER_SIZE, height: RULER_SIZE, flexShrink: 0,
                background: '#f0f0f0', border: '1px solid #d9d9d9',
                borderRight: 'none', borderBottom: 'none',
              }} />
              {/* Horizontal ruler (X) */}
              <div
                onMouseDown={handleRulerMouseDown('x')}
                title="Húzd le új függőleges guide-hoz"
              >
                <CanvasRuler
                  direction="h"
                  totalMm={params.width_mm}
                  scale={scale}
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
                  scale={scale}
                  size={RULER_SIZE}
                  cursorMm={cursorMm.y}
                />
              </div>

              {/* Canvas wrappers */}
              <div style={{ position: 'relative' }}>
                <GuideOverlay />
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
  );
});

Step2CanvasEditor.displayName = 'Step2CanvasEditor';
export default Step2CanvasEditor;
