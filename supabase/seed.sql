-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · seed
--
-- Runs after migrations on `supabase db reset`. Gives a fresh database a
-- believable shape: subjects to browse, a demo teacher, three published
-- quizzes, and a handful of past attempts so the leaderboard has something to
-- rank on day one.
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
-- Demo teacher
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
    'giaovien@easyquiz.local',
    extensions.crypt('easyquiz123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Cô Mai","role":"teacher","school":"THCS Nguyễn Du"}'::jsonb,
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
        jsonb_build_object('sub', $1::text, 'email', 'giaovien@easyquiz.local', 'email_verified', true),
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
        jsonb_build_object('sub', $1::text, 'email', 'giaovien@easyquiz.local', 'email_verified', true),
        'email', now(), now(), now()
      )
      on conflict do nothing
    $sql$ using v_user_id;
  end if;

  -- `handle_new_user` already created the profile; make sure the role stuck.
  -- The credit balance is set here too, so the demo teacher can try AI Assist
  -- without a manual top-up (see `supabase/snippets/grant-ai-credits.sql`).
  update public.profiles
  set display_name = 'Cô Mai',
      role = 'teacher',
      avatar_emoji = '👩‍🏫',
      school = 'THCS Nguyễn Du',
      ai_credits = 50
  where id = v_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Demo quizzes
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner  constant uuid := '11111111-1111-4111-8111-111111111111';

  v_quiz_id uuid;
  v_q_id    uuid;

  -- (topic slug, slug, title, description, emoji, difficulty, seconds)
  -- Dollar-quoted so Vietnamese punctuation never needs escaping.
  v_quizzes constant jsonb := $json$[
    {
      "topic": "toan-hoc",
      "slug": "toan-lop-6-so-tu-nhien",
      "title": "Toán lớp 6 · Số tự nhiên",
      "description": "Kiểm tra nhanh về luỹ thừa, ước chung lớn nhất và thứ tự thực hiện phép tính.",
      "emoji": "🔢",
      "difficulty": "easy",
      "seconds": 300
    },
    {
      "topic": "lich-su",
      "slug": "lich-su-viet-nam-hien-dai",
      "title": "Lịch sử Việt Nam hiện đại",
      "description": "Từ Cách mạng tháng Tám 1945 đến công cuộc Đổi mới — những mốc không thể quên.",
      "emoji": "🏛️",
      "difficulty": "medium",
      "seconds": 420
    },
    {
      "topic": "khoa-hoc",
      "slug": "khoa-hoc-tu-nhien-co-ban",
      "title": "Khoa học tự nhiên cơ bản",
      "description": "Nước, ánh sáng, tế bào và những điều tưởng đơn giản nhưng dễ nhầm.",
      "emoji": "🔬",
      "difficulty": "easy",
      "seconds": 0
    }
  ]$json$::jsonb;

  -- Questions keyed by quiz slug: prompt, explanation, options, correct index.
  v_questions constant jsonb := $json${
    "toan-lop-6-so-tu-nhien": [
      {
        "prompt": "Kết quả của phép tính 2^5 bằng bao nhiêu?",
        "explanation": "2^5 = 2 × 2 × 2 × 2 × 2 = 32.",
        "options": ["16", "32", "64", "25"],
        "correct": 1
      },
      {
        "prompt": "Số nào dưới đây là số nguyên tố?",
        "explanation": "29 không chia hết cho số nào ngoài 1 và chính nó. 21, 27 và 33 đều chia hết cho 3.",
        "options": ["21", "27", "29", "33"],
        "correct": 2
      },
      {
        "prompt": "Ước chung lớn nhất của 24 và 36 là:",
        "explanation": "24 = 2^3 × 3 và 36 = 2^2 × 3^2, nên ƯCLN = 2^2 × 3 = 12.",
        "options": ["6", "12", "18", "24"],
        "correct": 1
      },
      {
        "prompt": "Trong biểu thức không có dấu ngoặc, thứ tự thực hiện phép tính là:",
        "explanation": "Luỹ thừa trước, rồi nhân chia, cuối cùng là cộng trừ.",
        "options": [
          "Cộng trừ trước, nhân chia sau",
          "Nhân chia trước, cộng trừ sau",
          "Thực hiện từ trái sang phải",
          "Phép nào viết trước làm trước"
        ],
        "correct": 1
      },
      {
        "prompt": "Số 0 có phải là số tự nhiên không?",
        "explanation": "Theo chương trình lớp 6, tập số tự nhiên được viết là N = {0; 1; 2; 3; ...}.",
        "options": ["Có", "Không", "Chỉ khi đi kèm số khác", "Tuỳ giáo viên quy định"],
        "correct": 0
      }
    ],
    "lich-su-viet-nam-hien-dai": [
      {
        "prompt": "Cách mạng tháng Tám thành công vào năm nào?",
        "explanation": "Ngày 19/8/1945, khởi nghĩa giành thắng lợi ở Hà Nội, lan ra cả nước.",
        "options": ["1944", "1945", "1946", "1954"],
        "correct": 1
      },
      {
        "prompt": "Chiến dịch Điện Biên Phủ kết thúc thắng lợi vào ngày nào?",
        "explanation": "Ngày 7/5/1954, tập đoàn cứ điểm Điện Biên Phủ bị tiêu diệt hoàn toàn.",
        "options": ["7/5/1954", "19/8/1945", "30/4/1975", "2/9/1945"],
        "correct": 0
      },
      {
        "prompt": "Ngày Giải phóng miền Nam, thống nhất đất nước là:",
        "explanation": "30/4/1975, chiến dịch Hồ Chí Minh toàn thắng.",
        "options": ["30/4/1975", "7/5/1954", "2/9/1945", "19/5/1975"],
        "correct": 0
      },
      {
        "prompt": "Công cuộc Đổi mới được khởi xướng tại Đại hội Đảng lần thứ mấy?",
        "explanation": "Đại hội VI (1986) đề ra đường lối đổi mới toàn diện.",
        "options": ["Đại hội IV (1976)", "Đại hội V (1982)", "Đại hội VI (1986)", "Đại hội VII (1991)"],
        "correct": 2
      },
      {
        "prompt": "Ai đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình ngày 2/9/1945?",
        "explanation": "Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập, khai sinh nước Việt Nam Dân chủ Cộng hoà.",
        "options": ["Hồ Chí Minh", "Võ Nguyên Giáp", "Phạm Văn Đồng", "Trường Chinh"],
        "correct": 0
      }
    ],
    "khoa-hoc-tu-nhien-co-ban": [
      {
        "prompt": "Công thức hoá học của nước là:",
        "explanation": "Một phân tử nước gồm hai nguyên tử hydrogen liên kết với một nguyên tử oxygen.",
        "options": ["CO2", "H2O", "O2", "NaCl"],
        "correct": 1
      },
      {
        "prompt": "Ánh sáng truyền đi với tốc độ khoảng bao nhiêu trong chân không?",
        "explanation": "Khoảng 299.792 km mỗi giây, thường được làm tròn thành 3 × 10^8 m/s.",
        "options": ["3.000 km/s", "30.000 km/s", "300.000 km/s", "3.000.000 km/s"],
        "correct": 2
      },
      {
        "prompt": "Bào quan nào được gọi là 'nhà máy năng lượng' của tế bào?",
        "explanation": "Ti thể thực hiện hô hấp tế bào, tạo ra ATP — nguồn năng lượng của mọi hoạt động sống.",
        "options": ["Nhân tế bào", "Ti thể", "Ribosome", "Không bào"],
        "correct": 1
      },
      {
        "prompt": "Nước đá nổi trên nước lỏng vì:",
        "explanation": "Khi đông đặc, các phân tử nước tạo cấu trúc rỗng nên khối lượng riêng của đá nhỏ hơn nước lỏng.",
        "options": [
          "Đá nhẹ hơn nước về khối lượng",
          "Khối lượng riêng của đá nhỏ hơn nước lỏng",
          "Đá có nhiệt độ cao hơn nước",
          "Đá hút được không khí vào bên trong"
        ],
        "correct": 1
      },
      {
        "prompt": "Cơ quan nào của con người chịu trách nhiệm trao đổi khí?",
        "explanation": "Phổi là nơi diễn ra trao đổi khí: nhận oxygen và thải carbon dioxide.",
        "options": ["Gan", "Thận", "Phổi", "Dạ dày"],
        "correct": 2
      }
    ]
  }$json$::jsonb;

  v_quiz   jsonb;
  v_list   jsonb;
  v_q      jsonb;
  v_opt    text;
  v_idx    integer;
  v_pos    integer;
