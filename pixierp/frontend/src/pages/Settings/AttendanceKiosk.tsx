import React, { useEffect, useState } from 'react';
import { Table, Button, Badge, message, Tag, Space, Card, Typography, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import moment from 'moment';

const { Title } = Typography;

interface KioskDevice {
    id: number;
    device_id: string;
    name: string;
    status: 'pending' | 'approved' | 'blocked';
    last_seen: string;
    ip_address?: string;
}

const AttendanceKiosk: React.FC = () => {
    const [devices, setDevices] = useState<KioskDevice[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const res = await api.get('/hr/kiosk-devices/');
            // Handle pagination
            if (res.data && Array.isArray(res.data.results)) {
                setDevices(res.data.results);
            } else if (Array.isArray(res.data)) {
                setDevices(res.data);
            } else {
                 setDevices([]);
            }
        } catch (err) {
            message.error('Sikertelen betöltés');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
        // Poll for new devices
        const interval = setInterval(fetchDevices, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async (id: number) => {
        try {
            await api.post(`/hr/kiosk-devices/${id}/approve/`);
            message.success('Eszköz engedélyezve');
            fetchDevices();
        } catch (err) {
            message.error('Hiba történt');
        }
    };

    const handleBlock = async (id: number) => {
        try {
            await api.post(`/hr/kiosk-devices/${id}/block/`);
            message.success('Eszköz letiltva');
            fetchDevices();
        } catch (err) {
            message.error('Hiba történt');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/hr/kiosk-devices/${id}/`);
            message.success('Eszköz törölve');
            fetchDevices();
        } catch (err) {
            message.error('Hiba történt törléskor');
        }
    };

    const columns = [
        {
            title: 'Eszköz Azonosító',
            dataIndex: 'device_id',
            key: 'device_id',
            render: (text: string) => <Typography.Text copyable>{text}</Typography.Text>,
        },
        {
            title: 'IP Cím',
            dataIndex: 'ip_address',
            key: 'ip_address',
        },
        {
            title: 'Állapot',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'default';
                let text = status;
                if (status === 'approved') { color = 'success'; text = 'Engedélyezve'; }
                if (status === 'pending') { color = 'warning'; text = 'Függőben'; }
                if (status === 'blocked') { color = 'error'; text = 'Letiltva'; }
                return <Tag color={color}>{text}</Tag>;
            }
        },
        {
            title: 'Utolsó Aktivitás',
            dataIndex: 'last_seen',
            key: 'last_seen',
            render: (val: string) => val ? moment(val).format('YYYY-MM-DD HH:mm:ss') : '-'
        },
        {
            title: 'Műveletek',
            key: 'action',
            render: (_: any, record: KioskDevice) => (
                <Space>
                    <Popconfirm
                        title="Biztosan törölni szeretnéd?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button icon={<DeleteOutlined />} type="text" danger />
                    </Popconfirm>
                    {record.status !== 'approved' && (
                        <Button type="primary" onClick={() => handleApprove(record.id)}>
                            Engedélyez
                        </Button>
                    )}
                    {record.status === 'approved' && (
                        <Button danger onClick={() => handleBlock(record.id)}>
                            Letilt
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <Card title="Kiosk Eszközök Kezelése">
            <div>
                 <p>Itt kezelheted a csatlakoztatott kiosk eszközöket. A <b>erp.pixisys.eu/kiosk</b> oldalon megjelenő azonosítót ellenőrizd itt.</p>
            </div>
            <Table 
                dataSource={devices} 
                columns={columns} 
                rowKey="id" 
                loading={loading}
                pagination={false}
            />
        </Card>
    );
};

export default AttendanceKiosk;
