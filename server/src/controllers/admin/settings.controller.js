import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import {
  getSettings as fetchSettings,
  updateSettings as modifySettings,
  resetSettings as restoreSettings,
} from '../../services/settings.service.js';

/**
 * Schema kiểm thực cập nhật cấu hình hệ thống (CHỈ Admin)
 */
export const updateSettingsSchema = Joi.object({
  SoSachToiDa: Joi.number().integer().min(1).max(100).required().messages({
    'number.base': 'Số sách mượn tối đa phải là số',
    'number.integer': 'Số sách mượn tối đa phải là số nguyên',
    'number.min': 'Số sách mượn tối đa phải từ 1 quyển trở lên',
    'number.max': 'Số sách mượn tối đa không được vượt quá 100 quyển',
    'any.required': 'Số sách mượn tối đa là bắt buộc',
  }),
  SoNgayMuon: Joi.number().integer().min(1).max(365).required().messages({
    'number.base': 'Số ngày mượn phải là số',
    'number.integer': 'Số ngày mượn phải là số nguyên',
    'number.min': 'Số ngày mượn phải từ 1 ngày trở lên',
    'number.max': 'Số ngày mượn không được vượt quá 365 ngày',
    'any.required': 'Số ngày mượn là bắt buộc',
  }),
  HanNhanSach: Joi.number().integer().min(1).max(30).required().messages({
    'number.base': 'Hạn nhận sách sau khi duyệt phải là số',
    'number.integer': 'Hạn nhận sách sau khi duyệt phải là số nguyên',
    'number.min': 'Hạn nhận sách sau khi duyệt phải từ 1 ngày trở lên',
    'number.max': 'Hạn nhận sách không được vượt quá 30 ngày',
    'any.required': 'Hạn nhận sách là bắt buộc',
  }),
  PhiTreMoiNgay: Joi.number().min(0).max(1000000).required().messages({
    'number.base': 'Phí trễ mỗi ngày phải là số',
    'number.min': 'Phí trễ mỗi ngày không được nhỏ hơn 0',
    'number.max': 'Phí trễ mỗi ngày không được vượt quá 1.000.000 đ',
    'any.required': 'Phí trễ mỗi ngày là bắt buộc',
  }),
  TyLePhatRach: Joi.number().min(0).max(1).required().messages({
    'number.base': 'Tỷ lệ phạt rách phải là số',
    'number.min': 'Tỷ lệ phạt rách không được nhỏ hơn 0 (0%)',
    'number.max': 'Tỷ lệ phạt rách không được vượt quá 1 (100%)',
    'any.required': 'Tỷ lệ phạt rách là bắt buộc',
  }),
  TyLePhatMat: Joi.number().min(0).max(10).required().messages({
    'number.base': 'Tỷ lệ phạt mất sách phải là số',
    'number.min': 'Tỷ lệ phạt mất sách không được nhỏ hơn 0',
    'number.max': 'Tỷ lệ phạt mất sách không được vượt quá 10 lần đơn giá',
    'any.required': 'Tỷ lệ phạt mất sách là bắt buộc',
  }),
  PhiXuLyMat: Joi.number().min(0).max(1000000).required().messages({
    'number.base': 'Phí xử lý mất sách phải là số',
    'number.min': 'Phí xử lý mất sách không được nhỏ hơn 0',
    'number.max': 'Phí xử lý mất sách không được vượt quá 1.000.000 đ',
    'any.required': 'Phí xử lý mất sách là bắt buộc',
  }),
}).unknown(false);

/**
 * GET /api/admin/settings
 * Xem cấu hình hệ thống (Thủ thư & Admin)
 */
export const getSettings = asyncHandler(async (req, res) => {
  const settings = await fetchSettings();
  return ok(res, settings, 'Lấy cấu hình hệ thống thành công');
});

/**
 * PUT /api/admin/settings
 * Cập nhật cấu hình hệ thống (CHỈ Admin)
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const updated = await modifySettings(req.body, req.admin, req.ip);
  return ok(res, updated, 'Cập nhật cấu hình hệ thống thành công');
});

/**
 * POST /api/admin/settings/reset
 * Khôi phục cấu hình hệ thống về mặc định (CHỈ Admin)
 */
export const resetSettings = asyncHandler(async (req, res) => {
  const restored = await restoreSettings(req.admin, req.ip);
  return ok(res, restored, 'Khôi phục cấu hình hệ thống về mặc định thành công');
});

export default {
  getSettings,
  updateSettings,
  resetSettings,
};
