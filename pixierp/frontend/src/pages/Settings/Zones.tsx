import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Popconfirm, Card, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, RetweetOutlined } from '@ant-design/icons';
import api from '../../services/api';

interface Zone {
  id: number;
  name: string;
  zone_number: string;
  note: string;
  department_ids: number[];
  departments_details: { id: number; name: string }[];
}

interface Department {
  id: number;
  name: string;
}

const Zones: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Zone[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState<number | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/zones/');
            const zones = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setData(zones);
        } catch (error) {
            message.error('Hiba zónák betöltésekor');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await api.get('/hr/departments/');
            const depts = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setDepartments(depts);
        } catch (error) {
            console.error('Failed to load departments');
            setDepartments([]);
        }
    };


    useEffect(() => {
        fetchData();
        fetchDepartments();
    }, []);

    const handleCreate = () => {
        setEditingId(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: Zone) => {
        setEditingId(record.id);
        form.setFieldsValue({
            name: record.name,
            zone_number: record.zone_number,
            note: record.note,
            departments: record.department_ids
        });
        setIsModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/zones/${id}/`);
            message.success('Zóna törölve');
            fetchData();
        } catch (error) {
             message.error('Hiba törléskor');
        }
    };

    const handleGenerateNumber = async () => {
        try {
            const res = await api.get('/zones/next_number/');
            form.setFieldsValue({ zone_number: res.data.next_number });
        } catch (error) {
            message.error('Hiba a generáláskor');
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = {
                ...values,
                department_ids: values.departments // Map 'departments' form field to 'department_ids' API field
            };

            if (editingId) {
                await api.patch(`/zones/${editingId}/`, payload);
                message.success('Zóna frissítve');
            } else {
                await api.post('/zones/', payload);
                message.success('Zóna létrehozva');
            }
            setIsModalVisible(false);
            fetchData();
        } catch (error) {
             message.error('Mentés sikertelen');
        }
    };

    const columns = [
        {
            title: 'Zóna szám',
            dataIndex: 'zone_number',
            key: 'zone_number',
            width: 120,
        },
        {
            title: 'Zóna neve',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            render: (text: string) => <strong>{text}</strong>
        },
        {
            title: 'Megjegyzés',
            dataIndex: 'note',
            key: 'note',
        },
        {
            title: 'Osztály',
            dataIndex: 'departments_details',
            key: 'departments',
            render: (depts: { name: string }[]) => (
                <Space wrap>
                    {(depts || []).map(d => <span key={d.name} style={{background: '#f0f0f0', padding: '2px 8px', borderRadius: 4}}>{d.name}</span>)}
                </Space>
            )
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 150,
            render: (_: any, record: Zone) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
                    <Popconfirm title="Biztosan törli?" onConfirm={() => handleDelete(record.id)}>
                         <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <Card 
                title={<span style={{fontSize: 20}}>Zónák kezelése</span>} 
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Új Zóna</Button>}
            >
                <Table 
                    columns={columns} 
                    dataSource={data} 
                    rowKey="id" 
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            <Modal
                title={editingId ? "Zóna szerkesztése" : "Új Zóna"}
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező mező' }]}>
                        <Input placeholder="Pl. Raktár A" />
                    </Form.Item>
                    
                    <Form.Item label="Zóna szám" required>
                        <Space.Compact style={{ width: '100%' }}>
                            <Form.Item
                                name="zone_number"
                                noStyle
                                rules={[{ required: true, message: 'Kötelező mező' }]}
                            >
                                <Input placeholder="Pl. Z001" />
                            </Form.Item>
                            <Button icon={<RetweetOutlined />} onClick={handleGenerateNumber}>Generál</Button>
                        </Space.Compact>
                    </Form.Item>

                    <Form.Item name="departments" label="Osztályok">
                        <Select 
                            mode="multiple" 
                            placeholder="Válasszon osztályokat"
                            optionFilterProp="children"
                        >
                            {(departments || []).map(d => (
                                <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="note" label="Megjegyzés">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Zones;
