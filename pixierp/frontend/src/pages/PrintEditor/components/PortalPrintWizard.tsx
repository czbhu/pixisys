import React, { useEffect, useRef, useState } from 'react';
import { Button, InputNumber, Radio, Select, Spin, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Text } = Typography;

const fmt = (n: number) => Math.round(n).toLocaleString('hu-HU') + ' Ft';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductTemplateSize {
  id?: number; label: string; width_mm: number | null; height_mm: number | null;
}
interface MaterialDetail {
  id: number; name: string; code?: string | null; material_group?: number | null;
}
interface ServiceDetail { id: number; name: string; code: string; }
interface PrintServiceOption { id: number; name: string; code: string; }
interface ProductTemplate {
  id: number; name: string; code: string | null;
  sizes: ProductTemplateSize[];
  custom_size_enabled?: boolean;
  calculator_type?: string;
  print_sides?: 1 | 2;
  allowed_materials_details?: MaterialDetail[];
  allowed_material_groups?: number[];
  service_groups_1?: number[][];
  service_groups_2?: number[][];
  finishing_service_groups?: number[][];
  required_services?: number[];
  print_service_options_details?: PrintServiceOption[];
  quantity_discounts?: { id: number; min_amount: number; discount_type: string; discount_value: number }[];
  template_categories?: number[];
}

type DimUnit = 'mm' | 'cm' | 'm';
const UNIT_TO_MM: Record<DimUnit, number> = { mm: 1, cm: 10, m: 1000 };
const toMm = (v: number, u: DimUnit) => Math.round(v * UNIT_TO_MM[u]);

interface SizeRow { id: number; width: number | null; height: number | null; quantity: number | null; }
interface PriceResult { total: number; unit_price: number; quantity: number; }
interface BulkTier { qty: number; total: number | null; unit_price: number | null; loading: boolean; label: string; }

export interface PortalPrintWizardProps {
  onPriceChange?: (p: PriceResult | null) => void;
  onProductIdChange?: (id: number | null) => void;
  /** Set from outside (e.g. catalog modal) to preselect a product */
  preloadProductId?: number | null;
}

// ── Step wrapper ─────────────────────────────────────────────────────────────

