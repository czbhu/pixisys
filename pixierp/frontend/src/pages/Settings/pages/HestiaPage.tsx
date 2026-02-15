import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Switch, Button, Select, message, Space, Alert } from 'antd';
import { SaveOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { settingsService } from '../../../services/settingsService';

type TestLogEntry = {
  success: boolean;
  mode?: string;
  message: string;
  details?: string;
  hint?: string;
  testedAt: string;
};

const HestiaPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [trustingHostKey, setTrustingHostKey] = useState(false);
  const [loadingPublicKey, setLoadingPublicKey] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [testLog, setTestLog] = useState<TestLogEntry | null>(null);
  const [publicKey, setPublicKey] = useState('');
  const mode = Form.useWatch('mode', form);

  const load = async () => {
    setLoading(true);
    try {
      const list = await settingsService.getHestiaConfigs();
      const current = list?.[0];
      if (current) {
        setCurrentId(current.id);
        form.setFieldsValue({
          ...current,
          cli_bin_path: current.cli_bin_path || '/usr/local/hestia/bin',
          ssh_port: current.ssh_port || 22,
        });
      } else {
        setCurrentId(null);
        form.setFieldsValue({
          name: 'Alapértelmezett Hestia',
          is_active: true,
          mode: 'cli',
          default_domain: '',
          hestia_user: '',
          cli_bin_path: '/usr/local/hestia/bin',
          cli_use_sudo: false,
          cli_sudo_runner: '',
          ssh_enabled: true,
          ssh_host: '',
          ssh_port: 22,
          ssh_user: '',
          ssh_private_key_path: '',
          ssh_strict_host_key: true,
          rest_api_url: '',
          rest_api_user: '',
          rest_api_password: '',
        });
      }
    } catch (e: any) {
      message.error(e?.message || 'Nem sikerült betölteni a Hestia beállításokat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (currentId) {
        await settingsService.updateHestiaConfig(currentId, values);
      } else {
        const created = await settingsService.createHestiaConfig(values);
        setCurrentId(created.id);
      }
      message.success('Hestia beállítások mentve.');
      await load();
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || e?.message || 'Mentési hiba.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!currentId) {
      message.warning('Előbb mentse a konfigurációt, utána tesztelhető.');
      return;
    }

    try {
      setTesting(true);
      const result = await settingsService.testHestiaConfig(currentId);
      setTestLog({
        success: Boolean(result?.success),
        mode: result?.mode,
        message: result?.message || 'Hestia teszt sikeres.',
        details: result?.details,
        hint: result?.hint,
        testedAt: new Date().toLocaleString('hu-HU'),
      });
      if (result?.success) {
        message.success(result?.message || 'Hestia teszt sikeres.');
      } else {
        message.error(result?.message || 'Hestia teszt sikertelen.');
      }
    } catch (e: any) {
      const data = e?.response?.data;
      setTestLog({
        success: false,
        mode: data?.mode,
        message: data?.message || 'Hestia teszt hiba.',
        details: data?.details || data?.technical_error || e?.message,
        hint: data?.hint,
        testedAt: new Date().toLocaleString('hu-HU'),
      });
      message.error(data?.details || data?.message || e?.message || 'Hestia teszt hiba.');
    } finally {
      setTesting(false);
    }
  };

  const handleGenerateSshKey = async () => {
    if (!currentId) {
      message.warning('Előbb mentse a konfigurációt, utána generálható kulcs.');
      return;
    }
    try {
      setGeneratingKey(true);
      const result = await settingsService.generateHestiaSshKey(currentId, true);
      if (result?.private_key_path) {
        form.setFieldsValue({ ssh_private_key_path: result.private_key_path });
      }
      if (result?.public_key) {
        setPublicKey(result.public_key);
      }
      message.success(result?.message || 'SSH kulcs automatikusan újragenerálva.');
    } catch (e: any) {
      const data = e?.response?.data;
      message.error(data?.details || data?.message || e?.message || 'SSH kulcsgenerálás hiba.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleTrustHostKey = async () => {
    if (!currentId) {
      message.warning('Előbb mentse a konfigurációt.');
      return;
    }
    try {
      setTrustingHostKey(true);
      const result = await settingsService.trustHestiaHostKey(currentId);
      message.success(result?.message || 'SSH host kulcs mentve.');
    } catch (e: any) {
      const data = e?.response?.data;
      message.error(data?.details || data?.message || e?.message || 'SSH host kulcs mentése sikertelen.');
    } finally {
      setTrustingHostKey(false);
    }
  };

  const handleLoadPublicKey = async () => {
    if (!currentId) {
      message.warning('Előbb mentse a konfigurációt.');
      return;
    }
    try {
      setLoadingPublicKey(true);
      const result = await settingsService.getHestiaPublicKey(currentId);
      setPublicKey(result?.public_key || '');
      message.success('Publikus kulcs betöltve.');
    } catch (e: any) {
      const data = e?.response?.data;
      message.error(data?.message || e?.message || 'Nem sikerült betölteni a publikus kulcsot.');
    } finally {
      setLoadingPublicKey(false);
    }
  };

  const handleCopyPublicKey = async () => {
    if (!publicKey) {
      message.warning('Nincs másolható publikus kulcs.');
      return;
    }
    try {
      await navigator.clipboard.writeText(publicKey);
      message.success('Publikus kulcs a vágólapra másolva.');
    } catch {
      message.error('Nem sikerült másolni a vágólapra.');
    }
  };

  return (
    <Card
      title="Hestia integráció"
      loading={loading}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>
          <Button icon={<CheckCircleOutlined />} loading={testing} onClick={handleTest}>Teszt</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>Mentés</Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="A HR > Alkalmazottak > E-mail Generál gomb ezeket a beállításokat használja postafiók létrehozásához."
      />

      {testLog && (
        <Alert
          style={{ marginBottom: 16 }}
          showIcon
          type={testLog.success ? 'success' : 'error'}
          message={`Teszt eredmény (${testLog.testedAt})`}
          description={
            <div>
              <div><strong>Mód:</strong> {testLog.mode || '-'}</div>
              <div><strong>Üzenet:</strong> {testLog.message}</div>
              {testLog.details && (
                <div style={{ marginTop: 8 }}>
                  <strong>Részletek:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0 0' }}>{testLog.details}</pre>
                </div>
              )}
              {testLog.hint && (
                <div style={{ marginTop: 8 }}>
                  <strong>Javaslat:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0 0' }}>{testLog.hint}</pre>
                </div>
              )}
            </div>
          }
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Konfiguráció neve" rules={[{ required: true, message: 'Kötelező mező' }]}>
          <Input placeholder="Alapértelmezett Hestia" />
        </Form.Item>

        <Form.Item name="is_active" label="Aktív" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item name="mode" label="Integráció mód" rules={[{ required: true, message: 'Kötelező mező' }]}>
          <Select
            options={[
              { value: 'cli', label: 'CLI' },
              { value: 'rest', label: 'REST API' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="default_domain"
          label="Alapértelmezett e-mail domain"
          rules={[{ required: true, message: 'Kötelező mező' }]}
        >
          <Input placeholder="pixisys.eu" />
        </Form.Item>

        <Form.Item
          name="hestia_user"
          label="Hestia user (domain tulajdonos)"
          rules={[{ required: true, message: 'Kötelező mező' }]}
        >
          <Input placeholder="pl. ceze (akihez a mail domain tartozik)" />
        </Form.Item>

        {mode === 'cli' && (
          <>
            <Form.Item
              name="cli_bin_path"
              label={
                <Space>
                  <span>Hestia bin útvonal</span>
                  <Button
                    size="small"
                    onClick={() => form.setFieldsValue({ cli_bin_path: '/usr/local/hestia/bin' })}
                  >
                    Reset
                  </Button>
                </Space>
              }
              rules={[{ required: true, message: 'Kötelező mező' }]}
            >
              <Input placeholder="/usr/local/hestia/bin" />
            </Form.Item>

            <Form.Item name="cli_use_sudo" label="CLI futtatás sudo-val" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Form.Item name="cli_sudo_runner" label="Sudo futtató user (opcionális)">
              <Input placeholder="hagyd üresen = root, ne legyen ugyanaz mint SSH user" />
            </Form.Item>

            <Form.Item name="ssh_enabled" label="Távoli SSH futtatás" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Form.Item name="ssh_host" label="SSH host">
              <Input placeholder="hestia.szerver.tld" />
            </Form.Item>

            <Form.Item name="ssh_port" label="SSH port">
              <Input type="number" placeholder="22" />
            </Form.Item>

            <Form.Item name="ssh_user" label="SSH user (bejelentkezési user)">
              <Input placeholder="pl. ceze vagy root" />
            </Form.Item>

            <Form.Item name="ssh_private_key_path" label="SSH private key útvonal (opcionális)">
              <Input placeholder="/home/www-data/.ssh/id_ed25519" />
            </Form.Item>

            <Space style={{ marginBottom: 16 }}>
              <Button loading={generatingKey} onClick={handleGenerateSshKey}>SSH key generálás</Button>
              <Button loading={trustingHostKey} onClick={handleTrustHostKey}>Host kulcs mentése</Button>
              <Button loading={loadingPublicKey} onClick={handleLoadPublicKey}>Publikus kulcs betöltése</Button>
            </Space>

            {publicKey && (
              <Form.Item label="Publikus kulcs (másold be Hestia > Manage SSH Keys felületre)">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input.TextArea value={publicKey} rows={4} readOnly />
                  <Button onClick={handleCopyPublicKey}>Másolás</Button>
                </Space>
              </Form.Item>
            )}

            <Form.Item name="ssh_strict_host_key" label="SSH StrictHostKeyChecking" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        )}

        {mode === 'rest' && (
          <>
            <Form.Item name="rest_api_url" label="REST API URL" rules={[{ required: true, message: 'Kötelező mező' }]}>
              <Input placeholder="https://hestia.example.com:8083/api/" />
            </Form.Item>

            <Form.Item name="rest_api_user" label="REST API user" rules={[{ required: true, message: 'Kötelező mező' }]}>
              <Input placeholder="Hestia API user" />
            </Form.Item>

            <Form.Item name="rest_api_password" label="REST API jelszó" rules={[{ required: true, message: 'Kötelező mező' }]}>
              <Input.Password placeholder="Hestia API jelszó" />
            </Form.Item>
          </>
        )}
      </Form>
    </Card>
  );
};

export default HestiaPage;
