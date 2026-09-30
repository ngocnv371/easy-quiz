import { requireSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import {
  asDifficulty,
  asStatus,
  asVisibility,
  toQuizCard,
  type Json,
  type QuizCard,
  type QuizDraft,
  type QuizDraftQuestion,
  type QuestionRow,
  type OptionRow,
  type SaveQuizResult,
} from '@/lib/domain'

/** Every quiz the signed-in teacher owns, drafts included. */
export async function fetchMyQuizzes(ownerId: string): Promise<QuizCard[]> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('quiz_cards')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(toQuizCard)
}

export interface QuizEditDocument {
  card: QuizCard
  draft: QuizDraft
}

/**
 * Loads a quiz into the editor's document shape. Tables rather than the view,
 * because the editor needs questions and options — which the `quiz_cards` read
 * model deliberately does not carry.
 */
export async function fetchQuizForEdit(quizId: string): Promise<QuizEditDocument | null> {
  const supabase = requireSupabase()

  const { data: quiz, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .maybeSingle()

  if (error) throw new Error(errorMessage(error))
  if (!quiz) return null

  const [{ data: cardData }, { data: questionData, error: questionError }] = await Promise.all([
    supabase.from('quiz_cards').select('*').eq('id', quizId).maybeSingle(),
    supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('position', { ascending: true }),
  ])

  if (questionError) throw new Error(errorMessage(questionError))

  const questions = (questionData ?? []) as QuestionRow[]
  const questionIds = questions.map((question) => question.id)

  let options: OptionRow[] = []
  if (questionIds.length > 0) {
    const { data: optionData, error: optionError } = await supabase
      .from('options')
      .select('*')
      .in('question_id', questionIds)
      .order('position', { ascending: true })

    if (optionError) throw new Error(errorMessage(optionError))
    options = (optionData ?? []) as OptionRow[]
  }

  const draftQuestions: QuizDraftQuestion[] = questions.map((question) => ({
    prompt: question.prompt,
    explanation: question.explanation ?? '',
    points: question.points,
    time_limit_seconds: question.time_limit_seconds,
    options: options
      .filter((option) => option.question_id === question.id)
      .map((option) => ({ label: option.label, is_correct: option.is_correct })),
  }))

  return {
    card: toQuizCard(
      cardData ?? {
        // The view row is missing only if RLS hid it, which cannot happen for
        // an owner. Fall back to the table row so the editor still opens.
        ...quiz,
        topic_slug: null,
        topic_name: null,
        topic_emoji: null,
        topic_accent: null,
        author_username: null,
        author_name: null,
        author_avatar: null,
        question_count: questions.length,
        max_score: 0,
        attempt_count: 0,
      },
    ),
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
      questions: draftQuestions.length > 0 ? draftQuestions : [],
    },
  }
}

/**
 * One atomic write for the whole editor document. Publishing is validated
 * server-side, so the error messages that reach the user are the real rules.
 *
 * `aiGenerated` is only honoured when the quiz is created — the database keeps
 * the original provenance of a quiz rather than letting a later edit rewrite it.
 */
export async function saveQuiz(
  draft: QuizDraft,
  aiGenerated = false,
): Promise<SaveQuizResult> {
  const supabase = requireSupabase()

  const payload = {
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
      prompt: question.prompt,
      explanation: question.explanation,
      points: question.points,
      time_limit_seconds: question.time_limit_seconds,
      options: question.options.map((option) => ({
        label: option.label,
        is_correct: option.is_correct,
      })),
    })),
  } as unknown as Json

  const { data, error } = await supabase.rpc('save_quiz', { p_payload: payload })

  if (error) throw new Error(errorMessage(error))
  if (!data) throw new Error('Không lưu được đề thi.')

  return data as unknown as SaveQuizResult
}

export async function updateQuizStatus(
  quizId: string,
  patch: { status?: QuizCard['status']; visibility?: QuizCard['visibility'] },
): Promise<void> {
  const supabase = requireSupabase()

  const { error } = await supabase.from('quizzes').update(patch).eq('id', quizId)
  if (error) throw new Error(errorMessage(error))
}

export async function deleteQuiz(quizId: string): Promise<void> {
  const supabase = requireSupabase()

  const { error } = await supabase.from('quizzes').delete().eq('id', quizId)
  if (error) throw new Error(errorMessage(error))
}

/** Aggregate stats for the teacher dashboard. */
export interface TeacherStats {
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
): TeacherStats {
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

/** Recent attempts across everything this teacher owns. */
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

  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .in('quiz_id', quizIds)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(errorMessage(error))

  return (data ?? []).map((row) => ({
    attempt_id: row.attempt_id ?? '',
    quiz_id: row.quiz_id ?? '',
    quiz_title: row.quiz_title ?? '',
    display_name: row.display_name ?? 'Người chơi ẩn danh',
    avatar_emoji: row.avatar_emoji ?? '🎓',
    score: row.score ?? 0,
    max_score: row.max_score ?? 0,
    accuracy: row.accuracy ?? 0,
    completed_at: row.completed_at ?? '',
  }))
}
