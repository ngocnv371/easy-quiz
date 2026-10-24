import { api } from '@/lib/api'

export interface ImportSkippedRow {
  row: number
  reason: string
}

/** What `import-questions` reports after a run. */
export interface ImportQuestionsResult {
  /** Subjects (topics) upserted. */
  subjects: number
  /** New quizzes created — a re-import updates the existing one instead. */
  quizzes: number
  /** Questions written across every subject. */
  questions: number
  /** Data rows the parser looked at, valid or not. */
  total_rows: number
  /** Up to 50 rejected rows, with a reason each. */
  skipped: ImportSkippedRow[]
  /** How many rows were rejected in total. */
  skipped_total: number
  filename: string | null
}

/**
 * Sends a CSV to the Worker's importer (`worker/import.ts`).
 *
 * The file is parsed and validated on the server, so the browser never holds
 * the rules; only the raw text travels. The caller must be an admin — the
 * function returns a friendly Vietnamese message otherwise.
 */
export async function importQuestionsCsv(
  csv: string,
  filename?: string,
): Promise<ImportQuestionsResult> {
  const payload = await api<Partial<ImportQuestionsResult> | null>('manage/import', {
    method: 'POST',
    body: { csv, filename: filename ?? null },
  })

  if (!payload) throw new Error('Máy chủ không trả về kết quả nhập.')

  return {
    subjects: payload.subjects ?? 0,
    quizzes: payload.quizzes ?? 0,
    questions: payload.questions ?? 0,
    total_rows: payload.total_rows ?? 0,
    skipped: Array.isArray(payload.skipped) ? payload.skipped : [],
    skipped_total: payload.skipped_total ?? 0,
    filename: payload.filename ?? null,
  }
}

/** Header row the edge function understands, for the downloadable template. */
export const IMPORT_TEMPLATE_HEADER =
  'subject,type,prompt,option_a,option_b,option_c,option_d,correct,explanation'

export const IMPORT_TEMPLATE_CSV = `${IMPORT_TEMPLATE_HEADER}
Toán học,single,"Kết quả của phép tính 2^5 bằng bao nhiêu?",16,32,64,25,B,"2^5 = 2 × 2 × 2 × 2 × 2 = 32."
Toán học,true_false,"Xét các số 21, 27, 29, 33.",21 là số nguyên tố,29 là số nguyên tố,27 chia hết cho 9,33 chia hết cho 2,"B,C","29 chỉ chia hết cho 1 và chính nó; 27 = 3 × 9."
Toán học,short_answer,"Viết phân số 1/4 dưới dạng số thập phân.",0.25,,,,,"1 : 4 = 0,25."
Lịch sử,single,"Cách mạng tháng Tám thành công vào năm nào?",1944,1945,1946,1954,B,"Ngày 19/8/1945, khởi nghĩa giành thắng lợi ở Hà Nội."
`
