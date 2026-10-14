import http from 'http';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import { Sach, NhaXuatBan } from '../models/index.js';

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
 * Helper gửi HTTP request tới server test
 */
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
          data: json,
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

const runTests = async () => {
  console.log('=== BẮT ĐẦU KIỂM THỬ P2-4: API USER SÁCH & NXB ===\n');

  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Chuẩn bị dữ liệu mẫu phục vụ test
    const testNXB1 = await NhaXuatBan.findOneAndUpdate(
      { MaNXB: 'NXB901' },
      {
        MaNXB: 'NXB901',
        TenNXB: 'NXB Test User Alpha',
        DiaChi: '123 Đường Test, Cần Thơ',
      },
      { upsert: true, new: true }
    );

    const testNXB2 = await NhaXuatBan.findOneAndUpdate(
      { MaNXB: 'NXB902' },
      {
        MaNXB: 'NXB902',
        TenNXB: 'NXB Test User Beta',
        DiaChi: '456 Đường Sách, TP.HCM',
      },
      { upsert: true, new: true }
    );

    // Tạo sách còn trong kho
    await Sach.findOneAndUpdate(
      { MaSach: 'S9901' },
      {
        MaSach: 'S9901',
        TenSach: 'Lập Trình Web Hiện Đại Với Nodejs',
        DonGia: 120000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        NamXuatBan: 2024,
        MaNXB: 'NXB901',
        NguonGocTacGia: 'Nguyễn Văn Test',
        TheLoai: 'Công nghệ thông tin',
        MoTa: 'Sách hướng dẫn lập trình web toàn diện.',
        DaXoa: false,
      },
      { upsert: true, new: true }
    );

    // Tạo sách hết kho (SoQuyenConLai = 0)
    await Sach.findOneAndUpdate(
      { MaSach: 'S9902' },
      {
        MaSach: 'S9902',
        TenSach: 'Cấu Trúc Dữ Liệu Nâng Cao',
        DonGia: 85000,
        SoQuyen: 5,
        SoQuyenConLai: 0,
        NamXuatBan: 2022,
        MaNXB: 'NXB902',
        NguonGocTacGia: 'Trần Thị Khoa Học',
        TheLoai: 'Giáo trình',
        MoTa: 'Tài liệu cấu trúc dữ liệu cho sinh viên.',
        DaXoa: false,
      },
      { upsert: true, new: true }
    );

    // Tạo sách đã bị xóa mềm (DaXoa = true)
    await Sach.findOneAndUpdate(
      { MaSach: 'S9903' },
      {
        MaSach: 'S9903',
        TenSach: 'Sách Đã Bị Xóa Mềm Bí Mật',
        DonGia: 50000,
        SoQuyen: 10,
        SoQuyenConLai: 10,
        NamXuatBan: 2020,
        MaNXB: 'NXB901',
        NguonGocTacGia: 'Tác Giả Ẩn Danh',
        TheLoai: 'Lịch sử',
        MoTa: 'Cuốn sách này đã bị xóa mềm.',
        DaXoa: true,
      },
      { upsert: true, new: true }
    );

    // --- TEST SUITE 1: GET /api/user/books (Danh sách sách công khai) ---
    console.log('--- TEST SUITE 1: GET /api/user/books ---');

    // Test 1.1: Lấy danh sách mặc định thành công, không cần token
    {
      const res = await request(server, { path: '/api/user/books' });
      if (res.status === 200 && res.data.success && Array.isArray(res.data.data)) {
        logPass('Test 1.1: GET /api/user/books công khai thành công (200)');
      } else {
        logFail('Test 1.1: GET /api/user/books thất bại', res.data);
      }
    }

    // Test 1.2: Đảm bảo tuyệt đối KHÔNG có sách đã xóa mềm (DaXoa = true)
    {
      const res = await request(server, { path: '/api/user/books?limit=100' });
      const hasDeleted = res.data.data?.some((b) => b.MaSach === 'S9903' || b.DaXoa === true);
      if (res.status === 200 && !hasDeleted) {
        logPass('Test 1.2: Danh sách sách user loại trừ 100% sách đã xóa mềm');
      } else {
        logFail('Test 1.2: Vẫn xuất hiện sách xóa mềm trong danh sách user', res.data);
      }
    }

    // Test 1.3: Cấu trúc bản ghi trả về có TenNXB và conSach
    {
      const res = await request(server, { path: '/api/user/books?search=S9901' });
      const book = res.data.data?.[0];
      if (
        res.status === 200 &&
        book &&
        book.TenNXB === 'NXB Test User Alpha' &&
        book.conSach === true &&
        book.SoQuyenConLai === 5
      ) {
        logPass('Test 1.3: Bản ghi sách có TenNXB gộp và cờ conSach: true');
      } else {
        logFail('Test 1.3: Thiếu hoặc sai TenNXB/conSach', book);
      }
    }

    // Test 1.4: Tìm kiếm theo tên sách (không phân biệt hoa thường)
    {
      const res = await request(server, {
        path: `/api/user/books?search=${encodeURIComponent('lập trình web')}`,
      });
      const found = res.data.data?.some((b) => b.MaSach === 'S9901');
      if (res.status === 200 && found) {
        logPass('Test 1.4: Tìm kiếm theo TenSach thành công');
      } else {
        logFail('Test 1.4: Không tìm thấy sách theo tên', res.data);
      }
    }

    // Test 1.5: Tìm kiếm theo tác giả
    {
      const res = await request(server, {
        path: `/api/user/books?search=${encodeURIComponent('Nguyễn Văn Test')}`,
      });
      const found = res.data.data?.some((b) => b.MaSach === 'S9901');
      if (res.status === 200 && found) {
        logPass('Test 1.5: Tìm kiếm theo NguonGocTacGia thành công');
      } else {
        logFail('Test 1.5: Không tìm thấy sách theo tác giả', res.data);
      }
    }

    // Test 1.6: An toàn với ký tự đặc biệt Regex (chống ReDoS / regex crash)
    {
      const res = await request(server, {
        path: `/api/user/books?search=${encodeURIComponent('([*+?^${}|])')}`,
      });
      if (res.status === 200 && res.data.success) {
        logPass('Test 1.6: escapeRegex an toàn với ký tự đặc biệt');
      } else {
        logFail('Test 1.6: Lỗi khi tìm kiếm với ký tự regex', res.data);
      }
    }

    // Test 1.7: Lọc theo maNXB
    {
      const res = await request(server, { path: '/api/user/books?maNXB=NXB902' });
      const allMatch = res.data.data?.every((b) => b.MaNXB === 'NXB902');
      const hasBook2 = res.data.data?.some((b) => b.MaSach === 'S9902');
      if (res.status === 200 && allMatch && hasBook2) {
        logPass('Test 1.7: Lọc theo maNXB chính xác');
      } else {
        logFail('Test 1.7: Lọc theo maNXB thất bại', res.data);
      }
    }

    // Test 1.8: Lọc theo namXuatBan
    {
      const res = await request(server, { path: '/api/user/books?namXuatBan=2024' });
      const allMatch = res.data.data?.every((b) => b.NamXuatBan === 2024);
      if (res.status === 200 && allMatch) {
        logPass('Test 1.8: Lọc theo namXuatBan chính xác');
      } else {
        logFail('Test 1.8: Lọc theo namXuatBan thất bại', res.data);
      }
    }

    // Test 1.9: Lọc theo theLoai
    {
      const res = await request(server, {
        path: `/api/user/books?theLoai=${encodeURIComponent('Công nghệ thông tin')}`,
      });
      const allMatch = res.data.data?.every((b) => b.TheLoai === 'Công nghệ thông tin');
      if (res.status === 200 && allMatch && res.data.data.length > 0) {
        logPass('Test 1.9: Lọc theo theLoai chính xác');
      } else {
        logFail('Test 1.9: Lọc theo theLoai thất bại', res.data);
      }
    }

    // Test 1.10: Lọc theo conSach=true (chỉ lấy sách có SoQuyenConLai > 0)
    {
      const res = await request(server, { path: '/api/user/books?conSach=true&limit=100' });
      const allAvailable = res.data.data?.every((b) => b.SoQuyenConLai > 0 && b.conSach === true);
      const hasOutOfStock = res.data.data?.some((b) => b.MaSach === 'S9902'); // S9902 có SoQuyenConLai = 0
      if (res.status === 200 && allAvailable && !hasOutOfStock) {
        logPass('Test 1.10: Lọc conSach=true loại bỏ hoàn toàn sách hết kho (SoQuyenConLai = 0)');
      } else {
        logFail('Test 1.10: Sách hết kho vẫn xuất hiện khi lọc conSach=true', res.data);
      }
    }

    // Test 1.11: Sắp xếp theo DonGia tăng dần
    {
      const res = await request(server, { path: '/api/user/books?sort=DonGia&limit=10' });
      const prices = res.data.data?.map((b) => b.DonGia);
      let isSorted = true;
      for (let i = 0; i < prices.length - 1; i++) {
        if (prices[i] > prices[i + 1]) {
          isSorted = false;
          break;
        }
      }
      if (res.status === 200 && isSorted && prices.length > 0) {
        logPass('Test 1.11: Sắp xếp theo DonGia tăng dần chuẩn xác');
      } else {
        logFail('Test 1.11: Sắp xếp DonGia sai thứ tự', prices);
      }
    }

    // Test 1.12: Phân trang page và limit
    {
      const res = await request(server, { path: '/api/user/books?page=1&limit=2' });
      if (
        res.status === 200 &&
        res.data.data?.length <= 2 &&
        res.data.meta?.page === 1 &&
        res.data.meta?.limit === 2 &&
        res.data.meta?.totalPages >= 1
      ) {
        logPass('Test 1.12: Phân trang page và limit đúng quy cách');
      } else {
        logFail('Test 1.12: Phân trang không đúng meta', res.data);
      }
    }

    // Test 1.13: Validate chặn limit > 100
    {
      const res = await request(server, { path: '/api/user/books?limit=101' });
      if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
        logPass('Test 1.13: Chặn limit > 100 với lỗi 400 VALIDATION_ERROR');
      } else {
        logFail('Test 1.13: Không chặn limit > 100', res.data);
      }
    }

    // Test 1.14: Validate chặn sort không thuộc whitelist
    {
      const res = await request(server, { path: '/api/user/books?sort=Password' });
      if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
        logPass('Test 1.14: Chặn sort ngoài whitelist với lỗi 400 VALIDATION_ERROR');
      } else {
        logFail('Test 1.14: Không chặn trường sort không hợp lệ', res.data);
      }
    }

    // Test 1.15: Validate chặn trường lạ (allowUnknown: false)
    {
      const res = await request(server, { path: '/api/user/books?hackField=123' });
      if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
        logPass('Test 1.15: Chặn tham số query lạ (allowUnknown: false)');
      } else {
        logFail('Test 1.15: Không chặn tham số lạ', res.data);
      }
    }

    // --- TEST SUITE 2: GET /api/user/books/:maSach (Chi tiết sách) ---
    console.log('\n--- TEST SUITE 2: GET /api/user/books/:maSach ---');

    // Test 2.1: Lấy chi tiết sách thành công kèm thông tin NXB
    {
      const res = await request(server, { path: '/api/user/books/S9901' });
      const book = res.data.data;
      if (
        res.status === 200 &&
        res.data.success &&
        book?.MaSach === 'S9901' &&
        book?.TenNXB === 'NXB Test User Alpha' &&
        book?.NhaXuatBan?.MaNXB === 'NXB901' &&
        book?.conSach === true
      ) {
        logPass('Test 2.1: GET /api/user/books/S9901 thành công kèm chi tiết NXB');
      } else {
        logFail('Test 2.1: Chi tiết sách không khớp yêu cầu', res.data);
      }
    }

    // Test 2.2: Không tìm thấy sách (mã không tồn tại) -> 404 NOT_FOUND
    {
      const res = await request(server, { path: '/api/user/books/S9999' });
      if (res.status === 404 && res.data.error?.code === 'NOT_FOUND') {
        logPass('Test 2.2: Sách không tồn tại trả về 404 NOT_FOUND');
      } else {
        logFail('Test 2.2: Không trả về 404 khi sách không tồn tại', res.data);
      }
    }

    // Test 2.3: Sách đã xóa mềm (DaXoa = true) -> MUST trả về 404 NOT_FOUND
    {
      const res = await request(server, { path: '/api/user/books/S9903' });
      if (res.status === 404 && res.data.error?.code === 'NOT_FOUND') {
        logPass('Test 2.3: Sách đã xóa mềm (S9903) bị chặn trả về 404 NOT_FOUND');
      } else {
        logFail('Test 2.3: Sách đã xóa mềm vẫn xem được ở user API', res.data);
      }
    }

    // Test 2.4: Validate param :maSach sai định dạng regex -> 400 VALIDATION_ERROR
    {
      const res = await request(server, { path: '/api/user/books/invalid-code' });
      if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
        logPass('Test 2.4: Param :maSach sai định dạng trả về 400 VALIDATION_ERROR');
      } else {
        logFail('Test 2.4: Không validate định dạng param :maSach', res.data);
      }
    }

    // --- TEST SUITE 3: GET /api/user/publishers (Danh sách NXB cho bộ lọc) ---
    console.log('\n--- TEST SUITE 3: GET /api/user/publishers ---');

    // Test 3.1: Lấy danh sách NXB công khai thành công
    {
      const res = await request(server, { path: '/api/user/publishers' });
      if (res.status === 200 && res.data.success && Array.isArray(res.data.data)) {
        const hasNXB1 = res.data.data.some((p) => p.MaNXB === 'NXB901');
        const hasNXB2 = res.data.data.some((p) => p.MaNXB === 'NXB902');
        if (hasNXB1 && hasNXB2) {
          logPass('Test 3.1: GET /api/user/publishers thành công trả về danh sách NXB');
        } else {
          logFail('Test 3.1: Danh sách NXB thiếu bản ghi mẫu', res.data);
        }
      } else {
        logFail('Test 3.1: GET /api/user/publishers thất bại', res.data);
      }
    }

    // Test 3.2: Danh sách sắp xếp theo TenNXB tăng dần
    {
      const res = await request(server, { path: '/api/user/publishers' });
      const names = res.data.data?.map((p) => p.TenNXB);
      let isSorted = true;
      for (let i = 0; i < names.length - 1; i++) {
        if (names[i].localeCompare(names[i + 1], 'vi') > 0) {
          isSorted = false;
          break;
        }
      }
      if (res.status === 200 && isSorted) {
        logPass('Test 3.2: Danh sách NXB được sắp xếp theo TenNXB');
      } else {
        logFail('Test 3.2: Danh sách NXB chưa được sắp xếp đúng', names);
      }
    }

    // Test 3.3: Chặn tham số query lạ trên /api/user/publishers (allowUnknown: false)
    {
      const res = await request(server, { path: '/api/user/publishers?extra=123' });
      if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
        logPass('Test 3.3: Chặn tham số query lạ trên /api/user/publishers');
      } else {
        logFail('Test 3.3: Không chặn tham số lạ trên publishers', res.data);
      }
    }
  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình chạy test:', err);
    failedCount++;
  } finally {
    // Dọn dẹp dữ liệu test
    await Sach.deleteMany({ MaSach: { $in: ['S9901', 'S9902', 'S9903'] } });
    await NhaXuatBan.deleteMany({ MaNXB: { $in: ['NXB901', 'NXB902'] } });

    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();

    console.log('\n=============================================');
    console.log(`KẾT QUẢ KIỂM THỬ P2-4: ${passedCount} PASS, ${failedCount} FAIL`);
    console.log('=============================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  }
};

runTests();
