import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import Sequelize from 'sequelize';
import { createSequelizeFromEnv } from './sequelize.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const migrationFilePattern = /^\d{14}-.+\.js$/u;

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) =>
    (typeof table === 'string' ? table : table.tableName) === tableName,
  );
};

const createMigrationModel = (sequelize) =>
  sequelize.define(
    'SequelizeMeta',
    {
      name: {
        type: Sequelize.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      tableName: 'SequelizeMeta',
      timestamps: false,
    },
  );

const ensureMigrationTable = async (sequelize, Migration) => {
  const queryInterface = sequelize.getQueryInterface();
  if (!(await tableExists(queryInterface, 'SequelizeMeta'))) {
    await queryInterface.createTable(
      'SequelizeMeta',
      {
        name: {
          type: Sequelize.STRING(255),
          primaryKey: true,
          allowNull: false,
        },
      },
      { engine: 'InnoDB', charset: 'utf8mb4' },
    );
  }
  return Migration;
};

const loadMigration = async (filename) => {
  const migrationUrl = pathToFileURL(join(migrationsDirectory, filename)).href;
  return import(migrationUrl);
};

const listMigrationFiles = async () =>
  (await readdir(migrationsDirectory))
    .filter((filename) => migrationFilePattern.test(filename))
    .sort();

const runUp = async (sequelize, Migration) => {
  const queryInterface = sequelize.getQueryInterface();
  const filenames = await listMigrationFiles();
  const appliedRows = await Migration.findAll({
    attributes: ['name'],
    raw: true,
  });
  const applied = new Set(appliedRows.map((row) => row.name));

  for (const filename of filenames) {
    if (applied.has(filename)) {
      continue;
    }
    const migration = await loadMigration(filename);
    await migration.up(queryInterface, Sequelize);
    await Migration.create({ name: filename });
    console.log(`Applied migration ${filename}`);
  }
};

const runDown = async (sequelize, Migration) => {
  const queryInterface = sequelize.getQueryInterface();
  const appliedRows = await Migration.findAll({
    attributes: ['name'],
    order: [['name', 'DESC']],
    raw: true,
  });
  const latest = appliedRows[0]?.name;
  if (!latest) {
    console.log('No migration to roll back.');
    return;
  }

  const migration = await loadMigration(latest);
  await migration.down(queryInterface, Sequelize);
  await Migration.destroy({ where: { name: latest } });
  console.log(`Rolled back migration ${latest}`);
};

const main = async () => {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'down') {
    throw new Error('Usage: npm run db:migrate | npm run db:rollback');
  }

  const sequelize = createSequelizeFromEnv();
  try {
    await sequelize.authenticate();
    const Migration = await ensureMigrationTable(
      sequelize,
      createMigrationModel(sequelize),
    );
    if (command === 'up') {
      await runUp(sequelize, Migration);
    } else {
      await runDown(sequelize, Migration);
    }
  } finally {
    await sequelize.close();
  }
};

main().catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
});
