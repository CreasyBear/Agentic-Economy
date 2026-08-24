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
import { deserializeOperationDetailResult } from '@/modules/capability-supply/public'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import { isRecord } from '@/modules/common/is-record'

import { api } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'

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

const EXECUTABLE_DESCRIPTOR_OPERATION = 'capabilitySupplyOperations:readKeylessExecutable'
const EXECUTABLE_DESCRIPTOR_SCOPE = 'capability_supply:read_executable'

function parseSchemaJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('keyless_operation_schema_invalid')
  return parsed
}

function decodeExecutableDescriptor(
  row: ExecutableDescriptorWire | null,
): OperationExecutableDescriptor | null {
  if (row === null) return null
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
  serviceKey: string | undefined,
): Promise<CustomerRequestServiceAssertion | undefined> {
  const key = serviceKey?.trim()
  if (key === undefined || key.length < 32) return undefined
  return await createCustomerRequestServiceAssertion({
    key,
    operation: EXECUTABLE_DESCRIPTOR_OPERATION,
    command: toStableHashValue({ operationRef }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
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
): Promise<OperationExecuteResult> {
  const source: KeylessExecutableSourcePort = {
    list: async () => [],
    search: async () => [],
    read: async (operationRef) => {
      const serviceAuth = await descriptorServiceAuth(operationRef, serviceKey)
      const row: ExecutableDescriptorWire | null = await ctx.runQuery(
        api.capabilitySupplyOperations.readKeylessExecutable,
        {
          operationRef,
          ...(serviceAuth === undefined
            ? {}
            : { serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] } }),
        },
      )
      return decodeExecutableDescriptor(row)
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
    input: v.record(v.string(), v.any()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<OperationExecuteResult> =>
    runChatOperationExecute(
      ctx,
      args,
      executeKeylessOperation,
      env.AE_CONVEX_SERVER_FUNCTION_TOKEN,
    ),
})
