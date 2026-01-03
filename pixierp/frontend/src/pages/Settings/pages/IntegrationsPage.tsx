import React, { useState } from 'react';
import { Card, Button, Space, Alert, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';

const { Text } = Typography;

const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const syncPixinvoice = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post('/finance/sync/pixinvoice/');
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Szinkron hiba');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Integrációk">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>PIXINVOICE</Text>
          <div style={{ marginTop: 8 }}>
            <Button type="primary" loading={loading} onClick={syncPixinvoice}>
              Szinkronizálás most
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={() => navigate('/settings/pixinvoice')}>
              Beállítások megnyitása
            </Button>
          </div>
        </div>
        {error && <Alert type="error" message={error} />}
        {result && (
          <Alert
            type="success"
            message="Szinkron kész"
            description={
              <div>
                <div>Számlák: létrehozva {result.invoices?.created || 0}, frissítve {result.invoices?.updated || 0}</div>
                <div>Kifizetések: létrehozva {result.payments?.created || 0}, frissítve {result.payments?.updated || 0}</div>
              </div>
            }
            showIcon
          />
        )}
      </Space>
    </Card>
  );
};

export default IntegrationsPage;
