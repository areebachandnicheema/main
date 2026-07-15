import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { chargeCreditsForUser } from '../services/credits.service';
import { ApiError } from '../middleware/errorHandler';

const CREDIT_COST: Record<string, number> = { image: 5, video: 40, audio: 10 };

const createJobSchema = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(['image', 'video', 'audio']),
  prompt: z.string().min(1).max(4000),
  identityLockId: z.string().uuid().optional(), // ties generation to a locked character identity
  referenceFileIds: z.array(z.string().uuid()).max(6).optional(),
});

/**
 * Generation is modeled as an async job: we charge credits, insert a
 * `queued` row, and hand off to a worker (queue consumer, not shown here)
 * that calls the actual image/video/audio provider and flips the row to
 * `completed` with the resulting file. The client polls or subscribes via
 * Supabase Realtime on the `generations` table for status changes.
 */
export async function createGenerationJob(req: AuthedRequest, res: Response) {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Invalid request.');

  const { workspaceId, kind, prompt, identityLockId, referenceFileIds } = parsed.data;
  await chargeCreditsForUser({
    userId: req.user!.id,
    workspaceId,
    amount: CREDIT_COST[kind],
    reason: `${kind}_generation`,
  });

  const { rows } = await pool.query(
    `INSERT INTO generations (workspace_id, kind, prompt, identity_lock_id, reference_file_ids, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6)
     RETURNING id, kind, status, created_at`,
    [workspaceId, kind, prompt, identityLockId ?? null, referenceFileIds ?? [], req.user!.id],
  );

  // enqueue(rows[0].id) — push to Redis/SQS for a worker process to pick up.
  res.status(202).json({ generation: rows[0] });
}

export async function getGenerationJob(req: AuthedRequest, res: Response) {
  const { jobId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, kind, status, prompt, result_file_id, error_message, created_at FROM generations WHERE id = $1`,
    [jobId],
  );
  if (rows.length === 0) throw new ApiError(404, 'job_not_found', 'Generation job not found.');
  res.json({ generation: rows[0] });
}

export async function listGenerationJobs(req: AuthedRequest, res: Response) {
  const { workspaceId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, kind, status, created_at FROM generations WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [workspaceId],
  );
  res.json({ generations: rows });
}
