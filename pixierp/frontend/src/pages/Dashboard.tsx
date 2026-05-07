import React, { useState, useEffect, useCallback } from 'react';
import {
    Row, Col, Card, Statistic, Table, Select, Typography, Spin, Alert,
    Badge, Tag, Tooltip, List, Avatar, Space
} from 'antd';
import {
    UserOutlined,
    ShoppingCartOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    CarOutlined,
    WarningOutlined,
    TeamOutlined,
    ClockCircleOutlined,
    PlusCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { salesService } from '../services/salesService';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

type DashboardView = 'manufacturing' | 'sales';

interface StatusCounts {
    new?: number;
    confirmed?: number;
    in_production?: number;
    ready?: number;
    in_delivery?: number;
    delivered?: number;
    cancelled?: number;
}

interface OrderRow {
    id: number;
    order_number: string;
    customer_name: string;
    status: string;
    order_date: string;
    quote_request_title?: string;
    deadline?: string;
    total_amount?: number;
}

interface WorkLogRow {
    id: number;
    user_name: string;
    customer_order_number: string;
    customer_order: number;
    workflow_name: string;
    item_name?: string;
    started_at: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
    new: 'Új',
    confirmed: 'Megerősítve',
    in_production: 'Gyártásban',
    ready: 'Kész',
    in_delivery: 'Szállítás alatt',
    delivered: 'Kiszállítva',
    cancelled: 'Törölve',
};

const DASHBOARD_VIEWS = [
    { value: 'manufacturing', label: 'Általános / Gyártás' },
    { value: 'sales', label: 'Értékesítés' },
];

function elapsedLabel(isoDate: string): string {
    const ms = Date.now() - new Date(isoDate).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min} perce`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} órája`;
    return `${Math.floor(h / 24)} napja`;
}

// ---------- Manufacturing Dashboard ----------

