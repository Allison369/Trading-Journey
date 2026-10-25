
/* ==========================================================================
 * FILE: supabase/migrations/0001_initial_schema.sql
 * ========================================================================== */
-- ============================================================================
-- TradeVault — initial schema
-- ============================================================================
-- Target: Supabase (PostgreSQL 15+)
--
-- Design notes
--   * Every user-owned row carries `user_id uuid not null references auth.users`.
--     Row Level Security is enabled on every table so a user can only ever see
--     their own data. The client never filters for security; the database does.
--   * Money and quantities are stored as `numeric`, never floating point.
--   * `revision` is bumped by trigger on every update and is the basis of the
--     offline conflict-detection strategy.
--   * Deletes are soft (`deleted_at`) so an offline client can still converge.
--   * Ids are generated on the client so that replaying an insert after a
--     network failure cannot create a duplicate row.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------

-- Keep updated_at and revision in step on every write.
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.revision := coalesce(old.revision, 0) + 1;
  return new;
end;
$$;

-- Supported currency codes, used as a domain check.
create or replace function public.is_supported_currency(code text)
returns boolean
language sql
immutable
as $$
  select code = any (array['USD','EUR','GBP','UGX','JPY','AUD','CAD','CHF']);
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  display_name      text        not null default 'Trader',
  currency          text        not null default 'USD' check (public.is_supported_currency(currency)),
  time_zone         text        not null default 'UTC',
  default_instruments text[]    not null default '{}',
  default_markets   text[]      not null default '{}',
  theme             text        not null default 'dark' check (theme in ('dark','light','system')),
  risk_percent_default numeric  not null default 1 check (risk_percent_default > 0),
  onboarding_complete boolean   not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revision          integer     not null default 1
);

create or replace trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- trading_accounts
-- ----------------------------------------------------------------------------

create table if not exists public.trading_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  broker              text,
  currency            text not null default 'USD' check (public.is_supported_currency(currency)),
  starting_balance    numeric not null default 0,
  balance_adjustments numeric not null default 0,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  revision            integer not null default 1,
  deleted_at          timestamptz
);

create index if not exists trading_accounts_user_idx
  on public.trading_accounts (user_id) where deleted_at is null;

create or replace trigger trading_accounts_touch
  before update on public.trading_accounts
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- trading_strategies
-- ----------------------------------------------------------------------------

create table if not exists public.trading_strategies (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  description       text,
  markets           text[] not null default '{}',
  instruments       text[] not null default '{}',
  entry_rules       text,
  exit_rules        text,
  risk_rules        text,
  session           text check (session is null or session in ('sydney','tokyo','london','new_york','outside')),
  checklist         text[] not null default '{}',
  tags              text[] not null default '{}',
  improvement_notes text,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revision          integer not null default 1,
  deleted_at        timestamptz
);

create index if not exists trading_strategies_user_idx
  on public.trading_strategies (user_id) where deleted_at is null;

create or replace trigger trading_strategies_touch
  before update on public.trading_strategies
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- trades
-- ----------------------------------------------------------------------------

create table if not exists public.trades (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  account_id          uuid not null references public.trading_accounts (id) on delete cascade,
  strategy_id         uuid references public.trading_strategies (id) on delete set null,

  symbol              text not null,
  asset_class         text not null default 'other'
                        check (asset_class in ('forex','crypto','stock','index','future','commodity','option','other')),
  market              text,
  direction           text not null check (direction in ('long','short')),
  status              text not null default 'open' check (status in ('open','partial','closed')),
  order_type          text not null default 'market' check (order_type in ('market','limit','stop','stop_limit')),

  entry_at            timestamptz not null,
  entry_price         numeric not null check (entry_price > 0),
  exit_at             timestamptz,
  exit_price          numeric check (exit_price is null or exit_price > 0),

  quantity            numeric not null check (quantity > 0),
  contract_multiplier numeric not null default 1 check (contract_multiplier > 0),

  stop_loss           numeric,
  take_profit         numeric,

  entry_fees          numeric not null default 0,
  exit_fees           numeric not null default 0,
  funding_fees        numeric not null default 0,
  slippage            numeric not null default 0,

  strategy            text,
  setup_type          text,
  session             text not null default 'outside'
                        check (session in ('sydney','tokyo','london','new_york','outside')),

  entry_reason        text,
  exit_reason         text,

  emotion_before      text,
  emotion_during      text,
  emotion_after       text,

  mistakes            text,
  lessons             text,
  notes               text,

  manual_net_pnl      numeric,

  -- Duplicate detection for CSV imports. Null for manually entered trades.
  import_fingerprint  text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  revision            integer not null default 1,
  deleted_at          timestamptz,

  -- An exit price and an exit time must arrive together.
  constraint trades_exit_pair check (
    (exit_at is null and exit_price is null) or (exit_at is not null and exit_price is not null)
  ),
  -- A closed trade must have been exited.
  constraint trades_closed_has_exit check (
    status <> 'closed' or (exit_at is not null and exit_price is not null)
  ),
  -- The exit cannot precede the entry.
  constraint trades_exit_after_entry check (exit_at is null or exit_at >= entry_at),
  -- A long trade stops out below entry; a short one above.
  constraint trades_stop_side check (
    stop_loss is null
    or (direction = 'long' and stop_loss < entry_price)
    or (direction = 'short' and stop_loss > entry_price)
  ),
  -- A long trade takes profit above entry; a short one below.
  constraint trades_target_side check (
    take_profit is null
    or (direction = 'long' and take_profit > entry_price)
    or (direction = 'short' and take_profit < entry_price)
  )
);

