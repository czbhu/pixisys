import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Switch, Select, Tag, message,
  Space, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Text } = Typography;

const DAY_OPTIONS = [
  { value: 'H', label: 'H (Hétfő)' },
  { value: 'K', label: 'K (Kedd)' },
  { value: 'Sze', label: 'Sze (Szerda)' },
  { value: 'Cs', label: 'Cs (Csütörtök)' },
  { value: 'P', label: 'P (Péntek)' },
  { value: 'Szo', label: 'Szo (Szombat)' },
  { value: 'V', label: 'V (Vasárnap)' },
];

interface PickupHoursRow {
  day_from: string;
  day_to: string;
  time_from: string;
  time_to: string;
}

interface PickupLocation {
  id: number;
  name: string;
  address: string;
  pickup_hours: PickupHoursRow[];
  hours_display: string;
  is_active: boolean;
  is_default: boolean;
}

const emptyRow = (): PickupHoursRow => ({ day_from: 'H', day_to: 'P', time_from: '09:00', time_to: '17:00' });

const PickupLocationsPage: React.FC = () => {
  const [list, setList] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<PickupLocation | null>(null);
  const [hoursRows, setHoursRows] = useState<PickupHoursRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/sales/pickup-locations/');
      const d = r.data;
      setList(Array.isArray(d) ? d : (d?.results ?? []));
    } catch {
      message.error('Nem sikerült betölteni az átvételi helyeket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setHoursRows([emptyRow()]);
    setOpen(true);
  };

  const openEdit = (record: PickupLocation) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      address: record.address,
      is_active: !!record.is_active,
      is_default: !!record.is_default,
    });
    setHoursRows((record.pickup_hours || []).length > 0 ? [...record.pickup_hours] : [emptyRow()]);
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name,
        address: values.address,
        is_active: !!values.is_active,
        is_default: !!values.is_default,
        pickup_hours: hoursRows,
      };
      if (editing) {
        await api.put(`/sales/pickup-locations/${editing.id}/`, payload);
        message.success('Átvételi hely frissítve');
      } else {
        await api.post('/sales/pickup-locations/', payload);
        message.success('Átvételi hely létrehozva');
      }
      setOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return; // validation
      message.error('Mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/sales/pickup-locations/${id}/`);
      message.success('Törölve');
      load();
    } catch {
      message.error('Törlés sikertelen');
    }
  };

  const handleSetDefault = async (record: PickupLocation) => {
    try {
      await api.patch(`/sales/pickup-locations/${record.id}/`, { is_default: true });
      message.success(`„${record.name}" beállítva alapértelmezettként`);
      load();
    } catch {
      message.error('Nem sikerült beállítani');
    }
  };

  const updateRow = (index: number, field: keyof PickupHoursRow, value: string) => {
    setHoursRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => setHoursRows(prev => [...prev, emptyRow()]);

  const removeRow = (index: number) => setHoursRows(prev => prev.filter((_, i) => i !== index));

  const columns = [
    {
      title: '',
      key: 'is_default',
      width: 36,
      render: (_: any, record: PickupLocation) =>
        record.is_default
          ? <StarFilled style={{ color: '#faad14', fontSize: 16 }} title="Alapértelmezett" />
          : <StarOutlined style={{ color: '#ccc', fontSize: 16, cursor: 'pointer' }} title="Beállítás alapértelmezettnek" onClick={() => handleSetDefault(record)} />,
    },
    { title: 'Hely neve', dataIndex: 'name', key: 'name' },
    { title: 'Cím', dataIndex: 'address', key: 'address' },
    {
      title: 'Átvételi időpontok',
      dataIndex: 'hours_display',
      key: 'hours_display',
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => v ? <Tag color="green">Aktív</Tag> : <Tag color="red">Inaktív</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: PickupLocation) => (
        <Space>
          {!record.is_default && (
            <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(record)}>Alapértelmezett</Button>
          )}
          <Button size="small" onClick={() => openEdit(record)}>Szerkesztés</Button>
          <Popconfirm
            title="Biztosan törli ezt az átvételi helyet?"
            onConfirm={() => handleDelete(record.id)}
            okText="Törlés"
            cancelText="Mégse"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>Törlés</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Átvételi helyek"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Új átvételi hely</Button>}
    >
      <Table
        dataSource={list}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editing ? 'Átvételi hely szerkesztése' : 'Új átvételi hely'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={saving}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Hely neve" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input placeholder="pl. Budapest raktár" />
          </Form.Item>
          <Form.Item name="address" label="Cím" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input placeholder="pl. 1234 Budapest, Fő utca 1." />
          </Form.Item>

          <Form.Item label="Átvételi időpontok">
            {hoursRows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <Select
                  value={row.day_from}
                  onChange={v => updateRow(i, 'day_from', v)}
                  options={DAY_OPTIONS}
                  style={{ width: 120 }}
                  placeholder="Naptól"
                />
                <span>–</span>
                <Select
                  value={row.day_to}
                  onChange={v => updateRow(i, 'day_to', v)}
                  options={DAY_OPTIONS}
                  style={{ width: 120 }}
                  placeholder="Napig"
                />
                <Input
                  value={row.time_from}
                  onChange={e => updateRow(i, 'time_from', e.target.value)}
                  placeholder="09:00"
                  style={{ width: 80 }}
                />
                <span>–</span>
                <Input
                  value={row.time_to}
                  onChange={e => updateRow(i, 'time_to', e.target.value)}
                  placeholder="17:00"
                  style={{ width: 80 }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(i)}
                  disabled={hoursRows.length === 1}
                />
              </div>
            ))}
            <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Sor hozzáadása</Button>
          </Form.Item>

          <Form.Item name="is_active" label="Aktív" valuePropName="checked">
            <Switch checkedChildren="Aktív" unCheckedChildren="Inaktív" />
          </Form.Item>

          <Form.Item name="is_default" label="Alapértelmezett" valuePropName="checked">
            <Switch checkedChildren="Alapértelmezett" unCheckedChildren="Nem alapértelmezett" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PickupLocationsPage;
