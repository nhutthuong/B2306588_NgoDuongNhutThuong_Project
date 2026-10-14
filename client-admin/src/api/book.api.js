import http from './http.js';

/**
 * API quản lý Sách cho client-admin (Phase 2 - P2-3)
 * Lưu ý: Với các thao tác tạo/sửa dùng FormData, KHÔNG tự gán header Content-Type
 * để trình duyệt tự thiết lập boundary chính xác.
 */

/**
 * Lấy danh sách sách có phân trang, tìm kiếm, lọc và sắp xếp
 * @param {object} [params] { search, maNXB, theLoai, daXoa, page, limit, sort }
 * @param {object} [options] Tùy chọn bổ sung (như signal của AbortController)
 * @returns {Promise<any>}
 */
export const list = (params = {}, options = {}) => {
  return http.get('/admin/books', { params, ...options });
};

/**
 * Lấy chi tiết sách kèm thông tin NXB
 * @param {string} maSach
 * @returns {Promise<any>}
 */
export const get = (maSach) => {
  return http.get(`/admin/books/${encodeURIComponent(maSach)}`);
};

/**
 * Tạo mới sách bằng FormData
 * Chỉ đưa vào FormData đúng các trường backend cho phép:
 * TenSach, DonGia, SoQuyen, NamXuatBan, MaNXB, NguonGocTacGia, TheLoai, MoTa, AnhBia (file, tùy chọn).
 * Tuyệt đối không gửi MaSach, SoQuyenConLai, DaXoa hay trường lạ.
 * @param {FormData} formData
 * @returns {Promise<any>}
 */
export const create = (formData) => {
  return http.post('/admin/books', formData);
};

/**
 * Cập nhật sách bằng FormData
 * Chỉ đưa vào FormData các trường backend cho phép:
 * TenSach, DonGia, SoQuyen, NamXuatBan, MaNXB, NguonGocTacGia, TheLoai, MoTa, AnhBia (file, tùy chọn), XoaAnhBia (khi sửa).
 * Tuyệt đối không gửi MaSach, SoQuyenConLai, DaXoa hay trường lạ.
 * @param {string} maSach
 * @param {FormData} formData
 * @returns {Promise<any>}
 */
export const update = (maSach, formData) => {
  return http.put(`/admin/books/${encodeURIComponent(maSach)}`, formData);
};

/**
 * Xóa mềm sách (chỉ role admin)
 * @param {string} maSach
 * @returns {Promise<any>}
 */
export const remove = (maSach) => {
  return http.delete(`/admin/books/${encodeURIComponent(maSach)}`);
};

export default {
  list,
  get,
  create,
  update,
  remove,
};
