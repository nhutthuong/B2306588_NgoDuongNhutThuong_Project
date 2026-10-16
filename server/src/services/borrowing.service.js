import mongoose from 'mongoose';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import DocGia from '../models/DocGia.js';
import Sach from '../models/Sach.js';
import { getSettings } from './settings.service.js';
import { logAction } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACTIVE_STATUSES, isOverdue, soNgayTre } from '../utils/borrowing.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { tinhTongPhat } from './fine.service.js';

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
    const success = await hoanKhoSach(updated.MaSach);
    if (!success) {
      // Hoàn tác phiếu về DaDuyet nếu hoàn kho thất bại
      await TheoDoiMuonSach.findOneAndUpdate(
        { _id: id, TrangThai: 'DaHuy' },
        { $set: { TrangThai: 'DaDuyet' } }
      );
      console.error(
        `[USER_CANCEL_ERROR] Hoan kho that bai cho sach ${updated.MaSach}, da hoan tac phieu ${id}`
      );
      throw new ApiError(500, 'INTERNAL_ERROR', 'Không thể hủy phiếu mượn do lỗi hoàn kho sách');
    }
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

/**
 * Lấy danh sách phiếu mượn toàn hệ thống dành cho nhân viên/admin (GET /api/admin/borrowings).
 * Hỗ trợ các bộ lọc: trangThai, maDocGia, maSach, quaHan=true, tuNgay, denNgay, trangThaiPhat.
 * Phân trang an toàn, sắp xếp -createdAt mặc định.
 * Kèm thông tin độc giả, sách, nhân viên duyệt/giao/nhận trả và các cờ động: isOverdue, soNgayTre.
 *
 * @param {object} [query={}] - Tham số truy vấn
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @returns {Promise<{ data: Array, meta: object }>}
 */
