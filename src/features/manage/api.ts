import { api, apiOrNull, query } from '@/lib/api'
import {
  asDifficulty,
  asQuestionKind,
  asStatus,
  asVisibility,
  toLeaderboardEntry,
  toQuizCard,
  type AttemptAnswerRow,
  type AttemptRow,
  type LeaderboardEntryRow,
  type QuizCard,
  type QuizCardRow,
  type QuizDraft,
  type QuizDraftQuestion,
  type QuestionRow,
  type OptionRow,
  type ProfileRow,
  type QuizRow,
  type SaveQuizResult,
} from '@/lib/domain'
import { buildQuizReport, buildWrongAnswerIndex, type QuizReport, type WrongAnswerIndex } from './report'

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
  totalPlays: number
  totalAttempts: number
  averageAccuracy: number
}

export function summariseQuizzes(
  quizzes: QuizCard[],
  entries: Array<{ accuracy: number }> = [],
): AdminStats {
  const published = quizzes.filter((quiz) => quiz.status === 'published')

  return {
    quizCount: quizzes.length,
    publishedCount: published.length,
    draftCount: quizzes.filter((quiz) => quiz.status === 'draft').length,
    totalPlays: quizzes.reduce((sum, quiz) => sum + quiz.play_count, 0),
    totalAttempts: quizzes.reduce((sum, quiz) => sum + quiz.attempt_count, 0),
    averageAccuracy:
      entries.length === 0
        ? 0
        : entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length,
  }
}

/** Recent attempts across everything this admin owns. */
export async function fetchAttemptsForOwner(
  quizIds: string[],
  limit = 25,
): Promise<
  Array<{
    attempt_id: string
    quiz_id: string
    quiz_title: string
    display_name: string
    avatar_emoji: string
    score: number
    max_score: number
    accuracy: number
    completed_at: string
  }>
> {
  if (quizIds.length === 0) return []

  const rows = await api<LeaderboardEntryRow[]>(`manage/attempts${query({ limit })}`)

  return rows.map(toLeaderboardEntry).map((row) => ({
    attempt_id: row.attempt_id,
    quiz_id: row.quiz_id,
    quiz_title: row.quiz_title,
    display_name: row.display_name,
    avatar_emoji: row.avatar_emoji,
    score: row.score,
    max_score: row.max_score,
    accuracy: row.accuracy,
    completed_at: row.completed_at,
  }))
}

export interface QuizReportDocument {
  card: QuizCard
  report: QuizReport
  /** Question id → the players who got it wrong, for the follow-up modal. */
  wrongAnswers: WrongAnswerIndex
}

interface ReportResponse {
  card: QuizCardRow
  attempts: AttemptRow[]
  questions: QuestionRow[]
  answers: AttemptAnswerRow[]
  profiles: ProfileRow[]
}

/**
 * Everything the performance report needs for one quiz: the owner's attempts,
 * questions, answers and the players' names, plus the pure aggregation in
 * `buildQuizReport()`. `null` when the quiz is not the caller's.
 */
export async function fetchQuizReport(quizId: string): Promise<QuizReportDocument | null> {
  const doc = await apiOrNull<ReportResponse>(`manage/quizzes/${quizId}/report`)
  if (!doc) return null

  const { attempts, questions, answers, profiles } = doc

  return {
    card: toQuizCard(doc.card),
    report: buildQuizReport({ attempts, questions, answers }),
    wrongAnswers: buildWrongAnswerIndex({ attempts, answers, profiles }),
  }
}
