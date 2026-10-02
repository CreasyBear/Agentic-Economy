import { gatewayFailureToProblem } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { authRefusalProblem, authenticateAgentAccess, resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions, type AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { SAVED_TOOLS_ROUTE_CONTRACTS,
  savedToolsListAction, savedToolsSaveAction, savedToolsRemoveAction,
  type SavedToolsService } from '@/modules/market/saved-tools.contracts'
import { callPublicSourceMutation, callPublicSourceQuery, callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { REFERENCE_RATE_MAX_AGE_MS, formatDisplayPrice, parseDecimalExactAmount, type ReferenceRate } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'
import { minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import { readX402DirectoryCatalogueResource } from '@/modules/market/x402-directory-index.server'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'
import {
  savedToolIdentitySchema,
  type SavedToolIdentity, type SavedToolListItem, type SavedToolSaveInput,
  type SavedToolRemoveResult, type SavedToolSaveResult, type SavedToolsListResult,
} from '@/modules/market/saved-tools.contracts'

const actions = { list: savedToolsListAction, save: savedToolsSaveAction, remove: savedToolsRemoveAction }
export type SavedToolsActionName = keyof typeof actions
export type SavedToolsHandlerOptions = Readonly<{
  authenticate?: AgentAccessAuthenticationOptions['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  savedToolsService?: SavedToolsService
}>

export async function handleSavedToolsPost(request: Request, actionName: SavedToolsActionName, options: SavedToolsHandlerOptions = {}): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const bounded = await readBoundedRequestText(request, 64 * 1024)
    if (!bounded.ok) return withRequestCorrelationHeader(problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: bounded.code }), correlationId)
    const contract = SAVED_TOOLS_ROUTE_CONTRACTS[actionName]
    const resolver = options.resolvePrincipal ?? (options.authenticate === undefined
      ? resolveAgentAccessPrincipal(request, bounded.text, correlationId) : undefined)
    const admitted = await authenticateAgentAccess({
      request,
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolver === undefined ? {} : { resolvePrincipal: resolver }),
      requiredScope: contract.scope, consequenceResource: `surface:http:saved-tools-${actionName}`,
    })
    if (admitted.kind !== 'authenticated') return authRefusalProblem(request, admitted, contract.scope, undefined, correlationId)
    const result = await withHttpRateLimit(request, actionName === 'list' ? 'public-read' : 'public-mutation', async () => {
      let input: unknown
      try { input = JSON.parse(bounded.text) as unknown }
      catch (cause) { return degrade(cause, problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json' }), { site: 'handleSavedToolsPost', reason: 'invalid_response' }) }
      const action = actions[actionName]
      const parsed = action.schema.safeParse(input)
      if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request' })
      try {
        const service = options.savedToolsService ?? createSavedToolsService(request, bounded.text)
        const principal = admitted.principal
        const output = actionName === 'list'
          ? await service.list(principal, correlationId)
          : actionName === 'save'
            ? await service.save(savedToolsSaveAction.schema.parse(input), principal, correlationId)
            : await service.remove(savedToolsRemoveAction.schema.parse(input), principal, correlationId)
        const projected = action.outputSchema.safeParse(output)
        if (!projected.success) throw new Error('saved_tools_result_invalid')
        return response(projected.data, 200, { 'Content-Type': 'application/json; charset=utf-8' })
      } catch (cause) {
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'source_unavailable', retryable: true })
        return degrade(cause, problem({ ...failure, detail: 'Saved Tools are temporarily unavailable.' }), { site: 'handleSavedToolsPost', reason: 'source_unavailable' })
      }
    })
    return withRequestCorrelationHeader(result, correlationId)
  })
}
type StoredIdentity = Readonly<{ kind: SavedToolIdentity['kind']; identityRef: string }>
type StoredRow = Readonly<{ identity: StoredIdentity; createdAt: number }>
type StoredList = Readonly<{ kind: 'available'; items: readonly StoredRow[] }> | Readonly<{ kind: 'error'; code: 'unauthenticated' }>
type StoredSave = Readonly<{ kind: 'saved' | 'already_saved'; identity: StoredIdentity; createdAt: number }>
  | Readonly<{ kind: 'refused'; code: 'unauthenticated' | 'limit_reached' | 'invalid_identity' | 'not_found' | 'source_unavailable' }>
