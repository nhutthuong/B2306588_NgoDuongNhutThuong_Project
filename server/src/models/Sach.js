import mongoose from 'mongoose';

const sachSchema = new mongoose.Schema(
  {
    MaSach: {
      type: String,
      required: [true, 'Mã sách là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    TenSach: {
      type: String,
      required: [true, 'Tên sách là bắt buộc'],
      trim: true,
      maxlength: [200, 'Tên sách không được vượt quá 200 ký tự'],
    },
    DonGia: {
      type: Number,
      required: [true, 'Đơn giá là bắt buộc'],
      min: [0, 'Đơn giá không được nhỏ hơn 0'],
    },
    SoQuyen: {
      type: Number,
      required: [true, 'Số quyển là bắt buộc'],
      min: [0, 'Số quyển không được nhỏ hơn 0'],
      validate: {
        validator: Number.isInteger,
        message: 'Số quyển phải là số nguyên',
      },
    },
    SoQuyenConLai: {
      type: Number,
      required: [true, 'Số quyển còn lại là bắt buộc'],
      min: [0, 'Số quyển còn lại không được nhỏ hơn 0'],
      validate: {
        validator: function (v) {
          if (!Number.isInteger(v)) return false;
          if (this.SoQuyen !== undefined && v > this.SoQuyen) return false;
          return true;
        },
        message: 'Số quyển còn lại phải là số nguyên và không vượt quá tổng số quyển',
      },
    },
    NamXuatBan: {
      type: Number,
      validate: {
        validator: function (v) {
          if (v === undefined || v === null) return true;
          return Number.isInteger(v) && v >= 1000 && v <= new Date().getFullYear();
        },
        message: 'Năm xuất bản phải là số nguyên từ năm 1000 đến năm hiện tại',
      },
    },
    MaNXB: {
      type: String,
      required: [true, 'Mã nhà xuất bản là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    NguonGocTacGia: {
      type: String,
      required: [true, 'Nguồn gốc/Tác giả là bắt buộc'],
      trim: true,
      maxlength: [150, 'Nguồn gốc/Tác giả không được vượt quá 150 ký tự'],
    },
    TheLoai: {
      type: String,
      trim: true,
      default: '',
    },
    MoTa: {
      type: String,
      trim: true,
      maxlength: [2000, 'Mô tả không được vượt quá 2000 ký tự'],
      default: '',
    },
    AnhBia: {
      type: String,
      trim: true,
      default: '',
    },
    DaXoa: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'Sach',
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Virtual populate NhaXuatBan qua MaNXB (khong dung ObjectId ref)
sachSchema.virtual('NhaXuatBan', {
  ref: 'NhaXuatBan',
  localField: 'MaNXB',
  foreignField: 'MaNXB',
  justOne: true,
});

// Text index phuc vu tim kiem sach theo ten va tac gia
sachSchema.index({ TenSach: 'text', NguonGocTacGia: 'text' });

// Index ho tro truy van loc theo NXB va trang thai xoa mem
sachSchema.index({ MaNXB: 1 });
sachSchema.index({ DaXoa: 1 });

export const Sach = mongoose.model('Sach', sachSchema);
export default Sach;
