import Sach from '../models/Sach.js';
import DocGia from '../models/DocGia.js';
import TheoDoiMuonSach from '../models/TheoDoiMuonSach.js';
import { getSettings } from './settings.service.js';
import { sweepIfDue } from './expiry.service.js';
import { soNgayTre } from '../utils/borrowing.js';
import { tinhPhiTre } from './fine.service.js';
import { getPaginationMeta } from '../utils/pagination.js';

/**
 * Hằng số múi giờ chuẩn cho toàn bộ hệ thống thống kê theo docs/SYSTEM.md §7
 * Việt Nam nằm ở múi giờ UTC+7 ('Asia/Ho_Chi_Minh')
 */
export const TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Lấy năm hiện tại theo múi giờ Việt Nam
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
export const getCurrentYearVN = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
  });
  return parseInt(formatter.format(now), 10);
};

/**
 * Tách thông tin ngày (năm, tháng, ngày) theo giờ Việt Nam
 * @param {Date|string|number} dateInput
 * @returns {{ year: number, month: number, day: number, dateStr: string }}
 */
export const getDatePartsVN = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [yearStr, monthStr, dayStr] = formatter.format(d).split('-');
  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    day: parseInt(dayStr, 10),
    dateStr: `${yearStr}-${monthStr}-${dayStr}`,
  };
};

/**
 * Phân tích khoảng ngày tuNgay - denNgay theo giờ Việt Nam
 * - tuNgay: tính từ 00:00:00.000 giờ VN của ngày đó
 * - denNgay: tính đến hết 23:59:59.999 giờ VN của ngày đó (bao gồm cả ngày)
 *
 * @param {string} [tuNgayStr]
 * @param {string} [denNgayStr]
 * @returns {{ startDate: Date|null, endDate: Date|null }}
 */
export const parseDateRangeVN = (tuNgayStr, denNgayStr) => {
  let startDate = null;
  let endDate = null;

  if (tuNgayStr) {
    const raw = String(tuNgayStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      startDate = new Date(`${raw}T00:00:00+07:00`);
    } else {
      const parts = getDatePartsVN(raw);
      startDate = new Date(`${parts.dateStr}T00:00:00+07:00`);
    }
  }

  if (denNgayStr) {
    const raw = String(denNgayStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      endDate = new Date(`${raw}T23:59:59.999+07:00`);
    } else {
      const parts = getDatePartsVN(raw);
      endDate = new Date(`${parts.dateStr}T23:59:59.999+07:00`);
    }
  }

  return { startDate, endDate };
};

/**
 * 1. GET /overview
 * Thống kê tổng quan số liệu kho sách, độc giả, phiếu mượn và nợ phạt.
 * Gom các phép đếm bằng $facet và aggregation tối ưu.
 *
 * @returns {Promise<{
 *   sach: { tongDauSach: number, tongSoQuyen: number, tongConLai: number, soSachHetHang: number },
 *   docGia: { tong: number, hoatDong: number, biKhoa: number },
 *   phieuTheoTrangThai: { ChoDuyet: number, DaDuyet: number, DangMuon: number, DaTra: number, TuChoi: number, DaHuy: number },
 *   soQuaHan: number,
 *   tongPhatChuaThu: number,
 *   soPhieuChuaThuPhat: number
 * }>}
 */
