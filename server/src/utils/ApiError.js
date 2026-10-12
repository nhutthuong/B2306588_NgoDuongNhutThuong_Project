/**
 * Custom Error class for API error responses
 * Tuân thủ định dạng mã lỗi tại docs/API.md §2 và CONVENTIONS.md §2
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode - Mã trạng thái HTTP (400, 401, 403, 404, 409, 422, 500, ...)
   * @param {string} code - Mã lỗi định danh (VALIDATION_ERROR, NOT_FOUND, UNAUTHENTICATED, ...)
   * @param {string} message - Thông báo lỗi bằng tiếng Việt
   * @param {Array|Object|null} [details=null] - Chi tiết lỗi (vd: danh sách lỗi validate theo trường)
   */
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Yêu cầu không hợp lệ', code = 'VALIDATION_ERROR', details = null) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn', code = 'UNAUTHENTICATED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện hành động này', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Không tìm thấy tài nguyên yêu cầu', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message = 'Dữ liệu bị xung đột hoặc đã tồn tại', code = 'DUPLICATE') {
    return new ApiError(409, code, message);
  }

  static unprocessable(message = 'Không thể xử lý yêu cầu do vi phạm nghiệp vụ', code = 'BORROW_LIMIT_EXCEEDED') {
    return new ApiError(422, code, message);
  }

  static internal(message = 'Lỗi máy chủ nội bộ', code = 'INTERNAL_ERROR') {
    return new ApiError(500, code, message);
  }
}

export default ApiError;
