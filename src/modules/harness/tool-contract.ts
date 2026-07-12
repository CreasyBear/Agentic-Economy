import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import type { z } from 'zod'

import type {
  ActionContext,
  ActionParameter,
  ActionSurface,
  AnyAction,
} from '@/modules/common/action'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'

import type {
  HarnessApprovalPolicy,
  HarnessToolConcurrency,
  HarnessToolDefinition,
  HarnessToolLoadMode,
  HarnessToolTier,
} from './harness.schema'
import {
  findStrictToolSchemaViolation,
  type StrictSchemaViolation,
} from './strict-schema'

export const AnswerModelToolIds = [
  'registry.search',
  'registry.detail',
] as const

export type HarnessApprovalMode =
  | 'public-read'
  | 'public-qualified-write'
  | 'owner-ui'
  | 'admin-explicit'
  | 'internal-break-glass'

export type HarnessApprovalDeclaration = {
  mode: HarnessApprovalMode
  policy: HarnessApprovalPolicy
  reason: string
}

export type HarnessToolExposure = {
  surfaces: readonly ActionSurface[]
  answerModel: boolean
  publicProjection: 'none' | 'sanitized-counts' | 'receipt-status'
}

export type HarnessToolPolicy = {
  tier: HarnessToolTier
  approval: HarnessApprovalDeclaration
  concurrency?: HarnessToolConcurrency
  interruptible?: boolean
  loadMode?: HarnessToolLoadMode
  hidden?: boolean
  timeoutMs?: number
}

export type HarnessToolSchemaDiagnostic = StrictSchemaViolation & {
  schema: 'input' | 'output'
}

export type HarnessToolSchemaBundle<Input, Output> = {
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  descriptorHash: string
  providerViolations: readonly string[]
  providerDiagnostics: readonly HarnessToolSchemaDiagnostic[]
}

export type HarnessExecuteArgs<Input> = {
  input: Input
  context: ActionContext
  signal?: AbortSignal
}

export type HarnessToolProjection<Output> = {
  publicProjection: HarnessToolExposure['publicProjection']
  summarizeOutput(output: Output): unknown
}

export type HarnessToolContract<Input = unknown, Output = unknown> = {
  id: string
  name: string
  summary: string
  boundaries: readonly string[]
  parameters: readonly ActionParameter[]
  exposure: HarnessToolExposure
  policy: HarnessToolPolicy
  schemas: HarnessToolSchemaBundle<Input, Output>
  execute(args: HarnessExecuteArgs<Input>): Promise<Output>
  projection: HarnessToolProjection<Output>
}

export type HarnessAnswerModelToolDescriptor = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

export type HarnessDescriptorProjection<Descriptor> = {
  descriptor: Descriptor
  descriptorHash: string
}

export type HarnessToolExecutionValidationMetadata = {
  descriptorHash: string
  providerViolations: readonly string[]
  strictInputSchemaViolation?: string
  strictOutputSchemaViolation?: string
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
}

export type HarnessToolEvalFixture = {
  schemaVersion: 1
  toolId: string
  descriptorHash: string
  exposure: Pick<HarnessToolExposure, 'answerModel' | 'publicProjection'>
  policy: Pick<HarnessToolPolicy, 'tier' | 'approval'>
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  providerViolations: readonly string[]
}

export function actionToHarnessToolContract(action: AnyAction): HarnessToolContract<unknown, unknown> {
  const schemas = buildHarnessToolSchemaBundle({
    id: action.id,
    inputSchema: action.schema,
    outputSchema: action.outputSchema,
  })
  const exposure = exposureForAction(action)
  const policy = policyForAction(action, exposure)

  return {
    id: action.id,
    name: action.name,
    summary: action.summary,
    boundaries: action.boundaries,
    parameters: action.parameters,
    exposure,
    policy,
    schemas,
    execute: async ({ input, context }) => action.run({ data: input, context }),
    projection: {
      publicProjection: exposure.publicProjection,
      summarizeOutput: summarizeActionOutput,
    },
  }
}

export function buildHarnessToolSchemaBundle<Input, Output>(input: {
  id: string
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
}): HarnessToolSchemaBundle<Input, Output> {
  const inputJsonSchema = convertSchemaToJsonSchema(input.inputSchema)
  const outputJsonSchema = convertSchemaToJsonSchema(input.outputSchema)
  const providerDiagnostics = [
    ...strictViolationDiagnostics('input', inputJsonSchema),
    ...strictViolationDiagnostics('output', outputJsonSchema),
  ]
  const descriptorHash = stableHash({
    toolId: input.id,
    inputJsonSchema: stableJsonValue(inputJsonSchema),
    outputJsonSchema: stableJsonValue(outputJsonSchema),
  }).toString()

  return {
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
    ...(outputJsonSchema === undefined ? {} : { outputJsonSchema }),
    descriptorHash,
    providerViolations: providerDiagnostics.map(formatProviderDiagnostic),
    providerDiagnostics,
  }
}

