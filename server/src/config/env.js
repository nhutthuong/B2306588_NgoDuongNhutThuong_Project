import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string().required().messages({
    'any.required': 'MONGO_URI là bắt buộc trong file .env',
  }),
  JWT_USER_SECRET: Joi.string().min(16).required().messages({
    'any.required': 'JWT_USER_SECRET là bắt buộc trong file .env (tối thiểu 16 ký tự)',
  }),
  JWT_ADMIN_SECRET: Joi.string().min(16).required().messages({
    'any.required': 'JWT_ADMIN_SECRET là bắt buộc trong file .env (tối thiểu 16 ký tự)',
  }),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: Joi.number().default(7),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173,http://localhost:5174'),
  COOKIE_SECURE: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
  SEED_ADMIN_PASSWORD: Joi.string().allow('').optional(),
}).unknown(true);

const { error, value: validatedEnv } = envSchema.validate(process.env, {
  abortEarly: false,
});

if (error) {
  console.error('Lỗi cấu hình biến môi trường (.env):');
  error.details.forEach((detail) => {
    console.error(` - ${detail.message}`);
  });
  process.exit(1);
}

const corsOrigins = validatedEnv.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  NODE_ENV: validatedEnv.NODE_ENV,
  PORT: validatedEnv.PORT,
  MONGO_URI: validatedEnv.MONGO_URI,
  JWT_USER_SECRET: validatedEnv.JWT_USER_SECRET,
  JWT_ADMIN_SECRET: validatedEnv.JWT_ADMIN_SECRET,
  JWT_ACCESS_EXPIRES: validatedEnv.JWT_ACCESS_EXPIRES,
  JWT_REFRESH_EXPIRES_DAYS: validatedEnv.JWT_REFRESH_EXPIRES_DAYS,
  CORS_ORIGINS: corsOrigins,
  COOKIE_SECURE: validatedEnv.COOKIE_SECURE,
  SEED_ADMIN_PASSWORD: validatedEnv.SEED_ADMIN_PASSWORD,
  isProduction: validatedEnv.NODE_ENV === 'production',
  isDevelopment: validatedEnv.NODE_ENV === 'development',
  isTest: validatedEnv.NODE_ENV === 'test',
};

export default env;
