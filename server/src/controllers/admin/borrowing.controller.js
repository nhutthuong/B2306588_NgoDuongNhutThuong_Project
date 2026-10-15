import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import {
  adminListBorrowings,
  adminGetBorrowingDetail,
  adminApproveBorrowing,
  adminRejectBorrowing,
  adminHandoverBorrowing,
  adminCancelBorrowing,
} from '../../services/borrowing.service.js';

// Schema validate query lấy danh sách phiếu mượn ở admin (GET /api/admin/borrowings)
export const adminListBorrowingsQuerySchema = Joi.object({
  trangThai: Joi.string()
    .valid('ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy')
    .optional()
    .messages({
      'any.only': 'Trạng thái mượn sách không hợp lệ',
    }),
  maDocGia: Joi.string().trim().max(50).optional().allow(''),
  maSach: Joi.string().trim().max(50).optional().allow(''),
  quaHan: Joi.boolean().optional(),
  tuNgay: Joi.date().iso().optional().messages({
    'date.format': 'Từ ngày (tuNgay) phải theo chuẩn ISO (YYYY-MM-DD)',
  }),
  denNgay: Joi.date().iso().optional().messages({
    'date.format': 'Đến ngày (denNgay) phải theo chuẩn ISO (YYYY-MM-DD)',
  }),
  trangThaiPhat: Joi.string()
    .valid('KhongPhat', 'ChuaThanhToan', 'DaThanhToan')
    .optional()
    .messages({
      'any.only': 'Trạng thái phạt không hợp lệ',
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

// Schema validate param :id phiếu mượn
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

// Schema validate body từ chối phiếu mượn (PATCH /api/admin/borrowings/:id/reject)
export const rejectBorrowingBodySchema = Joi.object({
  LyDoTuChoi: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required()
    .messages({
      'any.required': 'Lý do từ chối là bắt buộc',
      'string.empty': 'Lý do từ chối không được để trống',
      'string.max': 'Lý do từ chối không được vượt quá 500 ký tự',
    }),
});

/**
 * GET /api/admin/borrowings
 * Lấy danh sách phiếu mượn toàn hệ thống kèm lọc đa tiêu chí
 */
export const list = asyncHandler(async (req, res) => {
  const result = await adminListBorrowings(req.query);
  return ok(res, result.data, 'Lấy danh sách phiếu mượn thành công', result.meta);
});

/**
 * GET /api/admin/borrowings/:id
 * Lấy chi tiết một phiếu mượn (kèm DocGia, Sach, NhanVien)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const phieu = await adminGetBorrowingDetail(req.params.id);
  return ok(res, phieu, 'Lấy chi tiết phiếu mượn thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/approve
 * Duyệt phiếu mượn sách (ChoDuyet -> DaDuyet), trừ 1 quyển trong kho nguyên tử
 */
export const approve = asyncHandler(async (req, res) => {
  const approved = await adminApproveBorrowing(req.params.id, req.admin.msnv, {
    ip: req.ip,
  });
  return ok(res, approved, 'Duyệt phiếu mượn thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/reject
 * Từ chối phiếu mượn sách (ChoDuyet -> TuChoi)
 */
export const reject = asyncHandler(async (req, res) => {
  const { LyDoTuChoi } = req.body;
  const rejected = await adminRejectBorrowing(req.params.id, req.admin.msnv, LyDoTuChoi, {
    ip: req.ip,
  });
  return ok(res, rejected, 'Từ chối phiếu mượn thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/handover
 * Giao sách thực tế cho độc giả (DaDuyet -> DangMuon), set NgayMuon và HanTra
 */
export const handover = asyncHandler(async (req, res) => {
  const handovered = await adminHandoverBorrowing(req.params.id, req.admin.msnv, {
    ip: req.ip,
  });
  return ok(res, handovered, 'Giao sách cho độc giả thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/cancel
 * Hủy phiếu mượn thay độc giả (khi ChoDuyet hoặc DaDuyet)
 */
export const cancel = asyncHandler(async (req, res) => {
  const canceled = await adminCancelBorrowing(req.params.id, req.admin.msnv, {
    ip: req.ip,
  });
  return ok(res, canceled, 'Hủy phiếu mượn thành công');
});

export default {
  adminListBorrowingsQuerySchema,
  borrowingIdParamSchema,
  rejectBorrowingBodySchema,
  list,
  getDetail,
  approve,
  reject,
  handover,
  cancel,
};
