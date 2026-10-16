import mongoose from 'mongoose';

const theoDoiMuonSachSchema = new mongoose.Schema(
  {
    MaDocGia: {
      type: String,
      required: [true, 'Mã độc giả là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    MaSach: {
      type: String,
      required: [true, 'Mã sách là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    NgayMuon: {
      type: Date,
      default: null,
    },
    NgayTra: {
      type: Date,
      default: null,
    },
    NgayDangKy: {
      type: Date,
      default: Date.now,
    },
    TrangThai: {
      type: String,
      enum: {
        values: ['ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy'],
        message: 'Trạng thái mượn sách không hợp lệ',
      },
      default: 'ChoDuyet',
    },
    NgayDuyet: {
      type: Date,
      default: null,
    },
    HanNhanSach: {
      type: Date,
      default: null,
    },
    HanTra: {
      type: Date,
      default: null,
    },
    LyDoTuChoi: {
      type: String,
      trim: true,
      default: '',
    },
    MSNVDuyet: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    MSNVGiao: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    MSNVNhanTra: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    TinhTrangTra: {
      type: String,
      enum: {
        values: ['BinhThuong', 'Rach', 'Mat'],
        message: 'Tình trạng trả phải là BinhThuong, Rach hoặc Mat',
      },
    },
    MucRach: {
      type: String,
      enum: {
        values: ['Nhe', 'Nang'],
        message: 'Mức độ rách phải là Nhe hoặc Nang',
      },
    },
    LoaiBoKhoiKho: {
      type: Boolean,
      default: false,
    },
    PhiTre: {
      type: Number,
      default: 0,
      min: [0, 'Phí trễ không được nhỏ hơn 0'],
    },
    TienPhat: {
      type: Number,
      default: 0,
      min: [0, 'Tiền phạt không được nhỏ hơn 0'],
    },
    GhiChuPhat: {
      type: String,
      trim: true,
      default: '',
    },
    TrangThaiPhat: {
      type: String,
      enum: {
        values: ['KhongPhat', 'ChuaThanhToan', 'DaThanhToan'],
        message: 'Trạng thái phạt không hợp lệ',
      },
      default: 'KhongPhat',
    },
    NgayThanhToanPhat: {
      type: Date,
      default: null,
    },
    MSNVThuPhat: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    collection: 'TheoDoiMuonSach',
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

// Virtual populate DocGia va Sach qua ma nghiep vu (khong dung ObjectId ref)
theoDoiMuonSachSchema.virtual('DocGia', {
  ref: 'DocGia',
  localField: 'MaDocGia',
  foreignField: 'MaDocGia',
  justOne: true,
});

theoDoiMuonSachSchema.virtual('Sach', {
  ref: 'Sach',
  localField: 'MaSach',
  foreignField: 'MaSach',
  justOne: true,
});

theoDoiMuonSachSchema.virtual('NhanVienDuyet', {
  ref: 'NhanVien',
  localField: 'MSNVDuyet',
  foreignField: 'MSNV',
  justOne: true,
});

theoDoiMuonSachSchema.virtual('NhanVienGiao', {
  ref: 'NhanVien',
  localField: 'MSNVGiao',
  foreignField: 'MSNV',
  justOne: true,
});

theoDoiMuonSachSchema.virtual('NhanVienNhanTra', {
  ref: 'NhanVien',
  localField: 'MSNVNhanTra',
  foreignField: 'MSNV',
  justOne: true,
});

theoDoiMuonSachSchema.virtual('NhanVienThuPhat', {
  ref: 'NhanVien',
  localField: 'MSNVThuPhat',
  foreignField: 'MSNV',
  justOne: true,
});

// Index ho tro dem gioihan, lich su muon
theoDoiMuonSachSchema.index({ MaDocGia: 1, TrangThai: 1 });
theoDoiMuonSachSchema.index({ MaSach: 1, TrangThai: 1 });
theoDoiMuonSachSchema.index({ TrangThai: 1, HanTra: 1 });

// Partial unique index chong muon trung cung mot dau sach khi dang chiem cho
theoDoiMuonSachSchema.index(
  { MaDocGia: 1, MaSach: 1 },
  {
    unique: true,
    partialFilterExpression: {
      TrangThai: { $in: ['ChoDuyet', 'DaDuyet', 'DangMuon'] },
    },
  }
);

// Index ho tro thong ke theo thoi gian
theoDoiMuonSachSchema.index({ NgayDangKy: -1 });
theoDoiMuonSachSchema.index({ NgayMuon: -1 });

export const TheoDoiMuonSach = mongoose.model('TheoDoiMuonSach', theoDoiMuonSachSchema);
export default TheoDoiMuonSach;
