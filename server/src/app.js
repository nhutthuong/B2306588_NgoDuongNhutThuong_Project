import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';
import env from './config/env.js';
import ApiError from './utils/ApiError.js';
import { generalLimiter } from './middlewares/rateLimit.js';
import apiRouter from './routes/index.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Trust proxy khi chay sau reverse proxy theo CONVENTIONS.md §5.4
app.set('trust proxy', 1);

// Tat header X-Powered-By de bao mat
app.disable('x-powered-by');

// Helmet bat day du cac header bao mat HTTP
app.use(helmet());

// CORS whitelist cau hinh tu bien CORS_ORIGINS, credentials: true, khong dung *
app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phep requests khong co origin (vd: Postman, curl, server-to-server) hoac thuoc whitelist
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      const corsError = new ApiError(403, 'FORBIDDEN', `Origin ${origin} khong duoc phep boi CORS`);
      corsError.isCors = true;
      return callback(corsError);
    },
    credentials: true,
  })
);

// Gioi han rate limit chung: 100 req/phut/IP
app.use(generalLimiter);

// Chi bat morgan khi NODE_ENV=development
if (env.isDevelopment) {
  app.use(morgan('dev'));
}

// Gioi han kich thuoc body 10kb theo CONVENTIONS.md §5.3
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser cho refresh token
app.use(cookieParser());

// Chong NoSQL injection: loai bo khoa bat dau bang $ hoac chua dau cham
app.use(mongoSanitize());

// Route goc chao mung
app.get('/', (req, res) => {
  res.json({
    name: 'Library Management API',
    version: '1.0.0',
    documentation: '/docs',
    health: '/api/health',
  });
});

// Gan router chinh cho toan bo API
app.use('/api', apiRouter);

// Middleware xu ly 404
app.use(notFound);

// Middleware xu ly loi tap trung
app.use(errorHandler);

export default app;
