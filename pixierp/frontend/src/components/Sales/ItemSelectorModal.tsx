import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Modal, Tabs, Input, Table, Button, Form, InputNumber, Select, Space, message, Divider, Alert, Upload, Tooltip, Collapse, Drawer, Tag, Checkbox, Row, Col, Switch, AutoComplete, Typography, Popconfirm, Grid } from 'antd';
import NumInput from '../NumInput';
import { UploadOutlined, SyncOutlined, EditOutlined, SearchOutlined, PlusOutlined, DeleteOutlined, CopyOutlined, ExclamationCircleOutlined, UpOutlined, DownOutlined, LeftOutlined, RightOutlined, AppstoreOutlined, FolderOpenOutlined, ToolOutlined, PrinterOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CostDragHandle, CostDraggableRow, applyCostDnd, buildCostTreeMeta, CostTreeGuide } from '../Manufacturing/CostDnd';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { salesService } from '../../services/salesService';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
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

const cloneModalValue = <T,>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof File !== 'undefined' && value instanceof File) return value;
  if (Array.isArray(value)) return value.map((item) => cloneModalValue(item)) as T;
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneModalValue(item)])
    ) as T;
  }
  return value;
};

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
  cost_items_data?: any[];
  keepOpen?: boolean;
  /** Képletek tárolása (pl. { quantity: '100*1.5', net_unit_price: '200+50' }) */
  formulas?: Record<string, string | null>;
  /** Stored manufacturing product creation payload for deferred creation (new unsaved RFQ) */
  pendingManuPayload?: any;
  /** Fixed exchange rate at RFQ-item level: when true, conversions use locked_exchange_rate. */
  is_rate_locked?: boolean;
  locked_exchange_rate?: number | null;
}

interface ItemSelectorModalProps {
  open: boolean;
  defaultType?: ItemType;
  onCancel: () => void;
  onAdd: (payload: SelectedItemPayload) => Promise<any> | any;
  allowCreate?: boolean;
  mode?: 'add' | 'edit';
  initialSelection?: { item_type: ItemType; ref_id: number; name?: string; code?: string; _fromHistory?: boolean; manufacturing_product_printshop_params?: any; imposition_data?: any };
  initialValues?: Partial<{ quantity: number; unit: string; net_unit_price: number; cost_price: number; vat_rate: number; description: string; internal_description: string; discount_percent: number; discount_amount: number; cost_type: string; customer_order_item: number | null; is_rate_locked: boolean; locked_exchange_rate: number | null; quote_number: string | null; cost_items_data: any[] }>;
  initialFormulas?: Record<string, string | null>;
  customer?: { id: any; name: string; company_id?: any };
  rfqId?: number;
  /** The RFQ's currency code (e.g. 'HUF', 'EUR'). Used to convert manu sell price to the RFQ currency. */
  rfqCurrency?: string;
  /** Full stored payload for pending (not yet API-created) manufacturing items in a new unsaved RFQ */
  initialManuPayload?: any;
  /** The quote_item id — used to load & display existing attachments in edit mode */
  quoteItemId?: number;
  /** Called after an attachment's manufacturing flag is toggled, so parent can refresh its manufacturing panel */
  onManufacturingMarked?: () => void;
  /** When true, shows a "Kinek a költsége?" (cost_type) select in the item form */
  showCostTypeField?: boolean;
  /** Order items to show a "Kapcsolódó tétel" selector in the item form */
  orderItems?: Array<{ id: number; name: string }>;
  /** When true, the "Beszállítók és árkalkuláció" collapse panel is pre-opened */
  expandCosts?: boolean;
  /** When true, renders content without a Modal wrapper — for inline panel use inside a Drawer */
  renderInline?: boolean;
  /** When true, hides the code/cikkszám field entirely (used for quote item contexts where code = auto-generated ajánlatszám) */
  hideCodeField?: boolean;
  /** When provided, hides the inline footer buttons and exposes doSave via this ref */
  saveRef?: React.MutableRefObject<{ save: (keepOpen: boolean) => Promise<void> } | null>;
  /** Callback to save an imposition snapshot at RFQ level (shows "Mentés az ajánlathoz" button in ImpositionHelperModal) */
  onImpositionSaveToRfq?: (snapshot: any, autoName: string) => void | Promise<void>;
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
  // Automatikus mennyiség szinkron állapot
  syncQty?: boolean;
}

const { Search } = Input;

const defaultVat = 27;