begin
  for v_quiz in select * from jsonb_array_elements(v_quizzes) loop
    insert into public.quizzes (
      owner_id, topic_id, slug, title, description, cover_emoji,
      difficulty, visibility, status, time_limit_seconds, published_at
    )
    values (
      v_owner,
      (select t.id from public.topics t where t.slug = v_quiz ->> 'topic'),
      v_quiz ->> 'slug',
      v_quiz ->> 'title',
      v_quiz ->> 'description',
      v_quiz ->> 'emoji',
      v_quiz ->> 'difficulty',
      'public',
      'published',
      (v_quiz ->> 'seconds')::integer,
      now()
    )
    on conflict (slug) do nothing
    returning id into v_quiz_id;

    -- Already seeded on a previous run.
    if v_quiz_id is null then
      continue;
    end if;

    v_list := v_questions -> (v_quiz ->> 'slug');
    v_pos := 0;

    for v_q in select * from jsonb_array_elements(v_list) loop
      v_pos := v_pos + 1;

      insert into public.questions (quiz_id, position, prompt, explanation, points)
      values (v_quiz_id, v_pos, v_q ->> 'prompt', v_q ->> 'explanation', 1)
      returning id into v_q_id;

      v_idx := 0;
      for v_opt in select * from jsonb_array_elements_text(v_q -> 'options') loop
        insert into public.options (question_id, position, label, is_correct)
        values (v_q_id, v_idx + 1, v_opt, v_idx = (v_q ->> 'correct')::integer);
        v_idx := v_idx + 1;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Past attempts
