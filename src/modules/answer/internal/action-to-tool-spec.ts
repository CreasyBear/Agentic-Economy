import type { AnyAction } from '@/modules/common/action'
import { isRecord } from '@/modules/common/is-record'
import {
  actionToHarnessTool,
  findStrictToolSchemaViolation,
} from '@/modules/harness/public'

/**
 * OpenRouter (OpenAI-compatible) tool spec shape.
 *
 * `tools` is a list of `{ type: 'function', function: { name, description,
 * parameters: <JSON schema> } }`. The model emits `tool_calls` against these;
 * the server re-validates each call against the action's Zod schema before
 * running it, so this descriptor is the model-facing surface only.
 */
export type OpenRouterToolSpec = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, OpenRouterSchemaProperty>
      required: readonly string[]
    }
  }
}

type OpenRouterSchemaProperty = {
  type: 'string' | 'number' | 'boolean' | 'object'
  description: string
  enum?: readonly string[]
}

/**
 * Maps an AE action's flat `ActionParameter[]` descriptor into an OpenRouter
 * tool spec. OpenRouter only needs model-facing input parameters here; the
 * action carries Zod input and output schemas server-side, and the runner
 * validates both sides before treating a tool result as evidence.
 *
 * The JSON-schema converter in `@tanstack/ai` is used for agent-tool
 * descriptors, but this OpenRouter path deliberately preserves the existing
 * flat parameter surface. Constraints such as `max(200)` or `int` remain
 * enforced by the action schema at execution time.
 */
export function actionToOpenRouterTool(action: AnyAction): OpenRouterToolSpec {
  const tool = actionToHarnessTool(action)
  const violation = findStrictToolSchemaViolation(tool.inputJsonSchema)
  if (violation !== null) {
    throw new Error(`Action ${action.id} has a non-strict tool schema at ${violation.path}: ${violation.reason}`)
  }
  const parameters = openRouterParametersFromJsonSchema(tool.inputJsonSchema) ??
    openRouterParametersFromActionParameters(action)

  const description = [
    action.summary,
    'Boundaries:',
    ...action.boundaries.map((boundary) => `- ${boundary}`),
  ].join('\n')

  return {
    type: 'function',
    function: {
      name: action.id,
      description,
      parameters,
    },
  }
}

function openRouterParametersFromActionParameters(
  action: AnyAction,
): OpenRouterToolSpec['function']['parameters'] {
  const properties: Record<string, OpenRouterSchemaProperty> = {}
  const required: string[] = []

  for (const parameter of action.parameters) {
    properties[parameter.name] = {
      type: parameter.type === 'enum' ? 'string' : parameter.type,
      description: parameter.description,
      ...(parameter.enum === undefined ? {} : { enum: parameter.enum }),
    }
    if (parameter.required) {
      required.push(parameter.name)
    }
  }

  return {
    type: 'object',
    properties,
    required,
  }
}

function openRouterParametersFromJsonSchema(
  schema: unknown,
): OpenRouterToolSpec['function']['parameters'] | undefined {
  if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties)) {
    return undefined
  }

  const properties: Record<string, OpenRouterSchemaProperty> = {}
  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    if (!isRecord(propertySchema)) {
      return undefined
    }
    const type = openRouterType(propertySchema.type)
    if (type === undefined) {
      return undefined
    }
    const description = typeof propertySchema.description === 'string'
      ? propertySchema.description
      : name
    const enumValues = Array.isArray(propertySchema.enum)
      ? propertySchema.enum.filter((value): value is string => typeof value === 'string')
      : undefined

    properties[name] = {
      type,
      description,
      ...(enumValues === undefined || enumValues.length === 0 ? {} : { enum: enumValues }),
    }
  }

  return {
    type: 'object',
    properties,
    required: Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

function openRouterType(value: unknown): OpenRouterSchemaProperty['type'] | undefined {
  if (value === 'integer') {
    return 'number'
  }
  if (value === 'string' || value === 'number' || value === 'boolean') {
    return value
  }
  return undefined
}

