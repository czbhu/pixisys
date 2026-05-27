import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Card, Table, Spin, Alert, Typography, Descriptions, Button, message, Row, Col,
  Checkbox, DatePicker, Upload, Input, List, Popconfirm, Tag, Progress,
} from 'antd';
import {
  ShoppingCartOutlined, PrinterOutlined,
  DeleteOutlined, PaperClipOutlined, InboxOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

interface AttachmentItem {
  id: number;
  original_filename: string;
  remark: string;
  created_at: string;
}

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
  manufacturing_product_code?: string;
  product_description?: string;
  is_ordered?: boolean;
  ordered_at?: string | null;
  item_status?: string;
  attachments?: AttachmentItem[];
}

interface QuoteData {
  id: number;
  number: string;
  title: string;
  description: string;
  status: string;
  issue_date: string;
  partial_order_allowed: boolean;
  currency_code?: string;
  currency_symbol?: string;
  valid_until?: string | null;
  is_expired?: boolean;
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

// Per-item upload zone component
interface ItemUploadZoneProps {
  token: string;
  item: QuoteItem;
}

const ItemUploadZone: React.FC<ItemUploadZoneProps> = ({ token, item }) => {
  const [attachments, setAttachments] = useState<AttachmentItem[]>(item.attachments || []);
  const [remark, setRemark] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      message.error('A fájl mérete nem haladhatja meg a 20 MB-ot');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('remark', remark);
    setUploading(true);
    setProgress(0);
    try {
      const r = await axios.post(
        `${API_BASE_URL}/sales/quote-requests/public/${token}/items/${item.id}/attachments/upload/`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        }
      );
      setAttachments(prev => [...prev, r.data]);
      message.success(`„${file.name}" feltöltve`);
      setRemark('');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Feltöltés sikertelen');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDelete = async (att: AttachmentItem) => {
    try {
      await axios.delete(
        `${API_BASE_URL}/sales/quote-requests/public/${token}/items/${item.id}/attachments/${att.id}/delete/`
      );
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      message.success('Csatolmány törölve');
    } catch {
      message.error('Törlés sikertelen');
    }
  };

  const isLocked = item.item_status === 'ordered' || item.item_status === 'archived' || item.is_ordered;

