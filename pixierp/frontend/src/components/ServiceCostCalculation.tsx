import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Form, Input, InputNumber, Select, message, Space, Popconfirm, AutoComplete } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

const { Option } = Select;

interface CostItem {
    id?: number;
    service: number;
    supplier?: number;
    supplier_name?: string;
    is_internal: boolean;
    name: string;
    calculation_type: string;
    calculation_type_display?: string;
    unit: string;
    unit_price: number;
    markup_percentage: number;
    selling_price?: number;
    currency: string;
    is_active: boolean;
}

interface Supplier {
    id: number;
    name: string;
}

interface ServiceCostCalculationProps {
    visible: boolean;
    serviceId: number;
    serviceName: string;
    onClose: () => void;
}

const ServiceCostCalculation: React.FC<ServiceCostCalculationProps> = ({ 
    visible, 
    serviceId, 
    serviceName, 
    onClose 
}) => {
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filteredSuppliers, setFilteredSuppliers] = useState<{ value: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<CostItem | null>(null);
    const [selectedSource, setSelectedSource] = useState<'internal' | number | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible && serviceId) {
            fetchCostItems();
            fetchSuppliers();
        }
    }, [visible, serviceId, selectedSource]);

    const fetchCostItems = async () => {
        setLoading(true);
        try {
            let url = `/manufacturing/service-cost-items/?service_id=${serviceId}`;
            if (selectedSource === 'internal') {
                url += '&is_internal=true';
            } else if (selectedSource) {
                url += `&supplier_id=${selectedSource}`;
            }
            
            const response = await api.get(url);
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setCostItems(data);
        } catch (error) {
            message.error('Hiba a költség elemek betöltésekor');
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

    const handleSupplierSearch = (searchText: string) => {
        const filtered = suppliers
            .filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()))
            .map(s => ({ value: s.name }));
        setFilteredSuppliers(filtered);
    };

    const handleSupplierSelect = (value: string) => {
        const supplier = suppliers.find(s => s.name === value);
        if (supplier) {
            setSelectedSource(supplier.id);
        }
    };

    const handleSourceChange = (value: string) => {
        if (value === 'internal') {
            setSelectedSource('internal');
        } else {
            setSelectedSource(null);
        }
    };

    const handleCreate = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({
            service: serviceId,
            is_internal: selectedSource === 'internal',
            supplier: selectedSource !== 'internal' ? selectedSource : undefined,
            calculation_type: 'unit',
            currency: 'HUF',
            is_active: true,
            unit_price: 0,
            markup_percentage: 35,
        });
        setEditModalVisible(true);
    };

    const handleEdit = (record: CostItem) => {
        setEditingItem(record);
        form.setFieldsValue(record);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/manufacturing/service-cost-items/${id}/`);
            message.success('Költség elem törölve');
            fetchCostItems();
        } catch (error) {
            message.error('Hiba a törlés során');
            console.error(error);
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingItem) {
                await api.patch(`/manufacturing/service-cost-items/${editingItem.id}/`, values);
                message.success('Költség elem frissítve');
            } else {
                await api.post('/manufacturing/service-cost-items/', values);
                message.success('Költség elem létrehozva');
            }
            setEditModalVisible(false);
            fetchCostItems();
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Hiba a mentés során');
            console.error(error);
        }
    };

    const getTotalCost = () => {
        return costItems.reduce((sum, item) => sum + Number(item.unit_price || 0), 0);
    };

    const getTotalSelling = () => {
        return costItems.reduce((sum, item) => sum + Number(item.selling_price || 0), 0);
    };

    const getAverageMarkup = () => {
        const total = getTotalCost();
        if (total === 0) return 0;
        const totalSelling = getTotalSelling();
        return ((totalSelling - total) / total * 100).toFixed(2);
    };

    const columns = [
        {
            title: 'Megnevezés',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Típus',
            dataIndex: 'calculation_type_display',
            key: 'calculation_type_display',
        },
        {
            title: 'Egység',
            dataIndex: 'unit',
            key: 'unit',
        },
        {
            title: 'Egységár',
            dataIndex: 'unit_price',
            key: 'unit_price',
            render: (value: number) => `${Number(value).toLocaleString()} HUF`,
        },
        {
            title: 'Haszon (%)',
            dataIndex: 'markup_percentage',
            key: 'markup_percentage',
            render: (value: number) => `${Number(value).toFixed(2)}%`,
        },
        {
            title: 'Eladási ár',
            dataIndex: 'selling_price',
            key: 'selling_price',
            render: (value: number) => `${Number(value).toLocaleString()} HUF`,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (_: any, record: CostItem) => (
                <Space>
                    <Button 
                        type="link" 
                        icon={<EditOutlined />} 
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title="Biztosan törlöd?"
                        onConfirm={() => handleDelete(record.id!)}
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
                title={`Árkalkuláció - ${serviceName}`}
                open={visible}
                onCancel={onClose}
                width={1200}
                footer={[
                    <Button key="close" onClick={onClose}>
                        Bezárás
                    </Button>
                ]}
            >
                <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <Select
                            style={{ width: 200 }}
                            placeholder="Válassz forrást"
                            onChange={handleSourceChange}
                            value={selectedSource === 'internal' ? 'internal' : undefined}
                        >
                            <Option value="internal">Belső gyártás</Option>
                        </Select>
                        
                        <AutoComplete
                            style={{ width: 300 }}
                            options={filteredSuppliers}
                            onSearch={handleSupplierSearch}
                            onSelect={handleSupplierSelect}
                            placeholder="Vagy keress beszállítót..."
                        />
                        
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={handleCreate}
                            disabled={!selectedSource}
                        >
                            Új költség elem
                        </Button>
                    </div>
                    
                    {selectedSource && (
                        <div style={{ padding: '8px 16px', background: '#f0f0f0', borderRadius: 4 }}>
                            <strong>1 egységre vonatkozó összesítés:</strong> 
                            {' '}Bekerülési: {getTotalCost().toLocaleString()} HUF
                            {' | '}Haszon: {getAverageMarkup()}%
                            {' | '}Eladási: {getTotalSelling().toLocaleString()} HUF
                        </div>
                    )}
                </Space>
                
                <Table
                    columns={columns}
                    dataSource={costItems}
                    loading={loading}
                    rowKey="id"
                    pagination={false}
                    scroll={{ x: 1000 }}
                />
            </Modal>

            <Modal
                title={editingItem ? 'Költség elem szerkesztése' : 'Új költség elem'}
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={() => form.submit()}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item name="service" hidden>
                        <InputNumber />
                    </Form.Item>

                    <Form.Item name="supplier" hidden>
                        <InputNumber />
                    </Form.Item>

                    <Form.Item name="is_internal" hidden>
                        <InputNumber />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Megnevezés"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Input placeholder="pl. Anyagköltség, Munkadíj" />
                    </Form.Item>

                    <Form.Item
                        name="calculation_type"
                        label="Számítás típusa"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Select>
                            <Option value="fixed">Fix költség</Option>
                            <Option value="unit">Darab alapú</Option>
                            <Option value="length">Folyóméter</Option>
                            <Option value="perimeter">Kerület</Option>
                            <Option value="area">Terület</Option>
                            <Option value="weight">Súly</Option>
                            <Option value="time">Idő</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="unit"
                        label="Egység"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Input placeholder="db, kg, m, m², óra" />
                    </Form.Item>

                    <Form.Item
                        name="unit_price"
                        label="Egységár (bekerülési)"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                            addonAfter="HUF"
                        />
                    </Form.Item>

                    <Form.Item
                        name="markup_percentage"
                        label="Haszon kulcs"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            max={100}
                            precision={2}
                            addonAfter="%"
                        />
                    </Form.Item>

                    <Form.Item name="is_active" hidden initialValue={true}>
                        <Input />
                    </Form.Item>

                    <Form.Item name="currency" hidden initialValue="HUF">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default ServiceCostCalculation;
