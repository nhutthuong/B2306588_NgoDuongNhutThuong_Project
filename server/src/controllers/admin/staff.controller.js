import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import staffService from '../../services/staff.service.js';

// Schema validate query danh sách nhân viên
export const listStaffQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
  vaiTro: Joi.string()
    .valid('admin', 'thuthu')
    .optional()
    .messages({
      'any.only': 'Vai trò phải là admin hoặc thuthu',
    }),
  trangThai: Joi.string()
    .valid('HoatDong', 'BiKhoa')
    .optional()
    .messages({
      'any.only': 'Trạng thái phải là HoatDong hoặc BiKhoa',
    }),
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Số trang (page) phải là số nguyên',
    'number.min': 'Số trang (page) phải lớn hơn hoặc bằng 1',
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.base': 'Số lượng mỗi trang (limit) phải là số nguyên',
    'number.min': 'Số lượng mỗi trang (limit) phải từ 1 đến 100',
    'number.max': 'Số lượng mỗi trang (limit) không được vượt quá 100',
  }),
  sort: Joi.string()
    .valid(
      'MSNV',
      '-MSNV',
      'HoTenNV',
      '-HoTenNV',
      'createdAt',
      '-createdAt',
      'ChucVu',
      '-ChucVu',
      'VaiTro',
      '-VaiTro'
    )
    .default('-createdAt')
    .messages({
      'any.only':
        'Trường sắp xếp không hợp lệ. Chỉ chấp nhận: MSNV, HoTenNV, createdAt, ChucVu, VaiTro (kèm dấu - để giảm dần)',
    }),
});

// Schema validate param msnv trong đường dẫn (^NV\d{3,}$)
export const staffParamsSchema = Joi.object({
  msnv: Joi.string()
    .trim()
    .pattern(/^NV\d{3,}$/)
    .required()
    .messages({
      'any.required': 'Mã nhân viên là bắt buộc',
      'string.empty': 'Mã nhân viên không được để trống',
      'string.pattern.base': 'Mã nhân viên không đúng định dạng (ví dụ: NV001)',
    }),
});

// Schema validate body tạo mới nhân viên
export const createStaffSchema = Joi.object({
  HoTenNV: Joi.string().trim().max(80).required().messages({
    'any.required': 'Họ tên nhân viên là bắt buộc',
    'string.empty': 'Họ tên nhân viên không được để trống',
    'string.max': 'Họ tên nhân viên không được vượt quá 80 ký tự',
  }),
  ChucVu: Joi.string().trim().max(50).allow('').optional().messages({
    'string.max': 'Chức vụ không được vượt quá 50 ký tự',
  }),
  VaiTro: Joi.string().valid('admin', 'thuthu').required().messages({
    'any.required': 'Vai trò là bắt buộc',
    'any.only': 'Vai trò phải là admin hoặc thuthu',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').optional().messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
  }),
  SoDienThoai: Joi.string()
    .trim()
    .pattern(/^(0|\+84)\d{9}$/)
    .allow('')
    .optional()
    .messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
    }),
  Password: Joi.string().required().messages({
    'any.required': 'Mật khẩu tạm là bắt buộc',
    'string.empty': 'Mật khẩu tạm không được để trống',
  }),
});

// Schema validate body cập nhật thông tin nhân viên
export const updateStaffSchema = Joi.object({
  HoTenNV: Joi.string().trim().max(80).messages({
    'string.empty': 'Họ tên nhân viên không được để trống',
    'string.max': 'Họ tên nhân viên không được vượt quá 80 ký tự',
  }),
  ChucVu: Joi.string().trim().max(50).allow('').messages({
    'string.max': 'Chức vụ không được vượt quá 50 ký tự',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
  }),
  SoDienThoai: Joi.string()
    .trim()
    .pattern(/^(0|\+84)\d{9}$/)
    .allow('')
    .messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
    }),
})
  .min(1)
  .messages({
    'object.min': 'Vui lòng cung cấp ít nhất một trường thông tin cần cập nhật',
  });

