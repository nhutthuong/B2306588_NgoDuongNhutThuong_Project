import { defineStore } from 'pinia';

/**
 * Auth Store cho client-user (Pinia)
 * Theo CONVENTIONS.md §3 & Yêu cầu P0-5:
 * - State accessToken và user CHỈ lưu trong bộ nhớ (RAM).
 * - KHÔNG sử dụng localStorage hoặc sessionStorage.
 * - Khi người dùng F5 tải lại trang, phiên sẽ được khôi phục qua cookie httpOnly bằng endpoint /user/auth/refresh (làm ở Phase 1).
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    user: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    currentUser: (state) => state.user,
  },

  actions: {
    /**
     * Cập nhật phiên làm việc mới khi đăng nhập hoặc refresh token thành công
     * @param {string} token - JWT Access Token
     * @param {object|null} user - Thông tin người dùng
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

    // TODO (P1-5): Thêm các action login, register, logout, fetchProfile khi backend hoàn thành API Phase 1
  },
});
