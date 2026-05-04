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
    Popover,
    Modal,
    Input,
    Table,
} from 'antd';
import {
    EyeOutlined,
    ReloadOutlined,
    PrinterOutlined,
    FieldTimeOutlined,
    MessageOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import ProductSubItemsTable from '../../components/Manufacturing/ProductSubItemsTable';
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
    quote_item_id: number;
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
    const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();
    const [items, setItems] = useState<OrderedManufacturingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string[]>([
        'new', 'confirmed', 'in_production', 'ready', 'in_delivery',
    ]);
    const [attachmentsByProduct, setAttachmentsByProduct] = useState<Record<number, any[]>>({});
    const [attachmentsLoading, setAttachmentsLoading] = useState<Record<number, boolean>>({});
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState('');

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

    const handleStartTimer = (record: OrderedManufacturingItem) => {
        setPreselectedOrderId(record.order_id);
        setPreselectedItemId(record.id);
        setTimerModalOpen(true);
    };

    const handlePrintWorksheet = async (record: OrderedManufacturingItem) => {
        try {
            const response = await api.get(
                `/sales/customer-orders/${record.order_id}/item_work_sheet/?item_id=${record.quote_item_id}`,
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (e) {
            console.error(e);
            message.error('Hiba a munkalap letöltése során');
        }
    };

    const handleAddNote = async (record: OrderedManufacturingItem) => {
        try {
            const { data } = await api.get(`/sales/customer-order-items/${record.id}/`);
            const existing: string = data.notes || '';
            let value = existing;
            Modal.confirm({
                title: `Megjegyzés — ${record.name}`,
                width: 600,
                icon: <MessageOutlined />,
                content: (
                    <Input.TextArea
                        defaultValue={existing}
                        rows={6}
                        onChange={(e) => { value = e.target.value; }}
                        placeholder="Írja be a megjegyzést..."
                    />
                ),
                okText: 'Mentés',
                cancelText: 'Mégse',
                onOk: async () => {
                    try {
                        await api.patch(`/sales/customer-order-items/${record.id}/`, { notes: value });
                        message.success('Megjegyzés mentve');
                    } catch (e) {
                        console.error(e);
                        message.error('Megjegyzés mentése sikertelen');
                    }
                },
            });
        } catch (e) {
            console.error(e);
            message.error('Tétel betöltése sikertelen');
        }
    };

    const loadSubItems = async (record: OrderedManufacturingItem) => {
        // ProductSubItemsTable loads sub-items on mount; we only load attachments here.
        const productId = record.manufacturing_product_id;
        if (!productId || attachmentsByProduct[productId] !== undefined || attachmentsLoading[productId]) return;
        setAttachmentsLoading(prev => ({ ...prev, [productId]: true }));
        try {
            const atts = await manufacturingService.getProductAttachments(productId);
            setAttachmentsByProduct(prev => ({ ...prev, [productId]: Array.isArray(atts) ? atts : [] }));
        } catch (e) {
            console.error(e);
            setAttachmentsByProduct(prev => ({ ...prev, [productId]: [] }));
        } finally {
            setAttachmentsLoading(prev => ({ ...prev, [productId]: false }));
        }
    };

    const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url || '');
    const isPdfFile = (url: string) => /\.pdf(\?|$)/i.test(url || '');

    const openPreview = (url: string, title: string) => {
        setPreviewUrl(url);
        setPreviewTitle(title || 'Előnézet');
        setPreviewOpen(true);
    };

    const expandedRowRender = (record: OrderedManufacturingItem) => {
        const productId = record.manufacturing_product_id;
        const attachments = attachmentsByProduct[productId] || [];
        const loadingAtt = !!attachmentsLoading[productId];

        return (
            <div style={{ padding: '8px 0 8px 32px' }}>
                <ProductSubItemsTable productId={productId} />
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Csatolmányok</div>
                    <Table
                        size="small"
                        loading={loadingAtt}
                        dataSource={attachments}
                        rowKey="id"
                        pagination={false}
                        locale={{ emptyText: 'Nincs csatolmány' }}
                        columns={[
                            {
                                title: 'Fájl',
                                key: 'file',
                                render: (_: any, att: any) => {
                                    const url = att.file_url || att.file || '';
                                    const name = url ? (url.split('/').pop() || `#${att.id}`) : `#${att.id}`;
                                    return (
                                        <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
                                    );
                                },
                            },
                            {
                                title: 'Megjegyzés',
                                dataIndex: 'remark',
                                key: 'remark',
                                render: (v: string) => v || '-',
                            },
                            {
                                title: 'Preview',
                                key: 'preview',
                                width: 110,
                                render: (_: any, att: any) => {
                                    const url = att.file_url || att.file || '';
                                    const name = url ? (url.split('/').pop() || `#${att.id}`) : `#${att.id}`;
                                    if (!url) return '-';
                                    if (isImageFile(url) || isPdfFile(url)) {
                                        return <Button size="small" onClick={() => openPreview(url, name)}>Előnézet</Button>;
                                    }
                                    return '-';
                                },
                            },
                            {
                                title: 'Feltöltve',
                                dataIndex: 'created_at',
                                key: 'created_at',
                                width: 160,
                                render: (v: string) => v ? new Date(v).toLocaleString('hu-HU') : '-',
                            },
                        ]}
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/sales/customer-orders/${record.order_id}/items/${record.id}/subitems`)}>
                        Megnyitás teljes lapon
                    </Button>
                </div>
            </div>
        );
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
            width: 140,
            render: (s: string, record: OrderedManufacturingItem) => {
                const color = ORDER_ITEM_STATUS_COLORS[s] || 'default';
                const text = ORDER_ITEM_STATUS_LABELS[s] || s;
                const content = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.keys(ORDER_ITEM_STATUS_LABELS).map(opt => (
                            <Button
                                key={opt}
                                size="small"
                                type={opt === s ? 'primary' : 'text'}
                                disabled={opt === s}
                                style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(record.id, opt);
                                }}
                            >
                                {ORDER_ITEM_STATUS_LABELS[opt]}
                            </Button>
                        ))}
                    </div>
                );
                return (
                    <Popover
                        content={content}
                        title="Státusz váltás"
                        trigger="click"
                        overlayInnerStyle={{ padding: '6px 8px' }}
                    >
                        <Tag
                            color={color}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {text}
                        </Tag>
                    </Popover>
                );
            },
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
            width: 200,
            fixed: 'right' as const,
            render: (_: any, record: OrderedManufacturingItem) => (
                <Space size="small" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Munkaóra indítása">
                        <Button
                            icon={<FieldTimeOutlined />}
                            size="small"
                            onClick={() => handleStartTimer(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Megjegyzés hozzáadása">
                        <Button
                            icon={<MessageOutlined />}
                            size="small"
                            onClick={() => handleAddNote(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Munkalap nyomtatása">
                        <Button
                            icon={<PrinterOutlined />}
                            size="small"
                            onClick={() => handlePrintWorksheet(record)}
                        />
                    </Tooltip>
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
                    expandable={{
                        expandedRowRender,
                        onExpand: (expanded, record) => { if (expanded) loadSubItems(record); },
                    }}
                    onRow={(record: OrderedManufacturingItem) => ({
                        onDoubleClick: () => navigate(`/manufacturing/products/${record.manufacturing_product_id}`),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
            <Modal
                title={previewTitle || 'Előnézet'}
                open={previewOpen}
                onCancel={() => {
                    setPreviewOpen(false);
                    setPreviewUrl(null);
                    setPreviewTitle('');
                }}
                footer={null}
                width={900}
            >
                {previewUrl ? (
                    isPdfFile(previewUrl) ? (
                        <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '70vh', border: 0 }} />
                    ) : (
                        <img alt={previewTitle} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }} />
                    )
                ) : (
                    <div>Nincs előnézet</div>
                )}
            </Modal>
        </div>
    );
};

export default OrderedProducts;
