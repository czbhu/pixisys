import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Modal, Form, Input, InputNumber, Upload, message, Space, Tag,
  Popconfirm, Tabs, Table, Select, Empty, Spin, Image,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined,
  FolderOutlined, FileOutlined, InboxOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Dragger } = Upload;

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface TemplateCategory {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  template_count: number;
  created_at: string;
}

interface Template {
  id: number;
  name: string;
  category: number;
  category_name: string;
  file: string;
  file_url: string;
  file_type: 'pdf' | 'svg';
  thumbnail: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_by_name: string | null;
  created_at: string;
}

/* ── Component ──────────────────────────────────────────────────────────────── */

const PrintTemplatesPage: React.FC = () => {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<TemplateCategory | null>(null);
  const [catForm] = Form.useForm();

  // Template modal
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [tplForm] = Form.useForm();
  const [uploading, setUploading] = useState(false);

  /* ── Fetch ──────────────────────────────────────────────────────────────── */

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/printshop/template-categories/');
      setCategories(res.data.results ?? res.data);
    } catch {
      message.error('Kategóriák betöltése sikertelen');
    }
  }, []);

  const fetchTemplates = useCallback(async (catId?: number | null) => {
    setLoading(true);
    try {
      const params: any = {};
      if (catId) params.category = catId;
      const res = await api.get('/printshop/templates/', { params });
      setTemplates(res.data.results ?? res.data);
    } catch {
      message.error('Sablonok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchTemplates(selectedCategory); }, [selectedCategory, fetchTemplates]);

  /* ── Category CRUD ──────────────────────────────────────────────────────── */

  const openCatModal = (cat?: TemplateCategory) => {
    setEditingCat(cat || null);
    catForm.resetFields();
    if (cat) catForm.setFieldsValue(cat);
    setCatModalOpen(true);
  };

  const saveCat = async () => {
    try {
      const values = await catForm.validateFields();
      if (editingCat) {
        await api.patch(`/printshop/template-categories/${editingCat.id}/`, values);
        message.success('Kategória frissítve');
      } else {
        await api.post('/printshop/template-categories/', values);
        message.success('Kategória létrehozva');
      }
      setCatModalOpen(false);
      fetchCategories();
      fetchTemplates(selectedCategory);
    } catch {
      message.error('Mentés sikertelen');
    }
  };

  const deleteCat = async (id: number) => {
    try {
      await api.delete(`/printshop/template-categories/${id}/`);
      message.success('Kategória törölve');
      if (selectedCategory === id) setSelectedCategory(null);
      fetchCategories();
      fetchTemplates(selectedCategory === id ? null : selectedCategory);
    } catch {
      message.error('Törlés sikertelen');
    }
  };

  /* ── Template CRUD ──────────────────────────────────────────────────────── */

  const openTplModal = (tpl?: Template) => {
    setEditingTpl(tpl || null);
    tplForm.resetFields();
    if (tpl) {
      tplForm.setFieldsValue({
        name: tpl.name,
        category: tpl.category,
        sort_order: tpl.sort_order,
        is_active: tpl.is_active,
      });
    } else if (selectedCategory) {
      tplForm.setFieldsValue({ category: selectedCategory });
    }
    setTplModalOpen(true);
  };

  const saveTpl = async () => {
    try {
      const values = await tplForm.validateFields();
      const fd = new FormData();
      fd.append('name', values.name);
      fd.append('category', String(values.category));
      if (values.sort_order != null) fd.append('sort_order', String(values.sort_order));
      fd.append('is_active', String(values.is_active ?? true));

      // File
      const fileList = values.file;
      if (Array.isArray(fileList) && fileList.length) {
        fd.append('file', fileList[0].originFileObj);
      } else if (!editingTpl) {
        message.error('Kérlek tölts fel egy fájlt');
        return;
      }

      // Thumbnail
      const thumbList = values.thumbnail;
      if (Array.isArray(thumbList) && thumbList.length) {
        fd.append('thumbnail', thumbList[0].originFileObj);
      }

      setUploading(true);
      if (editingTpl) {
        await api.patch(`/printshop/templates/${editingTpl.id}/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        message.success('Sablon frissítve');
      } else {
        await api.post('/printshop/templates/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        message.success('Sablon feltöltve');
      }
      setTplModalOpen(false);
      fetchTemplates(selectedCategory);
      fetchCategories();
    } catch {
      message.error('Mentés sikertelen');
    } finally {
      setUploading(false);
    }
  };

  const deleteTpl = async (id: number) => {
    try {
      await api.delete(`/printshop/templates/${id}/`);
      message.success('Sablon törölve');
      fetchTemplates(selectedCategory);
      fetchCategories();
    } catch {
      message.error('Törlés sikertelen');
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const tplColumns = [
    {
      title: 'Előnézet',
      dataIndex: 'thumbnail_url',
      key: 'thumbnail',
      width: 80,
      render: (url: string | null, record: Template) =>
        url ? (
          <Image src={url} width={50} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 50, height: 50, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
            <FileOutlined style={{ fontSize: 20, color: '#bbb' }} />
          </div>
        ),
    },
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Template, b: Template) => a.name.localeCompare(b.name),
    },
    {
      title: 'Típus',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 80,
      render: (t: string) => <Tag color={t === 'pdf' ? 'red' : 'blue'}>{t.toUpperCase()}</Tag>,
    },
    { title: 'Kategória', dataIndex: 'category_name', key: 'category_name', width: 160 },
    { title: 'Sorrend', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Aktív' : 'Inaktív'}</Tag>,
    },
    {
      title: 'Feltöltötte',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 140,
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: any, record: Template) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openTplModal(record)} />
          <Popconfirm title="Biztosan törli?" onConfirm={() => deleteTpl(record.id)} okText="Igen" cancelText="Nem">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Nyomtatási sablonok</h2>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Left: Categories */}
        <Card
          title="Kategóriák"
          size="small"
          style={{ width: 280, flexShrink: 0 }}
          extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openCatModal()}>Új</Button>}
        >
          <div
            style={{
              padding: '6px 12px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
              background: selectedCategory === null ? '#e6f4ff' : 'transparent',
              fontWeight: selectedCategory === null ? 600 : 400,
            }}
            onClick={() => setSelectedCategory(null)}
          >
            <FolderOutlined style={{ marginRight: 8 }} />
            Összes sablon
            <Tag style={{ float: 'right', marginRight: 0 }}>{templates.length}</Tag>
          </div>
          {categories.map(cat => (
            <div
              key={cat.id}
              style={{
                padding: '6px 12px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                background: selectedCategory === cat.id ? '#e6f4ff' : 'transparent',
                fontWeight: selectedCategory === cat.id ? 600 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span><FolderOutlined style={{ marginRight: 8 }} />{cat.name}</span>
              <Space size={4}>
                <Tag>{cat.template_count}</Tag>
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={e => { e.stopPropagation(); openCatModal(cat); }} />
                <Popconfirm
                  title="Biztosan törli a kategóriát és az összes benne lévő sablont?"
                  onConfirm={e => { e?.stopPropagation(); deleteCat(cat.id); }}
                  onCancel={e => e?.stopPropagation()}
                  okText="Igen" cancelText="Nem"
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} onClick={e => e.stopPropagation()} />
                </Popconfirm>
              </Space>
            </div>
          ))}
          {categories.length === 0 && <Empty description="Nincs kategória" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>

        {/* Right: Templates */}
        <Card
          title={selectedCategory ? categories.find(c => c.id === selectedCategory)?.name || 'Sablonok' : 'Összes sablon'}
          size="small"
          style={{ flex: 1 }}
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openTplModal()}
              disabled={categories.length === 0}
            >
              Sablon feltöltése
            </Button>
          }
        >
          <Table
            dataSource={templates}
            columns={tplColumns}
            loading={loading}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
          />
        </Card>
      </div>

      {/* Category Modal */}
      <Modal
        title={editingCat ? 'Kategória szerkesztése' : 'Új kategória'}
        open={catModalOpen}
        onCancel={() => setCatModalOpen(false)}
        onOk={saveCat}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={catForm} layout="vertical">
          <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Leírás">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="sort_order" label="Sorrend" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Template Modal */}
      <Modal
        title={editingTpl ? 'Sablon szerkesztése' : 'Sablon feltöltése'}
        open={tplModalOpen}
        onCancel={() => setTplModalOpen(false)}
        onOk={saveTpl}
        okText="Mentés"
        cancelText="Mégse"
        confirmLoading={uploading}
        width={520}
      >
        <Form form={tplForm} layout="vertical">
          <Form.Item name="name" label="Sablon neve" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="Kategória" rules={[{ required: true, message: 'Kötelező' }]}>
            <Select>
              {categories.map(c => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="file"
            label="Fájl (PDF vagy SVG)"
            valuePropName="fileList"
            getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList}
            rules={editingTpl ? [] : [{ required: true, message: 'Tölts fel egy fájlt' }]}
          >
            <Dragger
              accept=".pdf,.svg"
              maxCount={1}
              beforeUpload={() => false}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Húzd ide a fájlt vagy kattints</p>
              <p className="ant-upload-hint">PDF vagy SVG formátum</p>
            </Dragger>
          </Form.Item>
          <Form.Item
            name="thumbnail"
            label="Előnézeti kép (opcionális – automatikusan generálódik)"
            valuePropName="fileList"
            getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList}
          >
            <Upload accept="image/*" maxCount={1} beforeUpload={() => false} listType="picture">
              <Button icon={<UploadOutlined />}>Kép kiválasztása</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="sort_order" label="Sorrend" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PrintTemplatesPage;
