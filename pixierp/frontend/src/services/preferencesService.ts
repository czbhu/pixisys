import api from './api';

/**
 * Server-side UI preferences service.
 * Stores and retrieves arbitrary JSON preferences per user.
 * The backend merges top-level keys on PATCH.
 */
const preferencesService = {
  async getAll(): Promise<Record<string, any>> {
    const response = await api.get('/auth/ui-preferences/');
    return response.data || {};
  },

  async patch(updates: Record<string, any>): Promise<Record<string, any>> {
    const response = await api.patch('/auth/ui-preferences/', updates);
    return response.data || {};
  },
};

export default preferencesService;
