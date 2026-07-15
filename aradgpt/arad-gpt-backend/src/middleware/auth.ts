import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; role: string };
}

/**
 * Verifies the Supabase-issued JWT sent as `Authorization: Bearer <token>`.
 * Supabase signs session tokens with SUPABASE_JWT_SECRET (HS256), so we can
 * verify locally without a round trip for every request.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token', message: 'Sign in to continue.' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as {
      sub: string;
      email: string;
      role?: string;
    };
    req.user = { id: payload.sub, email: payload.email, role: payload.role ?? 'user' };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', message: 'Your session expired. Sign in again.' });
  }
}

/** Restricts a route to workspace owners/admins. Use after requireAuth + loadWorkspaceRole. */
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to do this.' });
    }
    next();
  };
}
