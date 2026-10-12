import mongoose from 'mongoose';

const docGiaSchema = new mongoose.Schema(
  {
    MaDocGia: {
      type: String,
      required: [true, 'Mã độc giả là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    HoLot: {
      type: String,
      required: [true, 'Họ lót là bắt buộc'],
      trim: true,
      maxlength: [50, 'Họ lót không được vượt quá 50 ký tự'],
    },
    Ten: {
      type: String,
      required: [true, 'Tên là bắt buộc'],
      trim: true,
      maxlength: [30, 'Tên không được vượt quá 30 ký tự'],
    },
    NgaySinh: {
      type: Date,
      required: [true, 'Ngày sinh là bắt buộc'],
      validate: {
        validator: function (v) {
          return !v || v < new Date();
        },
        message: 'Ngày sinh phải nhỏ hơn ngày hiện tại',
      },
    },
    Phai: {
      type: String,
      required: [true, 'Phái là bắt buộc'],
      enum: {
        values: ['Nam', 'Nu', 'Khac'],
        message: 'Phái phải là Nam, Nu hoặc Khac',
      },
      default: 'Nam',
    },
    DiaChi: {
      type: String,
      trim: true,
      maxlength: [200, 'Địa chỉ không được vượt quá 200 ký tự'],
      default: '',
    },
    DienThoai: {
      type: String,
      trim: true,
      match: [
        /^(0|\+84)\d{9}$/,
        'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)',
      ],
    },
    Email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email không đúng định dạng'],
    },
    Password: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      select: false,
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
    LanDangNhapCuoi: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'DocGia',
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

// Text index phuc vu tim kiem doc gia theo ho ten o trang admin
docGiaSchema.index({ HoLot: 'text', Ten: 'text' });

export const DocGia = mongoose.model('DocGia', docGiaSchema);
export default DocGia;
