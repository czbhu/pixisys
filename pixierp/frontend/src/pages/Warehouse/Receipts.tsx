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
    DatePicker,
    InputNumber,
} from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    CheckOutlined,
    CloseOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';
import { crmService } from '../../services/crmService';

const { Option } = Select;

interface Receipt {
    id: number;
    receipt_number: string;
    material_name: string;
    material_code: string;
    supplier_name: string;
    warehouse_name: string;
    shelf_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    currency: string;
    status: string;
    receipt_date: string;
    notes: string;
}

const Receipts: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [shelves, setShelves] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [viewingReceipt, setViewingReceipt] = useState<Receipt | null>(null);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadReceipts();
        loadMaterials();
        loadSuppliers();
        loadWarehouses();
    }, []);

    const loadReceipts = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (statusFilter) params.status = statusFilter;
            
            const response = await warehouseService.getReceipts(params);
            setReceipts(response.results || response);
        } catch (error) {
            console.error('Error loading receipts:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMaterials = async () => {
        try {
            const response = await warehouseService.getMaterials();
            setMaterials(response.results || response);
        } catch (error) {
            console.error('Error loading materials:', error);
        }
    };

    const loadSuppliers = async () => {
        try {
            const response = await crmService.getCompanies();
            const supplierCompanies = (response.results || response).filter((company: any) => company.company_type === 'supplier');
            setSuppliers(supplierCompanies);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    };

    const loadWarehouses = async () => {
        try {
            const response = await warehouseService.getWarehouses();
            setWarehouses(response.results || response);
        } catch (error) {
            console.error('Error loading warehouses:', error);
        }
    };

    const loadShelves = async (warehouseId: number) => {
        try {
            const response = await warehouseService.getShelves({ warehouse: warehouseId });
            setShelves(response.results || response);
        } catch (error) {
            console.error('Error loading shelves:', error);
        }
    };

    useEffect(() => {
        loadReceipts();
    }, [statusFilter]);

    const showCreateModal = () => {
        form.resetFields();
        setIsModalVisible(true);
    };

    const showViewModal = (receipt: Receipt) => {
        setViewingReceipt(receipt);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            await warehouseService.createReceipt(values);
            message.success('Bevételezés sikeresen létrehozva!');
            setIsModalVisible(false);
            form.resetFields();
            loadReceipts();
        } catch (error) {
            console.error('Error creating receipt:', error);
            message.error('Hiba történt a bevételezés létrehozása során');
        }
    };

    const handleConfirmReceipt = async (id: number) => {
        try {
            await warehouseService.confirmReceipt(id);
            message.success('Bevételezés sikeresen megerősítve!');
            loadReceipts();
        } catch (error) {
            console.error('Error confirming receipt:', error);
            message.error('Hiba történt a bevételezés megerősítése során');
        }
    };

    const handleCancelReceipt = async (id: number) => {
        try {
            await warehouseService.cancelReceipt(id);
            message.success('Bevételezés sikeresen törölve!');
            loadReceipts();
        } catch (error) {
            console.error('Error cancelling receipt:', error);
            message.error('Hiba történt a bevételezés törlése során');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'orange';
            case 'received': return 'green';
            case 'cancelled': return 'red';
            default: return 'default';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return 'Függőben';
            case 'received': return 'Bevételezve';
            case 'cancelled': return 'Törölve';
            default: return status;
        }
    };

    const columns = [
        {
            title: 'Bevételezési szám',
            dataIndex: 'receipt_number',
            key: 'receipt_number',
        },
        {
            title: 'Alapanyag',
            key: 'material',
            render: (record: Receipt) => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>{record.material_name}</div>
                    <div style={{ color: '#666', fontSize: '12px' }}>{record.material_code}</div>
                </div>
            ),
        },
        {
            title: 'Beszállító',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
        },
        {
            title: 'Helyszín',
            key: 'location',
            render: (record: Receipt) => (
                <div>
                    <div>{record.warehouse_name}</div>
                    <div style={{ color: '#666', fontSize: '12px' }}>{record.shelf_name}</div>
                </div>
            ),
        },
        {
            title: 'Mennyiség',
            key: 'quantity',
            render: (record: Receipt) => `${record.quantity} db`,
        },
        {
            title: 'Összes ár',
            key: 'total_price',
            render: (record: Receipt) => `${record.total_price.toLocaleString()} ${record.currency}`,
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={getStatusColor(status)}>
                    {getStatusText(status)}
                </Tag>
            ),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (record: Receipt) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => showViewModal(record)}
                    />
                    {record.status === 'pending' && (
                        <>
                            <Button
                                type="link"
                                icon={<CheckOutlined />}
                                onClick={() => handleConfirmReceipt(record.id)}
                            />
                            <Button
                                type="link"
                                danger
                                icon={<CloseOutlined />}
                                onClick={() => handleCancelReceipt(record.id)}
                            />
                        </>
                    )}
                </Space>
            ),
        },
    ];

    const filteredReceipts = receipts.filter(receipt =>
        receipt.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        receipt.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        receipt.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            <Card
                title="Bevételezések"
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
                            placeholder="Státusz szűrő"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            style={{ width: 150 }}
                            allowClear
                        >
                            <Option value="pending">Függőben</Option>
                            <Option value="received">Bevételezve</Option>
                            <Option value="cancelled">Törölve</Option>
                        </Select>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={showCreateModal}
                        >
                            Új bevételezés
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={filteredReceipts}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            {/* Létrehozás Modal */}
            <Modal
                title="Új bevételezés"
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={800}
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
                                    {suppliers.map(supplier => (
                                        <Option key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="warehouse"
                                label="Raktár"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a raktárat!' }]}
                            >
                                <Select
                                    placeholder="Válasszon raktárat"
                                    onChange={(value) => loadShelves(value)}
                                >
                                    {warehouses.map(warehouse => (
                                        <Option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="shelf"
                                label="Polc"
                                rules={[{ required: true, message: 'Kérjük, válassza ki a polcot!' }]}
                            >
                                <Select placeholder="Válasszon polcot">
                                    {shelves.map(shelf => (
                                        <Option key={shelf.id} value={shelf.id}>
                                            {shelf.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="receipt_date"
                                label="Bevételezés dátuma"
                                rules={[{ required: true, message: 'Kérjük, adja meg a dátumot!' }]}
                            >
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="quantity"
                                label="Mennyiség"
                                rules={[{ required: true, message: 'Kérjük, adja meg a mennyiséget!' }]}
                            >
                                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="unit_price"
                                label="Egységár"
                                rules={[{ required: true, message: 'Kérjük, adja meg az egységárat!' }]}
                            >
                                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="currency"
                                label="Pénznem"
                                initialValue="HUF"
                            >
                                <Select>
                                    <Option value="HUF">HUF</Option>
                                    <Option value="EUR">EUR</Option>
                                    <Option value="USD">USD</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="notes"
                        label="Megjegyzések"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalVisible(false)}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                Létrehozás
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Bevételezés részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
            >
                {viewingReceipt && (
                    <div>
                        <p><strong>Bevételezési szám:</strong> {viewingReceipt.receipt_number}</p>
                        <p><strong>Alapanyag:</strong> {viewingReceipt.material_name} ({viewingReceipt.material_code})</p>
                        <p><strong>Beszállító:</strong> {viewingReceipt.supplier_name}</p>
                        <p><strong>Helyszín:</strong> {viewingReceipt.warehouse_name} - {viewingReceipt.shelf_name}</p>
                        <p><strong>Mennyiség:</strong> {viewingReceipt.quantity} db</p>
                        <p><strong>Egységár:</strong> {viewingReceipt.unit_price.toLocaleString()} {viewingReceipt.currency}</p>
                        <p><strong>Összes ár:</strong> {viewingReceipt.total_price.toLocaleString()} {viewingReceipt.currency}</p>
                        <p><strong>Státusz:</strong> <Tag color={getStatusColor(viewingReceipt.status)}>{getStatusText(viewingReceipt.status)}</Tag></p>
                        <p><strong>Bevételezés dátuma:</strong> {new Date(viewingReceipt.receipt_date).toLocaleDateString('hu-HU')}</p>
                        {viewingReceipt.notes && <p><strong>Megjegyzések:</strong> {viewingReceipt.notes}</p>}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Receipts;
