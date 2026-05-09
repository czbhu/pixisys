import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Upload,
  Divider,
  List,
  Segmented,
  Popconfirm,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../services/api';
import { ticketsService } from '../../services/ticketsService';
import { useAuth } from '../../contexts/AuthContext';
import { deepSearchMatch } from '../../utils/searchUtils';
import EnhancedTable from '../../components/EnhancedTable';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

const { Dragger } = Upload;

interface TicketTopic {
  id: number;
  name: string;
}

interface TicketType {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface TicketMessage {
  id: number;
  body_html: string;
  author_name_display: string;
  created_at: string;
  attachments: Array<{
    id: number;
    file_url: string;
    file_name: string;
  }>;
}

interface TicketItem {
  id: number;
  ticket_number: string;
  title: string;
  ticket_type: string;
  ticket_type_display: string;
  status: string;
  status_display: string;
  priority: string;
  priority_display: string;
  audience: string;
  audience_display: string;
  topic?: number | null;
  topic_name?: string;
  departments: number[];
  department_names: string[];
  assigned_users: number[];
  assigned_user_names: string[];
  can_manage_status: boolean;
  is_first_response_overdue: boolean;
  is_resolution_overdue: boolean;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  requester_name?: string;
  requester_email?: string;
  public_url?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  messages: TicketMessage[];
}

type TicketsMode = 'list' | 'settings' | 'personal';

interface TicketsProps {
  mode?: TicketsMode;
}

const statusColor: Record<string, string> = {
  open: 'blue',
  in_progress: 'orange',
  answered: 'green',
  closed: 'default',
};

const Tickets: React.FC<TicketsProps> = ({ mode = 'list' }) => {
  const { user } = useAuth();
  const isSettingsMode = mode === 'settings';
  const isPersonalMode = mode === 'personal';
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [topics, setTopics] = useState<TicketTopic[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [replying, setReplying] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'assigned' | 'open' | 'overdue' | 'external'>(isPersonalMode ? 'mine' : 'all');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [typeSaving, setTypeSaving] = useState(false);
  const [createMessageHtml, setCreateMessageHtml] = useState('');
  const [replyHtml, setReplyHtml] = useState('');
  const [detailStatus, setDetailStatus] = useState<string>('open');
  const [createFiles, setCreateFiles] = useState<UploadFile[]>([]);
  const [replyFiles, setReplyFiles] = useState<UploadFile[]>([]);
  const [attPreviewOpen, setAttPreviewOpen] = useState(false);
  const [attPreviewUrl, setAttPreviewUrl] = useState<string | null>(null);
  const [attPreviewTitle, setAttPreviewTitle] = useState('');
  const [form] = Form.useForm();
  const [typeForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ticketData, topicData, typeData, departmentRes, userRes] = await Promise.all([
        isPersonalMode ? ticketsService.getMyTickets() : ticketsService.getTickets(),
        ticketsService.getTopics(),
        ticketsService.getTicketTypes(),
        api.get('/hr/departments/'),
        api.get('/users/'),
      ]);
      const statsData = await ticketsService.getStats();

      setTickets(Array.isArray(ticketData) ? ticketData : []);
      setTopics(Array.isArray(topicData) ? topicData : []);
      setTicketTypes(Array.isArray(typeData) ? typeData : []);
      setDepartments(departmentRes.data.results || departmentRes.data || []);
      setUsers(userRes.data.results || userRes.data || []);
      setStats(statsData || null);
    } catch (error) {
      message.error('Nem sikerült betölteni a jegy adatokat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [isPersonalMode]);

  const sortedTickets = useMemo(() => {
    let filtered = [...tickets];

    if (isPersonalMode && user?.id) {
      filtered = filtered.filter((ticket) => ticket.created_by === user.id);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((ticket) => ticket.status === statusFilter);
    }

    if (quickFilter === 'mine' && user?.id) {
      filtered = filtered.filter((ticket) => ticket.created_by === user.id);
    }
    if (quickFilter === 'assigned' && user?.id) {
      filtered = filtered.filter((ticket) => (ticket.assigned_users || []).includes(user.id));
    }
    if (quickFilter === 'open') {
      filtered = filtered.filter((ticket) => ['open', 'in_progress', 'answered'].includes(ticket.status));
    }
    if (quickFilter === 'overdue') {
      filtered = filtered.filter((ticket) => ticket.is_first_response_overdue || ticket.is_resolution_overdue);
    }
    if (quickFilter === 'external') {
      filtered = filtered.filter((ticket) => ticket.audience === 'external' || ticket.audience === 'both');
    }

    if (searchText?.trim()) {
      filtered = filtered.filter((ticket) => deepSearchMatch(searchText, ticket));
    }

    return filtered.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [tickets, quickFilter, searchText, statusFilter, user?.id, isPersonalMode]);

  const openDetail = async (ticketId: number) => {
    try {
      const ticket = await ticketsService.getTicket(ticketId);
      setSelectedTicket(ticket);
      setDetailStatus(ticket.status);
      setReplyHtml('');
      setReplyFiles([]);
      setDetailOpen(true);
    } catch {
      message.error('Nem sikerült betölteni a jegyet');
    }
  };

  const loadTypesOnly = async () => {
    try {
      const typeData = await ticketsService.getTicketTypes();
      setTicketTypes(Array.isArray(typeData) ? typeData : []);
    } catch {
      message.error('Nem sikerült betölteni a jegy típusokat');
    }
  };

  const openCreateTypeModal = () => {
    setEditingType(null);
    typeForm.resetFields();
    typeForm.setFieldsValue({ is_active: true, sort_order: 0 });
    setTypeModalOpen(true);
  };

  const openEditTypeModal = (item: TicketType) => {
    setEditingType(item);
    typeForm.setFieldsValue(item);
    setTypeModalOpen(true);
  };

  const handleSaveType = async () => {
    try {
      const values = await typeForm.validateFields();
      setTypeSaving(true);
      if (editingType) {
        await ticketsService.updateTicketType(editingType.id, values);
        message.success('Jegy típus módosítva');
      } else {
        await ticketsService.createTicketType(values);
        message.success('Jegy típus létrehozva');
      }
      setTypeModalOpen(false);
      setEditingType(null);
      typeForm.resetFields();
      await loadTypesOnly();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error('Nem sikerült menteni a jegy típust');
    } finally {
      setTypeSaving(false);
    }
  };

  const handleDeleteType = async (id: number) => {
    try {
      await ticketsService.deleteTicketType(id);
      message.success('Jegy típus törölve');
      await loadTypesOnly();
    } catch {
      message.error('Nem sikerült törölni a jegy típust');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (!createMessageHtml || !createMessageHtml.replace(/<[^>]+>/g, '').trim()) {
        message.warning('A nyitó üzenet kötelező');
        return;
      }

      const payload = new FormData();
      payload.append('title', values.title);
      payload.append('ticket_type', values.ticket_type);
      payload.append('audience', values.audience);
      payload.append('priority', values.priority || 'normal');
      payload.append('status', 'open');
      payload.append('initial_message_html', createMessageHtml);

      if (values.topic) payload.append('topic', String(values.topic));
      if (values.requester_name) payload.append('requester_name', values.requester_name);
      if (values.requester_email) payload.append('requester_email', values.requester_email);

      (values.departments || []).forEach((departmentId: number) => {
        payload.append('departments', String(departmentId));
      });
      (values.assigned_users || []).forEach((userId: number) => {
        payload.append('assigned_users', String(userId));
      });

      createFiles.forEach((fileItem) => {
        if (fileItem.originFileObj) {
          payload.append('files', fileItem.originFileObj as File);
        }
      });

      setCreating(true);
      await ticketsService.createTicket(payload);
      message.success('Jegy létrehozva');
      setCreateOpen(false);
      setCreateMessageHtml('');
      setCreateFiles([]);
      form.resetFields();
      loadAll();
    } catch (error) {
      if ((error as any)?.errorFields) return;
      message.error('Nem sikerült létrehozni a jegyet');
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket) return;
    if (!replyHtml || !replyHtml.replace(/<[^>]+>/g, '').trim()) {
      message.warning('A válasz üzenet kötelező');
      return;
    }

    const payload = new FormData();
    payload.append('body_html', replyHtml);
    replyFiles.forEach((fileItem) => {
      if (fileItem.originFileObj) {
        payload.append('files', fileItem.originFileObj as File);
      }
    });

    try {
      setReplying(true);
      await ticketsService.replyToTicket(selectedTicket.id, payload);
      const freshTicket = await ticketsService.getTicket(selectedTicket.id);
      setSelectedTicket(freshTicket);
      setReplyHtml('');
      setReplyFiles([]);
      await loadAll();
      message.success('Válasz elküldve');
    } catch {
      message.error('Nem sikerült elküldeni a választ');
    } finally {
      setReplying(false);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedTicket) return;
    try {
      setStatusSaving(true);
      const updated = await ticketsService.setStatus(selectedTicket.id, detailStatus);
      setSelectedTicket(updated);
      await loadAll();
      message.success('Státusz frissítve');
    } catch {
      message.error('Nem sikerült frissíteni a státuszt');
    } finally {
      setStatusSaving(false);
    }
  };

  const columns = [
    {
      title: 'Jegyszám',
      dataIndex: 'ticket_number',
      key: 'ticket_number',
      width: 130,
      sorter: (a: any, b: any) => (a.ticket_number || '').localeCompare(b.ticket_number || ''),
    },
    {
      title: 'Cím',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      sorter: (a: any, b: any) => (a.title || '').localeCompare(b.title || ''),
    },
    {
      title: 'Típus',
      dataIndex: 'ticket_type_display',
      key: 'ticket_type_display',
      width: 120,
      sorter: (a: any, b: any) => (a.ticket_type_display || '').localeCompare(b.ticket_type_display || ''),
    },
    {
      title: 'Státusz',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || ''),
      render: (status: string, record: TicketItem) => (
        <Space>
          <Tag color={statusColor[status] || 'default'}>{record.status_display}</Tag>
          {(record.is_first_response_overdue || record.is_resolution_overdue) ? <Tag color="red">Lejárt</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Témakör',
      dataIndex: 'topic_name',
      sorter: (a: any, b: any) => (a.topic_name || '').localeCompare(b.topic_name || ''),
      key: 'topic_name',
      width: 140,
      render: (name: string) => name || '-',
    },
    {
      title: 'Címzettek',
      key: 'targets',
      width: 260,
      render: (_: any, record: TicketItem) => {
        const assigned = (record.assigned_user_names || []).slice(0, 2).join(', ');
        const depts = (record.department_names || []).slice(0, 2).join(', ');
        return [assigned, depts].filter(Boolean).join(' | ') || '-';
      },
    },
    {
      title: 'Létrehozta',
      dataIndex: 'created_by_name',
      sorter: (a: any, b: any) => (a.created_by_name || '').localeCompare(b.created_by_name || ''),
      key: 'created_by_name',
      width: 150,
      render: (name: string) => name || '-',
    },
    {
      title: 'Dátum',
      dataIndex: 'created_at',
      sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''),
      key: 'created_at',
      width: 160,
      render: (value: string) => new Date(value).toLocaleString('hu-HU'),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 110,
      render: (_: any, record: TicketItem) => (
        <Button icon={<EyeOutlined />} size="small" onClick={() => openDetail(record.id)}>
          Megnyit
        </Button>
      ),
    },
  ];

  if (isSettingsMode) {
    return (
      <>
        <Card
          title="Jegy beállítások"
          extra={<Button onClick={openCreateTypeModal}>Új típus</Button>}
        >
          <Table
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={ticketTypes}
            columns={[
              { title: 'Kód', dataIndex: 'code', key: 'code', width: 160 },
              { title: 'Megnevezés', dataIndex: 'name', key: 'name' },
              { title: 'Sorrend', dataIndex: 'sort_order', key: 'sort_order', width: 120 },
              {
                title: 'Aktív',
                key: 'is_active',
                width: 100,
                render: (_: any, record: TicketType) => (record.is_active ? <Tag color="green">Igen</Tag> : <Tag>Nem</Tag>),
              },
              {
                title: 'Műveletek',
                key: 'actions',
                width: 160,
                render: (_: any, record: TicketType) => (
                  <Space>
                    <Button size="small" onClick={() => openEditTypeModal(record)}>Szerkeszt</Button>
                    <Popconfirm title="Biztosan törlöd ezt a típust?" onConfirm={() => handleDeleteType(record.id)} okText="Igen" cancelText="Mégse">
                      <Button size="small" danger>Törlés</Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>

        <Modal
          title={editingType ? 'Jegy típus szerkesztése' : 'Új jegy típus'}
          open={typeModalOpen}
          onCancel={() => {
            setTypeModalOpen(false);
            setEditingType(null);
            typeForm.resetFields();
          }}
          onOk={handleSaveType}
          okText="Mentés"
          cancelText="Mégse"
          confirmLoading={typeSaving}
        >
          <Form form={typeForm} layout="vertical">
            <Form.Item name="code" label="Kód" rules={[{ required: true, message: 'Kötelező mező' }]}>
              <Input placeholder="pl. complaint" />
            </Form.Item>
            <Form.Item name="name" label="Megnevezés" rules={[{ required: true, message: 'Kötelező mező' }]}>
              <Input placeholder="pl. Reklamáció" />
            </Form.Item>
            <Form.Item name="sort_order" label="Sorrend" initialValue={0}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="is_active" label="Aktív" initialValue={true}>
              <Select
                options={[
                  { value: true, label: 'Igen' },
                  { value: false, label: 'Nem' },
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  return (
    <>
      <EnhancedTable
        tableKey="tickets"
        rowKey="id"
        loading={loading}
        columns={columns as any}
        dataSource={sortedTickets}
        cardTitle={isPersonalMode ? 'Saját jegyeim' : 'Jegyek'}
        innerHeader={
          <>
            {!isPersonalMode && (
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col><Tag color="blue">Összes: {stats?.total ?? 0}</Tag></Col>
                <Col><Tag color="processing">Nyitott: {stats?.open ?? 0}</Tag></Col>
                <Col><Tag color="orange">Folyamatban: {stats?.in_progress ?? 0}</Tag></Col>
                <Col><Tag color="green">Megválaszolva: {stats?.answered ?? 0}</Tag></Col>
                <Col><Tag color="default">Lezárt: {stats?.closed ?? 0}</Tag></Col>
                <Col><Tag color="red">Lejárt: {stats?.overdue ?? 0}</Tag></Col>
              </Row>
            )}
            {!isPersonalMode && (
              <div style={{ marginBottom: 12 }}>
                <Segmented
                  value={quickFilter}
                  onChange={(value) => setQuickFilter(value as any)}
                  options={[
                    { value: 'all', label: 'Összes' },
                    { value: 'mine', label: 'Saját' },
                    { value: 'assigned', label: 'Nekem kiosztott' },
                    { value: 'open', label: 'Nyitott' },
                    { value: 'overdue', label: 'Lejárt' },
                    { value: 'external', label: 'Külsős' },
                  ]}
                />
              </div>
            )}
          </>
        }
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Keresés jegyek között"
        toolbarExtra={
          <Space>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 160 }}
              options={[
                { value: 'all', label: 'Minden státusz' },
                { value: 'open', label: 'Nyitott' },
                { value: 'in_progress', label: 'Folyamatban' },
                { value: 'answered', label: 'Megválaszolva' },
                { value: 'closed', label: 'Lezárt' },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Új jegy
            </Button>
          </Space>
        }
        pagination={{ pageSize: 20 }}
        cardBreakpoint={950}
      />

      <Modal
        title="Új jegy"
        open={createOpen}
        width={920}
        onCancel={() => {
          setCreateOpen(false);
          setCreateMessageHtml('');
          setCreateFiles([]);
          form.resetFields();
        }}
        onOk={handleCreate}
        okText="Jegy létrehozása"
        cancelText="Mégse"
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Jegy címe" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Input placeholder="Rövid összefoglaló" />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="ticket_type" label="Típus" initialValue="other" rules={[{ required: true, message: 'Kötelező' }]} style={{ minWidth: 180 }}>
              <Select
                options={(ticketTypes || []).filter((item) => item.is_active).map((item) => ({ value: item.code, label: item.name }))}
              />
            </Form.Item>

            <Form.Item name="audience" label="Címzettek" initialValue="internal" rules={[{ required: true, message: 'Kötelező' }]} style={{ minWidth: 180 }}>
              <Select
                options={[
                  { value: 'internal', label: 'Belsős' },
                  { value: 'external', label: 'Külsős' },
                  { value: 'both', label: 'Mindkettő' },
                ]}
              />
            </Form.Item>

            <Form.Item name="priority" label="Prioritás" initialValue="normal" style={{ minWidth: 160 }}>
              <Select
                options={[
                  { value: 'low', label: 'Alacsony' },
                  { value: 'normal', label: 'Normál' },
                  { value: 'high', label: 'Magas' },
                  { value: 'urgent', label: 'Sürgős' },
                ]}
              />
            </Form.Item>
          </Space>

          <Form.Item name="topic" label="Témakör">
            <Select
              allowClear
              placeholder="Válassz témakört"
              options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
            />
          </Form.Item>

          <Form.Item name="departments" label="HR osztályok">
            <Select
              mode="multiple"
              allowClear
              placeholder="Válassz HR osztályokat"
              options={departments.map((department) => ({ value: department.id, label: department.name }))}
            />
          </Form.Item>

          <Form.Item name="assigned_users" label="Személyek">
            <Select
              mode="multiple"
              allowClear
              placeholder="Válassz személyeket"
              options={users.map((user) => ({
                value: user.id,
                label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
              }))}
            />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="requester_name" label="Külsős név" style={{ minWidth: 280 }}>
              <Input placeholder="Opcionális" />
            </Form.Item>
            <Form.Item name="requester_email" label="Külsős e-mail" style={{ minWidth: 280 }}>
              <Input placeholder="Opcionális" />
            </Form.Item>
          </Space>

          <Form.Item label="Nyitó üzenet (HTML)">
            <ReactQuill theme="snow" value={createMessageHtml} onChange={setCreateMessageHtml} style={{ height: 220, marginBottom: 42 }} />
          </Form.Item>

          <Divider style={{ marginTop: 36 }} />

          <Form.Item label="Csatolmányok (DND)">
            <Dragger
              multiple
              fileList={createFiles}
              beforeUpload={(file) => {
                setCreateFiles((prev) => [...prev, file as any]);
                return Upload.LIST_IGNORE;
              }}
              onRemove={(file) => {
                setCreateFiles((prev) => prev.filter((entry) => entry.uid !== file.uid));
              }}
            >
              <p className="ant-upload-drag-icon">📎</p>
              <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a feltöltéshez</p>
            </Dragger>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedTicket ? `${selectedTicket.ticket_number} - ${selectedTicket.title}` : 'Jegy részletei'}
        open={detailOpen}
        width={980}
        onCancel={() => setDetailOpen(false)}
        footer={null}
      >
        {selectedTicket && (
          <>
            <Space wrap style={{ marginBottom: 12 }} align="center">
              <Tag color={statusColor[selectedTicket.status] || 'default'}>{selectedTicket.status_display}</Tag>
              <Tag>{selectedTicket.ticket_type_display}</Tag>
              <Tag>{selectedTicket.audience_display}</Tag>
              {selectedTicket.topic_name ? <Tag color="purple">{selectedTicket.topic_name}</Tag> : null}
              {selectedTicket.is_first_response_overdue || selectedTicket.is_resolution_overdue ? <Tag color="red">Lejárt SLA</Tag> : null}
              {selectedTicket.can_manage_status ? (
                <Space>
                  <Select
                    value={detailStatus}
                    onChange={setDetailStatus}
                    style={{ width: 180 }}
                    options={[
                      { value: 'open', label: 'Nyitott' },
                      { value: 'in_progress', label: 'Folyamatban' },
                      { value: 'answered', label: 'Megválaszolva' },
                      { value: 'closed', label: 'Lezárt' },
                    ]}
                  />
                  <Button loading={statusSaving} onClick={handleStatusChange}>Státusz mentése</Button>
                </Space>
              ) : null}
              {selectedTicket.public_url ? (
                <Button
                  size="small"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedTicket.public_url as any);
                      message.success('Publikus link másolva');
                    } catch {
                      message.info(selectedTicket.public_url as any);
                    }
                  }}
                >
                  Publikus link másolása
                </Button>
              ) : null}
            </Space>

            <List
              bordered
              dataSource={selectedTicket.messages || []}
              locale={{ emptyText: 'Nincs még üzenet' }}
              renderItem={(item: TicketMessage) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>
                      {item.author_name_display} • {new Date(item.created_at).toLocaleString('hu-HU')}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: item.body_html }} />
                    {item.attachments?.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {item.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.file_url}
                            style={{ display: 'block' }}
                            onClick={(e) => {
                              e.preventDefault();
                              setAttPreviewUrl(attachment.file_url);
                              setAttPreviewTitle(attachment.file_name);
                              setAttPreviewOpen(true);
                            }}
                          >
                            {attachment.file_name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
            />

            <Divider />

            <div style={{ fontWeight: 600, marginBottom: 8 }}>Válasz</div>
            <ReactQuill theme="snow" value={replyHtml} onChange={setReplyHtml} style={{ height: 180, marginBottom: 42 }} />

            <Dragger
              multiple
              fileList={replyFiles}
              beforeUpload={(file) => {
                setReplyFiles((prev) => [...prev, file as any]);
                return Upload.LIST_IGNORE;
              }}
              onRemove={(file) => {
                setReplyFiles((prev) => prev.filter((entry) => entry.uid !== file.uid));
              }}
            >
              <p className="ant-upload-drag-icon">📎</p>
              <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a feltöltéshez</p>
            </Dragger>

            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Button type="primary" loading={replying} onClick={handleReply}>
                Válasz küldése
              </Button>
            </div>
          </>
        )}
      </Modal>
      <AttachmentPreviewModal
        open={attPreviewOpen}
        title={attPreviewTitle}
        url={attPreviewUrl}
        onClose={() => { setAttPreviewOpen(false); setAttPreviewUrl(null); setAttPreviewTitle(''); }}
      />
    </>
  );
};

export default Tickets;
