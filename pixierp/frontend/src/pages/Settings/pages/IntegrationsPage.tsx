import React, { useEffect, useState } from 'react';
import { Card, Button, Space, Alert, Typography, Form, Checkbox, Radio, Input, Select, Divider, Row, Col, Spin, message, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { settingsService } from '../../../services/settingsService';

const { Text } = Typography;

const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoiceCompanies, setInvoiceCompanies] = useState<any[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState<boolean>(false);
  const [progressVisible, setProgressVisible] = useState<boolean>(false);
  const [activeConfigId, setActiveConfigId] = useState<number | null>(null);

  const loadInvoiceCompanies = async () => {
    try {
      setInvoiceLoading(true);
      const resp = await api.get('/finance/pixinvoice/companies/');
      const data = resp.data?.companies || resp.data?.results || resp.data || [];
      const arr = Array.isArray(data) ? data : [];
      setInvoiceCompanies(arr);
      if (!arr.length) {
        message.warning('Nem érkezett Invoice cég lista (üres válasz).');
      }
    } catch (e: any) {
      setInvoiceCompanies([]);
      message.error(e?.response?.data?.error || e?.message || 'Hiba az Invoice cégek lekérésekor');
    } finally {
      setInvoiceLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      let savedSettings: any = null;
      try {
        const res = await api.get('/companies/');
        const list = res?.data?.results || res?.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      } catch (e) {
        setCompanies([]);
      }
      try {
        const configs = await settingsService.getPixinvoiceConfigs();
        if (!configs || configs.length === 0) {
          message.warning('Nincs PixInvoice konfiguráció mentve, ezért a céglista üres lehet.');
        }
        const active = (configs || []).find((c: any) => c.is_active) || configs?.[0];
        savedSettings = active?.sync_settings || null;
        setActiveConfigId(active?.id || null);
      } catch (e) {
        // ignore; loadInvoiceCompanies will show errors if any
      }

      await loadInvoiceCompanies();

      const initial = {
        entities: ['customers', 'suppliers', 'contacts'],
        strategy_type: 'newer',
        dominant_system: 'erp',
        frequency: 'manual',
        company_mappings: [{ erp_company_id: undefined, invoice_company_id: '' }],
      } as any;

      if (savedSettings) {
        initial.entities = savedSettings.entities || initial.entities;
        initial.strategy_type = savedSettings.strategy?.type === 'dominant' ? 'dominant' : 'newer';
        initial.dominant_system = savedSettings.strategy?.dominant_system || initial.dominant_system;
        initial.frequency = savedSettings.frequency || initial.frequency;
        const mapped = savedSettings.company_mappings || [];
        initial.company_mappings = (Array.isArray(mapped) && mapped.length > 0)
          ? mapped
          : initial.company_mappings;
      }

      form.setFieldsValue(initial);
    };
    bootstrap();
  }, [form]);

  const buildPayload = async () => {
    const values = await form.validateFields();
    return {
      entities: values.entities,
      strategy: values.strategy_type === 'dominant'
        ? { type: 'dominant', dominant_system: values.dominant_system }
        : { type: 'newer' },
      frequency: values.frequency,
      company_mappings: (values.company_mappings || []).filter((m: any) => m?.erp_company_id || m?.invoice_company_id),
    };
  };

  const syncPixinvoice = async () => {
    setLoading(true);
    setProgressVisible(true);
    setError(null);
    setResult(null);
    try {
      const payload = await buildPayload();
      const res = await api.post('/finance/sync/pixinvoice/', payload);
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Szinkron hiba');
    } finally {
      setLoading(false);
      setProgressVisible(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = await buildPayload();
      if (!activeConfigId) {
        message.error('Nincs aktív PixInvoice konfiguráció, nem lehet menteni.');
        return;
      }
      await settingsService.patchPixinvoiceConfig(activeConfigId, { sync_settings: payload });
      message.success('Beállítások elmentve.');
    } catch (e: any) {
      message.error(e?.response?.data?.error || e?.message || 'A beállítások mentése nem sikerült');
    } finally {
      setSaving(false);
    }
  };

  const strategyType = Form.useWatch('strategy_type', form);

  return (
    <Card title="Integrációk">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>PIXINVOICE</Text>
          <div style={{ marginTop: 12 }}>
            <Form layout="vertical" form={form}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label="Mit szinkronizáljunk?"
                    name="entities"
                    rules={[{ required: true, message: 'Válassz legalább egy elemet' }]}
                  >
                    <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Checkbox value="customers">Vevők</Checkbox>
                      <Checkbox value="suppliers">Beszállítók</Checkbox>
                      <Checkbox value="contacts">Kapcsolattartók</Checkbox>
                    </Checkbox.Group>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Szinkron stratégia" name="strategy_type">
                    <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Radio value="newer">Mindig a frissebb adat ír felül</Radio>
                      <Radio value="dominant">Domináns rendszer ír felül</Radio>
                    </Radio.Group>
                  </Form.Item>
                  {strategyType === 'dominant' && (
                    <Form.Item
                      label="Domináns rendszer"
                      name="dominant_system"
                      tooltip="Csak akkor számít, ha a domináns opciót választod"
                    >
                      <Select options={[{ value: 'erp', label: 'ERP' }, { value: 'invoice', label: 'Invoice' }]} />
                    </Form.Item>
                  )}
                </Col>
                <Col span={8}>
                  <Form.Item label="Gyakoriság" name="frequency">
                    <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Radio value="continuous">Folyamatos (változáskor szinkron)</Radio>
                      <Radio value="manual">Manuális (gombnyomásra)</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>

              <Divider>Vállalat párosítás</Divider>
              <Space style={{ marginBottom: 8 }}>
                <Button size="small" onClick={loadInvoiceCompanies} loading={invoiceLoading}>
                  Invoice cégek frissítése
                </Button>
              </Space>
              <Form.List name="company_mappings">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {fields.map((field) => (
                      <Row gutter={12} key={field.key} align="middle">
                        <Col span={10}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'erp_company_id']}
                            fieldKey={[field.fieldKey!, 'erp_company_id']}
                            label="ERP cég"
                          >
                            <Select
                              placeholder="Válassz ERP céget"
                              showSearch
                              optionFilterProp="children"
                              options={(companies || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.tax_number || c.taxNumber || ''})` }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={10}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'invoice_company_id']}
                            fieldKey={[field.fieldKey!, 'invoice_company_id']}
                            label="Invoice cég"
                          >
                            <Select
                              placeholder="Válassz Invoice céget"
                              showSearch
                              optionFilterProp="children"
                              loading={invoiceLoading}
                              notFoundContent={invoiceLoading ? <Spin size="small" /> : 'Nincs adat'}
                              options={(invoiceCompanies || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.tax_number || c.taxNumber || ''})` }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={4} style={{ display: 'flex', alignItems: 'center' }}>
                          <Button danger onClick={() => remove(field.name)} disabled={fields.length === 1}>
                            Törlés
                          </Button>
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" onClick={() => add({ erp_company_id: undefined, invoice_company_id: '' })}>
                      Új párosítás hozzáadása
                    </Button>
                  </Space>
                )}
              </Form.List>

              <Divider />
              <Space>
                <Button type="primary" loading={loading} onClick={syncPixinvoice}>
                  Szinkronizálás most
                </Button>
                <Button loading={saving} onClick={saveSettings}>
                  Mentés
                </Button>
                <Button onClick={() => navigate('/settings/pixinvoice')}>
                  Beállítások megnyitása
                </Button>
              </Space>
            </Form>
          </div>
        </div>
        {error && <Alert type="error" message={error} />}
        {result && (
          <Alert
            type="success"
            message="Szinkron kész"
            description={
              <div>
                <div>Számlák: létrehozva {result.invoices?.created || 0}, frissítve {result.invoices?.updated || 0}</div>
                <div>Kifizetések: létrehozva {result.payments?.created || 0}, frissítve {result.payments?.updated || 0}</div>
                {result.settings && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Beállítások rögzítve: {JSON.stringify(result.settings)}
                  </div>
                )}
              </div>
            }
            showIcon
          />
        )}
      </Space>

      <Modal open={progressVisible} footer={null} closable={false} centered>
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <Spin size="large" />
          <div style={{ fontWeight: 600 }}>Szinkronizálás folyamatban...</div>
          <div style={{ color: '#666' }}>Kérjük, ne zárd be az ablakot.</div>
        </Space>
      </Modal>
    </Card>
  );
};

export default IntegrationsPage;
