import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, message, Popconfirm, Select,
  Card, Row, Col, Statistic, Badge, Input, Tooltip, Modal,
  Form, InputNumber, Typography,
} from 'antd';
import {
  PlusOutlined, CheckCircleOutlined, StopOutlined, DeleteOutlined,
  ReloadOutlined, FilterOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;
const { Text } = Typography;

// ─── Típusok ─────────────────────────────────────────────────────────────────

interface Remnant {
  id: number;
  material: number;
  material_name: string;
  material_code: string;
  material_unit: string;
  material_format: string;
  warehouse: number;
  warehouse_name: string;
  width_mm: number;
  height_mm: number | null;
  length_mm: number | null;
  quantity: number;
  is_available: boolean;
  area_m2: number | null;
  unit_value: number;
  currency: string;
  source_job_ref: string;
  notes: string;
  created_at: string;
  created_by_name: string | null;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Material {
  id: number;
  name: string;
  code: string;
  material_format: string;
}

// ─── Segéd ───────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 0) =>
  n.toLocaleString('hu-HU', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const dimLabel = (r: Remnant) => {
  if (r.height_mm) return `${fmt(r.width_mm)} × ${fmt(r.height_mm)} mm`;
  if (r.length_mm) return `${fmt(r.width_mm)} mm szél. / ${fmt(r.length_mm / 1000, 2)} fm`;
  return `${fmt(r.width_mm)} mm`;
};

// ─── Főkomponens ─────────────────────────────────────────────────────────────

const Remnants: React.FC = () => {
  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterAvailable, setFilterAvailable] = useState<string>('1');
  const [filterWarehouse, setFilterWarehouse] = useState<number | null>(null);
  const [filterMaterial, setFilterMaterial] = useState<number | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [addLoading, setAddLoading] = useState(false);

  // ── Betöltés ───────────────────────────────────────────────────────────────
  const loadRemnants = useCallback(async () => {
    setLoading(true);
    const params: Record<string, any> = {};
    if (filterAvailable !== 'all') params.available = filterAvailable;
    if (filterWarehouse) params.warehouse = filterWarehouse;
    if (filterMaterial) params.material = filterMaterial;
    try {
      const resp = await api.get('/warehouse/material-remnants/', { params });
      setRemnants(resp.data?.results ?? resp.data ?? []);
    } catch {
      message.error('Betöltés sikertelen');
    } finally {
      setLoading(false);
    }
  }, [filterAvailable, filterWarehouse, filterMaterial]);

  useEffect(() => {
    loadRemnants();
  }, [loadRemnants]);

  useEffect(() => {
    Promise.all([
      api.get('/warehouse/warehouses/?page_size=50'),
      api.get('/warehouse/materials/?page_size=500&is_active=true'),
    ]).then(([wh, mat]) => {
      setWarehouses(wh.data?.results ?? wh.data ?? []);
      setMaterials(mat.data?.results ?? mat.data ?? []);
    });
  }, []);

  // ── Műveletek ──────────────────────────────────────────────────────────────
  const markUsed = async (id: number) => {
    try {
      await api.post(`/warehouse/material-remnants/${id}/mark-used/`);
      message.success('Felhasználtnak jelölve');
      loadRemnants();
    } catch {
      message.error('Művelet sikertelen');
    }
  };

  const markAvailable = async (id: number) => {
    try {
      await api.post(`/warehouse/material-remnants/${id}/mark-available/`);
      message.success('Elérhetőre visszaállítva');
      loadRemnants();
    } catch {
      message.error('Művelet sikertelen');
    }
  };

  const deleteRemnant = async (id: number) => {
    try {
      await api.delete(`/warehouse/material-remnants/${id}/`);
      message.success('Törölve');
      loadRemnants();
    } catch {
      message.error('Törlés sikertelen');
    }
  };

  const handleAdd = async () => {
    const vals = await addForm.validateFields();
    setAddLoading(true);
    try {
      await api.post('/warehouse/material-remnants/', vals);
      message.success('Maradék hozzáadva');
      setAddModalOpen(false);
      addForm.resetFields();
      loadRemnants();
    } catch {
      message.error('Mentés sikertelen');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Statisztikák ──────────────────────────────────────────────────────────
  const available = remnants.filter((r) => r.is_available);
  const totalArea = available
    .reduce((acc, r) => acc + (r.area_m2 ?? 0) * r.quantity, 0);
  const totalValue = available
    .reduce((acc, r) => acc + (r.unit_value ?? 0) * r.quantity, 0);

  // ── Táblázat oszlopok ─────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Alapanyag',
      key: 'material',
      render: (_: any, r: Remnant) => (
        <div>
          <Text strong>{r.material_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{r.material_code}</Text>
        </div>
      ),
    },
    {
      title: 'Méret',
      key: 'dim',
      render: (_: any, r: Remnant) => (
        <div>
          <Text>{dimLabel(r)}</Text>
          {r.area_m2 && (
            <><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.area_m2.toFixed(4)} m²</Text></>
          )}
        </div>
      ),
    },
    {
      title: 'Db',
      dataIndex: 'quantity',
      align: 'center' as const,
      width: 60,
    },
    {
      title: 'Raktár',
      dataIndex: 'warehouse_name',
      width: 120,
    },
    {
      title: 'Forrás',
      dataIndex: 'source_job_ref',
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Érték',
      key: 'value',
      width: 100,
      render: (_: any, r: Remnant) =>
        r.unit_value > 0 ? `${fmt(r.unit_value, 0)} Ft` : <Text type="secondary">—</Text>,
    },
    {
      title: 'Státusz',
      key: 'status',
      width: 110,
      render: (_: any, r: Remnant) =>
        r.is_available ? (
          <Badge status="success" text="Elérhető" />
        ) : (
          <Badge status="default" text="Felhasználva" />
        ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 130,
      render: (_: any, r: Remnant) => (
        <Space size={4}>
          {r.is_available ? (
            <Tooltip title="Felhasználtnak jelöl">
              <Popconfirm
                title="Felhasználtnak jelöli ezt a maradékot?"
                onConfirm={() => markUsed(r.id)}
                okText="Igen"
                cancelText="Nem"
              >
                <Button size="small" icon={<CheckCircleOutlined />} type="link" />
              </Popconfirm>
            </Tooltip>
          ) : (
            <Tooltip title="Visszaállít elérhetőre">
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                type="link"
                onClick={() => markAvailable(r.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="Töröl">
            <Popconfirm
              title="Biztosan törli?"
              onConfirm={() => deleteRemnant(r.id)}
              okText="Igen"
              cancelText="Nem"
            >
              <Button size="small" icon={<DeleteOutlined />} type="link" danger />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Fejléc statisztikák */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Elérhető maradék (db)" value={available.reduce((a, r) => a + r.quantity, 0)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Terület összesen" value={fmt(totalArea, 2)} suffix="m²" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Becsült érték" value={fmt(totalValue, 0)} suffix="Ft" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Összes rekord" value={remnants.length} />
          </Card>
        </Col>
      </Row>

      {/* Szűrők + Eszköztár */}
      <Card
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadRemnants}>Frissít</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
            >
              Kézi hozzáadás
            </Button>
          </Space>
        }
      >
        <Space wrap>
          <FilterOutlined />
          <Select
            value={filterAvailable}
            onChange={setFilterAvailable}
            style={{ width: 140 }}
          >
            <Option value="1">Elérhető</Option>
            <Option value="0">Felhasználva</Option>
            <Option value="all">Összes</Option>
          </Select>
          <Select
            allowClear
            placeholder="Raktár szűrő..."
            style={{ width: 160 }}
            onChange={setFilterWarehouse}
          >
            {warehouses.map((w) => (
              <Option key={w.id} value={w.id}>{w.name}</Option>
            ))}
          </Select>
          <Select
            showSearch
            allowClear
            placeholder="Alapanyag szűrő..."
            style={{ width: 220 }}
            onChange={setFilterMaterial}
            optionFilterProp="children"
          >
            {materials.map((m) => (
              <Option key={m.id} value={m.id}>{m.name}</Option>
            ))}
          </Select>
        </Space>
      </Card>

      <Table
        dataSource={remnants}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowClassName={(r) => (!r.is_available ? 'ant-table-row-disabled' : '')}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} rekord` }}
      />

      {/* Kézi hozzáadás modal */}
      <Modal
        title="Maradék kézi hozzáadása"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        confirmLoading={addLoading}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={addForm} layout="vertical" initialValues={{ quantity: 1, currency: 'HUF' }}>
          <Form.Item label="Alapanyag" name="material" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {materials.map((m) => (
                <Option key={m.id} value={m.id}>{m.name} ({m.material_format})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Raktár" name="warehouse" rules={[{ required: true }]}>
            <Select>
              {warehouses.map((w) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Szélesség (mm)" name="width_mm" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Magasság (mm)" name="height_mm">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Db" name="quantity">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Becsült érték (Ft/db)" name="unit_value">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Forrás munka (opcionális)" name="source_job_ref">
            <Input placeholder="pl. Megrendelés #42" />
          </Form.Item>
          <Form.Item label="Megjegyzés" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Remnants;
