import React, { useState } from 'react';
import {
  Card, Descriptions, Button, Space, Typography, Divider, Alert,
  Statistic, Row, Col, Tag, Spin, message,
} from 'antd';
import {
  CheckCircleOutlined, FilePdfOutlined, ArrowLeftOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import api from '../../../services/api';
import type { PrintParams } from './Step1Params';

const { Title, Text } = Typography;

interface Company { id: number; name: string; }
interface Contact { id: number; first_name: string; last_name: string; }

interface Props {
  params: PrintParams;
  priceBreakdown: any;
  orderId: number | null;
  itemId: number | null;
  isAdmin: boolean;
  company: Company | null;
  contact: Contact | null;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

const SIDE_MODE_LABELS: Record<string, string> = {
  color: 'Színes',
  bw: 'Fekete-fehér',
  color_white: 'Színes + fehér',
  none: 'Nyomatlan',
};

const BINDING_LABELS: Record<string, string> = {
  cut: 'Méretre vágás',
  fold: 'Hajtogatás',
};

const Step3OrderSummary: React.FC<Props> = ({
  params, priceBreakdown, orderId, itemId, isAdmin,
  company, contact, saving, onBack, onConfirm,
}) => {
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleGeneratePdf = async () => {
    if (!orderId || !itemId) {
      message.error('A tervnek mentettnek kell lennie a PDF generáláshoz');
      return;
    }
    setGeneratingPdf(true);
    try {
      const r = await api.post(`/printshop/orders/${orderId}/generate-pdf/`, { item_id: itemId });
      setPdfUrl(r.data.pdf_url);
      message.success('Nyomdakész PDF elkészült!');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'PDF generálási hiba');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Row gutter={24}>
        {/* Bal oszlop: Összefoglaló */}
        <Col xs={24} lg={isAdmin ? 14 : 24}>
          <Card title="Megrendelés összefoglaló" style={{ marginBottom: 16 }}>

            {/* Ügyfél infó (admin esetén) */}
            {isAdmin && (company || contact) && (
              <>
                <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
                  {company && <Descriptions.Item label="Cég">{company.name}</Descriptions.Item>}
                  {contact && (
                    <Descriptions.Item label="Kapcsolattartó">
                      {contact.first_name} {contact.last_name}
                    </Descriptions.Item>
                  )}
                </Descriptions>
                <Divider style={{ margin: '12px 0' }} />
              </>
            )}

            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Terméknév">{params.product_name}</Descriptions.Item>
              <Descriptions.Item label="Méret">
                {params.width_mm} × {params.height_mm} mm
              </Descriptions.Item>
              <Descriptions.Item label="Mennyiség">
                <strong>{params.quantity} db</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Oldalak">
                {params.sides === '1' ? '1 oldalas' : '2 oldalas'}
              </Descriptions.Item>
              <Descriptions.Item label="1. oldal nyomtatás">
                <Tag color={params.side1_mode === 'color' ? 'blue' : 'default'}>
                  {SIDE_MODE_LABELS[params.side1_mode] ?? params.side1_mode}
                </Tag>
              </Descriptions.Item>
              {params.sides === '2' && (
                <Descriptions.Item label="2. oldal nyomtatás">
                  <Tag color={params.side2_mode === 'none' ? 'default' : 'blue'}>
                    {SIDE_MODE_LABELS[params.side2_mode] ?? params.side2_mode}
                  </Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Kötészet">
                {BINDING_LABELS[params.binding] ?? params.binding}
                {params.binding === 'fold' && params.folding_count > 0 && (
                  <span> ({params.folding_count}×)</span>
                )}
              </Descriptions.Item>
              {params.folding_specs.length > 0 && (
                <Descriptions.Item label="Hajtás pozíciók">
                  {params.folding_specs.map((f, i) => (
                    <Tag key={i}>{f.axis === 'H' ? 'Vízszintes' : 'Függőleges'} — {f.pos_mm}mm</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* PDF generálás */}
          <Card
            title="Nyomdakész PDF"
            style={{ marginBottom: 16 }}
            extra={
              pdfUrl && (
                <Button
                  type="link"
                  icon={<FilePdfOutlined />}
                  href={pdfUrl}
                  target="_blank"
                >
                  Letöltés
                </Button>
              )
            }
          >
            <Alert
              type="info"
              showIcon
              message="A nyomdakész PDF 3mm bleedet és vágójeleket tartalmaz. A fájl CMYK-ba kerül konvertálásra nyomtatáskor."
              style={{ marginBottom: 12 }}
            />
            {pdfUrl ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="PDF sikeresen elkészült"
                description={
                  <a href={pdfUrl} target="_blank" rel="noreferrer">
                    {pdfUrl.split('/').pop()}
                  </a>
                }
              />
            ) : (
              <Button
                icon={generatingPdf ? undefined : <FilePdfOutlined />}
                loading={generatingPdf}
                onClick={handleGeneratePdf}
                disabled={!orderId}
              >
                {generatingPdf ? 'PDF generálás...' : 'Nyomdakész PDF generálás (opcionális)'}
              </Button>
            )}
          </Card>
        </Col>

        {/* Jobb oszlop: Ár */}
        <Col xs={24} lg={isAdmin ? 10 : 24}>
          <Card title="Ár összefoglaló" style={{ marginBottom: 16 }}>
            {priceBreakdown ? (
              <>
                {isAdmin && (
                  <>
                    <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
                      <Descriptions.Item label="Papírköltség">
                        {priceBreakdown.paper_cost?.toLocaleString('hu-HU')} Ft
                      </Descriptions.Item>
                      <Descriptions.Item label="Nyomtatás 1. oldal">
                        {priceBreakdown.print_cost_side1?.toLocaleString('hu-HU')} Ft
                      </Descriptions.Item>
                      {priceBreakdown.print_cost_side2 > 0 && (
                        <Descriptions.Item label="Nyomtatás 2. oldal">
                          {priceBreakdown.print_cost_side2?.toLocaleString('hu-HU')} Ft
                        </Descriptions.Item>
                      )}
                      <Descriptions.Item label="Kötészet">
                        {priceBreakdown.finishing_cost?.toLocaleString('hu-HU')} Ft
                      </Descriptions.Item>
                      <Descriptions.Item label="Részösszeg">
                        {priceBreakdown.subtotal?.toLocaleString('hu-HU')} Ft
                      </Descriptions.Item>
                      <Descriptions.Item label="Fedezet">
                        {priceBreakdown.margin_pct}%
                      </Descriptions.Item>
                    </Descriptions>
                    <Divider style={{ margin: '8px 0' }} />
                  </>
                )}
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="Egységár"
                      value={priceBreakdown.unit_price}
                      precision={2}
                      suffix="Ft/db"
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={`Végösszeg (${priceBreakdown.quantity} db)`}
                      value={priceBreakdown.total}
                      precision={0}
                      suffix="Ft"
                      valueStyle={{ color: '#1890ff', fontWeight: 700 }}
                    />
                  </Col>
                </Row>
              </>
            ) : (
              <Text type="secondary">Nincs ár adat</Text>
            )}
          </Card>

          <Card>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert
                type="warning"
                showIcon
                message="A megrendelés leadása után felvesszük veled a kapcsolatot a végleges visszaigazoláshoz."
              />
              <Button
                type="primary"
                size="large"
                block
                icon={<ShoppingCartOutlined />}
                loading={saving}
                onClick={onConfirm}
              >
                Megrendelés leadása
              </Button>
              <Button block icon={<ArrowLeftOutlined />} onClick={onBack}>
                Vissza a szerkesztőhöz
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Step3OrderSummary;
