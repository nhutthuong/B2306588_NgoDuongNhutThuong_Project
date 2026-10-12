import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import env from './config/env.js';
import apiRouter from './routes/index.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Tắt header X-Powered-By để bảo mật
app.disable('x-powered-by');

// CORS whitelist cấu hình từ .env
app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép requests không có origin (vd: Postman, curl, server-to-server) hoặc thuộc whitelist
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} không được phép bởi CORS`));
    },
    credentials: true,
  })
);

// Logging HTTP request
if (env.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Giới hạn kích thước body theo CONVENTIONS.md §5.3
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Route gốc chào mừng
app.get('/', (req, res) => {
  res.json({
    name: 'Library Management API',
    version: '1.0.0',
    documentation: '/docs',
    health: '/api/health',
  });
});

// Gắn router chính cho toàn bộ API
app.use('/api', apiRouter);

// Middleware xử lý 404
app.use(notFound);

// Middleware xử lý lỗi tập trung
app.use(errorHandler);

export default app;
