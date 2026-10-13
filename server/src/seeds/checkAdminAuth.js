import express from 'express';
import cookieParser from 'cookie-parser';
import { connectDB, disconnectDB } from '../config/db.js';
import env from '../config/env.js';
import { NhanVien, RefreshToken, NhatKy } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';
import adminAuthRouter from '../routes/admin/auth.routes.js';
import errorHandler from '../middlewares/errorHandler.js';

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

// Khởi tạo app test nhỏ chạy in-process với đúng cấu hình
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/auth', adminAuthRouter);
  app.use(errorHandler);
  return app;
};

// Helper gửi request in-memory tới app
const sendRequest = async (app, { method, path, headers = {}, body = null, cookies = {} }) => {
  return new Promise((resolve, reject) => {
    // Chuyển đổi cookie object sang cookie header
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const allHeaders = { ...headers };
    if (cookieHeader) {
      allHeaders.cookie = cookieHeader;
    }

    const reqMock = {
      method,
      url: path,
      headers: allHeaders,
      body: body || {},
      cookies: { ...cookies },
      ip: '127.0.0.1',
    };

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = null;
    const setCookies = [];

    const resMock = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(name, val) {
        responseHeaders[name.toLowerCase()] = val;
      },
      cookie(name, val, opts) {
        setCookies.push({ name, val, opts });
      },
      clearCookie(name, opts) {
        setCookies.push({ name, val: '', cleared: true, opts });
      },
      json(data) {
        responseBody = data;
        resolve({
          status: statusCode,
          body: responseBody,
          headers: responseHeaders,
          cookies: setCookies,
        });
      },
      send(data) {
        responseBody = data;
        resolve({
          status: statusCode,
          body: responseBody,
          headers: responseHeaders,
          cookies: setCookies,
        });
      },
      end() {
        resolve({
          status: statusCode,
          body: responseBody,
          headers: responseHeaders,
          cookies: setCookies,
        });
      },
    };

    app.handle(reqMock, resMock, (err) => {
      if (err) {
        errorHandler(err, reqMock, resMock, () => {
          resolve({
            status: statusCode,
            body: responseBody,
            headers: responseHeaders,
            cookies: setCookies,
          });
        });
      }
    });
  });
};

const cleanupTestData = async () => {
  await NhanVien.deleteMany({ MSNV: /^TEST_ADMIN_/ });
  await RefreshToken.deleteMany({ ChuSoHuu: /^TEST_ADMIN_/ });
  await NhatKy.deleteMany({ MSNV: /^TEST_ADMIN_/ });
};

