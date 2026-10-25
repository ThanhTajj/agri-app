import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIdempotencyRepository } from '../../../src/repositories/idempotencyRepository.js';
import { createMaterialRepository } from '../../../src/repositories/materialRepository.js';
import { createMaterialService } from '../../../src/services/materialsService.js';
import { createSequelizeFromEnv } from '../../../src/database/sequelize.js';
import { initializeIdempotencyModel } from '../../../src/models/IdempotencyRequest.js';
import { initializeMaterialModel } from '../../../src/models/Material.js';

const integrationEnabled = process.env.AGRISTOCK_MYSQL_TESTS === 'true';
const describeMysql = integrationEnabled ? describe : describe.skip;

const createUserId = () => `mysql-test-${randomUUID()}`;
const hashUserId = (userId) => createHash('sha256').update(userId).digest('hex');
const createCode = () => `T${randomUUID().replaceAll('-', '').slice(0, 30)}`;

describeMysql('POST /api/materials MySQL idempotency persistence', () => {
  let sequelizeA;
  let sequelizeB;
  let MaterialA;
  let MaterialB;
  let IdempotencyRequestA;
  let IdempotencyRequestB;
  let testClock;
  let userId;
  const createdCodes = [];

  const createService = (sequelize, Material, IdempotencyRequest) =>
    createMaterialService({
      materialRepository: createMaterialRepository({ Material }),
      idempotencyRepository: createIdempotencyRepository({
        sequelize,
        IdempotencyRequest,
        clock: () => new Date(testClock),
      }),
    });

  beforeAll(async () => {
    sequelizeA = createSequelizeFromEnv();
    sequelizeB = createSequelizeFromEnv();
    await Promise.all([sequelizeA.authenticate(), sequelizeB.authenticate()]);

    MaterialA = initializeMaterialModel(sequelizeA);
    MaterialB = initializeMaterialModel(sequelizeB);
    IdempotencyRequestA = initializeIdempotencyModel(sequelizeA);
    IdempotencyRequestB = initializeIdempotencyModel(sequelizeB);

    testClock = new Date('2026-01-01T00:00:00.000Z');
    userId = createUserId();
  });

  afterAll(async () => {
    if (!integrationEnabled) {
      return;
    }

    if (createdCodes.length > 0) {
      await MaterialA.destroy({ where: { code: createdCodes } });
    }

    const userHash = hashUserId(userId);
    await IdempotencyRequestA.destroy({ where: { userHash } });
    await Promise.all([sequelizeA.close(), sequelizeB.close()]);
  });

  it('replays the committed response through another Sequelize instance', async () => {
    const code = createCode();
    createdCodes.push(code);
    const request = { code, name: 'Phân kiểm thử', unit: 'bao' };
    const context = {
      userId,
      permissions: ['materials:create'],
      idempotencyKey: 'persist-replay-1',
    };

    const firstResult = await createService(
      sequelizeA,
      MaterialA,
      IdempotencyRequestA,
    ).create(request, context);
    const replayedResult = await createService(
      sequelizeB,
      MaterialB,
      IdempotencyRequestB,
    ).create(request, context);

    expect(replayedResult).toEqual(firstResult);
    expect(await MaterialA.count({ where: { code } })).toBe(1);
  });

  it('treats a key as new after 24 hours', async () => {
    const firstCode = createCode();
    const secondCode = createCode();
    createdCodes.push(firstCode, secondCode);
    const context = {
      userId,
      permissions: ['materials:create'],
      idempotencyKey: 'persist-expiry-1',
    };
    const serviceA = createService(sequelizeA, MaterialA, IdempotencyRequestA);
    const serviceB = createService(sequelizeB, MaterialB, IdempotencyRequestB);

    await serviceA.create(
      { code: firstCode, name: 'Phân lần một', unit: 'bao' },
      context,
    );
    testClock = new Date(testClock.getTime() + 24 * 60 * 60 * 1000 + 1);

    const result = await serviceB.create(
      { code: secondCode, name: 'Phân lần hai', unit: 'bao' },
      context,
    );

    expect(result.code).toBe(secondCode);
    expect(await MaterialA.count({ where: { code: [firstCode, secondCode] } })).toBe(2);
  });

  it('creates one material for concurrent same-key requests across instances', async () => {
    const code = createCode();
    createdCodes.push(code);
    const request = { code, name: 'Phân đồng thời', unit: 'bao' };
    const context = {
      userId,
      permissions: ['materials:create'],
      idempotencyKey: 'persist-concurrent-same-1',
    };

    const [firstResult, secondResult] = await Promise.all([
      createService(sequelizeA, MaterialA, IdempotencyRequestA).create(request, context),
      createService(sequelizeB, MaterialB, IdempotencyRequestB).create(request, context),
    ]);

    expect(firstResult).toEqual(secondResult);
    expect(await MaterialA.count({ where: { code } })).toBe(1);
  });

  it('accepts one payload for concurrent different-payload requests across instances', async () => {
    const codes = [createCode(), createCode()];
    createdCodes.push(...codes);
    const context = {
      userId,
      permissions: ['materials:create'],
      idempotencyKey: 'persist-concurrent-different-1',
    };
    const services = [
      createService(sequelizeA, MaterialA, IdempotencyRequestA),
      createService(sequelizeB, MaterialB, IdempotencyRequestB),
    ];

    const results = await Promise.allSettled([
      services[0].create(
        { code: codes[0], name: 'Phân A', unit: 'bao' },
        context,
      ),
      services[1].create(
        { code: codes[1], name: 'Phân B', unit: 'bao' },
        context,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(await MaterialA.count({ where: { code: codes } })).toBe(1);
  });
});
