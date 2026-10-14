import http from './http.js';

/**
 * API Nhà xuất bản cho độc giả (client-user)
 * Phục vụ danh sách NXB cho bộ lọc tìm kiếm
 */

/**
 * Lấy danh sách NXB công khai
 * @param {object} [params] { search }
 * @returns {Promise<any>}
 */
export const list = (params = {}) => {
  return http.get('/user/publishers', { params });
};

export default {
  list,
};
