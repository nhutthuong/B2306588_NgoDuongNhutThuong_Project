import CauHinh from '../models/CauHinh.js';

/**
 * Giá trị cấu hình mặc định của hệ thống theo docs/SYSTEM.md §5
 */
export const DEFAULT_SETTINGS = Object.freeze({
  SoSachToiDa: 5,
  SoNgayMuon: 14,
  HanNhanSach: 2,
  PhiTreMoiNgay: 2000,
  TyLePhatRach: 0.5,
  TyLePhatMat: 1.0,
  PhiXuLyMat: 20000,
});

/**
 * Lấy cấu hình hệ thống hiện tại từ collection CauHinh (Khoa: 'main').
 * Gộp với giá trị mặc định cho các trường còn thiếu hoặc giá trị ngoài khoảng hợp lệ.
 * Đọc trực tiếp từ database mỗi lần gọi (không cache dài hạn) để thay đổi cấu hình có hiệu lực tức thì.
 *
 * @returns {Promise<{
 *   SoSachToiDa: number,
 *   SoNgayMuon: number,
 *   HanNhanSach: number,
 *   PhiTreMoiNgay: number,
 *   TyLePhatRach: number,
 *   TyLePhatMat: number,
 *   PhiXuLyMat: number
 * }>}
 */
export const getSettings = async () => {
  const doc = await CauHinh.findOne({ Khoa: 'main' }).lean();

  const parseNumber = (val, min, max, defaultVal, isInteger = false) => {
    if (val === undefined || val === null || val === '') {
      return defaultVal;
    }
    const num = Number(val);
    if (Number.isNaN(num)) {
      return defaultVal;
    }
    if (isInteger && !Number.isInteger(num)) {
      return defaultVal;
    }
    if (min !== undefined && num < min) {
      return defaultVal;
    }
    if (max !== undefined && num > max) {
      return defaultVal;
    }
    return num;
  };

  return {
    SoSachToiDa: parseNumber(doc?.SoSachToiDa, 1, undefined, DEFAULT_SETTINGS.SoSachToiDa, true),
    SoNgayMuon: parseNumber(doc?.SoNgayMuon, 1, undefined, DEFAULT_SETTINGS.SoNgayMuon, true),
    HanNhanSach: parseNumber(doc?.HanNhanSach, 1, undefined, DEFAULT_SETTINGS.HanNhanSach, true),
    PhiTreMoiNgay: parseNumber(doc?.PhiTreMoiNgay, 0, undefined, DEFAULT_SETTINGS.PhiTreMoiNgay, false),
    TyLePhatRach: parseNumber(doc?.TyLePhatRach, 0, 1, DEFAULT_SETTINGS.TyLePhatRach, false),
    TyLePhatMat: parseNumber(doc?.TyLePhatMat, 0, undefined, DEFAULT_SETTINGS.TyLePhatMat, false),
    PhiXuLyMat: parseNumber(doc?.PhiXuLyMat, 0, undefined, DEFAULT_SETTINGS.PhiXuLyMat, false),
  };
};

export default {
  DEFAULT_SETTINGS,
  getSettings,
};
