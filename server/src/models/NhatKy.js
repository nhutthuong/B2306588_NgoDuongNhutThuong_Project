import mongoose from 'mongoose';

const nhatKySchema = new mongoose.Schema(
  {
    MSNV: {
      type: String,
      trim: true,
      uppercase: true,
    },
    HanhDong: {
      type: String,
      required: [true, 'Hành động là bắt buộc'],
      trim: true,
    },
    DoiTuong: {
      type: String,
      required: [true, 'Đối tượng tác động là bắt buộc'],
      trim: true,
    },
    MaDoiTuong: {
      type: String,
      trim: true,
    },
    ChiTiet: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    IP: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    collection: 'NhatKy',
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

// Index sap xep nhat ky theo thoi gian moi nhat
nhatKySchema.index({ createdAt: -1 });

export const NhatKy = mongoose.model('NhatKy', nhatKySchema);
export default NhatKy;
