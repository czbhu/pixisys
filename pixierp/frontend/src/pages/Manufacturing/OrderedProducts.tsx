import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import EnhancedTable from '../../components/EnhancedTable';
import '../Sales/RFQs.css';
import {
    Card,
    Button,
    Space,
    Select,
    message,
    Tag,
    Tooltip,
    Popover,
    Modal,
    Input,
    Table,
    Typography,
    Tabs,
    Form,
    Switch,
    Checkbox,
    Collapse,
    Upload,
    Spin,
} from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
    EyeOutlined,
    ReloadOutlined,
    PrinterOutlined,
    FieldTimeOutlined,
    MessageOutlined,
    SendOutlined,
    PaperClipOutlined,
    EditOutlined,
    DeleteOutlined,
    MenuOutlined,
} from '@ant-design/icons';
import { arrayMove } from '@dnd-kit/sortable';
import { CostDraggableRow, CostDragHandle } from '../../components/Manufacturing/CostDnd';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useAuth } from '../../contexts/AuthContext';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
import MaterialNeedsTree from '../../components/Manufacturing/MaterialNeedsTree';
import ExtraWorksPanel from '../../components/Sales/ExtraWorksPanel';
import api from '../../services/api';
import { settingsService } from '../../services/settingsService';
import { formatBytes } from '../../utils/fileUtils';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import { useNewRowTracker, newDotColumn } from '../../hooks/useNewRowTracker';

const ORDER_ITEM_STATUS_COLORS: Record<string, string> = {
    new: 'default',
    confirmed: 'blue',
    in_production: 'orange',
    ready: 'green',
    in_delivery: 'gold',
    delivered: 'success',
    cancelled: 'red',
};

const ORDER_ITEM_STATUS_LABELS: Record<string, string> = {
    new: 'Új',
    confirmed: 'Megerősítve',
    in_production: 'Gyártásban',
    ready: 'Kész',
    in_delivery: 'Szállítás alatt',
    delivered: 'Kiszállítva',
    cancelled: 'Törölve',
};

interface OrderedManufacturingItem {
    id: number;
    quote_item_id: number;
    order_id: number;
    order_number: string;
    order_date: string;
    order_status: string;
    status: string;
    customer_name: string;
    company_name?: string | null;
    contact_names?: string | null;
    is_private?: boolean;
    manufacturing_product_id: number | null;
    is_direct?: boolean;
    rfq_id?: number | null;
    rfq_item_id?: number | null;
    cost_items_data?: any[];
    name: string;
    code: string;
    description: string;
    internal_description: string;
    quantity: number;
    unit: string;
    net_unit_price: number;
    remark?: string;
    attachment_count?: number;
}

interface RenderedSendGroup {
    key: string;
    label: string;
    recipient: string;
    item_ids: number[];
    item_table_html: string;
}

interface ProductionSendGroup {
    key: string;
    label: string;
    enabled: boolean;
    signature_key: string;
    recipients: string;
    cc: string;
    reply_to: string;
    subject: string;
    body: string;
    is_html: boolean;
    cost_item_ids: number[];
    related_ordered_item_ids: number[];
    item_table_html: string;
    internal_worksheet_table_html: string;
    queue_links_html: string;
    attachments: Array<{
        id: string;
        source: 'product_attachment' | 'worksheet_pdf';
        include: boolean;
        file_url: string;
        file_name: string;
        product_name: string;
        remark: string;
        original_remark: string;
        worksheet_cost_item_id?: number;
    }>;
}

const renderTemplateText = (
    text: string,
    ctx: {
        recipient_label: string;
        item_count: number;
        item_table_html: string;
        internal_worksheet_table_html: string;
        queue_links_html: string;
        selected_attachments_table_html: string;
    }
) => {
    if (!text) return '';
    return text
        .replace(/\{recipient_label\}/g, ctx.recipient_label)
        .replace(/\{item_count\}/g, String(ctx.item_count))
        .replace(/\{item_table_html\}/g, ctx.item_table_html)
        .replace(/\{internal_worksheet_table_html\}/g, ctx.internal_worksheet_table_html)
        .replace(/\{queue_links_html\}/g, ctx.queue_links_html)
        .replace(/\{selected_attachments_table_html\}/g, ctx.selected_attachments_table_html);
};

const renderTemplateTextForEditor = (
    text: string,
    ctx: {
        recipient_label: string;
        item_count: number;
    }
) => {
    if (!text) return '';
    return text
        .replace(/\{recipient_label\}/g, ctx.recipient_label)
        .replace(/\{item_count\}/g, String(ctx.item_count));
};

const renderSignature = (sig: any, user: any) => {
    if (!sig?.body_html) return '';
    let s: string = sig.body_html;
    const uName = user?.last_name && user?.first_name
        ? `${user.last_name} ${user.first_name}`
        : (user?.username || user?.name || '');
    s = s.replace(/\{user_name\}/g, uName);
    s = s.replace(/\{user_email\}/g, user?.email || '');
    s = s.replace(/\{user_phonenumber\}/g, user?.employee_profile?.phone || user?.phone || '');
    s = s.replace(/\{user_position\}/g, user?.employee_profile?.position?.title || user?.position || '');
    return s;
};

