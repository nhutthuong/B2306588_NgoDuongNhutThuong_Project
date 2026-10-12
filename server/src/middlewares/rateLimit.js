import rateLimit from 'express-rate-limit';

/**
 * Limiter chung cho toan bo he thong API theo CONVENTIONS.md §5.4
 * Gioi han: 100 requests / 1 phut / IP
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Ban da gui qua nhieu yeu cau. Vui long thu lai sau 1 phut.',
      },
    });
  },
});

/**
 * Limiter chat hon cho cac route nhay cam (login, register, refresh)
 * Gioi han: 10 requests / 15 phut / IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Ban da thu qua nhieu lan. Vui long thu lai sau 15 phut.',
      },
    });
  },
});

export default generalLimiter;
