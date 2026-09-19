import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Tag, TreeSelect, message } from 'antd';
import EnhancedTable from '../../components/EnhancedTable';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { deepSearchMatch } from '../../utils/searchUtils';

const { SHOW_PARENT } = TreeSelect;

interface CashRegisterOption {
  id: number;
  name: string;
  location?: string;
}

interface MaterialGroupOption {
  id: number;
  name: string;
  parent: number | null;
}

// Recursively builds antd TreeSelect data (parent nodes contain their subcategories as children)
const buildGroupTree = (groups: MaterialGroupOption[], parentId: number | null = null): any[] =>
  groups
    .filter(g => (g.parent ?? null) === parentId)
    .map(g => ({
      title: g.name,
      value: g.id,
      key: g.id,
      children: buildGroupTree(groups, g.id),
    }));

// Selecting a parent category must include all of its subcategories too
const collectGroupIdsWithDescendants = (id: number, groups: MaterialGroupOption[]): number[] => {
  const children = groups.filter(g => g.parent === id);
  return [id, ...children.flatMap(c => collectGroupIdsWithDescendants(c.id, groups))];
};

interface EmployeeOption {
  id: number;
  full_name?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_username?: string;
}

interface WarehouseOption {
  id: number;
  name: string;
}

interface POSTerminal {
  id: number;
  name: string;
  location: string;
  hepg: string;
  cash_register: number | null;
  cash_register_name?: string;
  show_all_categories: boolean;
  material_group_ids: number[];
  material_group_names: string[];
  warehouse_ids: number[];
  warehouse_names: string[];
  authorized_employee_ids: number[];
  authorized_employee_names: string[];
  is_active: boolean;
}

