/**
 * Danh sách các trạng thái mượn sách đang chiếm chỗ theo docs/SYSTEM.md §4, §5
 * ChoDuyet: Độc giả đăng ký, đang chờ duyệt
 * DaDuyet: Nhân viên đã duyệt, sách đang được giữ chờ độc giả nhận (kho đã trừ)
 * DangMuon: Độc giả đã nhận sách, đang trong thời gian mượn
 */
export const ACTIVE_STATUSES = Object.freeze(['ChoDuyet', 'DaDuyet', 'DangMuon']);

/**
 * Kiểm tra một phiếu mượn có đang quá hạn trả sách hay không
 * Điều kiện: TrangThai = 'DangMuon' và thời điểm hiện tại (now) > HanTra
 *
 * @param {object} phieu - Document hoặc object phiếu TheoDoiMuonSach
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra (phục vụ test giả lập thời gian)
 * @returns {boolean} true nếu quá hạn, false nếu không quá hạn hoặc trạng thái khác
 */
export const isOverdue = (phieu, now = new Date()) => {
  if (!phieu || phieu.TrangThai !== 'DangMuon' || !phieu.HanTra) {
    return false;
  }
  const currentTime = new Date(now).getTime();
  const dueTime = new Date(phieu.HanTra).getTime();
  return currentTime > dueTime;
};

/**
 * Tính số ngày trễ hạn của phiếu mượn sách
 * Quy tắc: làm tròn LÊN theo ngày (Math.ceil), 0 nếu không trễ
 * Ví dụ:
 * - Đúng ngày hạn hoặc trước hạn: 0 ngày
 * - Trễ 1 giờ: 1 ngày
 * - Trễ đúng 24 giờ: 1 ngày
 * - Trễ 25 giờ (1 ngày 1 giờ): 2 ngày
 *
 * @param {object} phieu - Document hoặc object phiếu TheoDoiMuonSach
 * @param {Date|string|number} [now=new Date()] - Thời điểm kiểm tra
 * @returns {number} Số ngày trễ (số nguyên >= 0)
 */
export const soNgayTre = (phieu, now = new Date()) => {
  if (!isOverdue(phieu, now)) {
    return 0;
  }
  const currentTime = new Date(now).getTime();
  const dueTime = new Date(phieu.HanTra).getTime();
  const diffMs = currentTime - dueTime;
  if (diffMs <= 0) {
    return 0;
  }
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.ceil(diffMs / MS_PER_DAY);
};

export default {
  ACTIVE_STATUSES,
  isOverdue,
  soNgayTre,
};