export const adminListBorrowings = async (query = {}, now = new Date()) => {
  const {
    trangThai,
    maDocGia,
    maSach,
    quaHan,
    tuNgay,
    denNgay,
    trangThaiPhat,
    page = 1,
    limit = 10,
  } = query;

  const { limit: safeLimit, skip, page: safePage } = getPagination({ page, limit });

  const filter = {};

  if (trangThai) {
    filter.TrangThai = trangThai;
  }

  if (maDocGia) {
    filter.MaDocGia = new RegExp(escapeRegex(String(maDocGia).trim()), 'i');
  }

  if (maSach) {
    filter.MaSach = new RegExp(escapeRegex(String(maSach).trim()), 'i');
  }

  const currentTime = new Date(now);

  // Lọc phiếu quá hạn: TrangThai = 'DangMuon' và HanTra < now
  if (quaHan === true || quaHan === 'true') {
    filter.TrangThai = 'DangMuon';
    filter.HanTra = { $ne: null, $lt: currentTime };
  }

  // Lọc theo khoảng ngày đăng ký / tạo phiếu
  if (tuNgay || denNgay) {
    filter.createdAt = {};
    if (tuNgay) {
      filter.createdAt.$gte = new Date(tuNgay);
    }
    if (denNgay) {
      const endOfDay = new Date(denNgay);
      endOfDay.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endOfDay;
    }
  }

  if (trangThaiPhat) {
    filter.TrangThaiPhat = trangThaiPhat;
  }

  const [items, total] = await Promise.all([
    TheoDoiMuonSach.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({
        path: 'DocGia',
        select: 'MaDocGia HoLot Ten Email DienThoai TrangThai',
      })
      .populate({
        path: 'Sach',
        select: 'MaSach TenSach AnhBia DonGia SoQuyenConLai',
      })
      .populate({
        path: 'NhanVienDuyet',
        select: 'MSNV HoTenNV ChucVu',
      })
      .populate({
        path: 'NhanVienGiao',
        select: 'MSNV HoTenNV ChucVu',
      })
      .populate({
        path: 'NhanVienNhanTra',
        select: 'MSNV HoTenNV ChucVu',
      })
      .populate({
        path: 'NhanVienThuPhat',
        select: 'MSNV HoTenNV ChucVu',
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
 * Lấy chi tiết đầy đủ của một phiếu mượn dành cho nhân viên (GET /api/admin/borrowings/:id).
 *
 * @param {string} id - _id phiếu mượn (ObjectId)
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @returns {Promise<object>}
 */
export const adminGetBorrowingDetail = async (id, now = new Date()) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  const phieu = await TheoDoiMuonSach.findById(id)
    .populate({
      path: 'DocGia',
      select: 'MaDocGia HoLot Ten Email DienThoai DiaChi TrangThai',
    })
    .populate({
      path: 'Sach',
      select: 'MaSach TenSach AnhBia DonGia NamXuatBan NguonGocTacGia TheLoai SoQuyenConLai MaNXB',
      populate: {
        path: 'NhaXuatBan',
        select: 'MaNXB TenNXB DiaChi',
      },
    })
    .populate({
      path: 'NhanVienDuyet',
      select: 'MSNV HoTenNV ChucVu',
    })
    .populate({
      path: 'NhanVienGiao',
      select: 'MSNV HoTenNV ChucVu',
    })
    .populate({
      path: 'NhanVienNhanTra',
      select: 'MSNV HoTenNV ChucVu',
    })
    .populate({
      path: 'NhanVienThuPhat',
      select: 'MSNV HoTenNV ChucVu',
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
 * Duyệt phiếu mượn sách (PATCH /api/admin/borrowings/:id/approve).
 * Chuyển trạng thái: ChoDuyet -> DaDuyet.
 * Quy tắc:
 * 1. Phiếu phải ở trạng thái 'ChoDuyet', nếu khác -> 409 INVALID_STATE.
 * 2. Độc giả phải còn HoatDong (nếu BiKhoa -> 403 ACCOUNT_LOCKED).
 * 3. Trừ kho nguyên tử 1 quyển: Sach.findOneAndUpdate({ MaSach, SoQuyenConLai: { $gt: 0 } }, { $inc: { SoQuyenConLai: -1 } }).
 *    Nếu hết sách -> ném 409 OUT_OF_STOCK.
 * 4. Cập nhật phiếu mượn nguyên tử: set TrangThai 'DaDuyet', NgayDuyet, HanNhanSach, MSNVDuyet.
 *    Nếu cập nhật phiếu thất bại (chống đua trạng thái) -> hoàn kho bù trừ (compensation) và ném 409 INVALID_STATE.
 * 5. Ghi NhatKy (DUYET_PHIEU).
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên duyệt
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ now, ip })
 * @returns {Promise<object>}
 */
export const adminApproveBorrowing = async (id, msnv, meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  const phieu = await TheoDoiMuonSach.findById(id);
  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'ChoDuyet') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Chỉ có thể duyệt phiếu mượn ở trạng thái Chờ duyệt'
    );
  }

  // Kiểm tra trạng thái độc giả tại thời điểm duyệt
  const docGia = await DocGia.findOne({ MaDocGia: phieu.MaDocGia }).lean();
  if (!docGia) {
    throw ApiError.notFound('Không tìm thấy thông tin độc giả');
  }
  if (docGia.TrangThai === 'BiKhoa') {
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản độc giả đang bị khóa, không thể duyệt phiếu mượn'
    );
  }

  // 1. Trừ kho sách nguyên tử (giữ 1 quyển)
  const updatedBook = await Sach.findOneAndUpdate(
    { MaSach: phieu.MaSach, SoQuyenConLai: { $gt: 0 } },
    { $inc: { SoQuyenConLai: -1 } },
    { new: true }
  );

  if (!updatedBook) {
    throw new ApiError(
      409,
      'OUT_OF_STOCK',
      'Sách hiện đã hết quyển có sẵn để duyệt mượn'
    );
  }

  const now = meta?.now ? new Date(meta.now) : new Date();
  const settings = await getSettings();
  const hanNhanSach = new Date(now.getTime() + settings.HanNhanSach * 24 * 60 * 60 * 1000);

  // 2. Đổi trạng thái phiếu mượn nguyên tử
  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: 'ChoDuyet' },
    {
      $set: {
        TrangThai: 'DaDuyet',
        NgayDuyet: now,
        HanNhanSach: hanNhanSach,
        MSNVDuyet: msnv,
      },
    },
    { new: true }
  );

  // Bù trừ nếu cập nhật phiếu thất bại (tránh rò rỉ số lượng sách trong kho)
  if (!updatedPhieu) {
    await Sach.updateOne(
      { MaSach: phieu.MaSach },
      { $inc: { SoQuyenConLai: 1 } }
    );
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phiếu mượn đã bị thay đổi, không thể duyệt'
    );
  }

  // 3. Ghi nhật ký qua audit.service
  await logAction({
    msnv,
    hanhDong: 'DUYET_PHIEU',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaDocGia: updatedPhieu.MaDocGia,
      MaSach: updatedPhieu.MaSach,
      NgayDuyet: updatedPhieu.NgayDuyet,
      HanNhanSach: updatedPhieu.HanNhanSach,
    },
    ip: meta?.ip || '',
  });

  return updatedPhieu.toObject();
};

