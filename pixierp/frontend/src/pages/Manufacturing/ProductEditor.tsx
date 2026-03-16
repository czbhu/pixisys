import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, InputNumber,
  message, Tag, Popconfirm, Tooltip, Drawer, Row, Col, Divider,
  Switch, Empty, Typography, Card,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MinusCircleOutlined,
  CalculatorOutlined, TagsOutlined, AppstoreOutlined, SyncOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductTemplateSize {
  id?: number;
  label: string;
  width_mm: number | null;
  height_mm: number | null;
  sort_order: number;
}

interface CalcRef {
  id: number;
  name: string;
  code: string;
}

interface ProductTemplate {
  id: number;
  name: string;
  code: string | null;
  description: string;
  category: number | null;
  category_name: string | null;
  calculators: number[];
  calculators_details: CalcRef[];
  sizes: ProductTemplateSize[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductClass {
  id: number;
  name: string;
}

interface CalculatorTemplate {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  allowed_materials_details?: any[];
  allowed_services_details?: any[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptySize = (order = 0): ProductTemplateSize => ({
  label: '', width_mm: null, height_mm: null, sort_order: order,
});

// ── Main component ───────────────────────────────────────────────────────────

const ProductEditor: React.FC = () => {
  const [products, setProducts]         = useState<ProductTemplate[]>([]);
  const [categories, setCategories]     = useState<ProductClass[]>([]);
  const [calculators, setCalculators]   = useState<CalculatorTemplate[]>([]);
  const [loading, setLoading]           = useState(false);
  const [query, setQuery]               = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<ProductTemplate | null>(null);
  const [saving, setSaving]             = useState(false);

  // Form state
  const [form] = Form.useForm();
  const [sizes, setSizes]               = useState<ProductTemplateSize[]>([emptySize(0)]);
  const [selectedCalcs, setSelectedCalcs] = useState<number[]>([]);

  // Detail / preview drawer
  const [detailOpen, setDetailOpen]     = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductTemplate | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, calcRes] = await Promise.all([
        api.get('/manufacturing/product-templates/'),
        api.get('/manufacturing/product-classes/?page_size=1000'),
        api.get('/manufacturing/calculator-templates/'),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data.results ?? []));
      setCategories(Array.isArray(catRes.data) ? catRes.data : (catRes.data.results ?? []));
      setCalculators(Array.isArray(calcRes.data) ? calcRes.data : (calcRes.data.results ?? []));
    } catch {
      message.error('Hiba az adatok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Drawer open/close ───────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setSizes([emptySize(0)]);
    setSelectedCalcs([]);
    setDrawerOpen(true);
  };

  const openEdit = (p: ProductTemplate) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name,
      code: p.code ?? undefined,
      description: p.description,
      category: p.category ?? undefined,
      is_active: p.is_active,
    });
    setSizes(p.sizes.length > 0 ? p.sizes.map(s => ({ ...s })) : [emptySize(0)]);
    setSelectedCalcs(p.calculators ?? []);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    try {
      await form.validateFields();
    } catch { return; }

    const values = form.getFieldsValue();
    const validSizes = sizes.filter(s => s.width_mm != null && s.height_mm != null);

    const payload = {
      name: values.name,
      code: values.code || null,
      description: values.description ?? '',
      category: values.category ?? null,
      is_active: values.is_active ?? true,
      calculators: selectedCalcs,
      sizes: validSizes.map((s, i) => ({ ...s, sort_order: i })),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/manufacturing/product-templates/${editing.id}/`, payload);
        message.success('Termék frissítve');
      } else {
        await api.post('/manufacturing/product-templates/', payload);
        message.success('Termék létrehozva');
      }
      closeDrawer();
      loadAll();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/product-templates/${id}/`);
      message.success('Termék törölve');
      loadAll();
    } catch {
      message.error('Törlési hiba');
    }
  };

  // ── Size row helpers ─────────────────────────────────────────────────────────

  const addSize = () => setSizes(prev => [...prev, emptySize(prev.length)]);

  const removeSize = (idx: number) =>
    setSizes(prev => prev.filter((_, i) => i !== idx));

  const updateSize = (idx: number, field: keyof ProductTemplateSize, value: any) =>
    setSizes(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // Auto-fill label from dimensions if label is empty or was previously auto-generated
      if (field === 'width_mm' || field === 'height_mm') {
        const prevAuto = (s.width_mm && s.height_mm) ? `${s.width_mm}×${s.height_mm} mm` : '';
        if (!s.label || s.label === prevAuto) {
          const w = field === 'width_mm' ? value : s.width_mm;
          const h = field === 'height_mm' ? value : s.height_mm;
          updated.label = (w && h) ? `${w}×${h} mm` : '';
        }
      }
      return updated;
    }));

  // ── Code generator ─────────────────────────────────────────────────────────

  const generateCode = () => {
    const name = form.getFieldValue('name');
    if (!name) {
      message.warning('Előbb add meg a termék nevét!');
      return;
    }
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'PROD';
    const codes = new Set(products.map(p => p.code).filter(Boolean));
    let i = 1;
    let candidate = `${base}-${String(i).padStart(3, '0')}`;
    while (codes.has(candidate)) {
      i++;
      candidate = `${base}-${String(i).padStart(3, '0')}`;
      if (i > 999) { message.error('Nem sikerült egyedi cikkszámot genérálni'); return; }
    }
    form.setFieldsValue({ code: candidate });
    message.success(`Új cikkszám generálva: ${candidate}`);
  };

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = products.filter(p =>
    !query || deepSearchMatch(query, `${p.name} ${p.description ?? ''} ${p.category_name ?? ''}`)
  );

  // ── Detail drawer – shows linked calculators with their materials / services ─

  const openDetail = (p: ProductTemplate) => {
    setDetailProduct(p);
    setDetailOpen(true);
  };

  // ── Columns ──────────────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Cikkszám',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">–</Text>,
    },
    {
      title: 'Termék neve',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: ProductTemplate, b: ProductTemplate) => a.name.localeCompare(b.name),
      render: (name: string, rec: ProductTemplate) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(rec)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Kategória',
      dataIndex: 'category_name',
      key: 'category',
      render: (v: string | null) => v ? <Tag icon={<TagsOutlined />}>{v}</Tag> : <Text type="secondary">–</Text>,
    },
    {
      title: 'Méretek',
      key: 'sizes',
      render: (_: any, rec: ProductTemplate) => (
        <Space size={4} wrap>
          {rec.sizes.length === 0
            ? <Text type="secondary">–</Text>
            : rec.sizes.map((s, i) => (
                <Tag key={i} color="blue">
                  {s.label ? `${s.label} (${s.width_mm}×${s.height_mm})` : `${s.width_mm}×${s.height_mm} mm`}
                </Tag>
              ))}
        </Space>
      ),
    },
    {
      title: 'Kalkulátorok',
      key: 'calculators',
      render: (_: any, rec: ProductTemplate) => (
        <Space size={4} wrap>
          {rec.calculators_details.length === 0
            ? <Text type="secondary">–</Text>
            : rec.calculators_details.map(c => (
                <Tag key={c.id} icon={<CalculatorOutlined />} color="purple">{c.name}</Tag>
              ))}
        </Space>
      ),
    },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Igen' : 'Nem'}</Tag>,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      render: (_: any, rec: ProductTemplate) => (
        <Space>
          <Tooltip title="Szerkesztés">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Popconfirm title="Biztosan törlöd?" onConfirm={() => handleDelete(rec.id)} okText="Törlés" cancelText="Mégse">
            <Tooltip title="Törlés">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px 24px' }}>
      <UnifiedQuickSearchHeader
        title="Termék szerkesztő"
        searchValue={query}
        onSearchChange={setQuery}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Új termék
          </Button>
        }
      />

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 25, showSizeChanger: true }}
        locale={{ emptyText: <Empty description="Nincs termék rögzítve" /> }}
      />

      {/* ── Create / Edit Drawer ─────────────────────────────────────────── */}
      <Drawer
        title={editing ? `Szerkesztés – ${editing.name}` : 'Új termék'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={680}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>Mégse</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              Mentés
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <Form form={form} layout="vertical">

          {/* Alapadatok */}
          <Divider orientation="left" style={{ fontSize: 13 }}>Alapadatok</Divider>

          <Form.Item name="name" label="Termék neve" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input placeholder="pl. Molinó, Szórólap A5, Névjegykártya" />
          </Form.Item>

          <Form.Item name="code" label="Cikkszám">
            <Input
              placeholder="pl. MOLINÓ-001"
              addonAfter={
                <Tooltip title="Cikkszám generálása a név alapján">
                  <SyncOutlined style={{ cursor: 'pointer' }} onClick={generateCode} />
                </Tooltip>
              }
            />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <TextArea rows={3} placeholder="Rövid leírás…" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={18}>
              <Form.Item name="category" label="Termékkategória">
                <Select allowClear placeholder="Válassz kategóriát…">
                  {categories.map(c => (
                    <Option key={c.id} value={c.id}>{c.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          {/* Méretek */}
          <Divider orientation="left" style={{ fontSize: 13 }}>Méretek</Divider>

          {sizes.map((s, idx) => (
            <Row key={idx} gutter={8} align="middle" style={{ marginBottom: 8 }}>
              <Col span={6}>
                <Input
                  placeholder="Méret neve (pl. A4)"
                  value={s.label}
                  onChange={e => updateSize(idx, 'label', e.target.value)}
                  size="small"
                />
              </Col>
              <Col span={7}>
                <InputNumber
                  placeholder="Szélesség"
                  addonAfter="mm"
                  min={1}
                  style={{ width: '100%' }}
                  value={s.width_mm ?? undefined}
                  onChange={v => updateSize(idx, 'width_mm', v ?? null)}
                  size="small"
                />
              </Col>
              <Col span={7}>
                <InputNumber
                  placeholder="Magasság"
                  addonAfter="mm"
                  min={1}
                  style={{ width: '100%' }}
                  value={s.height_mm ?? undefined}
                  onChange={v => updateSize(idx, 'height_mm', v ?? null)}
                  size="small"
                />
              </Col>
              <Col span={4} style={{ textAlign: 'right' }}>
                <Button
                  size="small"
                  danger
                  icon={<MinusCircleOutlined />}
                  onClick={() => removeSize(idx)}
                  disabled={sizes.length === 1}
                />
              </Col>
            </Row>
          ))}

          <Button size="small" icon={<PlusOutlined />} onClick={addSize} style={{ marginBottom: 8 }}>
            Méret hozzáadása
          </Button>

          {/* Kalkulátorok */}
          <Divider orientation="left" style={{ fontSize: 13 }}>Kalkulátorok</Divider>

          <Form.Item
            label="Hozzárendelt kalkulátorok"
            help="A kiválasztott kalkulátorok alapanyag- és szolgáltatáslistája jelenik meg az ajánlatkészítőben."
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Válassz kalkulátort…"
              value={selectedCalcs}
              onChange={setSelectedCalcs}
              optionFilterProp="label"
              options={calculators.filter(c => c.is_active).map(c => ({
                label: `${c.name} (${c.code})`,
                value: c.id,
              }))}
            />
          </Form.Item>

          {/* Preview: az adott kalkulátorok anyagai/szolgáltatásai */}
          {selectedCalcs.length > 0 && (() => {
            const linked = calculators.filter(c => selectedCalcs.includes(c.id));
            const allMats = linked.flatMap(c => c.allowed_materials_details ?? []);
            const allSvcs = linked.flatMap(c => c.allowed_services_details ?? []);
            const uniqMats = Array.from(new Map(allMats.map(m => [m.id, m])).values());
            const uniqSvcs = Array.from(new Map(allSvcs.map(s => [s.id, s])).values());
            return (
              <Card
                size="small"
                style={{ marginTop: 8, background: '#fafafa' }}
                title={<Text style={{ fontSize: 12 }}>Elérhető alapanyagok és szolgáltatások (kalkulátorok alapján)</Text>}
              >
                <Row gutter={16}>
                  <Col span={12}>
                    <Text strong style={{ fontSize: 11 }}>Alapanyagok ({uniqMats.length})</Text>
                    <div style={{ marginTop: 4 }}>
                      {uniqMats.length === 0
                        ? <Text type="secondary" style={{ fontSize: 11 }}>–</Text>
                        : uniqMats.map(m => <Tag key={m.id} style={{ marginBottom: 4 }}>{m.name}</Tag>)}
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text strong style={{ fontSize: 11 }}>Szolgáltatások ({uniqSvcs.length})</Text>
                    <div style={{ marginTop: 4 }}>
                      {uniqSvcs.length === 0
                        ? <Text type="secondary" style={{ fontSize: 11 }}>–</Text>
                        : uniqSvcs.map(s => <Tag key={s.id} color="blue" style={{ marginBottom: 4 }}>{s.name}</Tag>)}
                    </div>
                  </Col>
                </Row>
              </Card>
            );
          })()}

        </Form>
      </Drawer>

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      <Drawer
        title={<Space><AppstoreOutlined /> {detailProduct?.name}</Space>}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={
          <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); if (detailProduct) openEdit(detailProduct); }}>
            Szerkesztés
          </Button>
        }
      >
        {detailProduct && (() => {
          const linked = calculators.filter(c => detailProduct.calculators.includes(c.id));
          const allMats = linked.flatMap(c => c.allowed_materials_details ?? []);
          const allSvcs = linked.flatMap(c => c.allowed_services_details ?? []);
          const uniqMats = Array.from(new Map(allMats.map(m => [m.id, m])).values());
          const uniqSvcs = Array.from(new Map(allSvcs.map(s => [s.id, s])).values());
          return (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>

              {detailProduct.category_name && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>KATEGÓRIA</Text><br />
                  <Tag icon={<TagsOutlined />}>{detailProduct.category_name}</Tag>
                </div>
              )}

              {detailProduct.description && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>LEÍRÁS</Text><br />
                  <Text>{detailProduct.description}</Text>
                </div>
              )}

              <Divider style={{ margin: '4px 0' }} />

              <div>
                <Text strong>Méretek</Text>
                {detailProduct.sizes.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nincs megadott méret" style={{ marginTop: 8 }} />
                  : (
                    <Table
                      size="small"
                      dataSource={detailProduct.sizes}
                      rowKey={(r, i) => String(i)}
                      pagination={false}
                      style={{ marginTop: 8 }}
                      columns={[
                        { title: 'Méret neve', dataIndex: 'label', key: 'label', render: v => v || '–' },
                        { title: 'Szélesség', dataIndex: 'width_mm', key: 'w', render: v => `${v} mm` },
                        { title: 'Magasság', dataIndex: 'height_mm', key: 'h', render: v => `${v} mm` },
                      ]}
                    />
                  )}
              </div>

              <Divider style={{ margin: '4px 0' }} />

              <div>
                <Text strong>Kalkulátorok</Text>
                {detailProduct.calculators_details.length === 0
                  ? <div style={{ marginTop: 8, color: '#999' }}>Nincs kalkulátor hozzárendelve</div>
                  : <Space wrap style={{ marginTop: 8 }}>
                      {detailProduct.calculators_details.map(c => (
                        <Tag key={c.id} icon={<CalculatorOutlined />} color="purple">{c.name}</Tag>
                      ))}
                    </Space>}
              </div>

              {linked.length > 0 && (
                <>
                  <Divider style={{ margin: '4px 0' }} />
                  <Row gutter={16}>
                    <Col span={12}>
                      <Text strong>Alapanyagok ({uniqMats.length})</Text>
                      <Space wrap style={{ marginTop: 8, display: 'block' }}>
                        {uniqMats.length === 0
                          ? <Text type="secondary">–</Text>
                          : uniqMats.map(m => <Tag key={m.id} style={{ marginBottom: 4 }}>{m.name}</Tag>)}
                      </Space>
                    </Col>
                    <Col span={12}>
                      <Text strong>Szolgáltatások ({uniqSvcs.length})</Text>
                      <Space wrap style={{ marginTop: 8, display: 'block' }}>
                        {uniqSvcs.length === 0
                          ? <Text type="secondary">–</Text>
                          : uniqSvcs.map(s => <Tag key={s.id} color="blue" style={{ marginBottom: 4 }}>{s.name}</Tag>)}
                      </Space>
                    </Col>
                  </Row>
                </>
              )}
            </Space>
          );
        })()}
      </Drawer>
    </div>
  );
};

export default ProductEditor;
