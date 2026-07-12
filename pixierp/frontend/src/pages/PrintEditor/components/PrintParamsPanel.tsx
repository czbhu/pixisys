import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select, InputNumber, Radio, Divider, Typography, Spin, Tooltip, Tag, Modal, Row, Col, Button } from 'antd';
import NumInput from '../../../components/NumInput';
import { InfoCircleOutlined, CaretDownOutlined, CaretRightOutlined, AppstoreOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import api from '../../../services/api';

const { Text, Title } = Typography;
const { Option } = Select;

interface SizePreset { id: number; name: string; width_mm: string; height_mm: string; }
interface ProductTemplateSize {
  id?: number; label: string;
  width_mm: number | null; width_max_mm?: number | null;
  height_mm: number | null; height_max_mm?: number | null;
}
interface ServiceDetail {
  id: number;
  name: string;
  code: string;
  pricing_type: string;
  setup_cost_selling: number;
  unit_cost_selling: number;
  capacity: number | null;
  max_width_mm: number | null;
  max_height_mm: number | null;
  calculation_unit: string;
  cost_summary?: { fixed: number; unit: number };
}
interface PrintServiceOption {
  id: number;
  name: string;
  code: string;
  setup_cost_selling: number;
  unit_cost_selling: number;
  max_width_mm: number | null;
  max_height_mm: number | null;
}
interface MaterialDetail {
  id: number;
  name: string;
  code?: string | null;
  width_mm?: number | null;
  length_mm?: number | null;
  unit_selling_price?: number;
  sizes?: { id: number; name: string; width_mm: number; length_mm: number; price: number }[];
}
interface SizeComparison {
  label: string;
  size_mm: [number, number];
  price_per_sheet: number;
  sheets_needed: number;
  items_per_sheet: number;
  material_cost: number;
  needs_cutting: boolean;
  is_default?: boolean;
  is_best?: boolean;
  size_id?: number;
}
interface ProductTemplate {
  id: number; name: string; code: string | null; sizes: ProductTemplateSize[];
  custom_size_enabled?: boolean;
  custom_size_width_min?: number | null;
  custom_size_width_max?: number | null;
  custom_size_height_min?: number | null;
  custom_size_height_max?: number | null;
  service_groups_1?: number[][];
  service_groups_2?: number[][];
  finishing_service_groups?: number[][];
  calculator_type?: string;
  print_sides?: 1 | 2;
  print_service_options_details?: PrintServiceOption[];
  fix_cost_first_side_only?: boolean;
  allowed_materials_details?: MaterialDetail[];
  required_services?: number[];
  finishing_services?: number[];
  binding_services_details?: { id: number; name: string; code: string }[];
  quantity_discounts?: { id: number; min_amount: number; discount_type: string; discount_value: number }[];
  template_categories?: number[];
}

export interface PriceBreakdown {
  paper_cost: number;
  print_cost_side1: number;
  print_cost_side2: number;
  finishing_cost: number;
  service_cost?: number;
  service_breakdown?: { id: number; name: string; pricing_type: string; setup_cost: number; unit_cost: number; total: number }[];
  subtotal: number;
  margin_pct: number;
  total: number;
  unit_price: number;
  quantity: number;
}

interface ClickPriceBreakdown {
  items_per_sheet: number;
  fit_w: number;
  fit_h: number;
  rotated: boolean;
  sheets_needed: number;
  clicks_total: number;
  print_sides: number;
  // production layout
  full_sheets: number;
  partial_sheet_items: number;
  partial_coverage_pct: number;
  waste_items: number;
  sheet_w_mm: number;
  sheet_h_mm: number;
  // cutting
  cutting_info: {
    needs_cutting: boolean;
    cutting_mode: string;
    material_size_mm: [number, number] | null;
    cut_sheet_size_mm: [number, number];
    cut_sheets_per_material: number;
    raw_material_sheets_needed: number;
    total_cut_sheets: number;
  };
  // per-side detailed
  print_service_name_1?: string | null;
  print_service_name_2?: string | null;
  print_service_items_1?: CostItem[];
  print_service_items_2?: CostItem[];
  print_cost_side1: number;
  print_cost_side2: number;
  print_cost: number;
  // material
  material_cost: number;
  material_name?: string | null;
  material_items?: CostItem[];
  size_comparison?: SizeComparison[];
  // extra services
  service_cost: number;
  service_breakdown: { id: number; name: string; total: number; items?: CostItem[]; category?: 'required' | 'side' | 'finishing' }[];
  subtotal: number;
  margin_pct: number;
  total: number;
  unit_price: number;
  quantity: number;
  sheet_count: number;
  total_pieces: number;
}

export interface CostItem {
  name: string;
  type: 'fixed' | 'click' | 'unit';
  price_per: number;
  units: number;
  total: number;
  supplier_id?: number | null;
  supplier_name?: string | null;
  material_id?: number | null;
  unit?: string | null;
}

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
  onPriceChange?: (b: PriceBreakdown | null) => void;
  onTemplateCategoriesChange?: (ids: number[]) => void;
  isAdmin: boolean;
}

const COLOR_MODE_OPTIONS = [
  { value: 'color', label: 'Színes' },
  { value: 'bw', label: 'Fekete-fehér' },
  { value: 'color_white', label: 'Színes + fehér' },
  { value: 'white', label: 'Fehér' },
  { value: 'none', label: 'Nyomatlan' },
];

const fmt = (n: number) => n.toLocaleString('hu-HU', { maximumFractionDigits: 0 }) + ' Ft';

/** oldal+kétoldalas → nyomtatandó ívek száma (páros egészre kerekítve) */
const pagesToÍvek = (pages: number): number => {
  const sheets = Math.ceil(pages / 2);
  return sheets % 2 === 0 ? sheets : sheets + 1;
};

/** Egység alapján kiszamolja a végleges db számot */
const toDb = (input: number, unit: 'db' | 'oldal' | 'ív', sides: '1' | '2'): number => {
  if (unit === 'db') return input;
  if (unit === 'ív') {
    // ív = 1 db, de párosan érdemes: ha kétoldalas, kerekíts párosra
    if (sides === '2') return input % 2 === 0 ? input : input + 1;
    return input;
  }
  // 'oldal'
  if (sides === '1') return input;  // 1 oldal = 1 ív = 1 db
  return pagesToÍvek(input);         // 2 oldalas: páros ívszámra kerekít
};

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text style={{
    fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: 0.8,
    textTransform: 'uppercase', display: 'block', marginBottom: 6, marginTop: 14,
  }}>
    {label}
  </Text>
);

const STORAGE_KEY = 'pixierp_editor_state';

/** Read click-state sub-object from localStorage */
const readClickState = (): any => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s).click_state ?? {};
  } catch {}
  return {};
};

