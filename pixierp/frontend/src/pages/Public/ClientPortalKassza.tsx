import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Card, Col, Empty, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography, message,
} from 'antd';
import {
  DownloadOutlined, LogoutOutlined, QrcodeOutlined, ReloadOutlined, WalletOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { publicPortalService } from '../../services/publicPortalService';

const { Title, Text } = Typography;

const fmt = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('hu-HU', { maximumFractionDigits: 0 });

interface Summary {
  user: { email: string; full_name: string };
  customer: { id: number; name: string } | null;
  points: number;
  fuel_card: { card_number: string; balance: number; is_active: boolean } | null;
}

interface Purchase {
  id: number;
  transaction_number: string;
  transaction_type: string;
  payment_method: string;
  status: string;
  created_at: string;
  item_count: number;
  total_gross: number;
  points: number;
}

const PAY_LABELS: Record<string, string> = {
  cash: 'Készpénz', card: 'Bankkártya', customer_card: 'Üzemanyagkártya',
};

const QrPanel: React.FC = () => {
  const [qr, setQr] = useState<{ token: string; expires_in: number } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await publicPortalService.loyaltyQr();
      setQr(data);
      setRemaining(data.expires_in);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'A QR kód lekérése nem sikerült');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          refresh();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  const pct = qr && qr.expires_in ? Math.max(0, Math.min(100, (remaining / qr.expires_in) * 100)) : 0;

  return (
    <Card
      title={<Space><QrcodeOutlined /> Kassza azonosító</Space>}
      extra={<Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>Frissítés</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '12px 0' }}>
        {qr ? (
          <>
            <div style={{
              padding: 16, background: '#fff', borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)', border: `3px solid ${pct > 25 ? '#52c41a' : '#faad14'}`,
            }}>
              <QRCodeSVG value={qr.token} size={220} level="M" />
            </div>
            <Text type={pct > 25 ? 'secondary' : 'warning'} strong={pct <= 25}>
              {remaining > 0 ? `Érvényes még ${remaining} másodpercig` : 'Megújítás...'}
            </Text>
            <div style={{ width: 220, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: pct > 25 ? '#52c41a' : '#faad14', transition: 'width 1s linear',
              }} />
            </div>
            <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', maxWidth: 320 }}>
              Mutasd ezt a kódot a kasszánál fizetés előtt – a pénztáros beolvassa, és automatikusan
              jóíródnak a pontok és érvényesül a kedvezményed.
            </Text>
          </>
        ) : (
          <Spin size="large" />
        )}
      </div>
    </Card>
  );
};

const ClientPortalKassza: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, pur] = await Promise.all([
        publicPortalService.loyaltySummary(),
        publicPortalService.loyaltyPurchases(),
      ]);
      setSummary(sum);
      setPurchases(pur?.purchases || []);
    } catch {
      localStorage.removeItem('portal_access_token');
      message.warning('A portál session lejárt, kérlek jelentkezz be újra');
      navigate('/portal/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem('portal_access_token');
    if (!token) {
      navigate('/portal/login');
      return;
    }
    loadAll();
  }, [loadAll, navigate]);

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const pur = await publicPortalService.loyaltyPurchases();
      setPurchases(pur?.purchases || []);
    } catch { /* ignore */ } finally {
      setPurchasesLoading(false);
    }
  }, []);

  const downloadReceipt = async (id: number, number: string) => {
    try {
      const blob = await publicPortalService.loyaltyReceiptBlob(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      message.error(`A bizonylat (${number}) letöltése nem sikerült`);
    }
  };

  const logout = async () => {
    try { await publicPortalService.logout(); } catch { /* no-op */ }
    localStorage.removeItem('portal_access_token');
    navigate('/portal/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space direction="vertical" size={2}>
          <Title level={3} style={{ margin: 0 }}>Kassza</Title>
          <Text type="secondary">{summary?.user?.full_name || summary?.user?.email}</Text>
        </Space>
        <Button icon={<LogoutOutlined />} onClick={logout}>Kilépés</Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title="Hűségpontjaim" value={summary?.points ?? 0} suffix="pont"
              valueStyle={{ color: '#faad14', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            {summary?.fuel_card ? (
              <Statistic
                title={<Space><WalletOutlined /> Üzemanyagkártya ({summary.fuel_card.card_number})</Space>}
                value={fmt(summary.fuel_card.balance)} suffix="Ft"
                valueStyle={{ color: summary.fuel_card.is_active ? '#1677ff' : '#999', fontWeight: 600 }}
              />
            ) : (
              <Text type="secondary">Nincs üzemanyagkártya ehhez a fiókhoz rendelve.</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="qr"
        items={[
          {
            key: 'qr',
            label: <Space><QrcodeOutlined /> Azonosító</Space>,
            children: <QrPanel />,
          },
          {
            key: 'purchases',
            label: 'Vásárlásaim',
            children: (
              <Card
                title="Előző vásárlások"
                extra={<Button icon={<ReloadOutlined />} onClick={loadPurchases} loading={purchasesLoading}>Frissítés</Button>}
                styles={{ body: { padding: 0 } }}
              >
                <Table<Purchase>
                  rowKey="id" size="small" loading={purchasesLoading} dataSource={purchases}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: <Empty description="Még nincs rögzített vásárlás" /> }}
                  columns={[
                    { title: 'Bizonylat', dataIndex: 'transaction_number' },
                    { title: 'Dátum', render: (_: any, r: Purchase) => dayjs(r.created_at).format('YYYY.MM.DD. HH:mm') },
                    { title: 'Tételek', dataIndex: 'item_count', align: 'right' as const },
                    {
                      title: 'Fizetés', dataIndex: 'payment_method',
                      render: (v: string) => PAY_LABELS[v] || v,
                    },
                    { title: 'Összeg', align: 'right' as const, render: (_: any, r: Purchase) => `${fmt(r.total_gross)} Ft` },
                    {
                      title: 'Pont', dataIndex: 'points', align: 'right' as const,
                      render: (v: number) => (v ? <Tag color="gold">+{v}</Tag> : null),
                    },
                    {
                      title: '', width: 60,
                      render: (_: any, r: Purchase) => (
                        <Button size="small" icon={<DownloadOutlined />} title="Bizonylat letöltése"
                          onClick={() => downloadReceipt(r.id, r.transaction_number)} />
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ClientPortalKassza;
