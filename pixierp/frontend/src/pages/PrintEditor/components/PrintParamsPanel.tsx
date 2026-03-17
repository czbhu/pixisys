import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, InputNumber, Radio, Divider, Typography, Spin, Tooltip, Tag, Space } from 'antd';
import { InfoCircleOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import type { PrintParams } from './Step1Params';
import api from '../../../services/api';

const { Text, Title } = Typography;
const { Option } = Select;

interface SizePreset { id: number; name: string; width_mm: string; height_mm: string; }
interface ProductTemplateSize {
  id?: number; label: string;
  width_mm: number | null; width_max_mm?: number | null;
  height_mm: number | null; height_max_mm?: number | null;
}
interface ServiceDetail {
  id: number;
  name: string;
  code: string;
  pricing_type: string;
  setup_cost_selling: number;
  unit_cost_selling: number;
  capacity: number | null;
  max_width_mm: number | null;
  max_height_mm: number | null;
}
interface ProductTemplate {
  id: number; name: string; code: string | null; sizes: ProductTemplateSize[];
  custom_size_enabled?: boolean;
  custom_size_width_min?: number | null;
  custom_size_width_max?: number | null;
  custom_size_height_min?: number | null;
  custom_size_height_max?: number | null;
  service_groups_1?: number[][];
  service_groups_2?: number[][];
}

export interface PriceBreakdown {
  paper_cost: number;
  print_cost_side1: number;
  print_cost_side2: number;
  finishing_cost: number;
  service_cost?: number;
  service_breakdown?: { id: number; name: string; pricing_type: string; setup_cost: number; unit_cost: number; total: number }[];
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
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [productSizeKey, setProductSizeKey] = useState<string | null>(null); // 'idx_N' or 'custom'
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Service selection: per AND-group for side 1 and side 2
  // selectedServices1[i] = chosen service ID (or null) for group i on side 1
  const [allServices, setAllServices] = useState<ServiceDetail[]>([]);
  const [selectedServices1, setSelectedServices1] = useState<(number | null)[]>([]);
  const [selectedServices2, setSelectedServices2] = useState<(number | null)[]>([]);

  const svcById = new Map(allServices.map(s => [s.id, s]));
  const flatSelectedIds = [
    ...selectedServices1.filter((id): id is number => id != null),
    ...selectedServices2.filter((id): id is number => id != null),
  ];

  useEffect(() => {
    api.get('/printshop/size-presets/').then(res => {
      const data = res.data?.results ?? res.data;
      setPresets(Array.isArray(data) ? data : []);
    });
    api.get('/manufacturing/product-templates/?page_size=1000').then(res => {
      const data = res.data?.results ?? res.data;
      const list: ProductTemplate[] = Array.isArray(data) ? data : [];
      setProducts(list);
      // Preload product if coming from ProductEditor
      try {
        const s = localStorage.getItem('pixierp_editor_state');
        if (s) {
          const stored = JSON.parse(s);
          const pid = stored.preload_product_id;
          if (pid) {
            const found = list.find(p => p.id === pid);
            if (found) setSelectedProductId(pid);
            delete stored.preload_product_id;
            localStorage.setItem('pixierp_editor_state', JSON.stringify(stored));
          }
        }
      } catch {}
    }).catch(() => {});
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
          selected_service_ids: flatSelectedIds,
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
  }, [flatSelectedIds]); // eslint-disable-line

  useEffect(() => { calculatePrice(params); }, [params, flatSelectedIds]); // eslint-disable-line

  // Load service details whenever the selected product changes
  useEffect(() => {
    const product = products.find(p => p.id === selectedProductId);
    if (!product) { setAllServices([]); setSelectedServices1([]); setSelectedServices2([]); return; }
    const sg1 = product.service_groups_1 ?? [];
    const sg2 = product.service_groups_2 ?? [];
    const allIds = Array.from(new Set([...sg1.flat(), ...sg2.flat()]));
    if (allIds.length === 0) { setAllServices([]); setSelectedServices1([]); setSelectedServices2([]); return; }
    api.get(`/manufacturing/services/?ids=${allIds.join(',')}&page_size=200`)
      .then(res => {
        const data: ServiceDetail[] = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
        setAllServices(data);
      })
      .catch(() => setAllServices([]));
    // Reset selections to blank per group
    setSelectedServices1(sg1.map(() => null));
    setSelectedServices2(sg2.map(() => null));
  }, [selectedProductId, products]); // eslint-disable-line

  const update = (partial: Partial<PrintParams>) => {
    const next = { ...params, ...partial };
    // Whenever quantity_input, quantity_unit or sides changes, recompute quantity (db)
    const unit  = next.quantity_unit  ?? 'db';
    const input = next.quantity_input ?? next.quantity;
    const computed = toDb(input, unit, next.sides);
    onChange({ ...next, quantity: computed });
  };

  const handleProductChange = (productId: number | undefined) => {
    if (!productId) { setSelectedProductId(null); setProductSizeKey(null); return; }
    setSelectedProductId(productId);
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setSelectedPreset(null);
    if (product.sizes.length > 0) {
      const first = product.sizes[0];
      setProductSizeKey('idx_0');
      update({
        product_name: product.name,
        width_mm: first.width_mm ?? 148,
        height_mm: first.height_mm ?? 210,
      });
    } else {
      setProductSizeKey('custom');
      update({ product_name: product.name });
    }
  };

  const handleProductSizeChange = (key: string) => {
    setProductSizeKey(key);
    if (key === 'custom') return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;
    const idx = parseInt(key.replace('idx_', ''), 10);
    const sz = product.sizes[idx];
    if (!sz) return;
    update({
      width_mm: sz.width_mm ?? params.width_mm,
      height_mm: sz.height_mm ?? params.height_mm,
    });
  };

  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;
  const activeProductSize: ProductTemplateSize | null = (() => {
    if (!selectedProduct || !productSizeKey || productSizeKey === 'custom') return null;
    const idx = parseInt(productSizeKey.replace('idx_', ''), 10);
    return selectedProduct.sizes[idx] ?? null;
  })();
  const customMode = productSizeKey === 'custom' && !!selectedProduct?.custom_size_enabled;
  const effectiveWMax = customMode
    ? (selectedProduct?.custom_size_width_max  ?? null)
    : (activeProductSize?.width_max_mm ?? null);
  const effectiveHMax = customMode
    ? (selectedProduct?.custom_size_height_max ?? null)
    : (activeProductSize?.height_max_mm ?? null);
  const wMin = customMode ? (selectedProduct?.custom_size_width_min  ?? 1) : (activeProductSize?.width_mm  ?? 1);
  const hMin = customMode ? (selectedProduct?.custom_size_height_min ?? 1) : (activeProductSize?.height_mm ?? 1);
  const wMax = effectiveWMax ?? 9999;
  const hMax = effectiveHMax ?? 9999;
  const hasRange = !!(activeProductSize?.width_max_mm || activeProductSize?.height_max_mm || customMode);

  const widthExceeded  = effectiveWMax != null && (params.width_mm  ?? 0) > effectiveWMax;
  const heightExceeded = effectiveHMax != null && (params.height_mm ?? 0) > effectiveHMax;
  const sizeExceeded   = widthExceeded || heightExceeded;

  return (
    <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SectionLabel label="Termék" />
      <Select
        allowClear
        showSearch
        placeholder="Válassz terméket…"
        optionFilterProp="children"
        value={selectedProductId ?? undefined}
        onChange={handleProductChange}
        onClear={() => { setSelectedProductId(null); setProductSizeKey(null); }}
        style={{ width: '100%' }}
        size="small"
      >
        {products.map(p => (
          <Option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</Option>
        ))}
      </Select>

      <>
        <SectionLabel label="Méret" />

        {/* If selected product has sizes, show them; otherwise show generic presets */}
        {selectedProduct && selectedProduct.sizes.length > 0 ? (
          <Select
            value={productSizeKey ?? undefined}
            onChange={handleProductSizeChange}
            style={{ width: '100%', marginBottom: 6 }}
            size="small"
          >
            {selectedProduct.sizes.map((sz, i) => {
              const label = sz.label || `${sz.width_mm}×${sz.height_mm} mm`;
              const rangeHint = sz.width_max_mm || sz.height_max_mm
                ? ` (${sz.width_mm}–${sz.width_max_mm ?? sz.width_mm} × ${sz.height_mm}–${sz.height_max_mm ?? sz.height_mm} mm)`
                : ` (${sz.width_mm}×${sz.height_mm} mm)`;
              return <Option key={`idx_${i}`} value={`idx_${i}`}>{label}{rangeHint}</Option>;
            })}
            <Option value="custom">Egyéni méret</Option>
          </Select>
        ) : (
          <Select
            allowClear
            placeholder="Preset méret..."
            value={selectedPreset ?? undefined}
            onChange={(id: number) => {
              setSelectedPreset(id);
              const preset = presets.find(p => p.id === id);
              if (preset) update({ width_mm: parseFloat(preset.width_mm), height_mm: parseFloat(preset.height_mm), product_name: preset.name });
            }}
            onClear={() => setSelectedPreset(null)}
            style={{ width: '100%', marginBottom: 6 }}
            size="small"
          >
            {presets.map(p => (
              <Option key={p.id} value={p.id}>{p.name} ({p.width_mm}×{p.height_mm} mm)</Option>
            ))}
          </Select>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <InputNumber
            size="small"
            min={wMin} max={wMax}
            placeholder="Szél."
            status={widthExceeded ? 'error' : undefined}
            style={{ flex: 1 }}
            value={params.width_mm}
            onChange={v => { if (v) { update({ width_mm: v }); setSelectedPreset(null); if (productSizeKey !== 'custom' && selectedProduct?.sizes.length) setProductSizeKey('custom'); } }}
          />
          <Text style={{ fontSize: 11, color: '#aaa' }}>×</Text>
          <InputNumber
            size="small"
            min={hMin} max={hMax}
            placeholder="Mag."
            status={heightExceeded ? 'error' : undefined}
            style={{ flex: 1 }}
            value={params.height_mm}
            onChange={v => { if (v) { update({ height_mm: v }); setSelectedPreset(null); if (productSizeKey !== 'custom' && selectedProduct?.sizes.length) setProductSizeKey('custom'); } }}
          />
          <Text style={{ fontSize: 11, color: '#aaa' }}>mm</Text>
        </div>
        {sizeExceeded ? (
          <div style={{ marginBottom: 4, marginTop: 2, padding: '5px 8px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
            <Text style={{ fontSize: 11, color: '#cf1322' }}>
              A maximális méret: {effectiveWMax != null ? effectiveWMax : '–'} × {effectiveHMax != null ? effectiveHMax : '–'} mm. Maradj ebben a tartományban, vagy válassz egy másik terméket.
            </Text>
          </div>
        ) : hasRange && (
          <Text style={{ fontSize: 10, color: '#888', marginBottom: 4, display: 'block' }}>
            Tartomány: {wMin}–{wMax} × {hMin}–{hMax} mm
          </Text>
        )}

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

      {/* ── Szolgáltatások (termék sablon alapján) ─────────────────────── */}
      {selectedProduct && ((selectedProduct.service_groups_1 ?? []).some(g => g.length > 0) ||
                           (selectedProduct.service_groups_2 ?? []).some(g => g.length > 0)) && (
        <>
          <SectionLabel label="Szolgáltatások" />
          {[{ side: '1' as const, groups: selectedProduct.service_groups_1 ?? [], sel: selectedServices1, setSel: setSelectedServices1 },
            { side: '2' as const, groups: selectedProduct.service_groups_2 ?? [], sel: selectedServices2, setSel: setSelectedServices2 },
          ].map(({ side, groups, sel, setSel }) => {
            const nonEmpty = groups.filter(g => g.length > 0);
            if (nonEmpty.length === 0) return null;
            return (
              <div key={side} style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>{side}. oldal:
                </Text>
                {nonEmpty.map((group, gIdx) => (
                  <div key={gIdx}>
                    {gIdx > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                        <Tag color="blue" style={{ margin: '0 6px', fontSize: 10, lineHeight: '16px' }}>ÉS</Tag>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                      </div>
                    )}
                    <Select
                      allowClear
                      size="small"
                      style={{ width: '100%' }}
                      placeholder="Nem kérem / válassz…"
                      value={sel[gIdx] ?? undefined}
                      onChange={v => setSel(prev => prev.map((s, i) => i === gIdx ? (v ?? null) : s))}
                      onClear={() => setSel(prev => prev.map((s, i) => i === gIdx ? null : s))}
                    >
                      {group.map(svcId => {
                        const svc = svcById.get(svcId);
                        return (
                          <Option key={svcId} value={svcId}>
                            {svc?.name ?? `#${svcId}`}
                            {svc?.unit_cost_selling ? ` (+${svc.unit_cost_selling.toLocaleString('hu-HU')} Ft/${svc.pricing_type === 'per_sheet' ? 'ív' : svc.pricing_type === 'per_cut' ? 'vágás' : 'munka'})` : ''}
                          </Option>
                        );
                      })}
                    </Select>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
      </>

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
              {(pricing.service_cost ?? 0) > 0 && (
                <>
                  {(pricing.service_breakdown ?? []).map(sb => (
                    <div key={sb.id} style={{ paddingLeft: 8, color: '#555' }}>
                      {sb.name}: <strong>{fmt(sb.total)}</strong>
                      {sb.setup_cost > 0 && <span style={{ fontSize: 10, color: '#aaa' }}> (beáll.: {fmt(sb.setup_cost)})</span>}
                    </div>
                  ))}
                  <div>Szolgáltatások: <strong>{fmt(pricing.service_cost!)}</strong></div>
                </>
              )}
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
