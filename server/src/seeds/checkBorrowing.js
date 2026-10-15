import { connectDB, disconnectDB } from '../config/db.js';
import {
  DocGia,
  Sach,
  NhaXuatBan,
  TheoDoiMuonSach,
  NhatKy,
} from '../models/index.js';
import {
  registerBorrow,
  checkEligibility,
  getBorrowSummary,
} from '../services/borrowing.service.js';
import {
  isOverdue,
  soNgayTre,
  ACTIVE_STATUSES,
} from '../utils/borrowing.js';
import { getSettings } from '../services/settings.service.js';

let passedCount = 0;
let failedCount = 0;

const logPass = (name, detail = '') => {
  passedCount++;
  console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`);
};

const logFail = (name, error) => {
  failedCount++;
  console.error(`[FAIL] ${name} - Loi: ${error?.message || error}`);
};

const PREFIX = 'TEST_BR_';
const NXB_CODE = 'NXB_TEST_BR';

const runChecks = async () => {
  const startTime = Date.now();
  console.log('\n======================================================');
  console.log('KIEM TRA TASK P3-1: BORROWING SERVICE & GIOI HAN MUON');
  console.log('======================================================\n');

  try {
    await connectDB();

    // Dọn dẹp dữ liệu thử nghiệm sót lại trước khi bắt đầu
    await cleanTestData();

    // 1. Chuẩn bị dữ liệu mẫu cho test
    console.log('--- 1. CHUAN BI DU LIEU MAU ---');
    await NhaXuatBan.create({
      MaNXB: NXB_CODE,
      TenNXB: 'NXB Kiem Tra Muon Sach P3-1',
      DiaChi: 'Can Tho',
    });

    // Tạo 8 sách thử nghiệm có SoQuyenConLai đủ lớn (đúng định dạng ^S\d{4,}$)
    const bookCodes = [];
    for (let i = 1; i <= 8; i++) {
      const code = `S888${i}`;
      bookCodes.push(code);
      await Sach.create({
        MaSach: code,
        TenSach: `Sach Kiem Tra So ${i}`,
        DonGia: 50000,
        SoQuyen: 20,
        SoQuyenConLai: 20,
        MaNXB: NXB_CODE,
        NguonGocTacGia: 'Tac Gia Test',
      });
    }

    // Sách đã xóa mềm
    const BOOK_DELETED = 'S8891';
    await Sach.create({
      MaSach: BOOK_DELETED,
      TenSach: 'Sach Test Da Xoa Mem',
      DonGia: 50000,
      SoQuyen: 10,
      SoQuyenConLai: 10,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia Test',
      DaXoa: true,
    });

    // Sách hết quyển (SoQuyenConLai = 0)
    const BOOK_OUT_OF_STOCK = 'S8892';
    await Sach.create({
      MaSach: BOOK_OUT_OF_STOCK,
      TenSach: 'Sach Test Het Hang',
      DonGia: 60000,
      SoQuyen: 5,
      SoQuyenConLai: 0,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia Test',
    });

    // Tạo các độc giả phục vụ test
    const DG_SUCCESS = `${PREFIX}DG_01`;
    const DG_LIMIT = `${PREFIX}DG_02`;
    const DG_OVERDUE = `${PREFIX}DG_03`;
    const DG_FINE = `${PREFIX}DG_04`;
    const DG_LOCKED = `${PREFIX}DG_LOCKED`;
    const DG_PRIORITY = `${PREFIX}DG_PRIORITY`;
    const DG_RACE = `${PREFIX}DG_RACE`;

    const sampleReaders = [
      { MaDocGia: DG_SUCCESS, Email: `${DG_SUCCESS.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
      { MaDocGia: DG_LIMIT, Email: `${DG_LIMIT.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
      { MaDocGia: DG_OVERDUE, Email: `${DG_OVERDUE.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
      { MaDocGia: DG_FINE, Email: `${DG_FINE.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
      { MaDocGia: DG_LOCKED, Email: `${DG_LOCKED.toLowerCase()}@test.vn`, TrangThai: 'BiKhoa' },
      { MaDocGia: DG_PRIORITY, Email: `${DG_PRIORITY.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
      { MaDocGia: DG_RACE, Email: `${DG_RACE.toLowerCase()}@test.vn`, TrangThai: 'HoatDong' },
    ];

    for (const r of sampleReaders) {
      await DocGia.create({
        MaDocGia: r.MaDocGia,
        HoLot: 'Nguyen Van',
        Ten: 'Test',
        NgaySinh: new Date('2000-01-01'),
        Phai: 'Nam',
        Email: r.Email,
        Password: 'HashPasswordSample123',
        TrangThai: r.TrangThai,
      });
    }

    logPass('Khoi tao du lieu thu nghiem', '8 sach, 2 sach dac biet, 7 doc gia');

    // ---------------------------------------------------------
    // KICH BAN A: Đăng ký thành công
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN A: DANG KY THANH CONG ---');
    try {
      const fixedNow = new Date('2026-10-15T08:00:00Z');
      const bookBefore = await Sach.findOne({ MaSach: bookCodes[0] }).lean();

      const createdPhieu = await registerBorrow(DG_SUCCESS, bookCodes[0], { now: fixedNow });

      const bookAfter = await Sach.findOne({ MaSach: bookCodes[0] }).lean();

      if (createdPhieu.TrangThai !== 'ChoDuyet') {
        throw new Error(`Trang thai phieu phai la ChoDuyet, thuc te: ${createdPhieu.TrangThai}`);
      }
      if (new Date(createdPhieu.NgayDangKy).getTime() !== fixedNow.getTime()) {
        throw new Error('NgayDangKy khong khop voi gia tri now truyen vao');
      }
      if (createdPhieu.NgayMuon !== null || createdPhieu.HanTra !== null || createdPhieu.NgayTra !== null) {
        throw new Error('NgayMuon, HanTra, NgayTra phai la null khi vua dang ky');
      }
      if (bookAfter.SoQuyenConLai !== bookBefore.SoQuyenConLai) {
        throw new Error('SoQuyenConLai bi thay doi! Dang ky chi tao ChoDuyet, khong duoc tru kho.');
      }

      logPass('Kich ban A: Dang ky thanh cong', `Phieu _id: ${createdPhieu._id}, kho khong doi`);
    } catch (err) {
      logFail('Kich ban A: Dang ky thanh cong', err);
    }

    // ---------------------------------------------------------
    // KICH BAN B: Dang ky lai cung sach
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN B: CHONG MUON TRUNG CUNG SACH ---');
    try {
      // 1. Đang ChoDuyet mà đăng ký lại -> 409 ALREADY_BORROWING
      let blockedWith409 = false;
      try {
        await registerBorrow(DG_SUCCESS, bookCodes[0]);
      } catch (err) {
        if (err.statusCode === 409 && err.code === 'ALREADY_BORROWING') {
          blockedWith409 = true;
        } else {
          throw err;
        }
      }
      if (!blockedWith409) {
        throw new Error('Dang ky trung sach khi phieu cu dang ChoDuyet phai tra ve 409 ALREADY_BORROWING');
      }
      logPass('Kich ban B1: Chan dang ky lai cung sach khi dang ChoDuyet (409 ALREADY_BORROWING)');

      // 2. Chuyển phiếu sang TuChoi -> đăng ký lại được
      await TheoDoiMuonSach.updateOne({ MaDocGia: DG_SUCCESS, MaSach: bookCodes[0] }, { TrangThai: 'TuChoi' });
      const phieuAfterTuChoi = await registerBorrow(DG_SUCCESS, bookCodes[0]);
      if (phieuAfterTuChoi.TrangThai !== 'ChoDuyet') throw new Error('Dang ky lai sau TuChoi that bai');
      logPass('Kich ban B2: Cho phep dang ky lai khi phieu cu da chuyen sang TuChoi');

      // 3. Chuyển phiếu sang DaHuy -> đăng ký lại được
      await TheoDoiMuonSach.updateOne({ _id: phieuAfterTuChoi._id }, { TrangThai: 'DaHuy' });
      const phieuAfterDaHuy = await registerBorrow(DG_SUCCESS, bookCodes[0]);
      if (phieuAfterDaHuy.TrangThai !== 'ChoDuyet') throw new Error('Dang ky lai sau DaHuy that bai');
      logPass('Kich ban B3: Cho phep dang ky lai khi phieu cu da chuyen sang DaHuy');

      // 4. Chuyển phiếu sang DaTra -> đăng ký lại được
      await TheoDoiMuonSach.updateOne({ _id: phieuAfterDaHuy._id }, { TrangThai: 'DaTra' });
      const phieuAfterDaTra = await registerBorrow(DG_SUCCESS, bookCodes[0]);
      if (phieuAfterDaTra.TrangThai !== 'ChoDuyet') throw new Error('Dang ky lai sau DaTra that bai');
      logPass('Kich ban B4: Cho phep dang ky lai khi phieu cu da chuyen sang DaTra');
    } catch (err) {
      logFail('Kich ban B: Chong muon trung cung sach', err);
    }

    // ---------------------------------------------------------
    // KICH BAN C: Gioi han SoSachToiDa
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN C: GIOI HAN SO SACH TOI DA ---');
    try {
      const settings = await getSettings();
      const limit = settings.SoSachToiDa; // Mặc định 5

      // Độc giả DG_LIMIT: Tạo sẵn 1 ChoDuyet, 2 DaDuyet, 2 DangMuon (tổng 5 phiếu đang chiếm chỗ)
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: bookCodes[0], TrangThai: 'ChoDuyet' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: bookCodes[1], TrangThai: 'DaDuyet' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: bookCodes[2], TrangThai: 'DaDuyet' });
      await TheoDoiMuonSach.create({
        MaDocGia: DG_LIMIT,
        MaSach: bookCodes[3],
        TrangThai: 'DangMuon',
        HanTra: new Date(Date.now() + 7 * 86400000),
      });
      await TheoDoiMuonSach.create({
        MaDocGia: DG_LIMIT,
        MaSach: bookCodes[4],
        TrangThai: 'DangMuon',
        HanTra: new Date(Date.now() + 7 * 86400000),
      });

      // Tạo thêm các phiếu ở trạng thái không chiếm chỗ: TuChoi, DaHuy, DaTra (không được tính vào limit)
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: 'S8893', TrangThai: 'TuChoi' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: 'S8894', TrangThai: 'DaHuy' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_LIMIT, MaSach: 'S8895', TrangThai: 'DaTra' });

      // Đăng ký cuốn thứ 6 (bookCodes[5]) -> phải bị 422 BORROW_LIMIT_EXCEEDED
      let limitBlocked = false;
      try {
        await registerBorrow(DG_LIMIT, bookCodes[5]);
      } catch (err) {
        if (err.statusCode === 422 && err.code === 'BORROW_LIMIT_EXCEEDED') {
          limitBlocked = true;
        } else {
          throw err;
        }
      }

      if (!limitBlocked) {
        throw new Error('Khong chan khi da muon du SoSachToiDa');
      }
      logPass('Kich ban C: Chan dang ky khi dat gioi han SoSachToiDa (422 BORROW_LIMIT_EXCEEDED)', `Gioi han: ${limit}`);
    } catch (err) {
      logFail('Kich ban C: Gioi han SoSachToiDa', err);
    }

    // ---------------------------------------------------------
    // KICH BAN D: Kiem tra qua han (HAS_OVERDUE)
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN D: KIEM TRA QUA HAN (HAS_OVERDUE) ---');
    try {
      const now = new Date('2026-10-15T12:00:00Z');

      // 1. Phiếu DangMuon nhưng HanTra trong tương lai -> không bị chặn
      const loanFuture = await TheoDoiMuonSach.create({
        MaDocGia: DG_OVERDUE,
        MaSach: bookCodes[0],
        TrangThai: 'DangMuon',
        HanTra: new Date('2026-10-20T12:00:00Z'),
      });

      const allowedPhieu = await registerBorrow(DG_OVERDUE, bookCodes[1], { now });
      if (!allowedPhieu) throw new Error('Dang ky phai thanh cong khi chua qua han');
      logPass('Kich ban D1: Khong bi chan khi phieu DangMuon chua toi HanTra');

      // 2. Chuyển loanFuture sang HanTra trong quá khứ (quá hạn) -> phải bị 422 HAS_OVERDUE
      await TheoDoiMuonSach.updateOne(
        { _id: loanFuture._id },
        { HanTra: new Date('2026-10-14T12:00:00Z') }
      );

      let overdueBlocked = false;
      try {
        await registerBorrow(DG_OVERDUE, bookCodes[2], { now });
      } catch (err) {
        if (err.statusCode === 422 && err.code === 'HAS_OVERDUE') {
          overdueBlocked = true;
        } else {
          throw err;
        }
      }

      if (!overdueBlocked) {
        throw new Error('Khong chan khi doc gia co phieu DangMuon qua han');
      }
      logPass('Kich ban D2: Chan khi doc gia co sach qua han (422 HAS_OVERDUE)');
    } catch (err) {
      logFail('Kich ban D: Kiem tra qua han', err);
    }

    // ---------------------------------------------------------
    // KICH BAN E: Kiem tra tien phat chua thanh toan
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN E: TIEN PHAT CHUA THANH TOAN ---');
    try {
      // 1. Phiếu có phạt nhưng DaThanhToan -> không chặn
      const paidFineLoan = await TheoDoiMuonSach.create({
        MaDocGia: DG_FINE,
        MaSach: bookCodes[0],
        TrangThai: 'DaTra',
        TienPhat: 20000,
        TrangThaiPhat: 'DaThanhToan',
      });

      const phieuPaid = await registerBorrow(DG_FINE, bookCodes[1]);
      if (!phieuPaid) throw new Error('Dang ky phai thanh cong khi phat da thanh toan');
      logPass('Kich ban E1: Khong bi chan khi khoan phat da thanh toan (DaThanhToan)');

      // 2. Phiếu có phạt ChuaThanhToan -> chặn 422 HAS_UNPAID_FINE
      await TheoDoiMuonSach.updateOne(
        { _id: paidFineLoan._id },
        { TrangThaiPhat: 'ChuaThanhToan', TienPhat: 30000 }
      );

      let fineBlocked = false;
      try {
        await registerBorrow(DG_FINE, bookCodes[2]);
      } catch (err) {
        if (err.statusCode === 422 && err.code === 'HAS_UNPAID_FINE') {
          fineBlocked = true;
        } else {
          throw err;
        }
      }

      if (!fineBlocked) {
        throw new Error('Khong chan khi doc gia co khoan phat chua thanh toan');
      }
      logPass('Kich ban E2: Chan khi co khoan phat chua thanh toan (422 HAS_UNPAID_FINE)');
    } catch (err) {
      logFail('Kich ban E: Tien phat chua thanh toan', err);
    }

    // ---------------------------------------------------------
    // KICH BAN F: Doc gia bi khoa va doc gia khong ton tai
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN F: DOC GIA BI KHOA & KHONG TON TAI ---');
    try {
      // 1. Độc giả bị khóa -> 403 ACCOUNT_LOCKED
      let lockedBlocked = false;
      try {
        await registerBorrow(DG_LOCKED, bookCodes[0]);
      } catch (err) {
        if (err.statusCode === 403 && err.code === 'ACCOUNT_LOCKED') {
          lockedBlocked = true;
        } else {
          throw err;
        }
      }
      if (!lockedBlocked) throw new Error('Khong chan doc gia BiKhoa bang 403 ACCOUNT_LOCKED');
      logPass('Kich ban F1: Chan doc gia BiKhoa (403 ACCOUNT_LOCKED)');

      // 2. Độc giả không tồn tại -> 404 NOT_FOUND
      let notFoundBlocked = false;
      try {
        await registerBorrow(`${PREFIX}NON_EXISTENT`, bookCodes[0]);
      } catch (err) {
        if (err.statusCode === 404 && err.code === 'NOT_FOUND') {
          notFoundBlocked = true;
        } else {
          throw err;
        }
      }
      if (!notFoundBlocked) throw new Error('Khong tra 404 NOT_FOUND khi doc gia khong ton tai');
      logPass('Kich ban F2: Doc gia khong ton tai tra ve 404 NOT_FOUND');
    } catch (err) {
      logFail('Kich ban F: Doc gia bi khoa va khong ton tai', err);
    }

    // ---------------------------------------------------------
    // KICH BAN G: Kiem tra sach khong hop le
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN G: KIEM TRA SACH KHONG HOP LE ---');
    try {
      // 1. Sách không tồn tại -> 404
      let bookNotFound = false;
      try {
        await registerBorrow(DG_SUCCESS, 'S99999');
      } catch (err) {
        if (err.statusCode === 404 && err.code === 'NOT_FOUND') bookNotFound = true;
      }
      if (!bookNotFound) throw new Error('Sach khong ton tai phai tra ve 404 NOT_FOUND');
      logPass('Kich ban G1: Sach khong ton tai tra ve 404 NOT_FOUND');

      // 2. Sách đã xóa mềm (DaXoa: true) -> 404
      let bookDeleted = false;
      try {
        await registerBorrow(DG_SUCCESS, BOOK_DELETED);
      } catch (err) {
        if (err.statusCode === 404 && err.code === 'NOT_FOUND') bookDeleted = true;
      }
      if (!bookDeleted) throw new Error('Sach DaXoa phai tra ve 404 NOT_FOUND');
      logPass('Kich ban G2: Sach DaXoa tra ve 404 NOT_FOUND');

      // 3. Sách hết quyển (SoQuyenConLai = 0) -> 409 OUT_OF_STOCK
      let outOfStock = false;
      try {
        await registerBorrow(DG_SUCCESS, BOOK_OUT_OF_STOCK);
      } catch (err) {
        if (err.statusCode === 409 && err.code === 'OUT_OF_STOCK') outOfStock = true;
      }
      if (!outOfStock) throw new Error('Sach SoQuyenConLai = 0 phai tra ve 409 OUT_OF_STOCK');
      logPass('Kich ban G3: Sach het quyen tra ve 409 OUT_OF_STOCK');

      // 4. Mã sách sai định dạng -> 400 VALIDATION_ERROR
      let invalidFormat = false;
      try {
        await registerBorrow(DG_SUCCESS, 'SACH_SAI_DINH_DANG');
      } catch (err) {
        if (err.statusCode === 400 && err.code === 'VALIDATION_ERROR') invalidFormat = true;
      }
      if (!invalidFormat) throw new Error('Ma sach sai dinh dang phai tra ve 400 VALIDATION_ERROR');
      logPass('Kich ban G4: Ma sach sai dinh dang tra ve 400 VALIDATION_ERROR');

      // 5. Mã sách kiểu object (NoSQL injection attempt: { $ne: null }) -> 400 VALIDATION_ERROR
      let injectionBlocked = false;
      try {
        await registerBorrow(DG_SUCCESS, { $ne: null });
      } catch (err) {
        if (err.statusCode === 400 && err.code === 'VALIDATION_ERROR') injectionBlocked = true;
      }
      if (!injectionBlocked) throw new Error('Ma sach truyen object phai tra ve 400, khong crash 500');
      logPass('Kich ban G5: Ma sach la object duoc chan boi 400 VALIDATION_ERROR');
    } catch (err) {
      logFail('Kich ban G: Kiem tra sach khong hop le', err);
    }

    // ---------------------------------------------------------
    // KICH BAN H: Thu tu uu tien kiem tra loi
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN H: THU TU UU TIEN KIEM TRA LOI (a -> b -> c -> d) ---');
    try {
      const now = new Date('2026-10-15T12:00:00Z');
      // Tạo tình huống: Độc giả DG_PRIORITY vừa có sách quá hạn (b), vừa có phạt (c), vừa vượt giới hạn (d)
      // Tạo 5 phiếu chiếm chỗ (đạt limit):
      // - 1 DangMuon quá hạn
      // - 1 DaTra có phạt ChưaThanhToan
      // - 4 phiếu khác để đủ 5 phiếu chiếm chỗ
      await TheoDoiMuonSach.deleteMany({ MaDocGia: DG_PRIORITY });

      await TheoDoiMuonSach.create({
        MaDocGia: DG_PRIORITY,
        MaSach: bookCodes[0],
        TrangThai: 'DangMuon',
        HanTra: new Date('2026-10-10T12:00:00Z'), // Quá hạn (b)
      });
      await TheoDoiMuonSach.create({
        MaDocGia: DG_PRIORITY,
        MaSach: bookCodes[1],
        TrangThai: 'DaTra',
        TienPhat: 50000,
        TrangThaiPhat: 'ChuaThanhToan', // Phạt chưa thanh toán (c)
      });
      await TheoDoiMuonSach.create({ MaDocGia: DG_PRIORITY, MaSach: bookCodes[2], TrangThai: 'ChoDuyet' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_PRIORITY, MaSach: bookCodes[3], TrangThai: 'DaDuyet' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_PRIORITY, MaSach: bookCodes[4], TrangThai: 'DaDuyet' });
      await TheoDoiMuonSach.create({ MaDocGia: DG_PRIORITY, MaSach: bookCodes[5], TrangThai: 'DaDuyet' });
      // Đang chiếm chỗ = 5 (đạt SoSachToiDa: d)

      // 1. Khi vừa có quá hạn, phạt và vượt giới hạn -> ưu tiên (b) HAS_OVERDUE
      try {
        await checkEligibility(DG_PRIORITY, now);
        throw new Error('Phai bi chan boi HAS_OVERDUE');
      } catch (err) {
        if (err.code !== 'HAS_OVERDUE') {
          throw new Error(`Uu tien loi sai: ky vong HAS_OVERDUE nhung nhan ${err.code}`);
        }
      }
      logPass('Kich ban H1: Qua han duoc uu tien cao hon phat va gioi han muon (HAS_OVERDUE)');

      // 2. Giải quyết quá hạn (cho mượn chưa đến hạn) -> còn phạt (c) và vượt giới hạn (d) -> ưu tiên (c) HAS_UNPAID_FINE
      await TheoDoiMuonSach.updateOne(
        { MaDocGia: DG_PRIORITY, MaSach: bookCodes[0] },
        { HanTra: new Date('2026-10-25T12:00:00Z') }
      );
      try {
        await checkEligibility(DG_PRIORITY, now);
        throw new Error('Phai bi chan boi HAS_UNPAID_FINE');
      } catch (err) {
        if (err.code !== 'HAS_UNPAID_FINE') {
          throw new Error(`Uu tien loi sai: ky vong HAS_UNPAID_FINE nhung nhan ${err.code}`);
        }
      }
      logPass('Kich ban H2: Phat chua thanh toan duoc uu tien cao hon gioi han muon (HAS_UNPAID_FINE)');

      // 3. Giải quyết phạt (đổi sang DaThanhToan) -> chỉ còn vượt giới hạn (d) -> trả BORROW_LIMIT_EXCEEDED
      await TheoDoiMuonSach.updateOne(
        { MaDocGia: DG_PRIORITY, MaSach: bookCodes[1] },
        { TrangThaiPhat: 'DaThanhToan' }
      );
      try {
        await checkEligibility(DG_PRIORITY, now);
        throw new Error('Phai bi chan boi BORROW_LIMIT_EXCEEDED');
      } catch (err) {
        if (err.code !== 'BORROW_LIMIT_EXCEEDED') {
          throw new Error(`Uu tien loi sai: ky vong BORROW_LIMIT_EXCEEDED nhung nhan ${err.code}`);
        }
      }
      logPass('Kich ban H3: Het qua han va phat thi kiem tra gioi han muon (BORROW_LIMIT_EXCEEDED)');

      // 4. Nếu tài khoản bị khóa -> luôn ưu tiên (a) ACCOUNT_LOCKED cao nhất
      await DocGia.updateOne({ MaDocGia: DG_PRIORITY }, { TrangThai: 'BiKhoa' });
      try {
        await checkEligibility(DG_PRIORITY, now);
        throw new Error('Phai bi chan boi ACCOUNT_LOCKED');
      } catch (err) {
        if (err.code !== 'ACCOUNT_LOCKED') {
          throw new Error(`Uu tien loi sai: ky vong ACCOUNT_LOCKED nhung nhan ${err.code}`);
        }
      }
      await DocGia.updateOne({ MaDocGia: DG_PRIORITY }, { TrangThai: 'HoatDong' });
      logPass('Kich ban H4: Tai khoan BiKhoa duoc uu tien cao nhat (ACCOUNT_LOCKED)');
    } catch (err) {
      logFail('Kich ban H: Thu tu uu tien kiem tra loi', err);
    }

    // ---------------------------------------------------------
    // KICH BAN I: Chong dua (Race condition)
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN I: KIEM TRA CHONG DUA (RACE CONDITION) ---');
    try {
      // 1. Đua 2 request cùng độc giả, CÙNG SÁCH -> đúng 1 thành công, 1 bị 409 ALREADY_BORROWING
      await TheoDoiMuonSach.deleteMany({ MaDocGia: DG_RACE });
      const sameBookPromises = [
        registerBorrow(DG_RACE, bookCodes[0]),
        registerBorrow(DG_RACE, bookCodes[0]),
      ];
      const sameBookResults = await Promise.allSettled(sameBookPromises);

      const fulfilledCount = sameBookResults.filter((r) => r.status === 'fulfilled').length;
      const rejected409Count = sameBookResults.filter(
        (r) => r.status === 'rejected' && r.reason?.statusCode === 409 && r.reason?.code === 'ALREADY_BORROWING'
      ).length;

      if (fulfilledCount !== 1 || rejected409Count !== 1) {
        throw new Error(
          `Dua cung sach: ky vong 1 thanh cong, 1 bi 409. Thuc te: ${fulfilledCount} thanh cong, ${rejected409Count} bi 409`
        );
      }
      logPass('Kich ban I1: Dua 2 request cung sach: dung 1 thanh cong, 1 loi 409 ALREADY_BORROWING');

      // 2. Đua bắn 8 request cho 8 sách KHÁC NHAU của cùng một độc giả (giới hạn 5)
      // Lặp lại 5 lần để kiểm tra độ tin cậy của thuật toán chống đua
      const settings = await getSettings();
      const maxAllowed = settings.SoSachToiDa; // 5

      for (let round = 1; round <= 5; round++) {
        await TheoDoiMuonSach.deleteMany({ MaDocGia: DG_RACE });

        const parallel8 = bookCodes.map((code) => registerBorrow(DG_RACE, code));
        await Promise.allSettled(parallel8);

        const activeCount = await TheoDoiMuonSach.countDocuments({
          MaDocGia: DG_RACE,
          TrangThai: { $in: ACTIVE_STATUSES },
        });

        const totalCount = await TheoDoiMuonSach.countDocuments({ MaDocGia: DG_RACE });

        if (activeCount > maxAllowed) {
          throw new Error(
            `Vong ${round}: So sach chiem cho vuot qua gioi han! activeCount: ${activeCount} > ${maxAllowed}`
          );
        }

        // Kiểm tra không còn phiếu mồ côi
        if (totalCount !== activeCount) {
          throw new Error(
            `Vong ${round}: Co phieu mo coi! totalCount: ${totalCount} != activeCount: ${activeCount}`
          );
        }
      }
      logPass(
        'Kich ban I2: Dua 8 request dong thoi 8 sach khac nhau (lap 5 lan): so phieu luon <= SoSachToiDa va khong co phieu mo coi'
      );
    } catch (err) {
      logFail('Kich ban I: Chong dua', err);
    }

    // ---------------------------------------------------------
    // KICH BAN J: getBorrowSummary, isOverdue va soNgayTre moc bien
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN J: MOC BIEN isOverdue, soNgayTre & getBorrowSummary ---');
    try {
      const baseNow = new Date('2026-10-15T12:00:00Z');

      // 1. Đúng hạn: now == HanTra
      const pOnTime = { TrangThai: 'DangMuon', HanTra: new Date('2026-10-15T12:00:00Z') };
      if (isOverdue(pOnTime, baseNow) !== false) throw new Error('Dung ngay han khong duoc tinh la qua han');
      if (soNgayTre(pOnTime, baseNow) !== 0) throw new Error('Dung ngay han soNgayTre phai la 0');
      logPass('Kich ban J1: Moc bien dung ngay han: isOverdue=false, soNgayTre=0');

      // 2. Trễ 1 giờ: now = HanTra + 1 giờ -> trễ 1 ngày (làm tròn lên)
      const p1HourLate = { TrangThai: 'DangMuon', HanTra: new Date('2026-10-15T11:00:00Z') };
      if (isOverdue(p1HourLate, baseNow) !== true) throw new Error('Tre 1 gio phai tinh qua han');
      if (soNgayTre(p1HourLate, baseNow) !== 1) throw new Error(`Tre 1 gio soNgayTre phai la 1, thuc te: ${soNgayTre(p1HourLate, baseNow)}`);
      logPass('Kich ban J2: Moc bien tre 1 gio: isOverdue=true, soNgayTre=1');

      // 3. Trễ đúng 1 ngày (24 giờ) -> trễ 1 ngày
      const p1DayLate = { TrangThai: 'DangMuon', HanTra: new Date('2026-10-14T12:00:00Z') };
      if (isOverdue(p1DayLate, baseNow) !== true) throw new Error('Tre 1 ngay phai tinh qua han');
      if (soNgayTre(p1DayLate, baseNow) !== 1) throw new Error(`Tre 1 ngay soNgayTre phai la 1, thuc te: ${soNgayTre(p1DayLate, baseNow)}`);
      logPass('Kich ban J3: Moc bien tre dung 24 gio: isOverdue=true, soNgayTre=1');

      // 4. Trễ 1 ngày 1 giờ (25 giờ) -> trễ 2 ngày (làm tròn lên)
      const p25HoursLate = { TrangThai: 'DangMuon', HanTra: new Date('2026-10-14T11:00:00Z') };
      if (isOverdue(p25HoursLate, baseNow) !== true) throw new Error('Tre 25 gio phai tinh qua han');
      if (soNgayTre(p25HoursLate, baseNow) !== 2) throw new Error(`Tre 25 gio soNgayTre phai la 2, thuc te: ${soNgayTre(p25HoursLate, baseNow)}`);
      logPass('Kich ban J4: Moc bien tre 1 ngay 1 gio (25h): isOverdue=true, soNgayTre=2');

      // 5. Kiểm tra getBorrowSummary
      await TheoDoiMuonSach.deleteMany({ MaDocGia: DG_SUCCESS });
      await TheoDoiMuonSach.create({ MaDocGia: DG_SUCCESS, MaSach: bookCodes[0], TrangThai: 'ChoDuyet' });
      await TheoDoiMuonSach.create({
        MaDocGia: DG_SUCCESS,
        MaSach: bookCodes[1],
        TrangThai: 'DangMuon',
        HanTra: new Date('2026-10-14T12:00:00Z'), // Quá hạn
      });
      await TheoDoiMuonSach.create({
        MaDocGia: DG_SUCCESS,
        MaSach: bookCodes[2],
        TrangThai: 'DaTra',
        TienPhat: 15000,
        TrangThaiPhat: 'ChuaThanhToan',
      });

      const summary = await getBorrowSummary(DG_SUCCESS, baseNow);
      if (summary.dangChiemCho !== 2) throw new Error(`dangChiemCho sai: ${summary.dangChiemCho} != 2`);
      if (summary.toiDa !== 5) throw new Error(`toiDa sai: ${summary.toiDa} != 5`);
      if (summary.conDuocMuon !== 3) throw new Error(`conDuocMuon sai: ${summary.conDuocMuon} != 3`);
      if (summary.coQuaHan !== true) throw new Error(`coQuaHan sai: ${summary.coQuaHan} != true`);
      if (summary.tongPhatChuaTra !== 15000) throw new Error(`tongPhatChuaTra sai: ${summary.tongPhatChuaTra} != 15000`);

      logPass('Kich ban J5: getBorrowSummary tinh toan dung so lieu aggregate');
    } catch (err) {
      logFail('Kich ban J: Moc bien isOverdue, soNgayTre & getBorrowSummary', err);
    }

    // ---------------------------------------------------------
    // KICH BAN K: Ghi NhatKy audit va bao mat thong tin
    // ---------------------------------------------------------
    console.log('\n--- KICH BAN K: GHI NHAT KY AUDIT ---');
    try {
      await TheoDoiMuonSach.deleteMany({ MaDocGia: DG_SUCCESS });
      const newPhieu = await registerBorrow(DG_SUCCESS, bookCodes[0], { ip: '127.0.0.1' });

      const log = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(newPhieu._id),
        HanhDong: 'DANG_KY_MUON',
      }).lean();

      if (!log) {
        throw new Error('Khong tim thay ban ghi NhatKy tuong ung voi phieu muon vua tao');
      }

      if (log.MSNV !== DG_SUCCESS) {
        throw new Error(`Nguoi thuc hien trong NhatKy phai la MaDocGia (${DG_SUCCESS}), thuc te: ${log.MSNV}`);
      }

      // Kiểm tra ChiTiet không chứa dữ liệu nhạy cảm
      const detailStr = JSON.stringify(log.ChiTiet).toLowerCase();
      if (
        detailStr.includes('password') ||
        detailStr.includes('token') ||
        detailStr.includes('secret') ||
        detailStr.includes('hash')
      ) {
        throw new Error('ChiTiet trong NhatKy chua du lieu nhay cam');
      }

      logPass('Kich ban K: Ghi NhatKy DANG_KY_MUON day du va khong chua du lieu nhay cam');
    } catch (err) {
      logFail('Kich ban K: Ghi NhatKy audit', err);
    }

  } catch (error) {
    console.error('Loi tong the trong checkBorrowing:', error);
  } finally {
    console.log('\n--- DON DEP DU LIEU THU NGHIEM ---');
    await cleanTestData();
    await disconnectDB();

    console.log('\n======================================================');
    console.log(`KET QUA KIEM TRA: PASS: ${passedCount} | FAIL: ${failedCount}`);
    console.log(`Thoi gian thuc thi: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log('======================================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
  }
};

const cleanTestData = async () => {
  try {
    await TheoDoiMuonSach.deleteMany({
      $or: [
        { MaDocGia: { $regex: `^${PREFIX}` } },
        { MaSach: { $regex: /^S888\d|^S889\d/ } },
      ],
    });
    await Sach.deleteMany({ MaSach: { $regex: /^S888\d|^S889\d/ } });
    await NhaXuatBan.deleteMany({ MaNXB: NXB_CODE });
    await DocGia.deleteMany({ MaDocGia: { $regex: `^${PREFIX}` } });
    await NhatKy.deleteMany({
      $or: [
        { MSNV: { $regex: `^${PREFIX}` } },
        { 'ChiTiet.MaDocGia': { $regex: `^${PREFIX}` } },
      ],
    });
  } catch (err) {
    console.error('Loi khi don dep du lieu thu:', err.message);
  }
};

runChecks();
