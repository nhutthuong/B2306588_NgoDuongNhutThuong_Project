import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import readerService from '../../services/reader.service.js';

/**
 * Helper tính toán và kiểm tra tuổi (từ 5 đến 120 tuổi)
 * Khớp hoàn toàn với quy tắc lúc đăng ký ở user auth
 */
export const validateAge = (value, helpers) => {
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

// Schema validate query lấy danh sách độc giả
export const listReadersQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
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
      'MaDocGia',
      '-MaDocGia',
      'Ten',
      '-Ten',
      'createdAt',
      '-createdAt',
      'LanDangNhapCuoi',
      '-LanDangNhapCuoi'
    )
    .default('-createdAt')
    .messages({
      'any.only':
        'Trường sắp xếp không hợp lệ. Chỉ chấp nhận: MaDocGia, Ten, createdAt, LanDangNhapCuoi (kèm dấu - để giảm dần)',
    }),
});

// Schema validate param maDocGia trong URL (^DG\d{4,}$)
export const readerParamsSchema = Joi.object({
  maDocGia: Joi.string()
    .trim()
    .pattern(/^DG\d{4,}$/)
    .required()
    .messages({
      'any.required': 'Mã độc giả là bắt buộc',
      'string.empty': 'Mã độc giả không được để trống',
      'string.pattern.base': 'Mã độc giả không đúng định dạng (ví dụ: DG0001)',
    }),
});

// Schema validate query chi tiết độc giả (phân trang và lọc lịch sử mượn)
export const readerDetailQuerySchema = Joi.object({
  borrowPage: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Số trang lịch sử mượn (borrowPage) phải là số nguyên',
    'number.min': 'Số trang lịch sử mượn (borrowPage) phải lớn hơn hoặc bằng 1',
  }),
  borrowLimit: Joi.number().integer().min(1).max(50).default(10).messages({
    'number.base': 'Số lượng lịch sử mượn mỗi trang (borrowLimit) phải là số nguyên',
    'number.min': 'Số lượng lịch sử mượn mỗi trang (borrowLimit) phải từ 1 đến 50',
    'number.max': 'Số lượng lịch sử mượn mỗi trang (borrowLimit) không được vượt quá 50',
  }),
  trangThai: Joi.string()
    .valid('ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy')
    .optional()
    .messages({
      'any.only': 'Trạng thái phiếu mượn cần lọc không hợp lệ',
    }),
});

// Schema validate body cập nhật độc giả (PUT /:maDocGia)
// Whitelist cứng: Chỉ cho phép HoLot, Ten, NgaySinh, Phai, DiaChi, DienThoai
export const updateReaderSchema = Joi.object({
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
    'object.min': 'Vui lòng cung cấp ít nhất một trường thông tin cần cập nhật',
  });

// Schema validate body cập nhật trạng thái độc giả (PATCH /:maDocGia/status)
export const updateStatusSchema = Joi.object({
  TrangThai: Joi.string().valid('HoatDong', 'BiKhoa').required().messages({
    'any.required': 'Trạng thái là bắt buộc',
    'any.only': 'Trạng thái phải là HoatDong hoặc BiKhoa',
  }),
  LyDo: Joi.string().trim().max(300).allow('').optional().messages({
    'string.max': 'Lý do không được vượt quá 300 ký tự',
  }),
});

/**
 * GET /api/admin/readers
 * Lấy danh sách độc giả (thuthu + admin)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await readerService.getReaders(req.query);
  return ok(res, items, 'Lấy danh sách độc giả thành công', meta);
});

/**
 * GET /api/admin/readers/:maDocGia
 * Lấy hồ sơ chi tiết độc giả + summary + lịch sử mượn phân trang (thuthu + admin)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const reader = await readerService.getReaderDetail(req.params.maDocGia, req.query);
  return ok(res, reader, 'Lấy chi tiết độc giả thành công');
});

/**
 * PUT /api/admin/readers/:maDocGia
 * Cập nhật thông tin độc giả (thuthu + admin)
 */
export const update = asyncHandler(async (req, res) => {
  const updated = await readerService.updateReader(
    req.params.maDocGia,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, updated, 'Cập nhật thông tin độc giả thành công');
});

/**
 * PATCH /api/admin/readers/:maDocGia/status
 * Khóa hoặc Mở khóa tài khoản độc giả (CHỈ admin)
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const result = await readerService.updateReaderStatus(
    req.params.maDocGia,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, result.reader, result.message);
});

/**
 * DELETE /api/admin/readers/:maDocGia
 * Xóa độc giả chưa từng mượn sách (CHỈ admin)
 */
export const remove = asyncHandler(async (req, res) => {
  const result = await readerService.deleteReader(req.params.maDocGia, req.admin, req.ip);
  return ok(res, {}, result.message);
});

export default {
  listReadersQuerySchema,
  readerParamsSchema,
  readerDetailQuerySchema,
  updateReaderSchema,
  updateStatusSchema,
  list,
  getDetail,
  update,
  updateStatus,
  remove,
};