const ManufacturingDashboard: React.FC<{
    counts: StatusCounts;
    activeWorkers: WorkLogRow[];
    latestOrders: OrderRow[];
    navigate: ReturnType<typeof useNavigate>;
}> = ({ counts, activeWorkers, latestOrders, navigate }) => {
    const statCards = [
        {
            title: 'Új munkák',
            value: counts.new ?? 0,
            icon: <PlusCircleOutlined />,
            color: '#1677ff',
            status: 'new',
        },
        {
            title: 'Gyártásban',
            value: counts.in_production ?? 0,
            icon: <ThunderboltOutlined />,
            color: '#fa8c16',
            status: 'in_production',
        },
        {
            title: 'Kész munkák',
            value: counts.ready ?? 0,
            icon: <CheckCircleOutlined />,
            color: '#52c41a',
            status: 'ready',
        },
        {
            title: 'Szállítás alatt',
            value: counts.in_delivery ?? 0,
            icon: <CarOutlined />,
            color: '#13c2c2',
            status: 'in_delivery',
        },
        {
            title: 'Megerősítve',
            value: counts.confirmed ?? 0,
            icon: <ShoppingCartOutlined />,
            color: '#722ed1',
            status: 'confirmed',
        },
        {
            title: 'Aktív dolgozók',
            value: activeWorkers.length,
            icon: <TeamOutlined />,
            color: '#eb2f96',
        },
    ];

    const latestCols = [
        {
            title: 'Megrendelés',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (text: string, r: OrderRow) => (
                <a onClick={() => navigate(`/orders/${r.id}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontWeight: 500 }}>{text}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{r.customer_name}</div>
                </a>
            ),
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => {
                const colorMap: Record<string, string> = {
                    new: 'blue', confirmed: 'purple', in_production: 'orange',
                    ready: 'green', in_delivery: 'cyan', delivered: 'default', cancelled: 'red',
                };
                return <Tag color={colorMap[s] ?? 'default'}>{ORDER_STATUS_LABELS[s] ?? s}</Tag>;
            },
        },
        {
            title: 'Dátum',
            dataIndex: 'order_date',
            key: 'order_date',
            responsive: ['md'] as any,
            render: (d: string) => new Date(d).toLocaleDateString('hu-HU'),
        },
    ];

    return (
        <>
            {/* Stat cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statCards.map((card, i) => (
                    <Col xs={12} sm={8} lg={4} key={i}>
                        <Card
                            hoverable={!!card.status}
                            onClick={() => card.status && navigate(`/orders?status=${card.status}`)}
                            style={{ cursor: card.status ? 'pointer' : 'default' }}
                        >
                            <Statistic
                                title={card.title}
                                value={card.value}
                                prefix={card.icon}
                                valueStyle={{ color: card.color, fontSize: 28 }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]}>
                {/* Active workers */}
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <Badge status="processing" />
                                <span>Aktív dolgozók</span>
                                <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                                    (éppen dolgoznak)
                                </Text>
                            </Space>
                        }
                        style={{ height: '100%' }}
                    >
                        {activeWorkers.length === 0 ? (
                            <Text type="secondary">Jelenleg nincs aktív dolgozó.</Text>
                        ) : (
                            <List
                                dataSource={activeWorkers}
                                renderItem={(w) => (
                                    <List.Item style={{ paddingBlock: 8 }}>
                                        <List.Item.Meta
                                            avatar={
                                                <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
                                            }
                                            title={
                                                <Space size={4}>
                                                    <Text strong>{w.user_name || 'Ismeretlen'}</Text>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        — {elapsedLabel(w.started_at)}
                                                    </Text>
                                                </Space>
                                            }
                                            description={
                                                <Space direction="vertical" size={0}>
                                                    <Text style={{ fontSize: 12 }}>
                                                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                        {w.workflow_name || '—'}
                                                    </Text>
                                                    <a
                                                        onClick={() => navigate(`/orders/${w.customer_order}`)}
                                                        style={{ fontSize: 12 }}
                                                    >
                                                        {w.customer_order_number}
                                                    </a>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                {/* Latest orders */}
                <Col xs={24} lg={14}>
                    <Card
                        title="Legutóbbi megrendelések"
                        extra={
                            <a onClick={() => navigate('/orders')} style={{ fontSize: 13 }}>
                                Összes →
                            </a>
                        }
                    >
                        <Table
                            dataSource={latestOrders}
                            columns={latestCols}
                            pagination={false}
                            size="small"
                            rowKey="id"
                        />
                    </Card>
                </Col>
            </Row>
        </>
    );
};

// ---------- Sales Dashboard ----------

const SalesDashboard: React.FC<{
    counts: StatusCounts;
    latestOrders: OrderRow[];
    navigate: ReturnType<typeof useNavigate>;
}> = ({ counts, latestOrders, navigate }) => {
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    const delivered = counts.delivered ?? 0;
    const cancelled = counts.cancelled ?? 0;
    const active = total - delivered - cancelled;

    const statCards = [
        { title: 'Összes megrendelés', value: total, icon: <ShoppingCartOutlined />, color: '#1677ff' },
        { title: 'Aktív munkák', value: active, icon: <ThunderboltOutlined />, color: '#fa8c16' },
        { title: 'Kiszállítva', value: delivered, icon: <CheckCircleOutlined />, color: '#52c41a' },
        { title: 'Törölve', value: cancelled, icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
    ];

    const allStatusRows = [
        { status: 'new', label: 'Új' },
        { status: 'confirmed', label: 'Megerősítve' },
        { status: 'in_production', label: 'Gyártásban' },
        { status: 'ready', label: 'Kész' },
        { status: 'in_delivery', label: 'Szállítás alatt' },
        { status: 'delivered', label: 'Kiszállítva' },
        { status: 'cancelled', label: 'Törölve' },
    ];

    const latestCols = [
        {
            title: 'Megrendelés',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (text: string, r: OrderRow) => (
                <a onClick={() => navigate(`/orders/${r.id}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontWeight: 500 }}>{text}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{r.customer_name}</div>
                </a>
            ),
        },
        {
            title: 'Összeg',
            dataIndex: 'total_amount',
            key: 'total_amount',
            align: 'right' as const,
            render: (v: number) => v != null ? `${Number(v).toLocaleString('hu-HU')} Ft` : '—',
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => {
                const colorMap: Record<string, string> = {
                    new: 'blue', confirmed: 'purple', in_production: 'orange',
                    ready: 'green', in_delivery: 'cyan', delivered: 'default', cancelled: 'red',
                };
                return <Tag color={colorMap[s] ?? 'default'}>{ORDER_STATUS_LABELS[s] ?? s}</Tag>;
            },
        },
        {
            title: 'Dátum',
            dataIndex: 'order_date',
            key: 'order_date',
            responsive: ['md'] as any,
            render: (d: string) => new Date(d).toLocaleDateString('hu-HU'),
        },
    ];

    return (
        <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statCards.map((card, i) => (
                    <Col xs={12} sm={6} key={i}>
                        <Card>
                            <Statistic
                                title={card.title}
                                value={card.value}
                                prefix={card.icon}
                                valueStyle={{ color: card.color, fontSize: 28 }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]}>
                {/* Status breakdown */}
                <Col xs={24} lg={8}>
                    <Card title="Megrendelések státusz szerint">
                        {allStatusRows.map((row) => {
                            const cnt = (counts as any)[row.status] ?? 0;
                            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
                            return (
                                <div
                                    key={row.status}
                                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, cursor: 'pointer' }}
                                    onClick={() => navigate(`/orders?status=${row.status}`)}
                                >
                                    <Text>{row.label}</Text>
                                    <Space>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{pct}%</Text>
                                        <Tag>{cnt}</Tag>
                                    </Space>
                                </div>
                            );
                        })}
                    </Card>
                </Col>

                {/* Latest orders */}
                <Col xs={24} lg={16}>
                    <Card
                        title="Legutóbbi megrendelések"
                        extra={
                            <a onClick={() => navigate('/orders')} style={{ fontSize: 13 }}>
                                Összes →
                            </a>
                        }
                    >
                        <Table
                            dataSource={latestOrders}
                            columns={latestCols}
                            pagination={false}
                            size="small"
                            rowKey="id"
                        />
                    </Card>
                </Col>
            </Row>
        </>
    );
};

