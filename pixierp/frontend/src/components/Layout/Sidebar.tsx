import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Layout, Menu, Badge, message, Select } from 'antd';
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
  FileTextOutlined,
  GlobalOutlined,
  PrinterOutlined,
  SwapOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { Sider } = Layout;

interface SidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  onNavigate?: () => void;
  inviteCount?: number;
  notificationCounts?: { [key: string]: number };
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed: propCollapsed, onCollapse, onNavigate, inviteCount = 0, notificationCounts = {} }) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [hasCashRegisterAccess, setHasCashRegisterAccess] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const siderRef = useRef<HTMLDivElement>(null);
  const { user, setUser } = useAuth();
  
  const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
  const setCollapsed = onCollapse || setInternalCollapsed;

  // User switcher state (dev mode OR superadmin)
  const isDevMode = process.env.REACT_APP_DEV_MODE === 'true';
  const canSwitchUsers = isDevMode || !!(user as any)?.is_superuser;
  const [devUsers, setDevUsers] = useState<any[]>([]);
  const [devSwitching, setDevSwitching] = useState(false);
  const [originalUserId, setOriginalUserId] = useState<number | null>(null);
  const [originalToken, setOriginalToken] = useState<string | null>(null);

  useEffect(() => {
    if (canSwitchUsers && user && devUsers.length === 0) {
      api.get('/users/').then(res => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setDevUsers(list);
      }).catch(() => {});
    }
  }, [canSwitchUsers, user, devUsers.length]);

  const handleDevSwitchUser = useCallback(async (userId: number) => {
    if (!user) return;
    // Save original superuser token on first switch
    const superToken = originalToken || localStorage.getItem('access_token');
    if (!originalToken) {
      setOriginalToken(superToken);
      setOriginalUserId(user.id);
    }
    setDevSwitching(true);
    try {
      // Always use the original superuser token for the switch call
      const res = await api.post('/auth/dev-switch-user/', { user_id: userId }, {
        headers: { Authorization: `Bearer ${superToken}` }
      });
      const { user: newUser, tokens } = res.data;
      localStorage.setItem('access_token', tokens.access);
      localStorage.setItem('refresh_token', tokens.refresh);
      setUser(newUser);
      message.success(`Átváltva: ${newUser.username}`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Nem sikerült a felhasználó váltás');
    } finally {
      setDevSwitching(false);
    }
  }, [user, originalToken, setUser]);

  // Calculate selected menu key based on current path
  const getSelectedKey = () => {
    const path = location.pathname;

    // Check for exact match first
    const allMenuKeys = [
      '/dashboard',
      '/tickets/list', '/tickets/settings',
      '/site-management',
      '/personal', '/hr', '/sales', '/manufacturing', '/finance', '/crm', '/orders', '/warehouse', '/pos', '/settings',
      '/personal/invitations', '/personal/orders', '/personal/attendance', '/personal/tasks', '/personal/approvals', '/personal/cash-registers', '/personal/tickets',
      '/hr/employees', '/hr/departments', '/hr/attendance', '/hr/work-logs', '/hr/payroll', '/hr/leaves', '/hr/analytics', '/hr/activity-log', '/hr/task-settings',
      '/sales/rfqs', '/sales/invitations', '/sales/customer-orders', '/sales/delivery-notes', '/sales/invoicing', '/sales/projects', '/sales/forecasts',
      '/manufacturing/projects', '/manufacturing/products', '/manufacturing/ordered-products', '/manufacturing/queue', '/manufacturing/product-classes', '/manufacturing/product-editor', '/manufacturing/services', '/manufacturing/service-groups',
      '/manufacturing/print-templates',
      '/finance/payments', '/finance/cash-registers', '/finance/cash-register-setup', '/finance/budgets', '/finance/reports',
      '/crm/companies', '/crm/contacts', '/crm/deals', '/crm/activities', '/crm/campaigns',
      '/orders/orders', '/orders/returns',
      '/warehouse/materials', '/warehouse/supplier-invoices', '/warehouse/material-groups',
      '/pos/transactions', '/pos/products', '/pos/inventory',
      '/pos/sales', '/pos/registration', '/pos/terminals', '/pos/customers', '/pos/reports',
      '/orders/shipments', '/orders/suppliers',
      '/warehouse/inventory', '/warehouse/receipts', '/warehouse/scraps', '/warehouse/warehouses', '/warehouse/reports', '/warehouse/suppliers',
      '/settings/access-control', '/settings/attendance-kiosk', '/settings/companies', '/settings/currencies', '/settings/roles', '/settings/email-server', '/settings/email-templates', '/settings/signatures', '/settings/integrations', '/settings/pixinvoice', '/settings/hestia', '/settings/backup', '/settings/zones'
      , '/settings/public-site'
      , '/settings/iot'
      , '/settings/nfc'
      , '/settings/pickup-locations'
      , '/settings/export-import'
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

  useEffect(() => {
    const checkCashAccess = async () => {
      const employeeId = user?.employee_id;
      if (!employeeId) {
        setHasCashRegisterAccess(true);
        return;
      }

      try {
        const response = await api.get('/finance/cash-register-employees/', {
          params: {
            employee: employeeId,
          },
        });
        const data = response.data?.results || response.data || [];
        const rows = Array.isArray(data) ? data : [];
        setHasCashRegisterAccess(rows.length > 0);
      } catch {
        setHasCashRegisterAccess(true);
      }
    };

    checkCashAccess();
  }, [user?.employee_id]);

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
    
    const rootSubmenuKeys = [
      '/personal', 
      '/hr', 
      '/sales', 
      '/manufacturing', 
      '/finance', 
      '/crm', 
      '/orders', 
      '/warehouse', 
      '/pos', 
      '/tickets',
      '/settings'
    ];
    
    const latestOpenKey = keys.find(key => openKeys.indexOf(key) === -1);
    
    if (latestOpenKey && rootSubmenuKeys.indexOf(latestOpenKey) === -1) {
      setOpenKeys(keys);
    } else {
      setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
    }
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

  // Badge label helper for submenu items
  const labelWithBadge = (text: string, key: string) => {
    const cnt = getCount(key);
    return cnt > 0 ? (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {text}
        <Badge count={cnt} size="small" style={{ marginLeft: 8 }} />
      </span>
    ) : <>{text}</>;
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
        {
          key: '/personal/attendance',
          label: labelWithBadge('Jelenléti ív', '/personal/attendance'),
        },
        {
          key: '/personal/tasks',
          label: labelWithBadge('Feladatok', '/personal/tasks'),
        },
        {
          key: '/personal/approvals',
          label: labelWithBadge('Jóváhagyások', '/personal/approvals'),
        },
        {
          key: '/personal/cash-registers',
          label: 'Kassza',
        },
        {
          key: '/personal/tickets',
          label: 'Jegyek',
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
          label: labelWithBadge('Alkalmazottak', '/hr/employees'),
        },
        {
          key: '/hr/departments',
          label: 'Osztályok',
        },
        {
          key: '/hr/attendance',
          label: labelWithBadge('Jelenlét', '/hr/attendance'),
        },
        {
          key: '/hr/work-logs',
          label: labelWithBadge('Munkanaplók', '/hr/work-logs'),
        },
        {
          key: '/hr/payroll',
          label: labelWithBadge('Bérszámfejtés', '/hr/payroll'),
        },
        {
          key: '/hr/leaves',
          label: labelWithBadge('Szabadságok', '/hr/leaves'),
        },
        {
          key: '/hr/analytics',
          icon: <BarChartOutlined />,
          label: 'Teljesítmény Mérés',
        },
        {
          key: '/hr/activity-log',
          icon: <FileTextOutlined />,
          label: 'Napló',
        },
        {
          key: '/hr/task-settings',
          icon: <FileTextOutlined />,
          label: 'Feladatok beállítása',
        },
      ],
    },
    {
      key: '/sales',
      icon: (collapsed && getSectionCount('/sales') > 0) ? <Badge count={getSectionCount('/sales')} size="small" offset={[0, 10]}><ShoppingCartOutlined /></Badge> : <ShoppingCartOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
            Értékesítés
            {!collapsed && getSectionCount('/sales') > 0 && <Badge count={getSectionCount('/sales')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: [
        {
          key: '/sales/rfqs',
          label: labelWithBadge('Árajánlatok', '/sales/rfqs'),
        },
        {
          key: '/sales/customer-orders',
          label: labelWithBadge('Megrendelések', '/sales/customer-orders'),
        },
        {
          key: '/sales/delivery-notes',
          label: labelWithBadge('Szállítás', '/sales/delivery-notes'),
        },
        {
          key: '/sales/invoicing',
          label: labelWithBadge('Számlázás', '/sales/invoicing'),
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
          label: labelWithBadge('Projektek', '/sales/projects'),
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
          key: '/manufacturing/ordered-products',
          label: labelWithBadge('Megrendelt Gyártások', '/manufacturing/ordered-products'),
        },
        {
          key: '/manufacturing/queue',
          label: labelWithBadge('Gyártási Sor', '/manufacturing/queue'),
        },
        {
          key: '/manufacturing/product-classes',
          label: 'Termékkategóriák',
        },
        {
          key: '/manufacturing/product-editor',
          label: 'Termék szerkesztő',
        },
        {
          key: '/manufacturing/services',
          label: 'Szolgáltatások',
        },
        {
          key: '/manufacturing/service-groups',
          label: 'Szolgáltatás csoportok',
        },
        {
          key: '/manufacturing/print-templates',
          label: 'Sablonok',
        },
      ],
    },
    {
      key: '/finance',
      icon: (collapsed && getSectionCount('/finance') > 0) ? <Badge count={getSectionCount('/finance')} size="small" offset={[0, 10]}><DollarOutlined /></Badge> : <DollarOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          Pénzügy
          {!collapsed && getSectionCount('/finance') > 0 && <Badge count={getSectionCount('/finance')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: [
        {
          key: '/finance/payments',
          label: 'Fizetések',
        },
        {
          key: '/finance/cash-registers',
          label: 'Kasszák',
        },
        {
          key: '/finance/cash-register-setup',
          label: 'Kassza Regisztráció',
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
          key: 'pixinvoice-sso',
          label: 'PixInvoice',
        },
      ],
    },
    {
      key: '/crm',
      icon: (collapsed && getSectionCount('/crm') > 0) ? <Badge count={getSectionCount('/crm')} size="small" offset={[0, 10]}><UserOutlined /></Badge> : <UserOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          CRM
          {!collapsed && getSectionCount('/crm') > 0 && <Badge count={getSectionCount('/crm')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: [
        {
          key: '/crm/companies',
          label: labelWithBadge('Cégek', '/crm/companies'),
        },
        {
          key: '/crm/contacts',
          label: labelWithBadge('Kapcsolatok', '/crm/contacts'),
        },
        {
          key: '/crm/activities',
          label: labelWithBadge('Tevékenységek', '/crm/activities'),
        },
        {
          key: '/crm/campaigns',
          label: 'Kampányok',
        },
      ],
    },
    {
      key: '/orders',
      icon: (collapsed && getSectionCount('/orders') > 0) ? <Badge count={getSectionCount('/orders')} size="small" offset={[0, 10]}><ShoppingOutlined /></Badge> : <ShoppingOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          Rendelések
          {!collapsed && getSectionCount('/orders') > 0 && <Badge count={getSectionCount('/orders')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: [
        {
          key: '/orders/orders',
          label: labelWithBadge('Megrendelések', '/orders/orders'),
        },
        {
          key: '/orders/shipments',
          label: labelWithBadge('Szállítások', '/orders/shipments'),
        },
        {
          key: '/orders/returns',
          label: labelWithBadge('Visszaküldések', '/orders/returns'),
        },
        {
          key: '/orders/suppliers',
          label: 'Beszállítók',
        },
      ],
    },
    {
      key: '/warehouse',
      icon: (collapsed && getSectionCount('/warehouse') > 0) ? <Badge count={getSectionCount('/warehouse')} size="small" offset={[0, 10]}><InboxOutlined /></Badge> : <InboxOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          Raktár
          {!collapsed && getSectionCount('/warehouse') > 0 && <Badge count={getSectionCount('/warehouse')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
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
          label: labelWithBadge('Készlet', '/warehouse/inventory'),
        },
        {
          key: '/warehouse/receipts',
          label: labelWithBadge('Bevételezések', '/warehouse/receipts'),
        },
        {
          key: '/warehouse/supplier-invoices',
          label: labelWithBadge('Beszállítói számlák', '/warehouse/supplier-invoices'),
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
        {
          key: '/warehouse/picking',
          label: labelWithBadge('Kiszedés', '/warehouse/picking'),
        },
        {
          key: '/warehouse/picking-list',
          label: labelWithBadge('Kiszedési lista', '/warehouse/picking-list'),
        },
      ],
    },
    {
      key: '/pos',
      icon: <BarcodeOutlined />,
      label: 'POS',
      children: [
        {
          key: '/pos/registration',
          label: 'POS regisztráció',
        },
        {
          key: '/pos/terminals',
          label: 'POSek',
        },
      ],
    },
    {
      key: '/tickets',
      icon: (collapsed && getSectionCount('/tickets') > 0) ? <Badge count={getSectionCount('/tickets')} size="small" offset={[0, 10]}><FileTextOutlined /></Badge> : <FileTextOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          Jegyek
          {!collapsed && getSectionCount('/tickets') > 0 && <Badge count={getSectionCount('/tickets')} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: [
        {
          key: '/tickets/list',
          label: labelWithBadge('Jegyek', '/tickets/list'),
        },
        {
          key: '/tickets/settings',
          label: 'Beállítások',
        },
      ],
    },
    {
      key: '/site-management',
      icon: <GlobalOutlined />,
      label: 'Weboldalak',
    },
    {
      key: '/storage',
      icon: <CloudServerOutlined />,
      label: 'Tárhely',
    },
    {
      key: '/print-editor',
      icon: <PrinterOutlined />,
      label: 'Termékszerkesztők',
      children: [
        { key: '/print-editor/sheet', label: 'Íves nyomtatás' },
        { key: '/print-shop', label: 'Nyomdai megrendelés' },
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
        { key: '/settings/zones', label: 'Zónák' },
        { key: '/settings/integrations', label: 'Integrációk' },
        { key: '/settings/pixinvoice', label: 'PIXINVOICE' },
        { key: '/settings/hestia', label: 'Hestia' },
        { key: '/settings/backup', label: 'Backup' },
        { key: '/settings/public-site', label: 'Publikus oldal' },
        { key: '/settings/iot', label: 'IoT eszközök' },
        { key: '/settings/nfc', label: 'NFC tagek' },
        { key: '/settings/pickup-locations', label: 'Átvételi helyek' },
        { key: '/settings/print-products', label: 'Termékszerkesztők' },
        { key: '/settings/export-import', label: 'Export / Import' },
      ],
    },
  ];



  // Resource mapping for permission check
  const RESOURCE_MAP: Record<string, string> = {
    // HR
    '/hr/employees': 'hr.employees',
    '/hr/departments': 'hr.departments',
    '/hr/positions': 'hr.positions',
    '/hr/attendance': 'hr.attendance',
    '/hr/work-logs': 'hr.work_logs',
    '/hr/payroll': 'hr.payroll',
    '/hr/leaves': 'hr.leave_requests',
    '/hr/analytics': 'hr.analytics',
    '/hr/activity-log': 'hr.activity_log',
    '/hr/task-settings': 'hr.task_settings',

    // Sales
    '/sales/rfqs': 'sales.rfqs',
    '/sales/customer-orders': 'sales.orders',
    '/sales/delivery-notes': 'sales.delivery_notes',
    '/sales/invoicing': 'sales.invoicing',
    '/sales/invitations': 'sales.invitations',
    '/sales/projects': 'sales.projects',
    '/sales/forecasts': 'sales.opportunities',
    
    // Manufacturing
    '/manufacturing/products': 'manufacturing.products',
    '/manufacturing/ordered-products': 'manufacturing.ordered_products',
    '/manufacturing/queue': 'manufacturing.queue',
    '/manufacturing/product-classes': 'manufacturing.product_classes',
    '/manufacturing/product-editor': 'manufacturing.product_editor',
    '/manufacturing/services': 'manufacturing.services',
    '/manufacturing/service-groups': 'manufacturing.service_groups',
    '/manufacturing/print-templates': 'manufacturing.print_templates',
    '/manufacturing/boms': 'manufacturing.materials',
    '/manufacturing/inventory': 'warehouse.inventory',
    '/manufacturing/work-orders': 'manufacturing.work_sheets',
    '/manufacturing/quality': 'manufacturing.products',

    // Finance
    '/finance/payments': 'finance.payments',
    '/finance/cash-registers': 'finance.cash_registers',
    '/finance/cash-register-setup': 'finance.cash_register_setup',
    '/finance/budgets': 'finance.budgets',
    '/finance/reports': 'finance.reports',
    'pixinvoice-sso': 'finance.invoices',

    // CRM
    '/crm/companies': 'crm.companies',
    '/crm/contacts': 'crm.contacts',
    '/crm/activities': 'crm.activities',
    '/crm/campaigns': 'crm.campaigns',
    '/crm/deals': 'sales.opportunities',

    // Orders
    '/orders/orders': 'orders.customer_orders',
    '/orders/shipments': 'orders.shipments',
    '/orders/returns': 'orders.returns',
    '/orders/suppliers': 'orders.suppliers',

    // Warehouse
    '/warehouse/materials': 'warehouse.materials',
    '/warehouse/material-groups': 'warehouse.material_groups',
    '/warehouse/inventory': 'warehouse.inventory',
    '/warehouse/receipts': 'warehouse.receipts',
    '/warehouse/supplier-invoices': 'warehouse.supplier_invoices',
    '/warehouse/scraps': 'warehouse.scraps',
    '/warehouse/warehouses': 'warehouse.warehouses',
    '/warehouse/suppliers': 'warehouse.suppliers',
    '/warehouse/reports': 'warehouse.reports',
    '/warehouse/picking': 'warehouse.picking',
    '/warehouse/picking-list': 'warehouse.picking_list',

    // POS
    '/pos/sales': 'pos.sales',
    '/pos/registration': 'pos.registration',
    '/pos/terminals': 'pos.terminals',
    '/pos/products': 'pos.products',
    '/pos/customers': 'pos',
    '/pos/reports': 'pos',
    '/pos/transactions': 'pos',
    '/pos/inventory': 'pos',

    // Settings
    '/settings/access-control': 'settings.access_control',
    '/settings/attendance-kiosk': 'settings.attendance_kiosk',
    '/settings/companies': 'settings.company',
    '/settings/currencies': 'settings.currencies',
    '/settings/roles': 'settings.roles',
    '/settings/email-server': 'settings.email',
    '/settings/email-templates': 'settings.email_templates',
    '/settings/signatures': 'settings.signatures',
    '/settings/integrations': 'settings.integrations',
    '/settings/pixinvoice': 'settings.pixinvoice',
    '/settings/hestia': 'settings.hestia',
    '/settings/backup': 'settings.backup',
    '/settings/public-site': 'settings.public_site',
    '/settings/iot': 'settings.iot',
    '/settings/nfc': 'settings.nfc',
    '/settings/zones': 'settings.zones',
    '/settings/pickup-locations': 'settings.pickup_locations',
    '/settings/print-products': 'settings.print_products',
    '/settings/export-import': 'settings.export_import',
    '/site-management': 'site_management.manage',
    '/personal/cash-registers': 'finance.cash_registers',
  };

  const mapKeyToModule = (key: string) => {
    if (key === '/dashboard') return 'dashboard';
    if (key === 'pixinvoice-sso') return 'finance';
    const trimmed = key.startsWith('/') ? key.slice(1) : key;
    const [module] = trimmed.split('/') as string[];
    return module || 'dashboard';
  };

  const hasAccess = (itemKey: string) => {
    if (itemKey === '/personal/cash-registers' && !hasCashRegisterAccess) {
      return false;
    }

    // 1. Always allow Dashboard and Personal
    if (['/dashboard', '/personal', '/tickets', '/storage'].some(k => itemKey.startsWith(k))) {
        return true;
    }

    // Superuser / staff: minden menüpont látszik
    if ((user as any)?.is_superuser || (user as any)?.is_staff) {
        return true;
    }

    const perms = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!perms.length) return false;

    const hasFinanceModuleAccess = perms.some((p: any) => p.module === 'finance' && p.allowed);
    if (itemKey === '/finance/cash-registers' || itemKey === '/finance/cash-register-setup') {
      return hasFinanceModuleAccess || perms.some((p: any) => p.resource === 'finance.cash_registers' && p.allowed);
    }

    // 2. Check Resource Map first
    const resource = RESOURCE_MAP[itemKey];
    if (resource) {
        // If it's a module-only string (no dot), check module
        if (!resource.includes('.')) {
             return perms.some((p: any) => p.module === resource && p.allowed);
        }
        const [resModule] = resource.split('.');
        // Exact resource match OR module-wide permission (empty resource = full module access)
        return perms.some((p: any) => p.allowed && (p.resource === resource || (p.module === resModule && !p.resource)));
    }

    // 3. Fallback to Module Check
    const moduleKey = mapKeyToModule(itemKey);
    return perms.some((p: any) => p.module === moduleKey && p.allowed);
  };

  const filterMenuItems = (items: any[]): any[] => {
    return items
      .map((item) => {
        // Recursively filter children
        const filteredChildren = item.children ? filterMenuItems(item.children) : undefined;
        
        // Determine visibility
        // A section is visible if:
        // 1. It has visible children OR
        // 2. The user has direct permission for it (leaf node)
        
        let visible = false;

        if (filteredChildren && filteredChildren.length > 0) {
            visible = true;
        } else if (!item.children) {
             // Leaf node, check permissions
             visible = hasAccess(item.key);
        } else {
             // Parent node with no children -> check if it has direct access AND no children were filtered out (empty folder?)
             // Actually if it has children property but they are all filtered out, we hide the parent
             // UNLESS the parent itself matches a resource? (Usually parents are just containers in this sidebar)
             visible = false;
        }

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
      const pixinvoiceUrl = `https://i.pixisys.eu/sso-login?token=${encodeURIComponent(ssoToken)}`;
      window.open(pixinvoiceUrl, '_blank');
    } catch (error) {
      console.error('SSO error:', error);
      message.error('Nem sikerült a PixInvoice elérése');
    }
  };

  const renderItemLabel = (key: string, label: string | React.ReactNode, isLeaf = true) => {
    // Special handling for PixInvoice SSO
    if (key === 'pixinvoice-sso') {
      return (
        <a href="#" onClick={(e) => {
          e.preventDefault();
          handlePixInvoiceSSO();
        }}>{label}</a>
      );
    }
    
    // Special handling for POS Sales - open in new fullscreen tab
    if (key === '/pos/sales') {
      return (
        <a href={key} onClick={(e) => {
          e.preventDefault();
          const protocol = window.location.protocol;
          const host = window.location.host;
          const url = `${protocol}//${host}${key}`;
          window.open(url, '_blank', 'fullscreen=yes');
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
        if (isLeaf && onNavigate) onNavigate();
      }}>{label}</a>
    );
  };

  // Map labels to clickable anchors preserving new-tab behavior
  // isLeaf=true only when the item has no children (clicking navigates away)
  const itemsWithLinks = accessibleMenuItems.map((mi: any) => ({
    ...mi,
    label: renderItemLabel(mi.key, mi.label, !mi.children),
    children: mi.children ? mi.children.map((ch: any) => ({
      ...ch,
      label: renderItemLabel(ch.key, ch.label, !ch.children),
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
        height: 56,
        margin: '4px 8px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        color: '#ffffff',
        fontSize: collapsed ? 13 : 36,
        fontWeight: 700,
        letterSpacing: 1
      }}>
        {collapsed ? 'P' : 'PixiERP'}
      </div>
      {isDevMode && (
        <div style={{
          textAlign: 'center',
          color: '#faad14',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1,
          lineHeight: 1,
          marginBottom: 4,
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.2s',
        }}>
          DEV MODE
        </div>
      )}
      <div style={{ paddingBottom: '80px' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={itemsWithLinks}
        />
        {canSwitchUsers && !collapsed && devUsers.length > 0 && (
          <div style={{ padding: '8px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 4, paddingLeft: 2 }}>Felhasználó váltás</div>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={user.id}
              loading={devSwitching}
              onChange={handleDevSwitchUser}
              suffixIcon={<SwapOutlined style={{ color: '#faad14' }} />}
              popupMatchSelectWidth={false}
              options={devUsers.map((u: any) => ({
                value: u.id,
                label: `${u.username}${u.id === originalUserId ? ' ★' : ''}`,
              }))}
              optionFilterProp="label"
              showSearch
            />
          </div>
        )}
      </div>
    </Sider>
  );
};

export default Sidebar;
