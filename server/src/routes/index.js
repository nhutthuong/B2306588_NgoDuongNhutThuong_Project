import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../utils/response.js';
import adminRouter from './admin/index.js';
import userRouter from './user/index.js';

const router = Router();

// Gắn các nhánh router chính
router.use('/admin', adminRouter);
router.use('/user', userRouter);



/**
 * Health check & security verification endpoint: /api/health
 */
router.all('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const data = {
    status: 'OK',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  // Tra ve query, body, cookies da qua sanitize/parser de tien kiem tra bao mat
  if (req.query && Object.keys(req.query).length > 0) {
    data.query = req.query;
  }
  if (req.body && Object.keys(req.body).length > 0) {
    data.body = req.body;
  }
  if (req.cookies && Object.keys(req.cookies).length > 0) {
    data.cookies = req.cookies;
  }

  return ok(res, data, 'Dịch vụ hoạt động bình thường');
});

export default router;
