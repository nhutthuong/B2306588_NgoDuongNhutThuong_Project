import http from './http.js';

/**
 * Lớp API gọi các endpoint thông tin tài khoản và bảo mật phía độc giả
 * Theo docs/API.md §3.1
 */
export const userApi = {
  /**
   * Lấy hồ sơ đầy đủ của chính độc giả
   * GET /api/user/auth/me
   * @returns {Promise}
   */
  getProfile() {
    return http.get('/user/auth/me');
  },

  /**
   * Cập nhật hồ sơ độc giả (chỉ các trường cho phép)
   * PATCH /api/user/auth/me
   * @param {object} payload - { HoLot, Ten, NgaySinh, Phai, DiaChi, DienThoai }
   * @returns {Promise}
   */
  updateProfile(payload) {
    return http.patch('/user/auth/me', payload);
  },

  /**
   * Đổi mật khẩu độc giả
   * PATCH /api/user/auth/change-password
   * @param {object} payload - { MatKhauCu, MatKhauMoi }
   * @returns {Promise}
   */
  changePassword(payload) {
    return http.patch('/user/auth/change-password', payload);
  },
};

export default userApi;
