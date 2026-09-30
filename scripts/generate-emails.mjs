#!/usr/bin/env node
/**
 * Renders `supabase/templates/*.html` — the auth and security-notification
 * emails Supabase Auth sends — from one shared shell.
 *
 * GoTrue renders these files as plain Go templates, so an email cannot import a
 * stylesheet or share a partial: every one has to be a complete, self-contained
 * HTML document with inline styles. Thirteen near-identical copies kept in sync
 * by hand is exactly the drift this script exists to prevent.
 *
 * The palette mirrors `src/remotion/theme.ts` (which in turn mirrors the
 * `@theme` tokens in `src/styles/globals.css`) for the same reason it does
 * there — email clients have no access to our CSS custom properties, and the
 * brand gradient is approximated with a solid `background-color` fallback
 * because Outlook and several webmail clients drop `linear-gradient`.
 *
 * Subjects live in `supabase/config.toml`, not here; keep the two in step.
 *
 *   npm run emails:gen
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(projectRoot, 'supabase/templates')

/** Mirrors the `@theme` tokens in `src/styles/globals.css`. */
const COLORS = {
  ink950: '#04060f',
  ink900: '#080b18',
  ink800: '#0d1224',
  ink700: '#171d32',
  ink600: '#262e49',
  ink500: '#3c4665',
  ink400: '#5a658a',
  ink300: '#7d88a8',
  ink200: '#a9b2cc',
  ink100: '#d5daea',
  ink50: '#eef1f8',

  neon300: '#67e8f9',
  neon400: '#22d3ee',
  violet300: '#c4b5fd',
  violet600: '#7c3aed',
  magenta400: '#f472b6',

  spark400: '#fbbf24',
  correct400: '#34d399',
  wrong400: '#fb7185',
}

/** Gradient mid-stop — the violet the brand ramp pivots on. */
const VIOLET = '#a78bfa'

/**
 * The app loads Space Grotesk / Inter / JetBrains Mono over the network; email
 * has no such guarantee, so every stack ends in a font the client already has.
 */
const FONT_SANS = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
const FONT_DISPLAY = "'Space Grotesk', Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
const FONT_MONO = "'JetBrains Mono', Consolas, Menlo, 'Courier New', monospace"

const SITE_URL = 'https://easyquiz.aitechx.vn'
const BRAND_URL = 'https://aitechx.vn'
const YEAR = new Date().getFullYear()

const BRAND_GRADIENT = `linear-gradient(100deg, ${COLORS.neon300} 0%, ${VIOLET} 55%, ${COLORS.magenta400} 100%)`
const BUTTON_GRADIENT = `linear-gradient(100deg, ${COLORS.neon300} 0%, ${VIOLET} 100%)`

const REASON_SECURITY =
  'Đây là thông báo bảo mật tự động từ Easy Quiz. Bạn nhận được email vì thao tác này liên quan đến tài khoản dùng địa chỉ này.'
const REASON_CONTACT = `Nếu không phải bạn, hãy đặt lại mật khẩu và liên hệ <a href="${BRAND_URL}" style="color:${COLORS.neon300};text-decoration:none;">AiTechX</a> ngay.`

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** The hidden preview line clients surface next to the subject. */
function preheader(text) {
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${COLORS.ink950};">${text}</div>`
}

/** The header lockup: the question-mark tile plus the Easy Quiz wordmark. */
function brandLockup() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="34" height="34" align="center" valign="middle" bgcolor="${COLORS.violet600}" style="width:34px;height:34px;border-radius:11px;background-color:${COLORS.violet600};background-image:${BRAND_GRADIENT};font-family:${FONT_DISPLAY};font-size:19px;line-height:34px;font-weight:700;color:${COLORS.ink950};">?</td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:11px;vertical-align:middle;font-family:${FONT_DISPLAY};font-size:19px;font-weight:600;letter-spacing:-0.2px;color:${COLORS.ink50};">Easy<span style="color:${COLORS.spark400};"> Quiz</span></td>
                </tr>
              </table>`
}

function heading(text) {
  return `<h1 class="heading" style="margin:0 0 14px;font-family:${FONT_DISPLAY};font-size:26px;line-height:1.28;font-weight:600;letter-spacing:-0.4px;color:${COLORS.ink50};">${text}</h1>`
}

/** Body copy. `text` may contain markup. */
function paragraph(text) {
  return `<p class="text" style="margin:0 0 16px;font-family:${FONT_SANS};font-size:15px;line-height:1.65;color:${COLORS.ink200};">${text}</p>`
}

/** Inline emphasis for values quoted inside body copy. */
function strong(text) {
  return `<strong style="color:${COLORS.ink50};font-weight:600;">${text}</strong>`
}

/** The primary call to action — a table cell, so the padding survives Outlook. */
function button({ label, href }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr>
                  <td align="center" bgcolor="${COLORS.neon400}" style="border-radius:12px;background-color:${COLORS.neon400};background-image:${BUTTON_GRADIENT};">
                    <a class="button" href="${href}" style="display:inline-block;padding:14px 32px;font-family:${FONT_SANS};font-size:15px;font-weight:600;line-height:1.2;color:${COLORS.ink950};text-decoration:none;">${label}</a>
                  </td>
                </tr>
              </table>`
}

