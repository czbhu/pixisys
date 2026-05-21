import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Checkbox, message, Card, Select, Tag, Modal, Form, Input, Space, Statistic } from 'antd';
import { FileTextOutlined, EyeOutlined, DollarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import EnhancedTable, { renderCustomerName } from '../../components/EnhancedTable';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Option } = Select;

const stripHtml = (s: string | undefined | null): string => {
  if (!s) return '';
  if (typeof document !== 'undefined') {
    try { const d = document.createElement('div'); d.innerHTML = s; return d.textContent || d.innerText || ''; } catch {}
  }
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

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
    description?: string;
  }>;
}

const Invoicing: React.FC = () => {
  const [orders, setOrders] = useState<InvoiceableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('to_invoice');
  const [searchText, setSearchText] = useState('');

  // ── Handover (Átadás) ─────────────────────────────────────────────────
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverForm] = Form.useForm();
  const [cashRegisters, setCashRegisters] = useState<any[]>([]);

  const calculateNetTotal = (order: InvoiceableOrder): number => {
    return Number(order.net_total || 0);
  };

  const selectedNetTotal = useMemo(() => {
    return orders
      .filter(o => selectedRowKeys.includes(o.id))
      .reduce((sum, o) => sum + calculateNetTotal(o), 0);
  }, [orders, selectedRowKeys]);

  const selectedAreAllUninvoiced = useMemo(() => {
    if (selectedRowKeys.length === 0) return false;
    return orders
      .filter(o => selectedRowKeys.includes(o.id))
      .every(o => !o.invoice_number);
  }, [orders, selectedRowKeys]);
  const openHandover = async () => {
    try {
      const [serialRes, regsRes] = await Promise.all([
        api.get('/sales/customer-orders/handover_serial_suggest/'),
        api.get('/finance/cash-registers/?can_deposit_for_me=1'),
      ]);
      setCashRegisters(regsRes.data?.results || regsRes.data || []);
      handoverForm.setFieldsValue({
        serial: serialRes.data?.serial || '',
        cash_register: undefined,
        note: '',
      });
      setHandoverOpen(true);
    } catch (e: any) {
      message.error('Nem sikerült megnyitni az átadás ablakot: ' + (e?.response?.data?.error || e.message));
    }
  };

  const submitHandover = async () => {
    try {
      const values = await handoverForm.validateFields();
      setHandoverLoading(true);
      const res = await api.post('/sales/customer-orders/handover/', {
        order_ids: selectedRowKeys,
        serial: values.serial,
        cash_register: values.cash_register,
        note: values.note || '',
      });
      message.success(`Átadás rögzítve: ${res.data?.serial}`);
      setHandoverOpen(false);
      setSelectedRowKeys([]);
      fetchOrders(statusFilter);
    } catch (e: any) {
      if (e?.errorFields) return; // form validation
      message.error('Átadás sikertelen: ' + (e?.response?.data?.error || e.message));
    } finally {
      setHandoverLoading(false);
    }
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
        const PixInvoiceUrl = process.env.REACT_APP_PIXINVOICE_URL || 'https://i.pixisys.eu';
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
      title: '',
      key: 'select',
      width: 100,
      render: (_, record, index) => (
        <Checkbox
          checked={selectedRowKeys.includes(record.id)}
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
      title: 'Darabszám',
      key: 'quantities',
      width: 90,
      render: (_, record) => (
        <div>
          {record.items?.map((item, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: '18px', textAlign: 'right' }}>
              {parseFloat(String(item.quantity))} {item.unit || 'db'}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Nettó egységár',
      key: 'unit_prices',
      width: 120,
      render: (_, record) => (
        <div>
          {record.items?.map((item, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: '18px', textAlign: 'right' }}>
              {Math.round(parseFloat(String(item.net_unit_price))).toLocaleString('hu-HU')} Ft
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Leírás',
      key: 'descriptions',
      render: (_, record) => (
        <div>
          {record.items?.map((item, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: '18px', color: '#666' }}>
              {stripHtml(item.description) || '-'}
            </div>
          ))}
        </div>
      ),
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
      render: (invoiceNumber: string | null, record) => (
        <input
          type="text"
          defaultValue={invoiceNumber || ''}
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px', backgroundColor: invoiceNumber ? '#f6ffed' : '#fff', cursor: 'text' }}
          placeholder="Számla szám..."
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const newVal = e.target.value.trim();
            if (newVal !== (invoiceNumber || '')) {
              updateInvoiceNumber(record.id, newVal);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
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
            window.open(`/sales/customer-orders/${record.id}?popup=1`, '_blank');
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
          <div className="pixi-unified-card-actions" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedRowKeys.length > 0 && (
              <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px' }}>
                Kijelölve: <b>{selectedRowKeys.length}</b> &nbsp;|&nbsp; Nettó összesen:{' '}
                <b>{selectedNetTotal.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} Ft</b>
              </Tag>
            )}
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
              disabled={!selectedAreAllUninvoiced}
            >
              Számlázás ({selectedRowKeys.length})
            </Button>
            <Button
              type="default"
              icon={<DollarOutlined />}
              onClick={openHandover}
              disabled={selectedRowKeys.length === 0}
            >
              Átadás ({selectedRowKeys.length})
            </Button>
          </div>
        }
      >
        <EnhancedTable
          tableKey="invoicing_v2"
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
              cursor: 'pointer',
              opacity: record.invoice_number ? 0.85 : 1,
            },
          })}
        />
      </Card>

      <Modal
        title="Átadás"
        open={handoverOpen}
        onCancel={() => setHandoverOpen(false)}
        onOk={submitHandover}
        confirmLoading={handoverLoading}
        okText="Átadás rögzítése"
        cancelText="Mégse"
        width={520}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Statistic
            title="Átadandó nettó összeg"
            value={selectedNetTotal}
            suffix="Ft"
            precision={0}
            groupSeparator=" "
          />
          <div style={{ color: '#666', fontSize: 12 }}>
            {selectedRowKeys.length} megrendelés kerül átadásra. Az összeg a kiválasztott
            kasszába betétként kerül, a sorszám a számla mező mellé jegyzésre kerül.
          </div>
          <Form form={handoverForm} layout="vertical">
            <Form.Item
              name="serial"
              label="Sorszám"
              rules={[{ required: true, message: 'Sorszám kötelező' }]}
            >
              <Input placeholder="username20260101_00" />
            </Form.Item>
            <Form.Item
              name="cash_register"
              label="Kassza"
              rules={[{ required: true, message: 'Válassz kasszát' }]}
            >
              <Select
                placeholder="Válassz kasszát…"
                options={cashRegisters.map((r: any) => ({ value: r.id, label: r.name }))}
                notFoundContent="Nincs olyan kassza, amibe betehetsz"
              />
            </Form.Item>
            <Form.Item name="note" label="Megjegyzés (opcionális)">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </div>
  );
};

export default Invoicing;
