import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Form, InputNumber, Select, message, Space, Popconfirm, Checkbox } from 'antd';
import NumInput from './NumInput';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

const { Option } = Select;

interface SupplierPrice {
    id: number;
    material: number;
    material_name: string;
    supplier: number;
    supplier_name: string;
    is_default: boolean;
    fixed_cost: number;
    price_per_unit: number;
    price_per_perimeter: number;
    price_per_area: number;
    price_per_weight: number;
    price_per_time: number;
    currency: string;
    min_order_quantity?: number;
    lead_time_days?: number;
    notes?: string;
    is_active: boolean;
}

interface Supplier {
    id: number;
    name: string;
}

interface MaterialSupplierPricesProps {
    visible: boolean;
    materialId: number;
    materialName: string;
    onClose: () => void;
}

const MaterialSupplierPrices: React.FC<MaterialSupplierPricesProps> = ({ 
    visible, 
    materialId, 
    materialName, 
    onClose 
}) => {
    const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingPrice, setEditingPrice] = useState<SupplierPrice | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible && materialId) {
            fetchSupplierPrices();
            fetchSuppliers();
        }
    }, [visible, materialId]);

    const fetchSupplierPrices = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/warehouse/material-supplier-prices/?material_id=${materialId}`);
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setSupplierPrices(data);
        } catch (error) {
            message.error('Hiba a beszállítói árak betöltésekor');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const response = await api.get('/crm/companies/?company_type=supplier');
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setSuppliers(data);
        } catch (error) {
            console.error('Hiba a beszállítók betöltésekor:', error);
        }
    };

    const handleCreate = () => {
        setEditingPrice(null);
        form.resetFields();
        form.setFieldsValue({
            material: materialId,
            currency: 'HUF',
            is_default: false,
            is_active: true,
            fixed_cost: 0,
            price_per_unit: 0,
            price_per_perimeter: 0,
            price_per_area: 0,
            price_per_weight: 0,
            price_per_time: 0,
        });
        setEditModalVisible(true);
    };

    const handleEdit = (record: SupplierPrice) => {
        setEditingPrice(record);
        form.setFieldsValue(record);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/warehouse/material-supplier-prices/${id}/`);
            message.success('Beszállítói ár törölve');
            fetchSupplierPrices();
        } catch (error) {
            message.error('Hiba a törlés során');
            console.error(error);
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingPrice) {
                await api.patch(`/warehouse/material-supplier-prices/${editingPrice.id}/`, values);
                message.success('Beszállítói ár frissítve');
            } else {
                await api.post('/warehouse/material-supplier-prices/', values);
                message.success('Beszállítói ár létrehozva');
            }
            setEditModalVisible(false);
            fetchSupplierPrices();
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Hiba a mentés során');
            console.error(error);
        }
    };

    const columns = [
        {
            title: 'Beszállító',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
        },
        {
            title: 'Alapértelmezett',
            dataIndex: 'is_default',
            key: 'is_default',
            render: (value: boolean) => value ? '✓' : '',
            width: 130,
        },
        {
            title: 'Fix költség',
            dataIndex: 'fixed_cost',
            key: 'fixed_cost',
            render: (value: number) => `${Number(value).toLocaleString()} HUF`,
        },
        {
            title: 'Darab',
            dataIndex: 'price_per_unit',
            key: 'price_per_unit',
            render: (value: number) => value > 0 ? `${Number(value).toLocaleString()} HUF/db` : '-',
        },
        {
            title: 'Kerület',
            dataIndex: 'price_per_perimeter',
            key: 'price_per_perimeter',
            render: (value: number) => value > 0 ? `${Number(value).toLocaleString()} HUF/m` : '-',
        },
        {
            title: 'Terület',
            dataIndex: 'price_per_area',
            key: 'price_per_area',
            render: (value: number) => value > 0 ? `${Number(value).toLocaleString()} HUF/m²` : '-',
        },
        {
            title: 'Súly',
            dataIndex: 'price_per_weight',
            key: 'price_per_weight',
            render: (value: number) => value > 0 ? `${Number(value).toLocaleString()} HUF/kg` : '-',
        },
        {
            title: 'Idő',
            dataIndex: 'price_per_time',
            key: 'price_per_time',
            render: (value: number) => value > 0 ? `${Number(value).toLocaleString()} HUF/óra` : '-',
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (_: any, record: SupplierPrice) => (
                <Space>
                    <Button 
                        type="link" 
                        icon={<EditOutlined />} 
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title="Biztosan törlöd?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Modal
                title={`Beszállítói árak - ${materialName}`}
                open={visible}
                onCancel={onClose}
                width={1200}
                footer={[
                    <Button key="close" onClick={onClose}>
                        Bezárás
                    </Button>
                ]}
            >
                <div style={{ marginBottom: 16 }}>
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleCreate}
                    >
                        Új beszállítói ár
                    </Button>
                </div>
                
                <Table
                    columns={columns}
                    dataSource={supplierPrices}
                    loading={loading}
                    rowKey="id"
                    pagination={false}
                    scroll={{ x: 1000 }}
                />
            </Modal>

            <Modal
                title={editingPrice ? 'Beszállítói ár szerkesztése' : 'Új beszállítói ár'}
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={() => form.submit()}
                width={700}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item name="material" hidden>
                        <NumInput />
                    </Form.Item>

                    <Form.Item
                        name="supplier"
                        label="Beszállító"
                        rules={[{ required: true, message: 'Válassz beszállítót' }]}
                    >
                        <Select placeholder="Válassz beszállítót">
                            {suppliers.map(supplier => (
                                <Option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item 
                        name="is_default" 
                        valuePropName="checked"
                    >
                        <Checkbox>Alapértelmezett beszállító</Checkbox>
                    </Form.Item>

                    <h4>Árkalkuláció komponensek</h4>

                    <Form.Item
                        name="fixed_cost"
                        label="Fix költség"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF"
                        />
                    </Form.Item>

                    <Form.Item
                        name="price_per_unit"
                        label="Darab alapú ár"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF/db"
                        />
                    </Form.Item>

                    <Form.Item
                        name="price_per_perimeter"
                        label="Kerület alapú ár"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF/m"
                        />
                    </Form.Item>

                    <Form.Item
                        name="price_per_area"
                        label="Terület alapú ár"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF/m²"
                        />
                    </Form.Item>

                    <Form.Item
                        name="price_per_weight"
                        label="Súly alapú ár"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF/kg"
                        />
                    </Form.Item>

                    <Form.Item
                        name="price_per_time"
                        label="Idő alapú ár"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF/óra"
                        />
                    </Form.Item>

                    <Form.Item
                        name="min_order_quantity"
                        label="Min. rendelési mennyiség"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                        />
                    </Form.Item>

                    <Form.Item
                        name="lead_time_days"
                        label="Szállítási idő (nap)"
                    >
                        <NumInput
                            style={{ width: '100%' }}
                            min={0}
                        />
                    </Form.Item>

                    <Form.Item name="is_active" valuePropName="checked">
                        <Checkbox>Aktív</Checkbox>
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default MaterialSupplierPrices;
