import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { AeQueryBox } from '@/components/ae/landing/AeQueryBox'
import { AeHandDrawnHero } from '@/components/ae/landing/AeHandDrawnHero'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { encodeAnswerId } from '@/modules/answer/public'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate()

  function handleSubmit(query: string) {
    // Home does one job: prompt the ask. The cited answer lives on /q/$answerId,
    // a shareable, deterministic answer page (home to answer handoff, adapted
    // to AE's read-only register).
    void navigate({ to: '/q/$answerId', params: { answerId: encodeAnswerId(query) } })
  }

  return (
    <AePublicShell>
      <section className="ae-landing-hero" aria-labelledby="ae-landing-title">
        <div className="ae-landing-hero__grid">
          <div className="ae-landing-hero__copy">
            <p className="ae-landing-kicker">Agentic Economy · home of agentic commerce</p>
            <h1 id="ae-landing-title" className="ae-landing-title">
              Ask for a local service. Get a cited answer.
            </h1>
            <p className="ae-landing-lede">
              Type a real need and a place. The answer names listed local businesses, what they handle,
              where they work, and your next step. No booking, no payment.
            </p>
            <AeQueryBox onSubmit={handleSubmit} />
          </div>

            <AeHandDrawnHero
            src="/images/illustration/hero-victorian-house.png"
            alt="Hand-drawn pen-and-ink Victorian suburban house with a faint city skyline behind it."
            caption="A register of who handles what, where."
          />
        </div>
      </section>
    </AePublicShell>
  )
}
