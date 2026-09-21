import React, { useState, useEffect } from 'react';
import { Layout, Typography, Avatar, Dropdown, Button, Space, MenuProps, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, FieldTimeOutlined, RestOutlined, FullscreenOutlined, FullscreenExitOutlined, ShopOutlined, SettingOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import POS from './POS';
import POSAdmin from './POSAdmin';
import type { FuelContext } from './components/FuelScreen';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

dayjs.extend(duration);

const { Header } = Layout;
const { Text } = Typography;

const Sales = () => {
    const [currentTime, setCurrentTime] = useState(dayjs());
    const [lastActivityTime, setLastActivityTime] = useState(dayjs());
    const [attendanceStatus, setAttendanceStatus] = useState<{
        is_clocked_in: boolean;
        check_in: string | null;
        check_out: string | null;
        daily_worked_seconds?: number;
        inactivity_timeout?: number;
    } | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
    const [posCashInfo, setPosCashInfo] = useState<{
        name: string;
        current_balance: number | string;
        currency_code?: string;
        currency_symbol?: string;
    } | null>(null);
    const [posTerminalName, setPosTerminalName] = useState<string>('POS');
    const [showAllCategories, setShowAllCategories] = useState<boolean>(true);
    const [allowedMaterialGroupIds, setAllowedMaterialGroupIds] = useState<number[]>([]);
    const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<number[]>([]);
    const [posCashRegisterId, setPosCashRegisterId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'pos' | 'admin'>('pos');
    const [fuelContext, setFuelContext] = useState<FuelContext | null>(null);
    const [activePosId, setActivePosId] = useState<number | null>(null);
    const [lastTransaction, setLastTransaction] = useState<{ exists: boolean; total: number; change: number } | null>(null);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Check attendance status periodically
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const { data } = await api.get(`/hr/attendances/status/?t=${new Date().getTime()}`);
                setAttendanceStatus(data);
            } catch (error) {
                console.error('Error fetching attendance status:', error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, []);

    // Update last activity time from global events
    useEffect(() => {
        const updateActivity = () => {
            setLastActivityTime(dayjs());
        };

        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);
        window.addEventListener('scroll', updateActivity);
        window.addEventListener('touchstart', updateActivity);

        return () => {
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            window.removeEventListener('scroll', updateActivity);
            window.removeEventListener('touchstart', updateActivity);
        };
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const search = new URLSearchParams(location.search);
        const posId = search.get('pos_id');

        const loadPosContext = async () => {
            try {
                if (posId) {
                    const { data } = await api.get(`/pos/terminals/${posId}/launch_context/`);
                    setPosTerminalName(data?.name || 'POS');
                    setShowAllCategories(!!data?.show_all_categories);
                    setAllowedMaterialGroupIds(Array.isArray(data?.material_group_ids) ? data.material_group_ids : []);
                    setAllowedWarehouseIds(Array.isArray(data?.warehouse_ids) ? data.warehouse_ids : []);
                    setPosCashRegisterId(data?.cash_register ?? null);
                    setFuelContext(data?.fuel ?? null);
                    setActivePosId(Number(posId));

                    if (data?.cash_register_name) {
                        setPosCashInfo({
                            name: data.cash_register_name,
                            current_balance: data.cash_register_current_balance || 0,
                            currency_code: data.cash_register_currency_code,
                            currency_symbol: data.cash_register_currency_symbol,
                        });
                    } else {
                        setPosCashInfo(null);
                    }
                    return;
                }

                const response = await api.get('/pos/terminals/', { params: { is_active: true, mine: true } });
                const list = response.data?.results || response.data || [];
                const first = Array.isArray(list) && list.length ? list[0] : null;
                if (!first) {
                    setPosTerminalName('POS');
                    setShowAllCategories(true);
                    setAllowedMaterialGroupIds([]);
                    setAllowedWarehouseIds([]);
                    setPosCashRegisterId(null);
                    setPosCashInfo(null);
                    setFuelContext(null);
                    setActivePosId(null);
                    return;
                }

                setPosTerminalName(first.name || 'POS');
                setShowAllCategories(!!first.show_all_categories);
                setAllowedMaterialGroupIds(Array.isArray(first.material_group_ids) ? first.material_group_ids : []);
                setAllowedWarehouseIds(Array.isArray(first.warehouse_ids) ? first.warehouse_ids : []);
                setPosCashRegisterId(first.cash_register ?? null);
                setActivePosId(first.id ?? null);

                if (first.cash_register_name) {
                    setPosCashInfo({
                        name: first.cash_register_name,
                        current_balance: first.cash_register_current_balance || 0,
                        currency_code: first.cash_register_currency_code,
                        currency_symbol: first.cash_register_currency_symbol,
                    });
                } else {
                    setPosCashInfo(null);
                }

                // Benzinkút modul kontextus (csak ha a POS-hoz be van kapcsolva)
                setFuelContext(null);
                if (first.fuel_module_enabled && first.id) {
                    try {
                        const { data: launch } = await api.get(`/pos/terminals/${first.id}/launch_context/`);
                        setFuelContext(launch?.fuel ?? null);
                    } catch {
                        setFuelContext(null);
                    }
                }
            } catch (error: any) {
                if (error?.response?.status === 403) {
                    setPosTerminalName('POS');
                    setShowAllCategories(true);
                    setAllowedMaterialGroupIds([]);
                    setAllowedWarehouseIds([]);
                    setPosCashRegisterId(null);
                    setPosCashInfo(null);
                    setFuelContext(null);
                    setActivePosId(null);
                }
            }
        };

        loadPosContext();
        const interval = setInterval(loadPosContext, 30000);
        return () => clearInterval(interval);
    }, [location.search]);

    const fetchLastTransaction = async () => {
        try {
            const { data } = await api.get('/sales/pos/transactions/last_transaction/');
            setLastTransaction(data?.exists ? data : null);
        } catch {
            // csendben – nem kritikus adat
        }
    };

    useEffect(() => {
        fetchLastTransaction();
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handleToggleFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen toggle failed:', error);
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
            key: 'toggle-view',
            icon: viewMode === 'admin'
                ? <ShopOutlined style={{ fontSize: 20 }} />
                : <SettingOutlined style={{ fontSize: 20 }} />,
            label: (
                <span style={{ fontSize: 18, fontWeight: 600, display: 'inline-block', padding: '10px 0' }}>
                    {viewMode === 'admin' ? 'Kassza (értékesítés)' : 'Adminisztráció'}
                </span>
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

    const handleUserMenuClick = (e: any) => {
        if (e.key === 'logout') {
            handleLogout();
        } else if (e.key === 'toggle-view') {
            setViewMode((v) => {
                if (v === 'admin') fetchLastTransaction();
                return v === 'admin' ? 'pos' : 'admin';
            });
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <Header className="pos-page-header" style={{
                background: '#001529',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'fixed',
                width: '100%',
                zIndex: 1000,
                height: '64px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Text className="pos-h-title" strong style={{ color: 'white', fontSize: '18px' }}>
                        PixiERP Dashboard v1.3.0 | {posTerminalName} - Értékesítés
                    </Text>
                    <Space size={8}>
                        <Text style={{ color: 'white' }}>Kasszában:</Text>
                        <Tag
                            color={posCashInfo ? 'green' : 'default'}
                            className="pos-h-cash"
                            style={{
                                marginRight: 0,
                                fontSize: '36px',
                                lineHeight: '44px',
                                padding: '2px 14px',
                                fontWeight: 700,
                            }}
                        >
                            {posCashInfo
                                ? `${new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(posCashInfo.current_balance || 0))} ${posCashInfo.currency_symbol || posCashInfo.currency_code || ''}`.trim()
                                : 'Nincs beállítva'}
                        </Tag>
                        {posCashInfo?.name && (
                            <Text style={{ color: 'white', opacity: 0.85 }}>{posCashInfo.name}</Text>
                        )}
                    </Space>
                    {lastTransaction && (
                        <Space size={16} style={{ marginLeft: 24 }} className="pos-h-last-tx">
                            <Text style={{ color: 'white', opacity: 0.85 }}>Utolsó vásárlás:</Text>
                            <Text style={{ color: '#52c41a', fontSize: '20px', fontWeight: 700 }}>
                                {new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(Number(lastTransaction.total || 0))} Ft
                            </Text>
                            <Text style={{ color: 'white', opacity: 0.85 }}>Visszajáró:</Text>
                            <Text style={{ color: '#69b7ff', fontSize: '20px', fontWeight: 700 }}>
                                {new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(Number(lastTransaction.change || 0))} Ft
                            </Text>
                        </Space>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Text className="pos-h-clock" style={{ color: 'white', fontSize: '16px' }}>
                        {currentTime.format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                    <Button
                        type="text"
                        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                        onClick={handleToggleFullscreen}
                        style={{ color: 'white' }}
                    />
                    <Space>
                        <span className="pos-h-welcome" style={{ color: 'white' }}>Üdvözöljük, {user?.first_name || user?.username}!</span>
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
                                    icon={<UserOutlined />}
                                    style={{ backgroundColor: '#1890ff' }}
                                />
                            </Button>
                        </Dropdown>
                    </Space>
                </div>
            </Header>
            <div style={{ marginTop: '64px' }}>
                {viewMode === 'admin' ? (
                    <POSAdmin
                        cashRegisterId={posCashRegisterId}
                        allowedWarehouseIds={allowedWarehouseIds}
                        fuelModuleEnabled={!!fuelContext}
                        onBackToPos={() => setViewMode('pos')}
                    />
                ) : (
                    <POS
                        showAllCategories={showAllCategories}
                        allowedMaterialGroupIds={allowedMaterialGroupIds}
                        allowedWarehouseIds={allowedWarehouseIds}
                        fuel={fuelContext}
                        posId={activePosId}
                        onTransactionCompleted={fetchLastTransaction}
                    />
                )}
            </div>
        </Layout>
    );
};

export default Sales;
