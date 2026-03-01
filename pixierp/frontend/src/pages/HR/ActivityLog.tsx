import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import {
  Table,
  Select,
  DatePicker,
  Card,
  Space,
  Tag,
  Button,
  Row,
  Col,
  message
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs, { Dayjs } from 'dayjs';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';

const { RangePicker } = DatePicker;

interface ActivityLog {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  timestamp: string;
  timestamp_formatted: string;
  action: string;
  action_display: string;
  description: string;
  content_type: number | null;
  content_type_name: string | null;
  object_id: number | null;
  ip_address: string | null;
}

interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
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

const ActivityLogPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/hr/employees/', {
        params: { page_size: 1000 }
      });
      
      const employees = response.data.results || response.data;
      
      // Transform employee data to user format for the dropdown
      const usersData = employees.map((emp: any) => ({
        id: emp.user,
        username: emp.user_username || '',
        first_name: emp.user_first_name || '',
        last_name: emp.user_last_name || '',
        email: emp.user_email || '',
      }));
      
      setUsers(usersData);
    } catch (error: any) {
      console.error('Hiba a felhasználók betöltésekor:', error);
      message.error('Nem sikerült betölteni a felhasználókat');
    }
  };

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        page_size: pagination.pageSize,
      };

      if (searchText) {
        params.search = searchText;
      }

      if (selectedUserId) {
        params.user_id = selectedUserId;
      }

      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await api.get('/activity-logs/', { params });
      
      const results = response.data.results || response.data;
      setLogs(results);
      
      if (response.data.count !== undefined) {
        setPagination(prev => ({
          ...prev,
          current: page,
          total: response.data.count,
        }));
      }
    } catch (error: any) {
      console.error('Hiba a naplók betöltésekor:', error);
      message.error('Nem sikerült betölteni a tevékenységeket');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleReset = () => {
    setSearchText('');
    setSelectedUserId(undefined);
    setDateRange(null);
    setPagination(prev => ({ ...prev, current: 1 }));
    // Delay fetch to allow state to update
    setTimeout(() => fetchLogs(1), 0);
  };

  const handleTableChange = (pagination: any) => {
    fetchLogs(pagination.current);
  };

  const columns = [
    {
      title: 'Időpont',
      dataIndex: 'timestamp_formatted',
      key: 'timestamp',
      width: 180,
      sorter: true,
    },
    {
      title: 'Alkalmazott',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 200,
      render: (text: string, record: ActivityLog) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{record.user_email}</div>
        </div>
      ),
    },
    {
      title: 'Művelet',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string, record: ActivityLog) => (
        <Tag color={actionColors[action] || 'default'}>
          {record.action_display}
        </Tag>
      ),
    },
    {
      title: 'Tevékenység',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={<UnifiedQuickSearchHeader
          title="Tevékenység napló"
          actions={<Space className="pixi-unified-card-actions">
            <Button type="primary" onClick={handleSearch} icon={<SearchOutlined />}>
              Keresés
            </Button>
            <Button onClick={handleReset} icon={<ReloadOutlined />}>
              Alaphelyzet
            </Button>
          </Space>}
        />}
      >
        
        <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <RangePicker
                style={{ width: '100%' }}
                placeholder={['Dátum-tól', 'Dátum-ig']}
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                format="YYYY-MM-DD"
              />
            </Col>
            <Col span={8}>
              <Select
                style={{ width: '100%' }}
                placeholder="Válassz alkalmazottat"
                allowClear
                showSearch
                value={selectedUserId}
                onChange={(value) => setSelectedUserId(value)}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={[
                  { value: undefined, label: 'Minden alkalmazott' },
                  ...users.map(user => ({
                    value: user.id,
                    label: `${user.last_name} ${user.first_name} (${user.username})`,
                  })),
                ]}
              />
            </Col>
          </Row>
        </Space>

        <EnhancedTable
          tableKey="activityLog"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Keresés leírásban..."
          columns={columns}
          dataSource={logs}
          loading={loading}
          rowKey="id"
          pagination={pagination}
          onChange={handleTableChange}
          cardBreakpoint={620}
        />
      </Card>
    </div>
  );
};

export default ActivityLogPage;
