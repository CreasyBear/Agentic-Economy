import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import type { InvocationActor } from '@/modules/action-invocation/contracts'
import type {
  PaidOperationApplicationRefusalCode,
  PaidOperationProjection,
} from '@/modules/action-invocation/paid-operation-application-service'
import type {
  PaidOperationContinuation,
  PaidOperationPresentationBlock,
} from '@/modules/action-invocation/paid-operation-semantics'

type TransportRefusalCode =
  | PaidOperationApplicationRefusalCode
  | 'aggregate_incomplete'
  | 'hosted_read_unavailable'
  | 'command_identity_conflict'
  | 'effect_generation_stale'

export type HostedPaidOperationTransportResult =
  | Readonly<{ kind: 'accepted'; value: PaidOperationProjection }>
  | Readonly<{ kind: 'refused'; code: TransportRefusalCode }>

export type HostedPaidOperationPublicCommand =
  | Readonly<{ kind: 'authorize'; accept: boolean }>
  | Readonly<{ kind: 'execute' }>
  | Readonly<{ kind: 'inspect' }>
  | Readonly<{ kind: 'reconcile' }>

export type HostedPaidOperationTransportGateway = Readonly<{
  inspect(input: Readonly<{
    actor: InvocationActor
    invocationRef: string
    expectedInvocationVersion: number
  }>): Promise<HostedPaidOperationTransportResult>
  command(input: Readonly<{
    actor: InvocationActor
    invocationRef: string
    expectedInvocationVersion: number
    commandId: string
    command: HostedPaidOperationPublicCommand
  }>): Promise<HostedPaidOperationTransportResult>
}>

type HumanSession = Readonly<{ userId: string; sessionId: string }>

const admitHostedPaidOperationHumanServer = createServerFn()
  .validator((data: Readonly<{ redirectTo: string }>) => {
    if (typeof data.redirectTo !== 'string' || !data.redirectTo.startsWith('/')) {
      throw new Error('hosted_paid_operation_redirect_invalid')
    }
    return data
  })
  .handler(async ({ data }) => {
    const session = await readHumanSession()
    if (session === null) {
      throw redirect({
        to: '/sign-in/$',
        params: { _splat: '' },
        search: { redirect: data.redirectTo },
      })
    }
    return { userId: session.userId }
  })

export function requireHostedPaidOperationHumanBeforeLoad({
  location,
}: Readonly<{ location: Readonly<{ href: string }> }>) {
  return admitHostedPaidOperationHumanServer({
    data: { redirectTo: location.href },
  })
}

export type HostedPaidOperationCreationGateway = Readonly<{
  create(input: Readonly<{
    actor: InvocationActor
    setup: Readonly<{ providerKey: 'A' | 'B' }>
  }>): Promise<
    | Readonly<{
        kind: 'created'
        invocationRef: string
        expectedInvocationVersion: number
      }>
    | Readonly<{
        kind: 'refused'
        code:
          | 'setup_shape_invalid'
          | 'provider_fixture_unavailable'
          | 'trial_disabled'
          | 'principal_not_allowlisted'
          | 'total_exhausted'
          | 'concurrency_exhausted'
          | 'rate_exhausted'
          | 'creation_conflict'
          | 'aggregate_incomplete'
      }>
  >
}>

export type HostedPaidOperationCardInput = Readonly<{
  disclosure: Readonly<{
    providerDisplayName: string
    materialFields: readonly string[]
    maximumCharge: Readonly<{ currency: string; amountMinor: number }>
  }>
  authorize: HostedPaidOperationCommandDescriptor | null
  refuse: HostedPaidOperationCommandDescriptor | null
  pendingCommand: null | Readonly<{ pendingCommandId: string; kind: string }>
  transportRescue: null | Readonly<{
    kind: 'update_not_confirmed'
    requestId: string
    inspectRelation: string
  }>
  paymentTruth: PaidOperationProjection['semantics']['paymentSubmission']
  settlementTruth: PaidOperationProjection['semantics']['settlement']
  resultTruth: PaidOperationProjection['semantics']['resultDelivery']
  safeContinuation: HostedPaidOperationCommandDescriptor | null
  noActionReason: string | null
  operationBlocks: readonly PaidOperationPresentationBlock[]
  runtimeEvidence: Readonly<{
    environment: string
    provenance: string
    evidenceClass: string
    claimCeiling: string
  }>
  technicalDetails: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    operationRevision: string
    providerId: string
    semanticDigest: string
    semanticDigestUse: 'projection_equality_only_not_authority'
    evidenceReferences: readonly string[]
  }>
}>

