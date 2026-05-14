import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Popconfirm, Tag, Checkbox, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, LockOutlined, CopyOutlined } from '@ant-design/icons';
import { roleAPI } from '../services/api';

const { TextArea } = Input;

const Roles = () => {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [menuOptions, setMenuOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedMenus, setSelectedMenus] = useState([]);
  const [copyFromRoleId, setCopyFromRoleId] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    loadRoles();
    loadMenuOptions();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const res = await roleAPI.getRoles();
      const data = res.data?.results || res.data || [];
      setRoles(Array.isArray(data) ? data : []);
    } catch {
      message.error('Nem sikerült betölteni a szerepköröket');
    } finally {
      setLoading(false);
    }
  };

  const loadMenuOptions = async () => {
    try {
      const res = await roleAPI.menuOptions();
      setMenuOptions(res.data?.menus || []);
    } catch {
      setMenuOptions([]);
    }
  };

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (role) => {
    setEditing(role);
    form.setFieldsValue({ name: role.name, description: role.description || '', is_active: role.is_active });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await roleAPI.deleteRole(id);
      message.success('Szerepkör törölve');
      loadRoles();
    } catch {
      message.error('Nem sikerült törölni a szerepkört');
    }
  };

  const getDuplicateRoleName = (baseName) => {
    const normalizedBase = `${baseName} másolat`;
    const existingNames = new Set(roles.map(r => r.name));
    if (!existingNames.has(normalizedBase)) return normalizedBase;
    let counter = 2;
    while (existingNames.has(`${normalizedBase} ${counter}`)) counter++;
    return `${normalizedBase} ${counter}`;
  };

  const handleDuplicate = async (role) => {
    try {
      const cloned = await roleAPI.createRole({
        name: getDuplicateRoleName(role.name),
        description: role.description || '',
        is_active: role.is_active,
        menu_permissions: role.menu_permissions || [],
      });
      if (cloned) {
        message.success('Szerepkör másolva');
        loadRoles();
      }
    } catch {
      message.error('Nem sikerült másolni a szerepkört');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await roleAPI.updateRole(editing.id, values);
        message.success('Szerepkör frissítve');
      } else {
        await roleAPI.createRole({ ...values, menu_permissions: [] });
        message.success('Szerepkör létrehozva');
      }
      setModalOpen(false);
      loadRoles();
    } catch {
      message.error('Nem sikerült menteni a szerepkört');
    } finally {
      setSaving(false);
    }
  };

  const handleManagePermissions = (role) => {
    setSelectedRole(role);
    setSelectedMenus(role.menu_permissions || []);
    setCopyFromRoleId(undefined);
    setPermissionsModalOpen(true);
  };

  const handleCopyPermissions = () => {
    if (!copyFromRoleId) { message.warning('Válassz forrás szerepkört'); return; }
    const source = roles.find(r => r.id === copyFromRoleId);
    if (!source) { message.error('A forrás szerepkör nem található'); return; }
    setSelectedMenus(source.menu_permissions || []);
    message.success(`Jogosultságok átmásolva: ${source.name}`);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    try {
      setSavingPerms(true);
      await roleAPI.updateRole(selectedRole.id, {
        name: selectedRole.name,
        description: selectedRole.description || '',
        is_active: selectedRole.is_active,
        menu_permissions: selectedMenus,
      });
      message.success('Jogosultságok frissítve');
      setPermissionsModalOpen(false);
      loadRoles();
    } catch {
      message.error('Nem sikerült frissíteni a jogosultságokat');
    } finally {
      setSavingPerms(false);
    }
  };

  const toggleAllMenus = (checked) => {
    setSelectedMenus(checked ? menuOptions.map(m => m.key || m) : []);
  };

  const allSelected = menuOptions.length > 0 && menuOptions.every(m => selectedMenus.includes(m.key || m));
  const someSelected = selectedMenus.length > 0 && !allSelected;

  const columns = [
    {
      title: 'Szerepkör neve',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <>
          {text}
          {record.is_active === false && <Tag color="red" style={{ marginLeft: 8 }}>Inaktív</Tag>}
        </>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      render: (v) => v || <span style={{ color: '#bbb' }}>–</span>,
    },
    {
      title: 'Menü jogosultságok',
      key: 'menu_permissions',
      render: (_, record) => {
        const perms = record.menu_permissions || [];
        if (perms.length === 0) return <span style={{ color: '#bbb', fontSize: 12 }}>–</span>;
        return perms.slice(0, 5).map((m) => (
          <Tag key={m} color="blue" style={{ marginBottom: 2 }}>{m}</Tag>
        )).concat(perms.length > 5 ? [<Tag key="more">+{perms.length - 5}</Tag>] : []);
      },
    },
    {
      title: 'Felhasználók',
      dataIndex: 'users_count',
      key: 'users_count',
      render: (count) => count != null ? `${count} fő` : <span style={{ color: '#bbb' }}>–</span>,
      width: 100,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<KeyOutlined />}
            size="small"
            onClick={() => handleManagePermissions(record)}
          >
            Jogosultságok
          </Button>
          <Button
            icon={<CopyOutlined />}
            size="small"
            title="Duplikálás"
            onClick={() => handleDuplicate(record)}
          />
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Biztosan törölni szeretnéd?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <LockOutlined />
            Jogosultságok kezelése
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Új szerepkör
          </Button>
        }
      >
        <Table
          size="small"
          columns={columns}
          dataSource={roles}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
        />
      </Card>

      {/* Létrehozás / Szerkesztés modal */}
      <Modal
        title={editing ? 'Szerepkör szerkesztése' : 'Új szerepkör'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editing ? 'Mentés' : 'Létrehozás'}
        cancelText="Mégse"
        okButtonProps={{ loading: saving }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="Neve" name="name" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="Pl. Admin, Pénzügy" />
          </Form.Item>
          <Form.Item label="Leírás" name="description">
            <TextArea rows={2} placeholder="Rövid leírás (opcionális)" />
          </Form.Item>
          <Form.Item name="is_active" valuePropName="checked" initialValue={true}>
            <Checkbox>Aktív</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* Menü jogosultságok modal */}
      <Modal
        title={`Menü jogosultságok – ${selectedRole?.name || ''}`}
        open={permissionsModalOpen}
        onCancel={() => setPermissionsModalOpen(false)}
        onOk={handleSavePermissions}
        okText="Mentés"
        cancelText="Mégse"
        okButtonProps={{ loading: savingPerms }}
        width={600}
      >
        {roles.length > 1 && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 6, padding: '8px 12px' }}>
            <span style={{ fontSize: 12, color: '#555' }}>Másolás másik szerepkörből:</span>
            <select
              value={copyFromRoleId || ''}
              onChange={(e) => setCopyFromRoleId(e.target.value ? Number(e.target.value) : undefined)}
              style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13 }}
            >
              <option value="">– válassz –</option>
              {roles.filter(r => r.id !== selectedRole?.id).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button size="small" onClick={handleCopyPermissions}>Másolás</Button>
          </div>
        )}
        <div style={{ marginBottom: 12, borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
          <Checkbox
            indeterminate={someSelected}
            checked={allSelected}
            onChange={(e) => toggleAllMenus(e.target.checked)}
          >
            <strong>Összes kijelölése</strong>
          </Checkbox>
        </div>
        {menuOptions.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: 24 }}>Nincsenek menü opciók</div>
        ) : (
          <Row gutter={[8, 8]}>
            {menuOptions.map((opt) => {
              const key = opt.key || opt;
              const label = opt.label || opt.name || key;
              return (
                <Col span={12} key={key}>
                  <Checkbox
                    checked={selectedMenus.includes(key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMenus(prev => [...prev, key]);
                      } else {
                        setSelectedMenus(prev => prev.filter(k => k !== key));
                      }
                    }}
                  >
                    {label}
                  </Checkbox>
                </Col>
              );
            })}
          </Row>
        )}
      </Modal>
    </div>
  );
};

export default Roles;
