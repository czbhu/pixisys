import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout, Tree, Button, Upload, Table, Space, Tooltip, Typography,
  Modal, Form, Input, Select, Popconfirm, Breadcrumb, message,
  Tag, Spin, Empty, Dropdown, Switch, Radio,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import type { UploadFile } from 'antd/es/upload';
import {
  FolderOutlined, FileOutlined, UploadOutlined, FolderAddOutlined,
  DeleteOutlined, ShareAltOutlined, DownloadOutlined, MoreOutlined,
  HomeOutlined, ReloadOutlined, UserOutlined, TeamOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FolderNode {
  id: number;
  name: string;
  owner: string;
  owner_id: number;
  children: FolderNode[];
}

interface StorageFile {
  id: number;
  name: string;
  folder: number | null;
  url: string;
  size: number;
  content_type: string;
  owner: number;
  owner_username: string;
  created_at: string;
}

interface ShareUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ShareDepartment {
  id: number;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function folderNodesToAntd(nodes: FolderNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: `folder-${n.id}`,
    title: (
      <span>
        <FolderOutlined style={{ marginRight: 6, color: '#faad14' }} />
        {n.name}
      </span>
    ),
    children: folderNodesToAntd(n.children),
    isLeaf: n.children.length === 0,
    _raw: n,
  } as DataNode & { _raw: FolderNode }));
}

// ─── Component ───────────────────────────────────────────────────────────────

