-- ═══════════════════════════════════════════════════════════════════════════
-- AI Assist — hand out credits manually
--
-- There is no purchase flow yet, so credits are granted by editing the
-- database. Run these in Supabase Studio's SQL editor (or psql).
--
-- Prefer `grant_ai_credits()`: it updates the balance *and* writes an
-- `ai_credit_ledger` row, so the account history stays complete.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Find the account you want to top up.
select p.id, p.display_name, p.username, p.role, p.ai_credits
from public.profiles p
where p.role in ('teacher', 'admin')
order by p.created_at desc;

-- 2. Grant credits (logged in the ledger).
select public.grant_ai_credits(
  '11111111-1111-4111-8111-111111111111',  -- the teacher's id from step 1
  100,                                     -- how many credits to add
  'grant'                                  -- reason recorded in the ledger
);

-- Or, in bulk: give every teacher a top-up.
select public.grant_ai_credits(p.id, 50, 'grant')
from public.profiles p
where p.role in ('teacher', 'admin');

-- ───────────────────────────────────────────────────────────────────────────
-- Escape hatch: change a balance directly. This does NOT write a ledger row,
-- so the audit trail will not explain the difference — use it only for
-- corrections, and consider adding the ledger entry yourself.
-- ───────────────────────────────────────────────────────────────────────────
-- update public.profiles set ai_credits = 500 where id = '<uuid>';
-- update public.profiles set ai_credits = 0  where id = '<uuid>';

-- Inspect a teacher's credit history.
-- select created_at, delta, balance_after, reason, question_count, provider
-- from public.ai_credit_ledger
-- where user_id = '11111111-1111-4111-8111-111111111111'
-- order by created_at desc;
