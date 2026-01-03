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
  async testPixinvoiceConnection(id: number) {
    const r = await api.post('/pixinvoice/test-connection/', { id });
    return r.data;
  },
  async lookupTaxpayer(taxNumber: string) {
    const r = await api.post('/finance/pixinvoice/lookup-taxpayer/', { tax_number: taxNumber });
    return r.data;
  },
};
