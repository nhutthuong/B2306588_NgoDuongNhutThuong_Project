import CauHinh from '../models/CauHinh.js';
import { logAction } from './audit.service.js';

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

/**
 * Cập nhật cấu hình hệ thống (CHỈ Admin)
 * @param {object} payload - Các trường cấu hình cần cập nhật
 * @param {object} [adminUser={}] - Thông tin admin thực hiện { msnv }
 * @param {string} [ip=''] - IP client
 * @returns {Promise<object>} Cấu hình sau cập nhật
 */
export const updateSettings = async (payload = {}, adminUser = {}, ip = '') => {
  const current = await getSettings();

  const updateDoc = {
    SoSachToiDa: payload.SoSachToiDa !== undefined ? payload.SoSachToiDa : current.SoSachToiDa,
    SoNgayMuon: payload.SoNgayMuon !== undefined ? payload.SoNgayMuon : current.SoNgayMuon,
    HanNhanSach: payload.HanNhanSach !== undefined ? payload.HanNhanSach : current.HanNhanSach,
    PhiTreMoiNgay: payload.PhiTreMoiNgay !== undefined ? payload.PhiTreMoiNgay : current.PhiTreMoiNgay,
    TyLePhatRach: payload.TyLePhatRach !== undefined ? payload.TyLePhatRach : current.TyLePhatRach,
    TyLePhatMat: payload.TyLePhatMat !== undefined ? payload.TyLePhatMat : current.TyLePhatMat,
    PhiXuLyMat: payload.PhiXuLyMat !== undefined ? payload.PhiXuLyMat : current.PhiXuLyMat,
  };

  await CauHinh.findOneAndUpdate(
    { Khoa: 'main' },
    { $set: updateDoc },
    { upsert: true, new: true, runValidators: true }
  );

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'CAP_NHAT_CAU_HINH',
    doiTuong: 'CauHinh',
    maDoiTuong: 'main',
    chiTiet: {
      cacTruongThayDoi: Object.keys(payload),
      giaTriMoi: payload,
    },
    ip,
  });

  return getSettings();
};

/**
 * Khôi phục cấu hình hệ thống về mặc định (CHỈ Admin)
 * @param {object} [adminUser={}]
 * @param {string} [ip='']
 * @returns {Promise<object>}
 */
export const resetSettings = async (adminUser = {}, ip = '') => {
  await CauHinh.findOneAndUpdate(
    { Khoa: 'main' },
    { $set: DEFAULT_SETTINGS },
    { upsert: true, new: true, runValidators: true }
  );

  await logAction({
    msnv: adminUser.msnv,
    hanhDong: 'KHOI_PHUC_CAU_HINH',
    doiTuong: 'CauHinh',
    maDoiTuong: 'main',
    chiTiet: {
      giaTriMacDinh: DEFAULT_SETTINGS,
    },
    ip,
  });

  return getSettings();
};

export default {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  resetSettings,
};
