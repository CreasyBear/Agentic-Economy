import { makeFunctionReference } from 'convex/server'
import type { ActionCtx } from '../../../_generated/server'

export type ReconciledCallAuthority = Readonly<{
  principalId: string
  accountRef: string
  credentialId: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  expiresAt: number
}>
type ReconciledCallAuthorityResult =
  | Readonly<{ kind: 'authorized'; authority: ReconciledCallAuthority }>
  | Readonly<{ kind: 'refused' }>

const reconcileCallWorkloadAuthorityRef = makeFunctionReference<
  'mutation',
  { callRef: string },
  ReconciledCallAuthorityResult
>('capabilityCalls:reconcileCallWorkloadAuthority')

export async function reconcileCallWorkloadAuthority(
  ctx: Pick<ActionCtx, 'runMutation'>,
  callRef: string,
  expected?: Readonly<{ principalId: string; credentialId: string }>,
): Promise<ReconciledCallAuthority | null> {
  const result = await ctx.runMutation(reconcileCallWorkloadAuthorityRef, { callRef })
  if (result.kind !== 'authorized'
    || (expected !== undefined && (
      result.authority.principalId !== expected.principalId
      || result.authority.credentialId !== expected.credentialId
    ))) return null
  return result.authority
}
