/**
 * Helper trich xuat tham so phan trang tu query
 *
 * @param {object} query - Express req.query
 * @param {number} [defaultLimit=10]
 * @param {number} [maxLimit=100]
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const getPagination = (query = {}, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const rawLimit = parseInt(query?.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Tao object meta phan trang theo chuan API.md §1
 *
 * @param {number} total - Tong so ban ghi tim duoc
 * @param {number} page - Trang hien tai (1-indexed)
 * @param {number} limit - So ban ghi tren moi trang
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
export const getPaginationMeta = (total = 0, page = 1, limit = 10) => {
  const safeTotal = Math.max(0, parseInt(total, 10) || 0);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 10);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const totalPages = Math.ceil(safeTotal / safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
  };
};

export default {
  getPagination,
  getPaginationMeta,
};
