import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, InputNumber, Radio, Divider, Typography, Spin } from 'antd';
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

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text style={{
    fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: 0.8,
    textTransform: 'uppercase', display: 'block', marginBottom: 6, marginTop: 14,
  }}>
    {label}
  </Text>
);

const PrintParamsPanel: React.FC<Props> = ({ params, onChange, onPriceChange, isAdmin }) => {
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

  const update = (partial: Partial<PrintParams>) => onChange({ ...params, ...partial });

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
          <InputNumber
            size="small"
            min={1}
            max={100000}
            addonAfter="db"
            style={{ width: '100%' }}
            value={params.quantity}
            onChange={v => { if (v) update({ quantity: v }); }}
          />
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1, minHeight: 12 }} />

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
            {isAdmin && (
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                Papír: {fmt(pricing.paper_cost)} | Ny: {fmt(pricing.print_cost_side1 + pricing.print_cost_side2)}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default PrintParamsPanel;
