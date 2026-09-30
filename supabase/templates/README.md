# Email templates

The auth and security-notification emails Supabase Auth sends, styled to match
the app.

**Everything in this directory is generated.** Edit `scripts/generate-emails.mjs`
and re-run:

```sh
npm run emails:gen
```

The `.html` files are committed because Supabase reads them straight off disk —
they are an artifact, not a build product, the same way `public/sitemap.xml` is.

## Where things live

| Piece | Lives in |
| --- | --- |
| Markup, layout, brand palette | `scripts/generate-emails.mjs` |
| Subject lines | `supabase/config.toml` (`[auth.email.template.*]`) |
| Rendered templates | `supabase/templates/*.html` |

Subjects are in `config.toml` because GoTrue reads them from there, not from the
HTML — keep them in step with the generator when you change copy.

## Template types

**Authentication** (`[auth.email.template.<name>]`)

| File | Sent when |
| --- | --- |
| `confirmation.html` | a user signs up and must verify their address |
| `invite.html` | someone is invited to create an account |
| `magic_link.html` | a passwordless sign-in link or OTP is requested |
| `recovery.html` | a password reset is requested |
| `email_change.html` | a user asks to change their email address |
| `reauthentication.html` | a sensitive action needs re-verification |

**Security notifications** (`[auth.email.notification.<name>]`, opt-in via
`enabled = true`)

`password_changed`, `email_changed`, `phone_changed`, `mfa_factor_enrolled`,
`mfa_factor_unenrolled`, `identity_linked`, `identity_unlinked`.

## Previewing

GoTrue will not send real mail locally — it delivers to Inbucket on
<http://localhost:54424>. Sign up, reset a password or change an address and the
rendered email shows up there with the `{{ … }}` placeholders already filled in.

Rendering the `.html` files directly in a browser only shows the shell: the
Go-template placeholders are left literal.

## Applying to production

The hosted project cannot read this directory. After changing a template, copy
the rendered HTML **and** its subject into the dashboard's
[Email Templates](https://supabase.com/dashboard/project/_/auth/templates) page,
or PATCH it via the Management API
(`mailer_templates_<type>_content` / `mailer_subjects_<type>`).

## Notes

- The templates are Vietnamese-first, matching the app. `lang="vi"`.
- Email clients have no access to our CSS custom properties, so the palette is
  restated in the generator — same reasoning as `src/remotion/theme.ts`.
- `linear-gradient` is decoration, not load-bearing: every gradient has a solid
  `background-color` fallback for Outlook and clients that strip it.
- No images. SVG is unreliable in email and there is no hosted PNG wordmark, so
  the logo is a styled table cell plus text.
