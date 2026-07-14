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
  FileTextOutlined, ShareAltOutlined, CopyOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import { crmService } from '../../services/crmService';
import { manufacturingService } from '../../services/manufacturingService';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { PrintParams } from './components/Step1Params';
import PrintParamsPanel, { PriceBreakdown } from './components/PrintParamsPanel';
import Step3OrderSummary from './components/Step3OrderSummary';
import PrintCommentView, { clearPdfFromIDB } from './components/PrintCommentView';
import MaterialNeedsPanel from './components/MaterialNeedsPanel';
import Step2CanvasEditor, { CanvasEditorHandle } from './components/Step2CanvasEditor';

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

const PARAMS_PANEL_W_DEFAULT = 280;
const PARAMS_PANEL_W_MIN = 180;
const PARAMS_PANEL_W_MAX = 560;
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
  const [paramsPanelW, setParamsPanelW] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const v = JSON.parse(s).paramsPanelW; if (v && v >= PARAMS_PANEL_W_MIN && v <= PARAMS_PANEL_W_MAX) return v; }
    } catch {}
    return PARAMS_PANEL_W_DEFAULT;
  });
  const paramsPanelWRef = useRef(paramsPanelW);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartWRef = useRef<number>(PARAMS_PANEL_W_DEFAULT);
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartXRef.current = e.clientX;
    dragStartWRef.current = paramsPanelWRef.current;
    const onMouseMove = (ev: MouseEvent) => {
      if (dragStartXRef.current === null) return;
      const delta = ev.clientX - dragStartXRef.current;
      const newW = Math.min(PARAMS_PANEL_W_MAX, Math.max(PARAMS_PANEL_W_MIN, dragStartWRef.current + delta));
      paramsPanelWRef.current = newW;
      setParamsPanelW(newW);
    };
    const onMouseUp = () => {
      dragStartXRef.current = null;
      try {
        const s = localStorage.getItem(STORAGE_KEY);
        const existing = s ? JSON.parse(s) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, paramsPanelW: paramsPanelWRef.current }));
      } catch {}
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);
  const [viewMode, setViewMode] = useState<'canvas' | 'pdf'>(
    new URLSearchParams(location.search).get('mode') === 'pdf' ? 'pdf' : 'canvas'
  );
  const canvasRef = useRef<CanvasEditorHandle>(null);
  const [templateCategoryIds, setTemplateCategoryIds] = useState<number[]>([]);
  const initialDesignRef = useRef<{ d1: any; d2: any; sheets?: Array<{ d1: any; d2: any }> } | null>((() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const { d1, d2, sheets } = JSON.parse(s);
        return (d1 || d2 || sheets) ? { d1: d1 ?? null, d2: d2 ?? null, sheets: sheets ?? undefined } : null;
      }
    } catch {}
    return null;
  })());
  const handleDesignChange = useCallback((d1: any, d2: any, sheets?: Array<{ d1: any; d2: any }>) => {
    initialDesignRef.current = { d1, d2, sheets };
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const existing = s ? JSON.parse(s) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, params: paramsRef.current, d1, d2, sheets: sheets ?? null }));
    } catch {}
  }, []);
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
  // Keep a ref to the currently loaded PDF file so we can attach it on save
  const currentPdfFileRef = useRef<File | null>(null);
  // Ref to PrintCommentView's export function (returns PDF with overlays baked in)
  const printViewExportRef = useRef<(() => Promise<File | null>) | null>(null);

  const [orderId, setOrderId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).orderId; return v ?? null; } } catch {} return null;
  });
  const [itemId, setItemId] = useState<number | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const v = JSON.parse(s).itemId; return v ?? null; } } catch {} return null;
  });
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [saving, setSaving] = useState(false);
  const [rfqSaving, setRfqSaving] = useState(false);
  // fromRfq mód: folyamatos mentés támogatása (Mentés / Bezárás gombok)
  const [savedRfqMfgId, setSavedRfqMfgId] = useState<number | null>(() => {
    const eid = new URLSearchParams(window.location.search).get('edit_mfg_id');
    return eid ? Number(eid) : null;
  });
  const [savedRfqQriId, setSavedRfqQriId] = useState<number | null>(null);
  const lastSavedParamsRef = useRef<string>(JSON.stringify(
    (() => { try { const s = localStorage.getItem('pixierp_printshop'); if (s) return JSON.parse(s).params ?? {}; } catch {} return {}; })()
  ));
  const lastSavedPdfRef = useRef<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [pdfCacheCleared, setPdfCacheCleared] = useState(false);

  // Clear cached PDF before mounting the PDF view to avoid loading a stale file.
  useEffect(() => {
    let alive = true;
    (async () => {
      await clearPdfFromIDB();
      if (alive) setPdfCacheCleared(true);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // from_rfq mode: opened from RFQ modal, show only Save button
  const fromRfqParams = new URLSearchParams(location.search);
  const fromRfq = fromRfqParams.get('from_rfq') === '1';
  const fromRfqCompanyId = fromRfqParams.get('company') ? Number(fromRfqParams.get('company')) : null;
  const fromRfqCompanyName = fromRfqParams.get('company_name') || '';
  // edit_mfg_id: opened from PS button on an existing RFQ item → update instead of create
  const editMfgId = fromRfqParams.get('edit_mfg_id') ? Number(fromRfqParams.get('edit_mfg_id')) : null;
  // rfq_id: meglévő ajánlat ID → közvetlen mentés az ajánlathoz (ItemSelectorModal PS-gombjából)
  const rfqId = fromRfqParams.get('rfq_id') ? Number(fromRfqParams.get('rfq_id')) : null;
  // return_url: the opener page URL to navigate back to after save
  const returnUrl = fromRfqParams.get('return_url') || null;

  // RFQ "new" entry should never continue a previous PrintShop order context.
  useEffect(() => {
    if (!fromRfq || !!editMfgId) return;
    setOrderId(null);
    setItemId(null);
    currentPdfFileRef.current = null;
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const existing = s ? JSON.parse(s) : {};
      delete existing.orderId;
      delete existing.itemId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch {}
  }, [fromRfq, editMfgId]);

  // Load printshop_params from the manufacturing product when editing
  const [panelKey, setPanelKey] = useState(0); // force-remount PrintParamsPanel when restoring click-state
  useEffect(() => {
    if (!editMfgId) return;
    manufacturingService.getProduct(editMfgId).then(product => {
      const saved = (product as any).printshop_params;
      if (saved && typeof saved === 'object') {
        const { price_breakdown: _pb, _editor_state: editorState, _click_state: _legacyCs, ...printParams } = saved;
        setParams(prev => ({ ...prev, ...printParams }));
        // Kész termékek/utómunkák visszaállítása: pixierp_editor_state (selected_product_id + clickState) visszaírása
        const stateToRestore = editorState || (_legacyCs ? { clickState: _legacyCs } : null);
        if (stateToRestore && typeof stateToRestore === 'object' && Object.keys(stateToRestore).length > 0) {
          try {
            // Meglévő state-tel merge: csak a mentett mezőket írjuk felül
            const existing = JSON.parse(localStorage.getItem('pixierp_editor_state') || '{}');
            localStorage.setItem('pixierp_editor_state', JSON.stringify({ ...existing, ...stateToRestore }));
          } catch {}
          setPanelKey(prev => prev + 1); // PrintParamsPanel újrabetöltés
        }
      }
    }).catch(() => {});
  }, [editMfgId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    currentPdfFileRef.current = file;
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
    const qp = new URLSearchParams(window.location.search);
    const fromRfqCo = qp.get('company') ? Number(qp.get('company')) : null;
    if (fromRfqCo) return fromRfqCo;
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
    // If opened from RFQ with a company preloaded, ensure it appears in the list
    if (fromRfqCompanyId && fromRfqCompanyName) {
      setCompanies(prev => {
        if (prev.find(c => c.id === fromRfqCompanyId)) return prev;
        return [{ id: fromRfqCompanyId, name: decodeURIComponent(fromRfqCompanyName) }, ...prev];
      });
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
      const bd = priceBreakdown as any;

      // Név: terméknév, méret, mennyiség
      const autoName = params.product_name && params.product_name.trim()
        ? `${params.product_name.trim()}, ${params.quantity} db`
        : `${params.width_mm}×${params.height_mm}mm, ${params.quantity} db, íves nyomtatás`;

      // Nyomtatási forma szöveges leírása
      const printSvcLine = bd?.print_service_name_1
        ? `Nyomtatás 1.o: ${bd.print_service_name_1}` +
          (bd?.print_service_name_2 ? `\nNyomtatás 2.o: ${bd.print_service_name_2}` : '')
        : null;
      // Impozíció
      const impLine = bd?.items_per_sheet != null
        ? `Impozíció: ${bd.items_per_sheet} db/ív (${bd.fit_w ?? '?'}×${bd.fit_h ?? '?'})` +
          `${bd.rotated ? ', forgatva' : ''}, ${bd.sheets_needed} ív, ${bd.clicks_total} klikk`
        : null;
      // Ívméret
      const sheetLine = bd?.sheet_w_mm != null
        ? `Ívméret: ${bd.sheet_w_mm}×${bd.sheet_h_mm} mm` +
          (bd.cutting_info?.needs_cutting
            ? ` (vágva: ${bd.cutting_info.cut_sheet_size_mm?.[0]}×${bd.cutting_info.cut_sheet_size_mm?.[1]} mm, ${bd.cutting_info.raw_material_sheets_needed} alap)`
            : '')
        : null;
      // Alapér
      const matLine = bd?.material_name ? `Alapanyag: ${bd.material_name}` : null;
      const extrasLine = bd?.service_breakdown?.length > 0
        ? `Utómunka/extrák: ${(bd.service_breakdown as any[]).map((sb: any) => sb.name).join(', ')}`
        : null;
      // Ár
      const priceLines = bd?.total != null
        ? `Nyomtatás: ${Math.round(bd.print_cost ?? 0).toLocaleString('hu-HU')} Ft` +
          (bd.material_cost > 0 ? `\nAlapanyag: ${Math.round(bd.material_cost).toLocaleString('hu-HU')} Ft` : '') +
          (bd.service_cost > 0 ? `\nSzolgáltatás: ${Math.round(bd.service_cost).toLocaleString('hu-HU')} Ft` : '') +
          `\nNettó összesen: ${Math.round(bd.total).toLocaleString('hu-HU')} Ft` +
          `\nEgységár: ${Number(bd.unit_price ?? 0).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft/db`
        : null;

      const description = [
        `Termék: ${params.product_name || 'Egyedi nyomtatás'}`,
        `Méret: ${params.width_mm} × ${params.height_mm} mm, ${sidesText}`,
        `Mennyiség: ${params.quantity} db${sheetCount > 1 ? ` × ${sheetCount} lap` : ''}`,
        params.binding && params.binding !== 'none' ? `Kötés: ${params.binding}` : null,
        matLine, printSvcLine, impLine, sheetLine, extrasLine,
      ].filter(Boolean).map(l => `<p>${String(l).replace(/\n/g, '</p><p>')}</p>`).join('');

      const costItems: any[] = [];
      const r4 = (v: any) => Math.round((Number(v) || 0) * 10000) / 10000;
      const supId = (v: any) => (v && Number(v) > 0 ? Number(v) : null);
      const calcCpRFQ = (sp: number, markupPct: number, cpRaw: any): number => {
        const cp = r4(cpRaw); if (cp > 0) return cp;
        return markupPct > 0 ? r4(sp / (1 + markupPct / 100)) : sp;
      };
      if (bd) {
        if (bd.material_items) {
          for (const mi of bd.material_items) {
            const qty = r4(mi.units) || 1;
            const sellingPerUnit = r4(mi.price_per);
            const total = r4(mi.total);
            const costPerUnit = calcCpRFQ(sellingPerUnit, r4(mi.markup_percentage ?? 0), mi.cost_price_per);
            costItems.push({
              type: 'material', name: mi.name,
              quantity: qty, unit: 'ív',
              cost_price: costPerUnit, unit_price: sellingPerUnit,
              selling_unit_price: sellingPerUnit, selling_price: total,
              markup_percent: r4(mi.markup_percentage ?? 0),
              is_internal: mi.is_internal ?? false,
              supplier: supId(mi.supplier_id),
              formulas: { _syncQty: false },
            });
          }
        }
        for (const key of ['print_service_items_1', 'print_service_items_2'] as const) {
          if (bd[key]) {
            for (const pi of bd[key]) {
              const qty = r4(pi.units) || 1;
              const sellingPerUnit = r4(pi.price_per);
              const total = r4(pi.total);
              const costPerUnit = calcCpRFQ(sellingPerUnit, r4(pi.markup_percentage ?? 0), pi.cost_price_per);
              costItems.push({
                type: 'service', name: pi.name,
                quantity: qty, unit: pi.type === 'fixed' ? 'db' : 'ív',
                cost_price: costPerUnit, unit_price: sellingPerUnit,
                selling_unit_price: sellingPerUnit, selling_price: total,
                markup_percent: r4(pi.markup_percentage ?? 0),
                is_internal: pi.is_internal ?? false,
                department: pi.department_id ?? null,
                supplier: supId(pi.supplier_id),
                formulas: { _syncQty: false },
              });
            }
          }
        }
        if (bd.service_breakdown) {
          for (const sb of bd.service_breakdown) {
            if (sb.items) {
              for (const si of sb.items) {
                const qty = r4(si.units) || 1;
                const sellingPerUnit = r4(si.price_per ?? (si.total && qty > 0 ? si.total / qty : si.total));
                const total = r4(si.total);
                const costPerUnit = calcCpRFQ(sellingPerUnit, r4(si.markup_percentage ?? 0), si.cost_price_per);
                costItems.push({
                  type: 'service', name: `${sb.name}: ${si.name}`,
                  quantity: qty, unit: si.type === 'fixed' ? 'db' : 'db',
                  cost_price: costPerUnit, unit_price: sellingPerUnit,
                  selling_unit_price: sellingPerUnit, selling_price: total,
                  markup_percent: r4(si.markup_percentage ?? 0),
                  is_internal: si.is_internal ?? false,
                  department: si.department_id ?? null,
                  supplier: supId(si.supplier_id),
                  formulas: { _syncQty: false },
                });
              }
            } else if (sb.total > 0) {
              costItems.push({
                type: 'service', name: sb.name,
                quantity: 1, unit: 'db',
                cost_price: r4(sb.total), unit_price: r4(sb.total),
                selling_unit_price: r4(sb.total), selling_price: r4(sb.total),
                markup_percent: 0, is_internal: false, supplier: null,
                formulas: { _syncQty: false },
              });
            }
          }
        }
      }

      const costItemsSellingTotal = costItems.reduce((sum: number, ci: any) => sum + (Number(ci.selling_price) || 0), 0);
      const unitPrice = params.quantity > 0 ? costItemsSellingTotal / params.quantity : 0;

      const payload: any = {
        name: autoName,
        description,
        quantity: params.quantity,
        quantity_unit: 'db',
        net_unit_price: Math.round(unitPrice * 100) / 100,
        status: 'quote_request_open',
        date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        contact: selectedContact && typeof selectedContact === 'number' ? selectedContact : undefined,
        cost_items: costItems,
        // Print-specific fields
        width_mm: params.width_mm,
        height_mm: params.height_mm,
        sides: params.sides,
        side1_mode: params.side1_mode,
        side2_mode: params.side2_mode,
        binding: params.binding,
        folding_count: params.folding_count,
        folding_specs: params.folding_specs,
        sheet_count: params.sheet_count ?? 1,
        material: params.material_id ?? undefined,
        price_breakdown: priceBreakdown ?? undefined,
        printshop_params: { ...params, _editor_state: (() => { try { return JSON.parse(localStorage.getItem('pixierp_editor_state') || '{}'); } catch { return null; } })(), price_breakdown: priceBreakdown ?? null },
      };

      let productId: number;
      if (editMfgId) {
        // Update existing manufacturing product
        await manufacturingService.updateProduct(editMfgId, payload);
        productId = editMfgId;
      } else {
        const created = await manufacturingService.createProduct(payload);
        productId = created.id;
      }

      // Upload PDF attachment if a file is loaded (with overlays baked in if any)
      if (currentPdfFileRef.current) {
        try {
          const pdfToUpload = printViewExportRef.current
            ? (await printViewExportRef.current()) ?? currentPdfFileRef.current
            : currentPdfFileRef.current;
          await manufacturingService.uploadProductAttachment(
            productId,
            pdfToUpload,
            'PrintShop PDF'
          );
        } catch (attErr) {
          console.warn('[handleRFQ] PDF attachment upload failed:', attErr);
        }
      }

      // Közvetlen mentés meglévő ajánlathoz (rfq_id URL param)
      if (rfqId && !editMfgId) {
        await import('../../services/salesService').then(({ salesService }) =>
          salesService.addRfqManufacturingItem(
            rfqId, productId, autoName, params.quantity,
            description, 'db', Math.round(unitPrice * 100) / 100, 27, 0, 0, {},
          )
        );
        message.success('Mentve az ajánlathoz.');
        // Visszatérés az ajánlat oldalra: reload kell, mert a returnUrl ugyanaz az URL
        // amit az opener már mutat → location.href = same URL nem triggerel reloadot
        if (window.opener && !window.opener.closed) {
          window.opener.location.reload();
          window.close();
        } else if (returnUrl) {
          // Ha nem volt opener: navigálj a returnUrl-re (esetleg ugyanaz, de legalább megpróbál)
          window.location.href = returnUrl + (returnUrl.includes('?') ? '&' : '?') + '_r=' + Date.now();
        } else {
          window.location.href = '/sales/rfqs';
        }
        return;
      }

      message.success('Mentve.');

      // Helper: navigate opener (or self) to targetUrl, then close this tab if opened via window.open
      const navigateBack = (targetUrl: string) => {
        if (window.opener && !window.opener.closed) {
          window.opener.location.href = targetUrl;
          window.close();
        } else {
          window.location.href = targetUrl;
        }
      };

      if (editMfgId) {
        // Editing existing item: return to opener (RFQ detail or list)
        navigateBack(returnUrl || '/sales/rfqs');
      } else {
        const rfqParams = new URLSearchParams({
          create: 'true',
          add_item_id: String(productId),
          add_item_type: 'manufacturing',
        });
        if (selectedCompany) rfqParams.set('company', String(selectedCompany));
        if (selectedContact) rfqParams.set('contact', String(selectedContact));
        if (fromRfq) {
          // return_url is the page that opened us (e.g. /sales/rfqs with modal open)
          // We need to navigate it to the RFQ creation URL with the new item
          const base = returnUrl ? new URL(returnUrl).pathname : '/sales/rfqs';
          navigateBack(`${base}?${rfqParams.toString()}`);
        } else {
          window.open(`/sales/rfqs?${rfqParams.toString()}`, '_blank');
        }
      }
    } catch (e: any) {
      console.error('[handleRFQ] error:', e?.response?.data);
      message.error(e?.response?.data?.error || JSON.stringify(e?.response?.data) || 'Hiba az ajánlat létrehozásakor');
    } finally {
      setRfqSaving(false);
    }
  };

  // ── fromRfq mód: Mentés gomb (ablak nyitva marad) ──────────────────────────
  const handleRfqSave = async () => {
    setRfqSaving(true);
    try {
      const sheetCount = params.sheet_count ?? 1;
      const sidesText = params.sides === '2' ? 'kétoldalas' : 'egyoldalas';
      const bd = priceBreakdown as any;

      const autoName = params.product_name && params.product_name.trim()
        ? `${params.product_name.trim()}, ${params.quantity} db`
        : `${params.width_mm}×${params.height_mm}mm, ${params.quantity} db, íves nyomtatás`;

      const printSvcLine = bd?.print_service_name_1
        ? `Nyomtatás 1.o: ${bd.print_service_name_1}` +
          (bd?.print_service_name_2 ? `\nNyomtatás 2.o: ${bd.print_service_name_2}` : '') : null;
      const impLine = bd?.items_per_sheet != null
        ? `Impozíció: ${bd.items_per_sheet} db/ív (${bd.fit_w ?? '?'}×${bd.fit_h ?? '?'})` +
          `${bd.rotated ? ', forgatva' : ''}, ${bd.sheets_needed} ív, ${bd.clicks_total} klikk` : null;
      const sheetLine = bd?.sheet_w_mm != null
        ? `Ívméret: ${bd.sheet_w_mm}×${bd.sheet_h_mm} mm` +
          (bd.cutting_info?.needs_cutting
            ? ` (vágva: ${bd.cutting_info.cut_sheet_size_mm?.[0]}×${bd.cutting_info.cut_sheet_size_mm?.[1]} mm)` : '') : null;
      const matLine = bd?.material_name ? `Alapanyag: ${bd.material_name}` : null;
      const extrasLine = bd?.service_breakdown?.length > 0
        ? `Utómunka/extrák: ${(bd.service_breakdown as any[]).map((sb: any) => sb.name).join(', ')}`
        : null;
      const priceLines = bd?.total != null
        ? `Nyomtatás: ${Math.round(bd.print_cost ?? 0).toLocaleString('hu-HU')} Ft` +
          (bd.material_cost > 0 ? `\nAlapanyag: ${Math.round(bd.material_cost).toLocaleString('hu-HU')} Ft` : '') +
          (bd.service_cost > 0 ? `\nSzolgáltatás: ${Math.round(bd.service_cost).toLocaleString('hu-HU')} Ft` : '') +
          `\nNettó összesen: ${Math.round(bd.total).toLocaleString('hu-HU')} Ft` +
          `\nEgységár: ${Number(bd.unit_price ?? 0).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft/db`
        : null;
      const description = [
        `Termék: ${params.product_name || 'Egyedi nyomtatás'}`,
        `Méret: ${params.width_mm} × ${params.height_mm} mm, ${sidesText}`,
        `Mennyiség: ${params.quantity} db${sheetCount > 1 ? ` × ${sheetCount} lap` : ''}`,
        params.binding && params.binding !== 'none' ? `Kötés: ${params.binding}` : null,
        matLine, printSvcLine, impLine, sheetLine, extrasLine,
      ].filter(Boolean).map(l => `<p>${String(l).replace(/\n/g, '</p><p>')}</p>`).join('');

      const r4 = (v: any) => Math.round((Number(v) || 0) * 10000) / 10000;
      const supId = (v: any) => (v && Number(v) > 0 ? Number(v) : null);
      // Bekerülési ár: ha 0 vagy nincs, kiszámítjuk a haszonkulcsból
      const calcCp = (sellingPrice: number, markupPct: number, costPricePer: any): number => {
        const cp = r4(costPricePer);
        if (cp > 0) return cp;
        if (markupPct > 0) return r4(sellingPrice / (1 + markupPct / 100));
        return sellingPrice;
      };
      const costItems: any[] = [];
      if (bd) {
        for (const mi of (bd.material_items ?? [])) {
          const qty = r4(mi.units) || 1;
          const sp = r4(mi.price_per);  // price_per = selling per unit
          const tot = r4(mi.total);
          const cp = calcCp(sp, r4(mi.markup_percentage ?? 0), mi.cost_price_per);
          costItems.push({ type: 'material', name: mi.name, quantity: qty, unit: 'ív', cost_price: cp, unit_price: sp, selling_unit_price: sp, selling_price: tot, markup_percent: r4(mi.markup_percentage ?? 0), is_internal: mi.is_internal ?? false, supplier: supId(mi.supplier_id), formulas: { _syncQty: false } });
        }
        for (const key of ['print_service_items_1', 'print_service_items_2'] as const) {
          for (const pi of (bd[key] ?? [])) {
            const qty = r4(pi.units) || 1;
            const sp = r4(pi.price_per);  // price_per = selling per unit (direct from API)
            const tot = r4(pi.total);
            const cp = calcCp(sp, r4(pi.markup_percentage ?? 0), pi.cost_price_per);
            costItems.push({ type: 'service', name: pi.name, quantity: qty, unit: pi.type === 'fixed' ? 'db' : 'ív', cost_price: cp, unit_price: sp, selling_unit_price: sp, selling_price: tot, markup_percent: r4(pi.markup_percentage ?? 0), is_internal: pi.is_internal ?? false, department: pi.department_id ?? null, supplier: supId(pi.supplier_id), formulas: { _syncQty: false } });
          }
        }
        for (const sb of (bd.service_breakdown ?? [])) {
          if (sb.items) {
            for (const si of sb.items) {
              const qty = r4(si.units) || 1;
              const sp = r4(si.price_per ?? (si.total && qty > 0 ? si.total / qty : si.total));
              const tot = r4(si.total);
              const cp = calcCp(sp, r4(si.markup_percentage ?? 0), si.cost_price_per);
              costItems.push({ type: 'service', name: `${sb.name}: ${si.name}`, quantity: qty, unit: 'db', cost_price: cp, unit_price: sp, selling_unit_price: sp, selling_price: tot, markup_percent: r4(si.markup_percentage ?? 0), is_internal: si.is_internal ?? false, department: si.department_id ?? null, supplier: supId(si.supplier_id), formulas: { _syncQty: false } });
            }
          } else if (sb.total > 0) {
            costItems.push({ type: 'service', name: sb.name, quantity: 1, unit: 'db', cost_price: r4(sb.total), unit_price: r4(sb.total), selling_unit_price: r4(sb.total), selling_price: r4(sb.total), markup_percent: 0, is_internal: false, supplier: null, formulas: { _syncQty: false } });
          }
        }
      }
      const sellingTotal = costItems.reduce((s: number, ci: any) => s + (Number(ci.selling_price) || 0), 0);
      const unitPrice = params.quantity > 0 ? sellingTotal / params.quantity : 0;

      const payload: any = {
        name: autoName, description, quantity: params.quantity, quantity_unit: 'db',
        net_unit_price: Math.round(unitPrice * 100) / 100,
        status: 'quote_request_open',
        date: new Date().toISOString().split('T')[0],
        deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        contact: selectedContact && typeof selectedContact === 'number' ? selectedContact : undefined,
        cost_items: costItems, width_mm: params.width_mm, height_mm: params.height_mm,
        sides: params.sides, side1_mode: params.side1_mode, side2_mode: params.side2_mode,
        binding: params.binding, folding_count: params.folding_count, folding_specs: params.folding_specs,
        sheet_count: params.sheet_count ?? 1, material: params.material_id ?? undefined,
        price_breakdown: priceBreakdown ?? undefined,
        printshop_params: { ...params, _editor_state: (() => { try { return JSON.parse(localStorage.getItem('pixierp_editor_state') || '{}'); } catch { return null; } })(), price_breakdown: priceBreakdown ?? null },
      };

      // ManufacturingProduct létrehozás / frissítés
      let productId: number;
      if (savedRfqMfgId) {
        await manufacturingService.updateProduct(savedRfqMfgId, payload);
        productId = savedRfqMfgId;
      } else {
        const created = await manufacturingService.createProduct(payload);
        productId = created.id;
        setSavedRfqMfgId(productId);
      }

      // PDF csatolás
      if (currentPdfFileRef.current) {
        try {
          const pdfToUpload = printViewExportRef.current
            ? (await printViewExportRef.current()) ?? currentPdfFileRef.current
            : currentPdfFileRef.current;
          await manufacturingService.uploadProductAttachment(productId, pdfToUpload, 'PrintShop PDF');
        } catch (attErr) { console.warn('[handleRfqSave] PDF upload failed:', attErr); }
      }

      // Ajánlat tétel: első mentésnél hozza létre, további mentéseknél frissíti az árat
      if (rfqId) {
        if (!savedRfqQriId) {
          const { salesService: ss } = await import('../../services/salesService');
          const qri = await ss.addRfqManufacturingItem(
            rfqId, productId, autoName, params.quantity,
            description, 'db', Math.round(unitPrice * 100) / 100, 27, 0, 0, {},
          );
          setSavedRfqQriId(qri.id);
        } else {
          const { salesService: ss } = await import('../../services/salesService');
          await ss.updateQuoteItem(rfqId, savedRfqQriId, {
            item_name: autoName,
            description,
            net_unit_price: Math.round(unitPrice * 100) / 100,
            quantity: params.quantity,
          });
        }
      } else if (window.opener && !window.opener.closed) {
        // Nincs rfq_id (új árajánlat modal) → postMessage az openernek, hogy adja hozzá a tételt
        window.opener.postMessage({
          type: 'PRINTSHOP_ITEM_SAVED',
          manufacturing_product_id: productId,
          name: autoName,
          quantity: params.quantity,
          net_unit_price: Math.round(unitPrice * 100) / 100,
          description,
        }, window.location.origin);
      }

      // Mentés megjelölése
      lastSavedParamsRef.current = JSON.stringify(params);
      lastSavedPdfRef.current = currentPdfFileRef.current?.name ?? null;
      message.success('Mentve.');
    } catch (e: any) {
      console.error('[handleRfqSave]', e?.response?.data);
      message.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setRfqSaving(false);
    }
  };

  // ── fromRfq mód: Bezárás gomb ────────────────────────────────────────────────
  const handleRfqClose = () => {
    const dirty = JSON.stringify(params) !== lastSavedParamsRef.current ||
                  (currentPdfFileRef.current?.name ?? null) !== lastSavedPdfRef.current;
    if (!dirty) {
      window.close();
      return;
    }
    Modal.confirm({
      title: 'Nem mentett változtatások',
      content: 'Mentsen bezárás előtt?',
      okText: 'Igen, mentés & bezárás',
      cancelText: 'Nem, bezárás mentés nélkül',
      onOk: async () => { await handleRfqSave(); window.close(); },
      onCancel: () => { window.close(); },
    });
  };

  const handleOrder = async () => {
    setSaving(true);
    try {
      const design = viewMode === 'canvas' ? canvasRef.current?.getDesignJson() : null;
      const itemPayload: any = {
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
        ...(design ? {
          design_json_side1: design.d1,
          design_json_side2: design.d2,
          sheets: (design as any).sheets ?? null,
        } : {}),
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
        <Tooltip title="Termékkatalógus böngészése">
          <Button size="small" icon={<AppstoreOutlined />} onClick={() => navigate('/print-catalog')}>
            Katalógus
          </Button>
        </Tooltip>
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
        destroyOnHidden={false}
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
          width: !previewPanelOpen ? undefined : (leftPanelOpen ? paramsPanelW : COLLAPSED_W),
          flex: !previewPanelOpen ? 1 : undefined,
          flexShrink: 0,
          borderRight: '1px solid #e8e8e8',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
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
                  key={panelKey}
                  params={params}
                  onChange={setParams}
                  onPriceChange={setPriceBreakdown}
                  onTemplateCategoriesChange={setTemplateCategoryIds}
                  isAdmin={isAdmin}
                />
                <MaterialNeedsPanel priceBreakdown={priceBreakdown} />
              </div>
              <div style={{ padding: '0 12px 16px', flexShrink: 0 }}>
                {fromRfq ? (
                  <Row gutter={8}>
                    <Col span={14}>
                      <Button
                        type="primary" block size="large"
                        icon={<FileTextOutlined />}
                        loading={rfqSaving} onClick={handleRfqSave}
                        style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                      >
                        Mentés
                      </Button>
                    </Col>
                    <Col span={10}>
                      <Button
                        block size="large"
                        onClick={handleRfqClose}
                        disabled={rfqSaving}
                      >
                        Bezárás
                      </Button>
                    </Col>
                  </Row>
                ) : (
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
                )}
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

        {/* Drag handle between panels */}
        {leftPanelOpen && previewPanelOpen && (
          <div
            onMouseDown={handleDragStart}
            style={{
              width: 5, flexShrink: 0, cursor: 'col-resize',
              background: 'transparent',
              position: 'relative', zIndex: 10,
            }}
          >
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 1, width: 3,
              background: '#e8e8e8',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1890ff')}
              onMouseLeave={e => (e.currentTarget.style.background = '#e8e8e8')}
            />
          </div>
        )}

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <Text strong style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                  {viewMode === 'canvas' ? 'VÁSZON SZERKESZTŐ' : 'PREVIEW & KOMMENT'}
                </Text>
                {/* Mode toggle buttons */}
                <Button
                  size="small"
                  type={viewMode === 'canvas' ? 'primary' : 'default'}
                  onClick={() => setViewMode('canvas')}
                  style={{ fontSize: 11, padding: '0 8px' }}
                >
                  Vászon
                </Button>
                <Button
                  size="small"
                  type={viewMode === 'pdf' ? 'primary' : 'default'}
                  onClick={() => setViewMode('pdf')}
                  style={{ fontSize: 11, padding: '0 8px' }}
                >
                  PDF
                </Button>
                {/* Ratio controls — only visible in PDF mode */}
                {viewMode === 'pdf' && (
                  <Tooltip title="PDF méretarány. Pl. 1:10 = a PDF 10× kicsinyített, 2:1 = a PDF 2× nagyított. A TrimBox méreteket ezzel számolja át.">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, background: '#f5f5f5', borderRadius: 4, padding: '1px 6px' }}>
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
                )}
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
              {viewMode === 'canvas' ? (
                <Step2CanvasEditor
                  ref={canvasRef}
                  params={params}
                  isAdmin={isAdmin}
                  priceBreakdown={priceBreakdown}
                  leftOffset={leftPanelOpen ? paramsPanelW : COLLAPSED_W}
                  onParamsChange={setParams}
                  initialDesign={initialDesignRef.current}
                  onDesignChange={handleDesignChange}
                  locked={!isAdmin && editorLocked}
                  templateCategoryIds={templateCategoryIds}
                />
              ) : (
                pdfCacheCleared ? (
                  <PrintCommentView
                    orderId={orderId}
                    itemId={itemId}
                    isAdmin={isAdmin}
                    locked={!isAdmin && previewLocked}
                    authorName={user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : 'Ismeretlen'}
                    params={params}
                    onPdfFileChange={handlePdfFileChange}
                    exportRef={printViewExportRef}
                    onSwitchToCanvas={() => setViewMode('canvas')}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text type="secondary">PDF előkészítése...</Text>
                  </div>
                )
              )}
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
              }}>{viewMode === 'canvas' ? 'Vászon szerkesztő' : 'Preview & komment'}</span>
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
