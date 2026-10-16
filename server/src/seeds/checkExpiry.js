import http from 'http';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import app from '../app.js';
import {
  DocGia,
  Sach,
  NhaXuatBan,
  NhanVien,
  TheoDoiMuonSach,
  NhatKy,
} from '../models/index.js';
import { signAccessToken } from '../services/auth.service.js';
import {
  expireStaleApprovals,
  sweepIfDue,
  getSweepStats,
  _resetSweepStateForTest,
} from '../services/expiry.service.js';
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
} from '../services/scheduler.js';

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
          body: json,
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

const PREFIX = 'TEST_EXP_';
const NXB_CODE = 'NXB_TEST_EXP';

const createTestBook = (overrides = {}) => {
  return Sach.create({
    MaSach: overrides.MaSach || `S99${Math.floor(10 + Math.random() * 89)}`,
    TenSach: overrides.TenSach || 'Sách Test P3-5',
    DonGia: overrides.DonGia || 100000,
    SoQuyen: overrides.SoQuyen || 10,
    SoQuyenConLai: overrides.SoQuyenConLai !== undefined ? overrides.SoQuyenConLai : 5,
    MaNXB: NXB_CODE,
    NguonGocTacGia: overrides.NguonGocTacGia || 'Tác Giả Test',
    DaXoa: overrides.DaXoa || false,
    ...overrides,
  });
};

const cleanTestData = async () => {
  try {
    await NhaXuatBan.deleteMany({ MaNXB: NXB_CODE });
    await Sach.deleteMany({
      $or: [
        { MaSach: new RegExp(`^${PREFIX}`) },
        { MaSach: /^S99/ },
      ],
    });
    await DocGia.deleteMany({ MaDocGia: new RegExp(`^${PREFIX}`) });
    await NhanVien.deleteMany({ MSNV: new RegExp(`^${PREFIX}`) });
    await TheoDoiMuonSach.deleteMany({
      $or: [
        { MaDocGia: new RegExp(`^${PREFIX}`) },
        { MaSach: new RegExp(`^${PREFIX}`) },
        { MaSach: /^S99/ },
      ],
    });
    await NhatKy.deleteMany({
      $or: [
        { MSNV: new RegExp(`^${PREFIX}`) },
        { 'ChiTiet.MaDocGia': new RegExp(`^${PREFIX}`) },
        { 'ChiTiet.MaSach': new RegExp(`^${PREFIX}`) },
        { 'ChiTiet.MaSach': /^S99/ },
      ],
    });
  } catch (err) {
    console.error('Lỗi khi dọn dữ liệu test:', err.message);
  }
};