export type HostedPaidOperationCommandDescriptor = Readonly<{
  command: HostedPaidOperationPublicCommand['kind']
  commandIdRequired: true
  expectedInvocationVersion: number
  requiredInput: readonly string[]
  accept?: boolean
}>

type HumanHandlerOptions = Readonly<{
  authenticate?: () => Promise<HumanSession | null>
  gateway: HostedPaidOperationTransportGateway
  provenance: string
  currentVersion?: (invocationRef: string, actor: InvocationActor) => Promise<number | undefined>
  requestId?: () => string
}>

type HumanCreationOptions = Readonly<{
  authenticate?: () => Promise<HumanSession | null>
  creation: HostedPaidOperationCreationGateway
}>

export async function handleHostedPaidOperationHumanCreate(
  request: Request,
  options: HumanCreationOptions,
): Promise<Response> {
  const actor = await authenticateHuman(options.authenticate)
  if (actor === null) {
    return noStore({
      kind: 'refused',
      code: 'authentication_required',
      relation: { authenticate: '/sign-in?redirect=%2Factions%2Fpaid%2Fnew' },
    }, 401)
  }
  const setup = await parseSetup(request)
  if (setup === undefined) {
    return noStore({ kind: 'refused', code: 'invalid_setup_input', issues: ['providerKey'] }, 422)
  }
  const result = await options.creation.create({ actor, setup })
  if (result.kind === 'refused') {
    const status = result.code === 'setup_shape_invalid' ? 422 : 403
    return noStore(result, status)
  }
  return noStore({
    ...result,
    relation: {
      inspect: `/actions/paid/${encodeURIComponent(result.invocationRef)}?expectedInvocationVersion=${result.expectedInvocationVersion}`,
    },
  }, 201)
}

export async function handleHostedPaidOperationHumanCreateNavigation(
  request: Request,
  options: HumanCreationOptions,
): Promise<Response> {
  const response = await handleHostedPaidOperationHumanCreate(request, options)
  if (response.status !== 201) return response

  const body = await response.json() as Readonly<{
    relation?: Readonly<{ inspect?: unknown }>
  }>
  const location = body.relation?.inspect
  if (typeof location !== 'string'
    || !location.startsWith('/actions/paid/')
    || location.startsWith('//')) {
    throw new Error('hosted_paid_operation_creation_relation_invalid')
  }

  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
      Location: location,
    },
  })
}

export async function handleHostedPaidOperationHumanInspect(
  invocationRef: string,
  expectedInvocationVersion: number,
  options: HumanHandlerOptions,
): Promise<Response> {
  const actor = await authenticateHuman(options.authenticate)
  if (actor === null) return humanAuthenticationRequired(invocationRef)
  try {
    const result = await options.gateway.inspect({ actor, invocationRef, expectedInvocationVersion })
    return await projectResult(result, invocationRef, expectedInvocationVersion, options, 'human')
  } catch {
    return noStore({ kind: 'refused', code: 'hosted_read_unavailable' }, 503)
  }
}

export async function handleHostedPaidOperationHumanCommand(
  request: Request,
  invocationRef: string,
  options: HumanHandlerOptions,
): Promise<Response> {
  const actor = await authenticateHuman(options.authenticate)
  if (actor === null) return humanAuthenticationRequired(invocationRef)
  const parsed = await parseCommand(request)
  if (parsed.kind === 'invalid') return invalidCommand(parsed.issues)
  try {
    const result = await options.gateway.command({
      actor,
      invocationRef,
      expectedInvocationVersion: parsed.expectedInvocationVersion,
      commandId: parsed.commandId,
      command: parsed.command,
    })
    return await projectResult(
      result,
      invocationRef,
      parsed.expectedInvocationVersion,
      options,
      'human',
      actor,
    )
  } catch {
    const requestId = options.requestId?.() ?? crypto.randomUUID()
    return noStore({
      kind: 'update_not_confirmed',
      requestId,
      relation: {
        inspect: `/actions/paid/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${parsed.expectedInvocationVersion}`,
      },
    }, 503)
  }
}

export async function parseHostedPaidOperationCommand(request: Request) {
  return await parseCommand(request)
}

