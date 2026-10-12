import { ApiError } from '../utils/ApiError.js';

/**
 * Middleware bắt 404 Not Found và chuyển sang errorHandler
 */
export const notFound = (req, res, next) => {
  next(
    new ApiError(
      404,
      'NOT_FOUND',
      `Không tìm thấy tài nguyên: ${req.method} ${req.originalUrl}`
    )
  );
};

export default notFound;
