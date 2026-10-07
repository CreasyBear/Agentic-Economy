import type { FunctionReference, FunctionReturnType } from 'convex/server'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import { isRecord } from '@/modules/common/is-record'
import { z } from 'zod'
import type {
  OwnerSupplyCommandResult,
} from './internal/supply-funnel/types'
import { executePublishCommitPipeline } from './internal/supply-publish-pipeline'
import { inspectX402SellerEndpoint } from './internal/x402-seller-endpoint-inspector'
import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from './internal/x402-seller-claim'
import {
  canonicalEvmAddress,
  evmAddressEquals,
  verifyEip191Message,
} from './internal/x402-evm-protocol'
import {
  previewSupplySource,
  type SupplySourceInput,
  type SupplySourcePreview,
} from './source-preview'
import {
  SUPPLY_ACTION_IDS,
  supplyCallSummarySchema,
  supplyConnectionCommandResultSchema,
  supplyConnectionDetailResultSchema,
  supplyConnectionListResultSchema,
  supplyEarningsResultSchema,
  supplyRecheckResultSchema,
  supplyRepublishResultSchema,
  supplyStatusResultSchema,
  supplyToolsListResultSchema,
  type ProviderConnectionProjection,
  type SupplyCallsInput,
  type SupplyCallsResult,
  type SupplyConnectionCommandResult,
  type SupplyConnectionConnectInput,
  type SupplyConnectionDetailInput,
  type SupplyConnectionDetailResult,
  type SupplyConnectionListInput,
  type SupplyConnectionListResult,
  type SupplyConnectionTransitionInput,
  type SupplyEarningsInput,
  type SupplyEarningsResult,
  type SupplyOffboardingStatusInput,
  type SupplyOffboardingStatusResult,
  type SupplyPublishInput,
  type SupplyPublishResult,
  type SupplyRecheckInput,
  type SupplyRecheckResult,
  type SupplyRepublishInput,
  type SupplyRepublishResult,
  type SupplyStatusInput,
  type SupplyStatusResult,
  type SupplyToolsListInput,
  type SupplyToolsListResult,
  type SupplyWithdrawInput,
  type SupplyWithdrawResult,
} from './supply-action-schemas'
export type SupplyManagementService = Readonly<{
  sourcePreview: (input: Readonly<{ input: SupplySourceInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplySourcePreview>
  toolsList: (input: Readonly<{ input: SupplyToolsListInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyToolsListResult>
  status: (input: Readonly<{ input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyStatusResult>
  publish: (input: Readonly<{ input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyPublishResult>
  withdraw: (input: Readonly<{ input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyWithdrawResult>
  recheck: (input: Readonly<{ input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyRecheckResult>
  republish: (input: Readonly<{ input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyRepublishResult>
  earnings: (input: Readonly<{ input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyEarningsResult>
  calls: (input: Readonly<{ input: SupplyCallsInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyCallsResult>
  connectionList: (input: Readonly<{ input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyConnectionListResult>
  connectionDetail: (input: Readonly<{ input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyConnectionDetailResult>
  connectionConnect: (input: Readonly<{ input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyConnectionCommandResult>
  connectionReconnect: (input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyConnectionCommandResult>
  connectionRevoke: (input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyConnectionCommandResult>
  offboardingStatus: (input: Readonly<{ input: SupplyOffboardingStatusInput; principal: AgentAccessPrincipal; correlationId: string }>) => Promise<SupplyOffboardingStatusResult>
}>

import { providerToolStatusSchema } from './provider-tool-status'


const SUPPLY_CALLS_CURSOR_KIND = 'supply-calls'
const MAX_SUPPLY_CALLS_CURSOR_LENGTH = 512
const supplyCallsCursorEnvelopeSchema = z.strictObject({
  kind: z.literal(SUPPLY_CALLS_CURSOR_KIND),
  scope: z.string(),
  cursor: z.string(),
})
/** Opaque, scope-bound continuation token (same envelope shape as `@/modules/registry/opaque-cursor`, kept local to respect the module boundary). */
function encodeSupplyCallsCursor(input: Readonly<{ scope: string; cursor: string }>): string {
  return base64Codec.toBase64Url(new TextEncoder().encode(JSON.stringify({ kind: SUPPLY_CALLS_CURSOR_KIND, ...input })))
}
function decodeSupplyCallsCursor(token: string, scope: string): string | undefined {
  if (token.length === 0 || token.length > MAX_SUPPLY_CALLS_CURSOR_LENGTH) return undefined
  const bytes = tryDecodeBase64Url(token)
  if (bytes === undefined) return undefined
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'decodeSupplyCallsCursor', reason: 'invalid_response' })
  }
  const parsed = supplyCallsCursorEnvelopeSchema.safeParse(json)
  if (!parsed.success || parsed.data.scope !== scope) return undefined
  return parsed.data.cursor
}
type SupplyConnectionRefusalReason = Extract<
  SupplyConnectionCommandResult,
  Readonly<{ kind: 'refused' }>
>['reason']

function connectionRefused(reason: SupplyConnectionRefusalReason): SupplyConnectionCommandResult {
  return { kind: 'refused', reason }
}

type ProviderToolAgentRead = Readonly<{ kind: 'available'; statusJson: string }> | Readonly<{ kind: 'not_found' }>
type ProviderToolAgentList = Readonly<{
  kind: 'available'
  page: readonly Readonly<{ statusJson: string }>[]
  isDone: boolean
  continueCursor: string
}> | Readonly<{ kind: 'not_found' }>
const providerToolReadQuery = sourceQuery<Record<string, unknown>, ProviderToolAgentRead>('capabilityProviderTools:readAgent')
const providerToolListQuery = sourceQuery<Record<string, unknown>, ProviderToolAgentList>('capabilityProviderTools:listAgent')
const withdrawMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:withdrawOwnerCapability')
const recheckMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:refreshOwnerCapability')
const republishMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:republishOwnerCapability')
const earningsReadMutation = sourceMutation<Record<string, unknown>, SupplyEarningsResult>('moneyLedger:readAgentProviderEarnings')
type SupplyCallsCursor = Readonly<{ createdAt: number; callRef: string }>
type SupplyCallsBackendResult =
  | Readonly<{
      kind: 'available'
      items: readonly z.infer<typeof supplyCallSummarySchema>[]
      limit: number
      hasMore: boolean
      nextCursor?: SupplyCallsCursor
    }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>
const callsListQuery = sourceQuery<Record<string, unknown>, SupplyCallsBackendResult>('capabilityCallProjection:listAgentSupplyCalls')
const connectionListQuery = sourceQuery<Record<string, unknown>, SupplyConnectionListResult>('capabilityProviderConnectionAgents:list')
const connectionDetailQuery = sourceQuery<Record<string, unknown>, SupplyConnectionDetailResult>('capabilityProviderConnectionAgents:read')
type ProviderConnectionBackendCommandResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; connection: ProviderConnectionProjection; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: Extract<SupplyConnectionCommandResult, Readonly<{ kind: 'refused' }>>['reason'] }>
const connectionConnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:connectX402')
type ProviderConnectionAttemptReservationResult =
  | Readonly<{ kind: 'reserved' | 'replayed'; attemptRef: string; expiresAt: number }>
  | Readonly<{ kind: 'refused'; code: 'invalid_identity' | 'invalid_environment' | 'invalid_source' | 'command_identity_conflict' }>
const connectionAttemptReservationMutation = sourceMutation<Record<string, unknown>, ProviderConnectionAttemptReservationResult>('capabilityProviderConnectionAttempts:reserveAgent')
const connectionReconnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:reconnect')
const connectionRevokeMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:revoke')
const offboardingStatusQuery = sourceQuery<Record<string, unknown>, SupplyOffboardingStatusResult>('capabilityProviderOffboarding:readAgentStatus')

function commandKey(action: string, principal: AgentAccessPrincipal, idempotencyKey: string): string {
  return canonicalDigest({ action, ownerId: principal.ownerId, idempotencyKey })
}
function refused(reason: string): { kind: 'refused'; reason: string } {
  return { kind: 'refused', reason }
}

export function createSupplyManagementService(request: Request, bodyText: string): SupplyManagementService {
  const mutate = async <Mutation extends FunctionReference<'mutation', 'public', Record<string, unknown>>>(
    mutation: Mutation,
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<FunctionReturnType<Mutation>> => {
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'catalog_publish', operationKey, correlationId })
    return await callPublicSourceMutation(mutation, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  }
  const query = async <Q extends FunctionReference<'query', 'public', Record<string, unknown>>>(
    sourceQueryRef: Q,
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<FunctionReturnType<Q>> => {
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'catalog_publish', operationKey, correlationId })
    return await callPublicSourceQuery(sourceQueryRef, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  }
  const status = async ({ input, principal, correlationId }: { input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyStatusResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.status,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      toolRef: input.toolRef,
      correlationId,
    })
    const readback = await query(providerToolReadQuery, {
      businessId: input.businessRef,
      toolRef: input.toolRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (readback.kind === 'not_found') return { kind: 'not_found' }
    const projected = providerToolStatusSchema.safeParse(JSON.parse(readback.statusJson) as unknown)
    if (!projected.success) return { kind: 'error', code: 'source_unavailable' }
    return supplyStatusResultSchema.parse({
      kind: 'available',
      schemaVersion: 'provider_tools:v1',
      businessRef: input.businessRef,
      status: projected.data,
    })
  }
  const toolsList = async ({ input, principal, correlationId }: { input: SupplyToolsListInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyToolsListResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.toolsList,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      limit: input.limit,
      cursor: input.cursor ?? null,
      correlationId,
    })
    const readback = await query(providerToolListQuery, {
      businessId: input.businessRef,
      paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null },
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (readback.kind === 'not_found') return { kind: 'not_found' }
    const page = readback.page.map(({ statusJson }) => providerToolStatusSchema.safeParse(JSON.parse(statusJson) as unknown))
    if (page.some((item) => !item.success)) return { kind: 'error', code: 'source_unavailable' }
    return supplyToolsListResultSchema.parse({
      kind: 'available',
      schemaVersion: 'provider_tools:v1',
      businessRef: input.businessRef,
      page: page.flatMap((item) => item.success ? [item.data] : []),
      isDone: readback.isDone,
      continueCursor: readback.isDone ? null : readback.continueCursor,
    })
  }
  const sourcePreview = async ({ input }: { input: SupplySourceInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplySourcePreview> => (
    await previewSupplySource(input)
  )
  const publish = async ({ input, principal }: { input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyPublishResult> => {
    return await executePublishCommitPipeline({ input, principal, mutate, query })
  }
  const withdraw = async ({ input, principal, correlationId: _transportCorrelationId }: { input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyWithdrawResult> => {
    const baseKey = commandKey('supply.withdraw', principal, input.idempotencyKey)
    const durableCorrelationId = baseKey
    const result = await mutate(withdrawMutation, {
      businessId: input.businessId, offeringRef: input.offeringRef, offeringRevision: input.offeringRevision, offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef, publicationRevision: input.publicationRevision, operationKey: baseKey, correlationId: durableCorrelationId,
      reasonCode: 'supply.withdraw', evidenceRefs: [], agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (result.kind === 'refused') return refused(typeof result.reason === 'string' ? result.reason : 'source_unavailable')
    if (result.kind !== 'withdrawn' || typeof result.publicationRef !== 'string' || typeof result.revision !== 'number' || !isRecordLifecycle(result.lifecycle)) return refused('source_unavailable')
    return { kind: 'withdrawn', publicationRef: result.publicationRef, revision: result.revision, lifecycle: result.lifecycle }
  }
  const runMaintenance = async (
    action: typeof SUPPLY_ACTION_IDS.recheck | typeof SUPPLY_ACTION_IDS.republish,
    mutation: typeof recheckMutation | typeof republishMutation,
    input: SupplyRecheckInput | SupplyRepublishInput,
    principal: AgentAccessPrincipal,
  ): Promise<OwnerSupplyCommandResult> => {
    const baseKey = commandKey(action, principal, input.idempotencyKey)
    return await mutate(mutation, {
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: input.offeringRevision,
      offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef,
      publicationRevision: input.publicationRevision,
      operationKey: baseKey,
      correlationId: baseKey,
      reasonCode: action,
      evidenceRefs: [],
      agentPrincipal: principal,
    }, baseKey, baseKey)
  }
  const recheck = async ({ input, principal }: { input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRecheckResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.recheck, recheckMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'refreshed') return refused('source_unavailable')
    return supplyRecheckResultSchema.parse(result)
  }
  const republish = async ({ input, principal }: { input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRepublishResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.republish, republishMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'republished') return refused('source_unavailable')
    return supplyRepublishResultSchema.parse(result)
  }
  const earnings = async ({ input, principal, correlationId }: { input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyEarningsResult> => {
    const operationKey = canonicalDigest({
      action: 'supply.earnings',
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      correlationId,
      currency: input.currency,
    })
    const result = await mutate(earningsReadMutation, {
      currency: input.currency,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    return supplyEarningsResultSchema.parse(result)
  }
  const connectionList = async ({ input, principal, correlationId }: { input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionListResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionList,
      principalId: principal.principalId,
      businessId: input.businessId,
      lifecycle: input.lifecycle ?? null,
      limit: input.limit,
      correlationId,
    })
    const result = await query(connectionListQuery, {
      businessId: input.businessId,
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      limit: input.limit,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionListResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const connectionDetail = async ({ input, principal, correlationId }: { input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionDetailResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionDetail,
      principalId: principal.principalId,
      connectionRef: input.connectionRef,
      correlationId,
    })
    const result = await query(connectionDetailQuery, {
      connectionRef: input.connectionRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionDetailResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const runConnectionCommand = async (
    action: typeof SUPPLY_ACTION_IDS.connectionConnect
      | typeof SUPPLY_ACTION_IDS.connectionReconnect
      | typeof SUPPLY_ACTION_IDS.connectionRevoke,
    mutation: typeof connectionConnectMutation,
    command: Record<string, unknown>,
    input: Readonly<{ idempotencyKey: string }>,
    principal: AgentAccessPrincipal,
  ): Promise<SupplyConnectionCommandResult> => {
    const operationKey = commandKey(action, principal, input.idempotencyKey)
    const result = await mutate(mutation, {
      ...command,
      commandId: operationKey,
      agentPrincipal: principal,
      operationKey,
      correlationId: operationKey,
    }, operationKey, operationKey)
    if (result.kind === 'refused') return { kind: 'refused', reason: result.code }
    const parsed = supplyConnectionCommandResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'refused', reason: 'source_unavailable' }
  }
  const connectionConnect = async ({ input, principal }: { input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => {
    if (input.kind !== 'x402') {
      if (input.environment !== principal.environment) return connectionRefused('invalid_identity')
      const operationKey = commandKey(SUPPLY_ACTION_IDS.connectionConnect, principal, input.idempotencyKey)
      const sourceUrl = input.kind === 'mcp_oauth' ? input.serverUrl : input.sourceUrl
      const authentication = input.kind === 'mcp_oauth'
        ? { kind: 'mcp_oauth' as const }
        : input.authentication
      const inputDigest = canonicalDigest({
        format: 'provider-connection-attempt-input:v1',
        sourceKind: input.kind,
        businessRef: input.businessRef,
        sourceUrl,
        authentication,
        environment: input.environment,
      })
      const result = await mutate(connectionAttemptReservationMutation, {
        businessId: input.businessRef,
        sourceKind: input.kind,
        sourceUrl,
        authentication,
        environment: input.environment,
        inputDigest,
        commandId: operationKey,
        agentPrincipal: principal,
        operationKey,
        correlationId: operationKey,
      }, operationKey, operationKey)
      if (result.kind === 'refused') {
        return connectionRefused(result.code === 'command_identity_conflict'
          ? 'command_identity_conflict'
          : 'invalid_identity')
      }
      const cta = `/owner/supply/connections/new?attempt=${encodeURIComponent(result.attemptRef)}`
      return {
        kind: 'action_required',
        attemptRef: result.attemptRef,
        expiresAt: result.expiresAt,
        ownerHandoff: {
          actor: 'business_owner',
          reason: 'provider_connection_required',
          destination: cta,
          ctaLabel: 'Connect service',
          description: input.kind === 'mcp_oauth'
            ? 'Sign in to the MCP service in your browser, then return to your agent.'
            : 'Enter the service credential securely in your browser, then return to your agent.',
          title: 'Connect service',
        },
      }
    }
    const evidenceRefs = input.evidenceRefs ?? []
    if (input.environment !== principal.environment || evidenceRefs.some((ref) => (
      ref.startsWith('x402-payee-claim:') || ref.startsWith('x402-endpoint-inspection:')
    ))) return connectionRefused('claim_invalid')

    const inspection = await inspectX402SellerEndpoint({
      endpointUrl: input.resourceUrl,
      method: input.method,
      aeEnvironment: input.environment,
    })
    if (inspection.kind === 'refused') {
      return connectionRefused(`inspection_${inspection.reason}`)
    }
    if (inspection.payment.selection.kind !== 'selected') {
      return connectionRefused(`inspection_${inspection.payment.selection.kind}`)
    }
    const selectedAlternativeId = inspection.payment.selection.alternativeId
    const selected = inspection.payment.accepts.find((candidate) => (
      candidate.alternativeId === selectedAlternativeId
    ))
    const now = Date.now()
    const payTo = selected === undefined
      ? undefined
      : canonicalEvmAddress(selected.payTo)
    if (payTo === undefined
      || !evmAddressEquals(payTo, input.payTo)
      || inspection.digest !== input.observationDigest
      || !validX402SellerClaimTime(input.claimExpiresAt, now)) {
      return connectionRefused('claim_invalid')
    }
    const claim = {
      businessId: input.businessRef,
      endpointUrl: inspection.endpoint.url,
      method: input.method,
      observationDigest: inspection.digest,
      payTo,
      expiresAt: input.claimExpiresAt,
    } as const
    let claimVerified = false
    try {
      claimVerified = await verifyEip191Message({
        address: claim.payTo,
        message: x402SellerClaimMessage(claim),
        signature: input.claimSignature,
      })
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'connectionConnect', reason: 'source_unavailable' })
      claimVerified = false
    }
    if (!claimVerified) return connectionRefused('claim_invalid')

    return await runConnectionCommand(SUPPLY_ACTION_IDS.connectionConnect, connectionConnectMutation, {
      businessId: input.businessRef,
      resourceUrl: inspection.endpoint.url,
      method: input.method,
      observationDigest: inspection.digest,
      payTo: claim.payTo,
      claimExpiresAt: input.claimExpiresAt,
      claimDigest: x402SellerClaimDigest(claim),
      claimSignature: input.claimSignature,
      evidenceRefs: [
        ...evidenceRefs,
        `x402-endpoint-inspection:${inspection.digest}`,
      ],
    }, input, principal)
  }
  const connectionReconnect = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionReconnect, connectionReconnectMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const connectionRevoke = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionRevoke, connectionRevokeMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const offboardingStatus = async ({ input, principal, correlationId }: { input: SupplyOffboardingStatusInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyOffboardingStatusResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.offboardingStatus,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      correlationId,
    })
    return await query(offboardingStatusQuery, {
      businessId: input.businessRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
  }
  const calls = async ({ input, principal, correlationId }: { input: SupplyCallsInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyCallsResult> => {
    const cursorScope = canonicalDigest({ action: SUPPLY_ACTION_IDS.calls, ownerId: principal.ownerId, state: input.state ?? null })
    let cursor: SupplyCallsCursor | undefined
    if (input.cursor !== undefined) {
      const decoded = decodeSupplyCallsCursor(input.cursor, cursorScope)
      if (decoded === undefined) return { kind: 'error', code: 'source_unavailable' }
      try {
        const parsed = JSON.parse(decoded) as unknown
        if (!isRecord(parsed) || typeof parsed.createdAt !== 'number' || typeof parsed.callRef !== 'string') {
          return { kind: 'error', code: 'source_unavailable' }
        }
        cursor = { createdAt: parsed.createdAt, callRef: parsed.callRef }
      } catch (cause) {
        return degradeBackend(cause, { kind: 'error', code: 'source_unavailable' } as const, { site: 'calls', reason: 'invalid_response' })
      }
    }
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.calls,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      correlationId,
      state: input.state ?? null,
      limit: input.limit,
      cursor: input.cursor ?? null,
    })
    const result = await query(callsListQuery, {
      agentPrincipal: principal,
      ...(input.state === undefined ? {} : { state: input.state }),
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (result.kind === 'error') return result
    const nextCursor = result.nextCursor === undefined
      ? undefined
      : encodeSupplyCallsCursor({ scope: cursorScope, cursor: JSON.stringify(result.nextCursor) })
    return {
      kind: 'available',
      items: [...result.items],
      limit: result.limit,
      hasMore: result.hasMore,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    }
  }
  return {
    sourcePreview,
    toolsList,
    status,
    publish,
    withdraw,
    recheck,
    republish,
    earnings,
    calls,
    connectionList,
    connectionDetail,
    connectionConnect,
    connectionReconnect,
    connectionRevoke,
    offboardingStatus,
  }
}

export const createConvexSupplyManagementAdapter = createSupplyManagementService

function isRecordLifecycle(value: unknown): value is { state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'; reasons: string[] } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof Reflect.get(value, 'state') === 'string' && Array.isArray(Reflect.get(value, 'reasons'))
}
