import { Router } from 'express';
import authRoutes from './auth.routes.js';
import bookRoutes from './book.routes.js';
import publisherRoutes from './publisher.routes.js';

const router = Router();

// Gắn nhánh xác thực độc giả: /api/user/auth/*
router.use('/auth', authRoutes);

// Gắn nhánh sách công khai cho độc giả: /api/user/books/*
router.use('/books', bookRoutes);

// Gắn nhánh nhà xuất bản công khai cho độc giả: /api/user/publishers/*
router.use('/publishers', publisherRoutes);

export default router;
