import { Router } from 'express';
import authRoutes from './auth.routes.js';

const router = Router();

// Gắn nhánh xác thực độc giả: /api/user/auth/*
router.use('/auth', authRoutes);

export default router;
