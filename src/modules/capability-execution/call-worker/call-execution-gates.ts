"use node";

import { makeFunctionReference } from 'convex/server'
import type { FunctionReturnType } from 'convex/server'
import type { NormalizedStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import {
  parsePublishedToolSnapshot,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { currentToolQuotesMatch } from '../current-tool-quote'
import {
  isPrincipalEnvironmentCompatibleWithTool,
  toolEnvironmentMismatchNextAction,
} from '@/modules/capability-execution/call-contracts'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '@/modules/capability-execution/call-projection/contracts'
import { convergePreRelease, refuseBeforeClaim, type WorkerResult } from './charge'

export const acceptedCallGrantAfterLimitUpdateRef = makeFunctionReference<
  'mutation', { callRef: string }, NormalizedStoredAgentAccessGrant | null
>('capabilityCalls:readAcceptedCallGrantAfterLimitUpdate')

/** The four stable fields a Call is identified by. The credential is not one of
 * them: it rotates while the Call keeps the credential it was admitted under. */
export type CallPrincipalIdentity = Readonly<{
  principalId: string
  ownerId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
}>

type AgentPrincipalRow = NonNullable<
  FunctionReturnType<typeof internal.agentAccessPrincipals.getAgentPrincipal>
>

/** Worker-local mirror of `callIdentityMatches`
 * (`convex/lib/capabilityExecution/callLifecycle/callIdentity.ts`). The Convex
 * helper's dependencies are not importable here without dragging server code
 * into the worker bundle, so the tuple - four comparisons - is restated. */
export function callPrincipalIdentityMatches(
  row: CallPrincipalIdentity | null,
  identity: CallPrincipalIdentity,
): boolean {
  if (row === null) return false
  return [
    row.principalId === identity.principalId,
    row.ownerId === identity.ownerId,
    row.applicationRef === identity.applicationRef,
    row.environment === identity.environment,
  ].every(Boolean)
}

export type EnvironmentBeforeClaimInput =
  | Readonly<{ phase: 'dispatch'; dispatch: OpenDispatch }>
  | Readonly<{
      phase: 'published_tools'
      dispatch: OpenDispatch
      reservedOperation: PublishedTool
      currentOperation: PublishedTool
    }>
  | Readonly<{
      phase: 'principal_tool'
      dispatch: OpenDispatch
      principal: AgentAccessPrincipal
      operation: PublishedTool
    }>

export async function gateEnvironmentBeforeClaim(
  ctx: ActionCtx,
  input: EnvironmentBeforeClaimInput,
): Promise<WorkerResult | null> {
  switch (input.phase) {
    case 'dispatch': {
      const deploymentEnvironment = deploymentPaymentEnvironment(env)
      if (deploymentEnvironment === undefined || deploymentEnvironment !== input.dispatch.environment) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          'This deployment does not admit purchases in this environment.',
        )
      }
      return null
    }
    case 'published_tools': {
      const deploymentEnvironment = deploymentPaymentEnvironment(env)
      if (
        deploymentEnvironment === undefined
        || deploymentEnvironment !== input.reservedOperation.runtimeEnvironment
        || deploymentEnvironment !== input.currentOperation.runtimeEnvironment
      ) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          'This deployment does not admit purchases in this environment.',
        )
      }
      return null
    }
    case 'principal_tool': {
      if (!isPrincipalEnvironmentCompatibleWithTool(input.principal.environment, input.operation)) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          toolEnvironmentMismatchNextAction,
        )
      }
      return null
    }
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

export type PrincipalIdentityBeforeClaimPass = Readonly<{
  principalRow: AgentPrincipalRow
  dispatchedCredentialId: string
  principal: AgentAccessPrincipal
}>

export async function gatePrincipalIdentityBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<WorkerResult | PrincipalIdentityBeforeClaimPass> {
  const principalRow = await ctx.runQuery(internal.agentAccessPrincipals.getAgentPrincipal, {
    principalId: dispatch.principalId,
  })
  const principalReadAt = Date.now()
  if (
    principalRow === null
    || !callPrincipalIdentityMatches(principalRow, dispatch)
    || principalRow.lifecycle !== 'active'
    || (principalRow.expiresAt !== undefined && principalRow.expiresAt <= principalReadAt)
    || principalRow.grantGeneration < dispatch.grantGeneration
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
  const dispatchedCredentialId = principalRow.credentialId
  if (dispatchedCredentialId !== dispatch.credentialId) {
    const successorGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: dispatchedCredentialId,
      environment: dispatch.environment,
      principalId: dispatch.principalId,
      applicationRef: dispatch.applicationRef,
      ownerId: dispatch.ownerId,
      generation: principalRow.grantGeneration,
      now: principalReadAt,
    })
    if (successorGrant === null) {
      return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
    }
  }
  const principal: AgentAccessPrincipal = {
    principalId: principalRow.principalId,
    ownerId: principalRow.ownerId,
    credentialId: dispatchedCredentialId,
    applicationRef: principalRow.applicationRef,
    environment: principalRow.environment,
    scopes: principalRow.scopes,
    authorityMode: principalRow.authorityMode,
  }
  return { principalRow, dispatchedCredentialId, principal }
}

