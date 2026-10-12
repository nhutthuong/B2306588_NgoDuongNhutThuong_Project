import mongoose from 'mongoose';

const nhanVienSchema = new mongoose.Schema(
  {
    MSNV: {
      type: String,
      required: [true, 'Mã số nhân viên là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    HoTenNV: {
      type: String,
      required: [true, 'Họ tên nhân viên là bắt buộc'],
      trim: true,
      maxlength: [80, 'Họ tên nhân viên không được vượt quá 80 ký tự'],
    },
    Password: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      select: false,
    },
    ChucVu: {
      type: String,
      trim: true,
      default: 'Thủ thư',
    },
    VaiTro: {
      type: String,
      enum: {
        values: ['admin', 'thuthu'],
        message: 'Vai trò phải là admin hoặc thuthu',
      },
      default: 'thuthu',
    },
    DiaChi: {
      type: String,
      trim: true,
      maxlength: [200, 'Địa chỉ không được vượt quá 200 ký tự'],
      default: '',
    },
    SoDienThoai: {
      type: String,
      trim: true,
      match: [
        /^(0|\+84)\d{9}$/,
        'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
      ],
    },
    TrangThai: {
      type: String,
      enum: {
        values: ['HoatDong', 'BiKhoa'],
        message: 'Trạng thái phải là HoatDong hoặc BiKhoa',
      },
      default: 'HoatDong',
    },
    SoLanSaiMatKhau: {
      type: Number,
      default: 0,
      min: 0,
    },
    KhoaDen: {
      type: Date,
      default: null,
    },
    BatBuocDoiMatKhau: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'NhanVien',
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.Password;
        delete ret.SoLanSaiMatKhau;
        delete ret.KhoaDen;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

export const NhanVien = mongoose.model('NhanVien', nhanVienSchema);
export default NhanVien;
