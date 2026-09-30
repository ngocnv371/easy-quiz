import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Eye,
  EyeOff,
  ListChecks,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/field'
import { QuizListRow } from '@/features/quiz/quiz-card-tile'
import { deleteQuiz, fetchMyQuizzes, updateQuizStatus } from '@/features/manage/api'
import { useAuth } from '@/features/auth/auth-context'
import { formatCompact } from '@/lib/format'
import type { QuizCard, QuizStatus } from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAsyncData } from '@/lib/use-async-data'
import { errorMessage } from '@/lib/utils'

type StatusFilter = QuizStatus | 'all'

export function ManageQuizListPage() {
  const { user, isConfigured } = useAuth()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const queries = useAsyncData(
    `manage:list:${user?.id ?? 'none'}`,
    () => fetchMyQuizzes(user!.id),
    Boolean(user?.id) && isConfigured,
  )

  const all = useMemo(() => queries.data ?? [], [queries.data])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return all.filter((quiz) => {
      if (status !== 'all' && quiz.status !== status) return false
      if (needle === '') return true
      return (
        quiz.title.toLowerCase().includes(needle) ||
        (quiz.description ?? '').toLowerCase().includes(needle) ||
        (quiz.topic_name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [all, search, status])

  const counts = useMemo(
    () => ({
      all: all.length,
      published: all.filter((quiz) => quiz.status === 'published').length,
      draft: all.filter((quiz) => quiz.status === 'draft').length,
      archived: all.filter((quiz) => quiz.status === 'archived').length,
    }),
    [all],
  )

  const togglePublished = async (quiz: QuizCard) => {
    setBusyId(quiz.id)

    try {
      if (quiz.status === 'published') {
        await updateQuizStatus(quiz.id, { status: 'draft' })
        toast.success('Đã ẩn đề khỏi thư viện.')
      } else {
        if (quiz.question_count === 0) {
          toast.error('Đề chưa có câu hỏi nào. Hãy thêm câu hỏi trước khi xuất bản.')
          return
        }
        await updateQuizStatus(quiz.id, { status: 'published' })
        toast.success('Đã xuất bản đề thi.')
      }

      queries.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (quiz: QuizCard) => {
    const confirmed = window.confirm(
      `Xoá vĩnh viễn "${quiz.title}"? Mọi câu hỏi và điểm số của đề này cũng bị xoá theo.`,
    )
    if (!confirmed) return

    setBusyId(quiz.id)

    try {
      await deleteQuiz(quiz.id)
      toast.success('Đã xoá đề thi.')
      queries.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6 lg:p-10">
        <Alert tone="warning" title="Chưa kết nối Supabase">
          Cấu hình <code>.env.local</code> để dùng trang quản lý.
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Đề thi của tôi
          </h1>
          <p className="text-ink-300 mt-2 text-sm">
            {counts.all} đề · {counts.published} đã xuất bản · {counts.draft} bản nháp
          </p>
        </div>

        <ButtonLink to="/manage/quizzes/new">
          <PlusCircle className="size-4" aria-hidden />
          Tạo đề mới
        </ButtonLink>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên, mô tả hoặc chủ đề…"
            aria-label="Tìm đề thi"
            className="pl-10"
          />
        </div>

        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label="Trạng thái"
          className="sm:w-52"
        >
          <option value="all">Tất cả ({counts.all})</option>
          <option value="published">Đã xuất bản ({counts.published})</option>
          <option value="draft">Bản nháp ({counts.draft})</option>
          <option value="archived">Lưu trữ ({counts.archived})</option>
        </Select>
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      <div className="mt-7 space-y-3">
        {queries.loading ? (
          Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            </Card>
          ))
        ) : queries.error ? (
          <EmptyState
            icon={ListChecks}
            title="Không tải được danh sách"
            description={queries.error}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={all.length === 0 ? 'Bạn chưa có đề thi nào' : 'Không có đề nào khớp'}
            description={
              all.length === 0
                ? 'Tạo đề đầu tiên, hoặc để AI Assist soạn giúp bạn 10 câu hỏi kèm đáp án.'
                : 'Thử từ khoá khác hoặc đổi bộ lọc trạng thái.'
            }
            action={
              all.length === 0 ? (
                <ButtonLink to="/manage/quizzes/new" size="sm">
                  Tạo đề mới
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          visible.map((quiz) => (
            <QuizListRow
              key={quiz.id}
              quiz={quiz}
              actions={
                <>
                  {quiz.status === 'published' ? (
                    <Link
                      to={`/q/${quiz.slug}`}
                      className="border-ink-600 text-ink-200 hover:border-neon-400/60 hover:text-neon-300 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
                    >
                      Xem
                    </Link>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    loading={busyId === quiz.id}
                    onClick={() => void togglePublished(quiz)}
                  >
                    {quiz.status === 'published' ? (
                      <>
                        <EyeOff className="size-3.5" aria-hidden />
                        Ẩn
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" aria-hidden />
                        Xuất bản
                      </>
                    )}
                  </Button>

                  <Link
                    to={`/manage/quizzes/${quiz.id}`}
                    className="border-ink-600 text-ink-200 hover:border-neon-400/60 hover:text-neon-300 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Sửa
                  </Link>

                  <Link
                    to={`/manage/quizzes/${quiz.id}/report`}
                    className="border-ink-600 text-ink-200 hover:border-neon-400/60 hover:text-neon-300 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
                  >
                    <BarChart3 className="size-3.5" aria-hidden />
                    Thống kê
                  </Link>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Xoá ${quiz.title}`}
                    disabled={busyId === quiz.id}
                    onClick={() => void remove(quiz)}
                  >
                    <Trash2 className="text-wrong-300 size-4" aria-hidden />
                  </Button>
                </>
              }
            />
          ))
        )}
      </div>

      {visible.length > 0 ? (
        <p className="text-ink-500 mt-6 text-xs">
          Tổng {visible.length} đề ·{' '}
          {formatCompact(visible.reduce((sum, quiz) => sum + quiz.attempt_count, 0))} lượt chơi
        </p>
      ) : null}
    </div>
  )
}
