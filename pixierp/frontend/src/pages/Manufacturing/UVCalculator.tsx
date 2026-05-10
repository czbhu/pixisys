import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Form, InputNumber, Select, Button, Divider, Space,
  message, Row, Col, Statistic, Tag, Spin, Alert, Table, Switch,
  Typography, Tooltip,
} from 'antd';
import {
  CalculatorOutlined, InfoCircleOutlined, ExperimentOutlined,
  AppstoreOutlined, RollbackOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;
const { Title, Text } = Typography;

// ─── Típusok ────────────────────────────────────────────────────────────────

interface Machine {
  id: number;
  name: string;
  tech_type: string;
  tech_type_display: string;
  max_width_mm: number | null;
  max_height_mm: number | null;
  hourly_cost: number;
  setup_time_min: number;
  print_cost_per_m2: number;
  speed_m2_per_hour: number | null;
  is_active: boolean;
}

interface Material {
  id: number;
  name: string;
  code: string;
  unit: string;
  material_format: string;
  width: number | null;
  length: number | null;
  roll_width: number | null;
  dimension_unit: string;
  unit_cost_price: number;
  material_group_name: string | null;
}

interface Service {
  id: number;
  name: string;
  unit_cost_price: number;
  unit_selling_price: number;
  pricing_type: string;
}

interface RemnantPreview {
  width_mm: number;
  height_mm: number | null;
  type: string;
  note: string;
}

interface CostBreakdown {
  material_cost: number;
  print_cost: number;
  setup_cost: number;
  service_cost: number;
  subtotal: number;
  margin_pct: number;
  total: number;
  unit_price: number;
  quantity: number;
}

interface CalcResult {
  machine: { id: number; name: string; tech_type: string };
  material: { name: string; format: string; cost_per_m2: number };
  layout: {
    cols?: number;
    rows?: number;
    rotated?: boolean;
    fit_count?: number;
    utilization_pct?: number;
    side_remnant_mm?: number;
    length_per_row_mm?: number;
    sheet_area_mm2?: number;
    used_area_mm2?: number;
    remnants?: { width_mm: number; height_mm: number }[];
  };
  sheets_needed: number | null;
  roll_length_mm: number | null;
  remnant_preview: RemnantPreview[];
  cost_breakdown: CostBreakdown;
  service_breakdown: { id: number; name: string; total: number }[];
}

// ─── Segédfüggvények ─────────────────────────────────────────────────────────

const fmt = (n: number, dec = 0) =>
  n.toLocaleString('hu-HU', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtHuf = (n: number) => `${fmt(n, 0)} Ft`;

const TECH_COLORS: Record<string, string> = {
  uv_flatbed: 'purple',
  uv_roll: 'blue',
  digital_sheet: 'green',
  screen: 'orange',
  pad: 'red',
  other: 'default',
};

// ─── Főkomponens ─────────────────────────────────────────────────────────────

const UVCalculator: React.FC = () => {
  const [form] = Form.useForm();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [autoCalc, setAutoCalc] = useState(false);

  // ── Adatbetöltés ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/printshop/machines/?active=1'),
      api.get('/warehouse/materials/?is_active=true&material_format=sheet,roll,linear&page_size=500'),
      api.get('/manufacturing/services/?page_size=200'),
    ])
      .then(([mach, mat, svc]) => {
        setMachines(mach.data?.results ?? mach.data);
        const matData = mat.data?.results ?? mat.data;
        setMaterials(Array.isArray(matData) ? matData : []);
        const svcData = svc.data?.results ?? svc.data;
        setServices(Array.isArray(svcData) ? svcData : []);
      })
      .catch(() => message.error('Adatbetöltés sikertelen'))
      .finally(() => setLoading(false));
  }, []);

  // ── Gép kiválasztás ────────────────────────────────────────────────────────
  const handleMachineChange = (id: number) => {
    const m = machines.find((x) => x.id === id) || null;
    setSelectedMachine(m);
    setResult(null);
  };

  // ── Kalkuláció ────────────────────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    try {
      const vals = await form.validateFields();
      setCalcLoading(true);
      setResult(null);
      const resp = await api.post('/printshop/uv-calculator/calculate/', {
        machine_id: vals.machine_id,
        material_id: vals.material_id || null,
        width_mm: vals.width_mm,
        height_mm: vals.height_mm,
        quantity: vals.quantity,
        bleed_mm: vals.bleed_mm ?? 0,
        margin_pct: vals.margin_pct ?? 0,
        finishing_service_ids: vals.finishing_service_ids ?? [],
      });
      setResult(resp.data);
    } catch (e: any) {
      if (e?.response?.data?.error) {
        message.error(e.response.data.error);
      } else if (!e?.errorFields) {
        message.error('Kalkuláció sikertelen');
      }
    } finally {
      setCalcLoading(false);
    }
  }, [form]);

  // Auto-calc
  const handleValuesChange = useCallback(() => {
    if (autoCalc) handleCalculate();
  }, [autoCalc, handleCalculate]);

  // ── Maradék mentés ────────────────────────────────────────────────────────
  const handleSaveRemnant = async (r: RemnantPreview) => {
    const vals = form.getFieldsValue();
    const warehouses = await api.get('/warehouse/warehouses/?page_size=50');
    const whList = warehouses.data?.results ?? warehouses.data;
    const firstWh = whList?.[0]?.id;
    if (!firstWh) { message.error('Nincs raktár'); return; }
    try {
      await api.post('/warehouse/material-remnants/', {
        material: vals.material_id,
        warehouse: firstWh,
        width_mm: r.width_mm,
        height_mm: r.height_mm ?? null,
        quantity: 1,
        source_job_ref: `UV Kalkulátor (${vals.width_mm}×${vals.height_mm} mm, ${vals.quantity} db)`,
      });
      message.success('Maradék elmentve a raktárba');
    } catch {
      message.error('Mentés sikertelen');
    }
  };

  // ── Renderelés ─────────────────────────────────────────────────────────────
  const isRoll = selectedMachine?.tech_type === 'uv_roll';
  const isFlatbed = selectedMachine?.tech_type === 'uv_flatbed';

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <ExperimentOutlined style={{ marginRight: 8 }} />
        UV Nyomtató Kalkulátor
      </Title>

      <Spin spinning={loading}>
        <Row gutter={24}>
          {/* ── Bevitel ── */}
          <Col xs={24} lg={10}>
            <Card
              title="Kalkuláció paraméterei"
              extra={
                <Space>
                  <Text type="secondary">Auto</Text>
                  <Switch size="small" checked={autoCalc} onChange={setAutoCalc} />
                </Space>
              }
            >
              <Form
                form={form}
                layout="vertical"
                onValuesChange={handleValuesChange}
                initialValues={{ quantity: 1, bleed_mm: 0, margin_pct: 30 }}
              >
                {/* Gép */}
                <Form.Item
                  label="Gép"
                  name="machine_id"
                  rules={[{ required: true, message: 'Kötelező' }]}
                >
                  <Select
                    showSearch
                    placeholder="Válassz gépet..."
                    onChange={handleMachineChange}
                    optionFilterProp="children"
                  >
                    {['uv_flatbed', 'uv_roll', 'digital_sheet', 'screen', 'pad', 'other'].map((tech) => {
                      const group = machines.filter((m) => m.tech_type === tech);
                      if (!group.length) return null;
                      const labels: Record<string, string> = {
                        uv_flatbed: 'UV Táblás', uv_roll: 'UV Tekercses',
                        digital_sheet: 'Íves Digitális', screen: 'Szita',
                        pad: 'Tampon', other: 'Egyéb',
                      };
                      return (
                        <Select.OptGroup key={tech} label={labels[tech] ?? tech}>
                          {group.map((m) => (
                            <Option key={m.id} value={m.id}>{m.name}</Option>
                          ))}
                        </Select.OptGroup>
                      );
                    })}
                  </Select>
                </Form.Item>

                {selectedMachine && (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={
                      <Space wrap>
                        <Tag color={TECH_COLORS[selectedMachine.tech_type]}>
                          {selectedMachine.tech_type_display}
                        </Tag>
                        {selectedMachine.max_width_mm && (
                          <Text type="secondary">
                            Max: {selectedMachine.max_width_mm}×{selectedMachine.max_height_mm} mm
                          </Text>
                        )}
                        <Text type="secondary">
                          Rezsi: {fmtHuf(selectedMachine.hourly_cost)}/óra
                        </Text>
                        <Text type="secondary">
                          Nyomtatás: {fmtHuf(selectedMachine.print_cost_per_m2)}/m²
                        </Text>
                      </Space>
                    }
                  />
                )}

                {/* Alapanyag */}
                <Form.Item label="Alapanyag" name="material_id">
                  <Select
                    showSearch
                    allowClear
                    placeholder="Opcionális – ha nincs, m² alapon számol"
                    optionFilterProp="label"
                    options={materials.map((m) => ({
                      value: m.id,
                      label: `${m.name} (${m.code})`,
                    }))}
                  />
                </Form.Item>

                <Divider>Termék mérete</Divider>

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      label="Szélesség (mm)"
                      name="width_mm"
                      rules={[{ required: true, message: 'Kötelező' }]}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Magasság (mm)"
                      name="height_mm"
                      rules={[{ required: true, message: 'Kötelező' }]}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item label="Darabszám" name="quantity">
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label={
                        <Tooltip title="Minden oldalon hozzáadott vérzés mm-ben">
                          Vérzés (mm) <InfoCircleOutlined />
                        </Tooltip>
                      }
                      name="bleed_mm"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Fedezet (%)" name="margin_pct">
                      <InputNumber min={0} max={200} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                {/* Utómunka */}
                <Form.Item label="Utómunka / Kiegészítő szolgáltatások" name="finishing_service_ids">
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    placeholder="Opcionális..."
                    optionFilterProp="label"
                    options={services.map((s) => ({
                      value: s.id,
                      label: `${s.name}`,
                    }))}
                  />
                </Form.Item>

                <Button
                  type="primary"
                  icon={<CalculatorOutlined />}
                  block
                  size="large"
                  onClick={handleCalculate}
                  loading={calcLoading}
                >
                  Számítás
                </Button>
              </Form>
            </Card>
          </Col>

          {/* ── Eredmény ── */}
          <Col xs={24} lg={14}>
            {calcLoading && (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin size="large" />
              </div>
            )}

            {result && !calcLoading && (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>

                {/* Összesítő */}
                <Card title="Árkalkuláció">
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic
                        title="Egységár"
                        value={result.cost_breakdown.unit_price}
                        suffix="Ft"
                        precision={2}
                        valueStyle={{ color: '#1677ff', fontSize: 24 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={`Végösszeg (${result.cost_breakdown.quantity} db)`}
                        value={result.cost_breakdown.total}
                        suffix="Ft"
                        precision={0}
                        valueStyle={{ color: '#52c41a', fontSize: 24 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="Fedezet"
                        value={result.cost_breakdown.margin_pct}
                        suffix="%"
                        precision={1}
                      />
                    </Col>
                  </Row>

                  <Divider style={{ margin: '12px 0' }} />

                  <Row gutter={12}>
                    {[
                      { label: 'Anyag', value: result.cost_breakdown.material_cost },
                      { label: 'Nyomtatás', value: result.cost_breakdown.print_cost },
                      { label: 'Beállítás', value: result.cost_breakdown.setup_cost },
                      { label: 'Utómunka', value: result.cost_breakdown.service_cost },
                      { label: 'Részösszeg', value: result.cost_breakdown.subtotal, bold: true },
                    ].map(({ label, value, bold }) => (
                      <Col span={24} key={label} style={{ marginBottom: 4 }}>
                        <Row justify="space-between">
                          <Text style={{ fontWeight: bold ? 600 : 400 }}>{label}</Text>
                          <Text style={{ fontWeight: bold ? 600 : 400 }}>{fmtHuf(value)}</Text>
                        </Row>
                      </Col>
                    ))}
                  </Row>

                  {result.service_breakdown.length > 0 && (
                    <>
                      <Divider style={{ margin: '8px 0' }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Utómunka részletezés:</Text>
                      {result.service_breakdown.map((s) => (
                        <Row justify="space-between" key={s.id} style={{ fontSize: 12 }}>
                          <Text type="secondary">{s.name}</Text>
                          <Text type="secondary">{fmtHuf(s.total)}</Text>
                        </Row>
                      ))}
                    </>
                  )}
                </Card>

                {/* Elrendezés */}
                <Card
                  title={
                    <Space>
                      <AppstoreOutlined />
                      Alapanyag elrendezés
                    </Space>
                  }
                >
                  {result.sheets_needed !== null && (
                    <Row gutter={16} style={{ marginBottom: 12 }}>
                      <Col span={8}>
                        <Statistic title="Szükséges tábla" value={result.sheets_needed} suffix="db" />
                      </Col>
                      {result.layout.cols != null && result.layout.rows != null && (
                        <Col span={8}>
                          <Statistic
                            title="Elrendezés"
                            value={`${result.layout.cols} × ${result.layout.rows}`}
                            suffix={`= ${result.layout.fit_count ?? (result.layout.cols * result.layout.rows)} db/tábla`}
                          />
                        </Col>
                      )}
                      {result.layout.utilization_pct != null && (
                        <Col span={8}>
                          <Statistic
                            title="Kihozatal"
                            value={result.layout.utilization_pct}
                            suffix="%"
                            valueStyle={{
                              color: result.layout.utilization_pct > 70 ? '#52c41a'
                                : result.layout.utilization_pct > 40 ? '#faad14' : '#ff4d4f',
                            }}
                          />
                        </Col>
                      )}
                    </Row>
                  )}

                  {result.roll_length_mm !== null && (
                    <Row gutter={16} style={{ marginBottom: 12 }}>
                      <Col span={8}>
                        <Statistic
                          title="Szükséges tekercs"
                          value={(result.roll_length_mm / 1000).toFixed(2)}
                          suffix="fm"
                        />
                      </Col>
                      {result.layout.cols != null && (
                        <Col span={8}>
                          <Statistic
                            title="Sorok szélességben"
                            value={result.layout.cols}
                            suffix="db"
                          />
                        </Col>
                      )}
                      {result.layout.utilization_pct != null && (
                        <Col span={8}>
                          <Statistic title="Szél. kihasználtság" value={result.layout.utilization_pct} suffix="%" />
                        </Col>
                      )}
                    </Row>
                  )}

                  {result.layout.rotated && (
                    <Tag icon={<RollbackOutlined />} color="processing">
                      Termék 90°-ra forgatva (jobb kihozatal)
                    </Tag>
                  )}

                  {result.material.cost_per_m2 > 0 && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                      Anyag: {result.material.name} — {fmtHuf(result.material.cost_per_m2)}/m²
                    </Text>
                  )}
                </Card>

                {/* Maradék preview */}
                {result.remnant_preview.length > 0 && (
                  <Card
                    title={
                      <Space>
                        <InfoCircleOutlined />
                        Várható hulló / maradék
                      </Space>
                    }
                  >
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={result.remnant_preview.map((r, i) => ({ ...r, key: i }))}
                      columns={[
                        {
                          title: 'Méret',
                          render: (_: any, r: RemnantPreview) =>
                            r.height_mm
                              ? `${fmt(r.width_mm, 0)} × ${fmt(r.height_mm, 0)} mm`
                              : `${fmt(r.width_mm, 0)} mm szélesség`,
                        },
                        { title: 'Típus', dataIndex: 'note' },
                        {
                          title: 'Mentés',
                          render: (_: any, r: RemnantPreview) => {
                            const hasMaterial = !!form.getFieldValue('material_id');
                            return (
                              <Tooltip title={hasMaterial ? 'Elment a raktárba' : 'Válassz alapanyagot a mentéshez'}>
                                <Button
                                  size="small"
                                  type="link"
                                  disabled={!hasMaterial}
                                  onClick={() => handleSaveRemnant(r)}
                                >
                                  Mentés
                                </Button>
                              </Tooltip>
                            );
                          },
                        },
                      ]}
                    />
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginTop: 8 }}
                      message="A maradék darabokat elmentheted a raktárba, és a következő munkánál felhasználhatod őket."
                    />
                  </Card>
                )}
              </Space>
            )}

            {!result && !calcLoading && (
              <Card style={{ textAlign: 'center', padding: 40 }}>
                <ExperimentOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                <div style={{ marginTop: 16, color: '#bfbfbf' }}>
                  Töltsd ki a paraméteres mezőket, és kattints a Számítás gombra.
                </div>
              </Card>
            )}
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default UVCalculator;
