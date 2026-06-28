/**
 * OrderedProducts — Megrendelt Gyártások
 *
 * Ugyanaz a listázási metódus mint az RFQs oldal:
 *  - RFQ-alapú adatforrás (getQuoteRequestsPage)
 *  - Azonos flattenedItems, STATUS_COMBOS, szűrő, oszlopok, sorszínek
 *  - Gyártás-specifikus akciók: stopper, megjegyzés, munkalap
 *  - "Gyártásra kiküldés" funkció megtartva
 */
import React, { useEffect, useMemo, useState } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import type { ColumnsType } from 'antd/es/table';
import {
    Card, Button, Space, Tag, Spin, message, Tooltip, Modal, Form,
    Input, Select, Checkbox, Collapse, Switch, Tabs, Table, Typography,
} from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
    ReloadOutlined, FieldTimeOutlined, MessageOutlined, PrinterOutlined,
    PaperClipOutlined, SendOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import { settingsService } from '../../services/settingsService';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNewRowTracker, newDotColumn } from '../../hooks/useNewRowTracker';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import MaterialNeedsTree from '../../components/Manufacturing/MaterialNeedsTree';
import stripHtml from '../../utils/stripHtml';
import api from '../../services/api';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import '../Sales/RFQs.css';

// ─── Utilities (same as RFQs) ───────────────────────────────────────────────

const normalizeRfqWorkflowStatus = (status?: string): string =>
    status === 'sent' ? 'quoted' : (status || 'new');

const getRfqRef = (rfq: any): string =>
    String(rfq?.number || rfq?.request_number || rfq?.id || '');

const COST_ITEM_STATUS_ORDER = [
    'new', 'sent', 'ordered', 'confirmed', 'in_design',
    'pending_customer_approval', 'pending_internal_approval',
    'in_production', 'ready', 'in_delivery', 'delivered', 'rejected',
];

const STATUS_COMBOS: Record<string, string[]> = {
    mind: ['new', 'quoted', 'ordered', 'confirmed', 'in_design',
        'pending_customer_approval', 'pending_internal_approval',
        'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced', 'expired', 'archived'],
    foglalkozos: ['ordered', 'confirmed', 'in_design',
        'pending_customer_approval', 'pending_internal_approval', 'in_production', 'ready'],
    szallitando: ['ready'],
    szamlazando: ['ready', 'in_delivery', 'delivered'],
    aktiv: ['new', 'quoted', 'ordered', 'confirmed', 'in_design',
        'pending_customer_approval', 'pending_internal_approval',
        'in_production', 'ready', 'in_delivery', 'delivered', 'invoiced'],
};
const STATUS_COMBO_KEYS = ['foglalkozos', 'szallitando', 'szamlazando', 'aktiv'] as const;

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

