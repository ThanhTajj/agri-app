import { HttpError } from '../errors/HttpError.js';

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof HttpError) {
    const errorBody = {
      code: error.code,
      message: error.message,
    };
    if (error.fields) {
      errorBody.fields = error.fields;
    }
    return res.status(error.status).json({
      success: false,
      data: null,
      error: errorBody,
    });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request không hợp lệ.',
      },
    });
  }

  return res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi nội bộ.',
    },
  });
};
