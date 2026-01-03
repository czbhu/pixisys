import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, message, Space, Divider, Modal } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { settingsService } from '../../../services/settingsService';

const EmailServerPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [testEmailModalVisible, setTestEmailModalVisible] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await settingsService.getEmailServers();
      const arr = Array.isArray(list) ? list : (list?.results ?? []);
      if (arr && arr.length) {
        const cfg = arr[0];
        setCurrentId(cfg.id);
        form.setFieldsValue(cfg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    try {
      if (currentId) await settingsService.updateEmailServer(currentId, v);
      else await settingsService.createEmailServer(v);
      message.success('Mentve');
      load();
    } catch {
      message.error('Mentés sikertelen');
    }
  };

  const handleSendTestEmail = async () => {
    if (!currentId) {
      message.error('Először mentse el az email szerver beállításokat');
      return;
    }
    
    if (!testEmailRecipient) {
      message.error('Adja meg a teszt email címzettet');
      return;
    }
    
    setSendingTest(true);
    setTestLog(['Email küldés folyamatban...']);
    
    try {
      const result = await settingsService.sendTestEmail(currentId, testEmailRecipient);
      
      if (result.success) {
        setTestLog(result.log || []);
        message.success(result.message || 'Teszt email sikeresen elküldve');
      } else {
        setTestLog(result.log || [result.error]);
        message.error(result.error || 'Hiba a teszt email küldése során');
      }
    } catch (error: any) {
      const errorLog = error.response?.data?.log || [error.message];
      const errorTrace = error.response?.data?.traceback;
      
      if (errorTrace) {
        errorLog.push('', 'Részletes hiba:', errorTrace);
      }
      
      setTestLog(errorLog);
      message.error(error.response?.data?.error || 'Hiba a teszt email küldése során');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <Card title="E-mail szerver" loading={loading}>
        <Form layout="vertical" form={form}>
          <Form.Item label="Név" name="name"><Input /></Form.Item>
          <Form.Item label="Feladó név" name="from_name"><Input /></Form.Item>
          <Form.Item label="Feladó e-mail" name="from_email" rules={[{ type: 'email' }]}><Input /></Form.Item>
          <Form.Item label="SMTP host" name="smtp_host" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="SMTP port" name="smtp_port"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="SMTP felhasználó" name="smtp_username"><Input /></Form.Item>
          <Form.Item label="SMTP jelszó" name="smtp_password"><Input.Password /></Form.Item>
          <Form.Item label="TLS" name="smtp_use_tls" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="SSL" name="smtp_use_ssl" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="IMAP host" name="imap_host"><Input /></Form.Item>
          <Form.Item label="IMAP port" name="imap_port"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="IMAP felhasználó" name="imap_username"><Input /></Form.Item>
          <Form.Item label="IMAP jelszó" name="imap_password"><Input.Password /></Form.Item>
          <Form.Item label="Sent mappa" name="imap_sent_folder"><Input /></Form.Item>
          <Form.Item label="Aktív" name="is_active" valuePropName="checked"><Switch /></Form.Item>
          
          <Space>
            <Button type="primary" onClick={onSave}>Mentés</Button>
            <Button 
              icon={<SendOutlined />}
              onClick={() => setTestEmailModalVisible(true)}
              disabled={!currentId}
            >
              Teszt Email Küldése
            </Button>
          </Space>
        </Form>
      </Card>

      <Modal
        title="Teszt Email Küldése"
        open={testEmailModalVisible}
        onCancel={() => {
          setTestEmailModalVisible(false);
          setTestLog([]);
          setTestEmailRecipient('');
        }}
        footer={[
          <Button key="cancel" onClick={() => setTestEmailModalVisible(false)}>
            Bezárás
          </Button>,
          <Button 
            key="send" 
            type="primary" 
            icon={<SendOutlined />}
            loading={sendingTest}
            onClick={handleSendTestEmail}
          >
            Küldés
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item 
            label="Címzett email címe" 
            required
            help="Ide fog érkezni a teszt email"
          >
            <Input
              type="email"
              placeholder="pelda@email.hu"
              value={testEmailRecipient}
              onChange={(e) => setTestEmailRecipient(e.target.value)}
              disabled={sendingTest}
            />
          </Form.Item>
        </Form>

        {testLog.length > 0 && (
          <>
            <Divider>Küldési folyamat log</Divider>
            <div style={{ 
              background: '#f5f5f5', 
              padding: '12px', 
              borderRadius: '4px',
              maxHeight: '300px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap'
            }}>
              {testLog.map((log, index) => (
                <div key={index} style={{ 
                  marginBottom: '4px',
                  color: log.includes('HIBA') || log.includes('Error') ? '#ff4d4f' : '#000'
                }}>
                  {log}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
};

export default EmailServerPage;
