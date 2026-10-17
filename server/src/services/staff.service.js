import NhanVien from '../models/NhanVien.js';
import RefreshToken from '../models/RefreshToken.js';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import ApiError from '../utils/ApiError.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import {
  hashPassword,
  validatePasswordStrength,
  revokeAllForOwner,
} from './auth.service.js';
import { nextCode } from './code.service.js';
import { logAction } from './audit.service.js';

const SORT_WHITELIST = [
  'MSNV',
  '-MSNV',
  'HoTenNV',
  '-HoTenNV',
  'createdAt',
  '-createdAt',
  'ChucVu',
  '-ChucVu',
  'VaiTro',
  '-VaiTro',
];

/**
 * Lấy danh sách nhân viên có phân trang, tìm kiếm, lọc và sắp xếp
 * @param {object} query - Express query params
 * @returns {Promise<{ items: Array, meta: object }>}
 */
export const getStaffList = async (query = {}) => {
  const { page, limit, skip } = getPagination(query, 10, 100);

  const filter = {};

  const rawSearch = typeof query.search === 'string' ? query.search : '';
  const safeSearch = rawSearch.trim();

  if (safeSearch) {
    const escaped = escapeRegex(safeSearch);
    const searchRegex = new RegExp(escaped, 'i');

    filter.$or = [
      { MSNV: searchRegex },
      { HoTenNV: searchRegex },
      { ChucVu: searchRegex },
      { SoDienThoai: searchRegex },
      { DiaChi: searchRegex },
    ];
  }

  if (query.vaiTro && ['admin', 'thuthu'].includes(String(query.vaiTro))) {
    filter.VaiTro = String(query.vaiTro);
  }

  if (query.trangThai && ['HoatDong', 'BiKhoa'].includes(String(query.trangThai))) {
    filter.TrangThai = String(query.trangThai);
  }

  let sortOption = '-createdAt';
  if (query.sort && SORT_WHITELIST.includes(String(query.sort))) {
    sortOption = String(query.sort);
  }

  const [staffList, total] = await Promise.all([
    NhanVien.find(filter)
      .select('-Password -SoLanSaiMatKhau -KhoaDen')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    NhanVien.countDocuments(filter),
  ]);

  const meta = getPaginationMeta(total, page, limit);

  return { items: staffList, meta };
};

/**
 * Lấy thông tin chi tiết một nhân viên
 * @param {string} msnv
 * @returns {Promise<object>}
 */
export const getStaffDetail = async (msnv) => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv })
    .select('-Password -SoLanSaiMatKhau -KhoaDen')
    .lean();

  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  return staff;
};

/**
 * Tạo mới nhân viên (CHỈ admin)
 * Server tự sinh MSNV (NV001, NV002...), băm mật khẩu, gán BatBuocDoiMatKhau = true
 * @param {object} data - { HoTenNV, ChucVu, VaiTro, DiaChi, SoDienThoai, Password }
 * @param {object} adminUser - req.admin
 * @param {string} ip - req.ip
 * @returns {Promise<object>}
 */
export const createStaff = async (data = {}, adminUser = {}, ip = '') => {
  validatePasswordStrength(data.Password);

  const msnv = await nextCode('NhanVien');
  const hashedPassword = await hashPassword(data.Password);

  const newStaff = await NhanVien.create({
    MSNV: msnv,
    HoTenNV: String(data.HoTenNV).trim(),
    ChucVu: data.ChucVu ? String(data.ChucVu).trim() : 'Thủ thư',
    VaiTro: data.VaiTro || 'thuthu',
    DiaChi: data.DiaChi ? String(data.DiaChi).trim() : '',
    SoDienThoai: data.SoDienThoai ? String(data.SoDienThoai).trim() : '',
    Password: hashedPassword,
    TrangThai: 'HoatDong',
    BatBuocDoiMatKhau: true,
  });

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'THEM_NHAN_VIEN',
    doiTuong: 'NhanVien',
    maDoiTuong: msnv,
    chiTiet: {
      MSNV: msnv,
      HoTenNV: newStaff.HoTenNV,
      VaiTro: newStaff.VaiTro,
      ChucVu: newStaff.ChucVu,
    },
    ip,
  });

  return newStaff.toJSON();
};

/**
 * Cập nhật thông tin cơ bản của nhân viên (HoTenNV, ChucVu, DiaChi, SoDienThoai)
 * @param {string} msnv
 * @param {object} data
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<object>}
 */
export const updateStaff = async (msnv, data = {}, adminUser = {}, ip = '') => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv });
  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  const allowedFields = ['HoTenNV', 'ChucVu', 'DiaChi', 'SoDienThoai'];
  const updatePayload = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updatePayload[field] = typeof data[field] === 'string' ? data[field].trim() : data[field];
    }
  }

  const updated = await NhanVien.findOneAndUpdate(
    { MSNV: normalizedMsnv },
    { $set: updatePayload },
    { new: true, runValidators: true }
  )
    .select('-Password -SoLanSaiMatKhau -KhoaDen')
    .lean();

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'SUA_NHAN_VIEN',
    doiTuong: 'NhanVien',
    maDoiTuong: normalizedMsnv,
    chiTiet: {
      cacTruongThayDoi: Object.keys(updatePayload),
    },
    ip,
  });

  return updated;
};

