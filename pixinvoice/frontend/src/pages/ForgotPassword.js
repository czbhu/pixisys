import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { requestPasswordReset } from '../services/authService';

const { Title, Text } = Typography;

const ForgotPassword = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const result = await requestPasswordReset(values.email);
            message.success(result.message || 'Jelszó-visszaállító e-mailt küldtünk!');
            setTimeout(() => navigate('/login'), 2000);
        } catch (error) {
            message.error('Hiba történt. Próbálja újra később.');
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
                        Jelszó emlékeztető
                    </Title>
                    <Text type="secondary">
                        Add meg az e-mail címed, és küldünk egy jelszó-visszaállító linket.
                    </Text>
                </div>

                <Form
                    name="forgot-password"
                    onFinish={handleSubmit}
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

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            size="large"
                        >
                            Jelszó visszaállítás
                        </Button>
                    </Form.Item>

                    <Button type="link" block onClick={() => navigate('/login')}>
                        Vissza a bejelentkezéshez
                    </Button>
                </Form>
            </Card>
        </div>
    );
};

export default ForgotPassword;
