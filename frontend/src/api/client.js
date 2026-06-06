import axios from 'axios';

const STORAGE_KEY = 'epson_qc_user';
export const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
export const api = axios.create({
  baseURL: apiBaseUrl,
});

function loadAuthToken() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

const initialToken = loadAuthToken();
if (initialToken) {
  api.defaults.headers.common.Authorization = `Bearer ${initialToken}`;
}

api.interceptors.request.use((config) => {
  // Always ensure Authorization header is present from session storage
  const token = loadAuthToken() || api.defaults.headers.common.Authorization?.replace('Bearer ', '');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  const isFormData = config.data instanceof FormData;
  if (!isFormData) {
    config.headers = config.headers || {};
    config.headers['Content-Type'] = 'application/json';
  } else if (config.headers) {
    // Remove Content-Type for FormData to let browser set boundary
    delete config.headers['Content-Type'];
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      try {
        console.warn('api: received 401 for', error.config?.url, 'response:', error.response?.data || error.response?.status);
        // Emit an event so UI can handle re-auth without immediately nuking session storage
        window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url: error.config?.url, data: error.response?.data } }));
      } catch (e) {
        // ignore
      }
      // Do not remove sessionStorage here automatically to avoid race conditions; leave handling to UI.
    }
    return Promise.reject(error);
  },
);
