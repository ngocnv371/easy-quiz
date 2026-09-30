import type { QuizDifficulty, QuizStatus, QuizVisibility, UserRole } from './domain'

/** Vietnamese labels for the enums stored in the database. */

export const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

export const DIFFICULTY_DESCRIPTIONS: Record<QuizDifficulty, string> = {
  easy: 'Nhớ lại và nhận biết',
  medium: 'Hiểu và vận dụng',
  hard: 'Phân tích và suy luận',
}

export const VISIBILITY_LABELS: Record<QuizVisibility, string> = {
  private: 'Riêng tư',
  unlisted: 'Chia sẻ bằng liên kết',
  public: 'Công khai',
}

export const VISIBILITY_DESCRIPTIONS: Record<QuizVisibility, string> = {
  private: 'Chỉ mình bạn thấy trong trang quản lý.',
  unlisted: 'Không hiện trên trang khám phá, ai có liên kết đều chơi được.',
  public: 'Hiện trên trang khám phá và bảng xếp hạng.',
}

export const STATUS_LABELS: Record<QuizStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  admin: 'Quản trị viên',
}

/** A curated emoji set for quiz covers and player avatars. */
export const COVER_EMOJIS = [
  '📝', '🔢', '🏛️', '🔬', '🔤', '📚', '🌏', '💻', '🌱',
  '⚗️', '🧪', '🧠', '🎯', '🧩', '🗺️', '⏳', '🎨', '🎵',
  '🏆', '🚀', '🌡️', '⚡', '🔭', '🌊',
] as const

export const AVATAR_EMOJIS = [
  '🎓', '🦊', '🐼', '🐨', '🦉', '🐙', '🦄', '🐝', '🦁',
  '🐬', '🦖', '🐳', '🌟', '🔥', '🌈', '⚡', '🍀', '🎈',
] as const

/**
 * Short, honest explanations of what each role can do — shown when a person
 * picks one at sign-up.
 */
export const ROLE_DESCRIPTIONS: Record<Exclude<UserRole, 'admin'>, string> = {
  student: 'Khám phá đề thi, chơi và leo bảng xếp hạng.',
  teacher: 'Tạo đề thi, dùng AI Assist và theo dõi học sinh.',
}
