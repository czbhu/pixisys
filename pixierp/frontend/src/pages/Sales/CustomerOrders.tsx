import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import { Table, Card, Button, Tag, Space, message, Modal, Tooltip, Input, Select, DatePicker, Switch, Dropdown, Popover, Grid, Form, Pagination, Upload } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { PrinterOutlined, EyeOutlined, CheckOutlined, ToolOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, UnorderedListOutlined, RocketOutlined, FilterOutlined, DeleteOutlined, EditOutlined, SyncOutlined, CloseOutlined, QuestionCircleOutlined, ExclamationCircleOutlined, FieldTimeOutlined, MailOutlined, SearchOutlined, ReloadOutlined, SortAscendingOutlined, SortDescendingOutlined, AppstoreOutlined, FileTextOutlined, PaperClipOutlined, MenuOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useUserPreference from '../../hooks/useUserPreference';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { manufacturingService } from '../../services/manufacturingService';
import dayjs from 'dayjs';
import { OrderItemsDrawer } from './OrderItemsDrawer';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useActionHistory } from '../../contexts/ActionHistoryContext';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import MaterialNeedsTree from '../../components/Manufacturing/MaterialNeedsTree';
import ExtraWorksPanel from '../../components/Sales/ExtraWorksPanel';
import { Spin as AntSpin } from 'antd';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';
import './CustomerOrders.css';

// Row context + DnD helpers for order-item expand rows
const OrderItemRowContext = React.createContext<{ setActivatorNodeRef?: any; listeners?: any }>({});
const OrderItemDragHandle = () => {
  const { setActivatorNodeRef, listeners } = React.useContext(OrderItemRowContext);
  return <Button type="text" size="small" icon={<MenuOutlined style={{ cursor: 'grab', color: '#999' }} />} ref={setActivatorNodeRef} {...listeners} />;
};
const OrderItemDraggableRow = ({ children, ...props }: any) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props['data-row-key'] });
  const style: React.CSSProperties = { ...props.style, transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }), transition, ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#e6f7ff' } : {}) };
  return (
    <OrderItemRowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes}>{children}</tr>
    </OrderItemRowContext.Provider>
  );
};

const { useBreakpoint } = Grid;

interface PendingApproval {
  id: number;
  requested_status: string;
  previous_status: string;
  requester: string;
}

