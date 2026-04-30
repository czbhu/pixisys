import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Row, Col, Button, Radio, InputNumber, Input, Table, Space, Typography, Alert, Tag, Tooltip, Select, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, AppstoreOutlined, SaveOutlined, CopyOutlined, FileAddOutlined, EditOutlined, FolderOpenOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ProductRow {
  id: number;
  name: string;
  width: number;
  height: number;
  quantity: number;
}

interface SheetRow {
  id: number;
  name: string;
  width: number;
  height: number;
  available: number | null; // null = unlimited
  rotate: 'auto' | 'normal' | 'rotated';
}

interface Allocation {
  productId: number;
  sheetId: number;
  perSheet: number;
  rotated: boolean;
  cols: number;
  rows: number;
  sheetsUsed: number;
  itemsProduced: number;
}

interface AssignmentResult {
  productId: number;
  productName: string;
  qtyNeeded: number;
  qtyProduced: number;
  shortage: number;
  allocations: Allocation[];
}

const itemsPerSheet = (sw: number, sh: number, pw: number, ph: number, bleed: number, rotate: SheetRow['rotate']) => {
  const w = pw + 2 * bleed;
  const h = ph + 2 * bleed;
  if (w <= 0 || h <= 0 || sw <= 0 || sh <= 0) return { count: 0, rotated: false, cols: 0, rows: 0 };
  const fitNormal = Math.floor(sw / w) * Math.floor(sh / h);
  const fitRotated = Math.floor(sw / h) * Math.floor(sh / w);
  let rotated = false;
  if (rotate === 'auto') rotated = fitRotated > fitNormal;
  else if (rotate === 'rotated') rotated = true;
  const cols = rotated ? Math.floor(sw / h) : Math.floor(sw / w);
  const rows = rotated ? Math.floor(sh / w) : Math.floor(sh / h);
  return { count: cols * rows, rotated, cols, rows };
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialProductWidth?: number;
  initialProductHeight?: number;
  initialProductQty?: number;
}

