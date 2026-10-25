import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMaterialService } from '../../../src/services/materialsService.js';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { requireAuthentication } from '../../../src/middlewares/requireAuthentication.js';
import { requirePermission } from '../../../src/middlewares/requirePermission.js';

const createHarness = () => {
  const materials = new Map();
  const idempotencyRecords = new Map();
  const idempotencyLocks = new Map();
  let currentTime = new Date('2026-01-01T00:00:00.000Z');
  const getIdempotencyScopeKey = (scope) => JSON.stringify(scope);
  const clock = () => new Date(currentTime);
  let nextMaterialId = 1;

  const materialRepository = {
    findByCode: vi.fn(async (code) => materials.get(code) ?? null),
    create: vi.fn(async (attributes) => {
      const material = { materialId: `mat_${nextMaterialId++}`, ...attributes };
      materials.set(attributes.code, material);
      return material;
    }),
  };

  const idempotencyRepository = {
    run: vi.fn(async ({ scope, payloadHash, operation }) => {
      const scopeKey = getIdempotencyScopeKey(scope);
      const previousLock = idempotencyLocks.get(scopeKey) ?? Promise.resolve();
      let releaseLock;
      const currentLock = new Promise((resolve) => {
        releaseLock = resolve;
      });
      idempotencyLocks.set(scopeKey, currentLock);

      await previousLock;

      try {
        const existingRecord = idempotencyRecords.get(scopeKey);
        if (existingRecord && existingRecord.expiresAt > clock()) {
          if (existingRecord.payloadHash !== payloadHash) {
            throw Object.assign(new Error('Idempotency key reused'), {
              status: 409,
              code: 'IDEMPOTENCY_KEY_REUSED',
            });
          }

          return existingRecord.response;
        }

        const response = await operation();
        idempotencyRecords.set(scopeKey, {
          payloadHash,
          response,
          expiresAt: new Date(clock().getTime() + 24 * 60 * 60 * 1000),
        });

        return response;
      } finally {
        releaseLock();
        if (idempotencyLocks.get(scopeKey) === currentLock) {
          idempotencyLocks.delete(scopeKey);
        }
      }
    }),
  };

  const service = createMaterialService({
    materialRepository,
    idempotencyRepository,
    clock,
  });

  return {
    service,
    materialRepository,
    materials,
    advanceTime(milliseconds) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
};

const createAuthContext = (idempotencyKey) => ({
  userId: 'user-1',
  permissions: ['materials:create'],
  ...(idempotencyKey ? { idempotencyKey } : {}),
});

const invokeMiddleware = (middleware, request) => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn((error) => {
    if (error) {
      errorHandler(error, request, response, vi.fn());
    }
  });

  middleware(request, response, next);

  return { response, next };
};

const invokeErrorHandler = (middleware, error) => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn();

  middleware(error, {}, response, next);

  return { response, next };
};

