import api from './api';

export const notificationService = {
    async getUnreadCounts() {
        const response = await api.get('/notifications/unread-counts/');
        return response.data as Record<string, number>;
    },

    async getMenuBadges() {
        const response = await api.get('/menu-badges/');
        return response.data as Record<string, number>;
    },

    async getAllBadgeCounts() {
        const [notifCounts, menuCounts] = await Promise.all([
            this.getUnreadCounts().catch(() => ({})),
            this.getMenuBadges().catch(() => ({})),
        ]);
        // Merge: sum both sources per key
        const merged: Record<string, number> = { ...notifCounts };
        for (const [key, val] of Object.entries(menuCounts)) {
            merged[key] = (merged[key] || 0) + (val || 0);
        }
        return merged;
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
