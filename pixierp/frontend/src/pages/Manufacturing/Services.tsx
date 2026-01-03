import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;

interface Service {
  id: number;
  name: string;
  code: string;
  description: string;
  unit: string;
  unit_display: string;
  calculation_basis: string;
  calculation_basis_display: string;
  unit_price: number;
  currency: string;
  category: string;
  is_active: boolean;
  created_by_name: string;
  created_at: string;
}

const Services: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await api.get('/manufacturing/services/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setServices(data);
    } catch (error) {
      message.error('Hiba a szolgáltatások betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingService(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Service) => {
    setEditingService(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/services/${id}/`);
      message.success('Szolgáltatás törölve');
      fetchServices();
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingService) {
        await api.put(`/manufacturing/services/${editingService.id}/`, values);
        message.success('Szolgáltatás módosítva');
      } else {
        await api.post('/manufacturing/services/', values);
        message.success('Szolgáltatás létrehozva');
      }
      setModalVisible(false);
      fetchServices();
    } catch (error) {
      message.error('Hiba a mentés során');
      console.error(error);
    }
  };

  const columns = [
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Service, b: Service) => a.name.localeCompare(b.name),
    },
    {
      title: 'Kód',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: 'Kategória',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      render: (category: string) => category ? <Tag color="blue">{category}</Tag> : '-',
    },
    {
      title: 'Mértékegység',
      dataIndex: 'unit_display',
      key: 'unit_display',
      width: 130,
    },
    {
      title: 'Kalkuláció alapja',
      dataIndex: 'calculation_basis_display',
      key: 'calculation_basis_display',
      width: 150,
    },
    {
      title: 'Egységár',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      render: (price: number, record: Service) => `${price.toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'red'}>
          {is_active ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: Service) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Biztosan törli?"
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
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>Szolgáltatások</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Új szolgáltatás
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={services}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingService ? 'Szolgáltatás szerkesztése' : 'Új szolgáltatás'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            currency: 'HUF',
            is_active: true,
            unit: 'db',
            calculation_basis: 'fixed',
          }}
        >
          <Form.Item
            name="name"
            label="Szolgáltatás neve"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="code"
            label="Kód"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="category" label="Kategória">
            <Input placeholder="pl. Nyomtatás, Utómunka, Szállítás" />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="unit"
            label="Mértékegység"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select>
              <Option value="db">darab</Option>
              <Option value="m">folyóméter</Option>
              <Option value="m2">négyzetméter</Option>
              <Option value="kg">kilogramm</Option>
              <Option value="hour">óra</Option>
              <Option value="perimeter">kerület (méter)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="calculation_basis"
            label="Kalkuláció alapja"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select>
              <Option value="fixed">Fix ár</Option>
              <Option value="area">Terület alapú</Option>
              <Option value="perimeter">Kerület alapú</Option>
              <Option value="length">Hossz alapú</Option>
              <Option value="weight">Súly alapú</Option>
              <Option value="quantity">Darabszám alapú</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="unit_price"
            label="Egységár (nettó)"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter="HUF"
            />
          </Form.Item>

          <Form.Item name="is_active" label="Státusz" valuePropName="checked">
            <Select>
              <Option value={true}>Aktív</Option>
              <Option value={false}>Inaktív</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Services;