const StoragePage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin: boolean =
    (user as any)?.is_superuser ||
    (user as any)?.is_staff ||
    ((user as any)?.permissions ?? []).some(
      (p: any) => p.resource === 'storage.manage' && p.allowed !== false,
    ) ||
    false;

  // ── State ──────────────────────────────────────────────────────────────────
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: number | null; name: string }[]>([
    { id: null, name: 'Gyökér' },
  ]);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [subFolders, setSubFolders] = useState<{ id: number; name: string; owner_username: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderForm] = Form.useForm();

  const [shareModal, setShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'folder' | 'file'; id: number; name: string } | null>(null);
  const [shareForm] = Form.useForm();
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [departments, setDepartments] = useState<ShareDepartment[]>([]);
  const [shareRecipientType, setShareRecipientType] = useState<'user' | 'department'>('user');

  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Load tree ──────────────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await api.get('/storage/folders/tree/');
      setTree(res.data);
    } catch {
      // silent
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // ── Load folder contents ───────────────────────────────────────────────────
  const loadFolder = useCallback(async (folderId: number | null) => {
    setFilesLoading(true);
    const folderParam = folderId === null ? 'root' : String(folderId);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.get(`/storage/files/?folder=${folderParam}`),
        api.get(`/storage/folders/?parent=${folderParam}`),
      ]);
      setFiles(Array.isArray(filesRes.data) ? filesRes.data : (filesRes.data.results ?? []));
      setSubFolders(Array.isArray(foldersRes.data) ? foldersRes.data : (foldersRes.data.results ?? []));
    } catch {
      message.error('Nem sikerült betölteni a tartalmakat.');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => { loadFolder(selectedFolderId); }, [selectedFolderId, loadFolder]);

  // ── Load users for share ───────────────────────────────────────────────────
  const loadUsers = async () => {
    if (users.length > 0) return;
    try {
      const res = await api.get('/storage/shares/users_list/');
      setUsers(res.data);
    } catch { /* silent */ }
  };

  const loadDepartments = async () => {
    if (departments.length > 0) return;
    try {
      const res = await api.get('/storage/shares/departments_list/');
      setDepartments(res.data);
    } catch { /* silent */ }
  };

  // ── Tree select ────────────────────────────────────────────────────────────
  const handleTreeSelect = (selectedKeys: React.Key[]) => {
    if (!selectedKeys.length) return;
    const key = String(selectedKeys[0]);
    if (key === 'root') {
      setSelectedFolderId(null);
      setBreadcrumb([{ id: null, name: 'Gyökér' }]);
      return;
    }
    const fid = parseInt(key.replace('folder-', ''), 10);
    setSelectedFolderId(fid);
    // Build breadcrumb by traversing the tree
    const findPath = (nodes: FolderNode[], target: number, path: FolderNode[]): FolderNode[] | null => {
      for (const n of nodes) {
        if (n.id === target) return [...path, n];
        const found = findPath(n.children, target, [...path, n]);
        if (found) return found;
      }
      return null;
    };
    const path = findPath(tree, fid, []);
    if (path) {
      setBreadcrumb([
        { id: null, name: 'Gyökér' },
        ...path.map((p) => ({ id: p.id, name: p.name })),
      ]);
    }
  };

  // ── Create folder ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    const values = await newFolderForm.validateFields();
    try {
      await api.post('/storage/folders/', { name: values.name, parent: selectedFolderId });
      message.success('Mappa létrehozva.');
      newFolderForm.resetFields();
      setNewFolderModal(false);
      loadTree();
      loadFolder(selectedFolderId);
    } catch {
      message.error('Nem sikerült létrehozni a mappát.');
    }
  };

  // ── Delete folder ──────────────────────────────────────────────────────────
  const handleDeleteFolder = async (id: number) => {
    try {
      await api.delete(`/storage/folders/${id}/`);
      message.success('Mappa törölve.');
      if (selectedFolderId === id) {
        const parent = breadcrumb[breadcrumb.length - 2] ?? { id: null };
        setSelectedFolderId(parent.id);
        setBreadcrumb((bc) => bc.slice(0, -1));
      }
      loadTree();
      loadFolder(selectedFolderId);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Törlés sikertelen.');
    }
  };

  // ── Upload file ────────────────────────────────────────────────────────────
  const handleUpload = async (fileList: File[]) => {
    for (const f of fileList) {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('name', f.name);
      if (selectedFolderId !== null) {
        formData.append('folder', String(selectedFolderId));
      }
      try {
        await api.post('/storage/files/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch {
        message.error(`${f.name} feltöltése sikertelen.`);
      }
    }
    message.success('Feltöltés kész.');
    loadFolder(selectedFolderId);
  };

  // ── Delete file ────────────────────────────────────────────────────────────
  const handleDeleteFile = async (id: number) => {
    try {
      await api.delete(`/storage/files/${id}/`);
      message.success('Fájl törölve.');
      loadFolder(selectedFolderId);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Törlés sikertelen.');
    }
  };

  // ── Download file ──────────────────────────────────────────────────────────
  const handleDownload = (file: StorageFile) => {
    const link = document.createElement('a');
    link.href = `/api/storage/files/${file.id}/download/`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const openShare = (type: 'folder' | 'file', id: number, name: string) => {
    setShareTarget({ type, id, name });
    setShareRecipientType('user');
    shareForm.resetFields();
    loadUsers();
    loadDepartments();
    setShareModal(true);
  };

  const handleShare = async () => {
    const values = await shareForm.validateFields();
    if (!shareTarget) return;
    try {
      const payload: Record<string, unknown> = { can_delete: values.can_delete ?? false };
      if (shareRecipientType === 'user') {
        payload.user_id = values.recipient_id;
      } else {
        payload.department_id = values.recipient_id;
      }
      if (shareTarget.type === 'folder') {
        await api.post('/storage/shares/share_folder/', { ...payload, folder_id: shareTarget.id });
      } else {
        await api.post('/storage/shares/share_file/', { ...payload, file_id: shareTarget.id });
      }
      message.success('Megosztva!');
      setShareModal(false);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Megosztás sikertelen.');
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────────
  const fileColumns: ColumnsType<StorageFile> = [
    {
      title: 'Név',
      dataIndex: 'name',
      render: (name: string, record: StorageFile) => (
        <Space>
          <FileOutlined style={{ color: '#1677ff' }} />
          <Text>{name}</Text>
          {record.owner !== (user as any)?.id && (
            <Tag color="blue" style={{ fontSize: 11 }}>megosztott</Tag>
          )}
        </Space>
      ),
    },
    { title: 'Méret', dataIndex: 'size', width: 100, render: formatBytes },
    {
      title: 'Típus',
      dataIndex: 'content_type',
      width: 160,
      render: (ct: string) => <Text type="secondary">{ct || '—'}</Text>,
    },
    isAdmin
      ? {
          title: 'Tulajdonos',
          dataIndex: 'owner_username',
          width: 130,
          render: (u: string) => (
            <Space size={4}><UserOutlined style={{ opacity: 0.5 }} /><Text type="secondary">{u}</Text></Space>
          ),
        }
      : { title: '', width: 0 },
    {
      title: 'Feltöltve',
      dataIndex: 'created_at',
      width: 140,
      render: (d: string) => new Date(d).toLocaleString('hu-HU'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: any, record: StorageFile) => {
        const canDel = isAdmin || record.owner === (user as any)?.id;
        const items: MenuProps['items'] = [
          {
            key: 'download',
            label: 'Letöltés',
            icon: <DownloadOutlined />,
            onClick: () => handleDownload(record),
          },
          {
            key: 'share',
            label: 'Megosztás',
            icon: <ShareAltOutlined />,
            onClick: () => openShare('file', record.id, record.name),
          },
          canDel
            ? {
                key: 'delete',
                label: (
                  <Popconfirm
                    title="Biztosan törlöd?"
                    onConfirm={() => handleDeleteFile(record.id)}
                    okText="Igen"
                    cancelText="Mégse"
                  >
                    <span style={{ color: '#ff4d4f' }}>Törlés</span>
                  </Popconfirm>
                ),
                icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
              }
            : null,
        ].filter(Boolean) as MenuProps['items'];
        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ].filter((c) => c.width !== 0);

  // ── Tree data ──────────────────────────────────────────────────────────────
  const treeData: DataNode[] = [
    {
      key: 'root',
      title: (
        <span>
          <HomeOutlined style={{ marginRight: 6 }} />
          Gyökér
        </span>
      ),
      children: folderNodesToAntd(tree),
    },
  ];

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px 8px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>Tárhely</Title>
        <Space>
          <Tooltip title="Frissítés">
            <Button icon={<ReloadOutlined />} onClick={() => { loadTree(); loadFolder(selectedFolderId); }} />
          </Tooltip>
          <Button icon={<FolderAddOutlined />} onClick={() => setNewFolderModal(true)}>
            Új mappa
          </Button>
          <Upload
            beforeUpload={() => false}
            multiple
            showUploadList={false}
            onChange={({ fileList }) => {
              const newFiles = fileList.filter((f) => f.originFileObj).map((f) => f.originFileObj as File);
              if (newFiles.length > 0) handleUpload(newFiles);
            }}
          >
            <Button icon={<UploadOutlined />} type="primary">
              Fájl feltöltése
            </Button>
          </Upload>
        </Space>
      </div>

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* ── Folder tree ── */}
        <Sider
          width={260}
          style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0', overflow: 'auto', padding: '8px 0' }}
          theme="light"
        >
          {treeLoading ? (
            <div style={{ padding: 16, textAlign: 'center' }}><Spin /></div>
          ) : (
            <Tree
              treeData={treeData}
              defaultExpandAll
              showLine
              selectedKeys={selectedFolderId === null ? ['root'] : [`folder-${selectedFolderId}`]}
              onSelect={handleTreeSelect}
              style={{ background: 'transparent', padding: '0 8px' }}
            />
          )}
        </Sider>

        {/* ── File list ── */}
        <Content style={{ overflow: 'auto', padding: 16, background: '#fff' }}>
          {/* Breadcrumb */}
          <Breadcrumb style={{ marginBottom: 12 }}>
            {breadcrumb.map((bc, i) => (
              <Breadcrumb.Item key={i}>
                <a
                  onClick={() => {
                    setSelectedFolderId(bc.id);
                    setBreadcrumb(breadcrumb.slice(0, i + 1));
                  }}
                >
                  {bc.name}
                </a>
              </Breadcrumb.Item>
            ))}
          </Breadcrumb>

          {/* Subfolders */}
          {subFolders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>MAPPÁK</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {subFolders.map((f) => {
                  const canDel = isAdmin || f.owner_username === (user as any)?.username;
                  const items: MenuProps['items'] = [
                    {
                      key: 'share',
                      label: 'Megosztás',
                      icon: <ShareAltOutlined />,
                      onClick: (e: { domEvent: React.MouseEvent }) => { e.domEvent.stopPropagation(); openShare('folder', f.id, f.name); },
                    },
                    canDel
                      ? {
                          key: 'delete',
                          label: (
                            <Popconfirm
                              title="Biztosan törlöd? (Tartalom is törlődik!)"
                              onConfirm={() => handleDeleteFolder(f.id)}
                              okText="Igen"
                              cancelText="Mégse"
                            >
                              <span style={{ color: '#ff4d4f' }}>Törlés</span>
                            </Popconfirm>
                          ),
                          icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                        }
                      : null,
                  ].filter(Boolean) as MenuProps['items'];
                  return (
                    <div
                      key={f.id}
                      style={{
                        border: '1px solid #e8e8e8',
                        borderRadius: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 140,
                        background: '#fffbe6',
                        position: 'relative',
                      }}
                      onClick={() => {
                        setSelectedFolderId(f.id);
                        setBreadcrumb((bc) => [...bc, { id: f.id, name: f.name }]);
                      }}
                    >
                      <FolderOutlined style={{ color: '#faad14', fontSize: 18 }} />
                      <Text style={{ flex: 1 }}>{f.name}</Text>
                      {isAdmin && (
                        <Text type="secondary" style={{ fontSize: 11 }}>{f.owner_username}</Text>
                      )}
                      <Dropdown menu={{ items }} trigger={['click']}>
                        <Button
                          size="small"
                          type="text"
                          icon={<MoreOutlined />}
                          onClick={(e) => e.stopPropagation()}
                          style={{ marginLeft: 4 }}
                        />
                      </Dropdown>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Files */}
          <div>
            {subFolders.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>FÁJLOK</Text>
            )}
            <Table
              dataSource={files}
              columns={fileColumns}
              rowKey="id"
              loading={filesLoading}
              size="small"
              pagination={{ pageSize: 50, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="Nincs fájl ebben a mappában" /> }}
            />
          </div>
        </Content>
      </Layout>

      {/* ── Create folder modal ── */}
      <Modal
        title="Új mappa"
        open={newFolderModal}
        onOk={handleCreateFolder}
        onCancel={() => { setNewFolderModal(false); newFolderForm.resetFields(); }}
        okText="Létrehozás"
        cancelText="Mégse"
      >
        <Form form={newFolderForm} layout="vertical">
          <Form.Item name="name" label="Mappa neve" rules={[{ required: true, message: 'Kötelező!' }]}>
            <Input autoFocus placeholder="pl. Számlák" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Share modal ── */}
      <Modal
        title={`Megosztás: ${shareTarget?.name}`}
        open={shareModal}
        onOk={handleShare}
        onCancel={() => setShareModal(false)}
        okText="Megosztás"
        cancelText="Mégse"
      >
        <Form form={shareForm} layout="vertical">
          <Form.Item label="Megosztás típusa">
            <Radio.Group
              value={shareRecipientType}
              onChange={(e) => {
                setShareRecipientType(e.target.value);
                shareForm.setFieldValue('recipient_id', undefined);
              }}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="user"><UserOutlined /> Felhasználó</Radio.Button>
              <Radio.Button value="department"><TeamOutlined /> Osztály</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {shareRecipientType === 'user' ? (
            <Form.Item name="recipient_id" label="Felhasználó" rules={[{ required: true, message: 'Kötelező!' }]}>
              <Select
                showSearch
                placeholder="Válassz felhasználót..."
                optionFilterProp="label"
                options={users
                  .filter((u) => u.id !== (user as any)?.id)
                  .map((u) => ({
                    value: u.id,
                    label: `${u.first_name} ${u.last_name} (${u.username})`.trim() || u.username,
                  }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="recipient_id" label="Osztály" rules={[{ required: true, message: 'Kötelező!' }]}>
              <Select
                showSearch
                placeholder="Válassz osztályt..."
                optionFilterProp="label"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
          )}
          <Form.Item name="can_delete" label="Törölhet" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
          {shareTarget?.type === 'folder' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              A mappa megosztásakor a benne lévő összes fájl (jelenlegi és jövőbeli) is elérhetővé válik.
            </Text>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default StoragePage;
