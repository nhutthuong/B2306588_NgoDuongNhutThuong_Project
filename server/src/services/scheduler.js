import { expireStaleApprovals } from './expiry.service.js';

export const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 phút (khớp chu kỳ dọn dẹp hệ thống)

let timer = null;
let currentIntervalMs = DEFAULT_SWEEP_INTERVAL_MS;

/**
 * Khởi động bộ lập lịch tự động quét và hủy phiếu hết hạn nhận sách.
 * - Idempotent: Gọi nhiều lần không tạo nhiều bộ hẹn giờ.
 * - Không chạy khi NODE_ENV = 'test'.
 * - Chạy một lượt dọn dẹp ngay khi khởi động để xử lý các phiếu quá hạn trong lúc server tắt.
 * - Sử dụng setInterval với .unref() để không chặn tiến trình thoát khi shutdown.
 * - Mọi lỗi trong chu kỳ quét đều được bắt và ghi log, không làm sập server.
 *
 * @param {object} [options={}]
 * @param {number} [options.intervalMs=DEFAULT_SWEEP_INTERVAL_MS] - Chu kỳ quét (ms)
 * @returns {boolean} true nếu khởi động thành công, false nếu đã chạy hoặc bị bỏ qua
 */
export const startScheduler = ({ intervalMs = DEFAULT_SWEEP_INTERVAL_MS } = {}) => {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }

  if (timer) {
    return false;
  }

  currentIntervalMs = intervalMs;

  // Chạy một lượt ngay khi khởi động để dọn dẹp tồn đọng từ lúc server tắt
  expireStaleApprovals()
    .then((summary) => {
      if (summary.daHuy > 0 || summary.boQua > 0 || summary.loi > 0) {
        console.log(
          `[SCHEDULER] Dọn dẹp khởi động: đã hủy ${summary.daHuy}, bỏ qua ${summary.boQua}, lỗi ${summary.loi}`
        );
      }
    })
    .catch((err) => {
      console.error('[SCHEDULER] Lỗi trong lượt quét khởi động:', err.message);
    });

  // Thiết lập chu kỳ lặp lại
  timer = setInterval(async () => {
    try {
      const summary = await expireStaleApprovals();
      if (summary.daHuy > 0 || summary.boQua > 0 || summary.loi > 0) {
        console.log(
          `[SCHEDULER] Quét định kỳ: đã hủy ${summary.daHuy}, bỏ qua ${summary.boQua}, lỗi ${summary.loi}`
        );
      }
    } catch (err) {
      console.error('[SCHEDULER] Lỗi trong chu kỳ quét:', err.message);
    }
  }, intervalMs);

  // unref() để timer không giữ event loop khi server cần thoát
  timer.unref();

  return true;
};

/**
 * Dừng bộ lập lịch (Graceful shutdown).
 * Xóa interval và giải phóng tài nguyên.
 */
export const stopScheduler = async () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

/**
 * Lấy trạng thái hiện tại của bộ lập lịch (phục vụ kiểm thử).
 */
export const getSchedulerStatus = () => ({
  isRunning: Boolean(timer),
  intervalMs: currentIntervalMs,
});

export default {
  DEFAULT_SWEEP_INTERVAL_MS,
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
};
