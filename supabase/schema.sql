-- Queue response-time tables. Run in the Supabase SQL editor for a hosted catalog.
-- Access tokens stay OAuth bearer tokens. This file does not create API keys.

create table if not exists public.queue_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'none',
  subscription_status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.response_catalogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_plans (
  id uuid primary key,
  catalog_id uuid not null references public.response_catalogs (id) on delete cascade,
  name text not null,
  summary text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.reply_windows (
  id uuid primary key,
  catalog_id uuid not null references public.response_catalogs (id) on delete cascade,
  plan_id uuid not null references public.customer_plans (id) on delete cascade,
  name text not null,
  within_minutes integer not null check (within_minutes > 0 and within_minutes <= 525600),
  statement text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_channels (
  id uuid primary key,
  catalog_id uuid not null references public.response_catalogs (id) on delete cascade,
  plan_id uuid not null references public.customer_plans (id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('email', 'chat', 'phone', 'sms', 'video')),
  statement text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.staffing_promises (
  id uuid primary key,
  catalog_id uuid not null references public.response_catalogs (id) on delete cascade,
  plan_id uuid not null references public.customer_plans (id) on delete cascade,
  name text not null,
  staffing_kind text not null check (staffing_kind in ('SHARED_QUEUE', 'DEDICATED_AGENT')),
  statement text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.queue_inquiries (
  id uuid primary key,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_plans_identity on public.customer_plans (catalog_id, lower(name));
create unique index if not exists reply_windows_identity on public.reply_windows (plan_id, lower(name));
create unique index if not exists plan_channels_identity on public.plan_channels (plan_id, channel);
create unique index if not exists staffing_promises_identity on public.staffing_promises (plan_id, staffing_kind);

alter table public.queue_accounts enable row level security;
alter table public.response_catalogs enable row level security;
alter table public.customer_plans enable row level security;
alter table public.reply_windows enable row level security;
alter table public.plan_channels enable row level security;
alter table public.staffing_promises enable row level security;
alter table public.queue_inquiries enable row level security;

create policy queue_accounts_select on public.queue_accounts for select to authenticated using (id = auth.uid());

create policy response_catalogs_owner on public.response_catalogs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy customer_plans_owner on public.customer_plans for all to authenticated
  using (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()));

create policy reply_windows_owner on public.reply_windows for all to authenticated
  using (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()));

create policy plan_channels_owner on public.plan_channels for all to authenticated
  using (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()));

create policy staffing_promises_owner on public.staffing_promises for all to authenticated
  using (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.response_catalogs c where c.id = catalog_id and c.owner_id = auth.uid()));

grant select on public.queue_accounts to authenticated;
grant select, insert, update, delete on public.response_catalogs to authenticated;
grant select, insert, update, delete on public.customer_plans to authenticated;
grant select, insert, update, delete on public.reply_windows to authenticated;
grant select, insert, update, delete on public.plan_channels to authenticated;
grant select, insert, update, delete on public.staffing_promises to authenticated;

create or replace function public.handle_new_queue_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.queue_accounts (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_queue on auth.users;
create trigger on_auth_user_created_queue
  after insert on auth.users
  for each row execute function public.handle_new_queue_user();
