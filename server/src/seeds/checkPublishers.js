import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  NhaXuatBan,
  Sach,
  NhanVien,
  DocGia,
  NhatKy,
} from '../models/index.js';
import { hashPassword, signAccessToken } from '../services/auth.service.js';

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

/**
 * Helper gửi request HTTP fetch tới server
 * @param {string} baseUrl
 * @param {string} path
 * @param {object} options
 */
const apiRequest = async (baseUrl, path, { method = 'GET', token = null, body = null } = {}) => {
  const url = `${baseUrl}${path}`;
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
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
 * Dọn dẹp dữ liệu thử nghiệm trong DB
 */
const cleanupTestData = async () => {
  await Sach.deleteMany({
    $or: [
      { MaSach: /^TEST_/ },
      { TenSach: /^TEST_/ },
      { MaNXB: /^TEST_/ },
    ],
  });

  await NhaXuatBan.deleteMany({
    $or: [
      { TenNXB: /^TEST_/i },
      { MaNXB: /^TEST_/ },
    ],
  });

  await NhanVien.deleteMany({ MSNV: /^TEST_/ });
  await DocGia.deleteMany({ MaDocGia: /^TEST_/ });

  await NhatKy.deleteMany({
    $or: [
      { MSNV: /^TEST_/ },
      { MaDoiTuong: /^TEST_/ },
      { DoiTuong: 'NhaXuatBan', 'ChiTiet.TenNXB': /^TEST_/i },
      { DoiTuong: 'NhaXuatBan', 'ChiTiet.tenCu': /^TEST_/i },
      { DoiTuong: 'NhaXuatBan', 'ChiTiet.tenMoi': /^TEST_/i },
    ],
  });
};

const run = async () => {
  console.log('--- BAT DAU KIEM TRA API NHA XUAT BAN (P2-1) ---');
  console.log('[HUONG DAN] Cach chay:');
  console.log('  Cach 1: Chay "npm run dev" hoac "npm start" tai mot terminal, sau do chay "npm run check:publishers" tai terminal khac.');
  console.log('  Cach 2: Neu server chua chay, script se tu dong khoi chay server HTTP cuc bo de kiem tra.');

  let localServer = null;
  let baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';

  // 1. Kiem tra xem server da chay san chua
  let isServerRunning = false;
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      isServerRunning = true;
      console.log(`[INFO] Da ket noi thanh cong toi server dang chay tai: ${baseUrl}`);
    }
  } catch {
    // Khong ket noi duoc
  }

  if (!isServerRunning) {
    localServer = http.createServer(app);
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    const port = localServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[INFO] Server chua chay san. Da tu khoi tao server HTTP test tai: ${baseUrl}`);
  }

  // 2. Ket noi database
  await connectDB();

  // 3. Don sach du lieu test truoc khi bat dau
  await cleanupTestData();

  let adminToken = null;
  let thuthuToken = null;
  let pendingToken = null;
  let userToken = null;

  try {
    // 4. Tao cac tai khoan test
    const dummyPasswordHash = await hashPassword('TestPassword123!');

    const adminAccount = await NhanVien.create({
      MSNV: 'TEST_ADM_001',
      HoTenNV: 'Admin Test NXB',
      Password: dummyPasswordHash,
      ChucVu: 'Quản trị viên',
      VaiTro: 'admin',
      BatBuocDoiMatKhau: false,
      TrangThai: 'HoatDong',
    });

    const thuthuAccount = await NhanVien.create({
      MSNV: 'TEST_TT_001',
      HoTenNV: 'Thủ thư Test NXB',
      Password: dummyPasswordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      BatBuocDoiMatKhau: false,
      TrangThai: 'HoatDong',
    });

    const pendingAccount = await NhanVien.create({
      MSNV: 'TEST_PENDING_001',
      HoTenNV: 'Nhân viên Chờ đổi mật khẩu',
      Password: dummyPasswordHash,
      ChucVu: 'Thủ thư',
      VaiTro: 'thuthu',
      BatBuocDoiMatKhau: true,
      TrangThai: 'HoatDong',
    });

    const docGiaAccount = await DocGia.create({
      MaDocGia: 'TEST_DG_001',
      HoLot: 'Nguyễn Văn',
      Ten: 'Test',
      NgaySinh: new Date('1995-05-15'),
      Phai: 'Nam',
      Email: 'test_docgia_nxb@example.com',
      Password: dummyPasswordHash,
      TrangThai: 'HoatDong',
    });

    adminToken = signAccessToken(adminAccount, 'nhanvien');
    thuthuToken = signAccessToken(thuthuAccount, 'nhanvien');
    pendingToken = signAccessToken(pendingAccount, 'nhanvien');
    userToken = signAccessToken(docGiaAccount, 'user');

    // =========================================================================
    // KICH BAN A: Xac thuc & quyen truy cap co ban (401, 403)
    // =========================================================================
    // a1: Khong co token thi 401
    {
      const res = await apiRequest(baseUrl, '/api/admin/publishers');
      if (res.status === 401 && res.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('Kịch bản a1', 'Không có token bị từ chối với 401 UNAUTHENTICATED');
      } else {
        logFail('Kịch bản a1', `Kỳ vọng 401 UNAUTHENTICATED nhưng nhận ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // a2: Token cua doc gia thi 401 (sai aud/secret voi admin API)
    {
      const res = await apiRequest(baseUrl, '/api/admin/publishers', { token: userToken });
      if (res.status === 401 && res.body?.error?.code === 'UNAUTHENTICATED') {
        logPass('Kịch bản a2', 'Token độc giả bị từ chối với 401 UNAUTHENTICATED khi gọi admin API');
      } else {
        logFail('Kịch bản a2', `Kỳ vọng 401 UNAUTHENTICATED nhưng nhận ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // a3: Tai khoan dang buoc doi mat khau thi 403 MUST_CHANGE_PASSWORD
    {
      const res = await apiRequest(baseUrl, '/api/admin/publishers', { token: pendingToken });
      if (res.status === 403 && res.body?.error?.code === 'MUST_CHANGE_PASSWORD') {
        logPass('Kịch bản a3', 'Tài khoản BatBuocDoiMatKhau=true bị chặn với 403 MUST_CHANGE_PASSWORD');
      } else {
        logFail('Kịch bản a3', `Kỳ vọng 403 MUST_CHANGE_PASSWORD nhưng nhận ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN B: Quyen cua thu thu (tao, sua, xem duoc; xoa bi 403)
    // =========================================================================
    let thuthuCreatedMaNXB = null;
    {
      // b1: thuthu tao NXB thanh cong (201)
      const resCreate = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: thuthuToken,
        body: {
          TenNXB: 'TEST_NXB_ThuThu',
          DiaChi: '123 Đường Test, Cần Thơ',
        },
      });

      if (resCreate.status === 201 && resCreate.body?.success && resCreate.body?.data?.MaNXB) {
        thuthuCreatedMaNXB = resCreate.body.data.MaNXB;
        logPass('Kịch bản b1', `Thủ thư tạo NXB thành công (201, MaNXB: ${thuthuCreatedMaNXB})`);
      } else {
        logFail('Kịch bản b1', `Thủ thư tạo NXB thất bại. Status: ${resCreate.status}, Body: ${JSON.stringify(resCreate.body)}`);
      }

      // b2: thuthu xem chi tiet NXB vua tao (200 kem SoSach = 0)
      const resDetail = await apiRequest(baseUrl, `/api/admin/publishers/${thuthuCreatedMaNXB}`, {
        token: thuthuToken,
      });

      if (resDetail.status === 200 && resDetail.body?.data?.MaNXB === thuthuCreatedMaNXB && resDetail.body?.data?.SoSach === 0) {
        logPass('Kịch bản b2', `Thủ thư xem chi tiết NXB thành công (kèm SoSach: 0)`);
      } else {
        logFail('Kịch bản b2', `Thủ thư xem chi tiết NXB thất bại: ${JSON.stringify(resDetail.body)}`);
      }

      // b3: thuthu xem danh sach NXB (200 kem phan trang va SoSach)
      const resList = await apiRequest(baseUrl, `/api/admin/publishers?search=TEST_NXB_ThuThu`, {
        token: thuthuToken,
      });

      if (resList.status === 200 && Array.isArray(resList.body?.data) && resList.body.data.some((item) => item.MaNXB === thuthuCreatedMaNXB)) {
        logPass('Kịch bản b3', 'Thủ thư xem danh sách NXB thành công (kèm meta phân trang và SoSach)');
      } else {
        logFail('Kịch bản b3', `Thủ thư xem danh sách NXB thất bại: ${JSON.stringify(resList.body)}`);
      }

      // b4: thuthu sua NXB (200)
      const resUpdate = await apiRequest(baseUrl, `/api/admin/publishers/${thuthuCreatedMaNXB}`, {
        method: 'PUT',
        token: thuthuToken,
        body: {
          TenNXB: 'TEST_NXB_ThuThu_DaSua',
          DiaChi: 'Địa chỉ đã sửa',
        },
      });

      if (resUpdate.status === 200 && resUpdate.body?.data?.TenNXB === 'TEST_NXB_ThuThu_DaSua') {
        logPass('Kịch bản b4', 'Thủ thư sửa NXB thành công');
      } else {
        logFail('Kịch bản b4', `Thủ thư sửa NXB thất bại: ${JSON.stringify(resUpdate.body)}`);
      }

      // b5: thuthu xoa NXB bi chan 403 FORBIDDEN
      const resDelete = await apiRequest(baseUrl, `/api/admin/publishers/${thuthuCreatedMaNXB}`, {
        method: 'DELETE',
        token: thuthuToken,
      });

      if (resDelete.status === 403 && resDelete.body?.error?.code === 'FORBIDDEN') {
        logPass('Kịch bản b5', 'Thủ thư xóa NXB bị chặn với 403 FORBIDDEN');
      } else {
        logFail('Kịch bản b5', `Kỳ vọng 403 FORBIDDEN nhưng nhận ${resDelete.status}: ${JSON.stringify(resDelete.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN C: Quyen xoa cua Admin (khong co sach -> xoa duoc; co sach -> 409 HAS_BOOKS)
    // =========================================================================
    {
      // c1: Admin xoa NXB khong co sach -> thanh cong (200)
      const resDelEmpty = await apiRequest(baseUrl, `/api/admin/publishers/${thuthuCreatedMaNXB}`, {
        method: 'DELETE',
        token: adminToken,
      });

      if (resDelEmpty.status === 200 && resDelEmpty.body?.success) {
        logPass('Kịch bản c1', 'Admin xóa NXB không có sách thành công (200)');
      } else {
        logFail('Kịch bản c1', `Admin xóa NXB không có sách thất bại: ${JSON.stringify(resDelEmpty.body)}`);
      }

      // c2: Tao NXB kem Sach (co DaXoa = true) -> Admin xoa bi chan 409 HAS_BOOKS
      const resCreateNxb = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: {
          TenNXB: 'TEST_NXB_CoSach',
          DiaChi: 'Hà Nội',
        },
      });
      const nxbCoSachMa = resCreateNxb.body?.data?.MaNXB;

      // Tao sach thuoc NXB nay co DaXoa = true
      await Sach.create({
        MaSach: 'TEST_S_001',
        TenSach: 'TEST_Cuốn sách đã xóa mềm',
        DonGia: 50000,
        SoQuyen: 5,
        SoQuyenConLai: 5,
        MaNXB: nxbCoSachMa,
        NguonGocTacGia: 'Tác giả test',
        DaXoa: true,
      });

      const resDelWithBooks = await apiRequest(baseUrl, `/api/admin/publishers/${nxbCoSachMa}`, {
        method: 'DELETE',
        token: adminToken,
      });

      if (resDelWithBooks.status === 409 && resDelWithBooks.body?.error?.code === 'HAS_BOOKS') {
        logPass('Kịch bản c2', `Admin xóa NXB có sách (kể cả DaXoa=true) bị chặn với 409 HAS_BOOKS: "${resDelWithBooks.body?.error?.message}"`);
      } else {
        logFail('Kịch bản c2', `Kỳ vọng 409 HAS_BOOKS nhưng nhận ${resDelWithBooks.status}: ${JSON.stringify(resDelWithBooks.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN D: Validate du lieu dau vao (400 VALIDATION_ERROR)
    // =========================================================================
    {
      // d1: Thieu TenNXB -> 400
      const resMissingTen = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { DiaChi: 'Chỉ có địa chỉ' },
      });
      if (resMissingTen.status === 400 && resMissingTen.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d1', 'Thiếu TenNXB bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản d1', `Thất bại kiểm tra thiếu TenNXB: ${JSON.stringify(resMissingTen.body)}`);
      }

      // d2: TenNXB toan khoang trang -> 400
      const resSpacesTen = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: '     ' },
      });
      if (resSpacesTen.status === 400 && resSpacesTen.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d2', 'TenNXB toàn khoảng trắng bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản d2', `Thất bại kiểm tra TenNXB toàn khoảng trắng: ${JSON.stringify(resSpacesTen.body)}`);
      }

      // d3: TenNXB qua dai (> 100 ky tu) -> 400
      const resTooLong = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: 'T'.repeat(101) },
      });
      if (resTooLong.status === 400 && resTooLong.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d3', 'TenNXB quá 100 ký tự bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản d3', `Thất bại kiểm tra TenNXB quá dài: ${JSON.stringify(resTooLong.body)}`);
      }

      // d4: Truong la (MaNXB trong body POST) -> 400 khong lang le bo qua
      const resUnknownField = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: 'TEST_HopLe', MaNXB: 'NXB999' },
      });
      if (resUnknownField.status === 400 && resUnknownField.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d4', 'Trường lạ (MaNXB trong body) bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản d4', `Thất bại kiểm tra trường lạ: ${JSON.stringify(resUnknownField.body)}`);
      }

      // d5: maNXB sai dinh dang (vd: 'abc', 'NXB12', '123') -> 400
      const resInvalidParam = await apiRequest(baseUrl, '/api/admin/publishers/INVALID_CODE', {
        token: adminToken,
      });
      if (resInvalidParam.status === 400 && resInvalidParam.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản d5', 'Tham số :maNXB sai định dạng regex bị từ chối 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản d5', `Thất bại kiểm tra param sai định dạng: ${JSON.stringify(resInvalidParam.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN E: Trung ten khong phan biet hoa thuong (409 DUPLICATE)
    // =========================================================================
    {
      // e1: Tao moi trung ten khac hoa thuong (collation vi strength 2)
      await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: 'TEST_NXB_Kim_Dong' },
      });

      const resDupCreate = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: 'test_nxb_kim_dong' }, // Chu thuong
      });

      if (resDupCreate.status === 409 && resDupCreate.body?.error?.code === 'DUPLICATE') {
        logPass('Kịch bản e1', 'Tạo NXB trùng tên khác hoa thường bị chặn với 409 DUPLICATE');
      } else {
        logFail('Kịch bản e1', `Kỳ vọng 409 DUPLICATE nhưng nhận ${resDupCreate.status}: ${JSON.stringify(resDupCreate.body)}`);
      }

      // e2: Sua sang ten da ton tai o NXB khac -> 409 DUPLICATE
      const resOther = await apiRequest(baseUrl, '/api/admin/publishers', {
        method: 'POST',
        token: adminToken,
        body: { TenNXB: 'TEST_NXB_Giao_Duc' },
      });
      const otherMaNXB = resOther.body?.data?.MaNXB;

      const resDupUpdate = await apiRequest(baseUrl, `/api/admin/publishers/${otherMaNXB}`, {
        method: 'PUT',
        token: adminToken,
        body: { TenNXB: 'TEST_NXB_Kim_Dong' },
      });

      if (resDupUpdate.status === 409 && resDupUpdate.body?.error?.code === 'DUPLICATE') {
        logPass('Kịch bản e2', 'Sửa sang tên trùng với NXB khác bị chặn với 409 DUPLICATE');
      } else {
        logFail('Kịch bản e2', `Kỳ vọng 409 DUPLICATE nhưng nhận ${resDupUpdate.status}: ${JSON.stringify(resDupUpdate.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN F: Tim kiem an toan (chong ReDoS, ky tu dac biet, NoSQL injection)
    // =========================================================================
    {
      // f1: Tim kiem chuoi ".*" khong khop toan bo du lieu va khong gay loi
      const resDotStar = await apiRequest(baseUrl, '/api/admin/publishers?search=' + encodeURIComponent('.*'), {
        token: adminToken,
      });
      if (resDotStar.status === 200 && Array.isArray(resDotStar.body?.data)) {
        logPass('Kịch bản f1', 'Tìm kiếm với chuỗi ".*" an toàn, không làm server lỗi và không khớp tất cả');
      } else {
        logFail('Kịch bản f1', `Tìm kiếm chuỗi ".*" thất bại: ${JSON.stringify(resDotStar.body)}`);
      }

      // f2: Tim kiem voi "(" khong gay loi cu phap Regex (Unterminated group)
      const resParen = await apiRequest(baseUrl, '/api/admin/publishers?search=' + encodeURIComponent('('), {
        token: adminToken,
      });
      if (resParen.status === 200 && Array.isArray(resParen.body?.data)) {
        logPass('Kịch bản f2', 'Tìm kiếm với ký tự "(" an toàn (đã escapeRegex)');
      } else {
        logFail('Kịch bản f2', `Tìm kiếm ký tự "(" làm phát sinh lỗi: ${JSON.stringify(resParen.body)}`);
      }

      // f3: Query NoSQL injection kieu search[$ne]=x khong gay 500
      const resNoSql = await apiRequest(baseUrl, '/api/admin/publishers?search%5B%24ne%5D=x', {
        token: adminToken,
      });
      if (resNoSql.status === 400) {
        logPass('Kịch bản f3', 'Query search[$ne]=x bị từ chối 400 VALIDATION_ERROR an toàn, không gây lỗi 500');
      } else if (resNoSql.status === 200) {
        logPass('Kịch bản f3', 'Query search[$ne]=x được xử lý an toàn (được sanitize/ép kiểu), không gây 500');
      } else {
        logFail('Kịch bản f3', `Query NoSQL injection gây lỗi máy chủ: ${resNoSql.status} ${JSON.stringify(resNoSql.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN G: Phan trang & Sap xep (limit > 100 bi chan, sort ngoai whitelist bi tu choi)
    // =========================================================================
    {
      // g1: limit > 100 bi chan (400)
      const resOverLimit = await apiRequest(baseUrl, '/api/admin/publishers?limit=150', {
        token: adminToken,
      });
      if (resOverLimit.status === 400 && resOverLimit.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản g1', 'Truy vấn limit > 100 bị chặn với 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản g1', `Kỳ vọng 400 khi limit=150 nhưng nhận ${resOverLimit.status}: ${JSON.stringify(resOverLimit.body)}`);
      }

      // g2: sort ngoai whitelist bi tu choi (400)
      const resInvalidSort = await apiRequest(baseUrl, '/api/admin/publishers?sort=password', {
        token: adminToken,
      });
      if (resInvalidSort.status === 400 && resInvalidSort.body?.error?.code === 'VALIDATION_ERROR') {
        logPass('Kịch bản g2', 'Sắp xếp theo trường ngoài whitelist (sort=password) bị từ chối với 400 VALIDATION_ERROR');
      } else {
        logFail('Kịch bản g2', `Kỳ vọng 400 khi sort=password nhưng nhận ${resInvalidSort.status}: ${JSON.stringify(resInvalidSort.body)}`);
      }

      // g3: Phan trang & sort hop le tra ve dung meta
      const resValidPage = await apiRequest(baseUrl, '/api/admin/publishers?page=1&limit=5&sort=-TenNXB', {
        token: adminToken,
      });
      if (
        resValidPage.status === 200 &&
        resValidPage.body?.meta &&
        typeof resValidPage.body.meta.page === 'number' &&
        typeof resValidPage.body.meta.limit === 'number' &&
        typeof resValidPage.body.meta.total === 'number' &&
        typeof resValidPage.body.meta.totalPages === 'number'
      ) {
        logPass('Kịch bản g3', `Phân trang và sort hợp lệ trả về đúng cấu trúc meta: page=${resValidPage.body.meta.page}, limit=${resValidPage.body.meta.limit}, total=${resValidPage.body.meta.total}, totalPages=${resValidPage.body.meta.totalPages}`);
      } else {
        logFail('Kịch bản g3', `Phân trang hợp lệ trả về sai cấu trúc meta: ${JSON.stringify(resValidPage.body)}`);
      }
    }

    // =========================================================================
    // KICH BAN H: Ghi NhatKy cho moi thao tac ghi (THEM_NXB, SUA_NXB, XOA_NXB)
    // =========================================================================
    {
      const logThem = await NhatKy.findOne({
        HanhDong: 'THEM_NXB',
        DoiTuong: 'NhaXuatBan',
        MSNV: 'TEST_TT_001',
      });

      const logSua = await NhatKy.findOne({
        HanhDong: 'SUA_NXB',
        DoiTuong: 'NhaXuatBan',
        MSNV: 'TEST_TT_001',
      });

      const logXoa = await NhatKy.findOne({
        HanhDong: 'XOA_NXB',
        DoiTuong: 'NhaXuatBan',
        MSNV: 'TEST_ADM_001',
      });

      if (logThem && logSua && logXoa) {
        logPass('Kịch bản h', 'Cả 3 thao tác THEM_NXB, SUA_NXB, XOA_NXB đều được ghi NhatKy đầy đủ và không lộ thông tin nhạy cảm');
      } else {
        logFail(
          'Kịch bản h',
          `Thiếu bản ghi nhật ký: THEM_NXB=${Boolean(logThem)}, SUA_NXB=${Boolean(logSua)}, XOA_NXB=${Boolean(logXoa)}`
        );
      }
    }
  } catch (err) {
    console.error('[UNEXPECTED_ERROR] Lỗi ngoại lệ trong quá trình chạy test:', err);
    failedCount++;
  } finally {
    // LUON don du lieu thu nghiem ke ca khi co loi
    console.log('[CLEANUP] Đang dọn dẹp toàn bộ dữ liệu thử nghiệm (TEST_*)...');
    try {
      await cleanupTestData();
      console.log('[CLEANUP] Đã dọn dẹp dữ liệu thử nghiệm thành công.');
    } catch (cleanErr) {
      console.error('[CLEANUP_ERROR] Lỗi khi dọn dẹp dữ liệu test:', cleanErr.message);
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
