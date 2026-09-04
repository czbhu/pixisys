import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Form, Input, Modal, Spin, Typography, message } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LockOutlined, MailOutlined, QrcodeOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { publicPortalService } from "../../services/publicPortalService";

const { Title, Text } = Typography;
const QR_POLL_INTERVAL = 2000;

export const ClientPortalMagicLoginPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!token) { setStatus("error"); setMsg("Hiányzó token."); return; }
    publicPortalService.magicLogin(token)
      .then(res => { localStorage.setItem("portal_access_token", res.token); setStatus("ok"); setTimeout(() => navigate("/portal"), 1200); })
      .catch(err => { setStatus("error"); setMsg(err?.response?.data?.error || "Érvénytelen vagy lejárt link."); });
  }, [token]);
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: 360, textAlign: "center", borderRadius: 12 }}>
        <Title level={3} style={{ color: "#1890ff", marginBottom: 8 }}>Kliens portál</Title>
        {status === "loading" && <><Spin size="large" /><div style={{ marginTop: 16, color: "#888" }}>Bejelentkezés...</div></>}
        {status === "error" && <><Alert type="error" message="Hiba" description={msg} showIcon style={{ marginBottom: 12 }} /><Button onClick={() => navigate("/portal/login")}>← Vissza</Button></>}
      </Card>
    </div>
  );
};

export const ClientPortalForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const handleSubmit = async (values: any) => {
    setLoading(true);
    try { await publicPortalService.forgotPassword(values.email); } catch {}
    setDone(true); setLoading(false);
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 400, boxShadow: "0 4px 24px rgba(0,0,0,.1)", borderRadius: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Title level={2} style={{ color: "#1890ff", marginBottom: 8 }}>Kliens portál</Title>
          <Text type="secondary">Jelszó emlékeztető</Text>
        </div>
        {done ? (
          <><Alert type="success" showIcon message="E-mail elküldve" description="Ha az e-mail cím regisztrált, hamarosan megérkezik a visszaállító link." style={{ marginBottom: 16 }} /><Button block onClick={() => navigate("/portal/login")}>← Vissza a bejelentkezéshez</Button></>
        ) : (
          <Form layout="vertical" size="large" onFinish={handleSubmit}>
            <Form.Item name="email" rules={[{ required: true, type: "email", message: "Érvényes e-mail kötelező" }]}>
              <Input prefix={<MailOutlined />} placeholder="E-mail cím" />
            </Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={loading} block>Visszaállító link küldése</Button></Form.Item>
            <Button type="link" block onClick={() => navigate("/portal/login")}>← Vissza a bejelentkezéshez</Button>
          </Form>
        )}
      </Card>
    </div>
  );
};

const ClientPortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"loading" | "pending" | "approved" | "expired">("loading");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { const t = localStorage.getItem("portal_access_token"); if (t) navigate("/portal", { replace: true }); }, []);

  const handleLogin = async (values: any) => {
    setLoading(true);
    try {
      const res = await publicPortalService.login(values.email.trim().toLowerCase(), values.password);
      localStorage.setItem("portal_access_token", res.token);
      navigate("/portal", { replace: true });
    } catch (err: any) { message.error(err?.response?.data?.error || "Hibás e-mail vagy jelszó."); }
    finally { setLoading(false); }
  };

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const openQrModal = async () => {
    setQrData(null); setQrSessionId(null); setQrStatus("loading"); setQrModalOpen(true);
    try { const res = await publicPortalService.qrCreate(); setQrData(res.qr_data); setQrSessionId(res.session_id); setQrStatus("pending"); }
    catch { setQrStatus("expired"); }
  };

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await publicPortalService.qrPoll(qrSessionId!);
        if (res?.status === "approved" && res.token) {
          stopPolling(); setQrStatus("approved");
          localStorage.setItem("portal_access_token", res.token);
          setTimeout(() => { setQrModalOpen(false); navigate("/portal", { replace: true }); }, 1200);
        } else if (res?.status === "expired") { stopPolling(); setQrStatus("expired"); }
      } catch {}
    }, QR_POLL_INTERVAL);
    return stopPolling;
  }, [qrModalOpen, qrSessionId, qrStatus]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 400, boxShadow: "0 4px 24px rgba(0,0,0,.1)", borderRadius: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={2} style={{ color: "#1890ff", marginBottom: 8 }}>Kliens portál</Title>
          <Text type="secondary">Bejelentkezés</Text>
        </div>
        <Form name="portal-login" onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item name="email" rules={[{ required: true, message: "Kérjük, adja meg az e-mail címet!" }, { type: "email", message: "Érvényes e-mail szükséges!" }]}>
            <Input prefix={<MailOutlined />} placeholder="E-mail cím" type="email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Kérjük, adja meg a jelszót!" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Jelszó" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={loading} block size="large">Bejelentkezés</Button></Form.Item>
          <Button icon={<QrcodeOutlined />} block size="large" onClick={openQrModal} style={{ marginBottom: 8 }}>Bejelentkezés QR kóddal</Button>
          <Button type="link" block onClick={() => navigate("/portal/forgot-password")}>Jelszó emlékeztető</Button>
        </Form>
      </Card>

      <Modal title="Bejelentkezés QR kóddal" open={qrModalOpen} onCancel={() => { stopPolling(); setQrModalOpen(false); }} footer={null} width={340} centered>
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          {qrStatus === "loading" && <Spin size="large" />}
          {qrStatus === "pending" && qrData && (<>
            <div style={{ display: "inline-block", padding: 12, background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, marginBottom: 16 }}>
              <QRCodeSVG value={qrData} size={200} />
            </div><br />
            <Text type="secondary" style={{ fontSize: 13 }}>Nyissa meg a linket telefonján a bejelentkezéshez.</Text>
          </>)}
          {qrStatus === "approved" && (<>
            <CheckCircleOutlined style={{ fontSize: 56, color: "#52c41a", marginBottom: 12 }} /><br />
            <Text type="secondary">Átirányítás folyamatban…</Text>
          </>)}
          {qrStatus === "expired" && (<>
            <CloseCircleOutlined style={{ fontSize: 56, color: "#ff4d4f", marginBottom: 12 }} /><br />
            <Text type="secondary">A QR kód lejárt.</Text><br />
            <Button type="primary" style={{ marginTop: 12 }} onClick={openQrModal}>Új QR kód kérése</Button>
          </>)}
        </div>
      </Modal>
    </div>
  );
};

export default ClientPortalLogin;
