import { Router } from 'express';
import env from '../../config/env.js';
import { ok } from '../../utils/response.js';
import { authLimiter } from '../../middlewares/rateLimit.js';
import validate from '../../middlewares/validate.js';
import authUser from '../../middlewares/authUser.js';
import checkOrigin from '../../middlewares/checkOrigin.js';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
  changePassword,
  registerSchema,
  loginSchema,
  updateMeSchema,
  changePasswordSchema,
} from '../../controllers/user/auth.controller.js';

const router = Router();

// POST /api/user/auth/register (public): rate limit chặt, validate body whitelist
router.post('/register', authLimiter, validate(registerSchema), register);

// POST /api/user/auth/login (public): rate limit chặt, validate body
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/user/auth/refresh (public, dựa cookie rt_user): rate limit chặt, kiểm tra Origin
router.post('/refresh', authLimiter, checkOrigin, refresh);

// POST /api/user/auth/logout: dựa cookie rt_user + kiểm tra Origin, không yêu cầu access token còn hạn
router.post('/logout', checkOrigin, logout);

// GET /api/user/auth/me: yêu cầu authUser, lấy hồ sơ đầy đủ
router.get('/me', authUser, getMe);

// PATCH /api/user/auth/me: yêu cầu authUser, chỉ cho sửa các trường whitelisted
router.patch('/me', authUser, validate(updateMeSchema), updateMe);

// PATCH /api/user/auth/change-password: yêu cầu authUser, đổi mật khẩu
router.patch('/change-password', authUser, validate(changePasswordSchema), changePassword);

// TODO (P3-2): Gỡ bỏ route kiểm thử này trước khi hoàn thành Phase 3
// Route kiểm thử tạm thời, CHỈ đăng ký khi NODE_ENV khác production
if (env.NODE_ENV !== 'production') {
  router.get('/ping', authUser, (req, res) => {
    return ok(res, { ok: true, maDocGia: req.user.maDocGia }, 'Kiểm tra quyền độc giả thành công');
  });
}

export default router;
