import { defineStore } from 'pinia';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Biến lưu giữ Promise initSession dùng chung khi có nhiều lời gọi đồng thời
let initSessionPromise = null;

/**
 * Auth Store cho client-user (Pinia)
 * Theo CONVENTIONS.md §3 & Yêu cầu P1-5:
 * - State accessToken và user CHỈ lưu trong bộ nhớ (RAM).
 * - KHÔNG sử dụng localStorage hoặc sessionStorage.
 * - Khôi phục phiên làm việc sau khi tải lại trang qua cookie httpOnly bằng POST /user/auth/refresh.
 * - Tuyệt đối không log token hay thông tin nhạy cảm ra console.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken),
    currentUser: (state) => state.user,
    fullName: (state) => {
      if (!state.user) return '';
      const hoLot = state.user.HoLot || '';
      const ten = state.user.Ten || '';
      return `${hoLot} ${ten}`.trim();
    },
  },

  actions: {
    /**
     * Đăng ký tài khoản độc giả mới
     * @param {object} payload - Thông tin đăng ký
     */
    async register(payload) {
      const response = await axios.post(`${baseURL}/user/auth/register`, payload, {
        withCredentials: true,
      });
      return response.data;
    },

    /**
     * Đăng nhập độc giả bằng Email và Mật khẩu
     * @param {string} Email
     * @param {string} Password
     */
    async login(Email, Password) {
      const response = await axios.post(
        `${baseURL}/user/auth/login`,
        { Email, Password },
        { withCredentials: true }
      );

      const data = response.data?.data;
      if (data?.accessToken && data?.user) {
        this.accessToken = data.accessToken;
        this.user = data.user;
      }
      return data;
    },

    /**
     * Khôi phục phiên làm việc sau khi tải lại trang bằng cookie refresh token rt_user
     * Chỉ chạy MỘT lần; dùng chung Promise nếu gọi đồng thời.
     */
    async initSession() {
      if (this.initialized) {
        return;
      }

      if (initSessionPromise) {
        return initSessionPromise;
      }

      initSessionPromise = (async () => {
        try {
          // Gọi POST /user/auth/refresh để lấy access token mới từ cookie rt_user
          const refreshRes = await axios.post(
            `${baseURL}/user/auth/refresh`,
            {},
            { withCredentials: true }
          );

          const newAccessToken = refreshRes.data?.data?.accessToken;
          if (newAccessToken) {
            this.accessToken = newAccessToken;

            // Gọi GET /user/auth/me để nạp lại đầy đủ hồ sơ độc giả
            const meRes = await axios.get(`${baseURL}/user/auth/me`, {
              headers: { Authorization: `Bearer ${newAccessToken}` },
              withCredentials: true,
            });

            this.user = meRes.data?.data?.user || null;
          }
        } catch {
          // Lỗi 401 hoặc lỗi mạng khi chưa đăng nhập là bình thường, nuốt lỗi
          this.clearSession();
        } finally {
          this.initialized = true;
          initSessionPromise = null;
        }
      })();

      return initSessionPromise;
    },

    /**
     * Đăng xuất độc giả: gọi API thu hồi refresh token, xóa cookie và làm sạch store
     */
    async logout() {
      try {
        await axios.post(`${baseURL}/user/auth/logout`, {}, { withCredentials: true });
      } catch {
        // Nuốt lỗi mạng để người dùng luôn đăng xuất được phía client
      } finally {
        this.clearSession();
      }
    },

    /**
     * Cập nhật phiên thủ công (dùng bởi axios interceptor)
     */
    setSession(token, user = null) {
      this.accessToken = token;
      if (user) {
        this.user = user;
      }
    },

    /**
     * Cập nhật thông tin độc giả trong store
     * @param {object} user
     */
    setUser(user) {
      if (this.user && user) {
        this.user = { ...this.user, ...user };
      } else {
        this.user = user;
      }
    },

    /**
     * Xóa sạch phiên làm việc khỏi bộ nhớ RAM
     */
    clearSession() {
      this.accessToken = null;
      this.user = null;
    },
  },
});

export default useAuthStore;
