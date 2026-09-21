import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Col, Descriptions, Input, InputNumber, Modal, Popconfirm, Row, Space,
  Statistic, Steps, Table, Tag, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, FilePdfOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../services/api';

const { Text, Title } = Typography;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Készpénz',
  card: 'Bankkártya',
  customer_card: 'Ügyfélkártya',
};

const fmt = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : v.toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

interface NozzleRow {
  id: number;
  pump_name: string;
  pump_number: number;
  nozzle_number: number;
  fuel_grade: number;
  fuel_grade_name: string;
  opening_total: number;
  suggested_closing: number | null;
}

interface TankRow {
  id: number;
  fuel_grade: number;
  fuel_grade_name: string;
  opening_stock: number;
  received: number;
  current_stock: number | null;
}

interface SalesSummary {
  payment_methods: string[];
  categories: { category: string; volume: number | null; by_payment: Record<string, { volume: number; amount: number }>; total_amount: number }[];
  by_payment: Record<string, { sales: number; storno: number; net: number }>;
  storno: Record<string, { amount: number; count: number }>;
  gross_total: number;
  storno_total: number;
  net_total: number;
  transaction_count: number;
}

interface CashSummary {
  cash_register: { id: number; name: string } | null;
  opening_balance: number;
  opening_source?: string;
  cash_sales: number;
  cash_storno: number;
  deposits_total: number;
  withdrawals_total: number;
  calculated_closing: number;
  counted_cash: number | null;
  cash_difference?: number;
}

interface PreviewData {
  nozzles: NozzleRow[];
  tanks: TankRow[];
  sales: SalesSummary;
  cash: CashSummary;
  warnings: string[];
}

interface ShiftLite {
  id: number;
  number: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  counted_cash: number | null;
  has_pdf: boolean;
  summary?: any;
}

const dt = (v: string | null | undefined) => (v ? dayjs(v).format('YYYY.MM.DD. HH:mm') : '–');

// ═══════════════════════════ Műszak záró varázsló ═══════════════════════════

