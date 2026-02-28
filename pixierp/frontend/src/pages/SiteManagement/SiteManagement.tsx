import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, message } from 'antd';
import api from '../../services/api';
import { siteManagementService } from '../../services/siteManagementService';

const SiteManagement: React.FC = () => {
  const [sites, setSites] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [productClasses, setProductClasses] = useState<any[]>([]);
  const [calculators, setCalculators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [featureModalOpen, setFeatureModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<any | null>(null);
  const [editingFeature, setEditingFeature] = useState<any | null>(null);
  const [siteForm] = Form.useForm();
  const [featureForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [siteData, featureData, pcRes, calcRes] = await Promise.all([
        siteManagementService.getSites(),
        siteManagementService.getFeatures(),
        api.get('/manufacturing/product-classes/'),
        api.get('/manufacturing/calculator-templates/'),
      ]);
      setSites(Array.isArray(siteData) ? siteData : []);
      setFeatures(Array.isArray(featureData) ? featureData : []);
      setProductClasses(pcRes.data.results || pcRes.data || []);
      setCalculators(calcRes.data.results || calcRes.data || []);
    } catch {
      message.error('Nem sikerült betölteni a site menedzsment adatokat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateSite = () => {
    setEditingSite(null);
    siteForm.resetFields();
    siteForm.setFieldsValue({
      site_type: 'marketing',
      is_active: true,
      calculators_enabled: true,
      portal_enabled: true,
    });
    setSiteModalOpen(true);
  };

  const openEditSite = (site: any) => {
    setEditingSite(site);
    siteForm.setFieldsValue({
      ...site,
      domains_text: Array.isArray(site.domains) ? site.domains.join('\n') : '',
    });
    setSiteModalOpen(true);
  };

  const saveSite = async () => {
    try {
      const values = await siteForm.validateFields();
      const payload = {
        ...values,
        domains: (values.domains_text || '')
          .split(/\n|,/)
          .map((item: string) => item.trim())
          .filter(Boolean),
      } as any;
      delete payload.domains_text;

      if (editingSite) {
        await siteManagementService.updateSite(editingSite.id, payload);
        message.success('Oldal frissítve');
      } else {
        await siteManagementService.createSite(payload);
        message.success('Oldal létrehozva');
      }
      setSiteModalOpen(false);
      setEditingSite(null);
      siteForm.resetFields();
      await loadData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error('Nem sikerült menteni az oldalt');
    }
  };

  const deleteSite = async (id: number) => {
    try {
      await siteManagementService.deleteSite(id);
      message.success('Oldal törölve');
      await loadData();
    } catch {
      message.error('Nem sikerült törölni az oldalt');
    }
  };

  const openCreateFeature = () => {
    setEditingFeature(null);
    featureForm.resetFields();
    featureForm.setFieldsValue({ is_active: true, sort_order: 0 });
    setFeatureModalOpen(true);
  };

  const openEditFeature = (feature: any) => {
    setEditingFeature(feature);
    featureForm.setFieldsValue(feature);
    setFeatureModalOpen(true);
  };

  const saveFeature = async () => {
    try {
      const values = await featureForm.validateFields();
      if (editingFeature) {
        await siteManagementService.updateFeature(editingFeature.id, values);
        message.success('Funkció frissítve');
      } else {
        await siteManagementService.createFeature(values);
        message.success('Funkció létrehozva');
      }
      setFeatureModalOpen(false);
      setEditingFeature(null);
      featureForm.resetFields();
      await loadData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error('Nem sikerült menteni a funkciót');
    }
  };

  const deleteFeature = async (id: number) => {
    try {
      await siteManagementService.deleteFeature(id);
      message.success('Funkció törölve');
      await loadData();
    } catch {
      message.error('Nem sikerült törölni a funkciót');
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Sales/Marketing oldalak" extra={<Button type="primary" onClick={openCreateSite}>Új oldal</Button>}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={sites}
          pagination={{ pageSize: 12 }}
          columns={[
            { title: 'Név', dataIndex: 'name', key: 'name', width: 180 },
            { title: 'Slug', dataIndex: 'slug', key: 'slug', width: 130 },
            {
              title: 'Domainek',
              key: 'domains',
              render: (_: any, record: any) => (
                <Space wrap>
                  {(record.domains || []).map((domain: string) => <Tag key={domain}>{domain}</Tag>)}
                </Space>
              ),
            },
            { title: 'Típus', dataIndex: 'site_type', key: 'site_type', width: 120 },
            {
              title: 'Kategóriák',
              key: 'product_class_names',
              render: (_: any, record: any) => (record.product_class_names || []).slice(0, 3).join(', ') || '-',
              width: 220,
            },
            {
              title: 'Kalkulátorok',
              key: 'calculator_names',
              render: (_: any, record: any) => (record.calculator_names || []).slice(0, 3).join(', ') || '-',
              width: 220,
            },
            {
              title: 'Funkciók',
              key: 'feature_names',
              render: (_: any, record: any) => (record.feature_names || []).slice(0, 3).join(', ') || '-',
              width: 220,
            },
            {
              title: 'Aktív',
              dataIndex: 'is_active',
              key: 'is_active',
              width: 90,
              render: (v: boolean) => (v ? <Tag color="green">Igen</Tag> : <Tag>Nem</Tag>),
            },
            {
              title: 'Műveletek',
              key: 'actions',
              width: 260,
              render: (_: any, record: any) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => window.open(`/site-management/${record.slug}`, '_blank')}
                  >
                    Megtekintés
                  </Button>
                  <Button size="small" onClick={() => openEditSite(record)}>Szerkeszt</Button>
                  <Popconfirm title="Biztosan törlöd ezt az oldalt?" onConfirm={() => deleteSite(record.id)} okText="Igen" cancelText="Mégse">
                    <Button size="small" danger>Törlés</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Card title="Elérhető funkciók" extra={<Button onClick={openCreateFeature}>Új funkció</Button>}>
        <Row gutter={16}>
          <Col span={24}>
            <Table
              rowKey="id"
              loading={loading}
              dataSource={features}
              pagination={false}
              columns={[
                { title: 'Kód', dataIndex: 'code', key: 'code', width: 140 },
                { title: 'Név', dataIndex: 'name', key: 'name' },
                { title: 'Sorrend', dataIndex: 'sort_order', key: 'sort_order', width: 90 },
                {
                  title: 'Aktív',
                  dataIndex: 'is_active',
                  key: 'is_active',
                  width: 90,
                  render: (v: boolean) => (v ? 'Igen' : 'Nem'),
                },
                {
                  title: 'Műveletek',
                  key: 'actions',
                  width: 180,
                  render: (_: any, record: any) => (
                    <Space>
                      <Button size="small" onClick={() => openEditFeature(record)}>Szerkeszt</Button>
                      <Popconfirm title="Biztosan törlöd ezt a funkciót?" onConfirm={() => deleteFeature(record.id)} okText="Igen" cancelText="Mégse">
                        <Button size="small" danger>Törlés</Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Modal
        title={editingSite ? 'Oldal szerkesztése' : 'Új oldal'}
        open={siteModalOpen}
        onCancel={() => {
          setSiteModalOpen(false);
          setEditingSite(null);
          siteForm.resetFields();
        }}
        onOk={saveSite}
        okText="Mentés"
        cancelText="Mégse"
        width={860}
      >
        <Form form={siteForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="Oldal neve" rules={[{ required: true, message: 'Kötelező' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="slug" label="Slug" rules={[{ required: true, message: 'Kötelező' }]}>
                <Input placeholder="pl. hu-sales" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="domains_text" label="Domainek" tooltip="Egy domain soronként vagy vesszővel elválasztva" rules={[{ required: true, message: 'Adj meg legalább egy domaint' }]}>
            <Input.TextArea rows={3} placeholder="sales.ceg.hu\nlanding.ceg.hu" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="site_type" label="Oldal típus" rules={[{ required: true, message: 'Kötelező' }]}>
                <Select
                  options={[
                    { value: 'marketing', label: 'Marketing' },
                    { value: 'sales', label: 'Sales' },
                    { value: 'portal', label: 'Portál' },
                    { value: 'mixed', label: 'Vegyes' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="calculators_enabled" label="Kalkulátorok" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="portal_enabled" label="Portál" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="site_title" label="Oldal cím">
            <Input />
          </Form.Item>
          <Form.Item name="hero_title" label="Hero főcím">
            <Input />
          </Form.Item>
          <Form.Item name="hero_subtitle" label="Hero alcím">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="product_classes" label="Termékkategóriák">
            <Select
              mode="multiple"
              allowClear
              options={productClasses.map((item: any) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>

          <Form.Item name="calculators" label="Kalkulátorok">
            <Select
              mode="multiple"
              allowClear
              options={calculators.map((item: any) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>

          <Form.Item name="features" label="Funkciók">
            <Select
              mode="multiple"
              allowClear
              options={features.filter((item) => item.is_active).map((item: any) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>

          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingFeature ? 'Funkció szerkesztése' : 'Új funkció'}
        open={featureModalOpen}
        onCancel={() => {
          setFeatureModalOpen(false);
          setEditingFeature(null);
          featureForm.resetFields();
        }}
        onOk={saveFeature}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={featureForm} layout="vertical">
          <Form.Item name="code" label="Kód" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="pl. quote_request" />
          </Form.Item>
          <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Leírás">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="sort_order" label="Sorrend" initialValue={0}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default SiteManagement;
