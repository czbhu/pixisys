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
  TreeSelect,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';

const { TextArea } = Input;

interface MaterialGroup {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  materials_count: number;
  created_at: string;
  created_by_name?: string;
  parent?: number | null;
  parent_name?: string;
  children?: MaterialGroup[];
}



const MaterialGroups: React.FC = () => {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MaterialGroup | null>(null);
  const [form] = Form.useForm();



  useEffect(() => {
    loadGroups();
  }, []);

  const buildTree = (items: MaterialGroup[]): MaterialGroup[] => {
    const itemMap = new Map<number, MaterialGroup>();
    const roots: MaterialGroup[] = [];
    
    // Deep clone to avoid mutating
    const clonedItems = items.map(item => ({ ...item, children: [] }));
    
    clonedItems.forEach(item => {
      itemMap.set(item.id, item);
    });
    
    clonedItems.forEach(item => {
      if (item.parent) {
        const parent = itemMap.get(item.parent);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(item);
        } else {
          roots.push(item);
        }
      } else {
        roots.push(item);
      }
    });

    // Cleanup empty children arrays
    const cleanup = (nodes: MaterialGroup[]) => {
        nodes.forEach(node => {
            if (node.children && node.children.length === 0) {
                delete node.children;
            } else if (node.children) {
                cleanup(node.children);
            }
        })
    };
    cleanup(roots);
    
    return roots;
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await api.get('/warehouse/material-groups/');
      const rawData = response.data.results || response.data;
      const tree = buildTree(rawData);
      setGroups(tree);
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
    form.setFieldsValue({
        ...group,
        parent: group.parent || undefined // ensure null becomes undefined for placeholder
    });
    setIsModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingGroup) {
        await api.put(`/warehouse/material-groups/${editingGroup.id}/`, values);
        message.success('Gyűjtő módosítva');
      } else {
        await api.post('/warehouse/material-groups/', values);
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
      await api.delete(`/warehouse/material-groups/${id}/`);
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

  // Convert groups tree to TreeSelect data
  const getTreeData = (nodes: MaterialGroup[], currentId?: number): any[] => {
    return nodes
      .filter(node => node.id !== currentId) // Exclude self
      .map(node => ({
        value: node.id,
        title: node.name,
        children: node.children ? getTreeData(node.children, currentId) : undefined,
        disabled: node.id === currentId
      }));
  };

  const columns: ColumnsType<MaterialGroup> = [
    {
      title: 'Gyűjtő neve',
      dataIndex: 'name',
      key: 'name',
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
              (record.materials_count > 0 || (record.children && record.children.length > 0))
                ? 'Csak üres és gyermek nélküli kategória törölhető!'
                : 'Biztosan törli ezt a gyűjtőt?'
            }
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
            disabled={record.materials_count > 0 || (record.children && record.children.length > 0)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.materials_count > 0 || (record.children && record.children.length > 0)}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Alapanyag kategóriák"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={showCreateModal}
          >
            Új kategória
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          pagination={false}
          expandable={{
              defaultExpandAllRows: true, // Optional: expand all by default
          }}
        />
      </Card>

      <Modal
        title={editingGroup ? 'Kategória szerkesztése' : 'Új kategória'}
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
            name="parent"
            label="Szülő kategória"
          >
             <TreeSelect
                allowClear
                placeholder="Válassz szülő kategóriát (opcionális)"
                treeData={getTreeData(groups, editingGroup?.id)}
                treeDefaultExpandAll
             />
          </Form.Item>

          <Form.Item
            name="name"
            label="Kategória neve"
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
