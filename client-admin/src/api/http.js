import axios from 'axios';
import router from '../router/index.js';
import { useAuthStore } from '../stores/auth.js';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Axios instance dung chung cho client-admin
 * Cau hinh theo CONVENTIONS.md §3 & yeu cau P0-5
 */
const http = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Quan ly hang doi request khi dang refresh token
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Interceptor request: gan token tu Pinia auth store neu co
http.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${authStore.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor response: xu ly 401 va refresh token tu dong
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    const status = error.response.status;
    const errorCode = error.response.data?.error?.code || error.response.data?.code;
    const isTokenExpired = status === 401 && errorCode === 'TOKEN_EXPIRED';

    // Tranh vong lap vo han: neu chinh request refresh bi 401 hoac da retry thi huy phien va chuyen ve login
    if (originalRequest.url?.includes('/admin/auth/refresh') || originalRequest._retry) {
      const authStore = useAuthStore();
      authStore.clearSession();
      router.push('/login');
      return Promise.reject(error);
    }

    if (isTokenExpired) {
      if (isRefreshing) {
        // Neu dang co mot tien trinh refresh dang chay, xep request nay vao hang doi
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise((resolve, reject) => {
        // Dung axios truc tiep (khong qua interceptor) de tranh lap vo han
        axios
          .post(`${baseURL}/admin/auth/refresh`, {}, { withCredentials: true })
          .then((response) => {
            const newAccessToken = response.data?.data?.accessToken;
            if (!newAccessToken) {
              throw new Error('Phan hoi refresh khong co accessToken');
            }

            const authStore = useAuthStore();
            authStore.setSession(newAccessToken, response.data?.data?.user || authStore.user);

            processQueue(null, newAccessToken);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            resolve(http(originalRequest));
          })
          .catch((refreshError) => {
            processQueue(refreshError, null);
            const authStore = useAuthStore();
            authStore.clearSession();
            router.push('/login');
            reject(refreshError);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    return Promise.reject(error);
  }
);

export default http;
