import NhatKy from '../models/NhatKy.js';

/**
 * Ghi nhật ký hoạt động hệ thống theo DATABASE.md §3.8
 * Lỗi khi ghi nhật ký được bắt lại và không làm gián đoạn luồng xử lý chính.
 *
 * @param {object} params
 * @param {string} [params.msnv] - Mã số nhân viên thực hiện (hoặc req.admin?.msnv)
 * @param {string} params.hanhDong - Mã hành động (vd: 'DOI_MAT_KHAU', 'DUYET_PHIEU')
 * @param {string} params.doiTuong - Tên đối tượng/bảng (vd: 'NhanVien', 'TheoDoiMuonSach')
 * @param {string} [params.maDoiTuong] - Mã định danh đối tượng (vd: 'NV0001', 'PM0001')
 * @param {object} [params.chiTiet={}] - Dữ liệu chi tiết (tuyệt đối KHÔNG chứa mật khẩu, token, hash)
 * @param {string} [params.ip=''] - Địa chỉ IP của client (vd: req.ip)
 * @returns {Promise<object|null>} Document NhatKy đã tạo hoặc null nếu lỗi
 */
export const logAction = async ({
  msnv = '',
  hanhDong,
  doiTuong,
  maDoiTuong = '',
  chiTiet = {},
  ip = '',
}) => {
  try {
    const logEntry = await NhatKy.create({
      MSNV: msnv,
      HanhDong: hanhDong,
      DoiTuong: doiTuong,
      MaDoiTuong: maDoiTuong,
      ChiTiet: chiTiet,
      IP: ip,
    });
    return logEntry;
  } catch (err) {
    // Không ném lỗi ra ngoài để tránh làm hỏng request chính
    console.error('[AUDIT_LOG_ERROR] Lỗi khi ghi nhật ký hoạt động:', err.message);
    return null;
  }
};

export default {
  logAction,
};
