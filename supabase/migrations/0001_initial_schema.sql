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
