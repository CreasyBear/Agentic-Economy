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
 * A model-facing worked example appended into a tool's OpenRouter `description`.
 *
 * OpenRouter (non-Anthropic) does not surface AI-SDK `inputExamples` natively,
 * so each example is inlined into the description text: the naïve wording a
 * user is likely to type (WRONG/catalog reflex) paired with the correct tool
 * call (RIGHT/execute) and how to answer from the returned JSON. When present,
 * this sharpens when-to-fire guidance far more than a bare auto description.
 */
export type ToolInputExample = {
  /** Short cue for when this tool applies (e.g. 'live crypto price'). */
  when: string
  /** The user's natural-language question this tool answers. */
  userSay: string
  /** The correct tool call to make (the execute/RIGHT form). */
  call: string
  /** What the executed JSON returns and how the answer should be grounded in it. */
  answer: string
}

/**
 * Appends worked `examples` to a tool description, or returns the description
 * unchanged when there are none (back-compat: tools without examples render as
 * before). Examples are newline-separated and prefixed so the model reads them
 * as when-to-fire + execute + ground-the-answer guidance.
 */
export function appendToolExamplesToDescription(
  description: string,
  examples: readonly ToolInputExample[],
): string {
  if (examples.length === 0) {
    return description
  }
  const block = examples
    .map(
      (example, index) =>
        `EXAMPLE ${index + 1} — When: ${example.when}\n` +
        `  User says: "${example.userSay}"\n` +
        `  Call with: ${example.call}\n` +
        `  Then answer from the returned JSON: ${example.answer}`,
    )
    .join('\n\n')
  return `${description}\n\nWHEN TO CALL THIS TOOL:\n${block}`
}

/**
 * Maps an AE action's flat `ActionParameter[]` descriptor into an OpenRouter
 * tool spec, optionally appending worked `inputExamples` into the description
 * (see {@link appendToolExamplesToDescription}). When `examples` is omitted or
 * empty the tool renders exactly as before.
 */
export function actionToOpenRouterTool(
  action: AnyAction,
  examples?: readonly ToolInputExample[],
): OpenRouterToolSpec {
  const tool = actionToHarnessTool(action)
  const violation = findStrictToolSchemaViolation(tool.inputJsonSchema)
  if (violation !== null) {
    throw new Error(`Action ${action.id} has a non-strict tool schema at ${violation.path}: ${violation.reason}`)
  }
  const parameters = openRouterParametersFromJsonSchema(tool.inputJsonSchema) ??
    openRouterParametersFromActionParameters(action)

  const description = appendToolExamplesToDescription(
    [
      action.summary,
      'Boundaries:',
      ...action.boundaries.map((boundary) => `- ${boundary}`),
    ].join('\n'),
    examples ?? [],
  )

  return {
    type: 'function',
    function: {
      name: openRouterToolName(action.id),
      description,
      parameters,
    },
  }
}

export function openRouterToolName(actionId: string): string {
  const name = actionId.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name)) {
    throw new Error(`Action ${actionId} cannot be represented as an OpenRouter tool name`)
  }
  return name
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

