import React, { useEffect, useState, useRef } from 'react';
import { Modal, Typography, Spin, Button, message, Select, Tooltip } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { SettingOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

interface AttendanceQRModalProps {
    open: boolean;
    onClose: () => void;
}

const PREFERRED_CAMERA_KEY = 'pixierp_attendance_qr_preferred_camera';

const AttendanceQRModal: React.FC<AttendanceQRModalProps> = ({ open, onClose }) => {
    const { user } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(10);
    const [loading, setLoading] = useState(false);
    
    // Kiosk Mode State
    const [kioskMode, setKioskMode] = useState<'phone_qr' | 'kiosk_qr'>('phone_qr');
    const [configLoading, setConfigLoading] = useState(true);
    const [qrValidity, setQrValidity] = useState(10);
    
    // Scanner State
    const [scanning, setScanning] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    
    // Camera selection state
    const [cameras, setCameras] = useState<Array<{id: string, label: string}>>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
    const [showCameraSelect, setShowCameraSelect] = useState(true);

    // WebSocket Debug Status
    const [wsStatus, setWsStatus] = useState<string>('nincs WS kapcsolat');

    useEffect(() => {
        if (open) {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            //const wsUrl = `ws://localhost:8003/ws/attendance/`;
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/attendance/`;
            
            // setWsStatus('connecting...');
            socketRef.current = new WebSocket(wsUrl);
            socketRef.current.onopen = () => {
                setWsStatus('WS kapcsolat van');
            };
            socketRef.current.onclose = () => setWsStatus('nincs WS kapcsolat');
            socketRef.current.onerror = () => setWsStatus('nincs WS kapcsolat');
        }
        return () => {
            if (socketRef.current) {
                if (socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ type: 'stop_qr' }));
                }
                socketRef.current.close();
            }
        };
    }, [open]);

    // Send request when ready and periodically refresh
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const sendRequest = () => {
            if (open && !configLoading && kioskMode === 'kiosk_qr' && wsStatus === 'WS kapcsolat van' && socketRef.current) {
                if (socketRef.current.readyState === WebSocket.OPEN) {
                    // Include user name in the request
                    const userName = user ? `${user.last_name || ''} ${user.first_name || ''}`.trim() || user.username : 'Ismeretlen felhasználó';
                    //console.log("Sending request_qr with name:", userName);
                    socketRef.current.send(JSON.stringify({ 
                        type: 'request_qr',
                        user_name: userName
                    }));
                }
            }
        };

        if (open && !configLoading && kioskMode === 'kiosk_qr' && wsStatus === 'WS kapcsolat van') {
            sendRequest();
            // Refresh 2 seconds before expiry, minimum 3s interval
            const refreshMs = Math.max(3000, (qrValidity * 1000) - 2000);
            interval = setInterval(sendRequest, refreshMs);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [open, configLoading, kioskMode, wsStatus, qrValidity, user]);

    // Fetch Config on Open
    useEffect(() => {
        if (open) {
            setConfigLoading(true);
            api.get('/hr/attendance-kiosk-config/current/')
               .then(res => {
                   setKioskMode(res.data.kiosk_mode || 'phone_qr');
                   if (res.data.qr_validity_seconds) {
                       setQrValidity(res.data.qr_validity_seconds);
                   }
               })
               .catch(err => console.error("Config fetch error", err))
               .finally(() => setConfigLoading(false));
         } else {
            stopScanner();
         }
    }, [open]);

    // --- Phone QR Mode Logic ---
    const fetchToken = async () => {
        try {
            setLoading(true);
            const res = await api.get('/hr/attendances/generate_token/');
            setToken(res.data.token);
            setTimeLeft(10);
        } catch (error) {
            console.error("Failed to generate token", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;
        let timerTick: NodeJS.Timeout;

        if (open && !configLoading && kioskMode === 'phone_qr') {
            fetchToken();
            
            interval = setInterval(() => {
                fetchToken();
            }, 10000);

            timerTick = setInterval(() => {
                setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
            if (timerTick) clearInterval(timerTick);
        };
    }, [open, configLoading, kioskMode]);

    // Fetch cameras once when opening in kiosk qr mode
    useEffect(() => {
        if (open && !configLoading && kioskMode === 'kiosk_qr') {
            Html5Qrcode.getCameras().then(devices => {
                if (devices && devices.length) {
                    setCameras(devices);
                    // Try to restore saved camera or pick last (usually back camera)
                    const savedCam = localStorage.getItem(PREFERRED_CAMERA_KEY);
                    const foundSaved = devices.find(d => d.id === savedCam);
                    
                    if (foundSaved) {
                        setSelectedCameraId(foundSaved.id);
                        setShowCameraSelect(false);
                    } else if (!selectedCameraId) {
                         // Default to last camera
                         setSelectedCameraId(devices[devices.length - 1].id);
                         setShowCameraSelect(true);
                    } else {
                        setShowCameraSelect(true);
                    }
                }
            }).catch(err => {
                console.error("Error fetching cameras", err);
            });
        }
    }, [open, configLoading, kioskMode]);

    // --- Kiosk QR Mode (Scanner) Logic ---
    useEffect(() => {
        if (open && !configLoading && kioskMode === 'kiosk_qr') {
            // Give a slight delay for DOM to be ready
            // If we have cameras loaded and one selected, use that specific ID
            // or if cameras are still loading, startScanner will handle generic start
            const timer = setTimeout(() => {
                startScanner(selectedCameraId);
            }, 300);
            return () => clearTimeout(timer);
        }
        return () => {
            stopScanner();
        };
    }, [open, configLoading, kioskMode, selectedCameraId]);

    const startScanner = async (cameraId?: string | null) => {
        try {
            if (scannerRef.current) {
                await stopScanner();
            }
            
            const html5QrCode = new Html5Qrcode("personal-qr-reader");
            scannerRef.current = html5QrCode;
            setScanning(true);

            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };

            if (cameraId) {
                 await html5QrCode.start(
                    cameraId,
                    config,
                    (decodedText) => {
                        handleScan(decodedText);
                    },
                    (errorMessage) => {}
                );
            } else {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        handleScan(decodedText);
                    },
                    (errorMessage) => {}
                );
            }
        } catch (err) {
            console.error("Scanner error", err);
            setScanning(false);
        }
    };

    const handleCameraSelect = (val: string) => {
        setSelectedCameraId(val);
        localStorage.setItem(PREFERRED_CAMERA_KEY, val);
    };

    const clearReference = () => {
        localStorage.removeItem(PREFERRED_CAMERA_KEY);
        message.info('Alapértelmezett kamera beállítás törölve.');
        setSelectedCameraId(null);
        setShowCameraSelect(true);
        // Logic to restart with default/environment is handled by effect when selectedCameraId becomes null?
        // Actually if selectedCameraId becomes null, the effect runs, startScanner(null) runs, and it uses facingMode: environment. Correct.
    };



    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch (err) {
                console.error("Stop scanner error", err);
            }
            scannerRef.current = null;
            setScanning(false);
        }
    };

    const handleScan = async (code: string) => {
        // Validate code format if possible (KIOSK_QR)
        // But for generic robustness, send it.
        try {
             // Stop scanning immediately to prevent duplicate sends
             if (scannerRef.current) {
                 await scannerRef.current.stop();
             }
             
             const { data } = await api.post('/hr/attendances/scan/', { qr_code: code });
             message.success(data.message || 'Sikeres jelölés!');
             onClose();
        } catch (error: any) {
             message.error(error.response?.data?.error || 'Hiba történt a beolvasáskor');
             // Restart scanner if failed
             setTimeout(() => startScanner(selectedCameraId), 1000);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={() => { stopScanner(); onClose(); }}
            footer={null}
            title={kioskMode === 'phone_qr' ? "Személyes Beléptető QR Kód" : "Kioszk Kód Beolvasása"}
            destroyOnClose
            centered
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: 20 }}>
                <div style={{ 
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    color: wsStatus === 'WS kapcsolat van' ? 'green' : 'red',
                    border: '1px solid #ddd',
                    padding: '2px 8px',
                    borderRadius: 4
                }}>
                    WS: {wsStatus}
                </div>
                {configLoading ? (
                     <Spin size="large" />
                ) : kioskMode === 'phone_qr' ? (
                    // OPTION A: Show QR
                    loading && !token ? (
                        <Spin size="large" />
                    ) : (
                        <>
                            <div style={{ border: '8px solid #f0f0f0', borderRadius: 8 }}>
                                {token && (
                                    <QRCodeSVG 
                                        value={token} 
                                        size={256} 
                                        level="M" 
                                        includeMargin 
                                    />
                                )}
                            </div>
                            <Title level={4}>
                                Érvényes még: <Text type="danger">{timeLeft} mp</Text>
                            </Title>
                            <Text type="secondary">
                                Tartsa a telefont a beléptető terminál elé.
                            </Text>
                        </>
                    )
                ) : (
                    // OPTION B: Scanner
                    <div style={{ width: '100%', textAlign: 'center' }}>
                         {cameras.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                                {showCameraSelect ? (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Select 
                                            value={selectedCameraId} 
                                            onChange={handleCameraSelect}
                                            style={{ flex: 1 }}
                                            options={cameras.map(cam => ({ label: cam.label || `Camera ${cam.id}`, value: cam.id }))}
                                            placeholder="Válassz kamerát"
                                        />
                                        <Tooltip title="Alapértelmezések törlése">
                                            <Button icon={<SettingOutlined />} onClick={clearReference} />
                                        </Tooltip>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                                            <Button 
                                            type="link" 
                                            icon={<SettingOutlined />} 
                                            size="small" 
                                            onClick={() => setShowCameraSelect(true)}
                                        >
                                            Kamera váltás
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div id="personal-qr-reader" style={{ width: '100%', minHeight: 300, overflow: 'hidden' }}></div>
                        <Text type="secondary" style={{ marginTop: 10, display: 'block' }}>
                           Olvassa be a Kioszk képernyőjén megjelenő QR kódot.
                        </Text>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AttendanceQRModal;
