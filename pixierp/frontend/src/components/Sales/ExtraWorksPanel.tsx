import React, { useCallback, useEffect, useState } from 'react';
import { Button, Popconfirm, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import { ItemSelectorModal, SelectedItemPayload } from './ItemSelectorModal';

const COST_TYPE_COLOR: Record<string, string> = {
    customer: 'blue',
    own: 'orange',
};

interface ExtraWorksPanelProps {
    orderId: number;
    /** Whether to show unit prices / totals */
    showPrices?: boolean;
    /** CustomerOrderItems for linking an extra work to a specific item */
    orderItems?: any[];
    /** Called whenever an extra work is added/edited/deleted (optional refresh hook) */
    onChange?: () => void;
}

const fmt = (v: number) =>
    v
        ? v.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '0';

const ExtraWorksPanel: React.FC<ExtraWorksPanelProps> = ({
    orderId,
    showPrices = true,
    orderItems = [],
    onChange,
}) => {
    const [works, setWorks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await salesService.getExtraWorks(orderId);
            setWorks(Array.isArray(res) ? res : (res?.results ?? []));
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        if (orderId) load();
    }, [orderId, load]);

    const openAdd = () => {
        setEditing(null);
        setSelectorOpen(true);
    };

    const openEdit = (record: any) => {
        setEditing(record);
        setSelectorOpen(true);
    };

    const handleSelectorAdd = async (p: SelectedItemPayload) => {
        try {
            const payload = {
                customer_order: orderId,
                name: p.name,
                description: p.description || '',
                quantity: p.quantity ?? 1,
                unit: p.unit || 'db',
                net_unit_price: p.cost_type === 'own' ? 0 : (p.net_unit_price ?? 0),
                cost_price: (p as any).cost_price ?? 0,
                cost_type: p.cost_type || 'customer',
                notes: editing?.notes || '',
                customer_order_item: p.customer_order_item ?? null,
            };
            if (editing) {
                const updated = await salesService.updateExtraWork(editing.id, payload);
                setWorks(prev => prev.map(w => w.id === editing.id ? updated : w));
                message.success('Plusz munka frissítve');
            } else {
                const created = await salesService.createExtraWork(payload);
                setWorks(prev => [...prev, created]);
                message.success('Plusz munka hozzáadva');
            }
            setSelectorOpen(false);
            setEditing(null);
            onChange?.();
        } catch (e: any) {
            message.error(e?.response?.data?.detail || 'Mentés sikertelen');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await salesService.deleteExtraWork(id);
            setWorks(prev => prev.filter(w => w.id !== id));
            message.success('Törölve');
            onChange?.();
        } catch {
            message.error('Törlés sikertelen');
        }
    };

    const columns: any[] = [
        {
            title: 'Megnevezés',
            dataIndex: 'name',
            key: 'name',
            render: (v: string, r: any) => (
                <Space direction="vertical" size={2}>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                    {r.customer_order_item_name && (
                        <span style={{ fontSize: 11, color: '#888' }}>Tétel: {r.customer_order_item_name}</span>
                    )}
                    {r.notes && <span style={{ fontSize: 11, color: '#888' }}>{r.notes}</span>}
                </Space>
            ),
        },
        {
            title: 'Mennyiség',
            key: 'qty',
            width: 100,
            render: (_: any, r: any) => `${parseFloat(r.quantity)} ${r.unit}`,
        },
        ...(showPrices
            ? [
                {
                    title: 'Bekerülési ár',
                    dataIndex: 'cost_price',
                    key: 'cost_price',
                    width: 110,
                    render: (v: any) => `${fmt(parseFloat(v))} Ft`,
                },
                {
                    title: 'Eladási ár/egység',
                    dataIndex: 'net_unit_price',
                    key: 'net_unit_price',
                    width: 120,
                    render: (v: any, r: any) =>
                        r.cost_type === 'own' ? (
                            <Tag color="orange">Saját</Tag>
                        ) : (
                            `${fmt(parseFloat(v))} Ft`
                        ),
                },
                {
                    title: 'Össz. eladási',
                    key: 'net_total',
                    width: 110,
                    render: (_: any, r: any) =>
                        r.cost_type === 'own' ? '—' : `${fmt(r.net_total ?? parseFloat(r.quantity) * parseFloat(r.net_unit_price))} Ft`,
                },
            ]
            : []),
        {
            title: 'Típus',
            dataIndex: 'cost_type',
            key: 'cost_type',
            width: 130,
            render: (v: string) => (
                <Tag color={COST_TYPE_COLOR[v] || 'default'}>
                    {v === 'customer' ? 'Ügyfél költsége' : 'Saját költség'}
                </Tag>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    <Popconfirm
                        title="Törlöd ezt a plusz munkát?"
                        onConfirm={() => handleDelete(r.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                    Plusz munkák {works.length > 0 && <Tag>{works.length}</Tag>}
                </span>
                <Button size="small" icon={<PlusOutlined />} onClick={openAdd}>
                    Plusz munka hozzáadása
                </Button>
            </div>
            <Table
                size="small"
                rowKey="id"
                loading={loading}
                dataSource={works}
                columns={columns}
                pagination={false}
                locale={{ emptyText: 'Nincs plusz munka rögzítve' }}
            />

            <ItemSelectorModal
                open={selectorOpen}
                defaultType="service"
                mode={editing ? 'edit' : 'add'}
                initialSelection={editing ? {
                    item_type: 'service',
                    ref_id: -(editing.id),
                    name: editing.name,
                } : undefined}
                initialValues={editing ? {
                    quantity: parseFloat(editing.quantity),
                    unit: editing.unit,
                    net_unit_price: parseFloat(editing.net_unit_price),
                    cost_price: parseFloat(editing.cost_price),
                    cost_type: editing.cost_type,
                    description: editing.description,
                    customer_order_item: editing.customer_order_item ?? null,
                } : undefined}
                orderItems={orderItems.length > 0 ? orderItems : undefined}
                onCancel={() => { setSelectorOpen(false); setEditing(null); }}
                onAdd={handleSelectorAdd}
                showCostTypeField
                allowCreate={false}
            />
        </div>
    );
};

export default ExtraWorksPanel;
