-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0008 — Endless leaderboard
--
-- Endless mode did not feed a score anywhere: mastery went to `endless_progress`
-- (per topic, for the player alone). This adds a *separate* leaderboard for it,
-- ranked by the best correct-answer streak reached in a single session.
--
-- The score is earned the same way a posted quiz score is: server-side. A
-- session is opened with `start_endless_session()`, and every graded answer
-- advances its streak inside `grade_endless_answer()`, so a client cannot post
-- a best-streak it did not play. The public board reads an aggregate through a
-- SECURITY DEFINER function and never exposes the raw session rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- endless_sessions
-- ---------------------------------------------------------------------------
create table public.endless_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  -- The subject the player scoped this session to, when they chose one.
  topic_id       uuid references public.topics (id) on delete set null,
  answered       integer not null default 0 check (answered >= 0),
  correct        integer not null default 0 check (correct >= 0),
  -- The running streak; reset by a miss. `best_streak` is the session record.
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak    integer not null default 0 check (best_streak >= 0),
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.endless_sessions is
  'One row per Endless run. Written only by start_endless_session()/grade_endless_answer().';

create index endless_sessions_user_idx
  on public.endless_sessions (user_id, updated_at desc);
create index endless_sessions_best_idx
  on public.endless_sessions (best_streak desc, correct desc);

create trigger endless_sessions_touch_updated_at
  before update on public.endless_sessions
  for each row execute function public.touch_updated_at();

alter table public.endless_sessions enable row level security;

-- A player may read their own runs. There is deliberately no write policy: the
-- SECURITY DEFINER functions below are the only writers, which is what keeps
-- the leaderboard honest. The public board goes through an aggregate function.
create policy "players read their own endless sessions"
  on public.endless_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.endless_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- start_endless_session
--
-- Opens a run and returns its id. The client sends that id with every answer.
-- ---------------------------------------------------------------------------
create or replace function public.start_endless_session(p_topic_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để chơi chế độ vô tận.' using errcode = '42501';
  end if;

  insert into public.endless_sessions (user_id, topic_id)
  values (v_uid, p_topic_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.start_endless_session(uuid) is
  'Opens an Endless run for the caller (optionally scoped to a subject) and returns its id.';

grant execute on function public.start_endless_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- grade_endless_answer
--
-- Same contract as before, plus an optional `p_session_id`: when supplied, the
-- answer is folded into that run's streak, so the leaderboard is server-scored.
-- The old two-argument function is dropped so there is exactly one overload.
-- ---------------------------------------------------------------------------
drop function if exists public.grade_endless_answer(uuid, uuid);

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

  -- Only questions that are actually in the public pool can be graded, so a
  -- hand-crafted request cannot probe a draft quiz's answer key.
  select * into v_quiz
  from public.quizzes qz
  where qz.id = v_question.quiz_id
    and qz.status = 'published'
    and qz.visibility = 'public';

  if not found then
    raise exception 'Câu hỏi này không còn trong kho luyện tập.' using errcode = 'P0002';
  end if;

  -- The chosen option must belong to this question; anything else is wrong.
  select o.is_correct
    into v_is_correct
  from public.options o
  where o.id = p_option_id and o.question_id = v_question.id;

  if not found then
    v_is_correct := false;
  end if;

  -- The canonical key, regardless of what the player chose.
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

  -- Fold the answer into the run. The row is locked so two parallel answers on
  -- the same session cannot both read the same starting streak.
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
    'progress', v_progress
  );
end;
$$;

comment on function public.grade_endless_answer(uuid, uuid, uuid) is
  'Grades one endless answer server-side, records it in endless_progress and the run, and returns the reveal.';

grant execute on function public.grade_endless_answer(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_endless_leaderboard
--
-- The public board: one row per player, ranked by their best session. Definer,
-- because the caller may not read another player's `endless_sessions` rows; it
-- exposes aggregates only, never a raw run.
-- ---------------------------------------------------------------------------
create or replace function public.get_endless_leaderboard(p_limit integer default 50)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_emoji   text,
  is_guest       boolean,
  best_streak    integer,
  best_correct   integer,
  session_count  integer,
  last_played_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.user_id,
    p.username,
    coalesce(nullif(p.display_name, ''), 'Người chơi ẩn danh') as display_name,
    p.avatar_emoji,
    coalesce(p.is_guest, false) as is_guest,
    max(s.best_streak)::integer as best_streak,
    max(s.correct)::integer     as best_correct,
    count(*)::integer           as session_count,
    max(s.updated_at)           as last_played_at
  from public.endless_sessions s
  left join public.profiles p on p.id = s.user_id
  group by s.user_id, p.username, p.display_name, p.avatar_emoji, p.is_guest
  having max(s.best_streak) > 0
  order by best_streak desc, best_correct desc, last_played_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.get_endless_leaderboard(integer) is
  'Per-player Endless leaderboard, ranked by best session streak. Aggregates only.';

grant execute on function public.get_endless_leaderboard(integer) to anon, authenticated;
