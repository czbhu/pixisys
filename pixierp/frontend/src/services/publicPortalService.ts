import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

const publicApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getPortalToken = () => localStorage.getItem('portal_access_token') || '';

const authHeaders = () => {
  const token = getPortalToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const publicPortalService = {
  async resolveSite(host?: string, key?: string) {
    const response = await publicApi.get('/public-sites/resolve/', {
      params: {
        ...(host ? { host } : {}),
        ...(key ? { key } : {}),
      },
    });
    return response.data;
  },

  async getConfig() {
    const response = await publicApi.get('/public-site/config/');
    return response.data;
  },

  async updateConfig(payload: any) {
    const accessToken = localStorage.getItem('access_token');
    const response = await publicApi.patch('/public-site/config/', payload, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    return response.data;
  },

  async getPortalUsers() {
    const accessToken = localStorage.getItem('access_token');
    const response = await publicApi.get('/client-portal-users/', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    return response.data.results || response.data;
  },

  async createPortalUser(payload: any) {
    const accessToken = localStorage.getItem('access_token');
    const response = await publicApi.post('/client-portal-users/', payload, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    return response.data;
  },

  async updatePortalUser(id: number, payload: any) {
    const accessToken = localStorage.getItem('access_token');
    const response = await publicApi.patch(`/client-portal-users/${id}/`, payload, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await publicApi.post('/public-site/portal/login/', { email, password });
    return response.data;
  },

  async me() {
    const response = await publicApi.get('/public-site/portal/me/', {
      headers: authHeaders(),
    });
    return response.data;
  },

  async logout() {
    const response = await publicApi.post('/public-site/portal/logout/', {}, {
      headers: authHeaders(),
    });
    return response.data;
  },

  async getDashboard() {
    const response = await publicApi.get('/public-site/portal/dashboard/', {
      headers: authHeaders(),
    });
    return response.data;
  },

  async createTicket(payload: { title: string; body_html: string; ticket_type?: string; priority?: string }) {
    const response = await publicApi.post('/public-site/portal/tickets/', payload, {
      headers: authHeaders(),
    });
    return response.data;
  },

  async requestMagicQR(email: string) {
    const accessToken = localStorage.getItem('access_token');
    const response = await publicApi.post('/public-site/portal/magic-link/', { email },
      accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}
    );
    return response.data;
  },

  async qrCreate() {
    const response = await publicApi.post('/public-site/portal/qr-create/', {});
    return response.data;
  },

  async qrPoll(sessionId: string) {
    const response = await publicApi.get(`/public-site/portal/qr-poll/?session_id=${sessionId}`);
    return response.data;
  },

  async forgotPassword(email: string) {
    const response = await publicApi.post('/public-site/portal/forgot-password/', { email });
    return response.data;
  },

  async register(payload: { email: string; full_name: string; password: string; phone?: string; is_company?: boolean; company_name?: string; tax_number?: string; company_address?: string }) {
    const response = await publicApi.post('/public-site/portal/register/', payload);
    return response.data;
  },

  async lookupCompany(taxNumber: string) {
    const response = await publicApi.post('/public-site/portal/lookup-company/', { tax_number: taxNumber });
    return response.data;
  },

  async magicLogin(token: string) {
    const response = await publicApi.post('/public-site/portal/magic-login/', { token });
    return response.data;
  },

  async pollMagicToken(token: string) {
    // Poll whether a magic link has been confirmed (scanned on mobile)
    try {
      const response = await publicApi.post('/public-site/portal/magic-login/', { token });
      return response.data;
    } catch {
      return null;
    }
  },
};