const Registration: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<POSTerminal | null>(null);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterOption[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroupOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [terminalsRes, cashRes, groupRes, warehouseRes, employeeRes] = await Promise.all([
        api.get('/pos/terminals/'),
        api.get('/finance/cash-registers/', { params: { is_active: true } }),
        api.get('/warehouse/material-groups/', { params: { is_active: true, page_size: 5000 } }),
        api.get('/warehouse/warehouses/', { params: { is_active: true, page_size: 5000 } }),
        api.get('/hr/employees/', { params: { page_size: 5000 } }),
      ]);

      const terminalData = terminalsRes.data?.results || terminalsRes.data || [];
      const cashData = cashRes.data?.results || cashRes.data || [];
      const groupData = groupRes.data?.results || groupRes.data || [];
      const warehouseData = warehouseRes.data?.results || warehouseRes.data || [];
      const employeeData = employeeRes.data?.results || employeeRes.data || [];

      setTerminals(Array.isArray(terminalData) ? terminalData : []);
      setCashRegisters(Array.isArray(cashData) ? cashData : []);
      setMaterialGroups(Array.isArray(groupData) ? groupData : []);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
    } catch {
      message.error('Nem sikerült betölteni a POS regisztráció adatait');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      show_all_categories: true,
      material_group_ids: [],
      warehouse_ids: [],
      authorized_employee_ids: [],
    });
    setModalOpen(true);
  };

  const openEdit = (row: POSTerminal) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      location: row.location,
      hepg: row.hepg,
      cash_register: row.cash_register,
      show_all_categories: row.show_all_categories,
      material_group_ids: row.material_group_ids || [],
      warehouse_ids: row.warehouse_ids || [],
      authorized_employee_ids: row.authorized_employee_ids || [],
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      // Expand each selected category to include all of its subcategories
      const expandedGroupIds = Array.from(new Set(
        ((values.material_group_ids || []) as number[]).flatMap((id: number) =>
          collectGroupIdsWithDescendants(id, materialGroups))
      ));
      const payload = {
        ...values,
        material_group_ids: values.show_all_categories ? [] : expandedGroupIds,
        warehouse_ids: values.warehouse_ids || [],
      };

      if (editing) {
        await api.put(`/pos/terminals/${editing.id}/`, payload);
        message.success('POS sikeresen módosítva');
      } else {
        await api.post('/pos/terminals/', payload);
        message.success('POS sikeresen létrehozva');
      }

      setModalOpen(false);
      form.resetFields();
      fetchAll();
    } catch {
      message.error('Hiba történt a mentés során');
    }
  };

  const columns: ColumnsType<POSTerminal> = [
    { title: 'POS név', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Helye', dataIndex: 'location', key: 'location', sorter: (a, b) => (a.location || '').localeCompare(b.location || '') },
    { title: 'HePG', dataIndex: 'hepg', key: 'hepg', sorter: (a, b) => (a.hepg || '').localeCompare(b.hepg || '') },
    {
      title: 'Kassza',
      dataIndex: 'cash_register_name',
      key: 'cash_register_name',
      sorter: (a, b) => (a.cash_register_name || '').localeCompare(b.cash_register_name || ''),
      render: (value?: string) => value || '-',
    },
    {
      title: 'Termék kategóriák',
      key: 'material_group_names',
      render: (_: any, row) =>
        row.show_all_categories
          ? 'Összes'
          : (row.material_group_names || []).length
            ? row.material_group_names.join(', ')
            : '-',
    },
    {
      title: 'Raktárak',
      key: 'warehouse_names',
      render: (_: any, row) =>
        (row.warehouse_names || []).length
          ? row.warehouse_names.join(', ')
          : 'Összes',
    },
    {
      title: 'Jogosultak',
      key: 'authorized_employee_names',
      render: (_: any, row) => {
        const names = row.authorized_employee_names || [];
        if (!names.length) return '-';
        return (
          <Space size={[4, 4]} wrap>
            {names.slice(0, 4).map((name) => (
              <Tag key={name}>{name}</Tag>
            ))}
            {names.length > 4 ? <Tag>+{names.length - 4}</Tag> : null}
          </Space>
        );
      },
    },
    {
      title: 'Művelet',
      key: 'actions',
      render: (_: any, row) => (
        <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(row)}>
          Szerkesztés
        </Button>
      ),
    },
  ];

  const showAllCategories = Form.useWatch('show_all_categories', form);
  const filteredTerminals = terminals.filter(t => deepSearchMatch(searchText, t));

  return (
    <Card title="POS regisztráció">
      <EnhancedTable
        tableKey="posRegistration"
        rowKey="id"
        loading={loading}
        dataSource={filteredTerminals}
        columns={columns as any}
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Keresés..."
        toolbarExtra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Új POS
          </Button>
        }
        pagination={{ pageSize: 10 }}
        cardBreakpoint={500}
      />

      <Modal
        title={editing ? 'POS szerkesztése' : 'Új POS'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Mentés"
        cancelText="Mégse"
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="POS név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="location" label="Helye">
            <Input />
          </Form.Item>

          <Form.Item name="hepg" label="HePG">
            <Input />
          </Form.Item>

          <Form.Item name="cash_register" label="Kassza">
            <Select allowClear placeholder="Válassz kasszát">
              {cashRegisters.map((cash) => (
                <Select.Option key={cash.id} value={cash.id}>
                  {cash.name}{cash.location ? ` (${cash.location})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="show_all_categories" label="Termék kategóriák" valuePropName="checked">
            <Switch checkedChildren="Összes" unCheckedChildren="Kiválasztott" />
          </Form.Item>

          {!showAllCategories && (
            <Form.Item name="material_group_ids" label="Kategóriák kiválasztása">
              <TreeSelect
                treeData={buildGroupTree(materialGroups)}
                treeCheckable
                showCheckedStrategy={SHOW_PARENT}
                treeDefaultExpandAll
                placeholder="Válassz kategóriákat"
                allowClear
              />
            </Form.Item>
          )}

          <Form.Item
            name="warehouse_ids"
            label="Raktárak"
            help="Ha üres, minden raktárban lévő termék megjelenik. Ha meg van adva, csak a kiválasztott raktár(ak)ban lévő készlettel rendelkező termékek jelennek meg."
          >
            <Select mode="multiple" allowClear placeholder="Válassz raktárakat (üresen: összes)">
              {warehouses.map((wh) => (
                <Select.Option key={wh.id} value={wh.id}>
                  {wh.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="authorized_employee_ids" label="Jogosultak">
            <Select mode="multiple" placeholder="Válassz alkalmazottakat">
              {employees.map((employee) => {
                const fullName = employee.full_name || `${employee.user_first_name || ''} ${employee.user_last_name || ''}`.trim() || employee.user_username || `ID: ${employee.id}`;
                return (
                  <Select.Option key={employee.id} value={employee.id}>
                    {fullName}
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Registration;