const runTests = async () => {
  console.log('================================================================');
  console.log('KIỂM TRA TỰ ĐỘNG TASK P3-5: HẾT HẠN NHẬN SÁCH & HOÀN KHO');
  console.log('================================================================\n');

  await connectDB();
  await cleanTestData();

  const server = app.listen(0);
  const startTime = Date.now();

  try {
    // -------------------------------------------------------------
    // CHUẨN BỊ DỮ LIỆU CƠ BẢN
    // -------------------------------------------------------------
    await NhaXuatBan.create({
      MaNXB: NXB_CODE,
      TenNXB: 'NXB Test Expiry P3-5',
      DiaChi: '123 Test St',
    });

    const staffThuthu = await NhanVien.create({
      MSNV: `${PREFIX}TT01`,
      HoTenNV: 'Thủ Thư Test',
      Password: 'Password123',
      VaiTro: 'thuthu',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const staffAdmin = await NhanVien.create({
      MSNV: `${PREFIX}AD01`,
      HoTenNV: 'Admin Test',
      Password: 'Password123',
      VaiTro: 'admin',
      TrangThai: 'HoatDong',
      BatBuocDoiMatKhau: false,
    });

    const reader1 = await DocGia.create({
      MaDocGia: `${PREFIX}DG01`,
      HoLot: 'Nguyễn',
      Ten: 'Độc Giả 1',
      NgaySinh: new Date('2000-01-01'),
      Phai: 'Nam',
      Email: `${PREFIX.toLowerCase()}dg01@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    const reader2 = await DocGia.create({
      MaDocGia: `${PREFIX}DG02`,
      HoLot: 'Trần',
      Ten: 'Độc Giả 2',
      NgaySinh: new Date('2001-02-02'),
      Phai: 'Nu',
      Email: `${PREFIX.toLowerCase()}dg02@test.vn`,
      Password: 'Password123',
      TrangThai: 'HoatDong',
    });

    const tokenThuthu = signAccessToken(staffThuthu, 'nhanvien');
    const tokenReader1 = signAccessToken(reader1, 'docgia');

    // -------------------------------------------------------------
    // a. PHIẾU DADUYET QUÁ HẠN NHẬN SÁCH
    // -------------------------------------------------------------
    console.log('--- a. Phiếu DaDuyet quá HanNhanSach bị hủy & hoàn kho ---');
    try {
      const bA = await createTestBook({
        MaSach: 'S9901',
        TenSach: 'Sách Test A',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pA = await TheoDoiMuonSach.create({
        MaDocGia: reader1.MaDocGia,
        MaSach: bA.MaSach,
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(Date.now() - 3 * 86400000),
        HanNhanSach: new Date(Date.now() - 86400000), // Quá hạn 1 ngày
        MSNVDuyet: staffThuthu.MSNV,
      });

      const resA = await expireStaleApprovals({ now: new Date() });
      if (resA.daHuy < 1) {
        throw new Error(`Kỳ vọng daHuy >= 1, nhận được ${resA.daHuy}`);
      }

      const pAUpdated = await TheoDoiMuonSach.findById(pA._id).lean();
      if (pAUpdated.TrangThai !== 'DaHuy') {
        throw new Error(`Trạng thái phiếu phải là DaHuy, nhận được ${pAUpdated.TrangThai}`);
      }

      const bAUpdated = await Sach.findOne({ MaSach: bA.MaSach }).lean();
      if (bAUpdated.SoQuyenConLai !== 6 || bAUpdated.SoQuyen !== 10) {
        throw new Error(`Kho kỳ vọng SoQuyenConLai=6, SoQuyen=10, nhận được ConLai=${bAUpdated.SoQuyenConLai}, Tong=${bAUpdated.SoQuyen}`);
      }

      const logA = await NhatKy.findOne({
        MaDoiTuong: String(pA._id),
        HanhDong: 'HET_HAN_NHAN_SACH',
      }).lean();
      if (!logA || logA.MSNV !== 'HE_THONG') {
        throw new Error('Thiếu bản ghi nhật ký HET_HAN_NHAN_SACH với tác nhân HE_THONG');
      }

      logPass('a. Phiếu DaDuyet quá hạn: chuyển DaHuy, kho +1, SoQuyen không đổi, ghi NhatKy tác nhân hệ thống');
    } catch (err) {
      logFail('a. Phiếu DaDuyet quá HanNhanSach', err);
    }

    // -------------------------------------------------------------
    // b. KHÔNG ĐỤNG TỚI PHIẾU CÒN HẠN VÀ CÁC TRẠNG THÁI KHÁC
    // -------------------------------------------------------------
    console.log('\n--- b. Không đụng tới phiếu còn hạn và các trạng thái khác ---');
    try {
      const bB = await createTestBook({
        MaSach: 'S9902',
        TenSach: 'Sách Test B',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pastDate = new Date(Date.now() - 5 * 86400000);
      const futureDate = new Date(Date.now() + 2 * 86400000);

      // 1. DaDuyet còn hạn
      const pValid = await TheoDoiMuonSach.create({
        MaDocGia: reader2.MaDocGia,
        MaSach: bB.MaSach,
        TrangThai: 'DaDuyet',
        NgayDuyet: new Date(),
        HanNhanSach: futureDate,
        MSNVDuyet: staffThuthu.MSNV,
      });

      // 2. ChoDuyet
      const pChoDuyet = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG03`,
        MaSach: 'S9903',
        TrangThai: 'ChoDuyet',
        NgayDangKy: pastDate,
      });

      // 3. DangMuon quá hạn
      const pDangMuon = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG04`,
        MaSach: 'S9904',
        TrangThai: 'DangMuon',
        NgayMuon: pastDate,
        HanTra: pastDate,
      });

      // 4. DaTra
      const pDaTra = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG05`,
        MaSach: 'S9905',
        TrangThai: 'DaTra',
        NgayTra: pastDate,
      });

      // 5. TuChoi
      const pTuChoi = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG06`,
        MaSach: 'S9906',
        TrangThai: 'TuChoi',
        LyDoTuChoi: 'Lý do từ chối',
      });

      // 6. DaHuy
      const pDaHuy = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG07`,
        MaSach: 'S9907',
        TrangThai: 'DaHuy',
      });

      await expireStaleApprovals({ now: new Date() });

      const checkValid = await TheoDoiMuonSach.findById(pValid._id).lean();
      const checkChoDuyet = await TheoDoiMuonSach.findById(pChoDuyet._id).lean();
      const checkDangMuon = await TheoDoiMuonSach.findById(pDangMuon._id).lean();
      const checkDaTra = await TheoDoiMuonSach.findById(pDaTra._id).lean();
      const checkTuChoi = await TheoDoiMuonSach.findById(pTuChoi._id).lean();
      const checkDaHuy = await TheoDoiMuonSach.findById(pDaHuy._id).lean();

      if (
        checkValid.TrangThai !== 'DaDuyet' ||
        checkChoDuyet.TrangThai !== 'ChoDuyet' ||
        checkDangMuon.TrangThai !== 'DangMuon' ||
        checkDaTra.TrangThai !== 'DaTra' ||
        checkTuChoi.TrangThai !== 'TuChoi' ||
        checkDaHuy.TrangThai !== 'DaHuy'
      ) {
        throw new Error('Các phiếu không thuộc diện hết hạn bị thay đổi trạng thái');
      }

      const bBCheck = await Sach.findOne({ MaSach: bB.MaSach }).lean();
      if (bBCheck.SoQuyenConLai !== 5) {
        throw new Error(`Kho sách còn hạn bị thay đổi: SoQuyenConLai=${bBCheck.SoQuyenConLai}`);
      }

      logPass('b. Không đụng tới phiếu còn hạn và các trạng thái khác (ChoDuyet, DangMuon, DaTra, TuChoi, DaHuy)');
    } catch (err) {
      logFail('b. Kiểm tra trạng thái không đụng tới', err);
    }

    // -------------------------------------------------------------
    // c. MỐC BIÊN: ĐÚNG BẰNG HẠN CHƯA HẾT, SỚM HƠN 1MS HẾT HẠN
    // -------------------------------------------------------------
    console.log('\n--- c. Mốc biên thời gian (HanNhanSach == now vs < now) ---');
    try {
      const fixedNow = new Date('2026-10-16T12:00:00.000Z');
      const bC = await createTestBook({
        MaSach: 'S9908',
        TenSach: 'Sách Test C',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      // Phiếu 1: Đúng bằng now -> Chưa hết hạn
      const pExact = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_C1`,
        MaSach: bC.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: fixedNow,
        MSNVDuyet: staffThuthu.MSNV,
      });

      // Phiếu 2: Sớm hơn đúng 1ms -> Hết hạn
      const pEarlier = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_C2`,
        MaSach: bC.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(fixedNow.getTime() - 1),
        MSNVDuyet: staffThuthu.MSNV,
      });

      await expireStaleApprovals({ now: fixedNow });

      const checkExact = await TheoDoiMuonSach.findById(pExact._id).lean();
      const checkEarlier = await TheoDoiMuonSach.findById(pEarlier._id).lean();

      if (checkExact.TrangThai !== 'DaDuyet') {
        throw new Error('Phiếu có HanNhanSach đúng bằng now không được coi là hết hạn');
      }
      if (checkEarlier.TrangThai !== 'DaHuy') {
        throw new Error('Phiếu có HanNhanSach sớm hơn 1ms phải bị hủy do hết hạn');
      }

      logPass('c. Mốc biên: đúng bằng hạn chưa hết hạn; sớm hơn 1 mili giây thì hết hạn');
    } catch (err) {
      logFail('c. Mốc biên thời gian', err);
    }

    // -------------------------------------------------------------
    // d. DỮ LIỆU CŨ THIẾU HANNHANSACH: BỎ QUA, KHÔNG CRASH, CÓ WARNING
    // -------------------------------------------------------------
    console.log('\n--- d. Dữ liệu cũ thiếu HanNhanSach ---');
    try {
      const bD = await createTestBook({
        MaSach: 'S9909',
        TenSach: 'Sách Test D',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pMissing = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_D`,
        MaSach: bD.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: null, // Thiếu HanNhanSach
        MSNVDuyet: staffThuthu.MSNV,
      });

      let warningLogged = false;
      const originalWarn = console.warn;
      console.warn = (...args) => {
        warningLogged = true;
        originalWarn(...args);
      };

      try {
        await expireStaleApprovals({ now: new Date() });
      } finally {
        console.warn = originalWarn;
      }

      const checkMissing = await TheoDoiMuonSach.findById(pMissing._id).lean();
      if (checkMissing.TrangThai !== 'DaDuyet') {
        throw new Error('Phiếu thiếu HanNhanSach không được chuyển DaHuy');
      }
      if (!warningLogged) {
        throw new Error('Không thấy log cảnh báo cho phiếu thiếu HanNhanSach');
      }

      // Dọn phiếu thiếu HanNhanSach để không ảnh hưởng các test phía sau
      await TheoDoiMuonSach.deleteOne({ _id: pMissing._id });

      logPass('d. Dữ liệu cũ thiếu HanNhanSach: bỏ qua, không crash, có log cảnh báo');
    } catch (err) {
      logFail('d. Dữ liệu cũ thiếu HanNhanSach', err);
    }

    // -------------------------------------------------------------
    // e. CHẠY LẠI NHIỀU LẦN: LẦN 2 TRỞ ĐI DAHUY = 0, KHO KHÔNG CỘNG THÊM
    // -------------------------------------------------------------
    console.log('\n--- e. Chạy lại nhiều lần liên tiếp (Idempotent) ---');
    try {
      const bE = await createTestBook({
        MaSach: 'S9910',
        TenSach: 'Sách Test E',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_E`,
        MaSach: bE.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      const res1 = await expireStaleApprovals({ now: new Date() });
      const bE1 = await Sach.findOne({ MaSach: bE.MaSach }).lean();
      if (res1.daHuy !== 1 || bE1.SoQuyenConLai !== 6) {
        throw new Error('Lần chạy 1 thất bại');
      }

      // Chạy lần 2
      const res2 = await expireStaleApprovals({ now: new Date() });
      const bE2 = await Sach.findOne({ MaSach: bE.MaSach }).lean();

      if (res2.daHuy !== 0) {
        throw new Error(`Lần chạy 2 kỳ vọng daHuy = 0, nhận được ${res2.daHuy}`);
      }
      if (bE2.SoQuyenConLai !== 6) {
        throw new Error(`Kho bị cộng thêm ở lần chạy 2: ${bE2.SoQuyenConLai}`);
      }

      logPass('e. Chạy lại nhiều lần liên tiếp: lần hai trở đi daHuy = 0, kho không bị cộng thêm');
    } catch (err) {
      logFail('e. Chạy lại nhiều lần liên tiếp', err);
    }

    // -------------------------------------------------------------
    // f. ĐUA: 5 LƯỢT EXPIRE SONG SONG TRÊN CÙNG TẬP PHIẾU (LẶP 5 LẦN)
    // -------------------------------------------------------------
    console.log('\n--- f. Đua 5 lượt expireStaleApprovals song song (lặp 5 lần) ---');
    try {
      for (let round = 1; round <= 5; round++) {
        const bF = await createTestBook({
          MaSach: `${PREFIX}S_F_${round}`,
          TenSach: `Sách Test F ${round}`,
          DonGia: 100000,
          SoQuyen: 20,
          SoQuyenConLai: 10,
          MaNXB: NXB_CODE,
        });

        // Tạo 3 phiếu hết hạn cho cuốn sách này
        await Promise.all([
          TheoDoiMuonSach.create({
            MaDocGia: `${PREFIX}DG_F1_${round}`,
            MaSach: bF.MaSach,
            TrangThai: 'DaDuyet',
            HanNhanSach: new Date(Date.now() - 3600000),
            MSNVDuyet: staffThuthu.MSNV,
          }),
          TheoDoiMuonSach.create({
            MaDocGia: `${PREFIX}DG_F2_${round}`,
            MaSach: bF.MaSach,
            TrangThai: 'DaDuyet',
            HanNhanSach: new Date(Date.now() - 3600000),
            MSNVDuyet: staffThuthu.MSNV,
          }),
          TheoDoiMuonSach.create({
            MaDocGia: `${PREFIX}DG_F3_${round}`,
            MaSach: bF.MaSach,
            TrangThai: 'DaDuyet',
            HanNhanSach: new Date(Date.now() - 3600000),
            MSNVDuyet: staffThuthu.MSNV,
          }),
        ]);

        // Bắn 5 lệnh quét song song (skipConcurrencyCheck: true để kiểm tra đua tầng DB)
        const results = await Promise.all([
          expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
          expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
          expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
          expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
          expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
        ]);

        const totalDaHuy = results.reduce((acc, cur) => acc + cur.daHuy, 0);
        if (totalDaHuy !== 3) {
          throw new Error(`Vòng ${round}: Tổng số phiếu đã hủy kỳ vọng 3, nhận được ${totalDaHuy}`);
        }

        const bFUpdated = await Sach.findOne({ MaSach: bF.MaSach }).lean();
        if (bFUpdated.SoQuyenConLai !== 13) {
          throw new Error(`Vòng ${round}: Kho kỳ vọng 13, nhận được ${bFUpdated.SoQuyenConLai}`);
        }
        if (bFUpdated.SoQuyenConLai > bFUpdated.SoQuyen || bFUpdated.SoQuyenConLai < 0) {
          throw new Error(`Vòng ${round}: Vi phạm bất biến kho: ConLai=${bFUpdated.SoQuyenConLai}, Tong=${bFUpdated.SoQuyen}`);
        }
      }

      logPass('f. Đua 5 lượt expire song song lặp 5 lần: mỗi phiếu hoàn kho đúng 1 lần, bất biến kho giữ vững');
    } catch (err) {
      logFail('f. Đua 5 lượt expire song song', err);
    }

    // -------------------------------------------------------------
    // g. ĐUA VỚI ĐƯỜNG KHÁC (EXPIRE VS HANDOVER, USER CANCEL, ADMIN CANCEL)
    // -------------------------------------------------------------
    console.log('\n--- g. Đua với đường khác (Handover, User Cancel, Admin Cancel) ---');
    try {
      // 1. Expire vs Handover
      const bG1 = await createTestBook({
        MaSach: 'S9912',
        TenSach: 'Sách Test G1',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pG1 = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_G1`,
        MaSach: bG1.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000), // Đã hết hạn
        MSNVDuyet: staffThuthu.MSNV,
      });

      // Bắn đồng thời expire và handover qua HTTP
      const [resExp1, resHandover1] = await Promise.all([
        expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
        request(server, {
          path: `/api/admin/borrowings/${pG1._id}/handover`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenThuthu}` },
        }),
      ]);

      // Handover phải thất bại với 409 INVALID_STATE do phiếu đã quá hạn
      if (resHandover1.status !== 409) {
        throw new Error(`Handover phiếu quá hạn phải trả 409, nhận được ${resHandover1.status}`);
      }

      const pG1Final = await TheoDoiMuonSach.findById(pG1._id).lean();
      if (pG1Final.TrangThai !== 'DaHuy') {
        throw new Error(`Trạng thái cuối cùng phải là DaHuy, nhận được ${pG1Final.TrangThai}`);
      }

      const bG1Final = await Sach.findOne({ MaSach: bG1.MaSach }).lean();
      if (bG1Final.SoQuyenConLai !== 6) {
        throw new Error(`Kho chỉ được hoàn đúng +1 (từ 5 lên 6), nhận được ${bG1Final.SoQuyenConLai}`);
      }

      // 2. Expire vs User Cancel
      const bG2 = await createTestBook({
        MaSach: 'S9913',
        TenSach: 'Sách Test G2',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pG2 = await TheoDoiMuonSach.create({
        MaDocGia: reader1.MaDocGia,
        MaSach: bG2.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      await Promise.all([
        expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
        request(server, {
          path: `/api/user/borrowings/${pG2._id}/cancel`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenReader1}` },
        }),
      ]);

      const bG2Final = await Sach.findOne({ MaSach: bG2.MaSach }).lean();
      if (bG2Final.SoQuyenConLai !== 6) {
        throw new Error(`Kho sau đua Expire vs User Cancel phải là 6, nhận được ${bG2Final.SoQuyenConLai}`);
      }

      // 3. Expire vs Admin Cancel
      const bG3 = await createTestBook({
        MaSach: 'S9914',
        TenSach: 'Sách Test G3',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      const pG3 = await TheoDoiMuonSach.create({
        MaDocGia: reader2.MaDocGia,
        MaSach: bG3.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      await Promise.all([
        expireStaleApprovals({ now: new Date(), skipConcurrencyCheck: true }),
        request(server, {
          path: `/api/admin/borrowings/${pG3._id}/cancel`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenThuthu}` },
        }),
      ]);

      const bG3Final = await Sach.findOne({ MaSach: bG3.MaSach }).lean();
      if (bG3Final.SoQuyenConLai !== 6) {
        throw new Error(`Kho sau đua Expire vs Admin Cancel phải là 6, nhận được ${bG3Final.SoQuyenConLai}`);
      }

      logPass('g. Đua expire với handover, user cancel, admin cancel: nhất quán hoàn kho đúng 1 lần, không tạo DangMuon');
    } catch (err) {
      logFail('g. Đua với đường khác', err);
    }

    // -------------------------------------------------------------
    // h. HANDOVER PHIẾU QUÁ HANNHANSACH (CRON CHƯA CHẠY) -> 409 INVALID_STATE
    // -------------------------------------------------------------
    console.log('\n--- h. Handover phiếu quá hạn nhận sách tức thời ---');
    try {
      const bH = await createTestBook({
        MaSach: 'S9915',
        TenSach: 'Sách Test H',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      // Phiếu quá hạn
      const pExpired = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_H1`,
        MaSach: bH.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      const resH1 = await request(server, {
        path: `/api/admin/borrowings/${pExpired._id}/handover`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });

      if (resH1.status !== 409) {
        throw new Error(`Kỳ vọng 409 INVALID_STATE khi giao phiếu quá hạn, nhận được ${resH1.status}`);
      }
      const errorMsg = resH1.body?.error?.message || resH1.body?.message || '';
      if (!errorMsg.includes('quá hạn nhận sách')) {
        throw new Error(`Thông báo lỗi không đúng nội dung: ${errorMsg}`);
      }

      const checkExpired = await TheoDoiMuonSach.findById(pExpired._id).lean();
      if (checkExpired.TrangThai !== 'DaHuy') {
        throw new Error(`Phiếu phải được tự động chuyển DaHuy, nhận được ${checkExpired.TrangThai}`);
      }

      const bHAfterExpired = await Sach.findOne({ MaSach: bH.MaSach }).lean();
      if (bHAfterExpired.SoQuyenConLai !== 6) {
        throw new Error(`Kho phải được hoàn +1 (lên 6), nhận được ${bHAfterExpired.SoQuyenConLai}`);
      }

      // Phiếu còn hạn -> Giao bình thường 200
      const pValidH = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_H2`,
        MaSach: bH.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() + 86400000), // Còn hạn 1 ngày
        MSNVDuyet: staffThuthu.MSNV,
      });

      const resH2 = await request(server, {
        path: `/api/admin/borrowings/${pValidH._id}/handover`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenThuthu}` },
      });

      if (resH2.status !== 200) {
        throw new Error(`Phiếu còn hạn giao sách phải thành công 200, nhận được ${resH2.status}`);
      }
      const checkValidH = await TheoDoiMuonSach.findById(pValidH._id).lean();
      if (checkValidH.TrangThai !== 'DangMuon') {
        throw new Error(`Phiếu còn hạn phải chuyển DangMuon, nhận được ${checkValidH.TrangThai}`);
      }

      logPass('h. Handover phiếu quá HanNhanSach tức thời trả 409, phiếu thành DaHuy, kho +1; phiếu còn hạn giao 200');
    } catch (err) {
      logFail('h. Handover phiếu quá HanNhanSach tức thời', err);
    }

    // -------------------------------------------------------------
    // i. SÁCH ĐÃ XÓA MỀM (DaXoa = true)
    // -------------------------------------------------------------
    console.log('\n--- i. Sách đã xóa mềm vẫn hủy phiếu và hoàn kho đúng ---');
    try {
      const bI = await createTestBook({
        MaSach: 'S9916',
        TenSach: 'Sách Xóa Mềm Test I',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 4,
        DaXoa: true,
        MaNXB: NXB_CODE,
      });

      const pI = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_I`,
        MaSach: bI.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      await expireStaleApprovals({ now: new Date() });

      const pIUpdate = await TheoDoiMuonSach.findById(pI._id).lean();
      if (pIUpdate.TrangThai !== 'DaHuy') {
        throw new Error(`Phiếu sách xóa mềm phải thành DaHuy, nhận được ${pIUpdate.TrangThai}`);
      }

      const bIUpdate = await Sach.findOne({ MaSach: bI.MaSach }).lean();
      if (bIUpdate.SoQuyenConLai !== 5) {
        throw new Error(`Kho sách xóa mềm phải hoàn +1 (lên 5), nhận được ${bIUpdate.SoQuyenConLai}`);
      }

      logPass('i. Sách đã xóa mềm: phiếu hết hạn vẫn bị hủy và kho vẫn hoàn đúng');
    } catch (err) {
      logFail('i. Sách đã xóa mềm', err);
    }

    // -------------------------------------------------------------
    // j. MỘT PHIẾU LỖI KHÔNG CHẶN CÁC PHIẾU KHÁC
    // -------------------------------------------------------------
    console.log('\n--- j. Một phiếu lỗi không chặn các phiếu khác (độc lập) ---');
    try {
      // Sách J1 có dữ liệu bất thường: SoQuyenConLai = SoQuyen = 5 (không thể +1)
      const bJ1 = await createTestBook({
        MaSach: 'S9917',
        TenSach: 'Sách Bất Thường J1',
        DonGia: 100000,
        SoQuyen: 5,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      // Sách J2 bình thường
      const bJ2 = await createTestBook({
        MaSach: 'S9918',
        TenSach: 'Sách Bình Thường J2',
        DonGia: 100000,
        SoQuyen: 5,
        SoQuyenConLai: 2,
        MaNXB: NXB_CODE,
      });

      const pJ1 = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_J1`,
        MaSach: bJ1.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      const pJ2 = await TheoDoiMuonSach.create({
        MaDocGia: `${PREFIX}DG_J2`,
        MaSach: bJ2.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() - 3600000),
        MSNVDuyet: staffThuthu.MSNV,
      });

      const resJ = await expireStaleApprovals({ now: new Date() });

      if (resJ.loi < 1) {
        throw new Error(`Kỳ vọng loi >= 1, nhận được ${resJ.loi}`);
      }
      if (resJ.daHuy < 1) {
        throw new Error(`Kỳ vọng daHuy >= 1 cho phiếu bình thường, nhận được ${resJ.daHuy}`);
      }

      // Phiếu J1 phải được hoàn tác về DaDuyet
      const pJ1Check = await TheoDoiMuonSach.findById(pJ1._id).lean();
      if (pJ1Check.TrangThai !== 'DaDuyet') {
        throw new Error(`Phiếu lỗi J1 phải được hoàn tác về DaDuyet, nhận được ${pJ1Check.TrangThai}`);
      }

      // Phiếu J2 được hủy thành công
      const pJ2Check = await TheoDoiMuonSach.findById(pJ2._id).lean();
      if (pJ2Check.TrangThai !== 'DaHuy') {
        throw new Error(`Phiếu bình thường J2 phải thành DaHuy, nhận được ${pJ2Check.TrangThai}`);
      }

      const bJ2Check = await Sach.findOne({ MaSach: bJ2.MaSach }).lean();
      if (bJ2Check.SoQuyenConLai !== 3) {
        throw new Error(`Sách J2 phải được hoàn kho +1 (lên 3), nhận được ${bJ2Check.SoQuyenConLai}`);
      }

      // Dọn phiếu lỗi J1 để không ảnh hưởng các test sau
      await TheoDoiMuonSach.deleteMany({ _id: { $in: [pJ1._id, pJ2._id] } });
      await Sach.deleteMany({ MaSach: { $in: [bJ1.MaSach, bJ2.MaSach] } });

      logPass('j. Một phiếu lỗi không chặn phiếu khác: phiếu lỗi hoàn tác về DaDuyet, phiếu khác xử lý thành công');
    } catch (err) {
      logFail('j. Một phiếu lỗi không chặn phiếu khác', err);
    }

    // -------------------------------------------------------------
    // k. GIỚI HẠN LIMIT MỖI LƯỢT XỬ LÝ
    // -------------------------------------------------------------
    console.log('\n--- k. Giới hạn limit mỗi lượt quét ---');
    try {
      const bK = await createTestBook({
        MaSach: 'S9919',
        TenSach: 'Sách Test K',
        DonGia: 100000,
        SoQuyen: 20,
        SoQuyenConLai: 10,
        MaNXB: NXB_CODE,
      });

      for (let i = 1; i <= 5; i++) {
        await TheoDoiMuonSach.create({
          MaDocGia: `${PREFIX}DG_K_${i}`,
          MaSach: bK.MaSach,
          TrangThai: 'DaDuyet',
          HanNhanSach: new Date(Date.now() - (6 - i) * 3600000),
          MSNVDuyet: staffThuthu.MSNV,
        });
      }

      // Lượt 1: limit 2
      const resK1 = await expireStaleApprovals({ now: new Date(), limit: 2 });
      if (resK1.daHuy !== 2) {
        throw new Error(`Lượt 1 limit=2 kỳ vọng daHuy=2, nhận được ${resK1.daHuy}`);
      }

      // Lượt 2: limit 2
      const resK2 = await expireStaleApprovals({ now: new Date(), limit: 2 });
      if (resK2.daHuy !== 2) {
        throw new Error(`Lượt 2 limit=2 kỳ vọng daHuy=2, nhận được ${resK2.daHuy}`);
      }

      // Lượt 3: limit 2 (xử lý 1 phiếu còn lại)
      const resK3 = await expireStaleApprovals({ now: new Date(), limit: 2 });
      if (resK3.daHuy !== 1) {
        throw new Error(`Lượt 3 limit=2 kỳ vọng daHuy=1, nhận được ${resK3.daHuy}`);
      }

      logPass('k. Limit: 5 phiếu hết hạn với limit = 2 thì mỗi lượt xử lý tối đa 2; các lượt sau xử lý nốt');
    } catch (err) {
      logFail('k. Giới hạn limit', err);
    }

    // -------------------------------------------------------------
    // l. TƯƠNG TÁC QUY TẮC MƯỢN (GIẢI PHÓNG HẠN MỨC & CHỐNG MƯỢN TRÙNG)
    // -------------------------------------------------------------
    console.log('\n--- l. Tương tác với quy tắc mượn (độc giả) ---');
    try {
      const bL = await createTestBook({
        MaSach: 'S9920',
        TenSach: 'Sách Test L',
        DonGia: 100000,
        SoQuyen: 10,
        SoQuyenConLai: 5,
        MaNXB: NXB_CODE,
      });

      // 1. Tạo phiếu pL ở DaDuyet còn hạn
      const pL = await TheoDoiMuonSach.create({
        MaDocGia: reader1.MaDocGia,
        MaSach: bL.MaSach,
        TrangThai: 'DaDuyet',
        HanNhanSach: new Date(Date.now() + 86400000), // Còn hạn
        MSNVDuyet: staffThuthu.MSNV,
      });

      // Trước khi hủy: Đăng ký mượn trùng cuốn bL -> 409 ALREADY_BORROWING
      const resBeforeExpire = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenReader1}`,
            'Content-Type': 'application/json',
          },
        },
        { MaSach: bL.MaSach }
      );

      if (resBeforeExpire.status !== 409 || resBeforeExpire.body?.error?.code !== 'ALREADY_BORROWING') {
        throw new Error(`Trước khi hủy, đăng ký trùng phải bị 409 ALREADY_BORROWING, nhận được ${resBeforeExpire.status}`);
      }

      // 2. Giả lập quá hạn và hủy phiếu do hết hạn nhận sách
      await TheoDoiMuonSach.updateOne(
        { _id: pL._id },
        { $set: { HanNhanSach: new Date(Date.now() - 3600000) } }
      );
      await expireStaleApprovals({ now: new Date() });

      // 3. Sau khi hủy: Đăng ký lại cùng cuốn sách thành công 201
      const resAfterExpire = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenReader1}`,
            'Content-Type': 'application/json',
          },
        },
        { MaSach: bL.MaSach }
      );

      if (resAfterExpire.status !== 201) {
        throw new Error(`Sau khi hết hạn, độc giả phải đăng ký lại được (201), nhận được ${resAfterExpire.status}`);
      }

      // Lúc này phiếu mới ở ChoDuyet đang chiếm chỗ, thử đăng ký trùng lần nữa -> 409 ALREADY_BORROWING
      const resDuplicate = await request(
        server,
        {
          path: '/api/user/borrowings',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenReader1}`,
            'Content-Type': 'application/json',
          },
        },
        { MaSach: bL.MaSach }
      );

      if (resDuplicate.status !== 409 || resDuplicate.body?.error?.code !== 'ALREADY_BORROWING') {
        throw new Error(`Đăng ký trùng phải trả 409 ALREADY_BORROWING, nhận được ${resDuplicate.status}`);
      }

      logPass('l. Tương tác: Sau khi hết hạn bị hủy, độc giả không bị chiếm chỗ và đăng ký lại được cùng cuốn sách');
    } catch (err) {
      logFail('l. Tương tác quy tắc mượn', err);
    }

    // -------------------------------------------------------------
    // m. SWEEPIFDUE: GỌI NHIỀU LẦN TRONG 60S CHỈ QUÉT THẬT 1 LẦN
    // -------------------------------------------------------------
    console.log('\n--- m. sweepIfDue (quét thưa & an toàn ngoại lệ) ---');
    try {
      _resetSweepStateForTest();

      const initialStats = getSweepStats();
      const initialCount = initialStats.sweepCount;

      // Gọi 10 lần liên tiếp trong cùng 1 thời điểm
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(sweepIfDue({ now: new Date() }));
      }
      await Promise.all(promises);

      const afterStats = getSweepStats();
      if (afterStats.sweepCount - initialCount !== 1) {
        throw new Error(`Kỳ vọng sweepCount chỉ tăng đúng 1 lần, nhận được ${afterStats.sweepCount - initialCount}`);
      }

      // Kiểm tra an toàn: Lỗi bên trong không ném ra ngoài
      const safeResult = await sweepIfDue({ now: 'invalid-date-format-trigger' });
      if (typeof safeResult !== 'object') {
        throw new Error('sweepIfDue phải trả về object kể cả khi có tham số lạ');
      }

      logPass('m. sweepIfDue: gọi liên tiếp trong 60s chỉ quét thật 1 lần, lỗi bên trong không ném ra ngoài');
    } catch (err) {
      logFail('m. sweepIfDue', err);
    }

    // -------------------------------------------------------------
    // n. SCHEDULER: START 2 LẦN IDEMPOTENT, STOP HẲN, KHÔNG CHẠY KHI NODE_ENV=TEST
    // -------------------------------------------------------------
    console.log('\n--- n. Scheduler (Bộ lập lịch) ---');
    try {
      // 1. Chạy startScheduler ở môi trường thông thường
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const firstStart = startScheduler({ intervalMs: 2000 });
      if (!firstStart) {
        throw new Error('Lần gọi startScheduler đầu tiên phải trả về true');
      }

      const secondStart = startScheduler({ intervalMs: 2000 });
      if (secondStart) {
        throw new Error('Lần gọi startScheduler thứ hai phải trả về false (idempotent)');
      }

      let status = getSchedulerStatus();
      if (!status.isRunning) {
        throw new Error('Scheduler phải có trạng thái isRunning = true');
      }

      // Dừng scheduler
      await stopScheduler();
      status = getSchedulerStatus();
      if (status.isRunning) {
        throw new Error('Scheduler sau khi stop phải có isRunning = false');
      }

      // 2. Không khởi động khi NODE_ENV = test
      process.env.NODE_ENV = 'test';
      const testEnvStart = startScheduler({ intervalMs: 2000 });
      if (testEnvStart) {
        throw new Error('Khi NODE_ENV = test, startScheduler không được khởi động');
      }
      status = getSchedulerStatus();
      if (status.isRunning) {
        throw new Error('Scheduler không được chạy khi NODE_ENV = test');
      }

      // Khôi phục NODE_ENV
      process.env.NODE_ENV = savedEnv;

      logPass('n. Scheduler: startScheduler gọi hai lần chỉ tạo 1 lịch, stopScheduler dừng hẳn, không chạy khi NODE_ENV=test');
    } catch (err) {
      logFail('n. Scheduler', err);
    }
  } finally {
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
    await cleanTestData();
    server.close();
    await disconnectDB();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n================================================================`);
    console.log(`TỔNG KẾT KIỂM TRA: PASS: ${passedCount} | FAIL: ${failedCount}`);
    console.log(`THỜI GIAN CHẠY: ${duration}s`);
    console.log(`================================================================`);
    if (failedCount > 0) {
      process.exit(1);
    }
  }
};

runTests();