describe('POST /api/materials service', () => {
  let harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('creates a material with normalized code, name, and unit', async () => {
    const result = await harness.service.create(
      { code: '  npk   16-16-8 ', name: '  Phân   NPK ', unit: ' bao  ' },
      createAuthContext('create-1'),
    );

    expect(result).toMatchObject({
      materialId: 'mat_1',
      code: 'NPK 16-16-8',
      name: 'Phân NPK',
      unit: 'bao',
      stockQuantity: 0,
    });
    expect(harness.materialRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ stockQuantity: 0 }),
      { transaction: undefined },
    );
    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ name: 'Phân NPK', unit: 'bao' }, 'code'],
    [{ code: 'NPK', unit: 'bao' }, 'name'],
    [{ code: 'NPK', name: 'Phân NPK' }, 'unit'],
    [{ code: '', name: 'Phân NPK', unit: 'bao' }, 'code'],
    [{ code: 'NPK', name: '', unit: 'bao' }, 'name'],
    [{ code: 'NPK', name: 'Phân NPK', unit: '' }, 'unit'],
    [{ code: '   ', name: 'Phân NPK', unit: 'bao' }, 'code'],
    [{ code: 'NPK', name: '   ', unit: 'bao' }, 'name'],
    [{ code: 'NPK', name: 'Phân NPK', unit: '   ' }, 'unit'],
  ])('rejects invalid or blank %s input without creating a record', async (input, field) => {
    await expect(
      harness.service.create(input, createAuthContext('invalid-1')),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fields: { [field]: expect.any(String) },
    });

    expect(harness.materialRepository.create).not.toHaveBeenCalled();
    expect(harness.materials.size).toBe(0);
  });

  it.each([
    [{ code: 'C'.repeat(51), name: 'Phân NPK', unit: 'bao' }, 'code'],
    [{ code: 'NPK', name: 'N'.repeat(256), unit: 'bao' }, 'name'],
    [{ code: 'NPK', name: 'Phân NPK', unit: 'U'.repeat(31) }, 'unit'],
  ])('rejects values longer than the confirmed schema limit for %s', async (input, field) => {
    await expect(
      harness.service.create(input, createAuthContext('too-long-1')),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fields: { [field]: expect.any(String) },
    });

    expect(harness.materialRepository.create).not.toHaveBeenCalled();
    expect(harness.materialRepository.findByCode).not.toHaveBeenCalled();
    expect(harness.materials.size).toBe(0);
  });

  it('accepts values at the confirmed schema length limits', async () => {
    const input = {
      code: 'C'.repeat(50),
      name: 'N'.repeat(255),
      unit: 'U'.repeat(30),
    };

    const result = await harness.service.create(input, createAuthContext('max-length-1'));

    expect(result).toMatchObject(input);
    expect(result.stockQuantity).toBe(0);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
    expect(harness.materials.size).toBe(1);
  });

  it('rejects client-supplied stock and identity or permission fields', async () => {
    for (const stockQuantity of [-1, 0, 1]) {
      await expect(
        harness.service.create(
          { code: `NPK-stock-${stockQuantity}`, name: 'Phân NPK', unit: 'bao', stockQuantity },
          createAuthContext(`invalid-stock-${stockQuantity}`),
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    for (const field of ['userId', 'role', 'permissions']) {
      await expect(
        harness.service.create(
          { code: `NPK-${field}`, name: 'Phân NPK', unit: 'bao', [field]: 1 },
          createAuthContext(`invalid-${field}`),
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    expect(harness.materialRepository.create).not.toHaveBeenCalled();
    expect(harness.materials.size).toBe(0);
  });

  it('rejects a missing idempotency key without creating a material', async () => {
    await expect(
      harness.service.create(
        { code: 'NPK', name: 'Phân NPK', unit: 'bao' },
        createAuthContext(),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });

    expect(harness.materialRepository.create).not.toHaveBeenCalled();
    expect(harness.materials.size).toBe(0);
  });

  it('rejects a duplicate normalized code without creating another record', async () => {
    await harness.service.create(
      { code: 'NPK 16-16-8', name: 'Phân NPK', unit: 'bao' },
      createAuthContext('create-1'),
    );

    await expect(
      harness.service.create(
        { code: ' NPK   16-16-8 ', name: 'Phân NPK khác', unit: 'bao' },
        createAuthContext('create-2'),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'MATERIAL_CODE_DUPLICATE',
    });

    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('replays a repeated request without creating a second material', async () => {
    const request = {
      code: 'NPK 16-16-8',
      name: 'Phân NPK',
      unit: 'bao',
    };
    const context = createAuthContext('retry-1');

    const firstResult = await harness.service.create(request, context);
    const replayedResult = await harness.service.create(request, context);

    expect(replayedResult).toEqual(firstResult);
    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const context = createAuthContext('retry-1');

    await harness.service.create(
      { code: 'NPK 16-16-8', name: 'Phân NPK', unit: 'bao' },
      context,
    );

    await expect(
      harness.service.create(
        { code: 'DAP', name: 'Phân DAP', unit: 'bao' },
        context,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('treats an idempotency key as new after 24 hours', async () => {
    const context = createAuthContext('expires-1');

    await harness.service.create(
      { code: 'NPK', name: 'Phân NPK', unit: 'bao' },
      context,
    );
    harness.advanceTime(24 * 60 * 60 * 1000 + 1);

    const result = await harness.service.create(
      { code: 'DAP', name: 'Phân DAP', unit: 'bao' },
      context,
    );

    expect(result).toMatchObject({ code: 'DAP' });
    expect(harness.materials.size).toBe(2);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(2);
  });

  it('creates at most one material for concurrent requests with the same key and payload', async () => {
    const request = { code: 'NPK', name: 'Phân NPK', unit: 'bao' };
    const context = createAuthContext('concurrent-same-1');

    const results = await Promise.all([
      harness.service.create(request, context),
      harness.service.create(request, context),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('accepts only one payload for concurrent requests sharing an idempotency key', async () => {
    const context = createAuthContext('concurrent-different-1');

    const results = await Promise.allSettled([
      harness.service.create(
        { code: 'NPK', name: 'Phân NPK', unit: 'bao' },
        context,
      ),
      harness.service.create(
        { code: 'DAP', name: 'Phân DAP', unit: 'bao' },
        context,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(harness.materials.size).toBe(1);
    expect(harness.materialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('propagates repository failures without creating a material', async () => {
    const databaseError = new Error('database unavailable');
    harness.materialRepository.findByCode.mockRejectedValueOnce(databaseError);

    const error = await harness.service
      .create(
        { code: 'NPK', name: 'Phân NPK', unit: 'bao' },
        createAuthContext('db-error-1'),
      )
      .then(
        () => {
          throw new Error('Expected the repository failure to reject');
        },
        (caughtError) => caughtError,
      );

    expect(error).toBe(databaseError);
    expect(harness.materialRepository.create).not.toHaveBeenCalled();
    expect(harness.materials.size).toBe(0);
  });

  it('maps an unexpected error to the internal-error response envelope', () => {
    const databaseError = new Error('database unavailable');
    const { response } = invokeErrorHandler(errorHandler, databaseError);

    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(JSON.stringify(response.body)).not.toContain('database unavailable');
  });
});

describe('material creation access middleware', () => {
  it('rejects a request without an authenticated identity with 401', () => {
    const { response, next } = invokeMiddleware(requireAuthentication, {});

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'AUTHENTICATION_REQUIRED' },
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'AUTHENTICATION_REQUIRED' }),
    );
  });

  it('continues when the authenticated context has the create-material permission', () => {
    const request = {
      auth: { userId: 'user-1', permissions: ['materials:create'] },
    };
    const { response, next } = invokeMiddleware(
      requirePermission('materials:create'),
      request,
    );

    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects an authenticated context without the create-material permission with 403', () => {
    const request = {
      auth: { userId: 'user-1', permissions: [] },
    };
    const { response, next } = invokeMiddleware(
      requirePermission('materials:create'),
      request,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN' },
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  it('does not grant permission from client-supplied identity or permission fields', () => {
    const request = {
      auth: { userId: 'user-1', permissions: [] },
      body: {
        userId: 'user-2',
        role: 'admin',
        permissions: ['materials:create'],
      },
    };
    const { response, next } = invokeMiddleware(
      requirePermission('materials:create'),
      request,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN' },
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });
});
