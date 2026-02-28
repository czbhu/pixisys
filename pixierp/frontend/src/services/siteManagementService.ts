import api from './api';

export const siteManagementService = {
  async getSites() {
    const response = await api.get('/sales-sites/');
    return response.data.results || response.data;
  },

  async createSite(payload: any) {
    const response = await api.post('/sales-sites/', payload);
    return response.data;
  },

  async updateSite(id: number, payload: any) {
    const response = await api.patch(`/sales-sites/${id}/`, payload);
    return response.data;
  },

  async deleteSite(id: number) {
    const response = await api.delete(`/sales-sites/${id}/`);
    return response.data;
  },

  async getFeatures() {
    const response = await api.get('/site-features/');
    return response.data.results || response.data;
  },

  async createFeature(payload: any) {
    const response = await api.post('/site-features/', payload);
    return response.data;
  },

  async updateFeature(id: number, payload: any) {
    const response = await api.patch(`/site-features/${id}/`, payload);
    return response.data;
  },

  async deleteFeature(id: number) {
    const response = await api.delete(`/site-features/${id}/`);
    return response.data;
  },

  async resolveSite(host?: string) {
    const response = await api.get('/public-sites/resolve/', {
      params: host ? { host } : {},
    });
    return response.data;
  },
};
