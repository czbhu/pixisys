import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Checkbox, message, Card, Select, Tag } from 'antd';
import { FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import EnhancedTable, { renderCustomerName } from '../../components/EnhancedTable';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Option } = Select;

type InvoiceStatus = 'all' | 'to_invoice' | 'invoiced';

interface InvoiceableOrder {
  id: number;
  order_number: string;
  customer_name: string;
  contact_names: string;
  is_private: boolean;
  order_date: string;
  invoice_number: string | null;
  net_total: number;
  company?: {
    id: number;
    name: string;
    tax_number: string;
    city?: string;
    postal_code?: string;
    address?: string;
  } | null;
  customer?: {
    id: number;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_number?: string;
  } | null;
  items: Array<{
    id: number;
    quantity: number;
    unit?: string;
    net_unit_price: number;
    discount_percent: number;
    vat_rate: number;
    product_name?: string;
    product_code?: string;
    material_name?: string;
    material_code?: string;
    manufacturing_product_name?: string;
    manufacturing_product_code?: string;
    service_name?: string;
    service_code?: string;
  }>;
}

const Invoicing: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<InvoiceableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('to_invoice');
  const [searchText, setSearchText] = useState('');

  const calculateNetTotal = (order: InvoiceableOrder): number => {
    return Number(order.net_total || 0);
  };

  useEffect(() => {
    fetchOrders(statusFilter);
  }, [statusFilter]);

  const fetchOrders = async (invoiceStatus: InvoiceStatus) => {
    try {
      setLoading(true);
      const response = await api.get('/sales/customer-orders/invoiceable/', {
        params: { invoice_status: invoiceStatus }
      });
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
        const companyName = order.company?.name || order.customer?.name || order.customer_name || 'Magánszemély';
        if (!groupedByCompany[companyName]) {
          groupedByCompany[companyName] = [];
        }
        groupedByCompany[companyName].push(order);
      });

      // For each company, prepare invoice data and open PixInvoice in new tab
      for (const [companyName, companyOrders] of Object.entries(groupedByCompany)) {
        const firstOrder = companyOrders[0];
        const company = firstOrder.company;
        const customer = firstOrder.customer;
        
        // Prepare customer data - use company if available, otherwise customer, otherwise leave empty
        let customerData: any = {};
        if (company) {
          // Company customer
          customerData = {
            name: company.name,
            tax_number: company.tax_number,
            city: company.city,
            postal_code: company.postal_code,
            address: company.address,
          };
        } else if (customer) {
          // Individual customer (magánszemély)
          customerData = {
            name: customer.name || customer.company || '',
            tax_number: customer.tax_number || '',
            city: '',  // Customer model doesn't have city/postal_code in separate fields
            postal_code: '',
            address: customer.address || '',
          };
        }
        // If neither company nor customer, customerData remains empty and invoice form will ask for it

        // Prepare invoice items
        const items: any[] = [];
        companyOrders.forEach(order => {
          order.items?.forEach((item: any) => {
            // Use the flattened fields from serializer
            const itemName = item.product_name || item.material_name || item.manufacturing_product_name || item.service_name || 'Tétel';
            const itemCode = item.product_code || item.material_code || item.manufacturing_product_code || item.service_code || '';
            
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
          customer: customerData,
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
      fetchOrders(statusFilter);
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
      sorter: (a, b) => (a.order_number || '').localeCompare(b.order_number || ''),
    },
    {
      title: 'Nettó összesen',
      key: 'net_total',
      sorter: (a, b) => calculateNetTotal(a) - calculateNetTotal(b),
      render: (_, record) => `${Math.round(calculateNetTotal(record)).toLocaleString('hu-HU')} Ft`,
    },
    {
      title: 'Ügyfél',
      key: 'customer_name',
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (_, record) => renderCustomerName(record),
    },
    {
      title: 'Dátum',
      dataIndex: 'order_date',
      key: 'order_date',
      sorter: (a, b) => (a.order_date || '').localeCompare(b.order_date || ''),
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

  const filteredOrders = useMemo(() => {
    if (!searchText?.trim()) return orders;
    return orders.filter((order) => deepSearchMatch(searchText, order));
  }, [orders, searchText]);

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Számlázás"
        extra={
          <div className="pixi-unified-card-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
        <EnhancedTable
          tableKey="invoicing"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Gyorskereső..."
          dataSource={filteredOrders}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          cardBreakpoint={800}
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
