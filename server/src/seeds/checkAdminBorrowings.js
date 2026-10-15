import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  DocGia,
  Sach,
  NhaXuatBan,
  NhanVien,
  TheoDoiMuonSach,
  NhatKy,
} from '../models/index.js';
import { signAccessToken } from '../services/auth.service.js';

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

const request = (server, options, body = null) => {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
};

const PREFIX = 'TEST_AB_';
const NXB_CODE = 'NXB_TEST_AB';

const runTests = async () => {
  const startTime = Date.now();
  console.log('\n======================================================');
  console.log('KIEM TRA TASK P3-3: API ADMIN APPROVE / REJECT / HANDOVER');
  console.log('======================================================\n');

  await connectDB();
  await cleanTestData();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    console.log('--- 1. CHUAN BI DU LIEU MAU ---');

    await NhaXuatBan.create({
      MaNXB: NXB_CODE,
      TenNXB: 'NXB Test Admin Borrowings',
      DiaChi: 'Can Tho',
    });

    // Tạo sách
    const bookCodes = [];
    for (let i = 1; i <= 5; i++) {
      const code = `S666${i}`;
      bookCodes.push(code);
      await Sach.create({
        MaSach: code,
        TenSach: `Sach Test Admin P3-3 So ${i}`,
        DonGia: 50000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        MaNXB: NXB_CODE,
        NguonGocTacGia: 'Tac Gia P3-3',
      });
    }

    // Sách chỉ có đúng 1 quyển còn lại (phục vụ test đua duyệt kho)
    const BOOK_ONE_STOCK = 'S6691';
    await Sach.create({
      MaSach: BOOK_ONE_STOCK,
      TenSach: 'Sach Test Duy Nhat 1 Quyen P3-3',
      DonGia: 60000,
      SoQuyen: 1,
      SoQuyenConLai: 1,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia P3-3',
    });

    // Sách hết quyển (0 quyển)
    const BOOK_ZERO_STOCK = 'S6692';
    await Sach.create({
      MaSach: BOOK_ZERO_STOCK,
      TenSach: 'Sach Test Het Quyen P3-3',
      DonGia: 60000,
      SoQuyen: 5,
      SoQuyenConLai: 0,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia P3-3',
    });

    // Tạo nhân viên thủ thư và admin
    const STAFF_THUTHU = `${PREFIX}NV01`;
    const STAFF_ADMIN = `${PREFIX}NV02`;
    const STAFF_LOCKED = `${PREFIX}NV_LOCKED`;
    const STAFF_PENDING = `${PREFIX}NV_PENDING`;

    const staffThuthu = await NhanVien.create({
      MSNV: STAFF_THUTHU,
      HoTenNV: 'Thu Thu Test',
      Password: 'Password123',
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const staffAdmin = await NhanVien.create({
      MSNV: STAFF_ADMIN,
      HoTenNV: 'Admin Test',
      Password: 'Password123',
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const staffLocked = await NhanVien.create({
      MSNV: STAFF_LOCKED,
      HoTenNV: 'Nhan Vien Bi Khoa',
      Password: 'Password123',
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'BiKhoa',
      BatBuocDoiMatKhau: false,
    });

    const staffPending = await NhanVien.create({
      MSNV: STAFF_PENDING,
      HoTenNV: 'Nhan Vien Moi Tao',
      Password: 'Password123',
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
    });

    // Tạo độc giả
    const DG_1 = `${PREFIX}DG01`;
    const DG_2 = `${PREFIX}DG02`;
    const DG_LOCKED = `${PREFIX}DG_LOCKED`;

    const user1 = await DocGia.create({
      MaDocGia: DG_1,
      HoLot: 'Nguyen',
      Ten: 'Doc Gia 1',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nam',
      Email: `${DG_1.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    const user2 = await DocGia.create({
      MaDocGia: DG_2,
      HoLot: 'Tran',
      Ten: 'Doc Gia 2',
      NgaySinh: new Date('2001-02-02'),
      Phai: 'Nu',
      Email: `${DG_2.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    await DocGia.create({
      MaDocGia: DG_LOCKED,
      HoLot: 'Pham',
      Ten: 'Doc Gia Khoa',
      NgaySinh: new Date('1998-05-05'),
      Phai: 'Nam',
      Email: `${DG_LOCKED.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'BiKhoa',
    });

    const tokenThuthu = signAccessToken(staffThuthu, 'nhanvien');
    const tokenAdmin = signAccessToken(staffAdmin, 'nhanvien');
    const tokenLocked = signAccessToken(staffLocked, 'nhanvien');
    const tokenPending = signAccessToken(staffPending, 'nhanvien');
    const tokenUser = signAccessToken(user1, 'docgia');

    logPass('Khoi tao du lieu test thanh cong');

    // ---------------------------------------------------------
    // 2. XAC THUC & PHAN QUYEN TREN /api/admin/borrowings/*
    // ---------------------------------------------------------
    console.log('\n--- 2. XAC THUC & PHAN QUYEN ---');
    try {
      // 1. Không token -> 401
      const resNoToken = await request(server, { path: '/api/admin/borrowings' });
      if (resNoToken.status !== 401) throw new Error('Khong token phai tra ve 401 UNAUTHENTICATED');
      logPass('Khong token bi chan 401 UNAUTHENTICATED');

      // 2. Token doc gia -> 401 (token isolation)
      const resUserToken = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenUser}` },
      });
      if (resUserToken.status !== 401) throw new Error('Token doc gia phai bi tu choi 401 tren admin API');
      logPass('Token doc gia bi chan 401 tren admin API');

      // 3. Nhan vien bi khoa -> 403 ACCOUNT_LOCKED
      const resStaffLocked = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenLocked}` },
      });
      if (resStaffLocked.status !== 403 || resStaffLocked.body?.error?.code !== 'ACCOUNT_LOCKED') {
        throw new Error('Nhan vien BiKhoa phai bi chan 403 ACCOUNT_LOCKED');
      }
      logPass('Nhan vien BiKhoa bi chan 403 ACCOUNT_LOCKED');

      // 4. Nhan vien BatBuocDoiMatKhau = true -> 403 MUST_CHANGE_PASSWORD
      const resStaffPending = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenPending}` },
      });
      if (resStaffPending.status !== 403 || resStaffPending.body?.error?.code !== 'MUST_CHANGE_PASSWORD') {
        throw new Error('Nhan vien BatBuocDoiMatKhau phai bi chan 403 MUST_CHANGE_PASSWORD');
      }
      logPass('Nhan vien BatBuocDoiMatKhau bi chan 403 MUST_CHANGE_PASSWORD');

      // 5. Thu thu hop le -> 200
      const resThuthu = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resThuthu.status !== 200) throw new Error('Thu thu hop le phai truy cap thanh cong 200');
      logPass('Thu thu hop le truy cap thanh cong 200');

      // 6. Admin hop le -> 200
      const resAdmin = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      if (resAdmin.status !== 200) throw new Error('Admin hop le phai truy cap thanh cong 200');
      logPass('Admin hop le truy cap thanh cong 200');
    } catch (err) {
      logFail('Kiem tra xac thuc & phan quyen admin', err);
    }

    // ---------------------------------------------------------
    // 3. GET /api/admin/borrowings (DANH SACH & BO LOC)
    // ---------------------------------------------------------
    console.log('\n--- 3. GET /api/admin/borrowings ---');
    let pChoDuyet1, pDaDuyet1, pDangMuon1, pQuaHan1;
    try {
      // Tạo một số phiếu mẫu
      pChoDuyet1 = await TheoDoiMuonSach.create({
        MaDocGia: DG_1,
        MaSach: bookCodes[0],
        TrangThai: 'ChoDuyet',
      });

      pDaDuyet1 = await TheoDoiMuonSach.create({
        MaDocGia: DG_1,
        MaSach: bookCodes[1],
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(),
        HanNhanSach: new Date(Date.now() + 2 * 86400000),
        MSNVDuyet: STAFF_THUTHU,
      });

      pDangMuon1 = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: bookCodes[2],
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 14 * 86400000),
        MSNVGiao: STAFF_THUTHU,
      });

      pQuaHan1 = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: bookCodes[3],
        TrangThai: 'DangMuon',
        NgayMuon: new Date(Date.now() - 20 * 86400000),
        HanTra: new Date(Date.now() - 5 * 86400000), // Quá hạn 5 ngày
        MSNVGiao: STAFF_THUTHU,
      });

      // Lấy danh sách đầy đủ
      const resList = await request(server, {
        path: '/api/admin/borrowings',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resList.status !== 200 || resList.body.data.length < 4) {
        throw new Error('Danh sach admin borrowings phai tra ve du so phieu');
      }
      const sampleItem = resList.body.data[0];
      if (!sampleItem.DocGia || !sampleItem.Sach || sampleItem.isOverdue === undefined) {
        throw new Error('Ban ghi phai populate DocGia, Sach va co isOverdue, soNgayTre');
      }
      logPass('GET /admin/borrowings lay danh sach thanh cong, populate day du DocGia, Sach');

      // Lọc theo trangThai=ChoDuyet
      const resFilterStatus = await request(server, {
        path: '/api/admin/borrowings?trangThai=ChoDuyet',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      const allChoDuyet = resFilterStatus.body.data.every((p) => p.TrangThai === 'ChoDuyet');
      if (!allChoDuyet) throw new Error('Loc trangThai=ChoDuyet tra ve phieu sai');
      logPass('Loc theo trangThai=ChoDuyet thanh cong');

      // Lọc theo maDocGia
      const resFilterDG = await request(server, {
        path: `/api/admin/borrowings?maDocGia=${DG_1}`,
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      const allDG1 = resFilterDG.body.data.every((p) => p.MaDocGia === DG_1);
      if (!allDG1) throw new Error('Loc maDocGia tra ve phieu sai');
      logPass('Loc theo maDocGia thanh cong');

      // Lọc quaHan=true
      const resFilterOverdue = await request(server, {
        path: '/api/admin/borrowings?quaHan=true',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      const allOverdue = resFilterOverdue.body.data.every((p) => p.isOverdue === true);
      if (!allOverdue || resFilterOverdue.body.data.length === 0) {
        throw new Error('Loc quaHan=true phai tra ve cac phieu thuc su qua han');
      }
      logPass('Loc quaHan=true thanh cong, tra ve phieu qua han chinh xac');
    } catch (err) {
      logFail('GET /api/admin/borrowings', err);
    }

    // ---------------------------------------------------------
    // 4. GET /api/admin/borrowings/:id (CHI TIET)
    // ---------------------------------------------------------
    console.log('\n--- 4. GET /api/admin/borrowings/:id ---');
    try {
      const resDetail = await request(server, {
        path: `/api/admin/borrowings/${pChoDuyet1._id}`,
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resDetail.status !== 200 || resDetail.body.data._id !== String(pChoDuyet1._id)) {
        throw new Error('Lay chi tiet phieu muon that bai');
      }
      if (!resDetail.body.data.DocGia || !resDetail.body.data.Sach) {
        throw new Error('Chi tiet phieu phai populate DocGia va Sach');
      }
      logPass('GET /admin/borrowings/:id lay chi tiet thanh cong (200, kem DocGia, Sach)');

      // ID khong ton tai -> 404
      const resNotFound = await request(server, {
        path: '/api/admin/borrowings/666666666666666666666666',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resNotFound.status !== 404) throw new Error('ID khong ton tai phai tra ve 404 NOT_FOUND');
      logPass('ID khong ton tai tra ve 404 NOT_FOUND');
    } catch (err) {
      logFail('GET /api/admin/borrowings/:id', err);
    }

    // ---------------------------------------------------------
    // 5. PATCH /api/admin/borrowings/:id/approve (DUYET PHIEU)
    // ---------------------------------------------------------
    console.log('\n--- 5. PATCH /api/admin/borrowings/:id/approve ---');
    try {
      // 1. Duyet phieu ChoDuyet binh thuong: kho giam 1, TrangThai thanh DaDuyet
      const bookStockBefore = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      const resApprove = await request(server, {
        path: `/api/admin/borrowings/${pChoDuyet1._id}/approve`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });

      if (resApprove.status !== 200 || resApprove.body.data.TrangThai !== 'DaDuyet') {
        throw new Error(`Duyet phieu that bai, status: ${resApprove.status}`);
      }
      if (resApprove.body.data.MSNVDuyet !== STAFF_THUTHU || !resApprove.body.data.HanNhanSach) {
        throw new Error('MSNVDuyet va HanNhanSach phai duoc cap nhat');
      }

      const bookStockAfter = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      if (bookStockAfter !== bookStockBefore - 1) {
        throw new Error(`Kho phai giam 1! Truoc: ${bookStockBefore}, sau: ${bookStockAfter}`);
      }

      // Kiem tra NhatKy DUYET_PHIEU
      const logApprove = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(pChoDuyet1._id),
        HanhDong: 'DUYET_PHIEU',
      }).lean();
      if (!logApprove || logApprove.MSNV !== STAFF_THUTHU) {
        throw new Error('NhatKy DUYET_PHIEU khong dung');
      }
      logPass('Duyet phieu ChoDuyet thanh cong 200: TrangThai sang DaDuyet, kho tru 1, NhatKy da ghi');

      // 2. Duyet lai phieu da DaDuyet -> 409 INVALID_STATE, kho KHONG doi
      const stockBeforeReApprove = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      const resReApprove = await request(server, {
        path: `/api/admin/borrowings/${pChoDuyet1._id}/approve`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resReApprove.status !== 409 || resReApprove.body?.error?.code !== 'INVALID_STATE') {
        throw new Error('Duyet lai phieu da DaDuyet phai tra ve 409 INVALID_STATE');
      }
      const stockAfterReApprove = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      if (stockAfterReApprove !== stockBeforeReApprove) {
        throw new Error('Duyet loi khong duoc lam thay doi kho');
      }
      logPass('Duyet lai phieu DaDuyet bi chan 409 INVALID_STATE, kho khong doi');

      // 3. Duyet phieu cua sach da het hang (SoQuyenConLai = 0) -> 409 OUT_OF_STOCK
      const pZeroStock = await TheoDoiMuonSach.create({
        MaDocGia: DG_1,
        MaSach: BOOK_ZERO_STOCK,
        TrangThai: 'ChoDuyet',
      });

      const resZeroStock = await request(server, {
        path: `/api/admin/borrowings/${pZeroStock._id}/approve`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resZeroStock.status !== 409 || resZeroStock.body?.error?.code !== 'OUT_OF_STOCK') {
        throw new Error('Duyet sach het hang phai tra ve 409 OUT_OF_STOCK');
      }
      logPass('Duyet sach het hang bi chan 409 OUT_OF_STOCK');

      // 4. Duyet phieu cua doc gia dang BiKhoa -> 403 ACCOUNT_LOCKED
      const pLockedReader = await TheoDoiMuonSach.create({
        MaDocGia: DG_LOCKED,
        MaSach: bookCodes[4],
        TrangThai: 'ChoDuyet',
      });
      const resLockedReader = await request(server, {
        path: `/api/admin/borrowings/${pLockedReader._id}/approve`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resLockedReader.status !== 403 || resLockedReader.body?.error?.code !== 'ACCOUNT_LOCKED') {
        throw new Error('Duyet phieu doc gia BiKhoa phai tra ve 403 ACCOUNT_LOCKED');
      }
      logPass('Duyet phieu cua doc gia BiKhoa bi chan 403 ACCOUNT_LOCKED');

      // 5. Dua duyet sach khi kho chi con 1 quyen duy nhat (chong am kho)
      // Tao 2 phieu ChoDuyet cho cung cuon BOOK_ONE_STOCK (doc gia 1 va doc gia 2)
      const pRace1 = await TheoDoiMuonSach.create({
        MaDocGia: DG_1,
        MaSach: BOOK_ONE_STOCK,
        TrangThai: 'ChoDuyet',
      });
      const pRace2 = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: BOOK_ONE_STOCK,
        TrangThai: 'ChoDuyet',
      });

      const raceResults = await Promise.allSettled([
        request(server, {
          path: `/api/admin/borrowings/${pRace1._id}/approve`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenThuthu}` },
        }),
        request(server, {
          path: `/api/admin/borrowings/${pRace2._id}/approve`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenAdmin}` },
        }),
      ]);

      const successApproves = raceResults.filter((r) => r.value?.status === 200).length;
      const outOfStockApproves = raceResults.filter(
        (r) => r.value?.status === 409 && r.value?.body?.error?.code === 'OUT_OF_STOCK'
      ).length;

      const finalStockOne = (await Sach.findOne({ MaSach: BOOK_ONE_STOCK })).SoQuyenConLai;

      if (successApproves !== 1 || outOfStockApproves !== 1 || finalStockOne !== 0) {
        throw new Error(
          `Dua duyet kho that bai: thanh cong: ${successApproves}, het hang: ${outOfStockApproves}, kho cuoi: ${finalStockOne}`
        );
      }
      logPass('Dua duyet kho: dung 1 phieu duoc duyet (200), 1 phieu het hang (409 OUT_OF_STOCK), kho dung bang 0');
    } catch (err) {
      logFail('PATCH /api/admin/borrowings/:id/approve', err);
    }

    // ---------------------------------------------------------
    // 6. PATCH /api/admin/borrowings/:id/reject (TU CHOI PHIEU)
    // ---------------------------------------------------------
    console.log('\n--- 6. PATCH /api/admin/borrowings/:id/reject ---');
    try {
      const pRejectTest = await TheoDoiMuonSach.create({
        MaDocGia: DG_1,
        MaSach: bookCodes[4],
        TrangThai: 'ChoDuyet',
      });

      // 1. Thieu LyDoTuChoi -> 400
      const resNoReason = await request(server, {
        path: `/api/admin/borrowings/${pRejectTest._id}/reject`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenThuthu}` },
      }, {});
      if (resNoReason.status !== 400 || resNoReason.body?.error?.code !== 'VALIDATION_ERROR') {
        throw new Error('Thieu LyDoTuChoi phai tra ve 400 VALIDATION_ERROR');
      }
      logPass('Thieu LyDoTuChoi bi chan 400 VALIDATION_ERROR');

      // 2. Tu choi thanh cong -> 200, TrangThai = TuChoi, kho KHONG doi
      const stockBeforeReject = (await Sach.findOne({ MaSach: bookCodes[4] })).SoQuyenConLai;
      const resReject = await request(server, {
        path: `/api/admin/borrowings/${pRejectTest._id}/reject`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenThuthu}` },
      }, { LyDoTuChoi: 'Sach dang trong dot kiem ke dinh ky' });

      if (resReject.status !== 200 || resReject.body.data.TrangThai !== 'TuChoi') {
        throw new Error('Tu choi phieu that bai');
      }
      if (resReject.body.data.LyDoTuChoi !== 'Sach dang trong dot kiem ke dinh ky') {
        throw new Error('LyDoTuChoi chua duoc luu dung');
      }
      const stockAfterReject = (await Sach.findOne({ MaSach: bookCodes[4] })).SoQuyenConLai;
      if (stockAfterReject !== stockBeforeReject) {
        throw new Error('Tu choi khong duoc lam thay doi kho');
      }

      // Kiem tra NhatKy TU_CHOI_PHIEU
      const logReject = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(pRejectTest._id),
        HanhDong: 'TU_CHOI_PHIEU',
      }).lean();
      if (!logReject || logReject.MSNV !== STAFF_THUTHU) {
        throw new Error('NhatKy TU_CHOI_PHIEU chua duoc ghi dung');
      }
      logPass('Tu choi phieu ChoDuyet thanh cong 200: TrangThai sang TuChoi, LyDoTuChoi luu dung, kho khong doi');

      // 3. Tu choi phieu khong phai ChoDuyet -> 409 INVALID_STATE
      const resRejectAgain = await request(server, {
        path: `/api/admin/borrowings/${pRejectTest._id}/reject`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenThuthu}` },
      }, { LyDoTuChoi: 'Thu tu choi lai' });
      if (resRejectAgain.status !== 409) {
        throw new Error('Tu choi phieu da TuChoi phai tra ve 409 INVALID_STATE');
      }
      logPass('Tu choi phieu khong o ChoDuyet bi chan 409 INVALID_STATE');
    } catch (err) {
      logFail('PATCH /api/admin/borrowings/:id/reject', err);
    }

    // ---------------------------------------------------------
    // 7. PATCH /api/admin/borrowings/:id/handover (GIAO SACH)
    // ---------------------------------------------------------
    console.log('\n--- 7. PATCH /api/admin/borrowings/:id/handover ---');
    try {
      // 1. Giao sach cho phieu DaDuyet hop le -> 200, TrangThai = DangMuon, NgayMuon = now, HanTra = now + 14d
      const resHandover = await request(server, {
        path: `/api/admin/borrowings/${pDaDuyet1._id}/handover`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });

      if (resHandover.status !== 200 || resHandover.body.data.TrangThai !== 'DangMuon') {
        throw new Error('Giao sach cho phieu DaDuyet that bai');
      }
      if (!resHandover.body.data.NgayMuon || !resHandover.body.data.HanTra || resHandover.body.data.MSNVGiao !== STAFF_THUTHU) {
        throw new Error('NgayMuon, HanTra, MSNVGiao chua duoc thiet lap day du');
      }

      // Kiem tra NhatKy GIAO_SACH
      const logHandover = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(pDaDuyet1._id),
        HanhDong: 'GIAO_SACH',
      }).lean();
      if (!logHandover || logHandover.MSNV !== STAFF_THUTHU) {
        throw new Error('NhatKy GIAO_SACH chua duoc ghi dung');
      }
      logPass('Giao sach thanh cong 200: TrangThai sang DangMuon, set NgayMuon va HanTra, NhatKy da ghi');

      // 2. Giao sach cho phieu khong phai DaDuyet (vd: DangMuon vua xong) -> 409 INVALID_STATE
      const resHandoverAgain = await request(server, {
        path: `/api/admin/borrowings/${pDaDuyet1._id}/handover`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resHandoverAgain.status !== 409) {
        throw new Error('Giao lai phieu da DangMuon phai tra ve 409 INVALID_STATE');
      }
      logPass('Giao sach cho phieu khong o DaDuyet bi chan 409 INVALID_STATE');

      // 3. Giao sach cho phieu da qua HanNhanSach -> 409 INVALID_STATE
      const pExpiredPickup = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: bookCodes[4],
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(Date.now() - 5 * 86400000),
        HanNhanSach: new Date(Date.now() - 2 * 86400000), // Het han nhan sach tu 2 ngay truoc
        MSNVDuyet: STAFF_THUTHU,
      });

      const resExpiredHandover = await request(server, {
        path: `/api/admin/borrowings/${pExpiredPickup._id}/handover`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resExpiredHandover.status !== 409) {
        throw new Error('Phieu qua HanNhanSach phai bi chan 409 khi giao sach');
      }
      logPass('Giao sach cho phieu qua HanNhanSach bi chan 409 INVALID_STATE');
    } catch (err) {
      logFail('PATCH /api/admin/borrowings/:id/handover', err);
    }

    // ---------------------------------------------------------
    // 8. PATCH /api/admin/borrowings/:id/cancel (ADMIN HUY PHIEU)
    // ---------------------------------------------------------
    console.log('\n--- 8. PATCH /api/admin/borrowings/:id/cancel ---');
    try {
      // 1. Admin huy phieu ChoDuyet -> DaHuy, kho khong doi
      const pAdminCancelChoDuyet = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: bookCodes[0],
        TrangThai: 'ChoDuyet',
      });
      const stockBeforeCancel = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;

      const resAdminCancel1 = await request(server, {
        path: `/api/admin/borrowings/${pAdminCancelChoDuyet._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resAdminCancel1.status !== 200 || resAdminCancel1.body.data.TrangThai !== 'DaHuy') {
        throw new Error('Nhan vien huy phieu ChoDuyet that bai');
      }
      const stockAfterCancel = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      if (stockAfterCancel !== stockBeforeCancel) {
        throw new Error('Huy ChoDuyet khong duoc thay doi kho');
      }
      logPass('Nhan vien huy phieu ChoDuyet thanh cong: TrangThai sang DaHuy, kho khong doi');

      // 2. Admin huy phieu DaDuyet -> DaHuy, tu dong hoan kho (+1 SoQuyenConLai)
      // Mo phong da duyet: giam kho 1
      await Sach.updateOne({ MaSach: bookCodes[0] }, { $inc: { SoQuyenConLai: -1 } });
      const stockBeforeCancelApproved = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;

      const pAdminCancelDaDuyet = await TheoDoiMuonSach.create({
        MaDocGia: DG_2,
        MaSach: bookCodes[0],
        TrangThai: 'DaDuyet',
        MSNVDuyet: STAFF_THUTHU,
      });

      const resAdminCancel2 = await request(server, {
        path: `/api/admin/borrowings/${pAdminCancelDaDuyet._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });
      if (resAdminCancel2.status !== 200 || resAdminCancel2.body.data.TrangThai !== 'DaHuy') {
        throw new Error('Nhan vien huy phieu DaDuyet that bai');
      }
      const stockAfterCancelApproved = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      if (stockAfterCancelApproved !== stockBeforeCancelApproved + 1) {
        throw new Error('Huy DaDuyet phai hoan lai 1 quyen vao kho');
      }
      logPass('Nhan vien huy phieu DaDuyet thanh cong: TrangThai sang DaHuy va tu dong hoan kho (+1)');
    } catch (err) {
      logFail('PATCH /api/admin/borrowings/:id/cancel', err);
    }

  } catch (error) {
    console.error('Loi tong the trong checkAdminBorrowings:', error);
  } finally {
    console.log('\n--- DON DEP DU LIEU THU NGHIEM ---');
    await cleanTestData();
    await new Promise((resolve) => server.close(resolve));
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
        { MaSach: { $regex: /^S666\d|^S669\d/ } },
      ],
    });
    await Sach.deleteMany({ MaSach: { $regex: /^S666\d|^S669\d/ } });
    await NhaXuatBan.deleteMany({ MaNXB: NXB_CODE });
    await DocGia.deleteMany({ MaDocGia: { $regex: `^${PREFIX}` } });
    await NhanVien.deleteMany({ MSNV: { $regex: `^${PREFIX}` } });
    await NhatKy.deleteMany({
      $or: [
        { MSNV: { $regex: `^${PREFIX}` } },
        { 'ChiTiet.MaDocGia': { $regex: `^${PREFIX}` } },
      ],
    });
  } catch (err) {
    console.error('Loi don dep du lieu test:', err.message);
  }
};

runTests();
