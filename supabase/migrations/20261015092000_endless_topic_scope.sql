-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Quiz · 0007 — Endless mode: scope to one subject
--
-- Endless mode drew from every published public quiz. A player can now ask for
-- a single subject, which is how the `/endless?topic=<slug>` route reads: the
-- scope is one optional argument, and the weighting still applies within it.
--
-- The old two-argument function is dropped rather than overloaded, so there is
-- exactly one `get_endless_batch` and no ambiguous call.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.get_endless_batch(integer, uuid[]);

-- ---------------------------------------------------------------------------
-- get_endless_batch
--
-- Up to `p_limit` fresh questions, weighted toward the player's stronger
-- topics, plus their current progress. `p_exclude` carries the ids already seen
-- this session so the stream does not repeat itself. `p_topic_id` scopes the
-- pool to a single subject; NULL keeps the whole catalogue in play.
-- ---------------------------------------------------------------------------
create or replace function public.get_endless_batch(
  p_limit integer default 10,
  p_exclude uuid[] default array[]::uuid[],
  p_topic_id uuid default null
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
      -- A scoped stream only offers the chosen subject.
      and (p_topic_id is null or qz.topic_id = p_topic_id)
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

comment on function public.get_endless_batch(integer, uuid[], uuid) is
  'A weighted random batch of playable questions plus the caller''s per-topic progress. Pass p_topic_id to scope the batch to one subject.';

grant execute on function public.get_endless_batch(integer, uuid[], uuid)
  to anon, authenticated;
