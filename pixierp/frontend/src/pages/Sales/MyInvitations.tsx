import React, { useEffect, useState } from 'react';
import { Card, Space, Button, message, Typography, Table, Collapse, Select, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, FolderOpenOutlined } from '@ant-design/icons';
import EnhancedTable from '../../components/EnhancedTable';
import { salesService } from '../../services/salesService';
import { deepSearchMatch } from '../../utils/searchUtils';

const { Text, Paragraph } = Typography;

type InvitationFilter = 'new' | 'accepted' | 'declined' | 'active' | 'inactive';

const FINISHED_OR_HIGHER_STATUSES = new Set([
  'ready',
  'in_delivery',
  'delivered',
  'invoiced',
  'cancelled',
  'archived',
  'expired',
  'rejected',
]);

const isInvitationActive = (inv: any) => {
  const invitationStatus = String(inv?.status || '');
  const qrStatus = String(inv?.qr_status || '');

  if (invitationStatus === 'declined') return false;
  if (FINISHED_OR_HIGHER_STATUSES.has(qrStatus)) return false;
  return invitationStatus === 'pending' || invitationStatus === 'accepted';
};

const MyInvitations: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<InvitationFilter[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      const [pending, accepted, declined] = await Promise.all([
        salesService.listMyInvitations('pending'),
        salesService.listMyInvitations('accepted'),
        salesService.listMyInvitations('declined'),
      ]);
      const data = [...pending, ...accepted, ...declined].sort((a: any, b: any) => {
        const aa = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bb - aa;
      });
      setRows(data);
      setFiltered(data);
    } catch (e) {
      console.error('Error loading invitations:', e);
      message.error('Nem sikerült betölteni a meghívásokat');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let next = rows;

    if (statusFilters.length > 0) {
      next = next.filter((inv: any) => {
        const checks: Record<InvitationFilter, boolean> = {
          new: inv.status === 'pending',
          accepted: inv.status === 'accepted',
          declined: inv.status === 'declined',
          active: isInvitationActive(inv),
          inactive: !isInvitationActive(inv),
        };
        return statusFilters.some((f) => checks[f]);
      });
    }

    if (query?.trim()) {
      next = next.filter(inv => deepSearchMatch(query, inv));
    }

    setFiltered(next);
  }, [query, rows, statusFilters]);

  const columns = [
    {
      title: 'Ajánlat',
      key: 'rfq_info',
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.quote_request_slug || r.quote_request_number || `#${r.quote_request}`}</div>
          <div style={{ color: '#555' }}>{r.qr_title}</div>
          {r.company_name && <div style={{ fontSize: 12, color: '#888' }}>{r.company_name}{r.contact_names ? ` · ${r.contact_names}` : ''}</div>}
        </div>
      ),
      sorter: (a: any, b: any) => String(a.quote_request_slug || a.quote_request_number || '').localeCompare(String(b.quote_request_slug || b.quote_request_number || '')),
    },
    {
      title: 'Státusz',
      key: 'status',
      width: 170,
      render: (_: any, r: any) => {
        const invStatusMap: Record<string, { text: string; color: string }> = {
          pending: { text: 'Új', color: 'gold' },
          accepted: { text: 'Elfogadott', color: 'green' },
          declined: { text: 'Elutasított', color: 'red' },
        };
        const invStatus = invStatusMap[r.status] || { text: r.status || 'Ismeretlen', color: 'default' };
        const active = isInvitationActive(r);
        return (
          <Space size={4} wrap>
            <Tag color={invStatus.color}>{invStatus.text}</Tag>
            <Tag color={active ? 'blue' : 'default'}>{active ? 'Aktív' : 'Nem aktív'}</Tag>
          </Space>
        );
      },
      sorter: (a: any, b: any) => String(a.status || '').localeCompare(String(b.status || '')),
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
          <Collapse ghost size="small" style={{ minWidth: 200 }} items={[{
            key: '1',
            label: <Text type="secondary" style={{ fontSize: 12 }}>{items.length} tétel (kattints)</Text>,
            children: (
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
            ),
          }]} />
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
            onClick={() => {
              const slug = r.quote_request_slug || r.quote_request_number || r.quote_request;
              window.open(`/sales/rfqs/${slug}`, '_blank', 'noopener,noreferrer');
            }}
          >
            Megnyitás
          </Button>
          {r.status === 'pending' && (
            <>
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
            </>
          )}
        </Space>
      ),
    },
  ] as any[];

  return (
    <Card title="Meghívásaim">
      <Space style={{ marginBottom: 12 }} wrap>
        <Text type="secondary">Státusz szűrő:</Text>
        <Select<InvitationFilter[]>
          mode="multiple"
          allowClear
          style={{ minWidth: 360 }}
          placeholder="Válassz státuszt..."
          value={statusFilters}
          onChange={(vals) => setStatusFilters(vals)}
          options={[
            { value: 'new', label: 'Új' },
            { value: 'accepted', label: 'Elfogadott' },
            { value: 'declined', label: 'Elutasított' },
            { value: 'active', label: 'Aktív' },
            { value: 'inactive', label: 'Nem aktív' },
          ]}
        />
      </Space>
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

