import React, { useEffect, useMemo, useState } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import type { ColumnsType } from 'antd/es/table';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Tooltip, Modal, Form, Input, DatePicker, Select, Row, Col, Divider, Upload, Checkbox, List } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, EyeOutlined, SendOutlined, MailOutlined, EditOutlined, LockOutlined, UnlockOutlined, SearchOutlined, CopyOutlined, PlusCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom'; // Add useSearchParams
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
import { deepSearchMatch } from '../../utils/searchUtils';

const { TextArea } = Input;

const RFQs: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
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
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all_except_archived');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string | undefined>(undefined);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const [partialOrderAllowed, setPartialOrderAllowed] = useState<boolean>(true);
  const [csvMode, setCsvMode] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);
  const [isItemsView, setIsItemsView] = useState(() => searchParams.get('view') === 'items');
  const isDemandView = searchParams.get('view') === 'demands';

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

  useEffect(() => {
    let filtered = rfqs || [];
    
    // Status filter
    if (statusFilter === 'all_except_archived') {
      filtered = filtered.filter(r => r.status !== 'archived');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Order-status filter (only meaningful for ordered RFQs that expose effective_status)
    if (orderStatusFilter) {
      filtered = filtered.filter(r => r.status === 'ordered' && r.effective_status === orderStatusFilter);
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
          {(() => {
            const items: any[] = record.items || [];
            const allOrdered = items.length > 0 && items.every((it: any) => it.is_ordered);
            const someOrdered = items.some((it: any) => it.is_ordered);
            const unorderedItems = items.filter((it: any) => !it.is_ordered);
            return (
              <>
                <Tooltip title={allOrdered ? 'Minden tétel meg van rendelve' : someOrdered ? 'Van részlegesen megrendelt tétel' : 'Összes tétel megrendelése'}>
                  <Button
                    size="small"
                    type="primary"
                    disabled={allOrdered || someOrdered}
                    style={{ height: 'auto', padding: '3px 10px', lineHeight: 1 }}
                    onClick={async () => {
                      try {
                        const res = await salesService.orderAllFromRfq(record.id);
                        message.success(`Megrendelés létrehozva: ${res.order_number}`);
                        loadData();
                        setTimeout(() => navigate('/sales/customer-orders'), 1000);
                      } catch (e: any) {
                        message.error(e?.response?.data?.error || 'Hiba a megrendelés létrehozásakor');
                      }
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                      <span style={{ fontSize: 9, lineHeight: '12px', opacity: 0.85 }}>Rendel</span>
                      <span style={{ fontSize: 13, lineHeight: '15px', fontWeight: 600 }}>Összes</span>
                    </div>
                  </Button>
                </Tooltip>
                <Tooltip title={allOrdered ? 'Minden tétel meg van rendelve' : 'Részleges megrendelés'}>
                  <Button
                    size="small"
                    disabled={allOrdered}
                    style={{ height: 'auto', padding: '3px 10px', lineHeight: 1, background: allOrdered ? undefined : '#e6f4ff', borderColor: allOrdered ? undefined : '#91caff', color: allOrdered ? undefined : '#1677ff' }}
                    onClick={() => {
                      setPartialOrderOpenId(record.id);
                      setPartialSelection(unorderedItems.map((it: any) => it.id));
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                      <span style={{ fontSize: 9, lineHeight: '12px', opacity: 0.85 }}>Rendel</span>
                      <span style={{ fontSize: 13, lineHeight: '15px', fontWeight: 600 }}>Részleges</span>
                    </div>
                  </Button>
                </Tooltip>
              </>
            );
          })()}
        </Space>
      )
    }
  ]), [navigate]);

  const flattenedItems = useMemo(() => {
    if (!isItemsView) return [];
    const res: any[] = [];
    filtered.forEach((rfq: any) => {
      (rfq.items || []).forEach((item: any, idx: number) => {
        res.push({
          ...item,
          uniqueId: `${rfq.id}_${item.id ?? idx}`,
          rfq_number: rfq.number || rfq.request_number,
          rfq_id: rfq.id,
          rfq_title: rfq.title,
          company_name: rfq.company?.name || rfq.company_name || '',
          contact_names: rfq.contact_names || (rfq.contacts || []).map((c: any) => c.name).filter(Boolean).join(', '),
          is_private: !rfq.company?.name && !rfq.company_name,
          issue_date: rfq.issue_date,
          deadline: rfq.deadline,
          status: rfq.status,
          currency_symbol: rfq.currency_symbol || 'Ft',
          created_by_name: rfq.created_by_name,
        });
      });
    });
    return res;
  }, [filtered, isItemsView]);

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
      render: (_: any, r: any) => r.product_name || r.manufacturing_product_name || r.service_name || r.name || '—',
    },
    {
      title: 'Leírás', dataIndex: 'product_description', key: 'product_description', width: 200,
      sorter: (a: any, b: any) => (a.product_description || '').localeCompare(b.product_description || '', 'hu'),
      render: (t: string) => t ? (<div title={t} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#555' }}>{t}</div>) : null,
    },
    {
      title: 'Belső leírás', dataIndex: 'internal_description', key: 'internal_description', width: 180,
      sorter: (a: any, b: any) => (a.internal_description || '').localeCompare(b.internal_description || '', 'hu'),
      render: (t: string) => t ? (<div title={t} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, color: '#844' }}>{t}</div>) : null,
    },
    {
      title: 'Megjegyzés', dataIndex: 'description', key: 'description', width: 180,
      sorter: (a: any, b: any) => (a.description || '').localeCompare(b.description || '', 'hu'),
      render: (t: string) => t ? (<div title={t} style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12 }}>{t}</div>) : null,
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
      title: 'Nettó összeg', key: 'net_total', width: 130, align: 'right' as const,
      sorter: (a: any, b: any) => (Number(a.quantity || 0) * Number(a.net_unit_price || 0)) - (Number(b.quantity || 0) * Number(b.net_unit_price || 0)),
      render: (_: any, r: any) => `${(Number(r.quantity || 0) * Number(r.net_unit_price || 0)).toLocaleString('hu-HU')} ${r.currency_symbol || 'Ft'}`,
    },
    {
      title: 'Státusz', dataIndex: 'status', key: 'status', width: 110,
      sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || ''),
      render: statusTag,
    },
    {
      title: 'Műveletek', key: 'actions', width: 90,
      render: (_: any, r: any) => (
        <Space size="small">
          <Tooltip title="Megnyitás">
            <Button icon={<EditOutlined style={{ color: '#595959' }} />} size="small" style={{ background: '#f5f5f5', borderColor: '#d9d9d9' }} onClick={() => navigate(`/sales/rfqs/${r.rfq_id}`)} />
          </Tooltip>
          <Tooltip title="Tétel törlése">
            <Button danger icon={<DeleteOutlined />} size="small" onClick={() => {
              Modal.confirm({
                title: 'Tétel törlése',
                content: 'Biztosan törlöd ezt a tételt?',
                okText: 'Igen, törlöm',
                okButtonProps: { danger: true },
                cancelText: 'Mégsem',
                onOk: async () => {
                  try {
                    await salesService.deleteQuoteRequestItem(r.id, r.rfq_id);
                    message.success('Tétel törölve');
                    loadData();
                  } catch (e: any) {
                    message.error(e?.response?.data?.error || 'Hiba a törlés során');
                  }
                },
              });
            }} />
          </Tooltip>
        </Space>
      ),
    },
  ]), [navigate, statusTag]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      console.log('[RFQs] Form values:', values);
      console.log('[RFQs] contact_ids type:', typeof values.contact_ids, 'isArray:', Array.isArray(values.contact_ids));
      console.log('[RFQs] contact_ids value:', values.contact_ids);
      
      // Ellenőrizzük a határidőt
      if (!values.deadline) {
        const suggestedDate = addWorkdays(values.issue_date || dayjs(), 14);
        const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: 'Nincs határidő megadva',
            content: `Megadjunk egy 14 napos határidőt? (${suggestedDate.format('YYYY. MM. DD.')})`,
            okText: 'Igen',
            cancelText: 'Mégsem',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        
        if (confirmed) {
          values.deadline = suggestedDate;
          form.setFieldValue('deadline', suggestedDate);
        } else {
          return; // Vissza az ajánlatba
        }
      }
      
      const computedTitle = (values.title && values.title.trim()) ? values.title.trim() : (nextNumber || '');
      const computedDescription = (values.description && values.description.trim()) ? values.description.trim() : (computedTitle || 'Új árajánlat');
      const createPayload = {
        title: computedTitle,
        description: computedDescription,
        issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        partial_order_allowed: partialOrderAllowed,
      } as any;
      
      console.log('[RFQs] Creating RFQ with:', createPayload);
      const created = await salesService.createQuoteRequest(createPayload);
      console.log('[RFQs] Created RFQ:', created);
      
      // Immediately enrich basic fields that serializer would reject on create
      const updateData: any = {
        contact_ids: values.contact_ids || [],
        currency_code: currency,
        project_id: values.project_id,
        internal_description: values.internal_description || '',
      };
      
      // Set company_id: null for private, or the actual ID
      if (values.company_id === 'private') {
        updateData.company_id = null;
        console.log('[RFQs] Setting company_id to null (private)');
      } else if (values.company_id) {
        updateData.company_id = values.company_id;
        console.log('[RFQs] Setting company_id to:', values.company_id);
      }
      
      console.log('[RFQs] Updating with:', updateData);
      try {
        const updated = await salesService.updateQuoteRequestBasic(created.id, updateData);
        console.log('[RFQs] Update successful:', updated);
        console.log('[RFQs] Updated contacts:', updated.contacts);
      } catch (err) {
        console.error('[RFQs] Update basic failed:', err);
        message.error('Nem sikerült menteni a cég/kapcsolattartó adatokat');
        throw err; // Re-throw to prevent continuing
      }
      // Upload RFQ-level attachments, if any
      if (rfqFiles.length) {
        for (const f of rfqFiles) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = rfqFileRemarks[key];
            await salesService.uploadQuoteRequestAttachment(created.id, (f as any).originFileObj || (f as any), remark);
          } catch {}
        }
      }
      // add items if any
      if (newItems.length) {
        for (const it of newItems) {
          if (it.item_type === 'product') {
            const createdItem = await salesService.addRfqProductItem(created.id, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount, it.ref_id);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          } else if (it.item_type === 'manufacturing') {
            // For pending items (not yet saved), create the product first
            let manuRefId = it.ref_id;
            if ((it as any).pendingManuPayload && it.ref_id < 0) {
              try {
                const { _costItemsState: _cs, _currency: _cur, ...createPayload } = (it as any).pendingManuPayload;
                const createdProduct = await manufacturingService.createProduct(createPayload);
                manuRefId = createdProduct.id;
              } catch (productErr) {
                message.error(`Egyedi gyártás létrehozása sikertelen: ${it.name}`);
                continue; // skip adding RFQ item for this
              }
            }
            const createdItem = await salesService.addRfqManufacturingItem(created.id, manuRefId, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          } else {
            const createdItem = await salesService.addRfqServiceItem(created.id, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          }
        }
      }

      // add costs if any
      if (newCosts.length) {
        for (const c of newCosts) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: any = {
              ...c,
              quote_request: created.id,
              // normalize field names: manu cost items use supplier_id / selling_unit_price
              supplier: c.supplier ?? c.supplier_id ?? null,
              net_unit_price: c.net_unit_price ?? c.selling_unit_price ?? 0,
              currency_code: (c.currency_code || c.currency || 'HUF').toUpperCase(),
              name: c.name || undefined, // prevent blank string (causes 400)
            };
            delete payload.id; // temporary ID
            delete payload._rfqItemRef;
            if (!payload.name) {
              console.warn('Skipping cost with empty name:', c);
              continue;
            }
            try {
                await salesService.createQuoteRequestCost(payload);
            } catch (err) {
                console.error('Failed to create cost:', err);
            }
        }
      }

      message.success('Árajánlat létrehozva');
      setCreateOpen(false);
      form.resetFields();
      setNewItems([]);
      setNewCosts([]);
      setRfqFiles([]);
      setRfqFileRemarks({});
      
      if (searchParams.get('create') === 'true') {
        navigate('/sales/rfqs', { replace: true });
      }

      loadData();
    } catch (e) {
      // validation or api error
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

    // Defer form.setFieldsValue until after the modal renders (via useEffect)
    if (pendingCompanyId || pendingContactId) {
      const vals: Record<string, any> = {};
      if (pendingCompanyId) vals.company_id = pendingCompanyId;
      if (pendingContactId) vals.contact_ids = [pendingContactId];
      setPendingFormValues(vals);
    }
  };

  useEffect(() => {
    if (searchParams.get('create') === 'true' && !loading) {
       openCreate();
       // Clear params to avoid loop? Or keep them until closed?
       // Ideally we should wait for rfqs/projects to load first. 
       // 'loading' flag handles that.
    }
  }, [searchParams, loading]); // Trigger when params change or loading finishes

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
          setCreateOpen(false);
          form.resetFields();
          clearParams();
        },
      });
    } else {
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
              onClick={() => { setIsItemsView(false); setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('view'); return p; }, { replace: true }); }}
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
                  onClick={() => { setIsItemsView(false); setCsvSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('view'); return p; }, { replace: true }); }}
                  style={{ padding: '4px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s', background: !isItemsView ? '#ffffff' : 'transparent', color: !isItemsView ? '#1677ff' : '#666', boxShadow: !isItemsView ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', userSelect: 'none' }}
                >Árajánlatok</div>
                <div
                  onClick={() => { setIsItemsView(true); setCsvSelectedKeys([]); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('view', 'items'); return p; }, { replace: true }); }}
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
              <Select
                className="rfqs-status-select"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                style={{ width: 150 }}
                popupMatchSelectWidth={false}
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
                placeholder="Megrendelési státusz"
                allowClear
                style={{ width: 180 }}
                value={orderStatusFilter}
                onChange={(v) => setOrderStatusFilter(v)}
                popupMatchSelectWidth={false}
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
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Új</Button>
            </Space>
        }
      >
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        
        <EnhancedTable key={isItemsView ? 'rfqs-items' : 'rfqs'} tableKey={isItemsView ? 'rfqs-items' : 'rfqs'} searchValue={query} onSearchChange={setQuery} searchPlaceholder="Keresés…" columns={isItemsView ? itemsColumns as any : columns as any} dataSource={isItemsView ? flattenedItems : filtered} rowKey={isItemsView ? 'uniqueId' : 'id'} pagination={{ pageSize: 10 }} size="small" cardBreakpoint={750} rowSelection={csvMode ? { selectedRowKeys: csvSelectedKeys, onChange: (keys) => setCsvSelectedKeys(keys), columnWidth: 40 } : undefined} />
      </Card>
      <Modal 
        title={`Ajánlat kérő kiküldése: ${(() => {
            const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
            const contactNames = (rec?.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
            return rec ? `${rec.request_number || rec.number || ''} (${rec.company?.name || ''}${contactNames ? ' - ' + contactNames : ''})` : '';
        })()}`}
        open={!!sendOpenId} 
        width={800}
        onCancel={() => setSendOpenId(null)}
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
                  message.success('E-mail elküldve');
                  setSendOpenId(null);
                } catch {
                  message.error('Nem sikerült elküldeni az e-mailt');
                }
             }}>Küldés</Button>
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
        title="Részleges megrendelés"
        open={partialOrderOpenId !== null}
        onCancel={() => { setPartialOrderOpenId(null); setPartialSelection([]); }}
        onOk={async () => {
          if (!partialOrderOpenId) return;
          try {
            setPartialLoading(true);
            const res = await salesService.orderPartialFromRfq(partialOrderOpenId, partialSelection);
            message.success(`Megrendelés létrehozva: ${res.order_number}`);
            setPartialOrderOpenId(null);
            setPartialSelection([]);
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
        width={1100}
        forceRender
      >
        <Form layout="vertical" form={form} size="small" initialValues={{ issue_date: dayjs() }}>
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
          <Row gutter={[8, 4]}>
            <Col xs={24} md={8}>
              <Form.Item 
                label="Cég" 
                style={{ marginBottom: 6 }}
              > 
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="company_id" noStyle>
                  <Select 
                    showSearch 
                    optionFilterProp="label" 
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
                      form.setFieldsValue({ company_id: val });
                      if (val === 'private') {
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
                        window.open('/crm/companies?action=create', '_blank');
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Kapcsolattartók" style={{ marginBottom: 6 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="contact_ids" noStyle>
                  <Select 
                    mode="multiple" 
                    allowClear 
                    showSearch 
                    optionFilterProp="label" 
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 190px)' }}
                    onFocus={async () => {
                      // Frissítjük a kapcsolattartók listáját amikor rákattintanak
                      const companyId = form.getFieldValue('company_id');
                      if (companyId === 'private') {
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                      } else if (companyId) {
                        const list = await crmService.getContactsByCompany(companyId);
                        setContacts(list.results ?? list);
                      }
                    }}
                    onChange={(val) => {
                      console.log('[RFQs] Contacts changed to:', val);
                      form.setFieldsValue({ contact_ids: val });
                    }}
                  >
                    {contacts.map((p: any) => (
                      <Select.Option key={p.id} value={p.id} label={p.full_name || p.name}>{p.full_name || p.name}</Select.Option>
                    ))}
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
                        window.open(url, '_blank');
                      }}
                    />
                  </Tooltip>
                  <Button 
                    type="default"
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
          </div>
          {/* ── Tartalom ─────────────────────────────────────────────────── */}
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d48806', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tartalom</div>
          <Row gutter={[8, 4]}>
            <Col xs={24} md={14}>
              <Form.Item label="Megnevezés" name="title" style={{ marginBottom: 6 }}>
                <Input placeholder="Ha üres, az ajánlatszám lesz" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item label="Projekt" name="project_id" style={{ marginBottom: 6 }}>
                <Select allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet">
                  {(projects || []).map((p: any) => (
                    <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[8, 4]}>
            <Col xs={24} md={12}>
              <Form.Item label="Leírás" name="description" style={{ marginBottom: 6 }} getValueFromEvent={(v) => v}>
                <ReactQuill theme="snow" className="pixi-quill-resizable" placeholder="Külső ajánlati leírás" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Belső leírás" name="internal_description" style={{ marginBottom: 6 }} getValueFromEvent={(v) => v}>
                <ReactQuill theme="snow" className="pixi-quill-resizable" placeholder="Belső ajánlati leírás" />
              </Form.Item>
            </Col>
          </Row>
          </div>
          {/* ── Csatolmányok ──────────────────────────────────────────────── */}
          <div style={{ background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#722ed1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Csatolmányok</div>
          <Row gutter={[8, 4]}>
            <Col xs={24}>
              <Form.Item label="Ajánlat csatolmányok" style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Upload.Dragger
                    multiple
                    showUploadList={false}
                    fileList={rfqFiles}
                    beforeUpload={(file) => {
                      const f = file as any;
                      const key = f.uid || f.name;
                      setRfqFiles((prev) => [...prev, f]);
                      setRfqFileRemarks((prev) => ({ ...prev, [key]: prev[key] ?? '' }));
                      return Upload.LIST_IGNORE;
                    }}
                    style={{ width: 120, minWidth: 120, height: 120, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
                      <span style={{ fontSize: 24 }}>📎</span>
                      <span style={{ fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 1.2 }}>Húzd ide vagy kattints</span>
                    </div>
                  </Upload.Dragger>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rfqFiles.length === 0 && (
                      <span style={{ fontSize: 12, color: '#aaa', paddingTop: 4 }}>Még nincs feltöltött fájl</span>
                    )}
                    {rfqFiles.map((f) => {
                      const key = (f as any).uid || (f as any).name;
                      return (
                        <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Button type="link" size="small" style={{ padding: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => {
                            const fileObj = (f as any).originFileObj || f;
                            const url = (f as any).url || (fileObj ? URL.createObjectURL(fileObj) : undefined);
                            if (url) { setPreviewUrl(url); setPreviewTitle(f.name); setPreviewOpen(true); }
                          }} title={f.name}>{f.name}</Button>
                          <Input
                            size="small"
                            placeholder="Megjegyzés"
                            value={rfqFileRemarks[key] || ''}
                            onChange={(e) => setRfqFileRemarks((prev) => ({ ...prev, [key]: e.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <Button danger size="small" onClick={() => {
                            setRfqFiles((prev) => prev.filter((x) => x.uid !== f.uid));
                            setRfqFileRemarks((prev) => { const copy = { ...prev } as any; delete copy[key]; return copy; });
                          }}>✕</Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Form.Item>
            </Col>
          </Row>
          </div>
          {/* ── Tételek ──────────────────────────────────────────────────── */}
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tételek</div>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>Tétel hozzáadása:</span>
            <Checkbox 
              checked={partialOrderAllowed}
              onChange={(e) => setPartialOrderAllowed(e.target.checked)}
            >
              Részlegesen megrendelhető
            </Checkbox>
          </div>
          <Space>
            <Button onClick={() => { setSelectorType('product'); setSelectorOpen(true); }}>Termék</Button>
            <Button onClick={() => { setSelectorType('manufacturing'); setSelectorOpen(true); }}>Egyedi Gyártás</Button>
            <Button onClick={() => { setSelectorType('service'); setSelectorOpen(true); }}>Szolgáltatás</Button>
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
            return <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '75vh', border: 0 }} />;
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
          if (editIdx !== null && editIdx >= 0 && editIdx < newItems.length) {
            setNewItems((prev) => prev.map((it, i) => i === editIdx ? { ...it, ...p } : it));
          } else {
            // For pending manufacturing items (negative ref_id), update the existing entry instead of appending a duplicate
            const pendingIdx = (p.ref_id !== undefined && p.ref_id < 0)
              ? newItems.findIndex(it => it.ref_id === p.ref_id && it.item_type === p.item_type)
              : -1;
            if (pendingIdx >= 0) {
              setNewItems((prev) => prev.map((it, i) => i === pendingIdx ? { ...it, ...p } : it));
            } else {
              setNewItems((prev) => [...prev, p]);
            }
          }
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
    </div>
  );
};

export default RFQs;
