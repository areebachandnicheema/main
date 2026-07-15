import { Response, NextFunction } from 'express';
import { AuthedRequest } from './auth';
import { isAdminUser } from '../utils/adminCheck';

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'missing_token', message: 'Sign in to continue.' });
  }
  const admin = await isAdminUser(req.user.id);
  if (!admin) {
    return res.status(403).json({ error: 'forbidden', message: 'This action requires an admin account.' });
  }
  next();
}
