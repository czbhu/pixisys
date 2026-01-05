import axios from 'axios';

export const requestPasswordReset = async (email) => {
    const response = await axios.post('/api/auth/password-reset/', { email });
    return response.data;
};

export const confirmPasswordReset = async (uid, token, new_password1, new_password2) => {
    const response = await axios.post('/api/auth/password-reset/confirm/', {
        uid,
        token,
        new_password1,
        new_password2
    });
    return response.data;
};
