import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Row, Col, Button, Radio, InputNumber, Input, Table, Space, Typography, Alert, Tag, Tooltip, Select, Popconfirm, message, Segmented, Switch } from 'antd';
import { PlusOutlined, DeleteOutlined, AppstoreOutlined, SaveOutlined, CopyOutlined, FileAddOutlined, EditOutlined, FolderOpenOutlined } from '@ant-design/icons';

const { Text } = Typography;

type Mode = 'ives' | 'szalanyag' | 'tekerces';

interface ProductRow {
  id: number;
  name: string;
  width: number;
  height: number;
  quantity: number;
  rotate?: 'auto' | 'normal' | 'rotated'; // A / 0 / 90 ; default 'auto'
}

interface SheetRow {
  id: number;
  name: string;
  width: number;
  height: number;
  available: number | null; // null = unlimited
  rotate: 'auto' | 'normal' | 'rotated';
}

// ── Szálanyag (1D) ──────────────────────────────────────
interface BarProduct { id: number; name: string; length: number; quantity: number; }
interface BarRow { id: number; name: string; length: number; available: number | null; }
interface BarCut { productId: number; productName: string; length: number; }
interface BarPlan { barTypeId: number; barTypeName: string; barLength: number; cuts: BarCut[]; usedLength: number; waste: number; }

const pieceColors = ['#bae0ff', '#b7eb8f', '#ffd591', '#ffadd2', '#d3adf7', '#87e8de', '#ffe58f', '#ff9c6e'];
const pieceStrokes = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2', '#faad14', '#d4380d'];
const colorForProduct = (productId: number) => {
  const idx = Math.abs(productId) % pieceColors.length;
  return { fill: pieceColors[idx], stroke: pieceStrokes[idx] };
};

// ── Tekercses ───────────────────────────────────────────
interface RollProduct { id: number; name: string; width: number; length: number; quantity: number; rotate?: 'auto' | 'normal' | 'rotated'; }
interface RollRow { id: number; name: string; width: number; availableLength: number | null; /* fm = m */ }
interface RollAllocation {
  productId: number;
  productName: string;
  rollId: number;
  rollName: string;
  rollWidth: number;
  productWidth: number;
  productLength: number;
  rotated: boolean;
  piecesAcross: number;
  rowsNeeded: number;
  rowLengthMm: number;
  totalLengthMm: number;
  qty: number;
  shortage: number;
  coverage: number; // 0..1
}

interface Allocation {
  productId: number;
  sheetId: number;
  perSheet: number;
  rotated: boolean;
  cols: number;
  rows: number;
  sheetsUsed: number;
  itemsProduced: number;
}

interface AssignmentResult {
  productId: number;
  productName: string;
  qtyNeeded: number;
  qtyProduced: number;
  shortage: number;
  allocations: Allocation[];
}

const itemsPerSheet = (sw: number, sh: number, pw: number, ph: number, gap: number, rotate: SheetRow['rotate']) => {
  if (pw <= 0 || ph <= 0 || sw <= 0 || sh <= 0) return { count: 0, rotated: false, cols: 0, rows: 0 };
  // gap = nyomatköz (két nyomat közötti távolság). N elem sora: N*p + (N-1)*gap <= s  =>  N <= (s+gap)/(p+gap)
  const colsN = Math.max(0, Math.floor((sw + gap) / (pw + gap)));
  const rowsN = Math.max(0, Math.floor((sh + gap) / (ph + gap)));
  const colsR = Math.max(0, Math.floor((sw + gap) / (ph + gap)));
  const rowsR = Math.max(0, Math.floor((sh + gap) / (pw + gap)));
  const fitNormal = colsN * rowsN;
  const fitRotated = colsR * rowsR;
  let rotated = false;
  if (rotate === 'auto') rotated = fitRotated > fitNormal;
  else if (rotate === 'rotated') rotated = true;
  const cols = rotated ? colsR : colsN;
  const rows = rotated ? rowsR : rowsN;
  return { count: cols * rows, rotated, cols, rows };
};

// ── Shelf-FFDH 2D bin packer (több termék vegyítése egy alapanyagon) ─
type Piece = { productId: number; productName: string; w: number; h: number; rotateAllowed?: boolean };
type Placed = Piece & { x: number; y: number; pw: number; ph: number; rotated: boolean };

// MAXRECTS-BSSF (Best Short Side Fit) — szabadon bárhova helyez, üres zsebeket is feltölti
const maxrectsPack = (
  binW: number, binH: number, gap: number, pieces: Piece[],
): { placed: Placed[]; leftover: Piece[] } => {
  type Rect = { x: number; y: number; w: number; h: number };
  const placed: Placed[] = [];
  const leftover: Piece[] = [];
  let freeRects: Rect[] = [{ x: 0, y: 0, w: binW, h: binH }];
  const queue = [...pieces].sort((a, b) => (b.w * b.h) - (a.w * a.h));

  for (const p of queue) {
    const allowRot = p.rotateAllowed !== false;
    let bestIdx = -1, bestW = 0, bestH = 0;
    let bestRot = false;
    let bestScore = Infinity; // best short-side fit
    let bestY = Infinity;     // tiebreak: bottom-most (smallest y)
    for (let i = 0; i < freeRects.length; i++) {
      const fr = freeRects[i];
      const tries: Array<[number, number, boolean]> = [[p.w, p.h, false]];
      if (allowRot) tries.push([p.h, p.w, true]);
      for (const [w, h, rot] of tries) {
        if (w <= fr.w + 1e-6 && h <= fr.h + 1e-6) {
          const shortLeft = Math.min(fr.w - w, fr.h - h);
          if (shortLeft < bestScore - 1e-6 || (Math.abs(shortLeft - bestScore) < 1e-6 && fr.y < bestY)) {
            bestScore = shortLeft; bestIdx = i; bestRot = rot; bestW = w; bestH = h; bestY = fr.y;
          }
        }
      }
    }
    if (bestIdx === -1) { leftover.push(p); continue; }
    const fr = freeRects[bestIdx];
    const px = fr.x, py = fr.y;
    placed.push({ ...p, x: px, y: py, pw: bestW, ph: bestH, rotated: bestRot });

    // Used rect occupies [px..px+bestW+gap] × [py..py+bestH+gap] (gap as separator)
    const ux1 = px, uy1 = py;
    const ux2 = px + bestW + gap, uy2 = py + bestH + gap;
    const next: Rect[] = [];
    for (const r of freeRects) {
      if (ux2 <= r.x || ux1 >= r.x + r.w || uy2 <= r.y || uy1 >= r.y + r.h) {
        next.push(r); continue;
      }
      // Split into up to 4 sub-rects
      if (ux1 > r.x) next.push({ x: r.x, y: r.y, w: ux1 - r.x - gap, h: r.h });
      if (ux2 < r.x + r.w) next.push({ x: ux2, y: r.y, w: r.x + r.w - ux2, h: r.h });
      if (uy1 > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: uy1 - r.y - gap });
      if (uy2 < r.y + r.h) next.push({ x: r.x, y: uy2, w: r.w, h: r.y + r.h - uy2 });
    }
    // Filter degenerate / fully-contained rects
    const cleaned: Rect[] = [];
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (a.w <= 1e-6 || a.h <= 1e-6) continue;
      let contained = false;
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue;
        const b = next[j];
        if (b.w <= 1e-6 || b.h <= 1e-6) continue;
        if (a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 &&
            a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6 &&
            (a.w < b.w - 1e-6 || a.h < b.h - 1e-6 || j < i)) {
          contained = true; break;
        }
      }
      if (!contained) cleaned.push(a);
    }
    freeRects = cleaned;
  }
  return { placed, leftover };
};

