import http from './http.js';

/**
 * Lớp API gọi các endpoint quản lý mượn/trả sách phía Admin và Thủ thư
 * Theo docs/API.md §4.3
 */
export const borrowingApi = {
  /**
   * Lấy danh sách phiếu mượn toàn hệ thống kèm bộ lọc đa tiêu chí
   * GET /api/admin/borrowings
   * @param {object} [params={}] { trangThai, maDocGia, maSach, quaHan, tuNgay, denNgay, trangThaiPhat, page, limit, sort }
   * @param {AbortSignal} [signal]
   * @returns {Promise}
   */
  list(params = {}, signal) {
    return http.get('/admin/borrowings', { params, signal });
  },

  /**
   * Lấy chi tiết một phiếu mượn kèm đầy đủ liên kết DocGia, Sach, NhanVien
   * GET /api/admin/borrowings/:id
   * @param {string} id
   * @returns {Promise}
   */
  getDetail(id) {
    return http.get(`/admin/borrowings/${id}`);
  },

  /**
   * Phê duyệt yêu cầu mượn sách (ChoDuyet -> DaDuyet), trừ 1 cuốn trong kho nguyên tử
   * PATCH /api/admin/borrowings/:id/approve
   * @param {string} id
   * @returns {Promise}
   */
  approve(id) {
    return http.patch(`/admin/borrowings/${id}/approve`);
  },

  /**
   * Từ chối yêu cầu mượn sách kèm lý do từ chối (ChoDuyet -> TuChoi)
   * PATCH /api/admin/borrowings/:id/reject
   * @param {string} id
   * @param {string} lyDoTuChoi
   * @returns {Promise}
   */
  reject(id, lyDoTuChoi) {
    return http.patch(`/admin/borrowings/${id}/reject`, {
      LyDoTuChoi: lyDoTuChoi,
    });
  },

  /**
   * Giao sách thực tế cho độc giả (DaDuyet -> DangMuon), bắt đầu tính thời hạn mượn
   * PATCH /api/admin/borrowings/:id/handover
   * @param {string} id
   * @returns {Promise}
   */
  handover(id) {
    return http.patch(`/admin/borrowings/${id}/handover`);
  },

  /**
   * Nhận trả sách từ độc giả (DangMuon -> DaTra), tính phạt tự động và cập nhật kho
   * PATCH /api/admin/borrowings/:id/return
   * @param {string} id
   * @param {object} payload { TinhTrangTra, MucRach, LoaiBoKhoiKho, GhiChuPhat }
   * @returns {Promise}
   */
  returnBook(id, payload) {
    return http.patch(`/admin/borrowings/${id}/return`, payload);
  },

  /**
   * Thu tiền phạt từ độc giả tại quầy (ChuaThanhToan -> DaThanhToan)
   * PATCH /api/admin/borrowings/:id/pay-fine
   * @param {string} id
   * @returns {Promise}
   */
  payFine(id) {
    return http.patch(`/admin/borrowings/${id}/pay-fine`);
  },

  /**
   * Hủy phiếu mượn bởi nhân viên khi ở trạng thái ChoDuyet hoặc DaDuyet
   * PATCH /api/admin/borrowings/:id/cancel
   * @param {string} id
   * @param {string} [lyDo]
   * @returns {Promise}
   */
  cancel(id, lyDo = '') {
    return http.patch(`/admin/borrowings/${id}/cancel`, {
      LyDo: lyDo || undefined,
    });
  },
};

export default borrowingApi;
