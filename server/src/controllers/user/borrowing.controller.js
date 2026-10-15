import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import {
  registerBorrow,
  getBorrowSummary,
  getMyBorrowings,
  getBorrowingDetail,
  cancelBorrowing,
} from '../../services/borrowing.service.js';
import { getSettings } from '../../services/settings.service.js';

// Schema validate body đăng ký mượn sách (POST /api/user/borrowings)
export const createBorrowingSchema = Joi.object({
  MaSach: Joi.string()
    .trim()
    .pattern(/^S\d{4,}$/)
    .required()
    .messages({
      'any.required': 'Mã sách là bắt buộc',
      'string.empty': 'Mã sách không được để trống',
      'string.pattern.base': 'Mã sách không đúng định dạng (vd: S0001)',
    }),
});

// Schema validate query lấy danh sách phiếu mượn (GET /api/user/borrowings)
export const listBorrowingsQuerySchema = Joi.object({
  trangThai: Joi.string()
    .valid('ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy')
    .optional()
    .messages({
      'any.only': 'Trạng thái mượn sách không hợp lệ',
    }),
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Số trang (page) phải là số nguyên',
    'number.min': 'Số trang (page) phải từ 1 trở lên',
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.base': 'Số lượng mỗi trang (limit) phải là số nguyên',
    'number.min': 'Số lượng mỗi trang (limit) phải từ 1 đến 100',
    'number.max': 'Số lượng mỗi trang (limit) không được vượt quá 100',
  }),
});

// Schema validate param :id của phiếu mượn
export const borrowingIdParamSchema = Joi.object({
  id: Joi.string()
    .hex()
    .length(24)
    .required()
    .messages({
      'any.required': 'Mã định danh phiếu mượn là bắt buộc',
      'string.hex': 'Mã định danh phiếu mượn không hợp lệ',
      'string.length': 'Mã định danh phiếu mượn không hợp lệ',
    }),
});

/**
 * POST /api/user/borrowings
 * Đăng ký mượn 1 cuốn sách mới
 */
export const createBorrowing = asyncHandler(async (req, res) => {
  const { MaSach } = req.body;
  const phieu = await registerBorrow(req.user.maDocGia, MaSach, { ip: req.ip });
  return created(res, phieu, 'Đăng ký mượn sách thành công');
});

/**
 * GET /api/user/borrowings
 * Lấy lịch sử mượn sách của chính độc giả
 */
export const listMyBorrowings = asyncHandler(async (req, res) => {
  const result = await getMyBorrowings(req.user.maDocGia, req.query);
  return ok(res, result.data, 'Lấy danh sách phiếu mượn thành công', result.meta);
});

/**
 * GET /api/user/borrowings/summary
 * Lấy thống kê tóm tắt giới hạn mượn của độc giả
 */
export const getBorrowingSummary = asyncHandler(async (req, res) => {
  const summary = await getBorrowSummary(req.user.maDocGia);
  return ok(res, summary, 'Lấy thông tin tóm tắt mượn sách thành công');
});

/**
 * GET /api/user/borrowings/:id
 * Lấy chi tiết một phiếu mượn của chính độc giả
 */
export const getBorrowingById = asyncHandler(async (req, res) => {
  const phieu = await getBorrowingDetail(req.user.maDocGia, req.params.id);
  return ok(res, phieu, 'Lấy chi tiết phiếu mượn thành công');
});

/**
 * PATCH /api/user/borrowings/:id/cancel
 * Độc giả hủy phiếu mượn đang ở trạng thái ChoDuyet hoặc DaDuyet
 */
export const cancelMyBorrowing = asyncHandler(async (req, res) => {
  const canceledPhieu = await cancelBorrowing(req.user.maDocGia, req.params.id, { ip: req.ip });
  return ok(res, canceledPhieu, 'Hủy phiếu mượn thành công');
});

/**
 * GET /api/user/policy
 * Lấy quy định mượn sách và biểu phí phạt công khai
 */
export const getBorrowingPolicy = asyncHandler(async (req, res) => {
  const policy = await getSettings();
  return ok(res, policy, 'Lấy quy định mượn sách thành công');
});

export default {
  createBorrowingSchema,
  listBorrowingsQuerySchema,
  borrowingIdParamSchema,
  createBorrowing,
  listMyBorrowings,
  getBorrowingSummary,
  getBorrowingById,
  cancelMyBorrowing,
  getBorrowingPolicy,
};
