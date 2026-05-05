import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Card, Typography, message, Modal, Spin } from 'antd';
import { LockOutlined, MailOutlined, QrcodeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const { Title, Text } = Typography;

const QR_POLL_INTERVAL = 2000;

const Login = () => {
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // QR Login state
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [qrData, setQrData] = useState<string | null>(null);
    const [qrSessionId, setQrSessionId] = useState<string | null>(null);
    const [qrStatus, setQrStatus] = useState<'loading' | 'pending' | 'approved' | 'expired'>('loading');
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const handleLogin = async (values: any) => {
        setLoading(true);
        try {
            const result = await login(values);
            if (result.success) {
                const params = new URLSearchParams(window.location.search);
                const next = params.get('next');
                if (next) {
                    window.location.href = next;
                } else {
                    navigate('/dashboard');
                }
            }
        } catch (error) {
            message.error('Bejelentkezési hiba történt');
        } finally {
            setLoading(false);
        }
    };

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const openQrModal = async () => {
        setQrData(null);
        setQrSessionId(null);
        setQrStatus('loading');
        setQrModalOpen(true);
        try {
            const { data } = await api.post('/auth/qr-login/create/');
            setQrData(data.qr_data);
            setQrSessionId(data.session_id);
            setQrStatus('pending');
        } catch {
            setQrStatus('expired');
        }
    };

    // Start/stop polling based on modal + session state
    useEffect(() => {
        if (!qrModalOpen || !qrSessionId || qrStatus !== 'pending') {
            stopPolling();
            return;
        }
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await api.get(`/auth/qr-login/poll/?session_id=${qrSessionId}`);
                if (data.status === 'approved') {
                    stopPolling();
                    setQrStatus('approved');
                    // Store tokens exactly like AuthContext.login()
                    localStorage.setItem('access_token', data.tokens.access);
                    localStorage.setItem('refresh_token', data.tokens.refresh);
                    setTimeout(() => {
                        setQrModalOpen(false);
                        const params = new URLSearchParams(window.location.search);
                        const next = params.get('next');
                        window.location.href = next || '/dashboard';
                    }, 1200);
                } else if (data.status === 'expired') {
                    stopPolling();
                    setQrStatus('expired');
                }
            } catch {
                // network hibakor maradjon polling
            }
        }, QR_POLL_INTERVAL);
        return stopPolling;
    }, [qrModalOpen, qrSessionId, qrStatus]);

    const closeQrModal = () => {
        stopPolling();
        setQrModalOpen(false);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <Card
                style={{
                    width: '100%',
                    maxWidth: 400,
                    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
                    borderRadius: 12
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={2} style={{ color: '#1890ff', marginBottom: 8 }}>
                        PixiERP
                    </Title>
                    <Text type="secondary">
                        Enterprise Resource Planning
                    </Text>
                </div>

                <Form
                    name="login"
                    onFinish={handleLogin}
                    layout="vertical"
                    size="large"
                >
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg az email címet!' },
                            { type: 'email', message: 'Érvényes email címet adjon meg!' }
                        ]}
                    >
                        <Input
                            prefix={<MailOutlined />}
                            placeholder="Email cím"
                            type="email"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg a jelszót!' }
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Jelszó"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            size="large"
                        >
                            Bejelentkezés
                        </Button>
                    </Form.Item>

                    <Button
                        icon={<QrcodeOutlined />}
                        block
                        size="large"
                        onClick={openQrModal}
                        style={{ marginBottom: 8 }}
                    >
                        Bejelentkezés QR kóddal
                    </Button>

                    <Button type="link" block onClick={() => navigate('/forgot-password')}>
                        Jelszó emlékeztető
                    </Button>
                </Form>
            </Card>

            <Modal
                title="Bejelentkezés QR kóddal"
                open={qrModalOpen}
                onCancel={closeQrModal}
                footer={null}
                width={340}
                centered
            >
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    {qrStatus === 'loading' && (
                        <Spin size="large" />
                    )}

                    {qrStatus === 'pending' && qrData && (
                        <>
                            <div style={{
                                display: 'inline-block',
                                padding: 12,
                                background: '#fff',
                                border: '1px solid #f0f0f0',
                                borderRadius: 8,
                                marginBottom: 16,
                            }}>
                                <QRCodeSVG value={qrData} size={200} />
                            </div>
                            <br />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                Nyissa meg az ERP QR kód olvasóját egy bejelentkezett eszközön,
                                és olvassa be ezt a kódot.
                            </Text>
                        </>
                    )}

                    {qrStatus === 'approved' && (
                        <>
                            <CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a', marginBottom: 12 }} />
                            <br />
                            <Text strong style={{ fontSize: 15 }}>Sikeres bejelentkezés!</Text>
                            <br />
                            <Text type="secondary">Átirányítás folyamatban…</Text>
                        </>
                    )}

                    {qrStatus === 'expired' && (
                        <>
                            <CloseCircleOutlined style={{ fontSize: 56, color: '#ff4d4f', marginBottom: 12 }} />
                            <br />
                            <Text type="secondary">A QR kód lejárt.</Text>
                            <br />
                            <Button type="primary" style={{ marginTop: 12 }} onClick={openQrModal}>
                                Új QR kód kérése
                            </Button>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Login;
