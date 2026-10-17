import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  getSettings,
  updateSettings,
  resetSettings,
  updateSettingsSchema,
} from '../../controllers/admin/settings.controller.js';

const router = Router();

// Mọi route cấu hình đều yêu cầu đăng nhập nhân viên
router.use(authAdmin());

// GET /api/admin/settings - Xem cấu hình (Thủ thư & Admin)
router.get('/', requireRole('admin', 'thuthu'), getSettings);

// PUT /api/admin/settings - Cập nhật cấu hình (CHỈ Admin)
router.put(
  '/',
  requireRole('admin'),
  validate(updateSettingsSchema),
  updateSettings
);

// POST /api/admin/settings/reset - Khôi phục cấu hình mặc định (CHỈ Admin)
router.post(
  '/reset',
  requireRole('admin'),
  resetSettings
);

export default router;
