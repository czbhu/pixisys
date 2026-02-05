import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Input, Select, Modal, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs from 'dayjs';

const { Option } = Select;

const Approvals: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string[]>(['pending', 'rejected']);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [rejectNote, setRejectNote] = useState('');

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            const response = await api.get('/sales/approval-requests/');
            const list = response.data.results || response.data;
            setData(Array.isArray(list) ? list : []);
        } catch (error) {
            message.error('Hiba a kérelmek betöltésekor');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApprovals();
    }, []);

    const handleApprove = async (id: number) => {
        try {
            await api.post(`/sales/approval-requests/${id}/approve/`);
            message.success('Jóváhagyva');
            fetchApprovals();
        } catch (error) {
            message.error('Hiba a jóváhagyás során');
        }
    };

    const handleReject = async () => {
        if (!selectedRequest) return;
        try {
            await api.post(`/sales/approval-requests/${selectedRequest.id}/reject/`, { note: rejectNote });
            message.success('Visszaküldve');
            setRejectModalOpen(false);
            setRejectNote('');
            fetchApprovals();
        } catch (error) {
            message.error('Hiba a visszaküldés során');
        }
    };

    const filteredData = data.filter((item: any) => {
        if (statusFilter.includes('all')) return true;
        if (statusFilter.length > 0) {
            if (!statusFilter.includes(item.status)) return false;
        }
        return true;
    });

    const columns = [
        {
            title: 'Dátum',
            dataIndex: 'created_at',
            render: (text: string) => dayjs(text).format('YYYY.MM.DD HH:mm')
        },
        {
            title: 'Kitől',
            dataIndex: 'username',
            render: (text: string, record: any) => record.full_name || text
        },
        {
            title: 'Megrendelés szám',
            dataIndex: 'order_number',
        },
        {
            title: 'Tétel neve',
            dataIndex: 'description', // Project/Quote Title
            render: (text: string) => <span style={{fontWeight: 500}}>{text}</span>
        },
        {
            title: 'Cikkszám',
            dataIndex: 'internal_description', 
            render: (text: string, record: any) => (
                <Tooltip title={
                    <div>
                        <div>Belső leírás: {text || '-'}</div>
                        {/* Assuming notes is available or relevant */}
                    </div>
                }>
                    <span>{text ? (text.length > 15 ? text.substring(0, 15) + '...' : text) : '-'}</span>
                </Tooltip>
            )
        },
        {
            title: 'Mi változott?',
            render: (_: any, record: any) => (
                <span>
                    {record.previous_status} <span style={{color: '#999'}}>→</span> <b>{record.requested_status}</b>
                </span>
            )
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            render: (status: string) => {
                const map: any = {
                    pending: { color: 'orange', text: 'Jóváhagyásra vár' },
                    approved: { color: 'green', text: 'Jóváhagyva' },
                    rejected: { color: 'red', text: 'Visszaküldve' }
                };
                return <Tag color={map[status]?.color}>{map[status]?.text}</Tag>;
            }
        },
        {
            title: 'Művelet',
            render: (_: any, record: any) => (
                <Space>
                    {record.status === 'pending' && (
                        <>
                            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>Jóváhagy</Button>
                            <Button danger size="small" icon={<CloseOutlined />} onClick={() => {
                                setSelectedRequest(record);
                                setRejectModalOpen(true);
                            }}>Visszaküld</Button>
                        </>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: 24, background: 'white', minHeight: '100%' }}>
            <h1 style={{fontSize: 24, marginBottom: 24}}>Jóváhagyások</h1>
            <div style={{ marginBottom: 16 }}>
                <Space>
                    <Select
                        mode="multiple"
                        style={{ width: 400 }}
                        placeholder="Státusz szűrés"
                        value={statusFilter}
                        onChange={setStatusFilter}
                    >
                        <Option value="pending">Jóváhagyásra vár</Option>
                        <Option value="rejected">Visszaküldve</Option>
                        <Option value="approved">Jóváhagyva</Option>
                        <Option value="all">Mind</Option>
                    </Select>
                    <Button onClick={fetchApprovals} icon={<SearchOutlined />}>Frissítés</Button>
                </Space>
            </div>
            
            <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
            />

            <Modal
                title="Visszaküldés oka"
                open={rejectModalOpen}
                onOk={handleReject}
                onCancel={() => setRejectModalOpen(false)}
            >
                <Input.TextArea 
                    rows={4} 
                    value={rejectNote} 
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Írja le a visszaküldés okát..."
                />
            </Modal>
        </div>
    );
};

export default Approvals;
