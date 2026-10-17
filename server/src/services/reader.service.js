import DocGia from '../models/DocGia.js';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import RefreshToken from '../models/RefreshToken.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { ACTIVE_STATUSES, isOverdue, soNgayTre } from '../utils/borrowing.js';
import { getBorrowSummary } from './borrowing.service.js';
import { revokeAllForOwner } from './auth.service.js';
import { logAction } from './audit.service.js';

// Danh sách các trường sắp xếp được phép cho danh sách độc giả
const SORT_WHITELIST = [
  'MaDocGia',
  '-MaDocGia',
  'Ten',
  '-Ten',
  'createdAt',
  '-createdAt',
  'LanDangNhapCuoi',
  '-LanDangNhapCuoi',
];

/**
 * Lấy danh sách độc giả có phân trang, tìm kiếm, lọc trạng thái, sắp xếp
 * và thống kê gộp một lần (dangChiemCho, coQuaHan, tongPhatChuaTra)
 *
 * @param {object} query - Express query params
 * @returns {Promise<{ items: Array, meta: object }>}
 */
export const getReaders = async (query = {}) => {
  const { page, limit, skip } = getPagination(query, 10, 100);

  const filter = {};

  // Xử lý tìm kiếm an toàn (ép String, chống NoSQL injection & regex injection)
  const rawSearch = typeof query.search === 'string' ? query.search : '';
  const safeSearch = rawSearch.trim();

  if (safeSearch) {
    const escaped = escapeRegex(safeSearch);
    const searchRegex = new RegExp(escaped, 'i');

    filter.$or = [
      { MaDocGia: searchRegex },
      { HoLot: searchRegex },
      { Ten: searchRegex },
      { Email: searchRegex },
      { DienThoai: searchRegex },
      {
        $expr: {
          $regexMatch: {
            input: {
              $concat: [
                { $ifNull: ['$HoLot', ''] },
                ' ',
                { $ifNull: ['$Ten', ''] },
              ],
            },
            regex: escaped,
            options: 'i',
          },
        },
      },
    ];
  }

  // Lọc theo trạng thái
  if (query.trangThai && ['HoatDong', 'BiKhoa'].includes(String(query.trangThai))) {
    filter.TrangThai = String(query.trangThai);
  }

  // Sắp xếp an toàn theo whitelist
  let sortOption = '-createdAt';
  if (query.sort && SORT_WHITELIST.includes(String(query.sort))) {
    sortOption = String(query.sort);
  }

  // Lấy danh sách độc giả và tổng số bản ghi
  const [readers, total] = await Promise.all([
    DocGia.find(filter)
      .select('-Password -SoLanSaiMatKhau -KhoaDen')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    DocGia.countDocuments(filter),
  ]);

  // Thống kê gộp MỘT truy vấn aggregate theo danh sách MaDocGia của trang hiện tại (chống N+1)
  const maDocGiaList = readers.map((r) => r.MaDocGia);
  const statsMap = new Map();

  if (maDocGiaList.length > 0) {
    const now = new Date();
    const statsList = await TheoDoiMuonSach.aggregate([
      {
        $match: {
          MaDocGia: { $in: maDocGiaList },
        },
      },
      {
        $group: {
          _id: '$MaDocGia',
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
                    { $lt: ['$HanTra', now] },
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
        },
      },
    ]);

    for (const stat of statsList) {
      statsMap.set(stat._id, stat);
    }
  }

  // Ghép thống kê vào từng độc giả
  const items = readers.map((reader) => {
    const st = statsMap.get(reader.MaDocGia) || {};
    return {
      ...reader,
      dangChiemCho: st.dangChiemCho || 0,
      coQuaHan: (st.coQuaHanCount || 0) > 0,
      tongPhatChuaTra: st.tongPhatChuaTra || 0,
    };
  });

  const meta = getPaginationMeta(total, page, limit);

  return { items, meta };
};

/**
 * Lấy hồ sơ chi tiết độc giả kèm summary và lịch sử mượn phân trang riêng
 *
 * @param {string} maDocGia
 * @param {object} query - { borrowPage, borrowLimit, trangThai }
 * @returns {Promise<object>}
 */
