import Joi from 'joi';
import NhanVien from '../../models/NhanVien.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookie,
} from '../../utils/authCookie.js';
import {
  authenticate,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForOwner,
  verifyPassword,
  validatePasswordStrength,
  hashPassword,
} from '../../services/auth.service.js';
import { logAction } from '../../services/audit.service.js';

// Schema validate body đăng nhập nhân viên
export const loginSchema = Joi.object({
  MSNV: Joi.string().trim().required().messages({
    'any.required': 'Mã số nhân viên là bắt buộc',
    'string.empty': 'Mã số nhân viên không được để trống',
    'string.base': 'Mã số nhân viên phải là chuỗi ký tự',
  }),
  Password: Joi.string().required().messages({
    'any.required': 'Mật khẩu là bắt buộc',
    'string.empty': 'Mật khẩu không được để trống',
    'string.base': 'Mật khẩu phải là chuỗi ký tự',
  }),
});

// Schema validate body đổi mật khẩu
export const changePasswordSchema = Joi.object({
  MatKhauCu: Joi.string().required().messages({
    'any.required': 'Mật khẩu hiện tại là bắt buộc',
    'string.empty': 'Mật khẩu hiện tại không được để trống',
    'string.base': 'Mật khẩu hiện tại phải là chuỗi ký tự',
  }),
  MatKhauMoi: Joi.string().required().messages({
    'any.required': 'Mật khẩu mới là bắt buộc',
    'string.empty': 'Mật khẩu mới không được để trống',
    'string.base': 'Mật khẩu mới phải là chuỗi ký tự',
  }),
});

/**
 * POST /api/admin/auth/login
 * Đăng nhập nhân viên thư viện / admin
 */
export const login = asyncHandler(async (req, res) => {
  const { MSNV, Password } = req.body;

  // Xác thực tài khoản và kiểm tra khóa tài khoản
  const nhanVien = await authenticate('nhanvien', MSNV, Password);

  // Ký Access Token và tạo Refresh Token
  const accessToken = signAccessToken(nhanVien, 'nhanvien');
  const rawRefreshToken = await issueRefreshToken(nhanVien.MSNV, 'nhanvien', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Thiết lập cookie httpOnly rt_admin
  setRefreshCookie(res, 'nhanvien', rawRefreshToken);

  // Chuẩn hóa dữ liệu trả về, không chứa Password hay trường nhạy cảm
  const responseData = {
    accessToken,
    nhanVien: {
      MSNV: nhanVien.MSNV,
      HoTenNV: nhanVien.HoTenNV,
      ChucVu: nhanVien.ChucVu,
      VaiTro: nhanVien.VaiTro,
      BatBuocDoiMatKhau: Boolean(nhanVien.BatBuocDoiMatKhau),
    },
  };

  return ok(res, responseData, 'Đăng nhập thành công');
});

/**
 * POST /api/admin/auth/refresh
 * Làm mới access token dựa vào cookie rt_admin và rotate refresh token
 */
export const refresh = asyncHandler(async (req, res) => {
  const rawToken = getRefreshCookie(req, 'nhanvien');

  if (!rawToken) {
    clearRefreshCookie(res, 'nhanvien');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Không tìm thấy phiên làm việc để làm mới');
  }

  let rotated;
  try {
    rotated = await rotateRefreshToken(rawToken, 'nhanvien', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  } catch (err) {
    clearRefreshCookie(res, 'nhanvien');
    throw err;
  }

  // Nạp lại thông tin nhân viên từ DB để kiểm tra trạng thái mới nhất
  const nhanVien = await NhanVien.findOne({ MSNV: rotated.ownerId })
    .select('MSNV HoTenNV VaiTro TrangThai BatBuocDoiMatKhau ChucVu')
    .lean();

  if (!nhanVien) {
    await revokeAllForOwner(rotated.ownerId, 'nhanvien');
    clearRefreshCookie(res, 'nhanvien');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Tài khoản nhân viên không còn tồn tại');
  }

  if (nhanVien.TrangThai === 'BiKhoa') {
    await revokeAllForOwner(rotated.ownerId, 'nhanvien');
    clearRefreshCookie(res, 'nhanvien');
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên'
    );
  }

  // Cấp Access Token mới và set cookie Refresh Token mới
  const accessToken = signAccessToken(nhanVien, 'nhanvien');
  setRefreshCookie(res, 'nhanvien', rotated.newRawToken);

  return ok(res, { accessToken }, 'Làm mới phiên đăng nhập thành công');
});

/**
 * POST /api/admin/auth/logout
 * Đăng xuất: thu hồi refresh token, xóa cookie, không yêu cầu access token còn hạn
 */
export const logout = asyncHandler(async (req, res) => {
  const rawToken = getRefreshCookie(req, 'nhanvien');

  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  clearRefreshCookie(res, 'nhanvien');

  return ok(res, {}, 'Đăng xuất thành công');
});

/**
 * GET /api/admin/auth/me
 * Lấy thông tin tài khoản nhân viên đang đăng nhập
 */
export const getMe = asyncHandler(async (req, res) => {
  const nhanVien = await NhanVien.findOne({ MSNV: req.admin.msnv })
    .select('MSNV HoTenNV ChucVu VaiTro DiaChi SoDienThoai TrangThai BatBuocDoiMatKhau createdAt')
    .lean();

  if (!nhanVien) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thông tin nhân viên');
  }

  return ok(res, { nhanVien }, 'Lấy thông tin nhân viên thành công');
});

