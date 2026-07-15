import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { grantPremium, revokePremium, listGrants } from '../controllers/admin.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const adminRouter = Router();

adminRouter.post('/grant-premium', requireAuth, requireAdmin, asyncHandler(grantPremium));
adminRouter.post('/revoke-premium', requireAuth, requireAdmin, asyncHandler(revokePremium));
adminRouter.get('/grants', requireAuth, requireAdmin, asyncHandler(listGrants));
