import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import EnhancedTable from '../../components/EnhancedTable';
import type { ColumnsType } from 'antd/es/table';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Tooltip, Modal, Form, Input, InputNumber, DatePicker, Select, Row, Col, Divider, Upload, Checkbox, List, Grid, Drawer, Popover, Switch } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, EyeOutlined, SendOutlined, MailOutlined, EditOutlined, SearchOutlined, CopyOutlined, PlusCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, DeleteOutlined, FilterOutlined, CameraOutlined, PictureOutlined, UploadOutlined, PaperClipOutlined, LeftOutlined, RightOutlined, ShoppingCartOutlined, HistoryOutlined, WarningOutlined, PrinterOutlined, UserSwitchOutlined, FolderAddOutlined, RocketOutlined, CarOutlined, CheckCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import { useNewRowTracker, newDotColumn } from '../../hooks/useNewRowTracker';
import { useNavigate, useSearchParams } from 'react-router-dom'; // Add useSearchParams
import './RFQs.css';
import { salesService } from '../../services/salesService';
import { crmService } from '../../services/crmService';
import { manufacturingService, Currency as MCurrency } from '../../services/manufacturingService';
import { settingsService } from '../../services/settingsService';
import { warehouseService } from '../../services/warehouseService';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import ImpositionHelperModal from '../../components/Sales/ImpositionHelperModal';
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { RFQCostsTable } from '../../components/Sales/RFQCostsTable';

import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import Demands from './Demands';
import { deepSearchMatch, normalizeTextForSearch } from '../../utils/searchUtils';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import MaterialNeedsTree from '../../components/Manufacturing/MaterialNeedsTree';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';
import stripHtml from '../../utils/stripHtml';
import api from '../../services/api';

const { useBreakpoint } = Grid;

// Ékezet-független + kis/nagybetű-független filter a Select komponensekhez
// (a default `optionFilterProp="label"` csak case-insensitive substring match-et csinál).

const accentInsensitiveLabelFilter = (input: string, option: any): boolean => {
  if (!input) return true;
  const label = normalizeTextForSearch((option?.label ?? option?.children ?? '').toString());
  const tokens = normalizeTextForSearch(input).split(/\s+/).filter(Boolean);
  return tokens.every(token => label.includes(token));
};

const getRfqRef = (rfq: any): string => String(rfq?.number || rfq?.request_number || rfq?.id || '');

const normalizeRfqWorkflowStatus = (status?: string): string =>
  status === 'sent' ? 'quoted' : (status || 'new');

const findRfqByRef = (rfqs: any[], rfqRef: string | number) => {
  const ref = String(rfqRef ?? '');
  return (rfqs || []).find((r: any) =>
    String(r?.id ?? '') === ref ||
    String(r?.number ?? '') === ref ||
    String(r?.request_number ?? '') === ref
  );
};

const cloneDraftRfqItem = <T,>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof File !== 'undefined' && value instanceof File) return value;
  if (Array.isArray(value)) return value.map((item) => cloneDraftRfqItem(item)) as T;
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneDraftRfqItem(item)])
    ) as T;
  }
  return value;
};

const { TextArea } = Input;

const STATUS_COMBOS: Record<string, string[]> = {
  mind: ['new', 'quoted', 'ordered', 'confirmed', 'in_design', 'pending_customer_approval', 'pending_internal_approval', 'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced', 'expired', 'archived'],
  foglalkozos: ['ordered', 'confirmed', 'in_design', 'pending_customer_approval', 'pending_internal_approval', 'in_production', 'ready'],
  szallitando: ['ready'],
  szamlazando: ['ready', 'in_delivery', 'delivered'],
  aktiv: ['new', 'quoted', 'ordered', 'confirmed', 'in_design', 'pending_customer_approval', 'pending_internal_approval', 'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced'],
  szamlazható: ['ready', 'in_delivery', 'delivered'],
};
const STATUS_COMBO_KEYS = ['foglalkozos', 'szallitando', 'szamlazando', 'aktiv', 'szamlazható'] as const;

