import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Space, message, Select, DatePicker, InputNumber } from 'antd';
import NumInput from '../../components/NumInput';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

const OrderForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!id);

    useEffect(() => {
        if (id) {
            loadOrder();
        }
    }, [id]);

    const loadOrder = async () => {
        try {
            setInitialLoading(true);
            const data = await salesService.getOrder(Number(id));
            form.setFieldsValue({
                ...data,
                delivery_date: data.delivery_date ? dayjs(data.delivery_date) : null,
            });
        } catch (error) {
            message.error('Hiba a megrendelés betöltésekor');
        } finally {
            setInitialLoading(false);
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            setLoading(true);
            const orderData = {
                ...values,
                delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : null,
            };

            if (id) {
                await salesService.updateOrder(Number(id), orderData);
                message.success('Megrendelés módosítva');
            } else {
                await salesService.createOrder(orderData);
                message.success('Megrendelés létrehozva');
            }
            navigate('/sales/orders');
        } catch (error) {
            message.error('Hiba a mentés során');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <Space style={{ marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')}>
                    Vissza
                </Button>
            </Space>

            <Card title={id ? 'Megrendelés szerkesztése' : 'Új megrendelés'} loading={initialLoading}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="order_number"
                        label="Rendelésszám"
                        rules={[{ required: true, message: 'Kérjük add meg a rendelésszámot' }]}
                    >
                        <Input placeholder="Rendelésszám" />
                    </Form.Item>

                    <Form.Item
                        name="status"
                        label="Státusz"
                        rules={[{ required: true, message: 'Kérjük válassz státuszt' }]}
                    >
                        <Select placeholder="Státusz">
                            <Option value="draft">Vázlat</Option>
                            <Option value="confirmed">Megerősítve</Option>
                            <Option value="in_production">Gyártásban</Option>
                            <Option value="completed">Kész</Option>
                            <Option value="shipped">Szállítva</Option>
                            <Option value="delivered">Kiszállítva</Option>
                            <Option value="cancelled">Törölve</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="customer_name"
                        label="Ügyfél"
                    >
                        <Input placeholder="Ügyfél neve" />
                    </Form.Item>

                    <Form.Item
                        name="delivery_date"
                        label="Szállítási határidő"
                    >
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item
                        name="total_amount"
                        label="Összeg (Ft)"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                            parser={(value) => (value ? parseFloat(value.replace(/\s/g, '')) : 0) as any}
                        />
                    </Form.Item>

                    <Form.Item
                        name="payment_terms"
                        label="Fizetési feltétel"
                    >
                        <Input placeholder="Pl.: 30 napos fizetési határidő" />
                    </Form.Item>

                    <Form.Item
                        name="delivery_address"
                        label="Szállítási cím"
                    >
                        <TextArea rows={3} placeholder="Szállítási cím" />
                    </Form.Item>

                    <Form.Item
                        name="notes"
                        label="Megjegyzés"
                    >
                        <TextArea rows={4} placeholder="Megjegyzések" />
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                                Mentés
                            </Button>
                            <Button onClick={() => navigate('/sales/orders')}>
                                Mégse
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default OrderForm;
