import { brandedStringSchema } from '@/modules/common/branded-string-schema'
import { z } from 'zod'
import { defineAction } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { projectToolDescription } from '@/modules/registry/tool-choice-contracts'
import { readJourneySourceStatus, type QuoteStatusSnapshot, type TurnStatusSnapshot } from '@/lib/server/journey-status-source'
import { isPrincipalRef, type PrincipalRef } from '@/modules/principal-account/principal/public'
import { journeyStatusNextSchema, projectCallStatusNext, statusRefSchema, type JourneyRef, type JourneyStatus, type WorkState } from './contract'

const nextSchema = z.array(journeyStatusNextSchema).max(1)
const principalRefSchema = brandedStringSchema(z.string().refine(isPrincipalRef), (value) => value as PrincipalRef)
const stateSchema = z.enum(['submitted', 'working', 'input-required', 'auth-required', 'completed', 'failed', 'canceled', 'rejected', 'outcome-unknown'])
export const journeyStatusResultSchema: z.ZodType<JourneyStatus> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), ref: statusRefSchema.options[0].shape.ref, readiness: z.enum(['ready', 'unverified', 'unavailable']), next: nextSchema }),
  z.strictObject({ kind: z.literal('quote'), ref: statusRefSchema.options[1].shape.ref, principalRef: principalRefSchema, commitment: z.enum(['committed', 'refused', 'expired', 'consumed']), next: nextSchema }),
  z.strictObject({ kind: z.literal('call'), ref: statusRefSchema.options[2].shape.ref, principalRef: principalRefSchema, recovery: callStatusResultSchema, workState: stateSchema, next: nextSchema }),
  z.strictObject({ kind: z.literal('turn'), ref: statusRefSchema.options[3].shape.ref, principalRef: principalRefSchema, workState: stateSchema, next: nextSchema }),
]) as z.ZodType<JourneyStatus>

export const journeyStatusAction = defineAction<{ ref: JourneyRef }, JourneyStatus>({
  id: 'journey.status', name: 'Read journey status',
  summary: 'Read a Tool, Quote, Call or Turn by its original reference without starting new work.',
  boundaries: ['Every status read requires a buyer principal; public Tool details use describe.', 'Reads never reserve money or burn a source-write nonce.'],
  schema: z.strictObject({ ref: statusRefSchema }), outputSchema: journeyStatusResultSchema,
  parameters: [{ name: 'ref', type: 'object', description: 'Typed Tool, Quote, Call or Turn reference.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['call_status'], spendExposure: 'none', approval: 'none' },
  surfaces: ['mcp', 'http', 'cli'],
  credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: 'journey.status:v1', consequenceClass: 'read_only', materialInputPaths: ['ref'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['status_snapshot'], safeContinuations: ['journey.status'], invalidationConditions: [] },
  run: async ({ data, context }) => {
    const principal = context.agentAccessPrincipal
    if (principal === undefined) throw new Error('journey_status_principal_missing')
    const { ref } = data
    if (ref.kind === 'tool') {
      const described = projectToolDescription(await readCapabilityToolDetail({ toolRef: ref.ref }))
      if (described.kind !== 'found') throw new Error('tool_not_found')
      const readiness = described.tool.healthStatus === 'operational' ? 'ready'
        : described.tool.healthStatus === 'unverified' ? 'unverified' : 'unavailable'
      return { kind: 'tool', ref: ref.ref, readiness,
        next: [{ action: 'registry.tools.describe', args: { toolRef: ref.ref }, authority: 'public' }] }
    }
    if (context.request === undefined) throw new Error('journey_status_request_missing')
    const correlationId = context.correlationId ?? globalThis.crypto.randomUUID()
    if (ref.kind === 'call') {
      if (context.callService?.readCallStatus === undefined) throw new Error('call_status_service_unavailable')
      const recovery = callStatusResultSchema.parse(await context.callService.readCallStatus({
        callRef: ref.ref, principal, correlationId,
      }))
      if (recovery.kind === 'refused') {
        if (recovery.code === 'invocation_not_found') throw new Error('call_not_found')
        throw new Error(recovery.retryable ? 'call_status_unavailable' : 'call_status_denied')
      }
      const workState: WorkState = recovery.kind === 'found'
        ? recovery.state === 'cancelled' ? 'canceled'
          : recovery.state === 'invalidated' ? 'rejected'
            : recovery.state === 'awaiting_authority' ? 'auth-required'
              : recovery.state === 'reconciliation_required' ? 'outcome-unknown'
                : recovery.state === 'terminal'
                  ? recovery.result?.kind === 'completed' ? recovery.result.usage.chargeState === 'outcome_unknown' ? 'outcome-unknown' : 'completed'
                    : recovery.result?.kind === 'refused' ? 'rejected' : 'outcome-unknown'
                  : 'working'
        : 'working'
      return { kind: 'call', ref: ref.ref, principalRef: principal.principalId as PrincipalRef,
        recovery, workState, next: projectCallStatusNext(ref.ref, recovery) }
    }
    if (ref.kind === 'quote') {
      const quote = await readJourneySourceStatus('quote', ref.ref, context.request, principal, correlationId) as QuoteStatusSnapshot | null
      if (quote === null) throw new Error('quote_not_found')
      const call = quote.consumedCallRef === undefined ? null : parseCallRef(quote.consumedCallRef)
      return { kind: 'quote', ref: ref.ref, principalRef: principal.principalId as PrincipalRef, commitment: quote.state,
        next: call?.kind === 'valid'
          ? [{ action: 'call.status', args: { callRef: call.ref }, authority: 'same_principal' }]
          : [{ action: 'registry.tools.describe', args: { toolRef: statusRefSchema.options[0].shape.ref.parse(quote.toolRef) }, authority: 'public' }] }
    }
    const turn = await readJourneySourceStatus('turn', ref.ref, context.request, principal, correlationId) as TurnStatusSnapshot
    if (turn.turnRef !== ref.ref) throw new Error('turn_not_found')
    return { kind: 'turn', ref: ref.ref, principalRef: principal.principalId as PrincipalRef, workState: turn.state,
      next: ['completed', 'failed', 'canceled', 'rejected'].includes(turn.state)
        ? turn.inFlightCallRefs.flatMap(callRef => {
          const call = parseCallRef(callRef)
          return call.kind === 'valid'
            ? [{ action: 'call.status' as const, args: { callRef: call.ref }, authority: 'same_principal' as const }]
            : []
        }).slice(0, 1)
        : [{ action: 'journey.status', args: { ref: { kind: 'turn', ref: ref.ref } }, authority: 'same_principal' }],
    }
  },
})
