import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, message, Checkbox, Select, Tabs, Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { warehouseService } from '../../services/warehouseService';

const { Option } = Select;

interface Props {
  open: boolean;
  onCancel: () => void;
  onCreated: (product: any) => void;
}

const ProductEditorModal: React.FC<Props> = ({ open, onCancel, onCreated }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
      form.setFieldsValue({ 
        material_format: 'piece',
        currency: 'HUF',
        is_active: true,
        is_material: false,
        is_product: true,
        unit: 'db',
        unit_cost_price: 0,
        markup_percentage: 35,
        unit_selling_price: 0,
        is_internal_production: false,
      });
    }
  }, [open]);

  const loadData = async () => {
    try {
      const companiesRes = await api.get('/crm/companies/?is_supplier=true');
      setCompanies(companiesRes.data.results || companiesRes.data || []);
      
      const prodsRes = await warehouseService.getMaterials(); // Or products? Assuming materials includes products based on usage
      setExistingProducts(prodsRes.results || prodsRes || []);
    } catch (e) {
      console.error('Hiba az adatok betöltésekor', e);
    }
  };

    const generateCode = () => {
      const name = form.getFieldValue('name') || '';
      let base = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!base) base = 'PROD';
      
      let i = 1;
      let suffix = '001';
      const codes = new Set(existingProducts.map(p => p.code));
      
      while (codes.has(`${base}-${suffix}`)) {
          i++;
          suffix = i.toString().padStart(3, '0');
          if (i > 999) break;
      }
      form.setFieldsValue({ code: `${base}-${suffix}` });
  };

  const handleCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;

      const isDuplicate = existingProducts.some(p => 
          p.code && p.code.toLowerCase() === val.toLowerCase()
      );

      if (isDuplicate) {
          message.warning('Ez a kód már létezik! Automatikus léptetés...');
          
          let newCode = val;
          const match = val.match(/^(.*?)(\d+)$/);
          
          if (match) {
             const prefix = match[1];
             const numStr = match[2];
             const width = Math.max(numStr.length, 3);
             const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
             
             let maxNum = parseInt(numStr, 10);
             
             existingProducts.forEach(p => {
                 if (!p.code) return;
                 const m = p.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
                 if (p.code.toLowerCase() === val.toLowerCase()) {
                     const n = parseInt(numStr, 10);
                     if (n > maxNum) maxNum = n;
                 }
             });
             
             newCode = `${prefix}${(maxNum + 1).toString().padStart(width, '0')}`;
          } else {
             const prefix = val + (val.endsWith('-') ? '' : '-');
             const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
             let maxNum = 0;
             existingProducts.forEach(p => {
                 if (!p.code) return;
                 const m = p.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
             });
             newCode = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
          }
          
          form.setFieldValue('code', newCode);
          message.success(`Új kód generálva: ${newCode}`);
      }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!values.code) {
           generateCode();
           values.code = form.getFieldValue('code');
      }
      setSubmitting(true);
      const created = await warehouseService.createMaterial({
        ...values,
        is_product: true,
      });
      message.success('Termék létrehozva');
      onCreated(created);
      form.resetFields();
      onCancel();
    } catch (e: any) {
      if (e?.errorFields) {
        message.error('Kérlek töltsd ki a kötelező mezőket');
      } else {
        message.error('Hiba történt a termék létrehozásakor');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const calculateMarkup = () => {
    const cost = form.getFieldValue('unit_cost_price');
    const selling = form.getFieldValue('unit_selling_price');
    if (cost && cost > 0 && selling) {
      const markup = ((selling - cost) / cost) * 100;
      form.setFieldsValue({ markup_percentage: Math.round(markup * 100) / 100 });
    }
  };

  const calculateSellingPrice = () => {
    const cost = form.getFieldValue('unit_cost_price');
    const markup = form.getFieldValue('markup_percentage');
    if (cost && markup !== undefined) {
      const selling = cost * (1 + markup / 100);
      form.setFieldsValue({ unit_selling_price: Math.round(selling * 100) / 100 });
    }
  };

  return (
    <Modal 
      open={open} 
      onCancel={onCancel} 
      onOk={handleOk} 
      confirmLoading={submitting} 
      title="Új termék" 
      width={800}
      destroyOnHidden
    >
      <Tabs 
        defaultActiveKey="1"
        items={[
          {
            key: '1',
            label: 'Alapadatok',
            children: (
              <Form
                form={form}
                layout="vertical"
              >
                <Form.Item
                  name="name"
                  label="Név"
                  rules={[{ required: true, message: 'Kötelező mező' }]}
                >
                  <Input />
                </Form.Item>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Form.Item
                    name="code"
                    label="Kód"
                    rules={[{ required: true, message: 'Kötelező mező' }]}
                    style={{ flex: 1 }}
                  >
                    <Input onBlur={handleCodeBlur} />
                  </Form.Item>
                  <Button style={{ marginTop: 30 }} onClick={generateCode}>Generál</Button>
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <Form.Item
                    name="is_material"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox>Alapanyag (gyártáshoz használható)</Checkbox>
                  </Form.Item>

                  <Form.Item
                    name="is_product"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox>Termék (értékesíthető)</Checkbox>
                  </Form.Item>
                </div>

                <Form.Item name="description" label="Leírás">
                  <Input.TextArea rows={3} />
                </Form.Item>

                <Form.Item
                  name="material_format"
                  label="Típus"
                  rules={[{ required: true, message: 'Kötelező mező' }]}
                >
                  <Select>
                    <Option value="piece">Darab</Option>
                    <Option value="sheet">Táblás/Íves</Option>
                    <Option value="roll">Tekercses</Option>
                    <Option value="linear">Folyóméter alapú</Option>
                    <Option value="weight">Súly alapú</Option>
                    <Option value="liter">Liter alapú</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="unit" label="Mértékegység">
                  <Select>
                    <Option value="db">db (darab)</Option>
                    <Option value="m">m (méter)</Option>
                    <Option value="m2">m² (négyzetméter)</Option>
                    <Option value="kg">kg (kilogramm)</Option>
                    <Option value="liter">liter</Option>
                  </Select>
                </Form.Item>
              </Form>
            )
          },
          {
            key: '2',
            label: 'Beszállítók és árak',
            children: (
              <Form form={form} layout="vertical">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item name="unit_cost_price" label="Bekerülési ár">
                    <InputNumber 
                      style={{ width: '100%' }} 
                      min={0} 
                      precision={2}
                      onChange={calculateMarkup}
                    />
                  </Form.Item>
                  <Form.Item name="markup_percentage" label="Haszonkulcs (%)">
                    <InputNumber 
                      style={{ width: '100%' }} 
                      min={0} 
                      precision={2}
                      onChange={calculateSellingPrice}
                    />
                  </Form.Item>
                </div>

                <Form.Item name="unit_selling_price" label="Eladási ár">
                  <InputNumber 
                    style={{ width: '100%' }} 
                    min={0} 
                    precision={2}
                    onChange={calculateMarkup}
                  />
                </Form.Item>

                <Form.Item name="currency" label="Pénznem">
                  <Select>
                    <Option value="HUF">HUF</Option>
                    <Option value="EUR">EUR</Option>
                    <Option value="USD">USD</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="default_supplier" label="Alapértelmezett beszállító">
                  <Select
                    allowClear
                    showSearch
                    placeholder="Válassz beszállítót"
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      (option?.children as unknown as string)
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                  >
                    {companies.map((company) => (
                      <Option key={company.id} value={company.id}>
                        {company.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            )
          }
        ]}
      />
    </Modal>
  );
};

export default ProductEditorModal;
