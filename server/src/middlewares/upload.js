import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Su dung memoryStorage de kiem tra magic bytes trong bo nho truoc khi ghi dia
const storage = multer.memoryStorage();

/**
 * Bo loc file: chi chap nhan duy nhat truong file co ten 'AnhBia'
 */
const fileFilter = (req, file, cb) => {
  if (file.fieldname !== 'AnhBia') {
    return cb(
      new ApiError(
        400,
        'VALIDATION_ERROR',
        `Trường tải lên không hợp lệ: '${file.fieldname}'. Chỉ chấp nhận trường tệp 'AnhBia'`
      )
    );
  }
  cb(null, true);
};

export const uploadCover = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1, // Toi da 1 file
    fields: 20, // Gioi han so luong truong text
  },
  fileFilter,
});

export default uploadCover;
