import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Checkbox, Button, Input, message, Spin, Alert } from 'antd';
import { CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface DeliveryItem {
  id: number;
  item_code: string;
  item_name: string;
  quantity: number;
  unit: string;
  net_unit_price: number;
  discount_percent: number;
  vat_rate: number;
  net_total: number;
  discounted_net_total: number;
  gross_total: number;
}

interface Contact {
  name: string;
  email: string;
  phone: string;
}

interface DeliveryData {
  order_number: string;
  delivery_note_number?: string;
  customer_name: string;
  title: string;
  description: string;
  delivery_started_at: string | null;
  delivery_confirmed: boolean;
  delivery_notes: string;
  show_prices: boolean;
  items: DeliveryItem[];
  contacts: Contact[];
}

const PublicDelivery: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DeliveryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDeliveryData();
  }, [token]);

  const fetchDeliveryData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/v1/sales/customer-orders/public/delivery/${token}/`
      );
      setData(response.data);
      setNotes(response.data.delivery_notes || '');
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Érvénytelen vagy lejárt szállítólevél link.');
      } else if (err.response?.status === 410) {
        setError('A szállítólevél link lejárt.');
      } else {
        setError('Hiba történt a szállítólevél betöltése során.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!data) return;

    try {
      setSubmitting(true);
      await axios.post(
        `/api/v1/sales/customer-orders/public/delivery/${token}/confirm/`,
        {
          confirmed_items: confirmedItems,
          notes: notes,
        }
      );
      message.success('Szállítólevél sikeresen visszaigazolva!');
      fetchDeliveryData(); // Refresh to show confirmed status
    } catch (err: any) {
      message.error('Hiba történt: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleItem = (itemId: number) => {
    if (confirmedItems.includes(itemId)) {
      setConfirmedItems(confirmedItems.filter((id) => id !== itemId));
    } else {
      setConfirmedItems([...confirmedItems, itemId]);
    }
  };

  const toggleAll = () => {
    if (data && confirmedItems.length === data.items.length) {
      setConfirmedItems([]);
    } else if (data) {
      setConfirmedItems(data.items.map((item) => item.id));
    }
  };

  const handlePrint = () => {
    const pdfUrl = `/api/v1/sales/customer-orders/public/delivery/${token}/pdf/`;
    window.open(pdfUrl, '_blank');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: 800, margin: '50px auto', padding: 20 }}>
        <Alert message="Hiba" description={error || 'Nem sikerült betölteni a szállítólevelet.'} type="error" showIcon />
      </div>
    );
  }

  const columns = [
    {
      title: 'Átvettem',
      key: 'confirmed',
      width: 100,
      render: (_: any, record: DeliveryItem) => (
        <Checkbox
          checked={confirmedItems.includes(record.id)}
          onChange={() => toggleItem(record.id)}
          disabled={data.delivery_confirmed}
        />
      ),
    },
    {
      title: 'Cikkszám',
      dataIndex: 'item_code',
      key: 'item_code',
    },
    {
      title: 'Név',
      dataIndex: 'item_name',
      key: 'item_name',
    },
    {
      title: 'Mennyiség',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (qty: number, record: DeliveryItem) => `${qty} ${record.unit}`,
    },
    ...(data.show_prices ? [
      {
        title: 'Nettó egységár',
        dataIndex: 'net_unit_price',
        key: 'net_unit_price',
        render: (price: number) => `${Math.round(price).toLocaleString('hu-HU')} Ft`,
      },
      {
        title: 'Nettó összesen',
        key: 'net_total',
        render: (_: any, record: DeliveryItem) => {
          const netTotal = record.quantity * record.net_unit_price;
          const discount = netTotal * (record.discount_percent / 100);
          const discountedNet = netTotal - discount;
          return `${Math.round(discountedNet).toLocaleString('hu-HU')} Ft`;
        },
      },
    ] : []),
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '20px auto', padding: 20 }}>
      <Card
        title={
          <div>
            <h2 style={{ margin: 0 }}>📦 Szállítólevél</h2>
            {data.delivery_confirmed && (
              <Alert
                message="Visszaigazolva"
                description={`Ez a szállítólevél már visszaigazolásra került.`}
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        }
        style={{ marginBottom: 20 }}
      >
        <div style={{ marginBottom: 20 }}>
          <p>
            <strong>Megrendelés szám:</strong> {data.order_number}
          </p>
          {data.delivery_note_number && (
            <p>
              <strong>Szállítólevél sorszám:</strong> {data.delivery_note_number}
            </p>
          )}
          <p>
            <strong>Ügyfél:</strong> {data.customer_name}
          </p>
          {data.title && (
            <p>
              <strong>Megnevezés:</strong> {data.title}
            </p>
          )}
          {data.delivery_started_at && (
            <p>
              <strong>Szállítás kezdete:</strong>{' '}
              {new Date(data.delivery_started_at).toLocaleString('hu-HU')}
            </p>
          )}
        </div>
      </Card>

      <Card title="Szállított tételek" style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <Button onClick={toggleAll} disabled={data.delivery_confirmed}>
            {confirmedItems.length === data.items.length ? 'Összes kijelölés törlése' : 'Összes kijelölése'}
          </Button>
          <span style={{ marginLeft: 16, color: '#666' }}>
            {confirmedItems.length} / {data.items.length} tétel kijelölve
          </span>
        </div>

        <Table
          dataSource={data.items}
          columns={columns}
          rowKey="id"
          pagination={false}
          bordered
        />

        {data.show_prices && (
          <div style={{ marginTop: 16, textAlign: 'right', fontSize: 16 }}>
            <strong>Összesen (nettó): </strong>
            <span style={{ fontSize: 18, color: '#1890ff' }}>
              {Math.round(data.items.reduce((sum, item) => {
                const netTotal = item.quantity * item.net_unit_price;
                const discount = netTotal * (item.discount_percent / 100);
                return sum + (netTotal - discount);
              }, 0)).toLocaleString('hu-HU')} Ft
            </span>
          </div>
        )}
      </Card>

      <Card title="Megjegyzés" style={{ marginBottom: 20 }}>
        <TextArea
          rows={4}
          placeholder="Itt adhat meg megjegyzést a szállítással kapcsolatban..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={data.delivery_confirmed}
        />
      </Card>

      {!data.delivery_confirmed && (
        <div style={{ textAlign: 'center' }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleConfirm}
            loading={submitting}
          >
            Szállítólevél visszaigazolása
          </Button>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button
          size="large"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
        >
          Nyomtatás
        </Button>
      </div>

      {data.contacts && data.contacts.length > 0 && (
        <Card title="Kapcsolattartók" style={{ marginTop: 20 }}>
          {data.contacts.map((contact, index) => (
            <div key={index} style={{ marginBottom: 8 }}>
              <strong>{contact.name}</strong>
              {contact.email && <span> - {contact.email}</span>}
              {contact.phone && <span> - {contact.phone}</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default PublicDelivery;
