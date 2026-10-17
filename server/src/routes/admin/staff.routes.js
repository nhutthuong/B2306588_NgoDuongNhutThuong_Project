import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  list,
  create,
  getDetail,
  update,
  changeRole,
  updateStatus,
  resetPassword,
  remove,
  listStaffQuerySchema,
  staffParamsSchema,
  createStaffSchema,
  updateStaffSchema,
  changeRoleSchema,
  updateStatusSchema,
  resetPasswordSchema,
} from '../../controllers/admin/staff.controller.js';

const router = Router();

// Mọi route quản lý nhân viên đều yêu cầu quyền Quản trị viên (admin)
// Chặn tài khoản đang chờ đổi mật khẩu (BatBuocDoiMatKhau = true)
router.use(authAdmin());
router.use(requireRole('admin'));

// GET /api/admin/staff - Danh sách nhân viên
router.get(
  '/',
  validate({ query: listStaffQuerySchema }),
  list
);

// POST /api/admin/staff - Thêm mới nhân viên
router.post(
  '/',
  validate(createStaffSchema),
  create
);

// GET /api/admin/staff/:msnv - Chi tiết nhân viên
router.get(
  '/:msnv',
  validate({ params: staffParamsSchema }),
  getDetail
);

// PUT /api/admin/staff/:msnv - Cập nhật thông tin nhân viên
router.put(
  '/:msnv',
  validate({
    params: staffParamsSchema,
    body: updateStaffSchema,
  }),
  update
);

// PATCH /api/admin/staff/:msnv/role - Đổi vai trò nhân viên
router.patch(
  '/:msnv/role',
  validate({
    params: staffParamsSchema,
    body: changeRoleSchema,
  }),
  changeRole
);

// PATCH /api/admin/staff/:msnv/status - Khóa / Mở khóa nhân viên
router.patch(
  '/:msnv/status',
  validate({
    params: staffParamsSchema,
    body: updateStatusSchema,
  }),
  updateStatus
);

// PATCH /api/admin/staff/:msnv/reset-password - Đặt lại mật khẩu tạm
router.patch(
  '/:msnv/reset-password',
  validate({
    params: staffParamsSchema,
    body: resetPasswordSchema,
  }),
  resetPassword
);

// DELETE /api/admin/staff/:msnv - Xóa nhân viên
router.delete(
  '/:msnv',
  validate({ params: staffParamsSchema }),
  remove
);

export default router;
