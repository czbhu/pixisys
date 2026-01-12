import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Alert, Typography } from 'antd';
import { settingsService } from '../../../services/settingsService';

const { Text } = Typography;

const EmailTemplatesPage: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    const data = await settingsService.getEmailTemplates();
    const arr = Array.isArray(data) ? data : ((data as any)?.results ?? []);
    setList(arr);
  };
  useEffect(() => { load(); }, []);

  const columns = [
    { title: 'Kulcs', dataIndex: 'key' },
    { title: 'Név', dataIndex: 'name' },
    { title: 'HTML', dataIndex: 'is_html', render: (v: boolean) => (v ? 'Igen' : 'Nem') },
    { title: 'Műveletek', render: (_: any, r: any) => <Button onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>Szerkesztés</Button> },
  ];

  const onSave = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await settingsService.updateEmailTemplate(editing.id, v);
      else await settingsService.createEmailTemplate(v);
      message.success('Mentve');
      setOpen(false); setEditing(null); form.resetFields(); load();
    } catch {
      message.error('Mentés sikertelen');
    }
  };

  return (
    <Card title="E-mail sablonok" extra={<Button onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>Új</Button>}>
  <Table rowKey="id" dataSource={Array.isArray(list) ? list : []} columns={columns as any} />
      <Modal title={editing ? 'Sablon szerkesztése' : 'Új sablon'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={800}>
        <Alert
          message="Rendelkezésre álló változók"
          description={
            <div>
              <Text code>{'{rfq_number}'}</Text> - Árajánlat száma<br />
              <Text code>{'{rfq_title}'}</Text> - Árajánlat címe<br />
              <Text code>{'{company_name}'}</Text> - Cég neve<br />
              <Text code>{'{contact_names}'}</Text> - Kapcsolattartók nevei (vagy "Ügyfelünk" ha nincs)<br />
              <Text code>{'{public_order_url}'}</Text> - Nyilvános megrendelő link
            </div>
          }
          type="info"
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" form={form}>
          <Form.Item label="Kulcs" name="key" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Név" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Tárgy sablon" name="subject_template" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Törzs sablon" name="body_template" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
          <Form.Item label="Alapértelmezett CC" name="default_cc" help="Email címek vesszővel elválasztva">
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>
          <Form.Item label="Alapértelmezett Reply-To" name="default_reply_to" help="Válaszcím">
            <Input placeholder="reply@example.com" />
          </Form.Item>
          <Form.Item label="HTML formátum" name="is_html" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="Leírás" name="description"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default EmailTemplatesPage;
