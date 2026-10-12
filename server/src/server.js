import app from './app.js';
import env from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let server;

const startServer = async () => {
  // Kết nối cơ sở dữ liệu MongoDB
  await connectDB();

  // Khởi động HTTP server
  server = app.listen(env.PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    console.log(`Kiểm tra trạng thái: http://localhost:${env.PORT}/api/health`);
  });
};

// Xử lý tắt server an toàn (Graceful shutdown)
const gracefulShutdown = async (signal) => {
  console.log(`\nNhận tín hiệu ${signal}. Đang đóng server...`);

  if (server) {
    server.close(async () => {
      console.log('HTTP server đã đóng.');
      await disconnectDB();
      console.log('Kết nối MongoDB đã đóng. Tạm biệt!');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

startServer();
