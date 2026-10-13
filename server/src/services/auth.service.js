import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import DocGia from '../models/DocGia.js';
import NhanVien from '../models/NhanVien.js';
import RefreshToken from '../models/RefreshToken.js';

// Hang so cau hinh xac thuc va bao mat
export const AUTH_CONFIG = {
  BCRYPT_ROUNDS: 12,
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 15,
  TOKEN_ISSUER: 'QuanLyMuonSach',
  DUMMY_PASSWORD_HASH: '$2b$12$e80yq7hFvUqmX7hQ9H8p.e9H3vC8N2D1Q1oQ9Q9Q9Q9Q9Q9Q9Q9Q9',
};

/**
 * Bam mat khau bang bcrypt cost 12 theo CONVENTIONS.md §5.1
 * @param {string} plainPassword - Mat khau plaintext
 * @returns {Promise<string>} - Chuoi hash bcrypt
 */
export const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, AUTH_CONFIG.BCRYPT_ROUNDS);
};

/**
 * So sanh mat khau plaintext voi hash bcrypt
 * @param {string} plainPassword - Mat khau plaintext
 * @param {string} hashedPassword - Chuoi hash bcrypt trong DB
 * @returns {Promise<boolean>} - True neu khop
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Kiem tra do manh cua mat khau: toi thieu 8 ky tu, co chu hoa, chu thuong va so
 * @param {string} plainPassword - Mat khau can kiem tra
 * @returns {boolean} - True neu hop le
 * @throws {ApiError} - Neu khong dat yeu cau
 */
export const validatePasswordStrength = (plainPassword) => {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu là bắt buộc');
  }

  const hasMinLength = plainPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(plainPassword);
  const hasLowercase = /[a-z]/.test(plainPassword);
  const hasNumber = /[0-9]/.test(plainPassword);

  if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Mật khẩu phải có tối thiểu 8 ký tự, bao gồm ít nhất một chữ hoa, một chữ thường và một chữ số'
    );
  }

  return true;
};

/**
 * Ky JWT Access Token cho docgia hoac nhanvien
 * @param {object} account - Doi tuong tai khoan (DocGia hoac NhanVien)
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @param {object} [options={}] - Tuy chon (vd: expiresIn tuy bien cho test)
 * @returns {string} - Chuoi JWT access token
 */
export const signAccessToken = (account, type, options = {}) => {
  if (!account || !type) {
    throw new Error('Thiếu thông tin tài khoản hoặc loại tài khoản để ký token');
  }

  const isDocGia = type === 'docgia';
  const secret = isDocGia ? env.JWT_USER_SECRET : env.JWT_ADMIN_SECRET;
  const sub = isDocGia ? account.MaDocGia : account.MSNV;
  const role = isDocGia ? 'docgia' : account.VaiTro;
  const aud = isDocGia ? 'user' : 'admin';

  const payload = {
    sub,
    role,
    aud,
    iss: AUTH_CONFIG.TOKEN_ISSUER,
  };

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: options.expiresIn || env.JWT_ACCESS_EXPIRES,
  });
};

/**
 * Xac thuc va giai ma JWT Access Token
 * @param {string} token - Chuoi JWT token
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan mong doi
 * @returns {object} - Payload da giai ma
 * @throws {ApiError} - Neu token het han hoac khong hop le
 */
export const verifyAccessToken = (token, type) => {
  if (!token || typeof token !== 'string') {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Mã xác thực không được cung cấp');
  }

  const isDocGia = type === 'docgia';
  const secret = isDocGia ? env.JWT_USER_SECRET : env.JWT_ADMIN_SECRET;
  const expectedAud = isDocGia ? 'user' : 'admin';

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: expectedAud,
      issuer: AUTH_CONFIG.TOKEN_ISSUER,
    });
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn');
    }
    throw new ApiError(401, 'UNAUTHENTICATED', 'Mã xác thực không hợp lệ hoặc đã bị thay đổi');
  }
};

/**
 * Bam SHA-256 mot chuoi refresh token tho
 * @param {string} rawToken - Token dang tho
 * @returns {string} - Hash 64 ky tu hex
 */
