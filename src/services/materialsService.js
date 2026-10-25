import { createHash } from 'node:crypto';
import { HttpError } from '../errors/HttpError.js';

const MATERIALS_ENDPOINT = 'POST /api/materials';
const MAX_LENGTHS = {
  code: 50,
  name: 255,
  unit: 30,
};

const normalizeWhitespace = (value) => value.trim().replace(/\s+/gu, ' ');

const normalizeMaterialInput = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request không hợp lệ.');
  }

  const allowedFields = new Set(['code', 'name', 'unit']);
  const unsupportedFields = Object.keys(input).filter((field) => !allowedFields.has(field));
  if (unsupportedFields.length > 0) {
    const fields = Object.fromEntries(
      unsupportedFields.map((field) => [field, 'Trường này không được hỗ trợ.']),
    );
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request chứa trường không được hỗ trợ.', fields);
  }

  const fields = {};
  const normalized = {};

  for (const field of Object.keys(MAX_LENGTHS)) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      fields[field] = 'Không được để trống.';
      continue;
    }
    if (typeof value !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Request không hợp lệ.', {
        [field]: 'Phải là chuỗi.',
      });
    }

    const valueNormalized = normalizeWhitespace(value);
    normalized[field] = field === 'code' ? valueNormalized.toUpperCase() : valueNormalized;
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Một hoặc nhiều trường bắt buộc không hợp lệ.', fields);
  }

  const tooLongFields = {};
  for (const [field, maxLength] of Object.entries(MAX_LENGTHS)) {
    if (Array.from(normalized[field]).length > maxLength) {
      tooLongFields[field] = `Không được vượt quá ${maxLength} ký tự.`;
    }
  }
  if (Object.keys(tooLongFields).length > 0) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Một hoặc nhiều trường vượt giới hạn độ dài.', tooLongFields);
  }

  return normalized;
};

const createPublicMaterial = (material, attributes) => {
  const materialIdValue = String(material.materialId);
  const materialId = materialIdValue.startsWith('mat_')
    ? materialIdValue
    : `mat_${materialIdValue}`;

  return {
    materialId,
    code: attributes.code,
    name: attributes.name,
    unit: attributes.unit,
    stockQuantity: 0,
  };
};

export const createMaterialService = ({ materialRepository, idempotencyRepository }) => ({
  async create(input, authContext = {}, idempotencyKey = authContext.idempotencyKey) {
    const attributes = normalizeMaterialInput(input);

    if (
      !authContext.userId ||
      !Array.isArray(authContext.permissions) ||
      !authContext.permissions.includes('materials:create')
    ) {
      throw new HttpError(
        authContext.userId ? 403 : 401,
        authContext.userId ? 'FORBIDDEN' : 'AUTHENTICATION_REQUIRED',
        authContext.userId ? 'Không có quyền thực hiện thao tác.' : 'Yêu cầu đăng nhập.',
      );
    }

    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu Idempotency-Key.');
    }

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(attributes))
      .digest('hex');
    const scope = {
      userId: String(authContext.userId),
      endpoint: MATERIALS_ENDPOINT,
      key: idempotencyKey,
    };

    return idempotencyRepository.run({
      scope,
      payloadHash,
      operation: async (transaction) => {
        const existingMaterial = await materialRepository.findByCode(attributes.code, {
          transaction,
        });
        if (existingMaterial) {
          throw new HttpError(
            409,
            'MATERIAL_CODE_DUPLICATE',
            'Mã vật tư đã tồn tại.',
          );
        }

        const material = await materialRepository.create(
          { ...attributes, stockQuantity: 0 },
          { transaction },
        );
        return createPublicMaterial(material, attributes);
      },
    });
  },
});
