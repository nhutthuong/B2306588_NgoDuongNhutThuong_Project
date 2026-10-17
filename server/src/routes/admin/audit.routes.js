import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  getAuditLogs,
  getAuditMetadata,
  listAuditQuerySchema,
} from '../../controllers/admin/audit.controller.js';

const router = Router();

// Mọi route nhật ký kiểm toán hệ thống đều yêu cầu quyền Quản trị viên (CHỈ Admin)
router.use(authAdmin());
router.use(requireRole('admin'));

// GET /api/admin/audit-logs/metadata - Lấy danh sách hành động và đối tượng phục vụ bộ lọc
router.get('/metadata', getAuditMetadata);

// GET /api/admin/audit-logs - Xem danh sách nhật ký kiểm toán
router.get(
  '/',
  validate({ query: listAuditQuerySchema }),
  getAuditLogs
);

export default router;