/**
 * Đổi vai trò nhân viên (admin <-> thuthu)
 * Ràng buộc:
 * - Không cho admin tự đổi vai trò của chính mình
 * - Khi hạ từ admin xuống thuthu, luôn phải còn ít nhất 1 admin đang hoạt động khác
 * @param {string} msnv
 * @param {object} payload - { VaiTro: 'admin'|'thuthu' }
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<object>}
 */
export const changeStaffRole = async (msnv, { VaiTro } = {}, adminUser = {}, ip = '') => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  if (adminUser.msnv === normalizedMsnv) {
    throw new ApiError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Bạn không thể tự thay đổi vai trò của chính mình');
  }

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv });
  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  if (staff.VaiTro === VaiTro) {
    throw new ApiError(409, 'INVALID_STATE', 'Nhân viên này hiện đã có vai trò này');
  }

  // Ràng buộc: Nếu hạ quyền tài khoản admin xuống thuthu -> kiểm tra luôn còn ít nhất 1 admin đang hoạt động
  if (staff.VaiTro === 'admin' && VaiTro === 'thuthu') {
    const activeAdminCount = await NhanVien.countDocuments({
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      MSNV: { $ne: normalizedMsnv },
    });

    if (activeAdminCount < 1) {
      throw new ApiError(
        409,
        'LAST_ADMIN',
        'Không thể thay đổi vai trò vì hệ thống phải có ít nhất một quản trị viên đang hoạt động'
      );
    }
  }

  const oldRole = staff.VaiTro;
  const updated = await NhanVien.findOneAndUpdate(
    { MSNV: normalizedMsnv },
    { $set: { VaiTro } },
    { new: true }
  )
    .select('-Password -SoLanSaiMatKhau -KhoaDen')
    .lean();

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'DOI_VAI_TRO',
    doiTuong: 'NhanVien',
    maDoiTuong: normalizedMsnv,
    chiTiet: {
      VaiTroCu: oldRole,
      VaiTroMoi: VaiTro,
    },
    ip,
  });

  return updated;
};

/**
 * Khóa hoặc Mở khóa tài khoản nhân viên
 * Ràng buộc:
 * - Không cho admin tự khóa chính mình
 * - Khi khóa tài khoản có vai trò admin, luôn phải còn ít nhất 1 admin đang hoạt động khác
 * - Khóa sẽ thu hồi toàn bộ RefreshToken của nhân viên đó
 * @param {string} msnv
 * @param {object} payload - { TrangThai: 'HoatDong'|'BiKhoa', LyDo?: string }
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<{ staff: object, message: string }>}
 */
export const updateStaffStatus = async (
  msnv,
  { TrangThai, LyDo = '' } = {},
  adminUser = {},
  ip = ''
) => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  if (TrangThai === 'BiKhoa' && adminUser.msnv === normalizedMsnv) {
    throw new ApiError(409, 'CANNOT_LOCK_SELF', 'Bạn không thể tự khóa tài khoản của chính mình');
  }

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv });
  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  if (staff.TrangThai === TrangThai) {
    const message =
      TrangThai === 'BiKhoa'
        ? 'Nhân viên này hiện đang ở trạng thái bị khóa'
        : 'Nhân viên này hiện đang ở trạng thái hoạt động';
    throw new ApiError(409, 'INVALID_STATE', message);
  }

  // Ràng buộc: Khi khóa tài khoản admin -> kiểm tra luôn còn ít nhất 1 admin đang hoạt động khác
  if (TrangThai === 'BiKhoa' && staff.VaiTro === 'admin') {
    const activeAdminCount = await NhanVien.countDocuments({
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      MSNV: { $ne: normalizedMsnv },
    });

    if (activeAdminCount < 1) {
      throw new ApiError(
        409,
        'LAST_ADMIN',
        'Không thể khóa tài khoản vì hệ thống phải có ít nhất một quản trị viên đang hoạt động'
      );
    }
  }

  let updated;
  let actionMessage;

  if (TrangThai === 'BiKhoa') {
    updated = await NhanVien.findOneAndUpdate(
      { MSNV: normalizedMsnv },
      { $set: { TrangThai: 'BiKhoa' } },
      { new: true }
    )
      .select('-Password -SoLanSaiMatKhau -KhoaDen')
      .lean();

    // Thu hồi toàn bộ RefreshToken của nhân viên (access token sẽ bị authAdmin chặn ngay từ DB)
    await revokeAllForOwner(normalizedMsnv, 'nhanvien');

    await logAction({
      msnv: adminUser.msnv,
      hanhDong: 'KHOA_NHAN_VIEN',
      doiTuong: 'NhanVien',
      maDoiTuong: normalizedMsnv,
      chiTiet: { LyDo: String(LyDo || '').trim() },
      ip,
    });

    actionMessage = 'Khóa tài khoản nhân viên thành công';
  } else {
    updated = await NhanVien.findOneAndUpdate(
      { MSNV: normalizedMsnv },
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

    await logAction({
      msnv: adminUser.msnv,
      hanhDong: 'MO_KHOA_NHAN_VIEN',
      doiTuong: 'NhanVien',
      maDoiTuong: normalizedMsnv,
      chiTiet: { LyDo: String(LyDo || '').trim() },
      ip,
    });

    actionMessage = 'Mở khóa tài khoản nhân viên thành công';
  }

  return { staff: updated, message: actionMessage };
};

