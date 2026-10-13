import { Router } from 'express';
import authRoutes from './auth.routes.js';

const router = Router();

// Gắn nhánh xác thực admin: /api/admin/auth/*
router.use('/auth', authRoutes);

export default router;
