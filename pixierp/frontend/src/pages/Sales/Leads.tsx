import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Spin, Alert, message, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';

const Leads: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [customers, setCustomers] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<any>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadCustomers();
    }, []);

    const loadCustomers = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await salesService.getCustomers();
            setCustomers(response.results || []);

        } catch (err) {
            console.error('Error loading customers:', err);
            setError('Hiba történt az ügyfelek betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCustomer = async (values: any) => {
        try {
            await salesService.createCustomer(values);
            message.success('Ügyfél létrehozva');
            setIsModalVisible(false);
            form.resetFields();
            loadCustomers();
        } catch (err) {
            message.error('Hiba történt az ügyfél létrehozása során');
        }
    };

    const handleUpdateCustomer = async (id: number, values: any) => {
        try {
            await salesService.updateCustomer(id, values);
            message.success('Ügyfél frissítve');
            setIsModalVisible(false);
            form.resetFields();
            loadCustomers();
        } catch (err) {
            message.error('Hiba történt az ügyfél frissítése során');
        }
    };

    const handleDeleteCustomer = async (id: number) => {
        try {
            await salesService.deleteCustomer(id);
            message.success('Ügyfél törölve');
            loadCustomers();
        } catch (err) {
            message.error('Hiba történt az ügyfél törlése során');
        }
    };

    const columns = [
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Cég',
            dataIndex: 'company',
            key: 'company',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Telefon',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Cím',
            dataIndex: 'address',
            key: 'address',
            ellipsis: true,
        },
        {
            title: 'Létrehozva',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string) => new Date(date).toLocaleDateString('hu-HU')
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (record: any) => (
                <Space size="small">
                    <Tooltip title="Megtekintés">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => {
                                // TODO: Implement view functionality
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Szerkesztés">
                        <Button
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => {
                                setEditingCustomer(record);
                                form.setFieldsValue(record);
                                setIsModalVisible(true);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Popconfirm
                            title="Biztosan törölni szeretné ezt az ügyfelet?"
                            onConfirm={() => handleDeleteCustomer(record.id)}
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

    if (loading) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <Spin size="large" />
                <p>Adatok betöltése...</p>
            </div>
        );
    }

    return (
        <div>
            <Card
                title="Ügyfelek"
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
                        Új ügyfél
                    </Button>
                }
            >
                {error && (
                    <Alert
                        message="Hiba"
                        description={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: '16px' }}
                    />
                )}

                <Table
                    columns={columns}
                    dataSource={customers}
                    pagination={{ pageSize: 10 }}
                    rowKey="id"
                />
            </Card>

            <Modal
                title={editingCustomer ? 'Ügyfél szerkesztése' : 'Új ügyfél'}
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                    setEditingCustomer(null);
                }}
                onOk={() => form.submit()}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={(values) => {
                        if (editingCustomer) {
                            handleUpdateCustomer(editingCustomer.id, values);
                        } else {
                            handleCreateCustomer(values);
                        }
                    }}
                >
                    <Form.Item
                        name="name"
                        label="Név"
                        rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="company"
                        label="Cég"
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg az email címet!' },
                            { type: 'email', message: 'Kérjük, adjon meg érvényes email címet!' }
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="phone"
                        label="Telefon"
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="address"
                        label="Cím"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Leads;
