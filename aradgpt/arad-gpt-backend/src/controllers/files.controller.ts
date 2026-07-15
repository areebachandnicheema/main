import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { createUploadUrl, createDownloadUrl } from '../services/storage.service';
import { ApiError } from '../middleware/errorHandler';

const requestUploadSchema = z.object({
  workspaceId: z.string().uuid(),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

/** Step 1: client asks for a place to upload. Server never touches the file bytes. */
export async function requestUpload(req: AuthedRequest, res: Response) {
  const parsed = requestUploadSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'filename and contentType are required.');

  const { uploadUrl, key, publicUrl } = await createUploadUrl(parsed.data);
  res.json({ uploadUrl, key, publicUrl });
}

/** Step 2: client confirms the upload succeeded, so we can record it against the workspace. */
export async function confirmUpload(req: AuthedRequest, res: Response) {
  const schema = z.object({
    workspaceId: z.string().uuid(),
    key: z.string().min(1),
    filename: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'Missing file metadata.');

  const { rows } = await pool.query(
    `INSERT INTO files (workspace_id, storage_key, filename, content_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, filename, content_type, size_bytes, created_at`,
    [parsed.data.workspaceId, parsed.data.key, parsed.data.filename, parsed.data.contentType, parsed.data.sizeBytes, req.user!.id],
  );
  res.status(201).json({ file: rows[0] });
}

export async function listFiles(req: AuthedRequest, res: Response) {
  const { workspaceId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, filename, content_type, size_bytes, created_at FROM files WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId],
  );
  res.json({ files: rows });
}

export async function getFileDownloadUrl(req: AuthedRequest, res: Response) {
  const { fileId } = req.params;
  const { rows } = await pool.query('SELECT storage_key FROM files WHERE id = $1', [fileId]);
  if (rows.length === 0) throw new ApiError(404, 'file_not_found', 'File not found.');
  const url = await createDownloadUrl(rows[0].storage_key);
  res.json({ url });
}
