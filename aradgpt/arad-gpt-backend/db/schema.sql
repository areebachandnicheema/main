-- ARAD GPT — core schema
-- Run against a Postgres 15+ database (Supabase-managed or self-hosted).
-- Supabase Auth owns the `auth.users` table; this schema mirrors the
-- subset the app needs into a local `users` table via a trigger so the
-- rest of the schema can foreign-key against it cleanly.

create extension if not exists "pgcrypto";

-- ---------- identity ----------

create table if not exists users (
  id uuid primary key,                 -- mirrors auth.users.id
  email text unique not null,
  display_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Keeps public.users in sync automatically whenever someone signs up —
-- including via Google OAuth, where Supabase creates the auth.users row
-- itself and this app never sees a manual "register" request.
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.users.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Bootstrap the first admin account manually after they've signed up once, e.g.:
--   update users set is_admin = true where email = 'you@yourdomain.com';

-- ---------- workspaces ----------

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  credits_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on workspace_members(user_id);

-- ---------- personas ----------

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  avatar_url text,
  system_prompt text not null,
  is_builtin boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ---------- chat ----------

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  persona_id uuid references personas(id),
  created_by uuid not null references users(id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  author_id uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_chat on messages(chat_id, created_at);

create or replace function touch_chat_updated_at() returns trigger as $$
begin
  update chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_chat on messages;
create trigger trg_touch_chat after insert on messages
  for each row execute function touch_chat_updated_at();

-- ---------- files ----------

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  storage_key text not null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_files_workspace on files(workspace_id, created_at desc);

-- ---------- character / identity lock (Consistency Engine) ----------

create table if not exists identity_locks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  reference_file_ids uuid[] not null default '{}',
  face_lock boolean not null default false,
  hair_lock boolean not null default false,
  wardrobe_lock boolean not null default false,
  style_lock boolean not null default false,
  seed bigint,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------- generations (image / video / audio jobs) ----------

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio')),
  prompt text not null,
  identity_lock_id uuid references identity_locks(id),
  reference_file_ids uuid[] not null default '{}',
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')) default 'queued',
  result_file_id uuid references files(id),
  error_message text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_generations_workspace on generations(workspace_id, created_at desc);

-- ---------- automation workflows ----------

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  definition jsonb not null, -- ordered list of { module, action, params, input_from }
  is_active boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')) default 'queued',
  step_results jsonb not null default '[]',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------- billing ----------

create table if not exists subscriptions (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  plan text not null check (plan in ('starter', 'studio', 'enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null check (status in ('active', 'past_due', 'cancelled')),
  updated_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delta numeric not null,           -- positive = grant, negative = charge
  reason text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_ledger_workspace on credit_ledger(workspace_id, created_at desc);

-- ---------- admin-gifted premium (audit trail) ----------

create table if not exists premium_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recipient_user_id uuid not null references users(id),
  granted_by_admin_id uuid not null references users(id),
  plan text not null check (plan in ('studio', 'enterprise')),
  credits_granted numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_premium_grants_recipient on premium_grants(recipient_user_id);

-- ---------- integrations (Drive, Slack, Notion, GitHub, etc.) ----------

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null, -- 'google_drive' | 'slack' | 'notion' | 'github' | 'dropbox' | ...
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  connected_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_integration_unique on integrations(workspace_id, provider);

-- ---------- row level security ----------
-- Enable RLS and scope every table to workspace membership. Supabase
-- exposes auth.uid() inside policies; the API server itself connects with
-- the service-role key and bypasses RLS by design (it enforces membership
-- in application code via workspace_members lookups instead).

alter table workspaces enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
alter table files enable row level security;
alter table generations enable row level security;

create policy workspace_read on workspaces for select
  using (exists (select 1 from workspace_members wm where wm.workspace_id = id and wm.user_id = auth.uid()));

create policy chats_read on chats for select
  using (exists (select 1 from workspace_members wm where wm.workspace_id = chats.workspace_id and wm.user_id = auth.uid()));

create policy messages_read on messages for select
  using (exists (
    select 1 from chats c
    join workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = messages.chat_id and wm.user_id = auth.uid()
  ));
