import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, message, Button, Select, Modal, Result, Tooltip,
  Tag, Space, Row, Col, Switch, Input, Alert, InputNumber,
} from 'antd';
import NumInput from '../../components/NumInput';
import {
  LockOutlined, UnlockOutlined, ShoppingOutlined, UserOutlined,
  LeftOutlined, RightOutlined, PlusCircleOutlined, ReloadOutlined,
  FileTextOutlined, ShareAltOutlined, CopyOutlined,
} from '@ant-design/icons';
import { crmService } from '../../services/crmService';
import { manufacturingService } from '../../services/manufacturingService';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { PrintParams } from './components/Step1Params';
import PrintParamsPanel, { PriceBreakdown } from './components/PrintParamsPanel';
import Step3OrderSummary from './components/Step3OrderSummary';
import PrintCommentView from './components/PrintCommentView';

const { Title, Text } = Typography;
const { Option } = Select;

interface Company { id: number; name: string; }
interface Contact { id: number; first_name: string; last_name: string; company?: number; }

interface PreviewShareSettings {
  enabled: boolean;
  editable: boolean;
  commentable: boolean;
  exportable: boolean;
  url: string;
}

const buildStandalonePreviewUrl = (orderId: number | null, itemId: number | null) => {
  if (!orderId || !itemId || typeof window === 'undefined') return '';
  return `${window.location.origin}/print-preview?orderId=${orderId}&itemId=${itemId}`;
};

const PARAMS_PANEL_W = 280;
const COLLAPSED_W = 28;

const DEFAULT_PARAMS: PrintParams = {
  product_name: 'A5 Szórólap',
  width_mm: 148,
  height_mm: 210,
  quantity: 100,
  sides: '1',
  side1_mode: 'color',
  side2_mode: 'none',
  binding: 'cut',
  folding_count: 0,
  folding_specs: [],
  material_id: null,
  multi_sheet_enabled: false,
  sheet_count: 1,
};

const STORAGE_KEY = 'pixierp_printshop_state';

const PrintShopPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = !!(user?.is_staff || user?.is_superuser);

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(true);
  const [params, setParams] = useState<PrintParams>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s).params ?? DEFAULT_PARAMS;
    } catch {}
    return DEFAULT_PARAMS;
  });

  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const existing = s ? JSON.parse(s) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, params }));
    } catch {}
  }, [params]);

  // PDF scale ratio: ratioLeft:ratioRight (e.g. 1:10 → multiply by 10, 2:1 → divide by 2)
  const [ratioLeft, setRatioLeft] = useState<number>(1);
  const [ratioRight, setRatioRight] = useState<number>(1);
  const scaleMultiplier = ratioRight / ratioLeft;
  // Raw (unscaled) TrimBox/MediaBox dimensions from last PDF analysis
  const [rawPdfSize, setRawPdfSize] = useState<{ width: number; height: number } | null>(null);

  const [orderId, setOrderId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).orderId; return v ?? null; } } catch {} return null;
  });
  const [itemId, setItemId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).itemId; return v ?? null; } } catch {} return null;
  });
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [saving, setSaving] = useState(false);
  const [rfqSaving, setRfqSaving] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  // Persist orderId/itemId to localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const existing = s ? JSON.parse(s) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, orderId, itemId }));
    } catch {}
  }, [orderId, itemId]);

  // Lock state
  const [editorLocked, setEditorLocked] = useState(false);
  const [previewLocked, setPreviewLocked] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [previewShare, setPreviewShare] = useState<PreviewShareSettings>({
    enabled: false, editable: false, commentable: true, exportable: false, url: '',
  });

  // Sync lock state when item is known
  useEffect(() => {
    if (!orderId || !itemId) return;
    api.get(`printshop/orders/${orderId}/`)
      .then(r => {
        const item = (r.data?.items ?? []).find((i: any) => i.id === itemId);
        if (item) {
          setEditorLocked(!!item.editor_locked);
          setPreviewLocked(!!item.preview_locked);
          setPreviewShare({
            enabled: !!item.preview_share_enabled,
            editable: !!item.preview_share_editable,
            commentable: item.preview_share_commentable !== false,
            exportable: !!item.preview_share_exportable,
            url: item.preview_share_url || '',
          });
        }
      }).catch(() => {});
  }, [orderId, itemId]);

  const handleSetLock = async (field: 'editor_locked' | 'preview_locked', value: boolean) => {
    if (!orderId || !itemId) return;
    setLockSaving(true);
    try {
      const r = await api.post(`printshop/orders/${orderId}/set-lock/`, {
        item_id: itemId, [field]: value,
      });
      setEditorLocked(r.data.editor_locked);
      setPreviewLocked(r.data.preview_locked);
      message.success(value ? 'Zárolva' : 'Feloldva');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hiba');
    } finally {
      setLockSaving(false);
    }
  };

  const handleSavePreviewShare = async () => {
    if (!orderId || !itemId) return;
    setShareSaving(true);
    try {
      const response = await api.post(`printshop/orders/${orderId}/preview-share/`, {
        item_id: itemId,
        enabled: previewShare.enabled,
        editable: previewShare.editable,
        commentable: previewShare.commentable,
        exportable: previewShare.exportable,
      });
      setPreviewShare({
        enabled: !!response.data?.enabled,
        editable: !!response.data?.editable,
        commentable: response.data?.commentable !== false,
        exportable: !!response.data?.exportable,
        url: response.data?.url || '',
      });
      message.success('Preview megosztás mentve');
      setShareModalOpen(false);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Nem sikerült a preview megosztást menteni');
    } finally {
      setShareSaving(false);
    }
  };

  const handleCopyPreviewShareUrl = async () => {
    if (!previewShare.url) return;
    try {
      await navigator.clipboard.writeText(previewShare.url);
      message.success('Link kimásolva');
    } catch {
      message.error('A link másolása nem sikerült');
    }
  };

  const handleCopyStandalonePreviewUrl = async () => {
    const previewUrl = buildStandalonePreviewUrl(orderId, itemId);
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      message.success('Preview oldal link kimásolva');
    } catch {
      message.error('A preview oldal link másolása nem sikerült');
    }
  };

  // ── PDF-based param auto-fill ──────────────────────────────────────────────
  const handlePdfFileChange = useCallback((file: File | null) => {
    if (!file) return;
    // Analyze via backend to get TrimBox and page count
    const formData = new FormData();
    formData.append('pdf', file);
    api.post('/printshop/pdf-analyze/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    }).then(resp => {
      const pages = resp.data?.pages ?? [];
      if (pages.length === 0) return;

      const totalPages = pages.length;
      const first = pages[0];

      // Determine dimensions: prefer TrimBox, fallback to MediaBox
      let widthMm: number | null = null;
      let heightMm: number | null = null;

      if (first.trimbox_mm) {
        widthMm = first.trimbox_mm.width;
        heightMm = first.trimbox_mm.height;
      } else if (first.mediabox_mm) {
        widthMm = first.mediabox_mm.width;
        heightMm = first.mediabox_mm.height;
      }

      // Compute sides and sheet_count from total page count
      // Default assumption: 2-sided if even pages, 1-sided if odd
      // sheet_count = pages / sides
      const currentParams = paramsRef.current;
      const newParams = { ...currentParams };

      if (widthMm != null && heightMm != null) {
        // Store raw dimensions for later ratio recalculation
        setRawPdfSize({ width: widthMm, height: heightMm });
        // Apply current ratio
        newParams.width_mm = Math.round(widthMm * scaleMultiplier);
        newParams.height_mm = Math.round(heightMm * scaleMultiplier);
        // Auto-set product name from file name
        const baseName = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
        if (baseName) {
          newParams.product_name = baseName;
        }
      }

      if (totalPages === 1) {
        // Single page PDF → always 1-sided, 1 sheet
        newParams.sides = '1';
        newParams.side2_mode = 'none';
        newParams.sheet_count = 1;
      } else {
        // Multi-page PDF: use current sides setting to calc sheet_count
        const sidesNum = newParams.sides === '2' ? 2 : 1;
        newParams.sheet_count = Math.ceil(totalPages / sidesNum);
        if (newParams.sides === '2' && newParams.side2_mode === 'none') {
          newParams.side2_mode = 'color';
        }
      }

      if ((newParams.sheet_count ?? 1) > 1) {
        newParams.multi_sheet_enabled = true;
      }

      setParams(newParams);
      message.success(
        `PDF elemezve: ${newParams.width_mm}×${newParams.height_mm} mm, ` +
        `${totalPages} oldal → ${newParams.sides === '2' ? 'kétoldalas' : 'egyoldalas'}, ` +
        `${newParams.sheet_count} ív`
      );
    }).catch(err => {
      console.warn('PDF analyze for auto-fill failed:', err);
    });
  }, [scaleMultiplier]);

  // ── Recalc dimensions when scale ratio changes (only if we have raw PDF size) ──
  useEffect(() => {
    if (!rawPdfSize) return;
    setParams(prev => ({
      ...prev,
      width_mm: Math.round(rawPdfSize.width * scaleMultiplier),
      height_mm: Math.round(rawPdfSize.height * scaleMultiplier),
    }));
  }, [scaleMultiplier, rawPdfSize]);

  // Admin: ügyfél/kapcsolattartó választó
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).selectedCompany; return v ?? null; } } catch {} return null;
  });
  const [selectedContact, setSelectedContact] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).selectedContact; return v ?? null; } } catch {} return null;
  });
  const [clientBarOpen, setClientBarOpen] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return !!JSON.parse(s).clientBarOpen; } catch {} return false;
  });

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const existing = s ? JSON.parse(s) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, selectedCompany, selectedContact, clientBarOpen }));
    } catch {}
  }, [selectedCompany, selectedContact, clientBarOpen]);

  const refreshCompanies = async () => {
    try {
      const list = await crmService.getCompanies({ is_customer: true, compact: true });
      const loaded = ((list as any).results ?? list) || [];
      setCompanies(Array.isArray(loaded) ? loaded : []);
    } catch {}
  };

  const refreshContacts = async (companyId?: number | null) => {
    const cid = companyId ?? selectedCompany;
    if (!cid) { setContacts([]); setSelectedContact(null); return; }
    try {
      if (cid === -1) {
        const list = await crmService.getPrivateContacts();
        setContacts(((list as any).results ?? list) || []);
      } else {
        const list = await crmService.getContactsByCompany(cid);
        setContacts(((list as any).results ?? list) || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (isAdmin && selectedCompany) {
      refreshCompanies();
      refreshContacts(selectedCompany);
    } else {
      setContacts([]);
    }
  }, [isAdmin, selectedCompany]); // eslint-disable-line

  // Bejelentkezés szükséges
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Result
          icon={<LockOutlined style={{ color: '#1890ff' }} />}
          title="Bejelentkezés szükséges"
          subTitle="A nyomtatás modul használatához be kell jelentkezned."
          extra={
            <Button type="primary" onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}>
              Bejelentkezés
            </Button>
          }
        />
      </div>
    );
  }

  const handleRFQ = async () => {
    setRfqSaving(true);
    try {
      const sheetCount = params.sheet_count ?? 1;
      const sidesText = params.sides === '2' ? 'kétoldalas' : 'egyoldalas';
      const description = `Íves nyomtatás: ${params.product_name || 'Termék'}\n` +
        `Méret: ${params.width_mm} × ${params.height_mm} mm, ${sidesText}\n` +
        `Mennyiség: ${params.quantity} db` +
        (sheetCount > 1 ? `, ${sheetCount} lap` : '') + '\n' +
        (params.binding && params.binding !== 'none' ? `Kötés: ${params.binding}\n` : '');

      const costItems: any[] = [];
      const bd = priceBreakdown as any;
      const r4 = (v: any) => Math.round((Number(v) || 0) * 10000) / 10000;
      const supId = (v: any) => (v && Number(v) > 0 ? Number(v) : null);
      if (bd) {
        if (bd.material_items) {
          for (const mi of bd.material_items) {
            const qty = r4(mi.units) || 1;
            const sellingPerUnit = r4(mi.price_per);
            const total = r4(mi.total);
            const costPerUnit = r4(mi.cost_price_per ?? sellingPerUnit);
            costItems.push({
              type: 'material', name: mi.name,
              quantity: qty, unit: 'ív',
              cost_price: costPerUnit, unit_price: sellingPerUnit,
              selling_unit_price: sellingPerUnit, selling_price: total,
              markup_percent: r4(mi.markup_percentage ?? 0),
              is_internal: mi.is_internal ?? false,
              supplier: supId(mi.supplier_id),
            });
          }
        }
        for (const key of ['print_service_items_1', 'print_service_items_2'] as const) {
          if (bd[key]) {
            for (const pi of bd[key]) {
              const qty = r4(pi.units) || 1;
              const total = r4(pi.total);
              const sellingPerUnit = qty > 0 ? r4(total / qty) : total;
              const costPerUnit = r4(pi.cost_price_per ?? sellingPerUnit);
              costItems.push({
                type: 'service', name: pi.name,
                quantity: qty, unit: pi.type === 'fixed' ? 'db' : 'ív',
                cost_price: costPerUnit, unit_price: sellingPerUnit,
                selling_unit_price: sellingPerUnit, selling_price: total,
                markup_percent: r4(pi.markup_percentage ?? 0),
                is_internal: pi.is_internal ?? false,
                department: pi.department_id ?? null,
                supplier: supId(pi.supplier_id),
              });
            }
          }
        }
        if (bd.service_breakdown) {
          for (const sb of bd.service_breakdown) {
            if (sb.items) {
              for (const si of sb.items) {
                const qty = r4(si.units) || 1;
                const total = r4(si.total);
                const sellingPerUnit = qty > 0 ? r4(total / qty) : total;
                const costPerUnit = r4(si.cost_price_per ?? sellingPerUnit);
                costItems.push({
                  type: 'service', name: `${sb.name}: ${si.name}`,
                  quantity: qty, unit: si.type === 'fixed' ? 'db' : 'db',
                  cost_price: costPerUnit, unit_price: sellingPerUnit,
                  selling_unit_price: sellingPerUnit, selling_price: total,
                  markup_percent: r4(si.markup_percentage ?? 0),
                  is_internal: si.is_internal ?? false,
                  department: si.department_id ?? null,
                  supplier: supId(si.supplier_id),
                });
              }
            } else if (sb.total > 0) {
              costItems.push({
                type: 'service', name: sb.name,
                quantity: 1, unit: 'db',
                cost_price: r4(sb.total), unit_price: r4(sb.total),
                selling_unit_price: r4(sb.total), selling_price: r4(sb.total),
                markup_percent: 0, is_internal: false, supplier: null,
              });
            }
          }
        }
      }

      const costItemsSellingTotal = costItems.reduce((sum: number, ci: any) => sum + (Number(ci.selling_price) || 0), 0);
      const unitPrice = params.quantity > 0 ? costItemsSellingTotal / params.quantity : 0;

      const payload: any = {
        name: params.product_name || `Íves nyomtatás ${params.width_mm}×${params.height_mm}mm`,
        description,
        quantity: params.quantity,
        quantity_unit: 'db',
        net_unit_price: Math.round(unitPrice * 100) / 100,
        status: 'quote_request_open',
        date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        contact: selectedContact && typeof selectedContact === 'number' ? selectedContact : undefined,
        cost_items: costItems,
      };

      const created = await manufacturingService.createProduct(payload);
      message.success('Ajánlat készítése...');
      const rfqParams = new URLSearchParams({
        create: 'true',
        add_item_id: String(created.id),
        add_item_type: 'manufacturing',
      });
      if (selectedCompany) rfqParams.set('company', String(selectedCompany));
      if (selectedContact) rfqParams.set('contact', String(selectedContact));
      window.open(`/sales/rfqs?${rfqParams.toString()}`, '_blank');
    } catch (e: any) {
      console.error('[handleRFQ] error:', e?.response?.data);
      message.error(e?.response?.data?.error || JSON.stringify(e?.response?.data) || 'Hiba az ajánlat létrehozásakor');
    } finally {
      setRfqSaving(false);
    }
  };

  const handleOrder = async () => {
    setSaving(true);
    try {
      const itemPayload = {
        product_name: params.product_name,
        material: params.material_id ?? undefined,
        quantity: params.quantity,
        width_mm: params.width_mm,
        height_mm: params.height_mm,
        sides: params.sides,
        side1_mode: params.side1_mode,
        side2_mode: params.side2_mode,
        binding: params.binding,
        folding_count: params.folding_count,
        folding_specs: params.folding_specs,
        unit_price: priceBreakdown?.unit_price ?? 0,
        total_price: priceBreakdown?.total ?? 0,
        price_breakdown: priceBreakdown ?? null,
        sheet_count: params.sheet_count ?? 1,
      };
      const orderPayload = {
        status: 'draft',
        company: selectedCompany ?? undefined,
        contact: selectedContact ?? undefined,
        notes: '',
        items: [itemPayload],
      };
      if (orderId) {
        const r = await api.patch(`/printshop/orders/${orderId}/`, orderPayload);
        setItemId(r.data?.items?.[0]?.id ?? null);
      } else {
        const r = await api.post('/printshop/orders/', orderPayload);
        setOrderId(r.data.id);
        setItemId(r.data?.items?.[0]?.id ?? null);
      }
      setOrderModalOpen(true);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      await api.patch(`/printshop/orders/${orderId}/`, { status: 'pending' });
      message.success('Megrendelés sikeresen leadva!');
      setOrderModalOpen(false);
      navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hiba a megrendelés leadásakor');
    } finally {
      setSaving(false);
    }
  };

  const selectedCompanyObj = selectedCompany ? companies.find(c => c.id === selectedCompany) ?? null : null;
  const selectedContactObj = selectedContact ? contacts.find(c => c.id === selectedContact) ?? null : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, background: '#fff',
        borderBottom: '1px solid #e8e8e8', display: 'flex',
        alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <Title level={5} style={{ margin: 0 }}>Nyomdai megrendelés</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>PDF feltöltés · Kalkuláció · Megrendelés</Text>
        <div style={{ flex: 1 }} />
        {/* Lock controls — admin sees toggles */}
        {isAdmin && orderId && itemId ? (
          <>
            <Tooltip title={previewLocked ? 'Preview feloldása' : 'Preview zárolása'}>
              <Button
                size="small" danger={previewLocked}
                icon={previewLocked ? <LockOutlined /> : <UnlockOutlined />}
                loading={lockSaving}
                onClick={() => handleSetLock('preview_locked', !previewLocked)}
              >
                Preview
              </Button>
            </Tooltip>
            <Tooltip title="Preview megosztása ügyfélnek">
              <Button
                size="small"
                icon={<ShareAltOutlined />}
                type={previewShare.enabled ? 'primary' : 'default'}
                onClick={() => setShareModalOpen(true)}
              >
                Megosztás
              </Button>
            </Tooltip>
          </>
        ) : !isAdmin ? (
          <>
            {previewLocked && <Tag color="error" icon={<LockOutlined />}>Preview zárolva</Tag>}
          </>
        ) : null}
        {isAdmin && (
          <Button size="small" icon={<UserOutlined />}
            type={clientBarOpen ? 'primary' : 'default'}
            onClick={() => setClientBarOpen(o => !o)}
          >
            {selectedCompanyObj ? selectedCompanyObj.name : 'Ügyfél'}
          </Button>
        )}
      </div>

      {/* Admin: Ügyfél/kapcsolattartó inline bar */}
      {isAdmin && clientBarOpen && (
        <div style={{
          flexShrink: 0, background: '#f6ffed', borderBottom: '1px solid #b7eb8f',
          padding: '8px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ügyfél</div>
          <Row gutter={12} align="middle">
            <Col xs={24} md={8}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>Cég</div>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  showSearch allowClear optionFilterProp="label"
                  placeholder="Válassz céget vagy magánszemélyt"
                  style={{ width: 'calc(100% - 32px)' }} size="small"
                  value={selectedCompany ?? undefined}
                  onFocus={refreshCompanies}
                  onChange={v => { setSelectedCompany(v ?? null); setSelectedContact(null); }}
                >
                  {companies.map(c => (
                    <Option key={c.id} value={c.id} label={c.name}>{c.name}</Option>
                  ))}
                </Select>
                <Tooltip title="Új cég hozzáadása">
                  <Button size="small" icon={<PlusCircleOutlined />}
                    onClick={() => window.open('/crm/companies?action=create', '_blank')}
                  />
                </Tooltip>
              </Space.Compact>
            </Col>
            <Col xs={24} md={16}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>Kapcsolattartók</div>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  showSearch allowClear optionFilterProp="label"
                  placeholder="Válassz kapcsolattartókat"
                  style={{ width: 'calc(100% - 90px)' }} size="small"
                  value={selectedContact ?? undefined}
                  disabled={!selectedCompany}
                  onFocus={() => refreshContacts()}
                  onChange={v => setSelectedContact(v ?? null)}
                >
                  {contacts.map((c: any) => (
                    <Option key={c.id} value={c.id} label={c.full_name || `${c.last_name} ${c.first_name}`}>
                      {c.full_name || `${c.last_name} ${c.first_name}`}
                    </Option>
                  ))}
                </Select>
                <Tooltip title="Új kapcsolattartó hozzáadása">
                  <Button size="small" icon={<PlusCircleOutlined />}
                    onClick={() => {
                      let url = '/crm/contacts?action=create';
                      if (selectedCompany && selectedCompany > 0) {
                        url += `&company=${selectedCompany}`;
                        const co = companies.find(c => c.id === selectedCompany);
                        if (co?.name) url += `&company_name=${encodeURIComponent(co.name)}`;
                      }
                      window.open(url, '_blank');
                    }}
                  />
                </Tooltip>
                <Tooltip title="Kapcsolattartók frissítése">
                  <Button size="small" icon={<ReloadOutlined />}
                    onClick={async () => {
                      if (!selectedCompany) { message.warning('Először válassz céget'); return; }
                      await refreshContacts();
                      message.success('Kapcsolattartók frissítve');
                    }}
                  >
                    Frissítés
                  </Button>
                </Tooltip>
              </Space.Compact>
            </Col>
          </Row>
        </div>
      )}

      {/* Share modal */}
      <Modal
        title="Preview megosztás"
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        onOk={handleSavePreviewShare}
        okText="Mentés" cancelText="Mégse"
        confirmLoading={shareSaving}
        destroyOnClose={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert type="info" showIcon message="Preview: belső kollégáknak | Megosztási link: külső ügyfeleknek" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Publikus link engedélyezése</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>A feltöltött preview PDF tokenes linken lesz elérhető.</Text></div>
            </div>
            <Switch checked={previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, enabled: checked }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Szerkeszthető</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Az ügyfél ugyanazokat az eszközöket látja, mint az admin previewban.</Text></div>
            </div>
            <Switch checked={previewShare.editable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, editable: checked }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Kommentelhető</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Ha ki van kapcsolva, a komment eszközök sem jelennek meg.</Text></div>
            </div>
            <Switch checked={previewShare.commentable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, commentable: checked }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Exportálható</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Az export gomb csak bekapcsolva látszik.</Text></div>
            </div>
            <Switch checked={previewShare.exportable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, exportable: checked }))} />
          </div>
          <div>
            <Tooltip title="Preview: belső kollégáknak.">
              <Text strong>Preview oldal link</Text>
            </Tooltip>
            <Space.Compact style={{ width: '100%', marginTop: 8, marginBottom: 12 }}>
              <Input readOnly value={buildStandalonePreviewUrl(orderId, itemId)} placeholder="Az adott PDF preview oldala" />
              <Button icon={<CopyOutlined />} onClick={handleCopyStandalonePreviewUrl} disabled={!orderId || !itemId}>Másolás</Button>
            </Space.Compact>
            <Tooltip title="Megosztási link: külső ügyfeleknek.">
              <Text strong>Megosztási link</Text>
            </Tooltip>
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input readOnly value={previewShare.enabled ? previewShare.url : ''} placeholder="A mentés után itt jelenik meg a publikus link" />
              <Button icon={<CopyOutlined />} onClick={handleCopyPreviewShareUrl} disabled={!previewShare.enabled || !previewShare.url}>Másolás</Button>
            </Space.Compact>
          </div>
        </div>
      </Modal>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left params panel — collapsible */}
        <div style={{
          width: !previewPanelOpen ? undefined : (leftPanelOpen ? PARAMS_PANEL_W : COLLAPSED_W),
          flex: !previewPanelOpen ? 1 : undefined,
          flexShrink: 0,
          borderRight: '1px solid #e8e8e8',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}>
          <div style={{
            height: 36, flexShrink: 0, display: 'flex', alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
            padding: leftPanelOpen ? '0 8px' : 0,
            justifyContent: leftPanelOpen ? 'space-between' : 'center',
          }}>
            {leftPanelOpen && (
              <Text strong style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>PARAMÉTEREK & KALKULÁCIÓ</Text>
            )}
            <Button
              type="text" size="small"
              icon={leftPanelOpen ? <LeftOutlined /> : <RightOutlined />}
              onClick={() => setLeftPanelOpen(v => !v)}
              style={{ padding: '0 4px', flexShrink: 0 }}
            />
          </div>
          {leftPanelOpen ? (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <PrintParamsPanel
                  params={params}
                  onChange={setParams}
                  onPriceChange={setPriceBreakdown}
                  isAdmin={isAdmin}
                />
              </div>
              <div style={{ padding: '0 12px 16px', flexShrink: 0 }}>
                <Row gutter={8}>
                  <Col span={12}>
                    <Button
                      type="primary" block size="large"
                      icon={<ShoppingOutlined />}
                      loading={saving} onClick={handleOrder}
                    >
                      Megrendelés
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button
                      block size="large"
                      icon={<FileTextOutlined />}
                      loading={rfqSaving} onClick={handleRFQ}
                      style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                    >
                      Ajánlat
                    </Button>
                  </Col>
                </Row>
              </div>
            </>
          ) : (
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              onClick={() => setLeftPanelOpen(true)}
            >
              <span style={{
                writingMode: 'vertical-rl', textOrientation: 'mixed',
                transform: 'rotate(180deg)', fontSize: 11, color: '#bbb',
                userSelect: 'none', whiteSpace: 'nowrap',
              }}>Paraméterek & kalkuláció</span>
            </div>
          )}
        </div>

        {/* Right preview panel — collapsible */}
        <div style={{
          flex: previewPanelOpen ? 1 : undefined,
          width: previewPanelOpen ? undefined : COLLAPSED_W,
          flexShrink: 0,
          overflow: 'hidden',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e8e8e8',
        }}>
          <div style={{
            height: 36, flexShrink: 0, display: 'flex', alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
            padding: previewPanelOpen ? '0 8px' : 0,
            justifyContent: previewPanelOpen ? 'space-between' : 'center',
          }}>
            {previewPanelOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                  PREVIEW & KOMMENT
                </Text>
                <Tooltip title="PDF méretarány. Pl. 1:10 = a PDF 10× kicsinyített, 2:1 = a PDF 2× nagyított. A TrimBox méreteket ezzel számolja át.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8, background: '#f5f5f5', borderRadius: 4, padding: '1px 6px' }}>
                    <Text style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}>Arány</Text>
                    <NumInput
                      size="small"
                      min={1}
                      max={1000}
                      value={ratioLeft}
                      onChange={v => setRatioLeft(v && v > 0 ? v : 1)}
                      style={{ width: 44 }}
                      controls={false}
                    />
                    <Text style={{ fontSize: 11, color: '#999' }}>:</Text>
                    <NumInput
                      size="small"
                      min={1}
                      max={1000}
                      value={ratioRight}
                      onChange={v => setRatioRight(v && v > 0 ? v : 1)}
                      style={{ width: 44 }}
                      controls={false}
                    />
                  </div>
                </Tooltip>
              </div>
            )}
            <Button
              type="text" size="small"
              icon={previewPanelOpen ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setPreviewPanelOpen(v => !v)}
              style={{ padding: '0 4px', flexShrink: 0 }}
            />
          </div>
          {previewPanelOpen ? (
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <PrintCommentView
                orderId={orderId}
                itemId={itemId}
                isAdmin={isAdmin}
                locked={!isAdmin && previewLocked}
                authorName={user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : 'Ismeretlen'}
                params={params}
                onPdfFileChange={handlePdfFileChange}
              />
            </div>
          ) : (
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              onClick={() => setPreviewPanelOpen(true)}
            >
              <span style={{
                writingMode: 'vertical-rl', textOrientation: 'mixed',
                transform: 'rotate(180deg)', fontSize: 11, color: '#bbb',
                userSelect: 'none', whiteSpace: 'nowrap',
              }}>Preview & komment</span>
            </div>
          )}
        </div>
      </div>

      {/* Order summary modal */}
      <Modal
        open={orderModalOpen}
        title="Megrendelés összefoglalója"
        onCancel={() => setOrderModalOpen(false)}
        footer={null}
        width={700}
      >
        <Step3OrderSummary
          params={params}
          priceBreakdown={priceBreakdown}
          orderId={orderId}
          itemId={itemId}
          isAdmin={isAdmin}
          company={selectedCompanyObj}
          contact={selectedContactObj}
          saving={saving}
          onBack={() => setOrderModalOpen(false)}
          onConfirm={handleConfirmOrder}
        />
      </Modal>
    </div>
  );
};

export default PrintShopPage;
