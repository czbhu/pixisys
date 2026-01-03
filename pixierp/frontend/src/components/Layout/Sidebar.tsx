import React, { useEffect, useState } from 'react';
import { Layout, Menu, Badge, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  TeamOutlined,
  ShoppingCartOutlined,
  ToolOutlined,
  DollarOutlined,
  UserOutlined,
  ShoppingOutlined,
  BarcodeOutlined,
  InboxOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Sider } = Layout;

interface SidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed: propCollapsed, onCollapse }) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
  const setCollapsed = onCollapse || setInternalCollapsed;

  const [inviteCount, setInviteCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mod = await import('../../services/salesService');
        const cnt = await mod.salesService.getMyInvitationsCount('pending');
        if (!cancelled) setInviteCount(cnt);
      } catch (e) {
        // ignore
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/hr',
      icon: <TeamOutlined />,
      label: 'HR Modul',
      children: [
        {
          key: '/hr/employees',
          label: 'Alkalmazottak',
        },
        {
          key: '/hr/departments',
          label: 'Osztályok',
        },
        {
          key: '/hr/attendance',
          label: 'Jelenlét',
        },
        {
          key: '/hr/payroll',
          label: 'Bérszámfejtés',
        },
        {
          key: '/hr/leaves',
          label: 'Szabadságok',
        },
        {
          key: '/hr/analytics',
          icon: <BarChartOutlined />,
          label: 'Teljesítmény Mérés',
        },
      ],
    },
    {
      key: '/sales',
      icon: <ShoppingCartOutlined />,
      label: 'Értékesítés',
      children: [
        {
          key: '/sales/demands',
          label: 'Ajánlatkérő',
        },
        {
          key: '/sales/rfqs',
          label: 'Árajánlatok',
        },
        {
          key: '/sales/orders',
          label: 'Megrendelések',
        },
        {
          key: '/sales/invitations',
          label: (
            <span>
              Meghívásaim {inviteCount > 0 ? <Badge count={inviteCount} overflowCount={99} offset={[8, -2]} /> : null}
            </span>
          ),
        },
        {
          key: '/manufacturing/projects',
          label: 'Projektek',
        },
      ],
    },
    {
      key: '/manufacturing',
      icon: <ToolOutlined />,
      label: 'Gyártás',
      children: [
        {
          key: '/manufacturing/products',
          label: 'Egyedi gyártás',
        },
        {
          key: '/manufacturing/product-classes',
          label: 'Termékkategóriák',
        },
        {
          key: '/manufacturing/boms',
          label: 'BOM-ok',
        },
        {
          key: '/manufacturing/inventory',
          label: 'Készlet',
        },
        {
          key: '/manufacturing/work-orders',
          label: 'Munkarendelések',
        },
        {
          key: '/manufacturing/quality',
          label: 'Minőségbiztosítás',
        },
      ],
    },
    {
      key: '/finance',
      icon: <DollarOutlined />,
      label: 'Pénzügy',
      children: [
        {
          key: '/finance/invoices',
          label: 'Számlák',
        },
        {
          key: '/finance/payments',
          label: 'Fizetések',
        },
        {
          key: '/finance/budgets',
          label: 'Költségvetések',
        },
        {
          key: '/finance/reports',
          label: 'Jelentések',
        },
        {
          key: '/finance/accounts',
          label: 'Számlák',
        },
        {
          key: 'pixinvoice-sso',
          label: 'PixInvoice',
        },
      ],
    },
    {
      key: '/crm',
      icon: <UserOutlined />,
      label: 'CRM',
      children: [
        {
          key: '/crm/companies',
          label: 'Cégek',
        },
        {
          key: '/crm/contacts',
          label: 'Kapcsolatok',
        },
        {
          key: '/crm/activities',
          label: 'Tevékenységek',
        },
        {
          key: '/crm/campaigns',
          label: 'Kampányok',
        },
      ],
    },
    {
      key: '/orders',
      icon: <ShoppingOutlined />,
      label: 'Rendelések',
      children: [
        {
          key: '/orders/orders',
          label: 'Megrendelések',
        },
        {
          key: '/orders/shipments',
          label: 'Szállítások',
        },
        {
          key: '/orders/returns',
          label: 'Visszaküldések',
        },
        {
          key: '/orders/suppliers',
          label: 'Beszállítók',
        },
      ],
    },
    {
      key: '/warehouse',
      icon: <InboxOutlined />,
      label: 'Raktár',
      children: [
        {
          key: '/warehouse/materials',
          label: 'Alapanyagok',
        },
        {
          key: '/warehouse/inventory',
          label: 'Készlet',
        },
        {
          key: '/warehouse/receipts',
          label: 'Bevételezések',
        },
        {
          key: '/warehouse/warehouses',
          label: 'Raktárak',
        },
        {
          key: '/warehouse/suppliers',
          label: 'Beszállítók',
        },
        {
          key: '/warehouse/reports',
          label: 'Jelentések',
        },
      ],
    },
    {
      key: '/pos',
      icon: <BarcodeOutlined />,
      label: 'POS',
      children: [
        {
          key: '/pos/sales',
          label: 'Értékesítés',
        },
        {
          key: '/pos/products',
          label: 'Termékek',
        },
        {
          key: '/pos/customers',
          label: 'Ügyfelek',
        },
        {
          key: '/pos/reports',
          label: 'Jelentések',
        },
      ],
    },
    {
      key: '/settings',
      icon: <ToolOutlined />,
      label: 'Beállítások',
      children: [
        { key: '/settings/access-control', label: 'Beléptető rendszer' },
        { key: '/settings/email-server', label: 'E-mail szerver' },
        { key: '/settings/email-templates', label: 'E-mail sablonok' },
        { key: '/settings/signatures', label: 'Aláírások' },
        { key: '/settings/integrations', label: 'Integrációk' },
        { key: '/settings/pixinvoice', label: 'PIXINVOICE' },
        { key: '/settings/backup', label: 'Backup' },
      ],
    },
  ];

  const handlePixInvoiceSSO = async () => {
    try {
      // Get SSO token from ERP backend
      const response = await api.post('/auth/sso-token/', {});
      
      const ssoToken = response.data.token;
      
      // Open PixInvoice with SSO token
      const pixinvoiceUrl = `https://inv.pixisys.eu/sso-login?token=${encodeURIComponent(ssoToken)}`;
      window.open(pixinvoiceUrl, '_blank');
    } catch (error) {
      console.error('SSO error:', error);
      message.error('Nem sikerült a PixInvoice elérése');
    }
  };

  const renderItemLabel = (key: string, label: string | React.ReactNode) => {
    // Special handling for PixInvoice SSO
    if (key === 'pixinvoice-sso') {
      return (
        <a href="#" onClick={(e) => {
          e.preventDefault();
          handlePixInvoiceSSO();
        }}>{label}</a>
      );
    }
    
    return (
      <a href={key} onClick={(e) => {
        // Allow ctrl/cmd-click or middle/right click to open in new tab/window
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) {
          return; // let browser handle it
        }
        e.preventDefault();
        navigate(key);
      }}>{label}</a>
    );
  };

  // Map labels to clickable anchors preserving new-tab behavior
  const itemsWithLinks = menuItems.map((mi: any) => ({
    ...mi,
    label: renderItemLabel(mi.key, mi.label),
    children: mi.children ? mi.children.map((ch: any) => ({
      ...ch,
      label: renderItemLabel(ch.key, ch.label),
    })) : undefined,
  }));

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={(value) => setCollapsed(value)}
      width={200}
      collapsedWidth={80}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 1000,
      }}
    >
      <div style={{
        height: 32,
        margin: 16,
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
      }}>
        {collapsed ? 'PixiERP' : 'PixiERP Rendszer'}
      </div>
      <div style={{ paddingBottom: '80px' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['/hr', '/sales', '/manufacturing', '/finance', '/crm', '/orders', '/warehouse', '/pos', '/settings']}
          items={itemsWithLinks}
        />
      </div>
    </Sider>
  );
};

export default Sidebar;
