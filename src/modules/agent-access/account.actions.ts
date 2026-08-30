import { z } from 'zod'

import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defineAction } from '@/modules/common/action'
import { CreditActivityViewSchema, exactAmountSchema } from '@/modules/money/public'

import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from './contract'
import { AGENT_ACCESS_ENVIRONMENT_VALUES } from './agent-access'

export const AGENT_ACCOUNT_SELF_ACTION_ID = 'agentAccess.whoami' as const
export const AGENT_ACCOUNT_SELF_HTTP_PATH = '/api/v1/account' as const
export const AGENT_ACCOUNT_BALANCE_ACTION_ID = 'agentAccess.balance' as const
export const AGENT_ACCOUNT_ACTIVITY_ACTION_ID = 'agentAccess.activity' as const

export const AGENT_ACCOUNT_SELF_ROUTE_CONTRACT = Object.freeze({
  actionId: AGENT_ACCOUNT_SELF_ACTION_ID,
  contractVersion: 'agent-account-self:v1',
  method: 'GET' as const,
  path: AGENT_ACCOUNT_SELF_HTTP_PATH,
  routerPath: '/api/v1/account' as const,
  scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  anyScopes: Object.freeze([MARKET_OPERATIONS_INVOKE_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE]),
  media: Object.freeze({ response: 'application/json; charset=utf-8' as const }),
})

export const AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS = Object.freeze({
  balance: Object.freeze({
    actionId: AGENT_ACCOUNT_BALANCE_ACTION_ID,
    contractVersion: 'agent-account-balance:v1',
    method: 'POST' as const,
    path: '/api/v1/account/balance' as const,
    routerPath: '/api/v1/account/balance' as const,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  }),
  activity: Object.freeze({
    actionId: AGENT_ACCOUNT_ACTIVITY_ACTION_ID,
    contractVersion: 'agent-account-activity:v1',
    method: 'POST' as const,
    path: '/api/v1/account/activity' as const,
    routerPath: '/api/v1/account/activity' as const,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  }),
})

export const agentAccountSelfInputSchema = z.strictObject({})

export const agentAccountSelfResultSchema = z.strictObject({
  kind: z.literal('authenticated'),
  principalRef: z.string().min(1),
  accountRef: z.string().min(1),
  credentialId: z.string().min(1),
  applicationRef: z.string().min(1),
  environment: z.enum(AGENT_ACCESS_ENVIRONMENT_VALUES),
  scopes: z.array(z.string().min(1)),
  authorityMode: z.enum(AGENT_ACCESS_AUTHORITY_MODE_VALUES),
})

export type AgentAccountSelfResult = z.infer<typeof agentAccountSelfResultSchema>

export const agentAccountBalanceInputSchema = z.strictObject({
  currency: z.string().trim().min(3).max(12).default('USD'),
})

const agentAccountFundingContinuationSchema = z.strictObject({
  kind: z.literal('owner_browser_required'),
  path: z.literal('/owner/credit'),
  anchor: z.literal('fund'),
})

export const agentAccountBalanceResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('available'),
    principalRef: z.string().min(1),
    accountRef: z.string().min(1),
    balance: exactAmountSchema,
    recoveryDue: exactAmountSchema,
    accountState: z.enum(['active', 'locked']),
    version: z.number().int().positive(),
    updatedAt: z.number().int().nonnegative(),
    funding: agentAccountFundingContinuationSchema,
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])

export const agentAccountActivityInputSchema = z.strictObject({
  currency: z.string().trim().min(3).max(12).default('USD'),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2_000).optional(),
})

export const agentAccountActivityResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('available'),
    items: z.array(CreditActivityViewSchema).max(100),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(2_000).optional(),
  }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])

export type AgentAccountBalanceInput = z.infer<typeof agentAccountBalanceInputSchema>
export type AgentAccountBalanceResult = z.infer<typeof agentAccountBalanceResultSchema>
export type AgentAccountActivityInput = z.infer<typeof agentAccountActivityInputSchema>
export type AgentAccountActivityResult = z.infer<typeof agentAccountActivityResultSchema>

type AgentMoneyRequest<Input> = Readonly<{
  input: Input
  principal: import('./agent-access').AgentAccessPrincipal
  correlationId: string
}>

export type AccountManagementService = Readonly<{
  balance: (request: AgentMoneyRequest<AgentAccountBalanceInput>) => Promise<AgentAccountBalanceResult>
  activity: (request: AgentMoneyRequest<AgentAccountActivityInput>) => Promise<AgentAccountActivityResult>
}>

const balanceMutation = sourceMutation<Record<string, unknown>, unknown>('agentMoneyReads:balance')
const activityMutation = sourceMutation<Record<string, unknown>, unknown>('agentMoneyReads:activity')

