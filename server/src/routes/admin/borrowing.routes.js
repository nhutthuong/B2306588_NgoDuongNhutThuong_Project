import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  list,
  getDetail,
  approve,
  reject,
  handover,
  returnBook,
  payFine,
  cancel,
  adminListBorrowingsQuerySchema,
  borrowingIdParamSchema,
  rejectBorrowingBodySchema,
  returnBorrowingBodySchema,
  payFineBodySchema,
  cancelBorrowingBodySchema,
} from '../../controllers/admin/borrowing.controller.js';

const router = Router();

// Toàn bộ route quản lý mượn sách ở admin yêu cầu xác thực nhân viên và không bị bắt buộc đổi mật khẩu
router.use(authAdmin());
router.use(requireRole('thuthu', 'admin'));

// GET /api/admin/borrowings - Danh sách phiếu mượn toàn hệ thống kèm bộ lọc
router.get('/', validate({ query: adminListBorrowingsQuerySchema }), list);

// GET /api/admin/borrowings/:id - Chi tiết phiếu mượn
router.get('/:id', validate({ params: borrowingIdParamSchema }), getDetail);

// PATCH /api/admin/borrowings/:id/approve - Duyệt phiếu mượn (trừ kho nguyên tử)
router.patch('/:id/approve', validate({ params: borrowingIdParamSchema }), approve);

// PATCH /api/admin/borrowings/:id/reject - Từ chối phiếu mượn kèm lý do
router.patch(
  '/:id/reject',
  validate({
    params: borrowingIdParamSchema,
    body: rejectBorrowingBodySchema,
  }),
  reject
);

// PATCH /api/admin/borrowings/:id/handover - Giao sách thực tế cho độc giả
router.patch('/:id/handover', validate({ params: borrowingIdParamSchema }), handover);

// PATCH /api/admin/borrowings/:id/return - Nhận trả sách từ độc giả (tính phạt và cập nhật kho)
router.patch(
  '/:id/return',
  validate({
    params: borrowingIdParamSchema,
    body: returnBorrowingBodySchema,
  }),
  returnBook
);

// PATCH /api/admin/borrowings/:id/pay-fine - Thu tiền phạt từ độc giả
router.patch(
  '/:id/pay-fine',
  validate({
    params: borrowingIdParamSchema,
    body: payFineBodySchema,
  }),
  payFine
);

// PATCH /api/admin/borrowings/:id/cancel - Hủy phiếu mượn thay độc giả (khi ChoDuyet hoặc DaDuyet)
router.patch(
  '/:id/cancel',
  validate({
    params: borrowingIdParamSchema,
    body: cancelBorrowingBodySchema,
  }),
  cancel
);

export default router;