create index if not exists trades_user_idx on public.trades (user_id) where deleted_at is null;
create index if not exists trades_account_idx on public.trades (account_id);
create index if not exists trades_entry_at_idx on public.trades (user_id, entry_at desc) where deleted_at is null;
create index if not exists trades_symbol_idx on public.trades (user_id, symbol) where deleted_at is null;
create index if not exists trades_strategy_idx on public.trades (strategy_id) where deleted_at is null;
create index if not exists trades_status_idx on public.trades (user_id, status) where deleted_at is null;
-- Partial unique index enforcing import de-duplication per user.
create unique index if not exists trades_import_fingerprint_uniq
  on public.trades (user_id, import_fingerprint)
  where import_fingerprint is not null and deleted_at is null;

create or replace trigger trades_touch
  before update on public.trades
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- trade_exits  (partial closes)
-- ----------------------------------------------------------------------------

create table if not exists public.trade_exits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  trade_id   uuid not null references public.trades (id) on delete cascade,
  quantity   numeric not null check (quantity > 0),
  price      numeric not null check (price > 0),
  fees       numeric not null default 0,
  exited_at  timestamptz not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision   integer not null default 1,
  deleted_at timestamptz
);

create index if not exists trade_exits_trade_idx on public.trade_exits (trade_id) where deleted_at is null;
create index if not exists trade_exits_user_idx on public.trade_exits (user_id);

create or replace trigger trade_exits_touch
  before update on public.trade_exits
  for each row execute function public.touch_row();

-- Guard: the sum of live exits must never exceed the opened quantity.
create or replace function public.check_exit_quantity()
returns trigger
language plpgsql
as $$
declare
  opened numeric;
  closed numeric;
begin
  select quantity into opened from public.trades where id = new.trade_id;
  if opened is null then
    return new;
  end if;

  select coalesce(sum(quantity), 0) into closed
  from public.trade_exits
  where trade_id = new.trade_id
    and deleted_at is null
    and id <> new.id;

  if closed + new.quantity > opened then
    raise exception 'Total closed quantity (%) exceeds opened quantity (%)', closed + new.quantity, opened
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace trigger trade_exits_quantity_guard
  before insert or update on public.trade_exits
  for each row execute function public.check_exit_quantity();

-- ----------------------------------------------------------------------------
-- trade_attachments
-- ----------------------------------------------------------------------------

create table if not exists public.trade_attachments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  trade_id    uuid not null references public.trades (id) on delete cascade,
  remote_path text,
  file_name   text not null,
  mime_type   text not null,
  byte_size   bigint not null default 0,
  caption     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revision    integer not null default 1,
  deleted_at  timestamptz,
  -- Only allow image uploads, restricting what the storage bucket will accept.
  constraint trade_attachments_image_only check (
    mime_type in ('image/png','image/jpeg','image/webp','image/gif')
  ),
  constraint trade_attachments_size_limit check (byte_size >= 0 and byte_size <= 10485760)
);

create index if not exists trade_attachments_trade_idx
  on public.trade_attachments (trade_id) where deleted_at is null;

create or replace trigger trade_attachments_touch
  before update on public.trade_attachments
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- journal_entries
-- ----------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  entry_date          date not null,
  period              text not null default 'daily' check (period in ('daily','weekly','monthly')),
  title               text,
  goals               text,
  market_observations text,
  pre_market_plan     text,
  trades_summary      text,
  emotional_state     text,
  discipline_score    integer check (discipline_score is null or (discipline_score between 1 and 10)),
  mistakes            text,
  lessons             text,
  improvements        text,
  notes               text,
  linked_trade_ids    uuid[] not null default '{}',
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  revision            integer not null default 1,
  deleted_at          timestamptz
);

