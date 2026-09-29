import { type Infer } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import type { MutationCtx } from '../../../_generated/server'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { resolveBusinessActor } from '../../../authz'
import { ownsPublishedBusinessForOwnerId } from '../../../capabilitySupply'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { canonicalDigest, isCanonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { normalizeSupplySourceSelectionDraft } from '../../../../src/modules/capability-supply/source-selection-draft'
import {
  normalizeSupplySourceDescriptor,
  supplyIntegrationDraftRefs,
} from '../../../../src/modules/capability-supply/integration-draft'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import {
  reserveAgentArgs,
  reserveAgentArgsValue,
  reserveAgentResult,
  reserveOwnerArgs,
  reserveOwnerArgsValue,
  reserveOwnerResult,
} from './contracts'
import {
  ATTEMPT_TTL_MS,
  SOURCE_DRAFT_TTL_MS,
  attemptRef,
  canonicalSource,
  sourceDraftRef,
  validAuthentication,
  type ReserveAttemptArgs,
} from './shared'

type ReserveAgentArgs = Infer<typeof reserveAgentArgsValue>
type ReserveOwnerArgs = Infer<typeof reserveOwnerArgsValue>

export { reserveAgentArgs, reserveAgentResult, reserveOwnerArgs, reserveOwnerResult }

export async function reserveAgentHandler(ctx: MutationCtx, args: ReserveAgentArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  if (admission.kind !== 'allowed'
    || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, admission.ownerId))) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  if (args.environment !== args.agentPrincipal.environment) {
    return { kind: 'refused' as const, code: 'invalid_environment' as const }
  }
  return await reserveAttempt(ctx, args, {
    owningAccountRef: admission.ownerId,
    installedByPrincipalRef: admission.principalId,
  })
}

export async function reserveOwnerHandler(ctx: MutationCtx, args: ReserveOwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner'
    || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, actor.canonicalAccountRef))) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  return await reserveAttempt(ctx, args, {
    owningAccountRef: actor.canonicalAccountRef,
    installedByPrincipalRef: actor.canonicalPrincipalRef,
  })
}