export function createAccountManagementService(request: Request, bodyText: string): AccountManagementService {
  async function mutate<T>(
    reference: Parameters<typeof callPublicSourceMutation>[0],
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<T> {
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'billing',
      operationKey,
      correlationId,
    })
    return await callPublicSourceMutation(reference, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }) as T
  }
  return {
    balance: async ({ input, principal, correlationId }) => {
      const operationKey = canonicalDigest({
        action: AGENT_ACCOUNT_BALANCE_ACTION_ID,
        principalRef: principal.principalId,
        credentialId: principal.credentialId,
        currency: input.currency,
        correlationId,
      })
      const result = await mutate<unknown>(balanceMutation, {
        currency: input.currency,
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }, operationKey, correlationId)
      const parsed = agentAccountBalanceResultSchema.safeParse(result)
      return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
    },
    activity: async ({ input, principal, correlationId }) => {
      const operationKey = canonicalDigest({
        action: AGENT_ACCOUNT_ACTIVITY_ACTION_ID,
        principalRef: principal.principalId,
        credentialId: principal.credentialId,
        currency: input.currency,
        cursor: input.cursor ?? null,
        limit: input.limit,
        correlationId,
      })
      const result = await mutate<unknown>(activityMutation, {
        currency: input.currency,
        paginationOpts: {
          numItems: input.limit,
          cursor: input.cursor ?? null,
        },
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }, operationKey, correlationId)
      if (typeof result !== 'object' || result === null || !('kind' in result)) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      if (result.kind === 'error') {
        const parsed = agentAccountActivityResultSchema.safeParse(result)
        return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
      }
      if (result.kind !== 'available' || !('activity' in result) || typeof result.activity !== 'object' || result.activity === null) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      const activity = result.activity as Record<string, unknown>
      const projected = {
        kind: 'available' as const,
        items: activity.page,
        hasMore: activity.isDone === false,
        ...(activity.isDone === false && typeof activity.continueCursor === 'string'
          ? { nextCursor: activity.continueCursor }
          : {}),
      }
      const parsed = agentAccountActivityResultSchema.safeParse(projected)
      return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
    },
  }
}

/**
 * Canonical self-inspection for an authenticated agent principal. Every
 * transport projects this result; no adapter re-derives account identity.
 */
export const agentAccountSelfAction = defineAction<
  z.infer<typeof agentAccountSelfInputSchema>,
  AgentAccountSelfResult
>({
  id: AGENT_ACCOUNT_SELF_ACTION_ID,
  name: 'Inspect current agent account',
  summary: 'Read the current agent principal, owner account, credential identity, scopes, and authority mode.',
  boundaries: [
    'Requires a current AE-issued agent credential.',
    'Returns identity and authority metadata only; it never returns the bearer secret or provider credentials.',
    'This action does not grant, rotate, revoke, fund, or otherwise mutate account authority.',
  ],
  schema: agentAccountSelfInputSchema,
  outputSchema: agentAccountSelfResultSchema,
  parameters: [],
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['usage_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: {
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
    anyScopes: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.anyScopes,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: [],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['current_agent_principal'],
    safeContinuations: ['agent_access_review'],
    invalidationConditions: ['credential_revoked', 'credential_expired', 'grant_changed'],
  },
  run: async ({ context }) => {
    const principal = context.agentAccessPrincipal
    if (principal === undefined) throw new Error('agent_access_context_missing')
    return agentAccountSelfResultSchema.parse({
      kind: 'authenticated',
      principalRef: principal.principalId,
      accountRef: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
      scopes: [...principal.scopes],
      authorityMode: principal.authorityMode,
    })
  },
})

export const agentAccountBalanceAction = defineAction<AgentAccountBalanceInput, AgentAccountBalanceResult>({
  id: AGENT_ACCOUNT_BALANCE_ACTION_ID,
  name: 'Read agent account balance',
  summary: 'Read the authenticated buyer credential’s current exact credit balance and recovery state.',
  boundaries: [
    'Reads only the owner account bound to the exact authenticated principal and credential.',
    'Amounts retain exact integer units and exponent; clients must not infer floating-point balances.',
    'Funding remains an authenticated owner browser action. The result returns that continuation and never charges a payment method.',
  ],
  schema: agentAccountBalanceInputSchema,
  outputSchema: agentAccountBalanceResultSchema,
  parameters: [
    { name: 'currency', type: 'string', description: 'Credit account currency, default USD.', required: false },
  ],
  readOnly: true,
  effect: {
    class: 'observation', reversible: true, recipientKind: 'none',
    dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: { scope: MARKET_OPERATIONS_INVOKE_SCOPE, authority: 'descriptor_classified' },
  invocationContract: {
    version: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.contractVersion,
    consequenceClass: 'read_only', materialInputPaths: ['currency'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['credit_account_balance'], safeContinuations: ['owner_credit_funding'],
    invalidationConditions: ['credential_revoked', 'currency_changed', 'ledger_version_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.accountManagementService === undefined) throw new Error('account_management_service_unavailable')
    return await context.accountManagementService.balance({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const agentAccountActivityAction = defineAction<AgentAccountActivityInput, AgentAccountActivityResult>({
  id: AGENT_ACCOUNT_ACTIVITY_ACTION_ID,
  name: 'List agent account activity',
  summary: 'List the authenticated buyer credential’s own bounded charge activity, newest first.',
  boundaries: [
    'Rows are bound to the exact authenticated principal and credential, not every credential owned by the account.',
    'Returns charge evidence and invocation references without operation inputs, outputs, bearer secrets, or payment-provider data.',
    'The cursor is opaque and remains bound to the same credential and currency.',
  ],
  schema: agentAccountActivityInputSchema,
  outputSchema: agentAccountActivityResultSchema,
  parameters: [
    { name: 'currency', type: 'string', description: 'Activity currency, default USD.', required: false },
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque cursor returned by the previous page.', required: false },
  ],
  readOnly: true,
  effect: {
    class: 'observation', reversible: true, recipientKind: 'none',
    dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: { scope: MARKET_OPERATIONS_INVOKE_SCOPE, authority: 'descriptor_classified' },
  invocationContract: {
    version: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.activity.contractVersion,
    consequenceClass: 'read_only', materialInputPaths: ['currency', 'limit', 'cursor'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['credential_charge_activity'], safeContinuations: ['operation.status'],
    invalidationConditions: ['credential_revoked', 'currency_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.accountManagementService === undefined) throw new Error('account_management_service_unavailable')
    return await context.accountManagementService.activity({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})
