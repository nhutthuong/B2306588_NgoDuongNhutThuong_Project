import { Router } from 'express';
import authAdmin from '../../middlewares/authAdmin.js';
import requireRole from '../../middlewares/requireRole.js';
import validate from '../../middlewares/validate.js';
import {
  list,
  getDetail,
  create,
  update,
  remove,
  listPublishersQuerySchema,
  publisherParamsSchema,
  createPublisherSchema,
  updatePublisherSchema,
} from '../../controllers/admin/publisher.controller.js';

const router = Router();

// Moi route nha xuat ban deu phai xac thuc admin/nhan vien
// KHONG dung allowPendingPasswordChange (tai khoan buoc doi mat khau se bi chan 403)
router.use(authAdmin());

// GET /api/admin/publishers - Danh sach nha xuat ban (thuthu + admin)
router.get(
  '/',
  requireRole('thuthu', 'admin'),
  validate({ query: listPublishersQuerySchema }),
  list
);

// GET /api/admin/publishers/:maNXB - Chi tiet nha xuat ban (thuthu + admin)
router.get(
  '/:maNXB',
  requireRole('thuthu', 'admin'),
  validate({ params: publisherParamsSchema }),
  getDetail
);

// POST /api/admin/publishers - Tao nha xuat ban moi (thuthu + admin)
router.post(
  '/',
  requireRole('thuthu', 'admin'),
  validate(createPublisherSchema),
  create
);

// PUT /api/admin/publishers/:maNXB - Cap nhat nha xuat ban (thuthu + admin)
router.put(
  '/:maNXB',
  requireRole('thuthu', 'admin'),
  validate({
    params: publisherParamsSchema,
    body: updatePublisherSchema,
  }),
  update
);

// DELETE /api/admin/publishers/:maNXB - Xoa nha xuat ban (CHI admin)
router.delete(
  '/:maNXB',
  requireRole('admin'),
  validate({ params: publisherParamsSchema }),
  remove
);

export default router;
