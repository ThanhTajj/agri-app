import { HttpError } from '../errors/HttpError.js';

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.auth || !Array.isArray(req.auth.permissions)) {
    return next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu đăng nhập.'));
  }
  if (!req.auth.permissions.includes(permission)) {
    return next(new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện thao tác.'));
  }

  return next();
};
