import axios from 'axios';

const DEFAULT_FAM_BASE = 'http://localhost:8010/api/v1/fam';
const BASE_KEY = 'fam_api_base_url';
const SYSTEM_KEY = 'fam_system_id';

const normalizeBase = (value?: string): string => {
  const raw = (value || DEFAULT_FAM_BASE).trim().replace(/\/$/, '');
  if (raw.endsWith('/api/v1/fam')) return raw;
  if (raw.endsWith('/api/v1')) return `${raw}/fam`;
  if (raw.endsWith('/api')) return `${raw}/v1/fam`;
  return `${raw}/api/v1/fam`;
};

export const getFamBaseUrl = (): string => {
  const envBase = process.env.REACT_APP_FAM_API_URL;
  const stored = localStorage.getItem(BASE_KEY) || undefined;
  return normalizeBase(stored || envBase || DEFAULT_FAM_BASE);
};

export const setFamBaseUrl = (url: string) => {
  localStorage.setItem(BASE_KEY, normalizeBase(url));
};

export const getFamSystemId = (): string => {
  return localStorage.getItem(SYSTEM_KEY) || process.env.REACT_APP_FAM_SYSTEM_ID || 'C00000001';
};

export const setFamSystemId = (systemId: string) => {
  localStorage.setItem(SYSTEM_KEY, systemId.trim());
};

const createClient = () => axios.create({
  baseURL: getFamBaseUrl(),
  timeout: 15000,
});

const getServiceRoot = () => getFamBaseUrl().replace(/\/api\/v1\/fam$/, '');

export const famApi = {
  health: async () => {
    const response = await axios.get(`${getServiceRoot()}/health`);
    return response.data;
  },

  getSystemStatus: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().get(`/system/status/${systemId}`);
    return response.data;
  },

  stateCheck: async (systemId: string = getFamSystemId(), timestamp: number) => {
    const response = await createClient().get(`/system/state-check/${systemId}/${timestamp}`);
    return response.data;
  },

  telemetryHello: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().post('/telemetry/hello', { systemId });
    return response.data;
  },

  openDay: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().post('/fiscal/open-day', { systemId });
    return response.data;
  },

  closeDay: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().post('/fiscal/close-day', { systemId });
    return response.data;
  },

  queryTaxpayer: async (systemId: string = getFamSystemId(), taxpayerId: string) => {
    const response = await createClient().post('/telemetry/query-taxpayer', { systemId, taxpayerId });
    return response.data;
  },

  sendEvent: async (systemId: string = getFamSystemId(), ecrEventType: string, ecrEventValue?: string) => {
    const response = await createClient().post('/telemetry/ecr-event', { systemId, ecrEventType, ecrEventValue });
    return response.data;
  },

  getCurrencies: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().get(`/currency/${systemId}`);
    return response.data;
  },

  saveCurrency: async (systemId: string = getFamSystemId(), payload: { currencyCode: string; conversionValue: string; displayPrecision: number; isNative: boolean; symbol: string }) => {
    const response = await createClient().post(`/currency/${systemId}`, payload);
    return response.data;
  },

  deleteCurrency: async (systemId: string = getFamSystemId(), currencyCode: string) => {
    const response = await createClient().delete(`/currency/${systemId}/${currencyCode}`);
    return response.data;
  },

  getPaymentMethods: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().get(`/payment-method/${systemId}`);
    return response.data;
  },

  getPredefinedPaymentMethods: async () => {
    const response = await createClient().get('/payment-method/predefined');
    return response.data;
  },

  savePaymentMethod: async (systemId: string = getFamSystemId(), payload: { id?: number; displayName: string; moneyCat: string; moneySubCat?: string; currency: string; sortKey: string }) => {
    const response = await createClient().post(`/payment-method/${systemId}`, {
      ...payload,
      systemId,
    });
    return response.data;
  },

  deletePaymentMethod: async (systemId: string = getFamSystemId(), paymentMethodId: number) => {
    const response = await createClient().delete(`/payment-method/${systemId}/${paymentMethodId}`);
    return response.data;
  },

  getEventLogs: async (systemId: string = getFamSystemId(), limit: number = 200) => {
    const response = await createClient().get('/logs/events', { params: { systemId, limit } });
    return response.data;
  },

  getErrorLogs: async (systemId: string = getFamSystemId(), limit: number = 200) => {
    const response = await createClient().get('/logs/errors', { params: { systemId, limit } });
    return response.data;
  },

  getNavConfig: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().get(`/config/nav/${systemId}`);
    return response.data;
  },

  saveNavConfig: async (
    systemId: string = getFamSystemId(),
    config: {
      mode: string;
      env: string;
      connector: string;
      base_url: string;
      api_key: string;
      live_submit_path: string;
      live_taxpayer_path: string;
      hepg_base_url: string;
      hepg_submit_path: string;
      hepg_api_key: string;
      hepg_device_id: string;
      tech_user: string;
      tech_password: string;
      signing_key_ref: string;
      exchange_key_ref: string;
      invoice_enabled: boolean;
      ereceipt_enabled: boolean;
      timeout_sec: number;
      retry_limit: number;
    },
  ) => {
    const response = await createClient().put(`/config/nav/${systemId}`, config);
    return response.data;
  },

  getReadiness: async (systemId: string = getFamSystemId()) => {
    const response = await createClient().get(`/readiness/${systemId}`);
    return response.data;
  },

  submitDocument: async (
    systemId: string = getFamSystemId(),
    payload: {
      documentType: 'receipt' | 'invoice';
      source?: string;
      externalId: string;
      payload: Record<string, any>;
    },
  ) => {
    const response = await createClient().post('/documents/submit', {
      systemId,
      ...payload,
    });
    return response.data;
  },

  getDocuments: async (systemId: string = getFamSystemId(), status?: string, limit: number = 200) => {
    const response = await createClient().get('/documents', {
      params: {
        systemId,
        status,
        limit,
      },
    });
    return response.data;
  },

  retryDocument: async (documentId: number) => {
    const response = await createClient().post(`/documents/${documentId}/retry`);
    return response.data;
  },
};

export default famApi;
