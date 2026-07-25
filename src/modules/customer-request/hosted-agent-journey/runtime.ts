import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  customerRequestAgentResultSchema,
  customerRequestConnectedAssistantsResultSchema,
  customerRequestEvidenceResultSchema,
  customerRequestJsonValueSchema,
  customerRequestProblemResultSchema,
  customerRequestRepeatPermissionResultSchema,
  customerRequestSubmitInputSchema,
  type CustomerRequestRepeatPermission,
  type CustomerRequestView,
} from '../agent-contract'
import {
  journeyReleaseSchema,
  type AgentNavigationRelation,
  type HostedCustomerRequestJourneyInput,
  type HostedCustomerRequestJourneyRuntimeInput,
  type MutationSource,
  type ObservedNavigationAction,
  type ReleaseVerification,
} from './types'

export function assertExpectedRoute(
  expected: HostedCustomerRequestJourneyInput['scenario']['expectedRoute'],
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
): void {
  assertRouteDisclosureIntegrity(route)
  if (expected === undefined) return
  const businesses = route.businesses.map(({ name }) => name)
  if (route.stepCount !== expected.stepCount) throw new Error(`hosted_journey_step_count:${route.stepCount}`)
  if (JSON.stringify(businesses) !== JSON.stringify(expected.businesses)) {
    throw new Error(`hosted_journey_businesses:${businesses.join('|')}`)
  }
  if (expected.recipients !== undefined) {
    const actual = route.dataUse.recipients
      .map(({ name, purposes }) => ({ name, purposes: [...purposes].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const declared = expected.recipients
      .map(({ name, purposes }) => ({ name, purposes: [...purposes].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name))
    if (JSON.stringify(actual) !== JSON.stringify(declared)) {
      throw new Error('hosted_journey_disclosure_recipients_changed')
    }
  }
}

export function assertRouteDisclosureIntegrity(
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
): void {
  const recipients = route.dataUse.recipients
  if (route.dataUse.recipientCount !== recipients.length) {
    throw new Error('hosted_journey_disclosure_recipient_count')
  }
  const recipientRefs = new Set<string>()
  const recipientNames = new Set<string>()
  const purposes = new Set<string>()
  for (const recipient of recipients) {
    if (recipientRefs.has(recipient.recipientRef) || recipientNames.has(recipient.name)) {
      throw new Error('hosted_journey_disclosure_recipient_duplicate')
    }
    if (recipient.recipientRef.trim().length === 0 || recipient.name.trim().length === 0
      || recipient.purposes.length === 0 || recipient.fields.length === 0
      || recipient.purposes.some((purpose) => purpose.trim().length === 0)
      || recipient.fields.some(({ fieldRef, label }) => (
        fieldRef.trim().length === 0 || label.trim().length === 0
      ))) {
      throw new Error('hosted_journey_disclosure_recipient_incomplete')
    }
    recipientRefs.add(recipient.recipientRef)
    recipientNames.add(recipient.name)
    recipient.purposes.forEach((purpose) => purposes.add(purpose))
  }
  const aggregate = [...route.dataUse.purposes].sort()
  if (JSON.stringify(aggregate) !== JSON.stringify([...purposes].sort())) {
    throw new Error('hosted_journey_disclosure_purpose_mismatch')
  }
}
export async function callAgent(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  acceptedStatuses: readonly number[] = [200],
  mutationSource?: MutationSource,
): Promise<CustomerRequestView> {
  recordMutation(input, method, path, mutationSource)
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method, headers: headers(input, input.agentApiKey),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json()
  if (!acceptedStatuses.includes(response.status)) throw responseError(method, path, response.status, value)
  const result = customerRequestAgentResultSchema.parse(value)
  if (result.kind !== 'request') throw new Error(`hosted_journey_agent_result:${result.kind}`)
  return result
}

export async function confirmThroughRepeatPermission(
  input: HostedCustomerRequestJourneyRuntimeInput,
  view: CustomerRequestView,
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
  repeatPermission: NonNullable<HostedCustomerRequestJourneyInput['scenario']['repeatPermission']>,
  nonce: string,
): Promise<CustomerRequestView> {
  if (route.maximumTotalCost.kind !== 'known') {
    throw new Error('hosted_journey_repeat_permission_cost_unknown')
  }
  if (!Number.isSafeInteger(repeatPermission.occurrences) || repeatPermission.occurrences <= 0) {
    throw new Error('hosted_journey_repeat_permission_occurrences_invalid')
  }
  const allowCommand = {
    revision: view.revision,
    routeRef: route.routeRef,
    delegatedCredentialId: repeatPermission.delegatedCredentialId,
    occurrences: repeatPermission.occurrences,
    cumulativeSpend: {
      currency: route.maximumTotalCost.currency,
      amountMinor: route.maximumTotalCost.amountMinor * repeatPermission.occurrences,
    },
    validUntil: route.validUntil,
    idempotencyKey: `acceptance:allow-repeat:${nonce}:${view.revision}`,
  }
  const path = `/api/v1/requests/${encodeURIComponent(view.requestRef)}/repeat-permissions`
  const permission = await callRepeatPermission(input, path, 'POST', allowCommand, 'observed_navigation')
  const replay = await callRepeatPermission(input, path, 'POST', allowCommand, 'automatic_replay')
  if (JSON.stringify(permission) !== JSON.stringify(replay)) {
    throw new Error('hosted_journey_repeat_permission_allow_replay_changed')
  }
  const inspectPath = `${path}/${encodeURIComponent(permission.permissionRef)}?routeRef=${encodeURIComponent(route.routeRef)}`
  const inspected = await callRepeatPermission(input, inspectPath, 'GET')
  if (JSON.stringify(permission) !== JSON.stringify(inspected)) {
    throw new Error('hosted_journey_repeat_permission_inspection_changed')
  }
  const rediscovered = await callRepeatPermissionCollection(input, path)
  if (JSON.stringify(permission) !== JSON.stringify(
    rediscovered.find(({ permissionRef }) => permissionRef === permission.permissionRef),
  )) {
    throw new Error('hosted_journey_repeat_permission_collection_readback_changed')
  }
  const useCommand = {
    revision: view.revision,
    routeRef: route.routeRef,
    delegatedCredentialId: repeatPermission.delegatedCredentialId,
    idempotencyKey: `acceptance:use-repeat:${nonce}:${view.revision}`,
  }
  const usePath = `${path}/${encodeURIComponent(permission.permissionRef)}/use`
  const confirmed = await callAgent(input, usePath, 'POST', useCommand, [200], 'observed_navigation')
  const confirmedReplay = await callAgent(input, usePath, 'POST', useCommand, [200], 'automatic_replay')
  if (JSON.stringify(confirmed) !== JSON.stringify(confirmedReplay)) {
    throw new Error('hosted_journey_repeat_permission_use_replay_changed')
  }
  input.metrics.repeatPermission = {
    permissionRef: permission.permissionRef,
    routeRef: route.routeRef,
    delegatedCredentialId: repeatPermission.delegatedCredentialId,
    allowReplaySafe: true,
    inspectMatched: true,
    useReplaySafe: true,
    withdrawn: false,
    withdrawnUseRefused: false,
  }
  return confirmed
}

export async function withdrawRepeatPermission(
  input: HostedCustomerRequestJourneyRuntimeInput,
  view: CustomerRequestView,
  repeatPermission: NonNullable<HostedCustomerRequestJourneyInput['scenario']['repeatPermission']>,
): Promise<void> {
  const observed = input.metrics.repeatPermission
  if (observed === undefined) throw new Error('hosted_journey_repeat_permission_receipt_missing')
  const basePath = `/api/v1/requests/${encodeURIComponent(view.requestRef)}/repeat-permissions/${encodeURIComponent(observed.permissionRef)}`
  const command = {
    routeRef: observed.routeRef,
    idempotencyKey: `acceptance:withdraw-repeat:${view.requestRef}:${view.revision}`,
  }
  const withdrawn = await callRepeatPermission(
    input,
    `${basePath}/withdrawal`,
    'POST',
    command,
    'observed_navigation',
  )
  const replay = await callRepeatPermission(
    input,
    `${basePath}/withdrawal`,
    'POST',
    command,
    'automatic_replay',
  )
  if (withdrawn.status !== 'withdrawn' || JSON.stringify(withdrawn) !== JSON.stringify(replay)) {
    throw new Error('hosted_journey_repeat_permission_withdrawal_changed')
  }
  const inspected = await callRepeatPermission(
    input,
    `${basePath}?routeRef=${encodeURIComponent(observed.routeRef)}`,
    'GET',
  )
  if (JSON.stringify(withdrawn) !== JSON.stringify(inspected)) {
    throw new Error('hosted_journey_repeat_permission_withdrawn_inspection_changed')
  }
  const collectionPath = `/api/v1/requests/${encodeURIComponent(view.requestRef)}/repeat-permissions`
  const rediscovered = await callRepeatPermissionCollection(input, collectionPath)
  if (JSON.stringify(withdrawn) !== JSON.stringify(
    rediscovered.find(({ permissionRef }) => withdrawn.permissionRef === permissionRef),
  )) {
    throw new Error('hosted_journey_repeat_permission_withdrawn_collection_readback_changed')
  }
  const refusedUse = await callAgent(input, `${basePath}/use`, 'POST', {
    revision: view.revision,
    routeRef: observed.routeRef,
    delegatedCredentialId: repeatPermission.delegatedCredentialId,
    idempotencyKey: `acceptance:use-repeat-after-withdrawal:${view.requestRef}:${view.revision}`,
  }, [200], 'observed_navigation')
  if (refusedUse.state !== 'needs_attention'
    || !refusedUse.summary.toLowerCase().includes('withdrawn')) {
    throw new Error('hosted_journey_repeat_permission_withdrawn_use_admitted')
  }
  input.metrics.repeatPermission = {
    ...observed,
    withdrawn: true,
    withdrawnUseRefused: true,
  }
}

export async function callRepeatPermissionCollection(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
): Promise<readonly CustomerRequestRepeatPermission[]> {
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'GET',
    headers: headers(input, input.agentApiKey),
  })
  const value: unknown = await response.json()
  if (response.status !== 200) throw responseError('GET', path, response.status, value)
  const result = customerRequestConnectedAssistantsResultSchema.parse(value)
  if (result.kind !== 'connected_assistants') {
    throw new Error(`hosted_journey_repeat_permission_collection_result:${result.kind}`)
  }
  return result.permissions
}

export async function callRepeatPermission(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  mutationSource?: MutationSource,
): Promise<CustomerRequestRepeatPermission> {
  recordMutation(input, method, path, mutationSource)
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method,
    headers: headers(input, input.agentApiKey),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json()
  if (response.status !== 200) throw responseError(method, path, response.status, value)
  const result = customerRequestRepeatPermissionResultSchema.parse(value)
  if (result.kind !== 'repeat_permission') {
    throw new Error(`hosted_journey_repeat_permission_result:${result.kind}`)
  }
  return result
}

export async function callObservedAgent(
  input: HostedCustomerRequestJourneyRuntimeInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
  replacements: Readonly<Record<string, unknown>> = {},
  acceptedStatuses: readonly number[] = [200],
): Promise<CustomerRequestView> {
  const action = observedNavigationAction(input, view, relation)
  const body = action.method === 'POST' ? materializeObservedInput(view, action, replacements) : undefined
  return await callAgent(
    input, action.path, action.method, body, acceptedStatuses,
    action.method === 'POST' ? 'observed_navigation' : undefined,
  )
}

export function observedNavigationPath(
  input: HostedCustomerRequestJourneyInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
  expectedMethod: 'GET' | 'POST',
): string {
  const action = observedNavigationAction(input, view, relation)
  if (action.method !== expectedMethod) throw new Error(`hosted_journey_navigation_method:${relation}`)
  return action.path
}

export function observedNavigationAction(
  input: HostedCustomerRequestJourneyInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
): ObservedNavigationAction {
  const matches = view.navigation?.actions.filter((action) => action.relation === relation) ?? []
  if (matches.length !== 1) throw new Error(`hosted_journey_navigation_missing:${relation}`)
  const action = matches[0]
  if (action === undefined) throw new Error(`hosted_journey_navigation_missing:${relation}`)
  const base = new URL(normalizedBaseUrl(input.baseUrl))
  let current: URL
  let target: URL
  try {
    current = new URL(view.navigation?.current ?? '', base)
    target = new URL(action.href, base)
  } catch { throw new Error(`hosted_journey_navigation_invalid:${relation}`) }
  if (target.origin !== base.origin || target.username !== '' || target.password !== '' || target.hash !== ''
    || current.origin !== base.origin || current.username !== '' || current.password !== '' || current.hash !== ''
    || !current.pathname.startsWith('/api/v1/requests/')
    || (target.pathname !== current.pathname && !target.pathname.startsWith(`${current.pathname}/`))) {
    throw new Error(`hosted_journey_navigation_unsafe:${relation}`)
  }
  return { method: action.method, path: `${target.pathname}${target.search}`, input: action.input }
}

export function materializeObservedInput(
  view: CustomerRequestView,
  action: ObservedNavigationAction,
  replacements: Readonly<Record<string, unknown>>,
): unknown {
  if (action.input === undefined) throw new Error('hosted_journey_navigation_input_missing')
  const used = new Set<string>()
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string' && Object.hasOwn(replacements, value)) {
      used.add(value)
      return replacements[value]
    }
    if (typeof value === 'string' && /^<[^>]+>$/u.test(value)) {
      throw new Error(`hosted_journey_navigation_input_unresolved:${value}`)
    }
    if (Array.isArray(value)) return value.map(visit)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]))
    }
    return value
  }
  const materialized = customerRequestJsonValueSchema.parse(visit(action.input))
  for (const placeholder of Object.keys(replacements)) {
    if (!used.has(placeholder)) throw new Error(`hosted_journey_navigation_input_placeholder_missing:${placeholder}`)
  }
  if (materialized !== null && typeof materialized === 'object' && !Array.isArray(materialized)) {
    const record = materialized as Record<string, unknown>
    for (const revision of [record.revision, record.expectedRevision]) {
      if (revision !== undefined && revision !== view.revision) {
        throw new Error('hosted_journey_navigation_input_stale_revision')
      }
    }
    if (record.requirementKey !== undefined
      && (view.clarification?.kind !== 'contract_fact'
        || record.requirementKey !== view.clarification.requirementKey)) {
      throw new Error('hosted_journey_navigation_input_wrong_requirement')
    }
  }
  return materialized
}

