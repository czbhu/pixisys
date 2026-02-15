import api from './api';

export const settingsService = {
  async getEmailServers() {
    const r = await api.get('/core/email-servers/');
    const d = r.data;
    return Array.isArray(d) ? d : (d?.results ?? []);
  },
  async createEmailServer(data: any) {
    const r = await api.post('/core/email-servers/', data);
    return r.data;
  },
  async updateEmailServer(id: number, data: any) {
    const r = await api.put(`/core/email-servers/${id}/`, data);
    return r.data;
  },
  async sendTestEmail(id: number, recipient: string) {
    const r = await api.post(`/core/email-servers/${id}/send_test_email/`, { recipient });
    return r.data;
  },
  async detectIMAPSent(data: any) {
    const r = await api.post('/core/email-servers/detect_imap_sent/', data);
    return r.data;
  },
  async getEmailTemplates() {
    const r = await api.get('/core/email-templates/');
    const d = r.data;
    return Array.isArray(d) ? d : (d?.results ?? []);
  },
  async createEmailTemplate(data: any) {
    const r = await api.post('/core/email-templates/', data);
    return r.data;
  },
  async updateEmailTemplate(id: number, data: any) {
    const r = await api.put(`/core/email-templates/${id}/`, data);
    return r.data;
  },
  async getSignatures() {
    const r = await api.get('/core/signature-templates/');
    const d = r.data;
    return Array.isArray(d) ? d : (d?.results ?? []);
  },
  async createSignature(data: any) {
    const r = await api.post('/core/signature-templates/', data);
    return r.data;
  },
  async updateSignature(id: number, data: any) {
    const r = await api.put(`/core/signature-templates/${id}/`, data);
    return r.data;
  },
  async getPixinvoiceConfigs() {
    const r = await api.get('/core/pixinvoice-configs/');
    const d = r.data;
    return Array.isArray(d) ? d : (d?.results ?? []);
  },
  async createPixinvoiceConfig(data: any) {
    const r = await api.post('/core/pixinvoice-configs/', data);
    return r.data;
  },
  async updatePixinvoiceConfig(id: number, data: any) {
    const r = await api.put(`/core/pixinvoice-configs/${id}/`, data);
    return r.data;
  },
  async patchPixinvoiceConfig(id: number, data: any) {
    const r = await api.patch(`/core/pixinvoice-configs/${id}/`, data);
    return r.data;
  },
  async getHestiaConfigs() {
    const r = await api.get('/core/hestia-configs/');
    const d = r.data;
    return Array.isArray(d) ? d : (d?.results ?? []);
  },
  async createHestiaConfig(data: any) {
    const r = await api.post('/core/hestia-configs/', data);
    return r.data;
  },
  async updateHestiaConfig(id: number, data: any) {
    const r = await api.put(`/core/hestia-configs/${id}/`, data);
    return r.data;
  },
  async testHestiaConfig(id: number) {
    const r = await api.post(`/core/hestia-configs/${id}/test_connection/`, {}, { timeout: 45000 });
    return r.data;
  },
  async generateHestiaSshKey(id: number, overwrite: boolean = false) {
    const r = await api.post(`/core/hestia-configs/${id}/generate_ssh_key/`, { overwrite }, { timeout: 45000 });
    return r.data;
  },
  async getHestiaPublicKey(id: number) {
    const r = await api.get(`/core/hestia-configs/${id}/public_key/`);
    return r.data;
  },
  async trustHestiaHostKey(id: number) {
    const r = await api.post(`/core/hestia-configs/${id}/trust_host_key/`, {}, { timeout: 45000 });
    return r.data;
  },
  async testPixinvoiceConnection(id: number) {
    const r = await api.post('/pixinvoice/test-connection/', { id });
    return r.data;
  },
  async getPixinvoiceInvoiceSeries(id: number) {
    const r = await api.get(`/core/pixinvoice-configs/${id}/invoice_series/`);
    return r.data;
  },
  async lookupTaxpayer(taxNumber: string) {
    const r = await api.post('/finance/pixinvoice/lookup-taxpayer/', { tax_number: taxNumber });
    return r.data;
  },
  async getUserPreferences() {
    const r = await api.get('/user-preferences/me/');
    return r.data;
  },
  async updateUserPreferences(data: any) {
    const r = await api.patch('/core/user-preferences/me/', data);
    return r.data;
  },

  async getAttendanceKioskConfig() {
     const r = await api.get('/hr/attendance-kiosk-config/current/');
     return r.data;
  },
  async updateAttendanceKioskConfig(id: number, data: FormData) {
     const r = await api.patch(`/hr/attendance-kiosk-config/${id}/`, data, {
         headers: { 'Content-Type': 'multipart/form-data' }
     });
     return r.data;
  },
  async restartKiosks() {
     const r = await api.post('/hr/attendance-kiosk-config/restart_all/');
     return r.data;
  },
};
