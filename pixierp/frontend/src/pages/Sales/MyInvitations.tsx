import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, message, Input, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';

const MyInvitations: React.FC = () => {
  const navigate = useNavigate();
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
    { title: 'Ajánlatkérő/Megrendelések', dataIndex: 'quote_request_number', key: 'rfq', sorter: (a: any, b: any) => (a.quote_request_number || '').localeCompare(b.quote_request_number || '') },
    { title: 'Státusz', dataIndex: 'status', key: 'status', render: (s: string): React.ReactNode => <Tag>{s}</Tag>, sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || '') },
    { title: 'Meghívás ideje', dataIndex: 'created_at', key: 'created_at', render: (d: string): React.ReactNode => d ? new Date(d).toLocaleString('hu-HU') : '', sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || '') },
    { title: 'Műveletek', key: 'actions', render: (_: any, r: any): React.ReactNode => (
      <Space>
        <Tooltip title={
          <div style={{ fontSize: '12px' }}>
            <div><b>Cég:</b> {r.company_name} - {r.contact_names}</div>
            <div><b>Megnevezés:</b> {r.qr_title}</div>
            <div><b>Leírás:</b> {r.qr_description}</div>
            <div><b>Belső leírás:</b> {r.qr_internal_description}</div>
            <div><b>Tételek:</b> {r.item_count} db</div>
            <div><b>Keltezés:</b> {r.issue_date}</div>
            <div><b>Határidő:</b> {r.qr_deadline}</div>
          </div>
        }>
            <Button size="small" onClick={() => navigate(`/sales/rfqs/${r.quote_request}`)}>Megnyitás</Button>
        </Tooltip>
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
      <Table rowKey="id" loading={loading} columns={columns as any} dataSource={filtered} pagination={{ pageSize: 10 }} size="small" />
    </Card>
  );
};

export default MyInvitations;