const ImpositionHelperModal: React.FC<Props> = ({ open, onClose, initialProductWidth, initialProductHeight, initialProductQty }) => {
  const [bleed, setBleed] = useState<number>(3);
  const [products, setProducts] = useState<ProductRow[]>([
    { id: 1, name: 'Termék 1', width: initialProductWidth ?? 210, height: initialProductHeight ?? 297, quantity: initialProductQty ?? 100 },
  ]);
  const [sheets, setSheets] = useState<SheetRow[]>([
    { id: 1, name: 'B2', width: 500, height: 700, available: null, rotate: 'auto' },
  ]);

  // ── Presetek (localStorage) ────────────────────────────────────────────
  const STORAGE_KEY = 'pixisys_imposition_presets_v1';
  type Preset = { id: string; name: string; bleed: number; products: ProductRow[]; sheets: SheetRow[]; updatedAt: string };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetNameInput, setPresetNameInput] = useState<string>('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (next: Preset[]) => {
    setPresets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const loadPreset = (id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setBleed(p.bleed);
    setProducts(p.products);
    setSheets(p.sheets);
    setActivePresetId(p.id);
    setPresetNameInput(p.name);
  };

  const newPreset = () => {
    setActivePresetId(null);
    setPresetNameInput('');
    setBleed(3);
    setProducts([{ id: Date.now(), name: 'Termék 1', width: initialProductWidth ?? 210, height: initialProductHeight ?? 297, quantity: initialProductQty ?? 100 }]);
    setSheets([{ id: Date.now() + 1, name: 'B2', width: 500, height: 700, available: null, rotate: 'auto' }]);
  };

  const savePreset = () => {
    const name = (presetNameInput || '').trim();
    if (!name) { message.warning('Adj meg egy nevet a mentéshez'); return; }
    const now = new Date().toISOString();
    if (activePresetId && presets.some(p => p.id === activePresetId)) {
      const next = presets.map(p => p.id === activePresetId ? { ...p, name, bleed, products, sheets, updatedAt: now } : p);
      persist(next);
      message.success('Mentve');
    } else {
      const id = `imp_${Date.now()}`;
      const preset: Preset = { id, name, bleed, products, sheets, updatedAt: now };
      persist([...presets, preset]);
      setActivePresetId(id);
      message.success('Mentve új presetként');
    }
  };

  const duplicatePreset = () => {
    const name = (presetNameInput || 'Impozíció').trim() + ' (másolat)';
    const id = `imp_${Date.now()}`;
    const now = new Date().toISOString();
    const preset: Preset = { id, name, bleed, products, sheets, updatedAt: now };
    persist([...presets, preset]);
    setActivePresetId(id);
    setPresetNameInput(name);
    message.success('Lemásolva');
  };

  const deletePreset = () => {
    if (!activePresetId) return;
    const next = presets.filter(p => p.id !== activePresetId);
    persist(next);
    newPreset();
    message.success('Törölve');
  };

  const renamePresetInline = (id: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const next = presets.map(p => p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p);
    persist(next);
    if (activePresetId === id) setPresetNameInput(trimmed);
  };

  const deletePresetById = (id: string) => {
    const next = presets.filter(p => p.id !== id);
    persist(next);
    if (activePresetId === id) newPreset();
    message.success('Törölve');
  };

  const addProduct = () => setProducts(ps => [...ps, { id: Date.now(), name: `Termék ${ps.length + 1}`, width: 210, height: 297, quantity: 100 }]);
  const removeProduct = (id: number) => setProducts(ps => ps.filter(p => p.id !== id));
  const updateProduct = (id: number, patch: Partial<ProductRow>) => setProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));

  const addSheet = () => setSheets(ss => [...ss, { id: Date.now(), name: `Ív ${ss.length + 1}`, width: 330, height: 487, available: null, rotate: 'auto' }]);
  const removeSheet = (id: number) => setSheets(ss => ss.filter(s => s.id !== id));
  const updateSheet = (id: number, patch: Partial<SheetRow>) => setSheets(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s));

  // ── Számítás ────────────────────────────────────────────────────────────
  // Mátrix: minden (termék × ív) párra kihozatal
  const matrix = useMemo(() => {
    return products.map(p => ({
      product: p,
      perSheetBy: sheets.map(s => ({
        sheet: s,
        ...itemsPerSheet(s.width, s.height, p.width, p.height, bleed, s.rotate),
      })),
    }));
  }, [products, sheets, bleed]);

  // ── Mohó allokáció: minden termékre a legjobb (legtöbb db/ív) ívet választja
  // figyelembe véve a rendelkezésre álló íveket (limit) ─────────────────────
  const assignments = useMemo<AssignmentResult[]>(() => {
    // Másolat az elérhető mennyiségekről (csökkenő allokáció)
    const remaining = new Map<number, number | null>(sheets.map(s => [s.id, s.available]));
    const results: AssignmentResult[] = [];

    for (const p of products) {
      const candidates = sheets
        .map(s => ({ sheet: s, ...itemsPerSheet(s.width, s.height, p.width, p.height, bleed, s.rotate) }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);

      let need = p.quantity;
      const allocs: Allocation[] = [];

      for (const c of candidates) {
        if (need <= 0) break;
        const avail = remaining.get(c.sheet.id) ?? null;
        const sheetsForFull = Math.ceil(need / c.count);
        const sheetsCanUse = avail === null ? sheetsForFull : Math.min(sheetsForFull, avail);
        if (sheetsCanUse <= 0) continue;
        const produced = Math.min(need, sheetsCanUse * c.count);
        allocs.push({
          productId: p.id,
          sheetId: c.sheet.id,
          perSheet: c.count,
          rotated: c.rotated,
          cols: c.cols,
          rows: c.rows,
          sheetsUsed: sheetsCanUse,
          itemsProduced: produced,
        });
        need -= produced;
        if (avail !== null) remaining.set(c.sheet.id, avail - sheetsCanUse);
      }

      results.push({
        productId: p.id,
        productName: p.name,
        qtyNeeded: p.quantity,
        qtyProduced: p.quantity - Math.max(0, need),
        shortage: Math.max(0, need),
        allocations: allocs,
      });
    }

    return results;
  }, [products, sheets, bleed]);

  // Összesített ív felhasználás
  const sheetUsage = useMemo(() => {
    const map = new Map<number, number>();
    assignments.forEach(a => a.allocations.forEach(al => {
      map.set(al.sheetId, (map.get(al.sheetId) || 0) + al.sheetsUsed);
    }));
    return map;
  }, [assignments]);

  return (
    <Modal
      title={<span><AppstoreOutlined style={{ marginRight: 8 }} />Impozíció – Produkciózás (segédlet)</span>}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Bezár"
      cancelButtonProps={{ style: { display: 'none' } }}
      width={1100}
      styles={{ body: { padding: 16 } }}
    >
      {/* ── Presetek ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12, padding: 10, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Space wrap style={{ width: '100%' }}>
          <Text strong>Mentett impozíciók:</Text>
          <Select
            style={{ minWidth: 240 }}
            placeholder="Válassz mentett impozíciót…"
            value={activePresetId ?? undefined}
            onChange={(v) => loadPreset(v)}
            allowClear
            onClear={newPreset}
            options={presets.map(p => ({ label: p.name, value: p.id }))}
          />
          <Input
            style={{ width: 220 }}
            placeholder="Név"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
          />
          <Button icon={<SaveOutlined />} type="primary" onClick={savePreset}>
            {activePresetId ? 'Mentés' : 'Mentés újként'}
          </Button>
          <Button icon={<CopyOutlined />} onClick={duplicatePreset} disabled={!presets.length && !activePresetId}>
            Másolás
          </Button>
          <Button icon={<FileAddOutlined />} onClick={newPreset}>
            Új
          </Button>
          {activePresetId && (
            <Popconfirm title="Biztosan törlöd ezt az impozíciót?" okText="Törlés" cancelText="Mégse" onConfirm={deletePreset}>
              <Button icon={<DeleteOutlined />} danger>Törlés</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Row gutter={16}>
        {/* ── Termékek ──────────────────────────────────────────── */}
        <Col span={12}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#389e0d' }}>Termékek</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={addProduct}>Termék</Button>
            </div>
            {products.map((p, idx) => (
              <Row key={p.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={5}>
                  <Input size="small" value={p.name} onChange={e => updateProduct(p.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={5}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={p.width} min={1}
                    onChange={v => updateProduct(p.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={5}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={p.height} min={1}
                    onChange={v => updateProduct(p.id, { height: Number(v) || 0 })} addonAfter="mm" placeholder="Mag." />
                </Col>
                <Col span={6}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={p.quantity} min={0}
                    onChange={v => updateProduct(p.id, { quantity: Number(v) || 0 })} addonAfter="db" placeholder="Db" />
                </Col>
                <Col span={3} style={{ textAlign: 'right' }}>
                  {products.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeProduct(p.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>

        {/* ── Ívek ──────────────────────────────────────────── */}
        <Col span={12}>
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ color: '#0958d9' }}>Ívek (rendelkezésre álló)</Text>
              <Space>
                <span style={{ fontSize: 12 }}>Ráhagyás:</span>
                <InputNumber size="small" controls={false} min={0} value={bleed} onChange={v => setBleed(Number(v) || 0)} addonAfter="mm" style={{ width: 90 }} />
                <Button size="small" icon={<PlusOutlined />} onClick={addSheet}>Ív</Button>
              </Space>
            </div>
            {sheets.map(s => (
              <Row key={s.id} gutter={6} style={{ marginBottom: 6 }} align="middle">
                <Col span={4}>
                  <Input size="small" value={s.name} onChange={e => updateSheet(s.id, { name: e.target.value })} placeholder="Név" />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={s.width} min={1}
                    onChange={v => updateSheet(s.id, { width: Number(v) || 0 })} addonAfter="mm" placeholder="Szél." />
                </Col>
                <Col span={4}>
                  <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={s.height} min={1}
                    onChange={v => updateSheet(s.id, { height: Number(v) || 0 })} addonAfter="mm" placeholder="Mag." />
                </Col>
                <Col span={5}>
                  <Tooltip title="Üres = végtelen">
                    <InputNumber size="small" controls={false} style={{ width: '100%', minWidth: 72 }} value={s.available ?? undefined} min={0}
                      onChange={v => updateSheet(s.id, { available: v == null ? null : Number(v) })}
                      addonAfter="db" placeholder="∞" />
                  </Tooltip>
                </Col>
                <Col span={5}>
                  <Radio.Group size="small" value={s.rotate} onChange={e => updateSheet(s.id, { rotate: e.target.value })}>
                    <Radio.Button value="auto">A</Radio.Button>
                    <Radio.Button value="normal">0°</Radio.Button>
                    <Radio.Button value="rotated">90°</Radio.Button>
                  </Radio.Group>
                </Col>
                <Col span={2} style={{ textAlign: 'right' }}>
                  {sheets.length > 1 && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeSheet(s.id)} />
                  )}
                </Col>
              </Row>
            ))}
          </div>
        </Col>
      </Row>

      {/* ── Eredménymátrix: db/ív termékenként és ívenként ──────────────── */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Kihozatal (db/ív) – minden ív × termék kombináció</Text>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={matrix.map(m => ({
            key: m.product.id,
            product: `${m.product.name} (${m.product.width}×${m.product.height})`,
            ...Object.fromEntries(m.perSheetBy.map(ps => [
              `s_${ps.sheet.id}`,
              ps.count > 0
                ? `${ps.count} db (${ps.cols}×${ps.rows}${ps.rotated ? ', 90°' : ''})`
                : '—',
            ])),
          }))}
          columns={[
            { title: 'Termék', dataIndex: 'product', key: 'product', width: 200 },
            ...sheets.map(s => ({
              title: `${s.name} (${s.width}×${s.height})`,
              dataIndex: `s_${s.id}`,
              key: `s_${s.id}`,
            })),
          ]}
        />
      </div>

      {/* ── Allokáció ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Optimális allokáció (legtöbb db/ív, készlet figyelembe vételével)</Text>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={assignments.flatMap(a => {
            if (a.allocations.length === 0) {
              return [{ key: `${a.productId}-none`, product: a.productName, sheet: '—', perSheet: '—', sheets: '—' as any, produced: 0, shortage: a.qtyNeeded }];
            }
            return a.allocations.map((al, i) => {
              const sheet = sheets.find(s => s.id === al.sheetId);
              return {
                key: `${a.productId}-${al.sheetId}-${i}`,
                product: i === 0 ? `${a.productName} (${a.qtyNeeded} db)` : '',
                sheet: sheet ? `${sheet.name} (${sheet.width}×${sheet.height})${al.rotated ? ', 90°' : ''}` : '?',
                perSheet: `${al.perSheet} db/ív (${al.cols}×${al.rows})`,
                sheets: al.sheetsUsed as any,
                produced: al.itemsProduced,
                shortage: i === a.allocations.length - 1 ? a.shortage : 0,
              };
            });
          }) as any}
          columns={[
            { title: 'Termék', dataIndex: 'product', key: 'product', width: 200 },
            { title: 'Ív', dataIndex: 'sheet', key: 'sheet' },
            { title: 'Kihozatal', dataIndex: 'perSheet', key: 'perSheet', width: 140 },
            { title: 'Felhasznált ív', dataIndex: 'sheets', key: 'sheets', align: 'right', width: 110 },
            { title: 'Gyártott db', dataIndex: 'produced', key: 'produced', align: 'right', width: 110 },
            {
              title: 'Hiány', dataIndex: 'shortage', key: 'shortage', align: 'right', width: 90,
              render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <span style={{ color: '#999' }}>0</span>,
            },
          ]}
        />
      </div>

      {/* ── Ív felhasználás összesítő ──────────────────────────────── */}
      <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Ív felhasználás</Text>
        <Space wrap>
          {sheets.map(s => {
            const used = sheetUsage.get(s.id) || 0;
            const limit = s.available;
            const over = limit !== null && used > limit;
            return (
              <Tag key={s.id} color={over ? 'red' : used > 0 ? 'blue' : 'default'}>
                {s.name}: {used} {limit !== null ? `/ ${limit}` : '/ ∞'} db
              </Tag>
            );
          })}
        </Space>
      </div>
      {/* ── Vizuális produkciós ívek ────────────────────────── */}
      {assignments.some(a => a.allocations.length > 0) && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 8, border: '1px solid #ffe7ba' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Produkciós ívek (vizuális)</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {assignments.flatMap(a => a.allocations.map((al, idx) => {
              const sheet = sheets.find(s => s.id === al.sheetId);
              if (!sheet) return null;
              const product = products.find(pp => pp.id === a.productId);
              if (!product) return null;
              const sw = sheet.width;
              const sh = sheet.height;
              const pw = product.width + 2 * bleed;
              const ph = product.height + 2 * bleed;
              const cellW = al.rotated ? ph : pw;
              const cellH = al.rotated ? pw : ph;
              const scale = Math.min(220 / sw, 280 / sh, 1);
              const svgW = Math.round(sw * scale);
              const svgH = Math.round(sh * scale);
              const remainingOnLast = al.itemsProduced % al.perSheet;
              const fullSheets = remainingOnLast === 0 ? al.sheetsUsed : al.sheetsUsed - 1;
              const partialItems = remainingOnLast;

              const renderOneSheet = (itemsOnThis: number, label: string, isFull: boolean, key: string) => (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div style={{
                    border: `2px solid ${isFull ? '#69b1ff' : '#ffc069'}`,
                    borderRadius: 4, background: '#fff', display: 'inline-block', overflow: 'hidden', padding: 2,
                  }}>
                    <svg width={svgW} height={svgH} viewBox={`0 0 ${sw} ${sh}`}>
                      <rect x={0} y={0} width={sw} height={sh} fill="#fafafa" />
                      {Array.from({ length: al.cols * al.rows }).map((_, ci) => {
                        const col = ci % al.cols;
                        const row = Math.floor(ci / al.cols);
                        const x = col * cellW;
                        const y = row * cellH;
                        const filled = ci < itemsOnThis;
                        const innerPad = bleed;
                        return (
                          <g key={ci}>
                            <rect x={x} y={y} width={cellW} height={cellH}
                              fill={filled ? '#bae0ff' : '#f0f0f0'} stroke={filled ? '#69b1ff' : '#d9d9d9'} strokeWidth={0.5} />
                            {filled && innerPad > 0 && (
                              <rect x={x + innerPad} y={y + innerPad} width={cellW - 2 * innerPad} height={cellH - 2 * innerPad}
                                fill="#91caff" stroke="#1677ff" strokeWidth={0.4} strokeDasharray="1 1" />
                            )}
                            {filled && cellW * scale > 22 && cellH * scale > 14 && (
                              <text x={x + cellW / 2} y={y + cellH / 2 + 3}
                                fontSize={Math.max(6, Math.min(cellW, cellH) * 0.18)}
                                textAnchor="middle" fill="#0958d9" fontWeight={600}>
                                {ci + 1}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div style={{ fontSize: 10, color: isFull ? '#1677ff' : '#fa8c16', marginTop: 2 }}>{label}</div>
                </div>
              );

              return (
                <div key={`${a.productId}-${al.sheetId}-${idx}`} style={{
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10,
                  display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0958d9' }}>
                    {a.productName} <span style={{ color: '#999', fontWeight: 400 }}>→</span> {sheet.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    {al.perSheet} db/ív ({al.cols}×{al.rows}{al.rotated ? ', 90°' : ''}) · Ív: {sheet.width}×{sheet.height} mm · Termék: {product.width}×{product.height} mm
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {fullSheets > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {renderOneSheet(al.perSheet, `${al.perSheet} db`, true, 'full')}
                        {fullSheets > 1 && (
                          <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 600, marginTop: 2 }}>×{fullSheets}</div>
                        )}
                      </div>
                    )}
                    {partialItems > 0 && renderOneSheet(
                      partialItems,
                      `${partialItems}/${al.perSheet} db (${Math.round(partialItems / al.perSheet * 100)}%)`,
                      false,
                      'partial'
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    Összesen: <b>{al.sheetsUsed} ív</b> → <b>{al.itemsProduced} db</b> termék
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}
      {assignments.some(a => a.shortage > 0) && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message="Nem minden terméket sikerült teljesen legyártani a rendelkezésre álló ívekből."
        />
      )}
    </Modal>
  );
};

export default ImpositionHelperModal;
