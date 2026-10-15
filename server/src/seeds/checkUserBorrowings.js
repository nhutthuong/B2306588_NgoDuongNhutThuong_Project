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

const PREFIX = 'TEST_UB_';
const NXB_CODE = 'NXB_TEST_UB';

const runTests = async () => {
  const startTime = Date.now();
  console.log('\n======================================================');
  console.log('KIEM TRA TASK P3-2: API USER MUON SACH');
  console.log('======================================================\n');

  await connectDB();
  await cleanTestData();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    console.log('--- 1. CHUAN BI DU LIEU MAU ---');

    await NhaXuatBan.create({
      MaNXB: NXB_CODE,
      TenNXB: 'NXB Test P3-2',
      DiaChi: 'Can Tho',
    });

    const bookCodes = [];
    for (let i = 1; i <= 8; i++) {
      const code = `S777${i}`;
      bookCodes.push(code);
      await Sach.create({
        MaSach: code,
        TenSach: `Sach Test P3-2 So ${i}`,
        DonGia: 45000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        MaNXB: NXB_CODE,
        NguonGocTacGia: 'Tac Gia P3-2',
      });
    }

    const BOOK_DELETED = 'S7791';
    await Sach.create({
      MaSach: BOOK_DELETED,
      TenSach: 'Sach Test Da Xoa P3-2',
      DonGia: 50000,
      SoQuyen: 5,
      SoQuyenConLai: 5,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia P3-2',
      DaXoa: true,
    });

    const BOOK_OUT = 'S7792';
    await Sach.create({
      MaSach: BOOK_OUT,
      TenSach: 'Sach Test Het Hang P3-2',
      DonGia: 60000,
      SoQuyen: 5,
      SoQuyenConLai: 0,
      MaNXB: NXB_CODE,
      NguonGocTacGia: 'Tac Gia P3-2',
    });

    // Tạo độc giả
    const DG_A = `${PREFIX}DG_A`;
    const DG_B = `${PREFIX}DG_B`;
    const DG_LOCKED = `${PREFIX}DG_LOCKED`;

    const userA = await DocGia.create({
      MaDocGia: DG_A,
      HoLot: 'Nguyen',
      Ten: 'Doc Gia A',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nam',
      Email: `${DG_A.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    const userB = await DocGia.create({
      MaDocGia: DG_B,
      HoLot: 'Tran',
      Ten: 'Doc Gia B',
      NgaySinh: new Date('2001-02-02'),
      Phai: 'Nu',
      Email: `${DG_B.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    const userLocked = await DocGia.create({
      MaDocGia: DG_LOCKED,
      HoLot: 'Le',
      Ten: 'Bi Khoa',
      NgaySinh: new Date('1999-03-03'),
      Phai: 'Khac',
      Email: `${DG_LOCKED.toLowerCase()}@test.vn`,
      Password: 'Password123',
      TrangThai: 'BiKhoa',
    });

    // Tạo nhân viên để thử token isolation
    const staffAccount = {
      MSNV: `${PREFIX}NV01`,
      VaiTro: 'thuthu',
    };

    const tokenA = signAccessToken(userA, 'docgia');
    const tokenB = signAccessToken(userB, 'docgia');
    const tokenLocked = signAccessToken(userLocked, 'docgia');
    const tokenStaff = signAccessToken(staffAccount, 'nhanvien');

    logPass('Khoi tao du lieu test thanh cong');

    // ---------------------------------------------------------
    // 2. GET /api/user/policy
    // ---------------------------------------------------------
    console.log('\n--- 2. GET /api/user/policy ---');
    try {
      const res = await request(server, { path: '/api/user/policy' });
      if (res.status !== 200) throw new Error(`Status phai la 200, thuc te: ${res.status}`);
      if (!res.body.success || !res.body.data) throw new Error('Response policy khong dung chuan { success, data }');
      const { SoSachToiDa, SoNgayMuon, HanNhanSach, PhiTreMoiNgay } = res.body.data;
      if (SoSachToiDa !== 5 || SoNgayMuon !== 14 || HanNhanSach !== 2 || PhiTreMoiNgay !== 2000) {
        throw new Error('Gia tri policy mac dinh khong dung');
      }
      logPass('GET /api/user/policy tra ve thanh cong, cong khai khong can token');
    } catch (err) {
      logFail('GET /api/user/policy', err);
    }

    // ---------------------------------------------------------
    // 3. XAC THUC & PHAN QUYEN TREN /api/user/borrowings/*
    // ---------------------------------------------------------
    console.log('\n--- 3. XAC THUC & PHAN QUYEN ---');
    try {
      // Khong token -> 401
      const resNoToken = await request(server, { path: '/api/user/borrowings' });
      if (resNoToken.status !== 401 || resNoToken.body?.error?.code !== 'UNAUTHENTICATED') {
        throw new Error('Khong token phai tra ve 401 UNAUTHENTICATED');
      }
      logPass('Khong token bi chan 401 UNAUTHENTICATED');

      // Token nhan vien tren user API -> 401
      const resStaffToken = await request(server, {
        path: '/api/user/borrowings',
        headers: { Authorization: `Bearer ${tokenStaff}` },
      });
      if (resStaffToken.status !== 401) {
        throw new Error('Token nhan vien tren user API phai bi tu choi 401');
      }
      logPass('Token nhan vien goi user API bi chan 401 (token isolation)');

      // Tai khoan BiKhoa -> 403 ACCOUNT_LOCKED
      const resLocked = await request(server, {
        path: '/api/user/borrowings',
        headers: { Authorization: `Bearer ${tokenLocked}` },
      });
      if (resLocked.status !== 403 || resLocked.body?.error?.code !== 'ACCOUNT_LOCKED') {
        throw new Error('Tai khoan BiKhoa phai bi chan 403 ACCOUNT_LOCKED');
      }
      logPass('Tai khoan BiKhoa bi chan 403 ACCOUNT_LOCKED');
    } catch (err) {
      logFail('Kiem tra xac thuc & phan quyen', err);
    }

    // ---------------------------------------------------------
    // 4. POST /api/user/borrowings (DANG KY MUON SACH)
    // ---------------------------------------------------------
    console.log('\n--- 4. POST /api/user/borrowings ---');
    let phieuCreatedA1 = null;
    try {
      // 1. Thieu body -> 400
      const resEmpty = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, {});
      if (resEmpty.status !== 400 || resEmpty.body?.error?.code !== 'VALIDATION_ERROR') {
        throw new Error('Thieu MaSach phai tra ve 400 VALIDATION_ERROR');
      }
      logPass('Thieu MaSach bi chan 400 VALIDATION_ERROR');

      // 2. Gui truong la -> 400
      const resExtra = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: bookCodes[0], truongLa: 123 });
      if (resExtra.status !== 400) {
        throw new Error('Gui truong la phai bi chan 400 VALIDATION_ERROR');
      }
      logPass('Gui truong la bi chan 400 VALIDATION_ERROR');

      // 3. MaSach sai dinh dang -> 400
      const resBadFormat = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: 'SACH_01' });
      if (resBadFormat.status !== 400) {
        throw new Error('MaSach sai dinh dang phai bi chan 400');
      }
      logPass('MaSach sai dinh dang bi chan 400 VALIDATION_ERROR');

      // 4. Sach khong ton tai -> 404
      const resNotFound = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: 'S99999' });
      if (resNotFound.status !== 404 || resNotFound.body?.error?.code !== 'NOT_FOUND') {
        throw new Error('Sach khong ton tai phai tra ve 404 NOT_FOUND');
      }
      logPass('Sach khong ton tai tra ve 404 NOT_FOUND');

      // 5. Sach DaXoa -> 404
      const resDeleted = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: BOOK_DELETED });
      if (resDeleted.status !== 404) {
        throw new Error('Sach DaXoa phai tra ve 404 NOT_FOUND');
      }
      logPass('Sach da xoa mem tra ve 404 NOT_FOUND');

      // 6. Sach het quyen (SoQuyenConLai = 0) -> 409 OUT_OF_STOCK
      const resOutOfStock = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: BOOK_OUT });
      if (resOutOfStock.status !== 409 || resOutOfStock.body?.error?.code !== 'OUT_OF_STOCK') {
        throw new Error('Sach het hang phai tra ve 409 OUT_OF_STOCK');
      }
      logPass('Sach het hang tra ve 409 OUT_OF_STOCK');

      // 7. Dang ky thanh cong -> 201
      const bookBefore = await Sach.findOne({ MaSach: bookCodes[0] }).lean();
      const resSuccess = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: bookCodes[0] });

      if (resSuccess.status !== 201 || !resSuccess.body?.data) {
        throw new Error(`Dang ky that bai, status: ${resSuccess.status}`);
      }
      phieuCreatedA1 = resSuccess.body.data;
      if (phieuCreatedA1.TrangThai !== 'ChoDuyet' || phieuCreatedA1.MaDocGia !== DG_A) {
        throw new Error('Phieu tao moi co thong tin khong chinh xac');
      }

      // Kiem tra kho sach KHONG bi tru
      const bookAfter = await Sach.findOne({ MaSach: bookCodes[0] }).lean();
      if (bookAfter.SoQuyenConLai !== bookBefore.SoQuyenConLai) {
        throw new Error('Dang ky khong duoc tru SoQuyenConLai');
      }

      // Kiem tra NhatKy da duoc ghi
      const log = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(phieuCreatedA1._id),
        HanhDong: 'DANG_KY_MUON',
      }).lean();
      if (!log || log.MSNV !== DG_A) {
        throw new Error('NhatKy DANG_KY_MUON khong duoc ghi dung');
      }

      logPass('POST /api/user/borrowings dang ky thanh cong 201, kho khong doi, NhatKy da ghi');

      // 8. Dang ky lai cung sach khi dang ChoDuyet -> 409 ALREADY_BORROWING
      const resDup = await request(server, {
        path: '/api/user/borrowings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      }, { MaSach: bookCodes[0] });
      if (resDup.status !== 409 || resDup.body?.error?.code !== 'ALREADY_BORROWING') {
        throw new Error('Dang ky lai cung sach phai tra ve 409 ALREADY_BORROWING');
      }
      logPass('Dang ky lai cung sach bi chan 409 ALREADY_BORROWING');
    } catch (err) {
      logFail('POST /api/user/borrowings', err);
    }

    // ---------------------------------------------------------
    // 5. GET /api/user/borrowings/summary
    // ---------------------------------------------------------
    console.log('\n--- 5. GET /api/user/borrowings/summary ---');
    try {
      const resSummary = await request(server, {
        path: '/api/user/borrowings/summary',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      if (resSummary.status !== 200 || !resSummary.body?.data) {
        throw new Error('GET /summary that bai');
      }
      const sum = resSummary.body.data;
      if (sum.dangChiemCho !== 1 || sum.toiDa !== 5 || sum.conDuocMuon !== 4 || sum.coQuaHan !== false) {
        throw new Error(`So lieu summary khong dung: ${JSON.stringify(sum)}`);
      }
      logPass('GET /api/user/borrowings/summary tra ve so lieu chinh xac');
    } catch (err) {
      logFail('GET /api/user/borrowings/summary', err);
    }

    // ---------------------------------------------------------
    // 6. GET /api/user/borrowings (DANH SACH PHIEU & CO LAP DOC GIA)
    // ---------------------------------------------------------
    console.log('\n--- 6. GET /api/user/borrowings ---');
    try {
      // 1. Doc gia A xem danh sach: chi thay phieu cua A
      const resListA = await request(server, {
        path: '/api/user/borrowings',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resListA.status !== 200 || !Array.isArray(resListA.body?.data)) {
        throw new Error('GET /borrowings cua DocGia A that bai');
      }
      if (resListA.body.data.length !== 1 || resListA.body.data[0].MaDocGia !== DG_A) {
        throw new Error('DocGia A phai thay dung 1 phieu cua minh');
      }
      const item = resListA.body.data[0];
      if (item.isOverdue === undefined || item.soNgayTre === undefined) {
        throw new Error('Moi phieu trong danh sach phai kem co isOverdue va soNgayTre');
      }
      if (!item.Sach || item.Sach.MaSach !== bookCodes[0]) {
        throw new Error('Phieu phai populate thong tin Sach');
      }
      if (!resListA.body.meta || resListA.body.meta.total !== 1) {
        throw new Error('Meta phan trang thieu hoac sai');
      }
      logPass('DocGia A xem danh sach phieu cua minh: kem co isOverdue, soNgayTre, populate Sach');

      // 2. Doc gia B xem danh sach: khong thay phieu cua A (co lap 100%)
      const resListB = await request(server, {
        path: '/api/user/borrowings',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      if (resListB.body.data.length !== 0) {
        throw new Error('DocGia B khong duoc phep thay phieu cua DocGia A');
      }
      logPass('Co lap du lieu giua cac doc gia hoan hao (DocGia B co 0 phieu)');

      // 3. Loc theo trangThai
      const resFiltered = await request(server, {
        path: '/api/user/borrowings?trangThai=DaTra',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resFiltered.body.data.length !== 0) {
        throw new Error('Loc trangThai=DaTra phai tra ve 0 ban ghi');
      }
      logPass('Loc theo trangThai hoat dong chinh xac');

      // 4. Validate query sai: limit > 100
      const resBadQuery = await request(server, {
        path: '/api/user/borrowings?limit=200',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resBadQuery.status !== 400) {
        throw new Error('limit > 100 phai bi chan 400 VALIDATION_ERROR');
      }
      logPass('limit > 100 bi tu choi 400 VALIDATION_ERROR');
    } catch (err) {
      logFail('GET /api/user/borrowings', err);
    }

    // ---------------------------------------------------------
    // 7. GET /api/user/borrowings/:id (CHI TIET PHIEU)
    // ---------------------------------------------------------
    console.log('\n--- 7. GET /api/user/borrowings/:id ---');
    try {
      // 1. Doc gia A xem phieu cua chinh minh -> 200
      const resDetailOwn = await request(server, {
        path: `/api/user/borrowings/${phieuCreatedA1._id}`,
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resDetailOwn.status !== 200 || resDetailOwn.body.data._id !== String(phieuCreatedA1._id)) {
        throw new Error('DocGia A xem phieu cua minh that bai');
      }
      if (!resDetailOwn.body.data.Sach || !resDetailOwn.body.data.Sach.NhaXuatBan) {
        throw new Error('Chi tiet phieu phai populate Sach va NhaXuatBan');
      }
      logPass('DocGia A xem chi tiet phieu cua minh thanh cong (200, kem Sach & NhaXuatBan)');

      // 2. Doc gia B xem phieu cua DocGia A -> 404 NOT_FOUND (chong IDOR)
      const resDetailOther = await request(server, {
        path: `/api/user/borrowings/${phieuCreatedA1._id}`,
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      if (resDetailOther.status !== 404 || resDetailOther.body?.error?.code !== 'NOT_FOUND') {
        throw new Error('DocGia B xem phieu cua A phai bi tra ve 404 NOT_FOUND de chong IDOR');
      }
      logPass('DocGia B xem phieu cua DocGia A bi tra ve 404 NOT_FOUND (chong IDOR)');

      // 3. ID khong dung dinh dang hex -> 400
      const resBadId = await request(server, {
        path: '/api/user/borrowings/invalid-hex-id-123',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resBadId.status !== 400) {
        throw new Error('ID sai dinh dang phai tra ve 400 VALIDATION_ERROR');
      }
      logPass('ID sai dinh dang bi chan 400 VALIDATION_ERROR');
    } catch (err) {
      logFail('GET /api/user/borrowings/:id', err);
    }

    // ---------------------------------------------------------
    // 8. PATCH /api/user/borrowings/:id/cancel (HUY PHIEU)
    // ---------------------------------------------------------
    console.log('\n--- 8. PATCH /api/user/borrowings/:id/cancel ---');
    try {
      // 1. Doc gia B co tinh huy phieu cua DocGia A -> 404
      const resCancelOther = await request(server, {
        path: `/api/user/borrowings/${phieuCreatedA1._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      if (resCancelOther.status !== 404) {
        throw new Error('DocGia B huy phieu cua A phai tra ve 404 NOT_FOUND');
      }
      logPass('DocGia B co tinh huy phieu cua DocGia A bi chan 404 NOT_FOUND');

      // 2. DocGia A huy phieu ChoDuyet cua minh -> 200, DaHuy, kho khong doi
      const bookStockBefore = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      const resCancelChoDuyet = await request(server, {
        path: `/api/user/borrowings/${phieuCreatedA1._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resCancelChoDuyet.status !== 200 || resCancelChoDuyet.body.data.TrangThai !== 'DaHuy') {
        throw new Error('Huy phieu ChoDuyet that bai');
      }
      const bookStockAfter = (await Sach.findOne({ MaSach: bookCodes[0] })).SoQuyenConLai;
      if (bookStockAfter !== bookStockBefore) {
        throw new Error('Huy tu ChoDuyet khong duoc lam thay doi SoQuyenConLai');
      }

      // Kiem tra NhatKy HUY_PHIEU
      const cancelLog = await NhatKy.findOne({
        DoiTuong: 'TheoDoiMuonSach',
        MaDoiTuong: String(phieuCreatedA1._id),
        HanhDong: 'HUY_PHIEU',
      }).lean();
      if (!cancelLog || cancelLog.MSNV !== DG_A) {
        throw new Error('NhatKy HUY_PHIEU khong duoc ghi dung');
      }
      logPass('Huy phieu ChoDuyet thanh cong: TrangThai sang DaHuy, kho khong doi, NhatKy da ghi');

      // 3. Huy lai phieu vua DaHuy -> 409 INVALID_STATE
      const resCancelAlready = await request(server, {
        path: `/api/user/borrowings/${phieuCreatedA1._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resCancelAlready.status !== 409 || resCancelAlready.body?.error?.code !== 'INVALID_STATE') {
        throw new Error('Huy phieu da huy phai bi tu choi 409 INVALID_STATE');
      }
      logPass('Huy lai phieu da o DaHuy bi chan 409 INVALID_STATE');

      // 4. Huy phieu DaDuyet -> 200, DaHuy, HOAN KHO (+1 SoQuyenConLai)
      // Tao 1 phieu o trang thai DaDuyet (mo phong thu thu da duyet tru 1 kho)
      await Sach.updateOne({ MaSach: bookCodes[1] }, { $inc: { SoQuyenConLai: -1 } });
      const stockBeforeApprovedCancel = (await Sach.findOne({ MaSach: bookCodes[1] })).SoQuyenConLai;

      const phieuDaDuyet = await TheoDoiMuonSach.create({
        MaDocGia: DG_A,
        MaSach: bookCodes[1],
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(),
        HanNhanSach: new Date(Date.now() + 2 * 86400000),
      });

      const resCancelDaDuyet = await request(server, {
        path: `/api/user/borrowings/${phieuDaDuyet._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      if (resCancelDaDuyet.status !== 200 || resCancelDaDuyet.body.data.TrangThai !== 'DaHuy') {
        throw new Error('Huy phieu DaDuyet that bai');
      }

      const stockAfterApprovedCancel = (await Sach.findOne({ MaSach: bookCodes[1] })).SoQuyenConLai;
      if (stockAfterApprovedCancel !== stockBeforeApprovedCancel + 1) {
        throw new Error(
          `Hoan kho that bai! Truoc khi huy: ${stockBeforeApprovedCancel}, sau khi huy: ${stockAfterApprovedCancel}`
        );
      }
      logPass('Huy phieu DaDuyet thanh cong: TrangThai sang DaHuy va tu dong hoan kho (+1 SoQuyenConLai)');

      // 5. Huy phieu DangMuon hoac DaTra -> 409 INVALID_STATE
      const phieuDangMuon = await TheoDoiMuonSach.create({
        MaDocGia: DG_A,
        MaSach: bookCodes[2],
        TrangThai: 'DangMuon',
        HanTra: new Date(Date.now() + 14 * 86400000),
      });
      const resCancelDangMuon = await request(server, {
        path: `/api/user/borrowings/${phieuDangMuon._id}/cancel`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      if (resCancelDangMuon.status !== 409) {
        throw new Error('Huy phieu DangMuon phai tra ve 409 INVALID_STATE');
      }
      logPass('Huy phieu DangMuon bi chan 409 INVALID_STATE');
    } catch (err) {
      logFail('PATCH /api/user/borrowings/:id/cancel', err);
    }

  } catch (error) {
    console.error('Loi nghiem trong trong checkUserBorrowings:', error);
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
        { MaSach: { $regex: /^S777\d|^S779\d/ } },
      ],
    });
    await Sach.deleteMany({ MaSach: { $regex: /^S777\d|^S779\d/ } });
    await NhaXuatBan.deleteMany({ MaNXB: NXB_CODE });
    await DocGia.deleteMany({ MaDocGia: { $regex: `^${PREFIX}` } });
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
