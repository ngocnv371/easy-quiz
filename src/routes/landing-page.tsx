import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BrainCircuit,
  Compass,
  Rocket,
  Sparkles,
  Trophy,
  Users,
  Wand2,
} from 'lucide-react'

import { AuroraBackground } from '@/components/brand/aurora-background'
import { BrandCredit } from '@/components/brand/logo'
import { LandingHeroVideo } from '@/components/remotion/players'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/feedback'
import { Marquee } from '@/components/ui/marquee'
import { Counter } from '@/components/ui/metrics'
import { Reveal, SectionHeading } from '@/components/ui/reveal'
import { QuizCardTile } from '@/features/quiz/quiz-card-tile'
import { fetchQuizCards, fetchTopics } from '@/features/quiz/api'
import { isSupabaseConfigured } from '@/lib/supabase'
import { APP_DESCRIPTION, TAGLINE } from '@/lib/site'
import { useAsyncData } from '@/lib/use-async-data'

const PILLARS = [
  {
    icon: Compass,
    title: 'Chơi ngay, không rào cản',
    description:
      'Không cần đăng ký vẫn vào được. Chọn chủ đề bạn thích, bấm bắt đầu và làm bài — tài khoản chỉ cần khi bạn muốn giữ lại thành tích.',
    tone: 'neon' as const,
  },
  {
    icon: Trophy,
    title: 'Điểm của bạn được ghi nhận',
    description:
      'Mỗi lượt hoàn thành đều được máy chủ chấm và đưa lên bảng xếp hạng. Hồ sơ của bạn lớn dần theo từng đề thi đã chinh phục.',
    tone: 'spark' as const,
  },
  {
    icon: Wand2,
    title: 'Giáo viên soạn đề nhanh gấp mười',
    description:
      'AI Assist nhận một câu mô tả chủ đề và trả về 10 câu hỏi kèm đáp án, giải thích. Bạn chỉ cần đọc lại và bấm xuất bản.',
    tone: 'violet' as const,
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Chọn chủ đề',
    description: 'Toán, Lịch sử, Khoa học… hoặc để ô tìm kiếm dẫn đường.',
  },
  {
    number: '02',
    title: 'Làm bài',
    description: 'Đồng hồ chạy, câu hỏi rõ ràng, không bị phân tâm bởi quảng cáo.',
  },
  {
    number: '03',
    title: 'Xem và leo hạng',
    description: 'Nhận điểm, xem lại từng câu, rồi so mình với người khác.',
  },
]

