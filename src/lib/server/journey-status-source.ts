import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { WorkState } from '@/modules/actions/contract'

export type QuoteStatusSnapshot = Readonly<{
  quoteRef: string; toolRef: string; principalRef: string
  state: 'committed' | 'refused' | 'expired' | 'consumed'
  consumedCallRef?: string; expiresAt: number
  maxSpend: Readonly<{ currency: 'AUD'; units: string; exponent: 6 }>; currency: 'AUD'
}>
export type TurnStatusSnapshot = Readonly<{
  turnRef: string; threadId: string; state: WorkState; inFlightCallRefs: readonly string[]
}>

const quoteQuery = sourceQuery<Record<string, unknown>, QuoteStatusSnapshot | null>('capabilityQuotesStatus:readQuoteStatus')
const turnQuery = sourceQuery<Record<string, unknown>, TurnStatusSnapshot>('chatTurns:readTurn')

/** The same signed source-read envelope as native Call status; queries cannot burn a nonce. */
export async function readJourneySourceStatus(
  kind: 'quote' | 'turn', ref: string, request: Request, principal: AgentAccessPrincipal,
  correlationId: string,
): Promise<QuoteStatusSnapshot | TurnStatusSnapshot | null> {
  const operationKey = canonicalDigest({ contract: 'journey.status', kind, ref, principal: principal.principalId })
  const actor = kind === 'turn' ? { ...principal, kind: 'agent_key' as const } : principal
  const command = { principal: actor, [kind === 'quote' ? 'quoteRef' : 'turnRef']: ref, operationKey, correlationId }
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request, command, body: '', scope: 'protected_action', operationKey, correlationId,
  })
  const args = { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }
  return kind === 'quote'
    ? await callPublicSourceQuery(quoteQuery, args)
    : await callPublicSourceQuery(turnQuery, args)
}
