import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Progress, Typography, Spin, Alert } from 'antd';
import {
    UserOutlined,
    ShoppingCartOutlined,
    DollarOutlined,
    TeamOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
} from '@ant-design/icons';
import { salesService } from '../services/salesService';

const { Title } = Typography;

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({
        totalCustomers: 0,
        totalOrders: 0,
        totalRevenue: 0,
        totalProducts: 0
    });
    const [recentOrders, setRecentOrders] = useState<any[]>([]);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Load customers
            const customersResponse = await salesService.getCustomers();
            const totalCustomers = customersResponse.count || 0;

            // Load orders
            const ordersResponse = await salesService.getOrders();
            const totalOrders = ordersResponse.count || 0;
            const orders = ordersResponse.results || [];

            // Calculate total revenue
            const totalRevenue = orders.reduce((sum: number, order: any) =>
                sum + parseFloat(order.total_amount || 0), 0
            );

            // Load products
            const productsResponse = await salesService.getProducts();
            const totalProducts = productsResponse.count || 0;

            setStats({
                totalCustomers,
                totalOrders,
                totalRevenue,
                totalProducts
            });

            // Set recent orders (last 5)
            setRecentOrders(orders.slice(0, 5));

        } catch (err) {
            console.error('Error loading dashboard data:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const statsData = [
        {
            title: 'Összes ügyfél',
            value: stats.totalCustomers,
            icon: <UserOutlined />,
            color: '#1890ff',
            change: 12,
            changeType: 'increase',
        },
        {
            title: 'Aktív megrendelések',
            value: stats.totalOrders,
            icon: <ShoppingCartOutlined />,
            color: '#52c41a',
            change: 8,
            changeType: 'increase',
        },
        {
            title: 'Összes bevétel',
            value: stats.totalRevenue,
            icon: <DollarOutlined />,
            color: '#faad14',
            change: 15,
            changeType: 'increase',
            prefix: 'Ft',
        },
        {
            title: 'Összes termék',
            value: stats.totalProducts,
            icon: <TeamOutlined />,
            color: '#f5222d',
            change: 5,
            changeType: 'decrease',
        },
    ];

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'green';
            case 'draft': return 'orange';
            case 'in_progress': return 'blue';
            case 'cancelled': return 'red';
            default: return 'default';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'draft': return 'Vázlat';
            case 'in_progress': return 'Folyamatban';
            case 'completed': return 'Befejezve';
            case 'cancelled': return 'Törölve';
            default: return status;
        }
    };

    const columns = [
        {
            title: 'Megrendelés szám',
            dataIndex: 'order_number',
            key: 'order_number',
        },
        {
            title: 'Ügyfél',
            dataIndex: 'customer_name',
            key: 'customer_name',
        },
        {
            title: 'Összeg',
            dataIndex: 'total_amount',
            key: 'total_amount',
            render: (amount: number) => `${amount.toLocaleString()} Ft`
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <span style={{
                    color: getStatusColor(status) === 'green' ? '#52c41a' :
                        getStatusColor(status) === 'orange' ? '#fa8c16' :
                            getStatusColor(status) === 'blue' ? '#1890ff' : '#f5222d'
                }}>
                    {getStatusText(status)}
                </span>
            )
        },
        {
            title: 'Létrehozva',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string) => new Date(date).toLocaleDateString('hu-HU')
        },
    ];

    if (loading) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <Spin size="large" />
                <p>Adatok betöltése...</p>
            </div>
        );
    }

    return (
        <div>
            <Title level={2} style={{ marginBottom: 24 }}>
                PixiERP Dashboard
            </Title>

            {error && (
                <Alert
                    message="Hiba"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: '24px' }}
                />
            )}

            {/* Statistics Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statsData.map((stat, index) => (
                    <Col xs={24} sm={12} lg={6} key={index}>
                        <Card>
                            <Statistic
                                title={stat.title}
                                value={stat.value}
                                prefix={stat.icon}
                                valueStyle={{ color: stat.color }}
                                suffix={
                                    <span style={{ fontSize: 14, color: stat.changeType === 'increase' ? '#52c41a' : '#f5222d' }}>
                                        {stat.changeType === 'increase' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                        {stat.change}%
                                    </span>
                                }
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]}>
                {/* Recent Orders */}
                <Col xs={24} lg={16}>
                    <Card title="Legutóbbi megrendelések">
                        <Table
                            dataSource={recentOrders}
                            columns={columns}
                            pagination={false}
                            size="small"
                            rowKey="id"
                            scroll={{ x: 800 }}
                        />
                    </Card>
                </Col>

                {/* Quick Stats */}
                <Col xs={24} lg={8}>
                    <Card title="Gyors statisztikák">
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ marginBottom: 8 }}>
                                <span>Eladási progress</span>
                                <Progress percent={75} size="small" />
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <span>Készlet szint</span>
                                <Progress percent={60} size="small" status="active" />
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <span>Ügyfél elégedettség</span>
                                <Progress percent={85} size="small" />
                            </div>
                            <div>
                                <span>Megrendelés teljesítés</span>
                                <Progress percent={90} size="small" />
                            </div>
                        </div>

                        <div style={{ marginTop: 24 }}>
                            <Title level={4}>Közelgő határidők</Title>
                            <ul style={{ paddingLeft: 20 }}>
                                <li>Havi jelentés - 3 nap</li>
                                <li>Bérszámfejtés - 5 nap</li>
                                <li>Készlet ellenőrzés - 1 hét</li>
                                <li>Ügyfél találkozó - 2 hét</li>
                            </ul>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
