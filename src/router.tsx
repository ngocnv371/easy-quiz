import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ManageLayout } from '@/components/layout/manage-layout'
import { PublicLayout } from '@/components/layout/public-layout'
import { RequireAuth, RequireTeacher } from '@/components/layout/route-guards'
import { Spinner } from '@/components/ui/button'

/**
 * Route table.
 *
 * Every page is behind a dynamic `import()`, so a visitor who lands on a quiz
 * never downloads the teacher console — and Remotion, by far the heaviest
 * dependency, only arrives on the routes that actually play a video.
 *
 * React Router's route-level `lazy` sets the route's own element, which cannot
 * express "page inside a guard". The two guarded pages therefore use
 * `React.lazy` inside a `<Suspense>` boundary instead.
 */

const AccountPage = lazy(() =>
  import('@/routes/account-page').then((module) => ({ default: module.AccountPage })),
)

const QuizResultPage = lazy(() =>
  import('@/routes/quiz-result-page').then((module) => ({ default: module.QuizResultPage })),
)

/**
 * Shown while a lazily loaded page — or the first chunk of a cold load — is
 * being fetched.
 */
function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="text-neon-400 size-7" />
      <span className="sr-only">Đang tải…</span>
    </div>
  )
}

function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

const landingPage = () =>
  import('@/routes/landing-page').then((module) => ({ Component: module.LandingPage }))

const explorePage = () =>
  import('@/routes/explore-page').then((module) => ({ Component: module.ExplorePage }))

const quizDetailPage = () =>
  import('@/routes/quiz-detail-page').then((module) => ({ Component: module.QuizDetailPage }))

const leaderboardPage = () =>
  import('@/routes/leaderboard-page').then((module) => ({ Component: module.LeaderboardPage }))

const profilePage = () =>
  import('@/routes/profile-page').then((module) => ({ Component: module.ProfilePage }))

const loginPage = () =>
  import('@/routes/login-page').then((module) => ({ Component: module.LoginPage }))

const registerPage = () =>
  import('@/routes/register-page').then((module) => ({ Component: module.RegisterPage }))

const quizPlayPage = () =>
  import('@/routes/quiz-play-page').then((module) => ({ Component: module.QuizPlayPage }))

const notFoundPage = () =>
  import('@/routes/not-found-page').then((module) => ({ Component: module.NotFoundPage }))

const manageDashboardPage = () =>
  import('@/routes/manage/dashboard-page').then((module) => ({
    Component: module.ManageDashboardPage,
  }))

const manageQuizListPage = () =>
  import('@/routes/manage/quiz-list-page').then((module) => ({
    Component: module.ManageQuizListPage,
  }))

const manageQuizEditorPage = () =>
  import('@/routes/manage/quiz-editor-page').then((module) => ({
    Component: module.ManageQuizEditorPage,
  }))

const manageQuizReportPage = () =>
  import('@/routes/manage/quiz-report-page').then((module) => ({
    Component: module.ManageQuizReportPage,
  }))

/**
 * Shown while the first lazy chunk resolves. React Router asks for this
 * explicitly on a cold load of a route table that uses `lazy`, so it is spread
 * into every top-level route rather than repeated.
 */
const HYDRATE = { HydrateFallback: PageLoading } as const

export const router = createBrowserRouter([
  // ── Public site ─────────────────────────────────────────────────────────
  {
    path: '/',
    element: <PublicLayout />,
    ...HYDRATE,
    children: [
      { index: true, lazy: landingPage },
      { path: 'explore', lazy: explorePage },
      { path: 'q/:slug', lazy: quizDetailPage },
      { path: 'leaderboard', lazy: leaderboardPage },
      { path: 'u/:username', lazy: profilePage },
    ],
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  { path: '/login', lazy: loginPage, ...HYDRATE },
  { path: '/register', lazy: registerPage, ...HYDRATE },

  // ── Account ─────────────────────────────────────────────────────────────
  {
    path: '/account',
    ...HYDRATE,
    element: (
      <RequireAuth>
        <PageSuspense>
          <AccountPage />
        </PageSuspense>
      </RequireAuth>
    ),
  },

  // ── Play, outside the public chrome so nothing competes with the quiz ───
  { path: '/q/:slug/play', lazy: quizPlayPage, ...HYDRATE },

  {
    path: '/q/:slug/result/:attemptId',
    ...HYDRATE,
    element: (
      <RequireAuth>
        <PageSuspense>
          <QuizResultPage />
        </PageSuspense>
      </RequireAuth>
    ),
  },

  // ── Teacher console ─────────────────────────────────────────────────────
  {
    path: '/manage',
    ...HYDRATE,
    element: (
      <RequireTeacher>
        <ManageLayout />
      </RequireTeacher>
    ),
    children: [
      { index: true, lazy: manageDashboardPage },
      { path: 'quizzes', lazy: manageQuizListPage },
      { path: 'quizzes/new', lazy: manageQuizEditorPage },
      { path: 'quizzes/:quizId', lazy: manageQuizEditorPage },
      { path: 'quizzes/:quizId/report', lazy: manageQuizReportPage },
    ],
  },

  { path: '/404', lazy: notFoundPage },
  { path: '*', element: <Navigate to="/404" replace /> },
])