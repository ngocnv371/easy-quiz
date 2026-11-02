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
  unlisted: 'Không công khai',
  public: 'Công khai',
}

export const VISIBILITY_DESCRIPTIONS: Record<QuizVisibility, string> = {
  private: 'Chỉ mình bạn thấy trong trang quản lý. Câu hỏi không vào chế độ vô tận.',
  unlisted: 'Như riêng tư: câu hỏi không vào chế độ vô tận. (Trước đây là chia sẻ bằng liên kết.)',
  public: 'Câu hỏi được đưa vào chế độ vô tận cho mọi người luyện.',
}

export const STATUS_LABELS: Record<QuizStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Người dùng',
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