interface CustomerOrder {
  id: number;
  order_number: string;
  quote_request: number;
  quote_request_id: number;
  quote_request_title: string;
  customer_name: string;
  is_private?: boolean;
  contact_names: string;
  contact_email: string;
  deadline: string | null;
  status: string;
  order_date: string;
  total_amount: number;
  confirmed_at: string | null;
  production_started_at: string | null;
  ready_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  notes: string;
  items: any[];
  created_by_name?: string;
  delivery_note_number?: string;
  invoice_number?: string;
  pending_approval?: PendingApproval;
  last_rejection?: { note: string; date: string };
}

  const { confirm } = Modal;

  const stripHtml = (s: any): string => {
    if (s == null) return '';
    const str = String(s);
    if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
    const withBreaks = str
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n');
    if (typeof document !== 'undefined') {
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = withBreaks;
        const text = tmp.textContent || tmp.innerText || '';
        return text
          .split('\n')
          .map(line => line.replace(/[ \t]+/g, ' ').trim())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      } catch { /* fallthrough */ }
    }
    return withBreaks
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const DEFAULT_ITEMS_COL_ORDER = [
    'order_date', 'order_number', 'name',
    'quantity', 'net_unit_price',
    'product_description', 'internal_description', 'description',
    'supplier_name', 'customer_name', 'deadline',
    'net_total', 'status', 'actions',
  ];

  const DEFAULT_COL_VISIBILITY: Record<string, boolean> = {
    order_date: true,
    order_number: true,
    name: true,
    quantity: true,
    net_unit_price: true,
    product_description: true,
    internal_description: false,
    description: true,
    supplier_name: true,
    customer_name: true,
    deadline: true,
    net_total: true,
    status: true,
    actions: true,
  };

  const COL_LABELS: Record<string, string> = {
    order_date: 'Dátum',
    order_number: 'Megr. szám',
    name: 'Tétel neve',
    quantity: 'Darabszám',
    net_unit_price: 'Nettó egység ár',
    product_description: 'Leírás',
    internal_description: 'Belső leírás',
    description: 'Megjegyzés',
    supplier_name: 'Beszállítók',
    customer_name: 'Ügyfél',
    deadline: 'Határidő',
    net_total: 'Nettó összeg',
    status: 'Státusz',
    actions: 'Műveletek',
  };

  // --- Orders view column ordering / visibility ---
  const DEFAULT_ORDERS_COL_ORDER = [
    'order_date', 'order_number', 'quote_request_title',
    'customer_name', 'contact_names', 'deadline',
    'total_net_amount', 'status', 'actions',
  ];

  const DEFAULT_ORDERS_COL_VIS: Record<string, boolean> = {
    order_date: true,
    order_number: true,
    quote_request_title: true,
    customer_name: true,
    contact_names: false,
    deadline: true,
    total_net_amount: true,
    status: true,
    actions: true,
  };

  const ORDERS_COL_LABELS: Record<string, string> = {
    order_date: 'Dátum',
    order_number: 'Megr. szám',
    quote_request_title: 'Árajánlat',
    customer_name: 'Ügyfél',
    contact_names: 'Kapcsolattartók',
    deadline: 'Határidő',
    total_net_amount: 'Nettó összeg',
    status: 'Státusz',
    actions: 'Műveletek',
  };

  const DraggableHeaderCell: React.FC<any> = ({ id, colWidth, onResizeMove, onResizeEnd, children, ...props }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'noop' });
    const { style: attrStyle, ...otherAttributes } = (attributes as any);
    const style: React.CSSProperties = {
      ...props.style,
      ...(attrStyle || {}),
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      cursor: isDragging ? 'grabbing' : 'default',
      userSelect: 'none',
      position: 'relative',
      overflow: 'visible',
      ...(colWidth ? { width: colWidth, minWidth: colWidth } : {}),
    };
    const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      const startX = e.clientX;
      const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement;
      const startWidth = th ? th.offsetWidth : (colWidth || 100);
      const onMove = (ev: PointerEvent) => {
        const newWidth = Math.max(40, startWidth + ev.clientX - startX);
        onResizeMove?.(id, newWidth);
      };
      const onUp = (ev: PointerEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newWidth = Math.max(40, startWidth + ev.clientX - startX);
        onResizeEnd?.(id, newWidth);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };
    if (!id) return <th {...props}>{children}</th>;
    return (
      <th {...props} ref={setNodeRef} style={style} {...otherAttributes} {...listeners}>
        {children}
        {onResizeMove && (
          <div
            onPointerDown={handleResizePointerDown}
            style={{
              position: 'absolute', top: 0, right: -4, width: 8, height: '100%',
              cursor: 'col-resize', zIndex: 10,
            }}
          />
        )}
      </th>
    );
  };

  const CustomerOrders: React.FC = () => {
  const screens = useBreakpoint();
  // Measure actual container width with ResizeObserver
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const navigate = useNavigate();
  const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();
  const { addAction } = useActionHistory();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);

  // Altételek cache: manufacturing_product_id -> cost_items[]
  const [costItemsCache, setCostItemsCache] = useState<Record<number, any[]>>({});
  const [costItemsLoading, setCostItemsLoading] = useState<Record<number, boolean>>({});

  // Megrendelés lista kibontható sorok
  const [expandedOrderKeys, setExpandedOrderKeys] = useState<React.Key[]>([]);
  const [itemsViewExpandedKeys, setItemsViewExpandedKeys] = useState<React.Key[]>([]);
  const [orderExpandedItems, setOrderExpandedItems] = useState<Record<number, any[]>>({});
  const [orderExpandedLoading, setOrderExpandedLoading] = useState<Record<number, boolean>>({});
  // Tétel csatolmányok a listán
  const [orderItemAtts, setOrderItemAtts] = useState<Record<number, any[]>>({});
  const [orderItemAttsLoaded, setOrderItemAttsLoaded] = useState<Record<number, boolean>>({});
  const [orderItemAttRemark, setOrderItemAttRemark] = useState<Record<number, string>>({});
  const [orderItemAttUploading, setOrderItemAttUploading] = useState<Record<number, number>>({});
  const [orderItemAttExpanded, setOrderItemAttExpanded] = useState<number[]>([]);
  const [editingAttRemarkId, setEditingAttRemarkId] = useState<number | null>(null);
  const [editingAttRemarkVal, setEditingAttRemarkVal] = useState<string>('');
  const [editingAttNameId, setEditingAttNameId] = useState<number | null>(null);
  const [editingAttNameVal, setEditingAttNameVal] = useState<string>('');

  // --- Clipboard paste for attachment upload rows ---
  const lastPasteCoiIdRef = useRef<number | null>(null);
  const orderItemAttRemarkRef = useRef<Record<number, string>>({});
  useEffect(() => { orderItemAttRemarkRef.current = orderItemAttRemark; }, [orderItemAttRemark]);
  const handleCOPasteFile = useCallback((file: File) => {
    const coiId = lastPasteCoiIdRef.current;
    if (!coiId) return;
    setOrderItemAttUploading(prev => ({ ...prev, [coiId]: (prev[coiId] || 0) + 1 }));
    const fd = new FormData();
    fd.append('file', file);
    const remark = orderItemAttRemarkRef.current[coiId] || '';
    if (remark) fd.append('remark', remark);
    api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(res => {
        setOrderItemAtts(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
        message.success('Kép feltöltve');
      })
      .catch(() => message.error('Feltöltés sikertelen'))
      .finally(() => setOrderItemAttUploading(prev => ({ ...prev, [coiId]: Math.max(0, (prev[coiId] || 0) - 1) })));
  }, []);
  useClipboardImagePaste(handleCOPasteFile, orderItemAttExpanded.length > 0);
  // Gyökér-szintű (rendelés-szintű) csatolmányok
  const [orderLevelAtts, setOrderLevelAtts] = useState<Record<number, any[]>>({});
  // AttachmentPreviewModal
  const [coAttPreviewOpen, setCoAttPreviewOpen] = useState(false);
  const [coAttPreviewUrl, setCoAttPreviewUrl] = useState<string | null>(null);
  const [coAttPreviewTitle, setCoAttPreviewTitle] = useState('');
  
  // Email sending state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm] = Form.useForm();
  const [emailTargetOrder, setEmailTargetOrder] = useState<CustomerOrder | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Load settings from localStorage
  const savedSettings = useMemo(() => {
    try {
      const settings = localStorage.getItem('customerOrdersSettings');
      return settings ? JSON.parse(settings) : null;
    } catch (e) {
      return null;
    }
  }, []);

  // Default filter: show everything EXCEPT cancelled and invoiced/delivered (archived)
  const [statusFilter, setStatusFilter] = useState<string[]>(
    savedSettings?.statusFilter || ['new', 'confirmed', 'in_production']
  );
  const [creatorFilter, setCreatorFilter] = useState<string | null>(
    savedSettings?.creatorFilter || null
  );
  
  const [timestampModalOpen, setTimestampModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<dayjs.Dayjs | null>(null);
  const [timestampAction, setTimestampAction] = useState<string>('');
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [itemsDrawerOpen, setItemsDrawerOpen] = useState(false);
  const [drawerOrder, setDrawerOrder] = useState<{id: number, number: string} | null>(null);
  const isItemsView = true;
  const [csvMode, setCsvMode] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<React.Key[]>([]);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [bulkPrintModalOpen, setBulkPrintModalOpen] = useState(false);
  const [bulkPrintMode, setBulkPrintMode] = useState<'preview' | 'direct'>('direct');

  const executeBulkPrint = async () => {
    setBulkPrintModalOpen(false);
    setBulkPrinting(true);
    // uniqueId format: "${orderId}_${itemId}" — extract unique order IDs
    const orderIds = Array.from(new Set(
      bulkSelectedKeys.map((key) => String(key).split('_')[0])
    ));
    try {
      const response = await api.get(
        `/manufacturing/cost-items/bulk_work_sheets_for_orders/?order_ids=${orderIds.join(',')}`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      if (bulkPrintMode === 'direct') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          try { iframe.contentWindow?.print(); } catch {}
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(url);
          }, 2000);
        };
      } else {
        window.open(url, '_blank');
      }
      message.success(`${orderIds.length} megrendelés munkalapjai összefűzve, nyomtatás indul.`);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        message.warning('Egyetlen kijelölt megrendeléshez sem található nyomtatható munkalap.');
      } else {
        message.error('Hiba a munkalapok letöltése során');
      }
    } finally {
      setBulkPrinting(false);
    }
  };

  const handleBulkPrintWorksheets = () => {
    if (bulkSelectedKeys.length === 0) return;
    setBulkPrintModalOpen(true);
  };

  const exportCsv = () => {
    const data = csvSelectedKeys.length > 0
      ? flattenedItems.filter((it: any) => csvSelectedKeys.includes(it.uniqueId))
      : flattenedItems;
    const rows = data.map((it: any) => ({
      'Megr. szám': it.order_number,
      'Dátum': it.order_date ? dayjs(it.order_date).format('YYYY-MM-DD') : '',
      'Ügyfél': it.customer_name,
      'Tétel neve': it.product_name || it.manufacturing_product_name || it.material_name || it.service_name || it.name || '',
      'Darabszám': it.quantity ?? '',
      'Nettó egység ár': it.net_unit_price ?? '',
      'Leírás': stripHtml(it.product_description),
      'Belső leírás': stripHtml(it.internal_description),
      'Megjegyzés': stripHtml(it.description),
      'Beszállító': it.supplier_name ?? '',
      'Határidő': it.deadline ? dayjs(it.deadline).format('YYYY-MM-DD') : '',
      'Nettó összeg': it.net_total ?? '',
      'Státusz': it.status,
    }));
    if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megrendelesek_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvMode(false);
    setCsvSelectedKeys([]);
  };

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const settings = { statusFilter, creatorFilter };
    localStorage.setItem('customerOrdersSettings', JSON.stringify(settings));
  }, [statusFilter, creatorFilter]);

  
  // Column visibility for Items View — synced to server per user
  const [colVis, setColVis] = useUserPreference<Record<string, boolean>>(
    'customerOrders_colVis',
    DEFAULT_COL_VISIBILITY
  );
  const mergedColVis = { ...DEFAULT_COL_VISIBILITY, ...colVis };
  const toggleCol = (key: string) => setColVis(prev => ({ ...prev, [key]: !prev[key] }));

  // Table sort reset key
  const [tableResetKey, setTableResetKey] = useState(0);

  // Card-mode sort state
  const [cardOrderSortKey, setCardOrderSortKey] = useState<string>('');
  const [cardOrderSortDir, setCardOrderSortDir] = useState<'asc' | 'desc'>('asc');

  // Column order — synced to server per user
  const [colOrderRaw, setColOrder] = useUserPreference<string[]>(
    'customerOrders_colOrder_v2',
    DEFAULT_ITEMS_COL_ORDER
  );
  // Merge: add new default keys that aren't saved, drop removed keys
  const colOrder = [
    ...(colOrderRaw || []).filter((k: string) => DEFAULT_ITEMS_COL_ORDER.includes(k)),
    ...DEFAULT_ITEMS_COL_ORDER.filter(k => !(colOrderRaw || []).includes(k)),
  ];

  // Column widths – Items view
  const [itemsColWidthsPref, setItemsColWidthsPref] = useUserPreference<Record<string, number>>('customerOrders_colWidths', {});
  const [itemsLiveWidths, setItemsLiveWidths] = useState<Record<string, number>>({});
  const mergedItemsWidths: Record<string, number> = { ...(itemsColWidthsPref || {}), ...itemsLiveWidths };
  const handleItemsResizeMove = useCallback((key: string, width: number) => setItemsLiveWidths(prev => ({ ...prev, [key]: width })), []);
  const handleItemsResizeEnd = useCallback((key: string, width: number) => { setItemsLiveWidths({}); setItemsColWidthsPref(prev => ({ ...(prev || {}), [key]: width })); }, [setItemsColWidthsPref]);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleColDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setColOrder(prev => {
      const oldIndex = (prev || DEFAULT_ITEMS_COL_ORDER).indexOf(active.id as string);
      const newIndex = (prev || DEFAULT_ITEMS_COL_ORDER).indexOf(over.id as string);
      return arrayMove(prev || DEFAULT_ITEMS_COL_ORDER, oldIndex, newIndex);
    });
  };

  // Orders-view column order + visibility (server-synced)
  const [ordersColOrderRaw, setOrdersColOrder] = useUserPreference<string[]>(
    'customerOrders_ordersColOrder_v2',
    DEFAULT_ORDERS_COL_ORDER
  );
  const ordersColOrder = [
    ...(ordersColOrderRaw || []).filter((k: string) => DEFAULT_ORDERS_COL_ORDER.includes(k)),
    ...DEFAULT_ORDERS_COL_ORDER.filter(k => !(ordersColOrderRaw || []).includes(k)),
  ];

  const [ordersColVisRaw, setOrdersColVis] = useUserPreference<Record<string, boolean>>(
    'customerOrders_ordersColVis',
    DEFAULT_ORDERS_COL_VIS
  );
  const mergedOrdersColVis = { ...DEFAULT_ORDERS_COL_VIS, ...ordersColVisRaw };
  const toggleOrdersCol = (key: string) => setOrdersColVis(prev => ({ ...prev, [key]: !prev[key] }));

  // Column widths – Orders view
  const [ordersColWidthsPref, setOrdersColWidthsPref] = useUserPreference<Record<string, number>>('customerOrders_ordersColWidths', {});
  const [ordersLiveWidths, setOrdersLiveWidths] = useState<Record<string, number>>({});
  const mergedOrdersWidths: Record<string, number> = { ...(ordersColWidthsPref || {}), ...ordersLiveWidths };
  const handleOrdersResizeMove = useCallback((key: string, width: number) => setOrdersLiveWidths(prev => ({ ...prev, [key]: width })), []);
  const handleOrdersResizeEnd = useCallback((key: string, width: number) => { setOrdersLiveWidths({}); setOrdersColWidthsPref(prev => ({ ...(prev || {}), [key]: width })); }, [setOrdersColWidthsPref]);

  const handleOrdersColDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrdersColOrder(prev => {
      const oldIndex = (prev || DEFAULT_ORDERS_COL_ORDER).indexOf(active.id as string);
      const newIndex = (prev || DEFAULT_ORDERS_COL_ORDER).indexOf(over.id as string);
      return arrayMove(prev || DEFAULT_ORDERS_COL_ORDER, oldIndex, newIndex);
    });
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const activeStatuses = Array.isArray(statusFilter) ? statusFilter : [];
      const hasInvoiced = activeStatuses.includes('invoiced');
      const nonInvoicedStatuses = activeStatuses.filter((s) => s !== 'invoiced');

      let invoicedMode: 'exclude' | 'only' | 'include' | undefined;
      if (activeStatuses.length > 0) {
        if (hasInvoiced && nonInvoicedStatuses.length > 0) {
          invoicedMode = 'include';
        } else if (hasInvoiced) {
          invoicedMode = 'only';
        } else {
          invoicedMode = 'exclude';
        }
      }

      const response = await api.get('/sales/customer-orders/', {
        params: {
          include_items: 'true',
          status: nonInvoicedStatuses.length > 0 ? nonInvoicedStatuses.join(',') : undefined,
          invoiced: invoicedMode,
        },
      });
      const data = response.data.results || response.data;
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Hiba a megrendelések betöltésekor:', error);
      message.error('Nem sikerült betölteni a megrendeléseket');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [isItemsView, statusFilter]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const loadOrderExpandedItems = async (record: any) => {
    const orderId = Number(record?.id || 0);
    if (!orderId || orderExpandedItems[orderId] !== undefined || orderExpandedLoading[orderId]) return;

    setOrderExpandedLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await api.get(`/sales/customer-orders/${orderId}/`, { params: { include_items: 'true' } });
      const src: any[] = Array.isArray(res.data?.items) ? res.data.items : [];
      const currencyCode: string = res.data?.quote_request?.currency_code || 'HUF';
      const sorted = [...src].sort((a: any, b: any) => {
        const ao = Number(a?.quote_item?.sort_order ?? a?.sort_order ?? 0);
        const bo = Number(b?.quote_item?.sort_order ?? b?.sort_order ?? 0);
        if (ao !== bo) return ao - bo;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });
      // Build COI id -> QuoteRequestItem id map to resolve parent relationships
      const qiIdToCoiId = new Map<number, number>();
      sorted.forEach((it: any) => {
        if (it.quote_item?.id) qiIdToCoiId.set(it.quote_item.id, it.id);
      });
      // Store as flat list with _parent_coi_id resolved
      const flat = sorted.map((it: any) => {
        const parentQiId = it.quote_item?.parent;
        const parentCoiId = parentQiId ? (qiIdToCoiId.get(parentQiId) || null) : null;
        return { ...it, _parent_coi_id: parentCoiId, _currency_code: currencyCode };
      });
      setOrderExpandedItems(prev => ({ ...prev, [orderId]: flat }));
      // Also fetch order-level attachments
      try {
        const attRes = await api.get(`/sales/customer-orders/${orderId}/attachments/`);
        setOrderLevelAtts(prev => ({ ...prev, [orderId]: attRes.data || [] }));
      } catch { setOrderLevelAtts(prev => ({ ...prev, [orderId]: [] })); }
    } catch (e) {
      console.error(e);
      message.error('Nem sikerült betölteni a megrendelés tételeit');
      setOrderExpandedItems(prev => ({ ...prev, [orderId]: [] }));
    } finally {
      setOrderExpandedLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const ensureExtension = (newName: string, originalName: string): string => {
    const dotIdx = originalName.lastIndexOf('.');
    if (dotIdx === -1) return newName;
    const ext = originalName.slice(dotIdx);
    if (newName.toLowerCase().endsWith(ext.toLowerCase())) return newName;
    return newName + ext;
  };

  const nameWithExt = (att: any): string => {
    const name = att.original_filename || '';
    if (!name) return att.file_url?.split('/').pop()?.split('?')[0] || '';
    if (name.includes('.')) return name;
    const filePath = att.file_url || '';
    const base = filePath.split('/').pop()?.split('?')[0] || '';
    const dotIdx = base.lastIndexOf('.');
    return dotIdx !== -1 ? name + base.slice(dotIdx) : name;
  };

  const loadItemAtts = (coiId: number) => {
    if (orderItemAttsLoaded[coiId]) return;
    api.get(`/sales/customer-order-items/${coiId}/attachments/`)
      .then(res => setOrderItemAtts(prev => ({ ...prev, [coiId]: res.data || [] })))
      .catch(() => setOrderItemAtts(prev => ({ ...prev, [coiId]: [] })))
      .finally(() => setOrderItemAttsLoaded(prev => ({ ...prev, [coiId]: true })));
  };

  // Renders cost-items (altételek) + attachments for a single item-view row
  const renderItemExpand = (record: any) => {
    const coiId = Number(record.id);
    const productId = Number(record.manufacturing_product_id || 0);
    const orderId = Number(record.originalOrder?.id || 0);
    const atts: any[] = orderItemAtts[coiId] || [];
    const loaded = !!orderItemAttsLoaded[coiId];
    const uploading = (orderItemAttUploading[coiId] || 0) > 0;
    const attRemark = orderItemAttRemark[coiId] || '';
    return (
      <div style={{ padding: '8px 16px 12px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          {productId > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 500, fontSize: 12, color: '#555' }}>Altételek</span>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/sales/customer-orders/${orderId}?edit_item=${coiId}`)}
                >
                  Tétel megnyitása
                </Button>
              </div>
              <div style={{ paddingLeft: 8 }}>
                <ProductSubItemsTable productId={productId} showNotesAndAttachments />
              </div>
              <MaterialNeedsTree
                manufacturingProductId={productId}
                quantity={Number(record.quantity || 1)}
                sourceType="customer_order"
                sourceId={orderId}
                sourceNumber={record.originalOrder?.order_number || String(orderId)}
                sourceItemName={record.product_name || record.manufacturing_product_name || record.material_name || record.service_name || ''}
              />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, color: '#555', marginBottom: 6 }}>Csatolmányok</div>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Input
                placeholder="Megjegyzés a feltöltéshez (opcionális)"
                size="small" value={attRemark} style={{ width: 340 }}
                onChange={e => setOrderItemAttRemark(prev => ({ ...prev, [coiId]: e.target.value }))}
              />
              <div onMouseEnter={() => { lastPasteCoiIdRef.current = coiId; }}>
                <Upload.Dragger
                  multiple
                  showUploadList={false}
                  style={{ padding: '8px 0' }}
                  customRequest={({ file, onSuccess, onError }) => {
                    const f = file as File;
                    setOrderItemAttUploading(prev => ({ ...prev, [coiId]: (prev[coiId] || 0) + 1 }));
                    const fd = new FormData();
                    fd.append('file', f);
                    if (attRemark) fd.append('remark', attRemark);
                    api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                      .then(res => {
                        setOrderItemAtts(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
                        setOrderItemAttRemark(prev => ({ ...prev, [coiId]: '' }));
                        message.success('Feltöltve');
                        onSuccess?.(res.data);
                      })
                      .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                      .finally(() => setOrderItemAttUploading(prev => ({ ...prev, [coiId]: Math.max(0, (prev[coiId] || 0) - 1) })));
                  }}
                >
                  {uploading
                    ? <><AntSpin size="small" /> <span style={{ fontSize: 12, color: '#888' }}>Feltöltés…</span></>
                    : <span style={{ fontSize: 12, color: '#888' }}>Húzd ide a fájlokat, kattints &middot; vagy Ctrl+V</span>
                  }
                </Upload.Dragger>
              </div>
              {!loaded ? <AntSpin size="small" /> : atts.length === 0 ? (
                <div style={{ color: '#bbb', fontSize: 12 }}>Nincs csatolmány</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {atts.map((att: any) => (
                    <Space key={att.id} size={4} align="center">
                      <Space size={2}>
                        <a
                          href={att.file_url}
                          style={{ fontSize: 12 }}
                          onClick={(e) => { e.preventDefault(); setCoAttPreviewUrl(att.file_url); setCoAttPreviewTitle(att.original_filename || att.file_url?.split('/').pop() || ''); setCoAttPreviewOpen(true); }}
                        >{att.original_filename}</a>
                      </Space>
                      <span
                        style={{ color: att.remark ? '#595959' : '#bbb', fontSize: 11, fontStyle: att.remark ? 'italic' : 'normal', cursor: 'pointer' }}
                        onClick={() => { setEditingAttRemarkId(att.id); setEditingAttRemarkVal(att.remark || ''); }}
                      >
                        {att.remark || '+ megjegyzés'}
                      </span>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />}
                        onClick={async () => {
                          try {
                            await api.delete(`/sales/customer-order-items/${coiId}/attachments/${att.id}/`);
                            setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).filter((a: any) => a.id !== att.id) }));
                          } catch { message.error('Törlés sikertelen'); }
                        }}
                      />
                    </Space>
                  ))}
                </div>
              )}
            </Space>
          </div>
        </Space>
      </div>
    );
  };

  const renderExpandedOrderRow = (record: any) => {
    const orderId = Number(record?.id || 0);
    const loadingItems = !!orderExpandedLoading[orderId];
    const flatItems: any[] = orderExpandedItems[orderId] || [];

    if (loadingItems) {
      return (
        <div style={{ padding: '12px 8px 12px 28px' }}>
          <AntSpin size="small" />
        </div>
      );
    }

    if (!flatItems || flatItems.length === 0) {
      return <div style={{ padding: '12px 8px 12px 28px', color: '#888' }}>Nincsenek tételek.</div>;
    }

    const toggleItemAtt = (coiId: number) => {
      if (orderItemAttExpanded.includes(coiId)) {
        setOrderItemAttExpanded(prev => prev.filter(id => id !== coiId));
      } else {
        setOrderItemAttExpanded(prev => [...prev, coiId]);
        loadItemAtts(coiId);
      }
    };

    // Build depth map for indentation display (parent is COI id stored as quote_item.parent => need COI id mapping)
    const getDepth = (item: any, items: any[], visited = new Set<number>()): number => {
      const parentCoiId = item._parent_coi_id;
      if (!parentCoiId || visited.has(item.id)) return 0;
      visited.add(item.id);
      const parent = items.find(i => i.id === parentCoiId);
      if (!parent) return 0;
      return 1 + getDepth(parent, items, visited);
    };

    const persistOrder = async (newItems: any[]) => {
      try {
        const payload = newItems.map((it, idx) => ({
          id: it.id,
          sort_order: idx,
          parent_id: it._parent_coi_id || null,
        }));
        await api.post(`/sales/customer-orders/${orderId}/reorder_items/`, payload);
      } catch { message.error('Sorrend mentése sikertelen'); }
    };

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = flatItems.findIndex((i: any) => i.id === active.id);
      const newIdx = flatItems.findIndex((i: any) => i.id === over.id);
      const newItems = arrayMove(flatItems, oldIdx, newIdx);
      setOrderExpandedItems(prev => ({ ...prev, [orderId]: newItems }));
      persistOrder(newItems);
    };

    const onIndent = (item: any) => {
      const idx = flatItems.findIndex((i: any) => i.id === item.id);
      if (idx <= 0) return;
      const prev = flatItems[idx - 1];
      const newItems = flatItems.map((it: any) => it.id === item.id ? { ...it, _parent_coi_id: prev.id } : it);
      setOrderExpandedItems(prevState => ({ ...prevState, [orderId]: newItems }));
      persistOrder(newItems);
    };

    const onOutdent = (item: any) => {
      if (!item._parent_coi_id) return;
      const parent = flatItems.find((i: any) => i.id === item._parent_coi_id);
      const newParentId = parent?._parent_coi_id || null;
      const newItems = flatItems.map((it: any) => it.id === item.id ? { ...it, _parent_coi_id: newParentId } : it);
      setOrderExpandedItems(prevState => ({ ...prevState, [orderId]: newItems }));
      persistOrder(newItems);
    };

    const orderRootAtts: any[] = orderLevelAtts[orderId] || [];

    return (
      <div style={{ padding: '8px 0 8px 28px' }}>
        {orderRootAtts.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginRight: 4 }}>Rendelés csatolmányai:</span>
            {orderRootAtts.map((att: any) => (
              <a
                key={att.id}
                href={att.file_url || att.file}
                onClick={(e) => { e.preventDefault(); setCoAttPreviewUrl(att.file_url || att.file); setCoAttPreviewTitle(att.original_filename || att.file?.split('/').pop() || ''); setCoAttPreviewOpen(true); }}
                style={{ fontSize: 12 }}
              >
                <PaperClipOutlined style={{ marginRight: 3 }} />{att.original_filename || att.file?.split('/').pop() || `#${att.id}`}
              </a>
            ))}
          </div>
        )}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={flatItems.map((i: any) => i.id)} strategy={verticalListSortingStrategy}>
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={flatItems}
              components={{ body: { row: OrderItemDraggableRow } }}
              columns={[
                {
                  title: '', key: 'drag', width: 28,
                  render: () => <OrderItemDragHandle />,
                },
                {
                  title: 'Megnevezés',
                  key: 'name',
                  render: (_: any, r: any) => {
                    const depth = getDepth(r, flatItems);
                    return (
                      <div style={{ paddingLeft: depth * 20 }}>
                        <div style={{ fontWeight: 500 }}>
                          {r.product_name || r.manufacturing_product_name || r.material_name || r.service_name || r.name || r.description || '-'}
                        </div>
                        <div style={{ fontSize: 12, color: '#666' }}>{r.product_code || r.manufacturing_product_code || r.material_code || r.service_code || ''}</div>
                      </div>
                    );
                  },
                },
                {
                  title: 'Mennyiség',
                  key: 'qty',
                  width: 120,
                  render: (_: any, r: any) => `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
                },
                {
                  title: 'Beker. nettó ár',
                  key: 'cost_price',
                  width: 140,
                  align: 'right' as const,
                  render: (_: any, r: any) => {
                    const qi = r.quote_item;
                    const unitCp = Number(qi?.material_unit_cost_price || qi?.service_unit_cost_price || 0);
                    const manuTotal = Number(qi?.manufacturing_total_cost || 0);
                    const cur = r._currency_code || 'HUF';
                    if (unitCp) {
                      const total = unitCp * Number(r.quantity || 1);
                      return <span>{total.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {cur}</span>;
                    }
                    if (manuTotal) {
                      const total = manuTotal * Number(r.quantity || 1);
                      return <span>{total.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {cur}</span>;
                    }
                    return <span style={{ color: '#bbb' }}>—</span>;
                  },
                },
                {
                  title: 'Nettó eladási ár',
                  key: 'net_unit_price',
                  width: 140,
                  align: 'right' as const,
                  render: (_: any, r: any) => {
                    const unitP = Number(r.net_unit_price || 0);
                    if (!unitP) return <span style={{ color: '#bbb' }}>—</span>;
                    const total = unitP * Number(r.quantity || 1);
                    const cur = r._currency_code || 'HUF';
                    return <span style={{ fontWeight: 500 }}>{total.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {cur}</span>;
                  },
                },
                {
                  title: 'Megjegyzés',
                  key: 'description',
                  ellipsis: true,
                  render: (_: any, r: any) => {
                    const raw = r.description || r.quote_item?.description || '';
                    return <span title={stripHtml(raw)}>{stripHtml(raw)}</span>;
                  },
                },
                {
                  title: 'Hierarchia', key: 'hier', width: 80,
                  render: (_: any, r: any) => (
                    <Space size={2}>
                      <Tooltip title="Kijjebb (outdent)">
                        <Button size="small" icon={<LeftOutlined />} onClick={() => onOutdent(r)} disabled={!r._parent_coi_id} />
                      </Tooltip>
                      <Tooltip title="Beljebb (indent)">
                        <Button size="small" icon={<RightOutlined />} onClick={() => onIndent(r)} />
                      </Tooltip>
                    </Space>
                  ),
                },
                {
                  title: 'Státusz', key: 'item_status', width: 160,
                  render: (_: any, r: any) => {
                    const ITEM_STATUS_OPTS = [
                      { value: 'new', label: 'Új', color: 'blue' },
                      { value: 'confirmed', label: 'Megerősítve', color: 'cyan' },
                      { value: 'in_production', label: 'Gyártásban', color: 'orange' },
                      { value: 'ready', label: 'Kész', color: 'green' },
                      { value: 'in_delivery', label: 'Szállítás alatt', color: 'purple' },
                      { value: 'delivered', label: 'Kiszállítva', color: 'success' },
                      { value: 'cancelled', label: 'Törölve', color: 'red' },
                    ];
                    const AT_OR_ABOVE_PROD = ['in_production', 'ready', 'in_delivery', 'delivered'];
                    // 1. Check child COIs (fa szerkezet)
                    const childCOIs = flatItems.filter((it: any) => String(it._parent_coi_id) === String(r.id));
                    const relevantChildCOIs = childCOIs.filter((c: any) => c.status !== 'cancelled');
                    // 2. Check manufacturing cost items (altételek)
                    const cp = r.cost_items_progress as { total: number; at_or_above: number } | null | undefined;
                    let progressCount = 0;
                    let progressTotal = 0;
                    let progressLabel = '';
                    if (relevantChildCOIs.length > 0) {
                      progressTotal = relevantChildCOIs.length;
                      progressCount = relevantChildCOIs.filter((c: any) => AT_OR_ABOVE_PROD.includes(c.status)).length;
                      progressLabel = 'altétel';
                    } else if (cp && cp.total > 0) {
                      progressTotal = cp.total;
                      progressCount = cp.at_or_above;
                      progressLabel = 'altétel';
                    }
                    const hasProgress = progressCount > 0 && progressTotal > 0;
                    const derivedStatus = hasProgress ? 'in_production' : (r.status || 'new');
                    const opt = ITEM_STATUS_OPTS.find(o => o.value === derivedStatus) || ITEM_STATUS_OPTS[0];
                    const displayLabel = hasProgress ? `${opt.label} (${progressCount}/${progressTotal})` : opt.label;
                    const storedCur = r.status || 'new';
                    return (
                      <Popover
                        trigger="click"
                        title="Tétel státusza"
                        getPopupContainer={() => document.body}
                        zIndex={9999}
                        content={
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {hasProgress && <div style={{ fontSize: 11, color: '#888', paddingBottom: 4 }}>{progressCount}/{progressTotal} {progressLabel} gyártásban vagy felette</div>}
                            {ITEM_STATUS_OPTS.map(o => (
                              <Button key={o.value} size="small" type={o.value === storedCur ? 'primary' : 'text'}
                                disabled={o.value === storedCur}
                                onClick={async () => {
                                  const prev = [...flatItems];
                                  const newItems = flatItems.map((it: any) => it.id === r.id ? { ...it, status: o.value } : it);
                                  setOrderExpandedItems(ps => ({ ...ps, [orderId]: newItems }));
                                  try {
                                    await api.patch(`/sales/customer-order-items/${r.id}/`, { status: o.value });
                                  } catch {
                                    message.error('Státusz frissítése sikertelen');
                                    setOrderExpandedItems(ps => ({ ...ps, [orderId]: prev }));
                                  }
                                }}
                              >{o.label}</Button>
                            ))}
                          </div>
                        }
                        overlayInnerStyle={{ padding: '6px 8px' }}
                      >
                        <Tag color={opt.color} style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()}>{displayLabel}</Tag>
                      </Popover>
                    );
                  },
                },
                {
                  title: '', key: 'open_item', width: 110,
                  render: (_: any, r: any) => (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/sales/customer-orders/${orderId}?edit_item=${r.id}`)}
                    >
                      Megnyitás
                    </Button>
                  ),
                },
                {
                  title: 'Csatolmányok',
                  key: 'attachments',
                  width: 140,
                  render: (_: any, r: any) => {
                    const coiId = Number(r.id);
                    if (!coiId) return null;
                    const atts: any[] = orderItemAtts[coiId] || [];
                    const loaded = !!orderItemAttsLoaded[coiId];
                    const isOpen = orderItemAttExpanded.includes(coiId);
                    return (
                      <Button
                        size="small"
                        icon={<PaperClipOutlined />}
                        type={isOpen ? 'primary' : 'default'}
                        onClick={() => toggleItemAtt(coiId)}
                      >
                        {loaded && atts.length > 0 ? atts.length : ''}
                      </Button>
                    );
                  },
                },
              ]}
              expandable={{
                expandedRowKeys: orderItemAttExpanded,
                onExpand: (expanded, r) => {
                  const coiId = Number(r.id);
                  if (expanded) {
                    setOrderItemAttExpanded(prev => [...prev, coiId]);
                    loadItemAtts(coiId);
                  } else {
                    setOrderItemAttExpanded(prev => prev.filter(id => id !== coiId));
                  }
                },
                rowExpandable: () => true,
                expandedRowRender: (r: any) => {
                  const coiId = Number(r.id);
                  const productId = Number(r.quote_item?.manufacturing_product || r.manufacturing_product || 0);
                  const atts: any[] = orderItemAtts[coiId] || [];
                  const loaded = !!orderItemAttsLoaded[coiId];
                  const uploading = (orderItemAttUploading[coiId] || 0) > 0;
                  const attRemark = orderItemAttRemark[coiId] || '';
                  return (
                    <div style={{ padding: '8px 16px 12px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={10}>
                        {productId > 0 && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontWeight: 500, fontSize: 12, color: '#555' }}>Altételek</span>
                              <Button
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => navigate(`/sales/customer-orders/${record.id}?edit_item=${coiId}`)}
                              >
                                Tétel megnyitása
                              </Button>
                            </div>
                            <div style={{ paddingLeft: 8 }}>
                              <ProductSubItemsTable productId={productId} showNotesAndAttachments />
                            </div>
                            <MaterialNeedsTree
                              manufacturingProductId={productId}
                              quantity={Number(r.quantity || 1)}
                              sourceType="customer_order"
                              sourceId={Number(record.id || 0)}
                              sourceNumber={record.order_number || String(record.id || '')}
                              sourceItemName={r.product_name || r.manufacturing_product_name || r.material_name || r.name || ''}
                            />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 12, color: '#555', marginBottom: 6 }}>Csatolmányok</div>
                          <Space direction="vertical" style={{ width: '100%' }} size={6}>
                            <Input
                              placeholder="Megjegyzés a feltöltéshez (opcionális)"
                              size="small" value={attRemark} style={{ width: 340 }}
                              onChange={e => setOrderItemAttRemark(prev => ({ ...prev, [coiId]: e.target.value }))}
                            />
                            <div
                              onMouseEnter={() => { lastPasteCoiIdRef.current = coiId; }}
                            >
                            <Upload.Dragger
                              multiple
                              showUploadList={false}
                              style={{ padding: '8px 0' }}
                              customRequest={({ file, onSuccess, onError }) => {
                                const f = file as File;
                                setOrderItemAttUploading(prev => ({ ...prev, [coiId]: (prev[coiId] || 0) + 1 }));
                                const fd = new FormData();
                                fd.append('file', f);
                                if (attRemark) fd.append('remark', attRemark);
                                api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                                  .then(res => {
                                    setOrderItemAtts(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
                                    setOrderItemAttRemark(prev => ({ ...prev, [coiId]: '' }));
                                    message.success('Feltöltve');
                                    onSuccess?.(res.data);
                                  })
                                  .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                                  .finally(() => setOrderItemAttUploading(prev => ({ ...prev, [coiId]: Math.max(0, (prev[coiId] || 0) - 1) })));
                              }}
                            >
                              {uploading
                                ? <><AntSpin size="small" /> <span style={{ fontSize: 12, color: '#888' }}>Feltöltés…</span></>
                                : <span style={{ fontSize: 12, color: '#888' }}>Húzd ide a fájlokat, kattints &middot; vagy Ctrl+V</span>
                              }
                            </Upload.Dragger>
                            </div>
                            {!loaded ? <AntSpin size="small" /> : atts.length === 0 ? (
                              <div style={{ color: '#bbb', fontSize: 12 }}>Nincs csatolmány</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {atts.map((att: any) => (
                                  <Space key={att.id} size={4} align="center">
                                    {editingAttNameId === att.id ? (
                                      <Space size={4}>
                                        <Input
                                          size="small"
                                          autoFocus
                                          value={editingAttNameVal}
                                          style={{ width: 180 }}
                                          onChange={e => setEditingAttNameVal(e.target.value)}
                                          onPressEnter={async () => {
                                            try {
                                              const finalName = ensureExtension(editingAttNameVal, nameWithExt(att));
                                              const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/rename/`, { original_filename: finalName });
                                              setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.data.original_filename, file_url: res.data.file_url ?? a.file_url } : a) }));
                                              setEditingAttNameId(null);
                                            } catch { message.error('Átnevezés sikertelen'); }
                                          }}
                                        />
                                        <Button size="small" type="primary" onClick={async () => {
                                          try {
                                            const finalName = ensureExtension(editingAttNameVal, nameWithExt(att));
                                            const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/rename/`, { original_filename: finalName });
                                            setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.data.original_filename, file_url: res.data.file_url ?? a.file_url } : a) }));
                                            setEditingAttNameId(null);
                                          } catch { message.error('Átnevezés sikertelen'); }
                                        }}>✓</Button>
                                        <Button size="small" onClick={() => setEditingAttNameId(null)}>✗</Button>
                                      </Space>
                                    ) : (
                                      <Space size={2}>
                                        <a
                                          href={att.file_url}
                                          style={{ fontSize: 12 }}
                                          onClick={(e) => { e.preventDefault(); setCoAttPreviewUrl(att.file_url); setCoAttPreviewTitle(att.original_filename || att.file_url?.split('/').pop() || ''); setCoAttPreviewOpen(true); }}
                                        >{att.original_filename}</a>
                                        <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />} title="Átnevezés" style={{ padding: '0 2px' }}
                                          onClick={() => { setEditingAttNameId(att.id); setEditingAttNameVal(nameWithExt(att)); }}
                                        />
                                      </Space>
                                    )}
                                    {editingAttRemarkId === att.id ? (
                                      <Space size={4}>
                                        <Input
                                          size="small"
                                          autoFocus
                                          value={editingAttRemarkVal}
                                          style={{ width: 200 }}
                                          onChange={e => setEditingAttRemarkVal(e.target.value)}
                                          onPressEnter={async () => {
                                            try {
                                              const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/remark/`, { remark: editingAttRemarkVal });
                                              setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                                              setEditingAttRemarkId(null);
                                            } catch { message.error('Mentés sikertelen'); }
                                          }}
                                        />
                                        <Button size="small" type="primary" onClick={async () => {
                                          try {
                                            const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/remark/`, { remark: editingAttRemarkVal });
                                            setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                                            setEditingAttRemarkId(null);
                                          } catch { message.error('Mentés sikertelen'); }
                                        }}>Mentés</Button>
                                        <Button size="small" onClick={() => setEditingAttRemarkId(null)}>Mégsem</Button>
                                      </Space>
                                    ) : (
                                      <span
                                        style={{ color: att.remark ? '#595959' : '#bbb', fontSize: 11, fontStyle: att.remark ? 'italic' : 'normal', cursor: 'pointer' }}
                                        title="Kattints a megjegyzés szerkesztéséhez"
                                        onClick={() => { setEditingAttRemarkId(att.id); setEditingAttRemarkVal(att.remark || ''); }}
                                      >
                                        {att.remark || '+ megjegyzés'}
                                      </span>
                                    )}
                                    <Button type="text" danger size="small" icon={<DeleteOutlined />}
                                      onClick={async () => {
                                        try {
                                          await api.delete(`/sales/customer-order-items/${coiId}/attachments/${att.id}/`);
                                          setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).filter((a: any) => a.id !== att.id) }));
                                        } catch { message.error('Törlés sikertelen'); }
                                      }}
                                    />
                                    <Button
                                      type={att.is_documentation ? 'primary' : 'dashed'}
                                      size="small"
                                      style={{ fontSize: 10, padding: '0 5px', height: 20, lineHeight: '18px', color: att.is_documentation ? undefined : '#888' }}
                                      title="Kész dokumentáció jelölés"
                                      onClick={async () => {
                                        try {
                                          const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/documentation/`, { is_documentation: !att.is_documentation });
                                          setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, is_documentation: res.data.is_documentation } : a) }));
                                        } catch { message.error('Mentés sikertelen'); }
                                      }}
                                    >📋</Button>
                                  </Space>
                                ))}
                              </div>
                            )}
                          </Space>
                        </div>
                      </Space>
                    </div>
                  );
                },
              }}
            />
          </SortableContext>
        </DndContext>
        <ExtraWorksPanel
          orderId={orderId}
          showPrices
          orderItems={flatItems}
        />
      </div>
    );
  };

  const handleWorkflowStatusChange = async (orderId: number, newStatus: string, record?: CustomerOrder) => {
    const doUpdate = async (sendEmail: boolean = false) => {
        const oldStatus = record?.status;
        try {
            const response = await api.post(`/sales/customer-orders/${orderId}/update_status/`, { 
                status: newStatus,
                send_email: sendEmail
            });
            
            if (response.data.status === 'approval_requested') {
                message.info('Jóváhagyásra elküldve!');
            } else {
                message.success('Státusz frissítve');
                if (sendEmail) {
                    message.success('Visszaigazoló e-mail elküldve');
                }

                // Add to history
                if (oldStatus && oldStatus !== newStatus) {
                    // We need to define textMap here or move it outside, 
                    // but for now I'll use simple text or duplicate the map slightly or just raw values if needed
                    // Better reuse the map if possible, but it's inside statusTag.
                    // I will use raw values for now or a simple helper if needed.
                    addAction({
                        description: `Megrendelés (${record?.order_number}) státusz: ${oldStatus} -> ${newStatus}`,
                        undo: async () => {
                            await api.post(`/sales/customer-orders/${orderId}/update_status/`, { status: oldStatus });
                            fetchOrders(); // Only effective if component is mounted
                        },
                        redo: async () => {
                            await api.post(`/sales/customer-orders/${orderId}/update_status/`, { status: newStatus });
                            fetchOrders();
                        }
                    });
                }
            }
            fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Hiba a státusz frissítésekor');
        }
    };

    if (newStatus === 'confirmed') {
        const modal = Modal.confirm({
            title: 'Megerősítés',
            icon: <ExclamationCircleOutlined />,
            width: 500,
            content: (
                <div>
                    <p>Biztosan megerősíti a rendelést?</p>
                    <p>Válassza ki a visszaigazoló e-mail küldésének módját:</p>
                </div>
            ),
            footer: (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                    <Button onClick={() => modal.destroy()}>Mégse</Button>
                    <Button onClick={() => {
                        modal.destroy();
                        doUpdate(false);
                    }}>Csak státuszváltás</Button>
                    <Button icon={<EyeOutlined />} onClick={async () => {
                         modal.destroy();
                         // Open preview
                         if (record) {
                             setEmailTargetOrder(record);
                             setEmailModalOpen(true);
                             try {
                                 const res = await api.post(`/sales/customer-orders/${record.id}/render_confirmation_email/`);
                                 emailForm.setFieldsValue({
                                     to: res.data.to,
                                     subject: res.data.subject,
                                     body: res.data.body
                                 });
                             } catch(e) {
                                 message.error("Hiba az előnézet betöltésekor");
                             }
                        } else {
                            // Fallback if record is somehow missing
                            doUpdate(false);
                        }
                    }}>Előnézet</Button>
                    <Button type="primary" icon={<MailOutlined />} onClick={() => {
                        modal.destroy();
                        doUpdate(true);
                    }}>Azonnali Küldés</Button>
                </div>
            )
        });
    } else {
        doUpdate(false);
    }
  };

  const statusTag = (status: string, record: CustomerOrder) => {
    if (record.invoice_number) {
        return (
            <Space direction="vertical" size={0}>
                <Tag color="purple">Kiszámlázva</Tag>
                <span style={{fontSize: 10, color: '#666'}}>{record.invoice_number}</span>
            </Space>
        );
    }
    const statusMap: Record<string, { color: string; text: string }> = {
      new: { color: 'blue', text: 'Új' },
      confirmed: { color: 'cyan', text: 'Megerősítve' },
      in_production: { color: 'orange', text: 'Gyártásban' },
      ready: { color: 'green', text: 'Kész' },
      in_delivery: { color: 'purple', text: 'Szállítás alatt' },
      delivered: { color: 'success', text: 'Leszállítva' },
      cancelled: { color: 'red', text: 'Törölve' },
    };
    const AT_OR_ABOVE_PROD_ORDER = ['in_production', 'ready', 'in_delivery', 'delivered'];
    const orderItems: any[] = record.items || [];
    const relevantOrderItems = orderItems.filter((it: any) => it.status !== 'cancelled');
    const orderProgressCount = relevantOrderItems.filter((it: any) => {
      if (AT_OR_ABOVE_PROD_ORDER.includes(it.status)) return true;
      const cp = it.cost_items_progress as { total: number; at_or_above: number } | null | undefined;
      return cp && cp.at_or_above > 0;
    }).length;
    const orderProgressTotal = relevantOrderItems.length;
    const hasOrderProgress = orderProgressCount > 0 && orderProgressTotal > 0;
    const displayStatus = hasOrderProgress ? 'in_production' : status;
    const { color, text } = statusMap[displayStatus] || { color: 'default', text: status };
    const displayText = hasOrderProgress ? `${text} (${orderProgressCount}/${orderProgressTotal})` : text;
    
    const content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hasOrderProgress && <div style={{ fontSize: 11, color: '#888', paddingBottom: 4 }}>{orderProgressCount}/{orderProgressTotal} tétel gyártásban vagy felette</div>}
            {Object.keys(statusMap).map(s => (
                <Button 
                    key={s} 
                    size="small" 
                    type={s === status ? 'primary' : 'text'}
                    disabled={s === status}
                    style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                    onClick={() => handleWorkflowStatusChange(record.id, s, record)}
                >
                    {statusMap[s].text}
                </Button>
            ))}
        </div>
    );

    return (
        <Space>
            <Popover content={content} title="Státusz váltás" trigger="click" overlayInnerStyle={{ padding: '6px 8px' }} getPopupContainer={() => document.body} zIndex={9999}>
                <Tag color={color} style={{ cursor: 'pointer' }}>{displayText}</Tag>
            </Popover>
            {record.pending_approval && (
          <>
            <Tag color="gold">
              Jóváhagyásra vár: {statusMap[record.pending_approval.requested_status]?.text || record.pending_approval.requested_status}
            </Tag>
            <Tooltip title={`Kérelmező: ${record.pending_approval.requester}`}>
              <QuestionCircleOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          </>
            )}
            {record.last_rejection && (
                <Tooltip title={`Visszaküldve: ${record.last_rejection.note}`}>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                </Tooltip>
            )}
        </Space>
    );
  };

  const handleStatusChange = async (orderId: number, action: string, actionText: string) => {
    try {
      await api.post(`/sales/customer-orders/${orderId}/${action}/`, {});
      message.success(`${actionText} sikeres`);
      fetchOrders();
    } catch (error: any) {
      message.error(error.response?.data?.error || `${actionText} sikertelen`);
    }
  };

  const handleItemStatusChange = async (itemId: number, newStatus: string) => {
    try {
        await api.patch(`/sales/customer-order-items/${itemId}/`, { status: newStatus });
        message.success('Tétel státusza frissítve');
        fetchOrders(); // Refresh to see changes
    } catch (error) {
        message.error('Hiba a státusz frissítésekor');
    }
  };

  const handleItemDelete = (itemId: number) => {
      Modal.confirm({
          title: 'Biztosan törli a tételt?',
          content: 'A művelet nem visszavonható.',
          okText: 'Törlés',
          okType: 'danger',
          cancelText: 'Mégse',
          onOk: async () => {
              try {
                  await api.delete(`/sales/customer-order-items/${itemId}/`);
                  message.success('Tétel törölve');
                  fetchOrders();
              } catch (error) {
                  message.error('Hiba a tétel törlésekor');
              }
          }
      });
  };

  const statusColumn = {
    title: 'Státusz',
    dataIndex: 'status',
    key: 'status',
    width: 130,
    onCell: () => ({ style: { paddingRight: 4 } }),
    render: (status: string, record: any) => statusTag(status, record.originalOrder || record),
  };

  const actionsColumn = {
    title: 'Műveletek',
    key: 'actions',
    onCell: () => ({ style: { paddingLeft: 4, paddingRight: 0 } }),
    render: (_: any, item: any) => {
      const record = item.originalOrder || item;
      return (
        <Space size="small" wrap>
          <Tooltip title="Részletek">
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => navigate(`/sales/customer-orders/${record.id}`)}
            />
          </Tooltip>
          
          { record.status === 'new' && null }
          
          { record.status === 'confirmed' && null }

          { record.status === 'in_production' && null }
          
          {(record.status === 'ready' || record.status === 'in_delivery') && (
            <Tooltip title={record.status === 'ready' ? "Szállítás indítása" : "Szállítási email újraküldése"}>
              <Button
                type="primary"
                icon={<CarOutlined />}
                size="small"
                onClick={() => {
                  window.open(`/sales/delivery-notes?create_from_order=${record.id}`, '_blank');
                }}
              />
            </Tooltip>
          )}
          
          { record.status === 'in_delivery' && null }

          {record.status !== 'cancelled' && !isItemsView && (
            <Tooltip title="Tételek">
              <Button 
                icon={<UnorderedListOutlined />} 
                size="small" 
                onClick={() => {
                  setDrawerOrder({ id: record.id, number: record.order_number });
                  setItemsDrawerOpen(true);
                }}
              />
            </Tooltip>
          )}

          {['confirmed', 'in_production', 'ready', 'in_delivery', 'delivered'].includes(record.status) && (
            <Tooltip title="Munkalap nyomtatás (minden altétel)">
              <Button
                icon={<PrinterOutlined />}
                size="small"
                onClick={async () => {
                  try {
                    const response = await api.get(
                      `/manufacturing/cost-items/work_sheet_for_order/?order_id=${record.id}`,
                      { responseType: 'blob' }
                    );
                    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                    window.open(url, '_blank');
                  } catch (e: any) {
                    if (e?.response?.status === 404) {
                      message.warning('Ehhez a megrendeléshez nincs nyomtatható altétel munkalap.');
                    } else {
                      message.error('Hiba a munkalap letöltése során');
                    }
                  }
                }}
              />
            </Tooltip>
          )}
          
          {!['delivered', 'cancelled'].includes(record.status) && (
            <Tooltip title="Törlés">
              <Button
                danger
                icon={<CloseCircleOutlined />}
                size="small"
                onClick={() => {
                  Modal.confirm({
                    title: 'Biztosan törölni szeretné a megrendelést?',
                    content: `Megrendelés: ${record.order_number}`,
                    okText: 'Törlés',
                    okType: 'danger',
                    cancelText: 'Mégse',
                    onOk: () => handleStatusChange(record.id, 'cancel', 'Törlés'),
                  });
                }}
              />
            </Tooltip>
          )}
        </Space>
      );
    }
  };

  const columns: ColumnsType<CustomerOrder> = [
    {
      title: 'Dátum',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 100,
      responsive: ['md'] as any,
      sorter: (a: any, b: any) => (a.order_date || '').localeCompare(b.order_date || ''),
      render: (date: string, record: CustomerOrder) => (
        <div>
          <div>
            {new Date(date).toLocaleDateString('hu-HU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </div>
          {record.created_by_name && (
            <div style={{ fontSize: '11px', color: '#888' }}>
              {record.created_by_name}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Megr. szám',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 140,
      sorter: (a: any, b: any) => (a.order_number || '').localeCompare(b.order_number || '', 'hu'),
      render: (text: string, record: CustomerOrder) => (
        <div>
          <a
            style={{ color: '#1677ff', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => navigate(`/sales/customer-orders/${record.id}`)}
          >
            {text}
          </a>
          <div className="co-date-inline" style={{ fontSize: 11, color: '#888', display: 'none' }}>
            {new Date(record.order_date).toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' })}
            {record.created_by_name ? ` · ${record.created_by_name}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Ügyfél',
      dataIndex: 'customer_name',
      key: 'customer_name',
      sorter: (a: any, b: any) => {
        const aName = a.is_private ? (a.contact_names || '') : (a.customer_name || '');
        const bName = b.is_private ? (b.contact_names || '') : (b.customer_name || '');
        return aName.localeCompare(bName, 'hu');
      },
      render: (text: string, record: CustomerOrder) => {
        const isPrivate = record.is_private;
        const primaryName = isPrivate
          ? (record.contact_names || 'Magánszemély')
          : (text || 'Magánszemély');
        const secondaryName = isPrivate ? null : record.contact_names;
        const tooltipText = isPrivate
          ? record.contact_names
          : [text, record.contact_names].filter(Boolean).join(' – ');
        return (
          <Tooltip title={tooltipText}>
            <div>
              <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: (isPrivate || secondaryName) ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{primaryName}</div>
              {isPrivate && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
              {secondaryName && (
                <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{secondaryName}</div>
              )}
            </div>
          </Tooltip>
        );
      }
    },
    {
      title: 'Kapcsolattartók', 
      dataIndex: 'contact_names',
      key: 'contact_names',
      ellipsis: true,
      hidden: true,
      width: 150,
      responsive: ['xl'] as any,
    },
    {
      title: 'Határidő',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 110,
      responsive: ['sm'] as any,
      sorter: (a: any, b: any) => (a.deadline || '').localeCompare(b.deadline || ''),
      render: (date: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('hu-HU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      },
    },
    {
      title: 'Nettó összeg',
      dataIndex: 'total_net_amount',
      key: 'total_net_amount',
      width: 110,
      align: 'right',
      responsive: ['sm'] as any,
      sorter: (a: any, b: any) => (a.total_net_amount || 0) - (b.total_net_amount || 0),
      render: (amount: number) => {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('hu-HU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount) + ' Ft';
      },
    },
    { ...statusColumn, sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || '', 'hu') },
    actionsColumn as any,
  ];

  // All column definitions for the Items view (only currently visible ones are included)
  const strSort = (a: any, b: any, field: string) => (a[field] || '').localeCompare(b[field] || '', 'hu');
  const dateSort = (a: any, b: any, field: string) => (a[field] ? new Date(a[field]).getTime() : 0) - (b[field] ? new Date(b[field]).getTime() : 0);

  const allItemColDefs: any[] = [
    {
      title: 'Dátum', dataIndex: 'order_date', key: 'order_date', width: 120,
      sorter: (a: any, b: any) => dateSort(a, b, 'order_date'),
      render: (date: string, record: any) => (
        <div>
          <div>{new Date(date).toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
          {record.created_by_name && <div style={{ fontSize: '11px', color: '#888' }}>{record.created_by_name}</div>}
        </div>
      ),
    },
    {
      title: 'Megr. szám', dataIndex: 'order_number', key: 'order_number', width: 150,
      sorter: (a: any, b: any) => strSort(a, b, 'order_number'),
      render: (text: string, record: any) => (
        <a
          style={{ color: '#1677ff', cursor: 'pointer', fontWeight: 500 }}
          href={`/sales/customer-orders/${record.originalOrder.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text}
        </a>
      ),
    },
    {
      title: 'Tétel neve', key: 'name', width: 220,
      sorter: (a: any, b: any) => {
        const nameA = a.product_name || a.manufacturing_product_name || a.material_name || a.service_name || '';
        const nameB = b.product_name || b.manufacturing_product_name || b.material_name || b.service_name || '';
        return nameA.localeCompare(nameB, 'hu');
      },
      render: (_: any, record: any) => {
        const name = record.product_name || record.manufacturing_product_name || record.material_name || record.service_name || '-';
        const code = record.product_code || record.manufacturing_product_code || record.material_code || record.service_code;
        return (
          <div>
            <div style={{ fontWeight: 500, wordBreak: 'break-word', whiteSpace: 'normal' }}>{name}</div>
            {code && <div style={{ fontSize: '11px', color: '#666' }}>{code}</div>}
          </div>
        );
      },
    },
    {
      title: 'Darabszám', key: 'quantity', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.quantity || 0) - Number(b.quantity || 0),
      render: (_: any, r: any) =>
        `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
    },
    {
      title: 'Nettó egység ár', key: 'net_unit_price', width: 130, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.net_unit_price || 0) - Number(b.net_unit_price || 0),
      render: (_: any, r: any) => r.net_unit_price
        ? `${Number(r.net_unit_price).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} Ft`
        : '—',
    },
    {
      title: 'Leírás', dataIndex: 'product_description', key: 'product_description', width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'product_description'),
      render: (t: string) => { const p = stripHtml(t); return p ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{p}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p}</div></Tooltip>) : null; }
    },
    {
      title: 'Belső leírás', dataIndex: 'internal_description', key: 'internal_description', width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'internal_description'),
      render: (t: string) => { const p = stripHtml(t); return p ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{p}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#844', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p}</div></Tooltip>) : null; }
    },
    {
      title: 'Megjegyzés', dataIndex: 'description', key: 'description', responsive: ['md'] as any, width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'description'),
      render: (t: string) => { const p = stripHtml(t); return p ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{p}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p}</div></Tooltip>) : null; }
    },
    {
      title: 'Beszállítók', dataIndex: 'supplier_name', key: 'supplier_name', ellipsis: true, responsive: ['lg'] as any,
      sorter: (a: any, b: any) => strSort(a, b, 'supplier_name'),
    },
    {
      title: 'Ügyfél', dataIndex: 'customer_name', key: 'customer_name', responsive: ['sm'] as any, width: 140, minWidth: 120,
      sorter: (a: any, b: any) => strSort(a, b, 'customer_name'),
      render: (text: string, record: any) => {
        const isPrivate = record.is_private;
        const primaryName = isPrivate
          ? (record.contact_names || 'Magánszemély')
          : (text || 'Magánszemély');
        const secondaryName = isPrivate ? null : record.contact_names;
        const tooltipText = isPrivate
          ? record.contact_names
          : [text, record.contact_names].filter(Boolean).join(' – ');
        return (
          <Tooltip title={tooltipText}>
            <div>
              <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: (isPrivate || secondaryName) ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{primaryName}</div>
              {isPrivate && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
              {secondaryName && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{secondaryName}</div>}
            </div>
          </Tooltip>
        );
      }
    },
    {
      title: 'Határidő', dataIndex: 'deadline', key: 'deadline', width: 110, responsive: ['sm'] as any,
      sorter: (a: any, b: any) => dateSort(a, b, 'deadline'),
      render: (date: string | null) => (date ? new Date(date).toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'),
    },
    {
      title: 'Nettó összeg', dataIndex: 'net_total', key: 'net_total', width: 100, align: 'right',
      sorter: (a: any, b: any) => (a.net_total || 0) - (b.net_total || 0),
      render: (amount: number) => {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' Ft';
      },
    },
    { ...statusColumn, key: 'status', sorter: (a: any, b: any) => strSort(a, b, 'status') },
    {
      title: 'Műveletek', key: 'actions', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="Tétel munkalap">
            <Button
              icon={<PrinterOutlined />}
              size="small"
              onClick={async () => {
                const productId = record.manufacturing_product_id || record.quote_item?.manufacturing_product;
                if (!productId) { message.warning('Ehhez a tételhez nincs nyomtatható altétel munkalap.'); return; }
                try {
                  const response = await api.get(
                    `/manufacturing/cost-items/work_sheet_for_product/?product_id=${productId}`,
                    { responseType: 'blob' }
                  );
                  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                  window.open(url, '_blank');
                } catch (e: any) {
                  if (e?.response?.status === 404) {
                    message.warning('Ehhez a tételhez nincs nyomtatható altétel munkalap.');
                  } else {
                    message.error('Hiba a munkalap letöltése során');
                  }
                }
              }}
            />
          </Tooltip>
          {(record.manufacturing_product_name || record.quote_item?.manufacturing_product) && (
            <Tooltip title="Altételek (új lapon)">
              <Button
                icon={<AppstoreOutlined />}
                size="small"
                onClick={() => {
                  const qriId = record.quote_item_id || record.quote_item?.id || record.id;
                  window.open(
                    `/sales/customer-orders/${record.originalOrder.id}/items/${qriId}/subitems`,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="Munkaóra indítása">
            <Button
              icon={<FieldTimeOutlined />}
              size="small"
              onClick={() => {
                setPreselectedOrderId(record.originalOrder.id);
                setPreselectedItemId(record.id);
                setTimerModalOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Törlés">
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => handleItemDelete(record.id)}
            />
          </Tooltip>
        </Space>
      )
    },
  ];

  const allVisibleItemCols = allItemColDefs.filter((c: any) => mergedColVis[c.key] !== false);

  // Reorder columns by colOrder and attach DnD + resize onHeaderCell
  const itemsColumns: ColumnsType<any> = colOrder
    .map(key => allVisibleItemCols.find((c: any) => c.key === key))
    .filter(Boolean)
    .map((col: any) => {
      const key = col.key;
      const isActions = key === 'actions';
      const w = mergedItemsWidths[key] || col.width;
      return {
        ...col,
        ...(w ? { width: w } : {}),
        onHeaderCell: () => ({
          id: key,
          colWidth: w,
          onResizeMove: handleItemsResizeMove,
          onResizeEnd: handleItemsResizeEnd,
        }),
      };
    }) as ColumnsType<any>;

  // Build ordersColumns with DnD + resize + visibility from the `columns` array
  const ordersColMap: Record<string, any> = Object.fromEntries(
    (columns as any[]).map((c: any) => [c.key, c])
  );
  const ordersColumns: ColumnsType<CustomerOrder> = ordersColOrder
    .filter(key => mergedOrdersColVis[key] !== false && ordersColMap[key])
    .map(key => {
      const col = ordersColMap[key];
      const isActions = key === 'actions';
      const w = mergedOrdersWidths[key] || col.width;
      return {
        ...col,
        ...(w ? { width: w } : {}),
        onHeaderCell: () => ({
          id: key,
          colWidth: w,
          onResizeMove: handleOrdersResizeMove,
          onResizeEnd: handleOrdersResizeEnd,
        }),
      };
    }) as ColumnsType<CustomerOrder>;



  const creators = useMemo(() => {
    const names = orders.map(o => o.created_by_name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [orders]);

  const normalizeSearchValue = (value: unknown): string => {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };

  const compactSearchValue = (value: string): string => value.replace(/[^a-z0-9]+/g, '');

  const collectSearchTokens = (value: unknown): string[] => {
    if (value === null || value === undefined) return [];

    if (typeof value === 'number') {
      return [
        String(value),
        new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 }).format(value),
        new Intl.NumberFormat('hu-HU', { useGrouping: false, maximumFractionDigits: 2 }).format(value),
      ];
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return [String(value)];
    }

    return [];
  };

  const orderMatchesSearch = (order: CustomerOrder, rawSearch: string): boolean => {
    const normalizedSearch = normalizeSearchValue(rawSearch.trim());
    const compactSearch = compactSearchValue(normalizedSearch);
    const searchTerms = normalizedSearch
      .split(/\s+/)
      .filter(Boolean);
    if (searchTerms.length === 0) return true;

    const tokens: string[] = [];
    const addValue = (value: unknown) => tokens.push(...collectSearchTokens(value));

    [
      order.order_number,
      order.quote_request_title,
      order.customer_name,
      order.contact_names,
      order.contact_email,
      order.created_by_name,
      order.notes,
      order.status,
      order.delivery_note_number,
      order.invoice_number,
      order.total_amount,
      (order as any).total_net_amount,
      (order as any).total_gross_amount,
    ].forEach(addValue);

    const orderItems = [
      order.items,
      (order as any).order_items,
      (order as any).customer_order_items,
      (order as any).items_data,
    ].find((value) => Array.isArray(value)) as any[] | undefined;

    if (Array.isArray(orderItems)) {
      orderItems.forEach((item: any) => {
        [
          item.product_name,
          item.manufacturing_product_name,
          item.material_name,
          item.service_name,
          item.product_code,
          item.material_code,
          item.service_code,
          item.product_description,
          item.internal_description,
          item.description,
          item.note,
          item.notes,
          item.supplier_name,
          item.status,
          item.quantity,
          item.unit_price,
          item.net_total,
          item.gross_total,
          item.total,
          item.total_amount,
          item.discount_amount,
          item.discount_percent,
        ].forEach(addValue);
      });
    }

    const haystack = normalizeSearchValue(tokens.join(' '));
    const compactHaystack = compactSearchValue(haystack);
    return (
      searchTerms.every((term) => haystack.includes(term)) ||
      compactHaystack.includes(compactSearch)
    );
  };

  const filteredOrders = orders.filter((order) => {
    // Status filter
    if (statusFilter && statusFilter.length > 0) {
       // 'invoiced' is a pseudo-status
       const isInvoiced = !!order.invoice_number;
       
       let match = false;
       
       if (isInvoiced) {
           if (statusFilter.includes('invoiced')) match = true;
       } else {
           if (statusFilter.includes(order.status)) match = true;
       }
       
       // Special case: if order is delivered but NOT invoiced, 
       // it should match if 'delivered' is in filter.
       // The logic above handles this: if !isInvoiced, we check if order.status ('delivered') is in filter.
       
       // However, if order is delivered AND invoiced, 
       // filter check 'delivered' would match above logic if we only checked status.
       // But we prioritize 'invoiced' state.
       // So: if Invoiced -> MUST have 'invoiced' in filter.
       // If NOT Invoiced -> MUST have status ('delivered', 'new', etc) in filter.
       
       if (!match) return false;
    }

    // Creator filter
    if (creatorFilter && order.created_by_name !== creatorFilter) return false;
    
    return deepSearchMatch(debouncedSearchText, order);
  });

  const flattenedItems = useMemo(() => {
    if (!isItemsView) return [];
    const res: any[] = [];
    filteredOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item, idx) => {
                res.push({
                    ...item,
                    uniqueId: `${order.id}_${item.id || idx}`,
                    originalOrder: order,
                    // Copy order fields needed for columns/filtering
                    order_date: order.order_date,
                    order_number: order.order_number,
                    customer_name: order.customer_name,
                    is_private: order.is_private,
                    deadline: order.deadline,
                    // Use COI's own status (item.status is the CustomerOrderItem status)
                    status: item.status || order.status,
                    order_status: order.status,
                    created_by_name: order.created_by_name,
                    contact_names: order.contact_names,
                    invoice_number: order.invoice_number,
                });
            });
        }
    });
    return res;
  }, [filteredOrders, isItemsView]);

  // --- Responsive: estimate required table width based on visible columns ---
  // Column width map for Items view — conservative minimum estimates (table uses auto layout)
  const ITEM_COL_WIDTHS: Record<string, number> = {
    order_date: 85,
    order_number: 115,
    name: 110,
    quantity: 80,
    net_unit_price: 105,
    product_description: 130,
    internal_description: 130,
    description: 130,
    supplier_name: 90,
    customer_name: 110,
    deadline: 85,
    net_total: 75,
    status: 95,
    actions: 115,
  };
  // Orders view has a fixed set of columns
  const ORDER_TABLE_MIN_WIDTH = 880;

  const requiredTableWidth = useMemo(() => {
    if (!isItemsView) return ORDER_TABLE_MIN_WIDTH;
    // Sum widths of visible item columns
    return colOrder
      .filter(key => mergedColVis[key] !== false)
      .reduce((sum, key) => sum + (ITEM_COL_WIDTHS[key] || 140), 0);
  }, [isItemsView, colOrder, mergedColVis]);

  const useCardLayout = containerWidth > 0 ? containerWidth < requiredTableWidth : !screens.xl;

  const formatDate = (date: string | null) =>
    date ? new Date(date).toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  const formatAmount = (amount: number | null | undefined) =>
    amount != null ? new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' Ft' : '-';

  const getItemName = (record: any) =>
    record.product_name || record.manufacturing_product_name || record.material_name || record.service_name || '-';

  const getItemCode = (record: any) =>
    record.product_code || record.material_code || record.service_code || '';

  const renderOrderCardActions = (record: CustomerOrder) => (
    <Space size="small" wrap>
      <Tooltip title="Részletek">
        <Button icon={<EyeOutlined />} size="small" onClick={() => navigate(`/sales/customer-orders/${record.id}`)} />
      </Tooltip>
      {(record.status === 'ready' || record.status === 'in_delivery') && (
        <Tooltip title={record.status === 'ready' ? 'Szállítás indítása' : 'Szállítási email újraküldése'}>
          <Button type="primary" icon={<CarOutlined />} size="small" onClick={() => window.open(`/sales/delivery-notes?create_from_order=${record.id}`, '_blank')} />
        </Tooltip>
      )}
      {record.status !== 'cancelled' && !isItemsView && (
        <Tooltip title="Tételek">
          <Button icon={<UnorderedListOutlined />} size="small" onClick={() => { setDrawerOrder({ id: record.id, number: record.order_number }); setItemsDrawerOpen(true); }} />
        </Tooltip>
      )}
      {['confirmed', 'in_production', 'ready', 'in_delivery', 'delivered'].includes(record.status) && (
        <Tooltip title="Munkalap nyomtatás (minden altétel)">
          <Button icon={<PrinterOutlined />} size="small" onClick={async () => {
            try {
              const response = await api.get(`/manufacturing/cost-items/work_sheet_for_order/?order_id=${record.id}`, { responseType: 'blob' });
              window.open(window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' })), '_blank');
            } catch (e: any) {
              if (e?.response?.status === 404) {
                message.warning('Ehhez a megrendeléshez nincs nyomtatható altétel munkalap.');
              } else {
                message.error('Hiba a munkalap letöltése során');
              }
            }
          }} />
        </Tooltip>
      )}
      {!['delivered', 'cancelled'].includes(record.status) && (
        <Tooltip title="Törlés">
          <Button danger icon={<CloseCircleOutlined />} size="small" onClick={() => {
            Modal.confirm({
              title: 'Biztosan törölni szeretné a megrendelést?',
              content: `Megrendelés: ${record.order_number}`,
              okText: 'Törlés', okType: 'danger', cancelText: 'Mégse',
              onOk: () => handleStatusChange(record.id, 'cancel', 'Törlés'),
            });
          }} />
        </Tooltip>
      )}
    </Space>
  );

  const renderItemCardActions = (record: any) => (
    <Space size="small" wrap>
      <Tooltip title="Részletek">
        <Button icon={<EyeOutlined />} size="small" onClick={() => navigate(`/sales/customer-orders/${record.originalOrder.id}`)} />
      </Tooltip>
      <Tooltip title="Tétel munkalap">
        <Button icon={<PrinterOutlined />} size="small" onClick={async () => {
          const productId = record.manufacturing_product_id || record.quote_item?.manufacturing_product;
          if (!productId) { message.warning('Ehhez a tételhez nincs nyomtatható altétel munkalap.'); return; }
          try {
            const res = await api.get(`/manufacturing/cost-items/work_sheet_for_product/?product_id=${productId}`, { responseType: 'blob' });
            window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
          } catch (e: any) {
            if (e?.response?.status === 404) {
              message.warning('Ehhez a tételhez nincs nyomtatható altétel munkalap.');
            } else {
              message.error('Hiba a munkalap letöltése során');
            }
          }
        }} />
      </Tooltip>
      <Tooltip title="Munkaóra indítása">
        <Button icon={<FieldTimeOutlined />} size="small" onClick={() => {
          setPreselectedOrderId(record.originalOrder.id);
          setPreselectedItemId(record.id);
          setTimerModalOpen(true);
        }} />
      </Tooltip>
      <Tooltip title="Törlés">
        <Button danger icon={<DeleteOutlined />} size="small" onClick={() => handleItemDelete(record.id)} />
      </Tooltip>
    </Space>
  );

  // Paginate data for card view
  const sortedCardsOrders = useMemo(() => {
    if (!cardOrderSortKey) return filteredOrders;
    const dir = cardOrderSortDir === 'asc' ? 1 : -1;
    return [...filteredOrders].sort((a, b) => {
      switch (cardOrderSortKey) {
        case 'order_date': return dir * (a.order_date || '').localeCompare(b.order_date || '');
        case 'order_number': return dir * (a.order_number || '').localeCompare(b.order_number || '', 'hu');
        case 'quote_request_title': return dir * (a.quote_request_title || '').localeCompare(b.quote_request_title || '', 'hu');
        case 'customer_name': {
          const aName = a.is_private ? (a.contact_names || '') : (a.customer_name || '');
          const bName = b.is_private ? (b.contact_names || '') : (b.customer_name || '');
          return dir * aName.localeCompare(bName, 'hu');
        }
        case 'deadline': return dir * (a.deadline || '').localeCompare(b.deadline || '');
        case 'total_net_amount': return dir * (((a as any).total_net_amount || a.total_amount || 0) - ((b as any).total_net_amount || b.total_amount || 0));
        case 'status': return dir * (a.status || '').localeCompare(b.status || '', 'hu');
        default: return 0;
      }
    });
  }, [filteredOrders, cardOrderSortKey, cardOrderSortDir]);

  const cardData = isItemsView ? flattenedItems : sortedCardsOrders;
  const paginatedCardData = cardData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderMobileCards = () => (
    <div className="co-mobile-cards">
      {!isItemsView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 2px' }}>
          <Select
            size="small"
            placeholder="Rendezés..."
            allowClear
            popupMatchSelectWidth={false}
            style={{ minWidth: 130 }}
            value={cardOrderSortKey || undefined}
            onChange={(v: string | undefined) => { setCardOrderSortKey(v ?? ''); }}
          >
            <Select.Option value="order_date">Dátum</Select.Option>
            <Select.Option value="order_number">Megr. szám</Select.Option>
            <Select.Option value="quote_request_title">Árajánlat</Select.Option>
            <Select.Option value="customer_name">Ügyfél</Select.Option>
            <Select.Option value="deadline">Határidő</Select.Option>
            <Select.Option value="total_net_amount">Nettó összeg</Select.Option>
            <Select.Option value="status">Státusz</Select.Option>
          </Select>
          {cardOrderSortKey && (
            <Tooltip title={cardOrderSortDir === 'asc' ? 'Növekvő sorrend' : 'Csökkenő sorrend'}>
              <Button
                size="small"
                icon={cardOrderSortDir === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                onClick={() => setCardOrderSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              />
            </Tooltip>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={cardData.length}
          onChange={(page) => setCurrentPage(page)}
          showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
          size="small"
        />
        <Select
          value={pageSize}
          onChange={(v) => { setPageSize(v); setCurrentPage(1); }}
          size="small"
          variant="borderless"
          style={{ width: 100, fontSize: 11, height: 24, lineHeight: '24px' }}
          popupMatchSelectWidth={false}
          options={[
            { value: 10, label: '10 / oldal' },
            { value: 20, label: '20 / oldal' },
            { value: 50, label: '50 / oldal' },
            { value: 100, label: '100 / oldal' },
          ]}
        />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><SyncOutlined spin style={{ fontSize: 24 }} /></div>
      ) : paginatedCardData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nincs találat</div>
      ) : (
        paginatedCardData.map((record: any) => {
          const order = isItemsView ? record.originalOrder : record;
          const key = isItemsView ? record.uniqueId : record.id;
          return (
            <div key={key} className="co-mobile-card">
              {/* Row 1: Dátum | Megr.szám | Tétel neve */}
              <div className="co-card-row co-card-row-top">
                <div className="co-card-cell co-card-date">
                  <span className="co-card-label">Dátum</span>
                  <span className="co-card-value">{formatDate(record.order_date)}</span>
                </div>
                <div className="co-card-cell co-card-order-num">
                  <span className="co-card-label">Megr. szám</span>
                  <a className="co-card-value co-card-link" onClick={() => navigate(`/sales/customer-orders/${order.id}`)}>
                    {record.order_number}
                  </a>
                </div>
                <div className="co-card-cell co-card-name" style={{ flex: 2 }}>
                  <span className="co-card-label">{isItemsView ? 'Tétel neve' : 'Árajánlat'}</span>
                  <span className="co-card-value">
                    {isItemsView ? (
                      <>
                        <span style={{ fontWeight: 500 }}>{getItemName(record)}</span>
                        {getItemCode(record) && <span style={{ fontSize: 10, color: '#666', marginLeft: 4 }}>{getItemCode(record)}</span>}
                      </>
                    ) : (
                      record.quote_request_title || '-'
                    )}
                  </span>
                </div>
              </div>

              {/* Row 2: Leírás | Megjegyzés | Beszállítók */}
              {isItemsView && (mergedColVis.product_description || mergedColVis.description || mergedColVis.supplier_name) && (
                <div className="co-card-row co-card-row-mid">
                  {mergedColVis.product_description && (
                    <div className="co-card-cell">
                      <span className="co-card-label">Leírás</span>
                      <span className="co-card-value co-card-clamp">{record.product_description || '-'}</span>
                    </div>
                  )}
                  {mergedColVis.description && (
                    <div className="co-card-cell">
                      <span className="co-card-label">Megjegyzés</span>
                      <span className="co-card-value co-card-clamp">{record.description || '-'}</span>
                    </div>
                  )}
                  {mergedColVis.supplier_name && (
                    <div className="co-card-cell">
                      <span className="co-card-label">Beszállítók</span>
                      <span className="co-card-value co-card-clamp">{record.supplier_name || '-'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Row 3: Ügyfél | Határidő | Nettó összeg */}
              <div className="co-card-row co-card-row-details">
                <div className="co-card-cell">
                  <span className="co-card-label">Ügyfél</span>
                  <span className="co-card-value" style={{ fontWeight: 600 }}>
                    {record.is_private ? (record.contact_names || 'Magánszemély') : (record.customer_name || 'Magánszemély')}
                  </span>
                </div>
                <div className="co-card-cell">
                  <span className="co-card-label">Határidő</span>
                  <span className="co-card-value">{formatDate(record.deadline)}</span>
                </div>
                <div className="co-card-cell" style={{ textAlign: 'right' }}>
                  <span className="co-card-label">Nettó összeg</span>
                  <span className="co-card-value" style={{ fontWeight: 600 }}>
                    {formatAmount(isItemsView ? record.net_total : (record as any).total_net_amount)}
                  </span>
                </div>
              </div>

              {/* Row 4: Státusz | Műveletek */}
              <div className="co-card-row co-card-row-bottom">
                <div className="co-card-cell">
                  {statusTag(record.status, order)}
                </div>
                <div className="co-card-cell co-card-actions">
                  {isItemsView ? renderItemCardActions(record) : renderOrderCardActions(order)}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={cardData.length}
          onChange={(page) => setCurrentPage(page)}
          showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
          size="small"
        />
        <Select
          value={pageSize}
          onChange={(v) => { setPageSize(v); setCurrentPage(1); }}
          size="small"
          variant="borderless"
          style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }}
          popupMatchSelectWidth={false}
          options={[
            { value: 10, label: '10 / oldal' },
            { value: 20, label: '20 / oldal' },
            { value: 50, label: '50 / oldal' },
            { value: 100, label: '100 / oldal' },
          ]}
        />
      </div>
    </div>
  );

  return (
    <>
    <Card
      title={<UnifiedQuickSearchHeader
        title="Megrendelések"
        searchValue={searchText}
        onSearchChange={setSearchText}
        placeholder="Keresés..."
      />}
      extra={
        <Space className="pixi-unified-card-actions">
           <Dropdown
              menu={{
                items: [
                   ...DEFAULT_ITEMS_COL_ORDER.map(key => ({
                     key,
                     label: COL_LABELS[key] || key,
                     icon: mergedColVis[key] !== false ? <CheckOutlined /> : <CloseOutlined />,
                     onClick: () => toggleCol(key),
                   })),
                   { type: 'divider' as const },
                   { key: 'reset_vis', label: 'Láthatóság alaphelyzete', icon: <ReloadOutlined />, onClick: () => setColVis(DEFAULT_COL_VISIBILITY) },
                   { key: 'reset_order', label: 'Sorrend alaphelyzete', icon: <ReloadOutlined />, onClick: () => setColOrder(DEFAULT_ITEMS_COL_ORDER) },
                   { key: 'reset_sort', label: 'Rendezés törlése', icon: <ReloadOutlined />, onClick: () => setTableResetKey(k => k + 1) },
                ]
              }}
            >
                <Button icon={<AppstoreOutlined />} />
            </Dropdown>
          <Select
            placeholder="Szűrés rögzítőre"
            allowClear
            style={{ width: 150 }}
            onChange={setCreatorFilter}
            value={creatorFilter}
          >
            {creators.map((name: any) => (
              <Select.Option key={name} value={name}>{name}</Select.Option>
            ))}
          </Select>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'not_ready',
                  label: 'Nincs kész (Új, Megerősítve, Gyártásban)',
                  onClick: () => setStatusFilter(['new', 'confirmed', 'in_production']),
                },
                {
                  key: 'not_delivered',
                  label: 'Nincs leszállítva (Minden aktív)',
                  onClick: () => setStatusFilter(['new', 'confirmed', 'in_production', 'ready', 'in_delivery']),
                },
                {
                  key: 'all',
                  label: 'Minden (kivéve törölt/számlázott)',
                  onClick: () => setStatusFilter(['new', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered']),
                },
              ]
            }}
          >
              <Button icon={<FilterOutlined />}>Gyorsszűrők</Button>
          </Dropdown>
          {csvMode ? (
            <Space size="small">
              <span style={{ fontSize: 13, color: '#666' }}>
                {csvSelectedKeys.length > 0 ? `${csvSelectedKeys.length} kijelölve` : 'Minden látható'}
              </span>
              <Button type="primary" icon={<FileTextOutlined />} size="small" onClick={exportCsv}>
                CSV letöltés
              </Button>
              <Button size="small" onClick={() => { setCsvMode(false); setCsvSelectedKeys([]); }}>
                Mégse
              </Button>
            </Space>
          ) : (
            <Tooltip title="CSV export" placement="bottom">
              <Button icon={<FileTextOutlined />} onClick={() => { setCsvMode(true); setCsvSelectedKeys([]); }} />
            </Tooltip>
          )}
          <Tooltip
            title={statusFilter.length > 0
              ? statusFilter.map(v => ({
                  new: 'Új', confirmed: 'Megerősítve', in_production: 'Gyártásban',
                  ready: 'Kész', in_delivery: 'Szállítás alatt', delivered: 'Leszállítva',
                  invoiced: 'Kiszámlázva', cancelled: 'Törölve',
                }[v] ?? v)).join(' · ')
              : null}
            placement="bottom"
            mouseEnterDelay={0.5}
          >
          <Select
            mode="multiple"
            style={{ minWidth: 160, maxWidth: 380 }}
            placeholder="Szűrés státuszra"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'new', label: 'Új' },
              { value: 'confirmed', label: 'Megerősítve' },
              { value: 'in_production', label: 'Gyártásban' },
              { value: 'ready', label: 'Kész' },
              { value: 'in_delivery', label: 'Szállítás alatt' },
              { value: 'delivered', label: 'Leszállítva' },
              { value: 'invoiced', label: 'Kiszámlázva' },
              { value: 'cancelled', label: 'Törölve' },
            ]}
            maxTagCount="responsive"
            tagRender={({ value, label, onClose }) => {
              const colorMap: Record<string, { bg: string; text: string; border: string }> = {
                new:          { bg: '#e6f4ff', text: '#1677ff', border: '#91caff' },
                confirmed:    { bg: '#e6fffb', text: '#08979c', border: '#87e8de' },
                in_production:{ bg: '#fff7e6', text: '#d46b08', border: '#ffd591' },
                ready:        { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f' },
                in_delivery:  { bg: '#f9f0ff', text: '#722ed1', border: '#d3adf7' },
                delivered:    { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f' },
                invoiced:     { bg: '#f9f0ff', text: '#531dab', border: '#d3adf7' },
                cancelled:    { bg: '#fff1f0', text: '#cf1322', border: '#ffa39e' },
              };
              const c = colorMap[value as string] || { bg: '#f5f5f5', text: '#666', border: '#d9d9d9' };
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  margin: '2px 2px',
                  padding: '1px 7px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  background: c.bg,
                  color: c.text,
                  border: `1px solid ${c.border}`,
                  lineHeight: '18px',
                }}>
                  {label}
                  <span
                    onClick={e => { e.stopPropagation(); onClose(); }}
                    style={{ cursor: 'pointer', marginLeft: 2, fontSize: 10, opacity: 0.7, lineHeight: 1 }}
                  >✕</span>
                </span>
              );
            }}
          />
          </Tooltip>
        </Space>
      }
    >
      <div ref={containerRef}>
      {bulkSelectedKeys.length > 0 && !csvMode && (
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 10px', flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0', marginBottom: 2 }}>
          <span style={{ fontSize: 13, color: '#555' }}>{bulkSelectedKeys.length} tétel kijelölve</span>
          <Button size="small" onClick={() => setBulkSelectedKeys([])}>Kijelölés törlése</Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            loading={bulkPrinting}
            onClick={handleBulkPrintWorksheets}
          >
            Munkalap nyomtatása
          </Button>
        </div>
      )}
      {useCardLayout ? renderMobileCards() : (
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={isItemsView ? handleColDragEnd : handleOrdersColDragEnd}
      >
        <Table
          key={tableResetKey}
          columns={isItemsView ? itemsColumns : ordersColumns}
          dataSource={isItemsView ? flattenedItems : filteredOrders}
          rowKey={isItemsView ? 'uniqueId' : 'id'}
          loading={loading}
          size="small"
          expandable={isItemsView ? {
            rowExpandable: (record: any) => !!(record.manufacturing_product_id),
            expandedRowKeys: itemsViewExpandedKeys,
            onExpand: (expanded: boolean, record: any) => {
              if (expanded) {
                setItemsViewExpandedKeys(prev => Array.from(new Set([...prev, record.uniqueId])));
                loadItemAtts(Number(record.id));
              } else {
                setItemsViewExpandedKeys(prev => prev.filter(k => k !== record.uniqueId));
              }
            },
            expandedRowRender: (record: any) => renderItemExpand(record),
          } : {
            expandedRowKeys: expandedOrderKeys,
            onExpand: (expanded: boolean, record: any) => {
              if (expanded) {
                setExpandedOrderKeys(prev => Array.from(new Set([...prev, record.id])));
                loadOrderExpandedItems(record);
              } else {
                setExpandedOrderKeys(prev => prev.filter((k) => k !== record.id));
              }
            },
            expandedRowRender: renderExpandedOrderRow,
            rowExpandable: (record: any) => {
              const count = Array.isArray(record?.items) ? record.items.length : 0;
              return count > 0;
            },
          }}
          rowSelection={csvMode ? {
            selectedRowKeys: csvSelectedKeys,
            onChange: (keys) => setCsvSelectedKeys(keys),
            columnWidth: 40,
          } : {
            selectedRowKeys: bulkSelectedKeys,
            onChange: (keys) => setBulkSelectedKeys(keys),
            columnWidth: 32,
          }}
          className="co-responsive-table"
          tableLayout="auto"
          pagination={{
            pageSize: pageSize,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
            position: ['topCenter'],
            current: currentPage,
            onChange: (page) => setCurrentPage(page),
          }}
          footer={() => {
            const dataLen = (isItemsView ? flattenedItems : filteredOrders).length;
            return (
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Pagination
                  current={currentPage}
                  pageSize={pageSize}
                  total={dataLen}
                  onChange={(page) => setCurrentPage(page)}
                  showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
                  size="small"
                />
                <Select
                  value={pageSize}
                  onChange={(v) => { setPageSize(v); setCurrentPage(1); }}
                  size="small"
                  variant="borderless"
                  style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }}
                  popupMatchSelectWidth={false}
                  options={[
                    { value: 10, label: '10 / oldal' },
                    { value: 20, label: '20 / oldal' },
                    { value: 50, label: '50 / oldal' },
                    { value: 100, label: '100 / oldal' },
                  ]}
                />
              </div>
            );
          }}
          components={{
            header: {
              row: ({ children, ...rowProps }: any) => (
                <SortableContext
                  items={isItemsView ? itemsColumns.map((c: any) => c.key) : ordersColumns.map((c: any) => c.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  <tr {...rowProps}>{children}</tr>
                </SortableContext>
              ),
              cell: DraggableHeaderCell,
            }
          }}
        />
      </DndContext>
      )}
      </div>
      
      {/* Timestamp Modal */}
      <Modal
        title={timestampAction === 'mark_ready' ? 'Készre jelentés dátuma' : 'Leszállítva dátuma'}
        open={timestampModalOpen}
        onOk={async () => {
          if (!selectedOrder || !selectedTimestamp) return;
          try {
            await api.post(
              `/sales/customer-orders/${selectedOrder.id}/${timestampAction}/`,
              { timestamp: selectedTimestamp.format('YYYY-MM-DD HH:mm:ss') }
            );
            message.success(timestampAction === 'mark_ready' ? 'Készre jelentve' : 'Leszállítva jelölve');
            setTimestampModalOpen(false);
            fetchOrders();
          } catch (error: any) {
            message.error(error.response?.data?.error || 'Művelet sikertelen');
          }
        }}
        onCancel={() => setTimestampModalOpen(false)}
        okText="Mentés"
        cancelText="Mégse"
      >
        <DatePicker
          showTime
          value={selectedTimestamp}
          onChange={setSelectedTimestamp}
          format="YYYY-MM-DD HH:mm:ss"
          style={{ width: '100%' }}
        />
      </Modal>
      
      {/* Delivery Modal */}
      <Modal
        title={selectedOrder?.status === 'in_delivery' ? 'Szállítási email újraküldése' : 'Szállítás indítása'}
        open={deliveryModalOpen}
        onCancel={() => setDeliveryModalOpen(false)}
        afterOpenChange={(open) => {
          if (open && selectedOrder?.contact_email) {
            const emailInput = document.getElementById('delivery-email-input') as HTMLInputElement;
            if (emailInput) {
              emailInput.value = selectedOrder.contact_email;
            }
          }
        }}
        onOk={async () => {
          if (!selectedOrder) return;
          
          const recipientEmail = (document.getElementById('delivery-email-input') as HTMLInputElement)?.value;
          const showPrices = (document.getElementById('delivery-show-prices') as HTMLInputElement)?.checked ?? true;
          
          try {
            const response = await api.post(
              `/sales/customer-orders/${selectedOrder.id}/start_delivery/`,
              { 
                recipient_email: recipientEmail,
                show_prices: showPrices
              }
            );
            
            const successMessage = response.data.message || 'Szállítás elindítva';
            const deliveryUrl = response.data.delivery_url;
            
            // Create clickable link message
            message.success({
              content: (
                <span>
                  {successMessage}! Link: <a href={deliveryUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff', textDecoration: 'underline' }}>{deliveryUrl}</a>
                </span>
              ),
              duration: 10, // Show for 10 seconds
            });
            
            setDeliveryModalOpen(false);
            fetchOrders();
          } catch (error: any) {
            message.error('Hiba történt: ' + (error.response?.data?.error || error.message));
          }
        }}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          {selectedOrder?.delivery_note_number && (
             <div style={{ marginBottom: 12, fontSize: 16, fontWeight: 'bold' }}>
                Szállítólevél sorszám: <span style={{ color: '#1890ff' }}>{selectedOrder.delivery_note_number}</span>
             </div>
          )}
          <label htmlFor="delivery-email-input" style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            E-mail cím (ügyfél):
          </label>
          <input
            id="delivery-email-input"
            type="email"
            placeholder="ugyfel@example.com"
            defaultValue={selectedOrder?.contact_email || ''}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
          <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            {selectedOrder?.status === 'in_delivery' 
              ? 'Az értesítő email újra el lesz küldve a megadott címre. A szállítólevél link ugyanaz marad.'
              : 'A megadott e-mail címre értesítés lesz küldve a publikus szállítólevél linkkel.'}
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              id="delivery-show-prices"
              type="checkbox"
              defaultChecked={true}
              style={{ marginRight: 8 }}
            />
            <span>Árak megjelenítése a szállítólevélen</span>
          </label>
        </div>
      </Modal>
      <OrderItemsDrawer 
        open={itemsDrawerOpen} 
        onClose={() => setItemsDrawerOpen(false)} 
        orderId={drawerOrder?.id || null} 
        orderNumber={drawerOrder?.number}
        onOrderUpdate={fetchOrders}
      />
      
      <Modal
            title="Visszaigazoló Email"
            open={emailModalOpen}
            width={800}
            onCancel={() => setEmailModalOpen(false)}
            footer={[
                <Button key="cancel" onClick={() => setEmailModalOpen(false)}>Mégse</Button>,
                <Button key="send" type="primary" loading={emailSending} onClick={async () => {
                    if (!emailTargetOrder) return;
                    try {
                        const values = await emailForm.validateFields();
                        setEmailSending(true);
                        
                        // 1. Update status WITHOUT email
                        await api.post(`/sales/customer-orders/${emailTargetOrder.id}/update_status/`, { 
                            status: 'confirmed',
                            send_email: false
                        });

                        // 2. Send custom email
                        await api.post(`/sales/customer-orders/${emailTargetOrder.id}/send_confirmation_email_manual/`, values);
                        
                        message.success('Státusz frissítve és email elküldve');
                        setEmailModalOpen(false);
                        fetchOrders();
                    } catch (e: any) {
                         message.error(e.response?.data?.error || 'Hiba történt');
                    } finally {
                        setEmailSending(false);
                    }
                }}>Küldés</Button>
            ]}
        >
            <Form form={emailForm} layout="vertical">
                <Form.Item name="to" label="Címzett" rules={[{ required: true, message: 'Kötelező mező' }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="subject" label="Tárgy" rules={[{ required: true, message: 'Kötelező mező' }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="body" label="Üzenet szövege" rules={[{ required: true, message: 'Kötelező mező' }]}>
                    <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50 }} />
                </Form.Item>
            </Form>
        </Modal>
    </Card>
    <AttachmentPreviewModal
      open={coAttPreviewOpen}
      title={coAttPreviewTitle}
      url={coAttPreviewUrl}
      onClose={() => { setCoAttPreviewOpen(false); setCoAttPreviewUrl(null); setCoAttPreviewTitle(''); }}
    />
    <Modal
      open={bulkPrintModalOpen}
      title={<><PrinterOutlined style={{ marginRight: 8 }} />Munkalap nyomtatása</>}
      okText="Nyomtatás"
      cancelText="Mégsem"
      onOk={executeBulkPrint}
      onCancel={() => setBulkPrintModalOpen(false)}
      width={440}
    >
      <p style={{ marginBottom: 16 }}>
        <strong>{new Set(bulkSelectedKeys.map((k) => String(k).split('_')[0])).size}</strong> kijelölt megrendelés munkalapját nyomtatod ki.
      </p>
      <div style={{ marginBottom: 8, fontWeight: 500 }}>Nyomtató / mód:</div>
      <Select
        value={bulkPrintMode}
        onChange={(v) => setBulkPrintMode(v)}
        style={{ width: '100%' }}
        options={[
          {
            value: 'direct',
            label: (
              <span>
                <PrinterOutlined style={{ marginRight: 6 }} />
                Közvetlen nyomtatás — nyomtatóválasztó ablak nyílik meg minden munkalaphoz
              </span>
            ),
          },
          {
            value: 'preview',
            label: (
              <span>
                <EyeOutlined style={{ marginRight: 6 }} />
                Előnézet — PDF megnyitása új tabban (kézzel nyomtatható)
              </span>
            ),
          },
        ]}
      />
      {bulkPrintMode === 'direct' && (
        <p style={{ marginTop: 12, color: '#6b7280', fontSize: 12 }}>
          Minden munkalaphoz megnyílik a böngésző nyomtatási párbeszédablaka, ahol kiválaszthatod a nyomtatót és a beállításokat.
        </p>
      )}
    </Modal>
    </>
  );
};

export default CustomerOrders;