const PrintParamsPanel: React.FC<Props> = ({ params, onChange, onPriceChange, onTemplateCategoriesChange, isAdmin }) => {
  const [priceOpen, setPriceOpen] = useState(true);
  const [presets, setPresets] = useState<SizePreset[]>([]);
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [allMaterials, setAllMaterials] = useState<MaterialDetail[]>([]);  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [productSizeKey, setProductSizeKey] = useState<string | null>(() => readClickState().productSizeKey ?? null);
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click-sheet-print specific state – initialize from storage
  const _cs = readClickState();
  const [clickPricing, setClickPricing] = useState<ClickPriceBreakdown | null>(null);
  const [selectedPrintSvcId1, setSelectedPrintSvcId1] = useState<number | null>(_cs.svcId1 ?? null);
  const [selectedPrintSvcId2, setSelectedPrintSvcId2] = useState<number | null>(_cs.svcId2 ?? null);

  const [clickSheetW, setClickSheetW] = useState<number>(_cs.sheetW ?? 330);
  const [clickSheetH, setClickSheetH] = useState<number>(_cs.sheetH ?? 487);
  const [clickBleed, setClickBleed] = useState<number>(_cs.bleed ?? 3);
  const [clickSides, setClickSides] = useState<1 | 2>((_cs.sides as 1 | 2) ?? 1);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(true); // true during initial load

  // Materials – derived from selectedProduct, not loaded globally

  // Imposition modal
  const [impositionModalOpen, setImpositionModalOpen] = useState(false);
  const [modalSheetW, setModalSheetW] = useState(330);
  const [modalSheetH, setModalSheetH] = useState(487);
  const [modalBleed, setModalBleed] = useState(3);
  const [modalForceRotate, setModalForceRotate] = useState<'auto' | 'normal' | 'rotated'>('auto');
  const [modalCuttingMode, setModalCuttingMode] = useState<'auto' | 'material' | 'print'>('auto');
  const [clickForceRotate, setClickForceRotate] = useState<'auto' | 'normal' | 'rotated'>((_cs.forceRotate as any) ?? 'auto');
  const [cuttingMode, setCuttingMode] = useState<'auto' | 'material' | 'print'>((_cs.cuttingMode as any) ?? 'auto');

  // Service selection: per AND-group for side 1 and side 2
  // selectedServices1[i] = chosen service IDs (multi) for group i on side 1
  const [allServices, setAllServices] = useState<ServiceDetail[]>([]);
  // Normalize restored legacy (number|null)[] shape → number[][]
  const _normGroups = (arr: any): number[][] =>
    Array.isArray(arr) ? arr.map(g => Array.isArray(g) ? g.filter((x: any) => x != null) : (g != null ? [g] : [])) : [];
  const [selectedServices1, setSelectedServices1] = useState<number[][]>(_normGroups(_cs.services1));
  const [selectedServices2, setSelectedServices2] = useState<number[][]>(_normGroups(_cs.services2));
  const [selectedFinishingServices, setSelectedFinishingServices] = useState<number[][]>(_normGroups(_cs.finishingServices));

  const svcById = new Map(allServices.map(s => [s.id, s]));
  // Robust flatten: supports both legacy (number|null)[] and new number[][] shapes
  const flattenGroups = (arr: any[]): number[] =>
    arr.flatMap(g => Array.isArray(g) ? g.filter((x): x is number => x != null) : (g != null ? [g] : []));
  // Robust per-group setter: pads the array so the value sticks even if the
  // restored selection array is shorter than the product's group count.
  const setGroupValue = (prev: number[][], idx: number, vals: number[]): number[][] => {
    const next = prev.slice();
    while (next.length <= idx) next.push([]);
    next[idx] = vals;
    return next;
  };
  const flatSelectedIds = useMemo(() => [
    ...flattenGroups(selectedServices1),
    ...flattenGroups(selectedServices2),
  ], [selectedServices1, selectedServices2]);
  const flatFinishingIds = useMemo(() =>
    flattenGroups(selectedFinishingServices),
  [selectedFinishingServices]);

  // ── Persist click-state to localStorage ────────────────────────────────
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const o = s ? JSON.parse(s) : {};
      o.click_state = {
        svcId1: selectedPrintSvcId1,
        svcId2: selectedPrintSvcId2,
        sheetW: clickSheetW,
        sheetH: clickSheetH,
        bleed: clickBleed,
        sides: clickSides,
        forceRotate: clickForceRotate,
        cuttingMode,
        productSizeKey,
        services1: selectedServices1,
        services2: selectedServices2,
        finishingServices: selectedFinishingServices,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    } catch {}
  }, [selectedPrintSvcId1, selectedPrintSvcId2, clickSheetW, clickSheetH, clickBleed, clickSides, clickForceRotate, cuttingMode, productSizeKey, selectedServices1, selectedServices2, selectedFinishingServices]);

  useEffect(() => {
    api.get('/printshop/size-presets/').then(res => {
      const data = res.data?.results ?? res.data;
      setPresets(Array.isArray(data) ? data : []);
    });
    api.get('/warehouse/materials/?page_size=1000&is_active=true').then(res => {
      const data = res.data?.results ?? res.data;
      setAllMaterials(Array.isArray(data) ? data : []);
    }).catch(() => {});
    api.get('/manufacturing/product-templates/?page_size=1000&is_active=true').then(res => {
      const data = res.data?.results ?? res.data;
      const list: ProductTemplate[] = Array.isArray(data) ? data : [];
      setProducts(list);
      // Preload product if coming from ProductEditor, or restore last selected
      try {
        const s = localStorage.getItem('pixierp_editor_state');
        if (s) {
          const stored = JSON.parse(s);
          const pid = stored.preload_product_id ?? stored.selected_product_id;
          if (pid) {
            const found = list.find(p => p.id === pid);
            if (found) {
              setSelectedProductId(pid);
              onTemplateCategoriesChange?.(found.template_categories ?? []);
            }
            if (stored.preload_product_id) {
              delete stored.preload_product_id;
              localStorage.setItem('pixierp_editor_state', JSON.stringify(stored));
            }
          }
        }
      } catch {}
    }).catch(() => {});
  }, []);

  const calculatePrice = useCallback(async (p: PrintParams) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await api.post('/printshop/orders/calculate-price/', {
          width_mm: p.width_mm, height_mm: p.height_mm, quantity: p.quantity,
          sides: p.sides, side1_mode: p.side1_mode, side2_mode: p.side2_mode,
          binding: p.binding, folding_count: p.folding_count,
          selected_service_ids: flatSelectedIds,
          finishing_service_ids: flatFinishingIds,
        });
        setPricing(res.data);
        onPriceChange?.(res.data);
      } catch {
        setPricing(null);
        onPriceChange?.(null);
      } finally {
        setCalcLoading(false);
      }
    }, 400);
  }, [flatSelectedIds, flatFinishingIds]); // eslint-disable-line

  useEffect(() => { calculatePrice(params); }, [params, flatSelectedIds, flatFinishingIds]); // eslint-disable-line

  // ── Click-sheet-print calculation ────────────────────────────────────────
  const calculateClickPrice = useCallback(async () => {
    const product = products.find(p => p.id === selectedProductId);
    if (!product || product.calculator_type !== 'click_sheet_print') return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const svcId1 = (selectedPrintSvcId1 != null && selectedPrintSvcId1 > 0) ? selectedPrintSvcId1 : null;
        const svcId2 = selectedPrintSvcId2 === null
          ? svcId1
          : (selectedPrintSvcId2 > 0 ? selectedPrintSvcId2 : null);
        const res = await api.post('/printshop/orders/calculate-price-click/', {
          width_mm:             params.width_mm,
          height_mm:            params.height_mm,
          quantity:             params.quantity,
          sheet_count:          params.sheet_count ?? 1,
          print_sides:          clickSides,
          print_service_id_1:   svcId1,
          print_service_id_2:   clickSides === 2 ? svcId2 : null,
          sheet_w_mm:           clickSheetW,
          sheet_h_mm:           clickSheetH,
          bleed_mm:             clickBleed,
          material_id:          params.material_id ?? null,
          selected_service_ids: flatSelectedIds,
          required_service_ids: product?.required_services ?? [],
          finishing_service_ids: flatFinishingIds,
          force_rotate:         clickForceRotate === 'auto' ? null : clickForceRotate === 'rotated',
          fix_cost_first_side_only: product?.fix_cost_first_side_only ?? false,
          cutting_mode:         cuttingMode,
        });
        setClickPricing(res.data);
        onPriceChange?.(res.data);
      } catch {
        setClickPricing(null);
      } finally {
        setCalcLoading(false);
      }
    }, 400);
  }, [products, selectedProductId, params.width_mm, params.height_mm, params.quantity, params.sheet_count, params.material_id,
      clickSides, selectedPrintSvcId1, selectedPrintSvcId2, clickSheetW, clickSheetH, clickBleed, clickForceRotate, cuttingMode, flatSelectedIds, flatFinishingIds]); // eslint-disable-line

  useEffect(() => {
    const product = products.find(p => p.id === selectedProductId);
    if (product?.calculator_type === 'click_sheet_print') {
      calculateClickPrice();
    }
  }, [calculateClickPrice]); // eslint-disable-line

  // Load service details whenever the selected product changes
  useEffect(() => {
    const product = products.find(p => p.id === selectedProductId);
    if (!product) { setAllServices([]); setSelectedServices1([]); setSelectedServices2([]); setSelectedFinishingServices([]); return; }
    const sg1 = product.service_groups_1 ?? [];
    const sg2 = product.service_groups_2 ?? [];
    const sgf = product.finishing_service_groups ?? [];
    const allIds = Array.from(new Set([...sg1.flat(), ...sg2.flat(), ...sgf.flat()]));
    if (allIds.length === 0) { setAllServices([]); setSelectedServices1([]); setSelectedServices2([]); setSelectedFinishingServices([]); return; }
    api.get(`/manufacturing/services/?ids=${allIds.join(',')}&page_size=200`)
      .then(res => {
        const data: ServiceDetail[] = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
        setAllServices(data);
      })
      .catch(() => setAllServices([]));
    if (restoringRef.current) {
      // On initial load, keep the restored selections (already set from localStorage)
      restoringRef.current = false;
    } else {
      // User changed product — reset selections
      setSelectedServices1(sg1.map(() => []));
      setSelectedServices2(sg2.map(() => []));
      setSelectedFinishingServices(sgf.map(() => []));
    }
  }, [selectedProductId, products]); // eslint-disable-line

  const update = (partial: Partial<PrintParams>) => {
    const next = { ...params, ...partial };
    // Whenever quantity_input, quantity_unit or sides changes, recompute quantity (db)
    const unit  = next.quantity_unit  ?? 'db';
    const input = next.quantity_input ?? next.quantity;
    const computed = toDb(input, unit, next.sides);
    onChange({ ...next, quantity: computed });
  };

  const handleProductChange = (productId: number | undefined) => {
    if (!productId) {
      setSelectedProductId(null); setProductSizeKey(null);
      onTemplateCategoriesChange?.([]);
      try { const s = localStorage.getItem('pixierp_editor_state'); if (s) { const o = JSON.parse(s); delete o.selected_product_id; delete o.template_category_ids; localStorage.setItem('pixierp_editor_state', JSON.stringify(o)); } } catch {}
      return;
    }
    setSelectedProductId(productId);
    try { const s = localStorage.getItem('pixierp_editor_state'); const o = s ? JSON.parse(s) : {}; o.selected_product_id = productId; localStorage.setItem('pixierp_editor_state', JSON.stringify(o)); } catch {}
    const product = products.find(p => p.id === productId);
    if (!product) return;
    onTemplateCategoriesChange?.(product.template_categories ?? []);
    setSelectedPreset(null);
    // Reset click-state for new product
    setClickPricing(null);
    setSelectedPrintSvcId1(null);
    setSelectedPrintSvcId2(null);
    setClickSides((product.print_sides ?? 1) as 1 | 2);
    // UV táblás/tekercses termék: alapból 1 oldalas nyomtatás
    if (product.calculator_type === 'sheet_print' || product.calculator_type === 'roll_print') {
      update({ sides: '1', side2_mode: 'none' });
    }
    // Auto-select material if exactly one is available
    const mats = product.allowed_materials_details ?? [];
    if (mats.length === 1) {
      update({ material_id: mats[0].id });
    } else if (mats.length === 0) {
      update({ material_id: null });
    }
    if (product.print_service_options_details && product.print_service_options_details.length >= 1) {
      const svc = product.print_service_options_details[0];
      setSelectedPrintSvcId1(svc.id);
      if (svc.max_width_mm) setClickSheetW(svc.max_width_mm);
      if (svc.max_height_mm) setClickSheetH(svc.max_height_mm);
    }
    if (product.sizes.length > 0) {
      const first = product.sizes[0];
      setProductSizeKey('idx_0');
      update({
        product_name: product.name,
        width_mm: Number(first.width_mm) || 148,
        height_mm: Number(first.height_mm) || 210,
      });
    } else {
      setProductSizeKey('custom');
      update({ product_name: product.name });
    }
  };

  const handleProductSizeChange = (key: string) => {
    setProductSizeKey(key);
    if (key === 'custom') return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;
    const idx = parseInt(key.replace('idx_', ''), 10);
    const sz = product.sizes[idx];
    if (!sz) return;
    update({
      width_mm: Number(sz.width_mm) || params.width_mm,
      height_mm: Number(sz.height_mm) || params.height_mm,
    });
  };

  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;
  const activeProductSize: ProductTemplateSize | null = (() => {
    if (!selectedProduct || !productSizeKey || productSizeKey === 'custom') return null;
    const idx = parseInt(productSizeKey.replace('idx_', ''), 10);
    return selectedProduct.sizes[idx] ?? null;
  })();
  const customMode = productSizeKey === 'custom' && !!selectedProduct?.custom_size_enabled;
  const effectiveWMax = customMode
    ? (selectedProduct?.custom_size_width_max  ?? null)
    : (activeProductSize?.width_max_mm ?? null);
  const effectiveHMax = customMode
    ? (selectedProduct?.custom_size_height_max ?? null)
    : (activeProductSize?.height_max_mm ?? null);
  const wMin = customMode ? (selectedProduct?.custom_size_width_min  ?? 1) : (activeProductSize?.width_mm  ?? 1);
  const hMin = customMode ? (selectedProduct?.custom_size_height_min ?? 1) : (activeProductSize?.height_mm ?? 1);
  const wMax = effectiveWMax ?? 9999;
  const hMax = effectiveHMax ?? 9999;
  const hasRange = !!(activeProductSize?.width_max_mm || activeProductSize?.height_max_mm || customMode);

  const widthExceeded  = effectiveWMax != null && (params.width_mm  ?? 0) > effectiveWMax;
  const heightExceeded = effectiveHMax != null && (params.height_mm ?? 0) > effectiveHMax;
  const sizeExceeded   = widthExceeded || heightExceeded;

  const isClickSheet = selectedProduct?.calculator_type === 'click_sheet_print';
  const clickSvcOptions: PrintServiceOption[] = selectedProduct?.print_service_options_details ?? [];

  // ── Kötészeti mód szerinti lapszám-szabály ──
  // Irkatűzött (BIND_SADDLE): 4 többszöröse; Spirál/Ragasztott/Tömbösített: páros; Ívben/egyéb: szabad.
  const bindingCode = useMemo(() => {
    const id = params.binding_mode_ids?.[0];
    if (id == null) return undefined;
    return selectedProduct?.binding_services_details?.find(b => b.id === id)?.code;
  }, [params.binding_mode_ids, selectedProduct]);
  const sheetStep = bindingCode === 'BIND_SADDLE' ? 4
    : (bindingCode === 'BIND_SPIRAL' || bindingCode === 'BIND_PERFECT' || bindingCode === 'BIND_PADDED') ? 2
    : 1;

  // ── Sync click-sheet print service selection → params.side1_mode / side2_mode ──
  // This ensures the canvas editor can show grayscale / nyomatlan overlays in click-sheet mode too.
  useEffect(() => {
    if (!isClickSheet) return;
    const deriveMode = (svcId: number | null): string => {
      if (svcId === 0) return 'none';                       // Nyomatlan
      if (svcId == null) return 'none';                     // not selected yet
      const svc = clickSvcOptions.find(s => s.id === svcId);
      if (!svc) return 'color';
      const code = (svc.code ?? '').toUpperCase();
      const name = (svc.name ?? '').toLowerCase();
      if (code.includes('_K') || code === 'BW' || name.includes('fekete')) return 'bw';
      if (code.includes('WHITE') || name.includes('fehér') && !name.includes('fekete')) return 'white';
      return 'color';
    };
    const m1 = deriveMode(selectedPrintSvcId1);
    const m2 = clickSides === 2 ? deriveMode(selectedPrintSvcId2) : 'none';
    const s  = String(clickSides) as '1' | '2';
    if (params.side1_mode !== m1 || params.side2_mode !== m2 || params.sides !== s) {
      onChange({ ...params, side1_mode: m1, side2_mode: m2, sides: s });
    }
  }, [isClickSheet, selectedPrintSvcId1, selectedPrintSvcId2, clickSides, clickSvcOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // (Reverse sync removed — forward sync svcId→mode is the single source of truth for click-sheet products)

  // Estimate per-db cost for a service option using cost_summary from backend
  const estimateSvcCostPerDb = useCallback((svc: ServiceDetail | undefined): number | null => {
    if (!svc) return null;
    const cs = svc.cost_summary;
    const fixedCost = cs?.fixed ?? (svc.setup_cost_selling || 0);
    const unitCost = cs?.unit ?? (svc.unit_cost_selling || 0);
    if (!fixedCost && !unitCost) return null;
    const qty = params.quantity || 1;
    const sheets = clickPricing?.sheets_needed ?? 1;
    const isSheetBased = (svc.calculation_unit === 'click' || svc.calculation_unit === 'sheet');
    const cap = svc.capacity || 1;
    let units: number;
    if (isSheetBased) {
      units = sheets;
    } else if (svc.pricing_type === 'per_job') {
      units = 1;
    } else if (svc.pricing_type === 'per_cut') {
      units = Math.ceil(qty / cap);
    } else {
      units = qty;
    }
    const total = fixedCost + unitCost * units;
    return total / qty;
  }, [params.quantity, clickPricing?.sheets_needed]);
  const materials = useMemo(() => {
    const allowed = selectedProduct?.allowed_materials_details ?? [];
    return allowed.length > 0 ? allowed : allMaterials;
  }, [selectedProduct, allMaterials]);
  const activePricing = isClickSheet ? null : pricing;
  const activeClickPricing = isClickSheet ? clickPricing : null;

  return (
    <>
    <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SectionLabel label="Termék" />
      <Select
        allowClear
        showSearch
        placeholder="Válassz terméket…"
        optionFilterProp="children"
        value={selectedProductId ?? undefined}
        onChange={handleProductChange}
        onClear={() => { setSelectedProductId(null); setProductSizeKey(null); }}
        style={{ width: '100%' }}
        size="small"
      >
        {products.map(p => (
          <Option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</Option>
        ))}
      </Select>

      <>
        <SectionLabel label="Méret" />

        {/* If selected product has sizes, show them; otherwise show generic presets */}
        {selectedProduct && selectedProduct.sizes.length > 0 ? (
          <Select
            value={productSizeKey ?? undefined}
            onChange={handleProductSizeChange}
            style={{ width: '100%', marginBottom: 6 }}
            size="small"
          >
            {selectedProduct.sizes.map((sz, i) => {
              const label = sz.label || `${sz.width_mm}×${sz.height_mm} mm`;
              const rangeHint = sz.width_max_mm || sz.height_max_mm
                ? ` (${sz.width_mm}–${sz.width_max_mm ?? sz.width_mm} × ${sz.height_mm}–${sz.height_max_mm ?? sz.height_mm} mm)`
                : ` (${sz.width_mm}×${sz.height_mm} mm)`;
              return <Option key={`idx_${i}`} value={`idx_${i}`}>{label}{rangeHint}</Option>;
            })}
            <Option value="custom">Egyéni méret</Option>
          </Select>
        ) : (
          <Select
            allowClear
            placeholder="Preset méret..."
            value={selectedPreset ?? undefined}
            onChange={(id: number) => {
              setSelectedPreset(id);
              const preset = presets.find(p => p.id === id);
              if (preset) update({ width_mm: parseFloat(preset.width_mm), height_mm: parseFloat(preset.height_mm), product_name: preset.name });
            }}
            onClear={() => setSelectedPreset(null)}
            style={{ width: '100%', marginBottom: 6 }}
            size="small"
          >
            {presets.map(p => (
              <Option key={p.id} value={p.id}>{p.name} ({p.width_mm}×{p.height_mm} mm)</Option>
            ))}
          </Select>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <NumInput
            size="small"
            min={wMin} max={wMax}
            placeholder="Szél."
            status={widthExceeded ? 'error' : undefined}
            style={{ flex: 1 }}
            value={params.width_mm}
            onChange={v => { if (v) { update({ width_mm: v }); setSelectedPreset(null); if (productSizeKey !== 'custom' && selectedProduct?.sizes.length) setProductSizeKey('custom'); } }}
          />
          <Text style={{ fontSize: 11, color: '#aaa' }}>×</Text>
          <NumInput
            size="small"
            min={hMin} max={hMax}
            placeholder="Mag."
            status={heightExceeded ? 'error' : undefined}
            style={{ flex: 1 }}
            value={params.height_mm}
            onChange={v => { if (v) { update({ height_mm: v }); setSelectedPreset(null); if (productSizeKey !== 'custom' && selectedProduct?.sizes.length) setProductSizeKey('custom'); } }}
          />
          <Text style={{ fontSize: 11, color: '#aaa' }}>mm</Text>
        </div>
        {sizeExceeded ? (
          <div style={{ marginBottom: 4, marginTop: 2, padding: '5px 8px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
            <Text style={{ fontSize: 11, color: '#cf1322' }}>
              A maximális méret: {effectiveWMax != null ? effectiveWMax : '–'} × {effectiveHMax != null ? effectiveHMax : '–'} mm. Maradj ebben a tartományban, vagy válassz egy másik terméket.
            </Text>
          </div>
        ) : hasRange && (
          <Text style={{ fontSize: 10, color: '#888', marginBottom: 4, display: 'block' }}>
            Tartomány: {wMin}–{wMax} × {hMin}–{hMax} mm
          </Text>
        )}

        {/* Figyelmeztetés: méret nem fér fel az ívméretre → több darabban nyomtatva */}
        {isClickSheet && !sizeExceeded && activeClickPricing && (() => {
          const prodW = (params.width_mm ?? 0) + 2 * clickBleed;
          const prodH = (params.height_mm ?? 0) + 2 * clickBleed;
          const fitsNormal  = prodW <= activeClickPricing.sheet_w_mm && prodH <= activeClickPricing.sheet_h_mm;
          const fitsRotated = prodH <= activeClickPricing.sheet_w_mm && prodW <= activeClickPricing.sheet_h_mm;
          const exceedsSheet = !fitsNormal && !fitsRotated;
          if (!exceedsSheet) return null;
          return (
            <div style={{ marginBottom: 4, marginTop: 2, padding: '5px 8px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
              <Text style={{ fontSize: 11, color: '#cf1322', fontWeight: 500 }}>
                ⚠ A megadott méret több darabban lesz kinyomva!
              </Text>
              <div style={{ fontSize: 10, color: '#cf1322', marginTop: 2 }}>
                Termékméret ({prodW}×{prodH} mm) &gt; ívméret ({activeClickPricing.sheet_w_mm}×{activeClickPricing.sheet_h_mm} mm)
              </div>
            </div>
          );
        })()}

          {/* Klikkdíjas nyomtatás: alapanyag → oldalszám → oldalankénti szolgáltatás → ívméret */}
          {isClickSheet && (
            <>
              <SectionLabel label="Alapanyag" />
              <Select
                allowClear
                showSearch
                placeholder="Válassz alapanyagot…"
                optionFilterProp="children"
                value={params.material_id ?? undefined}
                onChange={(id: number | undefined) => update({ material_id: id ?? null })}
                onClear={() => update({ material_id: null })}
                style={{ width: '100%' }}
                size="small"
              >
                {materials.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
                {materials.length === 0 && <Option disabled value={-1}>Nincs alapanyag beállítva</Option>}
              </Select>
              <SectionLabel label="Nyomtatás oldalai" />
              <Radio.Group
                value={clickSides}
                onChange={e => {
                  const v = e.target.value as 1 | 2;
                  setClickSides(v);
                  if (v !== 2) setSelectedPrintSvcId2(null);
                }}
                size="small"
                optionType="button"
                buttonStyle="solid"
                style={{ width: '100%', display: 'flex', marginBottom: 4 }}
              >
                <Radio.Button value={1} style={{ flex: 1, textAlign: 'center' }}>1 oldalas</Radio.Button>
                <Radio.Button
                  value={2}
                  disabled={(selectedProduct?.print_sides ?? 2) < 2}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  2 oldalas
                </Radio.Button>
              </Radio.Group>

              <SectionLabel label="Nyomtatás" />
              <div style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Lapok száma</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Button
                    size="small"
                    icon={<MinusOutlined />}
                    disabled={(params.sheet_count ?? 1) - sheetStep < sheetStep}
                    onClick={() => {
                      const next = (params.sheet_count ?? 1) - sheetStep;
                      if (next >= sheetStep) update({ sheet_count: next });
                    }}
                  />
                  <NumInput
                    size="small"
                    min={sheetStep}
                    max={50}
                    step={sheetStep}
                    value={params.sheet_count ?? 1}
                    onChange={v => { if (v && v >= 1) update({ sheet_count: v }); }}
                    style={{ flex: 1, textAlign: 'center' }}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={(params.sheet_count ?? 1) >= 50}
                    onClick={() => {
                      const next = (params.sheet_count ?? 1) + sheetStep;
                      if (next <= 50) update({ sheet_count: next });
                    }}
                  />
                </div>
                {sheetStep > 1 && (
                  <Text style={{ fontSize: 10, color: '#999', display: 'block', marginTop: 2 }}>
                    {sheetStep === 4 ? 'Irkatűzött: a lapszám 4 többszöröse' : 'A kiválasztott kötészeti módnál a lapszám páros'}
                  </Text>
                )}
              </div>
              {(selectedProduct?.binding_services_details?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Kötészeti mód</Text>
                  <Select
                    allowClear
                    size="small"
                    placeholder="Válassz kötészeti módot…"
                    style={{ width: '100%' }}
                    value={params.binding_mode_ids?.[0] ?? undefined}
                    onChange={(val?: number) => {
                      const det = selectedProduct?.binding_services_details?.find(b => b.id === val);
                      const code = det?.code;
                      const step = code === 'BIND_SADDLE' ? 4
                        : (code === 'BIND_SPIRAL' || code === 'BIND_PERFECT' || code === 'BIND_PADDED') ? 2 : 1;
                      const cur = params.sheet_count ?? 1;
                      const snapped = step > 1 ? Math.max(step, Math.ceil(cur / step) * step) : cur;
                      update({
                        binding_mode_ids: val != null ? [val] : [],
                        binding_mode_code: code,
                        ...(snapped !== cur ? { sheet_count: snapped } : {}),
                      });
                    }}
                    onClear={() => update({ binding_mode_ids: [], binding_mode_code: undefined })}
                    options={(selectedProduct?.binding_services_details ?? []).map(b => ({
                      label: b.name, value: b.id,
                    }))}
                  />
                </div>
              )}
              <div style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Cím oldal</Text>
                <Select
                  allowClear
                  showSearch
                  placeholder="Válassz nyomtatási szolgáltatást…"
                  optionFilterProp="children"
                  value={selectedPrintSvcId1 ?? undefined}
                  onChange={(id: number | undefined) => {
                    const v = id ?? null;
                    setSelectedPrintSvcId1(v);
                    if (v && v > 0) {
                      const svc = clickSvcOptions.find(s => s.id === v);
                      if (svc) {
                        if (svc.max_width_mm) setClickSheetW(svc.max_width_mm);
                        if (svc.max_height_mm) setClickSheetH(svc.max_height_mm);
                      }
                    }
                  }}
                  onClear={() => setSelectedPrintSvcId1(null)}
                  style={{ width: '100%' }}
                  size="small"
                >
                  <Option value={0}>Nyomatlan</Option>
                  {clickSvcOptions.map(s => (
                    <Option key={s.id} value={s.id}>
                      {s.name}
                      {s.setup_cost_selling > 0 || s.unit_cost_selling > 0
                        ? ` (ind.: ${s.setup_cost_selling.toLocaleString('hu-HU')} Ft + ${s.unit_cost_selling.toLocaleString('hu-HU')} Ft/klikk)`
                        : ''}
                    </Option>
                  ))}
                  {clickSvcOptions.length === 0 && (
                    <Option disabled value={-1}>Nincs klikkdíjas nyomtatási opció beállítva</Option>
                  )}
                </Select>
              </div>
              {clickSides === 2 && (
                <div style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Hátoldal</Text>
                  <Select
                    allowClear
                    showSearch
                    placeholder="Ua. mint Cím oldal…"
                    optionFilterProp="children"
                    value={selectedPrintSvcId2 ?? undefined}
                    onChange={(id: number | undefined) => setSelectedPrintSvcId2(id ?? null)}
                    onClear={() => setSelectedPrintSvcId2(null)}
                    style={{ width: '100%' }}
                    size="small"
                  >
                    <Option value={0}>Nyomatlan</Option>
                    {clickSvcOptions.map(s => (
                      <Option key={s.id} value={s.id}>
                        {s.name}
                        {s.setup_cost_selling > 0 || s.unit_cost_selling > 0
                          ? ` (ind.: ${s.setup_cost_selling.toLocaleString('hu-HU')} Ft + ${s.unit_cost_selling.toLocaleString('hu-HU')} Ft/klikk)`
                          : ''}
                      </Option>
                    ))}
                    {clickSvcOptions.length === 0 && (
                      <Option disabled value={-1}>Nincs klikkdíjas nyomtatási opció beállítva</Option>
                    )}
                  </Select>
                </div>
              )}


            </>
          )}

          {/* Standard nyomtatási mód – nem klikkdíjas termékekhez */}
          {!isClickSheet && (
            <>
              {(selectedProduct?.calculator_type === 'sheet_print' || selectedProduct?.calculator_type === 'roll_print') && (
                <>
                  <SectionLabel label="Alapanyag" />
                  <Select
                    allowClear
                    showSearch
                    placeholder="Válassz alapanyagot…"
                    optionFilterProp="children"
                    value={params.material_id ?? undefined}
                    onChange={(id: number | undefined) => update({ material_id: id ?? null })}
                    onClear={() => update({ material_id: null })}
                    style={{ width: '100%' }}
                    size="small"
                  >
                    {materials.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
                    {materials.length === 0 && <Option disabled value={-1}>Nincs alapanyag beállítva</Option>}
                  </Select>
                </>
              )}
              <SectionLabel label="Nyomtatási mód" />
              <Radio.Group
                value={params.sides}
                onChange={e => update({
                  sides: e.target.value,
                  side2_mode: e.target.value === '1' ? 'none' : (params.side2_mode === 'none' ? 'color' : params.side2_mode),
                  quantity_input: params.quantity_input ?? params.quantity,
                })}
                size="small"
                optionType="button"
                buttonStyle="solid"
                style={{ width: '100%', display: 'flex', marginBottom: 4 }}
              >
                <Radio.Button value="1" style={{ flex: 1, textAlign: 'center' }}>1 oldalas</Radio.Button>
                <Radio.Button value="2" style={{ flex: 1, textAlign: 'center' }}>2 oldalas</Radio.Button>
              </Radio.Group>

              <SectionLabel label="Nyomtatási szín" />
              <div style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Cím oldal</Text>
                <Select
                  value={params.side1_mode}
                  onChange={v => update({ side1_mode: v })}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {COLOR_MODE_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </div>

              {params.sides === '2' && (
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>Hátoldal</Text>
                  <Select
                    value={params.side2_mode}
                    onChange={v => update({ side2_mode: v })}
                    style={{ width: '100%' }}
                    size="small"
                  >
                    {COLOR_MODE_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                  </Select>
                </div>
              )}

              {!(selectedProduct?.calculator_type === 'sheet_print' || selectedProduct?.calculator_type === 'roll_print') && (
                <>
                  <SectionLabel label="Kötészet" />
                  <Radio.Group
                    value={params.binding}
                    onChange={e => update({ binding: e.target.value })}
                    size="small"
                    optionType="button"
                    buttonStyle="solid"
                    style={{ width: '100%', display: 'flex', marginBottom: 4 }}
                  >
                    <Radio.Button value="cut" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>Méretre vágás</Radio.Button>
                    <Radio.Button value="fold" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>Hajtogatás</Radio.Button>
                  </Radio.Group>
                </>
              )}
            </>
          )}

          {/* ── Extrák (termék sablon alapján) ─────────────────────────────── */}
          {selectedProduct && ((selectedProduct.service_groups_1 ?? []).some(g => g.length > 0) ||
                               (selectedProduct.service_groups_2 ?? []).some(g => g.length > 0)) && (
            <>
              <SectionLabel label="Utómunka" />
              {[{ side: '1' as const, groups: selectedProduct.service_groups_1 ?? [], sel: selectedServices1, setSel: setSelectedServices1 },
                { side: '2' as const, groups: selectedProduct.service_groups_2 ?? [], sel: selectedServices2, setSel: setSelectedServices2 },
              ].map(({ side, groups, sel, setSel }) => {
                const nonEmpty = groups.filter(g => g.length > 0);
                if (nonEmpty.length === 0) return null;
                return (
                  <div key={side} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>{side}. oldal:
                    </Text>
                    {nonEmpty.map((group, gIdx) => (
                      <div key={gIdx}>
                        {gIdx > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                            <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                            <Tag color="blue" style={{ margin: '0 6px', fontSize: 10, lineHeight: '16px' }}>ÉS</Tag>
                            <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                          </div>
                        )}
                        <Select
                          allowClear
                          size="small"
                          style={{ width: '100%' }}
                          placeholder="Válassz utómunkát… (VAGY)"
                          value={sel[gIdx]?.[0] ?? undefined}
                          onChange={(val: number | undefined) => setSel(prev => setGroupValue(prev, gIdx, val != null ? [val] : []))}
                        >
                          {group.map(svcId => {
                            const svc = svcById.get(svcId);
                            const costPerDb = estimateSvcCostPerDb(svc);
                            return (
                              <Option key={svcId} value={svcId}>
                                {svc?.name ?? `#${svcId}`}
                                {costPerDb != null ? ` (+${costPerDb.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft/db)` : ''}
                              </Option>
                            );
                          })}
                        </Select>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Kész termékre vonatkozó extrák ─────────────────────────────── */}
          {selectedProduct && (selectedProduct.finishing_service_groups ?? []).some(g => g.length > 0) && (
            <>
              <SectionLabel label="Kész termék extrák" />
              {(selectedProduct.finishing_service_groups ?? []).map((group, gIdx) => {
                if (group.length === 0) return null;
                return (
                  <div key={gIdx}>
                    {gIdx > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                        <Tag color="blue" style={{ margin: '0 6px', fontSize: 10, lineHeight: '16px' }}>ÉS</Tag>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                      </div>
                    )}
                    <Select
                      allowClear
                      size="small"
                      style={{ width: '100%' }}
                      placeholder="Válassz… (VAGY)"
                      value={selectedFinishingServices[gIdx]?.[0] ?? undefined}
                      onChange={(val: number | undefined) => setSelectedFinishingServices(prev => setGroupValue(prev, gIdx, val != null ? [val] : []))}
                    >
                      {group.map(svcId => {
                        const svc = svcById.get(svcId);
                        const costPerDb = estimateSvcCostPerDb(svc);
                        return (
                          <Option key={svcId} value={svcId}>
                            {svc?.name ?? `#${svcId}`}
                            {costPerDb != null ? ` (+${costPerDb.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft/db)` : ''}
                          </Option>
                        );
                      })}
                    </Select>
                  </div>
                );
              })}
            </>
          )}

          <SectionLabel label="Mennyiség" />
          <NumInput
            size="small"
            min={1}
            max={100000}
            style={{ width: '100%' }}
            value={params.quantity_input ?? params.quantity}
            addonAfter="db"
            onChange={v => {
              if (!v) return;
              update({ quantity_input: v, quantity_unit: 'db' });
            }}
          />
      </>

      {/* Price display */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ textAlign: 'center', minHeight: 56 }}>
        {calcLoading ? (
          <Spin size="small" />
        ) : isClickSheet ? (
          activeClickPricing ? (() => {
            const discounts = selectedProduct?.quantity_discounts ?? [];
            const total = activeClickPricing.total;
            const applicable = discounts.filter(d => total >= d.min_amount).sort((a, b) => b.min_amount - a.min_amount);
            const best = applicable.length > 0 ? applicable[0] : null;
            const discountAmt = best ? (best.discount_type === 'percent' ? Math.round(total * best.discount_value / 100) : best.discount_value) : 0;
            const hasDiscount = best && discountAmt > 0;
            const discountedTotal = total - discountAmt;
            const discountedUnit = discountedTotal / (activeClickPricing.quantity || 1);
            return (
              <>
                {hasDiscount ? (
                  <>
                    <Text style={{ fontSize: 11, color: '#888' }}>
                      Egységár: <span style={{ textDecoration: 'line-through' }}>{fmt(activeClickPricing.unit_price)}</span>{' '}
                      <strong style={{ color: '#52c41a' }}>{discountedUnit.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Ft/db</strong>
                    </Text>
                    <br />
                    <Title level={5} style={{ margin: '2px 0 0', textDecoration: 'line-through', color: '#999' }}>{fmt(total)}</Title>
                    <Title level={5} style={{ margin: '0', color: '#52c41a' }}>{fmt(discountedTotal)}</Title>
                    <Text style={{ fontSize: 10, color: '#52c41a' }}>−{fmt(discountAmt)} kedvezmény{best!.discount_type === 'percent' ? ` (${best!.discount_value}%)` : ''}</Text>
                    <br />
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 11, color: '#888' }}>
                      Egységár: <strong>{fmt(activeClickPricing.unit_price)}</strong>
                    </Text>
                    <br />
                    <Title level={5} style={{ margin: '2px 0 0' }}>{fmt(activeClickPricing.total)}</Title>
                  </>
                )}
                <Text style={{ fontSize: 10, color: '#aaa' }}>{activeClickPricing.quantity} db{(activeClickPricing.sheet_count ?? 1) > 1 ? ` × ${activeClickPricing.sheet_count} lap = ${activeClickPricing.total_pieces} nyomat` : ''} · {activeClickPricing.sheets_needed} ív · {activeClickPricing.clicks_total} klikk</Text>
              </>
            );
          })() : selectedPrintSvcId1 ? (
            <Text type="secondary" style={{ fontSize: 11 }}>Kalkulál…</Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>Válassz nyomtatási szolgáltatást</Text>
          )
        ) : activePricing ? (() => {
          const discounts = selectedProduct?.quantity_discounts ?? [];
          const total = activePricing.total;
          const applicable = discounts.filter(d => total >= d.min_amount).sort((a, b) => b.min_amount - a.min_amount);
          const best = applicable.length > 0 ? applicable[0] : null;
          const discountAmt = best ? (best.discount_type === 'percent' ? Math.round(total * best.discount_value / 100) : best.discount_value) : 0;
          const hasDiscount = best && discountAmt > 0;
          const discountedTotal = total - discountAmt;
          const discountedUnit = discountedTotal / (activePricing.quantity || 1);
          return (
            <>
              {hasDiscount ? (
                <>
                  <Text style={{ fontSize: 11, color: '#888' }}>
                    Egységár: <span style={{ textDecoration: 'line-through' }}>{fmt(activePricing.unit_price)}</span>{' '}
                    <strong style={{ color: '#52c41a' }}>{discountedUnit.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Ft/db</strong>
                  </Text>
                  <br />
                  <Title level={5} style={{ margin: '2px 0 0', textDecoration: 'line-through', color: '#999' }}>{fmt(total)}</Title>
                  <Title level={5} style={{ margin: '0', color: '#52c41a' }}>{fmt(discountedTotal)}</Title>
                  <Text style={{ fontSize: 10, color: '#52c41a' }}>−{fmt(discountAmt)} kedvezmény{best!.discount_type === 'percent' ? ` (${best!.discount_value}%)` : ''}</Text>
                  <br />
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 11, color: '#888' }}>
                    Egységár: <strong>{fmt(activePricing.unit_price)}</strong>
                  </Text>
                  <br />
                  <Title level={5} style={{ margin: '2px 0 0' }}>{fmt(activePricing.total)}</Title>
                </>
              )}
              <Text style={{ fontSize: 10, color: '#aaa' }}>{activePricing.quantity} db</Text>
            </>
          );
        })() : null}
      </div>

      {/* Collapsible price breakdown (admin only) */}
      {isAdmin && (isClickSheet ? activeClickPricing : activePricing) && (
        <>
          <Divider style={{ margin: '6px 0' }} />
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 0', userSelect: 'none' }}
            onClick={() => setPriceOpen(v => !v)}
          >
            {priceOpen ? <CaretDownOutlined style={{ fontSize: 10, color: '#888' }} /> : <CaretRightOutlined style={{ fontSize: 10, color: '#888' }} />}
            <Text strong style={{ fontSize: 11, color: '#888' }}>ÁR KALKULÁCIÓ</Text>
          </div>
          {priceOpen && (
            <div style={{ fontSize: 12, paddingTop: 4, paddingBottom: 8 }}>
              {isClickSheet && activeClickPricing ? (
                <>
                  {/* Kattintható impozíció sor */}
                  <div
                    onClick={() => {
                      setModalSheetW(clickSheetW);
                      setModalSheetH(clickSheetH);
                      setModalBleed(clickBleed);
                      setModalForceRotate(clickForceRotate);
                      setModalCuttingMode(cuttingMode);
                      setImpositionModalOpen(true);
                    }}
                    style={{
                      marginBottom: 4, padding: '4px 6px',
                      background: '#f6ffed', borderRadius: 4, border: '1px solid #b7eb8f',
                      cursor: 'pointer',
                    }}
                    title="Kattints az impozíció szerkesztéséhez"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AppstoreOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                      <span>Impozíció: <strong>{activeClickPricing.fit_w} × {activeClickPricing.fit_h}</strong> = <strong>{activeClickPricing.items_per_sheet} db/ív</strong>
                        {activeClickPricing.rotated && <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>forgatva</Tag>}
                      </span>
                    </div>
                    <div>Ívszám: <strong>{activeClickPricing.sheets_needed}</strong> · Klikkszám: <strong>{activeClickPricing.clicks_total}</strong> ({activeClickPricing.print_sides === 2 ? 'duplex' : 'simplex'})
                      {activeClickPricing.partial_sheet_items > 0 && (
                        <span style={{ color: '#fa8c16' }}> · Utolsó ív: {activeClickPricing.partial_sheet_items}/{activeClickPricing.items_per_sheet} ({activeClickPricing.partial_coverage_pct}%)</span>
                      )}
                      {activeClickPricing.cutting_info?.needs_cutting && (
                        <Tag color="gold" style={{ marginLeft: 6, fontSize: 10 }}>darabolás</Tag>
                      )}
                    </div>
                  </div>
                  {/* Helper: renders a list of CostItems as detail rows */}
                  {(() => {
                    const renderItems = (items: CostItem[] | undefined) => {
                      if (!items || items.length === 0) return null;
                      return items.map((ci, i) => (
                        <div key={i} style={{ paddingLeft: 12, color: '#666', fontSize: 11 }}>
                          {ci.type === 'fixed'
                            ? <span>Fix: {ci.name}: <strong>{fmt(ci.total)}</strong></span>
                            : ci.type === 'click'
                            ? <span>Ív: {ci.name}: {ci.units} ív × {Number(ci.price_per).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft = <strong>{fmt(ci.total)}</strong></span>
                            : <span>Db: {ci.name}: {ci.units} db × {Number(ci.price_per).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft = <strong>{fmt(ci.total)}</strong></span>
                          }
                        </div>
                      ));
                    };
                    return (
                      <>
                        {/* Cím oldal nyomtatás */}
                        {activeClickPricing.print_sides > 0 && (
                          <>
                            <div style={{ marginTop: 2 }}>Cím oldal – <em>{activeClickPricing.print_service_name_1 ?? '—'}</em>: <strong>{fmt(activeClickPricing.print_cost_side1)}</strong></div>
                            {renderItems(activeClickPricing.print_service_items_1)}
                          </>
                        )}
                        {/* Hátoldal */}
                        {activeClickPricing.print_sides === 2 && (
                          <>
                            <div style={{ marginTop: 2 }}>Hátoldal – <em>{activeClickPricing.print_service_name_2 ?? activeClickPricing.print_service_name_1 ?? '—'}</em>: <strong>{fmt(activeClickPricing.print_cost_side2)}</strong></div>
                            {renderItems(activeClickPricing.print_service_items_2)}
                          </>
                        )}
                        {/* Alapanyag */}
                        {activeClickPricing.material_cost > 0 && (
                          <>
                            <div style={{ marginTop: 2 }}>Alapanyag – <em>{activeClickPricing.material_name ?? '—'}</em>: <strong>{fmt(activeClickPricing.material_cost)}</strong></div>
                            {renderItems(activeClickPricing.material_items)}
                          </>
                        )}
                        {/* Extrák – kategória szerint csoportosítva */}
                        {activeClickPricing.service_breakdown.length > 0 && (
                          <>
                            <div style={{ marginTop: 2 }}>Extrák: <strong>{fmt(activeClickPricing.service_cost)}</strong></div>
                            {(['required', 'side', 'finishing'] as const).map(cat => {
                              const items = activeClickPricing.service_breakdown.filter(sb => (sb.category ?? 'side') === cat);
                              if (items.length === 0) return null;
                              const catLabel = cat === 'required' ? 'Kötelező' : cat === 'finishing' ? 'Kész termék' : 'Oldalankénti';
                              return (
                                <div key={cat}>
                                  <div style={{ paddingLeft: 4, fontSize: 11, color: '#999', marginTop: 4 }}>{catLabel}:</div>
                                  {items.map(sb => (
                                    <div key={sb.id}>
                                      <div style={{ paddingLeft: 12, color: '#555' }}>{sb.name}: <strong>{fmt(sb.total)}</strong></div>
                                      {renderItems(sb.items)}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })()}
                  <Divider style={{ margin: '4px 0' }} />
                  <div style={{ fontWeight: 600 }}>Összesen: {fmt(activeClickPricing.total)}</div>
                  <div>Egységár: {activeClickPricing.unit_price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
                  {(() => {
                    const discounts = selectedProduct?.quantity_discounts ?? [];
                    if (discounts.length === 0) return null;
                    const total = activeClickPricing.total;
                    const applicable = discounts
                      .filter(d => total >= d.min_amount)
                      .sort((a, b) => b.min_amount - a.min_amount);
                    if (applicable.length === 0) return null;
                    const best = applicable[0];
                    const discountAmt = best.discount_type === 'percent'
                      ? Math.round(total * best.discount_value / 100)
                      : best.discount_value;
                    const discountedTotal = total - discountAmt;
                    const discountedUnit = discountedTotal / (activeClickPricing.quantity || 1);
                    return (
                      <>
                        <Divider style={{ margin: '4px 0' }} />
                        <div style={{ color: '#52c41a' }}>
                          Kedvezmény: <strong>−{fmt(discountAmt)}</strong>
                          {best.discount_type === 'percent' && <span> ({best.discount_value}%)</span>}
                        </div>
                        <div style={{ fontWeight: 600, color: '#52c41a' }}>Kedvezményes ár: {fmt(discountedTotal)}</div>
                        <div style={{ color: '#52c41a' }}>Egységár: {discountedUnit.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
                      </>
                    );
                  })()}
                </>
              ) : activePricing ? (
                <>
                  <div>Papír: <strong>{fmt(activePricing.paper_cost)}</strong></div>
                  <div>Nyomtatás 1.o: <strong>{fmt(activePricing.print_cost_side1)}</strong></div>
                  {activePricing.print_cost_side2 > 0 && (
                    <div>Nyomtatás 2.o: <strong>{fmt(activePricing.print_cost_side2)}</strong></div>
                  )}
                  <div>Kötészet: <strong>{fmt(activePricing.finishing_cost)}</strong></div>
                  {(activePricing.service_breakdown ?? []).length > 0 && (
                    <>
                      {(activePricing.service_breakdown ?? []).map(sb => (
                        <div key={sb.id} style={{ paddingLeft: 8, color: '#555' }}>
                          {sb.name}: <strong>{fmt(sb.total)}</strong>
                          {sb.setup_cost > 0 && <span style={{ fontSize: 10, color: '#aaa' }}> (beáll.: {fmt(sb.setup_cost)})</span>}
                        </div>
                      ))}
                      <div>Extrák: <strong>{fmt(activePricing.service_cost ?? 0)}</strong></div>
                    </>
                  )}
                  <Divider style={{ margin: '4px 0' }} />
                  <div style={{ fontWeight: 600 }}>Összesen: {fmt(activePricing.total)}</div>
                  <div>Egységár: {activePricing.unit_price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
                  {(() => {
                    const discounts = selectedProduct?.quantity_discounts ?? [];
                    if (discounts.length === 0) return null;
                    const total = activePricing.total;
                    const applicable = discounts
                      .filter(d => total >= d.min_amount)
                      .sort((a, b) => b.min_amount - a.min_amount);
                    if (applicable.length === 0) return null;
                    const best = applicable[0];
                    const discountAmt = best.discount_type === 'percent'
                      ? Math.round(total * best.discount_value / 100)
                      : best.discount_value;
                    const discountedTotal = total - discountAmt;
                    const discountedUnit = discountedTotal / (activePricing.quantity || 1);
                    return (
                      <>
                        <Divider style={{ margin: '4px 0' }} />
                        <div style={{ color: '#52c41a' }}>
                          Kedvezmény: <strong>−{fmt(discountAmt)}</strong>
                          {best.discount_type === 'percent' && <span> ({best.discount_value}%)</span>}
                        </div>
                        <div style={{ fontWeight: 600, color: '#52c41a' }}>Kedvezményes ár: {fmt(discountedTotal)}</div>
                        <div style={{ color: '#52c41a' }}>Egységár: {discountedUnit.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
                      </>
                    );
                  })()}
                </>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>

      {/* ── Impozíció modal ───────────────────────────────────────────────── */}
      <Modal
        title={<span><AppstoreOutlined style={{ marginRight: 8 }} />Impozíció – Produkciózás</span>}
        open={impositionModalOpen}
        onCancel={() => setImpositionModalOpen(false)}
        onOk={() => {
          setClickSheetW(modalSheetW);
          setClickSheetH(modalSheetH);
          setClickBleed(modalBleed);
          setClickForceRotate(modalForceRotate);
          setCuttingMode(modalCuttingMode);
          setImpositionModalOpen(false);
        }}
        okText="Alkalmaz"
        cancelText="Mégse"
        width={540}
      >
        {(() => {
          const bleed = modalBleed ?? 0;
          const pw = Number(params.width_mm) + 2 * bleed;
          const ph = Number(params.height_mm) + 2 * bleed;
          const sw = modalSheetW;
          const sh = modalSheetH;
          const fitNormal  = Math.floor(sw / pw) * Math.floor(sh / ph);
          const fitRotated = Math.floor(sw / ph) * Math.floor(sh / pw);
          const autoRotated = fitRotated > fitNormal;
          const rotated = modalForceRotate === 'rotated' ? true
                        : modalForceRotate === 'normal'  ? false
                        : autoRotated;
          const itemsW = rotated ? Math.floor(sw / ph) : Math.floor(sw / pw);
          const itemsH = rotated ? Math.floor(sh / pw) : Math.floor(sh / ph);
          const bestFit = itemsW * itemsH;
          const cols = bestFit > 0 ? itemsW : 0;
          const rows = bestFit > 0 ? itemsH : 0;
          const totalPieces = params.quantity * (params.sheet_count ?? 1);
          const sheetsNeeded = bestFit > 0 ? Math.ceil(totalPieces / bestFit) : 0;
          const clicks = sheetsNeeded * clickSides;
          return (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Ívméret (mm)</Text>
                  <Row gutter={8}>
                    <Col span={12}>
                      <NumInput
                        style={{ width: '100%' }} placeholder="Szélesség" min={1}
                        value={modalSheetW} onChange={v => setModalSheetW(v ?? 330)} addonAfter="mm"
                      />
                    </Col>
                    <Col span={12}>
                      <NumInput
                        style={{ width: '100%' }} placeholder="Magasság" min={1}
                        value={modalSheetH} onChange={v => setModalSheetH(v ?? 487)} addonAfter="mm"
                      />
                    </Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Termékméret (mm)</Text>
                  <div style={{ padding: '7px 11px', background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13 }}>
                    {params.width_mm} × {params.height_mm} mm
                  </div>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Nyomdai ráhagyás (mm/oldal)</Text>
                  <NumInput
                    style={{ width: '100%' }} min={0} value={modalBleed}
                    onChange={v => setModalBleed(v ?? 0)} addonAfter="mm"
                  />
                </Col>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Termék elforgatása</Text>
                  <Radio.Group
                    value={modalForceRotate}
                    onChange={e => setModalForceRotate(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    style={{ width: '100%', display: 'flex' }}
                  >
                    <Radio.Button value="auto" style={{ flex: 1, textAlign: 'center' }}>Auto</Radio.Button>
                    <Radio.Button value="normal" style={{ flex: 1, textAlign: 'center' }}>0°</Radio.Button>
                    <Radio.Button value="rotated" style={{ flex: 1, textAlign: 'center' }}>90°</Radio.Button>
                  </Radio.Group>
                  {modalForceRotate === 'auto' && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Automatikus: {autoRotated ? 'forgatva' : 'normál'}</div>
                  )}
                </Col>
              </Row>

              {bestFit > 0 ? (
                <>
                  {/* Vizuális rácspreview */}
                  <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', border: '2px solid #1677ff', padding: 4, background: '#fff' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
                        {Array.from({ length: cols * rows }).map((_, i) => (
                          <div
                            key={i}
                            style={{
                              width: 28,
                              height: Math.round(28 * (rotated ? pw / ph : ph / pw)),
                              background: i < bestFit ? '#bae0ff' : '#f0f0f0',
                              border: '1px solid #91caff',
                              borderRadius: 2,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, color: '#0958d9',
                            }}
                          >
                            {i < bestFit ? i + 1 : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                      {rotated ? 'Elforgatva elhelyezve' : 'Normál elhelyezés'} · {cols} × {rows} elrendezés
                    </div>
                  </div>

                  {/* Eredmények */}
                  <Row gutter={12}>
                    <Col span={8} style={{ textAlign: 'center', background: '#f6ffed', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>{bestFit}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>db / ív</div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'center', background: '#e6f4ff', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{sheetsNeeded}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>ív ({totalPieces} nyomat)</div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'center', background: '#fff7e6', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#fa8c16' }}>{clicks}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>klikk ({clickSides} oldal)</div>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 12, fontSize: 11, color: '#8c8c8c' }}>
                    Termék (+ráhagyás): {pw.toFixed(1)} × {ph.toFixed(1)} mm · Ív: {modalSheetW} × {modalSheetH} mm{bleed > 0 ? ` · ${bleed} mm ráhagyás` : ''}
                  </div>

                  {/* ── Produkciós ívek vizualizáció ─────────────────── */}
                  {(() => {
                    const remainingOnLast = totalPieces % bestFit;
                    const fullSheets = remainingOnLast === 0 ? sheetsNeeded : sheetsNeeded - 1;
                    const partialItems = remainingOnLast;
                    const partialPct = partialItems > 0 ? Math.round(partialItems / bestFit * 100) : 0;
                    const wasteItems = sheetsNeeded * bestFit - totalPieces;

                    const cellW = rotated ? ph : pw;
                    const cellH = rotated ? pw : ph;
                    const scale = Math.min(180 / sw, 100 / sh, 1);
                    const svgW = Math.round(sw * scale);
                    const svgH = Math.round(sh * scale);

                    const renderSheet = (idx: number, itemsOnThis: number, label: string) => {
                      const isFull = itemsOnThis === bestFit;
                      return (
                        <div key={idx} style={{ display: 'inline-block', margin: '0 4px 8px 0', textAlign: 'center' }}>
                          <div style={{
                            border: `2px solid ${isFull ? '#91caff' : '#ffc069'}`,
                            borderRadius: 3, background: '#fff', display: 'inline-block', overflow: 'hidden',
                          }}>
                            <svg width={svgW} height={svgH} viewBox={`0 0 ${sw} ${sh}`}>
                              <rect x={0} y={0} width={sw} height={sh} fill="#fafafa" />
                              {Array.from({ length: cols * rows }).map((_, ci) => {
                                const col = ci % cols;
                                const row = Math.floor(ci / cols);
                                const x = col * cellW;
                                const y = row * cellH;
                                const filled = ci < itemsOnThis;
                                return (
                                  <rect key={ci} x={x} y={y} width={cellW - 0.5} height={cellH - 0.5}
                                    fill={filled ? '#bae0ff' : '#f5f5f5'} stroke={filled ? '#69b1ff' : '#d9d9d9'} strokeWidth={0.5}
                                  />
                                );
                              })}
                            </svg>
                          </div>
                          <div style={{ fontSize: 9, color: isFull ? '#1677ff' : '#fa8c16', marginTop: 2 }}>{label}</div>
                        </div>
                      );
                    };

                    return (
                      <div style={{ marginTop: 16, padding: '12px', background: '#f9f9f9', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Produkciós ívek</Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {fullSheets > 0 && (
                            <div style={{ display: 'inline-block', margin: '0 4px 8px 0', textAlign: 'center' }}>
                              {renderSheet(0, bestFit, `${bestFit} db`)}
                              {fullSheets > 1 && (
                                <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 600, marginTop: -4 }}>×{fullSheets}</div>
                              )}
                            </div>
                          )}
                          {partialItems > 0 && renderSheet(sheetsNeeded - 1, partialItems,
                            `${partialItems}/${bestFit} db (${partialPct}%)`
                          )}
                        </div>
                        {wasteItems > 0 && (
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                            Kihasználatlan: {wasteItems} pozíció az utolsó íven
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Darabolás módja ────────────────────────────── */}
                  {(() => {
                    const mat = materials.find(m => m.id === params.material_id);
                    const hasDims = mat?.width_mm && mat?.length_mm;
                    const svc = clickSvcOptions.find(s => s.id === selectedPrintSvcId1);
                    const exceeds = hasDims && svc?.max_width_mm && svc?.max_height_mm && (mat!.width_mm! > svc.max_width_mm || mat!.length_mm! > svc.max_height_mm);
                    if (!hasDims) return null;

                    return (
                      <div style={{ marginTop: 12, padding: '12px', background: exceeds ? '#fffbe6' : '#f6ffed', borderRadius: 8, border: `1px solid ${exceeds ? '#ffe58f' : '#b7eb8f'}` }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Alapanyag</Text>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          Méret: <strong>{mat!.width_mm} × {mat!.length_mm} mm</strong>
                          {svc?.max_width_mm && svc?.max_height_mm && (
                            <span style={{ color: '#888' }}> · Nyomtató max: {svc.max_width_mm} × {svc.max_height_mm} mm</span>
                          )}
                        </div>
                        {exceeds ? (
                          <>
                            <div style={{ fontSize: 11, color: '#d48806', fontWeight: 600, marginBottom: 6 }}>Az alapanyag nagyobb mint a nyomtató maximum — darabolás szükséges</div>
                            {activeClickPricing?.cutting_info && (
                              <div style={{ fontSize: 11, marginBottom: 6, lineHeight: 1.8 }}>
                                Eredeti ív ({activeClickPricing.cutting_info.material_size_mm?.[0]} × {activeClickPricing.cutting_info.material_size_mm?.[1]} mm): <strong>{activeClickPricing.cutting_info.raw_material_sheets_needed} db</strong>
                                <br />
                                Vágott ív ({activeClickPricing.cutting_info.cut_sheet_size_mm[0]} × {activeClickPricing.cutting_info.cut_sheet_size_mm[1]} mm): <strong>{activeClickPricing.cutting_info.total_cut_sheets} db</strong>
                                <span style={{ color: '#888' }}> · ({activeClickPricing.cutting_info.cut_sheets_per_material} vágott ív / eredeti ív)</span>
                              </div>
                            )}
                            <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Darabolás módja</Text>
                            <Radio.Group
                              value={modalCuttingMode}
                              onChange={e => setModalCuttingMode(e.target.value)}
                              size="small"
                              optionType="button"
                              buttonStyle="solid"
                              style={{ width: '100%', display: 'flex' }}
                            >
                              <Radio.Button value="auto" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                                <Tooltip title="A legköltséghatékonyabb módot választja">Auto</Tooltip>
                              </Radio.Button>
                              <Radio.Button value="material" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                                <Tooltip title="A legkevesebb alapanyag felhasználást részesíti előnyben">Alapanyag</Tooltip>
                              </Radio.Button>
                              <Radio.Button value="print" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                                <Tooltip title="A legkevesebb nyomtatást részesíti előnyben">Nyomtatás</Tooltip>
                              </Radio.Button>
                            </Radio.Group>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: '#52c41a' }}>
                            Nem szükséges darabolás
                            {activeClickPricing?.cutting_info && (
                              <span> · Szükséges ívek: <strong>{activeClickPricing.cutting_info.raw_material_sheets_needed} db</strong></span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Méret összehasonlítás ───────────────────────── */}
                  {activeClickPricing?.size_comparison && activeClickPricing.size_comparison.length > 1 && (
                    <div style={{ marginTop: 12, padding: '12px', background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff' }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Rendelhető méretek összehasonlítása</Text>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #d6e4ff', color: '#666' }}>
                            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Méret</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ív méret</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px' }}>db/ív</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ívek</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ár/ív</th>
                            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Anyagköltség</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeClickPricing.size_comparison.map((sc, i) => (
                            <tr key={i} style={{
                              background: sc.is_best ? '#f6ffed' : 'transparent',
                              fontWeight: sc.is_best ? 600 : 400,
                              borderBottom: '1px solid #f0f0f0',
                            }}>
                              <td style={{ padding: '4px 6px' }}>
                                {sc.label}
                                {sc.is_default && <Tag color="blue" style={{ marginLeft: 4, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>alap</Tag>}
                                {sc.is_best && <Tag color="green" style={{ marginLeft: 4, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>legjobb</Tag>}
                              </td>
                              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{sc.size_mm[0]}×{sc.size_mm[1]}</td>
                              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{sc.items_per_sheet}</td>
                              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{sc.sheets_needed}{sc.needs_cutting && ' ✂'}</td>
                              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{sc.price_per_sheet.toLocaleString('hu-HU')} Ft</td>
                              <td style={{ textAlign: 'right', padding: '4px 6px', color: sc.is_best ? '#52c41a' : undefined }}>
                                {sc.material_cost.toLocaleString('hu-HU')} Ft
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '32px 0' }}>
                  A megadott ívméreten nem fér el a termék. Adj meg nagyobb ívméretet vagy csökkentsd a ráhagyást.
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </>
  );
};

export default PrintParamsPanel;
