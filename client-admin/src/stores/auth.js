import { defineStore } from 'pinia';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Biến lưu giữ Promise initSession dùng chung khi có nhiều lời gọi đồng thời
let initSessionPromise = null;

/**
 * Auth Store cho client-admin (Pinia)
 * Theo CONVENTIONS.md §3 & Yêu cầu P1-4:
 * - State accessToken và nhanVien CHỈ lưu trong bộ nhớ (RAM).
 * - KHÔNG sử dụng localStorage hoặc sessionStorage.
 * - Khôi phục phiên làm việc sau khi tải lại trang qua cookie httpOnly bằng POST /admin/auth/refresh.
 * - Tuyệt đối không log token hay thông tin nhạy cảm ra console.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    nhanVien: null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken),
    currentUser: (state) => state.nhanVien,
    role: (state) => state.nhanVien?.VaiTro || null,
    isAdmin: (state) => state.nhanVien?.VaiTro === 'admin',
    mustChangePassword: (state) => Boolean(state.nhanVien?.BatBuocDoiMatKhau),
  },

  actions: {
    /**
     * Đăng nhập nhân viên bằng MSNV và Mật khẩu
     * @param {string} MSNV
     * @param {string} Password
     */
    async login(MSNV, Password) {
      const response = await axios.post(
        `${baseURL}/admin/auth/login`,
        { MSNV, Password },
        { withCredentials: true }
      );

      const data = response.data?.data;
      if (data?.accessToken && data?.nhanVien) {
        this.accessToken = data.accessToken;
        this.nhanVien = data.nhanVien;
      }
      return data;
    },

    /**
     * Khôi phục phiên làm việc sau khi tải lại trang bằng cookie refresh token
     * Chỉ thực hiện một lần duy nhất; dùng chung Promise nếu gọi đồng thời.
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
          // Gọi POST /admin/auth/refresh để lấy access token mới từ cookie rt_admin
          const refreshRes = await axios.post(
            `${baseURL}/admin/auth/refresh`,
            {},
            { withCredentials: true }
          );

          const newAccessToken = refreshRes.data?.data?.accessToken;
          if (newAccessToken) {
            this.accessToken = newAccessToken;

            // Gọi GET /admin/auth/me để nạp lại hồ sơ nhân viên
            const meRes = await axios.get(`${baseURL}/admin/auth/me`, {
              headers: { Authorization: `Bearer ${newAccessToken}` },
              withCredentials: true,
            });

            this.nhanVien = meRes.data?.data?.nhanVien || null;
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
     * Đăng xuất nhân viên: gọi API thu hồi refresh token, xóa cookie và làm sạch store
     */
    async logout() {
      try {
        await axios.post(`${baseURL}/admin/auth/logout`, {}, { withCredentials: true });
      } catch {
        // Nuốt lỗi mạng để người dùng luôn đăng xuất được phía client
      } finally {
        this.clearSession();
      }
    },

    /**
     * Đổi mật khẩu nhân viên
     * @param {string} MatKhauCu
     * @param {string} MatKhauMoi
     */
    async changePassword(MatKhauCu, MatKhauMoi) {
      const response = await axios.patch(
        `${baseURL}/admin/auth/change-password`,
        { MatKhauCu, MatKhauMoi },
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          withCredentials: true,
        }
      );

      const data = response.data?.data;
      if (data?.accessToken && data?.nhanVien) {
        this.accessToken = data.accessToken;
        this.nhanVien = data.nhanVien;
      } else if (this.nhanVien) {
        this.nhanVien.BatBuocDoiMatKhau = false;
      }
      return data;
    },

    /**
     * Cập nhật phiên thủ công (dùng bởi axios interceptor)
     */
    setSession(token, nhanVien = null) {
      this.accessToken = token;
      if (nhanVien) {
        this.nhanVien = nhanVien;
      }
    },

    /**
     * Xóa sạch phiên làm việc khỏi bộ nhớ RAM
     */
    clearSession() {
      this.accessToken = null;
      this.nhanVien = null;
    },
  },
});

export default useAuthStore;
