/**
 * fine.service.js — Dịch vụ tính tiền phạt mượn trả sách (hàm thuần, không truy cập DB)
 * Tuân thủ quy định tại docs/SYSTEM.md §6:
 *
 * 1. Phí trễ hạn:
 *    - Chỉ tính khi now > HanTra.
 *    - Số ngày trễ làm tròn LÊN theo ngày (Math.ceil).
 *    - phiTre = min(soNgayTre * PhiTreMoiNgay, DonGia). Trần bằng đơn giá chỉ áp dụng cho phí trễ.
 *
 * 2. Phạt tình trạng sách:
 *    - BinhThuong: 0 VND.
 *    - Rach: heSo = 0.5 (mức Nhe) hoặc 1.0 (mức Nang).
 *      phat = round(TyLePhatRach * DonGia * heSo).
 *    - Mat: phat = round(TyLePhatMat * DonGia) + PhiXuLyMat.
 *
 * 3. Tổng phạt:
 *    tienPhat = phiTre + phatTinhTrang.
 *
 * Mọi kết quả là số nguyên VND không âm. Giá trị không hợp lệ ném lỗi, tuyệt đối không trả NaN.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tính số ngày trễ hạn dựa trên hạn trả và thời điểm hiện tại.
 * Làm tròn LÊN theo ngày (Math.ceil).
 *
 * @param {Date|string|number} hanTra - Hạn trả của phiếu mượn
 * @param {Date|string|number} [now=new Date()] - Thời điểm nhận trả
 * @returns {number} Số ngày trễ (số nguyên >= 0)
 */
export const tinhSoNgayTre = (hanTra, now = new Date()) => {
  if (!hanTra) {
    return 0;
  }

  const nowDate = new Date(now);
  const hanTraDate = new Date(hanTra);

  if (Number.isNaN(nowDate.getTime()) || Number.isNaN(hanTraDate.getTime())) {
    throw new Error('Thời gian kiểm tra trễ hạn không hợp lệ');
  }

  const diffMs = nowDate.getTime() - hanTraDate.getTime();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / MS_PER_DAY);
};

/**
 * Tính phí trễ hạn trả sách theo docs/SYSTEM.md §6.
 *
 * @param {object} params
 * @param {Date|string|number} params.hanTra - Hạn trả của phiếu mượn
 * @param {Date|string|number} [params.now=new Date()] - Thời điểm trả sách thực tế
 * @param {number} params.donGia - Đơn giá của sách (VND, >= 0)
 * @param {number} params.phiTreMoiNgay - Phí phạt trễ mỗi ngày (VND/ngày, >= 0)
 * @returns {number} Phí phạt trễ hạn (số nguyên VND >= 0, bị chặn trần bởi donGia)
 */
export const tinhPhiTre = ({ hanTra, now = new Date(), donGia, phiTreMoiNgay }) => {
  if (
    donGia === undefined ||
    donGia === null ||
    typeof donGia !== 'number' ||
    Number.isNaN(donGia) ||
    donGia < 0
  ) {
    throw new Error('Đơn giá sách không hợp lệ (phải là số >= 0)');
  }

  if (
    phiTreMoiNgay === undefined ||
    phiTreMoiNgay === null ||
    typeof phiTreMoiNgay !== 'number' ||
    Number.isNaN(phiTreMoiNgay) ||
    phiTreMoiNgay < 0
  ) {
    throw new Error('Phí trễ mỗi ngày không hợp lệ (phải là số >= 0)');
  }

  const soNgay = tinhSoNgayTre(hanTra, now);
  if (soNgay === 0) {
    return 0;
  }

  const rawPhi = soNgay * phiTreMoiNgay;
  // Trần bằng đơn giá chỉ áp dụng cho phí trễ theo SYSTEM.md §6
  const phiTre = Math.min(rawPhi, donGia);

  return Math.max(0, Math.round(phiTre));
};

/**
 * Tính tiền phạt theo tình trạng sách (BinhThuong, Rach, Mat) theo docs/SYSTEM.md §6.
 *
 * @param {object} params
 * @param {'BinhThuong'|'Rach'|'Mat'} params.tinhTrangTra - Tình trạng sách khi trả
 * @param {'Nhe'|'Nang'} [params.mucRach] - Mức độ rách (bắt buộc khi tinhTrangTra = 'Rach')
 * @param {number} params.donGia - Đơn giá sách (VND, >= 0)
 * @param {object} params.settings - Cấu hình hệ thống (TyLePhatRach, TyLePhatMat, PhiXuLyMat)
 * @returns {number} Tiền phạt do tình trạng sách (số nguyên VND >= 0)
 */
