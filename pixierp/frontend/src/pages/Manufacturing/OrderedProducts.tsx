import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Input,
    Select,
    message,
    Tag,
    Tooltip,
    Popconfirm,
    Row,
    Col
} from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { manufacturingService, ManufacturingProduct, ProductClass, Project, Currency } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import ManufacturingProductEditorModal from '../../components/Editors/ManufacturingProductEditorModal';

const { Option } = Select;


const STATUS_COLORS: { [key: string]: string } = {
    'quote_request_open': 'default',
    'quote_request_priced': 'blue',
    'quote_request_sent': 'cyan',
    'ordered': 'green',
    'design_in_progress': 'orange',
    'design_approved': 'purple',
    'production_in_progress': 'volcano',
    'production_completed': 'magenta',
    'finished_goods_warehouse': 'lime',
    'installation_in_progress': 'gold',
    'delivered': 'geekblue',
    'invoiced': 'cyan',
    'paid': 'success',
};

const OrderedProducts: React.FC = () => {
    const [products, setProducts] = useState<ManufacturingProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ManufacturingProduct | null>(null);
    const [viewingProduct, setViewingProduct] = useState<ManufacturingProduct | null>(null);
    const [query, setQuery] = useState('');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string[]>([
        'ordered', 'design_in_progress', 'design_approved', 
        'production_in_progress', 'production_completed', 
        'finished_goods_warehouse', 'installation_in_progress', 'delivered'
    ]);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const response = await manufacturingService.getProducts();
            // Filter out pre-order statuses
            const ordered = response.filter(p => !p.status.startsWith('quote_request'));
            setProducts(ordered);
        } catch (err) {
            console.error('Error loading products:', err);
            message.error('Hiba történt a termékek betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const showModal = (product?: ManufacturingProduct) => {
        if (product) {
            setEditingProduct(product);
        } else {
            setEditingProduct(null);
            setCreateModalOpen(true);
            return;
        }
        setIsModalVisible(true);
    };

    const showViewModal = (product: ManufacturingProduct) => {
        setViewingProduct(product);
        setIsViewModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await manufacturingService.deleteProduct(id);
            message.success('Termék sikeresen törölve!');
            loadProducts();
        } catch (err) {
            console.error('Error deleting product:', err);
            message.error('Hiba történt a termék törlése során');
        }
    };

    
    const filteredProducts = (() => {
        let result = products;
        
        // Status Filtering
        if (statusFilter && statusFilter.length > 0) {
            result = result.filter(p => statusFilter.includes(p.status));
        }

        // Search filtering
        const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const q = normalize(query);
        
        if (q) {
            result = result.filter(prod => {
                const hay = [
                    prod.name || '',
                    prod.description || '',
                    prod.product_class_name || '',
                    prod.project_name || '',
                    prod.contact_name || '',
                    prod.contact_company_name || '',
                    prod.status_display || '',
                    prod.allowed_companies_data?.map(c => c.name).join(' ') || '',
                    prod.allowed_contacts_data?.map(c => c.name).join(' ') || ''
                ].join(' \u0001 ');
                return normalize(hay).includes(q);
            });
        }
        return result;
    })();

    const columns = [
        {
            title: 'Dátum',
            dataIndex: 'date',
            key: 'date',
            width: 100,
            render: (date: string) => dayjs(date).format('YYYY.MM.DD'),
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        },
        {
            title: 'Megrendelés száma',
            dataIndex: 'id', // Using ID as Order Number for now
            key: 'id',
            width: 100,
            render: (id: any) => `#${id}`,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.id - b.id,
        },
        {
            title: 'Státusz',
            dataIndex: 'status_display',
            key: 'status',
            width: 150,
            render: (text: string, record: ManufacturingProduct) => {
                const color = STATUS_COLORS[record.status] || 'default';
                return <Tag color={color}>{text}</Tag>;
            },
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => (a.status_display || '').localeCompare(b.status_display || ''),
        },
        {
            title: 'Cikkszám',
            dataIndex: 'code',
            key: 'code',
            width: 120,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => (a.code || '').localeCompare(b.code || ''),
        },
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.name.localeCompare(b.name),
        },
        {
            title: 'Leírás',
            dataIndex: 'description',
            key: 'description',
            width: 250, 
            ellipsis: true,
            render: (text: string) => <Tooltip title={text}><span>{text}</span></Tooltip>
        },
        {
            title: 'Megjegyzés',
            dataIndex: 'internal_description',
            key: 'internal_description',
            width: 250, 
            ellipsis: true,
            render: (text: string) => <Tooltip title={text}><span>{text}</span></Tooltip>
        },
        {
            title: 'Mennyiség',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 100,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.quantity - b.quantity,
            render: (qty: any) => Number(qty).toLocaleString('hu-HU', { maximumFractionDigits: 2 })
        },
        {
            title: 'M.e.',
            dataIndex: 'quantity_unit',
            key: 'quantity_unit',
            width: 80,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: ManufacturingProduct) => (
                <Space size="small">
                    <Tooltip title="Megtekintés">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => showViewModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Szerkesztés">
                        <Button
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => showModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Popconfirm
                            title="Biztosan törölni szeretné ezt a terméket?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Igen"
                            cancelText="Mégse"
                        >
                            <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                            />
                        </Popconfirm>
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
                            options={[
                                { label: 'Rendelve', value: 'ordered' },
                                { label: 'Tervezés alatt', value: 'design_in_progress' },
                                { label: 'Terv elfogadva', value: 'design_approved' },
                                { label: 'Gyártás alatt', value: 'production_in_progress' },
                                { label: 'Gyártás kész', value: 'production_completed' },
                                { label: 'Raktáron', value: 'finished_goods_warehouse' },
                                { label: 'Telepítés alatt', value: 'installation_in_progress' },
                                { label: 'Átadva', value: 'delivered' },
                                { label: 'Számlázva', value: 'invoiced' },
                                { label: 'Fizetve', value: 'paid' },
                            ]}
                            maxTagCount="responsive"
                        />
                        <Button 
                            icon={<ReloadOutlined />} 
                            onClick={() => loadProducts()}
                        >
                            Frissítés
                        </Button>
                    </Space>
                }
            >
                <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
                    <Input
                        placeholder="Keresés..."
                        prefix={<SearchOutlined />}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        allowClear
                    />
                </Space>

                <Table
                    columns={columns}
                    dataSource={filteredProducts}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} tétel`,
                    }}
                    rowKey="id"
                    scroll={{ x: 1200 }}
                    size="small"
                    loading={loading}
                    onRow={(record) => ({
                        onDoubleClick: () => showModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            <ManufacturingProductEditorModal
                open={createModalOpen || (!!editingProduct && isModalVisible)}
                onCancel={() => {
                   setCreateModalOpen(false);
                   setIsModalVisible(false);
                   setEditingProduct(null);
                }}
                onCreated={(p) => {
                    setCreateModalOpen(false);
                    setIsModalVisible(false);
                    setEditingProduct(null);
                    loadProducts();
                }}
                editingProduct={editingProduct}
            />

            {/* Megtekintés Modal */}
             <Modal
                title="Egyedi gyártás adatai"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                {viewingProduct && (
                    <div>
                        <Row gutter={16}>
                            <Col span={12}>
                                <p><strong>Dátum:</strong> {dayjs(viewingProduct.date).format('YYYY.MM.DD')}</p>
                                <p><strong>Név:</strong> {viewingProduct.name}</p>
                                <p><strong>Mennyiség:</strong> {viewingProduct.quantity} {viewingProduct.quantity_unit}</p>
                                <p><strong>Cikkszám:</strong> {viewingProduct.code || '-'}</p>
                            </Col>
                            <Col span={12}>
                                <p><strong>Státusz:</strong> {viewingProduct.status_display}</p>
                            </Col>
                        </Row>
                        {viewingProduct.description && (
                            <div style={{ marginTop: 16 }}>
                                <p><strong>Leírás:</strong></p>
                                <p>{viewingProduct.description}</p>
                            </div>
                        )}
                        {viewingProduct.internal_description && (
                            <div style={{ marginTop: 16 }}>
                                <p><strong>Belső leírás:</strong></p>
                                <p>{viewingProduct.internal_description}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default OrderedProducts;