export function LandingPage() {
  const topics = useAsyncData('landing:topics', fetchTopics, isSupabaseConfigured)
  const popular = useAsyncData(
    'landing:popular',
    () => fetchQuizCards({ sort: 'popular', limit: 3 }),
    isSupabaseConfigured,
  )

  return (
    <>
      {/* ══ Hero ═══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-20">
        <AuroraBackground variant="quiz" />

        <div className="container-page relative">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
            <div>
              <Reveal>
                <Badge tone="spark" icon={Sparkles}>
                  Sản phẩm mới của AiTechX
                </Badge>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className="font-display mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                  Học vui,
                  <br />
                  <span className="text-gradient-spark">nhớ lâu.</span>
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="text-ink-300 mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
                  {APP_DESCRIPTION}
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink to="/explore" size="lg">
                    Khám phá đề thi
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </ButtonLink>
                  <ButtonLink to="/register" variant="secondary" size="lg">
                    Tôi là giáo viên
                  </ButtonLink>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <dl className="border-ink-600/60 mt-10 grid max-w-lg grid-cols-3 gap-6 border-t pt-6">
                  <div>
                    <dd className="font-display text-ink-50 text-2xl font-semibold">
                      <Counter value={1200} suffix="+" />
                    </dd>
                    <dt className="text-ink-400 mt-1 text-xs">Câu hỏi sẵn sàng</dt>
                  </div>
                  <div>
                    <dd className="font-display text-ink-50 text-2xl font-semibold">
                      <Counter value={8} />
                    </dd>
                    <dt className="text-ink-400 mt-1 text-xs">Chủ đề</dt>
                  </div>
                  <div>
                    <dd className="font-display text-spark-300 text-2xl font-semibold">
                      <Counter value={10} suffix="s" />
                    </dd>
                    <dt className="text-ink-400 mt-1 text-xs">AI soạn 10 câu</dt>
                  </div>
                </dl>
              </Reveal>
            </div>

            {/* The Remotion hero — a quiz being answered, scored and ranked. */}
            <Reveal delay={0.1} y={32}>
              <div className="border-ink-600/70 bg-ink-900/70 shadow-panel relative overflow-hidden rounded-2xl border p-2 backdrop-blur">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="bg-wrong-400/70 size-2.5 rounded-full" aria-hidden />
                  <span className="bg-spark-400/70 size-2.5 rounded-full" aria-hidden />
                  <span className="bg-correct-400/70 size-2.5 rounded-full" aria-hidden />
                  <span className="text-ink-500 ml-2 font-mono text-[0.7rem]">
                    easy-quiz / live
                  </span>
                </div>

                <div className="bg-ink-950 aspect-[15/8] overflow-hidden rounded-xl">
                  <LandingHeroVideo />
                </div>
              </div>

              <p className="text-ink-500 mt-3 text-center text-xs">
                Dựng bằng Remotion — mỗi lượt chơi có thể trở thành một thước phim.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ Topic marquee ══════════════════════════════════════════════ */}
      {topics.data && topics.data.length > 0 ? (
        <section className="border-ink-600/40 border-y py-6">
          <Marquee>
            {topics.data.map((topic) => (
              <Link
                key={topic.id}
                to={`/explore?topic=${topic.slug}`}
                className="border-ink-600 bg-ink-800/60 hover:border-neon-400/50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors"
              >
                <span aria-hidden>{topic.emoji}</span>
                <span className="text-ink-200">{topic.name}</span>
              </Link>
            ))}
          </Marquee>
        </section>
      ) : null}

      {/* ══ Pillars ════════════════════════════════════════════════════ */}
      <section className="py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Vì sao là Easy Quiz"
            title="Một chỗ cho cả người học và người dạy"
            description="Học sinh cần thứ gì đó thú vị để quay lại mỗi ngày. Giáo viên cần thứ gì đó nhanh hơn việc gõ tay từng câu hỏi. Easy Quiz làm cả hai."
          />

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PILLARS.map((pillar, index) => (
              <Reveal key={pillar.title} delay={index * 0.08}>
                <Card className="hairline-gradient h-full p-6">
                  <span
                    className={`flex size-11 items-center justify-center rounded-xl border ${
                      pillar.tone === 'spark'
                        ? 'border-spark-400/40 bg-spark-400/10'
                        : pillar.tone === 'violet'
                          ? 'border-violet-glow-400/40 bg-violet-glow-500/10'
                          : 'border-neon-400/40 bg-neon-400/10'
                    }`}
                  >
                    <pillar.icon
                      className={`size-5 ${
                        pillar.tone === 'spark'
                          ? 'text-spark-300'
                          : pillar.tone === 'violet'
                            ? 'text-violet-glow-300'
                            : 'text-neon-300'
                      }`}
                      aria-hidden
                    />
                  </span>

                  <h3 className="font-display text-ink-50 mt-4 text-lg font-semibold">
                    {pillar.title}
                  </h3>
                  <p className="text-ink-300 mt-2 text-sm leading-relaxed">
                    {pillar.description}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Popular quizzes ════════════════════════════════════════════ */}
      {isSupabaseConfigured ? (
        <section className="py-16">
          <div className="container-page">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                align="left"
                eyebrow="Đang được chơi nhiều"
                title="Đề thi nổi bật"
                titleClassName="text-3xl sm:text-4xl"
              />
              <ButtonLink to="/explore" variant="outline" size="sm">
                Xem tất cả
              </ButtonLink>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {popular.loading
                ? Array.from({ length: 3 }, (_, index) => (
                    <Card key={index} className="p-5">
                      <Skeleton className="size-11 rounded-xl" />
                      <Skeleton className="mt-4 h-4 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-full" />
                      <Skeleton className="mt-2 h-3 w-2/3" />
                    </Card>
                  ))
                : (popular.data ?? []).map((quiz, index) => (
                    <Reveal key={quiz.id} delay={index * 0.06}>
                      <QuizCardTile quiz={quiz} />
                    </Reveal>
                  ))}
            </div>

            {popular.error ? (
              <p className="text-wrong-300 mt-6 text-sm">{popular.error}</p>
            ) : null}
          </div>
        </section>
      ) : (
        <SetupNotice />
      )}

      {/* ══ How it works ═══════════════════════════════════════════════ */}
      <section className="py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Ba bước"
            title="Từ ý thích đến bảng xếp hạng"
          />

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal key={step.number} delay={index * 0.08}>
                <li className="border-ink-600/60 bg-ink-900/40 h-full rounded-2xl border p-6">
                  <span className="font-display text-gradient text-3xl font-bold">
                    {step.number}
                  </span>
                  <h3 className="font-display text-ink-50 mt-3 text-base font-semibold">
                    {step.title}
                  </h3>
                  <p className="text-ink-300 mt-1.5 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ══ Teacher CTA ════════════════════════════════════════════════ */}
      <section className="py-16">
        <div className="container-page">
          <Reveal>
            <div className="glass-panel hairline-gradient shadow-panel relative overflow-hidden rounded-3xl p-8 sm:p-12">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
                <div>
                  <Badge tone="violet" icon={BrainCircuit}>
                    Dành cho giáo viên
                  </Badge>

                  <h2 className="font-display mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                    Soạn đề trong lúc bạn uống hết tách cà phê
                  </h2>

                  <p className="text-ink-300 mt-4 text-base leading-relaxed">
                    Gõ một câu như <em>“Ôn tập lịch sử Việt Nam lớp 9, mức trung bình”</em>. AI
                    Assist trả về 10 câu hỏi, 4 lựa chọn mỗi câu, đáp án đúng và lời giải. Bạn
                    sửa lại theo ý mình, hoặc xuất bản luôn.
                  </p>

                  <ul className="mt-6 space-y-3">
                    {[
                      'Chọn số câu, độ khó và chủ đề',
                      'Sửa từng câu ngay trong trình soạn thảo',
                      'Xuất bản công khai hoặc chia sẻ bằng liên kết',
                    ].map((item) => (
                      <li key={item} className="text-ink-200 flex items-start gap-3 text-sm">
                        <span className="bg-spark-400/15 text-spark-300 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem]">
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <ButtonLink to="/register" variant="spark" size="lg">
                      Tạo tài khoản giáo viên
                      <Rocket className="size-4" aria-hidden />
                    </ButtonLink>
                    <ButtonLink to="/manage" variant="outline" size="lg">
                      Vào trang quản lý
                    </ButtonLink>
                  </div>
                </div>

                {/* A stylised mini editor to sell the flow. */}
                <div className="border-ink-600/70 bg-ink-950/70 rounded-2xl border p-5">
                  <p className="text-ink-400 font-mono text-xs">AI ASSIST</p>

                  <div className="border-ink-600/70 bg-ink-900/70 mt-3 rounded-xl border p-3">
                    <p className="text-ink-200 text-sm">
                      “Ôn tập lịch sử Việt Nam lớp 9, mức trung bình”
                    </p>
                  </div>

                  <div className="text-ink-400 my-4 flex items-center gap-3 text-xs">
                    <span className="from-neon-400 to-violet-glow-500 h-px flex-1 bg-gradient-to-r" />
                    <Sparkles className="text-spark-400 size-3.5" aria-hidden />
                    đang soạn 10 câu…
                    <span className="from-violet-glow-500 to-magenta-400 h-px flex-1 bg-gradient-to-r" />
                  </div>

                  <ul className="space-y-2">
                    {[
                      'Cách mạng tháng Tám thành công năm nào?',
                      'Chiến dịch Điện Biên Phủ kết thúc ngày nào?',
                      'Đại hội VI (1986) đề ra đường lối gì?',
                    ].map((question, index) => (
                      <li
                        key={question}
                        className="border-ink-600/70 bg-ink-800/60 animate-rise flex items-start gap-2.5 rounded-lg border p-2.5"
                        style={{ animationDelay: `${index * 120}ms` }}
                      >
                        <span className="bg-correct-400/15 text-correct-300 mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded text-[0.6rem]">
                          ✓
                        </span>
                        <span className="text-ink-200 text-xs leading-relaxed">{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ Final CTA ══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-20">
        <AuroraBackground variant="quiz" />

        <div className="container-page relative text-center">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Sẵn sàng cho lượt chơi đầu tiên?
            </h2>
            <p className="text-ink-300 mx-auto mt-4 max-w-xl text-base leading-relaxed">
              {TAGLINE}. Không cần thẻ tín dụng, không cần email — chỉ cần chọn một chủ đề bạn
              thấy hứng thú.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to="/explore" size="lg">
                Bắt đầu học
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink to="/leaderboard" variant="secondary" size="lg">
                Xem bảng xếp hạng
                <Users className="size-4" aria-hidden />
              </ButtonLink>
            </div>

            <div className="mt-10 flex justify-center">
              <BrandCredit />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

/** Shown when the app is running before Supabase is wired up. */
function SetupNotice() {
  return (
    <section className="py-16">
      <div className="container-page">
        <Card className="border-spark-400/30 p-6 sm:p-8">
          <Badge tone="spark">Chưa kết nối Supabase</Badge>
          <h2 className="font-display text-ink-50 mt-4 text-xl font-semibold">
            Kho đề thi sẽ hiện ở đây
          </h2>
          <p className="text-ink-300 mt-2 max-w-2xl text-sm leading-relaxed">
            Trang này đang chạy ở chế độ tĩnh. Sao chép <code>.env.example</code> thành{' '}
            <code>.env.local</code>, chạy <code>npm run supabase:start</code> rồi dán URL và anon
            key vào đó — đề thi mẫu và bảng xếp hạng sẽ xuất hiện ngay.
          </p>
        </Card>
      </div>
    </section>
  )
}
