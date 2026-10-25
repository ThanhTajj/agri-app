import 'dotenv/config';
import Sequelize from 'sequelize';

const requiredEnvironmentValue = (environment, name) => {
  if (!Object.prototype.hasOwnProperty.call(environment, name) || environment[name] === '') {
    throw new Error(`Missing required database environment variable: ${name}`);
  }
  return environment[name];
};

export const createSequelizeFromEnv = (environment = process.env) => {
  const portValue = environment.DB_PORT ?? '3306';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer from 1 to 65535.');
  }

  return new Sequelize(
    requiredEnvironmentValue(environment, 'DB_NAME'),
    requiredEnvironmentValue(environment, 'DB_USER'),
    requiredEnvironmentValue(environment, 'DB_PASSWORD'),
    {
      host: requiredEnvironmentValue(environment, 'DB_HOST'),
      port,
      dialect: 'mysql',
      logging: false,
      define: { timestamps: false },
    },
  );
};