type StoredRemove = SavedToolRemoveResult
export const ownerListQuery = sourceQuery<Record<string, never>, StoredList>('marketSavedTools:listOwner')
export const ownerSaveMutation = sourceMutation<{ identity: StoredIdentity }, StoredSave>('marketSavedTools:saveOwner')
export const ownerRemoveMutation = sourceMutation<{ identity: StoredIdentity }, StoredRemove>('marketSavedTools:removeOwner')
const agentListQuery = sourceQuery<Record<string, unknown>, StoredList>('marketSavedTools:listAgent')
const agentSaveMutation = sourceMutation<Record<string, unknown>, StoredSave>('marketSavedTools:saveAgent')
const agentRemoveMutation = sourceMutation<Record<string, unknown>, StoredRemove>('marketSavedTools:removeAgent')
const detailByIdQuery = sourceQuery<{ id: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:detailById')

function storedIdentity(identity: SavedToolIdentity): StoredIdentity {
  return identity.kind === 'ae_callable'
    ? { kind: identity.kind, identityRef: identity.toolRef }
    : { kind: identity.kind, identityRef: identity.resource }
}
function publicIdentity(identity: StoredIdentity): SavedToolIdentity {
  return identity.kind === 'ae_callable'
    ? { kind: identity.kind, toolRef: identity.identityRef }
    : { kind: identity.kind, resource: identity.identityRef }
}

/** Compact result IDs must resolve to current indexed resources; no opaque ID is durable. */
export async function resolveSavedIdentity(input: SavedToolSaveInput): Promise<SavedToolIdentity | 'not_found' | 'source_unavailable' | 'invalid_identity'> {
  if ('id' in input) {
    const result = await callPublicSourceQuery(detailByIdQuery, { id: input.id })
    if (result.kind === 'unavailable') return 'source_unavailable'
    if (result.kind === 'not_found') return 'not_found'
    if (result.kind !== 'found' || result.item.toolRef !== undefined) return 'invalid_identity'
    return savedToolIdentitySchema.parse({ kind: 'external_listing', resource: result.item.entry.resource })
  }
  if (input.kind === 'ae_callable') {
    const current = await readCapabilityToolDetail({ toolRef: input.toolRef })
    return current.kind === 'found' ? input : current.kind === 'not_found' ? 'not_found' : 'source_unavailable'
  }
  const current = await readX402DirectoryCatalogueResource({ resource: input.resource })
  if (current.kind === 'unavailable') return 'source_unavailable'
  if (current.kind === 'not_found') return 'not_found'
  if (current.kind !== 'found') return 'source_unavailable'
  if (current.item.toolRef !== undefined) return 'invalid_identity'
  return input
}

async function liveExternalEntry(resource: string, referenceRate: () => Promise<ReferenceRate | undefined>): Promise<SavedToolListItem['detail']> {
  const result = await readX402DirectoryCatalogueResource({ resource })
  if (result.kind === 'not_found') return { kind: 'not_found' }
  if (result.kind === 'unavailable') return { kind: 'unavailable' }
  const entry = result.item.entry
  const source = minimumDirectoryUsdPrice(entry)
  if (source === undefined) return { kind: 'found', entry }
  const amount = parseDecimalExactAmount('USDC', source, 6)
  if (amount === undefined) return { kind: 'found', entry }
  const rate = await referenceRate()
  if (rate === undefined) return { kind: 'found', entry }
  const estimate = formatDisplayPrice({ kind: 'indicative', amount, referenceRate: rate, validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS }, Date.now())
  return { kind: 'found', entry: estimate?.startsWith('A$') === true ? { ...entry, audEstimate: estimate } : entry }
}
export async function resolveSavedList(stored: StoredList): Promise<SavedToolsListResult> {
  if (stored.kind === 'error') return stored
  let ratePromise: Promise<ReferenceRate | undefined> | undefined
  const referenceRate = () => (ratePromise ??= readPersistedReferenceRate())
  const items = await Promise.all(stored.items.map(async ({ identity, createdAt }): Promise<SavedToolListItem> => {
    const publicRef = publicIdentity(identity)
    if (publicRef.kind === 'external_listing') {
      try { return { identity: publicRef, createdAt, detail: await liveExternalEntry(publicRef.resource, referenceRate) } }
      catch (cause) {
        return degrade<SavedToolListItem>(cause, { identity: publicRef, createdAt, detail: { kind: 'unavailable' } }, { site: 'resolveSavedList.externalListing', reason: 'source_unavailable' })
      }
    }
    try {
      const detail = await readCapabilityToolDetail({ toolRef: publicRef.toolRef })
      return { identity: publicRef, createdAt, detail: detail.kind === 'found'
        ? { kind: 'found', tool: detail.tool }
        : { kind: detail.kind === 'not_found' ? 'not_found' : 'unavailable' } }
    } catch (cause) {
      return degrade<SavedToolListItem>(cause, { identity: publicRef, createdAt, detail: { kind: 'unavailable' } }, { site: 'resolveSavedList.aeCallable', reason: 'source_unavailable' })
    }
  }))
  return { kind: 'available', items }
}

export function createSavedToolsService(request: Request, bodyText: string): SavedToolsService {
  async function run<T>(ref: Parameters<typeof callPublicSourceMutation>[0], action: string, identity: SavedToolIdentity, principal: AgentAccessPrincipal, correlationId: string): Promise<T> {
    const operationKey = canonicalDigest({ action, ownerId: principal.ownerId, identity })
    const command = { agentPrincipal: principal, identity: storedIdentity(identity), operationKey, correlationId }
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'protected_action', operationKey, correlationId })
    return await callPublicSourceMutation(ref, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }) as T
  }
  return {
    list: async (principal, correlationId): Promise<SavedToolsListResult> => {
      const operationKey = canonicalDigest({ action: SAVED_TOOLS_ROUTE_CONTRACTS.list.actionId, ownerId: principal.ownerId })
      const command = { agentPrincipal: principal, operationKey, correlationId }
      const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'protected_action', operationKey, correlationId })
      return await resolveSavedList(await callPublicSourceQuery(agentListQuery, {
        ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      }))
    },
    save: async (input, principal, correlationId): Promise<SavedToolSaveResult> => {
      const identity = await resolveSavedIdentity(input)
      if (typeof identity === 'string') return { kind: 'refused', code: identity }
      const result = await run<StoredSave>(agentSaveMutation, SAVED_TOOLS_ROUTE_CONTRACTS.save.actionId, identity, principal, correlationId)
      return result.kind === 'refused' ? result : { ...result, identity: publicIdentity(result.identity) }
    },
    remove: async (identity, principal, correlationId): Promise<SavedToolRemoveResult> =>
      await run<StoredRemove>(agentRemoveMutation, SAVED_TOOLS_ROUTE_CONTRACTS.remove.actionId, identity, principal, correlationId),
  }
}

export async function listSavedToolsOwner(): Promise<SavedToolsListResult> {
  return await resolveSavedList(await callSourceQuery(ownerListQuery, {}))
}

export async function saveSavedToolOwner(data: SavedToolSaveInput): Promise<SavedToolSaveResult> {
  const identity = await resolveSavedIdentity(data)
  if (typeof identity === 'string') return { kind: 'refused', code: identity }
  const result = await callSourceMutation(ownerSaveMutation, { identity: storedIdentity(identity) })
  return result.kind === 'refused' ? result : { kind: result.kind, identity, createdAt: result.createdAt }
}

export async function removeSavedToolOwner(data: SavedToolIdentity): Promise<SavedToolRemoveResult> {
  return await callSourceMutation(ownerRemoveMutation, { identity: storedIdentity(data) })
}
