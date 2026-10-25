import { DataTypes } from 'sequelize';

export const initializeMaterialModel = (sequelize) => {
  if (sequelize.models.Material) {
    return sequelize.models.Material;
  }

  return sequelize.define(
    'Material',
    {
      materialId: {
        type: DataTypes.BIGINT.UNSIGNED,
        field: 'material_id',
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      stockQuantity: {
        type: DataTypes.BIGINT.UNSIGNED,
        field: 'stock_quantity',
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'materials',
      timestamps: false,
      indexes: [{ name: 'uq_materials_code', unique: true, fields: ['code'] }],
    },
  );
};
