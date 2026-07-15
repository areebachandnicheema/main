import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { pool } from './config/db';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { chatRouter } from './routes/chat.routes';
import { workspaceRouter } from './routes/workspace.routes';
import { filesRouter } from './routes/files.routes';
import { billingRouter } from './routes/billing.routes';
import { generationRouter } from './routes/generation.routes';
import { adminRouter } from './routes/admin.routes';
import { meRouter } from './routes/me.routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(pinoHttp({ redact: ['req.headers.authorization'] }));

// Stripe webhook needs the raw body, so it's mounted before express.json()
// inside billing.routes.ts itself and must stay ahead of the global parser.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

app.use('/api/chat', chatRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/files', filesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/generations', generationRouter);
app.use('/api/admin', adminRouter);
app.use('/api/me', meRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(env.PORT);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ARAD GPT API listening on :${port} (${env.NODE_ENV})`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
