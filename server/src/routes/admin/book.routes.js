import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import uploadCover from '../../middlewares/upload.js';
import {
  list,
  getDetail,
  create,
  update,
  remove,
  listBooksQuerySchema,
  bookParamsSchema,
  createBookSchema,
  updateBookSchema,
} from '../../controllers/admin/book.controller.js';

const router = Router();

// Moi route quan ly sach deu phai qua authAdmin
// KHONG dung allowPendingPasswordChange (tai khoan buoc doi mat khau se bi chan 403)
router.use(authAdmin());

// GET /api/admin/books - Danh sach sach (thuthu + admin)
router.get(
  '/',
  requireRole('thuthu', 'admin'),
  validate({ query: listBooksQuerySchema }),
  list
);

// GET /api/admin/books/:maSach - Chi tiet sach kem NXB (thuthu + admin)
router.get(
  '/:maSach',
  requireRole('thuthu', 'admin'),
  validate({ params: bookParamsSchema }),
  getDetail
);

// POST /api/admin/books - Tao moi sach kem upload anh bia (thuthu + admin)
router.post(
  '/',
  requireRole('thuthu', 'admin'),
  uploadCover.single('AnhBia'),
  validate(createBookSchema),
  create
);

// PUT /api/admin/books/:maSach - Cap nhat sach (thuthu + admin)
router.put(
  '/:maSach',
  requireRole('thuthu', 'admin'),
  uploadCover.single('AnhBia'),
  validate({
    params: bookParamsSchema,
    body: updateBookSchema,
  }),
  update
);

// DELETE /api/admin/books/:maSach - Xoa mem sach (CHI admin)
router.delete(
  '/:maSach',
  requireRole('admin'),
  validate({ params: bookParamsSchema }),
  remove
);

export default router;
