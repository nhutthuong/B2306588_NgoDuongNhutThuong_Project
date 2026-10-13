import Joi from 'joi';
import DocGia from '../../models/DocGia.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
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
import { nextCode } from '../../services/code.service.js';
import { logAction } from '../../services/audit.service.js';

// Helper tính toán và kiểm tra tuổi (từ 5 đến 120 tuổi)
const validateAge = (value, helpers) => {
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) {
    return helpers.message('Ngày sinh không đúng định dạng');
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 5) {
    return helpers.message('Độc giả phải có độ tuổi từ 5 tuổi trở lên');
  }
  if (age > 120) {
    return helpers.message('Ngày sinh không hợp lệ (độ tuổi tối đa là 120 tuổi)');
  }

  return value;
};

// Schema validate body đăng ký độc giả
export const registerSchema = Joi.object({
  HoLot: Joi.string().trim().max(50).required().messages({
    'any.required': 'Họ lót là bắt buộc',
    'string.empty': 'Họ lót không được để trống',
    'string.max': 'Họ lót không được vượt quá 50 ký tự',
  }),
  Ten: Joi.string().trim().max(30).required().messages({
    'any.required': 'Tên là bắt buộc',
    'string.empty': 'Tên không được để trống',
    'string.max': 'Tên không được vượt quá 30 ký tự',
  }),
  NgaySinh: Joi.date().iso().custom(validateAge).required().messages({
    'any.required': 'Ngày sinh là bắt buộc',
    'date.base': 'Ngày sinh không đúng định dạng ngày tháng',
    'date.format': 'Ngày sinh phải theo định dạng ngày (YYYY-MM-DD)',
  }),
  Phai: Joi.string().valid('Nam', 'Nu', 'Khac').required().messages({
    'any.required': 'Phái là bắt buộc',
    'any.only': 'Phái phải là Nam, Nu hoặc Khac',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').optional().messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
  }),
  DienThoai: Joi.string()
    .trim()
    .pattern(/^(0|\+84)\d{9}$/)
    .required()
    .messages({
      'any.required': 'Số điện thoại là bắt buộc',
      'string.empty': 'Số điện thoại không được để trống',
      'string.pattern.base': 'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
    }),
  Email: Joi.string()
    .trim()
    .email()
    .lowercase()
    .required()
    .messages({
      'any.required': 'Email là bắt buộc',
      'string.empty': 'Email không được để trống',
      'string.email': 'Email không đúng định dạng',
    }),
  Password: Joi.string().required().messages({
    'any.required': 'Mật khẩu là bắt buộc',
    'string.empty': 'Mật khẩu không được để trống',
  }),
});

// Schema validate body đăng nhập
export const loginSchema = Joi.object({
  Email: Joi.string().trim().email().lowercase().required().messages({
    'any.required': 'Email là bắt buộc',
    'string.empty': 'Email không được để trống',
    'string.email': 'Email không đúng định dạng',
  }),
  Password: Joi.string().required().messages({
    'any.required': 'Mật khẩu là bắt buộc',
    'string.empty': 'Mật khẩu không được để trống',
  }),
});

// Schema validate body cập nhật hồ sơ cá nhân (PATCH /me)
export const updateMeSchema = Joi.object({
  HoLot: Joi.string().trim().max(50).messages({
    'string.empty': 'Họ lót không được để trống',
    'string.max': 'Họ lót không được vượt quá 50 ký tự',
  }),
  Ten: Joi.string().trim().max(30).messages({
    'string.empty': 'Tên không được để trống',
    'string.max': 'Tên không được vượt quá 30 ký tự',
  }),
  NgaySinh: Joi.date().iso().custom(validateAge).messages({
    'date.base': 'Ngày sinh không đúng định dạng ngày tháng',
    'date.format': 'Ngày sinh phải theo định dạng ngày (YYYY-MM-DD)',
  }),
  Phai: Joi.string().valid('Nam', 'Nu', 'Khac').messages({
    'any.only': 'Phái phải là Nam, Nu hoặc Khac',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
  }),
  DienThoai: Joi.string()
    .trim()
    .pattern(/^(0|\+84)\d{9}$/)
    .messages({
      'string.empty': 'Số điện thoại không được để trống',
      'string.pattern.base': 'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
    }),
})
  .min(1)
  .messages({
    'object.min': 'Vui lòng cung cấp ít nhất một thông tin cần cập nhật',
  });

// Schema validate body đổi mật khẩu
export const changePasswordSchema = Joi.object({
  MatKhauCu: Joi.string().required().messages({
    'any.required': 'Mật khẩu hiện tại là bắt buộc',
    'string.empty': 'Mật khẩu hiện tại không được để trống',
  }),
  MatKhauMoi: Joi.string().required().messages({
    'any.required': 'Mật khẩu mới là bắt buộc',
    'string.empty': 'Mật khẩu mới không được để trống',
  }),
});

/**
 * POST /api/user/auth/register
 * Đăng ký tài khoản độc giả mới
 */
