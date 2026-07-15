import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

const createWorkspaceSchema = z.object({ name: z.string().min(1).max(80) });

const STARTER_CREDITS = 200;

export async function createWorkspace(req: AuthedRequest, res: Response) {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'A workspace name is required.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO workspaces (name, owner_id, credits_balance) VALUES ($1, $2, $3) RETURNING id, name, credits_balance`,
      [parsed.data.name, req.user!.id, STARTER_CREDITS],
    );
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [rows[0].id, req.user!.id],
    );
    await client.query('COMMIT');
    res.status(201).json({ workspace: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listWorkspaces(req: AuthedRequest, res: Response) {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.credits_balance, wm.role
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY w.created_at DESC`,
    [req.user!.id],
  );
  res.json({ workspaces: rows });
}

export async function inviteMember(req: AuthedRequest, res: Response) {
  const schema = z.object({ email: z.string().email(), role: z.enum(['admin', 'editor', 'viewer']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'A valid email and role are required.');

  const { workspaceId } = req.params;
  const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [parsed.data.email]);
  if (userRows.length === 0) {
    throw new ApiError(404, 'user_not_found', 'No ARAD GPT account exists for that email yet.');
  }

  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userRows[0].id, parsed.data.role],
  );
  res.status(201).json({ message: 'Member added.' });
}
