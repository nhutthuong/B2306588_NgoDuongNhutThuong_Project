import http from './http.js';

/**
 * Lớp API nhật ký kiểm toán hệ thống cho client-admin (Phase 4 - P4-3)
 * Theo docs/API.md §4.7
 */

/**
 * Lấy danh sách nhật ký có phân trang, lọc và tìm kiếm
 * @param {object} [params={}] { search, msnv, hanhDong, doiTuong, tuNgay, denNgay, page, limit, sort }
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const list = (params = {}, signal) => {
  return http.get('/admin/audit-logs', { params, signal });
};

/**
 * Lấy danh sách danh mục hành động và đối tượng phục vụ bộ lọc
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const getMetadata = (signal) => {
  return http.get('/admin/audit-logs/metadata', { signal });
};

export default {
  list,
  getMetadata,
};
