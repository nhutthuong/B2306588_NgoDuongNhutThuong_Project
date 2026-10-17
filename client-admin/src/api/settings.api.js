import http from './http.js';

/**
 * Lớp API cấu hình hệ thống cho client-admin (Phase 4 - P4-3)
 * Theo docs/API.md §4.7
 */

/**
 * Lấy cấu hình hệ thống hiện tại
 * @param {AbortSignal} [signal]
 * @returns {Promise}
 */
export const get = (signal) => {
  return http.get('/admin/settings', { signal });
};

/**
 * Cập nhật cấu hình hệ thống (CHỈ Admin)
 * @param {object} data
 * @returns {Promise}
 */
export const update = (data) => {
  return http.put('/admin/settings', data);
};

/**
 * Khôi phục cấu hình hệ thống về mặc định (CHỈ Admin)
 * @returns {Promise}
 */
export const reset = () => {
  return http.post('/admin/settings/reset');
};

export default {
  get,
  update,
  reset,
};