create index if not exists journal_entries_user_date_idx
  on public.journal_entries (user_id, entry_date desc) where deleted_at is null;

create or replace trigger journal_entries_touch
  before update on public.journal_entries
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- tags  +  join tables
-- ----------------------------------------------------------------------------

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#6C2BD9',
  kind       text not null default 'trade' check (kind in ('trade','journal','strategy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision   integer not null default 1,
  deleted_at timestamptz
);

create unique index if not exists tags_user_name_kind_uniq
  on public.tags (user_id, lower(name), kind) where deleted_at is null;

create table if not exists public.trade_tags (
  trade_id uuid not null references public.trades (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (trade_id, tag_id)
);

create index if not exists trade_tags_user_idx on public.trade_tags (user_id);

create table if not exists public.journal_tags (
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  tag_id           uuid not null references public.tags (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  primary key (journal_entry_id, tag_id)
);

create index if not exists journal_tags_user_idx on public.journal_tags (user_id);

-- ----------------------------------------------------------------------------
-- trading_rules  +  risk_settings
-- ----------------------------------------------------------------------------

create table if not exists public.trading_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null,
  description text,
  is_enabled  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revision    integer not null default 1,
  deleted_at  timestamptz
);

create index if not exists trading_rules_user_idx
  on public.trading_rules (user_id, sort_order) where deleted_at is null;

create or replace trigger trading_rules_touch
  before update on public.trading_rules
  for each row execute function public.touch_row();

create table if not exists public.risk_settings (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  account_id               uuid references public.trading_accounts (id) on delete cascade,
  default_risk_percent     numeric not null default 1 check (default_risk_percent > 0 and default_risk_percent <= 100),
  max_risk_per_trade_percent numeric not null default 2 check (max_risk_per_trade_percent > 0 and max_risk_per_trade_percent <= 100),
  daily_loss_limit_amount  numeric check (daily_loss_limit_amount is null or daily_loss_limit_amount >= 0),
  weekly_loss_limit_amount numeric check (weekly_loss_limit_amount is null or weekly_loss_limit_amount >= 0),
  max_consecutive_losses   integer not null default 3 check (max_consecutive_losses between 1 and 50),
  cooldown_after_losses    integer not null default 3 check (cooldown_after_losses between 1 and 50),
  base_currency            text not null default 'USD' check (public.is_supported_currency(base_currency)),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  revision                 integer not null default 1
);

-- One risk profile per account (plus one global row where account_id is null).
create unique index if not exists risk_settings_user_account_uniq
  on public.risk_settings (user_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace trigger risk_settings_touch
  before update on public.risk_settings
  for each row execute function public.touch_row();

-- ----------------------------------------------------------------------------
-- import_jobs  +  import_errors
-- ----------------------------------------------------------------------------

create table if not exists public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  file_name     text not null,
  adapter       text not null default 'generic',
  total_rows    integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows  integer not null default 0,
  error_rows    integer not null default 0,
  status        text not null default 'preview'
                  check (status in ('preview','running','complete','failed','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists import_jobs_user_idx on public.import_jobs (user_id, created_at desc);

create table if not exists public.import_errors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  import_job_id uuid not null references public.import_jobs (id) on delete cascade,
  row_number    integer not null,
  column_name   text,
  message       text not null,
  raw_row       text,
  created_at    timestamptz not null default now()
);

create index if not exists import_errors_job_idx on public.import_errors (import_job_id, row_number);

-- ----------------------------------------------------------------------------
-- sync_metadata
-- ----------------------------------------------------------------------------

create table if not exists public.sync_metadata (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  last_synced_at timestamptz,
  device_id      text,
  app_version    text,
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- subscription_entitlements  (architecture only — no payment integration yet)
-- ----------------------------------------------------------------------------

create table if not exists public.subscription_entitlements (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  tier         text not null default 'free' check (tier in ('free','premium')),
  -- Set only after a store receipt has been verified. Never trust the client.
  verified_at  timestamptz,
  expires_at   timestamptz,
  provider     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- New-user bootstrap
-- ----------------------------------------------------------------------------

-- Create a profile and default risk settings whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', 'Trader'))
  on conflict (id) do nothing;

  insert into public.risk_settings (user_id, account_id)
  values (new.id, null)
  on conflict do nothing;

  insert into public.sync_metadata (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


/* ==========================================================================
 * FILE: supabase/migrations/0002_rls_policies.sql
 * ========================================================================== */
-- ============================================================================
-- TradeVault — Row Level Security policies
-- ============================================================================
-- Target: Supabase (PostgreSQL 15+). Run AFTER 0001_initial_schema.sql.
--
-- WHY THIS FILE MATTERS
--   The anon key ships inside the web bundle and the mobile app. Anyone can
--   extract it. It is therefore NOT a secret and NOT an authorisation
--   mechanism. The ONLY thing standing between one trader's journal and
--   another's is Row Level Security in this file.
--
--   Consequence: every table that holds user data must have RLS ENABLED and
--   must have explicit policies. A table with RLS enabled and no policies
--   denies everything, which is the safe default we start from.
--
-- MODEL
--   * Ownership is a direct `user_id = auth.uid()` check on almost every table.
--   * Child rows (trade_exits, attachments, join tables) are additionally
--     checked against their parent so a user cannot attach a row to someone
--     else's trade.
--   * `for all` policies cover select/insert/update/delete. `using` governs
--     which existing rows are visible or mutable; `with check` governs what a
--     write is allowed to leave behind. Both are required — `using` alone lets
--     a client move a row to another user by updating user_id.
--
-- NOTE ON FOREIGN KEYS
--   PostgreSQL foreign key checks bypass RLS. Without the parent checks below,
--   user A could insert a trade_exit whose trade_id belongs to user B, and the
--   FK would happily pass while leaking the existence of B's trade id. The
--   extra `exists` clauses close that hole.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere. Deny-by-default until a policy says otherwise.
-- ----------------------------------------------------------------------------

alter table public.profiles                enable row level security;
alter table public.trading_accounts        enable row level security;
alter table public.trading_strategies      enable row level security;
alter table public.trades                  enable row level security;
alter table public.trade_exits             enable row level security;
alter table public.trade_attachments       enable row level security;
alter table public.journal_entries         enable row level security;
alter table public.tags                    enable row level security;
alter table public.trade_tags              enable row level security;
alter table public.journal_tags            enable row level security;
alter table public.trading_rules           enable row level security;
alter table public.risk_settings           enable row level security;
alter table public.import_jobs             enable row level security;
alter table public.import_errors           enable row level security;
alter table public.sync_metadata           enable row level security;
alter table public.subscription_entitlements enable row level security;

-- Force RLS to apply to the table owner as well. Without this, a table owner
-- role bypasses its own policies, which is a common and silent footgun.
alter table public.profiles                force row level security;
alter table public.trading_accounts        force row level security;
alter table public.trading_strategies      force row level security;
alter table public.trades                  force row level security;
alter table public.trade_exits             force row level security;
alter table public.trade_attachments       force row level security;
alter table public.journal_entries         force row level security;
alter table public.tags                    force row level security;
alter table public.trade_tags              force row level security;
alter table public.journal_tags            force row level security;
alter table public.trading_rules           force row level security;
alter table public.risk_settings           force row level security;
alter table public.import_jobs             force row level security;
alter table public.import_errors           force row level security;
alter table public.sync_metadata           force row level security;
alter table public.subscription_entitlements force row level security;

-- ----------------------------------------------------------------------------
-- profiles
--   A user may read and update only their own profile. There is no insert
--   policy: the row is created by the handle_new_user trigger, which runs as
--   definer. A direct client insert would let a user choose their own id.
-- ----------------------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- trading_accounts
-- ----------------------------------------------------------------------------

drop policy if exists "trading_accounts_select_own" on public.trading_accounts;
create policy "trading_accounts_select_own"
  on public.trading_accounts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trading_accounts_insert_own" on public.trading_accounts;
create policy "trading_accounts_insert_own"
  on public.trading_accounts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
create policy "trading_accounts_update_own"
  on public.trading_accounts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trading_accounts_delete_own" on public.trading_accounts;
create policy "trading_accounts_delete_own"
  on public.trading_accounts for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trading_strategies
-- ----------------------------------------------------------------------------

drop policy if exists "trading_strategies_select_own" on public.trading_strategies;
create policy "trading_strategies_select_own"
  on public.trading_strategies for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trading_strategies_insert_own" on public.trading_strategies;
create policy "trading_strategies_insert_own"
  on public.trading_strategies for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "trading_strategies_update_own" on public.trading_strategies;
create policy "trading_strategies_update_own"
  on public.trading_strategies for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trading_strategies_delete_own" on public.trading_strategies;
create policy "trading_strategies_delete_own"
  on public.trading_strategies for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trades
--   The account_id and strategy_id must belong to the same user. This stops a
--   user writing a trade into someone else's account.
-- ----------------------------------------------------------------------------

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
  on public.trades for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own"
  on public.trades for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trading_accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
    and (
      strategy_id is null
      or exists (
        select 1 from public.trading_strategies s
        where s.id = strategy_id and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
  on public.trades for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trading_accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
    and (
      strategy_id is null
      or exists (
        select 1 from public.trading_strategies s
        where s.id = strategy_id and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own"
  on public.trades for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trade_exits
-- ----------------------------------------------------------------------------

drop policy if exists "trade_exits_select_own" on public.trade_exits;
create policy "trade_exits_select_own"
  on public.trade_exits for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trade_exits_insert_own" on public.trade_exits;
create policy "trade_exits_insert_own"
  on public.trade_exits for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "trade_exits_update_own" on public.trade_exits;
create policy "trade_exits_update_own"
  on public.trade_exits for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "trade_exits_delete_own" on public.trade_exits;
create policy "trade_exits_delete_own"
  on public.trade_exits for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trade_attachments
-- ----------------------------------------------------------------------------

drop policy if exists "trade_attachments_select_own" on public.trade_attachments;
create policy "trade_attachments_select_own"
  on public.trade_attachments for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trade_attachments_insert_own" on public.trade_attachments;
create policy "trade_attachments_insert_own"
  on public.trade_attachments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "trade_attachments_update_own" on public.trade_attachments;
create policy "trade_attachments_update_own"
  on public.trade_attachments for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "trade_attachments_delete_own" on public.trade_attachments;
create policy "trade_attachments_delete_own"
  on public.trade_attachments for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- journal_entries
-- ----------------------------------------------------------------------------

drop policy if exists "journal_entries_select_own" on public.journal_entries;
create policy "journal_entries_select_own"
  on public.journal_entries for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "journal_entries_insert_own" on public.journal_entries;
create policy "journal_entries_insert_own"
  on public.journal_entries for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "journal_entries_update_own" on public.journal_entries;
create policy "journal_entries_update_own"
  on public.journal_entries for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "journal_entries_delete_own" on public.journal_entries;
create policy "journal_entries_delete_own"
  on public.journal_entries for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- tags
-- ----------------------------------------------------------------------------

drop policy if exists "tags_select_own" on public.tags;
create policy "tags_select_own"
  on public.tags for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "tags_insert_own" on public.tags;
create policy "tags_insert_own"
  on public.tags for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "tags_update_own" on public.tags;
create policy "tags_update_own"
  on public.tags for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "tags_delete_own" on public.tags;
create policy "tags_delete_own"
  on public.tags for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trade_tags  /  journal_tags
--   Both sides of the join must belong to the caller. Otherwise a user could
--   tag their own trade with someone else's tag id and read its name back.
-- ----------------------------------------------------------------------------

drop policy if exists "trade_tags_select_own" on public.trade_tags;
create policy "trade_tags_select_own"
  on public.trade_tags for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trade_tags_insert_own" on public.trade_tags;
create policy "trade_tags_insert_own"
  on public.trade_tags for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = auth.uid())
    and exists (select 1 from public.tags g where g.id = tag_id  and g.user_id = auth.uid())
  );

drop policy if exists "trade_tags_delete_own" on public.trade_tags;
create policy "trade_tags_delete_own"
  on public.trade_tags for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "journal_tags_select_own" on public.journal_tags;
create policy "journal_tags_select_own"
  on public.journal_tags for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "journal_tags_insert_own" on public.journal_tags;
create policy "journal_tags_insert_own"
  on public.journal_tags for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.journal_entries j
      where j.id = journal_entry_id and j.user_id = auth.uid()
    )
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = auth.uid())
  );

drop policy if exists "journal_tags_delete_own" on public.journal_tags;
create policy "journal_tags_delete_own"
  on public.journal_tags for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trading_rules
-- ----------------------------------------------------------------------------

drop policy if exists "trading_rules_select_own" on public.trading_rules;
create policy "trading_rules_select_own"
  on public.trading_rules for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trading_rules_insert_own" on public.trading_rules;
create policy "trading_rules_insert_own"
  on public.trading_rules for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "trading_rules_update_own" on public.trading_rules;
create policy "trading_rules_update_own"
  on public.trading_rules for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trading_rules_delete_own" on public.trading_rules;
create policy "trading_rules_delete_own"
  on public.trading_rules for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- risk_settings
--   A module-level (account_id is null) row or an account-scoped row, but the
--   referenced account must be the caller's.
-- ----------------------------------------------------------------------------

drop policy if exists "risk_settings_select_own" on public.risk_settings;
create policy "risk_settings_select_own"
  on public.risk_settings for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "risk_settings_insert_own" on public.risk_settings;
create policy "risk_settings_insert_own"
  on public.risk_settings for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts a
        where a.id = account_id and a.user_id = auth.uid()
      )
    )
  );

drop policy if exists "risk_settings_update_own" on public.risk_settings;
create policy "risk_settings_update_own"
  on public.risk_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts a
        where a.id = account_id and a.user_id = auth.uid()
      )
    )
  );

