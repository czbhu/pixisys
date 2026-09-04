import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Divider, Form, Input, Spin, Tabs, Typography, message } from 'antd';
import { LockOutlined, MailOutlined, MobileOutlined, QrcodeOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { publicPortalService } from '../../services/publicPortalService';

const { Title, Text } = Typography;

export const ClientPortalMagicLoginPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMsg('Hiányzó token.'); return; }
    publicPortalService.magicLogin(token)
      .then(res => {
        localStorage.setItem('portal_access_token', res.token);
        setStatus('ok');
        setTimeout(() => navigate('/portal'), 1200);
      })
      .catch(err => {
        setStatus('error');
        setMsg(err?.response?.data?.error || 'Érvénytelen vagy lejárt link.');
      });
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 360, textAlign: 'center' }}>
        {status === 'loading' && <><Spin size="large" /><div style={{ marginTop: 16 }}>Bejelentkezés...</div></>}
        {status === 'ok' && <Alert type="success" message="Sikeres bejelentkezés" description="Átirányítás a portálra..." showIcon />}
        {status === 'error' && <><Alert type="error" message="Hiba" description={msg} showIcon /><Button style={{ marginTop: 12 }} onClick={() => navigate('/portal/login')}>Vissza a bejelentkezéshez</Button></>}
      </Card>
    </div>
  );
};

const QRLoginTab: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<any>(null);

  // QR login: user requests a QR by entering their email; we generate a pending magic token
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const requestQR = async () => {
    if (!email.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await publicPortalService.requestMagicQR(email.trim());
      setQrUrl(res.magic_url);
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const poll = await publicPortalService.pollMagicToken(res.token);
          if (poll?.token) {
            clearInterval(pollRef.current);
            setPolling(false);
            onLogin(poll.token);
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nem sikerült QR kódot generálni.');
    } finally { setLoading(false); }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      {!qrUrl ? (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Add meg az e-mail címed, majd olvasd be a QR kódot a telefonodra küldött linken.
          </Text>
          <Input
            prefix={<MailOutlined />}
            placeholder="E-mail cím"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onPressEnter={requestQR}
            style={{ marginBottom: 12 }}
          />
          {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}
          <Button type="primary" icon={<QrcodeOutlined />} loading={loading} onClick={requestQR} block>
            QR kód generálása
          </Button>
        </>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Olvasd be a QR kódot a telefonodról a bejelentkezéshez:
          </Text>
          <div style={{ display: 'inline-block', padding: 12, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8 }}>
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          {polling && (
            <div style={{ marginTop: 12, color: '#1677ff' }}>
              <Spin size="small" /> Várakozás a beolvasásra...
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Button size="small" type="link" onClick={() => { setQrUrl(null); if (pollRef.current) clearInterval(pollRef.current); setPolling(false); }}>
              Új QR kód
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

const ClientPortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('portal_access_token');
    if (token) navigate('/portal', { replace: true });
  }, []);

  const handleLogin = async (values: any) => {
    setLoading(true); setError('');
    try {
      const res = await publicPortalService.login(values.email.trim().toLowerCase(), values.password);
      localStorage.setItem('portal_access_token', res.token);
      navigate('/portal', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Bejelentkezési hiba.');
    } finally { setLoading(false); }
  };

  const handleQRLogin = (token: string) => {
    localStorage.setItem('portal_access_token', token);
    message.success('Sikeres bejelentkezés');
    navigate('/portal', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <Card style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,.18)', borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>Kliens portál</Title>
          <Text type="secondary">Bejelentkezés</Text>
        </div>
        <Tabs
          defaultActiveKey="password"
          items={[
            {
              key: 'password',
              label: <><MailOutlined /> E-mail + jelszó</>,
              children: (
                <Form form={form} layout="vertical" onFinish={handleLogin}>
                  <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Érvényes e-mail kötelező' }]}>
                    <Input prefix={<MailOutlined />} placeholder="E-mail cím" size="large" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: 'Jelszó kötelező' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Jelszó" size="large" />
                  </Form.Item>
                  {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
                  <Button type="primary" htmlType="submit" loading={loading} block size="large">
                    Bejelentkezés
                  </Button>
                </Form>
              ),
            },
            {
              key: 'qr',
              label: <><MobileOutlined /> QR kóddal</>,
              children: <QRLoginTab onLogin={handleQRLogin} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default ClientPortalLogin;
