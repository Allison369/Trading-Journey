-- ============================================================================
-- TradeVault — journal entry attachments
-- ============================================================================
-- Target: Supabase (PostgreSQL 15+). Run AFTER 0001, 0002 and 0003.
--
-- WHY A SECOND TABLE
--   A journal entry is not a trade, and the two attachments have different
--   lifetimes:
--
--     * a trade's screenshot belongs to a record that is measured statistically.
--       Deleting the trade should take its charts with it.
--     * a journal entry's image is usually a *review* artefact — a weekly chart,
--       a screenshot of a rule break. It belongs to a calendar day, outlives any
--       single trade, and often relates to several trades at once, which is why
--       `journal_entries` already carries `linked_trade_ids`.
--
--   Folding them into one table would mean a nullable `trade_id`, a nullable
--   `journal_entry_id`, and a check constraint asserting exactly one is set —
--   a shape that every query then has to remember to filter correctly. Two
--   tables with one owner column each are harder to get wrong.
--
-- STORAGE
--   Same private bucket as trades. Journal objects are keyed as
--   `<user_id>/journal/<journal_entry_id>/<uuid>-<filename>`. The first path
--   segment is still the owner, so the existing `storage.objects` policies in
--   0003 already cover them — no policy change is needed, and a journal image
--   can never be fetched without an access check or a signed URL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table if not exists public.journal_attachments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- ON DELETE CASCADE: deleting the entry removes the rows. The objects in the
  -- bucket are removed by the app before the delete, since the database cannot
  -- reach into storage on its own.
  journal_entry_id  uuid not null references public.journal_entries (id) on delete cascade,
  remote_path       text,
  file_name         text not null,
  mime_type         text not null,
  byte_size         bigint not null default 0,
  caption           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revision          integer not null default 1,
  deleted_at        timestamptz,
  -- The same two checks the trade attachments carry: an image, under 10 MiB.
  -- Duplicated deliberately. A constraint on one table says nothing about
  -- another, and this is the check that actually holds.
  constraint journal_attachments_image_only check (
    mime_type in ('image/png','image/jpeg','image/webp','image/gif')
  ),
  constraint journal_attachments_size_limit check (byte_size >= 0 and byte_size <= 10485760)
);

create index if not exists journal_attachments_entry_idx
  on public.journal_attachments (journal_entry_id) where deleted_at is null;

create index if not exists journal_attachments_user_idx
  on public.journal_attachments (user_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- updated_at / revision maintenance
--   Mirrors the trigger used by the other tables, so a row edited through the
--   API cannot quietly claim an older revision than it has.
-- ----------------------------------------------------------------------------

create or replace function public.touch_journal_attachment()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.revision   := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists journal_attachments_touch on public.journal_attachments;
create trigger journal_attachments_touch
  before update on public.journal_attachments
  for each row execute function public.touch_journal_attachment();

-- ----------------------------------------------------------------------------
-- RLS
--   Identical shape to trade_attachments: a row is visible only to its owner,
--   and it can only be inserted for an entry the caller owns.
-- ----------------------------------------------------------------------------

alter table public.journal_attachments enable row level security;

drop policy if exists "journal_attachments_select_own" on public.journal_attachments;
create policy "journal_attachments_select_own"
  on public.journal_attachments for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "journal_attachments_insert_own" on public.journal_attachments;
create policy "journal_attachments_insert_own"
  on public.journal_attachments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    -- The entry must belong to the same user. Without this an attacker could
    -- attach a file to someone else's journal by guessing an entry id.
    and exists (
      select 1 from public.journal_entries e
      where e.id = journal_entry_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists "journal_attachments_update_own" on public.journal_attachments;
create policy "journal_attachments_update_own"
  on public.journal_attachments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "journal_attachments_delete_own" on public.journal_attachments;
create policy "journal_attachments_delete_own"
  on public.journal_attachments for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Note on the storage policies from 0003
--   They key on the FIRST path segment being the user id, so
--   `<uid>/journal/<entry>/<file>` is already covered. Do not move journal
--   objects to a path that does not start with the owner's id.
-- ----------------------------------------------------------------------------
