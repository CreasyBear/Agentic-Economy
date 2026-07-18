import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  compileRouteMandate,
  routeMandateAuthorityScopeDigest,
} from '@/modules/customer-request/route-mandate'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import type { RouteMandateMutationPorts } from './ports'
import type { IssueCommandArgs, IssueResult } from './types'

export async function issue(
  args: IssueCommandArgs,
  ports: RouteMandateMutationPorts,
): Promise<IssueResult> {
  const authenticated = await ports.authenticateOwnerForMutation(
    args.requestId,
    args.serviceAuthorization,
  )
  if (authenticated.kind === 'unauthenticated') {
    return { kind: 'refused' as const, reason: 'authentication_required' as const }
  }
  if (authenticated.kind === 'not_found') {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  if (args.serviceAuthorization !== undefined
    && (args.serviceAuthorization.command.revision !== args.expectedRequestRevision
      || args.serviceAuthorization.command.routeRef !== customerRouteRef(
        args.expectedGenerationRef, args.selectedRoutePlanId,
      )
      || args.serviceAuthorization.command.idempotencyKey !== args.idempotencyKey)) {
    return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
  }

  const commandKey = routeMandateCommandKey(authenticated.principalId, args)
  const commandDigest = canonicalDigest(issueCommandMaterial(args))
  const priorCommand = await ports.loadIssueCommand(commandKey)
  if (priorCommand !== null) {
    if (priorCommand.commandDigest !== commandDigest
      || priorCommand.principalId !== authenticated.principalId
      || priorCommand.requestId !== args.requestId
      || priorCommand.mandateRef !== priorCommand.result.mandateRef
      || priorCommand.mandateDigest !== priorCommand.result.mandateDigest) {
      return { kind: 'conflict' as const, reason: 'command_changed' as const }
    }
    const mandate = await ports.verifyIssueCommandReplay(priorCommand)
    return { kind: 'replayed' as const, mandate }
  }

  const current = await ports.openCurrentRouteGeneration(args.requestId)
  if (current.kind === 'not_found') {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  if (current.requestRevision !== args.expectedRequestRevision) {
    return { kind: 'conflict' as const, reason: 'request_revision_changed' as const }
  }
  if (current.generation.generationRef !== args.expectedGenerationRef) {
    return { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
  }
  const graphStatus = await ports.routePlanGenerationGraphStatus(
    args.requestId,
    args.expectedGenerationRef,
  )
  if (graphStatus === 'stale') {
    return { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
  }
  if (graphStatus === 'invalid') {
    return { kind: 'refused' as const, reason: 'route_generation_invalid' as const }
  }

  const activeHead = await ports.loadMandateHead(args.requestId)
  if (activeHead !== null) {
    const revocation = await ports.loadRevocationByMandateRef(activeHead.currentMandateRef)
    if (revocation === null) {
      return { kind: 'conflict' as const, reason: 'active_mandate_exists' as const }
    }
    const priorIssue = await ports.loadIssueByMandateRef(activeHead.currentMandateRef)
    if (priorIssue === null) {
      throw new Error('customer_request_route_mandate_replacement_integrity_failure')
    }
    ports.assertReplacementIntegrity(activeHead, priorIssue, revocation)
  }

  const issuedAt = ports.now()
  const authenticationEvidence = {
    evidenceRef: `clerk-identity:${canonicalDigest(authenticated.identity)}`,
    ...authenticated.identity,
  }
  const authorizationEvidenceMaterial = {
    kind: 'explicit' as const,
    commandDigest,
    principalId: authenticated.principalId,
    requestId: args.requestId,
    requestRevision: args.expectedRequestRevision,
    generationRef: args.expectedGenerationRef,
    selectedRoutePlanId: args.selectedRoutePlanId,
    maximumTotalSpend: args.maximumTotalSpend,
    issuedAt,
    expiresAt: args.expiresAt,
    authenticatedBy: authenticated.identity,
  }
  const authorizationEvidenceDigest = canonicalDigest(authorizationEvidenceMaterial)
  const authorizationEvidence = {
    kind: 'explicit' as const,
    evidenceRef: `route-authorization:explicit:${authorizationEvidenceDigest}`,
    evidenceDigest: authorizationEvidenceDigest,
    commandDigest,
    principalId: authenticated.principalId,
    requestId: args.requestId,
    requestRevision: args.expectedRequestRevision,
    generationRef: args.expectedGenerationRef,
    selectedRoutePlanId: args.selectedRoutePlanId,
    maximumTotalSpend: { ...args.maximumTotalSpend },
    issuedAt,
    expiresAt: args.expiresAt,
    authenticatedActor: { ...authenticated.identity },
  }
  let authorityScopeDigest: string
  try {
    authorityScopeDigest = routeMandateAuthorityScopeDigest({
      generation: current.generation,
      selectedRoutePlanId: args.selectedRoutePlanId,
      principalId: authenticated.principalId,
      authorizationKind: 'explicit',
      maximumTotalSpend: args.maximumTotalSpend,
      issuedAt,
      expiresAt: args.expiresAt,
    })
  } catch {
    return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
  }
  const authorization = {
    kind: 'explicit' as const,
    authorizationEvidenceRef: authorizationEvidence.evidenceRef,
    authorizationEvidenceDigest,
    authorityScopeDigest,
  }
  const compiled = compileRouteMandate({
    generation: current.generation,
    selectedRoutePlanId: args.selectedRoutePlanId,
    principal: {
      principalId: authenticated.principalId,
      authenticationEvidenceRef: authenticationEvidence.evidenceRef,
    },
    authorization,
    maximumTotalSpend: args.maximumTotalSpend,
    expiresAt: args.expiresAt,
    now: issuedAt,
  })
  if (compiled.kind !== 'compiled') {
    return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
  }
  const persisted = await ports.persistIssue({
    mandate: compiled.mandate,
    evidence: { authentication: authenticationEvidence, authorization: authorizationEvidence },
    principalId: authenticated.principalId,
    requestId: args.requestId,
    requestRevision: args.expectedRequestRevision,
    generationRef: args.expectedGenerationRef,
    routePlanId: args.selectedRoutePlanId,
    commandKey,
    commandDigest,
    recordedAt: issuedAt,
  })
  if (persisted.kind === 'active_mandate_exists') {
    return { kind: 'conflict' as const, reason: 'active_mandate_exists' as const }
  }
  return { kind: 'issued' as const, mandate: persisted.mandate }
}

function routeMandateCommandKey(
  principalId: string,
  args: IssueCommandArgs,
): string {
  return `route-mandate:issue:${canonicalDigest({
    principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
}

function issueCommandMaterial(args: IssueCommandArgs): Readonly<{
  requestId: string
  expectedRequestRevision: number
  expectedGenerationRef: string
  selectedRoutePlanId: string
  maximumTotalSpend: Readonly<{ currency: string; amountMinor: number }>
  expiresAt: number
  idempotencyKey: string
}> {
  return {
    requestId: args.requestId,
    expectedRequestRevision: args.expectedRequestRevision,
    expectedGenerationRef: args.expectedGenerationRef,
    selectedRoutePlanId: args.selectedRoutePlanId,
    maximumTotalSpend: { ...args.maximumTotalSpend },
    expiresAt: args.expiresAt,
    idempotencyKey: args.idempotencyKey,
  }
}
