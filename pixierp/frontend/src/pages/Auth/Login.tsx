import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Login = () => {
    const [loading, setLoading] = useState(false);
    const { login, register } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (values: any) => {
        setLoading(true);
        try {
            const result = await login(values);
            if (result.success) {
                navigate('/dashboard');
            }
        } catch (error) {
            message.error('Bejelentkezési hiba történt');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: any) => {
        setLoading(true);
        try {
            const result = await register(values);
            if (result.success) {
                navigate('/dashboard');
            }
        } catch (error) {
            message.error('Regisztrációs hiba történt');
        } finally {
            setLoading(false);
        }
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

                <Tabs
                    defaultActiveKey="login"
                    centered
                    items={[
                        {
                            key: 'login',
                            label: 'Bejelentkezés',
                            children: (
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

                                    <Button type="link" block onClick={() => navigate('/forgot-password')}>
                                        Jelszó emlékeztető
                                    </Button>
                                </Form>
                            )
                        },
                        {
                            key: 'register',
                            label: 'Regisztráció',
                            children: (
                                <Form
                                    name="register"
                                    onFinish={handleRegister}
                                    layout="vertical"
                                    size="large"
                                >
                                    <Form.Item
                                        name="email"
                                        rules={[
                                            { required: true, message: 'Kérjük, adja meg az email címet!' },
                                            { type: 'email', message: 'Kérjük, adjon meg egy érvényes email címet!' }
                                        ]}
                                    >
                                        <Input
                                            prefix={<MailOutlined />}
                                            placeholder="Email cím (ez lesz a felhasználónév)"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="first_name"
                                        rules={[
                                            { required: true, message: 'Kérjük, adja meg a keresztnevet!' }
                                        ]}
                                    >
                                        <Input
                                            prefix={<UserOutlined />}
                                            placeholder="Keresztnév"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="last_name"
                                        rules={[
                                            { required: true, message: 'Kérjük, adja meg a vezetéknevet!' }
                                        ]}
                                    >
                                        <Input
                                            prefix={<UserOutlined />}
                                            placeholder="Vezetéknév"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="password"
                                        rules={[
                                            { required: true, message: 'Kérjük, adja meg a jelszót!' },
                                            { min: 8, message: 'A jelszónak legalább 8 karakter hosszúnak kell lennie!' }
                                        ]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined />}
                                            placeholder="Jelszó"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="password_confirm"
                                        rules={[
                                            { required: true, message: 'Kérjük, erősítse meg a jelszót!' }
                                        ]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined />}
                                            placeholder="Jelszó megerősítése"
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
                                            Regisztráció
                                        </Button>
                                    </Form.Item>
                                </Form>
                            )
                        }
                    ]}
                />
            </Card>
        </div>
    );
};

export default Login;
