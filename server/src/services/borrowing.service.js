import mongoose from 'mongoose';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import DocGia from '../models/DocGia.js';
import Sach from '../models/Sach.js';
import { getSettings } from './settings.service.js';
import { logAction } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACTIVE_STATUSES, isOverdue, soNgayTre } from '../utils/borrowing.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';

/**
 * Lấy tóm tắt tình trạng mượn sách của một độc giả (dùng cho P3-1 và P3-2).
 * Sử dụng truy vấn gộp MongoDB ($aggregate), không tải toàn bộ phiếu về bộ nhớ.
 *
 * @param {string} maDocGia - Mã độc giả (vd: 'DG0001')
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra (phục vụ test giả lập)
 * @returns {Promise<{
 *   dangChiemCho: number,
 *   toiDa: number,
 *   conDuocMuon: number,
 *   coQuaHan: boolean,
 *   tongPhatChuaTra: number,
 *   soKhoanPhatChuaTra: number
 * }>}
 */
export const getBorrowSummary = async (maDocGia, now = new Date()) => {
  if (!maDocGia || typeof maDocGia !== 'string') {
    throw ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
  }

  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();
  const currentTime = new Date(now);

  const [settings, aggregateResult] = await Promise.all([
    getSettings(),
    TheoDoiMuonSach.aggregate([
      {
        $match: {
          MaDocGia: normalizedMaDocGia,
        },
      },
      {
        $group: {
          _id: null,
          dangChiemCho: {
            $sum: {
              $cond: [{ $in: ['$TrangThai', ACTIVE_STATUSES] }, 1, 0],
            },
          },
          coQuaHanCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$TrangThai', 'DangMuon'] },
                    { $ne: ['$HanTra', null] },
                    { $lt: ['$HanTra', currentTime] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          tongPhatChuaTra: {
            $sum: {
              $cond: [
                { $eq: ['$TrangThaiPhat', 'ChuaThanhToan'] },
                '$TienPhat',
                0,
              ],
            },
          },
          soKhoanPhatChuaTra: {
            $sum: {
              $cond: [
                { $eq: ['$TrangThaiPhat', 'ChuaThanhToan'] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const raw = aggregateResult[0] || {
    dangChiemCho: 0,
    coQuaHanCount: 0,
    tongPhatChuaTra: 0,
    soKhoanPhatChuaTra: 0,
  };

  const dangChiemCho = raw.dangChiemCho || 0;
  const toiDa = settings.SoSachToiDa;
  const conDuocMuon = Math.max(0, toiDa - dangChiemCho);
  const coQuaHan = (raw.coQuaHanCount || 0) > 0;
  const tongPhatChuaTra = raw.tongPhatChuaTra || 0;
  const soKhoanPhatChuaTra = raw.soKhoanPhatChuaTra || 0;

  return {
    dangChiemCho,
    toiDa,
    conDuocMuon,
    coQuaHan,
    tongPhatChuaTra,
    soKhoanPhatChuaTra,
  };
};

/**
 * Kiểm tra độc giả có đủ điều kiện MƯỢN THÊM sách hay không.
 * Thứ tự ưu tiên cố định theo docs/SYSTEM.md §5:
 *   a. Độc giả phải tồn tại và TrangThai = HoatDong (nạp từ DB, không tin token): bị khóa thì 403 ACCOUNT_LOCKED.
 *   b. Có phiếu quá hạn (DangMuon và HanTra < now): 422 HAS_OVERDUE.
 *   c. Có khoản phạt chưa thanh toán (TrangThaiPhat = ChuaThanhToan): 422 HAS_UNPAID_FINE.
 *   d. Số phiếu đang chiếm chỗ (ACTIVE_STATUSES) >= SoSachToiDa: 422 BORROW_LIMIT_EXCEEDED.
 *
 * @param {string} maDocGia - Mã độc giả
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @param {object} [options={}]
 * @param {boolean} [options.throwOnError=true] - Ném ApiError nếu không đủ điều kiện (mặc định true)
 * @returns {Promise<{ eligible: boolean, reason: string|null, code?: string, summary: object|null }>}
 */
export const checkEligibility = async (maDocGia, now = new Date(), options = {}) => {
  const { throwOnError = true } = options;

  if (!maDocGia || typeof maDocGia !== 'string') {
    const err = ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary: null };
  }

  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();

  // a. Độc giả phải tồn tại và TrangThai = HoatDong
  const docGia = await DocGia.findOne({ MaDocGia: normalizedMaDocGia }).lean();
  if (!docGia) {
    const err = ApiError.notFound('Không tìm thấy thông tin độc giả', 'NOT_FOUND');
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary: null };
  }

  if (docGia.TrangThai === 'BiKhoa') {
    const err = new ApiError(403, 'ACCOUNT_LOCKED', 'Tài khoản độc giả đang bị khóa, không thể mượn sách');
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary: null };
  }

  const summary = await getBorrowSummary(normalizedMaDocGia, now);

  // b. Có phiếu quá hạn (DangMuon và HanTra < now): 422 HAS_OVERDUE
  if (summary.coQuaHan) {
    const err = new ApiError(
      422,
      'HAS_OVERDUE',
      'Bạn đang có sách mượn quá hạn chưa trả. Vui lòng hoàn trả sách trước khi đăng ký mượn tiếp'
    );
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary };
  }

  // c. Có khoản phạt chưa thanh toán (TrangThaiPhat = ChuaThanhToan): 422 HAS_UNPAID_FINE
  if (summary.soKhoanPhatChuaTra > 0) {
    const err = new ApiError(
      422,
      'HAS_UNPAID_FINE',
      'Bạn có khoản tiền phạt chưa thanh toán. Vui lòng thanh toán phạt trước khi đăng ký mượn tiếp'
    );
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary };
  }

  // d. Số phiếu đang chiếm chỗ (ACTIVE_STATUSES) >= SoSachToiDa: 422 BORROW_LIMIT_EXCEEDED
  if (summary.dangChiemCho >= summary.toiDa) {
    const err = new ApiError(
      422,
      'BORROW_LIMIT_EXCEEDED',
      `Bạn đã mượn ${summary.dangChiemCho}/${summary.toiDa} cuốn, đã đạt giới hạn tối đa`
    );
    if (throwOnError) throw err;
    return { eligible: false, reason: err.message, code: err.code, summary };
  }

  return {
    eligible: true,
    reason: null,
    summary,
  };
};

/**
 * Đăng ký mượn sách (tạo phiếu ở trạng thái ChoDuyet cho ĐÚNG 1 cuốn).
 * Bước này chỉ kiểm tra tính hợp lệ và ghi nhận phiếu, KHÔNG trừ kho (kho chỉ trừ khi nhân viên duyệt ở P3-3).
 *
 * Chống race condition trên MongoDB Standalone (không dùng transaction):
 * 1. Chống mượn trùng cuốn sách: Partial Unique Index { MaDocGia, MaSach } bắt lỗi E11000 -> 409 ALREADY_BORROWING.
 * 2. Chống vượt giới hạn SoSachToiDa: Sau khi insert, đọc lại danh sách phiếu đang chiếm chỗ sắp xếp theo thời gian
 *    (createdAt, _id). Nếu vị trí của phiếu vượt quá SoSachToiDa, tự xóa chính phiếu vừa tạo và ném 422 BORROW_LIMIT_EXCEEDED.
 *
 * @param {string} maDocGia - Mã độc giả (do controller truyền từ req.user, KHÔNG lấy từ user input)
 * @param {string} maSach - Mã sách (định dạng ^S\d{4,}$)
 * @param {object} [meta={}] - Dữ liệu mở rộng ({ now, ip })
 * @returns {Promise<object>} Document phiếu mượn vừa tạo (dạng plain object đã format)
 */
export const registerBorrow = async (maDocGia, maSach, meta = {}) => {
  // Validate maSach
  if (!maSach || typeof maSach !== 'string') {
    throw ApiError.badRequest('Mã sách không hợp lệ', 'VALIDATION_ERROR');
  }

  const normalizedMaSach = String(maSach).trim().toUpperCase();
  if (!/^S\d{4,}$/.test(normalizedMaSach)) {
    throw ApiError.badRequest('Mã sách không đúng định dạng (vd: S0001)', 'VALIDATION_ERROR');
  }

  // Validate maDocGia
  if (!maDocGia || typeof maDocGia !== 'string') {
    throw ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
  }
  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();

  const now = meta?.now ? new Date(meta.now) : new Date();

  // 1. Thứ tự kiểm tra: checkEligibility (a -> b -> c -> d)
  await checkEligibility(normalizedMaDocGia, now);

  // 2. Sách phải tồn tại và DaXoa = false
  const sach = await Sach.findOne({ MaSach: normalizedMaSach, DaXoa: false });
  if (!sach) {
    throw ApiError.notFound('Sách không tồn tại hoặc đã ngừng phục vụ', 'NOT_FOUND');
  }

  // 3. Sách đã nằm trong phiếu đang chiếm chỗ của chính độc giả này
  const existingLoan = await TheoDoiMuonSach.findOne({
    MaDocGia: normalizedMaDocGia,
    MaSach: normalizedMaSach,
    TrangThai: { $in: ACTIVE_STATUSES },
  });
  if (existingLoan) {
    throw new ApiError(409, 'ALREADY_BORROWING', 'Bạn đang có yêu cầu mượn hoặc đang mượn cuốn sách này');
  }

  // 4. SoQuyenConLai = 0 thì 409 OUT_OF_STOCK
  if (sach.SoQuyenConLai <= 0) {
    throw new ApiError(409, 'OUT_OF_STOCK', 'Sách hiện đã hết quyển có sẵn để mượn');
  }

  // 5. Tạo phiếu: Whitelist cứng các trường khởi tạo
  const phieuData = {
    MaDocGia: normalizedMaDocGia,
    MaSach: normalizedMaSach,
    TrangThai: 'ChoDuyet',
    NgayDangKy: now,
    NgayMuon: null,
    NgayTra: null,
    HanTra: null,
    TienPhat: 0,
    TrangThaiPhat: 'KhongPhat',
  };

  let newPhieu;
  try {
    newPhieu = await TheoDoiMuonSach.create(phieuData);
  } catch (err) {
    // Chống trùng sách qua partial unique index { MaDocGia, MaSach }
    if (err.code === 11000) {
      throw new ApiError(409, 'ALREADY_BORROWING', 'Bạn đang có yêu cầu mượn hoặc đang mượn cuốn sách này');
    }
    throw err;
  }

  // 6. Chống đua vượt giới hạn SoSachToiDa:
  // Vì môi trường MongoDB Standalone không dùng Multi-Document Transaction, ta dùng kỹ thuật
  // xác thực lại thứ tự sau insert: truy vấn lại tất cả các phiếu đang chiếm chỗ của độc giả,
  // sắp xếp theo thời gian (createdAt, _id). Nếu phiếu vừa tạo nằm ngoài top SoSachToiDa,
  // tiến hành rollback bằng cách xóa đúng _id đó (kèm điều kiện TrangThai: 'ChoDuyet').
  const settings = await getSettings();
  const activeDocs = await TheoDoiMuonSach.find({
    MaDocGia: normalizedMaDocGia,
    TrangThai: { $in: ACTIVE_STATUSES },
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean();

  const myIndex = activeDocs.findIndex(
    (d) => d._id.toString() === newPhieu._id.toString()
  );

  if (myIndex === -1 || myIndex >= settings.SoSachToiDa) {
    await TheoDoiMuonSach.deleteOne({
      _id: newPhieu._id,
      TrangThai: 'ChoDuyet',
    });
    throw new ApiError(
      422,
      'BORROW_LIMIT_EXCEEDED',
      `Bạn đã mượn vượt quá số lượng tối đa (${settings.SoSachToiDa} cuốn). Yêu cầu đã bị hủy`
    );
  }

  // 7. Ghi nhật ký qua audit.service (lỗi nhật ký không làm hỏng request)
  await logAction({
    maDocGia: normalizedMaDocGia,
    hanhDong: 'DANG_KY_MUON',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(newPhieu._id),
    chiTiet: {
      MaDocGia: normalizedMaDocGia,
      MaSach: normalizedMaSach,
      TenSach: sach.TenSach,
      NgayDangKy: newPhieu.NgayDangKy,
    },
    ip: meta?.ip || '',
  });

  return newPhieu.toObject();
};

/**
 * Lấy lịch sử mượn sách của chính độc giả đang đăng nhập (GET /api/user/borrowings).
 * Luôn lọc theo MaDocGia, hỗ trợ lọc theo TrangThai và phân trang an toàn.
 * Kèm thông tin sách (populate) và các cờ động: isOverdue, soNgayTre.
 *
 * @param {string} maDocGia - Mã độc giả
 * @param {object} [query={}] - Query params { page, limit, trangThai }
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @returns {Promise<{ data: Array, meta: object }>}
 */
export const getMyBorrowings = async (maDocGia, query = {}, now = new Date()) => {
  if (!maDocGia || typeof maDocGia !== 'string') {
    throw ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
  }

  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();
  const { page = 1, limit = 10, trangThai } = query;
  const { limit: safeLimit, skip, page: safePage } = getPagination({ page, limit });

  const filter = { MaDocGia: normalizedMaDocGia };
  if (trangThai) {
    filter.TrangThai = trangThai;
  }

  const [items, total] = await Promise.all([
    TheoDoiMuonSach.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({
        path: 'Sach',
        select: 'MaSach TenSach AnhBia DonGia NamXuatBan NguonGocTacGia TheLoai SoQuyenConLai',
      })
      .lean(),
    TheoDoiMuonSach.countDocuments(filter),
  ]);

  const enrichedData = items.map((phieu) => ({
    ...phieu,
    isOverdue: isOverdue(phieu, now),
    soNgayTre: soNgayTre(phieu, now),
  }));

  const meta = getPaginationMeta(total, safePage, safeLimit);

  return {
    data: enrichedData,
    meta,
  };
};

/**
 * Lấy chi tiết một phiếu mượn của chính độc giả (GET /api/user/borrowings/:id).
 * Chỉ xem được phiếu của chính mình; nếu không tồn tại hoặc của người khác thì trả 404 NOT_FOUND.
 *
 * @param {string} maDocGia - Mã độc giả
 * @param {string} id - _id của phiếu mượn (ObjectId)
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @returns {Promise<object>}
 */
export const getBorrowingDetail = async (maDocGia, id, now = new Date()) => {
  if (!maDocGia || typeof maDocGia !== 'string') {
    throw ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
  }

  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  const phieu = await TheoDoiMuonSach.findOne({
    _id: id,
    MaDocGia: normalizedMaDocGia,
  })
    .populate({
      path: 'Sach',
      select: 'MaSach TenSach AnhBia DonGia NamXuatBan NguonGocTacGia TheLoai SoQuyenConLai MaNXB',
      populate: {
        path: 'NhaXuatBan',
        select: 'MaNXB TenNXB DiaChi',
      },
    })
    .lean();

  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  return {
    ...phieu,
    isOverdue: isOverdue(phieu, now),
    soNgayTre: soNgayTre(phieu, now),
  };
};

/**
 * Hủy phiếu mượn sách bởi độc giả (PATCH /api/user/borrowings/:id/cancel).
 * Quy tắc:
 * - Chỉ cho phép hủy khi phiếu đang ở trạng thái 'ChoDuyet' hoặc 'DaDuyet'.
 * - Trạng thái khác (DangMuon, DaTra, TuChoi, DaHuy) -> ném 409 INVALID_STATE.
 * - Phiếu không tồn tại hoặc của độc giả khác -> ném 404 NOT_FOUND.
 * - Hủy nguyên tử: chuyển trạng thái sang 'DaHuy'.
 * - Hoàn kho: Nếu hủy từ 'DaDuyet' thì hoàn lại 1 quyển vào SoQuyenConLai của Sách (nguyên tử).
 *   Nếu hủy từ 'ChoDuyet' thì không tác động kho.
 * - Ghi NhatKy qua audit.service với hành động 'HUY_PHIEU'.
 *
 * @param {string} maDocGia - Mã độc giả
 * @param {string} id - _id của phiếu mượn
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ ip })
 * @returns {Promise<object>} Document phiếu mượn sau khi hủy
 */
export const cancelBorrowing = async (maDocGia, id, meta = {}) => {
  if (!maDocGia || typeof maDocGia !== 'string') {
    throw ApiError.badRequest('Mã độc giả không hợp lệ', 'VALIDATION_ERROR');
  }

  const normalizedMaDocGia = String(maDocGia).trim().toUpperCase();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  const phieu = await TheoDoiMuonSach.findOne({
    _id: id,
    MaDocGia: normalizedMaDocGia,
  });

  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'ChoDuyet' && phieu.TrangThai !== 'DaDuyet') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Chỉ có thể hủy phiếu mượn ở trạng thái Chờ duyệt hoặc Đã duyệt'
    );
  }

  const oldStatus = phieu.TrangThai;

  // Cập nhật trạng thái phiếu nguyên tử (chống đua chuyển trạng thái đồng thời)
  const updated = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, MaDocGia: normalizedMaDocGia, TrangThai: oldStatus },
    { $set: { TrangThai: 'DaHuy' } },
    { new: true }
  );

  if (!updated) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phiếu mượn đã bị thay đổi, không thể hủy'
    );
  }

  // Tác động kho: Hoàn kho (+1 SoQuyenConLai) nếu hủy từ DaDuyet
  if (oldStatus === 'DaDuyet') {
    await Sach.updateOne(
      { MaSach: updated.MaSach },
      { $inc: { SoQuyenConLai: 1 } }
    );
  }

  // Ghi nhật ký qua audit.service
  await logAction({
    maDocGia: normalizedMaDocGia,
    hanhDong: 'HUY_PHIEU',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updated._id),
    chiTiet: {
      MaDocGia: normalizedMaDocGia,
      MaSach: updated.MaSach,
      TrangThaiCu: oldStatus,
      TrangThaiMoi: 'DaHuy',
    },
    ip: meta?.ip || '',
  });

  return updated.toObject();
};

export default {
  getBorrowSummary,
  checkEligibility,
  registerBorrow,
  getMyBorrowings,
  getBorrowingDetail,
  cancelBorrowing,
};