/**
 * Đặt lại mật khẩu tạm mới cho nhân viên
 * Set BatBuocDoiMatKhau = true, xóa khóa tạm, thu hồi mọi RefreshToken cũ
 * @param {string} msnv
 * @param {object} payload - { Password }
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<{ message: string }>}
 */
export const resetStaffPassword = async (
  msnv,
  { Password } = {},
  adminUser = {},
  ip = ''
) => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  validatePasswordStrength(Password);

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv });
  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  const hashedPassword = await hashPassword(Password);

  await NhanVien.updateOne(
    { MSNV: normalizedMsnv },
    {
      $set: {
        Password: hashedPassword,
        BatBuocDoiMatKhau: true,
        SoLanSaiMatKhau: 0,
        KhoaDen: null,
      },
    }
  );

  // Thu hồi toàn bộ RefreshToken cũ của nhân viên
  await revokeAllForOwner(normalizedMsnv, 'nhanvien');

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'RESET_MAT_KHAU_NV',
    doiTuong: 'NhanVien',
    maDoiTuong: normalizedMsnv,
    chiTiet: { MSNV: normalizedMsnv },
    ip,
  });

  return { message: 'Đặt lại mật khẩu nhân viên thành công' };
};

/**
 * Xóa nhân viên khỏi hệ thống (CHỈ admin)
 * Ràng buộc:
 * - Không cho admin tự xóa tài khoản của chính mình
 * - Không cho xóa tài khoản admin nếu là quản trị viên hoạt động duy nhất
 * - Chặn xóa nếu nhân viên đã từng tham gia xử lý phiếu mượn (duyệt, giao, nhận trả, thu phạt)
 * @param {string} msnv
 * @param {object} adminUser
 * @param {string} ip
 * @returns {Promise<{ message: string }>}
 */
export const deleteStaff = async (msnv, adminUser = {}, ip = '') => {
  const normalizedMsnv = String(msnv).trim().toUpperCase();

  if (adminUser.msnv === normalizedMsnv) {
    throw new ApiError(409, 'CANNOT_DELETE_SELF', 'Bạn không thể tự xóa tài khoản của chính mình');
  }

  const staff = await NhanVien.findOne({ MSNV: normalizedMsnv });
  if (!staff) {
    throw ApiError.notFound('Không tìm thấy nhân viên', 'NOT_FOUND');
  }

  // Ràng buộc: Nếu là admin -> kiểm tra còn ít nhất 1 admin đang hoạt động khác
  if (staff.VaiTro === 'admin') {
    const activeAdminCount = await NhanVien.countDocuments({
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      MSNV: { $ne: normalizedMsnv },
    });

    if (activeAdminCount < 1) {
      throw new ApiError(
        409,
        'LAST_ADMIN',
        'Không thể xóa vì hệ thống phải có ít nhất một quản trị viên đang hoạt động'
      );
    }
  }

  // Ràng buộc: Chặn xóa nếu nhân viên đã từng xử lý phiếu mượn (duyệt, giao, trả, phạt)
  const hasBorrowingAction = await TheoDoiMuonSach.exists({
    $or: [
      { MSNVDuyet: normalizedMsnv },
      { MSNVGiao: normalizedMsnv },
      { MSNVNhanTra: normalizedMsnv },
      { MSNVThuPhat: normalizedMsnv },
    ],
  });

  if (hasBorrowingAction) {
    throw new ApiError(
      409,
      'HAS_BORROWING_ACTIONS',
      'Không thể xóa nhân viên vì đã có lịch sử xử lý phiếu mượn trong hệ thống. Vui lòng sử dụng chức năng Khóa tài khoản.'
    );
  }

  await Promise.all([
    NhanVien.deleteOne({ MSNV: normalizedMsnv }),
    RefreshToken.deleteMany({ ChuSoHuu: normalizedMsnv, LoaiTaiKhoan: 'nhanvien' }),
  ]);

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'XOA_NHAN_VIEN',
    doiTuong: 'NhanVien',
    maDoiTuong: normalizedMsnv,
    chiTiet: { MSNV: normalizedMsnv },
    ip,
  });

  return { message: 'Xóa nhân viên thành công' };
};

export default {
  getStaffList,
  getStaffDetail,
  createStaff,
  updateStaff,
  changeStaffRole,
  updateStaffStatus,
  resetStaffPassword,
  deleteStaff,
};
