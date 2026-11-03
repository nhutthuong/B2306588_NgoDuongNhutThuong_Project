import mongoose from 'mongoose';

const keSachSchema = new mongoose.Schema(
  {
    MaKe: {
      type: String,
      required: [true, 'Mã kệ sách là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    TenKe: {
      type: String,
      required: [true, 'Tên kệ sách là bắt buộc'],
      trim: true,
      maxlength: [100, 'Tên kệ sách không được vượt quá 100 ký tự'],
    },
    KhuVuc: {
      type: String,
      required: [true, 'Khu vực đặt kệ là bắt buộc'],
      trim: true,
      maxlength: [100, 'Khu vực không được vượt quá 100 ký tự'],
    },
    SoNgan: {
      type: Number,
      required: [true, 'Số ngăn là bắt buộc'],
      default: 5,
      min: [1, 'Số ngăn tối thiểu là 1'],
      max: [20, 'Số ngăn tối đa là 20'],
      validate: {
        validator: Number.isInteger,
        message: 'Số ngăn phải là số nguyên',
      },
    },
  },
  {
    collection: 'KeSach',
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

keSachSchema.index({ KhuVuc: 1 });
keSachSchema.index({ TenKe: 1 });

export const KeSach = mongoose.model('KeSach', keSachSchema);
export default KeSach;