export function projectHostedPaidOperation(
  projection: PaidOperationProjection,
  provenance: string,
  audience: 'human' | 'agent',
) {
  const semantics = projection.semantics
  const continuation = safeContinuation(semantics.continuations)
  const authorize = semantics.continuations.find((item) => item.kind === 'authorize')
  const evidenceReferences = [
    ...semantics.queryRelease.state === 'not_released' ? [] : semantics.queryRelease.evidenceRefs,
    ...semantics.paymentSubmission.state === 'not_submitted' ? [] : semantics.paymentSubmission.evidenceRefs,
    ...semantics.settlement.state === 'no_evidence' ? [] : semantics.settlement.evidenceRefs,
    ...semantics.resultDelivery.state === 'not_delivered' ? [] : semantics.resultDelivery.evidenceRefs,
  ]
  const card: HostedPaidOperationCardInput = {
    disclosure: {
      providerDisplayName: semantics.operation.providerName,
      materialFields: materialFieldNames(semantics.operation.materialInputs),
      maximumCharge: semantics.maximumAuthorizedCharge,
    },
    authorize: authorize === undefined ? null : descriptor(authorize, true),
    refuse: authorize === undefined ? null : descriptor(authorize, false),
    pendingCommand: null,
    transportRescue: null,
    paymentTruth: semantics.paymentSubmission,
    settlementTruth: semantics.settlement,
    resultTruth: semantics.resultDelivery,
    safeContinuation: continuation === undefined ? null : descriptor(continuation),
    noActionReason: continuation === undefined ? 'No further action is available for this operation.' : null,
    operationBlocks: semantics.presentation.blocks,
    runtimeEvidence: {
      environment: semantics.environment.name,
      provenance,
      evidenceClass: semantics.environment.evidenceClass,
      claimCeiling: semantics.environment.claimCeiling,
    },
    technicalDetails: {
      invocationRef: semantics.identity.invocationRef,
      expectedInvocationVersion: semantics.identity.expectedInvocationVersion,
      operationRevision: semantics.operation.operationRevision,
      providerId: semantics.operation.providerId,
      semanticDigest: projection.human.semanticDigest,
      semanticDigestUse: projection.human.semanticDigestUse,
      evidenceReferences: [...new Set(evidenceReferences)].sort(),
    },
  }
  const selected = audience === 'human' ? projection.human : projection.agent
  return {
    kind: 'accepted',
    schema: semantics.schema,
    projection: selected,
    expectedInvocationVersion: semantics.identity.expectedInvocationVersion,
    environment: {
      name: semantics.environment.name,
      provenance,
      evidenceClass: semantics.environment.evidenceClass,
      claimCeiling: semantics.environment.claimCeiling,
    },
    card,
  } as const
}

async function authenticateHuman(
  authenticate: HumanHandlerOptions['authenticate'],
): Promise<InvocationActor | null> {
  const session = await readHumanSession(authenticate)
  return session === null
    ? null
    : { principalRef: session.userId, callerRef: session.sessionId }
}

async function readHumanSession(
  authenticate?: () => Promise<HumanSession | null>,
): Promise<HumanSession | null> {
  return await (authenticate ?? (async () => {
    const identity = await auth()
    return identity.isAuthenticated && identity.userId !== null && identity.sessionId !== null
      ? { userId: identity.userId, sessionId: identity.sessionId }
      : null
  }))()
}

async function projectResult(
  result: HostedPaidOperationTransportResult,
  invocationRef: string,
  suppliedVersion: number,
  options: HumanHandlerOptions,
  audience: 'human' | 'agent',
  actor?: InvocationActor,
): Promise<Response> {
  if (result.kind === 'accepted') {
    return noStore(projectHostedPaidOperation(result.value, options.provenance, audience), 200)
  }
  if (result.code === 'invocation_not_found' || result.code === 'cross_principal_refused') {
    return noStore({ kind: 'refused', code: 'invocation_not_found' }, 404)
  }
  if (result.code === 'stale_invocation_version') {
    const current = actor === undefined
      ? undefined
      : await options.currentVersion?.(invocationRef, actor)
    const currentExpectedInvocationVersion = current ?? suppliedVersion
    return noStore({
      kind: 'refused',
      code: result.code,
      suppliedVersion,
      currentExpectedInvocationVersion,
      relation: {
        inspect: audience === 'human'
          ? `/actions/paid/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${currentExpectedInvocationVersion}`
          : `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${currentExpectedInvocationVersion}`,
      },
    }, 409)
  }
  if (result.code === 'continuation_not_allowed') {
    return noStore({
      kind: 'refused',
      code: result.code,
      currentExpectedInvocationVersion: suppliedVersion,
      relation: {
        inspect: audience === 'human'
          ? `/actions/paid/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${suppliedVersion}`
          : `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${suppliedVersion}`,
      },
    }, 409)
  }
  return noStore({ kind: 'refused', code: result.code }, 503)
}