export const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Cap moi Refresh Token, luu hash SHA-256 vao DB va tra ve token tho
 * @param {string} ownerId - MaDocGia hoac MSNV
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @param {object} [meta={}] - Thong tin kem theo ({ ip, userAgent })
 * @returns {Promise<string>} - Raw refresh token (chi tra ve 1 lan duy nhat)
 */
export const issueRefreshToken = async (ownerId, type, meta = {}) => {
  if (!ownerId || !type) {
    throw new Error('Thiếu thông tin chủ sở hữu hoặc loại tài khoản');
  }

  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    ChuSoHuu: ownerId,
    LoaiTaiKhoan: type,
    TokenHash: tokenHash,
    HetHan: expiresAt,
    ThuHoi: false,
    ThayBangHash: null,
    IP: meta.ip || '',
    UserAgent: meta.userAgent || '',
  });

  return rawToken;
};

/**
 * Thu hoi mot refresh token cu the
 * @param {string} rawToken - Token can thu hoi
 * @returns {Promise<boolean>}
 */
export const revokeRefreshToken = async (rawToken) => {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const tokenHash = hashToken(rawToken);
  const res = await RefreshToken.updateOne({ TokenHash: tokenHash }, { $set: { ThuHoi: true } });
  return res.modifiedCount > 0;
};

/**
 * Thu hoi toan bo refresh token cua mot chu so huu (khi phat hien tai su dung token)
 * @param {string} ownerId - MaDocGia hoac MSNV
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @returns {Promise<number>} - So luong token da thu hoi
 */
export const revokeAllForOwner = async (ownerId, type) => {
  if (!ownerId || !type) return 0;
  const res = await RefreshToken.updateMany(
    { ChuSoHuu: ownerId, LoaiTaiKhoan: type, ThuHoi: false },
    { $set: { ThuHoi: true } }
  );
  return res.modifiedCount;
};

/**
 * Rotate Refresh Token: kiem tra, danh dau da dung, thu hoi neu tai su dung va cap token moi
 * @param {string} rawToken - Token cu
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan mong doi
 * @param {object} [meta={}] - Thong tin kem theo ({ ip, userAgent })
 * @returns {Promise<{ newRawToken: string, ownerId: string, type: string }>}
 */
export const rotateRefreshToken = async (rawToken, type, meta = {}) => {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Mã làm mới phiên không hợp lệ');
  }

  const tokenHash = hashToken(rawToken);

  // 1. Tim token trong CSDL
  const existingDoc = await RefreshToken.findOne({ TokenHash: tokenHash });
  if (!existingDoc || existingDoc.LoaiTaiKhoan !== type) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Mã làm mới phiên không hợp lệ');
  }

  // 2. Neu da bi thu hoi: dau hieu bi danh cap va tai su dung -> thu hoi toan bo phien
  if (existingDoc.ThuHoi) {
    await revokeAllForOwner(existingDoc.ChuSoHuu, existingDoc.LoaiTaiKhoan);
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Phát hiện tái sử dụng phiên đã bị thu hồi. Toàn bộ phiên đăng nhập đã bị vô hiệu hóa vì lý do bảo mật'
    );
  }

  // 3. Neu token da het han
  if (existingDoc.HetHan <= new Date()) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại');
  }

  // 4. Hop le: chuan bi token moi
  const newRawToken = crypto.randomBytes(48).toString('base64url');
  const newTokenHash = hashToken(newRawToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  // Danh dau da thu hoi va ghi ThayBangHash bang thao tac nguyen tu
  // Dieu kien { ThuHoi: false } ngan chan 2 request dong thoi cung rotate thanh cong
  const updatedDoc = await RefreshToken.findOneAndUpdate(
    { TokenHash: tokenHash, ThuHoi: false, HetHan: { $gt: new Date() } },
    { $set: { ThuHoi: true, ThayBangHash: newTokenHash } },
    { new: false }
  );

  if (!updatedDoc) {
    // Request dong thoi den cham hon va bi tu choi
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Mã làm mới phiên không hợp lệ hoặc đã được sử dụng'
    );
  }

  // Luu token moi vao CSDL
  await RefreshToken.create({
    ChuSoHuu: updatedDoc.ChuSoHuu,
    LoaiTaiKhoan: updatedDoc.LoaiTaiKhoan,
    TokenHash: newTokenHash,
    HetHan: expiresAt,
    ThuHoi: false,
    ThayBangHash: null,
    IP: meta.ip || '',
    UserAgent: meta.userAgent || '',
  });

  return {
    newRawToken,
    ownerId: updatedDoc.ChuSoHuu,
    type: updatedDoc.LoaiTaiKhoan,
  };
};

