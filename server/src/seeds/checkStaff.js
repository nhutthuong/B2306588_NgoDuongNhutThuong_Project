import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  NhanVien,
  DocGia,
  Sach,
  NhaXuatBan,
  TheoDoiMuonSach,
  RefreshToken,
  NhatKy,
} from '../models/index.js';
import {
  signAccessToken,
  hashPassword,
  issueRefreshToken,
} from '../services/auth.service.js';
import {
  changeStaffRole,
  updateStaffStatus,
  deleteStaff,
} from '../services/staff.service.js';

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
  console.log('=== BẮT ĐẦU KIỂM THỬ P4-2: QUẢN LÝ NHÂN VIÊN & PHÂN QUYỀN (ADMIN API) ===\n');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const TEST_MSNV = ['NV881', 'NV882', 'NV883', 'NV884', 'NV885', 'NV886'];
  const TEST_MA_DOC_GIA = ['DG8881'];
  const TEST_MA_SACH = ['S8881'];

  const cleanup = async () => {
    try {
      await NhanVien.deleteMany({
        $or: [
          { MSNV: { $in: TEST_MSNV } },
          { HoTenNV: /^TEST_/ },
        ],
      });
      await DocGia.deleteMany({ MaDocGia: { $in: TEST_MA_DOC_GIA } });
      await Sach.deleteMany({ MaSach: { $in: TEST_MA_SACH } });
      await TheoDoiMuonSach.deleteMany({ MaDocGia: { $in: TEST_MA_DOC_GIA } });
      await RefreshToken.deleteMany({ ChuSoHuu: { $in: [...TEST_MSNV, ...TEST_MA_DOC_GIA] } });
      await NhatKy.deleteMany({ MSNV: { $in: TEST_MSNV } });
    } catch (err) {
      console.error('Lỗi dọn dẹp dữ liệu thử:', err.message);
    }
  };

  try {
    await cleanup();

    const rawPassword = 'Password123@';
    const hashedPassword = await hashPassword(rawPassword);

    // 1. Tạo dữ liệu mẫu
    // Admin 1 (chính đang gọi API)
    const admin1 = await NhanVien.create({
      MSNV: 'NV881',
      HoTenNV: 'Admin Thử Nghiệm 1',
      Password: hashedPassword,
      ChucVu: 'Quản trị hệ thống',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
      SoDienThoai: '0912345881',
    });

    // Admin 2 (để test đổi vai trò, xóa mà không vi phạm quy tắc ≥ 1 admin)
    const admin2 = await NhanVien.create({
      MSNV: 'NV882',
      HoTenNV: 'Admin Thử Nghiệm 2',
      Password: hashedPassword,
      ChucVu: 'Phó quản trị',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
      SoDienThoai: '0912345882',
    });

    // Thủ thư 1 (bình thường)
    const thuThu1 = await NhanVien.create({
      MSNV: 'NV883',
      HoTenNV: 'Thủ Thư Thử Nghiệm 1',
      Password: hashedPassword,
      ChucVu: 'Thủ thư mượn trả',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
      SoDienThoai: '0912345883',
    });

    // Thủ thư 2 (đang bị khóa)
    const thuThuLocked = await NhanVien.create({
      MSNV: 'NV884',
      HoTenNV: 'Thủ Thư Đang Bị Khóa',
      Password: hashedPassword,
      ChucVu: 'Thủ thư lưu kho',
      VaiTro: 'thuthu',
      TrangThai: 'BiKhoa',
      BatBuocDoiMatKhau: false,
      SoDienThoai: '0912345884',
    });

    // Nhân viên đang buộc đổi mật khẩu
    const staffMustChangePwd = await NhanVien.create({
      MSNV: 'NV885',
      HoTenNV: 'Nhân Viên Buộc Đổi Pass',
      Password: hashedPassword,
      ChucVu: 'Thủ thư',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
      SoDienThoai: '0912345885',
    });

    // Độc giả mẫu
    const testReader = await DocGia.create({
      MaDocGia: 'DG8881',
      HoLot: 'Độc Giả',
      Ten: 'Thử Nghiệm',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nam',
      Email: 'reader8881@example.com',
      Password: hashedPassword,
      TrangThai: 'HoatDong',
      DienThoai: '0912345889',
    });

    // Tạo 1 phiếu mượn có MSNVDuyet = NV883 để test chặn xóa nhân viên đã xử lý phiếu mượn
    await TheoDoiMuonSach.create({
      MaDocGia: 'DG8881',
      MaSach: 'S0001',
      TrangThai: 'ChoDuyet',
      MSNVDuyet: 'NV883',
    });

    // Tokens
    const admin1Token = signAccessToken(admin1, 'nhanvien');
    const admin2Token = signAccessToken(admin2, 'nhanvien');
    const thuThuToken = signAccessToken(thuThu1, 'nhanvien');
    const pwdChangeToken = signAccessToken(staffMustChangePwd, 'nhanvien');
    const readerToken = signAccessToken(testReader, 'docgia');

    // =========================================================================
    // a. KIỂM THỬ XÁC THỰC VÀ PHÂN QUYỀN
    // =========================================================================
    console.log('--- a. Phân quyền và xác thực ---');

    // a1. Không token -> 401
    {
      const res = await request(server, { path: '/api/admin/staff' });
      if (res.status === 401 && res.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('a1. GET /staff không có token bị từ chối 401');
      } else {
        logFail('a1. GET /staff không có token', `Status: ${res.status}`);
      }
    }

    // a2. Token độc giả gọi API staff -> 401 UNAUTHENTICATED
    {
      const res = await request(server, {
        path: '/api/admin/staff',
        headers: { Authorization: `Bearer ${readerToken}` },
      });
      if (res.status === 401) {
        logPass('a2. Token độc giả gọi API admin staff bị từ chối 401');
      } else {
        logFail('a2. Token độc giả', `Status: ${res.status}`);
      }
    }

    // a3. Token thủ thư gọi API staff -> 403 FORBIDDEN
    {
      const res = await request(server, {
        path: '/api/admin/staff',
        headers: { Authorization: `Bearer ${thuThuToken}` },
      });
      if (res.status === 403 && res.body?.error?.code === 'FORBIDDEN') {
        logPass('a3. Thủ thư gọi API staff bị chặn 403 FORBIDDEN');
      } else {
        logFail('a3. Thủ thư truy cập staff', `Status: ${res.status}`);
      }
    }

    // a4. Tài khoản đang buộc đổi mật khẩu -> 403 MUST_CHANGE_PASSWORD
    {
      const res = await request(server, {
        path: '/api/admin/staff',
        headers: { Authorization: `Bearer ${pwdChangeToken}` },
      });
      if (res.status === 403 && res.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('a4. Nhân viên BatBuocDoiMatKhau=true bị chặn 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('a4. BatBuocDoiMatKhau', `Status: ${res.status}`);
      }
    }

    // a5. Admin gọi thành công 200
    {
      const res = await request(server, {
        path: '/api/admin/staff',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      if (res.status === 200 && res.body?.success) {
        logPass('a5. Admin xem danh sách nhân viên thành công 200');
      } else {
        logFail('a5. Admin xem danh sách', `Status: ${res.status}`);
      }
    }

    // =========================================================================
    // b. KIỂM THỬ TÌM KIẾM, LỌC VÀ PHÂN TRANG DANH SÁCH
    // =========================================================================
    console.log('\n--- b. Tìm kiếm, lọc và phân trang danh sách ---');

    // b1. Tìm kiếm theo MSNV, họ tên, chức vụ, số điện thoại
    {
      const resMsnv = await request(server, {
        path: '/api/admin/staff?search=NV881',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resHoTen = await request(server, {
        path: '/api/admin/staff?search=Admin Thử Nghiệm',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resChucVu = await request(server, {
        path: '/api/admin/staff?search=Quản trị hệ thống',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resPhone = await request(server, {
        path: '/api/admin/staff?search=0912345881',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      const foundMsnv = resMsnv.body?.data?.some((s) => s.MSNV === 'NV881');
      const foundHoTen = resHoTen.body?.data?.some((s) => s.MSNV === 'NV881');
      const foundChucVu = resChucVu.body?.data?.some((s) => s.MSNV === 'NV881');
      const foundPhone = resPhone.body?.data?.some((s) => s.MSNV === 'NV881');

      if (foundMsnv && foundHoTen && foundChucVu && foundPhone) {
        logPass('b1. Tìm kiếm theo MSNV, họ tên, chức vụ, số điện thoại thành công');
      } else {
        logFail('b1. Tìm kiếm nhân viên', 'Một trong các tiêu chí tìm kiếm không khớp');
      }
    }

    // b2. Ký tự regex đặc biệt và NoSQL injection
    {
      const resSpecial = await request(server, {
        path: '/api/admin/staff?search=.*',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resNoSql = await request(server, {
        path: '/api/admin/staff?search%5B$ne%5D=x',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      if (resSpecial.status === 200 && (resNoSql.status === 200 || resNoSql.status === 400)) {
        logPass('b2. Ký tự regex đặc biệt ".*" và search[$ne]=x an toàn không gây 500');
      } else {
        logFail('b2. An toàn injection', `Status: 1=${resSpecial.status}, 2=${resNoSql.status}`);
      }
    }

    // b3. Lọc theo vai trò và trạng thái
    {
      const resRole = await request(server, {
        path: '/api/admin/staff?vaiTro=thuthu',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resStatus = await request(server, {
        path: '/api/admin/staff?trangThai=BiKhoa',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      const allThuthu = resRole.body?.data?.every((s) => s.VaiTro === 'thuthu');
      const allLocked = resStatus.body?.data?.every((s) => s.TrangThai === 'BiKhoa');

      if (allThuthu && allLocked) {
        logPass('b3. Lọc theo vai trò (thuthu) và trạng thái (BiKhoa) chính xác');
      } else {
        logFail('b3. Lọc vai trò & trạng thái', 'Dữ liệu trả về không khớp bộ lọc');
      }
    }

    // b4. Sort ngoài whitelist và limit > 100 bị chặn 400
    {
      const resSort = await request(server, {
        path: '/api/admin/staff?sort=Password',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resLimit = await request(server, {
        path: '/api/admin/staff?limit=150',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      if (resSort.status === 400 && resLimit.status === 400) {
        logPass('b4. Sort ngoài whitelist và limit > 100 bị chặn 400 VALIDATION_ERROR');
      } else {
        logFail('b4. Validate query', `Status: sort=${resSort.status}, limit=${resLimit.status}`);
      }
    }

    // =========================================================================
    // c. KIỂM THỬ TẠO MỚI NHÂN VIÊN (POST /api/admin/staff)
    // =========================================================================
    console.log('\n--- c. Tạo mới nhân viên (POST) ---');

    let createdStaffMsnv = '';

    // c1. Mật khẩu yếu bị từ chối 400
    {
      const resWeak = await request(
        server,
        {
          path: '/api/admin/staff',
          method: 'POST',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        {
          HoTenNV: 'TEST_Nhân Viên Mới',
          VaiTro: 'thuthu',
          Password: 'weak', // thiếu chữ hoa, số, độ dài < 8
        }
      );
      if (resWeak.status === 400) {
        logPass('c1. Mật khẩu yếu bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('c1. Mật khẩu yếu', `Status: ${resWeak.status}`);
      }
    }

    // c2. Tạo nhân viên thành công: tự sinh MSNV, BatBuocDoiMatKhau=true, không lộ Password
    {
      const resCreate = await request(
        server,
        {
          path: '/api/admin/staff',
          method: 'POST',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        {
          HoTenNV: 'TEST_Nguyễn Văn Thủ Thư Mới',
          ChucVu: 'Thủ thư số hóa',
          VaiTro: 'thuthu',
          DiaChi: 'Hà Nội',
          SoDienThoai: '0988776655',
          Password: 'Password123@',
        }
      );

      const staff = resCreate.body?.data;
      createdStaffMsnv = staff?.MSNV;

      if (
        resCreate.status === 201 &&
        staff &&
        staff.MSNV &&
        staff.MSNV.startsWith('NV') &&
        staff.BatBuocDoiMatKhau === true &&
        staff.TrangThai === 'HoatDong' &&
        staff.Password === undefined
      ) {
        logPass(`c2. Tạo nhân viên thành công 201 (MSNV: ${staff.MSNV}, BatBuocDoiMatKhau=true, không lộ hash)`);
      } else {
        logFail('c2. Tạo nhân viên', `Status: ${resCreate.status}`);
      }
    }

    // =========================================================================
    // d. KIỂM THỬ XEM CHI TIẾT VÀ SỬA THÔNG TIN
    // =========================================================================
    console.log('\n--- d. Chi tiết và sửa thông tin ---');

    // d1. Xem chi tiết nhân viên
    {
      const resDetail = await request(server, {
        path: `/api/admin/staff/${createdStaffMsnv}`,
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const data = resDetail.body?.data;

      if (resDetail.status === 200 && data?.MSNV === createdStaffMsnv && data.Password === undefined) {
        logPass('d1. Xem chi tiết nhân viên thành công 200, an toàn không lộ Password');
      } else {
        logFail('d1. Xem chi tiết', `Status: ${resDetail.status}`);
      }
    }

    // d2. Mã sai định dạng -> 400, không tồn tại -> 404
    {
      const resBad = await request(server, {
        path: '/api/admin/staff/INVALID_MSNV',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      const resNotFound = await request(server, {
        path: '/api/admin/staff/NV999',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      if (resBad.status === 400 && resNotFound.status === 404) {
        logPass('d2. Mã sai định dạng trả 400, mã không tồn tại trả 404');
      } else {
        logFail('d2. Validate MSNV', `Bad: ${resBad.status}, NotFound: ${resNotFound.status}`);
      }
    }

    // d3. Sửa thông tin: gửi trường cấm (MSNV, Password, VaiTro, TrangThai) bị chặn 400
    {
      const resForbid = await request(
        server,
        {
          path: `/api/admin/staff/${createdStaffMsnv}`,
          method: 'PUT',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { VaiTro: 'admin' }
      );
      if (resForbid.status === 400 && resForbid.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('d3. Sửa thông tin qua PUT: gửi VaiTro, Password, TrangThai bị chặn 400');
      } else {
        logFail('d3. Whitelist PUT', `Status: ${resForbid.status}`);
      }
    }

    // d4. Sửa thông tin hợp lệ thành công
    {
      const resUpdate = await request(
        server,
        {
          path: `/api/admin/staff/${createdStaffMsnv}`,
          method: 'PUT',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        {
          HoTenNV: 'TEST_Nguyễn Văn Đã Đổi Tên',
          ChucVu: 'Thủ thư trưởng quầy',
          DiaChi: 'Đà Nẵng',
        }
      );

      const checkDb = await NhanVien.findOne({ MSNV: createdStaffMsnv });
      if (
        resUpdate.status === 200 &&
        checkDb.HoTenNV === 'TEST_Nguyễn Văn Đã Đổi Tên' &&
        checkDb.ChucVu === 'Thủ thư trưởng quầy'
      ) {
        logPass('d4. Cập nhật thông tin nhân viên hợp lệ thành công');
      } else {
        logFail('d4. Cập nhật hợp lệ', `Status: ${resUpdate.status}`);
      }
    }

    // =========================================================================
    // e. KIỂM THỬ ĐỔI VAI TRÒ (PATCH /:msnv/role) & RÀNG BUỘC ≥ 1 ADMIN
    // =========================================================================
    console.log('\n--- e. Đổi vai trò và ràng buộc ≥ 1 admin ---');

    // e1. Tự đổi vai trò chính mình bị chặn 409 CANNOT_CHANGE_OWN_ROLE
    {
      const resSelf = await request(
        server,
        {
          path: '/api/admin/staff/NV881/role',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { VaiTro: 'thuthu' }
      );
      if (resSelf.status === 409 && resSelf.body?.error?.code === 'CANNOT_CHANGE_OWN_ROLE') {
        logPass('e1. Admin tự thay đổi vai trò chính mình bị chặn 409 CANNOT_CHANGE_OWN_ROLE');
      } else {
        logFail('e1. Tự đổi vai trò', `Status: ${resSelf.status}`);
      }
    }

    // e2. Đặt đúng vai trò hiện có -> 409 INVALID_STATE
    {
      const resSame = await request(
        server,
        {
          path: '/api/admin/staff/NV883/role',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { VaiTro: 'thuthu' }
      );
      if (resSame.status === 409 && resSame.body?.error?.code === 'INVALID_STATE') {
        logPass('e2. Đặt đúng vai trò hiện có trả 409 INVALID_STATE');
      } else {
        logFail('e2. Đổi trùng vai trò', `Status: ${resSame.status}`);
      }
    }

    // e3. Nâng quyền thủ thư lên admin thành công
    {
      const resPromote = await request(
        server,
        {
          path: '/api/admin/staff/NV883/role',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { VaiTro: 'admin' }
      );
      const checkDb = await NhanVien.findOne({ MSNV: 'NV883' });
      if (resPromote.status === 200 && checkDb.VaiTro === 'admin') {
        logPass('e3. Nâng quyền thủ thư lên admin thành công');
      } else {
        logFail('e3. Nâng quyền admin', `Status: ${resPromote.status}`);
      }
    }

    // e4. Ràng buộc: Không thể hạ quyền, khóa hoặc xóa nếu là admin đang hoạt động duy nhất
    {
      await NhanVien.create({
        MSNV: 'NV886',
        HoTenNV: 'Admin Duy Nhất Test',
        Password: hashedPassword,
        VaiTro: 'admin',
        TrangThai: 'HoatDong',
      });

      // Lưu danh sách tất cả các admin hiện có trong DB (bao gồm NV001 từ seed) để tạm thời đưa về thuthu
      const existingAdmins = await NhanVien.find({ MSNV: { $ne: 'NV886' }, VaiTro: 'admin' })
        .select('MSNV')
        .lean();
      const existingAdminMsnvs = existingAdmins.map((a) => a.MSNV);

      await NhanVien.updateMany(
        { MSNV: { $in: existingAdminMsnvs } },
        { $set: { VaiTro: 'thuthu' } }
      );

      let roleBlocked = false;
      try {
        await changeStaffRole('NV886', { VaiTro: 'thuthu' }, { msnv: 'SYSTEM_CALL' });
      } catch (err) {
        if ((err.statusCode === 409 || err.status === 409) && err.code === 'LAST_ADMIN') {
          roleBlocked = true;
        }
      }

      let lockBlocked = false;
      try {
        await updateStaffStatus('NV886', { TrangThai: 'BiKhoa' }, { msnv: 'SYSTEM_CALL' });
      } catch (err) {
        if ((err.statusCode === 409 || err.status === 409) && err.code === 'LAST_ADMIN') {
          lockBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await deleteStaff('NV886', { msnv: 'SYSTEM_CALL' });
      } catch (err) {
        if ((err.statusCode === 409 || err.status === 409) && err.code === 'LAST_ADMIN') {
          deleteBlocked = true;
        }
      }

      // Khôi phục lại toàn bộ các admin ban đầu
      await NhanVien.updateMany(
        { MSNV: { $in: existingAdminMsnvs } },
        { $set: { VaiTro: 'admin' } }
      );
      await NhanVien.updateOne({ MSNV: 'NV881' }, { $set: { VaiTro: 'admin', TrangThai: 'HoatDong' } });
      await NhanVien.updateOne({ MSNV: 'NV882' }, { $set: { VaiTro: 'admin', TrangThai: 'HoatDong' } });
      await NhanVien.deleteMany({ MSNV: 'NV886' });

      if (roleBlocked && lockBlocked && deleteBlocked) {
        logPass('e4. Ràng buộc >= 1 admin: hạ quyền, khóa hoặc xóa admin duy nhất bị chặn 409 LAST_ADMIN');
      } else {
        logFail('e4. Ràng buộc >= 1 admin', `role=${roleBlocked}, lock=${lockBlocked}, delete=${deleteBlocked}`);
      }
    }

    // =========================================================================
    // f. KIỂM THỬ KHÓA VÀ MỞ KHÓA TÀI KHOẢN (PATCH /status)
    // =========================================================================
    console.log('\n--- f. Khóa và mở khóa tài khoản nhân viên ---');

    // f1. Tự khóa tài khoản của chính mình bị chặn 409 CANNOT_LOCK_SELF
    {
      const resLockSelf = await request(
        server,
        {
          path: '/api/admin/staff/NV881/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { TrangThai: 'BiKhoa' }
      );
      if (resLockSelf.status === 409 && resLockSelf.body?.error?.code === 'CANNOT_LOCK_SELF') {
        logPass('f1. Admin tự khóa chính mình bị chặn 409 CANNOT_LOCK_SELF');
      } else {
        logFail('f1. Tự khóa chính mình', `Status: ${resLockSelf.status}`);
      }
    }

    // f2. Khóa tài khoản nhân viên: set BiKhoa và thu hồi RefreshToken
    {
      await issueRefreshToken('NV883', 'nhanvien');
      const resLock = await request(
        server,
        {
          path: '/api/admin/staff/NV883/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        {
          TrangThai: 'BiKhoa',
          LyDo: 'Tạm đình chỉ công tác',
        }
      );

      const checkDb = await NhanVien.findOne({ MSNV: 'NV883' });
      const activeRtCount = await RefreshToken.countDocuments({
        ChuSoHuu: 'NV883',
        LoaiTaiKhoan: 'nhanvien',
        ThuHoi: false,
      });

      if (resLock.status === 200 && checkDb.TrangThai === 'BiKhoa' && activeRtCount === 0) {
        logPass('f2. Khóa nhân viên thành công: TrangThai=BiKhoa và thu hồi toàn bộ RefreshToken');
      } else {
        logFail('f2. Khóa nhân viên', `Status: ${resLock.status}`);
      }
    }

    // f3. Mở khóa nhân viên: đặt lại SoLanSaiMatKhau = 0 và xóa KhoaDen
    {
      await NhanVien.updateOne(
        { MSNV: 'NV883' },
        { $set: { SoLanSaiMatKhau: 4, KhoaDen: new Date(Date.now() + 10 * 60 * 1000) } }
      );

      const resUnlock = await request(
        server,
        {
          path: '/api/admin/staff/NV883/status',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { TrangThai: 'HoatDong' }
      );

      const checkDb = await NhanVien.findOne({ MSNV: 'NV883' });
      if (
        resUnlock.status === 200 &&
        checkDb.TrangThai === 'HoatDong' &&
        checkDb.SoLanSaiMatKhau === 0 &&
        checkDb.KhoaDen === null
      ) {
        logPass('f3. Mở khóa thành công: TrangThai=HoatDong, SoLanSaiMatKhau=0, xóa KhoaDen');
      } else {
        logFail('f3. Mở khóa nhân viên', `Status: ${resUnlock.status}`);
      }
    }

    // =========================================================================
    // g. KIỂM THỬ ĐẶT LẠI MẬT KHẨU TẠM (PATCH /reset-password)
    // =========================================================================
    console.log('\n--- g. Đặt lại mật khẩu tạm mới ---');

    // g1. Mật khẩu yếu bị chặn 400
    {
      const resWeak = await request(
        server,
        {
          path: '/api/admin/staff/NV883/reset-password',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { Password: 'short' }
      );
      if (resWeak.status === 400) {
        logPass('g1. Mật khẩu yếu khi reset bị từ chối 400');
      } else {
        logFail('g1. Reset mật khẩu yếu', `Status: ${resWeak.status}`);
      }
    }

    // g2. Đặt lại mật khẩu hợp lệ: BatBuocDoiMatKhau = true, thu hồi refresh token, đăng nhập được bằng mật khẩu mới
    {
      await issueRefreshToken('NV883', 'nhanvien');

      const resReset = await request(
        server,
        {
          path: '/api/admin/staff/NV883/reset-password',
          method: 'PATCH',
          headers: { Authorization: `Bearer ${admin1Token}` },
        },
        { Password: 'NewTempPassword883@' }
      );

      const checkDb = await NhanVien.findOne({ MSNV: 'NV883' });
      const activeRtCount = await RefreshToken.countDocuments({
        ChuSoHuu: 'NV883',
        LoaiTaiKhoan: 'nhanvien',
        ThuHoi: false,
      });

      // Thử đăng nhập bằng mật khẩu mới
      const resLogin = await request(
        server,
        {
          path: '/api/admin/auth/login',
          method: 'POST',
        },
        {
          MSNV: 'NV883',
          Password: 'NewTempPassword883@',
        }
      );

      if (
        resReset.status === 200 &&
        checkDb.BatBuocDoiMatKhau === true &&
        activeRtCount === 0 &&
        resLogin.status === 200 &&
        resLogin.body?.data?.nhanVien?.BatBuocDoiMatKhau === true
      ) {
        logPass('g2. Đặt lại mật khẩu thành công: BatBuocDoiMatKhau=true, thu hồi token cũ, đăng nhập được bằng pass mới');
      } else {
        logFail('g2. Reset mật khẩu', `Reset: ${resReset.status}, Login: ${resLogin.status}`);
      }
    }

    // =========================================================================
    // h. KIỂM THỬ XÓA NHÂN VIÊN (DELETE /:msnv)
    // =========================================================================
    console.log('\n--- h. Xóa nhân viên (DELETE) ---');

    // h1. Tự xóa chính mình bị chặn 409 CANNOT_DELETE_SELF
    {
      const resDeleteSelf = await request(server, {
        path: '/api/admin/staff/NV881',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      if (resDeleteSelf.status === 409 && resDeleteSelf.body?.error?.code === 'CANNOT_DELETE_SELF') {
        logPass('h1. Admin tự xóa tài khoản của chính mình bị chặn 409 CANNOT_DELETE_SELF');
      } else {
        logFail('h1. Tự xóa chính mình', `Status: ${resDeleteSelf.status}`);
      }
    }

    // h2. Chặn xóa nhân viên đã có lịch sử xử lý phiếu mượn -> 409 HAS_BORROWING_ACTIONS
    {
      const resDeleteHasBorrowings = await request(server, {
        path: '/api/admin/staff/NV883',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });
      if (
        resDeleteHasBorrowings.status === 409 &&
        resDeleteHasBorrowings.body?.error?.code === 'HAS_BORROWING_ACTIONS'
      ) {
        logPass('h2. Chặn xóa nhân viên đã từng xử lý phiếu mượn (409 HAS_BORROWING_ACTIONS)');
      } else {
        logFail('h2. Chặn xóa NV có phiếu mượn', `Status: ${resDeleteHasBorrowings.status}`);
      }
    }

    // h3. Xóa nhân viên chưa từng xử lý phiếu mượn (createdStaffMsnv) -> thành công và dọn RefreshToken
    {
      await issueRefreshToken(createdStaffMsnv, 'nhanvien');

      const resDelete = await request(server, {
        path: `/api/admin/staff/${createdStaffMsnv}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${admin1Token}` },
      });

      const checkDb = await NhanVien.findOne({ MSNV: createdStaffMsnv });
      const checkRt = await RefreshToken.find({ ChuSoHuu: createdStaffMsnv });

      if (resDelete.status === 200 && !checkDb && checkRt.length === 0) {
        logPass('h3. Xóa nhân viên chưa từng xử lý phiếu mượn thành công và dọn sạch RefreshToken');
      } else {
        logFail('h3. Xóa nhân viên', `Status: ${resDelete.status}`);
      }
    }

    // =========================================================================
    // i. KIỂM THỬ NHẬT KÝ HOẠT ĐỘNG (AUDIT LOGS)
    // =========================================================================
    console.log('\n--- i. Nhật ký hoạt động (Audit logs) ---');

    {
      const logs = await NhatKy.find({
        MSNV: 'NV881',
      }).sort({ createdAt: 1 });

      const hasCreate = logs.some((l) => l.HanhDong === 'THEM_NHAN_VIEN');
      const hasUpdate = logs.some((l) => l.HanhDong === 'SUA_NHAN_VIEN');
      const hasRole = logs.some((l) => l.HanhDong === 'DOI_VAI_TRO');
      const hasLock = logs.some((l) => l.HanhDong === 'KHOA_NHAN_VIEN');
      const hasUnlock = logs.some((l) => l.HanhDong === 'MO_KHOA_NHAN_VIEN');
      const hasReset = logs.some((l) => l.HanhDong === 'RESET_MAT_KHAU_NV');
      const hasDelete = logs.some((l) => l.HanhDong === 'XOA_NHAN_VIEN');

      const allSafe = logs.every((l) => {
        const str = JSON.stringify(l.ChiTiet || {});
        return !str.includes('Password') && !str.includes('MatKhau') && !str.includes('token');
      });

      if (
        hasCreate &&
        hasUpdate &&
        hasRole &&
        hasLock &&
        hasUnlock &&
        hasReset &&
        hasDelete &&
        allSafe
      ) {
        logPass('i. Toàn bộ thao tác ghi NhatKy đầy đủ hành động, đúng MSNV và ChiTiet tuyệt đối an toàn');
      } else {
        logFail('i. Nhật ký hoạt động', `Logs count: ${logs.length}`);
      }
    }
  } catch (err) {
    console.error('LỖI NGOÀI DỰ KIẾN TRONG KIỂM THỬ:', err);
    failedCount++;
  } finally {
    console.log('\n--- Dọn dẹp dữ liệu thử nghiệm ---');
    await cleanup();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();

    console.log(`\nKẾT QUẢ KIỂM THỬ: ${passedCount} PASS, ${failedCount} FAIL.`);
    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
};

run();
