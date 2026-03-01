import React, { useEffect, useState } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { Card, Table, Button, Space, message, Tag } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const MyOrders: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const { setModalOpen } = useTimeTracker();
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        try {
            const data = await salesService.getCustomerOrders({ my_orders: 'true' });
            setOrders(data.results ?? data);
        } catch (e) {
            message.error('Hiba a betöltéskor');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const statusMap: Record<string, string> = {
        new: 'Új',
        confirmed: 'Megerősítve',
        in_production: 'Gyártásban',
        ready: 'Kész',
        in_delivery: 'Szállítás alatt',
        delivered: 'Kiszállítva',
        cancelled: 'Törölve',
        draft: 'Tervezet'
    };

    const columns = [
        { title: 'Rendelésszám', dataIndex: 'order_number' },
        { title: 'Ügyfél', dataIndex: 'customer_name', render: (v: any) => v || '-' },
        { title: 'Cím', dataIndex: 'quote_request_title', render: (v: any) => v || '-' },
        { title: 'Státusz', dataIndex: 'status', render: (s:string) => <span>{statusMap[s] || s}</span> },
        { title: 'Műveletek', render: (_: any, r: any) => (
            <Space>
                 <Button icon={<EyeOutlined />} onClick={() => navigate(`/sales/customer-orders/${r.id}`, { state: { hidePrices: true } })} />
                 <Button icon={<PlayCircleOutlined />} onClick={() => setModalOpen(true)}>Stopper</Button>
            </Space>
        )}
    ];

    const filteredOrders = orders.filter((order) => deepSearchMatch(searchText, order));

    return (
        <Card
            title="Saját megrendelések"
            extra={<Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>}
        >
            <EnhancedTable
                tableKey="myOrders"
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="Keresés..."
                dataSource={filteredOrders}
                columns={columns}
                rowKey="id"
                loading={loading}
                cardBreakpoint={600}
                onRow={(record) => ({
                    onDoubleClick: () => {
                        navigate(`/sales/customer-orders/${record.id}`, { state: { hidePrices: true } });
                    }
                })}
            />
        </Card>
    );
};
export default MyOrders;
