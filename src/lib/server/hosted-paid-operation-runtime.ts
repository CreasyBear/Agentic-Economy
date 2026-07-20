import {
  createAuthenticatedConvexClient,
  createPublicSourceTransport,
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from '@/lib/server/convex-source'
import type { HostedPaidOperationAgentPrincipal } from '@/lib/server/hosted-paid-operation-agent-auth'
import type {
  HostedPaidOperationCreationGateway,
  HostedPaidOperationPublicCommand,
  HostedPaidOperationTransportGateway,
  HostedPaidOperationTransportResult,
} from '@/lib/server/hosted-paid-operation-human-api'
import {
  createHostedPaidOperationServiceToken,
  HOSTED_PAID_OPERATION_AGENT_SCOPE,
  type HostedPaidOperationServiceIntent,
  type HostedPaidOperationServicePrincipal,
} from '@/modules/action-invocation/hosted-paid-operation-service-auth'

type RuntimeClient = ConvexSourceTransport

export type HostedPaidOperationIntentTransport = Readonly<{
  create(input: Readonly<{ providerKey: 'A' | 'B' }>): ReturnType<HostedPaidOperationCreationGateway['create']>
  inspect(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
  }>): Promise<HostedPaidOperationTransportResult>
  command(input: Readonly<{
    invocationRef: string
    commandId: string
    expectedInvocationVersion: number
    command: HostedPaidOperationPublicCommand
  }>): Promise<HostedPaidOperationTransportResult>
  currentVersion(invocationRef: string): Promise<number | undefined>
}>

export type HostedPaidOperationRuntime = Readonly<{
  gateway: HostedPaidOperationTransportGateway
  creation: HostedPaidOperationCreationGateway
  provenance: string
  currentVersion(invocationRef: string): Promise<number | undefined>
}>

const createIntent = sourceMutation('hostedPaidOperationGateway:authenticatedCreate')
const inspectIntent = sourceQuery('hostedPaidOperationGateway:authenticatedInspect')
const commandIntent = sourceAction('hostedPaidOperationGateway:authenticatedCommand')
const currentVersionIntent = sourceQuery('hostedPaidOperationGateway:authenticatedCurrentVersion')

/**
 * Sole request-scoped server seam. Only closed user intent crosses it; Convex
 * derives identity and owns lifecycle, provider, payment and evidence truth.
 */
export function createHostedPaidOperationRuntime(input: Readonly<{
  client?: RuntimeClient
  transport?: HostedPaidOperationIntentTransport
  provenance?: string
}>): HostedPaidOperationRuntime {
  const transport = input.transport
    ?? (input.client === undefined ? undefined : convexIntentTransport(input.client))
  if (transport === undefined) throw new Error('hosted_paid_operation_transport_required')
  return {
    provenance: input.provenance ?? 'Labelled hosted sandbox source',
    creation: {
      create: ({ setup }) => transport.create(setup),
    },
    gateway: {
      inspect: ({ invocationRef, expectedInvocationVersion }) =>
        transport.inspect({ invocationRef, expectedInvocationVersion }),
      command: ({ invocationRef, commandId, expectedInvocationVersion, command }) =>
        transport.command({ invocationRef, commandId, expectedInvocationVersion, command }),
    },
    currentVersion: (invocationRef) => transport.currentVersion(invocationRef),
  }
}

