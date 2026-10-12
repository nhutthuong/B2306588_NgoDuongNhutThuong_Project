import env from '../config/env.js';

/**
 * Global Error Handler Middleware
 * Nơi duy nhất định dạng response lỗi theo chuẩn API.md §1 & §2
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Lỗi máy chủ nội bộ';
  let details = err.details || null;

  // Xu ly loi body vuot qua gioi han kich thuoc (10kb)
  if (err.type === 'entity.too.large' || statusCode === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Dung lượng yêu cầu vượt quá giới hạn cho phép (tối đa 10KB)';
  }

  // Xu ly loi CORS
  if (err.isCors || (err.message && err.message.includes('CORS'))) {
    statusCode = 403;
    code = 'FORBIDDEN';
  }

  // Xử lý lỗi Mongoose CastError (sai ObjectId hoặc sai kiểu dữ liệu)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Dữ liệu không đúng định dạng tại trường: ${err.path}`;
  }

  // Xử lý lỗi Mongoose ValidationError
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dữ liệu đầu vào không hợp lệ';
    details = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  }

  // Xử lý lỗi trùng khóa MongoDB (11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE';
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    message = `Dữ liệu đã tồn tại trong hệ thống (${fields.join(', ')})`;
    details = err.keyValue;
  }

  // Xử lý lỗi Joi validation
  if (err.isJoi && err.details) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dữ liệu đầu vào không hợp lệ';
    details = err.details.map((item) => ({
      field: item.context?.key || item.path.join('.'),
      message: item.message,
    }));
  }

  // Xử lý lỗi JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'UNAUTHENTICATED';
    message = 'Mã xác thực không hợp lệ';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Phiên làm việc đã hết hạn';
  }

  // Ở môi trường production, che giấu chi tiết lỗi 500 không mong muốn
  if (statusCode === 500 && env.isProduction) {
    message = 'Lỗi máy chủ nội bộ';
    details = null;
  }

  const responsePayload = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(!env.isProduction && env.isDevelopment && err.stack ? { stack: err.stack } : {}),
    },
  };

  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(responsePayload);
};

export default errorHandler;
