import { Router } from 'express';
import authRoutes from './auth.routes.js';
import publisherRoutes from './publisher.routes.js';
import bookRoutes from './book.routes.js';

const router = Router();

// Gắn nhánh xác thực admin: /api/admin/auth/*
router.use('/auth', authRoutes);

// Gắn nhánh quản lý nhà xuất bản: /api/admin/publishers/*
router.use('/publishers', publisherRoutes);

// Gắn nhánh quản lý sách: /api/admin/books/*
router.use('/books', bookRoutes);

export default router;