const OrderedProducts: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();

    // Árak csak Ügyvezető és Adminisztráció osztályoknak láthatók (+ superuser/staff)
    const PRICE_ALLOWED_DEPARTMENTS = ['Ügyvezető', 'Adminisztráció'];
    const canViewPrices: boolean = !!(
        user?.is_superuser ||
        user?.is_staff ||
        (user?.department_names || []).some((d: string) => PRICE_ALLOWED_DEPARTMENTS.includes(d))
    );

    const [items, setItems] = useState<OrderedManufacturingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [filterOrderId, setFilterOrderId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string[]>([
        'new', 'confirmed', 'in_production', 'ready', 'in_delivery',
    ]);
    const [attachmentsByProduct, setAttachmentsByProduct] = useState<Record<number, any[]>>({});
    const [attachmentsLoading, setAttachmentsLoading] = useState<Record<number, boolean>>({});
    const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);
    const [orderItemAtts, setOrderItemAtts] = useState<Record<number, any[]>>({});
    const [orderItemAttsLoaded, setOrderItemAttsLoaded] = useState<Record<number, boolean>>({});
    const [orderItemAttUploading, setOrderItemAttUploading] = useState<Record<number, number>>({});
    const [orderItemAttRemark, setOrderItemAttRemark] = useState<Record<number, string>>({});
    const [editingAttRemarkId, setEditingAttRemarkId] = useState<number | null>(null);
    const [editingAttRemarkVal, setEditingAttRemarkVal] = useState('');
    const [editingAttNameId, setEditingAttNameId] = useState<number | null>(null);
    const [editingAttNameVal, setEditingAttNameVal] = useState('');

    // --- Clipboard paste for attachment upload rows ---
    const lastPasteCoiIdRef = useRef<number | null>(null);
    const orderItemAttRemarkRef = useRef<Record<number, string>>({});
    useEffect(() => { orderItemAttRemarkRef.current = orderItemAttRemark; }, [orderItemAttRemark]);
    const handleOPPasteFile = useCallback((file: File) => {
        const coiId = lastPasteCoiIdRef.current;
        if (!coiId) return;
        setOrderItemAttUploading(prev => ({ ...prev, [coiId]: (prev[coiId] || 0) + 1 }));
        const fd = new FormData();
        fd.append('file', file);
        const remark = orderItemAttRemarkRef.current[coiId] || '';
        if (remark) fd.append('remark', remark);
        api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            .then(res => {
                setOrderItemAtts(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
                message.success('Kép feltöltve');
            })
            .catch(() => message.error('Feltöltés sikertelen'))
            .finally(() => setOrderItemAttUploading(prev => ({ ...prev, [coiId]: Math.max(0, (prev[coiId] || 0) - 1) })));
    }, []);
    useClipboardImagePaste(handleOPPasteFile, expandedRowKeys.length > 0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
    const [sendingProduction, setSendingProduction] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [sendModalLoading, setSendModalLoading] = useState(false);
    const [sendModalGroups, setSendModalGroups] = useState<ProductionSendGroup[]>([]);
    const [sendActiveKey, setSendActiveKey] = useState('');
    const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
    const [signatures, setSignatures] = useState<any[]>([]);

    useEffect(() => {
        loadItems();
    }, []);

    useEffect(() => {
        const orderParam = Number(searchParams.get('order') || 0);
        if (orderParam > 0) setFilterOrderId(orderParam);
    }, [searchParams]);

    const loadItems = async () => {
        try {
            setLoading(true);
            const data = await salesService.getOrderedManufacturingItems();
            setItems(data);
            loadNewOPIds(data.map((r: any) => r.id).filter(Boolean));
        } catch (err) {
            console.error('Error loading ordered manufacturing items:', err);
            message.error('Hiba történt a megrendelt gyártások betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        const prev = items;
        setItems(items.map(it => it.id === id ? { ...it, status: newStatus } : it));
        try {
            await api.patch(`/sales/customer-order-items/${id}/`, { status: newStatus });
            message.success('Státusz frissítve');
        } catch (e) {
            console.error(e);
            message.error('Státusz frissítése sikertelen');
            setItems(prev);
        }
    };

    const handleStartTimer = (record: OrderedManufacturingItem) => {
        setPreselectedOrderId(record.order_id);
        setPreselectedItemId(record.id);
        setTimerModalOpen(true);
    };

    const handlePrintWorksheet = async (record: OrderedManufacturingItem) => {
        try {
            const response = await api.get(
                `/manufacturing/cost-items/work_sheet_for_product/?product_id=${record.manufacturing_product_id}`,
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (e: any) {
            if (e?.response?.status === 404) {
                message.warning('Ehhez a termékhez nincs nyomtatható altétel munkalap.');
            } else {
                console.error(e);
                message.error('Hiba a munkalap letöltése során');
            }
        }
    };

    const escapeHtml = (text: string) =>
        (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    const updateSendGroup = (key: string, patch: Partial<ProductionSendGroup>) => {
        setSendModalGroups((groups) => groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
    };

    const updateGroupAttachment = (
        groupKey: string,
        attachmentId: string,
        patch: Partial<ProductionSendGroup['attachments'][number]>
    ) => {
        setSendModalGroups((groups) =>
            groups.map((g) => {
                if (g.key !== groupKey) return g;
                return {
                    ...g,
                    attachments: g.attachments.map((att) =>
                        att.id === attachmentId ? { ...att, ...patch } : att
                    ),
                };
            })
        );
    };

    const buildSelectedAttachmentsTableHtml = (group: ProductionSendGroup) => {
        const selected = group.attachments.filter((att) => att.include);
        if (selected.length === 0) return '<p>Nincs kiválasztott csatolmány.</p>';
        const rows = selected
            .map((att) => {
                const remark = escapeHtml(att.remark || '-');
                const link = `<a href="${escapeHtml(att.file_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(att.file_name)}</a>`;
                return `<tr><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(att.product_name)}</td><td style="border:1px solid #ddd;padding:4px 8px">${link}</td><td style="border:1px solid #ddd;padding:4px 8px">${remark}</td></tr>`;
            })
            .join('');
        return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Termék</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Csatolmány link</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Megjegyzés</th></tr></thead><tbody>${rows}</tbody></table>`;
    };

    const handleApplyTemplate = (group: ProductionSendGroup, templateKey: string) => {
        const tpl = emailTemplates.find((t) => t.key === templateKey);
        if (!tpl) return;
        const ctx = {
            recipient_label: group.label,
            item_count: group.cost_item_ids.length,
        };
        const subject = renderTemplateTextForEditor(tpl.subject_template || '', ctx);
        const body = renderTemplateTextForEditor(tpl.body_template || '', ctx);
        updateSendGroup(group.key, {
            subject,
            body,
            is_html: !!tpl.is_html,
            cc: tpl.default_cc || '',
            reply_to: tpl.default_reply_to || '',
        });
    };

    const handleApplySignature = (group: ProductionSendGroup, signatureKey: string) => {
        const signature = signatures.find((s) => s.key === signatureKey);
        if (!signature) return;
        const sigHtml = renderSignature(signature, user);
        if (!sigHtml) return;
        updateSendGroup(group.key, {
            signature_key: signatureKey,
            body: `${group.body}${group.is_html ? '' : '\n\n'}${sigHtml}`,
        });
    };

    const handleSendToProduction = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Nincs kijelölt tétel.');
            return;
        }

        try {
            setSendModalLoading(true);
            setSendingProduction(true);

            const selectedItems = items.filter((it) => selectedRowKeys.includes(it.id));
            const productCache = new Map<number, any>();
            const productAttachmentsMap = new Map<number, any[]>();
            const costItemMetaById: Record<number, { orderedItem: OrderedManufacturingItem; costItem: any }> = {};
            const costItemIds: number[] = [];

            for (const orderedItem of selectedItems) {
                if (!orderedItem.manufacturing_product_id) continue;
                const mpId: number = orderedItem.manufacturing_product_id;
                let product = productCache.get(mpId);
                if (!product) {
                    product = await manufacturingService.getProduct(mpId);
                    productCache.set(mpId, product);
                }

                const productCostItems = Array.isArray(product?.cost_items) ? product.cost_items : [];
                if (!productAttachmentsMap.has(mpId)) {
                    let atts = attachmentsByProduct[mpId];
                    if (atts === undefined) {
                        try {
                            atts = await manufacturingService.getProductAttachments(mpId);
                            setAttachmentsByProduct((prev) => ({
                                ...prev,
                                [mpId]: Array.isArray(atts) ? atts : [],
                            }));
                        } catch {
                            atts = [];
                        }
                    }
                    productAttachmentsMap.set(mpId, Array.isArray(atts) ? atts : []);
                }
                productCostItems.forEach((ci: any) => {
                    const ciId = Number(ci?.id || 0);
                    if (!ciId) return;
                    if (!costItemMetaById[ciId]) {
                        costItemMetaById[ciId] = { orderedItem, costItem: ci };
                        costItemIds.push(ciId);
                    }
                });
            }

            if (costItemIds.length === 0) {
                message.warning('A kijelölt termékekhez nem tartozik kiküldhető gyártási altétel.');
                return;
            }

            const { data: rendered } = await api.post('/manufacturing/cost-items/render_supplier_order/', {
                cost_item_ids: costItemIds,
            });

            const groups: RenderedSendGroup[] = Array.isArray(rendered?.groups) ? rendered.groups : [];
            if (groups.length === 0) {
                message.warning('Nem találtam címzettet a kijelölt gyártási tételekhez.');
                return;
            }

            let templates: any[] = [];
            let sigs: any[] = [];
            try {
                const [tplRes, sigRes] = await Promise.all([
                    settingsService.getEmailTemplates(),
                    settingsService.getSignatures(),
                ]);
                templates = Array.isArray(tplRes) ? tplRes : [];
                sigs = Array.isArray(sigRes) ? sigRes : [];
            } catch {
                templates = [];
                sigs = [];
            }
            setEmailTemplates(templates);
            setSignatures(sigs);

            const defaultTemplate = templates.find((t) => t.key === 'manufacturing_ordered_products_send')
                || templates.find((t) => t.key === 'manufacturing_supplier_order');
            const defaultSignature = sigs.find((s) => s.key === 'default') || sigs[0];

            const modalGroups: ProductionSendGroup[] = [];

            groups.forEach((group) => {
                const ids = Array.isArray(group.item_ids) ? group.item_ids : [];
                const orderRows = Array.from(new Set(
                    ids
                        .map((id) => costItemMetaById[id]?.orderedItem)
                        .filter(Boolean)
                )) as OrderedManufacturingItem[];
                const relatedOrderedItemIds = Array.from(new Set(
                    ids
                        .map((id) => costItemMetaById[id]?.orderedItem?.id)
                        .filter(Boolean)
                )) as number[];
                const internalWorksheetRows = ids
                    .map((id) => {
                        const meta = costItemMetaById[id];
                        if (!meta) return '';
                        const oi = meta.orderedItem;
                        const ci = meta.costItem;
                        const ciQty = Number(ci?.quantity || 0);
                        const ciUnit = ci?.unit || '';
                        const ciName = ci?.name || 'Altétel';
                        const ciNotes = ci?.notes || '';
                        return `<tr><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(oi.order_number)}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(oi.name)}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(oi.internal_description || '-')}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(ciName)}</td><td style="border:1px solid #ddd;padding:4px 8px;text-align:right">${escapeHtml(ciQty.toLocaleString('hu-HU', { maximumFractionDigits: 3 }))} ${escapeHtml(ciUnit)}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(ciNotes || '-')}</td></tr>`;
                    })
                    .filter(Boolean)
                    .join('');

                const internalWorksheetTableHtml = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Megrendelés</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Termék</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Belső leírás</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Altétel</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Mennyiség</th><th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Megjegyzés</th></tr></thead><tbody>${internalWorksheetRows || '<tr><td colspan="6" style="border:1px solid #ddd;padding:4px 8px">Nincs adat</td></tr>'}</tbody></table>`;

                const queueLinksHtml = orderRows.length > 0
                    ? `<ul style="margin:0;padding-left:18px">${orderRows.map((oi) => {
                        const orderId = Number(oi.order_id || 0);
                        const href = `${window.location.origin}/manufacturing/queue?order=${orderId}`;
                        return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(oi.order_number)} - gyártási sor</a></li>`;
                    }).join('')}</ul>`
                    : '<p>Nincs gyártási sor link.</p>';

                const attachmentMap = new Map<string, {
                    id: string;
                    source: 'product_attachment' | 'worksheet_pdf';
                    include: boolean;
                    file_url: string;
                    file_name: string;
                    product_name: string;
                    remark: string;
                    original_remark: string;
                    worksheet_cost_item_id?: number;
                }>();

                orderRows.forEach((oi) => {
                    if (!oi.manufacturing_product_id) return;
                    const atts = productAttachmentsMap.get(oi.manufacturing_product_id)
                        || attachmentsByProduct[oi.manufacturing_product_id]
                        || [];
                    atts.forEach((att: any) => {
                        const url = att.file_url || att.file || '';
                        if (!url) return;
                        const idKey = `att_${att.id}_${oi.manufacturing_product_id}`;
                        if (attachmentMap.has(idKey)) return;
                        attachmentMap.set(idKey, {
                            id: idKey,
                            source: 'product_attachment',
                            include: false,
                            file_url: url,
                            file_name: (url.split('/').pop() || `#${att.id}`),
                            product_name: oi.name,
                            remark: att.remark || '',
                            original_remark: att.remark || '',
                            worksheet_cost_item_id: undefined,
                        });
                    });
                    const wsCostItemId = ids.find((cid) => costItemMetaById[cid]?.orderedItem?.id === oi.id) || ids[0];
                    const wsUrl = `${window.location.origin}/api/v1/manufacturing/cost-items/${wsCostItemId}/work_sheet/`;
                    const wsKey = `worksheet_${oi.id}`;
                    if (!attachmentMap.has(wsKey)) {
                        attachmentMap.set(wsKey, {
                            id: wsKey,
                            source: 'worksheet_pdf',
                            include: true,
                            file_url: wsUrl,
                            file_name: `munkalap_${oi.order_number}.pdf`,
                            product_name: oi.name,
                            remark: 'Belső munkalap PDF',
                            original_remark: 'Belső munkalap PDF',
                            worksheet_cost_item_id: wsCostItemId,
                        });
                    }
                });

                let subject = `Új megrendelés érkezett - ${group.label}`;
                let bodyHtml = [
                    `<p>Tisztelt ${escapeHtml(group.label || 'Partner')}!</p>`,
                    `<p>Új megrendelés érkezett.</p>`,
                    `<p>Kérjük, az alábbi tételek gyártását indítsák el:</p>`,
                    '{item_table_html}',
                    `<p><strong>Gyártási sor link(ek):</strong></p>`,
                    '{queue_links_html}',
                    `<p><strong>Belső munkalap:</strong></p>`,
                    '{internal_worksheet_table_html}',
                    `<p><strong>Kiválasztott csatolmányok:</strong></p>`,
                    '{selected_attachments_table_html}',
                    `<p>Köszönettel,<br>PixiERP</p>`,
                ].join('');

                if (defaultTemplate) {
                    const ctx = {
                        recipient_label: group.label,
                        item_count: ids.length,
                    };
                    subject = renderTemplateTextForEditor(defaultTemplate.subject_template || subject, ctx);
                    bodyHtml = renderTemplateTextForEditor(defaultTemplate.body_template || bodyHtml, ctx);
                }

                if (defaultSignature) {
                    const sigHtml = renderSignature(defaultSignature, user);
                    if (sigHtml) {
                        bodyHtml += sigHtml;
                    }
                }

                modalGroups.push({
                    key: group.key,
                    label: group.label,
                    enabled: true,
                    signature_key: defaultSignature?.key || '',
                    recipients: group.recipient || '',
                    cc: defaultTemplate?.default_cc || '',
                    reply_to: defaultTemplate?.default_reply_to || '',
                    subject,
                    body: bodyHtml,
                    is_html: true,
                    cost_item_ids: ids,
                    related_ordered_item_ids: relatedOrderedItemIds,
                    item_table_html: group.item_table_html || '',
                    internal_worksheet_table_html: internalWorksheetTableHtml,
                    queue_links_html: queueLinksHtml,
                    attachments: Array.from(attachmentMap.values()),
                });
            });

            setSendModalGroups(modalGroups);
            setSendActiveKey(modalGroups[0]?.key || '');
            setSendModalOpen(true);
        } catch (err: any) {
            console.error(err);
            message.error(err?.response?.data?.error || 'Gyártási megrendelés kiküldése sikertelen.');
        } finally {
            setSendingProduction(false);
            setSendModalLoading(false);
        }
    };

    const handleConfirmSendFromModal = async () => {
        const groupsToSend = sendModalGroups.filter((g) => g.enabled);
        if (groupsToSend.length === 0) {
            message.warning('Nincs bekapcsolt csoport a küldéshez.');
            return;
        }
        const missing = groupsToSend.filter((g) => !g.recipients.trim());
        if (missing.length > 0) {
            message.warning(`Hiányzó címzett: ${missing.map((g) => g.label).join(', ')}`);
            return;
        }
        try {
            setSendingProduction(true);
            const payload = {
                groups: groupsToSend.map((g) => ({
                    key: g.key,
                    label: g.label,
                    cost_item_ids: g.cost_item_ids,
                    recipients: g.recipients.trim(),
                    cc: g.cc.trim(),
                    reply_to: g.reply_to.trim(),
                    subject: g.subject,
                    body: renderTemplateText(g.body, {
                        recipient_label: g.label,
                        item_count: g.cost_item_ids.length,
                        item_table_html: g.item_table_html,
                        internal_worksheet_table_html: g.internal_worksheet_table_html,
                        queue_links_html: g.queue_links_html,
                        selected_attachments_table_html: buildSelectedAttachmentsTableHtml(g),
                    }),
                    is_html: g.is_html,
                    attach_worksheet_pdf: g.attachments.some((att) => att.include && att.source === 'worksheet_pdf'),
                    worksheet_cost_item_ids: g.attachments
                        .filter((att) => att.include && att.source === 'worksheet_pdf')
                        .map((att) => Number(att.worksheet_cost_item_id || 0))
                        .filter(Boolean),
                })),
            };
            const { data: sendRes } = await api.post('/manufacturing/cost-items/send_supplier_order/', payload);
            const results = Array.isArray(sendRes?.results) ? sendRes.results : [];
            const failedKeys = new Set(results.filter((r: any) => !r.sent).map((r: any) => r.key));
            const failedOrderedItemIds = Array.from(new Set(
                sendModalGroups
                    .filter((g) => failedKeys.has(g.key))
                    .flatMap((g) => g.related_ordered_item_ids)
            ));
            const sentCount = results.filter((r: any) => r.sent).length;
            const failedCount = results.length - sentCount;
            if (sentCount > 0) {
                message.success(`${sentCount} gyártási e-mail elküldve.`);
            }
            if (failedCount > 0) {
                const errors = results
                    .filter((r: any) => !r.sent)
                    .map((r: any) => `${r.label}: ${r.error || 'ismeretlen hiba'}`)
                    .join('\n');
                Modal.error({
                    title: 'Néhány e-mail nem ment ki',
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{errors}</pre>,
                });
            }
            setSelectedRowKeys(failedOrderedItemIds as number[]);
            setSendModalOpen(false);
            await loadItems();
        } catch (err: any) {
            console.error(err);
            message.error(err?.response?.data?.error || 'Gyártási megrendelés kiküldése sikertelen.');
        } finally {
            setSendingProduction(false);
        }
    };

    const handleAddNote = async (record: OrderedManufacturingItem) => {
        const existing: string = record.remark || '';
        let value = existing;
        Modal.confirm({
            title: `Megjegyzés — ${record.name}`,
            width: 600,
            icon: <MessageOutlined />,
            content: (
                <Input.TextArea
                    defaultValue={existing}
                    rows={6}
                    onChange={(e) => { value = e.target.value; }}
                    placeholder="Írja be a megjegyzést..."
                />
            ),
            okText: 'Mentés',
            cancelText: 'Mégse',
            onOk: async () => {
                try {
                    await api.patch(`/sales/customer-order-items/${record.id}/`, { remark: value });
                    setItems(prev => prev.map(it => it.id === record.id ? { ...it, remark: value } : it));
                    message.success('Megjegyzés mentve');
                } catch (e) {
                    console.error(e);
                    message.error('Megjegyzés mentése sikertelen');
                }
            },
        });
    };

    const loadOrderItemAtts = (coiId: number) => {
        if (orderItemAttsLoaded[coiId]) return;
        api.get(`/sales/customer-order-items/${coiId}/attachments/`)
            .then(res => setOrderItemAtts(prev => ({ ...prev, [coiId]: res.data || [] })))
            .catch(() => setOrderItemAtts(prev => ({ ...prev, [coiId]: [] })))
            .finally(() => setOrderItemAttsLoaded(prev => ({ ...prev, [coiId]: true })));
    };

    const loadSubItems = async (record: OrderedManufacturingItem) => {
        // Also load order-item level attachments
        loadOrderItemAtts(record.id);
        const productId = record.manufacturing_product_id;
        if (!productId || attachmentsByProduct[productId] !== undefined || attachmentsLoading[productId]) return;
        setAttachmentsLoading(prev => ({ ...prev, [productId]: true }));
        try {
            const atts = await manufacturingService.getProductAttachments(productId);
            setAttachmentsByProduct(prev => ({ ...prev, [productId]: Array.isArray(atts) ? atts : [] }));
        } catch (e) {
            console.error(e);
            setAttachmentsByProduct(prev => ({ ...prev, [productId]: [] }));
        } finally {
            setAttachmentsLoading(prev => ({ ...prev, [productId]: false }));
        }
    };

    const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url || '');
    const isPdfFile = (url: string) => /\.pdf(\?|$)/i.test(url || '');

    const openPreview = (url: string, title: string) => {
        setPreviewUrl(url);
        setPreviewTitle(title || 'Előnézet');
        setPreviewOpen(true);
    };

    const expandedRowRender = (record: OrderedManufacturingItem) => {
        const productId = record.manufacturing_product_id;
        const coiId = record.id;
        const attachments = productId ? (attachmentsByProduct[productId] || []) : [];
        const loadingAtt = productId ? !!attachmentsLoading[productId] : false;
        const itemAtts: any[] = orderItemAtts[coiId] || [];
        const itemAttsLoaded = !!orderItemAttsLoaded[coiId];
        const itemAttUploading = (orderItemAttUploading[coiId] || 0) > 0;
        const attRemark = orderItemAttRemark[coiId] || '';

        return (
            <div style={{ padding: '8px 0 8px 32px' }}>
                {productId != null ? (
                    <>
                        <ProductSubItemsTable productId={productId} showNotesAndAttachments showPrices={canViewPrices} />
                        <MaterialNeedsTree
                            manufacturingProductId={productId}
                            quantity={Number(record.quantity || 1)}
                            sourceType="ordered_product"
                            sourceId={Number(record.id || 0)}
                            sourceNumber={record.order_number || String(record.id || '')}
                            sourceItemName={record.name || ''}
                        />
                    </>
                ) : (record.cost_items_data && record.cost_items_data.length > 0) ? (
                    <ProductSubItemsTable
                        productId={0}
                        dataSource={record.cost_items_data}
                        showNotesAndAttachments
                        showPrices={canViewPrices}
                        qriId={record.rfq_item_id ?? undefined}
                        onPersistAll={async (updatedItems) => {
                            if (!record.rfq_item_id) return;
                            await salesService.updateQuoteRequestItem(record.rfq_item_id, { cost_items_data: updatedItems });
                            setItems(prev => prev.map(it =>
                                it.id === record.id ? { ...it, cost_items_data: updatedItems } : it
                            ));
                        }}
                    />
                ) : null}

                {/* Order-item level attachments */}
                <div style={{ marginTop: 14, maxWidth: 700 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Csatolmányok</div>
                    <Space direction="vertical" style={{ width: '100%' }} size={6}>
                        <Input
                            placeholder="Megjegyzés a feltöltéshez (opcionális)"
                            size="small"
                            value={attRemark}
                            style={{ width: 340 }}
                            onChange={e => setOrderItemAttRemark(prev => ({ ...prev, [coiId]: e.target.value }))}
                        />
                        <div
                            onMouseEnter={() => { lastPasteCoiIdRef.current = coiId; }}
                        >
                        <Upload.Dragger
                            multiple
                            showUploadList={false}
                            style={{ padding: '8px 0' }}
                            customRequest={({ file, onSuccess, onError }) => {
                                const f = file as File;
                                setOrderItemAttUploading(prev => ({ ...prev, [coiId]: (prev[coiId] || 0) + 1 }));
                                const fd = new FormData();
                                fd.append('file', f);
                                if (attRemark) fd.append('remark', attRemark);
                                api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                                    .then(res => {
                                        setOrderItemAtts(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
                                        setOrderItemAttRemark(prev => ({ ...prev, [coiId]: '' }));
                                        message.success('Feltöltve');
                                        onSuccess?.(res.data);
                                    })
                                    .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                                    .finally(() => setOrderItemAttUploading(prev => ({ ...prev, [coiId]: Math.max(0, (prev[coiId] || 0) - 1) })));
                            }}
                        >
                            {itemAttUploading
                                ? <><Spin size="small" /> <span style={{ fontSize: 12, color: '#888' }}>Feltöltés…</span></>
                                : <span style={{ fontSize: 12, color: '#888' }}>Húzd ide a fájlokat, kattints &middot; vagy Ctrl+V</span>
                            }
                        </Upload.Dragger>
                        </div>
                        {!itemAttsLoaded ? <Spin size="small" /> : itemAtts.length === 0 ? (
                            <div style={{ color: '#bbb', fontSize: 12 }}>Nincs csatolmány</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {itemAtts.map((att: any) => (
                                    <Space key={att.id} size={4} align="center">
                                        <PaperClipOutlined style={{ color: '#888', fontSize: 12 }} />
                                        {editingAttNameId === att.id ? (
                                            <Space size={4}>
                                                <Input
                                                    size="small"
                                                    autoFocus
                                                    value={editingAttNameVal}
                                                    style={{ width: 180 }}
                                                    onChange={e => setEditingAttNameVal(e.target.value)}
                                                    onPressEnter={async () => {
                                                        try {
                                                            const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/rename/`, { original_filename: editingAttNameVal });
                                                            setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.data.original_filename } : a) }));
                                                            setEditingAttNameId(null);
                                                        } catch { message.error('Átnevezés sikertelen'); }
                                                    }}
                                                />
                                                <Button size="small" type="primary" onClick={async () => {
                                                    try {
                                                        const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/rename/`, { original_filename: editingAttNameVal });
                                                        setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, original_filename: res.data.original_filename } : a) }));
                                                        setEditingAttNameId(null);
                                                    } catch { message.error('Átnevezés sikertelen'); }
                                                }}>✓</Button>
                                                <Button size="small" onClick={() => setEditingAttNameId(null)}>✗</Button>
                                            </Space>
                                        ) : (
                                            <Space size={2}>
                                                <a
                                                href={att.file_url}
                                                style={{ fontSize: 12 }}
                                                onClick={(e) => { e.preventDefault(); openPreview(att.file_url, att.original_filename || att.file_url?.split('/').pop() || `#${att.id}`); }}
                                            >{att.original_filename || att.file_url?.split('/').pop() || `#${att.id}`}</a>
                                                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />} title="Átnevezés" style={{ padding: '0 2px' }}
                                                    onClick={() => { setEditingAttNameId(att.id); setEditingAttNameVal(att.original_filename || att.file_url?.split('/').pop() || ''); }}
                                                />
                                            </Space>
                                        )}
                                        {att.file_size ? <span style={{ fontSize: 11, color: '#999' }}>{formatBytes(att.file_size)}</span> : null}
                                        {editingAttRemarkId === att.id ? (
                                            <Space size={4}>
                                                <Input
                                                    size="small"
                                                    autoFocus
                                                    value={editingAttRemarkVal}
                                                    style={{ width: 200 }}
                                                    onChange={e => setEditingAttRemarkVal(e.target.value)}
                                                    onPressEnter={async () => {
                                                        try {
                                                            const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/remark/`, { remark: editingAttRemarkVal });
                                                            setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                                                            setEditingAttRemarkId(null);
                                                        } catch { message.error('Mentés sikertelen'); }
                                                    }}
                                                />
                                                <Button size="small" type="primary" onClick={async () => {
                                                    try {
                                                        const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/remark/`, { remark: editingAttRemarkVal });
                                                        setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                                                        setEditingAttRemarkId(null);
                                                    } catch { message.error('Mentés sikertelen'); }
                                                }}>Mentés</Button>
                                                <Button size="small" onClick={() => setEditingAttRemarkId(null)}>Mégsem</Button>
                                            </Space>
                                        ) : (
                                            <span
                                                style={{ color: att.remark ? '#595959' : '#bbb', fontSize: 11, fontStyle: att.remark ? 'italic' : 'normal', cursor: 'pointer' }}
                                                title="Kattints a megjegyzés szerkesztéséhez"
                                                onClick={() => { setEditingAttRemarkId(att.id); setEditingAttRemarkVal(att.remark || ''); }}
                                            >
                                                {att.remark || '+ megjegyzés'}
                                            </span>
                                        )}
                                        <Button type="text" danger size="small" icon={<DeleteOutlined />}
                                            onClick={async () => {
                                                try {
                                                    await api.delete(`/sales/customer-order-items/${coiId}/attachments/${att.id}/`);
                                                    setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).filter((a: any) => a.id !== att.id) }));
                                                } catch { message.error('Törlés sikertelen'); }
                                            }}
                                        />
                                        <Button
                                            type={att.is_documentation ? 'primary' : 'dashed'}
                                            size="small"
                                            style={{ fontSize: 10, padding: '0 5px', height: 20, lineHeight: '18px', color: att.is_documentation ? undefined : '#888' }}
                                            title="Kész dokumentáció jelölés"
                                            onClick={async () => {
                                                try {
                                                    const res = await api.patch(`/sales/customer-order-items/${coiId}/attachments/${att.id}/documentation/`, { is_documentation: !att.is_documentation });
                                                    setOrderItemAtts(prev => ({ ...prev, [coiId]: (prev[coiId] || []).map((a: any) => a.id === att.id ? { ...a, is_documentation: res.data.is_documentation } : a) }));
                                                } catch { message.error('Mentés sikertelen'); }
                                            }}
                                        >📋</Button>
                                    </Space>
                                ))}
                            </div>
                        )}
                    </Space>
                </div>

                {/* Product-level attachments */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Termék szintű csatolmányok</div>
                    <Table
                        size="small"
                        loading={loadingAtt}
                        dataSource={attachments}
                        rowKey="id"
                        pagination={false}
                        locale={{ emptyText: 'Nincs csatolmány' }}
                        columns={[
                            {
                                title: 'Fájl',
                                key: 'file',
                                render: (_: any, att: any) => {
                                    const url = att.file_url || att.file || '';
                                    const name = url ? (url.split('/').pop() || `#${att.id}`) : `#${att.id}`;
                                    return (
                                        <a
                                            href={url}
                                            onClick={(e) => { e.preventDefault(); openPreview(url, name); }}
                                        >{name}</a>
                                    );
                                },
                            },
                            {
                                title: 'Megjegyzés',
                                dataIndex: 'remark',
                                key: 'remark',
                                render: (v: string) => v || '-',
                            },
                            {
                                title: 'Preview',
                                key: 'preview',
                                width: 110,
                                render: (_: any, att: any) => {
                                    const url = att.file_url || att.file || '';
                                    const name = url ? (url.split('/').pop() || `#${att.id}`) : `#${att.id}`;
                                    if (!url) return '-';
                                    if (isImageFile(url) || isPdfFile(url)) {
                                        return <Button size="small" onClick={() => openPreview(url, name)}>Előnézet</Button>;
                                    }
                                    return '-';
                                },
                            },
                            {
                                title: 'Feltöltve',
                                dataIndex: 'created_at',
                                key: 'created_at',
                                width: 160,
                                render: (v: string) => v ? new Date(v).toLocaleString('hu-HU') : '-',
                            },
                        ]}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/sales/customer-orders/${record.order_id}/items/${record.id}/subitems`)}>
                        Megnyitás teljes lapon
                    </Button>
                </div>
                <ExtraWorksPanel
                    orderId={record.order_id}
                    showPrices={canViewPrices}
                />
            </div>
        );
    };

    const normalize = (s: any) =>
        (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const filtered = (() => {
        let result = items;
        if (filterOrderId) {
            result = result.filter(i => i.order_id === filterOrderId);
        }
        if (statusFilter.length > 0) {
            result = result.filter(i => statusFilter.includes(i.status));
        }
        const q = normalize(query);
        if (q) {
            result = result.filter(i =>
                normalize([i.order_number, i.customer_name, i.name, i.code, i.description, i.internal_description].join(' ')).includes(q)
            );
        }
        return result;
    })();

    const onRowReorder = async (activeId: string | number, overId: string | number) => {
        const activeItem = filtered.find(r => r.id === Number(activeId));
        const overItem = filtered.find(r => r.id === Number(overId));
        if (!activeItem || !overItem || activeItem.id === overItem.id) return;
        const oldIdx = filtered.findIndex(r => r.id === activeItem.id);
        const newIdx = filtered.findIndex(r => r.id === overItem.id);
        if (oldIdx < 0 || newIdx < 0) return;
        const reorderedFiltered = arrayMove(filtered, oldIdx, newIdx);
        const filteredIds = new Set(filtered.map(r => r.id));
        const others = items.filter(r => !filteredIds.has(r.id));
        const newItems = [...reorderedFiltered, ...others];
        setItems(newItems);
        try {
            await api.post('/manufacturing/cost-items/reorder_by_coi/', {
                coi_ids: reorderedFiltered.map(r => r.id),
            });
        } catch (e) {
            console.error(e);
            message.error('Sorrend mentése sikertelen');
            loadItems();
        }
    };

    const { newIds: newOPIds, markSeen: markOPSeen, loadNewIds: loadNewOPIds } = useNewRowTracker('/manufacturing/ordered-products');

    const columns = [
        {
            title: '',
            key: 'drag',
            width: 32,
            render: () => <CostDragHandle />,
        },
        newDotColumn(newOPIds),
        {
            title: 'Megrendelés',
            dataIndex: 'order_number',
            key: 'order_number',
            width: 130,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) => a.order_number.localeCompare(b.order_number),
        },
        {
            title: 'Dátum',
            dataIndex: 'order_date',
            key: 'order_date',
            width: 100,
            render: (d: string) => d ? dayjs(d).format('YYYY.MM.DD') : '-',
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                new Date(a.order_date || 0).getTime() - new Date(b.order_date || 0).getTime(),
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (s: string, record: OrderedManufacturingItem) => {
                const color = ORDER_ITEM_STATUS_COLORS[s] || 'default';
                const text = ORDER_ITEM_STATUS_LABELS[s] || s;
                const content = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.keys(ORDER_ITEM_STATUS_LABELS).map(opt => (
                            <Button
                                key={opt}
                                size="small"
                                type={opt === s ? 'primary' : 'text'}
                                disabled={opt === s}
                                style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(record.id, opt);
                                }}
                            >
                                {ORDER_ITEM_STATUS_LABELS[opt]}
                            </Button>
                        ))}
                    </div>
                );
                return (
                    <Popover
                        content={content}
                        title="Státusz váltás"
                        trigger="click"
                        styles={{ body: { padding: '6px 8px' } }}
                    >
                        <Tag
                            color={color}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {text}
                        </Tag>
                    </Popover>
                );
            },
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                (ORDER_ITEM_STATUS_LABELS[a.status] || a.status).localeCompare(ORDER_ITEM_STATUS_LABELS[b.status] || b.status),
        },
        {
            title: 'Ügyfél',
            dataIndex: 'customer_name',
            key: 'customer_name',
            width: 160,
            ellipsis: true,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) => {
                const aName = a.is_private ? (a.contact_names || '') : (a.company_name || a.customer_name || '');
                const bName = b.is_private ? (b.contact_names || '') : (b.company_name || b.customer_name || '');
                return aName.localeCompare(bName, 'hu');
            },
            render: (_: any, r: OrderedManufacturingItem): React.ReactNode => {
                const primaryName = r.is_private
                    ? (r.contact_names || r.customer_name || 'Magánszemély')
                    : (r.company_name || r.customer_name || '—');
                const secondaryName = r.is_private ? null : r.contact_names;
                const tooltipText = [primaryName, secondaryName].filter(Boolean).join(' – ');
                return (
                    <Tooltip title={tooltipText}>
                        <div>
                            <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{primaryName}</div>
                            {r.is_private && <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>Magánszemély</div>}
                            {secondaryName && <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryName}</div>}
                        </div>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Cikkszám',
            dataIndex: 'code',
            key: 'code',
            width: 110,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                (a.code || '').localeCompare(b.code || ''),
        },
        {
            title: 'Termék neve',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                a.name.localeCompare(b.name),
        },
        {
            title: 'Leírás',
            dataIndex: 'description',
            key: 'description',
            width: 220,
            ellipsis: true,
            render: (text: string) => <Tooltip title={text}><span>{text}</span></Tooltip>,
        },
        {
            title: 'Megjegyzés',
            dataIndex: 'remark',
            key: 'remark',
            width: 180,
            ellipsis: true,
            render: (text: string, record: OrderedManufacturingItem) => (
                <Tooltip title={text}>
                    <span
                        style={{ color: text ? '#595959' : '#bbb', cursor: 'pointer', fontSize: 12, fontStyle: text ? 'italic' : 'normal' }}
                        onClick={(e) => { e.stopPropagation(); handleAddNote(record); }}
                    >
                        {text || '+ megjegyzés'}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: 'Mennyiség',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 100,
            render: (qty: number) => Number(qty).toLocaleString('hu-HU', { maximumFractionDigits: 2 }),
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) => a.quantity - b.quantity,
        },
        {
            title: 'M.e.',
            dataIndex: 'unit',
            key: 'unit',
            width: 70,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 240,
            fixed: 'right' as const,
            render: (_: any, record: OrderedManufacturingItem) => (
                <Space size="small" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Munkaóra indítása">
                        <Button
                            icon={<FieldTimeOutlined />}
                            size="small"
                            onClick={() => handleStartTimer(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Megjegyzés hozzáadása">
                        <Button
                            icon={<MessageOutlined />}
                            size="small"
                            onClick={() => handleAddNote(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Csatolmányok">
                        <Button
                            icon={<PaperClipOutlined />}
                            size="small"
                            type={expandedRowKeys.includes(record.id) ? 'primary' : 'default'}
                            onClick={() => {
                                if (expandedRowKeys.includes(record.id)) {
                                    setExpandedRowKeys(prev => prev.filter(id => id !== record.id));
                                } else {
                                    setExpandedRowKeys(prev => [...prev, record.id]);
                                    loadSubItems(record);
                                }
                            }}
                        >
                            {orderItemAttsLoaded[record.id]
                                ? ((orderItemAtts[record.id] || []).length > 0 ? (orderItemAtts[record.id] || []).length : '')
                                : (record.attachment_count ? record.attachment_count : '')}
                        </Button>
                    </Tooltip>
                    <Tooltip title="Munkalap nyomtatása">
                        <Button
                            icon={<PrinterOutlined />}
                            size="small"
                            onClick={() => handlePrintWorksheet(record)}
                        />
                    </Tooltip>
                    <Tooltip title={record.manufacturing_product_id ? "Gyártás megnyitása" : "RFQ megnyitása"}>
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => {
                                if (record.manufacturing_product_id) {
                                    navigate(`/manufacturing/products/${record.manufacturing_product_id}`);
                                } else if (record.rfq_id) {
                                    navigate(`/sales/rfqs/${record.rfq_id}`);
                                }
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Card
                title="Megrendelt Gyártások"
                extra={
                    <Space>
                        {filterOrderId && (() => {
                            const orderNum = items.find(i => i.order_id === filterOrderId)?.order_number || `#${filterOrderId}`;
                            return (
                                <Tag closable color="blue" onClose={() => setFilterOrderId(null)}>
                                    Megrendelés: {orderNum}
                                </Tag>
                            );
                        })()}
                        <Select
                            mode="multiple"
                            allowClear
                            style={{ minWidth: 200, maxWidth: 400 }}
                            placeholder="Szűrés státusz alapján"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={Object.entries(ORDER_ITEM_STATUS_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                            maxTagCount="responsive"
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={loadItems}
                        >
                            Frissítés
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            disabled={selectedRowKeys.length === 0}
                            loading={sendModalLoading}
                            onClick={handleSendToProduction}
                        >
                            Gyártásra kiküldés{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
                        </Button>
                    </Space>
                }
            >
                <EnhancedTable
                    tableKey="orderedManufacturingItems"
                    searchValue={query}
                    onSearchChange={setQuery}
                    searchPlaceholder="Keresés megrendelés, ügyfél, termék szerint..."
                    rowClassName={(r: any) => r.status && r.status !== 'new' ? `rfq-row-${r.status}` : ''}
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total: number, range: [number, number]) =>
                            `${range[0]}-${range[1]} / ${total} tétel`,
                    }}
                    rowKey="id"
                    cardBreakpoint={950}
                    size="small"
                    loading={loading}
                    rowDnd={{ items: filtered.map(r => r.id), onReorder: onRowReorder }}
                    bodyComponents={{ body: { row: CostDraggableRow } }}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
                        columnWidth: 42,
                    }}
                    expandable={{
                        expandedRowRender,
                        expandedRowKeys,
                        onExpand: (expanded, record) => {
                            if (expanded) {
                                setExpandedRowKeys(prev => [...prev, record.id]);
                                loadSubItems(record);
                            } else {
                                setExpandedRowKeys(prev => prev.filter(id => id !== record.id));
                            }
                        },
                    }}
                    onRow={(record: OrderedManufacturingItem) => ({
                        onDoubleClick: () => {
                            if (record.manufacturing_product_id) {
                                navigate(`/manufacturing/products/${record.manufacturing_product_id}`);
                            } else if (record.rfq_id) {
                                navigate(`/sales/rfqs/${record.rfq_id}`);
                            }
                        },
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
            <Modal
                title={previewTitle || 'Előnézet'}
                open={previewOpen}
                onCancel={() => {
                    setPreviewOpen(false);
                    setPreviewUrl(null);
                    setPreviewTitle('');
                }}
                footer={null}
                width={900}
            >
                {previewUrl ? (
                    isPdfFile(previewUrl) ? (
                        <div>
                            <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '65vh', border: 0 }} />
                            <div style={{ marginTop: 8, textAlign: 'center' }}>
                                <Button type="primary" onClick={() => openPdfPreview(previewUrl!)}>Megnyitás Print Preview-ban</Button>
                            </div>
                        </div>
                    ) : (
                        <img alt={previewTitle} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }} />
                    )
                ) : (
                    <div>Nincs előnézet</div>
                )}
            </Modal>
            <Modal
                title="Gyártásra kiküldés"
                open={sendModalOpen}
                onCancel={() => setSendModalOpen(false)}
                onOk={handleConfirmSendFromModal}
                confirmLoading={sendingProduction}
                okText="Küldés"
                cancelText="Mégse"
                width={840}
                okButtonProps={{
                    icon: <SendOutlined />,
                    disabled: sendModalGroups.length === 0,
                }}
            >
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    Küldés előtt minden csoportnál szerkeszthető a címzett, tárgy és törzs.
                </Typography.Paragraph>
                {sendModalGroups.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>Nincs küldhető tétel.</div>
                ) : (
                    <Tabs
                        activeKey={sendActiveKey}
                        onChange={setSendActiveKey}
                        items={sendModalGroups.map((g) => ({
                            key: g.key,
                            label: (
                                <Space size={6}>
                                    <span>{`${g.label} (${g.cost_item_ids.length})`}</span>
                                    <Switch
                                        size="small"
                                        checked={g.enabled}
                                        onChange={(checked) => updateSendGroup(g.key, { enabled: checked })}
                                    />
                                </Space>
                            ),
                            children: (
                                <Form layout="vertical" size="small">
                                    <Form.Item label="Címzettek" required>
                                        <Input
                                            placeholder="email1@example.com, email2@example.com"
                                            value={g.recipients}
                                            onChange={(e) => updateSendGroup(g.key, { recipients: e.target.value })}
                                        />
                                    </Form.Item>
                                    <Form.Item label="Másolat (CC)">
                                        <Input
                                            placeholder="cc@example.com"
                                            value={g.cc}
                                            onChange={(e) => updateSendGroup(g.key, { cc: e.target.value })}
                                        />
                                    </Form.Item>
                                    <Form.Item label="Válaszcím (Reply-To)">
                                        <Input
                                            placeholder="reply@example.com"
                                            value={g.reply_to}
                                            onChange={(e) => updateSendGroup(g.key, { reply_to: e.target.value })}
                                        />
                                    </Form.Item>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <Form.Item label="E-mail sablon" style={{ flex: 1 }}>
                                            <Select
                                                placeholder="Válassz sablont"
                                                allowClear
                                                showSearch
                                                optionFilterProp="label"
                                                onChange={(value: string) => value && handleApplyTemplate(g, value)}
                                                options={emailTemplates.map((t) => ({
                                                    label: `${t.name} (${t.key})`,
                                                    value: t.key,
                                                }))}
                                            />
                                        </Form.Item>
                                        <Form.Item label="Aláírás" style={{ flex: 1 }}>
                                            <Select
                                                placeholder="Válassz aláírást"
                                                allowClear
                                                value={g.signature_key || undefined}
                                                showSearch
                                                optionFilterProp="label"
                                                onChange={(value: string) => value && handleApplySignature(g, value)}
                                                options={signatures.map((s) => ({
                                                    label: `${s.name} (${s.key})`,
                                                    value: s.key,
                                                }))}
                                            />
                                        </Form.Item>
                                    </div>
                                    <Form.Item label="Tárgy">
                                        <Input
                                            value={g.subject}
                                            onChange={(e) => updateSendGroup(g.key, { subject: e.target.value })}
                                        />
                                    </Form.Item>
                                    <Form.Item label="Törzs">
                                        <ReactQuill
                                            theme="snow"
                                            value={g.body}
                                            onChange={(value) => updateSendGroup(g.key, { body: value })}
                                            style={{ height: 280, marginBottom: 50 }}
                                        />
                                    </Form.Item>
                                    <Form.Item label="Csatolmányok kiválasztása (link + megjegyzés)">
                                        <Table
                                            size="small"
                                            rowKey="id"
                                            pagination={false}
                                            dataSource={g.attachments}
                                            columns={[
                                                {
                                                    title: 'Küld',
                                                    key: 'include',
                                                    width: 70,
                                                    render: (_: any, att: any) => (
                                                        <Checkbox
                                                            checked={!!att.include}
                                                            onChange={(e) => updateGroupAttachment(g.key, att.id, { include: e.target.checked })}
                                                        />
                                                    ),
                                                },
                                                {
                                                    title: 'Fájl',
                                                    key: 'file_name',
                                                    render: (_: any, att: any) => (
                                                        <a
                                                            href={att.file_url}
                                                            onClick={(e) => { e.preventDefault(); openPreview(att.file_url, att.file_name || att.file_url?.split('/').pop() || ''); }}
                                                        >{att.file_name}</a>
                                                    ),
                                                },
                                                {
                                                    title: 'Termék',
                                                    dataIndex: 'product_name',
                                                    key: 'product_name',
                                                    width: 180,
                                                },
                                                {
                                                    title: 'Megjegyzés',
                                                    key: 'remark',
                                                    render: (_: any, att: any) => (
                                                        <Input
                                                            value={att.remark}
                                                            placeholder="Megjegyzés a linkhez"
                                                            onChange={(e) => updateGroupAttachment(g.key, att.id, { remark: e.target.value })}
                                                        />
                                                    ),
                                                },
                                            ]}
                                        />
                                    </Form.Item>
                                </Form>
                            ),
                        }))}
                    />
                )}
                {sendModalGroups.length > 0 && (() => {
                    const g = sendModalGroups.find((grp) => grp.key === sendActiveKey);
                    if (!g) return null;
                    const previewHtml = renderTemplateText(g.body, {
                        recipient_label: g.label,
                        item_count: g.cost_item_ids.length,
                        item_table_html: g.item_table_html,
                        internal_worksheet_table_html: g.internal_worksheet_table_html,
                        queue_links_html: g.queue_links_html,
                        selected_attachments_table_html: buildSelectedAttachmentsTableHtml(g),
                    });
                    return (
                        <Collapse
                            key={g.key}
                            style={{ marginTop: 16 }}
                            items={[{
                                key: 'preview',
                                label: `Előnézet — ${g.label}`,
                                children: (
                                    <div
                                        style={{
                                            maxHeight: 420,
                                            overflowY: 'auto',
                                            border: '1px solid #f0f0f0',
                                            borderRadius: 4,
                                            padding: 16,
                                            background: '#fff',
                                            fontSize: 13,
                                        }}
                                        // eslint-disable-next-line react/no-danger
                                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                                    />
                                ),
                            }]}
                        />
                    );
                })()}
            </Modal>
        </div>
    );
};

export default OrderedProducts;
