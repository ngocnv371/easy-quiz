import { useRef, useState } from 'react'
import { CheckCircle2, FileDown, FileUp, ShieldAlert, TriangleAlert, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'

import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { Modal } from '@/components/ui/modal'
import { useAuth } from '@/features/auth/auth-context'
import {
  IMPORT_TEMPLATE_CSV,
  importQuestionsCsv,
  type ImportQuestionsResult,
} from '@/features/manage/import-questions'
import { errorMessage } from '@/lib/utils'

function downloadTemplate() {
  const blob = new Blob([`\uFEFF${IMPORT_TEMPLATE_CSV}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'mau-nhap-cau-hoi.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * Admin-only entry point for the bulk import.
 *
 * The button and the dialog are rendered only for an admin — but that is
 * courtesy, not security: the edge function and the RPC both re-check the
 * role, so hiding the button is never the thing standing in the way.
 */
export function ImportQuestionsButton({
  onImported,
  variant = 'outline',
  size = 'md',
}: {
  /** Called after a successful run so lists can refresh. */
  onImported?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  const { isAdmin } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportQuestionsResult | null>(null)

  if (!isAdmin) return null

  const reset = () => {
    setFile(null)
    setError(null)
    setResult(null)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const close = () => {
    setOpen(false)
    reset()
  }

  const pick = (next: File | null) => {
    setFile(next)
    setError(null)
    setResult(null)
  }

  const run = async () => {
    if (!file) {
      setError('Hãy chọn một tệp CSV trước.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const csv = await file.text()
      const summary = await importQuestionsCsv(csv, file.name)
      setResult(summary)
      toast.success(`Đã nhập ${summary.questions} câu hỏi cho ${summary.subjects} môn.`)
      onImported?.()
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <UploadCloud className="size-4" aria-hidden />
        Nhập câu hỏi
      </Button>

      <Modal
        open={open}
        onClose={close}
        icon={UploadCloud}
        tone="violet"
        title="Nhập ngân hàng câu hỏi"
        description="Tải lên một tệp CSV. Mỗi môn trở thành một đề thi riêng, và câu hỏi cũ của môn đó được thay bằng nội dung mới."
        footer={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-neon-300 hover:text-neon-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <FileDown className="size-3.5" aria-hidden />
              Tải tệp mẫu
            </button>

            <span>Tối đa 5.000 câu mỗi lần</span>
          </div>
        }
      >
        <div className="space-y-4 p-3 sm:p-4">
          <Alert tone="info" icon={ShieldAlert} title="Chỉ quản trị viên">
            Tệp được xử lý an toàn trên máy chủ. Cột bắt buộc:{' '}
            <code className="text-ink-100">subject</code>,{' '}
            <code className="text-ink-100">prompt</code>, và ít nhất hai cột lựa chọn{' '}
            <code className="text-ink-100">option_a</code>… Cột{' '}
            <code className="text-ink-100">correct</code> nhận chữ cái (A–D) hoặc số thứ tự,
            mặc định là A.
          </Alert>

          <Field
            label="Tệp CSV"
            htmlFor="import-csv"
            hint="Cột có thể dùng tiếng Việt: môn, câu hỏi, đáp án, giải thích…"
          >
            <input
              ref={inputRef}
              id="import-csv"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />

            <div className="border-ink-600/70 bg-ink-900/50 flex items-center gap-3 rounded-xl border border-dashed p-3">
              <span className="border-ink-600 bg-ink-800/70 flex size-10 shrink-0 items-center justify-center rounded-lg border">
                <FileUp className="text-neon-400 size-4" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink-100 truncate text-sm">
                  {file ? file.name : 'Chưa chọn tệp nào'}
                </p>
                <p className="text-ink-400 text-xs">
                  {file ? formatFileSize(file.size) : 'CSV, tối đa vài MB'}
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                {file ? 'Đổi tệp' : 'Chọn tệp'}
              </Button>
            </div>
          </Field>

          {error ? (
            <Alert tone="error" icon={TriangleAlert} title="Không nhập được">
              {error}
            </Alert>
          ) : null}

          {result ? (
            <Alert tone="success" icon={CheckCircle2} title="Nhập thành công">
              <ul className="space-y-0.5">
                <li>
                  {result.questions} câu hỏi · {result.subjects} môn
                </li>
                <li>
                  {result.quizzes > 0
                    ? `${result.quizzes} đề mới được tạo`
                    : 'Các đề hiện có đã được cập nhật'}
                </li>
                {result.skipped_total > 0 ? (
                  <li className="text-spark-300">
                    Bỏ qua {result.skipped_total} dòng không hợp lệ
                  </li>
                ) : null}
              </ul>

              {result.skipped.length > 0 ? (
                <ul className="text-ink-400 mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {result.skipped.map((entry) => (
                    <li key={entry.row}>
                      Dòng {entry.row}: {entry.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => void run()} loading={busy} disabled={!file}>
              {busy ? 'Đang nhập…' : 'Bắt đầu nhập'}
            </Button>

            {busy ? (
              <span className="text-ink-400 text-xs">Đang kiểm tra và ghi vào cơ sở dữ liệu…</span>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  )
}
