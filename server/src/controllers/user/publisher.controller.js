import Joi from 'joi';
import asyncHandler from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import publisherService from '../../services/publisher.service.js';

// Schema validate query lấy danh sách NXB cho độc giả (phục vụ bộ lọc)
export const listPublishersQuerySchema = Joi.object({
  search: Joi.string().allow('').trim().default(''),
});

/**
 * GET /api/user/publishers
 * Lấy danh sách NXB công khai cho độc giả
 */
export const list = asyncHandler(async (req, res) => {
  const publishers = await publisherService.getPublishersForUser(req.query);
  return ok(res, publishers, 'Lấy danh sách nhà xuất bản thành công');
});

export default {
  listPublishersQuerySchema,
  list,
};
