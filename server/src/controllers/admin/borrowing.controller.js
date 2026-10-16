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
  adminReturnBorrowing,
  adminPayFine,
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

// Schema validate body nhận trả sách (PATCH /api/admin/borrowings/:id/return)
export const returnBorrowingBodySchema = Joi.object({
  TinhTrangTra: Joi.string()
    .valid('BinhThuong', 'Rach', 'Mat')
    .required()
    .messages({
      'any.required': 'Tình trạng trả sách là bắt buộc',
      'any.only': 'Tình trạng trả sách phải là BinhThuong, Rach hoặc Mat',
    }),
  MucRach: Joi.string()
    .valid('Nhe', 'Nang')
    .when('TinhTrangTra', {
      is: 'Rach',
      then: Joi.required().messages({
        'any.required': 'Mức độ rách là bắt buộc khi sách bị rách',
        'any.only': 'Mức độ rách phải là Nhe hoặc Nang',
      }),
      otherwise: Joi.forbidden().messages({
        'any.unknown': 'Mức độ rách chỉ áp dụng khi tình trạng trả là Rach',
      }),
    }),
  LoaiBoKhoiKho: Joi.boolean().when('TinhTrangTra', {
    is: 'Rach',
    then: Joi.boolean().default(false),
    otherwise: Joi.forbidden().messages({
      'any.unknown': 'Chỉ được chỉ định loại bỏ khỏi kho khi tình trạng trả là Rach',
    }),
  }),
  GhiChuPhat: Joi.string()
    .trim()
    .max(500)
    .when('TinhTrangTra', {
      is: Joi.valid('Rach', 'Mat'),
      then: Joi.string().trim().min(1).max(500).required().messages({
        'any.required': 'Ghi chú phạt là bắt buộc khi sách bị rách hoặc mất',
        'string.empty': 'Ghi chú phạt không được để trống khi sách bị rách hoặc mất',
        'string.max': 'Ghi chú phạt không được vượt quá 500 ký tự',
      }),
      otherwise: Joi.string().trim().max(500).allow('').optional().default(''),
    }),
});

// Schema validate body thanh toán tiền phạt (PATCH /api/admin/borrowings/:id/pay-fine)
export const payFineBodySchema = Joi.object({}).unknown(false);

// Schema validate body hủy phiếu mượn bởi nhân viên (PATCH /api/admin/borrowings/:id/cancel)
export const cancelBorrowingBodySchema = Joi.object({
  LyDo: Joi.string().trim().max(300).allow('').optional().messages({
    'string.max': 'Lý do hủy không được vượt quá 300 ký tự',
  }),
}).unknown(false);

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
 * PATCH /api/admin/borrowings/:id/return
 * Nhận trả sách từ độc giả (DangMuon -> DaTra), tự động tính phạt và cập nhật kho
 */
export const returnBook = asyncHandler(async (req, res) => {
  const result = await adminReturnBorrowing(req.params.id, req.admin.msnv, req.body, {
    ip: req.ip,
  });
  return ok(res, result, 'Nhận trả sách thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/pay-fine
 * Thu tiền phạt từ độc giả (ChuaThanhToan -> DaThanhToan)
 */
export const payFine = asyncHandler(async (req, res) => {
  const result = await adminPayFine(req.params.id, req.admin.msnv, {
    ip: req.ip,
  });
  return ok(res, result, 'Thu tiền phạt thành công');
});

/**
 * PATCH /api/admin/borrowings/:id/cancel
 * Hủy phiếu mượn thay độc giả (khi ChoDuyet hoặc DaDuyet) kèm lý do tùy chọn
 */
export const cancel = asyncHandler(async (req, res) => {
  const { LyDo } = req.body || {};
  const canceled = await adminCancelBorrowing(req.params.id, req.admin.msnv, LyDo, {
    ip: req.ip,
  });
  return ok(res, canceled, 'Hủy phiếu mượn thành công');
});

export default {
  adminListBorrowingsQuerySchema,
  borrowingIdParamSchema,
  rejectBorrowingBodySchema,
  returnBorrowingBodySchema,
  payFineBodySchema,
  cancelBorrowingBodySchema,
  list,
  getDetail,
  approve,
  reject,
  handover,
  returnBook,
  payFine,
  cancel,
};
