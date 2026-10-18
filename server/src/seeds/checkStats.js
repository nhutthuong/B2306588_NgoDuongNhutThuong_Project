import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  NhanVien,
  DocGia,
  Sach,
  NhaXuatBan,
  TheoDoiMuonSach,
  NhatKy,
  CauHinh,
} from '../models/index.js';
import { signAccessToken, hashPassword } from '../services/auth.service.js';
import { _resetSweepStateForTest } from '../services/expiry.service.js';
import { getCurrentYearVN } from '../services/stats.service.js';
import { soNgayTre } from '../utils/borrowing.js';

let passedCount = 0;
let failedCount = 0;

const logPass = (name, detail = '') => {
  passedCount++;
  console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`);
};

const logFail = (name, error) => {
  failedCount++;
  console.error(`[FAIL] ${name} - Lỗi: ${error?.message || error}`);
};

const request = (server, options, body = null) => {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path.includes('%') ? options.path : encodeURI(options.path),
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
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
};

const run = async () => {
  let server = null;
  const createdTicketIds = [];

  const cleanup = async () => {
    try {
      if (createdTicketIds.length > 0) {
        await TheoDoiMuonSach.deleteMany({ _id: { $in: createdTicketIds } });
      }
      await TheoDoiMuonSach.deleteMany({
        $or: [{ MaDocGia: /^TEST/ }, { MaSach: /^TEST/ }],
      });
      await DocGia.deleteMany({ MaDocGia: /^TEST/ });
      await Sach.deleteMany({ MaSach: /^TEST/ });
      await NhaXuatBan.deleteMany({ MaNXB: /^TEST/ });
      await NhanVien.deleteMany({ MSNV: /^TEST/ });
      await NhatKy.deleteMany({
        $or: [{ MSNV: /^TEST/ }, { MSNV: 'HE_THONG', HanhDong: 'HET_HAN_NHAN_SACH' }],
      });
    } catch (cleanErr) {
      console.error('[CLEANUP_ERROR] Lỗi khi dọn dẹp:', cleanErr.message);
    }
  };

  try {
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Dọn sạch rác cũ nếu có từ lần chạy trước
    await cleanup();

    // 1. Tạo tài khoản nhân viên thử nghiệm
    const pwdHash = await hashPassword('TestStaff@123');

    await NhanVien.create([
      {
        MSNV: 'TEST_NV_ADMIN',
        HoTenNV: 'Admin Thống Kê Test',
        Password: pwdHash,
        VaiTro: 'admin',
        TrangThai: 'HoatDong',
        BatBuocDoiMatKhau: false,
      },
      {
        MSNV: 'TEST_NV_THUTHU',
        HoTenNV: 'Thủ Thư Test',
        Password: pwdHash,
        VaiTro: 'thuthu',
        TrangThai: 'HoatDong',
        BatBuocDoiMatKhau: false,
      },
      {
        MSNV: 'TEST_NV_PENDING',
        HoTenNV: 'Nhân Viên Đổi MK Test',
        Password: pwdHash,
        VaiTro: 'thuthu',
        TrangThai: 'HoatDong',
        BatBuocDoiMatKhau: true,
      },
    ]);

    // Tạo NXB và Sách thử nghiệm
    await NhaXuatBan.create({
      MaNXB: 'TEST_NXB01',
      TenNXB: 'NXB Kiểm Thử Thống Kê',
    });

    await Sach.create([
      {
        MaSach: 'TEST_S01',
        TenSach: 'Lập Trình Web Nâng Cao',
        DonGia: 60000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        MaNXB: 'TEST_NXB01',
        NguonGocTacGia: 'Tác Giả A',
        DaXoa: false,
      },
      {
        MaSach: 'TEST_S02',
        TenSach: 'Cơ Sở Dữ Liệu Phân Tán',
        DonGia: 90000,
        SoQuyen: 5,
        SoQuyenConLai: 5,
        MaNXB: 'TEST_NXB01',
        NguonGocTacGia: 'Tác Giả B',
        DaXoa: false,
      },
      {
        MaSach: 'TEST_S_DEL',
        TenSach: 'Sách Đã Xóa Mềm Mẫu',
        DonGia: 40000,
        SoQuyen: 3,
        SoQuyenConLai: 3,
        MaNXB: 'TEST_NXB01',
        NguonGocTacGia: 'Tác Giả C',
        DaXoa: true, // Sách đã xóa mềm
      },
    ]);

    // Tạo độc giả kiểm thử
    const testReaders = [
      {
        MaDocGia: 'TEST_DG_01',
        HoLot: 'Nguyễn Văn',
        Ten: 'Độc Giả 1',
        NgaySinh: new Date('2000-01-01'),
        Phai: 'Nam',
        Email: 'test_dg01@library.local',
        Password: pwdHash,
        DienThoai: '0912345671',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_DG_02',
        HoLot: 'Trần Thị',
        Ten: 'Độc Giả 2',
        NgaySinh: new Date('2001-02-02'),
        Phai: 'Nu',
        Email: 'test_dg02@library.local',
        Password: pwdHash,
        DienThoai: '0912345672',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_RD_DG01',
        HoLot: 'Lê Văn',
        Ten: 'Độc Giả H1',
        NgaySinh: new Date('2000-03-03'),
        Phai: 'Nam',
        Email: 'test_rd01@library.local',
        Password: pwdHash,
        DienThoai: '0912345673',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_RD_DG02',
        HoLot: 'Phạm Thị',
        Ten: 'Độc Giả H2',
        NgaySinh: new Date('2000-04-04'),
        Phai: 'Nu',
        Email: 'test_rd02@library.local',
        Password: pwdHash,
        DienThoai: '0912345674',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_OV_DG01',
        HoLot: 'Hoàng Văn',
        Ten: 'Trễ Hạn 1',
        NgaySinh: new Date('2000-05-05'),
        Phai: 'Nam',
        Email: 'test_ov01@library.local',
        Password: pwdHash,
        DienThoai: '0912345675',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_OV_DG02',
        HoLot: 'Vũ Thị',
        Ten: 'Trễ Hạn 2',
        NgaySinh: new Date('2000-06-06'),
        Phai: 'Nu',
        Email: 'test_ov02@library.local',
        Password: pwdHash,
        DienThoai: '0912345676',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_OV_DG03',
        HoLot: 'Đặng Văn',
        Ten: 'Trễ Hạn 3',
        NgaySinh: new Date('2000-07-07'),
        Phai: 'Nam',
        Email: 'test_ov03@library.local',
        Password: pwdHash,
        DienThoai: '0912345677',
        TrangThai: 'HoatDong',
      },
      {
        MaDocGia: 'TEST_OV_DG04',
        HoLot: 'Bùi Thị',
        Ten: 'Trễ Hạn 4',
        NgaySinh: new Date('2000-08-08'),
        Phai: 'Nu',
        Email: 'test_ov04@library.local',
        Password: pwdHash,
        DienThoai: '0912345678',
        TrangThai: 'HoatDong',
      },
    ];
    await DocGia.create(testReaders);

    // Ký JWT tokens đúng cấu trúc { MSNV, VaiTro }
    const adminToken = signAccessToken(
      { MSNV: 'TEST_NV_ADMIN', VaiTro: 'admin' },
      'nhanvien'
    );
    const thuthuToken = signAccessToken(
      { MSNV: 'TEST_NV_THUTHU', VaiTro: 'thuthu' },
      'nhanvien'
    );
    const pendingToken = signAccessToken(
      { MSNV: 'TEST_NV_PENDING', VaiTro: 'thuthu' },
      'nhanvien'
    );
    const userToken = signAccessToken(
      { MaDocGia: 'TEST_DG_01' },
      'docgia'
    );

    const endpoints = [
      '/api/admin/stats/overview',
      '/api/admin/stats/top-books',
      '/api/admin/stats/borrow-by-month',
      '/api/admin/stats/overdue',
      '/api/admin/stats/fines',
      '/api/admin/stats/top-readers',
    ];

    // ==========================================
    // KỊCH BẢN A: PHÂN QUYỀN
    // ==========================================
    try {
      // 1. Không token -> 401
      const noTokenRes = await request(server, { path: endpoints[0] });
      if (noTokenRes.status === 401) {
        logPass('Kịch bản a: Không có token trả về 401 UNAUTHENTICATED');
      } else {
        logFail('Kịch bản a: Không có token', `Nhận status ${noTokenRes.status}`);
      }

      // 2. Token độc giả -> 401
      const userTokenRes = await request(server, {
        path: endpoints[0],
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (userTokenRes.status === 401) {
        logPass('Kịch bản a: Token độc giả gọi API admin trả về 401');
      } else {
        logFail('Kịch bản a: Token độc giả', `Nhận status ${userTokenRes.status}`);
      }

      // 3. Tài khoản buộc đổi mật khẩu -> 403 MUST_CHANGE_PASSWORD
      const pendingRes = await request(server, {
        path: endpoints[0],
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
      if (pendingRes.status === 403 && pendingRes.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('Kịch bản a: Tài khoản chưa đổi mật khẩu trả về 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('Kịch bản a: Tài khoản chưa đổi mật khẩu', `Nhận status ${pendingRes.status}`);
      }

      // 4. Thủ thư và Admin đều gọi thành công cả 6 endpoint
      let allThuthuOk = true;
      let allAdminOk = true;

      for (const ep of endpoints) {
        const r1 = await request(server, {
          path: ep,
          headers: { Authorization: `Bearer ${thuthuToken}` },
        });
        if (r1.status !== 200) allThuthuOk = false;

        const r2 = await request(server, {
          path: ep,
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (r2.status !== 200) allAdminOk = false;
      }

      if (allThuthuOk && allAdminOk) {
        logPass('Kịch bản a: Thủ thư và Admin đều gọi thành công 200 cả 6 endpoint');
      } else {
        logFail('Kịch bản a: Quyền thuthu/admin', `thuthu: ${allThuthuOk}, admin: ${allAdminOk}`);
      }
    } catch (errA) {
      logFail('Kịch bản a: Phân quyền', errA);
    }

    // ==========================================
    // KỊCH BẢN B: OVERVIEW
    // ==========================================
    try {
      // Chụp số liệu trước khi tạo thêm phiếu
      const preRes = await request(server, {
        path: '/api/admin/stats/overview',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const preData = preRes.body.data;

      // Kiểm tra 6 khóa trạng thái chuẩn
      const requiredStatuses = ['ChoDuyet', 'DaDuyet', 'DangMuon', 'DaTra', 'TuChoi', 'DaHuy'];
      const hasAllKeys = requiredStatuses.every(
        (st) => typeof preData.phieuTheoTrangThai[st] === 'number'
      );
      if (hasAllKeys) {
        logPass('Kịch bản b: phieuTheoTrangThai có đầy đủ 6 khóa trạng thái');
      } else {
        logFail('Kịch bản b: phieuTheoTrangThai thiếu khóa');
      }

      // Tổng 6 khóa bằng tổng số phiếu trong DB
      const dbTicketCount = await TheoDoiMuonSach.countDocuments();
      const sumKeys = requiredStatuses.reduce(
        (sum, st) => sum + preData.phieuTheoTrangThai[st],
        0
      );
      if (sumKeys === dbTicketCount) {
        logPass('Kịch bản b: Tổng các trạng thái bằng chính xác tổng số phiếu trong DB', `Tổng: ${sumKeys}`);
      } else {
        logFail('Kịch bản b: Tổng các trạng thái', `DB: ${dbTicketCount}, Tổng: ${sumKeys}`);
      }

      // Tạo thêm 1 phiếu cho từng trạng thái (đảm bảo mỗi độc giả chỉ có 1 active ticket trên 1 cuốn)
      const now = new Date();
      const pastHanTra = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // Quá hạn 3 ngày
      const futureHanTra = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // Còn hạn 10 ngày

      const testTickets = await TheoDoiMuonSach.create([
        {
          MaDocGia: 'TEST_DG_01',
          MaSach: 'TEST_S01',
          TrangThai: 'ChoDuyet',
          NgayDangKy: now,
        },
        {
          MaDocGia: 'TEST_DG_01',
          MaSach: 'TEST_S02',
          TrangThai: 'DaDuyet',
          NgayDangKy: now,
          NgayDuyet: now,
          HanNhanSach: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // Còn hạn nhận
        },
        {
          MaDocGia: 'TEST_DG_02',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: now,
          HanTra: futureHanTra, // Chưa quá hạn
        },
        {
          MaDocGia: 'TEST_DG_02',
          MaSach: 'TEST_S02',
          TrangThai: 'DangMuon',
          NgayMuon: pastHanTra,
          HanTra: pastHanTra, // Đã quá hạn!
        },
        {
          MaDocGia: 'TEST_OV_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: pastHanTra,
          NgayTra: now,
          TrangThaiPhat: 'ChuaThanhToan',
          TienPhat: 35000,
        },
        {
          MaDocGia: 'TEST_OV_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'TuChoi',
          LyDoTuChoi: 'Thử nghiệm từ chối',
        },
        {
          MaDocGia: 'TEST_OV_DG03',
          MaSach: 'TEST_S02',
          TrangThai: 'DaHuy',
        },
      ]);
      createdTicketIds.push(...testTickets.map((t) => t._id));

      const postRes = await request(server, {
        path: '/api/admin/stats/overview',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const postData = postRes.body.data;

      // Kiểm tra tăng đúng
      const dChoDuyet = postData.phieuTheoTrangThai.ChoDuyet - preData.phieuTheoTrangThai.ChoDuyet;
      const dDaDuyet = postData.phieuTheoTrangThai.DaDuyet - preData.phieuTheoTrangThai.DaDuyet;
      const dDangMuon = postData.phieuTheoTrangThai.DangMuon - preData.phieuTheoTrangThai.DangMuon;
      const dDaTra = postData.phieuTheoTrangThai.DaTra - preData.phieuTheoTrangThai.DaTra;
      const dTuChoi = postData.phieuTheoTrangThai.TuChoi - preData.phieuTheoTrangThai.TuChoi;
      const dDaHuy = postData.phieuTheoTrangThai.DaHuy - preData.phieuTheoTrangThai.DaHuy;
      const dQuaHan = postData.soQuaHan - preData.soQuaHan;
      const dPhat = postData.tongPhatChuaThu - preData.tongPhatChuaThu;
      const dSoPhieuPhat = postData.soPhieuChuaThuPhat - preData.soPhieuChuaThuPhat;

      if (
        dChoDuyet === 1 &&
        dDaDuyet === 1 &&
        dDangMuon === 2 &&
        dDaTra === 1 &&
        dTuChoi === 1 &&
        dDaHuy === 1
      ) {
        logPass('Kịch bản b: Số lượng từng trạng thái tăng chính xác khi thêm phiếu thử');
      } else {
        logFail('Kịch bản b: Tăng trạng thái phiếu', {
          dChoDuyet,
          dDaDuyet,
          dDangMuon,
          dDaTra,
          dTuChoi,
          dDaHuy,
        });
      }

      if (dQuaHan === 1) {
        logPass('Kịch bản b: soQuaHan tăng đúng 1 (chỉ tính DangMuon có HanTra < now, không tính DangMuon còn hạn)');
      } else {
        logFail('Kịch bản b: soQuaHan', `Chênh lệch: ${dQuaHan}, kỳ vọng 1`);
      }

      if (dPhat === 35000 && dSoPhieuPhat === 1) {
        logPass('Kịch bản b: tongPhatChuaThu và soPhieuChuaThuPhat tăng chính xác theo phiếu chưa thanh toán');
      } else {
        logFail('Kịch bản b: tongPhatChuaThu', `Tiền: ${dPhat}, Số phiếu: ${dSoPhieuPhat}`);
      }

      // Sách xóa mềm không nằm trong tongDauSach và tongSoQuyen
      const undeletedBooks = await Sach.find({ DaXoa: false });
      const expectedDauSach = undeletedBooks.length;
      const expectedTongSoQuyen = undeletedBooks.reduce((sum, b) => sum + b.SoQuyen, 0);

      if (
        postData.sach.tongDauSach === expectedDauSach &&
        postData.sach.tongSoQuyen === expectedTongSoQuyen
      ) {
        logPass('Kịch bản b: Sách đã xóa mềm không nằm trong tongDauSach và tongSoQuyen kho');
      } else {
        logFail('Kịch bản b: Thống kê kho sách', {
          postTongDauSach: postData.sach.tongDauSach,
          expectedDauSach,
          postTongSoQuyen: postData.sach.tongSoQuyen,
          expectedTongSoQuyen,
        });
      }
    } catch (errB) {
      logFail('Kịch bản b: Overview', errB);
    }

    // ==========================================
    // KỊCH BẢN C: MÚI GIỜ VIỆT NAM (UTC+7)
    // ==========================================
    try {
      // Phiếu 1: 2020-03-31T17:30:00Z -> 00:30 ngày 1/4/2020 giờ VN -> Thuộc tháng 4
      // Phiếu 2: 2020-03-31T16:59:59Z -> 23:59:59 ngày 31/3/2020 giờ VN -> Thuộc tháng 3
      // Phiếu 3: 2019-12-31T17:00:00Z -> 00:00:00 ngày 1/1/2020 giờ VN -> Thuộc năm 2020 tháng 1
      const tzTickets = await TheoDoiMuonSach.create([
        {
          MaDocGia: 'TEST_TZ_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2020-03-31T17:30:00Z'),
          NgayDangKy: new Date('2020-03-31T17:30:00Z'),
        },
        {
          MaDocGia: 'TEST_TZ_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2020-03-31T16:59:59Z'),
          NgayDangKy: new Date('2020-03-31T16:59:59Z'),
        },
        {
          MaDocGia: 'TEST_TZ_DG03',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2019-12-31T17:00:00Z'),
          NgayDangKy: new Date('2019-12-31T17:00:00Z'),
        },
        // Phạt cho fines
        {
          MaDocGia: 'TEST_TZ_DG04',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2020-03-01T00:00:00Z'),
          NgayTra: new Date('2020-03-31T17:30:00Z'), // Tháng 4 giờ VN
          TienPhat: 15000,
          TrangThaiPhat: 'DaThanhToan',
          NgayThanhToanPhat: new Date('2020-03-31T17:30:00Z'), // Tháng 4 giờ VN
        },
        {
          MaDocGia: 'TEST_TZ_DG05',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2020-03-01T00:00:00Z'),
          NgayTra: new Date('2020-03-31T16:59:59Z'), // Tháng 3 giờ VN
          TienPhat: 25000,
          TrangThaiPhat: 'DaThanhToan',
          NgayThanhToanPhat: new Date('2020-03-31T16:59:59Z'), // Tháng 3 giờ VN
        },
      ]);
      createdTicketIds.push(...tzTickets.map((t) => t._id));

      const borrow2020Res = await request(server, {
        path: '/api/admin/stats/borrow-by-month?year=2020',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const b2020 = borrow2020Res.body.data;
      const m1 = b2020.thang.find((t) => t.thang === 1)?.luotMuon;
      const m3 = b2020.thang.find((t) => t.thang === 3)?.luotMuon;
      const m4 = b2020.thang.find((t) => t.thang === 4)?.luotMuon;

      if (m4 >= 1 && m3 >= 1 && m1 >= 1) {
        logPass(
          'Kịch bản c: Múi giờ Việt Nam trong borrow-by-month gom đúng biên tháng 3/4 và biên năm 2019/2020'
        );
      } else {
        logFail('Kịch bản c: borrow-by-month timezone', { m1, m3, m4 });
      }

      const fines2020Res = await request(server, {
        path: '/api/admin/stats/fines?year=2020',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const f2020 = fines2020Res.body.data;
      const fm3 = f2020.thang.find((t) => t.thang === 3)?.phatPhatSinh;
      const fm4 = f2020.thang.find((t) => t.thang === 4)?.phatPhatSinh;

      if (fm3 >= 25000 && fm4 >= 15000) {
        logPass('Kịch bản c: Múi giờ Việt Nam trong fines gom đúng tiền phạt phát sinh theo tháng giờ VN');
      } else {
        logFail('Kịch bản c: fines timezone', { fm3, fm4 });
      }
    } catch (errC) {
      logFail('Kịch bản c: Múi giờ', errC);
    }

    // ==========================================
    // KỊCH BẢN D: BORROW-BY-MONTH
    // ==========================================
    try {
      const currentYear = getCurrentYearVN();
      const resCurr = await request(server, {
        path: `/api/admin/stats/borrow-by-month?year=${currentYear}`,
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const dataCurr = resCurr.body.data;

      // Đủ 12 phần tử theo thứ tự 1..12
      const is12Months =
        Array.isArray(dataCurr.thang) &&
        dataCurr.thang.length === 12 &&
        dataCurr.thang.every((item, idx) => item.thang === idx + 1);

      if (is12Months) {
        logPass('Kịch bản d: borrow-by-month trả về đủ 12 phần tử từ tháng 1 đến 12 theo đúng thứ tự');
      } else {
        logFail('Kịch bản d: Mảng 12 tháng', dataCurr.thang?.length);
      }

      // Tổng cả năm bằng tổng 12 tháng
      const sumLM = dataCurr.thang.reduce((s, t) => s + t.luotMuon, 0);
      const sumDK = dataCurr.thang.reduce((s, t) => s + t.soDangKy, 0);

      if (
        sumLM === dataCurr.tongCaNam.luotMuon &&
        sumDK === dataCurr.tongCaNam.soDangKy
      ) {
        logPass('Kịch bản d: Tổng cả năm khớp tuyệt đối tổng 12 tháng');
      } else {
        logFail('Kịch bản d: Tổng cả năm', { sumLM, sumDK, tongCaNam: dataCurr.tongCaNam });
      }

      // Năm hoàn toàn trống (ví dụ năm 2001)
      const resEmpty = await request(server, {
        path: '/api/admin/stats/borrow-by-month?year=2001',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const dataEmpty = resEmpty.body.data;
      const allZeros =
        dataEmpty.tongCaNam.luotMuon === 0 &&
        dataEmpty.tongCaNam.soDangKy === 0 &&
        dataEmpty.thang.every((t) => t.luotMuon === 0 && t.soDangKy === 0);

      if (allZeros) {
        logPass('Kịch bản d: Năm trống (2001) trả về toàn 0, không lỗi và đủ 12 tháng');
      } else {
        logFail('Kịch bản d: Năm trống 2001', dataEmpty);
      }
    } catch (errD) {
      logFail('Kịch bản d: Borrow-by-month', errD);
    }

    // ==========================================
    // KỊCH BẢN E: TOP-BOOKS
    // ==========================================
    try {
      // Tạo phiếu cho năm biệt lập 2015 để cô lập kiểm tra top-books
      const bookTickets = await TheoDoiMuonSach.create([
        // S01: 3 lượt mượn hợp lệ, 1 phiếu ChoDuyet, 1 phiếu TuChoi (không tính)
        {
          MaDocGia: 'TEST_TB_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2015-05-10T08:00:00+07:00'),
        },
        {
          MaDocGia: 'TEST_TB_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2015-05-12T08:00:00+07:00'),
          NgayTra: new Date('2015-05-20T08:00:00+07:00'),
        },
        {
          MaDocGia: 'TEST_TB_DG03',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2015-05-25T23:59:00+07:00'), // Phiếu lúc 23:59 ngày cuối
        },
        {
          MaDocGia: 'TEST_TB_DG04',
          MaSach: 'TEST_S01',
          TrangThai: 'ChoDuyet',
          NgayDangKy: new Date('2015-05-15T08:00:00+07:00'),
        },
        {
          MaDocGia: 'TEST_TB_DG05',
          MaSach: 'TEST_S01',
          TrangThai: 'TuChoi',
          NgayDangKy: new Date('2015-05-15T08:00:00+07:00'),
        },

        // S02: 2 lượt mượn hợp lệ
        {
          MaDocGia: 'TEST_TB_DG06',
          MaSach: 'TEST_S02',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2015-05-10T08:00:00+07:00'),
        },
        {
          MaDocGia: 'TEST_TB_DG07',
          MaSach: 'TEST_S02',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2015-05-15T08:00:00+07:00'),
        },

        // S_DEL (đã xóa mềm): 2 lượt mượn hợp lệ (hòa điểm với S02)
        {
          MaDocGia: 'TEST_TB_DG08',
          MaSach: 'TEST_S_DEL',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2015-05-11T08:00:00+07:00'),
        },
        {
          MaDocGia: 'TEST_TB_DG09',
          MaSach: 'TEST_S_DEL',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2015-05-12T08:00:00+07:00'),
        },

        // Phiếu lúc 00:00 ngày hôm sau 2015-05-26 giờ VN -> KHÔNG được tính khi denNgay = 2015-05-25
        {
          MaDocGia: 'TEST_TB_DG10',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2015-05-26T00:00:00+07:00'),
        },
      ]);
      createdTicketIds.push(...bookTickets.map((t) => t._id));

      const topRes = await request(server, {
        path: '/api/admin/stats/top-books?tuNgay=2015-05-01&denNgay=2015-05-25&limit=10',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const topData = topRes.body.data;

      // S01 có 3 lượt, đứng đầu
      const book1 = topData.find((b) => b.MaSach === 'TEST_S01');
      const book2 = topData.find((b) => b.MaSach === 'TEST_S02');
      const bookDel = topData.find((b) => b.MaSach === 'TEST_S_DEL');

      if (book1 && book1.soLuotMuon === 3) {
        logPass('Kịch bản e: top-books đếm đúng 3 lượt mượn (phiếu 23:59 được tính, 00:00 hôm sau không tính; ChoDuyet/TuChoi bị bỏ qua)');
      } else {
        logFail('Kịch bản e: Đếm lượt mượn S01', book1);
      }

      // Sách đã xóa mềm vẫn xuất hiện kèm daXoa = true
      if (bookDel && bookDel.daXoa === true && bookDel.soLuotMuon === 2) {
        logPass('Kịch bản e: Sách đã xóa mềm vẫn xuất hiện trong lịch sử thống kê với daXoa = true');
      } else {
        logFail('Kịch bản e: Sách xóa mềm trong top-books', bookDel);
      }

      // Thứ tự hòa điểm: TEST_S02 vs TEST_S_DEL (đều 2 lượt) -> S02 ('TEST_S02' < 'TEST_S_DEL') xếp trước
      const idxS02 = topData.findIndex((b) => b.MaSach === 'TEST_S02');
      const idxSDel = topData.findIndex((b) => b.MaSach === 'TEST_S_DEL');
      if (idxS02 !== -1 && idxSDel !== -1 && idxS02 < idxSDel) {
        logPass('Kịch bản e: Khi hòa lượt mượn, sắp xếp theo MaSach tăng dần ổn định');
      } else {
        logFail('Kịch bản e: Thứ tự hòa điểm', { idxS02, idxSDel });
      }

      // Limit kiểm thử
      const limitRes = await request(server, {
        path: '/api/admin/stats/top-books?tuNgay=2015-05-01&denNgay=2015-05-25&limit=2',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      if (limitRes.body.data.length === 2) {
        logPass('Kịch bản e: Tham số limit hoạt động chính xác (trả về đúng 2 sách)');
      } else {
        logFail('Kịch bản e: Limit top-books', limitRes.body.data.length);
      }
    } catch (errE) {
      logFail('Kịch bản e: Top-books', errE);
    }

    // ==========================================
    // KỊCH BẢN F: OVERDUE
    // ==========================================
    try {
      const now = new Date();
      // Tạo các mốc biên quá hạn
      // 1. Trễ 1 giờ
      const h1Ago = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      // 2. Trễ đúng 24 giờ
      const d1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      // 3. Trễ 25 giờ (1 ngày 1 giờ)
      const h25Ago = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      // 4. Trễ cực lâu (1000 ngày) để kiểm tra trần DonGia của sách TEST_S01 (DonGia = 60000)
      const d1000Ago = new Date(now.getTime() - 1000 * 24 * 60 * 60 * 1000);

      const overdueTickets = await TheoDoiMuonSach.create([
        {
          MaDocGia: 'TEST_OV_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: d1000Ago,
          HanTra: h1Ago,
        },
        {
          MaDocGia: 'TEST_OV_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: d1000Ago,
          HanTra: d1Ago,
        },
        {
          MaDocGia: 'TEST_OV_DG03',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: d1000Ago,
          HanTra: h25Ago,
        },
        {
          MaDocGia: 'TEST_OV_DG04',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: d1000Ago,
          HanTra: d1000Ago, // Quá hạn 1000 ngày
        },
      ]);
      createdTicketIds.push(...overdueTickets.map((t) => t._id));

      const overdueRes = await request(server, {
        path: '/api/admin/stats/overdue?limit=100',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const overdueData = overdueRes.body.data;
      const overdueMeta = overdueRes.body.meta;

      // Không chứa phiếu DaTra, ChoDuyet
      const allAreDangMuonOverdue = overdueData.every((item) => {
        return new Date(item.HanTra).getTime() < now.getTime();
      });

      if (allAreDangMuonOverdue) {
        logPass('Kịch bản f: Danh sách quá hạn chỉ chứa phiếu DangMuon có HanTra < now');
      } else {
        logFail('Kịch bản f: Lọc trạng thái quá hạn');
      }

      // Sắp xếp trễ lâu nhất trước (HanTra tăng dần)
      let sortedCorrectly = true;
      for (let i = 0; i < overdueData.length - 1; i++) {
        if (new Date(overdueData[i].HanTra) > new Date(overdueData[i + 1].HanTra)) {
          sortedCorrectly = false;
          break;
        }
      }
      if (sortedCorrectly) {
        logPass('Kịch bản f: Danh sách sắp xếp trễ lâu nhất lên đầu (HanTra tăng dần)');
      } else {
        logFail('Kịch bản f: Sắp xếp quá hạn');
      }

      // Kiểm tra hàm soNgayTre dùng chung ở các mốc biên
      const fixedNow = new Date('2026-10-18T12:00:00Z');
      const testDungHan = soNgayTre(
        { TrangThai: 'DangMuon', HanTra: new Date('2026-10-18T12:00:00Z') },
        fixedNow
      );
      const testTre1H = soNgayTre(
        { TrangThai: 'DangMuon', HanTra: new Date('2026-10-18T11:00:00Z') },
        fixedNow
      );
      const testTreDung1Ngay = soNgayTre(
        { TrangThai: 'DangMuon', HanTra: new Date('2026-10-17T12:00:00Z') },
        fixedNow
      );
      const testTre1Ngay1H = soNgayTre(
        { TrangThai: 'DangMuon', HanTra: new Date('2026-10-17T11:00:00Z') },
        fixedNow
      );

      if (
        testDungHan === 0 &&
        testTre1H === 1 &&
        testTreDung1Ngay === 1 &&
        testTre1Ngay1H === 2
      ) {
        logPass(
          'Kịch bản f: soNgayTre khớp hàm dùng chung ở các mốc biên (đúng hạn = 0, trễ 1h = 1, trễ đúng 1 ngày = 1, trễ 1 ngày 1h = 2)'
        );
      } else {
        logFail('Kịch bản f: Mốc biên soNgayTre', {
          testDungHan,
          testTre1H,
          testTreDung1Ngay,
          testTre1Ngay1H,
        });
      }

      // Phiếu trễ cực lâu bị chặn ở trần DonGia (TEST_S01 có DonGia = 60000)
      const itemLong = overdueData.find((i) => String(i._id) === String(overdueTickets[3]._id));
      if (itemLong?.phiTreDuKien === 60000) {
        logPass('Kịch bản f: phiTreDuKien bị chặn ở trần DonGia của sách đối với phiếu trễ cực lâu');
      } else {
        logFail('Kịch bản f: Trần đơn giá phiTreDuKien', itemLong?.phiTreDuKien);
      }

      // Phân trang
      const pageRes = await request(server, {
        path: '/api/admin/stats/overdue?page=1&limit=2',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      if (
        pageRes.body.data.length === 2 &&
        pageRes.body.meta.total === overdueMeta.total &&
        pageRes.body.meta.page === 1
      ) {
        logPass('Kịch bản f: Phân trang hoạt động đúng và meta.total phản ánh đúng tổng số phiếu');
      } else {
        logFail('Kịch bản f: Phân trang overdue', pageRes.body.meta);
      }
    } catch (errF) {
      logFail('Kịch bản f: Overdue', errF);
    }

    // ==========================================
    // KỊCH BẢN G: FINES
    // ==========================================
    try {
      // Năm 2018 cô lập
      // Phiếu A: trả tháng 3 nhưng thu phạt tháng 5
      // Phiếu B: trả tháng 3, rách sách, TienPhat = 20000, chưa thanh toán
      // Phiếu C: trả tháng 3, mất sách, TienPhat = 80000, đã thanh toán tháng 3
      // Phiếu D: trả tháng 3, không phạt (KhongPhat) -> đóng góp 0
      const fineTickets = await TheoDoiMuonSach.create([
        {
          MaDocGia: 'TEST_FN_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2018-01-01T00:00:00+07:00'),
          NgayTra: new Date('2018-03-15T10:00:00+07:00'), // Trả tháng 3
          TinhTrangTra: 'BinhThuong',
          TienPhat: 50000,
          TrangThaiPhat: 'DaThanhToan',
          NgayThanhToanPhat: new Date('2018-05-20T10:00:00+07:00'), // Thu phạt tháng 5
        },
        {
          MaDocGia: 'TEST_FN_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2018-01-01T00:00:00+07:00'),
          NgayTra: new Date('2018-03-16T10:00:00+07:00'), // Trả tháng 3
          TinhTrangTra: 'Rach',
          TienPhat: 20000,
          TrangThaiPhat: 'ChuaThanhToan',
        },
        {
          MaDocGia: 'TEST_FN_DG03',
          MaSach: 'TEST_S02',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2018-01-01T00:00:00+07:00'),
          NgayTra: new Date('2018-03-17T10:00:00+07:00'), // Trả tháng 3
          TinhTrangTra: 'Mat',
          TienPhat: 80000,
          TrangThaiPhat: 'DaThanhToan',
          NgayThanhToanPhat: new Date('2018-03-17T10:00:00+07:00'), // Thu phạt tháng 3
        },
        {
          MaDocGia: 'TEST_FN_DG04',
          MaSach: 'TEST_S01',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2018-01-01T00:00:00+07:00'),
          NgayTra: new Date('2018-03-18T10:00:00+07:00'),
          TinhTrangTra: 'BinhThuong',
          TienPhat: 0,
          TrangThaiPhat: 'KhongPhat',
        },
      ]);
      createdTicketIds.push(...fineTickets.map((t) => t._id));

      const finesRes = await request(server, {
        path: '/api/admin/stats/fines?year=2018',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const finesData = finesRes.body.data;

      const m3 = finesData.thang.find((t) => t.thang === 3);
      const m5 = finesData.thang.find((t) => t.thang === 5);

      // Tháng 3 phát sinh: 50k + 20k + 80k = 150k
      // Tháng 3 đã thu: 80k
      // Tháng 5 đã thu: 50k
      // Sách rách: 1, Sách mất: 1 (ở tháng 3)
      if (
        m3.phatPhatSinh === 150000 &&
        m3.daThu === 80000 &&
        m5.phatPhatSinh === 0 &&
        m5.daThu === 50000
      ) {
        logPass('Kịch bản g: Phân biệt chính xác phatPhatSinh (theo NgayTra) và daThu (theo NgayThanhToanPhat)');
      } else {
        logFail('Kịch bản g: phatPhatSinh vs daThu', { m3, m5 });
      }

      if (m3.soSachRach === 1 && m3.soSachMat === 1) {
        logPass('Kịch bản g: soSachRach và soSachMat đếm đúng theo NgayTra và TinhTrangTra');
      } else {
        logFail('Kịch bản g: soSachRach / soSachMat', { r: m3.soSachRach, m: m3.soSachMat });
      }

      // chuaThuHienTai không phụ thuộc năm
      const totalUnpaidInDb = await TheoDoiMuonSach.aggregate([
        { $match: { TrangThaiPhat: 'ChuaThanhToan' } },
        { $group: { _id: null, total: { $sum: '$TienPhat' } } },
      ]);
      const expectedChuaThu = totalUnpaidInDb[0]?.total || 0;

      if (finesData.chuaThuHienTai === expectedChuaThu) {
        logPass('Kịch bản g: chuaThuHienTai phản ánh đúng toàn cục mọi khoản nợ phạt chưa thu');
      } else {
        logFail('Kịch bản g: chuaThuHienTai', { got: finesData.chuaThuHienTai, expectedChuaThu });
      }
    } catch (errG) {
      logFail('Kịch bản g: Fines', errG);
    }

    // ==========================================
    // KỊCH BẢN H: TOP-READERS
    // ==========================================
    try {
      // Độc giả DG01 có 2 lượt mượn (sách S01 và S02), DG02 có 1 lượt mượn trong năm 2016
      const readerTickets = await TheoDoiMuonSach.create([
        {
          MaDocGia: 'TEST_RD_DG01',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2016-04-01T08:00:00+07:00'),
          TienPhat: 10000,
        },
        {
          MaDocGia: 'TEST_RD_DG01',
          MaSach: 'TEST_S02',
          TrangThai: 'DaTra',
          NgayMuon: new Date('2016-04-05T08:00:00+07:00'),
          TienPhat: 15000,
        },
        {
          MaDocGia: 'TEST_RD_DG02',
          MaSach: 'TEST_S01',
          TrangThai: 'DangMuon',
          NgayMuon: new Date('2016-04-02T08:00:00+07:00'),
          TienPhat: 5000,
        },
        // Phiếu ChoDuyet không được tính là lượt mượn
        {
          MaDocGia: 'TEST_RD_DG02',
          MaSach: 'TEST_S02',
          TrangThai: 'ChoDuyet',
          NgayDangKy: new Date('2016-04-02T08:00:00+07:00'),
        },
      ]);
      createdTicketIds.push(...readerTickets.map((t) => t._id));

      const readersRes = await request(server, {
        path: '/api/admin/stats/top-readers?tuNgay=2016-01-01&denNgay=2016-12-31&limit=10',
        headers: { Authorization: `Bearer ${thuthuToken}` },
      });
      const readersData = readersRes.body.data;

      const r1 = readersData.find((r) => r.MaDocGia === 'TEST_RD_DG01');
      const r2 = readersData.find((r) => r.MaDocGia === 'TEST_RD_DG02');

      if (r1 && r1.soLuotMuon === 2 && r1.tongPhat === 25000) {
        logPass('Kịch bản h: Độc giả 1 đếm đúng số lượt mượn và tổng phạt (25000 VND)');
      } else {
        logFail('Kịch bản h: Độc giả 1', r1);
      }

      if (r2 && r2.soLuotMuon === 1) {
        logPass('Kịch bản h: Phiếu ChoDuyet không được tính vào số lượt mượn độc giả');
      } else {
        logFail('Kịch bản h: Độc giả 2', r2);
      }

      // Kiểm tra bảo mật: Không có email hay số điện thoại
      const hasSensitiveFields = readersData.some(
        (r) => r.Email !== undefined || r.DienThoai !== undefined || r.email !== undefined
      );

      if (!hasSensitiveFields) {
        logPass('Kịch bản h: top-readers TUYỆT ĐỐI KHÔNG chứa email hay điện thoại độc giả');
      } else {
        logFail('Kịch bản h: Lộ trường nhạy cảm trong top-readers');
      }
    } catch (errH) {
      logFail('Kịch bản h: Top-readers', errH);
    }

    // ==========================================
    // KỊCH BẢN I: VALIDATION
    // ==========================================
    try {
      const invalidQueries = [
        { path: '/api/admin/stats/borrow-by-month?year=abc', name: 'year là chuỗi chữ' },
        { path: '/api/admin/stats/borrow-by-month?year=1999', name: 'year < 2000' },
        { path: '/api/admin/stats/borrow-by-month?year=2099', name: 'year quá lớn' },
        { path: '/api/admin/stats/borrow-by-month?year[$gt]=1', name: 'NoSQL injection year[$gt]=1' },
        { path: '/api/admin/stats/top-books?limit=0', name: 'limit = 0' },
        { path: '/api/admin/stats/top-books?limit=1000', name: 'limit = 1000 (> 50)' },
        { path: '/api/admin/stats/top-books?limit=abc', name: 'limit = abc' },
        { path: '/api/admin/stats/top-books?tuNgay=2026-05-10&denNgay=2026-05-01', name: 'tuNgay sau denNgay' },
        { path: '/api/admin/stats/top-books?tuNgay=2020-01-01&denNgay=2026-01-02', name: 'Khoảng thời gian > 5 năm' },
        { path: '/api/admin/stats/top-books?tuNgay=2026-99-99', name: 'Ngày sai định dạng' },
        { path: '/api/admin/stats/overview?la=1', name: 'Tham số lạ ở overview' },
        { path: '/api/admin/stats/overdue?limit=0', name: 'overdue limit = 0' },
        { path: '/api/admin/stats/overdue?limit=500', name: 'overdue limit = 500 (> 100)' },
      ];

      let allValidation400 = true;
      for (const q of invalidQueries) {
        const res = await request(server, {
          path: q.path,
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status !== 400 || res.body?.error?.code !== 'VALIDATION_ERROR') {
          allValidation400 = false;
          logFail(`Kịch bản i: ${q.name}`, `Nhận status ${res.status}, body: ${JSON.stringify(res.body)}`);
        }
      }

      if (allValidation400) {
        logPass('Kịch bản i: Toàn bộ truy vấn sai kiểu, khoảng cách, inject, tham số lạ đều trả 400 VALIDATION_ERROR');
      }
    } catch (errI) {
      logFail('Kịch bản i: Validation', errI);
    }

    // ==========================================
    // KỊCH BẢN J: HIỆU NĂNG CƠ BẢN VÀ THỬ TẢI VỚI 2000 PHIẾU
    // ==========================================
    try {
      // 1. Tạo 2000 phiếu thử nghiệm giả lập (mỗi phiếu 1 reader ID riêng biệt để tránh trùng index)
      const bulkTickets = [];
      const baseDate = new Date('2024-01-01T08:00:00Z');
      for (let i = 0; i < 2000; i++) {
        const d = new Date(baseDate.getTime() + i * 3600000);
        bulkTickets.push({
          MaDocGia: `TEST_BULK_DG_${i}`,
          MaSach: i % 2 === 0 ? 'TEST_S01' : 'TEST_S02',
          TrangThai: i % 3 === 0 ? 'DaTra' : 'DangMuon',
          NgayMuon: d,
          NgayDangKy: d,
          NgayTra: i % 3 === 0 ? new Date(d.getTime() + 86400000) : null,
          HanTra: new Date(d.getTime() + 14 * 86400000),
          TienPhat: i % 10 === 0 ? 10000 : 0,
          TrangThaiPhat: i % 10 === 0 ? 'DaThanhToan' : 'KhongPhat',
          NgayThanhToanPhat: i % 10 === 0 ? new Date(d.getTime() + 86400000) : null,
        });
      }

      const inserted = await TheoDoiMuonSach.insertMany(bulkTickets);
      createdTicketIds.push(...inserted.map((t) => t._id));

      // 2. Đo thời gian cả 6 endpoint với 2000 phiếu
      const startBulkTest = Date.now();
      const results = await Promise.all([
        request(server, { path: '/api/admin/stats/overview', headers: { Authorization: `Bearer ${adminToken}` } }),
        request(server, { path: '/api/admin/stats/top-books?limit=10', headers: { Authorization: `Bearer ${adminToken}` } }),
        request(server, { path: '/api/admin/stats/borrow-by-month?year=2024', headers: { Authorization: `Bearer ${adminToken}` } }),
        request(server, { path: '/api/admin/stats/overdue?limit=10', headers: { Authorization: `Bearer ${adminToken}` } }),
        request(server, { path: '/api/admin/stats/fines?year=2024', headers: { Authorization: `Bearer ${adminToken}` } }),
        request(server, { path: '/api/admin/stats/top-readers?limit=10', headers: { Authorization: `Bearer ${adminToken}` } }),
      ]);
      const totalBulkTime = Date.now() - startBulkTest;

      const allSuccess = results.every((r) => r.status === 200);

      if (allSuccess && totalBulkTime < 2000) {
        logPass(
          `Kịch bản j: Hiệu năng tốt với 2000+ phiếu (gọi đồng thời 6 endpoint hoàn thành trong ${totalBulkTime}ms)`
        );
      } else {
        logFail('Kịch bản j: Hiệu năng tải', `Thời gian: ${totalBulkTime}ms, thành công: ${allSuccess}`);
      }

      // Dọn sạch 2000 phiếu thử ngay
      await TheoDoiMuonSach.deleteMany({ _id: { $in: inserted.map((t) => t._id) } });
    } catch (errJ) {
      logFail('Kịch bản j: Hiệu năng', errJ);
    }

    // ==========================================
    // KỊCH BẢN K: TÍNH CHỈ ĐỌC (KHÔNG GHI DỮ LIỆU)
    // ==========================================
    try {
      const getCounts = async () => {
        return {
          docGia: await DocGia.countDocuments(),
          sach: await Sach.countDocuments(),
          nhaXuatBan: await NhaXuatBan.countDocuments(),
          nhanVien: await NhanVien.countDocuments(),
          theoDoi: await TheoDoiMuonSach.countDocuments(),
          nhatKy: await NhatKy.countDocuments(),
          cauHinh: await CauHinh.countDocuments(),
        };
      };

      const countsBefore = await getCounts();

      // Gọi liên tiếp 3 lần cả 6 endpoint
      for (let i = 0; i < 3; i++) {
        for (const ep of endpoints) {
          await request(server, {
            path: ep,
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      }

      const countsAfter = await getCounts();

      const unchanged =
        countsBefore.docGia === countsAfter.docGia &&
        countsBefore.sach === countsAfter.sach &&
        countsBefore.nhaXuatBan === countsAfter.nhaXuatBan &&
        countsBefore.nhanVien === countsAfter.nhanVien &&
        countsBefore.theoDoi === countsAfter.theoDoi &&
        countsBefore.nhatKy === countsAfter.nhatKy &&
        countsBefore.cauHinh === countsAfter.cauHinh;

      if (unchanged) {
        logPass('Kịch bản k: Toàn bộ 6 endpoint chỉ đọc, không thay đổi bất kỳ collection nào và không ghi NhatKy');
      } else {
        logFail('Kịch bản k: Phát hiện dữ liệu bị thay đổi', { countsBefore, countsAfter });
      }
    } catch (errK) {
      logFail('Kịch bản k: Chỉ đọc', errK);
    }

    // ==========================================
    // KỊCH BẢN L: LAZY-CHECK TỰ ĐỘNG HỦY PHIẾU HẾT HẠN KHI GỌI OVERVIEW
    // ==========================================
    try {
      _resetSweepStateForTest();

      // Chụp số liệu overview ban đầu
      const preRes = await request(server, {
        path: '/api/admin/stats/overview',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const preData = preRes.body.data;

      // Giảm 1 SoQuyenConLai của TEST_S01 để mô phỏng sách đã được giữ khi duyệt
      await Sach.updateOne(
        { MaSach: 'TEST_S01' },
        { $inc: { SoQuyenConLai: -1 } }
      );

      const staleHanNhan = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // Quá hạn nhận 3 ngày
      const staleTicket = await TheoDoiMuonSach.create({
        MaDocGia: 'TEST_LZ_DG01',
        MaSach: 'TEST_S01',
        TrangThai: 'DaDuyet',
        NgayDangKy: staleHanNhan,
        NgayDuyet: staleHanNhan,
        HanNhanSach: staleHanNhan,
      });
      createdTicketIds.push(staleTicket._id);

      // Reset lại sweep state để đảm bảo overview sẽ kích hoạt quét lười
      _resetSweepStateForTest();

      // Gọi overview: lazy-check sẽ chạy ngay đầu hàm, hủy phiếu DaDuyet -> DaHuy và hoàn kho
      const postRes = await request(server, {
        path: '/api/admin/stats/overview',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const postData = postRes.body.data;

      const checkDoc = await TheoDoiMuonSach.findById(staleTicket._id);

      const daHuyTang = postData.phieuTheoTrangThai.DaHuy === preData.phieuTheoTrangThai.DaHuy + 1;
      const daDuyetKhongDoi = postData.phieuTheoTrangThai.DaDuyet === preData.phieuTheoTrangThai.DaDuyet;

      if (checkDoc.TrangThai === 'DaHuy' && daHuyTang && daDuyetKhongDoi) {
        logPass(
          'Kịch bản l: Phiếu DaDuyet quá HanNhanSach tự động bị lazy-check chuyển DaHuy khi gọi overview, số DaHuy tăng và DaDuyet không bị tồn đọng'
        );
      } else {
        logFail('Kịch bản l: Lazy-check overview', {
          docStatus: checkDoc.TrangThai,
          daHuyTang,
          daDuyetKhongDoi,
          preDaHuy: preData.phieuTheoTrangThai.DaHuy,
          postDaHuy: postData.phieuTheoTrangThai.DaHuy,
        });
      }
    } catch (errL) {
      logFail('Kịch bản l: Lazy check overview', errL);
    }

    console.log('\n----------------------------------------');
    console.log(`KẾT QUẢ KIỂM THỬ: ${passedCount} PASS, ${failedCount} FAIL`);
    console.log('----------------------------------------\n');
  } catch (mainErr) {
    console.error('[TEST_RUNNER_ERROR]', mainErr);
    failedCount++;
  } finally {
    await cleanup();
    if (server) {
      server.close();
    }
    await disconnectDB();
    process.exit(failedCount > 0 ? 1 : 0);
  }
};

run();