export const getReaderDetail = async (maDocGia, query = {}) => {
  const normalizedMa = String(maDocGia).trim().toUpperCase();

  const reader = await DocGia.findOne({ MaDocGia: normalizedMa })
    .select('-Password -SoLanSaiMatKhau -KhoaDen')
    .lean();

  if (!reader) {
    throw ApiError.notFound('Không tìm thấy độc giả', 'NOT_FOUND');
  }

  // Lấy summary từ borrowing.service
  const summary = await getBorrowSummary(normalizedMa);

  // Phân trang lịch sử mượn
  const borrowPage = Math.max(1, parseInt(query.borrowPage, 10) || 1);
  const rawBorrowLimit = parseInt(query.borrowLimit, 10) || 10;
  const borrowLimit = Math.min(Math.max(1, rawBorrowLimit), 50);
  const borrowSkip = (borrowPage - 1) * borrowLimit;

  const borrowFilter = { MaDocGia: normalizedMa };
  if (
    query.trangThai &&
    ['ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy'].includes(
      String(query.trangThai)
    )
  ) {
    borrowFilter.TrangThai = String(query.trangThai);
  }

  // Lấy danh sách phiếu mượn kèm thông tin sách (populate gộp)
  const [borrowings, totalBorrowings] = await Promise.all([
    TheoDoiMuonSach.find(borrowFilter)
      .populate({ path: 'Sach', select: 'MaSach TenSach DonGia AnhBia' })
      .sort({ createdAt: -1 })
      .skip(borrowSkip)
      .limit(borrowLimit)
      .lean(),
    TheoDoiMuonSach.countDocuments(borrowFilter),
  ]);

  const now = new Date();
  const formattedBorrowings = borrowings.map((b) => ({
    ...b,
    TenSach: b.Sach?.TenSach || '',
    DonGiaSach: b.Sach?.DonGia || 0,
    AnhBiaSach: b.Sach?.AnhBia || '',
    isOverdue: isOverdue(b, now),
    soNgayTre: soNgayTre(b, now),
  }));

  const borrowMeta = getPaginationMeta(totalBorrowings, borrowPage, borrowLimit);

  return {
    ...reader,
    summary,
    borrowings: {
      items: formattedBorrowings,
      meta: borrowMeta,
    },
  };
};

/**
 * Cập nhật thông tin độc giả (chỉ cho phép HoLot, Ten, NgaySinh, Phai, DiaChi, DienThoai)
 *
 * @param {string} maDocGia
 * @param {object} data
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<object>}
 */
export const updateReader = async (maDocGia, data = {}, adminUser = {}, ip = '') => {
  const normalizedMa = String(maDocGia).trim().toUpperCase();

  const reader = await DocGia.findOne({ MaDocGia: normalizedMa });
  if (!reader) {
    throw ApiError.notFound('Không tìm thấy độc giả', 'NOT_FOUND');
  }

  const allowedFields = ['HoLot', 'Ten', 'NgaySinh', 'Phai', 'DiaChi', 'DienThoai'];
  const updatePayload = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updatePayload[field] = data[field];
    }
  }

  const updated = await DocGia.findOneAndUpdate(
    { MaDocGia: normalizedMa },
    { $set: updatePayload },
    { new: true, runValidators: true }
  )
    .select('-Password -SoLanSaiMatKhau -KhoaDen')
    .lean();

  // Ghi nhật ký hoạt động (ChiTiet CHỈ liệt kê tên các trường đã đổi, không chứa dữ liệu cá nhân)
  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'SUA_DOC_GIA',
    doiTuong: 'DocGia',
    maDoiTuong: normalizedMa,
    chiTiet: {
      cacTruongThayDoi: Object.keys(updatePayload),
    },
    ip,
  });

  return updated;
};

/**
 * Cập nhật trạng thái độc giả (Khóa hoặc Mở khóa) — CHỈ admin
 *
 * @param {string} maDocGia
 * @param {object} payload - { TrangThai: 'HoatDong'|'BiKhoa', LyDo?: string }
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<{ reader: object, message: string }>}
 */
