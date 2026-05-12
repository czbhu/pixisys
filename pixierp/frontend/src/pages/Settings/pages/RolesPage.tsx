import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Tag, Checkbox, Collapse, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, LockOutlined, CopyOutlined } from '@ant-design/icons';
import { rolesService, Role, Permission, ModulesAndActions } from '../../../services/rolesService';

const { TextArea } = Input;
const { Panel } = Collapse;

const RolesPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [modulesAndActions, setModulesAndActions] = useState<ModulesAndActions>({ modules: [], resources: {}, actions: [] });
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [canApproveOrders, setCanApproveOrders] = useState(false);
  const [copyFromRoleId, setCopyFromRoleId] = useState<number | undefined>(undefined);

  useEffect(() => {
    loadRoles();
    loadModulesAndActions();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await rolesService.getRoles();
      setRoles(data);
    } catch (error) {
      message.error('Nem sikerült betölteni a szerepköröket');
    } finally {
      setLoading(false);
    }
  };

  const loadModulesAndActions = async () => {
    try {
      const data = await rolesService.getModulesAndActions();
      setModulesAndActions(data);
    } catch (error) {
      console.error('Failed to load modules and actions:', error);
    }
  };

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditing(role);
    form.setFieldsValue(role);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await rolesService.deleteRole(id);
      message.success('Szerepkör törölve');
      loadRoles();
    } catch (error) {
      message.error('Nem sikerült törölni a szerepkört');
    }
  };

  const getDuplicateRoleName = (baseName: string) => {
    const normalizedBase = `${baseName} másolat`;
    const existingNames = new Set(roles.map(role => role.name));
    if (!existingNames.has(normalizedBase)) {
      return normalizedBase;
    }

    let counter = 2;
    while (existingNames.has(`${normalizedBase} ${counter}`)) {
      counter += 1;
    }
    return `${normalizedBase} ${counter}`;
  };

  const handleDuplicate = async (role: Role) => {
    try {
      const clonedRole = await rolesService.createRole({
        name: getDuplicateRoleName(role.name),
        description: role.description || '',
        can_approve_orders: role.can_approve_orders || false,
      });

      const clonedPermissions = (role.permissions || [])
        .filter(perm => perm.allowed)
        .map(perm => ({
          module: perm.module,
          resource: perm.resource,
          action: perm.action,
          allowed: true,
        }));

      if (clonedPermissions.length > 0) {
        await rolesService.setRolePermissions(clonedRole.id, clonedPermissions);
      }

      message.success('Szerepkör másolva');
      loadRoles();
    } catch (error) {
      message.error('Nem sikerült másolni a szerepkört');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editing) {
        await rolesService.updateRole(editing.id, values);
        message.success('Szerepkör frissítve');
      } else {
        await rolesService.createRole(values);
        message.success('Szerepkör létrehozva');
      }
      
      setModalOpen(false);
      loadRoles();
    } catch (error) {
      message.error('Nem sikerült menteni a szerepkört');
    }
  };

  const handleManagePermissions = async (role: Role) => {
    setSelectedRole(role);
    setCanApproveOrders(role.can_approve_orders || false);
    setCopyFromRoleId(undefined);
    
    // Load current permissions (almodul szinten)
    const currentPermissions: Record<string, string[]> = {};
    role.permissions.forEach(perm => {
      const key = perm.resource || perm.module; // Resource ha van, különben modul
      if (!currentPermissions[key]) {
        currentPermissions[key] = [];
      }
      if (perm.allowed && !currentPermissions[key].includes(perm.action)) {
        currentPermissions[key].push(perm.action);
      }
    });
    
    setPermissions(currentPermissions);
    setPermissionsModalOpen(true);
  };

  const allActionValues = modulesAndActions.actions.map(a => a.value);

  /** Ha 'manage' be van jelölve: az összes többi action is bekerül.
   *  Ha 'manage' ki van jelölve: az összes action törlődik.
   *  Ha bármely más action ki van jelölve: 'manage' is törlődik. */
  const applyManageLogic = (current: string[], action: string, checked: boolean, allActions: string[]): string[] => {
    let result = [...current];
    if (action === 'manage') {
      if (checked) {
        // Teljes jogosultság: minden action bekerül
        result = [...allActions];
      } else {
        // Teljes jogosultság levéve: mindet töröljük
        result = [];
      }
    } else {
      if (checked) {
        if (!result.includes(action)) result.push(action);
        // Ha most minden action be van jelölve (manage kivételével), tegyük be a manage-t is
        const otherActions = allActions.filter(a => a !== 'manage');
        if (otherActions.every(a => result.includes(a)) && !result.includes('manage')) {
          result.push('manage');
        }
      } else {
        result = result.filter(a => a !== action && a !== 'manage');
      }
    }
    return result;
  };

  const handlePermissionChange = (resourceOrModule: string, action: string, checked: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev };
      
      // Ha modul szintű checkbox (nem tartalmaz pontot)
      if (!resourceOrModule.includes('.')) {
        // Keressük meg az összes resource-t ebben a modulban
        const moduleResources = modulesAndActions.resources[resourceOrModule];
        if (moduleResources && moduleResources.resources && moduleResources.resources.length > 0) {
          moduleResources.resources.forEach(resource => {
            if (!updated[resource.value]) updated[resource.value] = [];
            updated[resource.value] = applyManageLogic(updated[resource.value], action, checked, allActionValues);
          });
        } else {
          // Nincs almodul: közvetlenül a modulra mentjük a jogosultságot
          if (!updated[resourceOrModule]) updated[resourceOrModule] = [];
          updated[resourceOrModule] = applyManageLogic(updated[resourceOrModule], action, checked, allActionValues);
        }
      } else {
        // Resource szintű változtatás
        if (!updated[resourceOrModule]) updated[resourceOrModule] = [];
        updated[resourceOrModule] = applyManageLogic(updated[resourceOrModule], action, checked, allActionValues);
      }
      
      return updated;
    });
  };

  // Segédfüggvény: ellenőrzi, hogy egy modul összes resource-a rendelkezik-e adott jogosultsággal
  const isModuleActionChecked = (moduleCode: string, action: string): boolean => {
    const moduleResources = modulesAndActions.resources[moduleCode];
    if (!moduleResources || !moduleResources.resources || moduleResources.resources.length === 0) {
      return permissions[moduleCode]?.includes(action) || false;
    }
    
    return moduleResources.resources.every(resource => 
      permissions[resource.value]?.includes(action)
    );
  };

  const handleCopyPermissionsFromRole = () => {
    if (!copyFromRoleId) {
      message.warning('Válassz forrás szerepkört');
      return;
    }

    const sourceRole = roles.find(role => role.id === copyFromRoleId);
    if (!sourceRole) {
      message.error('A forrás szerepkör nem található');
      return;
    }

    const copiedPermissions: Record<string, string[]> = {};
    sourceRole.permissions.forEach(perm => {
      if (!perm.allowed) return;
      const key = perm.resource || perm.module;
      if (!copiedPermissions[key]) {
        copiedPermissions[key] = [];
      }
      if (!copiedPermissions[key].includes(perm.action)) {
        copiedPermissions[key].push(perm.action);
      }
    });

    setPermissions(copiedPermissions);
    setCanApproveOrders(sourceRole.can_approve_orders || false);
    message.success(`Jogosultságok átmásolva: ${sourceRole.name}`);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    
    try {
      const permissionsArray: Array<{ module: string; resource?: string; action: string; allowed: boolean }> = [];
      
      Object.entries(permissions).forEach(([resourceOrModule, actions]) => {
        actions.forEach(action => {
          // Ha tartalmaz pontot, akkor resource (pl. hr.employees)
          if (resourceOrModule.includes('.')) {
            const module = resourceOrModule.split('.')[0];
            permissionsArray.push({ module, resource: resourceOrModule, action, allowed: true });
          } else {
            // Különben csak modul
            permissionsArray.push({ module: resourceOrModule, action, allowed: true });
          }
        });
      });
      
      await rolesService.setRolePermissions(selectedRole.id, permissionsArray);

      // Update can_approve_orders flag if changed
      if (selectedRole.can_approve_orders !== canApproveOrders) {
        await rolesService.updateRole(selectedRole.id, { 
          name: selectedRole.name,
          can_approve_orders: canApproveOrders 
        });
      }

      message.success('Jogosultságok frissítve');
      setPermissionsModalOpen(false);
      loadRoles();
    } catch (error) {
      message.error('Nem sikerült frissíteni a jogosultságokat');
    }
  };

  const columns = [
    {
      title: 'Szerepkör neve',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Role) => (
        <>
          {text}
          {record.is_system && <Tag color="blue" style={{ marginLeft: 8 }}>Rendszer</Tag>}
          {record.can_approve_orders && <Tag color="green" style={{ marginLeft: 8 }}>Jóváhagyó</Tag>}
        </>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Jóváhagyó osztályok',
      key: 'approver_depts',
      render: (_: any, record: Role) => {
        if (!record.can_approve_orders) return <span style={{ color: '#bbb', fontSize: 12 }}>–</span>;
        const depts = record.department_names || [];
        if (depts.length === 0) return <span style={{ color: '#bbb', fontSize: 12 }}>Nincs osztály</span>;
        return (
          <>
            {depts.map((name, i) => (
              <Tag key={i} color="geekblue" style={{ marginBottom: 2 }}>{name}</Tag>
            ))}
          </>
        );
      },
    },
    {
      title: 'Jogosultságok',
      dataIndex: 'permissions_count',
      key: 'permissions_count',
      render: (count: number) => `${count} db`,
    },
    {
      title: 'Felhasználók',
      dataIndex: 'users_count',
      key: 'users_count',
      render: (count: number) => `${count} fő`,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: Role) => (
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
            onClick={() => handleDuplicate(record)}
          />
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          />
          {!record.is_system && (
            <Popconfirm
              title="Biztosan törölni szeretnéd?"
              onConfirm={() => handleDelete(record.id)}
              okText="Igen"
              cancelText="Nem"
            >
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          )}
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
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editing ? 'Szerepkör szerkesztése' : 'Új szerepkör'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Szerepkör neve"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item name="description" label="Leírás">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="can_approve_orders" valuePropName="checked">
            <Checkbox>Jóváhagyó (Mindent jóváhagyhat)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* Permissions Modal */}
      <Modal
        title={`Jogosultságok: ${selectedRole?.name}`}
        open={permissionsModalOpen}
        onOk={handleSavePermissions}
        onCancel={() => setPermissionsModalOpen(false)}
        okText="Mentés"
        cancelText="Mégse"
        width={800}
      >
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <Checkbox 
            checked={canApproveOrders}
            onChange={e => setCanApproveOrders(e.target.checked)}
          >
            <strong>Jóváhagyó</strong> (Teljes jóváhagyási jogkör minden rendelésre)
          </Checkbox>
        </div>

        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4 }}>
          <Space wrap>
            <span>Jogosultságok másolása:</span>
            <Select
              allowClear
              showSearch
              placeholder="Válassz forrás szerepkört"
              style={{ width: 280 }}
              value={copyFromRoleId}
              onChange={(value) => setCopyFromRoleId(value)}
              options={roles
                .filter(role => role.id !== selectedRole?.id)
                .map(role => ({ value: role.id, label: role.name }))}
              optionFilterProp="label"
            />
            <Button onClick={handleCopyPermissionsFromRole} disabled={!copyFromRoleId}>
              Másolás
            </Button>
          </Space>
        </div>

        <Collapse>
          {modulesAndActions.modules.map(module => {
            const moduleResources = modulesAndActions.resources[module.value];
            
            return (
              <Panel 
                header={module.label} 
                key={module.value}
                extra={
                  // Modul szintű checkboxok
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Ha nincs almodul: megadott jogok összefoglalója */}
                    {(!moduleResources || moduleResources.resources.length === 0) && (() => {
                      const enabled = modulesAndActions.actions.filter(a => permissions[module.value]?.includes(a.value));
                      return enabled.length > 0
                        ? <span style={{ display: 'flex', gap: 4, marginRight: 8 }}>
                            {enabled.map(a => <Tag key={a.value} color="blue" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>{a.label}</Tag>)}
                          </span>
                        : <span style={{ fontSize: 11, color: '#bbb', marginRight: 8 }}>–</span>;
                    })()}
                    {modulesAndActions.actions.map(action => (
                      <Checkbox
                        key={action.value}
                        checked={isModuleActionChecked(module.value, action.value)}
                        onChange={e => handlePermissionChange(module.value, action.value, e.target.checked)}
                        style={{ marginLeft: 8 }}
                      >
                        {action.label}
                      </Checkbox>
                    ))}
                  </div>
                }
              >
                {moduleResources && moduleResources.resources.length > 0 ? (
                  // Ha vannak almodulok (resources), jelenítsd meg őket
                  <Collapse>
                    {moduleResources.resources.map(resource => {
                      const enabledActions = modulesAndActions.actions.filter(a => permissions[resource.value]?.includes(a.value));
                      return (
                      <Panel
                        header={resource.label}
                        key={resource.value}
                        className="ml-4"
                        extra={
                          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {enabledActions.length === 0
                              ? <span style={{ fontSize: 11, color: '#bbb' }}>–</span>
                              : enabledActions.map(a => (
                                <Tag key={a.value} color="blue" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>{a.label}</Tag>
                              ))
                            }
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          {modulesAndActions.actions.map(action => (
                            <Col span={12} key={action.value}>
                              <Checkbox
                                checked={permissions[resource.value]?.includes(action.value) || false}
                                onChange={e => handlePermissionChange(resource.value, action.value, e.target.checked)}
                              >
                                {action.label}
                              </Checkbox>
                            </Col>
                          ))}
                        </Row>
                      </Panel>
                      );
                    })}
                  </Collapse>
                ) : (
                  // Ha nincsenek almodulok, modul szinten jelenítsd meg
                  <Row gutter={[16, 16]}>
                    {modulesAndActions.actions.map(action => (
                      <Col span={12} key={action.value}>
                        <Checkbox
                          checked={permissions[module.value]?.includes(action.value) || false}
                          onChange={e => handlePermissionChange(module.value, action.value, e.target.checked)}
                        >
                          {action.label}
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                )}
              </Panel>
            );
          })}
        </Collapse>
      </Modal>
    </div>
  );
};

export default RolesPage;
