import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, InputNumber, Radio, Divider, Typography, Spin, Tooltip } from 'antd';
import { InfoCircleOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import api from '../../../services/api';

const { Text, Title } = Typography;
const { Option } = Select;

interface SizePreset { id: number; name: string; width_mm: string; height_mm: string; }

export interface PriceBreakdown {
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

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
  onPriceChange?: (b: PriceBreakdown | null) => void;
  isAdmin: boolean;
}

const PRODUCT_TYPES = [
  { value: 'simple', label: 'Szimpla nyomtatás' },
];

const COLOR_MODE_OPTIONS = [
  { value: 'color', label: 'Színes' },
  { value: 'bw', label: 'Fekete-fehér' },
  { value: 'color_white', label: 'Színes + fehér' },
  { value: 'white', label: 'Fehér' },
  { value: 'none', label: 'Nyomatlan' },
];

const fmt = (n: number) => n.toLocaleString('hu-HU', { maximumFractionDigits: 0 }) + ' Ft';

/** oldal+kétoldalas → nyomtatandó ívek száma (páros egészre kerekítve) */
const pagesToÍvek = (pages: number): number => {
  const sheets = Math.ceil(pages / 2);
  return sheets % 2 === 0 ? sheets : sheets + 1;
};

/** Egység alapján kiszamolja a végleges db számot */
const toDb = (input: number, unit: 'db' | 'oldal' | 'ív', sides: '1' | '2'): number => {
  if (unit === 'db') return input;
  if (unit === 'ív') {
    // ív = 1 db, de párosan érdemes: ha kétoldalas, kerekíts párosra
    if (sides === '2') return input % 2 === 0 ? input : input + 1;
    return input;
  }
  // 'oldal'
  if (sides === '1') return input;  // 1 oldal = 1 ív = 1 db
  return pagesToÍvek(input);         // 2 oldalas: páros ívszámra kerekít
};

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text style={{
    fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: 0.8,
    textTransform: 'uppercase', display: 'block', marginBottom: 6, marginTop: 14,
  }}>
    {label}
  </Text>
);

