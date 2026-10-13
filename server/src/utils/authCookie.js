import env from '../config/env.js';

export const COOKIE_NAMES = {
  docgia: 'rt_user',
  nhanvien: 'rt_admin',
};

export const COOKIE_PATHS = {
  docgia: '/api/user/auth',
  nhanvien: '/api/admin/auth',
};

/**
 * Thiet lap cookie refresh token an toan theo CONVENTIONS.md §5.5 va SYSTEM.md §1
 * @param {import('express').Response} res - Express Response object
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @param {string} rawToken - Token refresh dang tho (base64url)
 */
export const setRefreshCookie = (res, type, rawToken) => {
  const cookieName = COOKIE_NAMES[type];
  const cookiePath = COOKIE_PATHS[type];

  if (!cookieName || !cookiePath) {
    throw new Error(`Loai tai khoan khong hop le: ${type}`);
  }

  const maxAge = env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

  res.cookie(cookieName, rawToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.COOKIE_SECURE,
    path: cookiePath,
    maxAge,
  });
};

/**
 * Xoa cookie refresh token khi dang xuat hoac refresh that bai
 * @param {import('express').Response} res - Express Response object
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 */
export const clearRefreshCookie = (res, type) => {
  const cookieName = COOKIE_NAMES[type];
  const cookiePath = COOKIE_PATHS[type];

  if (!cookieName || !cookiePath) {
    throw new Error(`Loai tai khoan khong hop le: ${type}`);
  }

  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.COOKIE_SECURE,
    path: cookiePath,
  });
};

/**
 * Doc refresh token tu request cookies
 * @param {import('express').Request} req - Express Request object
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @returns {string|null} - Chuoi rawToken hoac null neu khong co
 */
export const getRefreshCookie = (req, type) => {
  const cookieName = COOKIE_NAMES[type];
  return req.cookies?.[cookieName] || null;
};

export default {
  COOKIE_NAMES,
  COOKIE_PATHS,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookie,
};
