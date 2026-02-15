import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Input,
  Button,
  Space,
  message,
  Tag,
  Table,
  Form,
  Select,
  Switch,
  InputNumber,
  Tabs,
  Divider,
} from 'antd';
import {
  ApiOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  famApi,
  getFamBaseUrl,
  getFamSystemId,
  setFamBaseUrl,
  setFamSystemId,
} from '../../services/famApi';

const { Title, Text } = Typography;

const FAM: React.FC = () => {
  const [baseUrl, setBaseUrlState] = useState(getFamBaseUrl());
  const [systemId, setSystemIdState] = useState(getFamSystemId());

  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [taxpayerInput, setTaxpayerInput] = useState('');
  const [taxpayerResult, setTaxpayerResult] = useState<any>(null);

  const [currencyForm] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [eventForm] = Form.useForm();
  const [navConfigForm] = Form.useForm();
  const [documentForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [status, eventRes, errorRes, docsRes, readinessRes, navConfigRes] = await Promise.all([
        famApi.getSystemStatus(systemId),
        famApi.getEventLogs(systemId, 300),
        famApi.getErrorLogs(systemId, 300),
        famApi.getDocuments(systemId, undefined, 300),
        famApi.getReadiness(systemId),
        famApi.getNavConfig(systemId),
      ]);
      setStatusData(status);
      setEvents(eventRes?.events || []);
      setErrors(errorRes?.errors || []);
      setDocuments(docsRes?.documents || []);
      setReadiness(readinessRes || null);
      if (navConfigRes?.config) {
        navConfigForm.setFieldsValue(navConfigRes.config);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || error?.message || 'FAM adatbetöltési hiba');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveConnectionSettings = async () => {
    setFamBaseUrl(baseUrl);
    setFamSystemId(systemId);
    message.success('FAM kapcsolat mentve');
    await loadAll();
  };

  const handleSaveNavConfig = async (values: any) => {
    try {
      await famApi.saveNavConfig(systemId, {
        mode: values.mode,
        env: values.env,
        connector: values.connector || 'cloud_fam',
        base_url: values.base_url || '',
        api_key: values.api_key || '',
        live_submit_path: values.live_submit_path || '/api/customers/submit_document/',
        live_taxpayer_path: values.live_taxpayer_path || '/api/customers/lookup_taxpayer/',
        hepg_base_url: values.hepg_base_url || '',
        hepg_submit_path: values.hepg_submit_path || '/api/v1/receipt',
        hepg_api_key: values.hepg_api_key || '',
        hepg_device_id: values.hepg_device_id || '',
        tech_user: values.tech_user || '',
        tech_password: values.tech_password || '',
        signing_key_ref: values.signing_key_ref || '',
        exchange_key_ref: values.exchange_key_ref || '',
        invoice_enabled: !!values.invoice_enabled,
        ereceipt_enabled: !!values.ereceipt_enabled,
        timeout_sec: values.timeout_sec || 20,
        retry_limit: values.retry_limit || 3,
      });
      message.success('NAV konfiguráció mentve');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'NAV konfiguráció mentési hiba');
    }
  };

  const handleHello = async () => {
    try {
      await famApi.telemetryHello(systemId);
      message.success('HELLO elküldve');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'HELLO hiba');
    }
  };

  const handleOpenDay = async () => {
    try {
      await famApi.openDay(systemId);
      message.success('Adóügyi nap megnyitva');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Napnyitás hiba');
    }
  };

  const handleCloseDay = async () => {
    try {
      await famApi.closeDay(systemId);
      message.success('Adóügyi nap lezárva');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Napzárás hiba');
    }
  };

  const handleQueryTaxpayer = async () => {
    try {
      const response = await famApi.queryTaxpayer(systemId, taxpayerInput);
      setTaxpayerResult(response);
      if (response?.taxpayerValidity) {
        message.success('Adószám találat');
      } else {
        message.warning('Adószám nem található');
      }
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Adószám lekérdezési hiba');
    }
  };

  const handleSendEvent = async (values: any) => {
    try {
      await famApi.sendEvent(systemId, values.ecrEventType, values.ecrEventValue);
      message.success('Esemény beküldve');
      eventForm.resetFields(['ecrEventValue']);
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Esemény beküldési hiba');
    }
  };

  const handleSaveCurrency = async (values: any) => {
    try {
      await famApi.saveCurrency(systemId, {
        currencyCode: values.currencyCode,
        conversionValue: String(values.conversionValue),
        displayPrecision: values.displayPrecision || 0,
        isNative: !!values.isNative,
        symbol: values.symbol || '',
      });
      message.success('Valuta mentve');
      currencyForm.resetFields();
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Valuta mentési hiba');
    }
  };

  const handleDeleteCurrency = async (currencyCode: string) => {
    try {
      await famApi.deleteCurrency(systemId, currencyCode);
      message.success('Valuta törölve');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Valuta törlési hiba');
    }
  };

  const handleSavePaymentMethod = async (values: any) => {
    try {
      await famApi.savePaymentMethod(systemId, {
        displayName: values.displayName,
        moneyCat: values.moneyCat,
        moneySubCat: values.moneySubCat,
        currency: values.currency,
        sortKey: values.sortKey,
      });
      message.success('Fizetési mód mentve');
      paymentForm.resetFields();
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Fizetési mód mentési hiba');
    }
  };

  const handleDeletePaymentMethod = async (id: number) => {
    try {
      await famApi.deletePaymentMethod(systemId, id);
      message.success('Fizetési mód törölve');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Fizetési mód törlési hiba');
    }
  };

  const handleSubmitDocument = async (values: any) => {
    try {
      await famApi.submitDocument(systemId, {
        documentType: values.documentType,
        source: 'manual',
        externalId: values.externalId,
        payload: {
          totalGross: values.totalGross,
          customerTaxNumber: values.customerTaxNumber,
          note: values.note,
        },
      });
      message.success('Bizonylat beküldési kísérlet rögzítve');
      documentForm.resetFields(['externalId', 'totalGross', 'customerTaxNumber', 'note']);
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Bizonylat beküldési hiba');
    }
  };

  const handleRetryDocument = async (id: number) => {
    try {
      await famApi.retryDocument(id);
      message.success('Újraküldés elindítva');
      await loadAll();
    } catch (error: any) {
      message.error(error?.response?.data?.resultDesc || 'Újraküldési hiba');
    }
  };

  const currencies = statusData?.currencies || [];
  const paymentMethods = statusData?.paymentMethods || [];

  const readinessRows = Object.entries(readiness?.checks || {}).map(([key, value]) => ({
    key,
    check: key,
    ok: !!value,
  }));

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <ApiOutlined style={{ fontSize: 22 }} />
                <div>
                  <Title level={4} style={{ margin: 0 }}>FAM beállítások és NAV kompatibilitás</Title>
                  <Text type="secondary">Állapot, readiness, NAV beállítások, bizonylat queue, naplók és hibák</Text>
                </div>
              </Space>
              <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>Frissítés</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="Kapcsolati beállítások">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Text strong>FAM API URL</Text>
                <Input value={baseUrl} onChange={(e) => setBaseUrlState(e.target.value)} placeholder="http://localhost:8010/api/v1/fam" />
              </div>
              <div>
                <Text strong>System ID</Text>
                <Input value={systemId} onChange={(e) => setSystemIdState(e.target.value)} placeholder="C00000001" />
              </div>
              <Space>
                <Button type="primary" onClick={handleSaveConnectionSettings}>Mentés</Button>
                <Button onClick={() => { setBaseUrlState(getFamBaseUrl()); setSystemIdState(getFamSystemId()); }}>Visszaállítás</Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="Rendszerállapot és readiness">
            <Space wrap>
              <Tag color={statusData?.online ? 'green' : 'red'}>{statusData?.online ? 'ONLINE' : 'OFFLINE'}</Tag>
              <Tag color={statusData?.blocked ? 'red' : 'blue'}>{statusData?.blocked ? 'BLOKKOLT' : 'AKTÍV'}</Tag>
              <Tag color="purple">Állapot: {statusData?.fcuState || 'N/A'}</Tag>
              <Tag color="geekblue">Nap nyitva: {statusData?.fiscalDayOpen ? 'Igen' : 'Nem'}</Tag>
              <Tag>Nyitott nap #: {statusData?.openedFiscalDayNo ?? '-'}</Tag>
              <Tag color={readiness?.ready ? 'green' : 'orange'}>Readiness: {readiness?.ready ? 'READY' : 'HIÁNYOS'}</Tag>
            </Space>
            <Space style={{ marginTop: 12 }} wrap>
              <Button icon={<PlayCircleOutlined />} onClick={handleHello}>HELLO</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleOpenDay}>Napnyitás</Button>
              <Button danger icon={<StopOutlined />} onClick={handleCloseDay}>Napzárás</Button>
            </Space>
            <Divider />
            <Table
              size="small"
              rowKey="key"
              dataSource={readinessRows}
              pagination={false}
              columns={[
                { title: 'Ellenőrzés', dataIndex: 'check' },
                { title: 'Állapot', dataIndex: 'ok', width: 130, render: (ok: boolean) => <Tag color={ok ? 'green' : 'red'}>{ok ? 'OK' : 'HIÁNY'}</Tag> },
              ]}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Tabs
            items={[
              {
                key: 'nav-config',
                label: 'NAV konfiguráció',
                children: (
                  <Card>
                    <Form form={navConfigForm} layout="vertical" onFinish={handleSaveNavConfig}>
                      <Row gutter={16}>
                        <Col xs={24} md={8}>
                          <Form.Item name="mode" label="Mód" initialValue="mock" rules={[{ required: true }]}>
                            <Select options={[{ value: 'mock', label: 'Mock' }, { value: 'live', label: 'Live' }]} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="env" label="Környezet" initialValue="sandbox" rules={[{ required: true }]}>
                            <Select options={[{ value: 'sandbox', label: 'Sandbox' }, { value: 'production', label: 'Production' }]} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="connector" label="Live connector" initialValue="cloud_fam" rules={[{ required: true }]}>
                            <Select options={[{ value: 'cloud_fam', label: 'Cloud FAM / NAV API' }, { value: 'hepg', label: 'HePG hardver' }]} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="base_url" label="NAV/FAM base URL">
                            <Input placeholder="https://..." />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={8}>
                          <Form.Item name="api_key" label="NAV/PixiInvoice API kulcs">
                            <Input.Password placeholder="Bearer API key" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="live_submit_path" label="Live submit path" initialValue="/api/customers/submit_document/">
                            <Input placeholder="/api/customers/submit_document/" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="live_taxpayer_path" label="Live taxpayer path" initialValue="/api/customers/lookup_taxpayer/">
                            <Input placeholder="/api/customers/lookup_taxpayer/" />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={8}>
                          <Form.Item name="hepg_base_url" label="HePG base URL">
                            <Input placeholder="http://192.168.1.50:8080" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="hepg_submit_path" label="HePG submit path" initialValue="/api/v1/receipt">
                            <Input placeholder="/api/v1/receipt" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="hepg_api_key" label="HePG API kulcs">
                            <Input.Password placeholder="Opcionális" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item name="hepg_device_id" label="HePG eszköz azonosító">
                            <Input placeholder="HEPG-01" />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={12}>
                          <Form.Item name="tech_user" label="Technikai felhasználó">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="tech_password" label="Technikai jelszó">
                            <Input.Password />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={12}>
                          <Form.Item name="signing_key_ref" label="Aláíró kulcs referencia">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="exchange_key_ref" label="Titkosító kulcs referencia">
                            <Input />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={6}>
                          <Form.Item name="timeout_sec" label="Timeout (sec)" initialValue={20}>
                            <InputNumber min={3} max={120} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                          <Form.Item name="retry_limit" label="Retry limit" initialValue={3}>
                            <InputNumber min={0} max={20} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                          <Form.Item name="invoice_enabled" label="Számla flow" valuePropName="checked" initialValue={false}>
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                          <Form.Item name="ereceipt_enabled" label="E-nyugta flow" valuePropName="checked" initialValue={false}>
                            <Switch />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Button type="primary" htmlType="submit">NAV konfiguráció mentése</Button>
                    </Form>
                  </Card>
                ),
              },
              {
                key: 'documents',
                label: 'Bizonylat felküldés',
                children: (
                  <Card>
                    <Row gutter={16}>
                      <Col xs={24} xl={8}>
                        <Form form={documentForm} layout="vertical" onFinish={handleSubmitDocument} initialValues={{ documentType: 'receipt' }}>
                          <Form.Item name="documentType" label="Bizonylat típusa" rules={[{ required: true }]}> 
                            <Select options={[{ value: 'receipt', label: 'E-nyugta' }, { value: 'invoice', label: 'Számla' }]} />
                          </Form.Item>
                          <Form.Item name="externalId" label="Külső azonosító" rules={[{ required: true }]}> 
                            <Input placeholder="POS-20260214-0001" />
                          </Form.Item>
                          <Form.Item name="totalGross" label="Bruttó összeg">
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="customerTaxNumber" label="Vevő adószám">
                            <Input placeholder="12345678-1-41" />
                          </Form.Item>
                          <Form.Item name="note" label="Megjegyzés">
                            <Input.TextArea rows={3} />
                          </Form.Item>
                          <Button type="primary" icon={<UploadOutlined />} htmlType="submit">Feladás FAM queue-ba</Button>
                        </Form>
                      </Col>

                      <Col xs={24} xl={16}>
                        <Table
                          rowKey="id"
                          dataSource={documents}
                          pagination={{ pageSize: 8 }}
                          columns={[
                            { title: '#', dataIndex: 'id', width: 70 },
                            { title: 'Típus', dataIndex: 'documentType', width: 110 },
                            { title: 'External ID', dataIndex: 'externalId', width: 170 },
                            { title: 'Státusz', dataIndex: 'status', width: 120, render: (s: string) => {
                              const color = s === 'sent' ? 'green' : s === 'failed' ? 'red' : 'blue';
                              return <Tag color={color}>{s}</Tag>;
                            } },
                            { title: 'NAV ref', dataIndex: 'navReference', width: 170 },
                            { title: 'Hiba', dataIndex: 'lastError', ellipsis: true },
                            { title: 'Művelet', width: 120, render: (_, r: any) => (
                              <Button size="small" onClick={() => handleRetryDocument(r.id)} disabled={r.status === 'sent'}>
                                Retry
                              </Button>
                            ) },
                          ]}
                        />
                      </Col>
                    </Row>
                  </Card>
                ),
              },
              {
                key: 'taxpayer',
                label: 'Adószám lekérdezés',
                children: (
                  <Card>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          value={taxpayerInput}
                          onChange={(e) => setTaxpayerInput(e.target.value)}
                          placeholder="Adószám (8 számjegy)"
                        />
                        <Button type="primary" onClick={handleQueryTaxpayer}>Lekérdezés</Button>
                      </Space.Compact>

                      {taxpayerResult && (
                        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 260, overflow: 'auto' }}>
                          {JSON.stringify(taxpayerResult, null, 2)}
                        </pre>
                      )}
                    </Space>
                  </Card>
                ),
              },
              {
                key: 'currency',
                label: 'Valuták',
                children: (
                  <Card>
                    <Row gutter={16}>
                      <Col xs={24} xl={10}>
                        <Form form={currencyForm} layout="vertical" onFinish={handleSaveCurrency}>
                          <Form.Item name="currencyCode" label="Deviza kód" rules={[{ required: true }]}> 
                            <Input placeholder="EUR" maxLength={3} />
                          </Form.Item>
                          <Form.Item name="conversionValue" label="Átváltási ráta" rules={[{ required: true }]}> 
                            <Input placeholder="400" />
                          </Form.Item>
                          <Form.Item name="displayPrecision" label="Tizedes pontosság" initialValue={0}>
                            <InputNumber min={0} max={8} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="symbol" label="Szimbólum" initialValue="">
                            <Input placeholder="€" />
                          </Form.Item>
                          <Form.Item name="isNative" label="Honos pénznem" valuePropName="checked" initialValue={false}>
                            <Switch />
                          </Form.Item>
                          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Valuta mentése</Button>
                        </Form>
                      </Col>
                      <Col xs={24} xl={14}>
                        <Table
                          rowKey="currencyCode"
                          dataSource={currencies}
                          pagination={false}
                          columns={[
                            { title: 'Kód', dataIndex: 'currencyCode' },
                            { title: 'Ráta', dataIndex: 'conversionValue' },
                            { title: 'Pontosság', dataIndex: 'displayPrecision' },
                            { title: 'Honos', dataIndex: 'native', render: (v: boolean) => (v ? 'Igen' : 'Nem') },
                            { title: 'Művelet', render: (_, r: any) => <Button danger size="small" disabled={r.native} onClick={() => handleDeleteCurrency(r.currencyCode)}>Törlés</Button> },
                          ]}
                        />
                      </Col>
                    </Row>
                  </Card>
                ),
              },
              {
                key: 'payments',
                label: 'Fizetési módok',
                children: (
                  <Card>
                    <Row gutter={16}>
                      <Col xs={24} xl={10}>
                        <Form form={paymentForm} layout="vertical" onFinish={handleSavePaymentMethod}>
                          <Form.Item name="displayName" label="Név" rules={[{ required: true }]}> 
                            <Input placeholder="SZÉP kártya" />
                          </Form.Item>
                          <Form.Item name="moneyCat" label="Kategória" rules={[{ required: true }]}> 
                            <Select options={[{ value: 'CASH' }, { value: 'CARD' }, { value: 'AFR' }, { value: 'OTHER' }]} />
                          </Form.Item>
                          <Form.Item name="moneySubCat" label="Alkategória">
                            <Input placeholder="SZEP" />
                          </Form.Item>
                          <Form.Item name="currency" label="Deviza" initialValue="HUF" rules={[{ required: true }]}> 
                            <Input maxLength={3} />
                          </Form.Item>
                          <Form.Item name="sortKey" label="Sorrend" initialValue="0004" rules={[{ required: true }]}> 
                            <Input />
                          </Form.Item>
                          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Fizetési mód mentése</Button>
                        </Form>
                      </Col>
                      <Col xs={24} xl={14}>
                        <Table
                          rowKey="id"
                          dataSource={paymentMethods}
                          pagination={false}
                          columns={[
                            { title: 'ID', dataIndex: 'id', width: 70 },
                            { title: 'Név', dataIndex: 'displayName' },
                            { title: 'Kategória', dataIndex: 'moneyCat' },
                            { title: 'Deviza', dataIndex: 'currency' },
                            { title: 'Sort', dataIndex: 'sortKey' },
                            { title: 'Művelet', render: (_, r: any) => <Button danger size="small" onClick={() => handleDeletePaymentMethod(r.id)}>Törlés</Button> },
                          ]}
                        />
                      </Col>
                    </Row>
                  </Card>
                ),
              },
              {
                key: 'logs',
                label: 'Esemény / Napló / Hibák',
                children: (
                  <Card>
                    <Row gutter={16}>
                      <Col xs={24} xl={8}>
                        <Form form={eventForm} layout="vertical" onFinish={handleSendEvent} initialValues={{ ecrEventType: 'OTHER_EVENT' }}>
                          <Form.Item name="ecrEventType" label="Esemény típusa" rules={[{ required: true }]}> 
                            <Select options={[
                              { value: 'POWER_ON' },
                              { value: 'BLOCK' },
                              { value: 'UNBLOCK' },
                              { value: 'MESSAGE_ACK' },
                              { value: 'OTHER_EVENT' },
                            ]} />
                          </Form.Item>
                          <Form.Item name="ecrEventValue" label="Megjegyzés">
                            <Input.TextArea rows={3} />
                          </Form.Item>
                          <Button type="primary" htmlType="submit">Esemény beküldése</Button>
                        </Form>
                      </Col>
                      <Col xs={24} xl={16}>
                        <Tabs
                          items={[
                            {
                              key: 'ev',
                              label: `Események (${events.length})`,
                              children: (
                                <Table
                                  rowKey={(r) => `${r.createdAt}-${r.ecrEventType}-${r.systemId}`}
                                  dataSource={events}
                                  pagination={{ pageSize: 8 }}
                                  columns={[
                                    { title: 'Idő', dataIndex: 'createdAt', render: (v: number) => new Date(v).toLocaleString('hu-HU') },
                                    { title: 'Típus', dataIndex: 'ecrEventType' },
                                    { title: 'Érték', dataIndex: 'ecrEventValue' },
                                  ]}
                                />
                              ),
                            },
                            {
                              key: 'err',
                              label: `Hibák (${errors.length})`,
                              children: (
                                <Table
                                  rowKey={(r) => `${r.createdAt}-${r.code}-${r.systemId}`}
                                  dataSource={errors}
                                  pagination={{ pageSize: 8 }}
                                  columns={[
                                    { title: 'Idő', dataIndex: 'createdAt', render: (v: number) => new Date(v).toLocaleString('hu-HU') },
                                    { title: 'Kód', dataIndex: 'code' },
                                    { title: 'Üzenet', dataIndex: 'message' },
                                    { title: 'Részlet', dataIndex: 'details' },
                                  ]}
                                />
                              ),
                            },
                          ]}
                        />
                      </Col>
                    </Row>
                  </Card>
                ),
              },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
};

export default FAM;
