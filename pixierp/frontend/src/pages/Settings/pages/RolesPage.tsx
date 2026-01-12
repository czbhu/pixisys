import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Popconfirm, Tag, Checkbox, Collapse, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
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
    
    // Load current permissions (almodul szinten)
    const currentPermissions: Record<string, string[]> = {};
    role.permissions.forEach(perm => {
      const key = perm.resource || perm.module; // Resource ha van, különben modul
      if (!currentPermissions[key]) {
        currentPermissions[key] = [];
      }
      if (perm.allowed) {
        currentPermissions[key].push(perm.action);
      }
    });
    
    setPermissions(currentPermissions);
    setPermissionsModalOpen(true);
  };

  const handlePermissionChange = (resourceOrModule: string, action: string, checked: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev };
      
      // Ha modul szintű checkbox (nem tartalmaz pontot)
      if (!resourceOrModule.includes('.')) {
        // Keressük meg az összes resource-t ebben a modulban
        const moduleResources = modulesAndActions.resources[resourceOrModule];
        if (moduleResources && moduleResources.resources) {
          moduleResources.resources.forEach(resource => {
            if (!updated[resource.value]) {
              updated[resource.value] = [];
            }
            if (checked) {
              if (!updated[resource.value].includes(action)) {
                updated[resource.value].push(action);
              }
            } else {
              updated[resource.value] = updated[resource.value].filter(a => a !== action);
            }
          });
        }
      } else {
        // Resource szintű változtatás
        if (!updated[resourceOrModule]) {
          updated[resourceOrModule] = [];
        }
        
        if (checked) {
          if (!updated[resourceOrModule].includes(action)) {
            updated[resourceOrModule].push(action);
          }
        } else {
          updated[resourceOrModule] = updated[resourceOrModule].filter(a => a !== action);
        }
      }
      
      return updated;
    });
  };

  // Segédfüggvény: ellenőrzi, hogy egy modul összes resource-a rendelkezik-e adott jogosultsággal
  const isModuleActionChecked = (moduleCode: string, action: string): boolean => {
    const moduleResources = modulesAndActions.resources[moduleCode];
    if (!moduleResources || !moduleResources.resources || moduleResources.resources.length === 0) {
      return false;
    }
    
    return moduleResources.resources.every(resource => 
      permissions[resource.value]?.includes(action)
    );
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
        </>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
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
        <Collapse>
          {modulesAndActions.modules.map(module => {
            const moduleResources = modulesAndActions.resources[module.value];
            
            return (
              <Panel 
                header={module.label} 
                key={module.value}
                extra={
                  // Modul szintű checkboxok
                  <div onClick={e => e.stopPropagation()}>
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
                    {moduleResources.resources.map(resource => (
                      <Panel header={resource.label} key={resource.value} className="ml-4">
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
                    ))}
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
