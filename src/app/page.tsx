import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui-app";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/locale";

export default async function HomePage() {
  const { dict, locale } = await getDictionary();
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen bg-[#f3efe4] text-[#1c1914]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} />
          <Button variant="outline" className="h-10" render={<Link href={user ? "/dashboard" : "/login"} />}>{user ? dict.nav.dashboard : dict.home.cta}</Button>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 pb-16">
        <section className="grid items-end gap-8 rounded-3xl bg-[#10281f] px-6 py-10 text-[#f6f3ec] md:grid-cols-[1.3fr_0.7fr] md:px-10">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[#f3e4b4]">{dict.home.kicker}</p>
            <p className="mt-4 inline-flex rounded-full bg-[#f3e4b4] px-3 py-1 text-xs font-medium text-[#10281f]">{dict.assist.badge}</p>
            <h1 className="mt-3 max-w-xl font-heading text-4xl leading-tight font-semibold md:text-6xl">{dict.home.title}</h1>
            <p className="mt-4 max-w-xl text-base text-[#d7e4dc]">{dict.home.lede}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="h-11 bg-[#f3e4b4] text-[#10281f] hover:bg-[#f3e4b4]/90" render={<Link href="/login" />}>{dict.home.cta}</Button>
              <Button variant="outline" className="h-11 border-[#d7e4dc] bg-transparent text-[#f6f3ec] hover:bg-white/10" render={<Link href="/register" />}>{dict.home.secondary}</Button>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              ["01", dict.nav.categories === "Categories" ? "Exit" : dict.home.exit.slice(0, 24), dict.home.exit],
              ["02", "Entrance", dict.home.entrance],
              ["03", "Recruitment", dict.home.job],
            ].map(([index, title, body]) => (
              <article key={index} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p className="text-xs text-[#f3e4b4]">{index}</p>
                <h2 className="font-heading text-xl">{title}</h2>
                <p className="mt-1 text-sm text-[#d7e4dc]">{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-heading text-3xl">{dict.home.stepsTitle}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              [dict.home.s1, dict.home.s1b],
              [dict.home.s2, dict.home.s2b],
              [dict.home.s3, dict.home.s3b],
              [dict.home.s4, dict.home.s4b],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                <h3 className="font-heading text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-3xl bg-[#10281f] px-6 py-8 text-[#f6f3ec] md:px-8">
          <h2 className="font-heading text-3xl">{dict.assist.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d7e4dc]">{dict.assist.note}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              [dict.assist.grade, dict.assist.gradeb],
              [dict.assist.quality, dict.assist.qualityb],
              [dict.assist.translate, dict.assist.translateb],
              [dict.assist.feedback, dict.assist.feedbackb],
              [dict.assist.paper, dict.assist.paperb],
              [dict.assist.proctor, dict.assist.proctorb],
              [dict.assist.drafts, dict.assist.draftsb],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <h3 className="font-heading text-lg">{title}</h3>
                <p className="mt-1 text-sm text-[#d7e4dc]">{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-heading text-3xl">{dict.features.title}</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {([
              [dict.features.security, [
                [dict.features.randomQ, dict.features.randomQb],
                [dict.features.randomO, dict.features.randomOb],
                [dict.features.autoSubmit, dict.features.autoSubmitb],
                [dict.features.monitor, dict.features.monitorb],
                [dict.features.risk, dict.features.riskb],
              ]],
              [dict.features.smart, [
                [dict.features.marking, dict.features.markingb],
                [dict.features.analytics, dict.features.analyticsb],
                [dict.features.difficulty, dict.features.difficultyb],
                [dict.features.ai, dict.features.aib],
                [dict.features.student, dict.features.studentb],
              ]],
            ] as const).map(([heading, items]) => (
              <div key={heading} className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
                <h3 className="font-heading text-2xl">{heading}</h3>
                <ul className="mt-4 grid gap-4">
                  {items.map(([title, body]) => (
                    <li key={title}>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-3xl bg-[#f8efd4] p-6 md:p-8">
          <h2 className="font-heading text-3xl">{dict.home.releaseTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6">{dict.home.releaseBody}</p>
        </section>
      </main>
    </div>
  );
}
