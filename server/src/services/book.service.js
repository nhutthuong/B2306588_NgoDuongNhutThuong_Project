import Sach from '../models/Sach.js';
import NhaXuatBan from '../models/NhaXuatBan.js';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { getPaginationMeta } from '../utils/pagination.js';
import { nextCode } from './code.service.js';
import { logAction } from './audit.service.js';
import {
  detectImageType,
  saveCoverImage,
  deleteCoverImage,
} from '../utils/imageType.js';

// Danh sách trường cho phép sắp xếp theo API.md §4.2
const SORT_WHITELIST = [
  'MaSach',
  'TenSach',
  'DonGia',
  'SoQuyen',
  'NamXuatBan',
  'createdAt',
];

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
 * Chuẩn hóa chuỗi: trim và gộp nhiều khoảng trắng thừa
 * @param {string} str
 * @returns {string}
 */
const normalizeSpaces = (str = '') => {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Lấy danh sách sách có phân trang, tìm kiếm, lọc và gắn TenNXB bằng 1 truy vấn gộp
 *
 * @param {object} params
 * @param {string} [params.search='']
 * @param {string} [params.maNXB='']
 * @param {string} [params.theLoai='']
 * @param {boolean|string} [params.daXoa=false]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.sort='-createdAt']
 * @returns {Promise<{ items: Array, meta: object }>}
 */
