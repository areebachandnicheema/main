# ARAD GPT — API Server

Node.js + TypeScript + Express backend. Handles auth verification, chat streaming, workspaces, file uploads, credits/billing, and generation job orchestration. Pairs with a Postgres database (Supabase), Redis, and S3-compatible object storage (Cloudflare R2).

## Architecture at a glance

```
client (Next.js) ─▶ API server (this repo) ─▶ Postgres (Supabase)
                          │                 └▶ Redis (rate limits)
                          ├─▶ Anthropic API (chat)
                          ├─▶ Image/Video/Audio providers (generation jobs)
                          ├─▶ Cloudflare R2 (file storage, presigned URLs)
                          └─▶ Stripe (billing)
```

- **Auth**: Supabase Auth issues the session JWT on the client; this server verifies it locally against `SUPABASE_JWT_SECRET` on every request — no round trip to Supabase per call.
- **Chat**: `/api/chat/messages` streams tokens back over Server-Sent Events as Anthropic generates them, and persists both sides of the conversation.
- **Generation**: image/video/audio requests are written as `queued` jobs and charged credits immediately; a separate worker process (not included — add a queue consumer reading from Redis or SQS) calls the actual provider and flips the job to `completed`.
- **Files**: uploads never pass through the API — the server only issues a presigned R2 URL and records the metadata once the client confirms the upload.
- **Credits**: every metered action goes through `chargeCredits`, which takes a row lock on the workspace so concurrent requests can't overdraw the balance.

## Local setup

```bash
cp .env.example .env        # fill in real values
npm install
npm run dev                 # tsx watch, http://localhost:8080
```

Or run the whole stack (API + Postgres + Redis) with Docker:

```bash
docker compose up --build
```

Load the schema into Postgres the first time:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Deploying it for real

You have two realistic paths. Pick managed unless you specifically need to self-host.

### Path A — Managed (fastest, recommended)

1. **Database — Supabase**
   - Create a project at supabase.com.
   - Paste `db/schema.sql` into the SQL editor and run it.
   - Copy `Project Settings → API`: `SUPABASE_URL`, `service_role` key, and `JWT Secret` (under `Auth → Settings`).
   - Copy `Project Settings → Database → Connection string` for `DATABASE_URL` (use the pooled connection string, port 6543, for serverless-friendly connections).

2. **Object storage — Cloudflare R2**
   - Create a bucket in the Cloudflare dashboard.
   - Create an R2 API token → gives you `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`.
   - `STORAGE_ENDPOINT` is `https://<account_id>.r2.cloudflarestorage.com`.
   - Attach a public custom domain to the bucket for `STORAGE_PUBLIC_URL`, or use R2's dev subdomain while testing.

3. **Redis — Upstash**
   - Create a free Redis database at upstash.com, copy the connection string into `REDIS_URL`.

4. **Billing — Stripe**
   - Create two recurring Prices (Studio, Enterprise) in the Stripe dashboard; put their IDs into `PLAN_PRICE_IDS` in `billing.controller.ts`.
   - Add a webhook endpoint pointing at `https://your-api-domain/api/billing/webhook`, subscribed to `checkout.session.completed` and `customer.subscription.deleted`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

5. **The API server — Railway (or Render / Fly.io, same idea)**
   - Push this repo to GitHub.
   - In Railway: `New Project → Deploy from GitHub repo`.
   - Add all variables from `.env.example` as Railway environment variables.
   - Railway detects the `Dockerfile` automatically and builds it — no extra config needed. Build command `npm run build`, start command `node dist/index.js` if you deploy without Docker instead.
   - Generate a public domain for the service (Railway → Settings → Networking).

6. **The frontend**
   - Deploy the Next.js client to Vercel.
   - Set `NEXT_PUBLIC_API_URL` to the Railway domain from step 5, and `CLIENT_ORIGIN` on the API side to the Vercel domain, so CORS allows it.

7. **DNS**
   - Point `api.aradgpt.com` at Railway, `aradgpt.com` at Vercel, `files.aradgpt.com` at the R2 bucket, via CNAME records at your registrar or Cloudflare DNS.

