import http from './http.js';

/**
 * API quản lý Nhà xuất bản cho client-admin (Phase 2 - P2-3)
 */

/**
 * Lấy danh sách nhà xuất bản có phân trang, tìm kiếm, sắp xếp
 * @param {object} [params] { search, page, limit, sort }
 * @returns {Promise<any>}
 */
export const list = (params = {}) => {
  return http.get('/admin/publishers', { params });
};

/**
 * Lấy thông tin chi tiết một nhà xuất bản kèm SoSach
 * @param {string} maNXB
 * @returns {Promise<any>}
 */
export const get = (maNXB) => {
  return http.get(`/admin/publishers/${encodeURIComponent(maNXB)}`);
};

/**
 * Tạo mới nhà xuất bản
 * @param {object} data { TenNXB, DiaChi }
 * @returns {Promise<any>}
 */
export const create = (data) => {
  return http.post('/admin/publishers', data);
};

/**
 * Cập nhật thông tin nhà xuất bản
 * @param {string} maNXB
 * @param {object} data { TenNXB, DiaChi }
 * @returns {Promise<any>}
 */
export const update = (maNXB, data) => {
  return http.put(`/admin/publishers/${encodeURIComponent(maNXB)}`, data);
};

/**
 * Xóa nhà xuất bản (chỉ role admin)
 * @param {string} maNXB
 * @returns {Promise<any>}
 */
export const remove = (maNXB) => {
  return http.delete(`/admin/publishers/${encodeURIComponent(maNXB)}`);
};

export default {
  list,
  get,
  create,
  update,
  remove,
};