export const getBooks = async ({
  search = '',
  maNXB = '',
  theLoai = '',
  daXoa = false,
  page = 1,
  limit = 10,
  sort = '-createdAt',
}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  // Xây dựng điều kiện lọc an toàn
  const filter = {};

  // Lọc theo trạng thái xóa mềm (mặc định false; true chỉ xem sách đã xóa mềm)
  const isDeleted = daXoa === true || String(daXoa).toLowerCase() === 'true';
  filter.DaXoa = isDeleted;

  // Lọc theo NXB
  if (maNXB && typeof maNXB === 'string' && maNXB.trim()) {
    filter.MaNXB = String(maNXB).trim().toUpperCase();
  }

  // Lọc theo Thể loại
  if (theLoai && typeof theLoai === 'string' && theLoai.trim()) {
    filter.TheLoai = {
      $regex: escapeRegex(String(theLoai).trim()),
      $options: 'i',
    };
  }

  // Tìm kiếm theo TenSach hoặc NguonGocTacGia bằng regex đã escapeRegex (chống ReDoS/injection)
  const searchStr = typeof search === 'string' ? search.trim() : '';
  if (searchStr) {
    const escaped = escapeRegex(searchStr);
    filter.$or = [
      { TenSach: { $regex: escaped, $options: 'i' } },
      { NguonGocTacGia: { $regex: escaped, $options: 'i' } },
    ];
  }

  const sortObj = buildSortObject(sort);

  // Truy vấn song song đếm tổng số và lấy dữ liệu trang hiện tại
  const [total, books] = await Promise.all([
    Sach.countDocuments(filter),
    Sach.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  // Lấy TenNXB cho toàn bộ danh sách bằng MỘT truy vấn gộp duy nhất (không N+1)
  const publisherCodes = [...new Set(books.map((b) => b.MaNXB).filter(Boolean))];
  let publisherMap = new Map();

  if (publisherCodes.length > 0) {
    const publishers = await NhaXuatBan.find({ MaNXB: { $in: publisherCodes } })
      .select('MaNXB TenNXB')
      .lean();
    publisherMap = new Map(publishers.map((p) => [p.MaNXB, p.TenNXB]));
  }

  const items = books.map((book) => ({
    ...book,
    TenNXB: publisherMap.get(book.MaNXB) || '',
  }));

  const meta = getPaginationMeta(total, safePage, safeLimit);

  return { items, meta };
};

/**
 * Lấy chi tiết một cuốn sách kèm thông tin NXB
 * (sách đã xóa mềm vẫn xem được ở admin, kèm cờ DaXoa = true)
 *
 * @param {string} maSach
 * @returns {Promise<object>}
 */
export const getBookByCode = async (maSach) => {
  const safeMaSach = String(maSach || '').trim().toUpperCase();

  const book = await Sach.findOne({ MaSach: safeMaSach }).lean();
  if (!book) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sách yêu cầu');
  }

  const publisher = await NhaXuatBan.findOne({ MaNXB: book.MaNXB })
    .select('MaNXB TenNXB DiaChi')
    .lean();

  return {
    ...book,
    TenNXB: publisher?.TenNXB || '',
    NhaXuatBan: publisher || null,
  };
};

/**
 * Tạo mới sách kèm tải lên ảnh bìa (nếu có)
 *
 * @param {object} bookData
 * @param {Express.Multer.File} [file]
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const createBook = async (bookData, file, admin = null, reqIp = '') => {
  const safeMaNXB = String(bookData.MaNXB || '').trim().toUpperCase();

  // Xác thực MaNXB phải tồn tại trong NhaXuatBan
  const publisher = await NhaXuatBan.findOne({ MaNXB: safeMaNXB }).lean();
  if (!publisher) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Mã nhà xuất bản không tồn tại trong hệ thống (MaNXB: ${safeMaNXB})`
    );
  }

  // Xử lý tệp ảnh bìa nếu có gửi kèm
  let anhBiaPath = '';
  if (file && file.buffer) {
    const imageInfo = detectImageType(file.buffer);
    if (!imageInfo) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Định dạng ảnh bìa không hợp lệ. Chỉ chấp nhận tệp ảnh JPEG (.jpg), PNG (.png) hoặc WebP (.webp)'
      );
    }
    // Ghi file ra đĩa sau khi xác thực thành công
    anhBiaPath = await saveCoverImage(file.buffer, imageInfo.ext);
  }

  // Tự sinh mã MaSach dạng Sxxxx
  const maSach = await nextCode('Sach');
  const normalizedTenSach = normalizeSpaces(bookData.TenSach);
  const normalizedTacGia = normalizeSpaces(bookData.NguonGocTacGia);
  const soQuyenNum = Number(bookData.SoQuyen);

  let book;
  try {
    book = await Sach.create({
      MaSach: maSach,
      TenSach: normalizedTenSach,
      DonGia: Number(bookData.DonGia),
      SoQuyen: soQuyenNum,
      SoQuyenConLai: soQuyenNum, // Server tự set SoQuyenConLai = SoQuyen
      NamXuatBan:
        bookData.NamXuatBan !== undefined && bookData.NamXuatBan !== null
          ? Number(bookData.NamXuatBan)
          : undefined,
      MaNXB: safeMaNXB,
      NguonGocTacGia: normalizedTacGia,
      TheLoai: bookData.TheLoai ? String(bookData.TheLoai).trim() : '',
      MoTa: bookData.MoTa ? String(bookData.MoTa).trim() : '',
      AnhBia: anhBiaPath,
      DaXoa: false, // Server tự set DaXoa = false
    });
  } catch (err) {
    // Nếu ghi DB thất bại thì xóa tệp ảnh bìa vừa lưu để tránh file mồ côi
    if (anhBiaPath) {
      await deleteCoverImage(anhBiaPath);
    }
    if (err.code === 11000) {
      throw new ApiError(409, 'DUPLICATE', 'Mã sách đã tồn tại trong hệ thống');
    }
    throw err;
  }

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'THEM_SACH',
    doiTuong: 'Sach',
    maDoiTuong: book.MaSach,
    chiTiet: {
      TenSach: book.TenSach,
      SoQuyen: book.SoQuyen,
      MaNXB: book.MaNXB,
    },
    ip: reqIp,
  });

  return book.toJSON ? book.toJSON() : book;
};

/**
 * Cập nhật thông tin sách và thay đổi số lượng nguyên tử
 *
 * @param {string} maSach
 * @param {object} updateData
 * @param {Express.Multer.File} [file]
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<object>}
 */
export const updateBook = async (maSach, updateData, file, admin = null, reqIp = '') => {
  const safeMaSach = String(maSach || '').trim().toUpperCase();

  const current = await Sach.findOne({ MaSach: safeMaSach });
  if (!current || current.DaXoa) {
    throw new ApiError(
      404,
      'NOT_FOUND',
      'Không tìm thấy sách hoặc sách đã bị xóa mềm'
    );
  }

  // Xác thực MaNXB nếu có cập nhật
  const safeMaNXB = String(updateData.MaNXB || current.MaNXB).trim().toUpperCase();
  const publisher = await NhaXuatBan.findOne({ MaNXB: safeMaNXB }).lean();
  if (!publisher) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Mã nhà xuất bản không tồn tại trong hệ thống (MaNXB: ${safeMaNXB})`
    );
  }

  // Kiểm tra quy tắc đổi SoQuyen:
  // dangGiu = current.SoQuyen - current.SoQuyenConLai
  // newSoQuyen phải >= dangGiu
  const newSoQuyen = Number(updateData.SoQuyen);
  const dangGiu = current.SoQuyen - current.SoQuyenConLai;
  if (newSoQuyen < dangGiu) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `Không thể giảm số quyển xuống ${newSoQuyen} vì hiện có ${dangGiu} quyển đang được mượn hoặc giữ chỗ`
    );
  }

  // Xử lý cập nhật/gỡ ảnh bìa
  let newAnhBia = undefined;
  let newlySavedPath = null;
  const oldAnhBia = current.AnhBia;

  if (file && file.buffer) {
    const imageInfo = detectImageType(file.buffer);
    if (!imageInfo) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Định dạng ảnh bìa không hợp lệ. Chỉ chấp nhận tệp ảnh JPEG (.jpg), PNG (.png) hoặc WebP (.webp)'
      );
    }
    newlySavedPath = await saveCoverImage(file.buffer, imageInfo.ext);
    newAnhBia = newlySavedPath;
  } else if (updateData.XoaAnhBia === true || String(updateData.XoaAnhBia).toLowerCase() === 'true') {
    newAnhBia = '';
  }

  const normalizedTenSach = normalizeSpaces(updateData.TenSach);
  const normalizedTacGia = normalizeSpaces(updateData.NguonGocTacGia);

  let updated;
  try {
    const setFields = {
      // Cập nhật nguyên tử: SoQuyenConLai = newSoQuyen - (SoQuyen - SoQuyenConLai)
      SoQuyenConLai: {
        $subtract: [
          newSoQuyen,
          { $subtract: ['$SoQuyen', '$SoQuyenConLai'] },
        ],
      },
      SoQuyen: newSoQuyen,
      TenSach: normalizedTenSach,
      DonGia: Number(updateData.DonGia),
      NamXuatBan:
        updateData.NamXuatBan !== undefined && updateData.NamXuatBan !== null
          ? Number(updateData.NamXuatBan)
          : undefined,
      MaNXB: safeMaNXB,
      NguonGocTacGia: normalizedTacGia,
      TheLoai: updateData.TheLoai ? String(updateData.TheLoai).trim() : '',
      MoTa: updateData.MoTa ? String(updateData.MoTa).trim() : '',
      updatedAt: '$$NOW',
    };

    if (newAnhBia !== undefined) {
      setFields.AnhBia = newAnhBia;
    }

    // Cập nhật nguyên tử một lệnh duy nhất bằng update aggregation pipeline với điều kiện $expr
    updated = await Sach.findOneAndUpdate(
      {
        MaSach: safeMaSach,
        DaXoa: false,
        $expr: {
          $gte: [
            newSoQuyen,
            { $subtract: ['$SoQuyen', '$SoQuyenConLai'] },
          ],
        },
      },
      [{ $set: setFields }],
      { new: true, runValidators: true }
    );
  } catch (err) {
    // Nếu cập nhật thất bại, xóa file ảnh mới vừa lưu
    if (newlySavedPath) {
      await deleteCoverImage(newlySavedPath);
    }
    throw err;
  }

  if (!updated) {
    // Điều kiện atomic không còn thỏa (có thể có phiếu vừa duyệt làm tăng số sách đang giữ)
    if (newlySavedPath) {
      await deleteCoverImage(newlySavedPath);
    }
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Không thể cập nhật số quyển do trạng thái giữ sách vừa thay đổi. Vui lòng thử lại.'
    );
  }

  // Xóa ảnh cũ trên đĩa nếu thay ảnh mới hoặc gỡ ảnh thành công
  if (newAnhBia !== undefined && oldAnhBia && oldAnhBia !== newAnhBia) {
    await deleteCoverImage(oldAnhBia);
  }

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'SUA_SACH',
    doiTuong: 'Sach',
    maDoiTuong: updated.MaSach,
    chiTiet: {
      TenSach: updated.TenSach,
      soQuyenCu: current.SoQuyen,
      soQuyenMoi: updated.SoQuyen,
    },
    ip: reqIp,
  });

  return updated.toJSON ? updated.toJSON() : updated;
};

/**
 * Xóa mềm sách (DaXoa = true)
 * Chặn nếu còn phiếu mượn ở trạng thái ChoDuyet, DaDuyet hoặc DangMuon
 *
 * @param {string} maSach
 * @param {object} admin
 * @param {string} [reqIp='']
 * @returns {Promise<{ message: string }>}
 */
export const deleteBook = async (maSach, admin = null, reqIp = '') => {
  const safeMaSach = String(maSach || '').trim().toUpperCase();

  const book = await Sach.findOne({ MaSach: safeMaSach });
  if (!book || book.DaXoa) {
    throw new ApiError(
      404,
      'NOT_FOUND',
      'Không tìm thấy sách hoặc sách đã bị xóa mềm'
    );
  }

  // Chặn nếu còn bất kỳ phiếu TheoDoiMuonSach nào ở trạng thái ChoDuyet, DaDuyet hoặc DangMuon
  const activeCount = await TheoDoiMuonSach.countDocuments({
    MaSach: book.MaSach,
    TrangThai: { $in: ['ChoDuyet', 'DaDuyet', 'DangMuon'] },
  });

  if (activeCount > 0) {
    throw new ApiError(
      409,
      'HAS_ACTIVE_BORROWINGS',
      `Không thể xóa sách vì còn ${activeCount} phiếu mượn đang hoạt động (chờ duyệt, đã duyệt hoặc đang mượn)`
    );
  }

  // Xóa mềm: giữ nguyên document và giữ nguyên tệp ảnh bìa
  book.DaXoa = true;
  await book.save();

  // Ghi nhật ký hoạt động
  await logAction({
    msnv: admin?.msnv,
    hanhDong: 'XOA_SACH',
    doiTuong: 'Sach',
    maDoiTuong: book.MaSach,
    chiTiet: {
      TenSach: book.TenSach,
    },
    ip: reqIp,
  });

  return { message: 'Xóa mềm sách thành công' };
};

export default {
  getBooks,
  getBookByCode,
  createBook,
  updateBook,
  deleteBook,
};
