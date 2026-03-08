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
    const [requestMode, setRequestMode] = useState<'check_in' | 'check_out' | 'challenge' | 'task_kiosk' | null>(null);
    const [successDuration, setSuccessDuration] = useState<number>(3); // seconds

    // Identify Mode
    const [identifyData, setIdentifyData] = useState<{device_id: string, name?: string} | null>(null);

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

        return () => { 
            if (pollingRef.current) clearInterval(pollingRef.current); 
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


    // Idle Cycle State - REMOVED for new logic
    // const [idleCycle, setIdleCycle] = useState<'QR' | 'LOGO'>('QR');
    // const [cycleVisible, setCycleVisible] = useState(true);

    // Pending QR Data for queuing
    const [pendingQrData, setPendingQrData] = useState<{qr_data: string, user_name?: string, mode?: any} | null>(null);

    // Breathing Animation Style
    const breathingStyle = `
        @keyframes breathe {
            0% { opacity: 0.8; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1.02); }
            100% { opacity: 0.8; transform: scale(0.98); }
        }
    `;

    useEffect(() => {
        // Inject styles
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(breathingStyle));
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);


    /* REMOVED OLD CYCLE LOGIC
    useEffect(() => {
        // Only run cycle if approved and in IDLE state (or isIdle is true)
        const isIdleState = (deviceStatus === 'approved') && ((isIdle || status === 'IDLE'));
        if (!isIdleState) return;
        // ...
    }, [idleCycle, cycleVisible, successDuration, isIdle, status, deviceStatus]);
    */

    /* REMOVED IDLE TIMER LOGIC - Kiosk is always "Idle" (Logo) unless triggered
    useEffect(() => {
        if (deviceStatus === 'approved') {
            window.addEventListener('mousemove', resetIdleTimer);
            // ...
        }
    }, [deviceStatus, isIdle]);
    */
    
    // Instead of resetIdleTimer, we just have simple state management via WS
    
    // Process Queue when becoming IDLE
    useEffect(() => {
        if (status === 'IDLE' && pendingQrData) {
            setQrData(pendingQrData.qr_data);
            if (pendingQrData.user_name) setRequestUser(pendingQrData.user_name);
            if (pendingQrData.mode) setRequestMode(pendingQrData.mode);
            setStatus('SHOW_QR');
            setPendingQrData(null);
        }
    }, [status, pendingQrData]);


    // State Refs for WebSocket access
    const statusRef = useRef(status);
    const identifyDataRef = useRef(identifyData);
    const successDurationRef = useRef(successDuration);

    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { identifyDataRef.current = identifyData; }, [identifyData]);
    useEffect(() => { successDurationRef.current = successDuration; }, [successDuration]);

    useEffect(() => {
        if (deviceStatus !== 'approved') return;

        // Fetch config
        api.get('/hr/attendance-kiosk-config/current/')
           .then(res => {
               if (res.data.kiosk_logo) {
                   let url = res.data.kiosk_logo;
                   // Force HTTPS if we are on HTTPS
                   if (window.location.protocol === 'https:' && url.startsWith('http:')) {
                       url = url.replace('http:', 'https:');
                   }

                   // Fix for development URLs showing up in production
                   if (url && (url.includes('127.0.0.1') || url.includes('localhost'))) {
                       try {
                           const urlObj = new URL(url);
                           url = window.location.origin + urlObj.pathname;
                       } catch (e) {
                           // Keep original if parsing fails
                       }
                   }
                   setLogoUrl(url);
               }
               if (res.data.qr_validity_seconds) setSuccessDuration(res.data.qr_validity_seconds);
           })
           .catch(err => console.error("Failed to load kiosk config", err));
           
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/attendance/${deviceId}/`;
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let watchdogTimer: ReturnType<typeof setInterval> | null = null;
        let isUnmounted = false;
        let lastHeartbeatAt = Date.now();

        const clearRuntimeTimers = () => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            if (watchdogTimer) {
                clearInterval(watchdogTimer);
                watchdogTimer = null;
            }
        };

        const scheduleReconnect = () => {
            if (isUnmounted || reconnectTimer) return;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, 3000);
        };

        const startHeartbeat = () => {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                if (!socket || socket.readyState !== WebSocket.OPEN) return;
                try {
                    socket.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {
                    console.error('Kiosk heartbeat send failed', e);
                }
            }, 15000);

            if (watchdogTimer) clearInterval(watchdogTimer);
            watchdogTimer = setInterval(() => {
                if (!socket || socket.readyState !== WebSocket.OPEN) return;
                if (Date.now() - lastHeartbeatAt > 45000) {
                    console.warn('Kiosk WS heartbeat timeout, forcing reconnect');
                    socket.close();
                }
            }, 5000);
        };

        const connect = () => {
            setWsStatus('nincs WS kapcsolat');
            clearRuntimeTimers();
            lastHeartbeatAt = Date.now();
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log("Kiosk Connected");
                setWsStatus('WS kapcsolat van');
                lastHeartbeatAt = Date.now();
                startHeartbeat();
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'pong' || data.type === 'heartbeat') {
                        lastHeartbeatAt = Date.now();
                        return;
                    }
                    
                    if (data.type === 'show_qr') {
                        // Check if busy using REFS
                        // Busy if: SUCCESS is showing, or IDENTIFY is showing
                        // Note: If status is SHOW_QR, we can overwrite it (it's just a new QR)
                        const currentStatus = statusRef.current;
                        const currentIdentify = identifyDataRef.current;
                        
                        const isBusy = (currentStatus === 'SUCCESS') || (currentIdentify !== null);
                        
                        if (isBusy) {
                            // Queue it
                            setPendingQrData({
                                qr_data: data.qr_data,
                                user_name: data.user_name,
                                mode: data.mode
                            });
                        } else {
                            // Show immediately
                            setQrData(data.qr_data);
                            if (data.user_name) setRequestUser(data.user_name);
                            if (data.mode) setRequestMode(data.mode);
                            setStatus('SHOW_QR');
                        }
                    } else if (data.type === 'stop_qr') {
                        if (statusRef.current === 'SHOW_QR') {
                           setStatus('IDLE');
                           setRequestUser(null);
                           setRequestMode(null);
                        }
                        setPendingQrData(null);
                    } else if (data.type === 'success') {
                        setSuccessData({
                            name: data.user_name,
                            timestamp: data.timestamp,
                            action: data.action
                        });
                        setStatus('SUCCESS');
                        setRequestUser(null);
                        
                        const visibleDuration = successDurationRef.current * 1000;
                        setTimeout(() => {
                            // Instead of forcing IDLE, we just set status to IDLE.
                            // The useEffect hook monitoring 'status' will pick up pending queue if any.
                            setStatus('IDLE');
                            setSuccessData(null);
                        }, Math.max(1000, visibleDuration));
                    } else if (data.type === 'identify') {
                         if (data.device_id === deviceId) {
                             const mode = data.mode || 'start';
                             if (mode === 'start') {
                                setIdentifyData({
                                    device_id: data.device_id,
                                    name: data.name
                                });
                             } else {
                                setIdentifyData(null);
                             }
                         }
                    } else if (data.type === 'restart' || data.type === 'reload') {
                         console.log("Remote restart command received");
                         window.location.reload();
                    }
                } catch (e) { console.error(e); }
            };

            socket.onerror = (err) => {
                console.error('Kiosk WS error', err);
            };

            socket.onclose = () => {
                setWsStatus('nincs WS kapcsolat');
                if (isUnmounted) return;
                scheduleReconnect();
            };
        };
        connect();
        return () => {
            isUnmounted = true;
            clearRuntimeTimers();
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
        };
    }, [deviceStatus, deviceId]); // Only reconnect if device auth changes



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
    

    // Status Dot / Info
    const isConnected = wsStatus === 'WS kapcsolat van';

    // Approved UI (and blocked UI fallback with blinking dot)
    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
            {/* IDLE/Blocked Screen */}
            {(isIdle || status === 'IDLE' || isBlocked) && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                    backgroundColor: 'black', zIndex: 1, display: 'flex', flexDirection: 'column', 
                    justifyContent: 'center', alignItems: 'center',
                }} onClick={() => !isBlocked && resetIdleTimer()}>
                    
                    {isBlocked ? (
                        <>
                             {logoUrl ? (
                                <img src={logoUrl} alt="Logo" style={{ maxHeight: 450, maxWidth: '80%', marginBottom: 10 }} />
                             ) : (
                                <h1 style={{ color: 'white', fontSize: 100, marginBottom: 10, fontWeight: 'bold' }}>PixiSys</h1>
                             )}
                             <h2 style={{ color: '#aaa', fontSize: 24, fontWeight: 'normal', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase' }}>
                                 <span style={{ color: '#52c41a' }}>ID: {deviceId}</span>
                             </h2>
                        </>
                    ) : (
                        // Idle State with Breathing Logo (Always visible if no active content)
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                        }}>
                             {logoUrl ? (
                                 <img 
                                    src={logoUrl} 
                                    alt="Logo" 
                                    style={{ 
                                        maxHeight: '80vh', 
                                        maxWidth: '90vw', 
                                        objectFit: 'contain',
                                        animation: 'breathe 4s infinite ease-in-out'
                                    }} 
                                    onError={() => setLogoUrl(null)}
                                 />
                             ) : (
                                 <h1 style={{ color: 'white', fontSize: 150, fontWeight: 'bold', animation: 'breathe 4s infinite ease-in-out' }}>PixiSys</h1>
                             )}
                        </div>
                    )}
                    
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
            {!isBlocked && !isIdle && (status !== 'IDLE' || identifyData) && (
                <div style={{ 
                    width: 600, height: 400, 
                    border: '1px solid #333', borderRadius: 8, 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                    backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(255,255,255,0.1)', 
                    padding: 24, textAlign: 'center', position: 'relative', zIndex: 2
                }}>
                    {identifyData ? (
                        <div style={{animation: 'fadeIn 0.5s'}}>
                            <Title level={2}>Kiosk Azonosítás</Title>
                            <div style={{fontSize: 20, marginBottom: 20}}>Ez az eszköz az alábbi adatokkal van regisztrálva:</div>
                            <div style={{background: '#f0f2f5', padding: 20, borderRadius: 8}}>
                                <div><strong>Név:</strong> {identifyData.name || '-'}</div>
                                <div style={{fontSize: 24, margin: '10px 0', color: '#1890ff', fontWeight: 'bold'}}>{identifyData.device_id}</div>
                            </div>
                        </div>
                    ) : (
                    <>
                    {status === 'SHOW_QR' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                             {requestMode === 'task_kiosk' ? (
                                <div style={{ marginBottom: 12, fontWeight: 'bold', fontSize: 28, textAlign: 'center', color: '#1890ff' }}>
                                    Feladat jóváhagyás
                                </div>
                             ) : (
                                <div style={{ marginBottom: 12, fontWeight: 'bold', fontSize: 24, textAlign: 'center', color: '#555' }}>
                                    Jelenléti azonosítás
                                </div>
                             )}
                             {requestUser && (
                                 <div style={{ marginBottom: 24, fontWeight: 'bold', fontSize: 64, textAlign: 'center', lineHeight: 1.2 }}>
                                    {requestUser}
                                 </div>
                             )}
                             <div style={{ marginBottom: 16 }}>
                                <QRCodeSVG value={qrData} size={256} />
                             </div>
                        </div>
                    )}
                    {status === 'SUCCESS' && successData && (
                        <div>
                            <Result
                                status="success"
                                title={
                                    <span style={{ fontSize: 48, fontWeight: 'bold' }}>
                                    {(() => {
                                        const name = (successData.name || '').trim() || 'Felhasználó';
                                        if (successData.action === 'check_in') {
                                            return `Üdvözöllek ${name}!`;
                                        } else if (successData.action === 'check_out') {
                                            return `Jó pihenést ${name}!`;
                                        }
                                        return name;
                                    })()}
                                    </span>
                                }
                                subTitle={null}
                                icon={<CheckCircleOutlined style={{ fontSize: 100, color: '#52c41a' }} />}
                                style={{ padding: 0 }}
                            />
                        </div>
                    )}
                    </>
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
