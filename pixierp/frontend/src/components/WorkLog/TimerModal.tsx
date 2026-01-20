import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Statistic, Input, AutoComplete } from 'antd';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { salesService } from '../../services/salesService';

export const TimerModal: React.FC = () => {
    const { activeLog, elapsedSeconds, stopTimer, startTimer, modalOpen, setModalOpen, preselectedOrderId } = useTimeTracker();
    const [orders, setOrders] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        if (modalOpen) {
            loadOrders();
            if (!activeLog && preselectedOrderId) {
                form.setFieldsValue({ order_id: preselectedOrderId });
                setSelectedOrderId(preselectedOrderId);
                loadItems(preselectedOrderId);
            }
        }
    }, [modalOpen, preselectedOrderId]);

    useEffect(() => {
        if (activeLog) {
            form.setFieldsValue({
                order_id: activeLog.customer_order,
                item_id: activeLog.item,
                workflow_name: activeLog.workflow_name
            });
            setSelectedOrderId(activeLog.customer_order);
            // Load items for valid display
            if (activeLog.customer_order) loadItems(activeLog.customer_order);
        } else {
             // Reset if closed/stopped?
             // Maybe keep last values?
        }
    }, [activeLog, form]);

    const loadOrders = async () => {
        try {
            // Should list "My Orders" - user invites etc.
            const res = await salesService.getCustomerOrders({ my_orders: 'true' });
            // Also include current order if active log exists and it's not in the list (rare but possible)
            const list = res.results ?? res;
            setOrders(list);
        } catch (e) {}
    };

    const loadItems = async (orderId: number) => {
        try {
            const order = await salesService.getCustomerOrder(orderId);
            setItems(order.items || []);
        } catch (e) {}
    };

    const handleStart = async () => {
        try {
            const vals = await form.validateFields();
            await startTimer(vals.order_id, vals.item_id, vals.workflow_name);
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
                        onChange={(val) => {
                            setSelectedOrderId(val);
                            loadItems(val);
                            form.setFieldsValue({ item_id: null, workflow_name: '' });
                        }}
                        options={orders.map(o => ({
                            label: `${o.order_number} - ${o.quote_request?.customer?.name || o.customer_name || 'ismeretlen'}`,
                            value: o.id
                        }))}
                    />
                </Form.Item>
                <Form.Item name="item_id" label="Tétel">
                    <Select
                         disabled={!!activeLog}
                         allowClear
                         options={items.map(i => ({ label: i.description, value: i.id }))}
                         onChange={(val) => {
                             const item = items.find(i => i.id === val);
                             if (item && !form.getFieldValue('workflow_name')) {
                                 form.setFieldValue('workflow_name', item.description);
                             }
                         }}
                    />
                </Form.Item>
                <Form.Item name="workflow_name" label="Munkafolyamat">
                    <AutoComplete
                        disabled={!!activeLog}
                        options={[
                             { value: 'Szerkesztés' },
                             { value: 'Nyomtatás' },
                             { value: 'Vágás' },
                             { value: 'Csomagolás' },
                             { value: 'Szállítás' }
                        ]}
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
