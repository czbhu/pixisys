import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Card, Button, Row, Col, Typography, Input, Table, Modal, Form, InputNumber, Select,
  DatePicker, message, Space, Statistic, Empty, Steps, Tag, Segmented,
} from 'antd';
import {
  TagsOutlined, PercentageOutlined, InboxOutlined, FileSearchOutlined, DollarOutlined,
  ArrowLeftOutlined, PrinterOutlined, PlusOutlined, MinusOutlined, SearchOutlined,
  ScanOutlined, CameraOutlined, EditOutlined, DeleteOutlined, FileDoneOutlined, SwapOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';
import api from '../../services/api';
import QRScannerModal from '../../components/QRScannerModal';
import ShiftHandoverScreen from './components/ShiftHandoverScreen';

const { Title, Text } = Typography;

interface POSAdminProps {
  cashRegisterId: number | null;
  allowedWarehouseIds: number[];
  fuelModuleEnabled?: boolean;
  onBackToPos: () => void;
}

type AdminScreen = 'menu' | 'labels' | 'promo' | 'receipt' | 'stocktake' | 'cash' | 'documents' | 'shift';

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
interface StocktakeRow {
  material: number;
  material_code: string;
  material_name: string;
  material_unit: string;
  book_quantity: number;
}

const ST_PAGE_SIZE = 50;

const fmtFt = (v: number) => `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(v || 0)} Ft`;

const StocktakeScreen: React.FC<{ onBack: () => void; allowedWarehouseIds: number[] }> = ({ onBack, allowedWarehouseIds }) => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0); // 0 = leltár lista, 1 = raktár kiválasztása, 2 = számlálás
  const [stList, setStList] = useState<any[]>([]);
  const [stLoading, setStLoading] = useState(false);
  const [editSt, setEditSt] = useState<any | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const barcodeRef = useRef<any>(null);

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

  const countedOf = (r: StocktakeRow) => (counts[r.material] !== undefined ? counts[r.material] : 0);

  const loadStocktakes = useCallback(() => {
    setStLoading(true);
    api.get('/warehouse/stocktakes/')
      .then(r => setStList(r.data.results || r.data || []))
      .catch(() => message.error('Nem sikerült betölteni a leltárakat'))
      .finally(() => setStLoading(false));
  }, []);

  useEffect(() => { loadStocktakes(); }, [loadStocktakes]);

  const loadRows = useCallback((whId: number, initCountsToBook = false) => {
    setLoading(true);
    api.get('/warehouse/materials/stocktake/', { params: { warehouse: whId } })
      .then(r => {
        const items: StocktakeRow[] = r.data.items || [];
        setRows(items);
        setCounts(initCountsToBook
          ? Object.fromEntries(items.map(r => [r.material, r.book_quantity]))
          : {});
        setPage(1);
      })
      .catch(() => message.error('Nem sikerült betölteni a leltári listát'))
      .finally(() => setLoading(false));
  }, []);

  const startStocktake = () => {
    if (!warehouseId) { message.warning('Először válassz raktárat!'); return; }
    setStep(2);
    loadRows(warehouseId);
    setTimeout(() => barcodeRef.current?.focus(), 250);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.material_code.toLowerCase().includes(q) ||
      r.material_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Zöld: nyilvántartott = megszámolt | Piros: nyilvántartott > megszámolt | Sárga: nyilvántartott < megszámolt
  const stats = useMemo(() => {
    let green = 0, red = 0, yellow = 0;
    for (const r of rows) {
      const c = countedOf(r);
      if (Math.abs(c - r.book_quantity) < 0.001) green++;
      else if (r.book_quantity > c) red++;
      else yellow++;
    }
    return { green, red, yellow, total: rows.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, counts]);

  const rowClass = (r: StocktakeRow) => {
    const c = countedOf(r);
    let cls = Math.abs(c - r.book_quantity) < 0.001 ? 'st-row-green' : (r.book_quantity > c ? 'st-row-red' : 'st-row-yellow');
    if (highlightId === r.material) cls += ' st-row-flash';
    return cls;
  };

  const jumpToMaterial = (matId: number) => {
    let idx = filtered.findIndex(r => r.material === matId);
    if (idx === -1) {
      // Ha épp szűrés van és a sor nem látszik, szűrés törlése
      setSearch('');
      idx = rows.findIndex(r => r.material === matId);
    }
    if (idx === -1) {
      message.warning('Ez a termék nem szerepel a kiválasztott raktár leltárában (nincs készletsora itt).');
      return;
    }
    setPage(Math.floor(idx / ST_PAGE_SIZE) + 1);
    setHighlightId(matId);
    setTimeout(() => {
      const tr = document.querySelector(`tr[data-row-key="${matId}"]`);
      tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const input = document.getElementById(`st-count-${matId}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 150);
    setTimeout(() => setHighlightId(null), 3000);
  };

  const handleBarcode = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setBarcode('');
    // 1) cikkszám egyezés
    let matId: number | undefined = rows.find(r => r.material_code.toLowerCase() === code.toLowerCase())?.material;
    // 2) vonalkód keresés
    if (!matId) {
      try {
        const res = await api.get('/warehouse/material-barcodes/', { params: { code } });
        const list = res.data.results || res.data || [];
        if (list.length > 0) matId = list[0].material;
      } catch { /* ignore */ }
    }
    if (!matId) {
      message.warning(`Ismeretlen kód: ${code}`);
      barcodeRef.current?.focus();
      return;
    }
    jumpToMaterial(matId);
  };

  const saveStocktake = () => {
    if (!warehouseId) return;
    const changing = stats.red + stats.yellow;
    if (changing === 0) { message.info('Nincs eltérés a leltárban, nincs mit rögzíteni.'); return; }
    Modal.confirm({
      title: 'Leltár rögzítése',
      width: 560,
      content: (
        <div>
          <p>Biztosan rögzíted a leltárt?</p>
          <Space wrap>
            <Tag color="green" style={{ fontSize: 14, padding: '4px 10px' }}>Egyezik: {stats.green}</Tag>
            <Tag color="red" style={{ fontSize: 14, padding: '4px 10px' }}>Hiány: {stats.red}</Tag>
            <Tag color="gold" style={{ fontSize: 14, padding: '4px 10px' }}>Többlet: {stats.yellow}</Tag>
          </Space>
          <p style={{ color: '#999', marginTop: 12 }}>
            A nyilvántartott készlet a megszámolt értékre módosul ({changing} termék).
            Figyelem: a nem módosított sorok megszámolt értéke 0, így a fel nem számolt termékek készlete nullázódik!
          </p>
        </div>
      ),
      okText: 'Rögzítés',
      cancelText: 'Mégse',
      onOk: async () => {
        setSaving(true);
        try {
          const items = rows.map(r => ({ material: r.material, counted: countedOf(r) }));
          const res = await api.post('/warehouse/materials/stocktake-save/', { warehouse: warehouseId, items });
          message.success(`Leltár rögzítve: ${res.data.updated} módosítva, ${res.data.created} létrehozva, ${res.data.unchanged} egyező`);
          setStep(0);
          setSearch('');
          loadStocktakes();
        } catch (err: any) {
          message.error(err?.response?.data?.error || 'Hiba a leltár rögzítése során');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const openEdit = (row: any) => {
    setEditSt(row);
    setEditNote(row.note || '');
    api.get(`/warehouse/stocktakes/${row.id}/`)
      .then(r => setEditSt(r.data))
      .catch(() => message.error('Nem sikerült betölteni a leltár részleteit'));
  };

  const saveNote = async () => {
    if (!editSt) return;
    setEditSaving(true);
    try {
      await api.patch(`/warehouse/stocktakes/${editSt.id}/`, { note: editNote });
      message.success('Megjegyzés mentve');
      setEditSt(null);
      loadStocktakes();
    } catch {
      message.error('Hiba a mentés során');
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDeleteSt = (row: any) => {
    Modal.confirm({
      title: 'Leltár törlése',
      content: (
        <div>
          <p>Biztosan törlöd a(z) <b>{row.warehouse_name}</b> raktár {dayjs(row.date).format('YYYY-MM-DD HH:mm')}-i leltárát?</p>
          <p style={{ color: '#cf1322' }}>Figyelem: a leltár rögzítésekor végrehajtott készletkorrekciók nem lesznek visszavonva!</p>
        </div>
      ),
      okText: 'Törlés',
      okButtonProps: { danger: true },
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          await api.delete(`/warehouse/stocktakes/${row.id}/`);
          message.success('Leltár törölve');
          loadStocktakes();
        } catch {
          message.error('Hiba a törlés során');
        }
      },
    });
  };

  const summaryBox = (label: string, value: number, colors: { bg: string; border: string; text: string }) => (
    <div style={{
      flex: '1 1 150px', background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 150,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors.text, lineHeight: 1.2 }}>{value}</div>
      <div style={{ color: colors.text, fontSize: 14 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <style>{`
        .st-row-green > td { background: #f6ffed !important; }
        .st-row-red > td { background: #fff1f0 !important; }
        .st-row-yellow > td { background: #fffbe6 !important; }
        .st-row-green:hover > td, .st-row-red:hover > td, .st-row-yellow:hover > td { filter: brightness(0.96); }
        @keyframes st-flash { 0%, 100% { outline-color: rgba(22,119,255,0); } 50% { outline-color: rgba(22,119,255,1); } }
        .st-row-flash > td { outline: 3px solid rgba(22,119,255,0.9); outline-offset: -3px; animation: st-flash 0.8s ease-in-out 3; }
        .st-count-input .ant-input-number-input { font-size: 18px; text-align: center; font-weight: 600; }
      `}</style>
      <ScreenHeader
        title="Leltár"
        onBack={onBack}
        extra={
          step === 0 ? (
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setStep(1)}>
              Új leltár
            </Button>
          ) : step === 1 ? (
            <Button size="large" onClick={() => setStep(0)}>Vissza a leltárakhoz</Button>
          ) : (
            <Space>
              <Button size="large" onClick={() => { setStep(0); setSearch(''); }}>Leltárak</Button>
              <Button type="primary" size="large" loading={saving} onClick={saveStocktake}>
                Leltár rögzítése ({stats.red + stats.yellow} eltérés)
              </Button>
            </Space>
          )
        }
      />
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 24, maxWidth: 760 }}
        items={[{ title: 'Leltárak' }, { title: 'Raktár kiválasztása' }, { title: 'Termékek megszámolása' }]}
      />

      {step === 0 ? (
        <Card>
          <Table
            rowKey="id"
            loading={stLoading}
            dataSource={stList}
            pagination={{ pageSize: 15, showTotal: t => `Összesen ${t} leltár` }}
            locale={{ emptyText: <Empty description="Még nincs rögzített leltár – kezdj egy újat az 'Új leltár' gombbal!" /> }}
            columns={[
              {
                title: 'Dátum', dataIndex: 'date', key: 'date', width: 200,
                render: (v: string, r: any) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{dayjs(v).format('YYYY-MM-DD HH:mm')}</div>
                    <div style={{ color: '#999', fontSize: 12 }}>{r.warehouse_name}</div>
                  </div>
                ),
              },
              { title: 'Készítette', dataIndex: 'created_by_name', key: 'created_by_name', width: 160, render: (v: string) => v || '-' },
              {
                title: 'Leltár értéke (beszerzés)', dataIndex: 'purchase_value', key: 'purchase_value', width: 200, align: 'right' as const,
                render: (v: number) => <span style={{ fontWeight: 600 }}>{fmtFt(v)}</span>,
              },
              {
                title: 'Leltár értéke (rögzítés)', dataIndex: 'book_value', key: 'book_value', width: 200, align: 'right' as const,
                render: (v: number) => fmtFt(v),
              },
              {
                title: 'Eltérés', dataIndex: 'difference', key: 'difference', width: 170, align: 'right' as const,
                render: (v: number) => {
                  if (Math.abs(v) < 0.01) return <Tag>0 Ft</Tag>;
                  return <Tag color={v < 0 ? 'red' : 'gold'}>{(v > 0 ? '+' : '') + new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(v)} Ft</Tag>;
                },
              },
              { title: 'Megjegyzés', dataIndex: 'note', key: 'note', ellipsis: true, render: (v: string) => v || '-' },
              {
                title: 'Műveletek', key: 'ops', width: 230,
                render: (_: any, r: any) => (
                  <Space>
                    <Button icon={<EditOutlined />} onClick={() => openEdit(r)}>Szerkesztés</Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => confirmDeleteSt(r)}>Törlés</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      ) : step === 1 ? (
        <Card style={{ maxWidth: 560 }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Text strong style={{ fontSize: 18 }}>Melyik raktárban véggezzük a leltárt?</Text>
            <Select
              size="large"
              style={{ width: '100%' }}
              placeholder="Válassz raktárat"
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            />
            <Button type="primary" size="large" block icon={<FileSearchOutlined />} onClick={startStocktake}>
              Leltár indítása
            </Button>
          </Space>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Space wrap size="middle" style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
              <Space.Compact style={{ flex: '1 1 420px', minWidth: 320 }}>
                <Input
                  ref={barcodeRef}
                  size="large"
                  prefix={<ScanOutlined />}
                  placeholder="Vonalkód / cikkszám beolvasása → Enter: ugrás a sorra"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  onPressEnter={() => handleBarcode(barcode)}
                  allowClear
                />
                <Button size="large" icon={<CameraOutlined />} onClick={() => setCameraOpen(true)} title="Beolvasás kamerával">
                  Kamera
                </Button>
              </Space.Compact>
              <Input
                size="large"
                prefix={<SearchOutlined />}
                placeholder="Szűrés cikkszám/névre"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ width: 280 }}
                allowClear
              />
            </Space>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {summaryBox('Egyezik (zöld)', stats.green, { bg: '#f6ffed', border: '#b7eb8f', text: '#389e0d' })}
              {summaryBox('Hiány (piros)', stats.red, { bg: '#fff1f0', border: '#ffa39e', text: '#cf1322' })}
              {summaryBox('Többlet (sárga)', stats.yellow, { bg: '#fffbe6', border: '#ffe58f', text: '#d48806' })}
              {summaryBox('Összes termék', stats.total, { bg: '#f5f5f5', border: '#d9d9d9', text: '#555' })}
            </div>
          </Card>
          <Card>
            <Table
              rowKey="material"
              loading={loading}
              dataSource={filtered}
              rowClassName={rowClass as any}
              pagination={{
                pageSize: ST_PAGE_SIZE,
                current: page,
                onChange: p => setPage(p),
                showSizeChanger: false,
                showTotal: t => `Összesen ${t} termék`,
              }}
              locale={{ emptyText: <Empty description="Nincs a szűrésnek megfelelő termék" /> }}
              columns={[
                { title: 'Cikkszám', dataIndex: 'material_code', key: 'material_code', width: 160 },
                { title: 'Név', dataIndex: 'material_name', key: 'material_name' },
                {
                  title: 'Nyilvántartott', dataIndex: 'book_quantity', key: 'book_quantity', width: 160,
                  render: (v: number, r: StocktakeRow) => (
                    <span style={{ fontWeight: 600 }}>
                      {Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} {r.material_unit}
                    </span>
                  ),
                },
                {
                  title: 'Megszámolt', key: 'counted', width: 170,
                  render: (_: any, r: StocktakeRow) => (
                    <InputNumber
                      id={`st-count-${r.material}`}
                      className="st-count-input"
                      size="large"
                      style={{ width: 130 }}
                      min={0}
                      value={counts[r.material] ?? 0}
                      onChange={v => setCounts(prev => ({ ...prev, [r.material]: v ?? 0 }))}
                    />
                  ),
                },
                {
                  title: 'Eltérés', key: 'diff', width: 110,
                  render: (_: any, r: StocktakeRow) => {
                    const d = Math.round((countedOf(r) - r.book_quantity) * 1000) / 1000;
                    if (Math.abs(d) < 0.001) return <Tag color="green">0</Tag>;
                    return <Tag color={d < 0 ? 'red' : 'gold'}>{d > 0 ? '+' : ''}{d}</Tag>;
                  },
                },
              ]}
              scroll={{ y: 'calc(100vh - 560px)' }}
            />
          </Card>
        </>
      )}

      <Modal
        title={editSt ? `Leltár szerkesztése – ${editSt.warehouse_name} (${dayjs(editSt.date).format('YYYY-MM-DD HH:mm')})` : 'Leltár'}
        open={!!editSt}
        onCancel={() => setEditSt(null)}
        width={960}
        footer={[
          <Button key="close" size="large" onClick={() => setEditSt(null)}>Bezárás</Button>,
          <Button key="save" type="primary" size="large" loading={editSaving} onClick={saveNote}>Megjegyzés mentése</Button>,
        ]}
      >
        {editSt && (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color="green" style={{ fontSize: 14 }}>Beszerzés: {fmtFt(editSt.purchase_value)}</Tag>
              <Tag color="blue" style={{ fontSize: 14 }}>Rögzítés: {fmtFt(editSt.book_value)}</Tag>
              <Tag color={editSt.difference < 0 ? 'red' : 'gold'} style={{ fontSize: 14 }}>
                Eltérés: {(editSt.difference > 0 ? '+' : '') + new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(editSt.difference)} Ft
              </Tag>
              <Tag style={{ fontSize: 14 }}>{editSt.item_count} tétel</Tag>
            </Space>
            <Table
              size="small"
              rowKey="id"
              dataSource={editSt.items || []}
              pagination={{ pageSize: 10, showTotal: t => `Összesen ${t} tétel` }}
              columns={[
                { title: 'Cikkszám', dataIndex: 'material_code', key: 'material_code', width: 110 },
                { title: 'Név', dataIndex: 'material_name', key: 'material_name', ellipsis: true },
                {
                  title: 'Nyilvántartott', dataIndex: 'book_quantity', key: 'book_quantity', width: 130, align: 'right' as const,
                  render: (v: any, r: any) => `${Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} ${r.material_unit}`,
                },
                {
                  title: 'Megszámolt', dataIndex: 'counted_quantity', key: 'counted_quantity', width: 120, align: 'right' as const,
                  render: (v: any, r: any) => `${Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} ${r.material_unit}`,
                },
                { title: 'Besz. ár', dataIndex: 'unit_cost_price', key: 'unit_cost_price', width: 110, align: 'right' as const, render: (v: any) => fmtFt(Number(v)) },
                { title: 'Érték (beszerzés)', dataIndex: 'purchase_value', key: 'purchase_value', width: 140, align: 'right' as const, render: (v: any) => fmtFt(Number(v)) },
                { title: 'Érték (rögzítés)', dataIndex: 'book_value', key: 'book_value', width: 140, align: 'right' as const, render: (v: any) => fmtFt(Number(v)) },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Text strong>Megjegyzés:</Text>
              <Input.TextArea
                rows={2}
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Pl. ki végezte a leltározást, rendellenességek..."
              />
            </div>
          </>
        )}
      </Modal>

      <QRScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(d) => { setCameraOpen(false); handleBarcode(d); }}
        title="Vonalkód beolvasása"
      />
    </div>
  );
};

// ── E. Bizonylatok (POS nyugták / számlák) ──────────────────────────────────
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Készpénz',
  card: 'Kártya',
  customer_card: 'Ügyfélkártya',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  receipt: 'Nyugta',
  invoice: 'Számla',
};

const PosDocumentLines: React.FC<{ transactionId: number }> = ({ transactionId }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/sales/pos/transactions/${transactionId}/`)
      .then(r => setDetail(r.data))
      .catch(() => message.error('Nem sikerült betölteni a bizonylat tételeit'))
      .finally(() => setLoading(false));
  }, [transactionId]);

  if (!detail) return loading ? <div style={{ padding: 8 }}>Betöltés…</div> : null;

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag>{TRANSACTION_TYPE_LABELS[detail.transaction_type] || detail.transaction_type}</Tag>
        <Tag color="blue">{PAYMENT_METHOD_LABELS[detail.payment_method] || detail.payment_method}</Tag>
        <Tag>Nettó: {Number(detail.total_net).toLocaleString('hu-HU')} Ft</Tag>
        <Tag>ÁFA: {Number(detail.total_vat).toLocaleString('hu-HU')} Ft</Tag>
        <Tag color="green">Bruttó: {Number(detail.total_gross).toLocaleString('hu-HU')} Ft</Tag>
        {detail.cashier_name && <Tag>Pénztáros: {detail.cashier_name}</Tag>}
        {detail.status === 'cancelled' && <Tag color="red">Sztornózva</Tag>}
        {detail.storno_reason ? <Tag color="red">Indok: {detail.storno_reason}</Tag> : null}
      </Space>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={detail.items || []}
        pagination={false}
        columns={[
          { title: 'Cikkszám', dataIndex: 'product_code', key: 'product_code', width: 130 },
          { title: 'Termék', dataIndex: 'product_name', key: 'product_name' },
          { title: 'Mennyiség', key: 'quantity', width: 130,
            render: (_: any, l: any) => `${Number(l.quantity).toLocaleString('hu-HU')} ${l.unit || ''}` },
          { title: 'Bruttó egységár', dataIndex: 'gross_unit_price', key: 'gross_unit_price', width: 150, align: 'right' as const,
            render: (v: number) => `${Number(v).toLocaleString('hu-HU')} Ft` },
          { title: 'Bruttó összesen', dataIndex: 'gross_total', key: 'gross_total', width: 150, align: 'right' as const,
            render: (v: number) => `${Number(v).toLocaleString('hu-HU')} Ft` },
        ]}
      />
    </div>
  );
};

const DocumentsScreen: React.FC<{ onBack: () => void; cashRegisterId: number | null }> = ({ onBack, cashRegisterId }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'valid' | 'stornoed'>('all');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sztornó
  const [stornoTarget, setStornoTarget] = useState<any | null>(null);
  const [stornoReason, setStornoReason] = useState('');
  const [stornoBusy, setStornoBusy] = useState(false);

  // Helyesbítés
  const [correctDetail, setCorrectDetail] = useState<any | null>(null);
  const [correctItems, setCorrectItems] = useState<any[]>([]);
  const [correctCustomer, setCorrectCustomer] = useState({ name: '', address: '', tax_number: '', email: '' });
  const [correctBusy, setCorrectBusy] = useState(false);

  const load = useCallback((q: string, f: string) => {
    setLoading(true);
    const params: any = { page_size: 200 };
    if (q) params.search = q;
    if (f === 'valid') params.status = 'completed';
    if (f === 'stornoed') params.status = 'cancelled';
    api.get('/sales/pos/transactions/', { params })
      .then(r => setDocs(r.data.results || r.data || []))
      .catch(() => message.error('Nem sikerült betölteni a bizonylatokat'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load('', filter); }, [load, filter]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(val, filter), 350);
  };

  const doStorno = async () => {
    if (!stornoTarget) return;
    setStornoBusy(true);
    try {
      const res = await api.post(`/sales/pos/transactions/${stornoTarget.id}/storno/`, {
        reason: stornoReason || '',
        cash_register: cashRegisterId,
      });
      message.success(res.data?.message || 'Bizonylat sztornózva');
      if (res.data?.fuel_rebill) {
        const fr = res.data.fuel_rebill;
        message.warning(
          `Üzemanyag tétel újrakibizonylatolandó: ${fr.name} | ${Number(fr.volume).toLocaleString('hu-HU')} liter | ${Number(fr.amount).toLocaleString('hu-HU')} Ft – a kasszaképernyőn piros mezőben kattintva teheted a kosárba.`,
          8
        );
      }
      setStornoTarget(null);
      setStornoReason('');
      load(search, filter);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a sztornózás során');
    } finally {
      setStornoBusy(false);
    }
  };

  const openCorrect = async (row: any) => {
    try {
      const r = await api.get(`/sales/pos/transactions/${row.id}/`);
      const detail = r.data;
      setCorrectDetail(detail);
      setCorrectItems((detail.items || []).map((l: any) => ({
        id: l.id,
        product_name: l.product_name,
        product_code: l.product_code,
        unit: l.unit,
        quantity: Number(l.quantity),
        gross_unit_price: Number(l.gross_unit_price),
      })));
      setCorrectCustomer({
        name: detail.customer_name || '',
        address: detail.customer_address || '',
        tax_number: detail.customer_tax_number || '',
        email: detail.customer_email || '',
      });
    } catch {
      message.error('Nem sikerült betölteni a bizonylat adatait');
    }
  };

  const correctTotal = correctItems.reduce((s, l) => s + l.quantity * l.gross_unit_price, 0);

  const doCorrect = async () => {
    if (!correctDetail) return;
    if (correctItems.some(l => !(l.quantity > 0) || l.gross_unit_price < 0)) {
      message.warning('Van érvénytelen mennyiség vagy egységár');
      return;
    }
    setCorrectBusy(true);
    try {
      const res = await api.post(`/sales/pos/transactions/${correctDetail.id}/correct/`, {
        customer_name: correctCustomer.name,
        customer_address: correctCustomer.address,
        customer_tax_number: correctCustomer.tax_number,
        customer_email: correctCustomer.email,
        items: correctItems.map(l => ({
          id: l.id,
          quantity: l.quantity,
          gross_unit_price: l.gross_unit_price,
        })),
      });
      message.success(res.data?.message || 'Bizonylat helyesbítve');
      setCorrectDetail(null);
      load(search, filter);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba a helyesbítés során');
    } finally {
      setCorrectBusy(false);
    }
  };

  const columns = [
    {
      title: 'Dátum', dataIndex: 'created_at', key: 'created_at', width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Sorszám', dataIndex: 'transaction_number', key: 'transaction_number', width: 230,
      render: (v: string, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <Space size={4}>
            <Tag style={{ marginRight: 0 }}>{TRANSACTION_TYPE_LABELS[r.transaction_type] || r.transaction_type}</Tag>
            <Tag style={{ marginRight: 0 }} color={r.payment_method === 'cash' ? 'green' : 'blue'}>
              {PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method}
            </Tag>
          </Space>
        </div>
      ),
    },
    {
      title: 'Vevő neve', dataIndex: 'customer_name_display', key: 'customer_name_display',
      render: (v: string) => v || '-',
    },
    {
      title: 'Összeg', dataIndex: 'total_gross', key: 'total_gross', width: 150, align: 'right' as const,
      render: (v: number, r: any) => {
        const text = `${Number(v).toLocaleString('hu-HU')} Ft`;
        if (r.is_stornoed) {
          return <span style={{ color: '#cf1322', textDecoration: 'line-through' }}>{text}</span>;
        }
        return <span style={{ fontWeight: 600 }}>{text}</span>;
      },
    },
    {
      title: 'Műveletek', key: 'actions', width: 260,
      render: (_: any, r: any) => r.is_stornoed ? (
        <Tag color="red">Sztornózva{r.storno_reason ? `: ${r.storno_reason}` : ''}</Tag>
      ) : r.status === 'completed' ? (
        <Space>
          <Button danger size="small" onClick={() => { setStornoTarget(r); setStornoReason(''); }}>
            Sztornózás
          </Button>
          <Button size="small" onClick={() => openCorrect(r)}>
            Helyesbítés
          </Button>
        </Space>
      ) : (
        <Tag>{r.status}</Tag>
      ),
    },
  ];

  return (
    <div>
      <ScreenHeader
        title="Bizonylatok"
        onBack={onBack}
        extra={
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as any)}
            options={[
              { label: 'Összes', value: 'all' },
              { label: 'Érvényes', value: 'valid' },
              { label: 'Sztornózott', value: 'stornoed' },
            ]}
          />
        }
      />
      <Card>
        <Input
          size="large"
          prefix={<SearchOutlined />}
          placeholder="Keresés sorszám vagy vevő neve alapján..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          allowClear
          style={{ width: 400, marginBottom: 12 }}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={docs}
          pagination={{ pageSize: 20, showTotal: t => `Összesen ${t} bizonylat` }}
          locale={{ emptyText: <Empty description="Nincs bizonylat" /> }}
          expandable={{
            expandedRowRender: (r: any) => <PosDocumentLines transactionId={r.id} />,
          }}
          columns={columns}
          scroll={{ y: 'calc(100vh - 400px)' }}
        />
      </Card>

      <Modal
        title={`Bizonylat sztornózása – ${stornoTarget?.transaction_number || ''}`}
        open={!!stornoTarget}
        onCancel={() => { setStornoTarget(null); setStornoReason(''); }}
        footer={null}
        destroyOnHidden
      >
        {stornoTarget && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              Bizonylat: <b>{stornoTarget.transaction_number}</b><br />
              Vevő: <b>{stornoTarget.customer_name_display || '-'}</b><br />
              Összeg: <b>{Number(stornoTarget.total_gross).toLocaleString('hu-HU')} Ft</b>
            </div>
            {stornoTarget.payment_method === 'cash' && cashRegisterId && (
              <Tag color="orange">
                Készpénzes fizetés: a teljes összeg kivétként kerül a kasszából
              </Tag>
            )}
            <div>
              <Text strong>Indok (nem kötelező)</Text>
              <Input.TextArea
                rows={2}
                value={stornoReason}
                onChange={e => setStornoReason(e.target.value)}
                placeholder="Pl. hibás rögzítés, vevő visszatérítette..."
                style={{ marginTop: 4 }}
              />
            </div>
            <Space>
              <Button size="large" onClick={() => { setStornoTarget(null); setStornoReason(''); }}>Mégse</Button>
              <Button type="primary" danger size="large" loading={stornoBusy} onClick={doStorno}>
                Sztornózás
              </Button>
            </Space>
          </Space>
        )}
      </Modal>

      <Modal
        title={`Bizonylat helyesbítése – ${correctDetail?.transaction_number || ''}`}
        open={!!correctDetail}
        onCancel={() => setCorrectDetail(null)}
        width={920}
        footer={null}
        destroyOnHidden
      >
        {correctDetail && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={12}>
              <Col span={12}>
                <Text strong>Vevő neve</Text>
                <Input style={{ marginTop: 4 }} value={correctCustomer.name}
                  onChange={e => setCorrectCustomer(c => ({ ...c, name: e.target.value }))} />
              </Col>
              <Col span={12}>
                <Text strong>Adószám</Text>
                <Input style={{ marginTop: 4 }} value={correctCustomer.tax_number}
                  onChange={e => setCorrectCustomer(c => ({ ...c, tax_number: e.target.value }))} />
              </Col>
              <Col span={12} style={{ marginTop: 8 }}>
                <Text strong>Cím</Text>
                <Input style={{ marginTop: 4 }} value={correctCustomer.address}
                  onChange={e => setCorrectCustomer(c => ({ ...c, address: e.target.value }))} />
              </Col>
              <Col span={12} style={{ marginTop: 8 }}>
                <Text strong>E-mail</Text>
                <Input style={{ marginTop: 4 }} value={correctCustomer.email}
                  onChange={e => setCorrectCustomer(c => ({ ...c, email: e.target.value }))} />
              </Col>
            </Row>
            <Table
              size="small"
              rowKey="id"
              dataSource={correctItems}
              pagination={false}
              columns={[
                { title: 'Cikkszám', dataIndex: 'product_code', width: 120 },
                { title: 'Termék', dataIndex: 'product_name' },
                {
                  title: 'Mennyiség', width: 140,
                  render: (_: any, l: any) => (
                    <InputNumber
                      size="small" style={{ width: 110 }} min={0}
                      value={l.quantity}
                      onChange={v => setCorrectItems(prev => prev.map(x => x.id === l.id ? { ...x, quantity: v ?? 0 } : x))}
                    />
                  ),
                },
                {
                  title: 'Bruttó egységár', width: 160,
                  render: (_: any, l: any) => (
                    <InputNumber
                      size="small" style={{ width: 130 }} min={0}
                      value={l.gross_unit_price}
                      onChange={v => setCorrectItems(prev => prev.map(x => x.id === l.id ? { ...x, gross_unit_price: v ?? 0 } : x))}
                    />
                  ),
                },
                {
                  title: 'Sor összesen', width: 140, align: 'right' as const,
                  render: (_: any, l: any) => `${(l.quantity * l.gross_unit_price).toLocaleString('hu-HU')} Ft`,
                },
              ]}
            />
            <div style={{ textAlign: 'right', fontSize: 18, fontWeight: 700 }}>
              Új végösszeg: {correctTotal.toLocaleString('hu-HU')} Ft
            </div>
            <Space>
              <Button size="large" onClick={() => setCorrectDetail(null)}>Mégse</Button>
              <Button type="primary" size="large" loading={correctBusy} onClick={doCorrect}>
                Helyesbítés mentése
              </Button>
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  );
};

// ── F. Kassza be/ki ──────────────────────────────────────────────────────────
const formatCashAmount = (value: number | string | null | undefined): string => {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? '0').replace(/\s/g, '').replace(',', '.'));
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  return `${sign}${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decPart}`;
};

const CashScreen: React.FC<{ onBack: () => void; cashRegisterId: number | null }> = ({ onBack, cashRegisterId }) => {
  const [balance, setBalance] = useState<{ current_balance: number; currency: string; name: string } | null>(null);
  const [reasons, setReasons] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [modal, setModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const loadBalance = useCallback(() => {
    if (!cashRegisterId) return;
    api.get(`/finance/cash-registers/${cashRegisterId}/balance/`)
      .then(r => setBalance(r.data))
      .catch(() => {});
  }, [cashRegisterId]);

  const loadTransactions = useCallback(() => {
    if (!cashRegisterId) return;
    setTxLoading(true);
    api.get('/finance/cash-transactions/', { params: { cash_register: cashRegisterId, page_size: 200 } })
      .then(r => setTransactions(r.data.results || r.data || []))
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [cashRegisterId]);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);
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
      loadTransactions();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Hiba történt');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReasons = reasons.filter(r => modal === 'deposit' ? r.is_deposit : r.is_withdrawal);

  const txColumns = [
    {
      title: 'Időpont', dataIndex: 'timestamp', key: 'timestamp', width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Összeg', dataIndex: 'amount', key: 'amount', width: 130,
      render: (v: number | string) => {
        const n = Number(v);
        return <Tag color={n >= 0 ? 'green' : 'red'}>{n >= 0 ? '+' : ''}{formatCashAmount(n)}</Tag>;
      },
    },
    {
      title: 'Miért?', dataIndex: 'reason_name', key: 'reason_name', width: 150,
      render: (v: string | null) => v || '-',
    },
    {
      title: 'Megjegyzés', dataIndex: 'note', key: 'note', ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: 'Kassza tartalma', dataIndex: 'balance_after', key: 'balance_after', width: 150,
      render: (v: number | string) => formatCashAmount(v),
    },
    {
      title: 'Alkalmazott', dataIndex: 'employee_name', key: 'employee_name', width: 150,
      render: (v: string, r: any) => v || r.employee_username || '-',
    },
  ];

  return (
    <div>
      <ScreenHeader title="Kassza" onBack={onBack} />
      {!cashRegisterId ? (
        <Empty description="Ehhez a POS-hoz nincs kassza rendelve." />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <Statistic
                title={balance?.name || 'Kassza egyenleg'}
                value={balance?.current_balance ?? 0}
                formatter={(v) => formatCashAmount(v as number)}
                suffix={balance?.currency}
                valueStyle={{ fontSize: 40 }}
              />
              <Space size="large">
                <Button
                  type="primary" size="large" icon={<PlusOutlined />}
                  style={{ height: 84, width: 170, fontSize: 18, background: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => openModal('deposit')}
                >
                  Betét
                </Button>
                <Button
                  danger size="large" icon={<MinusOutlined />}
                  style={{ height: 84, width: 170, fontSize: 18 }}
                  onClick={() => openModal('withdraw')}
                >
                  Kivét
                </Button>
              </Space>
            </div>
          </Card>
          <Card title="Pénzmozgások">
            <Table
              rowKey="id"
              loading={txLoading}
              dataSource={transactions}
              pagination={{ pageSize: 20, showTotal: t => `Összesen ${t} mozgás` }}
              locale={{ emptyText: <Empty description="Nincs rögzített pénzmozgás" /> }}
              columns={txColumns}
              scroll={{ y: 'calc(100vh - 480px)' }}
            />
          </Card>
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
const POSAdmin: React.FC<POSAdminProps> = ({ cashRegisterId, allowedWarehouseIds, fuelModuleEnabled, onBackToPos }) => {
  const [screen, setScreen] = useState<AdminScreen>('menu');

  if (screen === 'labels') return <div style={{ padding: 24 }}><LabelsScreen onBack={() => setScreen('menu')} /></div>;
  if (screen === 'promo') return <div style={{ padding: 24 }}><PromoScreen onBack={() => setScreen('menu')} /></div>;
  if (screen === 'receipt') return <div style={{ padding: 24 }}><ReceiptScreen onBack={() => setScreen('menu')} allowedWarehouseIds={allowedWarehouseIds} /></div>;
  if (screen === 'stocktake') return <div style={{ padding: 24 }}><StocktakeScreen onBack={() => setScreen('menu')} allowedWarehouseIds={allowedWarehouseIds} /></div>;
  if (screen === 'cash') return <div style={{ padding: 24 }}><CashScreen onBack={() => setScreen('menu')} cashRegisterId={cashRegisterId} /></div>;
  if (screen === 'documents') return <div style={{ padding: 24 }}><DocumentsScreen onBack={() => setScreen('menu')} cashRegisterId={cashRegisterId} /></div>;
  if (screen === 'shift') return <div style={{ padding: 24 }}><ShiftHandoverScreen onBack={() => setScreen('menu')} cashRegisterId={cashRegisterId} /></div>;

  const menuItems: { key: AdminScreen; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'documents', label: 'Bizonylatok', icon: <FileDoneOutlined style={{ fontSize: 40 }} />, color: '#13c2c2' },
    { key: 'labels', label: 'Polc címkék nyomtatása', icon: <TagsOutlined style={{ fontSize: 40 }} />, color: '#1677ff' },
    { key: 'promo', label: 'Akciós árak beállítása', icon: <PercentageOutlined style={{ fontSize: 40 }} />, color: '#fa8c16' },
    { key: 'receipt', label: 'Bevételezés', icon: <InboxOutlined style={{ fontSize: 40 }} />, color: '#52c41a' },
    { key: 'stocktake', label: 'Leltár', icon: <FileSearchOutlined style={{ fontSize: 40 }} />, color: '#722ed1' },
    { key: 'cash', label: 'Kassza (be/ki)', icon: <DollarOutlined style={{ fontSize: 40 }} />, color: '#eb2f96' },
    ...(fuelModuleEnabled
      ? [{ key: 'shift' as AdminScreen, label: 'Műszak átadás', icon: <SwapOutlined style={{ fontSize: 40 }} />, color: '#fa541c' }]
      : []),
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
