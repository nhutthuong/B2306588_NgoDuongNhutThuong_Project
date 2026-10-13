import ApiError from '../utils/ApiError.js';

/**
 * Middleware kiểm tra vai trò nhân viên từ req.admin.role
 * @param {...string|string[]} roles - Danh sách vai trò được phép (vd: 'admin' hoặc 'admin', 'thuthu')
 */
export const requireRole = (...roles) => {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.admin || !req.admin.role) {
      return next(
        new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực thông tin nhân viên')
      );
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return next(
        new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện hành động này')
      );
    }

    next();
  };
};

export default requireRole;
