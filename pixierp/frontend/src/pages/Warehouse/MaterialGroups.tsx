import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Card,
  Popconfirm,
  Tag,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

const { TextArea } = Input;

interface MaterialGroup {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  materials_count: number;
  created_at: string;
  created_by_name?: string;
}

const API_URL = 'http://192.168.5.61:8003/api/v1/warehouse';

const MaterialGroups: React.FC = () => {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MaterialGroup | null>(null);
  const [form] = Form.useForm();

  const token = localStorage.getItem('access_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` },
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/material-groups/`, axiosConfig);
      setGroups(response.data.results || response.data);
    } catch (error) {
      message.error('Hiba a gyűjtők betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const showCreateModal = () => {
    setEditingGroup(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setIsModalVisible(true);
  };

  const showEditModal = (group: MaterialGroup) => {
    setEditingGroup(group);
    form.setFieldsValue(group);
    setIsModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingGroup) {
        await axios.put(`${API_URL}/material-groups/${editingGroup.id}/`, values, axiosConfig);
        message.success('Gyűjtő módosítva');
      } else {
        await axios.post(`${API_URL}/material-groups/`, values, axiosConfig);
        message.success('Gyűjtő létrehozva');
      }

      setIsModalVisible(false);
      form.resetFields();
      loadGroups();
    } catch (error: any) {
      if (error.response?.data?.name) {
        message.error('Ez a név már használatban van');
      } else {
        message.error('Hiba történt a mentés során');
      }
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/material-groups/${id}/`, axiosConfig);
      message.success('Gyűjtő törölve');
      loadGroups();
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 400) {
        message.error('Nem törölhető, mert alapanyagok tartoznak hozzá');
      } else {
        message.error('Hiba a törlés során');
      }
      console.error(error);
    }
  };

  const columns: ColumnsType<MaterialGroup> = [
    {
      title: 'Gyűjtő neve',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Alapanyagok',
      dataIndex: 'materials_count',
      key: 'materials_count',
      width: 120,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>{count} db</Tag>
      ),
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Létrehozta',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 150,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      render: (_, record: MaterialGroup) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => showEditModal(record)}
          />
          <Popconfirm
            title={
              record.materials_count > 0
                ? `${record.materials_count} alapanyag tartozik ehhez a gyűjtőhöz. Biztosan törli?`
                : 'Biztosan törli ezt a gyűjtőt?'
            }
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.materials_count > 0}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Alapanyag gyűjtők"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={showCreateModal}
          >
            Új gyűjtő
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editingGroup ? 'Gyűjtő szerkesztése' : 'Új gyűjtő'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Gyűjtő neve"
            rules={[
              { required: true, message: 'Kötelező mező' },
              { max: 100, message: 'Maximum 100 karakter' },
            ]}
          >
            <Input placeholder="pl. Épületháló" />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <TextArea
              rows={3}
              placeholder="Opcionális leírás a gyűjtőről"
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Aktív"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MaterialGroups;
