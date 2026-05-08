import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Statistic, AutoComplete, Checkbox, Input, Space, Tag, Divider } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { salesService } from '../../services/salesService';
import { hrService } from '../../services/hrService';
import { manufacturingService } from '../../services/manufacturingService';

const OTHER_ORDER_VALUE = '__other__';

export const TimerModal: React.FC = () => {
    const { 
        activeLog, elapsedSeconds, stopTimer, startTimer, modalOpen, setModalOpen, 
        preselectedOrderId, preselectedItemId, preselectedSubItemId,
    } = useTimeTracker();
    const [orders, setOrders] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [subItems, setSubItems] = useState<any[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [workflowOptions, setWorkflowOptions] = useState<string[]>([]);
    const [form] = Form.useForm();

    // "Másnak segítek" state
    const [helpingOther, setHelpingOther] = useState(false);
    const [employees, setEmployees] = useState<any[]>([]);
    const [helpUserId, setHelpUserId] = useState<number | null>(null);

    // "Egyéb" order state
    const [isOtherOrder, setIsOtherOrder] = useState(false);

    useEffect(() => {
        loadWorkflowOptions();
    }, []);

    const loadWorkflowOptions = async () => {
        try {
            const opts = await salesService.getFrequentWorkflows();
            if (opts && opts.length > 0) {
                setWorkflowOptions(opts);
            } else {
                 setWorkflowOptions(['Szerkesztés', 'Nyomtatás', 'Vágás', 'Csomagolás', 'Szállítás']);
            }
        } catch (e) {
             setWorkflowOptions(['Szerkesztés', 'Nyomtatás', 'Vágás', 'Csomagolás', 'Szállítás']);
        }
    };

    const loadEmployees = async () => {
        try {
            const res = await hrService.getEmployees();
            const list = Array.isArray(res) ? res : (res?.results ?? []);
            setEmployees(list);
        } catch (e) {
            setEmployees([]);
        }
    };

    const loadColleagueActiveLog = async (userId: number) => {
        try {
            const log = await salesService.getColleagueActiveLog(userId);
            if (log && log.id) {
                // Prefill order, item, workflow from colleague's active log
                form.setFieldsValue({
                    order_id: log.customer_order || OTHER_ORDER_VALUE,
                    item_id: log.item || null,
                    workflow_name: log.workflow_name || '',
                    order_label: log.order_label || '',
                });
                if (log.customer_order) {
                    setSelectedOrderId(log.customer_order);
                    setIsOtherOrder(false);
                    loadItems(log.customer_order);
                } else if (log.order_label) {
                    setIsOtherOrder(true);
                    setSelectedOrderId(null);
                }
            }
        } catch (e) {
            // No active log for colleague — just leave fields as is
        }
    };

    useEffect(() => {
        if (modalOpen) {
            loadOrders();
            if (!activeLog) {
                if (preselectedOrderId) {
                    salesService.getCustomerOrder(preselectedOrderId).then(order => {
                        setOrders(prev => {
                            if (!prev.find((o: any) => o.id === order.id)) {
                                return [...prev, order];
                            }
                            return prev;
                        });
                        form.setFieldsValue({ order_id: preselectedOrderId });
                        setSelectedOrderId(preselectedOrderId);
                    });

                    loadItems(preselectedOrderId).then((loadedItems) => {
                        if (preselectedItemId && loadedItems) {
                            form.setFieldsValue({ item_id: preselectedItemId });
                            const item = loadedItems.find((i: any) => i.id === preselectedItemId);
                            if (item) {
                                loadSubItems(item).then(() => {
                                    if (preselectedSubItemId) {
                                        form.setFieldsValue({ sub_item_id: preselectedSubItemId });
                                    }
                                });
                            }
                        }
                    });
                } else {
                    form.resetFields();
                    setSelectedOrderId(null);
                    setItems([]);
                    setSubItems([]);
                    setHelpingOther(false);
                    setHelpUserId(null);
                    setIsOtherOrder(false);
                }
            }
        }
    }, [modalOpen, preselectedOrderId, preselectedItemId, preselectedSubItemId, activeLog]);

    useEffect(() => {
        if (activeLog) {
            const orderId = activeLog.customer_order;
            const isOther = !orderId;
            setIsOtherOrder(isOther);
            form.setFieldsValue({
                order_id: orderId || (isOther ? OTHER_ORDER_VALUE : null),
                item_id: activeLog.item,
                workflow_name: activeLog.workflow_name,
                order_label: (activeLog as any).order_label || '',
            });
            if (orderId) {
                salesService.getCustomerOrder(orderId).then(order => {
                    setOrders(prev => {
                        if (!prev.find((o: any) => o.id === order.id)) return [...prev, order];
                        return prev;
                    });
                });
                setSelectedOrderId(orderId);
                loadItems(orderId).then(loadedItems => {
                    if (activeLog.item) {
                        const item = loadedItems.find((i: any) => i.id === activeLog.item);
                        if (item) loadSubItems(item);
                    }
                });
            }
        }
    }, [activeLog, form]);

    const loadOrders = async () => {
        try {
            const res = await salesService.getCustomerOrders({ 
                my_orders: 'true',
                status: 'new,confirmed,in_production'
            });
            const list = res.results ?? res;
            setOrders(list);
        } catch (e) {}
    };

    const loadItems = async (orderId: number) => {
        try {
            const order = await salesService.getCustomerOrder(orderId);
            const loadedItems = order.items || [];
            setItems(loadedItems);
            return loadedItems;
        } catch (e) {
            return [];
        }
    };

    const loadSubItems = async (item: any): Promise<any[]> => {
        const productId = item?.quote_item?.manufacturing_product;
        if (!productId) {
            setSubItems([]);
            return [];
        }
        try {
            const product = await manufacturingService.getProduct(productId);
            const costItems = (product.cost_items || []).filter((ci: any) => ci.name);
            setSubItems(costItems);
            return costItems;
        } catch (e) {
            setSubItems([]);
            return [];
        }
    };

    const handleStart = async () => {
        try {
            const vals = await form.validateFields();
            if (vals.order_id === OTHER_ORDER_VALUE) {
                // Free-text order
                await startTimer(null, null, vals.workflow_name, null, helpUserId, vals.order_label || '');
            } else {
                await startTimer(vals.order_id, vals.item_id, vals.workflow_name, vals.sub_item_id ?? null, helpUserId || null);
            }
        } catch (e) {}
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const orderOptions = [
        ...orders.map((o: any) => ({
            label: `${o.order_number} – ${o.customer_name || o.quote_request?.customer?.name || 'ismeretlen'}`,
            value: o.id,
        })),
        { label: '— Egyéb (szabad szöveges) —', value: OTHER_ORDER_VALUE },
    ];

    return (
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
            width="min(500px, 96vw)"
            style={{ maxWidth: '96vw' }}
        >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Statistic title="Időtartam" value={formatTime(elapsedSeconds)} />
            </div>

            {/* Másnak segítek */}
            {!activeLog && (
                <div style={{
                    background: helpingOther ? '#f9f0ff' : '#fafafa',
                    border: `1px solid ${helpingOther ? '#d3adf7' : '#f0f0f0'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    marginBottom: 16,
                }}>
                    <Checkbox
                        checked={helpingOther}
                        onChange={e => {
                            const val = e.target.checked;
                            setHelpingOther(val);
                            if (val) {
                                loadEmployees();
                            } else {
                                setHelpUserId(null);
                            }
                        }}
                    >
                        <TeamOutlined style={{ marginRight: 4 }} />
                        <strong>Másnak segítek</strong>
                    </Checkbox>
                    {helpingOther && (
                        <div style={{ marginTop: 8 }}>
                            <Select
                                style={{ width: '100%' }}
                                placeholder="Válassz kollégát..."
                                showSearch
                                optionFilterProp="label"
                                value={helpUserId}
                                onChange={uid => {
                                    setHelpUserId(uid);
                                    // Prefill from colleague's active log
                                    loadColleagueActiveLog(uid);
                                    // Also load their orders (show all orders for selection)
                                    salesService.getCustomerOrders({ status: 'new,confirmed,in_production' }).then(res => {
                                        const list = res.results ?? res;
                                        setOrders(list);
                                    }).catch(() => {});
                                }}
                                options={employees.map(e => ({
                                    label: e.full_name || `${e.user_first_name} ${e.user_last_name}`,
                                    value: e.user,
                                }))}
                            />
                        </div>
                    )}
                </div>
            )}

            <Form form={form} layout="vertical">
                <Form.Item
                    name="order_id"
                    label="Megrendelés"
                    rules={[{ required: !isOtherOrder, message: 'Kötelező' }]}
                >
                    <Select
                        disabled={!!activeLog}
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="label"
                        onChange={(val) => {
                            if (val === OTHER_ORDER_VALUE) {
                                setIsOtherOrder(true);
                                setSelectedOrderId(null);
                                setItems([]);
                                setSubItems([]);
                                form.setFieldsValue({ item_id: null, sub_item_id: undefined, order_label: '' });
                            } else {
                                setIsOtherOrder(false);
                                setSelectedOrderId(val);
                                loadItems(val);
                                form.setFieldsValue({ item_id: null, workflow_name: '' });
                            }
                        }}
                        options={orderOptions}
                    />
                </Form.Item>

                {isOtherOrder && !activeLog && (
                    <Form.Item
                        name="order_label"
                        label="Tevékenység megnevezése"
                        rules={[{ required: true, message: 'Add meg a tevékenységet' }]}
                    >
                        <Input
                            placeholder="pl. Takarítás, Karbantartás, Szállítás..."
                            disabled={!!activeLog}
                        />
                    </Form.Item>
                )}
                {isOtherOrder && !!activeLog && (
                    <Form.Item name="order_label" label="Tevékenység megnevezése">
                        <Input readOnly />
                    </Form.Item>
                )}

                {!isOtherOrder && (
                    <>
                        <Form.Item name="item_id" label="Tétel">
                            <Select
                                disabled={!!activeLog}
                                allowClear
                                options={(() => {
                                    const hasManufacturing = items.some((i: any) => i.item_type === 'manufacturing' || i.item_type === 'product');
                                    const displayItems = hasManufacturing
                                        ? items.filter((i: any) => i.item_type !== 'service')
                                        : items;
                                    return displayItems.map((i: any) => {
                                        const name = i.product_name ||
                                            i.manufacturing_product_name ||
                                            i.material_name ||
                                            i.service_name ||
                                            '-';
                                        return { label: name, value: i.id };
                                    });
                                })()}
                                onChange={(val) => {
                                    const item = items.find((i: any) => i.id === val);
                                    form.setFieldsValue({ sub_item_id: undefined });
                                    if (item) {
                                        loadSubItems(item);
                                    } else {
                                        setSubItems([]);
                                    }
                                }}
                            />
                        </Form.Item>
                        {subItems.length > 0 && (
                            <Form.Item name="sub_item_id" label="Altétel">
                                <Select
                                    disabled={!!activeLog}
                                    allowClear
                                    placeholder="Válassz altételt..."
                                    options={subItems.map((si: any) => ({
                                        label: si.name + (si.code ? ` [${si.code}]` : ''),
                                        value: si.id,
                                    }))}
                                />
                            </Form.Item>
                        )}
                    </>
                )}

                <Form.Item name="workflow_name" label="Munkafolyamat">
                    <AutoComplete
                        disabled={!!activeLog}
                        options={workflowOptions.map(w => ({ value: w }))}
                        filterOption={(inputValue, option) =>
                            option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                        }
                    />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                    {!activeLog ? (
                        <Button type="primary" size="large" onClick={handleStart} style={{ background: 'green' }}>START</Button>
                    ) : (
                        <Button type="primary" size="large" danger onClick={stopTimer}>STOP</Button>
                    )}
                </div>
            </Form>
        </Modal>
    );
};