async function reserveAttempt(
  ctx: MutationCtx,
  args: ReserveAttemptArgs,
  actor: Readonly<{ owningAccountRef: string; installedByPrincipalRef: string }>,
) {
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const source = canonicalSource(args.sourceUrl)
  if (source === undefined || !validAuthentication(args) || !isCanonicalDigest(args.inputDigest)) {
    return { kind: 'refused' as const, code: 'invalid_source' as const }
  }

  // A retry must remain resumable even after the saved draft progresses to a
  // connected lifecycle. Check its original command identity before validating
  // the currently mutable draft record.
  const existing = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_commandId', (query) => query.eq('commandId', args.commandId))
    .unique()
  if (existing !== null) {
    const matches = existing.inputDigest === args.inputDigest
      && existing.owningAccountRef === actor.owningAccountRef
      && existing.installedByPrincipalRef === actor.installedByPrincipalRef
      && existing.businessId === args.businessId
      && existing.sourceKind === args.sourceKind
      && existing.sourceUrl === source.href
      && canonicalDigest(existing.authentication) === canonicalDigest(args.authentication)
      && existing.environment === args.environment
      && existing.candidateDraftRef === args.candidateDraftRef
      && (args.candidateDraftRef === undefined || existing.expectedSourceDigest === args.candidateSourceDigest)
    return matches
      ? {
          kind: 'replayed' as const,
          attemptRef: existing.attemptRef,
          expiresAt: existing.expiresAt,
          ...(existing.draftRef === undefined ? {} : { draftRef: existing.draftRef }),
          ...(existing.candidateDraftRef === undefined ? {} : { candidateDraftRef: existing.candidateDraftRef }),
        }
      : { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }

  const selectedSource = args.sourceDescriptorJson === undefined || args.candidateDraftRef !== undefined
    ? undefined
    : normalizeSupplySourceSelectionDraft({
        sourceDescriptorJson: args.sourceDescriptorJson,
        sourceUrl: source.href,
      })
  if (selectedSource?.kind === 'refused'
    || (selectedSource !== undefined && args.sourceKind !== 'mcp_oauth')) {
    return { kind: 'refused' as const, code: 'invalid_source' as const }
  }

  if (args.candidateDraftRef !== undefined) {
    const refs = supplyIntegrationDraftRefs(String(args.businessId), args.candidateDraftRef)
    const path = await ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', refs.accessPathRef))
      .unique()
    const draft = path?.integrationDraft
    let draftSource: ReturnType<typeof normalizeSupplySourceDescriptor>
    try {
      draftSource = draft === undefined
        ? undefined
        : normalizeSupplySourceDescriptor(JSON.parse(draft.sourceDescriptorJson) as unknown)
    } catch (cause) {
      draftSource = degradeBackend(cause, undefined, { site: 'reserveAttempt', reason: 'invalid_response' })
    }
    if (args.sourceKind !== 'http_credential'
      || args.candidateSourceDigest === undefined
      || !isCanonicalDigest(args.candidateSourceDigest)
      || args.sourceDescriptorJson === undefined
      || path === null || path.businessId !== args.businessId || draft === undefined
      || draft.candidateRef !== args.candidateDraftRef
      || draft.sourceDigest !== args.candidateSourceDigest
      || draft.sourceDescriptorJson !== args.sourceDescriptorJson
      || draft.sourceKind !== 'x402'
      || draft.connectionRef !== undefined
      || draftSource?.kind !== 'x402'
      || canonicalSource(draftSource.resourceUrl)?.href !== source.href
      || (draftSource.environment !== undefined && draftSource.environment !== args.environment)) {
      return { kind: 'refused' as const, code: 'invalid_source' as const }
    }
  }

  const now = Date.now()
  const expiresAt = now + ATTEMPT_TTL_MS
  const ref = attemptRef(args.commandId, actor.owningAccountRef)
  const draftRef = selectedSource?.kind === 'valid'
    ? sourceDraftRef(args.commandId, actor.owningAccountRef)
    : undefined
  if (selectedSource?.kind === 'valid' && draftRef !== undefined) {
    await ctx.db.insert('capabilitySupplySourceDrafts', {
      draftRef,
      owningAccountRef: actor.owningAccountRef,
      createdByPrincipalRef: actor.installedByPrincipalRef,
      businessId: args.businessId,
      commandId: args.commandId,
      ...selectedSource.draft,
      lifecycle: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SOURCE_DRAFT_TTL_MS,
    })
  }
  await ctx.db.insert('capabilityProviderConnectionAttempts', {
    attemptRef: ref,
    commandId: args.commandId,
    inputDigest: args.inputDigest,
    owningAccountRef: actor.owningAccountRef,
    installedByPrincipalRef: actor.installedByPrincipalRef,
    businessId: args.businessId,
    sourceKind: args.sourceKind,
    sourceUrl: source.href,
    sourceOrigin: source.origin,
    authentication: args.authentication,
    environment: args.environment,
    lifecycle: 'pending',
    ...(draftRef === undefined || selectedSource?.kind !== 'valid' ? {} : {
      draftRef,
      expectedSourceDigest: selectedSource.draft.expectedSourceDigest,
    }),
    ...(args.candidateDraftRef === undefined ? {} : { candidateDraftRef: args.candidateDraftRef }),
    ...(args.candidateDraftRef === undefined || args.candidateSourceDigest === undefined
      ? {}
      : { expectedSourceDigest: args.candidateSourceDigest }),
    createdAt: now,
    updatedAt: now,
    expiresAt,
  })
  return {
    kind: 'reserved' as const,
    attemptRef: ref,
    expiresAt,
    ...(draftRef === undefined ? {} : { draftRef }),
    ...(args.candidateDraftRef === undefined ? {} : { candidateDraftRef: args.candidateDraftRef }),
  }
}
