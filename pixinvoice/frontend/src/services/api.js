import axios from 'axios';

// API base URL - ha REACT_APP_API_URL be van állítva, használd azt
// Különben production módban használj relatív útvonalat, dev módban localhost-ot
const rawBaseUrl = (process.env.REACT_APP_API_URL ?? '').trim() !== ''
  ? process.env.REACT_APP_API_URL
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4001');
const trimmedBaseUrl = rawBaseUrl.replace(/\/+$/, '');
// Távolítsd el a végéről az /api-t, hogy elkerüljük a dupla /api/api hívásokat
const API_BASE_URL = trimmedBaseUrl.endsWith('/api') ? trimmedBaseUrl.slice(0, -4) : trimmedBaseUrl;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 másodperces timeout
  timeoutErrorMessage: 'A kérés túllépte az időkorlátot (30s)',
});

// Add CSRF token to requests
api.interceptors.request.use((config) => {
  // Let the browser set multipart boundaries for FormData requests.
  if (typeof FormData !== 'undefined' && config?.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }

  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  try {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
      config.headers['X-Api-Key'] = apiKey;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

// Response interceptor - automatikus újrapróbálkozás hálózati hibáknál
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Ha nincs válasz (hálózati hiba, timeout), próbáljuk újra max 2x
    if (!error.response && !config._retry) {
      config._retry = (config._retry || 0) + 1;
      
      if (config._retry <= 2) {
        console.log(`Újrapróbálás (${config._retry}/2)...`);
        // Várunk egy kicsit mielőtt újrapróbálnánk (exponenciális backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * config._retry));
        return api(config);
      }
    }

    // Ha 403 Forbidden és van apiKey, akkor lehet hogy lejárt a session
    if (error.response?.status === 403) {
      const apiKey = localStorage.getItem('apiKey');
      if (apiKey && window.location.pathname !== '/login') {
        console.warn('Session lejárt vagy érvénytelen API kulcs');
        // Opcionálisan: átirányítás login oldalra
        // window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// API endpoints
export const invoiceAPI = {
  // Get all invoices
  getInvoices: (params = {}) => api.get('/api/invoices/', { params }),
  getOpenAdvances: (params = {}) => api.get('/api/invoices/open_advances/', { params }),
  // Get unpaid invoices (searchable)
  getUnpaidInvoices: (params = {}) => api.get('/api/invoices/unpaid/', { params }),
  
  // Get single invoice
  getInvoice: (id) => api.get(`/api/invoices/${id}/`),
  
  // Create invoice
  createInvoice: (data) => api.post('/api/invoices/', data),
  // Create manual incoming invoice digest (for non-NAV/foreign invoices)
  createIncomingManual: (data) => api.post('/api/invoices/incoming/manual_create/', data),
  getIncomingManual: (companyId, digestId) => api.post('/api/invoices/incoming/manual_get/', { company_id: companyId, digest_id: digestId }),
  updateIncomingManual: (data) => api.post('/api/invoices/incoming/manual_update/', data),
  deleteIncomingManual: async (companyId, digestId) => {
    const payload = { company_id: companyId, digest_id: digestId };
    try {
      return await api.post('/api/invoices/incoming/manual_delete/', payload);
    } catch (error) {
      if (error?.response?.status !== 404) throw error;
      return api.post('/api/invoices/incoming/manual-delete/', payload);
    }
  },
  parseIncomingDocument: (companyId, file) => {
    const fd = new FormData();
    if (companyId) fd.append('company_id', companyId);
    if (file) fd.append('file', file);
    return api.post('/api/invoices/incoming/parse-document/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  
  // Update invoice
  updateInvoice: (id, data) => api.put(`/api/invoices/${id}/`, data),
  
  // Delete invoice
  deleteInvoice: (id) => api.delete(`/api/invoices/${id}/`),
  
  // Submit to NAV
  submitToNAV: (id) => api.post(`/api/invoices/${id}/submit_to_nav/`),
  
  // Get NAV status
  getNAVStatus: (id) => api.get(`/api/invoices/${id}/nav_status/`),
  // Storno endpoints
  storno: (id) => api.post(`/api/invoices/${id}/storno/`),
  cascadeStorno: (id) => api.post(`/api/invoices/${id}/cascade_storno/`),
  advanceUsage: (id) => api.get(`/api/invoices/${id}/advance_usage/`),
  // Email send
  sendEmail: (id, payload) => api.post(`/api/invoices/${id}/send_email/`, payload),
  // Draft EML for single invoice (download)
  draftEML: (id, payload) => api.post(`/api/invoices/${id}/draft_eml/`, payload, { responseType: 'blob' }),
  // Bulk email send
  sendBulkEmail: (payload) => api.post(`/api/invoices/send_bulk_email/`, payload),
  // Overdue receivables workflow
  getArrearsList: (params = {}) => api.get('/api/invoices/arrears-list/', { params }),
  advanceArrearsStatus: (payload) => api.post('/api/invoices/arrears-advance-status/', payload),
  // Scheduled invoices workflow
  createScheduledInvoice: (payload) => api.post('/api/invoices/scheduled-invoices/create/', payload),
  listScheduledInvoices: (params = {}) => api.get('/api/invoices/scheduled-invoices/list/', { params }),
  processScheduledInvoices: (payload) => api.post('/api/invoices/scheduled-invoices/process/', payload),
  approveScheduledInvoices: (payload) => api.post('/api/invoices/scheduled-invoices/approve/', payload),
  getScheduledInvoiceTemplate: (id) => api.get(`/api/invoices/scheduled-invoices/${id}/template/`),
  updateScheduledInvoice: (id, payload) => api.put(`/api/invoices/scheduled-invoices/${id}/update/`, payload),
  deleteScheduledInvoice: (id) => api.delete(`/api/invoices/scheduled-invoices/${id}/delete/`),
  toggleScheduledInvoiceActive: (id, payload = {}) => api.post(`/api/invoices/scheduled-invoices/${id}/toggle-active/`, payload),
  getScheduledInvoiceRuns: (id) => api.get(`/api/invoices/scheduled-invoices/${id}/invoices/`),
  // Bulk draft EML (download)
  draftBulkEML: (payload) => api.post(`/api/invoices/draft_bulk_eml/`, payload, { responseType: 'blob' }),
  
  // Get statistics
  getStatistics: (params = {}) => api.get('/api/invoices/statistics/', { params }),
};

export const currencyAPI = {
  getCurrencies: (params) => api.get('/api/currencies/', { params }),
  getCurrency: (id) => api.get(`/api/currencies/${id}/`),
  createCurrency: (data) => api.post('/api/currencies/', data),
  updateCurrency: (id, data) => api.put(`/api/currencies/${id}/`, data),
  deleteCurrency: (id) => api.delete(`/api/currencies/${id}/`),
  updateMNB: () => api.post('/api/currencies/update-mnb/'),
  getMNBCurrencies: () => api.get('/api/currencies/mnb-currencies/'),
};

export const customerAPI = {
  // Get all customers
  getCustomers: (params = {}) => api.get('/api/customers/', { params }),
  
  // Get single customer
  getCustomer: (id) => api.get(`/api/customers/${id}/`),
  
  // Create customer
  createCustomer: (data) => api.post('/api/customers/', data),
  
  // Update customer
  updateCustomer: (id, data) => api.put(`/api/customers/${id}/`, data),
  
  // Delete customer
  deleteCustomer: (id) => api.delete(`/api/customers/${id}/`),
  
  // Look up taxpayer from NAV
  lookupTaxpayer: (taxNumber, companyId = null) => api.post('/api/customers/lookup_taxpayer/', { 
    tax_number: taxNumber,
    company_id: companyId 
  }),
  
  // Token exchange with NAV
  tokenExchange: () => api.post('/api/customers/token_exchange/', {}),
  
  // Check for duplicate tax number
  checkDuplicateTaxNumber: (taxNumber, customerId = null) => api.post('/api/customers/check_duplicate_tax_number/', { 
    tax_number: taxNumber, 
    customer_id: customerId 
  }),
  // Validate EU VAT number
  validateEuVat: (data) => api.post('/api/customers/validate_eu_vat/', data),
  // Fetch bank accounts from external registry (stubbed backend)
  fetchBankAccounts: (customerId) => api.post(`/api/customers/${customerId}/fetch_bank_accounts/`),
};

export const navConfigAPI = {
  // Get all NAV configurations
  getConfigurations: () => api.get('/api/nav-configurations/'),
  
  // Get single configuration
  getConfiguration: (id) => api.get(`/api/nav-configurations/${id}/`),
  
  // Create configuration
  createConfiguration: (data) => api.post('/api/nav-configurations/', data),
  
  // Update configuration
  updateConfiguration: (id, data) => api.put(`/api/nav-configurations/${id}/`, data),
  
  // Delete configuration
  deleteConfiguration: (id) => api.delete(`/api/nav-configurations/${id}/`),
  
  // Test connection
  testConnection: (id) => api.post(`/api/nav-configurations/${id}/test_connection/`),
  
  // Set active
  setActive: (id) => api.post(`/api/nav-configurations/${id}/set_active/`),
};

export const contactAPI = {
  // Get all contacts
  getContacts: (params = {}) => api.get('/api/contacts/', { params }),
  
  // Get single contact
  getContact: (id) => api.get(`/api/contacts/${id}/`),
  
  // Create contact
  createContact: (data) => api.post('/api/contacts/', data),
  
  // Update contact
  updateContact: (id, data) => api.put(`/api/contacts/${id}/`, data),
  
  // Delete contact
  deleteContact: (id) => api.delete(`/api/contacts/${id}/`),
  
  // Set as primary
  setPrimary: (id) => api.post(`/api/contacts/${id}/set_primary/`),
  
  // Toggle active status
  toggleActive: (id) => api.post(`/api/contacts/${id}/toggle_active/`),
};

export const companyAPI = {
  // Get all companies
  getCompanies: (params = {}) => api.get('/api/companies/', { params }),
  
  // Get single company
  getCompany: (id) => api.get(`/api/companies/${id}/`),
  
  // Create company
  createCompany: (data) => api.post('/api/companies/', data),
  
  // Update company
  updateCompany: (id, data) => api.put(`/api/companies/${id}/`, data),

  // Patch company (partial update)
  patchCompany: (id, data) => api.patch(`/api/companies/${id}/`, data),
  
  // Delete company
  deleteCompany: (id) => api.delete(`/api/companies/${id}/`),

  // Import company data from a customer (address + optional bank accounts)
  importFromCustomer: (id, { customer_id, include_accounts = true }) =>
    api.post(`/api/companies/${id}/import_from_customer/`, { customer_id, include_accounts }),

  // Toggle XML logging (and clear folder when disabling)
  toggleXmlLogging: (id, enabled) => api.post(`/api/companies/${id}/toggle_xml_logging/`, { enabled }),

  // Regenerate API key
  regenerateApiKey: (id) => api.post(`/api/companies/${id}/regenerate_api_key/`),
};

export const backupAPI = {
  export: (companyId, scopes = []) => {
    const payload = { scopes };
    return api.post(`/api/companies/${companyId}/backup_export/`, payload, { responseType: 'blob' });
  },
  import: (companyId, file, { scopes = [], strategy = 'replace' } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('strategy', strategy);
    scopes.forEach(s => fd.append('scopes', s));
    return api.post(`/api/companies/${companyId}/backup_import/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

export const companyBankAccountAPI = {
  getAccounts: (params = {}) => api.get('/api/company-bank-accounts/', { params }),
  createAccount: (data) => api.post('/api/company-bank-accounts/', data),
  updateAccount: (id, data) => api.put(`/api/company-bank-accounts/${id}/`, data),
  deleteAccount: (id) => api.delete(`/api/company-bank-accounts/${id}/`),
  setPrimary: (id) => api.post(`/api/company-bank-accounts/${id}/set_primary/`),
};

export const roleAPI = {
  getRoles: (params = {}) => api.get('/api/roles/', { params }),
  getRole: (id) => api.get(`/api/roles/${id}/`),
  createRole: (data) => api.post('/api/roles/', data),
  updateRole: (id, data) => api.put(`/api/roles/${id}/`, data),
  deleteRole: (id) => api.delete(`/api/roles/${id}/`),
  menuOptions: () => api.get('/api/roles/menu_options/'),
};

export const systemUserAPI = {
  // Get all system users
  getSystemUsers: (params = {}) => api.get('/api/system-users/', { params }),
  
  // Get single system user
  getSystemUser: (id) => api.get(`/api/system-users/${id}/`),
  
  // Create system user
  createSystemUser: (data) => api.post('/api/system-users/', data),
  
  // Update system user
  updateSystemUser: (id, data) => api.put(`/api/system-users/${id}/`, data),
  
  // Delete system user
  deleteSystemUser: (id) => api.delete(`/api/system-users/${id}/`),
  
  // Set password
  setPassword: (id, password) => api.post(`/api/system-users/${id}/set_password/`, { password }),
  
  // Check password
  checkPassword: (id, password) => api.post(`/api/system-users/${id}/check_password/`, { password }),
};

export const invoiceBlockAPI = {
  // Get all invoice blocks
  getInvoiceBlocks: (params = {}) => api.get('/api/invoice-blocks/', { params }),
  
  // Get single invoice block
  getInvoiceBlock: (id) => api.get(`/api/invoice-blocks/${id}/`),
  
  // Create invoice block
  createInvoiceBlock: (data) => api.post('/api/invoice-blocks/', data),
  
  // Update invoice block
  // Use PATCH to allow partial updates (PUT required all fields and caused 400)
  updateInvoiceBlock: (id, data) => api.patch(`/api/invoice-blocks/${id}/`, data),
  
  // Delete invoice block
  deleteInvoiceBlock: (id) => api.delete(`/api/invoice-blocks/${id}/`),
  
  // Generate invoice number
  generateInvoiceNumber: (id) => api.post(`/api/invoice-blocks/${id}/generate_invoice_number/`),
  // Preview next invoice number
  previewNextNumber: (id) => api.get(`/api/invoice-blocks/${id}/preview_next_number/`),
  
  // Toggle active status
  toggleActive: (id) => api.post(`/api/invoice-blocks/${id}/toggle_active/`),
};

export const companyNAVConfigAPI = {
  // Get all company NAV configurations
  getCompanyNAVConfigurations: (params = {}) => api.get('/api/company-nav-configurations/', { params }),
  
  // Get single configuration
  getCompanyNAVConfiguration: (id) => api.get(`/api/company-nav-configurations/${id}/`),
  
  // Create configuration
  createCompanyNAVConfiguration: (data) => api.post('/api/company-nav-configurations/', data),
  
  // Update configuration
  updateCompanyNAVConfiguration: (id, data) => api.patch(`/api/company-nav-configurations/${id}/`, data),
  
  // Delete configuration
  deleteCompanyNAVConfiguration: (id) => api.delete(`/api/company-nav-configurations/${id}/`),
  
  // Test connection
  testConnection: (id) => api.post(`/api/company-nav-configurations/${id}/test_connection/`),
  
  // Set as default
  setDefault: (id) => api.post(`/api/company-nav-configurations/${id}/set_default/`),
  
  // Toggle active status
  toggleActive: (id) => api.post(`/api/company-nav-configurations/${id}/toggle_active/`),
};

export const emailSettingsAPI = {
  getSettings: (params = {}) => api.get('/api/company-email-settings/', { params }),
  getById: (id) => api.get(`/api/company-email-settings/${id}/`),
  create: (data) => api.post('/api/company-email-settings/', data),
  update: (id, data) => api.put(`/api/company-email-settings/${id}/`, data),
  testSMTP: (data = {}) => api.post('/api/company-email-settings/test_smtp/', data),
  testIMAP: (data = {}) => api.post('/api/company-email-settings/test_imap/', data),
  imapRecent: (data = {}) => api.post('/api/company-email-settings/imap_recent/', data),
  async detectIMAPSent(payload) {
    const res = await api.post('/api/company-email-settings/detect_imap_sent/', payload);
    return res.data;
  }
};

export const emailTemplateAPI = {
  list: (params = {}) => api.get('/api/email-templates/', { params }),
  get: (id) => api.get(`/api/email-templates/${id}/`),
  create: (data) => api.post('/api/email-templates/', data),
  update: (id, data) => api.put(`/api/email-templates/${id}/`, data),
  delete: (id) => api.delete(`/api/email-templates/${id}/`),
  ensureDefaults: (data) => api.post('/api/email-templates/ensure_defaults/', data),
};

export const emailSignatureAPI = {
  list: (params = {}) => api.get('/api/email-signatures/', { params }),
  get: (id) => api.get(`/api/email-signatures/${id}/`),
  create: (data) => api.post('/api/email-signatures/', data),
  update: (id, data) => api.put(`/api/email-signatures/${id}/`, data),
  delete: (id) => api.delete(`/api/email-signatures/${id}/`),
  setDefault: (id) => api.post(`/api/email-signatures/${id}/set_default/`),
};

export const cronJobAPI = {
  list: (params = {}) => api.get('/api/cron-jobs/', { params }),
  update: (id, data) => api.patch(`/api/cron-jobs/${id}/`, data),
};

export const customerBankAccountAPI = {
  getAccounts: (params = {}) => api.get('/api/customer-bank-accounts/', { params }),
  createAccount: (data) => api.post('/api/customer-bank-accounts/', data),
  updateAccount: (id, data) => api.put(`/api/customer-bank-accounts/${id}/`, data),
  deleteAccount: (id) => api.delete(`/api/customer-bank-accounts/${id}/`),
  setPrimary: (id) => api.post(`/api/customer-bank-accounts/${id}/set_primary/`),
};

export const utilsAPI = {
  getExchangeRate: (currency, date) => api.get('/api/utils/exchange_rate/', { params: { currency, date } }),
};

export const vatTypesAPI = {
  getVATTypes: (params = {}) => api.get('/api/vat-types/', { params }),
  getVATType: (id) => api.get(`/api/vat-types/${id}/`),
  createVATType: (data) => api.post('/api/vat-types/', data),
  updateVATType: (id, data) => api.put(`/api/vat-types/${id}/`, data),
  deleteVATType: (id) => api.delete(`/api/vat-types/${id}/`),
};

export const bankStatementsAPI = {
  getStatements: (params = {}) => api.get('/api/bank-statements/', { params }),
  getAllStatements: async (params = {}) => {
    const pageSize = 500;
    let page = 1;
    let guard = 0;
    const collected = [];

    while (guard < 300) {
      guard += 1;
      const res = await api.get('/api/bank-statements/', {
        params: {
          ...params,
          page,
          page_size: pageSize,
        },
      });

      const data = res?.data;
      if (Array.isArray(data)) {
        return data;
      }

      const rows = Array.isArray(data?.results) ? data.results : [];
      collected.push(...rows);

      const hasNext = !!data?.next;
      const pageCount = Number(data?.pageCount || data?.total_pages || 0);
      const hasMoreByPageCount = Number.isFinite(pageCount) && pageCount > 0 ? page < pageCount : false;
      const hasMoreByChunk = !hasNext && !hasMoreByPageCount && rows.length === pageSize;

      if (!hasNext && !hasMoreByPageCount && !hasMoreByChunk) {
        break;
      }
      page += 1;
    }

    return collected;
  },
  getStatement: (id, params = {}) => api.get(`/api/bank-statements/${id}/`, { params }),
  createStatement: (data) => api.post('/api/bank-statements/', data),
  updateStatement: (id, data) => api.patch(`/api/bank-statements/${id}/`, data),
  deleteStatement: (id) => api.delete(`/api/bank-statements/${id}/`),
  importZip: (companyId, files) => {
    const fd = new FormData();
    fd.append('company', companyId);
    (files||[]).forEach((f) => fd.append('files', f));
    return api.post('/api/bank-statements/import-zip/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importZipDryRun: (companyId, files) => {
    const fd = new FormData();
    fd.append('company', companyId);
    fd.append('dry_run', '1');
    (files||[]).forEach((f) => fd.append('files', f));
    return api.post('/api/bank-statements/import-zip/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importZipCommit: (companyId, files) => {
    const fd = new FormData();
    fd.append('company', companyId);
    (files||[]).forEach((f) => fd.append('files', f));
    return api.post('/api/bank-statements/import-zip/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importStmDryRun: (companyId, files, options = {}) => {
    const fd = new FormData();
    fd.append('company', companyId);
    fd.append('dry_run', '1');
    if (options?.skipExisting) {
      fd.append('skip_existing', '1');
    }
    (files||[]).forEach((f) => fd.append('files', f));
    return api.post('/api/bank-statements/import-stm/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importStmCommit: (companyId, statements) => {
    return api.post('/api/bank-statements/import-stm-commit/', { company: companyId, statements });
  },
};

export const cashRegisterAPI = {
  list: (params = {}) => api.get('/api/cash-registers/', { params }),
  get: (id) => api.get(`/api/cash-registers/${id}/`),
  create: (data) => api.post('/api/cash-registers/', data),
  update: (id, data) => api.patch(`/api/cash-registers/${id}/`, data),
  delete: (id) => api.delete(`/api/cash-registers/${id}/`),
};

export const cashRegisterTransactionAPI = {
  list: (params = {}) => api.get('/api/cash-register-transactions/', { params }),
  create: (data) => api.post('/api/cash-register-transactions/', data),
};

export const apiAccessAPI = {
  get: (params = {}) => api.get('/api/api-access/', { params }),
  save: (data) => api.put('/api/api-access/', data),
};

export const apiClientAPI = {
  list: (params = {}) => api.get('/api/api-clients/', { params }),
  create: (data) => api.post('/api/api-clients/', data),
  regenerateKey: (id) => api.post(`/api/api-clients/${id}/regenerate_key/`),
  toggleActive: (id) => api.post(`/api/api-clients/${id}/toggle_active/`),
  getRules: (id) => api.get(`/api/api-clients/${id}/rules/`),
  saveRules: (id, data) => api.put(`/api/api-clients/${id}/save_rules/`, data),
  delete: (id) => api.delete(`/api/api-clients/${id}/`),
};

export const incomingDocsAPI = {
  list: (params = {}) => api.get('/api/incoming-documents/', { params }),
  upload: (data = {}) => {
    const fd = new FormData();
    if (data.company_id) fd.append('company_id', data.company_id);
    if (data.invoice_number) fd.append('invoice_number', data.invoice_number);
    if (data.supplier_tax_number) fd.append('supplier_tax_number', data.supplier_tax_number);
    if (data.type) fd.append('type', data.type);
    if (data.comment) fd.append('comment', data.comment);
    if (data.file) fd.append('file', data.file);
    return api.post('/api/incoming-documents/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete: (id) => api.delete(`/api/incoming-documents/${id}/`),
  setComment: (id, comment) => api.post(`/api/incoming-documents/${id}/set_comment/`, { comment }),
  download: (id) => api.get(`/api/incoming-documents/${id}/download/`, { responseType: 'blob' }),
};

export const proformaAPI = {
  getProformas: (params = {}) => api.get('/api/proformas/', { params }),
  getProforma: (id) => api.get(`/api/proformas/${id}/`),
  createProforma: (data) => api.post('/api/proformas/', data),
  updateProforma: (id, data) => api.put(`/api/proformas/${id}/`, data),
  deleteProforma: (id) => api.delete(`/api/proformas/${id}/`),
  copyProforma: (id) => api.post(`/api/proformas/${id}/copy/`),
  createInvoice: (id, data) => api.post(`/api/proformas/${id}/create_invoice/`, data),
  createAdvanceInvoice: (id, data) => api.post(`/api/proformas/${id}/create_advance_invoice/`, data),
};

export const incomingProformaAPI = {
  list: (params = {}) => api.get('/api/incoming-proformas/list/', { params }),
  get: (companyId, id) => api.get('/api/incoming-proformas/get/', { params: { company_id: companyId, id } }),
  create: (data) => api.post('/api/incoming-proformas/create/', data),
  update: (data) => api.post('/api/incoming-proformas/update/', data),
  delete: (companyId, id) => api.post('/api/incoming-proformas/delete/', { company_id: companyId, id }),
  setStatus: (companyId, id, statusVal) => api.post('/api/incoming-proformas/set-status/', { company_id: companyId, id, status: statusVal }),
  setPaymentMethod: (companyId, id, pm) => api.post('/api/incoming-proformas/set-payment-method/', { company_id: companyId, id, payment_method: pm }),
  markPaid: (companyId, id, paymentDate) => api.post('/api/incoming-proformas/mark-paid/', { company_id: companyId, id, payment_date: paymentDate }),
  addInvoiceLink: (data) => api.post('/api/incoming-proformas/add-invoice-link/', data),
  removeInvoiceLink: (companyId, linkId, proformaId) => api.post('/api/incoming-proformas/remove-invoice-link/', { company_id: companyId, link_id: linkId, proforma_id: proformaId }),
  suggestInvoices: (companyId, supplierTaxNumber, search, proformaId = null, supplierCustomerId = null) => api.get('/api/incoming-proformas/suggest-invoices/', { params: { company_id: companyId, supplier_tax_number: supplierTaxNumber, search, proforma_id: proformaId, supplier_customer_id: supplierCustomerId } }),
  uploadDocument: (companyId, proformaId, file, type = 'IMAGE', comment = '') => {
    const fd = new FormData();
    if (companyId && companyId !== 'undefined' && companyId !== 'null') {
      fd.append('company_id', companyId);
    }
    fd.append('proforma_id', proformaId);
    fd.append('id', proformaId);
    fd.append('file', file);
    fd.append('document', file);
    fd.append('type', type);
    if (comment) fd.append('comment', comment);
    return api.post('/api/incoming-proformas/upload-document/', fd);
  },
  deleteDocument: (companyId, documentId) => api.post('/api/incoming-proformas/delete-document/', { company_id: companyId, document_id: documentId }),
  setDocumentComment: (companyId, documentId, comment) => api.post('/api/incoming-proformas/set-document-comment/', { company_id: companyId, document_id: documentId, comment }),
  parseDocument: (companyId, file) => {
    const fd = new FormData();
    if (companyId && companyId !== 'undefined' && companyId !== 'null') {
      fd.append('company_id', companyId);
    }
    fd.append('file', file);
    return api.post('/api/incoming-proformas/parse-document/', fd);
  },
};

export const importAPI = {
  importCustomers: (formData) => api.post('/api/import/customers/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  importContacts: (formData) => api.post('/api/import/contacts/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  downloadCustomerSample: () => api.get('/api/import/sample/customers/', {
    responseType: 'blob'
  }),
  downloadContactSample: () => api.get('/api/import/sample/contacts/', {
    responseType: 'blob'
  }),
};

export default api;

