import { Router } from 'express';
import authUser from '../../middlewares/authUser.js';
import validate from '../../middlewares/validate.js';
import {
  createBorrowing,
  listMyBorrowings,
  getBorrowingSummary,
  getBorrowingById,
  cancelMyBorrowing,
  createBorrowingSchema,
  listBorrowingsQuerySchema,
  borrowingIdParamSchema,
} from '../../controllers/user/borrowing.controller.js';

const router = Router();

// Mọi route dưới đây đều yêu cầu đăng nhập với tư cách độc giả (authUser)
router.use(authUser);

// POST /api/user/borrowings: Đăng ký mượn 1 cuốn sách
router.post('/', validate(createBorrowingSchema), createBorrowing);

// GET /api/user/borrowings: Lịch sử mượn sách của chính mình kèm phân trang, lọc trạng thái
router.get('/', validate(listBorrowingsQuerySchema, 'query'), listMyBorrowings);

// GET /api/user/borrowings/summary: Tóm tắt giới hạn mượn và tình trạng quá hạn, phạt
router.get('/summary', getBorrowingSummary);

// GET /api/user/borrowings/:id: Chi tiết phiếu mượn của chính mình
router.get('/:id', validate({ params: borrowingIdParamSchema }), getBorrowingById);

// PATCH /api/user/borrowings/:id/cancel: Độc giả hủy phiếu mượn (khi ChoDuyet hoặc DaDuyet)
router.patch('/:id/cancel', validate({ params: borrowingIdParamSchema }), cancelMyBorrowing);

export default router;
