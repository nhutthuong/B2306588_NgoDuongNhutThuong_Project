import { Router } from 'express';
import authRoutes from './auth.routes.js';
import bookRoutes from './book.routes.js';
import publisherRoutes from './publisher.routes.js';
import borrowingRoutes from './borrowing.routes.js';
import { getBorrowingPolicy } from '../../controllers/user/borrowing.controller.js';

const router = Router();

// Gắn nhánh xác thực độc giả: /api/user/auth/*
router.use('/auth', authRoutes);

// Gắn nhánh sách công khai cho độc giả: /api/user/books/*
router.use('/books', bookRoutes);

// Gắn nhánh nhà xuất bản công khai cho độc giả: /api/user/publishers/*
router.use('/publishers', publisherRoutes);

// Gắn nhánh mượn sách cho độc giả: /api/user/borrowings/*
router.use('/borrowings', borrowingRoutes);

// GET /api/user/policy: Quy định mượn sách và biểu phí phạt công khai
router.get('/policy', getBorrowingPolicy);

export default router;
