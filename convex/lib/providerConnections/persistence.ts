import type { MutationCtx } from '../../_generated/server'
import type { Connection, ConnectionShare } from '../../../src/modules/connections/lifecycle/public'
import type { AccountRef } from '../../../src/modules/principal-account/public'
import { secretRef } from '../../../src/modules/secrets/convex'
import {
  canonicalConnectionActionContext,
  createCanonicalConnectionLifecycleService,
  failClosedCanonicalLifecycleError,
  resolveUniqueCanonicalGrant,
  type CanonicalActor,
} from './authority'

export async function installCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    providerNamespace: string
    providerLocator?: string
    credentialRef: string | null
  }>,
): Promise<Connection | null> {
  let pointer: ReturnType<typeof secretRef> | undefined
  try {
    pointer = input.credentialRef === null ? undefined : secretRef(input.credentialRef)
  } catch {
    return null
  }
  const resourceRefs = [
    `connection-provider:${input.providerNamespace}`,
    ...(input.providerLocator === undefined ? [] : [`connection-provider:${input.providerNamespace}:${input.providerLocator}`]),
    ...(pointer === undefined ? [] : [`secret:${pointer}`]),
  ]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, 'install', resourceRefs)
  if (grant === null) return null
  try {
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).install({
      context: canonicalConnectionActionContext(input.actor, 'install', input.commandId),
      grantRef: grant.grantRef,
      expectedGrantGeneration: grant.generation,
      providerNamespace: input.providerNamespace,
      ...(input.providerLocator === undefined ? {} : { providerLocator: input.providerLocator }),
      ...(pointer === undefined ? {} : { secretRef: pointer }),
      externalState: { kind: 'known', value: 'ready' },
    })
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

export async function transitionCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    connection: Connection
    operation: 'refresh' | 'revoke' | 'delete'
    externalState: Readonly<{ kind: 'known'; value: 'ready' | 'deleted' } | { kind: 'unknown'; value: string }>
  }>,
): Promise<Connection | null> {
  const resources = [`connection:${input.connection.connectionRef}`]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, input.operation, resources)
  if (grant === null) return null
  const request = {
    connectionRef: input.connection.connectionRef,
    expectedGeneration: input.connection.generation,
    externalState: input.externalState,
    context: canonicalConnectionActionContext(input.actor, input.operation, input.commandId),
    grantRef: grant.grantRef,
    expectedGrantGeneration: grant.generation,
  }
  try {
    if (input.operation === 'refresh') return await createCanonicalConnectionLifecycleService(ctx, input.actor).refresh(request)
    if (input.operation === 'revoke') return await createCanonicalConnectionLifecycleService(ctx, input.actor).revoke(request)
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).delete(request)
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

export async function shareCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    connection: Connection
    granteeAccountRef: AccountRef
  }>,
): Promise<ConnectionShare | null> {
  const resources = [
    `connection:${input.connection.connectionRef}`,
    `account:${input.granteeAccountRef}`,
  ]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, 'share', resources)
  if (grant === null) return null
  try {
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).share({
      connectionRef: input.connection.connectionRef,
      granteeAccountRef: input.granteeAccountRef,
      context: canonicalConnectionActionContext(input.actor, 'share', input.commandId),
      grantRef: grant.grantRef,
      expectedGrantGeneration: grant.generation,
    })
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}



