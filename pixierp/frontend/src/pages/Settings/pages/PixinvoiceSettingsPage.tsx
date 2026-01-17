import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, Space, Alert, Table, Switch, Typography, message, Modal, Select } from 'antd';
import { settingsService } from '../../../services/settingsService';

const { Text } = Typography;

interface PixinvoiceConfig {
  id?: number;
  name: string;
  base_url: string;
  company_id?: string;
  api_key?: string;
  default_invoice_series_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const PixinvoiceSettingsPage: React.FC = () => {
  const [form] = Form.useForm<PixinvoiceConfig>();
  const [items, setItems] = useState<PixinvoiceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupTax, setLookupTax] = useState('');
  const [lookupData, setLookupData] = useState<any>(null);
  const [invoiceSeries, setInvoiceSeries] = useState<any[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesCache, setSeriesCache] = useState<Record<number, any[]>>({});

  const activeItem = useMemo(() => items.find(i => i.is_active) || items[0], [items]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await settingsService.getPixinvoiceConfigs();
      setItems(list);
      
      // Load invoice series for all configs with default_invoice_series_id
      const newSeriesCache: Record<number, any[]> = {};
      for (const config of list) {
        if (config.id && config.default_invoice_series_id) {
          try {
            const res = await settingsService.getPixinvoiceInvoiceSeries(config.id);
            if (res.ok && res.series) {
              newSeriesCache[config.id] = res.series;
            }
          } catch (e) {
            // Silently fail for individual configs
          }
        }
      }
      setSeriesCache(newSeriesCache);
      
      if (list.length) {
        const it = list.find((i:any) => i.is_active) || list[0];
        form.setFieldsValue({
          id: it.id,
          name: it.name,
          base_url: it.base_url,
          company_id: (it as any).company_id,
          default_invoice_series_id: (it as any).default_invoice_series_id,
          is_active: it.is_active,
          api_key: '',
        } as any);
      } else {
        form.resetFields();
        form.setFieldsValue({ name: 'Alapértelmezett', base_url: 'http://localhost:4001/api/', company_id: '', is_active: true });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadInvoiceSeries = async (configId: number) => {
    setSeriesLoading(true);
    try {
      const res = await settingsService.getPixinvoiceInvoiceSeries(configId);
      if (res.ok && res.series) {
        setInvoiceSeries(res.series || []);
        // Update cache
        setSeriesCache(prev => ({ ...prev, [configId]: res.series || [] }));
        if (res.series.length > 0) {
          message.success(`${res.series.length} számlatömb betöltve`);
        } else {
          message.warning('Nincs elérhető számlatömb');
        }
      } else {
        message.error(res.error || 'Hiba a számlatömbök lekérdezésekor');
      }
    } catch (e: any) {
      message.error('Hiba: ' + (e.response?.data?.error || e.message));
    } finally {
      setSeriesLoading(false);
    }
  };

  const onSave = async () => {
    const values = await form.validateFields();
    try {
      if (values.id) {
        await settingsService.updatePixinvoiceConfig(values.id, values);
        message.success('Beállítás frissítve');
      } else {
        await settingsService.createPixinvoiceConfig(values);
        message.success('Beállítás létrehozva');
      }
      await load();
    } catch (e:any) {
      message.error(e?.response?.data?.error || e.message || 'Mentési hiba');
    }
  };

  const onTest = async (id?: number) => {
    const cfgId = id || form.getFieldValue('id');
    if (!cfgId) { message.warning('Előbb mentsd a beállítást'); return; }
    setTestingId(cfgId);
    setTestResult(null);
    try {
      const res = await settingsService.testPixinvoiceConnection(cfgId);
      setTestResult(res);
    } catch (e:any) {
      setTestResult({ ok: false, error: e?.response?.data?.error || e.message });
    } finally {
      setTestingId(null);
    }
  };

  const onLookup = async () => {
    if (!lookupTax?.trim()) { message.warning('Adj meg egy adószámot'); return; }
    setLookupLoading(true);
    setLookupData(null);
    try {
      const res = await settingsService.lookupTaxpayer(lookupTax.trim());
      setLookupData(res);
    } catch (e:any) {
      setLookupData({ success: false, error: e?.response?.data?.error || e.message });
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <Card title="PIXINVOICE beállítások">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Form form={form} layout="vertical" initialValues={{ is_active: true }} autoComplete="off">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item label="Név" name="name" rules={[{ required: true, message: 'Név kötelező' }]}>
            <Input placeholder="Alapértelmezett" />
          </Form.Item>
          <Form.Item label="API alap URL" name="base_url" rules={[{ required: true, message: 'URL kötelező' }]}>
            <Input placeholder="http://localhost:4001/api/" />
          </Form.Item>
          <Form.Item label="Cég azonosító (company_id)" name="company_id" tooltip="Opcionális. Ha nincs megadva, a PixInvoice API a kulcs jogosultságai alapján listáz.">
            <Input 
              placeholder="<cég UUID> (opcionális)" 
              autoComplete="off"
              onChange={(e) => {
                const configId = form.getFieldValue('id');
                if (configId && e.target.value) {
                  loadInvoiceSeries(configId);
                }
              }}
            />
          </Form.Item>
          <Form.Item label="API kulcs" name="api_key" tooltip="Csak íráskor használjuk, az értéket nem listázzuk vissza.">
            <Input.Password placeholder="••••••••" />
          </Form.Item>
          <Form.Item 
            label="Alapértelmezett számlatömb" 
            name="default_invoice_series_id" 
            tooltip="A számlatömb amit használni szeretnél a számlázáshoz"
          >
            <Select 
              placeholder="-- Nincs kiválasztva --"
              loading={seriesLoading}
              disabled={seriesLoading || invoiceSeries.length === 0}
              notFoundContent={seriesLoading ? "Betöltés..." : "Nincs elérhető számlatömb"}
              style={{ width: '100%' }}
            >
              {invoiceSeries.map((series: any) => (
                <Select.Option key={series.id} value={series.id}>
                  {series.company_name} - {series.name} ({series.prefix}) - Következő: {series.current_number}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Aktív" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={onSave}>Mentés</Button>
            <Button onClick={() => onTest() } loading={!!testingId}>Kapcsolat teszt</Button>
            <Button 
              onClick={() => {
                const configId = form.getFieldValue('id');
                if (configId) {
                  loadInvoiceSeries(configId);
                } else {
                  message.warning('Először mentse el a konfigurációt');
                }
              }}
              loading={seriesLoading}
            >
              Számlatömbök betöltése
            </Button>
            <Button onClick={() => { setLookupOpen(true); setLookupTax(''); setLookupData(null); }}>NAV céglekérdezés</Button>
          </Space>
        </Form>

        {testResult && (
          testResult.ok ? (
            <Alert type="success" message="Kapcsolat rendben" description={<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(testResult, null, 2)}</pre>} />
          ) : (
            <Alert
              type="error"
              message="Teszt sikertelen"
              description={
                <div>
                  {testResult.base && (
                    <div>Nem elérhető az API host: <Text code>{testResult.base}</Text></div>
                  )}
                  <div style={{ marginTop: 8 }}>{testResult.hint || testResult.error}</div>
                </div>
              }
            />
          )
        )}

        <div>
          <Text strong>Elmentett konfigurációk</Text>
          <Table
            rowKey="id"
            dataSource={items}
            loading={loading}
            pagination={false}
            columns={[
              { title: 'Név', dataIndex: 'name' },
              { title: 'Alap URL', dataIndex: 'base_url' },
              { title: 'Cég azonosító', dataIndex: 'company_id' as any },
              { 
                title: 'Alapért. számlatömb', 
                dataIndex: 'default_invoice_series_id' as any,
                render: (value: string, rec: PixinvoiceConfig) => {
                  if (!value) return '-';
                  const series = seriesCache[rec.id!];
                  if (!series) return value; // Show ID if series not loaded
                  const selectedSeries = series.find((s: any) => s.id === value);
                  if (selectedSeries) {
                    return `${selectedSeries.name} (${selectedSeries.prefix}-${selectedSeries.current_number})`;
                  }
                  return value;
                }
              },
              { 
                title: 'Alapértelmezett', 
                dataIndex: 'is_active', 
                render: (v:boolean) => v ? <Text strong style={{ color: '#52c41a' }}>Igen</Text> : 'Nem' 
              },
              { title: 'Műveletek', render: (_:any, rec:PixinvoiceConfig) => (
                <Space>
                  <Button onClick={() => { form.setFieldsValue({ ...rec, api_key: '' }); setTestResult(null); }}>Szerkesztés</Button>
                  <Button onClick={() => onTest(rec.id)} loading={testingId === rec.id}>Teszt</Button>
                  {!rec.is_active && (
                    <Button onClick={async () => {
                      try {
                        await settingsService.patchPixinvoiceConfig(rec.id!, { is_active: true });
                        message.success('Aktiválva');
                        await load();
                      } catch {
                        message.error('Aktiválás sikertelen');
                      }
                    }}>Aktiválás</Button>
                  )}
                </Space>
              )}
            ]}
          />
        </div>

        <Modal
          title="NAV céglekérdezés (adószám)"
          open={lookupOpen}
          onCancel={() => setLookupOpen(false)}
          onOk={onLookup}
          okText="Lekérdezés"
          confirmLoading={lookupLoading}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="Adószám" value={lookupTax} onChange={(e) => setLookupTax(e.target.value)} />
            {lookupData && (
              lookupData.success ? (
                <Alert type="success" message="Sikeres lekérdezés" description={<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(lookupData.data, null, 2)}</pre>} />
              ) : (
                <Alert type="error" message="Hiba a lekérdezésben" description={lookupData.error} />
              )
            )}
          </Space>
        </Modal>
      </Space>
    </Card>
  );
};

export default PixinvoiceSettingsPage;
