import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Tabs, Input, Table, Button, Form, InputNumber, Select, Space, message, Divider, Alert, Upload, Tooltip, Collapse, Drawer, Tag, Checkbox, Row, Col, Switch, AutoComplete, Typography, Popconfirm, Grid } from 'antd';
import NumInput from '../NumInput';
import { UploadOutlined, SyncOutlined, EditOutlined, SearchOutlined, PlusOutlined, DeleteOutlined, CopyOutlined, ExclamationCircleOutlined, UpOutlined, DownOutlined, LeftOutlined, RightOutlined, AppstoreOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CostDragHandle, CostDraggableRow, applyCostDnd, buildCostTreeMeta, CostTreeGuide } from '../Manufacturing/CostDnd';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { salesService } from '../../services/salesService';
import { manufacturingService, Currency as ManuCurrency } from '../../services/manufacturingService';
import { hrService } from '../../services/hrService';
import ProductEditorModal from '../Editors/ProductEditorModal';
import ServiceEditorModal from '../Editors/ServiceEditorModal';
import ManufacturingProductEditorModal from '../Editors/ManufacturingProductEditorModal';
import ImpositionHelperModal from './ImpositionHelperModal';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import dayjs from 'dayjs';

type ConcreteItemType = 'product' | 'manufacturing' | 'service';
type ItemType = ConcreteItemType | 'all';

export interface SelectedItemPayload {
  item_type: ConcreteItemType;
  ref_id: number;
  name: string;
  code?: string;
  unit?: string;
  base_price?: number;
  quantity: number;
  net_unit_price?: number;
  vat_rate?: number;
  description?: string;
  discount_percent?: number;
  discount_amount?: number;
  cost_type?: string;
  customer_order_item?: number | null;
  files?: File[];
  fileRemarks?: Record<string, string>; // key: file.uid or file.name
  manuCostItems?: Array<{ code?: string; name: string; quantity: number; unit: string; net_unit_price: number; net_total: number; supplier?: number | null; supplier_name?: string; is_stock?: boolean }>;
  keepOpen?: boolean;
  /** Képletek tárolása (pl. { quantity: '100*1.5', net_unit_price: '200+50' }) */
  formulas?: Record<string, string | null>;
  /** Stored manufacturing product creation payload for deferred creation (new unsaved RFQ) */
  pendingManuPayload?: any;
}

interface ItemSelectorModalProps {
  open: boolean;
  defaultType?: ItemType;
  onCancel: () => void;
  onAdd: (payload: SelectedItemPayload) => Promise<any> | any;
  allowCreate?: boolean;
  mode?: 'add' | 'edit';
  initialSelection?: { item_type: ItemType; ref_id: number; name?: string; code?: string };
  initialValues?: Partial<{ quantity: number; unit: string; net_unit_price: number; cost_price: number; vat_rate: number; description: string; discount_percent: number; discount_amount: number; cost_type: string; customer_order_item: number | null }>;
  initialFormulas?: Record<string, string | null>;
  customer?: { id: any; name: string; company_id?: any };
  rfqId?: number;
  /** The RFQ's currency code (e.g. 'HUF', 'EUR'). Used to convert manu sell price to the RFQ currency. */
  rfqCurrency?: string;
  /** Full stored payload for pending (not yet API-created) manufacturing items in a new unsaved RFQ */
  initialManuPayload?: any;
  /** The quote_item id — used to load & display existing attachments in edit mode */
  quoteItemId?: number;
  /** When true, shows a "Kinek a költsége?" (cost_type) select in the item form */
  showCostTypeField?: boolean;
  /** Order items to show a "Kapcsolódó tétel" selector in the item form */
  orderItems?: Array<{ id: number; name: string }>;
  /** When true, the "Beszállítók és árkalkuláció" collapse panel is pre-opened */
  expandCosts?: boolean;
}

interface CostItem {
  id: number;
  type: 'material' | 'service' | 'other';
  ref_id?: number;
  code?: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  markup_percent: number;
  selling_unit_price: number;
  selling_price: number;
  supplier_id?: number | null;
  is_per_unit?: boolean;
  is_internal?: boolean;
  department_id?: number | null;
  currency_code?: string;
  currency_id?: number | null;
  // Sorrend & alá-felérendelés (mint a tételnél)
  sort_order?: number;
  parent_local_id?: number | null;
  // Képletek tárolása mezőnként (pl. { quantity: '100*1.5', cost_price: '200+50' })
  formulas?: Record<string, string | null>;
}

const { Search } = Input;

const defaultVat = 27;

