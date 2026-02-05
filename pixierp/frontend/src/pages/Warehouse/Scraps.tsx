import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, message, Tag, Space, DatePicker, Input } from 'antd';
import { PlusOutlined, EyeOutlined, CheckOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Search } = Input;

interface ScrapRecord {
  id: number;
  scrap_date: string;
  scrap_number: string;
  reason: string;
  images: string[];
  total_cost_value: number;
  total_selling_value: number;
  currency: string;
  is_approved: boolean;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  notes: string;
  items_count: number;
  materials_summary: string;
  created_at: string;
  created_by: number;
  created_by_name: string;
}

const Scraps: React.FC = () => {
  const [scraps, setScraps] = useState<ScrapRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedScrap, setSelectedScrap] = useState<ScrapRecord | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchScraps();
  }, [dateRange, searchText]);

  const fetchScraps = async () => {
    try {
      setLoading(true);
      let url = '/warehouse/scrap-records/';
      const params = new URLSearchParams();

      if (dateRange) {
        params.append('date_from', dateRange[0]);
        params.append('date_to', dateRange[1]);
      }
      if (searchText) {
        params.append('search', searchText);
      }

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      const response = await api.get(url);
      // DRF pagination esetén a response.data.results tartalmazza a tömböt
      const data = response.data.results || response.data;
      setScraps(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a betöltés során');
      console.error(error);
      setScraps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (scrap: ScrapRecord) => {
    setSelectedScrap(scrap);
    setDetailModalVisible(true);
  };

  const handleApprove = async (scrapId: number) => {
    try {
      await api.post(`/warehouse/scrap-records/${scrapId}/approve/`);
      message.success('Selejtezés jóváhagyva');
      fetchScraps();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a jóváhagyás során');
      console.error(error);
    }
  };

  const columns = [
    {
      title: 'Dátum',
      dataIndex: 'scrap_date',
      key: 'scrap_date',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: 'Selejtezési szám',
      dataIndex: 'scrap_number',
      key: 'scrap_number',
      width: 180,
    },
    {
      title: 'Rögzítette',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 150,
    },
    {
      title: 'Selejtezett termékek',
      dataIndex: 'materials_summary',
      key: 'materials_summary',
      ellipsis: true,
    },
    {
      title: 'Beszerzési érték',
      key: 'cost_value',
      width: 150,
      render: (_: any, record: ScrapRecord) => 
        `${record.total_cost_value.toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Eladási érték',
      key: 'selling_value',
      width: 150,
      render: (_: any, record: ScrapRecord) => 
        `${record.total_selling_value.toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Státusz',
      key: 'status',
      width: 120,
      render: (_: any, record: ScrapRecord) => (
        <Tag color={record.is_approved ? 'green' : 'orange'}>
          {record.is_approved ? 'Jóváhagyva' : 'Függőben'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: ScrapRecord) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            Részletek
          </Button>
          {!record.is_approved && (
            <Button
              type="link"
              icon={<CheckOutlined />}
              onClick={() => handleApprove(record.id)}
              style={{ color: 'green' }}
            >
              Jóváhagy
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, flex: 1 }}>
          <RangePicker
            style={{ width: 300 }}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([
                  dates[0].format('YYYY-MM-DD'),
                  dates[1].format('YYYY-MM-DD')
                ]);
              } else {
                setDateRange(null);
              }
            }}
            placeholder={['Dátum -tól', 'Dátum -ig']}
          />
          <Search
            placeholder="Keresés selejtezési szám vagy indok alapján"
            onSearch={setSearchText}
            onChange={(e) => {
              if (!e.target.value) {
                setSearchText('');
              }
            }}
            style={{ width: 400 }}
            allowClear
          />
        </div>
      </div>

      <Table
        size="small"
        columns={columns}
        dataSource={scraps}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20 }}
      />

      {/* Részletek Modal */}
      <Modal
        title={`Selejtezési jegyzőkönyv: ${selectedScrap?.scrap_number || ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Bezárás
          </Button>
        ]}
        width={800}
      >
        {selectedScrap && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <strong>Dátum:</strong> {dayjs(selectedScrap.scrap_date).format('YYYY-MM-DD')}
            </div>
            <div style={{ marginBottom: 16 }}>
              <strong>Rögzítette:</strong> {selectedScrap.created_by_name} ({dayjs(selectedScrap.created_at).format('YYYY-MM-DD HH:mm')})
            </div>
            {selectedScrap.is_approved && (
              <div style={{ marginBottom: 16 }}>
                <strong>Jóváhagyta:</strong> {selectedScrap.approved_by_name} ({dayjs(selectedScrap.approved_at).format('YYYY-MM-DD HH:mm')})
              </div>
            )}
            
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <h4>Indoklás:</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedScrap.reason}</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4>Selejtezett termékek:</h4>
              <p>{selectedScrap.materials_summary}</p>
            </div>

            <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <strong>Beszerzési érték:</strong>
                <div style={{ fontSize: 20, color: '#cf1322' }}>
                  {selectedScrap.total_cost_value.toLocaleString()} {selectedScrap.currency}
                </div>
              </div>
              <div>
                <strong>Eladási érték:</strong>
                <div style={{ fontSize: 20, color: '#cf1322' }}>
                  {selectedScrap.total_selling_value.toLocaleString()} {selectedScrap.currency}
                </div>
              </div>
            </div>

            {selectedScrap.images && selectedScrap.images.length > 0 && (
              <div>
                <h4>Fotók:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {selectedScrap.images.map((img, index) => (
                    <img
                      key={index}
                      src={`/media/scrap_images/${img}`}
                      alt={`Selejtezett termék ${index + 1}`}
                      style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                      onClick={() => window.open(`/media/scrap_images/${img}`, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedScrap.notes && (
              <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                <strong>Megjegyzés:</strong>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{selectedScrap.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Scraps;
