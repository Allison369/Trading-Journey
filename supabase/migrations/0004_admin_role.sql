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