export const updateReaderStatus = async (
  maDocGia,
  { TrangThai, LyDo = '' } = {},
  adminUser = {},
  ip = ''
) => {
  const normalizedMa = String(maDocGia).trim().toUpperCase();

  const reader = await DocGia.findOne({ MaDocGia: normalizedMa });
  if (!reader) {
    throw ApiError.notFound('Không tìm thấy độc giả', 'NOT_FOUND');
  }

  // Đặt đúng trạng thái đang có thì trả về 409 INVALID_STATE
  if (reader.TrangThai === TrangThai) {
    const message =
      TrangThai === 'BiKhoa'
        ? 'Độc giả này hiện đang ở trạng thái bị khóa'
        : 'Độc giả này hiện đang ở trạng thái hoạt động';
    throw new ApiError(409, 'INVALID_STATE', message);
  }

  let updated;
  let actionMessage;

  if (TrangThai === 'BiKhoa') {
    // 1. Cập nhật BiKhoa
    updated = await DocGia.findOneAndUpdate(
      { MaDocGia: normalizedMa },
      { $set: { TrangThai: 'BiKhoa' } },
      { new: true }
    )
      .select('-Password -SoLanSaiMatKhau -KhoaDen')
      .lean();

    // 2. Thu hồi toàn bộ RefreshToken của độc giả (access token bị authUser chặn ngay từ DB)
    await revokeAllForOwner(normalizedMa, 'docgia');

    // 3. Ghi nhật ký
    await logAction({
      msnv: adminUser.msnv,
      hanhDong: 'KHOA_DOC_GIA',
      doiTuong: 'DocGia',
      maDoiTuong: normalizedMa,
      chiTiet: { LyDo: String(LyDo || '').trim() },
      ip,
    });

    actionMessage = 'Khóa tài khoản độc giả thành công';
  } else {
    // 1. Mở khóa: set HoatDong, SoLanSaiMatKhau = 0, xóa KhoaDen
    updated = await DocGia.findOneAndUpdate(
      { MaDocGia: normalizedMa },
      {
        $set: {
          TrangThai: 'HoatDong',
          SoLanSaiMatKhau: 0,
          KhoaDen: null,
        },
      },
      { new: true }
    )
      .select('-Password -SoLanSaiMatKhau -KhoaDen')
      .lean();

    // 2. Ghi nhật ký
    await logAction({
      msnv: adminUser.msnv,
      hanhDong: 'MO_KHOA_DOC_GIA',
      doiTuong: 'DocGia',
      maDoiTuong: normalizedMa,
      chiTiet: { LyDo: String(LyDo || '').trim() },
      ip,
    });

    actionMessage = 'Mở khóa tài khoản độc giả thành công';
  }

  return { reader: updated, message: actionMessage };
};

/**
 * Xóa độc giả (CHỈ admin)
 * Ràng buộc: Chặn nếu độc giả có BẤT KỲ phiếu nào trong TheoDoiMuonSach (mọi trạng thái)
 * để bảo đảm toàn vẹn dữ liệu và tránh mất tham chiếu lịch sử mượn sách.
 *
 * @param {string} maDocGia
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<{ message: string }>}
 */
export const deleteReader = async (maDocGia, adminUser = {}, ip = '') => {
  const normalizedMa = String(maDocGia).trim().toUpperCase();

  const reader = await DocGia.findOne({ MaDocGia: normalizedMa });
  if (!reader) {
    throw ApiError.notFound('Không tìm thấy độc giả', 'NOT_FOUND');
  }

  // Kiểm tra xem độc giả có bất kỳ phiếu nào trong TheoDoiMuonSach không
  const borrowCount = await TheoDoiMuonSach.countDocuments({ MaDocGia: normalizedMa });
  if (borrowCount > 0) {
    throw new ApiError(
      409,
      'HAS_BORROWINGS',
      `Không thể xóa độc giả vì đã có ${borrowCount} phiếu mượn trong hệ thống. Vui lòng sử dụng chức năng Khóa tài khoản để vô hiệu hóa độc giả này.`
    );
  }

  // Xóa độc giả và xóa toàn bộ refresh token liên quan
  await Promise.all([
    DocGia.deleteOne({ MaDocGia: normalizedMa }),
    RefreshToken.deleteMany({ ChuSoHuu: normalizedMa, LoaiTaiKhoan: 'docgia' }),
  ]);

  // Ghi nhật ký (ChiTiet chỉ có MaDocGia)
  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'XOA_DOC_GIA',
    doiTuong: 'DocGia',
    maDoiTuong: normalizedMa,
    chiTiet: { MaDocGia: normalizedMa },
    ip,
  });

  return { message: 'Xóa độc giả thành công' };
};

export default {
  getReaders,
  getReaderDetail,
  updateReader,
  updateReaderStatus,
  deleteReader,
};
