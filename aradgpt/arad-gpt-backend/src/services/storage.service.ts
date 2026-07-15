import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
});

/** Generates a short-lived URL the client uploads directly to — files never pass through our server. */
export async function createUploadUrl(params: { workspaceId: string; filename: string; contentType: string }) {
  const key = `workspaces/${params.workspaceId}/${randomUUID()}-${params.filename}`;
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: `${env.STORAGE_PUBLIC_URL}/${key}` };
}

export async function createDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 600 });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
}