export async function callAgentEvidence(input: HostedCustomerRequestJourneyRuntimeInput, path: string) {
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'GET', headers: headers(input, input.agentApiKey),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('GET', path, response.status, value)
  const result = customerRequestEvidenceResultSchema.parse(value)
  if (result.kind !== 'evidence') throw new Error(`hosted_journey_evidence_result:${result.kind}`)
  return result
}

export async function callAgentProblem(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
  body: unknown,
) {
  recordMutation(input, 'POST', path, 'observed_navigation')
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'POST', headers: headers(input, input.agentApiKey),
    body: JSON.stringify(body),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('POST', path, response.status, value)
  const result = customerRequestProblemResultSchema.parse(value)
  if (result.kind !== 'problem_reported') throw new Error(`hosted_journey_problem_result:${result.kind}`)
  return result
}
export function headers(input: HostedCustomerRequestJourneyInput, credential?: string): Headers {
  const result = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
  if (credential !== undefined) result.set('Authorization', `Bearer ${credential}`)
  if (input.deploymentProtectionBypass !== undefined) {
    result.set('x-vercel-protection-bypass', input.deploymentProtectionBypass)
  }
  return result
}

export function observe(states: CustomerRequestView['state'][], view: CustomerRequestView): void {
  if (states.at(-1) !== view.state) states.push(view.state)
}

