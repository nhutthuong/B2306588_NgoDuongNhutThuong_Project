import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import bookService from '../../services/book.service.js';

const currentYear = new Date().getFullYear();

// Schema validate query lấy danh sách sách cho độc giả
export const listBooksQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
  maNXB: Joi.string().allow('').trim().default(''),
  namXuatBan: Joi.number().integer().min(1000).max(currentYear).optional().messages({
    'number.base': 'Năm xuất bản phải là số nguyên',
    'number.integer': 'Năm xuất bản phải là số nguyên',
    'number.min': 'Năm xuất bản phải từ năm 1000 trở đi',
    'number.max': `Năm xuất bản không được vượt quá năm hiện tại (${currentYear})`,
  }),
  theLoai: Joi.string().allow('').trim().max(60).default('').messages({
    'string.max': 'Thể loại không được vượt quá 60 ký tự',
  }),
  conSach: Joi.boolean().default(false),
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
      'MaSach',
      '-MaSach',
      'TenSach',
      '-TenSach',
      'DonGia',
      '-DonGia',
      'SoQuyen',
      '-SoQuyen',
      'NamXuatBan',
      '-NamXuatBan',
      'createdAt',
      '-createdAt'
    )
    .default('-createdAt')
    .messages({
      'any.only':
        'Trường sắp xếp không hợp lệ. Chỉ chấp nhận: MaSach, TenSach, DonGia, SoQuyen, NamXuatBan, createdAt (kèm dấu - để giảm dần)',
    }),
});

// Schema validate param :maSach trong đường dẫn (định dạng Sxxxx, regex ^S\d{4,}$/)
export const bookParamsSchema = Joi.object({
  maSach: Joi.string()
    .trim()
    .pattern(/^S\d{4,}$/)
    .required()
    .messages({
      'any.required': 'Mã sách là bắt buộc',
      'string.empty': 'Mã sách không được để trống',
      'string.pattern.base': 'Mã sách không đúng định dạng (ví dụ: S0001)',
    }),
});

/**
 * GET /api/user/books
 * Lấy danh sách sách công khai cho độc giả (chỉ sách chưa xóa mềm DaXoa = false)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await bookService.getBooks({
    ...req.query,
    daXoa: false, // Luôn ép DaXoa = false đối với API độc giả
  });
  return ok(res, items, 'Lấy danh sách sách thành công', meta);
});

/**
 * GET /api/user/books/:maSach
 * Lấy chi tiết sách công khai cho độc giả (nếu không tồn tại hoặc đã xóa mềm -> 404)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const book = await bookService.getUserBookByCode(req.params.maSach);
  return ok(res, book, 'Lấy chi tiết sách thành công');
});

export default {
  listBooksQuerySchema,
  bookParamsSchema,
  list,
  getDetail,
};
