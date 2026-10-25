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
