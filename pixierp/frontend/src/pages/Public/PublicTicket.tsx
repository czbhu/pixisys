import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, List, Upload, Button, message, Input, Space } from 'antd';
import { useParams } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload/interface';
import api from '../../services/api';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const PublicTicket: React.FC = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [replyHtml, setReplyHtml] = useState('');
  const [replyFiles, setReplyFiles] = useState<UploadFile[]>([]);

  const loadTicket = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await api.get(`/tickets/public/${token}/`);
      setTicket(response.data);
      setAuthorName(response.data?.requester_name || '');
      setAuthorEmail(response.data?.requester_email || '');
    } catch {
      message.error('A jegy nem található vagy nem érhető el.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [token]);

  const sendReply = async () => {
    if (!token || !ticket) return;

    const plainText = (replyHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!plainText) {
      message.warning('A válasz üzenet kötelező');
      return;
    }

    const payload = new FormData();
    payload.append('body_html', replyHtml);
    payload.append('author_name', authorName || 'Külsős');
    payload.append('author_email', authorEmail || '');
    replyFiles.forEach((file) => {
      if (file.originFileObj) {
        payload.append('files', file.originFileObj as File);
      }
    });

    try {
      setReplying(true);
      await api.post(`/tickets/public/${token}/reply/`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('Válasz elküldve');
      setReplyHtml('');
      setReplyFiles([]);
      await loadTicket();
    } catch {
      message.error('Nem sikerült elküldeni a választ');
    } finally {
      setReplying(false);
    }
  };

  if (!ticket) {
    return <div style={{ padding: 24 }}>{loading ? 'Betöltés...' : 'Jegy nem található.'}</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: '0 12px' }}>
      <Card loading={loading}>
        <Title level={4} style={{ marginBottom: 8 }}>
          {ticket.ticket_number} - {ticket.title}
        </Title>
        <Space wrap style={{ marginBottom: 16 }}>
          <Tag color="blue">{ticket.status_display}</Tag>
          <Tag>{ticket.ticket_type_display}</Tag>
          <Tag>{ticket.audience_display}</Tag>
          {ticket.topic_name ? <Tag color="purple">{ticket.topic_name}</Tag> : null}
        </Space>

        <List
          bordered
          dataSource={ticket.messages || []}
          locale={{ emptyText: 'Nincs még üzenet' }}
          renderItem={(item: any) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <Text type="secondary">
                  {item.author_name_display} • {new Date(item.created_at).toLocaleString('hu-HU')}
                </Text>
                <div style={{ marginTop: 6 }} dangerouslySetInnerHTML={{ __html: item.body_html }} />
                {item.attachments?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {item.attachments.map((attachment: any) => (
                      <a key={attachment.id} href={attachment.file_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                        {attachment.file_name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </List.Item>
          )}
        />

        {ticket.public_reply_enabled ? (
          <>
            <div style={{ marginTop: 20, fontWeight: 600 }}>Válasz küldése</div>
            <Space style={{ width: '100%', marginTop: 10 }} align="start">
              <Input
                style={{ minWidth: 280 }}
                placeholder="Neved"
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
              />
              <Input
                style={{ minWidth: 280 }}
                placeholder="Email címed"
                value={authorEmail}
                onChange={(event) => setAuthorEmail(event.target.value)}
              />
            </Space>

            <div style={{ marginTop: 10 }}>
              <ReactQuill theme="snow" value={replyHtml} onChange={setReplyHtml} style={{ height: 180, marginBottom: 42 }} />
            </div>

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
              <Button type="primary" loading={replying} onClick={sendReply}>
                Válasz küldése
              </Button>
            </div>
          </>
        ) : (
          <Tag color="default" style={{ marginTop: 16 }}>A publikus válasz ezen a jegyen nincs engedélyezve.</Tag>
        )}
      </Card>
    </div>
  );
};

export default PublicTicket;
