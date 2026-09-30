/**
 * The boundary between the database and the app.
 *
 * `database.types.ts` is generated and types every view column as nullable
 * (PostgreSQL does not record NOT NULL on views). Rather than sprinkle `??`
 * through the UI, the rows are narrowed once, here, and the components work
 * with shapes that say what is actually guaranteed.
 */

import type { Database, Json } from './database.types'

export type { Database, Json }

// ── Domain unions ──────────────────────────────────────────────────────────
export type TopicAccent = 'neon' | 'violet' | 'magenta' | 'spark' | 'lime'
export type UserRole = 'student' | 'teacher' | 'admin'
export type QuizDifficulty = 'easy' | 'medium' | 'hard'
export type QuizVisibility = 'private' | 'unlisted' | 'public'
export type QuizStatus = 'draft' | 'published' | 'archived'

// ── Raw rows ───────────────────────────────────────────────────────────────
type Tables = Database['public']['Tables']
type Views = Database['public']['Views']

export type TopicRow = Tables['topics']['Row']
export type ProfileRow = Tables['profiles']['Row']
export type QuizRow = Tables['quizzes']['Row']
export type QuestionRow = Tables['questions']['Row']
export type OptionRow = Tables['options']['Row']
export type AttemptRow = Tables['attempts']['Row']
export type AttemptAnswerRow = Tables['attempt_answers']['Row']

export type QuizCardRow = Views['quiz_cards']['Row']
export type LeaderboardEntryRow = Views['leaderboard_entries']['Row']
export type GlobalLeaderboardRow = Views['global_leaderboard']['Row']

// ── Guards ─────────────────────────────────────────────────────────────────
const DIFFICULTIES: readonly QuizDifficulty[] = ['easy', 'medium', 'hard']
const VISIBILITIES: readonly QuizVisibility[] = ['private', 'unlisted', 'public']
const STATUSES: readonly QuizStatus[] = ['draft', 'published', 'archived']
const ACCENTS: readonly TopicAccent[] = ['neon', 'violet', 'magenta', 'spark', 'lime']
const ROLES: readonly UserRole[] = ['student', 'teacher', 'admin']

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export const asDifficulty = (value: string | null): QuizDifficulty =>
  oneOf(DIFFICULTIES, value, 'medium')

export const asVisibility = (value: string | null): QuizVisibility =>
  oneOf(VISIBILITIES, value, 'private')

export const asStatus = (value: string | null): QuizStatus => oneOf(STATUSES, value, 'draft')

export const asRole = (value: string | null): UserRole => oneOf(ROLES, value, 'student')

export const asAccent = (value: string | null): TopicAccent | null =>
  value && (ACCENTS as readonly string[]).includes(value) ? (value as TopicAccent) : null

// ── App-facing shapes ──────────────────────────────────────────────────────
export interface QuizCard {
  id: string
  slug: string
  title: string
  description: string | null
  cover_emoji: string
  difficulty: QuizDifficulty
  visibility: QuizVisibility
  status: QuizStatus
  time_limit_seconds: number
  play_count: number
  ai_generated: boolean
  owner_id: string
  topic_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  topic_slug: string | null
  topic_name: string | null
  topic_emoji: string | null
  topic_accent: TopicAccent | null
  author_username: string | null
  author_name: string | null
  author_avatar: string | null
  question_count: number
  max_score: number
  attempt_count: number
}

export function toQuizCard(row: QuizCardRow): QuizCard {
  return {
    id: row.id ?? '',
    slug: row.slug ?? '',
    title: row.title ?? 'Đề thi chưa đặt tên',
    description: row.description,
    cover_emoji: row.cover_emoji ?? '📝',
    difficulty: asDifficulty(row.difficulty),
    visibility: asVisibility(row.visibility),
    status: asStatus(row.status),
    time_limit_seconds: row.time_limit_seconds ?? 0,
    play_count: row.play_count ?? 0,
    ai_generated: row.ai_generated ?? false,
    owner_id: row.owner_id ?? '',
    topic_id: row.topic_id,
    published_at: row.published_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    topic_slug: row.topic_slug,
    topic_name: row.topic_name,
    topic_emoji: row.topic_emoji,
    topic_accent: asAccent(row.topic_accent),
    author_username: row.author_username,
    author_name: row.author_name,
    author_avatar: row.author_avatar,
    question_count: row.question_count ?? 0,
    max_score: row.max_score ?? 0,
    attempt_count: row.attempt_count ?? 0,
  }
}

export interface LeaderboardEntry {
  attempt_id: string
  quiz_id: string
  quiz_slug: string
  quiz_title: string
  cover_emoji: string
  topic_slug: string | null
  topic_name: string | null
  user_id: string | null
  display_name: string
  username: string | null
  avatar_emoji: string
  is_guest: boolean
  score: number
  max_score: number
  correct_count: number
  question_count: number
  accuracy: number
  duration_seconds: number
  completed_at: string
}

