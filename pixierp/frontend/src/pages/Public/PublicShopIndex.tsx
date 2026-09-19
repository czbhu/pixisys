import React, { useEffect, useState } from 'react';
import { Typography, Spin, Empty } from 'antd';
import { ShoppingOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Paragraph } = Typography;

interface ShopCategory {
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
  product_count: number;
}

const PublicShopIndex: React.FC = () => {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/v1/warehouse/public-shop/')
      .then(r => setCategories(r.data?.categories || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#1677ff', color: '#fff', padding: '40px 24px 32px', textAlign: 'center' }}>
        <Title level={2} style={{ color: '#fff', margin: 0 }}>Termékkatalógus</Title>
        <div style={{ marginTop: 12, fontSize: 16, opacity: 0.9 }}>Válassz egy kategóriát</div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : categories.length === 0 ? (
          <Empty description="Jelenleg nincs elérhető kategória." style={{ marginTop: 60 }} />
        ) : (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {categories.map(c => (
              <a
                key={c.slug}
                href={`/shop/${c.slug}`}
                style={{
                  width: 260, textDecoration: 'none', color: 'inherit', cursor: 'pointer',
                  background: '#fff', borderRadius: 14, overflow: 'hidden',
                  border: '1px solid #e8e8e8', boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                  transition: 'box-shadow .15s, transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.06)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{
                  height: 160, background: 'linear-gradient(135deg,#f0f5ff,#e6fffb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.title} loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} />
                  ) : (
                    <ShoppingOutlined style={{ fontSize: 48, color: '#bbb' }} />
                  )}
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <Title level={4} style={{ margin: 0 }}>{c.title}</Title>
                  {c.description && (
                    <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ fontSize: 13, margin: '6px 0 0' }}>
                      {c.description.replace(/<[^>]+>/g, '')}
                    </Paragraph>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>{c.product_count} termék</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12, borderTop: '1px solid #e8e8e8', background: '#fff' }}>
        Powered by PixiERP
      </div>
    </div>
  );
};

export default PublicShopIndex;
