import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import {
  getAuditLogs as fetchAuditLogs,
  getAuditMetadata as fetchAuditMetadata,
} from '../../services/audit.service.js';

/**
 * Schema kiểm thực tham số truy vấn danh sách nhật ký
 */
export const listAuditQuerySchema = Joi.object({
  search: Joi.string().trim().max(100).optional().allow('').messages({
    'string.max': 'Từ khóa tìm kiếm không được vượt quá 100 ký tự',
  }),
  msnv: Joi.string().trim().max(50).optional().allow(''),
  hanhDong: Joi.string().trim().max(50).optional().allow(''),
  doiTuong: Joi.string().trim().max(50).optional().allow(''),
  tuNgay: Joi.date().iso().optional().messages({
    'date.format': 'Thời gian bắt đầu (tuNgay) phải theo chuẩn ISO (YYYY-MM-DD hoặc ISO-8601)',
  }),
  denNgay: Joi.date().iso().optional().messages({
    'date.format': 'Thời gian kết thúc (denNgay) phải theo chuẩn ISO (YYYY-MM-DD hoặc ISO-8601)',
  }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .valid('createdAt', '-createdAt', 'HanhDong', '-HanhDong', 'MSNV', '-MSNV')
    .default('-createdAt'),
}).unknown(false);

/**
 * GET /api/admin/audit-logs
 * Xem danh sách nhật ký kiểm toán hệ thống (CHỈ Admin)
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const result = await fetchAuditLogs(req.query);
  return ok(res, result.data, 'Lấy danh sách nhật ký hệ thống thành công', result.meta);
});

/**
 * GET /api/admin/audit-logs/metadata
 * Lấy danh sách các hành động và đối tượng để làm bộ lọc (CHỈ Admin)
 */
export const getAuditMetadata = asyncHandler(async (req, res) => {
  const metadata = await fetchAuditMetadata();
  return ok(res, metadata, 'Lấy thông tin bộ lọc nhật ký thành công');
});

export default {
  getAuditLogs,
  getAuditMetadata,
};
