import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import shelfService from '../../services/shelf.service.js';

// Schema validate query lấy danh sách kệ sách
export const listShelvesQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
  khuVuc: Joi.string().allow('').trim().default(''),
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Số trang phải là số nguyên',
    'number.min': 'Số trang phải lớn hơn hoặc bằng 1',
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.base': 'Số lượng mỗi trang phải là số nguyên',
    'number.min': 'Số lượng mỗi trang phải từ 1 đến 100',
    'number.max': 'Số lượng mỗi trang không được vượt quá 100',
  }),
  sort: Joi.string()
    .valid(
      'MaKe',
      '-MaKe',
      'TenKe',
      '-TenKe',
      'KhuVuc',
      '-KhuVuc',
      'SoNgan',
      '-SoNgan',
      'createdAt',
      '-createdAt'
    )
    .default('-createdAt')
    .messages({
      'any.only': 'Trường sắp xếp không hợp lệ',
    }),
});

// Schema validate param :maKe
export const shelfParamsSchema = Joi.object({
  maKe: Joi.string()
    .trim()
    .pattern(/^KE\d{3,}$/)
    .required()
    .messages({
      'any.required': 'Mã kệ sách là bắt buộc',
      'string.empty': 'Mã kệ sách không được để trống',
      'string.pattern.base': 'Mã kệ sách không đúng định dạng (ví dụ: KE001)',
    }),
});

// Schema validate tạo kệ sách
export const createShelfSchema = Joi.object({
  TenKe: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Tên kệ sách là bắt buộc',
    'string.empty': 'Tên kệ sách không được để trống',
    'string.max': 'Tên kệ sách không được vượt quá 100 ký tự',
  }),
  KhuVuc: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Khu vực đặt kệ là bắt buộc',
    'string.empty': 'Khu vực đặt kệ không được để trống',
    'string.max': 'Khu vực không được vượt quá 100 ký tự',
  }),
  SoNgan: Joi.number().integer().min(1).max(20).default(5).messages({
    'number.base': 'Số ngăn phải là số nguyên',
    'number.min': 'Số ngăn tối thiểu là 1',
    'number.max': 'Số ngăn tối đa là 20',
  }),
});

// Schema validate cập nhật kệ sách
export const updateShelfSchema = Joi.object({
  TenKe: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Tên kệ sách là bắt buộc',
    'string.empty': 'Tên kệ sách không được để trống',
    'string.max': 'Tên kệ sách không được vượt quá 100 ký tự',
  }),
  KhuVuc: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Khu vực đặt kệ là bắt buộc',
    'string.empty': 'Khu vực đặt kệ không được để trống',
    'string.max': 'Khu vực không được vượt quá 100 ký tự',
  }),
  SoNgan: Joi.number().integer().min(1).max(20).required().messages({
    'any.required': 'Số ngăn là bắt buộc',
    'number.base': 'Số ngăn phải là số nguyên',
    'number.min': 'Số ngăn tối thiểu là 1',
    'number.max': 'Số ngăn tối đa là 20',
  }),
});

/**
 * GET /api/admin/shelves
 * Lấy danh sách kệ sách (phân trang, lọc, tìm kiếm)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await shelfService.getShelves(req.query);
  return ok(res, items, 'Lấy danh sách kệ sách thành công', meta);
});

/**
 * GET /api/admin/shelves/all
 * Lấy danh sách toàn bộ kệ sách (phục vụ dropdown trong form sách)
 */
export const listSimple = asyncHandler(async (req, res) => {
  const items = await shelfService.getAllShelvesSimple();
  return ok(res, items, 'Lấy danh sách kệ sách thành công');
});

/**
 * GET /api/admin/shelves/:maKe
 * Lấy chi tiết kệ sách kèm danh sách sách trên kệ
 */
export const getDetail = asyncHandler(async (req, res) => {
  const shelf = await shelfService.getShelfByCode(req.params.maKe);
  return ok(res, shelf, 'Lấy chi tiết kệ sách thành công');
});

/**
 * POST /api/admin/shelves
 * Tạo mới kệ sách
 */
export const create = asyncHandler(async (req, res) => {
  const admin = req.admin || null;
  const ip = req.ip || req.connection?.remoteAddress || '';
  const newShelf = await shelfService.createShelf(req.body, admin, ip);
  return created(res, newShelf, 'Tạo mới kệ sách thành công');
});

/**
 * PUT /api/admin/shelves/:maKe
 * Cập nhật kệ sách
 */
export const update = asyncHandler(async (req, res) => {
  const admin = req.admin || null;
  const ip = req.ip || req.connection?.remoteAddress || '';
  const updatedShelf = await shelfService.updateShelf(req.params.maKe, req.body, admin, ip);
  return ok(res, updatedShelf, 'Cập nhật kệ sách thành công');
});

/**
 * DELETE /api/admin/shelves/:maKe
 * Xóa kệ sách (chặn nếu đang có sách)
 */
export const remove = asyncHandler(async (req, res) => {
  const admin = req.admin || null;
  const ip = req.ip || req.connection?.remoteAddress || '';
  const result = await shelfService.deleteShelf(req.params.maKe, admin, ip);
  return ok(res, result, 'Xóa kệ sách thành công');
});

export default {
  list,
  listSimple,
  getDetail,
  create,
  update,
  remove,
};

