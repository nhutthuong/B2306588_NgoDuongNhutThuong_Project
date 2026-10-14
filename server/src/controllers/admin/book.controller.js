import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/response.js';
import bookService from '../../services/book.service.js';

const currentYear = new Date().getFullYear();

// Schema validate query lay danh sach sach
export const listBooksQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
  maNXB: Joi.string().allow('').trim().default(''),
  theLoai: Joi.string().allow('').trim().default(''),
  daXoa: Joi.boolean().default(false),
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

// Schema validate param :maSach trong duong dan (dinh dang Sxxxx, regex ^S\d{4,}$)
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

// Schema validate body multipart tao moi sach (tu choi moi truong la nhu MaSach, SoQuyenConLai, DaXoa, AnhBia text)
export const createBookSchema = Joi.object({
  TenSach: Joi.string().trim().min(1).max(200).required().messages({
    'any.required': 'Tên sách là bắt buộc',
    'string.empty': 'Tên sách không được để trống',
    'string.min': 'Tên sách phải có ít nhất 1 ký tự',
    'string.max': 'Tên sách không được vượt quá 200 ký tự',
    'string.base': 'Tên sách phải là chuỗi ký tự',
  }),
  DonGia: Joi.number().integer().min(0).max(100000000).required().messages({
    'any.required': 'Đơn giá là bắt buộc',
    'number.base': 'Đơn giá phải là số nguyên',
    'number.integer': 'Đơn giá phải là số nguyên',
    'number.min': 'Đơn giá không được nhỏ hơn 0',
    'number.max': 'Đơn giá không được vượt quá 100.000.000 VND',
  }),
  SoQuyen: Joi.number().integer().min(0).max(10000).required().messages({
    'any.required': 'Số quyển là bắt buộc',
    'number.base': 'Số quyển phải là số nguyên',
    'number.integer': 'Số quyển phải là số nguyên',
    'number.min': 'Số quyển không được nhỏ hơn 0',
    'number.max': 'Số quyển không được vượt quá 10.000 quyển',
  }),
  NamXuatBan: Joi.number().integer().min(1000).max(currentYear).optional().messages({
    'number.base': 'Năm xuất bản phải là số nguyên',
    'number.integer': 'Năm xuất bản phải là số nguyên',
    'number.min': 'Năm xuất bản phải từ năm 1000 trở đi',
    'number.max': `Năm xuất bản không được vượt quá năm hiện tại (${currentYear})`,
  }),
  MaNXB: Joi.string().trim().pattern(/^NXB\d{3,}$/).required().messages({
    'any.required': 'Mã nhà xuất bản là bắt buộc',
    'string.empty': 'Mã nhà xuất bản không được để trống',
    'string.pattern.base': 'Mã nhà xuất bản không đúng định dạng (ví dụ: NXB001)',
  }),
  NguonGocTacGia: Joi.string().trim().min(1).max(150).required().messages({
    'any.required': 'Nguồn gốc/Tác giả là bắt buộc',
    'string.empty': 'Nguồn gốc/Tác giả không được để trống',
    'string.max': 'Nguồn gốc/Tác giả không được vượt quá 150 ký tự',
  }),
  TheLoai: Joi.string().trim().max(60).allow('').optional().messages({
    'string.max': 'Thể loại không được vượt quá 60 ký tự',
  }),
  MoTa: Joi.string().trim().max(2000).allow('').optional().messages({
    'string.max': 'Mô tả không được vượt quá 2000 ký tự',
  }),
});

