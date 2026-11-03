import http from './http.js';

/**
 * API quản lý Kệ sách cho client-admin
 */

/**
 * Lấy danh sách kệ sách có phân trang, tìm kiếm, lọc theo khu vực
 * @param {object} [params] { search, khuVuc, page, limit, sort }
 * @returns {Promise<any>}
 */
export const list = (params = {}) => {
  return http.get('/admin/shelves', { params });
};

/**
 * Lấy toàn bộ kệ sách gọn nhẹ phục vụ dropdown
 * @returns {Promise<any>}
 */
export const listSimple = () => {
  return http.get('/admin/shelves/all');
};

/**
 * Lấy chi tiết kệ sách kèm danh sách sách trên kệ
 * @param {string} maKe
 * @returns {Promise<any>}
 */
export const get = (maKe) => {
  return http.get(`/admin/shelves/${encodeURIComponent(maKe)}`);
};

/**
 * Tạo mới kệ sách
 * @param {object} data { TenKe, KhuVuc, SoNgan }
 * @returns {Promise<any>}
 */
export const create = (data) => {
  return http.post('/admin/shelves', data);
};

/**
 * Cập nhật thông tin kệ sách
 * @param {string} maKe
 * @param {object} data { TenKe, KhuVuc, SoNgan }
 * @returns {Promise<any>}
 */
export const update = (maKe, data) => {
  return http.put(`/admin/shelves/${encodeURIComponent(maKe)}`, data);
};

/**
 * Xóa kệ sách (chặn nếu còn sách trên kệ)
 * @param {string} maKe
 * @returns {Promise<any>}
 */
export const remove = (maKe) => {
  return http.delete(`/admin/shelves/${encodeURIComponent(maKe)}`);
};

export default {
  list,
  listSimple,
  get,
  create,
  update,
  remove,
};

