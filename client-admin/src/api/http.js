import axios from 'axios';
import router from '../router/index.js';
import { useAuthStore } from '../stores/auth.js';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Axios instance dùng chung cho client-admin
 * Cấu hình theo CONVENTIONS.md §3 & Yêu cầu P1-4
 */
export const http = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Quản lý hàng đợi request khi đang trong quá trình refresh token
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

// Danh sách các URL auth không áp dụng cơ chế tự động refresh (tránh vòng lặp vô hạn)
const AUTH_EXCLUDED_URLS = [
  '/admin/auth/login',
  '/admin/auth/refresh',
  '/admin/auth/logout',
];

// Interceptor request: tự động gắn Authorization header nếu có token trong Pinia store
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

// Interceptor response: xử lý refresh token, hết hạn phiên và mã lỗi nghiệp vụ
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Lỗi không có response (mất mạng, server down, ...)
    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    const status = error.response.status;
    const errorData = error.response.data?.error || {};
    const errorCode = errorData.code || error.response.data?.code;

    // Kiểm tra xem request có thuộc nhóm loại trừ tự động refresh hay không
    const isAuthRequest = AUTH_EXCLUDED_URLS.some((url) =>
      originalRequest.url?.includes(url)
    );

    // 1. Trường hợp 401 TOKEN_EXPIRED: Thực hiện xoay vòng refresh token đúng một lần
    if (status === 401 && errorCode === 'TOKEN_EXPIRED' && !isAuthRequest) {
      if (originalRequest._retry) {
        const authStore = useAuthStore();
        authStore.clearSession();
        router.push({
          path: '/login',
          query: { redirect: router.currentRoute.value.fullPath },
        });
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Nếu đã có request đang refresh, xếp các request sau vào hàng đợi
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
        // Dùng axios trực tiếp để không đi qua interceptor này
        axios
          .post(`${baseURL}/admin/auth/refresh`, {}, { withCredentials: true })
          .then((response) => {
            const newAccessToken = response.data?.data?.accessToken;
            if (!newAccessToken) {
              throw new Error('Phản hồi refresh không chứa accessToken');
            }

            const authStore = useAuthStore();
            authStore.setSession(newAccessToken, authStore.nhanVien);

            processQueue(null, newAccessToken);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            resolve(http(originalRequest));
          })
          .catch((refreshError) => {
            processQueue(refreshError, null);
            const authStore = useAuthStore();
            authStore.clearSession();
            router.push({
              path: '/login',
              query: { redirect: router.currentRoute.value.fullPath },
            });
            reject(refreshError);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    // 2. Trường hợp 401 UNAUTHENTICATED (thiếu token, token sai, không phải TOKEN_EXPIRED)
    if (status === 401 && !isAuthRequest) {
      const authStore = useAuthStore();
      authStore.clearSession();
      if (router.currentRoute.value.path !== '/login') {
        router.push({
          path: '/login',
          query: { redirect: router.currentRoute.value.fullPath },
        });
      }
      return Promise.reject(error);
    }

    // 3. Trường hợp 403 MUST_CHANGE_PASSWORD
    if (status === 403 && errorCode === 'MUST_CHANGE_PASSWORD') {
      const authStore = useAuthStore();
      if (authStore.nhanVien) {
        authStore.nhanVien.BatBuocDoiMatKhau = true;
      }
      if (router.currentRoute.value.path !== '/change-password') {
        router.push('/change-password');
      }
      return Promise.reject(error);
    }

    // 4. Trường hợp 403 ACCOUNT_LOCKED
    if (status === 403 && errorCode === 'ACCOUNT_LOCKED') {
      const authStore = useAuthStore();
      authStore.clearSession();
      if (router.currentRoute.value.path !== '/login') {
        router.push({
          path: '/login',
          query: { error: 'account_locked' },
        });
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

/**
 * Hàm tiện ích lấy thông điệp lỗi tiếng Việt dễ dùng cho View
 * @param {any} error
 * @returns {string}
 */
export const getErrorMessage = (error) => {
  if (!error) return 'Đã xảy ra lỗi không xác định.';

  // Lỗi mạng không có phản hồi từ server
  if (!error.response) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.';
  }

  // Lỗi Rate Limit 429
  if (error.response.status === 429) {
    return 'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.';
  }

  // Thông báo chuẩn từ cấu trúc API error của server
  const serverMsg = error.response.data?.error?.message;
  if (serverMsg) return serverMsg;

  const generalMsg = error.response.data?.message;
  if (generalMsg) return generalMsg;

  if (error.message) return error.message;

  return 'Yêu cầu không thành công, vui lòng thử lại.';
};

export default http;