export const ItemSelectorModal: React.FC<ItemSelectorModalProps> = ({ open, defaultType = 'product', onCancel, onAdd, allowCreate = true, mode = 'add', initialSelection, initialValues, initialFormulas, customer, rfqId, rfqCurrency, initialManuPayload, quoteItemId, onManufacturingMarked, showCostTypeField, orderItems, expandCosts, renderInline = false, hideCodeField = false, saveRef, onImpositionSaveToRfq }) => {
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
  const savedPriceFromCalc = useMemo(() => {
    const raw = (initialFormulas as any)?._price_from_cost_calc;
    return typeof raw === 'boolean' ? raw : undefined;
  }, [initialFormulas]);

  // Inline manufacturing form state
  const [manuForm] = Form.useForm();
  const [manuSubmitting, setManuSubmitting] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<dayjs.Dayjs | null>(null);
  const [savingKeepOpen, setSavingKeepOpen] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const manuKeepOpenRef = useRef(false);
  const userEditedManuFieldsRef = useRef<Set<string>>(new Set());
  // Stores the manufacturing product's own sell-currency net_unit_price after async load.
  // Used to restore the form field if something (timing, effect order) resets it to 0.
  const manuInitialPriceRef = useRef<number | null>(null);
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
  const [manuHasPrintShop, setManuHasPrintShop] = useState(false); // van-e printshop_params a terméken
  const [manuPendingFiles, setManuPendingFiles] = useState<File[]>([]);
  const [manuPendingFileRemarks, setManuPendingFileRemarks] = useState<Record<string, string>>({});
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [existingRemarks, setExistingRemarks] = useState<Record<number, string>>({});
  const [existingNames, setExistingNames] = useState<Record<number, string>>({});
  const [renamingAttachmentId, setRenamingAttachmentId] = useState<number | null>(null);

  // Ctrl+V paste: add image to pending files
  const handlePaste = useCallback((file: File) => {
    if (activeKey === 'manufacturing') {
      setManuPendingFiles(prev => [...prev, file]);
    } else {
      setPendingFiles(prev => [...prev, file]);
    }
  }, [activeKey]);
  useClipboardImagePaste(handlePaste, !!open);
  // Currency state for the inline manu form
  const [manuCurrencies, setManuCurrencies] = useState<ManuCurrency[]>([]);
  const [manuSellCurrencyCode, setManuSellCurrencyCode] = useState<string>('HUF');
  const [manuSellCurrencyId, setManuSellCurrencyId] = useState<number | null>(null);
  // Cost-side currency (prices in the cost panel are entered in this currency)
  const [manuCostCurrencyCode, setManuCostCurrencyCode] = useState<string>('HUF');
  const [manuCostCurrencyId, setManuCostCurrencyId] = useState<number | null>(null);
  // Locked exchange rate: when true, conversions use the saved rate (lockedExchangeRate)
  // instead of the current Currency.exchange_rate. Stored per RFQ item.
  const [isRateLocked, setIsRateLocked] = useState<boolean>(false);
  const [lockedExchangeRate, setLockedExchangeRate] = useState<number | null>(null);

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

  // Set of cost item IDs whose quantity should auto-sync with the main quantity
  const [syncQtyRows, setSyncQtyRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    const qty = Number(manuWatchQty) || 1;
    if (!syncQtyRows.size) return;
    setManuCostItems(prev => prev.map(r =>
      syncQtyRows.has(r.id) ? { ...r, quantity: qty } : r
    ));
  }, [manuWatchQty]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const setManuFormInitialValues = (nextValues: Record<string, any>) => {
    const mergedValues = { ...nextValues };
    Object.keys(nextValues).forEach((field) => {
      if (userEditedManuFieldsRef.current.has(field) || manuForm.isFieldTouched(field)) {
        mergedValues[field] = manuForm.getFieldValue(field);
      }
    });
    manuForm.setFieldsValue(mergedValues);
  };

  const handleManuFormValuesChange = (changed: Record<string, any>) => {
    Object.keys(changed || {}).forEach((field) => {
      userEditedManuFieldsRef.current.add(field);
    });
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
    // Sync sub-item quantities when main quantity changes (service tab)
    if ('quantity' in changed && syncQtyRows.size > 0) {
      const qty = Number(changed.quantity) || 1;
      setManuCostItems(prev => prev.map(r =>
        syncQtyRows.has(r.id) ? { ...r, quantity: qty } : r
      ));
    }
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

  // Defensive: after the product loads and manuPriceFromCalc settles to false, ensure the
  // price field is not 0 or undefined.  manuCreatedId is set in the same state batch as
  // manuPriceFromCalc=false, so this effect fires once after both values are committed.
  useEffect(() => {
    if (!manuCreatedId || manuPriceFromCalc) return;
    const storedPrice = manuInitialPriceRef.current;
    if (storedPrice === null || storedPrice <= 0) return;
    const currentPrice = manuForm.getFieldValue('manu_net_unit_price');
    if (!currentPrice) {
      const q = manuForm.getFieldValue('manu_quantity') || 1;
      manuForm.setFieldsValue({
        manu_net_unit_price: storedPrice,
        manu_net_total: parseFloat((storedPrice * q).toFixed(2)),
      });
    }
  }, [manuCreatedId, manuPriceFromCalc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setActiveKey(mode === 'edit' && initialSelection?.item_type ? initialSelection.item_type : defaultType);
    setManuCollapseKeys(expandCosts ? ['costs'] : []);
    setPendingFiles([]);
    setPendingFileRemarks({});
    manuForm.resetFields();
    userEditedManuFieldsRef.current = new Set();
    manuInitialPriceRef.current = null;
    setManuCostItems([]);
    setSyncQtyRows(new Set());
    setManuDimensionsPerUnit(true);
    setManuCalculatedVolumes({ unit: 0, total: 0 });
    setManuCalculatedTotalDims(null);
    setManuPriceFromCalc(mode === 'edit' ? (savedPriceFromCalc ?? false) : true);
    setManuPendingFiles([]);
    setManuPendingFileRemarks({});
    setExistingAttachments([]);
    setExistingRemarks({});
    setExistingNames({});
    setRenamingAttachmentId(null);
    if (mode === 'edit' && quoteItemId) {
      salesService.getQuoteRequestItemAttachments(quoteItemId)
        .then((atts: any[]) => {
          setExistingAttachments(atts || []);
          const rm: Record<number, string> = {};
          const nm: Record<number, string> = {};
          (atts || []).forEach((a: any) => {
            rm[a.id] = a.remark || '';
            const fn = a.original_filename || a.file?.split('/').pop() || '';
            const dotIdx = fn.lastIndexOf('.');
            nm[a.id] = dotIdx > 0 ? fn.slice(0, dotIdx) : fn;
          });
          setExistingRemarks(rm);
          setExistingNames(nm);
        })
        .catch(() => {});
    }
    setManuDefaultMarkup(30);
    setManuDefaultMarkupActive(false);
    setManuCreatedId(null);
    setManuHasPrintShop(false);
    setSelected(null);
    const nextKey = (mode === 'edit' && initialSelection?.item_type ? initialSelection.item_type : defaultType) as ItemType;
    if (!(mode === 'edit' && nextKey === 'manufacturing') && !(nextKey === 'manufacturing' && !!quoteItemId)) {
      form.resetFields();
    }
    setManuSellCurrencyCode('HUF');
    setManuSellCurrencyId(null);
    setManuCostCurrencyCode('HUF');
    setManuCostCurrencyId(null);
    setLockedExchangeRate(null);
    setLinkedItem(null);
    setLinkSearchQuery('');
    loadData();
    if (mode === 'edit') {
      if (initialValues && nextKey !== 'manufacturing') {
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
        if (initialValues.is_rate_locked != null) setIsRateLocked(!!initialValues.is_rate_locked);
        if (initialValues.locked_exchange_rate != null) setLockedExchangeRate(Number(initialValues.locked_exchange_rate));
      }
      if (initialFormulas) {
        setItemFormFormulas(initialFormulas);
      }
    }
  }, [open, defaultType, mode, quoteItemId, savedPriceFromCalc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize sell currency from rfqCurrency for direct (no-MP) items in edit mode.
  // Runs when manuCurrencies loads (which is async) so it reliably overrides the 'HUF' reset.
  useEffect(() => {
    if (!open || mode !== 'edit' || !quoteItemId) return;
    if (!rfqCurrency || !manuCurrencies.length) return;
    const rfqCurrObj = manuCurrencies.find((c: any) => c.code.toUpperCase() === rfqCurrency.toUpperCase());
    if (rfqCurrObj) {
      setManuSellCurrencyCode(rfqCurrObj.code.toUpperCase());
      setManuSellCurrencyId(rfqCurrObj.id ?? null);
    }
  }, [open, mode, quoteItemId, rfqCurrency, manuCurrencies]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const savedEditPrice = (mode === 'edit' && initialValues?.net_unit_price != null)
          ? Number(initialValues.net_unit_price)
          : null;
        const price = (savedEditPrice != null && isFinite(savedEditPrice))
          ? savedEditPrice
          : (rec.base_price ?? rec.net_unit_price ?? rec.unit_selling_price ?? form.getFieldValue('net_unit_price'));
        const cost = getRecordCostPrice(rec);
        const priceNum = Number(price) || 0;
        const markup = (priceNum > 0 && cost > 0) ? parseFloat((((priceNum / cost) - 1) * 100).toFixed(2)) : 0;
        const patch: any = { unit, net_unit_price: price, cost_price: cost, markup_percent: markup };
        if (mode === 'edit' && initialValues?.quantity != null) {
          patch.quantity = Number(initialValues.quantity) || 0;
        }
        form.setFieldsValue(patch);
      } else {
        setSelected({ id: initialSelection.ref_id, name: initialSelection.name, code: initialSelection.code });
      }
    };
    pickFromLists();
  }, [open, products, manuProducts, services, initialSelection, mode, initialValues]);

  // When editing an existing manufacturing item, fetch full product (incl. cost_items) and pre-fill the inline form.
  // Also runs when mode='add' with an existing ref_id (copy flow) — pre-fills the form but does NOT set manuCreatedId,
  // so that saving creates a new independent product instead of patching the original.
  useEffect(() => {
    if (!open) return;
    // PrintShop detektálás korai jelzése az initialSelection-ből
    if ((initialSelection?.manufacturing_product_printshop_params &&
        Object.keys(initialSelection.manufacturing_product_printshop_params).length > 0) ||
        (initialSelection as any)?.imposition_data?._ps_mfg_id) {
      setManuHasPrintShop(true);
    }
    const isAddWithPreload = mode === 'add' && initialSelection?.item_type === 'manufacturing';
    if (mode !== 'edit' && !isAddWithPreload) return;
    if (!initialSelection || initialSelection.item_type !== 'manufacturing') return;
    // New-style direct item: no ManufacturingProduct, populate manuForm from initialValues
    if (!initialSelection.ref_id) {
      if (mode === 'add' || (mode === 'edit' && !quoteItemId)) {
        // Copy flow / history item edit: preload form from initialValues
        setManuFormInitialValues({
          name: initialSelection.name || '',
          code: initialValues?.quote_number || '',
          description: initialValues?.description || '',
          internal_description: initialValues?.internal_description || '',
          manu_quantity: Number(initialValues?.quantity) || 1,
          quantity_unit: initialValues?.unit || 'db',
          manu_net_unit_price: Number(initialValues?.net_unit_price) || 0,
          manu_net_total: parseFloat(((Number(initialValues?.quantity) || 1) * (Number(initialValues?.net_unit_price) || 0)).toFixed(2)),
        });
        if (initialValues?.cost_items_data && initialValues.cost_items_data.length > 0) {
          const loadedItems: CostItem[] = initialValues.cost_items_data.map((ci: any, idx: number) => ({
            ...ci,
            id: ci.id ?? -(idx + 1),
          }));
          setManuCostItems(loadedItems);
          setSyncQtyRows(new Set(loadedItems.filter(i => i.syncQty).map(i => i.id)));
          // savedPriceFromCalc (from formulas) takes priority; fallback to heuristic
          setManuPriceFromCalc(savedPriceFromCalc !== undefined ? savedPriceFromCalc : loadedItems.length > 0);
        }
      } else if (mode === 'edit' && quoteItemId) {
        setManuFormInitialValues({
          name: initialSelection.name || '',
          code: initialValues?.quote_number || '',
          description: initialValues?.description || '',
          internal_description: initialValues?.internal_description || '',
          manu_quantity: Number(initialValues?.quantity) || 1,
          quantity_unit: initialValues?.unit || 'db',
          manu_net_unit_price: Number(initialValues?.net_unit_price) || 0,
          manu_net_total: parseFloat(((Number(initialValues?.quantity) || 1) * (Number(initialValues?.net_unit_price) || 0)).toFixed(2)),
        });
        // Initialize sell currency from RFQ currency for direct (no-MP) items
        if (rfqCurrency && manuCurrencies.length > 0) {
          const rfqCurrObj = manuCurrencies.find(c => c.code.toUpperCase() === rfqCurrency.toUpperCase());
          if (rfqCurrObj) {
            setManuSellCurrencyCode(rfqCurrObj.code.toUpperCase());
            setManuSellCurrencyId(rfqCurrObj.id ?? null);
          }
        }
        if (initialValues?.is_rate_locked != null) setIsRateLocked(!!initialValues.is_rate_locked);
        if (initialValues?.locked_exchange_rate != null) setLockedExchangeRate(Number(initialValues.locked_exchange_rate));
        // Load saved cost items for direct (no-MP) items
        if (initialValues?.cost_items_data && initialValues.cost_items_data.length > 0) {
          const loadedItems: CostItem[] = initialValues.cost_items_data.map((ci: any, idx: number) => {
            // Inject supplier into manuSuppliers list so the Select can show the name
            if (!ci.is_internal && ci.supplier) {
              const sName = ci.supplier_name || `#${ci.supplier}`;
              setManuSuppliers(prev => {
                if (prev.find((s: any) => s.id === ci.supplier)) return prev;
                return [{ id: ci.supplier, name: sName }, ...prev];
              });
            }
            if (ci.is_internal && ci.department) {
              const dName = ci.department_name || `#${ci.department}`;
              setManuDepartments(prev => {
                if (prev.find((d: any) => d.id === ci.department)) return prev;
                return [{ id: ci.department, name: dName }, ...prev];
              });
            }
            return {
              ...ci,
              id: ci.id ?? -(idx + 1),
              // Map API field names to CostItem interface names
              supplier_id: ci.supplier_id ?? ci.supplier ?? null,
              department_id: ci.department_id ?? ci.department ?? null,
            };
          });
          setManuCostItems(loadedItems);
          setSyncQtyRows(new Set(loadedItems.filter(i => i.syncQty).map(i => i.id)));
        }
        setManuPriceFromCalc(savedPriceFromCalc ?? false);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Pending (not yet API-created) manufacturing item — restore from stored payload
        if (initialSelection.ref_id < 0) {
          if (!initialManuPayload) return;
          const p = cloneModalValue(initialManuPayload);
          setManuFormInitialValues({
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
          const items: CostItem[] = cloneModalValue(p._costItemsState || []);
          setManuCostItems(items);
          // Restore syncQtyRows from persisted syncQty flags
          const syncSet = new Set(items.filter(i => i.syncQty).map(i => i.id));
          setSyncQtyRows(syncSet);
          if (mode === 'edit') {
            if (savedPriceFromCalc !== undefined) setManuPriceFromCalc(savedPriceFromCalc);
            else setManuPriceFromCalc(false);
          } else if (savedPriceFromCalc !== undefined) {
            setManuPriceFromCalc(savedPriceFromCalc);
          } else if (typeof p.price_from_cost_calc === 'boolean') {
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
          setSelected(cloneModalValue({ ...p, id: initialSelection.ref_id, __type: 'manufacturing' }));
          setActiveKey('manufacturing');
          return;
        }
        const p: any = await manufacturingService.getProduct(initialSelection.ref_id);
        if (cancelled || !p) return;
        // PrintShop detektálás: termékből VAGY initialSelection-ból (RFQ tétel serializer már tartalmazza)
        const hasPs = !!(p.printshop_params && Object.keys(p.printshop_params).length > 0) ||
                      !!(initialSelection.manufacturing_product_printshop_params &&
                         Object.keys(initialSelection.manufacturing_product_printshop_params).length > 0);
        setManuHasPrintShop(hasPs);
        const qty = Number(p.quantity) || 1;
        const unitPrice = Number(p.net_unit_price) || 0;
        // In edit mode, preserve the saved RFQ item unit price to avoid
        // overriding with manufacturing master price (which can be 0).
        const savedEditUnitPrice = ((mode === 'edit' || !!quoteItemId) && initialValues?.net_unit_price != null)
          ? Number(initialValues.net_unit_price)
          : null;
        const savedQty = ((mode === 'edit' || !!quoteItemId) && initialValues?.quantity != null && Number(initialValues.quantity) > 0)
          ? Number(initialValues.quantity)
          : null;
        const displayQty = savedQty ?? qty;
        const displayPrice = (savedEditUnitPrice != null && isFinite(savedEditUnitPrice)) ? savedEditUnitPrice : unitPrice;
        // Store for defensive effect below (handles race where form ends up 0)
        manuInitialPriceRef.current = displayPrice;
        setManuFormInitialValues({
          // When editing an RFQ item, use the item's saved display name (item_name if set,
          // otherwise manufacturing product name) — NOT the manufacturing master's name.
          // This prevents the master name from silently overwriting a custom item_name.
          name: (quoteItemId && initialSelection?.name) ? initialSelection.name : p.name,
          code: (mode === 'edit' && initialValues?.quote_number) ? initialValues.quote_number : p.code,
          description: p.description || '',
          internal_description: p.internal_description || '',
          manu_quantity: displayQty,
          quantity_unit: p.quantity_unit || 'db',
          manu_net_unit_price: displayPrice,
          manu_net_total: parseFloat((displayPrice * displayQty).toFixed(2)),
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
          // Ensure supplier is in manuSuppliers list (same as service cost item handling)
          if (!c.is_internal && c.supplier && c.supplier_name) {
            setManuSuppliers(prev => {
              if (prev.find((s: any) => s.id === c.supplier)) return prev;
              return [{ id: c.supplier, name: c.supplier_name }, ...prev];
            });
          }
          if (c.is_internal && c.department) {
            const dName = c.department_name || `#${c.department}`;
            setManuDepartments(prev => {
              if (prev.find((d: any) => d.id === c.department)) return prev;
              return [{ id: c.department, name: dName }, ...prev];
            });
          }
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
        // PrintShop detektálás cost items-ből: ha van _syncQty: false, az PrintShopból jött
        if (!manuHasPrintShop && items.some(ci => (ci.formulas as any)?._syncQty === false)) {
          setManuHasPrintShop(true);
        }
        // Restore syncQty from saved formulas._syncQty flag (persisted since fix).
        // For legacy items without _syncQty saved, default to ON (unless loaded from history).
        if (!initialSelection?._fromHistory) {
          const syncSet = new Set(
            items
              .filter(i => (i.formulas as any)?._syncQty !== false)
              .map(i => i.id)
          );
          setSyncQtyRows(syncSet);
        }
        // Restore saved checkbox state; savedPriceFromCalc always takes priority over product defaults
        if (savedPriceFromCalc !== undefined) {
          setManuPriceFromCalc(savedPriceFromCalc);
        } else if (mode === 'edit' || !!quoteItemId) {
          setManuPriceFromCalc(false);
        } else if (typeof p.price_from_cost_calc === 'boolean') {
          setManuPriceFromCalc(p.price_from_cost_calc);
        } else {
          setManuPriceFromCalc(unitPrice === 0 && items.length > 0);
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
        // In edit mode: track the product ID so save() patches it.
        // In add+preload mode (copy flow): leave manuCreatedId=null so save() creates a new product.
        if (mode === 'edit') {
          setManuCreatedId(p.id);
        }
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
      const suppList = Array.isArray(rawSupps) ? rawSupps.sort((a: any, b: any) => a.name.localeCompare(b.name)) : [];
      setManuSuppliers(prev => {
        const merged = [...suppList];
        prev.forEach(p => { if (!merged.find(s => s.id === p.id)) merged.push(p); });
        return merged;
      });
      const deptList = (deptsRes as any).results ?? deptsRes ?? [];
      const deptArr = Array.isArray(deptList) ? deptList : [];
      setManuDepartments(prev => {
        const merged = [...deptArr];
        prev.forEach(p => { if (!merged.find(d => d.id === p.id)) merged.push(p); });
        return merged;
      });
      // Currencies
      const currList: ManuCurrency[] = Array.isArray(currencyRes) ? currencyRes : [];
      setManuCurrencies(currList);
      // Unit suggestions
      setUnitSuggestions(Array.isArray(unitSuggestionsRes) ? unitSuggestionsRes : []);
      // Set default currency for new items only.
      // In edit mode, currency is loaded from the product itself by the separate
      // item-loading effect — do NOT overwrite it here (race condition would reset EUR→HUF).
      const defCurr = currList.find(c => c.is_default);
      if (defCurr && !(mode === 'edit' && initialSelection?.item_type === 'manufacturing')) {
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
        {activeKey !== 'service' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Upload.Dragger
            name="files"
            multiple
            showUploadList={false}
            beforeUpload={(file) => { setPendingFiles((prev) => [...prev, file]); return false; }}
            fileList={pendingFiles as any}
            style={{ width: 100, minWidth: 100, height: 100, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <div style={{ textAlign: 'center', padding: '8px 4px' }}>
              <UploadOutlined style={{ fontSize: 20, color: '#1677ff' }} />
              <div style={{ fontSize: 10, color: '#888', marginTop: 4, lineHeight: 1.3 }}>Húzd ide<br/>vagy Ctrl+V</div>
            </div>
          </Upload.Dragger>
          <div style={{ flex: 1, minWidth: 0 }}>
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: existingAttachments.length > 0 ? 6 : 0 }}>
                {pendingFiles.map((f: any) => {
                  const key = (f as any)?.uid || (f as any)?.name;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => { setPendingFiles(prev => prev.filter((x: any) => ((x as any).uid || (x as any).name) !== key)); }} />
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{(f as any)?.name}</span>
                      <Input size="small" placeholder="Megjegyzés" style={{ flex: 1 }} value={pendingFileRemarks[key] || ''} onChange={(e) => setPendingFileRemarks((prev) => ({ ...prev, [key]: e.target.value }))} />
                    </div>
                  );
                })}
              </div>
            )}
            {existingAttachments.length > 0 && (
              <div>
                {existingAttachments.map((att: any) => (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <Popconfirm
                      title="Biztosan töröljük ezt a fájlt?"
                      okText="Igen"
                      cancelText="Mégse"
                      onConfirm={async () => {
                        if (!quoteItemId) return;
                        try { await salesService.deleteQuoteRequestItemAttachment(quoteItemId, att.id); setExistingAttachments(prev => prev.filter((a: any) => a.id !== att.id)); }
                        catch { message.error('Nem sikerült törölni'); }
                      }}
                    >
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                    <Tooltip title={att.is_manufacturing_file ? 'Gyártási file jelölés levétele' : 'Megjelölés gyártási file-ként'}>
                      <Button type="text" size="small" icon={<ToolOutlined style={{ color: att.is_manufacturing_file ? '#fa8c16' : '#bfbfbf' }} />}
                        onClick={async () => {
                          if (!quoteItemId) return;
                          const next = !att.is_manufacturing_file;
                          try {
                            await salesService.setQuoteRequestItemAttachmentManufacturing(quoteItemId, att.id, next);
                            setExistingAttachments(prev => prev.map((a: any) => a.id === att.id ? { ...a, is_manufacturing_file: next } : a));
                            onManufacturingMarked?.();
                            message.success(next ? 'Megjelölve gyártási file-ként' : 'Gyártási file jelölés levéve');
                          } catch { message.error('Nem sikerült módosítani'); }
                        }}
                      />
                    </Tooltip>
                    {(() => {
                      const fn = att.original_filename || att.file?.split('/').pop() || `#${att.id}`;
                      const dotIdx = fn.lastIndexOf('.');
                      const ext = dotIdx > 0 ? fn.slice(dotIdx) : '';
                      const fileUrl = att.file_url || att.file;
                      const isImage = !!fileUrl && (((att.content_type || '').toLowerCase().startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn));
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 0 }}>
                          {renamingAttachmentId === att.id ? (
                            <>
                              <Input
                                size="small"
                                autoFocus
                                style={{ width: 120 }}
                                value={existingNames[att.id] ?? (dotIdx > 0 ? fn.slice(0, dotIdx) : fn)}
                                onChange={(e) => setExistingNames(prev => ({ ...prev, [att.id]: e.target.value }))}
                                onPressEnter={async (e) => {
                                  const val = (e.currentTarget.value || '').trim();
                                  if (!quoteItemId || !val) { setRenamingAttachmentId(null); return; }
                                  try { await salesService.renameQuoteRequestItemAttachment(quoteItemId, att.id, val + ext); }
                                  catch {}
                                  setRenamingAttachmentId(null);
                                }}
                                onBlur={async (e) => {
                                  const val = (e.target.value || '').trim();
                                  if (!quoteItemId || !val) { setRenamingAttachmentId(null); return; }
                                  try { await salesService.renameQuoteRequestItemAttachment(quoteItemId, att.id, val + ext); }
                                  catch {}
                                  setRenamingAttachmentId(null);
                                }}
                              />
                              {ext && <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{ext}</span>}
                            </>
                          ) : (
                            <Tooltip
                              placement="top"
                              title={isImage ? (
                                <div style={{ maxWidth: 260 }}>
                                  <img src={fileUrl} alt={fn} style={{ maxWidth: 240, maxHeight: 180, display: 'block', marginBottom: 6, borderRadius: 4 }} />
                                  <div style={{ fontSize: 11, color: '#bbb', wordBreak: 'break-all' }}>{fn}</div>
                                </div>
                              ) : (
                                <div style={{ maxWidth: 260, wordBreak: 'break-all' }}>{fn}</div>
                              )}
                            >
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {fn}
                              </a>
                            </Tooltip>
                          )}
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined style={{ fontSize: 11 }} />}
                            onClick={() => setRenamingAttachmentId(att.id)}
                            title="Átnevezés"
                            style={{ padding: '0 4px' }}
                          />
                        </div>
                      );
                    })()}
                    <Input size="small" placeholder="Megjegyzés" style={{ flex: 1 }}
                      value={existingRemarks[att.id] ?? att.remark ?? ''}
                      onChange={(e) => setExistingRemarks(prev => ({ ...prev, [att.id]: e.target.value }))}
                      onBlur={async (e) => {
                        if (!quoteItemId) return;
                        try { await salesService.updateQuoteRequestItemAttachmentRemark(quoteItemId, att.id, e.target.value); }
                        catch {}
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
        {activeKey !== 'service' && (
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
        )}
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
      // Default: sync quantity ON for all cost items when loading a service
      setSyncQtyRows(new Set(items.map(i => i.id)));
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
      const _liveSellRate = (_sellCurrObj && _sellCurrObj.exchange_rate > 0) ? _sellCurrObj.exchange_rate : 1;
      const _sellCurrRate = (isRateLocked && lockedExchangeRate && lockedExchangeRate > 0) ? lockedExchangeRate : _liveSellRate;
      const _rfqCurrObj = rfqCurrency ? manuCurrencies.find(c => c.code.toUpperCase() === rfqCurrency.toUpperCase()) : null;
      const _rfqCurrRate = (_rfqCurrObj && _rfqCurrObj.exchange_rate > 0) ? _rfqCurrObj.exchange_rate : 1;
      const netUnitPriceForRfq = parseFloat((netUnitPriceForPayload * _sellCurrRate / _rfqCurrRate).toFixed(4));
      const calcFormulas = { ...(itemFormFormulas || {}), _price_from_cost_calc: manuPriceFromCalc } as Record<string, any>;

      const payload = {
        name: v.name,
        code: v.code,
        description: v.description || '',
        internal_description: v.internal_description || '',
        quantity: productQtyForPayload,
        quantity_unit: v.quantity_unit || 'db',
        net_unit_price: parseFloat(netUnitPriceForPayload.toFixed(2)),
        net_total_price: parseFloat(netTotalPriceForPayload.toFixed(2)),
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
            formulas: { ...(c.formulas || {}), _syncQty: syncQtyRows.has(c.id) },
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

      // ── Új metódus: quoteItemId beállítva, de nincs ManufacturingProduct ────
      // A QRI-t közvetlenül frissítjük, nem kell MP PATCH
      if (quoteItemId && !effectiveManuId) {
        const unit = translateUnit(v.quantity_unit || 'db');
        const directPayload: any = {
          item_type: 'manufacturing',
          ref_id: null,
          name: v.name,
          unit,
          base_price: netUnitPriceForRfq,
          quantity: productQtyForPayload,
          net_unit_price: netUnitPriceForRfq,
          vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
          description: v.description || '',
          internal_description: v.internal_description || '',
          discount_percent: Number(form.getFieldValue('discount_percent')) || 0,
          discount_amount: Number(form.getFieldValue('discount_amount')) || 0,
          formulas: calcFormulas,
          is_rate_locked: isRateLocked,
          locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
          cost_items_data: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
          _sellCurrencyCode: manuSellCurrencyCode,
          keepOpen,
          files: manuPendingFiles,
          fileRemarks: manuPendingFileRemarks,
        };
        await onAdd(directPayload);
        message.success('Tétel mentve');
        setManuPendingFiles([]);
        setManuPendingFileRemarks({});
        if (!keepOpen) setLastSavedAt(dayjs());
        return;
      }

      if (isEdit && effectiveManuId! > 0) {
        if (!rfqId) {
          // Do NOT patch the original product. Store the edited data as a pending
          // payload so a brand-new independent product is created when the RFQ is saved.
          const tempId = -Date.now();
          setManuCreatedId(tempId);
          const unit = translateUnit(v.quantity_unit || 'db');
          form.setFieldsValue({ unit, net_unit_price: netUnitPriceForRfq, quantity: productQtyForPayload });
          setSelected({ ...v, id: tempId, __type: 'manufacturing' });
          const deferredPayload = {
            ...payload,
            _costItemsState: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
            _currency: { id: manuSellCurrencyId, code: manuSellCurrencyCode },
            _costCurrency: { id: manuCostCurrencyId, code: manuCostCurrencyCode },
          };
          const pendingUpdatePayload = {
            item_type: 'manufacturing' as const,
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
            formulas: calcFormulas,
            pendingManuPayload: deferredPayload,
            is_rate_locked: isRateLocked,
            locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
          };
          await onAdd({ ...pendingUpdatePayload, keepOpen } as any);
          message.success('Egyedi gyártás módosítva (az ajánlat mentésekor kerül a rendszerbe)');
        } else {
        // ── Real product in existing RFQ: PATCH (status unchanged) ───────────
        const { status: _s, ...patchPayload } = payload as any;
        if (quoteItemId) {
          delete patchPayload.name;
          delete patchPayload.code; // quote_number kerül a code mezőbe edit módban, ne írjuk felül a gyártási termék kódját
        }
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
        // If sell currency differs from RFQ currency, we're about to change the RFQ currency to match
        // the sell currency — so store the price in sell currency directly (no conversion).
        // If they're already the same, the formula is a no-op (rate/rate = 1) but kept for precision.
        const _sellAndRfqMatch = manuSellCurrencyCode.toUpperCase() === (rfqCurrency || 'HUF').toUpperCase();
        const updatedUnitPriceForRfq = _sellAndRfqMatch
          ? parseFloat((updatedUnitPrice * _sellCurrRate / _rfqCurrRate).toFixed(4))
          : parseFloat(updatedUnitPrice.toFixed(4));
        form.setFieldsValue({ unit, net_unit_price: updatedUnitPriceForRfq, quantity: updated.quantity || 1 });
        const rfqUpdatePayload: SelectedItemPayload = {
          item_type: 'manufacturing',
          ref_id: effectiveManuId!,
          name: v.name,
          code: updated.code,
          unit,
          base_price: updatedUnitPriceForRfq,
          quantity: updatedQty,
          net_unit_price: updatedUnitPriceForRfq,
          vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
          description: updated.description || '',
          discount_percent: Number(form.getFieldValue('discount_percent')) || 0,
          discount_amount: Number(form.getFieldValue('discount_amount')) || 0,
          formulas: calcFormulas,
          is_rate_locked: isRateLocked,
          locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
          cost_items_data: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
        };
        await onAdd({ ...rfqUpdatePayload, _sellCurrencyCode: manuSellCurrencyCode, files: manuPendingFiles, fileRemarks: manuPendingFileRemarks, keepOpen } as any);
        setLastSavedAt(dayjs());
        setManuPendingFiles([]);
        setManuPendingFileRemarks({});
        }

      } else if (isEdit && effectiveManuId! < 0) {
        // ── Pending item update — no API call yet, just update stored payload ─
        const tempId = effectiveManuId!;
        const unit = translateUnit(v.quantity_unit || 'db');
        form.setFieldsValue({ unit, net_unit_price: netUnitPriceForRfq, quantity: productQtyForPayload });
        setSelected({ ...v, id: tempId, __type: 'manufacturing' });
        const deferredPayload = {
          ...payload,
          _costItemsState: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
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
          formulas: calcFormulas,
          pendingManuPayload: deferredPayload,
          is_rate_locked: isRateLocked,
          locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
        };
        await onAdd({ ...pendingUpdatePayload, keepOpen } as any);
        message.success('Egyedi gyártás módosítva (az ajánlat mentésekor kerül a rendszerbe)');

      } else if (rfqId) {
        // ── Új metódus: QRI közvetlenül létrehozva, ManufacturingProduct nélkül ──
        const created = await salesService.createDirectManufacturingItem(rfqId, {
          name: v.name,
          quantity: productQtyForPayload,
          description: v.description || '',
          internal_description: v.internal_description || '',
          quantity_unit: v.quantity_unit || 'db',
          net_unit_price: parseFloat(netUnitPriceForPayload.toFixed(2)),
          vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
          discount_percent: Number(form.getFieldValue('discount_percent')) || 0,
          discount_amount: Number(form.getFieldValue('discount_amount')) || 0,
          formulas: calcFormulas,
          cost_items: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
        });
        message.success('Egyedi tétel létrehozva');

        // QRI már létrehozva a backenden — csak jelzünk a szülőnek hogy frissítsen
        const unit = translateUnit(created.unit || v.quantity_unit || 'db');
        form.setFieldsValue({ unit, net_unit_price: netUnitPriceForRfq, quantity: productQtyForPayload });
        try {
          await onAdd({
            item_type: 'manufacturing',
            ref_id: null as any,
            name: created.item_name || v.name,
            unit,
            base_price: netUnitPriceForRfq,
            quantity: productQtyForPayload,
            net_unit_price: netUnitPriceForRfq,
            vat_rate: Number(form.getFieldValue('vat_rate')) || defaultVat,
            description: v.description || '',
            formulas: calcFormulas,
            is_rate_locked: isRateLocked,
            locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
            _directCreated: created,
            files: manuPendingFiles,
            fileRemarks: manuPendingFileRemarks,
            keepOpen,
          } as any);
          setManuPendingFiles([]);
          setManuPendingFileRemarks({});
        } catch (addErr) {
          message.warning('A tétel létrejött, de a frissítés nem sikerült');
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
          _costItemsState: manuCostItems.map(ci => ({ ...ci, syncQty: syncQtyRows.has(ci.id) })),
          _currency: { id: manuSellCurrencyId, code: manuSellCurrencyCode },
          _costCurrency: { id: manuCostCurrencyId, code: manuCostCurrencyCode },
        };

        try {
          const rfqPayload: SelectedItemPayload = {
            item_type: 'manufacturing',
            ref_id: tempId,
            name: v.name,
            code: undefined,
            unit,
            base_price: netUnitPriceForRfq,
            quantity: productQtyForPayload,
            net_unit_price: netUnitPriceForRfq,
            vat_rate: 27,
            description: v.description || '',
            formulas: calcFormulas,
            manuCostItems: costItemsForRfq,
            pendingManuPayload: deferredPayload,
            is_rate_locked: isRateLocked,
            locked_exchange_rate: isRateLocked ? lockedExchangeRate : null,
          };
          await onAdd({ ...rfqPayload, files: manuPendingFiles, fileRemarks: manuPendingFileRemarks, keepOpen } as any);
          setManuPendingFiles([]);
          setManuPendingFileRemarks({});
          if (keepOpen) {
            // Reset so the next submission creates a brand-new item (not an update of this one)
            setManuCreatedId(null);
            manuForm.resetFields();
            setManuCostItems([]);
            setSyncQtyRows(new Set());
            setSelected(null);
          }
        } catch (addErr) {
          message.warning('Egyedi gyártás hozzáadása nem sikerült');
        }
        message.success('Egyedi gyártás hozzáadva (az ajánlat mentésekor kerül a rendszerbe)');
        // Form stays open for editing — do NOT reset
      }
    } catch (e: any) {
      if (e?.errorFields) {
        // Ant Design form validation error — errors are shown inline
      } else if (e?.response?.data) {
        message.error(`Mentési hiba: ${JSON.stringify(e.response.data)}`);
      } else if (e instanceof Error && e.message) {
        message.error(`Mentési hiba: ${e.message}`);
      } else if (e) {
        message.error('Nem sikerült menteni a tételt');
      }
    } finally {
      setManuSubmitting(false);
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
    const newCostItemId = Date.now() + Math.random();
    setManuCostItems(prev => [...prev, {
      id: newCostItemId,
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
    setSyncQtyRows(prev => { const n = new Set(prev); n.add(newCostItemId); return n; });
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
    setSyncQtyRows(prev => { const n = new Set(prev); n.add(newItem.id); return n; });
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
    { title: 'Menny.', key: 'quantity', width: 110, render: (_: any, r: CostItem) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <NumInput formula size="small" value={r.quantity} onChange={v => { manuUpdateCostItem(r.id, 'quantity', v); setSyncQtyRows(prev => { const n = new Set(prev); n.delete(r.id); return n; }); }} initialFormula={r.formulas?.quantity ?? undefined} onFormulaChange={f => manuUpdateCostItemFormula(r.id, 'quantity', f)} min={0} controls={false} style={{ width: 52 }} />
        <Tooltip title={syncQtyRows.has(r.id) ? 'Automatikus szinkron BE — kattints a kikapcsoláshoz' : 'Kattints: főmennyiség folyamatos átvétele'}>
          <Switch
            size="small"
            checked={syncQtyRows.has(r.id)}
            onChange={checked => {
              setSyncQtyRows(prev => { const n = new Set(prev); checked ? n.add(r.id) : n.delete(r.id); return n; });
              if (checked) {
                const mainQty = Number(manuForm.getFieldValue('manu_quantity') || form.getFieldValue('quantity')) || 1;
                const mainUnit = manuForm.getFieldValue('quantity_unit') || form.getFieldValue('unit') || '';
                manuUpdateCostItem(r.id, 'quantity', mainQty);
                if (mainUnit) manuUpdateCostItem(r.id, 'unit', mainUnit);
              }
            }}
          />
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
          ? <Select size="small" style={{ width:200 }} value={r.department_id} onChange={v => manuUpdateCostItem(r.id, 'department_id', v)} allowClear placeholder="Részleg">
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

  const renderTable = (type: ItemType) => {
    return (
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
  }; // end renderTable

  const bodyContent = (
    <>
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
            <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 16, background: '#fafafa' }}>
                <Form layout="vertical" form={manuForm} onValuesChange={handleManuFormValuesChange}>
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
                    {hideCodeField ? null : (
                      <>
                        <Form.Item label="Cikkszám" name="code" style={{ flex: '1 1 auto', marginBottom: 8, minWidth: 120 }}>
                          <Input placeholder="Auto-generál, ha üres" />
                        </Form.Item>
                        <Button style={{ marginBottom: 8, flexShrink: 0 }} onClick={manuGenerateCode}>Generál</Button>
                      </>
                    )}
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
                      <Checkbox
                        style={{ marginLeft: 8 }}
                        checked={isRateLocked}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsRateLocked(checked);
                          if (checked) {
                            const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                            const rate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                            setLockedExchangeRate(rate);
                          } else {
                            setLockedExchangeRate(null);
                          }
                        }}
                      >Árfolyam rögzítése</Checkbox>
                      {(() => {
                        const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                        const liveRate = (currObj && currObj.exchange_rate && currObj.exchange_rate !== 1) ? currObj.exchange_rate : null;
                        const effRate = isRateLocked && lockedExchangeRate ? lockedExchangeRate : liveRate;
                        if (effRate) {
                          const defCurr = manuCurrencies.find(c => c.is_default);
                          const baseName = defCurr?.code?.toUpperCase() || 'HUF';
                          return <div style={{ fontSize: 11, color: isRateLocked ? '#1677ff' : '#888', marginTop: 2 }}>
                            1 {(currObj?.code || manuSellCurrencyCode).toUpperCase()} = {Number(effRate).toLocaleString('hu-HU')} {baseName}
                            {isRateLocked && <span style={{ marginLeft: 4 }}>(rögzítve)</span>}
                          </div>;
                        }
                        return null;
                      })()}
                    </Form.Item>
                    {(manuWatchQty != null) && (() => {
                      const qty = manuWatchQty || 1;
                      const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                      const liveRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                      const exchRate = (isRateLocked && lockedExchangeRate && lockedExchangeRate > 0) ? lockedExchangeRate : liveRate;
                      // manuWatchPrice is entered in sell currency; convert to base (HUF) for profit math.
                      const watchPriceBase = (manuWatchPrice || 0) * exchRate;
                      const effectiveUnitPrice = manuPriceFromCalc ? manuDisplayedTotals.unitSelling : watchPriceBase;
                      const totalRevenue = effectiveUnitPrice * qty;
                      const totalCost = manuDisplayedTotals.totalCost;
                      const profit = totalRevenue - totalCost;
                      const showProfit = totalCost > 0;
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

                  <Collapse ghost size="small" style={{ marginBottom: 8 }} activeKey={manuCollapseKeys} onChange={(k) => setManuCollapseKeys(Array.isArray(k) ? k as string[] : [k as string])} items={[
                    {
                      key: 'imposition',
                      label: <span><AppstoreOutlined /> Impozíció – produkciózás segédlet</span>,
                      extra: <Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); openImpositionWithPreset(null); }}>Új megnyitása</Button>,
                      children: (<>
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
                    </>
                      ),
                    },
                    {
                      key: 'dims',
                      label: 'Méret és súly',
                      children: (<>
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
                    </>
                      ),
                    },
                    {
                      key: 'costs',
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          Beszállítók és árkalkuláció
                          {manuHasPrintShop && (
                            <Button
                              size="small" type="link"
                              icon={<PrinterOutlined style={{ fontSize: 13 }} />}
                              title="Megnyitás PrintShopban"
                              style={{ padding: '0 2px', height: 20, fontSize: 12, color: '#1890ff' }}
                              onClick={e => {
                                e.stopPropagation();
                                const manuId = manuCreatedId ?? initialSelection?.ref_id
                                  ?? (initialSelection as any)?.imposition_data?._ps_mfg_id;
                                const editorState = (initialSelection as any)?.imposition_data?._editor_state;
                                // Direkt tételeknél: item-specifikus állapot localStorage-ba töltés
                                if (editorState && !manuId) {
                                  try { localStorage.setItem('pixierp_editor_state', JSON.stringify(editorState)); } catch {}
                                }
                                const ps = new URLSearchParams({ from_rfq: '1', mode: 'pdf', return_url: window.location.href });
                                if (manuId) ps.set('edit_mfg_id', String(manuId));
                                if (rfqId) ps.set('rfq_id', String(rfqId));
                                if (customer) ps.set('company', String(customer));
                                if (quoteItemId) ps.set('quote_item_id', String(quoteItemId));  // módosítás vs. új tétel
                                window.open(`/print-shop?${ps.toString()}`, '_blank');
                              }}
                            >
                              PrintShop
                            </Button>
                          )}
                        </span>
                      ),
                      children: (<>
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
                    </>
                      ),
                    },
                  ]} />

                      {manuCostItems.length > 0 && (() => {
                        const qty = manuWatchQty || 1;
                        const currObj = manuCurrencies.find(c => c.id === manuSellCurrencyId || c.code.toUpperCase() === manuSellCurrencyCode);
                        const liveRate = (currObj && currObj.exchange_rate > 0) ? currObj.exchange_rate : 1;
                        const exchRate = (isRateLocked && lockedExchangeRate && lockedExchangeRate > 0) ? lockedExchangeRate : liveRate;
                        // manuWatchPrice is in sell currency; convert to base for revenue/profit math.
                        const watchPriceBase = (manuWatchPrice || 0) * exchRate;
                        const effectiveUnitPrice = manuPriceFromCalc ? manuDisplayedTotals.unitSelling : watchPriceBase;
                        const totalRevenue = effectiveUnitPrice * qty;
                        const totalCost = manuDisplayedTotals.totalCost;
                        const profit = totalRevenue - totalCost;
                        const profitPct = totalCost > 0 ? (profit / totalCost * 100) : null;
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

                  <Divider style={{ margin: '12px 0' }} />

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Upload.Dragger
                      name="manuFiles"
                      multiple
                      showUploadList={false}
                      beforeUpload={(file) => { setManuPendingFiles(prev => [...prev, file]); return false; }}
                      fileList={manuPendingFiles as any}
                      style={{ width: 100, minWidth: 100, height: 100, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
                        <UploadOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                        <div style={{ fontSize: 10, color: '#888', marginTop: 4, lineHeight: 1.3 }}>Húzd ide<br/>vagy Ctrl+V</div>
                      </div>
                    </Upload.Dragger>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {manuPendingFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: existingAttachments.length > 0 ? 6 : 0 }}>
                          {manuPendingFiles.map((f: any) => {
                            const key = (f as any)?.uid || (f as any)?.name;
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => { setManuPendingFiles(prev => prev.filter((x: any) => ((x as any).uid || (x as any).name) !== key)); }} />
                                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{(f as any)?.name}</span>
                                <Input size="small" placeholder="Megjegyzés" style={{ flex: 1 }} value={manuPendingFileRemarks[key] || ''} onChange={e => setManuPendingFileRemarks(prev => ({ ...prev, [key]: e.target.value }))} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {existingAttachments.length > 0 && (
                        <div>
                          {existingAttachments.map((att: any) => (
                            <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <Popconfirm
                                title="Biztosan töröljük ezt a fájlt?"
                                okText="Igen"
                                cancelText="Mégse"
                                onConfirm={async () => {
                                  if (!quoteItemId) return;
                                  try { await salesService.deleteQuoteRequestItemAttachment(quoteItemId, att.id); setExistingAttachments(prev => prev.filter((a: any) => a.id !== att.id)); }
                                  catch { message.error('Nem sikerült törölni'); }
                                }}
                              >
                                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                              </Popconfirm>
                              <Tooltip title={att.is_manufacturing_file ? 'Gyártási file jelölés levétele' : 'Megjelölés gyártási file-ként'}>
                                <Button type="text" size="small" icon={<ToolOutlined style={{ color: att.is_manufacturing_file ? '#fa8c16' : '#bfbfbf' }} />}
                                  onClick={async () => {
                                    if (!quoteItemId) return;
                                    const next = !att.is_manufacturing_file;
                                    try {
                                      await salesService.setQuoteRequestItemAttachmentManufacturing(quoteItemId, att.id, next);
                                      setExistingAttachments(prev => prev.map((a: any) => a.id === att.id ? { ...a, is_manufacturing_file: next } : a));
                                      onManufacturingMarked?.();
                                      message.success(next ? 'Megjelölve gyártási file-ként' : 'Gyártási file jelölés levéve');
                                    } catch { message.error('Nem sikerült módosítani'); }
                                  }}
                                />
                              </Tooltip>
                              {(() => {
                                const fn = att.original_filename || att.file?.split('/').pop() || `#${att.id}`;
                                const dotIdx = fn.lastIndexOf('.');
                                const ext = dotIdx > 0 ? fn.slice(dotIdx) : '';
                                const fileUrl = att.file_url || att.file;
                                const isImage = !!fileUrl && (((att.content_type || '').toLowerCase().startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn));
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 0 }}>
                                    {renamingAttachmentId === att.id ? (
                                      <>
                                        <Input
                                          size="small"
                                          autoFocus
                                          style={{ width: 120 }}
                                          value={existingNames[att.id] ?? (dotIdx > 0 ? fn.slice(0, dotIdx) : fn)}
                                          onChange={(e) => setExistingNames(prev => ({ ...prev, [att.id]: e.target.value }))}
                                          onPressEnter={async (e) => {
                                            const val = (e.currentTarget.value || '').trim();
                                            if (!quoteItemId || !val) { setRenamingAttachmentId(null); return; }
                                            try { await salesService.renameQuoteRequestItemAttachment(quoteItemId, att.id, val + ext); }
                                            catch {}
                                            setRenamingAttachmentId(null);
                                          }}
                                          onBlur={async (e) => {
                                            const val = (e.target.value || '').trim();
                                            if (!quoteItemId || !val) { setRenamingAttachmentId(null); return; }
                                            try { await salesService.renameQuoteRequestItemAttachment(quoteItemId, att.id, val + ext); }
                                            catch {}
                                            setRenamingAttachmentId(null);
                                          }}
                                        />
                                        {ext && <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{ext}</span>}
                                      </>
                                    ) : (
                                      <Tooltip
                                        placement="top"
                                        title={isImage ? (
                                          <div style={{ maxWidth: 260 }}>
                                            <img src={fileUrl} alt={fn} style={{ maxWidth: 240, maxHeight: 180, display: 'block', marginBottom: 6, borderRadius: 4 }} />
                                            <div style={{ fontSize: 11, color: '#bbb', wordBreak: 'break-all' }}>{fn}</div>
                                          </div>
                                        ) : (
                                          <div style={{ maxWidth: 260, wordBreak: 'break-all' }}>{fn}</div>
                                        )}
                                      >
                                        <a
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        >
                                          {fn}
                                        </a>
                                      </Tooltip>
                                    )}
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<EditOutlined style={{ fontSize: 11 }} />}
                                      onClick={() => setRenamingAttachmentId(att.id)}
                                      title="Átnevezés"
                                      style={{ padding: '0 4px' }}
                                    />
                                  </div>
                                );
                              })()}
                              <Input size="small" placeholder="Megjegyzés" style={{ flex: 1 }}
                                value={existingRemarks[att.id] ?? att.remark ?? ''}
                                onChange={(e) => setExistingRemarks(prev => ({ ...prev, [att.id]: e.target.value }))}
                                onBlur={async (e) => {
                                  if (!quoteItemId) return;
                                  try { await salesService.updateQuoteRequestItemAttachmentRemark(quoteItemId, att.id, e.target.value); }
                                  catch {}
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
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
              <Button icon={<EditOutlined />} onClick={() => openEdit(selected)} title="Tétel szerkesztése új lapon" size="small" style={{ marginTop: 4 }} />
            )}
          </>
        )}

        {/* Manufacturing tab: also show the price/qty/discount form when selected.
            When editing a manufacturing item the detailed inline form already contains qty/price,
            so we hide this simplified line-item form.
            Also hide when the item was created/edited via the inline form (manuCreatedId is set).
            Also hide in the copy flow (quoteItemId set + manufacturing tab) — the inline manu editor
            already exposes quantity / price fields. */}
        {(activeKey !== 'manufacturing' || selected) && !(mode === 'edit' && activeKey === 'manufacturing') && !(activeKey === 'manufacturing' && manuCreatedId !== null) && !(activeKey === 'manufacturing' && !!quoteItemId) && (
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
                { title: 'Menny.', key: 'quantity', width: 110, render: (_: any, r: CostItem) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <NumInput formula size="small" value={r.quantity} onChange={v => { manuUpdateCostItem(r.id, 'quantity', v); setSyncQtyRows(prev => { const n = new Set(prev); n.delete(r.id); return n; }); }} min={0} controls={false} style={{ width: 52 }} />
                    <Tooltip title={syncQtyRows.has(r.id) ? 'Automatikus szinkron BE — kattints a kikapcsoláshoz' : 'Kattints: főmennyiség folyamatos átvétele'}>
                      <Switch
                        size="small"
                        checked={syncQtyRows.has(r.id)}
                        onChange={checked => {
                          setSyncQtyRows(prev => { const n = new Set(prev); checked ? n.add(r.id) : n.delete(r.id); return n; });
                          if (checked) manuUpdateCostItem(r.id, 'quantity', Number(form.getFieldValue('quantity')) || 1);
                        }}
                      />
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
                        ? <Select size="small" style={{ width: 200 }} value={r.department_id} onChange={v => manuUpdateCostItem(r.id, 'department_id', v)} allowClear placeholder="Részleg">
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
        itemDescription={String(form.getFieldValue('description') ?? initialValues?.description ?? '')}
        itemInternalDescription={String(form.getFieldValue('internal_description') ?? initialValues?.internal_description ?? '')}
        onSaveToRfq={onImpositionSaveToRfq}
      />

      {/* ── Cost item material / service search modal ─────────────────── */}
      <Modal
        title={costSearchModal.type === 'material' ? 'Alapanyag / Termék keresése' : 'Szolgáltatás keresése'}
        open={costSearchModal.open}
        onCancel={() => { setCostSearchModal({ open: false, type: null }); setCostSearchEditId(null); }}
        footer={null}
        width={860}
        destroyOnHidden
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
              setSyncQtyRows(prev => { const n = new Set(prev); n.add(newItem.id); return n; });
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
        destroyOnHidden
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
    </>
  );
  if (renderInline) {
    const isManuEdit = mode === 'edit' && initialSelection?.item_type === 'manufacturing';
    // Copy flow: mode='add' with a preloaded manufacturing source → use the inline manu editor
    const isManuCopy = mode === 'add' && !!quoteItemId && initialSelection?.item_type === 'manufacturing';
    const useManuFlow = activeKey === 'manufacturing' && (isManuEdit || isManuCopy || !selected || ((selected as any).__type === 'manufacturing' && manuCreatedId));
    const primaryLabel = (activeKey === 'manufacturing' && manuCreatedId) || isManuEdit || isManuCopy ? 'Mentés & bezárás'
      : activeKey === 'manufacturing' && !selected ? 'Hozzáadás & bezárás'
      : mode === 'edit' ? 'Mentés & bezárás' : 'Hozzáadás & bezárás';
    const secondaryLabel = mode === 'edit' || isManuCopy || (activeKey === 'manufacturing' && manuCreatedId) ? 'Mentés' : 'Hozzáadás';
    const doSave = async (keepOpen: boolean) => {
      if (keepOpen) setSavingKeepOpen(true); else setSavingClose(true);
      try {
        if (useManuFlow) { await handleManuInlineSubmit(keepOpen); } else { await confirmAdd(keepOpen); }
      } finally {
        if (keepOpen) setSavingKeepOpen(false); else setSavingClose(false);
      }
    };
    if (saveRef) saveRef.current = { save: doSave };
    return (
      <div style={{ width: '100%' }}>
        {bodyContent}
        {!saveRef && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#888' }}>
              {lastSavedAt ? `Utoljára mentve: ${lastSavedAt.format('YYYY. MM. DD. HH:mm:ss')}` : ''}
            </span>
            <Space>
              {rfqId && (
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => {
                    const ps = new URLSearchParams({ from_rfq: '1', mode: 'pdf', return_url: window.location.href });
                    if (rfqId) ps.set('rfq_id', String(rfqId));
                    if (customer) ps.set('company', String(customer));
                    if (manuCreatedId) ps.set('edit_mfg_id', String(manuCreatedId));
                    window.open(`/print-shop?${ps.toString()}`, '_blank');
                  }}
                >PrintShop</Button>
              )}
              <Button onClick={handleModalCancel}>Mégse</Button>
              <Button
                loading={savingKeepOpen || (manuSubmitting && manuKeepOpenRef.current)}
                disabled={savingClose || savingKeepOpen || manuSubmitting}
                onClick={() => doSave(true)}
              >
                {secondaryLabel}
              </Button>
              <Button
                type="primary"
                loading={savingClose || (manuSubmitting && !manuKeepOpenRef.current)}
                disabled={savingKeepOpen || savingClose || manuSubmitting}
                onClick={() => doSave(false)}
              >
                {primaryLabel}
              </Button>
            </Space>
          </div>
        )}
      </div>
    );
  }
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
              {rfqId && (
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => {
                    const ps = new URLSearchParams({ from_rfq: '1', mode: 'pdf', return_url: window.location.href });
                    if (rfqId) ps.set('rfq_id', String(rfqId));
                    if (customer) ps.set('company', String(customer));
                    if (manuCreatedId) ps.set('edit_mfg_id', String(manuCreatedId));
                    window.open(`/print-shop?${ps.toString()}`, '_blank');
                  }}
                >PrintShop</Button>
              )}
              <Button onClick={handleModalCancel}>Mégse</Button>
              <Button
                loading={savingKeepOpen || (manuSubmitting && manuKeepOpenRef.current)}
                disabled={savingClose || savingKeepOpen || manuSubmitting}
                onClick={() => doSave(true)}
              >
                {secondaryLabel}
              </Button>
              <Button
                type="primary"
                loading={savingClose || (manuSubmitting && !manuKeepOpenRef.current)}
                disabled={savingKeepOpen || savingClose || manuSubmitting}
                onClick={() => doSave(false)}
              >
                {primaryLabel}
              </Button>
            </Space>
          </div>
        );
      })()}
    >
      {bodyContent}
    </Modal>
  );
};

export default ItemSelectorModal;
