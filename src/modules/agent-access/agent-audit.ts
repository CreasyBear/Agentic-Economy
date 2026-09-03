import { accountRef } from '@/modules/principal-account/account/public'
import { credentialRef } from '@/modules/principal-account/external-identity/public'
import { principalRef } from '@/modules/principal-account/principal/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty, type AuditEventId, type CorrelationId, type OperationKey, type SourceHash } from '@/modules/common/ids'

type AgentLevelTransition =
  | Readonly<{ eventType: 'agent.created'; beforeState: 'missing'; outcome: 'created' }>
  | Readonly<{ eventType: 'agent.renamed'; beforeState: 'named'; outcome: 'renamed' }>
  | Readonly<{ eventType: 'agent.policy_updated'; beforeState: 'current'; outcome: 'updated' }>
  | Readonly<{ eventType: 'agent.disconnected'; beforeState: 'connected_or_attention'; outcome: 'disconnected' }>

type AgentCredentialTransition =
  | Readonly<{ eventType: 'agent.credential.authenticated'; beforeState: 'presented'; outcome: 'authenticated' }>
  | Readonly<{
      eventType: 'agent.credential.denied'
      beforeState: 'presented'
      outcome: 'denied'
      reasonCode: 'authentication_required' | 'scope_required'
    }>
  | Readonly<{ eventType: 'agent.credential.replacement_prepared'; beforeState: 'predecessor_active'; outcome: 'replacement_prepared' }>
  | Readonly<{ eventType: 'agent.credential.replacement_promoted'; beforeState: 'replacement_prepared'; outcome: 'replacement_promoted' }>
  | Readonly<{ eventType: 'agent.credential.replacement_cancelled'; beforeState: 'replacement_prepared'; outcome: 'replacement_cancelled' }>
  | Readonly<{ eventType: 'agent.credential.revoked'; beforeState: 'active_or_stale'; outcome: 'revoked' }>
  | Readonly<{ eventType: 'agent.credential.expired'; beforeState: 'active'; outcome: 'expired' }>

type AgentAuditContext = Readonly<{
  actorPrincipalRef: string
  activeAccountRef: string
  agentPrincipalRef: string
  correlationRef: string
  idempotencyRef: string
  authorityGeneration?: number
  occurredAt: number
}>

export type AgentAuditInput =
  | (AgentAuditContext & AgentLevelTransition)
  | (AgentAuditContext & AgentCredentialTransition & Readonly<{ credentialRef: string }>)

export type AgentAuditEnvelope = Readonly<{
  eventId: AuditEventId
  eventType: AgentAuditInput['eventType']
  actorKind: 'owner' | 'agent'
  actorRef: string
  activeAccountRef: string
  sourceSystem: 'ae_recorded'
  observedAt: number
  authorityGeneration?: number
  targetType: 'agent'
  targetRef: string
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  beforeState: string
  outcome: string
  reasonCode?: string
  evidenceRefs: readonly string[]
  redactedPayload: Readonly<Record<string, string>>
  commandDigest: SourceHash
  createdAt: number
}>

/**
 * Build the closed, secret-free audit envelope for Agent lifecycle changes.
 * The Agent is always the indexed aggregate target; an affected credential is
 * retained only as its canonical credential reference.
 */
export function createAgentAuditEnvelope(input: AgentAuditInput): AgentAuditEnvelope {
  const actor = principalRef(input.actorPrincipalRef)
  const account = accountRef(input.activeAccountRef)
  const agent = principalRef(input.agentPrincipalRef)
  const affectedCredential = 'credentialRef' in input
    ? credentialRef(input.credentialRef)
    : undefined
  const commandDigest = canonicalDigest({
    format: 'ae.agent-audit:v1',
    eventType: input.eventType,
    actorPrincipalRef: actor,
    activeAccountRef: account,
    agentPrincipalRef: agent,
    credentialRef: affectedCredential ?? null,
    correlationRef: agentAuditOpaqueRef(input.correlationRef, 'correlationRef'),
    idempotencyRef: agentAuditOpaqueRef(input.idempotencyRef, 'idempotencyRef'),
    beforeState: input.beforeState,
    outcome: input.outcome,
    reasonCode: 'reasonCode' in input ? input.reasonCode : null,
    authorityGeneration: input.authorityGeneration ?? null,
  })
  const credentialObservation = input.eventType === 'agent.credential.authenticated'
    || input.eventType === 'agent.credential.denied'
  const eventIdentityDigest = credentialObservation
    ? canonicalDigest({
        format: 'ae.agent-credential-observation:v1',
        eventType: input.eventType,
        actorPrincipalRef: actor,
        activeAccountRef: account,
        agentPrincipalRef: agent,
        credentialRef: affectedCredential ?? null,
        idempotencyRef: agentAuditOpaqueRef(input.idempotencyRef, 'idempotencyRef'),
      })
    : commandDigest
  const eventId = `audit:${input.eventType}:${eventIdentityDigest.slice('sha256:'.length)}`
  const actorKind = credentialObservation ? 'agent' as const : 'owner' as const
  const redactedPayload: Readonly<Record<string, string>> = affectedCredential === undefined
    ? {}
    : { credentialRef: affectedCredential }
  return Object.freeze({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: input.eventType,
    actorKind,
    actorRef: actor,
    activeAccountRef: account,
    sourceSystem: 'ae_recorded',
    observedAt: input.occurredAt,
    ...(input.authorityGeneration === undefined
      ? {}
      : { authorityGeneration: input.authorityGeneration }),
    targetType: 'agent',
    targetRef: agent,
    idempotencyKey: brandNonEmpty(input.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.outcome,
    ...('reasonCode' in input ? { reasonCode: input.reasonCode } : {}),
    evidenceRefs: affectedCredential === undefined
      ? []
      : [`credential:${affectedCredential}`],
    redactedPayload,
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.occurredAt,
  })
}

export function agentAuditOpaqueRef(
  value: string,
  label: 'correlationRef' | 'idempotencyRef',
): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u.test(value)
    || /(?:sk_(?:live|test)_|whsec_|private[_-]?key)/iu.test(value)) {
    throw new Error(`agent_audit_${label}_invalid`)
  }
  return value
}
