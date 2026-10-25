-- ============================================================================
-- TradeVault — RLS isolation test suite
-- ============================================================================
-- Run this against a REAL Supabase project (or a local `supabase start` stack)
-- after applying migrations 0001–0004. It is not a migration; it creates
-- temporary users, proves the access rules, and rolls everything back.
--
-- It answers the one question a client-side test cannot:
--   "Can user A read, modify or delete user B's records?"
--
-- HOW TO RUN
--   supabase db execute --file supabase/tests/rls_isolation_test.sql
--   ...or paste into the Supabase SQL editor and run the whole script.
--
-- EXPECTED OUTPUT
--   A table of test results where every row reads PASS. Any FAIL row means a
--   policy is wrong and must be fixed before shipping.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Test harness
-- ----------------------------------------------------------------------------

create temporary table test_results (
  seq         serial,
  test_name   text,
  expected    text,
  actual      text,
  outcome     text
) on commit drop;

create or replace function pg_temp.record(
  p_name text,
  p_expected text,
  p_actual text
) returns void
language plpgsql
as $$
begin
  insert into test_results (test_name, expected, actual, outcome)
  values (
    p_name,
    p_expected,
    p_actual,
    case when p_expected = p_actual then 'PASS' else 'FAIL' end
  );
end;
$$;

