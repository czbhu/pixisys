import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const normalizeUser = (u) => {
        if (!u) return null;
        return {
            ...u,
            roles: Array.isArray(u.roles) ? u.roles : [],
            allowed_menus: Array.isArray(u.allowed_menus) ? u.allowed_menus : [],
        };
    };

    useEffect(() => {
        // Check for existing auth on mount
        const token = localStorage.getItem('access_token');
        const savedUser = localStorage.getItem('user');
        
        if (token && savedUser) {
            setUser(normalizeUser(JSON.parse(savedUser)));
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        setLoading(false);
    }, []);

    const login = async (credentials) => {
        const identifier = (credentials?.email || credentials?.username || '').trim();
        const password = credentials?.password || '';
        const payload = {
            email: identifier,
            username: identifier,
            password,
        };

        try {
            const response = await axios.post('/api/auth/login/', payload);
            const { user: userData, tokens } = response.data;
            const normalized = normalizeUser(userData);
            
            localStorage.setItem('access_token', tokens.access);
            localStorage.setItem('refresh_token', tokens.refresh);
            localStorage.setItem('user', JSON.stringify(normalized));
            
            axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.access}`;
            setUser(normalized);
            
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            const backendError = error.response?.data?.error;
            const detailError = error.response?.data?.detail;
            const messageError = error.response?.data?.message;
            return { 
                success: false, 
                error: backendError || detailError || messageError || 'Bejelentkezési hiba' 
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        navigate('/login');
    };

    const value = {
        user,
        login,
        logout,
        loading,
        allowedMenus: user?.allowed_menus || []
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