/** The raw link, for clients that strip or mangle the button. */
function linkFallback(href) {
  return `<p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:${COLORS.ink300};">Nếu nút không hoạt động, hãy dán liên kết dưới đây vào trình duyệt:</p>
              <p class="url" style="margin:0 0 22px;font-family:${FONT_MONO};font-size:12px;line-height:1.6;color:${COLORS.neon300};word-break:break-all;">${href}</p>`
}

/** A one-time passcode, set large and wide-tracked so it is easy to retype. */
function codeBlock(value) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
                <tr>
                  <td align="center" style="padding:16px;border:1px dashed ${COLORS.ink500};border-radius:12px;background-color:${COLORS.ink700};font-family:${FONT_MONO};font-size:26px;font-weight:700;letter-spacing:8px;color:${COLORS.spark400};">${value}</td>
                </tr>
              </table>`
}

/** A single labelled value — "Phương thức: totp". */
function detailBox(label, value) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
                <tr>
                  <td style="padding:14px 16px;border:1px solid ${COLORS.ink600};border-radius:12px;background-color:${COLORS.ink700};">
                    <div style="font-family:${FONT_SANS};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.ink400};">${label}</div>
                    <div style="margin-top:5px;font-family:${FONT_MONO};font-size:15px;color:${COLORS.ink50};">${value}</div>
                  </td>
                </tr>
              </table>`
}

/** A before/after pair, used by the "… was changed" notifications. */
function changeTable(before, after) {
  const cell = (label, value, extra) =>
    `<td class="stack-cell" width="50%" valign="top" style="width:50%;padding:14px 16px;border:1px solid ${COLORS.ink600};border-radius:${extra.radius};background-color:${COLORS.ink700};${extra.side}">
                      <div style="font-family:${FONT_SANS};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.ink400};">${label}</div>
                      <div style="margin-top:5px;font-family:${FONT_MONO};font-size:14px;line-height:1.5;color:${extra.color};word-break:break-all;">${value}</div>
                    </td>`

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="stack" style="margin:0 0 22px;">
                <tr>
                  ${cell('Trước', before, { radius: '12px 0 0 12px', side: `border-right:0;`, color: COLORS.ink300 })}
                  ${cell('Sau', after, { radius: '0 12px 12px 0', side: `border-left-color:${COLORS.violet600};`, color: COLORS.ink50 })}
                </tr>
              </table>`
}

/**
 * A tinted aside. `tone` picks the left rule: `warning` for "if this wasn't
 * you", `success` for a finished action, `info` otherwise.
 */
function callout(text, tone = 'warning') {
  const accent =
    tone === 'warning' ? COLORS.wrong400 : tone === 'success' ? COLORS.correct400 : COLORS.neon300

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
                <tr>
                  <td style="padding:14px 16px;border-left:3px solid ${accent};border-radius:8px;background-color:${COLORS.ink700};">
                    <p style="margin:0;font-family:${FONT_SANS};font-size:14px;line-height:1.6;color:${COLORS.ink100};">${text}</p>
                  </td>
                </tr>
              </table>`
}

function footer({ reason }) {
  return `<p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:${COLORS.ink400};">${reason}</p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${COLORS.ink500};">
                <a href="${SITE_URL}" style="color:${COLORS.neon300};text-decoration:none;">Easy Quiz</a> — một sản phẩm của
                <a href="${BRAND_URL}" style="color:${COLORS.ink300};text-decoration:none;">AiTechX</a>.<br />
                © ${YEAR} AiTechX.
              </p>`
}

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

