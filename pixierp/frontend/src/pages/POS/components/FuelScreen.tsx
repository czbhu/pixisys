import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, InputNumber, Modal, Popconfirm, Radio, Row, Select, Space, Spin, Tag, Typography, message,
} from 'antd';
import {
  ReloadOutlined, CloseOutlined, PlayCircleOutlined, StopOutlined,
  WarningOutlined, DollarOutlined, DeleteOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../../../services/api';

const { Text, Title } = Typography;

export interface FuelNozzleInfo {
  nozzle_number: number;
  fuel_grade: number | null;
  fuel_grade_name: string | null;
  fuel_grade_pts_id: number | null;
}

export interface FuelPumpInfo {
  id: number;
  pump_id: number;
  name: string;
  nozzles: FuelNozzleInfo[];
}

export interface FuelGradeInfo {
  id: number;
  fuel_grade_id: number;
  name: string;
  material: number | null;
  material_name: string | null;
  unit: string;
  price: number | null;
}

export interface FuelContext {
  poll_interval: number;
  auto_close_transaction: boolean;
  fuel_warehouse: { id: number; name: string } | null;
  grades: FuelGradeInfo[];
  pumps: FuelPumpInfo[];
}

interface FuelTransactionInfo {
  id: number;
  state: string;
  volume: number;
  unit_price: number;
  amount: number;
  pts_transaction_number: number | null;
}

interface PumpStatus {
  pump: number;
  pump_id: number;
  pump_name: string;
  state: string;
  nozzle: number;
  fuel_grade: number | null;
  fuel_grade_name: string;
  volume: number;
  amount: number;
  price: number;
  transaction: number | null;
  is_suspended: boolean;
  ordered_type?: string;
  ordered_dose?: number;
  fuel_transaction: FuelTransactionInfo | null;
}

interface StationStatus {
  poll_interval: number;
  controller_error: string | null;
  fuel_warehouse: { id: number; name: string } | null;
  pumps: PumpStatus[];
  stock_levels: { fuel_grade: number; fuel_grade_name: string; stock: number; unit: string }[];
}

interface FuelScreenProps {
  fuel: FuelContext;
  posId?: number | null;
  onClose: () => void;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  idle: { label: 'Üresjárat', color: 'green' },
  filling: { label: 'Töltés folyamatban', color: 'processing' },
  end_of_transaction: { label: 'Befejezve – fizetésre vár', color: 'orange' },
  offline: { label: 'Nem elérhető', color: 'red' },
  totals: { label: 'Óraolvasás', color: 'purple' },
  prices: { label: 'Árváltás', color: 'purple' },
};

const fmtHuf = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const FuelScreen: React.FC<FuelScreenProps> = ({ fuel, posId, onClose }) => {
  const [status, setStatus] = useState<StationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyPumpId, setBusyPumpId] = useState<number | null>(null);

  // Engedélyezés (preset) modal
  const [authModal, setAuthModal] = useState<{ pump: FuelPumpInfo } | null>(null);
  const [authNozzle, setAuthNozzle] = useState<number | null>(null);
  const [authType, setAuthType] = useState<'FullTank' | 'Volume' | 'Amount'>('FullTank');
  const [authDose, setAuthDose] = useState<number | null>(null);

  // Fizetés modal
  const [payModal, setPayModal] = useState<{ pump: PumpStatus; ftx: FuelTransactionInfo } | null>(null);
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [payReceived, setPayReceived] = useState<number | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);

  const fetchStatus = useCallback(async (silent = false) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const params: Record<string, any> = {};
      if (posId) params.terminal = posId;
      const { data } = await api.get('/fuel/pumps/status_all/', { params });
      setStatus(data);
    } catch (error: any) {
      if (!silent) {
        message.error(error?.response?.data?.error || 'Kútállapot lekérése sikertelen');
      }
    } finally {
      pollingRef.current = false;
    }
  }, [posId]);

  // Állapot időzített lekérdezés
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await fetchStatus(true);
      if (!cancelled) {
        const intervalMs = Math.max(2, status?.poll_interval || fuel.poll_interval || 2) * 1000;
        pollTimer.current = setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [fetchStatus, fuel.poll_interval]);

  const pumpInfoById = new Map(fuel.pumps.map((p) => [p.id, p]));

  const postPumpAction = async (pumpStatusId: number, action: string, body: Record<string, any> = {}) => {
    setBusyPumpId(pumpStatusId);
    try {
      const { data } = await api.post(`/fuel/pumps/${pumpStatusId}/${action}/`, body);
      message.success(data?.message || 'Sikeres művelet');
      await fetchStatus();
      return data;
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A művelet nem sikerült');
      return null;
    } finally {
      setBusyPumpId(null);
    }
  };

  const openAuthorize = (pump: FuelPumpInfo) => {
    const firstNozzle = pump.nozzles[0]?.nozzle_number ?? null;
    setAuthNozzle(firstNozzle);
    setAuthType('FullTank');
    setAuthDose(null);
    setAuthModal({ pump });
  };

  const submitAuthorize = async () => {
    if (!authModal) return;
    if (authType !== 'FullTank' && !authDose) {
      message.warning('Add meg a kívánt mennyiséget vagy összeget!');
      return;
    }
    const body: Record<string, any> = { type: authType };
    if (authNozzle) body.nozzle = authNozzle;
    if (authDose != null) body.dose = authDose;
    if (posId) body.terminal = posId;
    const result = await postPumpAction(authModal.pump.id, 'authorize', body);
    if (result) setAuthModal(null);
  };

  const submitPay = async () => {
    if (!payModal) return;
    setBusyPumpId(payModal.pump.pump);
    try {
      const body: Record<string, any> = { payment_method: payMethod };
      if (payMethod === 'cash' && payReceived != null) body.amount_received = payReceived;
      if (posId) body.terminal = posId;
      const { data } = await api.post(`/fuel/transactions/${payModal.ftx.id}/pay/`, body);
      const warnings: string[] = data?.warnings || [];
      Modal.success({
        title: 'Fizetés sikeres',
        content: (
          <div>
            <p>Bizonylatszám: <strong>{data?.transaction?.transaction_number}</strong></p>
            <p>Összeg: <strong>{fmtHuf(data?.transaction?.total_gross)} Ft</strong></p>
            {data?.change ? <p>Visszajáró: <strong>{fmtHuf(data.change)} Ft</strong></p> : null}
            {warnings.map((w, i) => <p key={i} style={{ color: '#fa8c16' }}>{w}</p>)}
          </div>
        ),
      });
      setPayModal(null);
      setPayReceived(null);
      await fetchStatus();
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A fizetés nem sikerült');
    } finally {
      setBusyPumpId(null);
    }
  };

  const renderPumpCard = (p: PumpStatus) => {
    const info = pumpInfoById.get(p.pump);
    const stateInfo = STATE_LABELS[p.state] || { label: p.state, color: 'default' };
    const busy = busyPumpId === p.pump;
    const ftx = p.fuel_transaction;

    return (
      <Col xs={24} sm={12} lg={8} xl={6} key={p.pump}>
        <Card
          size="small"
          title={
            <Space>
              <Text strong style={{ fontSize: 16 }}>{p.pump_name}</Text>
              <Tag color={stateInfo.color}>{stateInfo.label}</Tag>
            </Space>
          }
          styles={{ body: { padding: '12px 16px' } }}
          style={{ borderColor: p.state === 'end_of_transaction' ? '#fa8c16' : undefined }}
        >
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {p.state === 'filling' || p.state === 'end_of_transaction' ? (
              <>
                <div style={{ fontSize: 13, color: '#888' }}>
                  {p.fuel_grade_name || '—'}{p.nozzle ? ` · ${p.nozzle}. pisztoly` : ''}
                </div>
                <Title level={3} style={{ margin: '4px 0' }}>
                  {p.volume?.toFixed(2)} l
                </Title>
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                  {fmtHuf(p.amount)} Ft
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {fmtHuf(p.price)} Ft/l
                  {p.state === 'filling' && p.is_suspended ? ' · felfüggesztve' : ''}
                </Text>
              </>
            ) : (
              <div style={{ padding: '12px 0', color: '#999' }}>
                {p.state === 'offline' ? 'A kút nem válaszol' : 'Nincs folyamatban töltés'}
              </div>
            )}
          </div>

          <Space wrap style={{ justifyContent: 'center', width: '100%' }}>
            {p.state === 'idle' && info && (
              <Button
                type="primary" icon={<PlayCircleOutlined />} loading={busy}
                onClick={() => openAuthorize(info)}
              >
                Töltés engedélyezése
              </Button>
            )}
            {p.state === 'filling' && (
              <>
                <Button danger icon={<StopOutlined />} loading={busy}
                  onClick={() => postPumpAction(p.pump, 'stop')}>
                  Leállítás
                </Button>
                <Button
                  icon={p.is_suspended ? <PlayCircleOutlined /> : <WarningOutlined />}
                  loading={busy}
                  onClick={() => postPumpAction(p.pump, p.is_suspended ? 'resume' : 'suspend')}
                >
                  {p.is_suspended ? 'Folytatás' : 'Felfüggesztés'}
                </Button>
              </>
            )}
            {p.state === 'end_of_transaction' && ftx && (
              <>
                <Button
                  type="primary" icon={<DollarOutlined />} loading={busy} size="large"
                  onClick={() => { setPayMethod('cash'); setPayReceived(null); setPayModal({ pump: p, ftx }); }}
                >
                  Fizetés
                </Button>
                <Button
                  icon={<CheckCircleOutlined />} loading={busy}
                  onClick={() => postPumpAction(p.pump, 'close', { fuel_transaction: ftx.id })}
                >
                  Kútzárás (nullázás)
                </Button>
                <Popconfirm
                  title="Biztosan törlöd a tranzakciót a nyilvántartásból?"
                  onConfirm={async () => {
                    setBusyPumpId(p.pump);
                    try {
                      const { data } = await api.post(`/fuel/transactions/${ftx.id}/cancel/`, {});
                      message.success(data?.message || 'Törölve');
                      if (data?.warnings?.length) data.warnings.forEach((w: string) => message.warning(w));
                      await fetchStatus();
                    } catch (error: any) {
                      message.error(error?.response?.data?.error || 'A törlés nem sikerült');
                    } finally {
                      setBusyPumpId(null);
                    }
                  }}
                >
                  <Button danger icon={<DeleteOutlined />} loading={busy} />
                </Popconfirm>
              </>
            )}
            {p.state === 'offline' && (
              <Popconfirm
                title="Vészhelyzet leállítás küldése a kútnak?"
                onConfirm={() => postPumpAction(p.pump, 'emergency_stop')}
              >
                <Button danger icon={<WarningOutlined />} loading={busy}>
                  Vészhelyzet stop
                </Button>
              </Popconfirm>
            )}
          </Space>

          {ftx && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#999', textAlign: 'center' }}>
              kút tranzakció #{ftx.pts_transaction_number ?? '—'}
              {ftx.state === 'paid' ? ' · kifizetve' : ''}
            </div>
          )}
        </Card>
      </Col>
    );
  };

  const authPump = authModal?.pump;

  return (
    <div style={{ padding: '12px 16px', minHeight: 'calc(100vh - 64px)', background: '#f0f2f5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space size={16} wrap>
          <Title level={4} style={{ margin: 0 }}>⛽ Üzemanyag adagolás</Title>
          {fuel.fuel_warehouse && (
            <Tag color="blue">Raktár: {fuel.fuel_warehouse.name}</Tag>
          )}
          {(status?.stock_levels || []).map((s) => (
            <Tag key={s.fuel_grade}>
              {s.fuel_grade_name}: {s.stock?.toLocaleString('hu-HU')} {s.unit}
            </Tag>
          ))}
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setLoading(true); fetchStatus().finally(() => setLoading(false)); }}>
            Frissítés
          </Button>
          <Button icon={<CloseOutlined />} onClick={onClose}>Vissza a kasszához</Button>
        </Space>
      </div>

      {status?.controller_error && (
        <Alert
          type="error" showIcon style={{ marginBottom: 12 }}
          message="A PTS-2 kútvezérlő nem elérhető"
          description={status.controller_error}
        />
      )}

      <Spin spinning={loading && !status}>
        <Row gutter={[12, 12]}>
          {(status?.pumps || []).map(renderPumpCard)}
          {status && !status.pumps.length && (
            <Col span={24}>
              <Card><Text type="secondary">Nincs konfigurált kútfej. Beállítások → Modulok → Benzinkút modul.</Text></Card>
            </Col>
          )}
          {!status && (
            <Col span={24} style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
            </Col>
          )}
        </Row>
      </Spin>

      {/* Töltés engedélyezése (preset) modal */}
      <Modal
        title={`Töltés engedélyezése – ${authPump?.name || ''}`}
        open={!!authModal}
        onCancel={() => setAuthModal(null)}
        onOk={submitAuthorize}
        okText="Engedélyezés"
        cancelText="Mégse"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text type="secondary">Pisztoly</Text>
            <Select
              style={{ width: '100%' }}
              value={authNozzle}
              onChange={setAuthNozzle}
              placeholder="Válassz pisztolyt"
            >
              {(authPump?.nozzles || []).map((n) => {
                const grade = fuel.grades.find((g) => g.id === n.fuel_grade);
                return (
                  <Select.Option key={n.nozzle_number} value={n.nozzle_number}>
                    {n.nozzle_number}. pisztoly – {n.fuel_grade_name || 'nincs fajta'}
                    {grade?.price != null ? ` (${fmtHuf(grade.price)} Ft/l)` : ''}
                  </Select.Option>
                );
              })}
            </Select>
          </div>
          <div>
            <Text type="secondary">Adagolás módja</Text>
            <Radio.Group
              value={authType}
              onChange={(e) => setAuthType(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}
            >
              <Radio value="FullTank">Tele tank (a kúton végeződik)</Radio>
              <Radio value="Volume">Adott mennyiség (liter)</Radio>
              <Radio value="Amount">Adott összeg (Ft)</Radio>
            </Radio.Group>
          </div>
          {authType !== 'FullTank' && (
            <div>
              <Text type="secondary">{authType === 'Volume' ? 'Mennyiség (liter)' : 'Összeg (Ft)'}</Text>
              <InputNumber
                style={{ width: '100%' }}
                min={0.01}
                value={authDose}
                onChange={setAuthDose}
                decimalSeparator=","
                size="large"
              />
            </div>
          )}
          <Text type="secondary">
            Az ár a pisztolyhoz rendelt termék bruttó árából kerül megadása a kútnak.
          </Text>
        </Space>
      </Modal>

      {/* Fizetés modal */}
      <Modal
        title={`Fizetés – ${payModal?.pump.pump_name || ''}`}
        open={!!payModal}
        onCancel={() => setPayModal(null)}
        onOk={submitPay}
        okText="Fizetés rögzítése"
        cancelText="Mégse"
        destroyOnClose
      >
        {payModal && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ fontSize: 15 }}>
              <div>{payModal.pump.fuel_grade_name || 'Üzemanyag'} · {payModal.pump.nozzle}. pisztoly</div>
              <div>Mennyiség: <strong>{Number(payModal.ftx.volume).toFixed(2)} l</strong></div>
              <div>Egységár: <strong>{fmtHuf(payModal.ftx.unit_price)} Ft/l</strong></div>
              <Title level={3} style={{ margin: '8px 0 0' }}>
                {fmtHuf(payModal.ftx.amount)} Ft
              </Title>
            </div>
            <Radio.Group value={payMethod} onChange={(e) => setPayMethod(e.target.value)} buttonStyle="solid">
              <Radio.Button value="cash">Készpénz</Radio.Button>
              <Radio.Button value="card">Bankkártya</Radio.Button>
            </Radio.Group>
            {payMethod === 'cash' && (
              <div>
                <Text type="secondary">Kapott összeg (Ft)</Text>
                <InputNumber
                  style={{ width: '100%' }} size="large" min={0} precision={0}
                  value={payReceived} onChange={setPayReceived}
                />
                {payReceived != null && payReceived >= Number(payModal.ftx.amount) && (
                  <Text type="success" style={{ display: 'block', marginTop: 4 }}>
                    Visszajáró: {fmtHuf(payReceived - Number(payModal.ftx.amount))} Ft
                  </Text>
                )}
              </div>
            )}
            <Text type="secondary">
              A fizetés POS bizonylatot készít, levonja a készletet az üzemanyag raktárból és lezárja a kút tranzakciót.
            </Text>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default FuelScreen;