/**
 * Từ chối phiếu mượn sách (PATCH /api/admin/borrowings/:id/reject).
 * Chuyển trạng thái: ChoDuyet -> TuChoi.
 * Bắt buộc có lý do từ chối (LyDoTuChoi).
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên từ chối
 * @param {string} lyDoTuChoi - Lý do từ chối
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ now, ip })
 * @returns {Promise<object>}
 */
export const adminRejectBorrowing = async (id, msnv, lyDoTuChoi, meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (!lyDoTuChoi || typeof lyDoTuChoi !== 'string' || !lyDoTuChoi.trim()) {
    throw ApiError.badRequest('Lý do từ chối là bắt buộc', 'VALIDATION_ERROR');
  }

  const phieu = await TheoDoiMuonSach.findById(id);
  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'ChoDuyet') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Chỉ có thể từ chối phiếu mượn ở trạng thái Chờ duyệt'
    );
  }

  const now = meta?.now ? new Date(meta.now) : new Date();

  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: 'ChoDuyet' },
    {
      $set: {
        TrangThai: 'TuChoi',
        LyDoTuChoi: lyDoTuChoi.trim(),
        NgayDuyet: now,
        MSNVDuyet: msnv,
      },
    },
    { new: true }
  );

  if (!updatedPhieu) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phiếu mượn đã bị thay đổi, không thể từ chối'
    );
  }

  // Ghi nhật ký qua audit.service
  await logAction({
    msnv,
    hanhDong: 'TU_CHOI_PHIEU',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaDocGia: updatedPhieu.MaDocGia,
      MaSach: updatedPhieu.MaSach,
      LyDoTuChoi: updatedPhieu.LyDoTuChoi,
    },
    ip: meta?.ip || '',
  });

  return updatedPhieu.toObject();
};

/**
 * Giao sách thực tế cho độc giả (PATCH /api/admin/borrowings/:id/handover).
 * Chuyển trạng thái: DaDuyet -> DangMuon.
 * Thiết lập: NgayMuon = now, HanTra = now + SoNgayMuon ngày, MSNVGiao = msnv.
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên giao sách
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ now, ip })
 * @returns {Promise<object>}
 */
