import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row,
  Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography, message,
} from 'antd';
import {
  ApiOutlined, CloudDownloadOutlined,
  PlusOutlined, ReloadOutlined, SaveOutlined, SyncOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../services/api';

const { Text, Title } = Typography;

interface FuelConfig {
  id: number;
  enabled: boolean;
  controller_url: string;
  auth_type: 'digest' | 'basic';
  username: string;
  password: string;
  request_timeout: number;
  poll_interval: number;
  auto_sync_prices: boolean;
  auto_close_transaction: boolean;
  fuel_warehouse: number | null;
  fuel_warehouse_name?: string | null;
}

interface FuelGrade {
  id: number;
  fuel_grade_id: number;
  name: string;
  material: number | null;
  material_name?: string | null;
  material_code?: string | null;
  material_unit?: string | null;
  gross_price: number | null;
  is_active: boolean;
}

interface FuelPumpNozzle {
  id?: number;
  nozzle_number: number;
  fuel_grade: number | null;
}

interface FuelPump {
  id: number;
  pump_id: number;
  name: string;
  is_active: boolean;
  nozzles: FuelPumpNozzle[];
}

interface WarehouseOption { id: number; name: string; code: string }
interface MaterialOption { id: number; name: string; code: string; unit: string }

interface TotalsLog {
  id: number;
  pump_name: string;
  nozzle_number: number;
  fuel_grade_name?: string | null;
  volume_total: string;
  amount_total: string;
  source_display: string;
  read_at: string;
}

interface FuelTransactionRow {
  id: number;
  pump_name: string;
  nozzle_number: number | null;
  fuel_grade_name?: string | null;
  pts_transaction_number: number | null;
  state_display: string;
  state: string;
  volume: string;
  unit_price: string;
  amount: string;
  pos_transaction_number?: string | null;
  created_at: string;
}

const fmtError = (data: any): string => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.detail) return String(data.detail);
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (Array.isArray(value) && value.length) return `${key}: ${value[0]}`;
    if (typeof value === 'string') return value;
  }
  return '';
};

const nextFreeId = (ids: number[], min: number, max: number): number => {
  const used = new Set(ids);
  for (let candidate = min; candidate <= max; candidate++) {
    if (!used.has(candidate)) return candidate;
  }
  return min;
};


// ═══════════════════════════ Hűségprogram (kassza app) ═══════════════════════════

