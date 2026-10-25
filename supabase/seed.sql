-- ============================================================================
-- TradeVault — development seed data
-- ============================================================================
-- DEVELOPMENT ONLY. Never run this against a production project.
--
-- This inserts a realistic, internally consistent sample journal into a
-- specific development user's account. It exists so the web and mobile apps
-- have something to render while building UI.
--
-- IMPORTANT: these are clearly-labelled SAMPLE rows belonging to a named
-- development user. They are not "demo results" presented as the real user's
-- performance — the apps show a persistent banner whenever they detect that
-- the signed-in account is the seed account (see apps/web/src/lib/sample.ts).
--
-- Run:
--   supabase db execute --file supabase/seed.sql
-- ============================================================================

do $$
declare
  dev_user    uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  acct_main   uuid := '11111111-1111-4111-8111-111111111111';
  acct_sec    uuid := '11111111-1111-4111-8111-111111111112';
  strat_bo    uuid := '33333333-3333-4333-8333-333333333331';
  strat_mr    uuid := '33333333-3333-4333-8333-333333333332';
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid;
begin
  -- ----------------------------------------------------------------------
  -- The development user itself.
  -- ----------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  )
  values (
    dev_user, '00000000-0000-0000-0000-000000000000',
    'sample@tradevault.local', crypt('sample-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sample Trader"}'::jsonb,
    'authenticated', 'authenticated', now(), now()
  )
  on conflict (id) do nothing;

  -- The trigger created the profile; fill in the rest of it.
  update public.profiles
     set display_name = 'Sample Trader',
         currency = 'USD',
         time_zone = 'UTC',
         default_instruments = array['EURUSD','GBPUSD','XAUUSD'],
         default_markets = array['FX','Metals'],
         onboarding_complete = true
   where id = dev_user;

  -- ----------------------------------------------------------------------
  -- Accounts
  -- ----------------------------------------------------------------------
  insert into public.trading_accounts (id, user_id, name, broker, currency, starting_balance)
  values
    (acct_main, dev_user, 'Sample Main Account', 'Example Broker', 'USD', 25000),
    (acct_sec,  dev_user, 'Sample Practice Account', 'Example Broker', 'USD', 5000)
  on conflict (id) do nothing;

  -- ----------------------------------------------------------------------
  -- Strategies
  -- ----------------------------------------------------------------------
  insert into public.trading_strategies (
    id, user_id, name, description, markets, instruments,
    entry_rules, exit_rules, risk_rules, session, checklist, tags
  )
  values
    (
      strat_bo, dev_user, 'London Breakout',
      'Trade the first decisive break of the Asian range at the London open.',
      array['FX'], array['EURUSD','GBPUSD'],
      'Wait for the Asian range to form. Enter on a close beyond the range with momentum.',
      'Take 50% at 1R, trail the rest behind the session low/high.',
      'Risk 1% of equity. No entry within 15 minutes of a major release.',
      'london',
      array['Asian range marked','No imminent news','Risk sized','Stop placed'],
      array['breakout','london','fx']
    ),
    (
      strat_mr, dev_user, 'Daily Mean Reversion',
      'Fade an extended move into a daily level with confirmation.',
      array['FX','Metals'], array['EURUSD','XAUUSD'],
      'Price reaches a daily support/resistance and prints a rejection candle.',
      'Target the mid-range. Exit on a close back through the level.',
      'Risk 0.5%. Skip if the daily trend is strongly directional.',
      'new_york',
      array['Level marked','Rejection candle','Risk sized'],
      array['mean-reversion','daily']
    )
  on conflict (id) do nothing;

  -- ----------------------------------------------------------------------
  -- Trades — a small, coherent history.
  -- ----------------------------------------------------------------------
  t1 := '44444444-4444-4444-8444-444444444401';
  t2 := '44444444-4444-4444-8444-444444444402';
  t3 := '44444444-4444-4444-8444-444444444403';
  t4 := '44444444-4444-4444-8444-444444444404';
  t5 := '44444444-4444-4444-8444-444444444405';
  t6 := '44444444-4444-4444-8444-444444444406';

  insert into public.trades (
    id, user_id, account_id, strategy_id, symbol, asset_class, market,
    direction, status, order_type, entry_at, entry_price, exit_at, exit_price,
    quantity, contract_multiplier, stop_loss, take_profit,
    entry_fees, exit_fees, funding_fees, slippage,
    strategy, session, entry_reason, exit_reason,
    emotion_before, emotion_during, emotion_after,
    mistakes, lessons, notes
  )
  values
    -- Winner, closed in full.
    (t1, dev_user, acct_main, strat_bo, 'EURUSD', 'forex', 'FX',
     'long', 'closed', 'market',
     '2026-02-02T08:05:00Z', 1.08500, '2026-02-02T14:20:00Z', 1.09120,
     1, 100000, 1.08200, 1.09400, 3.50, 3.50, 0, 0,
     'London Breakout', 'london',
     'Clean break of the Asian range with a strong close.',
     'Trailed out behind the session high as momentum faded.',
     'calm', 'confident', 'calm',
     null, 'Waiting for the retest gave a better fill than chasing.', null),

    -- Loser, stopped out.
    (t2, dev_user, acct_main, strat_bo, 'GBPUSD', 'forex', 'FX',
     'long', 'closed', 'market',
     '2026-02-03T08:10:00Z', 1.26400, '2026-02-03T09:05:00Z', 1.26050,
     1, 100000, 1.26100, 1.27200, 3.50, 3.50, 0, 5,
     'London Breakout', 'london',
     'Break of the range high.', 'Stopped out on a sharp reversal.',
     'confident', 'impatient', 'frustrated',
     'Entered before the candle closed.', 'Wait for the confirmed close.', null),

    -- Partial exits across two legs.
    (t3, dev_user, acct_main, strat_mr, 'XAUUSD', 'commodity', 'Metals',
     'short', 'closed', 'limit',
     '2026-02-05T14:00:00Z', 2035.50, '2026-02-05T18:30:00Z', 2028.00,
     2, 100, 2042.00, 2022.00, 4.00, 4.00, 1.20, 0,
     'Daily Mean Reversion', 'new_york',
     'Rejection wick at daily resistance.', 'Scaled out into the mid-range.',
     'neutral', 'calm', 'satisfied',
     null, null, 'Two-leg exit: half at target one.'),

    -- Breakeven-ish, tiny loss after costs.
    (t4, dev_user, acct_main, null, 'EURUSD', 'forex', 'FX',
     'short', 'closed', 'market',
     '2026-02-09T10:00:00Z', 1.07900, '2026-02-09T11:15:00Z', 1.07880,
     1, 100000, 1.08300, 1.07000, 3.50, 3.50, 0, 0,
     null, 'london',
     'Faded an extended push.', 'Closed early when the market stalled.',
     'anxious', 'anxious', 'neutral',
     'Cut it before the plan said to.', null, 'Moved the stop to breakeven too early.'),

    -- Still open — must never appear in realised performance.
    (t5, dev_user, acct_main, strat_bo, 'EURUSD', 'forex', 'FX',
     'long', 'open', 'market',
     '2026-02-12T08:05:00Z', 1.09200, null, null,
     1, 100000, 1.08900, 1.09800, 3.50, 0, 0, 0,
     'London Breakout', 'london',
     'Range break with momentum.', null,
     'calm', 'calm', null,
     null, null, 'Open position carried from the London session.'),

    -- Partially closed on the secondary account.
    (t6, dev_user, acct_sec, strat_mr, 'GBPUSD', 'forex', 'FX',
     'long', 'partial', 'market',
     '2026-02-11T12:00:00Z', 1.25500, '2026-02-11T16:00:00Z', 1.25800,
     0.5, 100000, 1.25200, 1.26200, 1.00, 1.00, 0, 0,
     'Daily Mean Reversion', 'new_york',
     'Bounce from daily support.', 'Banked half at the first target.',
     'confident', 'calm', 'calm',
     null, null, 'Half closed; the rest runs to the daily mid-range.');

  -- ----------------------------------------------------------------------
  -- Exits — consistent with the trades above.
  -- ----------------------------------------------------------------------
  insert into public.trade_exits (id, user_id, trade_id, quantity, price, fees, exited_at, notes)
  values
    ('55555555-5555-4555-8555-555555555501', dev_user, t1, 1,    1.09120, 3.50, '2026-02-02T14:20:00Z', null),
    ('55555555-5555-4555-8555-555555555502', dev_user, t2, 1,    1.26050, 3.50, '2026-02-03T09:05:00Z', 'Stopped out.'),
    ('55555555-5555-4555-8555-555555555503', dev_user, t3, 1,    2030.00, 2.00, '2026-02-05T16:00:00Z', 'First target.'),
    ('55555555-5555-4555-8555-555555555504', dev_user, t3, 1,    2026.00, 2.00, '2026-02-05T18:30:00Z', 'Runner closed at the mid-range.'),
    ('55555555-5555-4555-8555-555555555505', dev_user, t4, 1,    1.07880, 3.50, '2026-02-09T11:15:00Z', null),
    ('55555555-5555-4555-8555-555555555506', dev_user, t6, 0.25, 1.25800, 1.00, '2026-02-11T16:00:00Z', 'Half of the position.');
  on conflict (id) do nothing;

  -- ----------------------------------------------------------------------
  -- Journal
  -- ----------------------------------------------------------------------
  insert into public.journal_entries (
    id, user_id, entry_date, period, title, goals, market_observations,
    pre_market_plan, trades_summary, emotional_state, discipline_score,
    mistakes, lessons, improvements, tags
  )
  values
    (
      '66666666-6666-4666-8666-666666666601', dev_user,
      '2026-02-02', 'daily', 'Range break, clean execution',
      'Only take the London break if the Asian range is at least 20 pips.',
      'USD soft into the London open; EURUSD holding above the Asian high.',
      'Mark the Asian range at 07:30. One setup only, 1% risk.',
      'One trade, one win. Followed the plan exactly.',
      'Calm and patient.', 9,
      null,
      'Waiting for the retest produced a materially better entry.',
      'Keep writing the range levels down before the open.',
      array['london','discipline']
    ),
    (
      '66666666-6666-4666-8666-666666666602', dev_user,
      '2026-02-03', 'daily', 'Chased an entry',
      'No entries before the candle closes.',
      'Sharp reversal after the initial push; the range high failed.',
      'Wait for confirmation.',
      'One trade, one loss. Entered too early and was stopped.',
      'Confident then impatient.', 5,
      'Entered before the candle closed and without the retest.',
      'Confirmation is not optional; the setup is defined by it.',
      'Add a hard rule: no entry until the 15m candle closes.',
      array['mistake','discipline']
    ),
    (
      '66666666-6666-4666-8666-666666666603', dev_user,
      '2026-02-05', 'weekly', 'Week 6 review',
      'Two clean setups, zero rule breaks.',
      'Gold rejected daily resistance twice; dollar index firm.',
      'Focus on the mean-reversion setup at the daily level.',
      'Two closed trades, one win and one scratch. Net positive before costs.',
      'Neutral.', 7,
      'Closed the EURUSD too early out of impatience.',
      'Small losses are cheap; cutting winners short is expensive.',
      'Test a fixed second target instead of a discretionary exit.',
      array['review']
    )
  on conflict (id) do nothing;

  -- ----------------------------------------------------------------------
  -- Tags, rules and risk settings
  -- ----------------------------------------------------------------------
  insert into public.tags (id, user_id, name, color, kind)
  values
    ('77777777-7777-4777-8777-777777777701', dev_user, 'breakout', '#22C55E', 'trade'),
    ('77777777-7777-4777-8777-777777777702', dev_user, 'mistake',  '#EF4444', 'trade'),
    ('77777777-7777-4777-8777-777777777703', dev_user, 'review',   '#6C2BD9', 'journal')
  on conflict (id) do nothing;

  insert into public.trading_rules (id, user_id, label, description, sort_order)
  values
    ('88888888-8888-4888-8888-888888888801', dev_user, 'No entry before the candle closes',
     'A setup is only valid once the confirmation candle has closed.', 1),
    ('88888888-8888-4888-8888-888888888802', dev_user, 'Risk never exceeds 1%',
     'Position size is calculated from the stop distance, never guessed.', 2),
    ('88888888-8888-4888-8888-888888888803', dev_user, 'Stop after two losses',
     'Step away for the session after two consecutive losses.', 3)
  on conflict (id) do nothing;

  update public.risk_settings
     set default_risk_percent = 1,
         max_risk_per_trade_percent = 1.5,
         daily_loss_limit_amount = 250,
         weekly_loss_limit_amount = 750,
         max_consecutive_losses = 2,
         cooldown_after_losses = 1,
         base_currency = 'USD'
   where user_id = dev_user and account_id is null;

  raise notice 'TradeVault sample data seeded for user %', dev_user;
end $$;
