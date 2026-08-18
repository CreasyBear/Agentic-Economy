import { kindForStatus } from '@/lib/errors'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { problem } from '@/lib/server/problem'
import { quarantineWriteResponse } from '@/lib/server/quarantine-write'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'
import { readRequestCorrelationId } from '@/lib/server/request-correlation'
import { z } from 'zod'
import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { authenticateAgentAccess, resolveAgentAccessPrincipal, type AgentAccessPrincipal } from './agent-access-auth'
import { resolveCanonicalBaseUrl } from './canonical-url'
import { callPublicSourceMutation, callPublicSourceQuery, sourceMutation, sourceQuery } from './convex-source'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { type AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import { findAction } from '@/modules/actions'
import { workTreeApplyResultSchema, workTreeDecisionResultSchema, workTreeRawApplyReceiptSchema, type WorkTreeApplyResult } from '@/modules/work-tree/work-tree.functions'
import {
  workTreeRepeatFinalizeResultSchema,
  workTreeRepeatInspectResultSchema,
  workTreeRepeatReconcileResultSchema,
  workTreeRepeatReserveResultSchema,
} from '@/modules/work-tree/work-tree-repeat.functions'

import { response } from '@/lib/server/no-store-response'
const MAX_WORK_TREE_AGENT_BODY_BYTES = 256 * 1024
const OPERATION_VALUES = ['create', 'inspect', 'apply', 'decide', 'reserveRepeatUse', 'finalizeRepeatUse', 'reconcileRepeatUse', 'inspectRepeatUse'] as const
export type WorkTreeAgentOperation = (typeof OPERATION_VALUES)[number]

const WORK_TREE_SCOPES: Readonly<Record<WorkTreeAgentOperation, string>> = {
  create: 'work_trees:create',
  inspect: 'work_trees:inspect',
  apply: 'work_trees:apply',
  decide: 'work_trees:decide',
  reserveRepeatUse: 'work_trees:repeat_reserve',
  finalizeRepeatUse: 'work_trees:repeat_finalize',
  reconcileRepeatUse: 'work_trees:repeat_reconcile',
  inspectRepeatUse: 'work_trees:repeat_inspect',
}

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  resolvePrincipal?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['resolvePrincipal']
  env?: Record<string, string | undefined>
  now?: () => number
  callOperation?: (input: Readonly<{ operation: WorkTreeAgentOperation; command: Record<string, unknown>; principal: AgentAccessPrincipal }>) => Promise<Record<string, unknown>>
}>
type JsonBody = Readonly<{ ok: true; value: unknown; bodyText: string }> | Readonly<{ ok: false; status: 400 | 413 }>

const sourceRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.string().trim().min(1),
  replayed: z.literal(false),
})
const inspectSourceRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.string().trim().min(1),
})
const repeatRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: z.string().trim().min(1),
  useRef: z.string().trim().min(1).optional(),
})
const repeatConflictSchema = z.strictObject({
  kind: z.literal('conflict'),
  operationKey: z.string().trim().min(1),
  useRef: z.string().trim().min(1).optional(),
})
const deterministicConflictCodes: Readonly<Record<string, true>> = {
  stale_fence: true,
  fence_mismatch: true,
  digest_mismatch: true,
  work_tree_proposal_digest_mismatch: true,
  work_tree_generation_stale: true,
  work_tree_revision_stale: true,
  idempotency_conflict: true,
  work_tree_operation_conflict: true,
  lineage_revision_conflict: true,
  lineage_conflict: true,
  claim_conflict: true,
  conflict: true,
  limit_exceeded: true,
  permission_expired: true,
  permission_revoked: true,
  credential_mismatch: true,
  invalid_amount: true,
  already_finalized: true,
  not_reconcilable: true,
  step_up_required: true,
  live_money_gate_open: true,
  stripe_setup_required: true,
  work_tree_target_not_frontier: true,
  work_tree_target_kind_invalid: true,
  work_tree_dependency_missing: true,
  work_tree_parent_cycle: true,
  work_tree_dependency_cycle: true,
  work_tree_children_limit: true,
  work_tree_node_limit: true,
  work_tree_depth_limit: true,
  work_tree_status_transition_invalid: true,
  work_tree_revision_overflow: true,
  work_tree_options_limit: true,
  work_tree_snapshot_too_large: true,
  work_tree_event_limit: true,
  work_tree_verb_invalid: true,
  approval_not_found: true,
  approval_owner_mismatch: true,
  approval_credential_mismatch: true,
  approval_project_mismatch: true,
  approval_node_mismatch: true,
  approval_proposal_mismatch: true,
  approval_authority_mismatch: true,
  approval_amount_mismatch: true,
  approval_expired: true,
  approval_used: true,
  approval_conflict: true,
}

/** One authenticated adapter for registered WorkTree actions; URL operation and source rechecks remain authoritative. */
export async function handleWorkTreeAgentAction(request: Request, operationInput: string, options: HandlerOptions = {}): Promise<Response> {
  return withRfc9745DeprecationNotice(await dispatchWorkTreeAgentAction(request, operationInput, options))
}

