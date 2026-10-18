import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  getOverview,
  getTopBooks,
  getBorrowByMonth,
  getOverdue,
  getFines,
  getTopReaders,
  statsOverviewQuerySchema,
  statsYearQuerySchema,
  statsDateRangeQuerySchema,
  statsOverdueQuerySchema,
} from '../../controllers/admin/stats.controller.js';

const router = Router();

// Mọi route thống kê yêu cầu đăng nhập nhân viên (thủ thư hoặc admin)
// KHÔNG dùng chế độ cho phép đang chờ đổi mật khẩu (allowPendingPasswordChange = false)
router.use(authAdmin());
router.use(requireRole('thuthu', 'admin'));

// 1. GET /api/admin/stats/overview - Thống kê tổng quan kho sách, độc giả, phiếu mượn
router.get(
  '/overview',
  validate({ query: statsOverviewQuerySchema }),
  getOverview
);

// 2. GET /api/admin/stats/top-books - Sách có nhiều lượt mượn nhất
router.get(
  '/top-books',
  validate({ query: statsDateRangeQuerySchema }),
  getTopBooks
);

// 3. GET /api/admin/stats/borrow-by-month - Lượt mượn và đăng ký theo tháng
router.get(
  '/borrow-by-month',
  validate({ query: statsYearQuerySchema }),
  getBorrowByMonth
);

// 4. GET /api/admin/stats/overdue - Danh sách phiếu mượn quá hạn (phân trang)
router.get(
  '/overdue',
  validate({ query: statsOverdueQuerySchema }),
  getOverdue
);

// 5. GET /api/admin/stats/fines - Thống kê tiền phạt phát sinh, đã thu, sách rách/mất theo tháng
router.get(
  '/fines',
  validate({ query: statsYearQuerySchema }),
  getFines
);

// 6. GET /api/admin/stats/top-readers - Top độc giả mượn sách nhiều nhất
router.get(
  '/top-readers',
  validate({ query: statsDateRangeQuerySchema }),
  getTopReaders
);

export default router;
