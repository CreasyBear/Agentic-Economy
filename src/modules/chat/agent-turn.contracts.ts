import { z } from 'zod'

import type { PrincipalRef, AccountRef } from '@/modules/principal-account/public'
import type { CallRef, QuoteRef } from '@/modules/capability-execution/call-contracts'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type {
  JourneyEvent, JourneyProblem, ThreadRef, TurnRef, WorkState,
} from '@/modules/actions/contract'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'

export type ChatPrincipal =
  | Readonly<{ kind: 'agent_key'; principalRef: PrincipalRef; accountRef: AccountRef; authority: Readonly<{
      credentialId: string; applicationRef: string; environment: 'sandbox' | 'production'
      scopes: readonly string[]; grantRef: string; authorityMode: AgentAccessAuthorityMode
    }> }>
  | Readonly<{ kind: 'clerk'; principalRef: PrincipalRef; accountRef: AccountRef;
      authority: Readonly<{ kind: 'resolved_owner_authority' }> }>

/** Locators only; no secret or model-visible proof. Rechecked against durable grant at each effect. */
export type TrustedChatAuthority = Readonly<{
  kind: 'agent_key'
  turnRef: string
  credentialLocator: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  grantRef: string
}>
export type TurnAdmission =
  | Readonly<{ kind: 'accepted'; threadId: ThreadRef; turnId: TurnRef; principal: ChatPrincipal }>
  | Readonly<{ kind: 'auth-required' | 'input-required'; problem: JourneyProblem }>

export type ChatDomainPart =
  | Readonly<{ type: 'data-ae-state'; value: JourneyEvent }>
  | Readonly<{ type: 'data-ae-quote'; value: { quoteRef: QuoteRef; maxSpendAud: string; expiresAt: number } }>
  | Readonly<{ type: 'data-ae-receipt'; value: { callRef: CallRef; artifactRef: string } }>
  | Readonly<{ type: 'data-ae-problem'; value: JourneyProblem }>

export type ChatCliEvent = Readonly<{ threadId: ThreadRef; turnId: TurnRef; sequence: number }> & (
  | Readonly<{ type: 'start' | 'finish'; state: WorkState }>
  | Readonly<{ type: 'text-delta' | 'reasoning-summary'; text: string }>
  | Readonly<{ type: 'tool-call' | 'tool-result'; toolRef: PublicToolRef; payload: unknown }>
  | Readonly<{ type: 'quote'; quoteRef: QuoteRef }>
  | Readonly<{ type: 'receipt'; callRef: CallRef; artifactRef: string }>
  | Readonly<{ type: 'error'; problem: JourneyProblem }>
)

export type CancelTurnResult =
  | Readonly<{ kind: 'stopped'; turnRef: TurnRef; inFlightEffects: readonly [] }>
  | Readonly<{ kind: 'in_flight'; turnRef: TurnRef; inFlightEffects: readonly { callRef: CallRef }[] }>

const clarifyChoice = z.string().trim().min(1).max(80)

export const chatClarifyInputSchema = z.strictObject({
  question: z.string().trim().min(1).max(200),
  choices: z.array(clarifyChoice).length(3),
})

export const chatClarifyOutputSchema = z.strictObject({
  question: z.string().trim().min(1).max(200),
  status: z.literal('awaiting_answer'),
})

export function storedClarifyAnswer(value: unknown): string | undefined {
  const parsed = z.string().trim().min(1).max(2_000).safeParse(value)
  return parsed.success ? parsed.data : undefined
}
