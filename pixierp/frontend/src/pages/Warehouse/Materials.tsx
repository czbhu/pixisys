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
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
    InboxOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';

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
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface MaterialType {
    id: number;
    name: string;
    description: string;
}

const Materials: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<number | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadMaterials();
        loadMaterialTypes();
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

    const showCreateModal = () => {
        setEditingMaterial(null);
        form.resetFields();
        form.setFieldsValue({ 
            is_active: true,
            unit: 'db',
            dimension_unit: 'mm',
            density_unit: 'kg/m3'
        });
        setIsModalVisible(true);
    };

    const showEditModal = (material: Material) => {
        setEditingMaterial(material);
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
        </div>
    );
};

export default Materials;