async function dispatchWorkTreeAgentAction(request: Request, operationInput: string, options: HandlerOptions): Promise<Response> {
  const operation = normalizeOperation(operationInput)
  if (operation === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'unknown_action' }, { Vary: 'Authorization' })
  const action = findAction(`workTree.${operation}`)
  if (action === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'unknown_action' }, { Vary: 'Authorization' })
  const frozen = quarantineWriteResponse(action.id, action.readOnly)
  if (frozen !== undefined) return frozen
  const body = await readBody(request)
  if (!body.ok) return body.status === 413
    ? problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large' }, { Vary: 'Authorization' })
    : problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_input' }, { Vary: 'Authorization' })
  const parsed = action.schema.safeParse(body.value)
  if (!parsed.success) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_input',
      detail: parsed.error.issues[0]?.message ?? 'Input did not match the action schema.',
    }, { Vary: 'Authorization' })
  }
  const command = parsed.data as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(command, 'guestAssertion')) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request' }, { Vary: 'Authorization' })
  }
  const mode = requiredMode(operation)
  const resolvePrincipal = options.resolvePrincipal
    ?? (options.authenticate === undefined
      ? resolveAgentAccessPrincipal(
          request,
          body.bodyText,
          readRequestCorrelationId(request),
          options.env === undefined ? {} : { env: options.env },
        )
      : undefined)
  const admitted = await authenticateAgentAccess({
    requiredScope: WORK_TREE_SCOPES[operation],
    requiredMode: mode,
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
  })
  if (admitted.kind === 'refused') return authRefusal(request, admitted.status, admitted.reason, mode)
  const principal = admitted.principal
  try {
    const result = await (options.callOperation === undefined
      ? callWorkTreeSource({ operation, command, principal, options })
      : options.callOperation({ operation, command, principal }))
    return projectResult(action.outputSchema, result, operation, request, mode)
  } catch (error) {
    return unknownResponse(operation, error)
  }
}

function normalizeOperation(value: string): WorkTreeAgentOperation | undefined {
  const candidate = value.replace(/^workTree\./u, '')
  return (OPERATION_VALUES as readonly string[]).includes(candidate) ? candidate as WorkTreeAgentOperation : undefined
}
function requiredMode(operation: WorkTreeAgentOperation): AgentAccessAuthorityMode {
  return operation === 'inspect' || operation === 'inspectRepeatUse' ? 'inspect_only' : 'approve_each'
}

async function callWorkTreeSource(input: Readonly<{ operation: WorkTreeAgentOperation; command: Record<string, unknown>; principal: AgentAccessPrincipal; options: HandlerOptions }>): Promise<Record<string, unknown>> {
  const key = (input.options.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) throw new Error('work_tree_service_auth_unavailable')
  // Only the signed principal fields travel; authorityMode is HTTP-admission
  // attribution and never crosses to Convex as unauthenticated payload.
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key,
    operation: `workTree.${input.operation}`,
    command: toStableHashValue(input.command),
    principal: {
      principalId: input.principal.principalId,
      ownerId: input.principal.ownerId,
      credentialId: input.principal.credentialId,
      scopes: input.principal.scopes,
    },
    issuedAt: (input.options.now ?? Date.now)(),
  })
  const args = { ...input.command, serviceAuth }
  if (input.operation === 'inspect') {
    return await callPublicSourceQuery(sourceQuery<Record<string, unknown>, Record<string, unknown>>('workTrees:inspect'), args)
  }
  if (input.operation === 'inspectRepeatUse') {
    return await callPublicSourceQuery(sourceQuery<Record<string, unknown>, Record<string, unknown>>('workTreeRepeatLedger:inspectRepeatUse'), args)
  }
  const sourceOperation = input.operation === 'reserveRepeatUse'
    ? 'workTreeRepeatLedger:reserveRepeatUse'
    : input.operation === 'finalizeRepeatUse'
      ? 'workTreeRepeatLedger:finalizeRepeatUse'
      : input.operation === 'reconcileRepeatUse'
        ? 'workTreeRepeatLedger:reconcileRepeatUse'
        : `workTrees:${input.operation}`
  return await callPublicSourceMutation(sourceMutation<Record<string, unknown>, Record<string, unknown>>(sourceOperation), args)
}

