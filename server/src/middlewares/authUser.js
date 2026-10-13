import { verifyAccessToken } from '../services/auth.service.js';
import DocGia from '../models/DocGia.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Middleware xác thực độc giả cho các route /api/user/*
 * - Đọc header Authorization: Bearer <token>
 * - Xác thực JWT với type 'docgia' (secret JWT_USER_SECRET, aud 'user')
 * - Nạp lại độc giả từ DB theo MaDocGia để kiểm tra trạng thái hoạt động thực tế
 * - Gắn req.user = { maDocGia, hoTen, email } phục vụ chống IDOR
 */
export const authUser = asyncHandler(async (req, res, next) => {
  // 1. Đọc header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Mã xác thực không được cung cấp hoặc sai định dạng'
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Mã xác thực không được để trống');
  }

  // 2. Xác thực JWT Access Token cho độc giả (aud: 'user')
  const decoded = verifyAccessToken(token, 'docgia');

  // 3. Nạp lại độc giả từ DB theo MaDocGia trong claim sub (lean)
  const docGia = await DocGia.findOne({ MaDocGia: decoded.sub })
    .select('MaDocGia HoLot Ten Email TrangThai')
    .lean();

  if (!docGia) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Tài khoản độc giả không tồn tại hoặc đã bị xóa'
    );
  }

  if (docGia.TrangThai === 'BiKhoa') {
    throw new ApiError(
      403,
      'ACCOUNT_LOCKED',
      'Tài khoản độc giả đã bị khóa. Vui lòng liên hệ thủ thư để được hỗ trợ'
    );
  }

  // 4. Gắn req.user (Mã độc giả của mọi API sau này CHỈ lấy từ req.user, chống IDOR)
  req.user = {
    maDocGia: docGia.MaDocGia,
    hoTen: `${docGia.HoLot} ${docGia.Ten}`.trim(),
    email: docGia.Email,
  };

  next();
});

export default authUser;
