import mongoose from 'mongoose';
import env from './env.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);
    console.log(`Kết nối MongoDB thành công: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`Kết nối MongoDB thất bại: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('Mất kết nối tới MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error(`Lỗi kết nối MongoDB: ${err.message}`);
});

export const disconnectDB = async () => {
  await mongoose.disconnect();
};

export default connectDB;
