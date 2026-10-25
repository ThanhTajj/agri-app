import { HttpError } from '../errors/HttpError.js';

export const requireAuthentication = (req, res, next) => {
  const auth = req.auth;
  if (
    !auth ||
    (typeof auth.userId !== 'string' && typeof auth.userId !== 'number') ||
    String(auth.userId).trim() === '' ||
    !Array.isArray(auth.permissions) ||
    auth.permissions.some((permission) => typeof permission !== 'string')
  ) {
    return next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu đăng nhập.'));
  }

  return next();
};
