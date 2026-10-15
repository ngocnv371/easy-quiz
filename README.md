# Easy Quiz

> Học vui, nhớ lâu.

A quiz platform from **AiTechX**: users explore quizzes by topic, play immediately
(with or without an account) and land on a leaderboard; admins author quizzes — optionally
with AI Assist, which turns a one-line brief into a ready-to-edit question set.

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
| Backend   | Supabase — Postgres, Auth, Row Level Security, Edge Functions   |
| Animation | Motion (DOM) + Remotion (video compositions)                   |
| Icons     | lucide-react                                                   |
| Lint      | Oxlint                                                         |
| E2E       | Cypress (Edge)                                                 |

---

## Getting started

**Prerequisites:** Node 20+, Docker Desktop (for the Supabase CLI), and npm.

```bash
npm install

# 1. Local backend (Postgres, Auth, Studio, Edge Functions)
npm run supabase:start

# 2. Point the app at it
cp .env.example .env.local
#   paste the API_URL and ANON_KEY printed by `supabase start`
#   (Easy Quiz's local stack uses ports in the 544xx range — see supabase/config.toml)

# 3. Run the app
npm run dev
```

### Demo data

`supabase db reset` (and the first `supabase start`) applies the migrations and then seeds:

- **8 topics** — Toán học, Lịch sử, Khoa học, …
- **A demo admin** — `admin@easyquiz.local` / `easyquiz123` (role: admin)
- **3 published quizzes** with 5 fully written questions each
- **10 past attempts**, so the leaderboards are not empty on first run

Studio is at <http://127.0.0.1:54423> if you want to poke at the data directly.

---

## Project structure

```
src/
  routes/               one file per page (lazy-loaded)
    manage/             the admin console
  features/
    auth/               session context, guards, auth chrome
    quiz/               catalogue, play engine, result cache
    manage/             admin data access, AI Assist panel
    ai/                 AI Assist client
  components/
    ui/                 design-system primitives
    layout/             public shell, console shell, route guards
    brand/              marks, logo, aurora background
    remotion/           <Player> wrappers
  remotion/             the video compositions themselves
  lib/                  supabase client, domain types, helpers
  styles/globals.css    design tokens

supabase/
  migrations/           schema → RLS → views + RPCs
  functions/ai-quiz/    AI Assist edge function
  functions/import-questions/  admin CSV bulk import
  seed.sql              demo content
```

---

## How it works

### The answer key never reaches the browser

The obvious design — ship the questions with their `is_correct` flag and grade in the browser —
makes a leaderboard meaningless, because anyone can read the answer key from the network tab.

So the split is:

| Function              | Who calls it       | What it does                                                     |
| --------------------- | ------------------ | ---------------------------------------------------------------- |
| `get_quiz_for_play()` | anyone             | returns the quiz **with `is_correct` stripped out**               |
| `submit_attempt()`    | any signed-in user | grades **on the server**, stores the attempt, returns the review  |
| `save_quiz()`         | admins             | atomically replaces a quiz's questions and options                |

All three are `SECURITY DEFINER`, so the browser never holds a query that can reach the answer
key. `attempts` has **no INSERT policy at all** — the RPC is the only writer, which is what
makes a posted score trustworthy. The per-question review lives in `attempt_answers`, a separate
table with its own policy, because that row *does* name the correct option.

Two smaller decisions fall out of the same reasoning:

- `quiz_cards` and `leaderboard_entries` are views with `security_invoker = true`, so the
  caller's RLS still applies. View columns are therefore typed nullable, and
  `src/lib/domain.ts` narrows them into the shapes the UI actually uses.