export const adminHandoverBorrowing = async (id, msnv, meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  const phieu = await TheoDoiMuonSach.findById(id);
  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'DaDuyet') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Chỉ có thể giao sách cho phiếu mượn ở trạng thái Đã duyệt'
    );
  }

  const now = meta?.now ? new Date(meta.now) : new Date();

  // Kiểm tra nếu phiếu đã quá hạn nhận sách
  if (phieu.HanNhanSach && new Date(phieu.HanNhanSach).getTime() < now.getTime()) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Phiếu mượn đã quá hạn nhận sách, không thể thực hiện giao sách'
    );
  }

  const settings = await getSettings();
  const hanTra = new Date(now.getTime() + settings.SoNgayMuon * 24 * 60 * 60 * 1000);

  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: 'DaDuyet' },
    {
      $set: {
        TrangThai: 'DangMuon',
        NgayMuon: now,
        HanTra: hanTra,
        MSNVGiao: msnv,
      },
    },
    { new: true }
  );

  if (!updatedPhieu) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phiếu mượn đã bị thay đổi, không thể giao sách'
    );
  }

  // Ghi nhật ký qua audit.service
  await logAction({
    msnv,
    hanhDong: 'GIAO_SACH',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaDocGia: updatedPhieu.MaDocGia,
      MaSach: updatedPhieu.MaSach,
      NgayMuon: updatedPhieu.NgayMuon,
      HanTra: updatedPhieu.HanTra,
    },
    ip: meta?.ip || '',
  });

  return updatedPhieu.toObject();
};

/**
 * Hoàn lại 1 quyển sách vào kho nguyên tử (SoQuyenConLai +1).
 * Điều kiện bảo vệ bất biến 0 <= SoQuyenConLai <= SoQuyen:
 * Dùng filter $expr { $lt: ['$SoQuyenConLai', '$SoQuyen'] } để đảm bảo không cộng vượt quá SoQuyen.
 * Không lọc DaXoa (sách đã xóa mềm vẫn phải cập nhật được kho theo SYSTEM.md §6).
 *
 * @param {string} maSach - Mã sách cần hoàn kho
 * @returns {Promise<boolean>} true nếu hoàn kho thành công, false nếu vi phạm điều kiện hoặc lỗi
 */
export const hoanKhoSach = async (maSach) => {
  try {
    const updated = await Sach.findOneAndUpdate(
      {
        MaSach: maSach,
        $expr: { $lt: ['$SoQuyenConLai', '$SoQuyen'] },
      },
      { $inc: { SoQuyenConLai: 1 } },
      { new: true }
    );
    return Boolean(updated);
  } catch (err) {
    console.error(`[HOAN_KHO_ERROR] Loi khi cap nhat hoan kho sach ${maSach}:`, err.message);
    return false;
  }
};

/**
 * Giảm 1 tổng số quyển sách (SoQuyen -1) khi sách mất hoặc rách loại bỏ khỏi kho.
 * Điều kiện bảo vệ bất biến 0 <= SoQuyenConLai <= SoQuyen:
 * Dùng filter SoQuyen >= 1. Không thay đổi SoQuyenConLai.
 * Không lọc DaXoa (sách đã xóa mềm vẫn cập nhật kho).
 *
 * @param {string} maSach - Mã sách
 * @returns {Promise<boolean>} true nếu giảm kho thành công, false nếu vi phạm điều kiện hoặc lỗi
 */
export const giamTongKhoSach = async (maSach) => {
  try {
    const updated = await Sach.findOneAndUpdate(
      {
        MaSach: maSach,
        SoQuyen: { $gte: 1 },
      },
      { $inc: { SoQuyen: -1 } },
      { new: true }
    );
    return Boolean(updated);
  } catch (err) {
    console.error(`[GIAM_TONG_KHO_ERROR] Loi khi giam tong so quyen sach ${maSach}:`, err.message);
    return false;
  }
};

/**
 * Hủy phiếu mượn thay độc giả bởi nhân viên/admin (PATCH /api/admin/borrowings/:id/cancel).
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên thực hiện hủy
 * @param {string} [lyDo=''] - Lý do hủy phiếu (tối đa 300 ký tự)
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ ip })
 * @returns {Promise<object>}
 */
