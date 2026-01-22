import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Tabs, Input, Table, Button, Form, InputNumber, Select, Space, message, Divider, Alert, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import ProductEditorModal from '../Editors/ProductEditorModal';
import ServiceEditorModal from '../Editors/ServiceEditorModal';
import ManufacturingProductEditorModal from '../Editors/ManufacturingProductEditorModal';

type ConcreteItemType = 'product' | 'manufacturing' | 'service';
type ItemType = ConcreteItemType | 'all';

export interface SelectedItemPayload {
  item_type: ConcreteItemType;
  ref_id: number;
  name: string;
  code?: string;
  unit?: string;
  base_price?: number;
  quantity: number;
  net_unit_price?: number;
  vat_rate?: number;
  description?: string;
  discount_percent?: number;
  discount_amount?: number;
  files?: File[];
  fileRemarks?: Record<string, string>; // key: file.uid or file.name
}

interface ItemSelectorModalProps {
  open: boolean;
  defaultType?: ItemType;
  onCancel: () => void;
  onAdd: (payload: SelectedItemPayload) => Promise<any> | any;
  allowCreate?: boolean;
  mode?: 'add' | 'edit';
  initialSelection?: { item_type: ItemType; ref_id: number; name?: string; code?: string };
  initialValues?: Partial<{ quantity: number; unit: string; net_unit_price: number; vat_rate: number; description: string; discount_percent: number; discount_amount: number }>;
  customer?: { id: any; name: string };
}

const { Search } = Input;

const defaultVat = 27;

