-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0006 — Bulk question import
--
-- An admin drops a CSV of questions on the manage screen; the `import-questions`
-- edge function parses it and calls `import_question_bank()` here, once, with a
-- fully-shaped payload. Everything the import writes lands in that single call,
-- so a half-applied batch is impossible.
--
-- A question cannot exist without a quiz in this domain, so "one subject" means
-- "one quiz per subject":
--   · the subject is upserted into `topics` (by slug)
--   · the subject's import quiz is upserted and its questions replaced wholesale
--   · the admin's answers never touch a hand-authored quiz
--
-- `quizzes.imported_at` is what makes the upsert deterministic: it marks the
-- quizzes the importer owns, so a re-import finds the same quiz for a subject
-- and replaces its questions instead of piling up duplicates. It is NULL for
-- every quiz an admin creates by hand.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Provenance marker
-- ---------------------------------------------------------------------------
alter table public.quizzes
  add column imported_at timestamptz;

comment on column public.quizzes.imported_at is
  'When a bulk import last wrote this quiz. NULL for hand-authored quizzes; used to make re-imports idempotent.';

-- ---------------------------------------------------------------------------
-- import_question_bank
--
-- Admin-only, and SECURITY DEFINER because it writes across topics, quizzes,
-- questions and options in one transaction. The edge function has already
-- validated the rows; the invariants the table checks cannot express (one quiz
-- per subject, exactly one correct option, no clobbering of manual quizzes) are
-- enforced here.
--
-- Payload:
-- {
--   "groups": [
--     {
--       "subject": { "slug"?, "name", "emoji"?, "accent"?, "description"? },
--       "quiz":    { "title"?, "difficulty"?, "visibility"?, "status"? },
--       "questions": [
--         { "prompt", "explanation"?, "points"?,
--           "options": [ { "label", "is_correct" } ] }
--       ]
--     }
--   ]
-- }
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.import_question_bank(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_group       jsonb;
  v_subject     jsonb;
  v_quiz        jsonb;
  v_questions   jsonb;
  v_q           jsonb;
  v_o           jsonb;
  v_slug        text;
  v_title       text;
  v_topic_id    uuid;
  v_quiz_id     uuid;
  v_qid         uuid;
  v_i           integer;
  v_j           integer;
  v_count       integer;
  v_has_correct boolean;
  v_is_correct  boolean;
  v_subjects    integer := 0;
  v_quizzes     integer := 0;
  v_question_total integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '42501';
  end if;

  if not public.is_admin(v_uid) then
    raise exception 'Chỉ quản trị viên mới nhập được ngân hàng câu hỏi.'
      using errcode = '42501';
  end if;

  for v_group in
    select * from jsonb_array_elements(coalesce(p_payload -> 'groups', '[]'::jsonb))
  loop
    v_subject   := coalesce(v_group -> 'subject', '{}'::jsonb);
    v_quiz      := coalesce(v_group -> 'quiz', '{}'::jsonb);
    v_questions := coalesce(v_group -> 'questions', '[]'::jsonb);
    v_title     := left(coalesce(
      nullif(btrim(v_quiz ->> 'title'), ''),
      'Câu hỏi · ' || coalesce(nullif(btrim(v_subject ->> 'name'), ''), 'Chủ đề')
    ), 120);

    -- ── Subject (topic) upsert ──────────────────────────────────────────
    v_slug := public.slugify(coalesce(nullif(v_subject ->> 'slug', ''), v_subject ->> 'name'));
    if v_slug = '' then
      v_slug := 'chu-de';
    end if;
    v_slug := left(v_slug, 64);

    insert into public.topics as t (slug, name, description, emoji, accent, is_active)
    values (
      v_slug,
      left(coalesce(nullif(btrim(v_subject ->> 'name'), ''), v_slug), 80),
      nullif(left(btrim(coalesce(v_subject ->> 'description', '')), 300), ''),
      coalesce(nullif(v_subject ->> 'emoji', ''), '🧠'),
      case
        when v_subject ->> 'accent' in ('neon', 'violet', 'magenta', 'spark', 'lime')
          then v_subject ->> 'accent'
        else 'neon'
      end,
      true
    )
    on conflict (slug) do update set
      name        = excluded.name,
      description = coalesce(excluded.description, t.description),
      -- Keep a custom emoji when the import did not name one.
      emoji       = coalesce(nullif(v_subject ->> 'emoji', ''), t.emoji)
    returning id into v_topic_id;

    v_subjects := v_subjects + 1;

    -- ── The subject's import quiz ───────────────────────────────────────
    -- Re-import means "same subject", so the quiz is matched by owner + topic,
    -- restricted to rows the importer created. A manual quiz on the same topic
    -- is left untouched.
    select q.id into v_quiz_id
    from public.quizzes q
    where q.owner_id = v_uid
      and q.topic_id = v_topic_id
      and q.imported_at is not null
    order by q.created_at
    limit 1;

    if v_quiz_id is null then
      v_slug := public.slugify(coalesce(nullif(v_quiz ->> 'slug', ''), v_title));
      if v_slug = '' then
        v_slug := 'de-nhap-lieu';
      end if;
      -- Suffix only on a genuine collision; the import quiz is then found by
      -- topic on the next run, so the suffix never changes underneath it.
      v_slug := left(v_slug, 48);
      if exists (select 1 from public.quizzes q where q.slug = v_slug) then
        v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
      end if;

      insert into public.quizzes (
        owner_id, topic_id, slug, title, description, cover_emoji, difficulty,
        visibility, status, time_limit_seconds, imported_at
      )
      values (
        v_uid,
        v_topic_id,
        v_slug,
        v_title,
        nullif(left(btrim(coalesce(v_quiz ->> 'description', '')), 600), ''),
        coalesce(nullif(v_subject ->> 'emoji', ''), '📝'),
        case when v_quiz ->> 'difficulty' in ('easy', 'medium', 'hard')
             then v_quiz ->> 'difficulty' else 'medium' end,
        case when v_quiz ->> 'visibility' in ('private', 'unlisted', 'public')
             then v_quiz ->> 'visibility' else 'public' end,
        case when v_quiz ->> 'status' in ('draft', 'published', 'archived')
             then v_quiz ->> 'status' else 'published' end,
        greatest(coalesce(nullif(v_quiz ->> 'time_limit_seconds', '')::integer, 0), 0),
        now()
      )
      returning id into v_quiz_id;

      v_quizzes := v_quizzes + 1;
    else
      update public.quizzes q
      set topic_id    = v_topic_id,
          title       = v_title,
          description = nullif(left(btrim(coalesce(v_quiz ->> 'description', '')), 600), ''),
          cover_emoji = coalesce(nullif(v_subject ->> 'emoji', ''), q.cover_emoji),
          difficulty  = case when v_quiz ->> 'difficulty' in ('easy', 'medium', 'hard')
                             then v_quiz ->> 'difficulty' else q.difficulty end,
          visibility  = case when v_quiz ->> 'visibility' in ('private', 'unlisted', 'public')
                             then v_quiz ->> 'visibility' else q.visibility end,
          status      = case when v_quiz ->> 'status' in ('draft', 'published', 'archived')
                             then v_quiz ->> 'status' else q.status end,
          imported_at = now()
      where q.id = v_quiz_id;
    end if;

    -- ── Replace the question set wholesale ──────────────────────────────
    delete from public.questions qu where qu.quiz_id = v_quiz_id;

    v_i := 0;

    for v_q in select * from jsonb_array_elements(v_questions) loop
      v_i := v_i + 1;

      insert into public.questions (
        quiz_id, position, prompt, explanation, points, time_limit_seconds, image_url
      )
      values (
        v_quiz_id,
        v_i,
        left(coalesce(nullif(btrim(v_q ->> 'prompt'), ''), 'Câu hỏi ' || v_i), 600),
        nullif(left(btrim(coalesce(v_q ->> 'explanation', '')), 600), ''),
        greatest(coalesce(nullif(v_q ->> 'points', '')::integer, 1), 0),
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
        -- carry two keys even if a client sends a malformed payload.
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

      -- Safety net: a question with no key gets its first option marked, so the
      -- quiz is always gradable once it is published.
      if not v_has_correct then
        update public.options o
        set is_correct = true
        where o.question_id = v_qid and o.position = 1;
      end if;
    end loop;

    select count(*)::integer into v_count
    from public.questions qu where qu.quiz_id = v_quiz_id;

    v_question_total := v_question_total + v_count;
  end loop;

  return jsonb_build_object(
    'subjects', v_subjects,
    'quizzes', v_quizzes,
    'questions', v_question_total
  );
end;
$$;

comment on function public.import_question_bank(jsonb) is
  'Admin-only bulk import: upserts subjects, upserts one quiz per subject, and replaces its questions atomically.';

-- The default PUBLIC grant is dropped: this writes, so only signed-in callers
-- may even reach the admin check inside.
revoke execute on function public.import_question_bank(jsonb) from public;
grant execute on function public.import_question_bank(jsonb) to authenticated;
