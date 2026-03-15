import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber,
  Divider, message, Popconfirm, Typography, Row, Col, Switch,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Title, Text } = Typography;

interface SizePreset {
  id: number;
  name: string;
  width_mm: string;
  height_mm: string;
  is_active: boolean;
  sort_order: number;
}

interface PricingConfig {
  id: number;
  paper_cost_per_m2: string;
  print_color_cost: string;
  print_bw_cost: string;
  print_color_white_cost: string;
  cutting_cost: string;
  folding_cost_per_fold: string;
  margin_pct: string;
  updated_at: string;
}

const PrintProductsPage: React.FC = () => {
  const [presets, setPresets] = useState<SizePreset[]>([]);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<SizePreset | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  const [presetForm] = Form.useForm();
  const [pricingForm] = Form.useForm();

  const loadPresets = async () => {
    setLoadingPresets(true);
    try {
      const res = await api.get('/printshop/size-presets/');
      const data = res.data?.results ?? res.data;
      setPresets(Array.isArray(data) ? data : []);
    } catch {
      message.error('Nem sikerült betölteni a méret preseteket');
    } finally {
      setLoadingPresets(false);
    }
  };

  const loadPricing = async () => {
    setLoadingPricing(true);
    try {
      const res = await api.get('/printshop/pricing/');
      setPricing(res.data);
      pricingForm.setFieldsValue(res.data);
    } catch {
      message.error('Nem sikerült betölteni az árazási konfigurációt');
    } finally {
      setLoadingPricing(false);
    }
  };

  useEffect(() => {
    loadPresets();
    loadPricing();
  }, []);

  const openAddPreset = () => {
    setEditingPreset(null);
    presetForm.resetFields();
    presetForm.setFieldsValue({ is_active: true, sort_order: 0 });
    setPresetModalOpen(true);
  };

  const openEditPreset = (preset: SizePreset) => {
    setEditingPreset(preset);
    presetForm.setFieldsValue(preset);
    setPresetModalOpen(true);
  };

  const handleSavePreset = async () => {
    let values: any;
    try {
      values = await presetForm.validateFields();
    } catch {
      return;
    }
    setSavingPreset(true);
    try {
      if (editingPreset) {
        await api.put(`/printshop/size-presets/${editingPreset.id}/`, values);
        message.success('Preset frissítve');
      } else {
        await api.post('/printshop/size-presets/', values);
        message.success('Preset hozzáadva');
      }
      setPresetModalOpen(false);
      await loadPresets();
    } catch {
      message.error('Mentési hiba');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await api.delete(`/printshop/size-presets/${id}/`);
      message.success('Preset törölve');
      await loadPresets();
    } catch {
      message.error('Törlési hiba');
    }
  };

  const handleSavePricing = async () => {
    let values: any;
    try {
      values = await pricingForm.validateFields();
    } catch {
      return;
    }
    setSavingPricing(true);
    try {
      const res = await api.post('/printshop/pricing/', values);
      setPricing(res.data);
      message.success('Árazási konfiguráció mentve');
    } catch {
      message.error('Mentési hiba');
    } finally {
      setSavingPricing(false);
    }
  };

  const presetColumns = [
    { title: 'Név', dataIndex: 'name', key: 'name' },
    {
      title: 'Méret',
      key: 'size',
      render: (_: any, r: SizePreset) => `${r.width_mm} × ${r.height_mm} mm`,
    },
    { title: 'Sorrend', dataIndex: 'sort_order', key: 'sort_order' },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => <Switch checked={v} disabled size="small" />,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: SizePreset) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditPreset(record)}>Szerkeszt</Button>
          <Popconfirm
            title="Biztosan törlöd?"
            okText="Törlés" cancelText="Mégse"
            onConfirm={() => handleDeletePreset(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>Töröl</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Nyomtatás beállítások</Title>

      {/* Méret presetek */}
      <Card
        title="Méret presetek"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAddPreset}>Új preset</Button>}
        style={{ marginBottom: 24 }}
      >
        <Table
          dataSource={presets}
          columns={presetColumns}
          rowKey="id"
          loading={loadingPresets}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Árazási konfiguráció */}
      <Card
        title="Árazási konfiguráció"
        extra={
          <Button
            type="primary" icon={<SaveOutlined />}
            loading={savingPricing}
            onClick={handleSavePricing}
          >
            Mentés
          </Button>
        }
      >
        {loadingPricing ? (
          <Text type="secondary">Betöltés...</Text>
        ) : (
          <Form form={pricingForm} layout="vertical">
            <Divider orientation="left" style={{ fontSize: 13 }}>Papír</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="paper_cost_per_m2" label="Papír ár (HUF/m²)">
                  <InputNumber min={0} step={10} addonAfter="HUF/m²" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ fontSize: 13 }}>Nyomtatás (HUF/lap/oldal)</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="print_color_cost" label="Színes">
                  <InputNumber min={0} step={5} addonAfter="HUF" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="print_bw_cost" label="Fekete-fehér">
                  <InputNumber min={0} step={5} addonAfter="HUF" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="print_color_white_cost" label="Színes + Fehér">
                  <InputNumber min={0} step={5} addonAfter="HUF" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ fontSize: 13 }}>Kötészet</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="cutting_cost" label="Vágási munkadíj (HUF/munka)">
                  <InputNumber min={0} step={100} addonAfter="HUF" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="folding_cost_per_fold" label="Hajtás (HUF/hajtáspont)">
                  <InputNumber min={0} step={100} addonAfter="HUF" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ fontSize: 13 }}>Fedezet</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="margin_pct" label="Fedezet (%)">
                  <InputNumber min={0} max={300} step={5} addonAfter="%" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            {pricing?.updated_at && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Utoljára mentve: {new Date(pricing.updated_at).toLocaleString('hu-HU')}
              </Text>
            )}
          </Form>
        )}
      </Card>

      {/* Preset modal */}
      <Modal
        open={presetModalOpen}
        title={editingPreset ? 'Preset szerkesztése' : 'Új méret preset'}
        onCancel={() => setPresetModalOpen(false)}
        onOk={handleSavePreset}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={savingPreset}
      >
        <Form form={presetForm} layout="vertical">
          <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="pl. Névjegykártya" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="width_mm" label="Szélesség (mm)" rules={[{ required: true }]}>
                <InputNumber min={1} max={2000} addonAfter="mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="height_mm" label="Magasság (mm)" rules={[{ required: true }]}>
                <InputNumber min={1} max={2000} addonAfter="mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sort_order" label="Sorrend">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default PrintProductsPage;