export function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '')
}

export function journeyEnvironment(input: HostedCustomerRequestJourneyInput): 'production' | 'development' {
  return input.environment ?? 'production'
}

export function journeyReleaseProjection(
  input: HostedCustomerRequestJourneyInput,
  release: ReleaseVerification,
): z.infer<typeof journeyReleaseSchema> {
  const base = {
    revision: release.revision, deploymentId: release.deploymentId,
    baseUrl: normalizedBaseUrl(input.baseUrl),
  }
  return journeyEnvironment(input) === 'development'
    ? { ...base, environment: 'development', verification: 'local_checkout_and_named_dev_deployment' }
    : { ...base, environment: 'production' }
}

export function assertJourneyBaseUrl(
  value: string,
  environment: 'production' | 'development',
  trustedDevelopmentOrigin?: string,
): void {
  if (environment === 'production') {
    assertProductionBaseUrl(value)
    return
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('hosted_journey_base_url_invalid')
  }
  const isOrigin = url.username === '' && url.password === ''
    && url.pathname.replace(/\/+$/u, '') === '' && url.search === '' && url.hash === ''
  const isLoopback = url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  const isExplicitTrustedHttps = url.protocol === 'https:'
    && trustedDevelopmentOrigin !== undefined
    && normalizedBaseUrl(trustedDevelopmentOrigin) === normalizedBaseUrl(value)
  if (!isOrigin || (!isLoopback && !isExplicitTrustedHttps)) {
    throw new Error('hosted_journey_base_url_not_development')
  }
}

