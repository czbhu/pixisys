import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    message,
    Tag,
    Descriptions,
    Collapse,
    Popconfirm,
    Switch,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    AppstoreOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';
import api from '../../services/api';

const { TextArea } = Input;
const { Panel } = Collapse;

interface Warehouse {
    id: number;
    name: string;
    code: string;
    address: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface Shelf {
    id: number;
    warehouse: number;
    name: string;
    code: string;
    description: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const Warehouses: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [isShelfModalVisible, setIsShelfModalVisible] = useState(false);
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
    const [viewingWarehouse, setViewingWarehouse] = useState<Warehouse | null>(null);
    const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
    const [shelves, setShelves] = useState<Shelf[]>([]);
    const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);
    const [form] = Form.useForm();
    const [shelfForm] = Form.useForm();

    useEffect(() => {
        loadWarehouses();
    }, []);

    const loadWarehouses = async () => {
        try {
            setLoading(true);
            const response = await warehouseService.getWarehouses();
            setWarehouses(response.results || response);
        } catch (error) {
            console.error('Error loading warehouses:', error);
            message.error('Hiba történt a raktárak betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const showCreateModal = () => {
        setEditingWarehouse(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setIsModalVisible(true);
    };

    const showEditModal = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse);
        form.setFieldsValue({
            name: warehouse.name,
            code: warehouse.code,
            address: warehouse.address,
            is_active: warehouse.is_active,
        });
        setIsModalVisible(true);
    };

    const showViewModal = (warehouse: Warehouse) => {
        setViewingWarehouse(warehouse);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingWarehouse) {
                await warehouseService.updateWarehouse(editingWarehouse.id, values);
                message.success('Raktár sikeresen frissítve!');
            } else {
                await warehouseService.createWarehouse(values);
                message.success('Raktár sikeresen létrehozva!');
            }
            setIsModalVisible(false);
            form.resetFields();
            loadWarehouses();
        } catch (error) {
            console.error('Error saving warehouse:', error);
            message.error('Hiba történt a raktár mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await warehouseService.deleteWarehouse(id);
            message.success('Raktár sikeresen törölve!');
            loadWarehouses();
        } catch (error) {
            console.error('Error deleting warehouse:', error);
            message.error('Hiba történt a raktár törlése során');
        }
    };

    // Polc kezelő funkciók
    const showShelvesModal = async (warehouse: Warehouse) => {
        setSelectedWarehouse(warehouse);
        await loadShelves(warehouse.id);
        setIsShelfModalVisible(true);
    };

    const loadShelves = async (warehouseId: number) => {
        try {
            const response = await api.get(`/warehouse/shelves/?warehouse=${warehouseId}`);
            setShelves(Array.isArray(response.data) ? response.data : response.data.results || []);
        } catch (error) {
            message.error('Hiba a polcok betöltésekor');
            console.error(error);
        }
    };

    const showCreateShelf = () => {
        setEditingShelf(null);
        shelfForm.resetFields();
        shelfForm.setFieldsValue({ is_active: true });
    };

    const showEditShelf = (shelf: Shelf) => {
        setEditingShelf(shelf);
        shelfForm.setFieldsValue(shelf);
    };

    const handleShelfSubmit = async (values: any) => {
        if (!selectedWarehouse) return;
        
        try {
            values.warehouse = selectedWarehouse.id;
            if (editingShelf) {
                await api.patch(`/warehouse/shelves/${editingShelf.id}/`, values);
                message.success('Polc frissítve');
            } else {
                await api.post('/warehouse/shelves/', values);
                message.success('Polc létrehozva');
            }
            shelfForm.resetFields();
            setEditingShelf(null);
            loadShelves(selectedWarehouse.id);
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Hiba a polc mentésekor');
            console.error(error);
        }
    };

    const handleDeleteShelf = async (id: number) => {
        try {
            await api.delete(`/warehouse/shelves/${id}/`);
            message.success('Polc törölve');
            if (selectedWarehouse) {
                loadShelves(selectedWarehouse.id);
            }
        } catch (error) {
            message.error('Hiba a polc törlésekor');
            console.error(error);
        }
    };

