import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Switch, Tag,
  Popconfirm, message, Divider, Alert, Typography, Row, Col, InputNumber,
  Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined,
  CloseCircleOutlined, CopyOutlined, ScanOutlined,
} from '@ant-design/icons';
import api from '../../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const FRONTEND_BASE_URL = window.location.origin;

interface IoTDevice {
  id: number;
  name: string;
  device_type: string;
  location: string;
  is_active: boolean;
}

interface NfcTag {
  id: number;
  name: string;
  tag_type: string;
  tag_type_display: string;
  location: string;
  is_active: boolean;
  iot_device: number | null;
  iot_device_name: string | null;
  iot_device_type: string | null;
  iot_channel: number;
  sun_key: string;
  last_counter: number;
  created_at: string;
  updated_at: string;
}

const TAG_TYPES = [
  { value: 'ntag215', label: 'NTAG215' },
  { value: 'ntag424', label: 'NTAG424' },
];

const DEVICE_TYPE_CHANNELS: Record<string, { id: number; label: string }[]> = {
  shelly_1mini_gen3_relay: [
    { id: 0, label: 'Csatorna 0' },
  ],
};

const NfcPage: React.FC = () => {
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [iotDevices, setIotDevices] = useState<IoTDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<NfcTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const selectedDeviceId = Form.useWatch('iot_device', form);
  const tagType = Form.useWatch('tag_type', form);

  const selectedDevice = iotDevices.find(d => d.id === selectedDeviceId) ?? null;
  const channelOptions = selectedDevice
    ? (DEVICE_TYPE_CHANNELS[selectedDevice.device_type] ?? [{ id: 0, label: 'Csatorna 0' }])
    : [];

  const loadData = async () => {
    setLoading(true);
    try {
      const [tagsRes, devicesRes] = await Promise.all([
        api.get('/nfc-tags/'),
        api.get('/iot-devices/'),
      ]);
      const tagsData = tagsRes.data?.results ?? tagsRes.data;
      const devicesData = devicesRes.data?.results ?? devicesRes.data;
      setTags(Array.isArray(tagsData) ? tagsData : []);
      setIotDevices(Array.isArray(devicesData) ? devicesData : []);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Nem sikerült betölteni az adatokat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openAdd = () => {
    setEditingTag(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, tag_type: 'ntag215', iot_channel: 0 });
    setModalOpen(true);
  };

  const openEdit = (tag: NfcTag) => {
    setEditingTag(tag);
    form.setFieldsValue({
      name: tag.name,
      tag_type: tag.tag_type,
      location: tag.location,
      is_active: tag.is_active,
      iot_device: tag.iot_device ?? undefined,
      iot_channel: tag.iot_channel,
      sun_key: tag.sun_key,
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
      if (editingTag) {
        await api.put(`/nfc-tags/${editingTag.id}/`, values);
        message.success('NFC tag frissítve');
      } else {
        await api.post('/nfc-tags/', values);
        message.success('NFC tag hozzáadva');
      }
      setModalOpen(false);
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/nfc-tags/${id}/`);
      message.success('NFC tag törölve');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Törlési hiba');
    }
  };

  const getTriggerUrl = (id: number) =>
    `${FRONTEND_BASE_URL}/api/v1/nfc-tags/${id}/trigger/`;

  const getTriggerUrlNtag424Template = (id: number) =>
    `${FRONTEND_BASE_URL}/api/v1/nfc-tags/${id}/trigger/?e=00000000000000000000000000000000&m=0000000000000000`;

  // Az NDEF File 2 felépítése (non-SR, long record):
  //   2 bájt NLEN + 1 header + 1 type_len + 4 payload_len + 1 type 'U' + 1 URI prefix = 10 bájt overhead
  // Offset = 10 + (karakter pozíció az URL-ben, https:// nélkül)
  const getTagWriterOffsets = (id: number) => {
    const NDEF_OVERHEAD = 10;
    const baseWithoutHttps = `${window.location.host}/api/v1/nfc-tags/${id}/trigger/?e=`;
    const piccOff = NDEF_OVERHEAD + baseWithoutHttps.length;
    const macOff = piccOff + 32 + 3; // 32 hex (EncPICC) + "&m="
    return { piccOff, macOff };
  };

  const generateSunKey = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    form.setFieldValue('sun_key', hex);
  };

  const handleCopy = (id: number) => {
    navigator.clipboard.writeText(getTriggerUrl(id)).then(() => {
      setCopiedId(id);
      message.success('URL másolva');
      setTimeout(() => setCopiedId(null), 2000);
    });
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
      dataIndex: 'tag_type_display',
      key: 'tag_type_display',
      render: (text: string) => <Tag color="purple">{text}</Tag>,
    },
    {
      title: 'IoT eszköz / csatorna',
      key: 'iot',
      render: (_: any, record: NfcTag) =>
        record.iot_device_name
          ? <span>{record.iot_device_name} — Cs. {record.iot_channel}</span>
          : <Text type="secondary">—</Text>,
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
      title: 'Trigger URL',
      key: 'url',
      render: (_: any, record: NfcTag) => (
        <Tooltip title={getTriggerUrl(record.id)}>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.id)}
            type={copiedId === record.id ? 'primary' : 'default'}
          >
            URL másolása
          </Button>
        </Tooltip>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: NfcTag) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Szerkeszt
          </Button>
          <Popconfirm
            title="Biztosan törlöd ezt az NFC taget?"
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
      title={<Title level={4} style={{ margin: 0 }}>NFC tagek</Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Új NFC tag
        </Button>
      }
    >
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        icon={<ScanOutlined />}
        message="Hogyan programozd be az NFC taget?"
        description={
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
            <li>Mentés után a <b>„URL másolása"</b> gombbal másold ki a tag trigger URL-jét.</li>
            <li><b>NTAG215 (egyszerű):</b> NFC Tools app → Write → Add a record → URL/URI → illeszd be az URL-t → Write.</li>
            <li><b>NTAG424 (biztonságos SUN):</b> NXP TagWriter app → <i>Write tags</i> → “New NDEF Message” → “Link/URI” → URL beírása, majd SDM beállítása — az alábbi lépéseket kövesd.</li>
            <li>A tag érintésekor a telefon automatikusan meghívja az API-t, ami aktiválja a Shelly relét.</li>
          </ul>
        }
      />

      <Table
        dataSource={tags}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        open={modalOpen}
        title={editingTag ? 'NFC tag szerkesztése' : 'Új NFC tag'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={saving}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="pl. Szerver szoba ajtó" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tag_type" label="Tag típusa" rules={[{ required: true, message: 'Kötelező' }]}>
                <Select>
                  {TAG_TYPES.map(t => (
                    <Option key={t.value} value={t.value}>{t.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="location" label="Hely / leírás">
            <Input placeholder="pl. Szerver szoba bejárat" />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13 }}>IoT kapcsolat</Divider>

          <Form.Item name="iot_device" label="IoT eszköz">
            <Select
              allowClear
              placeholder="Válassz eszközt..."
              onChange={() => form.setFieldValue('iot_channel', 0)}
            >
              {iotDevices.map(d => (
                <Option key={d.id} value={d.id}>
                  {d.name}{d.location ? ` — ${d.location}` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedDevice && channelOptions.length > 0 && (
            <Form.Item name="iot_channel" label="Csatorna">
              <Select>
                {channelOptions.map(ch => (
                  <Option key={ch.id} value={ch.id}>{ch.label}</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {!selectedDevice && (
            <Form.Item name="iot_channel" label="Csatorna">
              <InputNumber min={0} max={10} style={{ width: '100%' }} />
            </Form.Item>
          )}

          {tagType === 'ntag424' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>NTAG424 SUN biztonság</Divider>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Az AES kulcs minden taghez egyedi legyen. Ezt a kulcsot kell beállítani a TagWriter-ben SDMMetaReadKey és SDMFileReadKey (Key 01) értékeként."
              />
              <Form.Item
                name="sun_key"
                label="SUN AES-128 kulcs (32 hex karakter)"
                rules={[
                  { required: true, message: 'NTAG424 taghez kötelező' },
                  { pattern: /^[0-9a-fA-F]{32}$/, message: 'Pontosan 32 hex karakter kell (0-9, a-f)' },
                ]}
              >
                <Input
                  placeholder="pl. 00000000000000000000000000000000"
                  maxLength={32}
                  addonAfter={
                    <Button size="small" type="link" style={{ height: 'auto', padding: 0 }} onClick={generateSunKey}>
                      Generál
                    </Button>
                  }
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            </>
          )}

          {editingTag && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Tag URL</Divider>
              {editingTag.tag_type === 'ntag424' ? (() => {
                const { piccOff, macOff } = getTagWriterOffsets(editingTag.id);
                return (
                <>
                <Alert
                  type="warning"
                  message="NTAG424 DNA SDM konfigurációs lépések (NXP TagWriter)"
                  description={
                    <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                      <li>Generálj egy <b>SUN AES kulcsot</b> a lenti mezőben, majd <b>mentsd el</b> a taget itt a rendszerben.</li>
                      <li><b>NXP TagWriter</b> app → <b>Write tags</b> → <i>New dataset</i> → <i>Link / URI</i>.</li>
                      <li><b>URI Type</b> = <i>Custom URL</i> → <b>Enter URL</b> mezőbe másold be a lenti URL template-t (pontosan, a <code>?e=</code> 32 nullával és <code>&amp;m=</code> 16 nullával!), majd koppints a <b>Configure Mirroring</b> gombra.</li>
                      <li>A <b>Configure Mirroring</b> képernyőn (<i>Select Card Type: NTAG 424 DNA</i>):
                        <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                          <li><b>Enable SDM Mirroring</b> ✓ bepipálni</li>
                          <li><b>SDM Meta Read Access Right</b>: <code>01</code></li>
                          <li>Enable UID Mirroring: hagyd üresen</li>
                          <li>Enable Counter Mirroring: hagyd üresen</li>
                          <li>Az URL mezőben koppintsd a kurzort az <code>?e=</code> utáni 32 nulla <b>legelejére</b> → <b>Set PICC Data Offset</b> → az érték <b>{piccOff}</b> kell legyen</li>
                          <li><b>Derivation Key for CMAC Calculation</b>: <code>01</code></li>
                          <li>Az URL mezőben koppintsd a kurzort az <code>&amp;m=</code> utáni 16 nulla <b>legelejére</b> → <b>SDM MAC Input Offset: Set Offset</b> majd <b>SDM MAC Offset: Set Offset</b> → az érték <b>{macOff}</b> kell legyen</li>
                          <li>→ <b>OK</b></li>
                        </ul>
                      </li>
                      <li>Koppints a <b>Write tags</b> gombra → tartsd a telefont a taghez.</li>
                      <li>A Key 01-et a tag memóriájában is be kell állítani: <b>Protect tags</b> → olvasd be a taget → <i>Change keys</i> → <i>Key 01</i> = a lenti SUN AES kulcs (előtte hitelesítsd magad az App Master Key-jel: <code>00000000000000000000000000000000</code>).</li>
                      <li>
                        URL template — másold be a 3. lépésnél:<br />
                        <Text code copyable style={{ wordBreak: 'break-all', fontSize: 11 }}>
                          {getTriggerUrlNtag424Template(editingTag.id)}
                        </Text>
                      </li>
                    </ol>
                  }
                />
                <Alert
                  type="error"
                  showIcon
                  style={{ marginTop: 8 }}
                  message={<b>„Store failed" hiba esetén (a sima URL írás működik):</b>}
                  description={
                    <ol style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                      <li>Leggyakoribb ok: a <b>PICC Data Offset</b> és a <b>MAC Offset</b> ugyanarra a pozícióra mutat (pl. mindkettő 56). Ez akkor történik, ha <code>?sdm=</code> vagy csak 16 zeros template-et használsz. A mi template-ünkben a két placeholder különböző pozícióban van: <b>PICC offset = {piccOff}</b>, <b>MAC offset = {macOff}</b>.</li>
                      <li>Ha az automatikus offset-érzékelés (kurzor-koppintás) nem ad helyes értéket, írd be manuálisan: PICC Data Offset mezőbe <b>{piccOff}</b>, MAC Input és MAC Offset mezőkbe <b>{macOff}</b>.</li>
                      <li>Ha a hiba megmarad: <b>Erase tags</b> → érintsd a taget, majd kezdd újra a fenti lépéseket az app template URL-jével.</li>
                    </ol>
                  }
                />
                </>
                );
              })() : (
                <Alert
                  type="success"
                  message="Ezt az URL-t írd az NFC tagbe:"
                  description={
                    <Text code copyable style={{ wordBreak: 'break-all' }}>
                      {getTriggerUrl(editingTag.id)}
                    </Text>
                  }
                />
              )}
            </>
          )}

        </Form>
      </Modal>
    </Card>
  );
};

export default NfcPage;
