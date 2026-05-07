import React, { useState, useEffect, useCallback } from 'react';
import {
    Row, Col, Card, Statistic, Table, Select, Typography, Spin, Alert,
    Badge, Tag, List, Avatar, Space, Collapse
} from 'antd';
import {
    UserOutlined,
    ShoppingCartOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    CarOutlined,
    TeamOutlined,
    ClockCircleOutlined,
    PlusCircleOutlined,
    ExclamationCircleOutlined,
    LoginOutlined,
    LogoutOutlined,
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
    total_amount?: number;
}

interface WorkLogDetail {
    id: number;
    order_number: string;
    order_id: number;
    customer_name: string;
    quote_title: string;
    item_name: string;
    workflow_name: string;
    duration_seconds: number;
    is_running: boolean;
}

interface ActiveWork {
    order_number: string;
    order_id: number;
    customer_name: string;
    quote_title: string;
    item_name: string;
    workflow_name: string;
    started_at: string;
}

interface WorkerEntry {
    employee_id: number;
    employee_name: string;
    user_id: number;
    check_in_time: string | null;
    check_out_time: string | null;
    total_duration_seconds: number;
    is_active: boolean;
    active_work: ActiveWork | null;
    work_logs: WorkLogDetail[];
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

function durationLabel(sec: number): string {
    if (sec <= 0) return '0 perc';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h} óra ${m} perc`;
    if (h > 0) return `${h} óra`;
    return `${m} perc`;
}

function timeLabel(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Worker: napi napló táblázat ----------

const WorkerDailyTable: React.FC<{ logs: WorkLogDetail[]; navigate: ReturnType<typeof useNavigate> }> = ({ logs, navigate }) => {
    const cols = [
        {
            title: 'Ügyfél',
            dataIndex: 'customer_name',
            key: 'customer_name',
            render: (v: string) => <Text>{v || '—'}</Text>,
        },
        {
            title: 'Megrendelés',
            key: 'order',
            render: (_: any, r: WorkLogDetail) => (
                <a onClick={() => navigate(`/orders/${r.order_id}`)} style={{ cursor: 'pointer' }}>
                    {r.order_number}
                    {r.quote_title ? <span style={{ color: '#888', marginLeft: 4 }}>— {r.quote_title}</span> : null}
                </a>
            ),
        },
        {
            title: 'Munkafolyamat',
            dataIndex: 'workflow_name',
            key: 'workflow_name',
            render: (v: string, r: WorkLogDetail) => (
                <Space size={4}>
                    {r.is_running && <Badge status="processing" />}
                    <Text>{v || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'Idő',
            dataIndex: 'duration_seconds',
            key: 'duration_seconds',
            align: 'right' as const,
            render: (sec: number) => <Text style={{ whiteSpace: 'nowrap' }}>{durationLabel(sec)}</Text>,
        },
    ];

    const totalSec = logs.reduce((s, l) => s + l.duration_seconds, 0);

    return (
        <div style={{ paddingBlock: 4 }}>
            <Table
                dataSource={logs}
                columns={cols}
                rowKey="id"
                size="small"
                pagination={false}
                style={{ marginBottom: 8 }}
            />
            <div style={{ textAlign: 'right', paddingRight: 4 }}>
                <Text strong>Összesen: {durationLabel(totalSec)}</Text>
            </div>
        </div>
    );
};

// ---------- Manufacturing Dashboard ----------

const ManufacturingDashboard: React.FC<{
    counts: StatusCounts;
    workers: { active_now: WorkerEntry[]; today_report: WorkerEntry[] };
    latestOrders: OrderRow[];
    navigate: ReturnType<typeof useNavigate>;
}> = ({ counts, workers, latestOrders, navigate }) => {
    const statCards = [
        { title: 'Új munkák', value: counts.new ?? 0, icon: <PlusCircleOutlined />, color: '#1677ff', status: 'new' },
        { title: 'Gyártásban', value: counts.in_production ?? 0, icon: <ThunderboltOutlined />, color: '#fa8c16', status: 'in_production' },
        { title: 'Kész munkák', value: counts.ready ?? 0, icon: <CheckCircleOutlined />, color: '#52c41a', status: 'ready' },
        { title: 'Szállítás alatt', value: counts.in_delivery ?? 0, icon: <CarOutlined />, color: '#13c2c2', status: 'in_delivery' },
        { title: 'Megerősítve', value: counts.confirmed ?? 0, icon: <ShoppingCartOutlined />, color: '#722ed1', status: 'confirmed' },
        { title: 'Aktív dolgozók', value: workers.active_now.length, icon: <TeamOutlined />, color: '#eb2f96' },
    ];

    const latestCols = [
        {
            title: 'Megrendelés',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (text: string, r: OrderRow) => (
                <a onClick={() => navigate(`/orders/${r.id}`)}>
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

    // Collapse items for daily report
    const dailyItems = workers.today_report.map((w) => ({
        key: String(w.employee_id),
        label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Space size={6}>
                    {w.is_active
                        ? <Badge status="processing" />
                        : <Badge status="default" />}
                    <Text strong>{w.employee_name}</Text>
                </Space>
                <Space size={4} style={{ fontSize: 12, color: '#666' }}>
                    <LoginOutlined />
                    <span>{timeLabel(w.check_in_time)}</span>
                    {w.check_out_time && (
                        <>
                            <LogoutOutlined style={{ marginLeft: 4 }} />
                            <span>{timeLabel(w.check_out_time)}</span>
                        </>
                    )}
                    {w.is_active && <Tag color="green" style={{ marginLeft: 4 }}>Bent van</Tag>}
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {durationLabel(w.total_duration_seconds)}
                </Text>
                {w.active_work && (
                    <Text style={{ fontSize: 12, color: '#1677ff' }}>
                        {w.active_work.order_number}
                        {w.active_work.customer_name && ` (${w.active_work.customer_name}`}
                        {w.active_work.quote_title && ` — ${w.active_work.quote_title}`}
                        {w.active_work.customer_name && ')'}
                        {w.active_work.workflow_name && ` · ${w.active_work.workflow_name}`}
                    </Text>
                )}
            </div>
        ),
        children: w.work_logs.length > 0
            ? <WorkerDailyTable logs={w.work_logs} navigate={navigate} />
            : <Text type="secondary" style={{ paddingLeft: 8 }}>Nincs munkanapló ma.</Text>,
    }));

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
                {/* Aktív dolgozók */}
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <Badge status="processing" />
                                <span>Aktív dolgozók</span>
                                <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                                    (jelenleg bent vannak)
                                </Text>
                            </Space>
                        }
                        style={{ height: '100%' }}
                    >
                        {workers.active_now.length === 0 ? (
                            <Text type="secondary">Jelenleg nincs bejelentkezett dolgozó.</Text>
                        ) : (
                            <List
                                dataSource={workers.active_now}
                                renderItem={(w) => (
                                    <List.Item style={{ paddingBlock: 8 }}>
                                        <List.Item.Meta
                                            avatar={
                                                <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
                                            }
                                            title={
                                                <Space size={4} wrap>
                                                    <Text strong>{w.employee_name}</Text>
                                                    {w.active_work && (
                                                        <Text
                                                            style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer' }}
                                                            onClick={() => navigate(`/orders/${w.active_work!.order_id}`)}
                                                        >
                                                            — {w.active_work.order_number}
                                                        </Text>
                                                    )}
                                                </Space>
                                            }
                                            description={
                                                w.active_work ? (
                                                    <Text style={{ fontSize: 12 }}>
                                                        {[
                                                            w.active_work.customer_name,
                                                            w.active_work.quote_title,
                                                            w.active_work.workflow_name,
                                                        ].filter(Boolean).join(' — ')}
                                                    </Text>
                                                ) : (
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        Nem dolgozik semmilyen munkán
                                                    </Text>
                                                )
                                            }
                                        />
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {timeLabel(w.check_in_time)}
                                        </Text>
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                {/* Legutóbbi megrendelések */}
                <Col xs={24} lg={14}>
                    <Card
                        title="Legutóbbi megrendelések"
                        extra={<a onClick={() => navigate('/orders')} style={{ fontSize: 13 }}>Összes →</a>}
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

            {/* Napi dolgozói napló */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24}>
                    <Card title="Napi dolgozói jelentés">
                        {workers.today_report.length === 0 ? (
                            <Text type="secondary">Ma még senki nem lépett be.</Text>
                        ) : (
                            <Collapse
                                items={dailyItems}
                                ghost
                                expandIconPosition="start"
                            />
                        )}
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
                <a onClick={() => navigate(`/orders/${r.id}`)}>
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
                <Col xs={24} lg={16}>
                    <Card
                        title="Legutóbbi megrendelések"
                        extra={<a onClick={() => navigate('/orders')} style={{ fontSize: 13 }}>Összes →</a>}
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
    const [workers, setWorkers] = useState<{ active_now: WorkerEntry[]; today_report: WorkerEntry[] }>({
        active_now: [],
        today_report: [],
    });
    const navigate = useNavigate();

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [stats, workerData] = await Promise.all([
                salesService.getDashboardStats(),
                salesService.getDashboardWorkers(),
            ]);
            setCounts(stats.counts ?? {});
            setLatestOrders(stats.latest_orders ?? []);
            setWorkers({
                active_now: workerData.active_now ?? [],
                today_report: workerData.today_report ?? [],
            });
        } catch (err) {
            console.error('Dashboard load error:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
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
                <Alert message="Hiba" description={error} type="error" showIcon style={{ marginBottom: 24 }} />
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
                            workers={workers}
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
