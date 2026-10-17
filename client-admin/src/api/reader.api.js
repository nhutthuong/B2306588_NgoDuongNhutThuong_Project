import http from './http.js';

/**
 * Lớp API quản lý độc giả cho client-admin (Phase 4 - P4-1)
 * Theo docs/API.md §4.4
 */

/**
 * Lấy danh sách độc giả có phân trang, tìm kiếm, lọc trạng thái, sắp xếp
 * @param {object} [params={}] { search, trangThai, page, limit, sort }
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const list = (params = {}, signal) => {
  return http.get('/admin/readers', { params, signal });
};

/**
 * Lấy hồ sơ chi tiết độc giả kèm tóm tắt và lịch sử mượn phân trang
 * @param {string} maDocGia
 * @param {object} [params={}] { borrowPage, borrowLimit, trangThai }
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const get = (maDocGia, params = {}, signal) => {
  return http.get(`/admin/readers/${encodeURIComponent(maDocGia)}`, { params, signal });
};

/**
 * Cập nhật thông tin độc giả (HoLot, Ten, NgaySinh, Phai, DiaChi, DienThoai)
 * @param {string} maDocGia
 * @param {object} data
 * @returns {Promise}
 */
export const update = (maDocGia, data) => {
  return http.put(`/admin/readers/${encodeURIComponent(maDocGia)}`, data);
};

/**
 * Cập nhật trạng thái độc giả (Khóa hoặc Mở khóa) - CHỈ admin
 * @param {string} maDocGia
 * @param {object} data { TrangThai: 'HoatDong'|'BiKhoa', LyDo?: string }
 * @returns {Promise}
 */
export const updateStatus = (maDocGia, data) => {
  return http.patch(`/admin/readers/${encodeURIComponent(maDocGia)}/status`, data);
};

/**
 * Xóa độc giả chưa từng mượn sách - CHỈ admin
 * @param {string} maDocGia
 * @returns {Promise}
 */
export const remove = (maDocGia) => {
  return http.delete(`/admin/readers/${encodeURIComponent(maDocGia)}`);
};

export default {
  list,
  get,
  update,
  updateStatus,
  remove,
};
