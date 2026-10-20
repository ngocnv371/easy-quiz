-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0009 — Energy and membership
--
-- Practice is metered: every answered question costs one energy.
--
--   · Each player gets a free daily allowance (guests less than accounts) that
--     resets at midnight Vietnam time and does not carry over.
--   · Purchased energy sits in a separate bucket that never expires. The free
--     allowance is always spent first, so buying never feels wasted.
--   · An active Plus membership makes practice unlimited.
--
-- Where energy is charged:
--   · Endless — inside `grade_endless_answer()`, one per graded answer.
--   · A normal quiz is graded in one batch at the end, so charging per answer
--     is impossible there. `start_quiz_attempt()` charges the whole quiz up
--     front and returns a one-time ticket; `submit_attempt()` now requires it,
--     so a client cannot skip the charge by submitting directly.
--
-- Purchases go through PayOS (edge functions `payments` and `payos-webhook`).
-- Orders live in `payment_orders`; `fulfill_payment_order()` is the single,
-- idempotent place a paid order turns into energy or membership time.
--
-- Nothing here is client-writable. Balances live in their own table rather
-- than on `profiles`, because profile rows are publicly readable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Tunables
-- ---------------------------------------------------------------------------

-- The free daily allowance. Accounts get more than guests, which is both a
-- reason to sign up and a brake on clearing storage for a fresh guest quota.
create or replace function public.energy_daily_allowance(p_is_guest boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_is_guest, true) then 30 else 60 end;
$$;

-- The day boundary players experience: midnight in Vietnam.
create or replace function public.energy_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

-- ---------------------------------------------------------------------------
-- Store catalogue
-- ---------------------------------------------------------------------------
create table public.store_products (
  id          text primary key,
  kind        text not null check (kind in ('energy', 'plus')),
  name        text not null,
  description text,
  -- What the product grants. An energy pack has `energy`; Plus has `plus_days`.
  energy      integer not null default 0 check (energy >= 0),
  plus_days   integer not null default 0 check (plus_days >= 0),
  price_vnd   integer not null check (price_vnd >= 2000),
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  check (
    (kind = 'energy' and energy > 0 and plus_days = 0)
    or (kind = 'plus' and plus_days > 0 and energy = 0)
  )
);

comment on table public.store_products is
  'What can be bought. Prices are read by both the shop page and the payments edge function.';

alter table public.store_products enable row level security;

create policy "anyone reads the active catalogue"
  on public.store_products for select
  using (active);

grant select on public.store_products to anon, authenticated;

insert into public.store_products (id, kind, name, description, energy, plus_days, price_vnd, sort)
values
  ('energy_100', 'energy', 'Gói 100 năng lượng', 'Thêm 100 câu luyện tập, không hết hạn.', 100, 0, 10000, 10),
  ('energy_250', 'energy', 'Gói 250 năng lượng', 'Thêm 250 câu luyện tập, không hết hạn. Tiết kiệm 20%.', 250, 0, 20000, 20),
  ('plus_30', 'plus', 'Easy Quiz Plus · 30 ngày', 'Luyện không giới hạn trong 30 ngày.', 0, 30, 49000, 30);

-- ---------------------------------------------------------------------------
-- Wallets and ledger
-- ---------------------------------------------------------------------------
create table public.energy_wallets (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  -- Today's remaining free energy, and the Vietnam day it belongs to. A stale
  -- `free_date` means the allowance is due for a reset on next touch.
  free_balance    integer not null default 0 check (free_balance >= 0),
  free_allowance  integer not null default 0 check (free_allowance >= 0),
  free_date       date,
  -- Purchased energy. Never expires.
  paid_balance    integer not null default 0 check (paid_balance >= 0),
  -- Plus membership is active while this is in the future.
  plus_until      timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.energy_wallets is
  'Per-player energy balances and membership. Written only by the energy functions.';

create trigger energy_wallets_touch_updated_at
  before update on public.energy_wallets
  for each row execute function public.touch_updated_at();

alter table public.energy_wallets enable row level security;

create policy "players read their own wallet"
  on public.energy_wallets for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.energy_wallets to authenticated;

create table public.energy_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- 'free' and 'paid' move energy; 'plus' records membership days granted.
  bucket        text not null check (bucket in ('free', 'paid', 'plus')),
  delta         integer not null,
  balance_after integer not null,
  -- 'endless' | 'quiz' | 'purchase' | 'grant' | …
  reason        text not null,
  -- What the movement was for: a question id, a quiz id, an order code.
  ref           text,
  created_at    timestamptz not null default now()
);

