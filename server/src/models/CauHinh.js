import mongoose from 'mongoose';

const cauHinhSchema = new mongoose.Schema(
  {
    Khoa: {
      type: String,
      required: true,
      unique: true,
      default: 'main',
      trim: true,
    },
    SoSachToiDa: {
      type: Number,
      required: [true, 'Số sách tối đa là bắt buộc'],
      default: 5,
      min: [1, 'Số sách mượn tối đa phải từ 1 quyển trở lên'],
    },
    SoNgayMuon: {
      type: Number,
      required: [true, 'Số ngày mượn là bắt buộc'],
      default: 14,
      min: [1, 'Số ngày mượn phải từ 1 ngày trở lên'],
    },
    HanNhanSach: {
      type: Number,
      required: [true, 'Hạn nhận sách là bắt buộc'],
      default: 2,
      min: [1, 'Hạn nhận sách sau khi duyệt phải từ 1 ngày trở lên'],
    },
    PhiTreMoiNgay: {
      type: Number,
      required: [true, 'Phí trễ mỗi ngày là bắt buộc'],
      default: 2000,
      min: [0, 'Phí trễ không được nhỏ hơn 0'],
    },
    TyLePhatRach: {
      type: Number,
      required: [true, 'Tỷ lệ phạt rách là bắt buộc'],
      default: 0.5,
      min: [0, 'Tỷ lệ phạt rách không được nhỏ hơn 0'],
      max: [1, 'Tỷ lệ phạt rách không được lớn hơn 1'],
    },
    TyLePhatMat: {
      type: Number,
      required: [true, 'Tỷ lệ phạt mất là bắt buộc'],
      default: 1.0,
      min: [0, 'Tỷ lệ phạt mất không được nhỏ hơn 0'],
    },
    PhiXuLyMat: {
      type: Number,
      required: [true, 'Phí xử lý mất sách là bắt buộc'],
      default: 20000,
      min: [0, 'Phí xử lý mất sách không được nhỏ hơn 0'],
    },
  },
  {
    collection: 'CauHinh',
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

export const CauHinh = mongoose.model('CauHinh', cauHinhSchema);
export default CauHinh;
