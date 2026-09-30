-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0004 — AI Assist credits
--
-- AI Assist used to be unlimited for every teacher. Each generation costs real
-- money at the model provider, so a teacher now spends from a balance:
--
--   profiles.ai_credits      the live balance (default 0, never client-writable)
--   ai_credit_ledger         an append-only audit trail of every movement
--
-- The balance is the source of truth for reads; the ledger explains how it got
-- there and is what a future purchase / invoicing flow will hang off.
--
-- Nothing here is client-writable. Both movements go through SECURITY DEFINER
-- functions:
--   apply_ai_credits()   spend (or, for the server/admin, top up) the caller
--   grant_ai_credits()   top up another account — admin or service role only
--
-- Until payments exist, credits are handed out by editing the database
-- directly — see `supabase/snippets/grant-ai-credits.sql`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Balance
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column ai_credits integer not null default 0 check (ai_credits >= 0);

comment on column public.profiles.ai_credits is
  'AI Assist credits remaining. Maintained by apply_ai_credits()/grant_ai_credits(), not client-writable.';

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table public.ai_credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  -- Signed movement: negative spends, positive grants/refunds.
  delta          integer not null,
  balance_after  integer not null check (balance_after >= 0),
  -- 'generation' | 'refund' | 'grant' | 'signup' | …
  reason         text not null,
  -- Only meaningful for a generation: what was asked for and by whom.
  question_count integer,
  provider       text,
  created_at     timestamptz not null default now()
);

create index ai_credit_ledger_user_idx
  on public.ai_credit_ledger (user_id, created_at desc);

comment on table public.ai_credit_ledger is
  'Append-only audit trail of AI Assist credit movements. Rows are written only by the credit functions.';

alter table public.ai_credit_ledger enable row level security;

-- Players (and admins) may read the history; no policy grants a write, so the
-- only way a row appears is through the SECURITY DEFINER functions.
create policy "players read their own ai credit history"
  on public.ai_credit_ledger for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- apply_ai_credits
--
-- Moves the *caller's* balance by `p_delta` and records it. A negative delta
-- is a spend anyone may make; a positive delta is a top-up, which only the
-- server (service role) or an admin may perform — otherwise a teacher could
-- refund themselves without limit.
-- ---------------------------------------------------------------------------
create or replace function public.apply_ai_credits(
  p_delta integer,
  p_reason text,
  p_question_count integer default null,
  p_provider text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text := auth.role();
  v_balance integer;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '42501';
  end if;

  if p_delta > 0 and v_role is distinct from 'service_role' and not public.is_admin(v_uid) then
    raise exception 'Chỉ hệ thống mới được cộng credit.' using errcode = '42501';
  end if;

  -- Lock the row so two concurrent generations cannot both spend the last
  -- credit: the second blocks here, then sees the decremented balance.
  select p.ai_credits into v_balance
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_balance + p_delta < 0 then
    -- The edge function turns this message into the teacher-facing "out of
    -- credits" response, so it has to read well.
    raise exception 'Bạn đã dùng hết credit AI. Hãy nạp thêm credit để tiếp tục soạn đề.'
      using errcode = 'P0001';
  end if;

  update public.profiles p
  set ai_credits = p.ai_credits + p_delta
  where p.id = v_uid
  returning p.ai_credits into v_balance;

  insert into public.ai_credit_ledger (
    user_id, delta, balance_after, reason, question_count, provider
  )
  values (
    v_uid,
    p_delta,
    v_balance,
    left(coalesce(nullif(btrim(p_reason), ''), 'adjust'), 40),
    p_question_count,
    left(p_provider, 80)
  );

  return v_balance;
end;
$$;

comment on function public.apply_ai_credits(integer, text, integer, text) is
  'Spends or (admin/service only) tops up the caller''s AI credits, atomically, and logs the movement.';

-- ---------------------------------------------------------------------------
-- grant_ai_credits
--
-- Tops up *another* account. This is the hook a future purchase flow calls with
-- the service role, and what an admin uses from the SQL editor today.
-- ---------------------------------------------------------------------------
create or replace function public.grant_ai_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'grant'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  -- A request carrying a JWT may only do this as the service role or an admin.
  -- A null role means there is no request context at all (a direct psql/Studio
  -- session), which is already a trusted, superuser-level connection.
  if auth.role() is not null
     and auth.role() is distinct from 'service_role'
     and not public.is_admin()
  then
    raise exception 'Chỉ quản trị viên mới nạp được credit.' using errcode = '42501';
  end if;

  if p_amount = 0 then
    select p.ai_credits into v_balance from public.profiles p where p.id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  -- `greatest(…, 0)` keeps an over-generous deduction from tripping the check
  -- constraint; the ledger still records the movement that was asked for.
  update public.profiles p
  set ai_credits = greatest(p.ai_credits + p_amount, 0)
  where p.id = p_user_id
  returning p.ai_credits into v_balance;

  if not found then
    raise exception 'Không tìm thấy người dùng.' using errcode = 'P0002';
  end if;

  insert into public.ai_credit_ledger (user_id, delta, balance_after, reason)
  values (
    p_user_id,
    p_amount,
    v_balance,
    left(coalesce(nullif(btrim(p_reason), ''), 'grant'), 40)
  );

  return v_balance;
end;
$$;

comment on function public.grant_ai_credits(uuid, integer, text) is
  'Admin/service-only top-up of another account''s AI credits. Used by the purchase flow and for manual grants.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant select on public.ai_credit_ledger to authenticated, service_role;

grant execute on function public.apply_ai_credits(integer, text, integer, text)
  to authenticated, service_role;
grant execute on function public.grant_ai_credits(uuid, integer, text)
  to authenticated, service_role;
