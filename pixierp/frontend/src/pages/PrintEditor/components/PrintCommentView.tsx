import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, List, Avatar, Tooltip, Typography, Upload, message, Spin, Badge } from 'antd';
import {
  CommentOutlined, CheckOutlined, DeleteOutlined,
  FilePdfOutlined, MessageOutlined, CloseOutlined, LockOutlined,
} from '@ant-design/icons';
import api from '../../../services/api';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommentAnnotation {
  id: number;
  x: number;       // 0-1 relative to image
  y: number;
  w: number;
  h: number;
  page: number;
  text: string;
  author: string;
  created_at: string;
  resolved: boolean;
  color: string;
}

interface PendingRect {
  x: number; y: number; w: number; h: number;
}

interface Props {
  orderId?: number | null;
  itemId?: number | null;
  isAdmin: boolean;
  locked?: boolean;
  authorName: string;
}

// ─── Colour pool ──────────────────────────────────────────────────────────────

const COLORS = ['#1890ff', '#fa8c16', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2'];
let colorIdx = 0;
const nextColor = () => COLORS[(colorIdx++) % COLORS.length];

// ─── Component ────────────────────────────────────────────────────────────────

const PrintCommentView: React.FC<Props> = ({ orderId, itemId, isAdmin, locked = false, authorName }) => {
  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);   // data-URLs per page
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Annotation state
  const [annotations, setAnnotations] = useState<CommentAnnotation[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Drag-to-draw state
  const [drawing, setDrawing] = useState(false);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Load annotations ────────────────────────────────────────────────────────
  const loadAnnotations = useCallback(async () => {
    if (!itemId) return;
    setLoadingAnnotations(true);
    try {
      const r = await api.get(`printshop/order-items/${itemId}/comments/`);
      setAnnotations(r.data ?? []);
    } catch {
      // If endpoint not yet deployed, start empty
      setAnnotations([]);
    } finally {
      setLoadingAnnotations(false);
    }
  }, [itemId]);

  useEffect(() => { loadAnnotations(); }, [loadAnnotations]);

  // ── PDF rendering ────────────────────────────────────────────────────────────
  const renderPdf = useCallback(async (file: File) => {
    setLoadingPdf(true);
    setPdfPages([]);
    setCurrentPage(1);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjs = (await import('pdfjs-dist')).default ?? (await import('pdfjs-dist'));
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const dpr = window.devicePixelRatio || 1;
        const rs = Math.max(2, dpr * 1.5);
        const vp = page.getViewport({ scale: rs });
        const c = document.createElement('canvas');
        c.width = vp.width;
        c.height = vp.height;
        const ctx = c.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
        pages.push(c.toDataURL('image/png'));
      }
      setPdfPages(pages);
    } catch (err) {
      console.error('PDF render error:', err);
      message.error('PDF betöltési hiba');
    } finally {
      setLoadingPdf(false);
    }
  }, []);

  // ── Overlay geometry helpers ─────────────────────────────────────────────────
  const getRelPos = (e: React.MouseEvent) => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  // ── Drawing handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!pdfPages.length) return;
    e.preventDefault();
    const pos = getRelPos(e);
    if (!pos) return;
    setDrawing(true);
    setDrawStart(pos);
    setPendingRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setSelectedId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !drawStart) return;
    const pos = getRelPos(e);
    if (!pos) return;
    setPendingRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawing(false);
    const pos = getRelPos(e);
    if (!pos || !drawStart) return;
    const w = Math.abs(pos.x - drawStart.x);
    const h = Math.abs(pos.y - drawStart.y);
    if (w < 0.01 && h < 0.01) {
      // Tiny click — cancel
      setPendingRect(null);
      setDrawStart(null);
      return;
    }
    setPendingRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w, h,
    });
    setDrawStart(null);
    setNewComment('');
  };

  // ── Save new annotation ───────────────────────────────────────────────────────
  const handleSaveComment = async () => {
    if (!pendingRect || !newComment.trim()) return;
    setSavingComment(true);
    const annotation: Omit<CommentAnnotation, 'id' | 'created_at'> = {
      ...pendingRect,
      page: currentPage,
      text: newComment.trim(),
      author: authorName,
      resolved: false,
      color: nextColor(),
    };
    try {
      if (itemId) {
        const r = await api.post(`printshop/order-items/${itemId}/comments/`, annotation);
        setAnnotations(prev => [...prev, r.data]);
      } else {
        // Purely local (no order yet)
        setAnnotations(prev => [...prev, { ...annotation, id: Date.now(), created_at: new Date().toISOString() }]);
      }
      setPendingRect(null);
      setNewComment('');
    } catch {
      message.error('Komment mentési hiba');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteAnnotation = async (id: number) => {
    try {
      if (itemId) await api.delete(`printshop/order-items/${itemId}/comments/${id}/`);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch {
      message.error('Törlési hiba');
    }
  };

  const handleResolve = async (id: number) => {
    try {
      if (itemId) await api.patch(`printshop/order-items/${itemId}/comments/${id}/`, { resolved: true });
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch {
      message.error('Hiba');
    }
  };

  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f0f2f5', position: 'relative' }}>
      {/* Lock overlay */}
      {locked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}>
          <LockOutlined style={{ fontSize: 48, color: '#fff' }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>A preview zárolva van</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Az admin engedélyezése szükséges a kommenteléshez</Text>
        </div>
      )}

      {/* ── Left: PDF viewer + overlay ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 8 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Upload
            accept=".pdf"
            showUploadList={false}
            beforeUpload={file => { setPdfFile(file); renderPdf(file); return false; }}
          >
            <Button icon={<FilePdfOutlined />} size="small">PDF betöltése</Button>
          </Upload>
          {pdfPages.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Button size="small" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>‹</Button>
              <Text style={{ fontSize: 12 }}>{currentPage} / {pdfPages.length}</Text>
              <Button size="small" disabled={currentPage >= pdfPages.length} onClick={() => setCurrentPage(p => p + 1)}>›</Button>
            </div>
          )}
          {pdfPages.length > 0 && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              <CommentOutlined /> Kattints és húzz egy területet a kommentáláshoz
            </Text>
          )}
        </div>

        {/* PDF + overlay */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {loadingPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, width: '100%' }}>
              <Spin size="large" tip="PDF betöltése..." />
            </div>
          ) : pdfPages.length === 0 ? (
            <Upload
              accept=".pdf"
              showUploadList={false}
              beforeUpload={file => { setPdfFile(file); renderPdf(file); return false; }}
            >
              <div style={{
                border: '2px dashed #d9d9d9', borderRadius: 8, padding: 48,
                cursor: 'pointer', color: '#999', textAlign: 'center', background: '#fff',
              }}>
                <FilePdfOutlined style={{ fontSize: 48, marginBottom: 12 }} />
                <div>Húzz ide egy PDF fájlt, vagy kattints a betöltéshez</div>
              </div>
            </Upload>
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              {/* PDF page image */}
              <img
                ref={imageRef}
                src={pdfPages[currentPage - 1]}
                alt={`${currentPage}. oldal`}
                style={{ display: 'block', maxWidth: '100%', userSelect: 'none' }}
                draggable={false}
              />

              {/* Annotation overlay */}
              <div
                ref={overlayRef}
                style={{
                  position: 'absolute', inset: 0,
                  cursor: drawing ? 'crosshair' : 'crosshair',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {/* Existing annotations */}
                {pageAnnotations.map(a => (
                  <div
                    key={a.id}
                    onClick={e => { e.stopPropagation(); setSelectedId(a.id === selectedId ? null : a.id); }}
                    style={{
                      position: 'absolute',
                      left: `${a.x * 100}%`, top: `${a.y * 100}%`,
                      width: `${a.w * 100}%`, height: `${a.h * 100}%`,
                      border: `2px solid ${a.color}`,
                      background: a.id === selectedId ? `${a.color}22` : `${a.color}11`,
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      opacity: a.resolved ? 0.4 : 1,
                    }}
                  >
                    {/* Badge */}
                    <div style={{
                      position: 'absolute', top: -10, right: -10,
                      background: a.color, color: '#fff',
                      borderRadius: '50%', width: 18, height: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                    }}>
                      <MessageOutlined />
                    </div>

                    {/* Popup */}
                    {a.id === selectedId && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', top: '100%', left: 0, zIndex: 100,
                          background: '#fff', borderRadius: 6,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                          padding: 10, minWidth: 220, maxWidth: 280,
                          border: `1.5px solid ${a.color}`,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                          <Avatar size={22} style={{ background: a.color, flexShrink: 0 }}>
                            {a.author.charAt(0).toUpperCase()}
                          </Avatar>
                          <div style={{ flex: 1 }}>
                            <Text strong style={{ fontSize: 11 }}>{a.author}</Text>
                            <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                              {new Date(a.created_at).toLocaleString('hu-HU')}
                            </Text>
                          </div>
                        </div>
                        <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{a.text}</Text>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                          {!a.resolved && (
                            <Tooltip title="Megoldva">
                              <Button size="small" icon={<CheckOutlined />} onClick={() => handleResolve(a.id)} />
                            </Tooltip>
                          )}
                          {isAdmin && (
                            <Tooltip title="Törlés">
                              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteAnnotation(a.id)} />
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Pending rect being drawn */}
                {pendingRect && pendingRect.w > 0.005 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${pendingRect.x * 100}%`, top: `${pendingRect.y * 100}%`,
                      width: `${pendingRect.w * 100}%`, height: `${pendingRect.h * 100}%`,
                      border: '2px dashed #1890ff',
                      background: 'rgba(24,144,255,0.08)',
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>

              {/* New comment input box — anchored below the pending rect */}
              {pendingRect && !drawing && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${pendingRect.x * 100}%`,
                    top: `${(pendingRect.y + pendingRect.h) * 100}%`,
                    zIndex: 200,
                    background: '#fff',
                    border: '1.5px solid #1890ff',
                    borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    padding: 10,
                    minWidth: 240,
                    maxWidth: 300,
                  }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                    <CommentOutlined /> Komment hozzáadása
                  </Text>
                  <TextArea
                    autoFocus
                    rows={3}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Írj kommentet..."
                    style={{ fontSize: 12 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveComment();
                      if (e.key === 'Escape') { setPendingRect(null); setNewComment(''); }
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <Button size="small" icon={<CloseOutlined />} onClick={() => { setPendingRect(null); setNewComment(''); }}>
                      Mégse
                    </Button>
                    <Button
                      size="small" type="primary"
                      loading={savingComment}
                      disabled={!newComment.trim()}
                      onClick={handleSaveComment}
                    >
                      Mentés <Text style={{ color: '#fff', fontSize: 10, opacity: 0.7 }}> Ctrl+Enter</Text>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Comments panel ── */}
      <div style={{
        width: 300, flexShrink: 0,
        borderLeft: '1px solid #e8e8e8',
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Title level={5} style={{ margin: 0, fontSize: 13 }}>
            <CommentOutlined /> Kommentek
            {annotations.length > 0 && (
              <Badge
                count={annotations.filter(a => !a.resolved).length}
                style={{ marginLeft: 8, background: '#1890ff' }}
              />
            )}
          </Title>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loadingAnnotations ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : annotations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>
              <CommentOutlined style={{ fontSize: 28, marginBottom: 8 }} />
              <div style={{ fontSize: 12 }}>Még nincs komment</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Rajzolj egy keretet a PDF-en</div>
            </div>
          ) : (
            <List
              dataSource={[...annotations].sort((a, b) => {
                if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })}
              renderItem={a => (
                <List.Item
                  key={a.id}
                  style={{
                    padding: '8px 16px',
                    background: selectedId === a.id ? '#e6f4ff' : 'transparent',
                    cursor: 'pointer',
                    opacity: a.resolved ? 0.5 : 1,
                    borderLeft: `3px solid ${a.color}`,
                    marginBottom: 2,
                  }}
                  onClick={() => {
                    setCurrentPage(a.page);
                    setSelectedId(a.id === selectedId ? null : a.id);
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Avatar size={18} style={{ background: a.color, fontSize: 10, flexShrink: 0 }}>
                        {a.author.charAt(0).toUpperCase()}
                      </Avatar>
                      <Text strong style={{ fontSize: 11 }}>{a.author}</Text>
                      <Text type="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>
                        {a.page}. oldal
                      </Text>
                    </div>
                    <Text style={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {a.text}
                    </Text>
                    {a.resolved && (
                      <Text type="success" style={{ fontSize: 10 }}><CheckOutlined /> Megoldva</Text>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintCommentView;
