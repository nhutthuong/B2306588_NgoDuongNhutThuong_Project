import http from './http.js';

/**
 * Lớp API gọi các endpoint mượn sách phía độc giả
 * Theo docs/API.md §3.3
 */
export const borrowingApi = {
  /**
   * Đăng ký mượn 1 cuốn sách mới
   * POST /api/user/borrowings
   * @param {string} maSach
   * @returns {Promise}
   */
  create(maSach) {
    return http.post('/user/borrowings', { MaSach: maSach });
  },

  /**
   * Lấy lịch sử mượn sách của chính độc giả
   * GET /api/user/borrowings
   * @param {object} [params={}] { trangThai, page, limit }
   * @returns {Promise}
   */
  list(params = {}) {
    return http.get('/user/borrowings', { params });
  },

  /**
   * Lấy thông tin tóm tắt mượn sách (số lượng đang chiếm chỗ, còn được mượn, quá hạn, tiền phạt)
   * GET /api/user/borrowings/summary
   * @returns {Promise}
   */
  getSummary() {
    return http.get('/user/borrowings/summary');
  },

  /**
   * Lấy chi tiết một phiếu mượn
   * GET /api/user/borrowings/:id
   * @param {string} id
   * @returns {Promise}
   */
  getDetail(id) {
    return http.get(`/user/borrowings/${id}`);
  },

  /**
   * Hủy phiếu mượn (khi phiếu đang ở trạng thái ChoDuyet hoặc DaDuyet)
   * PATCH /api/user/borrowings/:id/cancel
   * @param {string} id
   * @returns {Promise}
   */
  cancel(id) {
    return http.patch(`/user/borrowings/${id}/cancel`);
  },

  /**
   * Lấy chính sách mượn sách và biểu phí công khai từ hệ thống
   * GET /api/user/policy
   * @returns {Promise}
   */
  getPolicy() {
    return http.get('/user/policy');
  },
};

export default borrowingApi;