create index energy_ledger_user_idx on public.energy_ledger (user_id, created_at desc);

comment on table public.energy_ledger is
  'Append-only history of energy spends, purchases and grants. Daily resets are not logged.';

alter table public.energy_ledger enable row level security;

create policy "players read their own energy history"
  on public.energy_ledger for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

grant select on public.energy_ledger to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: lock a wallet, creating it and applying the daily reset as needed
-- ---------------------------------------------------------------------------
create or replace function public.energy_lock_wallet(p_user_id uuid)
returns public.energy_wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet    public.energy_wallets;
  v_today     date := public.energy_today();
  v_allowance integer;
begin
  select public.energy_daily_allowance(coalesce(p.is_guest, true))
    into v_allowance
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  insert into public.energy_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.energy_wallets w
  where w.user_id = p_user_id
  for update;

  if v_wallet.free_date is distinct from v_today then
    -- A new day: the allowance refills to full. Unused energy does not carry.
    update public.energy_wallets w
    set free_balance = v_allowance,
        free_allowance = v_allowance,
        free_date = v_today
    where w.user_id = p_user_id
    returning * into v_wallet;
  elsif v_allowance > v_wallet.free_allowance then
    -- A guest who signed up today gets the difference straight away rather
    -- than waiting for tomorrow.
    update public.energy_wallets w
    set free_balance = w.free_balance + (v_allowance - w.free_allowance),
        free_allowance = v_allowance
    where w.user_id = p_user_id
    returning * into v_wallet;
  end if;

  return v_wallet;
end;
$$;

