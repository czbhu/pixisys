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
  Upload,
} from 'antd';
import NumInput from '../../components/NumInput';
import {
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlusOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import { hu } from 'date-fns/locale';

interface BackupFile {
  id: number;
  configuration: number | null;
  configuration_name: string;
  filename: string;
  filepath: string;
  file_size: number;
  file_size_mb: number;
  created_at: string;
  created_by: number | null;
  created_by_name: string;
  is_manual: boolean;
}

interface BackupConfiguration {
  id: number;
  name: string;
  interval: string;
  interval_display: string;
  retention_days: number;
  is_active: boolean;
  last_backup: string | null;
  created_at: string;
  updated_at: string;
}

const BackupPage: React.FC = () => {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [configs, setConfigs] = useState<BackupConfiguration[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BackupConfiguration | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchBackups();
    fetchConfigs();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const response = await api.get('/backup-files/');
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
      const response = await api.get('/backup-configs/');
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
      const response = await api.post('/backup-files/create_backup/');
      message.success(response.data.message);
      fetchBackups();
    } catch (error: any) {
      console.error('Hiba a backup létrehozásakor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült létrehozni a backup-ot');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadBackup = async (file: File | Blob | string) => {
    const formData = new FormData();
    formData.append('file', file as Blob);
    
    try {
      const response = await api.post('/backup-files/upload_backup/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      message.success(response.data.message);
      setUploadModalVisible(false);
      fetchBackups();
    } catch (error: any) {
      console.error('Hiba a feltöltéskor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült feltölteni a backup fájlt');
    }
    
    return false; // Prevent default upload behavior
  };

  const handleDownload = async (backup: BackupFile) => {
    try {
      const response = await api.get(`/backup-files/${backup.id}/download/`, {
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

  const handleRestore = async (backup: BackupFile) => {
    Modal.confirm({
      title: 'Adatbázis visszaállítása',
      content: (
        <div>
          <Alert
            message="Figyelem!"
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
          const response = await api.post(`/backup-files/${backup.id}/restore/`);
          message.success(response.data.message);
          
          // Logout and redirect to login
          setTimeout(() => {
            localStorage.clear();
            window.location.href = '/login';
          }, 2000);
        } catch (error: any) {
          console.error('Hiba a visszaállításkor:', error);
          message.error(error.response?.data?.error || 'Nem sikerült visszaállítani az adatbázist');
        }
      },
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/backup-files/${id}/`);
      message.success('Backup törölve');
      fetchBackups();
    } catch (error) {
      console.error('Hiba a törléskor:', error);
      message.error('Nem sikerült törölni a backup-ot');
    }
  };

  const handleCleanupOldBackups = async () => {
    try {
      const response = await api.post('/backup-files/cleanup_old_backups/');
      message.success(response.data.message);
      fetchBackups();
    } catch (error: any) {
      console.error('Hiba a tisztításkor:', error);
      message.error(error.response?.data?.error || 'Nem sikerült törölni a régi backup-okat');
    }
  };

  const [runningConfigId, setRunningConfigId] = useState<number | null>(null);

  const handleRunNow = async (config: BackupConfiguration) => {
    setRunningConfigId(config.id);
    try {
      const response = await api.post(`/backup-configs/${config.id}/run_now/`);
      message.success(response.data.message || 'Backup sikeresen létrehozva');
      fetchBackups();
      fetchConfigs();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Nem sikerült elindítani a backupot');
    } finally {
      setRunningConfigId(null);
    }
  };

  const showConfigModal = (config?: BackupConfiguration) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue(config);
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setConfigModalVisible(true);
  };

  const handleConfigSubmit = async (values: any) => {
    try {
      if (editingConfig) {
        await api.put(`/backup-configs/${editingConfig.id}/`, values);
        message.success('Konfiguráció frissítve');
      } else {
        await api.post('/backup-configs/', values);
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

  const columns: ColumnsType<BackupFile> = [
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
      render: (is_manual: boolean, record) => (
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
      render: (date: string) => (
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
      render: (size: number) => `${size} MB`,
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

  const configColumns: ColumnsType<BackupConfiguration> = [
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
      render: (days: number) => `${days} nap`,
    },
    {
      title: 'Utolsó mentés',
      dataIndex: 'last_backup',
      key: 'last_backup',
      render: (date: string | null) =>
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
      render: (is_active: boolean) =>
        is_active ? <Tag color="success">Aktív</Tag> : <Tag>Inaktív</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            loading={runningConfigId === record.id}
            onClick={() => handleRunNow(record)}
          >
            Futtatás most
          </Button>
          <Button
            type="link"
            icon={<SettingOutlined />}
            onClick={() => showConfigModal(record)}
          >
            Szerkesztés
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
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
          message="Fontos információ"
          description="Az automatikus backup-ok a rendszer cron job-ja alapján készülnek. A megőrzési időn túli backup-ok automatikusan törlődnek."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          size="small"
          columns={columns}
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
            <NumInput min={1} max={365} style={{ width: '100%' }} />
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
          message="Információ"
          description="Csak SQLite adatbázis fájlok (.sqlite3) tölthetők fel. A feltöltött backup azonnal visszaállítható lesz."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Upload.Dragger
          name="file"
          accept=".sqlite3"
          maxCount={1}
          beforeUpload={handleUploadBackup}
          showUploadList={true}
        >
          <p className="ant-upload-drag-icon">
            <DatabaseOutlined />
          </p>
          <p className="ant-upload-text">Kattintson vagy húzza ide a backup fájlt</p>
          <p className="ant-upload-hint">
            Támogatott formátum: .sqlite3 (SQLite adatbázis)
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};

export default BackupPage;
