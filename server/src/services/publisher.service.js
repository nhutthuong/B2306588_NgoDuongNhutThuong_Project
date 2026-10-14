import NhaXuatBan from '../models/NhaXuatBan.js';
import Sach from '../models/Sach.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { getPaginationMeta } from '../utils/pagination.js';
import { nextCode } from './code.service.js';
import { logAction } from './audit.service.js';

// Danh sách các trường được phép sắp xếp
const SORT_WHITELIST = ['MaNXB', 'TenNXB', 'createdAt'];

/**
 * Xây dựng object sort cho Mongoose từ chuỗi sort
 * @param {string} sortStr
 * @returns {Record<string, number>}
 */
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

/**
 * Chuẩn hóa chuỗi ký tự: trim và gộp nhiều khoảng trắng liên tiếp thành một
 * @param {string} str
 * @returns {string}
 */
const normalizeSpaces = (str = '') => {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Lấy danh sách nhà xuất bản có phân trang, tìm kiếm, sắp xếp và số sách chưa xóa mềm
 *
 * @param {object} params
 * @param {string} [params.search='']
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.sort='-createdAt']
 * @returns {Promise<{ items: Array, meta: object }>}
 */
export const getPublishers = async ({ search = '', page = 1, limit = 10, sort = '-createdAt' }) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  // Lọc tìm kiếm theo TenNXB bằng regex đã escapeRegex, không phân biệt hoa thường
  const filter = {};
  const searchStr = typeof search === 'string' ? search.trim() : '';
  if (searchStr) {
    filter.TenNXB = {
      $regex: escapeRegex(searchStr),
      $options: 'i',
    };
  }

  const sortObj = buildSortObject(sort);

  // Đếm tổng số bản ghi và truy vấn phân trang
  const [total, publishers] = await Promise.all([
    NhaXuatBan.countDocuments(filter),
    NhaXuatBan.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  // Tính số sách chưa xóa mềm (DaXoa != true) bằng 1 truy vấn gộp qua aggregation
  const publisherCodes = publishers.map((p) => p.MaNXB);
  let countMap = new Map();

  if (publisherCodes.length > 0) {
    const bookCounts = await Sach.aggregate([
      {
        $match: {
          MaNXB: { $in: publisherCodes },
          DaXoa: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$MaNXB',
          count: { $sum: 1 },
        },
      },
    ]);

    countMap = new Map(bookCounts.map((b) => [b._id, b.count]));
  }

  // Gắn thuộc tính SoSach vào từng nhà xuất bản
  const items = publishers.map((pub) => ({
    ...pub,
    SoSach: countMap.get(pub.MaNXB) || 0,
  }));

  const meta = getPaginationMeta(total, safePage, safeLimit);

  return { items, meta };
};

/**
 * Lấy chi tiết một nhà xuất bản kèm số sách chưa xóa mềm
 *
 * @param {string} maNXB
 * @returns {Promise<object>}
 */
export const getPublisherByCode = async (maNXB) => {
  const safeMaNXB = String(maNXB || '').trim();

  const publisher = await NhaXuatBan.findOne({ MaNXB: safeMaNXB }).lean();
  if (!publisher) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy nhà xuất bản');
  }

  const soSach = await Sach.countDocuments({
    MaNXB: safeMaNXB,
    DaXoa: { $ne: true },
  });

  return {
    ...publisher,
    SoSach: soSach,
  };
};

/**
 * Tạo mới nhà xuất bản
 *
 * @param {object} payload
 * @param {string} payload.TenNXB
 * @param {string} [payload.DiaChi='']
 * @param {object} admin - Thông tin nhân viên thực hiện (từ req.admin)
 * @param {string} [reqIp=''] - IP của request
 * @returns {Promise<object>}
 */
