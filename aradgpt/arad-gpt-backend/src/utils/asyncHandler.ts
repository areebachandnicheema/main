import { Request, Response, NextFunction } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