  return (
    <div style={{ padding: '8px 16px 16px', background: '#fafafa', borderRadius: 6 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        <PaperClipOutlined style={{ marginRight: 6, color: '#1677ff' }} />
        Csatolmányok ehhez a tételhez
      </Text>

      {isLocked && (
        <Alert
          type="warning"
          showIcon
          message="Ez a tétel már meg van rendelve, ezért új csatolmány nem tölthető fel."
          style={{ marginBottom: 8 }}
        />
      )}

      {!isLocked && <TextArea
        placeholder="Megjegyzés a feltöltendő fájl(ok)hoz (nem kötelező)"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        autoSize={{ minRows: 1, maxRows: 3 }}
        maxLength={255}
        style={{ marginBottom: 8 }}
      />}

      {!isLocked && <Dragger
        multiple
        showUploadList={false}
        beforeUpload={(file) => { uploadFile(file as File); return false; }}
        disabled={uploading}
        style={{ marginBottom: uploading ? 8 : 12 }}
      >
        <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
          <InboxOutlined style={{ fontSize: 24 }} />
        </p>
        <p className="ant-upload-text" style={{ fontSize: 13 }}>
          Húzza ide a fájlokat, vagy kattintson a tallózáshoz
        </p>
        <p className="ant-upload-hint" style={{ fontSize: 11 }}>
          Max. 20 MB / fájl – PDF, Word, Excel, kép, CSV, ZIP
        </p>
      </Dragger>}

      {uploading && (
        <Progress percent={progress} status="active" size="small" style={{ marginBottom: 8 }} />
      )}

      {attachments.length > 0 && (
        <List
          size="small"
          bordered
          dataSource={attachments}
          renderItem={(att) => (
            <List.Item
              actions={[
                <Popconfirm
                  title="Biztosan törli ezt a fájlt?"
                  onConfirm={() => handleDelete(att)}
                  okText="Törlés"
                  cancelText="Mégse"
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                avatar={<PaperClipOutlined style={{ color: '#1677ff' }} />}
                title={<Text style={{ fontSize: 13 }}>{att.original_filename}</Text>}
                description={
                  att.remark
                    ? <Text type="secondary" style={{ fontSize: 11 }}>{att.remark}</Text>
                    : undefined
                }
              />
              <Tag color="default" style={{ fontSize: 11, marginLeft: 8 }}>
                {new Date(att.created_at).toLocaleString('hu-HU')}
              </Tag>
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

// Main component
const PublicQuoteOrder: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const extraTokens = searchParams.get('extra_tokens') || '';
  const itemIdsParam = searchParams.get('item_ids') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteData | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [desiredDate, setDesiredDate] = useState<Dayjs | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, [token, extraTokens, itemIdsParam]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: string[] = [];
      if (extraTokens) params.push(`extra_tokens=${encodeURIComponent(extraTokens)}`);
      if (itemIdsParam) params.push(`item_ids=${encodeURIComponent(itemIdsParam)}`);
      const qs = params.length ? `?${params.join('&')}` : '';
      const response = await axios.get(`${API_BASE_URL}/sales/quote-requests/public/${token}/order/${qs}`);
      setData(response.data);
      const allItemIds = new Set<number>(
        (response.data.items || [])
          .filter((item: QuoteItem) => !item.is_ordered)
          .map((item: QuoteItem) => item.id)
      );
      setSelectedItems(allItemIds);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Hiba történt az adatok betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleItemToggle = (itemId: number, checked: boolean) => {
    setSelectedItems(prev => {
      const s = new Set(prev);
      if (checked) s.add(itemId); else s.delete(itemId);
      return s;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set((data?.items || []).filter(i => !i.is_ordered).map(i => i.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const toggleExpand = (itemId: number) => {
    setExpandedRowKeys(prev =>
      prev.includes(itemId) ? prev.filter(k => k !== itemId) : [...prev, itemId]
    );
  };

  const handleOrder = async () => {
    if (!data) return;
    const orderItems = data.items
      .filter(item => selectedItems.has(item.id))
      .map(item => ({ item_id: item.id, quantity: item.quantity }));
    if (orderItems.length === 0) {
      message.warning('Válasszon ki legalább egy tételt megrendeléshez');
      return;
    }
    await submitOrder(orderItems);
  };

  const submitOrder = async (orderItems: { item_id: number; quantity: number }[]) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE_URL}/sales/quote-requests/public/${token}/submit-order/`, {
        items: orderItems,
        ...(desiredDate ? { desired_date: desiredDate.format('YYYY-MM-DD') } : {}),
      });
      message.success('Megrendelés sikeresen elküldve!');
      const now = new Date().toISOString();
      const orderedIds = new Set(orderItems.map(oi => oi.item_id));
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item =>
            orderedIds.has(item.id) ? { ...item, is_ordered: true, ordered_at: now } : item
          ),
        };
      });
      setSelectedItems(new Set());
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Hiba történt a megrendelés küldésekor');
    } finally {
      setSubmitting(false);
    }
  };

  const getItemName = (item: QuoteItem) =>
    item.product_name || item.material_name || item.service_name ||
    item.manufacturing_product_name || item.description || 'Megnevezés nélküli tétel';

  const currencySymbol = data?.currency_symbol || data?.currency_code || 'Ft';

  const getItemCode = (item: QuoteItem) => {
    const real = item.product_code || item.material_code || item.manufacturing_product_code;
    if (real) return real;
    return item.item_type === 'manufacturing' ? 'EGYEDI' : '';
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="large" /></div>;
  if (error) return <div style={{ padding: 24 }}><Alert type="error" message="Hiba" description={error} /></div>;
  if (!data) return null;

  const hasDiscount = data.items.some(item => item.discount_percent > 0);
  const totalNet = data.items.reduce((sum, item) => {
    const v = item.discount_percent > 0 ? Number(item.discounted_net_total) : Number(item.net_total);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const totalGross = data.items.reduce((sum, item) => {
    const v = item.discount_percent > 0 ? Number(item.discounted_gross_total) : Number(item.gross_total);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const orderableItems = data.items.filter(it => !it.is_ordered);
  const partialAllowed = data.partial_order_allowed !== false;
  const allSelected = orderableItems.length > 0 && selectedItems.size === orderableItems.length;
  const indeterminate = partialAllowed && selectedItems.size > 0 && selectedItems.size < orderableItems.length;
  const ORDERED_OR_ABOVE = ['ordered', 'partially_ordered', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced'];

  const columns = [
    {
      title: () => (
        <Checkbox checked={allSelected} indeterminate={indeterminate}
          onChange={(e) => handleSelectAll(e.target.checked)} disabled={!partialAllowed} className="no-print">
          Összes
        </Checkbox>
      ),
      dataIndex: 'selected', key: 'selected', width: 100, className: 'no-print',
      render: (_: any, record: QuoteItem) => {
        if (data?.is_expired) return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Checkbox checked={false} disabled />
            <Text type="danger" style={{ fontSize: 11 }}>Lejárt</Text>
          </div>
        );
        if (record.is_ordered || ORDERED_OR_ABOVE.includes(data?.status || '')) {
          const dt = record.ordered_at ? new Date(record.ordered_at).toLocaleDateString('hu-HU') : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Checkbox checked disabled />
              <Text type="success" style={{ fontSize: 11 }}>Megrendelve{dt ? ` ${dt}` : ''}</Text>
            </div>
          );
        }
        return (
          <Checkbox checked={selectedItems.has(record.id)} disabled={!partialAllowed}
            onChange={(e) => handleItemToggle(record.id, e.target.checked)} />
        );
      }
    },
    {
      title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 120,
      render: (_: any, record: QuoteItem) => getItemCode(record)
    },
    {
      title: 'Megnevezés', dataIndex: 'name', key: 'name',
      render: (_: any, record: QuoteItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{getItemName(record)}</div>
          {(record.attachments?.length ?? 0) > 0 && (
            <Tag icon={<PaperClipOutlined />} color="blue"
              style={{ fontSize: 11, marginTop: 4, cursor: 'pointer' }}
              onClick={() => toggleExpand(record.id)}>
              {record.attachments!.length} csatolmány
            </Tag>
          )}
        </div>
      )
    },
    {
      title: 'Leírás', dataIndex: 'description', key: 'description', width: 260,
      render: (_: string, record: QuoteItem) => {
        const txt = record.description || record.product_description
          || (record as any).manufacturing_product_description
          || (record as any).material_description || (record as any).service_description || '';
        if (!txt) return null;
        const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(txt);
        if (looksLikeHtml) return (
          <div className="pixi-rich-cell" style={{ fontSize: 12, wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: txt }} />
        );
        return <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{txt}</Text>;
      }
    },
    {
      title: 'Mennyiség', dataIndex: 'quantity', key: 'quantity', width: 110,
      render: (qty: number, record: QuoteItem) => `${qty} ${record.unit || 'db'}`
    },
    { 
      title: 'Egységár (nettó)', 
      dataIndex: 'net_unit_price', 
      key: 'net_unit_price',
      width: 130,
      align: 'right' as const,
      render: (price: number) => `${price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${currencySymbol}`
    },
    {
      title: 'ÁFA', dataIndex: 'vat_rate', key: 'vat_rate',
      width: 70, align: 'center' as const, className: 'no-print',
      render: (rate: number) => `${rate}%`
    },
    ...(hasDiscount ? [{
      title: 'Kedvezmény', dataIndex: 'discount_percent', key: 'discount_percent',
      width: 100, align: 'center' as const,
      render: (discount: number) => discount ? `${discount}%` : '-'
    }] : []),
    {
      title: 'Összesen (nettó)', dataIndex: 'net_total', key: 'net_total',
      width: 150, align: 'right' as const,
      render: (_: any, record: QuoteItem) => {
        const total = record.discount_percent > 0 ? record.discounted_net_total : record.net_total;
        return <strong>{total?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currencySymbol}</strong>;
      }
    },
    {
      title: '', key: 'attach_toggle', width: 48, className: 'no-print',
      render: (_: any, record: QuoteItem) => (
        <Button type="text" size="small" icon={<PaperClipOutlined />}
          title="Csatolmányok feltöltése ehhez a tételhez"
          style={{ color: expandedRowKeys.includes(record.id) ? '#1677ff' : '#bbb' }}
          onClick={() => toggleExpand(record.id)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden; }
          .printable-content, .printable-content * { visibility: visible; }
          .printable-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
          .print-only { display: table-row !important; }
          .ant-table-cell:first-child { display: none !important; }
          .print-summary-row .ant-table-cell:first-child { display: none !important; }
          .ant-table-wrapper, .ant-table, .ant-table-content { overflow: visible !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <Card className="printable-content">
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Title level={4}>Szállító</Title>
            <div>
              <strong>{data.supplier.name}</strong><br />
              Adószám: {data.supplier.tax_number}<br />
              {data.supplier.eu_tax_number && <>EU adószám: {data.supplier.eu_tax_number}<br /></>}
              {data.supplier.address}<br />
              {data.supplier.phone && <>Tel: {data.supplier.phone}<br /></>}
              {data.supplier.email && <>E-mail: {data.supplier.email}<br /></>}
              {data.supplier.website && <>Web: {data.supplier.website}<br /></>}
            </div>
          </Col>
          <Col span={12}>
            <Title level={4}>Megrendelő</Title>
            {data.customer ? (
              <div>
                <strong>{data.customer.name}</strong><br />
                {data.customer.tax_number && <span>Adószám: {data.customer.tax_number}<br /></span>}
                {data.customer.address
                  ? <span>{data.customer.address}<br /></span>
                  : (data.customer.postal_code || data.customer.city)
                    ? <span>{data.customer.postal_code} {data.customer.city}<br /></span>
                    : null}
                {data.customer.country}
              </div>
            ) : <Text type="secondary">Nincs megadva</Text>}
          </Col>
        </Row>

        <Title level={2}>Árajánlat</Title>
        <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="Árajánlat száma">{data.number}</Descriptions.Item>
          <Descriptions.Item label="Keltezés">{data.issue_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="Cím" span={2}>{data.title}</Descriptions.Item>
          {data.description && (
            <Descriptions.Item label="Leírás" span={2}>
              {/<\/?[a-z][\s\S]*>/i.test(data.description)
                ? <div className="pixi-rich-cell" style={{ wordBreak: 'break-word' }}
                    dangerouslySetInnerHTML={{ __html: data.description }} />
                : <div style={{ whiteSpace: 'pre-wrap' }}>{data.description}</div>}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Paragraph className="no-print" style={{ color: '#ff4d4f', fontWeight: 500 }}>
          {data.partial_order_allowed !== false
            ? 'Jelölje be a megrendelni kívánt tételeket. A gemkapocs ikonra kattintva tételenként tölthet fel csatolmányokat. A megrendelés után már nem lehetséges újabb csatolmányok feltöltése.'
            : 'Az ajánlat csak egészben rendelhető meg. A gemkapocs ikonra kattintva tételenként tölthet fel csatolmányokat. A megrendelés után már nem lehetséges újabb csatolmányok feltöltése.'}
        </Paragraph>

        {data.is_expired && (
          <Alert type="error" showIcon style={{ marginBottom: 16 }}
            message="Az ajánlat érvényessége lejárt"
            description={`Ez az ajánlat ${data.valid_until ? dayjs(data.valid_until).format('YYYY. MM. DD.') + '-én' : ''} lejárt, ezért megrendelés nem lehetséges.`}
          />
        )}

        <Table
          columns={columns}
          dataSource={data.items || []}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1200 }}
          style={{ marginBottom: 24 }}
          rowClassName={(record) => selectedItems.has(record.id) ? '' : 'unselected-row'}
          expandable={{
            expandedRowKeys,
            showExpandColumn: false,
            expandedRowRender: (record) => (
              <ItemUploadZone token={token!} item={record} />
            ),
          }}
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="no-print">
                <Table.Summary.Cell index={0} colSpan={hasDiscount ? 8 : 7} align="right">
                  <strong>Összesen Nettó:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong>{totalNet.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currencySymbol}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row className="no-print">
                <Table.Summary.Cell index={0} colSpan={hasDiscount ? 9 : 8} align="right">
                  <span style={{ fontSize: 12, color: '#666' }}>(nem tartalmazza az ÁFA-t)</span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row className="print-only print-summary-row">
                <Table.Summary.Cell index={0} />
                <Table.Summary.Cell index={1} colSpan={hasDiscount ? 6 : 5}>
                  <div style={{ textAlign: 'right', paddingRight: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      Összesen Nettó: {totalNet.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currencySymbol}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>(nem tartalmazza az ÁFA-t)</div>
                  </div>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />

        <Row gutter={[16, 12]} justify="end" align="middle" className="no-print" style={{ marginTop: 16 }}>
          <Col>
            <span style={{ marginRight: 8 }}>Ekkora szeretném (nem kötelező):</span>
            <DatePicker
              value={desiredDate}
              onChange={(d) => setDesiredDate(d)}
              placeholder="Válassz dátumot"
              style={{ width: 180 }}
              allowClear
              disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))}
            />
          </Col>
          <Col>
            <Button type="default" size="large" icon={<PrinterOutlined />} onClick={() => window.print()}>
              Nyomtatás
            </Button>
          </Col>
          <Col>
            <Button type="primary" size="large" icon={<ShoppingCartOutlined />}
              onClick={handleOrder} loading={submitting}
              disabled={selectedItems.size === 0 || !!data?.is_expired || ORDERED_OR_ABOVE.includes(data?.status || '')}>
              Megrendelés ({selectedItems.size} tétel)
            </Button>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default PublicQuoteOrder;