drop policy if exists "risk_settings_delete_own" on public.risk_settings;
create policy "risk_settings_delete_own"
  on public.risk_settings for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- import_jobs  /  import_errors
-- ----------------------------------------------------------------------------

drop policy if exists "import_jobs_select_own" on public.import_jobs;
create policy "import_jobs_select_own"
  on public.import_jobs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "import_jobs_insert_own" on public.import_jobs;
create policy "import_jobs_insert_own"
  on public.import_jobs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "import_jobs_update_own" on public.import_jobs;
create policy "import_jobs_update_own"
  on public.import_jobs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "import_jobs_delete_own" on public.import_jobs;
create policy "import_jobs_delete_own"
  on public.import_jobs for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "import_errors_select_own" on public.import_errors;
create policy "import_errors_select_own"
  on public.import_errors for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "import_errors_insert_own" on public.import_errors;
create policy "import_errors_insert_own"
  on public.import_errors for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.import_jobs j
      where j.id = import_job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "import_errors_delete_own" on public.import_errors;
create policy "import_errors_delete_own"
  on public.import_errors for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- sync_metadata
--   Insert and update only. The row is created by the new-user trigger, and a
--   client only ever needs to stamp its own sync time.
-- ----------------------------------------------------------------------------

drop policy if exists "sync_metadata_select_own" on public.sync_metadata;
create policy "sync_metadata_select_own"
  on public.sync_metadata for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sync_metadata_insert_own" on public.sync_metadata;
