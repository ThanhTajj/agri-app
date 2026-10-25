import { HttpError } from '../errors/HttpError.js';

const isUniqueConstraintError = (error) =>
  error.name === 'SequelizeUniqueConstraintError' ||
  error.original?.code === 'ER_DUP_ENTRY' ||
  error.parent?.code === 'ER_DUP_ENTRY';

const toPlainMaterial = (material) =>
  typeof material.get === 'function' ? material.get({ plain: true }) : material;

export const createMaterialRepository = ({ Material }) => ({
  async findByCode(code, { transaction } = {}) {
    const material = await Material.findOne({
      where: { code },
      transaction,
    });
    return material ? toPlainMaterial(material) : null;
  },

  async create(attributes, { transaction } = {}) {
    try {
      const material = await Material.create(attributes, { transaction });
      return toPlainMaterial(material);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, 'MATERIAL_CODE_DUPLICATE', 'Mã vật tư đã tồn tại.');
      }
      throw error;
    }
  },
});
