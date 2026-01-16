import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Users, 
  UserCheck,
  Settings, 
  BarChart3, 
  Menu, 
  ChevronLeft,
  ChevronRight,
  Plus,
  CreditCard,
  LogOut,
  User
} from 'lucide-react';
import styled from 'styled-components';
import { Dropdown, Avatar } from 'antd';
import CompanySelector from './CompanySelector';
import { useAuth } from '../contexts/AuthContext';

const LayoutContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: #f5f5f5;
`;

const Sidebar = styled.aside`
  width: ${(p) => (p.$collapsed ? '74px' : '250px')};
  background-color: #2c3e50;
  color: white;
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  overflow: visible;
  z-index: 5000;
  transform: translateX(0);
`;

const SidebarHeader = styled.div`
  padding: ${(p) => (p.$collapsed ? '14px' : '20px')};
  border-bottom: 1px solid #34495e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`;

const Logo = styled.h1`
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: ${(p) => (p.$collapsed ? 0 : 1)};
  transition: opacity 0.2s ease;
`;

const SidebarNav = styled.nav`
  padding: 20px 0;
`;

const NavScroll = styled.div`
  overflow-y: auto;
  overflow-x: visible;
  max-height: calc(100vh - 220px);
`;

const IconBase = ({ children, label, ...rest }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label={label}
    {...rest}
  >
    {children}
  </svg>
);

const OutgoingInvoiceIcon = (props) => (
  <IconBase label="Kimenő számla" {...props}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="16" x2="12" y2="10" />
    <polyline points="9 13 12 10 15 13" />
    <line x1="8" y1="19" x2="16" y2="19" />
  </IconBase>
);

const IncomingInvoiceIcon = (props) => (
  <IconBase label="Bejövő számla" {...props}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <polyline points="9 13 12 16 15 13" />
    <line x1="8" y1="19" x2="16" y2="19" />
  </IconBase>
);

const ProformaIcon = (props) => (
  <IconBase label="Díjbekérő" {...props}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <circle cx="17" cy="15" r="3" />
    <path d="M16.2 16.8v-3.6h1.2a1.2 1.2 0 0 1 0 2.4h-1.2" />
    <line x1="8" y1="11" x2="13" y2="11" />
    <line x1="8" y1="14" x2="13" y2="14" />
    <line x1="8" y1="17" x2="12" y2="17" />
  </IconBase>
);

const NavItem = styled(Link)`
  display: flex;
  align-items: center;
  padding: 12px ${(p) => (p.$collapsed ? '18px' : '20px')};
  color: #bdc3c7;
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;

  &:hover {
    background-color: #34495e;
    color: white;
  }

  &.active {
    background-color: #3498db;
    color: white;
    border-left-color: #2980b9;
  }

  svg {
    margin-right: ${(p) => (p.$collapsed ? '0' : '12px')};
    width: 20px;
    height: 20px;
  }
`;

const MainContent = styled.main`
  flex: 1;
  margin-left: ${(p) => (p.$collapsed ? '74px' : '250px')};
  padding: 12px;
  transition: margin-left 0.2s ease;
`;

