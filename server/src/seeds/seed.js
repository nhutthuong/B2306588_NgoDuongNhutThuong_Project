import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../config/db.js';
import env from '../config/env.js';
import {
  DocGia,
  Sach,
  NhaXuatBan,
  TheoDoiMuonSach,
  NhanVien,
  CauHinh,
  RefreshToken,
  NhatKy,
  Counter,
} from '../models/index.js';
import { nextCode, resetAllCounters } from '../services/code.service.js';

const runSeed = async () => {
  const isReset = process.argv.includes('--reset');

  try {
    await connectDB();

    // Tu choi reset neu dang o moi truong production
    if (isReset && env.isProduction) {
      console.error('Loi: Tu choi chay --reset tren moi truong production.');
      process.exit(1);
    }

    // Kiem tra du lieu da ton tai khi chay khong co --reset
    if (!isReset) {
      const existingAdmin = await NhanVien.findOne({ VaiTro: 'admin' });
      const existingConfig = await CauHinh.findOne({ Khoa: 'main' });

      if (existingAdmin || existingConfig) {
        console.log(
          'He thong da co du lieu, bo qua qua trinh seed (su dung "npm run seed:reset" de khoi tao lai).'
        );
        await printSummary();
        return;
      }
    }

    // Neu co co --reset: Xoa toan bo du lieu va dat lai counter ve 0
    if (isReset) {
      console.log('Dang xoa sach du lieu cu va dat lai cac bo dem...');
      await Promise.all([
        DocGia.deleteMany({}),
        Sach.deleteMany({}),
        NhaXuatBan.deleteMany({}),
        TheoDoiMuonSach.deleteMany({}),
        NhanVien.deleteMany({}),
        CauHinh.deleteMany({}),
        RefreshToken.deleteMany({}),
        NhatKy.deleteMany({}),
        Counter.deleteMany({}),
      ]);
      await resetAllCounters();
      console.log('Da lam sach toan bo du lieu cu.');
    }

    // 1. Tao CauHinh mac dinh (Khoa: 'main') theo SYSTEM.md §5
    console.log('Dang tao CauHinh mac dinh...');
    const defaultCauHinh = {
      Khoa: 'main',
      SoSachToiDa: 5,
      SoNgayMuon: 14,
      HanNhanSach: 2,
      PhiTreMoiNgay: 2000,
      TyLePhatRach: 0.5,
      TyLePhatMat: 1.0,
      PhiXuLyMat: 20000,
    };
    await CauHinh.findOneAndUpdate({ Khoa: 'main' }, defaultCauHinh, {
      upsert: true,
      new: true,
    });

    // 2. Tao tai khoan Admin mac dinh
    console.log('Dang tao tai khoan Admin...');
    if (!env.SEED_ADMIN_PASSWORD) {
      console.error(
        'Loi: Bien moi truong SEED_ADMIN_PASSWORD chua duoc cau hinh trong .env'
      );
      process.exit(1);
    }

    const adminMsnv = await nextCode('NhanVien');
    const adminPasswordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12);

    await NhanVien.create({
      MSNV: adminMsnv,
      HoTenNV: 'Quản trị viên hệ thống',
      Password: adminPasswordHash,
      ChucVu: 'Quan tri vien',
      VaiTro: 'admin',
      DiaChi: 'Hệ thống thư viện',
      SoDienThoai: '0901234567',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
    });

    // 3. Neu la moi truong Production, dung lai tai day
    if (env.isProduction) {
      console.log(
        'Moi truong production: Chi khoi tao Admin va CauHinh mac dinh. Khong tao du lieu mau.'
      );
      await printSummary();
      return;
    }

    console.log('Dang tao du lieu mau cho moi truong phat trien (development)...');

    // 3.1. Tao 1 Nhan vien thu thu
    const thuthuMsnv = await nextCode('NhanVien');
    const thuthuPasswordHash = await bcrypt.hash(env.SEED_DEMO_PASSWORD, 12);
    await NhanVien.create({
      MSNV: thuthuMsnv,
      HoTenNV: 'Trần Thị Thủ Thư',
      Password: thuthuPasswordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      DiaChi: 'Quận Ninh Kiều, Cần Thơ',
      SoDienThoai: '0912345678',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    // 3.2. Tao 4 Nha xuat ban
    const publishersData = [
      {
        TenNXB: 'Nhà Xuất Bản Trẻ',
        DiaChi: '161B Lý Chính Thắng, Phường 7, Quận 3, TP. Hồ Chí Minh',
      },
      {
        TenNXB: 'Nhà Xuất Bản Kim Đồng',
        DiaChi: '55 Quang Trung, Hai Bà Trưng, Hà Nội',
      },
      {
        TenNXB: 'Nhà Xuất Bản Giáo Dục Việt Nam',
        DiaChi: '81 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội',
      },
      {
        TenNXB: 'Nhà Xuất Bản Tổng Hợp TP.HCM',
        DiaChi: '62 Nguyễn Thị Minh Khai, Đa Kao, Quận 1, TP. Hồ Chí Minh',
      },
    ];

    const createdNXB = [];
    for (const p of publishersData) {
      const maNXB = await nextCode('NhaXuatBan');
      const nxb = await NhaXuatBan.create({
        MaNXB: maNXB,
        TenNXB: p.TenNXB,
        DiaChi: p.DiaChi,
      });
      createdNXB.push(nxb);
    }

    // 3.3. Tao 20 dau sach that tieng Viet
    // Lưu ý về tính nhất quán kho:
    // S0003 có 1 phiếu DaDuyet -> SoQuyen = 6, SoQuyenConLai = 5
    // S0004 có 1 phiếu DaDuyet -> SoQuyen = 15, SoQuyenConLai = 14
    // S0005 có 1 phiếu DangMuon -> SoQuyen = 12, SoQuyenConLai = 11
    // S0006 có 1 phiếu DangMuon -> SoQuyen = 8, SoQuyenConLai = 7
    // S0009 có 1 phiếu Mat -> SoQuyen đã giảm 1 còn 6, SoQuyenConLai = 6
    const booksData = [
      {
        TenSach: 'Cho Tôi Xin Một Vé Đi Tuổi Thơ',
        DonGia: 85000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        NamXuatBan: 2008,
        MaNXB: createdNXB[0].MaNXB,
        NguonGocTacGia: 'Nguyễn Nhật Ánh',
        TheLoai: 'Văn học thiếu nhi',
        MoTa: 'Tác phẩm đưa người đọc trở về những kỷ niệm êm đềm của tuổi thơ trong trẻo.',
      },
      {
        TenSach: 'Mắt Biếc',
        DonGia: 110000,
        SoQuyen: 8,
        SoQuyenConLai: 8,
        NamXuatBan: 1990,
        MaNXB: createdNXB[0].MaNXB,
        NguonGocTacGia: 'Nguyễn Nhật Ánh',
        TheLoai: 'Tiểu thuyết lãng mạn',
        MoTa: 'Chuyện tình buồn và khắc khoải của Ngạn dành cho cô bạn thanh mai trúc mã Hà Lan.',
      },
      {
        TenSach: 'Tôi Thấy Hoa Vàng Trên Cỏ Xanh',
        DonGia: 125000,
        SoQuyen: 6,
        SoQuyenConLai: 5, // Có 1 phiếu DaDuyet
        NamXuatBan: 2010,
        MaNXB: createdNXB[0].MaNXB,
        NguonGocTacGia: 'Nguyễn Nhật Ánh',
        TheLoai: 'Truyện dài',
        MoTa: 'Bức tranh làng quê nghèo êm đềm qua góc nhìn hồn nhiên của hai anh em Thiều và Tường.',
      },
      {
        TenSach: 'Dế Mèn Phiêu Lưu Ký',
        DonGia: 65000,
        SoQuyen: 15,
        SoQuyenConLai: 14, // Có 1 phiếu DaDuyet
        NamXuatBan: 1941,
        MaNXB: createdNXB[1].MaNXB,
        NguonGocTacGia: 'Tô Hoài',
        TheLoai: 'Truyện đồng thoại',
        MoTa: 'Hành trình phiêu lưu khám phá thế giới và học bài học đường đời của chú Dế Mèn.',
      },
      {
        TenSach: 'Đất Rừng Phương Nam',
        DonGia: 95000,
        SoQuyen: 12,
        SoQuyenConLai: 11, // Có 1 phiếu DangMuon
        NamXuatBan: 1957,
        MaNXB: createdNXB[1].MaNXB,
        NguonGocTacGia: 'Đoàn Giỏi',
        TheLoai: 'Phiêu lưu - Lịch sử',
        MoTa: 'Thiên nhiên hoang dã hào phóng và cuộc sống con người Nam Bộ qua bước chân lưu lạc của cậu bé An.',
      },
      {
        TenSach: 'Số Đỏ',
        DonGia: 80000,
        SoQuyen: 8,
        SoQuyenConLai: 7, // Có 1 phiếu DangMuon (quá hạn)
        NamXuatBan: 1936,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Vũ Trọng Phụng',
        TheLoai: 'Văn học trào phúng',
        MoTa: 'Kiệt tác trào phúng đả kích sâu cay xã hội tư sản thực dân nửa mùa Âu hóa.',
      },
      {
        TenSach: 'Tắt Đèn',
        DonGia: 70000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        NamXuatBan: 1939,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Ngô Tất Tố',
        TheLoai: 'Hiện thực phê phán',
        MoTa: 'Bức tranh đau thương về sưu cao thuế nặng và số phận khốn cùng của người nông dân trước Cách mạng.',
      },
      {
        TenSach: 'Chí Phèo',
        DonGia: 75000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        NamXuatBan: 1941,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Nam Cao',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Bi kịch tha hóa và khát vọng lương thiện bị cự tuyệt của người nông dân cùng quẫn.',
      },
      {
        TenSach: 'Vợ Nhặt',
        DonGia: 60000,
        SoQuyen: 6, // Gốc 7 cuốn, mất 1 cuốn nên SoQuyen giảm còn 6
        SoQuyenConLai: 6,
        NamXuatBan: 1954,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Kim Lân',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Khát vọng sống, niềm tin vào tương lai của những số phận nghèo khổ giữa nạn đói năm 1945.',
      },
      {
        TenSach: 'Chiếc Lược Ngà',
        DonGia: 55000,
        SoQuyen: 8,
        SoQuyenConLai: 8,
        NamXuatBan: 1966,
        MaNXB: createdNXB[3].MaNXB,
        NguonGocTacGia: 'Nguyễn Quang Sáng',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Tình phụ tử thiêng liêng và sâu sắc trong hoàn cảnh chiến tranh ác liệt.',
      },
      {
        TenSach: 'Lão Hạc',
        DonGia: 60000,
        SoQuyen: 8,
        SoQuyenConLai: 8,
        NamXuatBan: 1943,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Nam Cao',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Phẩm chất cao quý và nỗi đau xé lòng của người cha nghèo trước cảnh bế tắc cùng cực.',
      },
      {
        TenSach: 'Bỉ Vỏ',
        DonGia: 85000,
        SoQuyen: 6,
        SoQuyenConLai: 6,
        NamXuatBan: 1938,
        MaNXB: createdNXB[3].MaNXB,
        NguonGocTacGia: 'Nguyên Hồng',
        TheLoai: 'Hiện thực xã hội',
        MoTa: 'Bức tranh trần trụi về chốn giang hồ và số phận bi thảm của người phụ nữ thôn quê lạc bước chốn thành thị.',
      },
      {
        TenSach: 'Gió Lạnh Đầu Mùa',
        DonGia: 70000,
        SoQuyen: 9,
        SoQuyenConLai: 9,
        NamXuatBan: 1937,
        MaNXB: createdNXB[1].MaNXB,
        NguonGocTacGia: 'Thạch Lam',
        TheLoai: 'Văn học lãng mạn',
        MoTa: 'Những trang văn nhẹ nhàng, chan chứa lòng nhân ái và tình thương yêu giữa con người.',
      },
      {
        TenSach: 'Cánh Đồng Bất Tận',
        DonGia: 90000,
        SoQuyen: 7,
        SoQuyenConLai: 7,
        NamXuatBan: 2005,
        MaNXB: createdNXB[0].MaNXB,
        NguonGocTacGia: 'Nguyễn Ngọc Tư',
        TheLoai: 'Tập truyện ngắn',
        MoTa: 'Những phận đời trôi nổi, cay đắng và đau đáu tình người giữa mênh mang sông nước miền Tây.',
      },
      {
        TenSach: 'Bến Không Chồng',
        DonGia: 105000,
        SoQuyen: 6,
        SoQuyenConLai: 6,
        NamXuatBan: 1990,
        MaNXB: createdNXB[3].MaNXB,
        NguonGocTacGia: 'Dương Hướng',
        TheLoai: 'Tiểu thuyết',
        MoTa: 'Nỗi đau thời hậu chiến và số phận những người phụ nữ làng quê mòn mỏi chờ mong.',
      },
      {
        TenSach: 'Tuổi Thơ Dữ Dội',
        DonGia: 140000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        NamXuatBan: 1988,
        MaNXB: createdNXB[1].MaNXB,
        NguonGocTacGia: 'Phùng Quán',
        TheLoai: 'Tiểu thuyết lịch sử',
        MoTa: 'Bản hùng ca hào hùng và bi tráng về những chiến sĩ thiếu niên trinh sát trung đoàn Trần Cao Vân.',
      },
      {
        TenSach: 'Nhật Ký Trong Tù',
        DonGia: 75000,
        SoQuyen: 12,
        SoQuyenConLai: 12,
        NamXuatBan: 1960,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Hồ Chí Minh',
        TheLoai: 'Thơ ca',
        MoTa: 'Tập nhật ký bằng thơ ghi lại ý chí gang thép và tâm hồn ung dung vượt lên lao tù khắc nghiệt.',
      },
      {
        TenSach: 'Những Ngọn Gió Hua Tát',
        DonGia: 85000,
        SoQuyen: 6,
        SoQuyenConLai: 6,
        NamXuatBan: 1989,
        MaNXB: createdNXB[0].MaNXB,
        NguonGocTacGia: 'Nguyễn Huy Thiệp',
        TheLoai: 'Tập truyện ngắn',
        MoTa: 'Chùm truyện cổ tích thời hiện đại mang màu sắc huyền ảo vùng cao Tây Bắc.',
      },
      {
        TenSach: 'Rừng Xà Nu',
        DonGia: 65000,
        SoQuyen: 8,
        SoQuyenConLai: 8,
        NamXuatBan: 1965,
        MaNXB: createdNXB[2].MaNXB,
        NguonGocTacGia: 'Nguyễn Trung Thành',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Sức sống kiên cường, bất khuất của dân làng Xô Man và cây rừng Tây Nguyên trong kháng chiến.',
      },
      {
        TenSach: 'Mùa Lạc',
        DonGia: 60000,
        SoQuyen: 7,
        SoQuyenConLai: 7,
        NamXuatBan: 1960,
        MaNXB: createdNXB[3].MaNXB,
        NguonGocTacGia: 'Nguyễn Khải',
        TheLoai: 'Truyện ngắn',
        MoTa: 'Sự hồi sinh kỳ diệu của con người trên nông trường Điện Biên sau những đau thương mất mát.',
      },
    ];

    const createdBooks = [];
    for (const b of booksData) {
      const maSach = await nextCode('Sach');
      const book = await Sach.create({
        MaSach: maSach,
        ...b,
      });
      createdBooks.push(book);
    }

    // 3.4. Tao 5 doc gia mau voi mat khau tu SEED_DEMO_PASSWORD
    const readersData = [
      {
        HoLot: 'Nguyễn Văn',
        Ten: 'An',
        NgaySinh: new Date('1998-05-15'),
        Phai: 'Nam',
        DiaChi: 'Phường An Khánh, Quận Ninh Kiều, Cần Thơ',
        DienThoai: '0912345001',
        Email: 'an.nguyen@example.com',
      },
      {
        HoLot: 'Trần Thị',
        Ten: 'Bình',
        NgaySinh: new Date('2000-08-20'),
        Phai: 'Nu',
        DiaChi: 'Phường Hưng Phú, Quận Cái Răng, Cần Thơ',
        DienThoai: '0912345002',
        Email: 'binh.tran@example.com',
      },
      {
        HoLot: 'Lê Hoàng',
        Ten: 'Cường',
        NgaySinh: new Date('1999-11-10'),
        Phai: 'Nam',
        DiaChi: 'Phường An Thới, Quận Bình Thủy, Cần Thơ',
        DienThoai: '0912345003',
        Email: 'cuong.le@example.com',
      },
      {
        HoLot: 'Phạm Minh',
        Ten: 'Đức',
        NgaySinh: new Date('2001-03-25'),
        Phai: 'Nam',
        DiaChi: 'Phường Châu Văn Liêm, Quận Ô Môn, Cần Thơ',
        DienThoai: '0912345004',
        Email: 'duc.pham@example.com',
      },
      {
        HoLot: 'Hoàng Thuỳ',
        Ten: 'Linh',
        NgaySinh: new Date('2002-07-07'),
        Phai: 'Nu',
        DiaChi: 'Phường Thốt Nốt, Quận Thốt Nốt, Cần Thơ',
        DienThoai: '0912345005',
        Email: 'linh.hoang@example.com',
      },
    ];

    const demoPasswordHash = await bcrypt.hash(env.SEED_DEMO_PASSWORD, 12);
    const createdReaders = [];
    for (const r of readersData) {
      const maDocGia = await nextCode('DocGia');
      const reader = await DocGia.create({
        MaDocGia: maDocGia,
        ...r,
        Password: demoPasswordHash,
        TrangThai: 'HoatDong',
      });
      createdReaders.push(reader);
    }

    // 3.5. Tao 12 phieu TheoDoiMuonSach trai deu trong 6 thang gan day
    // Đảm bảo tính nhất quán nghiệp vụ:
    // - Mỗi độc giả đang chiếm chỗ <= 5 cuốn
    // - Không trùng (MaDocGia, MaSach) đang chiếm chỗ
    // - TienPhat va PhiTre khớp công thức tại SYSTEM.md §6
    const borrowingsData = [
      // 1. ChoDuyet: DG0001 muon S0001 (Cho Tôi Xin Một Vé Đi Tuổi Thơ)
      {
        MaDocGia: createdReaders[0].MaDocGia,
        MaSach: createdBooks[0].MaSach,
        TrangThai: 'ChoDuyet',
        NgayDangKy: new Date('2026-10-10T08:30:00Z'),
      },
      // 2. ChoDuyet: DG0002 muon S0002 (Mắt Biếc)
      {
        MaDocGia: createdReaders[1].MaDocGia,
        MaSach: createdBooks[1].MaSach,
        TrangThai: 'ChoDuyet',
        NgayDangKy: new Date('2026-10-11T14:15:00Z'),
      },
      // 3. DaDuyet: DG0001 muon S0003 (Tôi Thấy Hoa Vàng Trên Cỏ Xanh)
      {
        MaDocGia: createdReaders[0].MaDocGia,
        MaSach: createdBooks[2].MaSach,
        TrangThai: 'DaDuyet',
        NgayDangKy: new Date('2026-10-09T09:00:00Z'),
        NgayDuyet: new Date('2026-10-11T10:00:00Z'),
        HanNhanSach: new Date('2026-10-13T10:00:00Z'), // NgayDuyet + 2 ngay
        MSNVDuyet: thuthuMsnv,
      },
      // 4. DaDuyet: DG0003 muon S0004 (Dế Mèn Phiêu Lưu Ký)
      {
        MaDocGia: createdReaders[2].MaDocGia,
        MaSach: createdBooks[3].MaSach,
        TrangThai: 'DaDuyet',
        NgayDangKy: new Date('2026-10-10T16:20:00Z'),
        NgayDuyet: new Date('2026-10-12T08:00:00Z'),
        HanNhanSach: new Date('2026-10-14T08:00:00Z'),
        MSNVDuyet: adminMsnv,
      },
      // 5. DangMuon: DG0002 muon S0005 (Đất Rừng Phương Nam), chua qua han
      {
        MaDocGia: createdReaders[1].MaDocGia,
        MaSach: createdBooks[4].MaSach,
        TrangThai: 'DangMuon',
        NgayDangKy: new Date('2026-10-05T07:45:00Z'),
        NgayDuyet: new Date('2026-10-06T09:00:00Z'),
        HanNhanSach: new Date('2026-10-08T09:00:00Z'),
        NgayMuon: new Date('2026-10-07T14:00:00Z'),
        HanTra: new Date('2026-10-21T14:00:00Z'), // 14 ngay sau NgayMuon
        MSNVDuyet: adminMsnv,
        MSNVGiao: thuthuMsnv,
      },
      // 6. DangMuon: DG0004 muon S0006 (Số Đỏ), DA QUA HAN (HanTra: 2026-09-28 < 2026-10-12)
      {
        MaDocGia: createdReaders[3].MaDocGia,
        MaSach: createdBooks[5].MaSach,
        TrangThai: 'DangMuon',
        NgayDangKy: new Date('2026-09-12T10:00:00Z'),
        NgayDuyet: new Date('2026-09-13T08:30:00Z'),
        HanNhanSach: new Date('2026-09-15T08:30:00Z'),
        NgayMuon: new Date('2026-09-14T11:00:00Z'),
        HanTra: new Date('2026-09-28T11:00:00Z'), // Qua han 14 ngay tinh den 12/10
        MSNVDuyet: thuthuMsnv,
        MSNVGiao: thuthuMsnv,
      },
      // 7. DaTra: DG0003 muon S0007 (Tắt Đèn), tra BinhThuong, khong tre
      {
        MaDocGia: createdReaders[2].MaDocGia,
        MaSach: createdBooks[6].MaSach,
        TrangThai: 'DaTra',
        NgayDangKy: new Date('2026-05-10T09:00:00Z'),
        NgayDuyet: new Date('2026-05-11T08:00:00Z'),
        HanNhanSach: new Date('2026-05-13T08:00:00Z'),
        NgayMuon: new Date('2026-05-12T10:00:00Z'),
        HanTra: new Date('2026-05-26T10:00:00Z'),
        NgayTra: new Date('2026-05-22T15:30:00Z'), // Tra truoc han 4 ngay
        TinhTrangTra: 'BinhThuong',
        PhiTre: 0,
        TienPhat: 0,
        TrangThaiPhat: 'KhongPhat',
        MSNVDuyet: adminMsnv,
        MSNVGiao: thuthuMsnv,
        MSNVNhanTra: thuthuMsnv,
      },
      // 8. DaTra: DG0005 muon S0008 (Chí Phèo - DonGia 75000), tra Rach Nang, tre 5 ngay, ChuaThanhToan
      // PhiTre = 5 ngay * 2000 = 10000; PhatRachNang = 100% * 0.5 * 75000 = 37500; TienPhat = 47500
      {
        MaDocGia: createdReaders[4].MaDocGia,
        MaSach: createdBooks[7].MaSach,
        TrangThai: 'DaTra',
        NgayDangKy: new Date('2026-07-01T08:00:00Z'),
        NgayDuyet: new Date('2026-07-02T09:00:00Z'),
        HanNhanSach: new Date('2026-07-04T09:00:00Z'),
        NgayMuon: new Date('2026-07-03T10:00:00Z'),
        HanTra: new Date('2026-07-17T10:00:00Z'),
        NgayTra: new Date('2026-07-22T14:00:00Z'), // Tre 5 ngay
        TinhTrangTra: 'Rach',
        MucRach: 'Nang',
        LoaiBoKhoiKho: false,
        PhiTre: 10000,
        TienPhat: 47500,
        GhiChuPhat: 'Trễ 5 ngày (10.000đ) + rách nặng bìa và gáy (37.500đ)',
        TrangThaiPhat: 'ChuaThanhToan',
        MSNVDuyet: thuthuMsnv,
        MSNVGiao: thuthuMsnv,
        MSNVNhanTra: adminMsnv,
      },
      // 9. DaTra: DG0002 muon S0009 (Vợ Nhặt - DonGia 60000), tra Mat, tre 4 ngay, DaThanhToan
      // PhiTre = 4 ngay * 2000 = 8000; PhatMat = 1.0 * 60000 + 20000 = 80000; TienPhat = 88000
      {
        MaDocGia: createdReaders[1].MaDocGia,
        MaSach: createdBooks[8].MaSach,
        TrangThai: 'DaTra',
        NgayDangKy: new Date('2026-08-05T08:30:00Z'),
        NgayDuyet: new Date('2026-08-06T09:00:00Z'),
        HanNhanSach: new Date('2026-08-08T09:00:00Z'),
        NgayMuon: new Date('2026-08-07T10:00:00Z'),
        HanTra: new Date('2026-08-21T10:00:00Z'),
        NgayTra: new Date('2026-08-25T16:00:00Z'),
        TinhTrangTra: 'Mat',
        LoaiBoKhoiKho: true,
        PhiTre: 8000,
        TienPhat: 88000,
        GhiChuPhat: 'Trễ 4 ngày (8.000đ) + mất sách (60.000đ đền bìa + 20.000đ phí xử lý)',
        TrangThaiPhat: 'DaThanhToan',
        NgayThanhToanPhat: new Date('2026-08-25T16:15:00Z'),
        MSNVThuPhat: adminMsnv,
        MSNVDuyet: adminMsnv,
        MSNVGiao: thuthuMsnv,
        MSNVNhanTra: adminMsnv,
      },
      // 10. TuChoi: DG0004 muon S0010 (Chiếc Lược Ngà)
      {
        MaDocGia: createdReaders[3].MaDocGia,
        MaSach: createdBooks[9].MaSach,
        TrangThai: 'TuChoi',
        NgayDangKy: new Date('2026-06-15T09:00:00Z'),
        LyDoTuChoi: 'Độc giả có thông tin liên lạc chưa được xác thực.',
        MSNVDuyet: adminMsnv,
      },
      // 11. DaHuy: DG0005 tu huy khi con ChoDuyet S0011 (Lão Hạc)
      {
        MaDocGia: createdReaders[4].MaDocGia,
        MaSach: createdBooks[10].MaSach,
        TrangThai: 'DaHuy',
        NgayDangKy: new Date('2026-09-10T11:00:00Z'),
        LyDoTuChoi: 'Độc giả tự hủy yêu cầu mượn trước khi duyệt.',
      },
      // 12. DaHuy: DG0003 qua HanNhanSach sau khi DaDuyet S0012 (Bỉ Vỏ)
      {
        MaDocGia: createdReaders[2].MaDocGia,
        MaSach: createdBooks[11].MaSach,
        TrangThai: 'DaHuy',
        NgayDangKy: new Date('2026-09-22T08:00:00Z'),
        NgayDuyet: new Date('2026-09-23T09:00:00Z'),
        HanNhanSach: new Date('2026-09-25T09:00:00Z'),
        LyDoTuChoi: 'Quá thời hạn 2 ngày nhận sách kể từ khi duyệt.',
        MSNVDuyet: thuthuMsnv,
      },
    ];

    for (const b of borrowingsData) {
      await TheoDoiMuonSach.create(b);
    }

    // 3.6. Tao vai ban ghi NhatKy mau
    await NhatKy.create([
      {
        MSNV: adminMsnv,
        HanhDong: 'KHOI_TAO_HE_THONG',
        DoiTuong: 'CauHinh',
        MaDoiTuong: 'main',
        ChiTiet: { moTa: 'Khởi tạo cấu hình và dữ liệu mẫu hệ thống' },
        IP: '127.0.0.1',
      },
      {
        MSNV: thuthuMsnv,
        HanhDong: 'DUYET_PHIEU',
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: createdBooks[2].MaSach,
        ChiTiet: { MaDocGia: createdReaders[0].MaDocGia },
        IP: '127.0.0.1',
      },
      {
        MSNV: adminMsnv,
        HanhDong: 'THU_PHAT',
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: createdBooks[8].MaSach,
        ChiTiet: {
          MaDocGia: createdReaders[1].MaDocGia,
          soTien: 88000,
          lyDo: 'Mất sách Vợ Nhặt',
        },
        IP: '127.0.0.1',
      },
    ]);

    console.log('Khoi tao du lieu mau thanh cong.');
    await printSummary();
  } catch (error) {
    console.error('Loi trong qua trinh seed du lieu:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
};

/**
 * In bang tong hop so luong ban ghi tung collection va thong tin tai khoan mau
 */
const printSummary = async () => {
  const [
    countAdmin,
    countStaff,
    countNXB,
    countSach,
    countDocGia,
    countPhieu,
    countNhatKy,
    countCauHinh,
  ] = await Promise.all([
    NhanVien.countDocuments({ VaiTro: 'admin' }),
    NhanVien.countDocuments({ VaiTro: 'thuthu' }),
    NhaXuatBan.countDocuments(),
    Sach.countDocuments(),
    DocGia.countDocuments(),
    TheoDoiMuonSach.countDocuments(),
    NhatKy.countDocuments(),
    CauHinh.countDocuments(),
  ]);

  const admin = await NhanVien.findOne({ VaiTro: 'admin' }).select('MSNV HoTenNV');
  const readers = await DocGia.find().select('MaDocGia Email HoLot Ten');

  console.log('\n--- KET QUA KHOI TAO DU LIEU (SEED SUMMARY) ---');
  console.log(`- CauHinh:        ${countCauHinh}`);
  console.log(`- NhanVien admin: ${countAdmin} (MSNV: ${admin ? admin.MSNV : 'chua co'})`);
  console.log(`- NhanVien thuthu:${countStaff}`);
  console.log(`- NhaXuatBan:     ${countNXB}`);
  console.log(`- Sach:           ${countSach}`);
  console.log(`- DocGia:         ${countDocGia}`);
  console.log(`- TheoDoiMuonSach:${countPhieu}`);
  console.log(`- NhatKy:         ${countNhatKy}`);

  if (readers.length > 0) {
    console.log('\nDanh sach email doc gia mau (mat khau tu SEED_DEMO_PASSWORD):');
    readers.forEach((r) => {
      console.log(`  * ${r.MaDocGia} - ${r.HoLot} ${r.Ten}: ${r.Email}`);
    });
  }
  console.log('------------------------------------------------\n');
};

runSeed();
