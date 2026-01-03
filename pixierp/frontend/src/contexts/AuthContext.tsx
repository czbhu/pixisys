import React, { createContext, useContext, useState, useEffect } from 'react';
import { message } from 'antd';
import { authService } from '../services/authService';

const AuthContext = createContext<any>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const userData = await authService.getProfile();
                    setUser(userData);
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (credentials: any) => {
        try {
            const response = await authService.login(credentials);
            const { user: userData, tokens } = response;

            localStorage.setItem('access_token', tokens.access);
            localStorage.setItem('refresh_token', tokens.refresh);
            setUser(userData);

            message.success('Sikeres bejelentkezés!');
            return { success: true };
        } catch (error: any) {
            message.error(error.message || 'Bejelentkezési hiba');
            return { success: false, error: error.message };
        }
    };

    const register = async (userData: any) => {
        try {
            const response = await authService.register(userData);
            const { user: newUser, tokens } = response;

            localStorage.setItem('access_token', tokens.access);
            localStorage.setItem('refresh_token', tokens.refresh);
            setUser(newUser);

            message.success('Sikeres regisztráció!');
            return { success: true };
        } catch (error: any) {
            message.error(error.message || 'Regisztrációs hiba');
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setUser(null);
            message.success('Sikeres kijelentkezés!');
        }
    };

    const updateProfile = async (profileData: any) => {
        try {
            const updatedUser = await authService.updateProfile(profileData);
            setUser(updatedUser);
            message.success('Profil sikeresen frissítve!');
            return { success: true };
        } catch (error: any) {
            message.error(error.message || 'Profil frissítési hiba');
            return { success: false, error: error.message };
        }
    };

    const value = {
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
