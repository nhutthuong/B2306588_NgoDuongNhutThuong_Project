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

// Virtual liên kết thông tin nhân viên thực hiện (nếu là nhân viên)
nhatKySchema.virtual('NhanVien', {
  ref: 'NhanVien',
  localField: 'MSNV',
  foreignField: 'MSNV',
  justOne: true,
});

// Virtual liên kết thông tin độc giả (nếu là độc giả thực hiện)
nhatKySchema.virtual('DocGia', {
  ref: 'DocGia',
  localField: 'MSNV',
  foreignField: 'MaDocGia',
  justOne: true,
});

// Index phục vụ sắp xếp và lọc nhật ký
nhatKySchema.index({ createdAt: -1 });
nhatKySchema.index({ MSNV: 1, createdAt: -1 });
nhatKySchema.index({ HanhDong: 1, createdAt: -1 });
nhatKySchema.index({ DoiTuong: 1, createdAt: -1 });

export const NhatKy = mongoose.model('NhatKy', nhatKySchema);
export default NhatKy;
