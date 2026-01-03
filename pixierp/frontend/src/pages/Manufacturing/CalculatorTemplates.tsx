import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Transfer } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

interface Material {
  id: number;
  name: string;
  code: string;
}

interface Service {
  id: number;
  name: string;
  code: string;
}

interface CalculatorTemplate {
  id: number;
  name: string;
  code: string;
  description: string;
  default_markup_percentage: number;
  is_active: boolean;
  allowed_materials: number[];
  allowed_services: number[];
  allowed_materials_details: any[];
  allowed_services_details: any[];
  input_fields: any[];
  created_by_name: string;
}

const CalculatorTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<CalculatorTemplate[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CalculatorTemplate | null>(null);
  const [form] = Form.useForm();

  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);

  useEffect(() => {
    fetchTemplates();
    fetchMaterials();
    fetchServices();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/v1/manufacturing/calculator-templates/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setTemplates(data);
    } catch (error) {
      message.error('Hiba a sablonok betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await api.get('/warehouse/materials/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setMaterials(data);
    } catch (error) {
      console.error('Hiba az alapanyagok betöltésekor', error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await api.get('/api/v1/manufacturing/services/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setServices(data);
    } catch (error) {
      console.error('Hiba a szolgáltatások betöltésekor', error);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setSelectedMaterials([]);
    setSelectedServices([]);
    setModalVisible(true);
  };

  const handleEdit = (record: CalculatorTemplate) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      ...record,
      allowed_materials: record.allowed_materials || [],
      allowed_services: record.allowed_services || [],
    });
    setSelectedMaterials(record.allowed_materials || []);
    setSelectedServices(record.allowed_services || []);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/calculator-templates/${id}/`);
      message.success('Sablon törölve');
      fetchTemplates();
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        allowed_materials: selectedMaterials,
        allowed_services: selectedServices,
        input_fields: values.input_fields || [],
      };

      if (editingTemplate) {
        await api.put(`/api/v1/manufacturing/calculator-templates/${editingTemplate.id}/`, payload);
        message.success('Sablon módosítva');
      } else {
        await api.post('/api/v1/manufacturing/calculator-templates/', payload);
        message.success('Sablon létrehozva');
      }
      setModalVisible(false);
      fetchTemplates();
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
      sorter: (a: CalculatorTemplate, b: CalculatorTemplate) => a.name.localeCompare(b.name),
    },
    {
      title: 'Kód',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: 'Alapanyagok',
      key: 'materials',
      width: 100,
      render: (_: any, record: CalculatorTemplate) => (
        <Tag color="blue">{record.allowed_materials_details?.length || 0} db</Tag>
      ),
    },
    {
      title: 'Szolgáltatások',
      key: 'services',
      width: 120,
      render: (_: any, record: CalculatorTemplate) => (
        <Tag color="green">{record.allowed_services_details?.length || 0} db</Tag>
      ),
    },
    {
      title: 'Haszonkulcs',
      dataIndex: 'default_markup_percentage',
      key: 'default_markup_percentage',
      width: 120,
      render: (value: number) => `${value}%`,
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
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: CalculatorTemplate) => (
        <Space>
          <Button
            type="link"
            icon={<CalculatorOutlined />}
            onClick={() => window.location.href = `/manufacturing/calculator/${record.id}`}
          >
            Használ
          </Button>
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
        <h2>Kalkulátor sablonok</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Új sablon
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingTemplate ? 'Sablon szerkesztése' : 'Új sablon'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={900}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            is_active: true,
            default_markup_percentage: 30,
          }}
        >
          <Form.Item
            name="name"
            label="Sablon neve"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. Molinó nyomtatás" />
          </Form.Item>

          <Form.Item
            name="code"
            label="Kód"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. MOLINO_PRINT" />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="default_markup_percentage"
            label="Alapértelmezett haszonkulcs (%)"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={1000}
              precision={2}
              addonAfter="%"
            />
          </Form.Item>

          <Form.Item label="Engedélyezett alapanyagok">
            <Transfer
              dataSource={materials.map(m => ({ key: m.id, title: `${m.name} (${m.code})` }))}
              titles={['Elérhető', 'Kiválasztott']}
              targetKeys={selectedMaterials.map(String)}
              onChange={(targetKeys) => setSelectedMaterials(targetKeys.map(Number))}
              render={item => item.title}
              listStyle={{ width: 400, height: 300 }}
            />
          </Form.Item>

          <Form.Item label="Engedélyezett szolgáltatások">
            <Transfer
              dataSource={services.map(s => ({ key: s.id, title: `${s.name} (${s.code})` }))}
              titles={['Elérhető', 'Kiválasztott']}
              targetKeys={selectedServices.map(String)}
              onChange={(targetKeys) => setSelectedServices(targetKeys.map(Number))}
              render={item => item.title}
              listStyle={{ width: 400, height: 300 }}
            />
          </Form.Item>

          <Form.Item name="is_active" label="Státusz">
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

export default CalculatorTemplates;
