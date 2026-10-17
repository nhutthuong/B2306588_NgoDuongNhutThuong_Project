import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  DocGia,
  Sach,
  NhaXuatBan,
  NhanVien,
  TheoDoiMuonSach,
  RefreshToken,
  NhatKy,
} from '../models/index.js';
import {
  signAccessToken,
  hashPassword,
  issueRefreshToken,
} from '../services/auth.service.js';

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
      path: encodeURI(options.path),
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
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }

    req.end();
  });
};

const run = async () => {
  console.log('=== BẮT ĐẦU KIỂM THỬ P4-1: QUẢN LÝ ĐỘC GIẢ (ADMIN API) ===\n');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const TEST_MA_DOC_GIA = ['DG9991', 'DG9992', 'DG9993', 'DG9994', 'DG9995'];
  const TEST_MSNV = ['NV991', 'NV992', 'NV993'];
  const TEST_MA_SACH = ['S9991', 'S9992'];
  const TEST_MA_NXB = ['NXB991'];

  const cleanup = async () => {
    try {
      await DocGia.deleteMany({ MaDocGia: { $in: TEST_MA_DOC_GIA } });
      await NhanVien.deleteMany({ MSNV: { $in: TEST_MSNV } });
      await Sach.deleteMany({ MaSach: { $in: TEST_MA_SACH } });
      await NhaXuatBan.deleteMany({ MaNXB: { $in: TEST_MA_NXB } });
      await TheoDoiMuonSach.deleteMany({ MaDocGia: { $in: TEST_MA_DOC_GIA } });
      await RefreshToken.deleteMany({ ChuSoHuu: { $in: [...TEST_MA_DOC_GIA, ...TEST_MSNV] } });
      await NhatKy.deleteMany({ MSNV: { $in: TEST_MSNV } });
    } catch (err) {
      console.error('Lỗi dọn dẹp dữ liệu thử:', err.message);
    }
  };

  try {
    // 0. Dọn dữ liệu tồn đọng nếu có
    await cleanup();

    // 1. Tạo dữ liệu mẫu
    const rawPassword = 'Password123@';
    const hashedPassword = await hashPassword(rawPassword);

    // Tạo NXB và Sách
    await NhaXuatBan.create({
      MaNXB: 'NXB991',
      TenNXB: 'NXB Thử Nghiệm Reader',
      DiaChi: 'Hà Nội',
    });

    await Sach.create([
      {
        MaSach: 'S9991',
        TenSach: 'Lập trình Node.js thực chiến',
        DonGia: 120000,
        SoQuyen: 10,
        SoQuyenConLai: 8,
        MaNXB: 'NXB991',
        NguonGocTacGia: 'Nguyễn Văn A',
      },
      {
        MaSach: 'S9992',
        TenSach: 'Học Vue 3 trong 24 giờ',
        DonGia: 90000,
        SoQuyen: 5,
        SoQuyenConLai: 4,
        MaNXB: 'NXB991',
        NguonGocTacGia: 'Trần Thị B',
      },
    ]);

    // Tạo nhân viên: Admin, Thủ thư, và Nhân viên đang buộc đổi mật khẩu
    const adminStaff = await NhanVien.create({
      MSNV: 'NV991',
      HoTenNV: 'Admin Thử Nghiệm',
      Password: hashedPassword,
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const thuThuStaff = await NhanVien.create({
      MSNV: 'NV992',
      HoTenNV: 'Thủ Thư Thử Nghiệm',
      Password: hashedPassword,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const pwdChangeStaff = await NhanVien.create({
      MSNV: 'NV993',
      HoTenNV: 'Nhân Viên Buộc Đổi Pass',
      Password: hashedPassword,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
    });

    // Tạo độc giả:
    // DG9991: Đang có 1 phiếu DangMuon quá hạn và 1 phiếu phạt chưa thanh toán (50000)
    // DG9992: Hoạt động, không nợ, không phiếu mượn (để test xóa)
    // DG9993: Hoạt động, có 1 phiếu DaTra (để test chặn xóa khi có phiếu lịch sử)
    // DG9994: Bị khóa
    const reader1 = await DocGia.create({
      MaDocGia: 'DG9991',
      HoLot: 'Nguyễn Văn',
      Ten: 'An',
      NgaySinh: new Date('2000-01-15'),
      Phai: 'Nam',
      DiaChi: '123 Đường 3/2, Cần Thơ',
      DienThoai: '0912345671',
      Email: 'test_reader_an@example.com',
      Password: hashedPassword,
      TrangThai: 'HoatDong',
      SoLanSaiMatKhau: 0,
    });

    const reader2 = await DocGia.create({
      MaDocGia: 'DG9992',
      HoLot: 'Trần Thị',
      Ten: 'Bình',
      NgaySinh: new Date('2002-05-20'),
      Phai: 'Nu',
      DiaChi: '456 Nguyễn Huệ, TP.HCM',
      DienThoai: '0912345672',
      Email: 'test_reader_binh@example.com',
      Password: hashedPassword,
      TrangThai: 'HoatDong',
      SoLanSaiMatKhau: 2,
    });

    const reader3 = await DocGia.create({
      MaDocGia: 'DG9993',
      HoLot: 'Lê Hoàng',
      Ten: 'Cường',
      NgaySinh: new Date('1998-09-10'),
      Phai: 'Nam',
      DiaChi: '789 Trần Phú, Đà Nẵng',
      DienThoai: '0912345673',
      Email: 'test_reader_cuong@example.com',
      Password: hashedPassword,
      TrangThai: 'HoatDong',
    });

    const reader4 = await DocGia.create({
      MaDocGia: 'DG9994',
      HoLot: 'Phạm Thu',
      Ten: 'Dung',
      NgaySinh: new Date('2001-11-25'),
      Phai: 'Nu',
      DiaChi: '321 Lê Lợi, Huế',
      DienThoai: '0912345674',
      Email: 'test_reader_dung@example.com',
      Password: hashedPassword,
      TrangThai: 'BiKhoa',
    });

    // Tạo phiếu mượn cho DG9991:
    // Phiếu 1: DangMuon quá hạn (HanTra ở quá khứ) -> dangChiemCho: 1, coQuaHan: true
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const wayPastDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await TheoDoiMuonSach.create({
      MaDocGia: 'DG9991',
      MaSach: 'S9991',
      TrangThai: 'DangMuon',
      NgayMuon: wayPastDate,
      HanTra: pastDate,
      MSNVGiao: 'NV991',
    });

    // Phiếu 2: DaTra nhưng có phạt chưa thanh toán 50000 -> tongPhatChuaTra: 50000
    await TheoDoiMuonSach.create({
      MaDocGia: 'DG9991',
      MaSach: 'S9992',
      TrangThai: 'DaTra',
      NgayMuon: wayPastDate,
      NgayTra: new Date(),
      TinhTrangTra: 'Rach',
      MucRach: 'Nhe',
      TienPhat: 50000,
      TrangThaiPhat: 'ChuaThanhToan',
      GhiChuPhat: 'Rách bìa nhẹ',
      MSNVNhanTra: 'NV992',
    });

    // Tạo phiếu mượn cho DG9993: DaTra hoàn tất, không nợ
    await TheoDoiMuonSach.create({
      MaDocGia: 'DG9993',
      MaSach: 'S9991',
      TrangThai: 'DaTra',
      NgayMuon: wayPastDate,
      NgayTra: pastDate,
      TinhTrangTra: 'BinhThuong',
      TrangThaiPhat: 'KhongPhat',
      MSNVNhanTra: 'NV992',
    });

    // Cấp access token cho các vai trò
    const adminToken = signAccessToken(adminStaff, 'nhanvien');
    const thuThuToken = signAccessToken(thuThuStaff, 'nhanvien');
    const pwdChangeToken = signAccessToken(pwdChangeStaff, 'nhanvien');
    const readerToken = signAccessToken(reader1, 'docgia');

    // Cấp refresh token cho reader2 để test việc dọn token khi xóa
    await issueRefreshToken('DG9992', 'docgia');

    // =========================================================================
    // a. KIỂM THỬ PHÂN QUYỀN VÀ TRẠNG THÁI XÁC THỰC
    // =========================================================================
    console.log('--- a. Kiểm thử phân quyền & xác thực ---');

    // a1. Không token -> 401
    {
      const res = await request(server, { path: '/api/admin/readers' });
      if (res.status === 401 && res.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('a1. GET /readers không có token bị từ chối 401');
      } else {
        logFail('a1. GET /readers không có token', `Status: ${res.status}`);
      }
    }

    // a2. Token độc giả gọi API admin -> 401 UNAUTHENTICATED
    {
      const res = await request(server, {
        path: '/api/admin/readers',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.status === 401) {
        logPass('a2. Token độc giả gọi API admin bị từ chối 401');
      } else {
        logFail('a2. Token độc giả gọi API admin', `Status: ${res.status}`);
      }
    }

    // a3. Tài khoản nhân viên đang buộc đổi mật khẩu -> 403 MUST_CHANGE_PASSWORD
    {
      const res = await request(server, {
        path: '/api/admin/readers',
        headers: { Authorization: `Bearer ${pwdChangeToken}` },
      });
      if (res.status === 403 && res.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('a3. Nhân viên BatBuocDoiMatKhau=true bị chặn 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('a3. Nhân viên BatBuocDoiMatKhau=true', `Status: ${res.status}`);
      }
    }

    // a4. Thủ thư xem danh sách thành công
    {
      const res = await request(server, {
        path: '/api/admin/readers',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });
      if (res.status === 200 && res.body?.success) {
        logPass('a4. Thủ thư xem danh sách độc giả thành công 200');
      } else {
        logFail('a4. Thủ thư xem danh sách', `Status: ${res.status}`);
      }
    }

    // a5. Thủ thư gọi status hoặc DELETE -> 403 FORBIDDEN
    {
      const resStatus = await request(
        server,
        {
          path: '/api/admin/readers/DG9991/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { TrangThai: 'BiKhoa' }
      );
      const resDelete = await request(server, {
        path: '/api/admin/readers/DG9992',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });

      if (
        resStatus.status === 403 &&
        resStatus.body?.error?.code === 'FORBIDDEN' &&
        resDelete.status === 403 &&
        resDelete.body?.error?.code === 'FORBIDDEN'
      ) {
        logPass('a5. Thủ thư gọi status hoặc DELETE bị chặn 403 FORBIDDEN');
      } else {
        logFail(
          'a5. Thủ thư gọi status hoặc DELETE',
          `Status: status=${resStatus.status}, delete=${resDelete.status}`
        );
      }
    }

    // =========================================================================
    // b. KIỂM THỬ DANH SÁCH & TÌM KIẾM & THỐNG KÊ GỘP
    // =========================================================================
    console.log('\n--- b. Kiểm thử danh sách, tìm kiếm & thống kê gộp ---');

    // b1. Tìm kiếm theo mã, họ lót, tên, email, điện thoại
    {
      const resMa = await request(server, {
        path: '/api/admin/readers?search=DG9991',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resHo = await request(server, {
        path: '/api/admin/readers?search=Nguyễn',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resTen = await request(server, {
        path: '/api/admin/readers?search=An',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resEmail = await request(server, {
        path: '/api/admin/readers?search=test_reader_an@example.com',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resPhone = await request(server, {
        path: '/api/admin/readers?search=0912345671',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resFullName = await request(server, {
        path: '/api/admin/readers?search=Nguyễn Văn An',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const allFound =
        resMa.body?.data?.some((r) => r.MaDocGia === 'DG9991') &&
        resHo.body?.data?.some((r) => r.MaDocGia === 'DG9991') &&
        resTen.body?.data?.some((r) => r.MaDocGia === 'DG9991') &&
        resEmail.body?.data?.some((r) => r.MaDocGia === 'DG9991') &&
        resPhone.body?.data?.some((r) => r.MaDocGia === 'DG9991') &&
        resFullName.body?.data?.some((r) => r.MaDocGia === 'DG9991');

      if (allFound) {
        logPass('b1. Tìm kiếm theo mã, họ, tên, email, điện thoại và họ tên ghép');
      } else {
        logFail('b1. Tìm kiếm độc giả', 'Một trong các tiêu chí tìm kiếm không khớp DG9991');
      }
    }

    // b2. Tìm ".*" hoặc "(" không khớp mọi thứ và không gây 500
    {
      const resRegex1 = await request(server, {
        path: '/api/admin/readers?search=.*',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resRegex2 = await request(server, {
        path: '/api/admin/readers?search=(',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (resRegex1.status === 200 && resRegex2.status === 200) {
        logPass('b2. Tìm kiếm ký tự đặc biệt ".*" hoặc "(" không gây 500 (chống ReDoS/regex injection)');
      } else {
        logFail('b2. Ký tự đặc biệt regex', `Status: 1=${resRegex1.status}, 2=${resRegex2.status}`);
      }
    }

    // b3. search[$ne]=x không gây 500 (NoSQL injection)
    {
      const resNoSql = await request(server, {
        path: '/api/admin/readers?search[$ne]=x',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resNoSql.status === 200 || resNoSql.status === 400) {
        logPass('b3. search[$ne]=x không gây lỗi 500');
      } else {
        logFail('b3. search[$ne]=x', `Status: ${resNoSql.status}`);
      }
    }

    // b4. limit > 100 bị chặn 400
    {
      const resLimit = await request(server, {
        path: '/api/admin/readers?limit=150',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resLimit.status === 400 && resLimit.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('b4. limit > 100 bị chặn 400 VALIDATION_ERROR');
      } else {
        logFail('b4. limit > 100', `Status: ${resLimit.status}`);
      }
    }

    // b5. Sort ngoài whitelist bị từ chối 400
    {
      const resSort = await request(server, {
        path: '/api/admin/readers?sort=Password',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resSort.status === 400 && resSort.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('b5. sort ngoài whitelist bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('b5. sort ngoài whitelist', `Status: ${resSort.status}`);
      }
    }

    // b6. Lọc theo trangThai
    {
      const resLocked = await request(server, {
        path: '/api/admin/readers?trangThai=BiKhoa',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const allLocked = resLocked.body?.data?.every((r) => r.TrangThai === 'BiKhoa');
      const hasDung = resLocked.body?.data?.some((r) => r.MaDocGia === 'DG9994');

      if (resLocked.status === 200 && allLocked && hasDung) {
        logPass('b6. Lọc theo trangThai=BiKhoa chính xác');
      } else {
        logFail('b6. Lọc trạng thái', `Status: ${resLocked.status}`);
      }
    }

    // b7. Thống kê dangChiemCho, coQuaHan, tongPhatChuaTra bằng truy vấn gộp
    {
      const resStats = await request(server, {
        path: '/api/admin/readers?search=DG9991',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const item = resStats.body?.data?.find((r) => r.MaDocGia === 'DG9991');

      if (
        item &&
        item.dangChiemCho === 1 &&
        item.coQuaHan === true &&
        item.tongPhatChuaTra === 50000
      ) {
        logPass('b7. Thống kê ghép aggregate đúng: dangChiemCho=1, coQuaHan=true, tongPhatChuaTra=50000');
      } else {
        logFail(
          'b7. Thống kê gộp',
          `Chi tiết: dangChiemCho=${item?.dangChiemCho}, coQuaHan=${item?.coQuaHan}, tongPhat=${item?.tongPhatChuaTra}`
        );
      }
    }

    // =========================================================================
    // c. KIỂM THỬ HỒ SƠ CHI TIẾT & LỊCH SỬ MƯỢN
    // =========================================================================
    console.log('\n--- c. Kiểm thử hồ sơ chi tiết & lịch sử mượn ---');

    // c1. Chi tiết đúng summary và lịch sử mượn kèm TenSach, isOverdue, soNgayTre
    {
      const res = await request(server, {
        path: '/api/admin/readers/DG9991',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });

      const body = res.body?.data;
      const borrowings = body?.borrowings?.items || [];
      const hasTenSach = borrowings.every((b) => typeof b.TenSach === 'string' && b.TenSach.length > 0);
      const overduePhieu = borrowings.find((b) => b.isOverdue === true);

      if (
        res.status === 200 &&
        body?.MaDocGia === 'DG9991' &&
        body?.summary?.dangChiemCho === 1 &&
        body?.summary?.coQuaHan === true &&
        body?.summary?.tongPhatChuaTra === 50000 &&
        hasTenSach &&
        overduePhieu &&
        overduePhieu.soNgayTre > 0
      ) {
        logPass('c1. Chi tiết độc giả đúng summary, lịch sử mượn có TenSach và cờ quá hạn');
      } else {
        logFail('c1. Chi tiết độc giả', `Status: ${res.status}`);
      }
    }

    // c2. Phân trang và lọc trạng thái lịch sử mượn
    {
      const resFilter = await request(server, {
        path: '/api/admin/readers/DG9991?borrowLimit=1&trangThai=DangMuon',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const items = resFilter.body?.data?.borrowings?.items || [];
      const meta = resFilter.body?.data?.borrowings?.meta;

      if (items.length === 1 && items[0].TrangThai === 'DangMuon' && meta?.total === 1) {
        logPass('c2. Phân trang và lọc trạng thái lịch sử mượn riêng biệt thành công');
      } else {
        logFail('c2. Lọc lịch sử mượn', `Items: ${items.length}, meta: ${JSON.stringify(meta)}`);
      }
    }

    // c3. Không để lộ Password hay trường nội bộ
    {
      const res = await request(server, {
        path: '/api/admin/readers/DG9991',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = res.body?.data || {};

      if (
        data.Password === undefined &&
        data.SoLanSaiMatKhau === undefined &&
        data.KhoaDen === undefined
      ) {
        logPass('c3. Phản hồi chi tiết không lộ Password hay SoLanSaiMatKhau/KhoaDen');
      } else {
        logFail('c3. Bảo mật trường nội bộ', 'Có trường nhạy cảm xuất hiện trong response');
      }
    }

    // c4. Mã sai định dạng -> 400 VALIDATION_ERROR
    {
      const res = await request(server, {
        path: '/api/admin/readers/INVALID_CODE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 400 && res.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('c4. Mã độc giả sai định dạng trả 400 VALIDATION_ERROR');
      } else {
        logFail('c4. Mã sai định dạng', `Status: ${res.status}`);
      }
    }

    // c5. Mã không tồn tại -> 404 NOT_FOUND
    {
      const res = await request(server, {
        path: '/api/admin/readers/DG9999',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 404 && res.body?.error?.code === 'NOT_FOUND') {
        logPass('c5. Mã độc giả không tồn tại trả 404 NOT_FOUND');
      } else {
        logFail('c5. Mã không tồn tại', `Status: ${res.status}`);
      }
    }

    // =========================================================================
    // d. KIỂM THỬ SỬA THÔNG TIN ĐỘC GIẢ (PUT)
    // =========================================================================
    console.log('\n--- d. Kiểm thử sửa thông tin (PUT) ---');

    // d1. Whitelist cứng: gửi trường cấm (Email, TrangThai, Password, MaDocGia, foo) -> 400
    {
      const resEmail = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { Email: 'hacker@example.com' }
      );
      const resStatus = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { TrangThai: 'BiKhoa' }
      );
      const resPass = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { Password: 'NewPassword123@' }
      );
      const resMa = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { MaDocGia: 'DG9999' }
      );
      const resStrange = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { TruongLa: 'test' }
      );

      const allBlocked =
        resEmail.status === 400 &&
        resStatus.status === 400 &&
        resPass.status === 400 &&
        resMa.status === 400 &&
        resStrange.status === 400;

      if (allBlocked) {
        logPass('d1. Whitelist cứng: gửi Email, TrangThai, Password, MaDocGia, trường lạ đều bị chặn 400');
      } else {
        logFail('d1. Whitelist PUT', 'Một trong các trường cấm không bị chặn 400');
      }
    }

    // d2. Validate tuổi (5 - 120), giới tính enum (Nam|Nu|Khac), regex điện thoại
    {
      const resYoung = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { NgaySinh: '2025-01-01' } // Dưới 5 tuổi
      );
      const resGender = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { Phai: 'Unknown' }
      );
      const resPhone = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DienThoai: '12345' }
      );

      if (resYoung.status === 400 && resGender.status === 400 && resPhone.status === 400) {
        logPass('d2. Validate đúng độ tuổi, giới tính và định dạng số điện thoại');
      } else {
        logFail('d2. Validate trường', `Status: young=${resYoung.status}, gender=${resGender.status}, phone=${resPhone.status}`);
      }
    }

    // d3. Thủ thư cập nhật hợp lệ thành công
    {
      const resUpdate = await request(
        server,
        {
          path: '/api/admin/readers/DG9991',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        {
          HoLot: 'Nguyễn Văn Đã Sửa',
          Ten: 'An',
          DiaChi: 'Số 999 Đường Mới, Ninh Kiều, Cần Thơ',
          DienThoai: '0988776655',
        }
      );

      const checkDb = await DocGia.findOne({ MaDocGia: 'DG9991' });

      if (
        resUpdate.status === 200 &&
        checkDb.HoLot === 'Nguyễn Văn Đã Sửa' &&
        checkDb.DiaChi === 'Số 999 Đường Mới, Ninh Kiều, Cần Thơ' &&
        checkDb.DienThoai === '0988776655'
      ) {
        logPass('d3. Thủ thư cập nhật thông tin độc giả hợp lệ thành công');
      } else {
        logFail('d3. Cập nhật thông tin', `Status: ${resUpdate.status}`);
      }
    }

    // =========================================================================
    // e. KIỂM THỬ KHÓA VÀ MỞ KHÓA TÀI KHOẢN (PATCH /status)
    // =========================================================================
    console.log('\n--- e. Kiểm thử Khóa và Mở khóa tài khoản ---');

    // e1. Khóa tài khoản: set BiKhoa, thu hồi refresh token, ghi audit log có LyDo
    {
      // Cấp refresh token cho reader1
      const rawRt = await issueRefreshToken('DG9991', 'docgia');

      const resLock = await request(
        server,
        {
          path: '/api/admin/readers/DG9991/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          TrangThai: 'BiKhoa',
          LyDo: 'Vi phạm quy định nhiều lần',
        }
      );

      // Kiểm tra DB
      const readerDb = await DocGia.findOne({ MaDocGia: 'DG9991' });
      // Kiểm tra refresh token đã bị thu hồi
      const activeRtCount = await RefreshToken.countDocuments({
        ChuSoHuu: 'DG9991',
        LoaiTaiKhoan: 'docgia',
        ThuHoi: false,
      });

      if (resLock.status === 200 && readerDb.TrangThai === 'BiKhoa' && activeRtCount === 0) {
        logPass('e1. Khóa tài khoản: set BiKhoa và thu hồi toàn bộ RefreshToken');
      } else {
        logFail('e1. Khóa tài khoản', `Status: ${resLock.status}, Active RT: ${activeRtCount}`);
      }
    }

    // e2. Độc giả bị khóa gọi API bằng Access token hiện có bị chặn ngay 403 ACCOUNT_LOCKED
    {
      const resUserApi = await request(server, {
        path: '/api/user/borrowings',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (resUserApi.status === 403 && resUserApi.body?.error?.code === 'ACCOUNT_LOCKED') {
        logPass('e2. Access Token hiện có của độc giả bị chặn ngay ở request kế tiếp (403 ACCOUNT_LOCKED)');
      } else {
        logFail('e2. Chặn access token khi bị khóa', `Status: ${resUserApi.status}`);
      }
    }

    // e3. Độc giả bị khóa không đăng nhập được (403 ACCOUNT_LOCKED)
    {
      const resLogin = await request(
        server,
        {
          path: '/api/user/auth/login',
          method: 'POST',
        },
        {
          Email: 'test_reader_an@example.com',
          Password: rawPassword,
        }
      );
      if (resLogin.status === 403 && resLogin.body?.error?.code === 'ACCOUNT_LOCKED') {
        logPass('e3. Độc giả bị khóa không đăng nhập được (403 ACCOUNT_LOCKED)');
      } else {
        logFail('e3. Đăng nhập khi bị khóa', `Status: ${resLogin.status}`);
      }
    }

    // e4. Khóa hai lần liên tiếp -> lần hai 409 INVALID_STATE
    {
      const resLockAgain = await request(
        server,
        {
          path: '/api/admin/readers/DG9991/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { TrangThai: 'BiKhoa' }
      );
      if (resLockAgain.status === 409 && resLockAgain.body?.error?.code === 'INVALID_STATE') {
        logPass('e4. Khóa hai lần liên tiếp trả 409 INVALID_STATE');
      } else {
        logFail('e4. Khóa hai lần liên tiếp', `Status: ${resLockAgain.status}`);
      }
    }

    // e5. Khóa độc giả KHÔNG tự hủy các phiếu mượn của họ
    {
      const borrowings = await TheoDoiMuonSach.find({ MaDocGia: 'DG9991' });
      const stillHasBorrowings =
        borrowings.some((b) => b.TrangThai === 'DangMuon') &&
        borrowings.some((b) => b.TrangThai === 'DaTra');

      if (stillHasBorrowings) {
        logPass('e5. Khóa độc giả không tự hủy phiếu mượn của họ (nhân viên xử lý phiếu riêng)');
      } else {
        logFail('e5. Giữ nguyên phiếu khi khóa', 'Phiếu mượn bị thay đổi trạng thái');
      }
    }

    // e6. Mở khóa: set HoatDong, SoLanSaiMatKhau = 0, xóa KhoaDen; đăng nhập lại được
    {
      // Giả lập tài khoản có SoLanSaiMatKhau = 3 và KhoaDen
      await DocGia.updateOne(
        { MaDocGia: 'DG9991' },
        {
          $set: {
            SoLanSaiMatKhau: 3,
            KhoaDen: new Date(Date.now() + 10 * 60 * 1000),
          },
        }
      );

      const resUnlock = await request(
        server,
        {
          path: '/api/admin/readers/DG9991/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          TrangThai: 'HoatDong',
          LyDo: 'Đã giải quyết xong vấn đề',
        }
      );

      const checkDb = await DocGia.findOne({ MaDocGia: 'DG9991' });

      // Đăng nhập lại
      const resLogin = await request(
        server,
        {
          path: '/api/user/auth/login',
          method: 'POST',
        },
        {
          Email: 'test_reader_an@example.com',
          Password: rawPassword,
        }
      );

      if (
        resUnlock.status === 200 &&
        checkDb.TrangThai === 'HoatDong' &&
        checkDb.SoLanSaiMatKhau === 0 &&
        checkDb.KhoaDen === null &&
        resLogin.status === 200 &&
        resLogin.body?.data?.accessToken
      ) {
        logPass('e6. Mở khóa thành công: SoLanSaiMatKhau=0, xóa KhoaDen, độc giả đăng nhập lại được');
      } else {
        logFail('e6. Mở khóa', `Status: unlock=${resUnlock.status}, login=${resLogin.status}`);
      }
    }

    // =========================================================================
    // f. KIỂM THỬ XÓA ĐỘC GIẢ (DELETE)
    // =========================================================================
    console.log('\n--- f. Kiểm thử Xóa độc giả (DELETE) ---');

    // f1. Độc giả đã có phiếu mượn (DG9993 có 1 phiếu DaTra) -> 409 HAS_BORROWINGS
    {
      const resDelete = await request(server, {
        path: '/api/admin/readers/DG9993',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resDelete.status === 409 && resDelete.body?.error?.code === 'HAS_BORROWINGS') {
        logPass('f1. Xóa độc giả có lịch sử mượn bị chặn 409 HAS_BORROWINGS');
      } else {
        logFail('f1. Chặn xóa độc giả có phiếu mượn', `Status: ${resDelete.status}`);
      }
    }

    // f2. Độc giả chưa từng mượn (DG9992) -> xóa thành công và RefreshToken bị dọn
    {
      const resDelete = await request(server, {
        path: '/api/admin/readers/DG9992',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const checkDb = await DocGia.findOne({ MaDocGia: 'DG9992' });
      const checkRt = await RefreshToken.find({ ChuSoHuu: 'DG9992' });

      if (resDelete.status === 200 && !checkDb && checkRt.length === 0) {
        logPass('f2. Xóa độc giả chưa từng mượn thành công và dọn sạch RefreshToken');
      } else {
        logFail('f2. Xóa độc giả hợp lệ', `Status: ${resDelete.status}`);
      }
    }

    // =========================================================================
    // g. KIỂM THỬ NHẬT KÝ HOẠT ĐỘNG (AUDIT LOGS)
    // =========================================================================
    console.log('\n--- g. Kiểm thử nhật ký hoạt động ---');

    {
      const logs = await NhatKy.find({
        MSNV: { $in: ['NV991', 'NV992'] },
      }).sort({ createdAt: 1 });

      const hasSua = logs.some(
        (l) =>
          l.HanhDong === 'SUA_DOC_GIA' &&
          l.DoiTuong === 'DocGia' &&
          Array.isArray(l.ChiTiet?.cacTruongThayDoi)
      );
      const hasKhoa = logs.some(
        (l) =>
          l.HanhDong === 'KHOA_DOC_GIA' &&
          l.DoiTuong === 'DocGia' &&
          typeof l.ChiTiet?.LyDo === 'string'
      );
      const hasMoKhoa = logs.some(
        (l) =>
          l.HanhDong === 'MO_KHOA_DOC_GIA' &&
          l.DoiTuong === 'DocGia' &&
          typeof l.ChiTiet?.LyDo === 'string'
      );
      const hasXoa = logs.some(
        (l) =>
          l.HanhDong === 'XOA_DOC_GIA' &&
          l.DoiTuong === 'DocGia' &&
          l.ChiTiet?.MaDocGia === 'DG9992'
      );

      // Đảm bảo không có trường nhạy cảm trong ChiTiet
      const safeDetails = logs.every((l) => {
        const ctStr = JSON.stringify(l.ChiTiet || {});
        return (
          !ctStr.includes('Password') &&
          !ctStr.includes('MatKhau') &&
          !ctStr.includes('token')
        );
      });

      if (hasSua && hasKhoa && hasMoKhoa && hasXoa && safeDetails) {
        logPass('g. Toàn bộ thao tác ghi NhatKy đúng MSNV, ChiTiet an toàn không chứa dữ liệu cá nhân nhạy cảm');
      } else {
        logFail('g. Nhật ký hoạt động', `Logs: ${logs.length}`);
      }
    }
  } catch (err) {
    console.error('LỖI KHÔNG MONG MUỐN TRONG KIỂM THỬ:', err);
    failedCount++;
  } finally {
    console.log('\n--- Dọn dẹp dữ liệu thử nghiệm ---');
    await cleanup();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();

    console.log(`\nKẾT QUẢ: ${passedCount} PASS, ${failedCount} FAIL.`);
    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
};

run();
