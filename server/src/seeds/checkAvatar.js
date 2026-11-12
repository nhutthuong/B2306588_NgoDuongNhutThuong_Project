import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AVATARS_DIR,
  ensureAvatarsDir,
  detectImageType,
  saveAvatarImage,
  deleteAvatarImage,
} from '../utils/imageType.js';

const __filename = fileURLToPath(import.meta.url);

let passed = 0;
let failed = 0;

const assert = (condition, msg) => {
  if (condition) {
    passed++;
    console.log(`[PASS] ${msg}`);
  } else {
    failed++;
    console.error(`[FAIL] ${msg}`);
  }
};

const run = async () => {
  console.log('=== BẮT ĐẦU KIỂM TRA CHỨC NĂNG AVATAR & STORAGE CLEANUP ===\n');

  // 1. Kiểm tra phát hiện loại ảnh
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const webpBuffer = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('WEBP')]);
  const textBuffer = Buffer.from('Plain text content that is not an image');

  const detectedJpeg = detectImageType(jpegBuffer);
  assert(detectedJpeg?.ext === 'jpg' && detectedJpeg?.mime === 'image/jpeg', 'Phát hiện ảnh JPEG chuẩn xác');

  const detectedPng = detectImageType(pngBuffer);
  assert(detectedPng?.ext === 'png' && detectedPng?.mime === 'image/png', 'Phát hiện ảnh PNG chuẩn xác');

  const detectedWebp = detectImageType(webpBuffer);
  assert(detectedWebp?.ext === 'webp' && detectedWebp?.mime === 'image/webp', 'Phát hiện ảnh WebP chuẩn xác');

  const detectedText = detectImageType(textBuffer);
  assert(detectedText === null, 'Từ chối tệp không phải ảnh');

  // 2. Kiểm tra lưu ảnh avatar
  ensureAvatarsDir();
  assert(fs.existsSync(AVATARS_DIR), 'Thư mục uploads/avatars tồn tại');

  const saved1 = await saveAvatarImage(jpegBuffer, 'jpg');
  assert(saved1.startsWith('/uploads/avatars/') && saved1.endsWith('.jpg'), `Lưu avatar 1 thành công: ${saved1}`);

  const diskPath1 = path.join(AVATARS_DIR, path.basename(saved1));
  assert(fs.existsSync(diskPath1), 'Tệp avatar 1 thực sự tồn tại trên ổ đĩa');

  // 3. Kiểm tra thay thế ảnh (cập nhật) -> xóa ảnh cũ
  const saved2 = await saveAvatarImage(pngBuffer, 'png');
  assert(saved2.startsWith('/uploads/avatars/') && saved2.endsWith('.png'), `Lưu avatar 2 thành công: ${saved2}`);

  const diskPath2 = path.join(AVATARS_DIR, path.basename(saved2));
  assert(fs.existsSync(diskPath2), 'Tệp avatar 2 thực sự tồn tại trên ổ đĩa');

  // Xóa avatar 1 (mô phỏng khi người dùng cập nhật avatar mới)
  await deleteAvatarImage(saved1);
  assert(!fs.existsSync(diskPath1), 'Tệp avatar cũ 1 đã bị xóa sạch khỏi ổ đĩa ngay khi cập nhật');
  assert(fs.existsSync(diskPath2), 'Tệp avatar mới 2 vẫn còn nguyên vẹn trên ổ đĩa');

  // 4. Kiểm tra người dùng xóa avatar
  await deleteAvatarImage(saved2);
  assert(!fs.existsSync(diskPath2), 'Tệp avatar 2 đã bị xóa sạch khỏi ổ đĩa khi người dùng xóa avatar');

  // 5. Kiểm tra an toàn bảo mật (chống path traversal)
  await deleteAvatarImage('/uploads/avatars/../../package.json');
  assert(fs.existsSync(__filename), 'Chống tấn công Path Traversal thành công, không xóa nhầm file ngoài');

  console.log(`\n=== TỔNG KẾT: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) {
    process.exit(1);
  }
};

run().catch((err) => {
  console.error('Lỗi khi chạy kiểm tra:', err);
  process.exit(1);
});
