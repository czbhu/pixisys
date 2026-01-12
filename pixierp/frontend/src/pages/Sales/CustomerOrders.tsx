import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, message, Modal, Tooltip, Input, Select, DatePicker } from 'antd';
import { PrinterOutlined, EyeOutlined, CheckOutlined, ToolOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import dayjs from 'dayjs';

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
}

const CustomerOrders: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timestampModalOpen, setTimestampModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<dayjs.Dayjs | null>(null);
  const [timestampAction, setTimestampAction] = useState<string>('');
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

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

  const statusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      new: { color: 'blue', text: 'Új' },
      confirmed: { color: 'cyan', text: 'Megerősítve' },
      in_production: { color: 'orange', text: 'Gyártásban' },
      ready: { color: 'green', text: 'Kész' },
      in_delivery: { color: 'purple', text: 'Szállítás alatt' },
      delivered: { color: 'success', text: 'Kiszállítva' },
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

  const columns: ColumnsType<CustomerOrder> = [
    {
      title: 'Dátum',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
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
      render: (text: string) => text || 'Magánszemély',
    },
    {
      title: 'Kapcsolattartók',
      dataIndex: 'contact_names',
      key: 'contact_names',
      ellipsis: true,
      width: 150,
    },
    {
      title: 'Határidő',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 110,
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
      title: 'Összeg',
      dataIndex: 'total_amount',
      key: 'total_amount',
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
    {
      title: 'Státusz',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => statusTag(status),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 400,
      fixed: 'right',
      render: (_: any, record: CustomerOrder) => (
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
          
          {['confirmed', 'in_production'].includes(record.status) && (
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
              >
                Munkalap
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
                  setSelectedOrder(record);
                  setDeliveryModalOpen(true);
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
      ),
    },
  ];

  const filteredOrders = orders.filter((order) => {
    // Status filter
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    
    // Text search
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(search) ||
      order.quote_request_title?.toLowerCase().includes(search) ||
      order.customer_name?.toLowerCase().includes(search)
    );
  });

  return (
    <Card
      title="Megrendelések"
      extra={
        <Space>
          <Select
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'Összes státusz' },
              { value: 'new', label: 'Új' },
              { value: 'confirmed', label: 'Megerősítve' },
              { value: 'in_production', label: 'Gyártásban' },
              { value: 'ready', label: 'Kész' },
              { value: 'in_delivery', label: 'Szállítás alatt' },
              { value: 'delivered', label: 'Kiszállítva' },
              { value: 'cancelled', label: 'Törölve' },
            ]}
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
        columns={columns}
        dataSource={filteredOrders}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Összesen ${total} megrendelés`,
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
    </Card>
  );
};

export default CustomerOrders;