export function toLeaderboardEntry(row: LeaderboardEntryRow): LeaderboardEntry {
  return {
    attempt_id: row.attempt_id ?? '',
    quiz_id: row.quiz_id ?? '',
    quiz_slug: row.quiz_slug ?? '',
    quiz_title: row.quiz_title ?? '',
    cover_emoji: row.cover_emoji ?? '📝',
    topic_slug: row.topic_slug,
    topic_name: row.topic_name,
    user_id: row.user_id,
    display_name: row.display_name ?? 'Người chơi ẩn danh',
    username: row.username,
    avatar_emoji: row.avatar_emoji ?? '🎓',
    is_guest: row.is_guest ?? false,
    score: row.score ?? 0,
    max_score: row.max_score ?? 0,
    correct_count: row.correct_count ?? 0,
    question_count: row.question_count ?? 0,
    accuracy: row.accuracy ?? 0,
    duration_seconds: row.duration_seconds ?? 0,
    completed_at: row.completed_at ?? '',
  }
}

export interface GlobalLeaderboardEntry {
  user_id: string
  display_name: string
  username: string | null
  avatar_emoji: string
  is_guest: boolean
  total_score: number
  best_score: number
  attempt_count: number
  quiz_count: number
  avg_accuracy: number
  last_played_at: string | null
}

export function toGlobalLeaderboardEntry(
  row: GlobalLeaderboardRow,
): GlobalLeaderboardEntry | null {
  // The view filters out anonymous rows, so a null user_id should not occur —
  // dropping it keeps the type honest rather than inventing an id.
  if (!row.user_id) return null

  return {
    user_id: row.user_id,
    display_name: row.display_name ?? 'Người chơi ẩn danh',
    username: row.username,
    avatar_emoji: row.avatar_emoji ?? '🎓',
    is_guest: row.is_guest ?? false,
    total_score: row.total_score ?? 0,
    best_score: row.best_score ?? 0,
    attempt_count: row.attempt_count ?? 0,
    quiz_count: row.quiz_count ?? 0,
    avg_accuracy: row.avg_accuracy ?? 0,
    last_played_at: row.last_played_at,
  }
}

// ── Play payloads ──────────────────────────────────────────────────────────
// `get_quiz_for_play()` and `submit_attempt()` return `jsonb`, so the client
// casts once at the call site and stays typed from there on.

export interface PlayOption {
  id: string
  position: number
  label: string
}

export interface PlayQuestion {
  id: string
  position: number
  prompt: string
  points: number
  time_limit_seconds: number | null
  image_url: string | null
  options: PlayOption[]
}

export interface PlayQuiz {
  id: string
  slug: string
  title: string
  description: string | null
  cover_emoji: string
  difficulty: string
  time_limit_seconds: number
  shuffle_questions: boolean
  shuffle_options: boolean
  play_count: number
  topic: { slug: string; name: string; emoji: string; accent: string } | null
  author: { username: string; display_name: string; avatar_emoji: string } | null
}

export interface PlayPayload {
  quiz: PlayQuiz
  questions: PlayQuestion[]
}

export interface AnswerSubmission {
  question_id: string
  option_id: string | null
  time_ms: number
}

export interface ReviewOption {
  id: string
  position: number
  label: string
  is_correct: boolean
}

export interface ReviewItem {
  question_id: string
  position: number
  prompt: string
  explanation: string | null
  points: number
  is_correct: boolean
  chosen_option_id: string | null
  correct_option_id: string | null
  options: ReviewOption[]
}

export interface SubmitResult {
  attempt: AttemptRow
  quiz: { id: string; slug: string; title: string; cover_emoji: string }
  review: ReviewItem[]
}

export interface SaveQuizResult {
  id: string
  slug: string
  status: QuizStatus
  question_count: number
}

// ── Editor document ────────────────────────────────────────────────────────
export interface QuizDraftOption {
  label: string
  is_correct: boolean
}

export interface QuizDraftQuestion {
  prompt: string
  explanation: string
  points: number
  time_limit_seconds: number | null
  options: QuizDraftOption[]
}

export interface QuizDraft {
  id: string | null
  /**
   * The slug already stored for this quiz, if any.
   *
   * Sending it back keeps a public link stable when the author edits the title
   * — `save_quiz()` only derives a new slug when none is supplied.
   */
  slug: string | null
  title: string
  description: string
  cover_emoji: string
  topic_id: string | null
  difficulty: QuizDifficulty
  visibility: QuizVisibility
  status: QuizStatus
  time_limit_seconds: number
  shuffle_questions: boolean
  shuffle_options: boolean
  questions: QuizDraftQuestion[]
}

export function emptyQuestion(): QuizDraftQuestion {
  return {
    prompt: '',
    explanation: '',
    points: 100,
    time_limit_seconds: null,
    options: [
      { label: '', is_correct: true },
      { label: '', is_correct: false },
      { label: '', is_correct: false },
      { label: '', is_correct: false },
    ],
  }
}

export function emptyDraft(topicId: string | null = null): QuizDraft {
  return {
    id: null,
    slug: null,
    title: '',
    description: '',
    cover_emoji: '📝',
    topic_id: topicId,
    difficulty: 'medium',
    visibility: 'public',
    status: 'draft',
    time_limit_seconds: 0,
    shuffle_questions: true,
    shuffle_options: true,
    questions: [emptyQuestion()],
  }
}