export async function getHostedPaidOperationRuntime(options: Readonly<{
  authMode?:
    | Readonly<{ kind: 'human_session' }>
    | Readonly<{
        kind: 'agent_service'
        principal: HostedPaidOperationAgentPrincipal
      }>
  env?: Record<string, string | undefined>
  now?: () => number
  randomBytes?: (length: number) => Uint8Array
}> = {}): Promise<HostedPaidOperationRuntime> {
  if (options.authMode?.kind === 'agent_service') {
    const key = (options.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
    if (key === undefined || key.length < 32) {
      throw new Error('hosted_paid_operation_service_auth_unavailable')
    }
    return createHostedPaidOperationRuntime({
      transport: convexIntentTransport(
        createPublicSourceTransport(options.env === undefined ? {} : { env: options.env }),
        serviceTokenFactory({
          key,
          principal: {
            principalRef: options.authMode.principal.actor.principalRef,
            callerRef: options.authMode.principal.actor.callerRef,
            credentialId: options.authMode.principal.credentialId,
            scopes: [HOSTED_PAID_OPERATION_AGENT_SCOPE],
          },
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(options.randomBytes === undefined ? {} : { randomBytes: options.randomBytes }),
        }),
      ),
    })
  }
  return createHostedPaidOperationRuntime({
    transport: lazyIntentTransport(async () =>
      convexIntentTransport(await createAuthenticatedConvexClient())),
  })
}

function convexIntentTransport(
  client: RuntimeClient,
  authorize?: (
    intent: HostedPaidOperationServiceIntent,
  ) => Promise<Readonly<{ serviceToken: string }>>,
): HostedPaidOperationIntentTransport {
  const authArgs = authorize ?? (async () => ({}))
  return {
    create: async ({ providerKey }) => {
      const intent = { kind: 'create' as const, providerKey }
      return await client.mutation(createIntent, {
        providerKey,
        ...await authArgs(intent),
      }) as Awaited<ReturnType<HostedPaidOperationCreationGateway['create']>>
    },
    inspect: async (input) => {
      const intent = { kind: 'inspect' as const, ...input }
      return await client.query(inspectIntent, {
        ...input,
        ...await authArgs(intent),
      }) as HostedPaidOperationTransportResult
    },
    command: async (input) => {
      if (input.command.kind === 'inspect') {
        const intent = {
          kind: 'inspect' as const,
          invocationRef: input.invocationRef,
          expectedInvocationVersion: input.expectedInvocationVersion,
        }
        return await client.query(inspectIntent, {
          invocationRef: input.invocationRef,
          expectedInvocationVersion: input.expectedInvocationVersion,
          ...await authArgs(intent),
        }) as HostedPaidOperationTransportResult
      }
      const publicIntent = publicCommandIntent(input)
      const intent = {
        kind: 'command' as const,
        invocationRef: input.invocationRef,
        commandId: input.commandId,
        expectedInvocationVersion: input.expectedInvocationVersion,
        command: input.command.kind,
        ...(input.command.kind === 'authorize' ? { accept: input.command.accept } : {}),
      }
      return await client.action(commandIntent, {
        ...publicIntent,
        ...await authArgs(intent),
      }) as HostedPaidOperationTransportResult
    },
    currentVersion: async (invocationRef) => {
      const intent = { kind: 'current_version' as const, invocationRef }
      const version = await client.query(currentVersionIntent, {
        invocationRef,
        ...await authArgs(intent),
      })
      return typeof version === 'number' ? version : undefined
    },
  }
}

function serviceTokenFactory(input: Readonly<{
  key: string
  principal: HostedPaidOperationServicePrincipal
  now?: () => number
  randomBytes?: (length: number) => Uint8Array
}>) {
  return async (intent: HostedPaidOperationServiceIntent) => ({
    serviceToken: await createHostedPaidOperationServiceToken({
      key: input.key,
      principal: input.principal,
      intent,
      ...(input.now === undefined ? {} : { issuedAt: input.now() }),
      ...(input.randomBytes === undefined ? {} : { randomBytes: input.randomBytes }),
    }),
  })
}

function publicCommandIntent(input: Readonly<{
  invocationRef: string
  commandId: string
  expectedInvocationVersion: number
  command: HostedPaidOperationPublicCommand
}>): Record<string, unknown> {
  return {
    invocationRef: input.invocationRef,
    commandId: input.commandId,
    expectedInvocationVersion: input.expectedInvocationVersion,
    command: input.command.kind,
    ...(input.command.kind === 'authorize' ? { accept: input.command.accept } : {}),
  }
}

function lazyIntentTransport(
  load: () => Promise<HostedPaidOperationIntentTransport>,
): HostedPaidOperationIntentTransport {
  let loaded: Promise<HostedPaidOperationIntentTransport> | undefined
  const current = () => loaded ??= load()
  return {
    create: async (input) => (await current()).create(input),
    inspect: async (input) => (await current()).inspect(input),
    command: async (input) => (await current()).command(input),
    currentVersion: async (invocationRef) => (await current()).currentVersion(invocationRef),
  }
}