// Schema validate body đổi vai trò
export const changeRoleSchema = Joi.object({
  VaiTro: Joi.string().valid('admin', 'thuthu').required().messages({
    'any.required': 'Vai trò mới là bắt buộc',
    'any.only': 'Vai trò phải là admin hoặc thuthu',
  }),
});

// Schema validate body cập nhật trạng thái (khóa / mở khóa)
export const updateStatusSchema = Joi.object({
  TrangThai: Joi.string().valid('HoatDong', 'BiKhoa').required().messages({
    'any.required': 'Trạng thái là bắt buộc',
    'any.only': 'Trạng thái phải là HoatDong hoặc BiKhoa',
  }),
  LyDo: Joi.string().trim().max(300).allow('').optional().messages({
    'string.max': 'Lý do không được vượt quá 300 ký tự',
  }),
});

// Schema validate body đặt lại mật khẩu tạm
export const resetPasswordSchema = Joi.object({
  Password: Joi.string().required().messages({
    'any.required': 'Mật khẩu tạm mới là bắt buộc',
    'string.empty': 'Mật khẩu tạm mới không được để trống',
  }),
});

/**
 * GET /api/admin/staff
 * Lấy danh sách nhân viên (CHỈ admin)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await staffService.getStaffList(req.query);
  return ok(res, items, 'Lấy danh sách nhân viên thành công', meta);
});

/**
 * POST /api/admin/staff
 * Tạo mới nhân viên (CHỈ admin)
 */
export const create = asyncHandler(async (req, res) => {
  const newStaff = await staffService.createStaff(req.body, req.admin, req.ip);
  return created(res, newStaff, 'Tạo nhân viên thành công');
});

/**
 * GET /api/admin/staff/:msnv
 * Lấy chi tiết nhân viên (CHỈ admin)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const staff = await staffService.getStaffDetail(req.params.msnv);
  return ok(res, staff, 'Lấy thông tin nhân viên thành công');
});

/**
 * PUT /api/admin/staff/:msnv
 * Cập nhật thông tin nhân viên (CHỈ admin)
 */
export const update = asyncHandler(async (req, res) => {
  const updated = await staffService.updateStaff(
    req.params.msnv,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, updated, 'Cập nhật thông tin nhân viên thành công');
});

/**
 * PATCH /api/admin/staff/:msnv/role
 * Đổi vai trò nhân viên (CHỈ admin)
 */
export const changeRole = asyncHandler(async (req, res) => {
  const updated = await staffService.changeStaffRole(
    req.params.msnv,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, updated, 'Thay đổi vai trò nhân viên thành công');
});

/**
 * PATCH /api/admin/staff/:msnv/status
 * Khóa hoặc Mở khóa nhân viên (CHỈ admin)
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const result = await staffService.updateStaffStatus(
    req.params.msnv,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, result.staff, result.message);
});

/**
 * PATCH /api/admin/staff/:msnv/reset-password
 * Đặt lại mật khẩu tạm cho nhân viên (CHỈ admin)
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const result = await staffService.resetStaffPassword(
    req.params.msnv,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, {}, result.message);
});

/**
 * DELETE /api/admin/staff/:msnv
 * Xóa nhân viên (CHỈ admin)
 */
export const remove = asyncHandler(async (req, res) => {
  const result = await staffService.deleteStaff(req.params.msnv, req.admin, req.ip);
  return ok(res, {}, result.message);
});

export default {
  listStaffQuerySchema,
  staffParamsSchema,
  createStaffSchema,
  updateStaffSchema,
  changeRoleSchema,
  updateStatusSchema,
  resetPasswordSchema,
  list,
  create,
  getDetail,
  update,
  changeRole,
  updateStatus,
  resetPassword,
  remove,
};
