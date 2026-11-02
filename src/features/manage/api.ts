import { api, apiOrNull, query } from '@/lib/api'
import {
  asDifficulty,
  asQuestionKind,
  asStatus,
  asVisibility,
  toQuizCard,
  type QuizCard,
  type QuizCardRow,
  type QuizDraft,
  type QuizDraftQuestion,
  type QuestionRow,
  type OptionRow,
  type QuizRow,
  type SaveQuizResult,
} from '@/lib/domain'

/** Every quiz the signed-in admin owns, drafts included. */
export async function fetchMyQuizzes(_ownerId: string): Promise<QuizCard[]> {
  // The Worker scopes this to the session's own quizzes; the id only keys the cache.
  const rows = await api<QuizCardRow[]>('manage/quizzes')
  return rows.map(toQuizCard)
}

export interface QuizEditDocument {
  card: QuizCard
  draft: QuizDraft
}

interface EditResponse {
  quiz: QuizRow
  card: QuizCardRow
  questions: Array<Omit<QuestionRow, 'quiz_id' | 'created_at' | 'updated_at'> & { options: Omit<OptionRow, 'question_id'>[] }>
}

/**
 * Loads a quiz into the editor's document shape — questions and options
 * included, which the `QuizCard` read model deliberately does not carry.
 */
export async function fetchQuizForEdit(quizId: string): Promise<QuizEditDocument | null> {
  const doc = await apiOrNull<EditResponse>(`manage/quizzes/${quizId}`)
  if (!doc) return null

  const { quiz, questions } = doc

  const draftQuestions: QuizDraftQuestion[] = questions.map((question) => ({
    kind: asQuestionKind(question.kind),
    prompt: question.prompt,
    explanation: question.explanation ?? '',
    points: question.points,
    time_limit_seconds: question.time_limit_seconds,
    options: question.options.map((option) => ({ label: option.label, is_correct: option.is_correct })),
  }))

  return {
    card: toQuizCard(doc.card),
    draft: {
      id: quiz.id,
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description ?? '',
      cover_emoji: quiz.cover_emoji,
      topic_id: quiz.topic_id,
      // The table stores these as text with check constraints, so narrow them
      // back into the domain unions the editor works with.
      difficulty: asDifficulty(quiz.difficulty),
      visibility: asVisibility(quiz.visibility),
      status: asStatus(quiz.status),
      time_limit_seconds: quiz.time_limit_seconds,
      shuffle_questions: quiz.shuffle_questions,
      shuffle_options: quiz.shuffle_options,
      questions: draftQuestions,
    },
  }
}

/**
 * One atomic write for the whole editor document. Publishing is validated
 * server-side, so the error messages that reach the user are the real rules.
 *
 * `aiGenerated` is only honoured when the quiz is created — the server keeps
 * the original provenance of a quiz rather than letting a later edit rewrite it.
 */
export async function saveQuiz(
  draft: QuizDraft,
  aiGenerated = false,
): Promise<SaveQuizResult> {
  return api<SaveQuizResult>('manage/quizzes', {
    method: 'POST',
    body: {
      id: draft.id,
      // Only sent for an existing quiz: a new one lets the server derive it.
      slug: draft.slug,
      title: draft.title,
      description: draft.description,
      cover_emoji: draft.cover_emoji,
      topic_id: draft.topic_id,
      difficulty: draft.difficulty,
      visibility: draft.visibility,
      status: draft.status,
      time_limit_seconds: draft.time_limit_seconds,
      shuffle_questions: draft.shuffle_questions,
      shuffle_options: draft.shuffle_options,
      ai_generated: aiGenerated,
      questions: draft.questions.map((question) => ({
        kind: question.kind,
        prompt: question.prompt,
        explanation: question.explanation,
        points: question.points,
        time_limit_seconds: question.time_limit_seconds,
        options: question.options.map((option) => ({
          label: option.label,
          is_correct: option.is_correct,
        })),
      })),
    },
  })
}

export async function updateQuizStatus(
  quizId: string,
  patch: { status?: QuizCard['status']; visibility?: QuizCard['visibility'] },
): Promise<void> {
  await api(`manage/quizzes/${quizId}`, { method: 'PATCH', body: patch })
}

export async function deleteQuiz(quizId: string): Promise<void> {
  await api(`manage/quizzes/${quizId}`, { method: 'DELETE' })
}

/** Aggregate stats for the admin dashboard. */
export interface AdminStats {
  quizCount: number
  publishedCount: number
  draftCount: number
  questionCount: number
}

export function summariseQuizzes(quizzes: QuizCard[]): AdminStats {
  return {
    quizCount: quizzes.length,
    publishedCount: quizzes.filter((quiz) => quiz.status === 'published').length,
    draftCount: quizzes.filter((quiz) => quiz.status === 'draft').length,
    questionCount: quizzes.reduce((sum, quiz) => sum + quiz.question_count, 0),
  }
}

// ── Site-wide stats (worker/admin.ts) ───────────────────────────────────────
// Seeded leaderboard players are already left out by the Worker.

export interface SiteTotals {
  players: number
  accounts: number
  new_7d: number
  active_7d: number
  runs: number
  runs_7d: number
  endless_answers: number
  endless_answers_7d: number
  ad_free: number
  orders_paid: number
  orders_pending: number
  revenue_vnd: number
  revenue_7d_vnd: number
}

/** One Vietnam day, oldest first. */
export interface SiteDay {
  day: string
  new_players: number
  active_players: number
  runs: number
  endless_answers: number
}

export async function fetchSiteOverview(): Promise<{ totals: SiteTotals; daily: SiteDay[] }> {
  return api('manage/overview')
}

export interface SiteUser {
  id: string
  username: string
  display_name: string
  avatar_emoji: string
  role: string
  is_guest: boolean
  /** Null for a guest. */
  email: string | null
  created_at: string
  ad_free_at: string | null
  endless_runs: number
  endless_answers: number
  last_active: string | null
}

export type SiteUserSort = 'recent' | 'most' | 'new'

export async function fetchSiteUsers(search: string, sort: SiteUserSort, limit = 50): Promise<SiteUser[]> {
  return api(`manage/users${query({ search, sort, limit })}`)
}

export type SiteOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed'

export interface SiteOrder {
  order_code: number
  product_id: string
  product_name: string
  amount_vnd: number
  status: SiteOrderStatus
  provider: string
  created_at: string
  paid_at: string | null
  /** Null once the buyer's account is deleted; the order is kept. */
  user_id: string | null
  display_name: string | null
  username: string | null
  avatar_emoji: string | null
  email: string | null
}

export async function fetchSiteOrders(status: SiteOrderStatus | '', limit = 50): Promise<SiteOrder[]> {
  return api(`manage/orders${query({ status, limit })}`)
}
