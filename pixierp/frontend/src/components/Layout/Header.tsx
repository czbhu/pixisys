import React, { useState, useEffect } from 'react';
import { Layout, Dropdown, Avatar, Button, Space, message, Modal, Typography, Badge, MenuProps, Tooltip } from 'antd';
import { UserOutlined, LogoutOutlined, MenuOutlined, ClockCircleOutlined, QrcodeOutlined, LoginOutlined, FieldTimeOutlined, RestOutlined, UndoOutlined, RedoOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useActionHistory } from '../../contexts/ActionHistoryContext';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { TimerModal } from '../WorkLog/TimerModal';
import QRScannerModal from '../QRScannerModal';
import AttendanceQRModal from '../AttendanceQRModal';
import { useCart } from '../../contexts/CartContext';
import api from '../../services/api';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

const { Header: AntHeader } = Layout;

interface HeaderProps {
    onMenuClick?: () => void;
    isMobile?: boolean;
    inviteCount?: number;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobile = false, inviteCount = 0 }) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { undo, redo, canUndo, canRedo, history, currentIndex } = useActionHistory();
    const { activeLog, elapsedSeconds, setModalOpen } = useTimeTracker();
    const { totalActiveCount, setDrawerOpen: setCartDrawerOpen } = useCart();
    const [qrModalOpen, setQrModalOpen] = useState(false);
    
    // Attendance state
    const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
    const [personalQrModalOpen, setPersonalQrModalOpen] = useState(false);
    // State for Universal QR -> Attendance handover
    const [personalQrInitialToken, setPersonalQrInitialToken] = useState<string | null>(null);
    const [personalQrInitialKioskId, setPersonalQrInitialKioskId] = useState<string | null>(null);
    const [personalQrInitialMode, setPersonalQrInitialMode] = useState<'phone_qr' | 'kiosk_qr' | 'authorized_qr' | null>(null);
    
    const [attendanceStatus, setAttendanceStatus] = useState<{

        is_clocked_in: boolean, 
        check_in: string | null, 
        check_out: string | null, 
        daily_worked_seconds?: number,
        inactivity_timeout?: number
    } | null>(null);

    // Inactivity Tracking State
    const [currentTime, setCurrentTime] = useState(dayjs());
    const [lastActivityTime, setLastActivityTime] = useState(dayjs()); // EFFECTIVE last activity (max of local and server)
    const localLastActivityTime = React.useRef(dayjs()); // Local inputs timestamp
    const lastSyncedTime = React.useRef(dayjs()); // Last time we told server about activity
    const [inactivityWarningOpen, setInactivityWarningOpen] = useState(false);

    // Request notification permission
    useEffect(() => {
        if ("Notification" in window) {
            if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }
    }, []);

    const sendNativeNotification = async (title: string, body: string, strategy: 'auto' | 'sw' | 'api' = 'auto') => {
        if (!("Notification" in window)) return 'unsupported';
        
        if (Notification.permission === "granted") {
            try {
                // 1. Try Service Worker (Preferred for "Push" style persistence)
                if ((strategy === 'auto' || strategy === 'sw') && 'serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.getRegistration();
                    if (registration && registration.active) {
                        await registration.showNotification(title, {
                            body: body,
                            icon: '/logo192.png',
                            badge: '/logo192.png',
                            vibrate: [200, 100, 200],
                            requireInteraction: true,
                            tag: 'pixierp-activity-msg', // Fixed tag to update existing
                            data: { url: window.location.href }
                        });
                        // Auto-close service worker notification after 5 seconds
                        setTimeout(async () => {
                             try {
                                 const notifications = await registration.getNotifications({ tag: 'pixierp-activity-msg' });
                                 notifications.forEach(n => n.close());
                             } catch(e) { console.error("Auto-close error", e); }
                        }, 5000);
                        return 'sw';
                    }
                }

                // 2. Fallback to classic API
                const notif = new Notification(title, {
                    body: body,
                    icon: window.location.origin + '/logo192.png', 
                    requireInteraction: true,
                    silent: false,
                    tag: 'pixierp-activity-msg'
                });
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
                // Auto-close classic notification after 5 seconds
                setTimeout(() => notif.close(), 5000);
                return 'api';
            } catch (e) {
                console.error("Native notification error:", e);
                return 'error';
            }
        }
        return 'permission-denied';
    };

    const handleUniversalScan = async (data: string) => {
        try {
            console.log("Universal Scan Data:", data);
            
            // 1. Try sending to backend scan endpoint (Handles Attendance/Kiosk)
            const response = await api.post('/hr/attendances/scan/', { qr_code: data });
             
            if (response.data.action === 'show_user_qr' && response.data.access_token) {
                 // OLD FLOW: Switch to Token Display.
                 message.success(response.data.message || 'Kioszk azonosítva!');
                 setQrModalOpen(false);
                 setPersonalQrModalOpen(true);
                 // We don't have token prop logic here anymore as we removed it for simplicity in last step? 
                 // Wait, I updated Props in previous turn, but logic in views.py changed action to 'kiosk_challenge_sent'
                 return;
            } else if (response.data.action === 'kiosk_challenge_sent') {
                 // NEW FLOW: Challenge Sent to Kiosk
                 message.success(response.data.message || 'Kioszk azonosítva! Olvasd be a megjelenő kódot!');
                 // KEEP SCANNER OPEN or RE-OPEN logic?
                 // Ideally, we just show a message "Most olvasd be a kódot a kioszkon!"
                 // And the scanner stays active. 
                 // We need to ensure the scanner doesn't close or reset.
                 // Current logic: we only setQrModalOpen(false) if we return early.
                 // So if we just message.success, scanner stays open?
                 // But handleUniversalScan usually closes or navigates.
                 
                 // Let's add a visual feedback in the Scanner Modal? Or just toast message.
                 // Scanner Modal doesn't have "message" area easily accessible via prop?
                 // Using 'message.success' displays a toast which is visible over modal.
                 
                 // Important: Prevent re-scanning the SAME kiosk code immediately.
                 // The Scanner component has a `processScannedData` debouncer/lock?
                 // Yes, usually.
                 
                 return; // Keep scanner open
                 
            } else if (response.data.action === 'check_in' || response.data.action === 'check_out') {
                 // Direct action success (e.g. Scanned Challenge Token)
                 message.success(response.data.message);
                 setQrModalOpen(false); // Success -> Close
                 return;
            }
            
            // 2. Fallback: Check if it's a URL
             if (data.startsWith('http')) {
                const url = new URL(data);
                if (url.pathname) {
                    navigate(url.pathname + url.search);
                    message.success('Sikeres URL beolvasás!');
                    setQrModalOpen(false); 
                    return;
                }
            }
            
        } catch (error: any) {
            console.error("Universal Scan Error", error);
            // If backend rejected it, and it's not a URL, show error
            // Check if it WAS a URL but backend rejected it as QR code?
            // The try block around api.post might catch network errors too.
            
            if (data.startsWith('http')) {
                // If it looks like a URL but backend failed scan (expected), try navigation
                 try {
                    const url = new URL(data);
                    if (url.pathname) {
                        navigate(url.pathname + url.search);
                        message.success('Sikeres URL beolvasás!');
                        setQrModalOpen(false); 
                        return;
                    }
                 } catch(e) {}
            }
            
            const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Ismeretlen vagy érvénytelen QR kód';
            message.error(errorMsg);
        }
    };

    // --- ACTIVITY TRACKING LOGIC ---
    useEffect(() => {
        // Only run listeners if checks are enabled (user is logged in context)
        // But specifically, user asked: "only measure activity if checked in via kiosk"
        // So we check attendanceStatus.check_in
        
        const updateActivity = () => {
             // Update LOCAL reference
             localLastActivityTime.current = dayjs();
             
             // Optimistically update display to feel responsive
             if (localLastActivityTime.current.isAfter(lastActivityTime)) {
                 setLastActivityTime(localLastActivityTime.current);
             }
        };

        if (attendanceStatus?.check_in) {
            window.addEventListener('keydown', updateActivity);
            window.addEventListener('click', updateActivity);
            window.addEventListener('scroll', updateActivity);
            window.addEventListener('touchmove', updateActivity);
            window.addEventListener('touchstart', updateActivity);
        }
        
        return () => {
             window.removeEventListener('keydown', updateActivity);
             window.removeEventListener('click', updateActivity);
             window.removeEventListener('scroll', updateActivity);
             window.removeEventListener('touchmove', updateActivity);
             window.removeEventListener('touchstart', updateActivity);
        };
    }, [attendanceStatus?.check_in, lastActivityTime]);

    // --- UI TIMER (1s tick for clock) ---
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
        return () => clearInterval(timer);
    }, []);

    // --- SYNC & CHECK LOOP (Frequency: 10s for responsive sync) ---
    useEffect(() => {
        const timer = setInterval(async () => {
            const now = dayjs();
            
            // 1. POLL STATUS (Always check server status to keep devices in sync)
            let serverData = null;
            try {
                // Add timestamp to prevent caching
                const { data } = await api.get(`/hr/attendances/status/?t=${new Date().getTime()}`);
                serverData = data;
                setAttendanceStatus(data); 
            } catch(e) { console.error("Poll failed", e); }

            // 2. Only proceed with Heartbeat/Activity logic if checked in
            if (!serverData?.check_in || serverData?.check_out) return;
            
            // 3. SYNC HEARTBEAT (If checked in)
            // If we have new local activity since last sync
            if (localLastActivityTime.current.diff(lastSyncedTime.current, 'second') > 30) {
                 try {
                     await api.post('/hr/attendances/update_heartbeat/');
                     lastSyncedTime.current = dayjs(); // Reset sync timer
                 } catch (e) {
                     console.error("Heartbeat failed", e);
                 }
            }

            // 4. Merge Activity Times
            let effectiveTime = localLastActivityTime.current;
            if (serverData?.last_activity) {
                 const serverTime = dayjs(serverData.last_activity);
                 if (serverTime.isValid() && serverTime.isAfter(effectiveTime)) {
                     effectiveTime = serverTime;
                 }
            }
            setLastActivityTime(effectiveTime);

            // 5. CHECK TIMEOUT LOGIC
            const diffMinutes = now.diff(effectiveTime, 'minute'); 
            const timeoutMinutes = serverData?.inactivity_timeout !== undefined ? serverData.inactivity_timeout : 60;
            
            // If timeout is 0, disable checks
            if (timeoutMinutes > 0) {
                 if (diffMinutes >= timeoutMinutes && !inactivityWarningOpen) {
                      setInactivityWarningOpen(true);
                      
                      // Try native notification
                      sendNativeNotification(
                          "Inaktivitás Figyelmeztetés", 
                          `Már ${timeoutMinutes} perce nem mutattál aktivitást! Itt vagy még?`
                      );
                 }
                  
                 if (diffMinutes < timeoutMinutes && inactivityWarningOpen) {
                      setInactivityWarningOpen(false);
                 }
                 
                 if (diffMinutes >= (timeoutMinutes + 2)) {
                      handleInactiveLogout();
                 }
            } else {
                 if (inactivityWarningOpen) setInactivityWarningOpen(false);
            }
            
        }, 10000); // 10s sync

        return () => clearInterval(timer);
    }, [inactivityWarningOpen]); // Reduced dependencies to avoid reset loops

    const handleInactiveLogout = async () => {
        try {
            // Close modal to prevent multiple triggers
            setInactivityWarningOpen(false);
            
            // Attempt to record checkout at the time of last activity
            await api.post('/hr/attendances/inactive_checkout/', {
                last_activity: lastActivityTime.toISOString()
            });
            
            message.info('Inaktivitás miatt a rendszer kiléptette a jelenléti rendszerből.');
            // Refresh status to show "Logged Out" state
            checkAttendanceStatus();
        } catch (error) {
            console.error("Inactive logout failed", error);
        }
    };
    
    // Load attendance status
    useEffect(() => {
        checkAttendanceStatus();
        // Refresh every minute to ensure sync? Or rely on websocket/events? 
        // For simple elapsed time, data.check_in is enough.
    }, []);

    const checkAttendanceStatus = async () => {
        try {
            // Add timestamp to prevent caching
            const { data } = await api.get(`/hr/attendances/status/?t=${new Date().getTime()}`);
            console.log("Updated Attendance Status:", data);
            setAttendanceStatus(data);
        } catch (error) {
            console.error("Attendance check failed", error);
        }
    };
    
    // Listen for WebSocket Kiosk/Attendance messages to auto-refresh status
    // When "success" (check-in/out) message arrives -> refreshHeader
    useEffect(() => {
        // We can reuse the notificationWS service if backend sends "kiosk.message" as "notification" 
        // OR we need to subscribe to attendance_kiosk group? 
        // Actually, the current user receives notification if targeted.
        // Let's assume we can trigger refresh on Window Focus too as backup.
        
        const onFocus = () => checkAttendanceStatus();
        window.addEventListener('focus', onFocus);
        
        // Listen for global attendance update event (from App.tsx WebSocket)
        const onAttendanceUpdate = () => {
             console.log("Global attendance update event received -> Refreshing Header Status");
             checkAttendanceStatus();
        };
        window.addEventListener('attendance-updated', onAttendanceUpdate);
        
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('attendance-updated', onAttendanceUpdate);
        };
    }, []);

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


    const userMenuItems: MenuProps['items'] = [
        {
            key: 'login-info',
            label: (
                <div style={{ cursor: 'default', color: '#666' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                         <FieldTimeOutlined style={{ marginRight: 8, color: attendanceStatus?.is_clocked_in ? '#1890ff' : '#999' }} />
                         <span>
                             {(attendanceStatus?.is_clocked_in && attendanceStatus?.check_in && dayjs(attendanceStatus.check_in).isValid()) ? (
                                <>
                                    Belépve: <span style={{ fontWeight: 'bold' }}>
                                        {dayjs.duration(currentTime.diff(dayjs(attendanceStatus.check_in))).format('HH:mm:ss')}
                                    </span>
                                </>
                             ) : (
                                <span style={{ color: '#999' }}>Kilépve</span>
                             )}
                             {attendanceStatus?.daily_worked_seconds !== undefined && (
                                <>
                                    <span style={{ margin: '0 8px' }}>|</span>
                                    <span>
                                        Mai nap: <span style={{ fontWeight: 'bold' }}>
                                        {(() => {
                                            const currentSessionSeconds = (attendanceStatus?.is_clocked_in && attendanceStatus?.check_in && dayjs(attendanceStatus.check_in).isValid()) 
                                                ? currentTime.diff(dayjs(attendanceStatus.check_in), 'second') 
                                                : 0;
                                            const totalSeconds = (attendanceStatus.daily_worked_seconds || 0) + currentSessionSeconds;
                                            // Handle potential case where check-in is future or skew causing negative?
                                            const finalSeconds = totalSeconds > 0 ? totalSeconds : 0;
                                            return dayjs.duration(finalSeconds, 'seconds').format('HH:mm:ss');
                                        })()}
                                        </span>
                                    </span>
                                </>
                             )}
                         </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                         <RestOutlined style={{ marginRight: 8, color: '#faad14' }} />
                         <span>
                             Inaktív: <span style={{ fontWeight: 'bold' }}>
                                 {dayjs.duration(currentTime.diff(lastActivityTime)).format('HH:mm:ss')}
                             </span>
                         </span>
                    </div>
                </div>
            ),
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Kijelentkezés',
            danger: true,
        },
    ];

    const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
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
            padding: isMobile ? '0 10px' : '0 12px',
            background: '#f5f6f8',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            height: isMobile ? 48 : 48,
            lineHeight: isMobile ? '48px' : '48px'
        }}>
             <TimerModal />
             <Modal
                title="Inaktivitás figyelmeztetés"
                open={inactivityWarningOpen}
                footer={[
                    <Button 
                        key="stay" 
                        type="primary" 
                        size="large"
                        onClick={() => {
                            const now = dayjs();
                            setLastActivityTime(now);
                            localLastActivityTime.current = now;
                            setInactivityWarningOpen(false);
                            // Force immediate heartbeat to server
                            api.post('/hr/attendances/update_heartbeat/').catch(console.error);
                        }}
                        style={{ width: '100%' }}
                    >
                        Igen, itt vagyok
                    </Button>
                ]}
                closable={false}
                maskClosable={false}
                centered
                zIndex={9999}
             >
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }}>
                        <ClockCircleOutlined />
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 'bold' }}>Már {attendanceStatus?.inactivity_timeout || 60} perce nem mutattál aktivitást!</p>
                    <p>Itt vagy még?</p>
                </div>
             </Modal>

             <QRScannerModal 
                open={qrModalOpen} 
                onClose={() => setQrModalOpen(false)} 
                isMobile={isMobile} 
                onScan={handleUniversalScan} // Add Universal Handler
             />
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
                onClose={() => {
                    setPersonalQrModalOpen(false);
                    // Reset initial props on close to avoid sticky state
                    setPersonalQrInitialToken(null);
                    setPersonalQrInitialKioskId(null);
                    setPersonalQrInitialMode(null);
                }}
                initialToken={personalQrInitialToken}
                initialKioskId={personalQrInitialKioskId}
                initialMode={personalQrInitialMode || undefined}
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
                <Space size={4}>
                    <Tooltip title={canUndo ? `Visszavonás: ${history[currentIndex]?.description}` : "Nincs visszavonható művelet"}>
                        <Button 
                            icon={<UndoOutlined />} 
                            onClick={() => undo()} 
                            disabled={!canUndo}
                            type="text"
                        />
                    </Tooltip>
                    <Tooltip title={canRedo ? `Újra: ${history[currentIndex + 1]?.description}` : "Nincs újra végrehajtható művelet"}>
                        <Button 
                            icon={<RedoOutlined />} 
                            onClick={() => redo()} 
                            disabled={!canRedo}
                            type="text"
                        />
                    </Tooltip>
                </Space>
            </div>

            <Space>
                <Badge count={totalActiveCount} size="small" offset={[-2, 4]} style={{ backgroundColor: '#531dab' }}>
                    <Button
                        type="text"
                        icon={<ShoppingCartOutlined style={{ fontSize: 18 }} />}
                        onClick={() => setCartDrawerOpen(true)}
                        title="Rendelési kosár"
                        style={{ padding: '0 8px' }}
                    />
                </Badge>
                <Button 
                    type="text" 
                    icon={<QrcodeOutlined />} 
                    onClick={() => {
                        setPersonalQrInitialMode('kiosk_qr');
                        setPersonalQrModalOpen(true);
                    }}
                    title="QR Kód Beolvasás / Kioszk"
                >
                    QR Kód
                </Button>
                {/* 
                   Mobile Login/Logout Button Removed as per request.
                   Universal Checker is now primarily QR driven.
                */}
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

                {!isMobile && <span>{user?.first_name || user?.username}</span>}
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
                            style={{ backgroundColor: attendanceStatus?.is_clocked_in ? '#52c41a' : '#1890ff' }}
                        />
                    </Button>
                </Dropdown>
            </Space>
        </AntHeader>
    );
};

export default Header;

