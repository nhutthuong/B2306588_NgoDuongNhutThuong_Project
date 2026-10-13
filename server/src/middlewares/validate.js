import ApiError from '../utils/ApiError.js';

/**
 * Middleware validate body, query, params bằng Joi
 * - Từ chối các trường lạ (allowUnknown: false)
 * - Trả về lỗi 400 VALIDATION_ERROR với mảng details: [{ field, message }] bằng tiếng Việt
 *
 * @param {import('joi').ObjectSchema|object} schemaOrSchemas - Joi schema (mặc định cho body) hoặc object { body?, query?, params? }
 * @param {'body'|'query'|'params'} [defaultTarget='body'] - Thuộc tính cần validate nếu truyền schema đơn
 */
export const validate = (schemaOrSchemas, defaultTarget = 'body') => {
  return (req, res, next) => {
    // Cho phép truyền trực tiếp Joi schema (mặc định validate body) hoặc object cấu hình { body, query, params }
    const targets =
      schemaOrSchemas && typeof schemaOrSchemas.validate === 'function'
        ? { [defaultTarget]: schemaOrSchemas }
        : schemaOrSchemas || {};

    const details = [];

    for (const [source, schema] of Object.entries(targets)) {
      if (!schema || typeof schema.validate !== 'function') continue;

      const dataToValidate = req[source] !== undefined && req[source] !== null ? req[source] : {};

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: false,
      });

      if (error) {
        for (const item of error.details) {
          let message = item.message;
          // Chuẩn hóa thông báo lỗi trường lạ nếu chưa có custom message
          if (item.type === 'object.unknown') {
            const fieldName = item.context?.key || item.path.join('.');
            message = `Trường '${fieldName}' không được phép gửi lên`;
          }

          details.push({
            field: item.path.join('.') || item.context?.key || source,
            message,
          });
        }
      } else {
        // Gán lại dữ liệu đã qua tiền xử lý (strip/trim/cast kiểu)
        req[source] = value;
      }
    }

    if (details.length > 0) {
      return next(
        new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu đầu vào không hợp lệ', details)
      );
    }

    next();
  };
};

export default validate;
