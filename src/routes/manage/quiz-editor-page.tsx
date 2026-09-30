import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { ChoiceTile, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field'
import { AiAssistPanel } from '@/features/manage/ai-assist-panel'
import { fetchQuizForEdit, saveQuiz } from '@/features/manage/api'
import { fetchTopics } from '@/features/quiz/api'
import type { AiQuestion } from '@/features/ai/ai-assist'
import { useAuth } from '@/features/auth/auth-context'
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  COVER_EMOJIS,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
} from '@/lib/labels'
import {
  emptyDraft,
  emptyQuestion,
  type QuizDifficulty,
  type QuizDraft,
  type QuizDraftQuestion,
  type QuizVisibility,
} from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { cn, errorMessage } from '@/lib/utils'

/** Turns an AI result into an editable draft question. */
function toDraftQuestion(question: AiQuestion): QuizDraftQuestion {
  return {
    prompt: question.prompt,
    explanation: question.explanation,
    points: 100,
    time_limit_seconds: null,
    options: question.options.map((label, index) => ({
      label,
      is_correct: index === question.correct_index,
    })),
  }
}

export function ManageQuizEditorPage() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const { isConfigured } = useAuth()

  const isNew = !quizId

  const existing = useAsyncData(
    `manage:editor:${quizId ?? 'new'}`,
    () => fetchQuizForEdit(quizId!),
    Boolean(quizId) && isConfigured,
  )

  const topics = useAsyncData('manage:topics', fetchTopics, isConfigured)

  const [draft, setDraft] = useState<QuizDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAi, setShowAi] = useState(false)
  const [aiTouched, setAiTouched] = useState(false)
  /** Index of the question whose editor is expanded, if any. */
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  // ── Initialise the document ────────────────────────────────────────────
  useEffect(() => {
    if (draft) return

    if (isNew) {
      setDraft(emptyDraft())
      return
    }

    if (existing.data) {
      setDraft(existing.data.draft)
      setDirty(false)
    }
  }, [draft, existing.data, isNew])

  const mutate = useCallback((updater: (current: QuizDraft) => QuizDraft) => {
    setDraft((current) => (current ? updater(current) : current))
    setDirty(true)
  }, [])

  // ── Metadata ───────────────────────────────────────────────────────────
  const patchMeta = useCallback(
    (patch: Partial<QuizDraft>) => mutate((current) => ({ ...current, ...patch })),
    [mutate],
  )

  // ── Questions ──────────────────────────────────────────────────────────
  const patchQuestion = useCallback(
    (index: number, patch: Partial<QuizDraftQuestion>) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.map((question, position) =>
          position === index ? { ...question, ...patch } : question,
        ),
      })),
    [mutate],
  )

  const setCorrectOption = useCallback(
    (questionIndex: number, optionIndex: number) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.map((question, position) =>
          position === questionIndex
            ? {
                ...question,
                options: question.options.map((option, index) => ({
                  ...option,
                  is_correct: index === optionIndex,
                })),
              }
            : question,
        ),
      })),
    [mutate],
  )

  const patchOptionLabel = useCallback(
    (questionIndex: number, optionIndex: number, label: string) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.map((question, position) =>
          position === questionIndex
            ? {
                ...question,
                options: question.options.map((option, index) =>
                  index === optionIndex ? { ...option, label } : option,
                ),
              }
            : question,
        ),
      })),
    [mutate],
  )

  const addOption = useCallback(
    (questionIndex: number) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.map((question, position) =>
          position === questionIndex
            ? { ...question, options: [...question.options, { label: '', is_correct: false }] }
            : question,
        ),
      })),
    [mutate],
  )

  const removeOption = useCallback(
    (questionIndex: number, optionIndex: number) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.map((question, position) => {
          if (position !== questionIndex) return question

          const options = question.options.filter((_, index) => index !== optionIndex)

          // Never leave a question without a key: promote the first option.
          const hasKey = options.some((option) => option.is_correct)
          return {
            ...question,
            options: hasKey
              ? options
              : options.map((option, index) => ({ ...option, is_correct: index === 0 })),
          }
        }),
      })),
    [mutate],
  )

  const addQuestion = useCallback(
    () =>
      mutate((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] })),
    [mutate],
  )

  const duplicateQuestion = useCallback(
    (index: number) =>
      mutate((current) => ({
        ...current,
        questions: [
          ...current.questions.slice(0, index + 1),
          structuredClone(current.questions[index]!),
          ...current.questions.slice(index + 1),
        ],
      })),
    [mutate],
  )

  const removeQuestion = useCallback(
    (index: number) =>
      mutate((current) => ({
        ...current,
        questions: current.questions.filter((_, position) => position !== index),
      })),
    [mutate],
  )

  const moveQuestion = useCallback(
    (index: number, delta: number) =>
      mutate((current) => {
        const target = index + delta
        if (target < 0 || target >= current.questions.length) return current

        const questions = [...current.questions]
        const [moved] = questions.splice(index, 1)
        questions.splice(target, 0, moved!)

        return { ...current, questions }
      }),
    [mutate],
  )

  // ── AI Assist ──────────────────────────────────────────────────────────
  const applyAi = useCallback(
    (questions: AiQuestion[], mode: 'append' | 'replace') => {
      const converted = questions.map(toDraftQuestion)

      mutate((current) => ({
        ...current,
        questions:
          mode === 'replace'
            ? converted
            : // Drop the blank starter question when the first AI batch lands.
              current.questions.every((question) => question.prompt.trim() === '')
              ? converted
              : [...current.questions, ...converted],
      }))

      setAiTouched(true)
      setShowAi(false)
    },
    [mutate],
  )

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (status: 'draft' | 'published') => {
      if (!draft) return

      setError(null)

      if (draft.title.trim().length < 3) {
        setError('Tiêu đề cần ít nhất 3 ký tự.')
        return
      }

      const filled = draft.questions.filter((question) => question.prompt.trim() !== '')

      if (filled.length === 0) {
        setError('Cần ít nhất một câu hỏi có nội dung.')
        return
      }

      if (status === 'published') {
        const broken = filled.findIndex(
          (question) =>
            question.options.filter((option) => option.label.trim() !== '').length < 2 ||
            question.options.filter((option) => option.is_correct && option.label.trim() !== '')
              .length !== 1,
        )

        if (broken >= 0) {
          setError(
            `Câu ${broken + 1} chưa hợp lệ: cần ít nhất 2 lựa chọn có nội dung và đúng 1 đáp án.`,
          )
          return
        }
      }

      setSaving(true)

      try {
        const result = await saveQuiz(
          {
            ...draft,
            status,
            questions: filled,
          },
          aiTouched,
        )

        setDirty(false)

        // Adopt the saved identity immediately: navigating to the new URL keeps
        // this component mounted, so the local document has to learn its id and
        // new status or the header would keep showing "Bản nháp".
        setDraft((current) =>
          current
            ? { ...current, id: result.id, slug: result.slug, status: result.status }
            : current,
        )

        toast.success(
          status === 'published' ? 'Đã xuất bản đề thi.' : 'Đã lưu bản nháp.',
        )

        if (isNew || draft.id !== result.id) {
          navigate(`/manage/quizzes/${result.id}`, { replace: true })
        } else {
          existing.reload()
        }
      } catch (saveError) {
        const message = errorMessage(saveError)
        setError(message)
        toast.error(message)
      } finally {
        setSaving(false)
      }
    },
    [draft, existing, isNew, navigate, aiTouched],
  )

  // ── Guard against losing work ──────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const totalPoints = useMemo(
    () => (draft?.questions ?? []).reduce((sum, question) => sum + question.points, 0),
    [draft],
  )

  // ── Render ─────────────────────────────────────────────────────────────

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 lg:p-10">
        <Alert tone="warning" title="Chưa kết nối Supabase">
          Cấu hình <code>.env.local</code> để dùng trình soạn thảo.
        </Alert>
      </div>
    )
  }

  if (!isNew && existing.loading) {
    return (
      <div className="p-6 lg:p-10">
        <Skeleton className="h-8 w-64" />
        <Card className="mt-6 space-y-4 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-48" />
        </Card>
      </div>
    )
  }

  if (!isNew && !existing.loading && !existing.data) {
    return (
      <div className="p-6 lg:p-10">
        <EmptyState
          icon={Eye}
          title="Không tìm thấy đề thi"
          description="Đề này có thể đã bị xoá, hoặc không thuộc tài khoản của bạn."
          action={<ButtonLink to="/manage/quizzes">Về danh sách đề</ButtonLink>}
        />
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="p-6 lg:p-10">
        <Skeleton className="h-8 w-64" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/manage/quizzes"
            className="text-ink-400 hover:text-neon-300 inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Đề thi của tôi
          </Link>

          <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight">
            {isNew ? 'Tạo đề thi mới' : draft.title || 'Đề thi chưa đặt tên'}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge tone={draft.status === 'published' ? 'correct' : 'neutral'}>
              {draft.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
            </Badge>
            <span className="text-ink-400 text-xs">
              {draft.questions.length} câu · {totalPoints} điểm tối đa
            </span>
            {dirty ? (
              <span className="text-spark-300 text-xs">• có thay đổi chưa lưu</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            loading={saving}
            onClick={() => void handleSave('draft')}
          >
            {saving ? null : <Save className="size-4" aria-hidden />}
            Lưu nháp
          </Button>

          <Button variant="spark" loading={saving} onClick={() => void handleSave('published')}>
            {saving ? null : <Rocket className="size-4" aria-hidden />}
            Xuất bản
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="error" className="mt-6">
          {error}
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* ── Questions ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-ink-50 text-lg font-semibold">Câu hỏi</h2>

            <div className="flex gap-2">
              <Button
                variant="spark"
                size="sm"
                onClick={() => setShowAi((open) => !open)}
              >
                <Wand2 className="size-3.5" aria-hidden />
                AI Assist
              </Button>

              <Button variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="size-3.5" aria-hidden />
                Thêm câu
              </Button>
            </div>
          </div>

          {showAi ? <AiAssistPanel onApply={applyAi} onClose={() => setShowAi(false)} /> : null}

          {aiTouched ? (
            <Alert tone="info" icon={Sparkles}>
              Một phần nội dung do AI soạn. Hãy đọc lại và chỉnh sửa trước khi xuất bản — bạn là
              người chịu trách nhiệm cuối cùng về đề thi.
            </Alert>
          ) : null}

          {draft.questions.length === 0 ? (
            <EmptyState
              icon={Wand2}
              title="Chưa có câu hỏi nào"
              description="Thêm thủ công, hoặc để AI Assist soạn một loạt câu hỏi từ mô tả ngắn."
              action={
                <Button size="sm" onClick={() => setShowAi(true)}>
                  <Wand2 className="size-3.5" aria-hidden />
                  Dùng AI Assist
                </Button>
              }
            />
          ) : (
            draft.questions.map((question, index) => {
              const isOpen = openIndex === index
              const optionCount = question.options.filter(
                (option) => option.label.trim() !== '',
              ).length

              return (
                <Card key={index} className="overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <span className="bg-ink-800 text-ink-300 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">
                      {index + 1}
                    </span>

                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={isOpen}
                    >
                      <p
                        className={cn(
                          'text-sm font-medium',
                          question.prompt.trim() === ''
                            ? 'text-ink-500 italic'
                            : 'text-ink-50',
                        )}
                      >
                        {question.prompt.trim() === ''
                          ? 'Chưa có nội dung câu hỏi'
                          : question.prompt}
                      </p>

                      <p className="text-ink-400 mt-1 text-xs">
                        {optionCount} lựa chọn · {question.points} điểm
                        {optionCount >= 2 ? '' : ' · cần thêm lựa chọn'}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label="Di chuyển lên"
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, -1)}
                        icon={ArrowUp}
                      />
                      <IconButton
                        label="Di chuyển xuống"
                        disabled={index === draft.questions.length - 1}
                        onClick={() => moveQuestion(index, 1)}
                        icon={ArrowDown}
                      />
                      <IconButton
                        label="Nhân bản câu hỏi"
                        onClick={() => duplicateQuestion(index)}
                        icon={Copy}
                      />
                      <IconButton
                        label="Xoá câu hỏi"
                        tone="wrong"
                        onClick={() => removeQuestion(index)}
                        icon={Trash2}
                      />
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="border-ink-600/60 space-y-5 border-t p-4">
                      <Field label="Nội dung câu hỏi" htmlFor={`prompt-${index}`} required>
                        <Textarea
                          id={`prompt-${index}`}
                          rows={2}
                          value={question.prompt}
                          onChange={(event) =>
                            patchQuestion(index, { prompt: event.target.value })
                          }
                          placeholder="Thủ đô của Việt Nam là thành phố nào?"
                        />
                      </Field>

                      <div>
                        <p className="text-ink-200 mb-2 text-xs font-medium tracking-wide">
                          Lựa chọn — chọn nút tròn để đánh dấu đáp án đúng
                        </p>

                        <div className="space-y-2">
                          {question.options.map((option, optionIndex) => (
                            <div key={optionIndex} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${index}`}
                                checked={option.is_correct}
                                onChange={() => setCorrectOption(index, optionIndex)}
                                aria-label={`Đáp án đúng cho câu ${index + 1}`}
                                className="accent-correct-400 size-4 shrink-0"
                              />

                              <Input
                                value={option.label}
                                onChange={(event) =>
                                  patchOptionLabel(index, optionIndex, event.target.value)
                                }
                                placeholder={`Lựa chọn ${optionIndex + 1}`}
                                className="flex-1"
                              />

                              <IconButton
                                label={`Xoá lựa chọn ${optionIndex + 1}`}
                                tone="wrong"
                                disabled={question.options.length <= 2}
                                onClick={() => removeOption(index, optionIndex)}
                                icon={Trash2}
                              />
                            </div>
                          ))}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => addOption(index)}
                        >
                          <Plus className="size-3.5" aria-hidden />
                          Thêm lựa chọn
                        </Button>
                      </div>

                      <Field
                        label="Lời giải"
                        htmlFor={`explanation-${index}`}
                        hint="Hiện cho học sinh sau khi nộp bài. Không bắt buộc."
                      >
                        <Textarea
                          id={`explanation-${index}`}
                          rows={2}
                          value={question.explanation}
                          onChange={(event) =>
                            patchQuestion(index, { explanation: event.target.value })
                          }
                          placeholder="Vì sao đáp án này đúng…"
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Điểm" htmlFor={`points-${index}`}>
                          <Input
                            id={`points-${index}`}
                            type="number"
                            min={0}
                            step={10}
                            value={question.points}
                            onChange={(event) =>
                              patchQuestion(index, {
                                points: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                              })
                            }
                          />
                        </Field>

                        <Field
                          label="Giới hạn thời gian riêng"
                          htmlFor={`time-${index}`}
                          hint="Để trống nếu dùng thời gian của cả bài."
                        >
                          <Input
                            id={`time-${index}`}
                            type="number"
                            min={0}
                            value={question.time_limit_seconds ?? ''}
                            onChange={(event) =>
                              patchQuestion(index, {
                                time_limit_seconds:
                                  event.target.value === ''
                                    ? null
                                    : Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </Card>
              )
            })
          )}

          {draft.questions.length > 0 ? (
            <Button variant="outline" onClick={addQuestion} className="w-full">
              <Plus className="size-4" aria-hidden />
              Thêm câu hỏi
            </Button>
          ) : null}
        </div>

        {/* ── Settings ──────────────────────────────────────────────── */}
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="space-y-5 p-5">
            <h2 className="font-display text-ink-50 text-lg font-semibold">Thông tin đề</h2>

            <Field label="Tiêu đề" htmlFor="quiz-title" required hint={`${draft.title.length}/120`}>
              <Input
                id="quiz-title"
                value={draft.title}
                onChange={(event) => patchMeta({ title: event.target.value.slice(0, 120) })}
                placeholder="Toán lớp 6 · Số tự nhiên"
              />
            </Field>

            <Field
              label="Mô tả"
              htmlFor="quiz-description"
              hint={`${draft.description.length}/600`}
            >
              <Textarea
                id="quiz-description"
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  patchMeta({ description: event.target.value.slice(0, 600) })
                }
                placeholder="Học sinh sẽ được kiểm tra những gì?"
              />
            </Field>

            <EmojiPicker
              label="Biểu tượng"
              value={draft.cover_emoji}
              onChange={(cover_emoji) => patchMeta({ cover_emoji })}
              options={COVER_EMOJIS}
            />

            <Field label="Chủ đề" htmlFor="quiz-topic">
              <Select
                id="quiz-topic"
                value={draft.topic_id ?? ''}
                onChange={(event) => patchMeta({ topic_id: event.target.value || null })}
              >
                <option value="">Chưa phân loại</option>
                {(topics.data ?? []).map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.emoji} {topic.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Thời gian làm bài"
              htmlFor="quiz-time"
              hint="Tính bằng giây. 0 = không giới hạn."
            >
              <Input
                id="quiz-time"
                type="number"
                min={0}
                step={30}
                value={draft.time_limit_seconds}
                onChange={(event) =>
                  patchMeta({
                    time_limit_seconds: Math.max(
                      0,
                      Number.parseInt(event.target.value, 10) || 0,
                    ),
                  })
                }
              />
            </Field>
          </Card>

          <Card className="space-y-5 p-5">
            <h2 className="font-display text-ink-50 text-lg font-semibold">Độ khó</h2>

            <div className="grid gap-3">
              {(['easy', 'medium', 'hard'] as const).map((value) => (
                <ChoiceTile
                  key={value}
                  name="difficulty"
                  value={value}
                  selected={draft.difficulty === value}
                  onSelect={() => patchMeta({ difficulty: value as QuizDifficulty })}
                  title={DIFFICULTY_LABELS[value]}
                  description={DIFFICULTY_DESCRIPTIONS[value]}
                />
              ))}
            </div>
          </Card>

          <Card className="space-y-5 p-5">
            <h2 className="font-display text-ink-50 text-lg font-semibold">Hiển thị</h2>

            <div className="grid gap-3">
              {(['public', 'unlisted', 'private'] as const).map((value) => (
                <ChoiceTile
                  key={value}
                  name="visibility"
                  value={value}
                  selected={draft.visibility === value}
                  onSelect={() => patchMeta({ visibility: value as QuizVisibility })}
                  title={VISIBILITY_LABELS[value]}
                  description={VISIBILITY_DESCRIPTIONS[value]}
                />
              ))}
            </div>

            <div className="border-ink-600/60 space-y-4 border-t pt-5">
              <Toggle
                id="shuffle-questions"
                checked={draft.shuffle_questions}
                onChange={(shuffle_questions) => patchMeta({ shuffle_questions })}
                label="Đảo thứ tự câu hỏi"
                description="Mỗi học sinh nhận một thứ tự khác nhau."
              />

              <Toggle
                id="shuffle-options"
                checked={draft.shuffle_options}
                onChange={(shuffle_options) => patchMeta({ shuffle_options })}
                label="Đảo thứ tự lựa chọn"
                description="Giảm việc nhìn bài của nhau."
              />
            </div>

            <div className="border-ink-600/60 flex flex-wrap gap-3 border-t pt-5">
              <Button
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => void handleSave('draft')}
              >
                Lưu nháp
              </Button>
              <Button
                variant="spark"
                size="sm"
                loading={saving}
                onClick={() => void handleSave('published')}
              >
                Xuất bản
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  icon: Icon,
  disabled,
  tone = 'default',
}: {
  label: string
  onClick: () => void
  icon: typeof ArrowUp
  disabled?: boolean
  tone?: 'default' | 'wrong'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'wrong'
          ? 'border-ink-600 text-wrong-300 hover:border-wrong-400/60 hover:bg-wrong-500/10'
          : 'border-ink-600 text-ink-300 hover:border-ink-500 hover:text-ink-100',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  )
}