export function assertProductionBaseUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('hosted_journey_base_url_invalid')
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.port !== '' || url.pathname.replace(/\/+$/u, '') !== ''
    || url.search !== '' || url.hash !== ''
    || url.hostname !== 'agentic-economy-phi.vercel.app') {
    throw new Error('hosted_journey_base_url_not_production')
  }
}

export function responseError(method: string, path: string, status: number, value: unknown): Error {
  const reason = z.object({ reason: z.string().optional(), error: z.string().optional() }).safeParse(value)
  return new HostedJourneyResponseError(
    method,
    path,
    status,
    reason.success ? reason.data.reason ?? reason.data.error ?? 'unexpected' : 'unexpected',
  )
}

export class HostedJourneyResponseError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly reason: string,
  ) {
    super(`${method} ${path} returned ${status}:${reason}`)
  }
}

export async function submitWithInterpreterRecovery(
  input: HostedCustomerRequestJourneyRuntimeInput,
  submit: z.infer<typeof customerRequestSubmitInputSchema>,
): Promise<CustomerRequestView> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await callAgent(
        input, input.requestEntrypointPath, 'POST', submit, [200],
        attempt === 1 ? 'declared_request' : 'automatic_replay',
      )
    } catch (error) {
      const retryable = error instanceof HostedJourneyResponseError
        && error.method === 'POST'
        && error.path === input.requestEntrypointPath
        && error.status === 503
        && (error.reason === 'interpreter_unavailable' || error.reason === 'request_unavailable')
      if (!retryable || attempt === 3) throw error
      await (input.sleep ?? defaultSleep)(1_000)
    }
  }
  throw new Error('hosted_journey_interpreter_recovery_exhausted')
}