const PrintParamsPanel: React.FC<Props> = ({ params, onChange, onPriceChange, isAdmin }) => {
  const [priceOpen, setPriceOpen] = useState(true);
  const [presets, setPresets] = useState<SizePreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [productType, setProductType] = useState<string>('simple');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get('/printshop/size-presets/').then(res => {
      const data = res.data?.results ?? res.data;
      setPresets(Array.isArray(data) ? data : []);
    });
  }, []);

  const calculatePrice = useCallback(async (p: PrintParams) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await api.post('/printshop/orders/calculate-price/', {
          width_mm: p.width_mm, height_mm: p.height_mm, quantity: p.quantity,
          sides: p.sides, side1_mode: p.side1_mode, side2_mode: p.side2_mode,
          binding: p.binding, folding_count: p.folding_count,
        });
        setPricing(res.data);
        onPriceChange?.(res.data);
      } catch {
        setPricing(null);
        onPriceChange?.(null);
      } finally {
        setCalcLoading(false);
      }
    }, 400);
  }, []); // eslint-disable-line

  useEffect(() => {
    calculatePrice(params);
  }, [params]); // eslint-disable-line

  const update = (partial: Partial<PrintParams>) => {
    const next = { ...params, ...partial };
    // Whenever quantity_input, quantity_unit or sides changes, recompute quantity (db)
    const unit  = next.quantity_unit  ?? 'db';
    const input = next.quantity_input ?? next.quantity;
    const computed = toDb(input, unit, next.sides);
    onChange({ ...next, quantity: computed });
  };

  const handlePresetChange = (presetId: number) => {
    setSelectedPreset(presetId);
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      update({
        width_mm: parseFloat(preset.width_mm),
        height_mm: parseFloat(preset.height_mm),
        product_name: preset.name,
      });
    }
  };

  return (
    <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SectionLabel label="Termék típusa" />
      <Select value={productType} onChange={setProductType} style={{ width: '100%' }} size="small">
        {PRODUCT_TYPES.map(pt => <Option key={pt.value} value={pt.value}>{pt.label}</Option>)}
      </Select>

      {productType === 'simple' && (
        <>
          <SectionLabel label="Méret" />
          <Select
            allowClear
            placeholder="Preset méret..."
            value={selectedPreset ?? undefined}
            onChange={handlePresetChange}
            onClear={() => setSelectedPreset(null)}
            style={{ width: '100%', marginBottom: 6 }}
            size="small"
          >
            {presets.map(p => (
              <Option key={p.id} value={p.id}>{p.name} ({p.width_mm}×{p.height_mm} mm)</Option>
            ))}
          </Select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <InputNumber
              size="small" min={1} max={5000} placeholder="Szél."
              style={{ flex: 1 }}
              value={params.width_mm}
              onChange={v => { if (v) { update({ width_mm: v }); setSelectedPreset(null); } }}
            />
            <Text style={{ fontSize: 11, color: '#aaa' }}>×</Text>
            <InputNumber
              size="small" min={1} max={5000} placeholder="Mag."
              style={{ flex: 1 }}
              value={params.height_mm}
              onChange={v => { if (v) { update({ height_mm: v }); setSelectedPreset(null); } }}
            />
            <Text style={{ fontSize: 11, color: '#aaa' }}>mm</Text>
          </div>

          <SectionLabel label="Nyomtatási mód" />
          <Radio.Group
            value={params.sides}
            onChange={e => update({
              sides: e.target.value,
              side2_mode: e.target.value === '1' ? 'none' : (params.side2_mode === 'none' ? 'color' : params.side2_mode),
              quantity_input: params.quantity_input ?? params.quantity,
            })}
            size="small"
            optionType="button"
            buttonStyle="solid"
            style={{ width: '100%', display: 'flex', marginBottom: 4 }}
          >
            <Radio.Button value="1" style={{ flex: 1, textAlign: 'center' }}>1 oldalas</Radio.Button>
            <Radio.Button value="2" style={{ flex: 1, textAlign: 'center' }}>2 oldalas</Radio.Button>
          </Radio.Group>

          <SectionLabel label="Nyomtatási szín" />
          <div style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>1. oldal</Text>
            <Select
              value={params.side1_mode}
              onChange={v => update({ side1_mode: v })}
              style={{ width: '100%' }}
              size="small"
            >
              {COLOR_MODE_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </div>

          {params.sides === '2' && (
            <div style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 3 }}>2. oldal</Text>
              <Select
                value={params.side2_mode}
                onChange={v => update({ side2_mode: v })}
                style={{ width: '100%' }}
                size="small"
              >
                {COLOR_MODE_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
              </Select>
            </div>
          )}

          <SectionLabel label="Kötészet" />
          <Radio.Group
            value={params.binding}
            onChange={e => update({ binding: e.target.value })}
            size="small"
            optionType="button"
            buttonStyle="solid"
            style={{ width: '100%', display: 'flex', marginBottom: 4 }}
          >
            <Radio.Button value="cut" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>Méretre vágás</Radio.Button>
            <Radio.Button value="fold" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>Hajtogatás</Radio.Button>
          </Radio.Group>

          <SectionLabel label="Mennyiség" />
          {(() => {
            const unit  = params.quantity_unit  ?? 'db';
            const input = params.quantity_input ?? params.quantity;
            const computed = toDb(input, unit, params.sides);
            const showHint = unit !== 'db' && computed !== input;
            return (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: showHint ? 3 : 0 }}>
                  <InputNumber
                    size="small"
                    min={1}
                    max={100000}
                    style={{ flex: 1 }}
                    value={input}
                    onChange={v => {
                      if (!v) return;
                      update({ quantity_input: v, quantity_unit: unit });
                    }}
                  />
                  <Select
                    size="small"
                    value={unit}
                    style={{ width: 72 }}
                    onChange={(u: 'db' | 'oldal' | 'ív') =>
                      update({ quantity_unit: u, quantity_input: input })
                    }
                  >
                    <Option value="db">db</Option>
                    <Option value="oldal">oldal</Option>
                    <Option value="ív">ív</Option>
                  </Select>
                </div>
                {showHint && (
                  <Text style={{ fontSize: 10, color: '#888' }}>
                    = <strong>{computed}</strong> db
                    {unit === 'oldal' && params.sides === '2' && (
                      <Tooltip title="2 oldalas nyomtatásnál páros ívszámra kerekítve">
                        {' '}<InfoCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    )}
                    {unit === 'ív' && params.sides === '2' && computed !== input && (
                      <Tooltip title="2 oldalas nyomtatásnál páros számra kerekítve">
                        {' '}<InfoCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    )}
                  </Text>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Price display */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ textAlign: 'center', minHeight: 56 }}>
        {calcLoading ? (
          <Spin size="small" />
        ) : pricing ? (
          <>
            <Text style={{ fontSize: 11, color: '#888' }}>
              Egységár: <strong>{fmt(pricing.unit_price)}</strong>
            </Text>
            <br />
            <Title level={5} style={{ margin: '2px 0 0' }}>{fmt(pricing.total)}</Title>
            <Text style={{ fontSize: 10, color: '#aaa' }}>{pricing.quantity} db</Text>
          </>
        ) : null}
      </div>

      {/* Collapsible price breakdown (admin only) */}
      {isAdmin && pricing && (
        <>
          <Divider style={{ margin: '6px 0' }} />
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 0', userSelect: 'none' }}
            onClick={() => setPriceOpen(v => !v)}
          >
            {priceOpen ? <CaretDownOutlined style={{ fontSize: 10, color: '#888' }} /> : <CaretRightOutlined style={{ fontSize: 10, color: '#888' }} />}
            <Text strong style={{ fontSize: 11, color: '#888' }}>ÁR KALKULÁCIÓ</Text>
          </div>
          {priceOpen && (
            <div style={{ fontSize: 12, paddingTop: 4, paddingBottom: 8 }}>
              <div>Papír: <strong>{fmt(pricing.paper_cost)}</strong></div>
              <div>Nyomtatás 1.o: <strong>{fmt(pricing.print_cost_side1)}</strong></div>
              {pricing.print_cost_side2 > 0 && (
                <div>Nyomtatás 2.o: <strong>{fmt(pricing.print_cost_side2)}</strong></div>
              )}
              <div>Kötészet: <strong>{fmt(pricing.finishing_cost)}</strong></div>
              <div>Fedezet: <strong>{pricing.margin_pct}%</strong></div>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ fontWeight: 600 }}>Összesen: {fmt(pricing.total)}</div>
              <div>Egységár: {pricing.unit_price?.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft/db</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PrintParamsPanel;
