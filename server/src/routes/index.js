import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../utils/response.js';

const router = Router();

/**
 * Health check endpoint: GET /api/health
 */
router.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  return ok(
    res,
    {
      status: 'OK',
      database: dbStatus,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    'Dịch vụ hoạt động bình thường'
  );
});

export default router;