export const createPublisher = async ({ TenNXB, DiaChi = '' }, admin = null, reqIp = '') => {
  const normalizedTenNXB = normalizeSpaces(TenNXB);
  const normalizedDiaChi = normalizeSpaces(DiaChi);

  // Kiểm tra trùng tên nhà xuất bản (không phân biệt hoa thường theo collation của model)
  const existing = await NhaXuatBan.findOne({ TenNXB: normalizedTenNXB }).collation({
    locale: 'vi',
    strength: 2,
  });

  if (existing) {
    throw new ApiError(409, 'DUPLICATE', 'Tên nhà xuất bản đã tồn tại trong hệ thống');
  }

  // Tự sinh mã MaNXB dạng NXBxxx qua Counter nguyên tử
  const maNXB = await nextCode('NhaXuatBan');

  let publisher;
  try {
    publisher = await NhaXuatBan.create({
      MaNXB: maNXB,
      TenNXB: normalizedTenNXB,
      DiaChi: normalizedDiaChi,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'DUPLICATE', 'Tên hoặc mã nhà xuất bản đã tồn tại trong hệ thống');
    }
    throw err;
  }

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'THEM_NXB',
    doiTuong: 'NhaXuatBan',
    maDoiTuong: publisher.MaNXB,
    chiTiet: {
      TenNXB: publisher.TenNXB,
      DiaChi: publisher.DiaChi,
    },
    ip: reqIp,
  });

  return publisher.toJSON ? publisher.toJSON() : publisher;
};

/**
 * Cập nhật thông tin nhà xuất bản (không đổi MaNXB)
 *
 * @param {string} maNXB
 * @param {object} payload
 * @param {string} payload.TenNXB
 * @param {string} [payload.DiaChi='']
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const updatePublisher = async (maNXB, { TenNXB, DiaChi = '' }, admin = null, reqIp = '') => {
  const safeMaNXB = String(maNXB || '').trim();

  const current = await NhaXuatBan.findOne({ MaNXB: safeMaNXB });
  if (!current) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy nhà xuất bản');
  }

  const normalizedTenNXB = normalizeSpaces(TenNXB);
  const normalizedDiaChi = normalizeSpaces(DiaChi);

  // Kiểm tra trùng tên với nhà xuất bản khác (không phân biệt hoa thường)
  const duplicate = await NhaXuatBan.findOne({
    TenNXB: normalizedTenNXB,
    MaNXB: { $ne: current.MaNXB },
  }).collation({ locale: 'vi', strength: 2 });

  if (duplicate) {
    throw new ApiError(409, 'DUPLICATE', 'Tên nhà xuất bản đã tồn tại ở nhà xuất bản khác');
  }

  let updated;
  try {
    updated = await NhaXuatBan.findOneAndUpdate(
      { MaNXB: current.MaNXB },
      {
        TenNXB: normalizedTenNXB,
        DiaChi: normalizedDiaChi,
      },
      {
        new: true,
        runValidators: true,
      }
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'DUPLICATE', 'Tên nhà xuất bản đã tồn tại ở nhà xuất bản khác');
    }
    throw err;
  }

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'SUA_NXB',
    doiTuong: 'NhaXuatBan',
    maDoiTuong: updated.MaNXB,
    chiTiet: {
      tenCu: current.TenNXB,
      tenMoi: updated.TenNXB,
      diaChiCu: current.DiaChi,
      diaChiMoi: updated.DiaChi,
    },
    ip: reqIp,
  });

  return updated.toJSON ? updated.toJSON() : updated;
};

/**
 * Xóa nhà xuất bản (chỉ khi không còn bất kỳ sách nào, kể cả sách đã xóa mềm)
 *
 * @param {string} maNXB
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<{ message: string }>}
 */
export const deletePublisher = async (maNXB, admin = null, reqIp = '') => {
  const safeMaNXB = String(maNXB || '').trim();

  const publisher = await NhaXuatBan.findOne({ MaNXB: safeMaNXB });
  if (!publisher) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy nhà xuất bản');
  }

  // Chặn nếu còn BẤT KỲ cuốn Sach nào có MaNXB này, KỂ CẢ sách đã xóa mềm
  const bookCount = await Sach.countDocuments({ MaNXB: publisher.MaNXB });
  if (bookCount > 0) {
    throw new ApiError(
      409,
      'HAS_BOOKS',
      `Không thể xóa nhà xuất bản vì còn ${bookCount} cuốn sách liên quan (kể cả sách đã xóa mềm)`
    );
  }

  await NhaXuatBan.findOneAndDelete({ MaNXB: publisher.MaNXB });

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'XOA_NXB',
    doiTuong: 'NhaXuatBan',
    maDoiTuong: publisher.MaNXB,
    chiTiet: {
      TenNXB: publisher.TenNXB,
    },
    ip: reqIp,
  });

  return { message: 'Xóa nhà xuất bản thành công' };
};

export default {
  getPublishers,
  getPublisherByCode,
  createPublisher,
  updatePublisher,
  deletePublisher,
};