export const adminCancelBorrowing = async (id, msnv, lyDo = '', meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Mã định danh phiếu mượn không hợp lệ', 'VALIDATION_ERROR');
  }

  const phieu = await TheoDoiMuonSach.findById(id);
  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'ChoDuyet' && phieu.TrangThai !== 'DaDuyet') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `Không thể hủy phiếu mượn ở trạng thái '${phieu.TrangThai}' (chỉ cho phép 'ChoDuyet' hoặc 'DaDuyet')`
    );
  }

  const oldStatus = phieu.TrangThai;

  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: oldStatus },
    { $set: { TrangThai: 'DaHuy' } },
    { new: true }
  );

  if (!updatedPhieu) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phiếu mượn đã bị thay đổi bởi người khác, không thể hủy'
    );
  }

  // Nếu hủy từ DaDuyet: hoàn kho (+1 SoQuyenConLai) với điều kiện bảo vệ
  if (oldStatus === 'DaDuyet') {
    const success = await hoanKhoSach(updatedPhieu.MaSach);
    if (!success) {
      // Hoàn tác phiếu về DaDuyet nếu hoàn kho thất bại
      await TheoDoiMuonSach.findOneAndUpdate(
        { _id: id, TrangThai: 'DaHuy' },
        { $set: { TrangThai: 'DaDuyet' } }
      );
      console.error(
        `[ADMIN_CANCEL_ERROR] Hoan kho that bai cho sach ${updatedPhieu.MaSach}, da hoan tac phieu ${id}`
      );
      throw new ApiError(500, 'INTERNAL_ERROR', 'Không thể hủy phiếu mượn do lỗi hoàn kho sách');
    }
  }

  // Ghi nhật ký qua audit.service (lưu lý do trong ChiTiet, không thêm trường mới vào schema)
  await logAction({
    msnv,
    hanhDong: 'HUY_PHIEU',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaDocGia: updatedPhieu.MaDocGia,
      MaSach: updatedPhieu.MaSach,
      TrangThaiCu: oldStatus,
      TrangThaiMoi: 'DaHuy',
      NguoiHuy: 'NhanVien',
      LyDo: lyDo ? String(lyDo).trim() : '',
    },
    ip: meta?.ip || '',
  });

  return updatedPhieu.toObject();
};

/**
 * Nhận trả sách từ độc giả (PATCH /api/admin/borrowings/:id/return).
 * Quy trình xử lý theo thứ tự quan trọng:
 * 1. Đọc phiếu và sách (kể cả sách đã xóa mềm vẫn đọc được để lấy DonGia), getSettings(), now = new Date().
 * 2. Tính tongPhat bằng fine.service.
 * 3. CHIẾM phiếu nguyên tử: findOneAndUpdate({ _id, TrangThai: 'DangMuon' }, ...).
 * 4. Cập nhật kho NGUYÊN TỬ bằng $inc có điều kiện:
 *    - BinhThuong: SoQuyenConLai +1
 *    - Rach và LoaiBoKhoiKho = false: SoQuyenConLai +1
 *    - Rach và LoaiBoKhoiKho = true: SoQuyen -1
 *    - Mat: SoQuyen -1
 * 5. Nếu bước 4 thất bại hoặc ném lỗi: hoàn tác phiếu về DangMuon, xóa các trường vừa gán và ném 500 INTERNAL_ERROR.
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên nhận trả
 * @param {object} returnData - Dữ liệu trả sách { TinhTrangTra, MucRach, LoaiBoKhoiKho, GhiChuPhat }
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ now, ip })
 * @returns {Promise<object>} Phiếu mượn sau cập nhật kèm chiTietPhat
 */
