import mongoose from 'mongoose';

const nhaXuatBanSchema = new mongoose.Schema(
  {
    MaNXB: {
      type: String,
      required: [true, 'Mã nhà xuất bản là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    TenNXB: {
      type: String,
      required: [true, 'Tên nhà xuất bản là bắt buộc'],
      trim: true,
      maxlength: [150, 'Tên nhà xuất bản không được vượt quá 150 ký tự'],
    },
    DiaChi: {
      type: String,
      trim: true,
      maxlength: [200, 'Địa chỉ không được vượt quá 200 ký tự'],
      default: '',
    },
  },
  {
    collection: 'NhaXuatBan',
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

// Unique khong phan biet hoa thuong cho TenNXB theo DATABASE.md §3.2
nhaXuatBanSchema.index(
  { TenNXB: 1 },
  {
    unique: true,
    collation: { locale: 'vi', strength: 2 },
  }
);

export const NhaXuatBan = mongoose.model('NhaXuatBan', nhaXuatBanSchema);
export default NhaXuatBan;
