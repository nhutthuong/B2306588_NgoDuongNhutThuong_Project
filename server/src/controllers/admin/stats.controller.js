import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import {
  getCurrentYearVN,
  parseDateRangeVN,
  getOverviewStats,
  getTopBooks as serviceGetTopBooks,
  getBorrowByMonth as serviceGetBorrowByMonth,
  getOverdueList as serviceGetOverdueList,
  getFinesStats as serviceGetFinesStats,
  getTopReaders as serviceGetTopReaders,
} from '../../services/stats.service.js';

// Regex kiểm tra định dạng ngày: YYYY-MM-DD hoặc ISO 8601 đầy đủ
const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;

// Schema validate query cho GET /overview (không nhận bất kỳ tham số nào)
export const statsOverviewQuerySchema = Joi.object({}).messages({
  'object.unknown': 'Tham số truy vấn không được phép gửi lên',
});

// Schema validate query cho GET /borrow-by-month và GET /fines
export const statsYearQuerySchema = Joi.object({
  year: Joi.number()
    .integer()
    .min(2000)
    .max(getCurrentYearVN() + 1)
    .default(() => getCurrentYearVN())
    .messages({
      'number.base': 'Năm (year) phải là số nguyên',
      'number.integer': 'Năm (year) phải là số nguyên',
      'number.min': 'Năm (year) phải từ năm 2000 trở lên',
      'number.max': `Năm (year) không được vượt quá năm ${getCurrentYearVN() + 1}`,
    }),
});

// Schema validate query cho GET /top-books và GET /top-readers
export const statsDateRangeQuerySchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(10)
    .messages({
      'number.base': 'Số lượng (limit) phải là số nguyên',
      'number.integer': 'Số lượng (limit) phải là số nguyên',
      'number.min': 'Số lượng (limit) phải từ 1 trở lên',
      'number.max': 'Số lượng (limit) không được vượt quá 50',
    }),
  tuNgay: Joi.string()
    .trim()
    .pattern(dateRegex)
    .custom((val, helpers) => {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) {
        return helpers.message('Từ ngày (tuNgay) không phải là ngày hợp lệ');
      }
      return val;
    })
    .optional()
    .messages({
      'string.base': 'Từ ngày (tuNgay) phải là chuỗi ngày hợp lệ',
      'string.pattern.base': 'Từ ngày (tuNgay) phải theo định dạng YYYY-MM-DD hoặc chuẩn ISO',
    }),
  denNgay: Joi.string()
    .trim()
    .pattern(dateRegex)
    .custom((val, helpers) => {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) {
        return helpers.message('Đến ngày (denNgay) không phải là ngày hợp lệ');
      }
      return val;
    })
    .optional()
    .messages({
      'string.base': 'Đến ngày (denNgay) phải là chuỗi ngày hợp lệ',
      'string.pattern.base': 'Đến ngày (denNgay) phải theo định dạng YYYY-MM-DD hoặc chuẩn ISO',
    }),
}).custom((value, helpers) => {
  if (value.tuNgay && value.denNgay) {
    const { startDate, endDate } = parseDateRangeVN(value.tuNgay, value.denNgay);
    if (startDate.getTime() > endDate.getTime()) {
      return helpers.message('Từ ngày (tuNgay) phải nhỏ hơn hoặc bằng đến ngày (denNgay)');
    }
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const diffDays = (endDate.getTime() - startDate.getTime()) / MS_PER_DAY;
    if (diffDays > 5 * 366) {
      return helpers.message('Khoảng thời gian thống kê không được vượt quá 5 năm');
    }
  }
  return value;
});

// Schema validate query cho GET /overdue
export const statsOverdueQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Số trang (page) phải là số nguyên',
      'number.integer': 'Số trang (page) phải là số nguyên',
      'number.min': 'Số trang (page) phải từ 1 trở lên',
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      'number.base': 'Số lượng mỗi trang (limit) phải là số nguyên',
      'number.integer': 'Số lượng mỗi trang (limit) phải là số nguyên',
      'number.min': 'Số lượng mỗi trang (limit) phải từ 1 đến 100',
      'number.max': 'Số lượng mỗi trang (limit) không được vượt quá 100',
    }),
});

/**
 * GET /api/admin/stats/overview
 * Thống kê tổng quan kho sách, độc giả, phiếu mượn, quá hạn và tiền phạt
 */
export const getOverview = asyncHandler(async (req, res) => {
  const data = await getOverviewStats();
  return ok(res, data, 'Lấy số liệu thống kê tổng quan thành công');
});

/**
 * GET /api/admin/stats/top-books
 * Top sách có nhiều lượt mượn nhất
 */
export const getTopBooks = asyncHandler(async (req, res) => {
  const data = await serviceGetTopBooks(req.query);
  return ok(res, data, 'Lấy danh sách sách mượn nhiều nhất thành công');
});

/**
 * GET /api/admin/stats/borrow-by-month
 * Lượt mượn và số đăng ký theo từng tháng trong năm
 */
export const getBorrowByMonth = asyncHandler(async (req, res) => {
  const data = await serviceGetBorrowByMonth(req.query);
  return ok(res, data, 'Lấy thống kê mượn sách theo tháng thành công');
});

/**
 * GET /api/admin/stats/overdue
 * Danh sách phiếu mượn quá hạn kèm thông tin độc giả và phí phạt trễ dự kiến
 */
export const getOverdue = asyncHandler(async (req, res) => {
  const { items, meta } = await serviceGetOverdueList(req.query);
  return ok(res, items, 'Lấy danh sách phiếu mượn quá hạn thành công', meta);
});

/**
 * GET /api/admin/stats/fines
 * Thống kê tiền phạt phát sinh, tiền phạt đã thu, sách rách, sách mất theo tháng
 */
export const getFines = asyncHandler(async (req, res) => {
  const data = await serviceGetFinesStats(req.query);
  return ok(res, data, 'Lấy thống kê tiền phạt thành công');
});

/**
 * GET /api/admin/stats/top-readers
 * Top độc giả mượn sách nhiều nhất
 */
export const getTopReaders = asyncHandler(async (req, res) => {
  const data = await serviceGetTopReaders(req.query);
  return ok(res, data, 'Lấy danh sách độc giả mượn nhiều nhất thành công');
});

export default {
  statsOverviewQuerySchema,
  statsYearQuerySchema,
  statsDateRangeQuerySchema,
  statsOverdueQuerySchema,
  getOverview,
  getTopBooks,
  getBorrowByMonth,
  getOverdue,
  getFines,
  getTopReaders,
};
