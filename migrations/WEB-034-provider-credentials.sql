-- Run in your Supabase project's SQL editor before enabling account mode.
create table if not exists public.provider_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_keys text not null check (length(encrypted_keys) <= 16000),
  updated_at timestamptz not null default now()
);
alter table public.provider_credentials enable row level security;
alter table public.provider_credentials force row level security;
revoke all on public.provider_credentials from anon;
grant select, insert, update, delete on public.provider_credentials to authenticated;
create policy "Own provider credentials only" on public.provider_credentials
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
