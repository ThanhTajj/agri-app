import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { createMaterialsRouter } from '../../../src/routes/materialsRoutes.js';

const createApp = ({ service, authContext }) => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/materials',
    createMaterialsRouter({
      service,
      authenticate(req, res, next) {
        if (authContext) {
          req.auth = authContext;
        }
        next();
      },
    }),
  );
  app.use(errorHandler);
  return app;
};

describe('POST /api/materials HTTP contract', () => {
  it('returns a 201 response envelope and passes authenticated context to the service', async () => {
    const material = {
      materialId: 'mat_123',
      code: 'NPK 16-16-8',
      name: 'Phân NPK',
      unit: 'bao',
      stockQuantity: 0,
    };
    const service = { create: vi.fn(async () => material) };
    const app = createApp({
      service,
      authContext: { userId: 'user-1', permissions: ['materials:create'] },
    });

    const response = await request(app)
      .post('/api/materials')
      .set('Idempotency-Key', 'route-key-1')
      .send({ code: 'npk 16-16-8', name: 'Phân NPK', unit: 'bao' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: material,
      error: null,
    });
    expect(service.create).toHaveBeenCalledWith(
      { code: 'npk 16-16-8', name: 'Phân NPK', unit: 'bao' },
      {
        userId: 'user-1',
        permissions: ['materials:create'],
        idempotencyKey: 'route-key-1',
      },
    );
  });

  it('returns the authentication error envelope when authentication sets no context', async () => {
    const service = { create: vi.fn() };
    const app = createApp({ service });

    const response = await request(app)
      .post('/api/materials')
      .set('Idempotency-Key', 'route-key-2')
      .send({ code: 'NPK', name: 'Phân NPK', unit: 'bao' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'AUTHENTICATION_REQUIRED' },
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('returns the forbidden error envelope when the server context lacks permission', async () => {
    const service = { create: vi.fn() };
    const app = createApp({
      service,
      authContext: { userId: 'user-1', permissions: [] },
    });

    const response = await request(app)
      .post('/api/materials')
      .set('Idempotency-Key', 'route-key-3')
      .send({ code: 'NPK', name: 'Phân NPK', unit: 'bao' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN' },
    });
    expect(service.create).not.toHaveBeenCalled();
  });
});
