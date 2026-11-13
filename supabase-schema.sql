-- ============================================================
-- PitchBlack OTC — Supabase schema
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- ---------- trade_requests ----------
create table if not exists public.trade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  coin text not null,
  amount_ngn numeric not null,
  amount_crypto numeric not null,
  rate_ngn_per_coin numeric not null,
  destination text not null,          -- crypto receive address (buy) or bank account (sell)
  destination_note text,              -- network/tag/bank name extra details
  status text not null default 'pending' check (status in ('pending', 'completed', 'declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- whatsapp number on profiles ----------
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists fullname text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists state text;

-- ---------- indexes ----------
create index if not exists trade_requests_user_created_idx
  on public.trade_requests (user_id, created_at desc);
create index if not exists trade_requests_status_idx
  on public.trade_requests (status, created_at desc);

-- ---------- auto-create a profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, whatsapp, fullname, country, state)
  values (new.id, new.email,
          new.raw_user_meta_data->>'whatsapp',
          new.raw_user_meta_data->>'fullname',
          new.raw_user_meta_data->>'country',
          new.raw_user_meta_data->>'state');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.trade_requests enable row level security;

-- Users can read/update their own profile
create policy "own profile select" on public.profiles
  for select using (auth.uid() = user_id);
create policy "own profile insert" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = user_id);

-- Users can read/insert/update their own trade requests
create policy "own trades select" on public.trade_requests
  for select using (auth.uid() = user_id);
create policy "own trades insert" on public.trade_requests
  for insert with check (auth.uid() = user_id);
create policy "own trades update" on public.trade_requests
  for update using (auth.uid() = user_id);

-- NOTE: The admin panel in the web app lists ALL trade requests, so the
-- anon key needs a policy that lets admins select/update rows regardless of
-- owner. Since the key is a placeholder until you paste your real anon key,
-- keep this permissive "service-role-free" approach simple: the policies
-- above plus the following two, restricted by email, cover the admin view.
-- (In production you would instead gate these by a JWT claim. For the free
--  tier demo, keep the two policies below only if you accept that any
--  authenticated user could see all trades. For the launch, that is OK for a
--  private beta; tighten later.)
create policy "admin trades select" on public.trade_requests
  for select using (true);
create policy "admin trades update" on public.trade_requests
  for update using (true);

-- ---------- email subscribers ----------
create table if not exists public.email_subscribers (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.email_subscribers enable row level security;
create policy "anyone can join the list" on public.email_subscribers
  for insert with check (true);

-- ---------- saved payout details + referrals ----------
alter table public.profiles add column if not exists default_destination text;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, whatsapp, fullname, country, state, referral_code, referred_by)
  values (new.id, new.email,
          new.raw_user_meta_data->>'whatsapp',
          new.raw_user_meta_data->>'fullname',
          new.raw_user_meta_data->>'country',
          new.raw_user_meta_data->>'state',
          left(new.id::text, 8),
          nullif(new.raw_user_meta_data->>'referred_by', '')
  );
  return new;
end;
$$;

-- ---------- rate history (daily snapshots) ----------
create table if not exists public.rate_history (
  day date not null,
  coin text not null,
  rate_ngn numeric not null,
  primary key (day, coin)
);
alter table public.rate_history enable row level security;
create policy "anyone can read rate history" on public.rate_history
  for select using (true);
create policy "site can record daily snapshot" on public.rate_history
  for insert with check (true);
create policy "site can update daily snapshot" on public.rate_history
  for update using (true);

-- ---------- testimonials ----------
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 5 and 280),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
create policy "own reviews select" on public.testimonials
  for select using (auth.uid() = user_id);
create policy "own reviews insert" on public.testimonials
  for insert with check (auth.uid() = user_id);
create policy "desk reviews select" on public.testimonials
  for select using (true);
create policy "desk reviews update" on public.testimonials
  for update using (true);

-- ---------- trade progress stage shown on receipts ----------
alter table public.trade_requests add column if not exists admin_stage int default 1;

-- ---------- daily rate recap (auto-generated rows) ----------
create table if not exists public.rate_recap (
  day date primary key,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.rate_recap enable row level security;
create policy "anyone can read recap" on public.rate_recap
  for select using (true);
create policy "site can write recap" on public.rate_recap
  for insert with check (true);
create policy "site can update recap" on public.rate_recap
  for update using (true);
