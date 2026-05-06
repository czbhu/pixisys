import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Popconfirm,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Alert,
  Typography,
  Upload,
} from 'antd';
import {
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlusOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import { hu } from 'date-fns/locale';

const { Title } = Typography;

const BackupRestore = () => {
  const [backups, setBackups] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchBackups();
    fetchConfigs();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/backup-files/');
      const data = response.data.results || response.data;
      setBackups(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Hiba a backup-ok betöltésekor:', error);
      message.error('Nem sikerült betölteni a backup fájlokat');
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfigs = async () => {
    try {
      const response = await api.get('/api/backup-configs/');
      const data = response.data.results || response.data;
      setConfigs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Hiba a konfigurációk betöltésekor:', error);
      setConfigs([]);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    try {
      const response = await api.post('/api/backup-files/create_backup/');
      message.success(response.data.message);
      fetchBackups();
    } catch (error) {
      console.error('Hiba a backup létrehozásakor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült létrehozni a backup-ot');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadBackup = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await api.post('/api/backup-files/upload_backup/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      message.success(response.data.message);
      setUploadModalVisible(false);
      fetchBackups();
    } catch (error) {
      console.error('Hiba a feltöltéskor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült feltölteni a backup fájlt');
    }
    
    return false; // Prevent default upload behavior
  };

  const handleDownload = async (backup) => {
    try {
      const response = await api.get(`/api/backup-files/${backup.id}/download/`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', backup.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('Backup letöltve');
    } catch (error) {
      console.error('Hiba a letöltéskor:', error);
      message.error('Nem sikerült letölteni a backup fájlt');
    }
  };

  const handleRestore = async (backup) => {
    Modal.confirm({
      title: 'Adatbázis visszaállítása',
      content: (
        <div>
          <Alert
            title="Figyelem!"
            description="A visszaállítás felülírja a jelenlegi adatbázist. A művelet előtt automatikusan készül egy mentés a jelenlegi állapotról."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <p>Biztosan vissza szeretné állítani az adatbázist erről a backup-ról?</p>
          <p><strong>{backup.filename}</strong></p>
          <p>Létrehozva: {new Date(backup.created_at).toLocaleString('hu-HU')}</p>
        </div>
      ),
      okText: 'Visszaállítás',
      okType: 'danger',
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          const response = await api.post(`/api/backup-files/${backup.id}/restore/`);
          message.success(response.data.message);
          
          // Logout and redirect to login
          setTimeout(() => {
            localStorage.clear();
            window.location.href = '/login';
          }, 2000);
        } catch (error) {
          console.error('Hiba a visszaállításkor:', error);
          message.error(error.response?.data?.error || 'Nem sikerült visszaállítani az adatbázist');
        }
      },
    });
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/backup-files/${id}/`);
      message.success('Backup törölve');
      fetchBackups();
    } catch (error) {
      console.error('Hiba a törléskor:', error);
      message.error('Nem sikerült törölni a backup-ot');
    }
  };

  const handleCleanupOldBackups = async () => {
    try {
      const response = await api.post('/api/backup-files/cleanup_old_backups/');
      message.success(response.data.message);
      fetchBackups();
    } catch (error) {
      console.error('Hiba a tisztításkor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült törölni a régi backup-okat');
    }
  };

  const showConfigModal = (config = null) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue(config);
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setConfigModalVisible(true);
  };

  const handleConfigSubmit = async (values) => {
    try {
      if (editingConfig) {
        await api.put(`/api/backup-configs/${editingConfig.id}/`, values);
        message.success('Konfiguráció frissítve');
      } else {
        await api.post('/api/backup-configs/', values);
        message.success('Konfiguráció létrehozva');
      }
      setConfigModalVisible(false);
      form.resetFields();
      fetchConfigs();
    } catch (error) {
      console.error('Hiba a konfiguráció mentésekor:', error);
      message.error('Nem sikerült menteni a konfigurációt');
    }
  };

  const backupColumns = [
    {
      title: 'Fájlnév',
      dataIndex: 'filename',
      key: 'filename',
      sorter: (a, b) => a.filename.localeCompare(b.filename),
    },
    {
      title: 'Típus',
      dataIndex: 'is_manual',
      key: 'type',
      render: (is_manual, record) => (
        <Space>
          {is_manual ? (
            <Tag color="blue">Manuális</Tag>
          ) : (
            <Tag color="green">{record.configuration_name}</Tag>
          )}
        </Space>
      ),
      filters: [
        { text: 'Manuális', value: true },
        { text: 'Automatikus', value: false },
      ],
      onFilter: (value, record) => record.is_manual === value,
    },
    {
      title: 'Létrehozva',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => (
        <span title={new Date(date).toLocaleString('hu-HU')}>
          {formatDistanceToNow(new Date(date), { addSuffix: true, locale: hu })}
        </span>
      ),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Létrehozta',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
    },
    {
      title: 'Méret',
      dataIndex: 'file_size_mb',
      key: 'file_size_mb',
      render: (size) => `${size} MB`,
      sorter: (a, b) => a.file_size - b.file_size,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record)}
          >
            Letöltés
          </Button>
          <Button
            type="link"
            onClick={() => handleRestore(record)}
          >
            Visszaállítás
          </Button>
          <Popconfirm
            title="Biztosan törli ezt a backup-ot?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Törlés
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const configColumns = [
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Gyakoriság',
      dataIndex: 'interval_display',
      key: 'interval_display',
    },
    {
      title: 'Megőrzés (nap)',
      dataIndex: 'retention_days',
      key: 'retention_days',
      render: (days) => `${days} nap`,
    },
    {
      title: 'Utolsó mentés',
      dataIndex: 'last_backup',
      key: 'last_backup',
      render: (date) =>
        date ? (
          <span title={new Date(date).toLocaleString('hu-HU')}>
            {formatDistanceToNow(new Date(date), { addSuffix: true, locale: hu })}
          </span>
        ) : (
          <span style={{ color: '#999' }}>Még nem futott</span>
        ),
    },
    {
      title: 'Állapot',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active) =>
        is_active ? <Tag color="success">Aktív</Tag> : <Tag>Inaktív</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          icon={<SettingOutlined />}
          onClick={() => showConfigModal(record)}
        >
          Szerkesztés
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <DatabaseOutlined /> Backup és Visszaállítás
      </Title>

      <Card
        title="Automatikus Backup Konfigurációk"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showConfigModal()}
          >
            Új konfiguráció
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={configColumns}
          dataSource={configs}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      <Card
        title="Backup Fájlok"
        extra={
          <Space>
            <Button
              icon={<ClockCircleOutlined />}
              onClick={handleCleanupOldBackups}
            >
              Régi backup-ok törlése
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              Backup feltöltése
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateBackup}
              loading={loading}
            >
              Új manuális backup
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchBackups}>
              Frissítés
            </Button>
          </Space>
        }
      >
        <Alert
          title="Fontos információ"
          description="Az automatikus backup-ok a rendszer cron job-ja alapján készülnek. A megőrzési időn túli backup-ok automatikusan törlődnek."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={backupColumns}
          dataSource={backups}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Összesen ${total} backup`,
          }}
        />
      </Card>

      <Modal
        title={editingConfig ? 'Konfiguráció szerkesztése' : 'Új konfiguráció'}
        open={configModalVisible}
        onCancel={() => {
          setConfigModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleConfigSubmit}
          initialValues={{
            interval: 'daily',
            retention_days: 14,
            is_active: true,
          }}
        >
          <Form.Item
            label="Név"
            name="name"
            rules={[{ required: true, message: 'Adja meg a nevet!' }]}
          >
            <Input placeholder="pl. Napi automatikus mentés" />
          </Form.Item>

          <Form.Item
            label="Mentési gyakoriság"
            name="interval"
            rules={[{ required: true, message: 'Válassza ki a gyakoriságot!' }]}
          >
            <Select>
              <Select.Option value="daily">Napi</Select.Option>
              <Select.Option value="weekly">Heti</Select.Option>
              <Select.Option value="monthly">Havi</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Megőrzési idő (nap)"
            name="retention_days"
            rules={[{ required: true, message: 'Adja meg a megőrzési időt!' }]}
            help="Ennyi nap után törölhetők a régi backup-ok"
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Aktív" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Backup feltöltése"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
      >
        <Alert
          title="Információ"
          description="PostgreSQL pg_dump által létrehozott .dump fájlok tölthetők fel. A feltöltött backup azonnal visszaallítható lesz."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Upload.Dragger
          name="file"
          accept=".dump,.sql"
          maxCount={1}
          beforeUpload={handleUploadBackup}
          showUploadList={true}
        >
          <p className="ant-upload-drag-icon">
            <DatabaseOutlined />
          </p>
          <p className="ant-upload-text">Kattintson vagy húzza ide a backup fájlt</p>
          <p className="ant-upload-hint">
            Támogatott formátum: .dump (PostgreSQL custom dump)
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};

export default BackupRestore;