export function harnessToolContractToDefinition<Input, Output>(
  contract: HarnessToolContract<Input, Output>,
): HarnessToolDefinition<Input, Output> {
  return {
    id: contract.id,
    name: contract.name,
    summary: contract.summary,
    boundaries: contract.boundaries,
    tier: contract.policy.tier,
    surfaces: contract.exposure.surfaces,
    inputSchema: contract.schemas.inputSchema,
    outputSchema: contract.schemas.outputSchema,
    ...(contract.schemas.inputJsonSchema === undefined ? {} : { inputJsonSchema: contract.schemas.inputJsonSchema }),
    ...(contract.schemas.outputJsonSchema === undefined ? {} : { outputJsonSchema: contract.schemas.outputJsonSchema }),
    approval: contract.policy.approval.policy,
    ...(contract.policy.hidden === undefined ? {} : { hidden: contract.policy.hidden }),
    ...(contract.policy.loadMode === undefined ? {} : { loadMode: contract.policy.loadMode }),
    ...(contract.policy.concurrency === undefined ? {} : { concurrency: contract.policy.concurrency }),
    ...(contract.policy.interruptible === undefined ? {} : { interruptible: contract.policy.interruptible }),
    run: contract.execute,
    summarizeOutput: contract.projection.summarizeOutput,
  }
}

export function describeHarnessToolExecutionValidation(
  contract: HarnessToolContract,
): HarnessToolExecutionValidationMetadata {
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

export function describeHarnessToolForAnswerModel(
  contract: HarnessToolContract,
): HarnessDescriptorProjection<HarnessAnswerModelToolDescriptor> {
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
        parameters: contract.schemas.inputJsonSchema ?? {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    descriptorHash: contract.schemas.descriptorHash,
  }
}

export function buildHarnessToolEvalFixture(
  contract: HarnessToolContract,
): HarnessToolEvalFixture {
  return {
    schemaVersion: 1,
    toolId: contract.id,
    descriptorHash: contract.schemas.descriptorHash,
    exposure: {
      answerModel: contract.exposure.answerModel,
      publicProjection: contract.exposure.publicProjection,
    },
    policy: {
      tier: contract.policy.tier,
      approval: contract.policy.approval,
    },
    ...(contract.schemas.inputJsonSchema === undefined ? {} : { inputJsonSchema: contract.schemas.inputJsonSchema }),
    ...(contract.schemas.outputJsonSchema === undefined ? {} : { outputJsonSchema: contract.schemas.outputJsonSchema }),
    providerViolations: contract.schemas.providerViolations,
  }
}

export function buildHarnessToolContracts(
  actions: readonly AnyAction[],
): readonly HarnessToolContract[] {
  return actions.map(actionToHarnessToolContract)
}

export function filterAnswerModelToolContracts(
  contracts: readonly HarnessToolContract[],
): readonly HarnessToolContract[] {
  return sortContractsById(
    contracts.filter((contract) => contract.exposure.answerModel && contract.policy.tier === 'read'),
    AnswerModelToolIds,
  )
}

function exposureForAction(action: AnyAction): HarnessToolExposure {
  const answerModel = action.readOnly && isAnswerModelToolId(action.id)
  const publicProjection = action.readOnly
    ? 'sanitized-counts'
    : action.id === 'inquiry.submit'
      ? 'receipt-status'
      : 'none'

  return {
    surfaces: action.surfaces,
    answerModel,
    publicProjection,
  }
}

function policyForAction(action: AnyAction, exposure: HarnessToolExposure): HarnessToolPolicy {
  const tier: HarnessToolTier = action.readOnly ? 'read' : 'write'

  if (action.id === 'inquiry.submit') {
    return {
      tier,
      approval: {
        mode: 'public-qualified-write',
        policy: 'prompt',
        reason: 'write_requires_source_admission',
      },
      concurrency: 'exclusive',
      interruptible: false,
      loadMode: 'essential',
    }
  }

  return {
    tier,
    approval: {
      mode: 'owner-ui',
      policy: tier === 'read' ? 'allow' : 'prompt',
      reason: tier === 'read' ? 'owner_read_requires_auth' : 'owner_write_requires_auth',
    },
    concurrency: tier === 'read' ? 'shared' : 'exclusive',
    interruptible: tier === 'read',
    loadMode: 'discoverable',
    hidden: true,
  }
}

function isAnswerModelToolId(id: string): boolean {
  return (AnswerModelToolIds as readonly string[]).includes(id)
}

function sortContractsById(
  contracts: readonly HarnessToolContract[],
  ids: readonly string[],
): readonly HarnessToolContract[] {
  const order = new Map(ids.map((id, index) => [id, index]))
  return [...contracts].sort((left, right) => {
    const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex || left.id.localeCompare(right.id)
  })
}

function strictViolationDiagnostics(
  schema: HarnessToolSchemaDiagnostic['schema'],
  jsonSchema: JSONSchema | undefined,
): readonly HarnessToolSchemaDiagnostic[] {
  const violation = findStrictToolSchemaViolation(jsonSchema)
  if (violation === null) {
    return []
  }
  return [{ schema, path: violation.path, reason: violation.reason }]
}

function formatProviderDiagnostic(diagnostic: HarnessToolSchemaDiagnostic): string {
  return `${diagnostic.schema} schema at ${diagnostic.path}: ${diagnostic.reason}`
}

function summarizeActionOutput(output: unknown): unknown {
  if (isRecord(output) && typeof output.kind === 'string') {
    return { kind: output.kind }
  }
  return { kind: 'ok' }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
