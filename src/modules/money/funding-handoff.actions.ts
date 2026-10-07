import {
  defineAction,
  type ActionContext,
} from '@/modules/common/action'

import {
  fundingCreateReplayNextSchema,
  fundingStatusNextSchema,
  fundingCreateNextSchema,
  FUNDING_HANDOFF_CONFIG_ACTION_ID,
  FUNDING_HANDOFF_CREATE_ACTION_ID,
  FUNDING_HANDOFF_STATUS_ACTION_ID,
  FUNDING_HANDOFF_CONFIG_PATH,
  FUNDING_HANDOFF_CREATE_PATH,
  FUNDING_HANDOFF_STATUS_PATH,
  fundingHandoffConfigInputSchema,
  fundingHandoffConfigResultSchema,
  createFundingHandoffInputSchema,
  createFundingHandoffResultSchema,
  fundingHandoffStatusInputSchema,
  fundingHandoffStatusResultSchema,
} from './funding-handoff-schemas'
import type {
  FundingHandoffConfigResult,
  CreateFundingHandoffInput,
  CreateFundingHandoffResult,
  FundingHandoffStatusInput,
  FundingHandoffStatusResult,
  FundingHandoffRequest,
} from './funding-handoff-schemas'
export {
  fundingCreateReplayNextSchema,
  fundingStatusNextSchema,
  fundingCreateNextSchema,
  FUNDING_HANDOFF_CONFIG_ACTION_ID,
  FUNDING_HANDOFF_CREATE_ACTION_ID,
  FUNDING_HANDOFF_STATUS_ACTION_ID,
  FUNDING_HANDOFF_CONFIG_PATH,
  FUNDING_HANDOFF_CREATE_PATH,
  FUNDING_HANDOFF_STATUS_PATH,
  fundingHandoffConfigInputSchema,
  fundingHandoffConfigResultSchema,
  createFundingHandoffInputSchema,
  createFundingHandoffResultSchema,
  fundingHandoffStatusInputSchema,
  fundingHandoffStatusResultSchema,
}
export type {
  FundingHandoffConfigResult,
  CreateFundingHandoffInput,
  CreateFundingHandoffResult,
  FundingHandoffStatusInput,
  FundingHandoffStatusResult,
  FundingHandoffRequest,
}
export type FundingHandoffService = Readonly<{
  config: (request?: FundingHandoffRequest<Record<string, never>>) => Promise<FundingHandoffConfigResult>
  create: (request: FundingHandoffRequest<CreateFundingHandoffInput>) => Promise<CreateFundingHandoffResult>
  status: (request: FundingHandoffRequest<FundingHandoffStatusInput>) => Promise<FundingHandoffStatusResult>
}>

function service(context: ActionContext): FundingHandoffService {
  if (context.fundingHandoffService === undefined) throw new Error('funding_handoff_service_unavailable')
  return context.fundingHandoffService
}

export const fundingHandoffConfigAction = defineAction<Record<string, never>, FundingHandoffConfigResult>({
  id: FUNDING_HANDOFF_CONFIG_ACTION_ID,
  name: 'Read agent funding configuration',
  summary: 'Read exact AUD funding limits before creating a Stripe-hosted payer handoff.',
  boundaries: ['Requires a connected buyer agent.', 'Creates no payment and grants no payer authority.'],
  schema: fundingHandoffConfigInputSchema,
  outputSchema: fundingHandoffConfigResultSchema,
  parameters: [], readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: [], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  credentialAdmission: { scope: 'market_tools:call', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-config:v1', consequenceClass: 'read_only', materialInputPaths: [], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['funding_constraints'], safeContinuations: [FUNDING_HANDOFF_CREATE_ACTION_ID],
    invalidationConditions: ['commercial_policy_changed'],
  },
  run: async ({ context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    return await service(context).config({
      input: {}, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID(),
    })
  },
})

export const fundingHandoffCreateAction = defineAction<CreateFundingHandoffInput, CreateFundingHandoffResult>({
  id: FUNDING_HANDOFF_CREATE_ACTION_ID,
  name: 'Create a human funding handoff',
  summary: 'Create one durable Stripe-hosted funding session and return the direct payer URL.',
  boundaries: [
    'The payer receives no AE identity, Account ownership, Agent credential, Spending policy, or reusable payment authority.',
    'Persist fundingSessionId and poll status after handing checkoutUrl to the payer.',
    'Funding adds prepaid credit to the Agent’s Account after signed payment fulfilment; it grants no spending authority.',
    'Creating a session does not retry a blocked Call or create a new Call.',
  ],
  schema: createFundingHandoffInputSchema, outputSchema: createFundingHandoffResultSchema,
  parameters: [
    { name: 'principalAmount', type: 'object', description: 'Exact AUD Account credit to add.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'Stable key for this logical funding attempt.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['payment_handoff'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: { scope: 'market_tools:call', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-create:v1', consequenceClass: 'external_effect', materialInputPaths: ['principalAmount', 'idempotencyKey'],
    authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['stripe_checkout_session'],
    safeContinuations: [FUNDING_HANDOFF_STATUS_ACTION_ID], invalidationConditions: ['amount_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    return await service(context).create({
      input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID(),
    })
  },
})

export const fundingHandoffStatusAction = defineAction<FundingHandoffStatusInput, FundingHandoffStatusResult>({
  id: FUNDING_HANDOFF_STATUS_ACTION_ID,
  name: 'Read a funding handoff',
  summary: 'Poll the same funding session until signed payment fulfilment makes Account credit usable.',
  boundaries: [
    'Only the requesting Agent may read private status.',
    'Polling and browser redirects never credit the Account.',
    'Funding status grants no spending authority, retries no Call, and creates no new Call; inspect the Account balance and a Quote before any separate Call.',
  ],
  schema: fundingHandoffStatusInputSchema, outputSchema: fundingHandoffStatusResultSchema,
  parameters: [{ name: 'fundingSessionId', type: 'string', description: 'Stripe Checkout Session ID returned by create.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['payment_handoff'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  credentialAdmission: { scope: 'market_tools:call', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-status:v1', consequenceClass: 'read_only', materialInputPaths: ['fundingSessionId'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['funding_lifecycle', 'usable_balance'],
    safeContinuations: [FUNDING_HANDOFF_STATUS_ACTION_ID, 'agentAccess.balance', 'tool.quote'],
    invalidationConditions: ['credential_revoked', 'session_expired'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    return await service(context).status({
      input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? crypto.randomUUID(),
    })
  },
})
