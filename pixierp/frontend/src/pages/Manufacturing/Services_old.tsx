import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Checkbox } from 'antd';
import NumInput from '../../components/NumInput';
import { PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined } from '@ant-design/icons';
import api from '../../services/api';
import ServiceCostCalculation from '../../components/ServiceCostCalculation';

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
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  currency: string;
  category: string;
  is_active: boolean;
  created_by_name: string;
  created_at: string;
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
}

interface Supplier {
  id: number;
  name: string;
}

interface Department {
  id: number;
  name: string;
}

const Services: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form] = Form.useForm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isInternalProduction, setIsInternalProduction] = useState(false);
  const [supplierPricesVisible, setSupplierPricesVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    fetchServices();
    fetchSuppliers();
    fetchDepartments();
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

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/crm/companies/?company_type=supplier');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setSuppliers(data);
    } catch (error) {
      console.error('Hiba a beszállítók betöltésekor:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/hr/departments/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setDepartments(data);
    } catch (error) {
      console.error('Hiba az osztályok betöltésekor:', error);
    }
  };

  const handleCreate = () => {
    setEditingService(null);
    form.resetFields();
    setIsInternalProduction(false);
    setModalVisible(true);
  };

  const handleEdit = (record: Service) => {
    setEditingService(record);
    form.setFieldsValue(record);
    setIsInternalProduction(record.is_internal_production || false);
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
      title: 'Bekerülési ár',
      dataIndex: 'unit_cost_price',
      key: 'unit_cost_price',
      width: 140,
      render: (price: number, record: Service) => `${(price || 0).toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Haszonkulcs',
      dataIndex: 'markup_percentage',
      key: 'markup_percentage',
      width: 120,
      render: (markup: number) => `${(Number(markup) || 0).toFixed(2)}%`,
    },
    {
      title: 'Eladási ár',
      dataIndex: 'unit_selling_price',
      key: 'unit_selling_price',
      width: 140,
      render: (price: number, record: Service) => `${(price || 0).toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Gyártás',
      dataIndex: 'is_internal_production',
      key: 'is_internal_production',
      width: 150,
      render: (isInternal: boolean, record: Service) => {
        if (isInternal) {
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
      render: (_: any, record: Service) => (
        <Space>
          <Button
            type="link"
            icon={<DollarOutlined />}
            onClick={() => {
              setSelectedService({ id: record.id, name: record.name });
              setSupplierPricesVisible(true);
            }}
            title="Beszállítói árak"
          />
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
            unit_cost_price: 0,
            markup_percentage: 35,
            unit_selling_price: 0,
            is_internal_production: false,
            internal_production_cost: 0,  // deprecated
            internal_fixed_cost: 0,
            internal_price_per_unit: 0,
            internal_price_per_perimeter: 0,
            internal_price_per_area: 0,
            internal_price_per_weight: 0,
            internal_price_per_time: 0,
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

          <div style={{ 
            marginTop: 16, 
            marginBottom: 16, 
            padding: '12px 16px', 
            background: '#f5f5f5', 
            borderRadius: 4,
            border: '1px solid #d9d9d9'
          }}>
            <strong>1 egységre vonatkozó tájékoztató ár:</strong>
            <div style={{ marginTop: 8, fontSize: '13px' }}>
              Bekerülési: {Number(form.getFieldValue('unit_cost_price') || 0).toLocaleString()} HUF
              {' | '}
              Haszon: {Number(form.getFieldValue('markup_percentage') || 0).toFixed(2)}%
              {' | '}
              Eladási: {Number(form.getFieldValue('unit_selling_price') || 0).toLocaleString()} HUF
            </div>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Részletes árkalkulációhoz használd az Árkalkuláció gombot ($) a táblázatban.
            </div>
          </div>

          <Form.Item name="unit_cost_price" hidden initialValue={0}>
            <NumInput />
          </Form.Item>
          
          <Form.Item name="markup_percentage" hidden initialValue={35}>
            <NumInput />
          </Form.Item>
          
          <Form.Item name="unit_selling_price" hidden initialValue={0}>
            <NumInput />
          </Form.Item>

          <Form.Item
            name="unit_price"
            label="Egységár (régi, kompatibilitás)"
            hidden
          >
            <NumInput style={{ width: '100%' }} />
          </Form.Item>

          <h4 style={{ marginTop: 16, marginBottom: 8 }}>Alapértelmezett forrás</h4>

          <Form.Item 
            name="is_internal_production" 
            label="Forrás típusa"
          >
            <Select 
              onChange={(value) => setIsInternalProduction(value)}
              placeholder="Válassz forrást"
            >
              <Option value={true}>Belső gyártás</Option>
              <Option value={false}>Külső beszállító</Option>
            </Select>
          </Form.Item>

          {isInternalProduction ? (
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
          ) : (
            <Form.Item 
              name="default_supplier" 
              label="Alapértelmezett beszállító"
              rules={[{ required: true, message: 'Válassz beszállítót' }]}
            >
              <Select placeholder="Válassz beszállítót" allowClear>
                {suppliers.map(supplier => (
                  <Option key={supplier.id} value={supplier.id}>{supplier.name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <div style={{ fontSize: '12px', color: '#666', marginBottom: 16 }}>
            Az árkalkulációt a táblázat $ gombjával kezelheted.
          </div>

          <Form.Item name="is_active" label="Státusz" valuePropName="checked">
            <Select>
              <Option value={true}>Aktív</Option>
              <Option value={false}>Inaktív</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {selectedService && (
        <ServiceCostCalculation
          visible={supplierPricesVisible}
          serviceId={selectedService.id}
          serviceName={selectedService.name}
          onClose={() => {
            setSupplierPricesVisible(false);
            setSelectedService(null);
          }}
        />
      )}
    </div>
  );
};

export default Services;