create policy "sync_metadata_insert_own"
  on public.sync_metadata for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sync_metadata_update_own" on public.sync_metadata;
create policy "sync_metadata_update_own"
  on public.sync_metadata for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- subscription_entitlements
--   IMPORTANT: read-only for the client, deliberately.
--
--   Entitlements gate paid features. If a user could INSERT or UPDATE this
--   row they could simply grant themselves premium. Writes are performed only
--   by a trusted server-side process using the service-role key, which is
--   never shipped to a client. There is intentionally no insert/update/delete
--   policy here.
-- ----------------------------------------------------------------------------

drop policy if exists "subscription_entitlements_select_own" on public.subscription_entitlements;
create policy "subscription_entitlements_select_own"
  on public.subscription_entitlements for select
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Anonymous access
--   Nothing is readable without a session. The anon role gets no policies, so
--   it sees zero rows even with a valid anon key.
-- ----------------------------------------------------------------------------

-- (no policies are created for the `anon` role, by design)


/* ==========================================================================
 * FILE: supabase/migrations/0003_storage.sql
 * ========================================================================== */
-- ============================================================================
-- TradeVault — storage buckets and object policies
-- ============================================================================
-- Target: Supabase (PostgreSQL 15+). Run AFTER 0001 and 0002.
--
-- WHY THIS FILE MATTERS
--   Supabase Storage has its own authorization surface: `storage.objects` and
--   `storage.buckets` are real tables with their own RLS. Creating a bucket
--   through the dashboard does not automatically stop one signed-in user from
--   downloading another user's chart screenshots. The policies below do.
--
-- DESIGN
--   * ONE private bucket: `trade-attachments`. `public = false`, so a file can
--     never be fetched without an access check or a signed URL. Chart
--     screenshots can contain account numbers and position sizes — they must
--     not be world-readable.
--   * Objects are keyed as `<user_id>/<trade_id>/<uuid>-<filename>`. The first
--     path segment IS the owner. That makes the policy a simple, index-friendly
--     `(storage.foldername(name))[1] = auth.uid()::text` comparison rather than
--     a join.
--   * Only image MIME types are accepted, and there is a size ceiling. The
--     client checks these too, but the client check is a convenience; this
--     check is the one that counts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Bucket
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-attachments',
  'trade-attachments',
  false,
  10485760, -- 10 MiB
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Object policies
--   We restrict to the bucket explicitly so a future bucket is not silently
--   covered by these rules.
-- ----------------------------------------------------------------------------

