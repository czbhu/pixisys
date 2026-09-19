import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AutoComplete, Button, Card, Divider, Form, Input, Modal, Radio, Spin, Tabs, Tag, Typography, message } from "antd";
import { BankOutlined, CheckCircleOutlined, CloseCircleOutlined, LockOutlined, MailOutlined, PhoneOutlined, QrcodeOutlined, SafetyCertificateOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
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
  const [searchOptions, setSearchOptions] = useState<{ value: string; label: React.ReactNode }[]>([]);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const [form] = Form.useForm();

  const isAdminMode = !!localStorage.getItem('access_token');

  useEffect(() => { const t = localStorage.getItem("portal_access_token"); if (t) navigate("/portal", { replace: true }); }, []);

  const handleAdminSearch = (val: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!val || val.length < 2) { setSearchOptions([]); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const results = await publicPortalService.searchPortalUsers(val);
        setSearchOptions(results.map(r => ({
          value: r.email,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{r.label}</span>
              {r.has_portal_user
                ? <Tag color="green" style={{ fontSize: 11 }}>portál</Tag>
                : <Tag color="orange" style={{ fontSize: 11 }}>CRM</Tag>}
            </div>
          ),
        })));
      } catch { setSearchOptions([]); }
    }, 250);
  };

  const handleLogin = async (values: any) => {
    setLoading(true);
    try {
      if (isAdminMode) {
        const res = await publicPortalService.adminLogin(values.email.trim().toLowerCase());
        localStorage.setItem("portal_access_token", res.token);
      } else {
        const res = await publicPortalService.login(values.email.trim().toLowerCase(), values.password);
        localStorage.setItem("portal_access_token", res.token);
      }
      navigate("/portal", { replace: true });
    } catch (err: any) {
      message.error(err?.response?.data?.error || (isAdminMode ? "Nem található portál felhasználó ezzel az e-mail címmel." : "Hibás e-mail vagy jelszó."));
    }
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
      <Card style={{ width: "100%", maxWidth: 440, boxShadow: "0 4px 24px rgba(0,0,0,.1)", borderRadius: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={2} style={{ color: "#1890ff", marginBottom: 4 }}>Kliens portál</Title>
        </div>
        <Tabs defaultActiveKey="login" centered items={[
          {
            key: "login", label: "Bejelentkezés",
            children: (
              <Form name="portal-login" form={form} onFinish={handleLogin} layout="vertical" size="large">
                {isAdminMode && (
                  <Alert
                    type="info"
                    showIcon
                    icon={<SafetyCertificateOutlined />}
                    message="Admin mód"
                    description="ERP adminként vagy bejelentkezve — jelszó nélkül beléphetsz bármely portál felhasználóként."
                    style={{ marginBottom: 16, borderRadius: 8 }}
                  />
                )}
                <Form.Item name="email" rules={[{ required: true, message: "Kérjük, adja meg az e-mail címet!" }, { type: "email", message: "Érvényes e-mail szükséges!" }]}>
                  {isAdminMode ? (
                    <AutoComplete
                      options={searchOptions}
                      onSearch={handleAdminSearch}
                      onSelect={(val: string) => form.setFieldValue('email', val)}
                      filterOption={false}
                    >
                      <Input prefix={<SearchOutlined />} placeholder="Keresés: név vagy e-mail cím..." />
                    </AutoComplete>
                  ) : (
                    <Input prefix={<MailOutlined />} placeholder="E-mail cím" type="email" />
                  )}
                </Form.Item>
                {!isAdminMode && (
                  <Form.Item name="password" rules={[{ required: true, message: "Kérjük, adja meg a jelszót!" }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Jelszó" />
                  </Form.Item>
                )}
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block size="large"
                    icon={isAdminMode ? <SafetyCertificateOutlined /> : undefined}>
                    {isAdminMode ? "Bejelentkezés adminként" : "Bejelentkezés"}
                  </Button>
                </Form.Item>
                {!isAdminMode && <>
                  <Button icon={<QrcodeOutlined />} block size="large" onClick={openQrModal} style={{ marginBottom: 8 }}>Bejelentkezés QR kóddal</Button>
                  <Button type="link" block onClick={() => navigate("/portal/forgot-password")}>Jelszó emlékeztető</Button>
                </>}
              </Form>
            ),
          },
          {
            key: "register", label: "Regisztráció", disabled: true,
            children: <RegistrationForm onSuccess={(token) => { localStorage.setItem("portal_access_token", token); navigate("/portal", { replace: true }); }} />,
          },
        ]} />
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
            <Text strong style={{ fontSize: 15 }}>Sikeres bejelentkezés!</Text><br />
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

const RegistrationForm: React.FC<{ onSuccess: (token: string) => void }> = ({ onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isCompany, setIsCompany] = useState(false);
  const [taxLookup, setTaxLookup] = useState<{ loading: boolean; data: any | null; error: string }>({ loading: false, data: null, error: "" });

  const lookupTax = async () => {
    const tax = (form.getFieldValue("tax_number") || "").replace(/\D/g, "").slice(0, 8);
    if (tax.length < 8) { message.warning("Az adószám első 8 számjegyét add meg!"); return; }
    setTaxLookup({ loading: true, data: null, error: "" });
    try {
      const res = await publicPortalService.lookupCompany(tax);
      if (res.success && res.data) {
        const d = res.data;
        const name = d.name || d.taxpayerName || d.company_name || "";
        const address = [d.city || d.telepules, d.address || d.utca].filter(Boolean).join(", ");
        form.setFieldsValue({ company_name: name, company_address: address });
        setTaxLookup({ loading: false, data: d, error: "" });
        message.success("Cég megtalálva: " + name);
      } else {
        setTaxLookup({ loading: false, data: null, error: res.error || "Nem található" });
      }
    } catch (err: any) {
      setTaxLookup({ loading: false, data: null, error: err?.response?.data?.error || "NAV lekérdezés sikertelen" });
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const res = await publicPortalService.register({
        email: values.email,
        full_name: values.full_name,
        password: values.password,
        phone: values.phone || "",
        is_company: isCompany,
        company_name: isCompany ? (values.company_name || "") : "",
        tax_number: isCompany ? (values.tax_number || "") : "",
        company_address: isCompany ? (values.company_address || "") : "",
      });
      message.success("Sikeres regisztráció!");
      onSuccess(res.token);
    } catch (err: any) {
      message.error(err?.response?.data?.error || "Regisztrációs hiba.");
    } finally { setLoading(false); }
  };

  return (
    <Form form={form} layout="vertical" size="large" onFinish={handleSubmit}>
      <Form.Item name="full_name" label="Teljes név" rules={[{ required: true, message: "Kötelező" }]}>
        <Input prefix={<UserOutlined />} placeholder="Teljes név" />
      </Form.Item>
      <Form.Item name="email" label="E-mail cím" rules={[{ required: true, type: "email", message: "Érvényes e-mail szükséges" }]}>
        <Input prefix={<MailOutlined />} placeholder="E-mail cím" />
      </Form.Item>
      <Form.Item name="phone" label="Telefonszám">
        <Input prefix={<PhoneOutlined />} placeholder="+36 ..." />
      </Form.Item>
      <Form.Item name="password" label="Jelszó" rules={[{ required: true, min: 6, message: "Legalább 6 karakter" }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="Jelszó (min. 6 karakter)" />
      </Form.Item>
      <Form.Item name="password2" label="Jelszó megerősítése" dependencies={["password"]}
        rules={[{ required: true, message: "Kötelező" }, ({ getFieldValue }) => ({ validator(_, v) { return !v || getFieldValue("password") === v ? Promise.resolve() : Promise.reject("A jelszavak nem egyeznek"); } })]}>
        <Input.Password prefix={<LockOutlined />} placeholder="Jelszó megerősítése" />
      </Form.Item>

      <Divider style={{ margin: "12px 0" }} />
      <Form.Item label="Ügyfél típusa">
        <Radio.Group value={isCompany ? "company" : "private"} onChange={e => setIsCompany(e.target.value === "company")} optionType="button" buttonStyle="solid">
          <Radio.Button value="private"><UserOutlined /> Magánszemély</Radio.Button>
          <Radio.Button value="company"><BankOutlined /> Cég</Radio.Button>
        </Radio.Group>
      </Form.Item>

      {isCompany && (<>
        <Form.Item label="Adószám (első 8 jegy)" name="tax_number" extra="Magyar cég esetén az adószám első 8 számjegye">
          <Input.Search
            placeholder="pl. 12345678"
            maxLength={11}
            enterButton={<><SearchOutlined /> NAV keresés</>}
            loading={taxLookup.loading}
            onSearch={lookupTax}
          />
        </Form.Item>
        {taxLookup.error && <Alert type="warning" message={taxLookup.error} showIcon style={{ marginBottom: 12 }} />}
        <Form.Item name="company_name" label="Cégnév" rules={[{ required: true, message: "Kötelező" }]}>
          <Input prefix={<BankOutlined />} placeholder="Cég neve" />
        </Form.Item>
        <Form.Item name="company_address" label="Cím">
          <Input placeholder="Cím" />
        </Form.Item>
      </>)}

      <Form.Item style={{ marginTop: 8 }}>
        <Button type="primary" htmlType="submit" loading={loading} block>Regisztráció</Button>
      </Form.Item>
    </Form>
  );
};

export default ClientPortalLogin;