const runTests = async () => {
  console.log('--- BẮT ĐẦU KIỂM TRA P1-2: ADMIN AUTH API ---');

  await connectDB();
  const app = createTestApp();

  try {
    await cleanupTestData();

    const passwordPlain = 'AdminTest@123456';
    const passwordHash = await hashPassword(passwordPlain);

    // 1. Tạo nhân viên Admin có BatBuocDoiMatKhau = true
    await NhanVien.create({
      MSNV: 'TEST_ADMIN_01',
      HoTenNV: 'Admin Thử Nghiệm',
      Password: passwordHash,
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: true,
    });

    // 2. Tạo nhân viên Thủ thư có BatBuocDoiMatKhau = false
    await NhanVien.create({
      MSNV: 'TEST_ADMIN_02',
      HoTenNV: 'Thủ Thư Thử Nghiệm',
      Password: passwordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    // ----------------------------------------------------
    // Test 1: Validate middleware từ chối trường lạ & trả tiếng Việt
    // ----------------------------------------------------
    try {
      const resUnknownField = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/login',
        body: {
          MSNV: 'TEST_ADMIN_01',
          Password: passwordPlain,
          truongLa: 'hacker_value',
        },
      });

      if (
        resUnknownField.status === 400 &&
        resUnknownField.body?.error?.code === 'VALIDATION_ERROR' &&
        Array.isArray(resUnknownField.body?.error?.details) &&
        resUnknownField.body.error.details.some((d) => d.field === 'truongLa')
      ) {
        logPass('Test 1', 'Validate từ chối trường lạ, trả 400 VALIDATION_ERROR kèm details tiếng Việt');
      } else {
        throw new Error(`Kỳ vọng 400 VALIDATION_ERROR, nhận: ${resUnknownField.status} ${JSON.stringify(resUnknownField.body)}`);
      }
    } catch (err) {
      logFail('Test 1', err);
    }

    // ----------------------------------------------------
    // Test 2: Đăng nhập sai trả 401 INVALID_CREDENTIALS
    // ----------------------------------------------------
    try {
      const resWrongPass = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/login',
        body: {
          MSNV: 'TEST_ADMIN_01',
          Password: 'WrongPassword@123',
        },
      });

      if (
        resWrongPass.status === 401 &&
        resWrongPass.body?.error?.code === 'INVALID_CREDENTIALS'
      ) {
        logPass('Test 2', 'Đăng nhập sai mật khẩu trả 401 INVALID_CREDENTIALS');
      } else {
        throw new Error(`Kỳ vọng 401 INVALID_CREDENTIALS, nhận: ${resWrongPass.status}`);
      }
    } catch (err) {
      logFail('Test 2', err);
    }

    // ----------------------------------------------------
    // Test 3: Đăng nhập thành công, trả token, cookie rt_admin, nhanVien
    // ----------------------------------------------------
    let adminToken = '';
    let adminRtCookie = '';

    try {
      const resLogin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/login',
        body: {
          MSNV: 'TEST_ADMIN_01',
          Password: passwordPlain,
        },
      });

      adminToken = resLogin.body?.data?.accessToken;
      const rtCookieObj = resLogin.cookies.find((c) => c.name === 'rt_admin');
      adminRtCookie = rtCookieObj?.val;

      const nvData = resLogin.body?.data?.nhanVien;

      if (
        resLogin.status === 200 &&
        adminToken &&
        adminRtCookie &&
        rtCookieObj.opts?.httpOnly === true &&
        rtCookieObj.opts?.path === '/api/admin/auth' &&
        nvData?.MSNV === 'TEST_ADMIN_01' &&
        nvData?.BatBuocDoiMatKhau === true &&
        !resLogin.body?.data?.Password &&
        !nvData?.Password
      ) {
        logPass('Test 3', 'Đăng nhập thành công trả accessToken, nhanVien sạch, set cookie httpOnly rt_admin');
      } else {
        throw new Error(`Dữ liệu đăng nhập không hợp lệ: ${JSON.stringify(resLogin.body)}`);
      }
    } catch (err) {
      logFail('Test 3', err);
    }

    // ----------------------------------------------------
    // Test 4: Khi BatBuocDoiMatKhau = true, chặn route thường (403 MUST_CHANGE_PASSWORD)
    // ----------------------------------------------------
    try {
      const resBlockedPing = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-admin',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      if (
        resBlockedPing.status === 403 &&
        resBlockedPing.body?.error?.code === 'MUST_CHANGE_PASSWORD'
      ) {
        logPass('Test 4', 'Tài khoản chưa đổi mật khẩu lần đầu bị chặn route thường với 403 MUST_CHANGE_PASSWORD');
      } else {
        throw new Error(`Kỳ vọng 403 MUST_CHANGE_PASSWORD, nhận: ${resBlockedPing.status} ${JSON.stringify(resBlockedPing.body)}`);
      }
    } catch (err) {
      logFail('Test 4', err);
    }

    // ----------------------------------------------------
    // Test 5: GET /me cho phép đi qua khi BatBuocDoiMatKhau = true
    // ----------------------------------------------------
    try {
      const resMe = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/me',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      if (
        resMe.status === 200 &&
        resMe.body?.data?.nhanVien?.MSNV === 'TEST_ADMIN_01' &&
        resMe.body?.data?.nhanVien?.BatBuocDoiMatKhau === true &&
        !resMe.body?.data?.nhanVien?.Password
      ) {
        logPass('Test 5', 'GET /me thành công khi đang chờ đổi mật khẩu, trả đầy đủ thông tin nhân viên');
      } else {
        throw new Error(`GET /me không thành công: ${resMe.status} ${JSON.stringify(resMe.body)}`);
      }
    } catch (err) {
      logFail('Test 5', err);
    }

    // ----------------------------------------------------
    // Test 6: Đổi mật khẩu: kiểm tra mật khẩu cũ sai, mật khẩu mới trùng cũ, mật khẩu mới yếu
    // ----------------------------------------------------
    try {
      // 6.1 Mật khẩu cũ sai
      const resWrongOld = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/admin/auth/change-password',
        headers: { authorization: `Bearer ${adminToken}` },
        body: { MatKhauCu: 'WrongOldPass@123', MatKhauMoi: 'NewAdmin@987654' },
      });

      // 6.2 Mật khẩu mới trùng mật khẩu cũ
      const resSamePass = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/admin/auth/change-password',
        headers: { authorization: `Bearer ${adminToken}` },
        body: { MatKhauCu: passwordPlain, MatKhauMoi: passwordPlain },
      });

      // 6.3 Mật khẩu mới quá yếu
      const resWeakPass = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/admin/auth/change-password',
        headers: { authorization: `Bearer ${adminToken}` },
        body: { MatKhauCu: passwordPlain, MatKhauMoi: 'weak' },
      });

      if (
        resWrongOld.status === 401 &&
        resWrongOld.body?.error?.code === 'INVALID_CREDENTIALS' &&
        resSamePass.status === 400 &&
        resSamePass.body?.error?.code === 'VALIDATION_ERROR' &&
        resWeakPass.status === 400 &&
        resWeakPass.body?.error?.code === 'VALIDATION_ERROR'
      ) {
        logPass('Test 6', 'Đổi mật khẩu kiểm tra chính xác: mật khẩu cũ sai (401), trùng mật khẩu cũ (400), mật khẩu mới yếu (400)');
      } else {
        throw new Error('Kiểm tra điều kiện đổi mật khẩu không đúng');
      }
    } catch (err) {
      logFail('Test 6', err);
    }

    // ----------------------------------------------------
    // Test 7: Đổi mật khẩu thành công: cấp phiên mới, cập nhật BatBuocDoiMatKhau = false, ghi NhatKy
    // ----------------------------------------------------
    const newPasswordPlain = 'NewAdmin@Pass2026';
    let newAdminToken = '';
    let newAdminRtCookie = '';

    try {
      const resChangeOk = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/admin/auth/change-password',
        headers: { authorization: `Bearer ${adminToken}` },
        body: { MatKhauCu: passwordPlain, MatKhauMoi: newPasswordPlain },
      });

      newAdminToken = resChangeOk.body?.data?.accessToken;
      const newRtCookieObj = resChangeOk.cookies.find((c) => c.name === 'rt_admin');
      newAdminRtCookie = newRtCookieObj?.val;

      // Kiểm tra DB
      const updatedAdmin = await NhanVien.findOne({ MSNV: 'TEST_ADMIN_01' });
      const auditLog = await NhatKy.findOne({
        MSNV: 'TEST_ADMIN_01',
        HanhDong: 'DOI_MAT_KHAU',
      });

      if (
        resChangeOk.status === 200 &&
        newAdminToken &&
        newAdminRtCookie &&
        updatedAdmin.BatBuocDoiMatKhau === false &&
        auditLog !== null &&
        !JSON.stringify(auditLog.ChiTiet).includes('Admin') &&
        !JSON.stringify(auditLog.ChiTiet).includes('Pass')
      ) {
        logPass('Test 7', 'Đổi mật khẩu thành công: cấp phiên mới, đặt BatBuocDoiMatKhau = false, ghi NhatKy an toàn');
      } else {
        throw new Error(`Đổi mật khẩu không hoàn chỉnh: ${JSON.stringify(resChangeOk.body)}`);
      }
    } catch (err) {
      logFail('Test 7', err);
    }

    // ----------------------------------------------------
    // Test 8: Sau khi đổi mật khẩu, route ping-admin hoạt động bình thường
    // ----------------------------------------------------
    try {
      const resPingAdmin = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-admin',
        headers: { authorization: `Bearer ${newAdminToken}` },
      });

      if (resPingAdmin.status === 200 && resPingAdmin.body?.data?.ok === true) {
        logPass('Test 8', 'Sau khi đổi mật khẩu, truy cập /ping-admin thành công với quyền admin');
      } else {
        throw new Error(`Truy cập /ping-admin thất bại: ${resPingAdmin.status}`);
      }
    } catch (err) {
      logFail('Test 8', err);
    }

    // ----------------------------------------------------
    // Test 9: requireRole phân quyền: thủ thư gọi /ping-staff được (200), gọi /ping-admin bị 403
    // ----------------------------------------------------
    try {
      // Đăng nhập thủ thư
      const resThuthuLogin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/login',
        body: { MSNV: 'TEST_ADMIN_02', Password: passwordPlain },
      });
      const thuthuToken = resThuthuLogin.body?.data?.accessToken;

      const resStaffPing = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-staff',
        headers: { authorization: `Bearer ${thuthuToken}` },
      });

      const resAdminPingByStaff = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-admin',
        headers: { authorization: `Bearer ${thuthuToken}` },
      });

      if (
        resStaffPing.status === 200 &&
        resStaffPing.body?.data?.ok === true &&
        resAdminPingByStaff.status === 403 &&
        resAdminPingByStaff.body?.error?.code === 'FORBIDDEN'
      ) {
        logPass('Test 9', 'requireRole hoạt động chuẩn xác: thủ thư vào /ping-staff thành công (200), vào /ping-admin bị chặn 403 FORBIDDEN');
      } else {
        throw new Error(`Phân quyền sai: staff=${resStaffPing.status}, adminByStaff=${resAdminPingByStaff.status}`);
      }
    } catch (err) {
      logFail('Test 9', err);
    }

    // ----------------------------------------------------
    // Test 10: Refresh token: kiểm tra Origin whitelist, cấp token mới
    // ----------------------------------------------------
    let refreshedToken = '';
    let refreshedRtCookie = '';

    try {
      // 10.1 Thiếu Origin -> 403
      const resNoOrigin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/refresh',
        cookies: { rt_admin: newAdminRtCookie },
      });

      // 10.2 Origin lạ ngoài whitelist -> 403
      const resBadOrigin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/refresh',
        headers: { origin: 'http://malicious-website.com' },
        cookies: { rt_admin: newAdminRtCookie },
      });

      // 10.3 Origin đúng -> 200
      const resRefreshOk = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/refresh',
        headers: { origin: 'http://localhost:5174' },
        cookies: { rt_admin: newAdminRtCookie },
      });

      refreshedToken = resRefreshOk.body?.data?.accessToken;
      refreshedRtCookie = resRefreshOk.cookies.find((c) => c.name === 'rt_admin')?.val;

      if (
        resNoOrigin.status === 403 &&
        resBadOrigin.status === 403 &&
        resRefreshOk.status === 200 &&
        refreshedToken &&
        refreshedRtCookie
      ) {
        logPass('Test 10', 'Refresh token kiểm tra Origin whitelist (chặn thiếu/sai 403) và cấp accessToken + cookie mới thành công');
      } else {
        throw new Error(`Refresh không đúng: noOrigin=${resNoOrigin.status}, badOrigin=${resBadOrigin.status}, ok=${resRefreshOk.status}`);
      }
    } catch (err) {
      logFail('Test 10', err);
    }

    // ----------------------------------------------------
    // Test 11: Chặn khi tài khoản bị khóa (BiKhoa) trong lúc authAdmin hoặc refresh
    // ----------------------------------------------------
    try {
      await NhanVien.updateOne({ MSNV: 'TEST_ADMIN_01' }, { $set: { TrangThai: 'BiKhoa' } });

      const resLockedAuth = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-admin',
        headers: { authorization: `Bearer ${refreshedToken}` },
      });

      const resLockedRefresh = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/refresh',
        headers: { origin: 'http://localhost:5174' },
        cookies: { rt_admin: refreshedRtCookie },
      });

      if (
        resLockedAuth.status === 403 &&
        resLockedAuth.body?.error?.code === 'ACCOUNT_LOCKED' &&
        resLockedRefresh.status === 403 &&
        resLockedRefresh.body?.error?.code === 'ACCOUNT_LOCKED'
      ) {
        logPass('Test 11', 'Tài khoản BiKhoa bị chặn tức thì ở cả authAdmin và refresh (403 ACCOUNT_LOCKED)');
      } else {
        throw new Error(`Khóa tài khoản không chặn đúng: auth=${resLockedAuth.status}, refresh=${resLockedRefresh.status}`);
      }

      await NhanVien.updateOne({ MSNV: 'TEST_ADMIN_01' }, { $set: { TrangThai: 'HoatDong' } });
    } catch (err) {
      logFail('Test 11', err);
    }

    // ----------------------------------------------------
    // Test 12: Logout: kiểm tra Origin, thu hồi token, xóa cookie, luôn trả 200
    // ----------------------------------------------------
    try {
      // 12.1 Thiếu Origin -> 403
      const resLogoutNoOrigin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/logout',
        cookies: { rt_admin: refreshedRtCookie },
      });

      // 12.2 Có Origin và cookie -> 200, cookie được xóa
      const resLogoutOk = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/logout',
        headers: { origin: 'http://localhost:5174' },
        cookies: { rt_admin: refreshedRtCookie },
      });

      const clearedCookie = resLogoutOk.cookies.find((c) => c.name === 'rt_admin');

      // 12.3 Không có cookie -> vẫn trả 200
      const resLogoutNoCookie = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/logout',
        headers: { origin: 'http://localhost:5174' },
      });

      if (
        resLogoutNoOrigin.status === 403 &&
        resLogoutOk.status === 200 &&
        clearedCookie &&
        resLogoutNoCookie.status === 200
      ) {
        logPass('Test 12', 'Logout kiểm tra Origin, thu hồi token, xóa cookie rt_admin, luôn trả 200 kể cả khi không có cookie');
      } else {
        throw new Error(`Logout không đúng: noOrigin=${resLogoutNoOrigin.status}, ok=${resLogoutOk.status}, noCookie=${resLogoutNoCookie.status}`);
      }
    } catch (err) {
      logFail('Test 12', err);
    }

  } finally {
    await cleanupTestData();
    await disconnectDB();
  }

  console.log('----------------------------------------------------');
  console.log(`KẾT QUẢ: ${passedCount} PASS, ${failedCount} FAIL`);

  if (failedCount > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Lỗi không xử lý được trong test script:', err);
  process.exit(1);
});
