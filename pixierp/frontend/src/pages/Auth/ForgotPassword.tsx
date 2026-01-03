import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';

const { Title, Text } = Typography;

const ForgotPassword = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (values: { email: string }) => {
        setLoading(true);
        try {
            await authService.requestPasswordReset(values.email);
            message.success('Ha létezik ilyen felhasználó, elküldtük a jelszó-visszaállító linket e-mailben.');
            navigate('/login');
        } catch (error) {
            message.error('Hiba történt a kérés feldolgozása közben');
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
                    maxWidth: 420,
                    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
                    borderRadius: 12
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <Title level={3} style={{ marginBottom: 8 }}>
                        Jelszó emlékeztető
                    </Title>
                    <Text type="secondary">
                        Add meg az e-mail címed, és küldünk egy linket az új jelszó beállításához.
                    </Text>
                </div>

                <Form name="forgot_password" onFinish={handleSubmit} layout="vertical" size="large">
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg az e-mail címet!' },
                            { type: 'email', message: 'Kérjük, adjon meg egy érvényes e-mail címet!' }
                        ]}
                    >
                        <Input prefix={<MailOutlined />} placeholder="Email cím" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} block size="large">
                            Link küldése
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
