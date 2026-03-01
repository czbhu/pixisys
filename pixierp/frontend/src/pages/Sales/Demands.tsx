import React, { useEffect, useState } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Modal, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { useAuth } from '../../contexts/AuthContext';

const Demands: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [deletedList, setDeletedList] = useState<any[]>([]);
  const [selectedDeleted, setSelectedDeleted] = useState<React.Key[]>([]);
  const { user } = useAuth();
  const [myPendingIds, setMyPendingIds] = useState<Set<number>>(new Set());

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await salesService.getOpenDemands();
      const list = (res.results ?? res) as any[];
      setRows(list);
    } catch (e) {
      setError('Hiba történt a nyitott ajánlatkérők betöltésekor');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const invs = await salesService.listMyInvitations('pending');
        const ids = new Set((invs || []).map((i: any) => i.quote_request));
        setMyPendingIds(ids);
      } catch {}
    })();
  }, []);

  const loadDeleted = async () => {
    try {
      const res = await salesService.listDeletedQuoteRequests();
      const list = (res.results ?? res) as any[];
      // Only demands (no items)
      setDeletedList(list.filter((r: any) => (r.items || []).length === 0));
    } catch {
      message.error('Nem sikerült betölteni a törölt ajánlatkérőket');
    }
  };

  const columns = [
    { title: 'Szám', dataIndex: 'number', key: 'number' },
    { title: 'Cím', dataIndex: 'title', key: 'title' },
    { title: 'Cég', key: 'company', render: (_: any, r: any): React.ReactNode => r.company?.name || '-' },
    { title: 'Felelős', key: 'owner', render: (_: any, r: any): React.ReactNode => r.owner_name || '-' },
    { title: 'Résztvevők', key: 'assignees', render: (_: any, r: any): React.ReactNode => r.assignee_names || '-' },
    { title: 'Státusz', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s === 'new' ? 'Új' : s}</Tag> },
    { title: 'Határidő', dataIndex: 'deadline', key: 'deadline', render: (d: string) => d ? new Date(d).toLocaleDateString('hu-HU') : '' },
    { title: 'Műveletek', key: 'actions', render: (r: any) => (
      <Space size="small">
        <Button icon={<EditOutlined />} size="small" onClick={() => navigate(`/sales/rfqs/${r.id}`)}>Megnyitás</Button>
        {myPendingIds.has(r.id) && (
          <Tooltip title="Meghívás elfogadása (Beszállok)"><Button size="small" type="primary" onClick={async () => {
            try { await salesService.acceptInvitation(r.id); message.success('Meghívás elfogadva'); load(); }
            catch { message.error('Nem sikerült elfogadni'); }
          }}>Elfogad</Button></Tooltip>
        )}
        <Button type="primary" size="small" onClick={async () => {
          try { const q = await salesService.createQuoteFromRfq(r.id); message.success(`Ajánlat létrehozva: ${q.quote_number}`); navigate(`/sales/quotes/${q.id}`); }
          catch (e: any) { message.error(e?.response?.data?.error || 'Nem sikerült ajánlatot készíteni'); }
        }}>Készíts ajánlatot</Button>
        <Popconfirm title="Ajánlat törlése (visszaállítható)?" okText="Törlés" cancelText="Mégse" onConfirm={async () => {
          try { await salesService.softDeleteQuoteRequest(r.id); message.success('Megjelölve töröltként'); load(); }
          catch { message.error('Nem sikerült törölni'); }
        }}>
          <Button icon={<DeleteOutlined />} danger size="small">Törlés</Button>
        </Popconfirm>
      </Space>
    )},
  ] as any[];

  if (loading) return (<div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>);

  return (
    <div>
      <Card title="Nyitott ajánlatkérők" extra={<Space>
        <Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>
        <Button icon={<PlusOutlined />} onClick={async () => {
          try { const created = await salesService.createDemand({}); message.success(`Új ajánlatkérő: ${created.number}`); navigate(`/sales/rfqs/${created.id}`); }
          catch (e: any) { message.error(e?.response?.data?.error || 'Nem sikerült létrehozni az ajánlatkérőt'); }
        }}>Új ajánlatkérő</Button>
        <Button onClick={async () => { await loadDeleted(); setDeletedOpen(true); }}>Törölt ajánlatkérők</Button>
      </Space>}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
        <EnhancedTable tableKey="demands" rowKey="id" columns={columns as any} dataSource={rows} pagination={{ pageSize: 10 }} cardBreakpoint={800} />
      </Card>

      <Modal
        title="Törölt ajánlatkérők kezelése"
        open={deletedOpen}
        onCancel={() => { setDeletedOpen(false); setSelectedDeleted([]); }}
        footer={<Space>
          <Button onClick={() => loadDeleted()}>Frissítés</Button>
          <Popconfirm title="Biztosan véglegesen törlöd a kijelölteket?" okText="Igen" cancelText="Mégse" onConfirm={async () => {
            try {
              for (const id of selectedDeleted) { await salesService.purgeQuoteRequest(Number(id)); }
              message.success('Véglegesen törölve');
              await loadDeleted();
              setSelectedDeleted([]);
            } catch { message.error('Nem sikerült véglegesen törölni'); }
          }}>
            <Button danger>Végleges törlés</Button>
          </Popconfirm>
          <Button type="primary" onClick={async () => {
            try {
              for (const id of selectedDeleted) { await salesService.restoreQuoteRequest(Number(id)); }
              message.success('Visszaállítva');
              await loadDeleted();
              setSelectedDeleted([]);
              load();
            } catch { message.error('Nem sikerült visszaállítani'); }
          }}>Visszahelyezés</Button>
        </Space>}
        width={900}
      >
        <Table
          rowKey="id"
          rowSelection={{ selectedRowKeys: selectedDeleted, onChange: setSelectedDeleted }}
          columns={[
            { title: 'Szám', dataIndex: 'number' },
            { title: 'Cím', dataIndex: 'title' },
            { title: 'Cég', render: (_: any, r: any): React.ReactNode => r.company?.name || '-' },
            { title: 'Törölte', dataIndex: 'updated_at', render: (d: string) => d ? new Date(d).toLocaleString('hu-HU') : '' },
          ] as any}
          dataSource={deletedList}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default Demands;
