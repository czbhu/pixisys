import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { confirmPasswordReset } from '../services/authService';

const { Title, Text } = Typography;

const ResetPassword = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { uid, token } = useParams();

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const result = await confirmPasswordReset(
                uid,
                token,
                values.password,
                values.confirm_password
            );
            message.success(result.message || 'Jelszó sikeresen megváltozott!');
            setTimeout(() => navigate('/login'), 2000);
        } catch (error) {
            message.error(
                error.response?.data?.error || 'Hiba történt. A link lehet, hogy lejárt.'
            );
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
                        Új jelszó beállítása
                    </Title>
                    <Text type="secondary">
                        Add meg az új jelszavadat
                    </Text>
                </div>

                <Form
                    name="reset-password"
                    onFinish={handleSubmit}
                    layout="vertical"
                    size="large"
                >
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Kérjük, adja meg az új jelszót!' },
                            { min: 8, message: 'A jelszónak legalább 8 karakter hosszúnak kell lennie!' }
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Új jelszó"
                        />
                    </Form.Item>

                    <Form.Item
                        name="confirm_password"
                        dependencies={['password']}
                        rules={[
                            { required: true, message: 'Erősítse meg a jelszót!' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('password') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('A két jelszó nem egyezik!'));
                                },
                            }),
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
                            Jelszó beállítása
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default ResetPassword;
