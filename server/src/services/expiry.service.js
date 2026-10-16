import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import { hoanKhoSach } from './borrowing.service.js';
import { logAction } from './audit.service.js';

let isSweeping = false;
let lastSuccessfulSweepTime = 0;
let sweepCount = 0;

/**
 * Tự động quét và hủy các phiếu mượn ở trạng thái 'DaDuyet' đã quá hạn nhận sách (HanNhanSach < now).
 * Với mỗi phiếu hết hạn:
 * 1. Chiếm phiếu nguyên tử: DaDuyet -> DaHuy (điều kiện HanNhanSach < now)
 * 2. Hoàn lại kho: SoQuyenConLai +1 (bằng hàm hoanKhoSach có bảo vệ bất biến kho)
 * 3. Nếu hoàn kho thất bại: Hoàn tác phiếu về DaDuyet (cơ chế bù trừ compensation)
 * 4. Ghi nhật ký: HanhDong 'HET_HAN_NHAN_SACH' với tác nhân 'HE_THONG'
 *
 * @param {object} [options={}]
 * @param {Date|string|number} [options.now=new Date()] - Mốc thời gian kiểm tra
 * @param {number} [options.limit=200] - Số lượng phiếu tối đa xử lý trong một lượt
 * @param {boolean} [options.skipConcurrencyCheck=false] - Bỏ qua cờ bộ nhớ để test chạy đua DB
 * @returns {Promise<{ daHuy: number, boQua: number, loi: number, dangChay?: boolean }>}
 */
export const expireStaleApprovals = async ({
  now = new Date(),
  limit = 200,
  skipConcurrencyCheck = false,
} = {}) => {
  // Chống chạy chồng trong cùng tiến trình (cron và lazy-check không đạp nhau)
  if (!skipConcurrencyCheck && isSweeping) {
    return { daHuy: 0, boQua: 0, loi: 0, dangChay: true };
  }

  isSweeping = true;

  let daHuy = 0;
  let boQua = 0;
  let loi = 0;

  try {
    const currentTime = now instanceof Date ? now : new Date(now);
    const safeLimit = Math.max(1, Number(limit) || 200);

    // Cảnh báo các phiếu DaDuyet thiếu HanNhanSach (dữ liệu cũ)
    const missingCandidates = await TheoDoiMuonSach.find({
      TrangThai: 'DaDuyet',
      $or: [{ HanNhanSach: null }, { HanNhanSach: { $exists: false } }],
    })
      .select('_id')
      .lean();

    for (const p of missingCandidates) {
      console.warn(
        `[EXPIRY_WARNING] Phiếu mượn ${p._id} ở trạng thái DaDuyet nhưng thiếu HanNhanSach, bỏ qua`
      );
    }

    // Tìm các phiếu DaDuyet thực sự quá hạn nhận sách
    const candidates = await TheoDoiMuonSach.find({
      TrangThai: 'DaDuyet',
      HanNhanSach: { $ne: null, $lt: currentTime },
    })
      .select('_id MaSach MaDocGia HanNhanSach')
      .sort({ HanNhanSach: 1 })
      .limit(safeLimit)
      .lean();

    for (const phieu of candidates) {
      try {
        // Dữ liệu cũ thiếu HanNhanSach: bỏ qua và ghi log cảnh báo
        if (!phieu.HanNhanSach) {
          console.warn(
            `[EXPIRY_WARNING] Phiếu mượn ${phieu._id} ở trạng thái DaDuyet nhưng thiếu HanNhanSach, bỏ qua`
          );
          continue;
        }

        const phieuHanNhan = new Date(phieu.HanNhanSach);
        // So sánh nghiêm ngặt: đúng bằng hạn thì chưa hết hạn
        if (phieuHanNhan.getTime() >= currentTime.getTime()) {
          continue;
        }

        // 1. CHIẾM phiếu nguyên tử
        const claimed = await TheoDoiMuonSach.findOneAndUpdate(
          {
            _id: phieu._id,
            TrangThai: 'DaDuyet',
            HanNhanSach: { $lt: currentTime },
          },
          { $set: { TrangThai: 'DaHuy' } },
          { new: true }
        );

        if (!claimed) {
          // Phiếu vừa được xử lý bởi đường khác (giao sách, hủy, tiến trình khác)
          boQua++;
          continue;
        }

        // 2. Hoàn kho SoQuyenConLai +1
        const stockSuccess = await hoanKhoSach(claimed.MaSach);

        // 3. Nếu hoàn kho thất bại: Hoàn tác phiếu về DaDuyet
        if (!stockSuccess) {
          await TheoDoiMuonSach.findOneAndUpdate(
            { _id: claimed._id, TrangThai: 'DaHuy' },
            { $set: { TrangThai: 'DaDuyet' } }
          );
          console.error(
            `[EXPIRY_ERROR] Hoàn kho thất bại cho sách ${claimed.MaSach}, đã hoàn tác phiếu ${claimed._id} về DaDuyet`
          );
          loi++;
          continue;
        }

        // 4. Ghi nhật ký hệ thống
        await logAction({
          msnv: 'HE_THONG',
          hanhDong: 'HET_HAN_NHAN_SACH',
          doiTuong: 'TheoDoiMuonSach',
          maDoiTuong: String(claimed._id),
          chiTiet: {
            MaSach: claimed.MaSach,
            MaDocGia: claimed.MaDocGia,
            HanNhanSach: claimed.HanNhanSach,
          },
        });

        daHuy++;
      } catch (itemErr) {
        console.error(`[EXPIRY_ERROR] Lỗi khi xử lý phiếu mượn ${phieu._id}:`, itemErr.message);
        loi++;
      }
    }

    lastSuccessfulSweepTime = currentTime.getTime();
    sweepCount++;

    return { daHuy, boQua, loi };
  } finally {
    isSweeping = false;
  }
};

/**
 * Bản quét thưa dùng cho lazy-check khi người dùng gọi API.
 * Chỉ quét nếu lần quét thành công gần nhất cách đây >= 60 giây.
 * Không bao giờ ném lỗi ra ngoài (bắt và ghi log) để tránh làm gián đoạn request của người dùng.
 *
 * @param {object} [options={}]
 * @param {Date|string|number} [options.now=new Date()]
 * @returns {Promise<{ daHuy: number, boQua: number, loi: number, skipped?: boolean, error?: string }>}
 */
export const sweepIfDue = async ({ now = new Date() } = {}) => {
  const currentTs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (currentTs - lastSuccessfulSweepTime < 60000) {
    return { daHuy: 0, boQua: 0, loi: 0, skipped: true };
  }

  try {
    const result = await expireStaleApprovals({ now });
    return result;
  } catch (err) {
    console.error('[SWEEP_IF_DUE_ERROR] Lỗi trong sweepIfDue:', err.message);
    return { daHuy: 0, boQua: 0, loi: 0, error: err.message };
  }
};

/**
 * Lấy trạng thái hiện tại của bộ quét (phục vụ kiểm thử).
 */
export const getSweepStats = () => ({
  isSweeping,
  lastSuccessfulSweepTime,
  sweepCount,
});

/**
 * Đặt lại trạng thái bộ quét (chỉ dùng cho unit test / kiểm thử tự động).
 */
export const _resetSweepStateForTest = () => {
  isSweeping = false;
  lastSuccessfulSweepTime = 0;
  sweepCount = 0;
};

export default {
  expireStaleApprovals,
  sweepIfDue,
  getSweepStats,
  _resetSweepStateForTest,
};
