-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0001 — schema
--
-- Domain model
--   topics            : the subjects students browse ("Toán", "Lịch sử", …)
--   profiles          : one row per auth user, including anonymous guests
--   quizzes           : a quiz shell owned by a teacher
--   questions         : ordered questions inside a quiz
--   options           : ordered answer choices; exactly one is correct
--   attempts          : one graded run of a quiz — the leaderboard's raw material
--   attempt_answers   : per-question detail of an attempt
--
-- The answer key never leaves the database through a plain table read. Play
-- data is served by `get_quiz_for_play()` and graded by `submit_attempt()`,
-- both SECURITY DEFINER. See 0003_api.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- `gen_random_uuid()` is in pg_catalog from PostgreSQL 13 on, so no extension
-- is required for the identity columns used below.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Vietnamese-aware slug maker. `unaccent` is not guaranteed to be installed,
-- so the folding table is spelled out explicitly.
--
-- `translate()` needs both strings to be exactly the same length: with a short
-- target, every character after the first mismatch shifts by one and the output
-- is silently wrong. The counts here are 17 a / 11 e / 5 i / 17 o / 11 u /
-- 5 y / 1 d — 67 either way. `lower()` runs first so uppercase input folds too.
create or replace function public.slugify(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(p_input, '')),
      'áàảãạăắằẳẵặâấầẩẫậ'
      || 'éèẻẽẹêếềểễệ'
      || 'íìỉĩị'
      || 'óòỏõọôốồổỗộơớờởỡợ'
      || 'úùủũụưứừửữự'
      || 'ýỳỷỹỵ'
      || 'đ',
      'aaaaaaaaaaaaaaaaa'
      || 'eeeeeeeeeee'
      || 'iiiii'
      || 'ooooooooooooooooo'
      || 'uuuuuuuuuuu'
      || 'yyyyy'
      || 'd'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  emoji       text not null default '🧠',
  -- One of the design-system accents; drives the tile colour in the UI.
  accent      text not null default 'neon'
              check (accent in ('neon', 'violet', 'magenta', 'spark', 'lime')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.topics is 'Quiz subjects shown on the Explore page.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique
               check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_emoji text not null default '🎓',
  role         text not null default 'student'
               check (role in ('student', 'teacher', 'admin')),
  is_guest     boolean not null default false,
  school       text,
  bio          text check (bio is null or char_length(bio) <= 280),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_is_guest_idx on public.profiles (is_guest) where is_guest;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Mirror every new auth user into a profile. Anonymous ("chơi ngay") users get
-- a friendly placeholder name they can rename later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `is_anonymous` is the column GoTrue actually sets for "chơi ngay". The
  -- metadata provider is only a fallback: it is not reliably present on the
  -- INSERT that creates the row, and relying on it alone marked real guests as
  -- ordinary students.
  v_guest    boolean := coalesce(new.is_anonymous, false)
                        or coalesce(new.raw_app_meta_data ->> 'provider', '') = 'anonymous';
  v_local    text;
  v_display  text;
  v_role     text;
  v_username text;
begin
  -- Every branch has to be nullified before it joins the coalesce chain.
  -- `split_part('', '@', 1)` is an empty string, not NULL, and an empty
  -- display_name fails the table's own check constraint.
  v_local := nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '');

  v_display := coalesce(
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    v_local,
    case
      when v_guest then 'Khách ' || lpad((1 + floor(random() * 9999))::int::text, 4, '0')
      else null
    end,
    'Người chơi'
  );

  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher'
    else 'student'
  end;

  v_username := lower(regexp_replace(
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')), ''),
      v_local,
      'player'
    ),
    '[^a-zA-Z0-9_]+', '', 'g'
  ));
  if char_length(v_username) < 3 then
    v_username := 'player';
  end if;
  -- Suffix with a slice of the uuid so collisions are practically impossible.
  v_username := left(v_username, 24) || '_' || substr(replace(new.id::text, '-', ''), 1, 5);

  insert into public.profiles (id, username, display_name, role, is_guest, school)
  values (
    new.id,
    v_username,
    left(v_display, 60),
    v_role,
    v_guest,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'school', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- quizzes
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  topic_id         uuid references public.topics (id) on delete set null,
  slug             text not null unique,
  title            text not null check (char_length(btrim(title)) between 3 and 120),
  description      text check (description is null or char_length(description) <= 600),
  cover_emoji      text not null default '📝',
  difficulty       text not null default 'medium'
                   check (difficulty in ('easy', 'medium', 'hard')),
  visibility       text not null default 'private'
                   check (visibility in ('private', 'unlisted', 'public')),
  status           text not null default 'draft'
                   check (status in ('draft', 'published', 'archived')),
  -- 0 means "no time pressure" — the whole quiz, not per question.
  time_limit_seconds integer not null default 0 check (time_limit_seconds >= 0),
  shuffle_questions  boolean not null default true,
  shuffle_options    boolean not null default true,
  ai_generated       boolean not null default false,
  play_count         integer not null default 0,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index quizzes_owner_idx on public.quizzes (owner_id, updated_at desc);
create index quizzes_topic_idx on public.quizzes (topic_id);
create index quizzes_published_idx
  on public.quizzes (published_at desc)
  where status = 'published' and visibility = 'public';

create trigger quizzes_touch_updated_at
  before update on public.quizzes
  for each row execute function public.touch_updated_at();

-- Keep `published_at` honest whenever a quiz crosses into published.
create or replace function public.handle_quiz_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    -- `tg_op` is checked first so `old` is never read during an INSERT.
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger quizzes_track_publish
  before insert or update of status on public.quizzes
  for each row execute function public.handle_quiz_published();

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  quiz_id            uuid not null references public.quizzes (id) on delete cascade,
  position           integer not null default 1,
  prompt             text not null check (char_length(btrim(prompt)) > 0),
  explanation        text check (explanation is null or char_length(explanation) <= 600),
  points             integer not null default 100 check (points >= 0),
  -- Null falls back to the quiz's own limit; 0 means untimed.
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds >= 0),
  image_url          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index questions_quiz_idx on public.questions (quiz_id, position);