export async function gateGrantValidityBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<WorkerResult | NormalizedStoredAgentAccessGrant> {
  const grantReadAt = Date.now()
  let grant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
    credentialId: dispatch.credentialId,
    environment: dispatch.environment,
    principalId: dispatch.principalId,
    applicationRef: dispatch.applicationRef,
    grantRef: dispatch.grantRef,
    ownerId: dispatch.ownerId,
    now: grantReadAt,
  })
  if (grant === null) {
    grant = await ctx.runMutation(acceptedCallGrantAfterLimitUpdateRef, { callRef: dispatch.callRef })
  }
  if (grant === null) return await refuseBeforeClaim(ctx, dispatch, 'grant_not_found', false, 'Refresh the agent grant and retry.')
  if (grant.generation < dispatch.grantGeneration) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
  return grant
}

export async function gatePublishedSnapshotBeforeClaim(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    currentSnapshot: unknown
    reservedOperation: PublishedTool | undefined
    currentOperation: PublishedTool | undefined
  }>,
): Promise<WorkerResult | null> {
  const { dispatch, currentSnapshot, reservedOperation, currentOperation } = input
  if (currentSnapshot === null) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
  }
  if (reservedOperation === undefined || currentOperation === undefined) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
  }
  if (!currentToolQuotesMatch({
    toolRef: dispatch.toolRef,
    pinned: reservedOperation,
    current: currentOperation,
  })) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
  }
  return null
}

type GrantValidityExpectation = Readonly<{
  grantRef: string
  ownerId: string
  credentialId: string
  principalId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  generation: number
  policyDigest: string
}>

function grantIdentityMatches(
  candidate: unknown,
  expected: GrantValidityExpectation,
): boolean {
  if (candidate === null || typeof candidate !== 'object') return false
  const grant = candidate as Record<string, unknown>
  return grant.grantRef === expected.grantRef
    && grant.ownerId === expected.ownerId
    && grant.credentialId === expected.credentialId
    && grant.principalId === expected.principalId
    && grant.applicationRef === expected.applicationRef
    && grant.environment === expected.environment
    && grant.generation === expected.generation
    && grant.spendingPolicyDigest === expected.policyDigest
}

async function readGrantValidityForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  grantValidityExpectation: GrantValidityExpectation,
): Promise<boolean> {
  const currentGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
    grantRef: grantValidityExpectation.grantRef,
    ownerId: grantValidityExpectation.ownerId,
    credentialId: grantValidityExpectation.credentialId,
    principalId: grantValidityExpectation.principalId,
    applicationRef: grantValidityExpectation.applicationRef,
    environment: grantValidityExpectation.environment,
    generation: grantValidityExpectation.generation,
    now: Date.now(),
  })
  if (currentGrant?.lifecycle === 'active' && grantIdentityMatches(currentGrant, grantValidityExpectation)) return true
  const acceptedGrant = await ctx.runMutation(acceptedCallGrantAfterLimitUpdateRef, { callRef: dispatch.callRef })
  return acceptedGrant?.lifecycle === 'revoked' && grantIdentityMatches(acceptedGrant, grantValidityExpectation)
}

export async function readGrantStillValidForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  grantValidityExpectation: GrantValidityExpectation,
): Promise<boolean> {
  try {
    return await readGrantValidityForRelease(ctx, dispatch, grantValidityExpectation)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'readGrantStillValidForRelease', reason: 'source_unavailable' })
  }
}

export async function gateGrantValidityBeforeRelease(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    claimed: Parameters<typeof convergePreRelease>[2]
    grantValidityExpectation: GrantValidityExpectation
  }>,
): Promise<WorkerResult | null> {
  let finalGrantIsValid: boolean
  try {
    finalGrantIsValid = await readGrantValidityForRelease(ctx, input.dispatch, input.grantValidityExpectation)
  } catch (cause) {
    return degradeBackend(
      cause,
      await convergePreRelease(
        ctx,
        input.dispatch,
        input.claimed,
        'pre_release_failed',
        true,
        'Grant authority could not be revalidated before release.',
      ),
      { site: 'gateGrantValidityBeforeRelease', reason: 'source_unavailable' },
    )
  }
  if (!finalGrantIsValid) {
    return await convergePreRelease(
      ctx,
      input.dispatch,
      input.claimed,
      'grant_generation_stale',
      false,
      'Refresh the agent grant and retry.',
    )
  }
  return null
}

export async function readCurrentOperationForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<PublishedTool | undefined> {
  const currentSnapshot = await ctx.runQuery(
    internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
    { toolRef: dispatch.toolRef },
  )
  return currentSnapshot === null
    ? undefined
    : parsePublishedToolSnapshot(currentSnapshot.toolJson)
}

export async function gateCurrentOperationBeforeRelease(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    claimed: Parameters<typeof convergePreRelease>[2]
    pinnedOperation: PublishedTool
  }>,
): Promise<WorkerResult | PublishedTool> {
  let currentOperation: PublishedTool | undefined
  try {
    currentOperation = await readCurrentOperationForRelease(ctx, input.dispatch)
  } catch (cause) {
    currentOperation = degradeBackend(cause, undefined, { site: 'gateCurrentOperationBeforeRelease', reason: 'source_unavailable' })
  }
  if (
    currentOperation === undefined
    || !currentToolQuotesMatch({
      toolRef: input.dispatch.toolRef,
      pinned: input.pinnedOperation,
      current: currentOperation,
    })
  ) {
    return await convergePreRelease(
      ctx,
      input.dispatch,
      input.claimed,
      'pre_release_failed',
      false,
      'The operation publication or price binding changed before release.',
    )
  }
  return currentOperation
}

export type { GrantValidityExpectation }
