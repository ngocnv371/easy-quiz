// Account emails through Resend (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY (local dev) the email is only logged, link included, so you can click it.
import type { Env } from './env.ts'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// The site's palette (src/styles/globals.css @theme). Mail clients drop <style> variables and
// often gradients, so everything is inline, laid out with tables, with a plain colour under each gradient.
const C = {
  page: '#04060f', card: '#0d1224', foot: '#080b18', line: '#262e49', text: '#eef1f8', body: '#a9b2cc',
  muted: '#7d88a8', faint: '#5a658a', neon: '#67e8f9', cyan: '#22d3ee', violet: '#a78bfa', spark: '#fbbf24',
}
const GRADIENT = `linear-gradient(100deg, ${C.neon} 0%, ${C.violet} 55%, #f472b6 100%)`
const SANS = `Inter, 'Segoe UI', Helvetica, Arial, sans-serif`
const DISPLAY = `'Space Grotesk', ${SANS}`

const KINDS = {
  verify: {
    subject: 'Xác nhận email của bạn — Easy Quiz',
    heading: 'Xác nhận email của bạn',
    preview: 'Một bước nữa là bạn đã sẵn sàng chơi và lưu điểm.',
    intro: 'Chào bạn, cảm ơn bạn đã tạo tài khoản Easy Quiz. Bấm nút bên dưới để xác nhận địa chỉ email và hoàn tất đăng ký.',
    button: 'Xác nhận email',
    why: 'Bạn nhận được email này vì có người dùng địa chỉ này để tạo tài khoản Easy Quiz. Nếu không phải bạn, cứ bỏ qua email này.',
  },
} as const

export type AccountEmailKind = keyof typeof KINDS

export function renderAccountEmail(kind: AccountEmailKind, url: string) {
  const k = KINDS[kind]
  const site = new URL(url).origin
  const text = `${k.intro}\n\n${url}\n\n${k.why}\n\n--\nEasy Quiz · ${site}`
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(k.subject)}</title></head>
<body style="margin:0;padding:0;background-color:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(k.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page}"><tr><td align="center" style="padding:38px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:${C.card};border:1px solid ${C.line};border-radius:18px">
<tr><td height="4" style="height:4px;line-height:4px;font-size:0;border-radius:18px 18px 0 0;background-color:${C.violet};background-image:${GRADIENT}">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 4px;font-family:${DISPLAY};font-size:19px;font-weight:600;color:${C.text}">Easy<span style="color:${C.spark}"> Quiz</span></td></tr>
<tr><td style="padding:22px 32px 30px">
<h1 style="margin:0 0 14px;font-family:${DISPLAY};font-size:24px;line-height:1.28;font-weight:600;color:${C.text}">${esc(k.heading)}</h1>
<p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.body}">${esc(k.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
<td align="center" bgcolor="${C.cyan}" style="border-radius:12px;background-color:${C.cyan};background-image:linear-gradient(100deg, ${C.neon} 0%, ${C.violet} 100%)">
<a href="${esc(url)}" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.page};text-decoration:none">${esc(k.button)}</a>
</td></tr></table>
<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">Nếu nút không hoạt động, hãy dán liên kết dưới đây vào trình duyệt:</p>
<p style="margin:0;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.6;word-break:break-all"><a href="${esc(url)}" style="color:${C.neon}">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:20px 32px 26px;border-top:1px solid ${C.line};background-color:${C.foot};border-radius:0 0 18px 18px">
<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.faint}">${esc(k.why)}</p>
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.faint}"><a href="${esc(site)}" style="color:${C.neon};text-decoration:none">Easy Quiz</a> — một sản phẩm của <a href="https://aitechx.vn" style="color:${C.muted};text-decoration:none">AiTechX</a>.</p>
</td></tr>
</table></td></tr></table>
</body></html>`
  return { subject: k.subject, html, text }
}

export async function sendAccountEmail(env: Env, { to, kind, url }: { to: string; kind: AccountEmailKind; url: string }) {
  const { subject, html, text } = renderAccountEmail(kind, url)
  if (!env.RESEND_API_KEY) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${to} subject="${subject}" link=${url}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
}
