import React, { useState, useEffect } from 'react';
import {
    Modal,
    Table,
    Button,
    Space,
    message,
    Popconfirm,
    Tag,
    Tooltip,
    Spin,
    Alert
} from 'antd';
import {
    IdcardOutlined,
    DeleteOutlined,
    ScanOutlined,
    UserOutlined,
    CreditCardOutlined,
    LockOutlined,
    SafetyOutlined
} from '@ant-design/icons';
import { hrService } from '../services/hrService';

interface AccessCredential {
    id: number;
    employee: number;
    credential_type: string;
    credential_data: string;
    is_synced: boolean;
    last_synced_at?: string;
    created_at: string;
}

interface AccessCredentialsModalProps {
    visible: boolean;
    onClose: () => void;
    employee: {
        id: number;
        full_name: string;
        employee_id: string;
    } | null;
}

const AccessCredentialsModal: React.FC<AccessCredentialsModalProps> = ({
    visible,
    onClose,
    employee
}) => {
    const [credentials, setCredentials] = useState<AccessCredential[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanningType, setScanningType] = useState<string | null>(null);

    useEffect(() => {
        if (visible && employee) {
            loadCredentials();
        }
    }, [visible, employee]);

    const loadCredentials = async () => {
        if (!employee) return;
        
        try {
            setLoading(true);
            const response = await hrService.getEmployeeCredentials(employee.id);
            setCredentials((response as any).results || response || []);
        } catch (err) {
            console.error('Error loading credentials:', err);
            message.error('Hiba az azonosítók betöltésekor');
        } finally {
            setLoading(false);
        }
    };

    const handleReadFromDevice = async (credentialType: string) => {
        if (!employee?.id) {
            message.error('Nincs kiválasztva dolgozó');
            return;
        }
        
        try {
            setScanning(true);
            setScanningType(credentialType);
            message.info(`${getCredentialTypeName(credentialType)} beolvasása...`);

            const response = await hrService.readFromDevice(credentialType, employee.id);
            
            if (response.success && response.credential_data) {
                // Automatikusan hozzuk létre az új azonosítót
                await handleCreateCredential(credentialType, response.credential_data);
                message.success(`${getCredentialTypeName(credentialType)} sikeresen beolvasva!`);
            } else {
                message.error(response.message || 'Nem sikerült beolvasni az azonosítót');
            }
        } catch (err: any) {
            console.error('Error reading from device:', err);
            message.error(err.response?.data?.message || 'Hiba a beolvasás során');
        } finally {
            setScanning(false);
            setScanningType(null);
        }
    };

    const handleCreateCredential = async (credentialType: string, credentialData: string) => {
        if (!employee) return;

        try {
            await hrService.createAccessCredential({
                employee: employee.id,
                credential_type: credentialType,
                credential_data: credentialData
            });
            await loadCredentials();
        } catch (err: any) {
            console.error('Error creating credential:', err);
            throw err;
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await hrService.deleteAccessCredential(id);
            message.success('Azonosító törölve');
            await loadCredentials();
        } catch (err) {
            console.error('Error deleting credential:', err);
            message.error('Hiba az azonosító törlésekor');
        }
    };

    const handleSync = async (id: number) => {
        try {
            await hrService.syncCredentialToDevice(id);
            message.success('Szinkronizálva az eszközzel');
            await loadCredentials();
        } catch (err: any) {
            console.error('Error syncing credential:', err);
            message.error(err.response?.data?.message || 'Hiba a szinkronizálás során');
        }
    };

    const getCredentialTypeName = (type: string): string => {
        const types: { [key: string]: string } = {
            'fingerprint': 'Ujjlenyomat',
            'face': 'Arc',
            'rfid': 'RFID kártya',
            'password': 'Jelszó/PIN'
        };
        return types[type] || type;
    };

    const getCredentialIcon = (type: string) => {
        const icons: { [key: string]: React.ReactNode } = {
            'fingerprint': <SafetyOutlined style={{ color: '#1890ff' }} />,
            'face': <UserOutlined style={{ color: '#52c41a' }} />,
            'rfid': <CreditCardOutlined style={{ color: '#faad14' }} />,
            'password': <LockOutlined style={{ color: '#722ed1' }} />
        };
        return icons[type] || <IdcardOutlined />;
    };

    const columns = [
        {
            title: 'Típus',
            dataIndex: 'credential_type',
            key: 'credential_type',
            render: (type: string) => (
                <Space>
                    {getCredentialIcon(type)}
                    <span>{getCredentialTypeName(type)}</span>
                </Space>
            ),
        },
        {
            title: 'Állapot',
            dataIndex: 'is_synced',
            key: 'is_synced',
            render: (is_synced: boolean) => (
                <Tag color={is_synced ? 'success' : 'warning'}>
                    {is_synced ? 'Szinkronizálva' : 'Nincs szinkronizálva'}
                </Tag>
            ),
        },
        {
            title: 'Létrehozva',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string) => new Date(date).toLocaleString('hu-HU'),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (_: any, record: AccessCredential) => (
                <Space size="small">
                    {!record.is_synced && (
                        <Tooltip title="Szinkronizálás az eszközzel">
                            <Button
                                size="small"
                                icon={<ScanOutlined />}
                                onClick={() => handleSync(record.id)}
                            >
                                Szinkronizálás
                            </Button>
                        </Tooltip>
                    )}
                    <Popconfirm
                        title="Biztosan törölni szeretné ezt az azonosítót?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Igen"
                        cancelText="Mégse"
                    >
                        <Button
                            size="small"
                            icon={<DeleteOutlined />}
                            danger
                        >
                            Törlés
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Modal
            title={
                <Space>
                    <IdcardOutlined />
                    <span>
                        Azonosítók - {employee?.full_name} ({employee?.employee_id})
                    </span>
                </Space>
            }
            open={visible}
            onCancel={onClose}
            width={900}
            footer={[
                <Button key="close" onClick={onClose}>
                    Bezárás
                </Button>
            ]}
        >
            {scanning && (
                <Alert
                    message={`${getCredentialTypeName(scanningType!)} beolvasása folyamatban...`}
                    description="Kérjük, helyezze az ujját/kártyáját az eszközre, vagy nézzen a kamerába."
                    type="info"
                    showIcon
                    icon={<Spin />}
                    style={{ marginBottom: 16 }}
                />
            )}

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Space wrap>
                    <Tooltip title="Ujjlenyomat beolvasása az eszközzel">
                        <Button
                            type="primary"
                            icon={<SafetyOutlined />}
                            onClick={() => handleReadFromDevice('fingerprint')}
                            loading={scanning && scanningType === 'fingerprint'}
                            disabled={scanning}
                        >
                            Ujjlenyomat beolvasás
                        </Button>
                    </Tooltip>
                    <Tooltip title="Arc beolvasása az eszközzel">
                        <Button
                            type="primary"
                            icon={<UserOutlined />}
                            onClick={() => handleReadFromDevice('face')}
                            loading={scanning && scanningType === 'face'}
                            disabled={scanning}
                            style={{ background: '#52c41a', borderColor: '#52c41a' }}
                        >
                            Arc beolvasás
                        </Button>
                    </Tooltip>
                    <Tooltip title="RFID kártya beolvasása az eszközzel">
                        <Button
                            type="primary"
                            icon={<CreditCardOutlined />}
                            onClick={() => handleReadFromDevice('rfid')}
                            loading={scanning && scanningType === 'rfid'}
                            disabled={scanning}
                            style={{ background: '#faad14', borderColor: '#faad14' }}
                        >
                            RFID beolvasás
                        </Button>
                    </Tooltip>
                </Space>

                <Table
                    columns={columns}
                    dataSource={credentials}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{
                        emptyText: 'Még nincs rögzített azonosító'
                    }}
                />
            </Space>
        </Modal>
    );
};

export default AccessCredentialsModal;
