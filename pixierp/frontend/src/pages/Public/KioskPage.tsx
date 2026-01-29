import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Typography, Result, Button, message } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

// Helper to get/set device ID
const getDeviceId = () => {
    let id = localStorage.getItem('kiosk_device_id');
    if (!id) {
        id = 'kiosk-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
        localStorage.setItem('kiosk_device_id', id);
    }
    return id;
};

const KioskPage: React.FC = () => {
    const [deviceId] = useState(getDeviceId());
    const [deviceStatus, setDeviceStatus] = useState<string>('pending'); // pending, approved, blocked
    const [loading, setLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Original state
    const [status, setStatus] = useState<'IDLE' | 'SHOW_QR' | 'SUCCESS' | 'TIMEOUT'>('IDLE');
    const [qrData, setQrData] = useState<string>('');
    const [successData, setSuccessData] = useState<{name: string, timestamp: string, action?: string} | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [wsStatus, setWsStatus] = useState<string>('nincs WS kapcsolat');
    const [requestUser, setRequestUser] = useState<string | null>(null);
    const [requestMode, setRequestMode] = useState<'check_in' | 'check_out' | null>(null);
    const [successDuration, setSuccessDuration] = useState<number>(3); // seconds

    // Idle
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    useEffect(() => {
       const handler = () => {
           setIsFullscreen(!!document.fullscreenElement);
       };
       document.addEventListener('fullscreenchange', handler);
       return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const checkDeviceStatus = async () => {
        try {
            // Register or check
            const res = await api.post('/hr/kiosk-devices/register/', { device_id: deviceId });
            const newStatus = res.data.status;
            setDeviceStatus(newStatus);
            setLoading(false);
            return newStatus;
        } catch (err) {
            console.error(err);
            return null;
        }
    };

    useEffect(() => {
        checkDeviceStatus();
        const poll = setInterval(() => {
            // If requesting or approved (to detect block), keep polling
            // Optimized: poll less frequently if blocked?
            checkDeviceStatus(); 
        }, 5000); 
        pollingRef.current = poll;

        // Cleanup on close
        const handleUnload = () => {
            const url = '/api/v1/hr/kiosk-devices/unregister/';
            
            // Build absolute URL for sendBeacon
            const fullUrl = window.location.origin + url;
            
            const formData = new FormData();
            formData.append('device_id', deviceId);
            
            navigator.sendBeacon(fullUrl, formData);
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => { 
            if (pollingRef.current) clearInterval(pollingRef.current); 
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [deviceId]);

    // Idle Timer Logic
    const resetIdleTimer = () => {
        if (isIdle) setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        // Only start idle timer if approved
        if (deviceStatus === 'approved') {
            idleTimerRef.current = setTimeout(() => {
                setIsIdle(true);
            }, 60000); // 1 minute
        }
    };

    useEffect(() => {
        if (deviceStatus === 'approved') {
            window.addEventListener('mousemove', resetIdleTimer);
            window.addEventListener('click', resetIdleTimer);
            window.addEventListener('touchstart', resetIdleTimer);
            window.addEventListener('keydown', resetIdleTimer);
            resetIdleTimer();
        }
        return () => {
            window.removeEventListener('mousemove', resetIdleTimer);
            window.removeEventListener('click', resetIdleTimer);
            window.removeEventListener('touchstart', resetIdleTimer);
            window.removeEventListener('keydown', resetIdleTimer);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [deviceStatus, isIdle]);

    // WS Connection needs access to current successDuration
    // Since useEffect has valid deps, we can just use a ref for duration to avoid re-connecting WS on duration change
    // or just assume config is loaded once.
    // However, if we put successDuration in dependency array, socket reconnects. That's fine but maybe optimal to use ref.
    const successDurationRef = useRef(successDuration);
    useEffect(() => { successDurationRef.current = successDuration; }, [successDuration]);

    useEffect(() => {
        if (deviceStatus !== 'approved') return;

        // Fetch config
        api.get('/hr/attendance-kiosk-config/current/')
           .then(res => {
               if (res.data.kiosk_logo) setLogoUrl(res.data.kiosk_logo);
               if (res.data.qr_validity_seconds) setSuccessDuration(res.data.qr_validity_seconds);
           })
           .catch(err => console.error("Failed to load kiosk config", err));
           
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/attendance/`;
        let socket: WebSocket;

        const connect = () => {
            setWsStatus('nincs WS kapcsolat');
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log("Kiosk Connected");
                setWsStatus('WS kapcsolat van');
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Wake up on message
                    resetIdleTimer(); 
                    
                    if (data.type === 'show_qr') {
                        setQrData(data.qr_data);
                        if (data.user_name) setRequestUser(data.user_name);
                        if (data.mode) setRequestMode(data.mode);
                        setStatus('SHOW_QR');
                    } else if (data.type === 'stop_qr') {
                        setStatus('IDLE');
                        setRequestUser(null);
                        setRequestMode(null);
                        setSuccessData(null);
                    } else if (data.type === 'success') {
                        setSuccessData({
                            name: data.user_name,
                            timestamp: data.timestamp,
                            action: data.action
                        });
                        setStatus('SUCCESS');
                        setRequestUser(null);
                        setTimeout(() => {
                            setStatus('IDLE');
                            setSuccessData(null);
                        }, successDurationRef.current * 1000);
                    }
                } catch (e) { console.error(e); }
            };

            socket.onclose = () => {
                setWsStatus('nincs WS kapcsolat');
                setTimeout(connect, 3000);
            };
        };
        connect();
        return () => { if (socket) socket.close(); };
    }, [deviceStatus]);

    if (loading) return <div style={{padding: 50, textAlign: 'center'}}>Betöltés...</div>;

    if (deviceStatus === 'pending') {
        return (
            <div style={{height: '100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', background:'#f0f2f5', padding: 20}}>
                <Title level={2}>Kiosk Regisztráció</Title>
                <Text>Várj, amíg az admin engedélyezi az eszközt.</Text>
                <div style={{marginTop: 30, padding: '20px 40px', background:'white', border:'1px solid #ccc', borderRadius: 8, textAlign:'center'}}>
                    <Text type="secondary" style={{fontSize: 12}}>Azonosító:</Text>
                    <Title level={3} copyable style={{marginTop: 5, marginBottom: 0}}>{deviceId}</Title>
                </div>
            </div>
        );
    }

    const isBlocked = deviceStatus === 'blocked';
    
    // Pulse animation logic
    // Cycle: successDuration visible, then fade out (2s), stay black (1s), fade in (2s)
    const fadeOutTime = 2;
    const blackTime = 1;
    const fadeInTime = 2;
    const pulseDuration = successDuration + fadeOutTime + blackTime + fadeInTime; 
    const animationName = 'kiosk-pulse';

    // Status Dot / Info
    const isConnected = wsStatus === 'WS kapcsolat van';

    // Approved UI (and blocked UI fallback with blinking dot)
    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
            <style>{`
                @keyframes blinker {
                    50% { opacity: 0; }
                }
                @keyframes kiosk-pulse {
                    0% { opacity: 1; }
                    ${(successDuration / pulseDuration) * 100}% { opacity: 1; }
                    ${((successDuration + fadeOutTime) / pulseDuration) * 100}% { opacity: 0; }
                    ${((successDuration + fadeOutTime + blackTime) / pulseDuration) * 100}% { opacity: 0; }
                    100% { opacity: 1; }
                }
            `}</style>
            
            {/* IDLE/Blocked Screen */}
            {(isIdle || status === 'IDLE' || isBlocked) && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                    backgroundColor: 'black', zIndex: 1, display: 'flex', flexDirection: 'column', 
                    justifyContent: 'center', alignItems: 'center',
                    animation: (isIdle || status === 'IDLE') && !isBlocked ? `${animationName} ${pulseDuration}s infinite ease-in-out` : 'none'
                }} onClick={() => !isBlocked && resetIdleTimer()}>
                    
                    {logoUrl ? (
                         <img src={logoUrl} alt="Logo" style={{ maxHeight: 450, maxWidth: '80%', marginBottom: 10 }} />
                    ) : (
                         <h1 style={{ color: 'white', fontSize: 100, marginBottom: 10, fontWeight: 'bold' }}>PixiSys</h1>
                    )}
                    
                    <h2 style={{ color: '#aaa', fontSize: 24, fontWeight: 'normal', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase' }}>
                         {isBlocked ? (
                             <span style={{ color: '#52c41a' }}>ID: {deviceId}</span>
                         ) : 'Regisztráció'}
                    </h2>
                    
                    {/* Status Dot - Only if disconnected */}
                    {!isConnected && !isBlocked && (
                        <div style={{
                            position: 'absolute',
                            bottom: 30,
                            right: 30,
                            width: 15,
                            height: 15,
                            borderRadius: '50%',
                            backgroundColor: '#f5222d',
                            boxShadow: '0 0 10px rgba(0,0,0,0.8)'
                        }} title={wsStatus} />
                    )}
                </div>
            )}
            
            {/* Active Content (QR or Success) - Only visible if active and not blocked */}
            {!isBlocked && !isIdle && status !== 'IDLE' && (
                <div style={{ 
                    width: 400, height: 300, 
                    border: '1px solid #333', borderRadius: 8, 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                    backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(255,255,255,0.1)', 
                    padding: 24, textAlign: 'center', position: 'relative', zIndex: 2
                }}>
                    {status === 'SHOW_QR' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                             {requestUser && (
                                 <div style={{ marginBottom: 10, fontWeight: 'bold', fontSize: 16 }}>
                                    {requestMode === 'check_in' ? 'Belépés: ' : requestMode === 'check_out' ? 'Kilépés: ' : ''}{requestUser}
                                 </div>
                             )}
                             <div style={{ marginBottom: 16 }}>
                                <QRCodeSVG value={qrData} size={180} />
                             </div>
                        </div>
                    )}
                    {status === 'SUCCESS' && successData && (
                        <div>
                            <Result
                                status="success"
                                title={(() => {
                                    const name = (successData.name || '').trim() || 'Felhasználó';
                                    if (successData.action === 'check_in') {
                                        return `Üdvözöllek ${name}! Jó munkát kívánok!`;
                                    } else if (successData.action === 'check_out') {
                                        return `Jó pihenést, ${name}!`;
                                    }
                                    return name;
                                })()}
                                subTitle={`${successData.timestamp}`}
                                icon={<CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />}
                                style={{ padding: 0 }}
                            />
                        </div>
                    )}
                </div>
            )}
            {/* Fullscreen Toggle */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 10, opacity: 0.3, transition: 'opacity 0.3s' }} 
                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} 
                 onMouseLeave={(e) => e.currentTarget.style.opacity = '0.3'}>
                <Button 
                    type="text" 
                    icon={isFullscreen ? <FullscreenExitOutlined style={{color: 'white', fontSize: 24}} /> : <FullscreenOutlined style={{color: 'white', fontSize: 24}} />} 
                    onClick={toggleFullscreen} 
                />
            </div>
        </div>
    );
};

export default KioskPage;
