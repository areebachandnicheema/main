import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requestUpload, confirmUpload, listFiles, getFileDownloadUrl } from '../controllers/files.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const filesRouter = Router();

filesRouter.post('/upload-url', requireAuth, asyncHandler(requestUpload));
filesRouter.post('/confirm', requireAuth, asyncHandler(confirmUpload));
filesRouter.get('/:workspaceId', requireAuth, asyncHandler(listFiles));
filesRouter.get('/download/:fileId', requireAuth, asyncHandler(getFileDownloadUrl));
