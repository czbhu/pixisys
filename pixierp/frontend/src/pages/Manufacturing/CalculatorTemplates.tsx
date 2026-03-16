import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Row, Col, Card, List, Checkbox } from 'antd';
import EnhancedTable from '../../components/EnhancedTable';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalculatorOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import api from '../../services/api';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Option } = Select;
const { TextArea } = Input;

interface Material {
  id: number;
  name: string;
  code: string;
}

interface Service {
  id: number;
  name: string;
  code: string;
}

// Separate component for Resource Selection
const ResourceSelectionModal: React.FC<{
  open: boolean;
  title: string;
  allResources: any[];
  initialSelectedIds: number[];
  onOk: (ids: number[]) => void;
  onCancel: () => void;
}> = ({ open, title, allResources, initialSelectedIds, onOk, onCancel }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedIds(initialSelectedIds);
      setSearchText('');
    }
  }, [open, initialSelectedIds]);

  const filteredResources = useMemo(() => {
    if (!searchText) return allResources;
    const lower = searchText.toLowerCase();
    return allResources.filter(r => 
      r.name.toLowerCase().includes(lower) || 
      (r.code && r.code.toLowerCase().includes(lower))
    );
  }, [allResources, searchText]);

  const selectedResources = useMemo(() => {
    return allResources.filter(r => selectedIds.includes(r.id));
  }, [allResources, selectedIds]);

  const handleRemove = (id: number) => {
    setSelectedIds(prev => prev.filter(x => x !== id));
  };

  const columns = [
    { title: 'Név', dataIndex: 'name', key: 'name' },
    { title: 'Cikkszám', dataIndex: 'code', key: 'code' },
  ];

  return (
    <Modal
      open={open}
      title={title}
      onOk={() => onOk(selectedIds)}
      onCancel={onCancel}
      width={800}
      styles={{ body: { height: '600px', display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ marginBottom: 16 }}>
        <strong>Kiválasztva ({selectedIds.length}):</strong>
        <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto', border: '1px solid #f0f0f0', padding: 8 }}>
           {selectedResources.length === 0 ? <span style={{ color: '#999' }}>Nincs kiválasztott elem</span> : (
             <Space wrap>
               {selectedResources.map(r => (
                 <Tag closable onClose={() => handleRemove(r.id)} key={r.id}>{r.name}</Tag>
               ))}
             </Space>
           )}
        </div>
      </div>

      <Input 
        prefix={<SearchOutlined />} 
        placeholder="Keresés..." 
        style={{ marginBottom: 16 }}
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
      />

      <Table
        dataSource={filteredResources}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 50 }}
        scroll={{ y: 300 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (newSelectedKeys) => setSelectedIds(newSelectedKeys as number[]),
        }}
      />
    </Modal>
  );
};

interface CalculatorTemplate {
  id: number;
  name: string;
  code: string;
  description: string;
  default_markup_percentage: number;
  is_active: boolean;
  allowed_materials: number[];
  allowed_services: number[];
  allowed_materials_details: any[];
  allowed_services_details: any[];
  input_fields: any[];
  created_by_name: string;
  category?: string;
  calculator_type?: string; // 'generic', 'sheet_print', 'roll_print'
}

const CALCULATOR_CATEGORIES = [
  { label: 'Íves/Táblás nyomtatás', value: 'sheet_print', color: 'blue' },
  { label: 'Tekercses nyomtatás', value: 'roll_print', color: 'green' },
  { label: 'Világító tábla', value: 'lightbox', color: 'orange' },
  { label: 'Egyéb', value: 'other', color: 'default' }
];

const CALCULATOR_TYPES = [
  { label: 'Általános', value: 'generic' },
  { label: 'Íves/Táblás optimalizálás', value: 'sheet_print' },
  { label: 'Tekercses kalkuláció', value: 'roll_print' }
];

const CalculatorTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<CalculatorTemplate[]>([]);
  const [searchText, setSearchText] = useState('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CalculatorTemplate | null>(null);
  const [form] = Form.useForm();

  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);

  const [resourceModal, setResourceModal] = useState<{
    open: boolean;
    type: 'material' | 'service';
  }>({ open: false, type: 'material' });

  useEffect(() => {
    fetchTemplates();
    fetchMaterials();
    fetchServices();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/manufacturing/calculator-templates/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setTemplates(data);
    } catch (error) {
      message.error('Hiba a sablonok betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await api.get('/warehouse/materials/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setMaterials(data);
    } catch (error) {
      console.error('Hiba az alapanyagok betöltésekor', error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await api.get('/manufacturing/services/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setServices(data);
    } catch (error) {
      console.error('Hiba a szolgáltatások betöltésekor', error);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ category: 'other', calculator_type: 'generic' });
    setSelectedMaterials([]);
    setSelectedServices([]);
    setModalVisible(true);
  };

  const handleEdit = (record: CalculatorTemplate) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      ...record,
      category: record.category || 'other',
      calculator_type: record.calculator_type || 'generic',
      allowed_materials: record.allowed_materials || [],
      allowed_services: record.allowed_services || [],
    });
    setSelectedMaterials(record.allowed_materials || []);
    setSelectedServices(record.allowed_services || []);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/calculator-templates/${id}/`);
      message.success('Sablon törölve');
      fetchTemplates();
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const generateCode = () => {
    const name = form.getFieldValue('name');
    if (!name) {
      message.warning('Előbb add meg a sablon nevét!');
      return;
    }
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'CALC';
    const codes = new Set(templates.map(t => t.code).filter(Boolean));
    let i = 1;
    let candidate = `${base}-${String(i).padStart(3, '0')}`;
    while (codes.has(candidate)) {
      i++;
      candidate = `${base}-${String(i).padStart(3, '0')}`;
      if (i > 999) { message.error('Nem sikerült egyedi cikkszámot generálni'); return; }
    }
    form.setFieldsValue({ code: candidate });
    message.success(`Új cikkszám generálva: ${candidate}`);
  };

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        allowed_materials: selectedMaterials,
        allowed_services: selectedServices,
        input_fields: values.input_fields || [],
      };

      if (editingTemplate) {
        await api.put(`/manufacturing/calculator-templates/${editingTemplate.id}/`, payload);
        message.success('Sablon módosítva');
      } else {
        await api.post('/manufacturing/calculator-templates/', payload);
        message.success('Sablon létrehozva');
      }
      setModalVisible(false);
      fetchTemplates();
    } catch (error) {
      message.error('Hiba a mentés során');
      console.error(error);
    }
  };

  const columns = [
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: CalculatorTemplate, b: CalculatorTemplate) => a.name.localeCompare(b.name),
    },
    {
      title: 'Kategória',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      render: (category: string) => {
        const cat = CALCULATOR_CATEGORIES.find(c => c.value === category);
        return cat ? <Tag color={cat.color}>{cat.label}</Tag> : category;
      }
    },
    {
      title: 'Típus',
      dataIndex: 'calculator_type',
      key: 'calculator_type',
      width: 150,
      render: (type: string) => {
        const t = CALCULATOR_TYPES.find(c => c.value === type);
        return t ? t.label : type;
      }
    },
    {
      title: 'Cikkszám',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: 'Alapanyagok',
      key: 'materials',
      width: 100,
      render: (_: any, record: CalculatorTemplate) => (
        <Tag color="blue">{record.allowed_materials_details?.length || 0} db</Tag>
      ),
    },
    {
      title: 'Szolgáltatások',
      key: 'services',
      width: 120,
      render: (_: any, record: CalculatorTemplate) => (
        <Tag color="green">{record.allowed_services_details?.length || 0} db</Tag>
      ),
    },
    {
      title: 'Haszonkulcs',
      dataIndex: 'default_markup_percentage',
      key: 'default_markup_percentage',
      width: 120,
      render: (value: number) => `${value}%`,
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'red'}>
          {is_active ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: CalculatorTemplate) => (
        <Space>
          <Button
            type="link"
            icon={<CalculatorOutlined />}
            onClick={() => window.location.href = `/manufacturing/calculator/${record.id}`}
          >
            Használ
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Biztosan törli?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filteredTemplates = useMemo(() => {
    if (!searchText?.trim()) return templates;
    return templates.filter((template) => deepSearchMatch(searchText, template));
  }, [templates, searchText]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Kalkulátor sablonok</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Új sablon</Button>
      </div>

      <EnhancedTable
        tableKey="calculatorTemplates"
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Gyorskereső..."
        columns={columns}
        dataSource={filteredTemplates}
        rowKey="id"
        loading={loading}
        cardBreakpoint={900}
      />

      <Modal
        title={editingTemplate ? 'Sablon szerkesztése' : 'Új sablon'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={900}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            is_active: true,
            default_markup_percentage: 30,
          }}
        >
          <Form.Item
            name="name"
            label="Sablon neve"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. Molinó nyomtatás" />
          </Form.Item>

          <Form.Item
            name="code"
            label="Cikkszám"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input
              placeholder="pl. MOLINO-001"
              addonAfter={
                <SyncOutlined
                  style={{ cursor: 'pointer' }}
                  title="Cikkszám generálása a név alapján"
                  onClick={generateCode}
                />
              }
            />
          </Form.Item>

          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="category" label="Kategória">
                    <Select>
                        {CALCULATOR_CATEGORIES.map(c => <Option key={c.value} value={c.value}>{c.label}</Option>)}
                    </Select>
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item name="calculator_type" label="Működési logika">
                     <Select>
                        {CALCULATOR_TYPES.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                     </Select>
                </Form.Item>
             </Col>
          </Row>

          <Form.Item name="description" label="Leírás">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="default_markup_percentage"
            label="Alapértelmezett haszonkulcs (%)"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={1000}
              precision={2}
              addonAfter="%"
            />
          </Form.Item>

          <Form.Item label="Engedélyezett alapanyagok">
             <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                 <Button icon={<PlusOutlined />} onClick={() => setResourceModal({ open: true, type: 'material' })}>
                     Kezelés
                 </Button>
                 <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: 8, minHeight: 32 }}>
                    {selectedMaterials.length === 0 && <span style={{ color: '#bfbfbf' }}>Nincs kiválasztott alapanyag</span>}
                    <Space wrap>
                        {selectedMaterials.map(id => {
                            const m = materials.find(x => x.id === id);
                            return m ? (
                                <Tag key={id} closable onClose={() => setSelectedMaterials(prev => prev.filter(x => x !== id))}>
                                    {m.name}
                                </Tag>
                            ) : null;
                        })}
                    </Space>
                 </div>
             </div>
          </Form.Item>

          <Form.Item label="Engedélyezett szolgáltatások">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                 <Button icon={<PlusOutlined />} onClick={() => setResourceModal({ open: true, type: 'service' })}>
                     Kezelés
                 </Button>
                 <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: 8, minHeight: 32 }}>
                    {selectedServices.length === 0 && <span style={{ color: '#bfbfbf' }}>Nincs kiválasztott szolgáltatás</span>}
                    <Space wrap>
                        {selectedServices.map(id => {
                            const s = services.find(x => x.id === id);
                            return s ? (
                                <Tag key={id} closable onClose={() => setSelectedServices(prev => prev.filter(x => x !== id))}>
                                    {s.name}
                                </Tag>
                            ) : null;
                        })}
                    </Space>
                 </div>
             </div>
          </Form.Item>

          <Form.Item name="is_active" label="Státusz">
            <Select>
              <Option value={true}>Aktív</Option>
              <Option value={false}>Inaktív</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <ResourceSelectionModal
        open={resourceModal.open}
        title={resourceModal.type === 'material' ? 'Alapanyagok kiválasztása' : 'Szolgáltatások kiválasztása'}
        allResources={resourceModal.type === 'material' ? materials : services}
        initialSelectedIds={resourceModal.type === 'material' ? selectedMaterials : selectedServices}
        onCancel={() => setResourceModal({ ...resourceModal, open: false })}
        onOk={(ids) => {
            if (resourceModal.type === 'material') setSelectedMaterials(ids);
            else setSelectedServices(ids);
            setResourceModal({ ...resourceModal, open: false });
        }}
      />
    </div>
  );
};

export default CalculatorTemplates;
