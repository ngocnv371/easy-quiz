-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · seed
--
-- Runs after migrations on `supabase db reset`. Kept deliberately small: the
-- subject list the Explore page browses, and a demo admin who can sign in and
-- run the bulk import. No quizzes are seeded — quiz content arrives only
-- through the admin CSV import (`supabase/functions/import-questions`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Topics
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Demo admin
--
-- A real `auth.users` row so email sign-in works out of the box. The
-- `auth.identities` insert is guarded because `provider_id` is only present on
-- newer GoTrue schemas.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user_id constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  -- GoTrue reads these as plain strings, so they must be '' rather than NULL —
  -- a NULL here makes sign-in fail with "Database error querying schema".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'admin@easyquiz.local',
    extensions.crypt('easyquiz123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Ms. Mai","role":"admin","organization":"Bad Mafia"}'::jsonb,
    '', '', '', '',
    '', '', '',
    now(),
    now()
  )
  on conflict (id) do nothing;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) then
    execute $sql$
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), $1,
        jsonb_build_object('sub', $1::text, 'email', 'admin@easyquiz.local', 'email_verified', true),
        'email', $1::text, now(), now(), now()
      )
      on conflict do nothing
    $sql$ using v_user_id;
  else
    execute $sql$
      insert into auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), $1,
        jsonb_build_object('sub', $1::text, 'email', 'admin@easyquiz.local', 'email_verified', true),
        'email', now(), now(), now()
      )
      on conflict do nothing
    $sql$ using v_user_id;
  end if;

  -- `handle_new_user` already created the profile; make sure the role stuck.
  -- The credit balance is set here too, so the demo admin can try AI Assist
  -- without a manual top-up (see `supabase/snippets/grant-ai-credits.sql`).
  update public.profiles
  set display_name = 'Ms. Mai',
      role = 'admin',
      avatar_emoji = '👩‍🏫',
      organization = 'Bad Mafia',
      ai_credits = 50
  where id = v_user_id;
end $$;
