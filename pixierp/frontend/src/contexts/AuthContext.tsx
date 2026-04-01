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
            console.log('[AuthContext] Initializing auth...');
            try {
                const token = localStorage.getItem('access_token');
                console.log('[AuthContext] Token found:', !!token);
                if (token) {
                    console.log('[AuthContext] Fetching profile...');
                    const userData = await authService.getProfile();
                    console.log('[AuthContext] Profile received:', userData);
                    setUser(userData);
                } else {
                    console.log('[AuthContext] No token, skipping profile fetch');
                }
            } catch (error: any) {
                console.error('[AuthContext] Auth initialization error:', error);
                // Only clear tokens on explicit authentication failure (401/403)
                // Do NOT clear on network errors, timeouts, etc. — keep the user logged in
                const status = error?.response?.status;
                if (status === 401 || status === 403) {
                    // Try refresh one more time before giving up
                    const refreshToken = localStorage.getItem('refresh_token');
                    if (refreshToken) {
                        try {
                            const { access } = await authService.refreshToken();
                            localStorage.setItem('access_token', access);
                            const userData = await authService.getProfile();
                            setUser(userData);
                        } catch {
                            localStorage.removeItem('access_token');
                            localStorage.removeItem('refresh_token');
                        }
                    } else {
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('refresh_token');
                    }
                }
                // For network errors / timeouts: leave tokens intact, user stays "logged in"
                // They will get an error when they try to load data
            } finally {
                console.log('[AuthContext] Auth initialization complete, setting loading=false');
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (credentials: any) => {
        console.log('[AuthContext] Login attempt with:', credentials);
        try {
            const response = await authService.login(credentials);
            console.log('[AuthContext] Login response:', response);
            const { user: userData, tokens } = response;

            localStorage.setItem('access_token', tokens.access);
            localStorage.setItem('refresh_token', tokens.refresh);
            setUser(userData);

            message.success('Sikeres bejelentkezés!');
            return { success: true };
        } catch (error: any) {
            console.error('[AuthContext] Login error:', error);
            
            // Extract meaningful error message from backend response if available
            const backendError = error.response?.data?.error;
            const errorMsg = backendError || error.message || 'Bejelentkezési hiba';
            
            message.error(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    const register = async (userData: any) => {
        try {
            const response = await authService.register(userData);
            const { user: newUser, tokens } = response;

            if (tokens?.access && tokens?.refresh) {
                localStorage.setItem('access_token', tokens.access);
                localStorage.setItem('refresh_token', tokens.refresh);
                setUser(newUser);
                message.success('Sikeres regisztráció!');
                return { success: true, pendingActivation: false };
            }

            // No tokens returned: registration created, awaiting activation
            setUser(null);
            message.success('Regisztráció rögzítve, aktiválásra vár.');
            return { success: true, pendingActivation: true };
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
        setUser,
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
