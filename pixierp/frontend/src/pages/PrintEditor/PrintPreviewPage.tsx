import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Modal, Space, Spin, Switch, Tooltip, Typography, message } from 'antd';
import { CopyOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import PrintCommentView from './components/PrintCommentView';
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
  const standaloneShareToken = useMemo(() => queryParams.get('shareToken'), [queryParams]);
  const isAdmin = user?.is_superuser || user?.is_staff || false;
  const userAuthorName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : 'Ügyfél';

  useEffect(() => {
    if (!standaloneShareToken || publicToken) return;
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
          const nextUrl = buildStandalonePreviewUrl(null, null, response.data?.token);
          if (nextUrl && typeof window !== 'undefined') {
            window.history.replaceState({}, '', `/print-preview?shareToken=${response.data?.token}`);
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
        window.history.replaceState({}, '', `/print-preview?shareToken=${response.data?.token}`);
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
    return (
      <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
        <Alert
          type="info"
          showIcon
          message="Preview link szükséges"
          description="Nyisd meg ezt az oldalt egy konkrét preview linkkel, például orderId és itemId paraméterekkel."
        />
      </div>
    );
  }

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
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            type={previewShare.enabled ? 'primary' : 'default'}
            onClick={() => setShareModalOpen(true)}
          >
            Megosztás
          </Button>
        </div>
      )}

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
    </>
  );
};

export default PrintPreviewPage;
