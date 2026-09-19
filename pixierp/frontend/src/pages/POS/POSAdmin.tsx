import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Button, Row, Col, Typography, Input, Table, Modal, Form, InputNumber, Select,
  DatePicker, message, Space, Statistic, Empty, Steps,
} from 'antd';
import {
  TagsOutlined, PercentageOutlined, InboxOutlined, FileSearchOutlined, DollarOutlined,
  ArrowLeftOutlined, PrinterOutlined, PlusOutlined, MinusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Title, Text } = Typography;

interface POSAdminProps {
  cashRegisterId: number | null;
  allowedWarehouseIds: number[];
  onBackToPos: () => void;
}

type AdminScreen = 'menu' | 'labels' | 'promo' | 'receipt' | 'stocktake' | 'cash';

interface MaterialLite {
  id: number;
  code: string;
  name: string;
  gross_price?: number;
  unit?: string;
}

const bigButtonCardStyle: React.CSSProperties = {
  height: 160,
  cursor: 'pointer',
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ── Shared header bar for every sub-screen ──────────────────────────────────
const ScreenHeader: React.FC<{ title: string; onBack: () => void; extra?: React.ReactNode }> = ({ title, onBack, extra }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
    <Space size={12}>
      <Button icon={<ArrowLeftOutlined />} size="large" onClick={onBack}>Vissza</Button>
      <Title level={3} style={{ margin: 0 }}>{title}</Title>
    </Space>
    {extra}
  </div>
);

// ── A. Polc címkék nyomtatása ────────────────────────────────────────────────
const LabelsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [search, setSearch] = useState('');
  const [materials, setMaterials] = useState<MaterialLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printData, setPrintData] = useState<{ name: string; code: string; price: number }[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search_ = useCallback((q: string) => {
    setLoading(true);
    api.get('/warehouse/materials/', { params: { search: q, page_size: 60, is_active: true } })
      .then(r => setMaterials(r.data.results || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { search_(''); }, [search_]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search_(val), 350);
  };

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(materials.map(m => m.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handlePrint = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) { message.warning('Válassz ki legalább egy terméket'); return; }
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const mat = materials.find(m => m.id === id);
        if (!mat) return null;
        let code = mat.code;
        try {
          const bc = await api.get('/warehouse/material-barcodes/', { params: { material: id } });
          const list = bc.data.results || bc.data || [];
          if (list.length > 0) code = list[0].code;
        } catch { /* fallback to material code */ }
        return { name: mat.name, code, price: mat.gross_price || 0 };
      }));
      setPrintData(results.filter(Boolean) as any);
      setTimeout(() => window.print(), 150);
    } catch {
      message.error('Hiba a címkék előkészítésekor');
    }
  };

  return (
    <div>
      <ScreenHeader
        title="Polc címkék nyomtatása"
        onBack={onBack}
        extra={
          <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!selectedIds.size}>
            Nyomtatás ({selectedIds.size})
          </Button>
        }
      />
      <Card>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input
            size="large"
            prefix={<SearchOutlined />}
            placeholder="Keresés cikkszám vagy név alapján..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: 320 }}
            allowClear
          />
          <Button size="large" onClick={selectAllVisible}>Összes kijelölése (látható)</Button>
          <Button size="large" onClick={clearSelection}>Kijelölés törlése</Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={materials}
          pagination={false}
          rowSelection={{
            selectedRowKeys: Array.from(selectedIds),
            onChange: (keys) => setSelectedIds(new Set(keys as number[])),
          }}
          onRow={(record) => ({ onClick: () => toggle(record.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 140 },
            { title: 'Név', dataIndex: 'name', key: 'name' },
            { title: 'Bruttó ár', dataIndex: 'gross_price', key: 'gross_price', width: 140,
              render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
          ]}
          scroll={{ y: 'calc(100vh - 340px)' }}
        />
      </Card>

      {printData && (
        <div className="pos-print-labels-area">
          {printData.map((d, i) => (
            <div className="pos-label-card" key={i}>
              <div className="pos-label-name">{d.name}</div>
              <div className="pos-label-row">
                <QRCodeSVG value={d.code} size={72} />
                <div className="pos-label-price">{d.price.toLocaleString('hu-HU')} Ft</div>
              </div>
              <div className="pos-label-code">{d.code}</div>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .pos-print-labels-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          .pos-print-labels-area, .pos-print-labels-area * { visibility: visible; }
          .pos-print-labels-area {
            display: flex !important; flex-wrap: wrap; gap: 8px;
            position: absolute; top: 0; left: 0; width: 100%;
          }
          .pos-label-card {
            width: 180px; height: 150px; border: 1px dashed #999; border-radius: 6px;
            padding: 8px; display: flex; flex-direction: column; justify-content: space-between;
            page-break-inside: avoid;
          }
          .pos-label-name { font-weight: 700; font-size: 13px; line-height: 1.2; max-height: 32px; overflow: hidden; }
          .pos-label-row { display: flex; align-items: center; justify-content: space-between; }
          .pos-label-price { font-size: 20px; font-weight: 800; }
          .pos-label-code { font-size: 10px; color: #555; text-align: center; }
        }
      `}</style>
    </div>
  );
};

// ── B. Akciós árak beállítása ────────────────────────────────────────────────
const PromoScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [search, setSearch] = useState('');
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<number, number | null>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    api.get('/warehouse/materials/', { params: { search: q, page_size: 60, is_active: true } })
      .then(r => setMaterials(r.data.results || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(''); }, [load]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(val), 350);
  };

  const saveRow = async (id: number) => {
    const value = edits[id];
    setSavingId(id);
    try {
      const res = await api.patch(`/warehouse/materials/${id}/`, { promo_price: value ?? null });
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, discount_price: res.data.discount_price } : m));
      message.success('Akciós ár mentve');
    } catch {
      message.error('Hiba a mentés során');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <ScreenHeader title="Akciós árak beállítása" onBack={onBack} />
      <Card>
        <Input
          size="large"
          prefix={<SearchOutlined />}
          placeholder="Keresés cikkszám vagy név alapján..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ width: 320, marginBottom: 12 }}
          allowClear
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={materials}
          pagination={false}
          columns={[
            { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 140 },
            { title: 'Név', dataIndex: 'name', key: 'name' },
            { title: 'Normál ár', dataIndex: 'gross_price', key: 'gross_price', width: 140,
              render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
            {
              title: 'Akciós ár', key: 'discount_price', width: 220,
              render: (_: any, r: any) => (
                <InputNumber
                  size="large"
                  style={{ width: 160 }}
                  min={0}
                  placeholder="nincs akció"
                  value={edits[r.id] !== undefined ? edits[r.id] : r.discount_price}
                  onChange={(v) => setEdits(prev => ({ ...prev, [r.id]: v }))}
                />
              ),
            },
            {
              title: '', key: 'save', width: 120,
              render: (_: any, r: any) => (
                <Button type="primary" size="large" loading={savingId === r.id} onClick={() => saveRow(r.id)}>
                  Mentés
                </Button>
              ),
            },
          ]}
          scroll={{ y: 'calc(100vh - 340px)' }}
        />
      </Card>
    </div>
  );
};

// ── C. Bevételezés (step-by-step) ───────────────────────────────────────────
interface ReceiptLine {
  key: number;
  id?: number;
  materialId: number | null;
  materialLabel: string;
  quantity: number;
  quantityText: string;
  unitPrice: number;
  unit: string;
  matched: boolean;
  rawCode?: string;
  rawName?: string;
}

// Safely evaluates a simple arithmetic expression like "10+10" or "2*10" (digits, + - * / ( ) . only).
const evaluateQuantityExpression = (raw: string): number | null => {
  const expr = raw.trim();
  if (!expr) return null;
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)();
    if (typeof result === 'number' && isFinite(result) && result >= 0) {
      return Math.round(result * 1000) / 1000;
    }
    return null;
  } catch {
    return null;
  }
};

const ReceiptWizard: React.FC<{
  onBack: () => void;
  allowedWarehouseIds: number[];
  onSaved: () => void;
  editingBatch?: any;
}> = ({ onBack, allowedWarehouseIds, onSaved, editingBatch }) => {
  const [step, setStep] = useState(editingBatch ? 2 : 0);

  // Step 0: supplier + warehouse
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(editingBatch?.warehouse ?? null);
  const [supplierOptions, setSupplierOptions] = useState<any[]>(
    editingBatch?.supplier ? [{ id: editingBatch.supplier, name: editingBatch.supplier_name }] : []
  );
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(editingBatch?.supplier ?? null);
  const [supplierLabel, setSupplierLabel] = useState<string>(editingBatch?.supplier_name ?? '');
  const [scanValue, setScanValue] = useState('');
  const [scanLoading, setScanLoading] = useState(false);

  // Step 1: document
  const [docType, setDocType] = useState<'delivery' | 'invoice'>(editingBatch?.document_type ?? 'delivery');
  const [docNumber, setDocNumber] = useState(editingBatch?.invoice_number ?? '');
  const [fulfillmentDate, setFulfillmentDate] = useState<dayjs.Dayjs>(editingBatch ? dayjs(editingBatch.receipt_date) : dayjs());
  const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);
  const [invoiceSearchNumber, setInvoiceSearchNumber] = useState('');
  const [invoiceSearchResults, setInvoiceSearchResults] = useState<any[]>([]);
  const [invoiceSearchLoading, setInvoiceSearchLoading] = useState(false);
  const [invoiceImporting, setInvoiceImporting] = useState(false);

  // Step 2: lines
  const [lines, setLines] = useState<ReceiptLine[]>(
    (editingBatch?.lines || []).map((l: any) => ({
      key: l.id, id: l.id, materialId: l.material,
      materialLabel: `${l.material_name} (${l.material_code})`,
      quantity: Number(l.quantity), quantityText: String(Number(l.quantity)), unitPrice: Number(l.unit_price),
      unit: l.unit || l.material_unit || '', matched: true,
    }))
  );
  const [lineScanValue, setLineScanValue] = useState('');
  const [lineScanLoading, setLineScanLoading] = useState(false);
  const [lineSearchOptions, setLineSearchOptions] = useState<any[]>([]);
  const linesRef = useRef<ReceiptLine[]>([]);
  linesRef.current = lines;

  // Step 3: notes + finalize
  const [notes, setNotes] = useState(editingBatch?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/warehouse/warehouses/', { params: { is_active: true, page_size: 500 } })
      .then(r => {
        const list = r.data.results || r.data || [];
        setWarehouses(list);
        const preferred = allowedWarehouseIds.length ? list.find((w: any) => allowedWarehouseIds.includes(w.id)) : list[0];
        if (preferred) setWarehouseId(preferred.id);
      })
      .catch(() => {});
    // Beszállítók egyszeri betöltése (lassú PixInvoice proxy lekérdezés) — utána kliens oldalon szűrünk, gyors keresésért.
    api.get('/crm/companies/', { params: { is_supplier: true } })
      .then(r => {
        const list = r.data.results || r.data || [];
        setAllSuppliers(list);
        setSupplierOptions(list);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchSuppliers = (val: string) => {
    const q = val.trim().toLowerCase();
    setSupplierOptions(q ? allSuppliers.filter(s => (s.name || '').toLowerCase().includes(q)) : allSuppliers);
  };

  const resolveMaterialByScan = async (raw: string): Promise<any | null> => {
    const code = raw.trim();
    if (!code) return null;
    try {
      const bc = await api.get('/warehouse/material-barcodes/', { params: { code } });
      const list = bc.data.results || bc.data || [];
      if (list.length > 0) {
        const matRes = await api.get(`/warehouse/materials/${list[0].material}/`);
        return matRes.data;
      }
    } catch { /* fall through to code search */ }
    try {
      const res = await api.get('/warehouse/materials/', { params: { search: code, page_size: 10, is_active: true } });
      const list = res.data.results || res.data || [];
      return list.find((m: any) => m.code === code) || list[0] || null;
    } catch {
      return null;
    }
  };

  const resolvePrice = async (materialId: number, fallbackCost: number, supId: number | null) => {
    if (supId) {
      try {
        const r = await api.get('/warehouse/material-suppliers/', { params: { material: materialId, supplier: supId } });
        const list = r.data.results || r.data || [];
        if (list.length > 0) return Number(list[0].unit_price) || 0;
      } catch { /* ignore, use fallback */ }
    }
    return Number(fallbackCost) || 0;
  };

  const addOrIncrementLine = async (mat: any, supId: number | null) => {
    const existing = linesRef.current.find(l => l.materialId === mat.id);
    if (existing) {
      setLines(prev => prev.map(l => l.materialId === mat.id
        ? { ...l, quantity: l.quantity + 1, quantityText: String(l.quantity + 1) }
        : l));
      return;
    }
    const price = await resolvePrice(mat.id, mat.unit_cost_price, supId);
    setLines(prev => [...prev, {
      key: Date.now() + Math.random(),
      materialId: mat.id, materialLabel: `${mat.name} (${mat.code})`,
      quantity: 1, quantityText: '1', unitPrice: price, unit: mat.unit || 'db', matched: true,
    }]);
  };

  // ── Step 0: scan a product to auto-fill the supplier ──
  const handleScanForSupplier = async () => {
    if (!scanValue.trim()) return;
    setScanLoading(true);
    try {
      const mat = await resolveMaterialByScan(scanValue);
      if (!mat) { message.warning('Nem található termék ezzel a kóddal'); setScanLoading(false); return; }
      let supId: number | null = null;
      let supName = '';
      try {
        const recRes = await api.get('/warehouse/material-receipts/', { params: { material_id: mat.id, page_size: 1 } });
        const recs = recRes.data.results || recRes.data || [];
        if (recs.length > 0 && recs[0].supplier) {
          supId = recs[0].supplier; supName = recs[0].supplier_name;
        }
      } catch { /* ignore */ }
      if (!supId && mat.default_supplier) {
        supId = mat.default_supplier; supName = mat.default_supplier_name;
      }
      if (supId) {
        setSupplierId(supId);
        setSupplierLabel(supName);
        message.success(`Beszállító automatikusan kitöltve: ${supName}`);
      } else {
        message.info('Ehhez a termékhez nincs korábbi beszállító — add meg manuálisan.');
      }
      await addOrIncrementLine(mat, supId);
      setScanValue('');
    } finally {
      setScanLoading(false);
    }
  };

  // ── Step 1: invoice search & import (i.pixisys.eu incoming invoices) ──
  const handleSearchInvoices = async () => {
    setInvoiceSearchLoading(true);
    try {
      const res = await api.post('/warehouse/supplier-invoices/search_nav_invoices/', {
        invoice_number: invoiceSearchNumber || undefined,
      });
      setInvoiceSearchResults(res.data.invoices || []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a számlák keresésekor');
    } finally {
      setInvoiceSearchLoading(false);
    }
  };

  const handleImportInvoice = async (row: any) => {
    setInvoiceImporting(true);
    try {
      const res = await api.post('/warehouse/supplier-invoices/import_nav_invoice/', {
        invoice_number: row.invoiceNumber, supplier_tax_number: row.supplierTaxNumber,
      });
      const data = res.data.invoice_data;
      setDocNumber(data.invoice_number || row.invoiceNumber);
      if (data.fulfillment_date) setFulfillmentDate(dayjs(data.fulfillment_date));
      if (data.supplier) {
        setSupplierId(data.supplier);
        setSupplierLabel(data.supplier_name || '');
      }
      const newLines: ReceiptLine[] = (data.items || []).map((item: any) => {
        const qty = Number(item.quantity) || 1;
        return {
          key: Date.now() + Math.random(),
          materialId: item.match_material_id || null,
          materialLabel: item.match_material_id ? `${item.product_name} (${item.product_code})` : '',
          quantity: qty,
          quantityText: String(qty),
          unitPrice: Number(item.unit_price) || 0,
          unit: item.unit || '',
          matched: !!item.match_material_id,
          rawCode: item.product_code,
          rawName: item.product_name,
        };
      });
      setLines(prev => [...prev, ...newLines]);
      message.success(`${newLines.length} tétel betöltve a számláról`);
      setInvoiceSearchOpen(false);
      setInvoiceSearchResults([]);
      setStep(2);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a számla importálásakor');
    } finally {
      setInvoiceImporting(false);
    }
  };

  // ── Step 2: line items ──
  const handleLineScan = async () => {
    if (!lineScanValue.trim()) return;
    setLineScanLoading(true);
    try {
      const mat = await resolveMaterialByScan(lineScanValue);
      if (!mat) { message.warning('Nem található termék ezzel a kóddal'); return; }
      await addOrIncrementLine(mat, supplierId);
      setLineScanValue('');
    } finally {
      setLineScanLoading(false);
    }
  };

  const searchLineMaterials = (val: string) => {
    if (!val.trim()) { setLineSearchOptions([]); return; }
    api.get('/warehouse/materials/', { params: { search: val, page_size: 20, is_active: true } })
      .then(r => setLineSearchOptions(r.data.results || r.data || []))
      .catch(() => {});
  };

  const handlePickLineMaterial = async (materialId: number) => {
    const mat = lineSearchOptions.find(m => m.id === materialId);
    if (mat) await addOrIncrementLine(mat, supplierId);
  };

  const resolveUnmatchedLine = (lineKey: number, materialId: number) => {
    const mat = lineSearchOptions.find(m => m.id === materialId);
    if (!mat) return;
    setLines(prev => prev.map(l => l.key === lineKey
      ? { ...l, materialId: mat.id, materialLabel: `${mat.name} (${mat.code})`, unit: l.unit || mat.unit || 'db', matched: true }
      : l));
  };

  const removeLine = (key: number) => setLines(prev => prev.filter(l => l.key !== key));

  const total = lines.reduce((s, l) => s + (l.quantity * l.unitPrice), 0);

  const handleFinalize = async () => {
    if (!warehouseId || !supplierId) { message.warning('Válassz raktárat és beszállítót'); return; }
    if (!lines.length) { message.warning('Adj hozzá legalább egy terméket'); return; }
    if (lines.some(l => !l.materialId)) { message.warning('Van olyan tétel, amihez nincs termék kiválasztva'); return; }
    setSubmitting(true);
    try {
      const payload = {
        supplier: supplierId,
        warehouse: warehouseId,
        document_type: docType,
        receipt_date: fulfillmentDate.format('YYYY-MM-DD'),
        invoice_number: docNumber,
        notes,
        lines: lines.map(l => ({
          id: l.id,
          material: l.materialId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          unit: l.unit,
        })),
      };
      if (editingBatch) {
        await api.patch(`/warehouse/material-receipt-batches/${editingBatch.id}/`, payload);
      } else {
        await api.post('/warehouse/material-receipt-batches/', payload);
      }
      message.success('Bevételezés véglegesítve!');
      setStep(0); setLines([]); setNotes(''); setDocNumber(''); setSupplierId(null); setSupplierLabel('');
      setFulfillmentDate(dayjs()); setDocType('delivery');
      onSaved();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a véglegesítés során');
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = ['Beszállító', 'Dokumentum', 'Tételek', 'Véglegesítés'];

  return (
    <div>
      <ScreenHeader title={editingBatch ? 'Bevételezés szerkesztése' : 'Új bevételezés'} onBack={onBack} />
      <Steps current={step} items={stepTitles.map(t => ({ title: t }))} style={{ marginBottom: 24, maxWidth: 800 }} />

      {step === 0 && (
        <Card style={{ maxWidth: 640 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong>Raktár</Text>
              <Select
                size="large" style={{ width: '100%', marginTop: 4 }}
                value={warehouseId} onChange={setWarehouseId}
                options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              />
            </div>
            <div>
              <Text strong>Beszállító</Text>
              <Select
                size="large" style={{ width: '100%', marginTop: 4 }}
                showSearch filterOption={false}
                placeholder="Keresés név alapján..."
                value={supplierId}
                onSearch={searchSuppliers}
                onFocus={() => searchSuppliers('')}
                onChange={(v, opt: any) => { setSupplierId(v); setSupplierLabel(opt?.label || ''); }}
                options={supplierOptions.map(s => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div style={{ textAlign: 'center', color: '#999' }}>— vagy —</div>
            <div>
              <Text strong>Vonalkód beolvasása (a beszállítót és az első tételt is kitölti)</Text>
              <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                <Input
                  size="large" placeholder="Vonalkód / cikkszám..."
                  value={scanValue} onChange={e => setScanValue(e.target.value)}
                  onPressEnter={handleScanForSupplier}
                />
                <Button size="large" type="primary" loading={scanLoading} onClick={handleScanForSupplier}>
                  Beolvas
                </Button>
              </Space.Compact>
            </div>
            <Button
              type="primary" size="large" block
              disabled={!warehouseId || !supplierId}
              onClick={() => setStep(1)}
            >
              Tovább
            </Button>
          </Space>
        </Card>
      )}

      {step === 1 && (
        <Card style={{ maxWidth: 640 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text>Beszállító: <b>{supplierLabel}</b></Text>
            <div>
              <Text strong>Dokumentum típusa</Text>
              <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                <Button size="large" type={docType === 'delivery' ? 'primary' : 'default'} style={{ flex: 1, height: 60 }}
                  onClick={() => setDocType('delivery')}>Szállítólevél</Button>
                <Button size="large" type={docType === 'invoice' ? 'primary' : 'default'} style={{ flex: 1, height: 60 }}
                  onClick={() => setDocType('invoice')}>Számla</Button>
              </div>
            </div>
            {docType === 'invoice' && (
              <Button size="large" block onClick={() => setInvoiceSearchOpen(true)}>
                Számla kikeresése (i.pixisys.eu)
              </Button>
            )}
            <div>
              <Text strong>{docType === 'invoice' ? 'Számlaszám' : 'Szállítólevél szám'}</Text>
              <Input size="large" style={{ marginTop: 4 }} value={docNumber} onChange={e => setDocNumber(e.target.value)} />
            </div>
            <div>
              <Text strong>Teljesítés dátuma</Text>
              <DatePicker
                size="large" style={{ width: '100%', marginTop: 4 }} format="YYYY-MM-DD"
                value={fulfillmentDate} onChange={(d) => d && setFulfillmentDate(d)}
              />
            </div>
            <Space>
              <Button size="large" onClick={() => setStep(0)}>Vissza</Button>
              <Button type="primary" size="large" disabled={!docNumber} onClick={() => setStep(2)}>Tovább</Button>
            </Space>
          </Space>

          <Modal
            title="Számla kikeresése (bejövő számlák)"
            open={invoiceSearchOpen}
            onCancel={() => setInvoiceSearchOpen(false)}
            footer={null}
            width={800}
          >
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Input
                size="large" placeholder="Számlaszám..."
                value={invoiceSearchNumber} onChange={e => setInvoiceSearchNumber(e.target.value)}
                onPressEnter={handleSearchInvoices}
              />
              <Button size="large" type="primary" loading={invoiceSearchLoading} onClick={handleSearchInvoices}>
                Keresés
              </Button>
            </Space.Compact>
            <Table
              rowKey={(r: any) => r.invoiceNumber}
              dataSource={invoiceSearchResults}
              pagination={false}
              size="small"
              loading={invoiceSearchLoading}
              columns={[
                { title: 'Számlaszám', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
                { title: 'Dátum', dataIndex: 'invoiceIssueDate', key: 'invoiceIssueDate' },
                { title: 'Beszállító', dataIndex: 'supplierName', key: 'supplierName' },
                { title: 'Nettó összeg', dataIndex: 'invoiceNetAmount', key: 'invoiceNetAmount',
                  render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
                { title: '', key: 'action', render: (_: any, row: any) => (
                  <Button type="primary" loading={invoiceImporting} onClick={() => handleImportInvoice(row)}>Betöltés</Button>
                ) },
              ]}
            />
          </Modal>
        </Card>
      )}

      {step === 2 && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <Space wrap>
              <Space.Compact>
                <Input
                  size="large" style={{ width: 260 }} placeholder="Vonalkód / cikkszám beolvasása..."
                  value={lineScanValue} onChange={e => setLineScanValue(e.target.value)}
                  onPressEnter={handleLineScan}
                />
                <Button size="large" type="primary" loading={lineScanLoading} onClick={handleLineScan}>Beolvas</Button>
              </Space.Compact>
              <Select
                size="large" style={{ width: 320 }}
                showSearch filterOption={false}
                placeholder="Termék keresése név/kód alapján..."
                value={null}
                onSearch={searchLineMaterials}
                onSelect={(v: any) => handlePickLineMaterial(v)}
                options={lineSearchOptions.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
              />
            </Space>
          </Card>
          <Card>
            <Table
              rowKey="key"
              dataSource={lines}
              pagination={false}
              locale={{ emptyText: 'Adj hozzá termékeket vonalkóddal vagy kereséssel' }}
              columns={[
                {
                  title: 'Termék', key: 'material',
                  render: (_: any, r: ReceiptLine) => r.matched ? r.materialLabel : (
                    <Select
                      size="middle" style={{ width: 280 }}
                      showSearch filterOption={false}
                      placeholder={`Válassz terméket: ${r.rawName || r.rawCode || ''}`}
                      onSearch={searchLineMaterials}
                      onSelect={(v: any) => resolveUnmatchedLine(r.key, v)}
                      options={lineSearchOptions.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                    />
                  ),
                },
                {
                  title: 'Mennyiség', key: 'quantity', width: 160,
                  render: (_: any, r: ReceiptLine) => (
                    <Input
                      size="large" style={{ width: 120 }}
                      placeholder="pl. 2*10"
                      value={r.quantityText}
                      onChange={(e) => {
                        const text = e.target.value;
                        const evaluated = evaluateQuantityExpression(text);
                        setLines(prev => prev.map(l => l.key === r.key
                          ? { ...l, quantityText: text, quantity: evaluated ?? l.quantity }
                          : l));
                      }}
                      onBlur={() => {
                        const evaluated = evaluateQuantityExpression(r.quantityText);
                        if (evaluated === null) {
                          message.warning('Érvénytelen mennyiség/képlet');
                          setLines(prev => prev.map(l => l.key === r.key ? { ...l, quantityText: String(l.quantity) } : l));
                        } else {
                          setLines(prev => prev.map(l => l.key === r.key ? { ...l, quantity: evaluated, quantityText: String(evaluated) } : l));
                        }
                      }}
                      onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                    />
                  ),
                },
                {
                  title: 'Egység', key: 'unit', width: 120,
                  render: (_: any, r: ReceiptLine) => (
                    <Input
                      size="large" style={{ width: 90 }}
                      value={r.unit}
                      onChange={(e) => setLines(prev => prev.map(l => l.key === r.key ? { ...l, unit: e.target.value } : l))}
                    />
                  ),
                },
                {
                  title: 'Egységár', key: 'unitPrice', width: 180,
                  render: (_: any, r: ReceiptLine) => (
                    <InputNumber
                      size="large" style={{ width: 140 }} min={0}
                      value={r.unitPrice}
                      onChange={(v) => setLines(prev => prev.map(l => l.key === r.key ? { ...l, unitPrice: v ?? 0 } : l))}
                    />
                  ),
                },
                {
                  title: 'Sor összesen', key: 'lineTotal', width: 140,
                  render: (_: any, r: ReceiptLine) => `${(r.quantity * r.unitPrice).toLocaleString('hu-HU')} Ft`,
                },
                {
                  title: '', key: 'remove', width: 60,
                  render: (_: any, r: ReceiptLine) => <Button danger onClick={() => removeLine(r.key)}>×</Button>,
                },
              ]}
            />
            <div style={{ textAlign: 'right', marginTop: 16, fontSize: 24, fontWeight: 700 }}>
              Összesen: {total.toLocaleString('hu-HU')} Ft
            </div>
            <Space style={{ marginTop: 16 }}>
              <Button size="large" onClick={() => setStep(1)}>Vissza</Button>
              <Button type="primary" size="large" disabled={!lines.length} onClick={() => setStep(3)}>Tovább</Button>
            </Space>
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card style={{ maxWidth: 640 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text>Raktár: <b>{warehouses.find(w => w.id === warehouseId)?.name}</b></Text>
            <Text>Beszállító: <b>{supplierLabel}</b></Text>
            <Text>{docType === 'invoice' ? 'Számlaszám' : 'Szállítólevél szám'}: <b>{docNumber}</b></Text>
            <Text>Teljesítés dátuma: <b>{fulfillmentDate.format('YYYY-MM-DD')}</b></Text>
            <Text>Tételek száma: <b>{lines.length}</b></Text>
            <Text style={{ fontSize: 20 }}>Végösszeg: <b>{total.toLocaleString('hu-HU')} Ft</b></Text>
            <div>
              <Text strong>Megjegyzés</Text>
              <Input.TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <Space>
              <Button size="large" onClick={() => setStep(2)}>Vissza</Button>
              <Button type="primary" size="large" loading={submitting} onClick={handleFinalize}>
                Bevételezés véglegesítése
              </Button>
            </Space>
          </Space>
        </Card>
      )}
    </div>
  );
};

// ── C2. Bevételezések listája (alap nézet) + szerkesztés/törlés ─────────────
const ReceiptBatchLines: React.FC<{ batchId: number }> = ({ batchId }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/warehouse/material-receipt-batches/${batchId}/`)
      .then(r => setLines(r.data.lines || []))
      .catch(() => message.error('Nem sikerült betölteni a tételeket'))
      .finally(() => setLoading(false));
  }, [batchId]);

  return (
    <Table
      size="small"
      rowKey="id"
      loading={loading}
      dataSource={lines}
      pagination={false}
      columns={[
        { title: 'Név', key: 'name', render: (_: any, l: any) => `${l.material_name} (${l.material_code})` },
        { title: 'Mennyiség', key: 'quantity', width: 140, render: (_: any, l: any) => `${l.quantity} ${l.unit || l.material_unit || ''}` },
        { title: 'Egységár', dataIndex: 'unit_price', key: 'unit_price', width: 140,
          render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
        { title: 'Végösszeg', dataIndex: 'line_total', key: 'line_total', width: 140,
          render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
      ]}
    />
  );
};

const ReceiptScreen: React.FC<{ onBack: () => void; allowedWarehouseIds: number[] }> = ({ onBack, allowedWarehouseIds }) => {
  const [mode, setMode] = useState<'list' | 'wizard'>('list');
  const [editingBatch, setEditingBatch] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    api.get('/warehouse/material-receipt-batches/', { params: { search: q, page_size: 200 } })
      .then(r => setBatches(r.data.results || r.data || []))
      .catch(() => message.error('Nem sikerült betölteni a bevételezéseket'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(''); }, [load]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(val), 350);
  };

  const openEdit = async (row: any) => {
    try {
      const r = await api.get(`/warehouse/material-receipt-batches/${row.id}/`);
      setEditingBatch(r.data);
      setMode('wizard');
    } catch {
      message.error('Nem sikerült betölteni a bevételezés adatait');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/warehouse/material-receipt-batches/${id}/`);
      message.success('Bevételezés törölve');
      load(search);
    } catch {
      message.error('Hiba a törlés során');
    }
  };

  if (mode === 'wizard') {
    return (
      <ReceiptWizard
        onBack={() => { setMode('list'); setEditingBatch(null); }}
        allowedWarehouseIds={allowedWarehouseIds}
        editingBatch={editingBatch || undefined}
        onSaved={() => { setMode('list'); setEditingBatch(null); load(search); }}
      />
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Bevételezések"
        onBack={onBack}
        extra={
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => { setEditingBatch(null); setMode('wizard'); }}>
            Új bevételezés
          </Button>
        }
      />
      <Card>
        <Input
          size="large"
          prefix={<SearchOutlined />}
          placeholder="Keresés termék név, leírás vagy beszállító alapján..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          allowClear
          style={{ width: 400, marginBottom: 12 }}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={batches}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="Nincs bevételezés" /> }}
          expandable={{
            expandedRowRender: (r: any) => <ReceiptBatchLines batchId={r.id} />,
          }}
          columns={[
            { title: 'Dátum', dataIndex: 'receipt_date', key: 'receipt_date', width: 110 },
            { title: 'Beszállító', dataIndex: 'supplier_name', key: 'supplier_name', render: (v: string) => v || '-' },
            { title: 'Raktár', dataIndex: 'warehouse_name', key: 'warehouse_name' },
            { title: 'Bruttó összeg', dataIndex: 'total_amount', key: 'total_amount', width: 150,
              render: (v: number) => `${(v || 0).toLocaleString('hu-HU')} Ft` },
            { title: 'Megjegyzés', dataIndex: 'notes', key: 'notes', ellipsis: true },
            {
              title: '', key: 'actions', width: 160,
              render: (_: any, r: any) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(r)}>Szerkesztés</Button>
                  <Button
                    size="small" danger
                    onClick={() => {
                      Modal.confirm({
                        title: 'Biztosan törlöd ezt a bevételezést?',
                        okText: 'Törlés', okType: 'danger', cancelText: 'Mégse',
                        onOk: () => handleDelete(r.id),
                      });
                    }}
                  >
                    Törlés
                  </Button>
                </Space>
              ),
            },
          ]}
          scroll={{ y: 'calc(100vh - 400px)' }}
        />
      </Card>
    </div>
  );
};

// ── D. Leltár ────────────────────────────────────────────────────────────────
const StocktakeScreen: React.FC<{ onBack: () => void; allowedWarehouseIds: number[] }> = ({ onBack, allowedWarehouseIds }) => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addSearch, setAddSearch] = useState<MaterialLite[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get('/warehouse/warehouses/', { params: { is_active: true, page_size: 500 } })
      .then(r => {
        const list = r.data.results || r.data || [];
        setWarehouses(list);
        const preferred = allowedWarehouseIds.length ? list.find((w: any) => allowedWarehouseIds.includes(w.id)) : list[0];
        if (preferred) setWarehouseId(preferred.id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInventory = useCallback((whId: number) => {
    setLoading(true);
    api.get('/warehouse/inventory/', { params: { warehouse: whId, page_size: 2000 } })
      .then(r => setRows(r.data.results || r.data || []))
      .catch(() => message.error('Nem sikerült betölteni a leltárt'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (warehouseId) loadInventory(warehouseId); }, [warehouseId, loadInventory]);

  const saveCount = async (row: any) => {
    const counted = counts[row.id];
    if (counted === undefined) return;
    setSavingId(row.id);
    try {
      const res = await api.patch(`/warehouse/inventory/${row.id}/`, { quantity: counted });
      setRows(prev => prev.map(r => r.id === row.id ? res.data : r));
      message.success('Leltár rögzítve');
    } catch {
      message.error('Hiba a mentés során');
    } finally {
      setSavingId(null);
    }
  };

  const searchToAdd = (val: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (!val.trim()) { setAddSearch([]); return; }
      api.get('/warehouse/materials/', { params: { search: val, page_size: 20, is_active: true } })
        .then(r => setAddSearch(r.data.results || r.data || []))
        .catch(() => {});
    }, 300);
  };

  const addToInventory = async (materialId: number) => {
    if (!warehouseId) return;
    try {
      const res = await api.post('/warehouse/inventory/', { material: materialId, warehouse: warehouseId, quantity: 0 });
      setRows(prev => [res.data, ...prev]);
      setAddSearch([]);
      message.success('Hozzáadva a leltárhoz');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a hozzáadás során (talán már szerepel a listában)');
    }
  };

  return (
    <div>
      <ScreenHeader title="Leltár" onBack={onBack} />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Select
            size="large"
            style={{ width: 260 }}
            placeholder="Válassz raktárat"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
          />
          <Select
            size="large"
            style={{ width: 360 }}
            showSearch
            filterOption={false}
            placeholder="Termék hozzáadása a leltárhoz..."
            onSearch={searchToAdd}
            value={null}
            onSelect={(v: any) => addToInventory(v)}
            options={addSearch.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
          />
        </Space>
      </Card>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="Nincs leltári tétel ebben a raktárban" /> }}
          columns={[
            { title: 'Cikkszám', dataIndex: 'material_code', key: 'material_code', width: 140 },
            { title: 'Név', dataIndex: 'material_name', key: 'material_name' },
            { title: 'Nyilvántartott', dataIndex: 'quantity', key: 'quantity', width: 140,
              render: (v: number, r: any) => `${v} ${r.material_unit || ''}` },
            {
              title: 'Megszámolt', key: 'counted', width: 200,
              render: (_: any, r: any) => (
                <InputNumber
                  size="large"
                  style={{ width: 140 }}
                  min={0}
                  value={counts[r.id] !== undefined ? counts[r.id] : r.quantity}
                  onChange={(v) => setCounts(prev => ({ ...prev, [r.id]: v ?? 0 }))}
                />
              ),
            },
            {
              title: '', key: 'save', width: 120,
              render: (_: any, r: any) => (
                <Button type="primary" size="large" loading={savingId === r.id} onClick={() => saveCount(r)}>
                  Mentés
                </Button>
              ),
            },
          ]}
          scroll={{ y: 'calc(100vh - 420px)' }}
        />
      </Card>
    </div>
  );
};

// ── E. Kassza be/ki ──────────────────────────────────────────────────────────
const CashScreen: React.FC<{ onBack: () => void; cashRegisterId: number | null }> = ({ onBack, cashRegisterId }) => {
  const [balance, setBalance] = useState<{ current_balance: number; currency: string; name: string } | null>(null);
  const [reasons, setReasons] = useState<any[]>([]);
  const [modal, setModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const loadBalance = useCallback(() => {
    if (!cashRegisterId) return;
    api.get(`/finance/cash-registers/${cashRegisterId}/balance/`)
      .then(r => setBalance(r.data))
      .catch(() => {});
  }, [cashRegisterId]);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => {
    api.get('/finance/cash-transaction-reasons/', { params: { is_active: true } })
      .then(r => setReasons(r.data.results || r.data || []))
      .catch(() => {});
  }, []);

  const openModal = (type: 'deposit' | 'withdraw') => {
    form.resetFields();
    setModal(type);
  };

  const handleSubmit = async (values: any) => {
    if (!cashRegisterId || !modal) return;
    setSubmitting(true);
    try {
      await api.post(`/finance/cash-transactions/${modal}/`, {
        cash_register: cashRegisterId,
        amount: values.amount,
        reason: values.reason,
        note: values.note || '',
      });
      message.success(modal === 'deposit' ? 'Betét rögzítve' : 'Kivét rögzítve');
      setModal(null);
      loadBalance();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba történt');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReasons = reasons.filter(r => modal === 'deposit' ? r.is_deposit : r.is_withdrawal);

  return (
    <div>
      <ScreenHeader title="Kassza" onBack={onBack} />
      {!cashRegisterId ? (
        <Empty description="Ehhez a POS-hoz nincs kassza rendelve." />
      ) : (
        <>
          <Card style={{ marginBottom: 24, maxWidth: 420 }}>
            <Statistic
              title={balance?.name || 'Kassza egyenleg'}
              value={balance?.current_balance ?? 0}
              suffix={balance?.currency}
              valueStyle={{ fontSize: 40 }}
            />
          </Card>
          <Space size="large">
            <Button
              type="primary" size="large" icon={<PlusOutlined />}
              style={{ height: 100, width: 200, fontSize: 20, background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => openModal('deposit')}
            >
              Betét
            </Button>
            <Button
              danger size="large" icon={<MinusOutlined />}
              style={{ height: 100, width: 200, fontSize: 20 }}
              onClick={() => openModal('withdraw')}
            >
              Kivét
            </Button>
          </Space>
        </>
      )}

      <Modal
        title={modal === 'deposit' ? 'Betét' : 'Kivét'}
        open={!!modal}
        onCancel={() => setModal(null)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} size="large">
          <Form.Item name="amount" label="Összeg" rules={[{ required: true, message: 'Kötelező' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="reason" label="Mire?" rules={[{ required: true, message: 'Kötelező' }]}>
            <Select options={filteredReasons.map(r => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="note" label="Megjegyzés">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>OK</Button>
        </Form>
      </Modal>
    </div>
  );
};

// ── Main menu ────────────────────────────────────────────────────────────────
const POSAdmin: React.FC<POSAdminProps> = ({ cashRegisterId, allowedWarehouseIds, onBackToPos }) => {
  const [screen, setScreen] = useState<AdminScreen>('menu');

  if (screen === 'labels') return <div style={{ padding: 24 }}><LabelsScreen onBack={() => setScreen('menu')} /></div>;
  if (screen === 'promo') return <div style={{ padding: 24 }}><PromoScreen onBack={() => setScreen('menu')} /></div>;
  if (screen === 'receipt') return <div style={{ padding: 24 }}><ReceiptScreen onBack={() => setScreen('menu')} allowedWarehouseIds={allowedWarehouseIds} /></div>;
  if (screen === 'stocktake') return <div style={{ padding: 24 }}><StocktakeScreen onBack={() => setScreen('menu')} allowedWarehouseIds={allowedWarehouseIds} /></div>;
  if (screen === 'cash') return <div style={{ padding: 24 }}><CashScreen onBack={() => setScreen('menu')} cashRegisterId={cashRegisterId} /></div>;

  const menuItems: { key: AdminScreen; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'labels', label: 'Polc címkék nyomtatása', icon: <TagsOutlined style={{ fontSize: 40 }} />, color: '#1677ff' },
    { key: 'promo', label: 'Akciós árak beállítása', icon: <PercentageOutlined style={{ fontSize: 40 }} />, color: '#fa8c16' },
    { key: 'receipt', label: 'Bevételezés', icon: <InboxOutlined style={{ fontSize: 40 }} />, color: '#52c41a' },
    { key: 'stocktake', label: 'Leltár', icon: <FileSearchOutlined style={{ fontSize: 40 }} />, color: '#722ed1' },
    { key: 'cash', label: 'Kassza (be/ki)', icon: <DollarOutlined style={{ fontSize: 40 }} />, color: '#eb2f96' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Adminisztráció</Title>
        <Button size="large" onClick={onBackToPos}>Vissza a kasszához</Button>
      </div>
      <Row gutter={[24, 24]}>
        {menuItems.map(item => (
          <Col key={item.key} xs={24} sm={12} md={8}>
            <Card
              hoverable
              style={bigButtonCardStyle}
              onClick={() => setScreen(item.key)}
              styles={{ body: { width: '100%' } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: item.color }}>
                {item.icon}
                <Text strong style={{ fontSize: 18, color: '#333' }}>{item.label}</Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default POSAdmin;
