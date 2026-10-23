-- The app's own tables (accounts are in 0001_auth.sql). D1 is SQLite: ids are text (uuids made in
-- the Worker), booleans are 0/1, times are ISO strings in UTC, JSON is text. There is no row-level
-- security: every query runs in the Worker (worker/*.ts), which decides who may read and write what.
-- The answer key (options.is_correct) only ever leaves the database through grading.

-- ---------------------------------------------------------------- topics (the subjects on Explore)
create table topics (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  emoji text not null default '🧠',
  -- one of the design-system accents; drives the tile colour
  accent text not null default 'neon' check (accent in ('neon', 'violet', 'magenta', 'spark', 'lime')),
  sort_order integer not null default 0,
  is_active integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into topics (id, slug, name, description, emoji, accent, sort_order) values
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000001', 'toan-hoc', 'Toán học', 'Số học, hình học và tư duy logic.', '🔢', 'neon', 1),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000002', 'lich-su', 'Lịch sử', 'Việt Nam và thế giới qua các thời kỳ.', '🏛️', 'violet', 2),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000003', 'khoa-hoc', 'Khoa học', 'Vật lý, hoá học, sinh học quanh ta.', '🔬', 'lime', 3),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000004', 'tieng-anh', 'Tiếng Anh', 'Từ vựng, ngữ pháp và thành ngữ thông dụng.', '🔤', 'magenta', 4),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000005', 'ngu-van', 'Ngữ văn', 'Tác phẩm, tác giả và kỹ năng đọc hiểu.', '📚', 'spark', 5),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000006', 'dia-ly', 'Địa lý', 'Bản đồ, khí hậu và các vùng kinh tế.', '🌏', 'neon', 6),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000007', 'tin-hoc', 'Tin học', 'Máy tính, lập trình và an toàn số.', '💻', 'violet', 7),
  ('4a0c55c4-7b1e-4f3a-9d0e-000000000008', 'ky-nang-song', 'Kỹ năng sống', 'Tài chính, giao tiếp và chăm sóc bản thân.', '🌱', 'lime', 8);

-- ---------------------------------------------------------------- profiles
-- One per account, guests included (created by worker/auth.ts with the user). Public: leaderboard
-- rows show a name. `role` and `is_guest` are never written from what the page sends.
create table profiles (
  id text primary key references user (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_emoji text not null default '🎓',
  role text not null default 'user' check (role in ('user', 'admin')),
  is_guest integer not null default 0,
  organization text,
  bio text,
  -- AI Assist credits (worker/ai.ts)
  ai_credits integer not null default 0 check (ai_credits >= 0),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index profiles_role on profiles (role);

-- ---------------------------------------------------------------- quizzes, questions, options
create table quizzes (
  id text primary key,
  owner_id text not null references profiles (id) on delete cascade,
  topic_id text references topics (id) on delete set null,
  slug text not null unique,
  title text not null,
  description text,
  cover_emoji text not null default '📝',
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- 0 means no time pressure (the whole quiz, not per question)
  time_limit_seconds integer not null default 0 check (time_limit_seconds >= 0),
  shuffle_questions integer not null default 1,
  shuffle_options integer not null default 1,
  ai_generated integer not null default 0,
  play_count integer not null default 0,
  -- set when the quiz becomes published, cleared when it stops being published (worker/manage.ts)
  published_at text,
  -- when a CSV import last wrote this quiz; null for hand-made quizzes (worker/import.ts)
  imported_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index quizzes_owner on quizzes (owner_id, updated_at desc);
create index quizzes_topic on quizzes (topic_id);
create index quizzes_published on quizzes (status, visibility, published_at desc);

create table questions (
  id text primary key,
  quiz_id text not null references quizzes (id) on delete cascade,
  position integer not null default 1,
  prompt text not null,
  explanation text,
  points integer not null default 1 check (points >= 0),
  -- null falls back to the quiz's limit; 0 means untimed
  time_limit_seconds integer,
  image_url text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index questions_quiz on questions (quiz_id, position);

create table options (
  id text primary key,
  question_id text not null references questions (id) on delete cascade,
  position integer not null default 1,
  label text not null,
  is_correct integer not null default 0
);

create index options_question on options (question_id, position);

-- ---------------------------------------------------------------- attempts (graded quiz runs)
create table attempts (
  id text primary key,
  quiz_id text not null references quizzes (id) on delete cascade,
  user_id text references profiles (id) on delete set null,
  guest_name text,
  score integer not null default 0,
  max_score integer not null default 0,
  correct_count integer not null default 0,
  question_count integer not null default 0,
  accuracy real not null default 0,
  duration_seconds integer not null default 0,
  completed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index attempts_quiz_score on attempts (quiz_id, score desc, duration_seconds asc);
create index attempts_user on attempts (user_id, completed_at desc);
create index attempts_completed on attempts (completed_at desc);

-- the per-question review names the right option, so it is only shown to the player and the author
create table attempt_answers (
  attempt_id text not null references attempts (id) on delete cascade,
  question_id text not null references questions (id) on delete cascade,
  option_id text references options (id) on delete set null,
  is_correct integer not null default 0,
  time_ms integer not null default 0,
  primary key (attempt_id, question_id)
);

-- ---------------------------------------------------------------- Endless mode
-- mastery per player and topic; accuracy is derived, never stored
create table endless_progress (
  user_id text not null references profiles (id) on delete cascade,
  topic_id text not null references topics (id) on delete cascade,
  answered integer not null default 0,
  correct integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (user_id, topic_id)
);

-- one row per run; the Endless leaderboard ranks players by their best run's streak
create table endless_sessions (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  topic_id text references topics (id) on delete set null,
  answered integer not null default 0,
  correct integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index endless_sessions_user on endless_sessions (user_id, updated_at desc);
create index endless_sessions_best on endless_sessions (best_streak desc, correct desc);

-- ---------------------------------------------------------------- AI Assist credit history
create table ai_credit_ledger (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  -- negative spends, positive grants and refunds
  delta integer not null,
  balance_after integer not null,
  -- 'generation' | 'refund:…' | 'grant'
  reason text not null,
  question_count integer,
  provider text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index ai_credit_ledger_user on ai_credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------- energy and Plus (worker/energy.ts)
-- what can be bought; prices live here, change them without a deploy
create table store_products (
  id text primary key,
  kind text not null check (kind in ('energy', 'plus')),
  name text not null,
  description text,
  energy integer not null default 0 check (energy >= 0),
  plus_days integer not null default 0 check (plus_days >= 0),
  price_vnd integer not null check (price_vnd >= 2000),
  active integer not null default 1,
  sort integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check ((kind = 'energy' and energy > 0 and plus_days = 0) or (kind = 'plus' and plus_days > 0 and energy = 0))
);

insert into store_products (id, kind, name, description, energy, plus_days, price_vnd, sort) values
  ('energy_100', 'energy', 'Gói 100 năng lượng', 'Thêm 100 câu luyện tập, không hết hạn.', 100, 0, 10000, 10),
  ('energy_250', 'energy', 'Gói 250 năng lượng', 'Thêm 250 câu luyện tập, không hết hạn. Tiết kiệm 20%.', 250, 0, 20000, 20),
  ('plus_30', 'plus', 'Easy Quiz Plus · 30 ngày', 'Luyện không giới hạn trong 30 ngày.', 0, 30, 49000, 30);

create table energy_wallets (
  user_id text primary key references profiles (id) on delete cascade,
  -- today's free energy and the Vietnam day it belongs to; a stale free_date refills on next touch
  free_balance integer not null default 0 check (free_balance >= 0),
  free_allowance integer not null default 0 check (free_allowance >= 0),
  free_date text,
  -- bought energy, never expires
  paid_balance integer not null default 0 check (paid_balance >= 0),
  -- Plus is active while this is in the future
  plus_until text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- every spend, purchase and grant (daily refills are not logged)
create table energy_ledger (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  bucket text not null check (bucket in ('free', 'paid', 'plus')),
  delta integer not null,
  balance_after integer not null,
  -- 'endless' | 'quiz' | 'purchase' | 'grant'
  reason text not null,
  -- what it was for: a question id, a quiz id, an order code
  ref text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index energy_ledger_user on energy_ledger (user_id, created_at desc);

-- a paid start of a quiz; submitting the attempt redeems it exactly once
create table quiz_play_tickets (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  quiz_id text not null references quizzes (id) on delete cascade,
  cost integer not null check (cost >= 0),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  used_at text
);

create index quiz_play_tickets_user on quiz_play_tickets (user_id, created_at desc);

-- ---------------------------------------------------------------- PayOS orders (worker/payments.ts)
create table payment_orders (
  -- PayOS orderCode: a positive integer, unique for the merchant
  order_code integer primary key,
  -- kept when the account is deleted: it is a financial record
  user_id text references profiles (id) on delete set null,
  product_id text not null references store_products (id),
  -- the product as it was sold, so a later price change doesn't rewrite history
  amount_vnd integer not null check (amount_vnd > 0),
  energy integer not null default 0,
  plus_days integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired', 'failed')),
  provider text not null default 'payos',
  checkout_url text,
  payment_link_id text,
  provider_payload text,
  -- set by the one call that turned the order paid, so only that call credits it (worker/payments.ts)
  fulfil_token text,
  paid_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index payment_orders_user on payment_orders (user_id, created_at desc);