-- Read: only objects under the caller's own prefix.
drop policy if exists "trade_attachments_read_own" on storage.objects;
create policy "trade_attachments_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'trade-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Upload: the path must start with the caller's id, so a user cannot place a
-- file in another user's folder.
drop policy if exists "trade_attachments_insert_own" on storage.objects;
create policy "trade_attachments_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trade-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Overwrite: same rule. Without this, an update could relocate an object.
drop policy if exists "trade_attachments_update_own" on storage.objects;
create policy "trade_attachments_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trade-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'trade-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: only the caller's own objects.
drop policy if exists "trade_attachments_delete_own" on storage.objects;
create policy "trade_attachments_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trade-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Note on signed URLs
--   The apps display screenshots with short-lived signed URLs generated by
--   storage.createSignedUrl(). A signed URL is a bearer token for a fixed
--   window; treat it as sensitive and never log it. Because the bucket is
--   private, a leaked object path alone is useless.
-- ----------------------------------------------------------------------------


/* ==========================================================================
 * FILE: supabase/migrations/0004_admin_role.sql
 * ========================================================================== */
-- ============================================================================
-- TradeVault — 0004 admin role
-- ============================================================================
-- Target: Supabase (PostgreSQL 15+). Run AFTER 0002_rls_policies.sql.
--
-- WHY THIS IS A MIGRATION AND NOT A CLIENT FLAG
--   The anon key is inside the web bundle and the mobile app. Anyone can read
--   it. A flag stored in the client — an env var, a localStorage entry, a
--   React state value — can therefore be flipped by whoever holds the bundle.
--   That is fine for hiding a menu, and useless for protecting anything.
--
--   So: the admin flag lives in the database, and Postgres decides who may
--   set it. The web app reads it after sign-in and uses it only to decide
--   which screen to draw. Even if someone edits the front-end to force the
--   admin screen open, every query that screen makes is still subject to the
--   policies below, and will return nothing they are not entitled to see.
--
-- WHAT AN ADMIN CAN SEE
--   Deliberately, and only: the list of accounts that exist, their email,
--   when they joined, how many trades they have, and when they last wrote.
--   An aggregate headcount.
--
--   An admin CANNOT read any trade, exit, journal entry, strategy, account
--   name, balance or attachment belonging to another user. There is no policy
--   in this file that grants it, and 0002_rls_policies.sql grants nothing to
--   anyone but the owner. A super-admin who can read every trader's journal is
--   a liability, not a feature — it turns a breach of the admin account into a
--   breach of every user's records at once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants access to the read-only users overview. Settable only by an existing
   admin or by the service role. Never trusted from the client as proof of
   anything other than which screen to render.';