// Schema validate body multipart cap nhat sach (cung validate nhu POST + cho phep XoaAnhBia)
export const updateBookSchema = Joi.object({
  TenSach: Joi.string().trim().min(1).max(200).required().messages({
    'any.required': 'Tên sách là bắt buộc',
    'string.empty': 'Tên sách không được để trống',
    'string.min': 'Tên sách phải có ít nhất 1 ký tự',
    'string.max': 'Tên sách không được vượt quá 200 ký tự',
  }),
  DonGia: Joi.number().integer().min(0).max(100000000).required().messages({
    'any.required': 'Đơn giá là bắt buộc',
    'number.base': 'Đơn giá phải là số nguyên',
    'number.integer': 'Đơn giá phải là số nguyên',
    'number.min': 'Đơn giá không được nhỏ hơn 0',
    'number.max': 'Đơn giá không được vượt quá 100.000.000 VND',
  }),
  SoQuyen: Joi.number().integer().min(0).max(10000).required().messages({
    'any.required': 'Số quyển là bắt buộc',
    'number.base': 'Số quyển phải là số nguyên',
    'number.integer': 'Số quyển phải là số nguyên',
    'number.min': 'Số quyển không được nhỏ hơn 0',
    'number.max': 'Số quyển không được vượt quá 10.000 quyển',
  }),
  NamXuatBan: Joi.number().integer().min(1000).max(currentYear).optional().messages({
    'number.base': 'Năm xuất bản phải là số nguyên',
    'number.integer': 'Năm xuất bản phải là số nguyên',
    'number.min': 'Năm xuất bản phải từ năm 1000 trở đi',
    'number.max': `Năm xuất bản không được vượt quá năm hiện tại (${currentYear})`,
  }),
  MaNXB: Joi.string().trim().pattern(/^NXB\d{3,}$/).required().messages({
    'any.required': 'Mã nhà xuất bản là bắt buộc',
    'string.empty': 'Mã nhà xuất bản không được để trống',
    'string.pattern.base': 'Mã nhà xuất bản không đúng định dạng (ví dụ: NXB001)',
  }),
  NguonGocTacGia: Joi.string().trim().min(1).max(150).required().messages({
    'any.required': 'Nguồn gốc/Tác giả là bắt buộc',
    'string.empty': 'Nguồn gốc/Tác giả không được để trống',
    'string.max': 'Nguồn gốc/Tác giả không được vượt quá 150 ký tự',
  }),
  TheLoai: Joi.string().trim().max(60).allow('').optional().messages({
    'string.max': 'Thể loại không được vượt quá 60 ký tự',
  }),
  MoTa: Joi.string().trim().max(2000).allow('').optional().messages({
    'string.max': 'Mô tả không được vượt quá 2000 ký tự',
  }),
  XoaAnhBia: Joi.boolean().optional().default(false),
});

/**
 * GET /api/admin/books
 * Lay danh sach sach (thuthu + admin)
 */
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await bookService.getBooks(req.query);
  return ok(res, items, 'Lấy danh sách sách thành công', meta);
});

/**
 * GET /api/admin/books/:maSach
 * Lay chi tiet mot cuon sach kem thong tin NXB (thuthu + admin)
 */
export const getDetail = asyncHandler(async (req, res) => {
  const book = await bookService.getBookByCode(req.params.maSach);
  return ok(res, book, 'Lấy chi tiết sách thành công');
});

/**
 * POST /api/admin/books
 * Tao moi sach kem tai anh bia (thuthu + admin)
 */
export const create = asyncHandler(async (req, res) => {
  const book = await bookService.createBook(req.body, req.file, req.admin, req.ip);
  return created(res, book, 'Tạo mới sách thành công');
});

/**
 * PUT /api/admin/books/:maSach
 * Cap nhat sach, doi so quyen nguyen tu va cap nhat anh bia (thuthu + admin)
 */
export const update = asyncHandler(async (req, res) => {
  const book = await bookService.updateBook(
    req.params.maSach,
    req.body,
    req.file,
    req.admin,
    req.ip
  );
  return ok(res, book, 'Cập nhật sách thành công');
});

/**
 * DELETE /api/admin/books/:maSach
 * Xoa mem sach (CHI admin)
 */
export const remove = asyncHandler(async (req, res) => {
  const result = await bookService.deleteBook(req.params.maSach, req.admin, req.ip);
  return ok(res, {}, result.message);
});

export default {
  listBooksQuerySchema,
  bookParamsSchema,
  createBookSchema,
  updateBookSchema,
  list,
  getDetail,
  create,
  update,
  remove,
};
