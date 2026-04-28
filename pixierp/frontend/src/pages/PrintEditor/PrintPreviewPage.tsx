import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, List, Modal, Popconfirm, Select, Space, Spin, Switch, Tag, Tooltip, Typography, message } from 'antd';
import {
  BranchesOutlined, CopyOutlined, DeleteOutlined, FolderAddOutlined, FolderOpenOutlined,
  PlusOutlined, ReloadOutlined, SaveOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import PrintCommentView, { clearPdfFromIDB } from './components/PrintCommentView';
import api from '../../services/api';

const { Text } = Typography;

interface PreviewShareSettings {
  enabled: boolean;
  editable: boolean;
  commentable: boolean;
  exportable: boolean;
  url: string;
}

const buildStandalonePreviewUrl = (orderId: number | null, itemId: number | null, shareToken?: string | null) => {
  if (typeof window === 'undefined') return '';
  if (shareToken) return `${window.location.origin}/print-preview?shareToken=${shareToken}`;
  if (!orderId || !itemId) return '';
  return `${window.location.origin}/print-preview?orderId=${orderId}&itemId=${itemId}`;
};

const PrintPreviewPage: React.FC = () => {
  const { user } = useAuth();
  const [shareConfig, setShareConfig] = useState<any | null>(null);
  const [itemConfig, setItemConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [localPdfFile, setLocalPdfFile] = useState<File | null>(null);
  const [localAnnotations, setLocalAnnotations] = useState<any[]>([]);
  const [previewShare, setPreviewShare] = useState<PreviewShareSettings>({
    enabled: false,
    editable: false,
    commentable: true,
    exportable: false,
    url: '',
  });
  // Tárhely / mentés UI
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveFolders, setSaveFolders] = useState<Array<{ id: number; name: string; parent: number | null }>>([]);
  const [saveFolderId, setSaveFolderId] = useState<number | null>(null);
  const [saveCreateFolderOpen, setSaveCreateFolderOpen] = useState(false);
  const [saveNewFolderName, setSaveNewFolderName] = useState('');
  const [saveVersionNote, setSaveVersionNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Verziók
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versions, setVersions] = useState<Array<any>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [latestVersionNumber, setLatestVersionNumber] = useState<number | null>(null);
  const [currentPreviewTitle, setCurrentPreviewTitle] = useState<string | null>(null);
  const [currentPreviewFolder, setCurrentPreviewFolder] = useState<number | null>(null);
  // Munkafelület visszaállítás
  const startupCheckedRef = useRef(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [lastTokenTitle, setLastTokenTitle] = useState<string | null>(null);
  const [startupDecided, setStartupDecided] = useState(false);

  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const publicToken = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'public' && parts[1] === 'print-preview' && parts[2]) {
      return parts[2];
    }
    return null;
  }, [path]);

  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const orderId = useMemo(() => {
    const value = queryParams.get('orderId');
    return value ? Number(value) : null;
  }, [queryParams]);
  const itemId = useMemo(() => {
    const value = queryParams.get('itemId');
    return value ? Number(value) : null;
  }, [queryParams]);
  // Sanitize: reject 'null'/'undefined' strings that can be written by template literals
  const standaloneShareToken = useMemo(() => {
    const v = queryParams.get('shareToken');
    return v && v !== 'null' && v !== 'undefined' ? v : null;
  }, [queryParams]);
  const hasPrintPreviewPerm = Array.isArray(user?.permissions) && user.permissions.some(
    (p: { module?: string; resource?: string; action?: string; allowed?: boolean }) =>
      p.resource === 'printshop.preview' && p.allowed !== false
  );
  const isAdmin = user?.is_superuser || user?.is_staff || hasPrintPreviewPerm || false;
  const userAuthorName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : 'Ügyfél';

  // ── Munkafelület mentése / visszaállítása ─────────────────────────────────
  // Save token whenever active – both localStorage (cross-tab) and sessionStorage (this tab only)
  useEffect(() => {
    if (!standaloneShareToken) return;
    try {
      localStorage.setItem('lastPrintPreviewToken', standaloneShareToken);
      sessionStorage.setItem('currentSessionPreviewToken', standaloneShareToken);
    } catch { /* ignore */ }
  }, [standaloneShareToken]);

  useEffect(() => {
    if (!standaloneShareToken || !currentPreviewTitle) return;
    try {
      localStorage.setItem('lastPrintPreviewTitle', currentPreviewTitle);
    } catch { /* ignore */ }
  }, [standaloneShareToken, currentPreviewTitle]);

  // Check on first load (no params, admin):
  //   - same tab (sessionStorage token present) → auto-restore silently
  //   - new tab → open empty workspace directly, no modal
  useEffect(() => {
    if (startupCheckedRef.current) return;
    if (!user) return;
    if (publicToken || orderId || itemId || standaloneShareToken) return;
    if (!isAdmin) return;
    startupCheckedRef.current = true;
    try {
      const rawSession = sessionStorage.getItem('currentSessionPreviewToken');
      const sessionToken = rawSession && rawSession !== 'null' && rawSession !== 'undefined' ? rawSession : null;
      if (sessionToken) {
        // Same tab had an open workspace – restore silently
        window.location.replace(`/print-preview?shareToken=${sessionToken}`);
        return;
      }
      // New tab or no previous session – open empty workspace directly
      setStartupDecided(true);
    } catch { /* ignore */ }
  }, [user, isAdmin, publicToken, orderId, itemId, standaloneShareToken]);

  useEffect(() => {
    if (!standaloneShareToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const detailResponse = await api.get(`/printshop/shared-preview/${standaloneShareToken}/`);
        if (cancelled) return;
        setShareConfig({
          pdf_url: detailResponse.data?.pdf_url || null,
          editable: detailResponse.data?.editable,
          commentable: detailResponse.data?.commentable,
          exportable: detailResponse.data?.exportable,
          default_author_name: userAuthorName,
        });
        setPreviewShare({
          enabled: !!detailResponse.data?.is_active,
          editable: !!detailResponse.data?.editable,
          commentable: detailResponse.data?.commentable !== false,
          exportable: !!detailResponse.data?.exportable,
          url: detailResponse.data?.url || '',
        });
        setLatestVersionNumber(detailResponse.data?.latest_version_number ?? null);
        setCurrentPreviewTitle(detailResponse.data?.title ?? null);
        setCurrentPreviewFolder(detailResponse.data?.folder ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'A preview nem érhető el.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicToken, standaloneShareToken, userAuthorName]);

  useEffect(() => {
    if (!publicToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/printshop/public-preview/${publicToken}/`);
        if (!cancelled) setShareConfig(response.data);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'A megosztott preview nem érhető el.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicToken]);

  useEffect(() => {
    if (publicToken || !orderId || !itemId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`printshop/orders/${orderId}/`);
        if (cancelled) return;
        const item = (response.data?.items ?? []).find((entry: any) => entry.id === itemId);
        if (!item) {
          setError('A preview tétel nem található.');
          return;
        }
        setItemConfig(item);
        setPreviewShare({
          enabled: !!item.preview_share_enabled,
          editable: !!item.preview_share_editable,
          commentable: item.preview_share_commentable !== false,
          exportable: !!item.preview_share_exportable,
          url: item.preview_share_url || '',
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'A preview nem érhető el.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicToken, orderId, itemId]);

  const authorName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : (shareConfig?.default_author_name || 'Ügyfél');

  const handleSavePreviewShare = async () => {
    setShareSaving(true);
    try {
      if (orderId && itemId) {
        const response = await api.post(`printshop/orders/${orderId}/preview-share/`, {
          item_id: itemId,
          enabled: previewShare.enabled,
          editable: previewShare.editable,
          commentable: previewShare.commentable,
          exportable: previewShare.exportable,
        });
        setPreviewShare({
          enabled: !!response.data?.enabled,
          editable: !!response.data?.editable,
          commentable: response.data?.commentable !== false,
          exportable: !!response.data?.exportable,
          url: response.data?.url || '',
        });
        setItemConfig((prev: any) => prev ? ({
          ...prev,
          preview_share_enabled: !!response.data?.enabled,
          preview_share_editable: !!response.data?.editable,
          preview_share_commentable: response.data?.commentable !== false,
          preview_share_exportable: !!response.data?.exportable,
          preview_share_url: response.data?.url || '',
        }) : prev);
      } else {
        if (!localPdfFile && !standaloneShareToken) {
          message.error('Először tölts fel egy PDF-et a megosztáshoz');
          return;
        }

        let response;
        if (standaloneShareToken) {
          response = await api.patch(`/printshop/shared-preview/${standaloneShareToken}/`, {
            enabled: previewShare.enabled,
            editable: previewShare.editable,
            commentable: previewShare.commentable,
            exportable: previewShare.exportable,
          });
        } else {
          const formData = new FormData();
          formData.append('pdf', localPdfFile as File);
          formData.append('enabled', String(previewShare.enabled));
          formData.append('editable', String(previewShare.editable));
          formData.append('commentable', String(previewShare.commentable));
          formData.append('exportable', String(previewShare.exportable));
          formData.append('annotations', JSON.stringify(localAnnotations));
          formData.append('title', localPdfFile?.name || 'Preview PDF');
          response = await api.post('/printshop/shared-preview/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const newShareToken = response.data?.token;
          if (newShareToken && newShareToken !== 'null' && typeof window !== 'undefined') {
            window.history.replaceState({}, '', `/print-preview?shareToken=${newShareToken}`);
            try { sessionStorage.setItem('currentSessionPreviewToken', newShareToken); localStorage.setItem('lastPrintPreviewToken', newShareToken); } catch { /* ignore */ }
          }
          setShareConfig({
            pdf_url: response.data?.pdf_url,
            editable: response.data?.editable,
            commentable: response.data?.commentable,
            exportable: response.data?.exportable,
            default_author_name: authorName,
          });
        }
        setPreviewShare({
          enabled: response.data?.is_active ?? response.data?.enabled ?? false,
          editable: !!response.data?.editable,
          commentable: response.data?.commentable !== false,
          exportable: !!response.data?.exportable,
          url: response.data?.url || '',
        });
      }
      message.success('Preview megosztás mentve');
      setShareModalOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Nem sikerült a megosztási beállításokat menteni');
    } finally {
      setShareSaving(false);
    }
  };

  const handleCopyPreviewShareUrl = async () => {
    if (!previewShare.url) return;
    try {
      await navigator.clipboard.writeText(previewShare.url);
      message.success('Link kimásolva');
    } catch {
      message.error('A link másolása nem sikerült');
    }
  };

  const handleNewPreview = async () => {
    // Clear the cached PDF from IndexedDB so the viewer doesn't restore it.
    await clearPdfFromIDB();
    try {
      sessionStorage.removeItem('printStorageReturnUrl');
      sessionStorage.removeItem('currentSessionPreviewToken');
      sessionStorage.setItem('printPreviewStartupDone', '1');
      localStorage.removeItem('lastPrintPreviewToken');
      localStorage.removeItem('lastPrintPreviewTitle');
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      const target = '/print-preview';
      if (window.location.pathname === target && !window.location.search) {
        window.location.reload();
      } else {
        window.location.replace(target);
      }
    }
  };

  const loadSaveFolders = async () => {
    try {
      const res = await api.get('/printshop/preview-folders/');
      setSaveFolders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSaveFolders([]);
    }
  };

  const handleOpenSaveModal = async () => {
    if (!localPdfFile && !standaloneShareToken) {
      message.warning('Először tölts fel egy PDF-et a mentéshez');
      return;
    }
    const defaultTitle = currentPreviewTitle
      || localPdfFile?.name?.replace(/\.pdf$/i, '')
      || (shareConfig?.product_name || 'Preview PDF');
    setSaveTitle(defaultTitle);
    setSaveFolderId(currentPreviewFolder ?? null);
    await loadSaveFolders();
    setSaveModalOpen(true);
  };

  const handleSaveCreateFolder = async () => {
    const name = saveNewFolderName.trim();
    if (!name) { message.warning('Add meg a mappa nevét'); return; }
    try {
      const res = await api.post('/printshop/preview-folders/', { name, parent: saveFolderId });
      message.success('Mappa létrehozva');
      setSaveNewFolderName('');
      setSaveCreateFolderOpen(false);
      await loadSaveFolders();
      setSaveFolderId(res.data?.id ?? null);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A mappa létrehozása sikertelen');
    }
  };

  const handleSaveToStorage = async () => {
    setSaving(true);
    try {
      if (standaloneShareToken) {
        // Update folder/title metadata first
        await api.patch(`/printshop/shared-preview/${standaloneShareToken}/`, {
          folder: saveFolderId ?? null,
          title: saveTitle || undefined,
        });
        // Create a new version snapshot
        const fd = new FormData();
        if (localPdfFile) fd.append('pdf', localPdfFile);
        fd.append('annotations', JSON.stringify(localAnnotations));
        if (saveVersionNote.trim()) fd.append('note', saveVersionNote.trim());
        const vr = await api.post(
          `/printshop/shared-preview/${standaloneShareToken}/versions/`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        setLatestVersionNumber(vr.data?.version_number ?? null);
        setCurrentPreviewTitle(saveTitle || currentPreviewTitle);
        setCurrentPreviewFolder(saveFolderId ?? null);
        message.success(`Elmentve (v${vr.data?.version_number ?? '?'})`);
      } else {
        if (!localPdfFile) { message.error('Nincs PDF a mentéshez'); return; }
        const formData = new FormData();
        formData.append('pdf', localPdfFile);
        formData.append('enabled', 'false');
        formData.append('editable', String(previewShare.editable));
        formData.append('commentable', String(previewShare.commentable));
        formData.append('exportable', String(previewShare.exportable));
        formData.append('annotations', JSON.stringify(localAnnotations));
        formData.append('title', saveTitle || localPdfFile.name || 'Preview PDF');
        if (saveVersionNote.trim()) formData.append('version_note', saveVersionNote.trim());
        if (saveFolderId != null) formData.append('folder', String(saveFolderId));
        const response = await api.post('/printshop/shared-preview/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const newToken = response.data?.token;
        if (newToken && newToken !== 'null' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/print-preview?shareToken=${newToken}`);
          try { sessionStorage.setItem('currentSessionPreviewToken', newToken); localStorage.setItem('lastPrintPreviewToken', newToken); } catch { /* ignore */ }
        }
        setShareConfig({
          pdf_url: response.data?.pdf_url,
          editable: response.data?.editable,
          commentable: response.data?.commentable,
          exportable: response.data?.exportable,
          default_author_name: authorName,
        });
        setPreviewShare({
          enabled: response.data?.is_active ?? false,
          editable: !!response.data?.editable,
          commentable: response.data?.commentable !== false,
          exportable: !!response.data?.exportable,
          url: response.data?.url || '',
        });
        setLatestVersionNumber(response.data?.latest_version_number ?? 1);
        setCurrentPreviewTitle(response.data?.title ?? saveTitle ?? null);
        setCurrentPreviewFolder(response.data?.folder ?? saveFolderId ?? null);
        message.success('Tárhelybe mentve (v1)');
      }
      setSaveVersionNote('');
      setSaveModalOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenVersions = async () => {
    if (!standaloneShareToken) {
      message.info('Előbb mentsd el a preview-t a tárhelybe.');
      return;
    }
    setVersionsModalOpen(true);
    setVersionsLoading(true);
    try {
      const res = await api.get(`/printshop/shared-preview/${standaloneShareToken}/versions/`);
      const list = Array.isArray(res.data) ? res.data : [];
      setVersions(list);
      if (list.length) setLatestVersionNumber(list[0].version_number);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A verziók betöltése sikertelen');
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleOpenVersionPdf = (v: any) => {
    if (v?.pdf_url) window.open(v.pdf_url, '_blank');
  };

  const handleRestoreVersion = async (v: any) => {
    if (!standaloneShareToken) return;
    try {
      await api.post(`/printshop/shared-preview/${standaloneShareToken}/versions/${v.id}/restore/`);
      message.success(`v${v.version_number} visszaállítva új verzióként`);
      setVersionsModalOpen(false);
      // Reload page so the latest PDF + annotations are picked up
      window.location.reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A visszaállítás sikertelen');
    }
  };

  const handleDeleteCurrent = async () => {
    if (!standaloneShareToken) {
      message.info('Nincs elmentett preview, amit törölni lehetne');
      return;
    }
    try {
      await api.delete(`/printshop/shared-preview/${standaloneShareToken}/`);
      message.success('PDF törölve');
      handleNewPreview();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'A törlés sikertelen');
    }
  };

  const handleOpenStorage = () => {
    try {
      const current = window.location.pathname + window.location.search;
      sessionStorage.setItem('printStorageReturnUrl', current);
    } catch {
      // ignore storage errors
    }
    window.location.href = '/print-storage';
  };

  const handleCopyStandalonePreviewUrl = async () => {
    const previewUrl = buildStandalonePreviewUrl(orderId, itemId, standaloneShareToken);
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      message.success('Preview oldal link kimásolva');
    } catch {
      message.error('A preview oldal link másolása nem sikerült');
    }
  };

  useEffect(() => {
    if (!shareModalOpen || publicToken || orderId || itemId || standaloneShareToken || !localPdfFile) return;
    let cancelled = false;
    (async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', localPdfFile);
        formData.append('enabled', 'false');
        formData.append('editable', String(previewShare.editable));
        formData.append('commentable', String(previewShare.commentable));
        formData.append('exportable', String(previewShare.exportable));
        formData.append('annotations', JSON.stringify(localAnnotations));
        formData.append('title', localPdfFile.name || 'Preview PDF');
        const response = await api.post('/printshop/shared-preview/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (cancelled) return;
        const shareAutoToken = response.data?.token;
        if (shareAutoToken && shareAutoToken !== 'null' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/print-preview?shareToken=${shareAutoToken}`);
          try { sessionStorage.setItem('currentSessionPreviewToken', shareAutoToken); localStorage.setItem('lastPrintPreviewToken', shareAutoToken); } catch { /* ignore */ }
        }
        setShareConfig({
          pdf_url: response.data?.pdf_url,
          editable: response.data?.editable,
          commentable: response.data?.commentable,
          exportable: response.data?.exportable,
          default_author_name: authorName,
        });
        setPreviewShare({
          enabled: response.data?.is_active ?? false,
          editable: !!response.data?.editable,
          commentable: response.data?.commentable !== false,
          exportable: !!response.data?.exportable,
          url: response.data?.url || '',
        });
      } catch (err: any) {
        if (!cancelled) {
          message.error(err?.response?.data?.error || 'Nem sikerült előkészíteni a megosztási linket');
          setShareModalOpen(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authorName, localAnnotations, localPdfFile, orderId, itemId, previewShare.commentable, previewShare.editable, previewShare.exportable, publicToken, shareModalOpen, standaloneShareToken]);

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  }

  if (error) {
    return <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}><Alert type="error" showIcon message="Megosztott preview" description={error} /></div>;
  }

  if (!publicToken && (!orderId || !itemId) && !isAdmin) {
    window.location.replace('/print-storage');
    return null;
  }

  const showPrintCommentView = startupDecided || !!publicToken || !!orderId || !!itemId || !!standaloneShareToken;

  return (
    <>
      {!publicToken && isAdmin && (
        <div style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid #e8e8e8',
          background: '#fff',
        }}>
          <Text strong>Preview</Text>
          <Space size="small" wrap>
            <Tooltip title="Új üres preview (aktuális PDF eldobva)">
              <Button size="small" icon={<PlusOutlined />} onClick={handleNewPreview}>Új</Button>
            </Tooltip>
            <Tooltip title="PDF + kommentek mentése a tárhelyre">
              <Button
                size="small"
                icon={<SaveOutlined />}
                onClick={handleOpenSaveModal}
                disabled={!localPdfFile && !standaloneShareToken}
              >
                Mentés
              </Button>
            </Tooltip>
            <Popconfirm
              title="Biztosan törlöd az aktuális mentett previewt?"
              okText="Törlés"
              cancelText="Mégse"
              okButtonProps={{ danger: true }}
              onConfirm={handleDeleteCurrent}
              disabled={!standaloneShareToken}
            >
              <Tooltip title={standaloneShareToken ? 'Jelenlegi mentett preview törlése' : 'Nincs elmentett preview'}>
                <Button size="small" danger icon={<DeleteOutlined />} disabled={!standaloneShareToken}>Töröl</Button>
              </Tooltip>
            </Popconfirm>
            <Tooltip title="Tárhely megnyitása">
              <Button size="small" icon={<FolderOpenOutlined />} onClick={handleOpenStorage}>Tárhely</Button>
            </Tooltip>
            <Tooltip title={standaloneShareToken ? 'Verziók kezelése' : 'Előbb mentsd a tárhelybe'}>
              <Button
                size="small"
                icon={<BranchesOutlined />}
                onClick={handleOpenVersions}
                disabled={!standaloneShareToken}
              >
                Verziók{latestVersionNumber ? ` (v${latestVersionNumber})` : ''}
              </Button>
            </Tooltip>
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              type={previewShare.enabled ? 'primary' : 'default'}
              onClick={() => setShareModalOpen(true)}
            >
              Megosztás
            </Button>
          </Space>
        </div>
      )}

      {showPrintCommentView && (
        <PrintCommentView
          orderId={orderId}
          itemId={itemId}
          isAdmin={isAdmin}
          authorName={authorName}
          shareToken={publicToken ?? standaloneShareToken ?? undefined}
          canEdit={publicToken ? !!shareConfig?.editable : isAdmin}
          canComment={publicToken ? !!shareConfig?.commentable : true}
          canExport={publicToken ? !!shareConfig?.exportable : true}
          initialPdfUrl={publicToken || standaloneShareToken ? (shareConfig?.pdf_url ?? null) : (itemConfig?.generated_pdf_url ?? null)}
          hideUpload={!!publicToken && !shareConfig?.editable}
          onPdfFileChange={setLocalPdfFile}
          onAnnotationsChange={setLocalAnnotations}
        />
      )}

      <Modal
        title="Preview megosztás"
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        onOk={handleSavePreviewShare}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={shareSaving}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert
            type="info"
            showIcon
            message="Preview: belső kollégáknak | Megosztási link: külső ügyfeleknek"
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Publikus link engedélyezése</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Az admin itt állítja be, hogyan lássa az ügyfél a preview-t.</Text></div>
            </div>
            <Switch checked={previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, enabled: checked }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Szerkeszthető</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Minden admin preview eszközt megkap az ügyfél.</Text></div>
            </div>
            <Switch checked={previewShare.editable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, editable: checked }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Kommentelhető</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Ha ki van kapcsolva, a komment eszközök sem látszanak.</Text></div>
            </div>
            <Switch checked={previewShare.commentable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, commentable: checked }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <Text strong>Exportálható</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Az export gomb csak ekkor jelenik meg.</Text></div>
            </div>
            <Switch checked={previewShare.exportable} disabled={!previewShare.enabled} onChange={checked => setPreviewShare(prev => ({ ...prev, exportable: checked }))} />
          </div>

          <div>
            <Tooltip title="Preview: belső kollégáknak. Ezzel a belső preview oldal nyílik meg ugyanazzal a PDF-fel és állapottal.">
              <Text strong>Preview oldal link</Text>
            </Tooltip>
            <Space.Compact style={{ width: '100%', marginTop: 8, marginBottom: 12 }}>
              <Input readOnly value={buildStandalonePreviewUrl(orderId, itemId, standaloneShareToken)} placeholder="Az adott PDF preview oldala" />
              <Button icon={<CopyOutlined />} onClick={handleCopyStandalonePreviewUrl} disabled={!buildStandalonePreviewUrl(orderId, itemId, standaloneShareToken)}>Másolás</Button>
            </Space.Compact>

            <Tooltip title="Megosztási link: külső ügyfeleknek. Ezt a publikus, jogosultságokkal szabályozott linket küldd ki az ügyfélnek.">
              <Text strong>Megosztási link</Text>
            </Tooltip>
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input readOnly value={previewShare.enabled ? previewShare.url : ''} placeholder="Mentés után itt jelenik meg a link" />
              <Button icon={<CopyOutlined />} onClick={handleCopyPreviewShareUrl} disabled={!previewShare.enabled || !previewShare.url}>Másolás</Button>
            </Space.Compact>
          </div>
        </div>
      </Modal>

      <Modal
        title="Mentés a tárhelyre"
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onOk={handleSaveToStorage}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>Fájl neve</Text>
            <Input
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value)}
              placeholder="PDF neve a tárhelyen"
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>Mappa</Text>
            <Space.Compact style={{ width: '100%', marginTop: 4 }}>
              <Select
                style={{ flex: 1 }}
                placeholder="Gyökér (nincs mappa)"
                value={saveFolderId ?? undefined}
                onChange={v => setSaveFolderId(v ?? null)}
                allowClear
                options={saveFolders.map(f => ({
                  value: f.id,
                  label: f.parent
                    ? `${saveFolders.find(pp => pp.id === f.parent)?.name || '…'} / ${f.name}`
                    : f.name,
                }))}
              />
              <Tooltip title="Új mappa létrehozása">
                <Button icon={<FolderAddOutlined />} onClick={() => setSaveCreateFolderOpen(true)} />
              </Tooltip>
            </Space.Compact>
          </div>
          {!standaloneShareToken && (
            <Alert
              type="info"
              showIcon
              message={`A PDF ${localAnnotations.length ? `és ${localAnnotations.length} komment ` : ''}elmentésre kerül a tárhelybe (v1). Megosztás alapból kikapcsolva.`}
            />
          )}
          {standaloneShareToken && (
            <Alert
              type="info"
              showIcon
              message={`Új verzió készül a jelenlegi tartalomból${latestVersionNumber ? ` (legutóbbi: v${latestVersionNumber})` : ''}. A régi verziók megmaradnak.`}
            />
          )}
          <div>
            <Text strong>Verzió megjegyzés (opcionális)</Text>
            <Input
              value={saveVersionNote}
              onChange={e => setSaveVersionNote(e.target.value)}
              placeholder="pl. Kommentek javítva, új layout, stb."
              maxLength={500}
              style={{ marginTop: 4 }}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="Verziók"
        open={versionsModalOpen}
        onCancel={() => setVersionsModalOpen(false)}
        footer={<Button onClick={() => setVersionsModalOpen(false)}>Bezár</Button>}
        width={640}
      >
        {versionsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <List
            dataSource={versions}
            locale={{ emptyText: 'Nincsenek verziók' }}
            renderItem={(v: any) => (
              <List.Item
                actions={[
                  <Button key="open" size="small" icon={<FolderOpenOutlined />} onClick={() => handleOpenVersionPdf(v)}>Megnyit</Button>,
                  <Popconfirm
                    key="restore"
                    title={`Visszaállítod a v${v.version_number} verziót?`}
                    description="A jelenlegi tartalom új verziószámmal megmarad."
                    onConfirm={() => handleRestoreVersion(v)}
                    okText="Visszaállít"
                    cancelText="Mégse"
                  >
                    <Button size="small" icon={<ReloadOutlined />}>Visszaállít</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color="blue">v{v.version_number}</Tag>
                      <span>{v.note || <Text type="secondary">(nincs megjegyzés)</Text>}</span>
                    </Space>
                  }
                  description={
                    <Text type="secondary">
                      {v.created_by_name || 'Ismeretlen'} • {v.created_at ? new Date(v.created_at).toLocaleString('hu-HU') : ''}
                      {Array.isArray(v.annotations) && v.annotations.length ? ` • ${v.annotations.length} komment` : ''}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      <Modal
        title="Mappa létrehozása"
        open={saveCreateFolderOpen}
        onCancel={() => { setSaveCreateFolderOpen(false); setSaveNewFolderName(''); }}
        onOk={handleSaveCreateFolder}
        okText="Létrehoz"
        cancelText="Mégse"
      >
        <Input
          placeholder="Mappa neve"
          value={saveNewFolderName}
          onChange={e => setSaveNewFolderName(e.target.value)}
          onPressEnter={handleSaveCreateFolder}
          autoFocus
        />
      </Modal>

      {/* ── Munkafelület visszaállítás ── */}
      <Modal
        title="Munkafelület megnyitása"
        open={startModalOpen}
        onCancel={async () => {
          await clearPdfFromIDB();
          try {
            sessionStorage.removeItem('currentSessionPreviewToken');
            sessionStorage.setItem('printPreviewStartupDone', '1');
            // Note: localStorage is intentionally kept – other/future tabs can still restore from history
          } catch { /* ignore */ }
          setStartModalOpen(false);
          setStartupDecided(true);
        }}
        footer={null}
        closable
        maskClosable={false}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%', padding: '8px 0 4px' }} size="large">
          <Text>{lastToken ? 'Volt egy korábbi munkafelületed. Mit szeretnél tenni?' : 'Hogyan szeretnéd kezdeni?'}</Text>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {lastToken && (
              <Button
                type="primary"
                size="large"
                icon={<ReloadOutlined />}
                style={{ flex: 1 }}
                onClick={() => {
                  setStartModalOpen(false);
                  window.location.replace(`/print-preview?shareToken=${lastToken}`);
                }}
              >
                <span>
                  Legutóbbi betöltése
                  {lastTokenTitle && (
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{lastTokenTitle}</div>
                  )}
                </span>
              </Button>
            )}
            <Button
              size="large"
              icon={<PlusOutlined />}
              style={{ flex: 1 }}
              onClick={async () => {
                await clearPdfFromIDB();
                try {
                  sessionStorage.removeItem('currentSessionPreviewToken');
                  sessionStorage.setItem('printPreviewStartupDone', '1');
                  localStorage.removeItem('lastPrintPreviewToken');
                  localStorage.removeItem('lastPrintPreviewTitle');
                } catch { /* ignore */ }
                setStartModalOpen(false);
                setStartupDecided(true);
              }}
            >
              Új munkafelület
            </Button>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default PrintPreviewPage;
