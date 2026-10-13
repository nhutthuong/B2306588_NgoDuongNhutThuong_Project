import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * Middleware kiểm tra header Origin có nằm trong whitelist CORS_ORIGINS hay không
 * Dùng cho các endpoint dựa vào cookie refresh (refresh, logout) để phòng chống CSRF theo CONVENTIONS.md §5.5
 */
export const checkOrigin = (req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || !env.CORS_ORIGINS.includes(origin)) {
    return next(
      new ApiError(403, 'FORBIDDEN', 'Header Origin không hợp lệ hoặc không được phép')
    );
  }

  next();
};

export default checkOrigin;
