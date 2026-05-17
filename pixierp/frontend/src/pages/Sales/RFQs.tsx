import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import EnhancedTable from '../../components/EnhancedTable';
import type { ColumnsType } from 'antd/es/table';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Tooltip, Modal, Form, Input, DatePicker, Select, Row, Col, Divider, Upload, Checkbox, List, Grid, Drawer, Popover } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, EyeOutlined, SendOutlined, MailOutlined, EditOutlined, LockOutlined, UnlockOutlined, SearchOutlined, CopyOutlined, PlusCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, DeleteOutlined, FilterOutlined, CameraOutlined, PictureOutlined, UploadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
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
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { RFQCostsTable } from '../../components/Sales/RFQCostsTable';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import Demands from './Demands';
import { deepSearchMatch, normalizeTextForSearch } from '../../utils/searchUtils';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import MaterialNeedsTree from '../../components/Manufacturing/MaterialNeedsTree';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

const { useBreakpoint } = Grid;

// Ékezet-független + kis/nagybetű-független filter a Select komponensekhez
// (a default `optionFilterProp="label"` csak case-insensitive substring match-et csinál).
const stripHtml = (s: any): string => {
  if (s == null) return '';
  const str = String(s);
  if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = str;
      return tmp.textContent || tmp.innerText || '';
    } catch { /* fall through */ }
  }
  return str.replace(/<[^>]*>/g, '');
};

const accentInsensitiveLabelFilter = (input: string, option: any): boolean => {
  if (!input) return true;
  const label = (option?.label ?? option?.children ?? '').toString();
  return normalizeTextForSearch(label).includes(normalizeTextForSearch(input));
};

