import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Login = () => {
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
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

                    <Button type="link" block onClick={() => navigate('/forgot-password')}>
                        Jelszó emlékeztető
                    </Button>
                </Form>
            </Card>
        </div>
    );
};

export default Login;
