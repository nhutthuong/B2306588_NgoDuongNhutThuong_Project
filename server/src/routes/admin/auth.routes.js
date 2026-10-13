import { Router } from 'express';
import env from '../../config/env.js';
import { ok } from '../../utils/response.js';
import { authLimiter } from '../../middlewares/rateLimit.js';
import validate from '../../middlewares/validate.js';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import checkOrigin from '../../middlewares/checkOrigin.js';
import {
  login,
  refresh,
  logout,
  getMe,
  changePassword,
  loginSchema,
  changePasswordSchema,
} from '../../controllers/admin/auth.controller.js';

const router = Router();

// POST /api/admin/auth/login (public): giới hạn rate limit chặt, validate body
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/admin/auth/refresh (public, dựa cookie rt_admin): giới hạn rate limit chặt, kiểm tra Origin
router.post('/refresh', authLimiter, checkOrigin, refresh);

// POST /api/admin/auth/logout: dựa cookie rt_admin + kiểm tra Origin, không yêu cầu access token còn hạn
router.post('/logout', checkOrigin, logout);

// GET /api/admin/auth/me: yêu cầu authAdmin, cho phép truy cập khi BatBuocDoiMatKhau = true
router.get('/me', authAdmin({ allowPendingPasswordChange: true }), getMe);

// PATCH /api/admin/auth/change-password: yêu cầu authAdmin, cho phép khi BatBuocDoiMatKhau = true
router.patch(
  '/change-password',
  authAdmin({ allowPendingPasswordChange: true }),
  validate(changePasswordSchema),
  changePassword
);

// TODO (P4-2): Gỡ bỏ hai route kiểm thử tạm thời này trước khi hoàn thành Phase 4
// Route kiểm thử tạm thời, CHỈ đăng ký khi NODE_ENV khác production
if (env.NODE_ENV !== 'production') {
  router.get(
    '/ping-staff',
    authAdmin(),
    requireRole('admin', 'thuthu'),
    (req, res) => {
      return ok(res, { ok: true }, 'Kiểm tra quyền thủ thư/admin thành công');
    }
  );

  router.get(
    '/ping-admin',
    authAdmin(),
    requireRole('admin'),
    (req, res) => {
      return ok(res, { ok: true }, 'Kiểm tra quyền admin thành công');
    }
  );
}

export default router;