const { TextArea } = Input;

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
  const [error, setError] = useState<string | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
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
  const [sendOpenId, setSendOpenId] = useState<number | null>(null);
  const [sendForm] = Form.useForm();
  const [sendPreview, setSendPreview] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [partialOrderOpenId, setPartialOrderOpenId] = useState<number | null>(null);
  const [partialSelection, setPartialSelection] = useState<number[]>([]);
  const [partialLoading, setPartialLoading] = useState(false);
  const [partialDeadline, setPartialDeadline] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [orderAllOpenId, setOrderAllOpenId] = useState<number | null>(null);
  const [orderAllDeadline, setOrderAllDeadline] = useState<any>(null);
  const [orderAllLoading, setOrderAllLoading] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rfqs_status_filter');
      return saved ? JSON.parse(saved) : ['all_except_archived'];
    } catch {
      return ['all_except_archived'];
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
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const [partialOrderAllowed, setPartialOrderAllowed] = useState<boolean>(true);
  const [csvMode, setCsvMode] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [clientCompanyModalOpen, setClientCompanyModalOpen] = useState(false);
  const [clientContactModalOpen, setClientContactModalOpen] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const watchedCompanyId = Form.useWatch('company_id', form);
  const watchedContactIds = Form.useWatch('contact_ids', form);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);
  const [isItemsView, setIsItemsView] = useState(() => { const v = searchParams.get('view'); return v === null || v === '' || v === 'items'; });
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<React.Key[]>([]);
  const [bulkOrderLoading, setBulkOrderLoading] = useState(false);
  const [sendQueue, setSendQueue] = useState<number[]>([]);
  const isDemandView = searchParams.get('view') === 'demands';
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
  const [rfqItemStatusOverrides, setRfqItemStatusOverrides] = useState<Record<string, string>>({});
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
  useClipboardImagePaste(handleRfqRowPaste, expandedRfqKeys.length > 0);

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
          <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'rfq', id: rfqId }; }}>
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
                  <div style={{ fontSize: 12, color: '#666' }}>{r.product_code || r.material_code || r.manufacturing_product_code || r.service_code || '-'}</div>
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
                    <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'item', id: itemId }; }}>
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
            rowExpandable: (r: any) => !!(r.item_type === 'manufacturing' && r.manufacturing_product),
            expandedRowRender: (r: any) => (
              <div style={{ padding: '8px 0 8px 28px' }}>
                <ProductSubItemsTable productId={Number(r.manufacturing_product)} />
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
            defaultExpandAllRows: true,
          }}
        />
      </div>
    );
  };

  const exportCsv = () => {
    if (isItemsView) {
      const source = csvSelectedKeys.length > 0
        ? flattenedItems.filter((r: any) => csvSelectedKeys.includes(r.uniqueId))
        : flattenedItems;
      const rows = source.map((r: any) => ({
        'Dátum': r.issue_date ? dayjs(r.issue_date).format('YYYY-MM-DD') : '',
        'Ajánlat szám': r.rfq_number ?? '',
        'Tétel neve': r.product_name || r.manufacturing_product_name || r.service_name || r.name || '',
        'Leírás': r.product_description ?? '',
        'Belső leírás': r.internal_description ?? '',
        'Megjegyzés': r.description ?? '',
        'Ügyfél': r.company_name ?? '',
        'Nettó összeg': (Number(r.quantity || 0) * Number(r.net_unit_price || 0)).toFixed(2),
        'Státusz': r.status ?? '',
      }));
      if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
      const headers = Object.keys(rows[0]);
      const escape = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `arajanlatok_tetelek_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
      URL.revokeObjectURL(url);
      setCsvMode(false); setCsvSelectedKeys([]);
      return;
    }
    const rows = (csvSelectedKeys.length > 0 ? filtered.filter((r: any) => csvSelectedKeys.includes(r.id)) : filtered)
      .map((r: any) => ({
        'Szám': r.request_number ?? r.number ?? '',
        'Dátum': r.created_at ? dayjs(r.created_at).format('YYYY-MM-DD') : '',
        'Cég': r.company?.name ?? '',
        'Kapcsolattartók': (r.contacts || []).map((c: any) => c.name).filter(Boolean).join('; '),
        'Tárgy': r.title ?? '',
        'Projekt': r.project?.name ?? '',
        'Státusz': r.status ?? '',
        'Deviza': r.currency ?? '',
        'Nettó összeg': r.total_amount ?? '',
        'Rögzítő': r.created_by_name ?? '',
        'Határidő': r.deadline ? dayjs(r.deadline).format('YYYY-MM-DD') : '',
      }));
    if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `arajanlatok_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url);
    setCsvMode(false); setCsvSelectedKeys([]);
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
    const [rfqRes, projRes] = await Promise.all([
        salesService.getQuoteRequests(),
        manufacturingService.getProjects(),
      ]);
    const rfqRaw = (rfqRes.results ?? rfqRes) as any[];
    const rfqList = (rfqRaw || []);
    setRfqs(rfqList);
    setFiltered(rfqList);
    setProjects(projRes as any);
    } catch (e) {
      console.error(e);
      setError('Hiba történt az adatok betöltése során');
    } finally {
      setLoading(false);
    }
  };

  const creators = useMemo(() => {
    const names = rfqs.map(r => r.created_by_name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [rfqs]);

  // Save status filters to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('rfqs_status_filter', JSON.stringify(statusFilter));
      localStorage.setItem('rfqs_order_status_filter', JSON.stringify(orderStatusFilter));
    } catch {
      // Ignore localStorage errors
    }
  }, [statusFilter, orderStatusFilter]);

  useEffect(() => {
    let filtered = rfqs || [];
    
    // Status filter (multi-select support)
    const hasAllExceptArchived = statusFilter.includes('all_except_archived');
    const hasAll = statusFilter.includes('all');
    
    if (!hasAll && !hasAllExceptArchived && statusFilter.length === 0) {
      // If no filter selected, default to all_except_archived
      filtered = filtered.filter(r => r.status !== 'archived');
    } else if (hasAll) {
      // If 'all' is selected, show all
      filtered = filtered;
    } else if (hasAllExceptArchived && statusFilter.length === 1) {
      // Only all_except_archived selected
      filtered = filtered.filter(r => r.status !== 'archived');
    } else if (statusFilter.length > 0 && !hasAll && !hasAllExceptArchived) {
      // Specific statuses selected
      filtered = filtered.filter(r => statusFilter.includes(r.status));
    } else if (statusFilter.length > 0 && hasAllExceptArchived) {
      // all_except_archived + other specific statuses: show all non-archived that match the specific ones
      const otherStatuses = statusFilter.filter(s => s !== 'all_except_archived');
      filtered = filtered.filter(r => r.status !== 'archived' && (otherStatuses.length === 0 || otherStatuses.includes(r.status)));
    }

    // Order-status filter (only meaningful for ordered RFQs that expose effective_status)
    // Non-ordered RFQs are not affected by this filter — they stay visible.
    if (orderStatusFilter && orderStatusFilter.length > 0) {
      filtered = filtered.filter(r =>
        r.status !== 'ordered' || orderStatusFilter.includes(r.effective_status)
      );
    }

    // Creator filter
    if (creatorFilter) {
      filtered = filtered.filter(r => r.created_by_name === creatorFilter);
    }
    
    // Text search
    if (query?.trim()) {
      filtered = filtered.filter((rfq) => deepSearchMatch(query, rfq));
    }
    
    setFiltered(filtered);
  }, [query, rfqs, statusFilter, creatorFilter, orderStatusFilter]);

  const statusTag = (status: string) => {
    const color = {
      new: 'blue',
      in_progress: 'orange',
      quoted: 'cyan',
      accepted: 'green',
      rejected: 'red',
      expired: 'default',
      archived: 'default',
      ordered: 'purple',
    } as Record<string, any>;
    const text = {
      new: 'Új',
      in_progress: 'Folyamatban',
      quoted: 'Árazva',
      accepted: 'Elfogadva',
      rejected: 'Elutasítva',
      expired: 'Lejárt',
      archived: 'Archív',
      ordered: 'Megrendelve',
    } as Record<string, string>;
    return <Tag color={color[status] || 'default'}>{text[status] || status}</Tag>;
  };

  const columns = useMemo(() => ([
  { 
    title: 'Ajánlat', 
    key: 'main_info', 
    width: 230,
    sorter: (a: any, b: any) => (a.number || '').localeCompare(b.number || ''),
    render: (_: any, r: any) => {
      const items: any[] = r.items || [];
      const tooltipContent = items.length === 0 ? 'Nincsenek tételek' : (
        <div style={{ maxWidth: 320 }}>
          {items.map((it: any, idx: number) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
              <span style={{ flex: 1 }}>{it.product_name || it.manufacturing_product_name || it.service_name || it.name || it.description || `Tétel #${idx + 1}`}</span>
              <span style={{ whiteSpace: 'nowrap', opacity: 0.85 }}>{it.quantity} {it.quantity_unit || 'db'}</span>
            </div>
          ))}
        </div>
      );
      return (
        <Tooltip title={tooltipContent} placement="right" color="#1d2939">
          <div style={{ lineHeight: '1.3', cursor: 'default' }}>
            {r.title && <div style={{ fontWeight: 600 }}>{r.title}</div>}
            <div style={{ fontSize: '0.75em', color: '#888' }}>{r.number || r.request_number}</div>
          </div>
        </Tooltip>
      );
    }
  },
  { 
    title: 'Keltezés', 
    dataIndex: 'issue_date', 
    key: 'issue_date', 
    width: 100,
    responsive: ['lg'], 
    render: (d: string, r: any): React.ReactNode => (
      <div>
        <div>{d ? new Date(d).toLocaleDateString('hu-HU') : ''}</div>
        {r.created_by_name && (
          <div style={{ fontSize: '11px', color: '#888' }}>
            {r.created_by_name}
          </div>
        )}
      </div>
    ), 
    sorter: (a: any, b: any) => (a.issue_date || '').localeCompare(b.issue_date || '') 
  },
  {
    title: 'Ügyfél', key: 'customer_name', width: 160,
    sorter: (a: any, b: any) => {
      const aName = a.is_private ? (a.contact_names || '') : (a.company?.name || a.company_name || '');
      const bName = b.is_private ? (b.contact_names || '') : (b.company?.name || b.company_name || '');
      return aName.localeCompare(bName, 'hu');
    },
    render: (_: any, r: any): React.ReactNode => {
      // Company can come from r.company, r.company_name, or inferred from a contact's company
      const contactCompany = (r.contacts || []).find((c: any) => c.company_name || c.company?.name);
      const resolvedCompanyName = r.company?.name || r.company_name || contactCompany?.company_name || contactCompany?.company?.name;
      const isPrivate = !resolvedCompanyName;
      const primaryName = isPrivate
        ? (r.contact_names || (r.contacts || []).map((c: any) => c.name).join(', ') || 'Magánszemély')
        : resolvedCompanyName;
      const secondaryName = isPrivate
        ? null
        : (r.contact_names || (r.contacts || []).map((c: any) => c.name).join(', '));
      const tooltipText = isPrivate
        ? primaryName
        : [primaryName, secondaryName].filter(Boolean).join(' – ');
      return (
        <Tooltip title={tooltipText}>
          <div>
            <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: (isPrivate || secondaryName) ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{primaryName}</div>
            {isPrivate && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
            {secondaryName && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryName}</div>}
          </div>
        </Tooltip>
      );
    },
  },
    { 
      title: 'Nettó összeg', 
      key: 'total_net_amount', 
      width: 120,
      render: (_: any, r: any): React.ReactNode => {
        const amount = r.total_net_amount || 0;
        const currencySymbol = r.currency_symbol || 'Ft';
        return <span style={{ whiteSpace: 'nowrap' }}>{`${amount.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currencySymbol}`}</span>;
      },
      sorter: (a: any, b: any) => (a.total_net_amount || 0) - (b.total_net_amount || 0),
      align: 'right' as const
    },
    { title: 'Státusz', dataIndex: 'status', key: 'status', width: 140, render: (_: any, r: any) => {
        // When the RFQ is 'ordered', show the aggregated order-item status with optional '(részben)'.
        if (r.status === 'ordered' && r.effective_status && r.effective_status !== 'ordered') {
          const orderColors: Record<string, string> = {
            new: 'default',
            confirmed: 'purple',
            in_production: 'orange',
            ready: 'green',
            in_delivery: 'cyan',
            delivered: 'geekblue',
            invoiced: 'gold',
            cancelled: 'red',
          };
          return <Tag color={orderColors[r.effective_status] || 'purple'}>{r.effective_status_label || r.effective_status}</Tag>;
        }
        return statusTag(r.status);
      }, sorter: (a: any, b: any) => ((a.effective_status || a.status) || '').localeCompare(b.effective_status || b.status || '') },
    { title: 'Határidő', dataIndex: 'deadline', key: 'deadline', width: 100, responsive: ['md'], render: (d: string): React.ReactNode => new Date(d).toLocaleDateString('hu-HU'), sorter: (a: any, b: any) => (a.deadline || '').localeCompare(b.deadline || '') },
    {
      title: 'Műveletek', key: 'actions', width: 270, render: (record: any): React.ReactNode => (
        <Space size="small" wrap>
          <Tooltip title="Szerkesztés">
            <Button icon={<EditOutlined style={{ color: '#595959' }} />} size="small" style={{ background: '#f5f5f5', borderColor: '#d9d9d9' }} onClick={() => navigate(`/sales/rfqs/${record.id}`)} />
          </Tooltip>
          <Tooltip title="Kiküldés e-mailben">
            <Button icon={<MailOutlined style={{ color: '#b45309' }} />} size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }} onClick={async () => {
              setSendOpenId(record.id);
              setSendPreview(null);
              
              // Load email templates and signatures
              let templates: any[] = [];
              let sigs: any[] = [];
              try {
                const [templatesRes, sigsRes] = await Promise.all([
                  settingsService.getEmailTemplates(),
                  settingsService.getSignatures()
                ]);
                templates = Array.isArray(templatesRes) ? templatesRes : (templatesRes?.results ?? []);
                sigs = Array.isArray(sigsRes) ? sigsRes : (sigsRes?.results ?? []);
                setEmailTemplates(templates);
                setSignatures(sigs);
              } catch {}
              
              // Auto-fill contact emails
              const contactEmails = (record.contacts || []).map((c: any) => c.email).filter(Boolean).join(', ');
              
              // Load user preferences for default signature
              let signatureKey = '';
              let userPrefs: any = null;
              try {
                const prefs = await settingsService.getUserPreferences();
                userPrefs = prefs;
                if (prefs && prefs.default_signature_key) {
                  signatureKey = prefs.default_signature_key;
                }
              } catch (err) {
                // Ignore errors - user may not have preferences set
              }
              
              // If no default signature set, use the first available one
              if (!signatureKey && sigs.length > 0) {
                signatureKey = sigs[0].key;
              }
              
              // Load default template and populate subject, body, cc, reply_to
              const defaultTemplate = templates.find((t: any) => t.key === 'rfq_send');
              let subject = '';
              let body = '';
              let cc = '';
              let replyTo = '';
              
              if (defaultTemplate) {
                // Build context for template variables
                subject = defaultTemplate.subject_template || '';
                body = defaultTemplate.body_template || '';
                cc = defaultTemplate.default_cc || '';
                replyTo = defaultTemplate.default_reply_to || '';
                
                // Replace variables
                const contactNames = (record.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                subject = subject.replace('{rfq_number}', record.number || record.request_number || '');
                subject = subject.replace('{rfq_title}', record.title || '');
                subject = subject.replace('{company_name}', record.company?.name || '');
                subject = subject.replace('{contact_names}', contactNames);
                
                body = body.replace('{rfq_number}', record.number || record.request_number || '');
                body = body.replace('{rfq_title}', record.title || '');
                body = body.replace('{company_name}', record.company?.name || '');
                body = body.replace('{contact_names}', contactNames);
                body = body.replace('{public_order_url}', record.public_order_url || '');
              }
              
              // Append signature to body if signature is selected
              if (signatureKey) {
                const signature = sigs.find((s: any) => s.key === signatureKey);
                if (signature && signature.body_html) {
                  body = body + '\n\n' + signature.body_html;
                }
              }

              // Replace user variables in body (including signature)
              if (userPrefs) {
                  const userName = userPrefs.name || [(userPrefs.first_name || ''), (userPrefs.last_name || '')].join(' ').trim();
                  body = body.replace(/{user_name}/g, userName);
                  body = body.replace(/{user_email}/g, userPrefs.email || '');
                  body = body.replace(/{user_phonenumber}/g, userPrefs.phone_number || '');
              }
              
              sendForm.setFieldsValue({ 
                template_key: 'rfq_send',
                to: contactEmails || '',
                cc: cc,
                reply_to: replyTo,
                signature_key: signatureKey,
                subject: subject,
                body: body
              });
            }} />
          </Tooltip>
          {record.status !== 'in_progress' && (
            <Tooltip title="Nyitás">
              <Button icon={<UnlockOutlined style={{ color: '#2d7d46' }} />} size="small" style={{ background: '#eaf6ee', borderColor: '#b7dfc3' }} onClick={async () => { await salesService.setQuoteRequestStatus(record.id, 'in_progress'); message.success('Megnyitva'); loadData(); }} />
            </Tooltip>
          )}
          {record.status !== 'quoted' && (
            <Tooltip title="Zárás (Árazva)">
              <Button icon={<LockOutlined style={{ color: '#cf1322' }} />} size="small" style={{ background: '#fff1f0', borderColor: '#ffa39e' }} onClick={async () => { await salesService.setQuoteRequestStatus(record.id, 'quoted'); message.success('Lezárva'); loadData(); }} />
            </Tooltip>
          )}
          <Tooltip title="Másolás">
            <Button icon={<CopyOutlined style={{ color: '#5c3bc2' }} />} size="small" style={{ background: '#f5f0ff', borderColor: '#d3adf7' }} onClick={async () => {
              try {
                const res = await salesService.copyQuoteRequest(record.id);
                message.success(`Árajánlat másolva: ${res.number}`);
                navigate(`/sales/rfqs/${res.id}`);
              } catch (e: any) {
                message.error(e?.response?.data?.error || 'Nem sikerült másolni');
              }
            }} />
          </Tooltip>

        </Space>
      )
    }
  ]), [navigate]);

  const flattenedItems = useMemo(() => {
    if (!isItemsView) return [];
    const res: any[] = [];
    filtered.forEach((rfq: any) => {
      const allItems: any[] = rfq.items || [];
      const rfqCompanyName = (() => {
        if (rfq.company?.name) return rfq.company.name;
        if (rfq.company_name) return rfq.company_name;
        const contactCo = (rfq.contacts || []).find((c: any) => c.company?.name || c.company_name);
        return contactCo?.company?.name || contactCo?.company_name || '';
      })();
      const rfqContactNames = rfq.contact_names || (rfq.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
      const rfqIsPrivate = !rfq.company?.name && !rfq.company_name && !(rfq.contacts || []).some((c: any) => c.company?.name || c.company_name);

      const enrich = (item: any, idx: number) => {
        const itemStatus = rfq.status === 'ordered'
          ? (item.is_ordered ? (rfq.effective_status || 'ordered') : 'quoted')
          : rfq.status;
        return {
          ...item,
          uniqueId: `${rfq.id}_${item.id ?? idx}`,
          rfq_number: rfq.number || rfq.request_number,
          rfq_id: rfq.id,
          rfq_title: rfq.title,
          company_name: rfqCompanyName,
          contact_names: rfqContactNames,
          is_private: rfqIsPrivate,
          issue_date: rfq.issue_date,
          deadline: rfq.deadline,
          project_name: rfq.project?.name || rfq.project_name || '',
          status: itemStatus,
          effective_status: rfq.effective_status,
          effective_status_label: rfq.effective_status_label,
          currency_symbol: rfq.currency_symbol || 'Ft',
          created_by_name: rfq.created_by_name,
        };
      };

      // Build tree: only root items at top level, children nested
      const itemById = new Map<number, any>();
      allItems.forEach((item: any, idx: number) => {
        itemById.set(item.id, { enriched: enrich(item, idx), childrenList: [] as any[] });
      });
      allItems.forEach((item: any) => {
        if (item.parent && itemById.has(item.parent)) {
          const childEnriched = itemById.get(item.id)!.enriched;
          itemById.get(item.parent)!.childrenList.push(childEnriched);
        }
      });
      allItems.filter((item: any) => !item.parent).forEach((item: any) => {
        const entry = itemById.get(item.id);
        if (!entry) return;
        const node = { ...entry.enriched };
        if (entry.childrenList.length > 0) node.sub_items = entry.childrenList;
        res.push(node);
      });
    });
    return res;
  }, [filtered, isItemsView]);

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
            <ProductSubItemsTable productId={Number(r.manufacturing_product)} showNotesAndAttachments defaultExpandAllRows />
            <MaterialNeedsTree
              manufacturingProductId={Number(r.manufacturing_product)}
              quantity={Number(r.quantity || 1)}
              sourceType="rfq"
              sourceId={Number(r.rfq_id || 0)}
              sourceNumber={r.rfq_number || String(r.rfq_id || '')}
              sourceItemName={r.manufacturing_product_name || r.product_name || r.name || ''}
            />
          </>
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
          <div onMouseEnter={() => { lastPasteTargetRef.current = { type: 'item', id: itemId }; }}>
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

  const itemsColumns = useMemo((): ColumnsType<any> => ([
    {
      title: 'Dátum', key: 'issue_date', width: 100,
      sorter: (a: any, b: any) => (a.issue_date || '').localeCompare(b.issue_date || ''),
      render: (_: any, r: any) => r.issue_date ? dayjs(r.issue_date).format('YYYY-MM-DD') : '',
    },
    {
      title: 'Ajánlat szám', key: 'rfq_number', width: 140,
      sorter: (a: any, b: any) => (a.rfq_number || '').localeCompare(b.rfq_number || ''),
      render: (_: any, r: any) => (
        <a style={{ color: '#1677ff', fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/sales/rfqs/${r.rfq_id}`)}>
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
      sorter: (a: any, b: any) => Number(a.net_unit_price || 0) - Number(b.net_unit_price || 0),
      render: (_: any, r: any) => r.net_unit_price
        ? `${Number(r.net_unit_price).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r.currency_symbol || 'Ft'}`
        : '—',
    },
    {
      title: 'Leírás', dataIndex: 'product_description', key: 'product_description', width: 200,
      sorter: (a: any, b: any) => (a.product_description || '').localeCompare(b.product_description || '', 'hu'),
      render: (t: string) => t ? (<Tooltip title={t} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#555' }}>{t}</div></Tooltip>) : null,
    },
    {
      title: 'Belső leírás', dataIndex: 'internal_description', key: 'internal_description', width: 180,
      sorter: (a: any, b: any) => (a.internal_description || '').localeCompare(b.internal_description || '', 'hu'),
      render: (t: string) => t ? (<Tooltip title={t} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#844' }}>{t}</div></Tooltip>) : null,
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
      sorter: (a: any, b: any) => Number(a.discounted_net_total || a.net_total || 0) - Number(b.discounted_net_total || b.net_total || 0),
      render: (_: any, r: any) => {
        const total = Number(r.discounted_net_total || r.net_total || (Number(r.quantity || 0) * Number(r.net_unit_price || 0)));
        return `${total.toLocaleString('hu-HU')} ${r.currency_symbol || 'Ft'}`;
      },
    },
    {
      title: 'Státusz', key: 'item_status', width: 150,
      sorter: (a: any, b: any) => (rfqItemStatusOverrides[a.uniqueId] ?? a.item_status ?? 'new').localeCompare(rfqItemStatusOverrides[b.uniqueId] ?? b.item_status ?? 'new'),
      render: (_: any, r: any) => {
        const cur = rfqItemStatusOverrides[r.uniqueId] ?? r.item_status ?? 'new';
        const itemStatusColors: Record<string, string> = {
          new: 'default', in_progress: 'processing', quoted: 'orange',
          accepted: 'success', rejected: 'error', ordered: 'purple', archived: 'default',
        };
        const itemStatusLabels: Record<string, string> = {
          new: 'Új', in_progress: 'Feldolgozás', quoted: 'Ajánlat kész',
          accepted: 'Elfogadva', rejected: 'Elutasítva', ordered: 'Megrendelve', archived: 'Archív',
        };
        const popoverContent = (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.keys(itemStatusLabels).map(s => (
              <Button
                key={s}
                size="small"
                type={s === cur ? 'primary' : 'text'}
                disabled={s === cur}
                style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                onClick={async () => {
                  const prev = cur;
                  setRfqItemStatusOverrides(o => ({ ...o, [r.uniqueId]: s }));
                  try {
                    await salesService.updateQuoteRequestItem(r.id, { item_status: s } as any);
                  } catch {
                    message.error('Státusz frissítése sikertelen');
                    setRfqItemStatusOverrides(o => ({ ...o, [r.uniqueId]: prev }));
                  }
                }}
              >
                {itemStatusLabels[s]}
              </Button>
            ))}
          </div>
        );
        return (
          <Popover content={popoverContent} title="Státusz váltás" trigger="click" overlayInnerStyle={{ padding: '6px 8px' }} getPopupContainer={() => document.body} zIndex={9999}>
            <Tag color={itemStatusColors[cur]} style={{ cursor: 'pointer' }}>{itemStatusLabels[cur] || cur}</Tag>
          </Popover>
        );
      },
    },
    {
      title: 'Műveletek', key: 'actions', width: 200,
      render: (_: any, r: any) => (
        <Space size="small" wrap>
          <Tooltip title="Megnyitás">
            <Button icon={<EditOutlined style={{ color: '#595959' }} />} size="small" style={{ background: '#f5f5f5', borderColor: '#d9d9d9' }} onClick={() => navigate(`/sales/rfqs/${r.rfq_id}`)} />
          </Tooltip>
          <Tooltip title="Küldés">
            <Button icon={<SendOutlined style={{ color: '#1677ff' }} />} size="small" style={{ background: '#e6f4ff', borderColor: '#91caff' }} onClick={(e) => { e.stopPropagation(); setSendOpenId(r.rfq_id); }} />
          </Tooltip>
          <Tooltip title="Másolás">
            <Button icon={<CopyOutlined style={{ color: '#5c3bc2' }} />} size="small" style={{ background: '#f5f0ff', borderColor: '#d3adf7' }} onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await salesService.copyQuoteRequest(r.rfq_id);
                message.success(`Árajánlat másolva: ${res.number}`);
                navigate(`/sales/rfqs/${res.id}`);
              } catch (ex: any) {
                message.error(ex?.response?.data?.error || 'Nem sikerült másolni');
              }
            }} />
          </Tooltip>
          {r.status !== 'in_progress' && (
            <Tooltip title="Nyitás">
              <Button icon={<UnlockOutlined style={{ color: '#2d7d46' }} />} size="small" style={{ background: '#eaf6ee', borderColor: '#b7dfc3' }} onClick={async (e) => { e.stopPropagation(); await salesService.setQuoteRequestStatus(r.rfq_id, 'in_progress'); message.success('Megnyitva'); loadData(); }} />
            </Tooltip>
          )}
          {r.status !== 'quoted' && (
            <Tooltip title="Zárás (Árazva)">
              <Button icon={<LockOutlined style={{ color: '#cf1322' }} />} size="small" style={{ background: '#fff1f0', borderColor: '#ffa39e' }} onClick={async (e) => { e.stopPropagation(); await salesService.setQuoteRequestStatus(r.rfq_id, 'quoted'); message.success('Lezárva'); loadData(); }} />
            </Tooltip>
          )}

        </Space>
      ),
    },
  ]), [navigate, statusTag, loadData, setSendOpenId, rfqItemStatusOverrides]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);

      // Helper: resolve item display name
      const itemDisplayName = (it: any) =>
        it.name || it.product_name || it.manufacturing_product_name || it.service_name || '';

      // Common header update payload (company, contacts, project, currency…)
      const baseUpdateData: any = {
        contact_ids: values.contact_ids || [],
        currency_code: currency,
        project_id: values.project_id,
        internal_description: values.internal_description || '',
      };
      if (values.company_id === 'private') {
        baseUpdateData.company_id = null;
      } else if (values.company_id) {
        baseUpdateData.company_id = values.company_id;
      }

      // Helper: add one item to a given RFQ id
      const addItemToRfq = async (rfqId: number, it: any) => {
        if (it.item_type === 'product') {
          const createdItem = await salesService.addRfqProductItem(rfqId, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount, it.ref_id);
          if (createdItem?.id && it.files?.length) {
            for (const f of it.files) {
              const key = (f as any)?.uid || (f as any)?.name;
              const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
              try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
            }
          }
        } else if (it.item_type === 'manufacturing') {
          let manuRefId = it.ref_id;
          if ((it as any).pendingManuPayload && it.ref_id < 0) {
            try {
              const { _costItemsState: _cs, _currency: _cur, ...manuPayload } = (it as any).pendingManuPayload;
              const createdProduct = await manufacturingService.createProduct(manuPayload);
              manuRefId = createdProduct.id;
            } catch {
              message.error(`Egyedi gyártás létrehozása sikertelen: ${it.name}`);
              return;
            }
          }
          const createdItem = await salesService.addRfqManufacturingItem(rfqId, manuRefId, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
          if (createdItem?.id && it.files?.length) {
            for (const f of it.files) {
              const key = (f as any)?.uid || (f as any)?.name;
              const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
              try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
            }
          }
        } else {
          const createdItem = await salesService.addRfqServiceItem(rfqId, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
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

  const openCreate = async () => {
    // Automatikus kitöltés az aktuális felhasználóval
    const userName = user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '';
    setCurrentUserName(userName);
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
    
    setCreateOpen(true);

    // Restore draft if this is a page-refresh reopen
    try {
      const raw = sessionStorage.getItem('rfq_create_draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.formValues) {
          const fv = { ...draft.formValues };
          if (fv.issue_date) fv.issue_date = dayjs(fv.issue_date);
          if (fv.deadline) fv.deadline = dayjs(fv.deadline);
          setPendingFormValues(fv);
        }
        if (Array.isArray(draft.newItems) && draft.newItems.length > 0) setNewItems(draft.newItems);
        if (draft.currency) setCurrency(draft.currency);
        if (Array.isArray(draft.companies) && draft.companies.length > 0) setCompanies(draft.companies);
        if (Array.isArray(draft.contacts) && draft.contacts.length > 0) setContacts(draft.contacts);
      }
    } catch {}

    // Defer form.setFieldsValue until after the modal renders (via useEffect)
    if (pendingCompanyId || pendingContactId) {
      const vals: Record<string, any> = {};
      if (pendingCompanyId) vals.company_id = pendingCompanyId;
      if (pendingContactId) vals.contact_ids = [pendingContactId];
      setPendingFormValues(vals);
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
    } catch {}
  };

  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

  // Auto-save draft when items change
  useEffect(() => {
    if (createOpen) saveDraft();
  }, [newItems, createOpen]); // eslint-disable-line

  useEffect(() => {
    if (searchParams.get('create') === 'true' && !loading && !createOpen) {
       openCreate();
    }
  }, [searchParams, loading]); // eslint-disable-line

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
          setCreateOpen(false);
          form.resetFields();
          clearParams();
        },
      });
    } else {
      clearDraft();
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
    Modal.confirm({
      title: 'Gyártásba küldés',
      content: `Biztosan gyártásba küldi a kijelölt ${selectedItems.length} tételt (${rfqIds.length} ajánlat)?`,
      okText: 'Igen, gyártásba küld',
      cancelText: 'Mégse',
      onOk: async () => {
        setBulkOrderLoading(true);
        let successCount = 0;
        for (const rfqId of rfqIds) {
          try {
            await salesService.orderAllFromRfq(rfqId, undefined);
            successCount++;
          } catch (e: any) {
            message.error(`Hiba a megrendelésnél (QR #${rfqId}): ${e?.response?.data?.error || e.message}`);
          }
        }
        setBulkOrderLoading(false);
        setBulkSelectedKeys([]);
        if (successCount > 0) {
          message.success(`${successCount} megrendelés létrehozva`);
          loadData();
          setTimeout(() => navigate('/sales/customer-orders'), 1200);
        }
      },
    });
  };

  const handleBulkSendEmail = () => {
    const selectedItems = flattenedItems.filter((item: any) => bulkSelectedKeys.includes(item.uniqueId));
    const rfqIds = Array.from(new Set(selectedItems.map((item: any) => item.rfq_id as number)));
    if (!rfqIds.length) return;
    const [first, ...rest] = rfqIds;
    setSendQueue(rest);
    setSendOpenId(first);
    sendForm.resetFields();
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (isDemandView) {
    return (
      <div>
        <div style={{ marginBottom: 12, paddingLeft: 4 }}>
          <div style={{ display: 'inline-flex', background: '#e6e8ec', borderRadius: 999, padding: 3, gap: 0 }}>
            <div
              onClick={() => { setIsItemsView(false); setBulkSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('view', 'quotes'); return p; }, { replace: true }); }}
              style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: 'transparent', color: '#666', userSelect: 'none' }}
            >Árajánlatok</div>
            <div
              onClick={() => { setIsItemsView(true); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('view', 'items'); return p; }, { replace: true }); }}
              style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: 'transparent', color: '#666', userSelect: 'none' }}
            >Tételek</div>
            <div
              style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: '#1677ff', color: '#fff', boxShadow: '0 1px 4px rgba(22,119,255,0.25)', userSelect: 'none' }}
            >Igények</div>
          </div>
        </div>
        <Demands />
      </div>
    );
  }

  return (
    <div>
      <Card
        title="Árajánlatok"
        extra={
            <Space wrap className="rfqs-toolbar-actions pixi-unified-card-actions">
              <div style={{ display: 'inline-flex', background: '#e6e8ec', borderRadius: 999, padding: 3, gap: 0 }}>
                <div
                  onClick={() => { setIsItemsView(false); setCsvSelectedKeys([]); setBulkSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('view', 'quotes'); return p; }, { replace: true }); }}
                  style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: !isItemsView ? '#ffffff' : 'transparent', color: !isItemsView ? '#1677ff' : '#666', boxShadow: !isItemsView ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', userSelect: 'none' }}
                >Árajánlatok</div>
                <div
                  onClick={() => { setIsItemsView(true); setCsvSelectedKeys([]); setBulkSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('view'); return p; }, { replace: true }); }}
                  style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: isItemsView ? '#1677ff' : 'transparent', color: isItemsView ? '#ffffff' : '#666', boxShadow: isItemsView ? '0 1px 4px rgba(22,119,255,0.25)' : 'none', userSelect: 'none' }}
                >Tételek</div>
                <div
                  onClick={() => { setIsItemsView(false); setCsvSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('view', 'demands'); return p; }, { replace: true }); }}
                  style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: 'transparent', color: '#666', userSelect: 'none' }}
                >Igények</div>
              </div>
              {csvMode ? (
                <Space size="small">
                  <span style={{ fontSize: 13, color: '#666' }}>{csvSelectedKeys.length > 0 ? `${csvSelectedKeys.length} kijelölve` : 'Minden látható'}</span>
                  <Button type="primary" icon={<FileTextOutlined />} size="small" onClick={exportCsv}>CSV letöltés</Button>
                  <Button size="small" onClick={() => { setCsvMode(false); setCsvSelectedKeys([]); }}>Mégse</Button>
                </Space>
              ) : (
                <Tooltip title="CSV export"><Button icon={<FileTextOutlined />} onClick={() => { setCsvMode(true); setCsvSelectedKeys([]); }} /></Tooltip>
              )}
              {/* Desktop: inline filters */}
              {!isMobile && (
                <>
                  <Select
                    className="rfqs-status-select"
                    mode="multiple"
                    placeholder="Státusz szűrő"
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value)}
                    style={{ width: 200 }}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                  >
                    <Select.Option value="all">Mind</Select.Option>
                    <Select.Option value="all_except_archived">Mind (aktív)</Select.Option>
                    <Select.Option value="new">Új</Select.Option>
                    <Select.Option value="quoted">Árazva</Select.Option>
                    <Select.Option value="rejected">Elutasítva</Select.Option>
                    <Select.Option value="accepted">Elfogadva</Select.Option>
                    <Select.Option value="ordered">Megrendelve</Select.Option>
                    <Select.Option value="archived">Archív</Select.Option>
                  </Select>
                  <Select
                    mode="multiple"
                    placeholder="Megrendelési státusz szűrő"
                    style={{ width: 200 }}
                    value={orderStatusFilter}
                    onChange={(v) => setOrderStatusFilter(v)}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                  >
                    <Select.Option value="new">Új</Select.Option>
                    <Select.Option value="confirmed">Megerősítve</Select.Option>
                    <Select.Option value="in_production">Gyártásban</Select.Option>
                    <Select.Option value="ready">Kész</Select.Option>
                    <Select.Option value="in_delivery">Szállítás alatt</Select.Option>
                    <Select.Option value="delivered">Kiszállítva</Select.Option>
                    <Select.Option value="invoiced">Kiszámlázva</Select.Option>
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
                </>
              )}
              {/* Mobile: filter button */}
              {isMobile && (
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => setFilterDrawerOpen(true)}
                  type={statusFilter.length > 0 || orderStatusFilter.length > 0 || creatorFilter ? 'primary' : 'default'}
                >
                  Szűrők{(statusFilter.length + orderStatusFilter.length + (creatorFilter ? 1 : 0)) > 0
                    ? ` (${statusFilter.length + orderStatusFilter.length + (creatorFilter ? 1 : 0)})`
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
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value)}
                    style={{ width: '100%' }}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                  >
                    <Select.Option value="all">Mind</Select.Option>
                    <Select.Option value="all_except_archived">Mind (aktív)</Select.Option>
                    <Select.Option value="new">Új</Select.Option>
                    <Select.Option value="quoted">Árazva</Select.Option>
                    <Select.Option value="rejected">Elutasítva</Select.Option>
                    <Select.Option value="accepted">Elfogadva</Select.Option>
                    <Select.Option value="ordered">Megrendelve</Select.Option>
                    <Select.Option value="archived">Archív</Select.Option>
                  </Select>
                  <Select
                    mode="multiple"
                    placeholder="Megrendelési státusz szűrő"
                    style={{ width: '100%' }}
                    value={orderStatusFilter}
                    onChange={(v) => setOrderStatusFilter(v)}
                    popupMatchSelectWidth={false}
                    maxTagCount="responsive"
                  >
                    <Select.Option value="new">Új</Select.Option>
                    <Select.Option value="confirmed">Megerősítve</Select.Option>
                    <Select.Option value="in_production">Gyártásban</Select.Option>
                    <Select.Option value="ready">Kész</Select.Option>
                    <Select.Option value="in_delivery">Szállítás alatt</Select.Option>
                    <Select.Option value="delivered">Kiszállítva</Select.Option>
                    <Select.Option value="invoiced">Kiszámlázva</Select.Option>
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
                  <Button block onClick={() => { setStatusFilter(['all_except_archived']); setOrderStatusFilter([]); setCreatorFilter(null); }}>Szűrők törlése</Button>
                </Space>
              </Drawer>
            </Space>
        }
      >
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        
        {isItemsView && bulkSelectedKeys.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#555' }}>{bulkSelectedKeys.length} tétel kijelölve</span>
            <Button type="primary" size="small" loading={bulkOrderLoading} onClick={handleBulkOrder}>Gyártásba küld</Button>
            <Button size="small" onClick={handleBulkSendEmail}>Árajánlat küldés</Button>
            <Button size="small" onClick={() => setBulkSelectedKeys([])}>Kijelölés törlése</Button>
          </div>
        )}

        <EnhancedTable key={isItemsView ? 'rfqs-items' : 'rfqs'} tableKey={isItemsView ? 'rfqs-items' : 'rfqs'} searchValue={query} onSearchChange={setQuery} searchPlaceholder="Keresés…" columns={isItemsView ? itemsColumns as any : columns as any} dataSource={isItemsView ? flattenedItems : filtered} rowKey={isItemsView ? 'uniqueId' : 'id'} pagination={{ pageSize: 10 }} size="small" cardBreakpoint={750} sticky={isItemsView ? { offsetScroll: 0 } : undefined} className={isItemsView ? 'rfq-items-table' : undefined} onRow={isItemsView ? (r: any) => ({ onDoubleClick: () => navigate(`/sales/rfqs/${r.rfq_id}`), style: { cursor: 'pointer' } }) : undefined} rowSelection={csvMode ? { selectedRowKeys: csvSelectedKeys, onChange: (keys) => setCsvSelectedKeys(keys), columnWidth: 40 } : (isItemsView && !csvMode ? { selectedRowKeys: bulkSelectedKeys, onChange: (keys) => setBulkSelectedKeys(keys), columnWidth: 21 } : undefined)} expandable={isItemsView ? {
          columnWidth: 24,
          rowExpandable: (r: any) => (r.sub_items?.length > 0) || (r.item_type === 'manufacturing' && !!r.manufacturing_product),
          expandedRowRender: renderExpandedItemRow,
        } : {
          expandedRowKeys: expandedRfqKeys,
          onExpand: (expanded: boolean, record: any) => {
            if (expanded) {
              setExpandedRfqKeys(prev => Array.from(new Set([...prev, record.id])));
              loadRfqExpandedItems(record);
            } else {
              setExpandedRfqKeys(prev => prev.filter((k) => k !== record.id));
            }
          },
          expandedRowRender: renderExpandedRfqRow,
          rowExpandable: (record: any) => {
            const count = Array.isArray(record?.items) ? record.items.length : 0;
            const attCount = Array.isArray(record?.attachments) ? record.attachments.length : 0;
            return count > 0 || attCount > 0;
          },
        }} />
      </Card>
      <Modal 
        title={`Ajánlat kérő kiküldése: ${(() => {
            const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
            const contactNames = (rec?.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
            return rec ? `${rec.request_number || rec.number || ''} (${rec.company?.name || ''}${contactNames ? ' - ' + contactNames : ''})` : '';
        })()}`}
        open={!!sendOpenId} 
        width={800}
        onCancel={() => { setSendOpenId(null); setSendQueue([]); setBulkSelectedKeys([]); }}
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
                      ...(v.body ? { body: v.body } : {}) 
                  });
                  setSendPreview(p);
                } catch {
                  message.error('Előnézet nem elérhető');
                }
             }}>Előnézet</Button>,
             <Button key="cancel" onClick={() => setSendOpenId(null)}>Mégse</Button>,
             <Button key="send" type="primary" icon={<SendOutlined />} onClick={async () => {
                const v = await sendForm.validateFields();
                if (!sendOpenId) return;
                try {
                  await salesService.sendQuoteRequestEmail(sendOpenId, v);
                  if (sendQueue.length > 0) {
                    const [next, ...rest] = sendQueue;
                    setSendQueue(rest);
                    setSendOpenId(next);
                    sendForm.resetFields();
                    message.success(`E-mail elküldve. Következő: ${rest.length + 1} db maradt.`);
                  } else {
                    message.success('E-mail elküldve');
                    setSendOpenId(null);
                    setSendQueue([]);
                    setBulkSelectedKeys([]);
                  }
                } catch {
                  message.error('Nem sikerült elküldeni az e-mailt');
                }
             }}>Küldés{sendQueue.length > 0 ? ` (${sendQueue.length + 1} db)` : ''}</Button>
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
                 ...(allValues.body ? { body: allValues.body } : {}) 
               }); 
               setSendPreview(p); 
             } catch {}
        }
      }}>
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
                        body = body.replace(/{public_order_url}/g, rec.public_order_url || '');
                        
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
                      templateBody = templateBody.replace('{public_order_url}', rec.public_order_url || '');
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
            const url = rec?.public_order_url;
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
        okText="Létrehozás"
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
                <Form.Item label="Ajánlatszám" style={{ marginBottom: 6 }}>
                  <Input value={nextNumber || ''} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Rögzítette" style={{ marginBottom: 6 }}>
                  <Input value={currentUserName || ''} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Keltezés" name="issue_date" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} onChange={onIssueDateChange} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Határidő" name="deadline" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} />
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
                    {companies.map((c: any) => (
                      <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                    ))}
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
                    allowClear 
                    showSearch 
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 190px)' }}
                    popupMatchSelectWidth={false}
                    dropdownStyle={{ minWidth: 200, maxWidth: 'calc(100vw - 32px)' }}
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
                    onFocus={async () => {
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
                    {companies.map((c: any) => (
                      <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                    ))}
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
                    allowClear 
                    showSearch 
                    optionFilterProp="label"
                    filterOption={accentInsensitiveLabelFilter}
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 96px)' }}
                    popupMatchSelectWidth={false}
                    dropdownStyle={{ minWidth: 200, maxWidth: 'calc(100vw - 32px)' }}
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
                  <Select allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet">
                    {(projects || []).map((p: any) => (
                      <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditIdx(null); setSelectorType('manufacturing'); setSelectorOpen(true); }}>Tétel hozzáadása</Button>
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
                setNewItems((prev) => [...prev, { ...it }]);
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
                manufacturing_product_code: it.item_type === 'manufacturing' ? it.code : undefined,
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
        </Form>
      </Modal>

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
            code: (newItems[editIdx] as any).product_code || (newItems[editIdx] as any).code || (newItems[editIdx] as any).manufacturing_product?.code || (newItems[editIdx].item_type === 'manufacturing' ? 'EGYEDI' : undefined)
        } : undefined) : undefined}
        initialManuPayload={editIdx !== null && newItems[editIdx]?.item_type === 'manufacturing' ? (newItems[editIdx] as any).pendingManuPayload : undefined}
        initialValues={editIdx !== null ? (newItems[editIdx] ? {
          quantity: Number(newItems[editIdx].quantity || 1),
          unit: newItems[editIdx].unit,
          net_unit_price: Number(newItems[editIdx].net_unit_price || 0),
          vat_rate: Number(newItems[editIdx].vat_rate || 27),
          description: newItems[editIdx].description,
          discount_percent: Number((newItems[editIdx] as any).discount_percent || 0),
          discount_amount: Number((newItems[editIdx] as any).discount_amount || 0),
        } : undefined) : undefined}
      />
      <AttachmentPreviewModal
        open={rfqAttPreviewOpen}
        title={rfqAttPreviewTitle}
        url={rfqAttPreviewUrl}
        onClose={() => { setRfqAttPreviewOpen(false); setRfqAttPreviewUrl(null); setRfqAttPreviewTitle(''); }}
      />
    </div>
  );
};

export default RFQs;