const RFQ_STATUS_OPTIONS = [
    { value: 'new', label: 'Új' },
    { value: 'quoted', label: 'Kiküldve' },
    { value: 'accepted', label: 'Elfogadva' },
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

// ─── Send-to-production types ────────────────────────────────────────────────

interface RenderedSendGroup {
    key: string;
    label: string;
    recipient: string;
    item_ids: number[];
    item_table_html: string;
}

interface ProductionSendGroup {
    key: string; label: string; enabled: boolean; signature_key: string;
    recipients: string; cc: string; reply_to: string;
    subject: string; body: string; is_html: boolean;
    cost_item_ids: number[]; related_rfq_item_ids: string[];
    item_table_html: string; internal_worksheet_table_html: string; queue_links_html: string;
    attachments: Array<{
        id: string; source: 'product_attachment' | 'worksheet_pdf'; include: boolean;
        file_url: string; file_name: string; product_name: string;
        remark: string; original_remark: string; worksheet_cost_item_id?: number;
    }>;
}

const renderTemplateText = (text: string, ctx: {
    recipient_label: string; item_count: number;
    item_table_html: string; internal_worksheet_table_html: string;
    queue_links_html: string; selected_attachments_table_html: string;
}) => {
    if (!text) return '';
    return text
        .replace(/\{recipient_label\}/g, ctx.recipient_label)
        .replace(/\{item_count\}/g, String(ctx.item_count))
        .replace(/\{item_table_html\}/g, ctx.item_table_html)
        .replace(/\{internal_worksheet_table_html\}/g, ctx.internal_worksheet_table_html)
        .replace(/\{queue_links_html\}/g, ctx.queue_links_html)
        .replace(/\{selected_attachments_table_html\}/g, ctx.selected_attachments_table_html);
};

const renderTplForEditor = (text: string, ctx: { recipient_label: string; item_count: number }) => {
    if (!text) return '';
    return text.replace(/\{recipient_label\}/g, ctx.recipient_label).replace(/\{item_count\}/g, String(ctx.item_count));
};

const renderSignature = (sig: any, user: any) => {
    if (!sig?.body_html) return '';
    let s: string = sig.body_html;
    const uName = user?.last_name && user?.first_name ? `${user.last_name} ${user.first_name}` : (user?.username || '');
    return s.replace(/\{user_name\}/g, uName).replace(/\{user_email\}/g, user?.email || '').replace(/\{user_phonenumber\}/g, user?.employee_profile?.phone || '').replace(/\{user_position\}/g, user?.employee_profile?.position?.title || '');
};

const escapeHtml = (text: string) =>
    (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// ─── Component ──────────────────────────────────────────────────────────────

const OrderedProducts: React.FC = () => {
    const { user } = useAuth();
    const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();

    const PRICE_ALLOWED_DEPARTMENTS = ['Ügyvezető', 'Adminisztráció'];
    const canViewPrices: boolean = !!(
        user?.is_superuser || user?.is_staff ||
        (user?.department_names || []).some((d: string) => PRICE_ALLOWED_DEPARTMENTS.includes(d))
    );

    // ─── Data ───────────────────────────────────────────────────────────────
    const [rfqs, setRfqs] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [backgroundLoading, setBackgroundLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [costStatusOverrides] = useState<Record<number, string>>({});
    const [attachmentsByProduct, setAttachmentsByProduct] = useState<Record<number, any[]>>({});
    const [attachmentsLoading, setAttachmentsLoading] = useState<Record<number, boolean>>({});

    // ─── Status filter (same as RFQs) ───────────────────────────────────────
    const [statusFilter, setStatusFilter] = useState<string[]>(['foglalkozos']);

    const handleStatusFilterChange = (newValues: string[]) => {
        if (newValues.length === 0) { setStatusFilter(['mind']); return; }
        if (newValues.includes('mind') && !statusFilter.includes('mind')) { setStatusFilter(['mind']); return; }
        const newlyAdded = newValues.filter(v => !statusFilter.includes(v));
        const newCombo = newlyAdded.find(v => (STATUS_COMBO_KEYS as readonly string[]).includes(v));
        if (newCombo) { setStatusFilter([newCombo]); return; }
        const individual = newValues.filter(v => v !== 'mind' && !(STATUS_COMBO_KEYS as readonly string[]).includes(v));
        setStatusFilter(individual.length > 0 ? individual : ['mind']);
    };

    const activeComboKey = useMemo(() => {
        if (statusFilter.length === 1 && STATUS_COMBOS[statusFilter[0]]) return statusFilter[0];
        return null;
    }, [statusFilter]);

    const selectExpandedValue = useMemo(() => {
        if (activeComboKey) return [activeComboKey, ...STATUS_COMBOS[activeComboKey]];
        return statusFilter;
    }, [activeComboKey, statusFilter]);

    // ─── Load (paginated, same as RFQs) ─────────────────────────────────────
    const loadData = async () => {
        try {
            setLoading(true);
            const PAGE_SIZE = 50;
            const firstPage = await salesService.getQuoteRequestsPage(1, PAGE_SIZE);
            const firstResults: any[] = firstPage.results ?? [];
            const totalCount: number = firstPage.count ?? firstResults.length;
            setRfqs(firstResults);
            setLoading(false);
            if (totalCount > PAGE_SIZE) {
                setBackgroundLoading(true);
                const totalPages = Math.ceil(totalCount / PAGE_SIZE);
                for (let page = 2; page <= totalPages; page++) {
                    try {
                        const pd = await salesService.getQuoteRequestsPage(page, PAGE_SIZE);
                        setRfqs(prev => [...prev, ...(pd.results ?? [])]);
                    } catch (e) { console.error(`Page ${page}:`, e); }
                }
                setBackgroundLoading(false);
            }
        } catch (e) {
            console.error(e);
            message.error('Hiba történt az adatok betöltése során');
            setLoading(false);
        }
    };
    useEffect(() => { loadData(); }, []);

    // ─── Search filter ───────────────────────────────────────────────────────
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    useEffect(() => {
        if (!query) { setFiltered(rfqs); return; }
        const q = normalize(query);
        setFiltered(rfqs.filter(rfq => normalize([
            rfq.number, rfq.request_number, rfq.title,
            rfq.company_name, rfq.company?.name,
            (rfq.contacts || []).map((c: any) => c.name).join(' '),
            (rfq.items || []).map((it: any) => `${it.item_name || ''} ${it.description || ''}`).join(' '),
        ].join(' ')).includes(q)));
    }, [rfqs, query]);

    // ─── flattenedItems (same as RFQs) ──────────────────────────────────────
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
            };
            const rfqCompanyName = rfq.company?.name || rfq.company_name ||
                (rfq.contacts || []).find((c: any) => c.company?.name)?.company?.name || '';
            const rfqContactNames = rfq.contact_names ||
                (rfq.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ');
            const rfqIsPrivate = !rfq.company?.name && !rfq.company_name &&
                !(rfq.contacts || []).some((c: any) => c.company?.name || c.company_name);
            const itemStatus = rfq.effective_status
                ? normalizeRfqWorkflowStatus(rfq.effective_status)
                : normalizeRfqWorkflowStatus(rfq.status);

            const rawCostStatuses: string[] = ((firstItem?.cost_items_statuses || []) as any[])
                .map((ci: any) => ci.status)
                .filter((s: string) => COST_ITEM_STATUS_ORDER.includes(s));
            const costTopStatus: string | null = rawCostStatuses.length > 0
                ? rawCostStatuses.reduce((best: string, s: string) =>
                    COST_ITEM_STATUS_ORDER.indexOf(s) > COST_ITEM_STATUS_ORDER.indexOf(best) ? s : best)
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
                uniqueId: String(getRfqRef(rfq)),
                rfq_number: rfq.number || rfq.request_number,
                rfq_id: getRfqRef(rfq),
                rfq_pk: rfq.id,
                company_name: rfqCompanyName,
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
                _costTopStatus: overriddenStatus,
                _costIsPartial: overriddenIsPartial,
                is_manufacturable: rfq.is_manufacturable ?? false,
                _rfq_items: allItems,
            });
        });

        const activeFilter = statusFilter.length > 0 ? statusFilter : ['mind'];
        if (!activeFilter.includes('mind')) {
            const effectiveStatuses = new Set<string>();
            for (const s of activeFilter) {
                const expanded = STATUS_COMBOS[s];
                if (expanded) expanded.forEach((st: string) => effectiveStatuses.add(st));
                else effectiveStatuses.add(s);
            }
            return res.filter((item: any) => {
                const st = item.status ? normalizeRfqWorkflowStatus(item.status)
                    : (item.effective_status ? normalizeRfqWorkflowStatus(item.effective_status) : 'new');
                return effectiveStatuses.has(st);
            });
        }
        return res;
    }, [filtered, statusFilter, costStatusOverrides]);

    const { newIds: newRfqIds, markSeen: markRfqSeen, loadNewIds: loadNewRfqIds } = useNewRowTracker('/manufacturing/ordered-products');
    useEffect(() => { loadNewRfqIds(flattenedItems.map((r: any) => r.uniqueId).filter(Boolean)); }, [flattenedItems]);

    // ─── UI state ────────────────────────────────────────────────────────────
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

    // Send-to-production state
    const [sendingProduction, setSendingProduction] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [sendModalLoading, setSendModalLoading] = useState(false);
    const [sendModalGroups, setSendModalGroups] = useState<ProductionSendGroup[]>([]);
    const [sendActiveKey, setSendActiveKey] = useState('');
    const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
    const [signatures, setSignatures] = useState<any[]>([]);

    // ─── Status popover ──────────────────────────────────────────────────────
    const StatusCell: React.FC<{ record: any }> = ({ record }) => {
        const { Popover } = require('antd');
        const currentStatus = getDisplayStatus(record);
        const currentLabel = record?.effective_status_label || RFQ_STATUS_META[currentStatus]?.text || currentStatus;
        const content = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {RFQ_STATUS_OPTIONS.map(opt => (
                    <Button key={opt.value} size="small"
                        type={opt.value === currentStatus ? 'primary' : 'text'}
                        disabled={opt.value === currentStatus}
                        style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                await salesService.setQuoteRequestStatus(Number(record.rfq_pk), opt.value);
                                const label = RFQ_STATUS_META[opt.value]?.text || opt.label;
                                message.success(`Státusz: ${label}`);
                                setRfqs(prev => prev.map(rfq =>
                                    rfq.id !== record.rfq_pk ? rfq : { ...rfq, status: opt.value, effective_status: opt.value, effective_status_label: label }
                                ));
                            } catch (e: any) {
                                message.error(e?.response?.data?.error || 'Hiba a státusz frissítésekor');
                            }
                        }}
                    >{opt.label}</Button>
                ))}
            </div>
        );
        return (
            <Space size={4} align="center">
                <Popover content={content} title="Státusz váltás" trigger="click"
                    styles={{ body: { padding: '6px 8px' } }} getPopupContainer={() => document.body} zIndex={9999}>
                    <Tag color={(RFQ_STATUS_META[currentStatus] || { color: 'default' }).color}
                        style={{ cursor: 'pointer', margin: 0 }} onClick={(e: any) => e.stopPropagation()}>
                        {currentLabel}
                    </Tag>
                </Popover>
                {record.is_manufacturable && (
                    <Tooltip title="Gyártható"><CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} /></Tooltip>
                )}
            </Space>
        );
    };

    // ─── Manufacturing actions ────────────────────────────────────────────────
    const handleStartTimer = (r: any) => {
        setPreselectedOrderId(r.rfq_pk || null);
        setPreselectedItemId(r.id || null);
        setTimerModalOpen(true);
    };

    const handlePrintWorksheet = async (r: any) => {
        // bulk_work_sheets_for_rfqs handles both:
        //  - items with a linked ManufacturingProduct
        //  - items with cost_items_data only (no manufacturing_product)
        const rfqId = r.rfq_number || r.rfq_id || r.rfq_pk;
        if (!rfqId) { message.warning('Ehhez a tételhez nincs RFQ azonosító.'); return; }
        try {
            const response = await api.get(
                `/manufacturing/cost-items/bulk_work_sheets_for_rfqs/?rfq_ids=${rfqId}`,
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (e: any) {
            message.warning(e?.response?.status === 404 ? 'Ehhez a tételhez nincs nyomtatható munkalap.' : 'Hiba a munkalap letöltése során');
        }
    };

    const handleAddNote = (record: any) => {
        const existing = record.internal_description || '';
        let value = existing;
        Modal.confirm({
            title: `Belső megjegyzés — ${record.name || record.rfq_number}`,
            width: 600,
            icon: <MessageOutlined />,
            content: <Input.TextArea defaultValue={existing} rows={6} onChange={e => { value = e.target.value; }} placeholder="Írja be a megjegyzést..." />,
            okText: 'Mentés', cancelText: 'Mégse',
            onOk: async () => {
                if (!record.id) return;
                try {
                    await api.patch(`/sales/quote-request-items/${record.id}/`, { internal_description: value });
                    setRfqs(prev => prev.map(rfq => {
                        if (rfq.id !== record.rfq_pk) return rfq;
                        return { ...rfq, items: (rfq.items || []).map((it: any) => it.id === record.id ? { ...it, internal_description: value } : it) };
                    }));
                    message.success('Megjegyzés mentve');
                } catch { message.error('Megjegyzés mentése sikertelen'); }
            },
        });
    };

    // ─── Product attachments ─────────────────────────────────────────────────
    const loadProductAttachments = async (productId: number) => {
        if (attachmentsByProduct[productId] !== undefined || attachmentsLoading[productId]) return;
        setAttachmentsLoading(prev => ({ ...prev, [productId]: true }));
        try {
            const atts = await manufacturingService.getProductAttachments(productId);
            setAttachmentsByProduct(prev => ({ ...prev, [productId]: Array.isArray(atts) ? atts : [] }));
        } finally {
            setAttachmentsLoading(prev => ({ ...prev, [productId]: false }));
        }
    };

    // ─── Send to production ───────────────────────────────────────────────────
    const updateSendGroup = (key: string, patch: Partial<ProductionSendGroup>) =>
        setSendModalGroups(gs => gs.map(g => g.key === key ? { ...g, ...patch } : g));
    const updateGroupAtt = (groupKey: string, attId: string, patch: any) =>
        setSendModalGroups(gs => gs.map(g => g.key !== groupKey ? g : { ...g, attachments: g.attachments.map(a => a.id === attId ? { ...a, ...patch } : a) }));
    const buildAttHtml = (group: ProductionSendGroup) => {
        const sel = group.attachments.filter(a => a.include);
        if (!sel.length) return '<p>Nincs kiválasztott csatolmány.</p>';
        const rows = sel.map(a => `<tr><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(a.product_name)}</td><td style="border:1px solid #ddd;padding:4px 8px"><a href="${escapeHtml(a.file_url)}" target="_blank">${escapeHtml(a.file_name)}</a></td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(a.remark || '-')}</td></tr>`).join('');
        return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Termék</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Csatolmány</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Megjegyzés</th></tr></thead><tbody>${rows}</tbody></table>`;
    };

    const handleSendToProduction = async () => {
        if (!selectedRowKeys.length) { message.warning('Nincs kijelölt tétel.'); return; }
        try {
            setSendModalLoading(true); setSendingProduction(true);
            const selectedItems = flattenedItems.filter(it => selectedRowKeys.includes(it.uniqueId));
            const productCache = new Map<number, any>();
            const productAttsMap = new Map<number, any[]>();
            const costMeta: Record<number, { item: any; costItem: any }> = {};
            const costIds: number[] = [];
            for (const item of selectedItems) {
                const mpId: number = item.manufacturing_product_id;
                if (!mpId) continue;
                let product = productCache.get(mpId);
                if (!product) { product = await manufacturingService.getProduct(mpId); productCache.set(mpId, product); }
                if (!productAttsMap.has(mpId)) {
                    let atts = attachmentsByProduct[mpId];
                    if (atts === undefined) {
                        try { atts = await manufacturingService.getProductAttachments(mpId); setAttachmentsByProduct(prev => ({ ...prev, [mpId]: Array.isArray(atts) ? atts : [] })); } catch { atts = []; }
                    }
                    productAttsMap.set(mpId, Array.isArray(atts) ? atts : []);
                }
                (Array.isArray(product?.cost_items) ? product.cost_items : []).forEach((ci: any) => {
                    const ciId = Number(ci?.id || 0);
                    if (!ciId || costMeta[ciId]) return;
                    costMeta[ciId] = { item, costItem: ci }; costIds.push(ciId);
                });
            }
            if (!costIds.length) { message.warning('A kijelölt termékekhez nem tartozik kiküldhető altétel.'); return; }
            const { data: rendered } = await api.post('/manufacturing/cost-items/render_supplier_order/', { cost_item_ids: costIds });
            const groups: RenderedSendGroup[] = Array.isArray(rendered?.groups) ? rendered.groups : [];
            if (!groups.length) { message.warning('Nem találtam címzettet.'); return; }
            let templates: any[] = [], sigs: any[] = [];
            try {
                const [tRes, sRes] = await Promise.all([settingsService.getEmailTemplates(), settingsService.getSignatures()]);
                templates = Array.isArray(tRes) ? tRes : []; sigs = Array.isArray(sRes) ? sRes : [];
            } catch { /**/ }
            setEmailTemplates(templates); setSignatures(sigs);
            const defTpl = templates.find(t => t.key === 'manufacturing_ordered_products_send') || templates.find(t => t.key === 'manufacturing_supplier_order');
            const defSig = sigs.find(s => s.key === 'default') || sigs[0];
            const modalGroups: ProductionSendGroup[] = groups.map(group => {
                const ids = Array.isArray(group.item_ids) ? group.item_ids : [];
                const rows = Array.from(new Set(ids.map(id => costMeta[id]?.item).filter(Boolean)));
                const relatedIds = Array.from(new Set(ids.map(id => costMeta[id]?.item?.uniqueId).filter(Boolean))) as string[];
                const wsRows = ids.map(id => {
                    const m = costMeta[id]; if (!m) return '';
                    const oi = m.item; const ci = m.costItem;
                    return `<tr><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(oi.rfq_number)}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(oi.name)}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(ci.name || 'Altétel')}</td><td style="border:1px solid #ddd;padding:4px 8px;text-align:right">${Number(ci.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} ${escapeHtml(ci.unit || '')}</td></tr>`;
                }).filter(Boolean).join('');
                const wsHtml = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Ajánlat szám</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Termék</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Altétel</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Mennyiség</th></tr></thead><tbody>${wsRows || '<tr><td colspan="4" style="border:1px solid #ddd;padding:4px 8px">Nincs adat</td></tr>'}</tbody></table>`;
                const queueHtml = (rows as any[]).length > 0
                    ? `<ul style="margin:0;padding-left:18px">${(rows as any[]).map(oi => `<li><a href="${window.location.origin}/sales/rfqs/${oi.rfq_number}" target="_blank">${escapeHtml(oi.rfq_number)} – ${escapeHtml(oi.name)}</a></li>`).join('')}</ul>`
                    : '<p>Nincs link.</p>';
                const attMap = new Map<string, any>();
                (rows as any[]).forEach(oi => {
                    if (!oi.manufacturing_product_id) return;
                    (productAttsMap.get(oi.manufacturing_product_id) || []).forEach((att: any) => {
                        const url = att.file_url || att.file || ''; if (!url) return;
                        const k = `att_${att.id}`; if (attMap.has(k)) return;
                        attMap.set(k, { id: k, source: 'product_attachment', include: false, file_url: url, file_name: url.split('/').pop() || `#${att.id}`, product_name: oi.name, remark: att.remark || '', original_remark: att.remark || '' });
                    });
                    const wsCiId = ids.find(id => costMeta[id]?.item?.uniqueId === oi.uniqueId) || ids[0];
                    const wsKey = `ws_${oi.uniqueId}`;
                    if (!attMap.has(wsKey)) attMap.set(wsKey, { id: wsKey, source: 'worksheet_pdf', include: true, file_url: `${window.location.origin}/api/v1/manufacturing/cost-items/${wsCiId}/work_sheet/`, file_name: `munkalap_${oi.rfq_number}.pdf`, product_name: oi.name, remark: 'Belső munkalap PDF', original_remark: 'Belső munkalap PDF', worksheet_cost_item_id: wsCiId });
                });
                let subject = `Új megrendelés – ${group.label}`;
                let body = `<p>Tisztelt ${escapeHtml(group.label || 'Partner')}!</p><p>Kérjük, az alábbi tételek gyártását indítsák el:</p>{item_table_html}{queue_links_html}{internal_worksheet_table_html}{selected_attachments_table_html}<p>Köszönettel,<br>PixiERP</p>`;
                if (defTpl) {
                    const ctx = { recipient_label: group.label, item_count: ids.length };
                    subject = renderTplForEditor(defTpl.subject_template || subject, ctx);
                    body = renderTplForEditor(defTpl.body_template || body, ctx);
                }
                if (defSig) body += renderSignature(defSig, user);
                return { key: group.key, label: group.label, enabled: true, signature_key: defSig?.key || '', recipients: group.recipient || '', cc: defTpl?.default_cc || '', reply_to: defTpl?.default_reply_to || '', subject, body, is_html: true, cost_item_ids: ids, related_rfq_item_ids: relatedIds, item_table_html: group.item_table_html || '', internal_worksheet_table_html: wsHtml, queue_links_html: queueHtml, attachments: Array.from(attMap.values()) };
            });
            setSendModalGroups(modalGroups); setSendActiveKey(modalGroups[0]?.key || ''); setSendModalOpen(true);
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Gyártási megrendelés kiküldése sikertelen.');
        } finally { setSendingProduction(false); setSendModalLoading(false); }
    };

    const handleConfirmSend = async () => {
        const toSend = sendModalGroups.filter(g => g.enabled);
        if (!toSend.length) { message.warning('Nincs bekapcsolt csoport.'); return; }
        const missing = toSend.filter(g => !g.recipients.trim());
        if (missing.length) { message.warning(`Hiányzó címzett: ${missing.map(g => g.label).join(', ')}`); return; }
        try {
            setSendingProduction(true);
            await api.post('/manufacturing/cost-items/send_supplier_order/', {
                groups: toSend.map(g => ({
                    key: g.key, label: g.label, cost_item_ids: g.cost_item_ids,
                    recipients: g.recipients.trim(), cc: g.cc.trim(), reply_to: g.reply_to.trim(), subject: g.subject,
                    body: renderTemplateText(g.body, { recipient_label: g.label, item_count: g.cost_item_ids.length, item_table_html: g.item_table_html, internal_worksheet_table_html: g.internal_worksheet_table_html, queue_links_html: g.queue_links_html, selected_attachments_table_html: buildAttHtml(g) }),
                    is_html: g.is_html,
                    attach_worksheet_pdf: g.attachments.some(a => a.include && a.source === 'worksheet_pdf'),
                    worksheet_cost_item_ids: g.attachments.filter(a => a.include && a.source === 'worksheet_pdf').map(a => Number(a.worksheet_cost_item_id || 0)).filter(Boolean),
                })),
            });
            message.success('Gyártási e-mailek elküldve.');
            setSendModalOpen(false); loadData();
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Kiküldés sikertelen.');
        } finally { setSendingProduction(false); }
    };

    // ─── Expanded row ─────────────────────────────────────────────────────────
    const expandedRowRender = (record: any) => {
        const productId = record.manufacturing_product_id;
        return (
            <div style={{ padding: '8px 0 8px 32px' }}>
                {productId != null ? (
                    <>
                        <ProductSubItemsTable productId={productId} showNotesAndAttachments showPrices={canViewPrices} />
                        <MaterialNeedsTree
                            manufacturingProductId={productId}
                            quantity={Number(record.quantity || 1)}
                            sourceType="ordered_product"
                            sourceId={Number(productId)}
                            sourceNumber={record.rfq_number || String(productId)}
                            sourceItemName={record.name || ''}
                        />
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>Termék szintű csatolmányok</div>
                            <Table size="small" loading={!!attachmentsLoading[productId]}
                                dataSource={attachmentsByProduct[productId] || []} rowKey="id" pagination={false}
                                locale={{ emptyText: 'Nincs csatolmány' }}
                                columns={[
                                    { title: 'Fájl', key: 'file', render: (_: any, att: any) => { const url = att.file_url || att.file || ''; const name = url.split('/').pop() || `#${att.id}`; return <a href={url} onClick={e => { e.preventDefault(); setPreviewUrl(url); setPreviewTitle(name); setPreviewOpen(true); }}>{name}</a>; } },
                                    { title: 'Megjegyzés', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
                                    { title: 'Feltöltve', dataIndex: 'created_at', key: 'created_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('hu-HU') : '-' },
                                ]}
                            />
                        </div>
                    </>
                ) : (record.cost_items_data && record.cost_items_data.length > 0) ? (
                    <ProductSubItemsTable
                        productId={0} dataSource={record.cost_items_data}
                        showNotesAndAttachments showPrices={canViewPrices}
                        qriId={record.id ?? undefined}
                        onPersistAll={async (updatedItems) => {
                            if (!record.id) return;
                            await salesService.updateQuoteRequestItem(record.id, { cost_items_data: updatedItems });
                        }}
                    />
                ) : <div style={{ color: '#aaa', padding: 8 }}>Nincs gyártási altétel</div>}
            </div>
        );
    };

    // ─── Columns ──────────────────────────────────────────────────────────────
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
                <a href={`/sales/rfqs/${r.rfq_number || r.rfq_id}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#1677ff', fontWeight: 500 }}>
                    {r.rfq_number}
                </a>
            ),
        },
        {
            title: 'Tétel neve', key: 'item_name', ellipsis: true,
            sorter: (a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'hu'),
            render: (_: any, r: any) => (
                <Tooltip title={r.name || '—'} getPopupContainer={() => document.body}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</span>
                </Tooltip>
            ),
        },
        {
            title: 'Darabszám', key: 'quantity', width: 100, align: 'right' as const,
            sorter: (a: any, b: any) => Number(a.quantity || 0) - Number(b.quantity || 0),
            render: (_: any, r: any) => `${Number(r.quantity || 0).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`,
        },
        {
            title: 'Leírás', dataIndex: 'description', key: 'description', width: 200, ellipsis: false,
            sorter: (a: any, b: any) => (stripHtml(a.description || '')).localeCompare(stripHtml(b.description || ''), 'hu'),
            render: (_: any, r: any) => { const t = stripHtml(r.description || ''); return t ? (<Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}><div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t}</div></Tooltip>) : null; },
        },
        {
            title: 'Belső leírás', key: 'internal_description', width: 180, ellipsis: false,
            sorter: (a: any, b: any) => (stripHtml(a.manufacturing_product_internal_description || a.internal_description || '')).localeCompare(stripHtml(b.manufacturing_product_internal_description || b.internal_description || ''), 'hu'),
            render: (_: any, r: any) => {
                const t = stripHtml(r.manufacturing_product_internal_description || r.internal_description || '');
                return t ? (
                    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', fontSize: 12, color: '#844', whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'pointer' }}
                            onClick={e => { e.stopPropagation(); handleAddNote(r); }}>{t}</div>
                    </Tooltip>
                ) : (
                    <span style={{ color: '#bbb', fontSize: 12, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); handleAddNote(r); }}>+ megjegyzés</span>
                );
            },
        },
        {
            title: 'Ügyfél', key: 'company_name', width: 160,
            sorter: (a: any, b: any) => (a.is_private ? (a.contact_names || '') : (a.company_name || '')).localeCompare(b.is_private ? (b.contact_names || '') : (b.company_name || ''), 'hu'),
            render: (_: any, r: any): React.ReactNode => {
                const primary = r.is_private ? (r.contact_names || 'Magánszemély') : (r.company_name || 'Magánszemély');
                const secondary = r.is_private ? null : r.contact_names;
                return (
                    <Tooltip title={[primary, secondary].filter(Boolean).join(' – ')}>
                        <div>
                            <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{primary}</div>
                            {r.is_private && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
                            {secondary && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</div>}
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
                return <span style={{ color: d.isBefore(dayjs(), 'day') ? '#cf1322' : undefined }}>{d.format('YYYY-MM-DD')}</span>;
            },
        },
        {
            title: 'Státusz', key: 'item_status', width: 160,
            sorter: (a: any, b: any) => getDisplayStatus(a).localeCompare(getDisplayStatus(b)),
            render: (_: any, r: any) => <StatusCell record={r} />,
        },
        {
            title: 'Műveletek', key: 'actions', width: 160, fixed: 'right' as const,
            render: (_: any, r: any) => (
                <Space size="small" onClick={e => e.stopPropagation()}>
                    <Tooltip title="Stopper / Munkaóra">
                        <Button icon={<FieldTimeOutlined />} size="small"
                            style={{ background: '#f0f5ff', borderColor: '#adc6ff' }}
                            onClick={() => handleStartTimer(r)} />
                    </Tooltip>
                    <Tooltip title="Belső megjegyzés">
                        <Button icon={<MessageOutlined />} size="small"
                            style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}
                            onClick={() => handleAddNote(r)} />
                    </Tooltip>
                    <Tooltip title="Csatolmányok / Altételek">
                        <Button icon={<PaperClipOutlined />} size="small"
                            type={expandedRowKeys.includes(r.uniqueId) ? 'primary' : 'default'}
                            onClick={() => {
                                if (expandedRowKeys.includes(r.uniqueId)) {
                                    setExpandedRowKeys(prev => prev.filter(id => id !== r.uniqueId));
                                } else {
                                    setExpandedRowKeys(prev => [...prev, r.uniqueId]);
                                    if (r.manufacturing_product_id) loadProductAttachments(r.manufacturing_product_id);
                                }
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Munkalap nyomtatása">
                        <Button icon={<PrinterOutlined />} size="small"
                            style={{ background: '#fff2e8', borderColor: '#ffbb96' }}
                            onClick={() => handlePrintWorksheet(r)} />
                    </Tooltip>
                </Space>
            ),
        },
    ]), [expandedRowKeys, newRfqIds]);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div>
            <Card
                title={
                    <span>
                        Megrendelt Gyártások
                        {backgroundLoading && (
                            <> <Spin size="small" style={{ marginLeft: 8 }} />
                                <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>Betöltés…</span>
                            </>
                        )}
                    </span>
                }
                extra={
                    <Space wrap>
                        <Select
                            mode="multiple"
                            placeholder="Státusz szűrő"
                            value={selectExpandedValue}
                            onChange={(values: any) => handleStatusFilterChange(Array.isArray(values) ? values.map(String) : [])}
                            style={{ width: 230 }}
                            popupMatchSelectWidth={false}
                            maxTagCount="responsive"
                            tagRender={(props) => {
                                if (activeComboKey && props.value !== activeComboKey) return <></>;
                                return <Tag closable={props.closable} onClose={props.onClose} style={{ marginRight: 2 }}>{props.label}</Tag>;
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
                        <Button icon={<ReloadOutlined />} onClick={loadData}>Frissítés</Button>
                        <Button type="primary" icon={<SendOutlined />}
                            disabled={selectedRowKeys.length === 0}
                            loading={sendModalLoading}
                            onClick={handleSendToProduction}>
                            Gyártásra kiküldés{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                        </Button>
                    </Space>
                }
            >
                <EnhancedTable
                    tableKey="ordered-products-rfq"
                    searchValue={query}
                    onSearchChange={setQuery}
                    searchPlaceholder="Keresés ajánlat szám, ügyfél, termék szerint…"
                    columns={itemsColumns as any}
                    dataSource={flattenedItems}
                    rowKey="uniqueId"
                    pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total} tétel` }}
                    size="small"
                    loading={loading}
                    cardBreakpoint={750}
                    className="rfq-items-table"
                    sticky={{ offsetScroll: 0 }}
                    rowClassName={(r: any) => { const st = getDisplayStatus(r); return st !== 'new' ? `rfq-row-${st}` : ''; }}
                    rowSelection={{ selectedRowKeys, onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]), columnWidth: 32 }}
                    expandable={{
                        columnWidth: 24,
                        expandedRowRender,
                        expandedRowKeys,
                        onExpand: (expanded: boolean, record: any) => {
                            if (expanded) {
                                markRfqSeen(record);
                                setExpandedRowKeys(prev => [...prev, record.uniqueId]);
                                if (record.manufacturing_product_id) loadProductAttachments(record.manufacturing_product_id);
                            } else {
                                setExpandedRowKeys(prev => prev.filter(id => id !== record.uniqueId));
                            }
                        },
                    }}
                    onRow={(r: any) => ({
                        onDoubleClick: () => window.open(`/sales/rfqs/${r.rfq_number || r.rfq_id}`, '_blank'),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>

            {/* Attachment preview */}
            <Modal title={previewTitle || 'Előnézet'} open={previewOpen}
                onCancel={() => { setPreviewOpen(false); setPreviewUrl(null); setPreviewTitle(''); }}
                footer={null} width={900}>
                {previewUrl ? (
                    isPdf(previewUrl) ? (
                        <div>
                            <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '65vh', border: 0 }} />
                            <div style={{ marginTop: 8, textAlign: 'center' }}>
                                <Button type="primary" onClick={() => openPdfPreview(previewUrl!)}>Megnyitás Print Preview-ban</Button>
                            </div>
                        </div>
                    ) : <img alt={previewTitle} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }} />
                ) : <div>Nincs előnézet</div>}
            </Modal>

            {/* Send-to-production modal */}
            <Modal title="Gyártásra kiküldés" open={sendModalOpen}
                onCancel={() => setSendModalOpen(false)} onOk={handleConfirmSend}
                confirmLoading={sendingProduction} okText="Küldés" cancelText="Mégse" width={840}
                okButtonProps={{ icon: <SendOutlined />, disabled: !sendModalGroups.length }}>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    Küldés előtt szerkeszthető a címzett, tárgy és törzs.
                </Typography.Paragraph>
                {!sendModalGroups.length ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>Nincs küldhető tétel.</div>
                ) : (
                    <Tabs activeKey={sendActiveKey} onChange={setSendActiveKey}
                        items={sendModalGroups.map(g => ({
                            key: g.key,
                            label: <Space size={6}><span>{`${g.label} (${g.cost_item_ids.length})`}</span><Switch size="small" checked={g.enabled} onChange={checked => updateSendGroup(g.key, { enabled: checked })} /></Space>,
                            children: (
                                <Form layout="vertical" size="small">
                                    <Form.Item label="Címzettek" required><Input placeholder="email1@example.com" value={g.recipients} onChange={e => updateSendGroup(g.key, { recipients: e.target.value })} /></Form.Item>
                                    <Form.Item label="Másolat (CC)"><Input placeholder="cc@example.com" value={g.cc} onChange={e => updateSendGroup(g.key, { cc: e.target.value })} /></Form.Item>
                                    <Form.Item label="E-mail sablonok">
                                        <Space>
                                            <Select placeholder="Válassz sablont" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
                                                onChange={(val: string) => val && (() => { const tpl = emailTemplates.find(t => t.key === val); if (!tpl) return; const ctx = { recipient_label: g.label, item_count: g.cost_item_ids.length }; updateSendGroup(g.key, { subject: renderTplForEditor(tpl.subject_template || '', ctx), body: renderTplForEditor(tpl.body_template || '', ctx), is_html: !!tpl.is_html, cc: tpl.default_cc || '', reply_to: tpl.default_reply_to || '' }); })()}
                                                options={emailTemplates.map(t => ({ label: `${t.name} (${t.key})`, value: t.key }))} />
                                            <Select placeholder="Aláírás" allowClear showSearch optionFilterProp="label" style={{ width: 180 }} value={g.signature_key || undefined}
                                                onChange={(val: string) => { if (!val) return; const sig = signatures.find(s => s.key === val); if (!sig) return; const sh = renderSignature(sig, user); if (sh) updateSendGroup(g.key, { signature_key: val, body: `${g.body}${sh}` }); }}
                                                options={signatures.map(s => ({ label: `${s.name} (${s.key})`, value: s.key }))} />
                                        </Space>
                                    </Form.Item>
                                    <Form.Item label="Tárgy"><Input value={g.subject} onChange={e => updateSendGroup(g.key, { subject: e.target.value })} /></Form.Item>
                                    <Form.Item label="Törzs"><ReactQuill theme="snow" value={g.body} onChange={(val: string) => updateSendGroup(g.key, { body: val })} style={{ height: 280, marginBottom: 50 }} /></Form.Item>
                                    <Form.Item label="Csatolmányok">
                                        <Table size="small" rowKey="id" pagination={false} dataSource={g.attachments} columns={[
                                            { title: 'Küld', key: 'include', width: 70, render: (_: any, att: any) => <Checkbox checked={!!att.include} onChange={e => updateGroupAtt(g.key, att.id, { include: e.target.checked })} /> },
                                            { title: 'Fájl', key: 'fn', render: (_: any, att: any) => <a href={att.file_url} onClick={e => { e.preventDefault(); setPreviewUrl(att.file_url); setPreviewTitle(att.file_name); setPreviewOpen(true); }}>{att.file_name}</a> },
                                            { title: 'Termék', dataIndex: 'product_name', key: 'pn', width: 160 },
                                            { title: 'Megjegyzés', key: 'rem', render: (_: any, att: any) => <Input value={att.remark} onChange={e => updateGroupAtt(g.key, att.id, { remark: e.target.value })} /> },
                                        ]} />
                                    </Form.Item>
                                </Form>
                            ),
                        }))}
                    />
                )}
                {sendModalGroups.length > 0 && (() => {
                    const g = sendModalGroups.find(grp => grp.key === sendActiveKey);
                    if (!g) return null;
                    const html = renderTemplateText(g.body, { recipient_label: g.label, item_count: g.cost_item_ids.length, item_table_html: g.item_table_html, internal_worksheet_table_html: g.internal_worksheet_table_html, queue_links_html: g.queue_links_html, selected_attachments_table_html: buildAttHtml(g) });
                    return <Collapse style={{ marginTop: 16 }} items={[{ key: 'preview', label: `Előnézet — ${g.label}`, children: <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 16, background: '#fff', fontSize: 13 }} dangerouslySetInnerHTML={{ __html: html }} /> }]} />;
                })()}
            </Modal>
        </div>
    );
};

export default OrderedProducts;