export const adminReturnBorrowing = async (id, msnv, returnData, meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Mã định danh phiếu mượn không hợp lệ', 'VALIDATION_ERROR');
  }

  // 1. Đọc phiếu và sách
  const phieu = await TheoDoiMuonSach.findById(id);
  if (!phieu) {
    throw ApiError.notFound('Không tìm thấy phiếu mượn');
  }

  if (phieu.TrangThai !== 'DangMuon') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `Không thể nhận trả sách cho phiếu ở trạng thái '${phieu.TrangThai}' (chỉ cho phép khi 'DangMuon')`
    );
  }

  // Sách kể cả đã xóa mềm vẫn đọc được để lấy DonGia
  const sach = await Sach.findOne({ MaSach: phieu.MaSach });
  if (!sach) {
    throw ApiError.notFound('Không tìm thấy thông tin sách tương ứng với phiếu mượn');
  }

  const settings = await getSettings();
  const now = meta?.now ? new Date(meta.now) : new Date();

  const {
    TinhTrangTra,
    MucRach,
    LoaiBoKhoiKho = false,
    GhiChuPhat = '',
  } = returnData;

  // 2. Tính tongPhat bằng fine.service
  const chiTietPhat = tinhTongPhat({
    hanTra: phieu.HanTra,
    now,
    donGia: sach.DonGia,
    tinhTrangTra: TinhTrangTra,
    mucRach: MucRach,
    settings,
  });

  const { phiTre, phatTinhTrang, tienPhat, soNgayTre } = chiTietPhat;

  // 3. CHIẾM phiếu nguyên tử
  const updateFields = {
    TrangThai: 'DaTra',
    NgayTra: now,
    MSNVNhanTra: msnv,
    TinhTrangTra,
    LoaiBoKhoiKho: TinhTrangTra === 'Rach' ? Boolean(LoaiBoKhoiKho) : false,
    PhiTre: phiTre,
    TienPhat: tienPhat,
    GhiChuPhat: GhiChuPhat ? String(GhiChuPhat).trim() : '',
    TrangThaiPhat: tienPhat > 0 ? 'ChuaThanhToan' : 'KhongPhat',
  };

  if (TinhTrangTra === 'Rach' && MucRach) {
    updateFields.MucRach = MucRach;
  }

  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: 'DangMuon' },
    { $set: updateFields },
    { new: true }
  );

  if (!updatedPhieu) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Phiếu mượn đã được xử lý hoặc trạng thái đã bị thay đổi bởi người khác'
    );
  }

  // 4. Cập nhật kho NGUYÊN TỬ bằng $inc có điều kiện
  const isReturnToStock =
    TinhTrangTra === 'BinhThuong' || (TinhTrangTra === 'Rach' && !LoaiBoKhoiKho);

  const stockSuccess = isReturnToStock
    ? await hoanKhoSach(phieu.MaSach)
    : await giamTongKhoSach(phieu.MaSach);

  // 5. Nếu bước 4 thất bại: Hoàn tác phiếu bằng cơ chế bù trừ (compensation)
  // Lý do: MongoDB cài đặt đơn lẻ (standalone) không hỗ trợ Multi-Document Transaction,
  // do đó hệ thống áp dụng kỹ thuật thao tác nguyên tử có điều kiện kết hợp rollback bù trừ.
  if (!stockSuccess) {
    await TheoDoiMuonSach.findOneAndUpdate(
      { _id: id, TrangThai: 'DaTra' },
      {
        $set: {
          TrangThai: 'DangMuon',
          PhiTre: 0,
          TienPhat: 0,
          TrangThaiPhat: 'KhongPhat',
          LoaiBoKhoiKho: false,
          GhiChuPhat: '',
        },
        $unset: {
          NgayTra: 1,
          MSNVNhanTra: 1,
          TinhTrangTra: 1,
          MucRach: 1,
        },
      }
    );
    console.error(
      `[RETURN_ERROR] Khong the cap nhat kho cho sach ${phieu.MaSach}, da hoan tac phieu ${id}`
    );
    throw new ApiError(500, 'INTERNAL_ERROR', 'Không thể hoàn tất trả sách do lỗi cập nhật kho');
  }

  // 6. Ghi nhật ký qua audit.service
  await logAction({
    msnv,
    hanhDong: 'NHAN_TRA',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaSach: updatedPhieu.MaSach,
      MaDocGia: updatedPhieu.MaDocGia,
      TinhTrangTra: updatedPhieu.TinhTrangTra,
      TienPhat: updatedPhieu.TienPhat,
    },
    ip: meta?.ip || '',
  });

  return {
    ...updatedPhieu.toObject(),
    chiTietPhat,
  };
};

