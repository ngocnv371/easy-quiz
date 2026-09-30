import { useState } from 'react'
import { Coins, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import {
  generateQuestions,
  describeProvider,
  AiCreditsExhaustedError,
  type AiGenerateInput,
  type AiQuestion,
} from '@/features/ai/ai-assist'
import { useAuth } from '@/features/auth/auth-context'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import type { QuizDifficulty } from '@/lib/domain'

export interface AiBrief {
  topic: string
  level: string
  difficulty: QuizDifficulty
  count: number
  notes: string
}

const DEFAULT_BRIEF: AiBrief = {
  topic: '',
  level: '',
  difficulty: 'medium',
  count: 10,
  notes: '',
}

/**
 * AI Assist: the teacher writes a brief, the model returns questions that can
 * be appended to the draft. Nothing is written to the database here — the
 * questions land in the editor first, where a human still has the last word.
 */
export function AiAssistPanel({
  onApply,
  onClose,
}: {
  /** Appends (or replaces) the draft's questions with what the model produced. */
  onApply: (questions: AiQuestion[], mode: 'append' | 'replace') => void
  onClose: () => void
}) {
  const { profile, refreshProfile } = useAuth()
  const credits = profile?.ai_credits ?? 0

  const [brief, setBrief] = useState<AiBrief>(DEFAULT_BRIEF)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ questions: AiQuestion[]; provider: string } | null>(
    null,
  )

  const update = <K extends keyof AiBrief>(key: K, value: AiBrief[K]) =>
    setBrief((previous) => ({ ...previous, [key]: value }))

  const handleGenerate = async () => {
    if (brief.topic.trim().length < 3) {
      setError('Hãy mô tả chủ đề ít nhất 3 ký tự.')
      return
    }

    setLoading(true)
    setError(null)
    setPreview(null)

    try {
      const input: AiGenerateInput = {
        topic: brief.topic.trim(),
        level: brief.level.trim() || null,
        difficulty: brief.difficulty,
        count: brief.count,
        notes: brief.notes.trim() || null,
      }

      const result = await generateQuestions(input)
      setPreview(result)
      toast.success(`AI đã soạn ${result.questions.length} câu hỏi.`)
      // The server has already spent the credits; pull the new balance so the
      // header badge reflects it.
      void refreshProfile()
    } catch (generateError) {
      const message =
        generateError instanceof Error ? generateError.message : 'Không gọi được AI Assist.'
      setError(message)
      toast.error(message)
      // The local balance may be stale (another tab spent the last credit);
      // pull the real one so the panel stops offering a doomed retry.
      if (generateError instanceof AiCreditsExhaustedError) void refreshProfile()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-spark-400/30 bg-spark-400/4 rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-spark-300 inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden />
            AI Assist
          </p>
          <p className="text-ink-300 mt-1 text-xs leading-relaxed">
            Mô tả thứ bạn muốn kiểm tra. AI sẽ soạn câu hỏi kèm đáp án và lời giải — bạn vẫn là
            người duyệt cuối cùng.
          </p>

          <div className="mt-3">
            <Badge tone={credits > 0 ? 'spark' : 'wrong'} icon={Coins}>
              {credits > 0 ? `Còn ${credits} credit` : 'Hết credit'}
            </Badge>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose}>
          Đóng
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Chủ đề"
          htmlFor="ai-topic"
          required
          className="sm:col-span-2"
          hint="Càng cụ thể, câu hỏi càng sát ý bạn."
        >
          <Textarea
            id="ai-topic"
            rows={2}
            value={brief.topic}
            onChange={(event) => update('topic', event.target.value)}
            placeholder="Ví dụ: Ôn tập lịch sử Việt Nam lớp 9, giai đoạn 1945–1975"
          />
        </Field>

        <Field label="Đối tượng" htmlFor="ai-level" hint="Ví dụ: lớp 9, sinh viên năm 2…">
          <Input
            id="ai-level"
            value={brief.level}
            onChange={(event) => update('level', event.target.value)}
            placeholder="Lớp 9"
          />
        </Field>

        <Field label="Độ khó" htmlFor="ai-difficulty">
          <Select
            id="ai-difficulty"
            value={brief.difficulty}
            onChange={(event) => update('difficulty', event.target.value as QuizDifficulty)}
          >
            {(['easy', 'medium', 'hard'] as const).map((value) => (
              <option key={value} value={value}>
                {DIFFICULTY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Số câu hỏi" htmlFor="ai-count">
          <Select
            id="ai-count"
            value={String(brief.count)}
            onChange={(event) => update('count', Number.parseInt(event.target.value, 10))}
          >
            {[5, 8, 10, 12, 15, 20].map((value) => (
              <option key={value} value={value}>
                {value} câu
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Yêu cầu thêm" htmlFor="ai-notes" hint="Không bắt buộc">
          <Input
            id="ai-notes"
            value={brief.notes}
            onChange={(event) => update('notes', event.target.value)}
            placeholder="Tập trung vào mốc thời gian"
          />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="spark" onClick={handleGenerate} loading={loading} disabled={credits <= 0}>
          {loading ? null : <Wand2 className="size-4" aria-hidden />}
          {loading ? 'Đang soạn…' : 'Soạn câu hỏi'}
        </Button>

        {loading ? (
          <span className="text-ink-400 inline-flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Thường mất vài giây
          </span>
        ) : null}
      </div>

      {credits <= 0 ? (
        <Alert tone="warning" icon={Coins} title="Bạn đã dùng hết credit AI" className="mt-4">
          Mỗi lần soạn đề tiêu tốn một credit. Hãy nạp thêm credit để tiếp tục dùng AI Assist.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" title="Không tạo được câu hỏi" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {preview ? (
        <div className="border-ink-600/60 mt-5 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-100 text-sm font-medium">
              Xem trước {preview.questions.length} câu hỏi
            </p>
            <Badge tone="violet">{describeProvider(preview.provider)}</Badge>
          </div>

          <ol className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {preview.questions.map((question, index) => (
              <li
                key={`${question.prompt}-${index}`}
                className="border-ink-600/60 bg-ink-900/50 rounded-xl border p-3.5"
              >
                <p className="text-ink-100 text-sm font-medium">
                  <span className="text-ink-400 mr-2 tabular-nums">{index + 1}.</span>
                  {question.prompt}
                </p>

                <ul className="mt-2 space-y-1">
                  {question.options.map((option, optionIndex) => (
                    <li
                      key={`${option}-${optionIndex}`}
                      className={
                        optionIndex === question.correct_index
                          ? 'text-correct-300 text-xs'
                          : 'text-ink-400 text-xs'
                      }
                    >
                      {optionIndex === question.correct_index ? '✓' : '·'} {option}
                    </li>
                  ))}
                </ul>

                {question.explanation ? (
                  <p className="text-ink-400 mt-2 text-xs italic">{question.explanation}</p>
                ) : null}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                onApply(preview.questions, 'append')
                toast.success('Đã thêm vào bản nháp.')
              }}
            >
              Thêm vào bản nháp
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                onApply(preview.questions, 'replace')
                toast.success('Đã thay toàn bộ câu hỏi.')
              }}
            >
              Thay toàn bộ câu hỏi
            </Button>

            <Button variant="ghost" onClick={() => setPreview(null)}>
              Bỏ xem trước
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
