import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Switch, Tag,
  Popconfirm, message, Divider, Alert, Typography, Row, Col, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ApiOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import api from '../../../services/api';

const { Title } = Typography;
const { Option } = Select;

interface Department {
  id: number;
  name: string;
}

interface IoTDevice {
  id: number;
  name: string;
  device_type: string;
  device_type_display: string;
  location: string;
  is_active: boolean;
  shelly_host: string;
  shelly_auth_user: string;
  shelly_auth_pass: string;
  shelly_channel: number;
  type_settings: Record<string, any>;
  allowed_departments: number[];
  allowed_department_names: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
}

interface ChannelConfig {
  id: number;
  label: string;
}

interface SettingsField {
  key: string;
  label: string;
  defaultValue: number | string;
  type: 'number' | 'string';
  min?: number;
  max?: number;
  suffix?: string;
  help?: string;
}

interface DeviceTypeConfig {
  channels: ChannelConfig[];
  settingsFields: SettingsField[];
}

const DEVICE_TYPE_CONFIG: Record<string, DeviceTypeConfig> = {
  shelly_1mini_gen3_relay: {
    channels: [
      { id: 0, label: 'Gomb 1 (Csatorna 0)' },
    ],
    settingsFields: [
      {
        key: 'pulse_ms',
        label: 'Pulzus időtartam',
        defaultValue: 1000,
        type: 'number',
        min: 100,
        max: 30000,
        suffix: 'ms',
        help: 'Mennyi ideig maradjon aktív a relé aktiváláskor',
      },
    ],
  },
};

const DEVICE_TYPES = [
  { value: 'shelly_1mini_gen3_relay', label: 'Shelly 1 Mini Gen3 Relay' },
];

