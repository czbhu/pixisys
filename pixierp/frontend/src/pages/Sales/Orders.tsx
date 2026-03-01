import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Space, Button, message, Tooltip, Popconfirm, Input } from 'antd';
import EnhancedTable from '../../components/EnhancedTable';
import { EyeOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ReloadOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';

const Orders: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [query, setQuery] = useState('');

    const load = async () => {
        try {
            setLoading(true);
            const res = await salesService.getOrders();
            const orderList = res.results ?? res;
            setOrders(orderList);
            setFiltered(orderList);
        } catch (e) {
            message.error('Hiba a rendelések betöltésekor');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Keresési logika
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    useEffect(() => {
        const q = normalize(query);
        if (!q) { setFiltered(orders); return; }
        const next = orders.filter(order => {
            const hay = [
                order.order_number || '',
                order.customer_name || order.quote?.quote_request?.customer?.name || '',
                order.quote?.quote_request?.owner_name || '',
                order.quote?.quote_request?.assignee_names || '',
                order.status || ''
            ].join(' \u0001 ');
            return normalize(hay).includes(q);
        });
        setFiltered(next);
    }, [query, orders]);

    const statusTag = (s: string) => {
        const map: any = {
            draft: { color: 'default', text: 'Vázlat' },
            confirmed: { color: 'green', text: 'Megerősítve' },
            in_production: { color: 'blue', text: 'Gyártásban' },
            completed: { color: 'purple', text: 'Kész' },
            shipped: { color: 'cyan', text: 'Szállítva' },
            delivered: { color: 'geekblue', text: 'Kiszállítva' },
            cancelled: { color: 'red', text: 'Törölve' },
        };
        const cfg = map[s] || { color: 'default', text: s };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
    };

    const columns = useMemo(() => ([
        { title: 'Rendelésszám', dataIndex: 'order_number', key: 'order_number' },
        { title: 'Keltezés', dataIndex: 'created_at', key: 'created_at', render: (d: string) => d ? new Date(d).toLocaleDateString('hu-HU') : '' },
        { title: 'Ügyfél', dataIndex: ['quote', 'quote_request', 'customer', 'name'], key: 'customer', render: (_: any, r: any): React.ReactNode => r.customer_name || r.quote?.quote_request?.customer?.name || '' },
        { title: 'Felelős', key: 'owner', render: (_: any, r: any): React.ReactNode => r.quote?.quote_request?.owner_name || '-' },
        { title: 'Résztvevők', key: 'assignees', render: (_: any, r: any): React.ReactNode => r.quote?.quote_request?.assignee_names || '-' },
        { title: 'Összeg', dataIndex: 'total_amount', key: 'total_amount', render: (n: number) => (Number(n) || 0).toLocaleString('hu-HU') + ' Ft' },
        { title: 'Határidő', dataIndex: 'delivery_date', key: 'delivery_date', render: (d: string) => d ? new Date(d).toLocaleDateString('hu-HU') : '' },
        { title: 'Státusz', dataIndex: 'status', key: 'status', render: statusTag },
        { title: 'Műveletek', key: 'actions', render: (r: any) => (
            <Space size="small">
                <Tooltip title="Megtekintés"><Button icon={<EyeOutlined />} size="small" onClick={() => navigate(`/sales/orders/${r.id}`)} /></Tooltip>
                <Tooltip title="Szerkesztés"><Button icon={<EditOutlined />} size="small" onClick={() => navigate(`/sales/orders/${r.id}/edit`)} /></Tooltip>
                {r.status === 'draft' && (
                    <Tooltip title="Megerősítés"><Button icon={<CheckCircleOutlined />} size="small" type="primary" onClick={async () => {
                        try { await salesService.confirmOrder(r.id); message.success('Megrendelés megerősítve'); load(); } catch { message.error('Nem sikerült megerősíteni'); }
                    }} /></Tooltip>
                )}
                {r.status === 'confirmed' && (
                    <Tooltip title="Gyártásba küldés"><Button icon={<PlayCircleOutlined />} size="small" type="primary" onClick={async () => {
                        try { await salesService.startProduction(r.id); message.success('Gyártás elindítva'); load(); } catch { message.error('Nem sikerült elindítani'); }
                    }} /></Tooltip>
                )}
                {r.status !== 'cancelled' && (
                    <Popconfirm title="Biztos törlöd a megrendelést?" onConfirm={async () => { try { await salesService.deleteOrder(r.id); message.success('Törölve'); load(); } catch { message.error('Nem sikerült törölni'); } }}>
                        <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                )}
            </Space>
        ) },
    ]), []);

    return (
        <Card title="Megrendelések" extra={<Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>}>
            <EnhancedTable tableKey="orders" columns={columns as any} dataSource={filtered} loading={loading} rowKey="id" pagination={{ pageSize: 10 }} cardBreakpoint={850}
                searchValue={query}
                onSearchChange={setQuery}
                searchPlaceholder="Keresés (rendelésszám, ügyfél, felelős, státusz)..."
            />
        </Card>
    );
};

export default Orders;
