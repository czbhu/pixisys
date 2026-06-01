import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Input, Card, Row, Col, Breadcrumb, Empty, Spin, Tag, Button, Tooltip, Popover,
} from 'antd';
import {
  FolderOpenOutlined, FolderOutlined, AppstoreOutlined, SearchOutlined,
  ArrowRightOutlined, HomeOutlined, LeftOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;

interface ProductClass {
  id: number;
  name: string;
  description?: string;
  image_url?: string | null;
  parent: number | null;
}

interface ProductTemplate {
  id: number;
  name: string;
  code?: string | null;
  description?: string;
  image_url?: string | null;
  category: number | null;
  category_name?: string;
  calculator_type?: string;
}

const CALC_LABELS: Record<string, string> = {
  generic: 'Általános',
  sheet_print: 'Íves/Táblás',
  roll_print: 'Tekercses',
  click_sheet_print: 'Klikkdíjas íves',
  screen_print: 'Szitanyomás',
  pad_print: 'Tamponnyomás',
};

const CALC_COLORS: Record<string, string> = {
  generic: 'default',
  sheet_print: 'purple',
  roll_print: 'geekblue',
  click_sheet_print: 'magenta',
  screen_print: 'green',
  pad_print: 'orange',
};

const PrintCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ProductClass[]>([]);
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [currentCatId, setCurrentCatId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/manufacturing/product-classes/?page_size=1000'),
      api.get('/manufacturing/product-templates/?page_size=1000&is_active=true'),
    ])
      .then(([catRes, prodRes]) => {
        const cats = catRes.data?.results ?? catRes.data;
        const prods = prodRes.data?.results ?? prodRes.data;
        setCategories(Array.isArray(cats) ? cats : []);
        setProducts(Array.isArray(prods) ? prods : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const catById = useMemo(() => {
    const m = new Map<number, ProductClass>();
    categories.forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  // Count of products (recursively) under a category, for showing counts on folder cards
  const childCatsByParent = useMemo(() => {
    const m = new Map<number | null, ProductClass[]>();
    categories.forEach(c => {
      const key = c.parent ?? null;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    });
    m.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, 'hu')));
    return m;
  }, [categories]);

  const productCount = useMemo(() => {
    // direct + descendant product counts per category id
    const direct = new Map<number | null, number>();
    products.forEach(p => {
      const key = p.category ?? null;
      direct.set(key, (direct.get(key) ?? 0) + 1);
    });
    const total = new Map<number, number>();
    const calc = (catId: number): number => {
      if (total.has(catId)) return total.get(catId)!;
      let sum = direct.get(catId) ?? 0;
      for (const child of (childCatsByParent.get(catId) ?? [])) {
        sum += calc(child.id);
      }
      total.set(catId, sum);
      return sum;
    };
    categories.forEach(c => calc(c.id));
    return total;
  }, [products, categories, childCatsByParent]);

  // Breadcrumb path from root to current
  const breadcrumbPath = useMemo(() => {
    const path: ProductClass[] = [];
    let cur = currentCatId != null ? catById.get(currentCatId) : undefined;
    while (cur) {
      path.unshift(cur);
      cur = cur.parent != null ? catById.get(cur.parent) : undefined;
    }
    return path;
  }, [currentCatId, catById]);

  const isSearching = search.trim().length > 0;

  // Search across all products
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = search.trim().toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.code ?? '').toLowerCase().includes(q) ||
      (p.category_name ?? '').toLowerCase().includes(q)
    );
  }, [isSearching, search, products]);

  const visibleSubcats = childCatsByParent.get(currentCatId) ?? [];
  const visibleProducts = useMemo(
    () => products.filter(p => (p.category ?? null) === currentCatId)
      .sort((a, b) => a.name.localeCompare(b.name, 'hu')),
    [products, currentCatId]
  );

  const openProduct = (productId: number) => {
    try {
      const s = localStorage.getItem('pixierp_editor_state');
      const stored = s ? JSON.parse(s) : {};
      stored.preload_product_id = productId;
      localStorage.setItem('pixierp_editor_state', JSON.stringify(stored));
    } catch {}
    navigate('/print-shop');
  };

  const renderProductCard = (p: ProductTemplate) => (
    <Col key={p.id} xs={24} sm={12} md={8} lg={6} xl={6}>
      <Card
        hoverable
        size="small"
        onClick={() => openProduct(p.id)}
        style={{ height: '100%' }}
        styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
      >
        <div style={{
          height: 96, borderRadius: 6, marginBottom: 10, overflow: 'hidden',
          background: 'linear-gradient(135deg, #f0f5ff 0%, #e6fffb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {p.image_url ? (
            <Popover
              content={
                <img src={p.image_url} alt={p.name}
                  style={{ maxWidth: 320, maxHeight: 320, objectFit: 'contain', display: 'block' }} />
              }
              trigger="hover"
              overlayInnerStyle={{ padding: 6 }}
            >
              <img src={p.image_url} alt={p.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
            </Popover>
          ) : (
            <AppstoreOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          )}
        </div>
        <Text strong style={{ fontSize: 14 }}>{p.name}</Text>
        {p.code && <Text type="secondary" style={{ fontSize: 11 }}>{p.code}</Text>}
        {p.description && (
          <Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 0' }} ellipsis={{ rows: 2 }}>
            {p.description}
          </Paragraph>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {p.calculator_type && (
            <Tag color={CALC_COLORS[p.calculator_type] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
              {CALC_LABELS[p.calculator_type] ?? p.calculator_type}
            </Tag>
          )}
          <Button type="primary" size="small" icon={<ArrowRightOutlined />}>Kalkulátor</Button>
        </div>
      </Card>
    </Col>
  );

  const renderCategoryCard = (c: ProductClass) => {
    const count = productCount.get(c.id) ?? 0;
    const subCount = (childCatsByParent.get(c.id) ?? []).length;
    return (
      <Col key={`cat-${c.id}`} xs={24} sm={12} md={8} lg={6} xl={6}>
        <Card
          hoverable
          size="small"
          onClick={() => setCurrentCatId(c.id)}
          style={{ height: '100%' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
              background: '#fffbe6', border: '1px solid #ffe58f',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {c.image_url ? (
                <Popover
                  content={
                    <img src={c.image_url} alt={c.name}
                      style={{ maxWidth: 320, maxHeight: 320, objectFit: 'contain', display: 'block' }} />
                  }
                  trigger="hover"
                  overlayInnerStyle={{ padding: 6 }}
                >
                  <img src={c.image_url} alt={c.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
                </Popover>
              ) : (
                <FolderOpenOutlined style={{ fontSize: 28, color: '#faad14' }} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 15, display: 'block' }}>{c.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {count} termék{subCount > 0 ? ` · ${subCount} alkategória` : ''}
              </Text>
            </div>
          </div>
          {c.description && (
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '8px 0 0' }} ellipsis={{ rows: 2 }}>
              {c.description}
            </Paragraph>
          )}
        </Card>
      </Col>
    );
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{
        height: 56, flexShrink: 0, background: '#fff',
        borderBottom: '1px solid #e8e8e8', display: 'flex',
        alignItems: 'center', padding: '0 20px', gap: 16,
      }}>
        <AppstoreOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <Title level={5} style={{ margin: 0 }}>Termékkatalógus</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Böngéssz kategóriák szerint</Text>
        <div style={{ flex: 1 }} />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Termék keresése…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Button onClick={() => navigate('/print-shop')}>Megnyitott megrendelés</Button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', marginTop: 80 }}><Spin size="large" /></div>
        ) : isSearching ? (
          <>
            <Title level={5} style={{ marginTop: 0 }}>
              Keresési találatok – „{search.trim()}" ({searchResults.length})
            </Title>
            {searchResults.length === 0 ? (
              <Empty description="Nincs találat" />
            ) : (
              <Row gutter={[16, 16]}>{searchResults.map(renderProductCard)}</Row>
            )}
          </>
        ) : (
          <>
            {/* Breadcrumb + back */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {currentCatId != null && (
                <Tooltip title="Vissza">
                  <Button
                    size="small"
                    icon={<LeftOutlined />}
                    onClick={() => setCurrentCatId(breadcrumbPath.length > 1 ? breadcrumbPath[breadcrumbPath.length - 2].id : null)}
                  />
                </Tooltip>
              )}
              <Breadcrumb
                items={[
                  {
                    title: (
                      <a onClick={() => setCurrentCatId(null)}>
                        <HomeOutlined /> Összes kategória
                      </a>
                    ),
                  },
                  ...breadcrumbPath.map(c => ({
                    title: <a onClick={() => setCurrentCatId(c.id)}>{c.name}</a>,
                  })),
                ]}
              />
            </div>

            {visibleSubcats.length === 0 && visibleProducts.length === 0 ? (
              <Empty description="Ebben a kategóriában nincs termék" />
            ) : (
              <>
                {visibleSubcats.length > 0 && (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      <FolderOutlined /> Kategóriák
                    </Text>
                    <Row gutter={[16, 16]} style={{ margin: '8px 0 24px' }}>
                      {visibleSubcats.map(renderCategoryCard)}
                    </Row>
                  </>
                )}
                {visibleProducts.length > 0 && (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      <AppstoreOutlined /> Termékek
                    </Text>
                    <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
                      {visibleProducts.map(renderProductCard)}
                    </Row>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PrintCatalogPage;
