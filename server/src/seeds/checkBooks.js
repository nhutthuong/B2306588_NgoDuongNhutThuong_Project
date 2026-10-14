import http from 'http';
import fs from 'fs';
import path from 'path';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  Sach,
  NhaXuatBan,
  NhanVien,
  DocGia,
  TheoDoiMuonSach,
  NhatKy,
} from '../models/index.js';
import { hashPassword, signAccessToken } from '../services/auth.service.js';
import { nextCode } from '../services/code.service.js';
import { COVERS_DIR, deleteCoverImage } from '../utils/imageType.js';

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

// Chuẩn bị các buffer mẫu nhỏ hợp lệ bằng bytes
const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9,
]);

const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

const validWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x00, 0x07, 0x00, 0x00, 0x00, 0x00,
]);

const fakeTextBuffer = Buffer.from('No dung file van ban plain text, khong phai anh.');
const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');

// Tạo buffer vượt 2MB (2.2MB)
const over2MbBuffer = Buffer.concat([
  validJpegBuffer,
  Buffer.alloc(2.2 * 1024 * 1024, 0x20),
]);

// Danh sách file ảnh đã tạo trong phiên test để dọn dẹp
const createdCoverPaths = new Set();
const createdPublisherCodes = new Set();

/**
 * Gửi HTTP request
 */
const apiRequest = async (baseUrl, pathUrl, { method = 'GET', token = null, body = null, formData = null } = {}) => {
  const url = `${baseUrl}${pathUrl}`;
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let fetchBody = undefined;
  if (formData) {
    fetchBody = formData;
    // Để fetch tự động tính toán boundary cho multipart/form-data
  } else if (body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: fetchBody,
  });

  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    body: data,
  };
};

/**
 * Dọn dẹp dữ liệu thử nghiệm trong DB và trên đĩa
 */
const cleanupTestData = async () => {
  // 1. Dọn DB
  await TheoDoiMuonSach.deleteMany({
    $or: [{ MaSach: /^TEST_/ }, { MaDocGia: /^TEST_/ }],
  });

  await Sach.deleteMany({
    $or: [
      { MaSach: /^TEST_/ },
      { TenSach: /^TEST_/ },
      { MaNXB: /^TEST_/ },
    ],
  });

  await NhaXuatBan.deleteMany({
    $or: [
      { MaNXB: /^TEST_/ },
      { TenNXB: /^TEST_/i },
      { MaNXB: { $in: Array.from(createdPublisherCodes) } },
    ],
  });

  await NhanVien.deleteMany({ MSNV: /^TEST_/ });
  await DocGia.deleteMany({ MaDocGia: /^TEST_/ });

  await NhatKy.deleteMany({
    $or: [
      { MSNV: /^TEST_/ },
      { MaDoiTuong: /^TEST_/ },
      { DoiTuong: 'Sach', 'ChiTiet.TenSach': /^TEST_/i },
    ],
  });

  // 2. Dọn file ảnh đã ghi nhận
  for (const storedPath of createdCoverPaths) {
    await deleteCoverImage(storedPath);
  }
  createdCoverPaths.clear();
};