/**
 * Thu tiền phạt từ độc giả (PATCH /api/admin/borrowings/:id/pay-fine).
 * Chuyển trạng thái phạt: ChuaThanhToan -> DaThanhToan.
 * Gán NgayThanhToanPhat = now và MSNVThuPhat.
 *
 * @param {string} id - _id phiếu mượn
 * @param {string} msnv - Mã số nhân viên thu phạt
 * @param {object} [meta={}] - Dữ liệu kèm theo ({ now, ip })
 * @returns {Promise<object>}
 */
export const adminPayFine = async (id, msnv, meta = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Mã định danh phiếu mượn không hợp lệ', 'VALIDATION_ERROR');
  }

  const now = meta?.now ? new Date(meta.now) : new Date();

  // Chiếm và cập nhật trạng thái phạt nguyên tử
  const updatedPhieu = await TheoDoiMuonSach.findOneAndUpdate(
    { _id: id, TrangThai: 'DaTra', TrangThaiPhat: 'ChuaThanhToan' },
    {
      $set: {
        TrangThaiPhat: 'DaThanhToan',
        NgayThanhToanPhat: now,
        MSNVThuPhat: msnv,
      },
    },
    { new: true }
  );

  // Nếu không khớp, phân biệt rõ từng trường hợp lỗi
  if (!updatedPhieu) {
    const phieu = await TheoDoiMuonSach.findById(id).lean();
    if (!phieu) {
      throw ApiError.notFound('Không tìm thấy phiếu mượn');
    }
    if (phieu.TrangThai !== 'DaTra') {
      throw new ApiError(
        409,
        'INVALID_STATE',
        `Chỉ có thể thu tiền phạt đối với phiếu đã trả sách (trạng thái hiện tại: '${phieu.TrangThai}')`
      );
    }
    if (phieu.TrangThaiPhat === 'KhongPhat') {
      throw new ApiError(
        409,
        'INVALID_STATE',
        'Phiếu mượn này không có khoản tiền phạt nào cần thanh toán'
      );
    }
    if (phieu.TrangThaiPhat === 'DaThanhToan') {
      throw new ApiError(
        409,
        'INVALID_STATE',
        'Khoản tiền phạt của phiếu mượn này đã được thanh toán trước đó'
      );
    }
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Trạng thái phạt của phiếu mượn đã bị thay đổi bởi người khác'
    );
  }

  // Ghi nhật ký qua audit.service
  await logAction({
    msnv,
    hanhDong: 'THU_PHAT',
    doiTuong: 'TheoDoiMuonSach',
    maDoiTuong: String(updatedPhieu._id),
    chiTiet: {
      MaDocGia: updatedPhieu.MaDocGia,
      MaSach: updatedPhieu.MaSach,
      TienPhat: updatedPhieu.TienPhat,
      NgayThanhToanPhat: updatedPhieu.NgayThanhToanPhat,
      MSNVThuPhat: msnv,
    },
    ip: meta?.ip || '',
  });

  return updatedPhieu.toObject();
};

export default {
  getBorrowSummary,
  checkEligibility,
  registerBorrow,
  getMyBorrowings,
  getBorrowingDetail,
  cancelBorrowing,
  adminListBorrowings,
  adminGetBorrowingDetail,
  adminApproveBorrowing,
  adminRejectBorrowing,
  adminHandoverBorrowing,
  adminCancelBorrowing,
  adminReturnBorrowing,
  adminPayFine,
  hoanKhoSach,
  giamTongKhoSach,
};

