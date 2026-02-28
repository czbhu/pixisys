import api from './api';

export const ticketsService = {
  async getTickets(params?: Record<string, any>) {
    const response = await api.get('/tickets/', { params });
    return response.data.results || response.data;
  },

  async getMyTickets(params?: Record<string, any>) {
    const response = await api.get('/tickets/my/', { params });
    return response.data.results || response.data;
  },

  async getTicket(id: number) {
    const response = await api.get(`/tickets/${id}/`);
    return response.data;
  },

  async createTicket(payload: FormData) {
    const response = await api.post('/tickets/', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async replyToTicket(ticketId: number, payload: FormData) {
    const response = await api.post(`/tickets/${ticketId}/reply/`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async updateTicket(ticketId: number, payload: any) {
    const response = await api.patch(`/tickets/${ticketId}/`, payload);
    return response.data;
  },

  async setStatus(ticketId: number, status: string, note?: string) {
    const response = await api.post(`/tickets/${ticketId}/set_status/`, { status, note });
    return response.data;
  },

  async getTopics() {
    const response = await api.get('/ticket-topics/');
    return response.data.results || response.data;
  },

  async getTicketTypes() {
    const response = await api.get('/ticket-types/');
    return response.data.results || response.data;
  },

  async createTicketType(payload: any) {
    const response = await api.post('/ticket-types/', payload);
    return response.data;
  },

  async updateTicketType(id: number, payload: any) {
    const response = await api.patch(`/ticket-types/${id}/`, payload);
    return response.data;
  },

  async deleteTicketType(id: number) {
    const response = await api.delete(`/ticket-types/${id}/`);
    return response.data;
  },

  async getStats(params?: Record<string, any>) {
    const response = await api.get('/tickets/stats/', { params });
    return response.data;
  },

  async getPublicTicket(token: string) {
    const response = await api.get(`/tickets/public/${token}/`);
    return response.data;
  },

  async replyPublicTicket(token: string, payload: FormData) {
    const response = await api.post(`/tickets/public/${token}/reply/`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
