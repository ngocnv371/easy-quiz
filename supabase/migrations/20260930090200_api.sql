-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0003 — read models and server-side play
--
-- Three views and three functions. The functions are the interesting part:
--   get_quiz_for_play()  serves questions WITHOUT the answer key
--   submit_attempt()     grades on the server and returns the reveal
--   save_quiz()          atomically replaces a quiz's questions and options
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Views
--
-- `security_invoker = true` keeps the caller's RLS in force. Without it a view
-- owned by postgres would quietly bypass every policy it sits on top of.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Quiz statistics
--
-- `security_invoker = true` keeps the caller's RLS in force — which is what
-- makes the views safe, but also means a subquery over `questions` returns
-- nothing for anyone who is not the author. Since the catalogue needs to show
-- how many questions a quiz has, the counts come from a SECURITY DEFINER
-- function that exposes nothing but the two aggregate numbers.
-- ---------------------------------------------------------------------------
create or replace function public.quiz_stats(p_quiz_id uuid)
returns table (question_count integer, max_score integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::integer,
    coalesce(sum(qu.points), 0)::integer
  from public.questions qu
  where qu.quiz_id = p_quiz_id;
$$;

comment on function public.quiz_stats(uuid) is
  'Question count and maximum score for a quiz. Definer because the caller cannot read another author''s questions.';

grant execute on function public.quiz_stats(uuid) to anon, authenticated;

-- Catalogue rows for the Explore page and the teacher's dashboard.
create or replace view public.quiz_cards
with (security_invoker = true)
as
select
  q.id,
  q.slug,
  q.title,
  q.description,
  q.cover_emoji,
  q.difficulty,
  q.visibility,
  q.status,
  q.time_limit_seconds,
  q.play_count,
  q.ai_generated,
  q.owner_id,
  q.topic_id,
  q.published_at,
  q.created_at,
  q.updated_at,
  t.slug   as topic_slug,
  t.name   as topic_name,
  t.emoji  as topic_emoji,
  t.accent as topic_accent,
  p.username     as author_username,
  p.display_name as author_name,
  p.avatar_emoji as author_avatar,
  stats.question_count,
  stats.max_score,
  (select count(*) from public.attempts a where a.quiz_id = q.id) as attempt_count
from public.quizzes q
left join public.topics t on t.id = q.topic_id
left join public.profiles p on p.id = q.owner_id
cross join lateral public.quiz_stats(q.id) stats;

comment on view public.quiz_cards is
  'Quiz rows joined with topic and author labels, for catalogue and dashboard lists.';

-- One row per attempt, ready to rank.
create or replace view public.leaderboard_entries
with (security_invoker = true)
as
select
  a.id as attempt_id,
  a.quiz_id,
  q.slug  as quiz_slug,
  q.title as quiz_title,
  q.cover_emoji,
  q.topic_id,
  t.slug  as topic_slug,
  t.name  as topic_name,
  a.user_id,
  coalesce(nullif(p.display_name, ''), nullif(a.guest_name, ''), 'Người chơi ẩn danh') as display_name,
  p.username,
  p.avatar_emoji,
  coalesce(p.is_guest, false) as is_guest,
  a.score,
  a.max_score,
  a.correct_count,
  a.question_count,
  a.accuracy,
  a.duration_seconds,
  a.completed_at
from public.attempts a
join public.quizzes q on q.id = a.quiz_id
left join public.topics t on t.id = q.topic_id
left join public.profiles p on p.id = a.user_id;

comment on view public.leaderboard_entries is
  'Flattened attempts for per-quiz and per-topic leaderboards.';

-- Career totals, one row per player.
create or replace view public.global_leaderboard
with (security_invoker = true)
as
select
  a.user_id,
  coalesce(nullif(p.display_name, ''), 'Người chơi ẩn danh') as display_name,
  p.username,
  p.avatar_emoji,
  coalesce(p.is_guest, false) as is_guest,
  sum(a.score)::integer                        as total_score,
  max(a.score)::integer                        as best_score,
  count(*)::integer                            as attempt_count,
  count(distinct a.quiz_id)::integer           as quiz_count,
  round(avg(a.accuracy), 2)                    as avg_accuracy,
  max(a.completed_at)                          as last_played_at
from public.attempts a
left join public.profiles p on p.id = a.user_id
where a.user_id is not null
group by a.user_id, p.display_name, p.username, p.avatar_emoji, p.is_guest;

comment on view public.global_leaderboard is
  'Lifetime totals per player — the "Bảng vàng" board.';

grant select on public.quiz_cards, public.leaderboard_entries, public.global_leaderboard
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_quiz_for_play
--
-- Returns the quiz, its questions and their options, with `is_correct`
-- deliberately absent. The key stays in the database until grading.
-- ---------------------------------------------------------------------------
create or replace function public.get_quiz_for_play(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', q.id,
      'slug', q.slug,
      'title', q.title,
      'description', q.description,
      'cover_emoji', q.cover_emoji,
      'difficulty', q.difficulty,
      'time_limit_seconds', q.time_limit_seconds,
      'shuffle_questions', q.shuffle_questions,
      'shuffle_options', q.shuffle_options,
      'play_count', q.play_count,
      'topic', case when t.id is null then null else jsonb_build_object(
        'slug', t.slug, 'name', t.name, 'emoji', t.emoji, 'accent', t.accent
      ) end,
      'author', case when p.id is null then null else jsonb_build_object(
        'username', p.username,
        'display_name', p.display_name,
        'avatar_emoji', p.avatar_emoji
      ) end
    ),
    'questions', coalesce((
      select jsonb_agg(x.question order by x.position)
      from (
        select
          qu.position,
          jsonb_build_object(
            'id', qu.id,
            'position', qu.position,
            'prompt', qu.prompt,
            'points', qu.points,
            'time_limit_seconds', qu.time_limit_seconds,
            'image_url', qu.image_url,
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
        where qu.quiz_id = q.id
      ) x
    ), '[]'::jsonb)
  )
  from public.quizzes q
  left join public.topics t on t.id = q.topic_id
  left join public.profiles p on p.id = q.owner_id
  where q.slug = p_slug
    and q.status = 'published'
    and q.visibility in ('public', 'unlisted');
$$;

comment on function public.get_quiz_for_play(text) is
  'Playable quiz payload with the answer key stripped. Returns NULL when the quiz is not playable.';

-- ---------------------------------------------------------------------------
-- submit_attempt
--
-- The only writer of `attempts`. Grades server-side so a client cannot post a
-- score it did not earn, then returns the full review for the results screen.
-- ---------------------------------------------------------------------------
create or replace function public.submit_attempt(
  p_slug text,
  p_answers jsonb,
  p_duration_seconds integer default 0,
  p_guest_name text default null
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

  -- Grade every question of the quiz; unanswered ones are simply incorrect.
  -- A repeated question id would collide on the unique index, so take the first.
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
  -- The option must belong to this question, otherwise it cannot be correct.
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

comment on function public.submit_attempt(text, jsonb, integer, text) is
  'Grades a run server-side, records the attempt, and returns the per-question reveal.';

-- ---------------------------------------------------------------------------
-- save_quiz
--
-- One atomic write for the whole editor document. Also enforces the invariants
-- the table checks cannot express: exactly one correct option per question, and
-- a publishable quiz that actually has gradable questions.
-- ---------------------------------------------------------------------------
create or replace function public.save_quiz(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_id            uuid;
  v_slug          text;
  v_status        text;
  v_questions     jsonb;
  v_q             jsonb;
  v_o             jsonb;
  v_qid           uuid;
  v_i             integer := 0;
  v_j             integer;
  v_has_correct   boolean;
  v_is_correct    boolean;
  v_question_count integer;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '42501';
  end if;

  if not public.is_teacher(v_uid) then
    raise exception 'Chỉ tài khoản giáo viên mới tạo được đề thi.' using errcode = '42501';
  end if;

  v_id := coalesce(nullif(p_payload ->> 'id', '')::uuid, gen_random_uuid());

  -- Editing an existing quiz? Then it must already be yours.
  if coalesce(p_payload ->> 'id', '') <> '' then
    if not exists (
      select 1 from public.quizzes q where q.id = v_id and q.owner_id = v_uid
    ) then
      raise exception 'Không tìm thấy đề thi hoặc bạn không phải chủ sở hữu.'
        using errcode = '42501';
    end if;
  end if;

  v_status := coalesce(nullif(p_payload ->> 'status', ''), 'draft');
  if v_status not in ('draft', 'published', 'archived') then
    v_status := 'draft';
  end if;

  v_questions := coalesce(p_payload -> 'questions', '[]'::jsonb);

  -- Publishing is the moment quality is enforced, not every keystroke.
  if v_status = 'published' then
    if jsonb_array_length(v_questions) = 0 then
      raise exception 'Cần ít nhất một câu hỏi trước khi xuất bản.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_questions) as q
      where coalesce(btrim(q ->> 'prompt'), '') = ''
         or jsonb_array_length(coalesce(q -> 'options', '[]'::jsonb)) < 2
         or (
           select count(*)
           from jsonb_array_elements(coalesce(q -> 'options', '[]'::jsonb)) as o
           where coalesce((o ->> 'is_correct')::boolean, false)
         ) <> 1
    ) then
      raise exception 'Mỗi câu hỏi cần nội dung, ít nhất 2 lựa chọn và đúng 1 đáp án.'
        using errcode = 'P0001';
    end if;
  end if;

  -- A readable, collision-free slug.
  v_slug := public.slugify(coalesce(nullif(p_payload ->> 'slug', ''), p_payload ->> 'title'));
  if v_slug = '' then
    v_slug := 'de-thi';
  end if;
  v_slug := left(v_slug, 48);
  if exists (select 1 from public.quizzes q where q.slug = v_slug and q.id <> v_id) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end if;

  insert into public.quizzes (
    id, owner_id, topic_id, slug, title, description, cover_emoji, difficulty,
    visibility, status, time_limit_seconds, shuffle_questions, shuffle_options,
    ai_generated
  )
  values (
    v_id,
    v_uid,
    nullif(p_payload ->> 'topic_id', '')::uuid,
    v_slug,
    left(coalesce(nullif(btrim(p_payload ->> 'title'), ''), 'Đề thi chưa đặt tên'), 120),
    nullif(left(btrim(coalesce(p_payload ->> 'description', '')), 600), ''),
    coalesce(nullif(p_payload ->> 'cover_emoji', ''), '📝'),
    case when p_payload ->> 'difficulty' in ('easy', 'medium', 'hard')
         then p_payload ->> 'difficulty' else 'medium' end,
    case when p_payload ->> 'visibility' in ('private', 'unlisted', 'public')
         then p_payload ->> 'visibility' else 'private' end,
    v_status,
    greatest(coalesce(nullif(p_payload ->> 'time_limit_seconds', '')::integer, 0), 0),
    coalesce(nullif(p_payload ->> 'shuffle_questions', '')::boolean, true),
    coalesce(nullif(p_payload ->> 'shuffle_options', '')::boolean, true),
    -- Set once, on creation. Editing a quiz later must not rewrite its origin.
    coalesce(nullif(p_payload ->> 'ai_generated', '')::boolean, false)
  )
  on conflict (id) do update set
    topic_id           = excluded.topic_id,
    slug               = excluded.slug,
    title              = excluded.title,
    description        = excluded.description,
    cover_emoji        = excluded.cover_emoji,
    difficulty         = excluded.difficulty,
    visibility         = excluded.visibility,
    status             = excluded.status,
    time_limit_seconds = excluded.time_limit_seconds,
    shuffle_questions  = excluded.shuffle_questions,
    shuffle_options    = excluded.shuffle_options;

  -- Replace the question set wholesale; options follow by cascade.
  delete from public.questions qu where qu.quiz_id = v_id;

  for v_q in select * from jsonb_array_elements(v_questions) loop
    v_i := v_i + 1;

    insert into public.questions (
      quiz_id, position, prompt, explanation, points, time_limit_seconds, image_url
    )
    values (
      v_id,
      v_i,
      left(coalesce(nullif(btrim(v_q ->> 'prompt'), ''), 'Câu hỏi ' || v_i), 600),
      nullif(left(btrim(coalesce(v_q ->> 'explanation', '')), 600), ''),
      greatest(coalesce(nullif(v_q ->> 'points', '')::integer, 100), 0),
      nullif(v_q ->> 'time_limit_seconds', '')::integer,
      nullif(btrim(coalesce(v_q ->> 'image_url', '')), '')
    )
    returning id into v_qid;

    v_j := 0;
    v_has_correct := false;

    for v_o in select * from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) loop
      v_j := v_j + 1;
      v_is_correct := false;

      -- Only the first option marked correct survives, so a question can never
      -- end up with two keys even if a client sends a malformed payload.
      if not v_has_correct and coalesce((v_o ->> 'is_correct')::boolean, false) then
        v_is_correct := true;
        v_has_correct := true;
      end if;

      insert into public.options (question_id, position, label, is_correct)
      values (
        v_qid,
        v_j,
        left(coalesce(nullif(btrim(v_o ->> 'label'), ''), 'Lựa chọn ' || v_j), 240),
        v_is_correct
      );
    end loop;

    -- Safety net: a draft question with no key gets its first option marked, so
    -- the quiz is always gradable once it is published.
    if not v_has_correct then
      update public.options o
      set is_correct = true
      where o.question_id = v_qid and o.position = 1;
    end if;
  end loop;

  select count(*) into v_question_count
  from public.questions qu where qu.quiz_id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'slug', v_slug,
    'status', v_status,
    'question_count', v_question_count
  );
