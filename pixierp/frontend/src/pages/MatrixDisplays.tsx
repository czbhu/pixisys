import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row,
  Select, Space, Spin, Table, Tabs, Tag, Typography, Upload, message,
} from 'antd';
import {
  ApiOutlined, DeleteOutlined, DesktopOutlined, EditOutlined, PlayCircleOutlined,
  PlusOutlined, SendOutlined, StopOutlined, UploadOutlined, VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

const { Title, Text } = Typography;

interface Display {
  id: number; name: string; serial: string; kind: string; protocol: string;
  host: string; port: number; mac: string; gateway: string; subnet: string;
  wifi_ssid: string; wifi_password: string; screen_width: number | null;
  screen_height: number | null; notes: string; is_active: boolean;
  last_seen_at: string | null; last_status: string;
}

interface Media { id: number; name: string; kind: string; file_url: string | null; file_size: number; created_at: string }
interface Program { id: number; name: string; display: number; config: any; is_active: boolean; last_sent_at: string | null }
interface LogEntry {
  id: number; display_name: string; action: string; status: string; message: string;
  request: string; response: string; created_at: string; created_by_name: string | null;
}

const fmtSize = (b: number) => b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const KIND_LABELS: Record<string, string> = { full_color: 'Teljes színes', mono: 'Egyszínű' };
const PROTO_LABELS: Record<string, string> = {
  huidu_sdk2: 'Huidu SDK2 (HDPlayer)', huidu_gen6: 'Huidu Gen6 (HD2020)', manual: 'Kézi',
};

const MatrixDisplays: React.FC = () => {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [displayModal, setDisplayModal] = useState<{ editing: Display | null } | null>(null);
  const [form] = Form.useForm();
  const [programModal, setProgramModal] = useState<{ display: Display } | null>(null);
  const [programForm] = Form.useForm();
  const [recording, setRecording] = useState<Record<number, boolean>>({});

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/matrixdisplay/displays/'),
      api.get('/matrixdisplay/media/'),
      api.get('/matrixdisplay/logs/'),
      api.get('/matrixdisplay/programs/'),
    ])
      .then(([d, m, l, p]) => {
        setDisplays(d.data?.results || d.data || []);
        setMedia(m.data?.results || m.data || []);
        setLogs(l.data?.results || l.data || []);
        setPrograms(p.data?.results || p.data || []);
      })
      .catch(() => message.error('Az adatok betöltése nem sikerült'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshRecorderStates = useCallback(async () => {
    for (const d of displays) {
      try {
        const r = await api.get(`/matrixdisplay/displays/${d.id}/recorder/status/`);
        setRecording((prev) => ({ ...prev, [d.id]: !!r.data?.running }));
      } catch { /* ignore */ }
    }
  }, [displays]);
  useEffect(() => { refreshRecorderStates(); }, [refreshRecorderStates]);

  const testConnection = async (d: Display) => {
    setTesting(d.id);
    try {
      const { data } = await api.post(`/matrixdisplay/displays/${d.id}/test_connection/`);
      if (data.ok) message.success(`${d.name}: elérhető (${data.guid?.slice(0, 10)}…)`);
      else message.warning(`${d.name}: ${data.message || data.reply || 'nem válaszolt'}`);
      const refreshed = await api.get('/matrixdisplay/displays/');
      setDisplays(refreshed.data?.results || refreshed.data || []);
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'A teszt nem sikerült');
    } finally {
      setTesting(null);
    }
  };

  const saveDisplay = async (values: any) => {
    const editing = displayModal?.editing;
    try {
      if (editing) await api.put(`/matrixdisplay/displays/${editing.id}/`, values);
      else await api.post('/matrixdisplay/displays/', values);
      message.success('Kijelző elmentve');
      setDisplayModal(null);
      loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'A mentés nem sikerült');
    }
  };

  const saveProgram = async (values: any) => {
    const display = programModal?.display;
    if (!display) return;
    const areas = (values.areas || []).map((a: any) => ({
      type: a.type,
      x: a.x ?? 0, y: a.y ?? 0, w: a.w ?? 100, h: a.h ?? 100,
      text: a.text || '',
      media_names: a.type === 'media' ? (values[`media_${a.__key}`] || []) : [],
    }));
    try {
      await api.post('/matrixdisplay/programs/', {
        name: values.name, display: display.id, config: { areas }, is_active: true,
      });
      message.success('Program elmentve');
      setProgramModal(null);
      loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'A mentés nem sikerült');
    }
  };

  const sendProgram = async (p: Program) => {
    try {
      const { data } = await api.post(`/matrixdisplay/programs/${p.id}/send/`);
      if (data.ok) message.success('Program elküldve');
      else message.warning(`A kártya nem fogadta el: ${data.reply?.slice(0, 140) || data.message}`);
      const l = await api.get('/matrixdisplay/logs/');
      setLogs(l.data?.results || l.data || []);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'A küldés nem sikerült');
    }
  };

  const uploadMedia = async (options: any) => {
    const fd = new FormData();
    fd.append('file', options.file);
    fd.append('name', options.file.name);
    try {
      await api.post('/matrixdisplay/media/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success(`${options.file.name} feltöltve`);
      const m = await api.get('/matrixdisplay/media/');
      setMedia(m.data?.results || m.data || []);
      options.onSuccess?.({});
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'A feltöltés nem sikerült');
      options.onError?.(e);
    }
  };

  const toggleRecorder = async (d: Display) => {
    try {
      if (recording[d.id]) {
        const { data } = await api.post(`/matrixdisplay/displays/${d.id}/recorder/stop/`);
        message.success('Rögzítő leállítva');
        if (data?.log_url) window.open(data.log_url, '_blank');
      } else {
        const { data } = await api.post(`/matrixdisplay/displays/${d.id}/recorder/start/`, {});
        message.success(data?.instructions || 'Rögzítő elindítva');
        Modal.info({ title: 'HDPlayer forgalom-rögzítés', content: (
          <div>
            <p>{data?.instructions}</p>
            <p>A napló: <a href={data?.log_url} target="_blank" rel="noreferrer">{data?.log_url}</a></p>
          </div>
        ) });
      }
      const r = await api.get(`/matrixdisplay/displays/${d.id}/recorder/status/`);
      setRecording((prev) => ({ ...prev, [d.id]: !!r.data?.running }));
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'A művelet nem sikerült');
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <DesktopOutlined style={{ fontSize: 28, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0 }}>Matrix kijelzők</Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDisplayModal({ editing: null }); }}>
          Új kijelző
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {displays.map((d) => (
          <Col xs={24} lg={12} key={d.id}>
            <Card
              title={<Space>{d.name}{d.is_active ? <Tag color="blue">{KIND_LABELS[d.kind]}</Tag> : <Tag>Kikapcsolva</Tag>}</Space>}
              extra={
                <Space>
                  <Button size="small" icon={<ApiOutlined />} loading={testing === d.id} onClick={() => testConnection(d)}>
                    Teszt
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => {
                    form.setFieldsValue(d);
                    setDisplayModal({ editing: d });
                  }} />
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <div><Text type="secondary">Sorozatszám:</Text> {d.serial || '–'}</div>
                <div>
                  <Text type="secondary">Cím:</Text> {d.host || '?'}:{d.port}
                  {d.mac ? <span> · MAC {d.mac}</span> : null}
                </div>
                <div><Text type="secondary">Protokoll:</Text> {PROTO_LABELS[d.protocol]}</div>
                {d.wifi_ssid && <div><Text type="secondary">WiFi:</Text> {d.wifi_ssid} ({d.wifi_password})</div>}
                <div>
                  {d.last_seen_at
                    ? <Tag color={d.last_status?.startsWith('hiba') ? 'red' : 'green'}>
                        {dayjs(d.last_seen_at).format('MM.DD. HH:mm')} – {d.last_status || 'ok'}
                      </Tag>
                    : <Tag color="default">még nem tesztelt</Tag>}
                </div>
                {d.notes && <Text type="secondary" style={{ fontSize: 12 }}>{d.notes}</Text>}
                <Space wrap style={{ marginTop: 4 }}>
                  <Button size="small" icon={<SendOutlined />} onClick={() => {
                    programForm.resetFields();
                    programForm.setFieldsValue({ areas: [{ type: 'text', x: 0, y: 0, w: 100, h: 100 }] });
                    setProgramModal({ display: d });
                  }}>
                    Program készítés
                  </Button>
                  {d.protocol === 'huidu_sdk2' && (
                    <Popconfirm
                      title={recording[d.id] ? 'Rögzítő leállítása?' : 'HDPlayer forgalom-rögzítő indítása?'}
                      onConfirm={() => toggleRecorder(d)}
                    >
                      <Button size="small" danger={recording[d.id]} icon={recording[d.id] ? <StopOutlined /> : <VideoCameraOutlined />}>
                        {recording[d.id] ? 'Rögzítés leáll' : 'HDPlayer rögzítés'}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'programs',
            label: 'Programok',
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" size="small" dataSource={programs} pagination={{ pageSize: 8 }}
                  locale={{ emptyText: <Empty description="Még nincs program" /> }}
                  columns={[
                    { title: 'Név', dataIndex: 'name' },
                    { title: 'Kijelző', dataIndex: 'display', render: (v: number) => displays.find((d) => d.id === v)?.name || v },
                    { title: 'Zónák', render: (_: any, r: Program) => (r.config?.areas || []).length },
                    { title: 'Utoljára küldve', render: (_: any, r: Program) => r.last_sent_at ? dayjs(r.last_sent_at).format('YYYY.MM.DD. HH:mm') : '–' },
                    {
                      title: '', width: 150,
                      render: (_: any, r: Program) => (
                        <Space>
                          <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => sendProgram(r)}>Küldés</Button>
                          <Popconfirm title="Törlöd?" onConfirm={async () => {
                            await api.delete(`/matrixdisplay/programs/${r.id}/`); loadAll();
                          }}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'media',
            label: 'Média könyvtár',
            children: (
              <Card
                extra={(
                  <Upload customRequest={uploadMedia} showUploadList={false} accept="image/*,video/*,audio/*">
                    <Button icon={<UploadOutlined />}>Feltöltés</Button>
                  </Upload>
                )}
                styles={{ body: { padding: 0 } }}
              >
                <Table
                  rowKey="id" size="small" dataSource={media} pagination={{ pageSize: 8 }}
                  locale={{ emptyText: <Empty description="Nincs feltöltve média" /> }}
                  columns={[
                    {
                      title: 'Név', dataIndex: 'name',
                      render: (v: string, r: Media) => r.kind === 'image' && r.file_url
                        ? <Space><img src={r.file_url} alt={v} style={{ width: 40, height: 28, objectFit: 'cover', borderRadius: 4 }} />{v}</Space>
                        : v,
                    },
                    { title: 'Típus', dataIndex: 'kind', render: (v: string) => <Tag>{v}</Tag> },
                    { title: 'Méret', dataIndex: 'file_size', render: (v: number) => fmtSize(v || 0) },
                    { title: 'Feltöltve', render: (_: any, r: Media) => dayjs(r.created_at).format('YYYY.MM.DD. HH:mm') },
                    {
                      title: '', width: 60,
                      render: (_: any, r: Media) => (
                        <Popconfirm title="Törlöd?" onConfirm={async () => {
                          await api.delete(`/matrixdisplay/media/${r.id}/`); loadAll();
                        }}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'logs',
            label: 'Napló',
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" size="small" dataSource={logs} pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Idő', width: 130, render: (_: any, r: LogEntry) => dayjs(r.created_at).format('MM.DD. HH:mm:ss') },
                    { title: 'Kijelző', dataIndex: 'display_name' },
                    { title: 'Művelet', dataIndex: 'action' },
                    {
                      title: 'Állapot', dataIndex: 'status', width: 90,
                      render: (v: string) => <Tag color={v === 'ok' ? 'green' : 'red'}>{v}</Tag>,
                    },
                    { title: 'Üzenet', dataIndex: 'message', ellipsis: true },
                  ]}
                  expandable={{
                    expandedRowRender: (r: LogEntry) => (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {r.request && <div><Text strong>Kérés</Text><pre style={{ maxHeight: 240, overflow: 'auto', fontSize: 11 }}>{r.request}</pre></div>}
                        {r.response && <div><Text strong>Válasz</Text><pre style={{ maxHeight: 240, overflow: 'auto', fontSize: 11 }}>{r.response}</pre></div>}
                      </div>
                    ),
                    rowExpandable: (r: LogEntry) => !!(r.request || r.response),
                  }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        open={!!displayModal}
        title={displayModal?.editing ? `Kijelző szerkesztése – ${displayModal.editing.name}` : 'Új kijelző'}
        onCancel={() => setDisplayModal(null)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={saveDisplay}>
          <Form.Item name="name" label="Név" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="serial" label="Sorozatszám"><Input /></Form.Item>
          <Space style={{ display: 'flex' }} size={12}>
            <Form.Item name="kind" label="Típus" initialValue="full_color" style={{ minWidth: 200 }}>
              <Select options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="protocol" label="Protokoll" initialValue="huidu_sdk2" style={{ minWidth: 220 }}>
              <Select options={Object.entries(PROTO_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size={12}>
            <Form.Item name="host" label="IP cím"><Input style={{ width: 180 }} /></Form.Item>
            <Form.Item name="port" label="Port" initialValue={10001}><InputNumber /></Form.Item>
            <Form.Item name="mac" label="MAC"><Input style={{ width: 170 }} /></Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size={12}>
            <Form.Item name="wifi_ssid" label="WiFi SSID"><Input /></Form.Item>
            <Form.Item name="wifi_password" label="WiFi jelszó"><Input /></Form.Item>
          </Space>
          <Form.Item name="notes" label="Megjegyzés"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked" initialValue={true}><Input type="checkbox" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!programModal}
        title={`Program készítés – ${programModal?.display?.name || ''}`}
        onCancel={() => setProgramModal(null)}
        onOk={() => programForm.submit()}
        width={720}
        destroyOnClose
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="Zónák százalékos koordinátákkal (0–100). A küldés a kártya támogatásától függ – a naplóban látod a választ."
        />
        <Form form={programForm} layout="vertical" onFinish={saveProgram}>
          <Form.Item name="name" label="Program neve" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.List name="areas">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 8 }}
                    extra={<Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />}>
                    <Space wrap style={{ display: 'flex' }}>
                      <Form.Item name={[field.name, 'type']} label="Zóna típusa" initialValue="text" noStyle>
                        <Select style={{ width: 140 }} options={[
                          { value: 'text', label: 'Szöveg' },
                          { value: 'media', label: 'Média (kép/videó)' },
                        ]} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'x']} label="X %" initialValue={0} noStyle><InputNumber min={0} max={100} /></Form.Item>
                      <Form.Item name={[field.name, 'y']} label="Y %" initialValue={0} noStyle><InputNumber min={0} max={100} /></Form.Item>
                      <Form.Item name={[field.name, 'w']} label="Szél. %" initialValue={100} noStyle><InputNumber min={1} max={100} /></Form.Item>
                      <Form.Item name={[field.name, 'h']} label="Mag. %" initialValue={100} noStyle><InputNumber min={1} max={100} /></Form.Item>
                    </Space>
                    <Form.Item noStyle shouldUpdate={(a, b) => a.areas?.[field.name]?.type !== b.areas?.[field.name]?.type}>
                      {({ getFieldValue }) => {
                        const t = getFieldValue(['areas', field.name, 'type']);
                        return t === 'media' ? (
                          <Form.Item name={`media_${field.key}`} label="Média fájlok" style={{ marginTop: 8, marginBottom: 0 }}>
                            <Select
                              mode="multiple" placeholder="Válassz a médiatárból"
                              options={media.map((m) => ({ value: m.name, label: `${m.name} (${m.kind})` }))}
                            />
                          </Form.Item>
                        ) : (
                          <Form.Item name={[field.name, 'text']} label="Szöveg" style={{ marginTop: 8, marginBottom: 0 }}>
                            <Input.TextArea rows={2} placeholder="A kijelzőn megjelenő szöveg" />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                  </Card>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ type: 'text', x: 0, y: 0, w: 100, h: 100 })}>
                  Zóna hozzáadása
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default MatrixDisplays;
