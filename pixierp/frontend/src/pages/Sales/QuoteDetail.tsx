import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, DatePicker, Button, message, Space } from 'antd';
import dayjs from 'dayjs';
import { salesService } from '../../services/salesService';

const QuoteDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const q = await salesService.getQuote(Number(id));
      setQuote(q);
      form.setFieldsValue({
        quote_number: q.quote_number,
        valid_until: q.valid_until ? dayjs(q.valid_until) : undefined,
        notes: q.notes || '',
      });
    } catch {
      message.error('Nem sikerült betölteni az ajánlatot');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const onSave = async () => {
    if (!id) return;
    const v = await form.validateFields();
    try {
      const payload = {
        quote_number: v.quote_number,
        valid_until: v.valid_until ? v.valid_until.format('YYYY-MM-DD') : null,
        notes: v.notes || '',
      };
      await salesService.updateQuote(Number(id), payload);
      message.success('Mentve');
      load();
    } catch {
      message.error('Mentés sikertelen');
    }
  };

  return (
    <Card title={`Ajánlat: ${quote?.quote_number || ''}`} loading={loading} extra={<Space>
      <Button onClick={() => navigate('/sales/quotes')}>Vissza</Button>
      <Button type="primary" onClick={onSave}>Mentés</Button>
    </Space>}>
      <Form layout="vertical" form={form}>
        <Form.Item label="Ajánlat szám" name="quote_number" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Érvényes" name="valid_until">
          <DatePicker format={'YYYY-MM-DD'} />
        </Form.Item>
        <Form.Item label="Megjegyzés" name="notes">
          <Input.TextArea rows={6} />
        </Form.Item>
      </Form>
    </Card>
  );
};

export default QuoteDetail;
