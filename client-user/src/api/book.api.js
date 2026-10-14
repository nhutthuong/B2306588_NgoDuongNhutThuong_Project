import http from './http.js';

/**
 * API Sách cho độc giả (client-user)
 * Theo API.md §3.2 & P2-4 / P2-5
 */

/**
 * Lấy danh sách sách công khai (tìm kiếm, lọc, phân trang, sắp xếp)
 * @param {object} [params] { search, maNXB, namXuatBan, theLoai, conSach, page, limit, sort }
 * @param {object} [options] Tùy chọn (như signal của AbortController)
 * @returns {Promise<any>}
 */
export const list = (params = {}, options = {}) => {
  return http.get('/user/books', { params, ...options });
};

/**
 * Lấy chi tiết sách công khai kèm thông tin NXB
 * @param {string} maSach
 * @returns {Promise<any>}
 */
export const get = (maSach) => {
  return http.get(`/user/books/${encodeURIComponent(maSach)}`);
};

export default {
  list,
  get,
};
