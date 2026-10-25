const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) =>
    (typeof table === 'string' ? table : table.tableName) === tableName,
  );
};

const ensureIndex = async (queryInterface, tableName, indexName, fields, unique) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === indexName)) {
    await queryInterface.addIndex(tableName, fields, {
      name: indexName,
      unique,
    });
  }
};

export async function up(queryInterface, Sequelize) {
  if (!(await tableExists(queryInterface, 'materials'))) {
    await queryInterface.createTable(
      'materials',
      {
        material_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        code: {
          type: Sequelize.STRING(50),
          allowNull: false,
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        unit: {
          type: Sequelize.STRING(30),
          allowNull: false,
        },
        stock_quantity: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
      },
      { engine: 'InnoDB', charset: 'utf8mb4' },
    );
  }

  await queryInterface.sequelize.query(
    'ALTER TABLE `materials` MODIFY COLUMN `code` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL',
  );
  await ensureIndex(queryInterface, 'materials', 'uq_materials_code', ['code'], true);

  if (!(await tableExists(queryInterface, 'idempotency_requests'))) {
    await queryInterface.createTable(
      'idempotency_requests',
      {
        idempotency_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        user_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
        },
        endpoint: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        key_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
        },
        payload_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
        },
        response_status: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: true,
        },
        response_body: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        expires_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
        },
      },
      { engine: 'InnoDB', charset: 'utf8mb4' },
    );
  }

  await ensureIndex(
    queryInterface,
    'idempotency_requests',
    'uq_idempotency_scope',
    ['user_hash', 'endpoint', 'key_hash'],
    true,
  );
}

export async function down(queryInterface) {
  if (await tableExists(queryInterface, 'idempotency_requests')) {
    await queryInterface.dropTable('idempotency_requests');
  }
  if (await tableExists(queryInterface, 'materials')) {
    await queryInterface.dropTable('materials');
  }
}
