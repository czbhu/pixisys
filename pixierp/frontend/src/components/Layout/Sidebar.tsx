import React, { useEffect, useState, useRef } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';

const { Sider } = Layout;

interface SidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  inviteCount?: number;
  notificationCounts?: { [key: string]: number };
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed: propCollapsed, onCollapse, inviteCount = 0, notificationCounts = {} }) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const siderRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  
  const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
  const setCollapsed = onCollapse || setInternalCollapsed;

  // Calculate selected menu key based on current path
  const getSelectedKey = () => {
    const path = location.pathname;
    // Check for exact match first
    const allMenuKeys = [
      '/dashboard',
      '/personal/invitations', '/personal/orders',
      '/hr/employees', '/hr/departments', '/hr/attendance', '/hr/payroll', '/hr/leaves', '/hr/analytics',
      '/sales/rfqs', '/sales/invitations', '/sales/customer-orders', '/sales/delivery-notes', '/sales/invoicing', '/sales/projects',
      '/manufacturing/projects', '/manufacturing/products', '/manufacturing/product-classes', '/manufacturing/services',
      '/manufacturing/calculators', '/manufacturing/boms', '/manufacturing/inventory', '/manufacturing/work-orders', '/manufacturing/quality',
      '/finance/invoices', '/finance/payments', '/finance/budgets', '/finance/reports', '/finance/accounts',
      '/crm/companies', '/crm/contacts', '/crm/deals', '/crm/activities',
      '/orders/orders', '/orders/returns',
      '/warehouse/materials', '/warehouse/supplier-invoices', '/warehouse/material-groups',
      '/pos/transactions', '/pos/products', '/pos/inventory',
      '/pos/sales', '/pos/customers', '/pos/reports',
      '/orders/shipments', '/orders/suppliers',
      '/warehouse/inventory', '/warehouse/receipts', '/warehouse/scraps', '/warehouse/warehouses', '/warehouse/reports',
      '/settings/access-control', '/settings/companies', '/settings/currencies', '/settings/roles', '/settings/email-server', '/settings/email-templates', '/settings/signatures', '/settings/integrations', '/settings/pixinvoice', '/settings/backup'
    ];
    
    // Find the longest matching prefix
    let bestMatch = '/dashboard';
    let maxLength = 0;
    for (const key of allMenuKeys) {
      if (path.startsWith(key) && key.length > maxLength) {
        bestMatch = key;
        maxLength = key.length;
      }
    }
    return bestMatch;
  };

  // Görgetés az aktív menüelemhez
  useEffect(() => {
    const scrollToActiveMenuItem = () => {
      // Késleltetés, hogy a DOM teljesen renderelődjön
      setTimeout(() => {
        const activeMenuItem = document.querySelector('.ant-menu-item-selected, .ant-menu-submenu-selected');
        if (activeMenuItem && siderRef.current) {
          activeMenuItem.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 100);
    };

    scrollToActiveMenuItem();
  }, [location.pathname]);

  // Keep only the current section open; start closed by default
  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }
    const sel = getSelectedKey();
    if (!sel.startsWith('/')) {
      setOpenKeys([]);
      return;
    }
    const top = '/' + (sel.split('/')[1] || '');
    // Special-case PixInvoice SSO which lives under finance
    const parent = sel === 'pixinvoice-sso' ? '/finance' : top;
    setOpenKeys(parent ? [parent] : []);
  }, [location.pathname, collapsed]);

  const handleOpenChange = (keys: string[]) => {
    if (collapsed) return;
    setOpenKeys(keys);
  };
  
  // Helper to get count for a specific path key
  const getCount = (key: string) => {
    // If the backend returns path-based keys (e.g. "sales/orders": 5)
    // We can match exact key or prefix?
    // Let's assume the backend returns keys matching the route paths exactly (without leading slash potentially or with it)
    // Based on `NotificationConsumer` or aggregator logic.
    // Let's assume keys are like '/sales/customer-orders'
    return notificationCounts[key] || 0;
  };
  
  // Helper to sum counts for a section (e.g. '/sales')
  const getSectionCount = (prefix: string) => {
    return Object.entries(notificationCounts)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((sum, [_, count]) => sum + count, 0);
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/personal',
      icon: (collapsed && inviteCount > 0) ? <Badge count={inviteCount} size="small" offset={[0, 10]}><UserOutlined /></Badge> : <UserOutlined />,
      label: 'Saját',
      children: [
        {
          key: '/personal/invitations',
           label: (
             <span style={{ display: 'flex', alignItems: 'center' }}>
               Meghívásaim
               {inviteCount > 0 && <Badge count={inviteCount} size="small" style={{ marginLeft: 8 }} />}
             </span>
           ),
        },
        {
          key: '/personal/orders',
          label: 'Megrendelések',
        },
      ],
    },
    {
      key: '/hr',
      icon: (collapsed && getSectionCount('/hr') > 0) ? <Badge count={getSectionCount('/hr')} size="small" offset={[0, 10]}><TeamOutlined /></Badge> : <TeamOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
            HR Modul
            {!collapsed && getSectionCount('/hr') > 0 && <Badge count={getSectionCount('/hr')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
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
          key: '/hr/work-logs',
          label: 'Munkanaplók',
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
          key: '/sales/rfqs',
          label: 'Árajánlatok',
        },
        {
          key: '/sales/customer-orders',
          label: 'Megrendelések',
        },
        {
          key: '/sales/delivery-notes',
          label: 'Szállítás',
        },
        {
          key: '/sales/invoicing',
          label: 'Számlázás',
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
          key: '/sales/projects',
          label: 'Projektek',
        },
      ],
    },
    {
      key: '/manufacturing',
      icon: (collapsed && getSectionCount('/manufacturing') > 0) ? <Badge count={getSectionCount('/manufacturing')} size="small" offset={[0, 10]}><ToolOutlined /></Badge> : <ToolOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
            Gyártás
            {!collapsed && getSectionCount('/manufacturing') > 0 && <Badge count={getSectionCount('/manufacturing')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
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
          key: '/manufacturing/services',
          label: 'Szolgáltatások',
        },
        {
          key: '/manufacturing/calculators',
          label: 'Kalkulátorok',
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
          label: 'Alapanyagok/Termékek',
        },
        {
          key: '/warehouse/material-groups',
          label: 'Anyagcsoportok',
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
          key: '/warehouse/supplier-invoices',
          label: 'Beszállítói számlák',
        },
        {
          key: '/warehouse/scraps',
          label: 'Selejtezések',
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
        { key: '/settings/attendance-kiosk', label: 'Jelenlét Kioszk' },
        { key: '/settings/companies', label: 'Alap adatok' },
        { key: '/settings/currencies', label: 'Pénznemek' },
        { key: '/settings/roles', label: 'Jogosultságok' },
        { key: '/settings/email-server', label: 'E-mail szerver' },
        { key: '/settings/email-templates', label: 'E-mail sablonok' },
        { key: '/settings/signatures', label: 'Aláírások' },
        { key: '/settings/integrations', label: 'Integrációk' },
        { key: '/settings/pixinvoice', label: 'PIXINVOICE' },
        { key: '/settings/backup', label: 'Backup' },
      ],
    },
  ];

  const mapKeyToModule = (key: string) => {
    if (key === '/dashboard') return 'dashboard';
    if (key === 'pixinvoice-sso') return 'finance';
    const trimmed = key.startsWith('/') ? key.slice(1) : key;
    const [module] = trimmed.split('/') as string[];
    return module || 'dashboard';
  };

  const hasModuleAccess = (moduleKey: string) => {
    if (moduleKey === 'dashboard' || moduleKey === 'personal') return true;

    const perms = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!perms.length) return false;

    return perms.some((p: any) => {
      if (!p?.allowed) return false;
      if (p?.module !== moduleKey) return false;
      // Any allowed action makes the module visible (including create/edit/delete/export)
      return true;
    });
  };

  const filterMenuItems = (items: any[]): any[] => {
    return items
      .map((item) => {
        const moduleKey = mapKeyToModule(item.key);
        const filteredChildren = item.children ? filterMenuItems(item.children) : undefined;
        const hasChildren = filteredChildren && filteredChildren.length > 0;
        const visible = hasModuleAccess(moduleKey) || hasChildren;
        if (!visible) return null;
        return {
          ...item,
          children: filteredChildren,
        };
      })
      .filter(Boolean);
  };

  const accessibleMenuItems = filterMenuItems(menuItems);

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
  const itemsWithLinks = accessibleMenuItems.map((mi: any) => ({
    ...mi,
    label: renderItemLabel(mi.key, mi.label),
    children: mi.children ? mi.children.map((ch: any) => ({
      ...ch,
      label: renderItemLabel(ch.key, ch.label),
    })) : undefined,
  }));

  return (
    <Sider
      ref={siderRef}
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
        zIndex: 999,
      }}
    >
      <div style={{
        height: 64,
        margin: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {collapsed ? (
           <img src="/favicon.svg" alt="PixiERP" style={{ maxHeight: '32px' }} />
        ) : (
           <img src="/pixi_logo.png" alt="PixiERP" style={{ maxHeight: '50px', maxWidth: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div style={{ paddingBottom: '80px' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={itemsWithLinks}
        />
      </div>
    </Sider>
  );
};

export default Sidebar;
