import type { ErrorRequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  console.error('Unhandled error');
  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    },
  });
};
