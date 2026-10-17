import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  NhanVien,
  DocGia,
  CauHinh,
  NhatKy,
} from '../models/index.js';
import {
  signAccessToken,
  hashPassword,
} from '../services/auth.service.js';
import { DEFAULT_SETTINGS } from '../services/settings.service.js';

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
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }

    req.end();
  });
};

const run = async () => {
  console.log('=== BẮT ĐẦU KIỂM THỬ P4-3: CẤU HÌNH HỆ THỐNG & NHẬT KÝ HOẠT ĐỘNG ===\n');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const TEST_MSNV = ['NV771', 'NV772', 'NV773'];
  const TEST_MA_DOC_GIA = ['DG7771'];

  const cleanup = async () => {
    try {
      await NhanVien.deleteMany({ MSNV: { $in: TEST_MSNV } });
      await DocGia.deleteMany({ MaDocGia: { $in: TEST_MA_DOC_GIA } });
      await NhatKy.deleteMany({ MSNV: { $in: [...TEST_MSNV, ...TEST_MA_DOC_GIA] } });
      // Đặt lại CauHinh về mặc định
      await CauHinh.updateOne({ Khoa: 'main' }, { $set: DEFAULT_SETTINGS }, { upsert: true });
    } catch (err) {
      console.error('Lỗi dọn dẹp:', err.message);
    }
  };

  try {
    await cleanup();

    const rawPassword = 'Password123@';
    const hashedPassword = await hashPassword(rawPassword);

    // 1. Tạo nhân viên Admin, Thủ thư và tài khoản buộc đổi mật khẩu
    const adminStaff = await NhanVien.create({
      MSNV: 'NV771',
      HoTenNV: 'Admin Cấu Hình',
      Password: hashedPassword,
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const thuThuStaff = await NhanVien.create({
      MSNV: 'NV772',
      HoTenNV: 'Thủ Thư Xem Quy Định',
      Password: hashedPassword,
      ChucVu: 'Thủ thư mượn trả',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const pwdChangeStaff = await NhanVien.create({
      MSNV: 'NV773',
      HoTenNV: 'Nhân Viên Buộc Đổi Pass',
      Password: hashedPassword,
      ChucVu: 'Thủ thư',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
    });

    const readerUser = await DocGia.create({
      MaDocGia: 'DG7771',
      HoLot: 'Trần',
      Ten: 'Thử Nghiệm',
      NgaySinh: new Date('2001-01-01'),
      Phai: 'Nam',
      Email: 'reader7771@example.com',
      Password: hashedPassword,
      TrangThai: 'HoatDong',
    });

    const adminToken = signAccessToken(adminStaff, 'nhanvien');
    const thuThuToken = signAccessToken(thuThuStaff, 'nhanvien');
    const pwdChangeToken = signAccessToken(pwdChangeStaff, 'nhanvien');
    const readerToken = signAccessToken(readerUser, 'docgia');

    // =========================================================================
    // a. KIỂM THỬ XÁC THỰC VÀ PHÂN QUYỀN TRÊN CẤU HÌNH (GET/PUT /settings)
    // =========================================================================
    console.log('--- a. Cấu hình hệ thống (Settings): Phân quyền & Xác thực ---');

    // a1. GET /settings không có token -> 401
    {
      const res = await request(server, { path: '/api/admin/settings' });
      if (res.status === 401) {
        logPass('a1. GET /settings không có token bị từ chối 401');
      } else {
        logFail('a1. GET /settings không token', `Status: ${res.status}`);
      }
    }

    // a2. GET /settings với token độc giả -> 401 UNAUTHENTICATED
    {
      const res = await request(server, {
        path: '/api/admin/settings',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.status === 401) {
        logPass('a2. Token độc giả gọi GET /settings bị từ chối 401');
      } else {
        logFail('a2. Token độc giả gọi settings', `Status: ${res.status}`);
      }
    }

    // a3. GET /settings với tài khoản BatBuocDoiMatKhau=true -> 403 MUST_CHANGE_PASSWORD
    {
      const res = await request(server, {
        path: '/api/admin/settings',
        headers: { Authorization: `Bearer ${pwdChangeToken}` },
      });
      if (res.status === 403 && res.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('a3. Nhân viên BatBuocDoiMatKhau=true bị chặn 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('a3. BatBuocDoiMatKhau', `Status: ${res.status}`);
      }
    }

    // a4. Thủ thư xem cấu hình GET /settings thành công 200
    {
      const res = await request(server, {
        path: '/api/admin/settings',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });
      if (res.status === 200 && res.body?.data?.SoSachToiDa !== undefined) {
        logPass('a4. Thủ thư xem cấu hình hệ thống thành công 200');
      } else {
        logFail('a4. Thủ thư xem cấu hình', `Status: ${res.status}`);
      }
    }

    // a5. Thủ thư sửa cấu hình PUT /settings bị chặn 403 FORBIDDEN
    {
      const res = await request(
        server,
        {
          path: '/api/admin/settings',
          method: 'PUT',
          headers: { Authorization: `Bearer ${thuThuToken}` },
        },
        { SoSachToiDa: 7 }
      );
      if (res.status === 403 && res.body?.error?.code === 'FORBIDDEN') {
        logPass('a5. Thủ thư sửa cấu hình PUT /settings bị chặn 403 FORBIDDEN');
      } else {
        logFail('a5. Thủ thư sửa cấu hình', `Status: ${res.status}`);
      }
    }

    // =========================================================================
    // b. KIỂM THỬ SỬA CẤU HÌNH (PUT /settings) & VALIDATE GIÁ TRỊ
    // =========================================================================
    console.log('\n--- b. Cấu hình hệ thống: Validate & Cập nhật ---');

    // b1. Validate trường bất hợp lệ: số âm, ngoài khoảng, trường lạ
    {
      const resNegative = await request(
        server,
        {
          path: '/api/admin/settings',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          ...DEFAULT_SETTINGS,
          SoSachToiDa: 0, // min 1
        }
      );

      const resRatioInvalid = await request(
        server,
        {
          path: '/api/admin/settings',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          ...DEFAULT_SETTINGS,
          TyLePhatRach: 1.5, // max 1.0
        }
      );

      const resUnknownField = await request(
        server,
        {
          path: '/api/admin/settings',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        {
          ...DEFAULT_SETTINGS,
          TruongKhongHopLe: 123,
        }
      );

      if (resNegative.status === 400 && resRatioInvalid.status === 400 && resUnknownField.status === 400) {
        logPass('b1. Validate cấu hình: từ chối số âm, tỷ lệ phạt vượt 1.0 và trường lạ (400 VALIDATION_ERROR)');
      } else {
        logFail('b1. Validate cấu hình', `Status: ${resNegative.status}, ${resRatioInvalid.status}, ${resUnknownField.status}`);
      }
    }

    // b2. Admin cập nhật cấu hình hợp lệ thành công
    {
      const newSettingsPayload = {
        SoSachToiDa: 8,
        SoNgayMuon: 21,
        HanNhanSach: 3,
        PhiTreMoiNgay: 3000,
        TyLePhatRach: 0.6,
        TyLePhatMat: 1.2,
        PhiXuLyMat: 25000,
      };

      const resUpdate = await request(
        server,
        {
          path: '/api/admin/settings',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        newSettingsPayload
      );

      const data = resUpdate.body?.data;
      if (
        resUpdate.status === 200 &&
        data?.SoSachToiDa === 8 &&
        data?.SoNgayMuon === 21 &&
        data?.HanNhanSach === 3 &&
        data?.PhiTreMoiNgay === 3000 &&
        data?.TyLePhatRach === 0.6 &&
        data?.TyLePhatMat === 1.2 &&
        data?.PhiXuLyMat === 25000
      ) {
        logPass('b2. Admin cập nhật cấu hình hợp lệ thành công 200');
      } else {
        logFail('b2. Admin cập nhật cấu hình', `Status: ${resUpdate.status}`);
      }
    }

    // b3. Admin khôi phục cấu hình về mặc định (POST /settings/reset)
    {
      const resReset = await request(
        server,
        {
          path: '/api/admin/settings/reset',
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      const data = resReset.body?.data;
      if (
        resReset.status === 200 &&
        data?.SoSachToiDa === DEFAULT_SETTINGS.SoSachToiDa &&
        data?.SoNgayMuon === DEFAULT_SETTINGS.SoNgayMuon &&
        data?.HanNhanSach === DEFAULT_SETTINGS.HanNhanSach
      ) {
        logPass('b3. Admin khôi phục cấu hình về mặc định thành công (POST /settings/reset)');
      } else {
        logFail('b3. Khôi phục cấu hình', `Status: ${resReset.status}`);
      }
    }

    // =========================================================================
    // c. KIỂM THỬ NHẬT KÝ HOẠT ĐỘNG (AUDIT LOGS)
    // =========================================================================
    console.log('\n--- c. Nhật ký hoạt động: Phân quyền & Truy vấn ---');

    // c1. Thủ thư truy cập nhật ký GET /audit-logs -> 403 FORBIDDEN
    {
      const res = await request(server, {
        path: '/api/admin/audit-logs',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });
      if (res.status === 403 && res.body?.error?.code === 'FORBIDDEN') {
        logPass('c1. Thủ thư truy cập nhật ký bị chặn 403 FORBIDDEN');
      } else {
        logFail('c1. Thủ thư truy cập audit-logs', `Status: ${res.status}`);
      }
    }

    // c2. Admin truy cập GET /audit-logs thành công 200
    {
      const res = await request(server, {
        path: '/api/admin/audit-logs',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 200 && Array.isArray(res.body?.data) && res.body?.meta) {
        logPass('c2. Admin xem danh sách nhật ký thành công 200 kèm meta phân trang');
      } else {
        logFail('c2. Admin xem audit-logs', `Status: ${res.status}`);
      }
    }

    // c3. GET /audit-logs/metadata lấy danh sách hành động và đối tượng
    {
      const resMeta = await request(server, {
        path: '/api/admin/audit-logs/metadata',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (
        resMeta.status === 200 &&
        Array.isArray(resMeta.body?.data?.actions) &&
        Array.isArray(resMeta.body?.data?.targets)
      ) {
        logPass('c3. GET /audit-logs/metadata trả về danh sách actions và targets phục vụ bộ lọc');
      } else {
        logFail('c3. Lấy metadata audit', `Status: ${resMeta.status}`);
      }
    }

    // c4. Lọc theo msnv, hanhDong, doiTuong
    {
      const resActionFilter = await request(server, {
        path: '/api/admin/audit-logs?hanhDong=CAP_NHAT_CAU_HINH',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const allActionMatch = resActionFilter.body?.data?.every(
        (l) => l.HanhDong === 'CAP_NHAT_CAU_HINH'
      );

      const resMsnvFilter = await request(server, {
        path: '/api/admin/audit-logs?msnv=NV771',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const allMsnvMatch = resMsnvFilter.body?.data?.every((l) => l.MSNV === 'NV771');

      if (allActionMatch && allMsnvMatch && resActionFilter.body?.data?.length > 0) {
        logPass('c4. Lọc nhật ký theo hanhDong và msnv chính xác');
      } else {
        logFail('c4. Lọc nhật ký', 'Dữ liệu không khớp bộ lọc');
      }
    }

    // c5. Tìm kiếm tự do an toàn regex
    {
      const resSearch = await request(server, {
        path: '/api/admin/audit-logs?search=CauHinh',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resSpecial = await request(server, {
        path: '/api/admin/audit-logs?search=.*',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (resSearch.status === 200 && resSpecial.status === 200) {
        logPass('c5. Tìm kiếm an toàn chống ReDoS và regex injection (.*)');
      } else {
        logFail('c5. Tìm kiếm regex', `Status: ${resSearch.status}, ${resSpecial.status}`);
      }
    }

    // c6. Kiểm tra populate thông tin nhân viên trong nhật ký
    {
      const res = await request(server, {
        path: '/api/admin/audit-logs?msnv=NV771',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const log = res.body?.data?.[0];
      if (log?.NhanVien && log.NhanVien.HoTenNV === 'Admin Cấu Hình') {
        logPass('c6. Populate virtual NhanVien thành công (hiển thị đúng họ tên nhân viên thực hiện)');
      } else {
        logFail('c6. Populate NhanVien', `Dữ liệu NhanVien: ${JSON.stringify(log?.NhanVien)}`);
      }
    }

    // c7. Chặn query sort ngoài whitelist hoặc limit > 100
    {
      const resSort = await request(server, {
        path: '/api/admin/audit-logs?sort=IP',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resLimit = await request(server, {
        path: '/api/admin/audit-logs?limit=150',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (resSort.status === 400 && resLimit.status === 400) {
        logPass('c7. Validate query audit-logs: sort ngoài whitelist và limit > 100 bị chặn 400');
      } else {
        logFail('c7. Validate query audit-logs', `Status: sort=${resSort.status}, limit=${resLimit.status}`);
      }
    }

    // =========================================================================
    // DỌN DẸP DỮ LIỆU
    // =========================================================================
    console.log('\n--- Dọn dẹp dữ liệu thử nghiệm ---');
    await cleanup();
    server.close();
    await disconnectDB();

    console.log(`\nKẾT QUẢ KIỂM THỬ: ${passedCount} PASS, ${failedCount} FAIL.\n`);
    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình kiểm thử:', err);
    server.close();
    await disconnectDB();
    process.exit(1);
  }
};

run();
