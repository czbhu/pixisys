import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Table, Card, Button, Tag, Space, message, Modal, Tooltip, Input, Select, DatePicker, Switch, Dropdown, Popover, Grid, Form } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { PrinterOutlined, EyeOutlined, CheckOutlined, ToolOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, UnorderedListOutlined, RocketOutlined, FilterOutlined, DeleteOutlined, SyncOutlined, CloseOutlined, QuestionCircleOutlined, ExclamationCircleOutlined, FieldTimeOutlined, MailOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import dayjs from 'dayjs';
import { OrderItemsDrawer } from './OrderItemsDrawer';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useActionHistory } from '../../contexts/ActionHistoryContext';

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

  const CustomerOrders: React.FC = () => {
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();
  const { addAction } = useActionHistory();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  
  // Email sending state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm] = Form.useForm();
  const [emailTargetOrder, setEmailTargetOrder] = useState<CustomerOrder | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  
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

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const settings = {
        statusFilter,
        creatorFilter,
        isItemsView
    };
    localStorage.setItem('customerOrdersSettings', JSON.stringify(settings));
  }, [statusFilter, creatorFilter, isItemsView]);

  
  // Column visibility for Items View
  const [descriptionVisible, setDescriptionVisible] = useState(true); // "Leírás" (Product Desc)
  const [internalDescriptionVisible, setInternalDescriptionVisible] = useState(false); // "Belső leírás"
  const [noteVisible, setNoteVisible] = useState(true); // "Megjegyzés" (Item Note)

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.keys(statusMap).map(s => (
                <Button 
                    key={s} 
                    size="small" 
                    type={s === status ? 'primary' : 'text'}
                    disabled={s === status}
                    onClick={() => handleWorkflowStatusChange(record.id, s, record)}
                >
                    {statusMap[s].text}
                </Button>
            ))}
        </div>
    );

    return (
        <Space>
            <Popover content={content} title="Státusz váltás" trigger="click">
                <Tag color={color} style={{ cursor: 'pointer' }}>{text}</Tag>
            </Popover>
            {record.pending_approval && (
                <Tooltip title={`Jóváhagyásra vár: ${statusMap[record.pending_approval.requested_status]?.text || record.pending_approval.requested_status} (${record.pending_approval.requester})`}>
                    <QuestionCircleOutlined style={{ color: '#faad14' }} />
                </Tooltip>
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
    render: (status: string, record: any) => statusTag(status, record.originalOrder || record),
  };

  const actionsColumn = {
    title: 'Műveletek',
    key: 'actions',
    width: 160,
    fixed: (screens.md ? 'right' : undefined) as any,
    onCell: () => ({ style: { paddingRight: 0 } }),
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
      width: 120,
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
      width: 150,
      render: (text: string, record: CustomerOrder) => (
        <Button type="link" onClick={() => navigate(`/sales/customer-orders/${record.id}`)}>
          {text}
        </Button>
      ),
    },
    {
      title: 'Árajánlat',
      dataIndex: 'quote_request_title',
      key: 'quote_request_title',
      ellipsis: true,
      responsive: ['lg'] as any,
      render: (text: string, record: CustomerOrder) => (
        <Tooltip title={text}>
          {record.quote_request_id ? (
            <Button type="link" onClick={() => navigate(`/sales/rfqs/${record.quote_request_id}`)}>
              {text}
            </Button>
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
      ellipsis: true,
      width: 140,
      render: (text: string, record: CustomerOrder) => (
         <div>
             <div style={{fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '20ch'}}>
                 {text || 'Magánszemély'}
             </div>
             {record.contact_names && (
                 <div style={{fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '25ch'}} title={record.contact_names}>
                     {record.contact_names}
                 </div>
             )}
         </div>
      )
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
      width: 130,
      align: 'right',
      render: (amount: number) => {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('hu-HU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount) + ' Ft';
      },
    },
    statusColumn,
    actionsColumn as any,
  ];

  const itemsColumns: ColumnsType<any> = [
    {
      title: 'Dátum',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 120,
      render: (date: string, record: any) => (
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
      width: 150,
      render: (text: string, record: any) => (
        <Button type="link" onClick={() => navigate(`/sales/customer-orders/${record.originalOrder.id}`)}>
          {text}
        </Button>
      ),
    },
    {
        title: 'Tétel neve',
        key: 'name',
        ellipsis: true,
        render: (_: any, record: any) => {
            const name = record.product_name || 
                         record.manufacturing_product_name || 
                         record.material_name || 
                         record.service_name || 
                        '-';
            const code = record.product_code || 
                         record.material_code || 
                         record.service_code;
            
            return (
                <div>
                    <div style={{ fontWeight: 500 }}>{name}</div>
                    {code && <div style={{ fontSize: '11px', color: '#666' }}>{code}</div>}
                </div>
            );
        },
    },
    ...(descriptionVisible ? [{
        title: 'Leírás',
        dataIndex: 'product_description',
        key: 'product_description',
        width: 200,
        render: (t: string) => (
             <div title={t} style={{
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                fontSize: 12, color: '#555'
            }}>
                {t}
            </div>
        )
    }] : []),
    ...(internalDescriptionVisible ? [{
        title: 'Belső leírás',
        dataIndex: 'internal_description',
        key: 'internal_description',
        width: 200,
        render: (t: string) => (
             <div title={t} style={{
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                fontSize: 12, color: '#844'
            }}>
                {t}
            </div>
        )
    }] : []),
    ...(noteVisible ? [{
        title: 'Megjegyzés',
        dataIndex: 'description',
        key: 'description',
        responsive: ['md'] as any,
        width: 200,
        render: (t: string) => (
            <div title={t} style={{
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
            }}>
                {t}
            </div>
        )
    }] : []),
    {
        title: 'Beszállítók',
        dataIndex: 'supplier_name',
        key: 'supplier_name',
        ellipsis: true,
        responsive: ['lg'] as any,
    },
    {
      title: 'Ügyfél',
      dataIndex: 'customer_name',
      key: 'customer_name',
      ellipsis: true,
      width: 140,
      responsive: ['sm'] as any,
       render: (text: string, record: any) => (
         <div>
             <div style={{fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '20ch'}}>
                 {text || 'Magánszemély'}
             </div>
             {record.contact_names && (
                 <div style={{fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '25ch'}} title={record.contact_names}>
                     {record.contact_names}
                 </div>
             )}
         </div>
       )
    },
    {
      title: 'Határidő',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 110,
      responsive: ['sm'] as any,
      render: (date: string | null) => (date ? new Date(date).toLocaleDateString('hu-HU', {year:'numeric', month:'2-digit', day:'2-digit'}) : '-'),
    },
    {
      title: 'Nettó összeg',
      dataIndex: 'net_total', 
      key: 'net_total',
      width: 100,
      align: 'right',
      render: (amount: number) => {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('hu-HU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount) + ' Ft';
      },
    },
    statusColumn,
    {
      title: 'Műveletek',
      key: 'actions',
      width: 150,
      render: (_: any, record: any) => (
        <Space>
        <Tooltip title="Tétel munkalap">
          <Button
            icon={<PrinterOutlined />}
            size="small"
            onClick={async () => {
              try {
                // record is the flattened item. It has originalOrder and properties from items.
                // We need QuoteRequestItem ID for the backend.
                // record.quote_item.id if exists, else record.id might be CustomerOrderItem ID.
                // The backend currently expects QuoteRequestItem.id 
                // Let's rely on record.quote_item object if coming from CustomerOrderItemSerializer
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
        
        {/* <Dropdown
            menu={{
                items: [
                   { key: 'new', label: 'Új' },
                   { key: 'confirmed', label: 'Megerősítve' },
                   { key: 'in_production', label: 'Gyártásban' },
                   { key: 'ready', label: 'Kész' },
                   { key: 'in_delivery', label: 'Szállítás alatt' },
                   { key: 'delivered', label: 'Leszállítva' },
                ],
                onClick: (e) => handleItemStatusChange(record.id, e.key)
            }}
        >
            <Button size="small" icon={<SyncOutlined />} />
        </Dropdown> */}

        <Tooltip title="Munkaóra indítása">
            <Button 
                icon={<FieldTimeOutlined />} 
                size="small" 
                onClick={() => {
                    const orderId = record.originalOrder.id;
                    const itemId = record.id;
                    setPreselectedOrderId(orderId);
                    setPreselectedItemId(itemId);
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
    
    return orderMatchesSearch(order, debouncedSearchText);
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

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Megrendelések</span>
          <Input
            placeholder="Keresés..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: screens.md ? 360 : 240 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      }
      extra={
        <Space>
           <Switch 
              checkedChildren="Tételek" 
              unCheckedChildren="Megrendelések"
              checked={isItemsView}
              onChange={setIsItemsView} 
           />
           {isItemsView && (
            <Dropdown
              menu={{
                items: [
                   { key: 'desc', label: 'Leírás', icon: descriptionVisible ? <CheckOutlined /> : <CloseOutlined />, onClick: () => setDescriptionVisible(!descriptionVisible) },
                   { key: 'internal', label: 'Belső leírás', icon: internalDescriptionVisible ? <CheckOutlined /> : <CloseOutlined />, onClick: () => setInternalDescriptionVisible(!internalDescriptionVisible) },
                   { key: 'note', label: 'Megjegyzés', icon: noteVisible ? <CheckOutlined /> : <CloseOutlined />, onClick: () => setNoteVisible(!noteVisible) },
                ]
              }}
            >
                <Button icon={<EyeOutlined />}>Oszlopok</Button>
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
          <Select
            mode="multiple"
            style={{ minWidth: 200, maxWidth: 400 }}
            placeholder="Szűrés státuszra"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'new', label: 'Új' },
              { value: 'confirmed', label: 'Megerősítve' },
              { value: 'in_production', label: 'Gyártásban' },
              { value: 'ready', label: 'Kész' },
              { value: 'in_delivery', label: 'Szállítás alatt' },
              { value: 'delivered', label: 'Leszállítva (Számlázatlan)' },
              { value: 'invoiced', label: 'Kiszámlázva' },
              { value: 'cancelled', label: 'Törölve' },
            ]}
            maxTagCount="responsive"
          />
        </Space>
      }
    >
      <Table
        columns={isItemsView ? itemsColumns : columns}
        dataSource={isItemsView ? flattenedItems : filteredOrders}
        rowKey={isItemsView ? 'uniqueId' : 'id'}
        loading={loading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Összesen ${total} db`,
        }}
      />
      
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
