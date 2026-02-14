import React, { useState, useEffect } from 'react';
import { Layout, Typography, Avatar, Dropdown, Button, Space, MenuProps } from 'antd';
import { UserOutlined, LogoutOutlined, FieldTimeOutlined, RestOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import POS from './POS';
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
    const { user, logout } = useAuth();
    const navigate = useNavigate();

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
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Kijelentkezés',
            danger: true,
        },
    ];

    const handleUserMenuClick = (e: any) => {
        if (e.key === 'logout') {
            handleLogout();
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <Header style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <Text strong style={{ color: 'white', fontSize: '18px' }}>
                        PixiERP Dashboard v1.3.0 | POS - Értékesítés
                    </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Text style={{ color: 'white', fontSize: '16px' }}>
                        {currentTime.format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                    <Button
                        type="text"
                        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                        onClick={handleToggleFullscreen}
                        style={{ color: 'white' }}
                    />
                    <Space>
                        <span style={{ color: 'white' }}>Üdvözöljük, {user?.first_name || user?.username}!</span>
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
                <POS />
            </div>
        </Layout>
    );
};

export default Sales;
