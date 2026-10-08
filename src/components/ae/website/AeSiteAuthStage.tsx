import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AuthGridBackground } from '@/components/ae/shared/reui-pro/auth/AuthGridBackground'
import './AuthComposition.css'

/** Licensed REUI Auth 18: https://reui.io/preview/base/auth-18
 * auth.tsx SHA-256 0a22a561aa238661a980034c4a1e124da3a7cf29593193d0eafa371ed361efbb.
 * Retains split sidebar/form geometry and grid background. Aecon product copy
 * replaces demo endorsements. Clerk remains the sole authentication/form owner.
 */
export function AeSiteAuthStage({ labelledBy, children }: { labelledBy?: string; children: ReactNode }) {
  return <section className="arc-market arc-auth-stage" aria-labelledby={labelledBy}>
    <aside className="arc-auth-story" aria-label="About Agentic Economy">
      <AuthGridBackground />
      <div className="relative z-10 flex min-h-full w-full flex-col justify-between gap-10">
        <p className="text-sm font-medium tracking-wide">AGENTIC ECONOMY</p>
        <div className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-6">
          <p className="arc-auth-statement">Put useful tools<br />to work.</p>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">Find a Tool. Review what it costs and what it receives. Keep the result and the receipt in your workspace.</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">Connecting an Agent? Sign in first, then review its access and spending limits.</p>
      </div>
    </aside>
    <div className="arc-auth-form-column">
      <div className="arc-auth-stage-inner">{children}</div>
      <nav aria-label="Account help" className="arc-auth-help">
        <Link to="/market">Explore the Market</Link><Link to="/support">Get help</Link>
        <Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link>
      </nav>
    </div>
  </section>
}
