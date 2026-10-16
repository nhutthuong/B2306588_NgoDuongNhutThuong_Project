import { connectDB, disconnectDB } from '../config/db.js';
import { expireStaleApprovals } from '../services/expiry.service.js';

/**
 * Công cụ chạy tay quét và hủy các phiếu mượn đã duyệt nhưng quá hạn nhận sách.
 * Tự động kết nối và đóng MongoDB, không khởi động scheduler.
 */
const run = async () => {
  console.log('--- KHỞI CHẠY QUÉT PHIẾU QUÁ HẠN NHẬN SÁCH (THỦ CÔNG) ---');
  try {
    await connectDB();
    const startTime = Date.now();
    const result = await expireStaleApprovals();
    const duration = Date.now() - startTime;

    console.log('Kết quả xử lý:');
    console.log(`- Số phiếu đã hủy và hoàn kho (daHuy): ${result.daHuy}`);
    console.log(`- Số phiếu bỏ qua do đã xử lý (boQua): ${result.boQua}`);
    console.log(`- Số phiếu lỗi (loi): ${result.loi}`);
    console.log(`- Thời gian thực thi: ${duration}ms`);
    console.log('---------------------------------------------------------');
  } catch (err) {
    console.error('Lỗi khi thực hiện quét phiếu quá hạn:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
    console.log('Đã đóng kết nối cơ sở dữ liệu.');
    process.exit(process.exitCode || 0);
  }
};

run();
