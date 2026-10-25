import { DataTypes } from 'sequelize';

export const initializeIdempotencyModel = (sequelize) => {
  if (sequelize.models.IdempotencyRequest) {
    return sequelize.models.IdempotencyRequest;
  }

  return sequelize.define(
    'IdempotencyRequest',
    {
      idempotencyId: {
        type: DataTypes.BIGINT.UNSIGNED,
        field: 'idempotency_id',
        primaryKey: true,
        autoIncrement: true,
      },
      userHash: {
        type: DataTypes.CHAR(64),
        field: 'user_hash',
        allowNull: false,
      },
      endpoint: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      keyHash: {
        type: DataTypes.CHAR(64),
        field: 'key_hash',
        allowNull: false,
      },
      payloadHash: {
        type: DataTypes.CHAR(64),
        field: 'payload_hash',
        allowNull: false,
      },
      responseStatus: {
        type: DataTypes.SMALLINT.UNSIGNED,
        field: 'response_status',
        allowNull: true,
      },
      responseBody: {
        type: DataTypes.JSON,
        field: 'response_body',
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE(3),
        field: 'expires_at',
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE(3),
        field: 'created_at',
        allowNull: false,
      },
    },
    {
      tableName: 'idempotency_requests',
      timestamps: false,
      indexes: [
        {
          name: 'uq_idempotency_scope',
          unique: true,
          fields: ['user_hash', 'endpoint', 'key_hash'],
        },
      ],
    },
  );
};
