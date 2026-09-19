import React, { useState } from 'react';
import {
  Drawer, Button, Space, Typography, InputNumber, Empty, Divider,
  Form, Input, message, Spin, Badge, Tag,
} from 'antd';
import { ShoppingCartOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { usePublicCart } from '../contexts/PublicCartContext';
import axios from 'axios';

const { Text, Title } = Typography;

interface Props {
  slug: string;
  onProductOpen?: (productId: number) => void;
}

const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('hu-HU')} ${cur}`;

export const CartButton: React.FC<Props> = ({ slug, onProductOpen }) => {
  const { count } = usePublicCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Badge count={count} size="small" offset={[-4, 4]}>
        <Button
          type={count > 0 ? 'primary' : 'default'}
          icon={<ShoppingCartOutlined />}
          onClick={() => setOpen(true)}
          size="large"
        >
          Kosár
        </Button>
      </Badge>
      <CartDrawer slug={slug} open={open} onClose={() => setOpen(false)} onProductOpen={id => {
        setOpen(false);
        setTimeout(() => onProductOpen?.(id), 150);  // brief delay so cart closes before detail opens
      }} />
    </>
  );
};

const CartDrawer: React.FC<{ slug: string; open: boolean; onClose: () => void; onProductOpen?: (productId: number) => void }> = ({ slug, open, onClose, onProductOpen }) => {
  const { items, remove, setQty, clear } = usePublicCart();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form] = Form.useForm();

  const total = items.reduce((s, i) => s + (i.unit_selling_price ?? 0) * i.quantity, 0);
  const hasPrices = items.some(i => i.unit_selling_price != null);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await axios.post('/api/v1/public-cart-quote/', {
        slug,
        items: items.map(i => ({
          code: i.code,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_selling_price,
          currency: i.currency,
        })),
        contact_name: values.contact_name,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone || '',
        notes: values.notes || '',
      });
      setSubmitted(true);
      clear();
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hiba az elküldés során');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={<Space><ShoppingCartOutlined /> Kosár ({items.length} tétel)</Space>}
      open={open}
      onClose={() => { onClose(); setSubmitted(false); }}
      width={Math.min(480, window.innerWidth)}
      footer={
        !submitted && items.length > 0 ? (
          <Button type="primary" size="large" block icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
            Árajánlat kérése
          </Button>
        ) : null
      }
    >
      {submitted ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <Title level={4}>Köszönjük!</Title>
          <Text type="secondary">Árajánlatkérése megérkezett. Hamarosan felvesszük a kapcsolatot.</Text>
          <br /><br />
          <Button onClick={() => { onClose(); setSubmitted(false); }}>Bezárás</Button>
        </div>
      ) : items.length === 0 ? (
        <Empty description="A kosár üres" style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Items list */}
          <div style={{ marginBottom: 16 }}>
            {items.map(item => (
              <div key={item.id} style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid #f0f0f0',
              }}>
                <div
                  style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0, cursor: onProductOpen ? 'pointer' : 'default' }}
                  onClick={() => onProductOpen && onProductOpen(item.product_id)}
                  title={onProductOpen ? 'Termék adatlap megnyitása' : undefined}
                >
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} loading="lazy"
                    style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, borderRadius: 6, background: '#fafafa' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ display: 'block', fontSize: 13, color: onProductOpen ? '#1677ff' : undefined }}>{item.name}</Text>
                  {item.code && <Text type="secondary" style={{ fontSize: 11 }}>{item.code}</Text>}
                  {item.unit_selling_price != null && (
                    <Text style={{ fontSize: 12, color: '#1677ff', display: 'block' }}>
                      {fmt(item.unit_selling_price * item.quantity, item.currency)}
                    </Text>
                  )}
                </div>
                </div>
                <Space size={4}>
                  <InputNumber
                    size="small" min={1} max={9999} value={item.quantity}
                    onChange={v => setQty(item.id, v ?? 1)}
                    style={{ width: 64 }}
                    addonAfter={item.unit}
                  />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(item.id)} />
                </Space>
              </div>
            ))}
          </div>

          {hasPrices && (
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <Text strong style={{ fontSize: 16 }}>Összesen: {fmt(total, items[0]?.currency || 'HUF')} + ÁFA</Text>
            </div>
          )}

          <Divider>Kapcsolati adatok</Divider>

          <Form form={form} layout="vertical" size="middle">
            <Form.Item name="contact_name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
              <Input placeholder="Kovács János" />
            </Form.Item>
            <Form.Item name="contact_email" label="E-mail" rules={[{ required: true, type: 'email', message: 'Érvényes e-mail szükséges' }]}>
              <Input placeholder="kovacs@ceg.hu" />
            </Form.Item>
            <Form.Item name="contact_phone" label="Telefon (opcionális)">
              <Input placeholder="+36 30 123 4567" />
            </Form.Item>
            <Form.Item name="notes" label="Megjegyzés (opcionális)">
              <Input.TextArea rows={2} placeholder="Speciális kérések, határidő, stb." />
            </Form.Item>
          </Form>
        </>
      )}
    </Drawer>
  );
};