/**
 * Xac thuc dang nhap voi co che chong brute-force va timing attack
 * @param {'docgia'|'nhanvien'} type - Loai tai khoan
 * @param {string} identifier - Email (docgia) hoac MSNV (nhanvien)
 * @param {string} plainPassword - Mat khau nguoi dung nhap
 * @returns {Promise<object>} - Thong tin tai khoan (da loai bo Password)
 */
export const authenticate = async (type, identifier, plainPassword) => {
  if (!type || !['docgia', 'nhanvien'].includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Loại tài khoản không hợp lệ');
  }

  if (
    !identifier ||
    typeof identifier !== 'string' ||
    !plainPassword ||
    typeof plainPassword !== 'string'
  ) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không chính xác');
  }

  const isDocGia = type === 'docgia';
  const Model = isDocGia ? DocGia : NhanVien;

  const query = isDocGia
    ? { Email: identifier.toLowerCase().trim() }
    : { MSNV: identifier.trim().toUpperCase() };

  const account = await Model.findOne(query).select('+Password');

  // 1. Khong tim thay tai khoan: van so sanh voi hash gia co dinh de chong timing attack
  if (!account) {
    await bcrypt.compare(plainPassword, AUTH_CONFIG.DUMMY_PASSWORD_HASH);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không chính xác');
  }

  // 2. Tai khoan bi khoa vinh vien
  if (account.TrangThai === 'BiKhoa') {
    throw new ApiError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên');
  }

  // 3. Tai khoan dang trong thoi gian bi khoa tam do sai mat khau qua 5 lan
  if (account.KhoaDen && account.KhoaDen > new Date()) {
    const remainingMinutes = Math.max(
      1,
      Math.ceil((account.KhoaDen.getTime() - Date.now()) / (60 * 1000))
    );
    throw new ApiError(
      423,
      'ACCOUNT_LOCKED',
      `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau ${remainingMinutes} phút`
    );
  }

  // 4. Kiem tra mat khau
  const isMatch = await verifyPassword(plainPassword, account.Password);

  // Sai mat khau
  if (!isMatch) {
    const updated = await Model.findByIdAndUpdate(
      account._id,
      { $inc: { SoLanSaiMatKhau: 1 } },
      { new: true }
    );

    if (updated.SoLanSaiMatKhau >= AUTH_CONFIG.MAX_FAILED_LOGIN_ATTEMPTS) {
      await Model.findByIdAndUpdate(account._id, {
        $set: {
          KhoaDen: new Date(Date.now() + AUTH_CONFIG.LOCKOUT_DURATION_MINUTES * 60 * 1000),
          SoLanSaiMatKhau: 0,
        },
      });
    }

    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không chính xác');
  }

  // Dung mat khau: dat lai so lan sai, go bo KhoaDen va cap nhat LanDangNhapCuoi (voi docgia)
  const updatePayload = {
    SoLanSaiMatKhau: 0,
    KhoaDen: null,
  };
  if (isDocGia) {
    updatePayload.LanDangNhapCuoi = new Date();
  }

  const authenticatedAccount = await Model.findByIdAndUpdate(
    account._id,
    { $set: updatePayload },
    { new: true }
  );

  return authenticatedAccount.toJSON();
};

export default {
  AUTH_CONFIG,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  signAccessToken,
  verifyAccessToken,
  hashToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForOwner,
  authenticate,
};
