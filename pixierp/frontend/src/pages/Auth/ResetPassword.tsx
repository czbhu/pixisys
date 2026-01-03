import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { authService } from '../../services/authService';

const { Title, Text } = Typography;

const ResetPassword = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { uid, token } = useParams();

    const handleSubmit = async (values: { new_password1: string; new_password2: string }) => {
        if (!uid || !token) {
            message.error('Érvénytelen vagy hiányos link');
            return;
        }

        setLoading(true);
        try {
            await authService.confirmPasswordReset({
                uid,
                token,
                new_password1: values.new_password1,
                new_password2: values.new_password2,
            });
            message.success('A jelszó sikeresen megváltozott. Jelentkezz be az új jelszóval.');
            navigate('/login');
        } catch (error: any) {
            const apiError = error?.response?.data;
            if (apiError?.details?.length) {
                message.error(apiError.details.join(' '));
            } else {
                message.error(apiError?.error || 'Hiba történt a jelszó módosítása közben');
            }
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
                        Új jelszó beállítása
                    </Title>
                    <Text type="secondary">
                        Add meg az új jelszót.
                    </Text>
                </div>

                <Form name="reset_password" onFinish={handleSubmit} layout="vertical" size="large">
                    <Form.Item
                        name="new_password1"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg az új jelszót!' },
                            { min: 8, message: 'A jelszónak legalább 8 karakter hosszúnak kell lennie!' }
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Új jelszó" />
                    </Form.Item>

                    <Form.Item
                        name="new_password2"
                        dependencies={['new_password1']}
                        rules={[
                            { required: true, message: 'Kérjük, erősítse meg az új jelszót!' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('new_password1') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('A két jelszó nem egyezik'));
                                }
                            })
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Új jelszó megerősítése" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} block size="large">
                            Jelszó mentése
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

export default ResetPassword;
