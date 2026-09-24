/**
 * Menü-láthatóság közös logikája: a Sidebar és a modul dashboardok
 * (ModuleDashboard csempék) ugyanezen szabály alapján szűrnek, hogy ne
 * lehessen a dashboardról jogosulatlan aloldalra klikkelni.
 */

export const RESOURCE_MAP: Record<string, string> = {
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
  '/manufacturing/calculators': 'manufacturing.calculators',
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
  '/crm/discount-groups': 'crm.discount_groups',
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
  '/settings/modules': 'settings.modules',
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
  '/settings/import': 'settings.export_import',
  '/site-management': 'site_management.manage',
  '/personal/cash-registers': 'finance.cash_registers',
};

export const mapKeyToModule = (key: string) => {
  if (key === '/dashboard') return 'dashboard';
  if (key === 'pixinvoice-sso') return 'finance';
  const trimmed = key.startsWith('/') ? key.slice(1) : key;
  const [module] = trimmed.split('/') as string[];
  return module || 'dashboard';
};

/** Láthatja-e a felhasználó az adott menüpontot / dashboard csempét. */
export const hasMenuAccess = (user: any, itemKey: string): boolean => {
  const isPrivileged = !!user?.is_superuser || !!user?.is_staff;
  const perms: any[] = Array.isArray(user?.permissions) ? user.permissions : [];

  // Az Értékesítés menü csak tényleges sales jogosultsággal jelenik meg.
  // A korábbi kivétel (meghívott/résztvevő userek lássák) megszűnt: a gyártói
  // felhasználók a Gyártás menü alól érik el a munkát, az RFQ adatlap butított
  // módban nyílik meg nekik közvetlen linkkel.
  if (itemKey === '/sales' || itemKey.startsWith('/sales/')) {
    if (!isPrivileged && !perms.some((p: any) => p.module === 'sales' && p.allowed)) {
      return false;
    }
  }

  // Egyedi Gyártás (termékek adminisztrációs oldala): navigation-hez 'view' kell.
  // A gyártói szerepek 'manage' jogosultsága API-szintű műveletekhez van (pl. PrintShop
  // mentés a termékre) — az nem jelenít meg menüt/csempét, csak a valódi view jog.
  if (itemKey === '/manufacturing/products' && !isPrivileged) {
    return perms.some((p: any) => p.allowed && p.resource === 'manufacturing.products' && p.action === 'view');
  }

  // Dashboard és Personal mindig engedélyezett
  if (['/dashboard', '/personal', '/tickets', '/storage'].some(k => itemKey.startsWith(k))) {
    return true;
  }

  // Superuser / staff: minden menüpont látszik
  if (isPrivileged) {
    return true;
  }

  if (!perms.length) return false;

  const hasFinanceModuleAccess = perms.some((p: any) => p.module === 'finance' && p.allowed);
  if (itemKey === '/finance/cash-registers' || itemKey === '/finance/cash-register-setup') {
    return hasFinanceModuleAccess || perms.some((p: any) => p.resource === 'finance.cash_registers' && p.allowed);
  }

  // Először resource szerinti pontos egyezés
  const resource = RESOURCE_MAP[itemKey];
  if (resource) {
    if (!resource.includes('.')) {
      return perms.some((p: any) => p.module === resource && p.allowed);
    }
    const [resModule] = resource.split('.');
    // Pontos resource VAGY modul-szintű (üres resource) jogosultság
    return perms.some((p: any) => p.allowed && (p.resource === resource || (p.module === resModule && !p.resource)));
  }

  // Végül modul-szintű fallback
  const moduleKey = mapKeyToModule(itemKey);
  return perms.some((p: any) => p.module === moduleKey && p.allowed);
};
