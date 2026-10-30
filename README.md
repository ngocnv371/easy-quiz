# Easy Quiz

> Mở lên chơi ngay, dừng tùy thích.

An instant-play quiz platform from **AiTechX**: open it and the first question is already on
screen — no waiting screen, no account required — and you stop whenever you like. Answers are
graded instantly, the next question leans on your strongest topics, and a running streak keeps
the leaderboard meaningful; admins author quizzes — optionally with AI Assist, which turns a
one-line brief into a ready-to-edit question set.

The landing page and the quiz player are animated with [Remotion](https://remotion.dev),
rendered live in the browser via `@remotion/player`.

---

## Contents

- [Stack](#stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Design system](#design-system)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Stack

| Concern   | Choice                                                         |
| --------- | -------------------------------------------------------------- |
| Build     | Vite 8 + React 19 + TypeScript 6                               |
| Routing   | React Router 7, route-level code splitting                     |
| Styling   | Tailwind CSS v4 (`@theme` tokens, no config file)              |
| Backend   | Cloudflare Workers — Hono API, D1 (SQLite), Better Auth         |
| Animation | Motion (DOM) + Remotion (video compositions)                   |
| Icons     | lucide-react                                                   |
| Lint      | Oxlint                                                         |
| E2E       | Cypress (Edge)                                                 |

---

## Getting started

**Prerequisites:** Node 22.5+ and npm. Everything runs on Cloudflare: one Worker serves the app
(built by Vite) and the API under `/api/*`, with data in **D1**, accounts through **Better Auth**,
app events in **Analytics Engine** and account emails through **Resend**. Locally, `npm run dev`
runs the same Worker inside Vite with a local D1 — no Docker.

```bash
npm install
cp .dev.vars.example .dev.vars   # then put a long random string in BETTER_AUTH_SECRET
npm run db:migrate               # creates the local D1 database (in .wrangler/)
npm run dev                      # http://localhost:5173: the app and the Worker
```

Locally, account emails are not sent: the dev server prints them, confirmation link included (set
`RESEND_API_KEY` in `.dev.vars` to send real ones). `PAYOS_MOCK=1` makes every purchase succeed as
soon as you come back from "checkout", with no PayOS account. `AI_PROVIDER` defaults to `mock`.

### Demo data

The migrations seed the **8 starter topics** and the store's products. There is no seeded admin
(passwords are hashed by Better Auth, so they can't be written as SQL). To get one:

1. Sign up in the app, then open the confirmation link the dev server prints.
2. `npm run admin:promote -- you@example.com --credits 50` (admin role plus 50 AI Assist credits;
   add `--remote` for the real database).

Quizzes are not seeded. Use **Nhập câu hỏi** (the CSV bulk import) in the console, or put
`IMPORT_ADMIN_EMAIL` / `IMPORT_ADMIN_PASSWORD` in `.env.local` and run `npm run import:samples` to
import every CSV in `samples/` through the same API (the 35 sample banks are ~7,500 questions).

So the leaderboards don't open empty, `npm run seed:leaderboard` adds 40 made-up players (`--players
<n>` for more) with profiles, attempts on the published public quizzes and Endless runs, and bumps
the quizzes' play counts to match. Their user ids start with `seed-` and they have no password, so
nobody can sign in as one. Running it again replaces them, and `npm run seed:leaderboard -- --clean`
removes them and their plays. Add `--remote` to either for the real database. Import quizzes first.

To look at the data: `npx wrangler d1 execute DB --local --command "select …"`.

---

## Project structure

```
src/
  routes/               one file per page (lazy-loaded)
    manage/             the admin console
  features/
    auth/               session context (Better Auth client), guards, auth chrome
    quiz/               catalogue, play engine, result cache
    manage/             admin data access, AI Assist panel
    ai/                 AI Assist client
  components/
    ui/                 design-system primitives
    layout/             public shell, console shell, route guards
    brand/              marks, logo, aurora background
    remotion/           <Player> wrappers
  remotion/             the video compositions themselves
  lib/                  API client (api.ts), domain types, helpers
  styles/globals.css    design tokens

worker/                 the Cloudflare Worker: everything under /api/*
  index.ts              the routes (Hono)
  auth.ts               Better Auth (email + password, anonymous guests), guest upgrade
  catalog.ts            topics, quiz cards, leaderboards, profiles
  play.ts               play payload (no key), paid start, server-side grading
  endless.ts            Endless batches, grading, streaks, leaderboard
  payments.ts           the ad-free pass: PayOS checkout, return check, webhook
  manage.ts             admin quizzes, the editor's save, reports
  import.ts             CSV bulk import
  ai.ts                 AI Assist providers and credits
  email.ts, events.ts   account emails (Resend), analytics (Analytics Engine)

migrations/             D1 schema (0001_auth.sql generated, 0002_app.sql the app's tables, 0003+ changes)
```

---

## How it works

### The answer key never reaches the browser

The obvious design — ship the questions with their `is_correct` flag and grade in the browser —
makes a leaderboard meaningless, because anyone can read the answer key from the network tab.

It holds for every question kind (`questions.kind`, graded in `worker/grading.ts`):

| Kind | Options are | The player | Right when |
| --- | --- | --- | --- |
| `single` | the choices, one `is_correct` | picks one | it is the key |
| `true_false` | statements, `is_correct` = true | marks each Đúng/Sai | every mark matches |
| `short_answer` | the accepted answers | types a word or a number | it matches one, ignoring case, accents (`ha noi` = `Hà Nội`) and spacing; numbers by value (`0,5` = `0.5` = `1/2`) |

A short answer's options *are* its key, so the play payload sends none for that kind. Endless
draws only `single` questions — it is one tap per question.

So the split is:

| Route                                | Who calls it       | What it does                                                    |
| ------------------------------------ | ------------------ | --------------------------------------------------------------- |
| `GET /api/quizzes/:slug/play`        | anyone             | returns the quiz **with `is_correct` stripped out**              |
| `POST /api/quizzes/:slug/submit`     | any signed-in user | grades **on the server**, stores the attempt, returns the review |
| `POST /api/manage/quizzes`           | admins             | replaces a quiz's questions and options in one batch            |

D1 has no row-level security, so the Worker is the only door: every query lives in `worker/`,
scoped to the caller, and the answer key only leaves through grading. `attempts` are written
only by the submit route — which is what makes a posted score trustworthy. The per-question
review (`attempt_answers`) names the correct option, so it is only returned to the player (at
submit time) and to the quiz's owner (the report).

### Guest play

"Chơi ngay" uses Better Auth's **anonymous plugin**: a throwaway identity that is still a real user
row with a profile, so a guest's score can appear on the leaderboard straight away.

"Lưu kết quả của bạn" then converts that account **in place** (`POST /api/me/upgrade`): the same
user id gets an email, a password and a confirmation email, so the profile and every attempt,
Endless run and ad-free pass already recorded survive. Signing up afresh instead would silently
start the player from zero. The upgrade also clears the profile's `is_guest` and deliberately
leaves `role` alone, so a guest can never promote itself to admin.

Because a guest *is* signed in, `/login` and `/register` deliberately do **not** redirect them the
way they redirect a real account — those two pages are exactly where a guest needs to be. `/login`
says plainly that signing in would replace the guest session, and links to the upgrade instead.
(The guest's rows are kept when they sign in elsewhere, so their leaderboard places stay.)

Play is **exam-style** — no per-question feedback while answering, then a full review with
explanations once the attempt is graded. That keeps the answer key secret *and* gives the result
screen something worth celebrating.

### Endless mode

`/endless` is the opposite of an exam: no start gate, no finish line. As soon as a player has an
identity — an anonymous guest is fine — the first question is on screen, and every answer brings
the next. "Dừng" ends the session with a summary at any point.

- Questions are drawn from every published public quiz in **batches of 10**
  (`POST /api/endless/batch`), keyed by the quiz's topic as the "area of expertise", so there is no
  per-question tagging to maintain.
- The stream can be **scoped to one subject** with `/endless?topic=<slug>` — the player picks it
  from a selector in the top bar, and the choice lives in the URL so it survives a refresh and can
  be shared. The slug resolves against the live topic list, so a stale link falls back to all
  subjects. The batch route takes a `topic_id`; none keeps the whole catalogue in play.
- Each answer is graded on its own (`POST /api/endless/grade`), which reveals the key for that one
  question and folds the result into `endless_progress` — one row per player and topic. The answer
  key still never reaches the browser.
- Endless has its **own leaderboard** — the "Vô tận" tab on `/leaderboard` — ranked by the best
  correct-answer streak in a single run (`GET /api/leaderboard/endless`). A run is opened with
  `POST /api/endless/sessions`, and every graded answer advances its streak inside the grading
  route, so the score is server-earned rather than client-claimed.
- The next batch is **weighted** toward a player's stronger topics, while the weakest topic is
  guaranteed a slot in every batch, so the stream leans into strengths without abandoning the
  areas still being learned. The weighting lives in the Worker (`worker/endless.ts`), not the client.
- The question's own words and answer tiles are animated with **Motion**, on the real DOM: the
  prompt is split into word (or character) spans and the tiles are staggered, cycling through six
  choreographies (`src/features/quiz/question-motion.ts`). A Remotion composition
  (`EasyQuizQuestionReveal`) — a twist on the quiz countdown — plays a short "CÂU N" ring beat
  before each question after the first, tinted by the question's topic, so a long session never
  looks static.

### AI Assist

`POST /api/manage/ai` (`worker/ai.ts`) takes a brief:

```json
{ "topic": "Ôn tập lịch sử Việt Nam lớp 9", "level": "Lớp 9", "difficulty": "medium", "count": 10 }
```

and returns validated questions:

```json
{
  "questions": [
    { "prompt": "…", "options": ["…"], "correct_index": 0, "explanation": "…" }
  ],
  "provider": "gemini:gemini-2.5-flash",
  "credits": 49
}
```

- The provider key lives **only** in the Worker's secrets — never in the client bundle.
- `AI_PROVIDER` selects `gemini`, `openai`, `deepseek`, or `mock`. Gemini uses its own API;
  the other two share one OpenAI-compatible `/chat/completions` adapter, so
  `OPENAI_BASE_URL` turns `openai` into a generic escape hatch for anything that speaks that
  dialect (OpenRouter, Together, Groq, vLLM, Ollama…). The `mock` adapter keeps the whole flow
  working without a key, and is also the automatic fallback when a provider errors, so a dead
  API never dead-ends an admin mid-lesson. A *missing key* is not an outage, though: that is
  reported as an error rather than masked with placeholder questions.
- The route requires a session **and** the admin role, so an anonymous session cannot spend your
  provider quota.
- **AI Assist is metered.** An admin spends credits from `profiles.ai_credits`; each generation
  reserves `AI_CREDIT_COST` (default `1`) up front and hands it back if no paid provider actually
  produced the questions — so `mock` and `mock:fallback` runs are free. Every movement is logged in
  `ai_credit_ledger`. The UI shows the balance in the editor's AI Assist panel and on the admin
  dashboard; the panel is blocked at zero. The balance only moves inside the Worker.

  There is no purchase flow yet, so credits are handed out by hand:
  `npm run admin:promote -- <email> --credits 100` (it also makes the account an admin).

To use a real model, set `AI_PROVIDER` (in `wrangler.jsonc`, or `.dev.vars` locally) and the key as a
secret (`npx wrangler secret put GEMINI_API_KEY`, or a line in `.dev.vars`):

```bash
# Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key

# DeepSeek (OpenAI-compatible)
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-key

# Any other OpenAI-compatible endpoint
AI_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=your-model
OPENAI_BASE_URL=https://your-endpoint/v1
```

### Bulk question import

An **admin** can load a whole CSV of questions from the manage screen's **Nhập câu hỏi**
button. The file is read in the browser but parsed and validated on the server, so the format
rules live in exactly one place.

- `worker/import.ts` parses the CSV (RFC-4180: quoted fields, commas and newlines inside quotes),
  maps the columns, rejects bad rows with a reason, and groups the rest by subject.
- Then, in one D1 batch (a single transaction), it upserts each subject into `topics`, upserts
  **one quiz per subject** (found by owner + topic via `quizzes.imported_at`, so a re-import
  replaces that quiz's questions instead of duplicating it), and replaces the question set.
  Hand-authored quizzes are never touched.
- The admin role is checked by the Worker, so hiding the button is only a courtesy — it is not
  the thing enforcing the rule.

Columns (case- and accent-insensitive headers; Vietnamese aliases in parentheses):

| Column | Required | Notes |
| --- | --- | --- |
| `subject` (môn, chủ đề) | yes | becomes the topic and the quiz |
| `type` (loại câu) | no | `single` (default), `true_false` (đúng sai) or `short_answer` (trả lời ngắn) |
| `prompt` (câu hỏi) | yes | |
| `option_a`…`option_f` (`option_1`…, `a`…`f`) | ≥ 2 choices, ≥ 1 otherwise | the choices, the statements or the accepted answers; empty ones are dropped |
| `correct` (đáp án) | no | `single`: letter `A`–`F` or 1-based number, defaults to `A`; `true_false`: the true statements, e.g. `A,C` (blank = all false); `short_answer`: ignored |
| `explanation` (giải thích) | no | |
| `points`, `difficulty`, `title`, `status`, `visibility`, `subject_slug` | no | |

A subject's cover emoji is not part of the file — the importer lets the topic fall back to its
database default.

The dialog has a **Tải tệp mẫu** button that writes the same template shown in
`src/features/manage/import-questions.ts`.

### Ads and the ad-free pass

Playing is **free and unlimited**. What pays for it is an **ad break after every finished
session**, and a **one-time purchase that removes it for good**.

- **Where the break shows** (`src/features/ads/ad-break.tsx`):
  - **A quiz:** submitting navigates to the result page with `state.adBreak`; the break comes
    first, and continuing clears the flag, so a reload or a shared result link skips it.
  - **Endless:** pressing stop after at least one answer shows the break, then the summary.
  - Never while a question is on screen.
- **The ad:** a full-screen stage (not a dialog) with one labelled AdSense display unit and a
  continue button that unlocks after 5 seconds. AdSense is configured at build time with
  `VITE_ADSENSE_CLIENT` (`ca-pub-…`) and `VITE_ADSENSE_SLOT`; the script loads on the first break
  only. Without them, or with the script blocked, the unit is a house ad for the pass. Production
  also needs `public/ads.txt` with the publisher line AdSense gives you.
- **Who sees it:** everyone, guests included, except an account with `profiles.ad_free_at` set,
  and admins. `/api/me` reports that as `profile.ad_free`; `useShowAds()` reads it.
- **The pass** costs 49.000đ once and is sold on `/no-ads`. Grant it by hand with SQL on
  `profiles.ad_free_at`.

Energy (the per-answer meter, packs and Plus) was retired in `migrations/0004_ad_free.sql`.
`energy_wallets`, `energy_ledger` and the old products stay in the database as a record, unused.

**Payments (PayOS).** The catalogue is the `store_products` table: today just `ad_free` (change the
price there, no deploy needed).

- `POST /api/payments/checkout` creates a `payment_orders` row, snapshotting the price and what it
  buys, plus a PayOS link. Guests are refused (the pass must land on a durable account), and so is
  an account that is already ad-free.
- `POST /api/payments/sync` is the return page's check with PayOS.
- `POST /api/payments/webhook` is PayOS's callback, trusted by the HMAC signature over `data`.
- **Fulfilment:** both paths end in `fulfil()` (`worker/payments.ts`): one batch that credits an
  order exactly once and rejects underpayment.

`PAYOS_MOCK=1` (in `.dev.vars`, and only without PayOS keys) clicks through the whole flow locally:
every order is treated as paid on return. In the PayOS dashboard, set the webhook URL to
`https://easyquiz.aitechx.vn/api/payments/webhook`.

### Remotion

Four compositions in `src/remotion/`, each played in-page through `@remotion/player`:

| Composition            | Where                      | Length        |
| ---------------------- | -------------------------- | ------------- |
| `EasyQuizLandingHero`  | landing page hero          | 12 s, loops   |
| `EasyQuizCountdown`    | the 3-2-1 before a quiz    | 3 s + sting   |
| `EasyQuizResultReveal` | result page                | 7 s           |
| `EasyQuizQuestionReveal` | the "CÂU N" beat before each Endless question | 22 frames |

They obey Remotion's rules, which are stricter than they look: **every** animated value derives
from `useCurrentFrame()`, with no CSS transitions and no Tailwind animation classes, because
neither exists when a composition is rendered headlessly. Fonts are loaded through
`@remotion/google-fonts`, so a render does not depend on the page's stylesheet.

`src/remotion/root.tsx` registers the same compositions for video rendering, so they can be
exported later without rewriting anything. To open them in Remotion Studio:

```bash
npm i -D @remotion/cli
npx remotion studio src/remotion/index.ts
```

---

## Design system

Easy Quiz inherits the AiTechX house style — near-black `ink` surfaces, the neon → violet →
magenta gradient, Space Grotesk over Inter — and adds one thing of its own: **`spark`**, the warm
amber reserved for correct answers, streaks, records and anything worth celebrating. The brand
stays cool; the quiz runs hot. That is the `text-gradient-spark` treatment and the
`--color-spark-*` / `--color-correct-*` / `--color-wrong-*` tokens.

Tokens live in `src/styles/globals.css` under `@theme`. The Remotion compositions restate the
same values in `src/remotion/theme.ts` on purpose: a video must render correctly on a page with
no stylesheet.

---

## Scripts

| Script                                | What it does                                                   |
| ------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                         | The app and the Worker, with a local D1                         |
| `npm run build`                       | Type-check, then build the app and the Worker into `dist/`      |
| `npm run preview`                     | Build, then serve it as it will run on Cloudflare               |
| `npm run deploy`                      | Build and `wrangler deploy`                                     |
| `npm run lint`                        | Oxlint                                                          |
| `npm run typecheck`                   | `tsc -b` (app, Worker, Node config)                             |
| `npm run e2e` / `:open` / `:headed`   | Cypress end-to-end suite, in Edge                               |
| `npm run db:migrate` / `:remote`      | Apply `migrations/` to the local / real D1                       |
| `npm run db:auth-schema`              | Regenerate `migrations/0001_auth.sql` from `worker/auth.ts`     |
| `npm run admin:promote -- <email>`    | Make an account an admin (`--remote`, `--credits <n>`)          |
| `npm run sitemap:gen`                 | Rewrite `public/sitemap.xml` from the live quizzes              |
| `npm run og:image`                    | Render `public/og-image.png` from `scripts/og-image.html`       |
| `npm run import:samples`              | Import every CSV in `samples/` through the admin importer       |
| `npm run seed:leaderboard`            | Fill the leaderboards with fake players (`--clean`, `--remote`) |

> After changing the Better Auth options in `worker/auth.ts`, run `npm run db:auth-schema` and add
> the difference as a new migration (0001 is already applied wherever the app runs).

---

## End-to-end tests

Cypress drives the real app and its Worker (local D1), in **Edge** by default. The Endless
spec (`cypress/e2e/endless.cy.ts`) covers the flow that matters most: landing straight on a
question, grading an answer, revealing the key, the streak/accuracy readouts, the subject-scope
control, the batch prefetch, and the stop summary.

```bash
npm run db:migrate       # local D1 tables (then import questions, see Demo data)
npm run dev              # app on http://localhost:5173
npm run e2e              # headless, Edge
npm run e2e:open         # interactive, Edge
```

The specs need published quizzes to play, and the seed no longer ships any — import a CSV first (see
Demo data), or point the app at a project that already has questions. `baseUrl` lives in
`cypress.config.ts`; failure screenshots land in `cypress/screenshots/`, which is git-ignored.

---

## SEO

The app is a client-rendered SPA, so the document head is assembled in two layers:

- **`index.html`** carries the landing page's tags — title, description, canonical, Open Graph,
  Twitter card, and a JSON-LD `@graph` describing the app and the AiTechX organisation. This is
  what a crawler that does not execute JavaScript sees.
- **`src/lib/seo.ts`** (`usePageMeta`) rewrites those tags on every navigation: per-page title and
  description, a canonical URL, and `noindex` on the surfaces that should stay out of the index
  (account, admin console, a result sheet, 404). A quiz page also emits `Quiz` structured data.

Every URL derives from `VITE_SITE_URL`; `src/lib/site.ts` holds the host and `absoluteUrl()` builds
full URLs. `.env.production` points it at `https://easyquiz.aitechx.vn`, and `site.ts` falls back to
that host so a build that forgets the variable does not emit `localhost` canonicals.

Three files are served straight from `public/`:

| File           | Purpose                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `robots.txt`   | Opens the public site; disallows `/manage`, `/account`, play and result URLs |
| `sitemap.xml`  | Static routes — regenerate with `npm run sitemap:gen` to add the quizzes      |
| `og-image.png` | 1200×630 share card. Edit `scripts/og-image.html`, then `npm run og:image`    |

The Worker's assets fall back to `index.html` for client-side routing
(`not_found_handling: "single-page-application"`), and files that exist — these three included —
are served as-is.

---

## Deployment

The Worker's config is `wrangler.jsonc`; `npm run deploy` builds and deploys. On Cloudflare's Git
integration (Workers Builds) use build command `npm run build` and deploy command
`npx wrangler deploy`. The custom domain, `easyquiz.aitechx.vn`, is in `routes` in `wrangler.jsonc`:
change domains there rather than in the dashboard, so deploys keep them.

First time:

1. `npx wrangler login`, then `npx wrangler d1 create easy-quiz`; put the `database_id` it prints
   into `d1_databases` in `wrangler.jsonc` and commit it. The Analytics Engine dataset appears by
   itself with the first event.
2. `npm run db:migrate:remote` applies `migrations/` to the real database. Run it again whenever a
   migration is added, before deploying the code that needs it.
3. Secrets (`npx wrangler secret put <NAME>`):
   - `BETTER_AUTH_SECRET`: a long random string (`openssl rand -base64 32`). Changing it signs everyone out.
   - `RESEND_API_KEY`: from [Resend](https://resend.com), with the domain in `EMAIL_FROM`
     (`wrangler.jsonc`, `no-reply@aitechx.vn`) verified there.
   - `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`: from [my.payOS](https://my.payos.vn).
     Never set `PAYOS_MOCK` on Cloudflare.
   - The AI provider's key (`GEMINI_API_KEY`, `OPENAI_API_KEY` or `DEEPSEEK_API_KEY`), with
     `AI_PROVIDER` set in `wrangler.jsonc`.
4. In my.payOS set the channel's webhook URL to `https://easyquiz.aitechx.vn/api/payments/webhook`.
5. `AUTH_HOSTS` in `wrangler.jsonc` lists the hosts sign-in works on: add any other domain the
   Worker is served on. `SITE_URL` is the fallback for links in emails.
6. `npm run deploy`, then sign up, `npm run admin:promote -- <email> --remote`, and import the
   question banks (`IMPORT_SITE_URL=https://easyquiz.aitechx.vn IMPORT_ALLOW_REMOTE=1 npm run import:samples`).
7. Refresh the sitemap (`npm run sitemap:gen`) and check the result with the
   [Rich Results Test](https://search.google.com/test/rich-results) and the
   [Facebook sharing debugger](https://developers.facebook.com/tools/debug/).

Logs and traces are on (`observability` in `wrangler.jsonc`): Workers → easy-quiz → Observability.
App events (signups, quiz starts and submits, Endless answers, checkouts, payments,
errors) go to the `easy_quiz_events` Analytics Engine dataset; see `worker/events.ts` for the columns.

**Remotion licensing** — Remotion is free for individuals and small teams, but **companies need a
paid license**. That is what the console notice refers to; see <https://remotion.dev/license>.

---

## Known limitations

Called out honestly rather than hidden:

- **Editing a quiz deletes and re-inserts its questions**, so per-question review detail for
  *past* attempts no longer resolves. Aggregate scores in `attempts` are preserved.
- **No password reset yet.** Better Auth supports it; the page has no "forgot password" flow.
- **Sign-up creates an ordinary user.** Admin is not self-serve; promote an account with
  `npm run admin:promote`. Put the console behind real approval before opening it
  up publicly.
- **Ad blockers skip the ad, not the break.** A blocked AdSense script falls back to the house
  ad, so the pause stays but no revenue comes from it.
- **Submitting an attempt has no rate limit** (only Better Auth's own routes are rate-limited). A determined player could flood the leaderboard.
- **No image upload.** `questions.image_url` exists and renders, but nothing writes to it yet.
- **The result review lives in `sessionStorage`.** Opening a result link in a fresh tab shows the
  summary without the per-question review — the correct trade-off, since the review names the
  answer key.
- **Upgrading a guest keeps its auto-generated username** (e.g. `player_1a2b3`). The display name
  is what every screen and the leaderboard actually show, so this is cosmetic — but deriving a
  username from the new email would be a small, worthwhile follow-up.
