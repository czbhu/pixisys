import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const SSOLogin = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const performSSO = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setError('SSO token missing');
        setLoading(false);
        return;
      }

      try {
        // Call SSO login endpoint
        const response = await axios.post('/api/auth/sso-login/', {
          sso_token: token
        });

        const { user, tokens } = response.data;

        // Store tokens and user data
        localStorage.setItem('access_token', tokens.access);
        localStorage.setItem('refresh_token', tokens.refresh);
        localStorage.setItem('user', JSON.stringify(user));

        // Set axios default header
        axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.access}`;

        // Redirect to dashboard (auth context will update on next render)
        setTimeout(() => {
          navigate('/');
          window.location.reload(); // Force reload to update auth context
        }, 500);

      } catch (err) {
        console.error('SSO login error:', err);
        setError(err.response?.data?.error || 'SSO authentication failed');
        setLoading(false);
      }
    };

    performSSO();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column'
      }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
        <p style={{ marginTop: 16, fontSize: 16 }}>Bejelentkezés folyamatban...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <Result
          status="error"
          title="SSO bejelentkezés sikertelen"
          subTitle={error}
          extra={[
            <Button type="primary" key="login" onClick={() => navigate('/login')}>
              Vissza a bejelentkezéshez
            </Button>,
          ]}
        />
      </div>
    );
  }

  return null;
};

export default SSOLogin;
