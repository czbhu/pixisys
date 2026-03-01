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
    Tooltip,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    AppstoreOutlined,
    QrcodeOutlined,
    ThunderboltOutlined,
    DatabaseOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';
import api from '../../services/api';
import QRLabelModal from '../../components/Warehouse/QRLabelModal';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';
import EnhancedTable from '../../components/EnhancedTable';

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
    const [qrModalVisible, setQrModalVisible] = useState(false);
    const [qrData, setQrData] = useState<{qrValue: string, displayCode: string, title: string, subtitle?: string} | null>(null);
    const [isInventoryVisible, setIsInventoryVisible] = useState(false);
    const [inventoryList, setInventoryList] = useState<any[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [inventoryTitle, setInventoryTitle] = useState('');
    const [searchText, setSearchText] = useState('');
    const [form] = Form.useForm();
    const [shelfForm] = Form.useForm();

    useEffect(() => {
        loadWarehouses();
    }, []);

    const fetchDefaultAddress = async () => {
        try {
            const { data } = await api.get('/core/companies/');
            // Assuming response structure (array or paginated)
            const companies = Array.isArray(data) ? data : (data.results || []);
            const defaultCompany = companies.find((c: any) => c.is_default);
            
            if (defaultCompany) {
                // Construct address string if simple string not available
                // If the API returns address string, use it.
                // Assuming standard fields: address_city, address_street, etc.
                let addr = '';
                if (defaultCompany.address_zip) addr += defaultCompany.address_zip + ' ';
                if (defaultCompany.address_city) addr += defaultCompany.address_city + ', ';
                if (defaultCompany.address_street) addr += defaultCompany.address_street + ' ';
                if (defaultCompany.address_house_number) addr += defaultCompany.address_house_number;
                
                return addr.trim();
            }
        } catch (e) { console.error('Error fetching default address', e); }
        return '';
    };

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

    const loadInventory = async (params: { warehouse?: number, shelf?: number }, title: string) => {
        setInventoryTitle(title);
        setIsInventoryVisible(true);
        setInventoryLoading(true);
        try {
            const response = await api.get('/warehouse/inventory/', { params });
            setInventoryList(Array.isArray(response.data) ? response.data : response.data.results || []);
        } catch (error) {
            console.error(error);
            message.error('Hiba a készlet betöltésekor');
        } finally {
            setInventoryLoading(false);
        }
    };

    const showCreateModal = async () => {
        setEditingWarehouse(null);
        form.resetFields();
        // Fetch default address
        const defaultAddr = await fetchDefaultAddress();
        form.setFieldsValue({ 
            is_active: true,
            address: defaultAddr
        });
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

    const showQRModal = (qrValue: string, displayCode: string, title: string, subtitle?: string) => {
        setQrData({ qrValue, displayCode, title, subtitle });
        setQrModalVisible(true);
    };

    const handleGenerateWarehouseCode = () => {
        const name = form.getFieldValue('name');
        if (!name) {
            message.warning('Kérjük, először adja meg a raktár nevét!');
            return;
        }
        
        // Remove accents and special chars for code
        const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const initials = normalized.split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ''); // Keep only alphanumeric
            
        const code = `${initials}001`;
        
        // Remove accents from code input too if needed, but here we construct it.
        // Also remove accents from user input if they typed manually? No, just generated.
        
        form.setFieldsValue({ code });
    };

    const handleGenerateShelfCode = () => {
        if (!selectedWarehouse) return;
        
        const name = shelfForm.getFieldValue('name');
        if (!name) {
            message.warning('Kérjük, először adja meg a polc nevét (pl. A sor)!');
            return;
        }

        const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const shelfInitial = normalizedName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 1).toUpperCase();
        
        const prefix = `${selectedWarehouse.code}${shelfInitial}`;
        
        // Find max suffix
        let max = 0;
        shelves.forEach(s => {
            if (s.code.startsWith(prefix)) {
                const suffix = s.code.substring(prefix.length);
                if (/^\d+$/.test(suffix)) {
                    const num = parseInt(suffix);
                    if (num > max) max = num;
                }
            }
        });

        const nextStr = (max + 1).toString().padStart(2, '0');
        shelfForm.setFieldsValue({ code: `${prefix}${nextStr}` });
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
            render: (code: string, record: Warehouse) => (
                <Space>
                    {code}
                    <Button 
                        size="small" 
                        icon={<QrcodeOutlined />} 
                        onClick={(e) => {
                            e.stopPropagation();
                            const url = `${window.location.origin}/warehouse/warehouses?id=${record.id}`;
                            showQRModal(url, code, record.name, record.address);
                        }}
                    />
                </Space>
            )
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
                <Space onClick={(e) => e.stopPropagation()}>
                    <Button
                        type="link"
                        icon={<DatabaseOutlined />}
                        onClick={() => loadInventory({ warehouse: record.id }, `Készlet: ${record.name}`)}
                        title="Készlet"
                    >
                        Készlet
                    </Button>
                    <Button
                        type="link"
                        icon={<AppstoreOutlined />}
                        onClick={() => showShelvesModal(record)}
                        title="Polcok kezelése"
                    >
                        Polcok
                    </Button>
                    <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => showViewModal(record)}
                    />
                    <Tooltip title="Szerkesztés">
                        <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => showEditModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(record.id)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const filteredWarehouses = warehouses.filter((warehouse) => deepSearchMatch(searchText, warehouse));

    return (
        <div>
            <Card
                title={<UnifiedQuickSearchHeader
                    title="Raktárak kezelése"
                    searchValue={searchText}
                    onSearchChange={setSearchText}
                    placeholder="Gyorskereső..."
                />}
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
                <EnhancedTable
                    tableKey="warehouses"
                    size="small"
                    columns={columns as any}
                    dataSource={filteredWarehouses}
                    rowKey="id"
                    loading={loading}
                    cardBreakpoint={650}
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
                        <Input 
                            addonAfter={
                                <Button 
                                    type="text" 
                                    size="small" 
                                    onClick={handleGenerateWarehouseCode}
                                    icon={<ThunderboltOutlined />}
                                >
                                    Generálás
                                </Button>
                            }
                        />
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
                                    <Input 
                                        placeholder="pl. KR001A01" 
                                        addonAfter={
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                onClick={handleGenerateShelfCode}
                                                icon={<ThunderboltOutlined />}
                                            >
                                                Generálás
                                            </Button>
                                        }
                                    />
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
                                    render: (code: string, record: Shelf) => (
                                        <Space>
                                            {code}
                                            <Button 
                                                size="small" 
                                                icon={<QrcodeOutlined />} 
                                                onClick={() => {
                                                    const url = `${window.location.origin}/warehouse/warehouses?shelf_id=${record.id}`;
                                                    showQRModal(url, code, `${selectedWarehouse?.name} - ${record.name}`, selectedWarehouse?.address);
                                                }}
                                            />
                                        </Space>
                                    )
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
                                                icon={<DatabaseOutlined />}
                                                onClick={() => loadInventory({ warehouse: selectedWarehouse?.id, shelf: record.id }, `Készlet: ${selectedWarehouse?.name} - ${record.name}`)}
                                                title="Készlet"
                                            >
                                                Készlet
                                            </Button>
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

            {/* Készlet Modal */}
            <Modal
                title={inventoryTitle}
                open={isInventoryVisible}
                onCancel={() => setIsInventoryVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsInventoryVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                <Table
                    size="small"
                    dataSource={inventoryList}
                    loading={inventoryLoading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    columns={[
                        {
                            title: 'Polc',
                            dataIndex: 'shelf_name',
                            key: 'shelf_name',
                            render: (text) => text || '-',
                        },
                        {
                            title: 'Kód',
                            dataIndex: 'material_code',
                            key: 'material_code',
                        },
                        {
                            title: 'Név',
                            dataIndex: 'material_name',
                            key: 'material_name',
                        },
                        {
                            title: 'Mennyiség',
                            key: 'quantity',
                            render: (_, record) => `${record.quantity} ${record.material_unit}`,
                        },
                        {
                            title: 'Frissítve',
                            dataIndex: 'last_updated',
                            key: 'last_updated',
                            render: (date) => date ? new Date(date).toLocaleString('hu-HU') : '-',
                        }
                    ]}
                />
            </Modal>
            
            <QRLabelModal
                visible={qrModalVisible}
                onClose={() => setQrModalVisible(false)}
                data={qrData}
                zIndex={1100}
            />
        </div>
    );
};

export default Warehouses;
