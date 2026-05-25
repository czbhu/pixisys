import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Table, Button, Checkbox, Space, Tooltip, Tag, message, Select } from 'antd';
import { PrinterOutlined, MailOutlined, AppstoreOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import api from '../../services/api';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';

interface OrderItemsDrawerProps {
  open: boolean;
  onClose: () => void;
  orderId: number | null;
  orderNumber?: string;
  onOrderUpdate?: () => void;
}

interface DetailedItem {
  id: number;
  parent_id: number | null;
  sort_order: number;
  name: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  net_unit_price: number;
  net_total: number;
  supplier_name: string | null;
  department_name: string | null;
  is_internal: boolean;
  item_type: string;
  status?: string;
  order_item_id?: number;
  manufacturing_product_id?: number | null;
  children?: DetailedItem[];
}

export const OrderItemsDrawer: React.FC<OrderItemsDrawerProps> = ({ open, onClose, orderId, orderNumber, onOrderUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DetailedItem[]>([]);
  const [showPrices, setShowPrices] = useState(false);

  useEffect(() => {
    if (open && orderId) {
      fetchItems();
    }
  }, [open, orderId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await salesService.getCustomerOrderDetailedItems(orderId!);
      setItems(data);
    } catch (e) {
      console.error(e);
      message.error('Hiba a tételek betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintWorksheet = async (item: DetailedItem) => {
    try {
        if (!orderId) return;
        const response = await salesService.getItemWorkSheet(orderId, item.id);
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        window.open(url, '_blank');
    } catch (e) {
        message.error('Hiba a munkalap generálásakor');
    }
  };

  const handleSend = async (item: DetailedItem) => {
     // Stub for sending email
     message.info(`Email küldése folyamatban: ${item.supplier_name || item.department_name || 'Ismeretlen címzett'}`);
  };

  const handleStatusChange = async (itemId: number, newStatus: string) => {
      try {
          await api.patch(`/sales/customer-order-items/${itemId}/`, { status: newStatus });
          message.success('Státusz frissítve');
          fetchItems();
          if (onOrderUpdate) onOrderUpdate();
      } catch(e) {
          message.error('Hiba a státusz módosításakor');
      }
  };

  const statusOptions = [
    { value: 'new', label: 'Új', color: 'blue' },
    { value: 'confirmed', label: 'Megerősítve', color: 'cyan' },
    { value: 'in_production', label: 'Gyártásban', color: 'orange' },
    { value: 'ready', label: 'Kész', color: 'green' },
    { value: 'in_delivery', label: 'Száll. alatt', color: 'purple' },
    { value: 'delivered', label: 'Kiszállítva', color: 'success' },
  ];

  const columns: any[] = [
    {
        title: 'Megnevezés',
        key: 'name',
        render: (text: any, record: DetailedItem) => (
            <div>
                <div style={{ fontWeight: 500 }}>{record.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>{record.code}</div>
            </div>
        )
    },
    {
        title: 'Státusz',
        key: 'status',
        width: 150,
        render: (_: any, record: DetailedItem) => {
             if (!record.order_item_id) return <Tag>N/A</Tag>;
             return (
                 <Select 
                    size="small" 
                    value={record.status || 'new'} 
                    style={{ width: 140 }}
                    onChange={(val) => handleStatusChange(record.order_item_id!, val)}
                    onClick={(e) => e.stopPropagation()}
                 >
                    {statusOptions.map(o => (
                        <Select.Option key={o.value} value={o.value}>
                            <Tag color={o.color}>{o.label}</Tag>
                        </Select.Option>
                    ))}
                 </Select>
             )
        }
    },
    {
        title: 'Beszállító / Részleg',
        key: 'supplier',
        render: (text: any, record: DetailedItem) => {
            if (record.department_name) {
                return <Tag color="blue">{record.department_name}</Tag>;
            }
            if (record.supplier_name) {
                return <Tag color="orange">{record.supplier_name}</Tag>;
            }
            return '-';
        }
    },
    {
        title: 'Menny.',
        key: 'quantity',
        width: 100,
        render: (r: DetailedItem) => `${r.quantity} ${r.unit}`
    },
    {
        title: 'Leírás',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true
    },
  ];

  if (showPrices) {
    columns.push({
        title: 'Nettó ár',
        key: 'net_unit_price',
        align: 'right',
        render: (r: DetailedItem) => `${Math.round(r.net_unit_price)} Ft`
    });
    columns.push({
        title: 'Nettó össz.',
        key: 'net_total',
        align: 'right',
        render: (r: DetailedItem) => <strong>{Math.round(r.net_total)} Ft</strong>
    });
  }

  columns.push({
      title: 'Műveletek',
      key: 'actions',
      width: 160,
      render: (_: any, record: DetailedItem) => (
          <Space>
              <Tooltip title="Munkalap nyomtatása">
                  <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintWorksheet(record)} />
              </Tooltip>
              <Tooltip title="Kiküldés (Email)">
                  <Button size="small" icon={<MailOutlined />} onClick={() => handleSend(record)} />
              </Tooltip>
              {record.manufacturing_product_id && orderId && (
                  <Tooltip title="Altételek (új lapon)">
                      <Button
                          size="small"
                          icon={<AppstoreOutlined />}
                          onClick={() => window.open(`/sales/customer-orders/${orderId}/items/${record.id}/subitems`, '_blank', 'noopener,noreferrer')}
                      />
                  </Tooltip>
              )}
          </Space>
      )
  });

      const expandedRowRender = (record: DetailedItem) => {
        if (!record.manufacturing_product_id || !orderId) return null;
        return (
          <div style={{ padding: '8px 0 8px 32px' }}>
            <ProductSubItemsTable productId={record.manufacturing_product_id} />
            <div style={{ marginTop: 8 }}>
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => window.open(`/sales/customer-orders/${orderId}/items/${record.id}/subitems`, '_blank', 'noopener,noreferrer')}
              >
                Megnyitás teljes lapon
              </Button>
            </div>
          </div>
        );
      };

  return (
    <Drawer
      title={`Megrendelés tételek: ${orderNumber || ''}`}
      width={900}
      open={open}
      onClose={onClose}
      extra={
        <Checkbox checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)}>
            Ármegjelenítés
        </Checkbox>
      }
    >
      <Table
        loading={loading}
        columns={columns}
        dataSource={items}
        rowKey="id"
        pagination={false}
        expandable={{
            expandedRowRender,
            rowExpandable: (record: DetailedItem) => !!record.manufacturing_product_id,
        }}
      />
    </Drawer>
  );
};
