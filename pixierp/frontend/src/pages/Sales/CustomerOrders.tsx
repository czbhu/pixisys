import React, { useState, useEffect, useMemo } from 'react';
import { Table, Card, Button, Tag, Space, message, Modal, Tooltip, Input, Select, DatePicker, Switch, Dropdown } from 'antd';
import { PrinterOutlined, EyeOutlined, CheckOutlined, ToolOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, UnorderedListOutlined, RocketOutlined, FilterOutlined, DeleteOutlined, SyncOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import dayjs from 'dayjs';
import { OrderItemsDrawer } from './OrderItemsDrawer';

const { Search } = Input;

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
}

const CustomerOrders: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  // Default filter: show everything EXCEPT cancelled and invoiced/delivered (archived)
  const [statusFilter, setStatusFilter] = useState<string[]>(['new', 'confirmed', 'in_production']);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const [timestampModalOpen, setTimestampModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<dayjs.Dayjs | null>(null);
  const [timestampAction, setTimestampAction] = useState<string>('');
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [itemsDrawerOpen, setItemsDrawerOpen] = useState(false);
  const [drawerOrder, setDrawerOrder] = useState<{id: number, number: string} | null>(null);
  const [isItemsView, setIsItemsView] = useState(false);
  
  // Column visibility for Items View
  const [descriptionVisible, setDescriptionVisible] = useState(true); // "Leírás" (Product Desc)
  const [internalDescriptionVisible, setInternalDescriptionVisible] = useState(false); // "Belső leírás"
  const [noteVisible, setNoteVisible] = useState(true); // "Megjegyzés" (Item Note)

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/sales/customer-orders/');
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
  }, []);

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
    return <Tag color={color}>{text}</Tag>;
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
    width: 400,
    fixed: 'right' as const,
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
          
          {record.status === 'new' && (
            <Tooltip title="Jóváhagyás">
              <Button
                type="primary"
                icon={<CheckOutlined />}
                size="small"
                onClick={() => handleStatusChange(record.id, 'confirm', 'Jóváhagyás')}
              >
                Jóváhagyás
              </Button>
            </Tooltip>
          )}
          
          {record.status === 'confirmed' && (
            <Tooltip title="Gyártás indítása">
              <Button
                type="primary"
                icon={<RocketOutlined />}
                size="small"
                onClick={() => handleStatusChange(record.id, 'start_production', 'Gyártás indítása')}
              >
                Gyártás
              </Button>
            </Tooltip>
          )}

          {record.status === 'in_production' && (
            <Tooltip title="Készre jelentés">
              <Button
                type="primary"
                icon={<ToolOutlined />}
                size="small"
                onClick={() => {
                  setSelectedOrder(record);
                  setTimestampAction('mark_ready');
                  setSelectedTimestamp(dayjs());
                  setTimestampModalOpen(true);
                }}
              >
                Készre
              </Button>
            </Tooltip>
          )}
          
          {(record.status === 'ready' || record.status === 'in_delivery') && (
            <Tooltip title={record.status === 'ready' ? "Szállítás indítása" : "Szállítási email újraküldése"}>
              <Button
                type="primary"
                icon={<CarOutlined />}
                size="small"
                onClick={() => {
                  window.open(`/sales/delivery-notes?create_from_order=${record.id}`, '_blank');
                }}
              >
                Szállítás
              </Button>
            </Tooltip>
          )}
          
          {record.status === 'in_delivery' && (
            <Tooltip title="Leszállítva">
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="small"
                onClick={() => {
                  setSelectedOrder(record);
                  setTimestampAction('mark_delivered');
                  setSelectedTimestamp(dayjs());
                  setTimestampModalOpen(true);
                }}
              >
                Leszállítva
              </Button>
            </Tooltip>
          )}

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
      responsive: ['sm'] as any,
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
                const qriId = record.quote_item ? record.quote_item.id : record.id;
                
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
        
        <Dropdown
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
        </Dropdown>

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
    
    // Text search
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(search) ||
      order.quote_request_title?.toLowerCase().includes(search) ||
      order.customer_name?.toLowerCase().includes(search) ||
      (order.created_by_name || '').toLowerCase().includes(search)
    );
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
      title="Megrendelések"
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
          <Search
            placeholder="Keresés..."
            allowClear
            style={{ width: 250 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
      }
    >
      <Table
        columns={isItemsView ? itemsColumns : columns}
        dataSource={isItemsView ? flattenedItems : filteredOrders}
        rowKey={isItemsView ? 'uniqueId' : 'id'}
        loading={loading}
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
    </Card>
  );
};

export default CustomerOrders;
