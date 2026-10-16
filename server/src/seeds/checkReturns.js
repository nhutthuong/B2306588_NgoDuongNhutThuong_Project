import http from 'http';
import mongoose from 'mongoose';
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
import { getSettings } from '../services/settings.service.js';
import {
  tinhPhiTre,
  tinhPhatTinhTrang,
  tinhTongPhat,
} from '../services/fine.service.js';

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

const PREFIX = 'TEST_RET_';
const NXB_CODE = 'NXB_TEST_RET';
const DON_GIA_CO_DINH = 100000;

const cleanTestData = async () => {
  try {
    await NhaXuatBan.deleteMany({ MaNXB: NXB_CODE });
    await Sach.deleteMany({
      $or: [
        { MaSach: new RegExp(`^${PREFIX}`) },
        { MaSach: /^S88\d{2,}$/ },
      ],
    });
    await DocGia.deleteMany({ MaDocGia: new RegExp(`^${PREFIX}`) });
    await NhanVien.deleteMany({ MSNV: new RegExp(`^${PREFIX}`) });
    await TheoDoiMuonSach.deleteMany({
      $or: [
        { MaDocGia: new RegExp(`^${PREFIX}`) },
        { MaSach: new RegExp(`^${PREFIX}`) },
        { MaSach: /^S88\d{2,}$/ },
      ],
    });
    await NhatKy.deleteMany({
      $or: [
        { MSNV: new RegExp(`^${PREFIX}`) },
        { MaDocGia: new RegExp(`^${PREFIX}`) },
      ],
    });
  } catch (err) {
    console.error('Loi khi don dep du lieu cu:', err.message);
  }
};