    const columns = [
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: Warehouse, b: Warehouse) => a.name.localeCompare(b.name),
        },
        {
            title: 'Kód',
            dataIndex: 'code',
            key: 'code',
            sorter: (a: Warehouse, b: Warehouse) => a.code.localeCompare(b.code),
        },
        {
            title: 'Cím',
            dataIndex: 'address',
            key: 'address',
        },
        {
            title: 'Státusz',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'green' : 'red'}>
                    {isActive ? 'Aktív' : 'Inaktív'}
                </Tag>
            ),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (record: Warehouse) => (
                <Space>
                    <Button
                        type="link"
                        icon={<AppstoreOutlined />}
                        onClick={() => showShelvesModal(record)}
                        title="Polcok kezelése"
                    >
                        Polcok
                    </Button>
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => showViewModal(record)}
                    />
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => showEditModal(record)}
                    />
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Card
                title="Raktárak kezelése"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={showCreateModal}
                    >
                        Új raktár
                    </Button>
                }
            >
                <Table
                    columns={columns}
                    dataSource={warehouses}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    onRow={(record) => ({
                        onDoubleClick: () => showEditModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            {/* Létrehozás/Szerkesztés Modal */}
            <Modal
                title={editingWarehouse ? 'Raktár szerkesztése' : 'Új raktár létrehozása'}
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="name"
                        label="Név"
                        rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="code"
                        label="Kód"
                        rules={[{ required: true, message: 'Kérjük, adja meg a kódot!' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="address"
                        label="Cím"
                        rules={[{ required: true, message: 'Kérjük, adja meg a címet!' }]}
                    >
                        <TextArea rows={3} />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label="Státusz"
                    >
                        <Input type="checkbox" />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalVisible(false)}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingWarehouse ? 'Frissítés' : 'Létrehozás'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Raktár részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
            >
                {viewingWarehouse && (
                    <Descriptions column={1} bordered>
                        <Descriptions.Item label="Név">{viewingWarehouse.name}</Descriptions.Item>
                        <Descriptions.Item label="Kód">{viewingWarehouse.code}</Descriptions.Item>
                        <Descriptions.Item label="Cím">{viewingWarehouse.address}</Descriptions.Item>
                        <Descriptions.Item label="Státusz">
                            <Tag color={viewingWarehouse.is_active ? 'green' : 'red'}>
                                {viewingWarehouse.is_active ? 'Aktív' : 'Inaktív'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Létrehozva">
                            {new Date(viewingWarehouse.created_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Módosítva">
                            {new Date(viewingWarehouse.updated_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {/* Polcok kezelése Modal */}
            <Modal
                title={`Polcok kezelése - ${selectedWarehouse?.name || ''}`}
                open={isShelfModalVisible}
                onCancel={() => {
                    setIsShelfModalVisible(false);
                    setSelectedWarehouse(null);
                    setShelves([]);
                    shelfForm.resetFields();
                    setEditingShelf(null);
                }}
                width={900}
                footer={null}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Card 
                        title={editingShelf ? 'Polc szerkesztése' : 'Új polc hozzáadása'}
                        size="small"
                    >
                        <Form
                            form={shelfForm}
                            layout="vertical"
                            onFinish={handleShelfSubmit}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 16 }}>
                                <Form.Item
                                    name="name"
                                    label="Név"
                                    rules={[{ required: true, message: 'Kötelező mező' }]}
                                >
                                    <Input placeholder="pl. A1" />
                                </Form.Item>

                                <Form.Item
                                    name="code"
                                    label="Kód"
                                    rules={[{ required: true, message: 'Kötelező mező' }]}
                                >
                                    <Input placeholder="pl. A1" />
                                </Form.Item>

                                <Form.Item name="description" label="Leírás">
                                    <Input placeholder="Polc leírása" />
                                </Form.Item>
                            </div>

                            <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                                <Switch />
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                                <Space>
                                    {editingShelf && (
                                        <Button onClick={() => {
                                            setEditingShelf(null);
                                            shelfForm.resetFields();
                                            shelfForm.setFieldsValue({ is_active: true });
                                        }}>
                                            Mégse
                                        </Button>
                                    )}
                                    <Button type="primary" htmlType="submit">
                                        {editingShelf ? 'Frissítés' : 'Hozzáadás'}
                                    </Button>
                                </Space>
                            </Form.Item>
                        </Form>
                    </Card>

                    <Card title="Polcok listája" size="small">
                        <Table
                            dataSource={shelves}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            columns={[
                                {
                                    title: 'Név',
                                    dataIndex: 'name',
                                    key: 'name',
                                },
                                {
                                    title: 'Kód',
                                    dataIndex: 'code',
                                    key: 'code',
                                },
                                {
                                    title: 'Leírás',
                                    dataIndex: 'description',
                                    key: 'description',
                                },
                                {
                                    title: 'Státusz',
                                    dataIndex: 'is_active',
                                    key: 'is_active',
                                    render: (isActive: boolean) => (
                                        <Tag color={isActive ? 'green' : 'red'}>
                                            {isActive ? 'Aktív' : 'Inaktív'}
                                        </Tag>
                                    ),
                                },
                                {
                                    title: 'Műveletek',
                                    key: 'actions',
                                    render: (record: Shelf) => (
                                        <Space>
                                            <Button
                                                type="link"
                                                icon={<EditOutlined />}
                                                onClick={() => showEditShelf(record)}
                                            />
                                            <Popconfirm
                                                title="Biztosan törölni szeretnéd?"
                                                onConfirm={() => handleDeleteShelf(record.id)}
                                                okText="Igen"
                                                cancelText="Nem"
                                            >
                                                <Button
                                                    type="link"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                />
                                            </Popconfirm>
                                        </Space>
                                    ),
                                },
                            ]}
                        />
                    </Card>
                </Space>
            </Modal>
        </div>
    );
};

export default Warehouses;
