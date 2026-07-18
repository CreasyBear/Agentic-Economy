import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { RouteMandateMutationPorts } from './ports'
import type { RevokeArgs, RevokeResult } from './types'

export async function revoke(
  args: RevokeArgs,
  ports: RouteMandateMutationPorts,
): Promise<RevokeResult> {
  const authenticated = await ports.authenticateOwnerForMutation(args.requestId)
  if (authenticated.kind === 'unauthenticated') {
    return { kind: 'refused' as const, reason: 'authentication_required' as const }
  }
  if (authenticated.kind === 'not_found') {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  const commandKey = `route-mandate:revoke:${canonicalDigest({
    principalId: authenticated.principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  const priorCommand = await ports.loadRevocationCommand(commandKey)
  if (priorCommand !== null) {
    if (priorCommand.commandDigest !== commandDigest
      || priorCommand.principalId !== authenticated.principalId
      || priorCommand.requestId !== args.requestId
      || priorCommand.mandateRef !== args.mandateRef) {
      return { kind: 'conflict' as const, reason: 'command_changed' as const }
    }
    const revocation = await ports.verifyRevocationCommandReplay(priorCommand)
    return { kind: 'replayed' as const, revocation }
  }
  const head = await ports.loadMandateHead(args.requestId)
  if (head === null || head.principalId !== authenticated.principalId
    || head.currentMandateRef !== args.mandateRef) {
    return { kind: 'conflict' as const, reason: 'mandate_not_current' as const }
  }
  const issueRow = await ports.loadIssueByMandateRef(args.mandateRef)
  if (issueRow === null || issueRow.principalId !== authenticated.principalId) {
    throw new Error('customer_request_route_mandate_head_integrity_failure')
  }
  ports.assertHeadMatchesIssue(head, issueRow)
  const existing = await ports.loadRevocationByMandateRef(args.mandateRef)
  if (existing !== null) {
    return { kind: 'conflict' as const, reason: 'mandate_not_current' as const }
  }
  const recordedAt = ports.now()
  const revocation = await ports.commitCustomerRevocation({
    commandKey,
    commandDigest,
    principalId: authenticated.principalId,
    requestId: args.requestId,
    mandateRef: args.mandateRef,
    head,
    recordedAt,
  })
  return { kind: 'revoked' as const, revocation }
}
