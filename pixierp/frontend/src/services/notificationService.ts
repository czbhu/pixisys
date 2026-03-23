import api from './api';

export const notificationService = {
    async getUnreadCounts() {
        const response = await api.get('/notifications/unread-counts/');
        return response.data;
    },
    
    async markAsReadByLink(link: string) {
        try {
            await api.post('/notifications/mark-read-by-link/', { link });
            return true;
        } catch {
            // Non-critical endpoint; ignore server failures to avoid noisy app-level errors.
            return false;
        }
    },
    
    async markAsRead(id: number) {
        await api.post(`/notifications/${id}/read/`);
    }
};
