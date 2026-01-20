import api from './api';

export const notificationService = {
    async getUnreadCounts() {
        const response = await api.get('/core/notifications/unread-counts/');
        return response.data;
    },
    
    async markAsReadByLink(link: string) {
        await api.post('/core/notifications/mark-read-by-link/', { link });
    },
    
    async markAsRead(id: number) {
        await api.post(`/core/notifications/${id}/read/`);
    }
};
