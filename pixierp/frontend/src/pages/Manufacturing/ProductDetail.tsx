import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Checkbox, Col, Dropdown, Form, Input, message, Modal, Popconfirm,
  Row, Select, Space, Spin, Table, Tag, Tooltip, Upload,
} from 'antd';
import { CopyOutlined, DeleteOutlined, DownOutlined, FieldTimeOutlined, LeftOutlined, MessageOutlined, PaperClipOutlined, PlusOutlined, PrinterOutlined, RightOutlined, UpOutlined, UploadOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CostDragHandle, CostDraggableRow, applyCostDnd, buildCostTreeMeta, CostTreeGuide } from '../../components/Manufacturing/CostDnd';
import dayjs from 'dayjs';
import { manufacturingService } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import { hrService } from '../../services/hrService';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import api from '../../services/api';
import NumInput from '../../components/NumInput';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CostItem {
  id: number;
  type: 'material' | 'service' | 'other';
  ref_id?: number | null;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  markup_percent: number;
  selling_unit_price: number;
  selling_price: number;
  supplier_id?: number | null;
  department_id?: number | null;
  is_internal?: boolean;
  is_per_unit?: boolean;
  currency?: string;
  // Sorrend / alá-felérendelés (mint a tételnél)
  sort_order?: number;
  parent_local_id?: number | null;
  status?: string;
  notes?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  quote_request_open: 'Ajánlatkérés nyitott',
  quote_request_priced: 'Ajánlatkérés árazva',
  quote_request_sent: 'Ajánlat elküldve',
  ordered: 'Megrendelve',
  design_in_progress: 'Tervezés folyamatban',
  design_approved: 'Terv elfogadva',
  production_in_progress: 'Gyártás folyamatban',
  production_completed: 'Gyártás kész',
  finished_goods_warehouse: 'Késztermék raktáron',
  installation_in_progress: 'Telepítés folyamatban',
  delivered: 'Leszállítva',
  invoiced: 'Számlázva',
  paid: 'Fizetve',
  cancelled: 'Törölve',
};

const STATUS_COLORS: Record<string, string> = {
  quote_request_open: 'blue',
  quote_request_priced: 'cyan',
  quote_request_sent: 'geekblue',
  ordered: 'gold',
  design_in_progress: 'orange',
  design_approved: 'lime',
  production_in_progress: 'processing',
  production_completed: 'green',
  finished_goods_warehouse: 'teal',
  installation_in_progress: 'volcano',
  delivered: 'success',
  invoiced: 'purple',
  paid: 'magenta',
  cancelled: 'default',
};

const COST_ITEM_STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'new', label: 'Új', color: 'blue' },
  { value: 'confirmed', label: 'Megerősítve', color: 'cyan' },
  { value: 'in_production', label: 'Gyártásban', color: 'orange' },
  { value: 'ready', label: 'Kész', color: 'green' },
  { value: 'in_delivery', label: 'Száll. alatt', color: 'purple' },
  { value: 'delivered', label: 'Leszállítva', color: 'success' },
  { value: 'cancelled', label: 'Törölve', color: 'red' },
];

const stripHtmlToText = (s: any): string => {
  if (s == null) return '';
  const str = String(s);
  if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = str;
      return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    } catch {
      // Fall back to regex when DOM parsing is unavailable.
    }
  }
  return str.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

// ─── Component ────────────────────────────────────────────────────────────────

const ManufacturingProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [product, setProduct] = useState<any>(null);

  // Reference data
  const [customers, setCustomers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  // Cost items
  const [costItems, setCostItems] = useState<CostItem[]>([]);

  // Dimensions
  const [dimensionsPerUnit, setDimensionsPerUnit] = useState(true);
  const [calculatedVolumes, setCalculatedVolumes] = useState({ unit: 0, total: 0 });
  const [calculatedTotalDims, setCalculatedTotalDims] = useState<{ width: number; length: number; height: number; unit: string } | null>(null);
  const [dimsExpanded, setDimsExpanded] = useState(false);

  // Totals
  const [displayedTotals, setDisplayedTotals] = useState({ totalCost: 0, totalSelling: 0, unitCost: 0, unitSelling: 0, quantity: 1 });

  // Default markup for newly inserted custom rows
  const defaultMarkup = 30;

  // Status dropdown
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const watchedStatus = Form.useWatch('status', form);
  const watchedQty = Form.useWatch('quantity', form);
  const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId, setPreselectedSubItemId } = useTimeTracker();

  // Attachments
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const [pendingRemark, setPendingRemark] = useState('');

  // ── Load product + reference data ─────────────────────────────────────────

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await manufacturingService.getProduct(Number(id));
      setProduct(p);

      // Determine company_id and contact_ids
      let companyId: any = undefined;
      let contactIds: string[] = [];
      if ((p.allowed_companies_data as any[])?.length > 0) companyId = (p.allowed_companies_data as any[])[0].id;
      else if ((p.allowed_companies as any[])?.length > 0) companyId = (p.allowed_companies as any[])[0];
      if (p.allowed_contacts_data) contactIds = (p.allowed_contacts_data as any[]).map((c: any) => String(c.id));

      form.setFieldsValue({
        ...p,
        description: stripHtmlToText(p.description),
        internal_description: stripHtmlToText(p.internal_description),
        company_id: companyId,
        contact_ids: contactIds,
      });

      // Preload contacts for company
      if (companyId) {
        crmService.getContactsByCompany(companyId)
          .then((res: any) => setContacts((res.results ?? res) || []))
          .catch(() => {});
      }

      // Cost items – preserve sort + parent relations from API
      const rawCosts = (p.cost_items || []) as any[];
      // First pass: assign stable local ids; remember backend id → local id
      const backendIdToLocal = new Map<number, number>();
      const mapped: CostItem[] = rawCosts.map((c: any) => {
        const localId = c.id || Date.now() + Math.random();
        if (typeof c.id === 'number') backendIdToLocal.set(c.id, localId);
        return {
          ...c,
          id: localId,
          supplier_id: c.supplier || c.supplier_id,
          department_id: c.department || c.department_id,
          is_internal: c.is_internal || false,
          unit_price: Number(c.unit_price) || 0,
          cost_price: Number(c.cost_price) || 0,
          selling_unit_price: Number(c.selling_unit_price) || 0,
          selling_price: Number(c.selling_price) || 0,
          currency: c.currency || 'HUF',
          sort_order: typeof c.sort_order === 'number' ? c.sort_order : 0,
          parent_local_id: null as number | null,
          status: c.status || 'new',
          notes: c.notes || '',
        } as CostItem;
      });
      // Second pass: resolve parent local ids
      mapped.forEach((m, idx) => {
        const raw = rawCosts[idx];
        const pid = raw?.parent;
        if (typeof pid === 'number' && backendIdToLocal.has(pid)) {
          m.parent_local_id = backendIdToLocal.get(pid)!;
        }
      });
      // Sort by sort_order
      mapped.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setCostItems(mapped);

      // Load attachments
      manufacturingService.getProductAttachments(Number(id))
        .then(setAttachments)
        .catch(() => {});
    } catch (e) {
      console.error(e);
      message.error('Nem sikerült betölteni a terméket');
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [custs, matsRes, servsRes, suppsRes, prodsRes, deptsRes] = await Promise.all([
        crmService.getCompanies(),
        api.get('/warehouse/materials/?filter_type=all&page_size=1000'),
        manufacturingService.getServices(),
        api.get('/crm/companies/?is_supplier=true&page_size=1000'),
        api.get('/manufacturing/products/?page_size=10000'),
        hrService.getDepartments(),
      ]);

      setCustomers((custs as any).results || custs);

      const mList = (matsRes.data.results ?? matsRes.data).map((m: any) => ({
        ...m,
        name: m.code ? `[${m.code}] ${m.name}` : m.name,
      }));
      setMaterials(mList);
      setServices(servsRes.results ?? servsRes);

      let suppList = (suppsRes.data.results ?? suppsRes.data).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const internalIdx = suppList.findIndex((s: any) => {
        const n = (s.name || '').trim().toLowerCase();
        return n.includes('belső gyártás') || n.includes('internal') || n.includes('belső márka');
      });
      if (internalIdx > -1) {
        const internalSupp = suppList.splice(internalIdx, 1)[0];
        suppList.unshift(internalSupp);
      }
      setSuppliers(suppList);
      setDepartments((deptsRes as any).results ?? deptsRes);
      setExistingProducts(((prodsRes as any).data?.results ?? (prodsRes as any).data ?? []));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadProduct();
    loadReferenceData();
  }, [loadProduct, loadReferenceData]);

  // Load missing suppliers
  useEffect(() => {
    const fetchMissing = async () => {
      if (!costItems.length || !suppliers.length) return;
      const existingIds = new Set(suppliers.map((s: any) => s.id));
      const missingIds = new Set<number>();
      costItems.forEach(item => {
        if (item.supplier_id && !existingIds.has(Number(item.supplier_id))) missingIds.add(Number(item.supplier_id));
      });
      if (!missingIds.size) return;
      const newSupps: any[] = [];
      for (const sid of Array.from(missingIds)) {
        try { const r = await api.get(`/crm/companies/${sid}/`); if (r.data) newSupps.push(r.data); } catch {}
      }
      if (newSupps.length) {
        setSuppliers(prev => {
          const combined = [...prev, ...newSupps];
          return Array.from(new Map(combined.map(i => [i.id, i])).values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
        });
      }
    };
    fetchMissing();
  }, [costItems, suppliers.length]);

  // Recalculate totals
  useEffect(() => {
    const productQty = form.getFieldValue('quantity') || 1;
    let tc = 0, ts = 0;
    costItems.forEach(item => {
      const itemQty = Number(item.quantity) || 0;
      const multiplier = item.is_per_unit ? productQty : 1;
      tc += (Number(item.cost_price) || 0) * itemQty * multiplier;
      ts += (Number(item.selling_unit_price) || 0) * itemQty * multiplier;
    });
    setDisplayedTotals({ totalCost: tc, totalSelling: ts, unitCost: productQty > 0 ? tc / productQty : 0, unitSelling: productQty > 0 ? ts / productQty : 0, quantity: productQty });
  }, [costItems, watchedQty]);

  // ── Business logic ─────────────────────────────────────────────────────────

  const calculateWeightFromDimensions = () => {
    const width = form.getFieldValue('width');
    const length = form.getFieldValue('length');
    const height = form.getFieldValue('height');
    const dimensionUnit = form.getFieldValue('dimension_unit') || 'mm';
    const specificWeight = form.getFieldValue('specific_weight');
    const specificWeightUnit = form.getFieldValue('specific_weight_unit') || 'kg/m3';
    const qty = form.getFieldValue('quantity') || 1;
    if ((!width || !length) && !height) { setCalculatedTotalDims(null); return; }
    let wM = width, lM = length, hM = height || 0;
    if (dimensionUnit === 'mm') { wM /= 1000; lM /= 1000; hM /= 1000; }
    else if (dimensionUnit === 'cm') { wM /= 100; lM /= 100; hM /= 100; }
    const baseVol = hM > 0 ? wM * lM * hM : 0;
    const uVol = dimensionsPerUnit ? baseVol : (qty > 0 ? baseVol / qty : 0);
    const tVol = dimensionsPerUnit ? baseVol * qty : baseVol;
    setCalculatedVolumes({ unit: uVol, total: tVol });
    setCalculatedTotalDims({
      width: width || 0, length: length || 0,
      height: dimensionsPerUnit ? parseFloat(((height || 0) * qty).toFixed(2)) : parseFloat(((height || 0) / (qty || 1)).toFixed(2)),
      unit: dimensionUnit,
    });
    if (specificWeight && specificWeight > 0 && uVol > 0) {
      let swKg = specificWeight;
      if (specificWeightUnit === 'g/cm3' || specificWeightUnit === 'kg/liter') swKg *= 1000;
      form.setFieldsValue({ total_weight: parseFloat((tVol * swKg).toFixed(3)), unit_weight: parseFloat((uVol * swKg).toFixed(3)), weight_unit: 'kg' });
    }
  };

  const calculateDimensionsFromWeight = (inputWeight: number | string | null, isUnit: boolean) => {
    const w = typeof inputWeight === 'string' ? parseFloat(inputWeight) : inputWeight;
    if (!w) return;
    const { unit: uVol, total: tVol } = calculatedVolumes;
    const targetVol = isUnit ? uVol : tVol;
    if (targetVol > 0) {
      const weightUnit = form.getFieldValue('weight_unit') || 'kg';
      let wKg = w;
      if (weightUnit === 'g') wKg /= 1000;
      else if (weightUnit === 't') wKg *= 1000;
      form.setFieldsValue({ specific_weight: parseFloat((wKg / targetVol).toFixed(2)), specific_weight_unit: 'kg/m3' });
      const qty = form.getFieldValue('quantity') || 1;
      if (isUnit) form.setFieldsValue({ total_weight: parseFloat((wKg * qty).toFixed(3)) });
      else form.setFieldsValue({ unit_weight: parseFloat((wKg / qty).toFixed(3)) });
    }
  };

  const handleCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const isDuplicate = existingProducts.some(p => p.code && p.code.toLowerCase() === val.toLowerCase() && p.id !== Number(id));
    if (isDuplicate) {
      message.warning('Ez a cikkszám már létezik! Automatikus léptetés...');
      const match = val.match(/^(.*?)(\d+)$/);
      let newCode = val;
      if (match) {
        const prefix = match[1], numStr = match[2], width = Math.max(numStr.length, 3);
        const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
        let maxNum = parseInt(numStr, 10);
        existingProducts.forEach(p => { if (!p.code || p.id === Number(id)) return; const m = p.code.match(regex); if (m && parseInt(m[1], 10) > maxNum) maxNum = parseInt(m[1], 10); });
        newCode = `${prefix}${(maxNum + 1).toString().padStart(width, '0')}`;
      } else {
        const prefix = val + (val.endsWith('-') ? '' : '-');
        const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
        let maxNum = 0;
        existingProducts.forEach(p => { if (!p.code || p.id === Number(id)) return; const m = p.code.match(regex); if (m && parseInt(m[1], 10) > maxNum) maxNum = parseInt(m[1], 10); });
        newCode = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
      }
      form.setFieldValue('code', newCode);
      message.success(`Új cikkszám generálva: ${newCode}`);
    }
  };

  const handleAddCost = (type: 'material' | 'service' | 'other') => {
    const defaultSupplier = type === 'other' ? suppliers.find(s => {
      const n = (s.name || '').trim().toLowerCase();
      return n.includes('belső márka') || n.includes('belső gyártás') || n.includes('internal');
    }) : null;
    setCostItems(prev => [...prev, {
      id: Date.now() + Math.random(),
      type, name: type === 'other' ? 'Egyéb költség' : '', unit: 'db',
      quantity: 1, unit_price: 0, cost_price: 0, markup_percent: defaultMarkup,
      selling_unit_price: 0, selling_price: 0,
      supplier_id: defaultSupplier?.id || null, is_internal: false, currency: 'HUF',
    }]);
  };

  const updateCostItem = (itemId: number, field: string, value: any) => {
    setCostItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, [field]: value };
      const cp = Number(updated.cost_price) || 0;
      const mu = Number(updated.markup_percent) || 0;
      const sup = Number(updated.selling_unit_price) || 0;
      const qty = Number(updated.quantity) || 1;
      if (field === 'cost_price' || field === 'markup_percent') {
        updated.selling_unit_price = cp * (1 + mu / 100);
        updated.selling_price = updated.selling_unit_price * qty;
      } else if (field === 'selling_unit_price') {
        if (cp > 0) updated.markup_percent = ((sup / cp) - 1) * 100;
        updated.selling_price = sup * qty;
      } else if (field === 'quantity') {
        updated.selling_price = sup * qty;
      }
      return updated;
    }));
  };

  const handleCostStatusChange = async (itemId: number, newStatus: string) => {
    const prev = costItems;
    setCostItems(prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
    try {
      await api.patch(`/manufacturing/cost-items/${itemId}/`, { status: newStatus });
      message.success('Státusz frissítve');
    } catch (e) {
      console.error(e);
      message.error('Státusz frissítése sikertelen');
      setCostItems(prev);
    }
  };

  const handleCostNoteEdit = (item: CostItem) => {
    let value = item.notes || '';
    Modal.confirm({
      title: `Megjegyzés — ${item.name || 'Altétel'}`,
      width: 600,
      icon: <MessageOutlined />,
      content: (
        <Input.TextArea
          defaultValue={item.notes || ''}
          rows={6}
          onChange={(e) => { value = e.target.value; }}
          placeholder="Írja be a megjegyzést..."
        />
      ),
      okText: 'Mentés',
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          await api.patch(`/manufacturing/cost-items/${item.id}/`, { notes: value });
          setCostItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: value } : i));
          message.success('Megjegyzés mentve');
        } catch (e) {
          console.error(e);
          message.error('Megjegyzés mentése sikertelen');
        }
      },
    });
  };

  const handleCostPrintWorksheet = async (itemId: number) => {
    try {
      const response = await api.get(`/manufacturing/cost-items/${itemId}/work_sheet/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      message.error('Hiba a munkalap letöltése során');
    }
  };

  const handleCostStartTimer = (itemId: number) => {
    setPreselectedOrderId(null);
    setPreselectedItemId(null);
    setPreselectedSubItemId(itemId);
    setTimerModalOpen(true);
  };

  // ── Cost items ordering & nesting helpers ────────────────────────────────
  const moveCostItem = (itemId: number, dir: -1 | 1) => {
    setCostItems(prev => {
      const idx = prev.findIndex(i => i.id === itemId);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      const [it] = next.splice(idx, 1);
      next.splice(newIdx, 0, it);
      return next.map((it2, i) => ({ ...it2, sort_order: i }));
    });
  };

  const indentCostItem = (itemId: number) => {
    setCostItems(prev => {
      const idx = prev.findIndex(i => i.id === itemId);
      if (idx <= 0) return prev;
      const prevItem = prev[idx - 1];
      // Prevent circular: previous item must not descend from this row
      let cur: CostItem | undefined = prevItem;
      const seen = new Set<number>();
      while (cur && cur.parent_local_id) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        if (cur.parent_local_id === itemId) {
          message.warning('Nem lehet alárendelni (körhivatkozás)');
          return prev;
        }
        cur = prev.find(i => i.id === cur!.parent_local_id);
      }
      return prev.map(i => i.id === itemId ? { ...i, parent_local_id: prevItem.id } : i);
    });
  };

  const outdentCostItem = (itemId: number) => {
    setCostItems(prev => {
      const it = prev.find(i => i.id === itemId);
      if (!it || !it.parent_local_id) return prev;
      const par = prev.find(i => i.id === it.parent_local_id);
      const newParent = par ? (par.parent_local_id ?? null) : null;
      return prev.map(i => i.id === itemId ? { ...i, parent_local_id: newParent } : i);
    });
  };

  // Compute depth per cost item id
  const costDepthMap = useMemo(() => {
    const map = new Map<number, number>();
    const getDepth = (id: number | null | undefined, visited = new Set<number>()): number => {
      if (!id) return 0;
      if (visited.has(id)) return 0;
      visited.add(id);
      if (map.has(id)) return map.get(id)!;
      const it = costItems.find(i => i.id === id);
      if (!it || !it.parent_local_id) { map.set(id, 0); return 0; }
      const d = 1 + getDepth(it.parent_local_id, visited);
      map.set(id, d);
      return d;
    };
    costItems.forEach(i => getDepth(i.id));
    return map;
  }, [costItems]);

  const costTreeMeta = useMemo(() => buildCostTreeMeta(costItems), [costItems]);

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      setSubmitting(true);
      const companyId = form.getFieldValue('company_id');
      const contactIdList: any[] = form.getFieldValue('contact_ids') || [];
      const productQty = Number(v.quantity) || 1;
      let totalSelling = 0;
      costItems.forEach(item => {
        totalSelling += (Number(item.selling_unit_price) || 0) * (Number(item.quantity) || 0) * (item.is_per_unit ? productQty : 1);
      });
      const payload = {
        ...v,
        description: stripHtmlToText(v.description),
        internal_description: stripHtmlToText(v.internal_description),
        net_total_price: Number(totalSelling.toFixed(2)),
        net_unit_price: Number((productQty > 0 ? totalSelling / productQty : 0).toFixed(2)),
        is_fixed_quantity: false,
        cost_items: costItems.map((c, idx) => {
          const parentIdx = c.parent_local_id != null
            ? costItems.findIndex(x => x.id === c.parent_local_id)
            : -1;
          return ({
            type: c.type || 'other',
            ref_id: c.ref_id || null,
            name: c.name,
            quantity: Number(Number(c.quantity).toFixed(4)) || 0,
            unit: c.unit || 'db',
            unit_price: Number((Number(c.selling_unit_price) || 0).toFixed(4)),
            selling_unit_price: Number((Number(c.selling_unit_price) || 0).toFixed(4)),
            cost_price: Number((Number(c.cost_price) || 0).toFixed(4)),
            markup_percent: Number((Number(c.markup_percent) || 0).toFixed(4)),
            selling_price: Number((Number(c.selling_price) || 0).toFixed(4)),
            status: c.status || 'new',
            notes: c.notes || '',
            is_per_unit: c.is_per_unit || false,
            supplier: c.supplier_id || null,
            department: c.department_id || null,
            is_internal: c.is_internal || false,
            currency: c.currency || 'HUF',
            sort_order: idx,
            parent_index: parentIdx >= 0 ? parentIdx : null,
          });
        }),
        allowed_companies: companyId ? [String(companyId)] : [],
        allowed_contacts: contactIdList.map(cid => String(cid)),
        contact: null,
        is_private_person: false,
        date: v.date ? dayjs(v.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        deadline: v.deadline ? dayjs(v.deadline).format('YYYY-MM-DD') : dayjs().add(14, 'day').format('YYYY-MM-DD'),
      };
      await manufacturingService.updateProduct(Number(id), payload);
      message.success('Mentve');
      loadProduct();
    } catch (e: any) {
      console.error(e);
      if (e.response?.data) message.error(`Mentési hiba: ${JSON.stringify(e.response.data)}`);
      else if (!e.errorFields) message.error('Mentés sikertelen');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusDropdownOpen(false);
    try {
      await manufacturingService.updateProduct(Number(id), { status: newStatus });
      form.setFieldValue('status', newStatus);
      setProduct((prev: any) => ({ ...prev, status: newStatus }));
      message.success('Státusz módosítva');
    } catch {
      message.error('Nem sikerült a státuszt módosítani');
    }
  };

  // ── Cost columns ───────────────────────────────────────────────────────────

  const costSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onCostDragEnd = (e: DragEndEvent) => {
    const { active, over, delta } = e;
    if (!over) return;
    const dx = delta?.x || 0;
    if (active.id === over.id && Math.abs(dx) < 8) return;
    setCostItems(prev => applyCostDnd(prev, Number(active.id), Number(over.id), dx, 16));
  };

  const costColumns = useMemo(() => [
    { title: '', key: 'drag', width: 28, render: () => <CostDragHandle /> },
    {
      title: '', key: 'is_per_unit', width: 40,
      render: (_: any, r: CostItem) => (
        <div title="Egységre vonatkozik?">
          <input type="checkbox" checked={!!r.is_per_unit} onChange={e => updateCostItem(r.id, 'is_per_unit', e.target.checked)} />
        </div>
      ),
    },
    {
      title: 'Megnevezés', key: 'name', width: 220,
      render: (_: any, r: CostItem) => {
        const meta = costTreeMeta.get(r.id);
        const wrap = (content: React.ReactNode) => (
          <CostTreeGuide meta={meta}>{content}</CostTreeGuide>
        );
        if (r.type === 'other') return wrap(<Input value={r.name} onChange={e => updateCostItem(r.id, 'name', e.target.value)} status={!r.name ? 'error' : ''} />);
        if (r.name && !r.ref_id) return wrap(<Tooltip title={r.name}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{r.name}</span></Tooltip>);
        const isMat = r.type === 'material';
        const list = isMat ? materials : services;
        return wrap(
          <Select showSearch optionFilterProp="label" style={{ width: '100%' }} value={r.ref_id}
            onChange={(val, opt: any) => {
              updateCostItem(r.id, 'ref_id', val);
              updateCostItem(r.id, 'name', opt.label);
              const found = list.find((x: any) => x.id === val);
              if (found) {
                const unit = found.unit || (isMat ? 'db' : 'alkalom');
                const costPrice = isMat ? (Number(found.moving_average_cost) || Number(found.net_unit_price) || 0) : (Number(found.unit_cost_price) || Number(found.unit_price) || 0);
                const mu = found.markup_percentage ? Number(found.markup_percentage) : 35;
                const sellUnit = found.unit_selling_price ? Number(found.unit_selling_price) : (costPrice > 0 ? costPrice * (1 + mu / 100) : 0);
                const qty = r.quantity || 1;
                updateCostItem(r.id, 'unit', unit);
                updateCostItem(r.id, 'cost_price', costPrice * qty);
                updateCostItem(r.id, 'markup_percent', mu);
                updateCostItem(r.id, 'selling_unit_price', sellUnit);
                updateCostItem(r.id, 'selling_price', sellUnit * qty);
              }
            }}>
            {list.map((m: any) => <Select.Option key={m.id} value={m.id} label={m.name}>{m.name}</Select.Option>)}
          </Select>
        );
      },
    },
    { title: 'Típus', dataIndex: 'type', key: 'type', width: 72, render: (t: string) => t === 'material' ? 'Anyag' : t === 'service' ? 'Szolg.' : 'Egyéb' },
    { title: 'Menny.', key: 'quantity', width: 64, render: (_: any, r: CostItem) => <NumInput value={r.quantity} onChange={v => updateCostItem(r.id, 'quantity', v)} min={0} controls={false} /> },
    { title: 'Egység', key: 'unit', width: 60, render: (_: any, r: CostItem) => r.type === 'other' ? <Input value={r.unit} onChange={e => updateCostItem(r.id, 'unit', e.target.value)} /> : r.unit },
    {
      title: 'Beszállító', key: 'supplier_id', width: 130,
      render: (_: any, r: CostItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={r.is_internal} onChange={e => { updateCostItem(r.id, 'is_internal', e.target.checked); updateCostItem(r.id, 'department_id', null); updateCostItem(r.id, 'supplier_id', null); }}>Belső</Checkbox>
          {r.is_internal ? (
            <Select style={{ width: '100%' }} value={r.department_id} onChange={v => updateCostItem(r.id, 'department_id', v)} allowClear placeholder="Válassz részleget">
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          ) : (
            <Select style={{ width: '100%' }} value={r.supplier_id} onChange={v => updateCostItem(r.id, 'supplier_id', v)} allowClear showSearch optionFilterProp="label" status={!r.supplier_id ? 'error' : ''} placeholder="Válassz beszállítót"
              dropdownRender={menu => (<>{menu}<div style={{ padding: 8, borderTop: '1px solid #e8e8e8' }}><Button type="link" icon={<PlusOutlined />} block onClick={() => window.open('/crm/companies?action=create&preset=supplier', '_blank')}>Új beszállító</Button></div></>)}>
              {suppliers.map(s => <Select.Option key={s.id} value={s.id} label={s.name}>{s.name}</Select.Option>)}
            </Select>
          )}
        </div>
      ),
    },
    {
      title: 'Státusz', key: 'status', width: 110,
      render: (_: any, r: CostItem) => {
        const cur = r.status || 'new';
        const opt = COST_ITEM_STATUS_OPTIONS.find(o => o.value === cur) || COST_ITEM_STATUS_OPTIONS[0];
        return (
          <Dropdown
            trigger={['click']}
            menu={{
              items: COST_ITEM_STATUS_OPTIONS.map(o => ({
                key: o.value,
                label: <Tag color={o.color}>{o.label}</Tag>,
              })),
              onClick: ({ key }) => handleCostStatusChange(r.id, String(key)),
            }}
          >
            <Tag color={opt.color} style={{ cursor: 'pointer' }}>{opt.label}</Tag>
          </Dropdown>
        );
      },
    },
    {
      title: 'Műveletek', key: 'work_actions', width: 120,
      render: (_: any, r: CostItem) => (
        <Space size="small">
          <Tooltip title="Munkaóra indítása">
            <Button size="small" icon={<FieldTimeOutlined />} onClick={() => handleCostStartTimer(r.id)} />
          </Tooltip>
          <Tooltip title="Megjegyzés szerkesztése">
            <Button size="small" type={r.notes ? 'primary' : 'default'} icon={<MessageOutlined />} onClick={() => handleCostNoteEdit(r)} />
          </Tooltip>
          <Tooltip title="Munkalap nyomtatása">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => handleCostPrintWorksheet(r.id)} />
          </Tooltip>
        </Space>
      ),
    },
    { title: '', key: 'dup', width: 40, render: (_: any, r: CostItem) => <Button size="small" icon={<CopyOutlined />} title="Másolás" onClick={() => setCostItems(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: Date.now() + Math.random() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    })} /> },
    { title: '', key: 'action', width: 50, render: (_: any, r: CostItem) => <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setCostItems(prev => prev.filter(x => x.id !== r.id))} /> },
  ], [materials, services, suppliers, departments, costItems, costTreeMeta, handleCostStatusChange, handleCostNoteEdit, handleCostPrintWorksheet, handleCostStartTimer]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!product) return <div style={{ padding: 40 }}>Termék nem található.</div>;

  const { quantity } = displayedTotals;

  const statusMenuItems = Object.entries(STATUS_LABELS)
    .filter(([key]) => key !== watchedStatus)
    .map(([key, label]) => ({
      key,
      label: <Tag color={STATUS_COLORS[key] || 'default'}>{label}</Tag>,
      onClick: () => handleStatusChange(key),
    }));

  return (
    <div style={{ padding: '16px 24px' }}>
      <Card
        title={
          <Space>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/manufacturing/products')}>Vissza</Button>
            <span>Egyedi gyártás – {product.code || product.name}</span>
          </Space>
        }
        extra={
          <Space>
            <Dropdown
              menu={{ items: statusMenuItems }}
              open={statusDropdownOpen}
              onOpenChange={o => { if (!o) setStatusDropdownOpen(false); }}
              trigger={[]}
            >
              <Tag
                color={STATUS_COLORS[watchedStatus] || 'default'}
                style={{ cursor: 'pointer', userSelect: 'none', fontSize: 13, padding: '3px 10px' }}
                onClick={e => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
              >
                {STATUS_LABELS[watchedStatus] || watchedStatus || '-'}
              </Tag>
            </Dropdown>
            <Popconfirm title="Biztosan törlöd?" onConfirm={async () => { try { await manufacturingService.deleteProduct(Number(id)); message.success('Törölve'); navigate('/manufacturing/products'); } catch { message.error('Törlés sikertelen'); } }}>
              <Button danger>Törlés</Button>
            </Popconfirm>
            <Button type="primary" loading={submitting} onClick={handleSave}>Mentés</Button>
          </Space>
        }
      >
        <Form layout="vertical" form={form} size="small">
          {/* hidden status field */}
          <Form.Item name="status" initialValue="quote_request_open" noStyle>
            <Input type="hidden" style={{ display: 'none' }} />
          </Form.Item>

          {/* ── Alap adatok ───────────────────────────────────────────────── */}
          <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={14}>
                <Form.Item label="Név" name="name" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={7}>
                <Form.Item label="Cikkszám" name="code" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                  <Input onBlur={handleCodeBlur} />
                </Form.Item>
              </Col>
              <Col xs={24} md={3} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <Button
                  size="small"
                  onClick={() => {
                    const name = form.getFieldValue('name') || '';
                    const companyId = form.getFieldValue('company_id');
                    let base = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GEN';
                    let custPart = '';
                    if (companyId) {
                      const c = customers.find((x: any) => x.id === companyId);
                      if (c?.name) custPart = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '');
                    }
                    const prefix = custPart ? `${base}-${custPart}` : base;
                    const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
                    let maxNum = 0;
                    existingProducts.forEach(p => { if (p.id === Number(id)) return; const m = p.code?.match(regex); if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; } });
                    form.setFieldValue('code', `${prefix}-${(maxNum + 1).toString().padStart(3, '0')}`);
                  }}
                >Generál</Button>
              </Col>
            </Row>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={8}>
                <Form.Item label="Mennyiség" name="quantity" initialValue={1} style={{ marginBottom: 6 }}>
                  <NumInput min={0.01} style={{ width: '100%' }} onChange={() => setTimeout(calculateWeightFromDimensions, 0)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Egység" name="quantity_unit" initialValue="db" style={{ marginBottom: 6 }}>
                  <Input placeholder="pl. db" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ── Ügyfél ────────────────────────────────────────────────────── */}
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={8}>
                <Form.Item label="Cég" name="company_id" style={{ marginBottom: 6 }}>
                  <Select disabled showSearch optionFilterProp="label" placeholder="–">
                    {(customers || []).map((c: any) => <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item label="Kapcsolattartók" name="contact_ids" style={{ marginBottom: 6 }}>
                  <Select disabled mode="multiple" optionFilterProp="label" placeholder="–"
                    options={(contacts || []).map((p: any, idx: number) => ({
                      value: String(p.id ?? idx),
                      label: [p.last_name, p.first_name].filter(Boolean).join(' ').trim() || p.name || p.email || String(idx),
                    }))} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ── Leírás ────────────────────────────────────────────────────── */}
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d48806', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leírás</div>
            <Row gutter={[8, 4]}>
              <Col span={12}>
                <Form.Item label="Leírás" name="description" style={{ marginBottom: 6 }}>
                  <Input.TextArea rows={3} onBlur={e => form.setFieldValue('description', stripHtmlToText(e.target.value))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Belső leírás" name="internal_description" style={{ marginBottom: 6 }}>
                  <Input.TextArea rows={3} onBlur={e => form.setFieldValue('internal_description', stripHtmlToText(e.target.value))} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ── Méretek és súly ───────────────────────────────────────────── */}
          <div style={{ background: '#fff0f6', border: '1px solid #ffadd2', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div
              style={{ fontSize: 11, fontWeight: 600, color: '#c41d7f', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setDimsExpanded(v => !v)}
            >
              Méretek és súly {dimsExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
            </div>
            {dimsExpanded && (
              <>
                <Row gutter={[8, 4]}>
                  <Col span={6}><Form.Item label="Szélesség" name="width" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Hosszúság" name="length" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Magasság" name="height" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Mértékegység" name="dimension_unit" initialValue="mm" style={{ marginBottom: 6 }}>
                    <Select onChange={() => calculateWeightFromDimensions()}>
                      <Select.Option value="mm">mm</Select.Option>
                      <Select.Option value="cm">cm</Select.Option>
                      <Select.Option value="m">m</Select.Option>
                    </Select>
                  </Form.Item></Col>
                </Row>
                <div style={{ marginBottom: 8 }}>
                  <Space wrap>
                    <Checkbox checked={dimensionsPerUnit} onChange={e => { setDimensionsPerUnit(e.target.checked); setTimeout(calculateWeightFromDimensions, 0); }}>Méretek egy egységre vonatkoznak</Checkbox>
                    <span>Egység térfogat: <b>{calculatedVolumes.unit.toFixed(6)} m³</b></span>
                    <span>Összes térfogat: <b>{calculatedVolumes.total.toFixed(6)} m³</b></span>
                  </Space>
                  {calculatedTotalDims && (
                    <div style={{ fontSize: 13, color: '#1890ff', marginTop: 4 }}>
                      {dimensionsPerUnit
                        ? <span>Össz. méret ({quantity} db): <b>{calculatedTotalDims.width} × {calculatedTotalDims.length} × {calculatedTotalDims.height} {calculatedTotalDims.unit}</b></span>
                        : <span>Egység méret (1/{quantity} db): <b>{calculatedTotalDims.width} × {calculatedTotalDims.length} × {calculatedTotalDims.height} {calculatedTotalDims.unit}</b></span>}
                    </div>
                  )}
                </div>
                <Row gutter={[8, 4]}>
                  <Col span={6}><Form.Item label="Fajsúly" name="specific_weight" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Fajsúly egység" name="specific_weight_unit" initialValue="kg/m3" style={{ marginBottom: 6 }}>
                    <Select onChange={() => calculateWeightFromDimensions()}>
                      <Select.Option value="kg/m3">kg/m³</Select.Option>
                      <Select.Option value="g/cm3">g/cm³</Select.Option>
                      <Select.Option value="kg/liter">kg/liter</Select.Option>
                    </Select>
                  </Form.Item></Col>
                  <Col span={6}><Form.Item label="Egység súly" name="unit_weight" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={v => calculateDimensionsFromWeight(v, true)} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Összesen súly" name="total_weight" style={{ marginBottom: 6 }}><NumInput style={{ width: '100%' }} onChange={v => calculateDimensionsFromWeight(v, false)} /></Form.Item></Col>
                </Row>
                <Row gutter={[8, 4]}>
                  <Col span={6}><Form.Item label="Súly egység" name="weight_unit" initialValue="kg" style={{ marginBottom: 6 }}>
                    <Select onChange={() => calculateWeightFromDimensions()}>
                      <Select.Option value="g">g</Select.Option>
                      <Select.Option value="kg">kg</Select.Option>
                      <Select.Option value="t">t</Select.Option>
                    </Select>
                  </Form.Item></Col>
                </Row>
              </>
            )}
          </div>

          {/* ── Anyaglista / Műveletek ─────────────────────────────────────── */}
          <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 8, padding: '8px 14px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anyaglista / Műveletek</div>
            <Row gutter={[16, 0]} style={{ marginBottom: 10 }} align="middle">
              <Col flex="auto" />
              <Col>
                <Space>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddCost('material')}>Alapanyag/Termék</Button>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddCost('service')}>Szolgáltatás</Button>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddCost('other')}>Egyéb költség</Button>
                </Space>
              </Col>
            </Row>
            <DndContext sensors={costSensors} collisionDetection={closestCenter} onDragEnd={onCostDragEnd}>
              <SortableContext items={costItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <Table
                  dataSource={costItems}
                  columns={costColumns}
                  pagination={false}
                  rowKey="id"
                  size="small"
                  components={{ body: { row: CostDraggableRow } }}
                />
              </SortableContext>
            </DndContext>
          </div>

          {/* ── Csatolmányok ──────────────────────────────────────────────── */}
          <div style={{ background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 8, padding: '8px 14px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#595959', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <PaperClipOutlined style={{ marginRight: 6 }} />Csatolmányok
            </div>
            <Row gutter={8} style={{ marginBottom: 8 }} align="middle">
              <Col>
                <Input
                  placeholder="Megjegyzés (opcionális)"
                  value={pendingRemark}
                  onChange={e => setPendingRemark(e.target.value)}
                  style={{ width: 240 }}
                  size="small"
                />
              </Col>
              <Col>
                <Upload
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    setUploadingAtt(true);
                    try {
                      const att = await manufacturingService.uploadProductAttachment(Number(id), file, pendingRemark || undefined);
                      setAttachments(prev => [...prev, att]);
                      setPendingRemark('');
                      message.success('Feltöltve');
                    } catch {
                      message.error('Feltöltés sikertelen');
                    } finally {
                      setUploadingAtt(false);
                    }
                    return false;
                  }}
                >
                  <Button size="small" icon={<UploadOutlined />} loading={uploadingAtt}>Feltöltés</Button>
                </Upload>
              </Col>
            </Row>
            <Table
              size="small"
              dataSource={attachments}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'Nincs csatolmány' }}
              columns={[
                {
                  title: 'Fájl',
                  key: 'file',
                  render: (_: any, att: any) => (
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                      <PaperClipOutlined style={{ marginRight: 4 }} />{att.file_url?.split('/').pop() || att.id}
                    </a>
                  ),
                },
                {
                  title: 'Megjegyzés',
                  key: 'remark',
                  render: (_: any, att: any) => (
                    <Input
                      defaultValue={att.remark}
                      size="small"
                      onBlur={async e => {
                        const val = e.target.value;
                        if (val !== att.remark) {
                          await manufacturingService.updateProductAttachmentRemark(Number(id), att.id, val).catch(() => {});
                          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, remark: val } : a));
                        }
                      }}
                    />
                  ),
                },
                {
                  title: 'Feltöltve',
                  dataIndex: 'created_at',
                  key: 'created_at',
                  width: 140,
                  render: (v: string) => v ? new Date(v).toLocaleString('hu-HU') : '',
                },
                {
                  title: '',
                  key: 'del',
                  width: 40,
                  render: (_: any, att: any) => (
                    <Popconfirm title="Biztosan törlöd?" onConfirm={async () => {
                      await manufacturingService.deleteProductAttachment(Number(id), att.id).catch(() => {});
                      setAttachments(prev => prev.filter(a => a.id !== att.id));
                    }}>
                      <Button danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </div>

        </Form>
      </Card>
    </div>
  );
};

export default ManufacturingProductDetail;
