import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Space, Switch, message, Table, Modal, Select } from 'antd';
import api from '../../../services/api';
import { publicPortalService } from '../../../services/publicPortalService';

const PublicSitePage: React.FC = () => {
  const [form] = Form.useForm();
  const [userForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [portalUsers, setPortalUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [config, users, companyRes, contactRes] = await Promise.all([
        publicPortalService.getConfig(),
        publicPortalService.getPortalUsers(),
        api.get('/crm/companies/'),
        api.get('/crm/contacts/'),
      ]);
      form.setFieldsValue(config || {});
      setPortalUsers(Array.isArray(users) ? users : []);
      setCompanies(companyRes.data.results || companyRes.data || []);
      setContacts(contactRes.data.results || contactRes.data || []);
    } catch {
      message.error('Nem sikerült betölteni a publikus oldal beállításait');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await publicPortalService.updateConfig(values);
      message.success('Publikus oldal beállítások mentve');
      await loadData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error('Mentési hiba');
    }
  };

  const openCreateUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ is_active: true });
    setUserModalOpen(true);
  };

  const openEditUser = (record: any) => {
    setEditingUser(record);
    userForm.setFieldsValue({
      ...record,
      password: '',
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      const values = await userForm.validateFields();
      if (editingUser) {
        await publicPortalService.updatePortalUser(editingUser.id, values);
        message.success('Portál user frissítve');
      } else {
        await publicPortalService.createPortalUser(values);
        message.success('Portál user létrehozva');
      }
      setUserModalOpen(false);
      setEditingUser(null);
      userForm.resetFields();
      await loadData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error('Nem sikerült menteni a portál usert');
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Publikus oldal / Kliens portál beállítások" loading={loading}>
        <Form form={form} layout="vertical">
          <Form.Item name="public_domain" label="Publikus domain" tooltip="Pl.: public.pixisys.eu">
            <Input placeholder="public.pixisys.eu" />
          </Form.Item>
          <Form.Item name="portal_domain" label="Portál domain" tooltip="Pl.: portal.pixisys.eu (opcionális)">
            <Input placeholder="portal.pixisys.eu" />
          </Form.Item>
          <Form.Item name="site_title" label="Oldal címe" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="hero_title" label="Főcím" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="hero_subtitle" label="Alcím">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="primary_cta_text" label="CTA gomb szöveg">
            <Input />
          </Form.Item>
          <Form.Item name="primary_cta_url" label="CTA URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="calculators_enabled" label="Publikus kalkulátorok" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="portal_enabled" label="Kliens portál" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={handleSave}>Mentés</Button>
            <Button onClick={() => window.open('/site', '_blank')}>Publikus oldal megnyitása</Button>
            <Button onClick={() => window.open('/portal', '_blank')}>Portál megnyitása</Button>
          </Space>
        </Form>
      </Card>

      <Card title="Kliens portál felhasználók" extra={<Button onClick={openCreateUser}>Új portál user</Button>}>
        <Table
          rowKey="id"
          dataSource={portalUsers}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Név', dataIndex: 'full_name', key: 'full_name', width: 220 },
            { title: 'E-mail', dataIndex: 'email', key: 'email' },
            { title: 'Cég', dataIndex: 'company_name', key: 'company_name', width: 220 },
            { title: 'Kapcsolattartó', dataIndex: 'contact_name', key: 'contact_name', width: 220 },
            { title: 'Aktív', dataIndex: 'is_active', key: 'is_active', width: 100, render: (v: boolean) => (v ? 'Igen' : 'Nem') },
            {
              title: 'Művelet',
              key: 'actions',
              width: 120,
              render: (_: any, record: any) => <Button size="small" onClick={() => openEditUser(record)}>Szerkeszt</Button>,
            },
          ]}
        />
      </Card>

      <Modal
        title={editingUser ? 'Portál user szerkesztése' : 'Új portál user'}
        open={userModalOpen}
        onCancel={() => {
          setUserModalOpen(false);
          setEditingUser(null);
          userForm.resetFields();
        }}
        onOk={handleSaveUser}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={userForm} layout="vertical">
          <Form.Item name="full_name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="E-mail" rules={[{ required: true, type: 'email', message: 'Érvényes e-mail kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="Jelszó"
            rules={editingUser ? [] : [{ required: true, message: 'Kötelező' }]}
            tooltip={editingUser ? 'Csak akkor töltsd ki, ha jelszót is cserélsz' : ''}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="company" label="Cég">
            <Select
              allowClear
              options={companies.map((item: any) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Form.Item name="contact" label="Kapcsolattartó">
            <Select
              allowClear
              options={contacts.map((item: any) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default PublicSitePage;
