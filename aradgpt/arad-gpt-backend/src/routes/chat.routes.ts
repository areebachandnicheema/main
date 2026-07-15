import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatLimiter } from '../middleware/rateLimit';
import { sendMessage, listChats, getChatMessages } from '../controllers/chat.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const chatRouter = Router();

chatRouter.post('/messages', requireAuth, chatLimiter, asyncHandler(sendMessage));
chatRouter.get('/:workspaceId/chats', requireAuth, asyncHandler(listChats));
chatRouter.get('/chats/:chatId/messages', requireAuth, asyncHandler(getChatMessages));
