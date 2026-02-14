import React, { useState, useEffect } from 'react';
import { Modal, Timeline, Tag, Spin, Empty, Typography } from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Text } = Typography;

interface ActivityLog {
  id: number;
  user_name: string;
  user_email: string;
  timestamp: string;
  timestamp_formatted: string;
  action: string;
  action_display: string;
  description: string;
}

interface ActivityLogModalProps {
  visible: boolean;
  onClose: () => void;
  objectType: 'quoterequest' | 'customerorder';
  objectId: number;
  objectTitle: string;
}

const actionColors: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  approve: 'cyan',
  reject: 'orange',
  cancel: 'volcano',
  send: 'purple',
  complete: 'geekblue',
  other: 'default',
};

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({
  visible,
  onClose,
  objectType,
  objectId,
  objectTitle,
}) => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (visible && objectId) {
      fetchLogs();
    }
  }, [visible, objectId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let endpoint = '';
      if (objectType === 'quoterequest') {
        endpoint = `/sales/quote-requests/${objectId}/activity_logs/`;
      } else if (objectType === 'customerorder') {
        endpoint = `/sales/customer-orders/${objectId}/activity_logs/`;
      }
      
      const response = await api.get(endpoint);
      setLogs(response.data);
    } catch (error) {
      console.error('Hiba a napló betöltésekor:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`Napló: ${objectTitle}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      ) : logs.length === 0 ? (
        <Empty description="Nincs naplóbejegyzés" />
      ) : (
        <Timeline
          mode="left"
          items={logs.map((log) => ({
            key: log.id,
            color: actionColors[log.action] === 'red' ? 'red' : 'blue',
            dot: <ClockCircleOutlined style={{ fontSize: '16px' }} />,
            children: (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>{log.timestamp_formatted}</Text>
                  <Tag
                    color={actionColors[log.action] || 'default'}
                    style={{ marginLeft: 8 }}
                  >
                    {log.action_display}
                  </Tag>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary">
                    {log.user_name}{' '}
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      ({log.user_email})
                    </Text>
                  </Text>
                </div>
                <div>
                  <Text>{log.description}</Text>
                </div>
              </div>
            ),
          }))}
        />
      )}
    </Modal>
  );
};

export default ActivityLogModal;
