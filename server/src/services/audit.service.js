import NhatKy from '../models/NhatKy.js';
import { escapeRegex } from '../utils/escapeRegex.js';

/**
 * Ghi nhật ký hoạt động hệ thống theo DATABASE.md §3.8
 * Lỗi khi ghi nhật ký được bắt lại và không làm gián đoạn luồng xử lý chính.
 *
 * @param {object} params
 * @param {string} [params.msnv] - Mã số nhân viên thực hiện (hoặc req.admin?.msnv)
 * @param {string} [params.maDocGia] - Mã độc giả thực hiện (cho các thao tác do độc giả thực hiện)
 * @param {string} params.hanhDong - Mã hành động (vd: 'DOI_MAT_KHAU', 'DUYET_PHIEU', 'DANG_KY_MUON')
 * @param {string} params.doiTuong - Tên đối tượng/bảng (vd: 'NhanVien', 'TheoDoiMuonSach')
 * @param {string} [params.maDoiTuong] - Mã định danh đối tượng (vd: 'NV0001', 'PM0001')
 * @param {object} [params.chiTiet={}] - Dữ liệu chi tiết (tuyệt đối KHÔNG chứa mật khẩu, token, hash)
 * @param {string} [params.ip=''] - Địa chỉ IP của client (vd: req.ip)
 * @returns {Promise<object|null>} Document NhatKy đã tạo hoặc null nếu lỗi
 */
export const logAction = async ({
  msnv = '',
  maDocGia = '',
  tacNhan = '',
  hanhDong,
  doiTuong,
  maDoiTuong = '',
  chiTiet = {},
  ip = '',
}) => {
  try {
    const actor = tacNhan || msnv || maDocGia || '';
    const logEntry = await NhatKy.create({
      MSNV: actor,
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

/**
 * Danh sách nhật ký hoạt động có phân trang và bộ lọc (CHỈ Admin)
 * @param {object} query
 * @param {string} [query.search] - Tìm kiếm tự do trên HanhDong, DoiTuong, MaDoiTuong, MSNV, IP
 * @param {string} [query.msnv] - Lọc theo mã người thực hiện
 * @param {string} [query.hanhDong] - Lọc theo hành động
 * @param {string} [query.doiTuong] - Lọc theo đối tượng
 * @param {string} [query.tuNgay] - Từ ngày (ISO format)
 * @param {string} [query.denNgay] - Đến ngày (ISO format)
 * @param {number} [query.page=1]
 * @param {number} [query.limit=10]
 * @param {string} [query.sort='-createdAt']
 * @returns {Promise<{ data: Array, meta: object }>}
 */
export const getAuditLogs = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.msnv && String(query.msnv).trim()) {
    const rawMsnv = String(query.msnv).trim();
    filter.MSNV = new RegExp(escapeRegex(rawMsnv), 'i');
  }

  if (query.hanhDong && String(query.hanhDong).trim()) {
    const rawHanhDong = String(query.hanhDong).trim();
    filter.HanhDong = new RegExp(`^${escapeRegex(rawHanhDong)}$`, 'i');
  }

  if (query.doiTuong && String(query.doiTuong).trim()) {
    const rawDoiTuong = String(query.doiTuong).trim();
    filter.DoiTuong = new RegExp(`^${escapeRegex(rawDoiTuong)}$`, 'i');
  }

  if (query.tuNgay || query.denNgay) {
    filter.createdAt = {};
    if (query.tuNgay) {
      const tu = new Date(query.tuNgay);
      if (!isNaN(tu.getTime())) {
        filter.createdAt.$gte = tu;
      }
    }
    if (query.denNgay) {
      const den = new Date(query.denNgay);
      if (!isNaN(den.getTime())) {
        if (typeof query.denNgay === 'string' && query.denNgay.length === 10) {
          den.setHours(23, 59, 59, 999);
        }
        filter.createdAt.$lte = den;
      }
    }
  }

  if (query.search && String(query.search).trim()) {
    const safeSearch = escapeRegex(String(query.search).trim());
    const searchRegex = new RegExp(safeSearch, 'i');
    filter.$or = [
      { HanhDong: searchRegex },
      { DoiTuong: searchRegex },
      { MaDoiTuong: searchRegex },
      { MSNV: searchRegex },
      { IP: searchRegex },
    ];
  }

  const SORT_WHITELIST = {
    createdAt: { createdAt: 1 },
    '-createdAt': { createdAt: -1 },
    HanhDong: { HanhDong: 1 },
    '-HanhDong': { HanhDong: -1 },
    MSNV: { MSNV: 1 },
    '-MSNV': { MSNV: -1 },
  };

  const sortOrder = SORT_WHITELIST[query.sort] || { createdAt: -1 };

  const [total, logs] = await Promise.all([
    NhatKy.countDocuments(filter),
    NhatKy.find(filter)
      .populate('NhanVien', 'MSNV HoTenNV ChucVu VaiTro')
      .populate('DocGia', 'MaDocGia HoLot Ten Email')
      .sort(sortOrder)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: logs,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

/**
 * Lấy danh sách các hành động và đối tượng phục vụ dropdown lọc trên giao diện
 * @returns {Promise<{ actions: string[], targets: string[] }>}
 */
export const getAuditMetadata = async () => {
  const [distinctActions, distinctTargets] = await Promise.all([
    NhatKy.distinct('HanhDong'),
    NhatKy.distinct('DoiTuong'),
  ]);

  return {
    actions: distinctActions.filter(Boolean).sort(),
    targets: distinctTargets.filter(Boolean).sort(),
  };
};

export default {
  logAction,
  getAuditLogs,
  getAuditMetadata,
};
