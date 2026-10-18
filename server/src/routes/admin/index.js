import { Router } from 'express';
import authRoutes from './auth.routes.js';
import publisherRoutes from './publisher.routes.js';
import bookRoutes from './book.routes.js';
import borrowingRoutes from './borrowing.routes.js';
import readerRoutes from './reader.routes.js';
import staffRoutes from './staff.routes.js';
import settingsRoutes from './settings.routes.js';
import auditRoutes from './audit.routes.js';
import statsRoutes from './stats.routes.js';

const router = Router();

// Gắn nhánh xác thực admin: /api/admin/auth/*
router.use('/auth', authRoutes);

// Gắn nhánh quản lý nhà xuất bản: /api/admin/publishers/*
router.use('/publishers', publisherRoutes);

// Gắn nhánh quản lý sách: /api/admin/books/*
router.use('/books', bookRoutes);

// Gắn nhánh quản lý mượn sách: /api/admin/borrowings/*
router.use('/borrowings', borrowingRoutes);

// Gắn nhánh quản lý độc giả: /api/admin/readers/*
router.use('/readers', readerRoutes);

// Gắn nhánh quản lý nhân viên: /api/admin/staff/*
router.use('/staff', staffRoutes);

// Gắn nhánh cấu hình hệ thống: /api/admin/settings/*
router.use('/settings', settingsRoutes);

// Gắn nhánh nhật ký kiểm toán hệ thống: /api/admin/audit-logs/*
router.use('/audit-logs', auditRoutes);

// Gắn nhánh thống kê: /api/admin/stats/*
router.use('/stats', statsRoutes);

export default router;

