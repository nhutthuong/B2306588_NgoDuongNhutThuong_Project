/**
 * Bọc hàm async route handler để tự động catch lỗi và chuyển tới errorHandler
 * @param {Function} fn - Async Express handler
 * @returns {Function} Express middleware handler
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