const run = async () => {
  console.log('--- BAT DAU KIEM TRA API CRUD SACH VA UPLOAD ANH BIA (P2-2) ---');
  console.log('[HUONG DAN] Cach chay:');
  console.log('  Cach 1: Chay "npm run dev" hoac "npm start" tai mot terminal, sau do chay "npm run check:books" tai terminal khac.');
  console.log('  Cach 2: Neu server chua chay, script se tu dong khoi chay server HTTP cuc bo de kiem tra.');

  let localServer = null;
  let baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';

  // 1. Kiểm tra server có sẵn không
  let isServerRunning = false;
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      isServerRunning = true;
      console.log(`[INFO] Da ket noi toi server dang chay tai: ${baseUrl}`);
    }
  } catch {}

  if (!isServerRunning) {
    localServer = http.createServer(app);
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    const port = localServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[INFO] Server chua chay san. Da khoi tao server HTTP test tai: ${baseUrl}`);
  }

  // 2. Kết nối DB
  await connectDB();

  // 3. Dọn dẹp trước khi chạy
  await cleanupTestData();

  let adminToken = null;
  let thuthuToken = null;
  let pendingToken = null;
  let userToken = null;
  let testMaNXB = 'TEST_NXB_001';

  try {
    // 4. Tạo tài khoản thử nghiệm
    const dummyPasswordHash = await hashPassword('BookTestPass123!');

    const adminAccount = await NhanVien.create({
      MSNV: 'TEST_NV_ADM',
      HoTenNV: 'Admin Test Sách',
      Password: dummyPasswordHash,
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      BatBuocDoiMatKhau: false,
      TrangThai: 'HoatDong',
    });

    const thuthuAccount = await NhanVien.create({
      MSNV: 'TEST_NV_TT',
      HoTenNV: 'Thủ thư Test Sách',
      Password: dummyPasswordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      BatBuocDoiMatKhau: false,
      TrangThai: 'HoatDong',
    });

    const pendingAccount = await NhanVien.create({
      MSNV: 'TEST_NV_PENDING',
      HoTenNV: 'Nhân viên chờ đổi MK',
      Password: dummyPasswordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      BatBuocDoiMatKhau: true,
      TrangThai: 'HoatDong',
    });

    const docGiaAccount = await DocGia.create({
      MaDocGia: 'TEST_DG_001',
      HoLot: 'Lê Văn',
      Ten: 'Test',
      NgaySinh: new Date('1998-08-08'),
      Phai: 'Nam',
      Email: 'test_docgia_books@example.com',
      Password: dummyPasswordHash,
      TrangThai: 'HoatDong',
    });

    await DocGia.create({
      MaDocGia: 'TEST_DG_002',
      HoLot: 'Trần Thị',
      Ten: 'Test 2',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nu',
      Email: 'test_docgia_books_2@example.com',
      Password: dummyPasswordHash,
      TrangThai: 'HoatDong',
    });

    const createdPub = await NhaXuatBan.create({
      MaNXB: await nextCode('NhaXuatBan'),
      TenNXB: 'TEST_NXB_HocThuat',
      DiaChi: 'Hà Nội',
    });
    testMaNXB = createdPub.MaNXB;
    createdPublisherCodes.add(testMaNXB);

    adminToken = signAccessToken(adminAccount, 'nhanvien');
    thuthuToken = signAccessToken(thuthuAccount, 'nhanvien');
    pendingToken = signAccessToken(pendingAccount, 'nhanvien');
    userToken = signAccessToken(docGiaAccount, 'user');

    // =========================================================================
    // KỊCH BẢN A: Xác thực & quyền truy cập cơ bản (401, 403)
    // =========================================================================
    {
      // a1: Không có token -> 401
      const resNoToken = await apiRequest(baseUrl, '/api/admin/books');
      if (resNoToken.status === 401 && resNoToken.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('Kịch bản a1', 'Không token bị từ chối 401 UNAUTHENTICATED');
      } else {
        logFail('Kịch bản a1', `Kỳ vọng 401 nhưng nhận ${resNoToken.status}`);
      }

      // a2: Token độc giả -> 401
      const resUserToken = await apiRequest(baseUrl, '/api/admin/books', { token: userToken });
      if (resUserToken.status === 401 && resUserToken.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('Kịch bản a2', 'Token độc giả bị từ chối 401 UNAUTHENTICATED trên admin API');
      } else {
        logFail('Kịch bản a2', `Kỳ vọng 401 nhưng nhận ${resUserToken.status}`);
      }

      // a3: Tài khoản đang buộc đổi mật khẩu -> 403
      const resPending = await apiRequest(baseUrl, '/api/admin/books', { token: pendingToken });
      if (resPending.status === 403 && resPending.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('Kịch bản a3', 'Tài khoản BatBuocDoiMatKhau=true bị chặn 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('Kịch bản a3', `Kỳ vọng 403 nhưng nhận ${resPending.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN B: Quyền của thủ thư (tạo, sửa, xem danh sách, xem chi tiết được; xóa bị 403)
    // =========================================================================
    let thuthuMaSach = null;
    {
      // b1: Thủ thư tạo sách mới
      const form = new FormData();
      form.append('TenSach', 'TEST_Sach_ThuThu_Tao');
      form.append('DonGia', '65000');
      form.append('SoQuyen', '10');
      form.append('NamXuatBan', '2023');
      form.append('MaNXB', testMaNXB);
      form.append('NguonGocTacGia', 'Tác giả A');
      form.append('TheLoai', 'Công nghệ');
      form.append('MoTa', 'Mô tả sách thủ thư');

      const resCreate = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: thuthuToken,
        formData: form,
      });

      if (resCreate.status === 201 && resCreate.body?.data?.MaSach) {
        thuthuMaSach = resCreate.body.data.MaSach;
        logPass('Kịch bản b1', `Thủ thư tạo sách thành công (201, MaSach: ${thuthuMaSach})`);
      } else {
        logFail('Kịch bản b1', `Thủ thư tạo sách thất bại: ${JSON.stringify(resCreate.body)}`);
      }

      // b2: Thủ thư xem chi tiết sách kèm thông tin NXB
      const resDetail = await apiRequest(baseUrl, `/api/admin/books/${thuthuMaSach}`, {
        token: thuthuToken,
      });

      if (
        resDetail.status === 200 &&
        resDetail.body?.data?.MaSach === thuthuMaSach &&
        resDetail.body?.data?.TenNXB === 'TEST_NXB_HocThuat'
      ) {
        logPass('Kịch bản b2', 'Thủ thư xem chi tiết sách thành công kèm TenNXB');
      } else {
        logFail('Kịch bản b2', `Thủ thư xem chi tiết thất bại: ${JSON.stringify(resDetail.body)}`);
      }

      // b3: Thủ thư xem danh sách sách kèm TenNXB và meta phân trang
      const resList = await apiRequest(baseUrl, `/api/admin/books?search=TEST_Sach_ThuThu_Tao`, {
        token: thuthuToken,
      });

      if (
        resList.status === 200 &&
        Array.isArray(resList.body?.data) &&
        resList.body.data.some((b) => b.MaSach === thuthuMaSach && b.TenNXB)
      ) {
        logPass('Kịch bản b3', 'Thủ thư xem danh sách sách thành công kèm TenNXB và phân trang');
      } else {
        logFail('Kịch bản b3', `Thủ thư xem danh sách thất bại: ${JSON.stringify(resList.body)}`);
      }

      // b4: Thủ thư sửa sách
      const formUpdate = new FormData();
      formUpdate.append('TenSach', 'TEST_Sach_ThuThu_DaSua');
      formUpdate.append('DonGia', '70000');
      formUpdate.append('SoQuyen', '10');
      formUpdate.append('NamXuatBan', '2023');
      formUpdate.append('MaNXB', testMaNXB);
      formUpdate.append('NguonGocTacGia', 'Tác giả A');

      const resUpdate = await apiRequest(baseUrl, `/api/admin/books/${thuthuMaSach}`, {
        method: 'PUT',
        token: thuthuToken,
        formData: formUpdate,
      });

      if (resUpdate.status === 200 && resUpdate.body?.data?.TenSach === 'TEST_Sach_ThuThu_DaSua') {
        logPass('Kịch bản b4', 'Thủ thư sửa sách thành công (200)');
      } else {
        logFail('Kịch bản b4', `Thủ thư sửa sách thất bại: ${JSON.stringify(resUpdate.body)}`);
      }

      // b5: Thủ thư xóa sách bị chặn 403 FORBIDDEN
      const resDel = await apiRequest(baseUrl, `/api/admin/books/${thuthuMaSach}`, {
        method: 'DELETE',
        token: thuthuToken,
      });

      if (resDel.status === 403 && resDel.body?.error?.code === 'FORBIDDEN') {
        logPass('Kịch bản b5', 'Thủ thư xóa sách bị chặn với 403 FORBIDDEN');
      } else {
        logFail('Kịch bản b5', `Kỳ vọng 403 FORBIDDEN nhưng nhận ${resDel.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN C: Validate tạo sách (SoQuyenConLai, MaSach, trường lạ, MaNXB, số âm)
    // =========================================================================
    {
      // c1: Kiểm tra SoQuyenConLai = SoQuyen, DaXoa = false
      const bookDoc = await Sach.findOne({ MaSach: thuthuMaSach }).lean();
      if (bookDoc && bookDoc.SoQuyenConLai === bookDoc.SoQuyen && bookDoc.DaXoa === false) {
        logPass('Kịch bản c1', `Server tự set SoQuyenConLai = SoQuyen (${bookDoc.SoQuyen}) và DaXoa = false`);
      } else {
        logFail('Kịch bản c1', `SoQuyenConLai hoặc DaXoa sai: ${JSON.stringify(bookDoc)}`);
      }

      // c2: Gửi trường lạ (MaSach trong body) bị từ chối 400
      const formUnknown = new FormData();
      formUnknown.append('TenSach', 'TEST_Sach_La');
      formUnknown.append('DonGia', '50000');
      formUnknown.append('SoQuyen', '5');
      formUnknown.append('MaNXB', testMaNXB);
      formUnknown.append('NguonGocTacGia', 'Tác giả');
      formUnknown.append('MaSach', 'S9999');

      const resUnknown = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formUnknown,
      });

      if (resUnknown.status === 400 && resUnknown.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản c2', 'Gửi trường lạ (MaSach) trong body bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản c2', `Kỳ vọng 400 nhưng nhận: ${resUnknown.status}`);
      }

      // c3: MaNXB không tồn tại bị từ chối 400
      const formWrongNXB = new FormData();
      formWrongNXB.append('TenSach', 'TEST_Sach_NXB_Sai');
      formWrongNXB.append('DonGia', '50000');
      formWrongNXB.append('SoQuyen', '5');
      formWrongNXB.append('MaNXB', 'NXB999');
      formWrongNXB.append('NguonGocTacGia', 'Tác giả');

      const resWrongNXB = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formWrongNXB,
      });

      if (resWrongNXB.status === 400 && resWrongNXB.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản c3', 'MaNXB không tồn tại bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản c3', `Kỳ vọng 400 khi MaNXB không tồn tại nhưng nhận: ${resWrongNXB.status}`);
      }

      // c4: NamXuatBan tương lai, DonGia âm, SoQuyen không phải số nguyên -> đều 400
      const formBadNumber = new FormData();
      formBadNumber.append('TenSach', 'TEST_Sach_So_Am');
      formBadNumber.append('DonGia', '-1000');
      formBadNumber.append('SoQuyen', '5.5');
      formBadNumber.append('NamXuatBan', '2099');
      formBadNumber.append('MaNXB', testMaNXB);
      formBadNumber.append('NguonGocTacGia', 'Tác giả');

      const resBadNumber = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formBadNumber,
      });

      if (resBadNumber.status === 400 && resBadNumber.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản c4', 'Đơn giá âm, số quyển thập phân, năm xuất bản tương lai bị từ chối 400');
      } else {
        logFail('Kịch bản c4', `Kỳ vọng 400 nhưng nhận: ${resBadNumber.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN D: Kiểm tra upload ảnh bìa (Magic bytes, dung lượng, tên ngẫu nhiên, không mồ côi)
    // =========================================================================
    let uploadedBookMa = null;
    let uploadedCoverPath = null;
    {
      const countFilesInCovers = () => {
        if (!fs.existsSync(COVERS_DIR)) return 0;
        return fs.readdirSync(COVERS_DIR).filter((f) => f !== '.gitkeep').length;
      };

      const filesBefore = countFilesInCovers();

      // d1: Upload JPEG thật -> thành công, tên file ngẫu nhiên
      const formJpeg = new FormData();
      formJpeg.append('TenSach', 'TEST_Sach_Upload_Jpeg');
      formJpeg.append('DonGia', '50000');
      formJpeg.append('SoQuyen', '5');
      formJpeg.append('MaNXB', testMaNXB);
      formJpeg.append('NguonGocTacGia', 'Tác giả Test');
      const blobJpeg = new Blob([validJpegBuffer], { type: 'image/jpeg' });
      formJpeg.append('AnhBia', blobJpeg, 'anh_goc_cua_khach.jpg');

      const resJpeg = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formJpeg,
      });

      if (resJpeg.status === 201 && resJpeg.body?.data?.AnhBia) {
        uploadedBookMa = resJpeg.body.data.MaSach;
        uploadedCoverPath = resJpeg.body.data.AnhBia;
        createdCoverPaths.add(uploadedCoverPath);

        const filename = path.basename(uploadedCoverPath);
        const isNotClientName = !filename.includes('anh_goc_cua_khach');
        const hasJpgExt = filename.endsWith('.jpg');

        if (isNotClientName && hasJpgExt) {
          logPass('Kịch bản d1', `Upload JPEG hợp lệ thành công (tên ngẫu nhiên: ${filename})`);
        } else {
          logFail('Kịch bản d1', `Tên file chưa ngẫu nhiên hoặc sai đuôi: ${filename}`);
        }
      } else {
        logFail('Kịch bản d1', `Upload JPEG thất bại: ${JSON.stringify(resJpeg.body)}`);
      }

      // d2: File văn bản đổi đuôi .png -> bị từ chối 400 (sai magic bytes)
      const formFakePng = new FormData();
      formFakePng.append('TenSach', 'TEST_Sach_Fake_Png');
      formFakePng.append('DonGia', '50000');
      formFakePng.append('SoQuyen', '5');
      formFakePng.append('MaNXB', testMaNXB);
      formFakePng.append('NguonGocTacGia', 'Tác giả');
      const blobFake = new Blob([fakeTextBuffer], { type: 'image/png' });
      formFakePng.append('AnhBia', blobFake, 'fake.png');

      const resFake = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formFakePng,
      });

      if (resFake.status === 400 && resFake.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d2', 'File văn bản đổi đuôi .png bị từ chối 400 theo magic bytes');
      } else {
        logFail('Kịch bản d2', `Kỳ vọng 400 khi sai magic bytes nhưng nhận ${resFake.status}`);
      }

      // d3: SVG bị từ chối 400
      const formSvg = new FormData();
      formSvg.append('TenSach', 'TEST_Sach_Svg');
      formSvg.append('DonGia', '50000');
      formSvg.append('SoQuyen', '5');
      formSvg.append('MaNXB', testMaNXB);
      formSvg.append('NguonGocTacGia', 'Tác giả');
      const blobSvg = new Blob([svgBuffer], { type: 'image/svg+xml' });
      formSvg.append('AnhBia', blobSvg, 'vector.svg');

      const resSvg = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formSvg,
      });

      if (resSvg.status === 400) {
        logPass('Kịch bản d3', 'Tệp SVG bị từ chối 400 (chỉ nhận JPG/PNG/WebP)');
      } else {
        logFail('Kịch bản d3', `SVG không bị chặn đúng cách: ${resSvg.status}`);
      }

      // d4: File > 2MB bị từ chối (413 hoặc 400)
      const formOverSize = new FormData();
      formOverSize.append('TenSach', 'TEST_Sach_OverSize');
      formOverSize.append('DonGia', '50000');
      formOverSize.append('SoQuyen', '5');
      formOverSize.append('MaNXB', testMaNXB);
      formOverSize.append('NguonGocTacGia', 'Tác giả');
      const blobLarge = new Blob([over2MbBuffer], { type: 'image/jpeg' });
      formOverSize.append('AnhBia', blobLarge, 'large.jpg');

      const resLarge = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formOverSize,
      });

      if (resLarge.status === 413 || resLarge.status === 400) {
        logPass('Kịch bản d4', `Tệp ảnh > 2MB bị chặn chuẩn xác (${resLarge.status}: ${resLarge.body?.error?.message})`);
      } else {
        logFail('Kịch bản d4', `Tệp ảnh > 2MB không bị chặn đúng cách: ${resLarge.status}`);
      }

      // d5: Sai tên trường file (ví dụ: 'HinhAnh' thay vì 'AnhBia') -> bị từ chối 400
      const formWrongField = new FormData();
      formWrongField.append('TenSach', 'TEST_Sach_Wrong_Field');
      formWrongField.append('DonGia', '50000');
      formWrongField.append('SoQuyen', '5');
      formWrongField.append('MaNXB', testMaNXB);
      formWrongField.append('NguonGocTacGia', 'Tác giả');
      const blobNormal = new Blob([validJpegBuffer], { type: 'image/jpeg' });
      formWrongField.append('HinhAnh', blobNormal, 'pic.jpg');

      const resWrongField = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formWrongField,
      });

      if (resWrongField.status === 400) {
        logPass('Kịch bản d5', 'Gửi sai tên trường file (HinhAnh) bị từ chối 400');
      } else {
        logFail('Kịch bản d5', `Kỳ vọng 400 khi sai tên trường file nhưng nhận ${resWrongField.status}`);
      }

      // d6: Kiểm tra không có file mồ côi sau các lần bị từ chối
      const filesAfter = countFilesInCovers();
      // Chỉ có đúng 1 file của test d1 được tạo ra
      if (filesAfter === filesBefore + 1) {
        logPass('Kịch bản d6', 'Không có file ảnh bìa mồ côi nào trong thư mục covers sau các lần validate thất bại');
      } else {
        logFail('Kịch bản d6', `Phát hiện file mồ côi: trước=${filesBefore}, sau=${filesAfter}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN E: Thay ảnh và XoaAnhBia (file cũ bị xóa khỏi đĩa)
    // =========================================================================
    {
      const oldFilename = uploadedCoverPath ? path.basename(uploadedCoverPath) : '';
      const oldFullPath = oldFilename ? path.join(COVERS_DIR, oldFilename) : '';

      // e1: Thay ảnh mới (PNG)
      const formReplace = new FormData();
      formReplace.append('TenSach', 'TEST_Sach_Upload_Jpeg');
      formReplace.append('DonGia', '50000');
      formReplace.append('SoQuyen', '5');
      formReplace.append('MaNXB', testMaNXB);
      formReplace.append('NguonGocTacGia', 'Tác giả Test');
      const blobPng = new Blob([validPngBuffer], { type: 'image/png' });
      formReplace.append('AnhBia', blobPng, 'new_image.png');

      const resReplace = await apiRequest(baseUrl, `/api/admin/books/${uploadedBookMa}`, {
        method: 'PUT',
        token: adminToken,
        formData: formReplace,
      });

      const newCoverPath = resReplace.body?.data?.AnhBia;
      createdCoverPaths.add(newCoverPath);

      const oldFileStillExists = fs.existsSync(oldFullPath);
      const newFileExists = fs.existsSync(path.join(COVERS_DIR, path.basename(newCoverPath)));

      if (resReplace.status === 200 && !oldFileStillExists && newFileExists) {
        logPass('Kịch bản e1', 'Thay ảnh bìa mới thành công: ảnh cũ đã tự động bị xóa khỏi đĩa');
      } else {
        logFail('Kịch bản e1', `Ảnh cũ chưa bị xóa hoặc ảnh mới không tồn tại: oldExists=${oldFileStillExists}`);
      }

      // e2: XoaAnhBia = true gỡ ảnh bìa và xóa file ảnh mới khỏi đĩa
      const formRemoveImg = new FormData();
      formRemoveImg.append('TenSach', 'TEST_Sach_Upload_Jpeg');
      formRemoveImg.append('DonGia', '50000');
      formRemoveImg.append('SoQuyen', '5');
      formRemoveImg.append('MaNXB', testMaNXB);
      formRemoveImg.append('NguonGocTacGia', 'Tác giả Test');
      formRemoveImg.append('XoaAnhBia', 'true');

      const resRemoveImg = await apiRequest(baseUrl, `/api/admin/books/${uploadedBookMa}`, {
        method: 'PUT',
        token: adminToken,
        formData: formRemoveImg,
      });

      const newFilename = newCoverPath ? path.basename(newCoverPath) : '';
      const newFileStillExists = newFilename ? fs.existsSync(path.join(COVERS_DIR, newFilename)) : false;

      if (resRemoveImg.status === 200 && resRemoveImg.body?.data?.AnhBia === '' && !newFileStillExists) {
        logPass('Kịch bản e2', 'XoaAnhBia=true gỡ bỏ ảnh trong DB và xóa file vật lý trên đĩa thành công');
      } else {
        logFail('Kịch bản e2', `Gỡ ảnh bìa thất bại: AnhBia="${resRemoveImg.body?.data?.AnhBia}", fileStillExists=${newFileStillExists}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN F: GET /uploads/covers/:filename (nosniff, CORP cross-origin, chống path traversal)
    // =========================================================================
    {
      // f1: Upload 1 ảnh WebP hợp lệ để test GET
      const formWebp = new FormData();
      formWebp.append('TenSach', 'TEST_Sach_Webp');
      formWebp.append('DonGia', '50000');
      formWebp.append('SoQuyen', '5');
      formWebp.append('MaNXB', testMaNXB);
      formWebp.append('NguonGocTacGia', 'Tác giả');
      const blobWebp = new Blob([validWebpBuffer], { type: 'image/webp' });
      formWebp.append('AnhBia', blobWebp, 'sample.webp');

      const resWebp = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formWebp,
      });
      const webpPath = resWebp.body?.data?.AnhBia;
      createdCoverPaths.add(webpPath);
      const webpFilename = path.basename(webpPath);

      // GET ảnh bìa công khai
      const resImg = await apiRequest(baseUrl, `/uploads/covers/${webpFilename}`);
      const corpHeader = resImg.headers.get('cross-origin-resource-policy');
      const nosniffHeader = resImg.headers.get('x-content-type-options');

      if (resImg.status === 200 && corpHeader === 'cross-origin' && nosniffHeader === 'nosniff') {
        logPass('Kịch bản f1', 'GET /uploads/covers/:filename trả đúng ảnh với header nosniff và CORP: cross-origin');
      } else {
        logFail('Kịch bản f1', `Header ảnh không đạt: status=${resImg.status}, corp=${corpHeader}, nosniff=${nosniffHeader}`);
      }

      // f2: Tên file có "../" hoặc sai định dạng trả 404 (chống path traversal)
      const resTraversal = await apiRequest(baseUrl, '/uploads/covers/..%2F..%2Fapp.js');
      if (resTraversal.status === 404) {
        logPass('Kịch bản f2', 'Truy cập với "../" bị chặn 404 NOT_FOUND chống path traversal');
      } else {
        logFail('Kịch bản f2', `Kỳ vọng 404 nhưng nhận: ${resTraversal.status}`);
      }

      const resBadExt = await apiRequest(baseUrl, '/uploads/covers/something.exe');
      if (resBadExt.status === 404) {
        logPass('Kịch bản f3', 'Tên file sai định dạng/đuôi lạ trả 404 NOT_FOUND');
      } else {
        logFail('Kịch bản f3', `Kỳ vọng 404 nhưng nhận: ${resBadExt.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN G: Đổi SoQuyen nguyên tử & Concurrency Check
    // =========================================================================
    {
      // Tạo cuốn sách có SoQuyen = 10
      const formBookG = new FormData();
      formBookG.append('TenSach', 'TEST_Sach_QuyTac_Kho');
      formBookG.append('DonGia', '50000');
      formBookG.append('SoQuyen', '10');
      formBookG.append('MaNXB', testMaNXB);
      formBookG.append('NguonGocTacGia', 'Tác giả');

      const resG = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formBookG,
      });
      const bookGMa = resG.body?.data?.MaSach;

      // Giả lập 2 phiếu mượn đang giữ sách (1 DaDuyet, 1 DangMuon) -> dangGiu = 2
      // Cập nhật SoQuyenConLai từ 10 xuống 8
      await Sach.updateOne({ MaSach: bookGMa }, { $set: { SoQuyenConLai: 8 } });

      await TheoDoiMuonSach.create({
        MaDocGia: 'TEST_DG_001',
        MaSach: bookGMa,
        TrangThai: 'DaDuyet',
      });
      await TheoDoiMuonSach.create({
        MaDocGia: 'TEST_DG_002',
        MaSach: bookGMa,
        TrangThai: 'DangMuon',
      });

      // g1: Giảm SoQuyen xuống 1 (< dangGiu = 2) -> 409 INVALID_STATE
      const formReduceInvalid = new FormData();
      formReduceInvalid.append('TenSach', 'TEST_Sach_QuyTac_Kho');
      formReduceInvalid.append('DonGia', '50000');
      formReduceInvalid.append('SoQuyen', '1');
      formReduceInvalid.append('MaNXB', testMaNXB);
      formReduceInvalid.append('NguonGocTacGia', 'Tác giả');

      const resReduceInvalid = await apiRequest(baseUrl, `/api/admin/books/${bookGMa}`, {
        method: 'PUT',
        token: adminToken,
        formData: formReduceInvalid,
      });

      if (resReduceInvalid.status === 409 && resReduceInvalid.body?.error?.code === 'INVALID_STATE') {
        logPass('Kịch bản g1', `Giảm SoQuyen xuống dưới số đang giữ bị chặn với 409 INVALID_STATE: "${resReduceInvalid.body?.error?.message}"`);
      } else {
        logFail('Kịch bản g1', `Kỳ vọng 409 INVALID_STATE nhưng nhận: ${resReduceInvalid.status}`);
      }

      // g2: Tăng SoQuyen lên 15 -> SoQuyenConLai tự động thành 15 - 2 = 13
      const formIncrease = new FormData();
      formIncrease.append('TenSach', 'TEST_Sach_QuyTac_Kho');
      formIncrease.append('DonGia', '50000');
      formIncrease.append('SoQuyen', '15');
      formIncrease.append('MaNXB', testMaNXB);
      formIncrease.append('NguonGocTacGia', 'Tác giả');

      const resIncrease = await apiRequest(baseUrl, `/api/admin/books/${bookGMa}`, {
        method: 'PUT',
        token: adminToken,
        formData: formIncrease,
      });

      if (
        resIncrease.status === 200 &&
        resIncrease.body?.data?.SoQuyen === 15 &&
        resIncrease.body?.data?.SoQuyenConLai === 13
      ) {
        logPass('Kịch bản g2', 'Tăng SoQuyen lên 15 nguyên tử: SoQuyenConLai tự cập nhật đúng thành 13');
      } else {
        logFail('Kịch bản g2', `SoQuyenConLai sai sau khi tăng: ${JSON.stringify(resIncrease.body?.data)}`);
      }

      // g3: Concurrency test - 10 lần sửa SoQuyen song song và 1 lần giữ sách song song
      const concurrentPromises = [];
      // 10 yêu cầu sửa SoQuyen với các giá trị hợp lệ từ 10 đến 25
      for (let i = 0; i < 10; i++) {
        const targetSoQuyen = 10 + i;
        const f = new FormData();
        f.append('TenSach', 'TEST_Sach_QuyTac_Kho');
        f.append('DonGia', '50000');
        f.append('SoQuyen', String(targetSoQuyen));
        f.append('MaNXB', testMaNXB);
        f.append('NguonGocTacGia', 'Tác giả');

        concurrentPromises.push(
          apiRequest(baseUrl, `/api/admin/books/${bookGMa}`, {
            method: 'PUT',
            token: adminToken,
            formData: f,
          })
        );
      }

      // 1 tác vụ "giữ sách" song song nguyên tử
      concurrentPromises.push(
        Sach.findOneAndUpdate(
          { MaSach: bookGMa, SoQuyenConLai: { $gt: 0 } },
          { $inc: { SoQuyenConLai: -1 } }
        )
      );

      await Promise.all(concurrentPromises);

      // Kiểm tra bất biến sau khi hoàn tất: 0 <= SoQuyenConLai <= SoQuyen
      const bookAfterConcurrent = await Sach.findOne({ MaSach: bookGMa }).lean();
      if (
        bookAfterConcurrent &&
        bookAfterConcurrent.SoQuyenConLai >= 0 &&
        bookAfterConcurrent.SoQuyenConLai <= bookAfterConcurrent.SoQuyen
      ) {
        logPass(
          'Kịch bản g3',
          `Bất biến kho sách được đảm bảo tuyệt đối sau concurrency test: 0 <= SoQuyenConLai (${bookAfterConcurrent.SoQuyenConLai}) <= SoQuyen (${bookAfterConcurrent.SoQuyen})`
        );
      } else {
        logFail('Kịch bản g3', `Bất biến bị vi phạm: ${JSON.stringify(bookAfterConcurrent)}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN H: Xóa mềm sách (DaXoa = true, chặn khi có phiếu hoạt động, sửa sách đã xóa -> 404)
    // =========================================================================
    {
      // h1: Tạo sách không có phiếu hoạt động -> Xóa mềm thành công
      const formBookH = new FormData();
      formBookH.append('TenSach', 'TEST_Sach_Xoa_Mem');
      formBookH.append('DonGia', '50000');
      formBookH.append('SoQuyen', '5');
      formBookH.append('MaNXB', testMaNXB);
      formBookH.append('NguonGocTacGia', 'Tác giả');

      const resH = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formBookH,
      });
      const bookHMa = resH.body?.data?.MaSach;

      const resDelH = await apiRequest(baseUrl, `/api/admin/books/${bookHMa}`, {
        method: 'DELETE',
        token: adminToken,
      });

      const bookHInDb = await Sach.findOne({ MaSach: bookHMa }).lean();

      if (resDelH.status === 200 && bookHInDb && bookHInDb.DaXoa === true) {
        logPass('Kịch bản h1', 'Xóa mềm thành công: document vẫn còn và DaXoa = true');
      } else {
        logFail('Kịch bản h1', `Xóa mềm thất bại: ${JSON.stringify(resDelH.body)}`);
      }

      // h2: Danh sách mặc định không thấy sách đã xóa mềm; ?daXoa=true thấy
      const resListDefault = await apiRequest(baseUrl, `/api/admin/books?search=TEST_Sach_Xoa_Mem`, {
        token: adminToken,
      });
      const resListDeleted = await apiRequest(baseUrl, `/api/admin/books?search=TEST_Sach_Xoa_Mem&daXoa=true`, {
        token: adminToken,
      });

      const hiddenInDefault = !resListDefault.body?.data?.some((b) => b.MaSach === bookHMa);
      const visibleInDeleted = resListDeleted.body?.data?.some((b) => b.MaSach === bookHMa);

      if (hiddenInDefault && visibleInDeleted) {
        logPass('Kịch bản h2', 'Danh sách mặc định ẩn sách xóa mềm; ?daXoa=true hiển thị chính xác');
      } else {
        logFail('Kịch bản h2', `Lọc daXoa sai: hidden=${hiddenInDefault}, visible=${visibleInDeleted}`);
      }

      // h3: Sửa sách đã xóa mềm thì 404
      const formEditDeleted = new FormData();
      formEditDeleted.append('TenSach', 'TEST_Sach_Sua_Khi_Da_Xoa');
      formEditDeleted.append('DonGia', '50000');
      formEditDeleted.append('SoQuyen', '5');
      formEditDeleted.append('MaNXB', testMaNXB);
      formEditDeleted.append('NguonGocTacGia', 'Tác giả');

      const resEditDeleted = await apiRequest(baseUrl, `/api/admin/books/${bookHMa}`, {
        method: 'PUT',
        token: adminToken,
        formData: formEditDeleted,
      });

      if (resEditDeleted.status === 404) {
        logPass('Kịch bản h3', 'Sửa sách đã xóa mềm bị từ chối 404 NOT_FOUND');
      } else {
        logFail('Kịch bản h3', `Kỳ vọng 404 khi sửa sách xóa mềm nhưng nhận: ${resEditDeleted.status}`);
      }

      // h4: Xóa sách lần hai trên sách đã xóa mềm trả về 404
      const resDelAgain = await apiRequest(baseUrl, `/api/admin/books/${bookHMa}`, {
        method: 'DELETE',
        token: adminToken,
      });

      if (resDelAgain.status === 404) {
        logPass('Kịch bản h4', 'Xóa lần hai trên sách đã xóa mềm trả về 404 NOT_FOUND');
      } else {
        logFail('Kịch bản h4', `Kỳ vọng 404 khi xóa lần 2 nhưng nhận: ${resDelAgain.status}`);
      }

      // h5: Xóa sách có phiếu hoạt động (ChoDuyet) bị chặn 409 HAS_ACTIVE_BORROWINGS
      const formBookActive = new FormData();
      formBookActive.append('TenSach', 'TEST_Sach_Co_Phieu');
      formBookActive.append('DonGia', '50000');
      formBookActive.append('SoQuyen', '5');
      formBookActive.append('MaNXB', testMaNXB);
      formBookActive.append('NguonGocTacGia', 'Tác giả');

      const resBookActive = await apiRequest(baseUrl, '/api/admin/books', {
        method: 'POST',
        token: adminToken,
        formData: formBookActive,
      });
      const activeBookMa = resBookActive.body?.data?.MaSach;

      await TheoDoiMuonSach.create({
        MaDocGia: 'TEST_DG_001',
        MaSach: activeBookMa,
        TrangThai: 'ChoDuyet',
      });

      const resDelActive = await apiRequest(baseUrl, `/api/admin/books/${activeBookMa}`, {
        method: 'DELETE',
        token: adminToken,
      });

      if (resDelActive.status === 409 && resDelActive.body?.error?.code === 'HAS_ACTIVE_BORROWINGS') {
        logPass('Kịch bản h5', `Xóa sách có phiếu hoạt động bị chặn với 409 HAS_ACTIVE_BORROWINGS: "${resDelActive.body?.error?.message}"`);
      } else {
        logFail('Kịch bản h5', `Kỳ vọng 409 HAS_ACTIVE_BORROWINGS nhưng nhận ${resDelActive.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN I: Tìm kiếm, phân trang và sắp xếp an toàn
    // =========================================================================
    {
      // i1: Tìm kiếm với chuỗi ".*" an toàn, không khớp mọi thứ, không gây 500
      const resRegexSafe = await apiRequest(baseUrl, '/api/admin/books?search=' + encodeURIComponent('.*'), {
        token: adminToken,
      });
      if (resRegexSafe.status === 200 && Array.isArray(resRegexSafe.body?.data)) {
        logPass('Kịch bản i1', 'Tìm kiếm với chuỗi ".*" an toàn (đã escapeRegex)');
      } else {
        logFail('Kịch bản i1', `Tìm kiếm chuỗi ".*" thất bại: ${resRegexSafe.status}`);
      }

      // i2: Tìm kiếm với "(" không gây lỗi regex SyntaxError
      const resParen = await apiRequest(baseUrl, '/api/admin/books?search=' + encodeURIComponent('('), {
        token: adminToken,
      });
      if (resParen.status === 200 && Array.isArray(resParen.body?.data)) {
        logPass('Kịch bản i2', 'Tìm kiếm với ký tự "(" an toàn');
      } else {
        logFail('Kịch bản i2', `Tìm kiếm với "(" gây lỗi cú pháp: ${resParen.status}`);
      }

      // i3: search[$ne]=x không gây 500
      const resNoSql = await apiRequest(baseUrl, '/api/admin/books?search%5B%24ne%5D=x', {
        token: adminToken,
      });
      if (resNoSql.status === 400 || resNoSql.status === 200) {
        logPass('Kịch bản i3', 'Query search[$ne]=x được xử lý an toàn, không gây lỗi 500');
      } else {
        logFail('Kịch bản i3', `search[$ne]=x gây lỗi máy chủ: ${resNoSql.status}`);
      }

      // i4: limit > 100 bị chặn 400
      const resLimit = await apiRequest(baseUrl, '/api/admin/books?limit=150', {
        token: adminToken,
      });
      if (resLimit.status === 400 && resLimit.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản i4', 'Truy vấn limit > 100 bị chặn với 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản i4', `Kỳ vọng 400 khi limit=150 nhưng nhận ${resLimit.status}`);
      }

      // i5: sort ngoài whitelist bị từ chối 400
      const resBadSort = await apiRequest(baseUrl, '/api/admin/books?sort=MatKhau', {
        token: adminToken,
      });
      if (resBadSort.status === 400 && resBadSort.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản i5', 'Sắp xếp theo trường ngoài whitelist bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản i5', `Kỳ vọng 400 khi sort ngoài whitelist nhưng nhận ${resBadSort.status}`);
      }
    }

    // =========================================================================
    // KỊCH BẢN J: Ghi nhật ký đầy đủ cho các thao tác (THEM_SACH, SUA_SACH, XOA_SACH)
    // =========================================================================
    {
      const logThem = await NhatKy.findOne({
        HanhDong: 'THEM_SACH',
        DoiTuong: 'Sach',
        MSNV: 'TEST_NV_TT',
      });

      const logSua = await NhatKy.findOne({
        HanhDong: 'SUA_SACH',
        DoiTuong: 'Sach',
        MSNV: 'TEST_NV_TT',
      });

      const logXoa = await NhatKy.findOne({
        HanhDong: 'XOA_SACH',
        DoiTuong: 'Sach',
        MSNV: 'TEST_NV_ADM',
      });

      if (logThem && logSua && logXoa) {
        logPass('Kịch bản j', 'Cả 3 thao tác THEM_SACH, SUA_SACH, XOA_SACH đều được ghi NhatKy đầy đủ');
      } else {
        logFail(
          'Kịch bản j',
          `Thiếu bản ghi nhật ký: THEM=${Boolean(logThem)}, SUA=${Boolean(logSua)}, XOA=${Boolean(logXoa)}`
        );
      }
    }
  } catch (err) {
    console.error('[UNEXPECTED_ERROR] Lỗi không mong đợi trong quá trình test:', err);
    failedCount++;
  } finally {
    console.log('[CLEANUP] Đang dọn dẹp dữ liệu thử nghiệm (TEST_*) và file ảnh bìa...');
    try {
      await cleanupTestData();
      console.log('[CLEANUP] Dọn dẹp thành công.');
    } catch (cleanErr) {
      console.error('[CLEANUP_ERROR] Lỗi dọn dẹp:', cleanErr.message);
    }

    if (localServer) {
      await new Promise((resolve) => localServer.close(resolve));
      console.log('[INFO] Đã đóng server HTTP test.');
    }

    await disconnectDB();
  }

  console.log('\n--- KET QUA KIEM TRA ---');
  console.log(`TONG SO: ${passedCount + failedCount} | PASS: ${passedCount} | FAIL: ${failedCount}`);

  if (failedCount > 0) {
    console.error('Co it nhat mot kich ban FAIL. Vui long kiem tra lai.');
    process.exit(1);
  } else {
    console.log('Tat ca cac kich ban deu PASS!');
    process.exit(0);
  }
};

run();
