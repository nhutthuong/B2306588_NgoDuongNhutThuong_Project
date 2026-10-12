import Counter from '../models/Counter.js';

/**
 * Cau hinh tien to va do dai so dem cho tung collection theo DATABASE.md §1 & §3.9
 */
const CODE_CONFIGS = {
  DocGia: { prefix: 'DG', digits: 4 },
  Sach: { prefix: 'S', digits: 4 },
  NhaXuatBan: { prefix: 'NXB', digits: 3 },
  NhanVien: { prefix: 'NV', digits: 3 },
};

/**
 * Sinh ma nghiep vu tiep theo mot cach nguyen tu bang MongoDB $inc tren collection Counter
 * @param {string} name - Ten doi tuong: 'DocGia' | 'Sach' | 'NhaXuatBan' | 'NhanVien'
 * @returns {Promise<string>} Ma nghiep vu da duoc dinh dang (vd: DG0001, S0001, NXB001, NV001)
 */
export const nextCode = async (name) => {
  const config = CODE_CONFIGS[name];
  if (!config) {
    throw new Error(
      `Ten doi tuong sinh ma khong hop le: ${name}. Chi chap nhan: ${Object.keys(CODE_CONFIGS).join(', ')}`
    );
  }

  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return `${config.prefix}${String(counter.seq).padStart(config.digits, '0')}`;
};

/**
 * Dat lai gia tri counter ve 0 cho mot doi tuong cu the (dung khi seed --reset)
 * @param {string} name
 */
export const resetCounter = async (name) => {
  if (name && !CODE_CONFIGS[name]) {
    throw new Error(`Ten doi tuong sinh ma khong hop le: ${name}`);
  }
  await Counter.findOneAndUpdate(
    { _id: name },
    { $set: { seq: 0 } },
    { upsert: true, new: true }
  );
};

/**
 * Dat lai toan bo cac counter ve 0
 */
export const resetAllCounters = async () => {
  for (const name of Object.keys(CODE_CONFIGS)) {
    await Counter.findOneAndUpdate(
      { _id: name },
      { $set: { seq: 0 } },
      { upsert: true, new: true }
    );
  }
};

export default {
  nextCode,
  resetCounter,
  resetAllCounters,
};
