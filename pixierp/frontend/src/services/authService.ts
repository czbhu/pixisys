import api from './api';

export const authService = {
    async login(credentials: any) {
        const response = await api.post('/auth/login/', credentials);
        return response.data;
    },

    async register(userData: any) {
        const response = await api.post('/auth/register/', userData);
        return response.data;
    },

    async logout() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
            await api.post('/auth/logout/', { refresh: refreshToken });
        }
    },

    async getProfile() {
        const response = await api.get('/auth/profile/');
        return response.data;
    },

    async updateProfile(profileData: any) {
        const response = await api.put('/auth/profile/update/', profileData);
        return response.data;
    },

    async refreshToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        const response = await api.post('/auth/token/refresh/', {
            refresh: refreshToken,
        });
        return response.data;
    },

    async requestPasswordReset(email: string) {
        const response = await api.post('/auth/password-reset/', { email });
        return response.data;
    },

    async confirmPasswordReset(payload: { uid: string; token: string; new_password1: string; new_password2: string }) {
        const response = await api.post('/auth/password-reset/confirm/', payload);
        return response.data;
    },
};
