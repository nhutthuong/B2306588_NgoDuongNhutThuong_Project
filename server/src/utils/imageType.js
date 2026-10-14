import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Thư mục lưu trữ ảnh bìa: server/uploads/covers (nằm ngoài src)
export const COVERS_DIR = path.resolve(__dirname, '../../uploads/covers');

// Regex kiểm tra tên file an toàn: chỉ gồm ký tự hex, dấu gạch nối và đuôi jpg/png/webp
export const SAFE_FILENAME_REGEX = /^[a-f0-9-]+\.(jpg|png|webp)$/i;

/**
 * Đảm bảo thư mục lưu trữ ảnh bìa tồn tại
 */
export const ensureCoversDir = () => {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }
};

/**
 * Kiểm tra magic bytes của buffer để xác định loại ảnh thực sự
 * Chỉ chấp nhận:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WebP: RIFF....WEBP
 *
 * @param {Buffer} buffer
 * @returns {{ ext: 'jpg'|'png'|'webp', mime: string }|null}
 */
export const detectImageType = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // 1. Kiểm tra JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // 2. Kiểm tra PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // 3. Kiểm tra WebP: RIFF (bytes 0-3) và WEBP (bytes 8-11)
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }

  return null;
};

/**
 * Lưu file ảnh vào đĩa với tên ngẫu nhiên
 *
 * @param {Buffer} buffer
 * @param {'jpg'|'png'|'webp'} ext
 * @returns {Promise<string>} Đường dẫn lưu trong DB dạng /uploads/covers/<filename>
 */
export const saveCoverImage = async (buffer, ext) => {
  ensureCoversDir();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(COVERS_DIR, filename);

  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/covers/${filename}`;
};

/**
 * Xóa file ảnh an toàn, chống path traversal
 *
 * @param {string} storedPath - Đường dẫn dạng /uploads/covers/<filename> hoặc tên file
 */
export const deleteCoverImage = async (storedPath) => {
  if (!storedPath || typeof storedPath !== 'string') return;

  const filename = path.basename(storedPath);
  if (!SAFE_FILENAME_REGEX.test(filename)) {
    console.warn(`[UPLOAD_SECURITY] Bỏ qua xóa tệp do tên không hợp lệ: ${filename}`);
    return;
  }

  const fullPath = path.join(COVERS_DIR, filename);
  const resolved = path.resolve(fullPath);

  // Đảm bảo đường dẫn nằm hoàn toàn trong COVERS_DIR
  if (!resolved.startsWith(path.resolve(COVERS_DIR))) {
    console.warn(`[UPLOAD_SECURITY] Phát hiện nguy cơ path traversal khi xóa: ${storedPath}`);
    return;
  }

  try {
    await fs.promises.unlink(resolved);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[UPLOAD_WARN] Không thể xóa ảnh cũ (${resolved}): ${err.message}`);
    }
  }
};

export default {
  COVERS_DIR,
  SAFE_FILENAME_REGEX,
  ensureCoversDir,
  detectImageType,
  saveCoverImage,
  deleteCoverImage,
};
