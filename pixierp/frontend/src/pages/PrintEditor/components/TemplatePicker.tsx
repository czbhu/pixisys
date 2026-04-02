import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Card, Tag, Empty, Spin, Input, Select, Image, message } from 'antd';
import { FileOutlined, FolderOutlined } from '@ant-design/icons';
import api from '../../../services/api';

interface TemplateCategory {
  id: number;
  name: string;
  template_count: number;
}

interface Template {
  id: number;
  name: string;
  category: number;
  category_name: string;
  file_url: string;
  file_type: 'pdf' | 'svg';
  thumbnail_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (file: File) => void;
  categoryIds?: number[];
}

const TemplatePicker: React.FC<Props> = ({ open, onClose, onSelect, categoryIds }) => {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<number | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/printshop/template-categories/', { params: { active_only: 'true' } });
      const all = res.data.results ?? res.data;
      if (categoryIds && categoryIds.length > 0) {
        const idSet = new Set(categoryIds);
        setCategories(all.filter((c: TemplateCategory) => idSet.has(c.id)));
      } else {
        setCategories(all);
      }
    } catch { /* ignore */ }
  }, [categoryIds]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { is_active: 'true' };
      if (selectedCat) params.category = selectedCat;
      const res = await api.get('/printshop/templates/', { params });
      let data: Template[] = res.data.results ?? res.data;
      // If category IDs are set and no specific category filter selected, filter client-side
      if (!selectedCat && categoryIds && categoryIds.length > 0) {
        const idSet = new Set(categoryIds);
        data = data.filter(t => idSet.has(t.category));
      }
      setTemplates(data);
    } catch {
      message.error('Sablonok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [selectedCat, categoryIds]);

  useEffect(() => { if (open) { fetchCategories(); fetchTemplates(); } }, [open, fetchCategories, fetchTemplates]);

  const filtered = templates.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = async (tpl: Template) => {
    setDownloading(tpl.id);
    try {
      const res = await api.get(tpl.file_url, { responseType: 'blob' });
      const ext = tpl.file_type === 'svg' ? '.svg' : '.pdf';
      const mimeType = tpl.file_type === 'svg' ? 'image/svg+xml' : 'application/pdf';
      const file = new File([res.data], `${tpl.name}${ext}`, { type: mimeType });
      onSelect(file);
      onClose();
    } catch {
      message.error('Sablon letöltése sikertelen');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Modal
      title="Sablon kiválasztása"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select
          style={{ width: 200 }}
          placeholder="Kategória"
          allowClear
          value={selectedCat}
          onChange={v => setSelectedCat(v ?? null)}
        >
          {categories.map(c => (
            <Select.Option key={c.id} value={c.id}>
              <FolderOutlined style={{ marginRight: 6 }} />{c.name} ({c.template_count})
            </Select.Option>
          ))}
        </Select>
        <Input.Search
          placeholder="Keresés..."
          allowClear
          style={{ flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : filtered.length === 0 ? (
        <Empty description="Nincs sablon" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {filtered.map(tpl => (
            <Card
              key={tpl.id}
              hoverable
              size="small"
              style={{
                textAlign: 'center',
                opacity: downloading === tpl.id ? 0.5 : 1,
                cursor: downloading ? 'wait' : 'pointer',
              }}
              onClick={() => !downloading && handleSelect(tpl)}
              cover={
                tpl.thumbnail_url ? (
                  <div style={{ height: 100, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                    <img src={tpl.thumbnail_url} alt={tpl.name} style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                    <FileOutlined style={{ fontSize: 36, color: '#bbb' }} />
                  </div>
                )
              }
            >
              <Card.Meta
                title={<span style={{ fontSize: 12 }}>{tpl.name}</span>}
                description={
                  <Tag color={tpl.file_type === 'pdf' ? 'red' : 'blue'} style={{ fontSize: 10 }}>
                    {tpl.file_type.toUpperCase()}
                  </Tag>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default TemplatePicker;
