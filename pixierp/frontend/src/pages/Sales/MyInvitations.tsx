import React, { useEffect, useState } from 'react';
import { Card, Tag, Space, Button, message, Typography, Table, Descriptions, Collapse } from 'antd';
import { CheckOutlined, CloseOutlined, FolderOpenOutlined } from '@ant-design/icons';
import EnhancedTable from '../../components/EnhancedTable';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

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

  useEffect(() => {
    if (!query?.trim()) { setFiltered(rows); return; }
    const next = rows.filter(inv => deepSearchMatch(query, inv));
    setFiltered(next);
  }, [query, rows]);

  const columns = [
    {
      title: 'Ajánlat',
      key: 'rfq_info',
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.quote_request_number || `#${r.quote_request}`}</div>
          <div style={{ color: '#555' }}>{r.qr_title}</div>
          {r.company_name && <div style={{ fontSize: 12, color: '#888' }}>{r.company_name}{r.contact_names ? ` · ${r.contact_names}` : ''}</div>}
        </div>
      ),
      sorter: (a: any, b: any) => (a.quote_request_number || '').localeCompare(b.quote_request_number || ''),
    },
    {
      title: 'Leírás',
      key: 'description',
      render: (_: any, r: any) => (
        <div style={{ maxWidth: 320 }}>
          {r.qr_description
            ? <Paragraph ellipsis={{ rows: 2, expandable: true }} style={{ marginBottom: 0 }}>{r.qr_description}</Paragraph>
            : <Text type="secondary">—</Text>}
        </div>
      ),
    },
    {
      title: 'Tételek',
      key: 'items',
      render: (_: any, r: any) => {
        const items: any[] = r.items || [];
        if (!items.length) return <Text type="secondary">Nincs tétel</Text>;
        return (
          <Collapse ghost size="small" style={{ minWidth: 200 }}>
            <Panel header={<Text type="secondary" style={{ fontSize: 12 }}>{items.length} tétel (kattints)</Text>} key="1">
              <Table
                dataSource={items}
                rowKey="id"
                size="small"
                pagination={false}
                showHeader={false}
                columns={[
                  { dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
                  { dataIndex: 'quantity', key: 'qty', width: 60, render: (v: string, row: any) => <span style={{ fontSize: 12 }}>{v} {row.unit}</span> },
                  { dataIndex: 'net_unit_price', key: 'price', width: 100, align: 'right' as const, render: (v: string) => <span style={{ fontSize: 12 }}>{Number(v).toLocaleString('hu-HU')} Ft</span> },
                ]}
              />
            </Panel>
          </Collapse>
        );
      },
    },
    {
      title: 'Határidő / Keltezés',
      key: 'dates',
      width: 140,
      render: (_: any, r: any) => (
        <div style={{ fontSize: 12 }}>
          {r.qr_deadline && <div>Határidő: <b>{r.qr_deadline}</b></div>}
          {r.issue_date && <div>Keltezés: {r.issue_date}</div>}
          <div style={{ color: '#aaa' }}>{r.created_at ? new Date(r.created_at).toLocaleString('hu-HU') : ''}</div>
        </div>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 200,
      render: (_: any, r: any) => (
        <Space>
          <Button
            icon={<FolderOpenOutlined />}
            size="small"
            onClick={() => navigate(`/sales/rfqs/${r.quote_request}`)}
          >
            Megnyitás
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={async () => {
              try {
                await salesService.acceptInvitation(r.quote_request);
                message.success('Meghívás elfogadva');
                load();
              } catch {
                message.error('Nem sikerült elfogadni');
              }
            }}
          >
            Elfogad
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={async () => {
              try {
                await salesService.declineInvitation(r.quote_request);
                message.success('Meghívás elutasítva');
                load();
              } catch {
                message.error('Nem sikerült elutasítani');
              }
            }}
          >
            Elutasít
          </Button>
        </Space>
      ),
    },
  ] as any[];

  return (
    <Card title="Meghívásaim">
      <EnhancedTable
        tableKey="myInvitations"
        rowKey="id"
        loading={loading}
        columns={columns as any}
        dataSource={filtered}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Keresés (ajánlat száma, cím, cég)..."
        pagination={{ pageSize: 10 }}
        size="small"
        cardBreakpoint={600}
      />
    </Card>
  );
};

export default MyInvitations;

