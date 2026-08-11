/**
 * Centralized API Base URL Configuration
 *
 * In local development, defaults to http://localhost:3000.
 * In production (e.g. Vercel), configure VITE_API_URL in your Vercel Environment Variables
 * pointing to your live backend (e.g. https://taskflow-api.onrender.com).
 */
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const API_BASE = API_URL;
