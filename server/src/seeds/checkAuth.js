import jwt from 'jsonwebtoken';
import { connectDB, disconnectDB } from '../config/db.js';
import DocGia from '../models/DocGia.js';
import NhanVien from '../models/NhanVien.js';
import RefreshToken from '../models/RefreshToken.js';
import authService, {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  hashToken,
  authenticate,
} from '../services/auth.service.js';

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

// Don sach du lieu test
const cleanupTestData = async () => {
  await DocGia.deleteMany({ MaDocGia: /^TEST_/ });
  await NhanVien.deleteMany({ MSNV: /^TEST_/ });
  await RefreshToken.deleteMany({ ChuSoHuu: /^TEST_/ });
};

const runAllTests = async () => {
  console.log('--- BAT DAU KIEM TRA AUTH SERVICE (P1-1) ---');

  await connectDB();

  try {
    await cleanupTestData();

    // 1. Tao tai khoan test cho DocGia va NhanVien
    const plainPass = 'TestPassword@123';
    const hashedPass = await hashPassword(plainPass);

    const testDocGia = await DocGia.create({
      MaDocGia: 'TEST_DG001',
      HoLot: 'Nguyen Van',
      Ten: 'Test',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nam',
      Email: 'test_docgia@example.com',
      Password: hashedPass,
      TrangThai: 'HoatDong',
    });

    const testNhanVien = await NhanVien.create({
      MSNV: 'TEST_NV001',
      HoTenNV: 'Tran Thi Admin',
      Password: hashedPass,
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
    });

    // --- Kich ban a: Dang nhap dung, sai mat khau, sai tai khoan (thong bao giong nhau) ---
    try {
      const authSuccess = await authenticate('docgia', 'test_docgia@example.com', plainPass);
      if (!authSuccess || authSuccess.Password) {
        throw new Error('Dang nhap thanh cong nhung ket qua tra ve khong hop le hoac chua Password');
      }

      let errWrongPass;
      try {
        await authenticate('docgia', 'test_docgia@example.com', 'WrongPassword123');
      } catch (err) {
        errWrongPass = err;
      }

      let errWrongAcc;
      try {
        await authenticate('docgia', 'nonexistent@example.com', plainPass);
      } catch (err) {
        errWrongAcc = err;
      }

      if (
        errWrongPass?.statusCode === 401 &&
        errWrongPass?.code === 'INVALID_CREDENTIALS' &&
        errWrongAcc?.statusCode === 401 &&
        errWrongAcc?.code === 'INVALID_CREDENTIALS' &&
        errWrongPass.message === errWrongAcc.message
      ) {
        logPass(
          'Kịch bản a',
          'Đăng nhập đúng trả tài khoản (không có Password); sai mật khẩu và sai tài khoản đều trả 401 INVALID_CREDENTIALS với thông điệp đồng nhất'
        );
      } else {
        throw new Error(
          `Thong bao hoac ma loi khong dong nhat: pass="${errWrongPass?.message}" vs acc="${errWrongAcc?.message}"`
        );
      }
    } catch (err) {
      logFail('Kịch bản a', err);
    }

    // --- Kich ban b: Sai 5 lan lien tiep thi bi khoa 423, dung mat khau trong luc khoa van bi tu choi ---
    try {
      // Tao them tai khoan rieng cho test khoa
      const testLockUser = await DocGia.create({
        MaDocGia: 'TEST_DG002',
        HoLot: 'Le Van',
        Ten: 'LockTest',
        NgaySinh: new Date('2001-02-02'),
        Phai: 'Nam',
        Email: 'test_lock@example.com',
        Password: hashedPass,
        TrangThai: 'HoatDong',
      });

      // Nhap sai 5 lan
      for (let i = 1; i <= 5; i++) {
        try {
          await authenticate('docgia', 'test_lock@example.com', 'WrongPass' + i);
        } catch (err) {
          if (err.statusCode !== 401) {
            throw new Error(`Lan sai thu ${i} phai tra ve 401`);
          }
        }
      }

      // Lan thu 6: Thu dang nhap bang dung mat khau nhung phai bi khoa 423
      let lockErr;
      try {
        await authenticate('docgia', 'test_lock@example.com', plainPass);
      } catch (err) {
        lockErr = err;
      }

      if (lockErr?.statusCode === 423 && lockErr?.code === 'ACCOUNT_LOCKED') {
        logPass(
          'Kịch bản b',
          'Nhập sai 5 lần liên tiếp kích hoạt khóa tạm thời 423 ACCOUNT_LOCKED, nhập đúng mật khẩu trong lúc khóa vẫn bị chặn'
        );
      } else {
        throw new Error(`Mong doi 423 ACCOUNT_LOCKED nhung nhan duoc: ${lockErr?.statusCode} ${lockErr?.code}`);
      }
    } catch (err) {
      logFail('Kịch bản b', err);
    }

    // --- Kich ban c: Tai khoan BiKhoa bi 403 ---
    try {
      await DocGia.updateOne({ MaDocGia: 'TEST_DG001' }, { $set: { TrangThai: 'BiKhoa' } });

      let lockedErr;
      try {
        await authenticate('docgia', 'test_docgia@example.com', plainPass);
      } catch (err) {
        lockedErr = err;
      }

      if (lockedErr?.statusCode === 403 && lockedErr?.code === 'ACCOUNT_LOCKED') {
        logPass('Kịch bản c', 'Tài khoản có TrangThai = BiKhoa bị từ chối với lỗi 403 ACCOUNT_LOCKED');
      } else {
        throw new Error(`Mong doi 403 ACCOUNT_LOCKED nhung nhan duoc: ${lockedErr?.statusCode} ${lockedErr?.code}`);
      }

      // Khoi phuc lai trang thai HoatDong
      await DocGia.updateOne({ MaDocGia: 'TEST_DG001' }, { $set: { TrangThai: 'HoatDong' } });
    } catch (err) {
      logFail('Kịch bản c', err);
    }

    // --- Kich ban d: Access token cua docgia bi verifyAccessToken(..., 'nhanvien') tu choi va nguoc lai ---
    try {
      const userToken = signAccessToken(testDocGia, 'docgia');
      const adminToken = signAccessToken(testNhanVien, 'nhanvien');

      // Docgia token phai hop le voi type docgia
      const userPayload = verifyAccessToken(userToken, 'docgia');
      if (userPayload.sub !== 'TEST_DG001' || userPayload.aud !== 'user') {
        throw new Error('Payload user token khong dung');
      }

      // Docgia token voi type nhanvien phai bi tu choi
      let crossErr1;
      try {
        verifyAccessToken(userToken, 'nhanvien');
      } catch (err) {
        crossErr1 = err;
      }

      // Admin token voi type docgia phai bi tu choi
      let crossErr2;
      try {
        verifyAccessToken(adminToken, 'docgia');
      } catch (err) {
        crossErr2 = err;
      }

      if (crossErr1?.statusCode === 401 && crossErr2?.statusCode === 401) {
        logPass(
          'Kịch bản d',
          'Token của độc giả và nhân viên được cô lập hoàn toàn qua secret và audience, không thể dùng chéo'
        );
      } else {
        throw new Error('Token docgia va nhanvien xac thuc cheo khong nem 401');
      }
    } catch (err) {
      logFail('Kịch bản d', err);
    }

    // --- Kich ban e: Token bi sua mot ky tu bi tu choi; token het han tra TOKEN_EXPIRED ---
    try {
      const validToken = signAccessToken(testDocGia, 'docgia');
      // Sua ky tu cuoi cung cua token
      const tamperedChar = validToken.slice(-1) === 'a' ? 'b' : 'a';
      const tamperedToken = validToken.slice(0, -1) + tamperedChar;

      let tamperErr;
      try {
        verifyAccessToken(tamperedToken, 'docgia');
      } catch (err) {
        tamperErr = err;
      }

      if (tamperErr?.statusCode !== 401 || tamperErr?.code !== 'UNAUTHENTICATED') {
        throw new Error(`Token gia mao khong tra 401 UNAUTHENTICATED: ${tamperErr?.code}`);
      }

      // Token het han
      const shortLivedToken = signAccessToken(testDocGia, 'docgia', { expiresIn: '1ms' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      let expiredErr;
      try {
        verifyAccessToken(shortLivedToken, 'docgia');
      } catch (err) {
        expiredErr = err;
      }

      if (expiredErr?.statusCode === 401 && expiredErr?.code === 'TOKEN_EXPIRED') {
        logPass(
          'Kịch bản e',
          'Token bị sửa một ký tự bị từ chối 401 UNAUTHENTICATED; token hết hạn ném 401 TOKEN_EXPIRED chuẩn xác'
        );
      } else {
        throw new Error(`Token het han khong tra TOKEN_EXPIRED: ${expiredErr?.code}`);
      }
    } catch (err) {
      logFail('Kịch bản e', err);
    }

    // --- Kich ban f: Token ky alg 'none' bi tu choi ---
    try {
      const nonePayload = {
        sub: 'TEST_DG001',
        role: 'docgia',
        aud: 'user',
        iss: 'QuanLyMuonSach',
      };
      // Tao token 'none' thu cong: base64(header) + '.' + base64(payload) + '.'
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(nonePayload)).toString('base64url');
      const noneToken = `${headerB64}.${payloadB64}.`;

      let noneErr;
      try {
        verifyAccessToken(noneToken, 'docgia');
      } catch (err) {
        noneErr = err;
      }

      if (noneErr?.statusCode === 401 && noneErr?.code === 'UNAUTHENTICATED') {
        logPass('Kịch bản f', "Token ký thuật toán 'none' bị từ chối 401 UNAUTHENTICATED");
      } else {
        throw new Error(`Token alg none khong bi tu choi dung: ${noneErr?.code}`);
      }
    } catch (err) {
      logFail('Kịch bản f', err);
    }

    // --- Kich ban g: Rotation: dung refresh token lan 1 duoc cap moi; dung lai lan 1 bi 401 va token moi bi thu hoi ---
    try {
      const r1 = await issueRefreshToken('TEST_DG001', 'docgia');
      const rotated = await rotateRefreshToken(r1, 'docgia');
      const r2 = rotated.newRawToken;

      if (!r2 || r1 === r2) {
        throw new Error('Rotate lan 1 phai cap token moi');
      }

      // Dung lai r1 (da bi thu hoi)
      let reuseErr;
      try {
        await rotateRefreshToken(r1, 'docgia');
      } catch (err) {
        reuseErr = err;
      }

      if (reuseErr?.statusCode !== 401) {
        throw new Error(`Dung lai r1 khong tra ve 401: ${reuseErr?.statusCode}`);
      }

      // Kiem tra r2 da bi thu hoi toan bo phien
      const r2Doc = await RefreshToken.findOne({ TokenHash: hashToken(r2) });
      if (!r2Doc || r2Doc.ThuHoi !== true) {
        throw new Error('Token moi r2 chua bi thu hoi sau khi phat hien tai su dung token r1');
      }

      logPass(
        'Kịch bản g',
        'Rotate lần 1 thành công cấp token mới; sử dụng lại token cũ bị 401 và toàn bộ phiên mới cấp bị thu hồi'
      );
    } catch (err) {
      logFail('Kịch bản g', err);
    }

    // --- Kich ban h: Hai loi goi rotate dong thoi voi cung mot token: dung mot cai thanh cong ---
    try {
      const rConcurrent = await issueRefreshToken('TEST_DG001', 'docgia');

      const results = await Promise.allSettled([
        rotateRefreshToken(rConcurrent, 'docgia'),
        rotateRefreshToken(rConcurrent, 'docgia'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      if (fulfilled.length === 1 && rejected.length === 1) {
        const rejErr = rejected[0].reason;
        if (rejErr?.statusCode === 401) {
          logPass(
            'Kịch bản h',
            'Hai lời gọi rotate đồng thời với cùng một token: đúng 1 yêu cầu thành công, yêu cầu còn lại bị từ chối 401'
          );
        } else {
          throw new Error(`Yeu cau that bai khong tra ve 401: ${rejErr?.statusCode}`);
        }
      } else {
        throw new Error(
          `So luong fulfilled/rejected khong dung: fulfilled=${fulfilled.length}, rejected=${rejected.length}`
        );
      }
    } catch (err) {
      logFail('Kịch bản h', err);
    }

    // --- Kich ban i: Trong collection RefreshToken khong co chuoi token goc, chi co hash 64 ky tu hex ---
    try {
      const rawTokenToCheck = await issueRefreshToken('TEST_DG001', 'docgia');
      const doc = await RefreshToken.findOne({ TokenHash: hashToken(rawTokenToCheck) });

      if (!doc) {
        throw new Error('Khong tim thay document RefreshToken');
      }

      // Kiem tra do dai hash 64 ky tu hex
      const isHex64 = /^[0-9a-f]{64}$/.test(doc.TokenHash);
      if (!isHex64) {
        throw new Error(`TokenHash khong phai SHA-256 64 ky tu hex: ${doc.TokenHash}`);
      }

      // Kiem tra token goc khong ton tai trong bat ky truong nao cua document
      const docString = JSON.stringify(doc.toObject());
      if (docString.includes(rawTokenToCheck)) {
        throw new Error('Chuoi rawToken bi lo trong document RefreshToken');
      }

      logPass(
        'Kịch bản i',
        'Trong CSDL RefreshToken chỉ lưu chuỗi băm SHA-256 64 ký tự hex, tuyệt đối không lưu token gốc'
      );
    } catch (err) {
      logFail('Kịch bản i', err);
    }
  } finally {
    // Luon don sach du lieu test ke ca khi co loi
    await cleanupTestData();
    await disconnectDB();
  }

  console.log('-------------------------------------------');
  console.log(`KET QUA: ${passedCount} PASS, ${failedCount} FAIL`);

  if (failedCount > 0) {
    process.exit(1);
  }
};

runAllTests().catch((err) => {
  console.error('Loi khong xu ly duoc trong checkAuth:', err);
  process.exit(1);
});
