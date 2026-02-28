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
  ExclamationCircleOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';

const { TextArea } = Input;

interface ServiceGroup {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  services_count?: number;
  created_at: string;
  created_by_name?: string;
  parent?: number | null;
  parent_name?: string;
  children?: ServiceGroup[];
}

const ServiceGroups: React.FC = () => {
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServiceGroup | null>(null);
  const [form] = Form.useForm();
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');

  const normalizeForCompare = (value: any): any => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(normalizeForCompare);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && typeof value?.format === 'function') return value.format('YYYY-MM-DDTHH:mm:ss');
    if (typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, key: string) => {
          const normalized = normalizeForCompare(value[key]);
          if (normalized !== undefined) acc[key] = normalized;
          return acc;
        }, {} as any);
    }
    return value;
  };

  const getFormSnapshot = () => JSON.stringify(normalizeForCompare(form.getFieldsValue(true)));
  const hasFormChanges = () => getFormSnapshot() !== initialFormSnapshot;

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (!isModalVisible) return;
    const timer = setTimeout(() => {
      setInitialFormSnapshot(getFormSnapshot());
    }, 0);
    return () => clearTimeout(timer);
  }, [isModalVisible]);

  const buildTree = (items: ServiceGroup[]): ServiceGroup[] => {
    const itemMap = new Map<number, ServiceGroup>();
    const roots: ServiceGroup[] = [];
    
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
    const cleanup = (nodes: ServiceGroup[]) => {
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
      const response = await api.get('/manufacturing/service-groups/');
      const rawData = response.data.results || response.data;
      const tree = buildTree(rawData);
      setGroups(tree);
    } catch (error) {
      message.error('Hiba a csoportok betöltésekor');
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

  const showEditModal = (group: ServiceGroup) => {
    setEditingGroup(group);
    form.setFieldsValue({
        ...group,
        parent: group.parent || undefined
    });
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    if (hasFormChanges()) {
      Modal.confirm({
        title: 'Biztos, hogy mentés nélkül be akarja zárni?',
        icon: <ExclamationCircleOutlined />,
        content: 'A módosítások elvesznek.',
        okText: 'Bezár',
        cancelText: 'Mégse',
        onOk: () => {
          setIsModalVisible(false);
          form.resetFields();
        },
      });
    } else {
      setIsModalVisible(false);
      form.resetFields();
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingGroup) {
        await api.put(`/manufacturing/service-groups/${editingGroup.id}/`, values);
        message.success('Csoport módosítva');
      } else {
        await api.post('/manufacturing/service-groups/', values);
        message.success('Csoport létrehozva');
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
      await api.delete(`/manufacturing/service-groups/${id}/`);
      message.success('Csoport törölve');
      loadGroups();
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 400) {
        message.error('Nem törölhető, mert szolgáltatások vagy alcsoportok tartoznak hozzá');
      } else {
        message.error('Hiba a törlés során');
      }
      console.error(error);
    }
  };

  // Convert groups tree to TreeSelect data
  const getTreeData = (nodes: ServiceGroup[], currentId?: number): any[] => {
    return nodes
      .filter(node => node.id !== currentId) // Exclude self
      .map(node => ({
        value: node.id,
        title: node.name,
        children: node.children ? getTreeData(node.children, currentId) : undefined,
        disabled: node.id === currentId
      }));
  };

  const columns: ColumnsType<ServiceGroup> = [
    {
      title: 'Csoport neve',
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
      title: 'Elemek',
      dataIndex: 'services_count',
      key: 'services_count',
      width: 120,
      render: (count: number) => (
        <Tag color={(count || 0) > 0 ? 'blue' : 'default'}>{count || 0} db</Tag>
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
      render: (_, record: ServiceGroup) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => showEditModal(record)}
          />
          <Popconfirm
            title="Biztosan törli ezt a csoportot?"
            description={
              ((record.services_count || 0) > 0 || (record.children && record.children.length > 0))
                ? 'Csak üres és gyermek nélküli kategória törölhető!'
                : undefined
            }
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
            disabled={(record.services_count || 0) > 0 || (record.children && record.children.length > 0)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={(record.services_count || 0) > 0 || (record.children && record.children.length > 0)}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Szolgáltatás csoportok"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={showCreateModal}
          >
            Új csoport
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
              defaultExpandAllRows: true,
          }}
        />
      </Card>

      <Modal
        title={editingGroup ? 'Csoport szerkesztése' : 'Új csoport'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="parent"
            label="Szülő csoport"
          >
             <TreeSelect
                allowClear
                placeholder="Válassz szülő csoportot (opcionális)"
                treeData={getTreeData(groups, editingGroup?.id)}
                switcherIcon={({ expanded }: any) => expanded ? <MinusOutlined /> : <PlusOutlined />}
             />
          </Form.Item>

          <Form.Item
            name="name"
            label="Csoport neve"
            rules={[
              { required: true, message: 'Kötelező mező' },
              { max: 100, message: 'Maximum 100 karakter' },
            ]}
          >
            <Input placeholder="pl. Nyomtatás" />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <TextArea
              rows={3}
              placeholder="Opcionális leírás a csoportról"
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

export default ServiceGroups;
