import { pool } from '../config/db';

/**
 * Always re-checked against the database rather than trusted from the JWT,
 * so revoking admin access takes effect immediately instead of waiting for
 * a token to expire.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
  return Boolean(rows[0]?.is_admin);
}
