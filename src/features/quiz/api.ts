import { toEnergyError, type EnergyState } from '@/features/energy/api'
import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import {
  toGlobalLeaderboardEntry,
  toLeaderboardEntry,
  toQuizCard,
  type AnswerSubmission,
  type GlobalLeaderboardEntry,
  type Json,
  type LeaderboardEntry,
  type PlayPayload,
  type QuizCard,
  type SubmitResult,
  type TopicRow,
} from '@/lib/domain'

export type QuizSort = 'new' | 'popular' | 'alphabetical'

export interface QuizQuery {
  topicSlug?: string | null
  /** Any of these topics — a whole grade or subject. Ignored when `topicSlug` is set. */
  topicSlugs?: string[] | null
  search?: string
  difficulty?: string | null
  sort?: QuizSort
  limit?: number
}

/** Escapes the characters that would break a PostgREST `or=` filter. */
function escapeFilterValue(value: string): string {
  return value.replace(/[%_,()\\]/g, (match) => `\\${match}`)
}

export async function fetchTopics(): Promise<TopicRow[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(errorMessage(error))
  return data ?? []
}

export async function fetchQuizCards(query: QuizQuery = {}): Promise<QuizCard[]> {
  const supabase = requireSupabase()
  const { topicSlug, topicSlugs, search, difficulty, sort = 'new', limit = 60 } = query

  let builder = supabase
    .from('quiz_cards')
    .select('*')
    .eq('status', 'published')
    .eq('visibility', 'public')

  if (topicSlug) builder = builder.eq('topic_slug', topicSlug)
  else if (topicSlugs) builder = builder.in('topic_slug', topicSlugs)
  if (difficulty) builder = builder.eq('difficulty', difficulty)

  const trimmed = search?.trim()
  if (trimmed) {
    const safe = escapeFilterValue(trimmed)
    builder = builder.or(
      `title.ilike.%${safe}%,description.ilike.%${safe}%,topic_name.ilike.%${safe}%`,
    )
  }

  switch (sort) {
    case 'popular':
      builder = builder.order('play_count', { ascending: false })
      break
    case 'alphabetical':
      builder = builder.order('title', { ascending: true })
      break
    default:
      builder = builder.order('published_at', { ascending: false, nullsFirst: false })
  }

  const { data, error } = await builder.limit(limit)

  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(toQuizCard)
}

export async function fetchQuizCardBySlug(slug: string): Promise<QuizCard | null> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('quiz_cards')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(errorMessage(error))
  return data ? toQuizCard(data) : null
}

/**
 * The playable payload. Returns `null` — rather than throwing — when the quiz
 * is not published or the slug does not exist, because "not playable" is a
 * normal outcome the caller renders as a friendly page.
 */
export async function fetchPlayPayload(slug: string): Promise<PlayPayload | null> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('get_quiz_for_play', { p_slug: slug })

  if (error) throw new Error(errorMessage(error))
  if (!data) return null

  return data as unknown as PlayPayload
}

export interface QuizTicket {
  ticket_id: string
  /** Energy charged for this start — one per question. */
  cost: number
  energy: EnergyState
}

/**
 * Pays for a run up front and returns the ticket `submitAttempt()` redeems.
 * Throws `OutOfEnergyError` when the quiz costs more than the player has.
 */
export async function startQuizAttempt(slug: string): Promise<QuizTicket> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('start_quiz_attempt', { p_slug: slug })

  if (error) throw toEnergyError(error)
  if (!data) throw new Error('Không nhận được phản hồi từ máy chủ.')

  return data as unknown as QuizTicket
}

export interface SubmitAttemptInput {
  slug: string
  answers: AnswerSubmission[]
  durationSeconds: number
  guestName?: string | null
  /** From `startQuizAttempt()`. The server refuses a submit without one. */
  ticketId: string | null
}

export async function submitAttempt({
  slug,
  answers,
  durationSeconds,
  guestName,
  ticketId,
}: SubmitAttemptInput): Promise<SubmitResult> {
  const supabase = requireSupabase()

  // The RPC argument is `jsonb`; the literal objects satisfy it, but TypeScript
  // will not widen an interface into an index signature automatically.
  const payload = answers.map((answer) => ({
    question_id: answer.question_id,
    option_id: answer.option_id,
    time_ms: Math.round(answer.time_ms),
  })) as unknown as Json

  const { data, error } = await supabase.rpc('submit_attempt', {
    p_slug: slug,
    p_answers: payload,
    p_duration_seconds: Math.round(durationSeconds),
    // Optional in the function signature; `undefined` lets the SQL default apply.
    p_guest_name: guestName ?? undefined,
    p_ticket_id: ticketId ?? undefined,
  })

  if (error) throw new Error(errorMessage(error))
  if (!data) throw new Error('Không nhận được kết quả từ máy chủ.')

  return data as unknown as SubmitResult
}

export async function fetchQuizLeaderboard(
  quizId: string,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('quiz_id', quizId)
    .order('score', { ascending: false })
    .order('duration_seconds', { ascending: true })
    .limit(limit)

  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(toLeaderboardEntry)
}

export async function fetchGlobalLeaderboard(limit = 50): Promise<GlobalLeaderboardEntry[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('global_leaderboard')
    .select('*')
    .order('total_score', { ascending: false })
    .order('avg_accuracy', { ascending: false })
    .limit(limit)

  if (error) throw new Error(errorMessage(error))

  return (data ?? [])
    .map(toGlobalLeaderboardEntry)
    .filter((entry): entry is GlobalLeaderboardEntry => entry !== null)
}

export async function fetchMyAttempts(
  userId: string,
  limit = 30,
): Promise<LeaderboardEntry[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(toLeaderboardEntry)
}

/** Used by the result page when it is opened without an in-memory payload. */
export async function fetchAttempt(
  attemptId: string,
): Promise<LeaderboardEntry | null> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('attempt_id', attemptId)
    .maybeSingle()

  if (error) throw new Error(errorMessage(error))
  return data ? toLeaderboardEntry(data) : null
}

/**
 * Best score a player already holds on a quiz, so the result screen can say
 * "phá kỷ lục" instead of just showing a number.
 */
export async function fetchPersonalBest(
  quizId: string,
  userId: string,
  excludeAttemptId?: string,
): Promise<number> {
  const supabase = requireSupabase()

  let builder = supabase
    .from('attempts')
    .select('score')
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)

  if (excludeAttemptId) builder = builder.neq('id', excludeAttemptId)

  const { data, error } = await builder

  if (error) return 0
  return data?.[0]?.score ?? 0
}
