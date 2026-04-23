import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, message, Button } from 'antd';
import NumInput from '../NumInput';
import { salesService } from '../../services/salesService';

interface Props {
  open: boolean;
  onCancel: () => void;
  onCreated: (service: any) => void;
}

const ServiceEditorModal: React.FC<Props> = ({ open, onCancel, onCreated }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = React.useState(false);
  const [existingServices, setExistingServices] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      const res = await salesService.getServices();
      // Handle pagination if needed, assuming current endpoint returns array or {results: []}
      const list = (Array.isArray(res) ? res : res.results) || [];
      setExistingServices(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      
      setSubmitting(true);
      const created = await salesService.createService({
        code: v.code,
        name: v.name,
        description: v.description || '',
        unit: v.unit || 'óra',
        base_price: v.base_price || 0,
        is_active: true,
      });
      message.success('Szolgáltatás létrehozva');
      onCreated(created);
      form.resetFields();
    } catch (e: any) {
        if (e.errorFields) return;
        message.error('Hiba történt a mentéskor');
        console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const generateCode = () => {
      const name = form.getFieldValue('name') || '';
      let base = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!base) base = 'SERV';
      
      let i = 1;
      let suffix = '001';
      
      const codes = new Set(existingServices.map(s => s.code));
      
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

      const isDuplicate = existingServices.some(s => 
          s.code && s.code.toLowerCase() === val.toLowerCase()
      );

      if (isDuplicate) {
          message.warning('Ez a cikkszám már létezik! Automatikus léptetés...');
          
          let newCode = val;
          const match = val.match(/^(.*?)(\d+)$/);
          
          if (match) {
             const prefix = match[1];
             const numStr = match[2];
             const width = Math.max(numStr.length, 3);
             const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
             
             let maxNum = parseInt(numStr, 10);
             
             existingServices.forEach(s => {
                 if (!s.code) return;
                 const m = s.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
                 if (s.code.toLowerCase() === val.toLowerCase()) {
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
             existingServices.forEach(s => {
                 if (!s.code) return;
                 const m = s.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
             });
             
             newCode = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
          }
          
          form.setFieldValue('code', newCode);
          message.success(`Új cikkszám generálva: ${newCode}`);
      }
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleOk} confirmLoading={submitting} title="Új szolgáltatás" destroyOnHidden>
      <Form layout="vertical" form={form}>
        <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item label="Cikkszám" name="code" style={{ flex: 1 }}>
              <Input onBlur={handleCodeBlur} />
            </Form.Item>
            <Button style={{ marginTop: 30 }} onClick={generateCode}>Generál</Button>
        </div>
        <Form.Item label="Név" name="name" rules={[{ required: true, message: 'Név kötelező' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Egység" name="unit">
          <Input placeholder="óra" />
        </Form.Item>
        <Form.Item label="Nettó ár" name="base_price">
          <NumInput min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Leírás" name="description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ServiceEditorModal;