export const register = asyncHandler(async (req, res) => {
  const { HoLot, Ten, NgaySinh, Phai, DiaChi = '', DienThoai, Email, Password } = req.body;
  const normalizedEmail = Email.toLowerCase().trim();

  // Kiểm tra độ mạnh mật khẩu và không cho mật khẩu chứa email
  validatePasswordStrength(Password);
  if (Password.toLowerCase().includes(normalizedEmail)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu không được chứa địa chỉ email');
  }

  // Kiểm tra email đã đăng ký chưa
  const existingDocGia = await DocGia.findOne({ Email: normalizedEmail });
  if (existingDocGia) {
    throw new ApiError(409, 'DUPLICATE', 'Email đã được đăng ký trong hệ thống');
  }

  // Sinh mã độc giả tự động và băm mật khẩu
  const maDocGia = await nextCode('DocGia');
  const hashedPassword = await hashPassword(Password);

  let newDocGia;
  try {
    newDocGia = await DocGia.create({
      MaDocGia: maDocGia,
      HoLot: HoLot.trim(),
      Ten: Ten.trim(),
      NgaySinh,
      Phai,
      DiaChi: DiaChi ? DiaChi.trim() : '',
      DienThoai: DienThoai.trim(),
      Email: normalizedEmail,
      Password: hashedPassword,
      TrangThai: 'HoatDong',
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'DUPLICATE', 'Email đã được đăng ký trong hệ thống');
    }
    throw err;
  }

  // Ghi nhật ký đăng ký độc giả mới
  await logAction({
    hanhDong: 'DANG_KY_DOC_GIA',
    doiTuong: 'DocGia',
    maDoiTuong: newDocGia.MaDocGia,
    chiTiet: {
      email: newDocGia.Email,
      hoTen: `${newDocGia.HoLot} ${newDocGia.Ten}`.trim(),
    },
    ip: req.ip,
  });

  // Trả về 201 Created kèm thông tin cơ bản (không tự động đăng nhập)
  return created(
    res,
    {
      MaDocGia: newDocGia.MaDocGia,
      HoLot: newDocGia.HoLot,
      Ten: newDocGia.Ten,
      Email: newDocGia.Email,
    },
    'Đăng ký tài khoản thành công, vui lòng đăng nhập để tiếp tục'
  );
});

/**
 * POST /api/user/auth/login
 * Đăng nhập độc giả
 */
export const login = asyncHandler(async (req, res) => {
  const { Email, Password } = req.body;
  const normalizedEmail = Email.toLowerCase().trim();

  // Xác thực đăng nhập qua authenticate service (loại 'docgia')
  const user = await authenticate('docgia', normalizedEmail, Password);

  // Ký Access Token và tạo Refresh Token
  const accessToken = signAccessToken(user, 'docgia');
  const rawRefreshToken = await issueRefreshToken(user.MaDocGia, 'docgia', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Thiết lập cookie httpOnly rt_user
  setRefreshCookie(res, 'docgia', rawRefreshToken);

  return ok(
    res,
    {
      accessToken,
      user: {
        MaDocGia: user.MaDocGia,
        HoLot: user.HoLot,
        Ten: user.Ten,
        Email: user.Email,
      },
    },
    'Đăng nhập thành công'
  );
});

/**
 * POST /api/user/auth/refresh
 * Làm mới phiên đăng nhập độc giả
 */
export const refresh = asyncHandler(async (req, res) => {
  const rawToken = getRefreshCookie(req, 'docgia');

  if (!rawToken) {
    clearRefreshCookie(res, 'docgia');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Không tìm thấy phiên làm việc để làm mới');
  }

  let rotated;
  try {
    rotated = await rotateRefreshToken(rawToken, 'docgia', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  } catch (err) {
    clearRefreshCookie(res, 'docgia');
    throw err;
  }

  // Nạp lại thông tin độc giả từ DB để kiểm tra trạng thái hoạt động
  const user = await DocGia.findOne({ MaDocGia: rotated.ownerId })
    .select('MaDocGia HoLot Ten Email TrangThai')
    .lean();

  if (!user) {
    await revokeAllForOwner(rotated.ownerId, 'docgia');
    clearRefreshCookie(res, 'docgia');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Tài khoản độc giả không còn tồn tại');
  }

  if (user.TrangThai === 'BiKhoa') {
    await revokeAllForOwner(rotated.ownerId, 'docgia');
    clearRefreshCookie(res, 'docgia');
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản độc giả đã bị khóa. Vui lòng liên hệ thủ thư'
    );
  }

  // Cấp Access Token mới và set cookie Refresh Token mới
  const accessToken = signAccessToken(user, 'docgia');
  setRefreshCookie(res, 'docgia', rotated.newRawToken);

  return ok(res, { accessToken }, 'Làm mới phiên đăng nhập thành công');
});

/**
 * POST /api/user/auth/logout
 * Đăng xuất độc giả: thu hồi token, xóa cookie
 */
export const logout = asyncHandler(async (req, res) => {
  const rawToken = getRefreshCookie(req, 'docgia');

  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  clearRefreshCookie(res, 'docgia');

  return ok(res, {}, 'Đăng xuất thành công');
});

/**
 * GET /api/user/auth/me
 * Lấy hồ sơ đầy đủ của chính độc giả
 */
export const getMe = asyncHandler(async (req, res) => {
  const docGia = await DocGia.findOne({ MaDocGia: req.user.maDocGia })
    .select('MaDocGia HoLot Ten NgaySinh Phai DiaChi DienThoai Email TrangThai createdAt updatedAt LanDangNhapCuoi')
    .lean();

  if (!docGia) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thông tin tài khoản độc giả');
  }

  return ok(res, { user: docGia }, 'Lấy thông tin tài khoản thành công');
});