create trigger questions_touch_updated_at
  before update on public.questions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- options
-- ---------------------------------------------------------------------------
create table public.options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  position    integer not null default 1,
  label       text not null check (char_length(btrim(label)) between 1 and 240),
  is_correct  boolean not null default false
);

create index options_question_idx on public.options (question_id, position);

-- ── Guard rails -------------------------------------------------------------
-- A question is only gradable with exactly one correct option, and a quiz is
-- only publishable with at least one question. Both invariants are enforced
-- by `save_quiz()` (0003_api.sql) so the client cannot produce a broken quiz.

-- ── Derived integrity -------------------------------------------------------

-- Keep the stored `accuracy` consistent with the score components.
create or replace function public.attempt_compute_accuracy(p_score integer, p_max integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_max, 0) > 0
    then round((p_score::numeric / p_max::numeric) * 100, 2)
    else 0::numeric
  end;
$$;

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------
create table public.attempts (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.quizzes (id) on delete cascade,
  user_id          uuid references public.profiles (id) on delete set null,
  -- Only used when the player had no profile at all.
  guest_name       text,
  score            integer not null default 0 check (score >= 0),
  max_score        integer not null default 0 check (max_score >= 0),
  correct_count    integer not null default 0 check (correct_count >= 0),
  question_count   integer not null default 0 check (question_count >= 0),
  accuracy         numeric(5, 2) not null default 0
                   check (accuracy >= 0 and accuracy <= 100),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed_at     timestamptz not null default now()
);

create index attempts_quiz_score_idx on public.attempts (quiz_id, score desc, duration_seconds asc);
create index attempts_user_idx on public.attempts (user_id, completed_at desc);
create index attempts_completed_idx on public.attempts (completed_at desc);

-- ---------------------------------------------------------------------------
-- attempt_answers
-- ---------------------------------------------------------------------------
-- Split out from `attempts` on purpose: the review detail names the correct
-- option, so it must never be publicly readable the way a score is.
create table public.attempt_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  option_id   uuid references public.options (id) on delete set null,
  is_correct  boolean not null default false,
  time_ms     integer not null default 0 check (time_ms >= 0)
);

create unique index attempt_answers_unique_idx on public.attempt_answers (attempt_id, question_id);
