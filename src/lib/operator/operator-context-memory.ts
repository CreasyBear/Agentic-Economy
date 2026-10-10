import type { OperatorContextReadResult } from '@/lib/operator/operator-context'

type ClerkScope = Readonly<{ user?: { id: string } | null; session?: { id: string } | null; organization?: { id: string } | null }>

/** The signed-in Clerk user, session and organization, read from clerk-js's browser global. */
function currentClerkScope(): string | undefined {
  const clerk = (window as { Clerk?: ClerkScope }).Clerk
  const userId = clerk?.user?.id
  const sessionId = clerk?.session?.id
  return userId === undefined || sessionId === undefined ? undefined
    : `${userId}:${sessionId}:${clerk?.organization?.id ?? ''}`
}

// Browser-only: a server module would share one Account's context across requests.
let remembered: Readonly<{ result: OperatorContextReadResult; scope: string }> | undefined

/** Holds the latest operator context: the entry admission, then each live Convex subscription value. */
export function rememberOperatorContext(result: OperatorContextReadResult | undefined): void {
  if (typeof window === 'undefined') return
  const scope = currentClerkScope()
  remembered = result === undefined || scope === undefined ? undefined : { result, scope }
}

/** The remembered context, only while the same Clerk user, session and organization are signed in. */
export function rememberedOperatorContext(): OperatorContextReadResult | undefined {
  if (typeof window === 'undefined' || remembered === undefined) return undefined
  return remembered.scope === currentClerkScope() ? remembered.result : undefined
}
