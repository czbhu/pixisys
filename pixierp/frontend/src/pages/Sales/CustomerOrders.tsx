import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Table, Card, Button, Tag, Space, message, Modal, Tooltip, Input, Select, DatePicker, Switch, Dropdown, Popover, Grid, Form, Pagination } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { PrinterOutlined, EyeOutlined, CheckOutlined, ToolOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, UnorderedListOutlined, RocketOutlined, FilterOutlined, DeleteOutlined, SyncOutlined, CloseOutlined, QuestionCircleOutlined, ExclamationCircleOutlined, FieldTimeOutlined, MailOutlined, SearchOutlined, ReloadOutlined, SortAscendingOutlined, SortDescendingOutlined, AppstoreOutlined, FileTextOutlined } from '@ant-design/icons';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
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
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import { Spin as AntSpin } from 'antd';
import './CustomerOrders.css';

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
    if (typeof document !== 'undefined') {
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = str;
        return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
      } catch { /* fallthrough */ }
    }
    return str.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const DEFAULT_ITEMS_COL_ORDER = [
    'order_date', 'order_number', 'name',
    'product_description', 'internal_description', 'description',
    'supplier_name', 'customer_name', 'deadline',
    'net_total', 'status', 'actions',
  ];

  const DEFAULT_COL_VISIBILITY: Record<string, boolean> = {
    order_date: true,
    order_number: true,
    name: true,
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

  const DraggableHeaderCell: React.FC<any> = ({ id, children, ...props }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'noop' });
    const style: React.CSSProperties = {
      ...props.style,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 1 : undefined,
      position: isDragging ? 'relative' : undefined,
      cursor: isDragging ? 'grabbing' : 'default',
      userSelect: 'none',
    };
    if (!id) return <th {...props}>{children}</th>;
    return (
      <th {...props} ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {children}
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
  const [orderExpandedItems, setOrderExpandedItems] = useState<Record<number, any[]>>({});
  const [orderExpandedLoading, setOrderExpandedLoading] = useState<Record<number, boolean>>({});
  
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
  const [isItemsView, setIsItemsView] = useState(
    savedSettings?.isItemsView || false
  );
  const [csvMode, setCsvMode] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);

  const exportCsv = () => {
    const isOrders = !isItemsView;
    let rows: any[];
    if (isOrders) {
      const data = csvSelectedKeys.length > 0
        ? filteredOrders.filter(o => csvSelectedKeys.includes(o.id))
        : filteredOrders;
      rows = data.map(o => ({
        'Megr. szám': o.order_number,
        'Dátum': o.order_date ? dayjs(o.order_date).format('YYYY-MM-DD') : '',
        'Ügyfél': o.customer_name,
        'Árajánlat': o.quote_request_title,
        'Kapcsolattartó': o.contact_names,
        'Határidő': o.deadline ? dayjs(o.deadline).format('YYYY-MM-DD') : '',
        'Nettó összeg': o.total_amount ?? '',
        'Státusz': o.status,
        'Számlaszám': o.invoice_number ?? '',
        'Szállítólevél': o.delivery_note_number ?? '',
        'Rögzítő': o.created_by_name ?? '',
      }));
    } else {
      const data = csvSelectedKeys.length > 0
        ? flattenedItems.filter((it: any) => csvSelectedKeys.includes(it.uniqueId))
        : flattenedItems;
      rows = data.map((it: any) => ({
        'Megr. szám': it.order_number,
        'Dátum': it.order_date ? dayjs(it.order_date).format('YYYY-MM-DD') : '',
        'Ügyfél': it.customer_name,
        'Tétel neve': it.name,
        'Leírás': stripHtml(it.product_description),
        'Belső leírás': stripHtml(it.internal_description),
        'Megjegyzés': stripHtml(it.description),
        'Beszállító': it.supplier_name ?? '',
        'Határidő': it.deadline ? dayjs(it.deadline).format('YYYY-MM-DD') : '',
        'Nettó összeg': it.net_total ?? '',
        'Státusz': it.status,
      }));
    }
    if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
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
    const settings = {
        statusFilter,
        creatorFilter,
        isItemsView
    };
    localStorage.setItem('customerOrdersSettings', JSON.stringify(settings));
  }, [statusFilter, creatorFilter, isItemsView]);

  
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
    'customerOrders_colOrder',
    DEFAULT_ITEMS_COL_ORDER
  );
  // Merge: add new default keys that aren't saved, drop removed keys
  const colOrder = [
    ...(colOrderRaw || []).filter((k: string) => DEFAULT_ITEMS_COL_ORDER.includes(k)),
    ...DEFAULT_ITEMS_COL_ORDER.filter(k => !(colOrderRaw || []).includes(k)),
  ];
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 400, tolerance: 8 } }));

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
    'customerOrders_ordersColOrder',
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
      const sorted = [...src].sort((a: any, b: any) => {
        const ao = Number(a?.sort_order ?? 0);
        const bo = Number(b?.sort_order ?? 0);
        if (ao !== bo) return ao - bo;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });
      const map = new Map<number, any>();
      sorted.forEach((it: any) => map.set(it.id, { ...it, children: [] }));
      const roots: any[] = [];
      sorted.forEach((it: any) => {
        const node = map.get(it.id);
        const pid = it.parent;
        if (pid && map.has(pid)) map.get(pid).children.push(node);
        else roots.push(node);
      });
      setOrderExpandedItems(prev => ({ ...prev, [orderId]: roots }));
    } catch (e) {
      console.error(e);
      message.error('Nem sikerült betölteni a megrendelés tételeit');
      setOrderExpandedItems(prev => ({ ...prev, [orderId]: [] }));
    } finally {
      setOrderExpandedLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const renderExpandedOrderRow = (record: any) => {
    const orderId = Number(record?.id || 0);
    const loadingItems = !!orderExpandedLoading[orderId];
    const treeItems = orderExpandedItems[orderId];

    if (loadingItems) {
      return (
        <div style={{ padding: '12px 8px 12px 28px' }}>
          <AntSpin size="small" />
        </div>
      );
    }

    if (!treeItems || treeItems.length === 0) {
      return <div style={{ padding: '12px 8px 12px 28px', color: '#888' }}>Nincsenek tételek.</div>;
    }

    return (
      <div style={{ padding: '8px 0 8px 28px' }}>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={treeItems}
          columns={[
            {
              title: 'Megnevezés',
              key: 'name',
              render: (_: any, r: any) => (
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {r.product_name || r.manufacturing_product_name || r.material_name || r.service_name || r.name || r.description || '-'}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{r.product_code || r.manufacturing_product_code || r.material_code || r.service_code || ''}</div>
                </div>
              ),
            },
            {
              title: 'Mennyiség',
              key: 'qty',
              width: 120,
              render: (_: any, r: any) => `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
            },
            {
              title: 'Megjegyzés',
              dataIndex: 'description',
              key: 'description',
              ellipsis: true,
            },
          ]}
          expandable={{
            rowExpandable: (r: any) => !!(
              (r.item_type === 'manufacturing' || r.manufacturing_product_name || r.quote_item?.manufacturing_product) &&
              Number(r.quote_item?.manufacturing_product || r.manufacturing_product || 0) > 0
            ),
            expandedRowRender: (r: any) => {
              const productId = Number(r.quote_item?.manufacturing_product || r.manufacturing_product || 0);
              if (!productId) return null;
              return (
                <div style={{ padding: '8px 0 8px 28px' }}>
                  <ProductSubItemsTable productId={productId} readOnly />
                </div>
              );
            },
            defaultExpandAllRows: true,
          }}
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
    const { color, text } = statusMap[status] || { color: 'default', text: status };
    
    const content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
            <Popover content={content} title="Státusz váltás" trigger="click" overlayInnerStyle={{ padding: '6px 8px' }}>
                <Tag color={color} style={{ cursor: 'pointer' }}>{text}</Tag>
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
            <Tooltip title="Munkalap nyomtatás">
              <Button
                icon={<PrinterOutlined />}
                size="small"
                onClick={async () => {
                  try {
                    const response = await api.get(
                      `/sales/customer-orders/${record.id}/work_sheet/`,
                      {
                        responseType: 'blob',
                      }
                    );
                    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                    window.open(url, '_blank');
                  } catch (error: any) {
                    message.error('Hiba a munkalap letöltése során');
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
      title: 'Árajánlat',
      dataIndex: 'quote_request_title',
      key: 'quote_request_title',
      responsive: ['lg'] as any,
      sorter: (a: any, b: any) => (a.quote_request_title || '').localeCompare(b.quote_request_title || '', 'hu'),
      render: (text: string, record: CustomerOrder) => (
        <Tooltip title={text}>
          {record.quote_request_id ? (
            <a
              style={{ color: '#1677ff', cursor: 'pointer' }}
              onClick={() => navigate(`/sales/rfqs/${record.quote_request_id}`)}
            >
              {text}
            </a>
          ) : (
            <span>{text || '-'}</span>
          )}
        </Tooltip>
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
                <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryName}</div>
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
      title: 'Tétel neve', key: 'name', ellipsis: true,
      sorter: (a: any, b: any) => {
        const nameA = a.product_name || a.manufacturing_product_name || a.material_name || a.service_name || '';
        const nameB = b.product_name || b.manufacturing_product_name || b.material_name || b.service_name || '';
        return nameA.localeCompare(nameB, 'hu');
      },
      render: (_: any, record: any) => {
        const name = record.product_name || record.manufacturing_product_name || record.material_name || record.service_name || '-';
        const code = record.product_code || record.material_code || record.service_code;
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            {code && <div style={{ fontSize: '11px', color: '#666' }}>{code}</div>}
          </div>
        );
      },
    },
    {
      title: 'Leírás', dataIndex: 'product_description', key: 'product_description', width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'product_description'),
      render: (t: string) => { const p = stripHtml(t); return (<div title={p} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#555' }}>{p}</div>); }
    },
    {
      title: 'Belső leírás', dataIndex: 'internal_description', key: 'internal_description', width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'internal_description'),
      render: (t: string) => { const p = stripHtml(t); return (<div title={p} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#844' }}>{p}</div>); }
    },
    {
      title: 'Megjegyzés', dataIndex: 'description', key: 'description', responsive: ['md'] as any, width: 200,
      sorter: (a: any, b: any) => strSort(a, b, 'description'),
      render: (t: string) => { const p = stripHtml(t); return (<div title={p} style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p}</div>); }
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
              {secondaryName && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryName}</div>}
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
                try {
                  const qriId = record.quote_item_id || record.id;
                  const response = await api.get(
                    `/sales/customer-orders/${record.originalOrder.id}/item_work_sheet/?item_id=${qriId}`,
                    { responseType: 'blob' }
                  );
                  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                  window.open(url, '_blank');
                } catch (error) {
                  message.error('Hiba a munkalap letöltése során');
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

  // Reorder columns by colOrder and attach DnD onHeaderCell
  const itemsColumns: ColumnsType<any> = colOrder
    .map(key => allVisibleItemCols.find((c: any) => c.key === key))
    .filter(Boolean)
    .map((col: any) => ({ ...col, onHeaderCell: () => ({ id: col.key }) })) as ColumnsType<any>;

  // Build ordersColumns with DnD + visibility from the `columns` array
  const ordersColMap: Record<string, any> = Object.fromEntries(
    (columns as any[]).map((c: any) => [c.key, c])
  );
  const ordersColumns: ColumnsType<CustomerOrder> = ordersColOrder
    .filter(key => mergedOrdersColVis[key] !== false && ordersColMap[key])
    .map(key => ({ ...ordersColMap[key], onHeaderCell: () => ({ id: key }) })) as ColumnsType<CustomerOrder>;



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
                    status: order.status,
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
        <Tooltip title="Munkalap nyomtatás">
          <Button icon={<PrinterOutlined />} size="small" onClick={async () => {
            try {
              const response = await api.get(`/sales/customer-orders/${record.id}/work_sheet/`, { responseType: 'blob' });
              window.open(window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' })), '_blank');
            } catch { message.error('Hiba a munkalap letöltése során'); }
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
          try {
            const qriId = record.quote_item_id || record.id;
            const res = await api.get(`/sales/customer-orders/${record.originalOrder.id}/item_work_sheet/?item_id=${qriId}`, { responseType: 'blob' });
            window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
          } catch { message.error('Hiba a munkalap letöltése során'); }
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
    <Card
      title={<UnifiedQuickSearchHeader
        title="Megrendelések"
        searchValue={searchText}
        onSearchChange={setSearchText}
        placeholder="Keresés..."
      />}
      extra={
        <Space className="pixi-unified-card-actions">
           <div
              style={{
                display: 'inline-flex',
                background: '#e6e8ec',
                borderRadius: 999,
                padding: 3,
                gap: 0,
              }}
            >
              <div
                onClick={() => setIsItemsView(false)}
                style={{
                  padding: '4px 16px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  background: !isItemsView ? '#ffffff' : 'transparent',
                  color: !isItemsView ? '#1677ff' : '#666',
                  boxShadow: !isItemsView ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                  userSelect: 'none',
                }}
              >
                Megrendelések
              </div>
              <div
                onClick={() => setIsItemsView(true)}
                style={{
                  padding: '4px 16px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  background: isItemsView ? '#1677ff' : 'transparent',
                  color: isItemsView ? '#ffffff' : '#666',
                  boxShadow: isItemsView ? '0 1px 4px rgba(22,119,255,0.25)' : 'none',
                  userSelect: 'none',
                }}
              >
                Tételek
              </div>
            </div>
           {isItemsView && (
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
          )}
          {!isItemsView && (
            <Dropdown
              menu={{
                items: [
                   ...DEFAULT_ORDERS_COL_ORDER.map(key => ({
                     key,
                     label: ORDERS_COL_LABELS[key] || key,
                     icon: mergedOrdersColVis[key] !== false ? <CheckOutlined /> : <CloseOutlined />,
                     onClick: () => toggleOrdersCol(key),
                   })),
                   { type: 'divider' as const },
                   { key: 'reset_vis', label: 'Láthatóság alaphelyzete', icon: <ReloadOutlined />, onClick: () => setOrdersColVis(DEFAULT_ORDERS_COL_VIS) },
                   { key: 'reset_order', label: 'Sorrend alaphelyzete', icon: <ReloadOutlined />, onClick: () => setOrdersColOrder(DEFAULT_ORDERS_COL_ORDER) },
                   { key: 'reset_sort', label: 'Rendezés törlése', icon: <ReloadOutlined />, onClick: () => setTableResetKey(k => k + 1) },
                ]
              }}
            >
                <Button icon={<AppstoreOutlined />} />
            </Dropdown>
          )}
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
            rowExpandable: (record: any) => {
              const productId = Number(record.quote_item?.manufacturing_product || record.manufacturing_product || 0);
              return productId > 0;
            },
            expandedRowRender: (record: any) => {
              const productId = Number(record.quote_item?.manufacturing_product || record.manufacturing_product || 0);
              if (!productId) return <div style={{ padding: '8px 16px', color: '#999' }}>Nincs altétel.</div>;
              return (
                <div style={{ padding: '8px 0 8px 28px' }}>
                  <ProductSubItemsTable productId={productId} />
                </div>
              );
            },
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
          } : undefined}
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
                  items={isItemsView ? colOrder : ordersColOrder}
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
  );
};

export default CustomerOrders;
