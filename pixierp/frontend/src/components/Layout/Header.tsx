import React from 'react';
import { Layout, Dropdown, Avatar, Button, Space } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Header: AntHeader } = Layout;

interface HeaderProps {
    onMenuClick?: () => void;
    isMobile?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isMobile = false }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const userMenuItems = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Profil',
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Beállítások',
        },
        {
            key: 'divider',
            type: 'divider' as const,
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Kijelentkezés',
            danger: true,
        },
    ];

    const handleUserMenuClick = ({ key }: { key: string }) => {
        switch (key) {
            case 'logout':
                logout();
                break;
            case 'profile':
                // Navigate to profile page
                break;
            case 'settings':
                navigate('/settings');
                break;
            default:
                break;
        }
    };

    return (
        <AntHeader style={{
            padding: isMobile ? '0 12px' : '0 24px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {isMobile && (
                    <Button 
                        type="text" 
                        icon={<MenuOutlined />} 
                        onClick={onMenuClick}
                        style={{ fontSize: 18 }}
                    />
                )}
                <h2 style={{ 
                    margin: 0, 
                    color: '#1890ff',
                    fontSize: isMobile ? 16 : 20 
                }}>
                    {isMobile ? 'PixiERP' : `PixiERP Dashboard ${process.env.REACT_APP_VERSION || 'dev'}`}
                </h2>
            </div>

            <Space>
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
