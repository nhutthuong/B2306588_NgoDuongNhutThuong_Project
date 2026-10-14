import { Router } from 'express';
import validate from '../../middlewares/validate.js';
import publisherController from '../../controllers/user/publisher.controller.js';

const router = Router();

/**
 * GET /api/user/publishers
 * Lấy danh sách nhà xuất bản công khai cho độc giả (phục vụ bộ lọc)
 */
router.get(
  '/',
  validate(publisherController.listPublishersQuerySchema, 'query'),
  publisherController.list
);

export default router;