export function journeyMeasurements(
  input: HostedCustomerRequestJourneyRuntimeInput,
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
  resultUsable: boolean,
  resumed: boolean,
  resultDigest?: string,
  evidence?: Readonly<{
    steps: readonly Readonly<{
      step: number
      business?: string | undefined
      providerOrigin?: string | undefined
      outputDigest?: string | undefined
      evidence: readonly Readonly<{ receiptRef: string }>[]
    }>[]
  }>,
) {
  const totalCostAccuracy = route.maximumTotalCost.kind === 'known'
    ? {
        state: 'exact' as const,
        total: { currency: route.maximumTotalCost.currency, amountMinor: route.maximumTotalCost.amountMinor },
      }
    : { state: 'unavailable' as const }
  return {
    integrationBurden: {
      requestCalls: input.metrics.requestCalls,
      clarifications: input.metrics.clarifications,
    },
    turns: { total: input.metrics.requestCalls },
    elapsedMs: Math.max(0, (input.now ?? Date.now)() - input.metrics.startedAt),
    hardConstraintAccuracy: { state: route.comparison.hardConstraints },
    totalCostAccuracy,
    recovery: {
      state: 'durable' as const, resumed,
      postures: [...new Set(route.recovery.map(({ posture }) => posture))],
    },
    ...(input.metrics.interruptionRecovery === undefined
      ? {}
      : { interruptionRecovery: input.metrics.interruptionRecovery }),
    resultUsability: { state: resultUsable ? 'usable' as const : 'unusable' as const },
    replaySafety: { executionStart: input.metrics.executionStartReplay },
    discovery: input.metrics.discovery,
    ...(input.metrics.staleOptionRecovery === undefined
      ? {}
      : { staleOptionRecovery: input.metrics.staleOptionRecovery }),
    ...(input.metrics.unsupportedRecovery === undefined
      ? {}
      : { unsupportedRecovery: input.metrics.unsupportedRecovery }),
    ...(input.metrics.downstreamCancellation === undefined
      ? {}
      : { downstreamCancellation: input.metrics.downstreamCancellation }),
    ...(input.metrics.repeatPermission === undefined
      ? {}
      : { repeatPermission: input.metrics.repeatPermission }),
    disclosureIntegrity: {
      state: 'verified' as const,
      recipients: route.dataUse.recipients.map(({ name }) => name).sort(),
      purposes: [...route.dataUse.purposes].sort(),
      effects: route.effects.map(({ kind, reversibility }) => `${kind}:${reversibility}`).sort(),
      providerFields: route.dataUse.recipients.map(({ name, fields }) => ({
        business: name,
        fields: fields.map(({ fieldRef }) => fieldRef).sort(),
      })).sort((left, right) => left.business.localeCompare(right.business)),
    },
    evidenceIntegrity: resultDigest === undefined || evidence === undefined
      ? { state: 'not_applicable' as const }
      : evidence.steps.some(({ business, providerOrigin, outputDigest }) => (
          business === undefined || providerOrigin === undefined || outputDigest === undefined
        ))
        ? { state: 'not_proven' as const, reason: 'step_execution_identity_unavailable' as const }
      : {
          state: 'verified' as const,
          resultDigest,
          steps: evidence.steps.map(({ step, business, providerOrigin, outputDigest, evidence: receipts }) => ({
            step,
            business: business!,
            providerOrigin: providerOrigin!,
            outputDigest: outputDigest!,
            receiptRefs: receipts.map(({ receiptRef }) => receiptRef).sort(),
          })),
        },
    resultIntegrity: resultDigest === undefined
      ? { state: 'not_applicable' as const }
      : { state: 'verified' as const, digest: resultDigest },
    controlIntegrity: {
      state: 'verified' as const,
      operatorInterventions: 0 as const,
      mutations: input.metrics.mutations,
    },
  }
}