const CloseWizard: React.FC<{
  shift: ShiftLite;
  cashRegisterId: number | null;
  onClose: () => void;
  onClosed: () => void;
}> = ({ shift, cashRegisterId, onClose, onClosed }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [nozzleClosings, setNozzleClosings] = useState<Record<number, { value: number | null; source: string }>>({});
  const [tankMeasured, setTankMeasured] = useState<Record<number, number | null>>({});
  const [countedCash, setCountedCash] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const loadPreview = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get(`/fuel/shifts/${shift.id}/close_preview/`, {
      params: cashRegisterId ? { cash_register: cashRegisterId } : undefined,
    })
      .then(({ data }) => {
        setPreview(data);
        setNozzleClosings((prev) => Object.fromEntries(
          (data.nozzles || []).map((n: NozzleRow) => {
            const old = prev[n.id];
            // kézzel bevitt értéket megőrizzük az újraolvasásnál
            if (old && old.source === 'manual' && old.value != null) return [n.id, old];
            return [n.id, {
              value: n.suggested_closing ?? null,
              source: n.suggested_closing != null ? 'auto' : 'manual',
            }];
          }),
        ));
        setTankMeasured((prev) => Object.fromEntries(
          (data.tanks || []).map((t: TankRow) => [t.id, prev[t.id] ?? null]),
        ));
      })
      .catch((e) => message.error(e?.response?.data?.error || 'A zárási adatok lekérése nem sikerült'))
      .finally(() => setLoading(false));
  }, [shift.id, cashRegisterId]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const takeSuggestedClosings = () => {
    if (!preview) return;
    setNozzleClosings(Object.fromEntries(
      preview.nozzles.map((n) => [n.id, {
        value: n.suggested_closing ?? nozzleClosings[n.id]?.value ?? null,
        source: n.suggested_closing != null ? 'auto' : (nozzleClosings[n.id]?.source || 'manual'),
      }]),
    ));
    message.success('Záró óraállások frissítve a vezérlőből');
  };

  const movements = useMemo(() => {
    const map: Record<number, number> = {};
    (preview?.nozzles || []).forEach((n) => {
      const val = nozzleClosings[n.id]?.value;
      if (val != null) map[n.fuel_grade] = (map[n.fuel_grade] || 0) + (val - n.opening_total);
    });
    return map;
  }, [preview, nozzleClosings]);

  const tankComputed = useMemo(() => (preview?.tanks || []).map((t) => {
    const dispensed = movements[t.fuel_grade] || 0;
    const calculated = t.opening_stock + t.received - dispensed;
    const measured = tankMeasured[t.id] ?? null;
    return { ...t, dispensed, calculated, measured, difference: measured != null ? measured - calculated : null };
  }), [preview, movements, tankMeasured]);

  const nozzlesValid = (preview?.nozzles || []).every((n) => nozzleClosings[n.id]?.value != null && nozzleClosings[n.id]!.value! >= n.opening_total);
  const tanksValid = tankComputed.every((t) => t.measured != null && t.measured! >= 0);

  const cash = preview?.cash;
  const sales = preview?.sales;
  const cashDiff = countedCash != null && cash ? countedCash - cash.calculated_closing : null;

  const submit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/fuel/shifts/${shift.id}/close/`, {
        nozzles: preview.nozzles.map((n) => ({ id: n.id, closing_total: nozzleClosings[n.id]?.value, source: nozzleClosings[n.id]?.source })),
        tanks: preview.tanks.map((t) => ({ id: t.id, measured_closing: tankMeasured[t.id] })),
        counted_cash: countedCash,
        notes,
        ...(cashRegisterId ? { cash_register: cashRegisterId } : {}),
      });
      message.success(`${shift.number}. műszak lezárva`);
      if (data?.pdf_url) {
        try {
          const res = await api.get(`/fuel/shifts/${shift.id}/pdf/`, { responseType: 'blob' });
          const url = URL.createObjectURL(res.data);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch { /* a PDF ablak nem blokkolhatja a folyamatot */ }
      }
      onClosed();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'A műszak zárása nem sikerült');
    } finally {
      setSubmitting(false);
    }
  };

  const nozzleColumns = [
    { title: 'Kút', dataIndex: 'pump_name' },
    { title: 'Pisztoly', dataIndex: 'nozzle_number', render: (v: number) => `${v}.` },
    { title: 'Üzemanyag', dataIndex: 'fuel_grade_name' },
    { title: 'Nyitó óraállás (l)', dataIndex: 'opening_total', align: 'right' as const, render: (v: number) => fmt(v, 2) },
    {
      title: 'Záró óraállás (l)', align: 'right' as const,
      render: (_: any, row: NozzleRow) => (
        <InputNumber
          value={nozzleClosings[row.id]?.value ?? undefined}
          min={0} precision={3} step={1} style={{ width: 150 }}
          onChange={(v) => setNozzleClosings((p) => ({ ...p, [row.id]: { value: v, source: 'manual' } }))}
        />
      ),
    },
    {
      title: 'Elmozdulás (l)', align: 'right' as const,
      render: (_: any, row: NozzleRow) => {
        const val = nozzleClosings[row.id]?.value;
        if (val == null) return <Text type="secondary">–</Text>;
        const mv = val - row.opening_total;
        return mv < 0 ? <Text type="danger">{fmt(mv, 3)}</Text> : <Text strong>{fmt(mv, 3)}</Text>;
      },
    },
  ];

  const tankColumns = [
    { title: 'Üzemanyag', dataIndex: 'fuel_grade_name' },
    { title: 'Nyitó készlet (l)', align: 'right' as const, render: (_: any, r: any) => fmt(r.opening_stock, 2) },
    { title: 'Bevételezés (l)', align: 'right' as const, render: (_: any, r: any) => fmt(r.received, 2) },
    { title: 'Kútóra elmozdulás (l)', align: 'right' as const, render: (_: any, r: any) => fmt(r.dispensed, 3) },
    { title: 'Számított záró (l)', align: 'right' as const, render: (_: any, r: any) => fmt(r.calculated, 3) },
    {
      title: 'Mért záró (l)', align: 'right' as const,
      render: (_: any, row: TankRow) => (
        <InputNumber
          value={tankMeasured[row.id] ?? undefined}
          min={0} precision={2} style={{ width: 140 }}
          placeholder="tartály mérés"
          onChange={(v) => setTankMeasured((p) => ({ ...p, [row.id]: v }))}
        />
      ),
    },
    {
      title: 'Eltérés (l)', align: 'right' as const,
      render: (_: any, r: any) => {
        if (r.difference == null) return <Text type="secondary">–</Text>;
        const abs = Math.abs(r.difference);
        return <Text type={abs > 5 ? 'danger' : abs > 0.5 ? 'warning' : 'success'} strong>{fmt(r.difference, 3)}</Text>;
      },
    },
  ];

  const steps = [
    { title: 'Kútórák', icon: <ReloadOutlined /> },
    { title: 'Tartály leltár', icon: <StopOutlined /> },
    { title: 'Pénzforgalom', icon: <FilePdfOutlined /> },
  ];

  return (
    <Modal
      open
      width={1100}
      title={`Műszak zárása – ${shift.number}. műszak`}
      onCancel={submitting ? undefined : onClose}
      footer={[
        <Button key="back" size="large" disabled={submitting || step === 0} onClick={() => setStep(step - 1)}>Vissza</Button>,
        step < 2 ? (
          <Button
            key="next" type="primary" size="large" disabled={loading || (step === 0 && !nozzlesValid) || (step === 1 && !tanksValid)}
            onClick={() => setStep(step + 1)}
          >
            Következő
          </Button>
        ) : (
          <Popconfirm
            key="finish"
            title="Műszak lezárása"
            description="A zárás után a műszak már nem módosítható. Folytatja?"
            onConfirm={submit}
            disabled={submitting}
          >
            <Button type="primary" size="large" loading={submitting}>Műszak lezárása és PDF</Button>
          </Popconfirm>
        ),
      ]}
    >
      <Steps items={steps} current={step} size="small" style={{ marginBottom: 20 }} />

      {preview?.warnings?.length ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          {preview.warnings.map((w, i) => <div key={i}><Text type="warning">{w}</Text></div>)}
        </Card>
      ) : null}

      {step === 0 && (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadPreview()}>Órák újraolvasása a vezérlőből</Button>
            <Button icon={<PlayCircleOutlined />} onClick={takeSuggestedClosings}>Javasolt záró állások betöltése</Button>
          </Space>
          <Table
            size="small" loading={loading} rowKey="id" dataSource={preview?.nozzles || []}
            columns={nozzleColumns} pagination={false} bordered
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>Összes elmozdulás</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong>{fmt(Object.values(movements).reduce((a, b) => a + b, 0), 3)} l</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          {!nozzlesValid && <Text type="warning" style={{ display: 'block', marginTop: 8 }}>Minden pisztolyhoz adj meg záró óraállást (legalább a nyitó állásnak).</Text>}
        </>
      )}

      {step === 1 && (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Számított záró készlet = nyitó készlet + bevételezés – kútóra elmozdulás. Add meg a tartályban mért
            tényleges mennyiséget.
          </Text>
          <Table size="small" rowKey="id" dataSource={tankComputed} columns={tankColumns} pagination={false} bordered />
          {!tanksValid && <Text type="warning" style={{ display: 'block', marginTop: 8 }}>Minden üzemanyag fajtához add meg a tartályban mért mennyiséget.</Text>}
        </>
      )}

      {step === 2 && (
        <Row gutter={[16, 16]}>
          <Col span={14}>
            <Card size="small" title="Értékesítési összesítés" styles={{ body: { padding: 0 } }}>
              <Table
                size="small" rowKey="category" pagination={false}
                dataSource={[
                  ...(sales?.categories || []).map((c) => ({ key: c.category, ...c })),
                  ...(sales && Object.keys(sales.storno || {}).length ? [{
                    key: 'storno', category: 'Sztornó', volume: null as number | null,
                    by_payment: Object.fromEntries(Object.entries(sales.storno).map(([p, v]) => [p, { volume: 0, amount: -v.amount }])),
                    total_amount: -Object.values(sales.storno).reduce((a, b) => a + b.amount, 0),
                  }] : []),
                  {
                    key: 'net', category: 'Összesen (sztornóval)', volume: null,
                    by_payment: Object.fromEntries((sales?.payment_methods || []).map((p) => [p, { volume: 0, amount: sales?.by_payment?.[p]?.net ?? 0 }])),
                    total_amount: sales?.net_total ?? 0, isTotal: true,
                  },
                ]}
                columns={[
                  { title: 'Kategória', dataIndex: 'category', render: (v: string, r: any) => <Text strong={r.isTotal}>{v}</Text> },
                  { title: 'Mennyiség (l)', align: 'right' as const, render: (_: any, r: any) => (r.volume ? fmt(r.volume, 2) : '–') },
                  ...(sales?.payment_methods || []).map((p) => ({
                    title: PAYMENT_LABELS[p] || p, align: 'right' as const,
                    render: (_: any, r: any) => <Text strong={r.isTotal}>{fmt(r.by_payment?.[p]?.amount ?? 0)}</Text>,
                  })),
                  { title: 'Összesen', align: 'right' as const, render: (_: any, r: any) => <Text strong>{fmt(r.total_amount)}</Text> },
                ]}
              />
            </Card>
          </Col>
          <Col span={10}>
            <Card size="small" title="Pénzforgalom">
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Nyitó készpénz">{fmt(cash?.opening_balance)} Ft</Descriptions.Item>
                <Descriptions.Item label="Készpénzes értékesítés">{fmt(cash?.cash_sales)} Ft</Descriptions.Item>
                <Descriptions.Item label="Sztornó visszafizetés">-{fmt(cash?.cash_storno)} Ft</Descriptions.Item>
                <Descriptions.Item label="Betétek">{fmt(cash?.deposits_total)} Ft</Descriptions.Item>
                <Descriptions.Item label="Kivétek">-{fmt(cash?.withdrawals_total)} Ft</Descriptions.Item>
                <Descriptions.Item label={<Text strong>Számított záró készpénz</Text>}>
                  <Text strong>{fmt(cash?.calculated_closing)} Ft</Text>
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">Számolt készpénz a fiókban (Ft)</Text>
                <InputNumber
                  value={countedCash ?? undefined} min={0} precision={0} style={{ width: '100%' }} size="large"
                  placeholder="lepénzelt összeg" onChange={(v) => setCountedCash(v)}
                />
                {cashDiff != null && (
                  <div style={{ marginTop: 8 }}>
                    <Text type={Math.abs(cashDiff) < 1 ? 'success' : 'danger'} strong>
                      Eltérés: {fmt(cashDiff)} Ft
                    </Text>
                  </div>
                )}
              </div>
              <Input.TextArea
                style={{ marginTop: 12 }} rows={2} placeholder="Megjegyzés (eltérés magyarázat, egyéb)"
                value={notes} onChange={(e) => setNotes(e.target.value)}
              />
            </Card>
          </Col>
        </Row>
      )}
    </Modal>
  );
};

// ═══════════════════════════ Műszak átadás képernyő ═══════════════════════════

const ShiftHandoverScreen: React.FC<{
  onBack: () => void;
  cashRegisterId: number | null;
}> = ({ onBack, cashRegisterId }) => {
  const [current, setCurrent] = useState<ShiftLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [closed, setClosed] = useState<ShiftLite[]>([]);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/fuel/shifts/current/'),
      api.get('/fuel/shifts/', { params: { status: 'closed', page_size: 20 } }),
    ])
      .then(([cur, hist]) => {
        setCurrent(cur.data?.shift || null);
        setClosed(hist.data?.results || hist.data || []);
      })
      .catch(() => message.error('A műszak adatok lekérése nem sikerült'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openShift = async () => {
    setOpening(true);
    try {
      const { data } = await api.post('/fuel/shifts/open_shift/', {});
      message.success(`${data?.shift?.number}. műszak megnyitva`);
      (data?.warnings || []).forEach((w: string) => message.warning(w, 6));
      fetchAll();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'A műszak nyitása nem sikerült');
    } finally {
      setOpening(false);
    }
  };

  const openPdf = async (shiftId: number) => {
    try {
      const res = await api.get(`/fuel/shifts/${shiftId}/pdf/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      message.error('A PDF letöltése nem sikerült');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space size={12}>
          <Button icon={<ArrowLeftOutlined />} size="large" onClick={onBack}>Vissza</Button>
          <Title level={3} style={{ margin: 0 }}>Műszak átadás</Title>
        </Space>
        <Button icon={<ReloadOutlined />} size="large" onClick={fetchAll} loading={loading}>Frissítés</Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Aktuális műszak" loading={loading}>
            {current ? (
              <>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Műszak"><Text strong>{current.number}. műszak</Text> <Tag color="green">nyitott</Tag></Descriptions.Item>
                  <Descriptions.Item label="Nyitva">{dt(current.opened_at)}</Descriptions.Item>
                  <Descriptions.Item label="Nyitotta">{current.opened_by_name || '–'}</Descriptions.Item>
                </Descriptions>
                <Button
                  type="primary" size="large" block style={{ marginTop: 16 }}
                  icon={<StopOutlined />} onClick={() => setWizardOpen(true)}
                >
                  Műszak zárása (átadás)
                </Button>
              </>
            ) : (
              <>
                <Text type="secondary">
                  Nincs nyitott műszak. A nyitás rögzíti a kútfejek regisztrációs óráinak nyitó állását és a
                  tartályok nyitó készletét – ezekből számolódik a zárásnál az elmozdulás és a készlet-elszámolás.
                </Text>
                <Button
                  type="primary" size="large" block style={{ marginTop: 16 }}
                  icon={<PlayCircleOutlined />} loading={opening} onClick={openShift}
                >
                  Műszak nyitása
                </Button>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Lezárt műszakok" styles={{ body: { padding: 0 } }} loading={loading}>
            <Table
              size="small" rowKey="id" dataSource={closed} pagination={{ pageSize: 8 }}
              columns={[
                { title: 'Műszak', dataIndex: 'number', render: (v: number) => <Text strong>{v}.</Text> },
                { title: 'Mettől', render: (_: any, r: ShiftLite) => dt(r.opened_at) },
                { title: 'Meddig', render: (_: any, r: ShiftLite) => dt(r.closed_at) },
                { title: 'Zárta', dataIndex: 'closed_by_name' },
                {
                  title: 'Készpénz', align: 'right' as const,
                  render: (_: any, r: ShiftLite) => (r.counted_cash != null ? `${fmt(r.counted_cash)} Ft` : '–'),
                },
                {
                  title: '', width: 70,
                  render: (_: any, r: ShiftLite) => (
                    <Button
                      size="small" icon={<FilePdfOutlined />} disabled={!r.has_pdf}
                      onClick={() => openPdf(r.id)} title="Jegyzőkönyv PDF"
                    />
                  ),
                },
              ]}
              locale={{ emptyText: 'Még nincs lezárt műszak' }}
            />
          </Card>
        </Col>
      </Row>

      {wizardOpen && current && (
        <CloseWizard
          shift={current}
          cashRegisterId={cashRegisterId}
          onClose={() => setWizardOpen(false)}
          onClosed={() => { setWizardOpen(false); fetchAll(); }}
        />
      )}
    </div>
  );
};

export default ShiftHandoverScreen;
