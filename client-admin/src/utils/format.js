/**
 * Các hàm tiện ích định dạng dữ liệu cho client-admin
 * Theo yêu cầu P2-3
 */

/**
 * Định dạng số tiền sang chuẩn Việt Nam (VND)
 * @param {number|string} amount
 * @returns {string} Ví dụ: "45.000 ₫"
 */
export const formatCurrency = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(num);
};

/**
 * Định dạng ngày tháng theo kiểu hiển thị tiếng Việt (DD/MM/YYYY hoặc kèm giờ)
 * @param {string|Date} dateVal
 * @param {boolean} [includeTime=false]
 * @returns {string}
 */
export const formatDate = (dateVal, includeTime = false) => {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  return `${day}/${month}/${year}`;
};

/**
 * Ghép URL ảnh bìa sách từ backend origin và đường dẫn lưu trong DB.
 * CHỈ chấp nhận chuỗi bắt đầu bằng "/uploads/covers/", ngoài ra trả về rỗng (để component hiện ảnh thay thế).
 * @param {string} anhBia
 * @returns {string}
 */
export const getCoverUrl = (anhBia) => {
  if (!anhBia || typeof anhBia !== 'string' || !anhBia.startsWith('/uploads/covers/')) {
    return '';
  }

  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const origin = new URL(apiUrl).origin;
    return `${origin}${anhBia}`;
  } catch {
    return '';
  }
};
