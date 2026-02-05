import React, { useEffect, useState } from 'react';
import { Table, Button, Badge, message, Tag, Space, Card, Typography, Popconfirm, Modal, Select, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import api from '../../services/api';
import moment from 'moment';

const { Title } = Typography;
const { Option } = Select;

interface Zone {
    id: number;
    name: string;
    zone_number: string;
}

interface KioskDevice {
    id: number;
    device_id: string;
    name: string;
    status: 'pending' | 'approved' | 'blocked';
    last_seen: string;
    ip_address?: string;
    zones: number[];
}

const AttendanceKiosk: React.FC = () => {
    const [devices, setDevices] = useState<KioskDevice[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Edit Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingDevice, setEditingDevice] = useState<KioskDevice | null>(null);
    const [selectedZones, setSelectedZones] = useState<number[]>([]);

    // Identify State
    const [identifyingIds, setIdentifyingIds] = useState<number[]>([]);

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
    
    const fetchZones = async () => {
        try {
            const res = await api.get('/zones/');
            if (res.data && Array.isArray(res.data.results)) {
                setZones(res.data.results);
            } else if (Array.isArray(res.data)) {
                setZones(res.data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchDevices();
        fetchZones();
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
    
    const handleEdit = (device: KioskDevice) => {
        setEditingDevice(device);
        setSelectedZones(device.zones || []);
        setIsModalVisible(true);
    };

    const handleIdentify = async (device: KioskDevice) => {
        const isIdentifying = identifyingIds.includes(device.id);
        const mode = isIdentifying ? 'stop' : 'start';
        
        try {
            await api.post(`/hr/kiosk-devices/${device.id}/identify/`, { mode });
            
            if (isIdentifying) {
                setIdentifyingIds(prev => prev.filter(id => id !== device.id));
                message.info('Azonosítás leállítva');
            } else {
                setIdentifyingIds(prev => [...prev, device.id]);
                message.success('Azonosítás elindítva');
            }
        } catch (e) {
            message.error('Sikertelen művelet');
        }
    };
    
    const handleSave = async () => {
        if (!editingDevice) return;
        try {
            await api.patch(`/hr/kiosk-devices/${editingDevice.id}/`, {
                zones: selectedZones
            });
            message.success('Beállítások mentve');
            setIsModalVisible(false);
            fetchDevices();
        } catch(e) {
            message.error('Mentés sikertelen');
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
            title: 'Zónák',
            dataIndex: 'zones',
            key: 'zones',
            render: (deviceZones: number[]) => {
                if (!deviceZones || deviceZones.length === 0) return <Tag>Nincs zóna</Tag>;
                
                const zoneNames = deviceZones.map(id => {
                    const zone = zones.find(z => z.id === id);
                    return zone ? `${zone.zone_number} - ${zone.name}` : `Ismeretlen (${id})`;
                }).join(', ');

                return (
                    <Tooltip title={zoneNames}>
                        <Tag color="blue">{deviceZones.length} zóna</Tag>
                    </Tooltip>
                );
            }
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
            render: (_: any, record: KioskDevice) => {
                const isIdentifying = identifyingIds.includes(record.id);
                return (
                    <Space>
                        <Button 
                            icon={<EyeOutlined />} 
                            onClick={() => handleIdentify(record)} 
                            title={isIdentifying ? "Azonosítás leállítása" : "Azonosítás Kioszkon"}
                            type={isIdentifying ? "primary" : "default"}
                            danger={isIdentifying}
                            className={isIdentifying ? "blink-button" : ""}
                        />
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
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
                );
            }
        }
    ];

    return (
        <Card title="Kiosk Eszközök Kezelése">
            <style>{`
                @keyframes blink {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                .blink-button {
                    animation: blink 1s linear infinite;
                }
            `}</style>
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
            
            <Modal
                title="Eszköz Beállítások"
                visible={isModalVisible}
                onOk={handleSave}
                onCancel={() => setIsModalVisible(false)}
            >
                {editingDevice && (
                    <div>
                        <div style={{marginBottom: 10}}>
                            <strong>Eszköz: </strong> {editingDevice.name || editingDevice.device_id}
                        </div>
                        <div style={{marginBottom: 5}}>Hozzárendelt zónák:</div>
                        <Select
                            mode="multiple"
                            style={{ width: '100%' }}
                            placeholder="Válassz zónákat"
                            value={selectedZones}
                            onChange={setSelectedZones}
                            optionFilterProp="children"
                        >
                            {zones.map(zone => (
                                <Option key={zone.id} value={zone.id}>
                                    {zone.zone_number} - {zone.name}
                                </Option>
                            ))}
                        </Select>
                        <div style={{marginTop: 5, color: '#888', fontSize: 12}}>
                            Csak a kiválasztott zónákhoz tartozó osztályok dolgozói használhatják ezt az eszközt.
                            Ha nincs kiválasztva zóna, az eszköz mindenki számára elérhető. 
                            (Logic: if zones.exists()) - wait, checks if zones exist. If no zones, what happens?
                        </div>
                    </div>
                )}
            </Modal>
        </Card>
    );
};

export default AttendanceKiosk;