function projectResult(
  outputSchema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown,
  operation: WorkTreeAgentOperation,
  request: Request,
  mode: AgentAccessAuthorityMode,
): Response {
  const refusalSchema = operation === 'inspect' || operation === 'inspectRepeatUse' ? inspectSourceRefusalSchema : sourceRefusalSchema
  const sourceRefusal = refusalSchema.safeParse(value)
  if (sourceRefusal.success) return refusalResponse(request, operation, sourceRefusal.data.code, mode)

  if (operation === 'apply') {
    const raw = workTreeRawApplyReceiptSchema.safeParse(value)
    if (!raw.success) return unknownResponse(operation, 'work_tree_apply_source_result_invalid')
    const kind = raw.data.kind === 'replayed' ? 'replayed' : 'accepted'
    return response(workTreeApplyResultSchema.parse({
      kind,
      receipt: raw.data,
      readback: { projectId: raw.data.projectId, revision: raw.data.tree.revision },
    }) as WorkTreeApplyResult, 200, { Vary: 'Authorization' })
  }
  if (operation === 'decide') {
    const parsed = workTreeDecisionResultSchema.safeParse(value)
    if (!parsed.success) return unknownResponse(operation, 'work_tree_decide_source_result_invalid')
    if (parsed.data.kind === 'refused' && 'refusalCode' in parsed.data && typeof parsed.data.refusalCode === 'string') {
      return refusalResponse(request, operation, parsed.data.refusalCode, mode)
    }
    return response(parsed.data, 200, { Vary: 'Authorization' })
  }
  if (operation === 'reserveRepeatUse' || operation === 'finalizeRepeatUse'
    || operation === 'reconcileRepeatUse' || operation === 'inspectRepeatUse') {
    return projectRepeatResult(value, operation, request, mode)
  }
  const parsed = outputSchema.safeParse(value)
  if (!parsed.success) return unknownResponse(operation, 'work_tree_source_result_invalid')
  return response(parsed.data, 200, { Vary: 'Authorization' })
}

function projectRepeatResult(
  value: unknown,
  operation: Extract<WorkTreeAgentOperation, 'reserveRepeatUse' | 'finalizeRepeatUse' | 'reconcileRepeatUse' | 'inspectRepeatUse'>,
  request: Request,
  mode: AgentAccessAuthorityMode,
): Response {
  const schema = operation === 'reserveRepeatUse'
    ? workTreeRepeatReserveResultSchema
    : operation === 'finalizeRepeatUse'
      ? workTreeRepeatFinalizeResultSchema
      : operation === 'reconcileRepeatUse'
        ? workTreeRepeatReconcileResultSchema
        : workTreeRepeatInspectResultSchema
  const parsed = schema.safeParse(value)
  if (!parsed.success) return unknownResponse(operation, `work_tree_${operation}_source_result_invalid`)
  const refused = repeatRefusalSchema.safeParse(value)
  if (refused.success) return refusalResponse(request, operation, refused.data.reason, mode)
  const conflicted = repeatConflictSchema.safeParse(value)
  if (conflicted.success) return refusalResponse(request, operation, 'conflict', mode)
  return response(parsed.data, 200, { Vary: 'Authorization' })
}

function refusalResponse(
  request: Request,
  operation: WorkTreeAgentOperation,
  code: string,
  mode: AgentAccessAuthorityMode,
): Response {
  const status = refusalStatus(code)
  if (status === undefined) return unknownResponse(operation, code)
  const headers: Record<string, string> = { Vary: 'Authorization' }
  if (status === 401) headers['WWW-Authenticate'] = bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl)
  if (status === 403) headers['WWW-Authenticate'] = bearerModeChallenge(resolveCanonicalBaseUrl(request).baseUrl, mode)
  return problem({ status, kind: kindForStatus(status), code, extras: { replayed: false } }, headers)
}

function refusalStatus(code: string): 400 | 401 | 403 | 404 | 409 | undefined {
  if (code === 'invalid_request') return 400
  if (code === 'authentication_required') return 401
  if (code === 'forbidden' || code === 'lineage_forbidden') return 403
  if (code === 'not_found' || code === 'lineage_not_found' || code === 'work_tree_target_not_found') return 404
  return deterministicConflictCodes[code] === true ? 409 : undefined
}

function authRefusal(request: Request, status: 401 | 403, reason: string, mode: AgentAccessAuthorityMode): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  const challenge = status === 403 ? bearerModeChallenge(base, mode) : bearerChallenge(base)
  return problem({ status, kind: kindForStatus(status), code: reason, detail: reason }, { Vary: 'Authorization', 'WWW-Authenticate': challenge })
}
function unknownResponse(operation: WorkTreeAgentOperation, error: unknown): Response {
  if (operation === 'decide') return response({ kind: 'unknown' }, 200, { Vary: 'Authorization' })
  const reason = typeof error === 'string' && error.trim().length > 0
    ? error
    : error instanceof Error && error.message.trim().length > 0
      ? error.message
      : `work_tree_${operation}_unknown`
  return response({ kind: 'unknown', reason }, 200, { Vary: 'Authorization' })
}
async function readBody(request: Request): Promise<JsonBody> {
  const bounded = await readBoundedRequestText(request, MAX_WORK_TREE_AGENT_BODY_BYTES)
  if (!bounded.ok) return { ok: false, status: bounded.code === 'payload_too_large' ? 413 : 400 }
  try {
    return { ok: true, value: JSON.parse(bounded.text) as unknown, bodyText: bounded.text }
  } catch {
    return { ok: false, status: 400 }
  }
}