function descriptor(
  continuation: PaidOperationContinuation,
  accept?: boolean,
): HostedPaidOperationCommandDescriptor {
  return {
    command: continuation.kind === 'retry' ? 'inspect' : continuation.kind,
    commandIdRequired: true,
    expectedInvocationVersion: continuation.expectedInvocationVersion,
    requiredInput: continuation.kind === 'reconcile'
      ? []
      : continuation.kind === 'authorize'
        ? ['accept']
        : continuation.requiredInput,
    ...(accept === undefined ? {} : { accept }),
  }
}

function safeContinuation(continuations: readonly PaidOperationContinuation[]) {
  if (continuations.length !== 1 || continuations[0]?.kind === 'retry') return undefined
  return continuations[0]
}

function materialFieldNames(value: unknown): readonly string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value).sort()
}

type ParsedCommand =
  | Readonly<{
      kind: 'valid'
      commandId: string
      expectedInvocationVersion: number
      command: HostedPaidOperationPublicCommand
    }>
  | Readonly<{ kind: 'invalid'; issues: readonly string[] }>

async function parseCommand(request: Request): Promise<ParsedCommand> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    return { kind: 'invalid', issues: ['body'] }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'invalid', issues: ['body'] }
  }
  const candidate = value as Record<string, unknown>
  const command = candidate.command
  const allowedKeys = command === 'authorize'
    ? ['accept', 'command', 'commandId', 'expectedInvocationVersion']
    : ['command', 'commandId', 'expectedInvocationVersion']
  const issues: string[] = []
  if (Object.keys(candidate).sort().join('\0') !== allowedKeys.sort().join('\0')) issues.push('fields')
  if (typeof candidate.commandId !== 'string' || candidate.commandId.trim().length === 0) issues.push('commandId')
  if (!Number.isSafeInteger(candidate.expectedInvocationVersion)
    || (candidate.expectedInvocationVersion as number) < 0) {
    issues.push('expectedInvocationVersion')
  }
  if (command !== 'authorize' && command !== 'execute' && command !== 'inspect' && command !== 'reconcile') {
    issues.push('command')
  }
  if (command === 'authorize' && typeof candidate.accept !== 'boolean') issues.push('accept')
  if (issues.length > 0) return { kind: 'invalid', issues: [...new Set(issues)].sort() }
  return {
    kind: 'valid',
    commandId: candidate.commandId as string,
    expectedInvocationVersion: candidate.expectedInvocationVersion as number,
    command: command === 'authorize'
      ? { kind: 'authorize', accept: candidate.accept as boolean }
      : { kind: command as 'execute' | 'inspect' | 'reconcile' },
  }
}

function invalidCommand(issues: readonly string[]) {
  return noStore({ kind: 'refused', code: 'invalid_command_input', issues }, 422)
}

export async function parseHostedPaidOperationSetup(request: Request) {
  return await parseSetup(request)
}

async function parseSetup(request: Request): Promise<Readonly<{ providerKey: 'A' | 'B' }> | undefined> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.startsWith('application/x-www-form-urlencoded')
    || contentType.startsWith('multipart/form-data')) {
    try {
      const entries = [...(await request.formData()).entries()]
      if (entries.length !== 1 || entries[0]?.[0] !== 'providerKey') return undefined
      const providerKey = entries[0][1]
      return providerKey === 'A' || providerKey === 'B' ? { providerKey } : undefined
    } catch {
      return undefined
    }
  }

  let value: unknown
  try {
    value = await request.json()
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).length !== 1 || !Object.hasOwn(candidate, 'providerKey')) return undefined
  return candidate.providerKey === 'A' || candidate.providerKey === 'B'
    ? { providerKey: candidate.providerKey }
    : undefined
}

function humanAuthenticationRequired(invocationRef: string) {
  const redirect = encodeURIComponent(`/actions/paid/${invocationRef}`)
  return noStore({
    kind: 'refused',
    code: 'authentication_required',
    relation: { authenticate: `/sign-in?redirect=${redirect}` },
  }, 401)
}

export function noStore(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