const runTests = async () => {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('KIEM TRA TASK P3-4: NHAN TRA SACH, TINH PHAT, THU PHAT VA HUY PHIEU');
  console.log('================================================================\n');

  await connectDB();
  await cleanTestData();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const settings = await getSettings();

    // 0. Test ham thuan fine.service (Scenario n)
    console.log('--- 0. KIEM TRA HAM THUAN fine.service (SCENARIO N) ---');
    try {
      // DonGia = 0
      const phiZero = tinhPhiTre({
        hanTra: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        now: new Date(),
        donGia: 0,
        phiTreMoiNgay: 2000,
      });
      if (phiZero === 0) {
        logPass('fine.service.tinhPhiTre voi DonGia = 0 tra ve 0');
      } else {
        logFail('fine.service.tinhPhiTre voi DonGia = 0', `Ket qua: ${phiZero}`);
      }

      const phatRachZero = tinhPhatTinhTrang({
        tinhTrangTra: 'Rach',
        mucRach: 'Nang',
        donGia: 0,
        settings,
      });
      if (phatRachZero === 0) {
        logPass('fine.service.tinhPhatTinhTrang voi DonGia = 0 tra ve 0');
      } else {
        logFail('fine.service.tinhPhatTinhTrang voi DonGia = 0', `Ket qua: ${phatRachZero}`);
      }

      const phatMatZero = tinhPhatTinhTrang({
        tinhTrangTra: 'Mat',
        donGia: 0,
        settings,
      });
      if (phatMatZero === Math.round(settings.PhiXuLyMat)) {
        logPass('fine.service.tinhPhatTinhTrang Mat voi DonGia = 0 tra ve dung PhiXuLyMat');
      } else {
        logFail('fine.service.tinhPhatTinhTrang Mat voi DonGia = 0', `Ket qua: ${phatMatZero}`);
      }

      // Ca bien: lam tron va he so
      const phatNheLe = tinhPhatTinhTrang({
        tinhTrangTra: 'Rach',
        mucRach: 'Nhe',
        donGia: 12345,
        settings: { TyLePhatRach: 0.5 },
      });
      // 0.5 * 12345 * 0.5 = 3086.25 -> 3086
      if (phatNheLe === 3086) {
        logPass('fine.service.tinhPhatTinhTrang Rach Nhe lam tron so nguyen chinh xac');
      } else {
        logFail('fine.service.tinhPhatTinhTrang Rach Nhe lam tron', `Ket qua: ${phatNheLe}, mong doi: 3086`);
      }

      // Tham so khong hop le nem loi, khong tra NaN
      let threwInvalid = false;
      try {
        tinhPhatTinhTrang({
          tinhTrangTra: 'LaLung',
          donGia: 50000,
          settings,
        });
      } catch {
        threwInvalid = true;
      }
      if (threwInvalid) {
        logPass('fine.service nem loi khi tinhTrangTra la, khong tra NaN');
      } else {
        logFail('fine.service khong nem loi voi tinhTrangTra la');
      }
    } catch (err) {
      logFail('fine.service kiem tra ham thuan', err);
    }

    // 1. Chuan bi du lieu mau
    console.log('\n--- 1. CHUAN BI DU LIEU MAU ---');
    await NhaXuatBan.create({
      MaNXB: NXB_CODE,
      TenNXB: 'NXB Test Returns P3-4',
      DiaChi: 'Can Tho',
    });

    const STAFF_THUTHU = `${PREFIX}NV_THUTHU`;
    const STAFF_ADMIN = `${PREFIX}NV_ADMIN`;
    const STAFF_PENDING = `${PREFIX}NV_PENDING`;

    await NhanVien.create([
      {
        MSNV: STAFF_THUTHU,
        HoTenNV: 'Thu Thu Test',
        Password: 'Password123',
        ChucVu: 'Thủ thư',
        VaiTro: 'thuthu',
        BatBuocDoiMatKhau: false,
        TrangThai: 'HoatDong',
      },
      {
        MSNV: STAFF_ADMIN,
        HoTenNV: 'Admin Test',
        Password: 'Password123',
        ChucVu: 'Quản trị viên',
        VaiTro: 'admin',
        BatBuocDoiMatKhau: false,
        TrangThai: 'HoatDong',
      },
      {
        MSNV: STAFF_PENDING,
        HoTenNV: 'Nhan Vien Pending',
        Password: 'Password123',
        ChucVu: 'Nhân viên mới',
        VaiTro: 'thuthu',
        BatBuocDoiMatKhau: true,
        TrangThai: 'HoatDong',
      },
    ]);

    const thuthuToken = signAccessToken({ MSNV: STAFF_THUTHU, VaiTro: 'thuthu' }, 'nhanvien');
    const adminToken = signAccessToken({ MSNV: STAFF_ADMIN, VaiTro: 'admin' }, 'nhanvien');
    const pendingToken = signAccessToken({ MSNV: STAFF_PENDING, VaiTro: 'thuthu' }, 'nhanvien');

    const authHeaders = (token) => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    // Tạo các độc giả thử
    const READER_1 = `${PREFIX}DG01`;
    const READER_2 = `${PREFIX}DG02`;
    const READER_3 = `${PREFIX}DG03`;

    await DocGia.create([
      {
        MaDocGia: READER_1,
        HoLot: 'Nguyen Van',
        Ten: 'DocGia1',
        Password: 'Password123',
        NgaySinh: new Date('2000-01-01'),
        Phai: 'Nam',
        Email: 'dg1_p34@test.com',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: READER_2,
        HoLot: 'Tran Thi',
        Ten: 'DocGia2',
        Password: 'Password123',
        NgaySinh: new Date('2001-02-02'),
        Phai: 'Nu',
        Email: 'dg2_p34@test.com',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: READER_3,
        HoLot: 'Le Van',
        Ten: 'DocGia3',
        Password: 'Password123',
        NgaySinh: new Date('1999-03-03'),
        Phai: 'Nam',
        Email: 'dg3_p34@test.com',
        TrangThai: 'HoatDong',
      },
    ]);
    const readerToken = signAccessToken({ MaDocGia: READER_1 }, 'docgia');

    // Tạo sách thử với mã S88XX hợp lệ với regex ^S\d{4,}$
    let bookCounter = 8800;
    const createBook = async (suffix, soQuyen = 10, soQuyenConLai = 9, daXoa = false) => {
      bookCounter++;
      const code = `S${bookCounter}`;
      return Sach.create({
        MaSach: code,
        TenSach: `Sach Test Return ${suffix} (${code})`,
        DonGia: DON_GIA_CO_DINH,
        SoQuyen: soQuyen,
        SoQuyenConLai: soQuyenConLai,
        MaNXB: NXB_CODE,
        NguonGocTacGia: 'Tac Gia Test',
        DaXoa: daXoa,
      });
    };

    console.log('[PASS] Chuan bi du lieu nhan vien, doc gia va NXB thanh cong');

    // a. Trả BinhThuong đúng hạn
    console.log('\n--- a. TRA BinhThuong DUNG HAN ---');
    {
      const bookA = await createBook('01', 5, 4);
      const phieuA = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookA.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Con 5 ngay
      });

      const res = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuA._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );

      const updatedBook = await Sach.findOne({ MaSach: bookA.MaSach });
      const updatedPhieu = await TheoDoiMuonSach.findById(phieuA._id);

      if (
        res.status === 200 &&
        res.body.success &&
        res.body.data.TrangThai === 'DaTra' &&
        res.body.data.PhiTre === 0 &&
        res.body.data.TienPhat === 0 &&
        res.body.data.TrangThaiPhat === 'KhongPhat' &&
        res.body.data.MSNVNhanTra === STAFF_THUTHU &&
        updatedBook.SoQuyenConLai === 5 &&
        updatedBook.SoQuyen === 5 &&
        res.body.data.chiTietPhat?.soNgayTre === 0
      ) {
        logPass('a. Tra BinhThuong dung han: DaTra, PhiTre = 0, TienPhat = 0, KhongPhat, SoQuyenConLai +1, SoQuyen giu nguyen');
      } else {
        logFail(
          'a. Tra BinhThuong dung han',
          `Status: ${res.status}, body: ${JSON.stringify(res.body)}, bookConLai: ${updatedBook?.SoQuyenConLai}`
        );
      }
    }

    // b. Trễ hạn: kiểm tra các mốc
    console.log('\n--- b. TRE HAN (CAC MOC THOI GIAN) ---');
    {
      const phiTreMoiNgay = settings.PhiTreMoiNgay;
      const testMocs = [
        { name: 'Dung ngay han (0 phi)', diffMs: -60 * 1000, expectedDays: 0, expectedPhi: 0, expectedPhat: 'KhongPhat' },
        { name: 'Tre 1 gio (1 ngay)', diffMs: 1 * 60 * 60 * 1000, expectedDays: 1, expectedPhi: 1 * phiTreMoiNgay, expectedPhat: 'ChuaThanhToan' },
        { name: 'Tre dung 1 ngay (24h)', diffMs: 24 * 60 * 60 * 1000 - 30 * 1000, expectedDays: 1, expectedPhi: 1 * phiTreMoiNgay, expectedPhat: 'ChuaThanhToan' },
        { name: 'Tre 1 ngay 1 gio (25h)', diffMs: 25 * 60 * 60 * 1000, expectedDays: 2, expectedPhi: 2 * phiTreMoiNgay, expectedPhat: 'ChuaThanhToan' },
        { name: 'Tre 5 ngay', diffMs: 5 * 24 * 60 * 60 * 1000 - 30 * 1000, expectedDays: 5, expectedPhi: 5 * phiTreMoiNgay, expectedPhat: 'ChuaThanhToan' },
        { name: 'Tre 1000 ngay (chan tran DonGia)', diffMs: 1000 * 24 * 60 * 60 * 1000 - 30 * 1000, expectedDays: 1000, expectedPhi: DON_GIA_CO_DINH, expectedPhat: 'ChuaThanhToan' },
      ];

      let allMocsPassed = true;
      for (let i = 0; i < testMocs.length; i++) {
        const moc = testMocs[i];
        const bookB = await createBook(`B${i}`, 5, 4);
        const hanTra = new Date(Date.now() - moc.diffMs);
        const phieuB = await TheoDoiMuonSach.create({
          MaDocGia: READER_1,
          MaSach: bookB.MaSach,
          TrangThai: 'DangMuon',
          NgayMuon: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          HanTra: hanTra,
        });

        const res = await request(
          server,
          {
            path: `/api/admin/borrowings/${phieuB._id}/return`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          },
          { TinhTrangTra: 'BinhThuong' }
        );

        if (
          res.status === 200 &&
          res.body.data.PhiTre === moc.expectedPhi &&
          res.body.data.TienPhat === moc.expectedPhi &&
          res.body.data.TrangThaiPhat === moc.expectedPhat &&
          res.body.data.chiTietPhat?.soNgayTre === moc.expectedDays
        ) {
          logPass(`b. Moc tre han: ${moc.name} -> PhiTre = ${moc.expectedPhi}, TrangThaiPhat = ${moc.expectedPhat}`);
        } else {
          allMocsPassed = false;
          logFail(
            `b. Moc tre han: ${moc.name}`,
            `PhiTre: ${res.body.data?.PhiTre} (mong doi ${moc.expectedPhi}), TrangThaiPhat: ${res.body.data?.TrangThaiPhat} (mong doi ${moc.expectedPhat})`
          );
        }
      }
    }

    // c. Rach Nhe và Rach Nang
    console.log('\n--- c. RACH NHE VA RACH NANG ---');
    {
      // Rach Nhe (LoaiBoKhoiKho = false mac dinh)
      const bookC1 = await createBook('C1', 5, 4);
      const phieuC1 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookC1.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const expectedPhatNhe = Math.round(settings.TyLePhatRach * DON_GIA_CO_DINH * 0.5);

      const resC1 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuC1._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Rach',
          MucRach: 'Nhe',
          GhiChuPhat: 'Rách trang 10 nhẹ',
        }
      );

      const bookC1After = await Sach.findOne({ MaSach: bookC1.MaSach });
      if (
        resC1.status === 200 &&
        resC1.body.data.TienPhat === expectedPhatNhe &&
        resC1.body.data.MucRach === 'Nhe' &&
        resC1.body.data.LoaiBoKhoiKho === false &&
        resC1.body.data.TrangThaiPhat === 'ChuaThanhToan' &&
        bookC1After.SoQuyenConLai === 5 &&
        bookC1After.SoQuyen === 5
      ) {
        logPass('c. Rach Nhe mac dinh giu sach: TienPhat dung ty le 0.5, SoQuyenConLai +1, SoQuyen khong doi');
      } else {
        logFail('c. Rach Nhe mac dinh', JSON.stringify(resC1.body));
      }

      // Rach Nang va LoaiBoKhoiKho = true
      const bookC2 = await createBook('C2', 5, 4);
      const phieuC2 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookC2.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const expectedPhatNang = Math.round(settings.TyLePhatRach * DON_GIA_CO_DINH * 1.0);

      const resC2 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuC2._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Rach',
          MucRach: 'Nang',
          LoaiBoKhoiKho: true,
          GhiChuPhat: 'Rách nát bìa và nhiều trang',
        }
      );

      const bookC2After = await Sach.findOne({ MaSach: bookC2.MaSach });
      if (
        resC2.status === 200 &&
        resC2.body.data.TienPhat === expectedPhatNang &&
        resC2.body.data.MucRach === 'Nang' &&
        resC2.body.data.LoaiBoKhoiKho === true &&
        bookC2After.SoQuyenConLai === 4 &&
        bookC2After.SoQuyen === 4
      ) {
        logPass('c. Rach Nang loai bo: TienPhat dung ty le 1.0, SoQuyen -1, SoQuyenConLai khong doi');
      } else {
        logFail('c. Rach Nang loai bo', JSON.stringify(resC2.body));
      }

      // Thiếu MucRach khi Rach -> 400
      const phieuC3 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookC1.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });
      const resC3 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuC3._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Rach',
          GhiChuPhat: 'Thieu muc rach',
        }
      );
      if (resC3.status === 400) {
        logPass('c. Thieu MucRach khi Rach tra ve 400 VALIDATION_ERROR');
      } else {
        logFail('c. Thieu MucRach khi Rach', `Status: ${resC3.status}`);
      }

      // Thiếu GhiChuPhat khi Rach -> 400
      const resC4 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuC3._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Rach',
          MucRach: 'Nhe',
        }
      );
      if (resC4.status === 400) {
        logPass('c. Thieu GhiChuPhat khi Rach tra ve 400 VALIDATION_ERROR');
      } else {
        logFail('c. Thieu GhiChuPhat khi Rach', `Status: ${resC4.status}`);
      }
    }

    // d. Mat: TienPhat = TyLePhatMat * DonGia + PhiXuLyMat
    console.log('\n--- d. MAT SACH ---');
    {
      const bookD = await createBook('D1', 5, 4);
      const phieuD = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookD.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const expectedPhatMat =
        Math.round(settings.TyLePhatMat * DON_GIA_CO_DINH) + Math.round(settings.PhiXuLyMat);

      const resD = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuD._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Mat',
          GhiChuPhat: 'Độc giả làm mất trên xe buýt',
        }
      );

      const bookDAfter = await Sach.findOne({ MaSach: bookD.MaSach });
      if (
        resD.status === 200 &&
        resD.body.data.TienPhat === expectedPhatMat &&
        resD.body.data.TrangThaiPhat === 'ChuaThanhToan' &&
        bookDAfter.SoQuyen === 4 &&
        bookDAfter.SoQuyenConLai === 4 &&
        bookDAfter.SoQuyenConLai <= bookDAfter.SoQuyen &&
        bookDAfter.SoQuyenConLai >= 0
      ) {
        logPass('d. Mat sach: TienPhat dung cong thuc Mat, SoQuyen -1, SoQuyenConLai khong doi, bat bien giu vung');
      } else {
        logFail('d. Mat sach', JSON.stringify(resD.body));
      }

      // Mat ma gui kem MucRach -> 400
      const phieuD2 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookD.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const resD2 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuD2._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Mat',
          MucRach: 'Nhe',
          GhiChuPhat: 'Lam mat',
        }
      );
      if (resD2.status === 400) {
        logPass('d. Mat sach gui kem MucRach bi tu choi 400');
      } else {
        logFail('d. Mat sach gui kem MucRach', `Status: ${resD2.status}`);
      }

      // Mat ma gui kem LoaiBoKhoiKho -> 400
      const resD3 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuD2._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Mat',
          LoaiBoKhoiKho: true,
          GhiChuPhat: 'Lam mat',
        }
      );
      if (resD3.status === 400) {
        logPass('d. Mat sach gui kem LoaiBoKhoiKho bi tu choi 400');
      } else {
        logFail('d. Mat sach gui kem LoaiBoKhoiKho', `Status: ${resD3.status}`);
      }
    }

    // e. Chống gian lận
    console.log('\n--- e. CHONG GIAN LAN BODY RETURN ---');
    {
      const bookE = await createBook('E1', 5, 4);
      const phieuE = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookE.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const fraudulentPayloads = [
        { TinhTrangTra: 'BinhThuong', PhiTre: 0 },
        { TinhTrangTra: 'BinhThuong', TienPhat: 0 },
        { TinhTrangTra: 'BinhThuong', TrangThaiPhat: 'KhongPhat' },
        { TinhTrangTra: 'BinhThuong', NgayTra: new Date().toISOString() },
        { TinhTrangTra: 'BinhThuong', MSNVNhanTra: 'NV999' },
        { TinhTrangTra: 'BinhThuong', truongLa: 'hacker' },
      ];

      let allFraudBlocked = true;
      for (const payload of fraudulentPayloads) {
        const res = await request(
          server,
          {
            path: `/api/admin/borrowings/${phieuE._id}/return`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          },
          payload
        );
        if (res.status !== 400) {
          allFraudBlocked = false;
          logFail('e. Chong gian lan body', `Payload ${JSON.stringify(payload)} khong bi chan, status: ${res.status}`);
        }
      }

      // Kiem tra phieu trong DB van o TrangThai DangMuon khong bi doi
      const phieuEAfter = await TheoDoiMuonSach.findById(phieuE._id);
      if (allFraudBlocked && phieuEAfter.TrangThai === 'DangMuon') {
        logPass('e. Chong gian lan: moi truong la, tien bat hop le bi chan 400; DB giu nguyen');
      }
    }

    // f. Trạng thái và kiểm tra ID
    console.log('\n--- f. TRANG THAI VA KIEM TRA ID ---');
    {
      const invalidStatuses = ['ChoDuyet', 'DaDuyet', 'DaTra', 'TuChoi', 'DaHuy'];
      let allStatusBlocked = true;

      for (const st of invalidStatuses) {
        const bookFSt = await createBook(`F_${st}`, 10, 8);
        const p = await TheoDoiMuonSach.create({
          MaDocGia: READER_1,
          MaSach: bookFSt.MaSach,
          TrangThai: st,
          NgayMuon: new Date(),
          HanTra: new Date(),
        });

        const res = await request(
          server,
          {
            path: `/api/admin/borrowings/${p._id}/return`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          },
          { TinhTrangTra: 'BinhThuong' }
        );

        if (res.status !== 409 || res.body.error?.code !== 'INVALID_STATE') {
          allStatusBlocked = false;
          logFail(`f. Trạng thái ${st}`, `Status: ${res.status}, code: ${res.body.error?.code}`);
        }
      }

      if (allStatusBlocked) {
        logPass('f. Tra phieu ChoDuyet, DaDuyet, DaTra, TuChoi, DaHuy deu bi chan 409 INVALID_STATE');
      }

      // Id khong ton tai -> 404
      const nonExistentId = new mongoose.Types.ObjectId();
      const res404 = await request(
        server,
        {
          path: `/api/admin/borrowings/${nonExistentId}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (res404.status === 404) {
        logPass('f. Id khong ton tai tra ve 404 NOT_FOUND');
      } else {
        logFail('f. Id khong ton tai', `Status: ${res404.status}`);
      }

      // Id sai dinh dang -> 400
      const res400 = await request(
        server,
        {
          path: `/api/admin/borrowings/invalid-hex-id-123/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (res400.status === 400) {
        logPass('f. Id sai dinh dang tra ve 400 VALIDATION_ERROR');
      } else {
        logFail('f. Id sai dinh dang', `Status: ${res400.status}`);
      }
    }

    // g. Quyền truy cập
    console.log('\n--- g. PHAN QUYEN TRUY CAP ---');
    {
      const bookG = await createBook('G1', 5, 4);
      const phieuG = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookG.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      // Khong token -> 401
      const resNoToken = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuG._id}/return`,
          method: 'PATCH',
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (resNoToken.status === 401) {
        logPass('g. Khong token bi tu choi 401 UNAUTHENTICATED');
      } else {
        logFail('g. Khong token', `Status: ${resNoToken.status}`);
      }

      // Token doc gia -> 401/403
      const resUserToken = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuG._id}/return`,
          method: 'PATCH',
          headers: authHeaders(readerToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (resUserToken.status === 401) {
        logPass('g. Token doc gia bi tu choi 401 boi authAdmin');
      } else {
        logFail('g. Token doc gia', `Status: ${resUserToken.status}`);
      }

      // Nhan vien dang buoc doi mat khau -> 403
      const resPending = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuG._id}/return`,
          method: 'PATCH',
          headers: authHeaders(pendingToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (resPending.status === 403 && resPending.body.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('g. Nhan vien buoc doi mat khau bi chan 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('g. Nhan vien buoc doi mat khau', `Status: ${resPending.status}`);
      }

      // Admin nhan tra duoc
      const resAdmin = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuG._id}/return`,
          method: 'PATCH',
          headers: authHeaders(adminToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      if (resAdmin.status === 200 && resAdmin.body.data.MSNVNhanTra === STAFF_ADMIN) {
        logPass('g. Admin nhan tra thanh cong, gan dung MSNV');
      } else {
        logFail('g. Admin nhan tra', `Status: ${resAdmin.status}`);
      }
    }

    // h. Kiểm tra đua tranh chấp (Race conditions)
    console.log('\n--- h. KIEM TRA TRANH CHAP DONG THOI (RACE CONDITIONS) ---');
    {
      // 1. Bắn 2 lệnh return song song cho cùng 1 phiếu
      const bookH1 = await createBook('H1', 5, 4);
      const phieuH1 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookH1.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const [resH1A, resH1B] = await Promise.all([
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuH1._id}/return`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          },
          { TinhTrangTra: 'BinhThuong' }
        ),
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuH1._id}/return`,
            method: 'PATCH',
            headers: authHeaders(adminToken),
          },
          { TinhTrangTra: 'BinhThuong' }
        ),
      ]);

      const h1SuccessCount = [resH1A, resH1B].filter((r) => r.status === 200).length;
      const h1ConflictCount = [resH1A, resH1B].filter((r) => r.status === 409).length;
      const bookH1After = await Sach.findOne({ MaSach: bookH1.MaSach });

      if (h1SuccessCount === 1 && h1ConflictCount === 1 && bookH1After.SoQuyenConLai === 5) {
        logPass('h. Ban 2 lenh return song song: dung 1 thanh cong, 1 bi 409, kho chi tang +1 mot lan');
      } else {
        logFail(
          'h. Ban 2 lenh return song song',
          `Success: ${h1SuccessCount}, 409: ${h1ConflictCount}, SoQuyenConLai: ${bookH1After?.SoQuyenConLai}`
        );
      }

      // 2. Bắn 5 lệnh return song song cho cùng 1 phiếu
      const bookH2 = await createBook('H2', 10, 8);
      const phieuH2 = await TheoDoiMuonSach.create({
        MaDocGia: READER_2,
        MaSach: bookH2.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const promises5 = Array.from({ length: 5 }, () =>
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuH2._id}/return`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          },
          { TinhTrangTra: 'BinhThuong' }
        )
      );

      const results5 = await Promise.all(promises5);
      const success5Count = results5.filter((r) => r.status === 200).length;
      const conflict5Count = results5.filter((r) => r.status === 409).length;
      const bookH2After = await Sach.findOne({ MaSach: bookH2.MaSach });

      if (success5Count === 1 && conflict5Count === 4 && bookH2After.SoQuyenConLai === 9) {
        logPass('h. Ban 5 lenh return song song: dung 1 thanh cong, 4 bi 409, kho chi tang +1 mot lan');
      } else {
        logFail(
          'h. Ban 5 lenh return song song',
          `Success: ${success5Count}, 409: ${conflict5Count}, SoQuyenConLai: ${bookH2After?.SoQuyenConLai}`
        );
      }

      // 3. Lặp 5 lần: Bắn song song return (phiếu DangMuon) và cancel (phiếu DaDuyet) của 2 phiếu khác nhau cùng 1 cuốn
      let raceAllPassed = true;
      for (let run = 1; run <= 5; run++) {
        const bookH3 = await createBook(`H3_${run}`, 10, 5); // SoQuyen=10, SoQuyenConLai=5
        const loanReturn = await TheoDoiMuonSach.create({
          MaDocGia: READER_1,
          MaSach: bookH3.MaSach,
          TrangThai: 'DangMuon',
          NgayMuon: new Date(),
          HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        });
        const loanCancel = await TheoDoiMuonSach.create({
          MaDocGia: READER_2,
          MaSach: bookH3.MaSach,
          TrangThai: 'DaDuyet',
          NgayDuyet: new Date(),
          HanNhanSach: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        });

        const [resReturn, resCancel] = await Promise.all([
          request(
            server,
            {
              path: `/api/admin/borrowings/${loanReturn._id}/return`,
              method: 'PATCH',
              headers: authHeaders(thuthuToken),
            },
            { TinhTrangTra: 'BinhThuong' }
          ),
          request(
            server,
            {
              path: `/api/admin/borrowings/${loanCancel._id}/cancel`,
              method: 'PATCH',
              headers: authHeaders(thuthuToken),
            },
            { LyDo: 'Hủy phiếu trùng' }
          ),
        ]);

        const bookFinal = await Sach.findOne({ MaSach: bookH3.MaSach });
        // Cả 2 đều hoàn kho +1: SoQuyenConLai ban đầu là 5 -> 7
        if (
          resReturn.status === 200 &&
          resCancel.status === 200 &&
          bookFinal.SoQuyenConLai === 7 &&
          bookFinal.SoQuyenConLai <= bookFinal.SoQuyen
        ) {
          // Pass this iteration
        } else {
          raceAllPassed = false;
          logFail(`h. Vong dua lap ${run}`, `Return: ${resReturn.status}, Cancel: ${resCancel.status}, ConLai: ${bookFinal?.SoQuyenConLai}`);
        }
      }

      if (raceAllPassed) {
        logPass('h. Lap 5 lan ban song song return va cancel: ca 2 thanh cong, bat bien kho 0 <= ConLai <= Tong dung tuyet doi');
      }
    }

    // i. pay-fine
    console.log('\n--- i. THU PHAT (PAY-FINE) ---');
    {
      const bookI = await createBook('I1', 5, 4);
      // Phiếu có phạt ChuaThanhToan
      const phieuI1 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookI.MaSach,
        TrangThai: 'DaTra',
        NgayMuon: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        HanTra: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        NgayTra: new Date(),
        TinhTrangTra: 'Rach',
        MucRach: 'Nhe',
        TienPhat: 30000,
        PhiTre: 10000,
        TrangThaiPhat: 'ChuaThanhToan',
      });

      // 1. Thu phạt thành công
      const resI1 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuI1._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );

      if (
        resI1.status === 200 &&
        resI1.body.data.TrangThaiPhat === 'DaThanhToan' &&
        resI1.body.data.MSNVThuPhat === STAFF_THUTHU &&
        resI1.body.data.NgayThanhToanPhat
      ) {
        logPass('i. Thu phat thanh cong: TrangThaiPhat = DaThanhToan, set NgayThanhToanPhat va MSNVThuPhat');
      } else {
        logFail('i. Thu phat thanh cong', JSON.stringify(resI1.body));
      }

      // 2. Gọi lần 2 trên phiếu đã thanh toán -> 409
      const resI2 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuI1._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );
      if (resI2.status === 409 && resI2.body.error?.code === 'INVALID_STATE') {
        logPass('i. Goi thu phat lan hai tren phieu da thanh toan bi tu choi 409 INVALID_STATE');
      } else {
        logFail('i. Goi thu phat lan hai', `Status: ${resI2.status}`);
      }

      // 3. Phiếu KhongPhat -> 409
      const phieuI3 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookI.MaSach,
        TrangThai: 'DaTra',
        NgayMuon: new Date(),
        HanTra: new Date(),
        NgayTra: new Date(),
        TinhTrangTra: 'BinhThuong',
        TienPhat: 0,
        TrangThaiPhat: 'KhongPhat',
      });
      const resI3 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuI3._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );
      if (resI3.status === 409 && resI3.body.error?.code === 'INVALID_STATE') {
        logPass('i. Phieu KhongPhat bi tu choi 409 INVALID_STATE');
      } else {
        logFail('i. Phieu KhongPhat', `Status: ${resI3.status}`);
      }

      // 4. Phiếu chưa trả (DangMuon) -> 409
      const phieuI4 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookI.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(),
        TienPhat: 20000,
        TrangThaiPhat: 'ChuaThanhToan',
      });
      const resI4 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuI4._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );
      if (resI4.status === 409 && resI4.body.error?.code === 'INVALID_STATE') {
        logPass('i. Phieu chua tra sach bi tu choi 409 INVALID_STATE');
      } else {
        logFail('i. Phieu chua tra', `Status: ${resI4.status}`);
      }

      // 5. Hai lệnh thu phạt song song: đúng 1 thành công
      const phieuI5 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookI.MaSach,
        TrangThai: 'DaTra',
        NgayMuon: new Date(),
        HanTra: new Date(),
        NgayTra: new Date(),
        TinhTrangTra: 'Mat',
        TienPhat: 120000,
        TrangThaiPhat: 'ChuaThanhToan',
      });
      const [resI5A, resI5B] = await Promise.all([
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuI5._id}/pay-fine`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          }
        ),
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuI5._id}/pay-fine`,
            method: 'PATCH',
            headers: authHeaders(adminToken),
          }
        ),
      ]);
      const i5Success = [resI5A, resI5B].filter((r) => r.status === 200).length;
      const i5Conflict = [resI5A, resI5B].filter((r) => r.status === 409).length;
      if (i5Success === 1 && i5Conflict === 1) {
        logPass('i. Hai lenh thu phat song song cho 1 phieu: dung 1 thanh cong, 1 bi 409');
      } else {
        logFail('i. Hai lenh thu phat song song', `Success: ${i5Success}, 409: ${i5Conflict}`);
      }
    }

    // j. cancel
    console.log('\n--- j. HUY PHIEU (CANCEL) ---');
    {
      const bookJ = await createBook('J1', 5, 3);

      // 1. ChoDuyet -> DaHuy: không đổi kho
      const phieuJ1 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookJ.MaSach,
        TrangThai: 'ChoDuyet',
      });
      const resJ1 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuJ1._id}/cancel`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { LyDo: 'Độc giả yêu cầu hủy đơn' }
      );
      const bookJAfter1 = await Sach.findOne({ MaSach: bookJ.MaSach });
      if (resJ1.status === 200 && resJ1.body.data.TrangThai === 'DaHuy' && bookJAfter1.SoQuyenConLai === 3) {
        logPass('j. ChoDuyet -> DaHuy thanh cong, kho khong doi');
      } else {
        logFail('j. ChoDuyet -> DaHuy', `Status: ${resJ1.status}, ConLai: ${bookJAfter1?.SoQuyenConLai}`);
      }

      // 2. DaDuyet -> DaHuy: hoàn kho +1
      const phieuJ2 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookJ.MaSach,
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(),
        HanNhanSach: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      const resJ2 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuJ2._id}/cancel`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { LyDo: 'Quá hạn độc giả không đến' }
      );
      const bookJAfter2 = await Sach.findOne({ MaSach: bookJ.MaSach });
      if (resJ2.status === 200 && resJ2.body.data.TrangThai === 'DaHuy' && bookJAfter2.SoQuyenConLai === 4) {
        logPass('j. DaDuyet -> DaHuy thanh cong, hoan kho SoQuyenConLai +1');
      } else {
        logFail('j. DaDuyet -> DaHuy', `Status: ${resJ2.status}, ConLai: ${bookJAfter2?.SoQuyenConLai}`);
      }

      // 3. DangMuon, DaTra, TuChoi, DaHuy -> 409
      const invalidCancelStatuses = ['DangMuon', 'DaTra', 'TuChoi', 'DaHuy'];
      let allCancelBlocked = true;
      for (const st of invalidCancelStatuses) {
        const bookJSt = await createBook(`J_${st}`, 10, 8);
        const p = await TheoDoiMuonSach.create({
          MaDocGia: READER_1,
          MaSach: bookJSt.MaSach,
          TrangThai: st,
        });
        const r = await request(
          server,
          {
            path: `/api/admin/borrowings/${p._id}/cancel`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          }
        );
        if (r.status !== 409 || r.body.error?.code !== 'INVALID_STATE') {
          allCancelBlocked = false;
        }
      }
      if (allCancelBlocked) {
        logPass('j. Huy phieu DangMuon, DaTra, TuChoi, DaHuy deu bi chan 409 INVALID_STATE');
      } else {
        logFail('j. Huy phieu trang thai khong hop le', 'Co trang thai khong tra 409');
      }

      // 4. LyDo quá dài (> 300 ký tự) -> 400
      const bookJ4 = await createBook('J4', 5, 3);
      const phieuJ4 = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookJ4.MaSach,
        TrangThai: 'ChoDuyet',
      });
      const longReason = 'A'.repeat(301);
      const resJ4 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuJ4._id}/cancel`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { LyDo: longReason }
      );
      if (resJ4.status === 400) {
        logPass('j. LyDo dai hon 300 ky tu bi tu choi 400 VALIDATION_ERROR');
      } else {
        logFail('j. LyDo dai hon 300 ky tu', `Status: ${resJ4.status}`);
      }

      // 5. Hai lệnh cancel song song: hoàn kho đúng 1 lần
      const bookJ5 = await createBook('J5', 5, 3);
      const phieuJ5 = await TheoDoiMuonSach.create({
        MaDocGia: READER_2,
        MaSach: bookJ5.MaSach,
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(),
        HanNhanSach: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      const stockBeforeJ5 = 3;
      const [resJ5A, resJ5B] = await Promise.all([
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuJ5._id}/cancel`,
            method: 'PATCH',
            headers: authHeaders(thuthuToken),
          }
        ),
        request(
          server,
          {
            path: `/api/admin/borrowings/${phieuJ5._id}/cancel`,
            method: 'PATCH',
            headers: authHeaders(adminToken),
          }
        ),
      ]);
      const j5Success = [resJ5A, resJ5B].filter((r) => r.status === 200).length;
      const j5Conflict = [resJ5A, resJ5B].filter((r) => r.status === 409).length;
      const bookJAfter5 = await Sach.findOne({ MaSach: bookJ5.MaSach });

      if (j5Success === 1 && j5Conflict === 1 && bookJAfter5.SoQuyenConLai === stockBeforeJ5 + 1) {
        logPass('j. Hai lenh cancel song song: dung 1 thanh cong, hoan kho chi +1 mot lan');
      } else {
        logFail('j. Hai lenh cancel song song', `Success: ${j5Success}, 409: ${j5Conflict}, Stock: ${bookJAfter5?.SoQuyenConLai}`);
      }
    }

    // k. Tương tác với các quy tắc đã có
    console.log('\n--- k. TUONG TAC VOI CAC QUY TAC HE THONG ---');
    {
      const bookK1 = await createBook('K1', 5, 4);
      const bookK2 = await createBook('K2', 5, 4);

      // Trả sách có phạt ChuaThanhToan cho READER_3
      const phieuK1 = await TheoDoiMuonSach.create({
        MaDocGia: READER_3,
        MaSach: bookK1.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const resReturnK1 = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuK1._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        {
          TinhTrangTra: 'Rach',
          MucRach: 'Nhe',
          GhiChuPhat: 'Phat chua thanh toan',
        }
      );

      // Độc giả đăng ký mượn sách mới -> 422 HAS_UNPAID_FINE
      const reader3Token = signAccessToken({ MaDocGia: READER_3 }, 'docgia');
      const resBorrowK = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: authHeaders(reader3Token),
        },
        { MaSach: bookK2.MaSach }
      );

      if (resBorrowK.status === 422 && resBorrowK.body.error?.code === 'HAS_UNPAID_FINE') {
        logPass('k. Doc gia co phat ChuaThanhToan bi chan dang ky muon moi (422 HAS_UNPAID_FINE)');
      } else {
        logFail('k. Doc gia co phat ChuaThanhToan', `Status: ${resBorrowK.status}, Code: ${resBorrowK.body.error?.code}`);
      }

      // Sau khi nhân viên pay-fine
      const resPayK = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuK1._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );

      // Độc giả đăng ký lại -> thành công 201
      const resBorrowKAgain = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: authHeaders(reader3Token),
        },
        { MaSach: bookK2.MaSach }
      );

      if (resPayK.status === 200 && resBorrowKAgain.status === 201) {
        logPass('k. Sau khi thanh toan phat, doc gia dang ky muon sach moi thanh cong 201');
      } else {
        logFail('k. Dang ky lai sau khi pay-fine', `Pay status: ${resPayK.status}, Borrow status: ${resBorrowKAgain.status}`);
      }

      // Phiếu DaTra không bị tính vào giới hạn SoSachToiDa và hết bị chặn HAS_OVERDUE
      const bookKOverdue = await createBook('K_Overdue', 5, 4);
      const phieuKOverdue = await TheoDoiMuonSach.create({
        MaDocGia: READER_2,
        MaSach: bookKOverdue.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        HanTra: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Qua han
      });

      const reader2Token = signAccessToken({ MaDocGia: READER_2 }, 'docgia');
      // Đang có quá hạn -> chặn
      const resBorrowOverdueBefore = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: authHeaders(reader2Token),
        },
        { MaSach: bookK2.MaSach }
      );
      const isOverdueBlocked = resBorrowOverdueBefore.status === 422 && resBorrowOverdueBefore.body.error?.code === 'HAS_OVERDUE';

      // Trả phiếu quá hạn và thanh toán phạt
      const resReturnOverdue = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuKOverdue._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );
      await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuKOverdue._id}/pay-fine`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        }
      );

      // Đăng ký lại -> không còn bị HAS_OVERDUE
      const resBorrowOverdueAfter = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: authHeaders(reader2Token),
        },
        { MaSach: bookK2.MaSach }
      );

      if (isOverdueBlocked && resBorrowOverdueAfter.status === 201) {
        logPass('k. Tra sach qua han xong thi doc gia het bi chan HAS_OVERDUE va phieu DaTra khong chiem cho');
      } else {
        logFail('k. Qua han sau khi tra', `Before: ${resBorrowOverdueBefore.status}, After: ${resBorrowOverdueAfter.status}`);
      }
    }

    // l. Sách đã xóa mềm
    console.log('\n--- l. SACH DA XOA MEM (DaXoa = true) ---');
    {
      const bookL = await createBook('L1', 5, 4, true); // DaXoa = true
      const phieuL = await TheoDoiMuonSach.create({
        MaDocGia: READER_1,
        MaSach: bookL.MaSach,
        TrangThai: 'DangMuon',
        NgayMuon: new Date(),
        HanTra: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const resL = await request(
        server,
        {
          path: `/api/admin/borrowings/${phieuL._id}/return`,
          method: 'PATCH',
          headers: authHeaders(thuthuToken),
        },
        { TinhTrangTra: 'BinhThuong' }
      );

      const bookLAfter = await Sach.findOne({ MaSach: bookL.MaSach });
      if (resL.status === 200 && resL.body.data.TrangThai === 'DaTra' && bookLAfter.SoQuyenConLai === 5) {
        logPass('l. Sach da xoa mem van tra duoc phieu va cap nhat kho chinh xac');
      } else {
        logFail('l. Sach da xoa mem', `Status: ${resL.status}, ConLai: ${bookLAfter?.SoQuyenConLai}`);
      }
    }

    // m. Audit log
    console.log('\n--- m. GHI NHAT KY (AUDIT LOGS) ---');
    {
      const logReturn = await NhatKy.findOne({
        HanhDong: 'NHAN_TRA',
        MSNV: STAFF_THUTHU,
      }).sort({ createdAt: -1 });

      const logPayFine = await NhatKy.findOne({
        HanhDong: 'THU_PHAT',
        MSNV: STAFF_THUTHU,
      }).sort({ createdAt: -1 });

      const logCancel = await NhatKy.findOne({
        HanhDong: 'HUY_PHIEU',
        MSNV: STAFF_THUTHU,
      }).sort({ createdAt: -1 });

      if (
        logReturn &&
        logReturn.ChiTiet?.MaSach &&
        logReturn.ChiTiet?.MaDocGia &&
        logReturn.ChiTiet?.TinhTrangTra !== undefined &&
        logPayFine &&
        logPayFine.ChiTiet?.TienPhat !== undefined &&
        logCancel &&
        logCancel.ChiTiet?.NguoiHuy === 'NhanVien'
      ) {
        logPass('m. Moi thao tac (return, pay-fine, cancel) tao NhatKy tuong ung voi dung MSNV, khong chua du lieu nhay cam');
      } else {
        logFail('m. Kiem tra audit logs', `Return: ${Boolean(logReturn)}, Pay: ${Boolean(logPayFine)}, Cancel: ${Boolean(logCancel)}`);
      }
    }

    console.log('\n================================================================');
    console.log(`TONG KET KIEM TRA: PASS: ${passedCount} | FAIL: ${failedCount}`);
    console.log(`THOI GIAN CHAY: ${Date.now() - startTime}ms`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[ERROR] Loi nghiem trong trong qua trinh kiem tra:', err);
    process.exitCode = 1;
  } finally {
    console.log('Dang don dep du lieu kiem thu...');
    await cleanTestData();
    server.close();
    await disconnectDB();
    console.log('Hoan tat don dep va ngat ket noi DB.\n');
  }
};

runTests();
