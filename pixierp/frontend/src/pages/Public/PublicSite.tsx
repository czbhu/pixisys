import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, Button, Form, Input, Space, message, Alert, Tag } from 'antd';
import { publicPortalService } from '../../services/publicPortalService';
import api from '../../services/api';

const { Title, Paragraph } = Typography;

interface PublicSiteProps {
  previewSlug?: string;
}

const PublicSite: React.FC<PublicSiteProps> = ({ previewSlug }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [site, setSite] = useState<any>(null);
  const [portalUser, setPortalUser] = useState<any>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      if (previewSlug) {
        const siteResponse = await api.get('/sales-sites/');
        const siteData = siteResponse.data?.results || siteResponse.data || [];
        const matchedSite = (Array.isArray(siteData) ? siteData : []).find((item: any) => item.slug === previewSlug) || null;

        if (matchedSite) {
          setSite(matchedSite);
          setConfig({
            site_title: matchedSite?.site_title || matchedSite?.name,
            hero_title: matchedSite?.hero_title || matchedSite?.site_title || matchedSite?.name,
            hero_subtitle: matchedSite?.hero_subtitle || '',
            calculators_enabled: !!matchedSite?.calculators_enabled,
            portal_enabled: !!matchedSite?.portal_enabled,
          });
        } else {
          message.warning('A kiválasztott oldal nem található');
          setSite(null);
        }
      } else {
      const resolved = await publicPortalService.resolveSite(window.location.host);
      const resolvedSite = resolved?.site || null;
      setSite(resolvedSite);

      if (resolved?.mode === 'sales_site') {
        setConfig({
          site_title: resolvedSite?.site_title || resolvedSite?.name,
          hero_title: resolvedSite?.hero_title || resolvedSite?.site_title || resolvedSite?.name,
          hero_subtitle: resolvedSite?.hero_subtitle || '',
          calculators_enabled: !!resolvedSite?.calculators_enabled,
          portal_enabled: !!resolvedSite?.portal_enabled,
        });
      } else {
        const cfg = await publicPortalService.getConfig();
        setConfig(cfg || {});
      }
      }

      const token = localStorage.getItem('portal_access_token');
      if (token) {
        try {
          const me = await publicPortalService.me();
          setPortalUser(me?.user || null);
        } catch {
          localStorage.removeItem('portal_access_token');
          setPortalUser(null);
        }
      } else {
        setPortalUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [previewSlug]);

  const handleLogin = async () => {
    try {
      const values = await form.validateFields();
      setLoginLoading(true);
      const res = await publicPortalService.login(values.email, values.password);
      localStorage.setItem('portal_access_token', res.token);
      message.success('Sikeres belépés');
      navigate('/portal');
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || 'Sikertelen belépés');
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    try {
      await publicPortalService.logout();
    } catch {
      // no-op
    }
    localStorage.removeItem('portal_access_token');
    setPortalUser(null);
    message.success('Kijelentkezve');
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <Card loading={loading}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={2} style={{ marginBottom: 0 }}>{config?.hero_title || 'Pixi Publikus Oldal'}</Title>
          <Paragraph style={{ marginBottom: 0 }}>{config?.hero_subtitle || 'Marketing és értékesítési bemutatkozó oldal, beépített kliens portállal.'}</Paragraph>

          <Space wrap>
            {config?.primary_cta_url ? (
              <Button type="primary" href={config.primary_cta_url} target="_blank">
                {config?.primary_cta_text || 'Kapcsolat'}
              </Button>
            ) : null}
            <Button onClick={() => navigate('/portal')}>Kliens portál</Button>
            {config?.calculators_enabled ? <Tag color="blue">Publikus kalkulátorok aktívak</Tag> : <Tag>Kalkulátorok inaktívak</Tag>}
            {site?.domains?.length ? <Tag color="purple">Domain: {site.domains[0]}</Tag> : null}
          </Space>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="Marketing / Sales tartalom">
            <Paragraph>
              Itt lehetnek termék/szolgáltatás blokkok, referenciák, FAQ és lead gyűjtő űrlapok.
            </Paragraph>
            <Paragraph>
              A publikus kalkulátorok szintén ide kerülhetnek (pl. anyagkalkulátor, szolgáltatás kalkulátor).
            </Paragraph>

            {site ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <strong>Termékkategóriák:</strong>{' '}
                  {(site.product_class_names || []).length ? (site.product_class_names || []).join(', ') : 'Nincs hozzárendelve'}
                </div>
                <div>
                  <strong>Kalkulátorok:</strong>{' '}
                  {(site.calculator_names || []).length ? (site.calculator_names || []).join(', ') : 'Nincs hozzárendelve'}
                </div>
                <div>
                  <strong>Funkciók:</strong>{' '}
                  {(site.feature_names || []).length ? (site.feature_names || []).join(', ') : 'Nincs hozzárendelve'}
                </div>
              </Space>
            ) : null}

            {portalUser ? (
              <Alert
                type="success"
                showIcon
                message={`Belépve: ${portalUser.full_name || portalUser.email}`}
                description="Belépett ügyfélként a publikus oldalon személyre szabott gombok és funkciók jelennek meg."
                action={<Button size="small" onClick={() => navigate('/portal')}>Portál megnyitása</Button>}
              />
            ) : (
              <Alert type="info" showIcon message="Belépés nélkül publikus tartalmat látsz." />
            )}
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card title="Kliens portál belépés">
            {portalUser ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert type="success" showIcon message={`Bejelentkezve: ${portalUser.email}`} />
                <Button type="primary" onClick={() => navigate('/portal')}>Portál megnyitása</Button>
                <Button onClick={logout}>Kijelentkezés</Button>
              </Space>
            ) : (
              <Form form={form} layout="vertical" onFinish={handleLogin}>
                <Form.Item name="email" label="E-mail" rules={[{ required: true, type: 'email', message: 'Érvényes e-mail kötelező' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="password" label="Jelszó" rules={[{ required: true, message: 'Jelszó kötelező' }]}>
                  <Input.Password />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loginLoading} block>
                  Belépés a portálra
                </Button>
              </Form>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default PublicSite;
