import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { ConsequenceAuthorityBoundary, type AuthorityConsequenceAdmission } from '@/modules/authority/context/public'
import { createPackage3AuditEvent } from '@/modules/observability/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { persistAuditEvent } from '../../security/audit/persistence'
import type { StrictConsequenceProof } from '../../authority/consequence/proof'
import type { ConsentCommand } from './contracts'
export async function currentOwnerAuthority(
  ctx: Pick<MutationCtx, 'db'>,
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>,
) {
  if (owner.provenance.accessKind !== 'ownership'
    || owner.provenance.accessRef !== owner.provenance.currentOwnershipRef) return null
  const row = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', owner.provenance.currentOwnershipRef))
    .unique()
  return row !== null
    && row.lifecycle === 'active'
    && row.accountRef === owner.accountRef
    && row.ownerPrincipalRef === owner.principalRef
    && row.revision === owner.revision.currentOwnership
    ? row
    : null
}

export async function agentAccessConsequenceAdmission(input: Readonly<{
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  ownership: Doc<'accountOwnerships'>
  consent: ConsentCommand
  correlationRef: string
  now: number
}>): Promise<AuthorityConsequenceAdmission> {
  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('agent_access_owner_delegation_unreachable')
    },
  })
  return await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => ({
      principalClass: 'interactive',
      actorPrincipalRef: input.owner.principalRef,
      activeAccountRef: input.owner.accountRef,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: input.owner.provenance.currentOwnershipRef,
        ownershipRevision: input.ownership.revision,
        accountRevision: input.owner.revision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    }),
  }).withCurrentAuthority({
    requiredScopes: input.consent.selectedScopes,
    resourceRefs: ['*'],
    budgetAmount: 1,
    correlationRef: input.correlationRef,
    idempotencyRef: input.correlationRef,
    consequence: {
      action: input.consent.action,
      target: input.consent.target,
      consequenceSummary: input.consent.consequenceSummary,
      statusReadbackRef: `agent-access/oauth/${input.consent.grantRef}`,
      command: {
        version: 'ae.agent-access-consent:v1',
        grantRef: input.consent.grantRef,
        expectedGrantRevision: input.consent.expectedGrantRevision,
        authorityMode: input.consent.authorityMode,
        target: input.consent.target,
        connectionTarget: input.consent.connectionTarget,
        selectedScopes: input.consent.selectedScopes,
        issuanceMaterial: input.consent.issuanceMaterial,
        ...(input.consent.predecessor === undefined ? {} : {
          predecessor: input.consent.predecessor,
        }),
      },
    },
  }, async (admission) => admission)
}
export async function persistProofConsumedAudit(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    admission: AuthorityConsequenceAdmission
    action: ConsentCommand['action']
    proof: StrictConsequenceProof
    authorityGeneration: number
    grantRef: string
    now: number
  }>,
): Promise<void> {
  const descriptor = input.admission.descriptor
  if (descriptor === undefined) throw new Error('agent_access_consequence_descriptor_missing')
  const proofEvidenceRef = canonicalDigest({
    version: 'ae.consequence-proof-evidence:v1',
    reverificationId: input.proof.reverificationId,
  })
  const eventId = `audit:consequence.proof_consumed:${proofEvidenceRef.slice('sha256:'.length)}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'consequence.proof_consumed',
    actorKind: 'owner',
    actorRef: input.admission.actorPrincipalRef,
    activeAccountRef: input.admission.activeAccountRef,
    sourceSystem: 'ae_recorded',
    observedAt: input.now,
    authorityGeneration: input.authorityGeneration,
    targetType: 'consequence_command',
    targetRef: input.grantRef,
    idempotencyKey: brandNonEmpty(input.admission.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.admission.correlationRef, 'CorrelationId'),
    beforeState: 'available',
    outcome: 'consumed',
    evidenceRefs: [`proof-use:${proofEvidenceRef}`],
    redactedPayload: {
      action: input.action,
      targetType: descriptor.target.targetType,
      targetRef: descriptor.target.targetRef,
      targetRevision: descriptor.target.targetRevision,
      proofPreset: 'strict',
      firstFactorAgeMinutes: input.proof.factorEvidence.firstFactorAgeMinutes,
      secondFactorAgeMinutes: input.proof.factorEvidence.secondFactorAgeMinutes,
    },
    commandDigest: brandNonEmpty(descriptor.commandDigest, 'SourceHash'),
    createdAt: input.now,
  })
  if (!audit.valid) throw new Error(`agent_access_consequence_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}
