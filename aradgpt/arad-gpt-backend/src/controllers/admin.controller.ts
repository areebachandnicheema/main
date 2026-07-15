import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { grantCredits } from '../services/credits.service';
import { ApiError } from '../middleware/errorHandler';

const PLAN_CREDIT_DEFAULTS: Record<string, number> = { studio: 5000, enterprise: 50000 };
const STARTER_CREDITS = 200;

const grantSchema = z.object({
  email: z.string().email(),
  plan: z.enum(['studio', 'enterprise']).default('studio'),
  creditBonus: z.number().int().positive().optional(),
  note: z.string().max(280).optional(),
});

/** Finds the recipient's personal workspace, creating one if this is their first grant. */
async function resolveRecipientWorkspace(recipientId: string, recipientEmail: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT w.id FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1 AND wm.role = 'owner'
     ORDER BY w.created_at ASC LIMIT 1`,
    [recipientId],
  );
  if (rows.length > 0) return rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO workspaces (name, owner_id, credits_balance) VALUES ($1, $2, $3) RETURNING id`,
      [`${recipientEmail}'s workspace`, recipientId, STARTER_CREDITS],
    );
    const workspaceId = created.rows[0].id;
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceId, recipientId],
    );
    await client.query('COMMIT');
    return workspaceId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Gift premium access to any existing user, identified by email. */
export async function grantPremium(req: AuthedRequest, res: Response) {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const { email, plan, note } = parsed.data;
  const creditBonus = parsed.data.creditBonus ?? PLAN_CREDIT_DEFAULTS[plan];

  const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (userRows.length === 0) {
    throw new ApiError(404, 'user_not_found', 'No ARAD GPT account exists for that email yet — they need to sign up first.');
  }
  const recipientId = userRows[0].id;
  const workspaceId = await resolveRecipientWorkspace(recipientId, email);

  await pool.query(
    `INSERT INTO subscriptions (workspace_id, plan, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (workspace_id) DO UPDATE SET plan = EXCLUDED.plan, status = 'active'`,
    [workspaceId, plan],
  );

  await grantCredits({ workspaceId, amount: creditBonus, reason: 'admin_gift' });

  await pool.query(
    `INSERT INTO premium_grants (workspace_id, recipient_user_id, granted_by_admin_id, plan, credits_granted, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [workspaceId, recipientId, req.user!.id, plan, creditBonus, note ?? null],
  );

  res.status(201).json({ message: `Granted ${plan} to ${email}.`, workspaceId, creditBonus });
}

/** Revoke a previously gifted (or paid) plan for a user's personal workspace. */
export async function revokePremium(req: AuthedRequest, res: Response) {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'A valid email is required.');

  const { rows } = await pool.query(
    `UPDATE subscriptions s SET plan = 'starter', status = 'cancelled'
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = s.workspace_id AND wm.role = 'owner' AND u.email = $1
     RETURNING s.workspace_id`,
    [parsed.data.email],
  );
  if (rows.length === 0) {
    throw new ApiError(404, 'not_found', 'No active premium grant found for that email.');
  }
  res.json({ message: `Premium revoked for ${parsed.data.email}.` });
}

export async function listGrants(_req: AuthedRequest, res: Response) {
  const { rows } = await pool.query(
    `SELECT pg.id, u.email AS recipient_email, pg.plan, pg.credits_granted, pg.note, pg.created_at
     FROM premium_grants pg
     JOIN users u ON u.id = pg.recipient_user_id
     ORDER BY pg.created_at DESC LIMIT 200`,
  );
  res.json({ grants: rows });
}