const LoyaltySection: React.FC = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [pointDelta, setPointDelta] = useState<number | null>(null);
  const [pointNote, setPointNote] = useState('');
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [newDiscount, setNewDiscount] = useState<{ material?: number; percent?: number }>({});

  const loadCfg = () => {
    api.get('/loyalty/config/').then(r => setCfg(r.data)).catch(() => {});
  };
  useEffect(() => { loadCfg(); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!customerQuery) { setCustomers([]); return; }
      api.get('/crm/companies/', { params: { search: customerQuery, page_size: 20, is_customer: true } })
        .then(r => setCustomers(r.data?.results || r.data || []))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [customerQuery]);

  const loadCustomerData = useCallback((cid: number) => {
    api.get('/loyalty/points/', { params: { customer: cid, page_size: 50 } })
      .then(r => {
        const entries = r.data?.results || r.data || [];
        const pts = entries.reduce((a: number, e: any) => a + (e.points || 0), 0);
        setSummary((prev: any) => ({ ...(prev || {}), points: pts, entries }));
      }).catch(() => setSummary((prev: any) => ({ ...(prev || {}), entries: [] })));
    api.get('/loyalty/fuel-cards/', { params: { customer: cid } })
      .then(r => {
        const card = (r.data?.results || r.data || [])[0] || null;
        setSummary((prev: any) => ({ ...(prev || {}), points: prev?.points ?? 0, entries: prev?.entries ?? [], card }));
      }).catch(() => {});
    api.get('/loyalty/discounts/', { params: { customer: cid, page_size: 200 } })
      .then(r => setDiscounts(r.data?.results || r.data || []))
      .catch(() => setDiscounts([]));
    api.get('/warehouse/materials/', { params: { page_size: 500, is_active: true } })
      .then(r => setMaterials(r.data?.results || r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCustomerId) loadCustomerData(selectedCustomerId);
    else { setSummary(null); setDiscounts([]); }
  }, [selectedCustomerId, loadCustomerData]);

  const saveCfg = async (values: any) => {
    setSaving(true);
    try {
      const id = cfg?.id;
      await (id ? api.patch(`/loyalty/config/${id}/`, values) : api.patch('/loyalty/config/', values));
      message.success('Hűségprogram beállítások elmentve');
      loadCfg();
    } catch (e: any) {
      message.error(fmtError(e?.response?.data) || 'A mentés nem sikerült');
    } finally {
      setSaving(false);
    }
  };

  const adjustPoints = async () => {
    if (!selectedCustomerId || !pointDelta) return;
    try {
      await api.post('/loyalty/points/', {
        customer: selectedCustomerId, points: pointDelta,
        reason: pointDelta > 0 ? 'manual_add' : 'manual_sub', note: pointNote || 'Kézi módosítás',
      });
      message.success('Pontok rögzítve');
      setPointDelta(null); setPointNote('');
      loadCustomerData(selectedCustomerId);
    } catch (e: any) {
      message.error(fmtError(e?.response?.data) || 'A rögzítés nem sikerült');
    }
  };

  const createOrTopupCard = async () => {
    if (!selectedCustomerId || !topupAmount) return;
    try {
      const existing = summary?.card?.id;
      if (existing) {
        await api.post(`/loyalty/fuel-cards/${existing}/topup/`, { amount: topupAmount });
        message.success('Kártya feltöltve');
      } else {
        const created = await api.post('/loyalty/fuel-cards/', { customer: selectedCustomerId });
        await api.post(`/loyalty/fuel-cards/${created.data.id}/topup/`, { amount: topupAmount });
        message.success('Üzemanyagkártya létrehozva és feltöltve');
      }
      setTopupAmount(null);
      loadCustomerData(selectedCustomerId);
    } catch (e: any) {
      message.error(fmtError(e?.response?.data) || 'A művelet nem sikerült');
    }
  };

  const addDiscount = async () => {
    if (!selectedCustomerId || !newDiscount.material || !newDiscount.percent) {
      message.warning('Válassz terméket és adj meg kedvezmény százalékot');
      return;
    }
    try {
      await api.post('/loyalty/discounts/', {
        customer: selectedCustomerId, material: newDiscount.material,
        discount_percent: newDiscount.percent,
      });
      message.success('Kedvezmény hozzáadva');
      setNewDiscount({});
      loadCustomerData(selectedCustomerId);
    } catch (e: any) {
      message.error(fmtError(e?.response?.data) || 'A mentés nem sikerült ( már létezik?)');
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <Title level={4}>Hűségprogram (kassza app)</Title>
      <Text type="secondary">
        A kassza app ({window.location.protocol}//app.pixisys.eu) ügyfelei pontot gyűjtenek vásárláskor,
        megtekintik vásárlásaikat, letöltik bizonylataikat és ellenőrzik üzemanyagkártya-egyenlegüket.
        Itt kezelheted a program beállításait és az ügyfél-specifikus adatokat.
      </Text>

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'cfg',
            label: 'Beállítások',
            children: cfg ? (
              <Form layout="vertical" onFinish={saveCfg} initialValues={cfg} style={{ maxWidth: 480 }}>
                <Form.Item name="points_per_100_ft" label="Pont / 100 Ft vásárlás után"
                  extra="Pl. 1 → minden 100 Ft után 1 pont (10 000 Ft = 100 pont).">
                  <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="welcome_points" label="Üdvözlő pont regisztrációkor">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="qr_token_ttl_seconds" label="QR token élettartama (másodperc)"
                  extra="A kasszánál mutatott változó QR kód ennyi ideig érvényes.">
                  <InputNumber min={30} max={600} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>Mentés</Button>
              </Form>
            ) : <Text>Betöltés…</Text>,
          },
          {
            key: 'customers',
            label: 'Ügyfelek',
            children: (
              <>
                <Select
                  showSearch allowClear placeholder="Ügyfél keresése (név, e-mail…)"
                  filterOption={false} style={{ width: 420, marginBottom: 16 }}
                  onSearch={setCustomerQuery}
                  value={selectedCustomerId ?? undefined}
                  onChange={(v) => setSelectedCustomerId(v ?? null)}
                  notFoundContent={customerQuery ? 'Nincs találat' : 'Írj a kereséshez'}
                >
                  {customers.map((c: any) => (
                    <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                  ))}
                </Select>

                {selectedCustomerId && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                      <Card size="small" title="Hűségpontok">
                        <Statistic value={summary?.points ?? 0} suffix="pont" />
                        <Space style={{ marginTop: 12 }}>
                          <InputNumber value={pointDelta ?? undefined} placeholder="± pont"
                            onChange={(v) => setPointDelta(v)} style={{ width: 110 }} />
                          <Input value={pointNote} placeholder="Megjegyzés"
                            onChange={(e) => setPointNote(e.target.value)} style={{ width: 160 }} />
                          <Button onClick={adjustPoints} disabled={!pointDelta}>Rögzít</Button>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small" title="Üzemanyagkártya">
                        {summary?.card ? (
                          <>
                            <Text strong>{summary.card.card_number}</Text>
                            <Statistic value={summary.card.balance ?? 0} suffix="Ft" precision={0} />
                          </>
                        ) : (
                          <Text type="secondary">Nincs kártya – az első feltöltéssel létrejön.</Text>
                        )}
                        <Space style={{ marginTop: 12 }}>
                          <InputNumber value={topupAmount ?? undefined} min={1} placeholder="Feltöltés (Ft)"
                            onChange={(v) => setTopupAmount(v)} style={{ width: 140 }} />
                          <Button type="primary" onClick={createOrTopupCard} disabled={!topupAmount}>
                            {summary?.card ? 'Feltöltés' : 'Létrehozás + feltöltés'}
                          </Button>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small" title="Termékkedvezmények">
                        {discounts.map((d: any) => (
                          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span>{d.material_name} <Tag color="orange">-{Number(d.discount_percent)}%</Tag></span>
                            <Button size="small" danger onClick={() => {
                              api.delete(`/loyalty/discounts/${d.id}/`).then(() => loadCustomerData(selectedCustomerId));
                            }}>Törlés</Button>
                          </div>
                        ))}
                        <Space style={{ marginTop: 8 }}>
                          <Select
                            showSearch allowClear placeholder="Termék" style={{ width: 200 }}
                            filterOption={(inp, opt) => String(opt?.children ?? '').toLowerCase().includes(inp.toLowerCase())}
                            value={newDiscount.material}
                            onChange={(v) => setNewDiscount((p) => ({ ...p, material: v }))}
                          >
                            {materials.map((m: any) => (
                              <Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>
                            ))}
                          </Select>
                          <InputNumber min={1} max={100} placeholder="%" value={newDiscount.percent}
                            onChange={(v) => setNewDiscount((p) => ({ ...p, percent: v ?? undefined }))} style={{ width: 80 }} />
                          <Button onClick={addDiscount}>Hozzáadás</Button>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
};

const ModulesPage: React.FC = () => {
  const [config, setConfig] = useState<FuelConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [controllerForm] = Form.useForm();
  const [warehouseForm] = Form.useForm();

  // nézeti adatok
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [grades, setGrades] = useState<FuelGrade[]>([]);
  const [pumps, setPumps] = useState<FuelPump[]>([]);
  const [totalsLogs, setTotalsLogs] = useState<TotalsLog[]>([]);
  const [transactions, setTransactions] = useState<FuelTransactionRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { data } = await api.get('/fuel/config/');
      setConfig(data);
      controllerForm.setFieldsValue({
        controller_url: data.controller_url,
        auth_type: data.auth_type,
        username: data.username,
        password: data.password,
        request_timeout: data.request_timeout,
        poll_interval: data.poll_interval,
        auto_sync_prices: data.auto_sync_prices,
        auto_close_transaction: data.auto_close_transaction,
      });
      warehouseForm.setFieldsValue({ fuel_warehouse: data.fuel_warehouse ?? undefined });
    } catch {
      message.error('A modul beállítások betöltése nem sikerült');
    } finally {
      setConfigLoading(false);
    }
  }, [controllerForm, warehouseForm]);

  const fetchData = useCallback(async () => {
    if (!config?.enabled) return;
    setDataLoading(true);
    try {
      const [whRes, matRes, gradeRes, pumpRes] = await Promise.all([
        api.get('/warehouse/warehouses/', { params: { page_size: 5000 } }),
        api.get('/warehouse/materials/', { params: { page_size: 5000, is_active: true } }),
        api.get('/fuel/fuel-grades/'),
        api.get('/fuel/pumps/'),
      ]);
      setWarehouses(whRes.data?.results || whRes.data || []);
      setMaterials(matRes.data?.results || matRes.data || []);
      setGrades(gradeRes.data?.results || gradeRes.data || []);
      setPumps(pumpRes.data?.results || pumpRes.data || []);
    } catch {
      message.error('A benzinkút modul adatainak betöltése nem sikerült');
    } finally {
      setDataLoading(false);
    }
  }, [config?.enabled]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleModule = async (enabled: boolean) => {
    if (!config) return;
    setToggling(true);
    try {
      await api.patch(`/fuel/config/${config.id}/`, { enabled });
      setConfig({ ...config, enabled });
      message.success(enabled ? 'Benzinkút modul engedélyezve' : 'Benzinkút modul kikapcsolva');
      if (enabled) fetchData();
    } catch {
      message.error('A módosítás nem sikerült');
    } finally {
      setToggling(false);
    }
  };

  const saveControllerSettings = async (values: any) => {
    if (!config) return;
    try {
      await api.patch(`/fuel/config/${config.id}/`, values);
      message.success('Beállítások elmentve');
      fetchConfig();
    } catch {
      message.error('A mentés nem sikerült');
    }
  };

  const testConnection = async () => {
    const values = await controllerForm.validateFields();
    if (!config) return;
    try {
      await api.patch(`/fuel/config/${config.id}/`, values);
      const { data } = await api.post('/fuel/config/test_connection/', {});
      const info = data?.controller || {};
      Modal.success({
        title: 'A kapcsolat működik',
        width: 640,
        content: (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {JSON.stringify(info, null, 2)}
          </div>
        ),
      });
    } catch (error: any) {
      Modal.error({
        title: 'A kapcsolat nem jött létre',
        content: error?.response?.data?.error || 'Ismeretlen hiba',
      });
    }
  };

  const showControllerConfiguration = async () => {
    try {
      const { data } = await api.get('/fuel/config/controller_configuration/');
      Modal.info({
        title: 'PTS-2 vezérlő konfigurációja',
        width: 720,
        content: (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 480, overflow: 'auto' }}>
            {JSON.stringify(data, null, 2)}
          </div>
        ),
      });
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A konfiguráció lekérése nem sikerült');
    }
  };

  const saveWarehouse = async (values: any) => {
    if (!config) return;
    try {
      await api.patch(`/fuel/config/${config.id}/`, { fuel_warehouse: values.fuel_warehouse ?? null });
      message.success('Üzemanyag raktár beállítva');
      fetchConfig();
    } catch {
      message.error('A mentés nem sikerült');
    }
  };

  const createFuelWarehouse = async () => {
    try {
      const { data } = await api.post('/fuel/config/create_fuel_warehouse/', {});
      message.success(data?.message || 'Üzemanyag raktár létrehozva');
      await fetchConfig();
      const whRes = await api.get('/warehouse/warehouses/', { params: { page_size: 5000 } });
      setWarehouses(whRes.data?.results || whRes.data || []);
      warehouseForm.setFieldsValue({ fuel_warehouse: data?.warehouse?.id });
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A létrehozás nem sikerült');
    }
  };

  const syncPrices = async () => {
    try {
      const { data } = await api.post('/fuel/config/sync_prices/', {});
      message.success(data?.message || 'Árak szinkronizálva');
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Az árszinkronizáció nem sikerült');
    }
  };

  // --------------------------------------------------------- Tab: Termékek

  const [gradeModal, setGradeModal] = useState<{ editing: FuelGrade | null } | null>(null);
  const [gradeForm] = Form.useForm();

  const openGrade = async (editing: FuelGrade | null) => {
    let currentGrades = grades;
    if (!editing && !currentGrades.length) {
      // A lista még nem töltődött be: kérjük le, hogy a következő szabad ID-t tudjuk ajánlani
      try {
        const { data } = await api.get('/fuel/fuel-grades/');
        currentGrades = data?.results || data || [];
        setGrades(currentGrades);
      } catch { /* az alapértelmezett ID marad */ }
    }
    gradeForm.resetFields();
    gradeForm.setFieldsValue({
      fuel_grade_id: editing?.fuel_grade_id ?? nextFreeId(currentGrades.map((g) => g.fuel_grade_id), 1, 20),
      name: editing?.name ?? '',
      material: editing?.material ?? undefined,
      is_active: editing?.is_active ?? true,
    });
    setGradeModal({ editing });
  };

  const saveGrade = async (values: any) => {
    const editing = gradeModal?.editing;
    try {
      if (editing) {
        await api.put(`/fuel/fuel-grades/${editing.id}/`, values);
      } else {
        await api.post('/fuel/fuel-grades/', values);
      }
      message.success('Üzemanyag fajta elmentve');
      setGradeModal(null);
      fetchData();
    } catch (error: any) {
      message.error(fmtError(error?.response?.data) || 'A mentés nem sikerült');
    }
  };

  const deleteGrade = async (grade: FuelGrade) => {
    try {
      await api.delete(`/fuel/fuel-grades/${grade.id}/`);
      message.success('Törölve');
      fetchData();
    } catch {
      message.error('A törlés nem sikerült (használatban lehet)');
    }
  };

  // --------------------------------------------------------- Tab: Kútfejek

  const [pumpModal, setPumpModal] = useState<{ editing: FuelPump | null } | null>(null);
  const [pumpForm] = Form.useForm();

  const openPump = async (editing: FuelPump | null) => {
    let currentPumps = pumps;
    if (!editing && !currentPumps.length) {
      try {
        const { data } = await api.get('/fuel/pumps/');
        currentPumps = data?.results || data || [];
        setPumps(currentPumps);
      } catch { /* az alapértelmezett kútszám marad */ }
    }
    pumpForm.resetFields();
    pumpForm.setFieldsValue({
      pump_id: editing?.pump_id ?? nextFreeId(currentPumps.map((p) => p.pump_id), 1, 100),
      name: editing?.name ?? '',
      is_active: editing?.is_active ?? true,
      nozzles: editing?.nozzles?.map((n) => ({ nozzle_number: n.nozzle_number, fuel_grade: n.fuel_grade }))
        ?? [{ nozzle_number: 1, fuel_grade: undefined }],
    });
    setPumpModal({ editing });
  };

  const savePump = async (values: any) => {
    const editing = pumpModal?.editing;
    const payload = {
      ...values,
      nozzles: (values.nozzles || []).map((n: any) => ({
        nozzle_number: n.nozzle_number,
        fuel_grade: n.fuel_grade ?? null,
      })),
    };
    try {
      if (editing) {
        await api.put(`/fuel/pumps/${editing.id}/`, payload);
      } else {
        await api.post('/fuel/pumps/', payload);
      }
      message.success('Kútfej elmentve');
      setPumpModal(null);
      fetchData();
    } catch (error: any) {
      message.error(fmtError(error?.response?.data) || 'A mentés nem sikerült');
    }
  };

  const deletePump = async (pump: FuelPump) => {
    try {
      await api.delete(`/fuel/pumps/${pump.id}/`);
      message.success('Törölve');
      fetchData();
    } catch {
      message.error('A törlés nem sikerült (használatban lehet)');
    }
  };

  // --------------------------------------------------------- Tab: Kútórák

  const fetchTotalsLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/fuel/totals-logs/', { params: { page_size: 100 } });
      setTotalsLogs(data?.results || data || []);
    } catch {
      // csendben – első betöltés
    }
  }, []);

  useEffect(() => { if (config?.enabled) fetchTotalsLogs(); }, [config?.enabled, fetchTotalsLogs]);

  const readPumpTotals = async (pump: FuelPump) => {
    try {
      const { data } = await api.post(`/fuel/pumps/${pump.id}/read_totals/`, {});
      message.success(data?.message || 'Kútóra kiolvasás elindítva');
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A kiolvasás nem sikerült');
    }
  };

  const readStoredTotals = async (pump: FuelPump) => {
    try {
      const { data } = await api.get(`/fuel/pumps/${pump.id}/last_saved_totals/`);
      const rows = data?.nozzles || [];
      if (!rows.length) {
        message.info('A vezérlő memóriájában nincs tárolt óraállás.');
      } else {
        Modal.info({
          title: `${pump.name || pump.pump_id + '. kút'} – vezérlőben tárolt órák`,
          content: (
            <div>
              {rows.map((r: any) => (
                <div key={r.id}>
                  {r.nozzle_number}. pisztoly: <strong>{Number(r.volume_total).toLocaleString('hu-HU')} l</strong>
                  {' / '}{Number(r.amount_total).toLocaleString('hu-HU')} Ft
                </div>
              ))}
            </div>
          ),
        });
      }
      fetchTotalsLogs();
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A kiolvasás nem sikerült');
    }
  };

  // ----------------------------------------------------------- Tab: Napló

  const [logRange, setLogRange] = useState<{ from: string; to: string }>({
    from: dayjs().format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD'),
  });
  const [ptsReport, setPtsReport] = useState<any[] | null>(null);

  const fetchTransactions = useCallback(async (from?: string, to?: string) => {
    try {
      const params: Record<string, any> = { page_size: 200 };
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const { data } = await api.get('/fuel/transactions/', { params });
      setTransactions(data?.results || data || []);
    } catch {
      message.error('A kút tranzakciók betöltése nem sikerült');
    }
  }, []);

  useEffect(() => { if (config?.enabled) fetchTransactions(logRange.from, logRange.to); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config?.enabled]);

  const fetchPtsReport = async () => {
    try {
      const { data } = await api.post('/fuel/transactions/pts_report/', {
        date_from: `${logRange.from}T00:00:00`,
        date_to: `${logRange.to}T23:59:59`,
      });
      setPtsReport(data?.transactions || []);
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'A vezérlői napló kiolvasása nem sikerült');
    }
  };

  // ------------------------------------------------------------- render

  const gradeColumns = [
    { title: 'Fuel Grade ID', dataIndex: 'fuel_grade_id', key: 'fuel_grade_id', width: 120 },
    { title: 'Név', dataIndex: 'name', key: 'name' },
    {
      title: 'Termék', key: 'material',
      render: (_: any, row: FuelGrade) => row.material
        ? `${row.material_name} (${row.material_code})` : <Text type="warning">nincs rendelve</Text>,
    },
    {
      title: 'Bruttó ár', key: 'price',
      render: (_: any, row: FuelGrade) => row.gross_price != null
        ? `${row.gross_price.toLocaleString('hu-HU')} Ft/${row.material_unit || 'liter'}` : '—',
    },
    { title: 'Aktív', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => v ? <Tag color="green">Aktív</Tag> : <Tag>Inaktív</Tag> },
    {
      title: 'Művelet', key: 'actions',
      render: (_: any, row: FuelGrade) => (
        <Space>
          <Button size="small" onClick={() => openGrade(row)}>Szerkesztés</Button>
          <Popconfirm title="Biztosan törlöd?" onConfirm={() => deleteGrade(row)}>
            <Button size="small" danger>Törlés</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const pumpColumns = [
    { title: 'Kút száma', dataIndex: 'pump_id', key: 'pump_id', width: 100 },
    { title: 'Név', dataIndex: 'name', key: 'name' },
    {
      title: 'Pisztolyok', key: 'nozzles',
      render: (_: any, row: FuelPump) => (
        <span>
          {(row.nozzles || []).map((n) => {
            const grade = grades.find((g) => g.id === n.fuel_grade);
            return (
              <Tag key={n.nozzle_number}>
                {n.nozzle_number}. pisztoly: {grade?.name || '—'}
              </Tag>
            );
          })}
        </span>
      ),
    },
    { title: 'Aktív', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => v ? <Tag color="green">Aktív</Tag> : <Tag>Inaktív</Tag> },
    {
      title: 'Művelet', key: 'actions',
      render: (_: any, row: FuelPump) => (
        <Space>
          <Button size="small" onClick={() => openPump(row)}>Szerkesztés</Button>
          <Popconfirm title="Biztosan törlöd?" onConfirm={() => deletePump(row)}>
            <Button size="small" danger>Törlés</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const totalsColumns = [
    { title: 'Kút', dataIndex: 'pump_name', key: 'pump_name' },
    { title: 'Pisztoly', dataIndex: 'nozzle_number', key: 'nozzle_number', width: 70 },
    { title: 'Fajta', dataIndex: 'fuel_grade_name', key: 'fuel_grade_name', render: (v: string) => v || '—' },
    { title: 'Ömlési óra (l)', dataIndex: 'volume_total', key: 'volume_total', render: (v: string) => Number(v).toLocaleString('hu-HU') },
    { title: 'Pénz óra (Ft)', dataIndex: 'amount_total', key: 'amount_total', render: (v: string) => Number(v).toLocaleString('hu-HU') },
    { title: 'Forrás', dataIndex: 'source_display', key: 'source_display' },
    { title: 'Idő', dataIndex: 'read_at', key: 'read_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
  ];

  const transactionColumns = [
    { title: 'Idő', dataIndex: 'created_at', key: 'created_at', render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
    { title: 'Kút', dataIndex: 'pump_name', key: 'pump_name' },
    { title: 'Pisztoly', dataIndex: 'nozzle_number', key: 'nozzle_number', width: 60 },
    { title: 'Fajta', dataIndex: 'fuel_grade_name', key: 'fuel_grade_name', render: (v: string) => v || '—' },
    { title: 'Mennyiség (l)', dataIndex: 'volume', key: 'volume', render: (v: string) => Number(v).toLocaleString('hu-HU') },
    { title: 'Összeg (Ft)', dataIndex: 'amount', key: 'amount', render: (v: string) => Number(v).toLocaleString('hu-HU') },
    { title: 'Állapot', dataIndex: 'state_display', key: 'state_display' },
    { title: 'POS bizonylat', dataIndex: 'pos_transaction_number', key: 'pos_transaction_number', render: (v: string) => v || '—' },
  ];

  if (!config) {
    return <Card title="Modulok" loading={configLoading} />;
  }

  return (
    <Card title="Modulok">
      {/* Modul lista */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={8}>
          <Card
            size="small"
            title={<Space><ThunderboltOutlined />Benzinkút modul</Space>}
            extra={
              <Switch
                checked={config.enabled}
                loading={toggling}
                onChange={toggleModule}
                checkedChildren="Bekapcsolva"
                unCheckedChildren="Kikapcsolva"
              />
            }
          >
            <Text type="secondary">
              Technotrade PTS-2 kútvezérlő (jsonPTS protokoll) és GB-4 interfészen
              csatlakozó kútfejek kezelése. Termék+mennyiség átvétel, preset engedélyezés,
              kútzárás (nullázás), kútórák kiolvasása, külön üzemanyag raktárral.
            </Text>
          </Card>
        </Col>
      </Row>

      {!config.enabled && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="A benzinkút modul jelenleg ki van kapcsolva."
          description="A modul bekapcsolása után itt érhetők el a beállítások (PTS-2 vezérlő, üzemanyag raktár, termékek, kútfejek), és a POS regisztráció oldalán POS-hoz is hozzárendelhető."
        />
      )}

      {config.enabled && (
        <Tabs
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'controller',
              label: 'PTS-2 vezérlő',
              children: (
                <Form
                  form={controllerForm}
                  layout="vertical"
                  onFinish={saveControllerSettings}
                  style={{ maxWidth: 640 }}
                >
                  <Form.Item
                    name="controller_url" label="Vezérlő címe"
                    rules={[{ required: true, message: 'Kötelező' }]}
                    extra="A PTS-2 web címe. HTTPS (DIP-1 OFF) esetén önaláírt tanúsítványt használ."
                  >
                    <Input placeholder="http://192.168.1.117" />
                  </Form.Item>
                  <Space size={16} style={{ display: 'flex' }}>
                    <Form.Item name="auth_type" label="Autentikáció" style={{ minWidth: 280 }}>
                      <Select>
                        <Select.Option value="digest">Digest (DIP-2 OFF)</Select.Option>
                        <Select.Option value="basic">Basic (DIP-2 ON)</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="username" label="Felhasználónév" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="password" label="Jelszó" rules={[{ required: true }]}>
                      <Input.Password />
                    </Form.Item>
                  </Space>
                  <Space size={16} style={{ display: 'flex' }}>
                    <Form.Item name="request_timeout" label="Kérés időkorlát (mp)">
                      <InputNumber min={1} max={60} />
                    </Form.Item>
                    <Form.Item name="poll_interval" label="Állapotlekérdezés gyakorisága (mp)">
                      <InputNumber min={1} max={60} />
                    </Form.Item>
                  </Space>
                  <Form.Item name="auto_sync_prices" valuePropName="checked" label="Árak automatikus szinkronizálása a vezérlőre">
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    name="auto_close_transaction" valuePropName="checked"
                    label="Kút tranzakció automatikus lezárása (nullázás) fizetés után"
                  >
                    <Switch />
                  </Form.Item>
                  <Space>
                    <Button type="primary" icon={<SaveOutlined />} htmlType="submit">Mentés</Button>
                    <Button icon={<ApiOutlined />} onClick={testConnection}>Kapcsolat teszt</Button>
                    <Button icon={<CloudDownloadOutlined />} onClick={showControllerConfiguration}>
                      Vezérlő konfiguráció
                    </Button>
                  </Space>
                </Form>
              ),
            },
            {
              key: 'warehouse',
              label: 'Üzemanyag raktár',
              children: (
                <div style={{ maxWidth: 640 }}>
                  <Form form={warehouseForm} layout="vertical" onFinish={saveWarehouse}>
                    <Form.Item
                      name="fuel_warehouse" label="Üzemanyag raktár"
                      extra="Ebbe a raktárba kell vételezni az üzemanyagot; az eladott mennyiség automatikusan innen kerül levonásra (FIFO)."
                    >
                      <Select allowClear placeholder="Válassz raktárat">
                        {warehouses.map((wh) => (
                          <Select.Option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Space>
                      <Button type="primary" icon={<SaveOutlined />} htmlType="submit">Mentés</Button>
                      <Popconfirm
                        title="Létrehozol egy új üzemanyag raktárat?"
                        onConfirm={createFuelWarehouse}
                      >
                        <Button icon={<PlusOutlined />}>Új üzemanyag raktár létrehozása</Button>
                      </Popconfirm>
                    </Space>
                  </Form>
                  <Alert
                    style={{ marginTop: 16 }}
                    type="info" showIcon
                    message="A bevételezés a megszokott módon történik: kassza → Adminisztráció → Bevételezés, vagy Raktár → Bevételezések oldalalon, az üzemanyag raktár kiválasztásával."
                  />
                </div>
              ),
            },
            {
              key: 'grades',
              label: 'Termékek',
              children: (
                <>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openGrade(null)} style={{ marginBottom: 12 }}>
                    Új üzemanyag fajta
                  </Button>
                  <Table
                    rowKey="id" size="small" loading={dataLoading}
                    dataSource={grades} columns={gradeColumns as any} pagination={false}
                  />
                </>
              ),
            },
            {
              key: 'pumps',
              label: 'Kútfejek',
              children: (
                <>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openPump(null)} style={{ marginBottom: 12 }}>
                    Új kútfej
                  </Button>
                  <Table
                    rowKey="id" size="small" loading={dataLoading}
                    dataSource={pumps} columns={pumpColumns as any} pagination={false}
                  />
                </>
              ),
            },
            {
              key: 'prices',
              label: 'Árak',
              children: (
                <div style={{ maxWidth: 720 }}>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<SyncOutlined />} onClick={syncPrices}>
                      Árak küldése a PTS-2 vezérlőre
                    </Button>
                    <Text type="secondary">
                      Az ár a termék bruttó eladási árából számolódik (akciós ár esetén az akciós).
                    </Text>
                  </Space>
                  <Table
                    rowKey="id" size="small" loading={dataLoading} pagination={false}
                    dataSource={grades}
                    columns={[
                      { title: 'Fuel Grade ID', dataIndex: 'fuel_grade_id', width: 120 },
                      { title: 'Fajta', dataIndex: 'name' },
                      {
                        title: 'Bruttó ár', key: 'price',
                        render: (_: any, row: FuelGrade) => row.gross_price != null
                          ? `${row.gross_price.toLocaleString('hu-HU')} Ft/${row.material_unit || 'liter'}` : '—',
                      },
                    ] as any}
                  />
                </div>
              ),
            },
            {
              key: 'totals',
              label: 'Kútórák',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    {pumps.map((pump) => (
                      <Space key={pump.id} style={{ border: '1px solid #f0f0f0', padding: '4px 8px', borderRadius: 4 }}>
                        <Text strong>{pump.name || `${pump.pump_id}. kút`}</Text>
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => readPumpTotals(pump)}>
                          Órakiolvasás (kútból)
                        </Button>
                        <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => readStoredTotals(pump)}>
                          Tárolt órák
                        </Button>
                      </Space>
                    ))}
                  </Space>
                  <Table
                    rowKey="id" size="small"
                    dataSource={totalsLogs} columns={totalsColumns as any}
                    pagination={{ pageSize: 10 }}
                  />
                </>
              ),
            },
            {
              key: 'log',
              label: 'Napló',
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Input
                      type="date" value={logRange.from}
                      onChange={(e) => setLogRange((r) => ({ ...r, from: e.target.value }))}
                    />
                    <Input
                      type="date" value={logRange.to}
                      onChange={(e) => setLogRange((r) => ({ ...r, to: e.target.value }))}
                    />
                    <Button onClick={() => fetchTransactions(logRange.from, logRange.to)}>Szűrés</Button>
                    <Button icon={<CloudDownloadOutlined />} onClick={fetchPtsReport}>
                      Vezérlői napló kiolvasása
                    </Button>
                  </Space>
                  <Table
                    rowKey="id" size="small"
                    dataSource={transactions} columns={transactionColumns as any}
                    pagination={{ pageSize: 15 }}
                  />
                  <Modal
                    title={`PTS-2 vezérlői tranzakciónapló (${logRange.from} – ${logRange.to})`}
                    open={ptsReport !== null}
                    onCancel={() => setPtsReport(null)}
                    footer={null}
                    width={900}
                  >
                    <Table
                      rowKey={(r: any, i: any) => `${r.Pump}-${r.Transaction}-${i}`}
                      size="small" pagination={false} scroll={{ y: 400 }}
                      dataSource={ptsReport || []}
                      columns={[
                        { title: 'Idő', dataIndex: 'DateTime', render: (v: string) => v?.replace('T', ' ') },
                        { title: 'Kút', dataIndex: 'Pump', width: 60 },
                        { title: 'Pisztoly', dataIndex: 'Nozzle', width: 60 },
                        { title: 'Fajta', dataIndex: 'FuelGradeName' },
                        { title: 'Mennyiség', dataIndex: 'Volume' },
                        { title: 'Összeg', dataIndex: 'Amount' },
                        { title: 'Óra (l)', dataIndex: 'TotalVolume' },
                      ] as any}
                    />
                  </Modal>
                </>
              ),
            },
          ]}
        />
      )}

      {/* Üzemanyag fajta modal */}
      <Modal
        title={gradeModal?.editing ? 'Üzemanyag fajta szerkesztése' : 'Új üzemanyag fajta'}
        open={!!gradeModal}
        onCancel={() => setGradeModal(null)}
        onOk={() => gradeForm.submit()}
        okText="Mentés" cancelText="Mégse"
        destroyOnClose
      >
        <Form form={gradeForm} layout="vertical" onFinish={saveGrade}>
          <Form.Item
            name="fuel_grade_id" label="Fuel Grade ID (PTS-2)"
            rules={[{ required: true }, { type: 'number', min: 1, max: 20 }]}
            extra="A PTS-2 vezérlőben beállított azonosító (1-20)."
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="name" label="Név" rules={[{ required: true }]}>
            <Input placeholder="Pl. Benzin 95, Gázolaj, Prémium benzin, LPG" />
          </Form.Item>
          <Form.Item
            name="material" label="Termék"
            rules={[{ required: true, message: 'Válassz hozzá terméket' }]}
            extra="A termék bruttó egységára lesz a kúti ár; a készlet is erre a termékre vonatkozik."
          >
            <Select
              showSearch optionFilterProp="children"
              placeholder="Válassz terméket"
            >
              {materials.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  {m.name} ({m.code}) [{m.unit}]
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Kútfej modal */}
      <Modal
        title={pumpModal?.editing ? 'Kútfej szerkesztése' : 'Új kútfej'}
        open={!!pumpModal}
        onCancel={() => setPumpModal(null)}
        onOk={() => pumpForm.submit()}
        okText="Mentés" cancelText="Mégse"
        destroyOnClose
        width={640}
      >
        <Form form={pumpForm} layout="vertical" onFinish={savePump}>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="pump_id" label="Kút száma (PTS-2)"
              rules={[{ required: true }, { type: 'number', min: 1, max: 100 }]}
              extra="A vezérlőben beállított logikai kút azonosító."
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="name" label="Megjelenő név" style={{ flex: 1 }}>
              <Input placeholder="Pl. 1. kút" />
            </Form.Item>
            <Form.Item name="is_active" label="Aktív" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="Pisztolyok és üzemanyag fajták" required>
            <Form.List name="nozzles">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} style={{ display: 'flex', marginBottom: 4 }} align="baseline">
                      <Form.Item
                        name={[field.name, 'nozzle_number']}
                        rules={[{ required: true }, { type: 'number', min: 1, max: 6 }]}
                        noStyle
                      >
                        <InputNumber min={1} max={6} placeholder="Pisztoly" style={{ width: 80 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'fuel_grade']}
                        noStyle
                      >
                        <Select
                          allowClear placeholder="Üzemanyag fajta" style={{ width: 300 }}
                        >
                          {grades.map((g) => (
                            <Select.Option key={g.id} value={g.id}>
                              {g.fuel_grade_id} – {g.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Button danger onClick={() => remove(field.name)}>Törlés</Button>
                    </Space>
                  ))}
                  <Button
                    type="dashed" icon={<PlusOutlined />} block
                    onClick={() => add({ nozzle_number: fields.length + 1 })}
                  >
                    Pisztoly hozzáadása
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>

      <LoyaltySection />
    </Card>
  );
};

export default ModulesPage;
