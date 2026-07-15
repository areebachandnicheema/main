import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080'),

  // Postgres / Supabase
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  // Redis (rate limiting, sessions, queues)
  REDIS_URL: z.string().min(1),

  // Object storage (Cloudflare R2 / S3-compatible)
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_PUBLIC_URL: z.string().url(),

  // Anthropic (chat + reasoning)
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // Image / video / audio generation providers (swap for your chosen vendors)
  IMAGE_GEN_API_KEY: z.string().optional(),
  VIDEO_GEN_API_KEY: z.string().optional(),
  AUDIO_GEN_API_KEY: z.string().optional(),

  // Billing
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // CORS
  CLIENT_ORIGIN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
