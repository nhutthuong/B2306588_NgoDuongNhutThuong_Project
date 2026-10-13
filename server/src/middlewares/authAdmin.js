import { verifyAccessToken } from '../services/auth.service.js';
import NhanVien from '../models/NhanVien.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Factory tạo middleware xác thực nhân viên / admin
 * @param {object} [options={}]
 * @param {boolean} [options.allowPendingPasswordChange=false] - Cho phép đi tiếp khi BatBuocDoiMatKhau = true
 */
const createAuthAdminMiddleware = (options = {}) => {
  const allowPendingPasswordChange = Boolean(options.allowPendingPasswordChange);

  return asyncHandler(async (req, res, next) => {
    // 1. Đọc header Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'Mã xác thực không được cung cấp hoặc sai định dạng'
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Mã xác thực không được để trống');
    }

    // 2. Xác thực JWT Access Token cho nhân viên (aud: 'admin')
    const decoded = verifyAccessToken(token, 'nhanvien');

    // 3. Nạp lại nhân viên từ DB theo MSNV trong claim sub (lean)
    // Lấy VaiTro từ DB để hạ quyền hoặc khóa tài khoản có hiệu lực ngay
    const nhanVien = await NhanVien.findOne({ MSNV: decoded.sub })
      .select('MSNV HoTenNV VaiTro TrangThai BatBuocDoiMatKhau')
      .lean();

    if (!nhanVien) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'Tài khoản nhân viên không tồn tại hoặc đã bị xóa'
      );
    }

    if (nhanVien.TrangThai === 'BiKhoa') {
      throw new ApiError(
        403,
        'ACCOUNT_LOCKED',
        'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên'
      );
    }

    // 4. Gắn req.admin
    req.admin = {
      msnv: nhanVien.MSNV,
      hoTen: nhanVien.HoTenNV,
      role: nhanVien.VaiTro,
      batBuocDoiMatKhau: Boolean(nhanVien.BatBuocDoiMatKhau),
    };

    // 5. Nếu BatBuocDoiMatKhau = true thì chỉ cho phép đi tiếp nếu route có allowPendingPasswordChange
    if (req.admin.batBuocDoiMatKhau && !allowPendingPasswordChange) {
      throw new ApiError(
        403,
        'MUST_CHANGE_PASSWORD',
        'Tài khoản yêu cầu đổi mật khẩu trước khi tiếp tục thao tác'
      );
    }

    next();
  });
};

/**
 * Middleware xác thực admin/nhân viên
 * Sử dụng được cả dạng gọi trực tiếp: router.get('/path', authAdmin, ...)
 * hoặc dạng factory: router.get('/path', authAdmin({ allowPendingPasswordChange: true }), ...)
 */
export const authAdmin = (optionsOrReq, maybeRes, maybeNext) => {
  if (optionsOrReq && optionsOrReq.headers && typeof maybeNext === 'function') {
    return createAuthAdminMiddleware({})(optionsOrReq, maybeRes, maybeNext);
  }
  const options = typeof optionsOrReq === 'object' && optionsOrReq !== null ? optionsOrReq : {};
  return createAuthAdminMiddleware(options);
};

export default authAdmin;
