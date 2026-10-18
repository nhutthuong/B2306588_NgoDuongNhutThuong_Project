import http from './http.js';

/**
 * Lớp API gọi các endpoint thống kê phía Admin và Thủ thư
 * Theo docs/API.md §4.6
 */
export const statsApi = {
  /**
   * Lấy số liệu thống kê tổng quan (kho sách, độc giả, phiếu theo trạng thái, quá hạn, tiền phạt chưa thu)
   * GET /api/admin/stats/overview
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getOverview(signal) {
    return http.get('/admin/stats/overview', { signal });
  },

  /**
   * Lấy thống kê lượt mượn và số đăng ký theo từng tháng trong năm
   * GET /api/admin/stats/borrow-by-month
   * @param {number|string} [year]
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getBorrowByMonth(year, signal) {
    const params = year ? { year: Number(year) } : {};
    return http.get('/admin/stats/borrow-by-month', { params, signal });
  },

  /**
   * Lấy thống kê tiền phạt phát sinh, đã thu và số sách hư hỏng/mất theo tháng
   * GET /api/admin/stats/fines
   * @param {number|string} [year]
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getFines(year, signal) {
    const params = year ? { year: Number(year) } : {};
    return http.get('/admin/stats/fines', { params, signal });
  },

  /**
   * Lấy danh sách phiếu mượn đang quá hạn có phân trang
   * GET /api/admin/stats/overdue
   * @param {object} [params={}] { page, limit }
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getOverdue(params = {}, signal) {
    return http.get('/admin/stats/overdue', { params, signal });
  },

  /**
   * Lấy danh sách sách có nhiều lượt mượn nhất
   * GET /api/admin/stats/top-books
   * @param {object} [params={}] { limit, tuNgay, denNgay }
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getTopBooks(params = {}, signal) {
    return http.get('/admin/stats/top-books', { params, signal });
  },

  /**
   * Lấy danh sách độc giả mượn nhiều sách nhất
   * GET /api/admin/stats/top-readers
   * @param {object} [params={}] { limit, tuNgay, denNgay }
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  getTopReaders(params = {}, signal) {
    return http.get('/admin/stats/top-readers', { params, signal });
  },
};

export default statsApi;
