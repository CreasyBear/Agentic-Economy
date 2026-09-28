import { z } from 'zod'

import { AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { describeActionForAgent, findAction, journeyStatusResultSchema } from '@/modules/actions'
import { statusRefSchema } from '@/modules/actions/contract'
import { SUPPLY_ACTION_ROUTE_CONTRACTS } from '@/modules/capability-supply/supply-actions'
import { MARKET_REQUEST_ROUTE_CONTRACTS } from '@/modules/market-demand/market-demand.actions'
import { SAVED_TOOLS_ROUTE_CONTRACTS } from '@/modules/market/saved-tools.actions'
import {
  createFundingHandoffInputSchema,
  FUNDING_HANDOFF_CONFIG_ACTION_ID,
  FUNDING_HANDOFF_CONFIG_PATH,
  FUNDING_HANDOFF_CREATE_ACTION_ID,
  FUNDING_HANDOFF_CREATE_PATH,
  FUNDING_HANDOFF_STATUS_ACTION_ID,
  FUNDING_HANDOFF_STATUS_PATH,
  fundingHandoffStatusInputSchema,
} from '@/modules/money/funding-handoff.actions'
import { exactAmountSchema } from '@/modules/money/public'

import { jsonSchemaOf, problemResponses } from './openapi-document-schema'
import type { NormalizedOperation } from './openapi-document-types'

const AUTH_ERRORS = problemResponses(['UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT', 'PAYLOAD_TOO_LARGE', 'NOT_FOUND', 'ALREADY_EXISTS', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'])

const actionRoutes = [
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  ...Object.values(AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS),
  ...Object.values(MARKET_REQUEST_ROUTE_CONTRACTS),
  ...Object.values(SAVED_TOOLS_ROUTE_CONTRACTS),
  ...Object.values(SUPPLY_ACTION_ROUTE_CONTRACTS),
] as const

/** These routes consume the registered action's Zod request/response, not a second wire schema. */
function actionOperations(): readonly NormalizedOperation[] {
  return actionRoutes.map((route) => {
    const action = findAction(route.actionId)
    if (action === undefined) throw new Error(`openapi_action_missing:${route.actionId}`)
    const descriptor = describeActionForAgent(action)
    const bodySchema = descriptor.inputJsonSchema
    const hasBodyIdempotency = route.method === 'POST' && bodySchema?.properties?.idempotencyKey !== undefined
    return {
      operationId: route.actionId,
      summary: descriptor.name,
      tags: [route.path.startsWith('/api/v1/supply/') ? 'Provider' : route.path.startsWith('/api/v1/market-requests') ? 'Market demand' : 'Account'],
      method: route.method,
      path: route.path,
      security: { scope: route.scope },
      ...(hasBodyIdempotency ? { description: 'Retry the same logical operation with the same JSON body idempotencyKey; a changed payload conflicts.' } : {}),
      pathParams: [], queryParams: [],
      ...(route.method === 'POST' && bodySchema !== undefined ? { requestBodySchema: bodySchema } : {}),
      responses: [
        { status: 200, schema: descriptor.outputJsonSchema ?? jsonSchemaOf(action.outputSchema), mediaType: 'application/json', description: 'Success.' },
        ...AUTH_ERRORS,
      ],
    }
  })
}

const payerSafeFundingSchema = z.strictObject({
  success: z.literal(true),
  funding: z.strictObject({
    state: z.enum(['awaiting_payment', 'processing', 'ready', 'expired', 'failed']),
    agentName: z.string(),
    creditAmount: exactAmountSchema,
  }),
})

function fundingOperations(): readonly NormalizedOperation[] {
  const config = describeActionForAgent(findFundingAction(FUNDING_HANDOFF_CONFIG_ACTION_ID))
  const create = describeActionForAgent(findFundingAction(FUNDING_HANDOFF_CREATE_ACTION_ID))
  const status = describeActionForAgent(findFundingAction(FUNDING_HANDOFF_STATUS_ACTION_ID))
  const fundingSessionId = {
    name: 'fundingSessionId', description: 'Stripe Checkout Session ID.', required: true,
    schema: jsonSchemaOf(fundingHandoffStatusInputSchema.shape.fundingSessionId),
  }
  const authenticated = { scope: MARKET_TOOLS_CALL_SCOPE }
  return [
    {
      operationId: FUNDING_HANDOFF_CONFIG_ACTION_ID, summary: config.name, tags: ['Funding'], method: 'GET',
      path: FUNDING_HANDOFF_CONFIG_PATH, security: authenticated, pathParams: [], queryParams: [],
      responses: [{ status: 200, schema: config.outputJsonSchema ?? jsonSchemaOf(findFundingAction(FUNDING_HANDOFF_CONFIG_ACTION_ID).outputSchema), mediaType: 'application/json', description: 'Current funding limits.' }, ...AUTH_ERRORS],
    },
    {
      operationId: FUNDING_HANDOFF_CREATE_ACTION_ID, summary: create.name, tags: ['Funding'], method: 'POST',
      path: FUNDING_HANDOFF_CREATE_PATH, security: authenticated, pathParams: [], queryParams: [],
      description: 'Send Idempotency-Key as an HTTP header, not in the JSON body. Reuse the same key and amount to recover a funding session.',
      headerParams: [{ name: 'Idempotency-Key', description: 'Stable key for this funding attempt; changed amount conflicts.', required: true, schema: jsonSchemaOf(createFundingHandoffInputSchema.shape.idempotencyKey) }],
      requestBodySchema: jsonSchemaOf(createFundingHandoffInputSchema.pick({ principalAmount: true })),
      responses: [{ status: 201, schema: create.outputJsonSchema ?? jsonSchemaOf(findFundingAction(FUNDING_HANDOFF_CREATE_ACTION_ID).outputSchema), mediaType: 'application/json', description: 'Funding session created or replayed.' }, ...AUTH_ERRORS],
    },
    {
      operationId: FUNDING_HANDOFF_STATUS_ACTION_ID, summary: status.name, tags: ['Funding'], method: 'GET',
      path: FUNDING_HANDOFF_STATUS_PATH, security: authenticated, pathParams: [fundingSessionId], queryParams: [],
      responses: [{ status: 200, schema: status.outputJsonSchema ?? jsonSchemaOf(findFundingAction(FUNDING_HANDOFF_STATUS_ACTION_ID).outputSchema), mediaType: 'application/json', description: 'Funding session state.' }, ...AUTH_ERRORS],
    },
    {
      operationId: 'funding.handoff.publicStatus', summary: 'Read payer-safe funding session status', tags: ['Funding'], method: 'GET',
      path: '/api/v1/account/funding-sessions/public/{fundingSessionId}', security: 'none', pathParams: [fundingSessionId], queryParams: [],
      responses: [{ status: 200, schema: jsonSchemaOf(payerSafeFundingSchema), mediaType: 'application/json', description: 'Payer-safe funding state.' }, ...problemResponses(['NOT_FOUND'])],
    },
  ]
}

function findFundingAction(actionId: string) {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`openapi_action_missing:${actionId}`)
  return action
}

const chatTurnBody = z.strictObject({
  prompt: z.string().trim().min(1).max(2_000),
  threadId: z.string().min(1).optional(),
  clientTurnId: z.string().trim().min(1).max(200),
})
const turnRefParam = {
  name: 'turnRef', description: 'Principal-bound durable Turn reference.', required: true,
  schema: jsonSchemaOf(z.string().regex(/^turn_[0-9a-f-]{36}$/u)),
}
const turnState = z.enum(['submitted', 'working', 'input-required', 'auth-required', 'completed', 'failed', 'canceled', 'rejected'])
const turnSnapshot = z.strictObject({
  threadId: z.string(), turnRef: z.string(), promptMessageId: z.string(),
  state: turnState, sequence: z.number(),
  cancelRequestedAt: z.number().optional(), callRefs: z.array(z.string()), inFlightCallRefs: z.array(z.string()),
})

const statusRefParam = {
  name: 'ref', description: 'Exact Tool, Quote, Call or Turn reference; all status reads require the original agent principal.', required: true,
  schema: jsonSchemaOf(z.union([
    statusRefSchema.options[0].shape.ref, statusRefSchema.options[1].shape.ref,
    statusRefSchema.options[2].shape.ref, statusRefSchema.options[3].shape.ref,
  ])),
}

function journeyStatusOperations(): readonly NormalizedOperation[] {
  return [{
    operationId: 'journey.status', summary: 'Read a Tool, Quote, Call or Turn by exact reference',
    tags: ['Platform'], method: 'GET', path: '/api/v1/status/{ref}',
    security: { scope: MARKET_TOOLS_CALL_SCOPE }, pathParams: [statusRefParam], queryParams: [],
    description: 'Every status ref requires the buyer agent-key principal, including Tool refs. Anonymous callers use describe for public Tool details. This pure read never starts another purchase or burns a source-write nonce.',
    responses: [
      { status: 200, schema: jsonSchemaOf(journeyStatusResultSchema), mediaType: 'application/json', description: 'Principal-bound JourneyStatus snapshot.' },
      ...AUTH_ERRORS,
    ],
  }]
}
function chatTurnOperations(): readonly NormalizedOperation[] {
  const path = '/api/v1/chat/turns'
  const resource = `${path}/{turnRef}`
  const security = { scope: MARKET_TOOLS_CALL_SCOPE }
  return [
    {
      operationId: 'chat.turn.start', summary: 'Start or replay an authenticated chat turn',
      tags: ['Platform'], method: 'POST', path, security, pathParams: [], queryParams: [],
      description: 'Also accepts a current Clerk owner session. The same clientTurnId and material returns the existing Turn; changed material conflicts. The AI SDK UI message stream starts with data-ae-state (turnRef, thread context and sequence), followed by text and validated data-ae-quote, data-ae-receipt or data-ae-problem parts. Closing the connection does not cancel the Turn.',
      requestBodySchema: jsonSchemaOf(chatTurnBody),
      responses: [
        { status: 200, schema: jsonSchemaOf(z.string()), mediaType: 'text/event-stream', description: 'AI SDK UI message stream (x-vercel-ai-ui-message-stream: v1).' },
        ...AUTH_ERRORS,
      ],
    },
    {
      operationId: 'chat.turn.read', summary: 'Read authenticated chat turn status',
      tags: ['Platform'], method: 'GET', path: resource, security,
      pathParams: [turnRefParam], queryParams: [],
      description: 'Pure principal-bound status read: callRefs contains all linked Calls; inFlightCallRefs contains only unresolved Calls. Cancellation does not reverse released effects.',
      responses: [
        { status: 200, schema: jsonSchemaOf(turnSnapshot), mediaType: 'application/json', description: 'Current Turn snapshot.' },
        ...AUTH_ERRORS,
      ],
    },
    {
      operationId: 'chat.turn.cancel', summary: 'Request authenticated chat turn cancellation',
      tags: ['Platform'], method: 'DELETE', path: resource, security,
      pathParams: [turnRefParam], queryParams: [],
      description: 'Idempotent cancellation fence. In-flight effects are not rolled back; recover each Call by its original ref.',
      responses: [
        { status: 200, schema: jsonSchemaOf(z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('stopped'), turnRef: z.string(), inFlightEffects: z.array(z.strictObject({ callRef: z.string() })) }),
          z.strictObject({ kind: z.literal('in_flight'), turnRef: z.string(), inFlightEffects: z.array(z.strictObject({ callRef: z.string() })) }),
        ])), mediaType: 'application/json', description: 'Stopped or still in-flight effects.' },
        ...AUTH_ERRORS,
      ],
    },
  ]
}

export function agentApiOperations(): readonly NormalizedOperation[] {
  return [...actionOperations(), ...fundingOperations(), ...chatTurnOperations(), ...journeyStatusOperations()]
}
