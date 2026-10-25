import { createSequelizeFromEnv } from './sequelize.js';

let sequelize;

try {
  sequelize = createSequelizeFromEnv();
  await sequelize.authenticate();
  console.log('Database connection successful.');
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown database connection error.';
  const password = process.env.DB_PASSWORD;
  const safeErrorMessage = password
    ? errorMessage.replaceAll(password, '[REDACTED]')
    : errorMessage;
  console.error(`Database connection failed: ${safeErrorMessage}`);
  process.exitCode = 1;
} finally {
  if (sequelize) {
    await sequelize.close();
  }
}