export function journeyProofInput(
  input: HostedCustomerRequestJourneyRuntimeInput,
  consumedFacts: readonly Readonly<{ requirementKey: string; valueDigest: string }>[],
  consumedMessages: readonly Readonly<{ index: number; valueDigest: string }>[],
) {
  return {
    request: input.scenario.request,
    availableFacts: Object.entries(input.scenario.facts)
      .map(([requirementKey, value]) => ({ requirementKey, valueDigest: digestInput(value) }))
      .sort((left, right) => left.requirementKey.localeCompare(right.requirementKey)),
    facts: consumedFacts,
    messages: consumedMessages,
  }
}

export function requiredRouteGenerationRef(view: CustomerRequestView): string {
  if (view.routeGenerationRef === undefined) throw new Error('hosted_journey_route_generation_missing')
  return view.routeGenerationRef
}

export function recordMutation(
  input: HostedCustomerRequestJourneyRuntimeInput,
  method: 'GET' | 'POST',
  path: string,
  source: MutationSource | undefined,
): void {
  if (method === 'GET') {
    if (source !== undefined) throw new Error('hosted_journey_read_has_mutation_source')
    return
  }
  if (source === undefined) throw new Error('hosted_journey_mutation_source_missing')
  input.metrics.mutations.push({ path, source })
}

export function assertExecutionStartReplay(started: CustomerRequestView, replayed: CustomerRequestView): void {
  const startedProgress = started.progress
  const replayedProgress = replayed.progress
  const sameExecutionAuthority = replayed.requestRef === started.requestRef
    && replayed.revision === started.revision
    && replayed.routeGenerationRef === started.routeGenerationRef
    && replayed.confirmation?.confirmationRef === started.confirmation?.confirmationRef
  const monotonicProgress = startedProgress === undefined || replayedProgress === undefined
    ? replayed.state === 'completed'
    : replayedProgress.total === startedProgress.total
      && replayedProgress.completed >= startedProgress.completed
  const replayableAgain = replayed.navigation?.actions.some(
    ({ relation }) => relation === 'start_confirmed_option',
  ) ?? false
  if (!sameExecutionAuthority || !monotonicProgress || replayableAgain
    || (replayed.state !== 'in_progress' && replayed.state !== 'completed')) {
    throw new Error('hosted_journey_execution_start_replay_changed')
  }
}

export function assertCancelledExecutionStartReplay(
  started: CustomerRequestView,
  cancelled: CustomerRequestView,
  replayed: CustomerRequestView,
): void {
  const cancellation = cancelled.activity?.cancellation
  const replayedCancellation = replayed.activity?.cancellation
  const sameExecutionAuthority = replayed.requestRef === started.requestRef
    && replayed.revision === started.revision
  const sameStoppedRecord = typeof cancellation === 'object' && cancellation.state === 'stopped'
    && typeof replayedCancellation === 'object' && replayedCancellation.state === 'stopped'
    && replayedCancellation.stoppedAt === cancellation.stoppedAt
  const replayableAgain = replayed.navigation?.actions.some(
    ({ relation }) => relation === 'start_confirmed_option',
  ) ?? false
  if (!sameExecutionAuthority || !sameStoppedRecord || replayableAgain || replayed.state !== 'cancelled') {
    throw new Error('hosted_journey_cancelled_start_replay_changed')
  }
}

export function digestInput(value: unknown): string {
  return canonicalDigest(customerRequestJsonValueSchema.parse(value) as StableHashValue)
}

export async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
