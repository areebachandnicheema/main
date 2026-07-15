import { Response } from 'express';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';

const STARTER_CREDITS = 200;

/**
 * Call this once right after a successful sign-in (including the first
 * Google OAuth login). It's idempotent: if the user already has a
 * workspace, it just returns it; otherwise it creates their default one.
 */
export async function bootstrapAccount(req: AuthedRequest, res: Response) {
  const userId = req.user!.id;
  const email = req.user!.email;

  const existing = await pool.query(
    `SELECT w.id, w.name, w.credits_balance
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY w.created_at ASC LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    return res.json({ workspace: existing.rows[0], created: false });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO workspaces (name, owner_id, credits_balance)
       VALUES ($1, $2, $3) RETURNING id, name, credits_balance`,
      [`${email}'s workspace`, userId, STARTER_CREDITS],
    );
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [created.rows[0].id, userId],
    );
    await client.query('COMMIT');
    res.status(201).json({ workspace: created.rows[0], created: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMe(req: AuthedRequest, res: Response) {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, avatar_url, is_admin FROM users WHERE id = $1',
    [req.user!.id],
  );
  res.json({ user: rows[0] ?? { id: req.user!.id, email: req.user!.email } });
}
