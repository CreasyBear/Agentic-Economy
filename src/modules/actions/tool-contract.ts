import type { JSONSchema } from '@tanstack/ai'
import type { z } from 'zod'

import {
  describeActionForAgent,
  type ActionContext,
  type ActionParameter,
  type ActionSurface,
  type AnyAction,
} from '@/modules/common/action'
import { schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'

import {
  findStrictToolSchemaViolation,
  type StrictSchemaViolation,
} from './strict-schema'

export type ActionToolSchemaDiagnostic = StrictSchemaViolation & {
  schema: 'input' | 'output'
}

export type ActionToolSchemaBundle<Input, Output> = {
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  descriptorHash: string
  providerViolations: readonly string[]
  providerDiagnostics: readonly ActionToolSchemaDiagnostic[]
}

export type ActionToolExecuteArgs<Input> = {
  input: Input
  context: ActionContext
}

export type ActionToolContract<Input = unknown, Output = unknown> = {
  id: string
  name: string
  summary: string
  boundaries: readonly string[]
  parameters: readonly ActionParameter[]
  readOnly: boolean
  surfaces: readonly ActionSurface[]
  schemas: ActionToolSchemaBundle<Input, Output>
  execute(args: ActionToolExecuteArgs<Input>): Promise<Output>
}

export type ActionToolFunctionDescriptor = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

export type ActionToolDescriptorProjection<Descriptor> = {
  descriptor: Descriptor
  descriptorHash: string
}

export type ActionToolExecutionValidationMetadata = {
  descriptorHash: string
  providerViolations: readonly string[]
  strictInputSchemaViolation?: string
  strictOutputSchemaViolation?: string
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
}

export function actionToToolContract(
  action: AnyAction,
): ActionToolContract<unknown, unknown> {
  const descriptor = describeActionForAgent(action)
  const schemas = buildActionToolSchemaBundle({
    id: descriptor.id,
    inputSchema: action.schema,
    outputSchema: action.outputSchema,
    inputJsonSchema: descriptor.inputJsonSchema,
    outputJsonSchema: descriptor.outputJsonSchema,
  })

  return {
    id: descriptor.id,
    name: descriptor.name,
    summary: descriptor.summary,
    boundaries: descriptor.boundaries,
    parameters: descriptor.parameters,
    readOnly: descriptor.readOnly,
    surfaces: action.surfaces,
    schemas,
    execute: async ({ input, context }) => await action.run({ data: input, context }),
  }
}

export function describeActionToolExecutionValidation(
  contract: Pick<ActionToolContract, 'schemas'>,
): ActionToolExecutionValidationMetadata {
  const strictInputSchemaViolation = contract.schemas.providerDiagnostics.find(
    (diagnostic) => diagnostic.schema === 'input',
  )
  const strictOutputSchemaViolation = contract.schemas.providerDiagnostics.find(
    (diagnostic) => diagnostic.schema === 'output',
  )

  return {
    descriptorHash: contract.schemas.descriptorHash,
    providerViolations: contract.schemas.providerViolations,
    ...(strictInputSchemaViolation === undefined ? {} : { strictInputSchemaViolation: strictInputSchemaViolation.reason }),
    ...(strictOutputSchemaViolation === undefined ? {} : { strictOutputSchemaViolation: strictOutputSchemaViolation.reason }),
    ...(contract.schemas.inputJsonSchema === undefined ? {} : { inputJsonSchema: contract.schemas.inputJsonSchema }),
    ...(contract.schemas.outputJsonSchema === undefined ? {} : { outputJsonSchema: contract.schemas.outputJsonSchema }),
  }
}

export function describeActionToolForModel(
  contract: ActionToolContract,
): ActionToolDescriptorProjection<ActionToolFunctionDescriptor> {
  const inputJsonSchema = contract.schemas.inputJsonSchema
  if (inputJsonSchema === undefined) {
    throw new Error(`Action ${contract.id} has no representable strict input schema`)
  }

  return {
    descriptor: {
      type: 'function',
      function: {
        name: contract.id,
        description: [
          contract.summary,
          'Boundaries:',
          ...contract.boundaries.map((boundary) => `- ${boundary}`),
        ].join('\n'),
        parameters: inputJsonSchema,
      },
    },
    descriptorHash: contract.schemas.descriptorHash,
  }
}

function buildActionToolSchemaBundle<Input, Output>(input: {
  id: string
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  inputJsonSchema: JSONSchema | undefined
  outputJsonSchema: JSONSchema | undefined
}): ActionToolSchemaBundle<Input, Output> {
  const providerDiagnostics = [
    ...strictViolationDiagnostics('input', input.inputJsonSchema),
    ...strictViolationDiagnostics('output', input.outputJsonSchema),
  ]
  const descriptorHash = schemaDescriptorDigest({
    toolId: input.id,
    inputJsonSchema: stableJsonValue(input.inputJsonSchema),
    outputJsonSchema: stableJsonValue(input.outputJsonSchema),
  }).toString()

  return {
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    ...(input.inputJsonSchema === undefined ? {} : { inputJsonSchema: input.inputJsonSchema }),
    ...(input.outputJsonSchema === undefined ? {} : { outputJsonSchema: input.outputJsonSchema }),
    descriptorHash,
    providerViolations: providerDiagnostics.map(formatProviderDiagnostic),
    providerDiagnostics,
  }
}

function strictViolationDiagnostics(
  schema: ActionToolSchemaDiagnostic['schema'],
  jsonSchema: JSONSchema | undefined,
): readonly ActionToolSchemaDiagnostic[] {
  const violation = findStrictToolSchemaViolation(jsonSchema)
  if (violation === null) {
    return []
  }
  return [{ schema, path: violation.path, reason: violation.reason }]
}

function formatProviderDiagnostic(diagnostic: ActionToolSchemaDiagnostic): string {
  return `${diagnostic.schema} schema at ${diagnostic.path}: ${diagnostic.reason}`
}

function stableJsonValue(value: unknown): StableHashValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(stableJsonValue)
  }

  if (isRecord(value)) {
    const record: Record<string, StableHashValue> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        record[key] = stableJsonValue(child)
      }
    }
    return record
  }

  return null
}