-- A partial index: the admin list query filters on this, and the index stays
-- tiny because almost every row is false.
create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin;

-- ----------------------------------------------------------------------------
-- Locking the flag down
-- ----------------------------------------------------------------------------
-- 0002 created "profiles_update_own" with `with check (id = auth.uid())`. That
-- check allows a user to update their own row — INCLUDING setting is_admin on
-- themselves, because the policy looks only at row ownership, not at which
-- columns changed. Row Level Security has no column granularity.
--
-- The fix is a trigger. It is the standard pattern: RLS decides which rows you
-- may touch, a trigger decides which columns.
--
-- Rules:
--   * a normal user may not change is_admin at all — the value is silently
--     restored to what it was, rather than raising, so an ordinary profile
--     save that happens to include the column still succeeds;
--   * an admin may change it;
--   * the service role may change it (it bypasses the trigger via
--     auth.uid() being null in server-side calls — see the guard below);
--   * nobody may revoke their own admin flag, which prevents the last admin
--     from locking everyone out by accident.
-- ----------------------------------------------------------------------------

create or replace function public.guard_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if new.is_admin is not distinct from old.is_admin then
    -- Nothing changed. The overwhelmingly common case.
    return new;
  end if;

  -- auth.uid() is null when the request arrives with the service-role key or
  -- from a direct SQL session. Those are trusted, server-side contexts, and
  -- they are how the first admin is created (see the bootstrap below).
  if auth.uid() is null then
    return new;
  end if;

  select coalesce(p.is_admin, false)
    into caller_is_admin
    from public.profiles p
   where p.id = auth.uid();

  if not coalesce(caller_is_admin, false) then
    -- Not an admin: refuse the change to this column, allow the rest of the
    -- update through by restoring the previous value.
    new.is_admin := old.is_admin;
    return new;
  end if;

  -- An admin may promote or demote, but not demote themselves: that is how a
  -- single-admin deployment ends up with no way back in.
  if old.id = auth.uid() and old.is_admin and not new.is_admin then
    new.is_admin := old.is_admin;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_admin_flag on public.profiles;
create trigger profiles_guard_admin_flag
  before update on public.profiles
  for each row execute function public.guard_profile_admin_flag();