export const tinhPhatTinhTrang = ({ tinhTrangTra, mucRach, donGia, settings = {} }) => {
  if (
    donGia === undefined ||
    donGia === null ||
    typeof donGia !== 'number' ||
    Number.isNaN(donGia) ||
    donGia < 0
  ) {
    throw new Error('Đơn giá sách không hợp lệ (phải là số >= 0)');
  }

  if (!tinhTrangTra || !['BinhThuong', 'Rach', 'Mat'].includes(tinhTrangTra)) {
    throw new Error(
      `Tình trạng trả sách '${tinhTrangTra}' không hợp lệ (chỉ chấp nhận 'BinhThuong', 'Rach', 'Mat')`
    );
  }

  // 1. Bình thường: 0 VND
  if (tinhTrangTra === 'BinhThuong') {
    return 0;
  }

  // 2. Rách: mức nhẹ (50% của TyLePhatRach), mức nặng (100% của TyLePhatRach)
  if (tinhTrangTra === 'Rach') {
    if (!mucRach || !['Nhe', 'Nang'].includes(mucRach)) {
      throw new Error(
        `Mức độ rách '${mucRach}' không hợp lệ khi tình trạng là 'Rach' (phải là 'Nhe' hoặc 'Nang')`
      );
    }

    const tyLePhatRach =
      typeof settings.TyLePhatRach === 'number' && !Number.isNaN(settings.TyLePhatRach) && settings.TyLePhatRach >= 0
        ? settings.TyLePhatRach
        : 0.5;

    const heSo = mucRach === 'Nhe' ? 0.5 : 1.0;
    const phat = Math.round(tyLePhatRach * donGia * heSo);

    return Math.max(0, phat);
  }

  // 3. Mất: TyLePhatMat * DonGia + PhiXuLyMat
  if (tinhTrangTra === 'Mat') {
    const tyLePhatMat =
      typeof settings.TyLePhatMat === 'number' && !Number.isNaN(settings.TyLePhatMat) && settings.TyLePhatMat >= 0
        ? settings.TyLePhatMat
        : 1.0;

    const phiXuLyMat =
      typeof settings.PhiXuLyMat === 'number' && !Number.isNaN(settings.PhiXuLyMat) && settings.PhiXuLyMat >= 0
        ? settings.PhiXuLyMat
        : 20000;

    const phat = Math.round(tyLePhatMat * donGia) + Math.round(phiXuLyMat);

    return Math.max(0, phat);
  }

  throw new Error(`Tình trạng trả sách '${tinhTrangTra}' không được hỗ trợ`);
};

/**
 * Tính tổng các khoản phạt khi nhận trả sách (phí trễ + phạt tình trạng).
 * Trả về chi tiết các thành phần phạt để phục vụ hiển thị giải trình ở client.
 *
 * @param {object} params
 * @param {Date|string|number} params.hanTra - Hạn trả của phiếu mượn
 * @param {Date|string|number} [params.now=new Date()] - Thời điểm nhận trả sách
 * @param {number} params.donGia - Đơn giá sách (VND)
 * @param {'BinhThuong'|'Rach'|'Mat'} params.tinhTrangTra - Tình trạng sách khi trả
 * @param {'Nhe'|'Nang'} [params.mucRach] - Mức độ rách
 * @param {object} params.settings - Cấu hình hệ thống
 * @returns {{
 *   soNgayTre: number,
 *   phiTre: number,
 *   phatTinhTrang: number,
 *   tienPhat: number
 * }}
 */
export const tinhTongPhat = ({
  hanTra,
  now = new Date(),
  donGia,
  tinhTrangTra,
  mucRach,
  settings = {},
}) => {
  const phiTreMoiNgay =
    typeof settings.PhiTreMoiNgay === 'number' && !Number.isNaN(settings.PhiTreMoiNgay) && settings.PhiTreMoiNgay >= 0
      ? settings.PhiTreMoiNgay
      : 2000;

  const soNgayTre = tinhSoNgayTre(hanTra, now);
  const phiTre = tinhPhiTre({
    hanTra,
    now,
    donGia,
    phiTreMoiNgay,
  });

  const phatTinhTrang = tinhPhatTinhTrang({
    tinhTrangTra,
    mucRach,
    donGia,
    settings,
  });

  const tienPhat = phiTre + phatTinhTrang;

  return {
    soNgayTre,
    phiTre,
    phatTinhTrang,
    tienPhat,
  };
};

export default {
  tinhSoNgayTre,
  tinhPhiTre,
  tinhPhatTinhTrang,
  tinhTongPhat,
};
