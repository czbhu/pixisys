import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Card, Carousel, Col, Row, Space, Spin, Tag, Typography } from 'antd';
import { publicPortalService } from '../../services/publicPortalService';
import './SiteManagementPreview.css';

const { Title, Paragraph, Text } = Typography;

const stockImages = [
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1800&q=80',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1800&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1800&q=80',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=80',
];

const SiteManagementPreview: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const key = decodeURIComponent(slug || '').trim();
        const resolved = await publicPortalService.resolveSite(undefined, key);
        setSite(resolved?.site || null);
      } catch {
        setSite(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [slug]);

  const heroTitle = useMemo(() => {
    if (!site) return 'Oldal előnézet';
    return site.hero_title || site.site_title || site.name || 'Oldal előnézet';
  }, [site]);

  return (
    <div className="site-preview-page">
      <div className="site-preview-container">
        <Space className="site-preview-topbar">
          {site?.slug ? <Tag color="blue">/{site.slug}</Tag> : null}
          {site?.site_type ? <Tag>{site.site_type}</Tag> : null}
        </Space>

        {loading ? (
          <div className="site-preview-loading">
            <Spin size="large" />
          </div>
        ) : !site ? (
          <Alert type="warning" showIcon message="Az oldal nem található" description="Ellenőrizd a slug értékét a menedzsment listában." />
        ) : (
          <Space direction="vertical" size="large" className="site-preview-stack">
            <Card bodyStyle={{ padding: 0, overflow: 'hidden' }} className="site-preview-card">
              <Carousel autoplay dots className="site-preview-carousel">
                {stockImages.map((imageUrl, index) => (
                  <div key={`${imageUrl}-${index}`}>
                    <div
                      className="site-preview-hero-slide"
                      style={{ backgroundImage: `url(${imageUrl})` }}
                    >
                      <div className="site-preview-hero-content">
                        <Title className="site-preview-hero-title">{heroTitle}</Title>
                        <Paragraph className="site-preview-hero-subtitle">
                          {site.hero_subtitle || 'Modern, konverzióközpontú sales/marketing oldal előnézet stock fotókkal és sliderrel.'}
                        </Paragraph>
                        <Space wrap>
                          <Button type="primary" size="large">Kapcsolatfelvétel</Button>
                          {site.portal_enabled ? <Button size="large">Kliens portál belépés</Button> : null}
                          {site.calculators_enabled ? <Tag color="processing">Kalkulátorok aktívak</Tag> : <Tag>Kalkulátorok inaktívak</Tag>}
                        </Space>
                      </div>
                    </div>
                  </div>
                ))}
              </Carousel>
            </Card>

            <Row gutter={[16, 16]} className="site-preview-info-grid">
              <Col xs={24} lg={8}>
                <Card title="Domainek" className="site-preview-info-card">
                  <Space wrap>
                    {(site.domains || []).length ? (site.domains || []).map((domain: string) => <Tag key={domain}>{domain}</Tag>) : <Text>Nincs domain rendelve</Text>}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card title="Termékkategóriák" className="site-preview-info-card">
                  <Space wrap>
                    {(site.product_class_names || []).length ? (site.product_class_names || []).map((item: string) => <Tag color="purple" key={item}>{item}</Tag>) : <Text>Nincs hozzárendelve</Text>}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card title="Funkciók" className="site-preview-info-card">
                  <Space wrap>
                    {(site.feature_names || []).length ? (site.feature_names || []).map((item: string) => <Tag color="geekblue" key={item}>{item}</Tag>) : <Text>Nincs hozzárendelve</Text>}
                  </Space>
                </Card>
              </Col>
            </Row>

            <Card title="Kalkulátorok kiemelve" className="site-preview-calculators-card">
              {(site.calculator_names || []).length ? (
                <Row gutter={[16, 16]}>
                  {(site.calculator_names || []).map((name: string, index: number) => (
                    <Col xs={24} md={12} lg={8} key={`${name}-${index}`}>
                      <Card hoverable className="site-preview-calculator-item">
                        <Title level={5} style={{ marginBottom: 8 }}>{name}</Title>
                        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                          Konverzió-orientált előnézeti blokk. Itt jelenik meg a kiválasztott kalkulátor bemutatója.
                        </Paragraph>
                        <Button type="link" style={{ paddingLeft: 0 }}>Kalkulátor megnyitása</Button>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Alert type="info" showIcon message="Ehhez az oldalhoz még nincs kalkulátor hozzárendelve." />
              )}
            </Card>
          </Space>
        )}
      </div>
    </div>
  );
};

export default SiteManagementPreview;
