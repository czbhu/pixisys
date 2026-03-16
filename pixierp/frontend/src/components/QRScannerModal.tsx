import React, { useEffect, useRef, useState } from 'react';
import { Modal, Input, Button, message, Tabs, Tooltip, Select } from 'antd';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { ScanOutlined, LaptopOutlined, SettingOutlined, ReloadOutlined } from '@ant-design/icons';

interface QRScannerModalProps {
    open: boolean;
    onClose: () => void;
    isMobile?: boolean;
    onScan?: (data: string) => void;
    onRefresh?: () => void;
    title?: string;
}

const PREFERRED_MODE_KEY = 'pixierp_qr_preferred_mode';
const PREFERRED_CAMERA_KEY = 'pixierp_qr_preferred_camera';

const QRScannerModal: React.FC<QRScannerModalProps> = ({ open, onClose, isMobile = false, onScan, onRefresh, title }) => {
    const navigate = useNavigate();
    const [scannerActive, setScannerActive] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const inputRef = useRef<any>(null); // For USB scanner input focus
    
    // Camera selection state
    const [cameras, setCameras] = useState<Array<{id: string, label: string}>>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
    const [showCameraSelect, setShowCameraSelect] = useState(true);

    // Determine default mode based on history or environment
    const getInitialMode = () => {
        const saved = localStorage.getItem(PREFERRED_MODE_KEY);
        if (saved && (saved === 'camera' || saved === 'usb')) {
            return saved;
        }
        return isMobile ? 'camera' : 'usb';
    };

    const [activeTab, setActiveTab] = useState<string>(getInitialMode());

    // Update active tab if saved preference changes or on open
    useEffect(() => {
        if (open) {
            const mode = getInitialMode();
            setActiveTab(mode);
        }
    }, [open, isMobile]);

    // Handle Tab Change and Save Preference
    const handleTabChange = (key: string) => {
        setActiveTab(key);
        localStorage.setItem(PREFERRED_MODE_KEY, key);
    };

    const clearReference = (e: React.MouseEvent) => {
        e.stopPropagation();
        localStorage.removeItem(PREFERRED_MODE_KEY);
        localStorage.removeItem(PREFERRED_CAMERA_KEY);
        message.info('Alapértelmezett mód és kamera beállítás törölve.');
        
        // Reset to default logic
        const defaultMode = isMobile ? 'camera' : 'usb';
        setActiveTab(defaultMode);
        setSelectedCameraId(null);
        setShowCameraSelect(true);
    };

    // Auto-focus input for USB scanner when modal opens and usb tab is active
    useEffect(() => {
        if (open && activeTab === 'usb') {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [open, activeTab]);

    // Cleanup scanner when modal closes
    useEffect(() => {
        if (!open && scannerRef.current) {
           stopScanner();
        }
    }, [open]);

    // Fetch cameras once when opening in camera mode
    useEffect(() => {
        if (open && activeTab === 'camera') {
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
                         // Default to last camera (often back camera on mobile) if multiple, 
                         // or just the first one. Environment facing logic handled by start if no ID passed.
                         // But we want to select one for the dropdown.
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
    }, [open, activeTab]);

    // Start/Stop/Restart camera based on active tab and selected camera
    useEffect(() => {
        if (open && activeTab === 'camera') {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                // If we have cameras loaded and one selected, use that specific ID
                // If we don't have cameras loaded yet (first run), startCamera handles generic start
                startCamera(selectedCameraId);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            stopScanner();
        }
    }, [open, activeTab, selectedCameraId]);

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (err) {
                console.error("Error stopping scanner", err);
            }
            scannerRef.current = null;
        }
        setScannerActive(false);
    }

    const handleScanSuccess = (decodedText: string) => {
        console.log("Scanned:", decodedText); 
        processScannedData(decodedText);
    };

    const processScannedData = (data: string) => {
        if (onScan) {
            onScan(data);
            return;
        }

        try {
            // Check if it's a URL
            if (data.startsWith('http')) {
                const url = new URL(data);
                if (url.pathname) {
                    navigate(url.pathname + url.search);
                    message.success('Sikeres beolvasás!');
                    onClose(); // Close modal on success navigation
                    return;
                }
            }
            // message.warning('Nem felismert QR kód formátum: ' + data);
            // Optional: Handle plain text IDs if valid
        } catch (error) {
            console.error(error);
            message.error('Hibás QR kód');
        }
    };

    const startCamera = async (cameraId?: string | null) => {
        // Stop previous instance if running to switch camera
        if (scannerRef.current) {
            await stopScanner();
        }

        const element = document.getElementById("qr-reader-full");
        if (!element) return;

        setScannerActive(true);
        
        const html5QrCode = new Html5Qrcode("qr-reader-full");
        scannerRef.current = html5QrCode;

        try {
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            if (cameraId) {
                await html5QrCode.start(
                    cameraId, 
                    config, 
                    handleScanSuccess,
                    undefined
                );
            } else {
                // Fallback to environment facing if no ID specific (initial load before cam list)
                await html5QrCode.start(
                    { facingMode: "environment" }, 
                    config, 
                    handleScanSuccess,
                    undefined
                );
            }
        } catch (err) {
            console.error("Error starting camera", err);
            setScannerActive(false);
        }
    };

    const handleCameraSelect = (val: string) => {
        setSelectedCameraId(val);
        localStorage.setItem(PREFERRED_CAMERA_KEY, val);
        // Effect will trigger restart
    };

    const handleManualInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const val = (e.target as HTMLInputElement).value;
            if (val) {
                processScannedData(val);
                (e.target as HTMLInputElement).value = '';
            }
        }
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
                    <span>{title || 'QR Kód Beolvasás'}</span>
                </div>
            }
            open={open}
            onCancel={() => {
                onClose();
                stopScanner();
            }}
            footer={[
                <Button key="back" onClick={() => { onClose(); stopScanner(); }}>
                    Mégse
                </Button>,
                onRefresh && (
                    <Button key="refresh" type="primary" icon={<ReloadOutlined />} onClick={onRefresh}>
                        Új QR Kód
                    </Button>
                )
            ]}
            destroyOnHidden
        >
            <Tabs 
                activeKey={activeTab} 
                onChange={handleTabChange}
                items={[
                    {
                        key: 'camera',
                        label: <span><ScanOutlined /> Kamera</span>,
                        children: (
                            <div style={{ textAlign: 'center', minHeight: 300 }}>
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
                                <div id="qr-reader-full" style={{ width: '100%' }}></div>
                                {!scannerActive && <p>Kamerák betöltése...</p>}
                            </div>
                        )
                    },
                    {
                        key: 'usb',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <LaptopOutlined /> USB / Kézi
                                <Tooltip title="Alapértelmezett mód és kamera törlése">
                                    <SettingOutlined onClick={clearReference} style={{ fontSize: 12, color: '#999' }} />
                                </Tooltip>
                            </span>
                        ),
                        children: (
                            <div style={{ textAlign: 'center' }}>
                                <p>Kattints a mezőbe és használd az USB olvasót, vagy írd be a kódot:</p>
                                <Input 
                                    ref={inputRef}
                                    placeholder="Kód helye..." 
                                    onKeyDown={handleManualInput}
                                    autoFocus
                                />
                            </div>
                        )
                    }
                ]}
            />
        </Modal>
    );
};

export default QRScannerModal;
