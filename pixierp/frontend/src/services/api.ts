import axios from 'axios';

// Prefer configured URL in all modes; in dev default to proxy-friendly relative path
const DEFAULT_DEV_API_BASE_URL = '/api/v1';
const DEFAULT_PROD_API_BASE_URL = '/api/v1';

const configuredApiUrl = process.env.REACT_APP_API_URL;

const API_BASE_URL =
    process.env.NODE_ENV === 'development'
        ? (configuredApiUrl || DEFAULT_DEV_API_BASE_URL)
        : (configuredApiUrl || DEFAULT_PROD_API_BASE_URL);

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 second timeout (mobile networks can be slow)
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`; // Use Bearer prefix
        }
        
        // DEBUG: Log allowed_companies going out
        if (config.data && config.data.allowed_companies && Array.isArray(config.data.allowed_companies)) {
             console.log('[API Request Interceptor] Sending allowed_companies:', config.data.allowed_companies);
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
                        refresh: refreshToken,
                    });

                    const { access } = response.data;
                    localStorage.setItem('access_token', access);

                    // Retry the original request
                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return api(originalRequest);
                }
            } catch (refreshError) {
                // Refresh failed, redirect to login
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