end;
$$;

comment on function public.save_quiz(jsonb) is
  'Creates or replaces a quiz document atomically. Returns the id, slug and status.';

-- ---------------------------------------------------------------------------
-- upgrade_guest_profile
--
-- "Chơi ngay" signs a visitor in anonymously. Supabase Auth converts that
-- account in place via `updateUser({ email, password })`, which is what makes
-- "Lưu kết quả của bạn" keep every score already earned — a fresh `signUp()`
-- would start from zero.
--
-- This function carries the rest of the details across in the same breath. It
-- is also the only path that may change `role` or clear `is_guest` for a
-- player, because neither column is client-writable (see 0002_rls.sql).
--
-- Guarded on the profile still being marked as a guest, so it cannot be used
-- to re-label an established account.
-- ---------------------------------------------------------------------------
create or replace function public.upgrade_guest_profile(
  p_display_name text,
  p_role text default 'student',
  p_school text default null
)
returns void
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

  -- Either signal counts. By the time this runs the caller has already been
  -- converted by Supabase Auth, so `is_anonymous` has usually flipped to false
  -- and the profile flag is the one that still knows.
  if not exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid
      and (p.is_guest or coalesce(u.is_anonymous, false))
  ) then
    raise exception 'Tài khoản này đã là tài khoản chính thức.' using errcode = '42501';
  end if;

  update public.profiles p
  set display_name = left(coalesce(nullif(btrim(p_display_name), ''), p.display_name), 60),
      role = case when p_role = 'teacher' then 'teacher' else 'student' end,
      school = nullif(btrim(coalesce(p_school, '')), ''),
      is_guest = false
  where p.id = v_uid;
end;
$$;

comment on function public.upgrade_guest_profile(text, text, text) is
  'Applies the details chosen when a guest becomes a real account, and clears the guest flag.';

-- ---------------------------------------------------------------------------
-- Execution grants
-- ---------------------------------------------------------------------------
grant execute on function public.get_quiz_for_play(text) to anon, authenticated;
grant execute on function public.submit_attempt(text, jsonb, integer, text) to authenticated;
grant execute on function public.save_quiz(jsonb) to authenticated;
grant execute on function public.upgrade_guest_profile(text, text, text) to authenticated;
