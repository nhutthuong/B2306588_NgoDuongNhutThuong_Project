/**
 * Escape cac ky tu dac biet cua bieu thuc chinh quy (RegExp)
 * de tranh loi ReDoS hoac regex injection khi tim kiem
 *
 * @param {string} string - Chuoi can escape
 * @returns {string} Chuoi da duoc escape cac ky tu dac biet
 */
export const escapeRegex = (string = '') => {
  if (typeof string !== 'string') {
    string = String(string || '');
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export default escapeRegex;
