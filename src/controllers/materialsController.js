export const createMaterialsController = ({ service }) => ({
  async create(req, res, next) {
    try {
      const material = await service.create(req.body, {
        userId: req.auth.userId,
        permissions: req.auth.permissions,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      return res.status(201).json({
        success: true,
        data: material,
        error: null,
      });
    } catch (error) {
      return next(error);
    }
  },
});
