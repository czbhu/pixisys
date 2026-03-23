import React, { useEffect, useState, useCallback } from 'react';
import {
  Form, Select, InputNumber, Row, Col, Divider, Radio, Button,
  Card, Collapse, Input, Tooltip, message,
} from 'antd';
import { PlusOutlined, MinusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Option } = Select;
const { Panel } = Collapse;

interface SizePreset {
  id: number;
  name: string;
  width_mm: string;
  height_mm: string;
}

interface PrintMaterial {
  id: number;
  name: string;
  description: string;
}

interface PriceBreakdown {
  paper_cost: number;
  print_cost_side1: number;
  print_cost_side2: number;
  finishing_cost: number;
  subtotal: number;
  margin_pct: number;
  total: number;
  unit_price: number;
  quantity: number;
}

export interface PrintParams {
  product_name: string;
  width_mm: number;
  height_mm: number;
  quantity: number;          // mindig db (ív/oldal → db konverzió után)
  quantity_unit?: 'db' | 'oldal' | 'ív';  // beviteli egység, default 'db'
  quantity_input?: number;   // a felhasználó által beírt szám az adott egységben
  sides: '1' | '2';
  side1_mode: string;
  side2_mode: string;
  binding: string;
  folding_count: number;
  folding_specs: Array<{ axis: 'H' | 'V'; pos_mm: number }>;
  material_id: number | null;
}

interface Props {
  isAdmin: boolean;
  params: PrintParams;
  onParamsChange: (p: PrintParams) => void;
  onNext: () => void;
  onPriceChange?: (breakdown: PriceBreakdown | null) => void;
}

const GOOGLE_FONTS_API = 'https://fonts.googleapis.com/css2?family=';

const COLOR_MODE_OPTIONS = [
  { value: 'color', label: 'Színes' },
  { value: 'bw', label: 'Fekete-fehér' },
  { value: 'color_white', label: 'Színes + fehér' },
];

const COLOR_MODE_OPTIONS_SIDE2 = [
  ...COLOR_MODE_OPTIONS,
  { value: 'none', label: 'Nyomatlan' },
];

const fmt = (n: number) =>
  n.toLocaleString('hu-HU', { maximumFractionDigits: 0 }) + ' Ft';

