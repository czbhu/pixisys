import React, { useMemo, useState, useEffect } from 'react';
import {
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
  Drawer,
  Tooltip,
  Table,
  Divider,
  Select,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  GlobalOutlined,
  ApiOutlined,
  SyncOutlined,
  CopyOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { deepSearchMatch } from '../../utils/searchUtils';
import EnhancedTable from '../../components/EnhancedTable';
import ExportButton from '../../components/ExportButton';

const { TextArea } = Input;

const BASE_URL = window.location.origin;

interface MaterialGroup {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  materials_count: number;
  total_materials_count?: number;
  created_at: string;
  created_by_name?: string;
  parent?: number | null;
  parent_name?: string;
  children?: MaterialGroup[];
  public_slug?: string | null;
  public_title?: string;
  public_description?: string;
  show_prices?: boolean;
}

interface MaterialGroupFormValues {
  parent?: number;
  name?: string;
  description?: string;
  is_active?: boolean;
}



const MaterialGroups: React.FC = () => {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MaterialGroup | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<MaterialGroupFormValues>({});
  const [form] = Form.useForm();
  // API sync drawer
  const [apiDrawerGroup, setApiDrawerGroup] = useState<MaterialGroup | null>(null);
  const [apiSyncs, setApiSyncs] = useState<any[]>([]);
  const [apiSyncsLoading, setApiSyncsLoading] = useState(false);
  const [editingSync, setEditingSync] = useState<any | null>(null);
  const [syncForm] = Form.useForm();
  const [syncRunning, setSyncRunning] = useState<number | null>(null);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [syncSuppliers, setSyncSuppliers] = useState<{ id: number; name: string }[]>([]);



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

    // Compute total_materials_count (direct + all descendants)
    const computeTotal = (node: MaterialGroup): number => {
      const childTotal = (node.children || []).reduce((sum, c) => sum + computeTotal(c), 0);
      node.total_materials_count = (node.materials_count || 0) + childTotal;
      return node.total_materials_count;
    };
    roots.forEach(computeTotal);
    
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
    const values: MaterialGroupFormValues = {
      parent: undefined,
      name: '',
      description: '',
      is_active: true,
    };
    setInitialFormValues(values);
    form.resetFields();
    form.setFieldsValue(values);
    setIsModalVisible(true);
  };

  const showEditModal = (group: MaterialGroup) => {
    setEditingGroup(group);
    const values: MaterialGroupFormValues = {
      parent: group.parent || undefined,
      name: group.name || '',
      description: group.description || '',
      is_active: !!group.is_active,
      public_slug: group.public_slug || undefined,
      public_title: group.public_title || '',
      public_description: group.public_description || '',
      show_prices: group.show_prices !== false,
    } as any;
    setInitialFormValues(values);
    form.resetFields();
    form.setFieldsValue(values);
    setIsModalVisible(true);
  };

  const normalizeFormValues = (values: MaterialGroupFormValues): MaterialGroupFormValues => ({
    parent: values.parent ?? undefined,
    name: (values.name || '').trim(),
    description: (values.description || '').trim(),
    is_active: !!values.is_active,
  });

  const hasFormChanges = (): boolean => {
    const currentValues = form.getFieldsValue(true) as MaterialGroupFormValues;
    const normalizedCurrent = normalizeFormValues(currentValues);
    const normalizedInitial = normalizeFormValues(initialFormValues);
    return JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedInitial);
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

  // ── API sync functions ────────────────────────────────────────────────────
  const openApiDrawer = async (group: MaterialGroup) => {
    setApiDrawerGroup(group);
    setSyncDrawerOpen(true);
    setApiSyncsLoading(true);
    try {
      const [syncsRes, suppRes] = await Promise.all([
        api.get(`/warehouse/material-group-api-syncs/?material_group=${group.id}`),
        api.get('/crm/companies/?is_supplier=true&page_size=500'),
      ]);
      setApiSyncs(syncsRes.data.results ?? syncsRes.data ?? []);
      const suppData = suppRes.data.results ?? suppRes.data ?? [];
      setSyncSuppliers(suppData.map((s: any) => ({ id: s.id, name: s.name })));
    } catch { message.error('Hiba betöltéskor'); }
    finally { setApiSyncsLoading(false); }
  };

  const saveSync = async () => {
    try {
      const values = await syncForm.validateFields();
      const payload = { ...values, material_group: apiDrawerGroup?.id };
      if (editingSync?.id) {
        await api.patch(`/warehouse/material-group-api-syncs/${editingSync.id}/`, payload);
      } else {
        await api.post('/warehouse/material-group-api-syncs/', payload);
      }
      message.success('Mentve');
      setEditingSync(null);
      syncForm.resetFields();
      if (apiDrawerGroup) {
        const res = await api.get(`/warehouse/material-group-api-syncs/?material_group=${apiDrawerGroup.id}`);
        setApiSyncs(res.data.results ?? res.data ?? []);
      }
    } catch { message.error('Mentési hiba'); }
  };

  const runSync = async (syncId: number) => {
    setSyncRunning(syncId);
    try {
      const res = await api.post(`/warehouse/material-group-api-syncs/${syncId}/run/`);
      message.success(res.data.message || 'Szinkronizáció kész');
      if (apiDrawerGroup) {
        const r2 = await api.get(`/warehouse/material-group-api-syncs/?material_group=${apiDrawerGroup.id}`);
        setApiSyncs(r2.data.results ?? r2.data ?? []);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Szinkronizációs hiba');
    } finally { setSyncRunning(null); }
  };

  const deleteSync = async (id: number) => {
    await api.delete(`/warehouse/material-group-api-syncs/${id}/`);
    setApiSyncs(prev => prev.filter(s => s.id !== id));
    message.success('Törölve');
  };

  const columns: ColumnsType<MaterialGroup> = [
    {
      title: 'Gyűjtő neve',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'hu'),
      render: (name: string, record: MaterialGroup) => (
        <a
          href={`/warehouse/materials?group=${record.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Gyűjtő alapanyagainak megnyitása új lapon"
        >
          {name}
        </a>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      sorter: (a: any, b: any) => (a.description || '').localeCompare(b.description || '', 'hu'),
    },
    {
      title: 'Alapanyagok',
      dataIndex: 'materials_count',
      key: 'materials_count',
      width: 150,
      sorter: (a: any, b: any) => (a.total_materials_count || 0) - (b.total_materials_count || 0),
      render: (count: number, record: MaterialGroup) => {
        const total = record.total_materials_count ?? count;
        const hasChildren = total > count;
        return (
          <span>
            <Tag color={count > 0 ? 'blue' : 'default'} style={{ marginRight: 0 }}>{count} db</Tag>
            {hasChildren && (
              <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>
                (összesen: {total})
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      sorter: (a: any, b: any) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
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
      sorter: (a: any, b: any) => (a.created_by_name || '').localeCompare(b.created_by_name || '', 'hu'),
    },
    {
      title: 'Publikus link',
      key: 'public_slug',
      render: (_, record: MaterialGroup) => record.public_slug ? (
        <Space size={4}>
          <Tag color="blue" icon={<LinkOutlined />}>{BASE_URL}/shop/{record.public_slug}</Tag>
          <Tooltip title="Link másolása">
            <Button size="small" icon={<CopyOutlined />} onClick={() => {
              navigator.clipboard.writeText(`${BASE_URL}/shop/${record.public_slug}`);
              message.success('Link másolva!');
            }} />
          </Tooltip>
        </Space>
      ) : <Tag color="default">Nincs publikus link</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 150,
      render: (_, record: MaterialGroup) => (
        <Space>
          <Tooltip title="Szerkesztés">
            <Button size="small" icon={<EditOutlined />} onClick={() => showEditModal(record)} />
          </Tooltip>
          <Tooltip title="API szinkronizáció beállítása">
            <Button size="small" icon={<ApiOutlined />} onClick={() => openApiDrawer(record)} />
          </Tooltip>
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
              size="small" danger icon={<DeleteOutlined />}
              disabled={record.materials_count > 0 || (record.children && record.children.length > 0)}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filteredGroups = useMemo(() => {
    if (!searchText?.trim()) return groups;
    return groups.filter((group) => deepSearchMatch(searchText, group));
  }, [groups, searchText]);

  return (
    <div style={{ padding: 24 }}>
      <Card title="Alapanyag kategóriák">
        <EnhancedTable
          tableKey="materialGroups"
          columns={columns as any}
          dataSource={filteredGroups}
          rowKey="id"
          loading={loading}
          cardBreakpoint={750}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Gyorskereső..."
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          toolbarExtra={
            <Space>
              <ExportButton dataType="material_group" selectedIds={selectedRowKeys.map(Number)} />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={showCreateModal}
              >
                Új kategória
              </Button>
            </Space>
          }
          pagination={false}
          expandable={{
              defaultExpandAllRows: true,
          }}
        />
      </Card>

      <Modal
        title={editingGroup ? 'Kategória szerkesztése' : 'Új kategória'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
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
            <TextArea rows={3} placeholder="Opcionális leírás a gyűjtőről" />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 12, color: '#888' }}>Publikus oldal beállítások</Divider>

          <Form.Item
            name="public_slug"
            label="Publikus link (slug)"
            help={form.getFieldValue('public_slug') ? `${BASE_URL}/shop/${form.getFieldValue('public_slug')}` : 'pl. ajandektargyak → /shop/ajandektargyak'}
            rules={[{ pattern: /^[a-z0-9-]*$/, message: 'Csak kisbetű, szám és kötőjel' }]}
          >
            <Input placeholder="ajandektargyak" prefix={<GlobalOutlined />} addonBefore="/shop/" />
          </Form.Item>

          <Form.Item name="public_title" label="Publikus cím">
            <Input placeholder="Ha üres, a kategória neve jelenik meg" />
          </Form.Item>

          <Form.Item name="public_description" label="Publikus leírás (HTML, opcionális)">
            <TextArea rows={3} placeholder="<p>Termék kategória leírása...</p>" />
          </Form.Item>

          <Form.Item name="show_prices" label="Árak megjelenítése" valuePropName="checked">
            <Switch checkedChildren="Igen" unCheckedChildren="Nem" />
          </Form.Item>

          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── API Sync Drawer ──────────────────────────────────────────────── */}
      <Drawer
        title={<Space><ApiOutlined /> API szinkronizáció — {apiDrawerGroup?.name}</Space>}
        open={syncDrawerOpen}
        onClose={() => { setSyncDrawerOpen(false); setEditingSync(null); syncForm.resetFields(); }}
        width={680}
        destroyOnHidden
      >
        <Form form={syncForm} layout="vertical" onFinish={saveSync}>
          <Form.Item name="name" label="Szinkron neve" rules={[{ required: true }]}>
            <Input placeholder="pl. Webshop termékek" />
          </Form.Item>
          <Form.Item name="api_url" label="API URL" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://api.example.com/products" />
          </Form.Item>
          <Form.Item name="api_method" label="HTTP metódus" initialValue="GET">
            <Select options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="api_headers" label='Fejlécek (JSON, pl. {"Authorization":"Bearer TOKEN"})'>
            <Input.TextArea rows={2} placeholder='{"Authorization": "Bearer TOKEN"}' />
          </Form.Item>
          <Form.Item name="api_body" label="GET paraméterek / POST törzs (JSON)">
            <Input.TextArea rows={2} placeholder='{"per_page": 100}' />
          </Form.Item>
          <Form.Item name="items_path" label='Tömb elérési útja a válaszban (pl. "results" vagy "data.items")'>
            <Input placeholder="results" />
          </Form.Item>
          <Form.Item name="field_mapping" label='Mező-leképezés (JSON: külső mező → belső mező)' help='Belső mezők: name, code, description, unit_selling_price, unit, width, length, height, dimension_unit'>
            <Input.TextArea rows={4} placeholder='{"termek_nev": "name", "cikkszam": "code", "ar": "unit_selling_price", "me": "unit"}' />
          </Form.Item>
          <Form.Item name="sync_interval_minutes" label="Frissítési gyakoriság" initialValue={1440}>
            <Select style={{ width: 240 }} options={[
              { value: 30,    label: '30 percenként' },
              { value: 60,    label: 'Óránként' },
              { value: 180,   label: '3 óránként' },
              { value: 360,   label: '6 óránként' },
              { value: 720,   label: '12 óránként' },
              { value: 1440,  label: 'Naponta (ajánlott)' },
              { value: 4320,  label: 'Háromnaponta' },
              { value: 10080, label: 'Hetente' },
            ]} />
          </Form.Item>

          <Form.Item name="default_supplier" label="Alapértelmezett beszállító" help="A szinkronizált termékek ehhez a beszállítóhoz lesznek rendelve">
            <Select
              allowClear showSearch placeholder="Válassz beszállítót (opcionális)"
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={syncSuppliers.map(s => ({ value: s.id, label: s.name }))}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item name="default_markup_percentage" label="Haszonkulcs (%)" initialValue={0}
            help="Eladási ár = Bsz. ár × (1 + haszonkulcs / 100). Pl. 30 → 30% felár. 0 = nincs számítás.">
            <Input type="number" min={0} step={1} style={{ width: 140 }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">{editingSync ? 'Frissítés' : 'Hozzáadás'}</Button>
            {editingSync && <Button onClick={() => { setEditingSync(null); syncForm.resetFields(); }}>Mégse</Button>}
          </Space>
        </Form>

        <Divider />

        <Table
          dataSource={apiSyncs}
          rowKey="id"
          loading={apiSyncsLoading}
          size="small"
          pagination={false}
          columns={[
            { title: 'Név', dataIndex: 'name', key: 'name' },
            { title: 'URL', dataIndex: 'api_url', key: 'api_url', ellipsis: true, render: (u: string) => <a href={u} target="_blank" rel="noreferrer">{u}</a> },
            { title: 'Gyakoriság', dataIndex: 'sync_interval_minutes', key: 'interval', width: 130,
              render: (m: number) => {
                const opts: Record<number, string> = { 30: '30 perc', 60: '1 óra', 180: '3 óra', 360: '6 óra', 720: '12 óra', 1440: 'Napi', 4320: '3 nap', 10080: 'Heti' };
                return <Tag>{opts[m] || `${m} perc`}</Tag>;
              },
            },
            { title: 'Státusz', dataIndex: 'last_sync_status', key: 'status', width: 90,
              render: (s: string, r: any) => <Tooltip title={r.last_sync_message}><Tag color={s === 'ok' ? 'success' : s === 'error' ? 'error' : 'default'}>{r.last_sync_count > 0 ? `${r.last_sync_count} db` : s || '—'}</Tag></Tooltip>
            },
            { title: 'Műveletek', key: 'actions', width: 130,
              render: (_: any, r: any) => (
                <Space size={4}>
                  <Tooltip title="Futtatás most">
                    <Button size="small" icon={<SyncOutlined spin={syncRunning === r.id} />} loading={syncRunning === r.id} onClick={() => runSync(r.id)} />
                  </Tooltip>
                  <Tooltip title="Szerkesztés">
                    <Button size="small" icon={<EditOutlined />} onClick={() => {
                      setEditingSync(r);
                      syncForm.setFieldsValue({
                        ...r,
                        api_headers: r.api_headers ? JSON.stringify(r.api_headers, null, 2) : '',
                        api_body: r.api_body ? JSON.stringify(r.api_body, null, 2) : '',
                        field_mapping: r.field_mapping ? JSON.stringify(r.field_mapping, null, 2) : '',
                        default_supplier: r.default_supplier ?? undefined,
                        default_markup_percentage: r.default_markup_percentage ?? 0,
                      });
                    }} />
                  </Tooltip>
                  <Popconfirm title="Törlés?" onConfirm={() => deleteSync(r.id)} okText="Törlés" cancelText="Mégse">
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
};

export default MaterialGroups;
