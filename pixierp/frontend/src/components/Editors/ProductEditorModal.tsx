import React from 'react';
import { Modal, Form, Input, InputNumber, message } from 'antd';
import { salesService } from '../../services/salesService';

interface Props {
  open: boolean;
  onCancel: () => void;
  onCreated: (product: any) => void;
}

const ProductEditorModal: React.FC<Props> = ({ open, onCancel, onCreated }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = React.useState(false);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSubmitting(true);
      const created = await salesService.createProduct({
        name: v.name,
        description: v.description || '',
        unit: v.unit || 'db',
        base_price: v.base_price || 0,
        is_active: true,
      });
      message.success('Termék létrehozva');
      onCreated(created);
      form.resetFields();
    } catch (e) {
      // handled by form or API
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleOk} confirmLoading={submitting} title="Új termék" destroyOnHidden>
      <Form layout="vertical" form={form}>
        <Form.Item label="Név" name="name" rules={[{ required: true, message: 'Név kötelező' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Egység" name="unit">
          <Input placeholder="db" />
        </Form.Item>
        <Form.Item label="Nettó ár" name="base_price">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Leírás" name="description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ProductEditorModal;
