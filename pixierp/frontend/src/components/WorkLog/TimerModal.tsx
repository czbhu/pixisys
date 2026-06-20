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
            const params: any = { status: 'new,confirmed,in_production' };
            if (!all) params.my_orders = 'true';
            const res = await salesService.getCustomerOrders(params);
            setOrders(res.results ?? res);
        } catch {}
    };

    const loadItems = async (orderId: number) => {
        try {
            const order = await salesService.getCustomerOrder(orderId);
            const loadedItems = order.items || [];
            setItems(loadedItems);
            if (loadedItems.length > 0 && !activeLog) {
                const firstItem = loadedItems[0];
                form.setFieldsValue({ item_id: firstItem.id });
                await loadSubItems(firstItem);
            }
            return loadedItems;
        } catch { return []; }
    };

    const loadSubItems = async (item: any): Promise<any[]> => {
        const productId = item?.quote_item?.manufacturing_product;
        if (!productId) { setSubItems([]); return []; }
        try {
            const product = await manufacturingService.getProduct(productId);
            const costItems = (product.cost_items || []).filter((ci: any) => ci.name);
            setSubItems(costItems);
            return costItems;
        } catch { setSubItems([]); return []; }
    };

    const selectOrder = (order: any) => {
        setSelectedOrder(order);
        setSelectedOrderId(order.id);
        setIsOtherOrder(false);
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
                    salesService.getCustomerOrder(preselectedOrderId).then(order => {
                        setOrders(prev => prev.find((o: any) => o.id === order.id) ? prev : [...prev, order]);
                        selectOrder(order);
                        loadItems(preselectedOrderId).then(loadedItems => {
                            if (preselectedItemId && loadedItems) {
                                form.setFieldsValue({ item_id: preselectedItemId });
                                const item = loadedItems.find((i: any) => i.id === preselectedItemId);
                                if (item) loadSubItems(item);
                            }
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
            const orderId = activeLog.customer_order;
            const isOther = !orderId;
            setIsOtherOrder(isOther);
            setWorkflowName(activeLog.workflow_name || '');
            if (isOther) {
                setOtherLabel((activeLog as any).order_label || '');
                setSelectedOrder(null);
            } else if (orderId) {
                salesService.getCustomerOrder(orderId).then(order => {
                    setOrders(prev => prev.find((o: any) => o.id === order.id) ? prev : [...prev, order]);
                    selectOrder(order);
                });
                loadItems(orderId).then(loadedItems => {
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
                await startTimer(selectedOrderId!, itemId, workflowName, null, helpUserId || null);
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
            norm(o.order_number).includes(q) ||
            norm(o.customer_name || '').includes(q) ||
            norm(o.first_item_name || '').includes(q) ||
            norm(stripHtml(o.first_item_description || '')).includes(q) ||
            norm(stripHtml(o.first_item_internal_description || '')).includes(q)
        );
    }, [orders, pickerSearch]);

    const wfOptions = useMemo(() => [
        ...subItems.map((si: any) => ({ value: si.name + (si.code ? ` [${si.code}]` : '') })),
        ...workflowOptions.filter(w => !subItems.some((si: any) => si.name === w)).map(w => ({ value: w })),
    ], [subItems, workflowOptions]);

    const pickerColumns: any[] = [
        {
            title: 'Ajánlatszám', dataIndex: 'order_number', key: 'order_number', width: 120,
            render: (v: string) => <span style={{ color: '#1677ff', fontWeight: 500 }}>{v}</span>,
        },
        {
            title: 'Ügyfél', dataIndex: 'customer_name', key: 'customer_name', width: 150,
            render: (v: string) => (
                <Tooltip title={v} getPopupContainer={() => document.body}>
                    <div style={{ fontWeight: 'bold', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{v || '—'}</div>
                </Tooltip>
            ),
        },
        {
            title: 'Tétel neve', dataIndex: 'first_item_name', key: 'first_item_name', width: 160,
            render: (v: string) => (
                <Tooltip title={v} getPopupContainer={() => document.body}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span>
                </Tooltip>
            ),
        },
        {
            title: 'Menny.', key: 'qty', width: 80,
            render: (_: any, r: any) => r.first_item_quantity != null
                ? `${Number(r.first_item_quantity).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r.first_item_unit || 'db'}`
                : '—',
        },
        {
            title: 'Leírás', key: 'desc', width: 200, ellipsis: false,
            render: (_: any, r: any) => {
                const t = stripHtml(r.first_item_description || '');
                return t ? (
                    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t}</div>
                    </Tooltip>
                ) : null;
            },
        },
        {
            title: 'Belső leírás', key: 'idesc', width: 180, ellipsis: false,
            render: (_: any, r: any) => {
                const t = stripHtml(r.first_item_internal_description || '');
                return t ? (
                    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>} getPopupContainer={() => document.body}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', fontSize: 12, color: '#844', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t}</div>
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
                    form.setFieldsValue({ item_id: null });
                    setSubItems([]);
                    setWorkflowName('');
                    loadItems(r.id);
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
                            {selectedOrder ? (
                                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                                                {selectedOrder.order_number}
                                                {selectedOrder.customer_name && <span style={{ fontWeight: 400, color: '#555', marginLeft: 8 }}>{selectedOrder.customer_name}</span>}
                                            </div>
                                            {selectedOrder.first_item_name && (
                                                <div style={{ fontSize: 13, color: '#389e0d', marginTop: 2 }}>
                                                    {selectedOrder.first_item_name}
                                                    {selectedOrder.first_item_quantity != null && (
                                                        <span style={{ color: '#888', marginLeft: 6 }}>{selectedOrder.first_item_quantity} {selectedOrder.first_item_unit}</span>
                                                    )}
                                                </div>
                                            )}
                                            {stripHtml(selectedOrder.first_item_description || '') && (
                                                <div style={{ fontSize: 12, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {stripHtml(selectedOrder.first_item_description || '')}
                                                </div>
                                            )}
                                            {stripHtml(selectedOrder.first_item_internal_description || '') && (
                                                <div style={{ fontSize: 12, color: '#cf1322', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {stripHtml(selectedOrder.first_item_internal_description || '')}
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
                                options={wfOptions}
                                filterOption={(inputValue, option) =>
                                    (option!.value as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
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
                            const desc = stripHtml(r.first_item_description || '');
                            const intDesc = stripHtml(r.first_item_internal_description || '');
                            return (
                                <div key={r.id} style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#1677ff', fontWeight: 600, fontSize: 14 }}>{r.order_number}</span>
                                            {r.customer_name && <span style={{ color: '#555', fontSize: 12, marginLeft: 6 }}>{r.customer_name}</span>}
                                        </div>
                                        <Button size="small" type="primary" onClick={() => {
                                            selectOrder(r); setPickerOpen(false); setPickerSearch('');
                                            form.setFieldsValue({ item_id: null }); setSubItems([]); setWorkflowName(''); loadItems(r.id);
                                        }}>Kiválaszt</Button>
                                    </div>
                                    {r.first_item_name && (
                                        <div style={{ fontWeight: 500, fontSize: 13, color: '#222', marginBottom: 2 }}>
                                            {r.first_item_name}
                                            {r.first_item_quantity != null && <span style={{ color: '#888', marginLeft: 6, fontWeight: 400 }}>{r.first_item_quantity} {r.first_item_unit || 'db'}</span>}
                                        </div>
                                    )}
                                    {desc && <div style={{ fontSize: 12, color: '#555', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', wordBreak: 'break-word' }}>{desc}</div>}
                                    {intDesc && <div style={{ fontSize: 12, color: '#844', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', wordBreak: 'break-word' }}>{intDesc}</div>}
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
