import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createWorkspace, listWorkspaces, inviteMember } from '../controllers/workspace.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const workspaceRouter = Router();

workspaceRouter.get('/', requireAuth, asyncHandler(listWorkspaces));
workspaceRouter.post('/', requireAuth, asyncHandler(createWorkspace));
workspaceRouter.post('/:workspaceId/members', requireAuth, asyncHandler(inviteMember));
