import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import publisherService from '../../services/publisher.service.js';

// Schema validate query lay danh sach NXB
export const listPublishersQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
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
      'MaNXB',
      '-MaNXB',
      'TenNXB',
      '-TenNXB',
      'createdAt',
      '-createdAt'
    )
    .default('-createdAt')
    .messages({
      'any.only': 'Trường sắp xếp không hợp lệ. Chỉ chấp nhận: MaNXB, TenNXB, createdAt (kèm dấu - để giảm dần)',
    }),
});

// Schema validate param maNXB trong duong dan (regex ^NXB\d{3,}$)
export const publisherParamsSchema = Joi.object({
  maNXB: Joi.string()
    .trim()
    .pattern(/^NXB\d{3,}$/)
    .required()
    .messages({
      'any.required': 'Mã nhà xuất bản là bắt buộc',
      'string.empty': 'Mã nhà xuất bản không được để trống',
      'string.pattern.base': 'Mã nhà xuất bản không đúng định dạng (ví dụ: NXB001)',
    }),
});

// Schema validate body tao moi NXB (tu choi moi truong la nhu MaNXB, _id, createdAt)
export const createPublisherSchema = Joi.object({
  TenNXB: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Tên nhà xuất bản là bắt buộc',
    'string.empty': 'Tên nhà xuất bản không được để trống',
    'string.min': 'Tên nhà xuất bản phải có ít nhất 1 ký tự',
    'string.max': 'Tên nhà xuất bản không được vượt quá 100 ký tự',
    'string.base': 'Tên nhà xuất bản phải là chuỗi ký tự',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').optional().messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
    'string.base': 'Địa chỉ phải là chuỗi ký tự',
  }),
});

// Schema validate body cap nhat NXB (khong cho phep doi MaNXB hay gui truong la)
export const updatePublisherSchema = Joi.object({
  TenNXB: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'Tên nhà xuất bản là bắt buộc',
    'string.empty': 'Tên nhà xuất bản không được để trống',
    'string.min': 'Tên nhà xuất bản phải có ít nhất 1 ký tự',
    'string.max': 'Tên nhà xuất bản không được vượt quá 100 ký tự',
    'string.base': 'Tên nhà xuất bản phải là chuỗi ký tự',
  }),
  DiaChi: Joi.string().trim().max(200).allow('').optional().messages({
    'string.max': 'Địa chỉ không được vượt quá 200 ký tự',
    'string.base': 'Địa chỉ phải là chuỗi ký tự',
  }),
});

/**
 * GET /api/admin/publishers
 * Lay danh sach nha xuat ban (thuthu + admin)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await publisherService.getPublishers(req.query);
  return ok(res, items, 'Lấy danh sách nhà xuất bản thành công', meta);
});

/**
 * GET /api/admin/publishers/:maNXB
 * Lay chi tiet mot nha xuat ban kem SoSach (thuthu + admin)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const publisher = await publisherService.getPublisherByCode(req.params.maNXB);
  return ok(res, publisher, 'Lấy chi tiết nhà xuất bản thành công');
});

/**
 * POST /api/admin/publishers
 * Tao moi nha xuat ban (thuthu + admin)
 */
export const create = asyncHandler(async (req, res) => {
  const publisher = await publisherService.createPublisher(req.body, req.admin, req.ip);
  return created(res, publisher, 'Tạo nhà xuất bản thành công');
});

/**
 * PUT /api/admin/publishers/:maNXB
 * Cap nhat nha xuat ban (thuthu + admin)
 */
export const update = asyncHandler(async (req, res) => {
  const publisher = await publisherService.updatePublisher(
    req.params.maNXB,
    req.body,
    req.admin,
    req.ip
  );
  return ok(res, publisher, 'Cập nhật nhà xuất bản thành công');
});

/**
 * DELETE /api/admin/publishers/:maNXB
 * Xoa nha xuat ban (CHI admin)
 */
export const remove = asyncHandler(async (req, res) => {
  const result = await publisherService.deletePublisher(req.params.maNXB, req.admin, req.ip);
  return ok(res, {}, result.message);
});

export default {
  listPublishersQuerySchema,
  publisherParamsSchema,
  createPublisherSchema,
  updatePublisherSchema,
  list,
  getDetail,
  create,
  update,
  remove,
};
