import KeSach from '../models/KeSach.js';
import Sach from '../models/Sach.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { getPaginationMeta } from '../utils/pagination.js';
import { nextCode } from './code.service.js';
import { logAction } from './audit.service.js';

// Danh sách các trường được phép sắp xếp
const SORT_WHITELIST = ['MaKe', 'TenKe', 'KhuVuc', 'SoNgan', 'createdAt'];

const buildSortObject = (sortStr = '-createdAt') => {
  const safeStr = typeof sortStr === 'string' ? sortStr.trim() : '-createdAt';
  let field = safeStr;
  let order = 1;

  if (field.startsWith('-')) {
    order = -1;
    field = field.substring(1);
  }

  if (!SORT_WHITELIST.includes(field)) {
    return { createdAt: -1 };
  }

  return { [field]: order };
};

const normalizeSpaces = (str = '') => {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Lấy danh sách kệ sách có phân trang, tìm kiếm, lọc theo khu vực và đếm số sách trên kệ
 *
 * @param {object} params
 * @param {string} [params.search='']
 * @param {string} [params.khuVuc='']
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.sort='-createdAt']
 * @returns {Promise<{ items: Array, meta: object }>}
 */
export const getShelves = async ({
  search = '',
  khuVuc = '',
  page = 1,
  limit = 10,
  sort = '-createdAt',
}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  const searchStr = typeof search === 'string' ? search.trim() : '';
  if (searchStr) {
    const searchRegex = {
      $regex: escapeRegex(searchStr),
      $options: 'i',
    };
    filter.$or = [{ TenKe: searchRegex }, { MaKe: searchRegex }, { KhuVuc: searchRegex }];
  }

  if (khuVuc && typeof khuVuc === 'string' && khuVuc.trim()) {
    filter.KhuVuc = {
      $regex: `^${escapeRegex(khuVuc.trim())}$`,
      $options: 'i',
    };
  }

  const sortObj = buildSortObject(sort);

  const [total, shelves] = await Promise.all([
    KeSach.countDocuments(filter),
    KeSach.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  // Đếm số đầu sách đang đặt trên từng kệ
  const shelfCodes = shelves.map((s) => s.MaKe);
  let countMap = new Map();

  if (shelfCodes.length > 0) {
    const bookCounts = await Sach.aggregate([
      {
        $match: {
          MaKe: { $in: shelfCodes },
          DaXoa: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$MaKe',
          count: { $sum: 1 },
        },
      },
    ]);

    countMap = new Map(bookCounts.map((b) => [b._id, b.count]));
  }

  const items = shelves.map((shelf) => ({
    ...shelf,
    SoSach: countMap.get(shelf.MaKe) || 0,
  }));

  const meta = getPaginationMeta(total, safePage, safeLimit);

  return { items, meta };
};

/**
 * Lấy toàn bộ danh sách kệ gọn nhẹ (phục vụ dropdown chọn kệ trong form sách)
 * @returns {Promise<Array>}
 */
export const getAllShelvesSimple = async () => {
  return KeSach.find({})
    .select('MaKe TenKe KhuVuc SoNgan')
    .sort({ KhuVuc: 1, TenKe: 1 })
    .lean();
};

/**
 * Lấy chi tiết một kệ sách kèm danh sách sách đang đặt trên kệ
 *
 * @param {string} maKe
 * @returns {Promise<object>}
 */
export const getShelfByCode = async (maKe) => {
  const safeMaKe = String(maKe || '').trim().toUpperCase();

  const shelf = await KeSach.findOne({ MaKe: safeMaKe }).lean();
  if (!shelf) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy kệ sách');
  }

  const books = await Sach.find({
    MaKe: safeMaKe,
    DaXoa: { $ne: true },
  })
    .select('MaSach TenSach ViTriNgan SoQuyen SoQuyenConLai AnhBia')
    .sort({ ViTriNgan: 1, TenSach: 1 })
    .lean();

  return {
    ...shelf,
    SoSach: books.length,
    DanhSachSach: books,
  };
};

/**
 * Tạo mới một kệ sách
 *
 * @param {object} shelfData
 * @param {string} shelfData.TenKe
 * @param {string} shelfData.KhuVuc
 * @param {number} [shelfData.SoNgan=5]
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const createShelf = async ({ TenKe, KhuVuc, SoNgan = 5 }, admin = null, reqIp = '') => {
  const cleanTenKe = normalizeSpaces(TenKe);
  const cleanKhuVuc = normalizeSpaces(KhuVuc);
  const cleanSoNgan = parseInt(SoNgan, 10) || 5;

  const maKe = await nextCode('KeSach');

  const newShelf = await KeSach.create({
    MaKe: maKe,
    TenKe: cleanTenKe,
    KhuVuc: cleanKhuVuc,
    SoNgan: cleanSoNgan,
  });

  // Ghi nhật ký hệ thống
  if (admin && admin.msnv) {
    await logAction({
      msnv: admin.msnv,
      hanhDong: 'THEM_KE_SACH',
      doiTuong: 'KeSach',
      maDoiTuong: maKe,
      chiTiet: {
        TenKe: cleanTenKe,
        KhuVuc: cleanKhuVuc,
        SoNgan: cleanSoNgan,
      },
      ip: reqIp,
    });
  }

  return {
    ...newShelf.toJSON(),
    SoSach: 0,
  };
};

/**
 * Cập nhật thông tin kệ sách
 *
 * @param {string} maKe
 * @param {object} shelfData
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const updateShelf = async (maKe, { TenKe, KhuVuc, SoNgan }, admin = null, reqIp = '') => {
  const safeMaKe = String(maKe || '').trim().toUpperCase();

  const shelf = await KeSach.findOne({ MaKe: safeMaKe });
  if (!shelf) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy kệ sách để cập nhật');
  }

  const cleanTenKe = normalizeSpaces(TenKe);
  const cleanKhuVuc = normalizeSpaces(KhuVuc);
  const cleanSoNgan = parseInt(SoNgan, 10);

  // Nếu giảm số ngăn, kiểm tra xem có sách nào đang nằm ở ngăn vượt quá số ngăn mới không
  if (cleanSoNgan < shelf.SoNgan) {
    const booksExceeding = await Sach.find({
      MaKe: safeMaKe,
      ViTriNgan: { $gt: cleanSoNgan },
      DaXoa: { $ne: true },
    })
      .select('MaSach TenSach ViTriNgan')
      .lean();

    if (booksExceeding.length > 0) {
      throw new ApiError(
        400,
        'SHELF_HAS_BOOKS_EXCEEDING_NEW_TIER',
        `Không thể giảm số ngăn xuống ${cleanSoNgan} vì đang có ${booksExceeding.length} cuốn sách ở các ngăn lớn hơn ${cleanSoNgan}. Vui lòng chuyển sách trước.`
      );
    }
  }

  const oldData = {
    TenKe: shelf.TenKe,
    KhuVuc: shelf.KhuVuc,
    SoNgan: shelf.SoNgan,
  };

  shelf.TenKe = cleanTenKe;
  shelf.KhuVuc = cleanKhuVuc;
  shelf.SoNgan = cleanSoNgan;

  await shelf.save();

  if (admin && admin.msnv) {
    await logAction({
      msnv: admin.msnv,
      hanhDong: 'SUA_KE_SACH',
      doiTuong: 'KeSach',
      maDoiTuong: safeMaKe,
      chiTiet: {
        truoc: oldData,
        sau: {
          TenKe: cleanTenKe,
          KhuVuc: cleanKhuVuc,
          SoNgan: cleanSoNgan,
        },
      },
      ip: reqIp,
    });
  }

  const soSach = await Sach.countDocuments({
    MaKe: safeMaKe,
    DaXoa: { $ne: true },
  });

  return {
    ...shelf.toJSON(),
    SoSach: soSach,
  };
};

/**
 * Xóa một kệ sách (chặn xóa nếu đang có sách gán vào kệ)
 *
 * @param {string} maKe
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const deleteShelf = async (maKe, admin = null, reqIp = '') => {
  const safeMaKe = String(maKe || '').trim().toUpperCase();

  const shelf = await KeSach.findOne({ MaKe: safeMaKe });
  if (!shelf) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy kệ sách để xóa');
  }

  // Ràng buộc toàn vẹn: Chặn xóa nếu còn sách gán vào kệ
  const bookCount = await Sach.countDocuments({
    MaKe: safeMaKe,
    DaXoa: { $ne: true },
  });

  if (bookCount > 0) {
    throw new ApiError(
      409,
      'SHELF_IN_USE',
      `Không thể xóa kệ sách "${shelf.TenKe}" vì đang có ${bookCount} đầu sách xếp trên kệ. Vui lòng chuyển hoặc gỡ sách khỏi kệ trước.`
    );
  }

  await KeSach.deleteOne({ MaKe: safeMaKe });

  if (admin && admin.msnv) {
    await logAction({
      msnv: admin.msnv,
      hanhDong: 'XOA_KE_SACH',
      doiTuong: 'KeSach',
      maDoiTuong: safeMaKe,
      chiTiet: {
        TenKe: shelf.TenKe,
        KhuVuc: shelf.KhuVuc,
      },
      ip: reqIp,
    });
  }

  return {
    MaKe: safeMaKe,
    TenKe: shelf.TenKe,
    message: 'Xóa kệ sách thành công',
  };
};

export default {
  getShelves,
  getAllShelvesSimple,
  getShelfByCode,
  createShelf,
  updateShelf,
  deleteShelf,
};

