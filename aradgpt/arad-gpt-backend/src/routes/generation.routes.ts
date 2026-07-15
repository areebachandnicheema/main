import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { generationLimiter } from '../middleware/rateLimit';
import { createGenerationJob, getGenerationJob, listGenerationJobs } from '../controllers/generation.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const generationRouter = Router();

generationRouter.post('/', requireAuth, generationLimiter, asyncHandler(createGenerationJob));
generationRouter.get('/:jobId', requireAuth, asyncHandler(getGenerationJob));
generationRouter.get('/workspace/:workspaceId', requireAuth, asyncHandler(listGenerationJobs));