function renderShell({ title, preview, content, reason }) {
  return `<!doctype html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>${title}</title>
    <!--
      Generated by scripts/generate-emails.mjs — edit that, not this file.
      Supabase Auth renders these as Go templates, so the {{ … }} placeholders
      below are filled in by GoTrue, not by the generator.
    -->
    <!--[if mso]>
      <style>
        body, table, td, h1, p, a, div { font-family: Arial, Helvetica, sans-serif !important; }
      </style>
    <![endif]-->
    <style>
      html,
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
      }
      table {
        border-collapse: collapse;
      }
      a {
        text-decoration: none;
      }
      @media (max-width: 620px) {
        .card {
          width: 100% !important;
          border-left: 0 !important;
          border-right: 0 !important;
          border-radius: 0 !important;
        }
        .pad {
          padding-left: 22px !important;
          padding-right: 22px !important;
        }
        .heading {
          font-size: 22px !important;
        }
        .stack,
        .stack > tbody > tr,
        .stack > tbody > tr > .stack-cell {
          display: block !important;
          width: 100% !important;
        }
        .stack-cell {
          border-radius: 12px !important;
          border: 1px solid ${COLORS.ink600} !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.ink950};">
    ${preheader(preview)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.ink950};">
      <tr>
        <td align="center" style="padding:38px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="card" style="width:600px;max-width:600px;background-color:${COLORS.ink800};border:1px solid ${COLORS.ink600};border-radius:18px;">
            <tr>
              <td height="4" style="height:4px;line-height:4px;font-size:0;border-radius:18px 18px 0 0;background-color:${VIOLET};background-image:${BRAND_GRADIENT};">&nbsp;</td>
            </tr>
            <tr>
              <td class="pad" style="padding:28px 40px 4px;">${brandLockup()}</td>
            </tr>
            <tr>
              <td class="pad" style="padding:22px 40px 30px;">${content}</td>
            </tr>
            <tr>
              <td class="pad" style="padding:20px 40px 26px;border-top:1px solid ${COLORS.ink600};background-color:${COLORS.ink900};border-radius:0 0 18px 18px;">
                ${footer({ reason })}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Every entry becomes one file in `supabase/templates/`. `subject` is listed
 * for reference only — it is configured in `supabase/config.toml`.
 */
const TEMPLATES = [
  // ---- Authentication -----------------------------------------------------
  {
    file: 'confirmation.html',
    subject: 'Xác nhận email của bạn — Easy Quiz',
    title: 'Xác nhận email của bạn',
    preview: 'Một bước nữa là bạn đã sẵn sàng chơi và lưu điểm.',
    reason:
      'Bạn nhận được email này vì có người dùng địa chỉ này để tạo tài khoản Easy Quiz.',
    content:
      heading('Xác nhận email của bạn') +
      paragraph(
        `Chào bạn, cảm ơn bạn đã tạo tài khoản ${strong('Easy Quiz')}. Bấm nút bên dưới để xác nhận địa chỉ email và hoàn tất đăng ký.`,
      ) +
      button({ label: 'Xác nhận email', href: '{{ .ConfirmationURL }}' }) +
      linkFallback('{{ .ConfirmationURL }}') +
      paragraph('Hoặc nhập mã này trên trang xác nhận:') +
      codeBlock('{{ .Token }}') +
      callout(
        'Liên kết và mã chỉ dùng được một lần, sau đó sẽ hết hạn để bảo vệ tài khoản của bạn.',
        'info',
      ),
  },
  {
    file: 'invite.html',
    subject: 'Bạn được mời tham gia Easy Quiz',
    title: 'Bạn được mời tham gia Easy Quiz',
    preview: 'Lời mời tạo tài khoản Easy Quiz đang chờ bạn.',
    reason: 'Bạn nhận được email này vì địa chỉ này được mời tham gia Easy Quiz.',
    content:
      heading('Bạn được mời tham gia Easy Quiz') +
      paragraph(
        `Bạn vừa được mời tạo tài khoản trên ${strong('Easy Quiz')} — nền tảng trắc nghiệm của AiTechX. Bấm nút bên dưới để chấp nhận lời mời và thiết lập tài khoản.`,
      ) +
      button({ label: 'Chấp nhận lời mời', href: '{{ .ConfirmationURL }}' }) +
      linkFallback('{{ .ConfirmationURL }}') +
      callout(
        'Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email — không cần làm gì thêm.',
        'info',
      ),
  },
  {
    file: 'magic_link.html',
    subject: 'Liên kết đăng nhập của bạn — Easy Quiz',
    title: 'Đăng nhập vào Easy Quiz',
    preview: 'Bấm để đăng nhập Easy Quiz, không cần mật khẩu.',
    reason:
      'Bạn nhận được email này vì có yêu cầu đăng nhập bằng liên kết một lần cho tài khoản dùng địa chỉ này.',
    content:
      heading('Đăng nhập vào Easy Quiz') +
      paragraph(
        'Bấm nút bên dưới để đăng nhập. Liên kết này đăng nhập thẳng vào tài khoản dùng địa chỉ này — không cần mật khẩu.',
      ) +
      button({ label: 'Đăng nhập', href: '{{ .ConfirmationURL }}' }) +
      linkFallback('{{ .ConfirmationURL }}') +
      paragraph('Hoặc nhập mã này trên trang đăng nhập:') +
      codeBlock('{{ .Token }}') +
      callout(
        `Không chia sẻ liên kết hay mã này với bất kỳ ai. Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email — không ai đăng nhập được nếu bạn không bấm vào liên kết.`,
        'warning',
      ),
  },
  {
    file: 'recovery.html',
    subject: 'Đặt lại mật khẩu Easy Quiz',
    title: 'Đặt lại mật khẩu',
    preview: 'Ai đó vừa yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
    reason:
      'Bạn nhận được email này vì có yêu cầu đặt lại mật khẩu cho tài khoản Easy Quiz dùng địa chỉ này.',
    content:
      heading('Đặt lại mật khẩu') +
      paragraph(
        `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${strong('{{ .Email }}')}. Bấm nút bên dưới để chọn mật khẩu mới.`,
      ) +
      button({ label: 'Đặt lại mật khẩu', href: '{{ .ConfirmationURL }}' }) +
      linkFallback('{{ .ConfirmationURL }}') +
      paragraph('Hoặc nhập mã này trên trang đặt lại mật khẩu:') +
      codeBlock('{{ .Token }}') +
      callout(
        'Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.',
        'warning',
      ),
  },
  {
    file: 'email_change.html',
    subject: 'Xác nhận địa chỉ email mới — Easy Quiz',
    title: 'Xác nhận email mới',
    preview: 'Xác nhận để hoàn tất đổi địa chỉ email.',
    reason:
      'Bạn nhận được email này vì có yêu cầu thay đổi địa chỉ email của tài khoản Easy Quiz.',
    content:
      heading('Xác nhận email mới') +
      paragraph(
        `Bạn đang yêu cầu đổi địa chỉ email của tài khoản Easy Quiz thành ${strong('{{ .NewEmail }}')}. Bấm nút bên dưới để xác nhận và hoàn tất.`,
      ) +
      button({ label: 'Xác nhận email mới', href: '{{ .ConfirmationURL }}' }) +
      linkFallback('{{ .ConfirmationURL }}') +
      callout(
        'Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua email — địa chỉ email vẫn giữ nguyên.',
        'warning',
      ),
  },
  {
    file: 'reauthentication.html',
    subject: 'Mã xác thực của bạn — Easy Quiz',
    title: 'Mã xác thực của bạn',
    preview: 'Dùng mã này để xác nhận danh tính cho thao tác sắp tới.',
    reason:
      'Bạn nhận được email này vì có yêu cầu xác thực lại cho một thao tác quan trọng trên Easy Quiz.',
    content:
      heading('Mã xác thực của bạn') +
      paragraph(
        'Dùng mã dưới đây để xác nhận danh tính cho thao tác sắp tới trên tài khoản Easy Quiz của bạn.',
      ) +
      codeBlock('{{ .Token }}') +
      callout(
        'Mã chỉ dùng được một lần và sẽ hết hạn sau ít phút. Không chia sẻ mã với bất kỳ ai.',
        'info',
      ),
  },

  // ---- Security notifications ---------------------------------------------
  {
    file: 'password_changed_notification.html',
    subject: 'Mật khẩu của bạn đã được thay đổi — Easy Quiz',
    title: 'Mật khẩu đã được thay đổi',
    preview: 'Mật khẩu tài khoản Easy Quiz vừa được cập nhật.',
    reason: REASON_SECURITY,
    content:
      heading('Mật khẩu đã được thay đổi') +
      paragraph('Mật khẩu cho tài khoản Easy Quiz của bạn vừa được thay đổi thành công.') +
      callout('Nếu đây là bạn, không cần làm gì thêm.', 'success') +
      callout(`Nếu bạn không đổi mật khẩu, hãy đặt lại mật khẩu ngay. ${REASON_CONTACT}`, 'warning'),
  },
  {
    file: 'email_changed_notification.html',
    subject: 'Địa chỉ email của bạn đã được thay đổi — Easy Quiz',
    title: 'Địa chỉ email đã được thay đổi',
    preview: 'Địa chỉ email gắn với tài khoản của bạn vừa thay đổi.',
    reason: REASON_SECURITY,
    content:
      heading('Địa chỉ email đã được thay đổi') +
      paragraph('Địa chỉ email dùng để đăng nhập Easy Quiz vừa được cập nhật.') +
      changeTable('{{ .OldEmail }}', '{{ .Email }}') +
      callout(
        `Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay để khôi phục tài khoản. ${REASON_CONTACT}`,
        'warning',
      ),
  },
  {
    file: 'phone_changed_notification.html',
    subject: 'Số điện thoại của bạn đã được thay đổi — Easy Quiz',
    title: 'Số điện thoại đã được thay đổi',
    preview: 'Số điện thoại gắn với tài khoản của bạn vừa thay đổi.',
    reason: REASON_SECURITY,
    content:
      heading('Số điện thoại đã được thay đổi') +
      paragraph('Số điện thoại gắn với tài khoản Easy Quiz vừa được cập nhật.') +
      changeTable('{{ .OldPhone }}', '{{ .Phone }}') +
      callout(
        `Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay để bảo vệ tài khoản. ${REASON_CONTACT}`,
        'warning',
      ),
  },
  {
    file: 'mfa_factor_enrolled_notification.html',
    subject: 'Đã thêm một phương thức xác thực — Easy Quiz',
    title: 'Đã thêm một phương thức xác thực',
    preview: 'Một phương thức xác thực mới vừa được thêm vào tài khoản của bạn.',
    reason: REASON_SECURITY,
    content:
      heading('Đã thêm một phương thức xác thực') +
      paragraph('Một phương thức xác thực mới vừa được thêm vào tài khoản Easy Quiz của bạn.') +
      detailBox('Phương thức', '{{ .FactorType }}') +
      callout(
        `Nếu bạn không thêm phương thức này, hãy liên hệ ngay để gỡ nó khỏi tài khoản. ${REASON_CONTACT}`,
        'warning',
      ),
  },
  {
    file: 'mfa_factor_unenrolled_notification.html',
    subject: 'Đã gỡ một phương thức xác thực — Easy Quiz',
    title: 'Đã gỡ một phương thức xác thực',
    preview: 'Một phương thức xác thực vừa được gỡ khỏi tài khoản của bạn.',
    reason: REASON_SECURITY,
    content:
      heading('Đã gỡ một phương thức xác thực') +
      paragraph('Một phương thức xác thực vừa được gỡ khỏi tài khoản Easy Quiz của bạn.') +
      detailBox('Phương thức', '{{ .FactorType }}') +
      callout(
        `Nếu bạn không gỡ phương thức này, hãy liên hệ ngay — tài khoản của bạn có thể đang bị truy cập trái phép. ${REASON_CONTACT}`,
        'warning',
      ),
  },
  {
    file: 'identity_linked_notification.html',
    subject: 'Đã liên kết một cách đăng nhập — Easy Quiz',
    title: 'Đã liên kết một cách đăng nhập',
    preview: 'Một cách đăng nhập mới vừa được liên kết với tài khoản của bạn.',
    reason: REASON_SECURITY,
    content:
      heading('Đã liên kết một cách đăng nhập') +
      paragraph(
        `Tài khoản ${strong('{{ .Provider }}')} vừa được liên kết làm cách đăng nhập cho ${strong('{{ .Email }}')}.`,
      ) +
      detailBox('Nhà cung cấp', '{{ .Provider }}') +
      callout(
        `Nếu bạn không liên kết phương thức này, hãy liên hệ ngay để gỡ nó khỏi tài khoản. ${REASON_CONTACT}`,
        'warning',
      ),
  },
  {
    file: 'identity_unlinked_notification.html',
    subject: 'Đã gỡ một cách đăng nhập — Easy Quiz',
    title: 'Đã gỡ một cách đăng nhập',
    preview: 'Một cách đăng nhập vừa được gỡ khỏi tài khoản của bạn.',
    reason: REASON_SECURITY,
    content:
      heading('Đã gỡ một cách đăng nhập') +
      paragraph(
        `Tài khoản ${strong('{{ .Provider }}')} không còn là cách đăng nhập của ${strong('{{ .Email }}')}.`,
      ) +
      detailBox('Nhà cung cấp', '{{ .Provider }}') +
      callout(
        `Nếu bạn không gỡ phương thức này, hãy liên hệ ngay — tài khoản của bạn có thể đang bị truy cập trái phép. ${REASON_CONTACT}`,
        'warning',
      ),
  },
]

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(outputDir, { recursive: true })

for (const template of TEMPLATES) {
  const html = renderShell({
    title: template.title,
    preview: template.preview,
    content: template.content,
    reason: template.reason,
  })
  writeFileSync(resolve(outputDir, template.file), html, 'utf8')
}

console.log(`Đã ghi ${TEMPLATES.length} mẫu email vào supabase/templates/.`)
