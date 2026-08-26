"use node"

import { v } from 'convex/values'

import {
  executeKeylessOperation,
} from '@/modules/capability-execution/operation-execute.server'
import type {
  KeylessExecutableSourcePort,
} from '@/modules/capability-execution/operation-execute.actions'
import type {
  OperationExecutableDescriptor,
  OperationExecuteInput,
  OperationExecuteResult,
} from '@/modules/capability-execution/operation-execute.functions'
import {
  jsonObject,
  jsonValue,
} from '@/modules/capability-execution/convex'
import { deserializeOperationDetailResult } from '@/modules/capability-supply/public'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import { isRecord } from '@/modules/common/is-record'

import { api, internal } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'
import { interactiveAuthorityContextValue } from './interactiveAuthority'

type ExecutableDescriptorWire = Readonly<
  Omit<OperationExecutableDescriptor, 'inputSchema' | 'outputSchema'> & {
    inputSchemaJson: string
    outputSchemaJson?: string
  }
>

type ChatExecutionCtx = Pick<ActionCtx, 'runQuery'>
type KeylessExecutor = (
  input: OperationExecuteInput,
  source: KeylessExecutableSourcePort,
) => Promise<OperationExecuteResult>
type DescriptorAuthority = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
}>

const EXECUTABLE_DESCRIPTOR_OPERATION = 'capabilitySupplyOperations:readKeylessExecutable'
const EXECUTABLE_DESCRIPTOR_SCOPE = 'capability_supply:read_executable'

const operationExecuteResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    operationRef: v.string(),
    capabilityId: v.string(),
    name: v.string(),
    output: jsonValue,
    evidenceHash: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    operationRef: v.string(),
    reason: v.union(
      v.literal('operation_not_found'),
      v.literal('operation_not_keyless'),
      v.literal('operation_not_executable'),
      v.literal('input_invalid'),
      v.literal('endpoint_invalid'),
    ),
  }),
  v.object({
    kind: v.literal('error'),
    operationRef: v.string(),
    code: v.union(
      v.literal('fetch_failed'),
      v.literal('response_invalid'),
      v.literal('provider_error'),
      v.literal('source_unavailable'),
    ),
    retryable: v.boolean(),
    reason: v.string(),
  }),
)

function parseSchemaJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('keyless_operation_schema_invalid')
  return parsed
}

function decodeExecutableDescriptor(
  row: ExecutableDescriptorWire | null,
  requestedOperationRef: string,
): OperationExecutableDescriptor | null {
  if (row === null || row.operationRef !== requestedOperationRef) return null
  const { inputSchemaJson, outputSchemaJson, ...descriptor } = row
  const inputSchema = parseSchemaJson(inputSchemaJson)
  const outputSchema = outputSchemaJson === undefined
    ? undefined
    : parseSchemaJson(outputSchemaJson)
  return {
    ...descriptor,
    inputSchema,
    ...(outputSchema === undefined ? {} : { outputSchema }),
  }
}

async function descriptorServiceAuth(
  operationRef: string,
  serviceKey: string,
  authority: DescriptorAuthority,
): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: serviceKey,
    operation: EXECUTABLE_DESCRIPTOR_OPERATION,
    command: toStableHashValue({ operationRef }),
    principal: {
      ...authority,
      scopes: [EXECUTABLE_DESCRIPTOR_SCOPE],
    },
    issuedAt: Date.now(),
  })
}

/**
 * Crosses from the Agent's action context into the existing Node keyless
 * executor while keeping Convex as the descriptor source of truth.
 */
export async function runChatOperationExecute(
  ctx: ChatExecutionCtx,
  input: OperationExecuteInput,
  execute: KeylessExecutor = executeKeylessOperation,
  serviceKey?: string,
  authority?: DescriptorAuthority,
): Promise<OperationExecuteResult> {
  const serviceKeyValue = serviceKey?.trim()
  if (serviceKeyValue === undefined || serviceKeyValue.length < 32 || authority === undefined) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'source_unavailable',
      retryable: true,
      reason: 'The executable descriptor source is unavailable.',
    }
  }

  const source: KeylessExecutableSourcePort = {
    list: async () => [],
    search: async () => [],
    read: async (operationRef) => {
      const serviceAuth = await descriptorServiceAuth(operationRef, serviceKeyValue, authority)
      const row: ExecutableDescriptorWire | null = await ctx.runQuery(
        api.capabilitySupplyOperations.readKeylessExecutable,
        {
          operationRef,
          serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
        },
      )
      return decodeExecutableDescriptor(row, operationRef)
    },
    readPublic: async (operationRef) => {
      const result = await ctx.runQuery(
        api.capabilitySupplyOperations.detail,
        { operationRef },
      )
      const deserialized = deserializeOperationDetailResult(result)
      return deserialized.kind === 'found'
        ? deserialized.operation
        : null
    },
  }
  return execute(input, source)
}

export const execute = internalAction({
  args: {
    operationRef: v.string(),
    input: jsonObject,
    authority: interactiveAuthorityContextValue,
  },
  returns: operationExecuteResultValue,
  handler: async (ctx, args): Promise<OperationExecuteResult> => {
    const current = await ctx.runQuery(
      internal.interactiveAuthority.reconcileScheduledInteractiveAuthority,
      { authority: args.authority },
    )
    if (current === null) {
      return {
        kind: 'error',
        operationRef: args.operationRef,
        code: 'source_unavailable',
        retryable: false,
        reason: 'Current Principal and Account authority is unavailable.',
      }
    }
    return await runChatOperationExecute(
      ctx,
      args,
      executeKeylessOperation,
      env.AE_CONVEX_SERVER_FUNCTION_TOKEN,
      {
        principalId: current.principalRef,
        ownerId: current.accountRef,
        credentialId: current.provenance.credentialRef,
      },
    )
  },
})