/**
 * PATCH /api/user/auth/me
 * Cập nhật hồ sơ độc giả: chỉ cho phép sửa các trường whitelisted
 */
export const updateMe = asyncHandler(async (req, res) => {
  const allowedFields = ['HoLot', 'Ten', 'NgaySinh', 'Phai', 'DiaChi', 'DienThoai'];
  const updateData = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updateData[field] =
        typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
  }

  const updatedDocGia = await DocGia.findOneAndUpdate(
    { MaDocGia: req.user.maDocGia },
    { $set: updateData },
    { new: true, runValidators: true }
  )
    .select('MaDocGia HoLot Ten NgaySinh Phai DiaChi DienThoai Email TrangThai createdAt updatedAt LanDangNhapCuoi')
    .lean();

  if (!updatedDocGia) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thông tin tài khoản độc giả');
  }

  // Ghi nhật ký cập nhật hồ sơ
  await logAction({
    hanhDong: 'CAP_NHAT_HO_SO',
    doiTuong: 'DocGia',
    maDoiTuong: req.user.maDocGia,
    chiTiet: {
      cacTruongThayDoi: Object.keys(updateData),
    },
    ip: req.ip,
  });

  return ok(res, { user: updatedDocGia }, 'Cập nhật thông tin thành công');
});

/**
 * PATCH /api/user/auth/change-password
 * Đổi mật khẩu độc giả
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { MatKhauCu, MatKhauMoi } = req.body;

  const account = await DocGia.findOne({ MaDocGia: req.user.maDocGia }).select('+Password');
  if (!account) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản độc giả');
  }

  if (account.TrangThai === 'BiKhoa') {
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản độc giả đã bị khóa. Vui lòng liên hệ thủ thư'
    );
  }

  // 1. Kiểm tra mật khẩu cũ (không cộng vào bộ đếm khóa vì đang trong phiên xác thực)
  const isMatch = await verifyPassword(MatKhauCu, account.Password);
  if (!isMatch) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Mật khẩu hiện tại không chính xác');
  }

  // 2. Kiểm tra độ mạnh mật khẩu mới
  validatePasswordStrength(MatKhauMoi);

  // 3. Mật khẩu mới phải khác mật khẩu cũ
  if (MatKhauCu === MatKhauMoi) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu cũ');
  }

  const isSameAsOldHash = await verifyPassword(MatKhauMoi, account.Password);
  if (isSameAsOldHash) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới không được trùng với mật khẩu cũ');
  }

  if (MatKhauMoi.toLowerCase().includes(account.Email.toLowerCase())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới không được chứa địa chỉ email');
  }

  if (MatKhauMoi.toLowerCase().includes(account.MaDocGia.toLowerCase())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu mới không được chứa mã độc giả');
  }

  // 4. Băm mật khẩu mới và lưu DB
  account.Password = await hashPassword(MatKhauMoi);
  account.SoLanSaiMatKhau = 0;
  account.KhoaDen = null;
  await account.save();

  // 5. Thu hồi toàn bộ refresh token cũ của độc giả
  await revokeAllForOwner(account.MaDocGia, 'docgia');

  // 6. Cấp phiên mới (access token + cookie mới)
  const accessToken = signAccessToken(account, 'docgia');
  const rawRefreshToken = await issueRefreshToken(account.MaDocGia, 'docgia', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  setRefreshCookie(res, 'docgia', rawRefreshToken);

  // 7. Ghi nhật ký đổi mật khẩu
  await logAction({
    hanhDong: 'DOI_MAT_KHAU',
    doiTuong: 'DocGia',
    maDoiTuong: account.MaDocGia,
    chiTiet: {
      moTa: 'Độc giả tự đổi mật khẩu thành công',
    },
    ip: req.ip,
  });

  return ok(
    res,
    {
      accessToken,
      user: {
        MaDocGia: account.MaDocGia,
        HoLot: account.HoLot,
        Ten: account.Ten,
        Email: account.Email,
      },
    },
    'Đổi mật khẩu thành công'
  );
});

export default {
  registerSchema,
  loginSchema,
  updateMeSchema,
  changePasswordSchema,
  register,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
  changePassword,
};