export const getOverviewStats = async () => {
  // Quét các phiếu DaDuyet quá hạn nhận sách trước khi lấy số liệu
  await sweepIfDue();

  const now = new Date();

  const [sachAgg, docGiaAgg, phieuAgg] = await Promise.all([
    // Thống kê kho sách: CHỈ tính sách chưa xóa mềm (DaXoa = false)
    Sach.aggregate([
      { $match: { DaXoa: false } },
      {
        $group: {
          _id: null,
          tongDauSach: { $sum: 1 },
          tongSoQuyen: { $sum: '$SoQuyen' },
          tongConLai: { $sum: '$SoQuyenConLai' },
          soSachHetHang: {
            $sum: { $cond: [{ $lte: ['$SoQuyenConLai', 0] }, 1, 0] },
          },
        },
      },
    ]),

    // Thống kê độc giả
    DocGia.aggregate([
      {
        $group: {
          _id: null,
          tong: { $sum: 1 },
          hoatDong: {
            $sum: { $cond: [{ $eq: ['$TrangThai', 'HoatDong'] }, 1, 0] },
          },
          biKhoa: {
            $sum: { $cond: [{ $eq: ['$TrangThai', 'BiKhoa'] }, 1, 0] },
          },
        },
      },
    ]),

    // Thống kê phiếu mượn qua $facet trong 1 truy vấn duy nhất
    TheoDoiMuonSach.aggregate([
      {
        $facet: {
          theoTrangThai: [
            {
              $group: {
                _id: '$TrangThai',
                count: { $sum: 1 },
              },
            },
          ],
          quaHan: [
            {
              $match: {
                TrangThai: 'DangMuon',
                HanTra: { $ne: null, $lt: now },
              },
            },
            { $count: 'total' },
          ],
          phatChuaThu: [
            {
              $match: {
                TrangThaiPhat: 'ChuaThanhToan',
              },
            },
            {
              $group: {
                _id: null,
                tongTien: { $sum: '$TienPhat' },
                soPhieu: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const sachData = sachAgg[0] || {
    tongDauSach: 0,
    tongSoQuyen: 0,
    tongConLai: 0,
    soSachHetHang: 0,
  };

  const docGiaData = docGiaAgg[0] || {
    tong: 0,
    hoatDong: 0,
    biKhoa: 0,
  };

  const phieuFacet = phieuAgg[0] || {
    theoTrangThai: [],
    quaHan: [],
    phatChuaThu: [],
  };

  const statusMap = new Map();
  for (const item of phieuFacet.theoTrangThai || []) {
    statusMap.set(item._id, item.count);
  }

  // Đảm bảo luôn đầy đủ 6 khóa trạng thái chuẩn, trạng thái nào không có thì bằng 0
  const phieuTheoTrangThai = {
    ChoDuyet: statusMap.get('ChoDuyet') || 0,
    DaDuyet: statusMap.get('DaDuyet') || 0,
    DangMuon: statusMap.get('DangMuon') || 0,
    DaTra: statusMap.get('DaTra') || 0,
    TuChoi: statusMap.get('TuChoi') || 0,
    DaHuy: statusMap.get('DaHuy') || 0,
  };

  const soQuaHan = phieuFacet.quaHan?.[0]?.total || 0;
  const tongPhatChuaThu = phieuFacet.phatChuaThu?.[0]?.tongTien || 0;
  const soPhieuChuaThuPhat = phieuFacet.phatChuaThu?.[0]?.soPhieu || 0;

  return {
    sach: {
      tongDauSach: sachData.tongDauSach,
      tongSoQuyen: sachData.tongSoQuyen,
      tongConLai: sachData.tongConLai,
      soSachHetHang: sachData.soSachHetHang,
    },
    docGia: {
      tong: docGiaData.tong,
      hoatDong: docGiaData.hoatDong,
      biKhoa: docGiaData.biKhoa,
    },
    phieuTheoTrangThai,
    soQuaHan,
    tongPhatChuaThu,
    soPhieuChuaThuPhat,
  };
};

/**
 * 2. GET /top-books?limit=10&tuNgay&denNgay
 * Sách có nhiều lượt mượn nhất (TrangThai thuộc DangMuon hoặc DaTra).
 * Sách đã xóa mềm vẫn được tính trong lịch sử, kèm daXoa = true.
 *
 * @param {object} params
 * @param {number} [params.limit=10]
 * @param {string} [params.tuNgay]
 * @param {string} [params.denNgay]
 * @returns {Promise<Array<{
 *   MaSach: string,
 *   TenSach: string,
 *   NguonGocTacGia: string,
 *   soLuotMuon: number,
 *   daXoa: boolean
 * }>>}
 */
export const getTopBooks = async ({ limit = 10, tuNgay, denNgay } = {}) => {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50);
  const { startDate, endDate } = parseDateRangeVN(tuNgay, denNgay);

  const matchStage = {
    TrangThai: { $in: ['DangMuon', 'DaTra'] },
    NgayMuon: { $ne: null },
  };

  if (startDate || endDate) {
    matchStage.NgayMuon = {};
    if (startDate) {
      matchStage.NgayMuon.$gte = startDate;
    }
    if (endDate) {
      matchStage.NgayMuon.$lte = endDate;
    }
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$MaSach',
        soLuotMuon: { $sum: 1 },
      },
    },
    {
      $sort: {
        soLuotMuon: -1,
        _id: 1, // MaSach tăng dần khi hòa điểm
      },
    },
    { $limit: safeLimit },
    {
      $lookup: {
        from: 'Sach',
        localField: '_id',
        foreignField: 'MaSach',
        as: 'sachDoc',
      },
    },
    {
      $project: {
        _id: 0,
        MaSach: '$_id',
        TenSach: { $ifNull: [{ $arrayElemAt: ['$sachDoc.TenSach', 0] }, ''] },
        NguonGocTacGia: {
          $ifNull: [{ $arrayElemAt: ['$sachDoc.NguonGocTacGia', 0] }, ''],
        },
        daXoa: { $ifNull: [{ $arrayElemAt: ['$sachDoc.DaXoa', 0] }, false] },
        soLuotMuon: 1,
      },
    },
  ];

  const results = await TheoDoiMuonSach.aggregate(pipeline);
  return results;
};

/**
 * 3. GET /borrow-by-month?year=2026
 * Thống kê lượt mượn (DangMuon, DaTra theo NgayMuon) và số đăng ký (mọi trạng thái theo NgayDangKy)
 * Gom theo múi giờ 'Asia/Ho_Chi_Minh', luôn đủ 12 tháng từ 1 đến 12.
 *
 * @param {object} params
 * @param {number} [params.year]
 * @returns {Promise<{
 *   year: number,
 *   nam: number,
 *   thang: Array<{ thang: number, luotMuon: number, soDangKy: number }>,
 *   tongCaNam: { luotMuon: number, soDangKy: number }
 * }>}
 */
export const getBorrowByMonth = async ({ year } = {}) => {
  const safeYear = parseInt(year, 10) || getCurrentYearVN();

  const startOfYear = new Date(`${safeYear}-01-01T00:00:00+07:00`);
  const endOfYear = new Date(`${safeYear + 1}-01-01T00:00:00+07:00`);

  const [aggResult] = await TheoDoiMuonSach.aggregate([
    {
      $facet: {
        luotMuonFacet: [
          {
            $match: {
              TrangThai: { $in: ['DangMuon', 'DaTra'] },
              NgayMuon: {
                $ne: null,
                $gte: startOfYear,
                $lt: endOfYear,
              },
            },
          },
          {
            $group: {
              _id: { $month: { date: '$NgayMuon', timezone: TIMEZONE } },
              count: { $sum: 1 },
            },
          },
        ],
        dangKyFacet: [
          {
            $match: {
              NgayDangKy: {
                $gte: startOfYear,
                $lt: endOfYear,
              },
            },
          },
          {
            $group: {
              _id: { $month: { date: '$NgayDangKy', timezone: TIMEZONE } },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const luotMuonMap = new Map();
  for (const item of aggResult?.luotMuonFacet || []) {
    luotMuonMap.set(item._id, item.count);
  }

  const dangKyMap = new Map();
  for (const item of aggResult?.dangKyFacet || []) {
    dangKyMap.set(item._id, item.count);
  }

  const thang = [];
  let tongLuotMuon = 0;
  let tongDangKy = 0;

  for (let m = 1; m <= 12; m++) {
    const lm = luotMuonMap.get(m) || 0;
    const dk = dangKyMap.get(m) || 0;

    thang.push({
      thang: m,
      luotMuon: lm,
      soDangKy: dk,
    });

    tongLuotMuon += lm;
    tongDangKy += dk;
  }

  return {
    year: safeYear,
    nam: safeYear,
    thang,
    tongCaNam: {
      luotMuon: tongLuotMuon,
      soDangKy: tongDangKy,
    },
  };
};

/**
 * 4. GET /overdue?page&limit
 * Danh sách phiếu mượn DangMuon có HanTra < now, phân trang, trễ lâu nhất lên đầu.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @returns {Promise<{
 *   items: Array<object>,
 *   meta: object,
 *   total: number
 * }>}
 */
export const getOverdueList = async ({ page = 1, limit = 10 } = {}) => {
  await sweepIfDue();

  const now = new Date();
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const skip = (safePage - 1) * safeLimit;

  // Lấy cấu hình hệ thống hiện tại để tính phí phạt trễ dự kiến
  const settings = await getSettings();

  const [aggResult] = await TheoDoiMuonSach.aggregate([
    {
      $match: {
        TrangThai: 'DangMuon',
        HanTra: { $ne: null, $lt: now },
      },
    },
    {
      $facet: {
        totalCount: [{ $count: 'count' }],
        items: [
          { $sort: { HanTra: 1, _id: 1 } },
          { $skip: skip },
          { $limit: safeLimit },
          {
            $lookup: {
              from: 'Sach',
              localField: 'MaSach',
              foreignField: 'MaSach',
              as: 'sachDoc',
            },
          },
          {
            $lookup: {
              from: 'DocGia',
              localField: 'MaDocGia',
              foreignField: 'MaDocGia',
              as: 'docGiaDoc',
            },
          },
        ],
      },
    },
  ]);

  const total = aggResult?.totalCount?.[0]?.count || 0;
  const rawItems = aggResult?.items || [];

  const items = rawItems.map((item) => {
    const sach = item.sachDoc?.[0] || null;
    const docGia = item.docGiaDoc?.[0] || null;

    const soNgay = soNgayTre(item, now);
    const donGia = typeof sach?.DonGia === 'number' ? sach.DonGia : 0;
    const phiTreDuKien = tinhPhiTre({
      hanTra: item.HanTra,
      now,
      donGia,
      phiTreMoiNgay: settings.PhiTreMoiNgay,
    });

    const hoLot = docGia?.HoLot ? String(docGia.HoLot).trim() : '';
    const ten = docGia?.Ten ? String(docGia.Ten).trim() : '';
    const hoTen = `${hoLot} ${ten}`.trim();

    return {
      _id: item._id,
      MaSach: item.MaSach,
      TenSach: sach?.TenSach || '',
      MaDocGia: item.MaDocGia,
      HoTen: hoTen,
      DienThoai: docGia?.DienThoai || '',
      Email: docGia?.Email || '',
      NgayMuon: item.NgayMuon ? new Date(item.NgayMuon).toISOString() : null,
      HanTra: item.HanTra ? new Date(item.HanTra).toISOString() : null,
      soNgayTre: soNgay,
      phiTreDuKien,
    };
  });

  const paginationMeta = getPaginationMeta(total, safePage, safeLimit);
  const meta = {
    ...paginationMeta,
    soQuaHan: total,
  };

  return { items, meta, total };
};

/**
 * 5. GET /fines?year=2026
 * Thống kê tiền phạt phát sinh (theo NgayTra của phiếu DaTra), tiền phạt đã thu (theo NgayThanhToanPhat),
 * số sách rách, số sách mất theo từng tháng và tổng năm, kèm tổng tiền phạt chưa thu hiện tại.
 *
 * @param {object} params
 * @param {number} [params.year]
 * @returns {Promise<{
 *   year: number,
 *   nam: number,
 *   thang: Array<{ thang: number, phatPhatSinh: number, daThu: number, soSachRach: number, soSachMat: number }>,
 *   tongCaNam: { phatPhatSinh: number, daThu: number, soSachRach: number, soSachMat: number },
 *   chuaThuHienTai: number
 * }>}
 */
export const getFinesStats = async ({ year } = {}) => {
  const safeYear = parseInt(year, 10) || getCurrentYearVN();

  const startOfYear = new Date(`${safeYear}-01-01T00:00:00+07:00`);
  const endOfYear = new Date(`${safeYear + 1}-01-01T00:00:00+07:00`);

  const [aggResult] = await TheoDoiMuonSach.aggregate([
    {
      $facet: {
        phatSinhFacet: [
          {
            $match: {
              TrangThai: 'DaTra',
              NgayTra: {
                $ne: null,
                $gte: startOfYear,
                $lt: endOfYear,
              },
            },
          },
          {
            $group: {
              _id: { $month: { date: '$NgayTra', timezone: TIMEZONE } },
              phatPhatSinh: { $sum: '$TienPhat' },
              soSachRach: {
                $sum: { $cond: [{ $eq: ['$TinhTrangTra', 'Rach'] }, 1, 0] },
              },
              soSachMat: {
                $sum: { $cond: [{ $eq: ['$TinhTrangTra', 'Mat'] }, 1, 0] },
              },
            },
          },
        ],
        daThuFacet: [
          {
            $match: {
              TrangThaiPhat: 'DaThanhToan',
              NgayThanhToanPhat: {
                $ne: null,
                $gte: startOfYear,
                $lt: endOfYear,
              },
            },
          },
          {
            $group: {
              _id: {
                $month: { date: '$NgayThanhToanPhat', timezone: TIMEZONE },
              },
              daThu: { $sum: '$TienPhat' },
            },
          },
        ],
        chuaThuFacet: [
          {
            $match: {
              TrangThaiPhat: 'ChuaThanhToan',
            },
          },
          {
            $group: {
              _id: null,
              chuaThuHienTai: { $sum: '$TienPhat' },
            },
          },
        ],
      },
    },
  ]);

  const phatSinhMap = new Map();
  for (const item of aggResult?.phatSinhFacet || []) {
    phatSinhMap.set(item._id, item);
  }

  const daThuMap = new Map();
  for (const item of aggResult?.daThuFacet || []) {
    daThuMap.set(item._id, item.daThu);
  }

  const chuaThuHienTai = aggResult?.chuaThuFacet?.[0]?.chuaThuHienTai || 0;

  const thang = [];
  let tongPhatSinh = 0;
  let tongDaThu = 0;
  let tongSachRach = 0;
  let tongSachMat = 0;

  for (let m = 1; m <= 12; m++) {
    const ps = phatSinhMap.get(m) || {};
    const phatPhatSinh = ps.phatPhatSinh || 0;
    const daThu = daThuMap.get(m) || 0;
    const soSachRach = ps.soSachRach || 0;
    const soSachMat = ps.soSachMat || 0;

    thang.push({
      thang: m,
      phatPhatSinh,
      daThu,
      soSachRach,
      soSachMat,
    });

    tongPhatSinh += phatPhatSinh;
    tongDaThu += daThu;
    tongSachRach += soSachRach;
    tongSachMat += soSachMat;
  }

  return {
    year: safeYear,
    nam: safeYear,
    thang,
    tongCaNam: {
      phatPhatSinh: tongPhatSinh,
      daThu: tongDaThu,
      soSachRach: tongSachRach,
      soSachMat: tongSachMat,
    },
    chuaThuHienTai,
  };
};

/**
 * 6. GET /top-readers?limit=10&tuNgay&denNgay
 * Độc giả mượn nhiều nhất theo NgayMuon trong khoảng thời gian.
 * KHÔNG trả email hay điện thoại ở endpoint này (bảo mật/quyền riêng tư).
 *
 * @param {object} params
 * @param {number} [params.limit=10]
 * @param {string} [params.tuNgay]
 * @param {string} [params.denNgay]
 * @returns {Promise<Array<{
 *   MaDocGia: string,
 *   HoTen: string,
 *   soLuotMuon: number,
 *   tongPhat: number
 * }>>}
 */
export const getTopReaders = async ({ limit = 10, tuNgay, denNgay } = {}) => {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50);
  const { startDate, endDate } = parseDateRangeVN(tuNgay, denNgay);

  const matchStage = {
    TrangThai: { $in: ['DangMuon', 'DaTra'] },
    NgayMuon: { $ne: null },
  };

  if (startDate || endDate) {
    matchStage.NgayMuon = {};
    if (startDate) {
      matchStage.NgayMuon.$gte = startDate;
    }
    if (endDate) {
      matchStage.NgayMuon.$lte = endDate;
    }
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$MaDocGia',
        soLuotMuon: { $sum: 1 },
        tongPhat: { $sum: { $ifNull: ['$TienPhat', 0] } },
      },
    },
    {
      $sort: {
        soLuotMuon: -1,
        _id: 1, // MaDocGia tăng dần khi hòa
      },
    },
    { $limit: safeLimit },
    {
      $lookup: {
        from: 'DocGia',
        localField: '_id',
        foreignField: 'MaDocGia',
        as: 'docGiaDoc',
      },
    },
    {
      $project: {
        _id: 0,
        MaDocGia: '$_id',
        HoTen: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: [{ $arrayElemAt: ['$docGiaDoc.HoLot', 0] }, ''] },
                ' ',
                { $ifNull: [{ $arrayElemAt: ['$docGiaDoc.Ten', 0] }, ''] },
              ],
            },
          },
        },
        soLuotMuon: 1,
        tongPhat: 1,
      },
    },
  ];

  const results = await TheoDoiMuonSach.aggregate(pipeline);
  return results;
};

export default {
  TIMEZONE,
  getCurrentYearVN,
  getDatePartsVN,
  parseDateRangeVN,
  getOverviewStats,
  getTopBooks,
  getBorrowByMonth,
  getOverdueList,
  getFinesStats,
  getTopReaders,
};
