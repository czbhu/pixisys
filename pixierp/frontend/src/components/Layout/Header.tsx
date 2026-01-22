import React, { useState, useEffect } from 'react';
import { Layout, Dropdown, Avatar, Button, Space, message, Modal, Typography, Badge } from 'antd';
import { UserOutlined, LogoutOutlined, MenuOutlined, ClockCircleOutlined, QrcodeOutlined, LoginOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { TimerModal } from '../WorkLog/TimerModal';
import QRScannerModal from '../QRScannerModal';
import AttendanceQRModal from '../AttendanceQRModal';
import api from '../../services/api';

const { Header: AntHeader } = Layout;

interface HeaderProps {
    onMenuClick?: () => void;
    isMobile?: boolean;
    inviteCount?: number;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobile = false, inviteCount = 0 }) => {
    const { user, logout } = useAuth();
    const { activeLog, elapsedSeconds, setModalOpen } = useTimeTracker();
    const [qrModalOpen, setQrModalOpen] = useState(false);
    
    // Attendance state
    const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
    const [personalQrModalOpen, setPersonalQrModalOpen] = useState(false);
    const [attendanceStatus, setAttendanceStatus] = useState<{is_clocked_in: boolean, check_in: string | null, check_out: string | null} | null>(null);

    // Load attendance status on mobile
    useEffect(() => {
        if (isMobile) {
            checkAttendanceStatus();
        }
    }, [isMobile]);

    const checkAttendanceStatus = async () => {
        try {
            const { data } = await api.get('/hr/attendances/status/');
            setAttendanceStatus(data);
        } catch (error) {
            console.error("Attendance check failed", error);
        }
    };

    const handleInitiateAttendance = async () => {
        // Open the Personal QR Code Modal
        setPersonalQrModalOpen(true);
    };

    const handleAttendanceScan = async (code: string) => {
        try {
             // Debug log
             console.log("Scanning code:", code);
             const { data } = await api.post('/hr/attendances/scan/', { qr_code: code });
             message.success(data.message);
             setAttendanceModalOpen(false);
             checkAttendanceStatus(); // Refresh status
        } catch (error: any) {
             const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Hiba történt a beolvasáskor';
             // Show error modal with the scanned code for debugging
             console.error("Scan error:", error);
             Modal.error({
                 title: 'Beolvasási Hiba',
                 content: (
                     <div>
                         <p style={{ color: 'red', fontWeight: 'bold' }}>{errorMsg}</p>
                         <p>Beolvasott adat:</p>
                         <Typography.Paragraph copyable code style={{ maxWidth: '100%' }}>
                            {code}
                         </Typography.Paragraph>
                     </div>
                 )
             });
        }
    };

    const userMenuItems = [
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Kijelentkezés',
            danger: true,
        },
    ];

    const handleUserMenuClick = ({ key }: { key: string }) => {
        if (key === 'logout') {
            logout();
        }
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <AntHeader style={{
            padding: isMobile ? '0 12px' : '0 16px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            height: isMobile ? 48 : 48,
            lineHeight: isMobile ? '48px' : '48px'
        }}>
             <TimerModal />
             <QRScannerModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} isMobile={isMobile} />
             <QRScannerModal 
                open={attendanceModalOpen} 
                onClose={() => setAttendanceModalOpen(false)} 
                isMobile={isMobile}
                onScan={handleAttendanceScan}
                onRefresh={handleInitiateAttendance}
                title={attendanceStatus?.is_clocked_in 
                    ? "Kiléptetéshez kérlek scanneld le a QR kódot!" 
                    : "Beléptetéshez kérlek scanneld le a QR kódot!"
                }
             />
             <AttendanceQRModal 
                open={personalQrModalOpen}
                onClose={() => setPersonalQrModalOpen(false)}
             />

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {isMobile && (
                    <Badge count={inviteCount} size="small" offset={[0, 5]}>
                        <Button 
                            type="text" 
                            icon={<MenuOutlined />} 
                            onClick={onMenuClick}
                            style={{ fontSize: 18 }}
                        />
                    </Badge>
                )}
                <h2 style={{ 
                    margin: 0, 
                    color: '#1890ff',
                    fontSize: isMobile ? 16 : 18,
                    lineHeight: isMobile ? '48px' : '48px'
                }}>
                    {isMobile ? 'PixiERP' : `PixiERP Dashboard ${process.env.REACT_APP_VERSION || 'dev'}`}
                </h2>
            </div>

            <Space>
                <Button 
                    type="text" 
                    icon={<QrcodeOutlined />} 
                    onClick={() => setQrModalOpen(true)}
                    title="QR Kód Beolvasás"
                >
                    {!isMobile && 'QR Kód'}
                </Button>
                {isMobile && (
                    <Button 
                        type="text" 
                        icon={attendanceStatus?.is_clocked_in ? <LogoutOutlined /> : <LoginOutlined />} 
                        onClick={handleInitiateAttendance}
                        title={attendanceStatus?.is_clocked_in ? "Kilépés" : "Belépés"}
                        style={{ color: attendanceStatus?.is_clocked_in ? '#cf1322' : '#389e0d' }}
                    >
                        {/* {attendanceStatus?.is_clocked_in ? 'Kilépés' : 'Belépés'} */}
                    </Button>
                )}
                <div 
                    onClick={() => setModalOpen(true)} 
                    style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'flex-end', 
                        marginRight: 16, 
                        cursor: 'pointer',
                        padding: '4px 8px',
                        background: activeLog ? '#e6f7ff' : 'transparent',
                        borderRadius: 4
                    }}
                >
                    {activeLog ? (
                        <>
                            <div style={{ fontSize: 12, color: '#1890ff' }}>{activeLog.customer_order_number}</div>
                            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#faad14' }}>
                                <ClockCircleOutlined /> {formatTime(elapsedSeconds)}
                            </div>
                            <div style={{ fontSize: 10, color: '#888' }}>{activeLog.workflow_name || 'Ismeretlen'}</div>
                        </>
                    ) : (
                        <Button type="text" icon={<ClockCircleOutlined />}>{!isMobile && 'Stopper'}</Button>
                    )}
                </div>

                {!isMobile && <span>Üdvözöljük, {user?.first_name || user?.username}!</span>}
                <Dropdown
                    menu={{
                        items: userMenuItems,
                        onClick: handleUserMenuClick,
                    }}
                    placement="bottomRight"
                    arrow
                >
                    <Button type="text" style={{ padding: 0 }}>
                        <Avatar
                            size={isMobile ? "small" : "default"}
                            icon={<UserOutlined />}
                            style={{ backgroundColor: '#1890ff' }}
                        />
                    </Button>
                </Dropdown>
            </Space>
        </AntHeader>
    );
};

export default Header;

