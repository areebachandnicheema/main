import { pool } from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import { isAdminUser } from '../utils/adminCheck';

/**
 * Every metered action (chat turn, image render, video minute, audio
 * minute) debits this ledger. Deduction happens inside a transaction with
 * a row lock so concurrent requests from the same workspace can't both
 * pass a balance check and overdraw the account.
 */
export async function chargeCredits(params: {
  workspaceId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<{ remaining: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT credits_balance FROM workspaces WHERE id = $1 FOR UPDATE',
      [params.workspaceId],
    );
    if (rows.length === 0) {
      throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
    }

    const balance = Number(rows[0].credits_balance);
    if (balance < params.amount) {
      throw new ApiError(402, 'insufficient_credits', 'This workspace is out of credits. Upgrade or top up to continue.');
    }

    const remaining = balance - params.amount;
    await client.query('UPDATE workspaces SET credits_balance = $1 WHERE id = $2', [remaining, params.workspaceId]);
    await client.query(
      `INSERT INTO credit_ledger (workspace_id, delta, reason, metadata)
       VALUES ($1, $2, $3, $4)`,
      [params.workspaceId, -params.amount, params.reason, params.metadata ?? {}],
    );

    await client.query('COMMIT');
    return { remaining };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Use this instead of `chargeCredits` directly in any route a user hits.
 * Admin accounts skip the charge entirely — every metered feature (chat,
 * image, video, audio generation) is free for them, on any workspace.
 */
export async function chargeCreditsForUser(params: {
  userId: string;
  workspaceId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<{ remaining: number; bypassed: boolean }> {
  const admin = await isAdminUser(params.userId);
  if (admin) {
    // Still logged for visibility, at zero cost, so usage shows up in reporting.
    await pool.query(
      `INSERT INTO credit_ledger (workspace_id, delta, reason, metadata) VALUES ($1, 0, $2, $3)`,
      [params.workspaceId, `${params.reason}_admin_bypass`, params.metadata ?? {}],
    );
    return { remaining: -1, bypassed: true };
  }
  const result = await chargeCredits(params);
  return { ...result, bypassed: false };
}

export async function grantCredits(params: { workspaceId: string; amount: number; reason: string }) {
  await pool.query('UPDATE workspaces SET credits_balance = credits_balance + $1 WHERE id = $2', [
    params.amount,
    params.workspaceId,
  ]);
  await pool.query(
    `INSERT INTO credit_ledger (workspace_id, delta, reason) VALUES ($1, $2, $3)`,
    [params.workspaceId, params.amount, params.reason],
  );
}
