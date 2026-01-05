import axios from 'axios';

const DEFAULT_DEV_API_BASE_URL = 'http://localhost:4001';
const DEFAULT_PROD_API_BASE_URL = '';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? DEFAULT_PROD_API_BASE_URL : DEFAULT_DEV_API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add CSRF token to requests
api.interceptors.request.use((config) => {
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
  // Bulk draft EML (download)
  draftBulkEML: (payload) => api.post(`/api/invoices/draft_bulk_eml/`, payload, { responseType: 'blob' }),
  
  // Get statistics
  getStatistics: () => api.get('/api/invoices/statistics/'),
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
  lookupTaxpayer: (taxNumber) => api.post('/api/customers/lookup_taxpayer/', { tax_number: taxNumber }),
  
  // Token exchange with NAV
  tokenExchange: () => api.post('/api/customers/token_exchange/', {}),
  
  // Check for duplicate tax number
  checkDuplicateTaxNumber: (taxNumber, customerId = null) => api.post('/api/customers/check_duplicate_tax_number/', { 
    tax_number: taxNumber, 
    customer_id: customerId 
  }),
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
  updateCompanyNAVConfiguration: (id, data) => api.put(`/api/company-nav-configurations/${id}/`, data),
  
  // Delete configuration
  deleteCompanyNAVConfiguration: (id) => api.delete(`/api/company-nav-configurations/${id}/`),
  
  // Test connection
  testConnection: (id) => api.post(`/api/company-nav-configurations/${id}/test_connection/`),
  
  // Set as default
  setDefault: (id) => api.post(`/api/company-nav-configurations/${id}/set_default/`),
  
  // Toggle active status
  toggleActive: (id) => api.post(`/api/company-nav-configurations/${id}/toggle_active/`),
  
  // Look up taxpayer
  lookupTaxpayer: (id, taxNumber) => api.post(`/api/company-nav-configurations/${id}/lookup_taxpayer/`, { tax_number: taxNumber }),
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

export const customerBankAccountAPI = {
  getAccounts: (params = {}) => api.get('/api/customer-bank-accounts/', { params }),
  createAccount: (data) => api.post('/api/customer-bank-accounts/', data),
  updateAccount: (id, data) => api.put(`/api/customer-bank-accounts/${id}/`, data),
  deleteAccount: (id) => api.delete(`/api/customer-bank-accounts/${id}/`),
  setPrimary: (id) => api.post(`/api/customer-bank-accounts/${id}/set_primary/`),
};

export const utilsAPI = {
  getExchangeRate: (currency) => api.get('/api/utils/exchange_rate/', { params: { currency } }),
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
  getStatement: (id) => api.get(`/api/bank-statements/${id}/`),
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
  importStmDryRun: (companyId, files) => {
    const fd = new FormData();
    fd.append('company', companyId);
    fd.append('dry_run', '1');
    (files||[]).forEach((f) => fd.append('files', f));
    return api.post('/api/bank-statements/import-stm/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importStmCommit: (companyId, statements) => {
    return api.post('/api/bank-statements/import-stm-commit/', { company: companyId, statements });
  },
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

export default api;