Total: no server to patch, autoscaling on the API and DB, TLS handled for you. This is the path to take for a real launch.

### Path B — Self-hosted (Docker on your own VM)

For full control (compliance requirements, on-prem, cost at very large scale):

```bash
# On a fresh Ubuntu VM with Docker + Docker Compose installed
git clone <your-repo-url> arad-gpt
cd arad-gpt/arad-gpt-backend
cp .env.example .env   # fill in real values — DATABASE_URL now points at the compose postgres service
docker compose up -d --build
psql "$DATABASE_URL" -f db/schema.sql
```

Put Caddy or nginx in front for TLS termination:

```
api.aradgpt.com {
  reverse_proxy localhost:8080
}
```

Caddy issues and renews the Let's Encrypt certificate automatically. Point your DNS A record at the VM's IP.

For anything beyond a single VM, move Postgres and Redis to managed services (even self-hosting the API, use RDS/Supabase for the database) — running your own Postgres in production is the part that actually costs engineering time later.

### CI/CD

`.github/workflows/ci.yml` runs typecheck + build on every PR, and deploys to Railway automatically on merge to `main` via `RAILWAY_TOKEN` (add it under repo Settings → Secrets). Swap the deploy step for `flyctl deploy` or Render's deploy hook if you pick a different host — the build/typecheck steps stay the same.

### Health check

`GET /health` returns `{ status: "ok", db: "connected" }` — point your host's health check and any uptime monitor at this route.

## Environment variables

See `.env.example` for the full list. Nothing in this server should ever run without every one of these set — `src/config/env.ts` validates them at boot and exits immediately with a clear message if any are missing, rather than failing confusingly later.

## Admin accounts: free premium + gifting

- **Free premium for admins**: every metered action (chat turns, image/video/audio generation) routes through `chargeCreditsForUser`, which checks `users.is_admin` fresh from the database before charging anything. If the caller is an admin, the charge is skipped entirely — on *any* workspace, not just one they own — and a zero-cost line is still written to `credit_ledger` so usage stays visible in reporting.
- **Making the first admin**: there's deliberately no API route to promote yourself to admin — that would be a privilege-escalation hole. After you sign up once, promote yourself directly in the database:
  ```sql
  update users set is_admin = true where email = 'you@yourdomain.com';
  ```
- **Gifting premium to any user** (by email): as an admin, call:
  ```bash
  curl -X POST https://api.aradgpt.com/api/admin/grant-premium \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -H "Content-Type: application/json" \
    -d '{"email":"friend@example.com","plan":"studio","note":"beta tester"}'
  ```
  This finds (or creates) the recipient's personal workspace, activates the plan, grants the plan's credit bonus, and logs the gift in `premium_grants` for an audit trail. `POST /api/admin/revoke-premium` reverses it; `GET /api/admin/grants` lists gift history.

## Google sign-in

Google auth is configured through Supabase, not custom backend code:

1. **Google Cloud Console** → APIs & Services → Credentials → create an OAuth Client ID (Web application). Add this authorized redirect URI:
   `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Providers → Google → paste the Client ID and Secret → Enable.
3. **Frontend** (any page, e.g. a "Continue with Google" button):
   ```ts
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

   await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: 'https://aradgpt.com/auth/callback' },
   });
   ```
4. On first login, Supabase creates the row in `auth.users`; the `on_auth_user_created` trigger in `db/schema.sql` copies it into `public.users` automatically, so this backend sees the user immediately without any extra sync code.
5. Right after the frontend gets a session back, call `POST /api/me/bootstrap` once — it's idempotent and creates the user's first workspace (200 starter credits) if they don't have one yet. Email/password and GitHub/Apple sign-in (if you enable them the same way in Supabase) all flow through this same trigger + bootstrap call, so nothing provider-specific lives in this codebase.

## What's not in this repo yet

- The queue worker that actually calls image/video/audio generation providers and marks `generations` rows complete (the API only enqueues; wire up a worker reading from Redis/SQS next).
- Realtime push for generation status (Supabase Realtime on the `generations` table is the natural fit given the stack already in use).
- The frontend client itself.
