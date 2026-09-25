import { degradeBackend } from '@/lib/observability/degrade-backend'
import { principalRef } from '@/modules/principal-account/public'
import { AGENT_ACCESS_AUTHORITY_MODE_VALUES, agentAuthorityModeAllows } from '@/modules/agent-access/contract'
import { normalizeRequestedScopes, requestedScopesForMode } from '@/modules/agent-access/oauth-state'
import { normalizeAgentAccessToolSelection } from '@/modules/agent-access/policy'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import type { ConsentCommand, ConsentReservationArgs } from './contracts'
import { resolveReplacementPredecessor, samePredecessorSnapshot } from './consentPredecessor'
export async function deriveConsentCommand(
  ctx: Pick<MutationCtx, 'db'>,
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  args: ConsentReservationArgs,
  activeAccountRef: string,
): Promise<ConsentCommand | null> {
  const requested = normalizeRequestedScopes(oauthGrant.requestedScopes.join(' '))
  if (requested === undefined
    || !AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(args.authorityMode)
    || !agentAuthorityModeAllows(requested.mode, args.authorityMode)
    || (requested.profile === 'provider' && args.authorityMode !== 'spending_policy')) return null
  const selectedScopes = requested.profile === 'provider'
    ? requested.scopes
    : requestedScopesForMode(args.authorityMode)
  const approvedSelection = normalizeAgentAccessToolSelection({
    toolAccess: args.approvedToolAccess,
    toolRefs: args.approvedToolRefs,
  })
  if (approvedSelection === undefined
    || (requested.profile === 'provider' && approvedSelection.toolAccess !== 'all_admitted')) return null
  let approvedAccess: Doc<'agentAccessOAuthGrants'>['approvedAccess']
  if (oauthGrant.status === 'pending') {
    if (!toolSelectionNarrows(oauthGrant.requestedAccess, approvedSelection)) return null
    if (!await allSelectedToolsAreCurrent(ctx, approvedSelection.toolRefs)) return null
    approvedAccess = {
      ...oauthGrant.requestedAccess,
      toolAccess: approvedSelection.toolAccess,
      toolRefs: approvedSelection.toolRefs,
    }
  } else {
    if (!sameToolSelection(oauthGrant.approvedAccess, approvedSelection)) return null
    approvedAccess = oauthGrant.approvedAccess
  }
  const issuanceMaterial = {
    clientId: oauthGrant.clientId,
    flow: oauthGrant.flow,
    displayName: oauthGrant.displayName,
    requestedAccess: oauthGrant.requestedAccess,
    approvedAccess,
  } as const

  if (args.connectionTarget.kind === 'new_agent') {
    if (oauthGrant.displayName.trim().length === 0
      || oauthGrant.displayName.length > 80
      || args.expectedTargetRevision !== args.expectedGrantRevision) return null
    if (isCompletedConsentGrant(oauthGrant.status)
      && (oauthGrant.consequenceReservation?.action !== 'agent_access.create'
        || oauthGrant.consequenceReservation.targetRevision !== args.expectedTargetRevision
        || oauthGrant.connectionTarget?.kind !== 'new_agent')) return null
    return {
      action: 'agent_access.create',
      grantRef: oauthGrant.grantRef,
      expectedGrantRevision: args.expectedGrantRevision,
      authorityMode: args.authorityMode,
      connectionTarget: args.connectionTarget,
      resolvedConnectionTarget: { kind: 'new_agent', displayName: oauthGrant.displayName },
      selectedScopes,
      issuanceMaterial,
      target: {
        targetType: 'agent_access_oauth_grant',
        targetRef: oauthGrant.grantRef,
        targetRevision: args.expectedTargetRevision,
      },
      targetRevision: args.expectedTargetRevision,
      consequenceSummary: 'Create an Agent credential with the selected market authority.',
    }
  }

  let canonicalPrincipalRef: string
  try {
    canonicalPrincipalRef = principalRef(args.connectionTarget.principalRef)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'deriveConsentCommand', reason: 'invalid_response' })
  }
  if (oauthGrant.status !== 'pending') {
    const reservation = oauthGrant.consequenceReservation
    if (reservation?.action !== 'agent_access.replace_credential'
      || reservation.predecessor === undefined
      || reservation.targetRevision !== args.expectedTargetRevision
      || oauthGrant.connectionTarget?.kind !== 'replace_credential'
      || oauthGrant.connectionTarget.principalRef !== canonicalPrincipalRef
      || oauthGrant.connectionTarget.replacementMode !== args.connectionTarget.replacementMode) return null
    let predecessor = reservation.predecessor
    if (oauthGrant.status === 'issuing' && args.connectionTarget.replacementMode === 'planned') {
      const currentPredecessor = await resolveReplacementPredecessor(
        ctx,
        canonicalPrincipalRef,
        activeAccountRef,
      )
      if (currentPredecessor === null
        || !samePredecessorSnapshot(reservation.predecessor, currentPredecessor)) return null
      predecessor = currentPredecessor
    }
    return {
      action: 'agent_access.replace_credential',
      grantRef: oauthGrant.grantRef,
      expectedGrantRevision: args.expectedGrantRevision,
      authorityMode: args.authorityMode,
      connectionTarget: {
        kind: 'replace_credential',
        principalRef: canonicalPrincipalRef,
        replacementMode: args.connectionTarget.replacementMode,
      },
      resolvedConnectionTarget: {
        kind: 'replace_credential',
        principalRef: canonicalPrincipalRef,
        replacementMode: args.connectionTarget.replacementMode,
      },
      selectedScopes,
      issuanceMaterial,
      predecessor,
      target: {
        targetType: 'agent',
        targetRef: canonicalPrincipalRef,
        targetRevision: reservation.targetRevision,
      },
      targetRevision: reservation.targetRevision,
      consequenceSummary: 'Replace the selected Agent credential while preserving its canonical identity.',
    }
  }
  const [targetPrincipal, memberships] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('memberPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(2),
  ])
  if (targetPrincipal === null
    || targetPrincipal.kind !== 'agent'
    || targetPrincipal.lifecycle !== 'active'
    || targetPrincipal.revision !== args.expectedTargetRevision
    || memberships.length !== 1
    || memberships[0]?.accountRef !== activeAccountRef) return null
  const predecessor = await resolveReplacementPredecessor(ctx, canonicalPrincipalRef, activeAccountRef)
  if (predecessor === null) return null
  return {
    action: 'agent_access.replace_credential',
    grantRef: oauthGrant.grantRef,
    expectedGrantRevision: args.expectedGrantRevision,
    authorityMode: args.authorityMode,
    connectionTarget: {
      kind: 'replace_credential',
      principalRef: canonicalPrincipalRef,
      replacementMode: args.connectionTarget.replacementMode,
    },
    resolvedConnectionTarget: {
      kind: 'replace_credential',
      principalRef: canonicalPrincipalRef,
      replacementMode: args.connectionTarget.replacementMode,
    },
    selectedScopes,
    issuanceMaterial,
    predecessor,
    target: {
      targetType: 'agent',
      targetRef: canonicalPrincipalRef,
      targetRevision: targetPrincipal.revision,
    },
    targetRevision: targetPrincipal.revision,
    consequenceSummary: 'Replace the selected Agent credential while preserving its canonical identity.',
  }
}

