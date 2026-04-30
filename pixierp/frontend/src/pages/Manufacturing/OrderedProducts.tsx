import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import {
    Card,
    Button,
    Space,
    Select,
    message,
    Tag,
    Tooltip,
} from 'antd';
import {
    EyeOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import api from '../../services/api';

const { Option } = Select;

const ORDER_ITEM_STATUS_COLORS: Record<string, string> = {
    new: 'default',
    confirmed: 'blue',
    in_production: 'orange',
    ready: 'green',
    in_delivery: 'gold',
    delivered: 'success',
    cancelled: 'red',
};

const ORDER_ITEM_STATUS_LABELS: Record<string, string> = {
    new: 'Új',
    confirmed: 'Megerősítve',
    in_production: 'Gyártásban',
    ready: 'Kész',
    in_delivery: 'Szállítás alatt',
    delivered: 'Kiszállítva',
    cancelled: 'Törölve',
};

interface OrderedManufacturingItem {
    id: number;
    order_id: number;
    order_number: string;
    order_date: string;
    order_status: string;
    status: string;
    customer_name: string;
    manufacturing_product_id: number;
    name: string;
    code: string;
    description: string;
    internal_description: string;
    quantity: number;
    unit: string;
    net_unit_price: number;
}

const OrderedProducts: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<OrderedManufacturingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string[]>([
        'new', 'confirmed', 'in_production', 'ready', 'in_delivery',
    ]);

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        try {
            setLoading(true);
            const data = await salesService.getOrderedManufacturingItems();
            setItems(data);
        } catch (err) {
            console.error('Error loading ordered manufacturing items:', err);
            message.error('Hiba történt a megrendelt gyártások betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        const prev = items;
        setItems(items.map(it => it.id === id ? { ...it, status: newStatus } : it));
        try {
            await api.patch(`/sales/customer-order-items/${id}/`, { status: newStatus });
            message.success('Státusz frissítve');
        } catch (e) {
            console.error(e);
            message.error('Státusz frissítése sikertelen');
            setItems(prev);
        }
    };

    const normalize = (s: any) =>
        (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const filtered = (() => {
        let result = items;
        if (statusFilter.length > 0) {
            result = result.filter(i => statusFilter.includes(i.status));
        }
        const q = normalize(query);
        if (q) {
            result = result.filter(i =>
                normalize([i.order_number, i.customer_name, i.name, i.code, i.description, i.internal_description].join(' ')).includes(q)
            );
        }
        return result;
    })();

    const columns = [
        {
            title: 'Megrendelés',
            dataIndex: 'order_number',
            key: 'order_number',
            width: 130,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) => a.order_number.localeCompare(b.order_number),
        },
        {
            title: 'Dátum',
            dataIndex: 'order_date',
            key: 'order_date',
            width: 100,
            render: (d: string) => d ? dayjs(d).format('YYYY.MM.DD') : '-',
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                new Date(a.order_date || 0).getTime() - new Date(b.order_date || 0).getTime(),
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            width: 160,
            render: (s: string, record: OrderedManufacturingItem) => (
                <Select
                    size="small"
                    value={s || 'new'}
                    style={{ width: 150 }}
                    onChange={(val) => handleStatusChange(record.id, val)}
                    onClick={(e) => e.stopPropagation()}
                >
                    {Object.entries(ORDER_ITEM_STATUS_LABELS).map(([v, l]) => (
                        <Option key={v} value={v}>
                            <Tag color={ORDER_ITEM_STATUS_COLORS[v] || 'default'} style={{ marginRight: 0 }}>{l}</Tag>
                        </Option>
                    ))}
                </Select>
            ),
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                (ORDER_ITEM_STATUS_LABELS[a.status] || a.status).localeCompare(ORDER_ITEM_STATUS_LABELS[b.status] || b.status),
        },
        {
            title: 'Ügyfél',
            dataIndex: 'customer_name',
            key: 'customer_name',
            width: 160,
            ellipsis: true,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                a.customer_name.localeCompare(b.customer_name),
        },
        {
            title: 'Cikkszám',
            dataIndex: 'code',
            key: 'code',
            width: 110,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                (a.code || '').localeCompare(b.code || ''),
        },
        {
            title: 'Termék neve',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) =>
                a.name.localeCompare(b.name),
        },
        {
            title: 'Leírás',
            dataIndex: 'description',
            key: 'description',
            width: 220,
            ellipsis: true,
            render: (text: string) => <Tooltip title={text}><span>{text}</span></Tooltip>,
        },
        {
            title: 'Mennyiség',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 100,
            render: (qty: number) => Number(qty).toLocaleString('hu-HU', { maximumFractionDigits: 2 }),
            sorter: (a: OrderedManufacturingItem, b: OrderedManufacturingItem) => a.quantity - b.quantity,
        },
        {
            title: 'M.e.',
            dataIndex: 'unit',
            key: 'unit',
            width: 70,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 80,
            fixed: 'right' as const,
            render: (_: any, record: OrderedManufacturingItem) => (
                <Space size="small">
                    <Tooltip title="Gyártás megnyitása">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => navigate(`/manufacturing/products/${record.manufacturing_product_id}`)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Card
                title="Megrendelt Gyártások"
                extra={
                    <Space>
                        <Select
                            mode="multiple"
                            allowClear
                            style={{ minWidth: 200, maxWidth: 400 }}
                            placeholder="Szűrés státusz alapján"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={Object.entries(ORDER_ITEM_STATUS_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                            maxTagCount="responsive"
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={loadItems}
                        >
                            Frissítés
                        </Button>
                    </Space>
                }
            >
                <EnhancedTable
                    tableKey="orderedManufacturingItems"
                    searchValue={query}
                    onSearchChange={setQuery}
                    searchPlaceholder="Keresés megrendelés, ügyfél, termék szerint..."
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total: number, range: [number, number]) =>
                            `${range[0]}-${range[1]} / ${total} tétel`,
                    }}
                    rowKey="id"
                    cardBreakpoint={950}
                    size="small"
                    loading={loading}
                    onRow={(record: OrderedManufacturingItem) => ({
                        onDoubleClick: () => navigate(`/manufacturing/products/${record.manufacturing_product_id}`),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
        </div>
    );
};

export default OrderedProducts;
