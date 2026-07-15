import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { bootstrapAccount, getMe } from '../controllers/me.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const meRouter = Router();

meRouter.get('/', requireAuth, asyncHandler(getMe));
meRouter.post('/bootstrap', requireAuth, asyncHandler(bootstrapAccount));
