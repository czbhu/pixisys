import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Switch,
    Select,
    message,
    Tag,
    Tooltip,
    Popconfirm
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined
} from '@ant-design/icons';
import { manufacturingService, ProductClass } from '../../services/manufacturingService';
import { hrService } from '../../services/hrService';

const { Option } = Select;
const { TextArea } = Input;

const ProductClasses: React.FC = () => {
    const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
    const [filtered, setFiltered] = useState<ProductClass[]>([]);
    const [query, setQuery] = useState('');
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingProductClass, setEditingProductClass] = useState<ProductClass | null>(null);
    const [viewingProductClass, setViewingProductClass] = useState<ProductClass | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadProductClasses();
        loadDepartments();
    }, []);

    const loadProductClasses = async () => {
        try {
            setLoading(true);
            const response = await manufacturingService.getProductClasses();
            setProductClasses(response);
        } catch (err) {
            console.error('Error loading product classes:', err);
            message.error('Hiba történt a termék osztályok betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await hrService.getDepartments();
            setDepartments((response as any).results || response);
        } catch (err) {
            console.error('Error loading departments:', err);
        }
    };

    const showModal = (productClass?: ProductClass) => {
        if (productClass) {
            setEditingProductClass(productClass);
            form.setFieldsValue({
                name: productClass.name,
                is_default: productClass.is_default,
                calculators: productClass.calculators,
                hr_departments: productClass.hr_department_names.map(name =>
                    departments.find(dept => dept.name === name)?.id
                ).filter(Boolean)
            });
        } else {
            setEditingProductClass(null);
            form.resetFields();
        }
        setIsModalVisible(true);
    };

    const showViewModal = (productClass: ProductClass) => {
        setViewingProductClass(productClass);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            const data = {
                ...values,
                hr_departments: values.hr_departments || []
            };

            if (editingProductClass) {
                await manufacturingService.updateProductClass(editingProductClass.id, data);
                message.success('Termék osztály sikeresen frissítve!');
            } else {
                await manufacturingService.createProductClass(data);
                message.success('Termék osztály sikeresen létrehozva!');
            }

            setIsModalVisible(false);
            form.resetFields();
            loadProductClasses();
        } catch (err) {
            console.error('Error saving product class:', err);
            message.error('Hiba történt a termék osztály mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await manufacturingService.deleteProductClass(id);
            message.success('Termék osztály sikeresen törölve!');
            loadProductClasses();
        } catch (err) {
            console.error('Error deleting product class:', err);
            message.error('Hiba történt a termék osztály törlése során');
        }
    };

    const columns = [
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: ProductClass, b: ProductClass) => a.name.localeCompare(b.name),
        },
        {
            title: 'Alapértelmezett',
            dataIndex: 'is_default',
            key: 'is_default',
            render: (isDefault: boolean) => (
                <Tag color={isDefault ? 'green' : 'default'}>
                    {isDefault ? 'Igen' : 'Nem'}
                </Tag>
            ),
            sorter: (a: ProductClass, b: ProductClass) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1),
        },
        {
            title: 'Kalkulátorok',
            dataIndex: 'calculators',
            key: 'calculators',
            render: (calculators: string[]) => (
                <div>
                    {calculators.map((calc, index) => (
                        <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                            {calc}
                        </Tag>
                    ))}
                </div>
            ),
            sorter: (a: ProductClass, b: ProductClass) => (a.calculators || []).length - (b.calculators || []).length,
        },
        {
            title: 'HR osztályok',
            dataIndex: 'hr_department_names',
            key: 'hr_department_names',
            render: (departmentNames: string[]) => (
                <div>
                    {departmentNames.map((name, index) => (
                        <Tag key={index} color="orange" style={{ marginBottom: 2 }}>
                            {name}
                        </Tag>
                    ))}
                </div>
            ),
            sorter: (a: ProductClass, b: ProductClass) => (a.hr_department_names || []).length - (b.hr_department_names || []).length,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: ProductClass) => (
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
                            title="Biztosan törölni szeretné ezt a termék osztályt?"
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
                title="Termék osztályok"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                    >
                        Új termék osztály
                    </Button>
                }
            >
                <Input
                    placeholder="Keresés (név, kalkulátorok, osztályok)..."
                    prefix={<SearchOutlined />}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ marginBottom: 16 }}
                    allowClear
                />

                <Table
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} termék osztály`,
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

            {/* Termék osztály Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{editingProductClass ? 'Termék osztály szerkesztése' : 'Új termék osztály'}</span>
                        <Space>
                            <Button
                                type="primary"
                                onClick={() => form.submit()}
                            >
                                Mentés
                            </Button>
                            <Button
                                onClick={() => {
                                    setIsModalVisible(false);
                                    form.resetFields();
                                }}
                            >
                                Bezárás
                            </Button>
                        </Space>
                    </div>
                }
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                width={600}
                footer={null}
                closable={false}
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
                        <Input placeholder="Termék osztály neve" />
                    </Form.Item>

                    <Form.Item
                        name="is_default"
                        label="Alapértelmezett"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="calculators"
                        label="Kalkulátorok"
                    >
                        <Select
                            mode="tags"
                            placeholder="Kalkulátorok hozzáadása"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="hr_departments"
                        label="HR osztályok"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon HR osztályokat"
                            allowClear
                        >
                            {departments.map(dept => (
                                <Option key={dept.id} value={dept.id}>
                                    {dept.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Termék osztály adatai"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={600}
            >
                {viewingProductClass && (
                    <div>
                        <p><strong>Név:</strong> {viewingProductClass.name}</p>
                        <p><strong>Alapértelmezett:</strong> {viewingProductClass.is_default ? 'Igen' : 'Nem'}</p>
                        <p><strong>Kalkulátorok:</strong></p>
                        <div>
                            {viewingProductClass.calculators.map((calc, index) => (
                                <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                                    {calc}
                                </Tag>
                            ))}
                        </div>
                        <p><strong>HR osztályok:</strong></p>
                        <div>
                            {viewingProductClass.hr_department_names.map((name, index) => (
                                <Tag key={index} color="orange" style={{ marginBottom: 2 }}>
                                    {name}
                                </Tag>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ProductClasses;
