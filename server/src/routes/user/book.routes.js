import { Router } from 'express';
import validate from '../../middlewares/validate.js';
import bookController from '../../controllers/user/book.controller.js';

const router = Router();

/**
 * GET /api/user/books
 * Lấy danh sách sách công khai (tìm kiếm, lọc theo NXB, năm XB, thể loại, còn sách, phân trang, sắp xếp)
 */
router.get(
  '/',
  validate(bookController.listBooksQuerySchema, 'query'),
  bookController.list
);

/**
 * GET /api/user/books/:maSach
 * Lấy chi tiết sách công khai kèm thông tin NXB (chỉ sách chưa xóa mềm)
 */
router.get(
  '/:maSach',
  validate(bookController.bookParamsSchema, 'params'),
  bookController.getDetail
);

export default router;