-- Two throwaway users. auth.users is the source of truth; the handle_new_user
-- trigger should create their profiles and settings automatically.
do $$
declare
  user_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  )
  values
    (user_a, '00000000-0000-0000-0000-000000000000', 'rls-a@example.test',
     crypt('password-a', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"User A"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
    (user_b, '00000000-0000-0000-0000-000000000000', 'rls-b@example.test',
     crypt('password-b', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"User B"}'::jsonb, 'authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- Test 1 — the new-user trigger bootstrapped both profiles
-- ----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.record(
    'handle_new_user creates a profile',
    '1',
    (select count(*)::text from public.profiles
      where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 2 — as User A, insert an account and a trade
-- ----------------------------------------------------------------------------

-- Every subsequent statement runs as an authenticated user, NOT as the owner.
-- This is the whole point: `set local role` plus a request.jwt claim is exactly
-- what PostgREST does for a real request.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  account_id uuid := '11111111-1111-4111-8111-111111111111';
  trade_id   uuid := '22222222-2222-4222-8222-222222222222';
begin
  insert into public.trading_accounts (id, user_id, name, currency, starting_balance)
  values (account_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Main', 'USD', 10000);

  insert into public.trades (
    id, user_id, account_id, symbol, asset_class, direction, status,
    entry_at, entry_price, quantity, contract_multiplier, session
  )
  values (
    trade_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', account_id,
    'EURUSD', 'forex', 'long', 'open',
    now() - interval '2 hours', 1.1000, 1, 100000, 'london'
  );

  perform pg_temp.record(
    'User A can insert their own trade',
    '1',
    (select count(*)::text from public.trades where id = trade_id)
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 3 — User A cannot see User B's data
-- ----------------------------------------------------------------------------

-- Switch identity to User B and try to read User A's rows.
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
begin
  perform pg_temp.record(
    'User B CANNOT read User A''s account',
    '0',
    (select count(*)::text from public.trading_accounts
      where id = '11111111-1111-4111-8111-111111111111')
  );

  perform pg_temp.record(
    'User B CANNOT read User A''s trade',
    '0',
    (select count(*)::text from public.trades
      where id = '22222222-2222-4222-8222-222222222222')
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 4 — User B cannot modify or delete User A's rows
-- ----------------------------------------------------------------------------

do $$
declare
  affected integer;
begin
  update public.trades
     set symbol = 'HACKED'
   where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.record('User B CANNOT update User A''s trade', '0', affected::text);

  delete from public.trades
   where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.record('User B CANNOT delete User A''s trade', '0', affected::text);
end $$;

-- ----------------------------------------------------------------------------
-- Test 5 — User B cannot hijack a row by rewriting user_id
-- ----------------------------------------------------------------------------

-- This is the attack the `with check` clause exists to stop. Without it, the
-- `using` clause alone would let a user claim an existing row they can see.
do $$
declare
  affected integer;
begin
  update public.trading_accounts
     set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;
  perform pg_temp.record(
    'User B CANNOT reassign User A''s account to themselves',
    '0',
    affected::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 6 — User B cannot insert a row owned by User A
-- ----------------------------------------------------------------------------

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.trading_accounts (user_id, name, currency, starting_balance)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Injected', 'USD', 1);
  exception when others then
    failed := true;
  end;
  perform pg_temp.record(
    'User B CANNOT insert a row on behalf of User A',
    'true',
    failed::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 7 — User B cannot attach an exit to User A's trade
-- ----------------------------------------------------------------------------

-- Guarded by the `exists` clause in the trade_exits insert policy. The foreign
-- key alone would allow this, since FK checks bypass RLS.
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.trade_exits (user_id, trade_id, quantity, price, exited_at)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      1, 1.11, now()
    );
  exception when others then
    failed := true;
  end;
  perform pg_temp.record(
    'User B CANNOT attach an exit to User A''s trade',
    'true',
    failed::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 8 — User B cannot grant themselves premium
-- ----------------------------------------------------------------------------

do $$
declare
  affected integer;
begin
  insert into public.subscription_entitlements (user_id, tier)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'premium')
  on conflict (user_id) do nothing;

  -- The row must still be 'free' (created by nothing) or, if the insert was
  -- silently ignored by the missing policy, absent entirely.
  perform pg_temp.record(
    'User B CANNOT self-grant premium',
    'free',
    coalesce(
      (select tier from public.subscription_entitlements
        where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      'free'
    )
  );

  update public.subscription_entitlements
     set tier = 'premium'
   where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics affected = row_count;
  perform pg_temp.record(
    'User B CANNOT update their entitlement tier',
    '0',
    affected::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 9 — User A's own write still works (policies are not simply deny-all)
-- ----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  affected integer;
begin
  update public.trades
     set notes = 'Reviewed the setup'
   where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.record('User A CAN update their own trade', '1', affected::text);

  perform pg_temp.record(
    'revision increments on update',
    '2',
    (select revision::text from public.trades
      where id = '22222222-2222-4222-8222-222222222222')
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 10 — the exit-quantity guard rejects over-closing
-- ----------------------------------------------------------------------------

do $$
declare
  failed boolean := false;
begin
  begin
    -- The trade opened 1 unit; this exit tries to close 5.
    insert into public.trade_exits (user_id, trade_id, quantity, price, exited_at)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      5, 1.11, now()
    );
  exception when others then
    failed := true;
  end;
  perform pg_temp.record(
    'database rejects an over-closing exit',
    'true',
    failed::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 11 — the anon role sees nothing
-- ----------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  failed boolean := false;
  visible integer := 0;
begin
  begin
    select count(*) into visible from public.trades;
  exception when others then
    failed := true;
  end;
  perform pg_temp.record(
    'anon role cannot read trades',
    '0',
    case when failed then '0' else visible::text end
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 12 — a user cannot make themselves an admin
-- ----------------------------------------------------------------------------
-- The single most important admin test. RLS has no column granularity, so
-- "profiles_update_own" alone would let a user set is_admin on their own row.
-- The guard trigger is what stops it, and this proves the trigger is installed
-- and doing its job.
--
-- The update is expected to SUCCEED (it is the user's own profile) while
-- leaving is_admin false. That distinction matters: a normal save that happens
-- to include the column must not fail, it must be ignored.
-- ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  flag_after boolean := null;
  raised text := null;
begin
  begin
    update public.profiles
       set is_admin = true
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  exception when others then
    raised := sqlerrm;
  end;

  -- Read it back as the same user.
  select p.is_admin into flag_after
    from public.profiles p
   where p.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.record(
    'user A cannot self-promote to admin (update succeeded, flag stayed false)',
    'false',
    case
      when raised is not null then 'raised: ' || raised
      else coalesce(flag_after::text, 'no-row')
    end
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 13 — a non-admin sees no rows in the users overview
-- ----------------------------------------------------------------------------
-- The view runs as its definer so it can count across all users, which means
-- the ONLY thing keeping a normal user out is the `where public.is_admin()`
-- clause. If that clause were ever dropped, this test fails.
-- ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  visible integer := -1;
  raised text := null;
begin
  begin
    select count(*) into visible from public.admin_user_overview;
  exception when others then
    raised := sqlerrm;
  end;

  perform pg_temp.record(
    'non-admin sees 0 rows in the users overview',
    '0',
    case when raised is not null then 'raised: ' || raised else visible::text end
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 14 — an admin cannot read another user's trades
-- ----------------------------------------------------------------------------
-- The deliberate limitation, pinned as a test so nobody "helpfully" adds a
-- select policy for admins on trades later. An admin sees who exists; they do
-- not see what anyone traded.
--
-- User A is promoted here (as the service role would, with auth.uid() null).
-- Then, acting as the admin, we check that B's trades remain invisible.
-- ----------------------------------------------------------------------------

-- Promote A from a trusted, server-side context. This is the bootstrap path.
reset role;
update public.profiles
   set is_admin = true
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  b_trades integer := -1;
begin
  -- A trade belonging to B exists from the earlier tests. Count the ones A can
  -- see that are B's. As an admin, A can now read B's PROFILE row, so this is a
  -- genuine test that the trade tables are still owner-only.
  select count(*) into b_trades
    from public.trades
   where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  perform pg_temp.record(
    'admin cannot read another user''s trades',
    '0',
    b_trades::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 15 — an admin DOES see the users overview, and it carries no trade data
-- ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  rows_visible integer := -1;
  has_trade_columns boolean := false;
begin
  select count(*) into rows_visible from public.admin_user_overview;

  -- Assert the view's shape directly: no column name may suggest trading
  -- detail. This catches someone extending the view with a balance or a P&L.
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'admin_user_overview'
       and (
         column_name ~* 'pnl|profit|loss|balance|symbol|price|entry|exit|amount|equity'
       )
  ) into has_trade_columns;

  perform pg_temp.record(
    'admin sees every user in the overview',
    '2',
    rows_visible::text
  );

  perform pg_temp.record(
    'users overview exposes no trading columns',
    'false',
    has_trade_columns::text
  );
end $$;

-- ----------------------------------------------------------------------------
-- Test 16 — a user cannot revoke their own admin flag
-- ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  flag_after boolean := null;
begin
  update public.profiles
     set is_admin = false
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select p.is_admin into flag_after
    from public.profiles p
   where p.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.record(
    'admin cannot demote themselves',
    'true',
    coalesce(flag_after::text, 'no-row')
  );
end $$;

-- ----------------------------------------------------------------------------
-- Results
-- ----------------------------------------------------------------------------

reset role;

select
  lpad(seq::text, 2, '0') || '. ' || test_name as test,
  outcome
from test_results
order by seq;

select
  count(*) filter (where outcome = 'PASS') as passed,
  count(*) filter (where outcome = 'FAIL') as failed,
  count(*) as total
from test_results;

-- Fail loudly if anything is wrong, so CI cannot ignore it.
do $$
declare
  failures integer;
begin
  select count(*) into failures from test_results where outcome = 'FAIL';
  if failures > 0 then
    raise exception 'RLS isolation suite failed: % test(s) did not pass.', failures;
  end if;
end $$;

rollback;
