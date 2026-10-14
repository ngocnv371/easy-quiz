-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0005 — Endless mode
--
-- A never-ending, adaptive stream of questions drawn from every published
-- public quiz. Three ideas drive the design:
--
--   · The catalogue *is* the question pool, so a batch is a weighted random
--     sample across quizzes. A question's "area of expertise" is the topic of
--     the quiz it belongs to — there is no per-question tagging to maintain.
--   · The weighting is per player. Topics a player is strong in come up more
--     often, while weaker topics are guaranteed a slot in every batch so the
--     stream keeps teaching instead of just flattering.
--   · The answer key still never reaches the browser. `grade_endless_answer()`
--     grades one question at a time and folds the result into
--     `endless_progress`, so mastery is earned exactly the way a posted score
--     is: server-side.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- endless_progress
--
-- One row per player and topic. `accuracy` is never stored — it is derived, so
-- the two counts can never disagree with the number the UI shows.
-- ---------------------------------------------------------------------------
create table public.endless_progress (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  topic_id   uuid not null references public.topics (id) on delete cascade,
  answered   integer not null default 0 check (answered >= 0),
  correct    integer not null default 0 check (correct >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create index endless_progress_user_idx on public.endless_progress (user_id);

create trigger endless_progress_touch_updated_at
  before update on public.endless_progress
  for each row execute function public.touch_updated_at();

alter table public.endless_progress enable row level security;

-- A player sees their own progress and nothing else. There is deliberately no
-- INSERT / UPDATE policy: `grade_endless_answer()` is the only writer, which is
-- what keeps the numbers honest.
create policy "players read their own endless progress"
  on public.endless_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.endless_progress to authenticated;

-- ---------------------------------------------------------------------------
-- endless_progress_rows
--
-- The player's progress as a jsonb array, richest topic first. Internal helper:
-- it takes an arbitrary user id, so it is NOT granted to clients — only the two
-- SECURITY DEFINER functions below call it.
-- ---------------------------------------------------------------------------
create or replace function public.endless_progress_rows(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.row order by x.ratio desc, x.name asc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'topic_id', t.id,
        'slug', t.slug,
        'name', t.name,
        'emoji', t.emoji,
        'accent', t.accent,
        'answered', p.answered,
        'correct', p.correct,
        'accuracy', case when p.answered > 0
                         then round((p.correct::numeric / p.answered) * 100, 1)
                         else 0 end
      ) as row,
      case when p.answered > 0 then p.correct::numeric / p.answered else 0 end as ratio,
      t.name
    from public.endless_progress p
    join public.topics t on t.id = p.topic_id
    where p.user_id = p_uid
  ) x;
$$;

-- Taking an arbitrary user id is the whole point of the helper, so the default
-- PUBLIC execute grant is removed. The definer-owned callers still reach it.
revoke execute on function public.endless_progress_rows(uuid) from public;

-- ---------------------------------------------------------------------------
-- get_endless_batch
--
-- Up to `p_limit` fresh questions, weighted toward the player's stronger
-- topics, plus their current progress. `p_exclude` carries the ids already seen
-- this session so the stream does not repeat itself.
-- ---------------------------------------------------------------------------
create or replace function public.get_endless_batch(
  p_limit integer default 10,
  p_exclude uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_result jsonb;
begin
  with candidates as (
    select
      qu.id,
      -- 0.6 (weak) … 1.5 (strong). An untouched topic sits at 0.75, slightly
      -- above a weak one, so exploring new ground beats grinding a topic the
      -- player already keeps getting wrong. Cast to float8 so `power()` below
      -- resolves to the float overload without a cast at every call site.
      (case
        when ep.answered is null or ep.answered = 0 then 0.75
        else 0.6 + 0.9 * (ep.correct::numeric / ep.answered)
      end)::double precision as weight,
      (ep.answered is not null
        and ep.answered > 0
        and (ep.correct::numeric / ep.answered) < 0.5) as is_weak
    from public.questions qu
    join public.quizzes qz on qz.id = qu.quiz_id
    left join public.endless_progress ep
      on ep.topic_id = qz.topic_id and ep.user_id = v_uid
    where qz.status = 'published'
      and qz.visibility = 'public'
      and qu.id <> all (coalesce(p_exclude, array[]::uuid[]))
      -- A question with no options is not playable.
      and exists (select 1 from public.options o where o.question_id = qu.id)
  ),
  sample as (
    select s.id
    from (
      -- One guaranteed weak-topic question, so the stream always sprinkles in
      -- an area the player is still learning.
      (select c.id from candidates c where c.is_weak order by random() limit 1)
      union
      -- …then fill the rest by weighted random sampling without replacement
      -- (Efraimidis–Spirakis: keep the largest random()^(1/weight)).
      (select c.id
         from candidates c
        order by power(random(), 1.0 / c.weight) desc
        limit v_limit)
    ) s
    limit v_limit
  )
  select jsonb_build_object(
    'questions', coalesce((
      select jsonb_agg(x.question order by random())
      from (
        select jsonb_build_object(
          'id', qu.id,
          'prompt', qu.prompt,
          'image_url', qu.image_url,
          'points', qu.points,
          'quiz', jsonb_build_object(
            'id', qz.id,
            'slug', qz.slug,
            'title', qz.title,
            'cover_emoji', qz.cover_emoji
          ),
          'topic', case when t.id is null then null else jsonb_build_object(
            'id', t.id, 'slug', t.slug, 'name', t.name,
            'emoji', t.emoji, 'accent', t.accent
          ) end,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', o.id, 'position', o.position, 'label', o.label)
              order by o.position
            )
            from public.options o
            where o.question_id = qu.id
          ), '[]'::jsonb)
        ) as question
        from public.questions qu
        join public.quizzes qz on qz.id = qu.quiz_id
        left join public.topics t on t.id = qz.topic_id
        where qu.id in (select id from sample)
      ) x
    ), '[]'::jsonb),
    'progress', public.endless_progress_rows(v_uid)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.get_endless_batch(integer, uuid[]) is
  'A weighted random batch of playable questions plus the caller''s per-topic progress.';

-- ---------------------------------------------------------------------------
-- grade_endless_answer
--
-- The only writer of `endless_progress`. Grades a single answer server-side,
-- updates the player's mastery for that topic, and reveals the key for the one
-- question already answered.
-- ---------------------------------------------------------------------------
create or replace function public.grade_endless_answer(
  p_question_id uuid,
  p_option_id uuid
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

comment on function public.grade_endless_answer(uuid, uuid) is
  'Grades one endless answer server-side, records it in endless_progress, and returns the reveal.';

grant execute on function public.get_endless_batch(integer, uuid[]) to anon, authenticated;
grant execute on function public.grade_endless_answer(uuid, uuid) to authenticated;