const Step: React.FC<{
  num: number; title: string; subtitle?: string; children: React.ReactNode; active?: boolean;
}> = ({ num, title, subtitle, children, active = true }) => {
  if (!active) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#1677ff',
          color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
        }}>
          {num}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a', lineHeight: '1.3' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ paddingLeft: 40 }}>{children}</div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const PortalPrintWizard: React.FC<PortalPrintWizardProps> = ({ onPriceChange, onProductIdChange, preloadProductId }) => {
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [allMaterials, setAllMaterials] = useState<MaterialDetail[]>([]);
  const [allServices, setAllServices] = useState<ServiceDetail[]>([]);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<MaterialDetail[]>([]);
  const [materialId, setMaterialId] = useState<number | null>(null);
  // print_service_id for board/roll/screen products (auto-selected first option)
  const [printSvcId, setPrintSvcId] = useState<number | null>(null);
  // auto-selected service IDs from service_groups_1 (single-option groups)
  const [autoSvcIds, setAutoSvcIds] = useState<number[]>([]);

  const [sizeRows, setSizeRows] = useState<SizeRow[]>([{ id: 1, width: null, height: null, quantity: null }]);
  const [dimUnit, setDimUnit] = useState<DimUnit>('mm');
  const nextRowId = useRef(2);

  const [sides, setSides] = useState<1 | 2>(1);
  const [colorMode, setColorMode] = useState<string>('color');
  const [finishingIds, setFinishingIds] = useState<number[]>([]);

  const [pricing, setPricing] = useState<PriceResult | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [bulkTiers, setBulkTiers] = useState<BulkTier[]>([]);
  const [serviceCosts, setServiceCosts] = useState<Record<number, number>>({});
  const calcAbort = useRef<AbortController | null>(null);

  // ── Load all materials once ────────────────────────────────────────────────
  useEffect(() => {
    api.get('/warehouse/materials/?page_size=1000&is_active=true')
      .then(r => setAllMaterials(Array.isArray(r.data?.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [])))
      .catch(() => {});
  }, []);

  // ── Load products ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/manufacturing/product-templates/?page_size=1000&is_active=true')
      .then(r => setProducts(Array.isArray(r.data?.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [])))
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, []);

  // When catalog selects a product, apply it
  useEffect(() => {
    if (preloadProductId != null) setSelectedProductId(preloadProductId);
  }, [preloadProductId]); // eslint-disable-line

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;
  const isBoardOrRoll = ['sheet_print', 'roll_print', 'screen_print'].includes(selectedProduct?.calculator_type ?? '');
  const isClick = selectedProduct?.calculator_type === 'click_sheet_print';
  const showMaterial = materials.length >= 1;
  const showSides = (selectedProduct?.print_sides ?? 1) >= 2;
  const finishingGroups = (selectedProduct?.finishing_service_groups ?? []).filter(g => g.length > 0);
  // All selectable optional services (from all groups combined)
  const allOptionalSvcIds = Array.from(new Set([
    ...(selectedProduct?.service_groups_1 ?? []).flat(),
    ...(selectedProduct?.service_groups_2 ?? []).flat(),
    ...(selectedProduct?.finishing_service_groups ?? []).flat(),
  ]));
  const showFinishing = allOptionalSvcIds.length > 0;
  const productSizes = selectedProduct?.sizes ?? [];

  // ── Filter materials when product or allMaterials changes ─────────────────
  useEffect(() => {
    if (!selectedProduct) { setMaterials([]); setMaterialId(null); return; }
    const allowedSpecific = selectedProduct.allowed_materials_details ?? [];
    const allowedGroups = selectedProduct.allowed_material_groups ?? [];
    let filtered: MaterialDetail[];
    if (allowedSpecific.length === 0 && allowedGroups.length === 0) {
      filtered = allMaterials;
    } else {
      const groupFiltered = allowedGroups.length > 0
        ? allMaterials.filter(m => m.material_group != null && allowedGroups.includes(m.material_group))
        : [];
      if (allowedSpecific.length === 0) filtered = groupFiltered;
      else if (allowedGroups.length === 0) filtered = allowedSpecific;
      else {
        const specificIds = new Set(allowedSpecific.map(m => m.id));
        filtered = [...allowedSpecific, ...groupFiltered.filter(m => !specificIds.has(m.id))];
      }
    }
    setMaterials(filtered);
    // Keep current selection if still valid; otherwise pick first
    setMaterialId(prev => filtered.some(m => m.id === prev) ? prev : (filtered.length > 0 ? filtered[0].id : null));
  }, [allMaterials, selectedProduct]); // eslint-disable-line

  // ── On product change: reset state, auto-select print svc & services ──────
  useEffect(() => {
    if (!selectedProductId) {
      setSizeRows([{ id: 1, width: null, height: null, quantity: null }]);
      nextRowId.current = 2;
      setSides(1); setColorMode('color'); setFinishingIds([]);
      setPrintSvcId(null); setAutoSvcIds([]);
      setAllServices([]); setServiceCosts({});
      setPricing(null); setBulkTiers([]);
      onProductIdChange?.(null); onPriceChange?.(null);
      return;
    }
    onProductIdChange?.(selectedProductId);
    setSizeRows([{ id: 1, width: null, height: null, quantity: null }]);
    nextRowId.current = 2;
    setSides(1); setColorMode('color'); setFinishingIds([]);
    setPricing(null); setBulkTiers([]);
    onPriceChange?.(null);

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Auto-select first print service for board/roll/screen products
    const svcOpts = product.print_service_options_details ?? [];
    setPrintSvcId(svcOpts.length > 0 ? svcOpts[0].id : null);

    // Only include explicitly required services; don't auto-select optional service_groups_1 items
    setAutoSvcIds(product.required_services ?? []);

    // Load service details for finishing groups
    const sg1 = product.service_groups_1 ?? [];
    const allSvcIds = Array.from(new Set([
      ...sg1.flat(),
      ...(product.service_groups_2 ?? []).flat(),
      ...(product.finishing_service_groups ?? []).flat(),
    ]));
    if (allSvcIds.length > 0) {
      api.get(`/manufacturing/services/?ids=${allSvcIds.join(',')}&page_size=500`)
        .then(r => setAllServices(Array.isArray(r.data) ? r.data : (r.data?.results ?? [])))
        .catch(() => {});
    } else {
      setAllServices([]);
    }
  }, [selectedProductId]); // eslint-disable-line

  // ── Price calculation ──────────────────────────────────────────────────────
  const completeRows = sizeRows.filter(r => r.width && r.height && r.quantity);
  const anyRowComplete = completeRows.length > 0;

  useEffect(() => {
    if (!selectedProduct || !anyRowComplete || !materialId) {
      setPricing(null); setBulkTiers([]); setServiceCosts({}); onPriceChange?.(null);
      return;
    }

    if (calcAbort.current) calcAbort.current.abort();
    calcAbort.current = new AbortController();
    const signal = calcAbort.current.signal;
    setPricingLoading(true);

    const allSvcIds = Array.from(new Set([...autoSvcIds, ...finishingIds]));

    const basePayload = (w: number, h: number, qty: number) => ({
      product_id: selectedProductId,
      width_mm: w, height_mm: h, quantity: qty,
      sides: sides === 2 || (sides as any) === '2' ? '2' : '1',
      side1_mode: colorMode,
      side2_mode: sides === 2 || (sides as any) === '2' ? colorMode : 'none',
      material_id: materialId,
      selected_service_ids: allSvcIds,
      finishing_service_ids: [],
      // sheet_w_mm:0 lets backend pick the optimal (cheapest) board size
      ...(isBoardOrRoll && printSvcId ? { print_service_id: printSvcId, sheet_w_mm: 0, sheet_h_mm: 0, bleed_mm: 0 } : {}),
    });

    const clickPayload = (w: number, h: number, qty: number) => ({
      product_id: selectedProductId,
      width_mm: w, height_mm: h, quantity: qty,
      sheet_count: 1,
      print_sides: sides,
      material_id: materialId,
      selected_service_ids: allSvcIds,
      finishing_service_ids: [],
    });

    const rows = completeRows.map(r => ({
      w: toMm(r.width!, dimUnit), h: toMm(r.height!, dimUnit), qty: r.quantity!,
    }));

    const endpoint = isClick ? '/printshop/orders/calculate-price-click/' : '/printshop/orders/calculate-price/';
    const calls = rows.map(({ w, h, qty }) =>
      api.post(endpoint, isClick ? clickPayload(w, h, qty) : basePayload(w, h, qty), { signal } as any)
        .then(res => res.data as PriceResult)
    );

    Promise.all(calls)
      .then(results => {
        const totalCost = results.reduce((s, r) => s + ((r as any).total ?? 0), 0);
        const totalQty = rows.reduce((s, r) => s + r.qty, 0);
        const combined: PriceResult = { total: totalCost, unit_price: totalQty > 0 ? totalCost / totalQty : 0, quantity: totalQty };
        setPricing(combined);
        onPriceChange?.(combined);

        // Calculate cost delta for each optional service (parallel, best-effort)
        if (allOptionalSvcIds.length > 0) {
          const baseSvcIds = Array.from(new Set([...autoSvcIds, ...finishingIds]));
          allOptionalSvcIds
            .filter(svcId => !baseSvcIds.includes(svcId))
            .forEach(svcId => {
              const withSvcIds = [...baseSvcIds, svcId];
              const withSvcCalls = rows.map(({ w, h, qty }) =>
                api.post(endpoint, isClick
                  ? { ...clickPayload(w, h, qty), selected_service_ids: withSvcIds }
                  : { ...basePayload(w, h, qty), selected_service_ids: withSvcIds },
                  { signal } as any
                ).then(res => (res.data as PriceResult).total ?? 0)
              );
              Promise.all(withSvcCalls)
                .then(totals => {
                  const withTotal = totals.reduce((s, t) => s + t, 0);
                  setServiceCosts(prev => ({ ...prev, [svcId]: Math.round(withTotal - totalCost) }));
                })
                .catch(() => {});
            });
        }

        // Use items_per_sheet from the best board in size_comparison (top-level ips is 1 when no explicit sheet dims)
        const bestBoard = (results[0] as any)?.size_comparison?.find((s: any) => s.is_best) ?? null;
        const ips = bestBoard?.items_per_sheet ?? ((results[0] as any)?.items_per_sheet ?? 0);
        let tierQtys: number[];
        if (ips > 0) {
          // Optimal = smallest multiple of ips that is > totalQty
          const sheetsNeeded = Math.ceil(totalQty / ips);
          const optQty = (sheetsNeeded + 0) * ips > totalQty ? sheetsNeeded * ips : (sheetsNeeded + 1) * ips;
          tierQtys = [optQty, optQty * 5, optQty * 10];
        } else {
          tierQtys = [totalQty * 2, totalQty * 5, totalQty * 10];
        }
        setBulkTiers(tierQtys.map((qty, i) => ({
          qty,
          total: null,
          unit_price: null,
          loading: true,
          label: i === 0 ? `Optimális (${qty.toLocaleString('hu-HU')} db)` : `${qty.toLocaleString('hu-HU')} db`,
        })));
        tierQtys.forEach((tierQty, idx) => {
          const tierCalls = rows.map(({ w, h, qty }) => {
            const q = Math.round(tierQty * qty / totalQty) || tierQty;
            return api.post(endpoint, isClick ? clickPayload(w, h, q) : basePayload(w, h, q), { signal } as any)
              .then(res => (res.data as PriceResult).total ?? 0);
          });
          Promise.all(tierCalls)
            .then(totals => {
              const tot = totals.reduce((s, t) => s + t, 0);
              setBulkTiers(prev => prev.map((t, i) => i === idx ? { ...t, total: tot, unit_price: tierQty > 0 ? tot / tierQty : 0, loading: false } : t));
            })
            .catch(() => setBulkTiers(prev => prev.map((t, i) => i === idx ? { ...t, loading: false } : t)));
        });
      })
      .catch(() => { setPricing(null); onPriceChange?.(null); })
      .finally(() => setPricingLoading(false));

    return () => calcAbort.current?.abort();
  }, [selectedProductId, JSON.stringify(completeRows), dimUnit, sides, colorMode, materialId, printSvcId, JSON.stringify(autoSvcIds), JSON.stringify(finishingIds)]); // eslint-disable-line

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateRow = (id: number, field: keyof SizeRow, value: number | null) =>
    setSizeRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addRow = () =>
    setSizeRows(prev => [...prev, { id: nextRowId.current++, width: null, height: null, quantity: null }]);

  const removeRow = (id: number) =>
    setSizeRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);

  const applyPreset = (sz: ProductTemplateSize) => {
    if (!sz.width_mm || !sz.height_mm) return;
    const w = sz.width_mm / UNIT_TO_MM[dimUnit];
    const h = sz.height_mm / UNIT_TO_MM[dimUnit];
    const firstEmpty = sizeRows.find(r => !r.width && !r.height);
    if (firstEmpty) setSizeRows(prev => prev.map(r => r.id === firstEmpty.id ? { ...r, width: w, height: h } : r));
    else setSizeRows(prev => [...prev, { id: nextRowId.current++, width: w, height: h, quantity: null }]);
  };

  // ── Dynamic step numbering ─────────────────────────────────────────────────
  let stepNum = 0;
  const nextStep = () => ++stepNum;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 40px' }}>

      {/* Step 1: Product */}
      <Step num={nextStep()} title="Válaszd ki a terméket!">
        <Select
          showSearch loading={productsLoading}
          placeholder="Termék kiválasztása…"
          value={selectedProductId ?? undefined}
          onChange={v => setSelectedProductId(v ?? null)}
          onClear={() => setSelectedProductId(null)}
          allowClear
          filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
          options={products.map(p => ({ value: p.id, label: p.name }))}
          style={{ width: '100%', maxWidth: 400 }}
          size="large"
        />
      </Step>

      {/* Step 2: Size & Quantity */}
      <Step num={nextStep()} title="Add meg a méretet és a mennyiséget!"
        subtitle="Akár több méretet és mennyiséget is megadhatsz."
        active={!!selectedProduct}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: '#888' }}>Mértékegység:</Text>
          <Select value={dimUnit} onChange={(v: DimUnit) => setDimUnit(v)} size="small" style={{ width: 72 }}
            options={[{ value: 'mm', label: 'mm' }, { value: 'cm', label: 'cm' }, { value: 'm', label: 'm' }]}
          />
          {productSizes.length > 0 && (
            <>
              <Text style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Méretek:</Text>
              {productSizes.filter(s => s.width_mm && s.height_mm).map((sz, i) => (
                <Button key={i} size="small" onClick={() => applyPreset(sz)} style={{ borderRadius: 6, fontWeight: 500 }}>
                  {sz.label}
                </Button>
              ))}
            </>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sizeRows.map(row => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <InputNumber
                min={0.001} step={dimUnit === 'm' ? 0.001 : dimUnit === 'cm' ? 0.1 : 1}
                value={row.width ?? undefined} onChange={v => updateRow(row.id, 'width', v ?? null)}
                placeholder="Szélesség" addonAfter={dimUnit} style={{ width: 150 }}
              />
              <Text style={{ color: '#aaa' }}>×</Text>
              <InputNumber
                min={0.001} step={dimUnit === 'm' ? 0.001 : dimUnit === 'cm' ? 0.1 : 1}
                value={row.height ?? undefined} onChange={v => updateRow(row.id, 'height', v ?? null)}
                placeholder="Magasság" addonAfter={dimUnit} style={{ width: 150 }}
              />
              <InputNumber
                min={1} step={1}
                value={row.quantity ?? undefined} onChange={v => updateRow(row.id, 'quantity', v ?? null)}
                placeholder="Mennyiség" addonAfter="db" style={{ width: 130 }}
              />
              {sizeRows.length > 1 && (
                <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => removeRow(row.id)} style={{ color: '#ff4d4f' }} />
              )}
            </div>
          ))}
        </div>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: 10 }}>
          Másik méret / mennyiség hozzáadása
        </Button>
      </Step>

      {/* Step 3: Material */}
      {showMaterial && (
        <Step num={nextStep()} title="Mire szeretnéd a nyomtatást?" active={!!selectedProduct}>
          <Select
            placeholder="Válaszd ki az alapanyagot…"
            value={materialId ?? undefined}
            onChange={v => setMaterialId(v ?? null)}
            allowClear
            options={materials.map(m => ({ value: m.id, label: m.name }))}
            style={{ width: '100%', maxWidth: 400 }}
            size="large"
          />
        </Step>
      )}

      {/* Step: Sides */}
      {showSides && (
        <Step num={nextStep()} title="Hány oldalas legyen a nyomtatás?"
          subtitle="Válaszd ki, hogy 1 vagy 2 oldalas nyomtatást szeretnél."
          active={!!selectedProduct}>
          <Radio.Group value={sides} onChange={e => setSides(Number(e.target.value) as 1 | 2)}>
            <Radio value={1} style={{ fontSize: 14 }}>1 oldalas</Radio>
            <Radio value={2} style={{ fontSize: 14 }}>2 oldalas</Radio>
          </Radio.Group>
        </Step>
      )}

      {/* Step: Color */}
      <Step num={nextStep()} title="Színes vagy fekete-fehér nyomtatást szeretnél?" active={!!selectedProduct}>
        <Radio.Group value={colorMode} onChange={e => setColorMode(e.target.value)}>
          <Radio value="color" style={{ fontSize: 14 }}>Színes</Radio>
          <Radio value="bw" style={{ fontSize: 14 }}>Fekete-fehér</Radio>
        </Radio.Group>
      </Step>

      {/* Step: Finishing */}
      {showFinishing && (
        <Step num={nextStep()} title="Milyen utómunkát szeretnél?"
          subtitle="Nem kötelező – akár többet is kivlászthatsz."
          active={!!selectedProduct}>
          <Select
            mode="multiple"
            allowClear
            placeholder="Válassz utómunkát… (nem kötelező)"
            value={finishingIds}
            onChange={(vals: number[]) => setFinishingIds(vals)}
            options={allOptionalSvcIds
              .map(id => allServices.find(s => s.id === id))
              .filter(Boolean)
              .map(s => {
                const delta = serviceCosts[s!.id];
                const label = delta != null
                  ? `${s!.name} (+${Math.round(delta).toLocaleString('hu-HU')} Ft)`
                  : s!.name;
                return { value: s!.id, label };
              })}
            style={{ width: '100%', maxWidth: 440 }}
            size="large"
          />
        </Step>
      )}

      {/* Price summary */}
      {selectedProduct && anyRowComplete && (
        <div style={{
          marginTop: 8, padding: '20px 24px',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f4ff 100%)',
          borderRadius: 12, border: '1.5px solid #91caff',
        }}>
          <div style={{ fontSize: 13, color: '#0958d9', fontWeight: 600, marginBottom: 6 }}>
            Ennyibe kerül a kívánt terméked:
          </div>
          {pricingLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40 }}>
              <Spin size="small" /><Text style={{ color: '#888' }}>Számítás folyamatban…</Text>
            </div>
          ) : pricing ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#0958d9', lineHeight: 1 }}>{fmt(pricing.total)}</span>
                <span style={{ fontSize: 13, color: '#888', marginLeft: 6 }}>+ ÁFA</span>
              </div>
              <div style={{ fontSize: 14, color: '#555' }}>
                ({Math.round(pricing.unit_price).toLocaleString('hu-HU')} Ft/db · {pricing.quantity.toLocaleString('hu-HU')} db)
              </div>
            </div>
          ) : (
            <Text style={{ color: '#888' }}>
              {!materialId ? 'Válaszd ki az alapanyagot a számításhoz.' : 'Töltsd ki a méret és mennyiség mezőket!'}
            </Text>
          )}

          {/* Bulk tiers */}
          {bulkTiers.length > 0 && pricing && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                Kiszámoltuk, hogy ha többet rendelsz, mennyivel lesz olcsóbb. Íme pár példa:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {bulkTiers.map((tier, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #bae7ff', minWidth: 130, flex: '1 1 130px' }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{tier.qty.toLocaleString('hu-HU')} db</div>
                    {tier.loading ? <Spin size="small" /> : tier.unit_price != null ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#389e0d' }}>
                          {Math.round(tier.unit_price).toLocaleString('hu-HU')} Ft/db
                        </div>
                        <div style={{ fontSize: 11, color: '#595959' }}>{fmt(tier.total!)} + ÁFA</div>
                        {pricing.unit_price > 0 && tier.unit_price < pricing.unit_price && (
                          <Tag color="green" style={{ marginTop: 4, fontSize: 10 }}>
                            −{Math.round((1 - tier.unit_price / pricing.unit_price) * 100)}%
                          </Tag>
                        )}
                      </>
                    ) : <Text type="secondary" style={{ fontSize: 11 }}>–</Text>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quote button */}
      {selectedProduct && (
        <div style={{ marginTop: 20 }}>
          <Button type="primary" size="large" block disabled={!pricing}
            style={{ height: 52, fontSize: 16, fontWeight: 600, borderRadius: 10 }}
            onClick={() => { /* TODO: send quote by email */ }}>
            Elküldöm magamnak az ajánlatot
          </Button>
          {!pricing && (
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: '#aaa' }}>
              {!materialId ? 'Válaszd ki az alapanyagot.' : 'Add meg a méretet és mennyiséget.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PortalPrintWizard;
