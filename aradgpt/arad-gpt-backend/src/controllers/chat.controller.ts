import { Response } from 'express';
import { z } from 'zod';
import { AuthedRequest } from '../middleware/auth';
import { streamChatCompletion } from '../services/anthropic.service';
import { chargeCreditsForUser } from '../services/credits.service';
import { pool } from '../config/db';
import { ApiError } from '../middleware/errorHandler';

const sendMessageSchema = z.object({
  workspaceId: z.string().uuid(),
  chatId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  message: z.string().min(1).max(20_000),
});

const CREDITS_PER_CHAT_TURN = 1;

export async function sendMessage(req: AuthedRequest, res: Response) {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Invalid request.');
  }
  const { workspaceId, message } = parsed.data;
  let { chatId } = parsed.data;

  // 1. Confirm the workspace has budget before we call the model (admins bypass this).
  await chargeCreditsForUser({ userId: req.user!.id, workspaceId, amount: CREDITS_PER_CHAT_TURN, reason: 'chat_turn' });

  // 2. Create the chat thread on first message.
  if (!chatId) {
    const { rows } = await pool.query(
      `INSERT INTO chats (workspace_id, created_by, title) VALUES ($1, $2, $3) RETURNING id`,
      [workspaceId, req.user!.id, message.slice(0, 60)],
    );
    chatId = rows[0].id;
  }

  await pool.query(
    `INSERT INTO messages (chat_id, role, content, author_id) VALUES ($1, 'user', $2, $3)`,
    [chatId, message, req.user!.id],
  );

  // 3. Pull recent history for context.
  const historyResult = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at ASC LIMIT 40`,
    [chatId],
  );
  const history = historyResult.rows;

  // 4. Stream the model's reply to the client as it's generated.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: chat_id\ndata: ${chatId}\n\n`);

  let fullReply = '';
  try {
    await streamChatCompletion({
      system: 'You are ARAD, a helpful assistant embedded in the ARAD GPT workspace.',
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      onToken: (token) => {
        fullReply += token;
        res.write(`event: token\ndata: ${JSON.stringify(token)}\n\n`);
      },
    });
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify('The model failed to respond. Try again.')}\n\n`);
    res.end();
    return;
  }

  await pool.query(
    `INSERT INTO messages (chat_id, role, content, author_id) VALUES ($1, 'assistant', $2, NULL)`,
    [chatId, fullReply],
  );

  res.write('event: done\ndata: {}\n\n');
  res.end();
}

export async function listChats(req: AuthedRequest, res: Response) {
  const { workspaceId } = req.params;
  const chats = await pool.query(
    `SELECT id, title, updated_at FROM chats WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [workspaceId],
  );
  res.json({ chats: chats.rows });
}

export async function getChatMessages(req: AuthedRequest, res: Response) {
  const { chatId } = req.params;
  const messages = await pool.query(
    `SELECT id, role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [chatId],
  );
  res.json({ messages: messages.rows });
}
