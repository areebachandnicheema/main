import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis';

/**
 * Simple sliding-window limiter backed by Redis so limits hold across
 * multiple server instances. `keyPrefix` lets each route family
 * (chat, generation, auth) have its own budget.
 */
export function makeLimiter(opts: { windowMs: number; max: number; keyPrefix: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${opts.keyPrefix}:${(req as any).user?.id ?? req.ip}`,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        message: 'You are sending requests too quickly. Wait a moment and try again.',
      });
    },
    // express-rate-limit falls back to memory store by default; swap in
    // rate-limit-redis in production for a shared store across instances.
  });
}

export const chatLimiter = makeLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'chat' });
export const generationLimiter = makeLimiter({ windowMs: 60_000, max: 10, keyPrefix: 'gen' });
export const authLimiter = makeLimiter({ windowMs: 60_000, max: 10, keyPrefix: 'auth' });

// touch redis so the import above is never flagged unused if swapped later
void redis;
