import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import { publicPortalService } from '../../services/publicPortalService';

const { Title } = Typography;

const ClientPortal: React.FC = () => {
  const navigate = useNavigate();
  const [portalUser, setPortalUser] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingTicket, setSavingTicket] = useState(false);
  const [ticketForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const me = await publicPortalService.me();
      setPortalUser(me?.user || null);
      const dashboard = await publicPortalService.getDashboard();
      setData(dashboard || {});
    } catch {
      localStorage.removeItem('portal_access_token');
      message.warning('A portál session lejárt, kérlek jelentkezz be újra');
      navigate('/site');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('portal_access_token');
    if (!token) {
      navigate('/site');
      return;
    }
    load();
  }, []);

  const handleLogout = async () => {
    try {
      await publicPortalService.logout();
    } catch {
      // no-op
    }
    localStorage.removeItem('portal_access_token');
    navigate('/site');
  };

  const submitTicket = async () => {
    try {
      const values = await ticketForm.validateFields();
      setSavingTicket(true);
      await publicPortalService.createTicket({
        title: values.title,
        body_html: values.body_html,
        ticket_type: values.ticket_type,
        priority: values.priority,
      });
      message.success('Jegy sikeresen elküldve');
      ticketForm.resetFields();
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || 'Nem sikerült jegyet küldeni');
    } finally {
      setSavingTicket(false);
    }
  };

  return (
    <div style={{ maxWidth: 1260, margin: '0 auto', padding: 24 }}>
      <Card loading={loading}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={3} style={{ margin: 0 }}>Kliens portál</Title>
          <Space>
            <Tag color="blue">{portalUser?.email || '-'}</Tag>
            <Button onClick={() => navigate('/site')}>Publikus oldal</Button>
            <Button onClick={handleLogout}>Kijelentkezés</Button>
          </Space>
        </Space>
      </Card>

      {!portalUser && !loading ? (
        <Alert style={{ marginTop: 16 }} type="warning" showIcon message="Nincs aktív portál bejelentkezés" />
      ) : null}

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Árajánlatok">
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={data?.quotes || []}
              columns={[
                { title: 'Szám', key: 'number', render: (_: any, record: any) => record.number || record.request_number || '-' },
                { title: 'Cím', dataIndex: 'title', key: 'title' },
                { title: 'Státusz', dataIndex: 'status', key: 'status', width: 120 },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Megrendelések">
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={data?.orders || []}
              columns={[
                { title: 'Megr. szám', dataIndex: 'order_number', key: 'order_number' },
                { title: 'Státusz', dataIndex: 'status', key: 'status', width: 120 },
                { title: 'Szállítólevél', dataIndex: 'delivery_note_number', key: 'delivery_note_number', width: 160 },
                { title: 'Számla', dataIndex: 'invoice_number', key: 'invoice_number', width: 160 },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Szállítólevelek">
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={data?.delivery_notes || []}
              columns={[
                { title: 'Szám', dataIndex: 'delivery_note_number', key: 'delivery_note_number' },
                {
                  title: 'Státusz',
                  key: 'is_confirmed',
                  width: 120,
                  render: (_: any, record: any) => (record.is_confirmed ? <Tag color="green">Visszaigazolt</Tag> : <Tag color="orange">Nyitott</Tag>),
                },
                {
                  title: 'Publikus link',
                  key: 'link',
                  render: (_: any, record: any) => record.public_token ? <a href={`/public/delivery-note/${record.public_token}`} target="_blank" rel="noreferrer">Megnyit</a> : '-',
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Számlák">
            <Table
              rowKey={(record: any) => `${record.order_number}-${record.invoice_number}`}
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={data?.invoices || []}
              columns={[
                { title: 'Számla szám', dataIndex: 'invoice_number', key: 'invoice_number' },
                { title: 'Megr. szám', dataIndex: 'order_number', key: 'order_number' },
                { title: 'Státusz', dataIndex: 'status', key: 'status', width: 120 },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Jegyek (reklamáció / ajánlatkérés)">
            <Form form={ticketForm} layout="vertical">
              <Form.Item name="title" label="Jegy címe" rules={[{ required: true, message: 'Kötelező' }]}>
                <Input placeholder="Rövid összefoglaló" />
              </Form.Item>
              <Form.Item name="ticket_type" label="Típus" initialValue="complaint">
                <Select
                  options={[
                    { value: 'complaint', label: 'Reklamáció' },
                    { value: 'task', label: 'Ajánlatkérés' },
                    { value: 'other', label: 'Egyéb' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="priority" label="Prioritás" initialValue="normal">
                <Select
                  options={[
                    { value: 'low', label: 'Alacsony' },
                    { value: 'normal', label: 'Normál' },
                    { value: 'high', label: 'Magas' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="body_html" label="Üzenet" rules={[{ required: true, message: 'Kötelező' }]}>
                <Input.TextArea rows={5} placeholder="Írd le részletesen az igényt vagy problémát" />
              </Form.Item>
              <Button type="primary" loading={savingTicket} onClick={submitTicket}>Jegy elküldése</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Korábbi jegyek">
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={data?.tickets || []}
              columns={[
                { title: 'Jegyszám', dataIndex: 'ticket_number', key: 'ticket_number', width: 140 },
                { title: 'Cím', dataIndex: 'title', key: 'title' },
                { title: 'Státusz', dataIndex: 'status', key: 'status', width: 120 },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ClientPortal;