// ---------- Main Dashboard ----------

const Dashboard = () => {
    const [view, setView] = useState<DashboardView>(() => {
        return (localStorage.getItem('dashboardView') as DashboardView) ?? 'manufacturing';
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [counts, setCounts] = useState<StatusCounts>({});
    const [latestOrders, setLatestOrders] = useState<OrderRow[]>([]);
    const [activeWorkers, setActiveWorkers] = useState<WorkLogRow[]>([]);
    const navigate = useNavigate();

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [stats, active] = await Promise.all([
                salesService.getDashboardStats(),
                salesService.getAllActiveWorkLogs(),
            ]);
            setCounts(stats.counts ?? {});
            setLatestOrders(stats.latest_orders ?? []);
            setActiveWorkers(Array.isArray(active) ? active : []);
        } catch (err) {
            console.error('Dashboard load error:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        // Auto-refresh every 60 s
        const id = setInterval(loadData, 60000);
        return () => clearInterval(id);
    }, [loadData]);

    const handleViewChange = (v: DashboardView) => {
        setView(v);
        localStorage.setItem('dashboardView', v);
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
                <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
                <Select<DashboardView>
                    value={view}
                    onChange={handleViewChange}
                    options={DASHBOARD_VIEWS}
                    style={{ minWidth: 200 }}
                    size="large"
                />
            </div>

            {error && (
                <Alert
                    message="Hiba"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 24 }}
                />
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                </div>
            ) : (
                <>
                    {view === 'manufacturing' && (
                        <ManufacturingDashboard
                            counts={counts}
                            activeWorkers={activeWorkers}
                            latestOrders={latestOrders}
                            navigate={navigate}
                        />
                    )}
                    {view === 'sales' && (
                        <SalesDashboard
                            counts={counts}
                            latestOrders={latestOrders}
                            navigate={navigate}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default Dashboard;

