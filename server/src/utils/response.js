/**
 * Chuẩn hóa format response thành công theo API.md §1
 * Format: { success: true, data: { }, message: "…", meta: { … } }
 *
 * @param {import('express').Response} res - Express response object
 * @param {any} [data={}] - Dữ liệu trả về
 * @param {string} [message='Thành công'] - Thông điệp trả về
 * @param {Object|null} [meta=null] - Thông tin phân trang hoặc metadata kèm theo
 * @param {number} [statusCode=200] - HTTP status code
 */
export const ok = (res, data = {}, message = 'Thành công', meta = null, statusCode = 200) => {
  const payload = {
    success: true,
    data: data !== undefined && data !== null ? data : {},
  };

  if (message) {
    payload.message = message;
  }

  if (meta) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
};

/**
 * Helper trả về response tạo mới thành công (HTTP 201)
 */
export const created = (res, data = {}, message = 'Tạo mới thành công', meta = null) => {
  return ok(res, data, message, meta, 201);
};

export default { ok, created };
