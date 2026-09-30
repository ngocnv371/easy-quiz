-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0002 — row level security
--
-- Principles
--   · Anyone may read the public catalogue: topics, published quizzes, scores.
--   · An answer key is never readable through a table. Only the play RPC
--     (0003) reaches it, and it strips the key before returning.
--   · Attempts are written exclusively by `submit_attempt()`, so a client
--     cannot invent a score.
--   · A profile's `role` is not a client-writable column.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.topics          enable row level security;
alter table public.profiles        enable row level security;
alter table public.quizzes         enable row level security;
alter table public.questions       enable row level security;
alter table public.options         enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;

-- ---------------------------------------------------------------------------
-- Policy helpers
--
-- All SECURITY DEFINER so they read the underlying tables without the caller's
-- RLS being reapplied inside a policy (which would recurse or silently filter).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.role = 'admin'
  );
$$;

create or replace function public.is_teacher(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.role in ('teacher', 'admin')
  );
$$;

create or replace function public.owns_quiz(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and q.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions qu
    join public.quizzes q on q.id = qu.quiz_id
    where qu.id = p_question_id and q.owner_id = auth.uid()
  );
$$;

-- A quiz is visible to the public when it is published and not private.
create or replace function public.can_view_quiz(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id
      and (q.status = 'published' and q.visibility in ('public', 'unlisted'))
  );
$$;

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create policy "topics are readable by everyone"
  on public.topics for select
  using (true);

create policy "admins manage topics"
  on public.topics for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Public because leaderboard rows show a name next to a score.
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "players edit their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- quizzes
-- ---------------------------------------------------------------------------
create policy "published quizzes are public"
  on public.quizzes for select
  using (
    (status = 'published' and visibility in ('public', 'unlisted'))
    or owner_id = (select auth.uid())
  );

create policy "teachers create quizzes"
  on public.quizzes for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_teacher()
  );

create policy "owners update their quizzes"
  on public.quizzes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners delete their quizzes"
  on public.quizzes for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------
-- Owner-only, always. Players receive questions through `get_quiz_for_play()`.
create policy "owners manage the questions of their quizzes"
  on public.questions for all
  to authenticated
  using (public.owns_quiz(quiz_id))
  with check (public.owns_quiz(quiz_id));

-- ---------------------------------------------------------------------------
-- options
-- ---------------------------------------------------------------------------
create policy "owners manage the options of their questions"
  on public.options for all
  to authenticated
  using (public.owns_question(question_id))
  with check (public.owns_question(question_id));

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------
-- Readable when it is your own run, when you authored the quiz, or when the
-- quiz is public — that last case is what makes a leaderboard possible.
create policy "attempts are readable by player, author and public quizzes"
  on public.attempts for select
  using (
    user_id = (select auth.uid())
    or public.owns_quiz(quiz_id)
    or public.can_view_quiz(quiz_id)
  );

-- No INSERT / UPDATE / DELETE policies on purpose. `submit_attempt()` is the
-- only writer, which is what keeps the leaderboard trustworthy.

-- ---------------------------------------------------------------------------
-- attempt_answers
-- ---------------------------------------------------------------------------
create policy "attempt detail is readable by the player and the author"
  on public.attempt_answers for select
  using (
    exists (
      select 1 from public.attempts a
      where a.id = attempt_answers.attempt_id
        and (a.user_id = (select auth.uid()) or public.owns_quiz(a.quiz_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Supabase's `auto_expose_new_tables` grants are convenient but coarse. These
-- explicit statements narrow `profiles` and `quizzes` to the columns a client
-- is allowed to change, which closes two escalation paths:
--   · a player promoting themselves to `admin`
--   · a teacher inflating `play_count` on their own quiz
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.topics, public.profiles, public.quizzes,
                public.questions, public.options, public.attempts,
                public.attempt_answers
  to anon, authenticated;

grant insert, update, delete on public.quizzes, public.questions, public.options
  to authenticated;

-- Column-level instead of table-level UPDATE for the two sensitive tables.
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_emoji, school, bio)
  on public.profiles to authenticated;

revoke update on public.quizzes from anon, authenticated;
grant update (topic_id, slug, title, description, cover_emoji, difficulty,
              visibility, status, time_limit_seconds, shuffle_questions,
              shuffle_options)
  on public.quizzes to authenticated;

grant execute on function
  public.is_admin(uuid),
  public.is_teacher(uuid),
  public.owns_quiz(uuid),
  public.owns_question(uuid),
  public.can_view_quiz(uuid),
  public.slugify(text),
  public.attempt_compute_accuracy(integer, integer)
  to anon, authenticated;