-- ----------------------------------------------------------------------------
-- Who is an admin
-- ----------------------------------------------------------------------------
-- `security definer` lets this read the profiles table without being subject
-- to the caller's row-level policies, which is required: an admin's own
-- profiles_select_own policy would show them only their own row, and the
-- function needs to answer "is this caller an admin", not "show me rows".
--
-- `stable` because it does not modify anything, so Postgres can inline it into
-- the admin policies below without re-running it per row.
-- ----------------------------------------------------------------------------

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = user_id),
    false
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin read access, narrowly scoped
-- ----------------------------------------------------------------------------
-- DO NOT ADD A POLICY HERE THAT LETS AN ADMIN SELECT FROM trades, trade_exits,
-- journal_entries, trading_strategies, trading_accounts or trade_attachments.
--
-- The whole design rests on the admin being able to answer "how many people
-- use this" without being able to answer "what did this person trade". If you
-- need platform-wide trade statistics, add an aggregate function that returns
-- counts and sums with no user-identifying column, not a select policy.
-- ----------------------------------------------------------------------------

-- An admin may see the profile rows of everyone — but only the columns the
-- overview needs are ever selected by the client, and the row carries no
-- trading data. profiles holds identity and preferences, not positions.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- An admin may update any profile, which is what makes promotion possible
-- through the API for a service that does not hold the service-role key.
-- The column guard above still restricts what may actually change.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- The users overview
-- ----------------------------------------------------------------------------
-- A view, not a table, so it can never drift out of sync with reality.
--
-- `security_invoker = false` is intentional and is why the view is safe: it
-- runs with the definer's rights, so it can count rows across all users, and
-- it exposes ONLY aggregates and identity. It returns nothing at all to a
-- caller who is not an admin, because the where clause is evaluated against
-- the caller.
--
-- Columns, and why each is here:
--   user_id, email, display_name  — identity, for support correspondence
--   joined_at, last_active_at     — account lifecycle
--   trade_count, journal_count    — engagement, as COUNTS only
--
-- Deliberately absent: anything about what was traded, any balance, any P&L,
-- any symbol. Aggregate counts are the most this view may expose.
-- ----------------------------------------------------------------------------

create or replace view public.admin_user_overview
with (security_invoker = false) as
select
  p.id                                        as user_id,
  p.email,
  p.display_name,
  p.created_at                                as joined_at,
  p.is_admin,
  (select count(*) from public.trades t
    where t.user_id = p.id and t.deleted_at is null)     as trade_count,
  (select count(*) from public.journal_entries j
    where j.user_id = p.id and j.deleted_at is null)     as journal_count,
  greatest(
    p.updated_at,
    coalesce((select max(t.updated_at) from public.trades t
               where t.user_id = p.id and t.deleted_at is null), p.updated_at),
    coalesce((select max(j.updated_at) from public.journal_entries j
               where j.user_id = p.id and j.deleted_at is null), p.updated_at)
  )                                           as last_active_at
from public.profiles p
where public.is_admin();

comment on view public.admin_user_overview is
  'Read-only summary of registered users for the super-admin page. Exposes
   identity and row counts only. Never trading detail. Returns no rows to a
   non-admin caller.';

revoke all on public.admin_user_overview from anon;
grant select on public.admin_user_overview to authenticated;

-- ----------------------------------------------------------------------------
-- Platform totals
-- ----------------------------------------------------------------------------
-- A single row of counts. Separate from the per-user view so the admin page can
-- show a headline without reading every row, and so there is one obvious place
-- to audit for "what platform-wide numbers exist".
-- ----------------------------------------------------------------------------

create or replace view public.admin_platform_totals
with (security_invoker = false) as
select
  (select count(*) from public.profiles)                                   as user_count,
  (select count(*) from public.profiles where is_admin)                    as admin_count,
  (select count(*) from public.profiles
    where created_at > now() - interval '7 days')                          as new_users_7d,
  (select count(*) from public.trades where deleted_at is null)            as trade_count,
  (select count(*) from public.journal_entries where deleted_at is null)   as journal_count
where public.is_admin();

revoke all on public.admin_platform_totals from anon;
grant select on public.admin_platform_totals to authenticated;

-- ============================================================================
-- BOOTSTRAP — creating the first admin
-- ============================================================================
-- There has to be a first admin, and it cannot be created through the app,
-- because at that moment nobody is an admin yet. It is done once, by you, with
-- access to the database.
--
-- Step 1: sign up normally through the web app, so the account exists.
--
-- Step 2: run this in the Supabase SQL editor, with your address:
--
--     update public.profiles
--        set is_admin = true
--      where email = 'you@example.com';
--
-- Step 3: verify it took, and that it went to exactly one row:
--
--     select id, email, is_admin from public.profiles where is_admin;
--
-- The SQL editor runs as the service role (auth.uid() is null), which the
-- guard function treats as trusted, so the update succeeds. Nobody can do this
-- through the API without already being an admin.
--
-- To add further admins, sign in as an existing one and either update the row
-- the same way, or use the promote control on the admin page.
-- ============================================================================
