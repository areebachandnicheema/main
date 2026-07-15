import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong on our end. Try again in a moment.',
  });
}
