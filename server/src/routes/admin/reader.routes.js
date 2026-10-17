import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  list,
  getDetail,
  update,
  updateStatus,
  remove,
  listReadersQuerySchema,
  readerParamsSchema,
  readerDetailQuerySchema,
  updateReaderSchema,
  updateStatusSchema,
} from '../../controllers/admin/reader.controller.js';

const router = Router();

// Mọi route quản lý độc giả đều phải xác thực admin/nhân viên
// Tuyệt đối KHÔNG cho phép tài khoản đang chờ đổi mật khẩu (BatBuocDoiMatKhau = true)
router.use(authAdmin());

// GET /api/admin/readers - Danh sách độc giả (thuthu + admin)
router.get(
  '/',
  requireRole('thuthu', 'admin'),
  validate({ query: listReadersQuerySchema }),
  list
);

// GET /api/admin/readers/:maDocGia - Hồ sơ chi tiết + tóm tắt + lịch sử mượn (thuthu + admin)
router.get(
  '/:maDocGia',
  requireRole('thuthu', 'admin'),
  validate({
    params: readerParamsSchema,
    query: readerDetailQuerySchema,
  }),
  getDetail
);

// PUT /api/admin/readers/:maDocGia - Cập nhật thông tin độc giả (thuthu + admin)
router.put(
  '/:maDocGia',
  requireRole('thuthu', 'admin'),
  validate({
    params: readerParamsSchema,
    body: updateReaderSchema,
  }),
  update
);

// PATCH /api/admin/readers/:maDocGia/status - Khóa / Mở khóa tài khoản độc giả (CHỈ admin)
router.patch(
  '/:maDocGia/status',
  requireRole('admin'),
  validate({
    params: readerParamsSchema,
    body: updateStatusSchema,
  }),
  updateStatus
);

// DELETE /api/admin/readers/:maDocGia - Xóa độc giả chưa từng mượn (CHỈ admin)
router.delete(
  '/:maDocGia',
  requireRole('admin'),
  validate({
    params: readerParamsSchema,
  }),
  remove
);

export default router;
