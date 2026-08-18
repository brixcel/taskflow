import axios from 'axios';

/**
 * Centralized API Base URL Configuration
 *
 * In local development, defaults to http://localhost:3000.
 * In production (e.g. Vercel), configure VITE_API_URL in your Vercel Environment Variables
 * pointing to your live backend (e.g. https://taskflow-api.onrender.com).
 */
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const API_BASE = API_URL;

// Configure global Axios response interceptor to handle session revocation vs expiration
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      // Don't intercept public login/register/forgot-password/verify-email calls
      const isAuthEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password') ||
        url.includes('/auth/verify-email');

      if (!isAuthEndpoint && localStorage.getItem('token')) {
        const errCode = error.response.data?.code;
        if (errCode === 'SESSION_REVOKED') {
          sessionStorage.setItem('auth_notice', 'Your session was signed out for security reasons.');
        } else {
          sessionStorage.setItem('auth_notice', 'Your session has expired. Please sign in again.');
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('team');
        localStorage.removeItem('teamId');

        const currentPath = window.location.pathname;
        if (currentPath !== '/' && currentPath !== '/login' && currentPath !== '/register') {
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error);
  }
);
