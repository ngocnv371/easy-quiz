/**
 * The boundary between the API and the app.
 *
 * Row shapes mirror the tables in `migrations/0002_app.sql` as the Worker
 * returns them (booleans already true/false). Read models can carry gaps — an
 * attempt whose player was deleted, a quiz without a topic — so they are
 * narrowed once, here, and the components work with shapes that say what is
 * actually guaranteed.
 */

/** Any JSON value. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ── Domain unions ──────────────────────────────────────────────────────────
export type TopicAccent = 'neon' | 'violet' | 'magenta' | 'spark' | 'lime'
export type UserRole = 'user' | 'admin'
export type QuizDifficulty = 'easy' | 'medium' | 'hard'
export type QuizVisibility = 'private' | 'unlisted' | 'public'
export type QuizStatus = 'draft' | 'published' | 'archived'
/**
 * What a question's options mean (worker/grading.ts grades them):
 *  · single — pick one option; exactly one is right
 *  · true_false — every option is a statement the player marks true or false
 *  · short_answer — the player types a word or number; the options are the
 *    accepted answers, so the play payload never carries them
 */
export type QuestionKind = 'single' | 'true_false' | 'short_answer'

// ── Raw rows ───────────────────────────────────────────────────────────────
export interface TopicRow {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string
  accent: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface ProfileRow {
  id: string
  username: string
  display_name: string
  avatar_emoji: string
  role: string
  is_guest: boolean
  organization: string | null
  bio: string | null
  /** Only on the signed-in player's own profile. */
  ai_credits?: number
  created_at: string
  updated_at: string
}

export interface QuizRow {
  id: string
  owner_id: string
  topic_id: string | null
  slug: string
  title: string
  description: string | null
  cover_emoji: string
  difficulty: string
  visibility: string
  status: string
  time_limit_seconds: number
  shuffle_questions: boolean
  shuffle_options: boolean
  ai_generated: boolean
  play_count: number
  published_at: string | null
  imported_at: string | null
  created_at: string
  updated_at: string
}

export interface QuestionRow {
  id: string
  quiz_id: string
  position: number
  kind: string
  prompt: string
  explanation: string | null
  points: number
  time_limit_seconds: number | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface OptionRow {
  id: string
  question_id: string
  position: number
  label: string
  is_correct: boolean
}

export interface AttemptRow {
  id: string
  quiz_id: string
  user_id: string | null
  guest_name: string | null
  score: number
  max_score: number
  correct_count: number
  question_count: number
  accuracy: number
  duration_seconds: number
  completed_at: string
}

export interface AttemptAnswerRow {
  attempt_id: string
  question_id: string
  option_id: string | null
  /** True/false marks as JSON, or the typed short answer; null for single choice. */
  response: string | null
  is_correct: boolean
  time_ms: number
}

type Nullable<T> = { [K in keyof T]: T[K] | null }

export type QuizCardRow = Nullable<Omit<QuizCard, 'topic_accent'>> & { topic_accent: string | null }
export type LeaderboardEntryRow = Nullable<LeaderboardEntry>
export type GlobalLeaderboardRow = Nullable<GlobalLeaderboardEntry>

// ── Guards ─────────────────────────────────────────────────────────────────
const DIFFICULTIES: readonly QuizDifficulty[] = ['easy', 'medium', 'hard']
const VISIBILITIES: readonly QuizVisibility[] = ['private', 'unlisted', 'public']
const STATUSES: readonly QuizStatus[] = ['draft', 'published', 'archived']
const ACCENTS: readonly TopicAccent[] = ['neon', 'violet', 'magenta', 'spark', 'lime']
const ROLES: readonly UserRole[] = ['user', 'admin']
const KINDS: readonly QuestionKind[] = ['single', 'true_false', 'short_answer']

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export const asDifficulty = (value: string | null): QuizDifficulty =>
  oneOf(DIFFICULTIES, value, 'medium')

export const asVisibility = (value: string | null): QuizVisibility =>
  oneOf(VISIBILITIES, value, 'private')

export const asStatus = (value: string | null): QuizStatus => oneOf(STATUSES, value, 'draft')

export const asRole = (value: string | null): UserRole => oneOf(ROLES, value, 'user')

export const asQuestionKind = (value: string | null): QuestionKind =>
  oneOf(KINDS, value, 'single')

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
  kind: QuestionKind
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

/**
 * What the player has given for one question so far. Only the field that fits
 * the question's kind is filled.
 */
export interface PlayerAnswer {
  option_id?: string
  /** True/false: option id → marked true. */
  marks?: Record<string, boolean>
  /** Short answer: the typed text. */
  text?: string
}

/** Whether an answer is complete enough to count as answered. */
export function isAnswered(question: PlayQuestion, answer: PlayerAnswer | undefined): boolean {
  if (!answer) return false
  if (question.kind === 'true_false') {
    return question.options.every((option) => typeof answer.marks?.[option.id] === 'boolean')
  }
  if (question.kind === 'short_answer') return (answer.text ?? '').trim() !== ''
  return Boolean(answer.option_id)
}

export interface AnswerSubmission {
  question_id: string
  option_id: string | null
  marks?: Record<string, boolean>
  text?: string
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
  kind: QuestionKind
  is_correct: boolean
  chosen_option_id: string | null
  /** True/false: what the player marked, option id → true. */
  marks: Record<string, boolean> | null
  /** Short answer: what the player typed. */
  text: string | null
  correct_option_id: string | null
  /** For a short answer, the accepted answers. */
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

// ── Endless mode ───────────────────────────────────────────────────────────
// `get_endless_batch()` and `grade_endless_answer()` return `jsonb`. A question
// carries the quiz and topic it came from so the player can see where they are
// in the catalogue, and so the UI can attribute mastery to a topic.

export interface EndlessTopic {
  id: string
  slug: string
  name: string
  emoji: string
  accent: TopicAccent
}

export interface EndlessQuestion {
  id: string
  prompt: string
  image_url: string | null
  points: number
  quiz: {
    id: string
    slug: string
    title: string
    cover_emoji: string
  }
  topic: EndlessTopic | null
  options: PlayOption[]
}

export interface EndlessTopicProgress {
  topic_id: string
  slug: string
  name: string
  emoji: string
  accent: string
  answered: number
  correct: number
  /** Correct answers as a percentage, 0–100, one decimal. */
  accuracy: number
}

export interface EndlessBatch {
  questions: EndlessQuestion[]
  progress: EndlessTopicProgress[]
}

/** A player's energy, as every energy-aware RPC reports it. */
export interface EnergyState {
  /** Free energy left today. Resets at midnight Vietnam time. */
  free: number
  /** Purchased energy. Never expires. */
  paid: number
  total: number
  daily_allowance: number
  /** ISO instant of the next free refill. */
  resets_at: string
  plus_until: string | null
  /** True while Plus is active: nothing is charged. */
  unlimited: boolean
}

export interface EndlessGrade {
  question_id: string
  option_id: string | null
  is_correct: boolean
  correct_option_id: string | null
  explanation: string | null
  topic: EndlessTopic | null
  /** Updated progress for this question's topic, or null when it has none. */
  progress: EndlessTopicProgress | null
  /** The balance after this answer's charge. */
  energy?: EnergyState | null
}

// One row of the separate Endless leaderboard, ranked by best session streak.
export interface EndlessLeaderboardEntry {
  user_id: string
  username: string
  display_name: string
  avatar_emoji: string
  is_guest: boolean
  best_streak: number
  best_correct: number
  session_count: number
  last_played_at: string
}

export function toEndlessLeaderboardEntry(row: EndlessLeaderboardEntry): EndlessLeaderboardEntry {
  return {
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name || 'Người chơi ẩn danh',
    avatar_emoji: row.avatar_emoji || '🎓',
    is_guest: row.is_guest ?? false,
    best_streak: row.best_streak,
    best_correct: row.best_correct,
    session_count: row.session_count,
    last_played_at: row.last_played_at,
  }
}


// ── Editor document ────────────────────────────────────────────────────────
export interface QuizDraftOption {
  label: string
  is_correct: boolean
}

export interface QuizDraftQuestion {
  kind: QuestionKind
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

export function emptyQuestion(kind: QuestionKind = 'single'): QuizDraftQuestion {
  return {
    kind,
    prompt: '',
    explanation: '',
    points: 1,
    time_limit_seconds: null,
    options:
      kind === 'short_answer'
        ? [{ label: '', is_correct: true }]
        : Array.from({ length: 4 }, (_, index) => ({
            label: '',
            is_correct: kind === 'single' && index === 0,
          })),
  }
}

/**
 * The same question as another kind, keeping what still makes sense: the
 * statements carry over between single and true/false, and only the right
 * answers become accepted short answers.
 */
export function convertQuestion(question: QuizDraftQuestion, kind: QuestionKind): QuizDraftQuestion {
  if (kind === question.kind) return question

  if (kind === 'short_answer') {
    const accepted = question.options.filter((option) => option.is_correct && option.label.trim() !== '')
    return {
      ...question,
      kind,
      options: accepted.length > 0 ? accepted : [{ label: '', is_correct: true }],
    }
  }

  let options = question.options
  if (question.kind === 'short_answer') {
    // Accepted answers are all "right": start from them, padded to a full set.
    options = [...options, ...Array.from({ length: Math.max(0, 4 - options.length) }, () => ({ label: '', is_correct: false }))]
    options = options.map((option, index) => ({ ...option, is_correct: index === 0 }))
  }
  if (kind === 'single') {
    if (options.length < 2) options = [...options, { label: '', is_correct: false }]
    const keyAt = Math.max(0, options.findIndex((option) => option.is_correct))
    options = options.map((option, index) => ({ ...option, is_correct: index === keyAt }))
  }

  return { ...question, kind, options }
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