const Step1Params: React.FC<Props> = ({ isAdmin, params, onParamsChange, onNext, onPriceChange }) => {
  const [presets, setPresets] = useState<SizePreset[]>([]);
  const [materials, setMaterials] = useState<PrintMaterial[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcTimer, setCalcTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    api.get('/printshop/size-presets/').then(res => {
      const data = res.data?.results ?? res.data;
      setPresets(Array.isArray(data) ? data : []);
    });
    api.get('/printshop/materials/').then(res => {
      const data = res.data?.results ?? res.data;
      setMaterials(Array.isArray(data) ? data : []);
    });
  }, []);

  const calculatePrice = useCallback(async (p: PrintParams) => {
    if (calcTimer) clearTimeout(calcTimer);
    const t = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await api.post('/printshop/orders/calculate-price/', {
          width_mm: p.width_mm,
          height_mm: p.height_mm,
          quantity: p.quantity,
          sides: p.sides,
          side1_mode: p.side1_mode,
          side2_mode: p.side2_mode,
          binding: p.binding,
          folding_count: p.folding_count,
        });
        setPricing(res.data);
        onPriceChange?.(res.data);
      } catch {
        // silent
      } finally {
        setCalcLoading(false);
      }
    }, 400);
    setCalcTimer(t);
  }, []); // eslint-disable-line

  useEffect(() => {
    calculatePrice(params);
  }, [params]); // eslint-disable-line

  const update = (partial: Partial<PrintParams>) => {
    const next = { ...params, ...partial };
    onParamsChange(next);
  };

  const handlePresetChange = (presetId: number) => {
    setSelectedPreset(presetId);
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      update({ width_mm: parseFloat(preset.width_mm), height_mm: parseFloat(preset.height_mm) });
      form.setFieldsValue({ width_mm: parseFloat(preset.width_mm), height_mm: parseFloat(preset.height_mm) });
    }
  };

  const addFoldSpec = () => {
    const specs = [...params.folding_specs, { axis: 'H' as 'H', pos_mm: 100 }];
    update({ folding_specs: specs, folding_count: specs.length });
  };

  const removeFoldSpec = (idx: number) => {
    const specs = params.folding_specs.filter((_, i) => i !== idx);
    update({ folding_specs: specs, folding_count: specs.length });
  };

  const updateFoldSpec = (idx: number, field: 'axis' | 'pos_mm', value: any) => {
    const specs = params.folding_specs.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s
    );
    update({ folding_specs: specs });
  };

  const canProceed = params.width_mm > 0 && params.height_mm > 0 && params.quantity > 0;

  return (
    <Row gutter={24}>
      {/* Bal: paraméterek */}
      <Col xs={24} lg={14}>
        <Form form={form} layout="vertical" initialValues={params}>

          <Form.Item label="Termék neve" required>
            <Input
              value={params.product_name}
              onChange={e => update({ product_name: e.target.value })}
              placeholder="pl. Névjegykártya, Szórólap"
            />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13 }}>Alapanyag</Divider>
          <Form.Item label="Alapanyag választása">
            <Select
              allowClear
              placeholder={materials.length === 0 ? 'Nincs elérhető alapanyag' : 'Válassz alapanyagot...'}
              value={params.material_id ?? undefined}
              disabled={materials.length === 0}
              onChange={(v: number | undefined) => update({ material_id: v ?? null })}
              onClear={() => update({ material_id: null })}
            >
              {materials.map(m => (
                <Option key={m.id} value={m.id}>
                  {m.name}{m.description ? ` — ${m.description}` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13 }}>Méret</Divider>
          <Form.Item label="Preset méret">
            <Select
              allowClear
              placeholder="Válassz presetből..."
              value={selectedPreset}
              onChange={handlePresetChange}
              onClear={() => setSelectedPreset(null)}
            >
              {presets.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.name} ({p.width_mm}×{p.height_mm} mm)
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Szélesség" name="width_mm">
                <InputNumber
                  min={1} max={5000} addonAfter="mm"
                  style={{ width: '100%' }}
                  value={params.width_mm}
                  onChange={v => { if (v) { update({ width_mm: v }); setSelectedPreset(null); } }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Magasság" name="height_mm">
                <InputNumber
                  min={1} max={5000} addonAfter="mm"
                  style={{ width: '100%' }}
                  value={params.height_mm}
                  onChange={v => { if (v) { update({ height_mm: v }); setSelectedPreset(null); } }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Mennyiség</Divider>
          <Form.Item label="Példányszám" name="quantity">
            <InputNumber
              min={1} max={100000} addonAfter="db"
              style={{ width: 180 }}
              value={params.quantity}
              onChange={v => { if (v) update({ quantity: v }); }}
            />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13 }}>Nyomtatás</Divider>
          <Form.Item label="Oldalak száma">
            <Radio.Group
              value={params.sides}
              onChange={e => update({
                sides: e.target.value,
                side2_mode: e.target.value === '1' ? 'none' : 'color',
              })}
              optionType="button"
            >
              <Radio.Button value="1">1 oldalas</Radio.Button>
              <Radio.Button value="2">2 oldalas</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={params.sides === '2' ? 12 : 24}>
              <Form.Item label="Cím oldal nyomtatási mód">
                <Select
                  value={params.side1_mode}
                  onChange={v => update({ side1_mode: v })}
                >
                  {COLOR_MODE_OPTIONS.map(o => (
                    <Option key={o.value} value={o.value}>{o.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            {params.sides === '2' && (
              <Col span={12}>
                <Form.Item label="Hátoldal nyomtatási mód">
                  <Select
                    value={params.side2_mode}
                    onChange={v => update({ side2_mode: v })}
                  >
                    {COLOR_MODE_OPTIONS_SIDE2.map(o => (
                      <Option key={o.value} value={o.value}>{o.label}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Kötészet</Divider>
          <Form.Item label="Kötészeti mód">
            <Radio.Group
              value={params.binding}
              onChange={e => update({ binding: e.target.value, folding_specs: [], folding_count: 0 })}
              optionType="button"
            >
              <Radio.Button value="cut">Méretre vágás</Radio.Button>
              <Radio.Button value="fold">Hajtogatás</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {params.binding === 'fold' && (
            <>
              <div style={{ marginBottom: 8 }}>
                <strong>Hajtáspontok</strong>
                <Tooltip title="Adj meg minden hajtáspontot: tengelyirány (Vízszintes / Függőleges) és távolság a 0-ponttól mm-ben.">
                  <InfoCircleOutlined style={{ marginLeft: 6, color: '#888' }} />
                </Tooltip>
              </div>
              {params.folding_specs.map((spec, idx) => (
                <Row key={idx} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                  <Col span={3} style={{ color: '#888', fontSize: 12 }}>{idx + 1}.</Col>
                  <Col span={8}>
                    <Select
                      size="small"
                      value={spec.axis}
                      onChange={v => updateFoldSpec(idx, 'axis', v)}
                      style={{ width: '100%' }}
                    >
                      <Option value="H">Vízszintes</Option>
                      <Option value="V">Függőleges</Option>
                    </Select>
                  </Col>
                  <Col span={9}>
                    <InputNumber
                      size="small"
                      min={1}
                      max={5000}
                      addonAfter="mm"
                      value={spec.pos_mm}
                      onChange={v => { if (v) updateFoldSpec(idx, 'pos_mm', v); }}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={4}>
                    <Button
                      size="small"
                      danger
                      icon={<MinusOutlined />}
                      onClick={() => removeFoldSpec(idx)}
                    />
                  </Col>
                </Row>
              ))}
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={addFoldSpec}
                disabled={params.folding_specs.length >= 6}
              >
                Hajtáspont hozzáadása
              </Button>
            </>
          )}
        </Form>
      </Col>

      {/* Jobb: élő árkalkuláció */}
      <Col xs={24} lg={10}>
        <Card
          title="Árkalkuláció"
          style={{ position: 'sticky', top: 16 }}
          loading={calcLoading}
        >
          {pricing ? (
            <>
              {isAdmin && (
                <Collapse ghost size="small" style={{ marginBottom: 12 }}>
                  <Panel header="Részletes kalkuláció" key="1">
                    <table style={{ width: '100%', fontSize: 13 }}>
                      <tbody>
                        <tr><td>Papírköltség</td><td style={{ textAlign: 'right' }}>{fmt(pricing.paper_cost)}</td></tr>
                        <tr><td>Nyomtatás Cím oldal</td><td style={{ textAlign: 'right' }}>{fmt(pricing.print_cost_side1)}</td></tr>
                        {pricing.print_cost_side2 > 0 && (
                          <tr><td>Nyomtatás Hátoldal</td><td style={{ textAlign: 'right' }}>{fmt(pricing.print_cost_side2)}</td></tr>
                        )}
                        <tr><td>Kötészet</td><td style={{ textAlign: 'right' }}>{fmt(pricing.finishing_cost)}</td></tr>
                        <tr style={{ borderTop: '1px solid #eee' }}>
                          <td>Részösszeg</td><td style={{ textAlign: 'right' }}>{fmt(pricing.subtotal)}</td>
                        </tr>
                        <tr>
                          <td>Fedezet ({pricing.margin_pct}%)</td>
                          <td style={{ textAlign: 'right' }}>{fmt(pricing.total - pricing.subtotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <Divider style={{ margin: '8px 0' }} />
                  </Panel>
                </Collapse>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Egységár</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff' }}>
                  {pricing.unit_price.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} Ft/db
                </div>
                <Divider style={{ margin: '12px 0 8px' }} />
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                  Végösszeg ({pricing.quantity} db)
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>
                  {fmt(pricing.total)}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  Az ár ÁFA mentes, nyomda előkészítési díj nélkül.
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: '16px 0' }}>
              Adja meg a paramétereket az árkalkulációhoz.
            </div>
          )}
        </Card>
      </Col>

      {/* Tovább gomb */}
      <Col span={24} style={{ marginTop: 24, textAlign: 'right' }}>
        <Button
          type="primary"
          size="large"
          disabled={!canProceed}
          onClick={onNext}
        >
          Tovább a szerkesztőbe →
        </Button>
      </Col>
    </Row>
  );
};

export default Step1Params;
