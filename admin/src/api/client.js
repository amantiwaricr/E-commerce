import axios from 'axios';
import { API_URL } from '../config';

// localStorage is per-origin, so the admin panel (:5174) keeps its own session
// independent of the storefront (:5173) even though both talk to the same API.
const TOKEN_KEY = 'fmn_admin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401 && getToken()) clearToken();

    const message =
      data?.errors?.[0]?.message || data?.message || error.message || 'Something went wrong. Please try again.';

    return Promise.reject(Object.assign(new Error(message), { status, fieldErrors: data?.errors || [] }));
  }
);

export default api;