const shelfPackFFDH = (
  binW: number, binH: number, gap: number, pieces: Piece[], allowGrow: boolean = false,
): { placed: Placed[]; leftover: Piece[] } => {
  // When growing/compaction is allowed, use a true MAXRECTS packer that fills empty pockets.
  if (allowGrow) return maxrectsPack(binW, binH, gap, pieces);

  const placed: Placed[] = [];
  const leftover: Piece[] = [];
  let shelfY = 0;
  let shelfH = 0;
  let cursorX = 0;
  let started = false;

  for (const p of pieces) {
    const allowRot = p.rotateAllowed !== false;
    // Try to fit in current shelf
    const tryCurrent = (w: number, h: number, rot: boolean) => {
      if (!started) return null;
      const x = cursorX === 0 ? 0 : cursorX + gap;
      if (x + w > binW + 1e-6) return null;
      if (h > shelfH + 1e-6) {
        // Strict shelf: reject taller pieces. With allowGrow, expand shelf if it still fits the bin.
        if (!allowGrow) return null;
        if (shelfY + h > binH + 1e-6) return null;
      }
      return { x, w, h, rot };
    };
    let r = tryCurrent(p.w, p.h, false);
    if (!r && allowRot) r = tryCurrent(p.h, p.w, true);
    if (r) {
      placed.push({ ...p, x: r.x, y: shelfY, pw: r.w, ph: r.h, rotated: r.rot });
      cursorX = r.x + r.w;
      if (r.h > shelfH) shelfH = r.h; // grow shelf height when allowed
      continue;
    }
    // Open new shelf
    const newY = started ? shelfY + shelfH + gap : 0;
    const fitsN = p.w <= binW + 1e-6 && newY + p.h <= binH + 1e-6;
    const fitsR = allowRot && p.h <= binW + 1e-6 && newY + p.w <= binH + 1e-6;
    let useW = p.w, useH = p.h, rot = false;
    if (fitsN && fitsR) {
      // Prefer the orientation with the smaller height (less wasted shelf height)
      if (p.w >= p.h) { /* normal */ } else { useW = p.h; useH = p.w; rot = true; }
    } else if (fitsN) {
      // normal
    } else if (fitsR) {
      useW = p.h; useH = p.w; rot = true;
    } else {
      leftover.push(p);
      continue;
    }
    shelfY = newY;
    shelfH = useH;
    placed.push({ ...p, x: 0, y: shelfY, pw: useW, ph: useH, rotated: rot });
    cursorX = useW;
    started = true;
  }

  // Backfill pass: when allowGrow, fill the empty pockets ABOVE shorter items
  // and the right-tail of each shelf using the leftover pieces (best-fit by waste).
  if (allowGrow && leftover.length > 0 && placed.length > 0) {
    type Rect = { x: number; y: number; w: number; h: number };
    type Shelf = { y: number; h: number; items: Placed[] };
    const shelves: Shelf[] = [];
    for (const pl of placed) {
      let s = shelves.find(sh => Math.abs(sh.y - pl.y) < 1e-6);
      if (!s) { s = { y: pl.y, h: 0, items: [] }; shelves.push(s); }
      s.items.push(pl);
    }
    shelves.forEach(s => { s.h = Math.max(...s.items.map(i => i.ph)); });
    const freeRects: Rect[] = [];
    for (const sh of shelves) {
      // Free rect above each item that is shorter than the shelf
      for (const it of sh.items) {
        const freeH = sh.h - it.ph;
        if (freeH > gap + 1e-6) {
          freeRects.push({ x: it.x, y: sh.y + it.ph + gap, w: it.pw, h: freeH - gap });
        }
      }
      // Right tail of the shelf
      const maxRight = Math.max(...sh.items.map(i => i.x + i.pw));
      const tailW = binW - maxRight - gap;
      if (tailW > 0) freeRects.push({ x: maxRight + gap, y: sh.y, w: tailW, h: sh.h });
    }

    const sortedLeft = [...leftover].sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const remainingLeft: Piece[] = [];
    for (const p of sortedLeft) {
      const allowRot = p.rotateAllowed !== false;
      let bestIdx = -1;
      let bestRot = false;
      let bestFitW = 0, bestFitH = 0;
      let bestWaste = Infinity;
      for (let i = 0; i < freeRects.length; i++) {
        const fr = freeRects[i];
        const tries: Array<[number, number, boolean]> = [[p.w, p.h, false]];
        if (allowRot) tries.push([p.h, p.w, true]);
        for (const [w, h, rot] of tries) {
          if (w <= fr.w + 1e-6 && h <= fr.h + 1e-6) {
            const waste = fr.w * fr.h - w * h;
            if (waste < bestWaste) {
              bestWaste = waste; bestIdx = i; bestRot = rot; bestFitW = w; bestFitH = h;
            }
          }
        }
      }
      if (bestIdx === -1) { remainingLeft.push(p); continue; }
      const fr = freeRects[bestIdx];
      placed.push({ ...p, x: fr.x, y: fr.y, pw: bestFitW, ph: bestFitH, rotated: bestRot });
      // Guillotine split of the consumed rect
      const newRects: Rect[] = [];
      const rightW = fr.w - bestFitW - gap;
      if (rightW > 0) newRects.push({ x: fr.x + bestFitW + gap, y: fr.y, w: rightW, h: bestFitH });
      const topH = fr.h - bestFitH - gap;
      if (topH > 0) newRects.push({ x: fr.x, y: fr.y + bestFitH + gap, w: fr.w, h: topH });
      freeRects.splice(bestIdx, 1, ...newRects);
    }
    leftover.length = 0;
    remainingLeft.forEach(p => leftover.push(p));
  }

  return { placed, leftover };
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialProductWidth?: number;
  initialProductHeight?: number;
  initialProductQty?: number;
  initialPresetId?: string | null;
}