const Header = styled.header`
  background: white;
  padding: 16px 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MobileMenuButton = styled.button`
  display: block;
  background: none;
  border: none;
  color: #2c3e50;
  font-size: 24px;
  cursor: pointer;

  @media (min-width: 768px) {
    display: none;
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: ${props => props.isOpen ? 'block' : 'none'};

  @media (min-width: 768px) {
    display: none;
  }
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const QuickActionButton = styled(Link)`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }

  svg {
    margin-right: 8px;
    width: 16px;
    height: 16px;
  }
`;

const UserMenu = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
`;

const UserInfo = styled.div`
  text-align: right;
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const UserName = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: #2c3e50;
`;

const UserEmail = styled.div`
  font-size: 12px;
  color: #7f8c8d;
`;

const Layout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const [selectedCompany, setSelectedCompany] = useState(null);
  const location = useLocation();
  const { user, logout } = useAuth();

  const allowedMenus = user?.allowed_menus || [];
  const canSee = (key) => !allowedMenus.length || allowedMenus.includes(key);

  const navigation = [
    { path: '/', label: 'Dashboard', icon: Home, key: 'dashboard' },
    {
      path: '/invoices',
      label: 'Számlák',
      key: 'invoices',
      iconNode: <OutgoingInvoiceIcon />
    },
    {
      path: '/incoming-invoices',
      label: 'Bejövő számlák',
      key: 'incoming_invoices',
      iconNode: <IncomingInvoiceIcon />
    },
    {
      path: '/proformas',
      label: 'Díjbekérők',
      key: 'proformas',
      iconNode: <ProformaIcon />
    },
    { path: '/bank-statements', label: 'Bank', icon: CreditCard, key: 'bank_statements' },
    { path: '/customers', label: 'Ügyfelek', icon: Users, key: 'customers' },
    { path: '/contacts', label: 'Kapcsolattartók', icon: UserCheck, key: 'contacts' },
    { path: '/settings', label: 'Beállítások', icon: Settings, key: 'settings' },
    { path: '/reports', label: 'Jelentések', icon: BarChart3, key: 'reports' },
  ];

  const quickActions = [
    { path: '/invoices/new', label: 'Új számla', icon: Plus, key: 'invoices' },
    { path: '/customers/new', label: 'Új ügyfél', icon: Plus, key: 'customers' },
    { path: '/contacts/new', label: 'Új kapcsolattartó', icon: Plus, key: 'contacts' },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      label: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 500 }}>{user?.first_name || user?.username}</div>
          <div style={{ fontSize: '12px', color: '#7f8c8d' }}>{user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LogOut size={16} />
          Kijelentkezés
        </div>
      ),
      onClick: logout,
    },
  ];

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try { localStorage.setItem('sidebarCollapsed', next ? '1' : '0'); } catch {}
  };

  return (
    <LayoutContainer>
      <Overlay isOpen={false} />
      <Sidebar $collapsed={isCollapsed}>
        <SidebarHeader $collapsed={isCollapsed}>
          <Logo $collapsed={isCollapsed}>Számlázó</Logo>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              onClick={toggleCollapse}
              style={{
                background: 'none',
                border: '1px solid #3b4a5a',
                color: 'white',
                borderRadius: 6,
                padding: '6px',
                cursor: 'pointer'
              }}
              title={isCollapsed ? 'Menü kinyitása' : 'Menü becsukása'}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>
        </SidebarHeader>
        <CompanySelector 
          selectedCompany={selectedCompany}
          onCompanyChange={setSelectedCompany}
          collapsed={isCollapsed}
        />
        <NavScroll>
          <SidebarNav>
            {navigation.filter((item) => canSee(item.key)).map((item) => {
              const IconComp = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavItem
                  key={item.path}
                  to={item.path}
                  className={isActive ? 'active' : ''}
                  onClick={() => {}}
                  $collapsed={isCollapsed}
                  title={isCollapsed ? item.label : undefined}
                >
                  {item.iconNode ? item.iconNode : <IconComp />}
                  {!isCollapsed && item.label}
                </NavItem>
              );
            })}
          </SidebarNav>
        </NavScroll>
      </Sidebar>
      
      <MainContent $collapsed={isCollapsed}>
        <Header>
          <MobileMenuButton onClick={() => {}}>
            <Menu />
          </MobileMenuButton>
          <QuickActions>
            {quickActions.filter((action) => canSee(action.key)).map((action) => {
              const Icon = action.icon;
              return (
                <QuickActionButton key={action.path} to={action.path}>
                  <Icon />
                  {action.label}
                </QuickActionButton>
              );
            })}
          </QuickActions>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <UserMenu>
              <UserInfo>
                <UserName>{user?.first_name || user?.username}</UserName>
                <UserEmail>{user?.email}</UserEmail>
              </UserInfo>
              <Avatar 
                style={{ backgroundColor: '#3498db', cursor: 'pointer' }} 
                icon={<User size={20} />}
              />
            </UserMenu>
          </Dropdown>
        </Header>
        {children}
      </MainContent>
    </LayoutContainer>
  );
};

export default Layout;
