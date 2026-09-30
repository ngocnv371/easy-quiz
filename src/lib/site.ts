const rawSiteUrl = import.meta.env.VITE_SITE_URL?.trim()

export const APP_NAME = 'Easy Quiz'
export const BRAND_NAME = 'AiTechX'
export const BRAND_URL = import.meta.env.VITE_BRAND_URL?.trim() || 'https://aitechx.vn'
export const SITE_URL = rawSiteUrl && rawSiteUrl !== '' ? rawSiteUrl : 'http://localhost:5173'

export const TAGLINE = 'Học vui, nhớ lâu'

export const APP_DESCRIPTION =
  'Khám phá đề trắc nghiệm theo chủ đề, chơi ngay không cần tài khoản, và leo bảng xếp hạng sau mỗi lượt. Giáo viên tạo đề nhanh gấp mười lần với AI Assist.'
