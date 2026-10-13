import { defineStore } from 'pinia';

/**
 * Auth Store cho client-admin (Pinia)
 * Theo CONVENTIONS.md §3 & Yêu cầu P0-5:
 * - State accessToken và user CHỈ lưu trong bộ nhớ (RAM).
 * - KHÔNG sử dụng localStorage hoặc sessionStorage.
 * - Khi làm mới trang, phiên sẽ được khôi phục qua cookie httpOnly bằng endpoint /admin/auth/refresh (làm ở Phase 1).
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    currentUser: (state) => state.user,
    isAdmin: (state) => state.user?.VaiTro === 'admin',
    isStaff: (state) => state.user?.VaiTro === 'thuthu',
  },

  actions: {
    /**
     * Cập nhật phiên làm việc mới khi đăng nhập hoặc refresh token thành công
     * @param {string} token - JWT Access Token
     * @param {object|null} user - Thông tin nhân viên / admin
     */
    setSession(token, user = null) {
      this.accessToken = token;
      this.user = user;
    },

    /**
     * Xóa sạch phiên làm việc trong bộ nhớ khi đăng xuất hoặc refresh thất bại
     */
    clearSession() {
      this.accessToken = null;
      this.user = null;
    },

    // TODO (P1-4): Thêm action login, logout, getProfile khi hoàn thành API Phase 1
  },
});
