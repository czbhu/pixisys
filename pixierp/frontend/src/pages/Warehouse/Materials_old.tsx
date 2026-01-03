import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Select,
    Tag,
    message,
    Row,
    Col,
    Descriptions,
    Tooltip,
    InputNumber,
    Checkbox,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
    InboxOutlined,
    DollarOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';
import api from '../../services/api';
import MaterialSupplierPrices from '../../components/MaterialSupplierPrices';

const { Option } = Select;

interface Material {
    id: number;
    name: string;
    code: string;
    description: string;
    material_type: number;
    material_type_name: string;
    unit: string;
    min_stock_level: number;
    width?: number;
    length?: number;
    height?: number;
    dimension_unit: string;
    density?: number;
    density_unit: string;
    material_format: string;
    roll_width?: number;
    sheet_division?: string;
    yield_percentage: number;
    unit_cost_price: number;
    markup_percentage: number;
    unit_selling_price: number;
    currency: string;
    default_supplier?: number;
    default_supplier_name?: string;
    is_internal_production: boolean;
    internal_production_department?: number;
    internal_production_department_name?: string;
    internal_production_cost: number; // deprecated
    internal_fixed_cost: number;
    internal_price_per_unit: number;
    internal_price_per_perimeter: number;
    internal_price_per_area: number;
    internal_price_per_weight: number;
    internal_price_per_time: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface MaterialType {
    id: number;
    name: string;
    description: string;
}

interface Supplier {
    id: number;
    name: string;
}

interface Department {
    id: number;
    name: string;
}

const Materials: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null);
    const [supplierPricesVisible, setSupplierPricesVisible] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState<{ id: number; name: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<number | null>(null);
    const [isInternalProduction, setIsInternalProduction] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        loadMaterials();
        loadMaterialTypes();
        loadSuppliers();
        loadDepartments();
    }, []);

    const loadMaterials = async () => {
        try {
            setLoading(true);
            const response = await warehouseService.getMaterials();
            setMaterials(response.results || response);
        } catch (error) {
            console.error('Error loading materials:', error);
            message.error('Hiba történt az alapanyagok betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadMaterialTypes = async () => {
        try {
            const response = await warehouseService.getMaterialTypes();
            setMaterialTypes(response.results || response);
        } catch (error) {
            console.error('Error loading material types:', error);
        }
    };

    const loadSuppliers = async () => {
        try {
            const response = await api.get('/crm/companies/?company_type=supplier');
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setSuppliers(data);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await api.get('/hr/departments/');
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setDepartments(data);
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const showCreateModal = () => {
        setEditingMaterial(null);
        form.resetFields();
        setIsInternalProduction(false);
        form.setFieldsValue({ 
            is_active: true,
            unit: 'db',
            dimension_unit: 'mm',
            density_unit: 'kg/m3',
            internal_fixed_cost: 0,
            internal_price_per_unit: 0,
            internal_price_per_perimeter: 0,
            internal_price_per_area: 0,
            internal_price_per_weight: 0,
            internal_price_per_time: 0,
        });
        setIsModalVisible(true);
    };

    const showEditModal = (material: Material) => {
        setEditingMaterial(material);
        setIsInternalProduction(material.is_internal_production || false);
        form.setFieldsValue({
            name: material.name,
            code: material.code,
            description: material.description,
            material_type: material.material_type,
            unit: material.unit,
            min_stock_level: material.min_stock_level,
            width: material.width,
            length: material.length,
            height: material.height,
            dimension_unit: material.dimension_unit,
            density: material.density,
            density_unit: material.density_unit,
            material_format: material.material_format,
            roll_width: material.roll_width,
            sheet_division: material.sheet_division,
            yield_percentage: material.yield_percentage,
            unit_cost_price: material.unit_cost_price,
            markup_percentage: material.markup_percentage,
            unit_selling_price: material.unit_selling_price,
            currency: material.currency,
            default_supplier: material.default_supplier,
            is_internal_production: material.is_internal_production,
            internal_production_department: material.internal_production_department,
            internal_production_cost: material.internal_production_cost,  // deprecated
            internal_fixed_cost: material.internal_fixed_cost,
            internal_price_per_unit: material.internal_price_per_unit,
            internal_price_per_perimeter: material.internal_price_per_perimeter,
            internal_price_per_area: material.internal_price_per_area,
            internal_price_per_weight: material.internal_price_per_weight,
            internal_price_per_time: material.internal_price_per_time,
            is_active: material.is_active,
        });
        setIsModalVisible(true);
    };

    const showViewModal = (material: Material) => {
        setViewingMaterial(material);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingMaterial) {
                await warehouseService.updateMaterial(editingMaterial.id, values);
                message.success('Alapanyag sikeresen frissítve!');
            } else {
                await warehouseService.createMaterial(values);
                message.success('Alapanyag sikeresen létrehozva!');
            }
            setIsModalVisible(false);
            form.resetFields();
            loadMaterials();
        } catch (error) {
            console.error('Error saving material:', error);
            message.error('Hiba történt az alapanyag mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await warehouseService.deleteMaterial(id);
            message.success('Alapanyag sikeresen törölve!');
            loadMaterials();
        } catch (error) {
            console.error('Error deleting material:', error);
            message.error('Hiba történt az alapanyag törlése során');
        }
    };

    const columns = [
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: Material, b: Material) => a.name.localeCompare(b.name),
        },
        {
            title: 'Kód',
            dataIndex: 'code',
            key: 'code',
            sorter: (a: Material, b: Material) => a.code.localeCompare(b.code),
        },
        {
            title: 'Típus',
            dataIndex: 'material_type_name',
            key: 'material_type_name',
            render: (type: string) => <Tag color="blue">{type}</Tag>,
        },
        {
            title: 'Mértékegység',
            dataIndex: 'unit',
            key: 'unit',
        },
        {
            title: 'Méretek',
            key: 'dimensions',
            render: (record: Material) => {
                if (record.width && record.length && record.height) {
                    return `${record.width} × ${record.length} × ${record.height} ${record.dimension_unit}`;
                }
                return '-';
            },
        },
        {
            title: 'Fajsúly',
            key: 'density',
            render: (record: Material) => {
                if (record.density) {
                    return `${record.density} ${record.density_unit}`;
                }
                return '-';
            },
        },
        {
            title: 'Min. készlet',
            dataIndex: 'min_stock_level',
            key: 'min_stock_level',
            render: (value: number, record: Material) => `${value} ${record.unit}`,
        },
        {
            title: 'Eladási ár',
            dataIndex: 'unit_selling_price',
            key: 'unit_selling_price',
            render: (price: number, record: Material) => 
                price ? `${price.toLocaleString()} ${record.currency || 'HUF'}` : '-',
        },
        {
            title: 'Forrás',
            key: 'source',
            render: (record: Material) => {
                if (record.is_internal_production) {
                    return <Tag color="green">{record.internal_production_department_name || 'Belső'}</Tag>;
                }
                return record.default_supplier_name ? (
                    <Tag color="blue">{record.default_supplier_name}</Tag>
                ) : (
                    <Tag>-</Tag>
                );
            },
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
            render: (record: Material) => (
                <Space>
                    <Tooltip title="Beszállítói árak">
                        <Button
                            type="link"
                            icon={<DollarOutlined />}
                            onClick={() => {
                                setSelectedMaterial({ id: record.id, name: record.name });
                                setSupplierPricesVisible(true);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Megtekintés">
                        <Button
                            type="link"
                            icon={<EyeOutlined />}
                            onClick={() => showViewModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Szerkesztés">
                        <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => showEditModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Button
                            type="link"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(record.id)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const filteredMaterials = materials.filter(material => {
        const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            material.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            material.description.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesType = !typeFilter || material.material_type === typeFilter;
        
        return matchesSearch && matchesType;
    });

    return (
        <div>
            <Card
                title="Alapanyagok kezelése"
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
                            placeholder="Típus szűrő"
                            value={typeFilter}
                            onChange={setTypeFilter}
                            style={{ width: 150 }}
                            allowClear
                        >
                            {materialTypes.map(type => (
                                <Option key={type.id} value={type.id}>
                                    {type.name}
                                </Option>
                            ))}
                        </Select>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={showCreateModal}
                        >
                            Új alapanyag
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={filteredMaterials}
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
                title={editingMaterial ? 'Alapanyag szerkesztése' : 'Új alapanyag létrehozása'}
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
                                name="name"
                                label="Név"
                                rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="code"
                                label="Kód"
                                rules={[{ required: true, message: 'Kérjük, adja meg a kódot!' }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="description"
                        label="Leírás"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="material_type"
                                label="Típus"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a típust!' }]}
                            >
                                <Select>
                                    {materialTypes.map(type => (
                                        <Option key={type.id} value={type.id}>
                                            {type.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="unit"
                                label="Mértékegység"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a mértékegységet!' }]}
                            >
                                <Select>
                                    <Option value="db">db</Option>
                                    <Option value="m">m</Option>
                                    <Option value="m2">m²</Option>
                                    <Option value="m3">m³</Option>
                                    <Option value="kg">kg</Option>
                                    <Option value="liter">liter</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="min_stock_level"
                                label="Minimum készletszint"
                                rules={[{ required: true, message: 'Kérjük, adja meg a minimum készletszintet!' }]}
                            >
                                <Input type="number" min={0} step={0.01} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="width"
                                label="Szélesség"
                            >
                                <Input type="number" min={0} step={0.01} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="length"
                                label="Hosszúság"
                            >
                                <Input type="number" min={0} step={0.01} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="height"
                                label="Magasság"
                            >
                                <Input type="number" min={0} step={0.01} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="dimension_unit"
                                label="Méret mértékegység"
                            >
                                <Select>
                                    <Option value="mm">mm</Option>
                                    <Option value="cm">cm</Option>
                                    <Option value="m">m</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="is_active"
                                label="Státusz"
                            >
                                <Select>
                                    <Option value={true}>Aktív</Option>
                                    <Option value={false}>Inaktív</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="density"
                                label="Fajsúly"
                            >
                                <Input type="number" min={0} step={0.01} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="density_unit"
                                label="Fajsúly mértékegység"
                            >
                                <Select>
                                    <Option value="kg/m3">kg/m³</Option>
                                    <Option value="g/cm3">g/cm³</Option>
                                    <Option value="kg/liter">kg/liter</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <h4 style={{ marginTop: 16, marginBottom: 8 }}>Árképzés</h4>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="unit_cost_price" label="Bekerülési ár">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    precision={2}
                                    addonAfter="HUF"
                                    onChange={(value) => {
                                        const costPrice = value || 0;
                                        const markup = form.getFieldValue('markup_percentage') || 0;
                                        const sellingPrice = costPrice * (1 + markup / 100);
                                        form.setFieldsValue({ unit_selling_price: sellingPrice });
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="markup_percentage" label="Haszonkulcs %">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    max={1000}
                                    precision={2}
                                    addonAfter="%"
                                    onChange={(value) => {
                                        const costPrice = form.getFieldValue('unit_cost_price') || 0;
                                        const markup = value || 0;
                                        const sellingPrice = costPrice * (1 + markup / 100);
                                        form.setFieldsValue({ unit_selling_price: sellingPrice });
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="unit_selling_price" label="Eladási ár">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    precision={2}
                                    addonAfter="HUF"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <h4 style={{ marginTop: 16, marginBottom: 8 }}>Gyártás / Beszerzés</h4>

                    <Form.Item name="is_internal_production" valuePropName="checked">
                        <Checkbox onChange={(e) => setIsInternalProduction(e.target.checked)}>
                            Belső gyártás
                        </Checkbox>
                    </Form.Item>

                    {isInternalProduction ? (
                        <>
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item
                                        name="internal_production_department"
                                        label="Gyártó osztály"
                                        rules={[{ required: true, message: 'Válassz osztályt' }]}
                                    >
                                        <Select placeholder="Válassz osztályt" allowClear>
                                            {departments.map(dept => (
                                                <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <h4>Belső gyártási árkalkuláció</h4>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="internal_fixed_cost" label="Fix költség">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="internal_price_per_unit" label="Darab alapú ár">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF/db"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="internal_price_per_perimeter" label="Kerület alapú ár">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF/m"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="internal_price_per_area" label="Terület alapú ár">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF/m²"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="internal_price_per_weight" label="Súly alapú ár">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF/kg"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="internal_price_per_time" label="Idő alapú ár">
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            min={0}
                                            precision={2}
                                            addonAfter="HUF/óra"
                                            placeholder="0.00"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    ) : (
                        <Form.Item name="default_supplier" label="Alapértelmezett beszállító">
                            <Select placeholder="Válassz beszállítót" allowClear>
                                {suppliers.map(supplier => (
                                    <Option key={supplier.id} value={supplier.id}>{supplier.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalVisible(false)}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingMaterial ? 'Frissítés' : 'Létrehozás'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Alapanyag részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
            >
                {viewingMaterial && (
                    <Descriptions column={1} bordered>
                        <Descriptions.Item label="Név">{viewingMaterial.name}</Descriptions.Item>
                        <Descriptions.Item label="Kód">{viewingMaterial.code}</Descriptions.Item>
                        <Descriptions.Item label="Leírás">{viewingMaterial.description}</Descriptions.Item>
                        <Descriptions.Item label="Típus">
                            <Tag color="blue">{viewingMaterial.material_type_name}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Mértékegység">{viewingMaterial.unit}</Descriptions.Item>
                        <Descriptions.Item label="Méretek">
                            {viewingMaterial.width && viewingMaterial.length && viewingMaterial.height 
                                ? `${viewingMaterial.width} × ${viewingMaterial.length} × ${viewingMaterial.height} ${viewingMaterial.dimension_unit}`
                                : 'Nincs megadva'
                            }
                        </Descriptions.Item>
                        <Descriptions.Item label="Fajsúly">
                            {viewingMaterial.density 
                                ? `${viewingMaterial.density} ${viewingMaterial.density_unit}`
                                : 'Nincs megadva'
                            }
                        </Descriptions.Item>
                        <Descriptions.Item label="Minimum készletszint">
                            {viewingMaterial.min_stock_level} {viewingMaterial.unit}
                        </Descriptions.Item>
                        <Descriptions.Item label="Státusz">
                            <Tag color={viewingMaterial.is_active ? 'green' : 'red'}>
                                {viewingMaterial.is_active ? 'Aktív' : 'Inaktív'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Létrehozva">
                            {new Date(viewingMaterial.created_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Módosítva">
                            {new Date(viewingMaterial.updated_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {selectedMaterial && (
                <MaterialSupplierPrices
                    visible={supplierPricesVisible}
                    materialId={selectedMaterial.id}
                    materialName={selectedMaterial.name}
                    onClose={() => {
                        setSupplierPricesVisible(false);
                        setSelectedMaterial(null);
                    }}
                />
            )}
        </div>
    );
};

export default Materials;
