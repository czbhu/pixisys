import React, { useState, useEffect } from 'react';
import { Modal, Table, Tag, Spin, Empty, Tooltip } from 'antd';
import dayjs from 'dayjs';
import api from '../services/api';

interface TimelineEvent {
  timestamp: string | null;
  who_role: string;
  who_name: string;
  what: string;
  category: string;
  meta?: { changes?: Record<string, { old: any; new: any }> };
}

interface ActivityLogModalProps {
  visible: boolean;
  onClose: () => void;
  objectType: 'quoterequest' | 'customerorder';
  objectId: number;
  objectTitle: string;
}

const categoryColors: Record<string, string> = {
  rfq: 'blue',
  log: 'default',
  email: 'purple',
  order: 'cyan',
  production: 'orange',
  ready: 'green',
  delivery: 'geekblue',
  delivered: 'geekblue',
  delivery_note: 'geekblue',
  delivery_confirmed: 'green',
  invoice: 'gold',
  cost_item: 'volcano',
};

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({
  visible,
  onClose,
  objectType,
  objectId,
  objectTitle,
}) => {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    if (visible && objectId) {
      fetchTimeline();
    }
  }, [visible, objectId]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const endpoint = objectType === 'quoterequest'
        ? `/sales/quote-requests/${objectId}/timeline/`
        : `/sales/customer-orders/${objectId}/activity_logs/`;
      const response = await api.get(endpoint);
      setEvents(response.data);
    } catch (error) {
      console.error('Hiba a napló betöltésekor:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Időpont',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (ts: string | null) =>
        ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: 'Beosztás',
      dataIndex: 'who_role',
      key: 'who_role',
      width: 160,
      render: (role: string) => role || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Ki csinálta?',
      dataIndex: 'who_name',
      key: 'who_name',
      width: 160,
      render: (name: string) => name || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Mit csinált?',
      dataIndex: 'what',
      key: 'what',
      render: (what: string, record: TimelineEvent) => {
        const changes = record.meta?.changes;
        const hasChanges = changes && Object.keys(changes).length > 0;
        const label = (
          record.category === 'rfq' ? 'Létrehozás' :
          record.category === 'email' ? 'E-mail' :
          record.category === 'order' ? 'Megrendelés' :
          record.category === 'production' ? 'Gyártás' :
          record.category === 'ready' ? 'Kész' :
          record.category === 'delivery' || record.category === 'delivered' ? 'Szállítás' :
          record.category === 'delivery_note' ? 'Szállítólevél' :
          record.category === 'delivery_confirmed' ? 'Visszaigazolás' :
          record.category === 'invoice' ? 'Számla' :
          record.category === 'cost_item' ? 'Gyártási tétel' :
          record.category === 'log' ? 'Napló' : record.category
        );
        const tag = <Tag color={categoryColors[record.category] || 'default'} style={{ marginRight: 6 }}>{label}</Tag>;
        if (!hasChanges) return <span>{tag}{what}</span>;
        const tooltipContent = (
          <div>
            {Object.entries(changes!).map(([field, { old: oldVal, new: newVal }]) => (
              <div key={field}>
                <b>{field}:</b> {String(oldVal) || '–'} → {String(newVal) || '–'}
              </div>
            ))}
          </div>
        );
        return (
          <span>
            {tag}
            <Tooltip title={tooltipContent}>
              <span style={{ borderBottom: '1px dashed #aaa', cursor: 'help' }}>{what}</span>
            </Tooltip>
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      title={`Napló: ${objectTitle}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={960}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      ) : events.length === 0 ? (
        <Empty description="Nincs naplóbejegyzés" />
      ) : (
        <Table
          dataSource={events}
          columns={columns}
          rowKey={(r, i) => `${r.timestamp}-${i}`}
          size="small"
          pagination={false}
          scroll={{ y: 520 }}
        />
      )}
    </Modal>
  );
};

export default ActivityLogModal;
