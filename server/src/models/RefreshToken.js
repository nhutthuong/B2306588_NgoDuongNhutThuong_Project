import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    ChuSoHuu: {
      type: String,
      required: [true, 'Chủ sở hữu token là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    LoaiTaiKhoan: {
      type: String,
      required: [true, 'Loại tài khoản là bắt buộc'],
      enum: {
        values: ['docgia', 'nhanvien'],
        message: 'Loại tài khoản phải là docgia hoặc nhanvien',
      },
    },
    TokenHash: {
      type: String,
      required: [true, 'Token hash là bắt buộc'],
      unique: true,
      trim: true,
    },
    HetHan: {
      type: Date,
      required: [true, 'Thời điểm hết hạn là bắt buộc'],
    },
    ThuHoi: {
      type: Boolean,
      default: false,
    },
    ThayBangHash: {
      type: String,
      default: null,
      trim: true,
    },
    IP: {
      type: String,
      default: '',
      trim: true,
    },
    UserAgent: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    collection: 'RefreshToken',
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

// TTL index tu dong xoa document khi den thoi diem HetHan theo DATABASE.md §3.7
refreshTokenSchema.index({ HetHan: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
