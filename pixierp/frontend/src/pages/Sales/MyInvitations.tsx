import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, message, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';

const MyInvitations: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const data = await salesService.listMyInvitations('pending');
      setRows(data);
      setFiltered(data);
    } catch (e) {
      console.error('Error loading invitations:', e);
      message.error('Nem sikerült betölteni a meghívásokat');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Keresési logika
  const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  useEffect(() => {
    const q = normalize(query);
    if (!q) { setFiltered(rows); return; }
    const next = rows.filter(inv => {
      const hay = [
        inv.quote_request_number || '',
        inv.status || ''
      ].join(' \u0001 ');
      return normalize(hay).includes(q);
    });
    setFiltered(next);
  }, [query, rows]);

  const columns = [
    { title: 'Ajánlatkérő', dataIndex: 'quote_request_number', key: 'rfq', sorter: (a: any, b: any) => (a.quote_request_number || '').localeCompare(b.quote_request_number || '') },
    { title: 'Státusz', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s}</Tag>, sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || '') },
    { title: 'Meghívás ideje', dataIndex: 'created_at', key: 'created_at', render: (d: string) => d ? new Date(d).toLocaleString('hu-HU') : '', sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || '') },
    { title: 'Műveletek', key: 'actions', render: (_: any, r: any) => (
      <Space>
        <Button type="primary" size="small" onClick={async () => {
          try { await salesService.acceptInvitation(r.quote_request); message.success('Elfogadva'); load(); }
          catch { message.error('Nem sikerült elfogadni'); }
        }}>Elfogad</Button>
        <Button danger size="small" onClick={async () => {
          try { await salesService.declineInvitation(r.quote_request); message.success('Elutasítva'); load(); }
          catch { message.error('Nem sikerült elutasítani'); }
        }}>Elutasít</Button>
      </Space>
    ) },
  ] as any[];

  return (
    <Card title="Meghívásaim">
      <Input
        placeholder="Keresés (ajánlatkérő, státusz)..."
        prefix={<SearchOutlined />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
        allowClear
      />
      <Table rowKey="id" loading={loading} columns={columns as any} dataSource={filtered} pagination={{ pageSize: 10 }} />
    </Card>
  );
};

export default MyInvitations;
