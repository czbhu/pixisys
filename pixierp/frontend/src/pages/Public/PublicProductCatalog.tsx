import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Col, Row, Typography, Spin, Empty, Pagination, Select, Input, Tooltip, Button, Drawer, Tag, Divider, InputNumber } from 'antd';
import { ShoppingOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined, TagOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import axios from 'axios';
import { PublicCartProvider, usePublicCart } from '../../contexts/PublicCartContext';
import { CartButton } from '../../components/PublicCart';

const { Title, Text, Paragraph } = Typography;

interface Product {
  id: number; name: string; code: string; description: string;
  unit: string; unit_selling_price: number | null; currency: string;
  material_format: string; image_url: string | null;
  material_group_names: string[];
  external_stock: number;
}
interface Subcat { id: number; name: string; image_url?: string | null; }
interface CatalogData {
  id: number; name: string; title: string; description: string;
  show_prices: boolean; slug: string;
  total: number; page: number; page_size: number;
  subcategories: Subcat[];
  products: Product[];
}

const STORAGE_VIEW_KEY = 'pixierp_catalog_view';

// ── Product detail drawer ─────────────────────────────────────────────────────

interface Variant {
  sku: string; color: string; color_hex: string; size: string;
  stock_quantity: number; stock_supplier: number;
  price: number | null; currency: string;
}

const ProductDetailDrawer: React.FC<{
  product: Product | null;
  slug: string;
  showPrices: boolean;
  onClose: () => void;
}> = ({ product: p, slug, showPrices, onClose }) => {
  const { add: addToCart, items: cartItems, setQty } = usePublicCart();
  const [qty, setLocalQty] = React.useState(1);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [internalStock, setInternalStock] = React.useState(0);
  const [selectedColor, setSelectedColor] = React.useState<string | null>(null);
  const [selectedSize, setSelectedSize] = React.useState<string | null>(null);

  React.useEffect(() => {
    setVariants([]); setSelectedColor(null); setSelectedSize(null); setInternalStock(0);
    if (!p) return;
    axios.get(`/api/v1/warehouse/public-catalog/${slug}/variants/${p.id}/`)
      .then(r => {
        const v: Variant[] = r.data?.variants || r.data || [];
        const intStock: number = r.data?.internal_stock ?? 0;
        setVariants(v);
        setInternalStock(intStock);
        if (v.length > 0) {
          setSelectedColor(v[0].color || null);
          setSelectedSize(v[0].size || null);
        }
      })
      .catch(() => {});
  }, [p?.id, slug]);

  const colors = Array.from(new Set(variants.map(v => v.color).filter(Boolean)));
  const sizesForColor = Array.from(new Set(
    variants.filter(v => !selectedColor || v.color === selectedColor).map(v => v.size).filter(Boolean)
  ));
  const selectedVariant = variants.find(v =>
    (!selectedColor || v.color === selectedColor) &&
    (!selectedSize || v.size === selectedSize)
  ) ?? null;

  // Variant-specific cart key: ensures each color/size combination is a separate cart slot
  const cartId = selectedVariant?.sku ? `${p?.id}-${selectedVariant.sku}` : (p?.id ?? null);
  const cartItem = cartId != null ? cartItems.find(i => i.id === cartId) : undefined;

  React.useEffect(() => {
    setLocalQty(cartItem?.quantity ?? 1);
  }, [cartItem]);  // re-syncs when variant selection changes

  const handleAdd = () => {
    if (!p || cartId == null) return;
    const price = selectedVariant?.price ?? p.unit_selling_price;
    const sku = selectedVariant?.sku;
    const suffix = [selectedColor, selectedSize].filter(Boolean).join(' / ');
    const name = suffix ? `${p.name} \u2013 ${suffix}` : p.name;
    if (cartItem) {
      setQty(cartId, qty);
    } else {
      addToCart({ id: cartId, product_id: p!.id, code: sku || p.code, name, image_url: p.image_url, unit: p.unit, unit_selling_price: price, currency: p.currency });
      setQty(cartId, qty);
    }
  };

  return (
  <Drawer
    open={!!p}
    onClose={onClose}
    width={Math.min(520, window.innerWidth)}
    title={p?.name}
    styles={{ body: { padding: '16px 20px' } }}
  >
    {p && (
      <>
        {p.image_url && (
          <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', background: '#f8f8f8' }}>
            <img
              src={p.image_url} alt={p.name} loading="lazy"
              style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block', padding: 16 }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            {p.code && <Text type="secondary" style={{ fontSize: 12 }}>Cikkszám: <Text code>{p.code}</Text></Text>}
          </div>
          {showPrices && p.unit_selling_price != null && (
            <Text strong style={{ fontSize: 22, color: '#1677ff' }}>
              {fmt(p.unit_selling_price, p.currency)} / {p.unit}
            </Text>
          )}
        </div>

        {/* Color picker */}
        {colors.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Szín</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {colors.map(c => (
                <button key={c} onClick={() => { setSelectedColor(c); setSelectedSize(null); }}
                  style={{
                    padding: '5px 14px', borderRadius: 16, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    border: `2px solid ${selectedColor === c ? '#1677ff' : '#d9d9d9'}`,
                    background: selectedColor === c ? '#e6f4ff' : '#fff',
                    color: selectedColor === c ? '#1677ff' : '#555',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Size picker */}
        {sizesForColor.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Méret</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sizesForColor.map(s => (
                <button key={s} onClick={() => setSelectedSize(s)}
                  style={{
                    minWidth: 48, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `2px solid ${selectedSize === s ? '#1677ff' : '#d9d9d9'}`,
                    background: selectedSize === s ? '#e6f4ff' : '#fff',
                    color: selectedSize === s ? '#1677ff' : '#555',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stock info for selected variant */}
        {selectedVariant ? (
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>SKU: <Text code style={{ fontSize: 11 }}>{selectedVariant.sku}</Text></Text>
            {internalStock > 0 && (
              <Tag color="green">✓ {Math.round(internalStock).toLocaleString('hu-HU')} db raktáron</Tag>
            )}
            {selectedVariant.stock_quantity > 0 ? (
              <Tag color={internalStock > 0 ? 'cyan' : 'green'}>
                {internalStock > 0 ? '' : '✓ '}{selectedVariant.stock_quantity.toLocaleString('hu-HU')} db külső raktáron
              </Tag>
            ) : internalStock === 0 ? (
              <Tag color="error">Nincs raktáron</Tag>
            ) : null}
          </div>
        ) : p.external_stock > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <Tag color="green" icon={<span style={{ marginRight: 4 }}>🏭</span>}>
              Külső raktár: {p.external_stock.toLocaleString('hu-HU')} db
            </Tag>
          </div>
        ) : null}

        {/* Cart controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, padding: '12px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
          <InputNumber
            min={1} max={9999} value={qty}
            onChange={v => setLocalQty(v ?? 1)}
            addonBefore="Menny." addonAfter={p.unit}
            style={{ flex: 1 }}
          />
          <Button
            type="primary" size="large" icon={<ShoppingCartOutlined />}
            onClick={handleAdd}
            style={{ minWidth: 140 }}
          >
            {cartItem ? 'Kosár frissítése' : 'Kosárba'}
          </Button>
        </div>

        {p.material_group_names.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {p.material_group_names.map(n => (
              <Tag key={n} icon={<TagOutlined />} color="blue" style={{ marginBottom: 4 }}>{n}</Tag>
            ))}
          </div>
        )}

        {p.description && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#333' }}
              dangerouslySetInnerHTML={{ __html: p.description.replace(/\n/g, '<br/>') }}
            />
          </>
        )}
      </>
    )}
  </Drawer>
  );
};

const fmt = (n: number | null, currency: string) =>
  n != null ? `${Math.round(n).toLocaleString('hu-HU')} ${currency || 'Ft'}` : '';

const ProductImage: React.FC<{ url: string | null; name: string; style?: React.CSSProperties }> = ({ url, name, style }) => {
  const [errored, setErrored] = useState(false);
  const containerStyle: React.CSSProperties = { height: 180, background: 'linear-gradient(135deg,#f0f5ff,#e6fffb)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style };
  if (!url || errored) return (
    <div style={containerStyle}>
      <ShoppingOutlined style={{ fontSize: style?.height ? 28 : 48, color: '#1677ff' }} />
    </div>
  );
  return (
    <img
      src={url} alt={name} loading="lazy"
      onError={() => setErrored(true)}
      style={{ width: '100%', height: style?.height ?? 180, objectFit: 'contain', background: '#fafafa', display: 'block', borderRadius: style?.borderRadius, ...style }}
    />
  );
};

const PublicProductCatalog: React.FC = () => {
  return (
    <PublicCartProvider>
      <CatalogInner />
    </PublicCartProvider>
  );
};

const CatalogInner: React.FC = () => {
  const location = useLocation();
  const slug = location.pathname.replace(/^\/shop\/?/, '').split('/')[0];
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [catId, setCatId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try { return (localStorage.getItem(STORAGE_VIEW_KEY) as 'list' | 'grid') || 'list'; } catch { return 'list'; }
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { add: addToCart, items: cartItems } = usePublicCart();

  // Check if ANY variant of this product is in the cart
  const inCart = (id: number) => cartItems.some(i =>
    i.id === id || (typeof i.id === 'string' && i.id.startsWith(`${id}-`))
  );

  const handleAddToCart = (e: React.MouseEvent, p: Product) => {
    e.stopPropagation();
    // Quick-add from card uses base product id (no variant selected)
    if (!cartItems.some(i => i.id === p.id)) {
      addToCart({ id: p.id, product_id: p.id, code: p.code, name: p.name, image_url: p.image_url, unit: p.unit, unit_selling_price: p.unit_selling_price, currency: p.currency });
    }
  };
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 48;

  const load = useCallback((p: number, cat: number | null, q: string, ord?: string) => {
    if (!slug) return;
    setLoading(true);
    const params: any = { page: p, page_size: PAGE_SIZE, ordering: ord ?? ordering };
    if (cat) params.cat = cat;
    if (q.trim()) params.search = q.trim();
    axios.get(`/api/v1/warehouse/public-catalog/${slug}/`, { params })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { setError('Az oldal nem található.'); setLoading(false); });
  }, [slug, ordering]); // eslint-disable-line

  useEffect(() => { load(1, null, ''); }, [load]);

  const handleCatChange = (val: number | null) => {
    setCatId(val);
    setPage(1);
    load(1, val, search);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      load(1, catId, val);
    }, 350);
  };

  const handleOrderingChange = (val: string) => {
    setOrdering(val);
    setPage(1);
    load(1, catId, search, val);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p, catId, search);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleView = (v: 'list' | 'grid') => {
    setViewMode(v);
    try { localStorage.setItem(STORAGE_VIEW_KEY, v); } catch {}
  };

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Empty description={error} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ background: '#1677ff', color: '#fff', padding: '40px 24px 32px', textAlign: 'center' }}>
        <Title level={2} style={{ color: '#fff', margin: 0 }}>
          {data?.title || slug}
        </Title>
        {data?.description && (
          <div style={{ marginTop: 12, fontSize: 16, opacity: 0.9, maxWidth: 700, margin: '12px auto 0' }}
            dangerouslySetInnerHTML={{ __html: data.description }} />
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* Subcategory image boxes */}
        {(data?.subcategories?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {/* "Összes" box */}
            <button
              onClick={() => handleCatChange(null)}
              style={{
                width: 110, cursor: 'pointer', border: 'none', borderRadius: 10,
                padding: 0, background: 'transparent', textAlign: 'center',
              }}
            >
              <div style={{
                height: 80, borderRadius: 10, marginBottom: 6, overflow: 'hidden',
                background: 'linear-gradient(135deg,#f0f5ff,#e6fffb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${catId == null ? '#1677ff' : '#e8e8e8'}`,
                boxShadow: catId == null ? '0 0 0 2px #1677ff33' : 'none',
              }}>
                <AppstoreOutlined style={{ fontSize: 32, color: catId == null ? '#1677ff' : '#aaa' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: catId == null ? 700 : 500, color: catId == null ? '#1677ff' : '#555', lineHeight: 1.3, display: 'block' }}>
                Összes
              </span>
            </button>

            {data!.subcategories.map(s => {
              const active = catId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleCatChange(active ? null : s.id)}
                  style={{
                    width: 110, cursor: 'pointer', border: 'none', borderRadius: 10,
                    padding: 0, background: 'transparent', textAlign: 'center',
                  }}
                >
                  <div style={{
                    height: 80, borderRadius: 10, marginBottom: 6, overflow: 'hidden',
                    background: 'linear-gradient(135deg,#f0f5ff,#e6fffb)',
                    border: `2px solid ${active ? '#1677ff' : '#e8e8e8'}`,
                    boxShadow: active ? '0 0 0 2px #1677ff33' : 'none',
                    position: 'relative',
                  }}>
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.name} loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <ShoppingOutlined style={{ fontSize: 28, color: '#bbb' }} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#1677ff' : '#555', lineHeight: 1.3, display: 'block' }}>
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search + sort bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Keresés termékek között…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            allowClear
            style={{ flex: '1 1 240px', maxWidth: 380 }}
            size="large"
          />
          <Select
            value={ordering}
            onChange={handleOrderingChange}
            style={{ width: 180 }}
            size="large"
            options={[
              { value: 'name',                label: 'Név A → Z' },
              { value: '-name',               label: 'Név Z → A' },
              { value: 'unit_selling_price',  label: 'Ár ↑ (olcsóbb)' },
              { value: '-unit_selling_price', label: 'Ár ↓ (drágább)' },
            ]}
          />
          {data && (
            <span style={{ color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>
              {loading ? 'Keresés…' : `${data.total} termék`}
            </span>
          )}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
            <CartButton slug={slug} onProductOpen={id => {
              const found = data?.products.find(p => p.id === id);
              if (found) {
                setSelectedProduct(found);
              } else {
                // Product not on current page — fetch it directly
                axios.get(`/api/v1/warehouse/public-catalog/${slug}/`, { params: { id } })
                  .then(r => { if (r.data?.product) setSelectedProduct(r.data.product); })
                  .catch(() => {});
              }
            }} />
            <Tooltip title="Lista nézet">
              <Button
                type={viewMode === 'list' ? 'primary' : 'default'}
                icon={<UnorderedListOutlined />}
                onClick={() => toggleView('list')}
              />
            </Tooltip>
            <Tooltip title="Rácsos nézet">
              <Button
                type={viewMode === 'grid' ? 'primary' : 'default'}
                icon={<AppstoreOutlined />}
                onClick={() => toggleView('grid')}
              />
            </Tooltip>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : !data || data.products.length === 0 ? (
          <Empty description="Ebben a kategóriában nincs termék." style={{ marginTop: 60 }} />
        ) : (
          <>
            {viewMode === 'grid' ? (
              <Row gutter={[16, 16]}>
                {data.products.map(p => (
                  <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      hoverable
                      cover={<ProductImage url={p.image_url} name={p.name} />}
                      styles={{ body: { padding: '10px 12px' } }}
                      onClick={() => setSelectedProduct(p)}
                    >
                      <Text strong style={{ fontSize: 13, display: 'block' }}>{p.name}</Text>
                      {p.code && <Text type="secondary" style={{ fontSize: 11 }}>{p.code}</Text>}
                      {p.description && (
                        <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
                          {p.description}
                        </Paragraph>
                      )}
                      {data.show_prices && p.unit_selling_price != null && (
                        <Text strong style={{ color: '#1677ff', fontSize: 14, display: 'block', marginTop: 6 }}>
                          {fmt(p.unit_selling_price, p.currency)} / {p.unit}
                        </Text>
                      )}
                      {p.external_stock > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <Tag color="green" style={{ fontSize: 10, margin: 0 }}>Külső raktár: {p.external_stock.toLocaleString('hu-HU')} db</Tag>
                        </div>
                      )}
                      <Button
                        type={inCart(p.id) ? 'default' : 'primary'}
                        size="small" block icon={<ShoppingCartOutlined />}
                        style={{ marginTop: 8 }}
                        onClick={e => handleAddToCart(e, p)}
                      >
                        {inCart(p.id) ? 'Kosárban' : 'Kosárba'}
                      </Button>
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.products.map(p => (
                  <div key={p.id} style={{
                    background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8',
                    display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,.05)', cursor: 'pointer',
                  }}
                    onClick={() => setSelectedProduct(p)}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.05)')}
                  >
                    <div style={{ width: 64, height: 64, flexShrink: 0 }}>
                      <ProductImage url={p.image_url} name={p.name} style={{ height: 64, borderRadius: 6 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 14 }}>{p.name}</Text>
                      {p.code && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{p.code}</Text>}
                      {p.description && (
                        <Paragraph ellipsis={{ rows: 1 }} type="secondary" style={{ fontSize: 12, margin: '2px 0 0' }}>
                          {p.description}
                        </Paragraph>
                      )}
                    </div>
                    {data.show_prices && p.unit_selling_price != null && (
                      <Text strong style={{ color: '#1677ff', fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {fmt(p.unit_selling_price, p.currency)} / {p.unit}
                      </Text>
                    )}
                    {p.external_stock > 0 && (
                      <Tag color="green" style={{ fontSize: 10, flexShrink: 0, margin: 0 }}>
                        🏭 {p.external_stock.toLocaleString('hu-HU')} db
                      </Tag>
                    )}
                    <Button
                      type={inCart(p.id) ? 'default' : 'primary'}
                      size="small" icon={<ShoppingCartOutlined />}
                      style={{ flexShrink: 0 }}
                      onClick={e => handleAddToCart(e, p)}
                    >
                      {inCart(p.id) ? '\u2713' : '+'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {data.total > PAGE_SIZE && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={data.total}
                  onChange={handlePageChange}
                  showSizeChanger={false}
                  showTotal={t => `${t} termék`}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12, borderTop: '1px solid #e8e8e8', background: '#fff' }}>
        Powered by PixiERP
      </div>

      <ProductDetailDrawer
        product={selectedProduct}
        slug={slug}
        showPrices={data?.show_prices ?? true}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
};

export default PublicProductCatalog;