-- The shape every energy-aware response carries.
create or replace function public.energy_state(p_wallet public.energy_wallets)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'free', p_wallet.free_balance,
    'paid', p_wallet.paid_balance,
    'total', p_wallet.free_balance + p_wallet.paid_balance,
    'daily_allowance', p_wallet.free_allowance,
    -- The next Vietnam midnight, as an absolute instant.
    'resets_at', ((public.energy_today() + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'),
    'plus_until', p_wallet.plus_until,
    'unlimited', coalesce(p_wallet.plus_until > now(), false)
  );
$$;

-- ---------------------------------------------------------------------------
-- Internal: spend
--
-- Takes from today's free allowance first, then from purchased energy. Plus
-- members and admins are not charged. Raises SQLSTATE EQ001 when the player
-- cannot afford it; the client recognises that code and offers a refill.
-- ---------------------------------------------------------------------------
create or replace function public.spend_energy(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet    public.energy_wallets;
  v_from_free integer;
  v_from_paid integer;
begin
  v_wallet := public.energy_lock_wallet(p_user_id);

  if coalesce(p_amount, 0) <= 0
     or v_wallet.plus_until > now()
     or public.is_admin(p_user_id)
  then
    return public.energy_state(v_wallet);
  end if;

  if v_wallet.free_balance + v_wallet.paid_balance < p_amount then
    raise exception 'Bạn đã hết năng lượng. Năng lượng miễn phí được nạp lại lúc 0 giờ mỗi ngày, hoặc bạn có thể nạp thêm ngay.'
      using errcode = 'EQ001',
            detail = public.energy_state(v_wallet)::text,
            hint = format('cần %s năng lượng', p_amount);
  end if;

  v_from_free := least(v_wallet.free_balance, p_amount);
  v_from_paid := p_amount - v_from_free;

  update public.energy_wallets w
  set free_balance = w.free_balance - v_from_free,
      paid_balance = w.paid_balance - v_from_paid
  where w.user_id = p_user_id
  returning * into v_wallet;

  if v_from_free > 0 then
    insert into public.energy_ledger (user_id, bucket, delta, balance_after, reason, ref)
    values (p_user_id, 'free', -v_from_free, v_wallet.free_balance, p_reason, left(p_ref, 120));
  end if;

  if v_from_paid > 0 then
    insert into public.energy_ledger (user_id, bucket, delta, balance_after, reason, ref)
    values (p_user_id, 'paid', -v_from_paid, v_wallet.paid_balance, p_reason, left(p_ref, 120));
  end if;

  return public.energy_state(v_wallet);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_energy — the caller's current balance (applies the daily reset)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_energy()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '42501';
  end if;

  return public.energy_state(public.energy_lock_wallet(v_uid));
end;
$$;

comment on function public.get_my_energy() is
  'The caller''s energy balance and membership, with today''s free allowance applied.';

-- ---------------------------------------------------------------------------
-- grant_energy — admin / service top-up of another account
-- ---------------------------------------------------------------------------
create or replace function public.grant_energy(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'grant'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.energy_wallets;
begin
  if auth.role() is not null
     and auth.role() is distinct from 'service_role'
     and not public.is_admin()
  then
    raise exception 'Chỉ quản trị viên mới nạp được năng lượng.' using errcode = '42501';
  end if;

  v_wallet := public.energy_lock_wallet(p_user_id);

  update public.energy_wallets w
  set paid_balance = greatest(w.paid_balance + p_amount, 0)
  where w.user_id = p_user_id
  returning * into v_wallet;

  insert into public.energy_ledger (user_id, bucket, delta, balance_after, reason)
  values (
    p_user_id, 'paid', p_amount, v_wallet.paid_balance,
    left(coalesce(nullif(btrim(p_reason), ''), 'grant'), 40)
  );

  return public.energy_state(v_wallet);
end;
$$;

comment on function public.grant_energy(uuid, integer, text) is
  'Admin/service-only top-up of another account''s purchased energy.';

-- ---------------------------------------------------------------------------
-- Endless: charge one energy per graded answer
--
-- Same contract as 0008, plus an `energy` field in the result. The charge is
-- taken only after the question is known to be gradable, and in the same
-- transaction as the grade, so a failed grade never costs anything.
-- ---------------------------------------------------------------------------
create or replace function public.grade_endless_answer(
  p_question_id uuid,
  p_option_id uuid,
  p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_question   public.questions;
  v_quiz       public.quizzes;
  v_topic      public.topics;
  v_correct_id uuid;
  v_is_correct boolean := false;
  v_row        public.endless_progress;
  v_progress   jsonb := 'null'::jsonb;
  v_session    public.endless_sessions;
  v_new_streak integer;
  v_energy     jsonb;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để chơi chế độ vô tận.' using errcode = '42501';
  end if;

  select * into v_question
  from public.questions qu
  where qu.id = p_question_id;

  if not found then
    raise exception 'Không tìm thấy câu hỏi này.' using errcode = 'P0002';
  end if;

  select * into v_quiz
  from public.quizzes qz
  where qz.id = v_question.quiz_id
    and qz.status = 'published'
    and qz.visibility = 'public';

  if not found then
    raise exception 'Câu hỏi này không còn trong kho luyện tập.' using errcode = 'P0002';
  end if;

  -- Pay before the reveal. Raises EQ001 (and rolls back) when out of energy.
  v_energy := public.spend_energy(v_uid, 1, 'endless', v_question.id::text);

  select o.is_correct
    into v_is_correct
  from public.options o
  where o.id = p_option_id and o.question_id = v_question.id;

  if not found then
    v_is_correct := false;
  end if;

  select o2.id into v_correct_id
  from public.options o2
  where o2.question_id = v_question.id and o2.is_correct
  order by o2.position
  limit 1;

  if v_quiz.topic_id is not null then
    insert into public.endless_progress as ep (user_id, topic_id, answered, correct)
    values (
      v_uid,
      v_quiz.topic_id,
      1,
      case when v_is_correct then 1 else 0 end
    )
    on conflict (user_id, topic_id) do update
      set answered   = ep.answered + 1,
          correct    = ep.correct + case when v_is_correct then 1 else 0 end,
          updated_at = now()
    returning * into v_row;

    select * into v_topic from public.topics t where t.id = v_quiz.topic_id;

    v_progress := jsonb_build_object(
      'topic_id', v_topic.id,
      'slug', v_topic.slug,
      'name', v_topic.name,
      'emoji', v_topic.emoji,
      'accent', v_topic.accent,
      'answered', v_row.answered,
      'correct', v_row.correct,
      'accuracy', case when v_row.answered > 0
                       then round((v_row.correct::numeric / v_row.answered) * 100, 1)
                       else 0 end
    );
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.endless_sessions s
    where s.id = p_session_id and s.user_id = v_uid
    for update;

    if found then
      v_new_streak := case when v_is_correct then v_session.current_streak + 1 else 0 end;

      update public.endless_sessions s
      set answered       = s.answered + 1,
          correct        = s.correct + case when v_is_correct then 1 else 0 end,
          current_streak = v_new_streak,
          best_streak    = greatest(s.best_streak, v_new_streak),
          updated_at     = now()
      where s.id = v_session.id;
    end if;
  end if;

  return jsonb_build_object(
    'question_id', v_question.id,
    'option_id', p_option_id,
    'is_correct', v_is_correct,
    'correct_option_id', v_correct_id,
    'explanation', v_question.explanation,
    'topic', case when v_topic.id is null then null else jsonb_build_object(
      'id', v_topic.id, 'slug', v_topic.slug, 'name', v_topic.name,
      'emoji', v_topic.emoji, 'accent', v_topic.accent
    ) end,
    'progress', v_progress,
    'energy', v_energy
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Normal quizzes: pay at the start, redeem the ticket on submit
-- ---------------------------------------------------------------------------
create table public.quiz_play_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  cost       integer not null check (cost >= 0),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create index quiz_play_tickets_user_idx on public.quiz_play_tickets (user_id, created_at desc);

comment on table public.quiz_play_tickets is
  'One paid start of a quiz. submit_attempt() redeems it exactly once.';

alter table public.quiz_play_tickets enable row level security;
-- No policies: only the definer functions touch tickets.

create or replace function public.start_quiz_attempt(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_quiz   public.quizzes;
  v_count  integer;
  v_energy jsonb;
  v_ticket uuid;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để làm bài.' using errcode = '42501';
  end if;

  select * into v_quiz
  from public.quizzes q
  where q.slug = p_slug
    and q.status = 'published'
    and q.visibility in ('public', 'unlisted');

  if not found then
    raise exception 'Không tìm thấy đề thi này.' using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.questions qu where qu.quiz_id = v_quiz.id;

  if v_count = 0 then
    raise exception 'Đề thi chưa có câu hỏi nào.' using errcode = 'P0001';
  end if;

  v_energy := public.spend_energy(v_uid, v_count, 'quiz', v_quiz.id::text);

  insert into public.quiz_play_tickets (user_id, quiz_id, cost)
  values (v_uid, v_quiz.id, v_count)
  returning id into v_ticket;

  return jsonb_build_object('ticket_id', v_ticket, 'cost', v_count, 'energy', v_energy);
end;
$$;

comment on function public.start_quiz_attempt(text) is
  'Charges a quiz''s question count in energy and returns the ticket submit_attempt() requires.';

-- The old signature has no ticket; drop it so there is exactly one overload.
drop function if exists public.submit_attempt(text, jsonb, integer, text);

create or replace function public.submit_attempt(
  p_slug text,
  p_answers jsonb,
  p_duration_seconds integer default 0,
  p_guest_name text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_quiz     public.quizzes;
  v_attempt  public.attempts;
  v_total    integer;
  v_max      integer;
  v_correct  integer;
  v_score    integer;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để nộp bài.' using errcode = '42501';
  end if;

  select * into v_quiz
  from public.quizzes q
  where q.slug = p_slug
    and q.status = 'published'
    and q.visibility in ('public', 'unlisted');

  if not found then
    raise exception 'Không tìm thấy đề thi này.' using errcode = 'P0002';
  end if;

  -- Redeem the paid start. Locked and stamped in this transaction, so a ticket
  -- can back exactly one attempt even if submit is retried in parallel.
  update public.quiz_play_tickets t
  set used_at = now()
  where t.id = p_ticket_id
    and t.user_id = v_uid
    and t.quiz_id = v_quiz.id
    and t.used_at is null
    and t.created_at > now() - interval '1 day';

  if not found then
    raise exception 'Lượt làm bài này không hợp lệ hoặc đã được nộp. Hãy bắt đầu lại đề thi.'
      using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(qu.points), 0)
    into v_total, v_max
  from public.questions qu
  where qu.quiz_id = v_quiz.id;

  if v_total = 0 then
    raise exception 'Đề thi chưa có câu hỏi nào.' using errcode = 'P0001';
  end if;

  insert into public.attempts (
    quiz_id, user_id, guest_name, max_score, question_count, duration_seconds
  )
  values (
    v_quiz.id,
    v_uid,
    nullif(left(btrim(coalesce(p_guest_name, '')), 60), ''),
    v_max,
    v_total,
    greatest(coalesce(p_duration_seconds, 0), 0)
  )
  returning * into v_attempt;

  with given as (
    select distinct on (e ->> 'question_id')
      (e ->> 'question_id')::uuid as question_id,
      nullif(e ->> 'option_id', '')::uuid as option_id,
      greatest(coalesce((e ->> 'time_ms')::integer, 0), 0) as time_ms
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as e
    order by (e ->> 'question_id')
  )
  insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct, time_ms)
  select
    v_attempt.id,
    qu.id,
    g.option_id,
    coalesce(o.is_correct, false),
    coalesce(g.time_ms, 0)
  from public.questions qu
  left join given g on g.question_id = qu.id
  left join public.options o on o.id = g.option_id and o.question_id = qu.id
  where qu.quiz_id = v_quiz.id;

  select
    count(*) filter (where aa.is_correct),
    coalesce(sum(qu.points) filter (where aa.is_correct), 0)
    into v_correct, v_score
  from public.attempt_answers aa
  join public.questions qu on qu.id = aa.question_id
  where aa.attempt_id = v_attempt.id;

  update public.attempts a
  set score = v_score,
      correct_count = v_correct,
      accuracy = public.attempt_compute_accuracy(v_score, v_max)
  where a.id = v_attempt.id
  returning * into v_attempt;

  update public.quizzes q
  set play_count = q.play_count + 1
  where q.id = v_quiz.id;

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'quiz', jsonb_build_object(
      'id', v_quiz.id,
      'slug', v_quiz.slug,
      'title', v_quiz.title,
      'cover_emoji', v_quiz.cover_emoji
    ),
    'review', coalesce((
      select jsonb_agg(x.review_row order by x.position)
      from (
        select
          qu.position,
          jsonb_build_object(
            'question_id', qu.id,
            'position', qu.position,
            'prompt', qu.prompt,
            'explanation', qu.explanation,
            'points', qu.points,
            'is_correct', aa.is_correct,
            'chosen_option_id', aa.option_id,
            'correct_option_id', (
              select o2.id from public.options o2
              where o2.question_id = qu.id and o2.is_correct
              order by o2.position limit 1
            ),
            'options', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', o3.id, 'position', o3.position,
                  'label', o3.label, 'is_correct', o3.is_correct
                ) order by o3.position
              )
              from public.options o3 where o3.question_id = qu.id
            ), '[]'::jsonb)
          ) as review_row
        from public.attempt_answers aa
        join public.questions qu on qu.id = aa.question_id
        where aa.attempt_id = v_attempt.id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.submit_attempt(text, jsonb, integer, text, uuid) is
  'Redeems a paid start ticket, grades the run server-side, records the attempt, and returns the reveal.';

-- ---------------------------------------------------------------------------
-- Payment orders
-- ---------------------------------------------------------------------------

-- PayOS wants a positive integer order code, unique per merchant. Millisecond
-- time keeps codes from a local stack and production apart when they share a
-- PayOS account; the sequence breaks ties within the same millisecond.
create sequence public.payment_order_seq;

create or replace function public.next_payment_order_code()
returns bigint
language sql
volatile
-- Definer, so the inserting role needs no privilege on the sequence itself.
security definer
set search_path = ''
as $$
  select (floor(extract(epoch from clock_timestamp()) * 1000)::bigint * 10)
         + (nextval('public.payment_order_seq') % 10);
$$;

create table public.payment_orders (
  id               uuid primary key default gen_random_uuid(),
  order_code       bigint not null unique default public.next_payment_order_code(),
  -- Kept when the account is deleted: it is a financial record.
  user_id          uuid references public.profiles (id) on delete set null,
  product_id       text not null references public.store_products (id),
  -- A snapshot of the product at purchase time, so a later price change does
  -- not rewrite history.
  amount_vnd       integer not null check (amount_vnd > 0),
  energy           integer not null default 0,
  plus_days        integer not null default 0,
  status           text not null default 'pending'
                   check (status in ('pending', 'paid', 'cancelled', 'expired', 'failed')),
  provider         text not null default 'payos',
  checkout_url     text,
  payment_link_id  text,
  provider_payload jsonb,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

comment on table public.payment_orders is
  'One checkout. Created and settled by the payments edge functions with the service role.';

create trigger payment_orders_touch_updated_at
  before update on public.payment_orders
  for each row execute function public.touch_updated_at();

alter table public.payment_orders enable row level security;

create policy "players read their own orders"
  on public.payment_orders for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

grant select on public.payment_orders to authenticated;

-- ---------------------------------------------------------------------------
-- fulfill_payment_order — the one place a paid order becomes value
--
-- Idempotent: the webhook and the return-page sync may both report the same
-- payment, and only the first one does anything.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_payment_order(
  p_order_code bigint,
  p_amount_paid integer,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.payment_orders;
  v_wallet public.energy_wallets;
begin
  if auth.role() is not null and auth.role() is distinct from 'service_role' then
    raise exception 'Chỉ hệ thống thanh toán mới được xác nhận đơn.' using errcode = '42501';
  end if;

  select * into v_order
  from public.payment_orders o
  where o.order_code = p_order_code
  for update;

  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('status', 'paid', 'already', true);
  end if;

  if coalesce(p_amount_paid, 0) < v_order.amount_vnd then
    update public.payment_orders o
    set status = 'failed', provider_payload = p_payload
    where o.id = v_order.id;
    return jsonb_build_object('status', 'failed', 'reason', 'amount');
  end if;

  update public.payment_orders o
  set status = 'paid', paid_at = now(), provider_payload = p_payload
  where o.id = v_order.id;

  if v_order.user_id is null then
    return jsonb_build_object('status', 'paid', 'orphan', true);
  end if;

  v_wallet := public.energy_lock_wallet(v_order.user_id);

  if v_order.energy > 0 then
    update public.energy_wallets w
    set paid_balance = w.paid_balance + v_order.energy
    where w.user_id = v_order.user_id
    returning * into v_wallet;

    insert into public.energy_ledger (user_id, bucket, delta, balance_after, reason, ref)
    values (v_order.user_id, 'paid', v_order.energy, v_wallet.paid_balance,
            'purchase', v_order.order_code::text);
  end if;

  if v_order.plus_days > 0 then
    -- Extends from whichever is later, so renewing early never loses days.
    update public.energy_wallets w
    set plus_until = greatest(coalesce(w.plus_until, now()), now())
                     + make_interval(days => v_order.plus_days)
    where w.user_id = v_order.user_id
    returning * into v_wallet;

    insert into public.energy_ledger (user_id, bucket, delta, balance_after, reason, ref)
    values (v_order.user_id, 'plus', v_order.plus_days, 0, 'purchase', v_order.order_code::text);
  end if;

  return jsonb_build_object('status', 'paid', 'energy', public.energy_state(v_wallet));
end;
$$;

comment on function public.fulfill_payment_order(bigint, integer, jsonb) is
  'Service-only, idempotent: marks a PayOS order paid and credits energy or Plus days.';

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Postgres grants EXECUTE to PUBLIC by default, which would let any client
-- call the internal helpers directly. Revoke first, then grant what is meant
-- to be called.
-- ---------------------------------------------------------------------------
-- Supabase auto-grants table privileges on new tables. RLS already blocks
-- writes (there are no write policies), but the money tables should not even
-- look writable.
revoke insert, update, delete, truncate
  on public.store_products, public.energy_wallets, public.energy_ledger,
     public.quiz_play_tickets, public.payment_orders
  from anon, authenticated;
revoke select on public.quiz_play_tickets from anon, authenticated;

revoke execute on function public.energy_lock_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.spend_energy(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.fulfill_payment_order(bigint, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.grant_energy(uuid, integer, text) from public, anon;
revoke execute on function public.next_payment_order_code() from public, anon, authenticated;

grant execute on function public.fulfill_payment_order(bigint, integer, jsonb) to service_role;
grant execute on function public.next_payment_order_code() to service_role;
grant execute on function public.grant_energy(uuid, integer, text) to authenticated, service_role;
grant execute on function public.get_my_energy() to authenticated;
grant execute on function public.start_quiz_attempt(text) to authenticated;
grant execute on function public.submit_attempt(text, jsonb, integer, text, uuid) to authenticated;
grant execute on function public.grade_endless_answer(uuid, uuid, uuid) to authenticated;