function toolSelectionNarrows(
  requested: Pick<Doc<'agentAccessOAuthGrants'>['requestedAccess'], 'toolAccess' | 'toolRefs'>,
  approved: Readonly<{ toolAccess: 'all_admitted' | 'selected_tools'; toolRefs: readonly string[] }>,
): boolean {
  if (requested.toolAccess === 'all_admitted') return true
  const requestedRefs = new Set(requested.toolRefs)
  return approved.toolAccess === 'selected_tools'
    && approved.toolRefs.every((toolRef) => requestedRefs.has(toolRef))
}

async function allSelectedToolsAreCurrent(
  ctx: Pick<MutationCtx, 'db'>,
  toolRefs: readonly string[],
): Promise<boolean> {
  const rows = await Promise.all(toolRefs.map(async (toolRef) => await ctx.db
    .query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (query) => (
      query.eq('toolRef', toolRef).eq('disposition', 'current')
    ))
    .unique()))
  return rows.every((row) => row !== null)
}

function sameToolSelection(
  left: Pick<Doc<'agentAccessOAuthGrants'>['approvedAccess'], 'toolAccess' | 'toolRefs'>,
  right: Readonly<{ toolAccess: 'all_admitted' | 'selected_tools'; toolRefs: readonly string[] }>,
): boolean {
  return left.toolAccess === right.toolAccess
    && left.toolRefs.length === right.toolRefs.length
    && left.toolRefs.every((toolRef, index) => toolRef === right.toolRefs[index])
}
export function isCompletedConsentGrant(status: Doc<'agentAccessOAuthGrants'>['status']): boolean {
  return status === 'approved' || status === 'delivery_claimed' || status === 'consumed'
}
