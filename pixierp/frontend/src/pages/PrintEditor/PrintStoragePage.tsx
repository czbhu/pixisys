import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Breadcrumb, Button, Card, Empty, Input, Modal, Popconfirm, Space,
  Spin, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, EyeOutlined, FolderAddOutlined, FolderOpenOutlined,
  HomeOutlined, LinkOutlined, PlusCircleOutlined, ReloadOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Text } = Typography;

interface FolderItem {
  id: number;
  name: string;
  parent: number | null;
  preview_count: number;
  children_count: number;
}

interface PreviewItem {
  id: number;
  title: string;
  token: string;
  is_active: boolean;
  expires_at: string | null;
  is_expired: boolean;
  editable: boolean;
  commentable: boolean;
  exportable: boolean;
  url: string;
  pdf_url: string;
  folder: number | null;
  folder_name: string | null;
  created_at: string;
  updated_at: string;
}

const formatRemaining = (expiresAt: string | null, isExpired: boolean) => {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (isExpired || ms <= 0) return 'Lejárt';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return `${days} nap`;
  return `${hours} óra`;
};

const PrintStoragePage: React.FC = () => {
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<FolderItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const load = useCallback(async (folderId: number | null) => {
    setLoading(true);
    try {
      const folderParam = folderId === null ? 'root' : String(folderId);
      const [foldersRes, previewsRes] = await Promise.all([
        api.get(`/printshop/preview-folders/?parent=${folderParam}`),
        api.get(`/printshop/shared-preview/?folder=${folderParam}`),
      ]);
      setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);
      setPreviews(Array.isArray(previewsRes.data) ? previewsRes.data : []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A tárhely betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(currentFolderId);
  }, [currentFolderId, load]);

  const enterFolder = (folder: FolderItem) => {
    setBreadcrumb(prev => [...prev, folder]);
    setCurrentFolderId(folder.id);
  };

  const goRoot = () => {
    setBreadcrumb([]);
    setCurrentFolderId(null);
  };

  const goBreadcrumb = (index: number) => {
    const next = breadcrumb.slice(0, index + 1);
    setBreadcrumb(next);
    setCurrentFolderId(next[next.length - 1]?.id ?? null);
  };

  const goUp = () => {
    if (!breadcrumb.length) return;
    const next = breadcrumb.slice(0, -1);
    setBreadcrumb(next);
    setCurrentFolderId(next[next.length - 1]?.id ?? null);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning('Add meg a mappa nevét');
      return;
    }
    try {
      await api.post('/printshop/preview-folders/', {
        name,
        parent: currentFolderId,
      });
      setNewFolderName('');
      setCreateFolderOpen(false);
      message.success('Mappa létrehozva');
      load(currentFolderId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A mappa létrehozása sikertelen');
    }
  };

  const handleDeleteFolder = async (folder: FolderItem) => {
    try {
      await api.delete(`/printshop/preview-folders/${folder.id}/`);
      message.success('Mappa törölve');
      load(currentFolderId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A mappa törlése sikertelen');
    }
  };

  const handleBackToPreview = () => {
    let target = '/print-preview';
    try {
      const saved = sessionStorage.getItem('printStorageReturnUrl');
      if (saved && saved.startsWith('/print-preview')) {
        target = saved;
      }
      sessionStorage.removeItem('printStorageReturnUrl');
    } catch {
      // ignore
    }
    window.location.href = target;
  };

  const handleOpenPreview = (preview: PreviewItem) => {
    try {
      sessionStorage.removeItem('printStorageReturnUrl');
    } catch {
      // ignore
    }
    window.location.href = `/print-preview?shareToken=${preview.token}`;
  };

  const handleDeletePreview = async (preview: PreviewItem) => {
    try {
      await api.delete(`/printshop/shared-preview/${preview.token}/`);
      message.success('PDF törölve');
      load(currentFolderId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A PDF törlése sikertelen');
    }
  };

  const handleExtend = async (preview: PreviewItem) => {
    try {
      await api.post(`/printshop/shared-preview/${preview.token}/extend/`, { days: 14 });
      message.success('Lejárat meghosszabbítva 14 nappal');
      load(currentFolderId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A meghosszabbítás sikertelen');
    }
  };

  const handleToggleShare = async (preview: PreviewItem) => {
    try {
      await api.patch(`/printshop/shared-preview/${preview.token}/`, {
        enabled: !preview.is_active,
      });
      message.success(preview.is_active ? 'Megosztás kikapcsolva' : 'Megosztás bekapcsolva');
      load(currentFolderId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A művelet sikertelen');
    }
  };

  const handleCopyShareUrl = async (preview: PreviewItem) => {
    if (!preview.url) {
      message.warning('A megosztási link nem érhető el');
      return;
    }
    try {
      await navigator.clipboard.writeText(preview.url);
      message.success('Link kimásolva');
    } catch {
      message.error('A link másolása nem sikerült');
    }
  };

  const previewColumns = useMemo(() => [
    {
      title: 'Név',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, row: PreviewItem) => (
        <Space>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(row.created_at).toLocaleString('hu-HU')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Megosztva',
      key: 'shared',
      width: 130,
      render: (_: any, row: PreviewItem) => row.is_active
        ? <Tag color="green">Aktív</Tag>
        : <Tag>Nincs</Tag>,
    },
    {
      title: 'Lejárat',
      key: 'expires',
      width: 160,
      render: (_: any, row: PreviewItem) => {
        if (!row.is_active) return <Text type="secondary">—</Text>;
        const label = formatRemaining(row.expires_at, row.is_expired);
        return (
          <Tag color={row.is_expired ? 'red' : 'blue'}>
            {row.is_expired ? 'Lejárt' : `${label} múlva`}
          </Tag>
        );
      },
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 360,
      render: (_: any, row: PreviewItem) => (
        <Space wrap>
          <Tooltip title="Megnyitás kommentekkel">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleOpenPreview(row)}>
              Megnyit
            </Button>
          </Tooltip>
          <Tooltip title={row.is_active ? 'Megosztás kikapcsolása' : 'Megosztás bekapcsolása (14 napra)'}>
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              type={row.is_active ? 'primary' : 'default'}
              onClick={() => handleToggleShare(row)}
            >
              {row.is_active ? 'Kikapcs.' : 'Megoszt'}
            </Button>
          </Tooltip>
          {row.is_active && (
            <Tooltip title="Megosztási link másolása">
              <Button size="small" icon={<LinkOutlined />} onClick={() => handleCopyShareUrl(row)} />
            </Tooltip>
          )}
          {row.is_active && (
            <Tooltip title="Lejárat meghosszabbítása 14 nappal">
              <Button size="small" icon={<PlusCircleOutlined />} onClick={() => handleExtend(row)}>
                +14 nap
              </Button>
            </Tooltip>
          )}
          <Popconfirm
            title="Biztosan törlöd ezt a PDF-et?"
            okText="Törlés"
            cancelText="Mégse"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeletePreview(row)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>Töröl</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
      <Card
        title={
          <Space>
            <FolderOpenOutlined />
            <span>Preview tárhely</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => load(currentFolderId)}>Frissít</Button>
            <Button icon={<FolderAddOutlined />} onClick={() => setCreateFolderOpen(true)}>Új mappa</Button>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBackToPreview}>
              Vissza a previewra
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {breadcrumb.length > 0 && (
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={goUp}>Vissza</Button>
          )}
          <Breadcrumb
            items={[
              {
                title: (
                  <a onClick={goRoot} style={{ cursor: 'pointer' }}>
                    <HomeOutlined /> Tárhely
                  </a>
                ),
              },
              ...breadcrumb.map((f, idx) => ({
                title: idx === breadcrumb.length - 1
                  ? <span>{f.name}</span>
                  : <a onClick={() => goBreadcrumb(idx)} style={{ cursor: 'pointer' }}>{f.name}</a>,
              })),
            ]}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Text strong>Mappák</Text>
              {folders.length === 0 ? (
                <Empty description="Nincs almappa" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 8 }}>
                  {folders.map(folder => (
                    <Card
                      key={folder.id}
                      size="small"
                      hoverable
                      onClick={() => enterFolder(folder)}
                      style={{ cursor: 'pointer' }}
                      actions={[
                        <Popconfirm
                          key="del"
                          title="Mappa törlése?"
                          description="A benne lévő PDF-ek és almappák a szülőbe kerülnek."
                          okText="Törlés"
                          cancelText="Mégse"
                          okButtonProps={{ danger: true }}
                          onConfirm={(e) => { e?.stopPropagation(); handleDeleteFolder(folder); }}
                          onCancel={(e) => e?.stopPropagation()}
                        >
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>,
                      ]}
                    >
                      <Space direction="vertical" size={2}>
                        <Space>
                          <FolderOpenOutlined style={{ color: '#1677ff' }} />
                          <Text strong>{folder.name}</Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {folder.preview_count} PDF · {folder.children_count} mappa
                        </Text>
                      </Space>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Text strong>PDF-ek</Text>
              {previews.length === 0 ? (
                <Empty description="Ez a mappa üres" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  columns={previewColumns as any}
                  dataSource={previews}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
          </>
        )}

        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="A megosztott linkek alapból 14 napig érvényesek. A „+14 nap” gombbal hosszabbíthatók."
        />
      </Card>

      <Modal
        title="Új mappa létrehozása"
        open={createFolderOpen}
        onCancel={() => { setCreateFolderOpen(false); setNewFolderName(''); }}
        onOk={handleCreateFolder}
        okText="Létrehoz"
        cancelText="Mégse"
      >
        <Input
          placeholder="Mappa neve"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default PrintStoragePage;