const ImpositionHelperModal: React.FC<Props> = ({ open, onClose, initialProductWidth, initialProductHeight, initialProductQty, initialPresetId }) => {
  const [mode, setMode] = useState<Mode>('ives');
  const [bleed, setBleed] = useState<number>(3);
  const [products, setProducts] = useState<ProductRow[]>([
    { id: 1, name: 'Termék 1', width: initialProductWidth ?? 210, height: initialProductHeight ?? 297, quantity: initialProductQty ?? 100 },
  ]);
  const [sheets, setSheets] = useState<SheetRow[]>([
    { id: 1, name: 'B2', width: 500, height: 700, available: null, rotate: 'auto' },
  ]);
  const [productsMixable, setProductsMixable] = useState<boolean>(true);

  // ── Szálanyag (1D) ──────────────────────────────────────
  const [kerf, setKerf] = useState<number>(3);
  const [barProducts, setBarProducts] = useState<BarProduct[]>([
    { id: 1, name: 'Darab 1', length: 1200, quantity: 20 },
  ]);
  const [bars, setBars] = useState<BarRow[]>([
    { id: 1, name: '6 m szál', length: 6000, available: null },
  ]);

  // ── Tekercses ───────────────────────────────────────────
  const [rollGap, setRollGap] = useState<number>(2);
  const [rollProducts, setRollProducts] = useState<RollProduct[]>([
    { id: 1, name: 'Termék 1', width: initialProductWidth ?? 200, length: initialProductHeight ?? 300, quantity: initialProductQty ?? 100 },
  ]);
  const [rolls, setRolls] = useState<RollRow[]>([
    { id: 1, name: 'Tekercs 1000mm', width: 1000, availableLength: null },
  ]);
  const [keepRollRows, setKeepRollRows] = useState<boolean>(true);

  // ── Presetek (localStorage) ────────────────────────────────────────────
  const STORAGE_KEY = 'pixisys_imposition_presets_v1';
  type Preset = {
    id: string; name: string; bleed: number;
    products: ProductRow[]; sheets: SheetRow[];
    updatedAt: string;
    mode?: Mode;
    kerf?: number; barProducts?: BarProduct[]; bars?: BarRow[];
    rollGap?: number; rollProducts?: RollProduct[]; rolls?: RollRow[];
  };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetNameInput, setPresetNameInput] = useState<string>('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }, []);

  // Auto-load preset when opened with initialPresetId
  useEffect(() => {
    if (!open || !initialPresetId || !presets.length) return;
    const p = presets.find(x => x.id === initialPresetId);
    if (!p) return;
    setMode(p.mode ?? 'ives');
    setBleed(p.bleed);
    setProducts(p.products);
    setSheets(p.sheets);
    if (p.kerf !== undefined) setKerf(p.kerf);
    if (p.barProducts) setBarProducts(p.barProducts);
    if (p.bars) setBars(p.bars);
    if (p.rollGap !== undefined) setRollGap(p.rollGap);
    if (p.rollProducts) setRollProducts(p.rollProducts);
    if (p.rolls) setRolls(p.rolls);
    setActivePresetId(p.id);
    setPresetNameInput(p.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPresetId, presets.length]);

  const persist = (next: Preset[]) => {
    setPresets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const loadPreset = (id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setMode(p.mode ?? 'ives');
    setBleed(p.bleed);
    setProducts(p.products);
    setSheets(p.sheets);
    if (p.kerf !== undefined) setKerf(p.kerf);
    if (p.barProducts) setBarProducts(p.barProducts);
    if (p.bars) setBars(p.bars);
    if (p.rollGap !== undefined) setRollGap(p.rollGap);
    if (p.rollProducts) setRollProducts(p.rollProducts);
    if (p.rolls) setRolls(p.rolls);
    setActivePresetId(p.id);
    setPresetNameInput(p.name);
  };

  const presetSnapshot = (): Omit<Preset, 'id' | 'name' | 'updatedAt'> => ({
    bleed, products, sheets, mode,
    kerf, barProducts, bars,
    rollGap, rollProducts, rolls,
  });

  const newPreset = () => {
    setActivePresetId(null);
    setPresetNameInput('');
    setBleed(3);
    setProducts([{ id: Date.now(), name: 'Termék 1', width: initialProductWidth ?? 210, height: initialProductHeight ?? 297, quantity: initialProductQty ?? 100 }]);
    setSheets([{ id: Date.now() + 1, name: 'B2', width: 500, height: 700, available: null, rotate: 'auto' }]);
    setKerf(3);
    setBarProducts([{ id: Date.now() + 2, name: 'Darab 1', length: 1200, quantity: 20 }]);
    setBars([{ id: Date.now() + 3, name: '6 m szál', length: 6000, available: null }]);
    setRollGap(2);
    setRollProducts([{ id: Date.now() + 4, name: 'Termék 1', width: initialProductWidth ?? 200, length: initialProductHeight ?? 300, quantity: initialProductQty ?? 100 }]);
    setRolls([{ id: Date.now() + 5, name: 'Tekercs 1000mm', width: 1000, availableLength: null }]);
  };

  const savePreset = () => {
    const name = (presetNameInput || '').trim();
    if (!name) { message.warning('Adj meg egy nevet a mentéshez'); return; }
    const now = new Date().toISOString();
    if (activePresetId && presets.some(p => p.id === activePresetId)) {
      const next = presets.map(p => p.id === activePresetId ? { ...p, name, ...presetSnapshot(), updatedAt: now } : p);
      persist(next);
      message.success('Mentve');
    } else {
      const id = `imp_${Date.now()}`;
      const preset: Preset = { id, name, ...presetSnapshot(), updatedAt: now };
      persist([...presets, preset]);
      setActivePresetId(id);
      message.success('Mentve új presetként');
    }
  };

  const duplicatePreset = () => {
    const name = (presetNameInput || 'Impozíció').trim() + ' (másolat)';
    const id = `imp_${Date.now()}`;
    const now = new Date().toISOString();
    const preset: Preset = { id, name, ...presetSnapshot(), updatedAt: now };
    persist([...presets, preset]);
    setActivePresetId(id);
    setPresetNameInput(name);
    message.success('Lemásolva');
  };

  const deletePreset = () => {
    if (!activePresetId) return;
    const next = presets.filter(p => p.id !== activePresetId);
    persist(next);
    newPreset();
    message.success('Törölve');
  };

  const renamePresetInline = (id: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const next = presets.map(p => p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p);
    persist(next);
    if (activePresetId === id) setPresetNameInput(trimmed);
  };

  const deletePresetById = (id: string) => {
    const next = presets.filter(p => p.id !== id);
    persist(next);
    if (activePresetId === id) newPreset();
    message.success('Törölve');
  };

  const addProduct = () => setProducts(ps => [...ps, { id: Date.now(), name: `Termék ${ps.length + 1}`, width: 210, height: 297, quantity: 100 }]);
  const removeProduct = (id: number) => setProducts(ps => ps.filter(p => p.id !== id));
  const updateProduct = (id: number, patch: Partial<ProductRow>) => setProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));

  const addSheet = () => setSheets(ss => [...ss, { id: Date.now(), name: `Ív ${ss.length + 1}`, width: 330, height: 487, available: null, rotate: 'auto' }]);
  const removeSheet = (id: number) => setSheets(ss => ss.filter(s => s.id !== id));
  const updateSheet = (id: number, patch: Partial<SheetRow>) => setSheets(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s));

  // ── Szálanyag CRUD ──────────────────────────────────────
  const addBarProduct = () => setBarProducts(ps => [...ps, { id: Date.now(), name: `Darab ${ps.length + 1}`, length: 1000, quantity: 10 }]);
  const removeBarProduct = (id: number) => setBarProducts(ps => ps.filter(p => p.id !== id));
  const updateBarProduct = (id: number, patch: Partial<BarProduct>) => setBarProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const addBar = () => setBars(bs => [...bs, { id: Date.now(), name: `Szál ${bs.length + 1}`, length: 6000, available: null }]);
  const removeBar = (id: number) => setBars(bs => bs.filter(b => b.id !== id));
  const updateBar = (id: number, patch: Partial<BarRow>) => setBars(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));

  // ── Tekercses CRUD ───────────────────────────────────────
  const addRollProduct = () => setRollProducts(ps => [...ps, { id: Date.now(), name: `Termék ${ps.length + 1}`, width: 200, length: 300, quantity: 50 }]);
  const removeRollProduct = (id: number) => setRollProducts(ps => ps.filter(p => p.id !== id));
  const updateRollProduct = (id: number, patch: Partial<RollProduct>) => setRollProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const addRoll = () => setRolls(rs => [...rs, { id: Date.now(), name: `Tekercs ${rs.length + 1}`, width: 1000, availableLength: null }]);
  const removeRoll = (id: number) => setRolls(rs => rs.filter(r => r.id !== id));
  const updateRoll = (id: number, patch: Partial<RollRow>) => setRolls(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  // ── Számítás ────────────────────────────────────────────────────────────
  // Mátrix: minden (termék × ív) párra kihozatal
  const matrix = useMemo(() => {
    return products.map(p => ({
      product: p,
      perSheetBy: sheets.map(s => ({
        sheet: s,
        ...itemsPerSheet(s.width, s.height, p.width, p.height, bleed, s.rotate),
      })),
    }));
  }, [products, sheets, bleed]);

  // ── Mohó allokáció: minden termékre a legjobb (legtöbb db/ív) ívet választja
  // figyelembe véve a rendelkezésre álló íveket (limit) ─────────────────────
  const assignments = useMemo<AssignmentResult[]>(() => {
    // Másolat az elérhető mennyiségekről (csökkenő allokáció)
    const remaining = new Map<number, number | null>(sheets.map(s => [s.id, s.available]));
    const results: AssignmentResult[] = [];

    for (const p of products) {
      const candidates = sheets
        .map(s => ({ sheet: s, ...itemsPerSheet(s.width, s.height, p.width, p.height, bleed, s.rotate) }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);

      let need = p.quantity;
      const allocs: Allocation[] = [];

      for (const c of candidates) {
        if (need <= 0) break;
        const avail = remaining.get(c.sheet.id) ?? null;
        const sheetsForFull = Math.ceil(need / c.count);
        const sheetsCanUse = avail === null ? sheetsForFull : Math.min(sheetsForFull, avail);
        if (sheetsCanUse <= 0) continue;
        const produced = Math.min(need, sheetsCanUse * c.count);
        allocs.push({
          productId: p.id,
          sheetId: c.sheet.id,
          perSheet: c.count,
          rotated: c.rotated,
          cols: c.cols,
          rows: c.rows,
          sheetsUsed: sheetsCanUse,
          itemsProduced: produced,
        });
        need -= produced;
        if (avail !== null) remaining.set(c.sheet.id, avail - sheetsCanUse);
      }

      results.push({
        productId: p.id,
        productName: p.name,
        qtyNeeded: p.quantity,
        qtyProduced: p.quantity - Math.max(0, need),
        shortage: Math.max(0, need),
        allocations: allocs,
      });
    }

    return results;
  }, [products, sheets, bleed]);

  // Összesített ív felhasználás
  const sheetUsage = useMemo(() => {
    const map = new Map<number, number>();
    assignments.forEach(a => a.allocations.forEach(al => {
      map.set(al.sheetId, (map.get(al.sheetId) || 0) + al.sheetsUsed);
    }));
    return map;
  }, [assignments]);

  // ── Vegyes (mixed) packer Íves módhoz – több termék egy íven ──────────
  const mixedSheets = useMemo(() => {
    const pieces: Piece[] = [];
    products.forEach(p => {
      const rot = p.rotate ?? 'auto';
      const allowRot = rot === 'auto';
      // 'rotated' → swap w/h; 'normal' → keep; 'auto' → keep, but rotate allowed
      const w = rot === 'rotated' ? p.height : p.width;
      const h = rot === 'rotated' ? p.width : p.height;
      for (let i = 0; i < p.quantity; i++) pieces.push({ productId: p.id, productName: p.name, w, h, rotateAllowed: allowRot });
    });
    pieces.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

    const remaining = new Map<number, number | null>(sheets.map(s => [s.id, s.available]));
    type PackedSheet = { idx: number; sheet: SheetRow; placed: Placed[]; bbox: { x: number; y: number; w: number; h: number }; coverage: number };
    const out: PackedSheet[] = [];
    let pool = pieces.slice();

    let safety = 1000;
    while (pool.length > 0 && safety-- > 0) {
      let best: { sheet: SheetRow; placed: Placed[]; leftover: Piece[]; area: number } | null = null;

      // When productsMixable=false, restrict each sheet to ONE productId.
      const productIdGroups: (number | null)[] = productsMixable
        ? [null]
        : Array.from(new Set(pool.map(p => p.productId)));

      for (const restrictPid of productIdGroups) {
        const subPool = restrictPid === null ? pool : pool.filter(p => p.productId === restrictPid);
        if (subPool.length === 0) continue;

        // Try multiple seed orderings/orientations per sheet
        const variants: Piece[][] = [
          [...subPool].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
          [...subPool].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h)),
          [...subPool].sort((a, b) => (b.w * b.h) - (a.w * a.h)),
          [...subPool].map(p => p.rotateAllowed === false ? p : ({ ...p, w: p.h, h: p.w }))
            .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
        ];

        for (const s of sheets) {
          const av = remaining.get(s.id);
          if (av !== null && av !== undefined && av <= 0) continue;
          for (const variant of variants) {
            const r = shelfPackFFDH(s.width, s.height, bleed, variant);
            if (r.placed.length === 0) continue;
            const area = r.placed.reduce((sum, pl) => sum + pl.pw * pl.ph, 0);
            // Map placed pieces back to original pool (for leftover bookkeeping)
            const used = new Map<number, number>();
            r.placed.forEach(pl => used.set(pl.productId, (used.get(pl.productId) || 0) + 1));
            const cnt = new Map<number, number>();
            const remainingPool: Piece[] = [];
            pool.forEach(p => {
              const u = used.get(p.productId) || 0;
              const c = cnt.get(p.productId) || 0;
              if (c < u) cnt.set(p.productId, c + 1);
              else remainingPool.push(p);
            });
            if (!best || r.placed.length > best.placed.length ||
              (r.placed.length === best.placed.length && area > best.area)) {
              best = { sheet: s, placed: r.placed, leftover: remainingPool, area };
            }
          }
        }
      }
      if (!best) break;
      // bbox
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      best.placed.forEach(pl => {
        if (pl.x < minX) minX = pl.x;
        if (pl.y < minY) minY = pl.y;
        if (pl.x + pl.pw > maxX) maxX = pl.x + pl.pw;
        if (pl.y + pl.ph > maxY) maxY = pl.y + pl.ph;
      });
      const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      const coverage = best.area / (best.sheet.width * best.sheet.height);
      out.push({ idx: out.length + 1, sheet: best.sheet, placed: best.placed, bbox, coverage });
      pool = best.leftover;
      const av = remaining.get(best.sheet.id);
      if (av !== null && av !== undefined) remaining.set(best.sheet.id, av - 1);
    }

    const sheetUsageM = new Map<number, number>();
    out.forEach(s => sheetUsageM.set(s.sheet.id, (sheetUsageM.get(s.sheet.id) || 0) + 1));
    const producedByProduct = new Map<number, number>();
    out.forEach(s => s.placed.forEach(pl => producedByProduct.set(pl.productId, (producedByProduct.get(pl.productId) || 0) + 1)));
    const shortageByProduct = new Map<number, number>();
    pool.forEach(p => shortageByProduct.set(p.productId, (shortageByProduct.get(p.productId) || 0) + 1));

    return { sheets: out, sheetUsage: sheetUsageM, producedByProduct, shortageByProduct };
  }, [products, sheets, bleed, productsMixable]);

  // ── Szálanyag (1D cutting stock) ────────────────────────────
  // FFD: minden darabot (mennyiség szerint kibontva, hossz szerint csökkenő)
  // best-fit a már nyitott szálakra; ha nem fér, új szálat nyit a legkisebb
  // megfelelő típusból (még van készlet).
  const barPlan = useMemo(() => {
    type Open = BarPlan;
    const opens: Open[] = [];
    const remaining = new Map<number, number | null>(bars.map(b => [b.id, b.available]));
    const shortageByProduct = new Map<number, number>();

    // expand pieces
    type Piece = { productId: number; productName: string; length: number; };
    const pieces: Piece[] = [];
    for (const p of barProducts) {
      for (let i = 0; i < p.quantity; i++) pieces.push({ productId: p.id, productName: p.name, length: p.length });
    }
    pieces.sort((a, b) => b.length - a.length);

    for (const piece of pieces) {
      // best fit existing
      let bestIdx = -1;
      let bestSlack = Infinity;
      for (let i = 0; i < opens.length; i++) {
        const o = opens[i];
        const need = piece.length + (o.cuts.length > 0 ? kerf : 0);
        const free = o.barLength - o.usedLength;
        if (free >= need && free - need < bestSlack) {
          bestSlack = free - need; bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const o = opens[bestIdx];
        const add = piece.length + (o.cuts.length > 0 ? kerf : 0);
        o.cuts.push({ productId: piece.productId, productName: piece.productName, length: piece.length });
        o.usedLength += add;
        o.waste = o.barLength - o.usedLength;
        continue;
      }
      // open new bar: smallest bar type that fits piece, with availability
      const candidates = bars
        .filter(b => b.length >= piece.length)
        .filter(b => {
          const av = remaining.get(b.id);
          return av === null || (av ?? 0) > 0;
        })
        .sort((a, b) => a.length - b.length);
      const chosen = candidates[0];
      if (!chosen) {
        shortageByProduct.set(piece.productId, (shortageByProduct.get(piece.productId) || 0) + 1);
        continue;
      }
      const newBar: Open = {
        barTypeId: chosen.id,
        barTypeName: chosen.name,
        barLength: chosen.length,
        cuts: [{ productId: piece.productId, productName: piece.productName, length: piece.length }],
        usedLength: piece.length,
        waste: chosen.length - piece.length,
      };
      opens.push(newBar);
      const av = remaining.get(chosen.id);
      if (av !== null && av !== undefined) remaining.set(chosen.id, av - 1);
    }

    // bar type usage
    const barUsage = new Map<number, number>();
    opens.forEach(o => barUsage.set(o.barTypeId, (barUsage.get(o.barTypeId) || 0) + 1));

    return { plans: opens, shortageByProduct, barUsage };
  }, [barProducts, bars, kerf]);

  // ── Tekercses ────────────────────────────────────────────
  const rollAllocations = useMemo<RollAllocation[]>(() => {
    const remaining = new Map<number, number | null>(
      rolls.map(r => [r.id, r.availableLength === null ? null : r.availableLength * 1000])
    );
    const out: RollAllocation[] = [];

    for (const p of rollProducts) {
      // for each roll compute best fit (most pieces across, then highest coverage)
      type Cand = { roll: RollRow; piecesAcross: number; rotated: boolean; rowLengthMm: number; coverage: number; };
      const cands: Cand[] = [];
      for (const r of rolls) {
        const accNormal = Math.max(0, Math.floor((r.width + rollGap) / (p.width + rollGap)));
        const accRotated = Math.max(0, Math.floor((r.width + rollGap) / (p.length + rollGap)));
        if (accNormal > 0) {
          const usedW = accNormal * p.width + (accNormal - 1) * rollGap;
          cands.push({ roll: r, piecesAcross: accNormal, rotated: false, rowLengthMm: p.length + rollGap, coverage: usedW / r.width });
        }
        if (accRotated > 0) {
          const usedW = accRotated * p.length + (accRotated - 1) * rollGap;
          cands.push({ roll: r, piecesAcross: accRotated, rotated: true, rowLengthMm: p.width + rollGap, coverage: usedW / r.width });
        }
      }
      // best: most pieces across; tiebreak by coverage; then by lowest row length
      cands.sort((a, b) => b.piecesAcross - a.piecesAcross || b.coverage - a.coverage || a.rowLengthMm - b.rowLengthMm);
      const best = cands[0];
      if (!best || best.piecesAcross === 0) {
        out.push({
          productId: p.id, productName: p.name, rollId: -1, rollName: '—',
          rollWidth: 0, productWidth: p.width, productLength: p.length, rotated: false,
          piecesAcross: 0, rowsNeeded: 0, rowLengthMm: 0, totalLengthMm: 0,
          qty: 0, shortage: p.quantity, coverage: 0,
        });
        continue;
      }
      const rowsNeeded = Math.ceil(p.quantity / best.piecesAcross);
      let totalLengthMm = rowsNeeded * best.rowLengthMm - rollGap;
      if (totalLengthMm < 0) totalLengthMm = 0;

      const av = remaining.get(best.roll.id);
      let actualLengthMm = totalLengthMm;
      let producedQty = p.quantity;
      let shortage = 0;
      if (av !== null && av !== undefined) {
        if (av < totalLengthMm) {
          // limited length
          const possibleRows = Math.max(0, Math.floor((av + rollGap) / best.rowLengthMm));
          producedQty = Math.min(p.quantity, possibleRows * best.piecesAcross);
          actualLengthMm = possibleRows > 0 ? possibleRows * best.rowLengthMm - rollGap : 0;
          shortage = p.quantity - producedQty;
        }
        remaining.set(best.roll.id, Math.max(0, av - actualLengthMm));
      }

      out.push({
        productId: p.id, productName: p.name, rollId: best.roll.id, rollName: best.roll.name,
        rollWidth: best.roll.width, productWidth: p.width, productLength: p.length, rotated: best.rotated,
        piecesAcross: best.piecesAcross, rowsNeeded: Math.ceil(producedQty / best.piecesAcross),
        rowLengthMm: best.rowLengthMm, totalLengthMm: actualLengthMm,
        qty: producedQty, shortage, coverage: best.coverage,
      });
    }
    return out;
  }, [rollProducts, rolls, rollGap]);

  const rollUsage = useMemo(() => {
    const map = new Map<number, number>(); // mm
    rollAllocations.forEach(ra => {
      if (ra.rollId < 0) return;
      map.set(ra.rollId, (map.get(ra.rollId) || 0) + ra.totalLengthMm);
    });
    return map;
  }, [rollAllocations]);

  // ── Vegyes packer Tekercseshez – több termék egy tekercsen ─────────
  const mixedRolls = useMemo(() => {
    const pieces: Piece[] = [];
    rollProducts.forEach(p => {
      const rot = p.rotate ?? 'auto';
      const allowRot = rot === 'auto';
      const w = rot === 'rotated' ? p.length : p.width;
      const h = rot === 'rotated' ? p.width : p.length;
      for (let i = 0; i < p.quantity; i++) pieces.push({ productId: p.id, productName: p.name, w, h, rotateAllowed: allowRot });
    });
    pieces.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

    type PackedRoll = {
      idx: number; roll: RollRow; placed: Placed[];
      usedLengthMm: number; bboxW: number; bboxH: number;
      printedAreaMm2: number; coverage: number;
    };
    const out: PackedRoll[] = [];
    let pool = pieces.slice();

    // Per-roll remaining length budget (mm); null/∞ → very large.
    const remaining = new Map<number, number>();
    rolls.forEach(r => remaining.set(r.id, r.availableLength === null ? 1e9 : r.availableLength * 1000));

    let safety = 200;
    while (pool.length > 0 && safety-- > 0) {
      // Evaluate every roll with remaining budget; pick best by coverage,
      // then by pieces packed (more = better), then by narrower roll (less waste width).
      let best: { r: RollRow; placed: Placed[]; leftover: Piece[]; usedLengthMm: number; bboxW: number; bboxH: number; area: number; coverage: number } | null = null;

      // Try multiple seed orderings/orientations and pick the best per (roll).
      // 4th variant pre-rotates only pieces that allow rotation
      const variants: Piece[][] = [
        [...pool].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
        [...pool].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h)),
        [...pool].sort((a, b) => (b.w * b.h) - (a.w * a.h)),
        [...pool].map(p => p.rotateAllowed === false ? p : ({ ...p, w: p.h, h: p.w }))
          .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
      ];

      for (const r of rolls) {
        const rem = remaining.get(r.id) || 0;
        if (rem <= 0) continue;
        for (const variant of variants) {
          const result = shelfPackFFDH(r.width, rem, rollGap, variant, !keepRollRows);
          if (result.placed.length === 0) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let area = 0;
          result.placed.forEach(pl => {
            if (pl.x < minX) minX = pl.x;
            if (pl.y < minY) minY = pl.y;
            if (pl.x + pl.pw > maxX) maxX = pl.x + pl.pw;
            if (pl.y + pl.ph > maxY) maxY = pl.y + pl.ph;
            area += pl.pw * pl.ph;
          });
          const usedLengthMm = maxY;
          const coverage = usedLengthMm > 0 ? area / (r.width * usedLengthMm) : 0;
          // Map leftover back to ORIGINAL pool entries (so forced-rotation variant doesn't permanently rotate the pool)
          const placedKey = new Set<string>();
          result.placed.forEach(pl => placedKey.add(`${pl.productId}|${Math.min(pl.pw, pl.ph)}|${Math.max(pl.pw, pl.ph)}`));
          const used = new Map<string, number>();
          result.placed.forEach(pl => {
            const k = `${pl.productId}`;
            used.set(k, (used.get(k) || 0) + 1);
          });
          const remainingPool: Piece[] = [];
          const cnt = new Map<number, number>();
          pool.forEach(p => {
            const k = p.productId;
            const u = used.get(`${k}`) || 0;
            const c = cnt.get(k) || 0;
            if (c < u) { cnt.set(k, c + 1); /* consumed */ }
            else remainingPool.push(p);
          });
          const cand = {
            r, placed: result.placed, leftover: remainingPool,
            usedLengthMm, bboxW: maxX - minX, bboxH: maxY - minY, area, coverage,
          };
          if (!best) { best = cand; continue; }
          if (cand.coverage > best.coverage + 1e-6) best = cand;
          else if (Math.abs(cand.coverage - best.coverage) <= 1e-6) {
            if (cand.placed.length > best.placed.length) best = cand;
            else if (cand.placed.length === best.placed.length && cand.r.width < best.r.width) best = cand;
          }
        }
      }
      if (!best) break;
      out.push({
        idx: out.length + 1, roll: best.r, placed: best.placed,
        usedLengthMm: best.usedLengthMm, bboxW: best.bboxW, bboxH: best.bboxH,
        printedAreaMm2: best.area, coverage: best.coverage,
      });
      remaining.set(best.r.id, (remaining.get(best.r.id) || 0) - best.usedLengthMm);
      pool = best.leftover;
    }

    const rollUsageM = new Map<number, number>();
    out.forEach(o => rollUsageM.set(o.roll.id, (rollUsageM.get(o.roll.id) || 0) + o.usedLengthMm));
    const producedByProduct = new Map<number, number>();
    out.forEach(o => o.placed.forEach(pl => producedByProduct.set(pl.productId, (producedByProduct.get(pl.productId) || 0) + 1)));
    const shortageByProduct = new Map<number, number>();
    pool.forEach(p => shortageByProduct.set(p.productId, (shortageByProduct.get(p.productId) || 0) + 1));

    return { rolls: out, rollUsage: rollUsageM, producedByProduct, shortageByProduct };
  }, [rollProducts, rolls, rollGap, keepRollRows]);

  // ── Renderek külön módokhoz ─────────────────────────────────────────
  const renderSzalanyag = () => (
    <>
      <Row gutter={16}>
        {/* Termékek (1D) */}
        <Col span={12}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#389e0d' }}>Termékek (darabok)</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={addBarProduct}>Darab</Button>
            </div>
            {barProducts.map(p => (
              <Row key={p.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={9}>
                  <Input size="small" value={p.name} onChange={e => updateBarProduct(p.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={7}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 120 }} value={p.length} min={1}
                    onChange={v => updateBarProduct(p.id, { length: Number(v) || 0 })} addonAfter="mm" placeholder="Hossz" />
                </Col>
                <Col span={6}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 84 }} value={p.quantity} min={0}
                    onChange={v => updateBarProduct(p.id, { quantity: Number(v) || 0 })} addonAfter="db" placeholder="Db" />
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {barProducts.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeBarProduct(p.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>
        {/* Szálak */}
        <Col span={12}>
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#0958d9' }}>Szálanyag (rendelkezésre álló)</Text>
              <Space>
                <span style={{ fontSize: 12 }}>Darabolási vastagság:</span>
                <Tooltip title="Vágásnál levesz anyag (kerf, mm)">
                  <InputNumber size="small" controls={false} min={0} value={kerf} onChange={v => setKerf(Number(v) || 0)} addonAfter="mm" style={{ width: 96 }} />
                </Tooltip>
                <Button size="small" icon={<PlusOutlined />} onClick={addBar}>Szál</Button>
              </Space>
            </div>
            {bars.map(b => (
              <Row key={b.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={8}>
                  <Input size="small" value={b.name} onChange={e => updateBar(b.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={8}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 120 }} value={b.length} min={1}
                    onChange={v => updateBar(b.id, { length: Number(v) || 0 })} addonAfter="mm" placeholder="Szálhossz" />
                </Col>
                <Col span={6}>
                  <Tooltip title="Üres = végtelen">
                    <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 84 }} value={b.available ?? undefined} min={0}
                      onChange={v => updateBar(b.id, { available: v == null ? null : Number(v) })}
                      addonAfter="db" placeholder="∞" />
                  </Tooltip>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {bars.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeBar(b.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>
      </Row>

      {/* Vágási terv (csoportosítva) */}
      <div style={{ marginTop: 16 }}>
        {(() => {
          // Group identical bar plans
          const groups: { sig: string; sample: typeof barPlan.plans[number]; indices: number[] }[] = [];
          const map = new Map<string, number>();
          barPlan.plans.forEach((bp, i) => {
            const sig = `${bp.barTypeName}|${bp.barLength}|` + bp.cuts.map(c => `${c.productId}:${c.length}`).join(',');
            const gi = map.get(sig);
            if (gi !== undefined) groups[gi].indices.push(i + 1);
            else { map.set(sig, groups.length); groups.push({ sig, sample: bp, indices: [i + 1] }); }
          });
          return (
            <>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Optimális darabolási terv – {groups.length} különböző minta / {barPlan.plans.length} szál
              </Text>
              {barPlan.plans.length === 0 && <Text type="secondary">Nincs darabolható mennyiség.</Text>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.map((g, gi) => {
                  const bp = g.sample;
                  const scale = Math.min(900 / bp.barLength, 0.5);
                  const svgW = Math.round(bp.barLength * scale);
                  const svgH = 26;
                  let cursor = 0;
                  const idxLabel = g.indices.length > 1
                    ? `Szál #${g.indices[0]}…#${g.indices[g.indices.length - 1]}`
                    : `Szál #${g.indices[0]}`;
                  return (
                    <div key={gi} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <b>{idxLabel}</b> – {bp.barTypeName} ({bp.barLength} mm) ·
                        <span style={{ marginLeft: 6 }}>használt: <b>{bp.usedLength} mm</b> · maradék: <b style={{ color: bp.waste > 0 ? '#fa8c16' : '#52c41a' }}>{bp.waste} mm</b></span>
                        {g.indices.length > 1 && <Tag color="green" style={{ marginLeft: 8 }}>×{g.indices.length} azonos</Tag>}
                      </div>
                      <svg width={svgW} height={svgH} style={{ display: 'block', border: '1px solid #d9d9d9', background: '#fafafa' }}>
                        {bp.cuts.map((c, ci) => {
                          if (ci > 0) cursor += kerf;
                          const x = cursor;
                          const w = c.length;
                          cursor += w;
                          const col = colorForProduct(c.productId);
                          return (
                            <g key={ci}>
                              {ci > 0 && (
                                <rect x={(x - kerf) * scale} y={0} width={Math.max(1, kerf * scale)} height={svgH} fill="#ff4d4f" opacity={0.6} />
                              )}
                              <rect x={x * scale} y={0} width={w * scale} height={svgH} fill={col.fill} stroke={col.stroke} strokeWidth={0.6} />
                              {w * scale > 30 && (
                                <text x={(x + w / 2) * scale} y={svgH / 2 + 4} fontSize={10} textAnchor="middle" fill="#333">
                                  {c.productName} {c.length}
                                </text>
                              )}
                            </g>
                          );
                        })}
                        {bp.waste > 0 && (
                          <rect x={bp.usedLength * scale} y={0} width={bp.waste * scale} height={svgH} fill="#fafafa" stroke="#d9d9d9" strokeDasharray="3 2" />
                        )}
                      </svg>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Szál felhasználás */}
      <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Szál felhasználás</Text>
        <Space wrap>
          {bars.map(b => {
            const used = barPlan.barUsage.get(b.id) || 0;
            const limit = b.available;
            const over = limit !== null && used > limit;
            return (
              <Tag key={b.id} color={over ? 'red' : used > 0 ? 'blue' : 'default'}>
                {b.name}: {used} {limit !== null ? `/ ${limit}` : '/ ∞'} db
              </Tag>
            );
          })}
        </Space>
      </div>

      {Array.from(barPlan.shortageByProduct.entries()).length > 0 && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message={`Hiány: ${Array.from(barPlan.shortageByProduct.entries()).map(([pid, n]) => {
            const p = barProducts.find(x => x.id === pid);
            return `${p?.name || '?'} (${n} db)`;
          }).join(', ')}`}
        />
      )}
    </>
  );

  const renderTekerces = () => (
    <>
      <Row gutter={16}>
        {/* Termékek */}
        <Col span={12}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#389e0d' }}>Termékek</Text>
              <Space>
                <Tooltip title="Be: szigorú sormagasság (a polcban indított első darab határozza meg). Ki: a termékek túlnyúlhatnak a soron.">
                  <span style={{ fontSize: 12, color: '#666' }}>Sorok tartása:</span>
                </Tooltip>
                <Switch size="small" checked={keepRollRows} onChange={setKeepRollRows} />
                <Button size="small" icon={<PlusOutlined />} onClick={addRollProduct}>Termék</Button>
              </Space>
            </div>
            {rollProducts.map(p => (
              <Row key={p.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={5}>
                  <Input size="small" value={p.name} onChange={e => updateRollProduct(p.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 100 }} value={p.width} min={1}
                    onChange={v => updateRollProduct(p.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 100 }} value={p.length} min={1}
                    onChange={v => updateRollProduct(p.id, { length: Number(v) || 0 })} addonAfter="mm" placeholder="Hossz" />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={p.quantity} min={0}
                    onChange={v => updateRollProduct(p.id, { quantity: Number(v) || 0 })} addonAfter="db" placeholder="Db" />
                </Col>
                <Col span={5}>
                  <Tooltip title="Termék forgatása: A=automatikus, 0=eredeti, 90=elforgatva">
                    <Radio.Group size="small" value={p.rotate ?? 'auto'} onChange={e => updateRollProduct(p.id, { rotate: e.target.value })}>
                      <Radio.Button value="auto">A</Radio.Button>
                      <Radio.Button value="normal">0°</Radio.Button>
                      <Radio.Button value="rotated">90°</Radio.Button>
                    </Radio.Group>
                  </Tooltip>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {rollProducts.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRollProduct(p.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>

        {/* Tekercsek */}
        <Col span={12}>
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#0958d9' }}>Tekercsek</Text>
              <Space>
                <span style={{ fontSize: 12 }}>Nyomatköz:</span>
                <Tooltip title="Két nyomat közötti távolság (mm)">
                  <InputNumber size="small" controls={false} min={0} value={rollGap} onChange={v => setRollGap(Number(v) || 0)} addonAfter="mm" style={{ width: 90 }} />
                </Tooltip>
                <Button size="small" icon={<PlusOutlined />} onClick={addRoll}>Tekercs</Button>
              </Space>
            </div>
            {rolls.map(r => (
              <Row key={r.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={8}>
                  <Input size="small" value={r.name} onChange={e => updateRoll(r.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={7}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 120 }} value={r.width} min={1}
                    onChange={v => updateRoll(r.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={7}>
                  <Tooltip title="Üres = végtelen (folyóméter)">
                    <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 96 }} value={r.availableLength ?? undefined} min={0}
                      onChange={v => updateRoll(r.id, { availableLength: v == null ? null : Number(v) })}
                      addonAfter="fm" placeholder="∞" />
                  </Tooltip>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {rolls.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRoll(r.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>
      </Row>

      {/* Allokáció táblázat */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Optimális kiosztás (több termék is kerülhet egy tekercsre)</Text>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={rollProducts.map(p => {
            let rotCount = 0, totCount = 0;
            mixedRolls.rolls.forEach(mr => mr.placed.forEach(pl => {
              if (pl.productId !== p.id) return;
              totCount++;
              if (Math.abs(pl.pw - p.width) > 0.5) rotCount++;
            }));
            const rotInfo = totCount === 0 ? '' :
              rotCount === 0 ? '0°' :
              rotCount === totCount ? '90°' :
              `vegyes (${rotCount}/${totCount} elforgatva)`;
            return {
              key: p.id,
              product: `${p.name} (${p.width}×${p.length})`,
              needed: p.quantity,
              produced: mixedRolls.producedByProduct.get(p.id) || 0,
              rotation: rotInfo,
              shortage: mixedRolls.shortageByProduct.get(p.id) || 0,
            };
          })}
          columns={[
            { title: 'Termék', dataIndex: 'product', key: 'product' },
            { title: 'Kért', dataIndex: 'needed', key: 'needed', align: 'right', width: 90 },
            { title: 'Gyártott', dataIndex: 'produced', key: 'produced', align: 'right', width: 100 },
            {
              title: 'Forgatás', dataIndex: 'rotation', key: 'rotation', width: 130,
              render: (v: string) => !v ? <span style={{ color: '#bbb' }}>—</span> :
                v === '0°' ? <Tag color="default">0°</Tag> :
                v === '90°' ? <Tag color="orange">90°</Tag> :
                <Tag color="gold">{v}</Tag>,
            },
            {
              title: 'Hiány', dataIndex: 'shortage', key: 'shortage', align: 'right', width: 90,
              render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <span style={{ color: '#999' }}>0</span>,
            },
          ]}
        />
      </div>

      {/* Vizuális tekercs (vegyes) */}
      {mixedRolls.rolls.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 8, border: '1px solid #ffe7ba' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Tekercs vizualizáció</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {mixedRolls.rolls.map(mr => {
              const sw = mr.roll.width;
              const sh = mr.usedLengthMm;
              if (sh <= 0) return null;
              const scale = Math.min(220 / sw, 360 / sh, 1);
              const svgW = Math.round(sw * scale);
              const svgH = Math.round(sh * scale);
              const printedM2 = mr.printedAreaMm2 / 1e6;
              const counts = new Map<number, { name: string; n: number }>();
              mr.placed.forEach(pl => {
                const c = counts.get(pl.productId);
                if (c) c.n++; else counts.set(pl.productId, { name: pl.productName, n: 1 });
              });
              return (
                <div key={mr.idx} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, minWidth: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0958d9', marginBottom: 4 }}>
                    Tekercs #{mr.idx} – {mr.roll.name} ({sw} mm)
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                    <div>Felhasznált hossz: <b>{(mr.usedLengthMm / 1000).toFixed(2)} fm</b> · Fedettség: <b>{Math.round(mr.coverage * 100)}%</b></div>
                    <div>Nyomott felület: <b>{printedM2.toFixed(3)} m²</b> · Befoglaló: <b>{Math.round(mr.bboxW)}×{Math.round(mr.bboxH)} mm</b></div>
                  </div>
                  <div style={{ border: '2px solid #69b1ff', borderRadius: 4, background: '#fff', display: 'inline-block', overflow: 'hidden', padding: 2 }}>
                    <svg width={svgW} height={svgH} viewBox={`0 0 ${sw} ${sh}`}>
                      <rect x={0} y={0} width={sw} height={sh} fill="#fafafa" />
                      {mr.placed.map((pl, ci) => {
                        const c = colorForProduct(pl.productId);
                        return (
                          <rect key={ci} x={pl.x} y={pl.y} width={pl.pw} height={pl.ph}
                            fill={c.fill} stroke={c.stroke} strokeWidth={0.5} />
                        );
                      })}
                    </svg>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Array.from(counts.entries()).map(([pid, c], i) => {
                      const col = colorForProduct(pid);
                      return (
                        <Tag key={i} style={{ background: col.fill, borderColor: col.stroke, color: '#000' }}>
                          {c.name}: {c.n} db
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tekercs felhasználás */}
      <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Tekercs felhasználás</Text>
        <Space wrap>
          {rolls.map(r => {
            const usedMm = mixedRolls.rollUsage.get(r.id) || 0;
            const usedM = usedMm / 1000;
            const limit = r.availableLength;
            const over = limit !== null && usedM > limit;
            return (
              <Tag key={r.id} color={over ? 'red' : usedMm > 0 ? 'blue' : 'default'}>
                {r.name}: {usedM.toFixed(2)} {limit !== null ? `/ ${limit}` : '/ ∞'} fm
              </Tag>
            );
          })}
        </Space>
      </div>

      {Array.from(mixedRolls.shortageByProduct.values()).some(v => v > 0) && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message={`Hiány: ${Array.from(mixedRolls.shortageByProduct.entries()).map(([pid, n]) => {
            const p = rollProducts.find(x => x.id === pid);
            return `${p?.name || '?'} (${n} db)`;
          }).join(', ')}`}
        />
      )}
    </>
  );

  return (
    <Modal
      title={<span><AppstoreOutlined style={{ marginRight: 8 }} />Impozíció – Produkciózás (segédlet)</span>}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Bezár"
      cancelButtonProps={{ style: { display: 'none' } }}
      width={1265}
      styles={{ body: { padding: 10 } }}
    >
      {/* ── Presetek ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12, padding: 10, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Space wrap style={{ width: '100%' }}>
          <Text strong>Mentett impozíciók:</Text>
          <Select
            style={{ minWidth: 240 }}
            placeholder="Válassz mentett impozíciót…"
            value={activePresetId ?? undefined}
            onChange={(v) => loadPreset(v)}
            allowClear
            onClear={newPreset}
            options={presets.map(p => ({ label: p.name, value: p.id }))}
          />
          <Input
            style={{ width: 220 }}
            placeholder="Név"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
          />
          <Button icon={<SaveOutlined />} type="primary" onClick={savePreset}>
            {activePresetId ? 'Mentés' : 'Mentés újként'}
          </Button>
          <Button icon={<CopyOutlined />} onClick={duplicatePreset} disabled={!presets.length && !activePresetId}>
            Másolás
          </Button>
          <Button icon={<FileAddOutlined />} onClick={newPreset}>
            Új
          </Button>
          {activePresetId && (
            <Popconfirm title="Biztosan törlöd ezt az impozíciót?" okText="Törlés" cancelText="Mégse" onConfirm={deletePreset}>
              <Button icon={<DeleteOutlined />} danger>Törlés</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* ── Mód választó ─────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { label: 'Íves (2D)', value: 'ives' },
            { label: 'Szálanyag (1D)', value: 'szalanyag' },
            { label: 'Tekercses (folyóméter)', value: 'tekerces' },
          ]}
          block
        />
      </div>

      {mode === 'ives' && (<>
      <Row gutter={16}>
        {/* ── Termékek ──────────────────────────────────────────── */}
        <Col span={12}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#389e0d' }}>Termékek</Text>
              <Space>
                <Tooltip title="Be: többféle termék mehet egy ívre. Ki: egy íven csak egyféle termék.">
                  <span style={{ fontSize: 12, color: '#666' }}>Keverhető:</span>
                </Tooltip>
                <Switch size="small" checked={productsMixable} onChange={setProductsMixable} />
                <Button size="small" icon={<PlusOutlined />} onClick={addProduct}>Termék</Button>
              </Space>
            </div>
            {products.map((p, idx) => (
              <Row key={p.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={5}>
                  <Input size="small" value={p.name} onChange={e => updateProduct(p.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 100 }} value={p.width} min={1}
                    onChange={v => updateProduct(p.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 100 }} value={p.height} min={1}
                    onChange={v => updateProduct(p.id, { height: Number(v) || 0 })} addonAfter="mm" placeholder="Mag." />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={p.quantity} min={0}
                    onChange={v => updateProduct(p.id, { quantity: Number(v) || 0 })} addonAfter="db" placeholder="Db" />
                </Col>
                <Col span={5}>
                  <Tooltip title="Termék forgatása: A=automatikus, 0=eredeti, 90=elforgatva">
                    <Radio.Group size="small" value={p.rotate ?? 'auto'} onChange={e => updateProduct(p.id, { rotate: e.target.value })}>
                      <Radio.Button value="auto">A</Radio.Button>
                      <Radio.Button value="normal">0°</Radio.Button>
                      <Radio.Button value="rotated">90°</Radio.Button>
                    </Radio.Group>
                  </Tooltip>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {products.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeProduct(p.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>

        {/* ── Ívek ──────────────────────────────────────────── */}
        <Col span={12}>
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#0958d9' }}>Ívek (rendelkezésre álló)</Text>
              <Space>
                <span style={{ fontSize: 12 }}>Nyomatköz:</span>
                <Tooltip title="Két nyomat közötti távolság (mm)">
                  <InputNumber size="small" controls={false} min={0} value={bleed} onChange={v => setBleed(Number(v) || 0)} addonAfter="mm" style={{ width: 90 }} />
                </Tooltip>
                <Button size="small" icon={<PlusOutlined />} onClick={addSheet}>Ív</Button>
              </Space>
            </div>
            {sheets.map(s => (
              <Row key={s.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={3}>
                  <Input size="small" value={s.name} onChange={e => updateSheet(s.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={5}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 120 }} value={s.width} min={1}
                    onChange={v => updateSheet(s.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={5}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 120 }} value={s.height} min={1}
                    onChange={v => updateSheet(s.id, { height: Number(v) || 0 })} addonAfter="mm" placeholder="Mag." />
                </Col>
                <Col span={4}>
                  <Tooltip title="Üres = végtelen">
                    <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 84 }} value={s.available ?? undefined} min={0}
                      onChange={v => updateSheet(s.id, { available: v == null ? null : Number(v) })}
                      addonAfter="db" placeholder="∞" />
                  </Tooltip>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {sheets.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeSheet(s.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>
      </Row>

      {/* ── Eredménymátrix: db/ív termékenként és ívenként ──────────────── */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Kihozatal (db/ív) – minden ív × termék kombináció</Text>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={matrix.map(m => ({
            key: m.product.id,
            product: `${m.product.name} (${m.product.width}×${m.product.height})`,
            ...Object.fromEntries(m.perSheetBy.map(ps => [
              `s_${ps.sheet.id}`,
              ps.count > 0
                ? `${ps.count} db (${ps.cols}×${ps.rows}${ps.rotated ? ', 90°' : ''})`
                : '—',
            ])),
          }))}
          columns={[
            { title: 'Termék', dataIndex: 'product', key: 'product', width: 200 },
            ...sheets.map(s => ({
              title: `${s.name} (${s.width}×${s.height})`,
              dataIndex: `s_${s.id}`,
              key: `s_${s.id}`,
            })),
          ]}
        />
      </div>

      {/* ── Allokáció (vegyes packing) ──────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Optimális allokáció (több termék is kerülhet egy ívre)</Text>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={products.map(p => {
            const produced = mixedSheets.producedByProduct.get(p.id) || 0;
            const shortage = mixedSheets.shortageByProduct.get(p.id) || 0;
            // Count rotation: a placed piece is rotated if its pw differs from product.width
            let rotCount = 0, totCount = 0;
            mixedSheets.sheets.forEach(ms => ms.placed.forEach(pl => {
              if (pl.productId !== p.id) return;
              totCount++;
              if (Math.abs(pl.pw - p.width) > 0.5) rotCount++;
            }));
            const rotInfo = totCount === 0 ? '' :
              rotCount === 0 ? '0°' :
              rotCount === totCount ? '90°' :
              `vegyes (${rotCount}/${totCount} elforgatva)`;
            return {
              key: p.id,
              product: `${p.name} (${p.width}×${p.height})`,
              needed: p.quantity,
              produced,
              rotation: rotInfo,
              shortage,
            };
          })}
          columns={[
            { title: 'Termék', dataIndex: 'product', key: 'product' },
            { title: 'Kért', dataIndex: 'needed', key: 'needed', align: 'right', width: 90 },
            { title: 'Gyártott', dataIndex: 'produced', key: 'produced', align: 'right', width: 100 },
            {
              title: 'Forgatás', dataIndex: 'rotation', key: 'rotation', width: 130,
              render: (v: string) => !v ? <span style={{ color: '#bbb' }}>—</span> :
                v === '0°' ? <Tag color="default">0°</Tag> :
                v === '90°' ? <Tag color="orange">90°</Tag> :
                <Tag color="gold">{v}</Tag>,
            },
            {
              title: 'Hiány', dataIndex: 'shortage', key: 'shortage', align: 'right', width: 90,
              render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <span style={{ color: '#999' }}>0</span>,
            },
          ]}
        />
      </div>

      {/* ── Ív felhasználás összesítő ──────────────────────────────── */}
      <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Ív felhasználás</Text>
        <Space wrap>
          {sheets.map(s => {
            const used = mixedSheets.sheetUsage.get(s.id) || 0;
            const limit = s.available;
            const over = limit !== null && used > limit;
            return (
              <Tag key={s.id} color={over ? 'red' : used > 0 ? 'blue' : 'default'}>
                {s.name}: {used} {limit !== null ? `/ ${limit}` : '/ ∞'} db
              </Tag>
            );
          })}
        </Space>
      </div>

      {/* ── Vizuális produkciós ívek (vegyes, csoportosítva) ────────── */}
      {mixedSheets.sheets.length > 0 && (() => {
        // Group identical sheets by layout signature
        const groups: { sig: string; sample: typeof mixedSheets.sheets[number]; indices: number[] }[] = [];
        const map = new Map<string, number>();
        mixedSheets.sheets.forEach(ms => {
          const sig = `${ms.sheet.id}|${ms.sheet.width}x${ms.sheet.height}|` +
            ms.placed.map(p => `${p.productId}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.pw)}:${Math.round(p.ph)}`).sort().join(',');
          const gi = map.get(sig);
          if (gi !== undefined) groups[gi].indices.push(ms.idx);
          else { map.set(sig, groups.length); groups.push({ sig, sample: ms, indices: [ms.idx] }); }
        });
        return (
          <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 8, border: '1px solid #ffe7ba' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Produkciós ívek (vizuális) – {groups.length} különböző elrendezés / {mixedSheets.sheets.length} ív
            </Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {groups.map((g, gi) => {
                const ms = g.sample;
                const sw = ms.sheet.width;
                const sh = ms.sheet.height;
                const scale = Math.min(260 / sw, 320 / sh, 1);
                const svgW = Math.round(sw * scale);
                const svgH = Math.round(sh * scale);
                const counts = new Map<number, { name: string; n: number }>();
                ms.placed.forEach(pl => {
                  const c = counts.get(pl.productId);
                  if (c) c.n++;
                  else counts.set(pl.productId, { name: pl.productName, n: 1 });
                });
                const idxLabel = g.indices.length > 1
                  ? `Ív #${g.indices[0]}…#${g.indices[g.indices.length - 1]} (${g.indices.length}× azonos)`
                  : `Ív #${g.indices[0]}`;
                return (
                  <div key={gi} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0958d9' }}>
                        {idxLabel} – {ms.sheet.name} ({sw}×{sh} mm)
                      </div>
                      {g.indices.length > 1 && <Tag color="green" style={{ marginLeft: 6 }}>×{g.indices.length}</Tag>}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                      Nyomott felület: <b>{Math.round(ms.bbox.w)}×{Math.round(ms.bbox.h)} mm</b> · Fedettség: <b>{Math.round(ms.coverage * 100)}%</b>
                    </div>
                    <div style={{ border: '2px solid #69b1ff', borderRadius: 4, background: '#fff', display: 'inline-block', overflow: 'hidden', padding: 2 }}>
                      <svg width={svgW} height={svgH} viewBox={`0 0 ${sw} ${sh}`}>
                        <rect x={0} y={0} width={sw} height={sh} fill="#fafafa" />
                        <rect x={ms.bbox.x} y={ms.bbox.y} width={ms.bbox.w} height={ms.bbox.h}
                          fill="none" stroke="#fa8c16" strokeWidth={0.6} strokeDasharray="3 2" />
                        {ms.placed.map((pl, ci) => {
                          const c = colorForProduct(pl.productId);
                          return (
                            <rect key={ci} x={pl.x} y={pl.y} width={pl.pw} height={pl.ph}
                              fill={c.fill} stroke={c.stroke} strokeWidth={0.5} />
                          );
                        })}
                      </svg>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Array.from(counts.entries()).map(([pid, c], i) => {
                        const col = colorForProduct(pid);
                        return (
                          <Tag key={i} style={{ background: col.fill, borderColor: col.stroke, color: '#000' }}>
                            {c.name}: {c.n} db
                          </Tag>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {Array.from(mixedSheets.shortageByProduct.values()).some(v => v > 0) && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message={`Hiány: ${Array.from(mixedSheets.shortageByProduct.entries()).map(([pid, n]) => {
            const p = products.find(x => x.id === pid);
            return `${p?.name || '?'} (${n} db)`;
          }).join(', ')}`}
        />
      )}
      </>)}

      {mode === 'szalanyag' && renderSzalanyag()}
      {mode === 'tekerces' && renderTekerces()}
    </Modal>
  );
};

export default ImpositionHelperModal;
