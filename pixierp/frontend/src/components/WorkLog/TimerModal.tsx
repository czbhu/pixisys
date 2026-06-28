import React, { useEffect, useState, useMemo } from 'react';
import { Modal, Form, Button, Statistic, AutoComplete, Checkbox, Input, Space, Tag, Table, Tooltip } from 'antd';
import { TeamOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { salesService } from '../../services/salesService';
import { hrService } from '../../services/hrService';
import { manufacturingService } from '../../services/manufacturingService';

const OTHER_ORDER_VALUE = '__other__';

// Inject global CSS for full-screen mobile modals (kept for flex body layout)
const MOBILE_MODAL_STYLE = `
@media (max-width: 767px) {
  .timer-picker-modal .ant-modal-content,
  .pixi-fullscreen-wrap .ant-modal-content {
    display: flex !important;
    flex-direction: column !important;
  }
  .timer-picker-modal .ant-modal-body,
  .pixi-fullscreen-wrap .ant-modal-body {
    flex: 1 1 0% !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    display: flex !important;
    flex-direction: column !important;
  }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('timer-modal-mobile-style')) {
  const el = document.createElement('style');
  el.id = 'timer-modal-mobile-style';
  el.textContent = MOBILE_MODAL_STYLE;
  document.head.appendChild(el);
}

interface ResumeWorkState {
    orderId: number | null;
    itemId: number | null;
    subItemId: number | null;
    workflowName: string;
    orderLabel: string;
}

const stripHtml = (html: string) => (html || '').replace(/<[^>]*>/g, '').trim();
const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const TimerModal: React.FC = () => {
    const {
        activeLog, elapsedSeconds, stopTimer, startTimer, modalOpen, setModalOpen,
        preselectedOrderId, preselectedItemId, preselectedSubItemId,
    } = useTimeTracker();

    const [orders, setOrders] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [subItems, setSubItems] = useState<any[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [workflowOptions, setWorkflowOptions] = useState<string[]>([]);
    const [workflowName, setWorkflowName] = useState('');
    const [form] = Form.useForm();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');

    const [helpingOther, setHelpingOther] = useState(false);
    const [employees, setEmployees] = useState<any[]>([]);
    const [helpUserId, setHelpUserId] = useState<number | null>(null);
    const [showAllOrders, setShowAllOrders] = useState(false);
    const [isOtherOrder, setIsOtherOrder] = useState(false);
    const [otherLabel, setOtherLabel] = useState('');
    const [resumeWorkState, setResumeWorkState] = useState<ResumeWorkState | null>(null);

    const isPaused = !!activeLog && (activeLog.workflow_name || '').trim().toLowerCase() === 'szünet';
    const disableInputs = !!activeLog;

    // Add/remove body class so CSS can suppress the app header z-index on mobile
    useEffect(() => {
        if (isMobile && (pickerOpen || modalOpen)) {
            document.body.classList.add('timer-modal-open');
        } else {
            document.body.classList.remove('timer-modal-open');
        }
        return () => document.body.classList.remove('timer-modal-open');
    }, [isMobile, pickerOpen, modalOpen]);

    useEffect(() => { loadWorkflowOptions(); }, []);

    const loadWorkflowOptions = async () => {
        try {
            const opts = await salesService.getFrequentWorkflows();
            setWorkflowOptions(opts?.length ? opts : ['Szerkesztés', 'Nyomtatás', 'Vágás', 'Csomagolás', 'Szállítás']);
        } catch {
            setWorkflowOptions(['Szerkesztés', 'Nyomtatás', 'Vágás', 'Csomagolás', 'Szállítás']);
        }
    };

    const loadEmployees = async () => {
        try {
            const res = await hrService.getEmployees();
            setEmployees(Array.isArray(res) ? res : (res?.results ?? []));
        } catch { setEmployees([]); }
    };

    const loadOrders = async (all = false) => {
        try {
            // Tételsoronként lapítjuk ki az RFQ-kat (mint a RFQs lista)
            const params: any = { page_size: 200 };
            if (!all) params.my_orders = 'true';
            const res = await salesService.getQuoteRequestsPage(1, params.page_size, params);
            const rfqs: any[] = res.results ?? (res as any) ?? [];
            // Flatten: egy sor per tétel, RFQ mezőkkel kiegészítve
            const rows: any[] = [];
            rfqs.forEach((rfq: any) => {
                if (['cancelled','archived','rejected'].includes(rfq.status)) return;
                const companyName = rfq.company_name || rfq.company?.name || '';
                const allItems: any[] = rfq.items || [];
                const visibleItems = allItems.filter((it: any) => !it?.parent);
                const displayItems = visibleItems.length > 0 ? visibleItems : allItems.length > 0 ? [allItems[0]] : [{
                    id: null,
                    item_name: rfq.primary_item_name || rfq.title || rfq.request_number,
                    description: rfq.primary_item_description || '',
                    quantity: rfq.primary_quantity ?? 1,
                    unit: rfq.primary_unit || 'db',
                    cost_items_data: [],
                }];
                displayItems.forEach((item: any) => {
                    rows.push({
                        // RFQ azonosítók
                        id: rfq.id,
                        rfq_pk: rfq.id,
                        rfq_number: rfq.request_number || rfq.number,
                        rfq_status: rfq.status,
                        effective_status: rfq.effective_status,
                        company_name: companyName,
                        // Tétel adatok
                        item_id: item.id,
                        item_name: item.item_name || item.name || rfq.primary_item_name || rfq.title || rfq.request_number,
                        quantity: item.quantity ?? rfq.primary_quantity ?? 1,
                        unit: item.unit || rfq.primary_unit || 'db',
                        description: item.description || rfq.primary_item_description || '',
                        // Gyártási termék (cost items betöltéséhez)
                        manufacturing_product: item.manufacturing_product,
                        cost_items_data: item.cost_items_data || [],
                        // Egyedi sor kulcs
                        _rowKey: `${rfq.id}-${item.id ?? 0}`,
                    });
                });
            });
            setOrders(rows);
        } catch {}
    };

    // Kiválasztott tétel cost item-jeit töltjük be a munkafolyamat dropdownhoz
    const loadCostItemsForRow = async (row: any): Promise<any[]> => {
        // 1. ManufacturingProduct cost items
        const mpId = row?.manufacturing_product?.id ?? row?.manufacturing_product;
        if (mpId) {
            try {
                const product = await manufacturingService.getProduct(mpId);
                const costItems = (product.cost_items || []).filter((ci: any) => ci.name);
                setSubItems(costItems);
                return costItems;
            } catch {}
        }
        // 2. Direct cost_items_data (JSON tömbben tárolt altételek)
        const directCi: any[] = (row?.cost_items_data || []).filter((ci: any) => ci.name || ci.item_name);
        if (directCi.length > 0) {
            setSubItems(directCi);
            return directCi;
        }
        setSubItems([]);
        return [];
    };

    const loadItems = async (rfqId: number) => {
        // Csak kompatibilitás miatt marad — a Stopper rows már tartalmazza az item adatokat
        return [];
    };

    const loadSubItemsFromRfqItem = async (item: any): Promise<any[]> => {
        return loadCostItemsForRow(item);
    };

    const loadSubItems = async (item: any): Promise<any[]> => {
        return loadCostItemsForRow(item);
    };

    const selectOrder = (row: any) => {
        setSelectedOrder(row);
        setSelectedOrderId(row.rfq_pk ?? row.id);
        setIsOtherOrder(false);
        // Azonnal betöltjük a cost item-eket
        loadCostItemsForRow(row);
    };

    const resetSelection = () => {
        setSelectedOrder(null);
        setSelectedOrderId(null);
        setItems([]);
        setSubItems([]);
        setIsOtherOrder(false);
        setOtherLabel('');
        setWorkflowName('');
        setHelpingOther(false);
        setHelpUserId(null);
        form.resetFields();
    };

    useEffect(() => {
        if (modalOpen) {
            loadOrders(showAllOrders);
            if (!activeLog) {
                if (preselectedOrderId) {
                    // preselectedOrderId itt RFQ pk
                    salesService.getQuoteRequest(String(preselectedOrderId)).then(rfq => {
                        // Flatten RFQ → sor formátum (ugyanúgy mint loadOrders), hogy
                        // a manufacturing_product és cost_items_data elérhető legyen
                        const allItems: any[] = rfq.items || [];
                        const matchedItem = preselectedItemId
                            ? (allItems.find((it: any) => it.id === preselectedItemId) || allItems.find((it: any) => !it?.parent) || allItems[0])
                            : (allItems.find((it: any) => !it?.parent) || allItems[0]);
                        const item = matchedItem || {
                            id: null, item_name: rfq.primary_item_name || rfq.title || rfq.request_number,
                            description: rfq.primary_item_description || '',
                            quantity: rfq.primary_quantity ?? 1, unit: rfq.primary_unit || 'db',
                            manufacturing_product: null, cost_items_data: [],
                        };
                        const flatRow = {
                            id: rfq.id, rfq_pk: rfq.id,
                            rfq_number: rfq.request_number || rfq.number,
                            rfq_status: rfq.status, effective_status: rfq.effective_status,
                            company_name: rfq.company_name || rfq.company?.name || '',
                            item_id: item.id,
                            item_name: item.item_name || item.name || rfq.primary_item_name || rfq.title || rfq.request_number,
                            quantity: item.quantity ?? rfq.primary_quantity ?? 1,
                            unit: item.unit || rfq.primary_unit || 'db',
                            description: item.description || rfq.primary_item_description || '',
                            manufacturing_product: item.manufacturing_product,
                            cost_items_data: item.cost_items_data || [],
                            _rowKey: `${rfq.id}-${item.id ?? 0}`,
                        };
                        setOrders(prev => prev.find((o: any) => o._rowKey === flatRow._rowKey) ? prev : [flatRow, ...prev]);
                        selectOrder(flatRow);
                    }).catch(() => {
                        // fallback: CustomerOrder-ként próbáljuk
                        salesService.getCustomerOrder(preselectedOrderId).then(order => {
                            setOrders(prev => prev.find((o: any) => o.id === order.id) ? prev : [...prev, order]);
                            selectOrder(order);
                        });
                    });
                } else {
                    resetSelection();
                }
            }
        }
    }, [modalOpen, preselectedOrderId, preselectedItemId, preselectedSubItemId, activeLog]);

    useEffect(() => {
        if (activeLog) {
            // RFQ-alapú log: quote_request van, nem customer_order
            const rfqId = activeLog.quote_request;
            const isOther = !rfqId && !activeLog.customer_order;
            setIsOtherOrder(isOther);
            setWorkflowName(activeLog.workflow_name || '');
            if (isOther) {
                setOtherLabel((activeLog as any).order_label || '');
                setSelectedOrder(null);
            } else if (rfqId) {
                salesService.getQuoteRequest(String(rfqId)).then(rfq => {
                    // Flatten az aktív log rfq_item-jéhez, vagy az első tételhez
                    const allItems: any[] = rfq.items || [];
                    const rfqItemId = activeLog.rfq_item;
                    const matchedItem = rfqItemId
                        ? allItems.find((it: any) => it.id === rfqItemId) || allItems[0]
                        : allItems.find((it: any) => !it.parent) || allItems[0];
                    const flatRow = {
                        id: rfq.id,
                        rfq_pk: rfq.id,
                        rfq_number: rfq.request_number || rfq.number,
                        company_name: rfq.company_name || rfq.company?.name || '',
                        item_name: matchedItem?.item_name || matchedItem?.name || rfq.primary_item_name || rfq.title || '',
                        quantity: matchedItem?.quantity ?? rfq.primary_quantity,
                        unit: matchedItem?.unit || rfq.primary_unit || 'db',
                        description: matchedItem?.description || '',
                        manufacturing_product: matchedItem?.manufacturing_product,
                        cost_items_data: matchedItem?.cost_items_data || [],
                        _rowKey: `${rfq.id}-${matchedItem?.id ?? 0}`,
                    };
                    setOrders(prev => prev.find((o: any) => o._rowKey === flatRow._rowKey) ? prev : [flatRow, ...prev]);
                    selectOrder(flatRow);
                });
                if (activeLog.rfq_item) {
                    form.setFieldsValue({ item_id: activeLog.rfq_item });
                }
            } else if (activeLog.customer_order) {
                salesService.getCustomerOrder(activeLog.customer_order).then(order => {
                    setOrders(prev => prev.find((o: any) => o.id === order.id) ? prev : [...prev, order]);
                    selectOrder(order);
                });
                loadItems(activeLog.customer_order).then(loadedItems => {
                    if (activeLog.item) {
                        const item = loadedItems.find((i: any) => i.id === activeLog.item);
                        if (item) loadSubItems(item);
                    }
                });
                form.setFieldsValue({ item_id: activeLog.item });
            }
        }
    }, [activeLog]);

    const handleStart = async () => {
        if (!isOtherOrder && !selectedOrderId) return;
        const itemId = form.getFieldValue('item_id') || null;
        try {
            if (isOtherOrder) {
                await startTimer(null, null, workflowName, null, helpUserId, otherLabel || '');
            } else {
                // RFQ-alapú: rfq_id-t küldünk, item_id a QuoteRequestItem id-je
                await startTimer(null, itemId, workflowName, null, helpUserId || null, undefined, selectedOrderId, itemId);
            }
        } catch {}
    };

    const handlePauseToggle = async () => {
        if (isPaused) {
            await stopTimer();
            if (resumeWorkState && (resumeWorkState.orderId || resumeWorkState.orderLabel)) {
                if (resumeWorkState.orderId) {
                    await startTimer(resumeWorkState.orderId, resumeWorkState.itemId, resumeWorkState.workflowName, resumeWorkState.subItemId);
                } else {
                    await startTimer(null, null, resumeWorkState.workflowName, null, null, resumeWorkState.orderLabel);
                }
            } else {
                resetSelection();
            }
            setResumeWorkState(null);
            return;
        }
        let previous: ResumeWorkState | null = null;
        if (activeLog) {
            previous = {
                orderId: activeLog.customer_order ?? null,
                itemId: activeLog.item ?? null,
                subItemId: (activeLog as any).sub_item ?? null,
                workflowName: activeLog.workflow_name || '',
                orderLabel: (activeLog as any).order_label || '',
            };
        }
        setResumeWorkState(previous);
        await startTimer(null, null, 'Szünet', null, null, 'Szünet');
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const filteredOrders = useMemo(() => {
        if (!pickerSearch.trim()) return orders;
        const q = norm(pickerSearch);
        return orders.filter(o =>
            norm(o.rfq_number || '').includes(q) ||
            norm(o.company_name || '').includes(q) ||
            norm(o.item_name || '').includes(q) ||
            norm(stripHtml(o.description || '')).includes(q)
        );
    }, [orders, pickerSearch]);

    const wfOptions = useMemo(() => {
        const ciOptions = subItems.map((si: any) => ({
            value: si.name + (si.code ? ` [${si.code}]` : ''),
            label: si.name + (si.code ? ` [${si.code}]` : ''),
        }));
        const ciNames = new Set(subItems.map((si: any) => si.name));
        const genericOptions = workflowOptions
            .filter(w => !ciNames.has(w))
            .map(w => ({ value: w, label: w }));
        if (ciOptions.length > 0) {
            return [
                { label: <span style={{ fontWeight: 600, color: '#1677ff', fontSize: 12 }}>Altételek</span>, options: ciOptions },
                ...(genericOptions.length > 0 ? [{ label: <span style={{ fontWeight: 600, color: '#888', fontSize: 12 }}>Egyéb</span>, options: genericOptions }] : []),
            ];
        }
        return genericOptions;
    }, [subItems, workflowOptions]);

    const pickerColumns: any[] = [
        {
            title: 'Ajánlatszám', key: 'rfq_number', width: 110,
            render: (_: any, r: any) => <span style={{ color: '#1677ff', fontWeight: 500 }}>{r.rfq_number}</span>,
        },
        {
            title: 'Ügyfél', key: 'company', width: 150,
            render: (_: any, r: any) => (
                <Tooltip title={r.company_name} getPopupContainer={() => document.body}>
                    <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{r.company_name || '—'}</div>
                </Tooltip>
            ),
        },
        {
            title: 'Tétel neve', key: 'item_name', width: 170,
            render: (_: any, r: any) => (
                <Tooltip title={r.item_name} getPopupContainer={() => document.body}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item_name || '—'}</span>
                </Tooltip>
            ),
        },
        {
            title: 'Menny.', key: 'qty', width: 80,
            render: (_: any, r: any) => r.quantity != null
                ? `${Number(r.quantity).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.unit || 'db'}`
                : '—',
        },
        {
            title: 'Leírás', key: 'desc', width: 220,
            render: (_: any, r: any) => {
                const t = stripHtml(r.description || '');
                return t ? (
                    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t}</div>
                    </Tooltip>
                ) : null;
            },
        },
        {
            title: '', key: 'action', width: 90,
            render: (_: any, r: any) => (
                <Button size="small" type="primary" onClick={() => {
                    selectOrder(r);
                    setPickerOpen(false);
                    setPickerSearch('');
                    setWorkflowName('');
                }}>Kiválaszt</Button>
            ),
        },
    ];

    return (
        <>
            <Modal
                title={
                    <Space>
                        <span>Munkaóra számláló</span>
                        {helpingOther && helpUserId && (
                            <Tag color="purple" icon={<TeamOutlined />}>
                                {employees.find(e => e.user === helpUserId)?.full_name || 'Kolléga'}
                            </Tag>
                        )}
                    </Space>
                }
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                centered
                width="min(520px, 96vw)"
                style={{ maxWidth: '96vw' }}
                wrapClassName={isMobile ? 'pixi-fullscreen-wrap' : 'timer-main-modal'}
            >
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <Statistic title="Időtartam" value={formatTime(elapsedSeconds)} />
                </div>

                {!activeLog && (
                    <div style={{
                        background: helpingOther ? '#f9f0ff' : '#fafafa',
                        border: `1px solid ${helpingOther ? '#d3adf7' : '#f0f0f0'}`,
                        borderRadius: 6, padding: '8px 12px', marginBottom: 16,
                    }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <Checkbox checked={helpingOther} onChange={e => {
                                setHelpingOther(e.target.checked);
                                if (e.target.checked) loadEmployees(); else setHelpUserId(null);
                            }}>
                                <TeamOutlined style={{ marginRight: 4 }} /><strong>Másnak segítek</strong>
                            </Checkbox>
                            <Checkbox checked={showAllOrders} onChange={e => {
                                setShowAllOrders(e.target.checked);
                                loadOrders(e.target.checked);
                            }}>
                                <strong>Mind</strong>
                            </Checkbox>
                        </div>
                        {helpingOther && (
                            <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 14, marginTop: 8 }}
                                value={helpUserId ?? ''} onChange={e => setHelpUserId(Number(e.target.value) || null)}>
                                <option value="">Válassz kollégát…</option>
                                {employees.map(emp => (
                                    <option key={emp.user} value={emp.user}>{emp.full_name || `${emp.user_first_name} ${emp.user_last_name}`}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                <Form form={form} layout="vertical">
                    {!isOtherOrder ? (
                        <>
                            {(selectedOrder || (disableInputs && activeLog)) ? (
                                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                                                {selectedOrder?.rfq_number || selectedOrder?.order_number || (activeLog as any)?.quote_request_number || (activeLog as any)?.customer_order_number || ''}
                                                {(selectedOrder?.company_name || selectedOrder?.customer_name || (activeLog as any)?.customer_name) && (
                                                    <span style={{ fontWeight: 400, color: '#555', marginLeft: 8 }}>
                                                        {selectedOrder?.company_name || selectedOrder?.customer_name || (activeLog as any)?.customer_name}
                                                    </span>
                                                )}
                                            </div>
                                            {(selectedOrder?.item_name || selectedOrder?.first_item_name || (activeLog as any)?.item_name) && (
                                                <div style={{ fontSize: 13, color: '#389e0d', marginTop: 2 }}>
                                                    {selectedOrder?.item_name || selectedOrder?.first_item_name || (activeLog as any)?.item_name}
                                                    {(selectedOrder?.quantity ?? selectedOrder?.first_item_quantity) != null && (
                                                        <span style={{ color: '#888', marginLeft: 6 }}>{selectedOrder?.quantity ?? selectedOrder?.first_item_quantity} {selectedOrder?.unit || selectedOrder?.first_item_unit || 'db'}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {!disableInputs && (
                                            <Button size="small" icon={<SwapOutlined />} onClick={() => { setPickerOpen(true); setPickerSearch(''); }}>
                                                Csere
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                !disableInputs && (
                                    <div style={{ marginBottom: 12 }}>
                                        <Button block icon={<SearchOutlined />} onClick={() => { setPickerOpen(true); setPickerSearch(''); }}>
                                            Megrendelés kiválasztása…
                                        </Button>
                                        <div style={{ textAlign: 'center', marginTop: 6 }}>
                                            <a style={{ fontSize: 12, color: '#888', cursor: 'pointer' }} onClick={() => { setIsOtherOrder(true); setSelectedOrder(null); }}>
                                                vagy: Egyéb (szabad szöveges)
                                            </a>
                                        </div>
                                    </div>
                                )
                            )}
                            <Form.Item name="item_id" hidden><Input /></Form.Item>
                        </>
                    ) : (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Tevékenység megnevezése</div>
                            <Input.Search
                                placeholder="pl. Takarítás, Karbantartás…"
                                value={otherLabel}
                                onChange={e => setOtherLabel(e.target.value)}
                                disabled={disableInputs}
                                enterButton={!disableInputs ? <a style={{ fontSize: 12 }} onClick={() => setIsOtherOrder(false)}>← Vissza</a> : undefined}
                            />
                        </div>
                    )}

                    {(selectedOrder || isOtherOrder || disableInputs) && (
                        <Form.Item label="Munkafolyamat">
                            <AutoComplete
                                disabled={disableInputs}
                                value={workflowName}
                                onChange={setWorkflowName}
                                placeholder={subItems.length > 0 ? 'Válassz altételt vagy írj be…' : 'pl. Szerkesztés, Nyomtatás…'}
                                options={wfOptions as any}
                                filterOption={(inputValue, option) =>
                                    option?.value != null &&
                                    (option.value as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                                }
                            />
                        </Form.Item>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                        {!activeLog ? (
                            <Button type="primary" size="large" onClick={handleStart} style={{ background: 'green' }}
                                disabled={!isOtherOrder && !selectedOrderId}>
                                START
                            </Button>
                        ) : (
                            <Button type="primary" size="large" danger onClick={stopTimer}>STOP</Button>
                        )}
                        <Button size="large" type={isPaused ? 'primary' : 'default'} onClick={handlePauseToggle}>
                            {isPaused ? 'Szüneten vagy!' : 'Szünet'}
                        </Button>
                    </div>
                </Form>
            </Modal>

            <Modal
                title="Megrendelés kiválasztása"
                open={pickerOpen}
                onCancel={() => setPickerOpen(false)}
                footer={null}
                width={940}
                centered
                wrapClassName={isMobile ? 'pixi-fullscreen-wrap' : 'timer-picker-modal'}
            >
                <Input.Search
                    placeholder="Keresés: ajánlatszám, ügyfél, tétel neve, leírás…"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    allowClear
                    style={{ marginBottom: 12, flexShrink: 0 }}
                    autoFocus
                />
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filteredOrders.map((r: any) => {
                            const desc = stripHtml(r.description || r.first_item_description || '');
                            return (
                                <div key={r._rowKey || r.id} style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#1677ff', fontWeight: 600, fontSize: 14 }}>{r.rfq_number || r.order_number}</span>
                                            {(r.company_name || r.customer_name) && <span style={{ color: '#555', fontSize: 12, marginLeft: 6 }}>{r.company_name || r.customer_name}</span>}
                                        </div>
                                        <Button size="small" type="primary" onClick={() => {
                                            selectOrder(r); setPickerOpen(false); setPickerSearch('');
                                            setWorkflowName('');
                                        }}>Kiválaszt</Button>
                                    </div>
                                    {(r.item_name || r.first_item_name) && (
                                        <div style={{ fontWeight: 500, fontSize: 13, color: '#222', marginBottom: 2 }}>
                                            {r.item_name || r.first_item_name}
                                            {(r.quantity ?? r.first_item_quantity) != null && <span style={{ color: '#888', marginLeft: 6, fontWeight: 400 }}>{r.quantity ?? r.first_item_quantity} {r.unit || r.first_item_unit || 'db'}</span>}
                                        </div>
                                    )}
                                    {desc && <div style={{ fontSize: 12, color: '#555', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', wordBreak: 'break-word' }}>{desc}</div>}
                                </div>
                            );
                        })}
                        {filteredOrders.length === 0 && <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>Nincs találat</div>}
                    </div>
                ) : (
                    <Table
                        size="small"
                        rowKey="id"
                        dataSource={filteredOrders}
                        columns={pickerColumns}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        scroll={{ x: 820 }}
                    />
                )}
                </div>
                <div style={{ marginTop: 12, textAlign: 'right', flexShrink: 0 }}>
                    <a style={{ fontSize: 12, color: '#888', cursor: 'pointer' }} onClick={() => { setPickerOpen(false); setIsOtherOrder(true); setSelectedOrder(null); }}>
                        Egyéb (szabad szöveges)
                    </a>
                </div>
            </Modal>
        </>
    );
};
