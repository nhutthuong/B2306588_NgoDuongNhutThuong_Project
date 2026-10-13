import express from 'express';
import cookieParser from 'cookie-parser';
import { connectDB, disconnectDB } from '../config/db.js';
import { DocGia, NhanVien, RefreshToken, NhatKy } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';
import userAuthRouter from '../routes/user/auth.routes.js';
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

// Khởi tạo app test nhỏ chạy in-process với cả 2 router user và admin để kiểm tra cô lập
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/user/auth', userAuthRouter);
  app.use('/api/admin/auth', adminAuthRouter);
  app.use(errorHandler);
  return app;
};

let testIpCounter = 1;

// Helper gửi request in-memory
const sendRequest = async (app, { method, path, headers = {}, body = null, cookies = {}, ip = null }) => {
  return new Promise((resolve) => {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const allHeaders = { ...headers };
    if (cookieHeader) {
      allHeaders.cookie = cookieHeader;
    }

    testIpCounter++;
    const clientIp = ip || `10.0.${Math.floor(testIpCounter / 200)}.${(testIpCounter % 200) + 1}`;

    const reqMock = {
      method,
      url: path,
      headers: allHeaders,
      body: body || {},
      cookies: { ...cookies },
      ip: clientIp,
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
  await DocGia.deleteMany({ Email: /^test_user/ });
  await DocGia.deleteMany({ MaDocGia: /^TEST_/ });
  await NhanVien.deleteMany({ MSNV: /^TEST_STAFF_/ });
  await RefreshToken.deleteMany({ ChuSoHuu: /^TEST_/ });
  await RefreshToken.deleteMany({ ChuSoHuu: /^DG/ });
  await NhatKy.deleteMany({ MaDoiTuong: /^DG/ });
};

const runTests = async () => {
  console.log('--- BẮT ĐẦU KIỂM TRA P1-3: USER AUTH & ISOLATION ---');

  await connectDB();
  const app = createTestApp();

  try {
    await cleanupTestData();

    const plainPassword = 'UserPass@123456';
    const testEmail1 = 'test_user_01@example.com';
    const testEmail2 = 'test_user_lock@example.com';

    // ----------------------------------------------------
    // Kịch bản a: Đăng ký thành công, trùng Email (409), gửi trường lạ/cấm (400), mật khẩu yếu (400)
    // ----------------------------------------------------
    try {
      // a.1 Đăng ký thành công
      const resRegOk = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Nguyễn Văn',
          Ten: 'Độc Giả Một',
          NgaySinh: '1998-05-20',
          Phai: 'Nam',
          DiaChi: '123 Đường 3/2, Cần Thơ',
          DienThoai: '0912345678',
          Email: testEmail1,
          Password: plainPassword,
        },
      });

      // a.2 Đăng ký trùng Email -> 409 DUPLICATE
      const resRegDup = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Trần Văn',
          Ten: 'Trùng Email',
          NgaySinh: '1999-01-01',
          Phai: 'Nam',
          DiaChi: 'Cần Thơ',
          DienThoai: '0987654321',
          Email: testEmail1,
          Password: plainPassword,
        },
      });

      // a.3 Gửi trường cấm TrangThai -> 400 VALIDATION_ERROR
      const resRegForbidField = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Lê Văn',
          Ten: 'Hack Status',
          NgaySinh: '2000-01-01',
          Phai: 'Nam',
          DienThoai: '0911223344',
          Email: 'test_user_forbid@example.com',
          Password: plainPassword,
          TrangThai: 'BiKhoa',
        },
      });

      // a.4 Gửi trường cấm MaDocGia -> 400 VALIDATION_ERROR
      const resRegForbidCode = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Lê Văn',
          Ten: 'Hack Code',
          NgaySinh: '2000-01-01',
          Phai: 'Nam',
          DienThoai: '0911223344',
          Email: 'test_user_forbid2@example.com',
          Password: plainPassword,
          MaDocGia: 'DG9999',
        },
      });

      // a.5 Mật khẩu yếu -> 400 VALIDATION_ERROR
      const resRegWeakPass = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Phạm Thị',
          Ten: 'Mật Khẩu Yếu',
          NgaySinh: '2001-01-01',
          Phai: 'Nu',
          DienThoai: '0933445566',
          Email: 'test_user_weak@example.com',
          Password: 'weak',
        },
      });

      if (
        resRegOk.status === 201 &&
        resRegOk.body?.data?.MaDocGia &&
        resRegOk.body?.data?.Email === testEmail1 &&
        !resRegOk.body?.data?.Password &&
        resRegDup.status === 409 &&
        resRegDup.body?.error?.code === 'DUPLICATE' &&
        resRegForbidField.status === 400 &&
        resRegForbidField.body?.error?.code === 'VALIDATION_ERROR' &&
        resRegForbidCode.status === 400 &&
        resRegForbidCode.body?.error?.code === 'VALIDATION_ERROR' &&
        resRegWeakPass.status === 400 &&
        resRegWeakPass.body?.error?.code === 'VALIDATION_ERROR'
      ) {
        logPass(
          'Kịch bản a',
          'Đăng ký 201; trùng email 409 DUPLICATE; gửi trường cấm TrangThai/MaDocGia bị 400; mật khẩu yếu bị 400'
        );
      } else {
        throw new Error(
          `Kết quả kiểm tra đăng ký không đúng: ok=${resRegOk.status}, dup=${resRegDup.status}, forbid=${resRegForbidField.status}, weak=${resRegWeakPass.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản a', err);
    }

    // ----------------------------------------------------
    // Kịch bản b: Đăng nhập đúng/sai, sai 5 lần liên tiếp bị khóa 423
    // ----------------------------------------------------
    let userToken = '';
    let userRtCookie = '';
    let userMaDocGia = '';

    try {
      // Tạo user riêng cho test khóa
      await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/register',
        body: {
          HoLot: 'Khóa',
          Ten: 'Tài Khoản',
          NgaySinh: '1995-10-10',
          Phai: 'Nam',
          DienThoai: '0977889900',
          Email: testEmail2,
          Password: plainPassword,
        },
      });

      // Sai 5 lần liên tiếp
      for (let i = 1; i <= 5; i++) {
        const resWrong = await sendRequest(app, {
          method: 'POST',
          path: '/api/user/auth/login',
          body: { Email: testEmail2, Password: 'WrongPassword@123' },
        });
        if (resWrong.status !== 401) {
          throw new Error(`Lần sai thứ ${i} không trả 401: status=${resWrong.status}`);
        }
      }

      // Lần thứ 6: dù nhập đúng mật khẩu vẫn bị 423 ACCOUNT_LOCKED
      const resLocked = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/login',
        body: { Email: testEmail2, Password: plainPassword },
      });

      // Đăng nhập tài khoản test 1 thành công
      const resLoginOk = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/login',
        body: { Email: testEmail1, Password: plainPassword },
      });

      userToken = resLoginOk.body?.data?.accessToken;
      userMaDocGia = resLoginOk.body?.data?.user?.MaDocGia;
      const rtCookieObj = resLoginOk.cookies.find((c) => c.name === 'rt_user');
      userRtCookie = rtCookieObj?.val;

      if (
        resLocked.status === 423 &&
        resLocked.body?.error?.code === 'ACCOUNT_LOCKED' &&
        resLoginOk.status === 200 &&
        userToken &&
        userRtCookie &&
        rtCookieObj.opts?.path === '/api/user/auth'
      ) {
        logPass(
          'Kịch bản b',
          'Sai mật khẩu 5 lần kích hoạt khóa tạm thời 423; đăng nhập đúng trả access token và cookie rt_user'
        );
      } else {
        throw new Error(
          `Kết quả đăng nhập/khóa không đúng: locked=${resLocked.status}, loginOk=${resLoginOk.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản b', err);
    }

    // ----------------------------------------------------
    // Kịch bản c: Cách ly Token giữa hai nhóm tài khoản
    // - Token docgia dùng cho admin bị 401
    // - Token admin dùng cho user /ping bị 401
    // ----------------------------------------------------
    try {
      // 1. Tạo 1 nhân viên admin để test
      const adminPassHash = await hashPassword('AdminPass@123456');
      await NhanVien.create({
        MSNV: 'TEST_STAFF_01',
        HoTenNV: 'Admin Test Isolation',
        Password: adminPassHash,
        VaiTro: 'admin',
        TrangThai: 'HoatDong',
        BatBuocDoiMatKhau: false,
      });

      const resAdminLogin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/login',
        body: { MSNV: 'TEST_STAFF_01', Password: 'AdminPass@123456' },
      });
      const adminToken = resAdminLogin.body?.data?.accessToken;
      const adminRtCookie = resAdminLogin.cookies.find((c) => c.name === 'rt_admin')?.val;

      // Token docgia gọi route admin
      const resDocGiaToAdmin = await sendRequest(app, {
        method: 'GET',
        path: '/api/admin/auth/ping-admin',
        headers: { authorization: `Bearer ${userToken}` },
      });

      // Token admin gọi route docgia /ping
      const resAdminToUser = await sendRequest(app, {
        method: 'GET',
        path: '/api/user/auth/ping',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Token docgia gọi route docgia /ping thành công
      const resUserPingOk = await sendRequest(app, {
        method: 'GET',
        path: '/api/user/auth/ping',
        headers: { authorization: `Bearer ${userToken}` },
      });

      if (
        resDocGiaToAdmin.status === 401 &&
        resAdminToUser.status === 401 &&
        resUserPingOk.status === 200 &&
        resUserPingOk.body?.data?.maDocGia === userMaDocGia
      ) {
        logPass(
          'Kịch bản c',
          'Token của độc giả bị từ chối 401 ở API admin; token của admin bị từ chối 401 ở API độc giả'
        );
      } else {
        throw new Error(
          `Cách ly token thất bại: docGiaToAdmin=${resDocGiaToAdmin.status}, adminToUser=${resAdminToUser.status}, userPingOk=${resUserPingOk.status}`
        );
      }

      // ----------------------------------------------------
      // Kịch bản d: Cách ly Cookie giữa hai nhóm tài khoản
      // - rt_user không dùng được ở admin refresh
      // - rt_admin không dùng được ở user refresh
      // ----------------------------------------------------
      const resUserRtToAdmin = await sendRequest(app, {
        method: 'POST',
        path: '/api/admin/auth/refresh',
        headers: { origin: 'http://localhost:5174' },
        cookies: { rt_user: userRtCookie }, // sai tên cookie mà admin cần (rt_admin)
      });

      const resAdminRtToUser = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_admin: adminRtCookie }, // sai tên cookie mà user cần (rt_user)
      });

      if (resUserRtToAdmin.status === 401 && resAdminRtToUser.status === 401) {
        logPass(
          'Kịch bản d',
          'Cookie rt_user không dùng được ở admin refresh; cookie rt_admin không dùng được ở user refresh'
        );
      } else {
        throw new Error(
          `Cách ly cookie thất bại: userToAdmin=${resUserRtToAdmin.status}, adminToUser=${resAdminRtToUser.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản c/d', err);
    }

    // ----------------------------------------------------
    // Kịch bản e: Refresh token rotation & phát hiện tái sử dụng
    // ----------------------------------------------------
    try {
      // Rotate lần 1 thành công
      const resRefresh1 = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_user: userRtCookie },
      });

      const newRtCookieObj = resRefresh1.cookies.find((c) => c.name === 'rt_user');
      const newUserRtCookie = newRtCookieObj?.val;

      // Dùng lại cookie cũ userRtCookie -> phát hiện tái sử dụng -> trả 401
      const resReuseOldRt = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_user: userRtCookie },
      });

      // Sau khi tái sử dụng bị phát hiện, token mới newUserRtCookie cũng bị thu hồi -> trả 401
      const resRevokedNewRt = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_user: newUserRtCookie },
      });

      if (
        resRefresh1.status === 200 &&
        resReuseOldRt.status === 401 &&
        resRevokedNewRt.status === 401
      ) {
        logPass(
          'Kịch bản e',
          'Rotation cấp token mới; dùng lại token cũ bị 401 và toàn bộ phiên mới cấp bị thu hồi tức thì'
        );
      } else {
        throw new Error(
          `Rotation kiểm tra thất bại: ref1=${resRefresh1.status}, reuse=${resReuseOldRt.status}, revoked=${resRevokedNewRt.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản e', err);
    }

    // ----------------------------------------------------
    // Kịch bản f: Độc giả bị khóa (BiKhoa) thì token đang có bị chặn ngay lập tức
    // ----------------------------------------------------
    try {
      // Đăng nhập lại lấy token mới
      const resFreshLogin = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/login',
        body: { Email: testEmail1, Password: plainPassword },
      });
      const freshUserToken = resFreshLogin.body?.data?.accessToken;
      const freshUserCookie = resFreshLogin.cookies.find((c) => c.name === 'rt_user')?.val;

      // Khóa tài khoản trong DB
      await DocGia.updateOne({ Email: testEmail1 }, { $set: { TrangThai: 'BiKhoa' } });

      // Gọi /ping với token đang có -> phải bị chặn 403 ACCOUNT_LOCKED
      const resLockedPing = await sendRequest(app, {
        method: 'GET',
        path: '/api/user/auth/ping',
        headers: { authorization: `Bearer ${freshUserToken}` },
      });

      // Gọi /refresh với cookie đang có -> phải bị chặn 403 ACCOUNT_LOCKED
      const resLockedRefresh = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_user: freshUserCookie },
      });

      // Mở lại tài khoản
      await DocGia.updateOne({ Email: testEmail1 }, { $set: { TrangThai: 'HoatDong' } });

      if (
        resLockedPing.status === 403 &&
        resLockedPing.body?.error?.code === 'ACCOUNT_LOCKED' &&
        resLockedRefresh.status === 403 &&
        resLockedRefresh.body?.error?.code === 'ACCOUNT_LOCKED'
      ) {
        logPass(
          'Kịch bản f',
          'Độc giả có TrangThai = BiKhoa bị authUser và refresh chặn ngay lập tức với 403 ACCOUNT_LOCKED'
        );
      } else {
        throw new Error(
          `Kiểm tra BiKhoa thất bại: ping=${resLockedPing.status}, refresh=${resLockedRefresh.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản f', err);
    }

    // ----------------------------------------------------
    // Kịch bản bổ sung: GET /me, PATCH /me (whitelist cứng), PATCH /change-password, POST /logout
    // ----------------------------------------------------
    try {
      const resLoginForProfile = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/login',
        body: { Email: testEmail1, Password: plainPassword },
      });
      let activeToken = resLoginForProfile.body?.data?.accessToken;
      let activeRtCookie = resLoginForProfile.cookies.find((c) => c.name === 'rt_user')?.val;

      // GET /me
      const resGetMe = await sendRequest(app, {
        method: 'GET',
        path: '/api/user/auth/me',
        headers: { authorization: `Bearer ${activeToken}` },
      });

      // PATCH /me thành công các trường whitelisted
      const resUpdateMeOk = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/user/auth/me',
        headers: { authorization: `Bearer ${activeToken}` },
        body: {
          HoLot: 'Nguyễn Văn Cập Nhật',
          Ten: 'Độc Giả Mới',
          DiaChi: 'Ninh Kiều, Cần Thơ',
        },
      });

      // PATCH /me gửi Email hoặc Password -> bị từ chối 400
      const resUpdateMeEmail = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/user/auth/me',
        headers: { authorization: `Bearer ${activeToken}` },
        body: {
          Email: 'hacker@example.com',
        },
      });

      // PATCH /change-password
      const newPassword = 'NewUserPass@2026';
      const resChangePass = await sendRequest(app, {
        method: 'PATCH',
        path: '/api/user/auth/change-password',
        headers: { authorization: `Bearer ${activeToken}` },
        body: {
          MatKhauCu: plainPassword,
          MatKhauMoi: newPassword,
        },
      });

      activeToken = resChangePass.body?.data?.accessToken;
      activeRtCookie = resChangePass.cookies.find((c) => c.name === 'rt_user')?.val;

      // POST /logout
      const resLogout = await sendRequest(app, {
        method: 'POST',
        path: '/api/user/auth/logout',
        headers: { origin: 'http://localhost:5173' },
        cookies: { rt_user: activeRtCookie },
      });

      if (
        resGetMe.status === 200 &&
        resGetMe.body?.data?.user?.Email === testEmail1 &&
        resUpdateMeOk.status === 200 &&
        resUpdateMeOk.body?.data?.user?.HoLot === 'Nguyễn Văn Cập Nhật' &&
        resUpdateMeEmail.status === 400 &&
        resChangePass.status === 200 &&
        resLogout.status === 200
      ) {
        logPass(
          'Kịch bản hồ sơ & đổi mật khẩu',
          'GET /me, PATCH /me (chặn sửa Email 400), PATCH /change-password cấp phiên mới, POST /logout thành công'
        );
      } else {
        throw new Error(
          `Kiểm tra hồ sơ thất bại: getMe=${resGetMe.status}, updateOk=${resUpdateMeOk.status}, updateEmail=${resUpdateMeEmail.status}, changePass=${resChangePass.status}, logout=${resLogout.status}`
        );
      }
    } catch (err) {
      logFail('Kịch bản hồ sơ & đổi mật khẩu', err);
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
  console.error('Lỗi không xử lý được trong test script user auth:', err);
  process.exit(1);
});