/**
 * PATCH /api/admin/auth/change-password
 * Đổi mật khẩu nhân viên: kiểm tra mật khẩu cũ, mật khẩu mới, thu hồi token cũ, cấp phiên mới
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { MatKhauCu, MatKhauMoi } = req.body;

  const account = await NhanVien.findOne({ MSNV: req.admin.msnv }).select('+Password');
  if (!account) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản nhân viên');
  }

  if (account.TrangThai === 'BiKhoa') {
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên'
    );
  }

  // 1. Kiểm tra mật khẩu cũ (không tính vào bộ đếm khóa tài khoản do đây là hành động tự đổi khi đã có phiên)
  const isMatch = await verifyPassword(MatKhauCu, account.Password);
  if (!isMatch) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Mật khẩu hiện tại không chính xác');
  }

  // 2. Kiểm tra độ mạnh của mật khẩu mới (≥ 8 ký tự, chữ hoa, chữ thường, số)
  validatePasswordStrength(MatKhauMoi);

  // 3. Mật khẩu mới phải khác mật khẩu cũ
  if (MatKhauCu === MatKhauMoi) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu cũ');
  }

  const isSameAsOldHash = await verifyPassword(MatKhauMoi, account.Password);
  if (isSameAsOldHash) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới không được trùng với mật khẩu cũ');
  }

  // Không cho mật khẩu mới chứa MSNV theo CONVENTIONS.md §5.1
  if (MatKhauMoi.toLowerCase().includes(account.MSNV.toLowerCase())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới không được chứa mã số nhân viên');
  }

  // 4. Băm mật khẩu mới và lưu vào DB
  const hashedPassword = await hashPassword(MatKhauMoi);
  account.Password = hashedPassword;
  account.BatBuocDoiMatKhau = false;
  account.SoLanSaiMatKhau = 0;
  account.KhoaDen = null;
  await account.save();

  // 5. Thu hồi toàn bộ refresh token cũ của nhân viên đó
  await revokeAllForOwner(account.MSNV, 'nhanvien');

  // 6. Cấp phiên mới (access token + refresh cookie mới) để người dùng không bị đăng xuất
  const accessToken = signAccessToken(account, 'nhanvien');
  const rawRefreshToken = await issueRefreshToken(account.MSNV, 'nhanvien', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  setRefreshCookie(res, 'nhanvien', rawRefreshToken);

  // 7. Ghi NhatKy với HanhDong 'DOI_MAT_KHAU' (tuyệt đối không đưa mật khẩu hay hash vào ChiTiet)
  await logAction({
    msnv: account.MSNV,
    hanhDong: 'DOI_MAT_KHAU',
    doiTuong: 'NhanVien',
    maDoiTuong: account.MSNV,
    chiTiet: {
      moTa: 'Nhân viên tự đổi mật khẩu thành công',
    },
    ip: req.ip,
  });

  return ok(
    res,
    {
      accessToken,
      nhanVien: {
        MSNV: account.MSNV,
        HoTenNV: account.HoTenNV,
        ChucVu: account.ChucVu,
        VaiTro: account.VaiTro,
        BatBuocDoiMatKhau: false,
      },
    },
    'Đổi mật khẩu thành công'
  );
});

export default {
  loginSchema,
  changePasswordSchema,
  login,
  refresh,
  logout,
  getMe,
  changePassword,
};