- A view cannot compute a question count without tripping RLS (a user cannot read another
  author's `questions` rows), so `quiz_stats()` is a narrow `SECURITY DEFINER` function that
  exposes the count and the maximum score and nothing else.

### Guest play

"Chơi ngay" uses Supabase's **anonymous sign-in**: a throwaway identity that still owns a
profile, so a guest's score can appear on the leaderboard straight away.
`enable_anonymous_sign_ins = true` is set in `supabase/config.toml`.

"Lưu kết quả của bạn" then converts that account **in place** — `updateUser({ email, password })`
keeps the same user id, so the profile and every attempt already recorded survive. Calling
`signUp()` instead would silently start the player from zero, which is the wrong answer for a
button whose whole promise is saving results. The remaining details (display name and school)
travel through `upgrade_guest_profile()`, the only path allowed to clear `is_guest` for a
player. It deliberately leaves `role` alone, so a guest can never promote itself to admin.

Because a guest *is* signed in, `/login` and `/register` deliberately do **not** redirect them the
way they redirect a real account — those two pages are exactly where a guest needs to be. `/login`
says plainly that signing in would replace the guest session, and links to the upgrade instead.

Play is **exam-style** — no per-question feedback while answering, then a full review with
explanations once the attempt is graded. That keeps the answer key secret *and* gives the result
screen something worth celebrating.

### Endless mode

`/endless` is the opposite of an exam: no start gate, no finish line. As soon as a player has an
identity — an anonymous guest is fine — the first question is on screen, and every answer brings
the next. "Dừng" ends the session with a summary at any point.

- Questions are drawn from every published public quiz in **batches of 10**
  (`get_endless_batch()`), keyed by the quiz's topic as the "area of expertise", so there is no
  per-question tagging to maintain.
- The stream can be **scoped to one subject** with `/endless?topic=<slug>` — the player picks it
  from a selector in the top bar, and the choice lives in the URL so it survives a refresh and can
  be shared. The slug resolves against the live topic list, so a stale link falls back to all
  subjects. `get_endless_batch(..., p_topic_id)` filters the pool; `NULL` keeps the whole
  catalogue in play.
- Each answer is graded on its own (`grade_endless_answer()`), which reveals the key for that one
  question and folds the result into `endless_progress` — one row per player and topic. The answer
  key still never reaches the browser.
- The next batch is **weighted** toward a player's stronger topics, while the weakest topic is
  guaranteed a slot in every batch, so the stream leans into strengths without abandoning the
  areas still being learned. The weighting lives in SQL, not the client.
- The question's own words and answer tiles are animated with **Motion**, on the real DOM: the
  prompt is split into word (or character) spans and the tiles are staggered, cycling through six
  choreographies (`src/features/quiz/question-motion.ts`). A Remotion composition
  (`EasyQuizQuestionReveal`) — a twist on the quiz countdown — plays a short "CÂU N" ring beat
  before each question after the first, tinted by the question's topic, so a long session never
  looks static.

### Sessions that outlive their account

A JWT stays valid after the user row behind it is deleted — an admin removing an account, a
restore from backup, a local `db reset` under a live browser. Supabase then answers every request
with *"User from sub claim in JWT does not exist"*, which is accurate and useless to a player.

The app uses a missing profile row as that signal: `handle_new_user` creates the row in the same
transaction as the user, so a live session can never legitimately lack one. On detecting it the
session is discarded **locally** (a server-side revoke would fail with the same error), the
visitor drops back to guest, and a toast says why — instead of leaving a session that fails
cryptically on every later click.

### AI Assist

`supabase/functions/ai-quiz/index.ts` takes a brief:

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

- The provider key lives **only** in the function's environment — never in the client bundle.
- `AI_PROVIDER` selects `gemini`, `openai`, `deepseek`, or `mock`. Gemini uses its own API;
  the other two share one OpenAI-compatible `/chat/completions` adapter, so
  `OPENAI_BASE_URL` turns `openai` into a generic escape hatch for anything that speaks that
  dialect (OpenRouter, Together, Groq, vLLM, Ollama…). The `mock` adapter keeps the whole flow
  working without a key, and is also the automatic fallback when a provider errors, so a dead
  API never dead-ends an admin mid-lesson. A *missing key* is not an outage, though: that is
  reported as an error rather than masked with placeholder questions.
- The function verifies the JWT **and** re-checks the caller's role through `is_admin()`, so an
  anonymous session cannot spend your provider quota.
- **AI Assist is metered.** An admin spends credits from `profiles.ai_credits`; each generation
  reserves `AI_CREDIT_COST` (default `1`) up front and hands it back if no paid provider actually
  produced the questions — so `mock` and `mock:fallback` runs are free. Every movement is logged in
  `ai_credit_ledger`. The UI shows the balance in the editor's AI Assist panel and on the admin
  dashboard; the panel is blocked at zero. Both changes go through `apply_ai_credits()` /
  `grant_ai_credits()` — the balance is never client-writable.

  There is no purchase flow yet, so credits are handed out by editing the database. Run
  `supabase/snippets/grant-ai-credits.sql` in Studio's SQL editor, or in short:

  ```sql
  select public.grant_ai_credits('<admin-uuid>', 100, 'grant');
  ```

To use a real model, edit `supabase/functions/.env`:

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

then `npm run fn:serve`, or restart the stack.

### Bulk question import

An **admin** can load a whole CSV of questions from the manage screen's **Nhập câu hỏi**
button. The file is read in the browser but parsed and validated on the server, so the format
rules live in exactly one place.

- `supabase/functions/import-questions/index.ts` parses the CSV (RFC-4180: quoted fields,
  commas and newlines inside quotes), maps the columns, rejects bad rows with a reason, and
  groups the rest by subject. It calls `import_question_bank()` with the shaped payload.
- `import_question_bank()` is `SECURITY DEFINER` and admin-only. It upserts each subject into
  `topics`, upserts **one quiz per subject** (found by owner + topic via `quizzes.imported_at`,
  so a re-import replaces that quiz's questions instead of duplicating it), and replaces the
  question set atomically. Hand-authored quizzes are never touched.
- The role is checked in the edge function **and** inside the RPC, so hiding the button is
  only a courtesy — it is not the thing enforcing the rule.

Columns (case- and accent-insensitive headers; Vietnamese aliases in parentheses):

| Column | Required | Notes |
| --- | --- | --- |
| `subject` (môn, chủ đề) | yes | becomes the topic and the quiz |
| `prompt` (câu hỏi) | yes | |
| `option_a`…`option_f` (`option_1`…, `a`…`f`) | ≥ 2 | empty ones are dropped |
| `correct` (đáp án) | no | letter `A`–`F` or 1-based number; defaults to `A` |
| `explanation` (giải thích) | no | |
| `points`, `difficulty`, `title`, `status`, `visibility`, `subject_slug` | no | |

A subject's cover emoji is not part of the file — the importer lets the topic fall back to its
database default.

The dialog has a **Tải tệp mẫu** button that writes the same template shown in
`src/features/manage/import-questions.ts`.

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

| Script                                        | What it does                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                                 | Vite dev server                                   |
| `npm run build`                               | Type-check, then production build                 |
| `npm run preview`                             | Serve the built app                               |
| `npm run lint`                                | Oxlint                                            |
| `npm run typecheck`                           | `tsc -b`                                          |
| `npm run e2e` / `:open` / `:headed`           | Cypress end-to-end suite, in Edge                 |
| `npm run supabase:start` / `:stop` / `:status`| Local stack lifecycle                             |
| `npm run db:reset`                            | Re-apply migrations and seed                      |
| `npm run db:push`                             | Push migrations to the linked remote project      |
| `npm run types:gen`                           | Regenerate `src/lib/database.types.ts`            |
| `npm run sitemap:gen`                         | Rewrite `public/sitemap.xml` from the published quizzes |
| `npm run og:image`                            | Render `public/og-image.png` from `scripts/og-image.html` |
| `npm run fn:serve`                            | Serve edge functions with `supabase/functions/.env` |

> `src/lib/database.types.ts` is generated. Change the schema in `supabase/migrations`, then run
> `npm run types:gen`.

---

## End-to-end tests

Cypress drives the real app against a local Supabase stack, in **Edge** by default. The Endless
spec (`cypress/e2e/endless.cy.ts`) covers the flow that matters most: landing straight on a
question, grading an answer, revealing the key, the streak/accuracy readouts, the subject-scope
control, the batch prefetch, and the stop summary.

```bash
npm run supabase:start   # backend + migrations + seed
npm run dev              # app on http://localhost:5173
npm run e2e              # headless, Edge
npm run e2e:open         # interactive, Edge
```

The specs expect the seed data. `baseUrl` lives in `cypress.config.ts`; failure screenshots land
in `cypress/screenshots/`, which is git-ignored.

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

The host does a catch-all rewrite to `index.html` for client-side routing. Check that it still
serves these three files as-is rather than rewriting them too.

---

## Deployment

1. **Supabase** — link the project, then push:

   ```bash
   npx supabase link --project-ref <ref>
   npm run db:push
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy ai-quiz
   npx supabase functions deploy import-questions
   ```

   Then enable **anonymous sign-ins** under Authentication → Providers.

2. **Front end** — build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set, and serve
   `dist/` from any static host. The app uses client-side routing, so configure a **catch-all
   rewrite to `index.html`**.

   Before building, refresh the sitemap so the live quizzes are advertised to search engines:

   ```bash
   npm run sitemap:gen
   npm run build
   ```

   Confirm `VITE_SITE_URL` in `.env.production` is the real host, then check the deployed result
   with the [Rich Results Test](https://search.google.com/test/rich-results) and refresh the card
   in the [Facebook sharing debugger](https://developers.facebook.com/tools/debug/).

3. **Remotion licensing** — Remotion is free for individuals and small teams, but **companies
   need a paid license**. That is what the console notice refers to; see
   <https://remotion.dev/license>.

---

## Known limitations

Called out honestly rather than hidden:

- **Editing a quiz deletes and re-inserts its questions**, so per-question review detail for
  *past* attempts no longer resolves. Aggregate scores in `attempts` are preserved.
- **Sign-up creates an ordinary user.** Admin is not self-serve; promote an account with
  `supabase/snippets/promote-admin.sql`. Put the console behind real approval before opening it
  up publicly.
- **`submit_attempt()` has no rate limit.** A determined player could flood the leaderboard.
- **No image upload.** `questions.image_url` exists and renders, but nothing writes to it yet.
- **The result review lives in `sessionStorage`.** Opening a result link in a fresh tab shows the
  summary without the per-question review — the correct trade-off, since the review names the
  answer key.
- **Upgrading a guest keeps its auto-generated username** (e.g. `player_1a2b3`). The display name
  is what every screen and the leaderboard actually show, so this is cosmetic — but deriving a
  username from the new email would be a small, worthwhile follow-up.
