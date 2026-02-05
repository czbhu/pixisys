import React, { useState, useEffect } from 'react';
import { Table, Button, Checkbox, message, Card, Select, Tag } from 'antd';
import { FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

type InvoiceStatus = 'all' | 'to_invoice' | 'invoiced';

interface InvoiceableOrder {
  id: number;
  order_number: string;
  customer_name: string;
  contact_names: string;
  order_date: string;
  invoice_number: string | null;
  quote_request: {
    company: {
      id: number;
      name: string;
      tax_number: string;
      city?: string;
      postal_code?: string;
      address?: string;
    };
  };
  items: Array<{
    id: number;
    quantity: number;
    net_unit_price: number;
    discount_percent: number;
    vat_rate: number;
    quote_item?: {
      product?: { name: string };
      material?: { name: string };
      service?: { name: string };
    };
  }>;
}

const Invoicing: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<InvoiceableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('to_invoice');

  const calculateNetTotal = (order: InvoiceableOrder): number => {
    let total = 0;
    order.items.forEach(item => {
      const net = item.quantity * item.net_unit_price;
      const discount = net * (item.discount_percent / 100);
      total += net - discount;
    });
    return total;
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/sales/customer-orders/invoiceable/');
      setOrders(response.data);
    } catch (error: any) {
      message.error('Hiba a megrendelések betöltése során');
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (record: InvoiceableOrder, index: number, event: React.MouseEvent) => {
    // Don't allow selection of invoiced orders
    if (record.invoice_number) {
      return;
    }
    
    const recordId = record.id;
    
    if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift + click: select/deselect range based on current row state
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeKeys: number[] = [];
      
      for (let i = start; i <= end; i++) {
        rangeKeys.push(orders[i].id);
      }
      
      // If current row is selected, deselect the range; otherwise select it
      const shouldSelect = !selectedRowKeys.includes(recordId);
      
      setSelectedRowKeys(prevKeys => {
        if (shouldSelect) {
          // Add range to selection
          const newKeys = new Set([...prevKeys, ...rangeKeys]);
          return Array.from(newKeys);
        } else {
          // Remove range from selection
          return prevKeys.filter(key => !rangeKeys.includes(key));
        }
      });
    } else {
      // Normal click: toggle single
      if (selectedRowKeys.includes(recordId)) {
        setSelectedRowKeys(selectedRowKeys.filter(key => key !== recordId));
      } else {
        setSelectedRowKeys([...selectedRowKeys, recordId]);
      }
      setLastSelectedIndex(index);
    }
  };

  const handleInvoice = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Válasszon ki legalább egy megrendelést számlázásra');
      return;
    }

    try {
      // Get selected orders
      const selectedOrders = orders.filter(o => selectedRowKeys.includes(o.id));
      
      // Group by company
      const groupedByCompany: { [key: string]: typeof selectedOrders } = {};
      selectedOrders.forEach(order => {
        const companyName = order.quote_request?.company?.name || 'Magánszemély';
        if (!groupedByCompany[companyName]) {
          groupedByCompany[companyName] = [];
        }
        groupedByCompany[companyName].push(order);
      });

      // For each company, prepare invoice data and open PixInvoice in new tab
      for (const [companyName, companyOrders] of Object.entries(groupedByCompany)) {
        const firstOrder = companyOrders[0];
        const company = firstOrder.quote_request?.company;
        
        if (!company) {
          message.warning(`Nincs cég hozzárendelve a megrendeléshez: ${firstOrder.order_number}`);
          continue;
        }

        // Prepare invoice items
        const items: any[] = [];
        companyOrders.forEach(order => {
          order.items?.forEach((item: any) => {
            // Use the flattened fields from serializer
            const itemName = item.product_name || item.material_name || item.manufacturing_product_name || item.service_name || 'Tétel';
            const itemCode = item.product_code || item.material_code || '';
            
            console.log('[INVOICE] Item:', {
              name: itemName,
              code: itemCode,
              item: item
            });
            
            items.push({
              description: itemName,
              product_code_value: itemCode,
              quantity: parseFloat(item.quantity),
              unit_price: parseFloat(item.net_unit_price),
              vat_rate: parseFloat(item.vat_rate),
              unit_of_measure: item.unit || 'db',
            });
          });
        });
        
        console.log('[INVOICE] Final items array:', items);

        // Prepare invoice data for PixInvoice
        const invoiceData = {
          customer: {
            name: company.name,
            tax_number: company.tax_number,
            city: company.city,
            postal_code: company.postal_code,
            address: company.address,
          },
          items: items,
          notes: `ERP megrendelések: ${companyOrders.map(o => o.order_number).join(', ')}`,
          erp_order_ids: companyOrders.map(o => o.id), // Send order IDs for callback
        };

        // Encode data as base64 to pass in URL (sessionStorage doesn't work across different origins)
        const encodedData = btoa(encodeURIComponent(JSON.stringify(invoiceData)));

        // Open PixInvoice in new tab with data in URL parameter
        const PixInvoiceUrl = process.env.REACT_APP_PIXINVOICE_URL || 'https://inv.pixisys.eu';
        const pixinvoiceUrl = `${PixInvoiceUrl}/invoices/new?erp_data=${encodedData}`;
        window.open(pixinvoiceUrl, '_blank');
        
        message.success(`Számla előkészítve: ${companyName}`);
      }

      // Clear selection
      setSelectedRowKeys([]);
      
    } catch (error: any) {
      message.error('Hiba történt a számlázás előkészítése során: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateInvoiceNumber = async (orderId: number, invoiceNumber: string) => {
    try {
      await api.patch(
        `/sales/customer-orders/${orderId}/update_invoice_number/`,
        { invoice_number: invoiceNumber }
      );
      message.success('Számla szám frissítve');
      fetchOrders();
    } catch (error: any) {
      message.error('Hiba a számla szám frissítése során');
    }
  };

  const columns: ColumnsType<InvoiceableOrder> = [
    {
      title: 'Státusz',
      key: 'status',
      width: 100,
      render: (_, record) => (
        record.invoice_number ? (
          <Tag color="green">Számlázott</Tag>
        ) : (
          <Tag color="orange">Számlázandó</Tag>
        )
      ),
    },
    {
      title: 'Számlázandó',
      key: 'select',
      width: 100,
      render: (_, record, index) => (
        <Checkbox
          checked={selectedRowKeys.includes(record.id)}
          disabled={!!record.invoice_number}
          onChange={(e) => {
            e.stopPropagation();
            handleRowClick(record, index, e.nativeEvent as any);
          }}
        />
      ),
    },
    {
      title: 'Megrendelés szám',
      dataIndex: 'order_number',
      key: 'order_number',
    },
    {
      title: 'Nettó összesen',
      key: 'net_total',
      render: (_, record) => `${Math.round(calculateNetTotal(record)).toLocaleString('hu-HU')} Ft`,
    },
    {
      title: 'Ügyfél',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text: string) => text || 'Magánszemély',
    },
    {
      title: 'Kapcsolattartó',
      dataIndex: 'contact_names',
      key: 'contact_names',
    },
    {
      title: 'Dátum',
      dataIndex: 'order_date',
      key: 'order_date',
      render: (date: string) => new Date(date).toLocaleDateString('hu-HU'),
    },
    {
      title: 'Számla szám',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      render: (invoiceNumber: string | null) => (
        <input
          type="text"
          value={invoiceNumber || ''}
          disabled
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px', backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
          placeholder="-"
        />
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Button
          icon={<EyeOutlined />}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/sales/customer-orders/${record.id}`);
          }}
        >
          Megtekintés
        </Button>
      ),
    },
  ];

  // Filter orders based on status
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'invoiced') return !!order.invoice_number;
    if (statusFilter === 'to_invoice') return !order.invoice_number;
    return true;
  });

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Számlázás"
        extra={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Select
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setSelectedRowKeys([]); // Clear selection when filter changes
              }}
              style={{ width: 150 }}
            >
              <Option value="to_invoice">Számlázandó</Option>
              <Option value="invoiced">Számlázott</Option>
              <Option value="all">Mind</Option>
            </Select>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={handleInvoice}
              disabled={selectedRowKeys.length === 0}
            >
              Számlázás ({selectedRowKeys.length})
            </Button>
          </div>
        }
      >
        <Table
          dataSource={filteredOrders}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20 }}
          onRow={(record, index) => ({
            onClick: (event) => handleRowClick(record, index!, event),
            style: { 
              cursor: record.invoice_number ? 'default' : 'pointer',
              opacity: record.invoice_number ? 0.7 : 1,
            },
          })}
        />
      </Card>
    </div>
  );
};

export default Invoicing;
