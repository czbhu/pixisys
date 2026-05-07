import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Statistic, AutoComplete } from 'antd';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';

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

    useEffect(() => {
        if (modalOpen) {
            loadOrders();
            if (!activeLog) {
                if (preselectedOrderId) {
                    // Always try to load the specific order regardless of the list
                     salesService.getCustomerOrder(preselectedOrderId).then(order => {
                         // Update orders list to include this one if missing (to ensure label display)
                         setOrders(prev => {
                             if (!prev.find(o => o.id === order.id)) {
                                 return [...prev, order];
                             }
                             return prev;
                         });
                         
                         form.setFieldsValue({ order_id: preselectedOrderId });
                         setSelectedOrderId(preselectedOrderId);
                     });

                    loadItems(preselectedOrderId).then((loadedItems) => {
                        // If we have preselectedItemId and items loaded, set it
                        if (preselectedItemId && loadedItems) {
                             form.setFieldsValue({ item_id: preselectedItemId });
                             const item = loadedItems.find((i: any) => i.id === preselectedItemId);
                             if (item) {
                                 // Load sub-items for this item
                                 loadSubItems(item).then((loadedSubItems: any[]) => {
                                     if (preselectedSubItemId) {
                                         form.setFieldsValue({ sub_item_id: preselectedSubItemId });
                                     }
                                 });
                             }
                        }
                    });
                } else {
                    // Reset fields if opened without preselection
                    form.resetFields();
                    setSelectedOrderId(null);
                    setItems([]);
                    setSubItems([]);
                }
            } else {
                // If activeLog, populate it (already handled in another useEffect, but safe to keep clean state logic)
            }
        }
    }, [modalOpen, preselectedOrderId, preselectedItemId, preselectedSubItemId, activeLog]);

    useEffect(() => {
        if (activeLog) {
            form.setFieldsValue({
                order_id: activeLog.customer_order,
                item_id: activeLog.item,
                workflow_name: activeLog.workflow_name
            });
            // Ensure order is in list for label
            salesService.getCustomerOrder(activeLog.customer_order).then(order => {
                setOrders(prev => {
                     if (!prev.find(o => o.id === order.id)) {
                         return [...prev, order];
                     }
                     return prev;
                });
            });

            setSelectedOrderId(activeLog.customer_order);
            // Load items for valid display
            if (activeLog.customer_order) {
                loadItems(activeLog.customer_order).then(loadedItems => {
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
            // Should list "My Orders" - user invites etc.
            // Filter by status: new, confirmed, in_production
            const res = await salesService.getCustomerOrders({ 
                my_orders: 'true',
                status: 'new,confirmed,in_production'
            });
            // Also include current order if active log exists and it's not in the list (rare but possible)
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
            await startTimer(vals.order_id, vals.item_id, vals.workflow_name, vals.sub_item_id ?? null);
        } catch (e) {}
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <Modal
            title="Munkaóra számláló"
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            footer={null}
            centered
            width="min(480px, 96vw)"
            style={{ maxWidth: '96vw' }}
        >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                 <Statistic title="Időtartam" value={formatTime(elapsedSeconds)} />
            </div>

            <Form form={form} layout="vertical">
                <Form.Item name="order_id" label="Megrendelés" rules={[{ required: true }]}>
                    <Select 
                        disabled={!!activeLog}
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="label"
                        onChange={(val) => {
                            setSelectedOrderId(val);
                            loadItems(val);
                            form.setFieldsValue({ item_id: null, workflow_name: '' });
                        }}
                        options={orders.map(o => ({
                            label: `${o.order_number} - ${o.customer_name || o.quote_request?.customer?.name || 'ismeretlen'}`,
                            value: o.id
                        }))}
                    />
                </Form.Item>
                <Form.Item name="item_id" label="Tétel">
                    <Select
                         disabled={!!activeLog}
                         allowClear
                         options={(() => {
                            // Filter out service items if there are legitimate manufacturing/product items to track time on.
                            // Only show services if they are the only things in the order (or explicitly needed).
                            const hasManufacturing = items.some(i => i.item_type === 'manufacturing' || i.item_type === 'product');
                            const displayItems = hasManufacturing 
                                ? items.filter(i => i.item_type !== 'service') 
                                : items;

                            return displayItems.map(i => {
                                 const name = i.product_name || 
                                              i.manufacturing_product_name || 
                                              i.material_name || 
                                              i.service_name || 
                                              '-';
                                 return { label: name, value: i.id };
                             });
                         })()}
                         onChange={(val) => {
                             const item = items.find(i => i.id === val);
                             // Load sub-items for the selected item
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
                            options={subItems.map(si => ({
                                label: si.name + (si.code ? ` [${si.code}]` : ''),
                                value: si.id,
                            }))}
                            onChange={() => {}}
                        />
                    </Form.Item>
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
