import http from './http.js';

/**
 * Lớp API quản lý nhân viên cho client-admin (Phase 4 - P4-2)
 * Theo docs/API.md §4.5 và docs/SYSTEM.md §2 (Chỉ Admin)
 */

/**
 * Lấy danh sách nhân viên có phân trang, tìm kiếm, lọc vai trò, lọc trạng thái, sắp xếp
 * @param {object} [params={}] { search, vaiTro, trangThai, page, limit, sort }
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const list = (params = {}, signal) => {
  return http.get('/admin/staff', { params, signal });
};

/**
 * Lấy thông tin chi tiết một nhân viên
 * @param {string} msnv
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const get = (msnv, signal) => {
  return http.get(`/admin/staff/${encodeURIComponent(msnv)}`, { signal });
};

/**
 * Tạo mới nhân viên thư viện
 * @param {object} data { HoTenNV, ChucVu, VaiTro, SoDienThoai, DiaChi, Password }
 * @returns {Promise}
 */
export const create = (data) => {
  return http.post('/admin/staff', data);
};

/**
 * Cập nhật thông tin cơ bản nhân viên (HoTenNV, ChucVu, SoDienThoai, DiaChi)
 * @param {string} msnv
 * @param {object} data
 * @returns {Promise}
 */
export const update = (msnv, data) => {
  return http.put(`/admin/staff/${encodeURIComponent(msnv)}`, data);
};

/**
 * Thay đổi vai trò nhân viên (admin <-> thuthu)
 * Ràng buộc: không tự đổi chính mình, hệ thống luôn còn ít nhất 1 admin
 * @param {string} msnv
 * @param {object} data { VaiTro: 'admin'|'thuthu' }
 * @returns {Promise}
 */
export const changeRole = (msnv, data) => {
  return http.patch(`/admin/staff/${encodeURIComponent(msnv)}/role`, data);
};

/**
 * Cập nhật trạng thái nhân viên (Khóa hoặc Mở khóa)
 * Ràng buộc: không tự khóa chính mình, hệ thống luôn còn ít nhất 1 admin
 * @param {string} msnv
 * @param {object} data { TrangThai: 'HoatDong'|'BiKhoa', LyDo?: string }
 * @returns {Promise}
 */
export const updateStatus = (msnv, data) => {
  return http.patch(`/admin/staff/${encodeURIComponent(msnv)}/status`, data);
};

/**
 * Đặt lại mật khẩu tạm mới cho nhân viên
 * @param {string} msnv
 * @param {object} data { Password }
 * @returns {Promise}
 */
export const resetPassword = (msnv, data) => {
  return http.patch(`/admin/staff/${encodeURIComponent(msnv)}/reset-password`, data);
};

/**
 * Xóa nhân viên khỏi hệ thống (chỉ khi chưa từng xử lý phiếu mượn)
 * Ràng buộc: không tự xóa chính mình, không xóa admin duy nhất
 * @param {string} msnv
 * @returns {Promise}
 */
export const remove = (msnv) => {
  return http.delete(`/admin/staff/${encodeURIComponent(msnv)}`);
};

export default {
  list,
  get,
  create,
  update,
  changeRole,
  updateStatus,
  resetPassword,
  remove,
};
