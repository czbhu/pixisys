import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Space, Tag, Spin, message, Table, Divider } from 'antd';
import { ArrowLeftOutlined, EditOutlined, CheckCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';

const OrderDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState<any>(null);

    useEffect(() => {
        loadOrder();
    }, [id]);

    const loadOrder = async () => {
        try {
            setLoading(true);
            const data = await salesService.getOrder(Number(id));
            setOrder(data);
        } catch (error) {
            message.error('Hiba a megrendelés betöltésekor');
        } finally {
            setLoading(false);
        }
    };

    const statusTag = (status: string) => {
        const statusMap: any = {
            draft: { color: 'default', text: 'Vázlat' },
            confirmed: { color: 'green', text: 'Megerősítve' },
            in_production: { color: 'blue', text: 'Gyártásban' },
            completed: { color: 'purple', text: 'Kész' },
            shipped: { color: 'cyan', text: 'Szállítva' },
            delivered: { color: 'geekblue', text: 'Kiszállítva' },
            cancelled: { color: 'red', text: 'Törölve' },
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!order) {
        return <Card>Megrendelés nem található</Card>;
    }

    const itemColumns = [
        { title: 'Termék', dataIndex: 'product_name', key: 'product_name' },
        { title: 'Mennyiség', dataIndex: 'quantity', key: 'quantity' },
        { title: 'Egységár', dataIndex: 'unit_price', key: 'unit_price', render: (val: number) => `${Number(val || 0).toLocaleString('hu-HU')} Ft` },
        { title: 'Összeg', dataIndex: 'total_price', key: 'total_price', render: (val: number) => `${Number(val || 0).toLocaleString('hu-HU')} Ft` },
    ];

    return (
        <div>
            <Space style={{ marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')}>
                    Vissza
                </Button>
                <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/sales/orders/${id}/edit`)}>
                    Szerkesztés
                </Button>
                {order.status === 'draft' && (
                    <Button type="primary" icon={<CheckCircleOutlined />} onClick={async () => {
                        try {
                            await salesService.confirmOrder(Number(id));
                            message.success('Megrendelés megerősítve');
                            loadOrder();
                        } catch {
                            message.error('Nem sikerült megerősíteni');
                        }
                    }}>
                        Megerősítés
                    </Button>
                )}
                {order.status === 'confirmed' && (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={async () => {
                        try {
                            await salesService.startProduction(Number(id));
                            message.success('Gyártás elindítva');
                            loadOrder();
                        } catch {
                            message.error('Nem sikerült elindítani');
                        }
                    }}>
                        Gyártásba küldés
                    </Button>
                )}
            </Space>

            <Card title={`Megrendelés: ${order.order_number || ''}`}>
                <Descriptions bordered column={2}>
                    <Descriptions.Item label="Rendelésszám">{order.order_number}</Descriptions.Item>
                    <Descriptions.Item label="Státusz">{statusTag(order.status)}</Descriptions.Item>
                    <Descriptions.Item label="Létrehozva">
                        {order.created_at ? new Date(order.created_at).toLocaleString('hu-HU') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Módosítva">
                        {order.updated_at ? new Date(order.updated_at).toLocaleString('hu-HU') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Ügyfél">
                        {order.customer_name || order.quote?.quote_request?.customer?.name || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Szállítási határidő">
                        {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('hu-HU') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Fizetési feltétel">{order.payment_terms || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Szállítási cím">{order.delivery_address || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Összeg" span={2}>
                        <strong style={{ fontSize: '16px' }}>
                            {Number(order.total_amount || 0).toLocaleString('hu-HU')} Ft
                        </strong>
                    </Descriptions.Item>
                    <Descriptions.Item label="Megjegyzés" span={2}>
                        {order.notes || '-'}
                    </Descriptions.Item>
                </Descriptions>

                {order.items && order.items.length > 0 && (
                    <>
                        <Divider>Tételek</Divider>
                        <Table
                            columns={itemColumns}
                            dataSource={order.items}
                            rowKey="id"
                            pagination={false}
                        />
                    </>
                )}
            </Card>
        </div>
    );
};

export default OrderDetail;