export const ItemSelectorModal: React.FC<ItemSelectorModalProps> = ({ open, defaultType = 'product', onCancel, onAdd, allowCreate = true, mode = 'add', initialSelection, initialValues, initialFormulas, customer, rfqId, rfqCurrency, initialManuPayload, quoteItemId, showCostTypeField, orderItems, expandCosts }) => {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeKey, setActiveKey] = useState<ItemType>(defaultType);
  const [manuCollapseKeys, setManuCollapseKeys] = useState<string[]>(expandCosts ? ['costs'] : []);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [manuProducts, setManuProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [top, setTop] = useState<{product:any[]; manufacturing:any[]; service:any[]}>({product:[], manufacturing:[], service:[]});
  const [form] = Form.useForm();
  const [createError, setCreateError] = useState<string | null>(null);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [serviceEditorOpen, setServiceEditorOpen] = useState(false);
  const [manuEditorOpen, setManuEditorOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileRemarks, setPendingFileRemarks] = useState<Record<string, string>>({});
  // Képletek a fő tétel formhoz (quantity, net_unit_price, discount_percent, discount_amount)
  const [itemFormFormulas, setItemFormFormulas] = useState<Record<string, string | null>>({});

  // Inline manufacturing form state
  const [manuForm] = Form.useForm();
  const [manuSubmitting, setManuSubmitting] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<dayjs.Dayjs | null>(null);
  const [savingKeepOpen, setSavingKeepOpen] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const manuKeepOpenRef = useRef(false);
  const [impositionOpen, setImpositionOpen] = useState(false);
  const [impositionInitialPresetId, setImpositionInitialPresetId] = useState<string | null>(null);
  const [impositionPresets, setImpositionPresets] = useState<Array<{ id: string; name: string; updatedAt?: string }>>([]);
  const [impositionPresetsVersion, setImpositionPresetsVersion] = useState(0);

  const IMPOSITION_STORAGE_KEY = 'pixisys_imposition_presets_v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IMPOSITION_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setImpositionPresets(Array.isArray(list) ? list.map((p: any) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })) : []);
    } catch { setImpositionPresets([]); }
  }, [impositionPresetsVersion, impositionOpen]);

  const renameImpositionPreset = (id: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem(IMPOSITION_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = list.map((p: any) => p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p);
      localStorage.setItem(IMPOSITION_STORAGE_KEY, JSON.stringify(next));
      setImpositionPresetsVersion(v => v + 1);
    } catch {}
  };

  const deleteImpositionPreset = (id: string) => {
    try {
      const raw = localStorage.getItem(IMPOSITION_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = list.filter((p: any) => p.id !== id);
      localStorage.setItem(IMPOSITION_STORAGE_KEY, JSON.stringify(next));
      setImpositionPresetsVersion(v => v + 1);
      message.success('Törölve');
    } catch {}
  };

  const openImpositionWithPreset = (id: string | null) => {
    setImpositionInitialPresetId(id);
    setImpositionOpen(true);
  };

  const [manuExistingProducts, setManuExistingProducts] = useState<any[]>([]);

  // Manu inline — cost items and dimensions state
  const [manuCostItems, setManuCostItems] = useState<CostItem[]>([]);
  const [manuDimensionsPerUnit, setManuDimensionsPerUnit] = useState(true);
  const [manuCalculatedVolumes, setManuCalculatedVolumes] = useState({ unit: 0, total: 0 });
  const [manuCalculatedTotalDims, setManuCalculatedTotalDims] = useState<{width:number;length:number;height:number;unit:string}|null>(null);
  const [manuDisplayedTotals, setManuDisplayedTotals] = useState({ totalCost: 0, totalSelling: 0, unitCost: 0, unitSelling: 0, quantity: 1 });
  const [manuMaterials, setManuMaterials] = useState<any[]>([]);
  const [manuCostServices, setManuCostServices] = useState<any[]>([]);
  const [manuSuppliers, setManuSuppliers] = useState<any[]>([]);
  const [manuDepartments, setManuDepartments] = useState<any[]>([]);
  const [manuDefaultMarkup, setManuDefaultMarkup] = useState(30);
  const [manuDefaultMarkupActive, setManuDefaultMarkupActive] = useState(false);
  const [manuPriceFromCalc, setManuPriceFromCalc] = useState(true);
  const [manuCreatedId, setManuCreatedId] = useState<number | null>(null);
  const [manuPendingFiles, setManuPendingFiles] = useState<File[]>([]);
  const [manuPendingFileRemarks, setManuPendingFileRemarks] = useState<Record<string, string>>({});
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  // Currency state for the inline manu form
  const [manuCurrencies, setManuCurrencies] = useState<ManuCurrency[]>([]);
  const [manuSellCurrencyCode, setManuSellCurrencyCode] = useState<string>('HUF');
  const [manuSellCurrencyId, setManuSellCurrencyId] = useState<number | null>(null);
  // Cost-side currency (prices in the cost panel are entered in this currency)
  const [manuCostCurrencyCode, setManuCostCurrencyCode] = useState<string>('HUF');
  const [manuCostCurrencyId, setManuCostCurrencyId] = useState<number | null>(null);

  // Unit autocomplete suggestions
  const [unitSuggestions, setUnitSuggestions] = useState<{ unit: string; count: number }[]>([]);

  // Material / service search modal for cost items
  const [costSearchModal, setCostSearchModal] = useState<{ open: boolean; type: 'material' | 'service' | null }>({ open: false, type: null });
  const [costSearchQuery, setCostSearchQuery] = useState('');
  const [costSearchEditId, setCostSearchEditId] = useState<number | null>(null); // if set, editing existing row

  const [linkedItem, setLinkedItem] = useState<{ type: 'product' | 'service'; name: string; id: number } | null>(null);
  const [linkSearchModal, setLinkSearchModal] = useState<{ open: boolean; type: 'product' | 'service' | null }>({ open: false, type: null });
  const [linkSearchQuery, setLinkSearchQuery] = useState('');

  const manuWatchQty = Form.useWatch('manu_quantity', manuForm);
  const manuWatchPrice = Form.useWatch('manu_net_unit_price', manuForm);

  const translateUnit = (unit: string | undefined | null) => {
    if (!unit) return '';
    const map: Record<string, string> = {
      'hour': 'óra',
      'minute': 'perc',
      'piece': 'db',
      'pcs': 'db',
      'day': 'nap',
    };
    return map[unit] || unit;
  };

  // Extract per-unit cost price from a product/service master record (for displaying
  // bekerülési költség / haszon / haszonkulcs on the RFQ line).
  const getRecordCostPrice = (rec: any): number => {
    if (!rec) return 0;
    return Number(rec.unit_cost_price) || Number(rec.moving_average_cost) || Number(rec.cost_price) || 0;
  };

  // Sync cost_price ↔ markup_percent ↔ net_unit_price in the line-item form.
  const handleLineFormValuesChange = (changed: any, all: any) => {
    const cost = Number(all.cost_price) || 0;
    if (cost <= 0) return;
    if ('markup_percent' in changed) {
      const mu = Math.max(0, Number(changed.markup_percent) || 0);
      const newPrice = cost * (1 + mu / 100);
      form.setFieldValue('net_unit_price', parseFloat(newPrice.toFixed(4)));
    } else if ('net_unit_price' in changed) {
      const price = Math.max(0, Number(changed.net_unit_price) || 0);
      const mu = ((price / cost) - 1) * 100;
      form.setFieldValue('markup_percent', parseFloat(mu.toFixed(2)));
    } else if ('cost_price' in changed) {
      // If user edits cost manually (rare), recompute markup from current price
      const price = Number(all.net_unit_price) || 0;
      if (price > 0) {
        const mu = ((price / cost) - 1) * 100;
        form.setFieldValue('markup_percent', parseFloat(mu.toFixed(2)));
      }
    }
  };

  useEffect(() => {
    const channel = new BroadcastChannel('pixi_rfq_item_creation');
    channel.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'ITEM_CREATED') {
         const { item, itemType } = data;
         setActiveKey(itemType);
         
         // Update lists
         if (itemType === 'product') setProducts(prev => [item, ...prev]);
         else if (itemType === 'service') setServices(prev => [item, ...prev]);
         else if (itemType === 'manufacturing') setManuProducts(prev => [item, ...prev]);
         
         setSelected(item);
         
         let unit = item.unit || item.quantity_unit || (itemType === 'service' ? 'óra' : 'db');
         unit = translateUnit(unit);
         const price = item.base_price ?? item.net_unit_price ?? item.unit_selling_price ?? 0;
         const cost = getRecordCostPrice(item);
         const markup = (price > 0 && cost > 0) ? parseFloat((((price / cost) - 1) * 100).toFixed(2)) : 0;
         form.setFieldsValue({ unit, net_unit_price: price, cost_price: cost, markup_percent: markup });
      }
    };
    return () => channel.close();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => {
    const productQty = manuForm.getFieldValue('manu_quantity') || 1;
    // Convert cost-side totals to base currency: each row uses its own exchange rate
    let tc_base = 0;
    let ts_base = 0;
    manuCostItems.forEach(item => {
      const itemSelling = Number(item.selling_unit_price) || 0;
      const itemQty = Number(item.quantity) || 0;
      const itemCost = Number(item.cost_price) || 0;
      const multiplier = item.is_per_unit ? productQty : 1;
      const rowCurrObj = item.currency_code
        ? manuCurrencies.find(c => c.id === item.currency_id || c.code.toUpperCase() === item.currency_code!.toUpperCase())
        : (manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode));
      const rowRate = (rowCurrObj && rowCurrObj.exchange_rate > 0) ? rowCurrObj.exchange_rate : 1;
      tc_base += (itemCost * itemQty * multiplier) * rowRate;
      ts_base += (itemSelling * itemQty * multiplier) * rowRate;
    });
    const costCurrObj = manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode);
    const costExchRate = (costCurrObj && costCurrObj.exchange_rate > 0) ? costCurrObj.exchange_rate : 1;
    const unitSelling = productQty > 0 ? ts_base / productQty : 0;
    setManuDisplayedTotals({
      totalCost: tc_base,
      totalSelling: ts_base,
      unitCost: productQty > 0 ? tc_base / productQty : 0,
      unitSelling,
      quantity: productQty,
    });
    if (manuPriceFromCalc) {
      const q = manuForm.getFieldValue('manu_quantity') || 1;
      // If selling currency has exchange_rate > 1 (i.e. non-base), convert base total to that currency
      const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
      const exchRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
      const unitSellingConverted = exchRate !== 1 ? parseFloat((unitSelling / exchRate).toFixed(2)) : parseFloat(unitSelling.toFixed(2));
      manuForm.setFieldsValue({
        manu_net_unit_price: unitSellingConverted,
        manu_net_total: parseFloat((unitSellingConverted * q).toFixed(2)),
      });
    }
  }, [manuCostItems, manuPriceFromCalc, manuSellCurrencyCode, manuSellCurrencyId, manuCostCurrencyCode, manuCostCurrencyId, manuCurrencies]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setActiveKey(mode === 'edit' && initialSelection?.item_type ? initialSelection.item_type : defaultType);
    setManuCollapseKeys(expandCosts ? ['costs'] : []);
    setPendingFiles([]);
    setPendingFileRemarks({});
    manuForm.resetFields();
    setManuCostItems([]);
    setManuDimensionsPerUnit(true);
    setManuCalculatedVolumes({ unit: 0, total: 0 });
    setManuCalculatedTotalDims(null);
    setManuPriceFromCalc(true);
    setManuPendingFiles([]);
    setManuPendingFileRemarks({});
    setExistingAttachments([]);
    if (mode === 'edit' && quoteItemId) {
      salesService.getQuoteRequestItemAttachments(quoteItemId)
        .then((atts: any[]) => setExistingAttachments(atts || []))
        .catch(() => {});
    }
    setManuDefaultMarkup(30);
    setManuDefaultMarkupActive(false);
    setManuCreatedId(null);
    setManuSellCurrencyCode('HUF');
    setManuSellCurrencyId(null);
    setManuCostCurrencyCode('HUF');
    setManuCostCurrencyId(null);
    setLinkedItem(null);
    setLinkSearchQuery('');
    loadData();
    if (mode === 'edit') {
      if (initialValues) {
        form.setFieldsValue({
          quantity: initialValues.quantity,
          unit: initialValues.unit,
          net_unit_price: initialValues.net_unit_price,
          cost_price: initialValues.cost_price,
          vat_rate: initialValues.vat_rate ?? defaultVat,
          description: initialValues.description,
          discount_percent: initialValues.discount_percent,
          discount_amount: initialValues.discount_amount,
          cost_type: initialValues.cost_type || 'customer',
          customer_order_item: initialValues.customer_order_item ?? undefined,
        });
      }
      if (initialFormulas) {
        setItemFormFormulas(initialFormulas);
      }
    }
  }, [open, defaultType, mode, quoteItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !initialSelection) return;
    const pickFromLists = () => {
      let rec: any = null;
      if (initialSelection.item_type === 'product') {
        rec = (products || []).find((p: any) => p.id === initialSelection.ref_id);
      } else if (initialSelection.item_type === 'manufacturing') {
        rec = (manuProducts || []).find((p: any) => p.id === initialSelection.ref_id);
      } else {
        rec = (services || []).find((p: any) => p.id === initialSelection.ref_id);
      }
      if (rec) {
        setSelected(rec);
        let unit = rec.unit || rec.quantity_unit || (initialSelection.item_type === 'service' ? 'óra' : 'db');
        unit = translateUnit(unit);
        const price = rec.base_price ?? rec.net_unit_price ?? rec.unit_selling_price ?? form.getFieldValue('net_unit_price');
        const cost = getRecordCostPrice(rec);
        const priceNum = Number(price) || 0;
        const markup = (priceNum > 0 && cost > 0) ? parseFloat((((priceNum / cost) - 1) * 100).toFixed(2)) : 0;
        form.setFieldsValue({ unit, net_unit_price: price, cost_price: cost, markup_percent: markup });
      } else {
        setSelected({ id: initialSelection.ref_id, name: initialSelection.name, code: initialSelection.code });
      }
    };
    pickFromLists();
  }, [open, products, manuProducts, services, initialSelection]);

  // When editing an existing manufacturing item, fetch full product (incl. cost_items) and pre-fill the inline form
  useEffect(() => {
    if (!open) return;
    if (mode !== 'edit') return;
    if (!initialSelection || initialSelection.item_type !== 'manufacturing' || !initialSelection.ref_id) return;
    let cancelled = false;
    (async () => {
      try {
        // Pending (not yet API-created) manufacturing item — restore from stored payload
        if (initialSelection.ref_id < 0) {
          if (!initialManuPayload) return;
          const p = initialManuPayload;
          manuForm.setFieldsValue({
            name: p.name,
            code: p.code,
            description: p.description || '',
            internal_description: p.internal_description || '',
            manu_quantity: p.quantity || 1,
            quantity_unit: p.quantity_unit || 'db',
            manu_net_unit_price: p.net_unit_price || 0,
            manu_net_total: p.net_total_price || 0,
            width: p.width ?? null,
            length: p.length ?? null,
            height: p.height ?? null,
            dimension_unit: p.dimension_unit || 'mm',
            unit_weight: p.unit_weight ?? null,
            total_weight: p.total_weight ?? null,
            weight_unit: p.weight_unit || 'kg',
            specific_weight: p.specific_weight ?? null,
            specific_weight_unit: p.specific_weight_unit || 'kg/m3',
          });
          const items: CostItem[] = p._costItemsState || [];
          setManuCostItems(items);
          if (typeof p.price_from_cost_calc === 'boolean') {
            setManuPriceFromCalc(p.price_from_cost_calc);
          } else {
            setManuPriceFromCalc(items.length > 0);
          }
          if (p._currency) {
            setManuSellCurrencyCode((p._currency.code || 'HUF').toUpperCase());
            setManuSellCurrencyId(p._currency.id ?? null);
          }
          setManuCostCurrencyCode((p._costCurrency?.code || 'HUF').toUpperCase());
          setManuCostCurrencyId(p._costCurrency?.id ?? null);
          setManuCreatedId(initialSelection.ref_id); // Keep negative temp ID
          setSelected({ ...p, id: initialSelection.ref_id, __type: 'manufacturing' });
          setActiveKey('manufacturing');
          return;
        }
        const p: any = await manufacturingService.getProduct(initialSelection.ref_id);
        if (cancelled || !p) return;
        const qty = Number(p.quantity) || 1;
        const unitPrice = Number(p.net_unit_price) || 0;
        const totalPrice = Number(p.net_total_price) || (unitPrice * qty);
        // Detect whether a saved order-item price exists (used to disable auto-calc below)
        const savedPrice = (mode === 'edit' && initialValues?.net_unit_price != null && Number(initialValues.net_unit_price) > 0)
          ? Number(initialValues.net_unit_price)
          : null;
        manuForm.setFieldsValue({
          name: p.name,
          code: p.code,
          description: p.description || '',
          internal_description: p.internal_description || '',
          manu_quantity: qty,
          quantity_unit: p.quantity_unit || 'db',
          manu_net_unit_price: unitPrice,
          manu_net_total: totalPrice,
          width: p.width ?? null,
          length: p.length ?? null,
          height: p.height ?? null,
          dimension_unit: p.dimension_unit || 'mm',
          unit_weight: p.unit_weight ?? null,
          total_weight: p.total_weight ?? null,
          weight_unit: p.weight_unit || 'kg',
          specific_weight: p.specific_weight ?? null,
          specific_weight_unit: p.specific_weight_unit || 'kg/m3',
        });
        const rawCi = ((p.cost_items as any[]) || []);
        const backendIdToLocal = new Map<number, number>();
        const items: CostItem[] = rawCi.map((c: any, idx: number) => {
          const localId = c.id ?? Date.now() + idx;
          if (typeof c.id === 'number') backendIdToLocal.set(c.id, localId);
          return {
            id: localId,
            type: (c.type as any) || 'other',
            ref_id: c.ref_id || undefined,
            code: c.code || '',
            name: c.name || '',
            unit: c.unit || 'db',
            quantity: Number(c.quantity) || 0,
            unit_price: Number(c.unit_price) || 0,
            cost_price: Number(c.cost_price) || 0,
            markup_percent: Number(c.markup_percent) || 0,
            selling_unit_price: Number(c.selling_unit_price) || 0,
            selling_price: Number(c.selling_price) || 0,
            supplier_id: c.supplier ?? null,
            department_id: c.department ?? null,
            is_internal: !!c.is_internal,
            is_per_unit: !!c.is_per_unit,
            currency_code: c.currency_info?.code
              ? (c.currency_info.code as string).toUpperCase()
              : (c.currency ? (c.currency as string).toUpperCase()
                : (c.currency_code ? (c.currency_code as string).toUpperCase() : 'HUF')),
            currency_id: c.currency_info?.id ?? null,
            sort_order: typeof c.sort_order === 'number' ? c.sort_order : idx,
            parent_local_id: null as number | null,
            formulas: (c.formulas && typeof c.formulas === 'object') ? c.formulas : {},
          };
        });
        // Resolve parent local ids (second pass)
        items.forEach((m, idx) => {
          const raw = rawCi[idx];
          const pid = raw?.parent;
          if (typeof pid === 'number' && backendIdToLocal.has(pid)) {
            m.parent_local_id = backendIdToLocal.get(pid)!;
          }
        });
        items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setManuCostItems(items);
        // Restore saved checkbox state; fall back to heuristic for legacy records
        if (typeof p.price_from_cost_calc === 'boolean') {
          setManuPriceFromCalc(p.price_from_cost_calc);
        } else {
          setManuPriceFromCalc(savedPrice == null && items.length > 0);
        }
        // Restore saved currency
        if (p.currency_info) {
          setManuSellCurrencyCode((p.currency_info.code || 'HUF').toUpperCase());
          setManuSellCurrencyId(p.currency_info.id ?? null);
        } else if (p.currency) {
          setManuSellCurrencyId(p.currency);
        }
        if ((p as any).cost_currency_info) {
          setManuCostCurrencyCode(((p as any).cost_currency_info.code || 'HUF').toUpperCase());
          setManuCostCurrencyId((p as any).cost_currency_info.id ?? null);
        } else if ((p as any).cost_currency) {
          setManuCostCurrencyId((p as any).cost_currency);
        }
        setManuCreatedId(p.id);
        setSelected({ ...p, __type: 'manufacturing' });
        setActiveKey('manufacturing');
      } catch (e) {
        // ignore — form simply not pre-filled
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, initialSelection]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load warehouse materials with is_product=true filter for products
      const [prodRes, manuRes, svcRes, topProd, topManu, topSvc, matsAllRes, manuSvcsRes, suppsRes, deptsRes, currencyRes, unitSuggestionsRes] = await Promise.all([
        api.get('/warehouse/materials/?filter_type=products').then(r => r.data),
        manufacturingService.getProducts(),
        salesService.getServices(),
        salesService.getTopProducts().catch(() => []),
        salesService.getTopManufacturingProducts().catch(() => []),
        salesService.getTopServices().catch(() => []),
        api.get('/warehouse/materials/?filter_type=all&page_size=1000').then(r => r.data).catch(() => ({})),
        manufacturingService.getServices().catch(() => []),
        api.get('/crm/companies/?is_supplier=true&page_size=1000').then(r => r.data).catch(() => ({})),
        hrService.getDepartments().catch(() => []),
        manufacturingService.getCurrencies().catch(() => []),
        manufacturingService.getUnitSuggestions().catch(() => []),
      ]);
      
      let pList = prodRes.results ?? prodRes;
      let mList = (manuRes as any).results ?? manuRes;

      // Filter by Customer (Multi-Client Visibility)
      mList = mList.filter((p: any) => {
          // p.allowed_companies stores local IDs (integers) in standard API response, 
          // BUT we might have injected 'allowed_companies_data' which contains external UUIDs.
          // Or we updated the serializer to return a list of Mixed IDs?
          
          // Let's rely on allowed_companies_data if available (rich objects), else allowed_companies.
          // Note: The Serializer now returns 'allowed_companies_data' with {id: "UUID or Int"}.
          
          let validIds: any[] = [];
          if (p.allowed_companies_data && Array.isArray(p.allowed_companies_data)) {
              validIds = p.allowed_companies_data.map((c: any) => String(c.id));
          } else if (p.allowed_companies && Array.isArray(p.allowed_companies)) {
              validIds = p.allowed_companies.map((id: any) => String(id));
          }

          const restricted = validIds.length > 0;
          
          if (!restricted) return true; // Public product
          
          if (!customer) return false; // Restricted product, but no customer context -> hide
          
          const custId = String(customer.id);
          const custCompanyId = customer.company_id ? String(customer.company_id) : null; // PixInvoice often has both
          
          return validIds.includes(custId) || (custCompanyId && validIds.includes(custCompanyId));
      });

      let sList = svcRes.results ?? svcRes;

      // Handle specific item for editing
      if (initialSelection && initialSelection.ref_id) {
          try {
              if (initialSelection.item_type === 'service') {
                  const exists = sList.find((s: any) => s.id === initialSelection.ref_id);
                  if (!exists) {
                      const s = await salesService.getService(initialSelection.ref_id);
                      if (s) sList = [s, ...sList];
                  }
              } else if (initialSelection.item_type === 'manufacturing') {
                  const exists = mList.find((m: any) => m.id === initialSelection.ref_id);
                  if (!exists) {
                      const m = await manufacturingService.getProduct(initialSelection.ref_id);
                      if (m) mList = [m, ...mList];
                  }
              } else if (initialSelection.item_type === 'product') {
                  const exists = pList.find((p: any) => p.id === initialSelection.ref_id);
                  if (!exists) {
                      const p = await api.get(`/warehouse/materials/${initialSelection.ref_id}/`).then(r => r.data);
                      if (p) pList = [p, ...pList];
                  }
              }
          } catch (e) { console.error('Error fetching specific item', e); }
      }

      setProducts(pList);
      setManuProducts(mList);
      setServices(sList);
      setTop({ product: topProd as any[], manufacturing: topManu as any[], service: topSvc as any[] });
      // Keep a full (unfiltered) list for article number collision check
      setManuExistingProducts(mList);
      // Cost item resources for inline manu form
      const rawMats = (matsAllRes as any).results ?? (matsAllRes as any) ?? [];
      setManuMaterials(Array.isArray(rawMats) ? rawMats.map((m: any) => ({ ...m, name: m.code ? `[${m.code}] ${m.name}` : m.name })) : []);
      const manuSvcList = (manuSvcsRes as any).results ?? manuSvcsRes ?? [];
      setManuCostServices(Array.isArray(manuSvcList) ? manuSvcList : []);
      const rawSupps = (suppsRes as any).results ?? suppsRes ?? [];
      setManuSuppliers(Array.isArray(rawSupps) ? rawSupps.sort((a: any, b: any) => a.name.localeCompare(b.name)) : []);
      const deptList = (deptsRes as any).results ?? deptsRes ?? [];
      setManuDepartments(Array.isArray(deptList) ? deptList : []);
      // Currencies
      const currList: ManuCurrency[] = Array.isArray(currencyRes) ? currencyRes : [];
      setManuCurrencies(currList);
      // Unit suggestions
      setUnitSuggestions(Array.isArray(unitSuggestionsRes) ? unitSuggestionsRes : []);
      // Set default currency if not yet set
      const defCurr = currList.find(c => c.is_default);
      if (defCurr) {
        setManuSellCurrencyCode(defCurr.code.toUpperCase());
        setManuSellCurrencyId(defCurr.id);
        setManuCostCurrencyCode(defCurr.code.toUpperCase());
        setManuCostCurrencyId(defCurr.id);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterFn = (r: any, fields: string[]) => {
      if (!q) return true;
      const matches = fields.some((f) => {
        const val = r[f];
        if (val === null || val === undefined) return false;
        const strVal = String(val).toLowerCase();
        const result = strVal.includes(q);
        return result;
      });
      return matches;
    };
    const mergeTopFront = (arr: any[], tops: any[], idKey: string = 'id') => {
      if (!tops || !tops.length || q) return arr;
      const topIds = new Set(tops.map((t: any) => t[idKey] ?? t.id));
      const prefixed = tops.concat(arr.filter((r) => !topIds.has(r[idKey] ?? r.id)));
      return prefixed;
    };
    const prod = mergeTopFront(products.filter((r) => filterFn(r, ['code', 'name', 'description', 'unit'])), top.product);
    const manu = mergeTopFront(manuProducts.filter((r) => filterFn(r, ['name', 'description', 'product_class_name', 'contact_company_name'])), top.manufacturing);
    const svc = mergeTopFront(services.filter((r) => filterFn(r, ['code', 'name', 'description', 'unit'])), top.service);
    const all = [
      ...prod.map((r: any) => ({ ...r, __type: 'product' })),
      ...manu.map((r: any) => ({ ...r, __type: 'manufacturing' })),
      ...svc.map((r: any) => ({ ...r, __type: 'service' })),
    ];
    return {
      product: prod,
      manufacturing: manu,
      service: svc,
      all,
    } as Record<ItemType, any[]>;
  }, [products, manuProducts, services, search, top]);

  const commonFields = (
    <>
      <Space style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {showCostTypeField && (
          <Form.Item label="Kinek a költsége?" name="cost_type" initialValue="customer" style={{ marginBottom: 8 }}>
            <Select
              style={{ width: 180 }}
              options={[
                { value: 'customer', label: 'Ügyfél költsége' },
                { value: 'own', label: 'Saját költség' },
              ]}
            />
          </Form.Item>
        )}
        {orderItems && orderItems.length > 0 && (
          <Form.Item label="Kapcsolódó tétel" name="customer_order_item" style={{ marginBottom: 8 }}>
            <Select
              allowClear
              placeholder="Opcionális..."
              style={{ width: 240 }}
              options={orderItems.map((it: any) => {
                const label = it.manufacturing_product_name || it.product_name || it.service_name || it.material_name || it.name || `Tétel #${it.id}`;
                return { value: it.id, label };
              })}
            />
          </Form.Item>
        )}
        <Form.Item label="Mennyiség" name="quantity" initialValue={1} rules={[{ required: true }]} style={{ marginBottom: 8 }}> 
          <NumInput 
            formula
            min={0.01} 
            step={1} 
            style={{ width: 120 }}
            initialFormula={itemFormFormulas.quantity ?? undefined}
            onFormulaChange={f => setItemFormFormulas(prev => ({ ...prev, quantity: f }))}
            onBlur={(e) => {
                 const value = parseFloat(e.target.value.replace(',', '.'));
                 const currentType = (activeKey === 'all' ? (selected?.__type as any) : activeKey);
                 if (selected && currentType === 'manufacturing' && selected.is_fixed_quantity) {
                      const fixedQty = Number(selected.quantity);
                      if (fixedQty > 0 && !isNaN(value)) {
                           const multiples = Math.ceil(value / fixedQty);
                           // Ensure at least 1 multiple if value > 0
                           const finalMultiples = multiples === 0 && value > 0 ? 1 : multiples;
                           const newValue = finalMultiples * fixedQty;
                           if (newValue !== value) {
                                form.setFieldValue('quantity', newValue);
                           }
                      }
                 }
            }}
          />
        </Form.Item>
        <Form.Item label="Egység" name="unit" style={{ marginBottom: 8 }}> 
          <Input disabled style={{ width: 100 }} />
        </Form.Item>
        <Form.Item label="Nettó egységár" name="net_unit_price" style={{ marginBottom: 8 }}> 
          <NumInput formula min={0} step={1} style={{ width: 160 }} initialFormula={itemFormFormulas.net_unit_price ?? undefined} onFormulaChange={f => setItemFormFormulas(prev => ({ ...prev, net_unit_price: f }))} />
        </Form.Item>
        {(() => {
          const currentType = (activeKey === 'all' ? (selected?.__type as any) : activeKey);
          if (currentType !== 'product' && currentType !== 'service') return null;
          return (
            <>
              <Form.Item label="Bek. egységár" name="cost_price" style={{ marginBottom: 8 }}>
                <NumInput formula min={0} step={1} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item label="Haszon%" name="markup_percent" style={{ marginBottom: 8 }}>
                <NumInput formula min={0} step={1} precision={2} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item label="Haszon" shouldUpdate style={{ marginBottom: 8 }}>
                {() => {
                  const qty = Number(form.getFieldValue('quantity') || 0);
                  const price = Number(form.getFieldValue('net_unit_price') || 0);
                  const cost = Number(form.getFieldValue('cost_price') || 0);
                  const profit = (price - cost) * qty;
                  return <Input value={profit.toFixed(2)} readOnly style={{ width: 140 }} />;
                }}
              </Form.Item>
            </>
          );
        })()}
        <Form.Item label="ÁFA %" name="vat_rate" initialValue={defaultVat} style={{ marginBottom: 8 }}> 
          <NumInput formula min={0} step={1} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item label="Nettó összesen" shouldUpdate style={{ marginBottom: 8 }}>
          {() => {
            const qty = Number(form.getFieldValue('quantity') || 0);
            const price = Number(form.getFieldValue('net_unit_price') || 0);
            return <Input value={(qty * price).toFixed(2)} readOnly style={{ width: 160 }} />;
          }}
        </Form.Item>
        <Form.Item label="Pénznem" name="currency" initialValue="HUF" style={{ marginBottom: 8 }}>
          <Select style={{ width: 120 }} options={[{ value: 'HUF', label: 'HUF' }]} />
        </Form.Item>
      </Space>
      <Space direction="vertical" style={{ width: '100%', gap: 8 }}>
        <Form.Item label="Megjegyzés" name="description" style={{ marginBottom: 8 }}> 
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
        </Form.Item>
        {existingAttachments.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Meglévő csatolmányok:</div>
            {existingAttachments.map((att: any) => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Button type="link" size="small" style={{ padding: 0 }} href={att.file_url || att.file} target="_blank" rel="noopener noreferrer">{att.file?.split('/').pop() || `#${att.id}`}</Button>
                {att.remark && <span style={{ color: '#888', fontSize: 12 }}>{att.remark}</span>}
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={async () => {
                    if (!quoteItemId) return;
                    try {
                      await salesService.deleteQuoteRequestItemAttachment(quoteItemId, att.id);
                      setExistingAttachments(prev => prev.filter((a: any) => a.id !== att.id));
                    } catch { message.error('Nem sikerült törölni'); }
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {(
        <Upload.Dragger
          name="files"
          multiple
          showUploadList
          beforeUpload={(file) => { setPendingFiles((prev) => [...prev, file]); return false; }}
          fileList={pendingFiles as any}
          onRemove={(f) => {
            const uid = (f as any)?.uid;
              const key = uid || (f as any)?.name;
              setPendingFiles((prev) => prev.filter((x: any) => (x as any).uid ? (x as any).uid !== uid : (x as any).name !== (f as any).name));
              setPendingFileRemarks((prev) => {
                const { [key]: _, ...rest } = prev;
                return rest;
              });
          }}
          style={{ padding: 8 }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a tallózáshoz</p>
        </Upload.Dragger>
        )}
        {pendingFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFiles.map((f: any) => {
              const key = (f as any)?.uid || (f as any)?.name;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(f as any)?.name}</span>
                  <Input placeholder="Megjegyzés ehhez a fájlhoz" value={pendingFileRemarks[key] || ''} onChange={(e) => setPendingFileRemarks((prev) => ({ ...prev, [key]: e.target.value }))} />
                </div>
              );
            })}
          </div>
        )}
        <Space style={{ gap: 12, flexWrap: 'wrap' }}>
          <Form.Item label="Kedvezmény %" name="discount_percent" style={{ marginBottom: 8 }}>
            <NumInput formula min={0} max={100} style={{ width: 120 }} initialFormula={itemFormFormulas.discount_percent ?? undefined} onFormulaChange={f => setItemFormFormulas(prev => ({ ...prev, discount_percent: f }))} />
          </Form.Item>
          <Form.Item label="Kedvezmény (fix)" name="discount_amount" style={{ marginBottom: 8 }}>
            <NumInput formula min={0} style={{ width: 160 }} initialFormula={itemFormFormulas.discount_amount ?? undefined} onFormulaChange={f => setItemFormFormulas(prev => ({ ...prev, discount_amount: f }))} />
          </Form.Item>
          <Form.Item label="Kedvezményes nettó összesen" shouldUpdate style={{ marginBottom: 8 }}>
            {() => {
              const qty = Number(form.getFieldValue('quantity') || 0);
              const price = Number(form.getFieldValue('net_unit_price') || 0);
              const pct = Number(form.getFieldValue('discount_percent') || 0);
              const amt = Number(form.getFieldValue('discount_amount') || 0);
              const net = qty * price;
              let discounted = net;
              if (pct > 0) discounted = discounted * (1 - pct / 100);
              if (amt > 0) discounted = Math.max(0, discounted - amt);
              const perUnit = qty > 0 ? discounted / qty : 0;
              const unit = form.getFieldValue('unit') || 'db';
              const totalStr = Math.round(discounted).toLocaleString('hu-HU');
              const perStr = Math.round(perUnit).toLocaleString('hu-HU');
              const display = `${totalStr} (${perStr}/${unit})`;
              return <Input value={display} readOnly style={{ width: 260 }} />;
            }}
          </Form.Item>
        </Space>
      </Space>
    </>
  );

  const [selected, setSelected] = useState<any | null>(null);

  const handleRowClick = (record: any) => {
    setSelected(record);
    const currentType = (activeKey === 'all' ? (record.__type as any) : activeKey);
    let unit = record.unit || record.quantity_unit || (currentType === 'service' ? 'óra' : 'db');
    unit = translateUnit(unit);
    let price = record.base_price ?? record.net_unit_price ?? record.unit_selling_price ?? 0;

    let qty = 1;
    if (currentType === 'manufacturing') {
        if (record.is_fixed_quantity) {
            qty = Number(record.quantity);
        } else {
             // For non-fixed qty, ensure we use the unit price derived from total/qty if available, 
             // to be safe against older records where net_unit_price might be off, 
             // but prefer stored net_unit_price if valid.
             // User requested: "számolja vissza az árat 1 db-ra"
             if (Number(record.quantity) > 0 && Number(record.net_total_price) > 0) {
                  price = Number(record.net_total_price) / Number(record.quantity);
             }
        }
    }

    const cost = getRecordCostPrice(record);
    const priceNum = Number(price) || 0;
    const markup = (priceNum > 0 && cost > 0) ? parseFloat((((priceNum / cost) - 1) * 100).toFixed(2)) : 0;
    form.setFieldsValue({ unit, net_unit_price: price, quantity: qty, cost_price: cost, markup_percent: markup, description: record.description || '' });

    // For services: preload cost_items_data as sub-items
    if (currentType === 'service') {
      const rawCi: any[] = record.cost_items_data || [];
      const items: CostItem[] = rawCi.map((c: any) => {
        // Ensure department is in manuDepartments list
        if (c.is_internal && c.department && !manuDepartments.find((d: any) => d.id === c.department)) {
          const deptObj = { id: c.department, name: c.department_name || `#${c.department}` };
          setManuDepartments(prev => [deptObj, ...prev]);
        }
        // Ensure supplier is in manuSuppliers list
        if (!c.is_internal && c.supplier && !manuSuppliers.find((s: any) => s.id === c.supplier)) {
          const supObj = { id: c.supplier, name: c.supplier_name || `#${c.supplier}` };
          setManuSuppliers(prev => [supObj, ...prev]);
        }
        return {
          id: Date.now() + Math.random(),
          type: 'service' as const,
          ref_id: record.id,
          name: c.name || record.name,
          unit: c.unit || unit,
          quantity: Number(c.price_quantity) || 1,
          unit_price: Number(c.unit_price) || 0,
          cost_price: Number(c.unit_price) || 0,
          markup_percent: Number(c.markup_percentage) || 0,
          selling_unit_price: Number(c.selling_price) || 0,
          selling_price: Number(c.selling_price) || 0,
          is_per_unit: false,
          is_internal: !!c.is_internal,
          supplier_id: c.is_internal ? null : (c.supplier ?? null),
          department_id: c.is_internal ? (c.department ?? null) : null,
          currency_code: c.currency || manuCostCurrencyCode,
          currency_id: manuCostCurrencyId,
        };
      });
      setManuCostItems(items);
    } else if (currentType !== 'manufacturing') {
      setManuCostItems([]);
    }
  };

  const confirmAdd = async (keepOpen: boolean = false) => {
    try {
      if (!selected) {
        message.warning('Válassz egy tételt a listából');
        return;
      }
      const v = await form.validateFields();
      const concreteType = (activeKey === 'all' ? (selected as any).__type : (activeKey as any));
      const payload: SelectedItemPayload = {
        item_type: concreteType,
        ref_id: selected.id,
        name: selected.name,
        code: selected.code,
        unit: v.unit,
        base_price: selected.base_price ?? selected.net_unit_price ?? selected.unit_selling_price,
        quantity: v.quantity,
        net_unit_price: v.net_unit_price,
        vat_rate: v.vat_rate,
        description: v.description,
        discount_percent: v.discount_percent,
        discount_amount: v.discount_amount,
        cost_type: v.cost_type || 'customer',
        customer_order_item: v.customer_order_item ?? null,
      };
      // For services with sub-items, include manuCostItems so the RFQ handler can create costs
      const extraPayload: any = { files: pendingFiles, fileRemarks: pendingFileRemarks, keepOpen, formulas: itemFormFormulas };
      if (concreteType === 'service' && manuCostItems.length > 0) {
        extraPayload.manuCostItems = manuCostItems;
      }
      await onAdd({ ...payload, ...extraPayload } as any);
      setLastSavedAt(dayjs());
      if (!keepOpen) {
        setPendingFiles([]);
        setPendingFileRemarks({});
        form.resetFields();
        setSelected(null);
      }
    } catch (e) {
      // validation error surfaced by form
    }
  };

  const createNew = async () => {
    setCreateError(null);
    let url = '';
    // Open proper pages in new tab
    if (activeKey === 'product') {
      url = '/warehouse/materials?create=true&from_rfq=true';
    } else if (activeKey === 'service') {
      url = '/manufacturing/services?create=true&from_rfq=true';
    } else {
      url = '/manufacturing/products?create=true&from_rfq=true';
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  // Save inline manufacturing product and add to RFQ
  const handleManuInlineSubmit = async (keepOpen: boolean = false) => {
    manuKeepOpenRef.current = keepOpen;
    try {
      const v = await manuForm.validateFields();
      setManuSubmitting(true);

      // In edit mode, use initialSelection.ref_id as fallback if async preload hasn't set manuCreatedId yet
      const effectiveManuId = manuCreatedId !== null
        ? manuCreatedId
        : (mode === 'edit' && initialSelection?.item_type === 'manufacturing' && initialSelection?.ref_id)
          ? initialSelection.ref_id
          : null;
      const isEdit = effectiveManuId !== null;

      if (!isEdit) {
        // Auto-generate code if empty
        if (!v.code) {
          const name = v.name || '';
          let base = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!base) base = 'EGY';
          const codes = new Set(manuExistingProducts.map((p: any) => p.code));
          let i = 1;
          let suffix = i.toString().padStart(3, '0');
          while (codes.has(`${base}-${suffix}`)) {
            i++;
            suffix = i.toString().padStart(3, '0');
            if (i > 999) break;
          }
          v.code = `${base}-${suffix}`;
        } else {
          // Increment if duplicate
          const isDuplicate = manuExistingProducts.some((p: any) => p.code && p.code.toLowerCase() === v.code.toLowerCase());
          if (isDuplicate) {
            const match = v.code.match(/^(.*?)(\d+)$/);
            if (match) {
              const prefix = match[1];
              const numStr = match[2];
              const width = Math.max(numStr.length, 3);
              const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
              let maxNum = parseInt(numStr, 10);
              manuExistingProducts.forEach((p: any) => {
                if (!p.code) return;
                const m = p.code.match(regex);
                if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
              });
              v.code = `${prefix}${(maxNum + 1).toString().padStart(width, '0')}`;
            } else {
              const prefix = v.code + '-';
              let maxNum = 0;
              const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
              manuExistingProducts.forEach((p: any) => {
                if (!p.code) return;
                const m = p.code.match(regex);
                if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
              });
              v.code = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
            }
          }
        }
      } // end if (!isEdit)

      const productQtyForPayload = v.manu_quantity || 1;
      // Always use the form field value — when manuPriceFromCalc is true the useEffect has already
      // applied per-row exchange rates and selling-currency conversion and written the result there.
      const netUnitPriceForPayload = Number(v.manu_net_unit_price) || 0;
      const netTotalPriceForPayload = netUnitPriceForPayload * productQtyForPayload;

      // Convert from manu sell currency → RFQ currency
      const _sellCurrObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode.toUpperCase());
      const _sellCurrRate = (_sellCurrObj && _sellCurrObj.exchange_rate > 0) ? _sellCurrObj.exchange_rate : 1;
      const _rfqCurrObj = rfqCurrency ? manuCurrencies.find(c => c.code.toUpperCase() === rfqCurrency.toUpperCase()) : null;
      const _rfqCurrRate = (_rfqCurrObj && _rfqCurrObj.exchange_rate > 0) ? _rfqCurrObj.exchange_rate : 1;
      const netUnitPriceForRfq = parseFloat((netUnitPriceForPayload * _sellCurrRate / _rfqCurrRate).toFixed(4));

      const payload = {
        name: v.name,
        code: v.code,
        description: v.description || '',
        internal_description: v.internal_description || '',
        quantity: productQtyForPayload,
        quantity_unit: v.quantity_unit || 'db',
        net_unit_price: netUnitPriceForPayload,
        net_total_price: netTotalPriceForPayload,
        status: 'quote_request_priced',
        allowed_companies: customer ? [customer.id] : [],
        allowed_contacts: [],
        cost_items: manuCostItems.map((c, idx) => {
          const parentIdx = c.parent_local_id != null
            ? manuCostItems.findIndex(x => x.id === c.parent_local_id)
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
            supplier: c.supplier_id || null,
            department: c.department_id || null,
            is_internal: c.is_internal || false,
            is_per_unit: c.is_per_unit || false,
            currency: (c.currency_code || 'HUF').toUpperCase(),
            sort_order: idx,
            parent_index: parentIdx >= 0 ? parentIdx : null,
            formulas: c.formulas || {},
          });
        }),
        is_fixed_quantity: false,
        price_from_cost_calc: manuPriceFromCalc,
        date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        width: v.width || null,
        length: v.length || null,
        height: v.height || null,
        dimension_unit: v.dimension_unit || 'mm',
        unit_weight: v.unit_weight || null,
        total_weight: v.total_weight || null,
        weight_unit: v.weight_unit || 'kg',
        specific_weight: v.specific_weight || null,
        specific_weight_unit: v.specific_weight_unit || 'kg/m3',
        currency: manuSellCurrencyId || null,
        cost_currency: manuCostCurrencyId || null,
      };

      if (isEdit && effectiveManuId! > 0) {
        // ── Real product: PATCH (status unchanged) ───────────────────────
        const { status: _s, ...patchPayload } = payload as any;
        const updated = await manufacturingService.patchProduct(effectiveManuId!, patchPayload);
        message.success('Egyedi gyártás mentve');
        setManuProducts(prev => prev.map((p: any) => p.id === effectiveManuId ? updated : p));
        setManuExistingProducts(prev => prev.map((p: any) => p.id === effectiveManuId ? updated : p));
        if (effectiveManuId !== manuCreatedId) setManuCreatedId(effectiveManuId);
        const unit = translateUnit(updated.quantity_unit || 'db');
        form.setFieldsValue({ unit, net_unit_price: updated.net_unit_price || 0, quantity: updated.quantity || 1 });
        setSelected({ ...updated, __type: 'manufacturing' });
        // Sync the RFQ line item with the updated manufacturing product values
        const updatedQty = Number(updated.quantity) > 0 ? Number(updated.quantity) : (productQtyForPayload || 1);
        const updatedUnitPrice = isFinite(Number(updated.net_unit_price)) ? Number(updated.net_unit_price) : netUnitPriceForPayload;
        // Convert updated price to RFQ currency
        const updatedUnitPriceForRfq = parseFloat((updatedUnitPrice * _sellCurrRate / _rfqCurrRate).toFixed(4));
        form.setFieldsValue({ unit, net_unit_price: updatedUnitPriceForRfq, quantity: updated.quantity || 1 });
        const rfqUpdatePayload: SelectedItemPayload = {
          item_type: 'manufacturing',
          ref_id: effectiveManuId!,
          name: updated.name,
          code: updated.code,
          unit,
          base_price: updatedUnitPriceForRfq,
          quantity: updatedQty,
          net_unit_price: updatedUnitPriceForRfq,
          vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
          description: updated.description || '',
          discount_percent: Number(form.getFieldValue('discount_percent')) || 0,
          discount_amount: Number(form.getFieldValue('discount_amount')) || 0,
        };
        await onAdd({ ...rfqUpdatePayload, files: manuPendingFiles, fileRemarks: manuPendingFileRemarks, keepOpen } as any);
        setManuPendingFiles([]);
        setManuPendingFileRemarks({});

      } else if (isEdit && effectiveManuId! < 0) {
        // ── Pending item update — no API call yet, just update stored payload ─
        const tempId = effectiveManuId!;
        const unit = translateUnit(v.quantity_unit || 'db');
        form.setFieldsValue({ unit, net_unit_price: netUnitPriceForRfq, quantity: productQtyForPayload });
        setSelected({ ...v, id: tempId, __type: 'manufacturing' });
        const deferredPayload = {
          ...payload,
          _costItemsState: manuCostItems,
          _currency: { id: manuSellCurrencyId, code: manuSellCurrencyCode },
          _costCurrency: { id: manuCostCurrencyId, code: manuCostCurrencyCode },
        };
        const pendingUpdatePayload = {
          item_type: 'manufacturing',
          ref_id: tempId,
          name: v.name,
          code: v.code,
          unit,
          base_price: netUnitPriceForRfq,
          quantity: productQtyForPayload,
          net_unit_price: netUnitPriceForRfq,
          vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
          description: v.description || '',
          discount_percent: Number(form.getFieldValue('discount_percent')) || 0,
          discount_amount: Number(form.getFieldValue('discount_amount')) || 0,
          pendingManuPayload: deferredPayload,
        };
        await onAdd({ ...pendingUpdatePayload, keepOpen } as any);
        message.success('Egyedi gyártás módosítva (az ajánlat mentésekor kerül a rendszerbe)');

      } else if (rfqId) {
        // ── New product, existing RFQ → create immediately ───────────────
        const created = await manufacturingService.createProduct(payload);
        message.success('Egyedi gyártás létrehozva és hozzáadva');

        setManuProducts(prev => [created, ...prev]);
        setManuExistingProducts(prev => [created, ...prev]);

        // Set code in form so it's visible and won't be regenerated on save
        manuForm.setFieldsValue({ code: created.code });

        // Fill RFQ item form (price converted to RFQ currency)
        const unit = translateUnit(created.quantity_unit || 'db');
        form.setFieldsValue({
          unit,
          net_unit_price: netUnitPriceForRfq,
          quantity: created.quantity || 1,
        });

        setSelected({ ...created, __type: 'manufacturing' });
        setManuCreatedId(created.id);

        // Build cost items shaped for QuoteRequestCost (convert each row to base currency via its exchange rate)
        const productQty = productQtyForPayload;
        const costItemsForRfq = manuCostItems.map(ci => {
          const itemQty = (Number(ci.quantity) || 0) * (ci.is_per_unit ? productQty : 1);
          const costPrice = Number(ci.cost_price) || 0;
          const rowCurrObj = ci.currency_code
            ? manuCurrencies.find(c => c.id === ci.currency_id || c.code.toUpperCase() === (ci.currency_code as string).toUpperCase())
            : manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode.toUpperCase());
          const rowRate = (rowCurrObj && rowCurrObj.exchange_rate > 0) ? rowCurrObj.exchange_rate : 1;
          const costPriceBase = costPrice * rowRate;
          return {
            code: '',
            name: `${created.code || created.name} – ${ci.name}`,
            quantity: itemQty,
            unit: ci.unit || 'db',
            net_unit_price: costPriceBase,
            net_total: itemQty * costPriceBase,
            supplier: ci.supplier_id || null,
            is_stock: false,
          };
        });

        // Add to RFQ as item via onAdd
        try {
          const rfqPayload: SelectedItemPayload = {
            item_type: 'manufacturing',
            ref_id: created.id,
            name: created.name,
            code: created.code,
            unit,
            base_price: created.net_unit_price || 0,
            quantity: created.quantity || 1,
            net_unit_price: netUnitPriceForRfq,
            vat_rate: 27,
            description: created.description || '',
            manuCostItems: costItemsForRfq,
          };
          await onAdd({ ...rfqPayload, files: manuPendingFiles, fileRemarks: manuPendingFileRemarks, keepOpen } as any);
          setManuPendingFiles([]);
          setManuPendingFileRemarks({});
        } catch (addErr) {
          message.warning('A gyártás létrejött, de az ajánlat tételhez adása nem sikerült');
        }

        // POST cost items to the QuoteRequestCost API directly
        if (costItemsForRfq.length > 0) {
          for (const ci of costItemsForRfq) {
            try {
              await salesService.createQuoteRequestCost({ ...ci, quote_request: rfqId });
            } catch (e) {
              // continue
            }
          }
        }
        // Form stays open for editing — do NOT reset

      } else {
        // ── New product, new unsaved RFQ → defer creation ────────────────
        const tempId = -Date.now();
        setManuCreatedId(tempId);
        const unit = translateUnit(v.quantity_unit || 'db');
        form.setFieldsValue({ unit, net_unit_price: netUnitPriceForRfq, quantity: productQtyForPayload });
        setSelected({ ...v, id: tempId, quantity_unit: v.quantity_unit || 'db', net_unit_price: netUnitPriceForRfq, __type: 'manufacturing' });

        // Build cost items for draft display (convert each row to base currency via its exchange rate)
        const productQty = productQtyForPayload;
        const costItemsForRfq = manuCostItems.map(ci => {
          const itemQty = (Number(ci.quantity) || 0) * (ci.is_per_unit ? productQty : 1);
          const costPrice = Number(ci.cost_price) || 0;
          const rowCurrObj = ci.currency_code
            ? manuCurrencies.find(c => c.id === ci.currency_id || c.code.toUpperCase() === (ci.currency_code as string).toUpperCase())
            : manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode.toUpperCase());
          const rowRate = (rowCurrObj && rowCurrObj.exchange_rate > 0) ? rowCurrObj.exchange_rate : 1;
          const costPriceBase = costPrice * rowRate;
          return {
            code: '',
            name: `${v.code || v.name} – ${ci.name}`,
            quantity: itemQty,
            unit: ci.unit || 'db',
            net_unit_price: costPriceBase,
            net_total: itemQty * costPriceBase,
            supplier: ci.supplier_id || null,
            is_stock: false,
          };
        });

        // Store the full creation payload (with CostItem state and currency) for later
        const deferredPayload = {
          ...payload,
          _costItemsState: manuCostItems,
          _currency: { id: manuSellCurrencyId, code: manuSellCurrencyCode },
          _costCurrency: { id: manuCostCurrencyId, code: manuCostCurrencyCode },
        };

        try {
          const rfqPayload: SelectedItemPayload = {
            item_type: 'manufacturing',
            ref_id: tempId,
            name: v.name,
            code: v.code,
            unit,
            base_price: netUnitPriceForRfq,
            quantity: productQtyForPayload,
            net_unit_price: netUnitPriceForRfq,
            vat_rate: 27,
            description: v.description || '',
            manuCostItems: costItemsForRfq,
            pendingManuPayload: deferredPayload,
          };
          await onAdd({ ...rfqPayload, files: manuPendingFiles, fileRemarks: manuPendingFileRemarks, keepOpen } as any);
          setManuPendingFiles([]);
          setManuPendingFileRemarks({});
        } catch (addErr) {
          message.warning('Egyedi gyártás hozzáadása nem sikerült');
        }
        message.success('Egyedi gyártás hozzáadva (az ajánlat mentésekor kerül a rendszerbe)');
        // Form stays open for editing — do NOT reset
      }
    } catch (e: any) {
      if (e.response?.data) {
        message.error(`Mentési hiba: ${JSON.stringify(e.response.data)}`);
      }
      // else form validation errors are shown inline
    } finally {
      setManuSubmitting(false);
      setLastSavedAt(dayjs());
    }
  };

  const manuGenerateCode = () => {
    const name = manuForm.getFieldValue('name') || '';
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'EGY';
    let custPart = '';
    if (customer?.name) {
      custPart = customer.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    const prefix = custPart ? `${base}-${custPart}` : base;
    const codes = new Set(manuExistingProducts.map((p: any) => p.code));
    let i = 1;
    let suffix = '001';
    while (codes.has(`${prefix}-${suffix}`)) {
      i++;
      suffix = i.toString().padStart(3, '0');
      if (i > 999) break;
    }
    manuForm.setFieldsValue({ code: `${prefix}-${suffix}` });
  };

  const manuCalculateWeight = () => {
    const width = manuForm.getFieldValue('width');
    const length = manuForm.getFieldValue('length');
    const height = manuForm.getFieldValue('height');
    const dimensionUnit = manuForm.getFieldValue('dimension_unit') || 'mm';
    const specificWeight = manuForm.getFieldValue('specific_weight');
    const specificWeightUnit = manuForm.getFieldValue('specific_weight_unit') || 'kg/m3';
    const qty = manuForm.getFieldValue('manu_quantity') || 1;
    if (!width && !length) { setManuCalculatedTotalDims(null); return; }
    let wM = (width || 0), lM = (length || 0), hM = (height || 0);
    if (dimensionUnit === 'mm') { wM /= 1000; lM /= 1000; hM /= 1000; }
    else if (dimensionUnit === 'cm') { wM /= 100; lM /= 100; hM /= 100; }
    const baseVol = hM > 0 ? wM * lM * hM : 0;
    let uVol = 0, tVol = 0;
    if (manuDimensionsPerUnit) {
      uVol = baseVol; tVol = baseVol * qty;
      setManuCalculatedTotalDims({ width: width || 0, length: length || 0, height: parseFloat(((height || 0) * qty).toFixed(2)), unit: dimensionUnit });
    } else {
      tVol = baseVol; uVol = qty > 0 ? baseVol / qty : 0;
      setManuCalculatedTotalDims({ width: width || 0, length: length || 0, height: parseFloat(((height || 0) / (qty || 1)).toFixed(2)), unit: dimensionUnit });
    }
    setManuCalculatedVolumes({ unit: uVol, total: tVol });
    if (specificWeight && specificWeight > 0 && uVol > 0) {
      let spKgM3 = specificWeight;
      if (specificWeightUnit === 'g/cm3' || specificWeightUnit === 'kg/liter') spKgM3 *= 1000;
      manuForm.setFieldsValue({
        total_weight: parseFloat((tVol * spKgM3).toFixed(3)),
        unit_weight: parseFloat((uVol * spKgM3).toFixed(3)),
        weight_unit: 'kg',
      });
    } else {
      const uw = manuForm.getFieldValue('unit_weight');
      if (uw && uw > 0 && !specificWeight) {
        manuForm.setFieldsValue({ total_weight: parseFloat((uw * qty).toFixed(3)) });
      }
    }
  };

  const manuUpdateCostItem = (id: number, field: string, value: any) => {
    setManuCostItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      // Clamp markup to 0 minimum
      if ('markup_percent' in updated) updated.markup_percent = Math.max(0, Number(updated.markup_percent) || 0);
      const cp = Number(updated.cost_price) || 0;
      const mu = Number(updated.markup_percent) || 0;
      const sup = Number(updated.selling_unit_price) || 0;
      const qty = Number(updated.quantity) || 1;
      if (field === 'cost_price' || field === 'markup_percent') {
        updated.selling_unit_price = Math.max(0, cp * (1 + mu / 100));
        updated.selling_price = updated.selling_unit_price * qty;
      } else if (field === 'selling_unit_price') {
        if (cp > 0) updated.markup_percent = Math.max(0, ((sup / cp) - 1) * 100);
        updated.selling_price = Math.max(0, sup) * qty;
      } else if (field === 'selling_price') {
        // Editing total → back-calculate unit price and markup
        const newTotal = Math.max(0, Number(value) || 0);
        updated.selling_price = newTotal;
        updated.selling_unit_price = qty > 0 ? newTotal / qty : newTotal;
        if (cp > 0) updated.markup_percent = Math.max(0, ((updated.selling_unit_price / cp) - 1) * 100);
      } else if (field === 'quantity') {
        updated.selling_price = sup * qty;
      }
      return updated;
    }));
  };

  const manuUpdateCostItemFormula = (id: number, field: string, formulaStr: string | null) => {
    setManuCostItems(prev => prev.map(r => r.id !== id ? r : {
      ...r,
      formulas: { ...(r.formulas || {}), [field]: formulaStr },
    }));
  };

  const manuApplyDefaultMarkup = () => {
    setManuCostItems(prev => prev.map(item => {
      const cp = Number(item.cost_price) || 0;
      const qty = Number(item.quantity) || 1;
      const sup = cp * (1 + manuDefaultMarkup / 100);
      return { ...item, markup_percent: manuDefaultMarkup, selling_unit_price: sup, selling_price: sup * qty };
    }));
  };

  // ── Cost items ordering & nesting helpers (alá-felé rendelés) ──────────
  const manuMoveCostItem = (itemId: number, dir: -1 | 1) => {
    setManuCostItems(prev => {
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

  const manuIndentCostItem = (itemId: number) => {
    setManuCostItems(prev => {
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

  const manuOutdentCostItem = (itemId: number) => {
    setManuCostItems(prev => {
      const it = prev.find(i => i.id === itemId);
      if (!it || !it.parent_local_id) return prev;
      const par = prev.find(i => i.id === it.parent_local_id);
      const newParent = par ? (par.parent_local_id ?? null) : null;
      return prev.map(i => i.id === itemId ? { ...i, parent_local_id: newParent } : i);
    });
  };

  const manuCostDepthMap = useMemo(() => {
    const map = new Map<number, number>();
    const getDepth = (id: number | null | undefined, visited = new Set<number>()): number => {
      if (!id) return 0;
      if (visited.has(id)) return 0;
      visited.add(id);
      if (map.has(id)) return map.get(id)!;
      const it = manuCostItems.find(i => i.id === id);
      if (!it || !it.parent_local_id) { map.set(id, 0); return 0; }
      const d = 1 + getDepth(it.parent_local_id, visited);
      map.set(id, d);
      return d;
    };
    manuCostItems.forEach(i => getDepth(i.id));
    return map;
  }, [manuCostItems]);

  const manuCostTreeMeta = useMemo(() => buildCostTreeMeta(manuCostItems), [manuCostItems]);

  const manuCostSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onManuCostDragEnd = (e: DragEndEvent) => {
    const { active, over, delta } = e;
    if (!over) return;
    const dx = delta?.x || 0;
    if (active.id === over.id && Math.abs(dx) < 8) return;
    setManuCostItems(prev => applyCostDnd(prev, Number(active.id), Number(over.id), dx, 14));
  };

  const manuHandleAddCost = (type: 'material' | 'service' | 'other') => {
    let defaultSupplierId: number | null = null;
    let defaultIsInternal = false;
    let defaultDeptId: number | null = null;
    if (type === 'other') {
      // Find internal/gyartás dept for default
      defaultIsInternal = true;
      const gyartasDept = manuDepartments.find((d: any) =>
        (d.name || '').toLowerCase().includes('gyártás') ||
        (d.name || '').toLowerCase().includes('gyartas')
      );
      if (gyartasDept) defaultDeptId = gyartasDept.id;
      else if (manuDepartments.length > 0) defaultDeptId = manuDepartments[0].id;
    } else {
      const ds = manuSuppliers.find((s: any) =>
        (s.name || '').toLowerCase().includes('belső gyártás') ||
        (s.name || '').toLowerCase().includes('belső márka') ||
        (s.name || '').toLowerCase().includes('internal')
      );
      if (ds) defaultSupplierId = ds.id;
    }
    setManuCostItems(prev => [...prev, {
      id: Date.now() + Math.random(),
      type,
      name: type === 'other' ? 'Egyéb költség' : '',
      unit: 'db',
      quantity: 1,
      unit_price: 0,
      cost_price: 0,
      markup_percent: manuDefaultMarkupActive ? manuDefaultMarkup : 30,
      selling_unit_price: 0,
      selling_price: 0,
      supplier_id: defaultSupplierId,
      is_per_unit: false,
      is_internal: defaultIsInternal,
      department_id: defaultDeptId,
      currency_code: manuCostCurrencyCode,
      currency_id: manuCostCurrencyId,
    }]);
  };

  const handleLinkItemSelect = (record: any) => {
    const type = linkSearchModal.type!;
    // manuMaterials stores name as "[KOD] Nev" — recover the original name
    const originalName = (type === 'product' && record.code)
      ? record.name.replace(`[${record.code}] `, '')
      : record.name;
    const unit = record.unit || (type === 'service' ? 'alkalom' : 'db');
    manuForm.setFieldsValue({ name: originalName, quantity_unit: unit, description: record.description || '' });
    const cp = type === 'product'
      ? (Number(record.unit_cost_price) || Number(record.moving_average_cost) || Number(record.net_unit_price) || 0)
      : (Number(record.unit_cost_price) || Number(record.unit_price) || 0);
    const mu = record.markup_percentage ? Number(record.markup_percentage) : 35;
    const sellUnit = Number(record.unit_selling_price) || (cp > 0 ? cp * (1 + mu / 100) : 0);
    const costType: 'material' | 'service' = type === 'product' ? 'material' : 'service';
    // Internal production handling (product and service)
    const isInternal = !!(record.is_internal_production);
    const internalDeptId = isInternal
      ? (() => {
          const d = record.internal_production_department;
          if (d == null) return null;
          const id = typeof d === 'object' ? d.id : d;
          return Number.isFinite(Number(id)) ? Number(id) : null;
        })()
      : null;
    // Ensure internal dept is in manuDepartments list
    if (isInternal && internalDeptId && !manuDepartments.find((d: any) => d.id === internalDeptId)) {
      const deptObj = (typeof record.internal_production_department === 'object' && record.internal_production_department)
        ? record.internal_production_department
        : { id: internalDeptId, name: record.internal_production_department_name || `#${internalDeptId}` };
      setManuDepartments(prev => [deptObj, ...prev]);
    }
    const recordSupplierId = isInternal ? null : (() => {
      const ds = record.default_supplier;
      if (ds == null) return null;
      const id = typeof ds === 'object' ? ds.id : ds;
      return Number.isFinite(Number(id)) ? Number(id) : null;
    })();
    if (!isInternal && recordSupplierId && !manuSuppliers.find((s: any) => s.id === recordSupplierId)) {
      const supObj = (typeof record.default_supplier === 'object' && record.default_supplier)
        ? record.default_supplier
        : { id: recordSupplierId, name: record.default_supplier_name || `#${recordSupplierId}` };
      setManuSuppliers(prev => [supObj, ...prev]);
    }
    const fallbackSupplierId = !isInternal ? (manuSuppliers.find((s: any) =>
      (s.name || '').toLowerCase().includes('belső gyártás') ||
      (s.name || '').toLowerCase().includes('belső márka') ||
      (s.name || '').toLowerCase().includes('internal')
    )?.id ?? null) : null;
    const newItem: CostItem = {
      id: Date.now() + Math.random(),
      type: costType,
      ref_id: record.id,
      code: record.code || '',
      name: originalName,
      unit,
      quantity: 1,
      unit_price: cp,
      cost_price: cp,
      markup_percent: manuDefaultMarkupActive ? manuDefaultMarkup : mu,
      selling_unit_price: sellUnit,
      selling_price: sellUnit,
      supplier_id: isInternal ? null : (recordSupplierId ?? fallbackSupplierId),
      is_per_unit: false,
      is_internal: isInternal,
      department_id: isInternal ? internalDeptId : null,
      currency_code: manuCostCurrencyCode,
      currency_id: manuCostCurrencyId,
    };
    setManuCostItems(prev => [...prev, newItem]);
    setLinkedItem({ type, name: originalName, id: record.id });
    setManuCollapseKeys(prev => prev.includes('costs') ? prev : [...prev, 'costs']);
    setLinkSearchModal({ open: false, type: null });
  };

  const manuCostColumns: any[] = [
    { title: '', key: 'drag', width: 28, render: () => <CostDragHandle /> },
    { title: 'Megnevezés', key: 'name', width: 240, render: (_: any, r: CostItem) => {
      const meta = manuCostTreeMeta.get(r.id);
      const wrap = (content: React.ReactNode) => (
        <CostTreeGuide meta={meta}>{content}</CostTreeGuide>
      );
      if (r.type === 'other') return wrap(<Input size="small" value={r.name} onChange={e => manuUpdateCostItem(r.id, 'name', e.target.value)} status={!r.name ? 'error' : ''} />);
      // material / service: clickable to open search modal
      const displayName = r.name || '(nincs kiválasztva)';
      return wrap(
        <Tooltip title="Kattints az újraválasztáshoz">
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', textAlign: 'left', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: r.name ? undefined : '#ff4d4f' }}
            onClick={() => {
              setCostSearchQuery('');
              setCostSearchEditId(r.id);
              setCostSearchModal({ open: true, type: r.type as 'material' | 'service' });
            }}
          >
            {displayName}
          </Button>
        </Tooltip>
      );
    }},
    { title: 'Típus', dataIndex: 'type', key: 'type', width: 70, render: (t: string) => t === 'material' ? 'Anyag' : t === 'service' ? 'Szv.' : 'Egyéb' },
    { title: 'Menny.', key: 'quantity', width: 100, render: (_: any, r: CostItem) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <NumInput formula size="small" value={r.quantity} onChange={v => manuUpdateCostItem(r.id, 'quantity', v)} initialFormula={r.formulas?.quantity ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'quantity', f)} min={0} controls={false} style={{ width: 52 }} />
        <Tooltip title="Tétel mennyiségének másolása">
          <Button size="small" icon={<CopyOutlined />} onClick={() => manuUpdateCostItem(r.id, 'quantity', Number(manuForm.getFieldValue('manu_quantity') || form.getFieldValue('quantity')) || 1)} style={{ padding: '0 4px' }} />
        </Tooltip>
      </div>
    )},
    { title: 'Egység', key: 'unit', width: 75, render: (_: any, r: CostItem) => r.type === 'other'
        ? <AutoComplete
            size="small"
            value={r.unit}
            options={unitSuggestions.map(u => ({ value: u.unit, label: u.count > 0 ? `${u.unit} (${u.count}x)` : u.unit }))}
            onChange={v => manuUpdateCostItem(r.id, 'unit', v)}
            filterOption={(input, option) => (option?.value || '').toLowerCase().includes(input.toLowerCase())}
            style={{ width: 68 }}
          />
        : <span>{r.unit}</span>
    },
    { title: 'Bek. e.ár', key: 'cost_price', width: 85, render: (_: any, r: CostItem) => <NumInput formula size="small" value={r.cost_price} onChange={v => manuUpdateCostItem(r.id, 'cost_price', v)} initialFormula={r.formulas?.cost_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'cost_price', f)} disabled={r.type !== 'other'} controls={false} style={{ width: 76 }} min={0} /> },
    { title: 'Haszon%', key: 'markup', width: 70, render: (_: any, r: CostItem) => <NumInput formula size="small" value={r.markup_percent} onChange={v => manuUpdateCostItem(r.id, 'markup_percent', v)} initialFormula={r.formulas?.markup_percent ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'markup_percent', f)} controls={false} precision={1} style={{ width: 62 }} min={0} /> },
    { title: 'El. egység ár', key: 'sell_up', width: 95, render: (_: any, r: CostItem) => <NumInput formula size="small" value={r.selling_unit_price} onChange={v => manuUpdateCostItem(r.id, 'selling_unit_price', v)} initialFormula={r.formulas?.selling_unit_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'selling_unit_price', f)} controls={false} style={{ width: 84 }} min={0} /> },
    { title: 'Összesen', key: 'selling_price', width: 90, render: (_: any, r: CostItem) => <NumInput formula size="small" value={r.selling_price} onChange={v => manuUpdateCostItem(r.id, 'selling_price', v)} initialFormula={r.formulas?.selling_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'selling_price', f)} controls={false} style={{ width: 80 }} min={0} /> },
    { title: 'Pénznem', key: 'currency', width: 90, render: (_: any, r: CostItem) => (
      <Select
        size="small"
        style={{ width: 82 }}
        value={(r.currency_code || manuCostCurrencyCode || 'HUF').toUpperCase()}
        onChange={(val: string) => {
          const found = manuCurrencies.find(c => c.code.toUpperCase() === val.toUpperCase());
          manuUpdateCostItem(r.id, 'currency_code', val.toUpperCase());
          manuUpdateCostItem(r.id, 'currency_id', found?.id ?? null);
        }}
      >
        {manuCurrencies.map(c => (
          <Select.Option key={c.code} value={c.code.toUpperCase()}>{c.code.toUpperCase()}</Select.Option>
        ))}
      </Select>
    )},
    { title: 'Beszállító', key: 'supplier', render: (_: any, r: CostItem) => (
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        <Checkbox checked={r.is_internal} onChange={e => { manuUpdateCostItem(r.id, 'is_internal', e.target.checked); manuUpdateCostItem(r.id, 'department_id', null); manuUpdateCostItem(r.id, 'supplier_id', null); }}>Belső</Checkbox>
        {r.is_internal
          ? <Select size="small" style={{ width:150 }} value={r.department_id} onChange={v => manuUpdateCostItem(r.id, 'department_id', v)} allowClear placeholder="Részleg">
              {manuDepartments.map((d: any) => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          : <Select size="small" style={{ width:150 }} value={r.supplier_id} onChange={v => manuUpdateCostItem(r.id, 'supplier_id', v)} allowClear showSearch optionFilterProp="label" status={!r.supplier_id ? 'error' : ''} placeholder="Beszállító">
              {manuSuppliers.map((s: any) => <Select.Option key={s.id} value={s.id} label={s.name}>{s.name}</Select.Option>)}
            </Select>
        }
      </div>
    )},
    { title: '', key: 'dup', width: 36, render: (_: any, r: CostItem) => <Button size="small" icon={<CopyOutlined />} title="Másolás" onClick={() => setManuCostItems(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: Date.now() + Math.random() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    })} /> },
    { title: '', key: 'del', width: 36, render: (_: any, r: CostItem) => <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setManuCostItems(prev => prev.filter(x => x.id !== r.id))} /> },
  ];

  const manuHasUnsavedData = () => {
    const v = manuForm.getFieldsValue();
    return !!(v.name || manuCostItems.length > 0 || manuPendingFiles.length > 0);
  };

  const handleModalCancel = () => {
    const inManuForm = activeKey === 'manufacturing' && !selected && manuHasUnsavedData();
    if (inManuForm) {
      Modal.confirm({
        title: 'Mentés nélkül bezár?',
        icon: <ExclamationCircleOutlined />,
        content: 'Az új egyedi gyártás adatai elvesznek.',
        okText: 'Igen, bezár',
        cancelText: 'Mégse',
        onOk: onCancel,
      });
    } else {
      onCancel();
    }
  };

  const createCopy = async () => {
    if (!selected) return;
    setCreateError(null);
    let url = '';
    const currentType = (activeKey === 'all' ? (selected as any).__type : activeKey);

    if (currentType === 'product') {
      url = `/warehouse/materials?create=true&from_rfq=true&copy_from=${selected.id}`;
    } else if (currentType === 'service') {
      url = `/manufacturing/services?create=true&from_rfq=true&copy_from=${selected.id}`;
    } else {
      url = `/manufacturing/products?create=true&from_rfq=true&copy_from=${selected.id}`;
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  const openEdit = (record: any) => {
    let url = '';
    const currentType = (activeKey === 'all' ? (record.__type as any) : activeKey);

    if (currentType === 'product') {
      url = `/warehouse/materials?edit=${record.id}&from_rfq=true`;
    } else if (currentType === 'service') {
      url = `/manufacturing/services?edit=${record.id}&from_rfq=true`;
    } else {
      url = `/manufacturing/products?edit=${record.id}&from_rfq=true`;
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  const columnsByType: Record<ItemType, any[]> = {
    product: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: (v: any) => v || '-' },
      { title: 'Termék neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { title: 'Nettó ár', dataIndex: 'base_price', key: 'base_price' },
      { title: 'Egység', dataIndex: 'unit', key: 'unit' },
    ],
    manufacturing: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: (v: any) => v || '-' },
      { title: 'Egyedi gyártás neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { title: 'Nettó ár', dataIndex: 'net_unit_price', key: 'net_unit_price' },
      { 
          title: 'Rendelési egység', 
          key: 'order_unit', 
          render: (r: any) => {
              if (r.is_fixed_quantity) {
                  return `${Number(r.quantity)} ${r.quantity_unit || 'db'}`;
              }
              return `1 ${r.quantity_unit || 'db'}`;
          }
      },
      { title: 'Egység', dataIndex: 'quantity_unit', key: 'quantity_unit', render: (v: any) => v || 'db' },
    ],
    service: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: (v: any) => v || '-' },
      { title: 'Szolgáltatás neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { 
        title: 'Nettó ár', 
        key: 'base_price', 
        render: (r: any) => {
            const val = r.unit_selling_price ?? r.base_price ?? r.net_unit_price ?? 0;
            return val.toLocaleString('hu-HU') + ' Ft';
        }
      },
      { title: 'Egység', dataIndex: 'unit', key: 'unit' },
    ],
    all: [
      { title: 'Típus', key: 't', render: (r: any) => r.__type === 'product' ? 'Termék' : r.__type === 'manufacturing' ? 'Egyedi gyártás' : 'Szolgáltatás' },
      { title: 'Cikkszám', key: 'code', render: (r: any) => r.code || '-' },
      { title: 'Név', key: 'name', render: (r: any) => r.name },
      { title: 'Nettó ár', key: 'price', render: (r: any) => r.base_price ?? r.net_unit_price ?? 0 },
    ],
  };

  const tabItems = [
    { key: 'product', label: 'Termék', children: null },
    { key: 'manufacturing', label: 'Egyedi Gyártás', children: null },
    { key: 'service', label: 'Szolgáltatás', children: null },
    { key: 'all', label: 'Mind', children: null },
  ];

  const renderTable = (type: ItemType) => (
    <Table
      loading={loading}
      size="small"
      rowKey={(r: any) => `${(r as any).__type || type}-${r.id}`}
      columns={(type === 'all'
        ? [
            { title: 'Típus', key: 't', render: (r: any) => (r.__type === 'product' ? 'Termék' : r.__type === 'manufacturing' ? 'Egyedi gyártás' : 'Szolgáltatás') },
            { title: 'Cikkszám', key: 'code', render: (r: any) => r.code || '-' },
            { title: 'Név', key: 'name', render: (r: any) => r.name },
            { title: 'Nettó ár', key: 'price', render: (r: any) => r.base_price ?? r.net_unit_price ?? 0 },
          ]
        : (columnsByType as any)[type]) as any}
      dataSource={filtered[type]}
      pagination={{ pageSize: 8 }}
      onRow={(record) => ({ 
        onClick: () => handleRowClick(record),
        onDoubleClick: () => {
             handleRowClick(record);
             confirmAdd();
        }
      })}
      rowClassName={(record) => (selected && record.id === selected.id ? 'ant-table-row-selected' : '')}
    />
  );

  return (
    <Modal
      open={open}
      onCancel={handleModalCancel}
      title={mode === 'edit' ? 'Tétel szerkesztése' : 'Tétel kiválasztása'}
      width="min(1400px, 96vw)"
      styles={{ body: { padding: 10 } }}
      footer={(() => {
        const isManuEdit = mode === 'edit' && initialSelection?.item_type === 'manufacturing';
        const useManuFlow = activeKey === 'manufacturing' && (isManuEdit || !selected || ((selected as any).__type === 'manufacturing' && manuCreatedId));
        const primaryLabel = (activeKey === 'manufacturing' && manuCreatedId) || (mode === 'edit' && initialSelection?.item_type === 'manufacturing') ? 'Mentés & bezárás'
          : activeKey === 'manufacturing' && !selected ? 'Hozzáadás & bezárás'
          : mode === 'edit' ? 'Mentés & bezárás' : 'Hozzáadás & bezárás';
        const secondaryLabel = mode === 'edit' || (activeKey === 'manufacturing' && manuCreatedId) ? 'Mentés' : 'Hozzáadás';
        const doSave = async (keepOpen: boolean) => {
          if (keepOpen) setSavingKeepOpen(true); else setSavingClose(true);
          try {
            if (useManuFlow) {
              await handleManuInlineSubmit(keepOpen);
            } else {
              await confirmAdd(keepOpen);
            }
          } finally {
            if (keepOpen) setSavingKeepOpen(false); else setSavingClose(false);
          }
        };
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#888' }}>
              {lastSavedAt ? `Utoljára mentve: ${lastSavedAt.format('YYYY. MM. DD. HH:mm:ss')}` : ''}
            </span>
            <Space>
              <Button onClick={handleModalCancel}>Mégse</Button>
              <Button
                loading={savingKeepOpen || (manuSubmitting && manuKeepOpenRef.current)}
                disabled={savingClose}
                onClick={() => doSave(true)}
              >
                {secondaryLabel}
              </Button>
              <Button
                type="primary"
                loading={savingClose || (manuSubmitting && !manuKeepOpenRef.current)}
                disabled={savingKeepOpen}
                onClick={() => doSave(false)}
              >
                {primaryLabel}
              </Button>
            </Space>
          </div>
        );
      })()}
    >
      <Space direction="vertical" style={{ width: '100%', gap: 8 }}>
        <div style={{ display: 'none' }}>
          <Tabs
            activeKey={activeKey}
            onChange={(k) => {
              setActiveKey(k as ItemType);
            }}
            items={tabItems as any}
          />
        </div>

        {/* Inline manufacturing form — shown on manufacturing tab in add mode, or when editing a manufacturing item */}
        {activeKey === 'manufacturing' && (mode === 'add' || (mode === 'edit' && initialSelection?.item_type === 'manufacturing')) && (
          <div>
            {/* If a previously created manu product is selected, show it */}
            {selected && (selected.__type === 'manufacturing' || activeKey === 'manufacturing') && (
              <Alert
                message={`Kiválasztva: ${selected.name} (${selected.code || 'nincs kód'})`}
                type="success"
                showIcon
                style={{ marginBottom: 8 }}
                action={
                  <Button size="small" onClick={() => { setSelected(null); manuForm.resetFields(); }}>
                    Töröl
                  </Button>
                }
              />
            )}

            <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 16, background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong>{manuCreatedId ? 'Tétel szerkesztése' : 'Új tétel'}</strong>
                </div>                <Form layout="vertical" form={manuForm}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 100%', marginBottom: 0 }}>
                      {linkedItem && (
                        <div style={{ marginBottom: 4 }}>
                          <Tag color={linkedItem.type === 'product' ? 'blue' : 'green'} closable onClose={() => setLinkedItem(null)}>
                            {linkedItem.type === 'product' ? 'Termék' : 'Szolgáltatás'}: {linkedItem.name}
                          </Tag>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <Form.Item label="Név" name="name" rules={[{ required: true, message: 'Kötelező' }]} style={{ flex: 1, marginBottom: 8 }}>
                          <Input placeholder="Egyedi gyártás neve" />
                        </Form.Item>
                        <div style={{ marginBottom: 8, display: 'flex', gap: 4 }}>
                          <Button size="small" onClick={() => { setLinkSearchQuery(''); setLinkSearchModal({ open: true, type: 'product' }); }}>Termék</Button>
                          <Button size="small" onClick={() => { setLinkSearchQuery(''); setLinkSearchModal({ open: true, type: 'service' }); }}>Szolgáltatás</Button>
                        </div>
                      </div>
                    </div>
                    <Form.Item label="Cikkszám" name="code" style={{ flex: '1 1 auto', marginBottom: 8, minWidth: 120 }}>
                      <Input placeholder="Auto-generál, ha üres" />
                    </Form.Item>
                    <Button style={{ marginBottom: 8, flexShrink: 0 }} onClick={manuGenerateCode}>Generál</Button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Form.Item label="Mennyiség" name="manu_quantity" initialValue={1} style={{ marginBottom: 8 }}>
                      <NumInput min={0.01} style={{ width: 120 }} onChange={() => setTimeout(() => {
                        const q = manuForm.getFieldValue('manu_quantity') || 1;
                        if (manuPriceFromCalc) {
                          const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                          const exchRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                          const us = exchRate !== 1 ? manuDisplayedTotals.unitSelling / exchRate : manuDisplayedTotals.unitSelling;
                          manuForm.setFieldsValue({ manu_net_unit_price: parseFloat(us.toFixed(2)), manu_net_total: parseFloat((us * q).toFixed(2)) });
                        } else {
                          const up = manuForm.getFieldValue('manu_net_unit_price') || 0;
                          manuForm.setFieldsValue({ manu_net_total: parseFloat((up * q).toFixed(2)) });
                        }
                        manuCalculateWeight();
                      }, 0)} />
                    </Form.Item>
                    <Form.Item label="Egység" name="quantity_unit" initialValue="db" style={{ marginBottom: 8 }}>
                      <Input style={{ width: 80 }} />
                    </Form.Item>
                    <Form.Item label="Nettó egységár" name="manu_net_unit_price" style={{ marginBottom: 8 }}>
                      <NumInput min={0} style={{ width: 150 }} placeholder="0" disabled={manuPriceFromCalc}
                        onChange={() => setTimeout(() => {
                          const up = manuForm.getFieldValue('manu_net_unit_price') || 0;
                          const q = manuForm.getFieldValue('manu_quantity') || 1;
                          manuForm.setFieldsValue({ manu_net_total: parseFloat((up * q).toFixed(2)) });
                        }, 0)}
                      />
                    </Form.Item>
                    <Form.Item label="Össz. nettó ár" name="manu_net_total" style={{ marginBottom: 8 }}>
                      <NumInput min={0} style={{ width: 150 }} placeholder="0" disabled={manuPriceFromCalc}
                        onChange={() => setTimeout(() => {
                          const total = manuForm.getFieldValue('manu_net_total') || 0;
                          const q = manuForm.getFieldValue('manu_quantity') || 1;
                          manuForm.setFieldsValue({ manu_net_unit_price: parseFloat((total / q).toFixed(6)) });
                        }, 0)}
                      />
                    </Form.Item>
                    <Form.Item label=" " style={{ marginBottom: 8 }}>
                      <Checkbox checked={manuPriceFromCalc} onChange={e => setManuPriceFromCalc(e.target.checked)}>Árkalkuláció alapján</Checkbox>
                    </Form.Item>
                    <Form.Item label="Pénznem" style={{ marginBottom: 8 }}>
                      <Select
                        style={{ width: 140 }}
                        value={manuSellCurrencyCode}
                        onChange={(val: string) => {
                          const found = manuCurrencies.find(c => c.code.toUpperCase() === val.toUpperCase());
                          setManuSellCurrencyCode(val.toUpperCase());
                          setManuSellCurrencyId(found?.id ?? null);
                        }}
                      >
                        {manuCurrencies.map(c => (
                          <Select.Option key={c.code} value={c.code.toUpperCase()}>{c.code.toUpperCase()} – {c.name}</Select.Option>
                        ))}
                      </Select>
                      {(() => {
                        const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                        if (currObj && currObj.exchange_rate && currObj.exchange_rate !== 1) {
                          const defCurr = manuCurrencies.find(c => c.is_default);
                          const baseName = defCurr?.code?.toUpperCase() || 'HUF';
                          return <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>1 {currObj.code.toUpperCase()} = {currObj.exchange_rate.toLocaleString('hu-HU')} {baseName}</div>;
                        }
                        return null;
                      })()}
                    </Form.Item>
                    {(manuWatchQty != null) && (() => {
                      const qty = manuWatchQty || 1;
                      const effectiveUnitPrice = manuPriceFromCalc ? manuDisplayedTotals.unitSelling : (manuWatchPrice || 0);
                      const totalRevenue = effectiveUnitPrice * qty;
                      const totalCost = manuDisplayedTotals.totalCost;
                      const profit = totalRevenue - totalCost;
                      const showProfit = totalCost > 0;
                      const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                      const exchRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                      const profitInSellCurr = exchRate !== 1 ? profit / exchRate : profit;
                      const currLabel = manuSellCurrencyCode || 'HUF';
                      return (
                        <div style={{ marginBottom: 8, fontSize: 12, color: '#666', display: 'flex', gap: 12 }}>
                          {showProfit && (
                            <span>Haszon: <b style={{ color: profit >= 0 ? 'green' : 'red' }}>{profitInSellCurr.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {currLabel}</b></span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <Row gutter={8}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Leírás" name="description" style={{ marginBottom: 8 }} getValueFromEvent={(v) => v}>
                        <ReactQuill theme="snow" className="pixi-quill-resizable" placeholder="Külső leírás" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Belső leírás" name="internal_description" style={{ marginBottom: 8 }} getValueFromEvent={(v) => v}>
                        <ReactQuill theme="snow" className="pixi-quill-resizable" placeholder="Belső leírás" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Collapse ghost size="small" style={{ marginBottom: 8 }} activeKey={manuCollapseKeys} onChange={(k) => setManuCollapseKeys(Array.isArray(k) ? k as string[] : [k as string])}>
                    <Collapse.Panel header={<span><AppstoreOutlined /> Impozíció – produkciózás segédlet</span>} key="imposition" extra={<Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); openImpositionWithPreset(null); }}>Új megnyitása</Button>}>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: impositionPresets.length ? 8 : 0 }}>Számítsd ki a produkciós ív kihozatalt: több termékméret és több ívméret kombinációi, érhetőség (készlet) figyelembe vételével.</div>
                      {impositionPresets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Mentett impozíciók ({impositionPresets.length}):</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {impositionPresets.map(p => (
                              <div
                                key={p.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '3px 8px',
                                  background: '#fff',
                                  border: '1px solid #d9d9d9',
                                  borderRadius: 14,
                                  fontSize: 12,
                                }}
                              >
                                <Tooltip title="Megnyitás">
                                  <Button
                                    size="small"
                                    type="link"
                                    icon={<FolderOpenOutlined />}
                                    onClick={() => openImpositionWithPreset(p.id)}
                                    style={{ padding: 0, height: 'auto' }}
                                  />
                                </Tooltip>
                                <Typography.Text
                                  editable={{
                                    icon: <EditOutlined style={{ fontSize: 11 }} />,
                                    tooltip: 'Átnevezés',
                                    onChange: (val) => renameImpositionPreset(p.id, val),
                                  }}
                                  style={{ margin: 0, cursor: 'pointer' }}
                                  onClick={() => openImpositionWithPreset(p.id)}
                                >
                                  {p.name}
                                </Typography.Text>
                                <Popconfirm title="Törlés?" okText="Igen" cancelText="Mégse" onConfirm={() => deleteImpositionPreset(p.id)}>
                                  <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} style={{ padding: 0, height: 'auto' }} />
                                </Popconfirm>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Collapse.Panel>
                    <Collapse.Panel header="Méret és súly" key="dims">
                      <Row gutter={8}>
                        <Col span={6}>
                          <Form.Item label="Szélesség" name="width" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Hosszúság" name="length" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Magasság" name="height" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Mértékegység" name="dimension_unit" initialValue="mm" style={{ marginBottom: 8 }}>
                            <Select onChange={() => manuCalculateWeight()}>
                              <Select.Option value="mm">mm</Select.Option>
                              <Select.Option value="cm">cm</Select.Option>
                              <Select.Option value="m">m</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>
                      <div style={{ marginBottom: 8, padding: '6px 0', borderTop: '1px solid #eee' }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Checkbox checked={manuDimensionsPerUnit} onChange={e => { setManuDimensionsPerUnit(e.target.checked); setTimeout(manuCalculateWeight, 0); }}>
                            Méretek egy egységre vonatkoznak
                          </Checkbox>
                          <span>Egység térfogat: <b>{manuCalculatedVolumes.unit.toFixed(6)} m³</b></span>
                          <span>Összes térfogat: <b>{manuCalculatedVolumes.total.toFixed(6)} m³</b></span>
                        </div>
                        {manuCalculatedTotalDims && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#1890ff' }}>
                            {manuDimensionsPerUnit
                              ? <span>Össz. méret: <b>{manuCalculatedTotalDims.width} × {manuCalculatedTotalDims.length} × {manuCalculatedTotalDims.height} {manuCalculatedTotalDims.unit}</b></span>
                              : <span>Egység méret: <b>{manuCalculatedTotalDims.width} × {manuCalculatedTotalDims.length} × {manuCalculatedTotalDims.height} {manuCalculatedTotalDims.unit}</b></span>
                            }
                          </div>
                        )}
                      </div>
                      <Row gutter={8}>
                        <Col span={6}>
                          <Form.Item label="Fajsúly" name="specific_weight" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Fajsúly egység" name="specific_weight_unit" initialValue="kg/m3" style={{ marginBottom: 8 }}>
                            <Select onChange={() => manuCalculateWeight()}>
                              <Select.Option value="kg/m3">kg/m³</Select.Option>
                              <Select.Option value="g/cm3">g/cm³</Select.Option>
                              <Select.Option value="kg/liter">kg/liter</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Egység súly" name="unit_weight" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item label="Össz. súly" name="total_weight" style={{ marginBottom: 8 }}>
                            <NumInput style={{ width: '100%' }} onChange={() => manuCalculateWeight()} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={8}>
                        <Col span={6}>
                          <Form.Item label="Súly egység" name="weight_unit" initialValue="kg" style={{ marginBottom: 8 }}>
                            <Select onChange={() => manuCalculateWeight()}>
                              <Select.Option value="g">g</Select.Option>
                              <Select.Option value="kg">kg</Select.Option>
                              <Select.Option value="t">t</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>
                    </Collapse.Panel>
                    <Collapse.Panel header="Beszállítók és árkalkuláció" key="costs">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13 }}>Alap haszonkulcs:</span>
                        <NumInput formula size="small" value={manuDefaultMarkup} min={0} style={{ width: 100 }} onChange={v => {
                          setManuDefaultMarkup(Math.max(0, Number(v) || 0));
                        }} addonAfter="%" />
                        <Switch
                          size="small"
                          checked={manuDefaultMarkupActive}
                          onChange={checked => setManuDefaultMarkupActive(checked)}
                          checkedChildren="aktív"
                          unCheckedChildren="ki"
                        />
                        <Button size="small" icon={<PlusOutlined />} onClick={() => { setCostSearchQuery(''); setCostSearchModal({ open: true, type: 'material' }); }}>Alapanyag/Termék</Button>
                        <Button size="small" icon={<PlusOutlined />} onClick={() => { setCostSearchQuery(''); setCostSearchModal({ open: true, type: 'service' }); }}>Szolgáltatás</Button>
                        <Button size="small" icon={<PlusOutlined />} onClick={() => manuHandleAddCost('other')}>Egyéb költség</Button>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#888' }}>Pénznem:</span>
                          <Select
                            size="small"
                            style={{ width: 130 }}
                            value={manuCostCurrencyCode}
                            onChange={(val: string) => {
                              const found = manuCurrencies.find(c => c.code.toUpperCase() === val.toUpperCase());
                              setManuCostCurrencyCode(val.toUpperCase());
                              setManuCostCurrencyId(found?.id ?? null);
                            }}
                          >
                            {manuCurrencies.map(c => (
                              <Select.Option key={c.code} value={c.code.toUpperCase()}>{c.code.toUpperCase()} – {c.name}</Select.Option>
                            ))}
                          </Select>
                          {(() => {
                            const costCurrObj = manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode);
                            if (costCurrObj && costCurrObj.exchange_rate && costCurrObj.exchange_rate !== 1) {
                              const defCurr = manuCurrencies.find(c => c.is_default);
                              return <span style={{ fontSize: 11, color: '#888' }}>1 {manuCostCurrencyCode} = {costCurrObj.exchange_rate.toLocaleString('hu-HU')} {defCurr?.code?.toUpperCase() || 'HUF'}</span>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <DndContext sensors={manuCostSensors} collisionDetection={closestCenter} onDragEnd={onManuCostDragEnd}>
                        <SortableContext items={manuCostItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                          {isMobile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {manuCostItems.map((r: CostItem) => (
                                <div key={r.id} style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 8, background: '#fff', fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                      <input type="checkbox" checked={!!r.is_per_unit} onChange={e => manuUpdateCostItem(r.id, 'is_per_unit', e.target.checked)} title="Egységre vonatkozik?" />
                                      <span style={{ color: '#888', fontSize: 11 }}>{r.type === 'material' ? 'Anyag' : r.type === 'service' ? 'Szv.' : 'Egyéb'}</span>
                                    </div>
                                    <Space size={4}>
                                      <Button size="small" icon={<CopyOutlined />} onClick={() => setManuCostItems(prev => { const idx = prev.findIndex(x => x.id === r.id); if (idx < 0) return prev; const copy = { ...prev[idx], id: Date.now() + Math.random() }; const next = [...prev]; next.splice(idx + 1, 0, copy); return next; })} />
                                      <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setManuCostItems(prev => prev.filter(x => x.id !== r.id))} />
                                    </Space>
                                  </div>
                                  <div style={{ marginBottom: 4 }}>
                                    {r.type === 'other'
                                      ? <Input size="small" value={r.name} onChange={e => manuUpdateCostItem(r.id, 'name', e.target.value)} status={!r.name ? 'error' : ''} placeholder="Megnevezés" style={{ width: '100%' }} />
                                      : <Button type="link" size="small" style={{ padding: 0, height: 'auto', textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.name ? undefined : '#ff4d4f' }} onClick={() => { setCostSearchQuery(''); setCostSearchEditId(r.id); setCostSearchModal({ open: true, type: r.type as 'material' | 'service' }); }}>{r.name || '(nincs kiválasztva)'}</Button>
                                    }
                                  </div>
                                  <Row gutter={[4, 4]}>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Menny. / Egység</div>
                                      <Space.Compact style={{ width: '100%' }}>
                                        <NumInput formula size="small" value={r.quantity} onChange={v => manuUpdateCostItem(r.id, 'quantity', v)} initialFormula={r.formulas?.quantity ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'quantity', f)} min={0} controls={false} style={{ width: '50%' }} />
                                        {r.type === 'other'
                                          ? <AutoComplete size="small" value={r.unit} options={unitSuggestions.map(u => ({ value: u.unit, label: u.count > 0 ? `${u.unit} (${u.count}x)` : u.unit }))} onChange={v => manuUpdateCostItem(r.id, 'unit', v)} filterOption={(input, option) => (option?.value || '').toLowerCase().includes(input.toLowerCase())} style={{ width: '50%' }} />
                                          : <span style={{ padding: '0 6px', lineHeight: '24px' }}>{r.unit}</span>
                                        }
                                      </Space.Compact>
                                    </Col>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Bek. e.ár</div>
                                      <NumInput formula size="small" value={r.cost_price} onChange={v => manuUpdateCostItem(r.id, 'cost_price', v)} initialFormula={r.formulas?.cost_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'cost_price', f)} disabled={r.type !== 'other'} controls={false} style={{ width: '100%' }} min={0} />
                                    </Col>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Haszon%</div>
                                      <NumInput formula size="small" value={r.markup_percent} onChange={v => manuUpdateCostItem(r.id, 'markup_percent', v)} initialFormula={r.formulas?.markup_percent ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'markup_percent', f)} controls={false} precision={1} style={{ width: '100%' }} min={0} />
                                    </Col>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>El. egység ár</div>
                                      <NumInput formula size="small" value={r.selling_unit_price} onChange={v => manuUpdateCostItem(r.id, 'selling_unit_price', v)} initialFormula={r.formulas?.selling_unit_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'selling_unit_price', f)} controls={false} style={{ width: '100%' }} min={0} />
                                    </Col>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Összesen</div>
                                      <NumInput formula size="small" value={r.selling_price} onChange={v => manuUpdateCostItem(r.id, 'selling_price', v)} initialFormula={r.formulas?.selling_price ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'selling_price', f)} controls={false} style={{ width: '100%' }} min={0} />
                                    </Col>
                                    <Col span={12}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Pénznem</div>
                                      <Select size="small" style={{ width: '100%' }} value={(r.currency_code || manuCostCurrencyCode || 'HUF').toUpperCase()} onChange={(val: string) => { const found = manuCurrencies.find(c => c.code.toUpperCase() === val.toUpperCase()); manuUpdateCostItem(r.id, 'currency_code', val.toUpperCase()); manuUpdateCostItem(r.id, 'currency_id', found?.id ?? null); }}>
                                        {manuCurrencies.map(c => <Select.Option key={c.code} value={c.code.toUpperCase()}>{c.code.toUpperCase()}</Select.Option>)}
                                      </Select>
                                    </Col>
                                    <Col span={24}>
                                      <div style={{ fontSize: 11, color: '#888' }}>Beszállító</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Checkbox checked={r.is_internal} onChange={e => { manuUpdateCostItem(r.id, 'is_internal', e.target.checked); manuUpdateCostItem(r.id, 'department_id', null); manuUpdateCostItem(r.id, 'supplier_id', null); }}>Belső</Checkbox>
                                        {r.is_internal
                                          ? <Select size="small" style={{ flex: 1 }} value={r.department_id} onChange={v => manuUpdateCostItem(r.id, 'department_id', v)} allowClear placeholder="Részleg">{manuDepartments.map((d: any) => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}</Select>
                                          : <Select size="small" style={{ flex: 1 }} value={r.supplier_id} onChange={v => manuUpdateCostItem(r.id, 'supplier_id', v)} allowClear showSearch optionFilterProp="label" status={!r.supplier_id ? 'error' : ''} placeholder="Beszállító">{manuSuppliers.map((s: any) => <Select.Option key={s.id} value={s.id} label={s.name}>{s.name}</Select.Option>)}</Select>
                                        }
                                      </div>
                                    </Col>
                                  </Row>
                                </div>
                              ))}
                            </div>
                          ) : (
                          <Table
                            dataSource={manuCostItems}
                            columns={[
                              { title: '', key: 'is_per_unit', width: 36, render: (_: any, r: CostItem) => (
                                <input type="checkbox" checked={!!r.is_per_unit} onChange={e => manuUpdateCostItem(r.id, 'is_per_unit', e.target.checked)} title="Egységre vonatkozik?" />
                              )},
                              ...manuCostColumns,
                            ]}
                            pagination={false}
                            rowKey="id"
                            scroll={{ x: 900 }}
                            size="small"
                            components={{ body: { row: CostDraggableRow } }}
                          />
                          )}
                        </SortableContext>
                      </DndContext>
                      {manuCostItems.length > 0 && (() => {
                        const qty = manuWatchQty || 1;
                        const effectiveUnitPrice = manuPriceFromCalc ? manuDisplayedTotals.unitSelling : (manuWatchPrice || 0);
                        const totalRevenue = effectiveUnitPrice * qty;
                        const totalCost = manuDisplayedTotals.totalCost;
                        const profit = totalRevenue - totalCost;
                        const profitPct = totalCost > 0 ? (profit / totalCost * 100) : null;
                        const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                        const exchRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                        const defCurr = manuCurrencies.find(c => c.is_default);
                        const baseCurrLabel = defCurr?.code?.toUpperCase() || 'HUF';
                        const sellCurrLabel = manuSellCurrencyCode || baseCurrLabel;
                        const isForeignSell = exchRate !== 1;
                        // Cost currency
                        const costCurrObj = manuCurrencies.find(c => c.id === manuCostCurrencyId || c.code.toUpperCase() === manuCostCurrencyCode);
                        const costExchRate = (costCurrObj && costCurrObj.exchange_rate > 0) ? costCurrObj.exchange_rate : 1;
                        const isForeignCost = costExchRate !== 1;
                        const costCurrLabel = manuCostCurrencyCode || baseCurrLabel;
                        // manuDisplayedTotals already stores base-currency (HUF) values
                        const unitCostInCostCurr = isForeignCost ? manuDisplayedTotals.unitCost / costExchRate : manuDisplayedTotals.unitCost;
                        const totalCostInCostCurr = isForeignCost ? manuDisplayedTotals.totalCost / costExchRate : manuDisplayedTotals.totalCost;
                        // Selling totals in sell currency
                        const unitSellingConverted = isForeignSell ? manuDisplayedTotals.unitSelling / exchRate : manuDisplayedTotals.unitSelling;
                        const totalSellingConverted = isForeignSell ? manuDisplayedTotals.totalSelling / exchRate : manuDisplayedTotals.totalSelling;
                        const profitConverted = isForeignSell ? profit / exchRate : profit;
                        return (
                          <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>
                            <Row gutter={16}>
                              <Col>
                                <div style={{ color: '#888', fontWeight: 600, marginBottom: 4 }}>BEKERÜLÉSI</div>
                                <Space size="large">
                                  <span>Darabár: <b>{unitCostInCostCurr.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {costCurrLabel}</b>{isForeignCost && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({manuDisplayedTotals.unitCost.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {baseCurrLabel})</span>}</span>
                                  <span>Összesen: <b>{totalCostInCostCurr.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {costCurrLabel}</b>{isForeignCost && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({manuDisplayedTotals.totalCost.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {baseCurrLabel})</span>}</span>
                                </Space>
                              </Col>
                              <Col>
                                <div style={{ color: '#1677ff', fontWeight: 600, marginBottom: 4 }}>ELADÁSI</div>
                                <Space size="large">
                                  <span>Darabár: <b>{unitSellingConverted.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {sellCurrLabel}</b>{isForeignSell && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({manuDisplayedTotals.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {baseCurrLabel})</span>}</span>
                                  <span>Összesen: <b>{totalSellingConverted.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {sellCurrLabel}</b>{isForeignSell && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({manuDisplayedTotals.totalSelling.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {baseCurrLabel})</span>}</span>
                                </Space>
                              </Col>
                              <Col>
                                <div style={{ color: profit >= 0 ? 'green' : 'red', fontWeight: 600, marginBottom: 4 }}>HASZON</div>
                                <Space size="large">
                                  <span><b style={{ color: profit >= 0 ? 'green' : 'red' }}>{profitConverted.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {sellCurrLabel}</b>{isForeignSell && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>({profit.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {baseCurrLabel})</span>}</span>
                                  {profitPct !== null && <span style={{ color: '#888' }}>({profitPct.toFixed(1)}%)</span>}
                                </Space>
                              </Col>
                            </Row>
                          </div>
                        );
                      })()}
                    </Collapse.Panel>
                  </Collapse>

                  <Divider style={{ margin: '12px 0' }} />

                  {existingAttachments.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Meglévő csatolmányok:</div>
                      {existingAttachments.map((att: any) => (
                        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Button type="link" size="small" style={{ padding: 0 }} href={att.file_url || att.file} target="_blank" rel="noopener noreferrer">{att.file?.split('/').pop() || `#${att.id}`}</Button>
                          {att.remark && <span style={{ color: '#888', fontSize: 12 }}>{att.remark}</span>}
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={async () => {
                              if (!quoteItemId) return;
                              try {
                                await salesService.deleteQuoteRequestItemAttachment(quoteItemId, att.id);
                                setExistingAttachments(prev => prev.filter((a: any) => a.id !== att.id));
                              } catch { message.error('Nem sikerült törölni'); }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Upload.Dragger
                    name="manuFiles"
                    multiple
                    showUploadList
                    beforeUpload={(file) => { setManuPendingFiles(prev => [...prev, file]); return false; }}
                    fileList={manuPendingFiles as any}
                    onRemove={(f) => {
                      const uid = (f as any)?.uid;
                      const key = uid || (f as any)?.name;
                      setManuPendingFiles(prev => prev.filter((x: any) => (x as any).uid ? (x as any).uid !== uid : (x as any).name !== (f as any).name));
                      setManuPendingFileRemarks(prev => { const { [key]: _, ...rest } = prev; return rest; });
                    }}
                    style={{ padding: 8, marginBottom: 8 }}
                  >
                    <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                    <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a tallózáshoz</p>
                  </Upload.Dragger>
                  {manuPendingFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {manuPendingFiles.map((f: any) => {
                        const key = (f as any)?.uid || (f as any)?.name;
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ minWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(f as any)?.name}</span>
                            <Input size="small" placeholder="Megjegyzés ehhez a fájlhoz" value={manuPendingFileRemarks[key] || ''} onChange={e => setManuPendingFileRemarks(prev => ({ ...prev, [key]: e.target.value }))} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Form>
              </div>

          </div>
        )}

        {/* Normal product/service/all table */}
        {activeKey !== 'manufacturing' && (
          <>
            <Space align="start" style={{ gap: 8 }}>
              <Search placeholder="Gyors keresés" allowClear onSearch={setSearch as any} onChange={(e) => setSearch(e.target.value)} style={{ width: 360 }} />
              <Button icon={<SyncOutlined />} onClick={() => loadData()} title="Lista frissítése" />
              {allowCreate && mode === 'add' && (
                <>
                  <Button onClick={createNew} type="dashed">
                    {activeKey === 'product' ? 'Új termék' : activeKey === 'service' ? 'Új szolgáltatás' : 'Új egyedi gyártás'}
                  </Button>
                  <Button onClick={createCopy} disabled={!selected} title="Másolás és szerkesztés újként">
                    Másol
                  </Button>
                </>
              )}
            </Space>
            {renderTable(activeKey)}
            {selected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                <Tooltip
                  title={
                    <div>
                      <div style={{ marginBottom: 4 }}><strong>Külső leírás:</strong> {selected.description || '-'}</div>
                      <div><strong>Belső leírás:</strong> {selected.internal_description || '-'}</div>
                    </div>
                  }
                  placement="topLeft"
                >
                  <div style={{ flex: 1 }}>
                    <Alert message={`Kiválasztva: ${selected.name} (${selected.code || 'nincs kód'})`} type="info" showIcon style={{ marginBottom: 0 }} />
                  </div>
                </Tooltip>
                <Button icon={<EditOutlined />} onClick={() => openEdit(selected)} title="Tétel szerkesztése új lapon" />
              </div>
            )}
          </>
        )}

        {/* Manufacturing tab: also show the price/qty/discount form when selected.
            When editing a manufacturing item the detailed inline form already contains qty/price,
            so we hide this simplified line-item form.
            Also hide when the item was created/edited via the inline form (manuCreatedId is set). */}
        {(activeKey !== 'manufacturing' || selected) && !(mode === 'edit' && activeKey === 'manufacturing') && !(activeKey === 'manufacturing' && manuCreatedId !== null) && (
          <Form layout="vertical" form={form} onValuesChange={handleLineFormValuesChange}>
            {commonFields}
          </Form>
        )}

        {/* Service sub-items (altételek): show cost_items_data from the selected service */}
        {activeKey === 'service' && selected && manuCostItems.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Altételek (forrás: {selected.name})</div>
            <Table
              dataSource={manuCostItems}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Megnevezés', dataIndex: 'name', key: 'name' },
                { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 70 },
                { title: 'Menny.', key: 'quantity', width: 95, render: (_: any, r: CostItem) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <NumInput formula size="small" value={r.quantity} onChange={v => manuUpdateCostItem(r.id, 'quantity', v)} min={0} controls={false} style={{ width: 52 }} />
                    <Tooltip title="Tétel mennyiségének másolása">
                      <Button size="small" icon={<CopyOutlined />} onClick={() => manuUpdateCostItem(r.id, 'quantity', Number(form.getFieldValue('quantity')) || 1)} style={{ padding: '0 4px' }} />
                    </Tooltip>
                  </div>
                )},
                { title: 'E.ár', dataIndex: 'cost_price', key: 'cost_price', width: 85, render: (v: number) => v?.toLocaleString('hu-HU') },
                {
                  title: 'Forrás',
                  key: 'supplier',
                  render: (_: any, r: CostItem) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Checkbox
                        checked={r.is_internal}
                        onChange={e => { manuUpdateCostItem(r.id, 'is_internal', e.target.checked); manuUpdateCostItem(r.id, 'department_id', null); manuUpdateCostItem(r.id, 'supplier_id', null); }}
                      >Belső</Checkbox>
                      {r.is_internal
                        ? <Select size="small" style={{ width: 150 }} value={r.department_id} onChange={v => manuUpdateCostItem(r.id, 'department_id', v)} allowClear placeholder="Részleg">
                            {manuDepartments.map((d: any) => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
                          </Select>
                        : <Select size="small" style={{ width: 150 }} value={r.supplier_id} onChange={v => manuUpdateCostItem(r.id, 'supplier_id', v)} allowClear showSearch optionFilterProp="label" status={!r.supplier_id ? 'error' : ''} placeholder="Beszállító">
                            {manuSuppliers.map((s: any) => <Select.Option key={s.id} value={s.id} label={s.name}>{s.name}</Select.Option>)}
                          </Select>
                      }
                    </div>
                  )
                },
                { title: '', key: 'del', width: 36, render: (_: any, r: CostItem) => <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setManuCostItems(prev => prev.filter(x => x.id !== r.id))} /> },
              ]}
            />
          </div>
        )}
      </Space>
      <ProductEditorModal
        open={productEditorOpen}
        onCancel={() => setProductEditorOpen(false)}
        onCreated={(created) => {
          setProducts((prev) => [created, ...prev]);
          setSelected(created);
          setProductEditorOpen(false);
        }}
      />
      <ServiceEditorModal
        open={serviceEditorOpen}
        onCancel={() => setServiceEditorOpen(false)}
        onCreated={(created) => {
          setServices((prev) => [created, ...prev]);
          setSelected(created);
          setServiceEditorOpen(false);
        }}
      />
      <ManufacturingProductEditorModal
        open={manuEditorOpen}
        onCancel={() => setManuEditorOpen(false)}
        customer={customer}
        onCreated={(created) => {
          setManuProducts((prev) => [created, ...prev]);
          setSelected(created);
          setManuEditorOpen(false);
        }}
      />

      <ImpositionHelperModal
        open={impositionOpen}
        onClose={() => { setImpositionOpen(false); setImpositionInitialPresetId(null); setImpositionPresetsVersion(v => v + 1); }}
        initialProductWidth={Number(manuForm.getFieldValue('width')) || undefined}
        initialProductHeight={Number(manuForm.getFieldValue('length')) || undefined}
        initialProductQty={Number(manuForm.getFieldValue('manu_quantity')) || undefined}
        initialPresetId={impositionInitialPresetId}
      />

      {/* ── Cost item material / service search modal ─────────────────── */}
      <Modal
        title={costSearchModal.type === 'material' ? 'Alapanyag / Termék keresése' : 'Szolgáltatás keresése'}
        open={costSearchModal.open}
        onCancel={() => { setCostSearchModal({ open: false, type: null }); setCostSearchEditId(null); }}
        footer={null}
        width={860}
        destroyOnClose
      >
        {(() => {
          const isMat = costSearchModal.type === 'material';
          const list: any[] = isMat ? manuMaterials : manuCostServices;
          const normQ = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const q = normQ(costSearchQuery);
          const filtered = q
            ? list.filter(r => normQ([r.code || '', r.name || '', r.description || '', r.unit || ''].join(' ')).includes(q))
            : list;

          const matColumns = [
            { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 110 },
            { title: 'Megnevezés', dataIndex: 'name', key: 'name', width: 200 },
            { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 70 },
            { title: 'Bek. egys. ár', key: 'cost', width: 100, render: (r: any) => {
              const v = Number(r.unit_cost_price) || Number(r.moving_average_cost) || Number(r.net_unit_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'El. egys. ár', key: 'sell', width: 100, render: (r: any) => {
              const v = Number(r.unit_selling_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'Leírás', dataIndex: 'description', key: 'desc', ellipsis: true },
          ];
          const svcColumns = [
            { title: 'Kód', dataIndex: 'code', key: 'code', width: 100 },
            { title: 'Megnevezés', dataIndex: 'name', key: 'name', width: 200 },
            { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 70 },
            { title: 'Bek. egys. ár', key: 'cost', width: 100, render: (r: any) => {
              const v = Number(r.unit_cost_price) || Number(r.unit_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'El. egys. ár', key: 'sell', width: 100, render: (r: any) => {
              const v = Number(r.unit_selling_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'Leírás', dataIndex: 'description', key: 'desc', ellipsis: true },
          ];

          const handleSelect = (record: any) => {
            const type = costSearchModal.type!;
            const unit = record.unit || (type === 'material' ? 'db' : 'alkalom');
            const cp = type === 'material'
              ? (Number(record.unit_cost_price) || Number(record.moving_average_cost) || Number(record.net_unit_price) || 0)
              : (Number(record.unit_cost_price) || Number(record.unit_price) || 0);
            const mu = record.markup_percentage ? Number(record.markup_percentage) : 35;
            const sellUnit = record.unit_selling_price ? Number(record.unit_selling_price) : (cp > 0 ? cp * (1 + mu / 100) : 0);
            // Prefer the material/service's own default_supplier; fall back to the
            // "internal" supplier so the field is never empty.
            const recordSupplierId = (() => {
              const ds = record.default_supplier;
              if (ds == null) return null;
              const id = typeof ds === 'object' ? ds.id : ds;
              return Number.isFinite(Number(id)) ? Number(id) : null;
            })();
            const fallbackSupplierId = (() => {
              const ds = manuSuppliers.find((s: any) =>
                (s.name || '').toLowerCase().includes('belső gyártás') ||
                (s.name || '').toLowerCase().includes('belső márka') ||
                (s.name || '').toLowerCase().includes('internal')
              );
              return ds ? ds.id : null;
            })();
            const defaultSupplierId = recordSupplierId ?? fallbackSupplierId;
            // Ensure the supplier appears in the select options even if it
            // wasn't in the initial filtered supplier list.
            if (recordSupplierId && !manuSuppliers.find((s: any) => s.id === recordSupplierId)) {
              const supObj = (typeof record.default_supplier === 'object' && record.default_supplier)
                ? record.default_supplier
                : { id: recordSupplierId, name: record.default_supplier_name || `#${recordSupplierId}` };
              setManuSuppliers(prev => [supObj, ...prev]);
            }
            const newItem: CostItem = {
              id: Date.now() + Math.random(),
              type,
              ref_id: record.id,
              code: record.code || '',
              name: record.name,
              unit,
              quantity: 1,
              unit_price: cp,
              cost_price: cp,
              markup_percent: manuDefaultMarkupActive ? manuDefaultMarkup : mu,
              selling_unit_price: sellUnit,
              selling_price: sellUnit,
              supplier_id: defaultSupplierId,
              is_per_unit: false,
              is_internal: false,
              department_id: null,
              currency_code: manuCostCurrencyCode,
              currency_id: manuCostCurrencyId,
            };
            if (costSearchEditId !== null) {
              // Update existing row, keep quantity
              setManuCostItems(prev => prev.map(ci => {
                if (ci.id !== costSearchEditId) return ci;
                const qty = ci.quantity || 1;
                return {
                  ...ci,
                  ref_id: record.id,
                  code: record.code || '',
                  name: record.name,
                  unit,
                  unit_price: cp,
                  cost_price: cp * qty,
                  markup_percent: manuDefaultMarkupActive ? manuDefaultMarkup : mu,
                  selling_unit_price: sellUnit,
                  selling_price: sellUnit * qty,
                  // Replace supplier with the new record's default (if any)
                  ...(defaultSupplierId ? { supplier_id: defaultSupplierId, is_internal: false, department_id: null } : {}),
                };
              }));
              setCostSearchEditId(null);
            } else {
              setManuCostItems(prev => [...prev, newItem]);
            }
            setCostSearchModal({ open: false, type: null });
          };

          return (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.Search
                placeholder="Keresés cikkszám, megnevezés, leírás szerint..."
                allowClear
                value={costSearchQuery}
                onChange={e => setCostSearchQuery(e.target.value)}
                style={{ marginBottom: 8 }}
                autoFocus
              />
              <Table
                size="small"
                dataSource={filtered}
                columns={isMat ? matColumns : svcColumns}
                rowKey="id"
                pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
                onRow={(record) => ({
                  onClick: () => handleSelect(record),
                  style: { cursor: 'pointer' },
                })}
                scroll={{ x: 'max-content' }}
              />
            </Space>
          );
        })()}
      </Modal>

      {/* ── Termék / Szolgáltatás betöltő modal ─────────────────── */}
      <Modal
        title={linkSearchModal.type === 'product' ? 'Termék kiválasztása' : 'Szolgáltatás kiválasztása'}
        open={linkSearchModal.open}
        onCancel={() => setLinkSearchModal({ open: false, type: null })}
        footer={null}
        width={860}
        destroyOnClose
      >
        {(() => {
          const isProd = linkSearchModal.type === 'product';
          const list: any[] = isProd ? manuMaterials : manuCostServices;
          const normQ = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const q = normQ(linkSearchQuery);
          const filtered2 = q
            ? list.filter(r => normQ([r.code || '', r.name || '', r.description || '', r.unit || ''].join(' ')).includes(q))
            : list;
          const cols = isProd ? [
            { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 110 },
            { title: 'Megnevezés', dataIndex: 'name', key: 'name', width: 200 },
            { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 70 },
            { title: 'Bek. e.ár', key: 'cost', width: 100, render: (r: any) => {
              const v = Number(r.unit_cost_price) || Number(r.moving_average_cost) || Number(r.net_unit_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'El. e.ár', key: 'sell', width: 100, render: (r: any) => {
              const v = Number(r.unit_selling_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'Leírás', dataIndex: 'description', key: 'desc', ellipsis: true },
          ] : [
            { title: 'Kód', dataIndex: 'code', key: 'code', width: 100 },
            { title: 'Megnevezés', dataIndex: 'name', key: 'name', width: 200 },
            { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 70 },
            { title: 'Bek. e.ár', key: 'cost', width: 100, render: (r: any) => {
              const v = Number(r.unit_cost_price) || Number(r.unit_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'El. e.ár', key: 'sell', width: 100, render: (r: any) => {
              const v = Number(r.unit_selling_price) || 0;
              return v > 0 ? v.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) : '-';
            }},
            { title: 'Leírás', dataIndex: 'description', key: 'desc', ellipsis: true },
          ];
          return (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.Search
                placeholder="Keresés cikkszám, megnevezés szerint..."
                allowClear
                value={linkSearchQuery}
                onChange={e => setLinkSearchQuery(e.target.value)}
                style={{ marginBottom: 8 }}
                autoFocus
              />
              <Table
                size="small"
                dataSource={filtered2}
                columns={cols}
                rowKey="id"
                pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
                onRow={(record) => ({
                  onClick: () => handleLinkItemSelect(record),
                  style: { cursor: 'pointer' },
                })}
                scroll={{ x: 'max-content' }}
              />
            </Space>
          );
        })()}
      </Modal>
    </Modal>
  );
};

export default ItemSelectorModal;