--
-- Guest runs, so the demo quiz leaderboards look alive without inventing
-- accounts. Scores are expressed as a share of the quiz maximum.
-- ---------------------------------------------------------------------------
do $$
declare
  v_row record;
begin
  for v_row in
    select *
    from (values
      ('toan-lop-6-so-tu-nhien',       'Ngọc Anh',     5, 3),
      ('toan-lop-6-so-tu-nhien',       'Minh Quân',    4, 2),
      ('toan-lop-6-so-tu-nhien',       'Thảo Vy',      3, 4),
      ('toan-lop-6-so-tu-nhien',       'Đức Huy',      5, 5),
      ('lich-su-viet-nam-hien-dai',    'Bảo Long',     5, 3),
      ('lich-su-viet-nam-hien-dai',    'Khánh Linh',   4, 4),
      ('lich-su-viet-nam-hien-dai',    'Gia Bảo',      3, 2),
      ('khoa-hoc-tu-nhien-co-ban',     'Phương Nhi',   5, 2),
      ('khoa-hoc-tu-nhien-co-ban',     'Tuấn Kiệt',    4, 3),
      ('khoa-hoc-tu-nhien-co-ban',     'Hà My',        2, 4)
    ) as t(quiz_slug, name, correct, minutes)
  loop
    insert into public.attempts (
      quiz_id, user_id, guest_name, score, max_score,
      correct_count, question_count, accuracy, duration_seconds, completed_at
    )
    select
      q.id,
      null,
      v_row.name,
      -- One point per question, matching the questions inserted above.
      v_row.correct,
      agg.max_score::integer,
      v_row.correct,
      agg.question_count::integer,
      -- `sum()` widens to bigint, and the helper takes integer, so cast on the way in.
      public.attempt_compute_accuracy(v_row.correct, agg.max_score::integer),
      v_row.minutes * 60,
      now() - (v_row.minutes || ' hours')::interval
    from public.quizzes q
    cross join lateral (
      select
        coalesce(sum(qu.points), 0) as max_score,
        count(*) as question_count
      from public.questions qu
      where qu.quiz_id = q.id
    ) agg
    where q.slug = v_row.quiz_slug
      and agg.question_count > 0;
  end loop;

  update public.quizzes q
  set play_count = (select count(*) from public.attempts a where a.quiz_id = q.id);
end $$;

-- ---------------------------------------------------------------------------
-- Per-question detail for those demo attempts
--
-- `submit_attempt()` always writes `attempt_answers`, but the hand-written
-- attempts above do not go through it. Without this the teacher report would
-- show every question as "0 lượt sai". Deterministic: the first N questions of
-- the quiz are answered correctly (N = the attempt's `correct_count`) and the
-- rest are given a wrong option, keeping the detail consistent with the score
-- already stored on the attempt.
-- ---------------------------------------------------------------------------
do $$
declare
  v_attempt record;
begin
  for v_attempt in
    select a.id, a.quiz_id, a.correct_count
    from public.attempts a
    where a.user_id is null
  loop
    insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct, time_ms)
    select
      v_attempt.id,
      q.id,
      chosen.id,
      (q.rn <= v_attempt.correct_count),
      (4000 + q.rn * 1500)::integer
    from (
      select
        qu.id,
        row_number() over (order by qu.position) as rn
      from public.questions qu
      where qu.quiz_id = v_attempt.quiz_id
    ) q
    cross join lateral (
      -- A correct row wants the key option; a wrong row wants any other one.
      select o.id
      from public.options o
      where o.question_id = q.id
        and o.is_correct = (q.rn <= v_attempt.correct_count)
      order by o.position
      limit 1
    ) chosen;
  end loop;
end $$;
