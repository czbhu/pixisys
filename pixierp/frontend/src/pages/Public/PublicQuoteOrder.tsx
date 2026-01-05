import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Spin, Alert, Typography, Descriptions, Button, message, Row, Col, Checkbox } from 'antd';
import { ShoppingCartOutlined, PrinterOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003/api/v1';

interface QuoteItem {
  id: number;
  item_type: string;
  description: string;
  quantity: number;
  unit: string;
  net_unit_price: number;
  vat_rate: number;
  discount_percent: number;
  net_total: number;
  gross_total: number;
  discounted_net_total: number;
  discounted_gross_total: number;
  product_name?: string;
  product_code?: string;
  material_name?: string;
  material_code?: string;
  service_name?: string;
  manufacturing_product_name?: string;
}

interface QuoteData {
  id: number;
  number: string;
  title: string;
  description: string;
  status: string;
  issue_date: string;
  customer: {
    name: string;
    tax_number: string;
    address: string;
    city: string;
    postal_code: string;
    country: string;
  } | null;
  supplier: {
    name: string;
    tax_number: string;
    eu_tax_number: string;
    address: string;
    phone: string;
    email: string;
    website: string;
  };
  items: QuoteItem[];
}

const PublicQuoteOrder: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteData | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/sales/quote-requests/public/${token}/order/`);
      setData(response.data);
      
      // Select all items by default
      const allItemIds = new Set<number>(response.data.items?.map((item: QuoteItem) => item.id) || []);
      setSelectedItems(allItemIds);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Hiba történt az adatok betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleItemToggle = (itemId: number, checked: boolean) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allItemIds = new Set(data?.items.map(item => item.id) || []);
      setSelectedItems(allItemIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleOrder = async () => {
    if (!data) return;
    
    const orderItems = data.items
      .filter(item => selectedItems.has(item.id))
      .map(item => ({
        item_id: item.id,
        quantity: item.quantity
      }));

    if (orderItems.length === 0) {
      message.warning('Válasszon ki legalább egy tételt megrendeléshez');
      return;
    }

    await submitOrder(orderItems);
  };

  const handlePrint = () => {
    window.print();
  };

  const submitOrder = async (orderItems: { item_id: number; quantity: number }[]) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE_URL}/sales/quote-requests/public/${token}/submit-order/`, {
        items: orderItems
      });
      message.success('Megrendelés sikeresen elküldve!');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Hiba történt a megrendelés küldésekor');
    } finally {
      setSubmitting(false);
    }
  };

  const getItemName = (item: QuoteItem) => {
    return item.product_name || item.material_name || item.service_name || 
           item.manufacturing_product_name || item.description || 'Megnevezés nélküli tétel';
  };

  const getItemCode = (item: QuoteItem) => {
    return item.product_code || item.material_code || '';
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message="Hiba" description={error} />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Check if any item has discount
  const hasDiscount = data.items.some(item => item.discount_percent > 0);

  // Calculate totals for selected items only
  const selectedItemsData = data.items.filter(item => selectedItems.has(item.id));
  const totalNet = selectedItemsData.reduce((sum, item) => {
    const netValue = item.discount_percent > 0 ? Number(item.discounted_net_total) : Number(item.net_total);
    return sum + (isNaN(netValue) ? 0 : netValue);
  }, 0);
  const totalGross = selectedItemsData.reduce((sum, item) => {
    const grossValue = item.discount_percent > 0 ? Number(item.discounted_gross_total) : Number(item.gross_total);
    return sum + (isNaN(grossValue) ? 0 : grossValue);
  }, 0);
  const totalVat = totalGross - totalNet;

  const allSelected = data.items.length > 0 && selectedItems.size === data.items.length;
  const indeterminate = selectedItems.size > 0 && selectedItems.size < data.items.length;

  const columns = [
    { 
      title: () => (
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="no-print"
        >
          Összes
        </Checkbox>
      ),
      dataIndex: 'selected', 
      key: 'selected',
      width: 100,
      className: 'no-print',
      render: (_: any, record: QuoteItem) => (
        <Checkbox
          checked={selectedItems.has(record.id)}
          onChange={(e) => handleItemToggle(record.id, e.target.checked)}
        />
      )
    },
    { 
      title: 'Cikkszám', 
      dataIndex: 'code', 
      key: 'code',
      width: 120,
      render: (_: any, record: QuoteItem) => getItemCode(record)
    },
    { 
      title: 'Megnevezés', 
      dataIndex: 'name', 
      key: 'name',
      render: (_: any, record: QuoteItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{getItemName(record)}</div>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </div>
      )
    },
    { 
      title: 'Mennyiség', 
      dataIndex: 'quantity', 
      key: 'quantity',
      width: 120,
      render: (qty: number, record: QuoteItem) => `${qty} ${record.unit || 'db'}`
    },
    { 
      title: 'Egységár (nettó)', 
      dataIndex: 'net_unit_price', 
      key: 'net_unit_price',
      width: 130,
      align: 'right' as const,
      render: (price: number) => `${price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft`
    },
    { 
      title: 'ÁFA', 
      dataIndex: 'vat_rate', 
      key: 'vat_rate',
      width: 80,
      align: 'center' as const,
      className: 'no-print',
      render: (rate: number) => `${rate}%`
    },
    ...(hasDiscount ? [{
      title: 'Kedvezmény',
      dataIndex: 'discount_percent',
      key: 'discount_percent',
      width: 100,
      align: 'center' as const,
      render: (discount: number) => discount ? `${discount}%` : '-'
    }] : []),
    { 
      title: 'Összesen (nettó)', 
      dataIndex: 'net_total', 
      key: 'net_total',
      width: 150,
      align: 'right' as const,
      render: (_: any, record: QuoteItem) => {
        const total = record.discount_percent > 0 ? record.discounted_net_total : record.net_total;
        return <strong>{total?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</strong>;
      }
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .print-only {
          display: none;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-content, .printable-content * {
            visibility: visible;
          }
          .printable-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: table-row !important;
          }
          .ant-table-cell:first-child {
            display: none !important;
          }
          .print-summary-row .ant-table-cell:first-child {
            display: none !important;
          }
          .unselected-row {
            display: none !important;
          }
          .ant-table-wrapper {
            overflow: visible !important;
          }
          .ant-table {
            overflow: visible !important;
          }
          .ant-table-content {
            overflow: visible !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>
      
      <Card className="printable-content">
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Title level={4}>Szállító</Title>
            <div>
              <strong>{data.supplier.name}</strong><br />
              Adószám: {data.supplier.tax_number}<br />
              {data.supplier.eu_tax_number && (
                <>EU adószám: {data.supplier.eu_tax_number}<br /></>
              )}
              {data.supplier.address}<br />
              {data.supplier.phone && (
                <>Tel: {data.supplier.phone}<br /></>
              )}
              {data.supplier.email && (
                <>E-mail: {data.supplier.email}<br /></>
              )}
              {data.supplier.website && (
                <>Web: {data.supplier.website}<br /></>
              )}
            </div>
          </Col>
          <Col span={12}>
            <Title level={4}>Megrendelő</Title>
            {data.customer ? (
              <div>
                <strong>{data.customer.name}</strong><br />
                {data.customer.tax_number && `Adószám: ${data.customer.tax_number}`}<br />
                {data.customer.postal_code} {data.customer.city}<br />
                {data.customer.address}<br />
                {data.customer.country}
              </div>
            ) : (
              <Text type="secondary">Nincs megadva</Text>
            )}
          </Col>
        </Row>

        <Title level={2}>Árajánlat</Title>
        <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="Árajánlat száma">{data.number}</Descriptions.Item>
          <Descriptions.Item label="Keltezés">{data.issue_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="Cím" span={2}>{data.title}</Descriptions.Item>
          {data.description && (
            <Descriptions.Item label="Leírás" span={2}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{data.description}</div>
            </Descriptions.Item>
          )}
        </Descriptions>
        
        <Paragraph type="secondary" className="no-print">
          Jelölje be a megrendelni kívánt tételeket, majd kattintson a megrendelés gombra.
        </Paragraph>

        <Table
          columns={columns}
          dataSource={data.items || []}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1200 }}
          style={{ marginBottom: 24 }}
          rowClassName={(record) => selectedItems.has(record.id) ? '' : 'unselected-row'}
          summary={() => (
            <Table.Summary>
              {/* Normal display - web */}
              <Table.Summary.Row className="no-print">
                <Table.Summary.Cell index={0} colSpan={hasDiscount ? 7 : 6} align="right">
                  <strong>Összesen Nettó:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong>{totalNet.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row className="no-print">
                <Table.Summary.Cell index={0} colSpan={hasDiscount ? 8 : 7} align="right">
                  <span style={{ fontSize: 12, color: '#666' }}>(nem tartalmazza az ÁFA-t)</span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              
              {/* Print display */}
              <Table.Summary.Row className="print-only print-summary-row">
                <Table.Summary.Cell index={0} />
                <Table.Summary.Cell index={1} colSpan={hasDiscount ? 6 : 5}>
                  <div style={{ textAlign: 'right', paddingRight: '8px' }}>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      Összesen Nettó: {totalNet.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      (nem tartalmazza az ÁFA-t)
                    </div>
                  </div>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />

        <Row gutter={16} justify="end" className="no-print">
          <Col>
            <Button 
              type="default" 
              size="large"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              Nyomtatás
            </Button>
          </Col>
          <Col>
            <Button 
              type="primary" 
              size="large"
              icon={<ShoppingCartOutlined />}
              onClick={handleOrder}
              loading={submitting}
              disabled={selectedItems.size === 0}
            >
              Megrendelés ({selectedItems.size} tétel)
            </Button>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default PublicQuoteOrder;
