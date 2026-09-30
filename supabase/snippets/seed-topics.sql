-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · reference data (topics)
--
-- The 8 topics the Explore page browses. They live in seed.sql for local
-- development; this snippet is the production-safe subset — it carries no
-- accounts or demo rows.
--
-- Run against a remote project:
--   docker cp supabase/snippets/seed-topics.sql supabase_db_easy-quiz:/tmp/seed-topics.sql
--   docker exec supabase_db_easy-quiz psql "<connection-string>" \
--     -v ON_ERROR_STOP=1 -f /tmp/seed-topics.sql
--
-- Idempotent: re-running is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.topics (slug, name, description, emoji, accent, sort_order)
values
  ('toan-hoc',      'Toán học',       'Số học, hình học và tư duy logic.',              '🔢', 'neon',    1),
  ('lich-su',       'Lịch sử',        'Việt Nam và thế giới qua các thời kỳ.',          '🏛️', 'violet',  2),
  ('khoa-hoc',      'Khoa học',       'Vật lý, hoá học, sinh học quanh ta.',            '🔬', 'lime',    3),
  ('tieng-anh',     'Tiếng Anh',      'Từ vựng, ngữ pháp và thành ngữ thông dụng.',     '🔤', 'magenta', 4),
  ('ngu-van',       'Ngữ văn',        'Tác phẩm, tác giả và kỹ năng đọc hiểu.',         '📚', 'spark',   5),
  ('dia-ly',        'Địa lý',         'Bản đồ, khí hậu và các vùng kinh tế.',           '🌏', 'neon',    6),
  ('tin-hoc',       'Tin học',        'Máy tính, lập trình và an toàn số.',             '💻', 'violet',  7),
  ('ky-nang-song',  'Kỹ năng sống',   'Tài chính, giao tiếp và chăm sóc bản thân.',     '🌱', 'lime',    8)
on conflict (slug) do nothing;