const IotPage: React.FC = () => {
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<IoTDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [connTestingId, setConnTestingId] = useState<number | null>(null);
  const [activatingChannel, setActivatingChannel] = useState<string | null>(null);
  const [activateResults, setActivateResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form] = Form.useForm();
  const deviceType = Form.useWatch('device_type', form);
  const typeConfig = deviceType ? DEVICE_TYPE_CONFIG[deviceType] : null;

  const loadDevices = async () => {
    setLoading(true);
    try {
      const [devRes, deptRes] = await Promise.all([
        api.get('/iot-devices/'),
        api.get('/hr/departments/'),
      ]);
      const data = devRes.data?.results ?? devRes.data;
      setDevices(Array.isArray(data) ? data : []);
      const deptData = deptRes.data?.results ?? deptRes.data;
      setDepartments(Array.isArray(deptData) ? deptData : []);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Nem sikerült betölteni az IoT eszközöket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDevices(); }, []);

  const openAdd = () => {
    setEditingDevice(null);
    setConnTestResult(null);
    setActivateResults({});
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      device_type: 'shelly_1mini_gen3_relay',
      shelly_channel: 0,
      type_settings: { pulse_ms: 1000 },
    });
    setModalOpen(true);
  };

  const openEdit = (device: IoTDevice) => {
    setEditingDevice(device);
    setConnTestResult(null);
    setActivateResults({});
    form.setFieldsValue({
      ...device,
      allowed_departments: device.allowed_departments ?? [],
      type_settings: device.type_settings && Object.keys(device.type_settings).length > 0
        ? device.type_settings
        : { pulse_ms: 1000 },
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editingDevice) {
        await api.put(`/iot-devices/${editingDevice.id}/`, values);
        message.success('Eszköz frissítve');
      } else {
        await api.post('/iot-devices/', values);
        message.success('Eszköz hozzáadva');
      }
      setModalOpen(false);
      await loadDevices();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/iot-devices/${id}/`);
      message.success('Eszköz törölve');
      await loadDevices();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Törlési hiba');
    }
  };

  const handleConnTest = async (deviceId: number, inModal = false) => {
    setConnTestingId(deviceId);
    if (inModal) setConnTestResult(null);
    try {
      await api.post(`/iot-devices/${deviceId}/test/`);
      if (inModal) setConnTestResult({ success: true, message: 'Kapcsolat rendben — az eszköz elérhető' });
      else message.success('Kapcsolat OK');
    } catch (e: any) {
      const err = e?.response?.data?.error || e?.message || 'Kapcsolat sikertelen';
      if (inModal) setConnTestResult({ success: false, message: err });
      else message.error(err);
    } finally {
      setConnTestingId(null);
    }
  };

  const handleActivate = async (deviceId: number, channelId: number, channelLabel: string) => {
    const key = `${deviceId}-${channelId}`;
    setActivatingChannel(key);
    setActivateResults(prev => { const n = { ...prev }; delete n[key]; return n; });
    try {
      await api.post(`/iot-devices/${deviceId}/activate/`, { channel: channelId });
      setActivateResults(prev => ({
        ...prev,
        [key]: { success: true, message: `${channelLabel} — aktiválás sikeres` },
      }));
    } catch (e: any) {
      const err = e?.response?.data?.error || e?.message || 'Aktiválás sikertelen';
      setActivateResults(prev => ({ ...prev, [key]: { success: false, message: err } }));
    } finally {
      setActivatingChannel(null);
    }
  };

  const columns = [
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Hely',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'Típus',
      dataIndex: 'device_type_display',
      key: 'device_type_display',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Állapot',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (val: boolean) =>
        val
          ? <Tag icon={<CheckCircleOutlined />} color="success">Aktív</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="default">Inaktív</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: IoTDevice) => (
        <Space>
          <Button
            size="small"
            icon={<ApiOutlined />}
            loading={connTestingId === record.id}
            onClick={() => handleConnTest(record.id)}
          >
            Kapcsolat
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            Szerkeszt
          </Button>
          <Popconfirm
            title="Biztosan törlöd ezt az eszközt?"
            okText="Törlés"
            cancelText="Mégse"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Töröl
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<Title level={4} style={{ margin: 0 }}>IoT eszközök</Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Új eszköz
        </Button>
      }
    >
      <Table
        dataSource={devices}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        open={modalOpen}
        title={editingDevice ? 'Eszköz szerkesztése' : 'Új IoT eszköz'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={saving}
        width={620}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          {/* Alapadatok */}
          <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="pl. Szerver szoba relé" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="location" label="Hely">
                <Input placeholder="pl. Szerver szoba" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="device_type" label="Típus" rules={[{ required: true, message: 'Kötelező' }]}>
            <Select>
              {DEVICE_TYPES.map(dt => (
                <Option key={dt.value} value={dt.value}>{dt.label}</Option>
              ))}
            </Select>
          </Form.Item>

          {/* Kapcsolat mezők */}
          {deviceType === 'shelly_1mini_gen3_relay' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Kapcsolat</Divider>
              <Form.Item
                name="shelly_host"
                label="IP / Hostnév"
                rules={[{ required: true, message: 'Kötelező a Shelly típusnál' }]}
              >
                <Input placeholder="pl. 192.168.1.50" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="shelly_auth_user" label="Felhasználónév (opcionális)">
                    <Input placeholder="admin" autoComplete="new-password" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="shelly_auth_pass" label="Jelszó (opcionális)">
                    <Input.Password placeholder="jelszó" autoComplete="new-password" />
                  </Form.Item>
                </Col>
              </Row>
              {editingDevice && (
                <Form.Item label=" " colon={false}>
                  <Button
                    icon={<ApiOutlined />}
                    loading={connTestingId === editingDevice.id}
                    onClick={() => handleConnTest(editingDevice.id, true)}
                  >
                    Kapcsolat teszt
                  </Button>
                  {connTestResult && (
                    <Alert
                      style={{ marginTop: 8 }}
                      type={connTestResult.success ? 'success' : 'error'}
                      message={connTestResult.message}
                      showIcon
                    />
                  )}
                </Form.Item>
              )}
            </>
          )}

          {/* Típus beállítások */}
          {typeConfig && typeConfig.settingsFields.length > 0 && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Típus beállítások</Divider>
              {typeConfig.settingsFields.map(f => (
                <Form.Item
                  key={f.key}
                  name={['type_settings', f.key]}
                  label={f.label}
                  help={f.help}
                >
                  {f.type === 'number' ? (
                    <InputNumber
                      min={f.min}
                      max={f.max}
                      addonAfter={f.suffix}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <Input />
                  )}
                </Form.Item>
              ))}
            </>
          )}

          {/* Jogosultság */}
          <Divider orientation="left" style={{ fontSize: 13 }}>Jogosultság (NFC trigger)</Divider>
          <Form.Item
            name="allowed_departments"
            label="Jogosult HR osztályok"
            help="Ha üres, minden bejelentkezett felhasználó aktiválhatja. Ha meg van adva, csak a kiválasztott osztályok tagjai."
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Minden bejelentkezett felhasználó..."
              optionFilterProp="children"
            >
              {departments.map(d => (
                <Option key={d.id} value={d.id}>{d.name}</Option>
              ))}
            </Select>
          </Form.Item>

          {/* Aktiválható műveletek */}
          {typeConfig && typeConfig.channels.length > 0 && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Aktiválható műveletek</Divider>
              {typeConfig.channels.map(ch => {
                const key = editingDevice ? `${editingDevice.id}-${ch.id}` : `new-${ch.id}`;
                const res = activateResults[key];
                return (
                  <div key={ch.id} style={{ marginBottom: 12 }}>
                    <Row align="middle" gutter={12}>
                      <Col flex="auto">
                        <span style={{ fontWeight: 500 }}>{ch.label}</span>
                      </Col>
                      <Col>
                        <Button
                          icon={<ThunderboltOutlined />}
                          disabled={!editingDevice}
                          loading={activatingChannel === key}
                          onClick={() => editingDevice && handleActivate(editingDevice.id, ch.id, ch.label)}
                        >
                          Aktivál (pulzus)
                        </Button>
                      </Col>
                    </Row>
                    {!editingDevice && (
                      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                        Mentés után tesztelhető
                      </div>
                    )}
                    {res && (
                      <Alert
                        style={{ marginTop: 6 }}
                        type={res.success ? 'success' : 'error'}
                        message={res.message}
                        showIcon
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}

        </Form>
      </Modal>
    </Card>
  );
};

export default IotPage;
