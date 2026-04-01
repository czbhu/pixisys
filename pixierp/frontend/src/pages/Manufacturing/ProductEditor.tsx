import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Modal, Form, Input, Select, InputNumber,
  message, Tag, Popconfirm, Tooltip, Drawer, Row, Col, Divider,
  Switch, Empty, Typography, Checkbox, Collapse,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MinusCircleOutlined, CopyOutlined,
  CalculatorOutlined, TagsOutlined, AppstoreOutlined, SyncOutlined, PrinterOutlined,
  LockOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ── Types ────────────────────────────────────────────────────────────────────

interface SizeRow {
  id?: number;
  label: string;
  width: number | null;   // display unit
  height: number | null;  // display unit
  unit: 'mm' | 'cm' | 'm';
  sort_order: number;
}

interface ResourceItem {
  id: number;
  name: string;
  code: string;
}

interface MaterialGroup {
  id: number;
  name: string;
}

interface QuantityDiscount {
  _key: number;
  id?: number;
  min_amount: number | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number | null;
}

interface ProductTemplate {
  id: number;
  name: string;
  code: string | null;
  description: string;
  category: number | null;
  category_name: string | null;
  calculator_type: string;
  default_material_markup_percentage: number;
  default_service_markup_percentage: number;
  allowed_materials: number[];
  allowed_materials_details: ResourceItem[];
  allowed_material_groups: number[];
  allowed_material_groups_details: MaterialGroup[];
  allowed_services: number[];
  allowed_services_details: ResourceItem[];
  required_services: number[];
  required_services_details: ResourceItem[];
  finishing_services: number[];
  finishing_services_details: ResourceItem[];
  finishing_service_groups: number[][];
  service_groups_1: number[][];
  service_groups_2: number[][];
  print_sides: 1 | 2;
  print_service: number | null;
  print_service_options: number[];
  print_service_options_details: { id: number; name: string; code: string; setup_cost_selling: number; unit_cost_selling: number; max_width_mm: number | null; max_height_mm: number | null }[];
  print_service_options_order: number[];
  fix_cost_first_side_only: boolean;
  multi_sheet_enabled: boolean;
  custom_size_enabled: boolean;
  custom_size_unit: string;
  custom_size_width_min: number | null;
  custom_size_width_max: number | null;
  custom_size_height_min: number | null;
  custom_size_height_max: number | null;
  sizes: any[];
  quantity_discounts: { id: number; min_amount: number; discount_type: string; discount_value: number }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductClass {
  id: number;
  name: string;
  parent?: number | null;
  parent_name?: string | null;
}

interface MaterialItem extends ResourceItem {}
interface ServiceItem extends ResourceItem {}

const CALCULATOR_TYPES = [
  {
    label: 'Általános',
    value: 'generic',
    tooltip: 'Egyszerű, egységár alapú kalkuláció. Fix ár darabonként vagy munkánként, optimalizálás nélkül.',
  },
  {
    label: 'Íves/Táblás optimalizálás',
    value: 'sheet_print',
    tooltip: 'Előre meghatározott ívméretekből optimalizálja az elrendezést. Papír és nyomtatási költség ív alapon, utómunkák (vágás, fóliázás) ívszám szerint számolódnak.',
  },
  {
    label: 'Tekercses kalkuláció',
    value: 'roll_print',
    tooltip: 'Tekercses nyomtatóhoz. A hossz (folyóméter) alapján számol; a szélességet a tekercs szélessége rögzíti.',
  },
  {
    label: 'Klikkdíjas íves nyomtatás',
    value: 'click_sheet_print',
    tooltip: 'Klikkdíjas gépeknél (pl. Konica Minolta) alkalmazható. A nyomtatási díj: beállítási díj + ívszám × oldalszám × klikk díj. Impozíció alapján számítja a szükséges ívszámot.',
  },
];

const UNITS = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
  { label: 'm',  value: 'm'  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const toMm = (v: number | null, unit: string): number | null => {
  if (v == null) return null;
  if (unit === 'cm') return v * 10;
  if (unit === 'm')  return v * 1000;
  return v;
};

const fromMm = (v: number | null, unit: string): number | null => {
  if (v == null) return null;
  if (unit === 'cm') return v / 10;
  if (unit === 'm')  return v / 1000;
  return v;
};

const emptySizeRow = (order = 0): SizeRow => ({
  label: '', width: null, height: null, unit: 'mm', sort_order: order,
});

// ── Main component ───────────────────────────────────────────────────────────

const ProductEditor: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts]             = useState<ProductTemplate[]>([]);
  const [categories, setCategories]         = useState<ProductClass[]>([]);
  const [materials, setMaterials]           = useState<MaterialItem[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [services, setServices]             = useState<ServiceItem[]>([]);
  const [loading, setLoading]               = useState(false);

  // DIGIPR_K and DIGIPR_CMYK are protected click-pricing services — cannot be removed
  const digiprIds = useMemo(
    () => new Set(services.filter(s => s.code === 'DIGIPR_K' || s.code === 'DIGIPR_CMYK').map(s => s.id)),
    [services]
  );
  const [query, setQuery]                   = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<ProductTemplate | null>(null);
  const [saving, setSaving]             = useState(false);

  // Form state
  const [form] = Form.useForm();
  const [sizes, setSizes]                             = useState<SizeRow[]>([emptySizeRow(0)]);
  const [selectedMaterials, setSelectedMaterials]     = useState<number[]>([]);
  const [selectedMaterialGroups, setSelectedMaterialGroups] = useState<number[]>([]);
  const [serviceGroups1, setServiceGroups1]           = useState<number[][]>([[]]);
  const [serviceGroups2, setServiceGroups2]           = useState<number[][]>([[]])
  const [selectedPrintServiceOptions, setSelectedPrintServiceOptions] = useState<number[]>([]);
  const [requiredServices, setRequiredServices]       = useState<number[]>([]);
  const [finishingServiceGroups, setFinishingServiceGroups] = useState<number[][]>([[]]);
  const [quantityDiscounts, setQuantityDiscounts]     = useState<QuantityDiscount[]>([]);

  // Produkciózás (imposition) modal
  const [impositionOpen, setImpositionOpen]   = useState(false);
  const [impSheetW, setImpSheetW]             = useState<number | null>(null);
  const [impSheetH, setImpSheetH]             = useState<number | null>(null);
  const [impProductW, setImpProductW]         = useState<number | null>(null);
  const [impProductH, setImpProductH]         = useState<number | null>(null);
  const [impQty, setImpQty]                   = useState<number>(100);
  const [impBleed, setImpBleed]               = useState<number>(3);

  // Detail / preview drawer
  const [detailOpen, setDetailOpen]     = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductTemplate | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, matRes, matGrpRes, svcRes] = await Promise.all([
        api.get('/manufacturing/product-templates/'),
        api.get('/manufacturing/product-classes/?page_size=1000'),
        api.get('/warehouse/materials/?page_size=1000'),
        api.get('/warehouse/material-groups/?page_size=1000'),
        api.get('/manufacturing/services/?page_size=1000'),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data.results ?? []));
      setCategories(Array.isArray(catRes.data) ? catRes.data : (catRes.data.results ?? []));
      setMaterials(Array.isArray(matRes.data) ? matRes.data : (matRes.data.results ?? []));
      setMaterialGroups(Array.isArray(matGrpRes.data) ? matGrpRes.data : (matGrpRes.data.results ?? []));
      setServices(Array.isArray(svcRes.data) ? svcRes.data : (svcRes.data.results ?? []));
    } catch {
      message.error('Hiba az adatok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const { categoryPathMap, sortedCategories } = useMemo(() => {
    const byId = new Map<number, ProductClass>(categories.map(c => [c.id, c]));
    const depthMemo = new Map<number, number>();

    const getDepth = (id: number, seen = new Set<number>()): number => {
      const cached = depthMemo.get(id);
      if (cached !== undefined) return cached;
      const current = byId.get(id);
      if (!current || current.parent == null || seen.has(id)) { depthMemo.set(id, 0); return 0; }
      const nextSeen = new Set(seen);
      nextSeen.add(id);
      const depth = 1 + getDepth(current.parent, nextSeen);
      depthMemo.set(id, depth);
      return depth;
    };

    const pathMap = new Map<number, string>();
    categories.forEach(c => {
      const depth = getDepth(c.id);
      const prefix = depth === 0 ? '' : '\u00A0\u00A0'.repeat(depth) + '\u2514\u2500 ';
      pathMap.set(c.id, `${prefix}${c.name}`);
    });

    // Build children map
    const childrenOf = new Map<number | null, ProductClass[]>();
    categories.forEach(c => {
      const parentKey = c.parent ?? null;
      if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
      childrenOf.get(parentKey)!.push(c);
    });
    // Sort each level by name
    childrenOf.forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name, 'hu')));

    // Depth-first traversal
    const ordered: ProductClass[] = [];
    const visit = (parentKey: number | null) => {
      const children = childrenOf.get(parentKey) ?? [];
      children.forEach(c => { ordered.push(c); visit(c.id); });
    };
    visit(null);

    return { categoryPathMap: pathMap, sortedCategories: ordered };
  }, [categories]);

  // ── Drawer open/close ───────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      calculator_type: 'generic',
      default_material_markup_percentage: 30,
      default_service_markup_percentage: 35,
      custom_size_enabled: false,
      custom_size_unit: 'mm',
      fix_cost_first_side_only: false,
    });
    setSizes([emptySizeRow(0)]);
    setSelectedMaterials([]);
    setSelectedMaterialGroups([]);
    setSelectedPrintServiceOptions([]);
    setRequiredServices([]);
    setFinishingServiceGroups([[]]);
    setServiceGroups1([[]]);
    setServiceGroups2([[]]);
    setQuantityDiscounts([]);
    setDrawerOpen(true);
  };

  const openImpositionModal = () => {
    // Pre-fill sheet size from print_service or leave empty
    // Pre-fill product size from first valid size
    const firstSize = sizes.find(s => s.width != null && s.height != null);
    if (firstSize) {
      setImpProductW(toMm(firstSize.width, firstSize.unit));
      setImpProductH(toMm(firstSize.height, firstSize.unit));
    }
    // Sheet size: try to get from print_service's max dimensions via services list
    // (user can also enter manually in the modal)
    setImpositionOpen(true);
  };

  const openEdit = (p: ProductTemplate) => {
    setEditing(p);
    const cu = (p.custom_size_unit || 'mm') as 'mm' | 'cm' | 'm';
    form.setFieldsValue({
      name: p.name,
      code: p.code ?? undefined,
      description: p.description,
      category: p.category ?? undefined,
      is_active: p.is_active,
      calculator_type: p.calculator_type || 'generic',
      print_sides: p.print_sides ?? 1,
      print_service: p.print_service ?? undefined,
      default_material_markup_percentage: Number(p.default_material_markup_percentage ?? 30),
      default_service_markup_percentage: Number(p.default_service_markup_percentage ?? 35),
      custom_size_enabled: p.custom_size_enabled ?? false,
      fix_cost_first_side_only: p.fix_cost_first_side_only ?? false,
      multi_sheet_enabled: p.multi_sheet_enabled ?? false,
      custom_size_unit: cu,
      custom_size_width_min:  fromMm(p.custom_size_width_min  != null ? Number(p.custom_size_width_min)  : null, cu),
      custom_size_width_max:  fromMm(p.custom_size_width_max  != null ? Number(p.custom_size_width_max)  : null, cu),
      custom_size_height_min: fromMm(p.custom_size_height_min != null ? Number(p.custom_size_height_min) : null, cu),
      custom_size_height_max: fromMm(p.custom_size_height_max != null ? Number(p.custom_size_height_max) : null, cu),
    });
    setSelectedPrintServiceOptions(() => {
      const order = p.print_service_options_order ?? [];
      const ids = p.print_service_options ?? [];
      if (order.length > 0) {
        const idSet = new Set(ids);
        const ordered = order.filter(id => idSet.has(id));
        ids.forEach(id => { if (!ordered.includes(id)) ordered.push(id); });
        return ordered;
      }
      return ids;
    });
    setSizes(p.sizes.length > 0
      ? p.sizes.map((s: any) => {
          const unit = (s.unit as 'mm' | 'cm' | 'm') || 'mm';
          return {
            id: s.id,
            label: s.label,
            unit,
            width:  fromMm(s.width_mm  != null ? Number(s.width_mm)  : null, unit),
            height: fromMm(s.height_mm != null ? Number(s.height_mm) : null, unit),
            sort_order: s.sort_order,
          };
        })
      : [emptySizeRow(0)]);
    setSelectedMaterials(p.allowed_materials ?? []);
    setSelectedMaterialGroups(p.allowed_material_groups ?? []);
    setRequiredServices(p.required_services ?? []);
    setFinishingServiceGroups(p.finishing_service_groups?.length ? p.finishing_service_groups : [[]]);
    setServiceGroups1(p.service_groups_1?.length ? p.service_groups_1 : [[]]);
    setServiceGroups2(p.service_groups_2?.length ? p.service_groups_2 : [[]]);
    setQuantityDiscounts((p.quantity_discounts ?? []).map(d => ({
      _key: d.id,
      id: d.id,
      min_amount: d.min_amount,
      discount_type: d.discount_type as 'percent' | 'fixed',
      discount_value: Number(d.discount_value),
    })));
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const openInPrintEditor = (p: ProductTemplate) => {
    const firstSize = p.sizes.find(s => s.width_mm != null && s.height_mm != null);
    const editorParams = {
      product_name: p.name,
      width_mm: firstSize?.width_mm ?? 148,
      height_mm: firstSize?.height_mm ?? 210,
      quantity: 100,
      sides: '1',
      side1_mode: 'color',
      side2_mode: 'none',
      binding: 'cut',
      folding_count: 0,
      folding_specs: [],
      material_id: null,
      multi_sheet_enabled: p.multi_sheet_enabled ?? false,
      sheet_count: 1,
    };
    try {
      const existing = localStorage.getItem('pixierp_editor_state');
      const prev = existing ? JSON.parse(existing) : {};
      localStorage.setItem('pixierp_editor_state', JSON.stringify({ ...prev, params: editorParams, preload_product_id: p.id }));
    } catch {}
    setDetailOpen(false);
    window.open('/print-editor/sheet', '_blank');
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    try {
      await form.validateFields();
    } catch { return; }

    const values = form.getFieldsValue();
    const validSizes = sizes.filter(s => s.width != null && s.height != null);
    const cu = (form.getFieldValue('custom_size_unit') || 'mm') as string;

    const payload = {
      name: values.name,
      code: values.code || null,
      description: values.description ?? '',
      category: values.category ?? null,
      is_active: values.is_active ?? true,
      calculator_type: values.calculator_type ?? 'generic',
      print_sides: values.print_sides ?? 1,
      print_service: values.print_service ?? null,
      print_service_options: selectedPrintServiceOptions,
      print_service_options_order: selectedPrintServiceOptions,
      fix_cost_first_side_only: values.fix_cost_first_side_only ?? false,
      multi_sheet_enabled: values.multi_sheet_enabled ?? false,
      default_material_markup_percentage: values.default_material_markup_percentage ?? 30,
      default_service_markup_percentage: values.default_service_markup_percentage ?? 35,
      allowed_materials: selectedMaterials,
      allowed_material_groups: selectedMaterialGroups,
      required_services: requiredServices,
      finishing_service_groups: finishingServiceGroups,
      service_groups_1: serviceGroups1,
      service_groups_2: serviceGroups2,
      quantity_discounts: quantityDiscounts
        .filter(d => d.min_amount != null && d.discount_value != null)
        .map(d => ({
          id: d.id,
          min_amount: d.min_amount,
          discount_type: d.discount_type,
          discount_value: d.discount_value,
        })),
      custom_size_enabled: values.custom_size_enabled ?? false,
      custom_size_unit: cu,
      custom_size_width_min:  toMm(values.custom_size_width_min  ?? null, cu),
      custom_size_width_max:  toMm(values.custom_size_width_max  ?? null, cu),
      custom_size_height_min: toMm(values.custom_size_height_min ?? null, cu),
      custom_size_height_max: toMm(values.custom_size_height_max ?? null, cu),
      sizes: validSizes.map((s, i) => ({
        id: s.id,
        label: s.label,
        unit: s.unit,
        width_mm:  toMm(s.width,  s.unit),
        height_mm: toMm(s.height, s.unit),
        width_max_mm: null,
        height_max_mm: null,
        sort_order: i,
      })),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/manufacturing/product-templates/${editing.id}/`, payload);
        message.success('Termék frissítve');
      } else {
        await api.post('/manufacturing/product-templates/', payload);
        message.success('Termék létrehozva');
      }
      closeDrawer();
      loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  // ── Duplicate ────────────────────────────────────────────────────────────────

  const handleDuplicate = (p: ProductTemplate) => {
    openEdit(p);
    // Reset to "new" mode: clear editing, change name
    setTimeout(() => {
      setEditing(null);
      form.setFieldsValue({ name: `${p.name} (másolat)`, code: undefined });
    }, 0);
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/product-templates/${id}/`);
      message.success('Termék törölve');
      loadAll();
    } catch {
      message.error('Törlési hiba');
    }
  };

  // ── Size row helpers ─────────────────────────────────────────────────────────

  const addSize = () => setSizes(prev => [...prev, emptySizeRow(prev.length)]);

  const removeSize = (idx: number) =>
    setSizes(prev => prev.filter((_, i) => i !== idx));

  const updateSize = (idx: number, field: 'label' | 'width' | 'height', value: any) =>
    setSizes(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      if (field === 'width' || field === 'height') {
        const prevAuto = (s.width && s.height) ? `${s.width}×${s.height} ${s.unit}` : '';
        if (!s.label || s.label === prevAuto) {
          const w = field === 'width'  ? value : s.width;
          const h = field === 'height' ? value : s.height;
          updated.label = (w && h) ? `${w}×${h} ${s.unit}` : '';
        }
      }
      return updated;
    }));

  const updateSizeUnit = (idx: number, newUnit: 'mm' | 'cm' | 'm') =>
    setSizes(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const newW = fromMm(toMm(s.width, s.unit), newUnit);
      const newH = fromMm(toMm(s.height, s.unit), newUnit);
      const prevAuto = (s.width && s.height) ? `${s.width}×${s.height} ${s.unit}` : '';
      const newLabel = (!s.label || s.label === prevAuto)
        ? ((newW && newH) ? `${newW}×${newH} ${newUnit}` : '')
        : s.label;
      return { ...s, unit: newUnit, width: newW, height: newH, label: newLabel };
    }));

  // ── Code generator ─────────────────────────────────────────────────────────

  const generateCode = () => {
    const name = form.getFieldValue('name');
    if (!name) {
      message.warning('Előbb add meg a termék nevét!');
      return;
    }
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'PROD';
    const codes = new Set(products.map(p => p.code).filter(Boolean));
    let i = 1;
    let candidate = `${base}-${String(i).padStart(3, '0')}`;
    while (codes.has(candidate)) {
      i++;
      candidate = `${base}-${String(i).padStart(3, '0')}`;
      if (i > 999) { message.error('Nem sikerült egyedi cikkszámot genérálni'); return; }
    }
    form.setFieldsValue({ code: candidate });
    message.success(`Új cikkszám generálva: ${candidate}`);
  };

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = products.filter(p =>
    !query || deepSearchMatch(query, `${p.name} ${p.description ?? ''} ${p.category_name ?? ''}`)
  );

  // ── Detail drawer – shows linked calculators with their materials / services ─

  const openDetail = (p: ProductTemplate) => {
    setDetailProduct(p);
    setDetailOpen(true);
  };

  // ── Columns ──────────────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Cikkszám',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">–</Text>,
    },
    {
      title: 'Termék neve',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: ProductTemplate, b: ProductTemplate) => a.name.localeCompare(b.name),
      render: (name: string, rec: ProductTemplate) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(rec)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Kategória',
      dataIndex: 'category_name',
      key: 'category',
      render: (v: string | null) => v ? <Tag icon={<TagsOutlined />}>{v}</Tag> : <Text type="secondary">–</Text>,
    },
    {
      title: 'Méretek',
      key: 'sizes',
      render: (_: any, rec: ProductTemplate) => (
        <Space size={4} wrap>
          {rec.sizes.length === 0
            ? <Text type="secondary">–</Text>
            : rec.sizes.map((s, i) => (
                <Tag key={i} color="blue">
                  {s.label ? `${s.label} (${s.width_mm}×${s.height_mm})` : `${s.width_mm}×${s.height_mm} mm`}
                </Tag>
              ))}
        </Space>
      ),
    },
    {
      title: 'Működési logika',
      key: 'calculator_type',
      width: 160,
      render: (_: any, rec: ProductTemplate) => {
        const ct = CALCULATOR_TYPES.find(t => t.value === rec.calculator_type);
        return ct ? <Tag icon={<CalculatorOutlined />} color="purple">{ct.label}</Tag> : <Text type="secondary">–</Text>;
      },
    },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Igen' : 'Nem'}</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 160,
      render: (_: any, rec: ProductTemplate) => (
        <Space>
          <Tooltip title="Szerkesztés">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Tooltip title="Másolás">
            <Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicate(rec)} />
          </Tooltip>
          <Popconfirm title="Biztosan törlöd?" onConfirm={() => handleDelete(rec.id)} okText="Törlés" cancelText="Mégse">
            <Tooltip title="Törlés">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px 24px' }}>
      <UnifiedQuickSearchHeader
        title="Termék szerkesztő"
        searchValue={query}
        onSearchChange={setQuery}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Új termék
          </Button>
        }
      />

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 25, showSizeChanger: true }}
        locale={{ emptyText: <Empty description="Nincs termék rögzítve" /> }}
      />

      {/* ── Create / Edit Drawer ─────────────────────────────────────────── */}
      <Drawer
        title={editing ? `Szerkesztés – ${editing.name}` : 'Új termék'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={680}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>Mégse</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              Mentés
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Collapse
            defaultActiveKey={['basic', 'sizes', 'materials', 'required_services', 'print', 'discounts']}
            expandIconPosition="end"
            ghost
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'basic',
                label: <Text strong style={{ fontSize: 13 }}>Alapadatok</Text>,
                children: (
                  <>
                    <Form.Item name="name" label="Termék neve" rules={[{ required: true, message: 'Kötelező' }]}>
                      <Input placeholder="pl. Molinó, Szórólap A5, Névjegykártya" />
                    </Form.Item>

                    <Form.Item name="code" label="Cikkszám">
                      <Input
                        placeholder="pl. MOLINÓ-001"
                        addonAfter={
                          <Tooltip title="Cikkszám generálása a név alapján">
                            <SyncOutlined style={{ cursor: 'pointer' }} onClick={generateCode} />
                          </Tooltip>
                        }
                      />
                    </Form.Item>

                    <Form.Item name="description" label="Leírás">
                      <TextArea rows={3} placeholder="Rövid leírás…" />
                    </Form.Item>

                    <Row gutter={16}>
                      <Col span={18}>
                        <Form.Item name="category" label="Termékkategória">
                          <Select allowClear placeholder="Válassz kategóriát…">
                            {sortedCategories.map(c => (
                              <Option key={c.id} value={c.id}>{categoryPathMap.get(c.id) || c.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="calculator_type" label="Működési logika">
                      <Select
                        placeholder="Válassz logikát…"
                        optionRender={(opt) => {
                          const ct = CALCULATOR_TYPES.find(t => t.value === opt.value);
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span>{opt.label}</span>
                              {ct?.tooltip && (
                                <Tooltip title={ct.tooltip} placement="right">
                                  <span style={{ color: '#8c8c8c', fontSize: 12, cursor: 'help' }}>ℹ</span>
                                </Tooltip>
                              )}
                            </div>
                          );
                        }}
                        options={CALCULATOR_TYPES}
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'sizes',
                label: <Text strong style={{ fontSize: 13 }}>Méretek</Text>,
                children: (
                  <>
                    {/* Egyedi méret */}
                    <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                      <Form.Item name="custom_size_enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
                        <Checkbox><Text strong style={{ fontSize: 13 }}>Egyedi méret engedélyezett</Text></Checkbox>
                      </Form.Item>
                      <Form.Item shouldUpdate={(p, c) => p.custom_size_enabled !== c.custom_size_enabled} noStyle>
                        {({ getFieldValue }) => getFieldValue('custom_size_enabled') && (
                          <Row gutter={[6, 0]} align="middle" style={{ marginTop: 10 }}>
                            <Col flex="none"><Text style={{ fontSize: 12 }}>Szél.:</Text></Col>
                            <Col style={{ width: 80 }}>
                              <Form.Item name="custom_size_width_min" noStyle>
                                <InputNumber placeholder="min" min={0} size="small" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col flex="none"><Text style={{ color: '#bbb', padding: '0 2px' }}>–</Text></Col>
                            <Col style={{ width: 80 }}>
                              <Form.Item name="custom_size_width_max" noStyle>
                                <InputNumber placeholder="max" min={0} size="small" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col flex="none" style={{ paddingLeft: 12 }}><Text style={{ fontSize: 12 }}>Mag.:</Text></Col>
                            <Col style={{ width: 80 }}>
                              <Form.Item name="custom_size_height_min" noStyle>
                                <InputNumber placeholder="min" min={0} size="small" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col flex="none"><Text style={{ color: '#bbb', padding: '0 2px' }}>–</Text></Col>
                            <Col style={{ width: 80 }}>
                              <Form.Item name="custom_size_height_max" noStyle>
                                <InputNumber placeholder="max" min={0} size="small" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col flex="none" style={{ paddingLeft: 8 }}>
                              <Form.Item name="custom_size_unit" noStyle>
                                <Select size="small" style={{ width: 72 }} options={UNITS} />
                              </Form.Item>
                            </Col>
                          </Row>
                        )}
                      </Form.Item>
                    </div>

                    {/* Preset méretek */}
                    <Text type="secondary" style={{ fontSize: 12 }}>Preset méretek</Text>
                    <div style={{ marginTop: 6, marginBottom: 4 }}>
                      {sizes.map((s, idx) => (
                        <Row key={idx} gutter={6} align="middle" style={{ marginBottom: 6 }}>
                          <Col flex="auto">
                            <Input
                              placeholder="pl. A4, egyéni"
                              value={s.label}
                              onChange={e => updateSize(idx, 'label', e.target.value)}
                              size="small"
                            />
                          </Col>
                          <Col style={{ width: 62 }}>
                            <InputNumber
                              placeholder="Sz."
                              min={0}
                              style={{ width: '100%' }}
                              value={s.width ?? undefined}
                              onChange={v => updateSize(idx, 'width', v ?? null)}
                              size="small"
                            />
                          </Col>
                          <Col flex="none" style={{ textAlign: 'center', padding: '0 2px' }}>
                            <Text style={{ color: '#bbb', fontSize: 14 }}>×</Text>
                          </Col>
                          <Col style={{ width: 62 }}>
                            <InputNumber
                              placeholder="M."
                              min={0}
                              style={{ width: '100%' }}
                              value={s.height ?? undefined}
                              onChange={v => updateSize(idx, 'height', v ?? null)}
                              size="small"
                            />
                          </Col>
                          <Col style={{ width: 74 }}>
                            <Select
                              size="small"
                              style={{ width: '100%' }}
                              value={s.unit}
                              onChange={v => updateSizeUnit(idx, v)}
                              options={UNITS}
                            />
                          </Col>
                          <Col flex="none">
                            <Button
                              size="small"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => removeSize(idx)}
                              disabled={sizes.length === 1}
                            />
                          </Col>
                        </Row>
                      ))}
                    </div>

                    <Button size="small" icon={<PlusOutlined />} onClick={addSize} style={{ marginBottom: 8 }}>
                      Preset hozzáadása
                    </Button>
                  </>
                ),
              },
              {
                key: 'materials',
                label: <Text strong style={{ fontSize: 13 }}>Alapanyagok</Text>,
                children: (
                  <>
                    <Form.Item label="Engedélyezett alapanyag kategóriák">
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        placeholder="Kategóriák kiválasztása…"
                        value={selectedMaterialGroups}
                        onChange={setSelectedMaterialGroups}
                        optionFilterProp="label"
                        options={materialGroups.map(g => ({ label: g.name, value: g.id }))}
                      />
                    </Form.Item>

                    <Form.Item label="Engedélyezett alapanyagok">
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        placeholder="Egyedi alapanyagok kiválasztása…"
                        value={selectedMaterials}
                        onChange={setSelectedMaterials}
                        optionFilterProp="label"
                        options={materials.map(m => ({ label: `${m.name} (${m.code})`, value: m.id }))}
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'required_services',
                label: <Text strong style={{ fontSize: 13 }}>Kötelező kapcsolódó szolgáltatások</Text>,
                children: (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      A termékhez kötelezően kapcsolódó szolgáltatások (pl. méretre vágás, csomagolás). Ezek mindig bele lesznek számolva a kalkulációba.
                    </Text>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      placeholder="Szolgáltatás hozzáadása…"
                      style={{ width: '100%' }}
                      value={requiredServices}
                      onChange={setRequiredServices}
                      optionFilterProp="label"
                      options={services.map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                    />
                  </>
                ),
              },
              {
                key: 'print',
                label: <Text strong style={{ fontSize: 13 }}>Nyomtatási beállítások</Text>,
                children: (
                  <>
                    {/* Print-specific fields for sheet_print / click_sheet_print */}
                    <Form.Item shouldUpdate={(p, c) => p.calculator_type !== c.calculator_type} noStyle>
                      {({ getFieldValue }) => {
                        const ct = getFieldValue('calculator_type');
                        const isClickSheet = ct === 'click_sheet_print';
                        const isSheetPrint = ct === 'sheet_print';
                        if (!isSheetPrint && !isClickSheet) return null;
                        return (
                          <>
                            <Row gutter={12}>
                              <Col span={12}>
                                <Form.Item name="print_sides" label="Nyomtatás oldalai" initialValue={1}>
                                  <Select>
                                    <Option value={1}>Egyoldalas (simplex)</Option>
                                    <Option value={2}>Kétoldalas (duplex)</Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                              {!isClickSheet && (
                                <Col span={12}>
                                  <Form.Item
                                    name="print_service"
                                    label="Nyomtatási szolgáltatás"
                                  >
                                    <Select
                                      allowClear
                                      showSearch
                                      placeholder="pl. Fekete-fehér íves nyomtatás"
                                      optionFilterProp="label"
                                      options={services.map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                                    />
                                  </Form.Item>
                                </Col>
                              )}
                            </Row>

                            {isClickSheet && (
                              <>
                                <Form.Item
                                  label="Klikkdíjas nyomtatási opciók"
                                  tooltip="A PrintEditorban a felhasználó ezek közül választ nyomtatási szolgáltatást. Az első lesz az alapértelmezett. Sorrendet a nyilakkal állítsd."
                                >
                                  <Select
                                    showSearch
                                    placeholder="Szolgáltatás hozzáadása…"
                                    value={undefined}
                                    onChange={(val: number) => {
                                      if (!selectedPrintServiceOptions.includes(val)) {
                                        setSelectedPrintServiceOptions([...selectedPrintServiceOptions, val]);
                                      }
                                    }}
                                    optionFilterProp="label"
                                    options={services
                                      .filter(s => !selectedPrintServiceOptions.includes(s.id))
                                      .map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                                  />
                                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {selectedPrintServiceOptions.map((id, idx) => {
                                      const svc = services.find(s => s.id === id);
                                      const isDigipr = digiprIds.has(id);
                                      return (
                                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: idx === 0 ? '#e6f7ff' : '#fafafa', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                                          <span style={{ flex: 1, fontSize: 13 }}>
                                            {idx === 0 && <Tag color="blue" style={{ marginRight: 4, fontSize: 10 }}>alapértelmezett</Tag>}
                                            {isDigipr && <LockOutlined style={{ marginRight: 4, color: '#faad14' }} />}
                                            {svc ? `${svc.name} (${svc.code})` : `#${id}`}
                                          </span>
                                          <Button
                                            size="small" type="text" icon={<ArrowUpOutlined />}
                                            disabled={idx === 0}
                                            onClick={() => {
                                              const arr = [...selectedPrintServiceOptions];
                                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                              setSelectedPrintServiceOptions(arr);
                                            }}
                                          />
                                          <Button
                                            size="small" type="text" icon={<ArrowDownOutlined />}
                                            disabled={idx === selectedPrintServiceOptions.length - 1}
                                            onClick={() => {
                                              const arr = [...selectedPrintServiceOptions];
                                              [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                              setSelectedPrintServiceOptions(arr);
                                            }}
                                          />
                                          {!isDigipr && (
                                            <Button
                                              size="small" type="text" danger icon={<DeleteOutlined />}
                                              onClick={() => setSelectedPrintServiceOptions(selectedPrintServiceOptions.filter(x => x !== id))}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </Form.Item>
                                <Form.Item name="fix_cost_first_side_only" valuePropName="checked">
                                  <Checkbox>2 oldalas nyomtatásnál a fix költségeket csak az 1. oldalra számolja</Checkbox>
                                </Form.Item>
                                <Form.Item name="multi_sheet_enabled" valuePropName="checked">
                                  <Checkbox>Ív hozzáadása — a felhasználó több ívet (oldalt) adhat a megrendeléshez</Checkbox>
                                </Form.Item>
                              </>
                            )}

                          </>
                        );
                      }}
                    </Form.Item>

                    {/* Service groups — always visible; DIGIPR_K / DIGIPR_CMYK are protected */}
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      Engedélyezett szolgáltatások oldalanként. Csoporton belül VAGY, csoportok között ÉS logika érvényes.
                    </Text>
                    {([
                      { label: '1. oldal', groups: serviceGroups1, setGroups: setServiceGroups1 },
                      { label: '2. oldal', groups: serviceGroups2, setGroups: setServiceGroups2 },
                    ] as const).map(({ label, groups, setGroups }) => (
                      <div key={label} style={{ marginBottom: 16, padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{label}</Text>
                        {groups.map((group, gIdx) => (
                          <div key={gIdx}>
                            {gIdx > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', margin: '6px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#d9d9d9' }} />
                                <Tag color="blue" style={{ margin: '0 8px', fontSize: 11 }}>ÉS</Tag>
                                <div style={{ flex: 1, height: 1, background: '#d9d9d9' }} />
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Select
                                mode="multiple"
                                allowClear
                                showSearch
                                size="small"
                                placeholder="Válassz… (csoporton belül VAGY logika)"
                                style={{ flex: 1 }}
                                value={group}
                                onChange={newVals => {
                                  const removedDigipr = group.filter(id => digiprIds.has(id) && !newVals.includes(id));
                                  const finalVals = removedDigipr.length > 0 ? [...newVals, ...removedDigipr] : newVals;
                                  setGroups(prev => prev.map((g, i) => i === gIdx ? finalVals : g));
                                }}
                                optionFilterProp="label"
                                options={services.map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                                tagRender={(props) => {
                                  const { label, value, closable, onClose } = props;
                                  const isDigipr = digiprIds.has(value as number);
                                  return (
                                    <Tag
                                      closable={!isDigipr && closable}
                                      onClose={isDigipr ? undefined : onClose}
                                      style={{ marginRight: 3 }}
                                      color={isDigipr ? 'gold' : undefined}
                                      icon={isDigipr ? <LockOutlined /> : undefined}
                                    >
                                      {label}
                                    </Tag>
                                  );
                                }}
                              />
                              <Tooltip title="Csoport törlése">
                                <Button
                                  size="small"
                                  danger
                                  icon={<MinusCircleOutlined />}
                                  onClick={() => setGroups(prev => prev.length > 1 ? prev.filter((_, i) => i !== gIdx) : [[]])}
                                  disabled={groups.length === 1 && group.length === 0}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                        <Button
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => setGroups(prev => [...prev, []])}
                          style={{ marginTop: 8 }}
                        >
                          ÉS csoport hozzáadása
                        </Button>
                      </div>
                    ))}
                  </>
                ),
              },
              {
                key: 'finishing_services',
                label: <Text strong style={{ fontSize: 13 }}>Kész termékre vonatkozó szolgáltatások</Text>,
                children: (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      A kész termékhez kapcsolódó opcionális szolgáltatások (pl. díszcsomagolás, papírdobozba csomagolás). Csoporton belül VAGY, csoportok között ÉS logika.
                    </Text>
                    {finishingServiceGroups.map((group, gIdx) => (
                      <div key={gIdx}>
                        {gIdx > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', margin: '6px 0' }}>
                            <div style={{ flex: 1, height: 1, background: '#d9d9d9' }} />
                            <Tag color="blue" style={{ margin: '0 8px', fontSize: 11 }}>ÉS</Tag>
                            <div style={{ flex: 1, height: 1, background: '#d9d9d9' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Select
                            mode="multiple"
                            allowClear
                            showSearch
                            size="small"
                            placeholder="Válassz… (csoporton belül VAGY logika)"
                            style={{ flex: 1 }}
                            value={group}
                            onChange={newVals => setFinishingServiceGroups(prev => prev.map((g, i) => i === gIdx ? newVals : g))}
                            optionFilterProp="label"
                            options={services.map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                          />
                          <Tooltip title="Csoport törlése">
                            <Button
                              size="small"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => setFinishingServiceGroups(prev => prev.length > 1 ? prev.filter((_, i) => i !== gIdx) : [[]])}
                              disabled={finishingServiceGroups.length === 1 && group.length === 0}
                            />
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setFinishingServiceGroups(prev => [...prev, []])}
                      style={{ marginTop: 8 }}
                    >
                      ÉS csoport hozzáadása
                    </Button>
                  </>
                ),
              },
              {
                key: 'discounts',
                label: <Text strong style={{ fontSize: 13 }}>Összeghatáros kedvezmény</Text>,
                children: (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      Rendelési összeghatárhoz kötött árengedmény. A kalkulátor automatikusan alkalmazza a megfelelő sávot.
                    </Text>

                    {quantityDiscounts.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {/* Header */}
                        <Row gutter={6} style={{ marginBottom: 4 }}>
                          <Col style={{ width: 130 }}><Text type="secondary" style={{ fontSize: 11 }}>Összegtől (Ft)</Text></Col>
                          <Col style={{ width: 160 }}><Text type="secondary" style={{ fontSize: 11 }}>Típus</Text></Col>
                          <Col flex="auto"><Text type="secondary" style={{ fontSize: 11 }}>Érték</Text></Col>
                          <Col style={{ width: 32 }} />
                        </Row>
                        {quantityDiscounts.map((d, idx) => (
                          <Row key={d._key} gutter={6} align="middle" style={{ marginBottom: 6 }}>
                            <Col style={{ width: 130 }}>
                              <InputNumber
                                size="small"
                                min={0}
                                style={{ width: '100%' }}
                                value={d.min_amount ?? undefined}
                                onChange={v => setQuantityDiscounts(prev => prev.map((x, i) => i === idx ? { ...x, min_amount: v ?? null } : x))}
                                addonAfter="Ft"
                                placeholder="pl. 50000"
                              />
                            </Col>
                            <Col style={{ width: 160 }}>
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                value={d.discount_type}
                                onChange={v => setQuantityDiscounts(prev => prev.map((x, i) => i === idx ? { ...x, discount_type: v } : x))}
                              >
                                <Option value="percent">Százalékos (%)</Option>
                                <Option value="fixed">Fix összeg (Ft)</Option>
                              </Select>
                            </Col>
                            <Col flex="auto">
                              <InputNumber
                                size="small"
                                min={0}
                                style={{ width: '100%' }}
                                value={d.discount_value ?? undefined}
                                onChange={v => setQuantityDiscounts(prev => prev.map((x, i) => i === idx ? { ...x, discount_value: v ?? null } : x))}
                                addonAfter={d.discount_type === 'percent' ? '%' : 'Ft'}
                                placeholder="pl. 10"
                              />
                            </Col>
                            <Col style={{ width: 32 }}>
                              <Button
                                size="small"
                                danger
                                icon={<MinusCircleOutlined />}
                                onClick={() => setQuantityDiscounts(prev => prev.filter((_, i) => i !== idx))}
                              />
                            </Col>
                          </Row>
                        ))}
                      </div>
                    )}
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setQuantityDiscounts(prev => [...prev, { _key: Date.now(), min_amount: null, discount_type: 'percent', discount_value: null }])}
                    >
                      Kedvezmény sáv hozzáadása
                    </Button>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>

      {/* ── Produkci\u00f3z\u00e1s modal ─────────────────────────────────────────── */}
      <Modal
        title={<Space><AppstoreOutlined /> Produkci\u00f3z\u00e1s kalkul\u00e1tor</Space>}
        open={impositionOpen}
        onCancel={() => setImpositionOpen(false)}
        footer={null}
        width={560}
      >
        {(() => {
          const bleed = impBleed ?? 0;
          const pw = impProductW != null ? impProductW + 2 * bleed : null;
          const ph = impProductH != null ? impProductH + 2 * bleed : null;
          const sw = impSheetW;
          const sh = impSheetH;

          const fitNormal = (pw != null && ph != null && sw != null && sh != null)
            ? Math.floor(sw / pw) * Math.floor(sh / ph) : 0;
          const fitRotated = (pw != null && ph != null && sw != null && sh != null)
            ? Math.floor(sw / ph) * Math.floor(sh / pw) : 0;
          const bestFit = Math.max(fitNormal, fitRotated);
          const rotated = fitRotated > fitNormal;
          const cols = bestFit > 0 && pw != null && ph != null && sw != null && sh != null
            ? (rotated ? Math.floor(sw / ph) : Math.floor(sw / pw)) : 0;
          const rows = bestFit > 0 ? Math.ceil(bestFit / Math.max(1, cols)) : 0;

          const sides = form.getFieldValue('print_sides') ?? 1;
          const sheetsNeeded = bestFit > 0 ? Math.ceil(impQty / bestFit) : null;
          const clicks = sheetsNeeded != null ? sheetsNeeded * sides : null;

          return (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Ívméret (mm)</Text>
                  <Row gutter={8}>
                    <Col span={12}>
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="Szélesség"
                        min={1}
                        value={impSheetW ?? undefined}
                        onChange={v => setImpSheetW(v ?? null)}
                        addonAfter="mm"
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="Magasság"
                        min={1}
                        value={impSheetH ?? undefined}
                        onChange={v => setImpSheetH(v ?? null)}
                        addonAfter="mm"
                      />
                    </Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Termékméret (mm)</Text>
                  <Row gutter={8}>
                    <Col span={12}>
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="Szélesség"
                        min={1}
                        value={impProductW ?? undefined}
                        onChange={v => setImpProductW(v ?? null)}
                        addonAfter="mm"
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="Magasság"
                        min={1}
                        value={impProductH ?? undefined}
                        onChange={v => setImpProductH(v ?? null)}
                        addonAfter="mm"
                      />
                    </Col>
                  </Row>
                </Col>
              </Row>

              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Kifutó (mm / oldal)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    value={impBleed}
                    onChange={v => setImpBleed(v ?? 0)}
                    addonAfter="mm"
                  />
                </Col>
                <Col span={12}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Példányszám</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    value={impQty}
                    onChange={v => setImpQty(v ?? 1)}
                    addonAfter="db"
                  />
                </Col>
              </Row>

              {bestFit > 0 ? (
                <>
                  {/* Visual grid */}
                  <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', border: '2px solid #1677ff', padding: 4, background: '#fff', position: 'relative' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
                        {Array.from({ length: cols * rows }).map((_, i) => (
                          <div
                            key={i}
                            style={{
                              width: 28, height: ph != null && pw != null ? Math.round(28 * (rotated ? pw / ph : ph / pw)) : 28,
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
                      {rotated ? 'Elforgatva elhelyezve' : 'Normál elhelyezés'}
                    </div>
                  </div>

                  {/* Results */}
                  <Row gutter={12}>
                    <Col span={8} style={{ textAlign: 'center', background: '#f6ffed', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>{bestFit}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>db / ív</div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'center', background: '#e6f4ff', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{sheetsNeeded}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>ív szükséges ({impQty} db)</div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'center', background: '#fff7e6', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#fa8c16' }}>{clicks}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>klikk ({sides} oldal)</div>
                    </Col>
                  </Row>

                  <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
                    {cols} × {rows} elrendezés{bleed > 0 ? `, ${bleed} mm kifutóval` : ''} | Termék: {impProductW}×{impProductH} mm | Ív: {impSheetW}×{impSheetH} mm
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '32px 0' }}>
                  {(pw != null && ph != null && sw != null && sh != null)
                    ? 'A termék nem fér fel az ívre (túl nagy vagy nem adott meg méretet).'
                    : 'Add meg az ív- és termékméreteket a kalkulációhoz.'}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* \u2500\u2500 Detail Drawer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <Drawer
        title={<Space><AppstoreOutlined /> {detailProduct?.name}</Space>}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => { if (detailProduct) openInPrintEditor(detailProduct); }}>
              Print Editor
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => { setDetailOpen(false); if (detailProduct) handleDuplicate(detailProduct); }}>
              Másolás
            </Button>
            <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); if (detailProduct) openEdit(detailProduct); }}>
              Szerkesztés
            </Button>
          </Space>
        }
      >
        {detailProduct && (() => {
          const calcTypeLabel = CALCULATOR_TYPES.find(t => t.value === detailProduct.calculator_type)?.label;
          const mats = detailProduct.allowed_materials_details ?? [];
          const grps = detailProduct.allowed_material_groups_details ?? [];
          const sg1 = detailProduct.service_groups_1 ?? [];
          const sg2 = detailProduct.service_groups_2 ?? [];
          const svcById = new Map((detailProduct.allowed_services_details ?? []).map(s => [s.id, s]));
          return (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>

              {detailProduct.category_name && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>KATEGÓRIA</Text><br />
                  <Tag icon={<TagsOutlined />}>{detailProduct.category_name}</Tag>
                </div>
              )}

              {detailProduct.description && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>LEÍRÁS</Text><br />
                  <Text>{detailProduct.description}</Text>
                </div>
              )}

              <Divider style={{ margin: '4px 0' }} />

              <div>
                <Text strong>Méretek</Text>
                {detailProduct.sizes.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nincs megadott méret" style={{ marginTop: 8 }} />
                  : (
                    <Table
                      size="small"
                      dataSource={detailProduct.sizes}
                      rowKey={(r, i) => String(i)}
                      pagination={false}
                      style={{ marginTop: 8 }}
                      columns={[
                        { title: 'Méret neve', dataIndex: 'label', key: 'label', render: (v: any) => v || '–' },
                        { title: 'Szélesség', key: 'w', render: (_: any, s: any) => { const u = s.unit || 'mm'; const v = fromMm(Number(s.width_mm), u); return `${v} ${u}`; } },
                        { title: 'Magasság',  key: 'h', render: (_: any, s: any) => { const u = s.unit || 'mm'; const v = fromMm(Number(s.height_mm), u); return `${v} ${u}`; } },
                      ]}
                    />
                  )}
                {detailProduct.custom_size_enabled && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="green">Egyedi méret engedélyezett</Tag>
                    {(detailProduct.custom_size_width_min != null || detailProduct.custom_size_height_min != null) && (() => {
                      const cu = detailProduct.custom_size_unit || 'mm';
                      const wMin = fromMm(Number(detailProduct.custom_size_width_min), cu);
                      const wMax = detailProduct.custom_size_width_max != null ? fromMm(Number(detailProduct.custom_size_width_max), cu) : null;
                      const hMin = fromMm(Number(detailProduct.custom_size_height_min), cu);
                      const hMax = detailProduct.custom_size_height_max != null ? fromMm(Number(detailProduct.custom_size_height_max), cu) : null;
                      return <Text style={{ fontSize: 12, marginLeft: 8 }}>Sz: {wMin}{wMax != null ? `–${wMax}` : ''} × M: {hMin}{hMax != null ? `–${hMax}` : ''} {cu}</Text>;
                    })()}
                  </div>
                )}
              </div>

              <Divider style={{ margin: '4px 0' }} />

              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>MŰKÖDÉSI LOGIKA</Text><br />
                  {calcTypeLabel
                    ? <Tag icon={<CalculatorOutlined />} color="purple">{calcTypeLabel}</Tag>
                    : <Text type="secondary">–</Text>}
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>HASZONKULCS</Text><br />
                  <Text>Alapanyag: <strong>{detailProduct.default_material_markup_percentage}%</strong></Text>
                  {' · '}
                  <Text>Szolgáltatás: <strong>{detailProduct.default_service_markup_percentage}%</strong></Text>
                </Col>
              </Row>

              <Divider style={{ margin: '4px 0' }} />

              <Row gutter={16}>
                <Col span={12}>
                  {grps.length > 0 && (
                    <>
                      <Text strong>Alapanyag kategóriák ({grps.length})</Text>
                      <Space wrap style={{ marginTop: 4, display: 'block' }}>
                        {grps.map(g => <Tag key={g.id} color="green" style={{ marginBottom: 4 }}>{g.name}</Tag>)}
                      </Space>
                    </>
                  )}
                  <Text strong style={{ marginTop: grps.length > 0 ? 8 : 0, display: 'block' }}>Alapanyagok ({mats.length})</Text>
                  <Space wrap style={{ marginTop: 4, display: 'block' }}>
                    {mats.length === 0
                      ? <Text type="secondary">–</Text>
                      : mats.map(m => <Tag key={m.id} style={{ marginBottom: 4 }}>{m.name}</Tag>)}
                  </Space>
                </Col>
                <Col span={12}>
                  {(detailProduct.required_services_details ?? []).length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>KÖTELEZŐ SZOLGÁLTATÁSOK</Text>
                      <Space wrap style={{ marginTop: 4, display: 'block' }}>
                        {(detailProduct.required_services_details ?? []).map(s => (
                          <Tag key={s.id} color="orange" style={{ marginBottom: 2 }}>{s.name}</Tag>
                        ))}
                      </Space>
                    </div>
                  )}
                  <Text strong>Szolgáltatások</Text>
                  {([{ side: '1', groups: sg1 }, { side: '2', groups: sg2 }]).map(({ side, groups }) => {
                    const nonEmpty = groups.filter(g => g.length > 0);
                    if (nonEmpty.length === 0) return null;
                    return (
                      <div key={side} style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>{side}. oldal</Text>
                        {nonEmpty.map((group, gIdx) => (
                          <div key={gIdx}>
                            {gIdx > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', margin: '3px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                                <Tag color="blue" style={{ margin: '0 6px', fontSize: 10 }}>ÉS</Tag>
                                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                              </div>
                            )}
                            <Space wrap size={[4, 4]} style={{ display: 'flex' }}>
                              {group.map((id, sIdx) => {
                                const svc = svcById.get(id);
                                return (
                                  <React.Fragment key={id}>
                                    {sIdx > 0 && <Text style={{ color: '#aaa', fontSize: 11 }}>vagy</Text>}
                                    <Tag color="blue" style={{ marginBottom: 2 }}>{svc?.name ?? `#${id}`}</Tag>
                                  </React.Fragment>
                                );
                              })}
                            </Space>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {sg1.every(g => g.length === 0) && sg2.every(g => g.length === 0) && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>–</Text>
                  )}
                </Col>
              </Row>
            </Space>
          );
        })()}
      </Drawer>
    </div>
  );
};

export default ProductEditor;
