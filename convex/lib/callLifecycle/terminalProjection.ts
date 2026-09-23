import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import { transportObservationDigest } from '@/modules/capability-supply/public'
import type { CanonicalTerminalOutcome } from '@/modules/capability-execution/convex'

type TerminalOutcomeContext = Readonly<{
  observation: RouteTransportObservation
  recordedAt: string
  contractValidOutput: boolean
  deliveryOutcome?: 'not_released' | 'released' | 'unknown'
  evidenceDigest: string
}>

type TerminalOutcomeRule = Readonly<{
  matches: (ctx: TerminalOutcomeContext) => boolean
  build: (ctx: TerminalOutcomeContext) => CanonicalTerminalOutcome
}>

function uncertainOutcome(ctx: TerminalOutcomeContext): CanonicalTerminalOutcome {
  return {
    kind: 'uncertain',
    errorDigest: ctx.evidenceDigest,
    reconciliationRequiredAt: new Date(Date.parse(ctx.recordedAt) + 1_000).toISOString(),
    release: 'possibly_released',
  }
}

function failedNotReleased(ctx: TerminalOutcomeContext): CanonicalTerminalOutcome {
  return { kind: 'failed', errorDigest: ctx.evidenceDigest, release: 'not_released' }
}

function returnedReleased(ctx: TerminalOutcomeContext): CanonicalTerminalOutcome {
  return {
    kind: 'returned',
    businessOutcome: 'operation_succeeded',
    resultRef: `operation-result:v1:${ctx.evidenceDigest}`,
    resultDigest: ctx.evidenceDigest,
    resultReferenceable: true,
    release: 'released',
  }
}

const TERMINAL_OUTCOME_RULES: readonly TerminalOutcomeRule[] = [
  {
    matches: (ctx) => ctx.deliveryOutcome === 'unknown',
    build: uncertainOutcome,
  },
  {
    matches: (ctx) => ctx.deliveryOutcome === 'not_released'
      && ctx.observation.disposition === 'succeeded'
      && !ctx.contractValidOutput,
    build: failedNotReleased,
  },
  {
    matches: (ctx) => ctx.observation.disposition === 'succeeded'
      && ctx.observation.outputJson !== undefined
      && ctx.contractValidOutput
      && !ctx.observation.releaseStarted,
    build: failedNotReleased,
  },
  {
    matches: (ctx) => ctx.observation.disposition === 'succeeded'
      && ctx.observation.outputJson !== undefined
      && ctx.contractValidOutput,
    build: returnedReleased,
  },
  {
    matches: (ctx) => ctx.observation.disposition === 'succeeded'
      && ctx.observation.outputJson !== undefined
      && !ctx.contractValidOutput
      && !ctx.observation.releaseStarted,
    build: failedNotReleased,
  },
  {
    matches: (ctx) => ctx.observation.disposition === 'refused' && !ctx.observation.releaseStarted,
    build: failedNotReleased,
  },
]

export function canonicalTerminalOutcome(
  observation: RouteTransportObservation,
  recordedAt: string,
  contractValidOutput = true,
  deliveryOutcome?: 'not_released' | 'released' | 'unknown',
): CanonicalTerminalOutcome {
  const evidenceDigest = transportObservationDigest(observation)
  const context: TerminalOutcomeContext = {
    observation,
    recordedAt,
    contractValidOutput,
    ...(deliveryOutcome !== undefined ? { deliveryOutcome } : {}),
    evidenceDigest,
  }
  for (const rule of TERMINAL_OUTCOME_RULES) {
    if (rule.matches(context)) return rule.build(context)
  }
  return uncertainOutcome(context)
}