const RFQs: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // --- Clipboard paste for create modal ---
  const handleCreateModalPaste = useCallback((file: File) => {
    const f = file as any;
    const key = f.uid || f.name;
    setRfqFiles(prev => [...prev, f]);
    setRfqFileRemarks(prev => ({ ...prev, [key]: '' }));
    message.info('Kép beillesztve a csatolmányok közé');
  }, []);
  // (hook call placed after createOpen state is declared — see below)
  const [loading, setLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [costStatusOverrides, setCostStatusOverrides] = useState<Record<number, string>>({});
  const [mfgProductReloadTriggers, setMfgProductReloadTriggers] = useState<Record<number, number>>({});
  const [filtered, setFiltered] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [overdueCompanyMap, setOverdueCompanyMap] = useState<Record<string, string>>({});
  useEffect(() => {
    crmService.getOverdueCustomerFlags().then((flags) => {
      const map: Record<string, string> = {};
      (Array.isArray(flags) ? flags : (flags as any)?.results || []).forEach((f: any) => {
        if (f?.customer_id) map[String(f.customer_id)] = f.level;
      });
      setOverdueCompanyMap(map);
    }).catch((e) => { console.warn('overdue flags error', e); });
  }, []);
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [copySourceItem, setCopySourceItem] = useState<any | null>(null);
  const [copySourceRfq, setCopySourceRfq] = useState<any | null>(null);
  const [copyItemModalOpen, setCopyItemModalOpen] = useState(false);
  const copyItemSaveRef = useRef<{ save: (keepOpen: boolean) => Promise<void> } | null>(null);
  const [copyItemIssueDate, setCopyItemIssueDate] = useState<any>(dayjs());
  const [copyItemDeadline, setCopyItemDeadline] = useState<any>(null);
  const [copyItemValidityDays, setCopyItemValidityDays] = useState<number>(30);
  const [copyItemProjectId, setCopyItemProjectId] = useState<number | null>(null);
  const [copyItemCompanyId, setCopyItemCompanyId] = useState<any>(null);
  const [copyItemContactIds, setCopyItemContactIds] = useState<number[]>([]);
  const [copyItemContacts, setCopyItemContacts] = useState<any[]>([]);
  const [copyItemNextNumber, setCopyItemNextNumber] = useState<string>('');
  const [copyItemUserName, setCopyItemUserName] = useState<string>('');
  const [copyItemLoading, setCopyItemLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  // Ctrl+V paste support in create modal
  useClipboardImagePaste(handleCreateModalPaste, createOpen);
  const [nextNumber, setNextNumber] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [form] = Form.useForm();
  const [pendingFormValues, setPendingFormValues] = useState<Record<string, any> | null>(null);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [newItems, setNewItems] = useState<any[]>([]);
  const [newCosts, setNewCosts] = useState<any[]>([]);
  const [rfqImpositionPresets, setRfqImpositionPresets] = useState<any[]>([]);
  const [rfqImpositionModalOpen, setRfqImpositionModalOpen] = useState(false);
  const [rfqImpositionEditIdx, setRfqImpositionEditIdx] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('HUF');
  const [currencyList, setCurrencyList] = useState<MCurrency[]>([]);
  const [rfqFiles, setRfqFiles] = useState<UploadFile<any>[]>([]);
  const [rfqFileRemarks, setRfqFileRemarks] = useState<Record<string, string>>({});
  const [rfqFileDisplayNames, setRfqFileDisplayNames] = useState<Record<string, string>>({});
  const [editingRfqNameKey, setEditingRfqNameKey] = useState<string | null>(null);
  const [editingRfqNameVal, setEditingRfqNameVal] = useState<string>('');
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkModalKey, setRemarkModalKey] = useState<string>('');
  const [remarkModalValue, setRemarkModalValue] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sendOpenId, setSendOpenId] = useState<number | string | null>(null);
  const [sendForm] = Form.useForm();
  const [confirmEmailForm] = Form.useForm();
  const [sendPreview, setSendPreview] = useState<any | null>(null);
  const [query, setQuery] = useState(() => localStorage.getItem('rfqs_search_query') || '');
  const handleSearchChange = (v: string) => { setQuery(v); localStorage.setItem('rfqs_search_query', v); };
  const [partialOrderOpenId, setPartialOrderOpenId] = useState<number | null>(null);
  const [partialSelection, setPartialSelection] = useState<number[]>([]);
  const [partialLoading, setPartialLoading] = useState(false);
  const [partialDeadline, setPartialDeadline] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [validityDays, setValidityDays] = useState<number>(30);
  const [orderAllOpenId, setOrderAllOpenId] = useState<number | null>(null);
  const [orderAllDeadline, setOrderAllDeadline] = useState<any>(null);
  const [orderAllLoading, setOrderAllLoading] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rfqs_status_filter');
      if (!saved) return ['mind'];
      const parsed: string[] = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return ['mind'];
      if (parsed.includes('mind')) return ['mind'];
      // Kombináció-kulcsot megtartjuk (hogy a Select a kombináció nevét mutassa, mint a "Mind");
      // az egyedi státuszokat normalizáljuk. A szűrés a kombinációt futásidőben kibontja.
      return parsed.map((v) => (STATUS_COMBO_KEYS as readonly string[]).includes(v) ? v : normalizeRfqWorkflowStatus(v));
    } catch {
      return ['mind'];
    }
  });
  const [orderStatusFilter, setOrderStatusFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rfqs_order_status_filter');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [creatorFilter, setCreatorFilter] = useState<string | null>(() => {
    try { return localStorage.getItem('rfqs_creator_filter') || null; } catch { return null; }
  });
  const [projectFilter, setProjectFilter] = useState<number | null>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('project');
      return p && !isNaN(Number(p)) ? Number(p) : null;
    } catch { return null; }
  });
  const [partialOrderAllowed, setPartialOrderAllowed] = useState<boolean>(true);
  const [csvMode, setCsvMode] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [clientCompanyModalOpen, setClientCompanyModalOpen] = useState(false);
  const [clientContactModalOpen, setClientContactModalOpen] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const watchedCompanyId = Form.useWatch('company_id', form);
  const watchedContactIds = Form.useWatch('contact_ids', form);
  const watchedIssueDate = Form.useWatch('issue_date', form);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<React.Key[]>([]);
  const [bulkOrderLoading, setBulkOrderLoading] = useState(false);
  const [createOrderLoading, setCreateOrderLoading] = useState(false);
  const [rfqBulkPrinting, setRfqBulkPrinting] = useState(false);
  const [rfqBulkPrintModalOpen, setRfqBulkPrintModalOpen] = useState(false);
  const [rfqBulkPrintMode, setRfqBulkPrintMode] = useState<'preview' | 'direct'>('direct');
  const [bulkSetOrderedLoading, setBulkSetOrderedLoading] = useState(false);
  // Bulk delivery (Szállítás) state
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryType, setDeliveryType] = useState<'home' | 'pickup'>('home');
  const [selectedPickupLocationId, setSelectedPickupLocationId] = useState<number | null>(null);
  const [pickupLocations, setPickupLocations] = useState<any[]>([]);
  const [bulkDeliveryLoading, setBulkDeliveryLoading] = useState(false);
  // Bulk invoice (Számlázás) state
  const [bulkInvoiceLoading, setBulkInvoiceLoading] = useState(false);
  // Bulk handover (Átadás) state
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverForm] = Form.useForm();
  const [handoverCashRegisters, setHandoverCashRegisters] = useState<any[]>([]);
  const [handoverNetTotal, setHandoverNetTotal] = useState(0);
  // Bulk customer/contact change state
  const [bulkCustomerModalOpen, setBulkCustomerModalOpen] = useState(false);
  const [bulkCustomerLoading, setBulkCustomerLoading] = useState(false);
  const [bulkCustomerCompanyId, setBulkCustomerCompanyId] = useState<number | null>(null);
  const [bulkCustomerContactIds, setBulkCustomerContactIds] = useState<number[]>([]);
  const [bulkCustomerContacts, setBulkCustomerContacts] = useState<any[]>([]);
  const [bulkCustomerContactsLoading, setBulkCustomerContactsLoading] = useState(false);
  const [bulkProjectModalOpen, setBulkProjectModalOpen] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState<number | null>(null);
  const [bulkProjectLoading, setBulkProjectLoading] = useState(false);
  // Confirmation email flow after order creation
  const [confirmEmailAskOpen, setConfirmEmailAskOpen] = useState(false);
  const [confirmEmailOrders, setConfirmEmailOrders] = useState<{ primaryOrderId: number; orderIds: number[]; rfqId: number; rfqIds: number[] }[]>([]);
  const [confirmEmailIndex, setConfirmEmailIndex] = useState(0);
  const [confirmEmailOpen, setConfirmEmailOpen] = useState(false);
  const [confirmEmailSending, setConfirmEmailSending] = useState(false);
  const [confirmEmailSentSet, setConfirmEmailSentSet] = useState<number[]>([]);
  const [confirmEmailPreview, setConfirmEmailPreview] = useState<any | null>(null);
  const [sendRfqList, setSendRfqList] = useState<{ rfqId: number | string; additionalRfqIds?: (number | string)[]; itemIds?: number[]; sent: boolean }[]>([]);
  const [sendRfqIndex, setSendRfqIndex] = useState(0);
  // Cache per-RFQ form edits so navigating back restores user's changes
  const sendFormCacheRef = React.useRef<Record<string, any>>({});
  // Track additionalRfqIds and itemIds for the currently open send modal (used in render/preview)
  const currentSendAdditionalRfqIdsRef = React.useRef<(number | string)[]>([]);
  const currentSendItemIdsRef = React.useRef<number[]>([]);
  const [expandedRfqKeys, setExpandedRfqKeys] = useState<React.Key[]>([]);
  const [rfqExpandedItems, setRfqExpandedItems] = useState<Record<number, any[]>>({});
  const [rfqExpandedLoading, setRfqExpandedLoading] = useState<Record<number, boolean>>({});
  const [rfqAttachments, setRfqAttachments] = useState<Record<number, any[]>>({});
  const [rfqAttPreviewOpen, setRfqAttPreviewOpen] = useState(false);
  const [rfqAttPreviewUrl, setRfqAttPreviewUrl] = useState<string | null>(null);
  const [rfqAttPreviewTitle, setRfqAttPreviewTitle] = useState('');
  // --- DnD/paste upload + rename for expanded RFQ rows ---
  const [rfqAttRenameId, setRfqAttRenameId] = useState<number | null>(null);
  const [rfqAttRenameVal, setRfqAttRenameVal] = useState('');
  const [rfqItemAttRenameId, setRfqItemAttRenameId] = useState<number | null>(null);
  const [rfqItemAttRenameVal, setRfqItemAttRenameVal] = useState('');
  const [rfqLevelUploading, setRfqLevelUploading] = useState<Record<number, number>>({});
  const [rfqLevelRemark, setRfqLevelRemark] = useState<Record<number, string>>({});
  const [rfqItemAtts, setRfqItemAtts] = useState<Record<number, any[]>>({});
  const [rfqItemUploading, setRfqItemUploading] = useState<Record<number, number>>({});
  const [rfqItemRemark, setRfqItemRemark] = useState<Record<number, string>>({});

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historySelectedKeys, setHistorySelectedKeys] = useState<React.Key[]>([]);
  const [historyUseQty, setHistoryUseQty] = useState<Record<string | number, boolean>>({});
  const [historyAllCompanies, setHistoryAllCompanies] = useState(false);

  const lastPasteTargetRef = useRef<{ type: 'rfq' | 'item', id: number } | null>(null);
  const rfqLevelRemarkRef = useRef<Record<number, string>>({});
  const rfqItemRemarkRef = useRef<Record<number, string>>({});
  useEffect(() => { rfqLevelRemarkRef.current = rfqLevelRemark; }, [rfqLevelRemark]);
  useEffect(() => { rfqItemRemarkRef.current = rfqItemRemark; }, [rfqItemRemark]);
  const handleRfqRowPaste = useCallback((file: File) => {
    const target = lastPasteTargetRef.current;
    if (!target) return;
    if (target.type === 'rfq') {
      const rfqId = target.id;
      setRfqLevelUploading(prev => ({ ...prev, [rfqId]: (prev[rfqId] || 0) + 1 }));
      const remark = rfqLevelRemarkRef.current[rfqId] || '';
      salesService.uploadQuoteRequestAttachment(rfqId, file, remark || undefined)
        .then(res => {
          setRfqAttachments(prev => ({ ...prev, [rfqId]: [res, ...(prev[rfqId] || [])] }));
          message.success('Kép feltöltve');
        })
        .catch(() => message.error('Feltöltés sikertelen'))
        .finally(() => setRfqLevelUploading(prev => ({ ...prev, [rfqId]: Math.max(0, (prev[rfqId] || 0) - 1) })));
    } else {
      const itemId = target.id;
      setRfqItemUploading(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
      const remark = rfqItemRemarkRef.current[itemId] || '';
      salesService.uploadQuoteRequestItemAttachment(itemId, file, remark || undefined)
        .then(res => {
          setRfqItemAtts(prev => ({ ...prev, [itemId]: [res, ...(prev[itemId] || [])] }));
          message.success('Kép feltöltve');
        })
        .catch(() => message.error('Feltöltés sikertelen'))
        .finally(() => setRfqItemUploading(prev => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) - 1) })));
    }
  }, []);
  useClipboardImagePaste(handleRfqRowPaste, true);

  const loadRfqExpandedItems = async (record: any) => {
    const rfqId = Number(record?.id || 0);
    if (!rfqId || rfqExpandedItems[rfqId] !== undefined || rfqExpandedLoading[rfqId]) return;

    setRfqExpandedLoading(prev => ({ ...prev, [rfqId]: true }));
    try {
      const full = await salesService.getQuoteRequest(rfqId);
      const src = Array.isArray(full?.items) ? full.items : [];
      const sorted = [...src].sort((a: any, b: any) => {
        const ao = Number(a?.sort_order ?? 0);
        const bo = Number(b?.sort_order ?? 0);
        if (ao !== bo) return ao - bo;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });

      const map = new Map<number, any>();
      sorted.forEach((it: any) => map.set(it.id, { ...it, children: [] }));
      const roots: any[] = [];
      sorted.forEach((it: any) => {
        const node = map.get(it.id);
        const pid = it.parent;
        if (pid && map.has(pid)) map.get(pid).children.push(node);
        else roots.push(node);
      });
      setRfqExpandedItems(prev => ({ ...prev, [rfqId]: roots }));
      setRfqAttachments(prev => ({ ...prev, [rfqId]: Array.isArray(full?.attachments) ? full.attachments : [] }));
    } catch (e) {
      console.error(e);
      message.error('Nem sikerült betölteni az ajánlat tételeit');
      setRfqExpandedItems(prev => ({ ...prev, [rfqId]: [] }));
    } finally {
      setRfqExpandedLoading(prev => ({ ...prev, [rfqId]: false }));
    }
  };

  const ensureExtension = (newName: string, originalName: string): string => {
    const dotIdx = originalName.lastIndexOf('.');
    if (dotIdx === -1) return newName;
    const ext = originalName.slice(dotIdx);
    if (newName.toLowerCase().endsWith(ext.toLowerCase())) return newName;
    return newName + ext;
  };

  const nameWithExt = (att: any): string => {
    const name = att.original_filename || '';
    if (!name) return att.file?.split('/').pop() || '';
    if (name.includes('.')) return name;
    const filePath = att.file_url || att.file || '';
    const base = filePath.split('/').pop()?.split('?')[0] || '';
    const dotIdx = base.lastIndexOf('.');
    return dotIdx !== -1 ? name + base.slice(dotIdx) : name;
  };

  const renderExpandedRfqRow = (record: any) => {
    const rfqId = Number(record?.id || 0);
    const loadingItems = !!rfqExpandedLoading[rfqId];
    const treeItems = rfqExpandedItems[rfqId];
    const rootAtts: any[] = rfqAttachments[rfqId] || [];
    const rfqUploading = (rfqLevelUploading[rfqId] || 0) > 0;
    const rfqRemark = rfqLevelRemark[rfqId] || '';

    const rfqAttSection = (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#722ed1', marginBottom: 6 }}>Ajánlat-szintű csatolmányok:</div>
        {rootAtts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {rootAtts.map((att: any) => (
              <Space key={att.id} size={2} align="center" style={{ flexWrap: 'wrap' }}>
                {rfqAttRenameId === att.id ? (
                  <>
                    <Input
                      size="small"
                      autoFocus
                      value={rfqAttRenameVal}
                      style={{ width: 200 }}
                      onChange={e => setRfqAttRenameVal(e.target.value)}
                      onPressEnter={async () => {
                        try {
                          const finalName = ensureExtension(rfqAttRenameVal, nameWithExt(att));
                          const res = await salesService.renameQuoteRequestAttachment(rfqId, att.id, finalName);
                          setRfqAttachments(prev => ({ ...prev, [rfqId]: (prev[rfqId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                          setRfqAttRenameId(null);
                        } catch { message.error('Átnevezés sikertelen'); }
                      }}
                    />
                    <Button size="small" type="primary" onClick={async () => {
                      try {
                        const finalName = ensureExtension(rfqAttRenameVal, nameWithExt(att));
                        const res = await salesService.renameQuoteRequestAttachment(rfqId, att.id, finalName);
                        setRfqAttachments(prev => ({ ...prev, [rfqId]: (prev[rfqId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                        setRfqAttRenameId(null);
                      } catch { message.error('Átnevezés sikertelen'); }
                    }}>✓</Button>
                    <Button size="small" onClick={() => setRfqAttRenameId(null)}>✗</Button>
                  </>
                ) : (
                  <>
                    <a
                      href={att.file_url || att.file}
                      onClick={(e) => { e.preventDefault(); setRfqAttPreviewUrl(att.file_url || att.file); setRfqAttPreviewTitle(att.original_filename || att.file?.split('/').pop() || ''); setRfqAttPreviewOpen(true); }}
                      style={{ fontSize: 12 }}
                    >
                      <PaperClipOutlined style={{ marginRight: 3 }} />{att.original_filename || att.file?.split('/').pop() || `#${att.id}`}
                    </a>
                    <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 10 }} />} title="Átnevezés" style={{ padding: '0 2px' }}
                      onClick={() => { setRfqAttRenameId(att.id); setRfqAttRenameVal(nameWithExt(att)); }}
                    />
                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                      onClick={async () => {
                        try {
                          await salesService.deleteQuoteRequestAttachment(rfqId, att.id);
                          setRfqAttachments(prev => ({ ...prev, [rfqId]: (prev[rfqId] || []).filter((a: any) => a.id !== att.id) }));
                          message.success('Törölve');
                        } catch { message.error('Törlés sikertelen'); }
                      }}
                    />
                  </>
                )}
              </Space>
            ))}
          </div>
        )}
        <Space direction="vertical" size={4}>
          <Input
            size="small"
            placeholder="Megjegyzés a feltöltéshez (opcionális)"
            value={rfqRemark}
            style={{ width: 320 }}
            onChange={e => setRfqLevelRemark(prev => ({ ...prev, [rfqId]: e.target.value }))}
          />
          <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'rfq', id: rfqId }; }} onMouseLeave={() => { if (lastPasteTargetRef.current?.id === rfqId) lastPasteTargetRef.current = null; }}>
            <Upload.Dragger
              multiple
              showUploadList={false}
              style={{ padding: '6px 0', maxWidth: 420 }}
              customRequest={({ file, onSuccess, onError }) => {
                const f = file as File;
                setRfqLevelUploading(prev => ({ ...prev, [rfqId]: (prev[rfqId] || 0) + 1 }));
                salesService.uploadQuoteRequestAttachment(rfqId, f, rfqRemark || undefined)
                  .then(res => {
                    setRfqAttachments(prev => ({ ...prev, [rfqId]: [res, ...(prev[rfqId] || [])] }));
                    setRfqLevelRemark(prev => ({ ...prev, [rfqId]: '' }));
                    message.success('Feltöltve');
                    onSuccess?.(res);
                  })
                  .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                  .finally(() => setRfqLevelUploading(prev => ({ ...prev, [rfqId]: Math.max(0, (prev[rfqId] || 0) - 1) })));
              }}
            >
              {rfqUploading
                ? <><Spin size="small" /> <span style={{ fontSize: 12, color: '#888' }}>Feltöltés…</span></>
                : <span style={{ fontSize: 12, color: '#888' }}>Húzd ide a fájlokat, kattints &middot; vagy Ctrl+V</span>
              }
            </Upload.Dragger>
          </div>
        </Space>
      </div>
    );

    if (loadingItems) {
      return (
        <div style={{ padding: '12px 8px 12px 28px' }}>
          <Spin size="small" />
        </div>
      );
    }

    if (!treeItems || treeItems.length === 0) {
      return (
        <div style={{ padding: '8px 0 8px 28px' }}>
          {rfqAttSection}
        </div>
      );
    }

    return (
      <div style={{ padding: '8px 0 8px 28px' }}>
        {rfqAttSection}
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={treeItems}
          columns={[
            {
              title: 'Megnevezés',
              key: 'name',
              render: (_: any, r: any) => (
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {r.product_name || r.material_name || r.manufacturing_product_name || r.service_name || r.name || r.description || '-'}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{r.quote_number || r.product_code || r.material_code || r.manufacturing_product_code || r.service_code || ''}</div>
                </div>
              ),
            },
            {
              title: 'Mennyiség',
              key: 'qty',
              width: 120,
              render: (_: any, r: any) => `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
            },
            {
              title: 'Csatolmányok',
              key: 'attachments',
              width: 340,
              render: (_: any, r: any) => {
                const itemId: number = r.id;
                const atts: any[] = rfqItemAtts[itemId] !== undefined ? rfqItemAtts[itemId] : (r.attachments || []);
                const uploading = (rfqItemUploading[itemId] || 0) > 0;
                const itemRemark = rfqItemRemark[itemId] || '';
                return (
                  <div>
                    {atts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        {atts.map((att: any) => (
                          <Space key={att.id} size={2} align="center" style={{ flexWrap: 'wrap' }}>
                            {rfqItemAttRenameId === att.id ? (
                              <>
                                <Input
                                  size="small"
                                  autoFocus
                                  value={rfqItemAttRenameVal}
                                  style={{ width: 180 }}
                                  onChange={e => setRfqItemAttRenameVal(e.target.value)}
                                  onPressEnter={async () => {
                                    try {
                                      const finalName = ensureExtension(rfqItemAttRenameVal, nameWithExt(att));
                                      const res = await salesService.renameQuoteRequestItemAttachment(itemId, att.id, finalName);
                                      setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                                      setRfqItemAttRenameId(null);
                                    } catch { message.error('Átnevezés sikertelen'); }
                                  }}
                                />
                                <Button size="small" type="primary" onClick={async () => {
                                  try {
                                    const finalName = ensureExtension(rfqItemAttRenameVal, nameWithExt(att));
                                    const res = await salesService.renameQuoteRequestItemAttachment(itemId, att.id, finalName);
                                    setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                                    setRfqItemAttRenameId(null);
                                  } catch { message.error('Átnevezés sikertelen'); }
                                }}>✓</Button>
                                <Button size="small" onClick={() => setRfqItemAttRenameId(null)}>✗</Button>
                              </>
                            ) : (
                              <>
                                <a
                                  href={att.file_url || att.file}
                                  onClick={(e) => { e.preventDefault(); setRfqAttPreviewUrl(att.file_url || att.file); setRfqAttPreviewTitle(att.original_filename || att.file?.split('/').pop() || ''); setRfqAttPreviewOpen(true); }}
                                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                                >
                                  <PaperClipOutlined />{att.original_filename || att.file?.split('/').pop() || `#${att.id}`}
                                </a>
                                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 10 }} />} title="Átnevezés" style={{ padding: '0 2px' }}
                                  onClick={() => { setRfqItemAttRenameId(att.id); setRfqItemAttRenameVal(nameWithExt(att)); }}
                                />
                                <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                                  onClick={async () => {
                                    try {
                                      await salesService.deleteQuoteRequestItemAttachment(itemId, att.id);
                                      setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).filter((a: any) => a.id !== att.id) }));
                                      message.success('Törölve');
                                    } catch { message.error('Törlés sikertelen'); }
                                  }}
                                />
                              </>
                            )}
                          </Space>
                        ))}
                      </div>
                    )}
                    <Input
                      size="small"
                      placeholder="Megjegyzés (opcionális)"
                      value={itemRemark}
                      style={{ width: 200, marginBottom: 4 }}
                      onChange={e => setRfqItemRemark(prev => ({ ...prev, [itemId]: e.target.value }))}
                    />
                    <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'item', id: itemId }; }} onMouseLeave={() => { if (lastPasteTargetRef.current?.id === itemId) lastPasteTargetRef.current = null; }}>
                      <Upload.Dragger
                        multiple
                        showUploadList={false}
                        style={{ padding: '4px 0' }}
                        customRequest={({ file, onSuccess, onError }) => {
                          const f = file as File;
                          setRfqItemUploading(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
                          salesService.uploadQuoteRequestItemAttachment(itemId, f, itemRemark || undefined)
                            .then(res => {
                              setRfqItemAtts(prev => ({ ...prev, [itemId]: [res, ...(prev[itemId] !== undefined ? prev[itemId] : r.attachments || [])] }));
                              setRfqItemRemark(prev => ({ ...prev, [itemId]: '' }));
                              message.success('Feltöltve');
                              onSuccess?.(res);
                            })
                            .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                            .finally(() => setRfqItemUploading(prev => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) - 1) })));
                        }}
                      >
                        {uploading
                          ? <><Spin size="small" /> <span style={{ fontSize: 11, color: '#888' }}>Feltöltés…</span></>
                          : <span style={{ fontSize: 11, color: '#888' }}>Húzd ide · Ctrl+V</span>
                        }
                      </Upload.Dragger>
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'Leírás',
              key: 'description',
              ellipsis: true,
              render: (_: any, r: any) => {
                const raw = r.description || '';
                return <span title={stripHtml(raw)}>{stripHtml(raw)}</span>;
              },
            },
          ]}
          expandable={{
            rowExpandable: (r: any) => !!(r.item_type === 'manufacturing'),
            expandedRowRender: (r: any) => (
              <div style={{ padding: '8px 0 8px 28px' }}>
                <ProductSubItemsTable productId={Number(r.manufacturing_product)} onStatusChange={loadData} />
                <MaterialNeedsTree
                  manufacturingProductId={Number(r.manufacturing_product)}
                  quantity={Number(r.quantity || 1)}
                  sourceType="rfq"
                  sourceId={Number(record.id || 0)}
                  sourceNumber={record.request_number || String(record.id || '')}
                  sourceItemName={r.product_name || r.manufacturing_product_name || r.material_name || r.name || ''}
                />
              </div>
            ),
            defaultExpandAllRows: false,
          }}
        />
      </div>
    );
  };

  const exportCsv = () => {
    const stripHtml = (html: string) => {
      if (!html) return '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    };
    if (bulkSelectedKeys.length === 0) {
      message.warning('Jelölj ki legalább egy tételt a CSV exporthoz!');
      return;
    }
    const SEP = ';';
    const source = flattenedItems.filter((r: any) => bulkSelectedKeys.includes(r.uniqueId));
    const rows = source.map((r: any) => ({
      'Dátum': r.issue_date ? dayjs(r.issue_date).format('YYYY-MM-DD') : '',
      'Ajánlat szám': r.rfq_number ?? '',
      'Tétel neve': r.product_name || r.manufacturing_product_name || r.service_name || r.name || '',
      'Mennyiség': r.quantity != null ? String(Number(r.quantity)) : '',
      'Egység': r.unit ?? '',
      'Nettó egységár': r.net_unit_price != null ? Number(r.net_unit_price).toFixed(2) : (r.manufacturing_product_net_unit_price != null ? Number(r.manufacturing_product_net_unit_price).toFixed(2) : ''),
      'Nettó összeg': (Number(r.discounted_net_total || r.net_total || (Number(r.quantity || 0) * Number(r.net_unit_price || r.manufacturing_product_net_unit_price || 0)))).toFixed(2),
      'Pénznem': r.currency ?? '',
      'Leírás': stripHtml(r.description || r.manufacturing_product_description || r.product_description || ''),
      'Belső leírás': stripHtml(r.manufacturing_product_internal_description ?? ''),
      'Ügyfél': r.company_name ?? '',
      'Státusz': r.status ?? '',
    }));
    if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/\./g, ','); // tizedes pont → vessző
      return s.includes(SEP) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(SEP), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(SEP))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `arajanlatok_tetelek_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const QUILL_EMPTY = new Set(['', '<p><br></p>', '<p></p>', '<br>']);

  const normalizeForCompare = (value: any): any => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (QUILL_EMPTY.has(trimmed)) return undefined;
      return trimmed;
    }
    if (Array.isArray(value)) return value.map(normalizeForCompare);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && typeof value?.format === 'function') return value.format('YYYY-MM-DDTHH:mm:ss');
    if (typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, key: string) => {
          const normalized = normalizeForCompare(value[key]);
          if (normalized !== undefined) acc[key] = normalized;
          return acc;
        }, {} as any);
    }
    return value;
  };

  const getFormSnapshot = () => JSON.stringify(normalizeForCompare(form.getFieldsValue(true)));
  const hasFormChanges = () =>
    getFormSnapshot() !== initialFormSnapshot
    || newItems.length > 0
    || rfqFiles.length > 0
    || newCosts.length > 0;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const PAGE_SIZE = 50;
      const [firstPageData, projRes] = await Promise.all([
        salesService.getQuoteRequestsPage(1, PAGE_SIZE),
        manufacturingService.getProjects(),
      ]);
      const firstResults: any[] = firstPageData.results ?? [];
      const totalCount: number = firstPageData.count ?? firstResults.length;
      setRfqs(firstResults);
      setCostStatusOverrides({});  // clear overrides when fresh data loads
      setProjects(projRes as any);
      setLoading(false);

      // Háttérben betöltjük a maradék oldalakat
      if (totalCount > PAGE_SIZE) {
        setBackgroundLoading(true);
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        for (let page = 2; page <= totalPages; page++) {
          try {
            const pageData = await salesService.getQuoteRequestsPage(page, PAGE_SIZE);
            const results: any[] = pageData.results ?? [];
            setRfqs(prev => [...prev, ...results]);
          } catch (e) {
            console.error(`Hiba a(z) ${page}. oldal betöltésekor:`, e);
          }
        }
        setBackgroundLoading(false);
      }
    } catch (e) {
      console.error(e);
      setError('Hiba történt az adatok betöltése során');
      setLoading(false);
    }
  };

  const reloadProjects = async () => {
    try {
      const projRes = await manufacturingService.getProjects();
      setProjects(projRes as any);
    } catch {}
  };

  // BroadcastChannel: ha egy új projektlapfülön projekt lett létrehozva, frissítsük a listát
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('project_created');
      bc.onmessage = () => reloadProjects();
    } catch {}
    return () => { try { bc?.close(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creators = useMemo(() => {
    const names = rfqs.map(r => r.created_by_name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [rfqs]);

  // Save status filters to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('rfqs_status_filter', JSON.stringify(statusFilter));
      localStorage.setItem('rfqs_order_status_filter', JSON.stringify(orderStatusFilter));
      if (creatorFilter) localStorage.setItem('rfqs_creator_filter', creatorFilter);
      else localStorage.removeItem('rfqs_creator_filter');
    } catch {
      // Ignore localStorage errors
    }
  }, [statusFilter, orderStatusFilter, creatorFilter]);

  // Combo-aware status filter change handler:
  // when a combo key is newly selected it expands to its individual statuses,
  // so the user sees which individual statuses are active and can fine-tune them.
  const handleStatusFilterChange = (newValues: string[]) => {
    if (newValues.length === 0) { setStatusFilter(['mind']); return; }
    if (newValues.includes('mind') && !statusFilter.includes('mind')) {
      setStatusFilter(['mind']); return;
    }
    const newlyAdded = newValues.filter(v => !statusFilter.includes(v));
    const newCombo = newlyAdded.find(v => (STATUS_COMBO_KEYS as readonly string[]).includes(v));
    if (newCombo) {
      // Kombináció kiválasztásakor a kombináció-kulcsot tároljuk (mint a "mind"),
      // hogy a Select a kombináció nevét jelenítse meg, ne a kibontott egyedi státuszokat.
      // A szűrés (flattenedItems) a kulcsot futásidőben kibontja.
      setStatusFilter([newCombo]); return;
    }
    // Regular individual-status change — strip out any combo keys
    const individual = newValues.filter(v => v !== 'mind' && !(STATUS_COMBO_KEYS as readonly string[]).includes(v));
    setStatusFilter(individual.length > 0 ? individual : ['mind']);
  };

  // Ha egy kombináció van kiválasztva, a Select value-jába belekerülnek a tagjai is,
  // hogy az egyéni státuszok ki legyenek jelölve a legördülőben (vizuális visszajelzés).
  // A tagRender az egyéni státusz tag-eket elnyomja — csak a kombináció-kulcs tag jelenik meg.
  const activeComboKey: string | null = useMemo(() => {
    if (statusFilter.length === 1 && STATUS_COMBOS[statusFilter[0] as keyof typeof STATUS_COMBOS]) {
      return statusFilter[0];
    }
    return null;
  }, [statusFilter]);

  const selectExpandedValue = useMemo(() => {
    if (activeComboKey) {
      return [activeComboKey, ...STATUS_COMBOS[activeComboKey as keyof typeof STATUS_COMBOS]];
    }
    return statusFilter;
  }, [activeComboKey, statusFilter]);

  useEffect(() => {
    let filtered = rfqs || [];

    // Creator filter
    if (creatorFilter) {
      filtered = filtered.filter(r => r.created_by_name === creatorFilter);
    }

    // Project filter
    if (projectFilter) {
      filtered = filtered.filter(r => r.project === projectFilter || r.project_id === projectFilter);
    }

    // Text search
    if (query?.trim()) {
      filtered = filtered.filter((rfq) => deepSearchMatch(query, rfq));
    }
    
    setFiltered(filtered);
  }, [query, rfqs, statusFilter, creatorFilter, orderStatusFilter, projectFilter]);

  const RFQ_STATUS_META: Record<string, { color: string; text: string }> = {
    new: { color: 'blue', text: 'Új' },
    in_design: { color: 'magenta', text: 'Tervezés alatt' },
    pending_customer_approval: { color: 'gold', text: 'Ügyfél jóváhagyásra vár' },
    pending_internal_approval: { color: 'volcano', text: 'Belső jóváhagyásra vár' },
    confirmed: { color: 'cyan', text: 'Megerősítve' },
    in_production: { color: 'orange', text: 'Gyártásban' },
    ready: { color: 'green', text: 'Kész' },
    in_delivery: { color: 'purple', text: 'Szállítás alatt' },
    delivered: { color: 'geekblue', text: 'Kiszállítva' },
    invoiced: { color: 'gold', text: 'Kiszámlázva' },
    in_progress: { color: 'orange', text: 'Folyamatban' },
    quoted: { color: 'cyan', text: 'Kiküldve' },
    accepted: { color: 'green', text: 'Elfogadva' },
    rejected: { color: 'red', text: 'Elutasítva' },
    expired: { color: 'default', text: 'Lejárt' },
    archived: { color: 'default', text: 'Archív' },
    ordered: { color: 'purple', text: 'Megrendelve' },
  };

  const rfqStatusOptions = [
    { value: 'new', label: 'Új' },
    { value: 'quoted', label: 'Kiküldve' },
    { value: 'accepted', label: 'Elfogadva' },
    { value: 'in_progress', label: 'Folyamatban' },
    { value: 'ordered', label: 'Megrendelve' },
    { value: 'confirmed', label: 'Megerősítve' },
    { value: 'in_design', label: 'Tervezés alatt' },
    { value: 'pending_customer_approval', label: 'Ügyfél jóváhagyásra vár' },
    { value: 'pending_internal_approval', label: 'Belső jóváhagyásra vár' },
    { value: 'in_production', label: 'Gyártásban' },
    { value: 'ready', label: 'Kész' },
    { value: 'in_delivery', label: 'Szállítás alatt' },
    { value: 'delivered', label: 'Kiszállítva' },
    { value: 'invoiced', label: 'Kiszámlázva' },
    { value: 'rejected', label: 'Elutasítva' },
    { value: 'expired', label: 'Lejárt' },
    { value: 'archived', label: 'Archív' },
  ];

  const getDisplayStatus = (record: any) => {
    const rfqStatus = record?.effective_status || record?.status;
    if (rfqStatus) return normalizeRfqWorkflowStatus(rfqStatus);
    return record?._costTopStatus || 'new';
  };

  const COST_ITEM_STATUS_ORDER = ['new', 'sent', 'ordered', 'confirmed', 'in_design', 'pending_customer_approval', 'pending_internal_approval', 'in_production', 'ready', 'in_delivery', 'delivered', 'rejected'];
  const COST_STATUS_META: Record<string, { color: string; text: string }> = {
    new:          { color: 'blue',     text: 'Új' },
    in_design:    { color: 'magenta',  text: 'Tervezés alatt' },
    pending_customer_approval: { color: 'gold', text: 'Ügyfél jóváhagyásra vár' },
    pending_internal_approval: { color: 'volcano', text: 'Belső jóváhagyásra vár' },
    sent:         { color: 'gold',     text: 'Kiküldve' },
    ordered:      { color: 'purple',   text: 'Megrendelve' },
    confirmed:    { color: 'cyan',     text: 'Megerősítve' },
    in_production:{ color: 'orange',   text: 'Gyártásban' },
    ready:        { color: 'green',    text: 'Kész' },
    in_delivery:  { color: 'purple',   text: 'Szállítás alatt' },
    delivered:    { color: 'geekblue', text: 'Kiszállítva' },
    invoiced:     { color: 'green',    text: 'Kiszámlázva' },
    rejected:     { color: 'red',      text: 'Elutasítva' },
  };
  const COST_ITEM_STATUS_OPTIONS = [
    { value: 'new',          label: 'Új' },
    { value: 'sent',         label: 'Kiküldve' },
    { value: 'ordered',      label: 'Megrendelve' },
    { value: 'confirmed',    label: 'Megerősítve' },
    { value: 'in_design',    label: 'Tervezés alatt' },
    { value: 'pending_customer_approval', label: 'Ügyfél jóváhagyásra vár' },
    { value: 'pending_internal_approval', label: 'Belső jóváhagyásra vár' },
    { value: 'in_production',label: 'Gyártásban' },
    { value: 'ready',        label: 'Kész' },
    { value: 'in_delivery',  label: 'Szállítás alatt' },
    { value: 'delivered',    label: 'Kiszállítva' },
    { value: 'rejected',     label: 'Elutasítva' },
  ];

  const statusTag = (status: string, label?: string) => {
    const meta = RFQ_STATUS_META[status] || { color: 'default', text: status };
    return <Tag color={meta.color}>{label || meta.text}</Tag>;
  };

  const renderOrderMeta = (r: any) => {
    const orderedAt = r.ordered_at;
    const ip = r.order_ip_address;
    if (!orderedAt && !ip) return null;
    let dtStr = '';
    if (orderedAt) {
      try {
        const d = new Date(orderedAt);
        dtStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      } catch { dtStr = String(orderedAt).slice(0,16).replace('T',' '); }
    }
    return (
      <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4, marginTop: 1 }}>
        {dtStr && <div>{dtStr}</div>}
        {ip && <div>{ip}</div>}
      </div>
    );
  };

  const renderRfqStatusControl = (record: any, rfqId: number) => {
    const currentStatus = getDisplayStatus(record);
    const currentLabel = record?.effective_status_label || RFQ_STATUS_META[currentStatus]?.text || currentStatus;
    const popoverContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rfqStatusOptions.map((option) => (
          <Button
            key={option.value}
            size="small"
            type={option.value === currentStatus ? 'primary' : 'text'}
            disabled={option.value === currentStatus}
            style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
            onClick={async () => {
              try {
                const res = await salesService.setQuoteRequestStatus(rfqId, option.value);
                const appliedStatus = res?.requested_status || res?.status || option.value;
                const appliedLabel = RFQ_STATUS_META[appliedStatus]?.text || option.label;
                message.success(`Státusz: ${appliedLabel}`);
                setRfqs(prev => prev.map(rfq =>
                  rfq.id !== rfqId ? rfq : { ...rfq, status: appliedStatus, effective_status: appliedStatus, effective_status_label: appliedLabel }
                ));
                loadData();
              } catch (e: any) {
                const backendError = e?.response?.data?.error || e?.response?.data?.detail;
                message.error(backendError || 'Hiba a státusz frissítésekor');
              }
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <Popover content={popoverContent} title="Státusz váltás" trigger="click" styles={{ body: { padding: '6px 8px' } }} getPopupContainer={() => document.body} zIndex={9999}>
          <span style={{ cursor: 'pointer' }}>{statusTag(currentStatus, currentLabel)}</span>
        </Popover>
        {(['in_delivery', 'delivered'].includes(currentStatus) && record?.delivery_note_number) && (
          <a href={`/sales/delivery-notes?id=${record.delivery_note_id}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: '#1677ff', lineHeight: 1.2 }}
            onClick={e => e.stopPropagation()}>
            {record.delivery_note_number}
          </a>
        )}
        {(currentStatus === 'invoiced' && record?.invoice_number) && (
          <span style={{ fontSize: 11, color: '#52c41a', lineHeight: 1.2 }}>{record.invoice_number}</span>
        )}
        {renderOrderMeta(record)}
      </div>
    );
  };

  const renderItemCostStatusControl = (r: any) => {
    const costStatuses: { id: number; status: string }[] = r.cost_items_statuses || [];
    if (!costStatuses.length) {
      return renderRfqStatusControl(r, r.rfq_id);
    }
    const topStatus = (r.effective_status === 'invoiced') ? 'invoiced' : (r._costTopStatus ?? 'new');
    const isPartial = r._costIsPartial && topStatus !== 'invoiced';
    const meta = COST_STATUS_META[topStatus] || { color: 'default', text: topStatus };
    const displayLabel = isPartial ? `${meta.text} (részben)` : meta.text;

    const handleCostStatusChange = (newStatus: string) => {
      const IN_PROD_ABOVE = ['in_production', 'ready', 'in_delivery', 'delivered'];
      const activeCount = costStatuses.filter(ci => IN_PROD_ABOVE.includes(ci.status)).length;
      const doUpdate = async () => {
        try {
          await salesService.updateRfqItemCostItemsStatus(r.id, newStatus);
          message.success(`Státusz módosítva: ${COST_ITEM_STATUS_OPTIONS.find(o => o.value === newStatus)?.label}`);
          // Directly override the displayed status for this item (bypasses rfqs→filtered→flattenedItems chain)
          setCostStatusOverrides(prev => ({ ...prev, [r.id]: newStatus }));
          if (r.manufacturing_product) {
            setMfgProductReloadTriggers(prev => ({ ...prev, [r.manufacturing_product]: (prev[r.manufacturing_product] || 0) + 1 }));
          }
        } catch {
          message.error('Hiba a státusz frissítésekor');
        }
      };
      if (activeCount > 0) {
        Modal.confirm({
          title: 'Gyártási folyamat módosítása',
          icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
          content: `${activeCount} költségtétel gyártásban vagy felette van. Biztosan módosítja az összes státuszát erre: "${COST_ITEM_STATUS_OPTIONS.find(o => o.value === newStatus)?.label}"?`,
          okText: 'Igen, módosít',
          cancelText: 'Mégse',
          onOk: doUpdate,
        });
      } else {
        doUpdate();
      }
    };

    const popoverContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {COST_ITEM_STATUS_OPTIONS.map(option => (
          <Button
            key={option.value}
            size="small"
            type={option.value === topStatus ? 'primary' : 'text'}
            disabled={option.value === topStatus}
            style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
            onClick={() => handleCostStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
    const deliveryNum = r.delivery_note_number;
    const deliveryId = r.delivery_note_id;
    const invoiceNum = r.invoice_number;
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <Popover content={popoverContent} title="Státusz váltás" trigger="click" styles={{ body: { padding: '6px 8px' } }} getPopupContainer={() => document.body} zIndex={9999}>
          <span style={{ cursor: 'pointer' }}><Tag color={meta.color}>{displayLabel}</Tag></span>
        </Popover>
        {(deliveryNum && deliveryId && ['in_delivery', 'delivered', 'invoiced'].includes(topStatus)) && (
          <a href={`/sales/delivery-notes?id=${deliveryId}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: '#1677ff', lineHeight: 1.2 }}
            onClick={e => e.stopPropagation()}>
            {deliveryNum}
          </a>
        )}
        {(invoiceNum && topStatus === 'invoiced') && (
          <span style={{ fontSize: 11, color: '#52c41a', lineHeight: 1.2 }}>{invoiceNum}</span>
        )}
        {renderOrderMeta(r)}
      </div>
    );
  };


  const flattenedItems = useMemo(() => {
    const res: any[] = [];
    filtered.forEach((rfq: any) => {
      const allItems: any[] = rfq.items || [];
      const firstItem = allItems.find((it: any) => !it?.parent) || allItems[0] || {
        id: undefined,
        item_name: rfq.primary_item_name || '',
        description: rfq.primary_item_description || '',
        quantity: rfq.primary_quantity ?? 1,
        unit: rfq.primary_unit || 'db',
        net_unit_price: rfq.primary_net_unit_price ?? 0,
        vat_rate: rfq.primary_vat_rate ?? 27,
        discount_percent: rfq.primary_discount_percent ?? 0,
        quote_item_id: rfq.primary_quote_item_id,
      };
      const rfqCompanyName = (() => {
        if (rfq.company?.name) return rfq.company.name;
        if (rfq.company_name) return rfq.company_name;
        const contactCo = (rfq.contacts || []).find((c: any) => c.company?.name || c.company_name);
        return contactCo?.company?.name || contactCo?.company_name || '';
      })();
      const rfqContactNames = rfq.contact_names || (rfq.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
      const rfqIsPrivate = !rfq.company?.name && !rfq.company_name && !(rfq.contacts || []).some((c: any) => c.company?.name || c.company_name);
      // itemStatus: a szűrőhöz és a sor színéhez használt állapot.
      // Az effective_status (backend által számított) az elsődleges forrás — ez már
      // tartalmazza a megrendelés-szintű státuszt (pl. delivered, invoiced) is.
      // Fallback: rfq.status alapú régi logika.
      const itemStatus = rfq.effective_status
        ? normalizeRfqWorkflowStatus(rfq.effective_status)
        : (rfq.status === 'ordered'
            ? (firstItem?.is_ordered ? normalizeRfqWorkflowStatus(rfq.effective_status || 'ordered') : 'quoted')
            : normalizeRfqWorkflowStatus(rfq.status));
      const rawCostStatuses: string[] = ((firstItem?.cost_items_statuses || []) as any[])
        .map((ci: any) => ci.status)
        .filter((s: string) => COST_ITEM_STATUS_ORDER.includes(s));
      const costTopStatus: string | null = rawCostStatuses.length > 0
        ? rawCostStatuses.reduce((best: string, s: string) =>
            COST_ITEM_STATUS_ORDER.indexOf(s) > COST_ITEM_STATUS_ORDER.indexOf(best) ? s : best
          )
        : null;
      const costIsPartial = costTopStatus !== null && rawCostStatuses.some(s => s !== costTopStatus);
      const overriddenStatus = firstItem?.id ? (costStatusOverrides[firstItem.id] ?? costTopStatus) : costTopStatus;
      const overriddenIsPartial = (firstItem?.id && costStatusOverrides[firstItem.id]) ? false : costIsPartial;

      res.push({
        ...firstItem,
        name: firstItem.name || firstItem.item_name || rfq.primary_item_name || rfq.title || '',
        description: firstItem.description || rfq.primary_item_description || '',
        quantity: firstItem.quantity ?? rfq.primary_quantity ?? 1,
        unit: firstItem.unit || rfq.primary_unit || 'db',
        net_unit_price: firstItem.net_unit_price ?? rfq.primary_net_unit_price ?? 0,
        vat_rate: firstItem.vat_rate ?? rfq.primary_vat_rate ?? 27,
        discount_percent: firstItem.discount_percent ?? rfq.primary_discount_percent ?? 0,
        uniqueId: String(getRfqRef(rfq)),
        rfq_number: rfq.number || rfq.request_number,
        rfq_id: getRfqRef(rfq),
        rfq_pk: rfq.id,
        rfq_title: rfq.title,
        company_name: rfqCompanyName,
        company_id: rfq.company?.id ?? null,
        contact_names: rfqContactNames,
        is_private: rfqIsPrivate,
        issue_date: rfq.issue_date,
        deadline: rfq.deadline,
        project_name: rfq.project?.name || rfq.project_name || '',
        status: itemStatus,
        rfq_status: rfq.status,
        effective_status: rfq.effective_status,
        effective_status_label: rfq.effective_status_label,
        currency_symbol: rfq.currency_symbol || rfq.currency_code || 'Ft',
        currency_code: rfq.currency_code || '',
        created_by_name: rfq.created_by_name,
        _costTopStatus: overriddenStatus,
        _costIsPartial: overriddenIsPartial,
        is_manufacturable: rfq.is_manufacturable ?? false,
        // Keep the full item list so existing render paths (expanded/details) can still work.
        _rfq_items: allItems,
      });
    });
    // Apply status filter at item level (based on derived cost item status or rfq status)
    // A státusz-szűrő a szöveges keresésre is érvényes (ÉS logika): a keresés a `filtered`-ben
    // már lefutott, itt erre szűrünk tovább státusz szerint.
    const activeFilter = statusFilter.length > 0 ? statusFilter : ['mind'];
    if (!activeFilter.includes('mind')) {
      const effectiveStatuses = new Set<string>();
      for (const s of activeFilter) {
        const expanded = STATUS_COMBOS[s as keyof typeof STATUS_COMBOS];
        if (expanded) (expanded as string[]).forEach((st: string) => effectiveStatuses.add(st));
        else effectiveStatuses.add(s);
      }
      return res.filter((item: any) => {
        const itemStatus = item.status
          ? normalizeRfqWorkflowStatus(item.status)
          : (item.effective_status ? normalizeRfqWorkflowStatus(item.effective_status) : (item._costTopStatus || 'new'));
        return effectiveStatuses.has(itemStatus);
      });
    }
    return res;
  }, [filtered, statusFilter, costStatusOverrides, query]);

  // Load new IDs from backend whenever displayed items change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadNewRfqIds(flattenedItems.map((r: any) => r.rfq_pk || r.id).filter(Boolean)); }, [flattenedItems]);

  const renderExpandedItemRow = (r: any) => {
    const subItems: any[] = r.sub_items || [];
    const isMfg = r.item_type === 'manufacturing' && r.manufacturing_product;
    const itemId: number = r.id;
    const atts: any[] = rfqItemAtts[itemId] !== undefined ? rfqItemAtts[itemId] : (r.attachments || []);
    const uploading = (rfqItemUploading[itemId] || 0) > 0;
    const itemRemark = rfqItemRemark[itemId] || '';
    return (
      <div style={{ padding: '8px 0 8px 28px' }}>
        {subItems.length > 0 && (
          <Table
            size="small"
            pagination={false}
            dataSource={subItems}
            rowKey="uniqueId"
            rowClassName={(sr: any) => { const st = getDisplayStatus(sr); return st !== 'new' ? `rfq-row-${st}` : ''; }}
            columns={[
              {
                title: 'Megnevezés', key: 'name',
                render: (_: any, sr: any) => sr.product_name || sr.manufacturing_product_name || sr.service_name || sr.name || '—',
              },
              {
                title: 'Mennyiség', key: 'quantity', width: 110, align: 'right' as const,
                render: (_: any, sr: any) => `${Number(sr.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${sr.unit || 'db'}`,
              },
              {
                title: 'Nettó egység ár', key: 'net_unit_price', width: 140, align: 'right' as const,
                render: (_: any, sr: any) => sr.net_unit_price
                  ? `${Number(sr.net_unit_price).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${sr.currency_symbol || 'Ft'}`
                  : '—',
              },
              {
                title: 'Nettó összeg', key: 'net_total', width: 130, align: 'right' as const,
                render: (_: any, sr: any) => `${(Number(sr.quantity || 0) * Number(sr.net_unit_price || 0)).toLocaleString('hu-HU')} ${sr.currency_symbol || 'Ft'}`,
              },
            ]}
          />
        )}
        {isMfg && (
          <>
            <ProductSubItemsTable productId={Number(r.manufacturing_product)} showNotesAndAttachments reloadTrigger={mfgProductReloadTriggers[r.manufacturing_product] || 0} />
            <MaterialNeedsTree
              manufacturingProductId={Number(r.manufacturing_product)}
              quantity={Number(r.quantity || 1)}
              sourceType="rfq"
              sourceId={Number(r.rfq_pk || 0)}
              sourceNumber={r.rfq_number || String(r.rfq_id || '')}
              sourceItemName={r.manufacturing_product_name || r.product_name || r.name || ''}
            />
          </>
        )}
        {!isMfg && r.item_type === 'manufacturing' && (
          <div style={{ marginBottom: 8 }}>
            <ProductSubItemsTable
              productId={0}
              dataSource={r.cost_items_data || []}
              showNotesAndAttachments
              qriId={r.id}
              onPersistAll={async (updatedItems) => {
                await salesService.updateQuoteRequestItem(r.id, { cost_items_data: updatedItems } as any);
                setRfqs(prev => prev.map((rfq: any) => ({
                  ...rfq,
                  items: (rfq.items || []).map((it: any) =>
                    it.id === r.id ? { ...it, cost_items_data: updatedItems } : it
                  ),
                })));
              }}
            />
          </div>
        )}
        <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 500 }}>Csatolmányok</div>
          {atts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {atts.map((att: any) => (
                <Space key={att.id} size={2} align="center" style={{ flexWrap: 'wrap' }}>
                  {rfqItemAttRenameId === att.id ? (
                    <>
                      <Input
                        size="small"
                        autoFocus
                        value={rfqItemAttRenameVal}
                        style={{ width: 180 }}
                        onChange={e => setRfqItemAttRenameVal(e.target.value)}
                        onPressEnter={async () => {
                          try {
                            const finalName = ensureExtension(rfqItemAttRenameVal, nameWithExt(att));
                            const res = await salesService.renameQuoteRequestItemAttachment(itemId, att.id, finalName);
                            setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                            setRfqItemAttRenameId(null);
                          } catch { message.error('Átnevezés sikertelen'); }
                        }}
                      />
                      <Button size="small" type="primary" onClick={async () => {
                        try {
                          const finalName = ensureExtension(rfqItemAttRenameVal, nameWithExt(att));
                          const res = await salesService.renameQuoteRequestItemAttachment(itemId, att.id, finalName);
                          setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.original_filename, file: res.file ?? a.file, file_url: res.file_url ?? a.file_url } : a) }));
                          setRfqItemAttRenameId(null);
                        } catch { message.error('Átnevezés sikertelen'); }
                      }}>✓</Button>
                      <Button size="small" onClick={() => setRfqItemAttRenameId(null)}>✗</Button>
                    </>
                  ) : (
                    <>
                      <a
                        href={att.file_url || att.file}
                        onClick={(e) => { e.preventDefault(); setRfqAttPreviewUrl(att.file_url || att.file); setRfqAttPreviewTitle(att.original_filename || att.file?.split('/').pop() || ''); setRfqAttPreviewOpen(true); }}
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        <PaperClipOutlined />{att.original_filename || att.file?.split('/').pop() || `#${att.id}`}
                      </a>
                      <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 10 }} />} title="Átnevezés" style={{ padding: '0 2px' }}
                        onClick={() => { setRfqItemAttRenameId(att.id); setRfqItemAttRenameVal(nameWithExt(att)); }}
                      />
                      <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                        onClick={async () => {
                          try {
                            await salesService.deleteQuoteRequestItemAttachment(itemId, att.id);
                            setRfqItemAtts(prev => ({ ...prev, [itemId]: (prev[itemId] !== undefined ? prev[itemId] : r.attachments || []).filter((a: any) => a.id !== att.id) }));
                            message.success('Törölve');
                          } catch { message.error('Törlés sikertelen'); }
                        }}
                      />
                    </>
                  )}
                </Space>
              ))}
            </div>
          )}
          <Input
            size="small"
            placeholder="Megjegyzés (opcionális)"
            value={itemRemark}
            style={{ width: 200, marginBottom: 4 }}
            onChange={e => setRfqItemRemark(prev => ({ ...prev, [itemId]: e.target.value }))}
          />
          <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'item', id: itemId }; }} onMouseLeave={() => { if (lastPasteTargetRef.current?.id === itemId) lastPasteTargetRef.current = null; }}>
            <Upload.Dragger
              multiple
              showUploadList={false}
              style={{ padding: '4px 0' }}
              customRequest={({ file, onSuccess, onError }) => {
                const f = file as File;
                setRfqItemUploading(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
                salesService.uploadQuoteRequestItemAttachment(itemId, f, itemRemark || undefined)
                  .then(res => {
                    setRfqItemAtts(prev => ({ ...prev, [itemId]: [res, ...(prev[itemId] !== undefined ? prev[itemId] : r.attachments || [])] }));
                    setRfqItemRemark(prev => ({ ...prev, [itemId]: '' }));
                    message.success('Feltöltve');
                    onSuccess?.(res);
                  })
                  .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                  .finally(() => setRfqItemUploading(prev => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) - 1) })));
              }}
            >
              {uploading
                ? <><Spin size="small" /> <span style={{ fontSize: 11, color: '#888' }}>Feltöltés…</span></>
                : <span style={{ fontSize: 11, color: '#888' }}>Húzd ide · Ctrl+V</span>
              }
            </Upload.Dragger>
          </div>
        </div>
      </div>
    );
  };

  const { newIds: newRfqIds, markSeen: markRfqSeen, loadNewIds: loadNewRfqIds } = useNewRowTracker('/sales/rfqs');

  const itemsColumns = useMemo((): ColumnsType<any> => ([
    newDotColumn(newRfqIds),
    {
      title: 'Dátum', key: 'issue_date', width: 100,
      sorter: (a: any, b: any) => (a.issue_date || '').localeCompare(b.issue_date || ''),
      render: (_: any, r: any) => r.issue_date ? dayjs(r.issue_date).format('YYYY-MM-DD') : '',
    },
    {
      title: 'Ajánlat szám', key: 'rfq_number', width: 140,
      sorter: (a: any, b: any) => (a.rfq_number || '').localeCompare(b.rfq_number || ''),
      render: (_: any, r: any) => (
        <a href={`/sales/rfqs/${r.rfq_number || r.rfq_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff', fontWeight: 500 }}>
          {r.rfq_number}
        </a>
      ),
    },
    {
      title: 'Tétel neve', key: 'item_name', ellipsis: true,
      sorter: (a: any, b: any) => {
        const nameA = a.product_name || a.manufacturing_product_name || a.service_name || a.name || '';
        const nameB = b.product_name || b.manufacturing_product_name || b.service_name || b.name || '';
        return nameA.localeCompare(nameB, 'hu');
      },
      render: (_: any, r: any) => {
        const name = r.product_name || r.manufacturing_product_name || r.service_name || r.name || '—';
        return <Tooltip title={name} getPopupContainer={() => document.body}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span></Tooltip>;
      },
    },
    {
      title: 'Darabszám', key: 'quantity', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.quantity || 0) - Number(b.quantity || 0),
      render: (_: any, r: any) => `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
    },
    {
      title: 'Nettó egység ár', key: 'net_unit_price', width: 130, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.net_unit_price || a.manufacturing_product_net_unit_price || 0) - Number(b.net_unit_price || b.manufacturing_product_net_unit_price || 0),
      render: (_: any, r: any) => {
        const p = Number(r.net_unit_price || r.manufacturing_product_net_unit_price || 0);
        return p ? `${p.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r.currency_symbol || 'Ft'}` : '—';
      },
    },
    {
      title: 'Leírás', dataIndex: 'description', key: 'description', width: 200, ellipsis: false,
      sorter: (a: any, b: any) => (stripHtml(a.description || a.manufacturing_product_description || '') ).localeCompare(stripHtml(b.description || b.manufacturing_product_description || ''), 'hu'),
      render: (_: any, r: any) => { const t = stripHtml(r.description || r.manufacturing_product_description || r.product_description || ''); return t ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t}</div></Tooltip>) : null; },
    },
    {
      title: 'Belső leírás', dataIndex: 'manufacturing_product_internal_description', key: 'manufacturing_product_internal_description', width: 180, ellipsis: false,
      sorter: (a: any, b: any) => (stripHtml(a.manufacturing_product_internal_description || '')).localeCompare(stripHtml(b.manufacturing_product_internal_description || ''), 'hu'),
      render: (t: string) => { const clean = stripHtml(t); return clean ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{clean}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#844', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{clean}</div></Tooltip>) : null; },
    },

    {
      title: 'Ügyfél', key: 'company_name', width: 160,
      sorter: (a: any, b: any) => {
        const aName = a.is_private ? (a.contact_names || '') : (a.company_name || '');
        const bName = b.is_private ? (b.contact_names || '') : (b.company_name || '');
        return aName.localeCompare(bName, 'hu');
      },
      render: (_: any, r: any): React.ReactNode => {
        const primaryName = r.is_private
          ? (r.contact_names || 'Magánszemély')
          : (r.company_name || 'Magánszemély');
        const secondaryName = r.is_private ? null : r.contact_names;
        const tooltipText = r.is_private
          ? primaryName
          : [primaryName, secondaryName].filter(Boolean).join(' – ');
        return (
          <Tooltip title={tooltipText}>
            <div>
              <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: (r.is_private || secondaryName) ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{primaryName}</div>
              {r.is_private && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
              {secondaryName && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryName}</div>}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Projekt', key: 'project_name', width: 120,
      sorter: (a: any, b: any) => (a.project_name || '').localeCompare(b.project_name || '', 'hu'),
      render: (_: any, r: any) => r.project_name || null,
    },
    {
      title: 'Határidő', key: 'deadline', width: 100,
      sorter: (a: any, b: any) => (a.deadline || '').localeCompare(b.deadline || ''),
      render: (_: any, r: any) => {
        if (!r.deadline) return null;
        const d = dayjs(r.deadline);
        const isOverdue = d.isBefore(dayjs(), 'day');
        return <span style={{ color: isOverdue ? '#cf1322' : undefined }}>{d.format('YYYY-MM-DD')}</span>;
      },
    },
    {
      title: 'Nettó összesen', key: 'item_total', width: 130, align: 'right' as const,
      sorter: (a: any, b: any) => {
        const effA = Number(a.discounted_net_total) || Number(a.net_total) || (Number(a.quantity || 0) * Number(a.net_unit_price || a.manufacturing_product_net_unit_price || 0));
        const effB = Number(b.discounted_net_total) || Number(b.net_total) || (Number(b.quantity || 0) * Number(b.net_unit_price || b.manufacturing_product_net_unit_price || 0));
        return effA - effB;
      },
      render: (_: any, r: any) => {
        const effPrice = Number(r.net_unit_price) || Number(r.manufacturing_product_net_unit_price) || 0;
        const total = Number(r.discounted_net_total) || Number(r.net_total) || (Number(r.quantity || 0) * effPrice);
        return `${total.toLocaleString('hu-HU')} ${r.currency_symbol || 'Ft'}`;
      },
    },
    {
      title: 'Státusz', key: 'item_status', width: 150,
      sorter: (a: any, b: any) => getDisplayStatus(a).localeCompare(getDisplayStatus(b)),
      render: (_: any, r: any) => (
        <Space size={4} align="center">
          {renderRfqStatusControl(r, r.rfq_id)}
          {r.is_manufacturable && (
            <Tooltip title="Gyártható" getPopupContainer={() => document.body}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Műveletek', key: 'actions', width: 200,
      render: (_: any, r: any) => (
        <Space size="small" wrap>
          <Tooltip title="Megnyitás">
            <Button icon={<EditOutlined style={{ color: '#595959' }} />} size="small" style={{ background: '#f5f5f5', borderColor: '#d9d9d9' }} onClick={() => window.open(`/sales/rfqs/${r.rfq_number || r.rfq_id}`, '_blank')} />
          </Tooltip>
          {(() => {
            const ORDERED_ABOVE = ['ordered', 'partially_ordered', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced'];
            const rfqAlreadyOrdered = ORDERED_ABOVE.includes(r.rfq_status);
            return (
              <Tooltip title={rfqAlreadyOrdered ? 'Már megrendelve – nem rendelhető újra' : 'Megrendelés'}>
                <Button
                  icon={<ShoppingCartOutlined style={{ color: rfqAlreadyOrdered ? '#aaa' : '#096dd9' }} />}
                  size="small"
                  style={{ background: rfqAlreadyOrdered ? '#f5f5f5' : '#e6f4ff', borderColor: rfqAlreadyOrdered ? '#d9d9d9' : '#91caff' }}
                  loading={createOrderLoading}
                  disabled={rfqAlreadyOrdered}
                  onClick={(e) => { e.stopPropagation(); handleCreateOrder([r.rfq_id], false); }}
                />
              </Tooltip>
            );
          })()}
          <Tooltip title="Küldés">
            <Button icon={<SendOutlined style={{ color: '#1677ff' }} />} size="small" style={{ background: '#e6f4ff', borderColor: '#91caff' }} onClick={(e) => { e.stopPropagation(); setSendRfqList([{ rfqId: r.rfq_id, sent: false }]); setSendRfqIndex(0); openSendModal(r.rfq_id); }} />
          </Tooltip>
          <Tooltip title="Másolás (preload)">
            <Button icon={<CopyOutlined style={{ color: '#5c3bc2' }} />} size="small" style={{ background: '#f5f0ff', borderColor: '#d3adf7' }} onClick={(e) => { e.stopPropagation(); const parentRfq = findRfqByRef(rfqs, r.rfq_id); if (parentRfq) openCreateFromCopy(parentRfq, r); }} />
          </Tooltip>
          <Tooltip title="Munkalap nyomtatás">
            <Button
              icon={<PrinterOutlined style={{ color: '#d4380d' }} />}
              size="small"
              style={{ background: '#fff2e8', borderColor: '#ffbb96' }}
              onClick={(e) => {
                e.stopPropagation();
                setBulkSelectedKeys([r.uniqueId]);
                setRfqBulkPrintModalOpen(true);
              }}
            />
          </Tooltip>

        </Space>
      ),
    },
]), [navigate, loadData, setSendOpenId, createOrderLoading, newRfqIds]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();

      // Compute valid_until from issue_date + validityDays
      const issueBase = values.issue_date || dayjs();
      const computedValidUntil = issueBase.add(validityDays, 'day').format('YYYY-MM-DD');

      setCreating(true);

      // Helper: resolve item display name
      const itemDisplayName = (it: any) =>
        it.name || it.product_name || it.manufacturing_product_name || it.service_name || '';

      // Common header update payload (company, contacts, project, currency…)
      const baseUpdateData: any = {
        // labelInValue miatt a contact_ids [{value,label}] formátumban jön → kinyerjük az ID-kat
        contact_ids: (values.contact_ids || []).map((c: any) => (typeof c === 'object' && c !== null) ? c.value : c),
        currency_code: currency,
        project_id: values.project_id ?? null,
        internal_description: values.internal_description || '',
        imposition_presets: rfqImpositionPresets,
      };
      if (values.company_id === 'private') {
        baseUpdateData.company_id = null;
      } else if (values.company_id) {
        baseUpdateData.company_id = values.company_id;
      }

      // Helper: add one item to a given RFQ id
      const addItemToRfq = async (rfqId: number, it: any) => {
        if (it.item_type === 'product') {
          const createdItem = await salesService.addRfqProductItem(rfqId, it.ref_id, it.name || '', it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount, it.ref_id);
          if (createdItem?.id && it.files?.length) {
            for (const f of it.files) {
              const key = (f as any)?.uid || (f as any)?.name;
              const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
              try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
            }
          }
        } else if (it.item_type === 'manufacturing') {
          if ((it as any).pendingManuPayload && it.ref_id < 0) {
            // ── Új metódus: QRI közvetlenül létrehozva, ManufacturingProduct nélkül ──
            try {
              const { _costItemsState: _cs, _currency: _cur, _costCurrency: _cc, ...manuPayload } = (it as any).pendingManuPayload;
              const createdItem = await salesService.createDirectManufacturingItem(rfqId, {
                name: it.name || '',
                quantity: it.quantity,
                description: it.description || '',
                internal_description: manuPayload.internal_description || '',
                quantity_unit: it.unit || 'db',
                net_unit_price: it.net_unit_price || 0,
                vat_rate: it.vat_rate || 27,
                discount_percent: (it as any).discount_percent || 0,
                discount_amount: (it as any).discount_amount || 0,
                cost_items: _cs && _cs.length > 0 ? _cs : [],
              });
              if (createdItem?.id && it.files?.length) {
                for (const f of it.files) {
                  const key = (f as any)?.uid || (f as any)?.name;
                  const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                  try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
                }
              }
            } catch {
              message.error(`Egyedi gyártás létrehozása sikertelen: ${it.name}`);
              return;
            }
          } else {
            let manuRefId = it.ref_id;
            // ref_id=null + direct item: createDirectManufacturingItem-tel hozzuk létre
            // (both _fromCopy and _fromHistory direct items use this path)
            if (!manuRefId && ((it as any)._fromCopy || (it as any)._fromHistory)) {
              try {
                await salesService.createDirectManufacturingItem(rfqId, {
                  name: it.name || '',
                  quantity: it.quantity,
                  description: it.description || '',
                  internal_description: (it as any).internal_description || '',
                  quantity_unit: it.unit || 'db',
                  net_unit_price: it.net_unit_price || 0,
                  vat_rate: it.vat_rate || 27,
                  discount_percent: (it as any).discount_percent || 0,
                  discount_amount: (it as any).discount_amount || 0,
                  formulas: (it as any).formulas || {},
                  cost_items: (it as any).cost_items_data || [],
                });
              } catch {
                message.error(`Tétel létrehozása sikertelen: ${it.name}`);
              }
              return;
            }
            if (it.ref_id > 0) {
              // Duplicate the manufacturing product so the copy is fully independent
              try {
                const dup = await manufacturingService.duplicateProduct(it.ref_id);
                manuRefId = dup.id;
                // If the RFQ item has a custom name (e.g. set via item_name in a previous RFQ),
                // rename the duplicate to match — the original product name may differ.
                if (it.name && it.name !== dup.name) {
                  try { await manufacturingService.patchProduct(manuRefId, { name: it.name }); } catch {}
                }
              } catch {
                message.error(`Egyedi gyártás másolása sikertelen: ${it.name}`);
                return;
              }
            }
            // Pass formulas so that _price_from_cost_calc is preserved on the copied item
            const createdItem = await salesService.addRfqManufacturingItem(rfqId, manuRefId, it.name || '', it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount, (it as any).formulas || {});
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          }
        } else {
          const createdItem = await salesService.addRfqServiceItem(rfqId, it.ref_id, it.name || '', it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
          if (createdItem?.id && it.files?.length) {
            for (const f of it.files) {
              const key = (f as any)?.uid || (f as any)?.name;
              const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
              try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
            }
          }
        }
      };

      // Helper: upload RFQ-level attachments to a given RFQ
      const uploadRfqFiles = async (rfqId: number) => {
        for (const f of rfqFiles) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = rfqFileRemarks[key];
            const displayName = rfqFileDisplayNames[key];
            const rawFile: File = (f as any).originFileObj || (f as any);
            const uploadFile = displayName && displayName !== rawFile.name
              ? new File([rawFile], displayName, { type: rawFile.type })
              : rawFile;
            await salesService.uploadQuoteRequestAttachment(rfqId, uploadFile, remark);
          } catch {}
        }
      };

      const isMulti = newItems.length > 1;

      if (isMulti) {
        // Create one separate RFQ per item
        let successCount = 0;
        for (const it of newItems) {
          const title = itemDisplayName(it) || (nextNumber || '');
          let rfq: any;
          try {
            rfq = await salesService.createQuoteRequest({
              title,
              description: title || 'Új árajánlat',
              issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
              deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
              validity_days: validityDays,
              valid_until: computedValidUntil,
              partial_order_allowed: partialOrderAllowed,
            });
          } catch (err) {
            message.error(`Árajánlat létrehozása sikertelen: ${title}`);
            continue;
          }
          try {
            await salesService.updateQuoteRequestBasic(rfq.id, baseUpdateData);
          } catch (err) {
            message.error('Nem sikerült menteni a cég/kapcsolattartó adatokat');
          }
          if (rfqFiles.length) await uploadRfqFiles(rfq.id);
          try {
            await addItemToRfq(rfq.id, it);
            successCount++;
          } catch (err) {
            message.error(`Tétel hozzáadása sikertelen: ${title}`);
          }
        }
        if (successCount > 0) {
          message.success(`${successCount} árajánlat létrehozva`);
        }
      } else {
        // Single RFQ (0 or 1 items) — original behaviour
        const computedTitle = (values.title && values.title.trim()) ? values.title.trim() : (nextNumber || '');
        const computedDescription = (values.description && values.description.trim()) ? values.description.trim() : (computedTitle || 'Új árajánlat');
        const created = await salesService.createQuoteRequest({
          title: computedTitle,
          description: computedDescription,
          issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
          deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
          validity_days: validityDays,
          valid_until: computedValidUntil,
          partial_order_allowed: partialOrderAllowed,
        });
        try {
          await salesService.updateQuoteRequestBasic(created.id, baseUpdateData);
        } catch (err) {
          message.error('Nem sikerült menteni a cég/kapcsolattartó adatokat');
          throw err;
        }
        if (rfqFiles.length) await uploadRfqFiles(created.id);
        if (newItems.length) {
          await addItemToRfq(created.id, newItems[0]);
        }
        // add costs if any (costs only in single-RFQ mode)
        if (newCosts.length) {
          for (const c of newCosts) {
            const payload: any = {
              ...c,
              quote_request: created.id,
              supplier: c.supplier ?? c.supplier_id ?? null,
              net_unit_price: c.net_unit_price ?? c.selling_unit_price ?? 0,
              currency_code: (c.currency_code || c.currency || 'HUF').toUpperCase(),
              name: c.name || undefined,
            };
            delete payload.id;
            delete payload._rfqItemRef;
            if (!payload.name) continue;
            try { await salesService.createQuoteRequestCost(payload); } catch (err) { console.error('Failed to create cost:', err); }
          }
        }
        message.success('Árajánlat létrehozva');
      }

      clearDraft();
      setCreateOpen(false);
      form.resetFields();
      setNewItems([]);
      setNewCosts([]);
      setRfqFiles([]);
      setRfqImpositionPresets([]);
      setRfqFileRemarks({});
      setRfqFileDisplayNames({});

      if (searchParams.get('create') === 'true') {
        navigate('/sales/rfqs', { replace: true });
      }
      loadData();
    } catch (e) {
      // validation or api error
    } finally {
      setCreating(false);
    }
  };

  const openHistoryModal = async () => {
    const companyId = form.getFieldValue('company_id');
    if (!historyAllCompanies && (!companyId || companyId === 'private')) {
      message.warning('Kérlek válassz céget először, vagy kapcsold be a "Minden ügyfél" opciót');
      return;
    }
    setHistoryOpen(true);
    setHistorySearch('');
    setHistoryLoading(true);
    setHistorySelectedKeys([]);
    setHistoryUseQty({});
    try {
      const params: any = {};
      if (historyAllCompanies) {
        params.all_companies = 1;
      } else {
        params.company_id = companyId;
      }
      const res = await api.get('/sales/quote-requests/items_history/', { params });
      setHistoryItems(res.data || []);
    } catch {
      message.error('Nem sikerült betölteni a korábbi tételeket');
    } finally {
      setHistoryLoading(false);
    }
  };

  const confirmHistoryLoad = () => {
    const selected = historyItems.filter(it => historySelectedKeys.includes(it.item_id));
    if (!selected.length) { message.warning('Nincs kiválasztva tétel'); return; }
    const newItemsToAdd = selected.map((it: any) => ({
      item_type: it.item_type,
      ref_id: it.ref_id,
      name: it.name,
      code: it.code,
      quote_number: it.quote_number || '',
      quantity: historyUseQty[it.item_id] ? it.quantity : 1,
      unit: it.unit,
      net_unit_price: it.net_unit_price,
      vat_rate: it.vat_rate,
      description: it.description,
      internal_description: it.internal_description || '',
      cost_items_data: it.cost_items_data || [],
      _fromHistory: true,
    }));
    setNewItems(prev => [...prev, ...newItemsToAdd]);
    const loadedRfqIds = new Set<number>();
    const newCostsToAdd: any[] = [];
    let baseId = Date.now();
    for (const it of selected) {
      if (!loadedRfqIds.has(it.rfq_id)) {
        loadedRfqIds.add(it.rfq_id);
        for (const c of (it.costs || [])) {
          newCostsToAdd.push({
            id: baseId++,
            code: c.code,
            name: c.name,
            quantity: c.quantity,
            unit: c.unit,
            net_unit_price: c.net_unit_price,
            net_total: c.net_total,
            supplier: c.supplier,
            supplier_name: c.supplier_name,
            currency: c.currency_code || 'HUF',
            is_stock: c.is_stock,
          });
        }
      }
    }
    if (newCostsToAdd.length) setNewCosts(prev => [...prev, ...newCostsToAdd]);
    setHistoryOpen(false);
    message.success(`${selected.length} tétel betöltve${newCostsToAdd.length ? `, ${newCostsToAdd.length} költségtétel` : ''}`);
  };

  const openCreate = async () => {
    // Automatikus kitöltés az aktuális felhasználóval
    const userName = user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '';
    setCurrentUserName(userName);
    // Felhasználók betöltése a select-hez
    try { const us = await salesService.listUsers(); setAllUsers(us); } catch {}
    setValidityDays(30);
    const today = dayjs();
    const nn = await salesService.getNextQuoteRequestNumber(today.format('YYYY-MM-DD'));
    setNextNumber(nn.number);
    try {
      const currs = await manufacturingService.getCurrencies();
      setCurrencyList(currs);
      const def = currs.find(c => c.is_default);
      if (def?.code) setCurrency(def.code.toUpperCase());
    } catch {}
    
    // Check if we have items to add from URL
    const addItemId = searchParams.get('add_item_id');
    const addItemType = searchParams.get('add_item_type');
    
    if (addItemId && addItemType) {
        // Pre-fill items list
        // We probably need to fetch the item detail to display it correctly in the ItemsTable/list
        // Or if 'newItems' state structure supports just ID and type, we push it.
        // Looking at handleAddItem in RFQs.tsx or ItemSelectorModal payload.
        // Usually items need full object.
        
        try {
            let item: any = null;
            if (addItemType === 'manufacturing') {
                item = await manufacturingService.getProduct(Number(addItemId));
                // Transform to RFQ Item structure
                 const rfqItem = {
                    item_type: 'manufacturing',
                    ref_id: item.id,
                    manufacturing_product: item,
                    name: item.name || `Egyedi termék #${item.id}`,
                    quantity: Number(item.quantity) || 1,
                    unit: item.quantity_unit || 'db',
                    net_unit_price: Number(item.net_unit_price) || 0,
                    vat_rate: 27,
                    description: item.description || '',
                    code: item.code
                 };
                 setNewItems([rfqItem]);
                 
                 // Transform Cost Items if available
                 if (item.cost_items && Array.isArray(item.cost_items)) {
                     // Need to fetch company names for suppliers if possible, or just load them async
                     const loadedCosts = await Promise.all(item.cost_items.map(async (ci: any, idx: number) => {
                        let supplierName = '';
                        let code = ci.code || '';
                        
                        // Try to fetch material details to get real code and supplier
                        if (ci.material || (!ci.code && ci.ref_id)) {
                             try {
                                 const matId = ci.material || ci.ref_id;
                                 const mat = await warehouseService.getMaterial(matId);
                                 if (mat) {
                                     code = mat.code;
                                     // If we don't have supplier yet, use material's supplier
                                     if (!ci.supplier && mat.supplier) {
                                         ci.supplier = mat.supplier; // Assuming ID
                                     }
                                 }
                             } catch (e) {
                                 console.warn("Failed to fetch material details for cost item", ci);
                             }
                        }
                        
                        // Resolve supplier name and ID properly
                        let supplierId = ci.supplier;
                        if (typeof ci.supplier === 'object' && ci.supplier !== null) {
                            supplierId = ci.supplier.id;
                            if (ci.supplier.name) supplierName = ci.supplier.name;
                        }
                        
                        // Use supplier_name from API if available (added to serializer)
                        if (ci.supplier_name) {
                            supplierName = ci.supplier_name;
                        }
                        
                        if (supplierId && !supplierName) {
                                try {
                                    // Try finding in loaded companies (customers) first, unlikely but possible
                                    const existing = companies.find(c => c.id == supplierId);
                                    if (existing) {
                                        supplierName = existing.name;
                                    } else {
                                        const sup = await crmService.getCompany(supplierId);
                                        supplierName = sup.name;
                                    }
                                } catch {
                                    supplierName = `Beszállító #${supplierId}`;
                                }
                        }
                        
                        return {
                         id: Date.now() + idx,
                         code: code || ci.ref_id, // Fallback to ref_id if still no code
                         name: ci.name,
                         quantity: Number(ci.quantity) || 0,
                         unit: ci.unit || 'db',
                         net_unit_price: Number(ci.cost_price) || 0,
                         net_total: (Number(ci.quantity) || 0) * (Number(ci.cost_price) || 0),
                         supplier: supplierId, 
                         supplier_name: supplierName,
                         currency: item.currency_info?.code || 'HUF',
                         is_stock: false
                        };
                     }));
                     setNewCosts(loadedCosts);
                 }
            }
            // Add other types if needed
        } catch (e) {
            console.error('Failed to load item from URL', e);
        }
    }

    // Pre-fill company & contact from URL params
    const urlCompany = searchParams.get('company');
    const urlContact = searchParams.get('contact');
    let pendingCompanyId: any = null;
    let pendingContactId: any = null;
    if (urlCompany) {
      const companyId: any = isNaN(Number(urlCompany)) ? urlCompany : Number(urlCompany);
      pendingCompanyId = companyId;
      // Eagerly load companies so the select has options and shows the name
      try {
        const list = await crmService.getCompanies({ is_customer: true, compact: true });
        const all: any[] = ((list as any).results ?? list) || [];
        // Ensure the selected company is in the list
        if (!all.find((c: any) => String(c.id) === String(companyId))) {
          try {
            const co = await crmService.getCompany(companyId);
            all.unshift(co);
          } catch {}
        }
        setCompanies(all);
      } catch {}
      // Load contacts for this company
      try {
        const contactList = await crmService.getContactsByCompany(companyId);
        const resolved = ((contactList as any).results ?? contactList) || [];
        setContacts(resolved);
        if (urlContact) {
          pendingContactId = isNaN(Number(urlContact)) ? urlContact : Number(urlContact);
        }
      } catch {}
    }
    
    // Reset items immediately before opening to guarantee empty state
    form.resetFields();
    setNewItems([]);
    setNewCosts([]);
    setRfqFiles([]);
    setRfqImpositionPresets([]);
    setRfqFileRemarks({});
    setRfqFileDisplayNames({});
    try {
      sessionStorage.removeItem('rfq_create_draft');
      sessionStorage.removeItem('rfq_create_draft_active');
    } catch {}

    setCreateOpen(true);

    // Defer form.setFieldsValue until after the modal renders (via useEffect)
    if (pendingCompanyId || pendingContactId) {
      const vals: Record<string, any> = {};
      if (pendingCompanyId) vals.company_id = pendingCompanyId;
      if (pendingContactId) vals.contact_ids = [pendingContactId];
      setPendingFormValues(vals);
    }
  };

  const openCreateFromCopy = async (rfqRecord: any, sourceItem?: any) => {
    // Single-item copy: új lapon nyitja meg az ajánlatkészítő formt (mint a "+ Új" gomb),
    // a másolt tétel előre kitöltve — nem modal, hanem teljes körű szerkesztési felület.
    if (sourceItem) {
      const mappedItem = {
        id: Date.now(),
        item_type: sourceItem.item_type || 'manufacturing',
        ref_id: sourceItem.product?.id ?? sourceItem.manufacturing_product?.id ?? sourceItem.service?.id ?? null,
        name: sourceItem.item_name || sourceItem.product_name || sourceItem.manufacturing_product_name || sourceItem.service_name || '',
        quantity: Number(sourceItem.quantity) || 1,
        unit: sourceItem.unit || 'db',
        net_unit_price: Number(sourceItem.net_unit_price) || 0,
        vat_rate: sourceItem.vat_rate ?? 27,
        description: sourceItem.description || '',
        internal_description: sourceItem.internal_description || sourceItem.manufacturing_product_internal_description || '',
        cost_items_data: sourceItem.cost_items_data || [],
        discount_percent: sourceItem.discount_percent ?? 0,
        discount_amount: sourceItem.discount_amount ?? 0,
        formulas: {
          // Default: manual pricing (false) — if the source explicitly had true, it takes priority
          _price_from_cost_calc: false,
          ...(sourceItem.formulas || {}),
        },
        _fromCopy: true,
      };
      const payload = {
        item: mappedItem,
        rfq: {
          company_id: rfqRecord.company?.id ?? null,
          contacts: (rfqRecord.contacts || []).map((c: any) => ({ id: c.id, full_name: c.full_name || c.name || '' })),
          contact_ids: (rfqRecord.contacts || []).map((c: any) => c.id),
          currency_code: rfqRecord.currency_code || 'HUF',
          project_id: rfqRecord.project ?? rfqRecord.project_id ?? null,
          validity_days: rfqRecord.validity_days || 30,
        },
      };
      try { localStorage.setItem('rfq_item_copy_payload', JSON.stringify(payload)); } catch {}
      window.open('/sales/rfqs?create=true&from_item_copy=1', '_blank');
      return;
    }
    form.resetFields();
    setNewItems([]);
    setNewCosts([]);
    setRfqFiles([]);
    setRfqImpositionPresets([]);
    setRfqFileRemarks({});
    setRfqFileDisplayNames({});
    clearDraft();

    const userName = user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '';
    setCurrentUserName(userName);

    const today = dayjs();
    const nn = await salesService.getNextQuoteRequestNumber(today.format('YYYY-MM-DD'));
    setNextNumber(nn.number);

    try {
      const currs = await manufacturingService.getCurrencies();
      setCurrencyList(currs);
      const def = currs.find((c: any) => c.is_default);
      if (def?.code) setCurrency(def.code.toUpperCase());
    } catch {}

    setValidityDays(rfqRecord.validity_days || 30);
    setPartialOrderAllowed(rfqRecord.partial_order_allowed ?? true);

    // Load company list + contacts for the copied RFQ's company
    const companyId = rfqRecord.company?.id;
    if (companyId) {
      try {
        const list = await crmService.getCompanies({ is_customer: true, compact: true });
        const all: any[] = ((list as any).results ?? list) || [];
        if (!all.find((c: any) => String(c.id) === String(companyId))) {
          try { const co = await crmService.getCompany(companyId); all.unshift(co); } catch {}
        }
        setCompanies(all);
      } catch {}
      try {
        const contactList = await crmService.getContactsByCompany(companyId);
        setContacts(((contactList as any).results ?? contactList) || []);
      } catch {}
    }

    // Always ensure the RFQ's own contacts are in the contacts state so the Select shows names
    const rfqContacts: any[] = rfqRecord.contacts || [];
    if (rfqContacts.length > 0) {
      setContacts(prev => {
        const existing = new Set(prev.map((c: any) => String(c.id)));
        const toAdd = rfqContacts.filter((c: any) => !existing.has(String(c.id)));
        return toAdd.length ? [...prev, ...toAdd] : prev;
      });
    }

    // When copying a specific item, leave newItems empty — the inline editor will populate it.
    // When copying the whole RFQ (no sourceItem), pre-populate all items.
    if (!sourceItem) {
      const mappedItems = (rfqRecord.items || []).map((item: any, idx: number) => ({
        id: Date.now() + idx,
        item_type: item.item_type || 'product',
        ref_id: item.product?.id ?? item.manufacturing_product?.id ?? item.service?.id ?? item.ref_id,
        name: item.name || item.product_name || item.manufacturing_product_name || item.service_name || '',
        code: item.code || item.product?.code || item.manufacturing_product?.code || item.service?.code,
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'db',
        net_unit_price: Number(item.net_unit_price) || 0,
        vat_rate: item.vat_rate ?? 27,
        description: item.description || '',
        internal_description: item.internal_description || '',
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        formulas: {
          // Default: manual pricing (false) — if the source explicitly had true, it takes priority
          _price_from_cost_calc: false,
          ...(item.formulas || {}),
        },
        cost_items_data: item.cost_items_data || [],
        _fromHistory: true,
      }));
      setNewItems(mappedItems);
    } else {
      setNewItems([]);
      setNewCosts([]);
    }

    setCreateOpen(true);

    const formValues: Record<string, any> = {
      issue_date: today,
      title: rfqRecord.title || '',
      description: rfqRecord.description || '',
    };
    if (companyId) formValues.company_id = companyId;
    if (rfqRecord.contacts?.length) formValues.contact_ids = rfqRecord.contacts.map((c: any) => ({ value: c.id, label: c.full_name || c.name || '' }));
    setPendingFormValues(formValues);
  };

  const handleCopyItemSave = async (p: SelectedItemPayload) => {
    try {
      const today = copyItemIssueDate || dayjs();
      const vDays = copyItemValidityDays || 30;
      const itemName = (p as any).name || (p as any).manufacturing_product_name || '';
      const rfq = await salesService.createQuoteRequest({
        title: itemName,
        description: itemName || 'Másolat',
        issue_date: today.format('YYYY-MM-DD'),
        ...(copyItemDeadline ? { deadline: copyItemDeadline.format('YYYY-MM-DD') } : {}),
        validity_days: vDays,
        valid_until: today.add(vDays, 'day').format('YYYY-MM-DD'),
        partial_order_allowed: copySourceRfq?.partial_order_allowed ?? true,
      });
      await salesService.updateQuoteRequestBasic(rfq.id, {
        contact_ids: copyItemContactIds,
        currency_code: currency,
        project_id: copyItemProjectId ?? null,
        ...(copyItemCompanyId ? { company_id: copyItemCompanyId } : {}),
      });
      if (p.item_type === 'product') {
        await salesService.addRfqProductItem(rfq.id, p.ref_id!, p.name || '', p.quantity || 1, (p as any).description || '', p.unit || 'db', p.net_unit_price || 0, p.vat_rate || 27, (p as any).discount_percent, (p as any).discount_amount, p.ref_id!);
      } else if (p.item_type === 'manufacturing') {
        if ((p as any).pendingManuPayload && p.ref_id! < 0) {
          // ── Pending (deferred) item: ManufacturingProduct nélkül ──
          const { _costItemsState: costState, _currency: _cur, _costCurrency: _cc, ...manuPayload } = (p as any).pendingManuPayload;
          await salesService.createDirectManufacturingItem(rfq.id, {
            name: p.name || '',
            quantity: p.quantity || 1,
            description: (p as any).description || '',
            internal_description: manuPayload.internal_description || '',
            quantity_unit: p.unit || 'db',
            net_unit_price: p.net_unit_price || 0,
            vat_rate: p.vat_rate || 27,
            discount_percent: (p as any).discount_percent || 0,
            discount_amount: (p as any).discount_amount || 0,
            cost_items: costState || [],
          });
        } else if (!p.ref_id) {
          // ── Direkt tétel másolása (quoteItemId útvonal, ref_id=null) ──
          await salesService.createDirectManufacturingItem(rfq.id, {
            name: p.name || '',
            quantity: p.quantity || 1,
            description: (p as any).description || '',
            internal_description: (p as any).internal_description || '',
            quantity_unit: p.unit || 'db',
            net_unit_price: p.net_unit_price || 0,
            vat_rate: p.vat_rate || 27,
            discount_percent: (p as any).discount_percent || 0,
            discount_amount: (p as any).discount_amount || 0,
            formulas: (p as any).formulas || {},
            cost_items: (p as any).cost_items_data || [],
          });
        } else {
          let manuRefId = p.ref_id!;
          if (p.ref_id! > 0) {
            // Safety fallback: always duplicate the source product so the new item is fully independent
            try {
              const dup = await manufacturingService.duplicateProduct(p.ref_id!);
              manuRefId = dup.id;
              if (p.name && p.name !== dup.name) {
                try { await manufacturingService.patchProduct(manuRefId, { name: p.name }); } catch {}
              }
            } catch {
              message.error(`Egyedi gyártás másolása sikertelen: ${p.name}`);
              return;
            }
          }
          await salesService.addRfqManufacturingItem(rfq.id, manuRefId, p.name || '', p.quantity || 1, (p as any).description || '', p.unit || 'db', p.net_unit_price || 0, p.vat_rate || 27, (p as any).discount_percent, (p as any).discount_amount, (p as any).formulas || {});
        }
      } else {
        await salesService.addRfqServiceItem(rfq.id, p.ref_id!, p.name || '', p.quantity || 1, (p as any).description || '', p.unit || 'db', p.net_unit_price || 0, p.vat_rate || 27, (p as any).discount_percent, (p as any).discount_amount);
      }
      message.success('Árajánlat létrehozva');
      setCopyItemModalOpen(false);
      setCopySourceItem(null);
      setCopySourceRfq(null);
      loadData();
    } catch {
      message.error('Hiba az árajánlat létrehozásakor');
    }
  };

  const DRAFT_KEY = 'rfq_create_draft';

  const saveDraft = () => {
    try {
      const vals = form.getFieldsValue(true);
      // Serialize dayjs to ISO string
      const serialized: any = { ...vals };
      if (vals.issue_date?.toISOString) serialized.issue_date = vals.issue_date.toISOString();
      if (vals.deadline?.toISOString) serialized.deadline = vals.deadline.toISOString();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        formValues: serialized,
        newItems,
        currency,
        companies,
        contacts,
      }));
      sessionStorage.setItem('rfq_create_draft_active', '1');
    } catch {}
  };

  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem('rfq_create_draft_active'); } catch {} };

  // Auto-save draft when items change
  useEffect(() => {
    if (createOpen) saveDraft();
  }, [newItems, createOpen]); // eslint-disable-line

  // PrintShop lap postMessage: ha az új árajánlat modal nyitva van és a PrintShop mentett egy tételt,
  // adjuk hozzá automatikusan a newItems listához
  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'PRINTSHOP_ITEM_SAVED') return;
      const d = event.data;
      setNewItems(prev => [...prev, {
        item_type: 'manufacturing',
        ref_id: d.manufacturing_product_id,
        manufacturing_product: { id: d.manufacturing_product_id, name: d.name },
        name: d.name || `Egyedi termék #${d.manufacturing_product_id}`,
        quantity: Number(d.quantity) || 1,
        unit: 'db',
        net_unit_price: Number(d.net_unit_price) || 0,
        vat_rate: 27,
        description: d.description || '',
      }]);
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (searchParams.get('create') === 'true' && !loading && !createOpen) {
       openCreate();
    }
  }, [searchParams, loading]); // eslint-disable-line

  // Ha az oldal ?create=true&from_item_copy=1 paraméterrel nyílt meg (új lapon való tétel-másolás),
  // akkor a create form megnyílása után alkalmazzuk a localStorage-ból kiolvasott másolási payloadot.
  useEffect(() => {
    if (!createOpen) return;
    if (searchParams.get('from_item_copy') !== '1') return;
    try {
      const raw = localStorage.getItem('rfq_item_copy_payload');
      if (!raw) return;
      const payload = JSON.parse(raw);
      localStorage.removeItem('rfq_item_copy_payload');
      if (payload.item) setNewItems([payload.item]);
      if (payload.rfq) {
        if (payload.rfq.validity_days) setValidityDays(payload.rfq.validity_days);
        if (payload.rfq.currency_code) setCurrency(payload.rfq.currency_code.toUpperCase());

        const companyId = payload.rfq.company_id;
        const contactIds: number[] = payload.rfq.contact_ids || [];

        // Közvetlenül hívjuk form.setFieldsValue a betöltés után, kétlépéses várakozással:
        // 1. requestAnimationFrame: React commit phase után
        // 2. setTimeout(80): Ant Design Select belső option-cache frissül → névvel jelenik meg
        const applyFormValues = (_loadedContacts: any[]) => {
          // labelInValue formátum: {value, label} — a label az eltárolt névből jön,
          // így nem kell az options listából keresni → azonnal névvel jelenik meg.
          const storedContacts: any[] = payload.rfq.contacts || [];
          const contactLabeled = contactIds.map((id: number) => {
            const stored = storedContacts.find((c: any) => c.id === id || String(c.id) === String(id));
            const loaded = _loadedContacts.find((c: any) => c.id === id || String(c.id) === String(id));
            const label = loaded?.full_name || loaded?.name || stored?.full_name || stored?.name || String(id);
            return { value: id, label };
          });
          requestAnimationFrame(() => {
            setTimeout(() => {
              const fv: Record<string, any> = {};
              if (companyId) fv.company_id = companyId;
              if (contactLabeled.length) fv.contact_ids = contactLabeled;
              if (payload.rfq.project_id) fv.project_id = payload.rfq.project_id;
              form.setFieldsValue(fv);
            }, 0);
          });
        };

        if (companyId) {
          (async () => {
            let loadedContacts: any[] = [];
            try {
              const [companyList, contactList] = await Promise.all([
                crmService.getCompanies({ is_customer: true, compact: true }).catch(() => []),
                crmService.getContactsByCompany(companyId).catch(() => []),
              ]);
              const all: any[] = ((companyList as any).results ?? companyList) || [];
              if (!all.find((c: any) => String(c.id) === String(companyId))) {
                try { const co = await crmService.getCompany(companyId); all.unshift(co); } catch {}
              }
              loadedContacts = ((contactList as any).results ?? contactList) || [];
              setCompanies(all);
              setContacts(loadedContacts);
            } catch {}
            applyFormValues(loadedContacts);
          })();
        } else if (contactIds.length > 0) {
          (async () => {
            let loadedContacts: any[] = [];
            try {
              const results = await Promise.all(
                contactIds.map((id: number) => crmService.getContact(id).catch(() => null))
              );
              loadedContacts = results.filter(Boolean);
              setContacts(loadedContacts);
            } catch {}
            applyFormValues(loadedContacts);
          })();
        } else {
          applyFormValues([]);
        }
      }
    } catch {}
  }, [createOpen]); // eslint-disable-line

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('pixi_rfq_updates');
      channel.onmessage = (event) => {
        if (event?.data?.type === 'rfq-item-updated') {
          loadData();
        }
      };
    } catch {}

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'pixi_rfq_item_updated') {
        loadData();
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      try { channel?.close(); } catch {}
      window.removeEventListener('message', handleMessage);
    };
  }, [loadData]);

  useEffect(() => {
    if (!createOpen) return;
    const timer = setTimeout(() => {
      setInitialFormSnapshot(getFormSnapshot());
    }, 0);
    return () => clearTimeout(timer);
  }, [createOpen]); // eslint-disable-line

  useEffect(() => {
    if (pendingFormValues) {
      form.setFieldsValue(pendingFormValues);
      setPendingFormValues(null);
    }
  }, [pendingFormValues]); // eslint-disable-line


  const handleCancel = () => {
    const clearParams = () => {
         if (searchParams.get('create') === 'true') {
            navigate('/sales/rfqs', { replace: true });
         }
    };

    if (hasFormChanges()) {
      Modal.confirm({
        title: 'Biztos, hogy mentés nélkül be akarja zárni?',
        icon: <ExclamationCircleOutlined />,
        content: 'A módosítások elvesznek.',
        okText: 'Bezár',
        cancelText: 'Mégse',
        onOk: () => {
          clearDraft();
      setCopySourceItem(null);
      setCreateOpen(false);
      form.resetFields();
      clearParams();
        },
      });
    } else {
      clearDraft();
      setCopySourceItem(null);
      setCreateOpen(false);
      form.resetFields();
      clearParams();
    }
  };

  const onIssueDateChange = async (value: dayjs.Dayjs | null) => {
    const date = value || dayjs();
    const nn = await salesService.getNextQuoteRequestNumber(date.format('YYYY-MM-DD'));
    setNextNumber(nn.number);
    // if user didn't override deadline, recompute default 14 workdays from new issue date
    const currentDeadline = form.getFieldValue('deadline');
    if (!currentDeadline) {
      form.setFieldValue('deadline', addWorkdays(date, 14));
    }
  };

  function addWorkdays(start: dayjs.Dayjs, workdays: number): dayjs.Dayjs {
    let d = start;
    let added = 0;
    while (added < workdays) {
      d = d.add(1, 'day');
      const day = d.day();
      if (day !== 0 && day !== 6) added += 1; // Mon-Fri only
    }
    return d;
  }

  const handleBulkOrder = () => {
    const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    const rfqIds = Array.from(new Set(selectedItems.map((item: any) => item.rfq_id as number)));
    if (!rfqIds.length) return;

    // Split into already-in-production (or higher) and needs-production
    // Use effective_status (based on CustomerOrderItem statuses) — not rfq.status
    // rfq.status='ordered' only means an order was PLACED (could be via public form), not that it's in production
    const IN_PRODUCTION_OR_ABOVE = ['in_production', 'ready', 'in_delivery', 'delivered', 'invoiced'];
    const alreadyOrderedIds = rfqIds.filter(id => {
      const rfq = findRfqByRef((rfqs || []) as any[], id);
      const effectiveStatus = rfq?.effective_status || rfq?.status;
      return rfq && IN_PRODUCTION_OR_ABOVE.includes(effectiveStatus);
    });
    const toCreateIds = rfqIds.filter(id => !alreadyOrderedIds.includes(id));

    if (alreadyOrderedIds.length > 0 && toCreateIds.length === 0) {
      // All RFQs already have orders — just offer the confirmation email
      Modal.confirm({
        title: 'Tételek már gyártásban vannak',
        icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
        content: `A kijelölt ${alreadyOrderedIds.length} ajánlat tételei már gyártásban vannak. Szeretne visszaigazoló e-mailt küldeni?`,
        okText: 'Igen, e-mail küldés',
        cancelText: 'Mégse',
        onOk: () => handleCreateOrder(alreadyOrderedIds, false),
      });
    } else if (alreadyOrderedIds.length > 0) {
      // Mixed: some new, some already ordered
      Modal.confirm({
        title: 'Gyártásba küldés',
        icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
        content: (
          <div>
            <p>Biztosan gyártásba küldi a kijelölt {selectedItems.length} tételt?</p>
            <p style={{ color: '#d48806' }}>⚠ {alreadyOrderedIds.length} ajánlat tételei már gyártásban vannak — csak visszaigazoló e-mail kerül kiküldésre.</p>
            <p>Új megrendelés: {toCreateIds.length} ajánlat</p>
          </div>
        ),
        okText: `Igen, küldés`,
        cancelText: 'Mégse',
        onOk: () => handleCreateOrder(rfqIds, true),
      });
    } else {
      Modal.confirm({
        title: 'Gyártásba küldés',
        content: `Biztosan gyártásba küldi a kijelölt ${selectedItems.length} tételt (${rfqIds.length} ajánlat)?`,
        okText: 'Igen, gyártásba küld',
        cancelText: 'Mégse',
        onOk: () => handleCreateOrder(rfqIds, true),
      });
    }
  };

  const handleCreateOrder = async (rfqIds: number[], sendToProduction = false) => {
    setCreateOrderLoading(true);
    const createdOrders: { orderId: number; rfqId: number }[] = [];
    let newCount = 0;
    for (const rfqId of rfqIds) {
      try {
        const res = await salesService.orderAllFromRfq(rfqId, undefined);
        const alreadyExisted = !!(res as any).already_exists;
        if (sendToProduction) {
          if (!alreadyExisted) newCount++;
          try {
            await api.post(`/sales/customer-orders/${res.order_id}/update_status/`, { status: 'in_production', send_email: false });
          } catch {}
        }
        createdOrders.push({ orderId: res.order_id, rfqId });
      } catch (e: any) {
        message.error(`Hiba a megrendelésnél (QR #${rfqId}): ${e?.response?.data?.error || e.message}`);
      }
    }
    setCreateOrderLoading(false);
    setBulkSelectedKeys([]);
    setBulkOrderLoading(false);
    if (createdOrders.length > 0) {
      if (newCount > 0) message.success(`${newCount} megrendelés létrehozva`);
      loadData();
      // Group orders by customer (company or customer id) so same customer gets one combined email
      const grouped: { [key: string]: { orderId: number; rfqId: number }[] } = {};
      for (const co of createdOrders) {
        const rfq = findRfqByRef((rfqs || []) as any[], co.rfqId);
        const companyKey = String(rfq?.company?.id || rfq?.customer?.id || `rfq_${co.rfqId}`);
        if (!grouped[companyKey]) grouped[companyKey] = [];
        grouped[companyKey].push(co);
      }
      const groupedEmailOrders = Object.values(grouped).map(orders => ({
        primaryOrderId: orders[0].orderId,
        orderIds: orders.map(o => o.orderId),
        rfqId: orders[0].rfqId,
        rfqIds: orders.map(o => o.rfqId),
      }));
      setConfirmEmailOrders(groupedEmailOrders);
      setConfirmEmailIndex(0);
      setConfirmEmailSentSet([]);
      setConfirmEmailAskOpen(true);
    }
  };

  const openConfirmEmailModal = async (orderEntry: { primaryOrderId: number; orderIds: number[]; rfqId: number; rfqIds: number[] }, signatureKey?: string) => {
    setConfirmEmailPreview(null);
    try {
      const additionalIds = orderEntry.orderIds.filter(id => id !== orderEntry.primaryOrderId);
      const sigKey = signatureKey ?? confirmEmailForm.getFieldValue('signature_key') ?? undefined;
      const res = await api.post(`/sales/customer-orders/${orderEntry.primaryOrderId}/render_confirmation_email/`, {
        template_key: 'order_confirmation',
        additional_order_ids: additionalIds,
        signature_key: sigKey || undefined,
      });
      confirmEmailForm.setFieldsValue({ to: res.data.to || '', subject: res.data.subject || '', body: res.data.body || '', signature_key: sigKey });
      setConfirmEmailPreview(res.data);
    } catch {
      const rfq = findRfqByRef((rfqs || []) as any[], orderEntry.rfqId);
      const to = (rfq?.contacts || []).map((c: any) => c.email).filter(Boolean).join(', ');
      confirmEmailForm.setFieldsValue({ to, subject: 'Megrendelés visszaigazolás', body: '' });
    }
    setConfirmEmailOpen(true);
  };

  const buildCombinedPublicUrl = (rec: any) => {
    const additionalTokens = currentSendAdditionalRfqIdsRef.current
      .map(id => findRfqByRef((rfqs || []) as any[], id)?.public_token)
      .filter(Boolean);
    const baseUrl = rec?.public_order_url || '';
    const urlParams: string[] = [];
    if (additionalTokens.length) urlParams.push(`extra_tokens=${additionalTokens.join(',')}`);
    if (currentSendItemIdsRef.current.length) urlParams.push(`item_ids=${currentSendItemIdsRef.current.join(',')}`);
    return urlParams.length ? `${baseUrl}?${urlParams.join('&')}` : baseUrl;
  };

  const openSendModal = async (rfqId: number | string, additionalRfqIds?: (number | string)[], itemIds?: number[]) => {
    setSendOpenId(rfqId);
    setSendPreview(null);
    currentSendAdditionalRfqIdsRef.current = additionalRfqIds || [];
    currentSendItemIdsRef.current = itemIds || [];
    const cacheKey = String(rfqId);

    // Restore cached edits if the user previously edited this RFQ's email
    if (sendFormCacheRef.current[cacheKey]) {
      sendForm.setFieldsValue(sendFormCacheRef.current[cacheKey]);
      return;
    }

    let templates: any[] = emailTemplates.length ? emailTemplates : [];
    let sigs: any[] = signatures.length ? signatures : [];
    try {
      const [templatesRes, sigsRes] = await Promise.all([
        settingsService.getEmailTemplates(),
        settingsService.getSignatures(),
      ]);
      templates = Array.isArray(templatesRes) ? templatesRes : (templatesRes?.results ?? []);
      sigs = Array.isArray(sigsRes) ? sigsRes : (sigsRes?.results ?? []);
      setEmailTemplates(templates);
      setSignatures(sigs);
    } catch {}

    const record = findRfqByRef((rfqs || []) as any[], rfqId);
    if (!record) {
      sendForm.setFieldsValue({ template_key: 'rfq_send', to: '', cc: '', reply_to: '', subject: '', body: '' });
      return;
    }

    const allContactEmails = (record.contacts || []).map((c: any) => c.email).filter(Boolean);
    const contactEmailTo = allContactEmails.join(', ');

    let signatureKey = '';
    let userPrefs: any = null;
    try {
      const prefs = await settingsService.getUserPreferences();
      userPrefs = prefs;
      if (prefs?.default_signature_key) signatureKey = prefs.default_signature_key;
    } catch {}
    if (!signatureKey && sigs.length > 0) signatureKey = sigs[0].key;

    const isMultiItem = itemIds && itemIds.length > 1;
    const templateKey = isMultiItem ? 'rfqs_send' : 'rfq_send';
    const defaultTemplate = templates.find((t: any) => t.key === templateKey) || templates.find((t: any) => t.key === 'rfq_send');
    let subject = '';
    let body = '';
    let cc = '';
    let replyTo = '';

    if (defaultTemplate) {
      subject = defaultTemplate.subject_template || '';
      body = defaultTemplate.body_template || '';
      cc = defaultTemplate.default_cc || '';
      replyTo = defaultTemplate.default_reply_to || '';
      const contactNames = (record.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
      const rawProjectName = record.project_name || '';
      const projectName = rawProjectName ? `${rawProjectName}: ` : '';

      // Compute item_names for rfqs_send: comma-separated, max 50 chars
      let itemNamesStr = '';
      if (itemIds && itemIds.length > 0) {
        const matchedItems = (flattenedItems || []).filter((it: any) => itemIds.includes(it.id));
        const names = matchedItems.map((it: any) =>
          it.item_name || it.product_name || it.manufacturing_product_name || it.material_name || it.service_name || ''
        ).filter(Boolean);
        itemNamesStr = names.join(', ');
        if (itemNamesStr.length > 50) {
          itemNamesStr = itemNamesStr.slice(0, 47).replace(/,\s*$/, '') + '...';
        }
      }

      subject = subject.replace(/{rfq_number}/g, record.number || record.request_number || '');
      subject = subject.replace(/{rfq_title}/g, record.title || '');
      subject = subject.replace(/{company_name}/g, record.company?.name || '');
      subject = subject.replace(/{contact_names}/g, contactNames);
      subject = subject.replace(/{project_name}/g, projectName);
      subject = subject.replace(/{item_names}/g, itemNamesStr);
      body = body.replace(/{rfq_number}/g, record.number || record.request_number || '');
      body = body.replace(/{rfq_title}/g, record.title || '');
      body = body.replace(/{company_name}/g, record.company?.name || '');
      body = body.replace(/{contact_names}/g, contactNames);
      body = body.replace(/{public_order_url}/g, buildCombinedPublicUrl(record));
    }

    if (signatureKey) {
      const signature = sigs.find((s: any) => s.key === signatureKey);
      if (signature?.body_html) {
        let sigBody = signature.body_html;
        const uName = userPrefs ? (userPrefs.name || [userPrefs.first_name || '', userPrefs.last_name || ''].join(' ').trim()) : '';
        sigBody = sigBody.replace(/{user_name}/g, uName);
        sigBody = sigBody.replace(/{user_email}/g, userPrefs?.email || '');
        sigBody = sigBody.replace(/{user_phonenumber}/g, userPrefs?.phone_number || '');
        sigBody = sigBody.replace(/{user_position}/g, userPrefs?.employee_profile?.position?.title || userPrefs?.position || '');
        body = body + (defaultTemplate?.is_html ? '' : '\n\n') + sigBody;
      }
    }

    if (userPrefs) {
      const userName = userPrefs.name || [userPrefs.first_name || '', userPrefs.last_name || ''].join(' ').trim();
      body = body.replace(/{user_name}/g, userName);
      body = body.replace(/{user_email}/g, userPrefs.email || '');
      body = body.replace(/{user_phonenumber}/g, userPrefs.phone_number || '');
    }

    sendForm.setFieldsValue({ template_key: templateKey, to: contactEmailTo, cc, reply_to: replyTo, signature_key: signatureKey, subject, body });
  };

  const handleBulkSetOrdered = async () => {
    const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    const rfqIds = Array.from(new Set(selectedItems.map((item: any) => item.rfq_id as number)));
    if (!rfqIds.length) return;
    setBulkSetOrderedLoading(true);
    let successCount = 0;
    for (const rfqId of rfqIds) {
      try {
        await salesService.setQuoteRequestStatus(rfqId, 'ordered');
        successCount++;
      } catch {
        message.error(`Hiba az ajánlat #${rfqId} státuszának frissítésekor`);
      }
    }
    setBulkSetOrderedLoading(false);
    if (successCount > 0) {
      message.success(`${successCount} ajánlat Megrendelve státuszba helyezve`);
      setBulkSelectedKeys([]);
      loadData();
    }
  };

  const [bulkStatusChangeLoading, setBulkStatusChangeLoading] = useState(false);
  const handleBulkChangeStatus = async (newStatus: string) => {
    const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    if (!selectedRows.length) return;
    const label = rfqStatusOptions.find(o => o.value === newStatus)?.label || newStatus;
    setBulkStatusChangeLoading(true);
    let successCount = 0;

    // Cost-item statuses apply to the manufacturing cost items of the RFQ's primary item.
    const COST_ITEM_VALID_STATUSES = ['new', 'in_design', 'pending_customer_approval', 'pending_internal_approval', 'confirmed', 'sent', 'in_production', 'ready', 'in_delivery', 'delivered', 'rejected'];
    const isCostItemStatus = COST_ITEM_VALID_STATUSES.includes(newStatus);

    for (const row of selectedRows) {
      const hasCosts = (row.cost_items_statuses || []).length > 0;
      if (isCostItemStatus && hasCosts && row.id) {
        // row.id = firstItem.id (1 RFQ = 1 item guaranteed)
        try {
          await salesService.updateRfqItemCostItemsStatus(row.id, newStatus);
          successCount++;
        } catch {
          message.error(`Hiba a gyártási státusz frissítésekor (#${row.rfq_id})`);
        }
      } else {
        try {
          await salesService.setQuoteRequestStatus(row.rfq_id, newStatus);
          successCount++;
        } catch {
          message.error(`Hiba az ajánlat #${row.rfq_id} státuszának frissítésekor`);
        }
      }
    }

    setBulkStatusChangeLoading(false);
    if (successCount > 0) {
      message.success(`${successCount} ajánlat → ${label}`);
      setBulkSelectedKeys([]);
      loadData();
    }
  };

  const handleBulkSendEmail = () => {
    const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    if (!selectedRows.length) return;
    // Group by company so same-company RFQs get one combined email.
    const getGroupKey = (rfq: any, fallbackId: any): string => {
      if (rfq?.company?.id || rfq?.company_id) return String(rfq?.company?.id || rfq?.company_id);
      const contactIds = ((rfq?.contacts || []) as any[]).map((c: any) => c.id).sort();
      if (contactIds.length) return `contacts_${contactIds.join('_')}`;
      return `_${fallbackId}`;
    };
    const byCompany = new Map<string, string[]>();
    selectedRows.forEach((row: any) => {
      const rfq = findRfqByRef((rfqs || []) as any[], row.rfq_id);
      const key = getGroupKey(rfq, row.rfq_id);
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(row.rfq_id);
    });
    const list = Array.from(byCompany.entries()).map(([, ids]) => ({
      rfqId: ids[0],
      additionalRfqIds: ids.slice(1),
      // itemIds: for 1 RFQ = 1 item, the first item id is the row id
      itemIds: selectedRows
        .filter((r: any) => ids.includes(r.rfq_id) && r.id)
        .map((r: any) => r.id),
      sent: false,
    }));
    setSendRfqList(list);
    setSendRfqIndex(0);
    openSendModal(list[0].rfqId, list[0].additionalRfqIds, list[0].itemIds);
  };

  const DELIVERABLE_RFQ_STATUSES = ['ordered', 'confirmed', 'in_production', 'ready', 'in_delivery', 'in_design',
    'pending_customer_approval', 'pending_internal_approval', 'accepted', 'in_progress'];

  const handleBulkDelivery = async () => {
    const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    const deliverableRows = selectedItems.filter((item: any) =>
      DELIVERABLE_RFQ_STATUSES.includes(item.status || item.rfq_status)
    );
    if (!deliverableRows.length) {
      message.warning('Nincs szállítható ajánlat a kijelöltek között (csak megrendelt/kész státuszú ajánlatot lehet szállítani)');
      return;
    }
    // Load pickup locations if not loaded yet
    if (!pickupLocations.length) {
      try {
        const res = await api.get('/sales/pickup-locations/?active_only=1');
        setPickupLocations(res.data?.results || res.data || []);
      } catch {
        setPickupLocations([]);
      }
    }
    setDeliveryType('home');
    setSelectedPickupLocationId(null);
    setDeliveryModalOpen(true);
  };

  const confirmBulkDelivery = async () => {
    if (deliveryType === 'pickup' && !selectedPickupLocationId) {
      message.error('Válasszon átvételi pontot!');
      return;
    }
    const selectedItems = flattenedItems.filter((item: any) =>
      bulkSelectedKeys.includes(item.uniqueId) &&
      DELIVERABLE_RFQ_STATUSES.includes(item.rfq_status || item.status)
    );
    if (!selectedItems.length) return;
    const getPrimaryContactId = (rfq: any): number | null => {
      const rawContactId =
        rfq?.primary_contact?.id ??
        rfq?.primary_contact_id ??
        (Array.isArray(rfq?.contacts) && rfq.contacts.length
          ? (typeof rfq.contacts[0] === 'object' ? rfq.contacts[0]?.id : rfq.contacts[0])
          : null) ??
        (Array.isArray(rfq?.contact_ids) && rfq.contact_ids.length ? rfq.contact_ids[0] : null);
      const parsed = Number(rawContactId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const isPrivateRfq = (rfq: any): boolean => {
      if (rfq?.company?.id || rfq?.company_id || rfq?.company?.name || rfq?.company_name) return false;
      const contacts = Array.isArray(rfq?.contacts) ? rfq.contacts : [];
      return !contacts.some((c: any) => c?.company?.id || c?.company_id || c?.company?.name || c?.company_name);
    };
    const groups = new Map<string, { rfqIds: string[]; customerId: number | null; contactId: number | null }>();
    selectedItems.forEach((item: any) => {
      const rfq = findRfqByRef((rfqs || []) as any[], item.rfq_id);
      const companyId = Number(rfq?.company?.id || rfq?.company_id || 0) || null;
      const contactId = getPrimaryContactId(rfq);
      const usePrivateContactGrouping = isPrivateRfq(rfq) && !!contactId;
      const groupKey = usePrivateContactGrouping
        ? `private_contact_${contactId}`
        : companyId
          ? `company_${companyId}`
          : `rfq_${item.rfq_id}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          rfqIds: [],
          customerId: usePrivateContactGrouping ? null : companyId,
          contactId: usePrivateContactGrouping ? contactId : null,
        });
      }
      const group = groups.get(groupKey)!;
      if (!group.rfqIds.includes(item.rfq_id)) {
        group.rfqIds.push(item.rfq_id);
      }
    });

    setBulkDeliveryLoading(true);
    let successCount = 0;
    const createdNoteIds: number[] = [];
    try {
      for (const [, group] of Array.from(groups.entries())) {
        const rfq = findRfqByRef((rfqs || []) as any[], group.rfqIds[0]);
        const payload: any = {
          rfq_ids: group.rfqIds,
          delivery_type: deliveryType,
          delivery_date: new Date().toISOString().split('T')[0],
        };
        if (deliveryType === 'pickup' && selectedPickupLocationId) {
          payload.pickup_location_id = selectedPickupLocationId;
        }
        if (group.customerId) {
          payload.customer_id = group.customerId;
        } else if (group.contactId) {
          payload.contact_id = group.contactId;
        } else if (rfq?.company?.id) {
          payload.customer_id = rfq.company.id;
        } else if (rfq?.contacts?.length) {
          payload.contact_id = typeof rfq.contacts[0] === 'object' ? rfq.contacts[0].id : rfq.contacts[0];
        }
        try {
          const res = await api.post('/sales/delivery-notes/create_from_rfq_items/', payload);
          createdNoteIds.push(res.data.id);
          successCount++;
        } catch (err: any) {
          message.error('Hiba a szállítólevél létrehozásakor: ' + (err?.response?.data?.error || err?.message || 'Ismeretlen hiba'));
        }
      }
    } finally {
      setBulkDeliveryLoading(false);
      setDeliveryModalOpen(false);
    }
    if (successCount > 0) {
      message.success(`${successCount} szállítólevél létrehozva`);
      setBulkSelectedKeys([]);
      loadData();
      // Open delivery notes page in new tab with email modal for first created note
      const noteParam = createdNoteIds.length > 0 ? `?email_note_id=${createdNoteIds[0]}` : '';
      window.open(`/sales/delivery-notes${noteParam}`, '_blank');
    }
  };

  const openHandover = async () => {
    const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    if (!selectedRows.length) { message.warning('Nincs kijelölt ajánlat'); return; }
    try {
      const [serialRes, regsRes] = await Promise.all([
        api.get('/sales/quote-requests/handover_serial_suggest/'),
        api.get('/finance/cash-registers/?can_deposit_for_me=1'),
      ]);
      setHandoverCashRegisters(regsRes.data?.results || regsRes.data || []);
      // Nettó összeg becslése a kijelölt sorokból (elsődleges tétel alapján)
      const net = selectedRows.reduce((sum: number, r: any) => {
        const lineNet = Number(r.net_unit_price || 0) * Number(r.quantity || 1);
        const discount = Number(r.discount_percent || 0);
        return sum + lineNet * (1 - discount / 100);
      }, 0);
      setHandoverNetTotal(net);
      handoverForm.setFieldsValue({ serial: serialRes.data?.serial || '', cash_register: undefined, note: '' });
      setHandoverOpen(true);
    } catch (e: any) {
      message.error('Nem sikerült megnyitni az átadás ablakot: ' + (e?.response?.data?.error || e.message));
    }
  };

  const submitHandover = async () => {
    try {
      const values = await handoverForm.validateFields();
      setHandoverLoading(true);
      const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
      const rfqIds = Array.from(new Set(selectedRows.map((r: any) => r.rfq_pk).filter(Boolean)));
      const res = await api.post('/sales/quote-requests/handover/', {
        rfq_ids: rfqIds,
        serial: values.serial,
        cash_register: values.cash_register,
        note: values.note || '',
      });
      message.success(`Átadás rögzítve: ${res.data?.serial}`);
      setHandoverOpen(false);
      setBulkSelectedKeys([]);
      const marker = `Átadás: ${res.data?.serial}`;
      // Helyi állapot frissítése: státusz → invoiced, invoice_number → marker
      setRfqs((prev: any[]) => prev.map((rfq: any) => {
        if (rfqIds.includes(rfq.id)) {
          const updatedItems = (rfq.items || []).map((it: any, idx: number) =>
            idx === 0 ? { ...it, invoice_number: marker } : it
          );
          return {
            ...rfq,
            status: 'invoiced',
            effective_status: 'invoiced',
            primary_invoice_number: marker,
            items: updatedItems,
          };
        }
        return rfq;
      }));
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('Átadás sikertelen: ' + (e?.response?.data?.error || e.message));
    } finally {
      setHandoverLoading(false);
    }
  };

  const handleBulkInvoice = async () => {
    const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    if (!selectedRows.length) {
      message.warning('Nincs kijelölt ajánlat számlázásra');
      return;
    }
    setBulkInvoiceLoading(true);
    try {
      // Group by company — one PixInvoice tab per company
      const groups = new Map<string, { rows: any[]; rfqId: string }>();
      selectedRows.forEach((row: any) => {
        const rfq = findRfqByRef((rfqs || []) as any[], row.rfq_id);
        const companyKey = String(rfq?.company?.id || rfq?.company_id || row.rfq_id);
        if (!groups.has(companyKey)) groups.set(companyKey, { rows: [], rfqId: row.rfq_id });
        groups.get(companyKey)!.rows.push({ row, rfq });
      });

      for (const group of Array.from(groups.values())) {
        const firstRfq = group.rows[0]?.rfq;
        const company = firstRfq?.company;
        const contacts = firstRfq?.contacts;

        let customerData: any = {};
        if (company) {
          customerData = {
            name: company.name,
            tax_number: company.tax_number,
            city: company.city,
            postal_code: company.postal_code,
            address: company.address,
          };
        } else if (contacts?.length) {
          const c = typeof contacts[0] === 'object' ? contacts[0] : null;
          if (c) customerData = { name: c.name || '', tax_number: c.tax_number || '', address: c.address || '' };
        }

        // 1 RFQ = 1 invoice line; use row snapshot with RFQ-level fallbacks
        const invoiceItems: any[] = group.rows.map(({ row, rfq }: any) => ({
          description: row.name || row.item_name || rfq?.primary_item_name || rfq?.title || 'Tétel',
          product_code_value: row.quote_number || row.product_code || rfq?.number || '',
          quantity: parseFloat(row.quantity ?? rfq?.primary_quantity ?? 1),
          unit_price: parseFloat(row.net_unit_price ?? rfq?.primary_net_unit_price ?? 0),
          vat_rate: parseFloat(row.vat_rate ?? rfq?.primary_vat_rate ?? 27),
          unit_of_measure: row.unit || rfq?.primary_unit || 'db',
        }));

        const rfqNumbers = group.rows.map(({ row }: any) => row.rfq_number || row.rfq_id);
        // A pixinvoice a számla mentése után a customer-orders/{id}/update_invoice_number/ végpontot
        // hívja vissza erp_order_ids alapján — ezért MEGRENDELÉS (CustomerOrder) id-kat kell küldeni,
        // nem RFQ id-kat. (Korábban erp_rfq_ids ment -> a visszaírás nem futott -> nem lett Kiszámlázva.)
        const erpOrderIds = Array.from(new Set(
          group.rows.flatMap(({ row, rfq }: any) => {
            const ids: any[] = [];
            if (row?.customer_order_id != null) ids.push(row.customer_order_id);
            ((rfq?.items || []) as any[]).forEach((it: any) => { if (it?.customer_order_id != null) ids.push(it.customer_order_id); });
            return ids;
          })
        )).filter((x: any) => x != null);
        const invoiceData = {
          customer: customerData,
          items: invoiceItems,
          notes: `ERP árajánlat: ${rfqNumbers.join(', ')}`,
          erp_order_ids: erpOrderIds,
          erp_rfq_ids: group.rows.map(({ row }: any) => row.rfq_id),
          erp_user_id: user?.id ?? null,
          delivery_date: dayjs().format('YYYY-MM-DD'),
        };

        const encodedData = btoa(encodeURIComponent(JSON.stringify(invoiceData)));
        const PixInvoiceUrl = process.env.REACT_APP_PIXINVOICE_URL || 'https://i.pixisys.eu';
        // Hash fragment (#) nem kerül a szerverre küldött URL-be → nincs 414 Request-URI Too Long
        window.open(`${PixInvoiceUrl}/invoices/new#erp_data=${encodedData}`, '_blank');
        // Fallback: clear leftover localStorage from previous approach
        try { localStorage.removeItem('erp_invoice_payload'); } catch {}
        message.success(`Számla előkészítve: ${company?.name || contacts?.[0]?.name || 'Ügyfél'}`);
      }
      setBulkSelectedKeys([]);
    } catch (err: any) {
      message.error('Hiba a számlázás előkészítésekor: ' + (err?.message || 'Ismeretlen hiba'));
    } finally {
      setBulkInvoiceLoading(false);
    }
  };

  const openBulkCustomerModal = async () => {
    setBulkCustomerCompanyId(null);
    setBulkCustomerContactIds([]);
    setBulkCustomerContacts([]);
    // Ensure companies list is loaded
    if (!companies.length) {
      try {
        const list = await crmService.getCompanies({ is_customer: true, compact: true });
        setCompanies(list.results ?? list);
      } catch {}
    }
    setBulkCustomerModalOpen(true);
  };

  const handleBulkCustomerCompanyChange = async (val: number | null) => {
    setBulkCustomerCompanyId(val);
    setBulkCustomerContactIds([]);
    setBulkCustomerContacts([]);
    if (val) {
      setBulkCustomerContactsLoading(true);
      try {
        const cl = await crmService.getContactsByCompany(val);
        setBulkCustomerContacts(Array.isArray(cl) ? cl : cl.results ?? []);
      } catch {
        setBulkCustomerContacts([]);
      } finally {
        setBulkCustomerContactsLoading(false);
      }
    }
  };

  const confirmBulkCustomerChange = async () => {
    const rfqIds = Array.from(new Set(
      flattenedItems
        .filter((item: any) => bulkSelectedKeys.includes(item.uniqueId))
        .map((item: any) => item.rfq_id as number)
    ));
    if (!rfqIds.length) return;
    setBulkCustomerLoading(true);
    let successCount = 0;
    try {
      for (const rfqId of rfqIds) {
        try {
          await salesService.updateQuoteRequestBasic(rfqId, {
            company_id: bulkCustomerCompanyId ?? null,
            contact_ids: bulkCustomerContactIds,
          });
          successCount++;
        } catch {
          message.error(`Hiba az RFQ #${rfqId} frissítésekor`);
        }
      }
      if (successCount > 0) {
        message.success(`${successCount} ajánlat frissítve`);
        setBulkCustomerModalOpen(false);
        setBulkSelectedKeys([]);
        loadData();
      }
    } finally {
      setBulkCustomerLoading(false);
    }
  };

  const handleBulkDelete = () => {
    const selectedRows = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    if (!selectedRows.length) return;
    const rfqIds = Array.from(new Set(selectedRows.map((r: any) => r.rfq_id)));
    Modal.confirm({
      title: 'Ajánlatok törlése',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: `Biztosan töröl ${rfqIds.length} kijelölt ajánlatot? Ez a művelet nem visszavonható.`,
      okText: 'Igen, törlöm',
      okButtonProps: { danger: true },
      cancelText: 'Mégse',
      onOk: async () => {
        let successCount = 0;
        for (const rfqId of rfqIds) {
          try {
            await salesService.softDeleteQuoteRequest(rfqId);
            successCount++;
          } catch {
            message.error(`Hiba az ajánlat #${rfqId} törlésekor`);
          }
        }
        if (successCount > 0) {
          message.success(`${successCount} ajánlat törölve`);
          setBulkSelectedKeys([]);
          loadData();
        }
      },
    });
  };

  const executeRfqBulkPrint = async () => {
    setRfqBulkPrintModalOpen(false);
    setRfqBulkPrinting(true);
    const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    const rfqIds = Array.from(new Set(selectedItems.map((item: any) => item.rfq_id as number)));
    try {
      const response = await api.get(
        `/manufacturing/cost-items/bulk_work_sheets_for_rfqs/?rfq_ids=${rfqIds.join(',')}`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      if (rfqBulkPrintMode === 'direct') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          try { iframe.contentWindow?.print(); } catch {}
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(url);
          }, 2000);
        };
      } else {
        window.open(url, '_blank');
      }
      message.success(`${rfqIds.length} ajánlat munkalapjai összefűzve, nyomtatás indul.`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404 || status === 400) {
        let errMsg = 'Egyetlen kijelölt ajánlathoz sem található nyomtatható munkalap.';
        try {
          // blob responseType: need to read blob as text to get error message
          const blob = e?.response?.data;
          if (blob instanceof Blob) {
            const text = await blob.text();
            const parsed = JSON.parse(text);
            if (parsed?.error) errMsg = parsed.error;
          }
        } catch {}
        message.warning(errMsg);
      } else {
        message.error('Hiba a munkalapok letöltése során');
      }
    } finally {
      setRfqBulkPrinting(false);
    }
  };

  const handleRfqBulkPrintWorksheets = () => {
    if (bulkSelectedKeys.length === 0) return;
    setRfqBulkPrintModalOpen(true);
  };

  return (
    <div>

      <Card
        title={<span>Árajánlatok{backgroundLoading && <> <Spin size="small" style={{ marginLeft: 8 }} /><span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>Betöltés…</span></>}</span>}
        extra={
            <Space wrap className="rfqs-toolbar-actions pixi-unified-card-actions">
              {bulkSelectedKeys.length > 0 && (
                <Tooltip title="Összes kijelölés törlése">
                  <Button
                    size="small"
                    type="primary"
                    danger
                    icon={<span style={{ marginRight: 4, fontWeight: 700 }}>✕</span>}
                    onClick={() => setBulkSelectedKeys([])}
                    style={{ fontWeight: 600 }}
                  >
                    {bulkSelectedKeys.length} kijelölve
                  </Button>
                </Tooltip>
              )}
              <Tooltip title={bulkSelectedKeys.length > 0 ? `CSV export (${bulkSelectedKeys.length} kijelölve)` : 'CSV export (jelölj ki tételeket)'}>
                <Button icon={<FileTextOutlined />} onClick={exportCsv} type={bulkSelectedKeys.length > 0 ? 'primary' : 'default'} />
              </Tooltip>
              {/* Desktop: inline filters */}
              {!isMobile && (
                <>
                  <Select
                    className="rfqs-status-select"
                    mode="multiple"
                    placeholder="Státusz szűrő"
                    value={selectExpandedValue}
                    onChange={(values: any) => handleStatusFilterChange(Array.isArray(values) ? values.map(String) : [])}
                    style={{ width: 220 }}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                    tagRender={(props) => {
                      // Ha kombináció aktív, az egyéni státusz tag-eket elnyomjuk —
                      // csak a kombináció-kulcs tag jelenik meg az inputban.
                      if (activeComboKey && props.value !== activeComboKey) return <></>;
                      return (
                        <Tag closable={props.closable} onClose={props.onClose} style={{ marginRight: 2 }}>
                          {props.label}
                        </Tag>
                      );
                    }}
                  >
                    <Select.OptGroup label="Kombinációk (gyorskiválasztás)">
                      <Select.Option value="mind">Mind</Select.Option>
                      <Select.Option value="aktiv">Aktív</Select.Option>
                      <Select.Option value="foglalkozos">Foglalkozós</Select.Option>
                      <Select.Option value="szallitando">Szállítandó</Select.Option>
                      <Select.Option value="szamlazando">Számlázandó</Select.Option>
                    </Select.OptGroup>
                    <Select.OptGroup label="Egyéni">
                      <Select.Option value="new">Új</Select.Option>
                      <Select.Option value="quoted">Kiküldve</Select.Option>
                      <Select.Option value="ordered">Megrendelve</Select.Option>
                      <Select.Option value="confirmed">Megerősítve</Select.Option>
                      <Select.Option value="in_design">Tervezés alatt</Select.Option>
                      <Select.Option value="pending_customer_approval">Ügyfél jóváhagyásra vár</Select.Option>
                      <Select.Option value="pending_internal_approval">Belső jóváhagyásra vár</Select.Option>
                      <Select.Option value="in_production">Gyártásban</Select.Option>
                      <Select.Option value="ready">Kész</Select.Option>
                      <Select.Option value="in_delivery">Szállítás alatt</Select.Option>
                      <Select.Option value="delivered">Kiszállítva</Select.Option>
                      <Select.Option value="invoiced">Kiszámlázva</Select.Option>
                      <Select.Option value="expired">Lejárt</Select.Option>
                      <Select.Option value="archived">Archív</Select.Option>
                      <Select.Option value="rejected">Elutasítva</Select.Option>
                    </Select.OptGroup>
                  </Select>
                  <Select
                    className="rfqs-creator-select"
                    placeholder="Szűrés rögzítőre"
                    allowClear
                    style={{ width: 170 }}
                    value={creatorFilter}
                    onChange={setCreatorFilter}
                  >
                    {creators.map((name: any) => (
                      <Select.Option key={name} value={name}>{name}</Select.Option>
                    ))}
                  </Select>
                  <Select
                    className="rfqs-project-select"
                    placeholder="Szűrés projektre"
                    allowClear
                    showSearch
                    style={{ width: 200 }}
                    value={projectFilter}
                    onChange={(v) => setProjectFilter(v ?? null)}
                    filterOption={(input, option) => {
                      const text = String(option?.label || '');
                      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      return norm(text).includes(norm(input));
                    }}
                    options={(projects || []).map((p: any) => ({ value: p.id, label: p.company_name ? `${p.company_name} – ${p.name}` : p.name }))}
                  />
                </>
              )}
              {/* Mobile: filter button */}
              {isMobile && (
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => setFilterDrawerOpen(true)}
                  type={statusFilter.filter(s => s !== 'mind').length > 0 || creatorFilter || projectFilter ? 'primary' : 'default'}
                >
                  Szűrők{(statusFilter.filter(s => s !== 'mind').length + (creatorFilter ? 1 : 0) + (projectFilter ? 1 : 0)) > 0
                    ? ` (${statusFilter.filter(s => s !== 'mind').length + (creatorFilter ? 1 : 0) + (projectFilter ? 1 : 0)})`
                    : ''}
                </Button>
              )}
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { if (!createOpen) navigate('/sales/rfqs?create=true', { replace: true }); }}>Új</Button>
              {/* Mobile filter drawer */}
              <Drawer
                title="Szűrők"
                placement="bottom"
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                height="auto"
                styles={{ body: { paddingBottom: 24 } }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Select
                    className="rfqs-status-select"
                    mode="multiple"
                    placeholder="Státusz szűrő"
                    value={selectExpandedValue}
                    onChange={(values: any) => handleStatusFilterChange(Array.isArray(values) ? values.map(String) : [])}
                    style={{ width: '100%' }}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                    tagRender={(props) => {
                      if (activeComboKey && props.value !== activeComboKey) return <></>;
                      return (
                        <Tag closable={props.closable} onClose={props.onClose} style={{ marginRight: 2 }}>
                          {props.label}
                        </Tag>
                      );
                    }}
                  >
                    <Select.OptGroup label="Kombinációk (gyorskiválasztás)">
                      <Select.Option value="mind">Mind</Select.Option>
                      <Select.Option value="aktiv">Aktív</Select.Option>
                      <Select.Option value="foglalkozos">Foglalkozós</Select.Option>
                      <Select.Option value="szallitando">Szállítandó</Select.Option>
                      <Select.Option value="szamlazando">Számlázandó</Select.Option>
                    </Select.OptGroup>
                    <Select.OptGroup label="Egyéni">
                      <Select.Option value="new">Új</Select.Option>
                      <Select.Option value="quoted">Kiküldve</Select.Option>
                      <Select.Option value="ordered">Megrendelve</Select.Option>
                      <Select.Option value="confirmed">Megerősítve</Select.Option>
                      <Select.Option value="in_design">Tervezés alatt</Select.Option>
                      <Select.Option value="pending_customer_approval">Ügyfél jóváhagyásra vár</Select.Option>
                      <Select.Option value="pending_internal_approval">Belső jóváhagyásra vár</Select.Option>
                      <Select.Option value="in_production">Gyártásban</Select.Option>
                      <Select.Option value="ready">Kész</Select.Option>
                      <Select.Option value="in_delivery">Szállítás alatt</Select.Option>
                      <Select.Option value="delivered">Kiszállítva</Select.Option>
                      <Select.Option value="invoiced">Kiszámlázva</Select.Option>
                      <Select.Option value="expired">Lejárt</Select.Option>
                      <Select.Option value="archived">Archív</Select.Option>
                      <Select.Option value="rejected">Elutasítva</Select.Option>
                    </Select.OptGroup>
                  </Select>
                  <Select
                    className="rfqs-creator-select"
                    placeholder="Szűrés rögzítőre"
                    allowClear
                    style={{ width: '100%' }}
                    value={creatorFilter}
                    onChange={setCreatorFilter}
                  >
                    {creators.map((name: any) => (
                      <Select.Option key={name} value={name}>{name}</Select.Option>
                    ))}
                  </Select>
                  <Select
                    className="rfqs-project-select"
                    placeholder="Szűrés projektre"
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    value={projectFilter}
                    onChange={(v) => setProjectFilter(v ?? null)}
                    filterOption={(input, option) => {
                      const text = String(option?.label || '');
                      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                      return norm(text).includes(norm(input));
                    }}
                    options={(projects || []).map((p: any) => ({ value: p.id, label: p.company_name ? `${p.company_name} – ${p.name}` : p.name }))}
                  />
                  <Button block onClick={() => { setStatusFilter(['mind']); setCreatorFilter(null); setProjectFilter(null); }}>Szűrők törlése</Button>
                </Space>
              </Drawer>
            </Space>
        }
      >
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        
        {bulkSelectedKeys.length > 0 && (
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 10px', flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0', marginBottom: 2 }}>
            <span style={{ fontSize: 13, color: '#555' }}>{bulkSelectedKeys.length} tétel kijelölve</span>
            {(() => {
              const sel = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
              const totals: Record<string, number> = {};
              sel.forEach((item: any) => {
                const cur = (item.currency_code || 'HUF').toUpperCase();
                const net = Number(item.discounted_net_total || item.net_total || (Number(item.quantity || 0) * Number(item.net_unit_price || item.manufacturing_product_net_unit_price || 0)));
                totals[cur] = (totals[cur] || 0) + net;
              });
              const parts = Object.entries(totals).map(([cur, val]) =>
                `${Math.round(val).toLocaleString('hu-HU')} ${cur}`
              );
              return parts.length > 0 ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1677ff', background: '#e6f4ff', borderRadius: 4, padding: '1px 8px' }}>
                  Σ {parts.join(' | ')}
                </span>
              ) : null;
            })()}
            <Select
              size="small"
              placeholder="Státusz váltás…"
              style={{ minWidth: 150 }}
              loading={bulkStatusChangeLoading}
              value={null}
              onChange={(v: string) => handleBulkChangeStatus(v)}
              dropdownStyle={{ minWidth: 160 }}
            >
              {rfqStatusOptions.map(o => (
                <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
              ))}
            </Select>
            <Tooltip title="Megrendelés létrehozása">
              <Button icon={<ShoppingCartOutlined />} size="small" loading={createOrderLoading} onClick={() => {
                const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
                const rfqIds = Array.from(new Set(selectedItems.map((item: any) => item.rfq_id as number)));
                if (rfqIds.length) handleCreateOrder(rfqIds, false);
              }} style={{ background: '#f9f0ff', borderColor: '#d3adf7', color: '#722ed1' }} />
            </Tooltip>
            <Tooltip title="Gyártásba küldés">
              <Button icon={<RocketOutlined />} size="small" loading={bulkOrderLoading} onClick={handleBulkOrder} style={{ background: '#e6f4ff', borderColor: '#91caff', color: '#1677ff' }} />
            </Tooltip>
            <Tooltip title="Projekthez rendelés">
              <Button icon={<FolderAddOutlined />} size="small" onClick={() => { setBulkProjectId(null); setBulkProjectModalOpen(true); }} style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#d46b08' }} />
            </Tooltip>
            <Tooltip title="Munkalap nyomtatása">
              <Button icon={<PrinterOutlined />} size="small" loading={rfqBulkPrinting} onClick={handleRfqBulkPrintWorksheets} />
            </Tooltip>
            <Tooltip title="Árajánlat kiküldése e-mailben">
              <Button icon={<MailOutlined />} size="small" onClick={handleBulkSendEmail} style={{ background: '#fff0f6', borderColor: '#ffadd2', color: '#c41d7f' }} />
            </Tooltip>
            <Tooltip title="Szállítólevél">
              <Button icon={<CarOutlined />} size="small" loading={bulkDeliveryLoading} onClick={handleBulkDelivery} style={{ background: '#e6f7ff', borderColor: '#91d5ff', color: '#096dd9' }} />
            </Tooltip>
            <Tooltip title="Számla generálása">
              <Button icon={<FileTextOutlined />} size="small" loading={bulkInvoiceLoading} onClick={handleBulkInvoice} style={{ background: '#f6ffed', borderColor: '#b7eb8f', color: '#389e0d' }} />
            </Tooltip>
            <Tooltip title="Átadás (kassza)">
              <Button icon={<DollarOutlined />} size="small" onClick={openHandover} style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#d46b08' }} />
            </Tooltip>
            <Tooltip title="Ügyfél / kapcsolattartó csere">
              <Button icon={<UserSwitchOutlined />} size="small" onClick={openBulkCustomerModal} />
            </Tooltip>
            <Tooltip title="Kijelölt tételek törlése">
              <Button icon={<DeleteOutlined />} size="small" danger onClick={handleBulkDelete} />
            </Tooltip>
          </div>
        )}

        <EnhancedTable key="rfqs-items" tableKey="rfqs-items" searchValue={query} onSearchChange={handleSearchChange} searchPlaceholder="Keresés…" columns={itemsColumns as any} dataSource={flattenedItems} rowKey="uniqueId" pagination={{ pageSize: 10 }} size="small" cardBreakpoint={750} sticky={{ offsetScroll: 0 }} className="rfq-items-table" onRow={(r: any) => {
          return { onDoubleClick: () => window.open(`/sales/rfqs/${r.rfq_number || r.rfq_id}`, '_blank'), style: { cursor: 'pointer' } };
        }}
        rowClassName={(r: any) => { const st = getDisplayStatus(r); return st !== 'new' ? `rfq-row-${st}` : ''; }} rowSelection={{ selectedRowKeys: bulkSelectedKeys, onChange: (keys) => setBulkSelectedKeys(keys), columnWidth: 32 }} expandable={{
          columnWidth: 24,
          rowExpandable: (r: any) => (r.sub_items?.length > 0) || r.item_type === 'manufacturing',
          expandedRowRender: renderExpandedItemRow,
          onExpand: (expanded: boolean, record: any) => {
            if (expanded) markRfqSeen(record);
            // ?light=1 esetén a tétel-csatolmányok nincsenek előtöltve. A teljes RFQ-ból
            // töltjük vissza őket, mert a listanézetben lehet elavult vagy placeholder item id.
            if (expanded && record?.id != null && rfqItemAtts[record.id] === undefined && record?.rfq_pk) {
              salesService.getQuoteRequest(record.rfq_pk)
                .then((full: any) => {
                  const allItems = Array.isArray(full?.items) ? full.items : [];
                  const matchedItem = allItems.find((item: any) => item?.id === record.id) || allItems[0] || null;
                  const list = Array.isArray(matchedItem?.attachments) ? matchedItem.attachments : [];
                  setRfqItemAtts(prev => ({ ...prev, [record.id]: list }));
                })
                .catch(() => {
                  setRfqItemAtts(prev => ({ ...prev, [record.id]: [] }));
                });
            }
          },
        }} />
      </Card>
      <Modal 
        title={(() => {
            const rec = sendOpenId == null ? null : findRfqByRef((rfqs || []) as any[], sendOpenId);
            const contactNames = (rec?.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
            const recLabel = rec ? `${rec.request_number || rec.number || ''} (${rec.company?.name || ''}${contactNames ? ' - ' + contactNames : ''})` : '';
            const rfqProgress = sendRfqList.length > 1 ? ` [${sendRfqIndex + 1}/${sendRfqList.length}]` : '';
            return `Ajánlat kérő kiküldése${rfqProgress}: ${recLabel}`;
        })()}
        open={!!sendOpenId} 
        width={800}
        onCancel={() => { setSendOpenId(null); setSendRfqList([]); setSendRfqIndex(0); setBulkSelectedKeys([]); sendFormCacheRef.current = {}; }}
        footer={[
             <Button key="preview" onClick={async () => {
                const v = await sendForm.getFieldsValue();
                if (!sendOpenId) return;
                try {
                  const p = await salesService.renderQuoteRequestEmail(sendOpenId, { 
                      template_key: v.template_key, 
                      signature_key: v.signature_key, 
                      context: v.context, 
                      ...(v.subject ? { subject: v.subject } : {}), 
                      ...(v.body ? { body: v.body } : {}),
                      additional_rfq_ids: currentSendAdditionalRfqIdsRef.current,
                      item_ids: currentSendItemIdsRef.current,
                  });
                  setSendPreview(p);
                } catch {
                  message.error('Előnézet nem elérhető');
                }
             }}>Előnézet</Button>,
             <Button key="cancel" onClick={() => { setSendOpenId(null); setSendRfqList([]); setSendRfqIndex(0); sendFormCacheRef.current = {}; }}>Mégse</Button>,
             <Button key="send" type="primary" icon={<SendOutlined />}
               disabled={!!sendRfqList[sendRfqIndex]?.sent}
               onClick={async () => {
                const v = await sendForm.validateFields();
                if (!sendOpenId) return;
                try {
                  await salesService.sendQuoteRequestEmail(sendOpenId, {
                    ...v,
                    additional_rfq_ids: sendRfqList[sendRfqIndex]?.additionalRfqIds || [],
                    item_ids: sendRfqList[sendRfqIndex]?.itemIds || [],
                  });
                  const updated = sendRfqList.map((item, i) => i === sendRfqIndex ? { ...item, sent: true } : item);
                  setSendRfqList(updated);
                  message.success('E-mail elküldve');
                  loadData();
                  const nextAfter = updated.findIndex((item, i) => i > sendRfqIndex && !item.sent);
                  const anyUnsent = updated.findIndex(item => !item.sent);
                  if (nextAfter !== -1) {
                    setSendRfqIndex(nextAfter);
                    openSendModal(updated[nextAfter].rfqId, updated[nextAfter].additionalRfqIds, updated[nextAfter].itemIds);
                  } else if (anyUnsent !== -1) {
                    setSendRfqIndex(anyUnsent);
                    openSendModal(updated[anyUnsent].rfqId, updated[anyUnsent].additionalRfqIds, updated[anyUnsent].itemIds);
                  } else {
                    setSendOpenId(null);
                    setSendRfqList([]);
                    setSendRfqIndex(0);
                    setBulkSelectedKeys([]);
                  }
                } catch {
                  message.error('Nem sikerült elküldeni az e-mailt');
                }
             }}>{sendRfqList[sendRfqIndex]?.sent ? 'Kiküldve ✓' : sendRfqList.length > 1 ? `Küldés (${sendRfqList.length} ügyfél)` : 'Küldés'}</Button>
        ]}
      >
        <Form layout="vertical" form={sendForm} initialValues={{ template_key: 'rfq_send' }} onValuesChange={async (changedValues, allValues) => {
        if (changedValues.template_key || changedValues.signature_key || changedValues.subject !== undefined || changedValues.body !== undefined) {
             if (!sendOpenId) return;
             try {
               const p = await salesService.renderQuoteRequestEmail(sendOpenId, { 
                 template_key: allValues.template_key, 
                 signature_key: allValues.signature_key, 
                 context: allValues.context, 
                 ...(allValues.subject ? { subject: allValues.subject } : {}), 
                 ...(allValues.body ? { body: allValues.body } : {}),
                 additional_rfq_ids: currentSendAdditionalRfqIdsRef.current,
                 item_ids: currentSendItemIdsRef.current,
               }); 
               setSendPreview(p); 
             } catch {}
        }
      }}>
          {sendRfqList.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
              <Button size="small" icon={<LeftOutlined />} disabled={sendRfqIndex === 0}
                onClick={() => { sendFormCacheRef.current[String(sendRfqList[sendRfqIndex].rfqId)] = sendForm.getFieldsValue(); const ni = sendRfqIndex - 1; setSendRfqIndex(ni); openSendModal(sendRfqList[ni].rfqId, sendRfqList[ni].additionalRfqIds, sendRfqList[ni].itemIds); }}
              />
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 36, textAlign: 'center' }}>{sendRfqIndex + 1} / {sendRfqList.length}</span>
              <Button size="small" icon={<RightOutlined />} disabled={sendRfqIndex === sendRfqList.length - 1}
                onClick={() => { sendFormCacheRef.current[String(sendRfqList[sendRfqIndex].rfqId)] = sendForm.getFieldsValue(); const ni = sendRfqIndex + 1; setSendRfqIndex(ni); openSendModal(sendRfqList[ni].rfqId, sendRfqList[ni].additionalRfqIds, sendRfqList[ni].itemIds); }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sendRfqList.map((item, i) => {
                  const rec = findRfqByRef((rfqs || []) as any[], item.rfqId);
                  return (
                    <Tag key={item.rfqId}
                      color={item.sent ? 'success' : i === sendRfqIndex ? 'processing' : 'default'}
                      style={{ cursor: 'pointer', margin: 0 }}
                      onClick={() => { sendFormCacheRef.current[String(sendRfqList[sendRfqIndex].rfqId)] = sendForm.getFieldsValue(); setSendRfqIndex(i); openSendModal(item.rfqId, item.additionalRfqIds, item.itemIds); }}
                    >
                      {rec?.company?.name || rec?.number || item.rfqId}{item.sent ? ' ✓' : ''}
                    </Tag>
                  );
                })}
              </div>
            </div>
          )}
          <Form.Item label="Címzettek" name="to" rules={[{ required: true, message: 'Add meg a címzetteket' }]}>
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>
          <Form.Item label="Másolat (CC)" name="cc">
            <Input placeholder="cc@example.com" />
          </Form.Item>
          <Form.Item label="Válaszcím (Reply-To)" name="reply_to">
            <Input placeholder="reply@example.com" />
          </Form.Item>
          
          <div style={{ display: 'flex', gap: 16 }}>
             <Form.Item label="Email sablon" name="template_key" rules={[{ required: true, message: 'Válassz sablont' }]} style={{ flex: 1 }}>
                <Select 
                  placeholder="Válassz email sablont" 
                  showSearch 
                  optionFilterProp="label"
                  onChange={async (templateKey: string) => {
                    // Load and set subject, body, cc and reply_to from template
                    const template = emailTemplates.find((t: any) => t.key === templateKey);
                    if (template) {
                      // Get current RFQ data to build context
                      const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
                      if (rec) {
                        let subject = template.subject_template || '';
                        let body = template.body_template || '';
                        const cc = template.default_cc || '';
                        const replyTo = template.default_reply_to || '';
                        
                        // Build contact names
                        const contactNames = (rec.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                        
                        // Replace variables in subject
                        subject = subject.replace(/{rfq_number}/g, rec.number || rec.request_number || '');
                        subject = subject.replace(/{rfq_title}/g, rec.title || '');
                        subject = subject.replace(/{company_name}/g, rec.company?.name || '');
                        subject = subject.replace(/{contact_names}/g, contactNames);
                        
                        // Replace variables in body
                        body = body.replace(/{rfq_number}/g, rec.number || rec.request_number || '');
                        body = body.replace(/{rfq_title}/g, rec.title || '');
                        body = body.replace(/{company_name}/g, rec.company?.name || '');
                        body = body.replace(/{contact_names}/g, contactNames);
                        body = body.replace(/{public_order_url}/g, buildCombinedPublicUrl(rec));
                        
                        // Append current signature if exists
                        const sigKey = sendForm.getFieldValue('signature_key');
                        if (sigKey) {
                            const signature = signatures.find((s: any) => s.key === sigKey);
                            if (signature && signature.body_html) {
                                let sigBody = signature.body_html;
                                // Substitute user variables in signature
                                const uName = user?.last_name && user?.first_name ? `${user.last_name} ${user.first_name}` : (user?.username || user?.name || '');
                                sigBody = sigBody.replace(/{user_name}/g, uName);
                                sigBody = sigBody.replace(/{user_email}/g, user?.email || '');
                                sigBody = sigBody.replace(/{user_phonenumber}/g, user?.employee_profile?.phone || user?.phone || '');
                                sigBody = sigBody.replace(/{user_position}/g, user?.employee_profile?.position?.title || user?.position || '');
                                
                                body = body + (template.is_html ? '' : '\n\n') + sigBody;
                            }
                        }
                        
                        sendForm.setFieldsValue({ subject, body, cc, reply_to: replyTo });
                      }
                    }
                  }}
                >
                  {emailTemplates.map((tpl: any) => (
                    <Select.Option key={tpl.key} value={tpl.key} label={tpl.name}>
                      {tpl.name} ({tpl.key})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="Aláírás" name="signature_key" style={{ flex: 1 }}>
                <Select 
                  placeholder="Válassz aláírást" 
                  allowClear 
                  showSearch 
                  optionFilterProp="label"
                  onChange={(sigKey: string) => {
                    // Update body with new signature
                    const currentBody = sendForm.getFieldValue('body') || '';
                    const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
                    if (!rec) return;
                    
                    // Remove old signature from body (everything after last occurrence of signature delimiter)
                    let bodyWithoutSig = currentBody;
                    const template = emailTemplates.find((t: any) => t.key === sendForm.getFieldValue('template_key'));
                    if (template && template.body_template) {
                      // Try to find where template body ends
                      const contactNames = (rec.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                      let templateBody = template.body_template || '';
                      templateBody = templateBody.replace('{rfq_number}', rec.number || rec.request_number || '');
                      templateBody = templateBody.replace('{rfq_title}', rec.title || '');
                      templateBody = templateBody.replace('{company_name}', rec.company?.name || '');
                      templateBody = templateBody.replace('{contact_names}', contactNames);
                      templateBody = templateBody.replace('{public_order_url}', buildCombinedPublicUrl(rec));
                      bodyWithoutSig = templateBody;
                    }
                    
                    // Add new signature
                    let newBody = bodyWithoutSig;
                    if (sigKey) {
                      const signature = signatures.find((s: any) => s.key === sigKey);
                      if (signature && signature.body_html) {
                        let sigBody = signature.body_html;
                        // Substitute user variables in signature
                        const uName = user?.last_name && user?.first_name ? `${user.last_name} ${user.first_name}` : (user?.username || user?.name || '');
                        sigBody = sigBody.replace(/{user_name}/g, uName);
                        sigBody = sigBody.replace(/{user_email}/g, user?.email || '');
                        sigBody = sigBody.replace(/{user_phonenumber}/g, user?.employee_profile?.phone || user?.phone || '');
                        sigBody = sigBody.replace(/{user_position}/g, user?.employee_profile?.position?.title || user?.position || '');

                        newBody = bodyWithoutSig + (template?.is_html ? '' : '\n\n') + sigBody;
                      }
                    }
                    
                    sendForm.setFieldsValue({ body: newBody });
                  }}
                >
                  {signatures.map((sig: any) => (
                    <Select.Option key={sig.key} value={sig.key} label={sig.name}>
                      {sig.name} ({sig.key})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
          </div>

          <Form.Item label="Tárgy" name="subject">
            <Input placeholder="E-mail tárgya" />
          </Form.Item>
          <Form.Item label="Törzs" name="body">
            <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50 }} />
          </Form.Item>
          {(() => {
            const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
            const url = rec ? buildCombinedPublicUrl(rec) : null;
            return url ? (
              <div style={{ marginTop: 8, padding: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 4 }}>
                Megrendelő link: <a href={url} target="_blank" rel="noreferrer">{url}</a>
              </div>
            ) : null;
          })()}
        </Form>
        {sendPreview && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <Divider>Előnézet</Divider>
            <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 4 }}>
                <div style={{marginBottom: 8}}><b>Tárgy:</b> {sendPreview.subject}</div>
                <div className="email-preview-content">
                    {sendPreview.is_html ? (
                        <div dangerouslySetInnerHTML={{ __html: (sendPreview.body || '').replace(/<a /gi, '<a target="_blank" ') }} />
                    ) : (
                        <pre style={{whiteSpace: 'pre-wrap'}}>{sendPreview.body}</pre>
                    )}
                </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="Összes tétel megrendelése"
        open={orderAllOpenId !== null}
        onCancel={() => { setOrderAllOpenId(null); setOrderAllDeadline(null); }}
        onOk={async () => {
          if (!orderAllOpenId) return;
          try {
            setOrderAllLoading(true);
            const res = await salesService.orderAllFromRfq(
              orderAllOpenId,
              orderAllDeadline ? orderAllDeadline.format('YYYY-MM-DD') : undefined
            );
            message.success(`Megrendelés létrehozva: ${res.order_number}`);
            setOrderAllOpenId(null);
            setOrderAllDeadline(null);
            loadData();
            setTimeout(() => navigate('/sales/customer-orders'), 1000);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Hiba a megrendelés létrehozásakor');
          } finally { setOrderAllLoading(false); }
        }}
        okText="Megrendelés"
        okButtonProps={{ loading: orderAllLoading }}
        cancelText="Mégse"
      >
        <div style={{ marginBottom: 8 }}>
          <span style={{ marginRight: 8 }}>Szállítási határidő (nem kötelező):</span>
          <DatePicker
            value={orderAllDeadline}
            onChange={(d) => setOrderAllDeadline(d)}
            placeholder="Válassz dátumot"
            style={{ width: 200 }}
            allowClear
          />
        </div>
        <p>Az árajánlat összes tételét megrendeli. Folytatja?</p>
      </Modal>

      <Modal
        title="Részleges megrendelés"
        open={partialOrderOpenId !== null}
        onCancel={() => { setPartialOrderOpenId(null); setPartialSelection([]); setPartialDeadline(null); }}
        onOk={async () => {
          if (!partialOrderOpenId) return;
          try {
            setPartialLoading(true);
            const res = await salesService.orderPartialFromRfq(
              partialOrderOpenId,
              partialSelection,
              partialDeadline ? partialDeadline.format('YYYY-MM-DD') : undefined
            );
            message.success(`Megrendelés létrehozva: ${res.order_number}`);
            setPartialOrderOpenId(null);
            setPartialSelection([]);
            setPartialDeadline(null);
            loadData();
            // Navigálás a megrendelésekhez
            setTimeout(() => navigate('/sales/customer-orders'), 1000);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Hiba a részleges megrendelésnél');
          } finally { setPartialLoading(false); }
        }}
        okButtonProps={{ loading: partialLoading, disabled: !partialSelection.length }}
      >
        {(() => {
          const rec = (filtered || rfqs || []).find(r => r.id === partialOrderOpenId);
          const items = rec?.items || [];
          return (
            <>
              <div style={{ marginBottom: 12 }}>
                <span style={{ marginRight: 8 }}>Szállítási határidő (nem kötelező):</span>
                <DatePicker
                  value={partialDeadline}
                  onChange={(d) => setPartialDeadline(d)}
                  placeholder="Válassz dátumot"
                  style={{ width: 180 }}
                  allowClear
                />
              </div>
              <List
                dataSource={items}
                renderItem={(it: any) => (
                  <List.Item>
                    <Checkbox
                      checked={partialSelection.includes(it.id)}
                      disabled={!!it.is_ordered}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPartialSelection((prev) => checked ? [...prev, it.id] : prev.filter(id => id !== it.id));
                      }}
                    >
                      <span style={{ color: it.is_ordered ? '#aaa' : undefined }}>
                        {(it.product_name || it.manufacturing_product_name || it.service_name || it.description || '-')}
                        {' '}— {Number(it.quantity)} {it.unit || ''} × {Number(it.net_unit_price).toLocaleString('hu-HU')} Ft
                      </span>
                      {it.is_ordered && <Tag style={{ marginLeft: 8 }} color="purple">Megrendelve</Tag>}
                    </Checkbox>
                  </List.Item>
                )}
              />
            </>
          );
        })()}
      </Modal>

      <Modal
        title="Új árajánlat"
        open={createOpen}
        onOk={handleCreate}
        onCancel={handleCancel}
        okText={newItems.length > 1 ? `Létrehozás (${newItems.length} ajánlat)` : 'Létrehozás'}
        cancelText="Mégse"
        okButtonProps={{ loading: creating }}
        closable={!creating}
        maskClosable={false}
        width={isMobile ? '100vw' : 1100}
        wrapClassName={isMobile ? 'pixi-fullscreen-wrap' : undefined}
        style={isMobile ? { margin: 0, padding: 0 } : {}}
        styles={isMobile ? { body: { padding: '8px 12px 0' }, footer: { padding: '8px 12px' } } : {}}
        forceRender
      >
        <Form layout="vertical" form={form} size="small" initialValues={{ issue_date: dayjs() }} onValuesChange={() => { if (createOpen) saveDraft(); }}>
          {/* ── Alap adatok ─────────────────────────────────────────────── */}
          <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={6}>
                <Form.Item label="Rögzítette" style={{ marginBottom: 6 }}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    value={currentUserName || undefined}
                    onChange={(val) => setCurrentUserName(val)}
                    placeholder="Válassz felhasználót"
                  >
                    {allUsers.map((u) => (
                      <Select.Option key={u.id} value={u.name} label={u.name}>{u.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Keltezés" name="issue_date" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} onChange={onIssueDateChange} />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Határidő" name="deadline" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item
                  label="Érvény. (nap)"
                  style={{ marginBottom: 6 }}
                  help={
                    <span style={{ fontSize: 11, color: '#888' }}>
                      Lejár: {dayjs(watchedIssueDate || dayjs()).add(validityDays, 'day').format('YYYY.MM.DD.')}
                    </span>
                  }
                >
                  <InputNumber
                    min={1}
                    value={validityDays}
                    onChange={(v) => setValidityDays(v ?? 30)}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>
          {/* ── Ügyfél ──────────────────────────────────────────────────── */}
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
          {isMobile ? (
            <div style={{ paddingBottom: 8 }}>
              {(() => {
                const companyName = watchedCompanyId === 'private'
                  ? 'Magánszemély'
                  : (companies.find((c: any) => c.id === watchedCompanyId)?.name || '');
                const contactNames = Array.isArray(watchedContactIds)
                  ? watchedContactIds.map((id: any) => {
                      const c = contacts.find((c: any) => c.id === id || String(c.id) === String(id));
                      return c?.full_name || c?.name || String(id);
                    })
                  : [];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      onClick={() => setClientCompanyModalOpen(true)}
                      style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: '1px solid #b7eb8f', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#389e0d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Cég</div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: companyName ? '#000' : '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {companyName || 'Nincs kiválasztva'}
                        </div>
                      </div>
                      <span style={{ color: '#b7eb8f', fontSize: 18 }}>›</span>
                    </div>
                    <div
                      onClick={() => setClientContactModalOpen(true)}
                      style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: '1px solid #b7eb8f', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#389e0d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Kapcsolattartók</div>
                        <div style={{ fontSize: 14, color: contactNames.length ? '#000' : '#aaa', wordBreak: 'break-word' }}>
                          {contactNames.length ? contactNames.join(', ') : 'Nincs kiválasztva'}
                        </div>
                      </div>
                      <span style={{ color: '#b7eb8f', fontSize: 18, flexShrink: 0 }}>›</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
          <Row gutter={[8, 4]}>
            <Col xs={24} md={6}>
              <Form.Item 
                label="Cég" 
                style={{ marginBottom: 6 }}
              > 
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="company_id" noStyle>
                  <Select 
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz céget vagy magánszemélyt" 
                    style={{ width: 'calc(100% - 32px)' }}
                    labelRender={(opt) => {
                      const lvl = overdueCompanyMap[String(opt.value)];
                      if (lvl === 'post_reminder_1') return <span style={{ background: '#1a1a1a', color: '#e53935', padding: '1px 4px', borderRadius: 2 }}>{opt.label}</span>;
                      if (lvl === 'overdue_10') return <span style={{ color: '#e53935' }}>{opt.label}</span>;
                      return <span>{opt.label}</span>;
                    }}
                    onFocus={async () => {
                      // Frissítjük a cégek listáját amikor rákattintanak.
                      // Top 10 saját cég + többi
                      try {
                        const [list, topList] = await Promise.all([
                          crmService.getCompanies({ is_customer: true, compact: true }),
                          salesService.getTopCompanies().catch(() => [])
                        ]);
                        
                        const all: any[] = list.results ?? list;
                        const top: any[] = Array.isArray(topList) ? topList : [];

                        const normalize = (value: any) => (value ?? '').toString().trim().toLowerCase();
                        const normalizeTax = (value: any) => (value ?? '').toString().replace(/\D+/g, '').slice(0, 8);
                        const companyKey = (c: any) => {
                          const tax = normalizeTax(c?.tax_number || c?.full_tax_number || c?.taxNumber || c?.fullTaxNumber);
                          const name = normalize(c?.name || c?.full_name);
                          return `${tax}|${name}`;
                        };

                        const allByKey = new Map<string, any>();
                        for (const company of all) {
                          allByKey.set(companyKey(company), company);
                        }

                        const ordered: any[] = [];
                        const seenKeys = new Set<string>();

                        for (const topCompany of top) {
                          const key = companyKey(topCompany);
                          const canonical = allByKey.get(key) || topCompany;
                          const dedupeKey = companyKey(canonical) || `id:${canonical?.id}`;
                          if (seenKeys.has(dedupeKey)) continue;
                          seenKeys.add(dedupeKey);
                          ordered.push(canonical);
                        }

                        for (const company of all) {
                          const dedupeKey = companyKey(company) || `id:${company?.id}`;
                          if (seenKeys.has(dedupeKey)) continue;
                          seenKeys.add(dedupeKey);
                          ordered.push(company);
                        }

                        setCompanies(ordered);
                      } catch (err) {
                        console.error(err);
                        const list = await crmService.getCompanies({ is_customer: true, compact: true });
                        setCompanies(list.results ?? list);
                      }
                    }}
                    onChange={async (val) => {
                      form.setFieldsValue({ company_id: val ?? null });
                      if (!val) {
                        // Törölt ügyfél → összes kapcsolattartó, névnél cég is látszódjon
                        const list = await crmService.getContacts();
                        setContacts((list.results ?? list) || []);
                        form.setFieldsValue({ contact_ids: [] });
                      } else if (val === 'private') {
                        // Magánszemélyek lekérdezése
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      } else {
                        // Céghez tartozó kapcsolattartók lekérdezése
                        const list = await crmService.getContactsByCompany(val);
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      }
                    }}
                  >
                    <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                    {companies.map((c: any) => {
                      const lvl = overdueCompanyMap[String(c.id)];
                      const style = lvl === 'post_reminder_1' ? { background: '#1a1a1a', color: '#e53935', padding: '1px 4px' } : lvl === 'overdue_10' ? { color: '#e53935' } : {};
                      return <Select.Option key={c.id} value={c.id} label={c.name}><span style={style}>{c.name}</span></Select.Option>;
                    })}
                  </Select>
                  </Form.Item>
                  <Tooltip title="Új cég hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        const popup = window.open('/crm/companies?action=create', '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                const [list, topList] = await Promise.all([
                                  crmService.getCompanies({ is_customer: true, compact: true }),
                                  salesService.getTopCompanies().catch(() => [])
                                ]);
                                const all: any[] = list.results ?? list;
                                const top: any[] = Array.isArray(topList) ? topList : [];
                                const normalize = (value: any) => (value ?? '').toString().trim().toLowerCase();
                                const normalizeTax = (value: any) => (value ?? '').toString().replace(/\D+/g, '').slice(0, 8);
                                const companyKey = (c: any) => {
                                  const tax = normalizeTax(c?.tax_number || c?.full_tax_number || c?.taxNumber || c?.fullTaxNumber);
                                  const name = normalize(c?.name || c?.full_name);
                                  return `${tax}|${name}`;
                                };
                                const allByKey = new Map<string, any>();
                                for (const company of all) allByKey.set(companyKey(company), company);
                                const ordered: any[] = [];
                                const seenKeys = new Set<string>();
                                for (const topCompany of top) {
                                  const key = companyKey(topCompany);
                                  const canonical = allByKey.get(key) || topCompany;
                                  const dedupeKey = companyKey(canonical) || `id:${canonical?.id}`;
                                  if (seenKeys.has(dedupeKey)) continue;
                                  seenKeys.add(dedupeKey);
                                  ordered.push(canonical);
                                }
                                for (const company of all) {
                                  const dedupeKey = companyKey(company) || `id:${company?.id}`;
                                  if (seenKeys.has(dedupeKey)) continue;
                                  seenKeys.add(dedupeKey);
                                  ordered.push(company);
                                }
                                setCompanies(ordered);
                                message.success('Cégek listája frissítve');
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }, 500);
                        }
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={24} md={18}>
              <Form.Item label="Kapcsolattartók" style={{ marginBottom: 6 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="contact_ids" noStyle>
                  <Select 
                    mode="multiple" 
                    labelInValue
                    allowClear 
                    showSearch 
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 190px)' }}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 200, maxWidth: 'calc(100vw - 32px)' } } }}
                    onFocus={async () => {
                      // Frissítjük a kapcsolattartók listáját amikor rákattintanak
                      const companyId = form.getFieldValue('company_id');
                      if (companyId === 'private') {
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                      } else if (companyId) {
                        const list = await crmService.getContactsByCompany(companyId);
                        setContacts(list.results ?? list);
                      } else {
                        // Nincs cég választva → összes kapcsolattartó
                        const list = await crmService.getContacts();
                        setContacts((list.results ?? list) || []);
                      }
                    }}
                    onChange={async (val: any) => {
                      console.log('[RFQs] Contacts changed to:', val);
                      form.setFieldsValue({ contact_ids: val });
                      const companyId = form.getFieldValue('company_id');
                      if (!companyId && Array.isArray(val) && val.length > 0) {
                        const lastId = val[val.length - 1];
                        const chosen = contacts.find((c: any) => c.id === lastId || String(c.id) === String(lastId));
                        const chosenCompanyId = chosen?.customer || chosen?.customer_id || chosen?.company || chosen?.company_id;
                        if (chosenCompanyId) {
                          form.setFieldsValue({ company_id: chosenCompanyId });
                          const cl = await crmService.getContactsByCompany(chosenCompanyId);
                          const loaded: any[] = (cl.results ?? cl) || [];
                          const merged = [...loaded];
                          (val as any[]).forEach((selId: any) => {
                            if (!merged.find((c: any) => c.id === selId || String(c.id) === String(selId))) {
                              const ex = contacts.find((c: any) => c.id === selId || String(c.id) === String(selId));
                              if (ex) merged.push(ex);
                            }
                          });
                          setContacts(merged);
                          const chosenCompanyName = chosen?.customer_name || chosen?.company_name;
                          if (chosenCompanyName) {
                            setCompanies((prev: any[]) => {
                              if (prev.find((c: any) => String(c.id) === String(chosenCompanyId))) return prev;
                              return [{ id: chosenCompanyId, name: chosenCompanyName }, ...prev];
                            });
                          }
                        }
                      }
                    }}
                  >
                    {contacts.map((p: any) => {
                      const companyId = form.getFieldValue('company_id');
                      const baseName = p.full_name || p.name || '';
                      const companyName = p.customer_name || p.company_name || '';
                      const lbl = (!companyId && companyName) ? `${baseName} \u2014 ${companyName}` : baseName;
                      return (
                        <Select.Option key={p.id} value={p.id} label={lbl}>{lbl}</Select.Option>
                      );
                    })}
                  </Select>
                  </Form.Item>
                  <Tooltip title="Új kapcsolattartó hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        const companyId = form.getFieldValue('company_id');
                        let url = '/crm/contacts?action=create';
                        if (companyId && companyId !== 'private') {
                          url += `&company=${companyId}`;
                          const company = companies.find((c: any) => c.id === companyId);
                          if (company?.name) {
                            url += `&company_name=${encodeURIComponent(company.name)}`;
                          }
                        }
                        const popup = window.open(url, '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                if (companyId === 'private') {
                                  const list = await crmService.getPrivateContacts();
                                  setContacts(list.results ?? list);
                                } else if (companyId) {
                                  const list = await crmService.getContactsByCompany(companyId);
                                  setContacts(list.results ?? list);
                                } else {
                                  const list = await crmService.getContacts();
                                  setContacts((list.results ?? list) || []);
                                }
                                message.success('Kapcsolattartók listája frissítve');
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }, 500);
                        }
                      }}
                    />
                  </Tooltip>
                  <Button 
                    type="default"
                    htmlType="button"
                    onClick={async () => {
                      const companyId = form.getFieldValue('company_id');
                      if (companyId) {
                        if (companyId === 'private') {
                          const list = await crmService.getPrivateContacts();
                          setContacts(list.results ?? list);
                          message.success('Magánszemély kapcsolattartók frissítve');
                        } else {
                          const list = await crmService.getContactsByCompany(companyId);
                          setContacts(list.results ?? list);
                          message.success('Kapcsolattartók frissítve');
                        }
                      } else {
                        message.warning('Először válassz céget');
                      }
                    }}
                  >
                    Frissítés
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          )}
          {/* Cég kiválasztó sub-modal (csak mobilon) */}
          {isMobile && (
            <Modal
              title="Cég kiválasztása"
              open={clientCompanyModalOpen}
              onOk={() => setClientCompanyModalOpen(false)}
              onCancel={() => setClientCompanyModalOpen(false)}
              okText="Kész"
              cancelButtonProps={{ style: { display: 'none' } }}
              forceRender
              width="100vw"
              wrapClassName="pixi-fullscreen-wrap"
              style={{ margin: 0, padding: 0 }}
              styles={{ body: { padding: '16px 12px' }, footer: { padding: '8px 12px' } }}
            >
              <Form.Item label="Cég" style={{ marginBottom: 12 }}> 
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="company_id" noStyle>
                  <Select 
                    showSearch 
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz céget vagy magánszemélyt" 
                    style={{ width: 'calc(100% - 32px)' }}
                    labelRender={(opt) => {
                      const lvl = overdueCompanyMap[String(opt.value)];
                      if (lvl === 'post_reminder_1') return <span style={{ background: '#1a1a1a', color: '#e53935', padding: '1px 4px', borderRadius: 2 }}>{opt.label}</span>;
                      if (lvl === 'overdue_10') return <span style={{ color: '#e53935' }}>{opt.label}</span>;
                      return <span>{opt.label}</span>;
                    }}
                    onFocus={async () => {
                      try {
                        const [list, topList, flagsRaw] = await Promise.all([
                          crmService.getCompanies({ is_customer: true, compact: true }),
                          salesService.getTopCompanies().catch(() => []),
                          crmService.getOverdueCustomerFlags().catch(() => []),
                        ]);
                        const _fArr2 = Array.isArray(flagsRaw) ? flagsRaw : (flagsRaw as any)?.results || [];
                        const _fMap2: Record<string, string> = {};
                        _fArr2.forEach((f: any) => { if (f?.customer_id) _fMap2[String(f.customer_id)] = f.level; });
                        setOverdueCompanyMap(_fMap2);
                        const all: any[] = list.results ?? list;
                        const top: any[] = Array.isArray(topList) ? topList : [];
                        const normalize = (value: any) => (value ?? '').toString().trim().toLowerCase();
                        const normalizeTax = (value: any) => (value ?? '').toString().replace(/\D+/g, '').slice(0, 8);
                        const companyKey = (c: any) => {
                          const tax = normalizeTax(c?.tax_number || c?.full_tax_number || c?.taxNumber || c?.fullTaxNumber);
                          const name = normalize(c?.name || c?.full_name);
                          return `${tax}|${name}`;
                        };
                        const allByKey = new Map<string, any>();
                        for (const company of all) allByKey.set(companyKey(company), company);
                        const ordered: any[] = [];
                        const seenKeys = new Set<string>();
                        for (const topCompany of top) {
                          const key = companyKey(topCompany);
                          const canonical = allByKey.get(key) || topCompany;
                          const dedupeKey = companyKey(canonical) || `id:${canonical?.id}`;
                          if (seenKeys.has(dedupeKey)) continue;
                          seenKeys.add(dedupeKey);
                          ordered.push(canonical);
                        }
                        for (const company of all) {
                          const dedupeKey = companyKey(company) || `id:${company?.id}`;
                          if (seenKeys.has(dedupeKey)) continue;
                          seenKeys.add(dedupeKey);
                          ordered.push(company);
                        }
                        setCompanies(ordered);
                      } catch (err) {
                        console.error(err);
                        const list = await crmService.getCompanies({ is_customer: true, compact: true });
                        setCompanies(list.results ?? list);
                      }
                    }}
                    onChange={async (val) => {
                      form.setFieldsValue({ company_id: val ?? null });
                      if (!val) {
                        // Törölt ügyfél → összes kapcsolattartó, névnél cég is látszódjon
                        const list = await crmService.getContacts();
                        setContacts((list.results ?? list) || []);
                        form.setFieldsValue({ contact_ids: [] });
                      } else if (val === 'private') {
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      } else {
                        const list = await crmService.getContactsByCompany(val);
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      }
                      if (val) setClientCompanyModalOpen(false);
                    }}
                  >
                    <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                    {companies.map((c: any) => {
                      const lvl = overdueCompanyMap[String(c.id)];
                      const style = lvl === 'post_reminder_1' ? { background: '#1a1a1a', color: '#e53935', padding: '1px 4px' } : lvl === 'overdue_10' ? { color: '#e53935' } : {};
                      return <Select.Option key={c.id} value={c.id} label={c.name}><span style={style}>{c.name}</span></Select.Option>;
                    })}
                  </Select>
                  </Form.Item>
                  <Tooltip title="Új cég hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        const popup = window.open('/crm/companies?action=create', '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                const [list, topList] = await Promise.all([
                                  crmService.getCompanies({ is_customer: true, compact: true }),
                                  salesService.getTopCompanies().catch(() => [])
                                ]);
                                const all: any[] = list.results ?? list;
                                const top: any[] = Array.isArray(topList) ? topList : [];
                                const normalize = (value: any) => (value ?? '').toString().trim().toLowerCase();
                                const normalizeTax = (value: any) => (value ?? '').toString().replace(/\D+/g, '').slice(0, 8);
                                const companyKey = (c: any) => {
                                  const tax = normalizeTax(c?.tax_number || c?.full_tax_number || c?.taxNumber || c?.fullTaxNumber);
                                  const name = normalize(c?.name || c?.full_name);
                                  return `${tax}|${name}`;
                                };
                                const allByKey = new Map<string, any>();
                                for (const company of all) allByKey.set(companyKey(company), company);
                                const ordered: any[] = [];
                                const seenKeys = new Set<string>();
                                for (const topCompany of top) {
                                  const key = companyKey(topCompany);
                                  const canonical = allByKey.get(key) || topCompany;
                                  const dedupeKey = companyKey(canonical) || `id:${canonical?.id}`;
                                  if (seenKeys.has(dedupeKey)) continue;
                                  seenKeys.add(dedupeKey);
                                  ordered.push(canonical);
                                }
                                for (const company of all) {
                                  const dedupeKey = companyKey(company) || `id:${company?.id}`;
                                  if (seenKeys.has(dedupeKey)) continue;
                                  seenKeys.add(dedupeKey);
                                  ordered.push(company);
                                }
                                setCompanies(ordered);
                                message.success('Cégek listája frissítve');
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }, 500);
                        }
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
              </Form.Item>
            </Modal>
          )}
          {/* Kapcsolattartók kiválasztó sub-modal (csak mobilon) */}
          {isMobile && (
            <Modal
              title="Kapcsolattartók kiválasztása"
              open={clientContactModalOpen}
              onOk={() => setClientContactModalOpen(false)}
              onCancel={() => setClientContactModalOpen(false)}
              okText="Kész"
              cancelButtonProps={{ style: { display: 'none' } }}
              forceRender
              width="100vw"
              wrapClassName="pixi-fullscreen-wrap"
              style={{ margin: 0, padding: 0 }}
              styles={{ body: { padding: '16px 12px' }, footer: { padding: '8px 12px' } }}
            >
              <Form.Item label="Kapcsolattartók" style={{ marginBottom: 12 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="contact_ids" noStyle>
                  <Select 
                    mode="multiple" 
                    labelInValue
                    allowClear 
                    showSearch 
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 96px)' }}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 200, maxWidth: 'calc(100vw - 32px)' } } }}
                    onDropdownVisibleChange={(open) => {
                      if (!open) {
                        // Dropdown closed → auto-close the sub-modal
                        setClientContactModalOpen(false);
                      }
                    }}
                    onFocus={async () => {
                      const companyId = form.getFieldValue('company_id');
                      if (companyId === 'private') {
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                      } else if (companyId) {
                        const list = await crmService.getContactsByCompany(companyId);
                        setContacts(list.results ?? list);
                      } else {
                        const list = await crmService.getContacts();
                        setContacts((list.results ?? list) || []);
                      }
                    }}
                    onChange={async (val: any) => {
                      form.setFieldsValue({ contact_ids: val });
                      const companyId = form.getFieldValue('company_id');
                      if (!companyId && Array.isArray(val) && val.length > 0) {
                        const lastId = val[val.length - 1];
                        const chosen = contacts.find((c: any) => c.id === lastId || String(c.id) === String(lastId));
                        const chosenCompanyId = chosen?.customer || chosen?.customer_id || chosen?.company || chosen?.company_id;
                        if (chosenCompanyId) {
                          form.setFieldsValue({ company_id: chosenCompanyId });
                          const cl = await crmService.getContactsByCompany(chosenCompanyId);
                          const loaded: any[] = (cl.results ?? cl) || [];
                          const merged = [...loaded];
                          (val as any[]).forEach((selId: any) => {
                            if (!merged.find((c: any) => c.id === selId || String(c.id) === String(selId))) {
                              const ex = contacts.find((c: any) => c.id === selId || String(c.id) === String(selId));
                              if (ex) merged.push(ex);
                            }
                          });
                          setContacts(merged);
                          const chosenCompanyName = chosen?.customer_name || chosen?.company_name;
                          if (chosenCompanyName) {
                            setCompanies((prev: any[]) => {
                              if (prev.find((c: any) => String(c.id) === String(chosenCompanyId))) return prev;
                              return [{ id: chosenCompanyId, name: chosenCompanyName }, ...prev];
                            });
                          }
                        }
                      }
                    }}
                  >
                    {contacts.map((p: any) => {
                      const companyId = form.getFieldValue('company_id');
                      const baseName = p.full_name || p.name || '';
                      const companyName = p.customer_name || p.company_name || '';
                      const lbl = (!companyId && companyName) ? `${baseName} \u2014 ${companyName}` : baseName;
                      return (
                        <Select.Option key={p.id} value={p.id} label={lbl}>{lbl}</Select.Option>
                      );
                    })}
                  </Select>
                  </Form.Item>
                  <Tooltip title="Új kapcsolattartó hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        const companyId = form.getFieldValue('company_id');
                        let url = '/crm/contacts?action=create';
                        if (companyId && companyId !== 'private') {
                          url += `&company=${companyId}`;
                          const company = companies.find((c: any) => c.id === companyId);
                          if (company?.name) url += `&company_name=${encodeURIComponent(company.name)}`;
                        }
                        const popup = window.open(url, '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                if (companyId === 'private') {
                                  const list = await crmService.getPrivateContacts();
                                  setContacts(list.results ?? list);
                                } else if (companyId) {
                                  const list = await crmService.getContactsByCompany(companyId);
                                  setContacts(list.results ?? list);
                                } else {
                                  const list = await crmService.getContacts();
                                  setContacts((list.results ?? list) || []);
                                }
                                message.success('Kapcsolattartók listája frissítve');
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }, 500);
                        }
                      }}
                    />
                  </Tooltip>
                  <Button 
                    type="default"
                    htmlType="button"
                    onClick={async () => {
                      const companyId = form.getFieldValue('company_id');
                      if (companyId) {
                        if (companyId === 'private') {
                          const list = await crmService.getPrivateContacts();
                          setContacts(list.results ?? list);
                          message.success('Magánszemély kapcsolattartók frissítve');
                        } else {
                          const list = await crmService.getContactsByCompany(companyId);
                          setContacts(list.results ?? list);
                          message.success('Kapcsolattartók frissítve');
                        }
                      } else {
                        message.warning('Először válassz céget');
                      }
                    }}
                  >
                    Frissítés
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Modal>
          )}
          </div>


          {/* ── Tételek ──────────────────────────────────────────────────── */}
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tételek</div>
            <Row gutter={[8, 4]} style={{ marginBottom: 6 }}>
              <Col xs={24} md={10}>
                <Form.Item label="Projekt" name="project_id" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Válassz projektet"
                    popupRender={(menu) => (
                      <>
                        {menu}
                        <Divider style={{ margin: '4px 0' }} />
                        <Button
                          type="link"
                          icon={<PlusOutlined />}
                          style={{ width: '100%', textAlign: 'left' }}
                          onClick={() => {
                            const companyId = form.getFieldValue('company_id');
                            let url = '/sales/projects?action=create';
                            if (companyId && companyId !== 'private') url += `&company=${companyId}`;
                            window.open(url, '_blank');
                          }}
                        >
                          Új projekt létrehozása
                        </Button>
                      </>
                    )}
                  >
                    {(projects || []).filter((p: any) => {
                      if (!p.company) return true;
                      const cid = form.getFieldValue('company_id');
                      if (!cid || cid === 'private') return false;
                      return String(p.company) === String(cid);
                    }).map((p: any) => (
                      <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}{(p as any).company_name ? <span style={{color:'#999',marginLeft:6,fontSize:11}}>{(p as any).company_name}</span> : null}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>Tétel hozzáadása:</span>
            <Checkbox 
              checked={partialOrderAllowed}
              onChange={(e) => setPartialOrderAllowed(e.target.checked)}
            >
              Részlegesen megrendelhető
            </Checkbox>
          </div>
          <Space wrap>
            <Tooltip title={newItems.length >= 1 ? 'Minden tételből külön árajánlat készül mentéskor' : ''}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setEditIdx(null); setSelectorType('manufacturing'); setSelectorOpen(true); }}
              >
                Tétel hozzáadása{newItems.length >= 1 ? ` (${newItems.length + 1}. ajánlat)` : ''}
              </Button>
            </Tooltip>
            <Button icon={<HistoryOutlined />} onClick={openHistoryModal} title="Korábbi tételek betöltése">Korábbi tételek</Button>
            <Button
              onClick={() => {
                const companyId = form.getFieldValue('company_id');
                const company = companies.find((c: any) => c.id === companyId);
                const params = new URLSearchParams({ from_rfq: '1', return_url: window.location.href, mode: 'pdf' });
                if (companyId && companyId !== 'private') params.set('company', String(companyId));
                if (company?.name) params.set('company_name', encodeURIComponent(company.name));
                window.open(`/print-shop?${params.toString()}`, '_blank');
              }}
            >PrintShop</Button>
          </Space>
          <div style={{ marginTop: 6 }}>
            <ItemsTable
              currency={currency}
              currencySelector={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13 }}>Pénznem:</span>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Válassz pénznemet"
                    value={currency}
                    onChange={(val) => {
                      const newCode = String(val);
                      const fromCurr = currencyList.find(c => c.code.toUpperCase() === currency.toUpperCase());
                      const toCurr = currencyList.find(c => c.code.toUpperCase() === newCode.toUpperCase());
                      const fromRate = (fromCurr?.exchange_rate && fromCurr.exchange_rate > 0) ? fromCurr.exchange_rate : 1;
                      const toRate = (toCurr?.exchange_rate && toCurr.exchange_rate > 0) ? toCurr.exchange_rate : 1;
                      if (fromRate !== toRate) {
                        const ratio = fromRate / toRate;
                        setNewItems(prev => prev.map(it => ({
                          ...it,
                          net_unit_price: parseFloat(((Number(it.net_unit_price) || 0) * ratio).toFixed(4)),
                        })));
                        setNewCosts(prev => prev.map(c => {
                          const unitPrice = parseFloat(((Number(c.net_unit_price) || 0) * ratio).toFixed(4));
                          return { ...c, net_unit_price: unitPrice, net_total: parseFloat((unitPrice * (Number(c.quantity) || 0)).toFixed(4)) };
                        }));
                      }
                      setCurrency(newCode);
                    }}
                    style={{ width: 200 }}
                    size="small"
                  >
                    {currencyList.map((c) => (
                      <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>
                        {c.code} – {c.name} {c.symbol ? `(${c.symbol})` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              }
              onDeleteItem={(rec) => {
                const idx = (rec.id as number) - 1;
                const removedItem = newItems[idx];
                setNewItems((prev) => prev.filter((_, i) => i !== idx));
                if (removedItem?.ref_id !== undefined) {
                  setNewCosts((prev) => prev.filter((c: any) => c._rfqItemRef !== removedItem.ref_id));
                }
              }}
              onCopyItem={(rec) => {
                const idx = (rec.id as number) - 1;
                const it = newItems[idx];
                if (!it) return;
                setNewItems((prev) => [...prev, cloneDraftRfqItem(it)]);
              }}
              onEditItem={(rec) => {
                const idx = (rec.id as number) - 1;
                const it = newItems[idx];
                setEditIdx(idx);
                setSelectorType(it?.item_type || 'product');
                setSelectorOpen(true);
              }}
              items={newItems.map((it, idx) => {
              const base = {
                id: idx + 1,
                item_type: it.item_type,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit,
                net_unit_price: it.net_unit_price,
                net_total: (Number(it.quantity) || 0) * (Number(it.net_unit_price) || 0),
                vat_rate: it.vat_rate,
                gross_total: ((Number(it.quantity) || 0) * (Number(it.net_unit_price) || 0)) * (1 + (Number(it.vat_rate) || 0) / 100),
                product_code: (it.item_type === 'product' || !it.item_type) ? it.code : undefined,
                manufacturing_product_code: it.item_type === 'manufacturing' && (it.ref_id || 0) > 0 ? it.code : undefined,
                service_code: it.item_type === 'service' ? it.code : undefined,
                manufacturing_product: (it as any).manufacturing_product,
              } as any;
              // compute discounted totals to mirror server logic
              const discountPercent = Number((it as any).discount_percent || 0);
              const discountAmount = Number((it as any).discount_amount || 0);
              const net = Number(base.net_total || 0);
              let discounted = net;
              if (discountPercent > 0) discounted = discounted * (1 - discountPercent / 100);
              if (discountAmount > 0) discounted = Math.max(0, discounted - discountAmount);
              base.discounted_net_total = discounted;
              if (it.item_type === 'product') base.product_name = it.name;
              else if (it.item_type === 'manufacturing') base.manufacturing_product_name = it.name;
              else base.service_name = it.name;
              return base;
            })}
            />
          </div>
          </div>
          {/* ── Költség kalkuláció ───────────────────────────────────────── */}
          <div style={{ background: '#fff0f6', border: '1px solid #ffadd2', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#c41d7f', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Költség kalkuláció</div>
          <div style={{ marginBottom: 8 }}>
             <RFQCostsTable
                totalRevenue={newItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.net_unit_price || 0)), 0)}
                currency={currency}
                rfqItems={newItems.map(it => {
                  // For manufacturing items still pending (not yet API-saved),
                  // pull cost items from the inline payload so they appear in the cost table.
                  const pending = (it as any).pendingManuPayload;
                  const inlineCostItems = pending?._costItemsState
                    ?? pending?.cost_items
                    ?? (it as any).manuCostItems
                    ?? undefined;
                  return {
                    ...it,
                    manufacturing_product_name: it.name,
                    manufacturing_product: it.item_type === 'manufacturing'
                      ? ((it as any).manufacturing_product || it.ref_id)
                      : undefined,
                    _inlineCostItems: it.item_type === 'manufacturing' ? inlineCostItems : undefined,
                  };
                })}
             />
          </div>
          </div>
          {/* ── Impozíció presetek (ajánlat szintű) ─────────────────────── */}
          {rfqImpositionPresets.length > 0 && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 6px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impozíciók ({rfqImpositionPresets.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rfqImpositionPresets.map((p: any, idx: number) => (
                  <div key={p.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #d9f7be', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                    <span style={{ flex: 1, color: '#333' }}>{p.name || `Impozíció ${idx + 1}`}</span>
                    <Button size="small" type="text" icon={<EditOutlined />} title="Szerkesztés" onClick={() => {
                      setRfqImpositionModalOpen(true);
                      setRfqImpositionEditIdx(idx);
                    }} style={{ padding: 0, height: 'auto' }} />
                    <Button size="small" type="text" icon={<CopyOutlined />} title="Másolás" onClick={() => {
                      const copy = { ...p, id: `imp_${Date.now()}`, name: `${p.name || 'Impozíció'} (másolat)` };
                      setRfqImpositionPresets(prev => [...prev, copy]);
                    }} style={{ padding: 0, height: 'auto' }} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} title="Törlés" onClick={() => {
                      setRfqImpositionPresets(prev => prev.filter((_, i) => i !== idx));
                    }} style={{ padding: 0, height: 'auto' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Form>
      </Modal>

      {/* ── RFQ-szintű ImpositionHelperModal ────────────────────────────── */}
      <ImpositionHelperModal
        open={rfqImpositionModalOpen}
        onClose={() => { setRfqImpositionModalOpen(false); setRfqImpositionEditIdx(null); }}
        initialItemData={rfqImpositionEditIdx !== null ? rfqImpositionPresets[rfqImpositionEditIdx] : null}
        onSaveToRfq={(snapshot, autoName) => {
          const id = `imp_${Date.now()}`;
          if (rfqImpositionEditIdx !== null) {
            setRfqImpositionPresets(prev => prev.map((p, i) => i === rfqImpositionEditIdx ? { ...p, ...snapshot, name: autoName } : p));
          } else {
            setRfqImpositionPresets(prev => [...prev, { id, name: autoName, ...snapshot }]);
          }
          setRfqImpositionEditIdx(null);
        }}
      />

      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => {
          if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
          setPreviewOpen(false);
          setPreviewUrl(null);
          setPreviewTitle('');
        }}
        footer={null}
        width={900}
      >
        {previewUrl ? (() => {
          const ext = previewTitle.split('.').pop()?.toLowerCase() ?? '';
          if (ext === 'pdf') {
            return (
              <div>
                <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '70vh', border: 0 }} />
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <Button type="primary" onClick={() => openPdfPreview(previewUrl!)}>Megnyitás Print Preview-ban</Button>
                </div>
              </div>
            );
          }
          if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) {
            return <img alt={previewTitle} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: '0 auto' }} />;
          }
          return (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ marginBottom: 16 }}>Ez a fájltípus ({ext || 'ismeretlen'}) nem jeleníthető meg közvetlenül.</p>
              <a href={previewUrl} download={previewTitle}>
                <Button type="primary">Letöltés: {previewTitle}</Button>
              </a>
            </div>
          );
        })() : (
          <div>Nincs előnézet</div>
        )}
      </Modal>

      <Modal
        title="Megjegyzés a fájlhoz"
        open={remarkModalOpen}
        onOk={() => {
          setRfqFileRemarks((prev) => ({ ...prev, [remarkModalKey]: remarkModalValue }));
          setRemarkModalOpen(false);
        }}
        onCancel={() => setRemarkModalOpen(false)}
        okText="Mentés"
        cancelText="Mégse"
        width={360}
      >
        <Input.TextArea
          autoFocus
          rows={3}
          value={remarkModalValue}
          onChange={(e) => setRemarkModalValue(e.target.value)}
          placeholder="Írd be a megjegyzést..."
        />
      </Modal>

      <ItemSelectorModal
        open={selectorOpen}
        defaultType={selectorType}
        customer={(() => {
          const cid = form.getFieldValue('company_id');
          if (cid === 'private') return { id: 'private', name: 'Magánszemély' };
          const c = companies.find((x: any) => x.id === cid);
          return c ? { id: c.id, name: c.name } : undefined;
        })()}
        rfqCurrency={currency}
        hideCodeField
        onImpositionSaveToRfq={(snapshot, autoName) => {
          const id = `imp_${Date.now()}`;
          setRfqImpositionPresets(prev => [...prev, { id, name: autoName, ...snapshot }]);
        }}
        onCancel={() => { setSelectorOpen(false); setEditIdx(null); }}
        onAdd={(p: SelectedItemPayload) => {
          // Use functional updater so findIndex always sees the latest committed state,
          // preventing stale-closure duplicates when two calls fire before a re-render.
          setNewItems((prev) => {
            if (editIdx !== null && editIdx >= 0 && editIdx < prev.length) {
              return prev.map((it, i) => i === editIdx ? { ...it, ...p } : it);
            }
            // For pending manufacturing items (negative ref_id), update the existing entry instead of appending a duplicate
            const pendingIdx = (p.ref_id !== undefined && p.ref_id < 0)
              ? prev.findIndex(it => it.ref_id === p.ref_id && it.item_type === p.item_type)
              : -1;
            if (pendingIdx >= 0) {
              return prev.map((it, i) => i === pendingIdx ? { ...it, ...p } : it);
            }
            return [...prev, p];
          });
          // If the manufacturing inline form added cost items, append them to draft costs
          if ((p as any).manuCostItems && (p as any).manuCostItems.length > 0) {
            setNewCosts((prev) => {
              // Remove stale costs linked to this item before re-adding (handles edit case)
              const filtered = p.ref_id !== undefined ? prev.filter((c: any) => c._rfqItemRef !== p.ref_id) : prev;
              const baseId = filtered.length > 0 ? Math.max(...filtered.map((c: any) => Number(c.id) || 0)) : 0;
              const additions = (p as any).manuCostItems.map((ci: any, i: number) => ({
                ...ci,
                id: baseId + i + 1,
                _rfqItemRef: p.ref_id,
              }));
              return [...filtered, ...additions];
            });
          }
          if (!(p as any).keepOpen) {
            setSelectorOpen(false);
            setEditIdx(null);
          }
        }}
        mode={editIdx !== null ? 'edit' : 'add'}
        initialSelection={editIdx !== null ? (newItems[editIdx] ? { 
            item_type: newItems[editIdx].item_type, 
            ref_id: newItems[editIdx].ref_id, 
            name: newItems[editIdx].name,
            code: (newItems[editIdx] as any).product_code || (newItems[editIdx] as any).code || (newItems[editIdx] as any).manufacturing_product?.code || undefined,
            _fromHistory: !!(newItems[editIdx] as any)._fromHistory,
        } : undefined) : undefined}
        initialManuPayload={editIdx !== null && newItems[editIdx]?.item_type === 'manufacturing' ? cloneDraftRfqItem((newItems[editIdx] as any).pendingManuPayload) : undefined}
        initialValues={editIdx !== null ? (newItems[editIdx] ? {
          quantity: Number(newItems[editIdx].quantity || 1),
          unit: newItems[editIdx].unit,
          net_unit_price: Number(newItems[editIdx].net_unit_price || 0),
          vat_rate: Number(newItems[editIdx].vat_rate || 27),
          description: newItems[editIdx].description,
          internal_description: (newItems[editIdx] as any).internal_description || '',
          quote_number: (newItems[editIdx] as any).quote_number || '',
          cost_items_data: (newItems[editIdx] as any).cost_items_data || [],
          discount_percent: Number((newItems[editIdx] as any).discount_percent || 0),
          discount_amount: Number((newItems[editIdx] as any).discount_amount || 0),
        } : undefined) : undefined}
        initialFormulas={editIdx !== null ? ((newItems[editIdx] as any)?.formulas || {}) : undefined}
      />
      {/* ── Tétel másolása ─────────────────────────────────────────────────── */}
      {copySourceItem && (
        <Modal
          title="Tétel másolása új árajánlatba"
          open={copyItemModalOpen}
          onCancel={() => { setCopyItemModalOpen(false); setCopySourceItem(null); setCopySourceRfq(null); setCopyItemLoading(false); }}
          footer={[
            <Button key="cancel" onClick={() => { setCopyItemModalOpen(false); setCopySourceItem(null); setCopySourceRfq(null); setCopyItemLoading(false); }}>Mégse</Button>,
            <Button key="save" type="primary" loading={copyItemLoading} disabled={copyItemLoading} onClick={() => copyItemSaveRef.current?.save(false)}>Létrehozás</Button>,
          ]}
          width={isMobile ? '100vw' : 1100}
          maskClosable={false}
          destroyOnHidden
        >
          {copyItemLoading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.65)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, pointerEvents: 'none' }}>
              <Spin tip="Betöltés..." size="large" />
            </div>
          )}
          {/* ── Alap adatok ── */}
          <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={6}>
                <Form.Item label="Rögzítette" style={{ marginBottom: 6 }}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    value={copyItemUserName || undefined}
                    onChange={(val) => setCopyItemUserName(val)}
                    placeholder="Válassz felhasználót"
                  >
                    {allUsers.map((u) => (
                      <Select.Option key={u.id} value={u.name} label={u.name}>{u.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Keltezés" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} value={copyItemIssueDate} onChange={(d) => setCopyItemIssueDate(d || dayjs())} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Határidő" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} value={copyItemDeadline} onChange={(d) => setCopyItemDeadline(d || null)} format="YYYY-MM-DD" allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item
                  label="Érvény. (nap)"
                  style={{ marginBottom: 6 }}
                  help={<span style={{ fontSize: 11, color: '#888' }}>Lejár: {(copyItemIssueDate || dayjs()).add(copyItemValidityDays, 'day').format('YYYY.MM.DD.')}</span>}
                >
                  <InputNumber min={1} value={copyItemValidityDays} onChange={(v) => setCopyItemValidityDays(v ?? 30)} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </div>
          {/* ── Ügyfél ── */}
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={6}>
                <Form.Item label="Cég" style={{ marginBottom: 6 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      showSearch allowClear optionFilterProp="label"
                      filterOption={accentInsensitiveLabelFilter}
                      placeholder="Válassz céget"
                      labelRender={(opt) => {
                        const lvl = overdueCompanyMap[String(opt.value)];
                        if (lvl === 'post_reminder_1') return <span style={{ background: '#1a1a1a', color: '#e53935', padding: '1px 4px', borderRadius: 2 }}>{opt.label}</span>;
                        if (lvl === 'overdue_10') return <span style={{ color: '#e53935' }}>{opt.label}</span>;
                        return <span>{opt.label}</span>;
                      }}
                      style={{ width: 'calc(100% - 32px)' }}
                      value={copyItemCompanyId}
                      onChange={async (val) => {
                        setCopyItemCompanyId(val ?? null);
                        setCopyItemContactIds([]);
                        if (val && val !== 'private') {
                          try {
                            const cl = await crmService.getContactsByCompany(val);
                            setCopyItemContacts((cl.results ?? cl) || []);
                          } catch {}
                        }
                      }}
                      onFocus={async () => {
                        try {
                          const [list, flagsRaw] = await Promise.all([
                            crmService.getCompanies({ is_customer: true, compact: true }),
                            crmService.getOverdueCustomerFlags().catch(() => []),
                          ]);
                          const _fArr3 = Array.isArray(flagsRaw) ? flagsRaw : (flagsRaw as any)?.results || [];
                          const _fMap3: Record<string, string> = {};
                          _fArr3.forEach((f: any) => { if (f?.customer_id) _fMap3[String(f.customer_id)] = f.level; });
                          setOverdueCompanyMap(_fMap3);
                          setCompanies((list.results ?? list) || []);
                        } catch {}
                      }}
                    >
                      <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                      {companies.map((c: any) => {
                        const lvl = overdueCompanyMap[String(c.id)];
                        const style = lvl === 'post_reminder_1' ? { background: '#1a1a1a', color: '#e53935', padding: '1px 4px' } : lvl === 'overdue_10' ? { color: '#e53935' } : {};
                        return <Select.Option key={c.id} value={c.id} label={c.name}><span style={style}>{c.name}</span></Select.Option>;
                      })}
                    </Select>
                    <Tooltip title="Új cég hozzáadása">
                      <Button icon={<PlusCircleOutlined />} onClick={() => {
                        const popup = window.open('/crm/companies?action=create', '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                const list = await crmService.getCompanies({ is_customer: true, compact: true });
                                setCompanies((list.results ?? list) || []);
                                message.success('Cégek listája frissítve');
                              } catch {}
                            }
                          }, 500);
                        }
                      }} />
                    </Tooltip>
                  </Space.Compact>
                </Form.Item>
              </Col>
              <Col xs={24} md={18}>
                <Form.Item label="Kapcsolattartók" style={{ marginBottom: 6 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      mode="multiple" allowClear showSearch optionFilterProp="label"
                      filterOption={accentInsensitiveLabelFilter}
                      placeholder="Válassz kapcsolattartókat"
                      style={{ width: 'calc(100% - 190px)' }}
                      popupMatchSelectWidth={false}
                      styles={{ popup: { root: { minWidth: 200, maxWidth: 'calc(100vw - 32px)' } } }}
                      value={copyItemContactIds}
                      onChange={(val) => setCopyItemContactIds(val || [])}
                      onFocus={async () => {
                        if (copyItemCompanyId && copyItemCompanyId !== 'private') {
                          try {
                            const cl = await crmService.getContactsByCompany(copyItemCompanyId);
                            setCopyItemContacts((cl.results ?? cl) || []);
                          } catch {}
                        }
                      }}
                    >
                      {copyItemContacts.map((c: any) => (
                        <Select.Option key={c.id} value={c.id} label={c.full_name || c.name}>{c.full_name || c.name}</Select.Option>
                      ))}
                    </Select>
                    <Tooltip title="Új kapcsolattartó hozzáadása">
                      <Button icon={<PlusCircleOutlined />} onClick={() => {
                        let url = '/crm/contacts?action=create';
                        if (copyItemCompanyId && copyItemCompanyId !== 'private') {
                          url += `&company=${copyItemCompanyId}`;
                          const co = companies.find((c: any) => c.id === copyItemCompanyId);
                          if (co?.name) url += `&company_name=${encodeURIComponent(co.name)}`;
                        }
                        const popup = window.open(url, '_blank');
                        if (popup) {
                          const timer = setInterval(async () => {
                            if (popup.closed) {
                              clearInterval(timer);
                              try {
                                if (copyItemCompanyId && copyItemCompanyId !== 'private') {
                                  const cl = await crmService.getContactsByCompany(copyItemCompanyId);
                                  setCopyItemContacts((cl.results ?? cl) || []);
                                }
                                message.success('Kapcsolattartók listája frissítve');
                              } catch {}
                            }
                          }, 500);
                        }
                      }} />
                    </Tooltip>
                    <Button onClick={async () => {
                      if (copyItemCompanyId && copyItemCompanyId !== 'private') {
                        try {
                          const cl = await crmService.getContactsByCompany(copyItemCompanyId);
                          setCopyItemContacts((cl.results ?? cl) || []);
                          message.success('Kapcsolattartók frissítve');
                        } catch {}
                      } else {
                        message.warning('Először válassz céget');
                      }
                    }}>Frissítés</Button>
                  </Space.Compact>
                </Form.Item>
              </Col>
            </Row>
          </div>
          {/* ── Projekt ── */}
          <div style={{ marginBottom: 10 }}>
            <Form.Item label="Projekt" style={{ marginBottom: 0 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  allowClear showSearch optionFilterProp="label"
                  placeholder="Válassz projektet"
                  style={{ width: 'calc(100% - 32px)' }}
                  value={copyItemProjectId}
                  onChange={(val) => setCopyItemProjectId(val ?? null)}
                >
                  {(projects || []).filter((p: any) => {
                    if (!p.company) return true;
                    if (!copyItemCompanyId || copyItemCompanyId === 'private') return false;
                    return String(p.company) === String(copyItemCompanyId);
                  }).map((p: any) => (
                    <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}{p.company_name ? <span style={{ color: '#999', marginLeft: 6, fontSize: 11 }}>{p.company_name}</span> : null}</Select.Option>
                  ))}
                </Select>
                <Tooltip title="Új projekt létrehozása">
                  <Button icon={<PlusCircleOutlined />} onClick={() => {
                    let url = '/sales/projects?action=create';
                    if (copyItemCompanyId && copyItemCompanyId !== 'private') url += `&company=${copyItemCompanyId}`;
                    const popup = window.open(url, '_blank');
                    if (popup) {
                      const timer = setInterval(async () => {
                        if (popup.closed) {
                          clearInterval(timer);
                          try {
                            const projRes = await manufacturingService.getProjects();
                            setProjects(projRes as any);
                            message.success('Projektek listája frissítve');
                          } catch {}
                        }
                      }, 500);
                    }
                  }} />
                </Tooltip>
              </Space.Compact>
            </Form.Item>
          </div>
          {/* ── Tétel szerkesztő ── */}
          <ItemSelectorModal
            renderInline
            open={true}
            saveRef={copyItemSaveRef}
            mode='add'
            defaultType={copySourceItem.item_type || 'manufacturing'}
            rfqCurrency={currency}
            hideCodeField
            onCancel={() => { setCopyItemModalOpen(false); setCopySourceItem(null); setCopySourceRfq(null); setCopyItemLoading(false); }}
            onAdd={handleCopyItemSave}
            initialSelection={{
              item_type: copySourceItem.item_type || 'manufacturing',
              ref_id: copySourceItem.manufacturing_product || copySourceItem.product || copySourceItem.service || copySourceItem.ref_id,
              name: copySourceItem.manufacturing_product_name || copySourceItem.item_name || copySourceItem.product_name || copySourceItem.service_name || copySourceItem.name || '',
            }}
            initialValues={{
              quantity: Number(copySourceItem.quantity) || 1,
              unit: copySourceItem.unit || 'db',
              net_unit_price: Number(copySourceItem.net_unit_price) || 0,
              vat_rate: Number(copySourceItem.vat_rate) || 27,
              description: copySourceItem.description || '',
              internal_description: copySourceItem.internal_description || '',
              discount_percent: Number(copySourceItem.discount_percent || 0),
              discount_amount: Number(copySourceItem.discount_amount || 0),
              cost_items_data: copySourceItem.cost_items_data || [],
            }}
            initialFormulas={copySourceItem.formulas || {}}
            quoteItemId={copySourceItem.id}
          />
        </Modal>
      )}
      <AttachmentPreviewModal
        open={rfqAttPreviewOpen}
        title={rfqAttPreviewTitle}
        url={rfqAttPreviewUrl}
        onClose={() => { setRfqAttPreviewOpen(false); setRfqAttPreviewUrl(null); setRfqAttPreviewTitle(''); }}
      />

      {/* ── Korábbi tételek betöltése ─────────────────────────────────── */}
      <Modal
        title="Korábbi tételek betöltése"
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        onOk={confirmHistoryLoad}
        okText="Betöltés"
        cancelText="Mégse"
        width={1100}
        okButtonProps={{ disabled: historySelectedKeys.length === 0 }}
      >
        {/* Keresősor + minden ügyfél checkbox — mindig látszik */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <Input.Search
            placeholder="Keresés tétel neve, leírás, ajánlat száma alapján..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            allowClear
            style={{ flex: 1 }}
          />
          <Checkbox
            checked={historyAllCompanies}
            onChange={(e) => {
              setHistoryAllCompanies(e.target.checked);
              setHistoryItems([]);
              setHistorySelectedKeys([]);
              setHistoryLoading(true);
              const companyId = form.getFieldValue('company_id');
              const params: any = e.target.checked
                ? { all_companies: 1 }
                : (companyId && companyId !== 'private' ? { company_id: companyId } : { all_companies: 1 });
              api.get('/sales/quote-requests/items_history/', { params })
                .then(res => setHistoryItems(res.data || []))
                .catch(() => message.error('Nem sikerült betölteni'))
                .finally(() => setHistoryLoading(false));
            }}
          >
            Minden ügyfél
          </Checkbox>
        </div>

        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : historyItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Nincs korábbi tétel{historyAllCompanies ? '' : ' ehhez az ügyfélhez'}.</div>
        ) : (
          <>
          <Table
            size="small"
            rowKey="item_id"
            dataSource={historyItems.filter((it: any) => {
              const trimmedSearch = (historySearch || '').trim();
              if (!trimmedSearch) return true;
              const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '');
              const tokens = norm(trimmedSearch).split(/\s+/).filter(Boolean);
              if (tokens.length === 0) return true;
              const combined = [
                it.name, it.description, it.internal_description,
                it.rfq_number, it.code, it.quote_number, it.company_name || '',
                ...(it.costs || []).flatMap((c: any) => [c.name, c.code]),
              ].map(norm).join(' ');
              return tokens.every((t: string) => combined.includes(t));
            })}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: historySelectedKeys,
              onChange: (keys) => setHistorySelectedKeys(keys),
            }}
            expandable={{
              expandedRowRender: (record: any) => {
                const costs: any[] = record.costs || [];
                if (!costs.length) return <div style={{ padding: '4px 8px', color: '#999', fontSize: 12 }}>Nincs költségtétel</div>;
                return (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={costs}
                    pagination={false}
                    columns={[
                      { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 100 },
                      { title: 'Megnevezés', dataIndex: 'name', key: 'name' },
                      { title: 'Menny.', key: 'qty', width: 80, render: (_: any, r: any) => `${r.quantity} ${r.unit}` },
                      { title: 'Egységár', dataIndex: 'net_unit_price', key: 'nup', width: 130,
                        render: (v: number, r: any) => (
                          <Space size={4}>
                            <span>{Math.round(v).toLocaleString('hu-HU')} {r.currency_code || 'HUF'}</span>
                            {r.price_changed && (
                              <Tooltip title={`Aktuális ár: ${Math.round(r.current_price || 0).toLocaleString('hu-HU')} ${r.currency_code || 'HUF'}`}>
                                <WarningOutlined style={{ color: '#faad14' }} />
                              </Tooltip>
                            )}
                          </Space>
                        ),
                      },
                      { title: 'Összesen', dataIndex: 'net_total', key: 'ntot', width: 110, render: (v: number, r: any) => `${Math.round(v).toLocaleString('hu-HU')} ${r.currency_code || 'HUF'}` },
                      { title: 'Beszállító', dataIndex: 'supplier_name', key: 'supp', width: 140 },
                    ]}
                  />
                );
              },
              rowExpandable: (record: any) => (record.costs || []).length > 0,
            }}
            columns={[
              { title: 'Dátum', dataIndex: 'rfq_date', key: 'rfq_date', width: 100,
                sorter: (a: any, b: any) => a.rfq_date.localeCompare(b.rfq_date),
                defaultSortOrder: 'descend' as const },
              { title: 'Státusz', key: 'item_status', width: 110,
                render: (_: any, r: any) => {
                  const SM: Record<string, { color: string; text: string }> = {
                    new:           { color: 'default', text: 'Új' },
                    quoted:        { color: 'blue',    text: 'Ajánlatban' },
                    ordered:       { color: 'cyan',    text: 'Megrendelve' },
                    in_production: { color: 'orange',  text: 'Gyártásban' },
                    ready:         { color: 'green',   text: 'Kész' },
                    in_delivery:   { color: 'geekblue', text: 'Szállítás' },
                    delivered:     { color: 'success', text: 'Kiszállítva' },
                    invoiced:      { color: 'gold',    text: 'Számlázva' },
                    cancelled:     { color: 'red',     text: 'Törölve' },
                  };
                  const st = r.item_status || 'new';
                  const m = SM[st] || { color: 'default', text: st };
                  return <Tag color={m.color}>{m.text}</Tag>;
                },
              },
              { title: 'Ajánlat #', dataIndex: 'rfq_number', key: 'rfq_number', width: 150,
                render: (v: string, r: any) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{v}</div>
                    {historyAllCompanies && r.company_name && (
                      <div style={{ fontSize: 11, color: '#666' }}>{r.company_name}</div>
                    )}
                  </div>
                ),
              },
              { title: 'Tétel neve', dataIndex: 'name', key: 'name',
                render: (v: string, r: any) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{v || '-'}</div>
                    {(r.quote_number || r.code) && <div style={{ fontSize: 11, color: '#999' }}>{r.quote_number || r.code}</div>}
                  </div>
                ),
              },
              { title: 'Leírás', dataIndex: 'description', key: 'desc', ellipsis: true, render: (v: string) => stripHtml(v) },
              { title: 'Belső leírás', dataIndex: 'internal_description', key: 'idesc', ellipsis: true, render: (v: string) => stripHtml(v) },
              { title: 'Darabszám', key: 'qty', width: 130,
                render: (_: any, r: any) => (
                  <Space size={6}>
                    <span>{r.quantity} {r.unit}</span>
                    <Tooltip title={historyUseQty[r.item_id] ? 'Eredeti mennyiség másolva' : 'Mennyiség nem másolódik (1 lesz)'}>
                      <Switch
                        size="small"
                        checked={!!historyUseQty[r.item_id]}
                        onChange={(v) => setHistoryUseQty(prev => ({ ...prev, [r.item_id]: v }))}
                      />
                    </Tooltip>
                  </Space>
                ),
              },
              { title: 'Nettó egységár', dataIndex: 'net_unit_price', key: 'nup', width: 125,
                render: (v: number) => `${Math.round(v).toLocaleString('hu-HU')} Ft` },
              { title: 'Nettó összesen', dataIndex: 'net_total', key: 'ntot', width: 125,
                render: (v: number) => `${Math.round(v).toLocaleString('hu-HU')} Ft` },
            ]}
            pagination={{ pageSize: 20 }}
          />
          </>
        )}
      </Modal>

      {/* Ask if user wants to send confirmation email after order creation */}
      <Modal
        title="Visszaigazoló e-mail küldése?"
        open={confirmEmailAskOpen}
        onCancel={() => { setConfirmEmailAskOpen(false); navigate('/sales/customer-orders'); }}
        footer={[
          <Button key="no" onClick={() => { setConfirmEmailAskOpen(false); navigate('/sales/customer-orders'); }}>Nem, köszönöm</Button>,
          <Button key="yes" type="primary" icon={<MailOutlined />} onClick={() => {
            setConfirmEmailAskOpen(false);
            setConfirmEmailIndex(0);
            openConfirmEmailModal(confirmEmailOrders[0]);
          }}>Igen, e-mail küldés</Button>,
        ]}
      >
        <p>Szeretne megrendelés visszaigazoló e-mailt küldeni {confirmEmailOrders.length > 1 ? `a ${confirmEmailOrders.length} ügyfélnek` : 'az ügyfélnek'}?</p>
      </Modal>

      {/* Confirmation email modal with carousel for multiple orders */}
      <Modal
        title={(() => {
          const entry = confirmEmailOrders[confirmEmailIndex];
          const rfq = entry ? findRfqByRef((rfqs || []) as any[], entry.rfqId) : null;
          const label = rfq ? `${rfq.request_number || rfq.number || ''} (${rfq.company?.name || ''})` : '';
          const progress = confirmEmailOrders.length > 1 ? ` [${confirmEmailIndex + 1}/${confirmEmailOrders.length}]` : '';
          return `Megrendelés visszaigazolás${progress}: ${label}`;
        })()}
        open={confirmEmailOpen}
        width={860}
        onCancel={() => { setConfirmEmailOpen(false); setConfirmEmailPreview(null); }}
        footer={[
          <Button key="preview" onClick={() => {
            const values = confirmEmailForm.getFieldsValue();
            setConfirmEmailPreview({ subject: values.subject, body: values.body, is_html: true });
          }}>Előnézet</Button>,
          <Button key="cancel" onClick={() => { setConfirmEmailOpen(false); setConfirmEmailPreview(null); }}>Bezárás</Button>,
          <Button key="send" type="primary" loading={confirmEmailSending}
            onClick={async () => {
              const entry = confirmEmailOrders[confirmEmailIndex];
              if (!entry) return;
              try {
                const values = await confirmEmailForm.validateFields();
                setConfirmEmailSending(true);
                await api.post(`/sales/customer-orders/${entry.primaryOrderId}/send_confirmation_email_manual/`, values);
                message.success('E-mail elküldve');
                setConfirmEmailSentSet(prev => prev.includes(confirmEmailIndex) ? prev : [...prev, confirmEmailIndex]);
                // Auto-advance to next unsent
                const nextUnsent = confirmEmailOrders.findIndex((_, i) => i > confirmEmailIndex && !confirmEmailSentSet.includes(i));
                if (nextUnsent !== -1) {
                  setConfirmEmailIndex(nextUnsent);
                  openConfirmEmailModal(confirmEmailOrders[nextUnsent]);
                } else {
                  const anyUnsent = confirmEmailOrders.findIndex((_, i) => !confirmEmailSentSet.includes(i) && i !== confirmEmailIndex);
                  if (anyUnsent !== -1) {
                    setConfirmEmailIndex(anyUnsent);
                    openConfirmEmailModal(confirmEmailOrders[anyUnsent]);
                  } else {
                    setConfirmEmailOpen(false);
                    setConfirmEmailPreview(null);
                  }
                }
              } catch (e: any) {
                message.error(e?.response?.data?.error || 'Nem sikerült elküldeni az e-mailt');
              } finally {
                setConfirmEmailSending(false);
              }
            }}
          >{confirmEmailSentSet.includes(confirmEmailIndex) ? 'Kiküldve ✓' : 'Küldés'}</Button>,
        ]}
      >
        {/* Carousel navigation for multiple orders */}
        {confirmEmailOrders.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
            <Button size="small" icon={<LeftOutlined />} disabled={confirmEmailIndex === 0}
              onClick={() => { const ni = confirmEmailIndex - 1; setConfirmEmailIndex(ni); openConfirmEmailModal(confirmEmailOrders[ni]); }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, minWidth: 36, textAlign: 'center' }}>{confirmEmailIndex + 1} / {confirmEmailOrders.length}</span>
            <Button size="small" icon={<RightOutlined />} disabled={confirmEmailIndex === confirmEmailOrders.length - 1}
              onClick={() => { const ni = confirmEmailIndex + 1; setConfirmEmailIndex(ni); openConfirmEmailModal(confirmEmailOrders[ni]); }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {confirmEmailOrders.map((entry, i) => {
                const rfq = findRfqByRef((rfqs || []) as any[], entry.rfqId);
                return (
                  <Tag key={entry.primaryOrderId}
                    color={confirmEmailSentSet.includes(i) ? 'success' : i === confirmEmailIndex ? 'processing' : 'default'}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => { setConfirmEmailIndex(i); openConfirmEmailModal(entry); }}
                  >
                    {rfq?.company?.name || rfq?.number || entry.primaryOrderId}{confirmEmailSentSet.includes(i) ? ' ✓' : ''}
                  </Tag>
                );
              })}
            </div>
          </div>
        )}
        <Form form={confirmEmailForm} layout="vertical">
          <Form.Item name="to" label="Címzett" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item name="signature_key" label="Aláírás">
            <Select
              allowClear
              placeholder="Válassz aláírást (opcionális)"
              showSearch
              optionFilterProp="label"
              onChange={async (sigKey: string) => {
                const entry = confirmEmailOrders[confirmEmailIndex];
                if (!entry) return;
                try {
                  const additionalIds = entry.orderIds.filter(id => id !== entry.primaryOrderId);
                  const res = await api.post(`/sales/customer-orders/${entry.primaryOrderId}/render_confirmation_email/`, {
                    template_key: 'order_confirmation',
                    additional_order_ids: additionalIds,
                    signature_key: sigKey || undefined,
                  });
                  confirmEmailForm.setFieldsValue({ body: res.data.body || '' });
                  setConfirmEmailPreview(res.data);
                } catch {}
              }}
            >
              {signatures.map((sig: any) => (
                <Select.Option key={sig.key} value={sig.key} label={sig.name}>{sig.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="subject" label="Tárgy" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label="Üzenet" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <ReactQuill theme="snow" style={{ height: 280, marginBottom: 50 }} />
          </Form.Item>
        </Form>
        {confirmEmailPreview && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <Divider>Előnézet</Divider>
            <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 4 }}>
              <div style={{ marginBottom: 8 }}><b>Tárgy:</b> {confirmEmailPreview.subject}</div>
              <div className="email-preview-content">
                {confirmEmailPreview.is_html !== false ? (
                  <div dangerouslySetInnerHTML={{ __html: (confirmEmailPreview.body || '').replace(/<a /gi, '<a target="_blank" ') }} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{confirmEmailPreview.body}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Átadás modal */}
      <Modal
        title="Átadás"
        open={handoverOpen}
        onCancel={() => setHandoverOpen(false)}
        onOk={submitHandover}
        okText="Átadás rögzítése"
        cancelText="Mégse"
        confirmLoading={handoverLoading}
        width={520}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ fontSize: 13, color: '#555' }}>
            <b>{Array.from(new Set(flattenedItems.filter((r: any) => bulkSelectedKeys.includes(r.uniqueId)).map((r: any) => r.rfq_pk).filter(Boolean))).length} ajánlat</b> kerül átadásra.
            Becsült nettó összeg: <b>{Math.round(handoverNetTotal).toLocaleString('hu-HU')} Ft</b>
          </div>
          <Form form={handoverForm} layout="vertical">
            <Form.Item name="serial" label="Sorszám" rules={[{ required: true, message: 'Sorszám kötelező' }]}>
              <Input placeholder="username20260101_00" />
            </Form.Item>
            <Form.Item name="cash_register" label="Kassza" rules={[{ required: true, message: 'Válassz kasszát' }]}>
              <Select
                placeholder="Válassz kasszát…"
                options={handoverCashRegisters.map((r: any) => ({ value: r.id, label: r.name }))}
                notFoundContent="Nincs olyan kassza, amibe betehetsz"
              />
            </Form.Item>
            <Form.Item name="note" label="Megjegyzés (opcionális)">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      {/* Bulk Szállítás modal */}
      <Modal
        title="Szállítás típusa"
        open={deliveryModalOpen}
        onCancel={() => setDeliveryModalOpen(false)}
        onOk={confirmBulkDelivery}
        okText="Szállítólevél létrehozása"
        cancelText="Mégse"
        confirmLoading={bulkDeliveryLoading}
        width={420}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Szállítás típusa:</div>
          <Select
            value={deliveryType}
            onChange={(v) => { setDeliveryType(v); setSelectedPickupLocationId(null); }}
            style={{ width: '100%' }}
          >
            <Select.Option value="home">Házhozszállítás</Select.Option>
            <Select.Option value="pickup">Átvételi pont</Select.Option>
          </Select>
        </div>
        {deliveryType === 'pickup' && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>Átvételi pont:</div>
            <Select
              value={selectedPickupLocationId}
              onChange={setSelectedPickupLocationId}
              style={{ width: '100%' }}
              placeholder="Válasszon átvételi pontot…"
              showSearch
              optionFilterProp="label"
            >
              {pickupLocations.map((loc: any) => (
                <Select.Option key={loc.id} value={loc.id} label={loc.name}>
                  {loc.name}{loc.address ? ` — ${loc.address}` : ''}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}
      </Modal>

      {/* Bulk Ügyfél / kapcsolattartó csere modal */}
      <Modal
        title={<><UserSwitchOutlined style={{ marginRight: 8 }} />Ügyfél / kapcsolattartó csere</>}
        open={bulkCustomerModalOpen}
        onCancel={() => setBulkCustomerModalOpen(false)}
        onOk={confirmBulkCustomerChange}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={bulkCustomerLoading}
        width={480}
        destroyOnClose
      >
        <div style={{ marginBottom: 4, color: '#888', fontSize: 12 }}>
          {Array.from(new Set(
            flattenedItems
              .filter((item: any) => bulkSelectedKeys.includes(item.uniqueId))
              .map((item: any) => item.rfq_id)
          )).length} kijelölt ajánlat kerül frissítésre.
        </div>
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Ügyfél" style={{ marginBottom: 12 }}>
            <Select
              showSearch
              allowClear
              placeholder="Ügyfél kiválasztása…"
              style={{ width: '100%' }}
              value={bulkCustomerCompanyId}
              onChange={handleBulkCustomerCompanyChange}
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={companies.map((c: any) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item label="Kapcsolattartók" style={{ marginBottom: 0 }}>
            <Select
              mode="multiple"
              allowClear
              placeholder={bulkCustomerCompanyId ? 'Kapcsolattartók kiválasztása…' : 'Előbb válasszon ügyfelet'}
              style={{ width: '100%' }}
              value={bulkCustomerContactIds}
              onChange={(vals) => setBulkCustomerContactIds(vals)}
              loading={bulkCustomerContactsLoading}
              disabled={!bulkCustomerCompanyId}
              optionFilterProp="label"
              options={bulkCustomerContacts.map((c: any) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={rfqBulkPrintModalOpen}
        title={<><PrinterOutlined style={{ marginRight: 8 }} />Munkalap nyomtatása</>}
        okText="Nyomtatás"
        cancelText="Mégsem"
        onOk={executeRfqBulkPrint}
        onCancel={() => setRfqBulkPrintModalOpen(false)}
        width={440}
      >
        <p style={{ marginBottom: 16 }}>
          <strong>{new Set(bulkSelectedKeys.map((k) => String(k).split('_')[0])).size}</strong> kijelölt ajánlat munkalapját nyomtatod ki.
        </p>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Nyomtató / mód:</div>
        <Select
          value={rfqBulkPrintMode}
          onChange={(v) => setRfqBulkPrintMode(v)}
          style={{ width: '100%' }}
          options={[
            {
              value: 'direct',
              label: (
                <span>
                  <PrinterOutlined style={{ marginRight: 6 }} />
                  Közvetlen nyomtatás — nyomtatóválasztó ablak nyílik meg minden munkalaphoz
                </span>
              ),
            },
            {
              value: 'preview',
              label: (
                <span>
                  <EyeOutlined style={{ marginRight: 6 }} />
                  Előnézet — PDF megnyitása új tabban (kézzel nyomtatható)
                </span>
              ),
            },
          ]}
        />
        {rfqBulkPrintMode === 'direct' && (
          <p style={{ marginTop: 12, color: '#6b7280', fontSize: 12 }}>
            Minden munkalaphoz megnyílik a böngésző nyomtatási párbeszédablaka, ahol kiválaszthatod a nyomtatót és a beállításokat.
          </p>
        )}
      </Modal>

      {/* Bulk project assignment modal */}
      <Modal
        open={bulkProjectModalOpen}
        title={<><FolderAddOutlined style={{ marginRight: 8 }} />Projekthez rendelés</>}
        okText="Mentés"
        cancelText="Mégsem"
        confirmLoading={bulkProjectLoading}
        onCancel={() => setBulkProjectModalOpen(false)}
        onOk={async () => {
          if (!bulkProjectId) { message.warning('Válassz projektet!'); return; }
          const rfqIds = Array.from(new Set(
            flattenedItems
              .filter((item: any) => bulkSelectedKeys.includes(item.uniqueId))
              .map((item: any) => item.rfq_id as number)
          ));
          if (rfqIds.length === 0) { message.warning('Nincs kijelölt tétel.'); return; }
          setBulkProjectLoading(true);
          try {
            await Promise.all(rfqIds.map(rfqId => salesService.setRfqProject(rfqId, bulkProjectId!)));
            message.success(`${rfqIds.length} ajánlat projekthez rendelve`);
            setBulkProjectModalOpen(false);
            loadData();
          } catch {
            message.error('Hiba a projekt hozzárendelés során');
          } finally {
            setBulkProjectLoading(false);
          }
        }}
        width={400}
      >
        <p style={{ marginBottom: 12 }}>
          <strong>{new Set(flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId)).map((item: any) => item.rfq_id)).size}</strong> kijelölt ajánlatot rendeled projekthez.
        </p>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Válassz projektet…"
          value={bulkProjectId}
          onChange={(v) => {
            if (!v) { setBulkProjectId(v); return; }
            const proj = (projects || []).find((p: any) => p.id === v);
            const selectedRfqItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
            const rfqCompanyIds = Array.from(new Set(selectedRfqItems.map((item: any) => item.company_id).filter(Boolean)));
            if (proj?.company && rfqCompanyIds.length > 0 && !rfqCompanyIds.every((cid: any) => cid === proj.company)) {
              message.warning(`A kiválasztott projekt más ügyfélhez tartozik (${proj.company_name || proj.company}). Kérlek válassz az ajánlat ügyfeléhez tartozó projektet!`);
              return;
            }
            setBulkProjectId(v);
          }}
          filterOption={(input, option) => {
            const text = String(option?.label || '');
            const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return norm(text).includes(norm(input));
          }}
          options={(projects || []).filter((p: any) => p.status === 'open').map((p: any) => { const co = p.company_name || ''; const coShort = co.length > 15 ? co.slice(0, 15) + '…' : co; return { value: p.id, label: co ? `${coShort} – ${p.name}` : p.name }; })}
        />
      </Modal>

    </div>
  );
};

export default RFQs;
