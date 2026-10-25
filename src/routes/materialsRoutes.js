import { Router } from 'express';
import { createMaterialsController } from '../controllers/materialsController.js';
import { requireAuthentication } from '../middlewares/requireAuthentication.js';
import { requirePermission } from '../middlewares/requirePermission.js';

export const createMaterialsRouter = ({ service, authenticate }) => {
  if (typeof authenticate !== 'function') {
    throw new TypeError('A trusted authentication middleware must be provided.');
  }

  const router = Router();
  const controller = createMaterialsController({ service });
  router.post(
    '/',
    authenticate,
    requireAuthentication,
    requirePermission('materials:create'),
    controller.create,
  );
  return router;
};