export const ItemSelectorModal: React.FC<ItemSelectorModalProps> = ({ open, defaultType = 'product', onCancel, onAdd, allowCreate = true, mode = 'add', initialSelection, initialValues, customer }) => {
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState<ItemType>(defaultType);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [manuProducts, setManuProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [top, setTop] = useState<{product:any[]; manufacturing:any[]; service:any[]}>({product:[], manufacturing:[], service:[]});
  const [form] = Form.useForm();
  const [createError, setCreateError] = useState<string | null>(null);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [serviceEditorOpen, setServiceEditorOpen] = useState(false);
  const [manuEditorOpen, setManuEditorOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileRemarks, setPendingFileRemarks] = useState<Record<string, string>>({});

  const translateUnit = (unit: string | undefined | null) => {
    if (!unit) return '';
    const map: Record<string, string> = {
      'hour': 'óra',
      'minute': 'perc',
      'piece': 'db',
      'pcs': 'db',
      'day': 'nap',
    };
    return map[unit] || unit;
  };

  useEffect(() => {
    const channel = new BroadcastChannel('pixi_rfq_item_creation');
    channel.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'ITEM_CREATED') {
         const { item, itemType } = data;
         setActiveKey(itemType);
         
         // Update lists
         if (itemType === 'product') setProducts(prev => [item, ...prev]);
         else if (itemType === 'service') setServices(prev => [item, ...prev]);
         else if (itemType === 'manufacturing') setManuProducts(prev => [item, ...prev]);
         
         setSelected(item);
         
         let unit = item.unit || item.quantity_unit || (itemType === 'service' ? 'óra' : 'db');
         unit = translateUnit(unit);
         const price = item.base_price ?? item.net_unit_price ?? item.unit_selling_price ?? 0;
         form.setFieldsValue({ unit, net_unit_price: price });
      }
    };
    return () => channel.close();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setActiveKey(mode === 'edit' && initialSelection?.item_type ? initialSelection.item_type : defaultType);
  setPendingFiles([]);
  setPendingFileRemarks({});
    loadData();
    if (mode === 'edit') {
      if (initialValues) {
        form.setFieldsValue({
          quantity: initialValues.quantity,
          unit: initialValues.unit,
          net_unit_price: initialValues.net_unit_price,
          vat_rate: initialValues.vat_rate ?? defaultVat,
          description: initialValues.description,
          discount_percent: initialValues.discount_percent,
          discount_amount: initialValues.discount_amount,
        });
      }
    }
  }, [open, defaultType]);

  useEffect(() => {
    if (!open || !initialSelection) return;
    const pickFromLists = () => {
      let rec: any = null;
      if (initialSelection.item_type === 'product') {
        rec = (products || []).find((p: any) => p.id === initialSelection.ref_id);
      } else if (initialSelection.item_type === 'manufacturing') {
        rec = (manuProducts || []).find((p: any) => p.id === initialSelection.ref_id);
      } else {
        rec = (services || []).find((p: any) => p.id === initialSelection.ref_id);
      }
      if (rec) {
        setSelected(rec);
        let unit = rec.unit || rec.quantity_unit || (initialSelection.item_type === 'service' ? 'óra' : 'db');
        unit = translateUnit(unit);
        const price = rec.base_price ?? rec.net_unit_price ?? rec.unit_selling_price ?? form.getFieldValue('net_unit_price');
        form.setFieldsValue({ unit, net_unit_price: price });
      } else {
        setSelected({ id: initialSelection.ref_id, name: initialSelection.name, code: initialSelection.code });
      }
    };
    pickFromLists();
  }, [open, products, manuProducts, services, initialSelection]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load warehouse materials with is_product=true filter for products
      const [prodRes, manuRes, svcRes, topProd, topManu, topSvc] = await Promise.all([
        api.get('/warehouse/materials/?filter_type=products').then(r => r.data),
        manufacturingService.getProducts(),
        salesService.getServices(),
        salesService.getTopProducts().catch(() => []),
        salesService.getTopManufacturingProducts().catch(() => []),
        salesService.getTopServices().catch(() => []),
      ]);
      
      let pList = prodRes.results ?? prodRes;
      let mList = (manuRes as any).results ?? manuRes;
      let sList = svcRes.results ?? svcRes;

      // Handle specific item for editing
      if (initialSelection && initialSelection.ref_id) {
          try {
              if (initialSelection.item_type === 'service') {
                  const exists = sList.find((s: any) => s.id === initialSelection.ref_id);
                  if (!exists) {
                      const s = await salesService.getService(initialSelection.ref_id);
                      if (s) sList = [s, ...sList];
                  }
              } else if (initialSelection.item_type === 'manufacturing') {
                  const exists = mList.find((m: any) => m.id === initialSelection.ref_id);
                  if (!exists) {
                      const m = await manufacturingService.getProduct(initialSelection.ref_id);
                      if (m) mList = [m, ...mList];
                  }
              } else if (initialSelection.item_type === 'product') {
                  const exists = pList.find((p: any) => p.id === initialSelection.ref_id);
                  if (!exists) {
                      const p = await api.get(`/warehouse/materials/${initialSelection.ref_id}/`).then(r => r.data);
                      if (p) pList = [p, ...pList];
                  }
              }
          } catch (e) { console.error('Error fetching specific item', e); }
      }

      setProducts(pList);
      setManuProducts(mList);
      setServices(sList);
      setTop({ product: topProd as any[], manufacturing: topManu as any[], service: topSvc as any[] });
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterFn = (r: any, fields: string[]) => {
      if (!q) return true;
      const matches = fields.some((f) => {
        const val = r[f];
        if (val === null || val === undefined) return false;
        const strVal = String(val).toLowerCase();
        const result = strVal.includes(q);
        return result;
      });
      return matches;
    };
    const mergeTopFront = (arr: any[], tops: any[], idKey: string = 'id') => {
      if (!tops || !tops.length || q) return arr;
      const topIds = new Set(tops.map((t: any) => t[idKey] ?? t.id));
      const prefixed = tops.concat(arr.filter((r) => !topIds.has(r[idKey] ?? r.id)));
      return prefixed;
    };
    const prod = mergeTopFront(products.filter((r) => filterFn(r, ['code', 'name', 'description', 'unit'])), top.product);
    const manu = mergeTopFront(manuProducts.filter((r) => filterFn(r, ['name', 'description', 'product_class_name', 'contact_company_name'])), top.manufacturing);
    const svc = mergeTopFront(services.filter((r) => filterFn(r, ['code', 'name', 'description', 'unit'])), top.service);
    const all = [
      ...prod.map((r: any) => ({ ...r, __type: 'product' })),
      ...manu.map((r: any) => ({ ...r, __type: 'manufacturing' })),
      ...svc.map((r: any) => ({ ...r, __type: 'service' })),
    ];
    return {
      product: prod,
      manufacturing: manu,
      service: svc,
      all,
    } as Record<ItemType, any[]>;
  }, [products, manuProducts, services, search, top]);

  const commonFields = (
    <>
      <Space style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Form.Item label="Mennyiség" name="quantity" initialValue={1} rules={[{ required: true }]} style={{ marginBottom: 8 }}> 
          <InputNumber min={0.01} step={1} style={{ width: 120 }} parser={(value) => value?.replace(',', '.') as unknown as number} />
        </Form.Item>
        <Form.Item label="Egység" name="unit" style={{ marginBottom: 8 }}> 
          <Input disabled style={{ width: 100 }} />
        </Form.Item>
        <Form.Item label="Nettó egységár" name="net_unit_price" style={{ marginBottom: 8 }}> 
          <InputNumber min={0} step={1} style={{ width: 160 }} parser={(value) => value?.replace(',', '.') as unknown as number} />
        </Form.Item>
        <Form.Item label="ÁFA %" name="vat_rate" initialValue={defaultVat} style={{ marginBottom: 8 }}> 
          <InputNumber min={0} step={1} style={{ width: 120 }} parser={(value) => value?.replace(',', '.') as unknown as number} />
        </Form.Item>
        <Form.Item label="Nettó összesen" shouldUpdate style={{ marginBottom: 8 }}>
          {() => {
            const qty = Number(form.getFieldValue('quantity') || 0);
            const price = Number(form.getFieldValue('net_unit_price') || 0);
            return <Input value={(qty * price).toFixed(2)} readOnly style={{ width: 160 }} />;
          }}
        </Form.Item>
        <Form.Item label="Pénznem" name="currency" initialValue="HUF" style={{ marginBottom: 8 }}>
          <Select style={{ width: 120 }} options={[{ value: 'HUF', label: 'HUF' }]} />
        </Form.Item>
      </Space>
      <Space direction="vertical" style={{ width: '100%', gap: 8 }}>
        <Form.Item label="Megjegyzés" name="description" style={{ marginBottom: 8 }}> 
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
        </Form.Item>
        {(
        <Upload.Dragger
          name="files"
          multiple
          showUploadList
          beforeUpload={(file) => { setPendingFiles((prev) => [...prev, file]); return false; }}
          fileList={pendingFiles as any}
          onRemove={(f) => {
            const uid = (f as any)?.uid;
              const key = uid || (f as any)?.name;
              setPendingFiles((prev) => prev.filter((x: any) => (x as any).uid ? (x as any).uid !== uid : (x as any).name !== (f as any).name));
              setPendingFileRemarks((prev) => {
                const { [key]: _, ...rest } = prev;
                return rest;
              });
          }}
          style={{ padding: 8 }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a tallózáshoz</p>
        </Upload.Dragger>
        )}
        {pendingFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFiles.map((f: any) => {
              const key = (f as any)?.uid || (f as any)?.name;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(f as any)?.name}</span>
                  <Input placeholder="Megjegyzés ehhez a fájlhoz" value={pendingFileRemarks[key] || ''} onChange={(e) => setPendingFileRemarks((prev) => ({ ...prev, [key]: e.target.value }))} />
                </div>
              );
            })}
          </div>
        )}
        <Space style={{ gap: 12, flexWrap: 'wrap' }}>
          <Form.Item label="Kedvezmény %" name="discount_percent" style={{ marginBottom: 8 }}>
            <InputNumber min={0} max={100} style={{ width: 120 }} parser={(value) => value?.replace(',', '.') as unknown as number} />
          </Form.Item>
          <Form.Item label="Kedvezmény (fix)" name="discount_amount" style={{ marginBottom: 8 }}>
            <InputNumber min={0} style={{ width: 160 }} parser={(value) => value?.replace(',', '.') as unknown as number} />
          </Form.Item>
          <Form.Item label="Kedvezményes nettó összesen" shouldUpdate style={{ marginBottom: 8 }}>
            {() => {
              const qty = Number(form.getFieldValue('quantity') || 0);
              const price = Number(form.getFieldValue('net_unit_price') || 0);
              const pct = Number(form.getFieldValue('discount_percent') || 0);
              const amt = Number(form.getFieldValue('discount_amount') || 0);
              const net = qty * price;
              let discounted = net;
              if (pct > 0) discounted = discounted * (1 - pct / 100);
              if (amt > 0) discounted = Math.max(0, discounted - amt);
              const perUnit = qty > 0 ? discounted / qty : 0;
              const unit = form.getFieldValue('unit') || 'db';
              const totalStr = Math.round(discounted).toLocaleString('hu-HU');
              const perStr = Math.round(perUnit).toLocaleString('hu-HU');
              const display = `${totalStr} (${perStr}/${unit})`;
              return <Input value={display} readOnly style={{ width: 260 }} />;
            }}
          </Form.Item>
        </Space>
      </Space>
    </>
  );

  const [selected, setSelected] = useState<any | null>(null);

  const handleRowClick = (record: any) => {
    setSelected(record);
    const currentType = (activeKey === 'all' ? (record.__type as any) : activeKey);
    let unit = record.unit || record.quantity_unit || (currentType === 'service' ? 'óra' : 'db');
    unit = translateUnit(unit);
    const price = record.base_price ?? record.net_unit_price ?? record.unit_selling_price ?? 0;
    form.setFieldsValue({ unit, net_unit_price: price });
  };

  const confirmAdd = async () => {
    try {
      if (!selected) {
        message.warning('Válassz egy tételt a listából');
        return;
      }
      const v = await form.validateFields();
      const concreteType = (activeKey === 'all' ? (selected as any).__type : (activeKey as any));
      const payload: SelectedItemPayload = {
        item_type: concreteType,
        ref_id: selected.id,
        name: selected.name,
        code: selected.code,
        unit: v.unit,
        base_price: selected.base_price ?? selected.net_unit_price ?? selected.unit_selling_price,
        quantity: v.quantity,
        net_unit_price: v.net_unit_price,
        vat_rate: v.vat_rate,
        description: v.description,
        discount_percent: v.discount_percent,
        discount_amount: v.discount_amount,
      };
      await onAdd({ ...payload, files: pendingFiles, fileRemarks: pendingFileRemarks });
      setPendingFiles([]);
      setPendingFileRemarks({});
      form.resetFields();
      setSelected(null);
    } catch (e) {
      // validation error surfaced by form
    }
  };

  const createNew = async () => {
    setCreateError(null);
    let url = '';
    // Open proper pages in new tab
    if (activeKey === 'product') {
      url = '/warehouse/materials?create=true&from_rfq=true';
    } else if (activeKey === 'service') {
      url = '/manufacturing/services?create=true&from_rfq=true';
    } else {
      url = '/manufacturing/products?create=true&from_rfq=true';
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  const columnsByType: Record<ItemType, any[]> = {
    product: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: (v: any) => v || '-' },
      { title: 'Termék neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { title: 'Nettó ár', dataIndex: 'base_price', key: 'base_price' },
      { title: 'Egység', dataIndex: 'unit', key: 'unit' },
    ],
    manufacturing: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: () => '-' },
      { title: 'Egyedi gyártás neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { title: 'Nettó ár', dataIndex: 'net_unit_price', key: 'net_unit_price' },
      { title: 'Egység', dataIndex: 'quantity_unit', key: 'quantity_unit', render: (v: any) => v || 'db' },
    ],
    service: [
      { title: 'Cikkszám', dataIndex: 'code', key: 'code', render: (v: any) => v || '-' },
      { title: 'Szolgáltatás neve', dataIndex: 'name', key: 'name' },
      { title: 'Leírás', dataIndex: 'description', key: 'description' },
      { title: 'Nettó ár', dataIndex: 'base_price', key: 'base_price' },
      { title: 'Egység', dataIndex: 'unit', key: 'unit' },
    ],
    all: [
      { title: 'Típus', key: 't', render: (r: any) => r.__type === 'product' ? 'Termék' : r.__type === 'manufacturing' ? 'Egyedi gyártás' : 'Szolgáltatás' },
      { title: 'Cikkszám', key: 'code', render: (r: any) => r.code || '-' },
      { title: 'Név', key: 'name', render: (r: any) => r.name },
      { title: 'Nettó ár', key: 'price', render: (r: any) => r.base_price ?? r.net_unit_price ?? 0 },
    ],
  };

  const tabItems = [
    { key: 'product', label: 'Termék', children: null },
    { key: 'manufacturing', label: 'Egyedi Gyártás', children: null },
    { key: 'service', label: 'Szolgáltatás', children: null },
    { key: 'all', label: 'Mind', children: null },
  ];

  const renderTable = (type: ItemType) => (
    <Table
      loading={loading}
      size="small"
      rowKey={(r: any) => `${(r as any).__type || type}-${r.id}`}
      columns={(type === 'all'
        ? [
            { title: 'Típus', key: 't', render: (r: any) => (r.__type === 'product' ? 'Termék' : r.__type === 'manufacturing' ? 'Egyedi gyártás' : 'Szolgáltatás') },
            { title: 'Cikkszám', key: 'code', render: (r: any) => r.code || '-' },
            { title: 'Név', key: 'name', render: (r: any) => r.name },
            { title: 'Nettó ár', key: 'price', render: (r: any) => r.base_price ?? r.net_unit_price ?? 0 },
          ]
        : (columnsByType as any)[type]) as any}
      dataSource={filtered[type]}
      pagination={{ pageSize: 8 }}
      onRow={(record) => ({ onClick: () => handleRowClick(record) })}
      rowClassName={(record) => (selected && record.id === selected.id ? 'ant-table-row-selected' : '')}
    />
  );

  return (
    <Modal open={open} onCancel={onCancel} onOk={confirmAdd} okText={mode === 'edit' ? 'Mentés' : 'Hozzáadás'} title={mode === 'edit' ? 'Tétel szerkesztése' : 'Tétel kiválasztása'} width={1100}>
      <Space direction="vertical" style={{ width: '100%', gap: 8 }}>
        <Tabs
          activeKey={activeKey}
          onChange={(k) => {
            setActiveKey(k as ItemType);
            setSelected(null);
            form.resetFields();
          }}
          items={tabItems as any}
        />
        <Space align="start" style={{ gap: 8 }}>
          <Search placeholder="Gyors keresés" allowClear onSearch={setSearch as any} onChange={(e) => setSearch(e.target.value)} style={{ width: 360 }} />
          {allowCreate && mode === 'add' && (
            <Button onClick={createNew} type="dashed">
              {activeKey === 'product' ? 'Új termék' : activeKey === 'service' ? 'Új szolgáltatás' : 'Új egyedi gyártás'}
            </Button>
          )}
        </Space>
        {renderTable(activeKey)}
        <Form layout="vertical" form={form}>
          {commonFields}
        </Form>
      </Space>
      <ProductEditorModal
        open={productEditorOpen}
        onCancel={() => setProductEditorOpen(false)}
        onCreated={(created) => {
          setProducts((prev) => [created, ...prev]);
          setSelected(created);
          setProductEditorOpen(false);
        }}
      />
      <ServiceEditorModal
        open={serviceEditorOpen}
        onCancel={() => setServiceEditorOpen(false)}
        onCreated={(created) => {
          setServices((prev) => [created, ...prev]);
          setSelected(created);
          setServiceEditorOpen(false);
        }}
      />
      <ManufacturingProductEditorModal
        open={manuEditorOpen}
        onCancel={() => setManuEditorOpen(false)}
        customer={customer}
        onCreated={(created) => {
          setManuProducts((prev) => [created, ...prev]);
          setSelected(created);
          setManuEditorOpen(false);
        }}
      />
    </Modal>
  );
};

export default ItemSelectorModal;
