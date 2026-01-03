import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Select, message } from 'antd';
import dayjs from 'dayjs';
import { manufacturingService, ProductClass, Project, Currency } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';

interface Props {
  open: boolean;
  onCancel: () => void;
  onCreated: (mp: any) => void;
}

const ManufacturingProductEditorModal: React.FC<Props> = ({ open, onCancel, onCreated }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = React.useState(false);
  const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [pcs, projs, cons, curs] = await Promise.all([
          manufacturingService.getProductClasses(),
          manufacturingService.getOpenProjects(),
          crmService.getContacts().then((r: any) => r.results || r),
          manufacturingService.getActiveCurrencies(),
        ]);
        setProductClasses(pcs);
        setProjects(projs);
        setContacts(cons);
        setCurrencies(curs);
        form.setFieldsValue({
          date: dayjs(),
          deadline: dayjs().add(14, 'day'),
          status: 'quote_request_open',
          quantity: 1,
          net_unit_price: 0,
        });
      } catch {}
    })();
  }, [open]);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSubmitting(true);
      const data = {
        date: v.date.format('YYYY-MM-DD'),
        name: v.name,
        description: v.description || '',
        internal_description: v.internal_description || '',
        quantity: v.quantity,
        quantity_unit: v.quantity_unit || 'db',
        product_class: v.product_class,
        project: v.project,
        net_unit_price: v.net_unit_price || null,
        status: v.status,
        contact: v.contact,
        deadline: v.deadline.format('YYYY-MM-DD'),
      } as any;
      const created = await manufacturingService.createProduct(data);
      message.success('Egyedi gyártás létrehozva');
      onCreated(created);
      form.resetFields();
    } catch (e) {
      // handled by form or API
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleOk} confirmLoading={submitting} title="Új Egyedi Gyártás" width={700} destroyOnHidden>
      <Form layout="vertical" form={form}>
        <Form.Item label="Név" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Leírás" name="description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label="Belső leírás" name="internal_description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label="Mennyiség" name="quantity" rules={[{ required: true }]}> 
          <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Egység" name="quantity_unit"> 
          <Input placeholder="db" />
        </Form.Item>
        <Form.Item label="Egységár (nettó)" name="net_unit_price"> 
          <InputNumber min={0} step={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Termékosztály" name="product_class">
          <Select allowClear showSearch optionFilterProp="label">
            {productClasses.map(pc => (
              <Select.Option key={pc.id} value={pc.id} label={pc.name}>{pc.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="Projekt" name="project">
          <Select allowClear showSearch optionFilterProp="label">
            {projects.map(p => (
              <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="Kapcsolattartó" name="contact">
          <Select allowClear showSearch optionFilterProp="label">
            {contacts.map((c: any) => (
              <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="Keltezés" name="date" initialValue={dayjs()}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Határidő" name="deadline" initialValue={dayjs().add(14, 'day')} rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ManufacturingProductEditorModal;
