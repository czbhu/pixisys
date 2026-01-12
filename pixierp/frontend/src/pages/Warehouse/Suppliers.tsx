import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Modal,
    Form,
    message,
    Row,
    Col,
    InputNumber,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';
import { crmService } from '../../services/crmService';

const { Option } = Select;

interface MaterialSupplier {
    id: number;
    material_name: string;
    supplier_name: string;
    supplier_code: string;
    unit_price: number;
    currency: string;
    is_primary: boolean;
    is_active: boolean;
}

const Suppliers: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null);
    const [viewingSupplier, setViewingSupplier] = useState<MaterialSupplier | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [materialFilter, setMaterialFilter] = useState<number | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadSuppliers();
        loadMaterials();
        loadCompanies();
    }, []);

    const loadSuppliers = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (materialFilter) params.material = materialFilter;
            
            const response = await warehouseService.getMaterialSuppliers(params);
            setSuppliers((response as any).results || response);
        } catch (error) {
            console.error('Error loading suppliers:', error);
            message.error('Hiba történt a beszállítók betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadMaterials = async () => {
        try {
            const response = await warehouseService.getMaterials();
            setMaterials((response as any).results || response);
        } catch (error) {
            console.error('Error loading materials:', error);
        }
    };

    const loadCompanies = async () => {
        try {
            const response = await crmService.getCompanies();
            const supplierCompanies = ((response as any).results || response).filter((company: any) => company.is_supplier);
            setCompanies(supplierCompanies);
        } catch (error) {
            console.error('Error loading companies:', error);
        }
    };

    useEffect(() => {
        loadSuppliers();
    }, [materialFilter]);

    const showCreateModal = () => {
        setEditingSupplier(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true, is_primary: false, currency: 'HUF' });
        setIsModalVisible(true);
    };

    const showEditModal = (supplier: MaterialSupplier) => {
        setEditingSupplier(supplier);
        form.setFieldsValue({
            material: supplier.material_name,
            supplier: supplier.supplier_name,
            supplier_code: supplier.supplier_code,
            unit_price: supplier.unit_price,
            currency: supplier.currency,
            is_primary: supplier.is_primary,
            is_active: supplier.is_active,
        });
        setIsModalVisible(true);
    };

    const showViewModal = (supplier: MaterialSupplier) => {
        setViewingSupplier(supplier);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingSupplier) {
                await warehouseService.updateMaterialSupplier(editingSupplier.id, values);
                message.success('Beszállító sikeresen frissítve!');
            } else {
                await warehouseService.createMaterialSupplier(values);
                message.success('Beszállító sikeresen létrehozva!');
            }
            setIsModalVisible(false);
            form.resetFields();
            loadSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            message.error('Hiba történt a beszállító mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await warehouseService.deleteMaterialSupplier(id);
            message.success('Beszállító sikeresen törölve!');
            loadSuppliers();
        } catch (error) {
            console.error('Error deleting supplier:', error);
            message.error('Hiba történt a beszállító törlése során');
        }
    };

    const columns = [
        {
            title: 'Alapanyag',
            dataIndex: 'material_name',
            key: 'material_name',
            sorter: (a: MaterialSupplier, b: MaterialSupplier) => a.material_name.localeCompare(b.material_name),
        },
        {
            title: 'Beszállító',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
            sorter: (a: MaterialSupplier, b: MaterialSupplier) => a.supplier_name.localeCompare(b.supplier_name),
        },
        {
            title: 'Beszállító kód',
            dataIndex: 'supplier_code',
            key: 'supplier_code',
        },
        {
            title: 'Egységár',
            key: 'unit_price',
            render: (record: MaterialSupplier) => `${record.unit_price.toLocaleString()} ${record.currency}`,
            sorter: (a: MaterialSupplier, b: MaterialSupplier) => a.unit_price - b.unit_price,
        },
        {
            title: 'Elsődleges',
            dataIndex: 'is_primary',
            key: 'is_primary',
            render: (isPrimary: boolean) => (
                <Tag color={isPrimary ? 'green' : 'default'}>
                    {isPrimary ? 'Igen' : 'Nem'}
                </Tag>
            ),
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
            render: (record: MaterialSupplier) => (
                <Space>
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

    const filteredSuppliers = suppliers.filter(supplier =>
        supplier.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.supplier_code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            <Card
                title="Alapanyag beszállítók"
                extra={
                    <Space>
                        <Input
                            placeholder="Keresés..."
                            prefix={<SearchOutlined />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: 200 }}
                        />
                        <Select
                            placeholder="Alapanyag szűrő"
                            value={materialFilter}
                            onChange={setMaterialFilter}
                            style={{ width: 200 }}
                            allowClear
                        >
                            {materials.map(material => (
                                <Option key={material.id} value={material.id}>
                                    {material.name} ({material.code})
                                </Option>
                            ))}
                        </Select>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={showCreateModal}
                        >
                            Új beszállító
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={filteredSuppliers}
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
                title={editingSupplier ? 'Beszállító szerkesztése' : 'Új beszállító létrehozása'}
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
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="material"
                                label="Alapanyag"
                                rules={[{ required: true, message: 'Kérjük, válassza ki az alapanyagot!' }]}
                            >
                                <Select
                                    showSearch
                                    placeholder="Válasszon alapanyagot"
                                    optionFilterProp="children"
                                    filterOption={(input, option) =>
                                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                >
                                    {materials.map(material => (
                                        <Option key={material.id} value={material.id}>
                                            {material.name} ({material.code})
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="supplier"
                                label="Beszállító"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a beszállítót!' }]}
                            >
                                <Select
                                    showSearch
                                    placeholder="Válasszon beszállítót"
                                    optionFilterProp="children"
                                    filterOption={(input, option) =>
                                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                >
                                    {companies.map(company => (
                                        <Option key={company.id} value={company.id}>
                                            {company.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="supplier_code"
                                label="Beszállító kód"
                            >
                                <Input placeholder="Beszállító saját kódja" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="unit_price"
                                label="Egységár"
                                rules={[{ required: true, message: 'Kérjük, adja meg az egységárat!' }]}
                            >
                                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="currency"
                                label="Pénznem"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a pénznemet!' }]}
                            >
                                <Select>
                                    <Option value="HUF">HUF</Option>
                                    <Option value="EUR">EUR</Option>
                                    <Option value="USD">USD</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="is_primary"
                                label="Elsődleges beszállító"
                                valuePropName="checked"
                            >
                                <Input type="checkbox" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="is_active"
                                label="Aktív"
                                valuePropName="checked"
                            >
                                <Input type="checkbox" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalVisible(false)}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingSupplier ? 'Frissítés' : 'Létrehozás'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Beszállító részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
            >
                {viewingSupplier && (
                    <div>
                        <p><strong>Alapanyag:</strong> {viewingSupplier.material_name}</p>
                        <p><strong>Beszállító:</strong> {viewingSupplier.supplier_name}</p>
                        <p><strong>Beszállító kód:</strong> {viewingSupplier.supplier_code}</p>
                        <p><strong>Egységár:</strong> {viewingSupplier.unit_price.toLocaleString()} {viewingSupplier.currency}</p>
                        <p><strong>Elsődleges:</strong> <Tag color={viewingSupplier.is_primary ? 'green' : 'default'}>{viewingSupplier.is_primary ? 'Igen' : 'Nem'}</Tag></p>
                        <p><strong>Státusz:</strong> <Tag color={viewingSupplier.is_active ? 'green' : 'red'}>{viewingSupplier.is_active ? 'Aktív' : 'Inaktív'}</Tag></p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Suppliers;
