import { connectDB, disconnectDB } from '../config/db.js';
import { KeSach, Sach } from '../models/index.js';
import { nextCode } from '../services/code.service.js';

const initShelves = async () => {
  try {
    await connectDB();
    console.log('\n--- KHOI TAO DU LIEU KE SACH VA CAP NHAT VI TRI SACH ---');

    // 1. Kiem tra va tao cac ke sach mau neu collection KeSach chua co du lieu
    let shelves = await KeSach.find().sort({ MaKe: 1 });
    if (shelves.length === 0) {
      console.log('Chua co ke sach nao. Dang tao 4 ke sach mau...');
      const sampleShelves = [
        { TenKe: 'Kệ Văn học Việt Nam 01', KhuVuc: 'Tầng 1 - Phòng Đọc A', SoNgan: 5 },
        { TenKe: 'Kệ Khoa học & Công nghệ', KhuVuc: 'Tầng 2 - Khu B', SoNgan: 6 },
        { TenKe: 'Kệ Kỹ năng & Đời sống', KhuVuc: 'Tầng 1 - Khu C', SoNgan: 5 },
        { TenKe: 'Kệ Lịch sử & Địa lý', KhuVuc: 'Tầng 2 - Khu A', SoNgan: 4 },
      ];

      for (const s of sampleShelves) {
        const maKe = await nextCode('KeSach');
        const created = await KeSach.create({
          MaKe: maKe,
          TenKe: s.TenKe,
          KhuVuc: s.KhuVuc,
          SoNgan: s.SoNgan,
        });
        shelves.push(created);
        console.log(`  + Da tao: ${created.MaKe} - ${created.TenKe} (${created.KhuVuc})`);
      }
    } else {
      console.log(`CSDL da co san ${shelves.length} ke sach:`);
      shelves.forEach((s) => {
        console.log(`  * ${s.MaKe}: ${s.TenKe} - ${s.KhuVuc} (${s.SoNgan} ngan)`);
      });
    }

    // 2. Cap nhat MaKe va ViTriNgan cho cac cuon sach chua co vi tri
    const books = await Sach.find({ DaXoa: { $ne: true } }).sort({ MaSach: 1 });
    console.log(`\nTong so sach hien tai: ${books.length} cuon.`);

    let updatedCount = 0;
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      if (!book.MaKe) {
        const targetShelf = shelves[i % shelves.length];
        book.MaKe = targetShelf.MaKe;
        book.ViTriNgan = (i % targetShelf.SoNgan) + 1;
        await book.save();
        updatedCount++;
        console.log(`  -> Gan [${book.MaSach}] "${book.TenSach}" -> ${targetShelf.TenKe} (Ngan ${book.ViTriNgan})`);
      }
    }

    console.log(`\n=> Hoan tat: Da cap nhat vi tri cho ${updatedCount} cuon sach.`);
    console.log('Ban co the mo MongoDB Compass bam nut Refresh (F5 / icon xoay) de xem collection KeSach va cac truong moi!\n');
  } catch (error) {
    console.error('Loi khi khoi tao ke sach:', error);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
};

initShelves();

