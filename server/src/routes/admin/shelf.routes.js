import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  list,
  listSimple,
  getDetail,
  create,
  update,
  remove,
  listShelvesQuerySchema,
  shelfParamsSchema,
  createShelfSchema,
  updateShelfSchema,
} from '../../controllers/admin/shelf.controller.js';

const router = Router();

// Mọi route kệ sách đều phải xác thực admin / thủ thư
router.use(authAdmin());

// GET /api/admin/shelves/all - Lấy tất cả kệ sách (phục vụ dropdown, đặt trước /:maKe)
router.get('/all', requireRole('thuthu', 'admin'), listSimple);

// GET /api/admin/shelves - Danh sách kệ sách có phân trang & tìm kiếm
router.get(
  '/',
  requireRole('thuthu', 'admin'),
  validate({ query: listShelvesQuerySchema }),
  list
);

// GET /api/admin/shelves/:maKe - Chi tiết kệ sách
router.get(
  '/:maKe',
  requireRole('thuthu', 'admin'),
  validate({ params: shelfParamsSchema }),
  getDetail
);

// POST /api/admin/shelves - Tạo mới kệ sách
router.post(
  '/',
  requireRole('thuthu', 'admin'),
  validate(createShelfSchema),
  create
);

// PUT /api/admin/shelves/:maKe - Cập nhật thông tin kệ sách
router.put(
  '/:maKe',
  requireRole('thuthu', 'admin'),
  validate({ params: shelfParamsSchema, body: updateShelfSchema }),
  update
);

// DELETE /api/admin/shelves/:maKe - Xóa kệ sách (chặn nếu đang có sách)
router.delete(
  '/:maKe',
  requireRole('thuthu', 'admin'),
  validate({ params: shelfParamsSchema }),
  remove
);

export default router;

